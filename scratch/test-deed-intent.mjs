import fs from "node:fs";
import path from "node:path";

// Mock minimal Foundry environment
globalThis.Actor = class {};
globalThis.Token = class {};
globalThis.TokenDocument = class {};
globalThis.foundry = {
  utils: { debounce: fn => fn },
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (b) => b
    }
  }
};
globalThis.Hooks = { on() {}, once() {}, off() {} };
globalThis.CONFIG = {};
globalThis.CONST = {
  TOKEN_DISPOSITIONS: {
    FRIENDLY: 1,
    NEUTRAL: 0,
    HOSTILE: -1
  }
};
globalThis.game = {
  i18n: {
    localize(k) { return k; },
    format(k, data) { return JSON.stringify(data); },
    has() { return true; }
  },
  settings: { get() { return true; } }
};
globalThis.canvas = {
  grid: { size: 100 },
  tokens: { get() { return null; } }
};

const { DeedIntentResolver } = await import("../module/targeting/deed-intent-resolver.mjs");

function loadDeedJson(filename) {
  const filePath = path.join(process.cwd(), "json-packs", "trespasser-content", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

console.log("=== RUNNING DEED INTENT RESOLVER TESTS ===");

const casterToken = { id: "caster1", name: "Caster", document: { id: "caster1", name: "Caster", disposition: 1 } };
const enemyToken = { id: "enemy1", name: "Enemy", document: { id: "enemy1", name: "Enemy", disposition: -1 } };
const allyToken = { id: "ally1", name: "Ally", document: { id: "ally1", name: "Ally", disposition: 1 } };

// 1. TEST EXSANGUINATE
console.log("\n--- TEST 1: Exsanguinate ---");
const exsanguinateItem = loadDeedJson("Exsanguinate_teca6W7zdAxkK3nN.json");

// Stage 1: Select Enemy (activeNodeId = B3IkzJ1Qpo5Am73x)
const exStage1Outcomes = DeedIntentResolver.resolveTargetsOutcome([enemyToken], casterToken, exsanguinateItem, {
  activeNodeId: "B3IkzJ1Qpo5Am73x"
});

const enemyStage1 = exStage1Outcomes.get("enemy1");
console.log("Exsanguinate Stage 1 (Enemy):", {
  role: enemyStage1?.role,
  intent: enemyStage1?.intent,
  anywayDamage: enemyStage1?.anyway?.damage,
  anywayHealing: enemyStage1?.anyway?.healing,
  onHitDamage: enemyStage1?.onHit?.damage,
  onHitHealing: enemyStage1?.onHit?.healing
});

if (enemyStage1?.anyway?.damage.length > 0 && enemyStage1?.onHit?.healing.length === 0 && enemyStage1?.anyway?.healing.length === 0) {
  console.log("✅ Exsanguinate Stage 1: Enemy takes damage, NO healing shown!");
} else {
  console.error("❌ Exsanguinate Stage 1 FAILED");
  process.exit(1);
}

// Stage 2: Select Allies to heal (activeNodeId = zHFUAKIEB61rjkqi), damage rolled was 14
const exStage2Outcomes = DeedIntentResolver.resolveTargetsOutcome([allyToken, casterToken], casterToken, exsanguinateItem, {
  activeNodeId: "zHFUAKIEB61rjkqi",
  runtimeContext: {
    accuracyResolved: true,
    isHit: true,
    evaluatedRolls: new Map([
      ["KHptbAfb7ZU1fBXV", { total: 14 }]
    ])
  }
});

const allyStage2 = exStage2Outcomes.get("ally1");
const casterStage2 = exStage2Outcomes.get("caster1");

console.log("Exsanguinate Stage 2 (Ally):", {
  role: allyStage2?.role,
  intent: allyStage2?.intent,
  healing: allyStage2?.anyway?.healing,
  damage: allyStage2?.anyway?.damage,
  html: allyStage2?.anyway?.html
});

if (allyStage2?.anyway?.healing.includes("14") && allyStage2?.anyway?.damage.length === 0 && allyStage2?.intent === "beneficial") {
  console.log("✅ Exsanguinate Stage 2: Ally receives +14 healing, NO damage shown!");
} else {
  console.error("❌ Exsanguinate Stage 2 FAILED for Ally");
  process.exit(1);
}

if (casterStage2?.anyway?.healing.includes("14") && casterStage2?.anyway?.damage.length === 0) {
  console.log("✅ Exsanguinate Stage 2: Caster receives +14 healing, NO damage shown!");
} else {
  console.error("❌ Exsanguinate Stage 2 FAILED for Caster");
  process.exit(1);
}


// 2. TEST LEECH
console.log("\n--- TEST 2: Leech ---");
const leechItem = loadDeedJson("Leech_xT2Yoxm9Vx00XniM.json");

// Stage 1: Attack enemy (activeNodeId = B3IkzJ1Qpo5Am73x)
const leechStage1Outcomes = DeedIntentResolver.resolveTargetsOutcome([enemyToken], casterToken, leechItem, {
  activeNodeId: "B3IkzJ1Qpo5Am73x"
});
const enemyLeech1 = leechStage1Outcomes.get("enemy1");
console.log("Leech Stage 1 (Enemy):", {
  role: enemyLeech1?.role,
  onHitDamage: enemyLeech1?.onHit?.damage,
  onSparkHealing: enemyLeech1?.onSpark?.healing
});

if (enemyLeech1?.onHit?.damage.length > 0 && enemyLeech1?.onSpark?.healing.length === 0) {
  console.log("✅ Leech Stage 1: Enemy suffers damage onHit, NO onSpark healing shown!");
} else {
  console.error("❌ Leech Stage 1 FAILED");
  process.exit(1);
}

// Stage 2: On Spark heal ally (activeNodeId = AjqX3hSdGOB7MPtQ), damage roll was 8
const leechStage2Outcomes = DeedIntentResolver.resolveTargetsOutcome([allyToken], casterToken, leechItem, {
  activeNodeId: "AjqX3hSdGOB7MPtQ",
  runtimeContext: {
    accuracyResolved: true,
    isSpark: true,
    evaluatedRolls: new Map([
      ["BhMvm47mkFA6a7Xc", { total: 8 }]
    ])
  }
});
const allyLeech2 = leechStage2Outcomes.get("ally1");
console.log("Leech Stage 2 (Ally):", {
  role: allyLeech2?.role,
  healing: allyLeech2?.anyway?.healing,
  html: allyLeech2?.anyway?.html
});

if (allyLeech2?.anyway?.healing.includes("4") && allyLeech2?.anyway?.damage.length === 0) {
  console.log("✅ Leech Stage 2: Ally receives +4 healing (half of 8), NO damage shown!");
} else {
  console.error("❌ Leech Stage 2 FAILED");
  process.exit(1);
}


// 3. TEST BLOOD GIFT (Automatic Multi-Target)
console.log("\n--- TEST 3: Blood Gift ---");
const bloodGiftItem = loadDeedJson("Blood_Gift_mXY519L0WuBYpQjh.json");

// During Burst 6 placement (no activeNodeId or selectArea node)
const bloodGiftOutcomes = DeedIntentResolver.resolveTargetsOutcome([allyToken], casterToken, bloodGiftItem, {});

const bgCaster = bloodGiftOutcomes.get("caster1");
const bgAlly = bloodGiftOutcomes.get("ally1");

console.log("Blood Gift (Caster):", {
  role: bgCaster?.role,
  intent: bgCaster?.intent,
  damage: bgCaster?.anyway?.damage || bgCaster?.onHit?.damage,
  healing: bgCaster?.anyway?.healing
});
console.log("Blood Gift (Ally):", {
  role: bgAlly?.role,
  intent: bgAlly?.intent,
  damage: bgAlly?.anyway?.damage,
  healing: bgAlly?.anyway?.healing || bgAlly?.onHit?.healing
});

if (bgCaster?.intent === "harmful" && bgAlly?.intent === "beneficial") {
  console.log("✅ Blood Gift: Caster suffers damage, Ally receives healing simultaneously!");
} else {
  console.error("❌ Blood Gift FAILED");
  process.exit(1);
}


// 4. TEST INCISION (Single-target standard deed)
console.log("\n--- TEST 4: Incision ---");
const incisionItem = loadDeedJson("Incision_YmHtZo571Ts30A7k.json");
const incisionOutcomes = DeedIntentResolver.resolveTargetsOutcome([enemyToken], casterToken, incisionItem, {
  activeNodeId: "JpMSRCzR4FYjYOgi"
});
const enemyIncision = incisionOutcomes.get("enemy1");
console.log("Incision (Enemy):", {
  onHitDamage: enemyIncision?.onHit?.damage,
  onHitEffects: enemyIncision?.onHit?.effects?.map(e => e.name),
  onSparkEffects: enemyIncision?.onSpark?.effects?.map(e => e.name)
});

if (enemyIncision?.onHit?.damage.length > 0 && enemyIncision?.onHit?.effects.length > 0 && enemyIncision?.onSpark?.effects.length > 0) {
  console.log("✅ Incision: Single-target deed resolves onHit and onSpark correctly!");
} else {
  console.error("❌ Incision FAILED");
  process.exit(1);
}

console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n");
