import fs from "fs";
import path from "path";

const PACK_DIR = "json-packs/trespasser-content";
const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith(".json"));

const findings = [];

for (const file of files) {
  const filePath = path.join(PACK_DIR, file);
  const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (json.type !== "deed") continue;

  const name = json.name;
  const sys = json.system || {};
  const graph = sys.graph || { nodes: [], connections: [] };
  const nodes = graph.nodes || [];
  const connections = graph.connections || [];

  const allDescs = [];
  if (sys.description) allDescs.push({ phase: "main", text: sys.description });
  for (const [pk, pv] of Object.entries(sys.phases || sys.effects || {})) {
    if (pv?.description) allDescs.push({ phase: pk, text: pv.description });
  }
  const fullText = allDescs.map(d => d.text).join(" ");
  const cleanText = fullText.replace(/<[^>]*>/g, " ");

  const nodeTypes = new Set(nodes.map(n => n.type));

  // Issue 1: Self Damage Mistake (e.g. Blood Gift)
  if (/\b(?:damage to yourself|take \d+ <sd> damage|suffer \d+ <sd> damage|deal \d+ <sd> damage to yourself)\b/i.test(cleanText)) {
    const hasDmg = nodeTypes.has("applyDamage");
    const selectSelf = nodes.find(n => n.type === "selectTarget" && n.params?.targetMode === "self");
    if (hasDmg && !selectSelf) {
      findings.push({
        deed: name,
        file,
        category: "Self-Damage Misattributed to Targets",
        severity: "Critical",
        detail: `Deed specifies damage to yourself, but targets ${sys.target || "area/creatures"} without 'selectTarget (self)' before applyDamage.`
      });
    }
  }

  // Issue 2: Missing Healing / Restore Nodes
  if (/\b(?:restore that many hit points|regain hit points equal to|restore hit points|regains hit points|restore \d+ hit points)\b/i.test(cleanText)) {
    if (!nodeTypes.has("healTarget") && !nodeTypes.has("grantRecovery")) {
      findings.push({
        deed: name,
        file,
        category: "Missing Heal/Recovery Behavior",
        severity: "Critical",
        detail: `Text specifies restoring/regaining hit points, but graph has no 'healTarget' or 'grantRecovery' node.`
      });
    }
  }

  // Issue 3: Reference Nodes in Main Flow Line
  const flowInSources = new Set(connections.filter(c => c.type === "flow").map(c => c.targetId));
  for (const n of nodes) {
    if (n.type === "selectArea" && flowInSources.has(n.id)) {
      findings.push({
        deed: name,
        file,
        category: "Reference Node in Flow (selectArea)",
        severity: "Architecture",
        detail: `selectArea node (${n.id}) has incoming flow connection; should be floating reference-only node.`
      });
    }
    if (n.type === "roll" && flowInSources.has(n.id)) {
      findings.push({
        deed: name,
        file,
        category: "Reference Node in Flow (roll)",
        severity: "Architecture",
        detail: `roll node (${n.id}) has incoming flow connection; should be floating reference-only node.`
      });
    }
  }

  // Issue 4: Disposition Split in AoE (Enemies only vs Allies only)
  if (/\byou only target enemies in the area\b/i.test(cleanText) || /\ballies in the area\b/i.test(cleanText)) {
    const selectTargets = nodes.filter(n => n.type === "selectTarget");
    const hasDispFilter = selectTargets.some(st => st.params?.disposition);
    if (!hasDispFilter && selectTargets.length > 0) {
      findings.push({
        deed: name,
        file,
        category: "Missing Disposition Filter in AoE",
        severity: "Major",
        detail: `Deed text specifies targeting only enemies or allies in area, but selectTarget lacks disposition filter.`
      });
    }
  }

  // Issue 5: Text-only Terrain Spawn
  if (/\b(?:create a field of|creates? difficult terrain|create a black powder trap|create a wall)\b/i.test(cleanText)) {
    if (!nodeTypes.has("spawnTerrain")) {
      findings.push({
        deed: name,
        file,
        category: "Missing Terrain Spawn",
        severity: "Major",
        detail: `Deed text specifies creating terrain/field/trap, but no spawnTerrain node exists in graph.`
      });
    }
  }

  // Issue 6: Unresolved "Both instead" Spark
  if (/\bconfer both instead\b/i.test(cleanText)) {
    const sparkEff = nodes.find(n => n.phase === "spark" && n.type === "applyEffects");
    if (!sparkEff) {
      findings.push({
        deed: name,
        file,
        category: "Missing 'Both Instead' Spark Behavior",
        severity: "Major",
        detail: `Spark text specifies 'Confer both instead', but spark phase has no applyEffects node.`
      });
    }
  }

  // Issue 7: Text-only Source Movement
  if (/\b(?:you shift \d+|move \d+, then repeat|teleport the target|target can teleport)\b/i.test(cleanText)) {
    if (!nodeTypes.has("moveSource") && !nodeTypes.has("forceMoveTargets")) {
      findings.push({
        deed: name,
        file,
        category: "Missing Movement Behavior",
        severity: "Minor",
        detail: `Deed mentions shift/move/teleport, but lacks moveSource or forceMoveTargets node.`
      });
    }
  }
}

console.log(`Total Issues Discovered: ${findings.length}`);
const catCounts = {};
findings.forEach(f => { catCounts[f.category] = (catCounts[f.category] || 0) + 1; });
console.log("\nSummary by Category:");
for (const [cat, cnt] of Object.entries(catCounts)) {
  console.log(`  - ${cat}: ${cnt}`);
}

fs.writeFileSync("scripts/audit-results.json", JSON.stringify(findings, null, 2), "utf-8");
