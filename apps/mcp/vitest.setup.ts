// The remote worker targets the Cloudflare Workers runtime, which guarantees a
// global Web Crypto (as do Node >= 19 and browsers). Node 18 only exposes it at
// node:crypto.webcrypto, so provide the standard global when running tests there.
if (typeof globalThis.crypto === "undefined") {
  const { webcrypto } = await import("node:crypto");
  globalThis.crypto = webcrypto as Crypto;
}
