export class TrespasserBuildSheet extends foundry.appv1.sheets.ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "item", "build"],
      template: "systems/trespasser/templates/item/build-sheet.hbs",
      width: 520,
      height: 600,
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.item.system;
    context.config = {
      attributes: {
        "": "",
        "military": "Military",
        "efficiency": "Efficiency",
        "resources": "Resources",
        "expertise": "Expertise",
        "allegiance": "Allegiance",
        "appeal": "Appeal"
      }
    };
    return context;
  }
}
