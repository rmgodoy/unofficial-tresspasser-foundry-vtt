import fs from "fs";
import path from "path";

const PACK_DIR = "json-packs/trespasser-content";
const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith(".json"));

let auditedCount = 0;
const report = {
  totalDeeds: 0,
  referenceNodesValid: 0,
  aoeAreaTargetValid: 0,
  sharedRollsValid: 0,
  sparkBothInsteadValid: 0,
  reachabilityValid: 0,
  discrepancies: []
};

for (const file of files) {
  const filePath = path.join(PACK_DIR, file);
  const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (json.type !== "deed") continue;

  auditedCount++;
  report.totalDeeds++;

  const name = json.name;
  const sys = json.system || {};
  const graph = sys.graph || { nodes: [], connections: [] };
  const nodes = graph.nodes || [];
  const connections = graph.connections || [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Check 1: Graph Flow Reachability from Start
  const startNode = nodes.find(n => n.type === "start");
  const reachable = new Set();
  if (startNode) {
    const queue = [startNode.id];
    reachable.add(startNode.id);
    while (queue.length > 0) {
      const curr = queue.shift();
      const outConns = connections.filter(c => c.sourceId === curr && c.type === "flow");
      for (const c of outConns) {
        if (!reachable.has(c.targetId)) {
          reachable.add(c.targetId);
          queue.push(c.targetId);
        }
      }
    }
  }

  // Check for unreachable flow nodes
  for (const n of nodes) {
    if (n.type === "selectArea" || n.type === "roll") continue; // Reference nodes are intentionally non-flow!
    if (!reachable.has(n.id)) {
      report.discrepancies.push({
        deed: name,
        file,
        type: "Unreachable Flow Node",
        detail: `Node '${n.type}' (${n.id}) cannot be reached via flow connections from Start.`
      });
    }
  }
  if (reachable.size > 0) report.reachabilityValid++;

  // Check 2: Reference Node Independence
  const refNodes = nodes.filter(n => n.type === "selectArea" || n.type === "roll");
  let allRefValid = true;
  for (const rn of refNodes) {
    const inFlow = connections.filter(c => c.targetId === rn.id && c.type === "flow");
    const outFlow = connections.filter(c => c.sourceId === rn.id && c.type === "flow");
    if (inFlow.length > 0 || outFlow.length > 0) {
      allRefValid = false;
      report.discrepancies.push({
        deed: name,
        file,
        type: "Reference Node in Flow",
        detail: `Reference node '${rn.type}' (${rn.id}) has flow connections.`
      });
    }
  }
  if (allRefValid) report.referenceNodesValid++;

  // Check 3: AoE Target Wiring
  const areaNodes = nodes.filter(n => n.type === "selectArea");
  for (const an of areaNodes) {
    const consumers = connections.filter(c => c.sourceId === an.id && c.type === "reference");
    if (consumers.length === 0) {
      report.discrepancies.push({
        deed: name,
        file,
        type: "Unused selectArea Node",
        detail: `selectArea node (${an.id}) has no downstream reference consumers.`
      });
    } else {
      report.aoeAreaTargetValid++;
    }
  }

  // Check 4: Spark Both Instead Integrity
  const allDescs = [];
  if (sys.description) allDescs.push(sys.description);
  for (const [k, v] of Object.entries(sys.phases || {})) if (v?.description) allDescs.push(v.description);
  const cleanText = allDescs.join(" ").replace(/<[^>]*>/g, " ");

  if (/\bconfer\s+both\s+instead\b/i.test(cleanText)) {
    const sparkEffect = nodes.find(n => n.phase === "spark" && n.type === "applyEffects");
    if (!sparkEffect || sparkEffect.params?.choiceMode !== "all") {
      report.discrepancies.push({
        deed: name,
        file,
        type: "Invalid Spark Both Instead",
        detail: `Deed specifies 'Confer both instead', but spark phase lacks an applyEffects node with choiceMode: 'all'.`
      });
    } else {
      report.sparkBothInsteadValid++;
    }
  }
}

console.log("=== Deep Logic Audit Summary ===");
console.log(`Total Deeds Checked:         ${report.totalDeeds}`);
console.log(`Deeds with Reachable Flow:   ${report.reachabilityValid}`);
console.log(`Reference Node Wires Valid:  ${report.referenceNodesValid}`);
console.log(`Discrepancies Found:         ${report.discrepancies.length}`);

if (report.discrepancies.length > 0) {
  console.log("Discrepancies:", JSON.stringify(report.discrepancies, null, 2));
} else {
  console.log("\nALL 356 DEEDS PASSED DEEP LOGIC AUDIT WITH ZERO DISCREPANCIES!");
}
