/**
 * Trespasser Status Effects and Conditions.
 * Defines the custom status effect palette (CONFIG.statusEffects)
 * and the default compendium Bloodied effect data.
 */
import { SYSTEM_ID } from "../system-id.mjs";

export const TRESPASSER_STATUS_EFFECTS = [
  // Counter states: paired as [good, bad], alphabetical by good effect
  { id: "accurate",   order: 1,  compendiumId: "Y8qxLMIhwa81ihS5", name: "TRESPASSER.States.Accurate",   img: "systems/trespasser/assets/icons/states/Accurate.svg" },
  { id: "inaccurate", order: 2,  compendiumId: "yZCy3pwbhrRK45sq", name: "TRESPASSER.States.Inaccurate", img: "systems/trespasser/assets/icons/states/Inaccurate.svg" },
  { id: "fortified",  order: 3,  compendiumId: "dQEHNFfCf5zzM0Eg", name: "TRESPASSER.States.Fortified",  img: "systems/trespasser/assets/icons/states/Fortified.svg" },
  { id: "frail",      order: 4,  compendiumId: "v6OzCfu9c4fY1a5B", name: "TRESPASSER.States.Frail",      img: "systems/trespasser/assets/icons/states/Frail.svg" },
  { id: "guarded",    order: 5,  compendiumId: "Fbykaw07D8rIHtx9", name: "TRESPASSER.States.Guarded",    img: "systems/trespasser/assets/icons/states/Guarded.svg" },
  { id: "unguarded",  order: 6,  compendiumId: "9R5Y8QGjEbVctHlA", name: "TRESPASSER.States.Unguarded",  img: "systems/trespasser/assets/icons/states/Unguarded.svg" },
  { id: "hastened",   order: 7,  compendiumId: "twIp2TFpB6FoLyDs", name: "TRESPASSER.States.Hastened",   img: "systems/trespasser/assets/icons/states/Hastened.svg" },
  { id: "hindered",   order: 8,  compendiumId: "zeSukJfflKejuW1v", name: "TRESPASSER.States.Hindered",   img: "systems/trespasser/assets/icons/states/Hindered.svg" },
  { id: "mending",    order: 9,  compendiumId: "jPiOdkHwll8Lf7Rq", name: "TRESPASSER.States.Mending",    img: "systems/trespasser/assets/icons/states/Mending.svg" },
  { id: "afflicted",  order: 10, compendiumId: "xClBUuzde7pga8Z5", name: "TRESPASSER.States.Afflicted",  img: "systems/trespasser/assets/icons/states/Afflicted.svg" },
  { id: "strong",     order: 11, compendiumId: "WuMgBh4aN4u2lNCh", name: "TRESPASSER.States.Strong",     img: "systems/trespasser/assets/icons/states/Strong.svg" },
  { id: "weak",       order: 12, compendiumId: "dIW1YCC9Gr4kt04x", name: "TRESPASSER.States.Weak",       img: "systems/trespasser/assets/icons/states/Weak.svg" },
  { id: "swift",      order: 13, compendiumId: "dmwz0WoiIC4G7yTI", name: "TRESPASSER.States.Swift",      img: "systems/trespasser/assets/icons/states/Swift.svg" },
  { id: "slow",       order: 14, compendiumId: "N6VXYqohqJrPqDCw", name: "TRESPASSER.States.Slow",       img: "systems/trespasser/assets/icons/states/Slow.svg" },
  { id: "willful",    order: 15, compendiumId: "WxE5WdcyqGe4NcqT", name: "TRESPASSER.States.Willful",    img: "systems/trespasser/assets/icons/states/Willful.svg" },
  { id: "weary",      order: 16, compendiumId: "QdTFOleqJtLyflOr", name: "TRESPASSER.States.Weary",      img: "systems/trespasser/assets/icons/states/Weary.svg" },

  // Common states without counter (alphabetical)
  { id: "bleeding",   order: 17, compendiumId: "dMCSC3lbB5v70qwR", name: "TRESPASSER.States.Bleeding",   img: "systems/trespasser/assets/icons/states/Bleeding.svg" },
  { id: "blinded",    order: 18, compendiumId: "3XIlIe8gk06H8yiy", name: "TRESPASSER.States.Blinded",    img: "systems/trespasser/assets/icons/states/Blinded.svg" },
  { id: "burning",    order: 19, compendiumId: "U8u8iFYvAEaL6Y5Z", name: "TRESPASSER.States.Burning",    img: "systems/trespasser/assets/icons/states/Burning.svg" },
  { id: "provoked",   order: 20, compendiumId: "cS3IgPJRUrTWlvT5", name: "TRESPASSER.States.Provoked",   img: "systems/trespasser/assets/icons/states/Provoked.svg" },
  { id: "staggered",  order: 21, compendiumId: "0Xcj6qnixaYuy98u", name: "TRESPASSER.States.Staggered",  img: "systems/trespasser/assets/icons/states/Staggered.svg" },

  // Special states: with counter first, then the last ones without counter
  { id: "airborne",   order: 22, compendiumId: "AirBorneStAt0001", name: "TRESPASSER.States.Airborne",   img: "systems/trespasser/assets/icons/states/Airborne.svg" },
  { id: "sunken",     order: 23, compendiumId: "SunKenStAtE00001", name: "TRESPASSER.States.Sunken",     img: "systems/trespasser/assets/icons/states/Sunken.svg" },
  { id: "bloodied",   order: 24, compendiumId: "4xEKVGCw0Xw71JBR", name: "TRESPASSER.States.Bloodied",   img: "systems/trespasser/assets/icons/states/Bloodied.svg" },
  { id: "defeated",   order: 25, compendiumId: "6FxfJOtvNfItQmCO", name: "TRESPASSER.States.Defeated",   img: "systems/trespasser/assets/icons/states/Defeated.svg" },
  { id: "encumbered", order: 26, compendiumId: "EnCumbEredSt0001", name: "TRESPASSER.States.Encumbered", img: "systems/trespasser/assets/icons/states/Encumbered.svg" },
  { id: "engaged",    order: 27, compendiumId: "EnGagedStAte0001", name: "TRESPASSER.States.Engaged",    img: "systems/trespasser/assets/icons/states/Engaged.svg" },
  { id: "grappled",   order: 28, compendiumId: "risZeWoRLbDjgmHA", name: "TRESPASSER.States.Grappled",   img: "systems/trespasser/assets/icons/states/Grappled.svg" },
  { id: "shadowy",    order: 29, compendiumId: "D3tj8ogo4Uygc7Sg", name: "TRESPASSER.States.Shadowy",    img: "systems/trespasser/assets/icons/states/Shadowy.svg" },
  { id: "tenacious",  order: 30, compendiumId: "ucUF4hsZP7f1fJM6", name: "TRESPASSER.States.Tenacious",  img: "systems/trespasser/assets/icons/states/Tenacious.svg" },
  { id: "toppled",    order: 31, compendiumId: "SihFJEG1cPOzBaXN", name: "TRESPASSER.States.Toppled",    img: "systems/trespasser/assets/icons/states/Toppled.svg" }
];

