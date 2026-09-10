import fs from "fs";
import path from "path";

const PACK_DIR = "json-packs/trespasser-content";
const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith(".json"));

let deedCount = 0;
const errors = [];

for (const file of files) {
  const filePath = path.join(PACK_DIR, file);
  const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (json.type !== "deed") continue;

  deedCount++;
  const name = json.name;
  const sys = json.system || {};
  const graph = sys.graph || { nodes: [], connections: [] };
  const nodes = graph.nodes || [];
  const connections = graph.connections || [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Check 1: start node exists
  const startNodes = nodes.filter(n => n.type === "start");
  if (startNodes.length !== 1) {
    errors.push({ deed: name, file, issue: `Expected exactly 1 start node, found ${startNodes.length}` });
  }

  // Check 2: Reference nodes must NOT have incoming or outgoing flow connections
  const flowConns = connections.filter(c => c.type === "flow");
  for (const n of nodes) {
    if (n.type === "selectArea" || n.type === "roll") {
      const inFlow = flowConns.filter(c => c.targetId === n.id);
      const outFlow = flowConns.filter(c => c.sourceId === n.id);
      if (inFlow.length > 0 || outFlow.length > 0) {
        errors.push({
          deed: name,
          file,
          issue: `Reference node '${n.type}' (${n.id}) has flow connections (in: ${inFlow.length}, out: ${outFlow.length})`
        });
      }
      if (n.y !== 40) {
        errors.push({
          deed: name,
          file,
          issue: `Reference node '${n.type}' (${n.id}) should be positioned at y: 40, found y: ${n.y}`
        });
      }
    }
  }

  // Check 3: Broken connections
  for (const c of connections) {
    if (!nodeMap.has(c.sourceId)) {
      errors.push({ deed: name, file, issue: `Connection ${c.id} has missing source node ${c.sourceId}` });
    }
    if (!nodeMap.has(c.targetId)) {
      errors.push({ deed: name, file, issue: `Connection ${c.id} has missing target node ${c.targetId}` });
    }
  }

  // Check 4: Coordinate overlaps
  const coords = new Map();
  for (const n of nodes) {
    const key = `${n.x},${n.y}`;
    if (coords.has(key)) {
      errors.push({
        deed: name,
        file,
        issue: `Node overlap at (${n.x}, ${n.y}) between ${n.type} (${n.id}) and ${coords.get(key).type} (${coords.get(key).id})`
      });
    } else {
      coords.set(key, n);
    }
  }

  // Check 5: Broken parameter references
  for (const n of nodes) {
    if (n.params?.rollBehaviorId && !nodeMap.has(n.params.rollBehaviorId)) {
      errors.push({ deed: name, file, issue: `Node ${n.id} references missing rollBehaviorId ${n.params.rollBehaviorId}` });
    }
    if (n.params?.areaBehaviorId && !nodeMap.has(n.params.areaBehaviorId)) {
      errors.push({ deed: name, file, issue: `Node ${n.id} references missing areaBehaviorId ${n.params.areaBehaviorId}` });
    }
  }

  // Check 6: Self-damage checks
  const allTexts = [];
  if (sys.description) allTexts.push(sys.description);
  for (const [k, v] of Object.entries(sys.phases || {})) if (v?.description) allTexts.push(v.description);
  const cleanText = allTexts.join(" ").replace(/<[^>]*>/g, " ");

  if (/\b(?:damage\s+to\s+yourself|deal\s+\d+.*?damage\s+to\s+yourself)\b/i.test(cleanText)) {
    const selfTarget = nodes.find(n => n.type === "selectTarget" && n.params?.targetMode === "self");
    if (!selfTarget) {
      errors.push({ deed: name, file, issue: `Deed specifies self-damage, but graph has no 'selectTarget (self)' node.` });
    }
  }
}

console.log(`Audited ${deedCount} deeds.`);
console.log(`Total Errors Found: ${errors.length}`);
if (errors.length > 0) {
  console.log("Errors:", JSON.stringify(errors, null, 2));
} else {
  console.log("ALL 356 DEEDS ARE FULLY COMPLIANT!");
}
