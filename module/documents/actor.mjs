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

/**
 * Custom Actor document class for Trespasser TTRPG.
 */
export class TrespasserActor extends Actor {

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
      const belowZeroMsg = game.i18n.format("TRESPASSER.Chat.Combat.DroppedBelowZero", {
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
