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
import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { NonCombatSparkDialog, NonCombatShadowDialog } from "../dialogs/tempt-fate-dialogs.mjs";
import * as NonCombatHelper from "../helpers/non-combat-helper.mjs";

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
    const s = actor.system;

    // Count rations (total quantity of all 'rations' type items)
    const rations = actor.items
      .filter(i => i.type === "rations")
      .reduce((sum, i) => sum + (i.system.quantity ?? 1), 0);

    // Count injuries (total number of 'injury' type items)
    const injuries = actor.items.filter(i => i.type === "injury").length;

    // Light sources (as requested: sub-type of light source or weapons with light source property)
    const lightSources = [];
    for (const item of actor.items) {
      let isLight = false;

      if (item.type === "item" && item.system.subType === "light_source") isLight = true;
      else if (item.type === "weapon" && item.system.isLightSource) isLight = true;
      else if (item.system.isLightFuel) isLight = true;

      if (isLight) {
        lightSources.push({
          name: item.name,
          depletionDie: item.system.depletionDie ?? "",
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
      armor: s.armorDieAmmount ?? 0,
      armorMax: actor.items.filter(i => i.type === "armor" && i.system.equipped).length,
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
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Dialog.Party.SelectAttribute"));
      return;
    }

    const memberIds = this.document.system.members ?? [];
    const allMembers = memberIds
      .map(id => game.actors.get(id))
      .filter(a => a?.type === "character");

    if (allMembers.length === 0) {
      ui.notifications.warn(game.i18n.localize("TRESPASSER.Notification.Party.NoMembers"));
      return;
    }

    let members = allMembers;
    const alwaysFull = game.settings.get("trespasser", "groupCheckFullParty");
    if (!alwaysFull) {
      const selection = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize("TRESPASSER.Dialog.Party.SelectParticipants") },
        classes: ["trespasser", "dialog", "group-participant-select"],
        content: `
          <p>${game.i18n.localize("TRESPASSER.Dialog.Party.SelectParticipantsHint")}</p>
          <div class="participant-selection" style="max-height: 300px; overflow-y: auto; margin-bottom: 10px;">
            ${allMembers.map(m => `
              <div class="form-group" style="display: flex; align-items: center; margin-bottom: 5px; gap: 10px; border-bottom: 1px solid var(--trp-border); padding: 4px;">
                <input type="checkbox" name="participant" value="${m.id}" checked>
                <img src="${m.img}" style="width: 40px !important; height: 40px !important; flex: 0 0 40px !important; object-fit: cover !important; border-radius: 4px; border: 1px solid var(--trp-text-dim);">
                <label style="flex: 1;">${m.name}</label>
              </div>
            `).join('')}
          </div>
        `,
        buttons: [
          {
            action: "run",
            label: game.i18n.localize("TRESPASSER.Global.Action.RunCheck"),
            icon: "fas fa-dice",
            default: true,
            callback: (event, button) => {
              const selectedIds = Array.from(button.form.querySelectorAll('input[name="participant"]:checked')).map(el => el.value);
              return allMembers.filter(m => selectedIds.includes(m.id));
            }
          },
          {
            action: "cancel",
            label: game.i18n.localize("TRESPASSER.Global.Action.Cancel"),
            icon: "fas fa-times",
            callback: () => null
          }
        ],
        rejectClose: false
      });

      if (!selection || selection.length === 0) return;
      members = selection;
    }

    // Build the check label
    const attrLabels = {
      mighty: "TRESPASSER.Terms.Attribute.Mighty",
      agility: "TRESPASSER.Terms.Attribute.Agility",
      intellect: "TRESPASSER.Terms.Attribute.Intellect",
      spirit: "TRESPASSER.Terms.Attribute.Spirit"
    };
    const attrLabel = game.i18n.localize(attrLabels[attribute]);
    const skillLabel = skill
      ? game.i18n.localize(`TRESPASSER.Terms.Skill.${skill.charAt(0).toUpperCase() + skill.slice(1)}`)
      : null;
    const checkLabel = skillLabel ? `${attrLabel} | ${skillLabel}` : attrLabel;

    // Roll for each member
    let successes = 0;
    let failures = 0;
    const results = [];
    for (const actor of members) {
      const data = actor.system;
      const attrBase = data.attributes?.[attribute] ?? 0;
      const staticBonus = data.bonuses?.[attribute] ?? 0;
      
      // Skill bonus if trained
      const isTrained = skill && data.skills?.[skill] === true;
      const skillBonus = isTrained ? (data.skill ?? 0) : 0;
      
      // Get triggered bonus and consume usage charges
      const triggeredBonus = await TrespasserEffectsHelper.evaluateAttributeBonus(actor, attribute);
      
      const totalBonus = attrBase + staticBonus + skillBonus + triggeredBonus;
      const formula = `1d20 + ${totalBonus}`;

      const roll = new foundry.dice.Roll(formula);
      await roll.evaluate();

      const dieResult = roll.dice[0]?.results[0]?.result;
      const isNat20 = dieResult === 20;
      const isSuccess = roll.total >= dc || isNat20;

      let contribSuccesses = 0;
      let contribFailures = 0;

      if (isSuccess) {
        contribSuccesses = isNat20 ? 2 : 1;
        successes += contribSuccesses;
      } else {
        contribFailures = 1;
        failures += contribFailures;
      }

      results.push({
        actor,
        name: actor.name,
        total: roll.total,
        formula: roll.formula,
        success: isSuccess,
        isNat20,
        roll
      });
    }

    // Determine Group Sparks / Shadows
    let chosenSparks = [];
    let chosenShadows = [];
    const outcome = successes - failures;

    if (outcome >= 2) {
      // Prompt character with highest roll result
      const highestRoll = results.reduce((max, curr) => curr.total > max.total ? curr : max, results[0]);
      const ownerUser = game.users.find(u => !u.isGM && highestRoll.actor.testUserPermission(u, "OWNER") && u.active);
      const requestId = foundry.utils.randomID();
      
      if (!ownerUser || ownerUser.id === game.user.id) {
        chosenSparks = await NonCombatSparkDialog.wait(1, { actor: highestRoll.actor });
      } else {
        chosenSparks = await NonCombatHelper.requestPlayerSparks({
          requestId,
          targetUserId: ownerUser.id,
          sparkCount: 1,
          rollLabel: "Group Check Spark",
          actorId: highestRoll.actor.id
        });
      }
      chosenSparks = chosenSparks || [];
    } else if (outcome <= -2) {
      if (game.user.isGM) {
        chosenShadows = await NonCombatShadowDialog.wait(1);
      } else {
        const requestId = foundry.utils.randomID();
        chosenShadows = await NonCombatHelper.requestGMShadows({
          requestId,
          shadowCount: 1,
          rollLabel: "Group Check Shadow"
        });
      }
      chosenShadows = chosenShadows || [];
    }

    // Build chat output
    let content = `<div class="trespasser-group-check">`;
    content += `<h3>${game.i18n.localize("TRESPASSER.Chat.Party.GroupCheck")}: ${checkLabel}</h3>`;
    content += `<p class="group-check-dc-line">${game.i18n.localize("TRESPASSER.Terms.Combat.DC")} ${dc}</p>`;
    content += `<div class="group-check-results">`;
    for (const r of results) {
      const cls = r.success ? "success" : "failure";
      let resultIndicator = r.success ? "✓" : "✗";
      let isNat20Text = "";
      if (r.isNat20) {
        resultIndicator = "✓✓";
        isNat20Text = ` <span style="font-size: var(--fs-9); color: var(--trp-gold-bright); font-weight: bold; text-transform: uppercase;">(Nat 20)</span>`;
      }

      content += `<div class="group-check-row ${cls}">`;
      content += `<span class="group-check-name">${r.name}${isNat20Text}</span>`;
      content += `<span class="group-check-roll">${r.formula}</span>`;
      content += `<span class="group-check-total">${r.total}</span>`;
      content += `<span class="group-check-result">${resultIndicator}</span>`;
      content += `</div>`;
    }
    content += `</div>`;

    content += `<div class="group-check-summary" style="display: flex; flex-direction: column; gap: 4px;">`;
    content += `<div><strong>Successes:</strong> ${successes} | <strong>Failures:</strong> ${failures}</div>`;
    content += `<div><strong>Net Outcome:</strong> ${outcome >= 0 ? "+" + outcome : outcome}</div>`;

    if (chosenSparks.length > 0) {
      content += `<div class="group-check-sparks" style="margin-top: 4px; text-align: left;">`;
      content += `<strong>Group Sparks:</strong><ul style="margin: 2px 0 0; padding-left: 15px;">`;
      for (const spark of chosenSparks) {
        content += `<li><span style="color:var(--trp-spark); font-weight:bold;"><i class="fas fa-sun"></i> ${spark.toUpperCase()}</span></li>`;
      }
      content += `</ul></div>`;
    }

    if (chosenShadows.length > 0) {
      content += `<div class="group-check-shadows" style="margin-top: 4px; text-align: left;">`;
      content += `<strong>Group Shadows:</strong><ul style="margin: 2px 0 0; padding-left: 15px;">`;
      for (const shadow of chosenShadows) {
        content += `<li><span style="color:var(--trp-shadow); font-weight:bold;"><i class="fas fa-moon"></i> ${shadow.toUpperCase()}</span></li>`;
      }
      content += `</ul></div>`;
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
}
