import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, tx, newId, SchemaVersionError, SCHEMA_VERSION } from '../server/db';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('openDb tạo đủ bảng và bật foreign_keys', () => {
  const db = openDb(':memory:');
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
  for (const t of ['attendance_days', 'cameras', 'departments', 'detections', 'requests', 'schema_version', 'sessions', 'settings', 'users', 'webhook_logs']) {
    assert.ok(tables.includes(t), `thiếu bảng ${t}`);
  }
  assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
});

test('openDb mở lại cùng file không lỗi và giữ dữ liệu', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-db-'));
  const file = path.join(dir, 'sub', 'attendance.db');
  const db1 = openDb(file);
  db1.prepare("INSERT INTO settings(key, value) VALUES ('k', 'v')").run();
  db1.close();
  const db2 = openDb(file);
  assert.equal((db2.prepare("SELECT value FROM settings WHERE key = 'k'").get() as { value: string }).value, 'v');
  assert.equal((db2.prepare('SELECT COUNT(*) AS c FROM schema_version').get() as { c: number }).c, 1);
  db2.close();
});

test('tx rollback khi hàm ném lỗi', () => {
  const db = openDb(':memory:');
  assert.throws(() =>
    tx(db, () => {
      db.prepare("INSERT INTO settings(key, value) VALUES ('a', '1')").run();
      throw new Error('boom');
    }),
  );
  assert.equal(db.prepare("SELECT 1 FROM settings WHERE key = 'a'").get(), undefined);
});

test('tx lồng nhau chạy trong transaction ngoài', () => {
  const db = openDb(':memory:');
  tx(db, () => tx(db, () => db.prepare("INSERT INTO settings(key, value) VALUES ('b', '2')").run()));
  assert.ok(db.prepare("SELECT 1 FROM settings WHERE key = 'b'").get());
});

test('newId có prefix và không trùng', () => {
  const a = newId('usr');
  const b = newId('usr');
  assert.match(a, /^usr-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

test('schema v2: có bảng sync_jobs, face_sightings và các cột mới', () => {
  const db = openDb(':memory:');
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  for (const c of ['hanet_sync_status', 'hanet_sync_error', 'face_error']) assert.ok(cols('users').includes(c), `users thiếu ${c}`);
  for (const c of ['hanet_department_id', 'hanet_sync_status', 'hanet_sync_error']) assert.ok(cols('departments').includes(c), `departments thiếu ${c}`);
  for (const c of ['online', 'status_checked_at']) assert.ok(cols('cameras').includes(c), `cameras thiếu ${c}`);
  for (const c of ['entity_type', 'entity_id', 'op', 'payload', 'status', 'attempts', 'next_run_at', 'last_error']) {
    assert.ok(cols('sync_jobs').includes(c), `sync_jobs thiếu ${c}`);
  }
  for (const c of ['kind', 'person_id', 'alias_id', 'image_url', 'created_at']) assert.ok(cols('face_sightings').includes(c), `face_sightings thiếu ${c}`);
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal((db.prepare('SELECT version FROM schema_version').get() as { version: number }).version, 2);
});

test('database phiên bản cũ: openDb báo SchemaVersionError và không tạo bảng mới', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-db-'));
  const file = path.join(dir, 'attendance.db');
  const db1 = openDb(file);
  db1.prepare('UPDATE schema_version SET version = 1').run();
  db1.exec('DROP TABLE sync_jobs');
  db1.close();
  assert.throws(
    () => openDb(file),
    (err: unknown) =>
      err instanceof SchemaVersionError &&
      err.found === 1 &&
      err.message === '[STARTUP] Database phiên bản cũ (v1). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.',
  );
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'sync_jobs'").get(), undefined, 'không được tự tạo bảng trên DB cũ');
  raw.close();
});