export const STATUS_EFFECT_COUNTERS = {
  accurate: "inaccurate",
  inaccurate: "accurate",
  fortified: "frail",
  frail: "fortified",
  guarded: "unguarded",
  unguarded: "guarded",
  hastened: "hindered",
  hindered: "hastened",
  mending: "afflicted",
  afflicted: "mending",
  slow: "swift",
  swift: "slow",
  strong: "weak",
  weak: "strong",
  weary: "willful",
  willful: "weary",
  airborne: "sunken",
  sunken: "airborne"
};

/** Status effects that don't have intensity and can be directly toggled without a dialog */
export const TOGGLE_ONLY_STATUS_EFFECTS = new Set([
  "bloodied",
  "defeated",
  "encumbered",
  "engaged",
  "shadowy",
  "tenacious"
]);

export const BLOODIED_EFFECT_COMPENDIUM_ID = "4xEKVGCw0Xw71JBR";

export const BLOODIED_EFFECT_DATA = {
  name: "Bloodied",
  type: "effect",
  img: "systems/trespasser/assets/icons/states/Bloodied.svg",
  system: {
    description: "<p>You gain this state while you are at or below half your hit point total. Creatures that can see you can recognize that you are bloodied. This state has no other effect on its own, but some enemies have effects that trigger the first time they are reduced to a bloodied state.</p>",
    type: "continuous",
    isCombat: true,
    isOnlyReminder: true,
    gmOnly: false,
    intensity: 0,
    targetAttribute: "health",
    modifier: "0",
    conferredState: "",
    when: "immediate",
    duration: "indefinite",
    durationValue: 0,
    durationOperator: "OR",
    durationConditions: [],
    intensityIncrement: 0,
    counterStates: [],
    isPrevailable: false,
    statusIcon: "systems/trespasser/assets/icons/states/Bloodied.svg",
    syncStatusIcon: false
  },
  flags: {
    trespasser: {
      isBloodiedState: true
    }
  }
};

export const TENACIOUS_EFFECT_COMPENDIUM_ID = "ucUF4hsZP7f1fJM6";

