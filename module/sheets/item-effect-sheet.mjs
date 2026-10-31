import { TrespasserItemSheet } from "./base-sheet.mjs";
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { resolveItem } from "../helpers/item-resolver.mjs";
import { getInterceptionModesForTrigger } from "../reactions/middleware-interception.mjs";
import { EFFECT_TEMPLATES, applyTemplate } from "./effect/tca-templates.mjs";
import { summarizeBlock, getActionIcon } from "./effect/tca-summary.mjs";
import { TCABlockEditor } from "./effect/tca-block-editor.mjs";
import { getDefaultParamsForAction } from "./effect/tca-param-editors.mjs";

/**
 * Item sheet for Trespasser Effect items (ApplicationV2).
 */
export class TrespasserEffectSheet extends TrespasserItemSheet {
  _advancedMode = false;
  _showPresetsDrawer = false;
  _expandedConstraints = {};
  _collapsedBlocks = new Set();

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "effect-sheet", "item-sheet"],
    position: { width: 580, height: 660 },
    actions: { switchTab: TrespasserEffectSheet.#onSwitchTab },
    form: {
      handler: TrespasserEffectSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true }
  };

  static PARTS = {
    header: { template: "systems/trespasser/templates/item/effect/header.hbs" },
    tabs: { template: "systems/trespasser/templates/item/effect/tabs.hbs" },
    mechanics: {
      template: "systems/trespasser/templates/item/effect/mechanics.hbs",
      scrollable: ["", ".effect-mechanics-body"]
    },
    details: {
      template: "systems/trespasser/templates/item/effect/details.hbs",
      scrollable: ["", ".effect-details-body"]
    }
  };

  static TABS = {
    mechanics: { id: "mechanics", group: "primary", label: "TRESPASSER.Sheet.Item.Effect.TabMechanics", icon: "bolt" },
    details:   { id: "details",   group: "primary", label: "TRESPASSER.Sheet.Item.Effect.TabDescription", icon: "scroll" }
  };

  tabGroups = { primary: "mechanics" };

  _prepareTabs() {
    return Object.values(this._getTabs());
  }

  _getTabs() {
    const tabs = {};
    for (const [id, config] of Object.entries(this.constructor.TABS)) {
      tabs[id] = {
        ...config,
        active: this.tabGroups[config.group] === id,
        cssClass: this.tabGroups[config.group] === id ? "active" : "",
        label: game.i18n.localize(config.label)
      };
    }
    return tabs;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    context.partId = `${this.id}-${partId}`;
    context.tab = context.tabs?.[partId] ?? { active: partId === this.tabGroups.primary };
    return context;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    context.editable = this.isEditable;
    context.advancedMode = this._advancedMode;
    context.showPresetsDrawer = this._showPresetsDrawer;
    context.tabs = this._getTabs();

    if (!system.durationConditions) system.durationConditions = [];

    const statusEffects = Object.values(CONFIG.statusEffects || {})
      .map(effect => {
        const id = effect.id;
        const img = effect.img || effect.icon || effect.src || "";
        const name = effect.name || effect.label || id || "";
        return { id, img, name: game.i18n.localize(name) };
      })
      .filter(e => e.id && e.img)
      .sort((a, b) => a.name.localeCompare(b.name));

    const syncStatusIcon = system.syncStatusIcon !== false;
    const effectiveStatusIcon = syncStatusIcon ? (item.img || "") : (system.statusIcon || "");
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

    context.templates = Object.values(EFFECT_TEMPLATES).map(t => ({
      key: t.key, label: t.label, icon: t.icon, description: t.description
    }));

    const behaviors = system.behaviors || [];
    context.summaries = behaviors.map((b, idx) => ({
      index: idx,
      icon: getActionIcon(b.action, b.params),
      text: summarizeBlock(b, system.intensity ?? 0)
    }));

    context.preparedBlocks = TCABlockEditor.prepareBlocks(
      behaviors,
      context.config,
      system.intensity ?? 0,
      this._expandedConstraints,
      this._collapsedBlocks
    );

    context.tags = Array.isArray(system.tags) ? system.tags : [];
    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description ?? "",
      { async: true, secrets: item.isOwner, relativeTo: item }
    );

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    html.addEventListener("change", (ev) => {
      const pm = ev.target.closest("prose-mirror");
      if (pm) {
        ev.stopPropagation();
        ev.preventDefault();
        setTimeout(() => {
          if (this.element && this.document) this.document.update({ "system.description": pm.value });
        }, 0);
      }
    }, true);

    if (!this.isEditable) return;

    html.querySelectorAll(".select-on-focus").forEach(input => {
      input.addEventListener("focus", (ev) => ev.currentTarget.select());
    });

    html.querySelectorAll('[data-action="toggleEffectProp"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const prop = btn.dataset.prop;
        if (!prop) return;
        const currentVal = Boolean(foundry.utils.getProperty(this.document, prop));
        await this.document.update({ [prop]: !currentVal });
      });
    });

    html.querySelectorAll('[data-action="setScope"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const scope = btn.dataset.scope;
        if (scope && scope !== this.document.system.scope) {
          await this.document.update({ "system.scope": scope });
        }
      });
    });

    html.querySelectorAll('[data-action="togglePresetsDrawer"]').forEach(btn => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        this._showPresetsDrawer = !this._showPresetsDrawer;
        this.render();
      });
    });

    html.querySelectorAll('[data-action="toggleAdvancedMode"]').forEach(btn => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        this._advancedMode = !this._advancedMode;
        this.render();
      });
    });

    html.querySelectorAll('[data-action="applyTemplate"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const templateKey = event.currentTarget.dataset.template;
        this._showPresetsDrawer = false;
        const updates = applyTemplate(templateKey, this.document.system);
        if (Object.keys(updates).length > 0) await this.document.update(updates);
      });
    });

    TCABlockEditor.activateListeners(html, this);

    html.querySelectorAll('[data-action="toggleSyncStatusIcon"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const newSynced = !(this.document.system.syncStatusIcon !== false);
        const updateData = { "system.syncStatusIcon": newSynced };
        if (newSynced) updateData["system.statusIcon"] = this.document.img || "";
        await this.document.update(updateData);
      });
    });

    html.querySelectorAll('[data-action="clearStatusIcon"]').forEach(btn => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.document.update({ "system.statusIcon": "", "system.syncStatusIcon": false });
      });
    });

    html.querySelectorAll('.drop-zone[data-type="counterStates"]').forEach(zone => {
      zone.addEventListener("dragover", this._onDragOver.bind(this));
      zone.addEventListener("drop", this._onDropItem.bind(this));
    });

    html.querySelectorAll(".counter-state-remove").forEach(btn => {
      btn.addEventListener("click", this._onRemoveCounterState.bind(this));
    });
    html.querySelectorAll(".effect-edit").forEach(btn => {
      btn.addEventListener("click", this._onEditCounterState.bind(this));
    });

    html.querySelectorAll(".dur-add-condition").forEach(btn => {
      btn.addEventListener("click", this._onAddDurationCondition.bind(this));
    });
    html.querySelectorAll(".dur-remove-condition").forEach(btn => {
      btn.addEventListener("click", this._onRemoveDurationCondition.bind(this));
    });
    html.querySelectorAll(".dur-mode").forEach(select => {
      select.addEventListener("change", this._onDurationModeChange.bind(this));
    });
  }

  static #onSwitchTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (tab && this.constructor.TABS[tab]) {
      this.tabGroups.primary = tab;
      this.render();
    }
  }

  _onDragOver(event) {
    event.preventDefault();
    return false;
  }

  async _onDropItem(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Item") return;

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

    currentArray.push({ uuid: sourceItem.uuid, name: sourceItem.name, img: sourceItem.img, type: sourceItem.type });
    await this.document.update({ "system.counterStates": currentArray });
  }

  async _onRemoveCounterState(event) {
    event.preventDefault();
    const el = event.currentTarget.closest(".effect-chip");
    const index = Number(el.dataset.index);
    const currentArray = [...(this.document.system.counterStates || [])];
    currentArray.splice(index, 1);
    await this.document.update({ "system.counterStates": currentArray });
  }

  async _onEditCounterState(event) {
    event.preventDefault();
    const el = event.currentTarget.closest(".effect-chip");
    const uuid = el?.dataset?.uuid;
    if (!uuid) return;
    const item = await resolveItem(uuid);
    if (item) item.sheet.render(true);
  }

  async _onAddDurationCondition(event) {
    event.preventDefault();
    const conditions = foundry.utils.deepClone(this.document.system.durationConditions ?? []);
    if (conditions.length === 0) conditions.push({ mode: "indefinite", value: 0 });
    conditions.push({ mode: "round", value: 1 });
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
    const row = event.currentTarget.closest(".duration-condition-row");
    const mode = event.currentTarget.value;
    const valInput = row?.querySelector(".dur-value");
    if (valInput) valInput.classList.toggle("hidden", !(mode === "round" || mode === "trigger"));
  }

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

  static async #onSubmit(event, form, formData) {
    const statusIconVal = formData.object["system.statusIcon"];
    if (statusIconVal === "__sync__") {
      formData.object["system.syncStatusIcon"] = true;
      formData.object["system.statusIcon"] = this.document.img || "";
    } else if (statusIconVal !== undefined) {
      formData.object["system.syncStatusIcon"] = false;
      formData.object["system.statusIcon"] = statusIconVal;
    }

    const expanded = foundry.utils.expandObject(formData.object);
    if (expanded.system?.behaviors !== undefined) {
      const rawBehaviors = expanded.system.behaviors;
      const submittedArray = Array.isArray(rawBehaviors)
        ? rawBehaviors
        : (typeof rawBehaviors === "object" && rawBehaviors !== null)
        ? Object.keys(rawBehaviors).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b)).map(k => rawBehaviors[k])
        : [];

      const behaviorsArray = [];
      for (let i = 0; i < submittedArray.length; i++) {
        const prevBlock = foundry.utils.deepClone(this.document.system.behaviors?.[i] || {});
        const submitted = submittedArray[i] || {};
        const b = foundry.utils.mergeObject(prevBlock, submitted, { inplace: false });
        if (!b.id) b.id = prevBlock.id || foundry.utils.randomID(8);

        if (prevBlock.action && b.action && prevBlock.action !== b.action) {
          b.params = getDefaultParamsForAction(b.action);
        } else {
          const mergedParams = foundry.utils.mergeObject(
            foundry.utils.deepClone(prevBlock.params || {}),
            (submitted.params && typeof submitted.params === "object") ? submitted.params : {},
            { inplace: false }
          );
          b.params = foundry.utils.mergeObject(getDefaultParamsForAction(b.action), mergedParams, { inplace: false });
        }

        if (b.params?.effects) {
          b.params.effects = Array.isArray(b.params.effects)
            ? b.params.effects
            : Object.keys(b.params.effects).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b)).map(k => b.params.effects[k]);
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
        b.priority = (b.priority !== null && b.priority !== undefined && b.priority !== "" && !isNaN(Number(b.priority)))
          ? Number(b.priority)
          : null;

        behaviorsArray.push(b);
      }

      for (const key of Object.keys(formData.object)) {
        if (key.startsWith("system.behaviors.") || key.startsWith("system.behaviors[")) {
          delete formData.object[key];
        }
      }
      formData.object["system.behaviors"] = behaviorsArray;
    }

    const newWhen = formData.object["system.when"] ?? this.document.system.when;
    const allowed = getInterceptionModesForTrigger(newWhen);
    const submittedMode = formData.object["system.interceptionMode"] ?? this.document.system.interceptionMode;
    if (submittedMode && !allowed.includes(submittedMode)) {
      formData.object["system.interceptionMode"] = "none";
    }

    await this.document.update(formData.object);
  }
}
