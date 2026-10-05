import { TrespasserItemSheet } from "./base-sheet.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { resolveItem } from "../helpers/item-resolver.mjs";
import { getInterceptionModesForTrigger } from "../reactions/middleware-interception.mjs";
import { EFFECT_TEMPLATES, applyTemplate } from "./effect/tca-templates.mjs";
import { summarizeBlock, getActionIcon } from "./effect/tca-summary.mjs";
import { TCABlockEditor } from "./effect/tca-block-editor.mjs";
import { getDefaultParamsForAction } from "./effect/tca-param-editors.mjs";


/**
 * Item sheet for Trespasser Effect items.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2) with Two-Mode TCA Behavior editing.
 */
export class TrespasserEffectSheet extends TrespasserItemSheet {

  /** @type {boolean} Toggle state for Simple vs Advanced TCA editor mode */
  _advancedMode = false;

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "effect-sheet"],
    position: { width: 540, height: 640 },
    form: { 
      handler: TrespasserEffectSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false 
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/effect-sheet.hbs",
      scrollable: [".scrollable", ".sheet-content", "[data-scrollable='true']"]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    context.editable = this.isEditable;
    context.advancedMode = this._advancedMode;
    
    if (!system.durationConditions) system.durationConditions = [];

    // Map default status effects
    const statusEffects = Object.values(CONFIG.statusEffects || {})
      .map(effect => {
        const id = effect.id;
        const img = effect.img || effect.icon || effect.src || "";
        const name = effect.name || effect.label || id || "";
        const localizedName = game.i18n.localize(name);
        return { id, img, name: localizedName };
      })
      .filter(e => e.id && e.img)
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Check sync status and effective status icon
    const syncStatusIcon = system.syncStatusIcon !== false;
    const effectiveStatusIcon = syncStatusIcon ? (item.img || "") : (system.statusIcon || "");

    // Check if system.statusIcon is a custom file path
    const isDefaultStatus = statusEffects.some(se => se.img === system.statusIcon);
    const isCustomStatus = Boolean(system.statusIcon && !isDefaultStatus && !syncStatusIcon);
    let customStatusLabel = "";
    if (isCustomStatus) {
      const parts = system.statusIcon.split("/");
      customStatusLabel = decodeURIComponent(parts[parts.length - 1] || system.statusIcon);
    }

    context.syncStatusIcon = syncStatusIcon;
    context.effectiveStatusIcon = effectiveStatusIcon;
    context.isCustomStatus = isCustomStatus;
    context.customStatusLabel = customStatusLabel;

    // Config dictionary
    context.config = {
      effectTypes: {
        "on-trigger": "TRESPASSER.Sheet.Item.Details.EffectTypeChoices.OnTrigger",
        "continuous": "TRESPASSER.Sheet.Item.Details.EffectTypeChoices.Continuous",
        "movement": "TRESPASSER.Sheet.Item.Details.EffectTypeChoices.Movement"
      },
      movementTypes: TrespasserEffectsHelper.MOVEMENT_TYPE_LABELS,
      targetAttributes: TrespasserEffectsHelper.TARGET_ATTRIBUTES,
      triggerWhen: TrespasserEffectsHelper.TRIGGER_LABELS,
      durationModes: TrespasserEffectsHelper.DURATION_LABELS,
      scopes: {
        "self": "TRESPASSER.Sheet.Item.Effect.ScopeChoices.Self",
        "ally": "TRESPASSER.Sheet.Item.Effect.ScopeChoices.Ally",
        "enemy": "TRESPASSER.Sheet.Item.Effect.ScopeChoices.Enemy",
        "all": "TRESPASSER.Sheet.Item.Effect.ScopeChoices.All"
      },
      targetLimitChoices: {
        "all": "TRESPASSER.Sheet.Item.Effect.TargetLimitChoices.All",
        "number": "TRESPASSER.Sheet.Item.Effect.TargetLimitChoices.Number"
      },
      rangeTypes: {
        "custom": "TRESPASSER.Sheet.Item.Effect.RangeChoices.Custom",
        "melee": "TRESPASSER.Sheet.Item.Effect.RangeChoices.Melee",
        "missile": "TRESPASSER.Sheet.Item.Effect.RangeChoices.Missile",
        "spell": "TRESPASSER.Sheet.Item.Effect.RangeChoices.Spell",
        "throw": "TRESPASSER.Sheet.Item.Effect.RangeChoices.Throw"
      },
      actionTargetChoices: {
        "self": "TRESPASSER.Sheet.Item.Effect.ActionTargetSelf",
        "target": "TRESPASSER.Sheet.Item.Effect.ActionTargetTarget",
        "adjacent": "TRESPASSER.Sheet.Item.Effect.ActionTargetAdjacent",
        "all_in_range": "TRESPASSER.Sheet.Item.Effect.ActionTargetAllInRange",
        "enemies_in_range": "TRESPASSER.Sheet.Item.Effect.ActionTargetEnemiesInRange",
        "allies_in_range": "TRESPASSER.Sheet.Item.Effect.ActionTargetAlliesInRange"
      },
      actions: {
        "modify_attribute": "TRESPASSER.Sheet.Item.Effect.Action.ModifyAttribute",
        "confer_state": "TRESPASSER.Sheet.Item.Effect.Action.ConferState",
        "remove_state": "TRESPASSER.Sheet.Item.Effect.Action.RemoveState",
        "modify_intensity": "TRESPASSER.Sheet.Item.Effect.Action.ModifyIntensity",
        "set_flag": "TRESPASSER.Sheet.Item.Effect.Action.SetFlag",
        "force_movement": "TRESPASSER.Sheet.Item.Effect.Action.ForceMovement",
        "roll_check": "TRESPASSER.Sheet.Item.Effect.Action.RollCheck",
        "grant_reaction": "TRESPASSER.Sheet.Item.Effect.Action.GrantReaction",
        "redirect_damage": "TRESPASSER.Sheet.Item.Effect.Action.RedirectDamage",
        "chat_message": "TRESPASSER.Sheet.Item.Effect.Action.ChatMessage"
      },
      interceptionModes: this._getContextualInterceptionModes(system.when),
      statusEffects
    };

    // Template picker models
    context.templates = Object.values(EFFECT_TEMPLATES).map(t => ({
      key: t.key,
      label: t.label,
      icon: t.icon,
      description: t.description
    }));

    // Simple Mode summaries
    const behaviors = system.behaviors || [];
    context.summaries = behaviors.map((b, idx) => ({
      index: idx,
      icon: getActionIcon(b.action, b.params),
      text: summarizeBlock(b, system.intensity ?? 0)
    }));

    // Advanced Mode prepared blocks
    context.preparedBlocks = TCABlockEditor.prepareBlocks(behaviors, context.config, system.intensity ?? 0);

    // Tags array
    context.tags = Array.isArray(system.tags) ? system.tags : [];

    // Description HTML
    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      { 
        async: true,
        secrets: item.isOwner,
        relativeTo: item
      }
    );
    
    return context;
  }
  
  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;

    const html = this.element;

    // Toggle Advanced / Simple Mode
    html.querySelectorAll('[data-action="toggleAdvancedMode"]').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        this._advancedMode = !this._advancedMode;
        this.render();
      });
    });

    // Apply Template in Simple Mode
    html.querySelectorAll('[data-action="applyTemplate"]').forEach(btn => {
      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        const templateKey = event.currentTarget.dataset.template;
        const updates = applyTemplate(templateKey, this.document.system);
        if (Object.keys(updates).length > 0) {
          await this.document.update(updates);
        }
      });
    });

    // Switch to Advanced Mode when clicking summary row in Simple Mode
    html.querySelectorAll('.tca-summary-row').forEach(row => {
      row.addEventListener('click', (event) => {
        event.preventDefault();
        this._advancedMode = true;
        this.render();
      });
    });

    // Tags Editor: Add Tag
    const tagInput = html.querySelector('.tag-add-input');
    if (tagInput) {
      tagInput.addEventListener('keydown', async (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const val = tagInput.value.trim().toLowerCase();
          if (val) {
            const tags = Array.isArray(this.document.system.tags) ? [...this.document.system.tags] : [];
            if (!tags.includes(val)) {
              tags.push(val);
              tagInput.value = "";
              await this.document.update({ "system.tags": tags });
            }
          }
        }
      });
    }

    // Tags Editor: Remove Tag
    html.querySelectorAll('[data-action="removeTag"]').forEach(btn => {
      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        const idx = Number(event.currentTarget.dataset.index);
        const tags = Array.isArray(this.document.system.tags) ? [...this.document.system.tags] : [];
        if (idx >= 0 && idx < tags.length) {
          tags.splice(idx, 1);
          await this.document.update({ "system.tags": tags });
        }
      });
    });

    // Delegate TCABlockEditor DOM listeners
    TCABlockEditor.activateListeners(html, this);

    // Toggle sync status icon
    html.querySelectorAll('[data-action="toggleSyncStatusIcon"]').forEach(btn => {
      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const currentlySynced = this.document.system.syncStatusIcon !== false;
        const newSynced = !currentlySynced;
        const updateData = { "system.syncStatusIcon": newSynced };
        if (newSynced) {
          updateData["system.statusIcon"] = this.document.img || "";
        }
        await this.document.update(updateData);
      });
    });

    // Clear status icon
    html.querySelectorAll('[data-action="clearStatusIcon"]').forEach(btn => {
      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.document.update({ 
          "system.statusIcon": "",
          "system.syncStatusIcon": false 
        });
      });
    });

    // Drag-and-drop for counter states
    const dropZones = html.querySelectorAll('.drop-zone[data-type="counterStates"]');
    dropZones.forEach(zone => {
      zone.addEventListener("dragover", this._onDragOver.bind(this));
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });

    // Remove counter states
    html.querySelectorAll('.counter-state-remove').forEach(btn => {
      btn.addEventListener('click', this._onRemoveCounterState.bind(this));
    });

    // Edit counter states
    html.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener('click', this._onEditCounterState.bind(this));
    });

    // Compound Duration conditions
    html.querySelectorAll('.dur-add-condition').forEach(btn => {
      btn.addEventListener('click', this._onAddDurationCondition.bind(this));
    });
    html.querySelectorAll('.dur-remove-condition').forEach(btn => {
      btn.addEventListener('click', this._onRemoveDurationCondition.bind(this));
    });
    html.querySelectorAll('.dur-mode').forEach(select => {
      select.addEventListener('change', this._onDurationModeChange.bind(this));
    });
  }

  _onDragOver(event) {
    event.preventDefault();
    return false;
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data.type !== "Item") return;
    
    const sourceItem = await resolveItem(data);
    if (!sourceItem) return;
    
    if (sourceItem.type !== "effect") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropEffectsOnly"));
      return;
    }

    const currentArray = this.document.system.counterStates ? [...this.document.system.counterStates] : [];

    if (sourceItem.uuid === this.document.uuid) return;
    if (currentArray.some(e => e.uuid === sourceItem.uuid)) {
       ui.notifications.warn(game.i18n.format("TRESPASSER.Notification.Item.AlreadyAdded", { name: sourceItem.name }));
       return;
    }

    currentArray.push({
      uuid: sourceItem.uuid,
      name: sourceItem.name,
      img: sourceItem.img,
      type: sourceItem.type
    });

    await this.document.update({ "system.counterStates": currentArray });
  }

  async _onRemoveCounterState(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const index = Number(el.dataset.index);
    const currentArray = [...(this.document.system.counterStates || [])];
    currentArray.splice(index, 1);
    await this.document.update({ "system.counterStates": currentArray });
  }

  async _onEditCounterState(event) {
    event.preventDefault();
    const el = event.currentTarget.closest('.effect-chip');
    const uuid = el.dataset.uuid;
    const item = await resolveItem(uuid);
    if (item) item.sheet.render(true);
  }

  async _onAddDurationCondition(event) {
    event.preventDefault();
    const conditions = foundry.utils.deepClone(this.document.system.durationConditions ?? []);
    conditions.push({ mode: "indefinite", value: 0 });
    await this.document.update({ "system.durationConditions": conditions });
  }

  async _onRemoveDurationCondition(event) {
    event.preventDefault();
    const idx = Number(event.currentTarget.dataset.index);
    const conditions = foundry.utils.deepClone(this.document.system.durationConditions ?? []);
    conditions.splice(idx, 1);
    await this.document.update({ "system.durationConditions": conditions });
  }

  _onDurationModeChange(event) {
    const row = event.currentTarget.closest('.duration-condition-row');
    const mode = event.currentTarget.value;
    const valInput = row.querySelector('.dur-value');
    if (valInput) {
      const needsVal = mode === "round" || mode === "trigger";
      valInput.style.display = needsVal ? "" : "none";
    }
  }

  /**
   * Return contextual interception mode labels for a trigger.
   * @param {string} when
   * @returns {Record<string, string>}
   */
  _getContextualInterceptionModes(when) {
    const allLabels = {
      "none": "TRESPASSER.Sheet.Item.Effect.InterceptionChoices.None",
      "redirect_damage": "TRESPASSER.Sheet.Item.Effect.InterceptionChoices.RedirectDamage",
      "reduce_damage": "TRESPASSER.Sheet.Item.Effect.InterceptionChoices.ReduceDamage",
      "cancel_action": "TRESPASSER.Sheet.Item.Effect.InterceptionChoices.CancelAction",
      "modify_amount": "TRESPASSER.Sheet.Item.Effect.InterceptionChoices.ModifyAmount",
      "grant_advantage": "TRESPASSER.Sheet.Item.Effect.InterceptionChoices.GrantAdvantage",
      "grant_disadvantage": "TRESPASSER.Sheet.Item.Effect.InterceptionChoices.GrantDisadvantage",
      "custom": "TRESPASSER.Sheet.Item.Effect.InterceptionChoices.Custom"
    };

    const allowedKeys = getInterceptionModesForTrigger(when);
    const result = {};
    for (const key of allowedKeys) {
      if (allLabels[key]) result[key] = allLabels[key];
    }
    return result;
  }

  /**
   * Form submission handler for AppV2.
   */
  static async #onSubmit(event, form, formData) {
    const statusIconVal = formData.object["system.statusIcon"];
    if (statusIconVal === "__sync__") {
      formData.object["system.syncStatusIcon"] = true;
      formData.object["system.statusIcon"] = this.document.img || "";
    } else if (statusIconVal !== undefined) {
      formData.object["system.syncStatusIcon"] = false;
      formData.object["system.statusIcon"] = statusIconVal;
    }

    // Reconstruct system.behaviors array cleanly from formData.object if present
    const expanded = foundry.utils.expandObject(formData.object);
    if (expanded.system?.behaviors !== undefined) {
      const rawBehaviors = expanded.system.behaviors;
      const behaviorsArray = Array.isArray(rawBehaviors)
        ? rawBehaviors
        : (typeof rawBehaviors === "object" && rawBehaviors !== null)
        ? Object.keys(rawBehaviors)
            .filter(k => !isNaN(Number(k)))
            .sort((a, b) => Number(a) - Number(b))
            .map(k => rawBehaviors[k])
        : [];

      for (let i = 0; i < behaviorsArray.length; i++) {
        const b = behaviorsArray[i];
        if (!b.id) {
          b.id = this.document.system.behaviors?.[i]?.id || foundry.utils.randomID(8);
        }
        const prevBlock = this.document.system.behaviors?.[i];
        // If action changed on this block, reset its params to defaults; otherwise ensure defaults are merged
        if (prevBlock && prevBlock.action && b.action && prevBlock.action !== b.action) {
          b.params = getDefaultParamsForAction(b.action);
        } else {
          b.params = foundry.utils.mergeObject(getDefaultParamsForAction(b.action), (b.params && typeof b.params === "object") ? b.params : {});
        }

        if (b.params?.effects) {
          b.params.effects = Array.isArray(b.params.effects)
            ? b.params.effects
            : Object.keys(b.params.effects)
                .filter(k => !isNaN(Number(k)))
                .sort((a, b) => Number(a) - Number(b))
                .map(k => b.params.effects[k]);
        }

        b.requiresConfirmation = Boolean(b.requiresConfirmation);
        if (b.cost) {
          const ap = Number(b.cost.actionPoints) || 0;
          const focus = Number(b.cost.focus) || 0;
          const reaction = Boolean(b.cost.reaction);
          b.cost = (ap > 0 || focus > 0 || reaction) ? { actionPoints: ap, focus, reaction } : null;
        }
        if (b.cooldown) {
          const uses = Number(b.cooldown.uses) || 0;
          b.cooldown = uses > 0 ? { uses, per: b.cooldown.per || "round" } : null;
        }
        if (b.priority !== null && b.priority !== undefined && b.priority !== "") {
          b.priority = isNaN(Number(b.priority)) ? null : Number(b.priority);
        } else {
          b.priority = null;
        }
      }

      // Remove raw dotted behavior keys from formData.object so they don't corrupt the array
      for (const key of Object.keys(formData.object)) {
        if (key.startsWith("system.behaviors.") || key.startsWith("system.behaviors[")) {
          delete formData.object[key];
        }
      }
      formData.object["system.behaviors"] = behaviorsArray;
    }

    // Sanitize interceptionMode if trigger changed
    const newWhen = formData.object["system.when"] ?? this.document.system.when;
    const allowed = getInterceptionModesForTrigger(newWhen);
    const submittedMode = formData.object["system.interceptionMode"] ?? this.document.system.interceptionMode;
    if (submittedMode && !allowed.includes(submittedMode)) {
      formData.object["system.interceptionMode"] = "none";
    }

    await this.document.update(formData.object);
  }
}
