/**
 * Custom Actor document class for Trespasser TTRPG.
 */
export class TrespasserActor extends Actor {

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    // The TypeDataModel's prepareDerivedData handles combat stat computation.
    // Any actor-level cross-item derived data can go here in the future.
  }

  /** @override */
  async _preCreate(data, options, user) {
    if ( await super._preCreate(data, options, user) === false ) return false;
    
    // Set default images
    if (!data.img || data.img === "icons/svg/mystery-man.svg") {
      if (this.type === "character") {
        this.updateSource({ img: "systems/trespasser/assets/icons/pesant.png" });
      } else if (this.type === "creature") {
        this.updateSource({ img: "systems/trespasser/assets/icons/creature.png" });
      }
    }
  }

  /**
   * Roll a skill check against one of the core attributes.
   * @param {string} attribute - "mighty" | "agility" | "intellect" | "spirit"
   */
  async rollSkillCheck(attribute) {
    const data = this.system;
    const attrValue = data.attributes[attribute] ?? 0;
    const skillDie = data.skill_die || "d6";
    const formula = `1${skillDie} + ${attrValue}`;

    const roll = new foundry.dice.Roll(formula);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${game.i18n.localize(`TRESPASSER.Attributes.${attribute.charAt(0).toUpperCase() + attribute.slice(1)}`)} Check`,
    });
    return roll;
  }

  /**
   * Equip an item from the actor's inventory.
   * @param {string} itemId
   */
  async equipItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;

    if (item.type === "armor") {
      const placement = item.system.placement;
      const weight = item.system.weight;

      // 1. Check if slot is occupied (by an item actually marked as equipped)
      const currentOccupant = this.items.find(i => i.type === "armor" && i.system.equipped && i.system.placement === placement);
      if (currentOccupant) {
        ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.SlotOccupied", { placement: placement, name: currentOccupant.name }));
        return;
      }

      // 2. Check heavy armor limit
      if (weight === "H") {
        const heavyEquipped = this.items.some(i => i.type === "armor" && i.system.equipped && i.system.weight === "H");
        if (heavyEquipped) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.HeavyArmorLimit"));
          return;
        }
      }

      // 3. Update Item
      await item.update({ "system.equipped": true });

      // Apply linked effects via fromUuid
      if (item.system.effects && item.system.effects.length > 0) {
        await this._applyLinkedItems(item.system.effects);
      }

      // 4. Update Actor Equipment Slot and Combat Snapshot
      const updates = {
        [`system.equipment.${placement}`]: itemId,
        [`system.combat.equipment_snapshot.${placement}`]: {
          die: item.system.armorDie,
          effect: item.system.effects && item.system.effects.length > 0 ? item.system.effects.map(e => e.name).join(", ") : "",
          used: item.system.broken
        }
      };
      await this.update(updates);
    } else if (item.type === "weapon") {
      const is2H = !!item.system.properties?.twoHanded;
      const equipment = this.system.equipment || {};
      const mainHandId = equipment.main_hand || "";
      const offHandId = equipment.off_hand || "";
      const shieldId = equipment.shield || "";

      let targetMain = false;
      let targetOff = false;

      if (is2H) {
        if (mainHandId !== "" || offHandId !== "") {
          ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.TwoHandedEquip") || "Both hands must be free to equip a two-handed weapon.");
          return;
        }
        targetMain = true;
        targetOff = true;
      } else {
        // One-handed weapon: Prefer Main Hand
        if (mainHandId === "") {
          targetMain = true;
        } else if (offHandId === "") {
          targetOff = true;
        } else {
          ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.HandsFull") || "Both hands are full!");
          return;
        }
      }

      await item.update({ "system.equipped": true });

      if (item.system.effects && item.system.effects.length > 0) {
        await this._applyLinkedItems(item.system.effects, { passiveOnly: true });
      }
      if (item.system.enhancementEffects && item.system.enhancementEffects.length > 0) {
        await this._applyLinkedItems(item.system.enhancementEffects, { passiveOnly: true });
      }
      if (item.system.extraDeeds && item.system.extraDeeds.length > 0) {
        await this._applyLinkedItems(item.system.extraDeeds);
      }

      const effectsStr = [
        ...(item.system.effects || []).map(e => e.name),
        ...(item.system.enhancementEffects || []).map(e => e.name)
      ].join(", ");

      const updates = {};
      
      if (targetMain) {
        updates[`system.equipment.main_hand`] = itemId;
        updates[`system.combat.equipment_snapshot.weapon`] = {
          die: item.system.weaponDie,
          effect: effectsStr,
          used: false
        };
      }
      if (targetOff) {
        updates[`system.equipment.off_hand`] = itemId;
        updates[`system.combat.equipment_snapshot.off_hand`] = {
          die: item.system.weaponDie,
          effect: effectsStr,
          used: false
        };
      }

      await this.update(updates);
    } else if (item.type === "item" && item.system.subType === "light_source") {
      const placement = item.system.placement || "hand";
      const equipment = this.system.equipment || {};
      const mainHandId = equipment.main_hand || "";
      const offHandId = equipment.off_hand || "";
      const shieldId = equipment.shield || "";

      if (placement === "hand") {
        // Preferred hand order: Main Hand, then Off Hand
        let handKey = "";
        if (mainHandId === "") handKey = "main_hand";
        else if (offHandId === "") handKey = "off_hand";

        if (handKey === "") {
          ui.notifications.error("Both hands are full! You cannot equip this light source.");
          return;
        }
        
        await item.update({ "system.equipped": true });
        await this.update({ [`system.equipment.${handKey}`]: item.id });
      } else {
        // Shared logic with armor placement slots (head, arms, body, legs, outer)
        const currentId = equipment[placement] || "";
        if (currentId !== "") {
          const occupant = this.items.get(currentId);
          ui.notifications.warn(`Slot already occupied by ${occupant ? occupant.name : "another item"}.`);
          return;
        }
        await item.update({ "system.equipped": true });
        await this.update({ [`system.equipment.${placement}`]: item.id });
      }

      await this._syncTokenLight();
    } else if (item.type === "accessory") {
      const placement = item.system.placement;

      // 1. Check if slot is occupied
      const currentId = this.system.equipment?.[placement];
      if (currentId) {
        const occupant = this.items.get(currentId);
        ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.SlotOccupied", { placement: placement, name: occupant ? occupant.name : "another item" }));
        return;
      }

      // 2. Update Item
      await item.update({ "system.equipped": true });

      // 3. Apply Linked Items
      if (item.system.talents?.length > 0) await this._applyLinkedItems(item.system.talents);
      if (item.system.features?.length > 0) await this._applyLinkedItems(item.system.features);
      if (item.system.deeds?.length > 0) await this._applyLinkedItems(item.system.deeds);
      if (item.system.effects?.length > 0) await this._applyLinkedItems(item.system.effects, { passiveOnly: true });

      // 4. Update Actor Equipment Slot
      await this.update({ [`system.equipment.${placement}`]: itemId });
    }
  }

  /** @override */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    console.log("Trespasser | _onDeleteDescendantDocuments", collection, ids);
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (collection !== "items") return;
    if (game.user.id !== userId) return;

    const updates = {};
    let changed = false;

    for (const doc of documents) {
      const itemId = doc.id;
      
      // Cleanup equipment slots
      const slots = [
        "head", "body", "arms", "legs", "outer", "shield", 
        "main_hand", "off_hand", "amulet", "ring", "talisman"
      ];
      
      for (const slot of slots) {
        if (this.system.equipment?.[slot] === itemId) {
          updates[`system.equipment.${slot}`] = "";
          changed = true;
        }
      }

      // Cleanup linked items
      const sys = doc.system;
      if (sys.talents?.length > 0)  this._removeLinkedItems(sys.talents, itemId);
      if (sys.features?.length > 0) this._removeLinkedItems(sys.features, itemId);
      if (sys.deeds?.length > 0)    this._removeLinkedItems(sys.deeds, itemId);
      if (sys.effects?.length > 0)  this._removeLinkedItems(sys.effects, itemId);
      if (doc.type === "weapon") {
        if (doc.system.enhancementEffects?.length > 0) this._removeLinkedItems(doc.system.enhancementEffects, itemId);
        if (doc.system.extraDeeds?.length > 0) this._removeLinkedItems(doc.system.extraDeeds, itemId);
      }
    }

    if (changed) {
      this.update(updates);
    }
  }

  /**
   * Unequip an item.
   * @param {string} itemId
   */
  async unequipItem(itemId) {
    const item = this.items.get(itemId);
    if (!item || !item.system.equipped) return;

    // 0. Check inventory space
    const unequippedItems = this.items.filter(i => {
      const isSpecial = ["deed", "feature", "talent", "incantation", "effect", "state"].includes(i.type);
      return !isSpecial && !i.system.equipped;
    });
    
    // Sum occupancy: use field if exists, otherwise default to 1
    const usedSlots = unequippedItems.reduce((acc, i) => {
      const val = i.system.slotOccupancy !== undefined ? parseFloat(i.system.slotOccupancy) : 1;
      return acc + (isNaN(val) ? 0 : val);
    }, 0);

    const itemWeight = item.system.slotOccupancy !== undefined ? parseFloat(item.system.slotOccupancy) : 1;
    const maxSlots = this.system.inventory_max ?? 5;

    if ((usedSlots + itemWeight) > maxSlots) {
      ui.notifications.warn(`Inventory full! Unequipping ${item.name} (Slot: ${itemWeight}) would exceed capacity (${usedSlots.toFixed(1)}/${maxSlots}).`);
      return;
    }

    const placement = item.system.placement;

    // 1. Update Item
    await item.update({ "system.equipped": false });

    // Remove or reduce linked effects
    if (item.system.effects && item.system.effects.length > 0) {
      await this._removeLinkedItems(item.system.effects, item.id);
    }

    if (item.type === "armor") {
      // 2. Update Actor Equipment Slot and Reset Combat Snapshot
      const updates = {
        [`system.equipment.${placement}`]: "",
        [`system.combat.equipment_snapshot.${placement}`]: {
          die: "",
          effect: "",
          used: false
        }
      };
      await this.update(updates);
    } else if (item.type === "weapon") {
      if (item.system.enhancementEffects && item.system.enhancementEffects.length > 0) {
        await this._removeLinkedItems(item.system.enhancementEffects, item.id);
      }
      if (item.system.extraDeeds && item.system.extraDeeds.length > 0) {
        await this._removeLinkedItems(item.system.extraDeeds, item.id);
      }

      const updates = {};
      const mainHandId = this.system.equipment?.main_hand;
      const offHandId = this.system.equipment?.off_hand;

      if (mainHandId === itemId) {
        updates[`system.equipment.main_hand`] = "";
        updates[`system.combat.equipment_snapshot.weapon`] = {
          die: "",
          effect: "",
          used: false
        };
      }
      if (offHandId === itemId) {
        updates[`system.equipment.off_hand`] = "";
        updates[`system.combat.equipment_snapshot.off_hand`] = {
          die: "",
          effect: "",
          used: false
        };
      }

      await this.update(updates);
    } else if (item.type === "item" && item.system.subType === "light_source") {
      const updates = {};
      const equipment = this.system.equipment || {};
      for (const [slot, id] of Object.entries(equipment)) {
        if (id === itemId) {
          updates[`system.equipment.${slot}`] = "";
          break;
        }
      }
      await item.update({ "system.equipped": false });
      if (Object.keys(updates).length > 0) await this.update(updates);
      await this._syncTokenLight();
    } else if (item.type === "accessory") {
      const placement = item.system.placement;

      // 1. Update Item
      await item.update({ "system.equipped": false });

      // 2. Remove Linked Items
      if (item.system.talents?.length > 0) await this._removeLinkedItems(item.system.talents, item.id);
      if (item.system.features?.length > 0) await this._removeLinkedItems(item.system.features, item.id);
      if (item.system.deeds?.length > 0) await this._removeLinkedItems(item.system.deeds, item.id);
      if (item.system.effects?.length > 0) await this._removeLinkedItems(item.system.effects, item.id);

      // 3. Update Actor
      await this.update({ [`system.equipment.${placement}`]: "" });
    }
  }

  /**
   * Helper to apply an array of UUID references as actual items on the actor.
   * @param {Array}  itemsArray
   * @param {Object} [options]
   * @param {boolean} [options.passiveOnly]  Only apply passive/combat/immediate effects
   * @param {boolean} [options.fromInjury]   Mark applied items as injury-sourced (no Prevail)
   * @param {string}  [options.injuryId]     The injury item ID to stamp on each applied item
   */
  async _applyLinkedItems(itemsArray, { passiveOnly = false, fromInjury = false, injuryId = null } = {}) {
    if (!itemsArray || !Array.isArray(itemsArray)) return;
    
    for (const eff of itemsArray) {
      if (!eff.uuid) continue;
      
      const sourceItem = await fromUuid(eff.uuid);
      if (!sourceItem) continue;

      // Filter: only passive, combat, immediate effects if requested
      if (passiveOnly && ["effect", "state"].includes(sourceItem.type)) {
        const sys = sourceItem.system;
        const isPassive = sys.type === "passive";
        const isCombat  = sys.isCombat;
        const isImmediate = sys.when === "immediate" || !sys.when; // Treat blank as immediate for safety
        
        if (!isPassive || !isCombat || !isImmediate) continue;
      }
      
      // Check if this specific item (by name and type) already exists on the actor
      // For injury-sourced items, also check by injuryId to allow same effect from two injuries
      let existing;
      if (fromInjury && injuryId) {
        // Only de-duplicate within the same injury
        existing = this.items.find(i =>
          i.type === sourceItem.type &&
          i.name === sourceItem.name &&
          i.flags?.trespasser?.injuryId === injuryId
        );
      } else {
        existing = this.items.find(i => i.type === sourceItem.type && i.name === sourceItem.name);
      }
      
      const desiredIntensity = parseInt(eff.intensity) || sourceItem.system.intensity || 1;

      if (!existing) {
        const itemData = sourceItem.toObject();
        delete itemData._id;

        // Apply desired intensity
        if (["effect", "state"].includes(sourceItem.type)) {
          itemData.system.intensity = desiredIntensity;
        }

        // Mark it so we know it came from a link
        itemData.flags = itemData.flags || {};
        itemData.flags.trespasser = itemData.flags.trespasser || {};
        itemData.flags.trespasser.linkedSource = eff.uuid;

        // Stamp injury metadata if provided
        if (fromInjury) {
          itemData.flags.trespasser.fromInjury = true;
          if (injuryId) itemData.flags.trespasser.injuryId = injuryId;
        }
        
        await foundry.documents.BaseItem.create(itemData, { parent: this });
      } else {
        // Only update intensity if it's an effect/state and it's not already at the desired intensity
        if (["effect", "state"].includes(existing.type)) {
          const currentIntensity = existing.system.intensity || 0;
          if (currentIntensity < desiredIntensity) {
             await existing.update({ "system.intensity": desiredIntensity });
          }
        }
      }
    }
  }

  /**
   * Helper to remove or reduce intensity of linked items.
   * @param {Array} itemsArray 
   * @param {string} sourceItemId - The ID of the item that was provide these links (Feature or Weapon)
   */
  async _removeLinkedItems(itemsArray, sourceItemId) {
    if (!itemsArray || itemsArray.length === 0) return;
    
    // Collect all other active sources for Deeds
    const otherDeedNames = new Set();
    for (const item of this.items) {
       if (item.id === sourceItemId) continue;
       
       if (item.type === "feature") {
         (item.system.deeds || []).forEach(d => otherDeedNames.add(d.name));
       } else if (item.type === "weapon" && item.system.equipped) {
         (item.system.extraDeeds || []).forEach(d => otherDeedNames.add(d.name));
       } else if (item.type === "armor" && item.system.equipped) {
         (item.system.effects || []).forEach(e => {
            if (e.type === "deed") otherDeedNames.add(e.name);
         });
       } else if (item.type === "accessory" && item.system.equipped) {
         (item.system.deeds || []).forEach(d => otherDeedNames.add(d.name));
         (item.system.talents || []).forEach(t => { if (t.type === "deed") otherDeedNames.add(t.name); });
         (item.system.features || []).forEach(f => { if (f.type === "deed") otherDeedNames.add(f.name); });
         (item.system.effects || []).forEach(e => { if (e.type === "deed") otherDeedNames.add(e.name); });
       }
    }

    for (const eff of itemsArray) {
      const existingEffect = this.items.find(i => i.type === eff.type && i.name === eff.name);
      if (!existingEffect) continue;

      // Protection for Deeds
      if (existingEffect.type === "deed") {
        // 1. Never delete natural Deeds (no linkedSource flag)
        if (!existingEffect.getFlag("trespasser", "linkedSource")) continue;

        // 2. Never delete if another source still provides it
        if (otherDeedNames.has(existingEffect.name)) continue;

        // 3. Otherwise, delete
        await existingEffect.delete();
        continue;
      }

      // Handle Effects/States (with intensity)
      const sourceIntensity = parseInt(eff.intensity) || 1;
      
      const newIntensity = (existingEffect.system.intensity || 0) - sourceIntensity;
      if (newIntensity <= 0) {
        await existingEffect.delete();
      } else {
        await existingEffect.update({ "system.intensity": newIntensity });
      }
    }
  }

  /**
   * Update token light configuration based on equipped and active light sources.
   */
  async _syncTokenLight() {
    // Check both generic items and weapons for an active (lit) light source
    const lightSource = this.items.find(i => {
      const isEquipped = i.system.equipped;
      const isActive = i.system.active;
      
      if (i.type === "item" && i.system.subType === "light_source") {
        return isEquipped && isActive;
      }
      
      if (i.type === "weapon" && i.system.isLightSource) {
        return isEquipped && isActive;
      }
      
      return false;
    });

    const tokens = this.getActiveTokens();
    
    // Default values for unlit or no light source
    let dimVal = 0;
    let brightVal = 0;
    let hasAnimation = false;

    if (lightSource) {
      const radius = parseFloat(lightSource.system.radius) || 0;
      brightVal = radius / 2;
      dimVal = radius;
      hasAnimation = true;
    }

    for (const t of tokens) {
      await t.document.update({
        light: {
          dim: dimVal,
          bright: brightVal,
          alpha: 0.5,
          color: lightSource ? "#ff8c00" : null, // Warm orange for fire, null for none
          animation: hasAnimation ? { type: "torch", speed: 2, intensity: 2 } : { type: "none" }
        }
      });
    }
  }
}


