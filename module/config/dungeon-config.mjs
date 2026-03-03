/**
 * Dungeon Exploration Configuration
 *
 * Extracted dungeon-specific constants from the main config module.
 * Intended to be merged into CONFIG.TRESPASSER.dungeon at system init.
 */

export const DUNGEON_CONFIG = {
  actionsPerRound: 3,

  // Hostility tiers: maps tier number to DC, treasure formula, and encounter chance
  hostilityTiers: {
    1: { label: "TRESPASSER.Dungeon.Hostility.Bleak", dc: 10, treasureFormula: "2d6 * 10", encounterLabel: "I" },
    2: { label: "TRESPASSER.Dungeon.Hostility.Sinister", dc: 12, treasureFormula: "2d6 * 20", encounterLabel: "II" },
    3: { label: "TRESPASSER.Dungeon.Hostility.Frightening", dc: 15, treasureFormula: "2d6 * 30", encounterLabel: "III" },
    4: { label: "TRESPASSER.Dungeon.Hostility.Harrowing", dc: 18, treasureFormula: "2d6 * 40", encounterLabel: "IV" },
    5: { label: "TRESPASSER.Dungeon.Hostility.Nightmarish", dc: 20, treasureFormula: "2d6 * 50", encounterLabel: "V" }
  },

  sizeCategories: {
    small: "TRESPASSER.Dungeon.Size.Small",
    medium: "TRESPASSER.Dungeon.Size.Medium",
    large: "TRESPASSER.Dungeon.Size.Large",
    massive: "TRESPASSER.Dungeon.Size.Massive"
  },

  forms: {
    cave: "TRESPASSER.Dungeon.Form.Cave",
    ruin: "TRESPASSER.Dungeon.Form.Ruin",
    tower: "TRESPASSER.Dungeon.Form.Tower",
    crypt: "TRESPASSER.Dungeon.Form.Crypt",
    fortress: "TRESPASSER.Dungeon.Form.Fortress",
    temple: "TRESPASSER.Dungeon.Form.Temple",
    mine: "TRESPASSER.Dungeon.Form.Mine",
    lair: "TRESPASSER.Dungeon.Form.Lair",
    sewer: "TRESPASSER.Dungeon.Form.Sewer",
    other: "TRESPASSER.Dungeon.Form.Other"
  },

  // The 11 dungeon actions from the core rules (p.55)
  actions: {
    explore: {
      label: "TRESPASSER.Dungeon.Actions.Explore",
      icon: "fa-solid fa-magnifying-glass",
      description: "TRESPASSER.Dungeon.Actions.ExploreDesc",
      cost: 1
    },
    traverse: {
      label: "TRESPASSER.Dungeon.Actions.Traverse",
      icon: "fa-solid fa-route",
      description: "TRESPASSER.Dungeon.Actions.TraverseDesc",
      cost: 1
    },
    interact: {
      label: "TRESPASSER.Dungeon.Actions.Interact",
      icon: "fa-solid fa-hand",
      description: "TRESPASSER.Dungeon.Actions.InteractDesc",
      cost: 1
    },
    loot: {
      label: "TRESPASSER.Dungeon.Actions.Loot",
      icon: "fa-solid fa-search",
      description: "TRESPASSER.Dungeon.Actions.LootDesc",
      cost: 1
    },
    hide: {
      label: "TRESPASSER.Dungeon.Actions.Hide",
      icon: "fa-solid fa-eye-slash",
      description: "TRESPASSER.Dungeon.Actions.HideDesc",
      cost: 1
    },
    smash: {
      label: "TRESPASSER.Dungeon.Actions.Smash",
      icon: "fa-solid fa-hammer",
      description: "TRESPASSER.Dungeon.Actions.SmashDesc",
      cost: 1
    },
    disarm: {
      label: "TRESPASSER.Dungeon.Actions.Disarm",
      icon: "fa-solid fa-screwdriver-wrench",
      description: "TRESPASSER.Dungeon.Actions.DisarmDesc",
      cost: 1
    },
    converse: {
      label: "TRESPASSER.Dungeon.Actions.Converse",
      icon: "fa-solid fa-comments",
      description: "TRESPASSER.Dungeon.Actions.ConverseDesc",
      cost: 1
    },
    momentsRest: {
      label: "TRESPASSER.Dungeon.Actions.MomentsRest",
      icon: "fa-solid fa-campground",
      description: "TRESPASSER.Dungeon.Actions.MomentsRestDesc",
      cost: 1
    },
    combat: {
      label: "TRESPASSER.Dungeon.Actions.Combat",
      icon: "fa-solid fa-swords",
      description: "TRESPASSER.Dungeon.Actions.CombatDesc",
      cost: 1
    },
    incant: {
      label: "TRESPASSER.Dungeon.Actions.Incant",
      icon: "fa-solid fa-wand-sparkles",
      description: "TRESPASSER.Dungeon.Actions.IncantDesc",
      cost: 1
    }
  },

  // The five dungeon sparks (p.56)
  sparks: {
    canny: { label: "TRESPASSER.Dungeon.Sparks.Canny", icon: "fa-solid fa-gem", opposes: "costly", description: "TRESPASSER.Dungeon.Sparks.CannyDesc" },
    quick: { label: "TRESPASSER.Dungeon.Sparks.Quick", icon: "fa-solid fa-bolt", opposes: "slow", description: "TRESPASSER.Dungeon.Sparks.QuickDesc" },
    quiet: { label: "TRESPASSER.Dungeon.Sparks.Quiet", icon: "fa-solid fa-volume-xmark", opposes: "loud", description: "TRESPASSER.Dungeon.Sparks.QuietDesc" },
    safe: { label: "TRESPASSER.Dungeon.Sparks.Safe", icon: "fa-solid fa-shield-halved", opposes: "harmful", description: "TRESPASSER.Dungeon.Sparks.SafeDesc" },
    striking: { label: "TRESPASSER.Dungeon.Sparks.Striking", icon: "fa-solid fa-star", opposes: "daunting", description: "TRESPASSER.Dungeon.Sparks.StrikingDesc" }
  },

  // The five dungeon shadows (p.57)
  shadows: {
    costly: { label: "TRESPASSER.Dungeon.Shadows.Costly", icon: "fa-solid fa-coins", opposes: "canny", description: "TRESPASSER.Dungeon.Shadows.CostlyDesc" },
    slow: { label: "TRESPASSER.Dungeon.Shadows.Slow", icon: "fa-solid fa-hourglass-half", opposes: "quick", description: "TRESPASSER.Dungeon.Shadows.SlowDesc" },
    loud: { label: "TRESPASSER.Dungeon.Shadows.Loud", icon: "fa-solid fa-volume-high", opposes: "quiet", description: "TRESPASSER.Dungeon.Shadows.LoudDesc" },
    harmful: { label: "TRESPASSER.Dungeon.Shadows.Harmful", icon: "fa-solid fa-heart-crack", opposes: "safe", description: "TRESPASSER.Dungeon.Shadows.HarmfulDesc" },
    daunting: { label: "TRESPASSER.Dungeon.Shadows.Daunting", icon: "fa-solid fa-face-grimace", opposes: "striking", description: "TRESPASSER.Dungeon.Shadows.DauntingDesc" }
  },

  // Encounter reaction table (2d6, p.58)
  reactionTable: {
    hostile:  { range: [1, 5],   label: "TRESPASSER.Dungeon.Reaction.Hostile",  approaches: ["ambush", "fight"] },
    wary:     { range: [6, 7],   label: "TRESPASSER.Dungeon.Reaction.Wary",     approaches: ["ambush", "fight", "withdraw"] },
    curious:  { range: [8, 9],   label: "TRESPASSER.Dungeon.Reaction.Curious",  approaches: ["greet", "warn", "withdraw"] },
    friendly: { range: [10, 12], label: "TRESPASSER.Dungeon.Reaction.Friendly", approaches: ["greet", "warn"] }
  },

  // Approach options (p.59)
  approaches: {
    ambush:   { label: "TRESPASSER.Dungeon.Approach.Ambush",   icon: "fa-solid fa-crosshairs",    description: "TRESPASSER.Dungeon.Approach.AmbushDesc" },
    fight:    { label: "TRESPASSER.Dungeon.Approach.Fight",    icon: "fa-solid fa-hand-fist",     description: "TRESPASSER.Dungeon.Approach.FightDesc" },
    greet:    { label: "TRESPASSER.Dungeon.Approach.Greet",    icon: "fa-solid fa-handshake",     description: "TRESPASSER.Dungeon.Approach.GreetDesc" },
    warn:     { label: "TRESPASSER.Dungeon.Approach.Warn",     icon: "fa-solid fa-triangle-exclamation", description: "TRESPASSER.Dungeon.Approach.WarnDesc" },
    withdraw: { label: "TRESPASSER.Dungeon.Approach.Withdraw", icon: "fa-solid fa-person-running", description: "TRESPASSER.Dungeon.Approach.WithdrawDesc" }
  },

  // Connection types between rooms
  connectionTypes: {
    doorway:  "TRESPASSER.Dungeon.Connection.Doorway",
    hallway:  "TRESPASSER.Dungeon.Connection.Hallway",
    passage:  "TRESPASSER.Dungeon.Connection.Passage",
    stairway: "TRESPASSER.Dungeon.Connection.Stairway",
    ladder:   "TRESPASSER.Dungeon.Connection.Ladder",
    secret:   "TRESPASSER.Dungeon.Connection.Secret",
    chasm:    "TRESPASSER.Dungeon.Connection.Chasm",
    portal:   "TRESPASSER.Dungeon.Connection.Portal",
    other:    "TRESPASSER.Dungeon.Connection.Other"
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
