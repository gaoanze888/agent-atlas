// ─── Node Types ───

export type NodeType =
  | "goal"
  | "path"
  | "attempt"
  | "decision"
  | "evidence"
  | "blocker"
  | "dead_end"
  | "next_step"

export type NodeStatus =
  | "open"
  | "success"
  | "failed"
  | "blocked"
  | "stale"
  | "archived"

export type AtlasNode = {
  id: string
  type: NodeType
  title: string
  summary?: string
  status: NodeStatus
  parentId?: string
  scope: string
  tags: string[]
  agentName?: string
  sessionId?: string
  createdAt: string
  updatedAt: string
}

// ─── Edge Types ───

export type EdgeType =
  | "contains"
  | "supports"
  | "blocks"
  | "contradicts"
  | "supersedes"
  | "used_by"

export type AtlasEdge = {
  id: string
  fromId: string
  toId: string
  type: EdgeType
  createdAt: string
}

// ─── Evidence ───

export type EvidenceKind = "command" | "file" | "url" | "test" | "conversation" | "manual"

export type Evidence = {
  id: string
  nodeId: string
  kind: EvidenceKind
  summary: string
  ref?: string
  hash?: string
  createdAt: string
}

// ─── Events (append-only log) ───

export type EventType =
  | "created"
  | "updated"
  | "status_changed"
  | "deleted"
  | "linked"
  | "unlinked"
  | "evidence_added"
  | "dead_end_marked"
  | "direction_set"

export type AtlasEvent = {
  id: string
  nodeId?: string
  eventType: EventType
  detail?: string
  agentName?: string
  createdAt: string
}

// ─── External Memory (from DataSource adapters, NOT stored in Atlas) ───

export type MemoryItem = {
  id: string
  source: string
  content: string
  tags: string[]
  scope: string
  confidence?: number
  status: "active" | "stale" | "archived"
  createdAt: string
  updatedAt: string
}

// ─── Context Pack ───

export type ContextPack = {
  goal?: AtlasNode
  activeMemories: MemoryItem[]
  activeDecisions: AtlasNode[]
  deadEnds: AtlasNode[]
  blockers: AtlasNode[]
  openPaths: AtlasNode[]
  nextSteps: AtlasNode[]
  excluded: {
    memories: MemoryItem[]
    nodes: AtlasNode[]
  }
}

// ─── Display Node (for UI rendering, merges Atlas + external) ───

export type DisplayNode =
  | { kind: "atlas"; node: AtlasNode; evidence: Evidence[] }
  | { kind: "memory"; item: MemoryItem }

// ─── DataSource Adapter Interface ───

export type DataSourceChangeEvent = {
  type: "created" | "updated" | "deleted"
  id: string
}

export interface DataSource {
  name: string
  kind: "memory" | "session" | "transcript"
  writable: boolean
  init(): Promise<void>
  list(filter?: { scope?: string; tags?: string[]; status?: string }): Promise<MemoryItem[]>
  get(id: string): Promise<MemoryItem | null>
  search(query: string): Promise<MemoryItem[]>
  update?(id: string, patch: { content?: string; tags?: string[]; status?: string }): Promise<void>
  delete?(id: string): Promise<void>
  watch?(onChange: (event: DataSourceChangeEvent) => void): () => void
  close?(): Promise<void>
}

// ─── Config ───

export type AtlasConfig = {
  sources: Record<string, {
    enabled: boolean
    path?: string
    apiUrl?: string
  }>
  server: {
    port: number
    host: string
  }
  contextPack: {
    maxItems: number
    defaultScope: string
  }
}
