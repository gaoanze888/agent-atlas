import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import type { DataSource, MemoryItem, DataSourceChangeEvent } from "../core/types.js"

/**
 * Reads pi memory from MEMORY.md and daily logs.
 * Does NOT copy data — reads directly from the authoritative source.
 * Edits write back to MEMORY.md.
 */
export class PiMemoryAdapter implements DataSource {
  name = "pi-memory"
  kind = "memory" as const
  writable = true

  private memoryDir: string
  private watchers: (() => void)[] = []

  constructor(memoryDir?: string) {
    this.memoryDir = memoryDir || path.join(os.homedir(), ".pi", "agent", "memory")
  }

  async init(): Promise<void> {
    // Check if pi memory directory exists
    if (!fs.existsSync(this.memoryDir)) {
      // Not an error — pi may not be configured
    }
  }

  async list(filter?: { scope?: string; tags?: string[]; status?: string }): Promise<MemoryItem[]> {
    const items: MemoryItem[] = []
    const memoryFile = path.join(this.memoryDir, "MEMORY.md")

    if (fs.existsSync(memoryFile)) {
      const content = fs.readFileSync(memoryFile, "utf-8")
      items.push(...this.parseMemoryMd(content))
    }

    // Apply filters
    return items.filter(item => {
      if (filter?.status && item.status !== filter.status) return false
      if (filter?.scope && item.scope !== filter.scope) return false
      if (filter?.tags && !filter.tags.some(t => item.tags.includes(t))) return false
      return true
    })
  }

  async get(id: string): Promise<MemoryItem | null> {
    const items = await this.list()
    return items.find(i => i.id === id) || null
  }

  async search(query: string): Promise<MemoryItem[]> {
    const items = await this.list()
    const lower = query.toLowerCase()
    return items.filter(i =>
      i.content.toLowerCase().includes(lower) ||
      i.tags.some(t => t.toLowerCase().includes(lower))
    )
  }

  async update(id: string, patch: { content?: string; tags?: string[]; status?: string }): Promise<void> {
    // Write back to MEMORY.md
    const memoryFile = path.join(this.memoryDir, "MEMORY.md")
    if (!fs.existsSync(memoryFile)) return

    let content = fs.readFileSync(memoryFile, "utf-8")

    // Find the item by its line-based ID and update
    // This is a simple approach — for production, use structured editing
    if (patch.content) {
      // Replace the content of the item with matching ID
      const lines = content.split("\n")
      let inTarget = false
      const newLines: string[] = []

      for (const line of lines) {
        if (line.includes(id)) {
          inTarget = true
          newLines.push(line) // Keep the header/comment with ID
        } else if (inTarget && line.trim() === "") {
          inTarget = false
          newLines.push(line)
        } else if (inTarget) {
          // Replace content line
          newLines.push(patch.content)
          inTarget = false
        } else {
          newLines.push(line)
        }
      }

      fs.writeFileSync(memoryFile, newLines.join("\n"), "utf-8")
    }
  }

  async delete(id: string): Promise<void> {
    // Remove from MEMORY.md — careful operation
    // For safety, we don't auto-delete from pi memory
    throw new Error("Deletion from pi MEMORY.md is not supported via Atlas. Edit the file directly.")
  }

  watch?(onChange: (event: DataSourceChangeEvent) => void): () => void {
    const memoryFile = path.join(this.memoryDir, "MEMORY.md")

    if (!fs.existsSync(memoryFile)) {
      return () => {}
    }

    // Simple polling-based watch (chokidar adds complexity for MVP)
    let lastMtime = fs.statSync(memoryFile).mtimeMs
    const interval = setInterval(() => {
      try {
        const mtime = fs.statSync(memoryFile).mtimeMs
        if (mtime !== lastMtime) {
          lastMtime = mtime
          onChange({ type: "updated", id: "MEMORY.md" })
        }
      } catch {}
    }, 2000)

    const cleanup = () => clearInterval(interval)
    this.watchers.push(cleanup)
    return cleanup
  }

  async close(): Promise<void> {
    this.watchers.forEach(cleanup => cleanup())
    this.watchers = []
  }

  /**
   * Parse MEMORY.md into structured items.
   * Format: lines starting with - or ## are treated as items.
   * Tags like #decision, #preference are extracted.
   */
  private parseMemoryMd(content: string): MemoryItem[] {
    const items: MemoryItem[] = []
    const lines = content.split("\n")
    let idx = 0

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("<!--")) continue

      // Extract tags from #tag patterns
      const tagMatch = trimmed.match(/#(\w[\w-]*)/g)
      const tags = tagMatch ? tagMatch.map(t => t.slice(1)) : []

      // Extract content (remove #tags, leading - or ##)
      let text = trimmed
        .replace(/#(\w[\w-]*)/g, "")
        .replace(/^[-*]\s*/, "")
        .replace(/^#+\s*/, "")
        .trim()

      if (!text) continue

      // Determine scope from [[links]]
      const linkMatch = text.match(/\[\[([^\]]+)\]\]/)
      const scope = linkMatch ? `project:${linkMatch[1]}` : "global"
      text = text.replace(/\[\[[^\]]+\]\]/g, "").trim()

      if (!text) continue

      items.push({
        id: `pi_mem_${idx++}`,
        source: "pi-memory",
        content: text,
        tags,
        scope,
        status: "active",
        createdAt: new Date().toISOString(), // MEMORY.md doesn't track per-item creation
        updatedAt: new Date().toISOString(),
      })
    }

    return items
  }
}
