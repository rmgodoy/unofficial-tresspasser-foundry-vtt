/**
 * scripts/mcp/tools-registry.mjs
 * MCP Tool definitions, JSON schemas, and dispatcher for the Trespasser MCP server.
 */
import { handleSearchCompendium, handleGetItemDetails } from "./handlers/compendium-search.mjs";
import { handleCreateEffect, VALID_TARGET_ATTRIBUTES, VALID_TRIGGERS } from "./handlers/effect-builder.mjs";
import { handleCreateTerrain, VALID_TERRAIN_CATEGORIES } from "./handlers/terrain-builder.mjs";
import { handleCreateDeed } from "./handlers/deed-builder.mjs";
import { handleValidateDeedGraph } from "./handlers/deed-validator.mjs";

export const TOOLS_DEFINITIONS = [
  {
    name: "search_compendium",
    description: "Search existing Trespasser items (effects, terrains, deeds, weapons, armor) in the compendium. Use this first before creating an effect to avoid creating duplicates and to find canonical UUIDs like Burning, Bleeding, etc.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text search query to match against item names, IDs, or descriptions."
        },
        type: {
          type: "string",
          description: "Optional filter by item type: 'effect', 'terrain', 'deed', 'weapon', 'armor', etc.",
          enum: ["effect", "terrain", "deed", "weapon", "armor", "accessory", "feature", "talent"]
        },
        limit: {
          type: "number",
          description: "Max number of items to return (default: 15, max: 50)."
        }
      }
    }
  },
  {
    name: "get_item_details",
    description: "Fetch full item data from the compendium given an ID, UUID, or exact Name.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Item 16-character alphanumeric _id."
        },
        uuid: {
          type: "string",
          description: "Item UUID (e.g. Compendium.trespasser.trespasser-content.Item.xxx or Item.xxx)."
        },
        name: {
          type: "string",
          description: "Exact item name."
        }
      }
    }
  },
  {
    name: "create_effect",
    description: "Create a valid Trespasser Effect item document for Foundry V14. Returns the generated UUID to link in deeds and terrains.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Name of the effect (e.g. 'Molten Armor', 'Terrified')." },
        description: { type: "string", description: "HTML/text description of what the effect does." },
        type: {
          type: "string",
          enum: ["continuous", "on-trigger", "movement"],
          description: "Effect lifecycle type (default: 'continuous')."
        },
        targetAttribute: {
          type: "string",
          enum: VALID_TARGET_ATTRIBUTES,
          description: "The actor attribute this effect modifies (e.g. 'health', 'guard', 'resist', 'speed', 'accuracy', 'focus', 'action_points')."
        },
        modifier: {
          type: "string",
          description: "Modifier expression applied to targetAttribute (e.g. '+<Int>', '-2', '+1d6', '0')."
        },
        when: {
          type: "string",
          enum: VALID_TRIGGERS,
          description: "When the effect triggers (e.g. 'immediate', 'continuous', 'start-of-turn', 'end-of-turn', 'damage-dealt', 'damage-received')."
        },
        duration: {
          type: "string",
          enum: ["indefinite", "combat", "round", "trigger"],
          description: "Duration mode (default: 'indefinite')."
        },
        durationValue: { type: "number", description: "Numeric duration value if duration is round/trigger." },
        intensity: { type: "number", description: "Base intensity level (default: 0)." },
        intensityIncrement: { type: "number", description: "Intensity change per round or trigger." },
        isCombat: {
          type: "boolean",
          description: "Whether this effect is active and evaluated in combat. Defaults to true (all effects conferred by deeds are combat effects)."
        },
        isOnlyReminder: {
          type: "boolean",
          description: "Whether this effect has no automated stat modification and should display its description in chat when triggered as a reminder. Defaults to true when modifier is '0' or empty."
        },
        isPrevailable: { type: "boolean", description: "Whether the target can make a Prevail test to clear the effect (default: true)." },
        isLasting: { type: "boolean", description: "Whether the effect persists across scenes/rests (default: false)." },
        statusIcon: { type: "string", description: "Icon image path for token HUD status effect." },
        saveToPack: { type: "boolean", description: "If true, saves directly to json-packs/trespasser-content (default: false)." }
      }
    }
  },
  {
    name: "create_terrain",
    description: "Create a valid Trespasser Terrain item document for Foundry V14. IMPORTANT: linkedEffects are granted to the CASTER automatically upon terrain placement (tracking duration/intensity). In-zone behaviors.effects are applied automatically to CREATURES in the zone. Never conflate the two.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Name of the terrain (e.g. 'Wall of Magma', 'Freezing Fog')." },
        category: {
          type: "string",
          enum: VALID_TERRAIN_CATEGORIES,
          description: "Terrain category: 'difficult_terrain', 'obstacle', 'wall', 'field', 'light_cloud', 'heavy_cloud'."
        },
        width: { type: "number", description: "Grid width in squares (default: 1)." },
        height: { type: "number", description: "Grid height in squares (default: 1)." },
        terrainDamage: { type: "number", description: "Flat terrain damage on contact." },
        extraMovementCost: { type: "number", description: "Additional movement cost to enter/exit." },
        slippery: { type: "boolean", description: "Whether tokens slip or slide on moving through." },
        destructible: { type: "boolean", description: "Whether the terrain can be attacked/destroyed (default: true)." },
        behaviors: {
          type: "array",
          description: "List of automated behaviors for this terrain zone.",
          items: {
            type: "object",
            required: ["trigger", "action"],
            properties: {
              trigger: {
                type: "string",
                enum: ["onEnter", "onExit", "onMove", "onStartTurn", "onCreation", "whileInside"]
              },
              action: {
                type: "string",
                enum: ["damage", "applyEffect", "forcedMovement", "script"]
              },
              damageFormula: { type: "string", description: "Formula e.g. '<sd>', '2<sd>', '<Int>', '2d6'." },
              effects: {
                type: "array",
                description: "Effects applied automatically by the terrain region to CREATURES entering or inside the zone (e.g. 'whileInside', 'onEnter'). Evaluates dynamic '<Int>' from the caster's linked effect. Never apply these via a deed 'applyEffects' node to avoid doubling the effect on targets.",
                items: {
                  type: "object",
                  properties: {
                    uuid: { type: "string" },
                    name: { type: "string" },
                    img: { type: "string" },
                    intensity: { type: "string" }
                  }
                }
              },
              forcedMovementType: { type: "string", enum: ["push", "pull", "sweep", "shove", "drag"] },
              forcedMovementDistance: { type: "string", description: "Squares or formula (e.g. '2', '<Int>')." },
              onlyOnFirstEntry: { type: "boolean", description: "Whether behavior only triggers once per turn (default: true)." }
            }
          }
        },
        linkedEffects: {
          type: "array",
          description: "Controlling/sustaining effects on the CASTER that govern this terrain's existence and dynamic <Int> scaling. Automatically granted to the caster upon terrain placement. When prevailed/cleared, the terrain auto-deletes. Do NOT put effects applied to creatures inside here.",
          items: {
            type: "object",
            properties: {
              uuid: { type: "string" },
              name: { type: "string" },
              img: { type: "string" },
              intensity: { type: "string" }
            }
          }
        },
        saveToPack: { type: "boolean", description: "If true, saves directly to json-packs/trespasser-content (default: false)." }
      }
    }
  },
  {
    name: "create_deed",
    description: "Compile and build a complete Behavior-Driven Deed for Trespasser in Foundry V14. Automatically generates visual graph layout coordinates (x, y) and wires condition ports. CRITICAL: When using 'spawnTerrain', do NOT add redundant 'applyEffects' nodes for the terrain's linked effect (granted automatically to caster) or in-zone effects (granted automatically to creatures in zone by the terrain region).",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Name of the deed (e.g. 'Pyroclastic Surge')." },
        tier: {
          type: "string",
          enum: ["light", "heavy", "mighty", "special"],
          description: "Deed tier (default: 'light')."
        },
        actionType: {
          type: "string",
          enum: ["attack", "support"],
          description: "Action type: 'attack' requires accuracy roll, 'support' does not (default: 'attack')."
        },
        abilityType: {
          type: "string",
          enum: ["innate", "melee", "missile", "spell", "tool", "unarmed", "versatile"],
          description: "Ability type determines weapons and range requirements (default: 'versatile')."
        },
        versus: {
          type: "string",
          enum: ["Guard", "Resist", "10"],
          description: "Target defense tested on accuracy (default: 'Guard')."
        },
        focusCost: { type: "number", description: "Focus cost to execute (null for none)." },
        bonusCost: { type: "number", description: "Bonus AP or resource cost." },
        range: { type: "number", description: "Range in grid squares (null for weapon/implement default)." },
        description: { type: "string", description: "Flavor/rules summary of the deed." },
        targeting: {
          type: "object",
          description: "Targeting parameters.",
          properties: {
            mode: { type: "string", enum: ["creatures", "self", "aoe"], description: "Targeting mode." },
            count: { type: "number", description: "Number of targets if mode is creatures (default: 1)." },
            aoeType: {
              type: "string",
              enum: ["blast", "close_blast", "burst", "melee_burst", "path", "close_path", "aura"],
              description: "Area of effect shape if mode is aoe."
            },
            aoeSize: { type: "number", description: "Size of area in squares (e.g. 2 for Blast 2)." },
            disposition: {
              type: "string",
              enum: ["any", "enemy", "ally", "friendly", "hostile"],
              description: "Filter targets by disposition."
            },
            ignoreSelf: { type: "boolean", description: "Whether caster ignores themselves in area (default: true)." }
          }
        },
        phases: {
          type: "object",
          description: "Deed actions grouped by phase.",
          properties: {
            base: {
              type: "object",
              properties: {
                description: { type: "string" },
                actions: { type: "array", description: "Actions executed before accuracy (e.g. damage, terrain spawn)." }
              }
            },
            hit: {
              type: "object",
              properties: {
                description: { type: "string" },
                actions: { type: "array", description: "Actions executed on hit (e.g. applyEffects, damage)." }
              }
            },
            spark: {
              type: "object",
              properties: {
                description: { type: "string" },
                actions: { type: "array", description: "Actions executed on spark." }
              }
            },
            miss: {
              type: "object",
              properties: {
                description: { type: "string" },
                actions: { type: "array", description: "Actions executed on miss." }
              }
            }
          }
        },
        graph: {
          type: "object",
          description: "Advanced optional: Provide raw nodes and connections instead of declarative phases."
        },
        saveToPack: { type: "boolean", description: "If true, saves directly to json-packs/trespasser-content (default: false)." }
      }
    }
  },
  {
    name: "validate_deed_graph",
    description: "Audit and validate a Deed Behavior Graph against Trespasser system rules, port configurations, and layout integrity heuristics.",
    inputSchema: {
      type: "object",
      properties: {
        deed: {
          type: "object",
          description: "Complete Deed item document or deed.system object to audit."
        }
      }
    }
  }
];

/**
 * Dispatch an MCP tool call by name.
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<object>} Result object formatted for MCP content
 */
export async function dispatchToolCall(toolName, args = {}) {
  let result;
  switch (toolName) {
    case "search_compendium":
      result = await handleSearchCompendium(args);
      break;
    case "get_item_details":
      result = await handleGetItemDetails(args);
      break;
    case "create_effect":
      result = await handleCreateEffect(args);
      break;
    case "create_terrain":
      result = await handleCreateTerrain(args);
      break;
    case "create_deed":
      result = await handleCreateDeed(args);
      break;
    case "validate_deed_graph":
      result = handleValidateDeedGraph(args.deed || args);
      break;
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}
