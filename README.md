# Toast MCP — talk to your restaurant's POS

Connect Claude (or any MCP client) to your Toast POS. Ask your restaurant questions in plain English — from your laptop, your phone, anywhere:

> *"What were my net sales last night?"*
> *"Who's clocked in right now?"*
> *"Compare this Saturday to last Saturday, hour by hour."*

**55 read-only tools** covering orders, sales, labor, employees, time entries, menus, inventory, customers, and cash — live-tested against real production restaurants.

A **PrimeCost** project — built and maintained by **Chris Cusack**, restaurant owner and writer of [All Day](https://chriscusack.net), a newsletter about running restaurants with AI. First in a series: working MCP connections for every major restaurant POS.

> 🎥 **Not a developer?** There's a full step-by-step walkthrough — with screenshots for every Toast screen, the exact Railway clicks, and the phone demo — at **[chriscusack.net](https://chriscusack.net)**. This README is the condensed version for people comfortable with a terminal.

---

## What you need

1. **Toast standard API access.** This is the slow part. Toast doesn't self-serve API keys — you request "standard API access" through your Toast rep or a Customer Care ticket ("I want standard API access for my own restaurant group, for internal reporting"). Approval typically takes days to weeks. When approved, you get a **client ID** and **client secret** in Toast Web (search "API access" → Manage credentials). Save the secret immediately — Toast shows it once.
2. **Your restaurant GUID.** Toast Web sets a cookie named `lastRestaurantGuid` when you're logged in, or check your API access welcome materials. (The walkthrough covers three ways to find it.)
3. **A place to run the server** — Railway (easiest, ~$5/mo), or any host that runs Node 18+.
4. **A Claude plan that supports custom connectors** (Pro/Max/Team) — or any other MCP client.

## Deploy on Railway (10 minutes)

1. Fork/clone this repo → Railway → **New Project → Deploy from GitHub repo**
2. Set the deploy **branch** to the default branch of this repo
3. Add these variables:

| Variable | Value |
|---|---|
| `TOAST_MCP_MODE` | `http` |
| `TOAST_MCP_SECRET` | a long random string you generate — this is your connector password |
| `TOAST_CLIENT_ID` | from Toast Web |
| `TOAST_CLIENT_SECRET` | from Toast Web |
| `TOAST_RESTAURANT_GUID` | your location's GUID |
| `TOAST_ENVIRONMENT` | `production` |

Generate a good secret:

```bash
node -e "console.log(require('crypto').randomUUID().replace(/-/g,'')+require('crypto').randomUUID().replace(/-/g,''))"
```

4. **Settings → Networking → Generate Domain**, then confirm `https://<your-domain>/health` returns `{"status":"ok"}`

## Connect Claude

claude.ai → **Settings → Connectors → Add custom connector**:

- Name: `Toast`
- URL: `https://<your-domain>/<your-secret>/mcp`

That's it. The connector now works in Claude chat, mobile, Cowork, and Claude Code.

## Run locally instead (Claude Code / Claude Desktop)

```json
{
  "mcpServers": {
    "toast": {
      "command": "node",
      "args": ["/path/to/repo/dist/main.js"],
      "env": {
        "TOAST_CLIENT_ID": "...",
        "TOAST_CLIENT_SECRET": "...",
        "TOAST_RESTAURANT_GUID": "...",
        "TOAST_ENVIRONMENT": "production"
      }
    }
  }
}
```

Build first with `npm install && npm run build`. Stdio mode needs no secret.

## Security posture (read this)

- **Read-only by default.** The 21 tools that could modify a POS (create orders, refund payments, void checks, edit employees, adjust stock) are **disabled** unless you set `TOAST_ENABLE_WRITE_TOOLS=true`. They are untested against live Toast. Leave them off.
- **Your secret is the only lock on your sales data.** Treat the connector URL like a password. Never screenshot it, never post it. If it leaks, rotate `TOAST_MCP_SECRET` in Railway (takes 2 minutes) and update your connector URL.
- **Your credentials never leave your infrastructure.** This server talks to exactly one external host: Toast's API (`ws-api.toasttab.com`). No telemetry, no analytics, no third parties. Read the source — it's small.
- Multi-location groups: deploy one service per location (or omit `TOAST_RESTAURANT_GUID` and pass `restaurantGuid` per call where tools support it).

## Provenance

This began as [BusyBee3333/toast-mcp-2026-complete](https://github.com/BusyBee3333/toast-mcp-2026-complete) (MIT). The original had never been run against live Toast and could not work (see [issue #1](https://github.com/BusyBee3333/toast-mcp-2026-complete/issues/1)); this version fixes authentication, endpoints, and the labor report, adds the remote HTTP transport with secret auth, disables write tools by default, and is verified daily against production restaurants. MIT license preserved.

## Who made this

**Chris Cusack** — restaurant owner and operator (Houston, two locations) writing about restaurants + AI at **[chriscusack.net](https://chriscusack.net)**. If this saved you time, that's where the rest of the playbook lives: labor auditing with AI, review management, the full stack. If you want it set up for you, or want this for a POS that doesn't have one yet — reach out.

---
*Not affiliated with or endorsed by Toast, Inc. Toast is a trademark of its owner. Use your own credentials; you are responsible for your own API terms compliance.*
