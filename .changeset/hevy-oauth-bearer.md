---
"@almostjacked/hevy-mcp-core": minor
---

HevyClient now accepts Hevy OAuth access tokens (`{ accessToken, onUnauthorized? }`), sent as `Authorization: Bearer`, alongside the existing API key (bare string or `{ apiKey }`). An OAuth 401 triggers one refresh-and-retry. Auth-failure tool errors no longer mention API keys for OAuth connections.
