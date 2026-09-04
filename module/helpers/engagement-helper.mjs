/**
 * EngagementHelper — Tactical engagement detection and UI synchronization.
 * Handles engagement state calculation, deed penalty evaluation, and canvas/sheet refresh.
 */
import { TargetingHelper } from "./targeting-helper.mjs";
import { RangeHelper } from "./range-helper.mjs";
import { getEffectiveDeedAttributes } from "./deed-behaviors/roll-accuracy.mjs";
import { getActiveWeapons } from "../sheets/character/handlers-combat.mjs";

export class EngagementHelper {
  /**
   * Get the active token on the current canvas for an actor.
   * @param {Actor} actor
   * @returns {Token|null}
   */
  static getActorToken(actor) {
    if (!actor || !canvas?.ready) return null;
    if (actor.token?.object) return actor.token.object;
    if (actor.token && canvas.tokens?.get) {
      const t = canvas.tokens.get(actor.token.id);
      if (t) return t;
    }
    const active = actor.getActiveTokens?.(false, false)?.[0] || actor.getActiveTokens?.()[0];
    if (active) return active;
    return canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id || t.document?.actorId === actor.id) || null;
  }

  /**
   * Check if an actor's active token is currently engaged in melee.
   * @param {Actor} actor
   * @returns {boolean}
   */
  static isActorEngaged(actor) {
    const token = this.getActorToken(actor);
    return token ? TargetingHelper.isEngaged(token) : false;
  }

  /**
   * Get an actor's melee engagement reach in grid squares.
   * - Creatures: use combat.engagement_range or engagement_range (default 1).
   * - Characters/Commoners/Companions:
   *   - If equipped with melee weapon(s), use highest melee weapon range (default 1).
   *   - If equipped with only ranged/missile weapons, returns 0 (cannot engage in melee).
   *   - If unarmed: returns 1 (or companion combat.engagement_range).
   * @param {Actor} actor
   * @returns {number} Range in squares (0 if cannot engage)
   */
  static getActorEngagementRange(actor) {
    if (!actor) return 1;
    if (actor.type === "creature") {
      return actor.system?.combat?.engagement_range 
        ?? actor.system?.engagement_range 
        ?? 1;
    }

    const equipment = actor.system?.equipment || {};
    const equippedWeaponIds = [equipment.main_hand, equipment.off_hand].filter(Boolean);
    const equippedWeapons = equippedWeaponIds
      .map(id => actor.items.get(id))
      .filter(w => w && w.type === "weapon");

    const meleeWeapons = equippedWeapons.filter(w => w.system?.type === "melee");
    if (meleeWeapons.length > 0) {
      const ranges = meleeWeapons.map(w => RangeHelper.getWeaponMeleeRange(w));
      return Math.max(...ranges);
    }

    if (equippedWeapons.length > 0 && equippedWeapons.every(w => w.system?.type === "missile" || w.system?.type === "ranged")) {
      return 0;
    }

    if (actor.type === "companion" && (actor.system?.combat?.engagement_range || actor.system?.engagement_range)) {
      return actor.system?.combat?.engagement_range ?? actor.system?.engagement_range;
    }

    return 1;
  }

  /**
   * Check if a deed suffers from the Engagement Penalty (-2 Accuracy).
   * Penalty applies if:
   * 1. The actor's token is engaged by an enemy on the canvas.
   * 2. The deed is an attack (actionType !== "support").
   * 3. The deed is a missile or spell deed.
   * 4. The deed is not inherently exempt (not burst, close blast, close path, melee burst, personal, or self).
   *
   * @param {Item} deedItem - Deed or BDeed item document
   * @param {Actor} [actor] - Owning actor document
   * @returns {{ isEngaged: boolean, hasPenalty: boolean, penaltyValue: number }}
   */
  static checkDeedEngagementPenalty(deedItem, actor = null) {
    const actorDoc = actor || deedItem?.actor;
    if (!actorDoc) {
      return { isEngaged: false, hasPenalty: false, penaltyValue: 0 };
    }

    const isEngaged = this.isActorEngaged(actorDoc);
    if (!isEngaged) {
      return { isEngaged: false, hasPenalty: false, penaltyValue: 0 };
    }

    const effectiveAttrs = getEffectiveDeedAttributes(deedItem);
    const deedType = effectiveAttrs.abilityType || deedItem.system?.abilityType || deedItem.system?.type;
    let isMissileOrSpell = ["missile", "spell"].includes(deedType) || ["missile", "spell"].includes(deedItem.system?.type);

    if (!isMissileOrSpell && deedType === "versatile") {
      const activeWeapons = getActiveWeapons(actorDoc);
      const isRangedWeapon = activeWeapons.some(w => w.system?.type === "missile" || w.system?.type === "spell" || w.system?.properties?.thrown);
      if (isRangedWeapon) isMissileOrSpell = true;
    }

    if (!isMissileOrSpell) {
      return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
    }

    const actionType = effectiveAttrs.actionType || deedItem.system?.actionType || "attack";
    if (actionType === "support") {
      return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
    }

    // Check if inherently exempt (e.g. personal, burst, close blast, etc.)
    const exemptTypes = ["burst", "close_blast", "close_path", "melee_burst", "personal"];
    const targetType = deedItem.system?.targetType;
    if (exemptTypes.includes(targetType)) {
      return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
    }

    // Check BDeed graph nodes for area/target exempt parameters
    const nodes = deedItem.system?.graph?.nodes || [];
    for (const node of nodes) {
      if (node.type === "selectArea") {
        const aoeType = node.params?.aoeType;
        if (exemptTypes.includes(aoeType)) {
          return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
        }
      } else if (node.type === "selectTarget") {
        if (node.params?.targetMode === "self") {
          return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
        }
        const aoeType = node.params?.aoeType;
        if (exemptTypes.includes(aoeType)) {
          return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
        }
      }
    }

    // Check legacy phases if present
    const phases = deedItem.system?.phases || {};
    for (const pKey of Object.keys(phases)) {
      const behaviors = phases[pKey]?.behaviors || [];
      for (const b of behaviors) {
        if (b.type === "selectArea" && exemptTypes.includes(b.params?.aoeType)) {
          return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
        }
        if (b.type === "selectTarget") {
          if (b.params?.targetMode === "self") return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
          if (exemptTypes.includes(b.params?.aoeType)) return { isEngaged: true, hasPenalty: false, penaltyValue: 0 };
        }
      }
    }

    return { isEngaged: true, hasPenalty: true, penaltyValue: -2 };
  }

  /**
   * Debounced function to refresh all tokens and open actor sheets
   * when token positions or combat state change.
   */
  static refreshAllEngagement = foundry.utils.debounce(() => {
    if (!canvas?.ready || !canvas.tokens?.placeables) return;

    // Refresh token visual states
    for (const token of canvas.tokens.placeables) {
      if (token.renderFlags) {
        token.renderFlags.set({ refreshEffects: true });
      } else if (typeof token.refresh === "function") {
        token.refresh();
      }
    }

    // Re-render open actor sheets so deed cards reflect current engagement
    const seenSheets = new Set();
    const addSheet = (sheet) => {
      if (sheet && sheet.rendered && !seenSheets.has(sheet)) {
        seenSheets.add(sheet);
      }
    };

    // 1. Check ApplicationV2 instances (Foundry V12+ / V14)
    if (foundry.applications?.instances) {
      for (const app of foundry.applications.instances.values()) {
        const isActorSheet = Boolean(app.actor || app.document?.documentName === "Actor");
        if (isActorSheet) addSheet(app);
      }
    }

    // 2. Check legacy ApplicationV1 windows
    for (const win of Object.values(ui.windows || {})) {
      if (win.actor || win.document?.documentName === "Actor") {
        addSheet(win);
      }
    }

    // 3. Directly check open sheets of canvas tokens
    for (const token of canvas.tokens.placeables) {
      if (token.actor?.sheet) {
        addSheet(token.actor.sheet);
      }
    }

    // 4. Check game.actors for any open sheets
    for (const actor of (game.actors || [])) {
      if (actor.sheet) {
        addSheet(actor.sheet);
      }
    }

    // Force re-render all unique open actor sheets
    for (const sheet of seenSheets) {
      try {
        if (sheet.isAppV2 || sheet.constructor?.PARTS || sheet.options?.parts) {
          sheet.render({ force: true });
        } else {
          sheet.render(true, { force: true });
        }
      } catch (err) {
        try {
          sheet.render(true);
        } catch (e) {
          console.warn("Trespasser | Failed to force re-render actor sheet:", e);
        }
      }
    }

    // 5. Re-render Token HUD if active
    if (game.trespasser?.tokenHUD?.rendered) {
      game.trespasser.tokenHUD.render({ force: true });
    }
  }, 50);
}
