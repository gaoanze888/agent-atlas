import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    "cli/index": "src/cli/main.ts",
    "mcp/index": "src/mcp/server.ts",
  },
  format: ["esm"],
  target: "node22",
  splitting: false,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
})
