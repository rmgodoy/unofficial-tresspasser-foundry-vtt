/**
 * Party Actor Sheet for Trespasser RPG
 *
 * AppV2 sheet focused on two responsibilities:
 *   1. Resource tracking — at-a-glance view of every member's HP,
 *      endurance, recovery dice, resolve, armor, and consumables.
 *   2. Group checks — select attribute + skill, set DC, and roll for
 *      all members at once. Results posted to chat with success count.
 *
 * Members are character actor IDs. Drag a character actor onto the
 * sheet to add them, or use the dropdown picker.
 */

import { TrespasserPartyHelper } from "../helpers/party-helper.mjs";
import { TrespasserActorSheet } from "./base-sheet.mjs";
import { buildMemberContext, getActiveDungeonDC } from "./party/party-member-context.mjs";
import { runGroupCheck } from "./party/party-group-check.mjs";

export class TrespasserPartySheet extends TrespasserActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "party"],
    position: { width: 780, height: 700 },
    actions: {
      removeMember: TrespasserPartySheet.#onRemoveMember,
      addMember: TrespasserPartySheet.#onAddMember,
      openMemberSheet: TrespasserPartySheet.#onOpenMemberSheet,
      rollGroupCheck: TrespasserPartySheet.#onRollGroupCheck,
      setActiveParty: TrespasserPartySheet.onSetActiveParty
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    party: {
      template: "systems/trespasser/templates/actor/party-sheet.hbs"
    }
  };

  /** @override */
  get title() {
    const typeLabel = game.i18n.localize(`TRESPASSER.TYPES.Actor.${this.document.type}`);
    return `${typeLabel}: ${this.document.name}`;
  }

  /* -------------------------------------------- */
  /* Context Preparation                          */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    context.actor = actor;
    context.system = system;
    context.editable = this.isEditable;
    context.isGM = game.user.isGM;
    context.isActiveParty = game.settings.get("trespasser", "activePartyId") === actor.id;

    // Resolve member actors with full resource data
    const memberIds = system.members ?? [];
    const lightTags = CONFIG.TRESPASSER?.dungeon?.lightSourceTags ?? [];
    context.members = memberIds
      .map(id => game.actors.get(id))
      .filter(a => a?.type === "character" || a?.type === "commoner")
      .map(a => this._buildMemberContext(a, lightTags));

    // Available characters/commoners for the add-member dropdown (not already in party)
    const memberIdSet = new Set(memberIds);
    const availableCharacters = game.actors
      .filter(a => (a.type === "character" || a.type === "commoner") && !memberIdSet.has(a.id));
    context.availableCharacters = availableCharacters.map(a => ({ _id: a.id, name: a.name }));

    // Attributes and skills for the group check dropdowns
    context.attributes = [
      { key: "mighty", label: game.i18n.localize("TRESPASSER.Terms.Attribute.Mighty") },
      { key: "agility", label: game.i18n.localize("TRESPASSER.Terms.Attribute.Agility") },
      { key: "intellect", label: game.i18n.localize("TRESPASSER.Terms.Attribute.Intellect") },
      { key: "spirit", label: game.i18n.localize("TRESPASSER.Terms.Attribute.Spirit") }
    ];
    context.skills = [
      "acrobatics", "alchemy", "athletics", "crafting", "folklore", "letters",
      "magic", "nature", "perception", "speech", "stealth", "tinkering"
    ].map(s => ({
      key: s,
      label: game.i18n.localize(`TRESPASSER.Terms.Skill.${s.charAt(0).toUpperCase() + s.slice(1)}`)
    }));

    // Default DC from active dungeon if one is running
    context.defaultDC = this._getActiveDungeonDC() ?? 12;

    // Enriched notes
    context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.notes ?? "",
      { async: true }
    );

    return context;
  }

  /**
   * Build context data for a single party member.
   * @param {Actor} actor
   * @param {string[]} lightTags
   * @returns {Object}
   */
  _buildMemberContext(actor, lightTags) {
    return buildMemberContext(actor, lightTags);
  }

  /**
   * Get the DC from the currently active dungeon session, if any.
   * @returns {number|null}
   */
  _getActiveDungeonDC() {
    return getActiveDungeonDC();
  }

  /* -------------------------------------------- */
  /* Lifecycle                                    */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Register hooks to refresh the party sheet when a member's data changes
    if (!this._memberUpdateHookId) {
      this._memberUpdateHookId = Hooks.on("updateActor", (actor, changed) => {
        const members = this.document.system.members ?? [];
        if (members.includes(actor.id)) {
          this.render();
        }
      });

      this._memberDeleteHookId = Hooks.on("deleteActor", (actor) => {
        const members = this.document.system.members ?? [];
        if (members.includes(actor.id)) {
          const newMembers = members.filter(id => id !== actor.id);
          this.document.update({ "system.members": newMembers });
          this.render();
        }
      });

      this._memberItemUpdateHookId = Hooks.on("updateItem", (item) => {
        const members = this.document.system.members ?? [];
        if (item.parent?.id && members.includes(item.parent.id)) {
          this.render();
        }
      });

      this._memberItemCreateHookId = Hooks.on("createItem", (item) => {
        const members = this.document.system.members ?? [];
        if (item.parent?.id && members.includes(item.parent.id)) {
          this.render();
        }
      });

      this._memberItemDeleteHookId = Hooks.on("deleteItem", (item) => {
        const members = this.document.system.members ?? [];
        if (item.parent?.id && members.includes(item.parent.id)) {
          this.render();
        }
      });
    }
  }

  /** @override */
  async close(options = {}) {
    if (this._memberUpdateHookId) {
      Hooks.off("updateActor", this._memberUpdateHookId);
      this._memberUpdateHookId = null;
    }
    if (this._memberDeleteHookId) {
      Hooks.off("deleteActor", this._memberDeleteHookId);
      this._memberDeleteHookId = null;
    }
    if (this._memberItemUpdateHookId) {
      Hooks.off("updateItem", this._memberItemUpdateHookId);
      this._memberItemUpdateHookId = null;
    }
    if (this._memberItemCreateHookId) {
      Hooks.off("createItem", this._memberItemCreateHookId);
      this._memberItemCreateHookId = null;
    }
    if (this._memberItemDeleteHookId) {
      Hooks.off("deleteItem", this._memberItemDeleteHookId);
      this._memberItemDeleteHookId = null;
    }
    return super.close(options);
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  /**
   * Add a member from the dropdown.
   */
  static async #onAddMember(event, target) {
    const select = this.element.querySelector(".party-add-member-select");
    const actorId = select?.value;
    if (!actorId) return;
    const actor = game.actors.get(actorId);
    if (!actor || (actor.type !== "character" && actor.type !== "commoner")) return;

    const members = [...(this.document.system.members ?? [])];
    if (members.includes(actorId)) return;
    members.push(actorId);
    await this.document.update({ "system.members": members });
  }

  /**
   * Remove a member from the party.
   */
  static async #onRemoveMember(event, target) {
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    const members = (this.document.system.members ?? []).filter(id => id !== actorId);
    await this.document.update({ "system.members": members });
  }

  /**
   * Open a member's character sheet.
   */
  static #onOpenMemberSheet(event, target) {
    const actorId = target.dataset.actorId;
    const actor = game.actors.get(actorId);
    if (actor) actor.sheet.render(true);
  }

  /**
   * Roll a group check for all party members.
   * Posts individual rolls and a summary to chat.
   */
  static async #onRollGroupCheck(event, target) {
    return runGroupCheck(this, event, target);
  }

  /* -------------------------------------------- */
  /* Drag & Drop                                  */
  /* -------------------------------------------- */

  async _onDropActor(event, data) {
    if (!this.isEditable) return false;
    const actor = data instanceof Actor ? data : await Actor.implementation.fromDropData(data ?? {});
    if (!actor || (actor.type !== "character" && actor.type !== "commoner")) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Party.DropCharactersOnly"));
      return false;
    }

    const members = [...(this.document.system.members ?? [])];
    if (members.includes(actor.id)) {
      ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Party.AlreadyMember", { name: actor.name }));
      return false;
    }

    members.push(actor.id);
    await this.document.update({ "system.members": members });
    ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Party.MemberAdded", { name: actor.name }));
    return true;
  }

  /**
   * Set this party as the active party for the world.
   */
  static async onSetActiveParty(event, target) {
    if (!game.user.isGM) return;
    
    const currentActiveId = game.settings.get("trespasser", "activePartyId");
    if (currentActiveId === this.document.id) {
      await TrespasserPartyHelper.setActiveParty("");
      ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Party.ActivePartyCleared", { name: this.document.name }));
    } else {
      await TrespasserPartyHelper.setActiveParty(this.document.id);
      ui.notifications.info(game.i18n.format("TRESPASSER.Notification.Party.ActivePartySet", { name: this.document.name }));
    }
  }
}
