import { TrespasserEffectsHelper } from "../helpers/effects-helper.mjs";
import { TrespasserCombat }        from "../documents/combat.mjs";
import { EngagementHelper }        from "../helpers/engagement-helper.mjs";

/**
 * Centralized way to find the correct combatant for the token,
 * prioritizing the one in the currently active combat phase.
 * @param {Token} token
 * @returns {Combatant|null}
 */
export function getCombatant(token) {
  if (!token) return null;
  return TrespasserCombat.getPhaseCombatant(token.id);
}

/**
 * Get allies within 2 squares that are also part of the active combat.
 * @param {Token} token
 * @returns {Array<{id: string, name: string, distance: number}>}
 */
export function getNearbyAllies(token) {
  if (!token) return [];

  const combatTokenIds = new Set(
    game.combat?.combatants.map(c => c.tokenId) ?? []
  );

  return canvas.tokens.placeables.filter(t => {
    if (t.id === token.id) return false;
    if (t.document.disposition !== token.document.disposition) return false;
    if (!t.actor) return false;
    if (!combatTokenIds.has(t.id)) return false;

    const waypoints = [token.center, t.center];
    const dist = canvas.grid.measurePath(waypoints).distance;
    const squares = Math.ceil(dist / canvas.dimensions.distance);
    return squares <= 2;
  }).map(t => ({
    id: t.id,
    name: t.name,
    distance: Math.ceil(canvas.grid.measurePath([token.center, t.center]).distance / canvas.dimensions.distance)
  }));
}

/**
 * Calculate throw distance options based on available AP and Agility.
 * @param {Token} token
 * @param {number} ap
 */
export function getThrowOptions(token, ap) {
  if (!token?.actor) return [];
  const baseAgility = token.actor.system.attributes?.agility ?? 0;
  const bonusAgility = TrespasserEffectsHelper.getAttributeBonus(token.actor, "agility");
  const agility = baseAgility + bonusAgility;
  const options = [];
  for (let i = 1; i <= ap; i++) {
    options.push({
      cost: i,
      range: 5 + agility + (i - 1) * 2
    });
  }
  return options;
}

export function getDeedOptions(ap) {
  const options = [];
  const max = Math.max(3, ap);
  for (let i = 1; i <= max; i++) {
    const bonus = (i - 1) * 2;
    const label = i === 1 
      ? game.i18n.format("TRESPASSER.HUD.Option.DeedBase", { cost: i })
      : game.i18n.format("TRESPASSER.HUD.Option.Deed", { cost: i, bonus });
    options.push({ cost: i, label });
  }
  return options;
}

export function getManeuverOptions(ap) {
  const options = [];
  const max = Math.max(3, ap);
  for (let i = 1; i <= max; i++) {
    options.push({ cost: i, bonus: (i - 1) * 2 });
  }
  return options;
}

export function getInteractOptions(ap) {
  const options = [];
  const max = Math.max(3, ap);
  for (let i = 1; i <= max; i++) {
    options.push({ cost: i, bonus: (i - 1) * 2 });
  }
  return options;
}

export function getSmashOptions(ap) {
  const options = [];
  const max = Math.max(3, ap);
  for (let i = 1; i <= max; i++) {
    options.push({ cost: i, bonus: i - 1 });
  }
  return options;
}

export function getTakeAimOptions(ap) {
  const options = [];
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");
  if (ap >= 1 || !restrictAPF) {
    options.push({ cost: 1, bonus: 4 });
  }
  if (ap >= 2 || !restrictAPF) {
    options.push({ cost: 2, bonus: 8 });
  }
  if (options.length === 0) {
    options.push({ cost: 1, bonus: 4 });
  }
  return options;
}

/**
 * Calculate vault jump range based on armor weight and agility.
 * @param {Token} token
 */
export function getVaultRange(token) {
  if (!token?.actor) return 2;
  const actor = token.actor;

  if (actor.type === "character" || actor.type === "commoner" || actor.type === "companion") {
    return actor.system.combat?.speed_bonus ?? 2;
  }

  const baseAgility = actor.system.attributes?.agility ?? 0;
  return Math.max(2, baseAgility);
}

