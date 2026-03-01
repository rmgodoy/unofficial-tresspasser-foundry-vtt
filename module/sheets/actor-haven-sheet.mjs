export class TrespasserHavenSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["trespasser", "sheet", "actor", "haven"],
      template: "systems/trespasser/templates/actor/haven-sheet.hbs",
      width: 800,
      height: 720,
      resizable: true,
      scrollY: [".tab-body"],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "buildings" }],
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    context.system = this.actor.system;

    // Separate items by type
    context.buildings = {
      completed: [],
      inProgress: []
    };
    context.hirelings = [];
    context.strongholds = [];

    for (const item of this.actor.items) {
      if (item.type === "build") {
        if (item.system.completed) context.buildings.completed.push(item);
        else context.buildings.inProgress.push(item);
      } else if (item.type === "hireling") {
        context.hirelings.push(item);
      } else if (item.type === "stronghold") {
        context.strongholds.push(item);
      }
    }

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      this.actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
    });

    html.find('.clock-step').click(async ev => {
      const itemId = $(ev.currentTarget).data("id");
      const step = parseInt($(ev.currentTarget).data("step"));
      const item = this.actor.items.get(itemId);
      if (item) {
        let nVal = (item.system.clock.value || 0) + step;
        nVal = Math.max(0, Math.min(nVal, item.system.clock.max));
        await item.update({ "system.clock.value": nVal });
      }
    });

    html.find('.upkeep-action').click(this._onUpkeepAction.bind(this));
  }

  async _onUpkeepAction(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    const sys = this.actor.system;

    switch (action) {
      case "weeks-rest":
        const chars = game.actors.filter(a => a.type === "character");
        let healed = 0;
        for (const char of chars) {
          if (char.isOwner) { // Only update actors we have permission to edit
            const updates = {
              "system.health": char.system.max_health || 0,
              "system.endurance": char.system.max_endurance || 0,
              "system.focus": char.system.max_focus || 0,
              "system.recovery_dice": char.system.max_recovery_dice || 0
            };
            await char.update(updates);
            healed++;
          }
        }
        ui.notifications.info(`Restored HP, END, FOC, and RD for ${healed} characters.`);
        break;

      case "pay-expenses":
        const cost = sys.weekly_expenses || 0;
        if (sys.wealth < cost) {
          ui.notifications.warn(`Not enough Wealth to pay ${cost} CP!`);
        } else {
          await this.actor.update({ "system.wealth": sys.wealth - cost });
          ui.notifications.info(`Paid ${cost} CP in weekly expenses.`);
        }
        break;

      case "population-check":
        const isDecline = sys.population_decline?.active;
        const attrKey = isDecline ? "allegiance" : "appeal";
        const attrVal = sys.attributes[attrKey] || 0;
        const skillKey = isDecline ? "faith" : "hospitality";
        const skillBonus = sys.skills[skillKey] ? sys.skill_bonus : 0;
        
        const formula = `1d20 + ${attrVal} + ${skillBonus}`;
        const roll = new foundry.dice.Roll(formula);
        await roll.evaluate();
        
        let target = isDecline ? 20 : 10;
        let title = isDecline ? "Population Decline Check" : "Population Check";
        let flavor = `<strong>${title}</strong><br/>${attrKey.toUpperCase()} (${attrVal}) + ${skillKey.toUpperCase()} (${skillBonus})`;
        
        if (roll.total >= target) {
          flavor += `<br/><span style="color: #6c6; font-weight: bold;">Success! (Target ${target})</span>`;
          if (!isDecline) {
            await this.actor.update({ "system.population_rank": (sys.population_rank || 0) + 1 });
            flavor += '<br/><em>Population Rank increased!</em>';
          } else {
            flavor += '<br/><em>Decline prevented.</em>';
          }
        } else {
          flavor += `<br/><span style="color: #c66; font-weight: bold;">Failure. (Target ${target})</span>`;
          if (isDecline) {
            await this.actor.update({ "system.population_rank": Math.max(0, (sys.population_rank || 0) - 1) });
            flavor += '<br/><em>Population Rank decreased!</em>';
          }
        }
        
        roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: flavor
        });
        break;

      case "event-check":
        const eRoll = new foundry.dice.Roll(`1d10 + ${sys.skill_bonus || 0}`);
        await eRoll.evaluate();
        eRoll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: `<strong>Event Check</strong><br/>Roll vs Event Tables`
        });
        break;
    }
  }
}
