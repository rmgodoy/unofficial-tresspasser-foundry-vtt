/**
 * migration-heuristics.mjs
 * Natural-language pattern detection for complex Deed behaviors in Trespasser:
 * - INSTEAD overrides (mutual exclusivity between Base and Hit/Spark)
 * - Gain (self) vs Confer (target) recipient divergence
 * - Modal choices ("Or" / "Choose one")
 * - Shared rolls for damage & lifesteal/healing
 */

/**
 * Detects base behaviors that are overridden by "instead" in hit or spark phases.
 * @param {object} phases - Deed phases dictionary { base, hit, spark, ... }
 * @returns {Set<string>} Set of base behavior IDs that should be routed to onMiss
 */
export function detectInsteadOverrides(phases) {
  const overrides = new Set();
  if (!phases) return overrides;

  const hitDesc = (phases.hit?.description || "").toLowerCase();
  const sparkDesc = (phases.spark?.description || "").toLowerCase();
  const baseBehaviors = Array.isArray(phases.base?.behaviors)
    ? phases.base.behaviors
    : Object.values(phases.base?.behaviors || {});
  const hitBehaviors = Array.isArray(phases.hit?.behaviors)
    ? phases.hit.behaviors
    : Object.values(phases.hit?.behaviors || {});

  const hasHitInstead = /\binstead\b/i.test(hitDesc);
  if (!hasHitInstead) return overrides;

  // 1. Effect overrides: base applyEffects matching hit applyEffects
  const hitEffectBehaviors = hitBehaviors.filter(b => b?.type === "applyEffects");
  if (hitEffectBehaviors.length > 0) {
    const hitEffectUuids = new Set();
    const hitEffectNames = new Set();
    for (const hb of hitEffectBehaviors) {
      for (const eff of hb.params?.effects || []) {
        if (eff.uuid) hitEffectUuids.add(eff.uuid);
        if (eff.name) hitEffectNames.add(eff.name.trim().toLowerCase());
      }
    }

    for (const bb of baseBehaviors) {
      if (bb?.type !== "applyEffects") continue;
      const baseEffects = bb.params?.effects || [];
      const isOverridden = baseEffects.some(eff => {
        const uuidMatch = eff.uuid && hitEffectUuids.has(eff.uuid);
        const nameMatch = eff.name && hitEffectNames.has(eff.name.trim().toLowerCase());
        return uuidMatch || nameMatch;
      });
      if (isOverridden || (hitEffectBehaviors.length > 0 && baseEffects.length > 0 && /\bconfer\b/i.test(hitDesc))) {
        if (bb.id) overrides.add(bb.id);
      }
    }
  }

  // 2. Movement overrides: base forceMoveTargets matching hit forceMoveTargets
  const hitMove = hitBehaviors.find(b => b?.type === "forceMoveTargets");
  if (hitMove && /\b(?:push|pull|shove|sweep|drag)\s+\d+\s+instead\b/i.test(hitDesc)) {
    const baseMove = baseBehaviors.find(b => b?.type === "forceMoveTargets");
    if (baseMove?.id) overrides.add(baseMove.id);
  }

  // 3. Damage replacement overrides: "deals X instead" (not "add X damage")
  if (/\b(?:deals?|damage)\b.*?\binstead\b/i.test(hitDesc) && !/\badd\b/i.test(hitDesc)) {
    const baseDmg = baseBehaviors.find(b => b?.type === "applyDamage");
    if (baseDmg?.id) overrides.add(baseDmg.id);
  }

  return overrides;
}

/**
 * Detects whether an applied effect is gained by self or conferred to targets.
 * @param {string} desc - Phase description text
 * @returns {"self" | "target"}
 */
export function detectTargetScope(desc) {
  if (!desc || typeof desc !== "string") return "target";
  const s = desc.trim();
  const hasGain = /\bgain\s+[a-z\s]+(?:\d+)?/i.test(s);
  const hasConfer = /\bconfer\s+[a-z\s]+(?:\d+)?/i.test(s);
  if (hasGain && !hasConfer) return "self";
  return "target";
}