/**
 * Build a sorted deed list for the HUD dropdown.
 * @param {Token} token
 */
export function getSortedDeeds(token) {
  if (!token?.actor) return [];
  const tierOrder  = { light: 1, heavy: 2, mighty: 3, special: 4 };
  const tierLabels = { light: "L", heavy: "H", mighty: "M", special: "S" };

  return token.actor.items
    .filter(i => i.type === "deed")
    .map(d => {
      const tier = d.system.tier?.toLowerCase() || "light";
      let focusCost = d.system.focusCost;
      if (focusCost === null || focusCost === undefined) {
        if (tier === "heavy") focusCost = 2;
        else if (tier === "mighty") focusCost = 4;
        else focusCost = 0;
      }
      const totalCost = focusCost + (d.system.bonusCost || 0);
      const penaltyCheck = EngagementHelper.checkDeedEngagementPenalty(d, token.actor);
      return {
        id: d.id,
        name: d.name,
        tier,
        tierLabel: tierLabels[tier] || "L",
        order: tierOrder[tier] || 1,
        focusCost: totalCost,
        hasEngagementPenalty: penaltyCheck.hasPenalty,
        engagementPenalty: penaltyCheck.penaltyValue,
        displayName: `[${tierLabels[tier] || "L"}] - ${d.name} (${totalCost})`
      };
    })
    .sort((a, b) => a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name));
}

/**
 * Get list of concoctions from inventory.
 * @param {Token} token
 */
export function getAvailableConcoctions(token) {
  if (!token?.actor) return [];
  const validSubTypes = ["potions", "bombs", "oils", "powders"];
  return token.actor.items.filter(i => 
    i.type === "item" && validSubTypes.includes(i.system.subType)
  );
}

/**
 * Prepare full render context for the HUD.
 * @param {TrespasserTokenHUD} hud
 * @returns {object}
 */
