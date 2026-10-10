# 🗺️ Agent Atlas

**A visual state map for AI agents — see what your agent remembers, tried, decided, and plans next.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## The Problem

When you work with AI coding agents (Claude Code, Cursor, Codex, pi, Aider) on long tasks, you hit the same wall:

> **You don't know what your agent knows.**

- 🧠 What has it already remembered?
- 🧭 Which approaches has it already tried?
- ❌ Which paths already failed — and why?
- ✅ What decisions has it already made?
- ⛔ What's currently blocking progress?
- ➡️ What should it work on next?

Right now, the only way to find out is to **keep asking the agent**. That's slow, unreliable, and frustrating. The agent might:
- Retry a path that already failed
- Forget a constraint you told it
- Go in circles without realizing it
- Miss a blocker you already identified

**Agent Atlas fixes this** by giving you a live, visual map of your agent's working state.

---

## What It Does

Agent Atlas provides a **visual exploration map** for AI agents:

```
🎯 Build CatDesk provider
├── 🧭 Friday provider route
│   └── ❌ 429 rate limit → abandoned
├── 🧭 CatDesk Gateway route
│   ├── ✅ Text streaming works
│   ├── ✅ Tool calls work
│   └── ✅ Cancellation works
├── 🧭 Image support
│   ├── 🔧 Tried inline base64 → failed
│   ├── 🔧 Tried S3 upload → failed
│   └── ☠️ Dead end: don't retry without new evidence
└── ✅ Decision: provider is text-only for now
```

Instead of guessing, you **see** your agent's brain at a glance.

---

## Key Features

### 📊 Visual Task Map
Tree + topology graph showing goals, explored paths, attempts, decisions, blockers, and dead ends. Color-coded by status. Interactive — click to inspect, edit, or redirect.

### 🧠 Memory Visibility
Reads your agent's existing memory (pi MEMORY.md, mem0, CLAUDE.md, etc.) and displays it alongside exploration state. **No data duplication** — reads from authoritative sources, edits write back.

### ☠️ Dead End Tracking
Mark paths as dead ends so your agent doesn't retry failed approaches. Dead ends are included in context packs to prevent going in circles.

### 📦 Context Packs
Get a structured summary of what's relevant for the current turn: active goal, relevant memories, decisions, dead ends, blockers, and next steps. Your agent reads this at the start of each turn instead of guessing.

### ➡️ Direction Control
See and choose what your agent should work on next. No more endless "what should we do?" loops.

### 🔌 MCP Integration
Works with any MCP-compatible agent: Claude Code, Cursor, Codex, pi, Aider, and more. Your agent writes to Atlas via MCP tools; you read and edit via the web UI.

---

## How It Works

```
Agent (Claude Code / pi / Codex / Cursor)
  │
  │  Agent uses MCP tools to record its exploration state:
  │  - atlas_create_node (goal, path, attempt, decision, blocker, dead_end)
  │  - atlas_mark_dead_end
  │  - atlas_get_context_pack  ← reads back what it should know
  │  - atlas_set_direction
  │
  ▼
Agent Atlas (local service)
  │
  ├── SQLite: stores exploration state (paths, decisions, dead ends, blockers)
  ├── Data Sources: reads agent memory from pi/mem0/Claude (no duplication)
  ├── Web UI: interactive tree + topology graph
  └── REST API: full CRUD access
```

**Atlas does NOT call LLMs.** It has no API keys. All intelligence stays in your agent — Atlas just stores, visualizes, and organizes.

### Real-time updates

The Web UI connects via WebSocket and updates instantly as your agent records progress. Falls back to polling if WebSocket is unavailable.

---

## Single Source of Truth

Agent Atlas **never duplicates your agent's memory**:

| Data | Where it lives | Atlas role |
|---|---|---|
| Memories | pi MEMORY.md, mem0, CLAUDE.md | **Read + display + edit (write back)** |
| Sessions | pi session logs, Claude transcripts | **Read only** |
| Explored paths | Atlas SQLite | **Store** (nobody else stores this) |
| Decisions | Atlas SQLite | **Store** |
| Dead ends | Atlas SQLite | **Store** |
| Blockers | Atlas SQLite | **Store** |

