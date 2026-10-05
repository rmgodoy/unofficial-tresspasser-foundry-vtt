/**
 * TCA Block Editor
 * Helper class managing DOM events and preparation for TCA Behavior Block Cards in Advanced Mode.
 */

import { renderParamsForAction } from "./tca-param-editors.mjs";
import { getActionIcon, summarizeBlock } from "./tca-summary.mjs";
import { resolveItem } from "../../helpers/item-resolver.mjs";

export class TCABlockEditor {
  /**
   * Prepares behavior blocks for rendering in the Handlebars context.
   * @param {Array<object>} behaviors
   * @param {object} config
   * @param {number} [intensity=0]
   * @returns {Array<object>}
   */
  static prepareBlocks(behaviors = [], config = {}, intensity = 0) {
    if (!Array.isArray(behaviors)) return [];

    return behaviors.map((block, index) => {
      const blockId = block.id || `b_${index}`;
      const blockLabel = block.label || `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Behaviors")} #${index + 1}`;
      
      // Build sibling options for gatedBy
      const gatedByOptions = {
        "": "TRESPASSER.Sheet.Item.Effect.GatedByNone"
      };
      behaviors.forEach((b, otherIdx) => {
        if (otherIdx !== index && b.id) {
          const siblingLabel = b.label || `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Behaviors")} #${otherIdx + 1}`;
          gatedByOptions[b.id] = siblingLabel;
        }
      });

      const paramsHtml = renderParamsForAction(block.action || "modify_attribute", block.params || {}, config, index);
      const icon = getActionIcon(block.action, block.params);
      const summaryText = summarizeBlock(block, intensity);

      return {
        ...block,
        id: blockId,
        index,
        displayIndex: index + 1,
        computedLabel: blockLabel,
        icon,
        summaryText,
        gatedByOptions,
        paramsHtml,
        hasCooldown: Boolean(block.cooldown && block.cooldown.uses),
        hasCost: Boolean(block.cost && (block.cost.actionPoints || block.cost.focus || block.cost.reaction))
      };
    });
  }

