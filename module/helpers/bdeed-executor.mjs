import { BDeedBehaviorHandler } from "./bdeed-behavior-handler.mjs";
import { TrespasserEffectsHelper } from "./effects-helper.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";
import { askSparkDialog } from "../dialogs/spark-dialog.mjs";
import { requestPlayerDefenseRoll } from "./defense-roll-helper.mjs";
import { TrespasserCombat } from "../documents/combat.mjs";
import { askAPDialog } from "../dialogs/ap-dialog.mjs";

/**
 * BDeedExecutor — Runtime pipeline executor for Behavior-Driven Deeds (BDeed) in Trespasser TTRPG.
 *
 * Handles sequential execution across 7 phases:
 *   Start → Before → Base → [Hit] → [Spark] → After → End
 */
export class BDeedExecutor {
  /**
   * @param {Item} bdeedItem - The BDeed Item document.
   * @param {Actor} [actor]  - The owning Actor document.
   * @param {object} [options] - Additional options (e.g. apSpent from HUD)
   */
  constructor(bdeedItem, actor, options = {}) {
    this.item = bdeedItem;
    this.actor = actor || bdeedItem.actor || canvas.tokens?.controlled[0]?.actor || game.user.character || null;
    this.system = bdeedItem.system;
    this.options = options || {};

    /**
     * Shared runtime context passed across all phases.
     */
    this.context = {
      callStack: this.options.callStack || new Set(),
      sourcePosition: this.options.sourcePosition || null,
      targets: [],
      area: null,
      areas: new Map(),
      spawnedTerrains: [],
      activePhases: [],
      modifications: [],
      rollResult: null,
      isHit: false,
      isSpark: false,
      maxSparks: 0,
      sparkChoices: null,
      accuracyResults: [],
      accuracyResolved: false,
      currentPhaseOutputs: null,
      apSpent: 1,
      apBonus: 0
    };
  }

  /**
   * Validate Focus and AP resources without mutating documents or deducting flags.
   * Prompts for AP usage if necessary.
   * @protected
   */
  async _validateResources() {
    if (this.options.isSubDeed) return true;
    if (!this.actor) return true;

    const combatant = TrespasserCombat.getPhaseCombatant(this.actor);
    const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
    let apSpent = 1;
    let apBonus = 0;

    if (combatant) {
      const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
      if (restrictAPF && availableAP < 1) {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Combat.NotEnoughAP"));
        return false;
      }

      if (this.options.apSpent !== undefined && this.options.apSpent !== null) {
        apSpent = Math.max(1, parseInt(this.options.apSpent) || 1);
      } else if (availableAP > 1) {
        apSpent = await askAPDialog(availableAP);
        if (apSpent === null || apSpent === undefined) return false; // User cancelled AP dialog
      }

      apBonus = (apSpent - 1) * 2;
    }

    const usedActions = new Set(combatant?.getFlag("trespasser", "usedHUDActions") ?? []);
    const surcharge = usedActions.has("maneuver") ? 2 : 0;

    const tier = (this.system.tier || "light").toLowerCase();
    let baseCost = this.system.focusCost;
    if (baseCost === null || baseCost === undefined) {
      if (tier === "heavy") baseCost = 2;
      else if (tier === "mighty") baseCost = 4;
      else baseCost = 0;
    }

    let costIncrease = this.system.focusIncrease;
    if (costIncrease === null || costIncrease === undefined) {
      costIncrease = (tier === "heavy" || tier === "mighty") ? 1 : 0;
    }

    const currentBonusCost = this.system.bonusCost || 0;
    const currentUses = this.system.uses || 0;
    const totalFocusCost = baseCost + currentBonusCost + surcharge;

    if (totalFocusCost > 0) {
      const currentFocus = this.actor.system.combat?.focus ?? 0;
      if (restrictAPF && currentFocus < totalFocusCost) {
        ui.notifications.error(game.i18n.format("TRESPASSER.Notification.Combat.NotEnoughFocus", {
          name: this.item.name,
          cost: totalFocusCost,
          current: currentFocus
        }));
        return false;
      }
    }

    this.context.apSpent = apSpent;
    this.context.apBonus = apBonus;
    this.context.totalFocusCost = totalFocusCost;
    this.context.costIncrease = costIncrease;
    this.context.currentBonusCost = currentBonusCost;
    this.context.currentUses = currentUses;

    return true;
  }