Every piece of data has one authoritative source. Atlas reads memories directly from your agent's existing storage and writes edits back to the same place. No sync issues, no staleness, no inconsistency.

---

## Quick Start

### Install

```bash
npm install -g agent-atlas
```

### Initialize

```bash
agent-atlas init
```

This creates `~/.agent-atlas/` with config and database.

### Start the visual UI

```bash
agent-atlas serve
```

Open **http://localhost:8765** to see your Atlas.

### Option A: pi extension (deepest integration)

Copy or symlink the extension into pi's extensions directory:

```bash
ln -s /path/to/agent-atlas/adapters/pi-extension/agent-atlas.ts ~/.pi/agent/extensions/agent-atlas.ts
```

The extension gives you:

- **Automatic context injection** — every turn, the agent receives the current Atlas state (goal, memories, decisions, dead ends, blockers, direction) so it never retries failed paths or forgets decisions. No manual tool calls needed.
- **Native tools** — `atlas_record_path`, `atlas_record_decision`, `atlas_set_direction`, `atlas_get_map` registered in-process.
- **`/atlas` command** — opens the visual map in your browser.
- **`/atlas-off` / `/atlas-on`** — toggle context injection per session.
- **Auto-start** — launches the Atlas server automatically if it's not running.

Requires `typebox` in `~/.pi/agent/node_modules` (run `npm install typebox` in `~/.pi/agent/`).

### Option B: MCP (Claude Code / Cursor / Codex / any MCP client)

Add to your agent's MCP config:

**Claude Code** (`.claude/mcp.json`):
```json
{
  "mcpServers": {
    "agent-atlas": {
      "command": "agent-atlas",
      "args": ["mcp"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcp": {
    "servers": {
      "agent-atlas": {
        "command": "agent-atlas",
        "args": ["mcp"]
      }
    }
  }
}
```

**pi** (`~/.pi/agent/settings.json`):
```json
{
  "mcpServers": {
    "agent-atlas": {
      "command": "agent-atlas",
      "args": ["mcp"]
    }
  }
}
```

---

## MCP Tools

Once connected, your agent can use these tools:

