import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
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

const V4 = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'schema-v4.sql'), 'utf8');

/** File DB v4 có dữ liệu mẫu. */
function makeV4(): { file: string; backupDir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-mig4-'));
  const file = path.join(dir, 'attendance.db');
  const raw = new DatabaseSync(file);
  raw.exec(V4);
  raw.exec(`
    INSERT INTO schema_version(version) VALUES (4);
    INSERT INTO areas(id, code, name, created_at) VALUES ('ar1', 'KV01', 'Trụ sở', '2026-10-01');
    INSERT INTO departments(id, code, name, area_id, created_at) VALUES ('d1', 'PB001', 'Kế toán', 'ar1', '2026-10-01');
    INSERT INTO users(id, code, name, email, role, department_id, status, password_hash, created_at)
      VALUES ('u1', 'NV0001', 'Nguyễn Văn An', 'an@test.vn', 'employee', 'd1', 'active', 'scrypt$x$y', '2026-10-01');
    INSERT INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, status, final, detection_count)
      VALUES ('u1', '2026-10-13', 1791853200000, NULL, 0, 0, 'absent', 1, 0);
    INSERT INTO holidays(date, name) VALUES ('2026-09-02', 'Quốc khánh');
  `);
  raw.close();
  return { file, backupDir: path.join(dir, 'backups') };
}

test('nâng cấp v4 → v5: giữ dữ liệu, thêm 3 bảng, sao lưu attendance-pre-migrate-v4.db', () => {
  const { file, backupDir } = makeV4();
  const db = openDb(file, { backupDir, now: () => NOW });
  assert.equal((db.prepare('SELECT version FROM schema_version').get() as { version: number }).version, SCHEMA_VERSION);
  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
  assert.deepEqual(['areas', 'departments', 'users', 'attendance_days', 'holidays'].map(count), [1, 1, 1, 1, 1]);
  for (const t of ['attendance_overrides', 'audit_logs', 'month_locks']) assert.equal(count(t), 0);
  assert.deepEqual(cols(db, 'attendance_overrides'), [
    'created_at:1', 'created_by:1', 'created_by_label:1', 'first_in:0', 'kind:1', 'last_out:0', 'reason:1', 'user_id:1', 'work_date:1',
  ]);
  assert.deepEqual(cols(db, 'month_locks'), ['locked_at:1', 'locked_by:1', 'locked_by_label:1', 'month:0']);
  assert.ok(cols(db, 'audit_logs').includes('before_json:0'));
  assert.deepEqual(fs.readdirSync(backupDir), ['attendance-pre-migrate-v4.db']);
  db.close();
});

