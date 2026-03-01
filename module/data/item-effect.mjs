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
        initial: "active",
        choices: ["active", "passive"]
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
      duration: new fields.StringField({
        initial: "indefinite",
        choices: Object.values(TrespasserEffectsHelper.DURATION_MODES)
      }),
      durationValue: new fields.NumberField({ initial: 0 }),
      intensityIncrement: new fields.NumberField({ initial: 0 })
    };
  }
}