export const TENACIOUS_EFFECT_DATA = {
  name: "Tenacious",
  type: "effect",
  img: "systems/trespasser/assets/icons/states/Tenacious.svg",
  system: {
    description: "<p>You gain this state while you are at 0 hit points, and you lose it if you are defeated or if your hit point total increases above 0. Damage-dealing states are paused while you have this state, and you also ignore minor environmental hazards, such as terrain damage.</p>",
    type: "continuous",
    isCombat: true,
    isOnlyReminder: true,
    gmOnly: false,
    intensity: 0,
    targetAttribute: "health",
    modifier: "0",
    conferredState: "",
    when: "immediate",
    duration: "indefinite",
    durationValue: 0,
    durationOperator: "OR",
    durationConditions: [],
    intensityIncrement: 0,
    counterStates: [],
    isPrevailable: false,
    statusIcon: "systems/trespasser/assets/icons/states/Tenacious.svg",
    syncStatusIcon: false
  },
  flags: {
    trespasser: {
      isTenaciousState: true,
      statusEffectId: "tenacious"
    }
  }
};

export const ENGAGED_EFFECT_COMPENDIUM_ID = "EnGagedStAte0001";

export const ENGAGED_EFFECT_DATA = {
  name: "Engaged",
  type: "effect",
  img: "systems/trespasser/assets/icons/states/Engaged.svg",
  system: {
    description: "<p>An engaged creature suffers -2 accuracy with missile and spell deeds, unless the deed targets an adjacent creature, a burst, close blast, or close path.</p>",
    type: "continuous",
    isCombat: true,
    isOnlyReminder: true,
    gmOnly: false,
    intensity: 0,
    targetAttribute: "health",
    modifier: "0",
    conferredState: "",
    when: "immediate",
    duration: "indefinite",
    durationValue: 0,
    durationOperator: "OR",
    durationConditions: [],
    intensityIncrement: 0,
    counterStates: [],
    isPrevailable: false,
    statusIcon: "systems/trespasser/assets/icons/states/Engaged.svg",
    syncStatusIcon: false
  },
  flags: {
    [SYSTEM_ID]: {
      isEngagedState: true,
      statusEffectId: "engaged"
    }
  }
};

export const ENCUMBERED_EFFECT_COMPENDIUM_ID = "EnCumbEredSt0001";

export const ENCUMBERED_EFFECT_DATA = {
  name: "Encumbered",
  type: "effect",
  img: "systems/trespasser/assets/icons/states/Encumbered.svg",
  system: {
    description: "<p>Your Armor Rating is 6 or higher. Agility is not added to Guard checks, and Speed Bonus is limited to +2.</p>",
    type: "continuous",
    isCombat: true,
    isOnlyReminder: true,
    gmOnly: false,
    intensity: 0,
    targetAttribute: "health",
    modifier: "0",
    conferredState: "",
    when: "immediate",
    duration: "indefinite",
    durationValue: 0,
    durationOperator: "OR",
    durationConditions: [],
    intensityIncrement: 0,
    counterStates: [],
    isPrevailable: false,
    statusIcon: "systems/trespasser/assets/icons/states/Encumbered.svg",
    syncStatusIcon: false
  },
  flags: {
    [SYSTEM_ID]: {
      isEncumberedState: true,
      statusEffectId: "encumbered"
    }
  }
};

export const AIRBORNE_EFFECT_COMPENDIUM_ID = "AirBorneStAt0001";

export const AIRBORNE_EFFECT_DATA = {
  name: "Airborne",
  type: "effect",
  img: "systems/trespasser/assets/icons/states/Airborne.svg",
  system: {
    description: "<p>An airborne creature is flying or floating above the ground. The INTENSITY of this state refers to the creature's altitude in squares, so it is usually referred to as height.</p><p>At airborne 2 or higher, an airborne creature cannot be targeted by melee attacks unless they involve a jump. An airborne creature can always be targeted by missile or spell attacks that target a single creature.</p><p>A blast or burst can target an airborne creature, but only if its area is equal or greater than the creature's height. For example, a blast 4 would target a creature with airborne 4, but not a creature with airborne 5.</p><p>After damaging an airborne creature, a character can use prevail to try to knock it out of the sky. On a success, the creature falls to earth, suffering normal falling damage of 1d6 damage per 2 height lost. A flying creature grounded in this way also gains toppled. A hovering creature does not.</p><p>When a character drags, pulls, or sweeps an airborne creature, they can choose to remove height equal to the squares of the forced movement. If this reduces the creature's height to zero, the creature is dragged to the earth and gains toppled.</p>",
    type: "continuous",
    isCombat: true,
    isOnlyReminder: false,
    gmOnly: false,
    intensity: 1,
    targetAttribute: "elevation",
    modifier: "<Int>",
    conferredState: "",
    when: "immediate",
    duration: "indefinite",
    durationValue: 0,
    durationOperator: "OR",
    durationConditions: [],
    intensityIncrement: 0,
    counterStates: [
      {
        uuid: "Item.SunKenStAtE00001",
        name: "Sunken",
        img: "systems/trespasser/assets/icons/states/Sunken.svg",
        type: "effect"
      }
    ],
    isPrevailable: true,
    statusIcon: "systems/trespasser/assets/icons/states/Airborne.svg",
    syncStatusIcon: false
  },
  flags: {
    [SYSTEM_ID]: {
      statusEffectId: "airborne"
    }
  }
};

