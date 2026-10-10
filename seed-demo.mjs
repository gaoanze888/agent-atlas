// Seed demo data for visual testing
import Database from "better-sqlite3"
import { SCHEMA_V1 } from "./src/storage/schema.ts"
import { NodeStore, EdgeStore, EvidenceStore } from "./src/storage/stores.ts"

const db = new Database("/tmp/atlas-test/atlas.db")
db.pragma("foreign_keys = ON")
db.exec(SCHEMA_V1)

const nodes = new NodeStore(db)
const edges = new EdgeStore(db)
const evidence = new EvidenceStore(db)

// Goal
const goal = nodes.create({ type: "goal", title: "Build Agent Atlas MVP", summary: "A visual state map for AI agents" })

// Paths
const path1 = nodes.create({ type: "path", title: "Design interaction spec", parentId: goal.id, status: "success", tags: ["design"] })
evidence.create(path1.id, "conversation", "User requested design-first approach", "turn 12")

const path2 = nodes.create({ type: "path", title: "Implement MCP server", parentId: goal.id, status: "success", tags: ["mcp", "core"] })
evidence.create(path2.id, "test", "11 MCP tools verified", "mcp-test.mjs")

const path3 = nodes.create({ type: "path", title: "Build Web UI", parentId: goal.id, status: "open", tags: ["ui"] })

const path4 = nodes.create({ type: "path", title: "Pi adapter integration", parentId: goal.id, status: "open", tags: ["pi", "adapter"] })

// Failed path
const pathFail = nodes.create({ type: "path", title: "PR triage tool idea", parentId: goal.id, status: "failed" })
const deadEnd = nodes.create({ type: "dead_end", title: "PR triage: value too small", parentId: pathFail.id, status: "failed", summary: "Not big enough for AI infrastructure direction" })
evidence.create(pathFail.id, "conversation", "User rejected: value too small", "turn 8")

// Decisions
const dec1 = nodes.create({ type: "decision", title: "Product design before tech design", parentId: goal.id, tags: ["process"] })
const dec2 = nodes.create({ type: "decision", title: "No LLM calls in Atlas", parentId: goal.id, summary: "All intelligence in agent side; Atlas is just storage+visualization", tags: ["architecture", "security"] })
const dec3 = nodes.create({ type: "decision", title: "Single source of truth for memory", parentId: goal.id, summary: "Read from pi/mem0/CLAUDE.md, never duplicate", tags: ["architecture"] })

// Blocker
const blocker1 = nodes.create({ type: "blocker", title: "MCP stdio protocol test", parentId: path4.id, status: "open", summary: "Need to verify pi can connect to Atlas MCP server" })

// Next steps
nodes.create({ type: "next_step", title: "Polish Web UI visuals", status: "open" })
nodes.create({ type: "next_step", title: "Test pi MCP integration", status: "open" })

// Evidence edges
edges.create(path1.id, dec1.id, "supports")

// Stale decision (old)
const stale = nodes.create({ type: "decision", title: "Make Atlas pi-only plugin", status: "stale", tags: ["superseded"] })
edges.create(dec3.id, stale.id, "supersedes")

db.close()
console.log("✅ Demo data seeded")
