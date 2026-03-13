import { buildClockSegments } from "./character/get-data.mjs";
import { TrespasserRollDialog } from "../dialogs/roll-dialog.mjs";

const { api, sheets } = foundry.applications;

/**
 * Actor Sheet for Haven actors.
 * Implemented using ApplicationV2 (sheets.ActorSheetV2).
 */
export class TrespasserHavenSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "actor", "haven-sheet"],
    position: { width: 700, height: 800 },
    scrollable: ['[data-scrollable="true"]'],
    actions: {
      processWeek: TrespasserHavenSheet.#onProcessWeek,
      removeLeader: TrespasserHavenSheet.#onRemoveLeader,
      openLeaderSheet: TrespasserHavenSheet.#onOpenLeaderSheet,
      addChain: TrespasserHavenSheet.#onAddChain,
      removeChain: TrespasserHavenSheet.#onRemoveChain,
      toggleChain: TrespasserHavenSheet.#onToggleChain,
      updateChainName: TrespasserHavenSheet.#onUpdateChainName,
      removeHirelingFromChain: TrespasserHavenSheet.#onRemoveHirelingFromChain,
      toggleHirelingActive: TrespasserHavenSheet.#onToggleHirelingActive,
      openItemSheet: TrespasserHavenSheet.#onOpenItemSheet,
      deleteItem: TrespasserHavenSheet.#onDeleteItem,
      addHirelingToChain: TrespasserHavenSheet.#onAddHirelingToChain,
      adjustInventoryQty: TrespasserHavenSheet.#onAdjustInventoryQty,
      deleteInventoryItem: TrespasserHavenSheet.#onDeleteInventoryItem,
      withdrawInventoryItem: TrespasserHavenSheet.#onWithdrawInventoryItem,
      rollAttribute: TrespasserHavenSheet.#onRollAttribute,
      rollSkill: TrespasserHavenSheet.#onRollSkill,
      upkeepWeeksRest: TrespasserHavenSheet.#onUpkeepWeeksRest,
      upkeepPopulationCheck: TrespasserHavenSheet.#onUpkeepPopulationCheck,
      upkeepEventCheck: TrespasserHavenSheet.#onUpkeepEventCheck,
      adjustBuildClock: TrespasserHavenSheet.#onAdjustBuildClock,
      upgradeBuilding: TrespasserHavenSheet.#onUpgradeBuilding,
      editItem: TrespasserHavenSheet.#onOpenItemSheet,
      eventClockClick: TrespasserHavenSheet.#onEventClockClick,
      addProject: TrespasserHavenSheet.#onAddProject,
      removeProject: TrespasserHavenSheet.#onRemoveProject,
      projectClockClick: TrespasserHavenSheet.#onProjectClockClick
    },
    form: { 
      handler: TrespasserHavenSheet.#onSubmit,
      submitOnChange: true, 
      closeOnSubmit: false 
    },
    window: { resizable: true }
  };

  static PARTS = {
    main: {
      template: "systems/trespasser/templates/actor/haven-sheet.hbs"
    }
  };

  tabGroups = { primary: "skills" };
  
  /** @override */
  get isEditable() {
    // GMs always have edit access
    if ( game.user.isGM ) return true;

    // If the restriction setting is disabled, anyone with ownership can edit
    const isRestricted = game.settings.get("trespasser", "restrictHavenEditToLeader");
    if ( !isRestricted ) return this.document.isOwner;

    // If restricted, check if the current user owns the character assigned as leader
    const leaderId = this.document.system.leaderId;
    const leader = leaderId ? game.actors.get(leaderId) : null;
    if ( leader?.isOwner ) return true;

    return false;
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
    context.totalAttributes = system.totalAttributes;

    // Budget Info
    context.weeklyBalance = system.weeklyBalance;
    context.totalWeeklyExpenses = system.totalWeeklyExpenses;
    context.totalWeeklyIncome = system.totalWeeklyIncome;
    context.isOverBudget = (system.treasury + system.weeklyBalance) < 0;
    
    // Breakdown data
    context.breakdown = {
      income: [],
      expenses: []
    }
    
    // Expenses: Hirelings (Aggregated)
    const activeHirelings = actor.items.filter(i => i.type === "hireling" && i.system.active);
    const hirelingAggregation = {};
    activeHirelings.forEach(h => {
      const name = h.name;
      if (!hirelingAggregation[name]) {
        hirelingAggregation[name] = { count: 0, cost: 0 };
      }
      hirelingAggregation[name].count += (h.system.quantity || 1);
      hirelingAggregation[name].cost += (h.system.cost || 0) * (h.system.quantity || 1);
    });

    for (const [name, data] of Object.entries(hirelingAggregation)) {
      context.breakdown.expenses.push({
        label: `${name} (${data.count}x)`,
        value: data.cost
      });
    }

    // Expenses/Income: Strongholds
    const compStrongholds = actor.items.filter(i => i.type === "stronghold" && i.system.isCompleted);
    for (const s of compStrongholds) {
      if (s.system.income > 0) {
        context.breakdown.income.push({
          label: s.name,
          value: s.system.income
        });
      }
      if (s.system.weeklyCost > 0) {
        context.breakdown.expenses.push({
          label: s.name,
          value: s.system.weeklyCost
        });
      }
    }

    // Resolve Leader
    context.leader = system.leaderId ? game.actors.get(system.leaderId) : null;

    // Hirelings are Documents on the Actor
    context.hirelings = actor.items.filter(i => i.type === "hireling");

    // Buildings are Documents on the Actor
    const allBuildings = actor.items.filter(i => i.type === "build");
    context.completedBuildings = allBuildings.filter(b => b.system.progress >= b.system.buildClock);
    context.constructionBuildings = allBuildings.filter(b => b.system.progress < b.system.buildClock);

    // Strongholds
    const allStrongholds = actor.items.filter(i => i.type === "stronghold");
    context.completedStrongholds = allStrongholds.filter(s => s.system.progress >= s.system.buildClock).map(s => {
      const owner = s.system.ownerId ? game.actors.get(s.system.ownerId) : null;
      s.ownerName = owner ? owner.name : "";
      return s;
    });
    context.constructionStrongholds = allStrongholds.filter(s => s.system.progress < s.system.buildClock).map(s => {
      const owner = s.system.ownerId ? game.actors.get(s.system.ownerId) : null;
      s.ownerName = owner ? owner.name : "";
      return s;
    });

    context.attributes = {
      "military": "TRESPASSER.Haven.Attributes.Military",
      "efficiency": "TRESPASSER.Haven.Attributes.Efficiency",
      "resources": "TRESPASSER.Haven.Attributes.Resources",
      "expertise": "TRESPASSER.Haven.Attributes.Expertise",
      "allegiance": "TRESPASSER.Haven.Attributes.Allegiance",
      "appeal": "TRESPASSER.Haven.Attributes.Appeal"
    };

    // Inventory is data-driven stacking list from system.inventory
    context.inventory = system.inventory.map((entry, index) => ({
      ...entry,
      index,
      name: entry.item.name,
      img: entry.item.img,
      id: entry.item._id || index // Just for keys
    }));

    // Resolve Hirelings for Production Chains and track assignment
    const allAssignedIds = new Set();
    context.system.productionChains.forEach(chain => {
      chain.resolvedHirelings = chain.hirelings
        .map(id => actor.items.get(id))
        .filter(h => !!h);
      chain.hirelings.forEach(id => allAssignedIds.add(id));
    });

    // Hirelings available to be added to chains (not already in any chain)
    context.availableHirelings = context.hirelings.filter(h => !allAssignedIds.has(h.id));

    context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.notes ?? "",
      { async: true }
    );

    // Group skills into two columns for display
    const trainedSet = system.trainedSkills;
    const skillList = Object.entries(system.skills).map(([key, _]) => ({
      key,
      trained: trainedSet.has(key),
      inherited: !system.skills[key] && trainedSet.has(key), // Flag if trained via building
      label: game.i18n.localize(`TRESPASSER.Haven.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`)
    }));
    
    context.skillColumns = [
      skillList.slice(0, Math.ceil(skillList.length / 2)),
      skillList.slice(Math.ceil(skillList.length / 2))
    ];

    context.maxBuildSlots = system.maxBuildSlots;
    context.maxBuildingLimit = system.maxBuildingLimit;
    context.numConstruction = context.constructionBuildings.length;
    context.numCompleted = context.completedBuildings.length;

    // Event Info
    const event = system.event;
    context.enrichedEventDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      event.description ?? "",
      { async: true, relativeTo: this.document }
    );
    const total = Math.max(2, event.clock);
    const filled = Math.min(event.current, total);
    context.eventClockSegments = buildClockSegments(total, filled);
    context.eventClockCurrent = filled;
    context.eventClockTotal = total;
    
    // Projects Info
    context.projects = system.projects.map(p => {
      const pTotal = Math.max(2, p.clock);
      const pFilled = Math.min(p.current, pTotal);
      return {
        ...p,
        segments: buildClockSegments(pTotal, pFilled)
      };
    });

    // Arrivals
    context.enrichedArrivals = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.arrivals ?? "",
      { async: true, relativeTo: this.document }
    );

    // Notes
    context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.notes ?? "",
      { async: true, relativeTo: this.document }
    );

    return context;
  }

  /* -------------------------------------------- */
  /* Event Listeners                              */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Sync tabs (everyone can switch tabs)
    const tabs = html.querySelectorAll('.sheet-tabs .item');
    tabs.forEach(t => {
      const isActive = t.dataset.tab === this.tabGroups.primary;
      t.classList.toggle('active', isActive);
      t.addEventListener('click', (ev) => {
        this.tabGroups.primary = t.dataset.tab;
        this.render();
      });
    });

    const activeTab = html.querySelector(`.tab[data-tab="${this.tabGroups.primary}"]`);
    if (activeTab) activeTab.classList.add('active');

    // Setup drop zones - Inventory is public for all who have ownership
    const dropZones = html.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
      // Allow dropping only for inventory unless editable (GM/Leader)
      const isInvZone = zone.classList.contains('inventory-list');
      if (!this.isEditable && !isInvZone) return;

      zone.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (ev) => {
        zone.classList.remove('drag-over');
        this.#onDrop(ev);
      });
    });

    // From here, only for GMs/Leaders
    if (!this.isEditable) return;
  }

  /* -------------------------------------------- */
  /* Drag & Drop                                  */
  /* -------------------------------------------- */

  async #onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const zone = event.currentTarget;
    const action = zone.dataset.action;
    
    const data = TextEditor.getDragEventData(event);
    
    if (action === "dropLeader") {
      if (data.type !== "Actor") return;
      const leader = await fromUuid(data.uuid);
      if (leader?.type !== "character") {
        ui.notifications.warn(game.i18n.localize("TRESPASSER.Haven.CharactersOnly"));
        return;
      }
      await this.document.update({ "system.leaderId": leader.id });
    } 
    else {
      // General drop - Add to custom inventory
      if (data.type !== "Item") return;
      const item = await fromUuid(data.uuid);
      if (!item) return;

      // Handle special types that should be embedded documents
      if (["hireling", "room", "build", "stronghold"].includes(item.type)) {
        if (item.parent === this.document) return; // Already here

        // Check limits if not bypassed
        if (item.type === "build" && !game.settings.get("trespasser", "bypassHavenBuildingLimits")) {
          const system = this.document.system;
          const allBuildings = this.document.items.filter(i => i.type === "build");
          const numConstruction = allBuildings.filter(b => b.system.progress < b.system.buildClock).length;
          const numCompleted = allBuildings.filter(b => b.system.progress >= b.system.buildClock).length;

          if (numConstruction >= system.maxBuildSlots) {
            ui.notifications.warn(game.i18n.format("TRESPASSER.Haven.Warning.NoBuildSlots", { max: system.maxBuildSlots }));
            return;
          }
          if (numCompleted >= system.maxBuildingLimit) {
            ui.notifications.warn(game.i18n.format("TRESPASSER.Haven.Warning.BuildingLimitReached", { max: system.maxBuildingLimit }));
            return;
          }
        }

        return Item.create(item.toObject(), { parent: this.document });
      }

      const inventory = foundry.utils.duplicate(this.document.system.inventory);
      const itemData = item.toObject();
      const qty = itemData.system.quantity || 1;

      // Check if matches existing
      const matchIndex = inventory.findIndex(entry => 
        this.document.system._isItemMatch(entry.item, itemData)
      );

      if (matchIndex !== -1) {
        inventory[matchIndex].quantity += qty;
      } else {
        inventory.push({ item: itemData, quantity: qty });
      }

      await this.document.update({ "system.inventory": inventory });
      
      // If the item was on this actor, delete the document
      if (item.parent === this.document) await item.delete();
    }
  }

  /* -------------------------------------------- */
  /* Action Handlers                              */
  /* -------------------------------------------- */

  static async #onProcessWeek(event, target) {
    await this.document.system.resolveHirelings();
  }

  static async #onUpkeepWeeksRest(event, target) {
    await this.document.system.weeksRest();
  }

  static async #onUpkeepPopulationCheck(event, target) {
    await this.document.system.populationCheck();
  }

  static async #onUpkeepEventCheck(event, target) {
    await this.document.system.eventCheck();
  }

  static async #onRemoveLeader(event, target) {
    await this.document.update({ "system.leaderId": "" });
  }

  static #onOpenLeaderSheet(event, target) {
    const leader = game.actors.get(this.document.system.leaderId);
    if (leader) leader.sheet.render(true);
  }

  static async #onAddChain(event, target) {
    const chains = [...this.document.system.productionChains];
    chains.push({
      id: foundry.utils.randomID(),
      name: game.i18n.localize("TRESPASSER.Haven.NewChain"),
      active: true,
      hirelings: []
    });
    await this.document.update({ "system.productionChains": chains });
  }

  static async #onRemoveChain(event, target) {
    const index = parseInt(target.dataset.chainIndex);
    const chains = [...this.document.system.productionChains];
    chains.splice(index, 1);
    await this.document.update({ "system.productionChains": chains });
  }

  static async #onToggleChain(event, target) {
    const index = parseInt(target.dataset.chainIndex);
    const chains = foundry.utils.duplicate(this.document.system.productionChains);
    const chain = chains[index];
    const active = target.checked;
    
    chain.active = active;

    // Update the document
    await this.document.update({ "system.productionChains": chains });

    // Also update all hirelings in the chain to match the active state
    const hirelingUpdates = chain.hirelings.map(id => ({
      _id: id,
      "system.active": active
    }));

    if ( hirelingUpdates.length ) {
      await this.document.updateEmbeddedDocuments("Item", hirelingUpdates);
    }
  }

  static async #onUpdateChainName(event, target) {
    // Only update on change or blur if needed, here we might rely on submitOnChange
    // But since it's an array field, we might need manual handling if we want it snappy
    const index = parseInt(target.dataset.chainIndex);
    const chains = foundry.utils.duplicate(this.document.system.productionChains);
    chains[index].name = target.value;
    await this.document.update({ "system.productionChains": chains });
  }

  static async #onRemoveHirelingFromChain(event, target) {
    const chainIndex = parseInt(target.dataset.chainIndex);
    const hirelingIndex = parseInt(target.dataset.hirelingIndex);
    const chains = foundry.utils.duplicate(this.document.system.productionChains);
    chains[chainIndex].hirelings.splice(hirelingIndex, 1);
    await this.document.update({ "system.productionChains": chains });
  }

  static async #onAddHirelingToChain(event, target) {
    const chainIndex = parseInt(target.dataset.chainIndex);
    const select = target.closest(".add-hireling-to-chain-container").querySelector("select");
    const itemId = select.value;
    if (!itemId) return;

    const chains = foundry.utils.duplicate(this.document.system.productionChains);
    const chain = chains[chainIndex];
    
    // Safety check: remove from any other chain (though context prep should prevent this)
    for (const c of chains) {
      c.hirelings = c.hirelings.filter(id => id !== itemId);
    }

    chain.hirelings.push(itemId);
    
    // Update the document
    await this.document.update({ "system.productionChains": chains });

    // Sync newly added hireling status with chain status
    const hireling = this.document.items.get(itemId);
    if ( hireling ) {
      await hireling.update({ "system.active": chain.active });
    }
  }

  static async #onAdjustInventoryQty(event, target) {
    const index = parseInt(target.closest("[data-index]").dataset.index);
    const delta = parseInt(target.dataset.delta);
    const inventory = foundry.utils.duplicate(this.document.system.inventory);
    
    if (inventory[index]) {
      inventory[index].quantity = Math.max(0, inventory[index].quantity + delta);
      if (inventory[index].quantity === 0) inventory.splice(index, 1);
      await this.document.update({ "system.inventory": inventory });
    }
  }

  static async #onDeleteInventoryItem(event, target) {
    const index = parseInt(target.closest("[data-index]").dataset.index);
    const inventory = foundry.utils.duplicate(this.document.system.inventory);
    
    foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.DeleteItemTitle") },
      content: `<p>${game.i18n.localize("TRESPASSER.DeleteItemContent")}</p>`,
      yes: {
        callback: async () => {
          inventory.splice(index, 1);
          await this.document.update({ "system.inventory": inventory });
        }
      }
    });
  }

  static async #onWithdrawInventoryItem(event, target) {
    const index = parseInt(target.closest("[data-index]").dataset.index);
    const inventory = foundry.utils.duplicate(this.document.system.inventory);
    const entry = inventory[index];
    if (!entry) return;

    // Get the character receiving the item
    const controlledTokens = canvas.tokens.controlled;
    if (controlledTokens.length === 0) return;

    const receiverToken = controlledTokens[0];
    const receiverActor = receiverToken.actor;

    // Ensure it's a character
    if (receiverActor?.type !== "character") {
      ui.notifications.error(game.i18n.localize("TRESPASSER.Haven.TransferToCharacterOnly"));
      return;
    }

    // Transfer item
    const itemData = foundry.utils.duplicate(entry.item);
    itemData.system.quantity = 1;
    await receiverActor.createEmbeddedDocuments("Item", [itemData]);

    // Reduce quantity in internal inventory
    entry.quantity -= 1;
    if (entry.quantity <= 0) inventory.splice(index, 1);
    await this.document.update({ "system.inventory": inventory });
    
    ui.notifications.info(game.i18n.format("TRESPASSER.Haven.WithdrawnToActor", { 
      name: itemData.name,
      actor: receiverActor.name 
    }));
  }

  static async #onToggleHirelingActive(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) await item.update({ "system.active": target.checked });
  }

  static #onOpenItemSheet(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;
    
    foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("TRESPASSER.DeleteItemTitle") },
      content: `<p>${game.i18n.format("TRESPASSER.DeleteItemContent", { name: item.name })}</p>`,
      yes: { callback: () => item.delete() }
    });
  }

  static async #onRollAttribute(event, target) {
    const attrKey = target.dataset.attribute;
    const totals = this.document.system.totalAttributes;
    const attrVal = totals[attrKey] ?? 0;
    const label = game.i18n.localize(`TRESPASSER.Haven.Attributes.${attrKey.charAt(0).toUpperCase() + attrKey.slice(1)}`);
    
    const result = await TrespasserRollDialog.wait({
      dice: "1d20",
      showCD: true,
      cd: 10,
      bonuses: [
        { label, value: attrVal }
      ]
    }, { title: `${label} Check` });

    if (!result) return;

    const formula = `1d20 + ${attrVal} + ${result.modifier}`;
    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const dc = result.cd ?? 10;
    const diff = roll.total - dc;
    const isHit = diff >= 0;
    const sparks = isHit ? Math.floor(diff / 5) : 0;
    const shadows = !isHit ? Math.floor(Math.abs(diff) / 5) : 0;
    const diceResult = roll.dice[0].results[0].result;

    let resultsHtml = `
      <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>VS CD ${dc}</strong>
          <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Success") : game.i18n.localize("TRESPASSER.Chat.Failure")}</span>
        </div>
        <div style="display:flex;gap:10px;font-size:11px;">
          <span style="color:#64b5f6;">${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</span>
          <span style="color:#9575cd;">${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</span>
        </div>
      </div>
    `;

    const flavor = `
      <div class="trespasser-chat-card">
        <h3>${this.document.name}: ${label}</h3>
        <p><strong>${game.i18n.localize("TRESPASSER.Chat.RollTotal")}</strong> ${roll.total} <span style="font-size:10px;color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
        ${resultsHtml}
      </div>
    `;
    
    return roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      flavor
    });
  }

  static async #onRollSkill(event, target) {
    const skillKey = target.dataset.skill;
    const trained = target.dataset.trained === "true";
    const actor = this.document;
    const system = actor.system;
    const totals = system.totalAttributes;
    const skillBonusValue = trained ? system.skillBonus : 0;
    const skillLabel = game.i18n.localize(`TRESPASSER.Haven.Skills.${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)}`);

    const attributes = [
      { key: "military", label: game.i18n.localize("TRESPASSER.Haven.Attributes.Military") },
      { key: "efficiency", label: game.i18n.localize("TRESPASSER.Haven.Attributes.Efficiency") },
      { key: "resources", label: game.i18n.localize("TRESPASSER.Haven.Attributes.Resources") },
      { key: "expertise", label: game.i18n.localize("TRESPASSER.Haven.Attributes.Expertise") },
      { key: "allegiance", label: game.i18n.localize("TRESPASSER.Haven.Attributes.Allegiance") },
      { key: "appeal", label: game.i18n.localize("TRESPASSER.Haven.Attributes.Appeal") }
    ];

    const chosenAttr = await foundry.applications.api.DialogV2.wait({
      window: { title: `${skillLabel} Check`, classes: ["trespasser", "dialog", "haven-attr-picker"] },
      content: `
        <div class="dialog-content">
          <p style="margin-bottom:12px;">
            ${game.i18n.localize("TRESPASSER.Dialog.SkillCheckQ")}
            ${trained ? `<em>${game.i18n.format("TRESPASSER.Dialog.SkillCheckBonus", { skill: system.skillBonus })}</em>` : ""}
          </p>
        </div>`,
      buttons: [
        ...attributes.map(attr => ({
          action: attr.key,
          label: `${attr.label} (${totals[attr.key] ?? 0})`,
          classes: ["trp-attr-btn"]
        })),
        { action: "cancel", label: game.i18n.localize("TRESPASSER.Dialog.Cancel"), default: true }
      ]
    });

    if ( !chosenAttr || chosenAttr === "cancel" ) return;

    const attrVal = totals[chosenAttr] ?? 0;
    const label = game.i18n.localize(`TRESPASSER.Haven.Attributes.${chosenAttr.charAt(0).toUpperCase() + chosenAttr.slice(1)}`);
    
    const result = await TrespasserRollDialog.wait({
      dice: "1d20",
      showCD: true,
      cd: 10,
      bonuses: [
        { label: label, value: attrVal },
        { label: skillLabel, value: skillBonusValue }
      ]
    }, { title: `${skillLabel} Check` });

    if (!result) return;

    const formula = `1d20 + ${attrVal} + ${skillBonusValue} + ${result.modifier}`;
    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const dc = result.cd ?? 10;
    const diff = roll.total - dc;
    const isHit = diff >= 0;
    const sparks = isHit ? Math.floor(diff / 5) : 0;
    const shadows = !isHit ? Math.floor(Math.abs(diff) / 5) : 0;
    const diceResult = roll.dice[0].results[0].result;

    let resultsHtml = `
      <div class="target-result" style="border-top:1px solid var(--trp-border-light);padding-top:5px;margin-top:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>VS CD ${dc}</strong>
          <span class="${isHit ? "hit-text" : "miss-text"}" style="font-weight:bold;">${isHit ? game.i18n.localize("TRESPASSER.Chat.Success") : game.i18n.localize("TRESPASSER.Chat.Failure")}</span>
        </div>
        <div style="display:flex;gap:10px;font-size:11px;">
          <span style="color:#64b5f6;">${game.i18n.format("TRESPASSER.Chat.Sparks",  { count: sparks  })}</span>
          <span style="color:#9575cd;">${game.i18n.format("TRESPASSER.Chat.Shadows", { count: shadows })}</span>
        </div>
      </div>
    `;

    const flavor = `
      <div class="trespasser-chat-card">
        <h3>${actor.name}: ${skillLabel} (${label})</h3>
        <p><strong>${game.i18n.localize("TRESPASSER.Chat.RollTotal")}</strong> ${roll.total} <span style="font-size:10px;color:var(--trp-text-dim);">(d20: ${diceResult})</span></p>
        ${resultsHtml}
      </div>
    `;
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor
    });
  }

  static async #onAdjustBuildClock(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const delta = parseInt(target.dataset.delta);
    const item = this.document.items.get(itemId);
    if (!item) return;

    const newProgress = Math.clamp((item.system.progress || 0) + delta, 0, item.system.buildClock);
    await item.update({ "system.progress": newProgress });

    // Handle replacement upon completion
    if ( newProgress >= item.system.buildClock && item.system.replacesId ) {
      const actor = this.document;
      const targetId = item.system.replacesId;
      const target = actor.items.get(targetId);
      if ( target ) {
        await target.delete();
        await item.update({ "system.replacesId": "" });
        ui.notifications.info(`${item.name} completion replaced ${target.name}.`);
      }
    }
  }

  static async #onUpgradeBuilding(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.document.items.get(itemId);
    if ( !item || !item.system.upgradeTo ) return;

    const template = await fromUuid(item.system.upgradeTo);
    if ( !template || template.type !== "build" ) {
      ui.notifications.error("Upgrade template not found or invalid.");
      return;
    }

    const itemData = template.toObject();
    itemData.system.progress = 0;
    itemData.system.replacesId = item.id;

    // Check slots if not bypassed
    if (!game.settings.get("trespasser", "bypassHavenBuildingLimits")) {
      const system = this.document.system;
      const construction = this.document.items.filter(i => i.type === "build" && i.system.progress < i.system.buildClock);
      
      if (construction.length >= system.maxBuildSlots) {
        ui.notifications.warn(game.i18n.format("TRESPASSER.Haven.Warning.NoBuildSlots", { max: system.maxBuildSlots }));
        return;
      }
    }

    await this.document.createEmbeddedDocuments("Item", [itemData]);
    ui.notifications.info(`Upgrading ${item.name} to ${template.name}. New construction has started.`);
  }

  /**
   * Manual form submission handler for AppV2.
   */
  static async #onSubmit(event, form, formData) {
    // For AppV2 and documents, updates are often clearer as flat objects
    await this.document.update(formData.object);
  }

  static async #onEventClockClick(event, target) {
    const index = parseInt(target.dataset.index);
    if ( isNaN(index) ) return;
    
    const total = Number(this.document.system.event.clock);
    const current = Number(this.document.system.event.current);
    const newValue = (current === index + 1) ? index : Math.min(index + 1, total);
    
    return this.document.update({ "system.event.current": newValue });
  }

  static async #onAddProject(event, target) {
    const projects = [...this.document.system.projects];
    projects.push({
      id: foundry.utils.randomID(),
      name: "New Project",
      clock: 4,
      current: 0
    });
    await this.document.update({ "system.projects": projects });
  }

  static async #onRemoveProject(event, target) {
    const projectId = target.closest("[data-project-id]")?.dataset.projectId;
    const projects = this.document.system.projects.filter(p => p.id !== projectId);
    await this.document.update({ "system.projects": projects });
  }

  static async #onProjectClockClick(event, target) {
    const clockWidget = target.closest(".trespasser-clock");
    const projectId = clockWidget?.dataset.id;
    const index = parseInt(target.dataset.index);
    if ( isNaN(index) || !projectId ) return;

    const projects = this.document.system.toObject().projects;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const total = Number(project.clock);
    const newValue = (project.current === index + 1) ? index : Math.min(index + 1, total);
    project.current = newValue;
    
    // Clean projects array to ensure all numbers are actual Numbers (not strings)
    const cleanedProjects = projects.map(p => ({
      ...p,
      clock: Number(p.clock),
      current: Number(p.current)
    }));

    await this.document.update({ "system.projects": cleanedProjects });
  }
  
}
