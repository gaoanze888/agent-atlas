import Database from "better-sqlite3"
import { SCHEMA_V1 } from "./schema.js"
import path from "node:path"
import fs from "node:fs"

const ATLAS_DIR = () => {
  const base = process.env.ATLAS_HOME || path.join(process.env.HOME || "/tmp", ".agent-atlas")
  return base
}

export function getDbPath(): string {
  const dir = ATLAS_DIR()
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "atlas.db")
}

let _db: Database.Database | null = null

export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db
  const p = dbPath || getDbPath()
  _db = new Database(p)
  _db.pragma("journal_mode = WAL")
  _db.pragma("foreign_keys = ON")
  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

export function initDb(dbPath?: string): Database.Database {
  const db = getDb(dbPath)
  db.exec(SCHEMA_V1)
  return db
}
