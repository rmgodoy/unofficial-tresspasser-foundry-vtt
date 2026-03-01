export class TrespasserStrongholdSheet extends foundry.appv1.sheets.ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "stronghold"],
      template: "systems/trespasser/templates/item/stronghold-sheet.hbs",
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
