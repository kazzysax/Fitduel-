// SQLite storage (Node's built-in driver). One file on disk in production, in-memory
// for tests. The schema is plain SQL so it can move to Postgres when scale needs it.

import { DatabaseSync } from "node:sqlite";

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  goals TEXT NOT NULL DEFAULT '{"steps":8000,"reps":60,"activeMinutes":30}',
  onboarded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS champs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  equipped TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS activity (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  steps REAL NOT NULL DEFAULT 0,
  pushups REAL NOT NULL DEFAULT 0,
  squats REAL NOT NULL DEFAULT 0,
  active_minutes REAL NOT NULL DEFAULT 0,
  run_km REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time TEXT NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  source TEXT NOT NULL,
  flagged TEXT
);
CREATE INDEX IF NOT EXISTS workouts_user_time ON workouts(user_id, time);
CREATE TABLE IF NOT EXISTS fights (
  id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL,             -- 'duel' | 'rumble'
  seed INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  venue TEXT NOT NULL,
  title TEXT NOT NULL,
  fighters TEXT NOT NULL,         -- JSON snapshot of every fighter: enough to replay exactly
  standings TEXT NOT NULL,        -- JSON
  rumble_id INTEGER
);
CREATE INDEX IF NOT EXISTS fights_created ON fights(created_at);
CREATE TABLE IF NOT EXISTS fight_entries (
  fight_id INTEGER NOT NULL REFERENCES fights(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place INTEGER NOT NULL,
  field_size INTEGER NOT NULL,
  won INTEGER NOT NULL,
  payout_cents INTEGER NOT NULL DEFAULT 0,
  rating_before INTEGER NOT NULL,
  PRIMARY KEY (fight_id, user_id)
);
CREATE INDEX IF NOT EXISTS fight_entries_user ON fight_entries(user_id);
CREATE TABLE IF NOT EXISTS rumbles (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,             -- 'daily' | 'weekly'
  starts_at TEXT NOT NULL,
  field_size INTEGER NOT NULL,
  entry_cents INTEGER NOT NULL,
  seed_hash TEXT NOT NULL,        -- published before entries close
  seed INTEGER,                   -- revealed after the Rumble runs
  status TEXT NOT NULL,           -- 'open' | 'done'
  fight_id INTEGER,
  UNIQUE (kind, starts_at)
);
CREATE TABLE IF NOT EXISTS rumble_entries (
  rumble_id INTEGER NOT NULL REFERENCES rumbles(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entered_at TEXT NOT NULL,
  PRIMARY KEY (rumble_id, user_id)
);
CREATE TABLE IF NOT EXISTS rumble_secrets (
  rumble_id INTEGER PRIMARY KEY REFERENCES rumbles(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL           -- kept apart so it is never sent before the reveal
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  fight_id INTEGER,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at);
`;

export function openDb(path = ":memory:"): DB {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
