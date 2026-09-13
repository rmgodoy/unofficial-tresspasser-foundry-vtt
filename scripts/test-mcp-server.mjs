/**
 * scripts/test-mcp-server.mjs
 * Automated test runner for the Trespasser MCP Server over stdio.
 *
 * Usage: node scripts/test-mcp-server.mjs
 */
import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, "mcp/server.mjs");

console.log(`[TEST] Starting MCP server test: ${SERVER_PATH}`);

const serverProcess = spawn("node", [SERVER_PATH], {
  stdio: ["pipe", "pipe", "inherit"]
});

const rl = readline.createInterface({
  input: serverProcess.stdout,
  terminal: false
});

let currentId = 1;
const pendingRequests = new Map();

function sendRequest(method, params = {}) {
  const id = currentId++;
  const message = {
    jsonrpc: "2.0",
    id,
    method,
    params
  };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, method });
    serverProcess.stdin.write(JSON.stringify(message) + "\n");
  });
}

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const response = JSON.parse(trimmed);
    if (response.id && pendingRequests.has(response.id)) {
      const { resolve, reject } = pendingRequests.get(response.id);
      pendingRequests.delete(response.id);

      if (response.error) {
        reject(new Error(`JSON-RPC Error [${response.error.code}]: ${response.error.message}`));
      } else {
        resolve(response.result);
      }
    }
  } catch (err) {
    console.error("[TEST] Error parsing server response line:", err.message);
  }
});

