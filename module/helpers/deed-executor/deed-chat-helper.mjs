import { formatDiceIcons } from "../dice-icon-helper.mjs";
import { DeedBehaviorHandler } from "../deed-behavior-handler.mjs";

/**
 * DeedChatHelper — Dedicated single-responsibility chat manager for DeedExecutor.
 * Handles immediate progressive chat card creation, in-place live updating,
 * permission-safe updates/deletions with socket fallbacks, and cancellation cleanups.
 */
export class DeedChatHelper {
  /**
   * @param {DeedExecutor} executor
   */
  constructor(executor) {
    this.executor = executor;
    /** Map of phaseKey -> ChatMessage document */
    this._phaseMessages = new Map();
  }

  /**
   * Reset the chat messages map for a new deed run.
   */
  reset() {
    this._phaseMessages.clear();
  }

  /**
   * Safely updates a chat message document, falling back to GM socket delegation
   * if the current user lacks permission to update the ChatMessage.
   * @param {ChatMessage} message
   * @param {object} updateData
   * @returns {Promise<ChatMessage|boolean>}
   */
  async updateMessage(message, updateData) {
    if (!message) return false;
    if (message.canUserModify(game.user, "update")) {
      try {
        return await message.update(updateData);
      } catch (err) {
        console.warn("Trespasser | Direct ChatMessage update failed, falling back to GM socket:", err);
      }
    }
    const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
    await emitDeedActionAndWait("updateChatMessage", {
      messageId: message.id,
      updateData
    });
    return message;
  }

  /**
   * Safely deletes a chat message document, falling back to GM socket delegation
   * if the current user lacks permission to delete the ChatMessage.
   * @param {ChatMessage} message
   * @returns {Promise<boolean>}
   */
  async deleteMessage(message) {
    if (!message) return false;
    if (message.canUserModify(game.user, "delete")) {
      try {
        await message.delete();
        return true;
      } catch (err) {
        console.warn("Trespasser | Direct ChatMessage delete failed, falling back to GM socket:", err);
      }
    }
    const { emitDeedActionAndWait } = await import("../socket/deed-socket-handler.mjs");
    await emitDeedActionAndWait("deleteChatMessage", {
      messageId: message.id
    });
    return true;
  }

  /**
   * Checks whether a phase produced output or has an active phase description to post.
   * @param {string} phaseKey
   * @returns {boolean}
   */
  hasOutputsToPost(phaseKey) {
    const outputs = this.executor._phaseOutputs.get(phaseKey);
    if (outputs && (
      (outputs.rolls && outputs.rolls.length > 0) ||
      (outputs.rollEntries && outputs.rollEntries.length > 0) ||
      (outputs.notes && outputs.notes.length > 0) ||
      outputs.accuracyHtml
    )) {
      return true;
    }
    const phase = this.executor.system.phases?.[phaseKey];
    return Boolean(
      this.executor._activePhases.has(phaseKey) &&
      phase?.description &&
      phase.description.trim() &&
      !phase.skipPhase
    );
  }

