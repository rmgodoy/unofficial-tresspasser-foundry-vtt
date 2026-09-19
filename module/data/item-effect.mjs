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

  prepareDerivedData() {
    super.prepareDerivedData();
    for (const behavior of this.behaviors || []) {
      if (!behavior.id) {
        behavior.id = foundry.utils.randomID(8);
      }
    }
  }
}
