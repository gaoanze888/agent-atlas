/**
 * Agent Atlas — pi extension
 *
 * Deep integration with pi coding agent:
 * 1. Auto-injects the Atlas context pack at the start of every agent turn
 *    (goal, decisions, dead ends, blockers, next steps) so the agent never
 *    retries failed paths or forgets decisions.
 * 2. Registers native Atlas tools (create node, mark dead end, set direction).
 * 3. /atlas command opens the visual map in the browser.
 * 4. Auto-starts the Atlas server if it's not running.
 *
 * The extension talks to the Atlas REST API on localhost. If the server is
 * down it starts one automatically (agent-atlas serve) and retries.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { spawn } from "node:child_process"
import http from "node:http"

const DEFAULT_PORT = 8765
const SERVER_START_TIMEOUT_MS = 5000

let atlasPort = DEFAULT_PORT
let serverStarting: Promise<boolean> | null = null

// ─── HTTP helpers ───

function httpGetJson(path: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port: atlasPort, path, timeout: timeoutMs },
      (res) => {
        let data = ""
        res.on("data", (c) => (data += c))
        res.on("end", () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error(`Invalid JSON from ${path}`))
          }
        })
      }
    )
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`Timeout: GET ${path}`))
    })
    req.on("error", reject)
  })
}

function httpPostJson(path: string, body: any, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request(
      {
        host: "127.0.0.1",
        port: atlasPort,
        path,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: timeoutMs,
      },
      (res) => {
        let data = ""
        res.on("data", (c) => (data += c))
        res.on("end", () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error(`Invalid JSON from POST ${path}`))
          }
        })
      }
    )
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`Timeout: POST ${path}`))
    })
    req.on("error", reject)
    req.write(payload)
    req.end()
  })
}

async function isServerUp(): Promise<boolean> {
  try {
    await httpGetJson("/api/health", 1000)
    return true
  } catch {
    return false
  }
}

/** Find the agent-atlas CLI binary. */
function findAtlasBin(): string {
  // npm link / global install puts it on PATH
  return "agent-atlas"
}

/** Start the Atlas server in the background. Resolves true when healthy. */
async function ensureServer(): Promise<boolean> {
  if (await isServerUp()) return true
  if (serverStarting) return serverStarting

  serverStarting = (async () => {
    try {
      const child = spawn(findAtlasBin(), ["serve", "--port", String(atlasPort)], {
        detached: true,
        stdio: "ignore",
      })
      child.unref()
    } catch {
      return false
    }
    // Poll for health
    const deadline = Date.now() + SERVER_START_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await isServerUp()) return true
      await new Promise((r) => setTimeout(r, 250))
    }
    return false
  })()

  const ok = await serverStarting
  serverStarting = null
  return ok
}

// ─── Context pack formatting ───

function formatContextPack(pack: any): string {
  const lines: string[] = []
  lines.push("<agent-atlas-context>")
  lines.push("Current exploration state from Agent Atlas (visual map at /atlas):")

  if (pack.goal) {
    lines.push(`- Active goal: ${pack.goal.title}`)
  }

  if (pack.activeMemories?.length) {
    lines.push("- Key memories:")
    for (const m of pack.activeMemories.slice(0, 8)) {
      lines.push(`  · ${m.content}`)
    }
  }

  if (pack.activeDecisions?.length) {
    lines.push("- Decisions already made (do not re-litigate):")
    for (const d of pack.activeDecisions.slice(0, 8)) {
      lines.push(`  · ${d.title}`)
    }
  }

  if (pack.deadEnds?.length) {
    lines.push("- DEAD ENDS — approaches already tried and failed, do NOT retry:")
    for (const d of pack.deadEnds.slice(0, 8)) {
      lines.push(`  · ${d.title}${d.summary ? ` (${d.summary})` : ""}`)
    }
  }

  if (pack.blockers?.length) {
    lines.push("- Known blockers:")
    for (const b of pack.blockers.slice(0, 5)) {
      lines.push(`  · ${b.title}`)
    }
  }

  if (pack.openPaths?.length) {
    lines.push("- Open exploration paths:")
    for (const p of pack.openPaths.slice(0, 5)) {
      lines.push(`  · ${p.title} [${p.status}]`)
    }
  }

  if (pack.nextSteps?.length) {
    lines.push("- Current direction:")
    for (const ns of pack.nextSteps.slice(0, 3)) {
      lines.push(`  · ${ns.title}`)
    }
  }

  lines.push("</agent-atlas-context>")
  return lines.join("\n")
}

