import type { AtlasNode, MemoryItem, ContextPack } from "./types.js"

export function buildContextPack(
  atlasNodes: AtlasNode[],
  memories: MemoryItem[],
  options: { scope?: string; maxItems?: number } = {}
): ContextPack {
  const max = options.maxItems ?? 20

  // 1. Current goal (latest open goal)
  const goal = atlasNodes
    .filter(n => n.type === "goal" && n.status === "open")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  // 2. Active decisions
  const activeDecisions = atlasNodes
    .filter(n => n.type === "decision" && n.status !== "archived" && n.status !== "stale")
    .slice(0, max)

  // 3. Dead ends
  const deadEnds = atlasNodes
    .filter(n => n.type === "dead_end" && n.status !== "archived")

  // 4. Blockers
  const blockers = atlasNodes
    .filter(n => n.type === "blocker" && n.status !== "archived")

  // 5. Open paths
  const openPaths = atlasNodes
    .filter(n => n.type === "path" && n.status === "open")
    .slice(0, max)

  // 6. Next steps
  const nextSteps = atlasNodes
    .filter(n => n.type === "next_step" && n.status === "open")
    .slice(0, 5)

  // 7. Active memories
  const activeMemories = memories
    .filter(m => m.status === "active")
    .slice(0, max)

  // 8. Excluded items
  const excludedMemories = memories.filter(m => m.status !== "active")
  const excludedNodes = atlasNodes.filter(n =>
    (n.status === "stale" || n.status === "archived") && n.type === "decision"
  )

  return {
    goal,
    activeMemories,
    activeDecisions,
    deadEnds,
    blockers,
    openPaths,
    nextSteps,
    excluded: {
      memories: excludedMemories,
      nodes: excludedNodes,
    },
  }
}

export function contextPackToText(pack: ContextPack): string {
  const lines: string[] = []

  if (pack.goal) {
    lines.push(`# Goal: ${pack.goal.title}`)
    if (pack.goal.summary) lines.push(pack.goal.summary)
    lines.push("")
  }

  if (pack.activeMemories.length > 0) {
    lines.push("## Active Memories")
    for (const m of pack.activeMemories) {
      lines.push(`- ${m.content}`)
    }
    lines.push("")
  }

  if (pack.activeDecisions.length > 0) {
    lines.push("## Decisions")
    for (const d of pack.activeDecisions) {
      lines.push(`- ${d.title}`)
      if (d.summary) lines.push(`  Reason: ${d.summary}`)
    }
    lines.push("")
  }

  if (pack.deadEnds.length > 0) {
    lines.push("## Dead Ends (do not retry)")
    for (const de of pack.deadEnds) {
      lines.push(`- ☠️ ${de.title}`)
      if (de.summary) lines.push(`  ${de.summary}`)
    }
    lines.push("")
  }

  if (pack.blockers.length > 0) {
    lines.push("## Blockers")
    for (const b of pack.blockers) {
      lines.push(`- ⛔ ${b.title}`)
      if (b.summary) lines.push(`  ${b.summary}`)
    }
    lines.push("")
  }

  if (pack.openPaths.length > 0) {
    lines.push("## Open Paths")
    for (const p of pack.openPaths) {
      lines.push(`- 🧭 ${p.title}`)
    }
    lines.push("")
  }

  if (pack.nextSteps.length > 0) {
    lines.push("## Next Steps")
    pack.nextSteps.forEach((ns, i) => {
      lines.push(`${i + 1}. ${ns.title}`)
    })
    lines.push("")
  }

  if (pack.excluded.memories.length > 0 || pack.excluded.nodes.length > 0) {
    lines.push("## Excluded (stale/archived)")
    for (const m of pack.excluded.memories) {
      lines.push(`- 🕸️ ${m.content} (${m.status})`)
    }
    for (const n of pack.excluded.nodes) {
      lines.push(`- 🕸️ ${n.title} (${n.status})`)
    }
  }

  return lines.join("\n")
}
