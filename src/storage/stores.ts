import { nanoid } from "nanoid"
import type { AtlasNode, NodeType, NodeStatus, AtlasEdge, EdgeType, Evidence, EvidenceKind, AtlasEvent, EventType } from "../core/types.js"
import Database from "better-sqlite3"

export class NodeStore {
  constructor(private db: Database.Database) {}

  create(input: {
    type: NodeType
    title: string
    summary?: string
    status?: NodeStatus
    parentId?: string
    scope?: string
    tags?: string[]
    agentName?: string
    sessionId?: string
  }): AtlasNode {
    const now = new Date().toISOString()
    const node: AtlasNode = {
      id: `nd_${nanoid(12)}`,
      type: input.type,
      title: input.title,
      summary: input.summary,
      status: input.status || "open",
      parentId: input.parentId,
      scope: input.scope || "global",
      tags: input.tags || [],
      agentName: input.agentName,
      sessionId: input.sessionId,
      createdAt: now,
      updatedAt: now,
    }

    this.db.prepare(`
      INSERT INTO nodes (id, type, title, summary, status, parent_id, scope, tags, agent_name, session_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      node.id, node.type, node.title, node.summary || null,
      node.status, node.parentId || null, node.scope,
      JSON.stringify(node.tags), node.agentName || null, node.sessionId || null,
      node.createdAt, node.updatedAt
    )

    // Add contains edge if parent exists
    if (node.parentId) {
      this.db.prepare(`
        INSERT INTO edges (id, from_id, to_id, type, created_at)
        VALUES (?, ?, ?, 'contains', ?)
      `).run(`edg_${nanoid(12)}`, node.parentId, node.id, now)
    }

    return node
  }

  get(id: string): AtlasNode | null {
    const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as any
    if (!row) return null
    return this.rowToNode(row)
  }

  list(filter?: { type?: NodeType; status?: NodeStatus; scope?: string; parentId?: string }): AtlasNode[] {
    let sql = "SELECT * FROM nodes WHERE 1=1"
    const params: any[] = []
    if (filter?.type) { sql += " AND type = ?"; params.push(filter.type) }
    if (filter?.status) { sql += " AND status = ?"; params.push(filter.status) }
    if (filter?.scope) { sql += " AND scope = ?"; params.push(filter.scope) }
    if (filter?.parentId !== undefined) {
      if (filter.parentId === null) { sql += " AND parent_id IS NULL" }
      else { sql += " AND parent_id = ?"; params.push(filter.parentId) }
    }
    sql += " ORDER BY created_at DESC"
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(r => this.rowToNode(r))
  }

  update(id: string, patch: Partial<Pick<AtlasNode, "title" | "summary" | "status" | "tags" | "scope">>): AtlasNode | null {
    const existing = this.get(id)
    if (!existing) return null

    const now = new Date().toISOString()
    const sets: string[] = []
    const params: any[] = []

    if (patch.title !== undefined) { sets.push("title = ?"); params.push(patch.title) }
    if (patch.summary !== undefined) { sets.push("summary = ?"); params.push(patch.summary) }
    if (patch.status !== undefined) { sets.push("status = ?"); params.push(patch.status) }
    if (patch.tags !== undefined) { sets.push("tags = ?"); params.push(JSON.stringify(patch.tags)) }
    if (patch.scope !== undefined) { sets.push("scope = ?"); params.push(patch.scope) }

    if (sets.length === 0) return existing

    sets.push("updated_at = ?"); params.push(now)
    params.push(id)
    this.db.prepare(`UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`).run(...params)

    return this.get(id)
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM nodes WHERE id = ?").run(id)
    return result.changes > 0
  }

  search(query: string): AtlasNode[] {
    const rows = this.db.prepare(`
      SELECT n.* FROM nodes n
      JOIN nodes_fts fts ON n.rowid = fts.rowid
      WHERE nodes_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `).all(query) as any[]
    return rows.map(r => this.rowToNode(r))
  }

  private rowToNode(row: any): AtlasNode {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      summary: row.summary || undefined,
      status: row.status,
      parentId: row.parent_id || undefined,
      scope: row.scope,
      tags: JSON.parse(row.tags || "[]"),
      agentName: row.agent_name || undefined,
      sessionId: row.session_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

export class EdgeStore {
  constructor(private db: Database.Database) {}

  create(fromId: string, toId: string, type: EdgeType): AtlasEdge {
    const now = new Date().toISOString()
    const edge: AtlasEdge = {
      id: `edg_${nanoid(12)}`,
      fromId, toId, type,
      createdAt: now,
    }
    this.db.prepare(`
      INSERT INTO edges (id, from_id, to_id, type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(edge.id, edge.fromId, edge.toId, edge.type, edge.createdAt)
    return edge
  }

  list(filter?: { fromId?: string; toId?: string; type?: EdgeType }): AtlasEdge[] {
    let sql = "SELECT * FROM edges WHERE 1=1"
    const params: any[] = []
    if (filter?.fromId) { sql += " AND from_id = ?"; params.push(filter.fromId) }
    if (filter?.toId) { sql += " AND to_id = ?"; params.push(filter.toId) }
    if (filter?.type) { sql += " AND type = ?"; params.push(filter.type) }
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(r => ({
      id: r.id, fromId: r.from_id, toId: r.to_id, type: r.type, createdAt: r.created_at,
    }))
  }

  delete(id: string): boolean {
    return this.db.prepare("DELETE FROM edges WHERE id = ?").run(id).changes > 0
  }
}

export class EvidenceStore {
  constructor(private db: Database.Database) {}

  create(nodeId: string, kind: EvidenceKind, summary: string, ref?: string): Evidence {
    const now = new Date().toISOString()
    const ev: Evidence = {
      id: `ev_${nanoid(12)}`,
      nodeId, kind, summary, ref,
      createdAt: now,
    }
    this.db.prepare(`
      INSERT INTO evidence (id, node_id, kind, summary, ref, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ev.id, ev.nodeId, ev.kind, ev.summary, ev.ref || null, ev.createdAt)
    return ev
  }

  list(nodeId: string): Evidence[] {
    const rows = this.db.prepare("SELECT * FROM evidence WHERE node_id = ? ORDER BY created_at").all(nodeId) as any[]
    return rows.map(r => ({
      id: r.id, nodeId: r.node_id, kind: r.kind, summary: r.summary,
      ref: r.ref || undefined, hash: r.hash || undefined, createdAt: r.created_at,
    }))
  }
}

export class EventStore {
  constructor(private db: Database.Database) {}

  record(eventType: EventType, nodeId?: string, detail?: string, agentName?: string): AtlasEvent {
    const now = new Date().toISOString()
    const ev: AtlasEvent = {
      id: `evt_${nanoid(12)}`,
      nodeId, eventType, detail, agentName,
      createdAt: now,
    }
    this.db.prepare(`
      INSERT INTO events (id, node_id, event_type, detail, agent_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ev.id, ev.nodeId || null, ev.eventType, ev.detail || null, ev.agentName || null, ev.createdAt)
    return ev
  }

  recent(limit = 50): AtlasEvent[] {
    const rows = this.db.prepare(
      "SELECT * FROM events ORDER BY created_at DESC LIMIT ?"
    ).all(limit) as any[]
    return rows.map(r => ({
      id: r.id, nodeId: r.node_id || undefined, eventType: r.event_type,
      detail: r.detail || undefined, agentName: r.agent_name || undefined,
      createdAt: r.created_at,
    }))
  }
}
