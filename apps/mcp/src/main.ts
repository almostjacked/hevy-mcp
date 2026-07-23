#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

const apiKey = process.env.HEVY_API_KEY;
if (!apiKey) {
  console.error(
    "hevy-mcp: missing HEVY_API_KEY environment variable.\n" +
      "Get your key at https://hevy.com/settings?developer (Hevy PRO required), then e.g.:\n" +
      '  claude mcp add hevy -e HEVY_API_KEY=<key> -- npx -y @almostjacked/hevy-mcp',
  );
  process.exit(1);
}
const server = buildServer(apiKey, "Check the HEVY_API_KEY environment variable this server was started with.");
await server.connect(new StdioServerTransport());
