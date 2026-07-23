# hevy-mcp

[![CI](https://github.com/almostjacked/hevy-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/almostjacked/hevy-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40almostjacked%2Fhevy-mcp)](https://www.npmjs.com/package/@almostjacked/hevy-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.almostjacked%2Fhevy--mcp-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=almostjacked)

Unofficial MCP server for [Hevy](https://hevy.com). Design training programs in
chat; your AI creates the routines directly in your Hevy account and analyzes
your logged training. Requires a Hevy PRO API key (hevy.com/settings?developer).

## Use it

### Hosted (easiest — claude.ai web, mobile, desktop)
Add a custom connector in claude.ai → Settings → Connectors:

    https://hevy-coach.ajwallacemusic.workers.dev/mcp

You'll be prompted for your Hevy API key; it's stored encrypted in your own
OAuth grant and sent only to api.hevyapp.com.

### Claude Desktop one-click
Download [`hevy-mcp.mcpb`](https://github.com/almostjacked/hevy-mcp/releases),
double-click, paste your key when prompted.

### Local (Claude Code / Cursor / any stdio client)
    claude mcp add hevy -e HEVY_API_KEY=<key> -- npx -y @almostjacked/hevy-mcp

### Self-host (free, your own infra, works on mobile)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/almostjacked/hevy-mcp)
Then: `npx wrangler secret put AUTH_TOKEN` and `npx wrangler secret put HEVY_API_KEY`,
and add YOUR worker URL as a connector with header `Authorization: Bearer <AUTH_TOKEN>`.

This works out of the box with clients that support custom headers (Claude
Code: `claude mcp add --transport http hevy-selfhost <url> --header
"Authorization: Bearer <token>"`, Cursor, etc.). claude.ai web/mobile custom
connectors do not reliably support sending a custom auth header today — for
those, front your worker with Cloudflare Access instead, or just use the
hosted instance above.

## Tools

| Tool | Description |
|------|-------------|
| search_exercises | Search the user's Hevy exercise library by name (fuzzy). Returns template id, exact title, type, muscle group and equipment. |
| list_routine_folders | List the user's routine folders (id + title). Check this before creating a folder — reuse an existing one when the name matches. |
| create_routine_folder | Create a routine folder, or return the existing folder if one with this exact title already exists (never duplicates). |
| list_routines | List the user's existing routines (id, title, folder_id, exercise_count). Use to avoid creating duplicates. |
| create_routine | create a routine (lb-first: weight_lb snaps to 2.5/5 lb increments; RPE folded into notes; supersets; duration/distance targets supported) |
| get_workouts | Get the user's most recent logged workouts, newest first, as compact summaries: title, date, duration, and per-exercise set count + top set. Use get_workout for full set-by-set detail of one workout. |
| get_workout | Get one logged workout with every set (weights in kg). Use the id from get_workouts. |
| get_workout_count | Total number of workouts the user has ever logged in Hevy. |
| get_exercise_history | past sets + estimated 1RM in lb for one exercise (full history, optional date range) |
| get_routine | Get one routine in full (all exercises and sets). Always call this before update_routine so you can send back the complete routine. |
| update_routine | Replace an existing routine. WARNING: this overwrites the routine — Hevy replaces its exercises with exactly what you send, so first call get_routine and include every exercise you want to keep. Folder cannot be changed here; duration/distance/custom-metric set targets round-trip safely. |
| get_training_summary | weekly sessions/volume (lb), sets per muscle group, top-lift 1RM trend |

## Privacy Policy
Your Hevy API key and training data pass through only to api.hevyapp.com.
The stdio/.mcpb versions run entirely on your machine. The hosted instance
stores nothing but your encrypted OAuth grant; disconnecting revokes it.
Nothing is logged or shared with third parties.
