import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { buildServer } from "./server.js";

type Env = { AUTH_TOKEN: string; HEVY_API_KEY: string };

/** Constant-time-ish token check: compare SHA-256 digests, not raw strings. */
async function tokenMatches(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

app.post("/mcp", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!c.env.AUTH_TOKEN || !token || !(await tokenMatches(token, c.env.AUTH_TOKEN))) {
    return c.json({ error: "unauthorized: send Authorization: Bearer <AUTH_TOKEN>" }, 401);
  }
  const server = buildServer(
    c.env.HEVY_API_KEY,
    "This self-hosted server's HEVY_API_KEY secret needs updating (wrangler secret put HEVY_API_KEY).",
  );
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  // Stateless per-request server; the transport aborts its stream when the
  // response completes and nothing else holds resources — no explicit close.
  return transport.handleRequest(c);
});

app.on(["GET", "DELETE"], "/mcp", (c) => {
  c.header("Allow", "POST");
  return c.json({ error: "method not allowed: stateless server, POST only" }, 405);
});

export default app;