export const SUNKEN_EFFECT_COMPENDIUM_ID = "SunKenStAtE00001";

export const SUNKEN_EFFECT_DATA = {
  name: "Sunken",
  type: "effect",
  img: "systems/trespasser/assets/icons/states/Sunken.svg",
  system: {
    description: "<p>A sunken creature is either swimming underwater or tunneling just beneath the earth. The INTENSITY of this state represents how deep it, so it is usually referred to as depth.</p><p>A sunken creature is protected by the substance it travels in, reducing all damage it takes by half. It can move through other creatures and obstacles and ignores difficult terrain, terrain damage, fields, and other effects on the surface.</p><p>After damaging a sunken creature, a character can use prevail to try to force it out of the water. On a success, the creature is pulled to the surface, losing this state and gaining toppled.</p><p>When a character drags, pulls, or sweeps a sunken creature, they can choose to remove depth equal to the squares of the forced movement. If this reduces the creature's depth to zero, the creature is wrenched to the surface and gains toppled.</p>",
    type: "continuous",
    isCombat: true,
    isOnlyReminder: false,
    gmOnly: false,
    intensity: 1,
    targetAttribute: "elevation",
    modifier: "-<Int>",
    conferredState: "",
    when: "immediate",
    duration: "indefinite",
    durationValue: 0,
    durationOperator: "OR",
    durationConditions: [],
    intensityIncrement: 0,
    counterStates: [
      {
        uuid: "Item.AirBorneStAt0001",
        name: "Airborne",
        img: "systems/trespasser/assets/icons/states/Airborne.svg",
        type: "effect"
      }
    ],
    isPrevailable: true,
    statusIcon: "systems/trespasser/assets/icons/states/Sunken.svg",
    syncStatusIcon: false
  },
  flags: {
    [SYSTEM_ID]: {
      statusEffectId: "sunken"
    }
  }
};

export const SPECIAL_STATUS_EFFECT_IDS = new Set([
  "defeated",
  "bloodied",
  "encumbered",
  "engaged",
  "grappled",
  "toppled",
  "shadowy",
  "tenacious",
  "airborne",
  "sunken"
]);

export const SPECIAL_STATUS_COMPENDIUM_IDS = new Set([
  "6FxfJOtvNfItQmCO",
  "4xEKVGCw0Xw71JBR",
  "EnCumbEredSt0001",
  "EnGagedStAte0001",
  "risZeWoRLbDjgmHA",
  "SihFJEG1cPOzBaXN",
  "D3tj8ogo4Uygc7Sg",
  "ucUF4hsZP7f1fJM6",
  "AirBorneStAt0001",
  "SunKenStAtE00001"
]);

export const SPECIAL_STATES_FOLDER_ID = "EtoWy6iRAXCIBITx";

/**
 * Check if an effect item represents a persistent special state (Bloodied, Tenacious, Engaged, Encumbered, etc.)
 * that must not be deleted at the end of combat.
 * @param {Item} item
 * @returns {boolean}
 */
export function isSpecialState(item) {
  if (!item || (item.type !== "effect" && item.type !== "state")) return false;

  const flags = item.flags?.[SYSTEM_ID] || item.flags?.trespasser || {};
  if (flags.isBloodiedState || flags.isTenaciousState || flags.isEngagedState || flags.isEncumberedState) {
    return true;
  }
  if (flags.statusEffectId && SPECIAL_STATUS_EFFECT_IDS.has(flags.statusEffectId)) {
    return true;
  }

  const sourceId = item.flags?.core?.sourceId || item._stats?.compendiumSource || "";
  for (const compId of SPECIAL_STATUS_COMPENDIUM_IDS) {
    if (sourceId.includes(compId)) return true;
  }

  if (SPECIAL_STATUS_COMPENDIUM_IDS.has(item._id) || SPECIAL_STATUS_COMPENDIUM_IDS.has(item.id)) {
    return true;
  }

  if (item.folder?.id === SPECIAL_STATES_FOLDER_ID || item.folder === SPECIAL_STATES_FOLDER_ID) {
    return true;
  }

  const name = item.name?.toLowerCase()?.trim();
  if (name && SPECIAL_STATUS_EFFECT_IDS.has(name)) {
    return true;
  }

  return false;
}
