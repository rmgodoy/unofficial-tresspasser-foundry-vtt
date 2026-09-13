#!/usr/bin/env node
/**
 * scripts/mcp/server.mjs
 * Zero-dependency Model Context Protocol (MCP) stdio server for Trespasser TTRPG.
 *
 * Provides local LLMs (Ollama, Claude Desktop, Cursor, Continue, etc.) with tools to
 * inspect existing items and author valid Deeds, Effects, and Terrains for Foundry V14.
 *
 * Usage: node scripts/mcp/server.mjs
 */
import readline from "node:readline";
import { TOOLS_DEFINITIONS, dispatchToolCall } from "./tools-registry.mjs";

const SERVER_NAME = "trespasser-mcp";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_VERSION = "2024-11-05";

/**
 * Send JSON-RPC response message to stdout.
 * @param {object} message
 */
function sendJsonRpc(message) {
  const json = JSON.stringify(message);
  process.stdout.write(json + "\n");
}

/**
 * Send JSON-RPC success response.
 * @param {string|number} id
 * @param {object} result
 */
function sendResult(id, result) {
  sendJsonRpc({
    jsonrpc: "2.0",
    id,
    result
  });
}

/**
 * Send JSON-RPC error response.
 * @param {string|number} id
 * @param {number} code
 * @param {string} message
 * @param {any} [data]
 */
function sendError(id, code, message, data = undefined) {
  sendJsonRpc({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {})
    }
  });
}

/**
 * Process a single incoming JSON-RPC request.
 * @param {object} request
 */
async function handleRequest(request) {
  if (!request || typeof request !== "object") {
    return sendError(null, -32600, "Invalid Request: expected JSON object.");
  }

  const { id, method, params } = request;

  // Handle notifications (no id)
  if (id === undefined || id === null) {
    if (method === "notifications/initialized") {
      console.error(`[${SERVER_NAME}] Client completed initialization handshake.`);
    }
    return;
  }

  console.error(`[${SERVER_NAME}] Handling method "${method}" (id: ${id})`);

  try {
    switch (method) {
      case "initialize":
        sendResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION
          }
        });
        break;

      case "ping":
        sendResult(id, {});
        break;

      case "tools/list":
        sendResult(id, {
          tools: TOOLS_DEFINITIONS
        });
        break;

      case "tools/call": {
        const { name, arguments: toolArgs } = params || {};
        if (!name) {
          return sendError(id, -32602, "Invalid params: missing tool 'name'.");
        }
        try {
          const toolResult = await dispatchToolCall(name, toolArgs || {});
          sendResult(id, toolResult);
        } catch (err) {
          console.error(`[${SERVER_NAME}] Error executing tool "${name}":`, err.stack || err.message);
          sendResult(id, {
            isError: true,
            content: [
              {
                type: "text",
                text: `Tool execution failed: ${err.message}`
              }
            ]
          });
        }
        break;
      }

      default:
        console.error(`[${SERVER_NAME}] Unknown method: ${method}`);
        sendError(id, -32601, `Method not found: ${method}`);
        break;
    }
  } catch (err) {
    console.error(`[${SERVER_NAME}] Unexpected internal error:`, err);
    sendError(id, -32603, `Internal error: ${err.message}`);
  }
}

/**
 * Main stdio loop.
 */
function main() {
  console.error(`[${SERVER_NAME}] Starting Trespasser MCP server (v${SERVER_VERSION})...`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const request = JSON.parse(trimmed);
      handleRequest(request);
    } catch (err) {
      console.error(`[${SERVER_NAME}] Failed to parse incoming JSON line:`, err.message);
      sendError(null, -32700, "Parse error: received invalid JSON.");
    }
  });

  rl.on("close", () => {
    console.error(`[${SERVER_NAME}] Stdio stream closed. Exiting server.`);
    process.exit(0);
  });
}

main();
