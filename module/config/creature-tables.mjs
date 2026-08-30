/**
 * Official Trespasser TTRPG Creature Statistics and Design Guidelines.
 */

export const CREATURE_ROLES_DATA = {
  archer: {
    0: { hp: 20, init: 14, acc: 16, grd: 16, res: 14, prev: 4, spd: 6, dmg: "d8" },
    1: { hp: 30, init: 14, acc: 16, grd: 16, res: 14, prev: 4, spd: 6, dmg: "d8" },
    2: { hp: 40, init: 15, acc: 17, grd: 16, res: 14, prev: 4, spd: 6, dmg: "d8" },
    3: { hp: 50, init: 15, acc: 17, grd: 16, res: 14, prev: 4, spd: 6, dmg: "d8" },
    4: { hp: 60, init: 16, acc: 18, grd: 17, res: 15, prev: 5, spd: 7, dmg: "d10" },
    5: { hp: 70, init: 16, acc: 18, grd: 17, res: 15, prev: 5, spd: 7, dmg: "d10" },
    6: { hp: 80, init: 17, acc: 19, grd: 17, res: 15, prev: 5, spd: 7, dmg: "d10" },
    7: { hp: 90, init: 17, acc: 19, grd: 18, res: 16, prev: 6, spd: 8, dmg: "d12" },
    8: { hp: 95, init: 18, acc: 20, grd: 18, res: 16, prev: 6, spd: 8, dmg: "d12" },
    9: { hp: 100, init: 18, acc: 20, grd: 18, res: 16, prev: 6, spd: 8, dmg: "d12" }
  },
  harrier: {
    0: { hp: 20, init: 16, acc: 14, grd: 16, res: 14, prev: 2, spd: 6, dmg: "d6" },
    1: { hp: 30, init: 16, acc: 14, grd: 16, res: 14, prev: 2, spd: 6, dmg: "d6" },
    2: { hp: 40, init: 17, acc: 15, grd: 16, res: 14, prev: 3, spd: 7, dmg: "d6" },
    3: { hp: 50, init: 17, acc: 15, grd: 16, res: 14, prev: 3, spd: 7, dmg: "d6" },
    4: { hp: 60, init: 18, acc: 16, grd: 17, res: 15, prev: 4, spd: 8, dmg: "d8" },
    5: { hp: 70, init: 18, acc: 16, grd: 17, res: 15, prev: 4, spd: 8, dmg: "d8" },
    6: { hp: 80, init: 19, acc: 17, grd: 17, res: 15, prev: 5, spd: 9, dmg: "d8" },
    7: { hp: 90, init: 19, acc: 17, grd: 18, res: 16, prev: 5, spd: 9, dmg: "d10" },
    8: { hp: 95, init: 20, acc: 18, grd: 18, res: 16, prev: 6, spd: 10, dmg: "d10" },
    9: { hp: 100, init: 20, acc: 18, grd: 18, res: 16, prev: 6, spd: 10, dmg: "d10" }
  },
  enchanter: {
    0: { hp: 30, init: 16, acc: 14, grd: 16, res: 18, prev: 4, spd: 5, dmg: "d6" },
    1: { hp: 40, init: 16, acc: 14, grd: 16, res: 18, prev: 4, spd: 5, dmg: "d6" },
    2: { hp: 50, init: 17, acc: 15, grd: 17, res: 19, prev: 4, spd: 5, dmg: "d6" },
    3: { hp: 60, init: 17, acc: 15, grd: 17, res: 19, prev: 4, spd: 5, dmg: "d6" },
    4: { hp: 65, init: 18, acc: 16, grd: 18, res: 20, prev: 5, spd: 6, dmg: "d8" },
    5: { hp: 70, init: 18, acc: 16, grd: 18, res: 20, prev: 5, spd: 6, dmg: "d8" },
    6: { hp: 85, init: 19, acc: 17, grd: 19, res: 21, prev: 5, spd: 6, dmg: "d8" },
    7: { hp: 90, init: 19, acc: 17, grd: 19, res: 21, prev: 6, spd: 7, dmg: "d10" },
    8: { hp: 95, init: 20, acc: 18, grd: 20, res: 22, prev: 6, spd: 7, dmg: "d10" },
    9: { hp: 100, init: 20, acc: 18, grd: 20, res: 22, prev: 6, spd: 7, dmg: "d10" }
  },
  hellion: {
    0: { hp: 30, init: 14, acc: 18, grd: 14, res: 14, prev: 2, spd: 6, dmg: "d8" },
    1: { hp: 50, init: 14, acc: 18, grd: 14, res: 14, prev: 2, spd: 6, dmg: "d8" },
    2: { hp: 60, init: 14, acc: 19, grd: 14, res: 15, prev: 3, spd: 6, dmg: "d8" },
    3: { hp: 70, init: 14, acc: 19, grd: 14, res: 15, prev: 3, spd: 6, dmg: "d8" },
    4: { hp: 80, init: 15, acc: 20, grd: 15, res: 16, prev: 4, spd: 7, dmg: "d10" },
    5: { hp: 90, init: 15, acc: 20, grd: 15, res: 16, prev: 4, spd: 7, dmg: "d10" },
    6: { hp: 100, init: 15, acc: 21, grd: 15, res: 17, prev: 5, spd: 7, dmg: "d10" },
    7: { hp: 110, init: 16, acc: 21, grd: 16, res: 17, prev: 5, spd: 7, dmg: "d12" },
    8: { hp: 120, init: 16, acc: 22, grd: 16, res: 18, prev: 6, spd: 8, dmg: "d12" },
    9: { hp: 130, init: 16, acc: 22, grd: 16, res: 18, prev: 6, spd: 8, dmg: "d12" }
  },
  enforcer: {
    0: { hp: 40, init: 12, acc: 14, grd: 14, res: 16, prev: 4, spd: 5, dmg: "d8" },
    1: { hp: 60, init: 12, acc: 14, grd: 14, res: 16, prev: 4, spd: 5, dmg: "d8" },
    2: { hp: 80, init: 13, acc: 15, grd: 15, res: 17, prev: 5, spd: 5, dmg: "d8" },
    3: { hp: 90, init: 13, acc: 15, grd: 15, res: 17, prev: 5, spd: 5, dmg: "d8" },
    4: { hp: 100, init: 14, acc: 16, grd: 16, res: 18, prev: 6, spd: 5, dmg: "d10" },
    5: { hp: 110, init: 14, acc: 16, grd: 16, res: 18, prev: 6, spd: 5, dmg: "d10" },
    6: { hp: 120, init: 15, acc: 17, grd: 17, res: 19, prev: 7, spd: 6, dmg: "d10" },
    7: { hp: 130, init: 15, acc: 17, grd: 17, res: 19, prev: 7, spd: 6, dmg: "d12" },
    8: { hp: 140, init: 16, acc: 18, grd: 18, res: 20, prev: 8, spd: 6, dmg: "d12" },
    9: { hp: 150, init: 16, acc: 18, grd: 18, res: 20, prev: 8, spd: 6, dmg: "d12" }
  },
  sorcerer: {
    0: { hp: 20, init: 12, acc: 16, grd: 14, res: 16, prev: 4, spd: 5, dmg: "d6" },
    1: { hp: 30, init: 12, acc: 16, grd: 14, res: 16, prev: 4, spd: 5, dmg: "d6" },
    2: { hp: 40, init: 13, acc: 17, grd: 15, res: 17, prev: 5, spd: 5, dmg: "d6" },
    3: { hp: 50, init: 13, acc: 17, grd: 15, res: 17, prev: 5, spd: 5, dmg: "d6" },
    4: { hp: 60, init: 14, acc: 18, grd: 16, res: 18, prev: 6, spd: 5, dmg: "d8" },
    5: { hp: 70, init: 14, acc: 18, grd: 16, res: 18, prev: 6, spd: 5, dmg: "d8" },
    6: { hp: 80, init: 15, acc: 19, grd: 17, res: 19, prev: 7, spd: 6, dmg: "d8" },
    7: { hp: 90, init: 15, acc: 19, grd: 17, res: 19, prev: 7, spd: 6, dmg: "d10" },
    8: { hp: 95, init: 16, acc: 20, grd: 18, res: 20, prev: 8, spd: 7, dmg: "d10" },
    9: { hp: 100, init: 16, acc: 20, grd: 18, res: 20, prev: 8, spd: 7, dmg: "d10" }
  },
  guardian: {
    0: { hp: 30, init: 12, acc: 16, grd: 18, res: 16, prev: 4, spd: 5, dmg: "d6" },
    1: { hp: 40, init: 12, acc: 16, grd: 18, res: 16, prev: 4, spd: 5, dmg: "d6" },
    2: { hp: 50, init: 13, acc: 16, grd: 19, res: 17, prev: 4, spd: 5, dmg: "d6" },
    3: { hp: 60, init: 13, acc: 16, grd: 19, res: 17, prev: 4, spd: 5, dmg: "d6" },
    4: { hp: 70, init: 14, acc: 17, grd: 20, res: 18, prev: 5, spd: 5, dmg: "d8" },
    5: { hp: 80, init: 14, acc: 17, grd: 20, res: 18, prev: 5, spd: 6, dmg: "d8" },
    6: { hp: 90, init: 15, acc: 17, grd: 21, res: 19, prev: 6, spd: 6, dmg: "d10" },
    7: { hp: 100, init: 15, acc: 18, grd: 21, res: 19, prev: 6, spd: 6, dmg: "d10" },
    8: { hp: 110, init: 16, acc: 18, grd: 22, res: 20, prev: 6, spd: 6, dmg: "d10" },
    9: { hp: 120, init: 16, acc: 18, grd: 22, res: 20, prev: 6, spd: 6, dmg: "d12" }
  },
  stalker: {
    0: { hp: 20, init: 14, acc: 16, grd: 16, res: 14, prev: 4, spd: 5, dmg: "d6" },
    1: { hp: 30, init: 14, acc: 16, grd: 16, res: 14, prev: 4, spd: 5, dmg: "d6" },
    2: { hp: 40, init: 15, acc: 17, grd: 17, res: 14, prev: 4, spd: 5, dmg: "d6" },
    3: { hp: 50, init: 15, acc: 17, grd: 17, res: 14, prev: 4, spd: 5, dmg: "d8" },
    4: { hp: 60, init: 16, acc: 18, grd: 18, res: 15, prev: 5, spd: 6, dmg: "d8" },
    5: { hp: 70, init: 16, acc: 18, grd: 18, res: 15, prev: 5, spd: 6, dmg: "d8" },
    6: { hp: 80, init: 17, acc: 19, grd: 19, res: 15, prev: 5, spd: 7, dmg: "d10" },
    7: { hp: 90, init: 17, acc: 19, grd: 19, res: 16, prev: 6, spd: 7, dmg: "d10" },
    8: { hp: 95, init: 18, acc: 20, grd: 20, res: 16, prev: 6, spd: 8, dmg: "d10" },
    9: { hp: 100, init: 18, acc: 20, grd: 20, res: 16, prev: 6, spd: 8, dmg: "d12" }
  }
};

