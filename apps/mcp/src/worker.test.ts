import { describe, expect, test } from "vitest";
import app from "./worker.js";

const env = { AUTH_TOKEN: "sekret", HEVY_API_KEY: "hevy-key" };
const initBody = JSON.stringify({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
});
const post = (headers: Record<string, string>) =>
  app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: initBody,
  }, env);

describe("token-HTTP worker", () => {
  test("health", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  test("401 without token", async () => {
    expect((await post({})).status).toBe(401);
  });
  test("401 with wrong token", async () => {
    expect((await post({ authorization: "Bearer nope" })).status).toBe(401);
  });
  test("200 initialize with token", async () => {
    const res = await post({ authorization: "Bearer sekret" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hevy-mcp");
  });
  test("405 GET/DELETE", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await app.request("/mcp", { method, headers: { authorization: "Bearer sekret" } }, env);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });
});
