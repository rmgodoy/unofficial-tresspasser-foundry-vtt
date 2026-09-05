/**
 * Effect triggers, durations, movement types, and attribute constants.
 */

export const TRIGGER_WHEN = {
  START_COMBAT: "start-of-combat",
  START_ROUND: "start-of-round",
  START_TURN: "start-of-turn",
  END_TURN: "end-of-turn",
  END_ROUND: "end-of-round",
  END_COMBAT: "end-of-combat",
  ON_FIRST_MOVE: "on-first-move",
  ON_MOVE: "on-move",
  USE: "use",
  TARGETED: "targeted",
  DAMAGE_DEALT: "damage-dealt",
  DAMAGE_RECEIVED: "damage-received",
  HEAL_GIVEN: "heal-given",
  HEAL_RECEIVED: "heal-received",
  ON_PREVAIL: "on-prevail",
  ON_USE_DEED: "on-use-deed",
  ON_TARGETED_DEED: "on-targeted-deed",
  ON_DEED_HIT_RECEIVED: "on-deed-hit-received",
  ON_DEED_MISS_RECEIVED: "on-deed-miss-received",
  ON_DEED_HIT: "on-deed-hit",
  ON_DEED_MISS: "on-deed-miss",
  IMMEDIATE: "immediate",
  CONTINUOUS: "continuous"
};

export const TRIGGER_LABELS = {
  "start-of-combat": "TRESPASSER.App.System.Trigger.StartOfCombat",
  "start-of-round": "TRESPASSER.App.System.Trigger.StartOfRound",
  "start-of-turn": "TRESPASSER.App.System.Trigger.StartOfTurn",
  "end-of-turn": "TRESPASSER.App.System.Trigger.EndOfTurn",
  "end-of-round": "TRESPASSER.App.System.Trigger.EndOfRound",
  "end-of-combat": "TRESPASSER.App.System.Trigger.EndOfCombat",
  "on-first-move": "TRESPASSER.App.System.Trigger.OnFirstMove",
  "on-move": "TRESPASSER.App.System.Trigger.OnMove",
  "use": "TRESPASSER.App.System.Trigger.Use",
  "targeted": "TRESPASSER.App.System.Trigger.Targeted",
  "damage-dealt": "TRESPASSER.App.System.Trigger.DamageDealt",
  "damage-received": "TRESPASSER.App.System.Trigger.DamageReceived",
  "heal-given": "TRESPASSER.App.System.Trigger.HealGiven",
  "heal-received": "TRESPASSER.App.System.Trigger.HealReceived",
  "on-prevail": "TRESPASSER.App.System.Trigger.OnPrevail",
  "on-use-deed": "TRESPASSER.App.System.Trigger.OnUseDeed",
  "on-targeted-deed": "TRESPASSER.App.System.Trigger.OnTargetedDeed",
  "on-deed-hit-received": "TRESPASSER.App.System.Trigger.OnDeedHitReceived",
  "on-deed-miss-received": "TRESPASSER.App.System.Trigger.OnDeedMissReceived",
  "on-deed-hit": "TRESPASSER.App.System.Trigger.OnDeedHit",
  "on-deed-miss": "TRESPASSER.App.System.Trigger.OnDeedMiss",
  "immediate": "TRESPASSER.App.System.Trigger.Immediate",
  "continuous": "TRESPASSER.App.System.Trigger.Continuous"
};

export const DURATION_MODES = {
  INDEFINITE: "indefinite",
  COMBAT: "combat",
  ROUND: "round",
  TRIGGER: "trigger"
};

export const DURATION_LABELS = {
  "indefinite": "TRESPASSER.App.System.Duration.Indefinite",
  "combat": "TRESPASSER.App.System.Duration.Combat",
  "round": "TRESPASSER.App.System.Duration.Round",
  "trigger": "TRESPASSER.App.System.Duration.Trigger"
};

export const MOVEMENT_TYPES = {
  WALK: "walk",
  TELEPORT: "teleport",
  JUMP: "jump"
};

export const MOVEMENT_TYPE_LABELS = {
  "walk": "TRESPASSER.Sheet.Item.Details.MovementTypeChoices.Walk",
  "teleport": "TRESPASSER.Sheet.Item.Details.MovementTypeChoices.Teleport",
  "jump": "TRESPASSER.Sheet.Item.Details.MovementTypeChoices.Jump"
};

export const TARGET_ATTRIBUTES = {
  "mighty": "TRESPASSER.Terms.Attribute.Mighty",
  "agility": "TRESPASSER.Terms.Attribute.Agility",
  "intellect": "TRESPASSER.Terms.Attribute.Intellect",
  "spirit": "TRESPASSER.Terms.Attribute.Spirit",
  "initiative": "TRESPASSER.Sheet.Combat.Initiative",
  "accuracy": "TRESPASSER.Sheet.Combat.Accuracy",
  "guard": "TRESPASSER.Sheet.Combat.Guard",
  "resist": "TRESPASSER.Sheet.Combat.Resist",
  "prevail": "TRESPASSER.Sheet.Combat.Prevail",
  "tenacity": "TRESPASSER.Sheet.Combat.Tenacity",
  "speed": "TRESPASSER.Sheet.Combat.Speed",
  "speed_bonus": "TRESPASSER.Sheet.Combat.SpeedBonus",
  "armor": "TRESPASSER.Sheet.Item.Details.ArmorRating",
  "health": "TRESPASSER.Sheet.Header.HP",
  "max_health": "TRESPASSER.Sheet.Header.Health",
  "focus": "TRESPASSER.Sheet.Combat.Focus",
  "action_points": "TRESPASSER.Sheet.Combat.ActionPoints",
  "combat_phase": "TRESPASSER.Sheet.Combat.Phase",
  "damage_dealt": "TRESPASSER.App.System.Trigger.DamageDealt",
  "damage_received": "TRESPASSER.App.System.Trigger.DamageReceived",
  "heal_given": "TRESPASSER.App.System.Trigger.HealGiven",
  "heal_received": "TRESPASSER.App.System.Trigger.HealReceived",
  "endurance": "TRESPASSER.Sheet.Header.Endurance",
  "max_endurance": "TRESPASSER.Sheet.Header.Endurance"
};
