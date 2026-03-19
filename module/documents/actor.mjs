import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat } from './combat.mjs';

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
      switch(this.type) {
        case "character":
          this.updateSource({ img: "systems/trespasser/assets/icons/pesant.webp" });
          break;
        case "creature":
          this.updateSource({ img: "systems/trespasser/assets/icons/creature.webp" });
          break;
        case "party":
          this.updateSource({ img: "systems/trespasser/assets/icons/pesant.webp" });
          break;
        case "dungeon":
          this.updateSource({ img: "systems/trespasser/assets/icons/dungeon.webp" });
          break;
        case "haven":
          this.updateSource({ img: "systems/trespasser/assets/icons/haven.webp" });
          break;
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
    
    // Get numeric bonuses from all active effects and 'use' timing effects
    const bonus = TrespasserEffectsHelper.getAttributeBonus(this, attribute, "use");
    
    const formula = `1${skillDie} + ${attrValue} + ${bonus}`;

    const roll = new foundry.dice.Roll(formula);
    const attrLabel = game.i18n.localize(`TRESPASSER.Attributes.${attribute.charAt(0).toUpperCase() + attribute.slice(1)}`);
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${attrLabel} Check ${bonus !== 0 ? `(Bonus: ${bonus > 0 ? "+" : ""}${bonus})` : ""}`,
    });

    // Trigger any effects that fire when a bonus is "used"
    await TrespasserEffectsHelper.triggerEffects(this, "use");

    return roll;
  }

  /**
   * Helper to get total occupancy of unequipped inventory items.
   */
  _getUsedInventorySlots() {
    const unequippedItems = this.items.filter(i => {
      const isSpecial = ["deed", "feature", "talent", "incantation", "effect", "injury"].includes(i.type);
      return !isSpecial && !i.system.equipped;
    });
    return unequippedItems.reduce((acc, i) => {
      const val = i.system.slotOccupancy !== undefined ? parseFloat(i.system.slotOccupancy) : 1;
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }

  /**
   * Equip an item from the actor's inventory.
   * @param {string} itemId
   */
  async equipItem(itemId) {
    const item = this.items.get(itemId);
    if (!item || item.system.equipped) return;

    // Determine target slots
    let placement = item.system.placement;
    if (!placement && item.type === "weapon") placement = "hand";
    if (!placement && item.type === "item" && item.system.equippable) placement = "hand";

    const equipment = this.system.equipment || {};
    let handKeys = [];

    // 1. Placement Check (Hands vs discrete slots)
    if (placement === "hand") {
      const is2H = item.type === "weapon" ? !!item.system.properties?.twoHanded : (item.system.slotOccupancy >= 2);
      
      if (is2H) {
        // Must have both hands free
        if (equipment.main_hand || equipment.off_hand || equipment.shield) {
          ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.TwoHandedEquip") || "Both hands must be free to equip a two-handed weapon.");
          return;
        }
        handKeys = ["main_hand", "off_hand"];
      } else {
        // One-handed: Prefer Main Hand
        if (!equipment.main_hand) {
          handKeys = ["main_hand"];
        } else if (!equipment.off_hand && !equipment.shield) {
          handKeys = ["off_hand"];
        } else {
          ui.notifications.error(game.i18n.localize("TRESPASSER.Notifications.HandsFull") || "Both hands are full!");
          return;
        }
      }
    } else {
      // Discrete slot Check
      const occupantId = equipment[placement];
      if (occupantId) {
        const occupant = this.items.get(occupantId);
        ui.notifications.warn(game.i18n.format("TRESPASSER.Notifications.SlotOccupied", { 
          placement: placement, 
          name: occupant ? occupant.name : "another item" 
        }));
        return;
      }
    }

    // 2. Heavy Armor Limit check
    if (item.type === "armor" && item.system.weight === "H") {
       const otherHeavy = this.items.some(i => i.id !== item.id && i.type === "armor" && i.system.equipped && i.system.weight === "H");
       if (otherHeavy) {
         ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.HeavyArmorLimit"));
         return;
       }
    }

    // 3. Update Item state
    await item.update({ "system.equipped": true });

    // 4. Update Actor and Snapshots
    const actorUpdates = {};
    if (placement === "hand") {
      for (const key of handKeys) {
        actorUpdates[`system.equipment.${key}`] = (key === handKeys[0]) ? item.id : "";
      }
    } else {
      actorUpdates[`system.equipment.${placement}`] = item.id;
    }

    // Snapshots
    if (item.type === "armor") {
      actorUpdates[`system.combat.equipment_snapshot.${placement}`] = {
        die: item.system.armorDie,
        effect: item.system.effects?.length > 0 ? item.system.effects.map(e => e.name).join(", ") : "",
        used: item.system.broken
      };
    } else if (item.type === "weapon") {
      const effectsStr = [...(item.system.effects || []), ...(item.system.enhancementEffects || [])].map(e => e.name).join(", ");
      if (handKeys.includes("main_hand")) {
        actorUpdates[`system.combat.equipment_snapshot.weapon`] = { die: item.system.weaponDie, effect: effectsStr, used: false };
      }
      if (handKeys.includes("off_hand")) {
        actorUpdates[`system.combat.equipment_snapshot.off_hand`] = { die: item.system.weaponDie, effect: effectsStr, used: false };
      }
    }

    await this.update(actorUpdates);

    if (item.system.subType === "light_source" || (item.type === "weapon" && item.system.isLightSource)) await this._syncTokenLight();

    // Apply continuous and Trigger effects based on item type
    if (item.system.effects?.length > 0) {
      // Weapons handle effects differently (some apply to target, some to self)
      // The guide says: "If a weapon has a continuous effect, it's applied immediatly to the one with the weapon equipped and must be removed when unequipped."
      await this._applyLinkedItems(item.system.effects, { 
        continuousOnly: true,
        sourceType: item.type
      });
    }

    if (item.type === "weapon") {
      if (item.system.enhancementEffects?.length > 0) await this._applyLinkedItems(item.system.enhancementEffects, { continuousOnly: true });
      if (item.system.oilEffects?.length > 0) await this._applyLinkedItems(item.system.oilEffects, { continuousOnly: true });
      if (item.system.extraDeeds?.length > 0) await this._applyLinkedItems(item.system.extraDeeds);
    }

    if (item.type === "accessory" || item.type === "item") {
      if (item.system.talents?.length > 0) await this._applyLinkedItems(item.system.talents);
      if (item.system.features?.length > 0) await this._applyLinkedItems(item.system.features);
      if (item.system.deeds?.length > 0) await this._applyLinkedItems(item.system.deeds);
      if (item.system.incantations?.length > 0) await this._applyLinkedItems(item.system.incantations);
    }
  }

  /** @override */
  async _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (collection !== "items") return;
    if (game.user.id !== userId) return;

    for (const doc of documents) {
      if (doc.type === "effect" && doc.system.type === "on-trigger" && doc.system.when === "immediate") {
        await TrespasserEffectsHelper.triggerImmediate(this, doc);
      }
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
      if (sys.incantations?.length > 0) this._removeLinkedItems(sys.incantations, itemId);
      if (sys.effects?.length > 0)  this._removeLinkedItems(sys.effects, itemId);
      if (doc.type === "weapon") {
        if (doc.system.enhancementEffects?.length > 0) this._removeLinkedItems(doc.system.enhancementEffects, itemId);
        if (doc.system.oilEffects?.length > 0)         this._removeLinkedItems(doc.system.oilEffects, itemId);
        if (doc.system.extraDeeds?.length > 0)         this._removeLinkedItems(doc.system.extraDeeds, itemId);
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
    if (item.system.effects?.length > 0) {
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
      if (item.system.oilEffects && item.system.oilEffects.length > 0) {
        await this._removeLinkedItems(item.system.oilEffects, item.id);
        // Clear oil effects from the item data as well per guide: "The oil effect will be removed once the weapon is unequipped."
        await item.update({ "system.oilEffects": [] });
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
    } else if (item.type === "item" && item.system.equippable) {
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

      // Remove Linked Items
      if (item.system.talents?.length > 0) await this._removeLinkedItems(item.system.talents, item.id);
      if (item.system.features?.length > 0) await this._removeLinkedItems(item.system.features, item.id);
      if (item.system.deeds?.length > 0) await this._removeLinkedItems(item.system.deeds, item.id);
      if (item.system.incantations?.length > 0) await this._removeLinkedItems(item.system.incantations, item.id);
      if (item.system.effects?.length > 0) await this._removeLinkedItems(item.system.effects, item.id);

      if (item.system.subType === "light_source") await this._syncTokenLight();
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
   * @param {boolean} [options.continuousOnly]  Only apply continuous/immediate effects
   * @param {boolean} [options.fromInjury]   Mark applied items as injury-sourced (no Prevail)
   * @param {string}  [options.injuryId]     The injury item ID to stamp on each applied item
   */
  async _applyLinkedItems(itemsArray, { continuousOnly = false, fromInjury = false, injuryId = null, sourceType = null } = {}) {
    if (!itemsArray || !Array.isArray(itemsArray)) return;
    
    for (const eff of itemsArray) {
      if (!eff.uuid) continue;
      
      const sourceItem = await fromUuid(eff.uuid);
      if (!sourceItem) continue;

      const sys = sourceItem.system;
      const isContinuous = sys.type === "continuous";
      const isImmediate = sys.when === "immediate" || !sys.when;

      // If continuousOnly is requested, only apply effects that are continuous or immediate
      if (continuousOnly && !isContinuous && !isImmediate) continue;
      
      const desiredIntensity = parseInt(eff.intensity) || sourceItem.system.intensity || 0;

      // Create the item - the preCreateItem hook will handle summing and counter states
      const itemData = sourceItem.toObject();
      delete itemData._id;

      if (sourceItem.type === "effect") {
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
      const sourceIntensity = parseInt(eff.intensity) || 0;
      
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

  /**
   * Called when this actor's turn ends (all AP spent or phase advances).
   * Triggers 'end-of-turn' effects and grants Focus equal to Skill Bonus (characters only).
   * @param {Combatant} [combatant] - The combatant object, used to check usedExpensiveDeed flag.
   */
  /**
   * Called when this actor's turn ends (all AP spent or phase advances).
   * Triggers 'end-of-turn' effects and grants Focus equal to Skill Bonus (characters only).
   * @param {Combatant} [combatant] - The combatant object, used to check usedExpensiveDeed flag.
   */
  async onTurnEnd(combatant = null) {
    if (!game.combat) return;

    // Characters gain focus equal to skill bonus (if they didn't use an expensive deed)
    if (this.type === "character") {
      const usedExpensive = combatant ? combatant.getFlag("trespasser", "usedExpensiveDeed") : false;
      if (!usedExpensive) {
        const skillBonus = this.system.skill || 0;
        if (skillBonus > 0) {
          const currentFocus = this.system.combat?.focus ?? 0;
          const newFocus = currentFocus + skillBonus;
          if (newFocus > currentFocus) {
            await this.update({ "system.combat.focus": newFocus });
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this }),
              content: `<div class="trespasser-chat-card"><p><strong>${this.name}</strong> recovered <strong>${newFocus - currentFocus} Focus</strong> at end of turn.</p></div>`
            });
          }
        }
      }
    }
  }

  /**
   * Roll a Prevail check to remove a state.
   * DC = min(20, 10 + Intensity)
   * Bonus = Prevail Stat + (Extra AP * 2)
   * 
   * @param {string} stateItemId - The ID of the state item to prevail against.
   * @param {number} extraAP - Extra Action Points spent for +2 bonus each.
   */
  async rollPrevail(stateItemId, extraAP = 0, { modifier = 0, cd = null } = {}) {
    const stateItem = this.items.get(stateItemId);
    if (!stateItem) {
      ui.notifications.warn("State item not found.");
      return;
    }

    const intensity = stateItem.system.intensity || 0;
    const dc = cd !== null ? cd : Math.min(20, 10 + intensity);
    const prevailStat = this.type === "creature" 
      ? (this.system.combat?.roll_bonus || 0) 
      : (this.system.combat?.prevail || 0);
    const apBonus = extraAP * 2;
    const bonuses = `${prevailStat} + ${apBonus} + ${modifier}`;

    // Check for advantage on the prevail roll
    const isAdv = TrespasserEffectsHelper.hasAdvantage(this, "prevail");
    
    const formula = isAdv ? `2d20kh + ${bonuses}` : `1d20 + ${bonuses}`;

    const roll = new foundry.dice.Roll(formula);
    await roll.evaluate();

    const success = roll.total >= dc;
    
    let flavor = `<div class="trespasser-chat-card">
      <h3>${game.i18n.format("TRESPASSER.Chat.PrevailCheck", { name: stateItem.name })}</h3>
      <p>${game.i18n.format("TRESPASSER.Chat.PrevailVsDC", { total: roll.total, dc: dc })}</p>
      <div class="roll-details" style="font-size: var(--fs-10); color: var(--trp-text-dim); margin-bottom: 5px;">
        Formula: ${roll.formula} (d20: ${roll.dice[0].total})<br>
        Bonus: ${prevailStat} (Prevail) ${apBonus > 0 ? `+ ${apBonus} (AP)` : ""} ${modifier !== 0 ? `+ ${modifier} (Mod)` : ""}
      </div>
      <p class="${success ? 'hit-text' : 'miss-text'}" style="font-size: var(--fs-16); font-weight: bold; text-align: center;">
        ${success ? game.i18n.localize("TRESPASSER.Chat.Success") : game.i18n.localize("TRESPASSER.Chat.Failure")}
      </p>
    </div>`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: flavor
    });

    if (success) {
      await stateItem.delete();
    }

    // Trigger any effects that fire when a prevail check is made
    await TrespasserEffectsHelper.triggerEffects(this, "on-prevail");

    return roll;
  }

  /**
   * Consume an item from the actor's inventory.
   * @param {string} itemId 
   */
  /**
   * Consume an item from the actor's inventory.
   * @param {string} itemId 
   * @param {object} [options]
   * @param {boolean} [options.spendAP=true] - Whether to consume AP in combat.
   */
  async onItemConsume(itemId, { spendAP = true } = {}) {
    const item = this.items.get(itemId);
    if (!item) return;

    if (item.system.subType === "resource") return;

    const consumableTypes = ["bombs", "oils", "powders", "potions", "scrolls", "esoteric"];
    if (!consumableTypes.includes(item.system.subType)) return;

    // 1. Handle AP and HUD Tracking for Concoctions (Potions, Bombs, Oils, Powders)
    const isConcoction = ["potions", "bombs", "oils", "powders"].includes(item.system.subType);
    if (isConcoction && game.combat && spendAP) {
      const combatant = TrespasserCombat.getPhaseCombatant(this);
      const activePhase = game.combat.getFlag("trespasser", "activePhase");
      if (combatant) {
        if (combatant.initiative !== activePhase && !game.user.isGM) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NotYourPhase"));
          return;
        }
        const currentAP = combatant.getFlag("trespasser", "actionPoints") ?? 0;
        const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
        if (restrictAPF && currentAP < 1) {
          ui.notifications.warn(game.i18n.localize("TRESPASSER.Notifications.NoAP"));
          return;
        }
        await combatant.setFlag("trespasser", "actionPoints", Math.max(0, currentAP - 1));
        await TrespasserCombat.recordHUDAction(this, "use-concoction");
      }
    }
    
    // 2. Special case for Oils: open application dialog
    if (item.system.subType === "oils") {
      return TrespasserEffectsHelper.applyOilDialog(this, item);
    }

    // 3. Immediate Effect Application for Potions
    if (item.system.subType === "potions" && item.system.effects?.length > 0) {
      await this._applyLinkedItems(item.system.effects);
    }

    let flavorHtml = `<div class="trespasser-chat-card phase-base">`;
    flavorHtml += `<h3 style="margin:0;padding-bottom:4px;border-bottom:1px solid var(--trp-gold-dim);color:var(--trp-gold-bright);">${game.i18n.format("TRESPASSER.Chat.UsedItem", { name: item.name })}</h3>`;

    if (item.system.description) {
      flavorHtml += `<div style="font-size:var(--fs-12);font-style:italic;margin-bottom:8px;color:var(--trp-text-dim);">${item.system.description}</div>`;
    }

    if (item.system.effects?.length > 0) {
      flavorHtml += `<div style="margin-top:8px;">`;
      flavorHtml += `<div style="font-size:var(--fs-11);color:var(--trp-text-dim);text-transform:uppercase;margin-bottom:4px;">${game.i18n.localize("TRESPASSER.Combat.States")}</div>`;
      for (const eff of item.system.effects) {
        const isApplied = item.system.subType === "potions";
        flavorHtml += `
          <div style="display:flex;align-items:center;background:var(--trp-bg-overlay);border:1px solid var(--trp-gold-dim);border-radius:3px;padding:2px 4px;margin-bottom:2px;">
            <img src="${eff.img}" style="width:20px;height:20px;border:none;margin-right:6px;" />
            <span style="font-size:var(--fs-13);font-family:var(--trp-font-primary);color:var(--trp-gold-bright);flex:1;">${eff.name}</span>
            ${isApplied ? `
            <span style="font-size:var(--fs-11);color:var(--trp-text-dim);padding:0 4px;">
              <i class="fas fa-check"></i> ${game.i18n.localize("TRESPASSER.Chat.Applied")}
            </span>` : `
            <a class="apply-effect-btn" data-uuid="${eff.uuid}" data-name="${eff.name}" data-intensity="${eff.intensity || 0}" title="Apply to Targets" style="color:var(--trp-gold-bright);cursor:pointer;padding:0 4px;">
              <i class="fas fa-play"></i> ${game.i18n.localize("TRESPASSER.Chat.Apply")}
            </a>`}
          </div>`;
      }
      flavorHtml += `</div>`;
    }

    if (item.system.deeds?.length > 0) {
      flavorHtml += `<div style="margin-top:8px;font-size:var(--fs-12);"><strong>${game.i18n.localize("TRESPASSER.Chat.GrantsDeeds")}</strong> ${item.system.deeds.map(d => d.name).join(", ")}</div>`;
    }
    if (item.system.incantations?.length > 0) {
      flavorHtml += `<div style="margin-top:8px;font-size:var(--fs-12);"><strong>${game.i18n.localize("TRESPASSER.Chat.GrantsIncantations")}</strong> ${item.system.incantations.map(d => d.name).join(", ")}</div>`;
    }

    flavorHtml += `</div>`;

    const dmg = item.system.damage;
    if (dmg && dmg.trim() !== "") {
      try {
        let expr = TrespasserEffectsHelper.replacePlaceholders(dmg, this);
        const roll = new foundry.dice.Roll(expr);
        await roll.evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: flavorHtml });
      } catch (e) {
        console.error(e);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: flavorHtml });
      }
    } else {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: flavorHtml });
    }

    await item.delete();
  }
}


