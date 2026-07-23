import { describe, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHevyClient, registerTools } from "../src/index.js";

const READS = [
  "search_exercises", "list_routine_folders", "list_routines", "get_workouts",
  "get_workout", "get_workout_count", "get_exercise_history", "get_routine",
  "get_training_summary",
];
const WRITES = ["create_routine_folder", "create_routine", "update_routine"];

async function connect(): Promise<Client> {
  const server = new McpServer({ name: "hevy-mcp-test", version: "0.0.0" });
  registerTools(server, createHevyClient("test-key"));
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  return client;
}

describe("core tools contract", () => {
  test("registers all 12 tools with titles and annotations", async () => {
    const { tools } = await (await connect()).listTools();
    // NOTE: the brief's draft test asserted 13, but READS (9) + WRITES (3) = 12,
    // and the source repo (src/index.ts) registers exactly 12 this.server.tool(...)
    // calls — there is no 13th tool. Corrected to the value the source data supports.
    expect(tools.length).toBe(12);
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const name of [...READS, ...WRITES]) expect(byName.has(name)).toBe(true);

    for (const name of READS) {
      const a = byName.get(name)!.annotations!;
      expect(a.title).toBeTruthy();
      expect(a.readOnlyHint).toBe(true);
      expect(a.destructiveHint).toBe(false);
      expect(a.openWorldHint).toBe(true);
    }
    for (const name of WRITES) {
      const a = byName.get(name)!.annotations!;
      expect(a.readOnlyHint).toBe(false);
      expect(a.openWorldHint).toBe(true);
    }
    expect(byName.get("update_routine")!.annotations!.destructiveHint).toBe(true);
    expect(byName.get("create_routine")!.annotations!.destructiveHint).toBe(false);
    expect(byName.get("create_routine_folder")!.annotations!.idempotentHint).toBe(true);
  });

  test("key-invalid hint is parameterized", async () => {
    // registerTools with a custom hint: force a 401 by pointing the client at a
    // stubbed fetch. HevyClient accepts a fetch seam? If not, assert via the
    // exported KEY_INVALID_MESSAGE helper instead (see Step 4 note).
    const { keyInvalidMessage } = await import("../src/tools.js");
    expect(keyInvalidMessage(401, "check HEVY_API_KEY")).toContain("401");
    expect(keyInvalidMessage(401, "check HEVY_API_KEY")).toContain("check HEVY_API_KEY");
  });
});