  /**
   * Commit AP, Focus, and Item Uses deductions to database after successful pipeline execution.
   * @protected
   */
  async _commitResourceUsage() {
    if (this.options.isSubDeed) return;
    if (!this.actor) return;

    const combatant = TrespasserCombat.getPhaseCombatant(this.actor);

    // 1. Deduct AP from combatant flags
    if (combatant && this.context.apSpent > 0) {
      const availableAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
      await combatant.setFlag("trespasser", "actionPoints", Math.max(0, availableAP - this.context.apSpent));
    }

    // 2. Deduct Focus from actor combat state
    if (this.context.totalFocusCost > 0) {
      const currentFocus = this.actor.system.combat?.focus ?? 0;
      const newFocus = Math.max(0, currentFocus - this.context.totalFocusCost);
      await this.actor.update({ "system.combat.focus": newFocus });
    }

    // 3. Increment uses and update bonusCost on item document
    if (this.context.costIncrease > 0) {
      const newUses = (this.context.currentUses || 0) + 1;
      const newBonusCost = (this.context.currentBonusCost || 0) + this.context.costIncrease;
      await this.item.update({
        "system.uses": newUses,
        "system.bonusCost": newBonusCost
      });
    }
  }

  /**
   * Execute the full BDeed pipeline sequentially.
   */
  async execute() {
    // Step 0: Validate AP and Focus upfront before pipeline starts (no mutations yet)
    const valid = await this._validateResources();
    if (valid === false) return;

    // Deep clone phase data so mutations don't alter the database document
    this.phases = foundry.utils.deepClone(this.system.phases ?? {});

    // Step 1: Scan and collect all "modifyBehavior" instances across all phases
    this._collectModifications();

    // Step 2: Resolve modifications against target behaviors in memory
    this._applyModifications();

    // Step 3: Sequential phase processing
    let cancelled = false;
    const phaseOrder = ["start", "before", "base", "hit", "spark", "after", "end"];
    for (const phaseKey of phaseOrder) {
      if (phaseKey === "hit") {
        const needsAccuracy = this._hasContent("hit") || this._hasContent("spark");
        if (needsAccuracy && !this.context.accuracyResolved) {
          this.context.accuracyResolved = true;
          const accRes = await this._resolveAccuracyCheck();
          if (accRes === false) {
            cancelled = true;
            break;
          }
        }
      }

      if (this._shouldSkipPhase(phaseKey)) continue;
      this.context.activePhases.push(phaseKey);
      const res = await this._executePhase(phaseKey);
      if (res === false) {
        cancelled = true;
        break; // User cancelled execution or target selection
      }
    }

    // If execution was cancelled (e.g. template target selection or roll dialog cancelled), do NOT commit resources!
    if (!cancelled) {
      await this._commitResourceUsage();
    }

    // Step 4: Clear targets and area highlights after pipeline execution so next execution starts fresh
    this.context.targets = [];
    if (game.user?.targets?.size > 0) {
      await game.user.updateTokenTargets([]);
    }
    BDeedBehaviorHandler.clearAreaHighlight(this.context);
  }

  /**
   * Collect all "modifyBehavior" behaviors from all phases into context.modifications
   * and remove them from their parent phase's behavior list.
   * @protected
   */
  _collectModifications() {
    const phaseOrder = ["start", "before", "base", "hit", "spark", "after", "end"];
    for (const phaseKey of phaseOrder) {
      const phase = this.phases[phaseKey];
      if (!phase || !phase.behaviors) continue;

      const remainingBehaviors = [];
      for (const behavior of phase.behaviors) {
        if (behavior.type === "modifyBehavior") {
          this.context.modifications.push({
            sourcePhase: phaseKey,
            id: behavior.id,
            params: behavior.params ?? {}
          });
        } else {
          remainingBehaviors.push(behavior);
        }
      }
      phase.behaviors = remainingBehaviors;
    }
  }

