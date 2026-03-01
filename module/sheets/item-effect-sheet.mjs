import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";

/**
 * Item sheet for Trespasser Effect items.
 */
export class TrespasserEffectSheet extends foundry.appv1.sheets.ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "effect"],
      template: "systems/trespasser/templates/item/effect-sheet.hbs",
      width: 520,
      height: 480,
      scrollY: [".sheet-body"],
    });
  }

  /** @override */
  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    
    // Add constants for the sheet
    context.config = {
      effectTypes: {
        "active": "TRESPASSER.Sheet.Effects.EffectTypes.Active",
        "passive": "TRESPASSER.Sheet.Effects.EffectTypes.Passive"
      },
      targetAttributes: TrespasserEffectsHelper.TARGET_ATTRIBUTES,
      triggerWhen: TrespasserEffectsHelper.TRIGGER_LABELS,
      durationModes: TrespasserEffectsHelper.DURATION_LABELS
    };
    
    return context;
  }
}