  /**
   * Attaches event listeners for behavior block interactions.
   * @param {HTMLElement} html
   * @param {TrespasserEffectSheet} sheet
   */
  static activateListeners(html, sheet) {
    if (!sheet.isEditable) return;

    // Add block button
    html.querySelectorAll('[data-action="addBehaviorBlock"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.onAddBlock(sheet);
      });
    });

    // Delete block button
    html.querySelectorAll('[data-action="deleteBehaviorBlock"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const index = Number(event.currentTarget.dataset.index);
        await this.onDeleteBlock(sheet, index);
      });
    });

    // Collapse toggle on header
    html.querySelectorAll('.tca-block-header').forEach(header => {
      header.addEventListener("click", (event) => {
        // Prevent toggle if clicking action buttons or drag handle
        if (event.target.closest('.block-actions') || event.target.closest('.drag-handle') || event.target.closest('input')) {
          return;
        }
        event.preventDefault();
        const card = header.closest('.tca-block-card');
        if (card) {
          card.classList.toggle('collapsed');
          const icon = card.querySelector('.block-collapse-icon i');
          if (icon) {
            icon.className = card.classList.contains('collapsed') ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
          }
        }
      });
    });

    // Behavior Effect Drop Zones (for confer_state, etc.)
    html.querySelectorAll('.behavior-effect-drop').forEach(zone => {
      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", (event) => {
        event.stopPropagation();
        zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.remove("drag-over");
        await this.onDropBehaviorEffect(sheet, event);
      });
    });

    // Remove behavior effect chip
    html.querySelectorAll('[data-action="removeBehaviorEffect"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const blockIndex = Number(btn.dataset.behaviorIndex);
        const effectIndex = Number(btn.dataset.effectIndex);
        await this.onRemoveBehaviorEffect(sheet, blockIndex, effectIndex);
      });
    });

    // Open/edit behavior effect document
    html.querySelectorAll('[data-action="openBehaviorEffectDoc"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const uuid = btn.dataset.uuid;
        await this.onOpenBehaviorEffect(uuid);
      });
    });

    // Drag-and-drop reordering
    this._attachDragAndDrop(html, sheet);
  }

  /**
   * Attaches drag and drop listeners to block cards.
   * @private
   */
  static _attachDragAndDrop(html, sheet) {
    const cards = html.querySelectorAll('.tca-block-card');
    let draggedIndex = null;

    cards.forEach(card => {
      card.addEventListener("dragstart", (event) => {
        if (!event.target.closest('.drag-handle') && !event.target.closest('.tca-block-header')) {
          event.preventDefault();
          return;
        }
        draggedIndex = Number(card.dataset.blockIndex);
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(draggedIndex));
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        cards.forEach(c => c.classList.remove("drag-over"));
        draggedIndex = null;
      });

      card.addEventListener("dragover", (event) => {
        if (event.target.closest('.behavior-effect-drop') || event.target.closest('.drop-zone')) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over");
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over");
      });

      card.addEventListener("drop", async (event) => {
        if (event.target.closest('.behavior-effect-drop') || event.target.closest('.drop-zone')) {
          return;
        }
        event.preventDefault();
        card.classList.remove("drag-over");
        const targetIndex = Number(card.dataset.blockIndex);
        if (draggedIndex !== null && targetIndex !== null && draggedIndex !== targetIndex) {
          await this.onReorderBlocks(sheet, draggedIndex, targetIndex);
        }
      });
    });
  }

  /**
   * Handle dropping an effect item onto a behavior block's effect drop zone.
   * @param {TrespasserEffectSheet} sheet
   * @param {DragEvent} event
   */
  static async onDropBehaviorEffect(sheet, event) {
    const zone = event.currentTarget.closest(".behavior-effect-drop");
    if (!zone) return;
    const blockIndex = Number(zone.dataset.behaviorIndex);
    if (isNaN(blockIndex)) return;

    let data;
    try {
      data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch {
      try {
        data = JSON.parse(event.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
    }

    if (!data || data.type !== "Item") return;

    const sourceItem = await resolveItem(data);
    if (!sourceItem) return;

    if (sourceItem.type !== "effect") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropEffectsOnly"));
      return;
    }

    if (sourceItem.uuid === sheet.document.uuid) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.CannotConferSelf"));
      return;
    }

    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    if (!behaviors[blockIndex]) return;

    const block = behaviors[blockIndex];
    block.params = block.params || {};
    let effects = Array.isArray(block.params.effects) ? [...block.params.effects] : [];

    if (effects.some(e => e.uuid === sourceItem.uuid)) {
      ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: sourceItem.name }));
      return;
    }

    effects.push({
      uuid: sourceItem.uuid,
      name: sourceItem.name,
      img: sourceItem.img || "systems/trespasser/assets/icons/skills/afflicted.webp",
      intensity: String(sourceItem.system?.intensity ?? "1")
    });

    block.params.effects = effects;
    block.params.stateName = effects[0].name;
    block.params.stateId = effects[0].uuid;
    block.params.intensity = effects[0].intensity;

    await sheet.document.update({ "system.behaviors": behaviors });
  }

  /**
   * Removes an effect chip from a behavior block.
   * @param {TrespasserEffectSheet} sheet
   * @param {number} blockIndex
   * @param {number} effectIndex
   */
  static async onRemoveBehaviorEffect(sheet, blockIndex, effectIndex) {
    if (isNaN(blockIndex) || isNaN(effectIndex)) return;

    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    if (!behaviors[blockIndex]) return;

    const block = behaviors[blockIndex];
    block.params = block.params || {};
    let effects = Array.isArray(block.params.effects) ? [...block.params.effects] : [];
    if (effectIndex < 0 || effectIndex >= effects.length) return;

    effects.splice(effectIndex, 1);
    block.params.effects = effects;

    if (effects.length > 0) {
      block.params.stateName = effects[0].name;
      block.params.stateId = effects[0].uuid;
      block.params.intensity = effects[0].intensity;
    } else {
      block.params.stateName = "";
      block.params.stateId = "";
      block.params.intensity = "1";
    }

    await sheet.document.update({ "system.behaviors": behaviors });
  }

  /**
   * Opens an effect document sheet by UUID.
   * @param {string} uuid
   */
  static async onOpenBehaviorEffect(uuid) {
    if (!uuid) return;
    const item = await resolveItem(uuid, { type: "effect" });
    if (item?.sheet) {
      item.sheet.render(true);
    }
  }

  /**
   * Adds a new behavior block with default parameters.
   * @param {TrespasserEffectSheet} sheet
   */
  static async onAddBlock(sheet) {
    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    const newBlock = {
      id: foundry.utils?.randomID?.(8) || Math.random().toString(36).substring(2, 10),
      label: "",
      trigger: "continuous",
      condition: "",
      action: "modify_attribute",
      params: { attribute: "guard", modifier: "+<Int>", applyMode: "delta" },
      actionTarget: "self",
      scope: "",
      rangeType: "",
      range: 0,
      priority: null,
      requiresConfirmation: false,
      promptText: "",
      choiceGroup: "",
      choiceLabel: "",
      gatedBy: "",
      cooldown: null,
      cost: null
    };
    behaviors.push(newBlock);
    await sheet.document.update({ "system.behaviors": behaviors });
  }

  /**
   * Deletes a behavior block by index.
   * @param {TrespasserEffectSheet} sheet
   * @param {number} index
   */
  static async onDeleteBlock(sheet, index) {
    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    if (index >= 0 && index < behaviors.length) {
      behaviors.splice(index, 1);
      await sheet.document.update({ "system.behaviors": behaviors });
    }
  }

  /**
   * Reorders behavior blocks from one index to another.
   * @param {TrespasserEffectSheet} sheet
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  static async onReorderBlocks(sheet, fromIndex, toIndex) {
    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    if (fromIndex < 0 || fromIndex >= behaviors.length || toIndex < 0 || toIndex >= behaviors.length) return;

    const [moved] = behaviors.splice(fromIndex, 1);
    behaviors.splice(toIndex, 0, moved);
    await sheet.document.update({ "system.behaviors": behaviors });
  }
}