  /**
   * Apply collected modifications to target behaviors across phases in memory.
   * @protected
   */
  _applyModifications() {
    for (const mod of this.context.modifications) {
      const { targetPhase, targetBehaviorId, property, modifier } = mod.params;
      if (!targetBehaviorId || !modifier) continue;

      // Find target behavior
      const targetBehavior = this._findBehavior(targetBehaviorId, targetPhase);
      if (!targetBehavior) continue;

      targetBehavior.params = targetBehavior.params || {};

      switch (property) {
        case "damage": {
          const currentExpr = targetBehavior.params.expression ?? "";
          targetBehavior.params.expression = currentExpr
            ? `${currentExpr} + ${modifier}`
            : modifier;
          break;
        }
        case "intensity": {
          if (Array.isArray(targetBehavior.params.effects)) {
            const num = parseFloat(modifier) || 0;
            for (const eff of targetBehavior.params.effects) {
              eff.intensity = (eff.intensity || 1) + num;
            }
          } else {
            const currentInt = parseFloat(targetBehavior.params.intensity) || 1;
            const num = parseFloat(modifier) || 0;
            targetBehavior.params.intensity = currentInt + num;
          }
          break;
        }
        case "size": {
          const currentSize = parseFloat(targetBehavior.params.aoeSize) || 1;
          const num = parseFloat(modifier) || 0;
          targetBehavior.params.aoeSize = Math.max(1, currentSize + num);
          break;
        }
        case "distance": {
          const currentDist = parseFloat(targetBehavior.params.distance) || 1;
          const num = parseFloat(modifier) || 0;
          targetBehavior.params.distance = Math.max(0, currentDist + num);
          break;
        }
      }
    }
  }

