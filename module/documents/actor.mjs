import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { buildTenacityButtonHtml } from "../helpers/tenacity-helper.mjs";
import {
  queueDamageAnimation,
  playDebouncedAnimation,
  animateTokenShake,
  animateDamageText,
  animateHealingText
} from "../actor/actor-damage-animation.mjs";
import {
  getUsedInventorySlots,
  equipItem,
  unequipItem,
  syncTokenLight
} from "../actor/actor-equipment.mjs";
import {
  applyLinkedItems,
  removeLinkedItems
} from "../actor/actor-linked-items.mjs";
import {
  rollSkillCheck,
  applyDamage,
  applyHealing,
  onTurnEnd,
  rollPrevail,
  onItemConsume
} from "../actor/actor-actions.mjs";
import {
  TRESPASSER_STATUS_EFFECTS,
  STATUS_EFFECT_COUNTERS,
  TOGGLE_ONLY_STATUS_EFFECTS
} from "../config/status-effects.mjs";

/**
 * Custom Actor document class for Trespasser TTRPG.
 */
export class TrespasserActor extends Actor {

  /** @override */
  async toggleStatusEffect(statusId, { active, overlay = false, intensity } = {}) {
    const id = typeof statusId === "string" ? statusId : (statusId?.id || statusId?.compendiumId);
    const status = TRESPASSER_STATUS_EFFECTS.find(s =>
      s.id === id ||
      s.compendiumId === id ||
      s.img === id ||
      s.id === statusId ||
      s.compendiumId === statusId
    );
    if (!status) {
      return super.toggleStatusEffect(statusId, { active, overlay });
    }

    const localizedName = game.i18n.localize(status.name);

    // Check if actor already has an effect item matching this state
    const existingItem = this.items.find(i =>
      i.type === "effect" && (
        TrespasserEffectsHelper.getMatchingCustomStatus(i)?.id === status.id ||
        i.getFlag("trespasser", "statusEffectId") === status.id ||
        (status.id === "bloodied" && i.getFlag("trespasser", "isBloodiedState")) ||
        (status.id === "tenacious" && i.getFlag("trespasser", "isTenaciousState")) ||
        (status.compendiumId && (
          i.flags?.core?.sourceId?.includes(status.compendiumId) ||
          i._stats?.compendiumSource?.includes(status.compendiumId)
        )) ||
        (i.system?.statusIcon && i.system.statusIcon === status.img) ||
        (i.img && i.img === status.img) ||
        (i.name?.toLowerCase() === status.id.toLowerCase()) ||
        (localizedName && i.name?.toLowerCase() === localizedName.toLowerCase())
      )
    );

    const shouldAdd = active !== undefined ? Boolean(active) : !existingItem;

    if (shouldAdd) {
      if (existingItem) return existingItem;

      let itemData = null;
      const pack = game.packs?.get("trespasser.trespasser-content");
      if (pack && status.compendiumId) {
        try {
          const doc = await pack.getDocument(status.compendiumId);
          if (doc) itemData = doc.toObject();
        } catch (_) {}
      }

      const counterId = STATUS_EFFECT_COUNTERS[status.id];
      const counterStatus = counterId ? TRESPASSER_STATUS_EFFECTS.find(s => s.id === counterId) : null;
      const fallbackCounterStates = counterStatus ? [{
        uuid: counterStatus.compendiumId ? `Item.${counterStatus.compendiumId}` : "",
        name: counterStatus.id.capitalize(),
        img: counterStatus.img,
        type: "effect"
      }] : [];

      const isToggleOnly = TOGGLE_ONLY_STATUS_EFFECTS.has(status.id.toLowerCase());
      const defaultIntensity = isToggleOnly ? 0 : 1;
      const initialIntensity = intensity !== undefined ? intensity : defaultIntensity;

      if (!itemData) {
        itemData = {
          name: localizedName || status.id.capitalize(),
          type: "effect",
          img: status.img,
          system: {
            description: "",
            type: "continuous",
            isCombat: true,
            isOnlyReminder: isToggleOnly,
            gmOnly: false,
            intensity: initialIntensity,
            targetAttribute: "health",
            modifier: "0",
            conferredState: "",
            when: "immediate",
            duration: "indefinite",
            durationValue: 0,
            durationOperator: "OR",
            durationConditions: [],
            intensityIncrement: 0,
            counterStates: fallbackCounterStates,
            isPrevailable: !isToggleOnly,
            statusIcon: status.img,
            syncStatusIcon: false
          }
        };
      } else {
        if (localizedName) {
          itemData.name = localizedName;
        }
        itemData.system.intensity = initialIntensity;
        if (!itemData.system.counterStates || itemData.system.counterStates.length === 0) {
          itemData.system.counterStates = fallbackCounterStates;
        }
      }

      delete itemData._id;
      delete itemData.folder;
      delete itemData.sort;
      delete itemData.ownership;
      delete itemData._key;
      itemData.flags = itemData.flags || {};
      itemData.flags.trespasser = itemData.flags.trespasser || {};
      itemData.flags.trespasser.statusEffectId = status.id;
      if (status.compendiumId) {
        itemData.flags.core = itemData.flags.core || {};
        itemData.flags.core.sourceId = `Compendium.trespasser.trespasser-content.Item.${status.compendiumId}`;
      }
      if (status.id === "bloodied") {
        itemData.flags.trespasser.isBloodiedState = true;
      }
      if (status.id === "tenacious") {
        itemData.flags.trespasser.isTenaciousState = true;
      }

      const created = await this.createEmbeddedDocuments("Item", [itemData]);

      // Clean up any loose ActiveEffects not tied to an item
      const legacyAEs = this.effects?.filter(ae => ae.statuses?.has(status.id) && !ae.getFlag("trespasser", "sourceItem")) || [];
      if (legacyAEs.length > 0) {
        await this.deleteEmbeddedDocuments("ActiveEffect", legacyAEs.map(e => e.id));
      }

      if (status.id === "defeated" || status.id === CONFIG.specialStatusEffects?.DEFEATED) {
        const combatant = game.combat?.combatants?.find(c => c.actorId === this.id || (this.isToken && c.tokenId === this.token?.id));
        if (combatant && !combatant.defeated) {
          await combatant.update({ defeated: true });
        }
        await TrespasserEffectsHelper.syncActorTenaciousItem(this);
      }

      await TrespasserEffectsHelper._performSyncActorTokenEffects(this);

      if (canvas.tokens?.hud?.rendered) {
        const hudToken = canvas.tokens.hud.object;
        if (hudToken?.actor?.id === this.id || (this.isToken && hudToken?.id === this.token?.id)) {
          canvas.tokens.hud.render(true);
        }
      }

      return created[0];
    } else {
      if (existingItem) {
        await this.deleteEmbeddedDocuments("Item", [existingItem.id]);

        // Clean up any remaining ActiveEffects with this status
        const matchingAEs = this.effects?.filter(ae => ae.statuses?.has(status.id)) || [];
        if (matchingAEs.length > 0) {
          await this.deleteEmbeddedDocuments("ActiveEffect", matchingAEs.map(e => e.id));
        }

        if (status.id === "defeated" || status.id === CONFIG.specialStatusEffects?.DEFEATED) {
          const combatant = game.combat?.combatants?.find(c => c.actorId === this.id || (this.isToken && c.tokenId === this.token?.id));
          if (combatant && combatant.defeated) {
            await combatant.update({ defeated: false });
          }
          await TrespasserEffectsHelper.syncActorTenaciousItem(this);
        }

        await TrespasserEffectsHelper._performSyncActorTokenEffects(this);

        if (canvas.tokens?.hud?.rendered) {
          const hudToken = canvas.tokens.hud.object;
          if (hudToken?.actor?.id === this.id || (this.isToken && hudToken?.id === this.token?.id)) {
            canvas.tokens.hud.render(true);
          }
        }
      }
      return null;
    }
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /** @override */
  async _preCreate(data, options, user) {
    if ( await super._preCreate(data, options, user) === false ) return false;
    
    // Set default images
    if (!data.img || data.img === "icons/svg/mystery-man.svg") {
      const defaultImages = {
        character: "systems/trespasser/assets/icons/pesant.webp",
        companion: "systems/trespasser/assets/icons/creature.webp",
        creature: "systems/trespasser/assets/icons/creature.webp",
        commoner: "systems/trespasser/assets/icons/pesant.webp",
        party: "systems/trespasser/assets/icons/pesant.webp",
        dungeon: "systems/trespasser/assets/icons/dungeon.webp",
        haven: "systems/trespasser/assets/icons/haven.webp"
      };
      if (defaultImages[this.type]) {
        this.updateSource({ img: defaultImages[this.type] });
      }
    }

    // Set default prototype token image to match actor image if not explicitly set
    const currentTokenImg = foundry.utils.getProperty(data, "prototypeToken.texture.src") || this.prototypeToken?.texture?.src;
    if (!currentTokenImg || currentTokenImg === "icons/svg/mystery-man.svg") {
      this.updateSource({ "prototypeToken.texture.src": this.img });
    }

    // Set default prototype token disposition if not explicitly provided in data
    const tokenDispositionProvided = foundry.utils.hasProperty(data, "prototypeToken.disposition");
    if (!tokenDispositionProvided) {
      if (this.type === "character" || this.type === "commoner") {
        this.updateSource({ "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY });
      } else if (this.type === "creature") {
        this.updateSource({ "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.HOSTILE });
      }
    }

    // Link Character tokens by default on creation
    const tokenActorLinkProvided = foundry.utils.hasProperty(data, "prototypeToken.actorLink");
    if (!tokenActorLinkProvided && this.type === "character") {
      this.updateSource({ "prototypeToken.actorLink": true });
    }
  }

  /** @override */
  async _preUpdate(changed, options, user) {
    if ( await super._preUpdate(changed, options, user) === false ) return false;

    // Handle health dropping below 0 for characters
    if (foundry.utils.hasProperty(changed, "system.health")) {
      const targetHP = Number(foundry.utils.getProperty(changed, "system.health"));
      if (!isNaN(targetHP) && targetHP < 0) {
        foundry.utils.setProperty(changed, "system.health", 0);
        if (this.type === "character" && !options.skipBelowZeroChat) {
          options._belowZeroHP = targetHP;
          options._wasAlreadyZero = (this.system?.health ?? 0) === 0;
        }
      }
    }

    // Sync prototype token and placed canvas token textures if actor image changes
    if (changed.img) {
      if (this.isToken) {
        const tokenDoc = this.token;
        if (tokenDoc && tokenDoc.texture?.src !== changed.img) {
          options.syncTokenImg = true;
          options.oldActorImg = this.img;
        }
      } else {
        const currentTokenImg = this.prototypeToken?.texture?.src;
        const actorImg = this.img;
        const isInheriting = !currentTokenImg || currentTokenImg === actorImg || currentTokenImg === "icons/svg/mystery-man.svg";
        const tokenSrcProvided = foundry.utils.hasProperty(changed, "prototypeToken.texture.src");

        if (isInheriting && !tokenSrcProvided) {
          foundry.utils.setProperty(changed, "prototypeToken.texture.src", changed.img);
          options.syncPlacedTokens = true;
          options.oldActorImg = actorImg;
        }
      }
    }
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (game.user.id !== userId) return;

    if (options._belowZeroHP !== undefined && this.type === "character") {
      const belowZeroMsg = options._wasAlreadyZero
        ? game.i18n.format("TRESPASSER.Chat.Combat.DamageWhileTenacious", {
            name: this.name,
            damage: Math.abs(options._belowZeroHP)
          })
        : game.i18n.format("TRESPASSER.Chat.Combat.DroppedBelowZero", {
            name: this.name,
            hp: options._belowZeroHP
          });
      const buttonHtml = buildTenacityButtonHtml(this, options._belowZeroHP);
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="trespasser-chat-card"><p class="miss-text">${belowZeroMsg}</p>${buttonHtml}</div>`
      });
    }

    if (this.isToken && changed.img && this.token?.actorLink) {
      const baseActor = this.token.baseActor || game.actors.get(this.token.actorId);
      if (baseActor && baseActor.img !== changed.img) {
        baseActor.update({ img: changed.img });
      }
    }

    if (options.syncTokenImg && this.isToken && this.token) {
      if (this.token.texture?.src !== changed.img) {
        this.token.update({ "texture.src": changed.img });
      }
    }

    if (options.syncPlacedTokens && !this.isToken && changed.img) {
      const activeTokens = this.getActiveTokens(true, true);
      for (const tokenDoc of activeTokens) {
        if (tokenDoc.actorLink && (tokenDoc.texture?.src === options.oldActorImg || tokenDoc.texture?.src === "icons/svg/mystery-man.svg")) {
          tokenDoc.update({ "texture.src": changed.img });
        }
      }
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
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (collection !== "items") return;
    if (game.user.id !== userId) return;

    const updates = {};
    let changed = false;

    for (const doc of documents) {
      const itemId = doc.id;
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
    }

    if (changed) {
      this.update(updates);
    }
  }

  // --- Static Damage Animation API ---

  static queueDamageAnimation(token, amount) {
    return queueDamageAnimation(token, amount);
  }

  static async _playDebouncedAnimation(token) {
    return playDebouncedAnimation(token);
  }

  static async animateTokenShake(token) {
    return animateTokenShake(token);
  }

  static animateDamageText(token, amount) {
    return animateDamageText(token, amount);
  }

  static animateHealingText(token, amount) {
    return animateHealingText(token, amount);
  }

  // --- Actor Actions API ---

  async rollSkillCheck(attribute) {
    return rollSkillCheck(this, attribute);
  }

  async applyDamage(amount, options = {}) {
    return applyDamage(this, amount, options);
  }

  async applyHealing(amount, options = {}) {
    return applyHealing(this, amount, options);
  }

  async onTurnEnd(combatant = null) {
    return onTurnEnd(this, combatant);
  }

  async rollPrevail(stateItemId, extraAP = 0, options = {}) {
    return rollPrevail(this, stateItemId, extraAP, options);
  }

  async onItemConsume(itemId, options = {}) {
    return onItemConsume(this, itemId, options);
  }

  // --- Inventory & Equipment API ---

  _getUsedInventorySlots() {
    return getUsedInventorySlots(this);
  }

  async equipItem(itemId) {
    return equipItem(this, itemId);
  }

  async unequipItem(itemId) {
    return unequipItem(this, itemId);
  }

  async _applyLinkedItems(itemsArray, options = {}) {
    return applyLinkedItems(this, itemsArray, options);
  }

  async _removeLinkedItems(itemsArray, sourceItemId) {
    return removeLinkedItems(this, itemsArray, sourceItemId);
  }

  async _syncTokenLight() {
    return syncTokenLight(this);
  }
}