  /**
   * Builds the HTML content for a phase card.
   * @param {string} phaseKey
   * @param {object} phase
   * @param {object} outputs
   * @returns {string}
   */
  buildCardContent(phaseKey, phase, outputs) {
    const phaseLabel = game.i18n.localize(
      `TRESPASSER.Sheet.Deed.Phase.${phaseKey.charAt(0).toUpperCase() + phaseKey.slice(1)}`
    );

    let content = `<div class="bdeed-phase-card" style="border: 1px solid var(--trp-border, #4a3f2f); border-radius: 4px; padding: 10px; background: var(--trp-bg-panel, #23201c); color: var(--trp-text, #ddd0aa);">
      <h3 style="margin: 0 0 6px 0; color: var(--trp-gold-bright, #e8c96b); font-family: var(--trp-font-header, 'Cinzel', serif); font-size: var(--fs-14); border-bottom: 1px solid var(--trp-gold-dim, #a88840); padding-bottom: 4px;">
        ${this.executor.item.name} — ${phaseLabel}
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
    return content;
  }

  /**
   * Post or update a consolidated chat card for a phase in real-time.
   * If a message already exists, updates it in-place.
   * If no message exists and content exists, creates it immediately.
   * If content is empty (e.g. rolled back), deletes the message.
   * @param {string} phaseKey
   * @param {object} [phase=null]
   * @param {object} [outputs=null]
   * @returns {Promise<ChatMessage|null>}
   */
  async postOrUpdatePhaseCard(phaseKey, phase = null, outputs = null) {
    if (!phase || typeof phase !== "object" || Array.isArray(phase)) {
      phase = this.executor.system.phases?.[phaseKey] || {};
    }
    outputs = (outputs && typeof outputs === "object" && !Array.isArray(outputs) && outputs.rolls)
      ? outputs
      : (this.executor._phaseOutputs.get(phaseKey) || { rolls: [], rollEntries: [], notes: [], accuracyHtml: "" });

    const hasContent = Boolean(
      (phase.description && !phase.skipPhase) ||
      outputs.accuracyHtml ||
      (outputs.rollEntries && outputs.rollEntries.length > 0) ||
      (outputs.notes && outputs.notes.length > 0)
    );

    const existingMsg = this._phaseMessages.get(phaseKey);

    if (!hasContent) {
      if (existingMsg) {
        await this.deleteMessage(existingMsg);
        this._phaseMessages.delete(phaseKey);
        if (this.executor.context.activeChatMessage?.id === existingMsg.id) {
          this.executor.context.activeChatMessage = null;
        }
      }
      return null;
    }

    const content = this.buildCardContent(phaseKey, phase, outputs);
    const rollData = (outputs.rolls || []).map(r => (typeof r.toJSON === "function" ? r.toJSON() : r));

    if (existingMsg && game.messages.has(existingMsg.id)) {
      await this.updateMessage(existingMsg, {
        content,
        rolls: rollData
      });
      return existingMsg;
    }

    const sourceToken = this.executor.actor?.token?.object
      || canvas.tokens?.controlled.find(t => t.actor?.id === this.executor.actor?.id)
      || canvas.tokens?.placeables.find(t => t.actor?.id === this.executor.actor?.id);
    const alias = sourceToken
      ? DeedBehaviorHandler.getTokenDisplayName(sourceToken)
      : DeedBehaviorHandler.getTokenDisplayName(this.executor.actor);
    const speaker = sourceToken
      ? ChatMessage.getSpeaker({ token: sourceToken.document || sourceToken, actor: this.executor.actor, alias })
      : (this.executor.actor ? ChatMessage.getSpeaker({ actor: this.executor.actor, alias }) : ChatMessage.getSpeaker({ alias }));
    speaker.alias = alias;

    const msg = await ChatMessage.create({
      speaker,
      content,
      rolls: rollData,
      flags: { trespasser: { bdeedId: this.executor.item.id, phase: phaseKey } }
    });

    this._phaseMessages.set(phaseKey, msg);
    this.executor.context.activeChatMessage = msg;
    return msg;
  }

  /**
   * Called when executor switches to a new phase.
   * If the phase has an active description, immediately displays the card so players
   * see that the phase has started.
   * @param {string} phaseKey
   */
  async onPhaseSwitched(phaseKey) {
    this.executor.context.activeChatMessage = this._phaseMessages.get(phaseKey) || null;
    if (this.hasOutputsToPost(phaseKey)) {
      await this.postOrUpdatePhaseCard(phaseKey);
    }
  }

  /**
   * Called immediately after a behavior finishes executing.
   * Refreshes the phase card in-place if outputs were generated.
   * @param {string} phaseKey
   * @param {object} node
   */
  async onBehaviorExecuted(phaseKey, node) {
    if (this.hasOutputsToPost(phaseKey)) {
      await this.postOrUpdatePhaseCard(phaseKey);
    }
  }

  /**
   * Posts or updates all phase cards strictly in canonical phase order.
   * Called at the end of execution to ensure final consistency.
   */
  async postAllPhaseCards() {
    const CANONICAL_PHASES = ["start", "before", "base", "hit", "spark", "after", "end"];
    for (const phaseKey of CANONICAL_PHASES) {
      if (this.hasOutputsToPost(phaseKey)) {
        await this.postOrUpdatePhaseCard(phaseKey);
      }
    }
  }

  /**
   * Cleans up any preliminary or incomplete phase messages if deed execution was cancelled.
   */
  async cleanupCancelled() {
    for (const [phaseKey, msg] of this._phaseMessages.entries()) {
      const outputs = this.executor._phaseOutputs.get(phaseKey);
      const hasRealOutputs = outputs && (
        (outputs.rolls && outputs.rolls.length > 0) ||
        (outputs.rollEntries && outputs.rollEntries.length > 0) ||
        (outputs.notes && outputs.notes.length > 0) ||
        outputs.accuracyHtml
      );
      if (!hasRealOutputs) {
        try {
          await this.deleteMessage(msg);
          this._phaseMessages.delete(phaseKey);
        } catch (e) {
          console.warn("Trespasser | Failed to cleanup cancelled phase message:", e);
        }
      }
    }
    if (this.executor.context.activeChatMessage) {
      if (!game.messages.has(this.executor.context.activeChatMessage.id)) {
        this.executor.context.activeChatMessage = null;
      }
    }
  }
}
