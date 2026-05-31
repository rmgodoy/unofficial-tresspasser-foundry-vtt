import { buildDeedContent }      from "../helpers/item-info/deed.mjs";
import { buildFeatureContent }   from "../helpers/item-info/feature.mjs";
import { buildTalentContent }    from "../helpers/item-info/talent.mjs";
import { buildGenericContent }   from "../helpers/item-info/generic.mjs";
import { buildEffectContent }    from "../helpers/item-info/effect.mjs";
import { buildEquipmentContent } from "../helpers/item-info/equipment.mjs";

/**
 * Item Info Dialog — read-only preview of any item using ApplicationsV2.
 */
export class TrespasserItemInfoDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(item, options={}) {
    super(options);
    this.item = item;
    this.options.window.title = this.item.name;
  }

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "dialog", "item-info-dialog"],
    position: { width: 400, height: "auto" },
    window: {
      resizable: true,
      minimizable: false,
      title: ""
    },
    actions: {
      close: function() { this.close(); }
    }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/dialogs/item-info-dialog.hbs"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    let bodyHTML;
    switch (this.item.type) {
      case "deed":    bodyHTML = buildDeedContent(this.item);    break;
      case "feature": bodyHTML = buildFeatureContent(this.item); break;
      case "talent":  bodyHTML = buildTalentContent(this.item);  break;
      case "effect":
      case "state":   bodyHTML = buildEffectContent(this.item);  break;
      case "weapon":
      case "armor":   bodyHTML = buildEquipmentContent(this.item); break;
      default:        bodyHTML = buildGenericContent(this.item); break;
    }
    context.bodyHTML = bodyHTML;
    return context;
  }
}

/**
 * Show a read-only info dialog for any item by UUID.
 * @param {string} uuid  The item's UUID
 */
export async function showItemInfoDialog(uuid) {
  if (!uuid) return;
  const item = await fromUuid(uuid);
  if (!item) {
    ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Item.NotFound"));
    return;
  }

  new TrespasserItemInfoDialog(item).render(true);
}
