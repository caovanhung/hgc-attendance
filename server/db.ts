import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { SCHEMA, SCHEMA_VERSION } from './schema';
import { MIN_MIGRATABLE_VERSION, runMigrations } from './migrations';

// Nạp node:sqlite lúc chạy (không phải import tĩnh) để check-node.ts kịp báo lỗi trên Node cũ.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export type Db = DatabaseSyncType;

export { SCHEMA_VERSION } from './schema';

export class SchemaVersionError extends Error {
  constructor(public found: number) {
    super(`[STARTUP] Database phiên bản cũ (v${found}). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.`);
  }
}

export class SchemaTooNewError extends Error {
  constructor(public found: number) {
    super(`[STARTUP] Database được tạo bởi phiên bản mới hơn (v${found}). Hãy cập nhật code.`);
  }
}

export interface OpenDbOptions {
  /** Thư mục sao lưu trước khi nâng cấp; mặc định `<thư mục DB>/backups`. */
  backupDir?: string;
  now?: () => number;
}

export function openDb(file: string, opts: OpenDbOptions = {}): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const hasVersionTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'").get();
  const found = hasVersionTable ? (db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined) : undefined;
  try {
    if (found && found.version > SCHEMA_VERSION) throw new SchemaTooNewError(found.version);
    if (found && found.version < MIN_MIGRATABLE_VERSION) throw new SchemaVersionError(found.version);
    if (found && found.version < SCHEMA_VERSION) {
      runMigrations(db, file, found.version, {
        backupDir: file === ':memory:' ? null : (opts.backupDir ?? path.join(path.dirname(file), 'backups')),
        now: (opts.now ?? Date.now)(),
      });
    }
  } catch (err) {
    db.close();
    throw err;
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
