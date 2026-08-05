import { activateImagePicker } from "../helpers/image-picker-helper.mjs";

const { api, sheets } = foundry.applications;

/**
 * Base Actor Sheet for Trespasser (ApplicationV2)
 */
export class TrespasserBaseActorSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    activateImagePicker(this);
  }
}

/**
 * Base Item Sheet for Trespasser (ApplicationV2)
 */
export class TrespasserBaseItemSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {
  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    activateImagePicker(this);
  }
}

// Aliases for convenience
export const TrespasserActorSheet = TrespasserBaseActorSheet;
export const TrespasserItemSheet = TrespasserBaseItemSheet;
