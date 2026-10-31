/**
 * TCA Block Editor
 * Helper class managing DOM events and context preparation for TCA Behavior Pipeline Cards
 * in both Simplified and Advanced modes.
 */

import { renderParamsForAction, renderSimpleInlineParams } from "./tca-param-editors.mjs";
import { getActionIcon, summarizeBlock } from "./tca-summary.mjs";
import { resolveItem } from "../../helpers/item-resolver.mjs";

export class TCABlockEditor {
  /**
   * Prepares behavior blocks for rendering in the Handlebars context.
   * @param {Array<object>} behaviors
   * @param {object} config
   * @param {number} [intensity=0]
   * @param {Record<string, Set<string>>} [expandedConstraints={}]
   * @param {Set<string>} [collapsedBlocks=new Set()]
   * @returns {Array<object>}
   */
  static prepareBlocks(behaviors = [], config = {}, intensity = 0, expandedConstraints = {}, collapsedBlocks = new Set()) {
    if (!Array.isArray(behaviors)) return [];

    return behaviors.map((block, index) => {
      const idxKey = `idx_${index}`;
      const blockId = block.id || `b_${index}`;
      const blockLabel = block.label || `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Behaviors")} #${index + 1}`;
      const openById = expandedConstraints[blockId] || new Set();
      const openByIdx = expandedConstraints[idxKey] || new Set();
      const isOpen = (c) => openById.has(c) || openByIdx.has(c);
      const isCollapsed = Boolean(collapsedBlocks?.has(blockId) || collapsedBlocks?.has(idxKey));

      // Build sibling options for gatedBy
      const gatedByOptions = {
        "": "TRESPASSER.Sheet.Item.Effect.GatedByNone"
      };
      let gatedByParentLabel = "";
      behaviors.forEach((b, otherIdx) => {
        if (otherIdx !== index && b.id) {
          const siblingLabel = b.label ? `#${otherIdx + 1} ${b.label}` : `#${otherIdx + 1}`;
          gatedByOptions[b.id] = siblingLabel;
          if (block.gatedBy === b.id) gatedByParentLabel = siblingLabel;
        }
      });

      const action = block.action || "modify_attribute";
      const params = block.params || {};
      const paramsHtml = renderParamsForAction(action, params, config, index, intensity);
      const simpleParamsHtml = renderSimpleInlineParams(action, params, config, index, intensity);
      const icon = getActionIcon(action, params);
      const summaryText = summarizeBlock(block, intensity);
      const actionLabel = config.actions?.[action] ? game.i18n.localize(config.actions[action]) : action;

      const hasCondition = Boolean(block.condition && String(block.condition).trim());
      const hasChain = Boolean(block.gatedBy);
      const hasCooldown = Boolean(block.cooldown && block.cooldown.uses);
      const hasCost = Boolean(block.cost && (block.cost.actionPoints || block.cost.focus || block.cost.reaction));
      const hasPrompt = Boolean(block.requiresConfirmation || block.promptText || block.choiceGroup || block.choiceLabel);

      const constraintBadges = [];
      if (hasCondition) {
        constraintBadges.push({
          type: "condition",
          icon: "fas fa-filter",
          text: `${game.i18n.localize("TRESPASSER.Sheet.Item.Effect.Summary.IfCondition")} ${block.condition}`
        });
      }
      if (hasCost) {
        const parts = [];
        if (block.cost.actionPoints) parts.push(`${block.cost.actionPoints} AP`);
        if (block.cost.focus) parts.push(`${block.cost.focus} Focus`);
        if (block.cost.reaction) parts.push(game.i18n.localize("TRESPASSER.Sheet.Item.Effect.CostReaction"));
        constraintBadges.push({ type: "cost", icon: "fas fa-coins", text: parts.join(", ") });
      }
      if (hasCooldown) {
        const perKey = block.cooldown.per === "turn"
          ? "TRESPASSER.Sheet.Item.Effect.Summary.PerTurn"
          : block.cooldown.per === "combat"
          ? "TRESPASSER.Sheet.Item.Effect.Summary.PerCombat"
          : "TRESPASSER.Sheet.Item.Effect.Summary.PerRound";
        constraintBadges.push({ type: "cooldown", icon: "fas fa-clock", text: `${block.cooldown.uses}${game.i18n.localize(perKey)}` });
      }
      if (hasPrompt) {
        constraintBadges.push({
          type: "prompt",
          icon: "fas fa-circle-question",
          text: block.choiceLabel || block.choiceGroup || game.i18n.localize("TRESPASSER.Sheet.Item.Effect.RequiresConfirmation")
        });
      }

      return {
        ...block,
        id: blockId,
        index,
        displayIndex: index + 1,
        computedLabel: blockLabel,
        actionLabel,
        icon,
        summaryText,
        gatedByOptions,
        gatedByParentLabel,
        isChained: hasChain,
        isCollapsed,
        paramsHtml,
        simpleParamsHtml,
        hasCondition,
        hasChain,
        hasCooldown,
        hasCost,
        hasPrompt,
        showCondition: hasCondition || isOpen("condition"),
        showChain: hasChain || isOpen("chain"),
        showCooldown: hasCooldown || isOpen("cooldown"),
        showCost: hasCost || isOpen("cost"),
        showPrompt: hasPrompt || isOpen("prompt"),
        constraintBadges
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

    html.querySelectorAll('[data-action="addBehaviorBlock"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.onAddBlock(sheet);
      });
    });

    html.querySelectorAll('[data-action="duplicateBehaviorBlock"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.onDuplicateBlock(sheet, Number(event.currentTarget.dataset.index));
      });
    });

    html.querySelectorAll('[data-action="deleteBehaviorBlock"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.onDeleteBlock(sheet, Number(event.currentTarget.dataset.index));
      });
    });

    html.querySelectorAll('[data-action="toggleConstraint"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.onToggleConstraint(sheet, btn.dataset.blockId, Number(btn.dataset.index), btn.dataset.constraint);
      });
    });

    html.querySelectorAll('[data-action="openConstraintInAdvanced"]').forEach(badge => {
      badge.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const blockId = badge.dataset.blockId;
        const constraint = badge.dataset.constraint;
        sheet._advancedMode = true;
        if (blockId && constraint) {
          sheet._expandedConstraints = sheet._expandedConstraints || {};
          sheet._expandedConstraints[blockId] = sheet._expandedConstraints[blockId] || new Set();
          sheet._expandedConstraints[blockId].add(constraint);
        }
        sheet.render();
      });
    });

    // Toggle block collapse via header or chevron button and persist in sheet._collapsedBlocks
    const toggleCardCollapse = (card) => {
      if (!card) return;
      const blockId = card.dataset.blockId;
      const idxKey = `idx_${card.dataset.blockIndex}`;
      sheet._collapsedBlocks = sheet._collapsedBlocks || new Set();
      const willCollapse = !card.classList.contains("collapsed");
      card.classList.toggle("collapsed", willCollapse);
      if (willCollapse) {
        if (blockId) sheet._collapsedBlocks.add(blockId);
        sheet._collapsedBlocks.add(idxKey);
      } else {
        if (blockId) sheet._collapsedBlocks.delete(blockId);
        sheet._collapsedBlocks.delete(idxKey);
      }
      const icon = card.querySelector(".block-collapse-btn i");
      if (icon) {
        icon.className = willCollapse ? "fas fa-chevron-right" : "fas fa-chevron-down";
      }
    };

    html.querySelectorAll('[data-action="toggleCollapseBlock"]').forEach(btn => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCardCollapse(btn.closest(".tca-block-card"));
      });
    });

    html.querySelectorAll(".tca-block-header").forEach(header => {
      header.addEventListener("click", (event) => {
        if (event.target.closest(".block-actions") || event.target.closest(".drag-handle") || event.target.closest("input") || event.target.closest(".block-collapse-btn")) {
          return;
        }
        event.preventDefault();
        toggleCardCollapse(header.closest(".tca-block-card"));
      });
    });

    html.querySelectorAll(".behavior-effect-drop").forEach(zone => {
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

    html.querySelectorAll('[data-action="removeBehaviorEffect"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.onRemoveBehaviorEffect(sheet, Number(btn.dataset.behaviorIndex), Number(btn.dataset.effectIndex));
      });
    });

    html.querySelectorAll('[data-action="openBehaviorEffectDoc"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.onOpenBehaviorEffect(btn.dataset.uuid);
      });
    });

    this._attachDragAndDrop(html, sheet);
  }

  /**
   * Toggle a constraint drawer on a behavior card, clearing its data if closing an active constraint.
   */
  static async onToggleConstraint(sheet, blockId, index, constraint) {
    sheet._expandedConstraints = sheet._expandedConstraints || {};
    const idxKey = `idx_${index}`;
    if (!sheet._expandedConstraints[blockId]) sheet._expandedConstraints[blockId] = new Set();
    if (!sheet._expandedConstraints[idxKey]) sheet._expandedConstraints[idxKey] = new Set();
    const openSet = sheet._expandedConstraints[blockId];
    const openIdxSet = sheet._expandedConstraints[idxKey];

    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    const block = behaviors[index];
    if (!block) return;

    const isCurrentlyActive =
      (constraint === "condition" && Boolean(block.condition?.trim())) ||
      (constraint === "chain" && Boolean(block.gatedBy)) ||
      (constraint === "cooldown" && Boolean(block.cooldown?.uses)) ||
      (constraint === "cost" && Boolean(block.cost && (block.cost.actionPoints || block.cost.focus || block.cost.reaction))) ||
      (constraint === "prompt" && Boolean(block.requiresConfirmation || block.promptText || block.choiceGroup || block.choiceLabel));

    if (isCurrentlyActive) {
      openSet.delete(constraint);
      openIdxSet.delete(constraint);
      if (constraint === "condition") block.condition = "";
      if (constraint === "chain") block.gatedBy = "";
      if (constraint === "cooldown") block.cooldown = null;
      if (constraint === "cost") block.cost = null;
      if (constraint === "prompt") {
        block.requiresConfirmation = false;
        block.promptText = "";
        block.choiceGroup = "";
        block.choiceLabel = "";
      }
      await sheet.document.update({ "system.behaviors": behaviors });
    } else {
      if (openSet.has(constraint) || openIdxSet.has(constraint)) {
        openSet.delete(constraint);
        openIdxSet.delete(constraint);
      } else {
        openSet.add(constraint);
        openIdxSet.add(constraint);
      }
      sheet.render();
    }
  }

  static _attachDragAndDrop(html, sheet) {
    const cards = html.querySelectorAll(".tca-block-card");
    let draggedIndex = null;

    cards.forEach(card => {
      card.addEventListener("dragstart", (event) => {
        if (!event.target.closest(".drag-handle")) {
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
        if (event.target.closest(".behavior-effect-drop") || event.target.closest(".drop-zone")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over");
      });

      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));

      card.addEventListener("drop", async (event) => {
        if (event.target.closest(".behavior-effect-drop") || event.target.closest(".drop-zone")) return;
        event.preventDefault();
        card.classList.remove("drag-over");
        const targetIndex = Number(card.dataset.blockIndex);
        if (draggedIndex !== null && targetIndex !== null && draggedIndex !== targetIndex) {
          await this.onReorderBlocks(sheet, draggedIndex, targetIndex);
        }
      });
    });
  }

  static async onDropBehaviorEffect(sheet, event) {
    const zone = event.currentTarget.closest(".behavior-effect-drop");
    if (!zone) return;
    const blockIndex = Number(zone.dataset.behaviorIndex);
    if (isNaN(blockIndex)) return;

    let data;
    try {
      data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch {
      try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
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
    const effects = Array.isArray(block.params.effects) ? [...block.params.effects] : [];

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

  static async onRemoveBehaviorEffect(sheet, blockIndex, effectIndex) {
    if (isNaN(blockIndex) || isNaN(effectIndex)) return;
    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    if (!behaviors[blockIndex]) return;

    const block = behaviors[blockIndex];
    block.params = block.params || {};
    const effects = Array.isArray(block.params.effects) ? [...block.params.effects] : [];
    if (effectIndex < 0 || effectIndex >= effects.length) return;

    effects.splice(effectIndex, 1);
    block.params.effects = effects;
    block.params.stateName = effects[0]?.name || "";
    block.params.stateId = effects[0]?.uuid || "";
    block.params.intensity = effects[0]?.intensity ?? "1";

    await sheet.document.update({ "system.behaviors": behaviors });
  }

  static async onOpenBehaviorEffect(uuid) {
    if (!uuid) return;
    const item = await resolveItem(uuid, { type: "effect" });
    if (item?.sheet) item.sheet.render(true);
  }

  static async onAddBlock(sheet) {
    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    behaviors.push({
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
    });
    await sheet.document.update({ "system.behaviors": behaviors });
  }

  static async onDuplicateBlock(sheet, index) {
    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    if (index < 0 || index >= behaviors.length) return;
    const clone = foundry.utils.deepClone(behaviors[index]);
    clone.id = foundry.utils?.randomID?.(8) || Math.random().toString(36).substring(2, 10);
    if (clone.label) clone.label = `${clone.label} (Copy)`;
    behaviors.splice(index + 1, 0, clone);
    await sheet.document.update({ "system.behaviors": behaviors });
  }

  static async onDeleteBlock(sheet, index) {
    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    if (index >= 0 && index < behaviors.length) {
      const removed = behaviors[index];
      if (removed?.id && sheet._collapsedBlocks) sheet._collapsedBlocks.delete(removed.id);
      if (sheet._collapsedBlocks) sheet._collapsedBlocks.delete(`idx_${index}`);
      behaviors.splice(index, 1);
      await sheet.document.update({ "system.behaviors": behaviors });
    }
  }

  static async onReorderBlocks(sheet, fromIndex, toIndex) {
    const behaviors = foundry.utils.deepClone(sheet.document.system.behaviors || []);
    if (fromIndex < 0 || fromIndex >= behaviors.length || toIndex < 0 || toIndex >= behaviors.length) return;
    const [moved] = behaviors.splice(fromIndex, 1);
    behaviors.splice(toIndex, 0, moved);
    await sheet.document.update({ "system.behaviors": behaviors });
  }
}
