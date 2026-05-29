# KazrexMCP — BizNet CRM MCP Server

## What this project is

A Model Context Protocol (MCP) server that connects Codex to the BizNet CRM at `https://cust05.isokonbpm.com`. It allows Codex to read and write CRM data directly via tool calls.

## MCP Server

**Location:** `biznet-mcp-server/`  
**Entry point:** `biznet-mcp-server/dist/index.js`  
**Config:** `.Codex/mcp.json` (project-level, auto-loaded on session start)

### Connection

| Setting | Value |
|---|---|
| Base URL | `https://cust05.isokonbpm.com` |
| Username | `ADMIN` |
| Auth method | Form-based login (cookie session) |

### Rebuild after source changes

```bash
cd biznet-mcp-server && npm run build
```

The compiled output goes to `biznet-mcp-server/dist/`. After rebuilding, restart the Codex session so the MCP server reloads.

---

## Available Tools

### Contacts

| Tool | Description |
|---|---|
| `biznet_list_contacts` | List all contacts (people). Returns ID + Name. |
| `biznet_get_contact` | Get full details for one contact by ID. |
| `biznet_search_contact_by_phone` | Find contacts by phone number (partial match). |
| `biznet_create_contact` | Create a new person contact. |
| `biznet_update_contact` | Update an existing contact. |
| `biznet_list_contact_types` | List valid type values for creating contacts (e.g. "Primary"). |
| `biznet_add_contact_note` | Add a text note to a contact record. |

### Organizations

| Tool | Description |
|---|---|
| `biznet_list_organizations` | List all organizations. Returns ID + Name. |
| `biznet_list_organization_types` | List valid type values for creating organizations. |
| `biznet_create_organization` | Create a new organization. |
| `biznet_update_organization` | Update an existing organization. |
| `biznet_link_objects` | Link two CRM objects (e.g. contact → organization). |

### Cases

| Tool | Description |
|---|---|
| `biznet_list_cases_for_contact` | List all cases for a contact or organization. |
| `biznet_list_case_types` | List available matter/work types. Use ID as `matterName`. |
| `biznet_list_workflows` | List workflows available for a given case type. |
| `biznet_create_case` | Create a new case (3-step: assign matter → create → set permissions). |
| `biznet_get_case_events` | List tasks/events for a case. |

### Object Types (Data Model)

| Tool | Description |
|---|---|
| `biznet_list_object_types` | List all custom object types in the system. |
| `biznet_get_type_fields` | Get field definitions for a specific object type. |
| `biznet_create_object_type` | Create a new custom object type. |
| `biznet_get_base_types` | List available base types to extend when creating a type. |

### Input Forms

| Tool | Description |
|---|---|
| `biznet_list_input_forms` | List all input forms (optionally filter by type). |
| `biznet_get_input_form` | Get full field definitions for a form. |
| `biznet_create_input_form` | Create a new input form. |
| `biznet_add_form_field` | Add a field to an existing form. |

### Users & Lookups

| Tool | Description |
|---|---|
| `biznet_list_users` | List all CRM users (Name + Value/ID). |
| `biznet_get_lookup_list` | Get dropdown values for a category (PrimaryStatus, OrgType, etc.). |
| `biznet_get_departments` | List departments within an organization. |

---

## Project Structure

```
KazrexMCP/
├── .Codex/
│   ├── mcp.json              ← project MCP config (biznet auto-loads here)
│   └── settings.local.json   ← local permissions
├── biznet-mcp-server/
│   ├── src/
│   │   ├── index.ts          ← tool definitions (all MCP tools)
│   │   └── biznet-client.ts  ← HTTP client + login/session management
│   ├── dist/                 ← compiled JS (run: npm run build)
│   └── package.json
├── biznet/                   ← BizNet web app source files (reference)
└── AGENTS.md                 ← this file
```

## Common workflows

**List contacts of type "NewPrimary":**
Use `biznet_list_contact_types` first to confirm the type exists, then `biznet_list_contacts` and filter by type — or use the API endpoint pattern noted in the source.

**Create a case:**
1. `biznet_list_case_types` → pick matterName
2. `biznet_list_workflows` with that matterName → pick workflow
3. `biznet_list_users` → pick manager and user
4. `biznet_create_case` with all values

**If MCP server fails to start:**
```bash
cd biznet-mcp-server && npm run build
```
Then restart Codex session.
