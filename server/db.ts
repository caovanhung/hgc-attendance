import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Nạp node:sqlite lúc chạy (không phải import tĩnh) để check-node.ts kịp báo lỗi trên Node cũ.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export type Db = DatabaseSyncType;

export const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  hanet_department_id TEXT,
  hanet_sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (hanet_sync_status IN ('synced', 'pending', 'error')),
  hanet_sync_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('hr', 'dept_manager', 'employee')),
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  position TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  hanet_person_id TEXT,
  face_registered INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  password_hash TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  hanet_sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (hanet_sync_status IN ('synced', 'pending', 'error')),
  hanet_sync_error TEXT,
  face_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_hanet_person ON users(hanet_person_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_key TEXT UNIQUE NOT NULL,
  place_id INTEGER,
  place_name TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  online INTEGER,
  status_checked_at INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hanet_person_id TEXT,
  device_id TEXT NOT NULL,
  device_name TEXT,
  place_id INTEGER,
  ts INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  image_url TEXT,
  source TEXT NOT NULL CHECK (source IN ('webhook', 'reconcile', 'simulator')),
  UNIQUE (user_id, device_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_detections_user_date ON detections(user_id, work_date);

CREATE TABLE IF NOT EXISTS attendance_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  first_in INTEGER NOT NULL,
  last_out INTEGER,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('on_time', 'late', 'early_leave', 'late_and_early', 'missing_out')),
  late_excused INTEGER NOT NULL DEFAULT 0,
  manual_in INTEGER,
  manual_out INTEGER,
  detection_count INTEGER NOT NULL,
  PRIMARY KEY (user_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_days_date ON attendance_days(work_date);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('missed_punch', 'late_explanation', 'leave_request')),
  reason TEXT NOT NULL,
  suggested_in TEXT,
  suggested_out TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'ignored', 'duplicate', 'rejected', 'error')),
  person_name TEXT,
  device_name TEXT,
  message TEXT,
  raw_payload TEXT
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'department', 'camera')),
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'error', 'done')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_due ON sync_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_jobs(entity_type, entity_id, id);

CREATE TABLE IF NOT EXISTS face_sightings (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('stranger', 'unlinked')),
  person_id TEXT,
  alias_id TEXT,
  person_name TEXT,
  device_id TEXT NOT NULL,
  device_name TEXT,
  ts INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sightings_created ON face_sightings(created_at);
`;

export class SchemaVersionError extends Error {
  constructor(public found: number) {
    super(`[STARTUP] Database phiên bản cũ (v${found}). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.`);
  }
}

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  // Kiểm tra phiên bản TRƯỚC khi chạy SCHEMA: không đụng vào DB cũ (không có migration).
  const hasVersionTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'").get();
  const found = hasVersionTable ? (db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined) : undefined;
  if (found && found.version !== SCHEMA_VERSION) {
    db.close();
    throw new SchemaVersionError(found.version);
  }
  db.exec(SCHEMA);
  if (!found) db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(SCHEMA_VERSION);
  return db;
}

/** Chạy fn trong một transaction; nếu đã ở trong transaction thì chạy thẳng. */
export function tx<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`;
}
