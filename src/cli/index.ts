import { Command } from "commander"
import { initDb, closeDb, getDbPath } from "../storage/db.js"
import { NodeStore, EventStore } from "../storage/stores.js"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

export function registerCommands(program: Command): void {
  program
    .command("init")
    .description("Initialize Agent Atlas (create config + database)")
    .action(() => {
      const home = path.join(os.homedir(), ".agent-atlas")
      fs.mkdirSync(home, { recursive: true })

      const configPath = path.join(home, "config.yaml")
      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, `# Agent Atlas Configuration
sources:
  pi-memory:
    enabled: true
    path: ~/.pi/agent/memory

server:
  port: 8765
  host: localhost

contextPack:
  maxItems: 20
  defaultScope: global
`)
      }

      const db = initDb()
      db.close()

      console.log(`✅ Agent Atlas initialized`)
      console.log(`   Config: ${configPath}`)
      console.log(`   Database: ${getDbPath()}`)
    })

  program
    .command("mcp")
    .description("Start MCP stdio server (for agent integration)")
    .action(async () => {
      const { runMcp } = await import("../mcp/server.js")
      await runMcp()
    })

  program
    .command("serve")
    .description("Start web UI + API server")
    .option("-p, --port <port>", "Port", "8765")
    .action(async (opts) => {
      // Load memories from data sources
      let memories: any[] = []
      try {
        const { PiMemoryAdapter } = await import("../sources/pi-memory.js")
        const adapter = new PiMemoryAdapter()
        await adapter.init()
        memories = await adapter.list()
      } catch {}
      const { serveApi } = await import("../api/server.js")
      await serveApi(parseInt(opts.port), memories)
    })

  program
    .command("status")
    .description("Show current Atlas status summary")
    .action(() => {
      const db = initDb()
      const nodeStore = new NodeStore(db)

      const all = nodeStore.list()
      const goals = all.filter(n => n.type === "goal" && n.status === "open")
      const deadEnds = all.filter(n => n.type === "dead_end" && n.status !== "archived")
      const blockers = all.filter(n => n.type === "blocker" && n.status !== "archived")
      const nextSteps = all.filter(n => n.type === "next_step" && n.status === "open")

      console.log(`\n📊 Agent Atlas Status`)
      console.log(`   Nodes: ${all.length}`)
      console.log(`   Goals: ${goals.length}`)
      console.log(`   Dead ends: ${deadEnds.length}`)
      console.log(`   Blockers: ${blockers.length}`)
      console.log(`   Next steps: ${nextSteps.length}`)

      if (goals.length > 0) {
        console.log(`\n🎯 Active Goal: ${goals[0].title}`)
      }
      if (nextSteps.length > 0) {
        console.log(`➡️  Direction: ${nextSteps[0].title}`)
      }
      if (blockers.length > 0) {
        console.log(`\n⛔ Blockers:`)
        blockers.forEach(b => console.log(`   - ${b.title}`))
      }
      if (deadEnds.length > 0) {
        console.log(`\n☠️  Dead Ends:`)
        deadEnds.forEach(d => console.log(`   - ${d.title}`))
      }

      db.close()
    })
}
