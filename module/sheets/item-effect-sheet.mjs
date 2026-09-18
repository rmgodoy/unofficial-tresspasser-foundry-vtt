import { TrespasserItemSheet } from "./base-sheet.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { resolveItem } from "../helpers/item-resolver.mjs";
import { getInterceptionModesForTrigger } from "../reactions/middleware-interception.mjs";

/**
 * Item sheet for Trespasser Effect items.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserEffectSheet extends TrespasserItemSheet {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "effect-sheet"],
    position: { width: 520, height: 600 },
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
    
    if (!system.durationConditions) system.durationConditions = [];

    // Map default status effects.
    // Object.values handles both the v13 array and v14 object formats
    const statusEffects = Object.values(CONFIG.statusEffects)
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

    // Check if system.statusIcon is a custom file path (not among default statusEffects)
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

    // Dynamic flags for contextual UI
    const isDamageInterception = ["redirect_damage", "reduce_damage"].includes(system.interceptionMode);
    const isCustomRange = !system.rangeType || system.rangeType === "custom";
    const isNumberLimit = system.targetLimit === "number" || (!["all"].includes(system.targetLimit) && Number(system.targetLimit) > 0);
    const targetLimitChoice = isNumberLimit ? "number" : "all";
    const targetLimitCount = system.targetLimitCount ?? (Number(system.targetLimit) || 1);
    const showTargetAttribute = system.type !== "movement" && !system.isOnlyReminder && (system.type === "continuous" || system.interceptionMode === "none" || system.interceptionMode === "modify_amount");

    context.isDamageInterception = isDamageInterception;
    context.isCustomRange = isCustomRange;
    context.isNumberLimit = isNumberLimit;
    context.targetLimitChoice = targetLimitChoice;
    context.targetLimitCount = targetLimitCount;
    context.showTargetAttribute = showTargetAttribute;
    context.modifierLabel = isDamageInterception
      ? "TRESPASSER.Sheet.Item.Details.InterceptionCapacity"
      : "TRESPASSER.Sheet.Common.Modifier";

    // Add constants for the sheet
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
      interceptionModes: this._getContextualInterceptionModes(system.when),
      statusEffects
    };

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

    // Drag-and-drop
    const dropZones = html.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
      zone.addEventListener("dragover", this._onDragOver.bind(this));
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });

    // Remove buttons
    html.querySelectorAll('.counter-state-remove').forEach(btn => {
      btn.addEventListener('click', this._onRemoveCounterState.bind(this));
    });

    // Edit buttons
    html.querySelectorAll('.effect-edit').forEach(btn => {
      btn.addEventListener('click', this._onEditCounterState.bind(this));
    });

    // --- Compound Duration ---
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
    
    // Validate types: Only effects can be counter states
    if (sourceItem.type !== "effect") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.DropEffectsOnly"));
      return;
    }

    const currentArray = this.document.system.counterStates ? [...this.document.system.counterStates] : [];

    // Avoid self-reference and duplicates
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
    const currentArray = [...this.document.system.counterStates];
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
    const row    = event.currentTarget.closest('.duration-condition-row');
    const mode   = event.currentTarget.value;
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
   * Manual form submission handler for AppV2.
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

