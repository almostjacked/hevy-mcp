import { describe, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "./server.js";

describe("stdio server", () => {
  test("buildServer registers the 12 hevy tools", async () => {
    const server = buildServer("test-key", "Check the HEVY_API_KEY environment variable.");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(clientT);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(12);
    expect(tools.some((t) => t.name === "create_routine")).toBe(true);
  });
});
