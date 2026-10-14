import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { openDb, SchemaTooNewError, SCHEMA_VERSION } from '../server/db';
import { MigrationError } from '../server/migrations';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
const V3 = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'schema-v3.sql'), 'utf8');
const NOW = Date.UTC(2026, 9, 14, 3, 0); // 10:00 ngày 14/10 giờ Việt Nam

/** Tạo một file DB v3 có dữ liệu mẫu; trả đường dẫn. */
function makeV3(extra?: (raw: InstanceType<typeof DatabaseSync>) => void): { file: string; backupDir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-mig-'));
  const file = path.join(dir, 'attendance.db');
  const raw = new DatabaseSync(file);
  raw.exec(V3);
  raw.exec(`
    INSERT INTO schema_version(version) VALUES (3);
    INSERT INTO areas(id, code, name, created_at) VALUES ('ar1', 'KV01', 'Trụ sở', '2026-10-01');
    INSERT INTO departments(id, code, name, area_id, created_at) VALUES ('d1', 'PB001', 'Kế toán', 'ar1', '2026-10-01');
    INSERT INTO users(id, code, name, email, role, department_id, status, password_hash, created_at)
      VALUES ('u1', 'NV0001', 'Nguyễn Văn An', 'an@test.vn', 'employee', 'd1', 'active', 'scrypt$x$y', '2026-10-01');
    INSERT INTO detections(user_id, device_id, ts, work_date, source) VALUES ('u1', 'DEV1', 1791853200000, '2026-10-13', 'webhook');
    INSERT INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, status, detection_count)
      VALUES ('u1', '2026-10-13', 1791853200000, NULL, 0, 0, 'missing_out', 1),
             ('u1', '2026-10-14', 1791939600000, NULL, 0, 0, 'missing_out', 1);
    INSERT INTO requests(id, user_id, work_date, type, reason, status, created_at)
      VALUES ('r1', 'u1', '2026-10-13', 'leave_request', 'Ốm', 'pending', '2026-10-13T01:00:00Z');
    INSERT INTO email_jobs(user_id, kind, to_email, status, next_run_at, created_at) VALUES ('u1', 'welcome', 'an@test.vn', 'sent', 1, 1);
  `);
  extra?.(raw);
  raw.close();
  return { file, backupDir: path.join(dir, 'backups') };
}

const cols = (db: { prepare: (s: string) => { all: () => unknown[] } }, t: string) =>
  (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string; notnull: number }[]).map((c) => `${c.name}:${c.notnull}`).sort();

test('nâng cấp v3 → v4: giữ nguyên dữ liệu, thêm bảng/cột, sao lưu trước, mở lại không nâng cấp lại', () => {
  const { file, backupDir } = makeV3();
  const db = openDb(file, { backupDir, now: () => NOW });
  assert.equal(SCHEMA_VERSION, 4);
  assert.equal((db.prepare('SELECT version FROM schema_version').get() as { version: number }).version, 4);
  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
  assert.deepEqual(['areas', 'departments', 'users', 'detections', 'attendance_days', 'requests', 'email_jobs'].map(count), [1, 1, 1, 1, 2, 1, 1]);
  const days = db.prepare('SELECT work_date, status, early_arrival_minutes, final FROM attendance_days ORDER BY work_date').all() as Record<string, unknown>[];
  assert.deepEqual(days.map((d) => ({ ...d })), [
    { work_date: '2026-10-13', status: 'missing_out', early_arrival_minutes: 0, final: 1 },
    { work_date: '2026-10-14', status: 'missing_out', early_arrival_minutes: 0, final: 0 },
  ]);
  assert.equal((db.prepare("SELECT end_date FROM requests WHERE id = 'r1'").get() as { end_date: string | null }).end_date, null);
  assert.equal((db.prepare("SELECT value FROM settings WHERE key = 'work_days'").get() as { value: string }).value, '1,2,3,4,5');
  assert.equal((db.prepare("SELECT shift_id FROM users WHERE id = 'u1'").get() as { shift_id: string | null }).shift_id, null);
  const backups = fs.readdirSync(backupDir);
  assert.equal(backups.length, 1);
  assert.equal(backups[0], 'attendance-pre-migrate-v3.db');
  db.close();
  openDb(file, { backupDir, now: () => NOW }).close();
  assert.equal(fs.readdirSync(backupDir).length, 1, 'mở lại không sao lưu/nâng cấp lại');
});

test('bảng sau nâng cấp có cùng cột như DB v4 tạo mới', () => {
  const { file, backupDir } = makeV3();
  const migrated = openDb(file, { backupDir, now: () => NOW });
  const fresh = openDb(':memory:');
  for (const t of ['attendance_days', 'requests', 'users', 'departments', 'shifts', 'holidays']) {
    assert.deepEqual(cols(migrated, t), cols(fresh, t), t);
  }
  // ràng buộc mới có hiệu lực
  migrated.prepare("INSERT INTO attendance_days(user_id, work_date, first_in, status, detection_count) VALUES ('u1', '2026-10-12', NULL, 'absent', 0)").run();
  assert.throws(() => migrated.prepare("INSERT INTO attendance_days(user_id, work_date, status, detection_count) VALUES ('u1', '2026-10-11', 'xyz', 0)").run(), /CHECK/);
});

test('nâng cấp lỗi (dữ liệu khóa ngoại hỏng) ⇒ hoàn tác, DB giữ nguyên v3, báo lỗi kèm tên sao lưu', () => {
  const { file, backupDir } = makeV3((raw) => {
    raw.exec("PRAGMA foreign_keys = OFF; INSERT INTO attendance_days(user_id, work_date, first_in, status, detection_count) VALUES ('khong-co', '2026-10-10', 1, 'on_time', 1);");
  });
  assert.throws(
    () => openDb(file, { backupDir, now: () => NOW }),
    (e: unknown) => e instanceof MigrationError && /\[MIGRATE\] Nâng cấp v3 → v4 thất bại/.test(e.message) && e.backup !== null,
  );
  const raw = new DatabaseSync(file);
  assert.equal((raw.prepare('SELECT version FROM schema_version').get() as { version: number }).version, 3);
  assert.equal(raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'shifts'").get(), undefined);
  raw.close();
});

test('nâng cấp lỗi hai lần ⇒ chỉ một file sao lưu pre-migrate, dùng lại tên đó trong thông báo', () => {
  const { file, backupDir } = makeV3((raw) => {
    raw.exec("PRAGMA foreign_keys = OFF; INSERT INTO attendance_days(user_id, work_date, first_in, status, detection_count) VALUES ('khong-co', '2026-10-10', 1, 'on_time', 1);");
  });
  for (let i = 0; i < 2; i++) {
    assert.throws(
      () => openDb(file, { backupDir, now: () => NOW + i * 60_000 }),
      (e: unknown) => e instanceof MigrationError && e.backup === 'attendance-pre-migrate-v3.db' && e.message.includes('attendance-pre-migrate-v3.db'),
    );
  }
  assert.deepEqual(fs.readdirSync(backupDir), ['attendance-pre-migrate-v3.db']);
});

test('DB phiên bản mới hơn (v5) ⇒ SchemaTooNewError, không đụng vào', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-mig-'));
  const file = path.join(dir, 'attendance.db');
  const raw = new DatabaseSync(file);
  raw.exec('CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (5);');
  raw.close();
  assert.throws(
    () => openDb(file),
    (e: unknown) => e instanceof SchemaTooNewError && e.message === '[STARTUP] Database được tạo bởi phiên bản mới hơn (v5). Hãy cập nhật code.',
  );
});