// ─── Extension ───

export default function agentAtlasExtension(pi: ExtensionAPI) {
  let contextEnabled = true

  // Auto-start server on session start
  pi.on("session_start", async (_event, ctx) => {
    const ok = await ensureServer()
    if (ok) {
      ctx.ui.setStatus("atlas", `atlas :${atlasPort}`)
    } else {
      ctx.ui.setStatus("atlas", "atlas offline")
    }
  })

  // Inject context pack before every agent run
  pi.on("before_agent_start", async (event, ctx) => {
    if (!contextEnabled) return
    const up = await isServerUp()
    if (!up) return

    try {
      const pack = await httpGetJson("/api/context-pack", 1500)
      const text = formatContextPack(pack)
      // Only inject if there's meaningful content (goal or any node)
      if (pack.goal || pack.deadEnds?.length || pack.activeDecisions?.length || pack.nextSteps?.length) {
        return {
          message: {
            customType: "agent-atlas-context",
            content: text,
            display: false,
          },
        }
      }
    } catch {
      // Server hiccup — skip injection silently
    }
  })

  // ─── Native tools ───

  pi.registerTool({
    name: "atlas_record_path",
    label: "Atlas: Record Path",
    description:
      "Record an exploration path/attempt in the Agent Atlas task map. Use when you start trying a new approach, or when an approach succeeds or fails. Status: open (just started), success (worked), failed (did not work).",
    promptSnippet: "Record exploration paths, successes and failures in the Atlas task map",
    promptGuidelines: [
      "Use atlas_record_path when you start a new approach, when an approach succeeds, or when it fails — this keeps the visual map current so the user can steer.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Short title of the path/approach" }),
      status: Type.Optional(StringEnum(["open", "success", "failed", "blocked"])),
      summary: Type.Optional(Type.String({ description: "What happened, evidence, why it failed" })),
      parentGoal: Type.Optional(Type.String({ description: "Title of parent goal — matched against existing goals, creates one if missing" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const up = await ensureServer()
      if (!up) {
        return { content: [{ type: "text", text: "Atlas server unavailable" }], details: { ok: false } }
      }
      try {
        // Find or create parent goal
        let parentId: string | undefined
        if (params.parentGoal) {
          const goals = await httpGetJson(`/api/nodes?type=goal&status=open`)
          const match = (Array.isArray(goals) ? goals : []).find(
            (g: any) => g.title.toLowerCase() === params.parentGoal!.toLowerCase()
          )
          if (match) {
            parentId = match.id
          } else {
            const created = await httpPostJson("/api/nodes", { type: "goal", title: params.parentGoal })
            parentId = created.id
          }
        }
        const node = await httpPostJson("/api/nodes", {
          type: "path",
          title: params.title,
          status: params.status || "open",
          summary: params.summary,
          parentId,
          agentName: "pi",
        })
        if (params.status === "failed" && params.summary) {
          await httpPostJson("/api/nodes", {
            type: "dead_end",
            title: `Dead end: ${params.title}`,
            summary: params.summary,
            parentId: node.id,
            status: "failed",
            agentName: "pi",
          })
        }
        return {
          content: [{ type: "text", text: `Recorded path "${params.title}" [${params.status || "open"}] — view at http://localhost:${atlasPort}` }],
          details: { ok: true, nodeId: node.id },
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `Atlas error: ${e.message}` }], details: { ok: false } }
      }
    },
  })

  pi.registerTool({
    name: "atlas_record_decision",
    label: "Atlas: Record Decision",
    description:
      "Record a decision or conclusion in the Agent Atlas task map. Use when you and the user settle on an approach, rule, or architecture choice that should persist across turns.",
    promptSnippet: "Record settled decisions in the Atlas task map",
    promptGuidelines: [
      "Use atlas_record_decision when the user makes a choice or a conclusion is reached that later turns must respect.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "The decision, stated as a fact" }),
      reason: Type.Optional(Type.String({ description: "Why this decision was made" })),
      parentGoal: Type.Optional(Type.String({ description: "Parent goal title" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const up = await ensureServer()
      if (!up) return { content: [{ type: "text", text: "Atlas server unavailable" }], details: { ok: false } }
      try {
        let parentId: string | undefined
        if (params.parentGoal) {
          const goals = await httpGetJson(`/api/nodes?type=goal&status=open`)
          const match = (Array.isArray(goals) ? goals : []).find(
            (g: any) => g.title.toLowerCase() === params.parentGoal!.toLowerCase()
          )
          parentId = match?.id
        }
        const node = await httpPostJson("/api/nodes", {
          type: "decision",
          title: params.title,
          summary: params.reason,
          parentId,
          agentName: "pi",
        })
        return {
          content: [{ type: "text", text: `Recorded decision: ${params.title}` }],
          details: { ok: true, nodeId: node.id },
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `Atlas error: ${e.message}` }], details: { ok: false } }
      }
    },
  })

  pi.registerTool({
    name: "atlas_set_direction",
    label: "Atlas: Set Direction",
    description:
      "Set the current direction / next step for the task. Shows in the Atlas UI direction bar. The user or agent can change it as work progresses.",
    promptSnippet: "Set the current direction shown in the Atlas direction bar",
    parameters: Type.Object({
      title: Type.String({ description: "What to focus on next" }),
      reason: Type.Optional(Type.String({ description: "Why this direction" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const up = await ensureServer()
      if (!up) return { content: [{ type: "text", text: "Atlas server unavailable" }], details: { ok: false } }
      try {
        // Archive old open next_steps
        const existing = await httpGetJson(`/api/nodes?type=next_step&status=open`)
        for (const ns of Array.isArray(existing) ? existing : []) {
          await fetch(`http://127.0.0.1:${atlasPort}/api/nodes/${ns.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "archived" }),
          })
        }
        const node = await httpPostJson("/api/nodes", {
          type: "next_step",
          title: params.title,
          summary: params.reason,
          status: "open",
          agentName: "pi",
        })
        return {
          content: [{ type: "text", text: `Direction set: ${params.title}` }],
          details: { ok: true, nodeId: node.id },
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `Atlas error: ${e.message}` }], details: { ok: false } }
      }
    },
  })

  pi.registerTool({
    name: "atlas_get_map",
    label: "Atlas: Get Map",
    description: "Get the full current Atlas state: goal, paths, decisions, dead ends, blockers, direction. Use at any point to re-ground yourself.",
    promptSnippet: "Read the full Atlas exploration map",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const up = await isServerUp()
      if (!up) return { content: [{ type: "text", text: "Atlas server unavailable" }], details: { ok: false } }
      try {
        const pack = await httpGetJson("/api/context-pack", 1500)
        return {
          content: [{ type: "text", text: formatContextPack(pack) }],
          details: { ok: true },
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `Atlas error: ${e.message}` }], details: { ok: false } }
      }
    },
  })

  // ─── Commands ───

  pi.registerCommand("atlas", {
    description: "Open the Agent Atlas visual map in your browser",
    handler: async (args, ctx) => {
      const up = await ensureServer()
      if (!up) {
        ctx.ui.notify("Atlas server failed to start", "error")
        return
      }
      const url = `http://localhost:${atlasPort}`
      const { exec } = await import("node:child_process")
      const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
      exec(`${open} ${url}`)
      ctx.ui.notify(`Atlas opened: ${url}`, "info")
    },
  })

  pi.registerCommand("atlas-off", {
    description: "Disable Atlas context injection for this session",
    handler: async (args, ctx) => {
      contextEnabled = false
      ctx.ui.setStatus("atlas", "atlas: injection off")
      ctx.ui.notify("Atlas context injection disabled", "info")
    },
  })

  pi.registerCommand("atlas-on", {
    description: "Enable Atlas context injection for this session",
    handler: async (args, ctx) => {
      contextEnabled = true
      ctx.ui.setStatus("atlas", `atlas :${atlasPort}`)
      ctx.ui.notify("Atlas context injection enabled", "info")
    },
  })

  // Cleanup
  pi.on("session_shutdown", async () => {
    // Nothing persistent to clean — server runs independently
  })
}

// StringEnum helper (pi-ai provides this, but keep local fallback for portability)
function StringEnum<T extends string>(values: readonly T[]) {
  return { type: "string" as const, enum: [...values] }
}
