import { DeedChatHelper } from "./deed-chat-helper.mjs";

export { DeedChatHelper };

/**
 * Checks whether a phase produced output or has an active phase description to post.
 * Legacy compatibility forwarder delegating to executor.chat.
 * @param {DeedExecutor} executor
 * @param {string} phaseKey
 * @returns {boolean}
 */
export function hasOutputsToPost(executor, phaseKey) {
  if (executor?.chat) return executor.chat.hasOutputsToPost(phaseKey);
  const outputs = executor?._phaseOutputs?.get(phaseKey);
  if (outputs && (outputs.rolls?.length > 0 || outputs.rollEntries?.length > 0 || outputs.notes?.length > 0 || outputs.accuracyHtml)) {
    return true;
  }
  const phase = executor?.system?.phases?.[phaseKey];
  return Boolean(executor?._activePhases?.has(phaseKey) && phase?.description && phase.description.trim() && !phase.skipPhase);
}

/**
 * Post or update consolidated chat card for a phase.
 * Legacy compatibility forwarder delegating to executor.chat.
 * @param {DeedExecutor} executor
 * @param {string} phaseKey
 * @param {object} [phase=null]
 * @param {object} [outputs=null]
 * @returns {Promise<ChatMessage|null>}
 */
export async function postPhaseCard(executor, phaseKey, phase = null, outputs = null) {
  if (executor?.chat) {
    return executor.chat.postOrUpdatePhaseCard(phaseKey, phase, outputs);
  }
  const helper = new DeedChatHelper(executor);
  return helper.postOrUpdatePhaseCard(phaseKey, phase, outputs);
}

/**
 * Posts or updates all consolidated phase cards strictly in canonical phase order.
 * Legacy compatibility forwarder delegating to executor.chat.
 * @param {DeedExecutor} executor
 * @returns {Promise<void>}
 */
export async function postAllPhaseCards(executor) {
  if (executor?.chat) {
    return executor.chat.postAllPhaseCards();
  }
  const helper = new DeedChatHelper(executor);
  return helper.postAllPhaseCards();
}