/**
 * Detects whether an effect contains an "or" choice between multiple states.
 * @param {string} desc - Phase description text
 * @param {Array} effectsList - List of effect reference objects
 * @returns {"all" | "choose_one"}
 */
export function detectChoiceMode(desc, effectsList) {
  if (!desc || typeof desc !== "string" || !Array.isArray(effectsList) || effectsList.length <= 1) {
    return "all";
  }
  if (/\b(?:either|\bor\b|choose\s+one)\b/i.test(desc) && !/\bboth\b/i.test(desc)) {
    return "choose_one";
  }
  return "all";
}

/**
 * Detects if deed links damage roll to healing / recovery (lifesteal pattern).
 * @param {object} phases - Deed phases dictionary
 * @returns {{ isShared: boolean, damageExpr: string, healExpr: string }}
 */
export function detectSharedRoll(phases) {
  if (!phases) return { isShared: false, damageExpr: "", healExpr: "" };

  const baseDesc = (phases.base?.description || "").toLowerCase();
  const hitDesc = (phases.hit?.description || "").toLowerCase();
  const allDesc = `${baseDesc} ${hitDesc}`;

  const isLifesteal = /\bregain\s+hit\s+points\s+equal\s+to\s+(?:half\s+the\s+)?damage\b/i.test(allDesc)
    || /\brestore\s+(?:that\s+many\s+hit\s+points|half\s+as\s+many)\b/i.test(allDesc)
    || /\brestore\s+hit\s+points\s+equal\s+to\s+the\s+damage\b/i.test(allDesc);

  if (!isLifesteal) return { isShared: false, damageExpr: "", healExpr: "" };

  let damageExpr = "<sd>";
  const baseDmg = phases.base?.behaviors?.find?.(b => b.type === "applyDamage")?.params?.expression;
  if (baseDmg) damageExpr = baseDmg;

  let healExpr = "";
  if (/\bhalf\s+(?:the\s+damage|as\s+many)\b/i.test(allDesc)) {
    healExpr = "/ 2";
  }

  return { isShared: true, damageExpr, healExpr };
}

/**
 * Detects whether a deed specifies dealing damage to oneself (e.g. Blood Gift).
 * @param {object} phases - Deed phases dictionary
 * @param {string} fullText - Combined deed description text
 * @returns {{ isSelfDamage: boolean, selfDmgExpr: string, hitDmgExpr: string, hasAreaHealing: boolean }}
 */
export function detectSelfDamage(phases, fullText = "") {
  const baseDesc = phases?.base?.description || "";
  const hitDesc = phases?.hit?.description || "";
  const combined = `${fullText} ${baseDesc} ${hitDesc}`.toLowerCase();

  const isSelf = /\b(?:damage\s+to\s+yourself|take\s+\d+.*?damage|suffer\s+\d+.*?damage)\b/i.test(combined);
  if (!isSelf) return { isSelfDamage: false, selfDmgExpr: "", hitDmgExpr: "", hasAreaHealing: false };

  const baseMatch = baseDesc.match(/deal\s+(\d+<sd>|\d+\s+skill\s+die|<sd>).*?damage\s+to\s+yourself/i);
  const hitMatch = hitDesc.match(/deal\s+(\d+<sd>|\d+\s+skill\s+die|<sd>).*?damage\s+to\s+yourself/i);

  const normalizeDmg = (m) => {
    if (!m) return "";
    const raw = m[1].toLowerCase().replace(/\s+skill\s+die/g, "<sd>").replace(/\s+/g, "");
    return raw.includes("<sd>") ? raw : `${raw}<sd>`;
  };

  const selfDmgExpr = normalizeDmg(baseMatch) || "2<sd>";
  const hitDmgExpr = normalizeDmg(hitMatch) || "3<sd>";
  const hasAreaHealing = /\brestore\s+that\s+many\s+hit\s+points.*?(?:other\s+creatures|area)\b/i.test(combined);

  return { isSelfDamage: true, selfDmgExpr, hitDmgExpr, hasAreaHealing };
}

/**
 * Detects disposition filtering for AoE target selection.
 * @param {string} fullText - Combined deed description text
 * @param {string} actionType - Deed actionType ("attack", "support", etc.)
 * @returns {"hostile" | "friendly" | null}
 */