export const CREATURE_ROLES_LIST = [
  "archer",
  "enchanter",
  "enforcer",
  "guardian",
  "harrier",
  "hellion",
  "sorcerer",
  "stalker"
];

export const CREATURE_TEMPLATES_LIST = [
  "underling",
  "normal",
  "paragon",
  "tyrant"
];

/**
 * Compute calculated base stats based on role, level, and template.
 * @param {string} role
 * @param {number} level
 * @param {string} template
 * @returns {object} Calculated stats
 */
export function getCreatureCalculatedStats(role = "guardian", level = 1, template = "normal") {
  const safeLevel = Math.max(0, Math.min(9, Number(level) || 0));
  const roleData = CREATURE_ROLES_DATA[role]?.[safeLevel] || CREATURE_ROLES_DATA.guardian[safeLevel];

  let calculatedHP = roleData.hp;
  let hpMultiplierNote = "1x";

  if (template === "underling") {
    calculatedHP = 1;
    hpMultiplierNote = "1 HP";
  } else if (template === "paragon") {
    calculatedHP = roleData.hp * 2;
    hpMultiplierNote = "2x";
  } else if (template === "tyrant") {
    calculatedHP = roleData.hp * 4;
    hpMultiplierNote = "4x";
  }

  return {
    health: calculatedHP,
    max_health: calculatedHP,
    guard: roleData.grd,
    resist: roleData.res,
    initiative: roleData.init,
    accuracy: roleData.acc,
    prevail: roleData.prev,
    speed: roleData.spd,
    baseDamageDie: roleData.dmg,
    hpMultiplierNote
  };
}

