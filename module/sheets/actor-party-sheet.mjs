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

const { api, sheets } = foundry.applications;

export class TrespasserPartySheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "party"],
    position: { width: 780, height: 700 },
    actions: {
      removeMember: TrespasserPartySheet.#onRemoveMember,
      addMember: TrespasserPartySheet.#onAddMember,
      openMemberSheet: TrespasserPartySheet.#onOpenMemberSheet,
      rollGroupCheck: TrespasserPartySheet.#onRollGroupCheck
    },
    form: { submitOnChange: true },
    window: { resizable: true }
  };

  static PARTS = {
    party: {
      template: "systems/trespasser/templates/actor/party-sheet.hbs"
    }
  };

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

    // Resolve member actors with full resource data
    const memberIds = system.members ?? [];
    const lightTags = CONFIG.TRESPASSER?.dungeon?.lightSourceTags ?? [];
    context.members = memberIds
      .map(id => game.actors.get(id))
      .filter(a => a?.type === "character")
      .map(a => this._buildMemberContext(a, lightTags));

    // Available characters for the add-member dropdown (not already in party)
    const memberIdSet = new Set(memberIds);
    const availableCharacters = game.actors
      .filter(a => a.type === "character" && !memberIdSet.has(a.id));
    context.availableCharacters = availableCharacters.map(a => ({ _id: a.id, name: a.name }));

    // Attributes and skills for the group check dropdowns
    context.attributes = [
      { key: "mighty", label: game.i18n.localize("TRESPASSER.Attributes.Mighty") },
      { key: "agility", label: game.i18n.localize("TRESPASSER.Attributes.Agility") },
      { key: "intellect", label: game.i18n.localize("TRESPASSER.Attributes.Intellect") },
      { key: "spirit", label: game.i18n.localize("TRESPASSER.Attributes.Spirit") }
    ];
    context.skills = [
      "acrobatics", "alchemy", "athletics", "crafting", "folklore", "letters",
      "magic", "nature", "perception", "speech", "stealth", "tinkering"
    ].map(s => ({
      key: s,
      label: game.i18n.localize(`TRESPASSER.Skills.${s.charAt(0).toUpperCase() + s.slice(1)}`)
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
    const s = actor.system;

    // Count rations
    const rations = actor.items
      .filter(i => i.type === "rations")
      .reduce((sum, i) => sum + (i.system.quantity ?? 1), 0);

    // Count injuries (stored as string array on system.injuries, or as embedded injury items)
    const injuries = (s.injuries?.length ?? 0) || actor.items.filter(i => i.type === "injury").length;

    // Light sources (same detection as dungeon tracker)
    const lightSources = [];
    for (const item of actor.items) {
      let isLight = false;
      let depDie = "";

      if (item.system.isLightFuel) {
        isLight = true;
        depDie = item.system.depletionDie ?? "";
      }

      if (!isLight && item.type === "equipment") {
        if (!item.system.equipped && item.system.equipped !== undefined) continue;
        const tags = item.system.tags ?? [];
        const tagMatch = tags.some(t => lightTags.includes(t.toLowerCase()));
        const nameMatch = lightTags.some(t => item.name.toLowerCase().includes(t));
        if (tagMatch || nameMatch) {
          isLight = true;
          depDie = item.system.depletionDie ?? "";
        }
      }

      if (isLight) {
        lightSources.push({
          name: item.name,
          depletionDie: depDie,
          quantity: item.system.quantity ?? 1
        });
      }
    }

    return {
      _id: actor.id,
      name: actor.name,
      img: actor.img,
      level: s.level ?? 1,
      hp: s.health ?? 0,
      hpMax: s.max_health ?? 0,
      endurance: s.endurance ?? 0,
      enduranceMax: s.max_endurance ?? 0,
      recoveryDice: s.recovery_dice ?? 0,
      recoveryDiceMax: s.max_recovery_dice ?? 0,
      resolve: s.resolve ?? 0,
      armor: s.armor ?? 0,
      rations,
      injuries,
      lightSources
    };
  }

  /**
   * Get the DC from the currently active dungeon session, if any.
   * @returns {number|null}
   */
  _getActiveDungeonDC() {
    try {
      const { DungeonTracker } = foundry.utils.getType(globalThis.trespasser?.DungeonTracker) === "function"
        ? globalThis.trespasser
        : {};
      const tracker = DungeonTracker?._instance;
      if (tracker?.dungeon && tracker.sessionState === "active") {
        const tier = tracker.dungeon.system.hostilityTier ?? 1;
        return CONFIG.TRESPASSER?.dungeon?.hostilityTiers?.[tier]?.dc ?? null;
      }
    } catch { /* no tracker available */ }
    return null;
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
    if (!actor || actor.type !== "character") return;

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
    const attribute = this.element.querySelector(".group-check-attribute")?.value;
    const skill = this.element.querySelector(".group-check-skill")?.value;
    const dc = parseInt(this.element.querySelector(".group-check-dc")?.value) || 12;

    if (!attribute) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Party.SelectAttribute"));
      return;
    }

    const memberIds = this.document.system.members ?? [];
    const members = memberIds
      .map(id => game.actors.get(id))
      .filter(a => a?.type === "character");

    if (members.length === 0) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Party.NoMembers"));
      return;
    }

    // Build the check label
    const attrLabel = game.i18n.localize(`TRESPASSER.Attributes.${attribute.charAt(0).toUpperCase() + attribute.slice(1)}`);
    const skillLabel = skill
      ? game.i18n.localize(`TRESPASSER.Skills.${skill.charAt(0).toUpperCase() + skill.slice(1)}`)
      : null;
    const checkLabel = skillLabel ? `${attrLabel} | ${skillLabel}` : attrLabel;

    // Roll for each member
    const results = [];
    for (const actor of members) {
      const data = actor.system;
      const attrValue = data.attributes?.[attribute] ?? 0;
      const skillDie = data.skill_die || "d6";
      const formula = `1${skillDie} + ${attrValue}`;

      const roll = new foundry.dice.Roll(formula);
      await roll.evaluate();

      results.push({
        name: actor.name,
        total: roll.total,
        formula: roll.formula,
        success: roll.total >= dc,
        roll
      });
    }

    // Build chat output
    const successes = results.filter(r => r.success).length;
    const total = results.length;
    const halfOrMore = successes >= Math.ceil(total / 2);
    const allSucceed = successes === total;

    let content = `<div class="trespasser-group-check">`;
    content += `<h3>${game.i18n.localize("TRESPASSER.Party.GroupCheck")}: ${checkLabel}</h3>`;
    content += `<p class="group-check-dc-line">${game.i18n.localize("TRESPASSER.Dungeon.DC")} ${dc}</p>`;
    content += `<div class="group-check-results">`;
    for (const r of results) {
      const cls = r.success ? "success" : "failure";
      content += `<div class="group-check-row ${cls}">`;
      content += `<span class="group-check-name">${r.name}</span>`;
      content += `<span class="group-check-roll">${r.formula}</span>`;
      content += `<span class="group-check-total">${r.total}</span>`;
      content += `<span class="group-check-result">${r.success ? "✓" : "✗"}</span>`;
      content += `</div>`;
    }
    content += `</div>`;
    content += `<div class="group-check-summary">`;
    content += `<strong>${successes} / ${total}</strong> ${game.i18n.localize("TRESPASSER.Party.Succeeded")}`;
    if (allSucceed) {
      content += ` — <span class="group-check-all">${game.i18n.localize("TRESPASSER.Party.AllSucceed")}</span>`;
    } else if (halfOrMore) {
      content += ` — <span class="group-check-half">${game.i18n.localize("TRESPASSER.Party.HalfMoreSucceed")}</span>`;
    } else {
      content += ` — <span class="group-check-fail">${game.i18n.localize("TRESPASSER.Party.FewerHalfSucceed")}</span>`;
    }
    content += `</div></div>`;

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ alias: this.document.name }),
      rolls: results.map(r => r.roll)
    });
  }

  /* -------------------------------------------- */
  /* Drag & Drop                                  */
  /* -------------------------------------------- */

  async _onDropActor(event, data) {
    if (!this.isEditable) return false;
    const actor = await Actor.implementation.fromDropData(data);
    if (!actor || actor.type !== "character") {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Party.DropCharactersOnly"));
      return false;
    }

    const members = [...(this.document.system.members ?? [])];
    if (members.includes(actor.id)) {
      ui.notifications.info(game.i18n.format("TRESPASSER.Party.AlreadyMember", { name: actor.name }));
      return false;
    }

    members.push(actor.id);
    await this.document.update({ "system.members": members });
    ui.notifications.info(game.i18n.format("TRESPASSER.Party.MemberAdded", { name: actor.name }));
    return true;
  }
}
