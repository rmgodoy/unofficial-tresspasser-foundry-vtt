/**
 * Trespasser Status Effects and Conditions.
 * Defines the custom status effect palette (CONFIG.statusEffects)
 * and the default compendium Bloodied effect data.
 */

export const TRESPASSER_STATUS_EFFECTS = [
  // Special states
  { id: "defeated",   compendiumId: "6FxfJOtvNfItQmCO", name: "TRESPASSER.States.Defeated",   img: "systems/trespasser/assets/icons/states/Defeated.svg" },
  { id: "bloodied",   compendiumId: "4xEKVGCw0Xw71JBR", name: "TRESPASSER.States.Bloodied",   img: "systems/trespasser/assets/icons/states/Bloodied.svg" },
  { id: "grappled",   compendiumId: "risZeWoRLbDjgmHA", name: "TRESPASSER.States.Grappled",   img: "systems/trespasser/assets/icons/states/Grappled.svg" },
  { id: "toppled",    compendiumId: "SihFJEG1cPOzBaXN", name: "TRESPASSER.States.Toppled",    img: "systems/trespasser/assets/icons/states/Toppled.svg" },
  { id: "shadowy",    compendiumId: "D3tj8ogo4Uygc7Sg", name: "TRESPASSER.States.Shadowy",    img: "systems/trespasser/assets/icons/states/Shadowy.svg" },
  { id: "tenacious",  compendiumId: "ucUF4hsZP7f1fJM6", name: "TRESPASSER.States.Tenacious",  img: "systems/trespasser/assets/icons/states/Tenacious.svg" },

  // Common states
  { id: "accurate",   compendiumId: "Y8qxLMIhwa81ihS5", name: "TRESPASSER.States.Accurate",   img: "systems/trespasser/assets/icons/states/Accurate.svg" },
  { id: "afflicted",  compendiumId: "xClBUuzde7pga8Z5", name: "TRESPASSER.States.Afflicted",  img: "systems/trespasser/assets/icons/states/Afflicted.svg" },
  { id: "bleeding",   compendiumId: "dMCSC3lbB5v70qwR", name: "TRESPASSER.States.Bleeding",   img: "systems/trespasser/assets/icons/states/Bleeding.svg" },
  { id: "blinded",    compendiumId: "3XIlIe8gk06H8yiy", name: "TRESPASSER.States.Blinded",    img: "systems/trespasser/assets/icons/states/Blinded.svg" },
  { id: "burning",    compendiumId: "U8u8iFYvAEaL6Y5Z", name: "TRESPASSER.States.Burning",    img: "systems/trespasser/assets/icons/states/Burning.svg" },
  { id: "fortified",  compendiumId: "dQEHNFfCf5zzM0Eg", name: "TRESPASSER.States.Fortified",  img: "systems/trespasser/assets/icons/states/Fortified.svg" },
  { id: "frail",      compendiumId: "v6OzCfu9c4fY1a5B", name: "TRESPASSER.States.Frail",      img: "systems/trespasser/assets/icons/states/Frail.svg" },
  { id: "guarded",    compendiumId: "Fbykaw07D8rIHtx9", name: "TRESPASSER.States.Guarded",    img: "systems/trespasser/assets/icons/states/Guarded.svg" },
  { id: "hastened",   compendiumId: "twIp2TFpB6FoLyDs", name: "TRESPASSER.States.Hastened",   img: "systems/trespasser/assets/icons/states/Hastened.svg" },
  { id: "hindered",   compendiumId: "zeSukJfflKejuW1v", name: "TRESPASSER.States.Hindered",   img: "systems/trespasser/assets/icons/states/Hindered.svg" },
  { id: "inaccurate", compendiumId: "yZCy3pwbhrRK45sq", name: "TRESPASSER.States.Inaccurate", img: "systems/trespasser/assets/icons/states/Inaccurate.svg" },
  { id: "mending",    compendiumId: "jPiOdkHwll8Lf7Rq", name: "TRESPASSER.States.Mending",    img: "systems/trespasser/assets/icons/states/Mending.svg" },
  { id: "provoked",   compendiumId: "cS3IgPJRUrTWlvT5", name: "TRESPASSER.States.Provoked",   img: "systems/trespasser/assets/icons/states/Provoked.svg" },
  { id: "slow",       compendiumId: "N6VXYqohqJrPqDCw", name: "TRESPASSER.States.Slow",       img: "systems/trespasser/assets/icons/states/Slow.svg" },
  { id: "staggered",  compendiumId: "0Xcj6qnixaYuy98u", name: "TRESPASSER.States.Staggered",  img: "systems/trespasser/assets/icons/states/Staggered.svg" },
  { id: "strong",     compendiumId: "WuMgBh4aN4u2lNCh", name: "TRESPASSER.States.Strong",     img: "systems/trespasser/assets/icons/states/Strong.svg" },
  { id: "swift",      compendiumId: "dmwz0WoiIC4G7yTI", name: "TRESPASSER.States.Swift",      img: "systems/trespasser/assets/icons/states/Swift.svg" },
  { id: "unguarded",  compendiumId: "9R5Y8QGjEbVctHlA", name: "TRESPASSER.States.Unguarded",  img: "systems/trespasser/assets/icons/states/Unguarded.svg" },
  { id: "weak",       compendiumId: "dIW1YCC9Gr4kt04x", name: "TRESPASSER.States.Weak",       img: "systems/trespasser/assets/icons/states/Weak.svg" },
  { id: "weary",      compendiumId: "QdTFOleqJtLyflOr", name: "TRESPASSER.States.Weary",      img: "systems/trespasser/assets/icons/states/Weary.svg" },
  { id: "willful",    compendiumId: "WxE5WdcyqGe4NcqT", name: "TRESPASSER.States.Willful",    img: "systems/trespasser/assets/icons/states/Willful.svg" }
];

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
