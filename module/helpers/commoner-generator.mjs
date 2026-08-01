const VIRTUES_VICES_TABLE = [
  { virtue: "calm", vice: "wrathful" },        // 1
  { virtue: "daring", vice: "cowardly" },      // 2
  { virtue: "thoughtful", vice: "impulsive" }, // 3
  { virtue: "dutiful", vice: "unruly" },       // 4
  { virtue: "generous", vice: "greedy" },      // 5
  { virtue: "honest", vice: "deceitful" },     // 6
  { virtue: "supportive", vice: "envious" },   // 7
  { virtue: "humble", vice: "arrogant" },      // 8
  { virtue: "kind", vice: "cruel" },           // 9
  { virtue: "trusting", vice: "paranoid" }     // 10
];

const ODDITIES_GRID = [
  ["obsessive", "steadfast", "altruistic", "haunted", "crude", "naive"],
  ["whimsical", "imperious", "observant", "prideful", "selfRighteous", "vile"],
  ["anarchic", "eloquent", "jaded", "imaginative", "blunt", "tedious"],
  ["gentle", "delusional", "capricious", "nonchalant", "valiant", "merciful"],
  ["destructive", "loyal", "sarcastic", "servile", "ethical", "devout"],
  ["callous", "tense", "seductive", "fairMinded", "spirited", "absentminded"],
  ["slothful", "curious", "clumsy", "heartless", "dramatic", "erudite"],
  ["stoic", "cheerful", "regal", "ambitious", "reliable", "vengeful"]
];

/**
 * Rolls 4d4 and allocates results:
 * 1 -> Might (+1)
 * 2 -> Agility (+1)
 * 3 -> Intellect (+1)
 * 4 -> Spirit (+1)
 */
export async function rollCommonerAttributes() {
  const roll = await new Roll("4d4").evaluate();
  const results = roll.dice[0].results.map(r => r.result);

  const attributes = { mighty: 0, agility: 0, intellect: 0, spirit: 0 };
  for (const val of results) {
    switch (val) {
      case 1: attributes.mighty++; break;
      case 2: attributes.agility++; break;
      case 3: attributes.intellect++; break;
      case 4: attributes.spirit++; break;
    }
  }

  return { roll, attributes };
}

/**
 * Rolls an alignment based on Alignment Types, Virtues & Vices, and Oddities tables.
 * Handles Strange alignment rerolls (doubles on virtues/vices table or duplicate oddities).
 */
export async function rollCommonerAlignment() {
  const typeRoll = await new Roll("1d10").evaluate();
  const typeVal = typeRoll.total;

  let category = "";
  let traitsToRoll = [];

  if (typeVal === 1) {
    category = "wicked";
    traitsToRoll = ["vice", "vice"];
  } else if (typeVal <= 3) {
    category = "unhinged";
    traitsToRoll = ["vice", "oddity"];
  } else if (typeVal <= 7) {
    category = "balanced";
    traitsToRoll = ["virtue", "vice"];
  } else if (typeVal <= 9) {
    category = "eccentric";
    traitsToRoll = ["virtue", "oddity"];
  } else {
    category = "virtuous";
    traitsToRoll = ["virtue", "virtue"];
  }

  const traitRolls = [];
  for (const tType of traitsToRoll) {
    if (tType === "virtue" || tType === "vice") {
      const r = await new Roll("1d10").evaluate();
      traitRolls.push({ type: tType, index: r.total - 1, roll: r.total });
    } else {
      const rRow = await new Roll("1d8").evaluate();
      const rCol = await new Roll("1d6").evaluate();
      const name = ODDITIES_GRID[rRow.total - 1][rCol.total - 1];
      traitRolls.push({ type: "oddity", name, row: rRow.total, col: rCol.total });
    }
  }

  // Strange Alignment Condition: doubles on Virtues/Vices table or identical oddities
  let isStrange = false;
  if (traitRolls.length === 2) {
    const [t1, t2] = traitRolls;
    if (t1.type !== "oddity" && t2.type !== "oddity" && t1.index === t2.index) {
      isStrange = true;
    } else if (t1.type === "oddity" && t2.type === "oddity" && t1.name === t2.name) {
      isStrange = true;
    }
  }

  if (isStrange) {
    category = "strange";
    const o1Row = await new Roll("1d8").evaluate();
    const o1Col = await new Roll("1d6").evaluate();
    const o2Row = await new Roll("1d8").evaluate();
    const o2Col = await new Roll("1d6").evaluate();

    const o1 = ODDITIES_GRID[o1Row.total - 1][o1Col.total - 1];
    const o2 = ODDITIES_GRID[o2Row.total - 1][o2Col.total - 1];

    traitRolls[0] = { type: "oddity", name: o1 };
    traitRolls[1] = { type: "oddity", name: o2 };
  }

  const categoryLabel = game.i18n.localize(`TRESPASSER.ALIGNMENT.TYPES.${category}`);
  const traitNames = traitRolls.map(t => {
    if (t.type === "virtue") return game.i18n.localize(`TRESPASSER.ALIGNMENT.VIRTUES.${VIRTUES_VICES_TABLE[t.index].virtue}`);
    if (t.type === "vice") return game.i18n.localize(`TRESPASSER.ALIGNMENT.VICES.${VIRTUES_VICES_TABLE[t.index].vice}`);
    return game.i18n.localize(`TRESPASSER.ALIGNMENT.ODDITIES.${t.name}`);
  });

  const formattedAlignment = `${categoryLabel} (${traitNames.join(", ")})`;
  return { category, traitRolls, formattedAlignment };
}

/**
 * Automates full generation of a commoner: rolls 4d4 stats, rolls alignment, and updates actor.
 */
export async function generateCommoner(actor) {
  if (actor.system.isGenerated) return;

  const { attributes } = await rollCommonerAttributes();
  const { formattedAlignment } = await rollCommonerAlignment();

  await actor.update({
    "system.attributes": attributes,
    "system.alignment": formattedAlignment,
    "system.isGenerated": true
  });
}

export const CommonerGenerator = {
  rollCommonerAttributes,
  rollCommonerAlignment,
  generateCommoner
};
