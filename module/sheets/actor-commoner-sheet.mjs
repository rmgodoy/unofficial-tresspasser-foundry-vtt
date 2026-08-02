import { getCharacterData } from "./character/get-data.mjs";
import { TrespasserCharacterSheet } from "./actor-character-sheet.mjs";
import {
  handleAttributeManualEdit,
  handleGenerateButton,
  handlePastLifeDrop
} from "./commoner/handlers-commoner.mjs";
import { upgradeCommonerToTrespasser } from "../helpers/commoner-upgrade-helper.mjs";

/**
 * Commoner Sheet class for Trespasser TTRPG (ApplicationsV2).
 * Follows the Character sheet visual layout with streamlined attributes and tabs.
 */
export class TrespasserCommonerSheet extends TrespasserCharacterSheet {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "trespasser-sheet", "sheet", "actor", "commoner"],
    position: { width: 868, height: 720 },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    window: { resizable: true },
    dragDrop: [{ dragSelector: ".inventory-card, .item, .deed-slot", dropSelector: null }]
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/actor/commoner-sheet.hbs",
      scrollable: [".tab-body.active", ".editor-container"]
    }
  };

  tabGroups = { primary: "character" };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Actor.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const charData = await getCharacterData(this, options);
    Object.assign(context, charData);

    context.tabs = this.tabGroups;
    context.isGenerated = this.actor.system.isGenerated;
    context.defaultDeed = this.actor.items.find(i => i.type === "deed");
    context.isGM = game.user.isGM;

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    // Commoner specific button handlers
    html.find(".btn-generate-commoner").on("click", (e) => handleGenerateButton(e, this.actor));
    html.find(".btn-upgrade-trespasser").on("click", this._onUpgradeClick.bind(this));
    html.find(".attribute-input input").on("change", (e) => handleAttributeManualEdit(e, this.actor));
  }

  /** @override */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type === "Item") {
      const item = await Item.implementation.fromDropData(data);
      if (item?.type === "past_life") {
        await handlePastLifeDrop(this.actor, item);
        return;
      }
    }
    return super._onDrop(event);
  }

  async _onUpgradeClick(event) {
    event.preventDefault();
    await upgradeCommonerToTrespasser(this.actor);
  }
}

