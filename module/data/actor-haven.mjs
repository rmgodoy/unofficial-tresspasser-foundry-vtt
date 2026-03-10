import { handleRestAction } from "../sheets/character/handlers-rest.mjs";

/**
 * Data model for the Haven actor type.
 */
export class TrespasserHavenData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      leaderId: new fields.StringField({ initial: "" }),
      treasury: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      
      // Core Attributes
      attributes: new fields.SchemaField({
        military: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        efficiency: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        resources: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        expertise: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        allegiance: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        appeal: new fields.NumberField({ initial: 0, integer: true, min: 0 })
      }),

      populationRank: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      level: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),

      bonuses: new fields.SchemaField({
        attributes: new fields.SchemaField({
          military: new fields.NumberField({ initial: 0, integer: true }),
          efficiency: new fields.NumberField({ initial: 0, integer: true }),
          resources: new fields.NumberField({ initial: 0, integer: true }),
          expertise: new fields.NumberField({ initial: 0, integer: true }),
          allegiance: new fields.NumberField({ initial: 0, integer: true }),
          appeal: new fields.NumberField({ initial: 0, integer: true })
        })
      }),

      // Skills
      skills: new fields.SchemaField({
        agriculture: new fields.BooleanField({ initial: false }),
        construction: new fields.BooleanField({ initial: false }),
        commerce: new fields.BooleanField({ initial: false }),
        cuisine: new fields.BooleanField({ initial: false }),
        entertainment: new fields.BooleanField({ initial: false }),
        espionage: new fields.BooleanField({ initial: false }),
        faith: new fields.BooleanField({ initial: false }),
        hospitality: new fields.BooleanField({ initial: false }),
        research: new fields.BooleanField({ initial: false }),
        seafaring: new fields.BooleanField({ initial: false }),
        statecraft: new fields.BooleanField({ initial: false }),
        warfare: new fields.BooleanField({ initial: false })
      }),

      notes: new fields.HTMLField({ initial: "" }),
      
      productionChains: new fields.ArrayField(new fields.SchemaField({
        id: new fields.StringField({ initial: () => foundry.utils.randomID() }),
        name: new fields.StringField({ initial: "New Production Chain" }),
        active: new fields.BooleanField({ initial: true }),
        // Array of hireling item IDs assigned to this chain in order
        hirelings: new fields.ArrayField(new fields.StringField(), { initial: [] })
      }), { initial: [] }),

      // Internal inventory managed by data, allowing stacking of all types
      inventory: new fields.ArrayField(new fields.SchemaField({
        item: new fields.ObjectField(),
        quantity: new fields.NumberField({ initial: 1, integer: true, min: 0 })
      }), { initial: [] }),

      event: new fields.SchemaField({
        title: new fields.StringField({ initial: "" }),
        description: new fields.HTMLField({ initial: "" }),
        clock: new fields.NumberField({ initial: 4, integer: true, min: 2, max: 12 }),
        current: new fields.NumberField({ initial: 0, integer: true, min: 0 })
      })
    };
  }

  /**
   * Total cost per week based on active hirelings.
   * @returns {number}
   */
  get totalWeeklyCost() {
    const actor = this.parent;
    const hirelings = actor.items.filter(i => i.type === "hireling");
    return hirelings.reduce((total, h) => {
      if (h.system.active) return total + (h.system.cost * h.system.quantity);
      return total;
    }, 0);
  }

  /**
   * Get calculated total attributes (Base + Bonus)
   * @returns {Record<string, number>}
   */
  get totalAttributes() {
    const actor = this.parent;
    const totals = {};
    const buildings = actor.items.filter(i => i.type === "build" && (i.system.progress >= i.system.buildClock));

    for ( const key of ["military", "efficiency", "resources", "expertise", "allegiance", "appeal"] ) {
      const base = this.attributes[key] ?? 0;
      const bonus = (this.bonuses?.attributes?.[key] ?? 0);
      
      // Add building bonuses
      const buildingBonus = buildings.reduce((sum, b) => {
        const itemBonuses = b.system.bonuses || [];
        return sum + itemBonuses.filter(attr => attr.attribute === key).reduce((s, a) => s + a.value, 0);
      }, 0);

      totals[key] = base + bonus + buildingBonus;
    }
    return totals;
  }

  /**
   * Thresholds for Population Rank required for each level.
   * 0:0, 1:5, 2:10, 3:20, 4:30, 5:40, 6:50, 7:60, 8:80, 9:100
   */
  get populationThresholds() {
    return [0, 5, 10, 20, 30, 40, 50, 60, 80, 100];
  }

  /**
   * Skill Bonus based on Haven Level:
   * Level 0-2: +2
   * Level 3-5: +3
   * Level 6-8: +4
   * Level 9: +5
   */
  get skillBonus() {
    const lvl = this.level;
    if (lvl >= 9) return 5;
    if (lvl >= 6) return 4;
    if (lvl >= 3) return 3;
    return 2;
  }

  /**
   * Maximum number of building slots (under construction) based on level.
   */
  get maxBuildSlots() {
    const lvl = this.level;
    if (lvl >= 9) return 4;
    if (lvl >= 6) return 3;
    if (lvl >= 3) return 2;
    return 1;
  }

  /**
   * Maximum number of completed buildings based on level.
   */
  get maxBuildingLimit() {
    const lvl = this.level;
    return (lvl + 1) * 3;
  }

  /**
   * Returns a Set of all trained skill keys (from Haven itself or completed buildings).
   */
  get trainedSkills() {
    const actor = this.parent;
    const trained = new Set();
    
    // Check Haven's own skills
    for ( const [key, isTrained] of Object.entries(this.skills) ) {
      if ( isTrained ) trained.add(key);
    }

    // Check completed buildings
    const buildings = actor.items.filter(i => i.type === "build" && (i.system.progress >= i.system.buildClock));
    for ( const b of buildings ) {
      for ( const s of (b.system.skills || []) ) {
        trained.add(s);
      }
    }

    return trained;
  }

  /**
   * Step 1: Week's Rest.
   * Automatically applies rest benefits to characters whose owners also own this Haven.
   */
  async weeksRest() {
    const actor = this.parent;
    const havenOwnership = actor.ownership;
    
    // Get IDs of all users who have OWNER permission for the Haven
    const havenOwners = Object.entries(havenOwnership)
      .filter(([id, level]) => id !== "default" && level === 3)
      .map(([id]) => id);

    // Find characters owned by any of those users
    const characters = game.actors.filter(a => a.type === "character");
    const affected = characters.filter(char => {
      return havenOwners.some(uid => char.ownership[uid] === 3);
    });

    const results = [];
    for (const char of affected) {
      await handleRestAction("week", {}, char, { chat: false });
      results.push(char.name);
    }

    await ChatMessage.create({
      content: `<div class="trespasser-chat-card haven-report">
        <h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.WeeksRest")}</h3>
        <p>${game.i18n.localize("TRESPASSER.Haven.WeeksRestFlavor")}</p>
        <p><strong>Characters Rested:</strong> ${results.length ? results.join(", ") : "None"}</p>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }

  /**
   * Combined Step 2 & 3: Resolve Hirelings (includes paying expenses).
   */
  async resolveHirelings() {
    const actor = this.parent;
    const hirelings = actor.items.filter(i => i.type === "hireling");
    
    // Combine Step 2 & 3 Payment logic
    const totalCost = this.totalWeeklyCost;
    if (this.treasury < totalCost) {
      ui.notifications.error(game.i18n.format("TRESPASSER.Haven.InsufficientFundsError", { cost: totalCost, treasury: this.treasury }));
      return false;
    }
    
    const newTreasury = Math.max(0, this.treasury - totalCost);
    const updates = { "system.treasury": newTreasury };

    // Identify assigned hirelings
    const assignedHirelingIds = new Set();
    for (const chain of this.productionChains) {
      if (!chain.active) continue;
      for (const hid of chain.hirelings) assignedHirelingIds.add(hid);
    }

    const messages = [];
    messages.push(`<h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.ResolveHirelings")}</h3>`);
    messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Haven.TotalCost")}:</strong> ${totalCost} (Paid from Treasury)</p>`);

    // Temporary inventory state for the week's processing
    let currentInventory = foundry.utils.duplicate(this.inventory);

    // 2. Process production chains sequentially
    for (const chain of this.productionChains) {
      if (!chain.active) continue;
      messages.push(`<h4>${chain.name}</h4>`);
      for (const hid of chain.hirelings) {
        const hireling = actor.items.get(hid);
        if (hireling && hireling.system.active) {
          const { result, newInventory } = await this._processHirelingProduction(hireling, currentInventory);
          messages.push(result);
          currentInventory = newInventory;
        }
      }
    }

    // 3. Process unassigned active hirelings
    messages.push(`<h4>${game.i18n.localize("TRESPASSER.Haven.UnassignedHirelings")}</h4>`);
    for (const h of hirelings) {
      if (h.system.active && !assignedHirelingIds.has(h.id)) {
        const { result, newInventory } = await this._processHirelingProduction(h, currentInventory);
        messages.push(result);
        currentInventory = newInventory;
      }
    }

    // Update treasury and inventory
    updates["system.inventory"] = currentInventory;
    await actor.update(updates);

    await ChatMessage.create({
      content: `<div class="trespasser-chat-card haven-report">${messages.join("")}</div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }

  /**
   * Step 4: Population Check
   * Roll a Skill check of Hospitality (if trained) and Appeal vs 10.
   * Success increases Population Rank by 1, +1 per spark.
   * Also checks for Level Up based on requirements.
   */
  async populationCheck() {
    const actor = this.parent;
    const appeal = this.totalAttributes.appeal ?? 0;
    const isHospitality = this.skills.hospitality;
    const bonus = isHospitality ? this.skillBonus : 0;
    const formula = `1d20 + ${appeal} + ${bonus}`;

    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const total = roll.total;
    const diceResult = roll.dice[0].results[0].result;
    const cd = 10;
    const isSuccess = total >= cd;

    let sparks = 0;
    if (isSuccess) {
      const diff = total - cd;
      sparks = Math.floor(diff / 5);
      if (diceResult === 20) sparks += 1;
    }

    const increase = isSuccess ? (1 + sparks) : 0;
    const oldRank = this.populationRank || 0;
    const newRank = oldRank + increase;
    
    const updates = { "system.populationRank": newRank };

    // Check for Level Up
    // Requirements: 
    // 1. Party level >= Haven level + 1
    // 2. Population Rank >= threshold for Haven level + 1
    // 3. Max 1 level per week (satisfied since this is run once per week)
    const currentLevel = this.level || 0;
    let levelUpOccurred = false;
    
    if (currentLevel < 9) {
      const nextLevel = currentLevel + 1;
      const thresholds = this.populationThresholds;
      const requiredRank = thresholds[nextLevel];
      
      const characters = game.actors.filter(a => a.type === "character");
      const partyLevel = characters.length ? Math.max(...characters.map(c => c.system.level ?? 0)) : 0;
      
      if (newRank >= requiredRank && partyLevel >= nextLevel) {
        updates["system.level"] = nextLevel;
        levelUpOccurred = true;
      }
    }

    await actor.update(updates);

    const messages = [];
    messages.push(`<h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.PopulationCheck")}</h3>`);
    
    if (isSuccess) {
      messages.push(`<p class="success" style="color:#2ecc71;font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Success")}</p>`);
      if (sparks > 0) messages.push(`<p style="color:#64b5f6;"><i class="fas fa-sun"></i> ${game.i18n.format("TRESPASSER.Chat.Sparks", { count: sparks })}</p>`);
      messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Haven.PopulationIncrease")}:</strong> +${increase} (Rank: ${newRank})</p>`);
    } else {
      messages.push(`<p class="failure" style="color:#e74c3c;font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Failure")}</p>`);
    }

    if (levelUpOccurred) {
      messages.push(`<div style="margin-top:10px; padding:5px; border:2px solid gold; text-align:center; background:rgba(255,215,0,0.1);">
        <h4 style="color:gold; margin:0;"><i class="fas fa-arrow-up"></i> HAVEN LEVEL UP! <i class="fas fa-arrow-up"></i></h4>
        <strong>New Level: ${updates["system.level"]}</strong>
      </div>`);
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<div class="trespasser-chat-card haven-report">${messages.join("")}</div>`
    });
  }

  /**
   * Step 5: Event Check
   * If no active event: Roll d10 vs Skill Bonus. Success (<=) starts a new event at current=1.
   * If active event: Clock advances by 1.
   */
  async eventCheck() {
    const actor = this.parent;
    const event = this.event;
    const isActive = !!event.title?.trim();
    
    if (isActive) {
      const nextValue = Math.min(event.current + 1, event.clock);
      await actor.update({ "system.event.current": nextValue });
      
      const isComplete = nextValue >= event.clock;
      
      await ChatMessage.create({
        content: `<div class="trespasser-chat-card haven-report">
          <h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.EventCheck")}</h3>
          <p><strong>${event.title}</strong> advances!</p>
          <div class="haven-event-status">
            <span class="label">Threat Clock:</span>
            <span class="value">${nextValue} / ${event.clock}</span>
          </div>
          ${isComplete ? `<p class="critical" style="color:#e74c3c; font-weight:bold; margin-top:10px; border:2px solid #e74c3c; padding:5px; text-align:center;">THE EVENT CLOCK IS COMPLETE!</p>` : ""}
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
    } else {
      const skillBonus = this.skillBonus;
      const roll = new foundry.dice.Roll("1d10");
      await roll.evaluate();
      
      const starts = roll.total <= skillBonus;
      
      let content = `<div class="trespasser-chat-card haven-report">
        <h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.EventCheck")}</h3>
        <p>No active event. Rolling for new threat...</p>
        <div class="haven-check-details">
          <span>DC (Skill Bonus): <strong>${skillBonus}</strong></span>
        </div>`;
      
      if (starts) {
        content += `<p class="success" style="color:#2ecc71; font-weight:bold; margin-top:8px;">A NEW EVENT STARTS!</p>
                   <p style="font-size:11px; font-style:italic;">The Judge should define the event in the Haven's Event tab.</p>`;
        await actor.update({ "system.event.current": 1 });
      } else {
        content += `<p class="failure" style="color:#95a5a6; font-style:italic; margin-top:8px;">All is quiet in the Haven this week.</p>`;
      }
      content += `</div>`;
      
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: content
      });
    }
  }

  /**
   * Helper to consume and produce items for a single hireling.
   * @param {Item} hireling
   * @param {Array} inventory - Current list of {item, quantity}
   * @returns {Object} { result: string, newInventory: Array }
   */
  async _processHirelingProduction(hireling, inventory) {
    const system = hireling.system;
    const results = [];
    let newInventory = [...inventory];

    // Check if items can be consumed
    let canConsume = true;
    const itemsToConsume = []; // { index, amount }

    for (const consumeData of system.consume) {
      const needed = (consumeData.system.quantity || 1) * system.quantity;
      const index = newInventory.findIndex(entry => this._isItemMatch(entry.item, consumeData));
      
      if (index === -1 || newInventory[index].quantity < needed) {
        canConsume = false;
        results.push(`<p class="failure">${game.i18n.format("TRESPASSER.Haven.MissingIngredients", { name: hireling.name, item: consumeData.name })}</p>`);
        break;
      }
      itemsToConsume.push({ index, amount: needed });
    }

    if (canConsume) {
      // Consume
      for (const entry of itemsToConsume) {
        newInventory[entry.index].quantity -= entry.amount;
      }
      // Clean up empty stacks
      newInventory = newInventory.filter(e => e.quantity > 0);

      // Produce
      for (const produceData of system.produce) {
        const qty = (produceData.system.quantity || 1) * system.quantity;
        const index = newInventory.findIndex(entry => this._isItemMatch(entry.item, produceData));
        
        if (index !== -1) {
          newInventory[index].quantity += qty;
        } else {
          newInventory.push({
            item: foundry.utils.duplicate(produceData),
            quantity: qty
          });
        }
        results.push(`<p class="success">${game.i18n.format("TRESPASSER.Haven.ProducedItem", { name: hireling.name, quantity: qty, item: produceData.name })}</p>`);
      }
      
      if (system.produce.length === 0 && system.consume.length > 0) {
        results.push(`<p class="success">${game.i18n.format("TRESPASSER.Haven.ConsumedOnly", { name: hireling.name })}</p>`);
      } else if (system.produce.length === 0 && system.consume.length === 0) {
        results.push(`<p>${hireling.name} ${game.i18n.localize("TRESPASSER.Haven.DidNothing")}</p>`);
      }
    }

    return { result: results.join(""), newInventory };
  }

  /**
   * Check if two items match based on name and type.
   */
  _isItemMatch(item1, item2) {
    if (item1.name !== item2.name || item1.type !== item2.type) return false;
    // Handle both Document-like objects and schema-wrapped data
    const s1 = item1.system || {};
    const s2 = item2.system || {};
    if (s1.subType !== s2.subType) return false;
    if (s1.tier !== s2.tier) return false;
    return true;
  }
}