export function prepareHudContext(hud) {
  if (!hud._token) return { inCombat: false };
  
  const combatant = getCombatant(hud._token);
  if (!combatant) return { inCombat: false };

  const states = TrespasserEffectsHelper.getActorEffects(hud._token.actor).combat.filter(e => e.item?.type === "effect" && !e.isLasting);

  const ap = combatant.getFlag("trespasser", "actionPoints") ?? 3;
  const maxApCount = Math.max(3, ap);
  const apDots = Array.from({ length: maxApCount }, (_, i) => ({ active: i < ap }));

  const moveActionTaken = combatant.getFlag("trespasser", "moveActionTaken") ?? false;
  const movementUsed = combatant.getFlag("trespasser", "movementUsed") ?? 0;
  const movementAllowed = combatant.getFlag("trespasser", "movementAllowed") ?? 0;
  const movePointsLeft = movementAllowed - movementUsed;
  const baseSpeed = hud._token.actor?.system.combat?.speed ?? 5;
  const bonusSpeed = TrespasserEffectsHelper.getAttributeBonus(hud._token.actor, "speed");
  const speed = baseSpeed + bonusSpeed;
  const focus = hud._token.actor?.system.combat?.focus ?? 0;
  const vaultRange = getVaultRange(hud._token);

  const moveOptions = [];
  for (let i = 1; i <= ap; i++) {
    moveOptions.push({
      cost: i,
      dist: speed + (i - 1) * vaultRange
    });
  }

  const usedActions = new Set(combatant.getFlag("trespasser", "usedHUDActions") ?? []);
  const restrictHUD = game.settings.get("trespasser", "restrictHUDActions");
  const restrictAPF = game.settings.get("trespasser", "restrictAPFocusUsage");

  const deeds = getSortedDeeds(hud._token);
  const selectedDeed = deeds.find(d => d.id === hud._selectedDeedId) || deeds[0] || null;
  if (selectedDeed) hud._selectedDeedId = selectedDeed.id;
  const concoctions = getAvailableConcoctions(hud._token);

  const hasLateTurn = game.combat?.combatants.some(c => 
    c.actorId === hud._token.actor?.id && 
    Number(c.initiative) === TrespasserCombat.PHASES.LATE &&
    !c.defeated
  );

  let canMove = (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("move"));
  if (moveActionTaken && movePointsLeft > 0) canMove = true;
  if (moveActionTaken && movePointsLeft <= 0) canMove = false;

  const movementType = TrespasserEffectsHelper.getMovementType(hud._token?.actor);
  const tag = movementType === "jump" ? " [J]" : movementType === "teleport" ? " [T]" : "";
  const baseMoveLabel = game.i18n.localize("TRESPASSER.HUD.Action.Move");
  let moveBtnLabel = `${baseMoveLabel}${tag}`;
  if (moveActionTaken) {
    moveBtnLabel = `${baseMoveLabel}${tag} (${movePointsLeft})`;
  }

  const actorName = hud._token?.actor?.name || hud._token?.name || game.i18n.localize("TRESPASSER.HUD.Title");

  const context = {
    inCombat: true,
    isGM: game.user.isGM,
    token: hud._token,
    actor: hud._token.actor,
    actorName: actorName,
    availableAP: ap,
    apDots,
    allies: getNearbyAllies(hud._token),
    canDefend:        (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("defend")),
    canHelp:          (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("help")) && getNearbyAllies(hud._token).length > 0,
    canMove:          canMove,
    moveBtnLabel:     moveBtnLabel,
    canUndo:          false,
    canPrevail:       (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("prevail")) && states.length > 0,
    canAttemptDeed:   (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("attempt-deed")) && deeds.length > 0 && (!restrictAPF || !usedActions.has("maneuver") || focus >= 2),
    canUseConcoction: (ap >= 1 || !restrictAPF) && concoctions.length > 0 && (!restrictHUD || !usedActions.has("use-concoction")),
    canTakeAim:       (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("take-aim")),
    canInteract:      (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("interact")),
    canManeuver:      (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("maneuver")) && (!restrictAPF || !usedActions.has("attempt-deed") || focus >= 2),
    canSmash:         (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("smash")),
    canRummage:       (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("rummage")),
    canThrow:         (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("throw")),
    maneuverFocusCost: usedActions.has("attempt-deed") ? 2 : 0,
    deedFocusCost:     usedActions.has("maneuver") ? 2 : 0,
    availableFocus:    focus,
    moveActionTaken,
    movementUsed,
    movementAllowed,
    speed,
    moveOptions,
    states,
    deeds,
    selectedDeed,
    deedDropdownOpen: Boolean(hud._deedDropdownOpen),
    concoctions,
    usedActions: [...usedActions],
    throwOptions:    getThrowOptions(hud._token, ap),
    deedOptions:     getDeedOptions(ap),
    maneuverOptions: getManeuverOptions(ap),
    interactOptions: getInteractOptions(ap),
    smashOptions:    getSmashOptions(ap),
    takeAimOptions:  getTakeAimOptions(ap),
    vaultRange:      vaultRange,
    canVault:        (ap >= 1 || !restrictAPF) && (!restrictHUD || !usedActions.has("vault")),
    canWait:         (ap >= 1 || !restrictAPF) && (game.combat?.getFlag("trespasser", "activePhase") === TrespasserCombat.PHASES.EARLY) && !hasLateTurn,
    canForceMove:    game.user.isGM
  };

  // Clear active panel if its action is no longer available
  const panelMap = {
    "defend": context.canDefend,
    "help": context.canHelp,
    "move": context.canMove,
    "prevail": context.canPrevail,
    "attempt-deed": context.canAttemptDeed,
    "concoction": context.canUseConcoction,
    "take-aim": context.canTakeAim,
    "interact": context.canInteract,
    "maneuver": context.canManeuver,
    "smash": context.canSmash,
    "rummage": context.canRummage,
    "throw": context.canThrow,
    "vault": context.canVault,
    "force-move": context.canForceMove
  };

  if (hud._activePanel && panelMap[hud._activePanel] === false) {
    hud._activePanel = null;
  }

  return context;
}
