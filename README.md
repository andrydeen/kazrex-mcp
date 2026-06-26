# Kazrex MCP — BizNet CRM for Claude

An [MCP](https://modelcontextprotocol.io) server that gives Claude direct access to the
BizNet / Isokon CRM. Once installed, Claude can read and write CRM data — contacts,
organizations, cases, custom objects, input forms — straight from a normal chat.

It runs **locally on your own machine** as a background process that Claude launches
automatically. There is no server to host and nothing to pay for.

---

## Requirements

- [Node.js](https://nodejs.org) **18 or newer** (`node --version` to check)
- A BizNet CRM username and password
- Claude Code **or** Claude Desktop

---

## Install (one time)

```bash
git clone https://github.com/andrydeen/kazrex-mcp.git
cd kazrex-mcp/biznet-mcp-server
npm install
```

`npm install` automatically compiles the server. When it finishes you'll have a
`dist/index.js` — that's the file Claude will run. You do **not** need to run anything
by hand after this; Claude starts and stops the server for you each session.

> **Updating later:** `git pull` then `npm install` again to rebuild. That's it.

---

## Connect it to Claude

You need the **absolute path** to the built server. From inside `biznet-mcp-server`, run:

```bash
echo "$(pwd)/dist/index.js"
```

Copy that path — you'll paste it below.

### Claude Code

Add the server to your config (`.claude/mcp.json` in a project, or `~/.claude/mcp.json`
globally). Copy the template and fill in your details:

```jsonc
{
  "mcpServers": {
    "biznet": {
      "command": "node",
      "args": ["/paste/the/path/from/above/dist/index.js"],
      "env": {
        "BIZNET_BASE_URL": "https://cust05.isokonbpm.com",
        "BIZNET_USERNAME": "your_username",
        "BIZNET_PASSWORD": "your_password"
      }
    }
  }
}
```

A ready-to-edit copy lives at [`.claude/mcp.json.example`](.claude/mcp.json.example).

### Claude Desktop

Open **Settings → Developer → Edit Config**, then add the same `biznet` block shown
above into the `mcpServers` object. Save and restart Claude Desktop.

---

## Verify it works

Restart Claude, then ask:

> List the first few contacts in the CRM.

If Claude returns a list of names and IDs, you're connected. If the tools don't appear,
see [Troubleshooting](#troubleshooting).

---

## What Claude can do

Roughly 28 tools across these areas (full reference in [`CLAUDE.md`](CLAUDE.md)):

| Area | Examples |
|---|---|
| **Contacts** | list, get details, search by phone, create, update, add notes |
| **Organizations** | list, create, update, link contacts to orgs |
| **Cases** | list for a contact, create cases, list case events/tasks |
| **Data model** | list object types, get/create field definitions, update fields |
| **Input forms** | list, inspect, create forms, add fields |
| **Lookups** | users, departments, dropdown values |

---

## Security notes

- **Your credentials stay on your machine.** They live only in your local Claude config
  (`mcp.json`), which is git-ignored and never committed.
- **Never commit `.claude/mcp.json`** — it contains your password. Only the
  `.example` template is tracked.
- Each person uses **their own** BizNet login so actions are attributable to them.
- The CRM serves an expired TLS certificate, so the server pins its certificate
  fingerprint (see `src/biznet-client.ts`). If BizNet legitimately rotates its cert,
  set `BIZNET_CERT_FINGERPRINT` in the `env` block to the new fingerprint.

---

## Troubleshooting

**Tools don't show up in Claude**
- Confirm the path in `args` is absolute and points at `dist/index.js` (not `src/`).
- Make sure you fully restarted Claude after editing the config.
- Rebuild: `cd biznet-mcp-server && npm run build`.

**"Login failed" / auth errors**
- Double-check `BIZNET_USERNAME` / `BIZNET_PASSWORD`.
- Confirm you can log into `https://cust05.isokonbpm.com` in a browser with the same details.

**TLS / certificate fingerprint mismatch**
- BizNet replaced its certificate. Get the new SHA-256 fingerprint and set
  `BIZNET_CERT_FINGERPRINT` in your config.

---

## Optional: run it as a hosted server

This repo also supports an HTTP/SSE mode (used when a `PORT` env var is set) so it can run
on a host like Railway, Render, or Cloudflare and be shared by URL. That mode requires
`MCP_API_KEY` to be set. Most users don't need this — the local setup above is simpler
and free. See `biznet-mcp-server/railway.json` and `.env.example` if you want to explore it.

## License

MIT — see [LICENSE](LICENSE).
