import fs from "fs";
import path from "path";

const PACK_DIR = "json-packs/trespasser-content";
const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith(".json"));

const allMistakes = [];

for (const file of files) {
  const filePath = path.join(PACK_DIR, file);
  const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (json.type !== "deed") continue;

  const name = json.name;
  const sys = json.system || {};
  const graph = sys.graph || { nodes: [], connections: [] };
  const nodes = graph.nodes || [];
  const connections = graph.connections || [];

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const nodeTypes = new Set(nodes.map(n => n.type));

  // Collect text
  const phaseTexts = {};
  for (const [pk, pv] of Object.entries(sys.phases || sys.effects || {})) {
    if (pv?.description) phaseTexts[pk] = pv.description;
  }
  const mainDesc = sys.description || "";
  const fullText = [mainDesc, ...Object.values(phaseTexts)].join(" ");
  const cleanText = fullText.replace(/<[^>]*>/g, " ");

  // 1. Check Reference Nodes in Flow Line
  const flowConns = connections.filter(c => c.type === "flow");
  for (const node of nodes) {
    if (node.type === "selectArea" || node.type === "roll") {
      const incomingFlow = flowConns.filter(c => c.targetId === node.id);
      const outgoingFlow = flowConns.filter(c => c.sourceId === node.id);
      if (incomingFlow.length > 0 || outgoingFlow.length > 0) {
        allMistakes.push({
          deed: name,
          file,
          type: "Reference Node in Flow",
          nodeType: node.type,
          nodeId: node.id,
          description: `${node.type} has flow connections (${incomingFlow.length} in, ${outgoingFlow.length} out). It must be an isolated reference node linked only via reference ports.`,
          fix: `Remove flow connections to/from ${node.type}, connect reference ports (areaRef/rollRef), and place at y: 40.`
        });
      }
    }
  }

  // 2. Check Self-Damage / Self-Targeting Misattributions
  // Pattern: "damage to yourself", "suffer X damage", "deal X ... damage to yourself"
  const selfDamageMatch = cleanText.match(/(?:deal\s+(\d+|<sd>|skill die).*?damage to yourself|take\s+(\d+|<sd>|skill die).*?damage|suffer\s+(\d+|<sd>|skill die).*?damage)/i);
  if (selfDamageMatch) {
    const dmgNodes = nodes.filter(n => n.type === "applyDamage");
    const selfTargetNodes = nodes.filter(n => n.type === "selectTarget" && n.params?.targetMode === "self");
    if (dmgNodes.length > 0 && selfTargetNodes.length === 0) {
      allMistakes.push({
        deed: name,
        file,
        type: "Self-Damage Misattribution",
        nodeType: "applyDamage",
        description: `Deed text specifies self-damage ("${selfDamageMatch[0]}"), but graph lacks 'selectTarget (self)' before applyDamage. Currently damage applies to target area/tokens.`,
        fix: "Add 'selectTarget (self)' node before applyDamage so the caster takes the damage instead of the targets."
      });
    }
  }

  // 3. Check Missing Healing / HP Restoration
  const healMatch = cleanText.match(/(?:restore that many hit points|regain hit points equal to|restore\s+\d+\s+hit points|regains?\s+\d+\s+hit points|restore hit points equal to|heals?\s+\d+\s+hit points)/i);
  if (healMatch) {
    const hasHeal = nodes.some(n => n.type === "healTarget" || n.type === "grantRecovery");
    if (!hasHeal) {
      allMistakes.push({
        deed: name,
        file,
        type: "Missing Heal/Recovery Behavior",
        nodeType: "healTarget",
        description: `Deed text specifies healing ("${healMatch[0]}"), but graph contains no healTarget or grantRecovery node.`,
        fix: "Add 'healTarget' node connected to the appropriate target and referencing the damage/roll if applicable."
      });
    }
  }

  // 4. Check Target Scoping: AoE with Disposition or Allies/Enemies Restrictions
  const enemyOnlyMatch = cleanText.match(/you only target enemies in the area/i);
  const allyOnlyMatch = cleanText.match(/you only target allies in the area/i);
  const allyEffectMatch = cleanText.match(/allies in the area (?:instead|gain|may|regain)/i);
  if (enemyOnlyMatch || allyOnlyMatch || allyEffectMatch) {
    const selectTargetNodes = nodes.filter(n => n.type === "selectTarget");
    const hasDispositionFilter = selectTargetNodes.some(n => n.params?.disposition);
    if (!hasDispositionFilter) {
      allMistakes.push({
        deed: name,
        file,
        type: "Missing Disposition Filter/Branching",
        nodeType: "selectTarget",
        description: `Deed specifies distinct behavior for allies vs enemies in the area, but selectTarget does not filter by disposition.`,
        fix: "Configure selectTarget disposition filter ('hostile' / 'friendly') or branch by target disposition."
      });
    }
  }

  // 5. Check Spark "Confer both instead" or Missing Spark Behaviors
  if (/confer both instead/i.test(cleanText)) {
    const sparkNodes = nodes.filter(n => n.phase === "spark");
    if (sparkNodes.length === 0) {
      allMistakes.push({
        deed: name,
        file,
        type: "Missing Spark 'Both Instead' Behavior",
        nodeType: "applyEffects",
        description: `Spark text specifies 'Confer both instead', but spark phase has no graph nodes.`,
        fix: "Add spark applyEffects node containing both status effects, wired to rollAccuracy.onSpark."
      });
    }
  }

  // 6. Check Text-Only Terrain Creation
  const terrainMatch = cleanText.match(/(?:create a field of|creates? difficult terrain|create a black powder trap|create a wall of|place a \d+x\d+)/i);
  if (terrainMatch) {
    if (!nodeTypes.has("spawnTerrain")) {
      allMistakes.push({
        deed: name,
        file,
        type: "Missing Terrain Spawn",
        nodeType: "spawnTerrain",
        description: `Text specifies creating terrain/field/wall ("${terrainMatch[0]}"), but no spawnTerrain node exists.`,
        fix: "Add 'spawnTerrain' node linked to the areaRef."
      });
    }
  }

  // 7. Check Broken Connections or Hanging Nodes
  for (const conn of connections) {
    if (!nodeMap.has(conn.sourceId) || !nodeMap.has(conn.targetId)) {
      allMistakes.push({
        deed: name,
        file,
        type: "Broken Connection",
        description: `Connection ${conn.id} points to nonexistent source (${conn.sourceId}) or target (${conn.targetId}).`,
        fix: "Remove orphaned connection."
      });
    }
  }

  // 8. Check Coordinate Overlaps
  const coordMap = new Map();
  for (const n of nodes) {
    const key = `${n.x},${n.y}`;
    if (coordMap.has(key)) {
      allMistakes.push({
        deed: name,
        file,
        type: "Node Overlap",
        nodeId: n.id,
        description: `Node '${n.type}' (${n.id}) overlaps with node '${coordMap.get(key).type}' at coordinates (${n.x}, ${n.y}).`,
        fix: "Offset node coordinates to avoid visual overlap in graph editor."
      });
    } else {
      coordMap.set(key, n);
    }
  }
}

console.log(`Total Mistakes Found: ${allMistakes.length}`);
const catSummary = {};
for (const m of allMistakes) {
  catSummary[m.type] = (catSummary[m.type] || 0) + 1;
}
console.log("Summary by Category:", JSON.stringify(catSummary, null, 2));

fs.writeFileSync("scripts/deep-audit-results.json", JSON.stringify(allMistakes, null, 2), "utf-8");
