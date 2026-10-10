import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

async function main() {
  const transport = new StdioClientTransport({
    command: "agent-atlas",
    args: ["mcp"],
    env: { ...process.env, ATLAS_HOME: "/tmp/atlas-test" },
  })
  const client = new Client({ name: "pi-test", version: "1.0" })
  await client.connect(transport)
  
  const { tools } = await client.listTools()
  console.log(`✅ Global agent-atlas mcp: ${tools.length} tools`)
  
  // Quick write test
  const r = await client.callTool({
    name: "atlas_create_node",
    arguments: { type: "next_step", title: "Test from global CLI", status: "open" },
  })
  console.log(`✅ Write test: ${JSON.parse(r.content[0].text).id}`)
  
  // Context pack
  const cp = await client.callTool({ name: "atlas_get_context_pack", arguments: {} })
  console.log(`✅ Context pack received (${cp.content[0].text.length} chars)`)
  
  await client.close()
  console.log("✅ Global CLI MCP test passed!")
}
main().catch(e => { console.error("❌", e.message); process.exit(1) })
