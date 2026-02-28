import { TrespasserEffectSheet } from "./item-effect-sheet.mjs";

/**
 * Item sheet for Trespasser State items. Extends Effect sheet.
 */
export class TrespasserStateSheet extends TrespasserEffectSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "state"],
      template: "systems/trespasser/templates/item/effect-sheet.hbs"
    });
  }
}