export function detectAoEDisposition(fullText = "", actionType = "attack") {
  const s = fullText.toLowerCase();
  if (/\byou\s+only\s+target\s+enemies\b/i.test(s) || (/\ballies\s+in\s+the\s+area\s+(?:instead|gain|may|regain)\b/i.test(s) && actionType !== "support")) {
    return "hostile";
  }
  if (/\byou\s+only\s+target\s+allies\b/i.test(s) || (/\ballies\s+in\s+the\s+area\b/i.test(s) && actionType === "support")) {
    return "friendly";
  }
  return null;
}

/**
 * Detects if deed has a spark "Confer both instead" clause and returns combined effect payload.
 * @param {object} phases - Deed phases dictionary
 * @returns {Array<object>|null}
 */
export function detectSparkBothInstead(phases) {
  const sparkDesc = (phases?.spark?.description || "").toLowerCase();
  if (!/\bconfer\s+both\s+instead\b/i.test(sparkDesc)) return null;

  const hitBehaviors = Array.isArray(phases?.hit?.behaviors)
    ? phases.hit.behaviors
    : Object.values(phases?.hit?.behaviors || {});
  const baseBehaviors = Array.isArray(phases?.base?.behaviors)
    ? phases.base.behaviors
    : Object.values(phases?.base?.behaviors || {});

  const effectBehavior = hitBehaviors.find(b => b?.type === "applyEffects") || baseBehaviors.find(b => b?.type === "applyEffects");
  if (!effectBehavior || !Array.isArray(effectBehavior.params?.effects)) return null;

  return foundry.utils.deepClone(effectBehavior.params.effects);
}

/**
 * Detects missing healing behavior from rules description.
 * @param {object} phases - Deed phases dictionary
 * @param {string} fullText - Combined deed description text
 * @returns {{ shouldHeal: boolean, expression: string, targetScope: "self" | "target", distribute: boolean }|null}
 */
export function detectMissingHeal(phases, fullText = "") {
  const allText = `${fullText} ${phases?.base?.description || ""} ${phases?.hit?.description || ""} ${phases?.spark?.description || ""}`.toLowerCase();

  // Blood Gift style area healing
  if (/\brestore\s+that\s+many\s+hit\s+points.*?divided\s+as\s+you\s+choose\b/i.test(allText)) {
    return { shouldHeal: true, expression: "", targetScope: "target", distribute: true };
  }

  // Lifesteal self healing
  if (/\brestore\s+hit\s+points\s+equal\s+to\s+(?:the\s+)?damage\b/i.test(allText)) {
    return { shouldHeal: true, expression: "@roll", targetScope: "self", distribute: false };
  }

  // Half damage healing
  if (/\bregain\s+hit\s+points\s+equal\s+to\s+half\s+(?:the\s+)?damage\b/i.test(allText)) {
    return { shouldHeal: true, expression: "/ 2", targetScope: "target", distribute: false };
  }

  // Flat restoration
  const flatM = allText.match(/restore\s+(\d+)\s+hit\s+points/i);
  if (flatM) {
    return { shouldHeal: true, expression: flatM[1], targetScope: "target", distribute: false };
  }

  return null;
}

/**
 * Detects missing terrain creation from deed description.
 * @param {string} fullText - Combined deed description text
 * @returns {{ shouldSpawn: boolean, difficult: boolean, terrainName: string }|null}
 */
export function detectMissingTerrain(fullText = "") {
  const s = fullText.toLowerCase();
  if (/\bcreate\s+difficult\s+terrain\b/i.test(s)) {
    return { shouldSpawn: true, difficult: true, terrainName: "Difficult Terrain" };
  }
  if (/\bcreate\s+a\s+field\s+of\b/i.test(s) || /\bcreate\s+a\s+wall\s+of\b/i.test(s) || /\bcreate\s+a\s+black\s+powder\s+trap\b/i.test(s)) {
    return { shouldSpawn: true, difficult: false, terrainName: "Field/Obstacle" };
  }
  return null;
}
