import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export const DRIZZLE_TOKEN = 'DRIZZLE_DB'

function getDataDir(): string {
  const isPackaged = !!(process as any).pkg
  const root = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '../..')
  const dir = path.join(root, 'data')
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir, { recursive: true })
  return dir
}

export const drizzleProvider = {
  provide: DRIZZLE_TOKEN,
  useFactory: () => {
    const dbPath = path.join(getDataDir(), 'farm.db')
    const sqlite = new Database(dbPath)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')

    const db = drizzle(sqlite, { schema })

    // Auto-create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        uin TEXT DEFAULT '',
        qq TEXT DEFAULT '',
        name TEXT DEFAULT '',
        nick TEXT DEFAULT '',
        platform TEXT DEFAULT 'qq',
        code TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        login_type TEXT DEFAULT 'qr',
        running INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS account_configs (
        account_id TEXT PRIMARY KEY,
        automation TEXT DEFAULT '{}',
        planting_strategy TEXT DEFAULT 'preferred',
        preferred_seed_id INTEGER DEFAULT 0,
        intervals TEXT DEFAULT '{}',
        friend_quiet_hours TEXT DEFAULT '{}',
        friend_blacklist TEXT DEFAULT '[]',
        steal_crop_blacklist TEXT DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS global_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT DEFAULT '',
        account_name TEXT DEFAULT '',
        tag TEXT DEFAULT '',
        module TEXT DEFAULT '',
        event TEXT DEFAULT '',
        msg TEXT DEFAULT '',
        is_warn INTEGER DEFAULT 0,
        ts INTEGER DEFAULT 0,
        meta TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS account_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT DEFAULT '',
        account_name TEXT DEFAULT '',
        action TEXT DEFAULT '',
        msg TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        ts INTEGER DEFAULT 0,
        extra TEXT DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_logs_account_id ON logs(account_id);
      CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
      CREATE INDEX IF NOT EXISTS idx_logs_account_ts ON logs(account_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_logs_account_module_event_ts ON logs(account_id, module, event, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_account_logs_ts ON account_logs(ts);
      CREATE INDEX IF NOT EXISTS idx_account_logs_account_ts ON account_logs(account_id, ts DESC);
    `)

    return db
  }
}

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>
