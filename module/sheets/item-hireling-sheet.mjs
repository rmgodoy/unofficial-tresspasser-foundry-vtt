export class TrespasserHirelingSheet extends foundry.appv1.sheets.ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "hireling"],
      template: "systems/trespasser/templates/item/hireling-sheet.hbs",
      width: 520,
      height: 600,
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    return context;
  }
}
