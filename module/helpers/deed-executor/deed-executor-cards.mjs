import { formatDiceIcons } from "../dice-icon-helper.mjs";
import { DeedBehaviorHandler } from "../deed-behavior-handler.mjs";

/**
 * Checks whether a phase produced output or has an active phase description to post.
 * @param {DeedExecutor} executor
 * @param {string} phaseKey
 * @returns {boolean}
 */
export function hasOutputsToPost(executor, phaseKey) {
  const outputs = executor._phaseOutputs.get(phaseKey);
  if (outputs && (outputs.rolls?.length > 0 || outputs.rollEntries?.length > 0 || outputs.notes?.length > 0 || outputs.accuracyHtml)) {
    return true;
  }
  const phase = executor.system.phases?.[phaseKey];
  return Boolean(executor._activePhases.has(phaseKey) && phase?.description && phase.description.trim() && !phase.skipPhase);
}

/**
 * Post consolidated chat card for a phase.
 * @param {DeedExecutor} executor
 * @param {string} phaseKey
 * @param {object} phase
 * @param {object} [outputs=null]
 */
export async function postPhaseCard(executor, phaseKey, phase, outputs = null) {
  if (!phase) phase = executor.system.phases?.[phaseKey] || {};
  const phaseLabel = game.i18n.localize(`TRESPASSER.Sheet.Deed.Phase.${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}`);
  outputs = outputs || executor._phaseOutputs.get(phaseKey) || { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };

  let content = `<div class="bdeed-phase-card" style="border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px; padding: 10px; background: var(--trp-bg-panel, #23201c); color: var(--trp-text, #ddd0aa);">
    <h3 style="margin: 0 0 6px 0; color: var(--trp-gold-bright, #e8c96b); font-family: var(--trp-font-header, 'Cinzel', serif); font-size: var(--fs-14); border-bottom: 1px solid var(--trp-gold-dim, #a88840); padding-bottom: 4px;">
      ${executor.item.name} — ${phaseLabel}
    </h3>`;

  if (phase.description && !phase.skipPhase) {
    content += `<p style="margin: 6px 0; font-size: var(--fs-13); font-style: italic;">${formatDiceIcons(phase.description)}</p>`;
  }
  if (outputs.accuracyHtml) {
    content += outputs.accuracyHtml;
  }
  if (outputs.rollEntries && outputs.rollEntries.length > 0) {
    content += outputs.rollEntries.join("");
  }
  if (outputs.notes && outputs.notes.length > 0) {
    content += `<div class="phase-notes" style="margin-top: 8px; padding-top: 4px; border-top: 1px dashed var(--trp-border, #4a3f2f); font-size: var(--fs-12); color: var(--trp-text-dim, #a09070);">
      ${outputs.notes.map(n => `<div>• ${formatDiceIcons(n)}</div>`).join("")}
    </div>`;
  }
  content += `</div>`;

  const sourceToken = executor.actor?.token?.object || canvas.tokens?.controlled.find(t => t.actor?.id === executor.actor?.id) || canvas.tokens?.placeables.find(t => t.actor?.id === executor.actor?.id);
  const alias = sourceToken ? DeedBehaviorHandler.getTokenDisplayName(sourceToken) : DeedBehaviorHandler.getTokenDisplayName(executor.actor);
  const speaker = sourceToken
    ? ChatMessage.getSpeaker({ token: sourceToken.document || sourceToken, actor: executor.actor, alias })
    : (executor.actor ? ChatMessage.getSpeaker({ actor: executor.actor, alias }) : ChatMessage.getSpeaker({ alias }));
  speaker.alias = alias;

  const rollData = (outputs.rolls || []).map(r => (typeof r.toJSON === "function" ? r.toJSON() : r));
  await ChatMessage.create({
    speaker,
    content,
    rolls: rollData,
    flags: { trespasser: { bdeedId: executor.item.id, phase: phaseKey } }
  });
}

/**
 * Posts all consolidated phase cards strictly in canonical phase order.
 * @param {DeedExecutor} executor
 */
export async function postAllPhaseCards(executor) {
  const CANONICAL_PHASES = ["start", "before", "base", "hit", "spark", "after", "end"];
  for (const phaseKey of CANONICAL_PHASES) {
    if (hasOutputsToPost(executor, phaseKey)) {
      const phase = executor.system.phases?.[phaseKey] || {};
      const outputs = executor._phaseOutputs.get(phaseKey) || { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" };
      await postPhaseCard(executor, phaseKey, phase, outputs);
    }
  }
}