test('nâng cấp v3 → v5 (qua v4): giữ nguyên dữ liệu, thêm bảng/cột, sao lưu trước, mở lại không nâng cấp lại', () => {
  const { file, backupDir } = makeV3();
  const db = openDb(file, { backupDir, now: () => NOW });
  assert.equal(SCHEMA_VERSION, 5);
  assert.equal((db.prepare('SELECT version FROM schema_version').get() as { version: number }).version, SCHEMA_VERSION);
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

test('bảng sau nâng cấp có cùng cột như DB tạo mới', () => {
  const { file, backupDir } = makeV3();
  const migrated = openDb(file, { backupDir, now: () => NOW });
  const fresh = openDb(':memory:');
  for (const t of ['attendance_days', 'requests', 'users', 'departments', 'shifts', 'holidays', 'attendance_overrides', 'audit_logs', 'month_locks']) {
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
    (e: unknown) => e instanceof MigrationError && /\[MIGRATE\] Nâng cấp v3 → v5 thất bại/.test(e.message) && e.backup !== null,
  );
  const raw = new DatabaseSync(file);
  assert.equal((raw.prepare('SELECT version FROM schema_version').get() as { version: number }).version, 3);
  assert.equal(raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'shifts'").get(), undefined);
  raw.close();
});

test('nâng cấp lỗi hai lần ⇒ vẫn một file sao lưu pre-migrate, được làm mới mỗi lần thử', () => {
  const { file, backupDir } = makeV3((raw) => {
    raw.exec("PRAGMA foreign_keys = OFF; INSERT INTO attendance_days(user_id, work_date, first_in, status, detection_count) VALUES ('khong-co', '2026-10-10', 1, 'on_time', 1);");
  });
  const attempt = (i: number) =>
    assert.throws(
      () => openDb(file, { backupDir, now: () => NOW + i * 60_000 }),
      (e: unknown) => e instanceof MigrationError && e.backup === 'attendance-pre-migrate-v3.db' && e.message.includes('attendance-pre-migrate-v3.db'),
    );
  const areasInBackup = () => {
    const b = new DatabaseSync(path.join(backupDir, 'attendance-pre-migrate-v3.db'));
    const n = (b.prepare('SELECT COUNT(*) AS c FROM areas').get() as { c: number }).c;
    b.close();
    return n;
  };
  attempt(0);
  assert.equal(areasInBackup(), 1);
  // Dữ liệu đổi giữa hai lần thử (vd. chạy lại bản cũ vài ngày) ⇒ lần sau phải làm mới bản sao lưu
  const raw = new DatabaseSync(file);
  raw.exec("INSERT INTO areas(id, code, name, created_at) VALUES ('ar2', 'KV02', 'Kho', '2026-10-02')");
  raw.close();
  fs.writeFileSync(path.join(backupDir, 'attendance-pre-migrate-v3.db.tmp'), 'rác từ lần trước');
  attempt(1);
  assert.equal(areasInBackup(), 2, 'bản sao lưu được làm mới');
  assert.deepEqual(fs.readdirSync(backupDir), ['attendance-pre-migrate-v3.db'], 'một file, không còn .tmp');
});

test('DB phiên bản mới hơn (v6) ⇒ SchemaTooNewError, không đụng vào', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-mig-'));
  const file = path.join(dir, 'attendance.db');
  const raw = new DatabaseSync(file);
  raw.exec('CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (6);');
  raw.close();
  assert.throws(
    () => openDb(file),
    (e: unknown) => e instanceof SchemaTooNewError && e.message === '[STARTUP] Database được tạo bởi phiên bản mới hơn (v6). Hãy cập nhật code.',
  );
});

/** Chạy `tsx server/index.ts` trong một thư mục tạm (lỡ khởi động thật thì cũng không đụng data/ của repo). */
function runServer(env: Record<string, string | undefined>) {
  const root = path.join(import.meta.dirname, '..');
  const merged: NodeJS.ProcessEnv = { ...process.env, PORT: '1', ...env };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete merged[k];
  return spawnSync(path.join(root, 'node_modules', '.bin', 'tsx'), [path.join(root, 'server', 'index.ts')], {
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-run-')),
    env: merged,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('MIGRATE_ONLY=1: chạy thử nâng cấp trên bản sao DB_FILE rồi thoát 0, không khởi động server', () => {
  const { file } = makeV3();
  const r = runServer({ MIGRATE_ONLY: '1', DB_FILE: file });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\[MIGRATE\] Chạy thử xong: database v5/);
  assert.ok(fs.existsSync(path.join(path.dirname(file), 'backups', 'attendance-pre-migrate-v3.db')), 'sao lưu cạnh file DB');
  const raw = new DatabaseSync(file);
  assert.equal((raw.prepare('SELECT version FROM schema_version').get() as { version: number }).version, 5);
  raw.close();
});

test('MIGRATE_ONLY=1 mà thiếu DB_FILE ⇒ thoát 1', () => {
  const r = runServer({ MIGRATE_ONLY: '1', DB_FILE: undefined });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /DB_FILE/);
});

test('MIGRATE_ONLY=1 với DB_FILE không tồn tại ⇒ thoát 1, không tạo DB mới', () => {
  const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-mig-')), 'khong-co.db');
  const r = runServer({ MIGRATE_ONLY: '1', DB_FILE: missing });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(r.stderr.includes(`[MIGRATE] Không tìm thấy file database: ${missing}`), r.stderr);
  assert.equal(fs.existsSync(missing), false);
});
