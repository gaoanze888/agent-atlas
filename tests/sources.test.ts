import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { PiMemoryAdapter } from "../src/sources/pi-memory"

const tmpDir = path.join(os.tmpdir(), `atlas-test-pi-mem-${Date.now()}`)

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("PiMemoryAdapter", () => {
  it("reads from MEMORY.md", async () => {
    const memoryContent = `# Memory

## User Preferences
- #preference Use Chinese for communication
- #decision CrewAI requires AI disclosure

## Project: CatDesk
- CatDesk provider is text-only
- #lesson Image support failed via S3
`
    fs.writeFileSync(path.join(tmpDir, "MEMORY.md"), memoryContent, "utf-8")

    const adapter = new PiMemoryAdapter(tmpDir)
    await adapter.init()
    const items = await adapter.list()

    expect(items.length).toBeGreaterThan(0)
    expect(items.some(i => i.content.includes("Chinese"))).toBe(true)
    expect(items.some(i => i.content.includes("AI disclosure"))).toBe(true)
    expect(items.some(i => i.content.includes("text-only"))).toBe(true)
    expect(items.every(i => i.source === "pi-memory")).toBe(true)
  })

  it("extracts tags from #tag patterns", async () => {
    fs.writeFileSync(path.join(tmpDir, "MEMORY.md"), "- #preference #coding Use pnpm", "utf-8")
    const adapter = new PiMemoryAdapter(tmpDir)
    await adapter.init()
    const items = await adapter.list()

    expect(items.length).toBe(1)
    expect(items[0].tags).toContain("preference")
    expect(items[0].tags).toContain("coding")
  })

  it("extracts scope from [[links]]", async () => {
    fs.writeFileSync(path.join(tmpDir, "MEMORY.md"), "- Use React [[agent-atlas]]", "utf-8")
    const adapter = new PiMemoryAdapter(tmpDir)
    await adapter.init()
    const items = await adapter.list()

    expect(items.length).toBe(1)
    expect(items[0].scope).toBe("project:agent-atlas")
  })

  it("searches items by content", async () => {
    fs.writeFileSync(path.join(tmpDir, "MEMORY.md"), "- Chinese communication\n- CrewAI disclosure\n", "utf-8")
    const adapter = new PiMemoryAdapter(tmpDir)
    await adapter.init()
    const results = await adapter.search("CrewAI")

    expect(results.length).toBe(1)
    expect(results[0].content).toContain("CrewAI")
  })

  it("handles missing directory gracefully", async () => {
    const adapter = new PiMemoryAdapter("/nonexistent/path")
    await adapter.init()
    const items = await adapter.list()
    expect(items).toEqual([])
  })
})
