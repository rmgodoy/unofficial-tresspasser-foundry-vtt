import { DeedBehaviorUtils } from "./deed-behavior-utils.mjs";
import { TrespasserEffectsHelper } from "../effects-helper.mjs";
import { TargetingHelper } from "../targeting-helper.mjs";
import { getMissileElevationModifier, isMissileAttack } from "../elevation-helper.mjs";

/**
 * Prepares defense data, base CD, and defense bonuses for a targeted token or actor.
 * Used by the accuracy roll dialog and roll accuracy behavior.
 *
 * @param {Token|Actor|null} targetToken
 * @param {object} options
 * @param {Actor} options.actor - Attacking actor
 * @param {Token|null} [options.sourceToken] - Attacking token
 * @param {Item} options.item - Deed item
 * @param {object} [options.behavior] - Roll accuracy behavior node
 * @param {boolean} [options.isAttack=true]
 * @param {string} [options.versus="Guard"]
 * @param {string} [options.abilityType="innate"]
 * @returns {object} Target defense data structure
 */
export function prepareTargetDefenseData(targetToken, {
  actor,
  sourceToken,
  item,
  behavior,
  isAttack = true,
  versus = "Guard",
  abilityType = "innate"
}) {
  const targetActor = targetToken?.actor ?? (targetToken instanceof Actor ? targetToken : null);
  const tokenName = targetToken 
    ? DeedBehaviorUtils.getTokenDisplayName(targetToken) 
    : (targetActor?.name || game.i18n.localize("TRESPASSER.Dialog.Roll.NoTarget"));

  const tokenImg = targetToken?.document?.texture?.src 
    || targetToken?.texture?.src 
    || targetActor?.img 
    || "icons/svg/mystery-man.svg";

  const allyOverride = behavior?.params?.allyOverride || {};
  const isOverrideEnabled = Boolean(allyOverride.enabled);
  const isSelf = targetToken
    ? (sourceToken && (targetToken.id === sourceToken.id || targetToken === sourceToken))
    : (targetActor && actor && targetActor.id === actor.id);
  const isAlly = targetToken
    ? (TargetingHelper.matchesDisposition(targetToken, "ally", sourceToken) || (actor?.type === "character" && targetActor?.type === "character"))
    : (actor?.type === "character" && targetActor?.type === "character");
  const isSelfOrAlly = isSelf || isAlly;

  let targetIsAttack = isAttack;
  let targetVersus = versus;

  if (isOverrideEnabled && isSelfOrAlly) {
    targetIsAttack = (allyOverride.actionType || "support") !== "support";
    targetVersus = allyOverride.versus || "10";
  }

  // Support 10 or no target actor
  if (!targetIsAttack || targetVersus === "10" || !targetVersus || !targetActor) {
    const label = (isOverrideEnabled && isSelfOrAlly && isAttack)
      ? `${game.i18n.localize("TRESPASSER.Sheet.Item.Details.ActionTypeChoices.Support") || "Support"} 10`
      : (game.i18n.localize("TRESPASSER.Terms.DC") || "CD");

    return {
      id: targetToken?.id || "default",
      tokenId: targetToken?.id || null,
      actorId: targetActor?.id || null,
      name: tokenName,
      img: tokenImg,
      versus: targetVersus || "10",
      versusLabel: label,
      baseCD: 10,
      sumBonuses: 0,
      totalCD: 10,
      bonuses: [],
      elevationModInfo: null,
      isAllyOverride: isOverrideEnabled && isSelfOrAlly
    };
  }

  // Targeted defense stat (Guard or Resist)
  const statKey = targetVersus.toLowerCase(); // "guard" or "resist"
  const statLabel = game.i18n.localize(`TRESPASSER.Sheet.Combat.${targetVersus}`) || targetVersus;
  const isCharacter = targetActor.type === "character" || targetActor.type === "companion" || targetActor.type === "commoner";

  // Base defense calculation:
  // Continuous bonuses are baked into combat[statKey] via prepareDerivedData.
  // Use-triggered bonuses (e.g. Defend's +2) are NOT baked in.
  const totalDef = targetActor.system?.combat?.[statKey] ?? (isCharacter ? 0 : 10);
  const continuousBonus = TrespasserEffectsHelper.getAttributeBonus(targetActor, statKey);
  const targetEffectBonusEntry = TrespasserEffectsHelper.buildEffectBonusEntry(targetActor, statKey, "use");
  const rawBaseDefense = totalDef - continuousBonus;

  // For characters/companions, CD = 10 + defenseStat.
  // For creatures, CD = defenseStat (already e.g. 10 or 12).
  const baseCD = isCharacter ? (10 + rawBaseDefense) : rawBaseDefense;

  const bonuses = [];

  // Elevation modifier for Guard vs missile attacks
  let elevModInfo = null;
  if (statKey === "guard") {
    const isMissile = abilityType === "missile" || (abilityType === "versatile" && isMissileAttack(item, actor));
    elevModInfo = getMissileElevationModifier(sourceToken || actor, targetToken || targetActor, item, {
      isMissile,
      versus: targetVersus
    });
    if (elevModInfo.applies) {
      const isBonus = elevModInfo.guardModifier > 0;
      bonuses.push({
        id: "elevation",
        key: "elevation",
        name: isBonus
          ? (game.i18n.localize("TRESPASSER.Chat.Combat.ElevationBonusHighGround") || "Elevation (High Ground)")
          : (game.i18n.localize("TRESPASSER.Chat.Combat.ElevationPenaltyAttackerHigher") || "Elevation (Attacker Higher)"),
        value: elevModInfo.guardModifier,
        checked: true,
        toggleable: true
      });
    }
  }

  // Effect sub-bonuses for target
  if (Array.isArray(targetEffectBonusEntry.children)) {
    for (const eff of targetEffectBonusEntry.children) {
      if (eff.value !== 0) {
        bonuses.push({
          id: eff.id,
          key: eff.id,
          name: eff.name,
          value: eff.value,
          description: eff.description || "",
          checked: eff.checked ?? true,
          toggleable: true
        });
      }
    }
  }

  const sumBonuses = bonuses.reduce((acc, b) => acc + (b.checked ? b.value : 0), 0);
  const initialCD = baseCD + sumBonuses;

  return {
    id: targetToken?.id || targetActor.id,
    tokenId: targetToken?.id || null,
    actorId: targetActor.id,
    name: tokenName,
    img: tokenImg,
    versus: targetVersus,
    versusLabel: statLabel,
    baseCD,
    sumBonuses,
    totalCD: initialCD,
    bonuses,
    elevationModInfo: elevModInfo?.applies ? elevModInfo : null,
    isAllyOverride: isOverrideEnabled && isSelfOrAlly
  };
}
