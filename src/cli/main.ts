import { Command } from "commander"
import { registerCommands } from "./index.js"

const program = new Command()
  .name("agent-atlas")
  .description("A visual state map for AI agents — see what your agent remembers, tried, decided, and plans next.")
  .version("0.1.0")

registerCommands(program)
program.parse()
