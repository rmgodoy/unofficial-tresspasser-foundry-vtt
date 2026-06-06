const { api, sheets } = foundry.applications;
import { COMMON_PLIGHTS } from "../config/plight-config.mjs";

/**
 * Item sheet for Trespasser Plight items.
 * Implemented using ApplicationV2 (sheets.ItemSheetV2).
 */
export class TrespasserPlightSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "item", "plight-sheet"],
    position: { width: 520, height: 400 },
    form: { 
      handler: TrespasserPlightSheet.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false 
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/item/plight-sheet.hbs",
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

    // Map common plights to localized options for the dropdown
    const plightOptions = {
      "": game.i18n.localize("TRESPASSER.Sheet.Common.None")
    };
    for (const [key, config] of Object.entries(COMMON_PLIGHTS)) {
      plightOptions[key] = game.i18n.localize(config.label);
    }
    context.plightOptions = plightOptions;

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

  /**
   * Manual form submission handler for AppV2.
   */
  static async #onSubmit(event, form, formData) {
    const plightId = formData.object["system.plightId"];
    const currentPlightId = this.document.system.plightId;

    // Auto-populate name and description if a common plight is selected
    if (plightId !== undefined && plightId !== currentPlightId) {
      if (plightId) {
        const config = COMMON_PLIGHTS[plightId];
        if (config) {
          formData.object["name"] = game.i18n.localize(config.label);
          formData.object["system.description"] = game.i18n.localize(config.description);
          formData.object["img"] = "systems/trespasser/assets/icons/effect.webp";
        }
      }
    }

    await this.document.update(formData.object);
  }
}