/**
 * Return recommended design budget guidelines (deeds, features) based on level and template.
 * @param {number} level
 * @param {string} template
 * @param {string} role
 * @returns {object} Design guidelines
 */
export function getCreatureDesignGuidelines(level = 1, template = "normal", role = "guardian") {
  const safeLevel = Math.max(0, Math.min(9, Number(level) || 0));

  // Feature Budget: 1 base feature + 1 per 3 levels (+1 paragon, +2 tyrant)
  const extraFeatures = template === "tyrant" ? 2 : (template === "paragon" ? 1 : 0);
  const featureBudget = 1 + Math.floor(safeLevel / 3) + extraFeatures;

  // Deeds Guidelines
  let deedsRecommendation = [];
  if (template === "underling") {
    deedsRecommendation.push({
      tier: "Light",
      count: "1-2",
      description: "TRESPASSER.Dialog.CreatureConfig.DeedUnderlingNote"
    });
  } else if (safeLevel <= 1) {
    deedsRecommendation.push({
      tier: "Light",
      count: 1,
      description: "TRESPASSER.Dialog.CreatureConfig.DeedLightNote"
    });
    deedsRecommendation.push({
      tier: "Heavy",
      count: 1,
      description: "TRESPASSER.Dialog.CreatureConfig.DeedHeavyNote"
    });
  } else {
    deedsRecommendation.push({
      tier: "Light",
      count: 1,
      description: "TRESPASSER.Dialog.CreatureConfig.DeedLightNote"
    });
    deedsRecommendation.push({
      tier: "Heavy",
      count: 1,
      description: "TRESPASSER.Dialog.CreatureConfig.DeedHeavyNote"
    });
    deedsRecommendation.push({
      tier: "Mighty",
      count: 1,
      description: "TRESPASSER.Dialog.CreatureConfig.DeedMightyNote"
    });

    const extraDeedCount = Math.floor(safeLevel / 3);
    if (extraDeedCount > 0) {
      deedsRecommendation.push({
        tier: "Extra",
        count: `+${extraDeedCount}`,
        description: "TRESPASSER.Dialog.CreatureConfig.DeedExtraNote"
      });
    }
  }

  if (template === "tyrant") {
    deedsRecommendation.push({
      tier: "Tyrant",
      count: 2,
      description: "TRESPASSER.Dialog.CreatureConfig.DeedTyrantNote"
    });
  }

  return {
    featureBudget,
    deedsRecommendation,
    threatRating: template === "underling" ? "1/4" : (template === "paragon" ? "2x" : (template === "tyrant" ? "4x" : "1x"))
  };
}
