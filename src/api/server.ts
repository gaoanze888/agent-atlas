import { Hono } from "hono"
import { cors } from "hono/cors"
import { serveStatic } from "@hono/node-server/serve-static"
import { serve } from "@hono/node-server"
import { initDb, closeDb } from "../storage/db.js"
import { NodeStore, EdgeStore, EvidenceStore, EventStore } from "../storage/stores.js"
import { buildContextPack, contextPackToText } from "../core/context-pack.js"
import type { NodeType, NodeStatus, EdgeType, EvidenceKind } from "../core/types.js"
import path from "node:path"
import fs from "node:fs"

export async function serveApi(port: number): Promise<void> {
  const app = new Hono()
  const db = initDb()
  const nodeStore = new NodeStore(db)
  const edgeStore = new EdgeStore(db)
  const evStore = new EvidenceStore(db)
  const eventStore = new EventStore(db)

  app.use("*", cors())

  // Health
  app.get("/api/health", (c) => c.json({ status: "ok", version: "0.1.0" }))

  // Nodes
  app.get("/api/nodes", (c) => {
    const filter: any = {}
    const type = c.req.query("type") as NodeType | undefined
    const status = c.req.query("status") as NodeStatus | undefined
    const scope = c.req.query("scope")
    const parentId = c.req.query("parentId")
    if (type) filter.type = type
    if (status) filter.status = status
    if (scope) filter.scope = scope
    if (parentId !== undefined) filter.parentId = parentId === "null" ? null : parentId
    return c.json(nodeStore.list(filter))
  })

  app.get("/api/nodes/:id", (c) => {
    const node = nodeStore.get(c.req.param("id"))
    if (!node) return c.json({ error: "not found" }, 404)
    const ev = evStore.list(node.id)
    return c.json({ ...node, evidence: ev })
  })

  app.post("/api/nodes", async (c) => {
    const body = await c.req.json()
    const node = nodeStore.create(body)
    eventStore.record("created", node.id)
    return c.json(node, 201)
  })

  app.patch("/api/nodes/:id", async (c) => {
    const body = await c.req.json()
    const updated = nodeStore.update(c.req.param("id"), body)
    if (!updated) return c.json({ error: "not found" }, 404)
    eventStore.record("updated", updated.id)
    return c.json(updated)
  })

  app.delete("/api/nodes/:id", (c) => {
    const ok = nodeStore.delete(c.req.param("id"))
    return c.json({ deleted: ok })
  })

  // Edges
  app.get("/api/edges", (c) => {
    const filter: any = {}
    const fromId = c.req.query("fromId")
    const toId = c.req.query("toId")
    const type = c.req.query("type") as EdgeType | undefined
    if (fromId) filter.fromId = fromId
    if (toId) filter.toId = toId
    if (type) filter.type = type
    return c.json(edgeStore.list(filter))
  })

  app.post("/api/edges", async (c) => {
    const body = await c.req.json()
    const edge = edgeStore.create(body.fromId, body.toId, body.type)
    return c.json(edge, 201)
  })

  app.delete("/api/edges/:id", (c) => {
    const ok = edgeStore.delete(c.req.param("id"))
    return c.json({ deleted: ok })
  })

  // Evidence
  app.get("/api/nodes/:id/evidence", (c) => {
    return c.json(evStore.list(c.req.param("id")))
  })

  app.post("/api/nodes/:id/evidence", async (c) => {
    const body = await c.req.json()
    const ev = evStore.create(c.req.param("id"), body.kind, body.summary, body.ref)
    return c.json(ev, 201)
  })

  // Context Pack
  app.get("/api/context-pack", (c) => {
    const allNodes = nodeStore.list()
    const pack = buildContextPack(allNodes, [], {
      scope: c.req.query("scope") || undefined,
      maxItems: parseInt(c.req.query("maxItems") || "20"),
    })
    const format = c.req.query("format")
    if (format === "text") {
      return c.text(contextPackToText(pack))
    }
    return c.json(pack)
  })

  // Search
  app.get("/api/search", (c) => {
    const q = c.req.query("q")
    if (!q) return c.json([])
    return c.json(nodeStore.search(q))
  })

  // Events
  app.get("/api/events", (c) => {
    const limit = parseInt(c.req.query("limit") || "50")
    return c.json(eventStore.recent(limit))
  })

  // Static web UI (if built)
  // For v0.1, we serve a simple HTML page

  // Static web UI
  const webDir = path.join(import.meta.dirname || '.', '..', 'web')
  const htmlPath = path.join(webDir, 'index.html')
  if (fs.existsSync(htmlPath)) {
    app.get("/", async (c) => {
      const html = fs.readFileSync(htmlPath, 'utf-8')
      return c.html(html)
    })
  }

  console.log(`🗺️  Agent Atlas serving on http://localhost:${port}`)

  process.on("SIGINT", () => {
    closeDb()
    process.exit(0)
  })

  serve({ fetch: app.fetch, port })
}
