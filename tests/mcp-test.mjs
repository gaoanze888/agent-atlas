// Test MCP server via stdio protocol
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { setTimeout as sleep } from "node:timers/promises"

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/mcp/index.js"],
    env: { ...process.env, ATLAS_HOME: "/tmp/atlas-test" },
  })

  const client = new Client({ name: "test-client", version: "0.1.0" })
  await client.connect(transport)
  console.log("✅ MCP connected")

  // List tools
  const { tools } = await client.listTools()
  console.log(`✅ ${tools.length} tools available:`)
  tools.forEach(t => console.log(`   - ${t.name}`))

  // Create a goal
  const goalResult = await client.callTool({
    name: "atlas_create_node",
    arguments: { type: "goal", title: "Build Agent Atlas MVP", agentName: "test" },
  })
  const goal = JSON.parse(goalResult.content[0].text)
  console.log(`✅ Created goal: ${goal.id} — ${goal.title}`)

  // Create a path
  const pathResult = await client.callTool({
    name: "atlas_create_node",
    arguments: { type: "path", title: "Implement MCP server", parentId: goal.id, status: "success" },
  })
  const pathNode = JSON.parse(pathResult.content[0].text)
  console.log(`✅ Created path: ${pathNode.id} — ${pathNode.title}`)

  // Add evidence
  const evResult = await client.callTool({
    name: "atlas_add_evidence",
    arguments: { nodeId: pathNode.id, kind: "test", summary: "MCP protocol communication verified", ref: "mcp-test.mjs" },
  })
  console.log(`✅ Added evidence`)

  // Create a dead end
  const deResult = await client.callTool({
    name: "atlas_create_node",
    arguments: { type: "path", title: "PR triage tool idea", parentId: goal.id, status: "failed" },
  })
  const deNode = JSON.parse(deResult.content[0].text)
  
  const markResult = await client.callTool({
    name: "atlas_mark_dead_end",
    arguments: { nodeId: deNode.id, reason: "Value too small for AI infrastructure direction" },
  })
  console.log(`✅ Marked dead end: ${deNode.title}`)

  // Create a decision
  const decResult = await client.callTool({
    name: "atlas_create_node",
    arguments: { type: "decision", title: "Product design before tech design", parentId: goal.id },
  })
  console.log(`✅ Created decision`)

  // Set direction
  const dirResult = await client.callTool({
    name: "atlas_set_direction",
    arguments: { title: "Complete product design and interaction spec", reason: "User requested design-first approach" },
  })
  console.log(`✅ Set direction`)

  // Get context pack
  const packResult = await client.callTool({
    name: "atlas_get_context_pack",
    arguments: {},
  })
  console.log(`\n📋 Context Pack:\n${packResult.content[0].text}`)

  // List nodes
  const listResult = await client.callTool({
    name: "atlas_list_nodes",
    arguments: {},
  })
  const allNodes = JSON.parse(listResult.content[0].text)
  console.log(`\n✅ Total nodes: ${allNodes.length}`)

  // Search
  const searchResult = await client.callTool({
    name: "atlas_search",
    arguments: { query: "MCP" },
  })
  const searchNodes = JSON.parse(searchResult.content[0].text)
  console.log(`✅ Search "MCP": ${searchNodes.length} results`)

  await client.close()
  console.log("\n✅ All MCP tests passed!")
}

main().catch(err => {
  console.error("❌ MCP test failed:", err.message)
  process.exit(1)
})
