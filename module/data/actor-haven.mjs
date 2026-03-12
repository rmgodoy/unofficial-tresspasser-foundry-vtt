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
      populationState: new fields.StringField({ initial: "growth", choices: ["growth", "decline"] }),
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
      }),
      arrivals: new fields.HTMLField({ initial: "" })
    };
  }

  /**
   * Total expenses per week (Hirelings + Completed Strongholds).
   * @returns {number}
   */
  get totalWeeklyExpenses() {
    const actor = this.parent;
    const hirelings = actor.items.filter(i => i.type === "hireling" && i.system.active);
    const completedStrongholds = actor.items.filter(i => i.type === "stronghold" && i.system.isCompleted);
    
    const hirelingCost = hirelings.reduce((total, h) => total + (h.system.cost * h.system.quantity), 0);
    const strongholdCost = completedStrongholds.reduce((total, s) => total + (s.system.weeklyCost || 0), 0);
    
    return hirelingCost + strongholdCost;
  }

  /**
   * Total income per week (Completed Strongholds).
   * @returns {number}
   */
  get totalWeeklyIncome() {
    const actor = this.parent;
    const completedStrongholds = actor.items.filter(i => i.type === "stronghold" && i.system.isCompleted);
    return completedStrongholds.reduce((total, s) => total + (s.system.income || 0), 0);
  }

  /**
   * Total balance per week (Income - Expenses).
   * @returns {number}
   */
  get weeklyBalance() {
    return this.totalWeeklyIncome - this.totalWeeklyExpenses;
  }

  /**
   * Get calculated total attributes (Base + Bonus)
   * @returns {Record<string, number>}
   */
  get totalAttributes() {
    const actor = this.parent;
    const totals = {};
    const buildings = actor.items.filter(i => i.type === "build" && (i.system.progress >= i.system.buildClock));
    const strongholds = actor.items.filter(i => i.type === "stronghold" && (i.system.progress >= i.system.buildClock));

    for ( const key of ["military", "efficiency", "resources", "expertise", "allegiance", "appeal"] ) {
      const base = this.attributes[key] ?? 0;
      const bonus = (this.bonuses?.attributes?.[key] ?? 0);
      
      // Add building bonuses
      const buildingBonus = buildings.reduce((sum, b) => {
        const itemBonuses = b.system.bonuses || [];
        return sum + itemBonuses.filter(attr => attr.attribute === key).reduce((s, a) => s + a.value, 0);
      }, 0);

      // Add stronghold bonuses
      const strongholdBonus = strongholds.reduce((sum, s) => {
        const itemBonuses = s.system.bonuses || [];
        return sum + itemBonuses.filter(attr => attr.attribute === key).reduce((s, a) => s + a.value, 0);
      }, 0);

      totals[key] = base + bonus + buildingBonus + strongholdBonus;
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
   * Returns true if the Haven has reached the population rank required for the next level.
   */
  get isStagnant() {
    if (this.level >= 9) return false;
    const thresholds = this.populationThresholds;
    const requiredRank = thresholds[this.level + 1];
    return this.populationRank >= requiredRank;
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
    const balance = this.weeklyBalance;
    const expenses = this.totalWeeklyExpenses;
    const income = this.totalWeeklyIncome;

    if (this.treasury + balance < 0) {
      ui.notifications.error(game.i18n.format("TRESPASSER.Haven.InsufficientFundsError", { cost: expenses - income, treasury: this.treasury }));
      return false;
    }
    
    const newTreasury = Math.max(0, this.treasury + balance);
    const updates = { "system.treasury": newTreasury };

    // Identify assigned hirelings
    const assignedHirelingIds = new Set();
    for (const chain of this.productionChains) {
      if (!chain.active) continue;
      for (const hid of chain.hirelings) assignedHirelingIds.add(hid);
    }

    const messages = [];
    messages.push(`<h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.ResolveHirelings")}</h3>`);
    messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Haven.WeeklyExpenses")}:</strong> ${expenses}</p>`);
    messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Haven.WeeklyIncome")}:</strong> ${income}</p>`);
    messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Haven.WeeklyBalance")}:</strong> ${balance >= 0 ? "+" : ""}${balance}</p>`);

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
    
    // 4. Process Strongholds (progression and features)
    const strongholds = actor.items.filter(i => i.type === "stronghold");
    if (strongholds.length > 0) {
      messages.push(`<h4>${game.i18n.localize("TRESPASSER.Haven.Strongholds")}</h4>`);
      for (const s of strongholds) {
        if (s.system.isCompleted) continue; // Already handled for income/outcome
        
        const oldProgress = s.system.progress;
        const newProgress = Math.min(s.system.buildClock, oldProgress + 1);
        await s.update({ "system.progress": newProgress });
        
        if (newProgress === s.system.buildClock) {
          messages.push(`<p style="color:#2ecc71;"><strong>${s.name} ${game.i18n.localize("TRESPASSER.Haven.Completed")}!</strong></p>`);
          // Apply features to owner if set
          if (s.system.ownerId) {
            const owner = game.actors.get(s.system.ownerId);
            if (owner && s.system.features?.length > 0) {
              await owner._applyLinkedItems(s.system.features);
              ui.notifications.info(`Stronghold ${s.name} features applied to ${owner.name}.`);
            }
          }
        } else {
          messages.push(`<p>${s.name}: ${game.i18n.localize("TRESPASSER.Haven.Progress")} ${newProgress}/${s.system.buildClock}</p>`);
        }
      }
    }

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
    const isStagnant = this.isStagnant;
    const state = this.populationState || "growth";
    const messages = [];
    messages.push(`<h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.PopulationCheck")}</h3>`);
    
    const oldRank = this.populationRank || 0;
    let newRank = oldRank;
    const updates = {};
    
    // Check type based on state
    if (state === "growth") {
      const appeal = this.totalAttributes.appeal ?? 0;
      const isHospitality = this.trainedSkills.has("hospitality");
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

      // Rank Increase: +1 for success, +1 per spark
      let increase = isSuccess ? (1 + sparks) : 0;
      const nextThreshold = (this.level < 9) ? this.populationThresholds[this.level + 1] : Infinity;
      
      if (oldRank >= nextThreshold && increase > 0) {
        messages.push(`<p class="warning" style="color:#f39c12; font-weight:bold; margin-bottom:4px;">${game.i18n.localize("TRESPASSER.Haven.Stagnant")}</p>`);
        messages.push(`<p style="font-size:11px; font-style:italic;">Rank growth blocked by level. Rolling for Arrivals only.</p>`);
        increase = 0;
      } else if (oldRank + increase > nextThreshold) {
        increase = nextThreshold - oldRank;
        messages.push(`<p class="warning" style="font-size:11px; font-style:italic; color:#f39c12;">Growth capped at rank ${nextThreshold} until level up.</p>`);
      }
      
      newRank = oldRank + increase;
      updates["system.populationRank"] = newRank;

      if (isSuccess) {
        messages.push(`<p class="success" style="color:#2ecc71;font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Success")}</p>`);
        if (increase > 0) messages.push(`<p><strong>${game.i18n.localize("TRESPASSER.Haven.PopulationIncrease")}:</strong> +${increase} (Rank: ${newRank})</p>`);
        
        if (sparks > 0) {
          messages.push(`<p style="color:#64b5f6;"><i class="fas fa-sun"></i> ${game.i18n.format("TRESPASSER.Chat.Sparks", { count: sparks })}</p>`);
          messages.push(`<p style="color:#64b5f6; font-weight:bold;"><i class="fas fa-walking"></i> HAVEN ARRIVALS!</p>`);
          messages.push(`<p style="font-size:11px; font-style:italic;">The Judge rolls on the Haven Arrivals table and fills the Arrivals tab.</p>`);
        }
      } else {
        messages.push(`<p class="failure" style="color:#e74c3c;font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Failure")}</p>`);
      }

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<div class="trespasser-chat-card haven-report">${messages.join("")}</div>`
      });
    } else {
      // DECLINE
      const allegiance = this.totalAttributes.allegiance ?? 0;
      const isFaith = this.trainedSkills.has("faith");
      const bonus = isFaith ? this.skillBonus : 0;
      const formula = `1d20 + ${allegiance} + ${bonus}`;

      const roll = new foundry.dice.Roll(formula);
      await roll.evaluate();

      const total = roll.total;
      const isSuccess = total >= 20;
      
      if (isSuccess) {
        messages.push(`<p class="success" style="color:#2ecc71;font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Success")} (Decline Halted)</p>`);
        messages.push(`<p>Population rank remains stable at ${oldRank}.</p>`);
      } else {
        // Failure: Lose 1 rank. (One per shadow - we'll ignore shadow specifics for now as per rules image core)
        messages.push(`<p class="failure" style="color:#e74c3c;font-weight:bold;">${game.i18n.localize("TRESPASSER.Chat.Failure")} (Population Decline)</p>`);
        newRank = Math.max(0, oldRank - 1);
        updates["system.populationRank"] = newRank;
        messages.push(`<p><strong>Population Rank:</strong> -1 (Now: ${newRank})</p>`);
      }

      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<div class="trespasser-chat-card haven-report">${messages.join("")}</div>`
      });
    }

    // Level up check is separate
    const currentLevel = this.level || 0;
    if (currentLevel < 9) {
      const nextLevel = currentLevel + 1;
      const thresholds = this.populationThresholds;
      const requiredRank = thresholds[nextLevel];
      const characters = game.actors.filter(a => a.type === "character");
      const partyLevel = characters.length ? Math.max(...characters.map(c => c.system.level ?? 0)) : 0;
      
      if (newRank >= requiredRank && partyLevel >= nextLevel) {
        updates["system.level"] = nextLevel;
        ui.notifications.info(`${actor.name} reached Level ${nextLevel}!`);
      }
    }

    if (Object.keys(updates).length) await actor.update(updates);
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

  /**
   * Syncs stronghold features to its owner.
   * Handles:
   * - Removing features from previous owner if owner changed.
   * - Removing features if stronghold is no longer completed.
   * - Adding features if stronghold is completed and has an owner.
   * @param {Item} stronghold - The stronghold item document.
   * @param {Object} [delta] - The update delta, if called from a hook.
   */
  async syncStrongholdBenefit(stronghold, delta = {}) {
    console.warn("here");
    const actor = this.parent;
    if (stronghold.type !== "stronghold") return;
    
    const strongholdUuid = stronghold.uuid;
    const isCompleted = stronghold.system.isCompleted;
    const ownerId = stronghold.system.ownerId;
    
    console.log(`Trespasser | Syncing Stronghold: ${stronghold.name} (${strongholdUuid})`);
    console.log(`Trespasser | Status: Completed=${isCompleted}, OwnerID=${ownerId}`);

    const allCharacters = game.actors.filter(a => a.type === "character");
    
    // 1. Cleanup
    for (const char of allCharacters) {
      const existing = char.items.filter(i => i.getFlag("trespasser", "strongholdSource") === strongholdUuid);
      if (existing.length > 0) {
        console.log(`Trespasser | Removing ${existing.length} features from ${char.name}`);
        await char.deleteEmbeddedDocuments("Item", existing.map(i => i.id));
      }
    }

    // 2. Addition
    if (!delta.deleted && isCompleted && ownerId) {
      const owner = game.actors.get(ownerId);
      if (owner) {
        const features = stronghold.system.features || [];
        console.log(`Trespasser | Applying ${features.length} features to ${owner.name}`);
        
        for (const feat of features) {
            console.log(`Trespasser | Looking for feature UUID: ${feat.uuid}`);
            const sourceItem = await fromUuid(feat.uuid);
            if (!sourceItem) {
              console.warn(`Trespasser | FAILED: Could not find feature with UUID: ${feat.uuid}`);
              continue;
            }

            const itemData = sourceItem.toObject();
            delete itemData._id;
            
            // Mark source
            itemData.flags = itemData.flags || {};
            itemData.flags.trespasser = itemData.flags.trespasser || {};
            itemData.flags.trespasser.strongholdSource = strongholdUuid;
            
            console.log(`Trespasser | Attempting to create feature ${sourceItem.name} on ${owner.name}`);
            try {
              const created = await owner.createEmbeddedDocuments("Item", [itemData]);
              if (created.length > 0) {
                console.log(`Trespasser | SUCCESS: Created ${sourceItem.name} (ID: ${created[0].id})`);
              } else {
                console.error(`Trespasser | FAILED: creation returned empty array for ${sourceItem.name}`);
              }
            } catch (err) {
              console.error(`Trespasser | ERROR creating feature:`, err);
            }
        }
        ui.notifications.info(`Stronghold ${stronghold.name} features updated for ${owner.name}.`);
      } else {
        console.warn(`Trespasser | FAILED: No Actor found for ID ${ownerId}`);
      }
    }
  }
}