  /**
   * Search for a behavior by ID across all phases or within a specific target phase.
   * @param {string} behaviorId
   * @param {string} [targetPhaseKey]
   * @returns {object|null}
   * @protected
   */
  _findBehavior(behaviorId, targetPhaseKey) {
    const phasesToSearch = targetPhaseKey && this.phases[targetPhaseKey]
      ? [targetPhaseKey]
      : ["start", "before", "base", "hit", "spark", "after", "end"];

    for (const pKey of phasesToSearch) {
      const phase = this.phases[pKey];
      if (!phase || !phase.behaviors) continue;
      const found = phase.behaviors.find(b => b.id === behaviorId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Find the first behavior matching a given type across phases.
   * @param {string} type
   * @returns {object|null}
   * @protected
   */
  _findBehaviorByType(type) {
    const phaseOrder = ["start", "before", "base", "hit", "spark", "after", "end"];
    for (const pKey of phaseOrder) {
      const phase = this.phases[pKey];
      if (!phase || !phase.behaviors) continue;
      const found = phase.behaviors.find(b => b.type === type);
      if (found) return found;
    }
    return null;
  }

  /**
   * Determine if a phase has any active content (description or behaviors).
   * @param {string} phaseKey
   * @returns {boolean}
   * @protected
   */
  _hasContent(phaseKey) {
    const phase = this.phases[phaseKey];
    if (!phase || phase.skipPhase) return false;
    const hasDesc = Boolean(phase.description && phase.description.trim());
    const hasBehaviors = Boolean(phase.behaviors && phase.behaviors.length > 0);
    return hasDesc || hasBehaviors;
  }

  /**
   * Determine if a phase should be skipped during pipeline execution.
   * @param {string} phaseKey
   * @returns {boolean}
   * @protected
   */
  _shouldSkipPhase(phaseKey) {
    const phase = this.phases[phaseKey];
    if (phase?.skipPhase) return true;
    if (phaseKey === "hit" && !this.context.isHit) return true;
    if (phaseKey === "spark" && !this.context.isSpark) return true;

    return !this._hasContent(phaseKey);
  }

  /**
   * Execute a single phase.
   * @param {string} phaseKey
   * @protected
   */
  async _executePhase(phaseKey) {
    const phase = this.phases[phaseKey];

    // Initialize phase output container for consolidated single card rendering
    this.context.currentPhaseOutputs = {
      rolls: [],
      rollEntries: [],
      notes: [],
      accuracyHtml: ""
    };

    // Execute each behavior in order
    for (const behavior of phase.behaviors || []) {
      if (behavior._alreadyExecuted) continue;
      const result = await this._executeBehavior(behavior, phaseKey);
      if (result === false) return false;
    }

    // Post single consolidated chat card for this active phase
    await this._postPhaseCard(phaseKey, phase);
  }

  /**
   * Perform Base phase accuracy check matching legacy Deed logic.
   * If creature attacking PC characters, prompts the player owner via websocket socket to roll defense.
   * @protected
   */
  async _resolveAccuracyCheck() {
    const isAttack = this.system.actionType !== "support";
    const versus = this.system.versus ?? "Guard";
    const apBonus = this.context.apBonus || 0;

    // 1. Ensure target selection runs FIRST before accuracy DC calculation
    if ((!this.context.targets || this.context.targets.length === 0) && isAttack) {
      const selectBehavior = this._findBehaviorByType("selectTarget");
      if (selectBehavior && !selectBehavior._alreadyExecuted) {
        selectBehavior._alreadyExecuted = true;
        const selectRes = await BDeedBehaviorHandler.dispatch(selectBehavior, this.context, this.actor, this.item);
        if (selectRes === false) return false; // Target selection cancelled
      }
    }

    const isCreatureAttacker = this.actor?.type === "creature";

    // ─────────────────────────────────────────────────────────────────────────
    // Creature Attacking Characters (Player-Facing Defense Roll via Socket)
    // ─────────────────────────────────────────────────────────────────────────
    if (isCreatureAttacker && isAttack) {
      const creatureEffBonus = this.actor ? TrespasserEffectsHelper.getAttributeBonus(this.actor, "accuracy", "use") : 0;
      const creatureAccuracy = this.actor?.system?.combat?.accuracy ?? 0;
      const creatureDC = creatureAccuracy + creatureEffBonus + apBonus;

      let anyHit = false;
      let maxSparks = 0;
      const results = [];

      const targetList = (this.context.targets && this.context.targets.length > 0)
        ? this.context.targets
        : Array.from(game.user.targets);

      for (const targetToken of targetList) {
        const targetActor = targetToken?.actor ?? (targetToken instanceof Actor ? targetToken : null);
        if (!targetActor) continue;

        const statKey = versus.toLowerCase(); // "guard" or "resist"
        const tokenName = BDeedBehaviorHandler.getTokenDisplayName(targetToken);
        let defTotal = 10;
        let diceResult = 10;

        if (targetActor.type === "creature") {
          // NPC vs NPC: compare creature DC vs target creature stat directly
          const totalDef = targetActor.system?.combat?.[statKey] ?? 10;
          const defEffBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey, "use");
          defTotal = totalDef + defEffBonus;
        } else {
          // Player character target: prompt player via websocket socket to roll defense
          const defResult = await requestPlayerDefenseRoll({
            targetActorId: targetActor.id,
            targetTokenId: targetToken.id,
            statKey,
            creatureDC,
            deedName: this.item.name,
            creatureName: this.actor.name
          });

          if (!defResult) return false; // Player cancelled defense roll

          defTotal = defResult.total;
          diceResult = defResult.diceResult;
        }

        const isHit = creatureDC >= defTotal;
        if (isHit) anyHit = true;

        const diff = creatureDC - defTotal;
        let sparks = 0;
        let shadows = 0;
        if (diff >= 0) sparks = Math.floor(diff / 5);
        else shadows = Math.floor(Math.abs(diff) / 5);

        if (diceResult === 20) sparks += 1;
        if (diceResult === 1) shadows += 1;

        // Sparks cancel Shadows
        const net = sparks - shadows;
        sparks = Math.max(0, net);
        shadows = Math.max(0, -net);

        if (sparks > maxSparks) maxSparks = sparks;

        results.push({
          tokenId: targetToken?.id ?? null,
          tokenName,
          actorId: targetActor?.id ?? null,
          isHit,
          sparks,
          shadows,
          rollTotal: defTotal,
          dc: creatureDC
        });
      }

      let sparkChoices = null;
      if (maxSparks > 0 && anyHit) {
        sparkChoices = await askSparkDialog(results);
      }

      const applySparkPhase = maxSparks > 0 && (!sparkChoices || sparkChoices.applyDeedSpark !== false);

      this.context.isHit = anyHit;
      this.context.isSpark = applySparkPhase;
      this.context.maxSparks = maxSparks;
      this.context.sparkChoices = sparkChoices;
      this.context.accuracyResults = results;

      // Post creature defense roll results HTML
      let resultsHtml = "";
      for (const res of results) {
        resultsHtml += `
          <div class="target-result" style="border-top:1px solid var(--trp-border-light, #5c4f3a);padding-top:5px;margin-top:5px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>${res.tokenName} <span style="font-size:10px;color:var(--trp-text-dim, #a09070);">(Roll: ${res.rollTotal} vs DC: ${res.dc})</span></strong>
              <span class="${res.isHit ? "hit-text" : "miss-text"}" style="font-weight:bold; color: ${res.isHit ? '#4fc3f7' : '#ff5252'};">${res.isHit ? (game.i18n.localize("TRESPASSER.Chat.Combat.Hit") || "ACERTO!") : (game.i18n.localize("TRESPASSER.Chat.Combat.Miss") || "ERRO!")}</span>
            </div>
            <div style="display:flex;gap:10px;font-size:11px;margin-top:2px;">
              <span style="color: #e8c96b;">✨ ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: res.sparks }) || `Centelhas: ${res.sparks}`}</span>
              <span style="color: #922c2c;">🌑 ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: res.shadows }) || `Sombras: ${res.shadows}`}</span>
            </div>
          </div>`;
      }

      if (!this.context.currentPhaseOutputs) {
        this.context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
      }

      this.context.currentPhaseOutputs.accuracyHtml = `
        <div class="accuracy-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: 12px; font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
            ${game.i18n.format("TRESPASSER.Chat.Combat.AccuracyRoll", { name: this.item.name })} (Creature Attack DC: ${creatureDC})
          </h4>
          ${resultsHtml}
        </div>`;

      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Character Attacking (Player Roll vs Target CD/DC)
    // ─────────────────────────────────────────────────────────────────────────
    const isAdv = this.actor ? TrespasserEffectsHelper.hasAdvantage(this.actor, "accuracy") : false;
    const effectBonus = this.actor ? TrespasserEffectsHelper.getAttributeBonus(this.actor, "accuracy", "use") : 0;
    const totalAccuracy = this.actor?.system?.combat?.accuracy ?? 0;
    const baseAccuracy = totalAccuracy - effectBonus;
    const diceFormula = isAdv ? "2d20kh" : "1d20";

    const rollDialogData = {
      dice: diceFormula,
      bonuses: [
        { label: game.i18n.localize("TRESPASSER.Sheet.Combat.Accuracy") || "Accuracy", value: baseAccuracy },
        { label: game.i18n.localize("TRESPASSER.Dialog.Roll.EffectBonus") || "Effect Bonus", value: effectBonus }
      ]
    };

    if (apBonus > 0) {
      rollDialogData.bonuses.push({
        label: game.i18n.localize("TRESPASSER.Chat.Check.AccuracyFromAP") || "Accuracy from Extra Effort",
        value: apBonus
      });
    }

    // Prompt user with Trespasser Roll Dialog
    const dialogResult = await TrespasserRollDialog.wait({
      ...rollDialogData,
      showCD: false
    }, { title: `${this.item.name} Roll` });

    if (!dialogResult) return false; // User cancelled roll dialog

    const userModifier = dialogResult.modifier || 0;
    const totalBonuses = `${baseAccuracy} + ${effectBonus} + ${apBonus} + ${userModifier}`;
    const formula = isAdv ? `2d20kh + ${totalBonuses}` : `1d20 + ${totalBonuses}`;

    const rollData = this.actor?.getRollData() || {};
    const accRoll = new foundry.dice.Roll(formula, rollData);
    await accRoll.evaluate();

    const rollTotal = accRoll.total;
    const diceResult = accRoll.dice[0]?.results?.find(r => r.active)?.result ?? accRoll.dice[0]?.results[0]?.result ?? 10;

    let anyHit = false;
    let maxSparks = 0;
    const results = [];

    // Evaluate selected targets from context.targets
    const targetList = (this.context.targets && this.context.targets.length > 0)
      ? this.context.targets
      : Array.from(game.user.targets);

    const actualTargets = isAttack && targetList.length > 0 ? targetList : [null];

    for (const targetToken of actualTargets) {
      const targetActor = targetToken?.actor ?? (targetToken instanceof Actor ? targetToken : null);
      const tokenName = targetToken ? BDeedBehaviorHandler.getTokenDisplayName(targetToken) : null;
      let dc = 10;

      // Support deeds automatically have DC 10
      if (!isAttack || versus === "10" || !versus) {
        dc = 10;
      } else if (targetActor) {
        const statKey = versus.toLowerCase(); // "guard" or "resist"
        const totalDef = targetActor.system?.combat?.[statKey] ?? 10;
        const effBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey, "use");
        const targetCD = totalDef + effBonus;
        dc = targetActor.type === "character" ? targetCD + 10 : targetCD;
      }

      let isHit = rollTotal >= dc;
      if (diceResult === 20) isHit = true;
      if (isHit) anyHit = true;

      const diff = rollTotal - dc;
      let sparks = 0;
      let shadows = 0;
      if (diff >= 0) sparks = Math.floor(diff / 5);
      else shadows = Math.floor(Math.abs(diff) / 5);

      if (diceResult === 20) sparks += 1;
      if (diceResult === 1) shadows += 1;

      // Sparks cancel Shadows
      const net = sparks - shadows;
      sparks = Math.max(0, net);
      shadows = Math.max(0, -net);

      if (sparks > maxSparks) maxSparks = sparks;

      results.push({
        tokenId: targetToken?.id ?? null,
        tokenName,
        actorId: targetActor?.id ?? null,
        isHit,
        sparks,
        shadows,
        rollTotal,
        dc
      });
    }

    // Spark selection dialog prompt when sparks are generated
    let sparkChoices = null;
    if (maxSparks > 0 && anyHit) {
      sparkChoices = await askSparkDialog(results);
    }

    const applySparkPhase = maxSparks > 0 && (!sparkChoices || sparkChoices.applyDeedSpark !== false);

    this.context.rollResult = accRoll;
    this.context.isHit = anyHit;
    this.context.isSpark = applySparkPhase;
    this.context.maxSparks = maxSparks;
    this.context.sparkChoices = sparkChoices;
    this.context.accuracyResults = results;

    const rollHtml = await accRoll.render();

    let resultsHtml = "";
    for (const res of results) {
      if (res.tokenName) {
        resultsHtml += `
          <div class="target-result" style="border-top:1px solid var(--trp-border-light, #5c4f3a);padding-top:5px;margin-top:5px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>${res.tokenName} <span style="font-size:10px;color:var(--trp-text-dim, #a09070);">(Roll: ${res.rollTotal} vs ${game.i18n.localize("TRESPASSER.Sheet.Combat." + versus)}: ${res.dc})</span></strong>
              <span class="${res.isHit ? "hit-text" : "miss-text"}" style="font-weight:bold; color: ${res.isHit ? '#4fc3f7' : '#ff5252'};">${res.isHit ? (game.i18n.localize("TRESPASSER.Chat.Combat.Hit") || "ACERTO!") : (game.i18n.localize("TRESPASSER.Chat.Combat.Miss") || "ERRO!")}</span>
            </div>
            <div style="display:flex;gap:10px;font-size:11px;margin-top:2px;">
              <span style="color: #e8c96b;">✨ ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: res.sparks }) || `Centelhas: ${res.sparks}`}</span>
              <span style="color: #922c2c;">🌑 ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: res.shadows }) || `Sombras: ${res.shadows}`}</span>
            </div>
          </div>`;
      } else {
        resultsHtml += `
          <div class="incantation-metrics" style="display:flex;gap:10px;margin:8px 0;font-weight:bold;">
            <div style="color:#e8c96b;"><i class="fas fa-sun"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Sparks", { count: res.sparks }) || `Centelhas: ${res.sparks}`}</div>
            <div style="color:#922c2c;"><i class="fas fa-moon"></i> ${game.i18n.format("TRESPASSER.Chat.Combat.Shadows", { count: res.shadows }) || `Sombras: ${res.shadows}`}</div>
          </div>`;
      }
    }

    if (!this.context.currentPhaseOutputs) {
      this.context.currentPhaseOutputs = { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
    }

    this.context.currentPhaseOutputs.rolls.push(accRoll);
    this.context.currentPhaseOutputs.accuracyHtml = `
      <div class="accuracy-section" style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px;">
        <h4 style="margin: 0 0 4px 0; color: var(--trp-gold-bright, #e8c96b); font-size: 12px; font-weight: bold; border-bottom: 1px dashed var(--trp-border, #4a3f2f); padding-bottom: 2px;">
          ${game.i18n.format("TRESPASSER.Chat.Combat.AccuracyRoll", { name: this.item.name })}${isAdv ? " (Adv)" : ""}
        </h4>
        ${rollHtml}
        ${resultsHtml}
      </div>`;

    return true;
  }

  /**
   * Execute an individual behavior.
   * @param {object} behavior
   * @param {string} phaseKey
   * @protected
   */
  async _executeBehavior(behavior, phaseKey) {
    console.log(`[BDeedExecutor] Phase "${phaseKey}" — Executing behavior "${behavior.type}" (${behavior.id}):`, behavior.params);
    return await BDeedBehaviorHandler.dispatch(behavior, this.context, this.actor, this.item, phaseKey);
  }

  /**
   * Post a single consolidated chat card for an active phase containing description, accuracy roll, damage rolls, and behavior notes.
   * @param {string} phaseKey
   * @param {object} phase
   * @protected
   */
  async _postPhaseCard(phaseKey, phase) {
    const phaseLabel = game.i18n.localize(`TRESPASSER.Sheet.BDeed.Phase.${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}`);
    const outputs = this.context.currentPhaseOutputs || { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };

    let content = `<div class="bdeed-phase-card" style="border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px; padding: 10px; background: var(--trp-bg-panel, #23201c); color: var(--trp-text, #ddd0aa);">
      <h3 style="margin: 0 0 6px 0; color: var(--trp-gold-bright, #e8c96b); font-family: var(--trp-font-header, 'Cinzel', serif); font-size: 14px; border-bottom: 1px solid var(--trp-gold-dim, #a88840); padding-bottom: 4px;">
        ${this.item.name} — ${phaseLabel}
      </h3>`;

    if (phase.description) {
      content += `<p style="margin: 6px 0; font-size: 13px; font-style: italic;">${phase.description}</p>`;
    }

    if (outputs.accuracyHtml) {
      content += outputs.accuracyHtml;
    }

    if (outputs.rollEntries && outputs.rollEntries.length > 0) {
      content += outputs.rollEntries.join("");
    }

    if (outputs.notes && outputs.notes.length > 0) {
      content += `<div class="phase-notes" style="margin-top: 8px; padding-top: 4px; border-top: 1px dashed var(--trp-border, #4a3f2f); font-size: 12px; color: var(--trp-text-dim, #a09070);">
        ${outputs.notes.map(n => `<div>• ${n}</div>`).join("")}
      </div>`;
    }

    content += `</div>`;

    const sourceToken = this.actor?.token?.object ||
                        canvas.tokens?.controlled.find(t => t.actor?.id === this.actor?.id) ||
                        canvas.tokens?.placeables.find(t => t.actor?.id === this.actor?.id);

    const alias = sourceToken ? BDeedBehaviorHandler.getTokenDisplayName(sourceToken) : BDeedBehaviorHandler.getTokenDisplayName(this.actor);

    const speaker = sourceToken
      ? ChatMessage.getSpeaker({ token: sourceToken.document || sourceToken, actor: this.actor, alias })
      : (this.actor ? ChatMessage.getSpeaker({ actor: this.actor, alias }) : ChatMessage.getSpeaker({ alias }));
    speaker.alias = alias;

    await ChatMessage.create({
      speaker,
      content,
      rolls: outputs.rolls || [],
      flags: { trespasser: { bdeedId: this.item.id, phase: phaseKey } }
    });
  }
}
