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

test('schema v4: bảng ca, ngày lễ, cột shift_id, early_arrival_minutes, final, end_date', () => {
  const db = openDb(':memory:');
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  for (const c of ['hanet_sync_status', 'hanet_sync_error', 'face_error', 'email_status', 'email_error', 'shift_id']) assert.ok(cols('users').includes(c), `users thiếu ${c}`);
  for (const c of ['hanet_department_id', 'area_id', 'shift_id']) assert.ok(cols('departments').includes(c), `departments thiếu ${c}`);
  for (const c of ['online', 'status_checked_at', 'area_id']) assert.ok(cols('cameras').includes(c), `cameras thiếu ${c}`);
  for (const c of ['id', 'code', 'name', 'note', 'created_at']) assert.ok(cols('areas').includes(c), `areas thiếu ${c}`);
  for (const c of ['user_id', 'area_id']) assert.ok(cols('admin_areas').includes(c), `admin_areas thiếu ${c}`);
  for (const c of ['user_id', 'kind', 'to_email', 'status', 'attempts', 'last_error', 'payload', 'next_run_at', 'created_at', 'sent_at']) {
    assert.ok(cols('email_jobs').includes(c), `email_jobs thiếu ${c}`);
  }
  for (const c of ['token_hash', 'user_id', 'expires_at', 'used_at']) assert.ok(cols('password_resets').includes(c), `password_resets thiếu ${c}`);
  for (const c of ['early_arrival_minutes', 'final']) assert.ok(cols('attendance_days').includes(c), `attendance_days thiếu ${c}`);
  for (const c of ['end_date']) assert.ok(cols('requests').includes(c), `requests thiếu ${c}`);
  for (const t of ['sync_jobs', 'face_sightings', 'shifts', 'holidays']) assert.ok(cols(t).length > 0, `thiếu bảng ${t}`);
  assert.equal(SCHEMA_VERSION, 4);
  assert.equal((db.prepare('SELECT version FROM schema_version').get() as { version: number }).version, 4);
});

test('schema v3: vai trò area_admin hợp lệ, email không trùng (không phân biệt hoa thường), khu còn phòng ban thì không xóa được', () => {
  const db = openDb(':memory:');
  const add = (id: string, code: string, role: string, email: string) =>
    db.prepare(`INSERT INTO users(id, code, name, email, role, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', '2026-10-14')`).run(id, code, code, email, role);
  add('u1', 'A1', 'area_admin', 'an@test.vn');
  add('u2', 'A2', 'employee', '');
  add('u3', 'A3', 'employee', '');
  assert.throws(() => add('u4', 'A4', 'employee', 'AN@test.vn'), /UNIQUE/);
  assert.throws(() => add('u5', 'A5', 'superuser', 'x@test.vn'), /CHECK/);
  db.prepare("INSERT INTO areas(id, code, name, created_at) VALUES ('ar1', 'KV01', 'Trụ sở', '2026-10-14')").run();
  db.prepare("INSERT INTO departments(id, code, name, area_id, created_at) VALUES ('d1', 'PB001', 'Kế toán', 'ar1', '2026-10-14')").run();
  assert.throws(() => db.prepare("DELETE FROM areas WHERE id = 'ar1'").run(), /FOREIGN KEY/);
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
