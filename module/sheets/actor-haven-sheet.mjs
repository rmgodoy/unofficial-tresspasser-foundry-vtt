const { api, sheets } = foundry.applications;

/**
 * Actor Sheet for Haven actors.
 * Implemented using ApplicationV2 (sheets.ActorSheetV2).
 */
export class TrespasserHavenSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["trespasser", "sheet", "actor", "haven-sheet"],
    position: { width: 600, height: 700 },
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
      upkeepEventCheck: TrespasserHavenSheet.#onUpkeepEventCheck
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

  tabGroups = { primary: "production" };
  
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
    context.totalAttributes = system.totalAttributes;

    // Budget Info
    context.totalWeeklyCost = actor.system.totalWeeklyCost;
    context.isOverBudget = actor.system.totalWeeklyCost > system.treasury;

    // Resolve Leader
    context.leader = system.leaderId ? game.actors.get(system.leaderId) : null;

    // Hirelings are Documents on the Actor
    context.hirelings = actor.items.filter(i => i.type === "hireling");

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
    const skillList = Object.entries(system.skills).map(([key, trained]) => ({
      key,
      trained,
      label: game.i18n.localize(`TRESPASSER.Haven.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`)
    }));
    
    context.skillColumns = [
      skillList.slice(0, Math.ceil(skillList.length / 2)),
      skillList.slice(Math.ceil(skillList.length / 2))
    ];

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
      if (!item || item.type === "hireling" || item.type === "room") return;

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
    const formula = `1d20 + ${attrVal}`;
    const roll = new foundry.dice.Roll(formula);
    const flavor = `${this.document.name}: ${label}`;
    
    await roll.evaluate();
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

    const formatAttrBtn = (key, label) => {
      const val = totals[key] ?? 0;
      return `<button class="trp-attr-btn" data-attr="${key}">${label} (${val})</button>`;
    };

    const content = `
      <div class="dialog-content">
        <p style="margin-bottom:12px;">
          ${game.i18n.localize("TRESPASSER.Dialog.SkillCheckQ")}
          ${trained ? `<em>${game.i18n.format("TRESPASSER.Dialog.SkillCheckBonus", { skill: system.skillBonus })}</em>` : ""}
        </p>
        <div class="trp-attr-pick">
          ${formatAttrBtn("military",   game.i18n.localize("TRESPASSER.Haven.Attributes.Military"))}
          ${formatAttrBtn("efficiency", game.i18n.localize("TRESPASSER.Haven.Attributes.Efficiency"))}
          ${formatAttrBtn("resources",  game.i18n.localize("TRESPASSER.Haven.Attributes.Resources"))}
          ${formatAttrBtn("expertise",  game.i18n.localize("TRESPASSER.Haven.Attributes.Expertise"))}
          ${formatAttrBtn("allegiance", game.i18n.localize("TRESPASSER.Haven.Attributes.Allegiance"))}
          ${formatAttrBtn("appeal",     game.i18n.localize("TRESPASSER.Haven.Attributes.Appeal"))}
        </div>
      </div>`;

    new Dialog({
      title: `${skillLabel} Check`,
      content: content,
      buttons: {
        cancel: { label: game.i18n.localize("TRESPASSER.Dialog.Cancel") }
      },
      default: "cancel",
      render: (html) => {
        html.find(".trp-attr-btn").on("click", async (ev) => {
          const chosenAttr = ev.currentTarget.dataset.attr;
          const attrVal = totals[chosenAttr] ?? 0;
          const label = game.i18n.localize(`TRESPASSER.Haven.Attributes.${chosenAttr.charAt(0).toUpperCase() + chosenAttr.slice(1)}`);
          
          const formula = `1d20 + ${attrVal} + ${skillBonusValue}`;
          const roll = new foundry.dice.Roll(formula);
          const flavor = `${actor.name}: ${skillLabel} (${label})`;
          
          await roll.evaluate();
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor
          });
          // Close the dialog manually since we used custom buttons
          const dialog = html.closest(".window-app");
          if (dialog) {
            const appId = dialog.dataset.appid;
            ui.windows[appId]?.close();
          }
        });
      }
    }, { classes: ["trespasser", "dialog"] }).render(true);
  }

  /**
   * Manual form submission handler for AppV2.
   */
  static async #onSubmit(event, form, formData) {
    // For AppV2 and documents, updates are often clearer as flat objects
    await this.document.update(formData.object);
  }
}
