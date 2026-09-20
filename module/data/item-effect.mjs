import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Data model for Trespasser Effect items.
 */
export class TrespasserEffectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField(),
      type: new fields.StringField({
        initial: "continuous",
        choices: ["on-trigger", "continuous", "movement"]
      }),
      movementType: new fields.StringField({
        initial: "walk",
        choices: ["walk", "teleport", "jump"]
      }),
      isCombat: new fields.BooleanField({ initial: false }),
      isOnlyReminder: new fields.BooleanField({ initial: false }),
      gmOnly: new fields.BooleanField({ initial: false }),
      intensity: new fields.NumberField({ initial: 0, integer: true }),
      targetAttribute: new fields.StringField({
        initial: "health",
        choices: TrespasserEffectsHelper.TARGET_ATTRIBUTES
      }),
      modifier: new fields.StringField({ initial: "0" }),
      conferredState: new fields.StringField({ initial: "" }),
      when: new fields.StringField({
        initial: "immediate",
        choices: Object.values(TrespasserEffectsHelper.TRIGGER_WHEN),
        blank: true
      }),
      // --- Cross-Actor & Reactive Scope (new) ---
      scope: new fields.StringField({
        initial: "self",
        choices: ["self", "ally", "enemy", "all"]
      }),
      targetLimit: new fields.StringField({
        initial: "all",
        choices: ["all", "number"]
      }),
      targetLimitCount: new fields.NumberField({
        initial: 1,
        integer: true,
        min: 1
      }),
      rangeType: new fields.StringField({
        initial: "custom",
        choices: ["custom", "melee", "missile", "spell", "throw"]
      }),
      rangeRequirement: new fields.NumberField({
        initial: 0,
        integer: true,
        min: 0
      }),
      interceptionMode: new fields.StringField({
        initial: "none",
        choices: [
          "none",
          "redirect_damage",
          "reduce_damage",
          "cancel_action",
          "modify_amount",
          "grant_advantage",
          "grant_disadvantage",
          "custom"
        ]
      }),
      // --- Legacy flat duration fields (kept for backward compat; deprecated) ---
      duration: new fields.StringField({
        initial: "indefinite",
        choices: Object.values(TrespasserEffectsHelper.DURATION_MODES)
      }),
      durationValue: new fields.NumberField({ initial: 0, integer: true }),
      // --- Compound duration (new) ---
      durationOperator: new fields.StringField({
        initial: "OR",
        choices: ["OR", "AND"]
      }),
      durationConditions: new fields.ArrayField(
        new fields.ObjectField(),
        { initial: [] }
      ),
      intensityIncrement: new fields.NumberField({ initial: 0, integer: true }),
      counterStates: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
      isPrevailable: new fields.BooleanField({ initial: true }),
      isLasting: new fields.BooleanField({ initial: false }),
      statusIcon: new fields.StringField({ initial: "", blank: true }),
      syncStatusIcon: new fields.BooleanField({ initial: true }),
      // --- TCA Behavior Blocks (new) ---
      behaviors: new fields.ArrayField(
        new fields.SchemaField({
          id: new fields.StringField({ initial: "" }),
          label: new fields.StringField({ initial: "" }),
          trigger: new fields.StringField({ initial: "continuous" }),
          condition: new fields.StringField({ initial: "" }),
          action: new fields.StringField({
            initial: "modify_attribute",
            choices: [
              "modify_attribute",
              "confer_state",
              "remove_state",
              "modify_intensity",
              "set_flag",
              "force_movement",
              "roll_check",
              "grant_reaction",
              "redirect_damage",
              "chat_message"
            ]
          }),
          params: new fields.ObjectField({ initial: {} }),
          actionTarget: new fields.StringField({ initial: "self", choices: ["self", "target"] }),
          scope: new fields.StringField({ initial: "", blank: true }),
          rangeType: new fields.StringField({ initial: "", blank: true }),
          range: new fields.NumberField({ initial: 0, nullable: true }),
          priority: new fields.NumberField({ initial: null, nullable: true }),
          requiresConfirmation: new fields.BooleanField({ initial: false }),
          promptText: new fields.StringField({ initial: "", blank: true }),
          choiceGroup: new fields.StringField({ initial: "", blank: true }),
          choiceLabel: new fields.StringField({ initial: "", blank: true }),
          gatedBy: new fields.StringField({ initial: "", blank: true }),
          cooldown: new fields.ObjectField({ initial: null, nullable: true }),
          cost: new fields.ObjectField({ initial: null, nullable: true })
        }),
        { initial: [] }
      ),
      // --- Tags for grouping/mutual exclusivity (new) ---
      tags: new fields.ArrayField(
        new fields.StringField(),
        { initial: [] }
      ),
      // --- Effect-level priority override (new) ---
      effectPriority: new fields.NumberField({ initial: null, nullable: true })
    };
  }

  /**
   * Migrate legacy flat effect definitions to TCA behavior blocks.
   * @param {object} source - The raw source data.
   * @returns {object} The migrated source data.
   */
  static migrateData(source) {
    super.migrateData(source);
    if (source.behaviors && Array.isArray(source.behaviors) && source.behaviors.length > 0) {
      return source;
    }

    // Guard: If this is a partial update delta that doesn't touch any behavior-defining fields,
    // do not synthesize default behaviors.
    const hasBehaviorFields = [
      "when", "modifier", "targetAttribute", "type",
      "isOnlyReminder", "interceptionMode", "movementType",
      "conferredState", "intensityIncrement"
    ].some(k => k in source);

    if (!hasBehaviorFields) {
      return source;
    }

    const behaviors = [];
    const randomID = (size = 8) => foundry.utils?.randomID?.(size) || Math.random().toString(36).substring(2, 2 + size);

    if (source.isOnlyReminder) {
      behaviors.push({
        id: randomID(8),
        trigger: source.when || "continuous",
        action: "chat_message",
        params: { message: source.description || "", gmOnly: Boolean(source.gmOnly) }
      });
    } else if (source.type === "movement") {
      const primaryId = randomID(8);
      const condition = source.movementType ? `event.data.movementType === '${source.movementType}'` : "";
      behaviors.push({
        id: primaryId,
        trigger: "on-move",
        condition,
        action: "modify_attribute",
        params: { attribute: source.targetAttribute || "health", modifier: source.modifier || "0" }
      });

      if (source.intensityIncrement && source.intensityIncrement !== 0) {
        behaviors.push({
          id: randomID(8),
          trigger: "on-move",
          action: "modify_intensity",
          params: { value: source.intensityIncrement > 0 ? `+${source.intensityIncrement}` : `${source.intensityIncrement}` },
          gatedBy: primaryId
        });
      }
      if (source.conferredState) {
        behaviors.push({
          id: randomID(8),
          trigger: "on-move",
          action: "confer_state",
          params: { stateName: source.conferredState }
        });
      }
    } else if (source.interceptionMode && source.interceptionMode !== "none") {
      const primaryId = randomID(8);
      const trigger = source.when || "damage-received";
      const scope = source.scope || "ally";
      const rangeType = source.rangeType || "custom";
      const range = source.rangeRequirement ?? 0;

      let action = "redirect_damage";
      let params = {};
      let requiresConfirmation = false;

      switch (source.interceptionMode) {
        case "redirect_damage":
          action = "redirect_damage";
          params = { capacity: String(source.modifier || source.intensity || "0"), mode: "redirect" };
          requiresConfirmation = true;
          break;
        case "reduce_damage":
          action = "redirect_damage";
          params = { capacity: String(source.modifier || source.intensity || "0"), mode: "reduce" };
          requiresConfirmation = true;
          break;
        case "cancel_action":
          action = "set_flag";
          params = { flag: "preventDefault", value: true };
          break;
        case "modify_amount":
          action = "modify_attribute";
          params = { attribute: "event_amount", modifier: source.modifier || "0" };
          break;
        case "grant_advantage":
          action = "set_flag";
          params = { flag: "hasAdvantage", value: true };
          break;
        case "grant_disadvantage":
          action = "set_flag";
          params = { flag: "hasDisadvantage", value: true };
          break;
        default:
          action = "modify_attribute";
          params = { attribute: source.targetAttribute || "health", modifier: source.modifier || "0" };
          break;
      }

      behaviors.push({
        id: primaryId,
        trigger,
        action,
        params,
        scope,
        rangeType,
        range,
        requiresConfirmation
      });

      if (source.intensityIncrement && source.intensityIncrement !== 0) {
        behaviors.push({
          id: randomID(8),
          trigger,
          action: "modify_intensity",
          params: { value: source.intensityIncrement > 0 ? `+${source.intensityIncrement}` : `${source.intensityIncrement}` },
          gatedBy: primaryId
        });
      }
      if (source.conferredState) {
        behaviors.push({
          id: randomID(8),
          trigger,
          action: "confer_state",
          params: { stateName: source.conferredState }
        });
      }
    } else {
      const primaryId = randomID(8);
      const trigger = (source.when && source.when !== "immediate") ? source.when : (source.type === "continuous" ? "continuous" : "immediate");

      behaviors.push({
        id: primaryId,
        trigger,
        action: "modify_attribute",
        params: { attribute: source.targetAttribute || "health", modifier: source.modifier || "0" }
      });

      if (source.intensityIncrement && source.intensityIncrement !== 0) {
        behaviors.push({
          id: randomID(8),
          trigger,
          action: "modify_intensity",
          params: { value: source.intensityIncrement > 0 ? `+${source.intensityIncrement}` : `${source.intensityIncrement}` },
          gatedBy: primaryId
        });
      }
      if (source.conferredState) {
        behaviors.push({
          id: randomID(8),
          trigger,
          action: "confer_state",
          params: { stateName: source.conferredState }
        });
      }
    }

    if (behaviors.length > 0) {
      source.behaviors = behaviors;
    }
    return source;
  }

  /** @override */
  async _preUpdate(changes, options, user) {
    const res = await super._preUpdate(changes, options, user);
    if (res === false) return false;

    console.log("%c[ItemEffectData | _preUpdate]%c", "color: #e5c07b; font-weight: bold;", "color: inherit;", {
      itemId: this.parent?.id,
      name: this.parent?.name,
      actor: this.parent?.parent?.name,
      changes: foundry.utils.deepClone(changes),
      currentBehaviors: foundry.utils.deepClone(this.behaviors || [])
    });

    const hasBehaviors = foundry.utils.hasProperty(changes, "system.behaviors") ||
      foundry.utils.hasProperty(changes, "behaviors") ||
      (changes.system && "behaviors" in changes.system) ||
      ("behaviors" in changes) ||
      Object.keys(changes).some(k => k.startsWith("system.behaviors.") || k.startsWith("behaviors."));

    // If source in database has no behaviors yet, persist current in-memory behaviors
    if (!hasBehaviors && !this._source?.behaviors?.length && Array.isArray(this.behaviors) && this.behaviors.length > 0) {
      if (changes.system && typeof changes.system === "object") {
        changes.system.behaviors = foundry.utils.deepClone(this.behaviors);
        delete changes["system.behaviors"];
      } else {
        changes["system.behaviors"] = foundry.utils.deepClone(this.behaviors);
      }
      console.log("%c[ItemEffectData | _preUpdate]%c Injected in-memory behaviors into changes for DB persistence:", "color: #61afef; font-weight: bold;", "color: inherit;", this.behaviors);
    }
    return true;
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
    this._ensureBehaviors();
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    this._ensureBehaviors();
  }

  /**
   * Ensure behaviors are initialized during data preparation.
   * Only populates the in-memory behaviors array — persistence to the database
   * is handled by the preUpdateItem hook and _preUpdate lifecycle method.
   * @private
   */
  _ensureBehaviors() {
    const hadBehaviorsBefore = Boolean(this.behaviors && this.behaviors.length > 0);
    if (!this.behaviors || this.behaviors.length === 0) {
      if (this._source?.behaviors?.length > 0) {
        if (Array.isArray(this.behaviors)) {
          this.behaviors.length = 0;
          this.behaviors.push(...foundry.utils.deepClone(this._source.behaviors));
        } else {
          this.behaviors = foundry.utils.deepClone(this._source.behaviors);
        }
      } else {
        const sourceCopy = foundry.utils.deepClone(this._source || {});
        delete sourceCopy.behaviors;
        const migrated = TrespasserEffectData.migrateData(sourceCopy);
        if (migrated.behaviors && migrated.behaviors.length > 0) {
          if (Array.isArray(this.behaviors)) {
            this.behaviors.length = 0;
            this.behaviors.push(...migrated.behaviors);
          } else {
            this.behaviors = migrated.behaviors;
          }
        }
      }
    }
    for (const behavior of this.behaviors || []) {
      if (!behavior.id) {
        behavior.id = foundry.utils.randomID(8);
      }
    }
    if (!hadBehaviorsBefore && this.behaviors?.length > 0) {
      console.log("%c[ItemEffectData | _ensureBehaviors]%c Populated behaviors for effect:", "color: #98c379;", "color: inherit;", this.parent?.name || "unnamed", this.behaviors);
    }
  }
}
