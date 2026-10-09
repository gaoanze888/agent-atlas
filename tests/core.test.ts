import { describe, it, expect, beforeEach, afterEach } from "vitest"
import Database from "better-sqlite3"
import { SCHEMA_V1 } from "../src/storage/schema"
import { NodeStore, EdgeStore, EvidenceStore, EventStore } from "../src/storage/stores"

let db: Database.Database
let nodeStore: NodeStore
let edgeStore: EdgeStore
let evidenceStore: EvidenceStore
let eventStore: EventStore

beforeEach(() => {
  db = new Database(":memory:")
  db.pragma("foreign_keys = ON")
  db.exec(SCHEMA_V1)
  nodeStore = new NodeStore(db)
  edgeStore = new EdgeStore(db)
  evidenceStore = new EvidenceStore(db)
  eventStore = new EventStore(db)
})

afterEach(() => {
  db.close()
})

describe("NodeStore", () => {
  it("creates a node", () => {
    const node = nodeStore.create({ type: "goal", title: "Build Atlas" })
    expect(node.id).toMatch(/^nd_/)
    expect(node.type).toBe("goal")
    expect(node.title).toBe("Build Atlas")
    expect(node.status).toBe("open")
    expect(node.scope).toBe("global")
    expect(node.tags).toEqual([])
  })

  it("creates a node with parent and auto-adds contains edge", () => {
    const parent = nodeStore.create({ type: "goal", title: "Goal" })
    const child = nodeStore.create({ type: "path", title: "Path", parentId: parent.id })
    expect(child.parentId).toBe(parent.id)

    const parentEdges = edgeStore.list({ fromId: parent.id, type: "contains" })
    expect(parentEdges.length).toBe(1)
    expect(parentEdges[0].toId).toBe(child.id)
  })

  it("gets a node by id", () => {
    const created = nodeStore.create({ type: "decision", title: "Use SQLite" })
    const got = nodeStore.get(created.id)
    expect(got).toEqual(created)
  })

  it("lists nodes with filter", () => {
    nodeStore.create({ type: "goal", title: "A" })
    nodeStore.create({ type: "path", title: "B", status: "failed" })
    nodeStore.create({ type: "path", title: "C", status: "open" })

    const goals = nodeStore.list({ type: "goal" })
    expect(goals.length).toBe(1)

    const failedPaths = nodeStore.list({ type: "path", status: "failed" })
    expect(failedPaths.length).toBe(1)
    expect(failedPaths[0].title).toBe("B")
  })

  it("updates a node", () => {
    const node = nodeStore.create({ type: "path", title: "Try S3" })
    const updated = nodeStore.update(node.id, { status: "failed", summary: "Model cannot view image" })
    expect(updated?.status).toBe("failed")
    expect(updated?.summary).toBe("Model cannot view image")
  })

  it("deletes a node", () => {
    const node = nodeStore.create({ type: "blocker", title: "Workflow scope" })
    expect(nodeStore.delete(node.id)).toBe(true)
    expect(nodeStore.get(node.id)).toBeNull()
  })

  it("searches nodes by FTS", () => {
    nodeStore.create({ type: "goal", title: "Build CatDesk provider" })
    nodeStore.create({ type: "decision", title: "Use SQLite for storage" })
    const results = nodeStore.search("CatDesk")
    expect(results.length).toBe(1)
    expect(results[0].title).toContain("CatDesk")
  })
})

describe("EdgeStore", () => {
  it("creates and lists edges", () => {
    const n1 = nodeStore.create({ type: "evidence", title: "E1" })
    const n2 = nodeStore.create({ type: "decision", title: "D1" })
    const edge = edgeStore.create(n1.id, n2.id, "supports")
    expect(edge.type).toBe("supports")

    const list = edgeStore.list({ fromId: n1.id })
    expect(list.length).toBe(1)
  })
})

describe("EvidenceStore", () => {
  it("creates and lists evidence", () => {
    const node = nodeStore.create({ type: "path", title: "Test S3" })
    const ev = evidenceStore.create(node.id, "test", "8 tests passed", "pytest output")
    expect(ev.kind).toBe("test")
    expect(ev.summary).toBe("8 tests passed")

    const list = evidenceStore.list(node.id)
    expect(list.length).toBe(1)
  })
})

describe("EventStore", () => {
  it("records and retrieves events", () => {
    eventStore.record("created", "nd_1", '{"type":"goal"}')
    eventStore.record("updated", "nd_1", '{"status":"failed"}')
    const recent = eventStore.recent(10)
    expect(recent.length).toBe(2)
    expect(recent[0].eventType).toBe("updated") // most recent first
  })
})

describe("Context Pack", () => {
  it("builds context pack from nodes", async () => {
    const { buildContextPack } = await import("../src/core/context-pack")
    const goal = nodeStore.create({ type: "goal", title: "Build Atlas MVP", status: "open" })
    nodeStore.create({ type: "decision", title: "Use React Flow", parentId: goal.id })
    nodeStore.create({ type: "dead_end", title: "PR Doctor idea", summary: "Value too small", status: "failed" })
    nodeStore.create({ type: "blocker", title: "Workflow scope", status: "blocked" })
    nodeStore.create({ type: "next_step", title: "Implement MCP server", status: "open" })

    const allNodes = nodeStore.list()
    const pack = buildContextPack(allNodes, [], { maxItems: 20 })

    expect(pack.goal?.title).toBe("Build Atlas MVP")
    expect(pack.activeDecisions.length).toBe(1)
    expect(pack.deadEnds.length).toBe(1)
    expect(pack.blockers.length).toBe(1)
    expect(pack.nextSteps.length).toBe(1)
  })
})
