/**
 * Dungeon Exploration Configuration
 *
 * Extracted dungeon-specific constants from the main config module.
 * Intended to be merged into CONFIG.TRESPASSER.dungeon at system init.
 */

export const DUNGEON_CONFIG = {
  actionsPerRound: 3,

  // Hostility tiers: maps tier number to DC, encounter TR formula, and label (p.54/260)
  hostilityTiers: {
    0: { label: "TRESPASSER.Terms.Dungeon.Hostility.FirstDay", dc: 10, treasureFormula: "2d6 * 5", encounterLabel: "0" },
    1: { label: "TRESPASSER.Terms.Dungeon.Hostility.Bleak", dc: 12, treasureFormula: "2d6 * 10", encounterLabel: "I" },
    2: { label: "TRESPASSER.Terms.Dungeon.Hostility.Sinister", dc: 14, treasureFormula: "2d6 * 20", encounterLabel: "II" },
    3: { label: "TRESPASSER.Terms.Dungeon.Hostility.Frightening", dc: 16, treasureFormula: "2d6 * 30", encounterLabel: "III" },
    4: { label: "TRESPASSER.Terms.Dungeon.Hostility.Harrowing", dc: 18, treasureFormula: "2d6 * 40", encounterLabel: "IV" },
    5: { label: "TRESPASSER.Terms.Dungeon.Hostility.Nightmarish", dc: 20, treasureFormula: "2d6 * 50", encounterLabel: "V" }
  },

  // Dungeon size determines room count and treasure dice (p.260)
  // Treasure = (size dice)d6 × hostility multiplier
  sizeTreasureDice: {
    tiny: "2d6",
    small: "4d6",
    medium: "6d6",
    large: "8d6",
    huge: "10d6"
  },

  sizeCategories: {
    tiny: "TRESPASSER.Terms.Dungeon.Size.Tiny",
    small: "TRESPASSER.Terms.Dungeon.Size.Small",
    medium: "TRESPASSER.Terms.Dungeon.Size.Medium",
    large: "TRESPASSER.Terms.Dungeon.Size.Large",
    huge: "TRESPASSER.Terms.Dungeon.Size.Huge"
  },

  forms: {
    cave: "TRESPASSER.Terms.Dungeon.Form.Cave",
    ruin: "TRESPASSER.Terms.Dungeon.Form.Ruin",
    tower: "TRESPASSER.Terms.Dungeon.Form.Tower",
    crypt: "TRESPASSER.Terms.Dungeon.Form.Crypt",
    fortress: "TRESPASSER.Terms.Dungeon.Form.Fortress",
    temple: "TRESPASSER.Terms.Dungeon.Form.Temple",
    mine: "TRESPASSER.Terms.Dungeon.Form.Mine",
    lair: "TRESPASSER.Terms.Dungeon.Form.Lair",
    sewer: "TRESPASSER.Terms.Dungeon.Form.Sewer",
    other: "TRESPASSER.Terms.Dungeon.Form.Other"
  },

  // Dungeon actions from the core rules (p.55)
  actions: {
    explore: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Explore",
      icon: "fa-solid fa-magnifying-glass",
      description: "TRESPASSER.Terms.Dungeon.Actions.ExploreDesc",
      cost: 1
    },
    traverse: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Traverse",
      icon: "fa-solid fa-route",
      description: "TRESPASSER.Terms.Dungeon.Actions.TraverseDesc",
      cost: 1
    },
    interact: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Interact",
      icon: "fa-solid fa-hand",
      description: "TRESPASSER.Terms.Dungeon.Actions.InteractDesc",
      cost: 1
    },
    search: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Search",
      icon: "fa-solid fa-search",
      description: "TRESPASSER.Terms.Dungeon.Actions.SearchDesc",
      cost: 1
    },
    hide: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Hide",
      icon: "fa-solid fa-eye-slash",
      description: "TRESPASSER.Terms.Dungeon.Actions.HideDesc",
      cost: 1
    },
    vandalize: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Vandalize",
      icon: "fa-solid fa-hammer",
      description: "TRESPASSER.Terms.Dungeon.Actions.VandalizeDesc",
      cost: 1
    },
    pickLock: {
      label: "TRESPASSER.Terms.Dungeon.Actions.PickLock",
      icon: "fa-solid fa-key",
      description: "TRESPASSER.Terms.Dungeon.Actions.PickLockDesc",
      cost: 1
    },
    disarm: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Disarm",
      icon: "fa-solid fa-screwdriver-wrench",
      description: "TRESPASSER.Terms.Dungeon.Actions.DisarmDesc",
      cost: 1
    },
    converse: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Converse",
      icon: "fa-solid fa-comments",
      description: "TRESPASSER.Terms.Dungeon.Actions.ConverseDesc",
      cost: 1
    },
    momentsRest: {
      label: "TRESPASSER.Terms.Dungeon.Actions.MomentsRest",
      icon: "fa-solid fa-campground",
      description: "TRESPASSER.Terms.Dungeon.Actions.MomentsRestDesc",
      cost: 1
    },
    incant: {
      label: "TRESPASSER.Terms.Dungeon.Actions.Incant",
      icon: "fa-solid fa-wand-sparkles",
      description: "TRESPASSER.Terms.Dungeon.Actions.IncantDesc",
      cost: 1
    }
  },

  // Simultaneous action rules (p.55): party can attempt 2+ actions at once
  // Each simultaneous action raises alarm by +1 and triggers an immediate alarm check
  simultaneousAction: {
    alarmPerAction: 1,
    triggersAlarmCheck: true
  },

  // The five dungeon sparks (p.56)
  sparks: {
    canny: { label: "TRESPASSER.Terms.Dungeon.Sparks.Canny", icon: "fa-solid fa-gem", opposes: "costly", description: "TRESPASSER.Terms.Dungeon.Sparks.CannyDesc" },
    quick: { label: "TRESPASSER.Terms.Dungeon.Sparks.Quick", icon: "fa-solid fa-bolt", opposes: "slow", description: "TRESPASSER.Terms.Dungeon.Sparks.QuickDesc" },
    quiet: { label: "TRESPASSER.Terms.Dungeon.Sparks.Quiet", icon: "fa-solid fa-volume-xmark", opposes: "loud", description: "TRESPASSER.Terms.Dungeon.Sparks.QuietDesc" },
    safe: { label: "TRESPASSER.Terms.Dungeon.Sparks.Safe", icon: "fa-solid fa-shield-halved", opposes: "harmful", description: "TRESPASSER.Terms.Dungeon.Sparks.SafeDesc" },
    striking: { label: "TRESPASSER.Terms.Dungeon.Sparks.Striking", icon: "fa-solid fa-star", opposes: "daunting", description: "TRESPASSER.Terms.Dungeon.Sparks.StrikingDesc" }
  },

  // The five dungeon shadows (p.57)
  shadows: {
    costly: { label: "TRESPASSER.Terms.Dungeon.Shadows.Costly", icon: "fa-solid fa-coins", opposes: "canny", description: "TRESPASSER.Terms.Dungeon.Shadows.CostlyDesc" },
    slow: { label: "TRESPASSER.Terms.Dungeon.Shadows.Slow", icon: "fa-solid fa-hourglass-half", opposes: "quick", description: "TRESPASSER.Terms.Dungeon.Shadows.SlowDesc" },
    loud: { label: "TRESPASSER.Terms.Dungeon.Shadows.Loud", icon: "fa-solid fa-volume-high", opposes: "quiet", description: "TRESPASSER.Terms.Dungeon.Shadows.LoudDesc" },
    harmful: { label: "TRESPASSER.Terms.Dungeon.Shadows.Harmful", icon: "fa-solid fa-heart-crack", opposes: "safe", description: "TRESPASSER.Terms.Dungeon.Shadows.HarmfulDesc" },
    daunting: { label: "TRESPASSER.Terms.Dungeon.Shadows.Daunting", icon: "fa-solid fa-face-grimace", opposes: "striking", description: "TRESPASSER.Terms.Dungeon.Shadows.DauntingDesc" }
  },

  // Encounter reaction table (2d6, p.58)
  reactionTable: {
    hostile:  { range: [1, 5],   label: "TRESPASSER.Terms.Dungeon.Reaction.Hostile",  approaches: ["ambush", "fight"] },
    wary:     { range: [6, 7],   label: "TRESPASSER.Terms.Dungeon.Reaction.Wary",     approaches: ["ambush", "fight", "withdraw"] },
    curious:  { range: [8, 9],   label: "TRESPASSER.Terms.Dungeon.Reaction.Curious",  approaches: ["greet", "warn", "withdraw"] },
    friendly: { range: [10, 12], label: "TRESPASSER.Terms.Dungeon.Reaction.Friendly", approaches: ["greet", "warn"] }
  },

  // Approach options (p.59)
  approaches: {
    ambush:   { label: "TRESPASSER.Terms.Dungeon.Approach.Ambush",   icon: "fa-solid fa-crosshairs",    description: "TRESPASSER.Terms.Dungeon.Approach.AmbushDesc" },
    fight:    { label: "TRESPASSER.Terms.Dungeon.Approach.Fight",    icon: "fa-solid fa-hand-fist",     description: "TRESPASSER.Terms.Dungeon.Approach.FightDesc" },
    greet:    { label: "TRESPASSER.Terms.Dungeon.Approach.Greet",    icon: "fa-solid fa-handshake",     description: "TRESPASSER.Terms.Dungeon.Approach.GreetDesc" },
    warn:     { label: "TRESPASSER.Terms.Dungeon.Approach.Warn",     icon: "fa-solid fa-triangle-exclamation", description: "TRESPASSER.Terms.Dungeon.Approach.WarnDesc" },
    withdraw: { label: "TRESPASSER.Terms.Dungeon.Approach.Withdraw", icon: "fa-solid fa-person-running", description: "TRESPASSER.Terms.Dungeon.Approach.WithdrawDesc" }
  },

  // Connection types between rooms
  connectionTypes: {
    doorway:  "TRESPASSER.Terms.Dungeon.Connection.Doorway",
    hallway:  "TRESPASSER.Terms.Dungeon.Connection.Hallway",
    passage:  "TRESPASSER.Terms.Dungeon.Connection.Passage",
    stairway: "TRESPASSER.Terms.Dungeon.Connection.Stairway",
    ladder:   "TRESPASSER.Terms.Dungeon.Connection.Ladder",
    secret:   "TRESPASSER.Terms.Dungeon.Connection.Secret",
    chasm:    "TRESPASSER.Terms.Dungeon.Connection.Chasm",
    portal:   "TRESPASSER.Terms.Dungeon.Connection.Portal",
    other:    "TRESPASSER.Terms.Dungeon.Connection.Other"
  },

  // Light source equipment tags that trigger depletion tracking
  lightSourceTags: ["torch", "lantern", "candle"]
};

/**
 * Register Handlebars helpers required by dungeon templates.
 * Safe to call multiple times — will not overwrite existing helpers.
 */
export function ensureDungeonHelpers() {
  if (!Handlebars.helpers.eq) {
    Handlebars.registerHelper("eq", (a, b) => a == b);
  }
}
