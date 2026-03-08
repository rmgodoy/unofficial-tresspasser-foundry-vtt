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
        choices: ["on-trigger", "continuous"]
      }),
      isCombat: new fields.BooleanField({ initial: false }),
      isOnlyReminder: new fields.BooleanField({ initial: false }),
      gmOnly: new fields.BooleanField({ initial: false }),
      intensity: new fields.NumberField({ initial: 0 }),
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
      // --- Legacy flat duration fields (kept for backward compat; deprecated) ---
      duration: new fields.StringField({
        initial: "indefinite",
        choices: Object.values(TrespasserEffectsHelper.DURATION_MODES)
      }),
      durationValue: new fields.NumberField({ initial: 0 }),
      // --- Compound duration (new) ---
      durationOperator: new fields.StringField({
        initial: "OR",
        choices: ["OR", "AND"]
      }),
      durationConditions: new fields.ArrayField(
        new fields.ObjectField(),
        { initial: [] }
      ),
      intensityIncrement: new fields.NumberField({ initial: 0 }),
      counterStates: new fields.ArrayField(new fields.ObjectField(), { initial: [] }),
      isPrevailable: new fields.BooleanField({ initial: true })
    };
  }
}
