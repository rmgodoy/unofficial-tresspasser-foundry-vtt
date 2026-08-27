/**
 * Treasure Generation Configuration for Trespasser RPG
 *
 * Based on the Core Rules (p. 260 / Treasure tables):
 * - Form Factor: 1d20 + 1d6 (1-3 vs 4-6 column)
 * - Material: 1d20
 * - Gemstone: 1d20
 * - Value: 3d20 sum (<30: Rare / 1 XP, 30+: Precious / 3 XP, 40+: Fabulous / 5 XP)
 */

export const TREASURE_CONFIG = {
  formFactors: {
    1: {
      col1: { key: "currency", label: "TRESPASSER.Terms.Treasure.Forms.Currency", noGem: true },
      col2: { key: "gem", label: "TRESPASSER.Terms.Treasure.Forms.Gem", noMaterial: true }
    },
    2: {
      col1: { key: "gamePiece", label: "TRESPASSER.Terms.Treasure.Forms.GamePiece", isTiny: true },
      col2: { key: "childsToy", label: "TRESPASSER.Terms.Treasure.Forms.ChildsToy" }
    },
    3: {
      col1: { key: "earring", label: "TRESPASSER.Terms.Treasure.Forms.Earring", isTiny: true },
      col2: { key: "book", label: "TRESPASSER.Terms.Treasure.Forms.Book" }
    },
    4: {
      col1: { key: "ring", label: "TRESPASSER.Terms.Treasure.Forms.Ring", isTiny: true },
      col2: { key: "scrollAndCase", label: "TRESPASSER.Terms.Treasure.Forms.ScrollAndCase" }
    },
    5: {
      col1: { key: "buckle", label: "TRESPASSER.Terms.Treasure.Forms.Buckle", isTiny: true },
      col2: { key: "box", label: "TRESPASSER.Terms.Treasure.Forms.Box" }
    },
    6: {
      col1: { key: "hairpin", label: "TRESPASSER.Terms.Treasure.Forms.Hairpin", isTiny: true },
      col2: { key: "flute", label: "TRESPASSER.Terms.Treasure.Forms.Flute" }
    },
    7: {
      col1: { key: "figurine", label: "TRESPASSER.Terms.Treasure.Forms.Figurine", isTiny: true },
      col2: { key: "lute", label: "TRESPASSER.Terms.Treasure.Forms.Lute" }
    },
    8: {
      col1: { key: "bracelet", label: "TRESPASSER.Terms.Treasure.Forms.Bracelet", isTiny: true },
      col2: { key: "horn", label: "TRESPASSER.Terms.Treasure.Forms.Horn" }
    },
    9: {
      col1: { key: "circlet", label: "TRESPASSER.Terms.Treasure.Forms.Circlet" },
      col2: { key: "harp", label: "TRESPASSER.Terms.Treasure.Forms.Harp" }
    },
    10: {
      col1: { key: "necklace", label: "TRESPASSER.Terms.Treasure.Forms.Necklace" },
      col2: { key: "candelabra", label: "TRESPASSER.Terms.Treasure.Forms.Candelabra" }
    },
    11: {
      col1: { key: "goblet", label: "TRESPASSER.Terms.Treasure.Forms.Goblet" },
      col2: { key: "gameSet", label: "TRESPASSER.Terms.Treasure.Forms.GameSet" }
    },
    12: {
      col1: { key: "vessel", label: "TRESPASSER.Terms.Treasure.Forms.Vessel" },
      col2: { key: "painting", label: "TRESPASSER.Terms.Treasure.Forms.Painting" }
    },
    13: {
      col1: { key: "bell", label: "TRESPASSER.Terms.Treasure.Forms.Bell" },
      col2: { key: "statuette", label: "TRESPASSER.Terms.Treasure.Forms.Statuette" }
    },
    14: {
      col1: { key: "doll", label: "TRESPASSER.Terms.Treasure.Forms.Doll" },
      col2: { key: "mask", label: "TRESPASSER.Terms.Treasure.Forms.Mask" }
    },
    15: {
      col1: { key: "mirror", label: "TRESPASSER.Terms.Treasure.Forms.Mirror" },
      col2: { key: "vase", label: "TRESPASSER.Terms.Treasure.Forms.Vase" }
    },
    16: {
      col1: { key: "spyglass", label: "TRESPASSER.Terms.Treasure.Forms.Spyglass" },
      col2: { key: "tapestry", label: "TRESPASSER.Terms.Treasure.Forms.Tapestry" }
    },
    17: {
      col1: { key: "scepter", label: "TRESPASSER.Terms.Treasure.Forms.Scepter" },
      col2: { key: "exquisiteGarb", label: "TRESPASSER.Terms.Treasure.Forms.ExquisiteGarb" }
    },
    18: {
      col1: { key: "crown", label: "TRESPASSER.Terms.Treasure.Forms.Crown" },
      col2: { key: "fancifulGarb", label: "TRESPASSER.Terms.Treasure.Forms.FancifulGarb" }
    },
    19: {
      col1: { key: "sacredIcon", label: "TRESPASSER.Terms.Treasure.Forms.SacredIcon" },
      col2: { key: "prostheticLimb", label: "TRESPASSER.Terms.Treasure.Forms.ProstheticLimb" }
    },
    20: {
      col1: { key: "holyRelic", label: "TRESPASSER.Terms.Treasure.Forms.HolyRelic" },
      col2: { key: "ceremonialArms", label: "TRESPASSER.Terms.Treasure.Forms.CeremonialArms" }
    }
  },

  materials: {
    1: { key: "stone", label: "TRESPASSER.Terms.Treasure.Materials.Stone" },
    2: { key: "wood", label: "TRESPASSER.Terms.Treasure.Materials.Wood" },
    3: { key: "bone", label: "TRESPASSER.Terms.Treasure.Materials.Bone" },
    4: { key: "leather", label: "TRESPASSER.Terms.Treasure.Materials.Leather" },
    5: { key: "bronze", label: "TRESPASSER.Terms.Treasure.Materials.Bronze" },
    6: { key: "tin", label: "TRESPASSER.Terms.Treasure.Materials.Tin" },
    7: { key: "lead", label: "TRESPASSER.Terms.Treasure.Materials.Lead" },
    8: { key: "pewter", label: "TRESPASSER.Terms.Treasure.Materials.Pewter" },
    9: { key: "brass", label: "TRESPASSER.Terms.Treasure.Materials.Brass" },
    10: { key: "copper", label: "TRESPASSER.Terms.Treasure.Materials.Copper" },
    11: { key: "iron", label: "TRESPASSER.Terms.Treasure.Materials.Iron" },
    12: { key: "porcelain", label: "TRESPASSER.Terms.Treasure.Materials.Porcelain" },
    13: { key: "glass", label: "TRESPASSER.Terms.Treasure.Materials.Glass" },
    14: { key: "coral", label: "TRESPASSER.Terms.Treasure.Materials.Coral" },
    15: { key: "petrifiedWood", label: "TRESPASSER.Terms.Treasure.Materials.PetrifiedWood" },
    16: { key: "crystal", label: "TRESPASSER.Terms.Treasure.Materials.Crystal" },
    17: { key: "silver", label: "TRESPASSER.Terms.Treasure.Materials.Silver" },
    18: { key: "electrum", label: "TRESPASSER.Terms.Treasure.Materials.Electrum" },
    19: { key: "gold", label: "TRESPASSER.Terms.Treasure.Materials.Gold" },
    20: { key: "platinum", label: "TRESPASSER.Terms.Treasure.Materials.Platinum" }
  },

  gemstones: {
    1: { key: "jasper", label: "TRESPASSER.Terms.Treasure.Gemstones.Jasper" },
    2: { key: "citrine", label: "TRESPASSER.Terms.Treasure.Gemstones.Citrine" },
    3: { key: "moonstone", label: "TRESPASSER.Terms.Treasure.Gemstones.Moonstone" },
    4: { key: "jade", label: "TRESPASSER.Terms.Treasure.Gemstones.Jade" },
    5: { key: "lapisLazuli", label: "TRESPASSER.Terms.Treasure.Gemstones.LapisLazuli" },
    6: { key: "amber", label: "TRESPASSER.Terms.Treasure.Gemstones.Amber" },
    7: { key: "moonstone2", label: "TRESPASSER.Terms.Treasure.Gemstones.Moonstone" },
    8: { key: "agate", label: "TRESPASSER.Terms.Treasure.Gemstones.Agate" },
    9: { key: "peridot", label: "TRESPASSER.Terms.Treasure.Gemstones.Peridot" },
    10: { key: "turquoise", label: "TRESPASSER.Terms.Treasure.Gemstones.Turquoise" },
    11: { key: "amethyst", label: "TRESPASSER.Terms.Treasure.Gemstones.Amethyst" },
    12: { key: "opal", label: "TRESPASSER.Terms.Treasure.Gemstones.Opal" },
    13: { key: "aquamarine", label: "TRESPASSER.Terms.Treasure.Gemstones.Aquamarine" },
    14: { key: "zircon", label: "TRESPASSER.Terms.Treasure.Gemstones.Zircon" },
    15: { key: "garnet", label: "TRESPASSER.Terms.Treasure.Gemstones.Garnet" },
    16: { key: "pearl", label: "TRESPASSER.Terms.Treasure.Gemstones.Pearl" },
    17: { key: "emerald", label: "TRESPASSER.Terms.Treasure.Gemstones.Emerald" },
    18: { key: "sapphire", label: "TRESPASSER.Terms.Treasure.Gemstones.Sapphire" },
    19: { key: "ruby", label: "TRESPASSER.Terms.Treasure.Gemstones.Ruby" },
    20: { key: "diamond", label: "TRESPASSER.Terms.Treasure.Gemstones.Diamond" }
  },

  valueTiers: {
    rare: {
      key: "rare",
      label: "TRESPASSER.Terms.Treasure.Tiers.Rare",
      value: 1,
      min: 3,
      max: 29,
      color: "var(--trp-blue, #3f51b5)",
      border: "#3f51b5"
    },
    precious: {
      key: "precious",
      label: "TRESPASSER.Terms.Treasure.Tiers.Precious",
      value: 3,
      min: 30,
      max: 39,
      color: "var(--trp-purple, #9575cd)",
      border: "#9575cd"
    },
    fabulous: {
      key: "fabulous",
      label: "TRESPASSER.Terms.Treasure.Tiers.Fabulous",
      value: 5,
      min: 40,
      max: 60,
      color: "var(--trp-gold-bright, #e8c96b)",
      border: "#c9a84c"
    }
  }
};