async function runTests() {
  try {
    // 1. Initialize Handshake
    console.log("\n[TEST 1] Testing 'initialize'...");
    const initResult = await sendRequest("initialize");
    console.log("-> Init Protocol Version:", initResult.protocolVersion);
    console.log("-> Server Name:", initResult.serverInfo?.name);
    if (initResult.serverInfo?.name !== "trespasser-mcp") {
      throw new Error("Server name mismatch in initialize.");
    }

    // 2. Tools List
    console.log("\n[TEST 2] Testing 'tools/list'...");
    const toolsResult = await sendRequest("tools/list");
    const toolNames = (toolsResult.tools || []).map(t => t.name);
    console.log("-> Available Tools:", toolNames.join(", "));
    const requiredTools = ["search_compendium", "get_item_details", "create_effect", "create_terrain", "create_deed", "validate_deed_graph"];
    for (const req of requiredTools) {
      if (!toolNames.includes(req)) {
        throw new Error(`Missing expected tool: ${req}`);
      }
    }

    // 3. Search Compendium
    console.log("\n[TEST 3] Testing 'search_compendium' (query: 'Burning', type: 'effect')...");
    const searchRes = await sendRequest("tools/call", {
      name: "search_compendium",
      arguments: { query: "Burning", type: "effect", limit: 5 }
    });
    const parsedSearch = JSON.parse(searchRes.content[0].text);
    console.log(`-> Found ${parsedSearch.count} item(s). First match:`, parsedSearch.results?.[0]?.name, `(${parsedSearch.results?.[0]?.uuid})`);
    if (!parsedSearch.results?.some(r => r.name.toLowerCase().includes("burning"))) {
      throw new Error("Expected to find Burning effect in compendium search.");
    }
    const burningUuid = parsedSearch.results[0].uuid;

    // 4. Create Effect
    console.log("\n[TEST 4] Testing 'create_effect'...");
    const effectRes = await sendRequest("tools/call", {
      name: "create_effect",
      arguments: {
        name: "Test Frostbite",
        description: "<p>Target is frozen to the core.</p>",
        targetAttribute: "speed",
        modifier: "-2",
        when: "continuous",
        duration: "combat",
        isPrevailable: true,
        saveToPack: false
      }
    });
    const parsedEffect = JSON.parse(effectRes.content[0].text);
    console.log("-> Created Effect UUID:", parsedEffect.uuid);
    if (!parsedEffect.uuid || parsedEffect.name !== "Test Frostbite") {
      throw new Error("create_effect output validation failed.");
    }
    if (parsedEffect.item.system.isCombat !== true) {
      throw new Error("create_effect failed: isCombat should default to true.");
    }

    // 4b. Create Reminder Only Effect (modifier = 0)
    console.log("-> Testing reminder-only auto-detection (modifier: '0')...");
    const reminderRes = await sendRequest("tools/call", {
      name: "create_effect",
      arguments: {
        name: "Test Narrative Reminder",
        modifier: "0",
        when: "start-of-turn",
        saveToPack: false
      }
    });
    const parsedReminder = JSON.parse(reminderRes.content[0].text);
    if (parsedReminder.item.system.isOnlyReminder !== true) {
      throw new Error("create_effect failed: isOnlyReminder should default to true when modifier is 0.");
    }
    if (parsedReminder.item.system.isCombat !== true) {
      throw new Error("create_effect failed: isCombat should default to true.");
    }

    // 5. Create Terrain
    console.log("\n[TEST 5] Testing 'create_terrain'...");
    const terrainRes = await sendRequest("tools/call", {
      name: "create_terrain",
      arguments: {
        name: "Test Glacial Sheet",
        category: "difficult_terrain",
        width: 3,
        height: 3,
        extraMovementCost: 1,
        slippery: true,
        behaviors: [
          {
            trigger: "onEnter",
            action: "damage",
            damageFormula: "<sd>",
            onlyOnFirstEntry: true
          }
        ],
        saveToPack: false
      }
    });
    const parsedTerrain = JSON.parse(terrainRes.content[0].text);
    console.log("-> Created Terrain UUID:", parsedTerrain.uuid);
    if (!parsedTerrain.uuid || parsedTerrain.item.system.category !== "difficult_terrain") {
      throw new Error("create_terrain output validation failed.");
    }

    // 6. Create Deed (Declarative compilation & layout)
    console.log("\n[TEST 6] Testing 'create_deed'...");
    const deedRes = await sendRequest("tools/call", {
      name: "create_deed",
      arguments: {
        name: "Test Glacial Avalanche",
        tier: "mighty",
        actionType: "attack",
        abilityType: "spell",
        versus: "Guard",
        focusCost: 3,
        range: 4,
        description: "Bury the area in ice and frostbite enemies.",
        targeting: {
          mode: "aoe",
          aoeType: "blast",
          aoeSize: 2,
          disposition: "enemy"
        },
        phases: {
          base: {
            description: "Cover the ground in a Glacial Sheet and strike enemies with 2 Skill Die damage.",
            actions: [
              {
                type: "applyDamage",
                expression: "2<sd>"
              },
              {
                type: "spawnTerrain",
                terrainUuid: parsedTerrain.uuid,
                terrainName: "Test Glacial Sheet",
                placement: "selected_area"
              }
            ]
          },
          hit: {
            description: "Apply Burning and Frostbite to struck targets.",
            actions: [
              {
                type: "applyEffects",
                effects: [
                  {
                    uuid: burningUuid,
                    name: "Burning",
                    intensity: 2
                  },
                  {
                    name: "Test Frostbite",
                    intensity: 1
                  }
                ]
              }
            ]
          }
        },
        saveToPack: false
      }
    });
    const parsedDeed = JSON.parse(deedRes.content[0].text);
    console.log("-> Created Deed Nodes:", parsedDeed.nodeCount, "Connections:", parsedDeed.connectionCount);
    console.log("-> Automated Validation Summary:", parsedDeed.validation?.summary);
    if (!parsedDeed.validation?.valid) {
      throw new Error(`Generated deed failed validation: ${JSON.stringify(parsedDeed.validation?.errors)}`);
    }

    const applyEffNode = parsedDeed.item.system.graph.nodes.find(n => n.type === "applyEffects");
    for (const eff of applyEffNode.params.effects) {
      console.log(`-> Resolved effect image & uuid for '${eff.name}':`, eff.img, eff.uuid);
      if (!eff.img || !eff.img.trim()) {
        throw new Error(`Effect '${eff.name}' has missing img in applyEffects node.`);
      }
      if (!eff.uuid || !eff.uuid.trim()) {
        throw new Error(`Effect '${eff.name}' has missing uuid in applyEffects node.`);
      }
    }

    // 7. Validate Deed Graph tool explicitly
    console.log("\n[TEST 7] Testing 'validate_deed_graph' explicitly...");
    const validRes = await sendRequest("tools/call", {
      name: "validate_deed_graph",
      arguments: {
        deed: parsedDeed.item
      }
    });
    const parsedVal = JSON.parse(validRes.content[0].text);
    console.log("-> Explicit Validation Valid?", parsedVal.valid, "Errors:", parsedVal.errorCount);
    if (!parsedVal.valid || parsedVal.errorCount > 0) {
      throw new Error("Explicit validate_deed_graph test failed.");
    }

    console.log("\n==========================================");
    console.log("ALL 7 MCP SERVER SUITE TESTS PASSED!");
    console.log("==========================================\n");

  } catch (err) {
    console.error("\n[TEST FAILED]:", err.message);
    process.exitCode = 1;
  } finally {
    serverProcess.kill();
    process.exit(process.exitCode || 0);
  }
}

runTests();
