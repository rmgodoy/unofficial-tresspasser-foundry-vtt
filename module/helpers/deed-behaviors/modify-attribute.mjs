import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";

/**
 * ModifyAttributeBehavior — Executes modifications to actor attributes or paths.
 * Supports standard attributes via predefined list or arbitrary dynamic paths (path.to.attribute).
 * Automatically warns if the target attribute path is not found on a target actor.
 */
export class ModifyAttributeBehavior {

  /**
   * Executes the modifyAttribute graph behavior node.
   * @param {object} behavior - Behavior node data { id, type, params }
   * @param {object} context  - Executor runtime context
   * @param {Actor} [actor]   - Source actor (caster)
   * @param {Item} item       - Deed or Action item
   * @param {string} [phaseKey="base"] - Current execution phase
   * @returns {Promise<boolean>}
   */
  static async execute(behavior, context, actor, item, phaseKey = "base") {
    const params = behavior.params || {};
    const attributePath = params.attributePath || "system.attributes.mighty";
    const customPath = params.customPath || "";
    const operation = params.operation || "add"; // "add" | "subtract" | "set"
    const targetScope = params.targetScope || "targets"; // "targets" | "self" | "source"
    const expression = params.expression || "1";
    const rollBehaviorId = params.rollBehaviorId || "";
    const clampMin = params.clampMin !== false;
    const minValue = Number(params.minValue ?? 0);
    const clampMax = Boolean(params.clampMax);
    const maxValue = params.maxValue !== undefined && params.maxValue !== "" ? Number(params.maxValue) : null;

    // 1. Resolve Target Tokens / Actors
    let validTargets = [];
    if (targetScope === "self" || targetScope === "source") {
      const sourceToken = context.sourceToken || DeedBehaviorUtils.findToken(actor);
      validTargets = sourceToken ? [sourceToken] : (actor ? [actor] : []);
    } else {
      validTargets = DeedBehaviorUtils.getValidTargets(context, phaseKey);
    }

    if (!validTargets || validTargets.length === 0) return true;

    // 2. Resolve Path String
    const rawPath = (attributePath === "custom" ? customPath : attributePath)?.trim();
    if (!rawPath) {
      ui.notifications?.warn(
        game.i18n.localize("TRESPASSER.Notification.AttributePathEmpty") || "Attribute path cannot be empty."
      );
      return true;
    }

    // 3. Evaluate Roll / Expression / Reference
    const refRoll = rollBehaviorId ? context.evaluatedRolls?.get(rollBehaviorId) : null;
    const { roll: baseRoll, total: evalTotal, rollLabel } = await DeedBehaviorUtils.evaluateRollExpression({
      expression,
      refRoll,
      actor,
      rollData: { target: actor }
    });

    if (baseRoll) {
      if (!context.evaluatedRolls) context.evaluatedRolls = new Map();
      context.evaluatedRolls.set(behavior.id, baseRoll);
    }

    if (!context.currentPhaseOutputs) {
      context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    if (baseRoll && !refRoll && expression) {
      context.currentPhaseOutputs.rolls.push(baseRoll);
    }

    // 4. Apply Attribute Updates to Targets
    const targetLines = [];
    const changeAmount = evalTotal ?? 0;

    for (const targetToken of validTargets) {
      const targetActor = targetToken?.actor ?? (targetToken instanceof Actor ? targetToken : null);
      if (!targetActor) continue;

      const tokenName = DeedBehaviorUtils.getTokenDisplayName(targetToken);

      // Resolve Property dynamically on Target Actor
      let resolvedPath = rawPath;
      let curVal = foundry.utils.getProperty(targetActor, resolvedPath);

      // If not found, attempt prefixing system. if user typed shorthand (e.g. "attributes.mighty")
      if (curVal === undefined && !resolvedPath.startsWith("system.")) {
        const altPath = `system.${resolvedPath}`;
        if (foundry.utils.getProperty(targetActor, altPath) !== undefined) {
          resolvedPath = altPath;
          curVal = foundry.utils.getProperty(targetActor, resolvedPath);
        }
      }

      // If attribute is still undefined, notify user and log warning
      if (curVal === undefined) {
        const warnMsg = game.i18n.format("TRESPASSER.Notification.AttributeNotFound", {
          name: tokenName,
          path: rawPath
        }) || `Attribute "${rawPath}" not found on target ${tokenName}.`;

        ui.notifications?.warn(warnMsg);

        if (context.currentPhaseOutputs?.notes) {
          context.currentPhaseOutputs.notes.push(warnMsg);
        }
        continue;
      }

      // Compute new value
      const currentNum = Number(curVal);
      const isNumeric = !isNaN(currentNum) && typeof curVal !== "boolean";
      let newVal;

      if (isNumeric) {
        if (operation === "add") newVal = currentNum + changeAmount;
        else if (operation === "subtract") newVal = currentNum - changeAmount;
        else if (operation === "set") newVal = changeAmount;
        else newVal = changeAmount;

        if (clampMin) newVal = Math.max(minValue, newVal);
        if (clampMax && maxValue !== null && !isNaN(maxValue)) newVal = Math.min(maxValue, newVal);
      } else if (typeof curVal === "boolean") {
        newVal = Boolean(changeAmount);
      } else {
        newVal = String(changeAmount);
      }

      // Apply update directly if owner, or via GM socket if unowned
      const updateData = { [resolvedPath]: newVal };
      if (targetActor.isOwner) {
        await targetActor.update(updateData);
      } else {
        const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
        await emitDeedActionAndWait("modifyAttribute", {
          actorId: targetActor.id,
          tokenId: targetToken.id || targetToken.document?.id,
          updates: updateData
        });
      }

      // Format Chat Summary Entry
      const attrShort = resolvedPath.replace(/^system\./, "");
      const opSymbol = operation === "subtract" ? "-" : (operation === "set" ? "=" : "+");
      const changeDisplay = isNumeric ? `${opSymbol}${changeAmount}` : `${newVal}`;
      const diffDisplay = isNumeric ? `${curVal} → ${newVal}` : `${newVal}`;

      targetLines.push(`
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--fs-12); margin-top:4px; padding-top:3px; border-top:1px dotted var(--trp-border-light, #5c4f3a);">
          <span><strong>${tokenName}</strong> <span style="font-size:var(--fs-11); color:var(--trp-text-dim, #a09070);">(${attrShort})</span></span>
          <span style="color:var(--trp-gold-bright, #e8c96b); font-weight:bold;">${changeDisplay} <span style="font-size:var(--fs-10); color:var(--trp-text-dim, #a09070);">(${diffDisplay})</span></span>
        </div>
      `);
    }

    // 5. Build and attach Chat Entry
    if (targetLines.length > 0 || baseRoll) {
      const title = game.i18n.localize("TRESPASSER.Chat.ModifyAttribute.Title") || "Modify Attribute";
      const opLabelKey = operation === "subtract" ? "AttrOpSubtract" : (operation === "set" ? "AttrOpSet" : "AttrOpAdd");
      const opLabel = game.i18n.localize(`TRESPASSER.Sheet.Deed.Params.${opLabelKey}`) || operation;
      const rollHtml = baseRoll ? await baseRoll.render() : "";

      const entryHtml = `
        <div class="modify-attribute-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: var(--fs-12); font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
            <i class="fas fa-sliders"></i> ${title}: ${rawPath.replace(/^system\./, "")} (${opLabel})
          </h4>
          ${rollHtml}
          <div class="target-modify-attribute-results" style="margin-top: 6px;">
            ${targetLines.join("")}
          </div>
        </div>
      `;

      context.currentPhaseOutputs.rollEntries.push(entryHtml);

      if (context.executor?.chat) {
        await context.executor.chat.postOrUpdatePhaseCard(phaseKey);
      } else if (context.executor) {
        await context.executor._postPhaseCard(phaseKey);
      }
    }

    return true;
  }
}
