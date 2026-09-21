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
import { CombatActorMixin } from "../actor/combat-actor-mixin.mjs";
import { actorEventBus } from "../actor/actor-event-bus.mjs";
import { syncActorTCA } from "../engine/tca-registration.mjs";
import { toggleActorStatusEffect } from "../actor/actor-status-effects.mjs";
import { SYSTEM_ID } from "../system-id.mjs";

/**
 * Custom Actor document class for Trespasser TTRPG.
 */
export class TrespasserActor extends CombatActorMixin(Actor) {

  /** @override */
  async toggleStatusEffect(statusId, options = {}) {
    return toggleActorStatusEffect(this, statusId, options, (id, opt) => super.toggleStatusEffect(id, opt));
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
      if (doc.type === "effect" && this._isOneShotImmediate(doc)) {
        const { tcaEngine } = await import("../engine/tca-engine.mjs");
        await tcaEngine.processTCAEvent("immediate", { actor: this, item: doc }, this);
        await doc.delete();
      }
    }
    syncActorTCA(this);
  }

  /**
   * Determine whether an effect item is a true fire-and-forget immediate effect
   * that should be auto-deleted after processing its behaviors.
   * Excludes persistent effects (continuous, isOnlyReminder, special states)
   * that happen to have an "immediate" trigger from migration.
   * @param {Item} doc
   * @returns {boolean}
   * @private
   */
  _isOneShotImmediate(doc) {
    const sys = doc.system;
    if (!sys) return false;

    // Never delete special states (bloodied, tenacious, engaged, encumbered, etc.)
    if (TrespasserEffectsHelper.isSpecialState(doc)) return false;

    // Never delete reminder-only effects
    if (sys.isOnlyReminder) return false;

    // Only "on-trigger" type effects with "immediate" when are one-shot
    if (sys.type !== "on-trigger" || sys.when !== "immediate") return false;

    // Must have at least one immediate behavior to process
    const behaviors = sys.behaviors;
    if (!Array.isArray(behaviors) || behaviors.length === 0) return false;

    // All behaviors must be immediate triggers for it to be a one-shot
    return behaviors.every(b => b.trigger === "immediate");
  }

  /** @override */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (collection === "items" && game.user.id === userId) {
      syncActorTCA(this);
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
      if (doc.type === "effect") {
        actorEventBus.removeMiddlewareByEffect(doc.id);
      }
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
    syncActorTCA(this);
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
