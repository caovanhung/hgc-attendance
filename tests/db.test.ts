import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, tx, newId } from '../server/db';

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
