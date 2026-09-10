import fs from "fs";
import path from "path";
import crypto from "node:crypto";

globalThis.foundry = {
  utils: {
    randomID: (len = 16) => crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len),
    deepClone: (obj) => structuredClone(obj)
  }
};

const { convertOldDeedSystem } = await import("../module/helpers/migration-deed.mjs");
const { migrateToGraph } = await import("../module/helpers/migration-graph.mjs");

function testDeed(fileName) {
  const filePath = path.join("json-packs/trespasser-content", fileName);
  const rawJson = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const rawSystem = rawJson.system;
  const migratedSystem = migrateToGraph(convertOldDeedSystem(rawSystem));

  console.log(`=== Test Deed: ${rawJson.name} (${fileName}) ===`);
  const nodes = migratedSystem.graph.nodes;
  const conns = migratedSystem.graph.connections;
  console.log(`Nodes (${nodes.length}):`);
  for (const n of nodes) {
    console.log(`  - [${n.type}] id:${n.id.slice(0, 6)} phase:${n.phase} pos:(${n.x}, ${n.y}) params:${JSON.stringify(n.params)}`);
  }
  console.log(`Connections (${conns.length}):`);
  for (const c of conns) {
    console.log(`  - ${c.type}: [${c.sourceId.slice(0, 6)}]:${c.sourcePort} -> [${c.targetId.slice(0, 6)}]:${c.targetPort}`);
  }

  // Verification checks
  const flowConns = conns.filter(c => c.type === "flow");
  for (const n of nodes) {
    if (n.type === "selectArea" || n.type === "roll") {
      const inFlow = flowConns.filter(c => c.targetId === n.id);
      const outFlow = flowConns.filter(c => c.sourceId === n.id);
      if (inFlow.length > 0 || outFlow.length > 0) {
        console.error(`  ERROR: ${n.type} has flow connections! in:${inFlow.length}, out:${outFlow.length}`);
      } else {
        console.log(`  SUCCESS: ${n.type} is purely reference (no flow connections).`);
      }
    }
  }
}

testDeed("Blood_Gift_x0cPrlN8LKfonY25.json");
testDeed("Air_Blast_ofQ6ieQibVS23bdL.json");
testDeed("Blinding_Powder_Lk5MJYzWzk4RRArz.json");
testDeed("Leech_6cO6KhYVEC70k3lx.json");
