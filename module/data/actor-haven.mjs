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

      skillBonus: new fields.NumberField({ initial: 2, integer: true }),

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
      }), { initial: [] })
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
    const totals = {};
    for ( const key of ["military", "efficiency", "resources", "expertise", "allegiance", "appeal"] ) {
      const base = this.attributes[key] ?? 0;
      const bonus = this.bonuses?.attributes?.[key] ?? 0;
      totals[key] = base + bonus;
    }
    return totals;
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
   */
  async populationCheck() {
    const actor = this.parent;
    await ChatMessage.create({
      content: `<div class="trespasser-chat-card haven-report">
        <h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.PopulationCheck")}</h3>
        <p>${game.i18n.localize("TRESPASSER.Haven.PopulationCheckFlavor")}</p>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }

  /**
   * Step 5: Event Check
   */
  async eventCheck() {
    const actor = this.parent;
    await ChatMessage.create({
      content: `<div class="trespasser-chat-card haven-report">
        <h3>${game.i18n.localize("TRESPASSER.Haven.UpkeepSteps.EventCheck")}</h3>
        <p>${game.i18n.localize("TRESPASSER.Haven.EventCheckFlavor")}</p>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
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