| Tool | Description |
|---|---|
| `atlas_create_node` | Create a node (goal, path, attempt, decision, blocker, dead_end, next_step) |
| `atlas_update_node` | Update node title, summary, status, tags, scope |
| `atlas_get_node` | Get a single node with its evidence |
| `atlas_list_nodes` | List nodes with optional filters |
| `atlas_delete_node` | Delete a node |
| `atlas_link_nodes` | Create a relationship edge (supports, blocks, contradicts, supersedes, used_by) |
| `atlas_add_evidence` | Attach evidence to a node |
| `atlas_mark_dead_end` | Mark a path as a dead end (won't retry) |
| `atlas_get_context_pack` | Get current context: goal, memories, decisions, dead ends, blockers, next steps |
| `atlas_set_direction` | Set current direction/next step |
| `atlas_search` | Search nodes by keyword |

### Example: Agent records its exploration

```
Agent: I'll try the CatDesk Gateway route for streaming support.

→ atlas_create_node({
    type: "path",
    title: "Try CatDesk Gateway streaming",
    parentId: "goal_abc",
    status: "open"
  })

Agent: Streaming works! Let me record the evidence.

→ atlas_add_evidence({
    nodeId: "path_xyz",
    kind: "test",
    summary: "Text streaming works with SSE protocol"
  })

→ atlas_update_node({
    id: "path_xyz",
    status: "success"
  })

Agent: Image support failed. Marking as dead end.

→ atlas_mark_dead_end({
    nodeId: "path_image",
    reason: "Both inline base64 and S3 upload failed model recognition"
  })
```

### Example: Agent reads context at turn start

```
→ atlas_get_context_pack({})

Response:
# Goal: Build CatDesk provider

## Active Memories
- User prefers Chinese communication
- CrewAI requires AI disclosure

## Decisions
- Provider is text-only (both image approaches failed)

## Dead Ends (do not retry)
- ☠️ Image support via S3 upload

## Next Steps
1. Complete provider documentation
```

Your agent starts every turn with full context instead of guessing.

---

## REST API

When the server is running (`agent-atlas serve`):

| Endpoint | Description |
|---|---|
| `GET /api/nodes` | List nodes (filter by type, status, scope, parentId) |
| `GET /api/nodes/:id` | Get node with evidence |
| `POST /api/nodes` | Create node |
| `PATCH /api/nodes/:id` | Update node |
| `DELETE /api/nodes/:id` | Delete node |
| `GET /api/edges` | List edges |
| `POST /api/edges` | Create edge |
| `GET /api/nodes/:id/evidence` | List evidence |
| `POST /api/nodes/:id/evidence` | Add evidence |
| `GET /api/context-pack` | Get context pack (?format=text for markdown) |
| `GET /api/search?q=` | Search nodes |
| `GET /api/events` | Recent events log |

---

## CLI

```bash
agent-atlas init           # Initialize config + database
agent-atlas serve          # Start web UI + API server
agent-atlas mcp            # Start MCP stdio server (for agent)
agent-atlas status         # Show status summary
```

---

## What Atlas Does NOT Do

- ❌ **Call LLMs** — No API keys, no model calls. All intelligence is in your agent.
- ❌ **Duplicate memory** — Reads from authoritative sources, writes back to same place.
- ❌ **Replace your agent** — Atlas is a companion tool, not an agent framework.
- ❌ **Send data anywhere** — Everything is local. SQLite on your machine, API on localhost.
- ❌ **Auto-magically extract knowledge** — Your agent explicitly records via MCP tools.

---

## How This Is Different

| Tool | What it does | What Atlas adds |
|---|---|---|
| **mem0 / Letta** | Memory storage backend | Visualization + editing + dead ends + paths |
| **LangSmith / Langfuse** | LLM call tracing | Semantic task state, not just call traces |
| **LangGraph Studio** | Workflow graph debugging | Dynamic exploration map, not predefined graphs |
| **Cursor / Claude memory** | Built-in agent memory | Cross-agent, visual, editable, dead-end tracking |
| **Agent Atlas** | Visual state map for agents | — |

---

## Architecture

```
Agent ──MCP──→ Atlas Core ──→ SQLite (paths, decisions, dead ends, blockers)
                    │
                    ├── DataSource Adapters ──→ pi MEMORY.md / mem0 / CLAUDE.md
                    ├── REST API ──→ localhost:8765
                    └── Web UI ──→ Tree + Topology graph + Detail panel
```

- **Core**: Node/edge CRUD, context pack assembly, event logging
- **Storage**: SQLite with FTS5 full-text search
- **Data Sources**: Adapter pattern for reading external memory (pi, mem0, Claude)
- **MCP**: Standard MCP stdio server for agent integration
- **API**: Hono REST server with CORS
- **UI**: Single-page HTML with SVG tree/topology graph

---

## Configuration

`~/.agent-atlas/config.yaml`:

```yaml
sources:
  pi-memory:
    enabled: true
    path: ~/.pi/agent/memory

  mem0:
    enabled: false
    # apiUrl: http://localhost:8080
    # apiKey from ATLAS_MEM0_API_KEY env var

server:
  port: 8765
  host: localhost

contextPack:
  maxItems: 20
  defaultScope: global
```

### Security

- **No API keys in config files** — Use environment variables (`ATLAS_MEM0_API_KEY`, `ATLAS_LLM_API_KEY`)
- **No hardcoded URLs** — All external endpoints are user-configured
- **Local by default** — Server binds to localhost
- **No telemetry** — Zero network calls unless you configure external sources

---

## Development

```bash
git clone https://github.com/gaoanze888/agent-atlas.git
cd agent-atlas
npm install
npm run build
npm test
```

---

## License

MIT

---

## Why "Atlas"?

An atlas is a collection of maps. Agent Atlas gives you a map of your agent's mind — where it's been, where it's stuck, and where it's going next.

> **Stop guessing what your agent remembers. See it.**
