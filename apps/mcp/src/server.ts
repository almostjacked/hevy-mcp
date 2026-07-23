import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHevyClient, registerTools } from "@almostjacked/hevy-mcp-core";
import { VERSION } from "./version.js";

/** Build a fully-registered server for one Hevy API key (no transport attached). */
export function buildServer(apiKey: string, keyInvalidHint?: string): McpServer {
  const server = new McpServer({ name: "hevy-mcp", version: VERSION });
  registerTools(server, createHevyClient(apiKey), { keyInvalidHint });
  return server;
}
