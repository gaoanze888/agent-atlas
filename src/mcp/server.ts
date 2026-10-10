import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { initDb, closeDb } from "../storage/db.js"
import { NodeStore, EdgeStore, EvidenceStore, EventStore } from "../storage/stores.js"
import { buildContextPack, contextPackToText } from "../core/context-pack.js"
import type { NodeType, NodeStatus, EdgeType, EvidenceKind } from "../core/types.js"

const VALID_NODE_TYPES: NodeType[] = ["goal","path","attempt","decision","evidence","blocker","dead_end","next_step"]
const VALID_STATUSES: NodeStatus[] = ["open","success","failed","blocked","stale","archived"]
const VALID_EDGE_TYPES: EdgeType[] = ["supports","blocks","contradicts","supersedes","used_by"]
const VALID_EVIDENCE_KINDS: EvidenceKind[] = ["command","file","url","test","conversation","manual"]

function createServer(): Server {
  const server = new Server(
    { name: "agent-atlas", version: "0.1.0" },
    { capabilities: { tools: {} } }
  )

  const db = initDb()
  const nodes = new NodeStore(db)
  const edges = new EdgeStore(db)
  const evidence = new EvidenceStore(db)
  const events = new EventStore(db)

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "atlas_create_node",
        description: "Create a node in the Agent Atlas task map. Use this to record goals, exploration paths, attempts, decisions, blockers, dead ends, or next steps.",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: VALID_NODE_TYPES, description: "Node type" },
            title: { type: "string", description: "Short title" },
            summary: { type: "string", description: "Detailed description" },
            status: { type: "string", enum: VALID_STATUSES, description: "Initial status (default: open)" },
            parentId: { type: "string", description: "Parent node ID for tree structure" },
            scope: { type: "string", description: "Scope: global, project:<name>, or session:<id>" },
            tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
            agentName: { type: "string", description: "Name of the agent creating this node" },
          },
          required: ["type", "title"],
        },
      },
      {
        name: "atlas_update_node",
        description: "Update an existing Atlas node — change title, summary, status, tags, or scope.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Node ID" },
            title: { type: "string" },
            summary: { type: "string" },
            status: { type: "string", enum: VALID_STATUSES },
            tags: { type: "array", items: { type: "string" } },
            scope: { type: "string" },
          },
          required: ["id"],
        },
      },
      {
        name: "atlas_get_node",
        description: "Get a single Atlas node by ID.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Node ID" } },
          required: ["id"],
        },
      },
      {
        name: "atlas_list_nodes",
        description: "List Atlas nodes, optionally filtered by type, status, scope, or parentId.",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: VALID_NODE_TYPES },
            status: { type: "string", enum: VALID_STATUSES },
            scope: { type: "string" },
            parentId: { type: "string", description: "Filter by parent node ID; use 'null' for root nodes" },
          },
        },
      },
      {
        name: "atlas_delete_node",
        description: "Delete an Atlas node and its evidence. Use with caution.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Node ID to delete" } },
          required: ["id"],
        },
      },
      {
        name: "atlas_link_nodes",
        description: "Create a relationship edge between two nodes (supports, blocks, contradicts, supersedes, used_by).",
        inputSchema: {
          type: "object",
          properties: {
            fromId: { type: "string", description: "Source node ID" },
            toId: { type: "string", description: "Target node ID" },
            type: { type: "string", enum: VALID_EDGE_TYPES, description: "Relationship type" },
          },
          required: ["fromId", "toId", "type"],
        },
      },
      {
        name: "atlas_add_evidence",
        description: "Attach evidence to a node — command output, file content, URL, test result, etc.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: { type: "string", description: "Node ID to attach evidence to" },
            kind: { type: "string", enum: VALID_EVIDENCE_KINDS, description: "Evidence kind" },
            summary: { type: "string", description: "What the evidence shows" },
            ref: { type: "string", description: "Reference: file path, URL, or command" },
          },
          required: ["nodeId", "kind", "summary"],
        },
      },
      {
        name: "atlas_mark_dead_end",
        description: "Mark a path or node as a dead end — the agent should not retry this direction. Creates a dead_end node and links it.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: { type: "string", description: "The node ID that represents the failed path" },
            reason: { type: "string", description: "Why this direction should not be retried" },
          },
          required: ["nodeId", "reason"],
        },
      },
      {
        name: "atlas_get_context_pack",
        description: "Get the current context pack: active goal, relevant memories, decisions, dead ends, blockers, and next steps. Use this at the start of each turn to avoid repeating work.",
        inputSchema: {
          type: "object",
          properties: {
            scope: { type: "string", description: "Filter by scope" },
            maxItems: { type: "number", description: "Max items per category (default 20)" },
          },
        },
      },
      {
        name: "atlas_set_direction",
        description: "Set or update the current direction — what the agent should focus on next.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "The direction to pursue" },
            reason: { type: "string", description: "Why this direction" },
          },
          required: ["title"],
        },
      },
      {
        name: "atlas_search",
        description: "Search across all Atlas nodes by keyword.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const a = args || {}

    try {
      switch (name) {
        case "atlas_create_node": {
          const node = nodes.create({
            type: a.type as NodeType,
            title: a.title as string,
            summary: a.summary as string | undefined,
            status: a.status as NodeStatus | undefined,
            parentId: a.parentId as string | undefined,
            scope: a.scope as string | undefined,
            tags: a.tags as string[] | undefined,
            agentName: a.agentName as string | undefined,
          })
          events.record("created", node.id, JSON.stringify({ type: node.type, title: node.title }), a.agentName as string | undefined)
          return { content: [{ type: "text", text: JSON.stringify(node, null, 2) }] }
        }

        case "atlas_update_node": {
          const updated = nodes.update(a.id as string, {
            title: a.title as string | undefined,
            summary: a.summary as string | undefined,
            status: a.status as NodeStatus | undefined,
            tags: a.tags as string[] | undefined,
            scope: a.scope as string | undefined,
          })
          if (!updated) return { content: [{ type: "text", text: `Node ${a.id} not found` }], isError: true }
          events.record("updated", updated.id, JSON.stringify(a), a.agentName as string | undefined)
          return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] }
        }

        case "atlas_get_node": {
          const node = nodes.get(a.id as string)
          if (!node) return { content: [{ type: "text", text: `Node ${a.id} not found` }], isError: true }
          const ev = evidence.list(node.id)
          return { content: [{ type: "text", text: JSON.stringify({ ...node, evidence: ev }, null, 2) }] }
        }

        case "atlas_list_nodes": {
          const filter: any = {}
          if (a.type) filter.type = a.type
          if (a.status) filter.status = a.status
          if (a.scope) filter.scope = a.scope
          if (a.parentId !== undefined) filter.parentId = a.parentId === "null" ? null : a.parentId
          const list = nodes.list(filter)
          return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] }
        }

        case "atlas_delete_node": {
          const ok = nodes.delete(a.id as string)
          events.record("deleted", a.id as string, undefined, a.agentName as string | undefined)
          return { content: [{ type: "text", text: ok ? `Deleted ${a.id}` : `Node ${a.id} not found` }] }
        }

        case "atlas_link_nodes": {
          const edge = edges.create(a.fromId as string, a.toId as string, a.type as EdgeType)
          events.record("linked", undefined, JSON.stringify(edge), a.agentName as string | undefined)
          return { content: [{ type: "text", text: JSON.stringify(edge, null, 2) }] }
        }

        case "atlas_add_evidence": {
          const ev = evidence.create(a.nodeId as string, a.kind as EvidenceKind, a.summary as string, a.ref as string | undefined)
          events.record("evidence_added", a.nodeId as string, JSON.stringify(ev), a.agentName as string | undefined)
          return { content: [{ type: "text", text: JSON.stringify(ev, null, 2) }] }
        }

        case "atlas_mark_dead_end": {
          // Update the node status to failed
          const updated = nodes.update(a.nodeId as string, { status: "failed" })
          // Create a dead_end child node
          const deadEnd = nodes.create({
            type: "dead_end",
            title: `Dead end: ${updated?.title || a.nodeId}`,
            summary: a.reason as string,
            parentId: a.nodeId as string,
            status: "failed",
          })
          events.record("dead_end_marked", a.nodeId as string, a.reason as string, a.agentName as string | undefined)
          return { content: [{ type: "text", text: JSON.stringify({ marked: a.nodeId, deadEndNode: deadEnd }, null, 2) }] }
        }

        case "atlas_get_context_pack": {
          const allNodes = nodes.list()
          // Load memories from pi memory if available
          let memories: any[] = []
          try {
            const { PiMemoryAdapter } = await import("../sources/pi-memory.js")
            const adapter = new PiMemoryAdapter()
            await adapter.init()
            memories = await adapter.list({ status: "active" })
            // Take most relevant subset for context pack
            memories = memories.slice(0, a.maxItems ? Math.floor((a.maxItems as number) / 2) : 10)
          } catch {}
          const pack = buildContextPack(allNodes, memories, {
            scope: a.scope as string | undefined,
            maxItems: a.maxItems as number | undefined,
          })
          const text = contextPackToText(pack)
          return { content: [{ type: "text", text }] }
        }

        case "atlas_set_direction": {
          // Close existing next_steps, create new one
          const existing = nodes.list({ type: "next_step", status: "open" })
          for (const ns of existing) {
            nodes.update(ns.id, { status: "archived" })
          }
          const dir = nodes.create({
            type: "next_step",
            title: a.title as string,
            summary: a.reason as string | undefined,
            status: "open",
          })
          events.record("direction_set", dir.id, a.title as string, a.agentName as string | undefined)
          return { content: [{ type: "text", text: JSON.stringify(dir, null, 2) }] }
        }

        case "atlas_search": {
          const results = nodes.search(a.query as string)
          return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] }
        }

        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true }
      }
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }
    }
  })

  return server
}

export async function runMcp(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)

  process.on("SIGINT", () => {
    closeDb()
    process.exit(0)
  })
}

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runMcp().catch(console.error)
}
