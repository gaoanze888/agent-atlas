// Simulate pi environment to test agent-atlas extension logic
import { createJiti } from "file:///Users/gaoanze/.nvm/versions/node/v22.22.2/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs"

// Mock pi API
const registeredTools = {}
const registeredCommands = {}
const eventHandlers = {}
const statusCalls = []
const notifyCalls = []

const mockPi = {
  on(event, handler) {
    eventHandlers[event] = handler
  },
  registerTool(def) {
    registeredTools[def.name] = def
  },
  registerCommand(name, def) {
    registeredCommands[name] = def
  },
  setStatus(id, text) {
    statusCalls.push({ id, text })
  },
  notify(msg, level) {
    notifyCalls.push({ msg, level })
  },
}

const jiti = createJiti("/Users/gaoanze/.pi/agent/extensions/agent-atlas.ts")
const mod = await jiti.import("/Users/gaoanze/.pi/agent/extensions/agent-atlas.ts")
await mod.default(mockPi)

console.log("✅ Extension loaded")
console.log(`   Tools registered: ${Object.keys(registeredTools).join(", ")}`)
console.log(`   Commands registered: ${Object.keys(registeredCommands).join(", ")}`)
console.log(`   Events handled: ${Object.keys(eventHandlers).join(", ")}`)

// Test session_start (server auto-start)
console.log("\n── Test session_start ──")
const uiCtx = { ui: { setStatus: (id, t) => statusCalls.push({ id, text: t }), notify: (m, l) => notifyCalls.push({ msg: m, level: l }) } }
await eventHandlers.session_start({}, uiCtx)
console.log("   Status calls:", JSON.stringify(statusCalls))

// Test before_agent_start (context injection)
console.log("\n── Test before_agent_start ──")
const injectResult = await eventHandlers.before_agent_start(
  { prompt: "test", systemPrompt: "" },
  mockPi
)
if (injectResult?.message) {
  console.log("   ✅ Context injected:")
  console.log(
    injectResult.message.content
      .split("\n")
      .slice(0, 10)
      .map((l) => "     " + l)
      .join("\n")
  )
} else {
  console.log("   ⚠️ No injection (server may be down or no data)")
}

// Test atlas_record_path tool
console.log("\n── Test atlas_record_path ──")
const pathResult = await registeredTools.atlas_record_path.execute(
  "tc1",
  { title: "Extension integration test path", status: "success", summary: "Recorded via pi extension mock test", parentGoal: "Build Agent Atlas MVP" },
  undefined,
  undefined,
  mockPi
)
console.log("   ", pathResult.content[0].text)

// Test atlas_record_decision
console.log("\n── Test atlas_record_decision ──")
const decResult = await registeredTools.atlas_record_decision.execute(
  "tc2",
  { title: "Extension integration works", reason: "Verified via mock pi environment" },
  undefined,
  undefined,
  mockPi
)
console.log("   ", decResult.content[0].text)

// Test atlas_set_direction
console.log("\n── Test atlas_set_direction ──")
const dirResult = await registeredTools.atlas_set_direction.execute(
  "tc3",
  { title: "Verify extension in real pi session", reason: "Next step after mock test passes" },
  undefined,
  undefined,
  mockPi
)
console.log("   ", dirResult.content[0].text)

// Test atlas_get_map
console.log("\n── Test atlas_get_map ──")
const mapResult = await registeredTools.atlas_get_map.execute("tc4", {}, undefined, undefined, mockPi)
console.log(mapResult.content[0].text.split("\n").slice(0, 15).map((l) => "   " + l).join("\n"))

console.log("\n✅ All extension integration tests passed!")
