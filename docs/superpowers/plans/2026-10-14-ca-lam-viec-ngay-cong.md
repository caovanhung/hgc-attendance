# Đợt B — Ca làm việc, đi sớm, vắng mặt, nghỉ phép và công tác: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi phòng/người dùng một ca (giờ vào/ra, ngày làm, ngưỡng) theo khu; ngày công ghi đi sớm, về sớm (chốt sau giờ ra), vắng mặt, nghỉ phép, công tác; nâng cấp database v3 → v4 giữ nguyên dữ liệu.

**Architecture:** Lần đầu có migration (`server/migrations.ts`, DDL dùng chung ở `server/schema.ts`). Luật ca nằm ở `server/shifts.ts` (`effectiveShift`, ngày làm việc, ngày lễ). Bộ tính công `server/attendance.ts` nhận thêm "đã qua giờ ra chưa" (`closed`), đơn nghỉ đã duyệt và ngày làm việc để quyết định trạng thái; một job 15 phút "đóng ngày" để ghi vắng và chốt về sớm.

**Tech Stack:** Node ≥ 22.13 (`node:sqlite`), Express 4, React 19 + Vite + Tailwind 4, TypeScript, `node:test` qua `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-14-ca-lam-viec-ngay-cong-design.md`

## Global Constraints

- **Có migration, không xóa dữ liệu.** `SCHEMA_VERSION = 4`. DB v3 tự nâng cấp khi mở (sao lưu trước bằng `VACUUM INTO`); DB < v3 giữ thông báo `[STARTUP] Database phiên bản cũ (v<n>). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` và thoát mã 1; DB > v4 in `[STARTUP] Database được tạo bởi phiên bản mới hơn (v<n>). Hãy cập nhật code.` và thoát mã 1.
- Ngày công theo **ngày lịch giờ Việt Nam** (`toVnDate`, `vnDayStart`, `vnDateTimeToTs`). Thứ trong tuần theo ISO: 1 = thứ 2 … 7 = chủ nhật.
- Ngưỡng mặc định: cho phép muộn **15**, đi sớm **15**, cho phép về sớm **10** phút. Không có tăng ca.
- Về sớm **chỉ xét khi đã qua giờ ra của ca** (`final = 1`); trong giờ làm, giờ ra là "lần quẹt gần nhất".
- Đơn nghỉ phép/công tác: tối đa **31** ngày/đơn, ngày bắt đầu ≤ hôm nay + **7**; loại đơn khác không cho ngày tương lai.
- Đổi ca/ngưỡng/gán ca ⇒ tính lại **từ ngày 1 tháng hiện tại tới hôm nay**; đổi ngày lễ ⇒ tính lại đúng ngày đó (nếu ≤ hôm nay).
- Quyền như đợt A: `requireGlobalHr`, `requireManager` + `managesArea`; ngoài phạm vi ⇒ 404.
- Chữ hiển thị tiếng Việt, không có chữ "Hanet"; nháy đơn (riêng `CamerasTab.tsx` nháy kép); không chạy prettier.
- Mỗi commit kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Trước mỗi commit: `npm test` và `npm run lint` qua. Không commit `dist/`, `server.js` trừ Task 9.

**Khác biệt có chủ ý so với spec:**
- Tính lại luôn chạy đồng bộ trong request (bỏ nhánh "chạy nền khi vượt 500 người × 31 ngày"); quy mô công ty (vài trăm người) chạy trong vài giây.
- File sao lưu trước nâng cấp đặt tên theo `backupNow` hiện có: `attendance-<ngày>-<giờ>-pre-migrate.db`.
- Ca có thêm "ngưỡng giờ ra" dùng chung từ ca mặc định (`min_out_gap_minutes`), không đặt riêng từng ca.

## Review Focus

1. Mở DB v3 thật (có dữ liệu khu, phòng, nhân sự, ngày công, đơn, thư) ⇒ nâng cấp xong mọi dòng còn nguyên, mở lại lần hai không nâng cấp lại và không tạo thêm sao lưu. Test ở Task 1.
2. Nhân viên quẹt lúc 14:30 rồi về (ca 08:00–17:00): lúc 15:00 không bị gắn "về sớm"; sau 17:00 job đóng ngày gắn về sớm 150 phút. Test ở Task 3.
3. Ngày lễ / thứ 7 của ca T2–T6 / ngày trước khi tạo tài khoản / người đã nghỉ việc ⇒ không bao giờ bị "vắng". Test ở Task 3.
4. Đơn nghỉ phép thứ 6 → thứ 2 được duyệt ⇒ chỉ thứ 6 và thứ 2 thành "Nghỉ phép"; thứ 7, chủ nhật không có dòng. Test ở Task 5.
5. Chuyển nhân sự sang phòng ở khu khác trong khi người đó có ca riêng của khu cũ ⇒ tự dùng ca của phòng mới/ca mặc định, không lỗi. Test ở Task 2.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `server/schema.ts` (mới) | `SCHEMA_VERSION`, chuỗi `SCHEMA` v4, các hàm tạo DDL bảng dùng chung cho schema và migration |
| `server/migrations.ts` (mới) | Danh sách bước nâng cấp, `runMigrations` |
| `server/db.ts` (sửa) | `openDb` gọi migration; lỗi phiên bản |
| `server/shifts.ts` (mới) | `ShiftRule`, `effectiveShift`, ngày làm việc, ngày lễ, kiểm tra dữ liệu ca |
| `server/settings.ts` (sửa) | Ca mặc định công ty thêm ngày làm, ngưỡng đi sớm/về sớm |
| `server/attendance.ts` (sửa) | `computeDay`/`recomputeDay` theo ca, vắng, nghỉ; `recomputeUsers`, `closeDays` |
| `server/routes/shifts.ts` (mới) | API ca và ngày lễ |
| `server/routes/{settings,departments,users,requests,attendance}.ts` (sửa) | Gán ca, đơn theo khoảng ngày, thống kê mới |
| `src/components/ShiftsTab.tsx` (mới) | Tab Ca làm việc (ca của khu, ca mặc định, ngày lễ) |

---

### Task 1: Schema v4 và migration v3 → v4

**Files:**
- Create: `tests/fixtures/schema-v3.sql` (ảnh chụp schema v3, tạo bằng lệnh ở Step 1)
- Create: `server/schema.ts`, `server/migrations.ts`
- Modify: `server/db.ts` (bỏ chuỗi SCHEMA sang `schema.ts`, `openDb` nhận tùy chọn, gọi migration)
- Modify: `server/backup.ts` (`BackupReason` thêm `'pre-migrate'`)
- Modify: `server/index.ts` (truyền `backupDir`, in đúng lỗi phiên bản)
- Modify: `shared/types.ts` (`DayStatus`, `RequestType`, `AttendanceDay`, `AttendanceRequest`)
- Test: `tests/migration.test.ts` (mới), `tests/db.test.ts` (sửa test schema)

**Interfaces:**
- Produces (`server/schema.ts`): `SCHEMA_VERSION = 4`; `SCHEMA: string`; `ddlShifts(ifNotExists: boolean): string`; `ddlHolidays(ifNotExists: boolean): string`; `ddlRequests(name: string, ifNotExists: boolean): string`; `ddlAttendanceDays(name: string, ifNotExists: boolean): string`.
- Produces (`server/migrations.ts`): `MIN_MIGRATABLE_VERSION = 3`; `interface Migration { from: number; run(db: Db, now: number): void }`; `MIGRATIONS: Migration[]`; `class MigrationError extends Error { backup: string | null }`; `runMigrations(db: Db, file: string, from: number, opts: { backupDir: string | null; now: number }): string | null` (trả tên file sao lưu).
- Produces (`server/db.ts`): `SCHEMA_VERSION` (re-export); `class SchemaVersionError` (giữ), `class SchemaTooNewError extends Error { found: number }`; `openDb(file: string, opts?: { backupDir?: string; now?: () => number }): Db`.
- Produces (DB v4): bảng `shifts`, `holidays`; cột `departments.shift_id`, `users.shift_id`, `requests.end_date`, `attendance_days.early_arrival_minutes`, `attendance_days.final`; `attendance_days.first_in` cho phép NULL; `attendance_days.status` thêm `absent|leave|business_trip`; `requests.type` thêm `business_trip`; settings `work_days='1,2,3,4,5'`, `early_arrival_minutes='15'`, `early_leave_minutes='10'`.
- Produces (`shared/types.ts`): `DayStatus` thêm `'absent' | 'leave' | 'business_trip'`; `RequestType` thêm `'business_trip'`; `AttendanceDay.firstIn: number | null`, thêm `earlyArrivalMinutes: number`, `final: boolean`; `AttendanceRequest.endDate: string | null`.

- [ ] **Step 1: Chụp schema v3 làm fixture (trước khi sửa `db.ts`)**

```bash
mkdir -p tests/fixtures
git show HEAD:server/db.ts | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=s.match(/const SCHEMA = \`([\s\S]*?)\`;/);if(!m)process.exit(1);process.stdout.write(m[1])})" > tests/fixtures/schema-v3.sql
grep -c "CREATE TABLE" tests/fixtures/schema-v3.sql
```

Expected: in ra số bảng (≥ 15), file không rỗng.

- [ ] **Step 2: Viết test `tests/migration.test.ts`**

```ts
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
  assert.match(backups[0], /pre-migrate\.db$/);
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
```

Trong `tests/db.test.ts`: test `'schema v3: …'` đổi `assert.equal(SCHEMA_VERSION, 3)` và giá trị version trong DB thành `4`; thêm vào danh sách cột: `for (const c of ['shift_id']) assert.ok(cols('users').includes(c))`, `cols('departments')` có `shift_id`, `cols('attendance_days')` có `early_arrival_minutes`, `final`, `cols('requests')` có `end_date`, bảng `shifts`, `holidays` tồn tại. Test `'database phiên bản cũ…'` (ghi version 1) giữ nguyên — vẫn ra `SchemaVersionError` vì 1 < 3.

- [ ] **Step 3: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/migration.test.ts`
Expected: FAIL — `SchemaTooNewError`/`MigrationError` không tồn tại; `SCHEMA_VERSION` là 3.

- [ ] **Step 4: Tạo `server/schema.ts`**

Chuyển nguyên chuỗi `SCHEMA` từ `server/db.ts` sang đây, với các thay đổi:
- Định nghĩa bảng `requests` và `attendance_days` trong `SCHEMA` thay bằng `${ddlRequests('requests', true)}` và `${ddlAttendanceDays('attendance_days', true)}`, giữ hai dòng `CREATE INDEX` đi kèm.
- `departments`: thêm `  shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT,` ngay trước `  area_id …`.
- `users`: thêm `  shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT,` ngay trước `  email_status …`.
- Cuối chuỗi thêm `${ddlShifts(true)}` và `${ddlHolidays(true)}`.

```ts
export const SCHEMA_VERSION = 4;

const ine = (b: boolean) => (b ? 'IF NOT EXISTS ' : '');

export function ddlShifts(ifNotExists: boolean): string {
  return `CREATE TABLE ${ine(ifNotExists)}shifts (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  work_start TEXT NOT NULL,
  work_end TEXT NOT NULL,
  work_days TEXT NOT NULL,
  late_grace_minutes INTEGER NOT NULL,
  early_arrival_minutes INTEGER NOT NULL,
  early_leave_minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (area_id, name)
);`;
}

export function ddlHolidays(ifNotExists: boolean): string {
  return `CREATE TABLE ${ine(ifNotExists)}holidays (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL
);`;
}

export function ddlRequests(name: string, ifNotExists: boolean): string {
  return `CREATE TABLE ${ine(ifNotExists)}${name} (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  end_date TEXT,
  type TEXT NOT NULL CHECK (type IN ('missed_punch', 'late_explanation', 'leave_request', 'business_trip')),
  reason TEXT NOT NULL,
  suggested_in TEXT,
  suggested_out TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL
);`;
}

export function ddlAttendanceDays(name: string, ifNotExists: boolean): string {
  return `CREATE TABLE ${ine(ifNotExists)}${name} (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  first_in INTEGER,
  last_out INTEGER,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_minutes INTEGER NOT NULL DEFAULT 0,
  early_arrival_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('on_time', 'late', 'early_leave', 'late_and_early', 'missing_out', 'absent', 'leave', 'business_trip')),
  final INTEGER NOT NULL DEFAULT 0,
  late_excused INTEGER NOT NULL DEFAULT 0,
  manual_in INTEGER,
  manual_out INTEGER,
  detection_count INTEGER NOT NULL,
  PRIMARY KEY (user_id, work_date)
);`;
}

export const SCHEMA = `
… (chuỗi schema v4 như mô tả ở trên) …
`;
```

(`SCHEMA` ở đây là chuỗi đầy đủ — sao chép nguyên văn từ `db.ts` rồi áp các thay đổi đã liệt kê; không để dấu "…" trong code.)

- [ ] **Step 5: Tạo `server/migrations.ts`**

```ts
import type { Db } from './db';
import { backupNow } from './backup';
import { ddlAttendanceDays, ddlHolidays, ddlRequests, ddlShifts, SCHEMA_VERSION } from './schema';
import { toVnDate } from './vntime';

export const MIN_MIGRATABLE_VERSION = 3;

export interface Migration {
  from: number;
  run: (db: Db, now: number) => void;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public backup: string | null,
  ) {
    super(message);
  }
}

/** v3 → v4: ca làm việc, ngày lễ, đơn theo khoảng ngày, ngày công vắng/nghỉ/đi sớm/đã chốt. */
function migrate3to4(db: Db, now: number): void {
  db.exec(ddlShifts(false));
  db.exec(ddlHolidays(false));
  db.exec('ALTER TABLE departments ADD COLUMN shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT');
  db.exec('ALTER TABLE users ADD COLUMN shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT');

  db.exec(ddlRequests('requests_v4', false));
  db.exec(`INSERT INTO requests_v4(id, user_id, work_date, end_date, type, reason, suggested_in, suggested_out, status, reviewed_by, reviewed_at, comment, created_at)
    SELECT id, user_id, work_date, NULL, type, reason, suggested_in, suggested_out, status, reviewed_by, reviewed_at, comment, created_at FROM requests`);
  db.exec('DROP TABLE requests');
  db.exec('ALTER TABLE requests_v4 RENAME TO requests');
  db.exec('CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id)');

  db.exec(ddlAttendanceDays('attendance_days_v4', false));
  db.prepare(
    `INSERT INTO attendance_days_v4(user_id, work_date, first_in, last_out, late_minutes, early_minutes, early_arrival_minutes, status, final,
       late_excused, manual_in, manual_out, detection_count)
     SELECT user_id, work_date, first_in, last_out, late_minutes, early_minutes, 0, status, CASE WHEN work_date < ? THEN 1 ELSE 0 END,
       late_excused, manual_in, manual_out, detection_count FROM attendance_days`,
  ).run(toVnDate(now));
  db.exec('DROP TABLE attendance_days');
  db.exec('ALTER TABLE attendance_days_v4 RENAME TO attendance_days');
  db.exec('CREATE INDEX IF NOT EXISTS idx_attendance_days_date ON attendance_days(work_date)');

  db.exec(`INSERT OR IGNORE INTO settings(key, value) VALUES ('work_days', '1,2,3,4,5'), ('early_arrival_minutes', '15'), ('early_leave_minutes', '10')`);
}

export const MIGRATIONS: Migration[] = [{ from: 3, run: migrate3to4 }];

/**
 * Nâng cấp từ `from` lên SCHEMA_VERSION trong một giao dịch (sao lưu file trước). Lỗi ⇒ hoàn tác, DB giữ nguyên.
 * Tắt foreign_keys trong lúc dựng lại bảng; kiểm tra foreign_key_check trước khi COMMIT.
 */
export function runMigrations(db: Db, file: string, from: number, opts: { backupDir: string | null; now: number }): string | null {
  const backup = opts.backupDir && file !== ':memory:' ? backupNow(db, opts.backupDir, 'pre-migrate', opts.now) : null;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (let v = from; v < SCHEMA_VERSION; v++) {
        const step = MIGRATIONS.find((m) => m.from === v);
        if (!step) throw new Error(`thiếu bước nâng cấp v${v} → v${v + 1}`);
        step.run(db, opts.now);
      }
      const bad = db.prepare('PRAGMA foreign_key_check').all();
      if (bad.length) throw new Error(`dữ liệu khóa ngoại không hợp lệ (${bad.length} dòng)`);
      db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    throw new MigrationError(
      `[MIGRATE] Nâng cấp v${from} → v${SCHEMA_VERSION} thất bại: ${(err as Error).message}. Database giữ nguyên v${from}${backup ? ` (sao lưu: ${backup})` : ''}.`,
      backup,
    );
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  console.log(`[MIGRATE] v${from} → v${SCHEMA_VERSION} xong (sao lưu: ${backup ?? 'không'})`);
  return backup;
}

```

`server/backup.ts`: `export type BackupReason = 'daily' | 'manual' | 'pre-reset' | 'pre-delete' | 'pre-migrate';`

- [ ] **Step 6: Sửa `server/db.ts`**

Xóa chuỗi `SCHEMA` và `SCHEMA_VERSION` khỏi file; thêm:

```ts
import path from 'node:path'; // (đã có)
import { SCHEMA, SCHEMA_VERSION } from './schema';
import { MIN_MIGRATABLE_VERSION, runMigrations } from './migrations';

export { SCHEMA_VERSION } from './schema';

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
```

Lưu ý vòng import: `migrations.ts` chỉ `import type { Db }` từ `db.ts` (import kiểu, không tạo vòng lúc chạy); `backup.ts` cũng chỉ import kiểu.

- [ ] **Step 7: `server/index.ts`**

```ts
import { openDb, SchemaTooNewError, SchemaVersionError } from './db';
import { MigrationError } from './migrations';
…
  const db = openDb(path.join(dataDir, 'attendance.db'), { backupDir });
…
main().catch((err) => {
  if (err instanceof SchemaVersionError || err instanceof SchemaTooNewError || err instanceof MigrationError) console.error(err.message);
  else console.error('[STARTUP] Không khởi động được:', err);
  process.exit(1);
});
```

- [ ] **Step 8: `shared/types.ts`**

```ts
export type DayStatus = 'on_time' | 'late' | 'early_leave' | 'late_and_early' | 'missing_out' | 'absent' | 'leave' | 'business_trip';
export type RequestType = 'missed_punch' | 'late_explanation' | 'leave_request' | 'business_trip';
```

`AttendanceDay`: `firstIn: number | null;` và thêm `earlyArrivalMinutes: number; // phút đến sớm (0 = không)`, `final: boolean; // false: còn trong giờ làm, giờ ra là lần quẹt gần nhất`. `AttendanceRequest`: thêm `endDate: string | null; // đến ngày (đơn nghỉ phép/công tác)`.

Sửa chỗ map tương ứng: `server/routes/attendance.ts` `mapDay` thêm `earlyArrivalMinutes: r.early_arrival_minutes ?? 0, final: r.final === 1,` (giữ `firstIn: r.first_in ?? null`); `server/routes/requests.ts` `mapRequest` thêm `endDate: r.end_date ?? null,`. Ở `src/format.ts` `DAY_STATUS_LABEL` thêm `absent: 'Vắng', leave: 'Nghỉ phép', business_trip: 'Công tác'`; `src/components/AttendanceTable.tsx` `STATUS_STYLE` thêm ba khóa (`absent: 'bg-rose-50 text-rose-700 border-rose-200'`, `leave: 'bg-purple-50 text-purple-700 border-purple-200'`, `business_trip: 'bg-sky-50 text-sky-700 border-sky-200'`); `src/components/RequestsTab.tsx` `TYPE_META` thêm `business_trip: { label: 'Công tác', badge: 'bg-sky-100 text-sky-800' }` — đủ để `tsc` qua (giao diện đầy đủ ở Task 8).

- [ ] **Step 9: Chạy test, PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/migration.test.ts tests/db.test.ts && npm test && npm run lint`
Expected: PASS.

```bash
git add server tests shared src
git commit -m "feat(db): schema v4 with automatic v3→v4 migration (backup first, keeps data)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Luật ca — ca mặc định, ca của khu, ca áp dụng, ngày làm việc, ngày lễ

**Files:**
- Create: `server/shifts.ts`
- Modify: `server/settings.ts` (`WorkSettings` mới, `getWorkSettings`, `validateWorkSettings`, `saveWorkSettings`)
- Modify: `shared/types.ts` (`WorkSettings`, `Shift`, `Holiday`)
- Modify: `src/components/config/WorkSettingsCard.tsx` (giữ biên dịch được với `WorkSettings` mới)
- Test: `tests/shifts.test.ts` (mới), `tests/settings.test.ts` (sửa)

**Interfaces:**
- Consumes: bảng `shifts`, `holidays`, cột `users.shift_id`, `departments.shift_id` (Task 1); `parseHHmm`, `vnDayStart` (`server/vntime.ts`).
- Produces (`shared/types.ts`):
  - `WorkSettings { workStart: string; lateGraceMinutes: number; workEnd: string; minOutGapMinutes: number; workDays: number[]; earlyArrivalMinutes: number; earlyLeaveMinutes: number }`
  - `Shift { id: string; areaId: string; areaName: string | null; name: string; workStart: string; workEnd: string; workDays: number[]; lateGraceMinutes: number; earlyArrivalMinutes: number; earlyLeaveMinutes: number; departmentCount: number; userCount: number }`
  - `Holiday { date: string; name: string }`
- Produces (`server/settings.ts`): `DEFAULT_WORK_SETTINGS` có thêm `workDays: [1, 2, 3, 4, 5], earlyArrivalMinutes: 15, earlyLeaveMinutes: 10`; `validateWorkSettings` kiểm tra thêm ba trường (thiếu `workDays`/`earlyArrivalMinutes`/`earlyLeaveMinutes` trong body ⇒ dùng giá trị hiện có/mặc định để không phá client cũ).
- Produces (`server/shifts.ts`):
  - `interface ShiftRule { shiftId: string | null; name: string; workStart: number; workEnd: number; workDays: number[]; graceMinutes: number; earlyArrivalMinutes: number; earlyLeaveMinutes: number; minOutGapMinutes: number }` (phút trong ngày)
  - `DEFAULT_SHIFT_NAME = 'Ca mặc định công ty'`
  - `parseWorkDays(s: string): number[]`, `formatWorkDays(days: number[]): string`
  - `ruleFromSettings(ws: WorkSettings): ShiftRule`
  - `defaultShiftRule(db: Db): ShiftRule`
  - `effectiveShift(db: Db, userId: string): ShiftRule`
  - `isoWeekday(date: string): number` (1–7)
  - `isHoliday(db: Db, date: string): boolean`
  - `isWorkday(db: Db, rule: ShiftRule, date: string): boolean`
  - `validateShiftInput(input: unknown): ShiftInput` với `ShiftInput { name: string; workStart: string; workEnd: string; workDays: number[]; lateGraceMinutes: number; earlyArrivalMinutes: number; earlyLeaveMinutes: number }`
  - `SHIFT_SELECT: string`, `mapShift(r: Row): Shift`, `getShift(db, id): Shift | null`
- Produces: `server/attendance.ts` đổi `DaySettings` thành `export type DaySettings = ShiftRule` và `toDaySettings(ws) = ruleFromSettings(ws)` (giữ tên cho test cũ).

- [ ] **Step 1: Viết test `tests/shifts.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedArea, seedDepartment, seedUser } from './helpers';
import { effectiveShift, isHoliday, isoWeekday, isWorkday, parseWorkDays, validateShiftInput, DEFAULT_SHIFT_NAME } from '../server/shifts';
import { saveWorkSettings, DEFAULT_WORK_SETTINGS } from '../server/settings';
import type { Db } from '../server/db';

function addShift(db: Db, id: string, areaId: string, name: string, start = '07:00', end = '19:00', days = '1,2,3,4,5,6,7'): void {
  db.prepare(
    `INSERT INTO shifts(id, area_id, name, work_start, work_end, work_days, late_grace_minutes, early_arrival_minutes, early_leave_minutes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 15, 15, 10, '2026-10-14')`,
  ).run(id, areaId, name, start, end, days);
}

test('isoWeekday và parseWorkDays', () => {
  assert.equal(isoWeekday('2026-10-12'), 1, 'thứ 2');
  assert.equal(isoWeekday('2026-10-18'), 7, 'chủ nhật');
  assert.deepEqual(parseWorkDays('5,1,3'), [1, 3, 5]);
});

test('effectiveShift: ca riêng > ca phòng > ca mặc định; ca khác khu bị bỏ qua (Review Focus #5)', () => {
  const db = freshDb();
  const A = seedArea(db, 'KV01');
  const B = seedArea(db, 'KV02');
  addShift(db, 'sA', A, 'Cửa hàng A');
  addShift(db, 'sA2', A, 'Ca riêng A', '09:00', '18:00');
  addShift(db, 'sB', B, 'Kho B', '06:00', '14:00');
  const pa = seedDepartment(db, 'PA', 'PA', A);
  const pb = seedDepartment(db, 'PB', 'PB', B);
  db.prepare("UPDATE departments SET shift_id = 'sA' WHERE id = ?").run(pa);
  const u = seedUser(db, { code: 'NV01', departmentId: pa });
  assert.equal(effectiveShift(db, u).shiftId, 'sA');
  db.prepare("UPDATE users SET shift_id = 'sA2' WHERE id = ?").run(u);
  assert.deepEqual([effectiveShift(db, u).shiftId, effectiveShift(db, u).workStart], ['sA2', 9 * 60]);
  // chuyển sang phòng khu B (chưa có ca): ca riêng sA2 thuộc khu A bị bỏ qua → ca mặc định
  db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(pb, u);
  const r = effectiveShift(db, u);
  assert.deepEqual([r.shiftId, r.name, r.workStart, r.workEnd], [null, DEFAULT_SHIFT_NAME, 8 * 60, 17 * 60]);
  db.prepare("UPDATE departments SET shift_id = 'sB' WHERE id = ?").run(pb);
  assert.equal(effectiveShift(db, u).shiftId, 'sB');
  const noDept = seedUser(db, { code: 'NV02' });
  assert.equal(effectiveShift(db, noDept).shiftId, null);
});

test('ngày làm việc: theo thứ của ca và ngày lễ', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' });
  const rule = effectiveShift(db, u);
  assert.equal(isWorkday(db, rule, '2026-10-16'), true, 'thứ 6');
  assert.equal(isWorkday(db, rule, '2026-10-17'), false, 'thứ 7');
  db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-16', 'Nghỉ bù')").run();
  assert.equal(isHoliday(db, '2026-10-16'), true);
  assert.equal(isWorkday(db, rule, '2026-10-16'), false);
  saveWorkSettings(db, { ...DEFAULT_WORK_SETTINGS, workDays: [1, 2, 3, 4, 5, 6] });
  assert.equal(isWorkday(db, effectiveShift(db, u), '2026-10-17'), true, 'ca mặc định làm thêm thứ 7');
});

test('validateShiftInput', () => {
  const ok = { name: ' Cửa hàng ', workStart: '07:00', workEnd: '19:00', workDays: [1, 2, 3, 4, 5, 6, 7], lateGraceMinutes: 15, earlyArrivalMinutes: 15, earlyLeaveMinutes: 10 };
  assert.deepEqual(validateShiftInput(ok), { ...ok, name: 'Cửa hàng' });
  for (const bad of [
    { name: '' },
    { workStart: '7h' },
    { workEnd: '06:00' },
    { workDays: [] },
    { workDays: [0, 8] },
    { lateGraceMinutes: -1 },
    { earlyArrivalMinutes: 121 },
    { earlyLeaveMinutes: 1.5 },
  ]) {
    assert.throws(() => validateShiftInput({ ...ok, ...bad }), (e: any) => e.status === 400, JSON.stringify(bad));
  }
});
```

Trong `tests/settings.test.ts`: chỗ dùng `ws` (object `WorkSettings`) thêm ba trường `workDays: [1, 2, 3, 4, 5], earlyArrivalMinutes: 15, earlyLeaveMinutes: 10` cho khớp kiểu mới; thêm assert `validateWorkSettings({ workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 })` (thiếu ba trường mới) trả về giá trị mặc định cho ba trường đó, và `validateWorkSettings({ ...hợp lệ, workDays: [] })` ném 400.

- [ ] **Step 2: Chạy test, FAIL**

Run: `npx tsx --test tests/shifts.test.ts` — Expected: FAIL (`Cannot find module '../server/shifts'`).

- [ ] **Step 3: `server/settings.ts` và `shared/types.ts`**

`shared/types.ts`: thay `WorkSettings` như Interfaces; thêm `Shift`, `Holiday`.

`server/settings.ts`:

```ts
export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  workStart: '08:00',
  lateGraceMinutes: 15,
  workEnd: '17:00',
  minOutGapMinutes: 30,
  workDays: [1, 2, 3, 4, 5],
  earlyArrivalMinutes: 15,
  earlyLeaveMinutes: 10,
};

function daysFrom(s: string | undefined): number[] {
  return s ? s.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b) : DEFAULT_WORK_SETTINGS.workDays;
}

export function getWorkSettings(db: Db): WorkSettings {
  return {
    workStart: getSetting(db, 'work_start') ?? DEFAULT_WORK_SETTINGS.workStart,
    lateGraceMinutes: Number(getSetting(db, 'late_grace_minutes') ?? DEFAULT_WORK_SETTINGS.lateGraceMinutes),
    workEnd: getSetting(db, 'work_end') ?? DEFAULT_WORK_SETTINGS.workEnd,
    minOutGapMinutes: Number(getSetting(db, 'min_out_gap_minutes') ?? DEFAULT_WORK_SETTINGS.minOutGapMinutes),
    workDays: daysFrom(getSetting(db, 'work_days')),
    earlyArrivalMinutes: Number(getSetting(db, 'early_arrival_minutes') ?? DEFAULT_WORK_SETTINGS.earlyArrivalMinutes),
    earlyLeaveMinutes: Number(getSetting(db, 'early_leave_minutes') ?? DEFAULT_WORK_SETTINGS.earlyLeaveMinutes),
  };
}

/** Ngày làm trong tuần: mảng số 1–7 (1 = thứ 2), không rỗng, không trùng. */
export function workDaysInput(v: unknown, label = 'Ngày làm trong tuần'): number[] {
  if (!Array.isArray(v)) throw new HttpError(400, `${label} không hợp lệ`);
  const days = [...new Set(v.map(Number))].sort((a, b) => a - b);
  if (days.length === 0 || days.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) throw new HttpError(400, `${label} phải chọn ít nhất một ngày từ thứ 2 đến chủ nhật`);
  return days;
}
```

`validateWorkSettings(input)`: giữ phần cũ, thêm (`intInRange` và `hhmm` là hàm sẵn có trong file — export cả hai để `shifts.ts` dùng lại):

```ts
    workDays: b.workDays === undefined ? DEFAULT_WORK_SETTINGS.workDays : workDaysInput(b.workDays),
    earlyArrivalMinutes: b.earlyArrivalMinutes === undefined ? DEFAULT_WORK_SETTINGS.earlyArrivalMinutes : intInRange(b.earlyArrivalMinutes, 0, 120, 'Ngưỡng đi sớm'),
    earlyLeaveMinutes: b.earlyLeaveMinutes === undefined ? DEFAULT_WORK_SETTINGS.earlyLeaveMinutes : intInRange(b.earlyLeaveMinutes, 0, 120, 'Cho phép về sớm'),
```

`saveWorkSettings` thêm `setSetting(db, 'work_days', ws.workDays.join(','))`, `setSetting(db, 'early_arrival_minutes', String(ws.earlyArrivalMinutes))`, `setSetting(db, 'early_leave_minutes', String(ws.earlyLeaveMinutes))`.

`src/components/config/WorkSettingsCard.tsx`: không cần đổi giao diện ở task này (state giữ nguyên object `WorkSettings` từ server và gửi lại cả object) — chỉ sửa nếu `tsc` báo lỗi.

- [ ] **Step 4: Tạo `server/shifts.ts`**

```ts
import type { Db } from './db';
import { HttpError } from './errors';
import { getWorkSettings, hhmm, intInRange, workDaysInput } from './settings';
import { parseHHmm, vnDayStart } from './vntime';
import type { Row } from './repo';
import type { Shift, WorkSettings } from '../shared/types';

export const DEFAULT_SHIFT_NAME = 'Ca mặc định công ty';

/** Luật một ca, giờ tính bằng phút trong ngày (giờ Việt Nam). */
export interface ShiftRule {
  shiftId: string | null; // null = ca mặc định công ty
  name: string;
  workStart: number;
  workEnd: number;
  workDays: number[];
  graceMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  minOutGapMinutes: number;
}

export interface ShiftInput {
  name: string;
  workStart: string;
  workEnd: string;
  workDays: number[];
  lateGraceMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
}

export function parseWorkDays(s: string): number[] {
  return s.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b);
}

export function formatWorkDays(days: number[]): string {
  return [...days].sort((a, b) => a - b).join(',');
}

export function ruleFromSettings(ws: WorkSettings): ShiftRule {
  return {
    shiftId: null,
    name: DEFAULT_SHIFT_NAME,
    workStart: parseHHmm(ws.workStart),
    workEnd: parseHHmm(ws.workEnd),
    workDays: ws.workDays,
    graceMinutes: ws.lateGraceMinutes,
    earlyArrivalMinutes: ws.earlyArrivalMinutes,
    earlyLeaveMinutes: ws.earlyLeaveMinutes,
    minOutGapMinutes: ws.minOutGapMinutes,
  };
}

export function defaultShiftRule(db: Db): ShiftRule {
  return ruleFromSettings(getWorkSettings(db));
}

function ruleFromRow(r: Row, minOutGapMinutes: number): ShiftRule {
  return {
    shiftId: r.id,
    name: r.name,
    workStart: parseHHmm(r.work_start),
    workEnd: parseHHmm(r.work_end),
    workDays: parseWorkDays(r.work_days),
    graceMinutes: r.late_grace_minutes,
    earlyArrivalMinutes: r.early_arrival_minutes,
    earlyLeaveMinutes: r.early_leave_minutes,
    minOutGapMinutes,
  };
}

/**
 * Ca áp dụng: ca riêng (nếu thuộc khu hiện tại của người đó) > ca của phòng (nếu thuộc khu của phòng) > ca mặc định.
 * Chuyển phòng/khu mà ca cũ không còn thuộc khu mới thì tự rơi xuống bước sau.
 */
export function effectiveShift(db: Db, userId: string): ShiftRule {
  const base = defaultShiftRule(db);
  const u = db
    .prepare('SELECT u.shift_id AS own, d.shift_id AS dept, d.area_id AS area FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?')
    .get(userId) as { own: string | null; dept: string | null; area: string | null } | undefined;
  if (!u || !u.area) return base;
  const byId = db.prepare('SELECT * FROM shifts WHERE id = ? AND area_id = ?');
  for (const id of [u.own, u.dept]) {
    if (!id) continue;
    const row = byId.get(id, u.area) as Row | undefined;
    if (row) return ruleFromRow(row, base.minOutGapMinutes);
  }
  return base;
}

/** Thứ trong tuần theo ISO: 1 = thứ 2 … 7 = chủ nhật. */
export function isoWeekday(date: string): number {
  const d = new Date(vnDayStart(date) + 7 * 3_600_000).getUTCDay(); // 0 = chủ nhật
  return d === 0 ? 7 : d;
}

export function isHoliday(db: Db, date: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM holidays WHERE date = ?').get(date));
}

export function isWorkday(db: Db, rule: ShiftRule, date: string): boolean {
  return rule.workDays.includes(isoWeekday(date)) && !isHoliday(db, date);
}

export function validateShiftInput(input: unknown): ShiftInput {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Thiếu thông tin ca');
  const b = input as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) throw new HttpError(400, 'Tên ca là bắt buộc');
  const s: ShiftInput = {
    name,
    workStart: hhmm(b.workStart, 'Giờ vào'),
    workEnd: hhmm(b.workEnd, 'Giờ ra'),
    workDays: workDaysInput(b.workDays),
    lateGraceMinutes: intInRange(b.lateGraceMinutes, 0, 120, 'Cho phép đi muộn'),
    earlyArrivalMinutes: intInRange(b.earlyArrivalMinutes, 0, 120, 'Ngưỡng đi sớm'),
    earlyLeaveMinutes: intInRange(b.earlyLeaveMinutes, 0, 120, 'Cho phép về sớm'),
  };
  if (parseHHmm(s.workEnd) <= parseHHmm(s.workStart)) throw new HttpError(400, 'Giờ ra phải sau giờ vào');
  return s;
}

export const SHIFT_SELECT = `SELECT s.*, a.name AS area_name,
  (SELECT COUNT(*) FROM departments d WHERE d.shift_id = s.id) AS department_count,
  (SELECT COUNT(*) FROM users u WHERE u.shift_id = s.id) AS user_count
  FROM shifts s LEFT JOIN areas a ON a.id = s.area_id`;

export function mapShift(r: Row): Shift {
  return {
    id: r.id,
    areaId: r.area_id,
    areaName: r.area_name ?? null,
    name: r.name,
    workStart: r.work_start,
    workEnd: r.work_end,
    workDays: parseWorkDays(r.work_days),
    lateGraceMinutes: r.late_grace_minutes,
    earlyArrivalMinutes: r.early_arrival_minutes,
    earlyLeaveMinutes: r.early_leave_minutes,
    departmentCount: Number(r.department_count),
    userCount: Number(r.user_count),
  };
}

export function getShift(db: Db, id: string): Shift | null {
  const row = db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(id) as Row | undefined;
  return row ? mapShift(row) : null;
}
```

Trong `server/settings.ts` đổi `function intInRange` và `function hhmm` thành `export function`.

Trong `server/attendance.ts`: thay `DaySettings`/`toDaySettings` bằng:

```ts
import { ruleFromSettings, type ShiftRule } from './shifts';
export type DaySettings = ShiftRule;
export const toDaySettings = ruleFromSettings;
```

và sửa thân `computeDay` dùng `settings.graceMinutes`/`workStart`/`workEnd`/`minOutGapMinutes` (tên trường giữ nguyên nên không đổi logic ở task này). `tests/attendance.test.ts`: `toDaySettings({...})` thêm ba trường mới `workDays: [1,2,3,4,5], earlyArrivalMinutes: 15, earlyLeaveMinutes: 10`.

- [ ] **Step 5: Chạy test, PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/shifts.test.ts tests/settings.test.ts && npm test && npm run lint` — Expected: PASS.

```bash
git add server shared src tests
git commit -m "feat(shifts): shift rules, effective shift per person, workdays and holidays

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Bộ tính công theo ca — đi sớm, về sớm chốt sau giờ ra, vắng, nghỉ; job đóng ngày

**Files:**
- Modify: `server/attendance.ts` (toàn bộ phần tính)
- Modify: `server/jobs.ts` (job `close-days`)
- Test: `tests/attendance.test.ts`, `tests/recompute.test.ts` (sửa), `tests/day-status.test.ts` (mới), `tests/jobs.test.ts` (sửa)

**Interfaces:**
- Consumes: `ShiftRule`, `effectiveShift`, `isWorkday` (Task 2); `SYSTEM_ADMIN_CODE` (`server/bootstrap.ts`); `vnDayStart`, `vnMinutesOfDay`, `addDays`, `daysBetween`, `toVnDate` (`server/vntime.ts`).
- Produces (`server/attendance.ts`):
  - `ComputeDayInput { detectionTs: number[]; settings: ShiftRule; lateExcused: boolean; manualIn: number | null; manualOut: number | null; closed: boolean }`
  - `ComputedDay { firstIn: number; lastOut: number | null; lateMinutes: number; earlyMinutes: number; earlyArrivalMinutes: number; status: DayStatus; detectionCount: number; final: boolean }`
  - `computeDay(input): ComputedDay | null`
  - `shiftEndTs(rule: ShiftRule, date: string): number`
  - `approvedLeaveType(db, userId, date): 'leave' | 'business_trip' | null`
  - `recomputeDay(db, userId, workDate, now?: number): void` (mặc định `Date.now()`)
  - `applyDayAdjustment(db, userId, workDate, patch, now?: number): void`
  - `recomputeUsers(db, userIds: string[], from: string, to: string, now: number): number` (số cặp người×ngày đã tính)
  - `recomputeRange(db, from, to, now?: number): number` (mọi nhân sự trừ `ADMIN`)
  - `monthToDate(now: number): { from: string; to: string }`
  - `closeDays(db, now: number): number`
- Produces (`server/jobs.ts`): `DueJobs.closeDays: boolean` (phút chia hết cho 15); chạy `closeDays` lúc khởi động.

- [ ] **Step 1: Viết test `tests/day-status.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser } from './helpers';
import { closeDays, recomputeDay, recomputeUsers } from '../server/attendance';
import { vnDateTimeToTs } from '../server/vntime';
import type { Db } from '../server/db';

const at = (date: string, hhmm: string) => vnDateTimeToTs(date, hhmm);
const row = (db: Db, u: string, d: string) =>
  db.prepare('SELECT status, first_in, last_out, early_minutes, early_arrival_minutes, final FROM attendance_days WHERE user_id = ? AND work_date = ?').get(u, d) as
    | { status: string; first_in: number | null; last_out: number | null; early_minutes: number; early_arrival_minutes: number; final: number }
    | undefined;
function detect(db: Db, u: string, ts: number, now: number): void {
  const d = new Date(ts + 7 * 3_600_000).toISOString().slice(0, 10);
  db.prepare("INSERT INTO detections(user_id, device_id, ts, work_date, source) VALUES (?, 'DEV1', ?, ?, 'webhook')").run(u, ts, d);
  recomputeDay(db, u, d, now);
}

const THU = '2026-10-15'; // thứ 5
test('Review Focus #2: quẹt 14:30 rồi về — trong giờ làm không gắn về sớm; sau 17:00 đóng ngày mới gắn', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' });
  detect(db, u, at(THU, '07:40'), at(THU, '07:40'));
  detect(db, u, at(THU, '14:30'), at(THU, '14:30'));
  let r = row(db, u, THU)!;
  assert.deepEqual([r.status, r.early_minutes, r.final, r.last_out, r.early_arrival_minutes], ['on_time', 0, 0, at(THU, '14:30'), 20]);
  assert.equal(closeDays(db, at(THU, '15:00')) >= 0, true);
  assert.equal(row(db, u, THU)!.final, 0, '15:00 vẫn trong giờ làm');
  closeDays(db, at(THU, '17:15'));
  r = row(db, u, THU)!;
  assert.deepEqual([r.status, r.early_minutes, r.final], ['early_leave', 150, 1]);
});

test('về sớm trong ngưỡng 10 phút: ra 16:55 không về sớm; 16:45 về sớm 15 phút', () => {
  const db = freshDb();
  const a = seedUser(db, { code: 'A' });
  const b = seedUser(db, { code: 'B' });
  const late = at(THU, '18:00');
  for (const [u, out] of [[a, '16:55'], [b, '16:45']] as const) {
    detect(db, u, at(THU, '08:00'), late);
    detect(db, u, at(THU, out), late);
  }
  assert.deepEqual([row(db, a, THU)!.status, row(db, a, THU)!.early_minutes], ['on_time', 0]);
  assert.deepEqual([row(db, b, THU)!.status, row(db, b, THU)!.early_minutes], ['early_leave', 15]);
});

test('vắng: chưa tới giờ ra thì chưa có dòng; qua giờ ra thì absent; quẹt muộn sau đó thay absent', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' });
  closeDays(db, at(THU, '16:59'));
  assert.equal(row(db, u, THU), undefined);
  closeDays(db, at(THU, '17:00'));
  assert.deepEqual({ ...row(db, u, THU)! }, { status: 'absent', first_in: null, last_out: null, early_minutes: 0, early_arrival_minutes: 0, final: 1 });
  detect(db, u, at(THU, '17:30'), at(THU, '17:31'));
  assert.equal(row(db, u, THU)!.status, 'missing_out', 'có lượt quẹt thì không còn vắng');
});

test('Review Focus #3: không vắng vào ngày nghỉ của ca, ngày lễ, trước ngày tạo tài khoản, khi đã nghỉ việc; không vắng cho ADMIN', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' }); // tạo 2026-10-13
  const off = seedUser(db, { code: 'NV02', status: 'inactive' });
  const admin = seedUser(db, { code: 'ADMIN', role: 'hr' });
  db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-16', 'Nghỉ lễ')").run();
  const now = at('2026-10-19', '20:00');
  recomputeUsers(db, [u, off, admin], '2026-10-12', '2026-10-19', now);
  const statuses = (id: string) =>
    (db.prepare('SELECT work_date, status FROM attendance_days WHERE user_id = ? ORDER BY work_date').all(id) as { work_date: string; status: string }[]).map((x) => `${x.work_date}:${x.status}`);
  assert.deepEqual(statuses(u), ['2026-10-13:absent', '2026-10-14:absent', '2026-10-15:absent', '2026-10-19:absent'], '12/10 trước ngày tạo; 16/10 lễ; 17–18 cuối tuần');
  assert.deepEqual(statuses(off), []);
  assert.deepEqual(statuses(admin), []);
});

test('đơn nghỉ phép/công tác đã duyệt: ngày làm việc thành leave/business_trip, có lượt quẹt vẫn giữ giờ, không tính muộn', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' });
  db.prepare("INSERT INTO requests(id, user_id, work_date, end_date, type, reason, status, created_at) VALUES ('r1', ?, '2026-10-15', '2026-10-16', 'business_trip', 'x', 'approved', 'x')").run(u);
  detect(db, u, at(THU, '09:30'), at(THU, '20:00'));
  recomputeUsers(db, [u], '2026-10-15', '2026-10-16', at('2026-10-16', '20:00'));
  assert.deepEqual([row(db, u, THU)!.status, row(db, u, THU)!.first_in], ['business_trip', at(THU, '09:30')]);
  assert.deepEqual([row(db, u, '2026-10-16')!.status, row(db, u, '2026-10-16')!.first_in], ['business_trip', null]);
});
```

- [ ] **Step 2: Chạy test, FAIL**

Run: `npx tsx --test tests/day-status.test.ts` — Expected: FAIL (`closeDays` không tồn tại).

- [ ] **Step 3: Viết lại phần tính trong `server/attendance.ts`**

```ts
import type { DayStatus } from '../shared/types';
import { addDays, daysBetween, toVnDate, vnDayStart, vnMinutesOfDay } from './vntime';
import type { Db } from './db';
import { tx } from './db';
import { effectiveShift, isWorkday, ruleFromSettings, type ShiftRule } from './shifts';
import { SYSTEM_ADMIN_CODE } from './bootstrap';

export type DaySettings = ShiftRule;
export const toDaySettings = ruleFromSettings;

export interface ComputeDayInput {
  detectionTs: number[];
  settings: ShiftRule;
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
  /** Đã qua giờ ra của ca: chỉ khi đó mới xét về sớm và chốt ngày. */
  closed: boolean;
}

export interface ComputedDay {
  firstIn: number;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  earlyArrivalMinutes: number;
  status: DayStatus;
  detectionCount: number;
  final: boolean;
}

export function computeDay(input: ComputeDayInput): ComputedDay | null {
  const { detectionTs, settings, lateExcused, manualIn, manualOut, closed } = input;
  const minDet = detectionTs.length ? Math.min(...detectionTs) : null;
  const maxDet = detectionTs.length ? Math.max(...detectionTs) : null;

  const firstIn = manualIn ?? minDet;
  if (firstIn === null) return null;

  let lastOut: number | null = null;
  if (manualOut !== null) lastOut = manualOut;
  else if (maxDet !== null && maxDet - firstIn >= settings.minOutGapMinutes * 60_000) lastOut = maxDet;

  const inMin = vnMinutesOfDay(firstIn);
  const isLate = !lateExcused && inMin > settings.workStart + settings.graceMinutes;
  const lateMinutes = isLate ? inMin - settings.workStart : 0;
  const earlyArrivalMinutes = inMin < settings.workStart - settings.earlyArrivalMinutes ? settings.workStart - inMin : 0;

  // Về sớm chỉ xét khi đã qua giờ ra; trong giờ làm, giờ ra chỉ là lần quẹt gần nhất
  const outMin = lastOut === null ? null : vnMinutesOfDay(lastOut);
  const isEarly = closed && outMin !== null && outMin < settings.workEnd - settings.earlyLeaveMinutes;
  const earlyMinutes = isEarly ? settings.workEnd - (outMin as number) : 0;

  let status: DayStatus;
  if (lastOut === null) status = 'missing_out';
  else if (isLate && isEarly) status = 'late_and_early';
  else if (isLate) status = 'late';
  else if (isEarly) status = 'early_leave';
  else status = 'on_time';

  return { firstIn, lastOut, lateMinutes, earlyMinutes, earlyArrivalMinutes, status, detectionCount: detectionTs.length, final: closed };
}

export function shiftEndTs(rule: ShiftRule, date: string): number {
  return vnDayStart(date) + rule.workEnd * 60_000;
}

/** Loại đơn nghỉ phép/công tác đã duyệt phủ ngày này (nếu có). */
export function approvedLeaveType(db: Db, userId: string, date: string): 'leave' | 'business_trip' | null {
  const r = db
    .prepare(
      `SELECT type FROM requests WHERE user_id = ? AND status = 'approved' AND type IN ('leave_request', 'business_trip')
       AND work_date <= ? AND COALESCE(end_date, work_date) >= ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId, date, date) as { type: string } | undefined;
  if (!r) return null;
  return r.type === 'business_trip' ? 'business_trip' : 'leave';
}

export interface DayAdjustment {
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
}

function simulatorFilter(): string {
  return process.env.NODE_ENV === 'production' ? " AND source != 'simulator'" : '';
}

function readAdjustment(db: Db, userId: string, workDate: string): DayAdjustment {
  const row = db
    .prepare('SELECT late_excused, manual_in, manual_out FROM attendance_days WHERE user_id = ? AND work_date = ?')
    .get(userId, workDate) as { late_excused: number; manual_in: number | null; manual_out: number | null } | undefined;
  return { lateExcused: row?.late_excused === 1, manualIn: row?.manual_in ?? null, manualOut: row?.manual_out ?? null };
}

interface DayRow {
  firstIn: number | null;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  earlyArrivalMinutes: number;
  status: DayStatus;
  final: boolean;
  detectionCount: number;
}

function saveDay(db: Db, userId: string, workDate: string, adj: DayAdjustment, d: DayRow): void {
  db.prepare(
    `INSERT INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, early_arrival_minutes, status, final,
       late_excused, manual_in, manual_out, detection_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE SET
       first_in = excluded.first_in, last_out = excluded.last_out, late_minutes = excluded.late_minutes,
       early_minutes = excluded.early_minutes, early_arrival_minutes = excluded.early_arrival_minutes, status = excluded.status,
       final = excluded.final, late_excused = excluded.late_excused, manual_in = excluded.manual_in, manual_out = excluded.manual_out,
       detection_count = excluded.detection_count`,
  ).run(
    userId, workDate, d.firstIn, d.lastOut, d.lateMinutes, d.earlyMinutes, d.earlyArrivalMinutes, d.status, d.final ? 1 : 0,
    adj.lateExcused ? 1 : 0, adj.manualIn, adj.manualOut, d.detectionCount,
  );
}

/**
 * Tính lại một ngày công (spec mục 6): đơn nghỉ/công tác đã duyệt > lượt quẹt/giờ chỉnh tay > vắng (ngày làm việc, đã qua giờ ra) > không có dòng.
 * Người không hoạt động, ADMIN, hoặc ngày trước ngày tạo tài khoản: không bao giờ vắng/nghỉ.
 */
function writeDay(db: Db, userId: string, workDate: string, adj: DayAdjustment, now: number): void {
  const user = db.prepare('SELECT code, status, created_at FROM users WHERE id = ?').get(userId) as
    | { code: string; status: string; created_at: string }
    | undefined;
  if (!user) return;
  const rule = effectiveShift(db, userId);
  const closed = now >= shiftEndTs(rule, workDate);
  const eligible = user.status === 'active' && user.code !== SYSTEM_ADMIN_CODE && workDate >= user.created_at.slice(0, 10);
  const workday = isWorkday(db, rule, workDate);
  const detections = db
    .prepare(`SELECT ts FROM detections WHERE user_id = ? AND work_date = ?${simulatorFilter()}`)
    .all(userId, workDate) as { ts: number }[];
  const computed = computeDay({
    detectionTs: detections.map((d) => d.ts),
    settings: rule,
    lateExcused: adj.lateExcused,
    manualIn: adj.manualIn,
    manualOut: adj.manualOut,
    closed,
  });

  const leave = eligible && workday ? approvedLeaveType(db, userId, workDate) : null;
  if (leave) {
    saveDay(db, userId, workDate, adj, {
      firstIn: computed?.firstIn ?? null,
      lastOut: computed?.lastOut ?? null,
      lateMinutes: 0,
      earlyMinutes: 0,
      earlyArrivalMinutes: 0,
      status: leave,
      final: true,
      detectionCount: detections.length,
    });
    return;
  }
  if (computed) {
    saveDay(db, userId, workDate, adj, computed);
    return;
  }
  if (eligible && workday && closed) {
    saveDay(db, userId, workDate, adj, {
      firstIn: null, lastOut: null, lateMinutes: 0, earlyMinutes: 0, earlyArrivalMinutes: 0, status: 'absent', final: true, detectionCount: 0,
    });
    return;
  }
  db.prepare('DELETE FROM attendance_days WHERE user_id = ? AND work_date = ?').run(userId, workDate);
}

export function recomputeDay(db: Db, userId: string, workDate: string, now: number = Date.now()): void {
  writeDay(db, userId, workDate, readAdjustment(db, userId, workDate), now);
}

export function applyDayAdjustment(db: Db, userId: string, workDate: string, patch: Partial<DayAdjustment>, now: number = Date.now()): void {
  writeDay(db, userId, workDate, { ...readAdjustment(db, userId, workDate), ...patch }, now);
}

/** Tính lại mọi (người, ngày) trong [from, to] cho danh sách người. Trả số cặp đã tính. */
export function recomputeUsers(db: Db, userIds: string[], from: string, to: string, now: number): number {
  const span = daysBetween(from, to);
  if (span < 0 || userIds.length === 0) return 0;
  let n = 0;
  tx(db, () => {
    for (let i = 0; i <= span; i++) {
      const date = addDays(from, i);
      for (const id of userIds) {
        recomputeDay(db, id, date, now);
        n++;
      }
    }
  });
  return n;
}

/** Tính lại mọi nhân sự (trừ ADMIN) trong khoảng ngày — nút "Tính lại" của HR. */
export function recomputeRange(db: Db, from: string, to: string, now: number = Date.now()): number {
  const ids = (db.prepare('SELECT id FROM users WHERE code != ?').all(SYSTEM_ADMIN_CODE) as { id: string }[]).map((r) => r.id);
  return recomputeUsers(db, ids, from, to, now);
}

/** Từ ngày 1 tháng hiện tại tới hôm nay (giờ Việt Nam). */
export function monthToDate(now: number): { from: string; to: string } {
  const to = toVnDate(now);
  return { from: `${to.slice(0, 8)}01`, to };
}

/**
 * Đóng ngày (job 15 phút): hôm qua và hôm nay, mọi nhân sự đang làm (trừ ADMIN) chưa có dòng hoặc dòng chưa chốt
 * mà đã qua giờ ra của ca ⇒ tính lại để ghi vắng/chốt về sớm. Trả số ngày đã tính.
 */
export function closeDays(db: Db, now: number): number {
  const today = toVnDate(now);
  const users = (db.prepare("SELECT id FROM users WHERE status = 'active' AND code != ?").all(SYSTEM_ADMIN_CODE) as { id: string }[]).map((r) => r.id);
  const final = db.prepare('SELECT final FROM attendance_days WHERE user_id = ? AND work_date = ?');
  let n = 0;
  tx(db, () => {
    for (const date of [addDays(today, -1), today]) {
      for (const id of users) {
        const r = final.get(id, date) as { final: number } | undefined;
        if (r?.final === 1) continue;
        if (now < shiftEndTs(effectiveShift(db, id), date)) continue;
        recomputeDay(db, id, date, now);
        n++;
      }
    }
  });
  return n;
}
```

- [ ] **Step 4: Job đóng ngày (`server/jobs.ts`)**

`DueJobs` thêm `closeDays: boolean`; `dueJobs` thêm `closeDays: m % 15 === 0,`. Import `closeDays` từ `./attendance`. Trong `tick` (ngoài khối `reconcileEnabled`): `if (due.closeDays) run('close-days', () => closeDays(ctx.db, now));`. Ngay trước `const timer = setInterval(...)`: `run('close-days-startup', () => closeDays(ctx.db, ctx.now()));`.

`tests/jobs.test.ts`: các `assert.deepEqual(dueJobs(...), {...})` thêm `closeDays: true` (02:00) / `closeDays: false` (02:01); thêm `assert.equal(dueJobs(at('17:15')).closeDays, true)`.

- [ ] **Step 5: Sửa test cũ theo luật mới**

`tests/attendance.test.ts`:
- `settings` thêm `workDays: [1, 2, 3, 4, 5], earlyArrivalMinutes: 15, earlyLeaveMinutes: 10`; hàm `input` thêm mặc định `closed: true`.
- Test `'ra 16:50 → về sớm 10 phút'` ⇒ đổi thành:

```ts
test('ra 16:50 → trong ngưỡng 10 phút, không về sớm; ra 16:49 → về sớm 11 phút', () => {
  assert.equal(computeDay(input([at('07:55'), at('12:00'), at('16:50')]))!.status, 'on_time');
  const r = computeDay(input([at('07:55'), at('12:00'), at('16:49')]))!;
  assert.deepEqual([r.status, r.earlyMinutes], ['early_leave', 11]);
});
```

- Test `'muộn và về sớm'` ⇒ dùng `at('16:40')`, mong `earlyMinutes` = 20.
- Thêm:

```ts
test('chưa qua giờ ra (closed = false) → không gắn về sớm, final = false', () => {
  const r = computeDay(input([at('08:00'), at('14:30')], { closed: false }))!;
  assert.deepEqual([r.status, r.earlyMinutes, r.final], ['on_time', 0, false]);
});

test('đến trước 07:45 → ghi đi sớm, vẫn đúng giờ', () => {
  const r = computeDay(input([at('07:30'), at('17:00')]))!;
  assert.deepEqual([r.status, r.earlyArrivalMinutes], ['on_time', 30]);
  assert.equal(computeDay(input([at('07:45'), at('17:00')]))!.earlyArrivalMinutes, 0);
});
```

`tests/recompute.test.ts`:
- `recomputeRange` test: `saveWorkSettings(db, { …, workDays: [1, 2, 3, 4, 5], earlyArrivalMinutes: 15, earlyLeaveMinutes: 10 })`; `recomputeRange(db, '2026-10-12', '2026-10-13')` giờ trả **2** (1 người × 2 ngày); `day(db, u, '2026-10-13')!.status` là `'absent'` (người tạo ngày 13/10, không quẹt).
- Test `'recomputeDay xóa dòng khi không còn lượt nào…'` ⇒ đổi thành: người **đã nghỉ việc** (`status: 'inactive'`) không còn lượt ⇒ không có dòng; và thêm: người đang làm không còn lượt, ngày đã qua ⇒ `status === 'absent'`.
- Kiểu `DayRow.first_in` thành `number | null`.

Các test khác fail vì có thêm dòng `absent` (ví dụ đếm dòng ngày công sau `recomputeRange`, thống kê "chưa điểm danh"): sửa giá trị mong đợi cho khớp luật spec mục 6; **không** đổi luật trong code để test cũ qua. Ghi danh sách test đã sửa vào báo cáo.

- [ ] **Step 6: Chạy test, PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/day-status.test.ts tests/attendance.test.ts tests/recompute.test.ts tests/jobs.test.ts && npm test && npm run lint` — Expected: PASS.

```bash
git add server tests
git commit -m "feat(attendance): shift-based days with early arrival, early leave after shift end, absence and approved leave

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API ca, ngày lễ, ca mặc định; gán ca cho phòng ban và nhân sự; tự tính lại

**Files:**
- Create: `server/routes/shifts.ts` (ca + ngày lễ)
- Modify: `server/app.ts` (gắn `shiftRoutes`)
- Modify: `server/routes/settings.ts` (`PUT /settings/work` tính lại)
- Modify: `server/routes/departments.ts` (`shiftId` ở POST/PUT, `DEPT_SELECT`, `mapDept`)
- Modify: `server/routes/users.ts` (`shiftId` ở POST/PUT; giới hạn tự sửa của quản trị khu)
- Modify: `server/repo.ts` (`USER_SELECT`, `mapUser`)
- Modify: `shared/types.ts` (`User.shiftId/shiftName`, `Department.shiftId/shiftName`)
- Test: `tests/shifts-api.test.ts` (mới), `tests/permissions.test.ts` (thêm ca)

**Interfaces:**
- Consumes: `validateShiftInput`, `SHIFT_SELECT`, `mapShift`, `getShift`, `formatWorkDays` (Task 2); `recomputeUsers`, `recomputeRange`, `monthToDate` (Task 3); `requireManager`, `requireGlobalHr`, `managesArea`, `isGlobalHr`, `resolveAreaFor`, `parseAreaFilter`, `areaColumnSql`, `notFound`, `deptAreaId` (`server/access.ts`).
- Produces (API):
  - `GET /api/shifts?area=` → `{ shifts: Shift[] }` (`requireManager`, theo phạm vi)
  - `POST /api/shifts { areaId, name, workStart, workEnd, workDays, lateGraceMinutes, earlyArrivalMinutes, earlyLeaveMinutes }` → `{ shift }`
  - `PUT /api/shifts/:id {…}` → `{ shift, recomputed: number }`; `DELETE /api/shifts/:id` → `{ success: true }` (đang dùng ⇒ 409)
  - `GET /api/holidays?year=YYYY` → `{ holidays: Holiday[] }` (mọi người đăng nhập); `POST /api/holidays { date, name }` → `{ holiday, recomputed }`; `DELETE /api/holidays/:date` → `{ success: true, recomputed }` (`requireGlobalHr`)
  - `PUT /api/settings/work` trả thêm `recomputed: number`
  - `POST/PUT /api/departments` nhận `shiftId: string | null`; `POST/PUT /api/users` nhận `shiftId: string | null`
- Produces (`shared/types.ts`): `User.shiftId: string | null; User.shiftName: string | null` (ca riêng); `Department.shiftId: string | null; Department.shiftName: string | null`.

- [ ] **Step 1: Viết test `tests/shifts-api.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, type TestApp } from './helpers';

const SHIFT = { name: 'Cửa hàng', workStart: '07:00', workEnd: '19:00', workDays: [1, 2, 3, 4, 5, 6, 7], lateGraceMinutes: 15, earlyArrivalMinutes: 15, earlyLeaveMinutes: 10 };

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const ids: Record<string, string> = {
    A, B,
    pa: seedDepartment(app.db, 'PA', 'PA', A),
    pb: seedDepartment(app.db, 'PB', 'PB', B),
  };
  ids.hr = seedUser(app.db, { code: 'HR01', role: 'hr' });
  ids.qk = seedUser(app.db, { code: 'QKA', role: 'area_admin', adminAreaIds: [A] });
  ids.nvA = seedUser(app.db, { code: 'NVA', departmentId: ids.pa });
  ids.nvB = seedUser(app.db, { code: 'NVB', departmentId: ids.pb });
  return { app, ids };
}

test('quản trị khu tạo/sửa/xóa ca trong khu mình; ca khu khác 404; tên trùng trong khu 409', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.post('/api/shifts', { ...SHIFT, areaId: ids.B })).status, 404);
    assert.equal((await qk.post('/api/shifts', SHIFT)).status, 400, 'thiếu khu');
    const c = await qk.post('/api/shifts', { ...SHIFT, areaId: ids.A });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.deepEqual([c.body.shift.areaId, c.body.shift.workDays], [ids.A, [1, 2, 3, 4, 5, 6, 7]]);
    assert.equal((await qk.post('/api/shifts', { ...SHIFT, areaId: ids.A })).status, 409);
    const hr = await loginAs(app, 'HR01');
    const sb = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.B, name: 'Kho B' })).body.shift;
    assert.deepEqual((await qk.get('/api/shifts')).body.shifts.map((s: { id: string }) => s.id), [c.body.shift.id]);
    assert.equal((await qk.put(`/api/shifts/${sb.id}`, { name: 'X' })).status, 404);
    assert.equal((await qk.del(`/api/shifts/${sb.id}`)).status, 404);
    assert.equal((await qk.put(`/api/shifts/${c.body.shift.id}`, { workEnd: '06:00' })).status, 400);
    assert.equal((await qk.del(`/api/shifts/${c.body.shift.id}`)).status, 200);
  } finally {
    await app.close();
  }
});

test('gán ca: phải cùng khu; ca đang dùng không xóa được; đổi giờ ca thì tính lại từ đầu tháng', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    const s = (await qk.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    const hr = await loginAs(app, 'HR01');
    const sb = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.B, name: 'Kho B' })).body.shift;
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { shiftId: sb.id })).status, 400);
    const d = await qk.put(`/api/departments/${ids.pa}`, { shiftId: s.id });
    assert.deepEqual([d.status, d.body.department.shiftName], [200, 'Cửa hàng']);
    assert.equal((await hr.put(`/api/users/${ids.nvB}`, { shiftId: s.id })).status, 400, 'ca khu A cho người khu B');
    const u = await qk.put(`/api/users/${ids.nvA}`, { shiftId: s.id });
    assert.deepEqual([u.status, u.body.user.shiftId], [200, s.id]);
    assert.equal((await qk.del(`/api/shifts/${s.id}`)).status, 409);
    const put = await qk.put(`/api/shifts/${s.id}`, { workStart: '06:30' });
    assert.equal(put.status, 200);
    assert.equal(typeof put.body.recomputed, 'number');
    assert.ok(put.body.recomputed >= 1, 'đã tính lại cho NVA');
  } finally {
    await app.close();
  }
});

test('quản trị khu không tự đổi ca riêng của mình', async () => {
  const { app, ids } = await setup();
  try {
    app.db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(ids.pa, ids.qk);
    const qk = await loginAs(app, 'QKA');
    const s = (await qk.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    assert.equal((await qk.put(`/api/users/${ids.qk}`, { shiftId: s.id })).status, 400);
  } finally {
    await app.close();
  }
});

test('ngày lễ: HR toàn hệ thống thêm/xóa, mọi người xem theo năm; thêm ngày đã qua thì tính lại ngày đó', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NVA');
    assert.equal((await nv.post('/api/holidays', { date: '2026-12-31', name: 'X' })).status, 403);
    assert.equal((await hr.post('/api/holidays', { date: '31/12/2026', name: 'X' })).status, 400);
    assert.equal((await hr.post('/api/holidays', { date: '2026-12-31', name: '' })).status, 400);
    const h = await hr.post('/api/holidays', { date: '2026-10-13', name: 'Nghỉ bù' });
    assert.equal(h.status, 200);
    assert.ok(h.body.recomputed >= 1);
    assert.equal((await hr.post('/api/holidays', { date: '2026-10-13', name: 'Trùng' })).status, 409);
    assert.deepEqual((await nv.get('/api/holidays?year=2026')).body.holidays, [{ date: '2026-10-13', name: 'Nghỉ bù' }]);
    assert.deepEqual((await nv.get('/api/holidays?year=2025')).body.holidays, []);
    assert.equal((await hr.del('/api/holidays/2026-10-13')).status, 200);
    assert.equal((await hr.del('/api/holidays/2026-10-13')).status, 404);
  } finally {
    await app.close();
  }
});

test('ca mặc định: PUT /settings/work nhận ngày làm và ngưỡng mới, trả số dòng đã tính lại', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.put('/api/settings/work', {
      workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30, workDays: [1, 2, 3, 4, 5, 6], earlyArrivalMinutes: 20, earlyLeaveMinutes: 5,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.settings.workDays, r.body.settings.earlyLeaveMinutes], [[1, 2, 3, 4, 5, 6], 5]);
    assert.equal(typeof r.body.recomputed, 'number');
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, FAIL**

Run: `npx tsx --test tests/shifts-api.test.ts` — Expected: FAIL (`/api/shifts` 404).

- [ ] **Step 3: `shared/types.ts`, `server/repo.ts`, `server/routes/departments.ts` (đọc)**

`User` thêm `shiftId: string | null; shiftName: string | null; // ca riêng (null = theo phòng ban)`; `Department` thêm `shiftId: string | null; shiftName: string | null;`.

`USER_SELECT`: thêm `u.shift_id, us.name AS shift_name,` vào danh sách cột và `LEFT JOIN shifts us ON us.id = u.shift_id` vào cuối; `mapUser` thêm `shiftId: r.shift_id ?? null, shiftName: r.shift_name ?? null,`.

`DEPT_SELECT`: thêm `d.shift_id, ds.name AS shift_name,` và `LEFT JOIN shifts ds ON ds.id = d.shift_id`; `mapDept` thêm `shiftId: r.shift_id ?? null, shiftName: r.shift_name ?? null,`.

- [ ] **Step 4: Tạo `server/routes/shifts.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError } from '../errors';
import { currentUser, } from '../middleware';
import { areaColumnSql, isGlobalHr, managesArea, notFound, parseAreaFilter, requireGlobalHr, requireManager, resolveAreaFor } from '../access';
import { SYSTEM_ADMIN_CODE } from '../bootstrap';
import { formatWorkDays, getShift, mapShift, SHIFT_SELECT, validateShiftInput } from '../shifts';
import { monthToDate, recomputeUsers } from '../attendance';
import type { Row } from '../repo';
import { isValidDate, toVnDate } from '../vntime';
import type { Holiday } from '../../shared/types';

/** Nhân sự (trừ ADMIN) đang gán ca này, qua ca riêng hoặc qua phòng ban. */
export function usersOfShift(db: Db, shiftId: string): string[] {
  return (
    db
      .prepare('SELECT u.id FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.code != ? AND (u.shift_id = ? OR d.shift_id = ?)')
      .all(SYSTEM_ADMIN_CODE, shiftId, shiftId) as { id: string }[]
  ).map((r) => r.id);
}

export function allStaffIds(db: Db): string[] {
  return (db.prepare('SELECT id FROM users WHERE code != ?').all(SYSTEM_ADMIN_CODE) as { id: string }[]).map((r) => r.id);
}

export function shiftRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();
  const recomputeMonth = (ids: string[]) => {
    const { from, to } = monthToDate(ctx.now());
    return recomputeUsers(db, ids, from, to, ctx.now());
  };

  r.get('/shifts', requireManager, (req, res) => {
    const actor = currentUser(req);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), 's.area_id');
    const scope = isGlobalHr(actor)
      ? { sql: '1=1', params: [] as string[] }
      : actor.areaIds.length
        ? { sql: `s.area_id IN (${actor.areaIds.map(() => '?').join(', ')})`, params: [...actor.areaIds] }
        : { sql: '0=1', params: [] as string[] };
    const rows = db.prepare(`${SHIFT_SELECT} WHERE ${scope.sql} AND ${f.sql} ORDER BY a.code, s.name`).all(...scope.params, ...f.params) as Row[];
    res.json({ shifts: rows.map(mapShift) });
  });

  r.post('/shifts', requireManager, (req, res) => {
    const actor = currentUser(req);
    const b = req.body ?? {};
    const areaId = resolveAreaFor(db, actor, b.areaId);
    if (!areaId) throw new HttpError(400, 'Hãy chọn khu vực cho ca');
    const s = validateShiftInput(b);
    if (db.prepare('SELECT 1 FROM shifts WHERE area_id = ? AND name = ?').get(areaId, s.name)) throw new HttpError(409, 'Khu này đã có ca cùng tên');
    const id = newId('shift');
    db.prepare(
      `INSERT INTO shifts(id, area_id, name, work_start, work_end, work_days, late_grace_minutes, early_arrival_minutes, early_leave_minutes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, areaId, s.name, s.workStart, s.workEnd, formatWorkDays(s.workDays), s.lateGraceMinutes, s.earlyArrivalMinutes, s.earlyLeaveMinutes, toVnDate(ctx.now()));
    res.json({ shift: getShift(db, id) });
  });

  r.put('/shifts/:id', requireManager, (req, res) => {
    const cur = getShift(db, req.params.id);
    if (!cur || !managesArea(currentUser(req), cur.areaId)) throw notFound('ca');
    const s = validateShiftInput({ ...cur, ...(req.body ?? {}) });
    const dup = db.prepare('SELECT id FROM shifts WHERE area_id = ? AND name = ?').get(cur.areaId, s.name) as { id: string } | undefined;
    if (dup && dup.id !== cur.id) throw new HttpError(409, 'Khu này đã có ca cùng tên');
    db.prepare(
      `UPDATE shifts SET name = ?, work_start = ?, work_end = ?, work_days = ?, late_grace_minutes = ?, early_arrival_minutes = ?, early_leave_minutes = ? WHERE id = ?`,
    ).run(s.name, s.workStart, s.workEnd, formatWorkDays(s.workDays), s.lateGraceMinutes, s.earlyArrivalMinutes, s.earlyLeaveMinutes, cur.id);
    const recomputed = recomputeMonth(usersOfShift(db, cur.id));
    res.json({ shift: getShift(db, cur.id), recomputed });
  });

  r.delete('/shifts/:id', requireManager, (req, res) => {
    const cur = getShift(db, req.params.id);
    if (!cur || !managesArea(currentUser(req), cur.areaId)) throw notFound('ca');
    if (cur.departmentCount > 0 || cur.userCount > 0) throw new HttpError(409, 'Ca đang được phòng ban hoặc nhân sự sử dụng');
    db.prepare('DELETE FROM shifts WHERE id = ?').run(cur.id);
    res.json({ success: true });
  });

  r.get('/holidays', (req, res) => {
    const year = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year) ? req.query.year : toVnDate(ctx.now()).slice(0, 4);
    const rows = db.prepare('SELECT date, name FROM holidays WHERE date LIKE ? ORDER BY date').all(`${year}-%`) as unknown as Holiday[];
    res.json({ holidays: rows.map((h) => ({ date: h.date, name: h.name })) });
  });

  /** Ngày lễ đổi: tính lại đúng ngày đó cho mọi người, nếu ngày đã tới. */
  const recomputeDate = (date: string) => (date <= toVnDate(ctx.now()) ? recomputeUsers(db, allStaffIds(db), date, date, ctx.now()) : 0);

  r.post('/holidays', requireGlobalHr, (req, res) => {
    const b = req.body ?? {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!isValidDate(b.date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    if (!name) throw new HttpError(400, 'Tên ngày lễ là bắt buộc');
    if (db.prepare('SELECT 1 FROM holidays WHERE date = ?').get(b.date)) throw new HttpError(409, 'Ngày này đã là ngày lễ');
    db.prepare('INSERT INTO holidays(date, name) VALUES (?, ?)').run(b.date, name);
    res.json({ holiday: { date: b.date, name }, recomputed: recomputeDate(b.date) });
  });

  r.delete('/holidays/:date', requireGlobalHr, (req, res) => {
    const result = db.prepare('DELETE FROM holidays WHERE date = ?').run(req.params.date);
    if (Number(result.changes) === 0) throw notFound('ngày lễ');
    res.json({ success: true, recomputed: recomputeDate(req.params.date) });
  });

  return r;
}
```

`server/app.ts`: `import { shiftRoutes } from './routes/shifts';` và `api.use(shiftRoutes(ctx));` sau `api.use(areaRoutes(ctx));`.

- [ ] **Step 5: `PUT /settings/work` tính lại (`server/routes/settings.ts`)**

```ts
import { monthToDate, recomputeUsers } from '../attendance';
import { allStaffIds } from './shifts';
…
  r.put('/settings/work', requireGlobalHr, (req, res) => {
    saveWorkSettings(db, validateWorkSettings(req.body));
    // Ca mặc định đổi: tính lại từ đầu tháng cho mọi người (người có ca riêng/ca phòng tính lại không đổi gì)
    const { from, to } = monthToDate(ctx.now());
    const recomputed = recomputeUsers(db, allStaffIds(db), from, to, ctx.now());
    res.json({ settings: getWorkSettings(db), recomputed });
  });
```

- [ ] **Step 6: Gán ca ở phòng ban (`server/routes/departments.ts`)**

Thêm hàm:

```ts
/** Ca cho phòng ban: null = ca mặc định; ca phải thuộc đúng khu của phòng. */
function resolveDeptShift(db: Db, shiftId: unknown, areaId: string | null): string | null {
  if (shiftId === undefined || shiftId === null || shiftId === '') return null;
  const s = typeof shiftId === 'string' ? (db.prepare('SELECT area_id FROM shifts WHERE id = ?').get(shiftId) as { area_id: string } | undefined) : undefined;
  if (!s || s.area_id !== areaId) throw new HttpError(400, 'Ca không thuộc khu của phòng ban này');
  return shiftId as string;
}
```

- `POST /departments`: sau khi có `areaId`, `const shiftId = resolveDeptShift(db, b.shiftId, areaId);` và ghi cột `shift_id` trong câu `INSERT`.
- `PUT /departments/:id`: trong phần kiểm tra trước khi ghi, tính `const areaAfter = b.areaId === undefined ? dept.areaId : <khu mới đã kiểm tra>`; nếu `b.shiftId !== undefined` thì `const shiftId = resolveDeptShift(db, b.shiftId, areaAfter)`; trong giao dịch ghi `UPDATE departments SET shift_id = ? WHERE id = ?`. Sau khi ghi, nếu `shift_id` hoặc `area_id` đổi: tính lại thành viên phòng từ đầu tháng:

```ts
      const members = (db.prepare('SELECT id FROM users WHERE department_id = ?').all(dept.id) as { id: string }[]).map((x) => x.id);
      const { from, to } = monthToDate(ctx.now());
      recomputeUsers(db, members, from, to, ctx.now());
```

(import `monthToDate, recomputeUsers` từ `'../attendance'`).

- [ ] **Step 7: Gán ca ở nhân sự (`server/routes/users.ts`)**

Thêm hàm:

```ts
/** Ca riêng cho nhân sự: null = theo phòng ban; ca phải thuộc khu của phòng ban người đó. */
function resolveUserShift(db: Db, shiftId: unknown, departmentId: string | null): string | null {
  if (shiftId === undefined || shiftId === null || shiftId === '') return null;
  const area = departmentId ? (deptAreaId(db, departmentId) ?? null) : null;
  const s = typeof shiftId === 'string' ? (db.prepare('SELECT area_id FROM shifts WHERE id = ?').get(shiftId) as { area_id: string } | undefined) : undefined;
  if (!s || area === null || s.area_id !== area) throw new HttpError(400, 'Ca không thuộc khu của nhân sự này');
  return shiftId as string;
}
```

- `POST /users`: sau `departmentId`, `const shiftId = resolveUserShift(db, b.shiftId, departmentId);`; câu `INSERT` thêm cột `shift_id`.
- `PUT /users/:id`:
  - Trong khối giới hạn tự sửa của quản trị khu (đợt A: chỉ name/email/phone/position): thêm `shiftId` vào danh sách khóa bị chặn (thay đổi `shiftId` của chính mình ⇒ 400 với cùng thông báo).
  - Kiểm tra trước khi ghi: `const deptAfter = changesDept ? <phòng mới đã resolve> : target.departmentId;` và nếu `b.shiftId !== undefined` thì `set('shift_id', resolveUserShift(db, b.shiftId, deptAfter))`.
  - Sau khi ghi, nếu `shiftId` hoặc phòng ban đổi: `recomputeUsers(db, [target.id], from, to, ctx.now())` với `monthToDate(ctx.now())`.

- [ ] **Step 8: Ma trận quyền (`tests/permissions.test.ts`)**

Trong `setup` thêm: `app.db.prepare("INSERT INTO shifts(id, area_id, name, work_start, work_end, work_days, late_grace_minutes, early_arrival_minutes, early_leave_minutes, created_at) VALUES ('sA', ?, 'Ca A', '08:00', '17:00', '1,2,3,4,5', 15, 15, 10, 'x'), ('sDel', ?, 'Ca xóa', '08:00', '17:00', '1,2,3,4,5', 15, 15, 10, 'x')").run(A, A);`

Thêm vào `CASES` (trước nhóm xóa):

```ts
  { method: 'GET', path: () => '/api/shifts', allowed: MANAGERS },
  { method: 'POST', path: (i) => '/api/shifts', body: { name: 'Mới' }, allowed: MANAGERS },
  { method: 'PUT', path: () => '/api/shifts/sA', body: { lateGraceMinutes: 10 }, allowed: MANAGERS },
  { method: 'GET', path: () => '/api/holidays', allowed: ALL },
  { method: 'POST', path: () => '/api/holidays', body: { date: '2026-12-31', name: 'Lễ' }, allowed: GLOBAL },
```

và vào nhóm xóa: `{ method: 'DELETE', path: () => '/api/shifts/sDel', allowed: MANAGERS },`, `{ method: 'DELETE', path: () => '/api/holidays/2026-12-31', allowed: GLOBAL },`.

- [ ] **Step 9: Chạy test, PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/shifts-api.test.ts tests/permissions.test.ts && npm test && npm run lint` — Expected: PASS.

```bash
git add server shared tests
git commit -m "feat(shifts): shift and holiday APIs, shift assignment for departments and staff, month-to-date recompute

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Đơn nghỉ phép và công tác theo khoảng ngày

**Files:**
- Modify: `server/routes/requests.ts` (POST, PUT, `mapRequest`)
- Test: `tests/leave-requests.test.ts` (mới); sửa `tests/requests-routes.test.ts` nếu có ca mong đợi cũ về `leave_request` ngày tương lai

**Interfaces:**
- Consumes: `recomputeUsers` (Task 3); `RequestType` có `business_trip`, `AttendanceRequest.endDate` (Task 1); `addDays`, `daysBetween`, `isValidDate`, `toVnDate`.
- Produces: `LEAVE_TYPES = ['leave_request', 'business_trip']`, `MAX_LEAVE_DAYS = 31`, `MAX_LEAVE_AHEAD_DAYS = 7` (trong `server/routes/requests.ts`); `POST /api/requests` nhận `endDate`; duyệt đơn nghỉ/công tác ⇒ tính lại các ngày trong khoảng; chồng ngày với đơn đã duyệt ⇒ 409.

- [ ] **Step 1: Viết test `tests/leave-requests.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedDepartment, seedUser, loginAs } from './helpers';
import { addDays } from '../server/vntime';

const NOW = Date.UTC(2026, 9, 14, 3, 0); // thứ 4 14/10/2026, 10:00 giờ VN

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const kt = seedDepartment(app.db, 'KT');
  seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt });
  const nv = seedUser(app.db, { code: 'NV01', departmentId: kt });
  return { app, nv, tp: await loginAs(app, 'TP01'), me: await loginAs(app, 'NV01') };
}
const statuses = (app: { db: { prepare: (s: string) => { all: (...a: unknown[]) => unknown[] } } }, id: string) =>
  (app.db.prepare('SELECT work_date, status FROM attendance_days WHERE user_id = ? ORDER BY work_date').all(id) as { work_date: string; status: string }[]).map((x) => `${x.work_date}:${x.status}`);

test('gửi đơn theo khoảng: kiểm tra khoảng, tối đa 31 ngày, trước tối đa 7 ngày; loại khác không cho tương lai', async () => {
  const { app, me } = await setup();
  try {
    const ok = await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-16', endDate: '2026-10-19', reason: 'Việc nhà' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.request.endDate, '2026-10-19');
    assert.equal((await me.post('/api/requests', { type: 'business_trip', workDate: '2026-10-21', reason: 'x' })).status, 200, 'đúng hôm nay + 7');
    assert.equal((await me.post('/api/requests', { type: 'business_trip', workDate: '2026-10-22', reason: 'x' })).status, 400, 'quá 7 ngày');
    assert.equal((await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-19', endDate: '2026-10-16', reason: 'x' })).status, 400);
    assert.equal((await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-01', endDate: addDays('2026-10-01', 31), reason: 'x' })).status, 400, '32 ngày');
    assert.equal((await me.post('/api/requests', { type: 'late_explanation', workDate: '2026-10-15', reason: 'x' })).status, 400, 'giải trình cho ngày tương lai');
    assert.equal((await me.post('/api/requests', { type: 'late_explanation', workDate: '2026-10-14', endDate: '2026-10-15', reason: 'x' })).status, 400, 'loại khác không có khoảng');
  } finally {
    await app.close();
  }
});

test('Review Focus #4: duyệt nghỉ phép thứ 6 → thứ 2 chỉ đánh dấu thứ 6 và thứ 2', async () => {
  const { app, nv, tp, me } = await setup();
  try {
    const r = (await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-16', endDate: '2026-10-19', reason: 'x' })).body.request;
    assert.equal((await tp.put(`/api/requests/${r.id}`, { status: 'approved' })).status, 200);
    assert.deepEqual(statuses(app, nv), ['2026-10-16:leave', '2026-10-19:leave']);
  } finally {
    await app.close();
  }
});

test('duyệt đơn chồng ngày với đơn đã duyệt ⇒ 409; từ chối không đổi ngày công', async () => {
  const { app, nv, tp, me } = await setup();
  try {
    const a = (await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-15', endDate: '2026-10-16', reason: 'x' })).body.request;
    const b = (await me.post('/api/requests', { type: 'business_trip', workDate: '2026-10-16', reason: 'x' })).body.request;
    const c = (await me.post('/api/requests', { type: 'business_trip', workDate: '2026-10-20', reason: 'x' })).body.request;
    assert.equal((await tp.put(`/api/requests/${a.id}`, { status: 'approved' })).status, 200);
    const dup = await tp.put(`/api/requests/${b.id}`, { status: 'approved' });
    assert.deepEqual([dup.status, dup.body.error], [409, 'Khoảng ngày trùng với đơn đã duyệt']);
    assert.equal((await tp.put(`/api/requests/${c.id}`, { status: 'rejected' })).status, 200);
    assert.deepEqual(statuses(app, nv), ['2026-10-15:leave', '2026-10-16:leave']);
  } finally {
    await app.close();
  }
});
```


- [ ] **Step 2: Chạy test, FAIL**

Run: `npx tsx --test tests/leave-requests.test.ts` — Expected: FAIL (`endDate` bị bỏ qua, ngày tương lai bị chặn).

- [ ] **Step 3: `server/routes/requests.ts` — POST**

```ts
const TYPES: RequestType[] = ['missed_punch', 'late_explanation', 'leave_request', 'business_trip'];
export const LEAVE_TYPES: RequestType[] = ['leave_request', 'business_trip'];
export const MAX_LEAVE_DAYS = 31;
export const MAX_LEAVE_AHEAD_DAYS = 7;
```

Trong `POST /requests`, thay hai dòng kiểm tra ngày tương lai và loại đơn bằng:

```ts
    if (!isValidDate(b.workDate)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    if (!TYPES.includes(b.type)) throw new HttpError(400, 'Loại đơn không hợp lệ');
    const today = toVnDate(ctx.now());
    const isLeave = LEAVE_TYPES.includes(b.type);
    let endDate: string | null = null;
    if (isLeave) {
      if (b.endDate !== undefined && b.endDate !== null && b.endDate !== '') {
        if (!isValidDate(b.endDate)) throw new HttpError(400, 'Ngày kết thúc không hợp lệ (định dạng YYYY-MM-DD)');
        if (b.endDate < b.workDate) throw new HttpError(400, 'Ngày kết thúc phải từ ngày bắt đầu trở đi');
        if (daysBetween(b.workDate, b.endDate) >= MAX_LEAVE_DAYS) throw new HttpError(400, `Mỗi đơn tối đa ${MAX_LEAVE_DAYS} ngày`);
        endDate = b.endDate === b.workDate ? null : b.endDate;
      }
      if (daysBetween(today, b.workDate) > MAX_LEAVE_AHEAD_DAYS) throw new HttpError(400, `Chỉ gửi đơn trước tối đa ${MAX_LEAVE_AHEAD_DAYS} ngày`);
    } else {
      if (b.endDate !== undefined && b.endDate !== null && b.endDate !== '') throw new HttpError(400, 'Chỉ đơn nghỉ phép và công tác mới chọn khoảng ngày');
      if (b.workDate > today) throw new HttpError(400, 'Không thể gửi đơn cho ngày trong tương lai');
    }
```

câu `INSERT` thêm cột `end_date` với giá trị `endDate`. Import `daysBetween` từ `'../vntime'`.

- [ ] **Step 4: `PUT /requests/:id` — duyệt đơn nghỉ/công tác**

Trong khối `tx(db, () => { … })`, thay chú thích `// leave_request: chỉ đổi trạng thái đơn …` bằng:

```ts
      if (LEAVE_TYPES.includes(target.type)) {
        const to = target.endDate ?? target.workDate;
        const overlap = db
          .prepare(
            `SELECT 1 FROM requests WHERE user_id = ? AND id != ? AND status = 'approved' AND type IN ('leave_request', 'business_trip')
             AND work_date <= ? AND COALESCE(end_date, work_date) >= ?`,
          )
          .get(target.userId, target.id, to, target.workDate);
        if (overlap) throw new HttpError(409, 'Khoảng ngày trùng với đơn đã duyệt');
        recomputeUsers(db, [target.userId], target.workDate, to, ctx.now());
      }
```

(đặt sau câu `UPDATE requests SET status …` và sau `if (status !== 'approved') return;`; lỗi 409 ném trong `tx` sẽ hoàn tác cả việc đổi trạng thái đơn). Import `recomputeUsers` từ `'../attendance'`. Các lời gọi `applyDayAdjustment(...)` sẵn có giữ nguyên (tham số `now` mặc định).

- [ ] **Step 5: Chạy test, PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/leave-requests.test.ts tests/requests-routes.test.ts && npm test && npm run lint` — Expected: PASS.

```bash
git add server tests
git commit -m "feat(requests): leave and business-trip requests over a date range, applied to attendance on approval

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Thống kê và bảng công theo trạng thái mới

**Files:**
- Modify: `server/routes/attendance.ts` (`/stats`, `/stats/details`, `DETAIL_FILTER`)
- Modify: `shared/types.ts` (`StatsData`, `StatsDetailType`, `StatsDetailRow`)
- Test: `tests/stats-b.test.ts` (mới); sửa test thống kê cũ nếu số liệu đổi vì luật mới

**Interfaces:**
- Consumes: `effectiveShift`, `isWorkday` (Task 2); `approvedLeaveType`, `shiftEndTs` (Task 3).
- Produces: `StatsData` thêm `absentCount`, `leaveCount`, `businessTripCount`, `earlyArrivalCount`; `notCheckedInCount` = nhân sự đang làm, hôm nay là ngày làm việc của ca, chưa có dòng ngày công. `StatsDetailType` thêm `'absent' | 'leave' | 'business_trip' | 'early_arrival'`. `StatsDetailRow` thêm `earlyArrivalMinutes: number`, `earlyMinutes: number`, `final: boolean`.

- [ ] **Step 1: Viết test `tests/stats-b.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedDepartment, seedUser, loginAs } from './helpers';
import { closeDays, recomputeDay } from '../server/attendance';
import { vnDateTimeToTs } from '../server/vntime';

const DAY = '2026-10-15'; // thứ 5
test('thống kê: vắng, nghỉ phép, công tác, đi sớm, chưa điểm danh theo ngày làm việc của ca', async () => {
  let now = vnDateTimeToTs(DAY, '10:00');
  const app = await startTestApp({ now: () => now });
  try {
    const kt = seedDepartment(app.db, 'KT');
    seedUser(app.db, { code: 'ADMIN', role: 'hr' }); // tài khoản hệ thống: không tính vào thống kê
    const ids = ['A', 'B', 'C', 'D', 'E'].map((c) => seedUser(app.db, { code: c, departmentId: kt }));
    const [a, b, c] = ids;
    app.db.prepare("INSERT INTO detections(user_id, device_id, ts, work_date, source) VALUES (?, 'DEV1', ?, ?, 'webhook')").run(a, vnDateTimeToTs(DAY, '07:30'), DAY);
    recomputeDay(app.db, a, DAY, now);
    app.db.prepare("INSERT INTO requests(id, user_id, work_date, type, reason, status, created_at) VALUES ('r1', ?, ?, 'leave_request', 'x', 'approved', 'x'), ('r2', ?, ?, 'business_trip', 'x', 'approved', 'x')").run(b, DAY, c, DAY);
    recomputeDay(app.db, b, DAY, now);
    recomputeDay(app.db, c, DAY, now);
    const hr = await loginAs(app, 'ADMIN');
    let s = (await hr.get('/api/stats')).body;
    assert.deepEqual(
      [s.presentCount, s.earlyArrivalCount, s.leaveCount, s.businessTripCount, s.absentCount, s.notCheckedInCount],
      [1, 1, 1, 1, 0, 2],
      '10:00: D và E chưa điểm danh',
    );
    now = vnDateTimeToTs(DAY, '17:30');
    closeDays(app.db, now);
    s = (await hr.get('/api/stats')).body;
    assert.deepEqual([s.absentCount, s.notCheckedInCount], [2, 0]);
    const absent = (await hr.get('/api/stats/details?type=absent')).body.rows.map((r: { employeeCode: string }) => r.employeeCode);
    assert.deepEqual(absent, ['D', 'E']);
    assert.deepEqual((await hr.get('/api/stats/details?type=early_arrival')).body.rows.map((r: { employeeCode: string }) => r.employeeCode), ['A']);
  } finally {
    await app.close();
  }
});

test('chưa điểm danh không tính người có ngày nghỉ theo ca (thứ 7 với ca T2–T6)', async () => {
  const now = vnDateTimeToTs('2026-10-17', '10:00');
  const app = await startTestApp({ now: () => now });
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'NV01', departmentId: seedDepartment(app.db, 'KT') });
    assert.equal((await (await loginAs(app, 'ADMIN')).get('/api/stats')).body.notCheckedInCount, 0);
  } finally {
    await app.close();
  }
});
```


- [ ] **Step 2: Chạy test, FAIL**

Run: `npx tsx --test tests/stats-b.test.ts` — Expected: FAIL (`earlyArrivalCount` undefined).

- [ ] **Step 3: Kiểu dữ liệu (`shared/types.ts`)**

```ts
export interface StatsData {
  date: string;
  totalEmployees: number;
  presentCount: number; // có giờ vào hôm nay
  onTimeCount: number;
  lateCount: number;
  missingOutCount: number;
  earlyArrivalCount: number;
  absentCount: number;
  leaveCount: number;
  businessTripCount: number;
  notCheckedInCount: number; // hôm nay là ngày làm việc của ca, chưa có dòng ngày công
  pendingRequests: number;
  totalCameras: number;
}

export type StatsDetailType = 'total' | 'present' | 'on_time' | 'late' | 'missing_out' | 'not_checked_in' | 'absent' | 'leave' | 'business_trip' | 'early_arrival';
```

`StatsDetailRow` thêm `earlyArrivalMinutes: number; earlyMinutes: number; final: boolean;`.

- [ ] **Step 4: `server/routes/attendance.ts`**

```ts
const DETAIL_FILTER: Record<StatsDetailType, string> = {
  total: '1 = 1',
  present: 'a.first_in IS NOT NULL',
  on_time: "a.first_in IS NOT NULL AND a.late_minutes = 0 AND a.status NOT IN ('leave', 'business_trip')",
  late: 'a.late_minutes > 0',
  missing_out: "a.status = 'missing_out'",
  not_checked_in: 'a.user_id IS NULL',
  absent: "a.status = 'absent'",
  leave: "a.status = 'leave'",
  business_trip: "a.status = 'business_trip'",
  early_arrival: 'a.early_arrival_minutes > 0',
};
```

`GET /stats`: thay truy vấn `day` bằng:

```ts
    const day = db
      .prepare(
        `SELECT
           SUM(CASE WHEN a.first_in IS NOT NULL THEN 1 ELSE 0 END) AS present,
           SUM(CASE WHEN ${DETAIL_FILTER.on_time} THEN 1 ELSE 0 END) AS on_time,
           SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late,
           SUM(CASE WHEN a.status = 'missing_out' THEN 1 ELSE 0 END) AS missing_out,
           SUM(CASE WHEN a.early_arrival_minutes > 0 THEN 1 ELSE 0 END) AS early_arrival,
           SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
           SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END) AS leave,
           SUM(CASE WHEN a.status = 'business_trip' THEN 1 ELSE 0 END) AS business_trip
         FROM attendance_days a JOIN users u ON u.id = a.user_id
         WHERE a.work_date = ? AND u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where}`,
      )
      .get(date, ...params) as Record<string, number | null>;
```

và đếm "chưa điểm danh" bằng JS (ngày làm việc phụ thuộc ca từng người):

```ts
    const noRow = (
      db
        .prepare(
          `SELECT u.id FROM users u LEFT JOIN attendance_days a ON a.user_id = u.id AND a.work_date = ?
           WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where} AND a.user_id IS NULL`,
        )
        .all(date, ...params) as { id: string }[]
    ).map((r) => r.id);
    const notCheckedIn = noRow.filter((id) => isWorkday(db, effectiveShift(db, id), date)).length;
```

Body: `presentCount: day.present ?? 0, onTimeCount: day.on_time ?? 0, lateCount: day.late ?? 0, missingOutCount: day.missing_out ?? 0, earlyArrivalCount: day.early_arrival ?? 0, absentCount: day.absent ?? 0, leaveCount: day.leave ?? 0, businessTripCount: day.business_trip ?? 0, notCheckedInCount: notCheckedIn`.

`GET /stats/details`: thêm cột `a.early_minutes, a.early_arrival_minutes, a.final` vào SELECT; sau khi lấy `rows`, nếu `type === 'not_checked_in'` thì lọc `rows.filter((x) => isWorkday(db, effectiveShift(db, x.id), date))`; map thêm `earlyArrivalMinutes: x.early_arrival_minutes ?? 0, earlyMinutes: x.early_minutes ?? 0, final: x.final === 1`.

Import `effectiveShift, isWorkday` từ `'../shifts'`.

- [ ] **Step 5: Chạy test, PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/stats-b.test.ts && npm test && npm run lint` — Expected: PASS. Test thống kê cũ (`attendance-routes.test.ts`, `area-scope.test.ts`) nếu lệch vì luật mới (ví dụ `notCheckedInCount` trên ngày cuối tuần, `presentCount`), sửa mong đợi cho khớp spec và ghi vào báo cáo.

```bash
git add server shared tests
git commit -m "feat(stats): absence, leave, business trip, early arrival counts; not-checked-in by shift workday

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Giao diện ca làm việc — tab Ca làm việc, ngày lễ, chọn ca cho phòng ban và nhân sự

**Files:**
- Create: `src/components/ShiftsTab.tsx`
- Modify: `src/components/config/WorkSettingsCard.tsx` (thêm ngày làm và hai ngưỡng; thông báo số dòng tính lại)
- Modify: `src/components/HanetConfigTab.tsx` (bỏ `WorkSettingsCard`)
- Modify: `src/App.tsx`, `src/components/Navbar.tsx` (tab `shifts`)
- Modify: `src/components/DepartmentsTab.tsx` (ô "Ca làm việc"), `src/components/UserFormModal.tsx` (ô "Ca riêng"), `src/components/EmployeesTab.tsx` (hiện ca đang áp dụng)
- Modify: `src/format.ts` (`WEEKDAY_LABEL`, `formatWorkDays`)

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/shifts`, `GET/POST/DELETE /api/holidays`, `PUT /api/settings/work` (`recomputed`) (Task 4); `Shift`, `Holiday`, `WorkSettings`, `Department.shiftId/shiftName`, `User.shiftId/shiftName` (Task 2, 4); `MeResponse.areas` (đợt A).
- Produces: `ShiftsTab({ me, area, onChanged })`; `WEEKDAY_LABEL: Record<number, string>`; `formatWorkDays(days: number[]): string` (src/format.ts, ví dụ `"T2–T6"` hoặc `"T2, T4, CN"`).

- [ ] **Step 1: `src/format.ts`**

```ts
export const WEEKDAY_LABEL: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };

/** "T2–T6" khi là dãy liên tiếp từ 3 ngày, ngược lại liệt kê "T2, T4, CN". */
export function formatWorkDays(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return 'Cả tuần';
  const consecutive = d.length >= 3 && d.every((n, i) => i === 0 || n === d[i - 1] + 1);
  return consecutive ? `${WEEKDAY_LABEL[d[0]]}–${WEEKDAY_LABEL[d[d.length - 1]]}` : d.map((n) => WEEKDAY_LABEL[n]).join(', ');
}
```

- [ ] **Step 2: `src/components/config/WorkSettingsCard.tsx`**

Đổi tiêu đề thành "Ca mặc định công ty". Trong form, sau ô "Ngưỡng giờ ra", thêm:

```tsx
          <Field label="Ngưỡng đi sớm (phút)" hint="Vào trước giờ vào quá chừng này thì ghi Đi sớm">
            <input type="number" min={0} max={120} className={inputCls} value={ws.earlyArrivalMinutes} onChange={(e) => setWs({ ...ws, earlyArrivalMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Cho phép về sớm (phút)" hint="Ra trước giờ ra quá chừng này mới tính về sớm (xét sau giờ ra)">
            <input type="number" min={0} max={120} className={inputCls} value={ws.earlyLeaveMinutes} onChange={(e) => setWs({ ...ws, earlyLeaveMinutes: Number(e.target.value) })} />
          </Field>
          <div className="col-span-2">
            <span className="block font-semibold text-slate-700 mb-1 text-xs">Ngày làm trong tuần</span>
            <WeekdayPicker value={ws.workDays} onChange={(workDays) => setWs({ ...ws, workDays })} />
          </div>
```

`save`: nhận `{ settings, recomputed }` và thông báo `` `Đã lưu. Đã tính lại ${r.recomputed} ngày công từ đầu tháng.` ``.

Thêm vào `src/components/ui.tsx` (dùng chung với ShiftsTab):

```tsx
import { WEEKDAY_LABEL } from '../format';

export const WeekdayPicker: React.FC<{ value: number[]; onChange: (v: number[]) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
      const on = value.includes(d);
      return (
        <button
          key={d}
          type="button"
          onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}
          className={`w-9 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
          aria-pressed={on}
        >
          {WEEKDAY_LABEL[d]}
        </button>
      );
    })}
  </div>
);
```

`src/components/HanetConfigTab.tsx`: bỏ `<WorkSettingsCard … />` và import của nó (thẻ chuyển sang tab Ca làm việc).

- [ ] **Step 3: Tạo `src/components/ShiftsTab.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Holiday, MeResponse, Shift } from '../types';
import { api, errorMessage } from '../api';
import { areaParam } from '../area';
import { formatWorkDays } from '../format';
import { ConfirmDeleteDialog, Field, Modal, WeekdayPicker, inputCls, primaryBtn, secondaryBtn } from './ui';
import { WorkSettingsCard } from './config/WorkSettingsCard';

type Form = Omit<Shift, 'id' | 'areaName' | 'departmentCount' | 'userCount'> & { id?: string };

export const ShiftsTab: React.FC<{ me: MeResponse; area: string; onChanged: () => void }> = ({ me, area, onChanged }) => {
  const isHr = me.user.role === 'hr';
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Shift | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        api<{ shifts: Shift[] }>(`/api/shifts?area=${areaParam(area)}`),
        api<{ holidays: Holiday[] }>(`/api/holidays?year=${year}`),
      ]);
      setShifts(s.shifts);
      setHolidays(h.holidays);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [area, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const blank = (): Form => ({
    areaId: area !== 'all' && area !== 'none' ? area : (me.areas[0]?.id ?? ''),
    name: '',
    workStart: '08:00',
    workEnd: '17:00',
    workDays: [1, 2, 3, 4, 5],
    lateGraceMinutes: 15,
    earlyArrivalMinutes: 15,
    earlyLeaveMinutes: 10,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    try {
      if (form.id) {
        const r = await api<{ recomputed: number }>(`/api/shifts/${form.id}`, { method: 'PUT', body: form });
        setNotice(`Đã lưu ca. Đã tính lại ${r.recomputed} ngày công từ đầu tháng.`);
      } else {
        await api('/api/shifts', { method: 'POST', body: form });
        setNotice('Đã thêm ca. Gán ca cho phòng ban ở tab Phòng ban.');
      }
      setForm(null);
      void load();
      onChanged();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ recomputed: number }>('/api/holidays', { method: 'POST', body: newHoliday });
      setNewHoliday({ date: '', name: '' });
      setNotice(r.recomputed ? `Đã thêm ngày lễ, tính lại ${r.recomputed} ngày công.` : 'Đã thêm ngày lễ.');
      void load();
      onChanged();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  const removeHoliday = async (date: string) => {
    if (!window.confirm(`Xóa ngày lễ ${date.split('-').reverse().join('/')}?`)) return;
    try {
      await api(`/api/holidays/${date}`, { method: 'DELETE' });
      void load();
      onChanged();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  if (error) return <p className="text-xs text-rose-600">{error}</p>;
  if (!shifts) return <p className="text-xs text-slate-500">Đang tải ca làm việc...</p>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Ca làm việc</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mỗi khu có ca riêng. Phòng ban chọn ca ở tab Phòng ban; phòng chưa chọn ca dùng ca mặc định công ty. Sửa ca thì hệ thống tự tính lại công từ đầu tháng.
          </p>
        </div>
        <button onClick={() => setForm(blank())} disabled={me.areas.length === 0} className={primaryBtn}>
          <Plus className="w-4 h-4" /> Thêm ca
        </button>
      </div>
      {notice && <p className="text-xs text-emerald-800 bg-emerald-50 rounded-xl p-3">{notice}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shifts.map((s) => (
          <div key={s.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 text-xs space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm text-slate-900">{s.name}</h3>
                <p className="text-[11px] text-violet-700">{s.areaName}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setForm({ ...s })} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label={`Sửa ${s.name}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleting(s)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label={`Xóa ${s.name}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 font-mono"><Clock className="w-3.5 h-3.5 text-orange-500" /> {s.workStart}–{s.workEnd} · {formatWorkDays(s.workDays)}</div>
            <div className="text-slate-500">Muộn sau {s.lateGraceMinutes}' · đi sớm trước {s.earlyArrivalMinutes}' · về sớm quá {s.earlyLeaveMinutes}'</div>
            <div className="text-slate-500">{s.departmentCount} phòng ban · {s.userCount} người dùng ca riêng</div>
          </div>
        ))}
        {shifts.length === 0 && <p className="text-xs text-slate-500">Chưa có ca nào trong khu đang chọn.</p>}
      </div>

      {isHr && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WorkSettingsCard onRecomputed={onChanged} />
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-orange-500" /> Ngày lễ</h3>
              <select className={`${inputCls} w-auto`} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <ul className="divide-y divide-slate-100">
              {holidays.map((h) => (
                <li key={h.date} className="py-1.5 flex items-center justify-between">
                  <span><span className="font-mono">{h.date.split('-').reverse().join('/')}</span> · {h.name}</span>
                  <button onClick={() => removeHoliday(h.date)} className="text-rose-600 hover:underline cursor-pointer">Xóa</button>
                </li>
              ))}
              {holidays.length === 0 && <li className="py-1.5 text-slate-500">Chưa có ngày lễ nào trong năm {year}.</li>}
            </ul>
            <form onSubmit={addHoliday} className="flex flex-wrap gap-2">
              <input type="date" className={`${inputCls} w-auto`} value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} required />
              <input className={`${inputCls} flex-1 min-w-[140px]`} placeholder="Tên ngày lễ" value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} required />
              <button type="submit" className={secondaryBtn}>Thêm</button>
            </form>
          </div>
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Sửa ca' : 'Thêm ca'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            <Field label="Khu vực">
              <select className={inputCls} value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })} disabled={Boolean(form.id)} required>
                {me.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Tên ca">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giờ vào"><input type="time" className={inputCls} value={form.workStart} onChange={(e) => setForm({ ...form, workStart: e.target.value })} required /></Field>
              <Field label="Giờ ra"><input type="time" className={inputCls} value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} required /></Field>
              <Field label="Cho phép muộn (phút)"><input type="number" min={0} max={120} className={inputCls} value={form.lateGraceMinutes} onChange={(e) => setForm({ ...form, lateGraceMinutes: Number(e.target.value) })} /></Field>
              <Field label="Ngưỡng đi sớm (phút)"><input type="number" min={0} max={120} className={inputCls} value={form.earlyArrivalMinutes} onChange={(e) => setForm({ ...form, earlyArrivalMinutes: Number(e.target.value) })} /></Field>
              <Field label="Cho phép về sớm (phút)"><input type="number" min={0} max={120} className={inputCls} value={form.earlyLeaveMinutes} onChange={(e) => setForm({ ...form, earlyLeaveMinutes: Number(e.target.value) })} /></Field>
            </div>
            <div>
              <span className="block font-semibold text-slate-700 mb-1 text-xs">Ngày làm trong tuần</span>
              <WeekdayPicker value={form.workDays} onChange={(workDays) => setForm({ ...form, workDays })} />
            </div>
            {formError && <p className="text-rose-600">{formError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className={`${secondaryBtn} flex-1`}>Hủy</button>
              <button type="submit" className={`${primaryBtn} flex-1`}>Lưu</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDeleteDialog
          title="Xóa ca"
          confirmLabel="Xóa ca"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/api/shifts/${deleting.id}`, { method: 'DELETE' });
            setDeleting(null);
            void load();
            onChanged();
          }}
        >
          <p>Xóa ca <strong>{deleting.name}</strong>? Chỉ xóa được khi không còn phòng ban hay nhân sự nào dùng ca này.</p>
        </ConfirmDeleteDialog>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Tab mới trong `src/App.tsx` và `src/components/Navbar.tsx`**

`App.tsx`: `TABS_BY_ROLE.hr` và `.area_admin` thêm `'shifts'` (sau `'departments'`); import `ShiftsTab`; thêm `{tab === 'shifts' && <ShiftsTab me={me} area={activeArea} onChanged={refreshAll} />}`.
`Navbar.tsx`: thêm `{ id: 'shifts', label: '🕘 Ca làm việc', visible: isManager },` sau tab Phòng ban.

- [ ] **Step 5: Chọn ca ở phòng ban và nhân sự**

`DepartmentsTab.tsx`: tải danh sách ca một lần khi mở form (`api<{ shifts: Shift[] }>('/api/shifts')`, lưu state `shifts`); form thêm `shiftId: string` (giá trị ban đầu `active.shiftId ?? ''`), ô:

```tsx
            <Field label="Ca làm việc" hint="Chỉ ca thuộc khu của phòng này">
              <select className={inputCls} value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
                <option value="">Ca mặc định công ty</option>
                {shifts.filter((s) => s.areaId === form.areaId).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.workStart}–{s.workEnd})</option>
                ))}
              </select>
            </Field>
```

đổi khu ⇒ đặt `shiftId: ''`. Body `POST`/`PUT` thêm `shiftId: form.shiftId || null`. Thẻ phòng ban hiện thêm `🕘 {d.shiftName ?? 'Ca mặc định công ty'}`.

`UserFormModal.tsx`: tải `shifts` tương tự (chỉ khi người xem là `hr` hoặc `area_admin`); state `shiftId` (ban đầu `user?.shiftId ?? ''`); ô (ẩn khi `area_admin` tự sửa mình):

```tsx
          <Field label="Ca riêng" hint="Để trống: theo ca của phòng ban">
            <select className={inputCls} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">Theo phòng ban</option>
              {shifts.filter((s) => s.areaId === departments.find((d) => d.id === departmentId)?.areaId).map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.workStart}–{s.workEnd})</option>
              ))}
            </select>
          </Field>
```

đổi phòng ban ⇒ `setShiftId('')`. Body thêm `shiftId: shiftId || null` (không gửi khi `area_admin` tự sửa mình).

`EmployeesTab.tsx`: thẻ nhân sự thêm dòng "Ca" = `u.shiftName ?? departments.find((d) => d.id === u.departmentId)?.shiftName ?? 'Ca mặc định công ty'`.

- [ ] **Step 6: Kiểm tra; commit**

Run: `npm test && npm run lint && npm run build` — Expected: PASS. Hoàn nguyên `dist/`, `server.js` (`git checkout -- dist server.js && git clean -f dist`).

```bash
git add src
git commit -m "feat(ui): shifts tab with holidays and default shift, shift pickers for departments and staff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Giao diện bảng công, thẻ thống kê và đơn theo trạng thái mới

**Files:**
- Modify: `src/components/AttendanceTable.tsx`, `src/components/StatsCards.tsx`, `src/components/RequestsTab.tsx`

**Interfaces:**
- Consumes: `AttendanceDay.final/earlyArrivalMinutes/firstIn: number | null`, `DayStatus` mới (Task 1); `StatsData` và `StatsDetailType` mới (Task 6); `POST /api/requests { endDate }`, `AttendanceRequest.endDate` (Task 5).
- Produces: không có interface mới.

- [ ] **Step 1: `AttendanceTable.tsx`**

- Cột "Giờ ra": nếu `!r.final && r.lastOut !== null` hiện `` `Gần nhất ${fmtTime(r.lastOut)}` `` (chữ xám nhỏ), nếu `!r.final && r.lastOut === null` hiện `—`; ngày đã chốt giữ như cũ.
- Cột "Trạng thái": nếu `!r.final && (r.status === 'missing_out' || r.status === 'on_time' || r.status === 'late')` thêm nhãn phụ `<div className="text-[10px] text-sky-700">Đang trong giờ làm</div>`; nếu `r.earlyArrivalMinutes > 0` thêm `` ` · đến sớm ${r.earlyArrivalMinutes}'` `` vào trong nhãn; ngày `absent`/`leave`/`business_trip` không hiện phút muộn/sớm.
- `handleExportCSV`: thêm cột "Đến sớm (phút)" và giữ giờ vào/ra trống khi `null`.

- [ ] **Step 2: `StatsCards.tsx`**

`cards` thành (giữ thứ tự):

```ts
  const cards: Card[] = [
    { label: 'Nhân sự đang làm', value: stats.totalEmployees, icon: Users, tone: 'bg-slate-100 text-slate-700', detail: 'total' },
    { label: 'Có mặt hôm nay', value: stats.presentCount, icon: CheckCircle, tone: 'bg-emerald-100 text-emerald-700', detail: 'present' },
    { label: 'Vào đúng giờ', value: stats.onTimeCount, icon: Clock, tone: 'bg-sky-100 text-sky-700', detail: 'on_time' },
    { label: 'Đến sớm', value: stats.earlyArrivalCount, icon: Sunrise, tone: 'bg-teal-100 text-teal-700', detail: 'early_arrival' },
    { label: 'Đi muộn', value: stats.lateCount, icon: AlertTriangle, tone: 'bg-rose-100 text-rose-700', detail: 'late' },
    { label: 'Chưa có giờ ra', value: stats.missingOutCount, icon: LogOut, tone: 'bg-amber-100 text-amber-700', detail: 'missing_out' },
    { label: 'Chưa điểm danh', value: stats.notCheckedInCount, icon: UserX, tone: 'bg-slate-100 text-slate-700', detail: 'not_checked_in' },
    { label: 'Vắng', value: stats.absentCount, icon: UserMinus, tone: 'bg-rose-50 text-rose-700', detail: 'absent' },
    { label: 'Nghỉ phép', value: stats.leaveCount, icon: Palmtree, tone: 'bg-purple-100 text-purple-700', detail: 'leave' },
    { label: 'Công tác', value: stats.businessTripCount, icon: Briefcase, tone: 'bg-sky-50 text-sky-700', detail: 'business_trip' },
    { label: 'Đơn chờ duyệt', value: stats.pendingRequests, icon: FileText, tone: 'bg-purple-50 text-purple-700', detail: 'requests' },
  ];
```

(import thêm `Sunrise, UserMinus, Palmtree, Briefcase` từ `lucide-react`; lưới đổi `lg:grid-cols-6`). Trong `StatsDetailModal`: `showTimes` thêm điều kiện `type !== 'absent'`; cột trạng thái dùng `DAY_STATUS_LABEL`, hiện thêm `· đến sớm N'` và `· về sớm N'` khi > 0.

- [ ] **Step 3: `RequestsTab.tsx`**

- `TYPE_META.leave_request.label` ⇒ `'Nghỉ phép'`; `business_trip` đã thêm ở Task 1.
- State `endDate` (mặc định `''`). Trong form: khi `type === 'leave_request' || type === 'business_trip'` hiện hai ô "Từ ngày" (`workDate`, `max` = hôm nay + 7) và "Đến ngày" (`endDate`, `min` = `workDate`), kèm gợi ý "Tối đa 31 ngày, gửi trước tối đa 7 ngày; chỉ tính ngày làm việc của ca"; loại khác giữ một ô "Ngày" (`max` = hôm nay).
- Body thêm `...(type === 'leave_request' || type === 'business_trip' ? { endDate: endDate || undefined } : {})`.
- Thêm `<option value="business_trip">Công tác</option>` vào ô chọn loại đơn.
- Danh sách: ngày hiển thị `req.endDate ? \`${dd/mm} → ${dd/mm}\` : dd/mm`.

Hàm cộng ngày cho `max`: dùng `vnToday()` và cộng 7 ngày bằng `new Date(Date.parse(vnToday()) + 7 * 86_400_000).toISOString().slice(0, 10)`.

- [ ] **Step 4: Kiểm tra; commit**

Run: `npm test && npm run lint && npm run build` — Expected: PASS. Hoàn nguyên `dist/`, `server.js`.

```bash
git add src
git commit -m "feat(ui): attendance shows open days, early arrival, absence/leave/trip; new stats cards; leave requests by date range

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Hướng dẫn nâng cấp v4, bản build và chạy thử migration

**Files:**
- Modify: `DEPLOY.md`
- Rebuild: `dist/`, `server.js`

**Interfaces:**
- Consumes: mọi task trước.
- Produces: bản build production; hướng dẫn nâng cấp v3 → v4.

- [ ] **Step 1: Thêm mục vào `DEPLOY.md`** — chèn ngay trước mục `## Nâng cấp lên bản khu vực và tài khoản email (database v3)`

````markdown
## Nâng cấp lên bản ca làm việc (database v4)

Bản này **tự nâng cấp database v3 lên v4 và giữ nguyên dữ liệu** (khu vực, phòng ban, nhân sự, ngày công, đơn). Server tự sao lưu trước khi nâng cấp vào `data/backups/attendance-<ngày>-<giờ>-pre-migrate.db`. **Không xóa database.**

```bash
cd /home/ubuntu/hgc-attendance
pm2 stop hanet-attendance
git pull && npm ci --omit=dev
pm2 restart hanet-attendance
pm2 logs hanet-attendance --lines 20 --nostream    # thấy: [MIGRATE] v3 → v4 xong (sao lưu: attendance-…-pre-migrate.db)
```

Nếu log có `[MIGRATE] Nâng cấp v3 → v4 thất bại …`: database vẫn là v3, không mất gì; gửi dòng log đó cho bộ phận kỹ thuật và chạy lại bản cũ bằng `git checkout <commit cũ> && npm ci --omit=dev && pm2 restart hanet-attendance`.

Sau khi nâng cấp (tài khoản HR toàn hệ thống):

1. Tab **Ca làm việc** → thẻ **Ca mặc định công ty**: kiểm tra giờ vào/ra, **ngày làm trong tuần** (mặc định T2–T6), ngưỡng đi sớm (15') và cho phép về sớm (10').
2. Mục **Ngày lễ**: nhập các ngày lễ của năm (1/1, Tết, 30/4, 1/5, 2/9…).
3. Khu cần giờ riêng (cửa hàng, kho): **Thêm ca** cho khu đó, rồi tab **Phòng ban** → Sửa → chọn **Ca làm việc**.
4. Người làm giờ riêng: tab **Nhân sự** → Sửa → **Ca riêng**.

## Kiểm tra sau khi nâng cấp v4 (trên host)

- [ ] Log có `[MIGRATE] v3 → v4 xong`; khu vực, phòng ban, nhân sự, ngày công cũ còn nguyên.
- [ ] Một nhân viên không quẹt cả ngày làm việc ⇒ sau giờ ra của ca (tối đa 15 phút) bảng công hiện **Vắng**.
- [ ] Người quẹt giữa giờ chiều: trước giờ ra bảng công hiện "Gần nhất HH:mm", không bị gắn về sớm; sau giờ ra mới hiện về sớm (nếu ra sớm quá 10 phút).
- [ ] Đơn nghỉ phép 2 ngày làm việc được duyệt ⇒ hai ngày đó hiện **Nghỉ phép**; cuối tuần trong khoảng không bị đánh dấu.
- [ ] Quản trị khu thêm ca cho khu mình và gán cho một phòng; không thấy ca của khu khác.
````

- [ ] **Step 2: Kiểm tra toàn bộ**

```bash
npm test && TZ=UTC npm test && npm run lint && npm run build
npm audit --omit=dev
```

Expected: test (cả `TZ=UTC`), lint, build qua; `found 0 vulnerabilities`.

- [ ] **Step 3: Chạy thử bản production trên một database v3**

```bash
SMOKE=$(mktemp -d) && cp -r dist server.js package.json "$SMOKE"/ && ln -s "$PWD/node_modules" "$SMOKE/node_modules" && mkdir -p "$SMOKE/data"
node -e "
const {DatabaseSync}=require('node:sqlite');const fs=require('fs');
const d=new DatabaseSync('$SMOKE/data/attendance.db');
d.exec(fs.readFileSync('tests/fixtures/schema-v3.sql','utf8'));
d.exec(\"INSERT INTO schema_version VALUES (3); INSERT INTO areas(id,code,name,created_at) VALUES ('ar1','KV01','Trụ sở','2026-10-01'); INSERT INTO users(id,code,name,role,status,password_hash,must_change_password,created_at) VALUES ('u1','ADMIN','Quản trị','hr','active','scrypt\$x\$y',1,'2026-10-01');\");
d.close()"
(cd "$SMOKE" && NODE_ENV=production PORT=3095 node server.js > server.log 2>&1 &) ; sleep 3
curl -s localhost:3095/api/health; echo
grep -E "MIGRATE|STARTUP" "$SMOKE/server.log"
ls "$SMOKE/data/backups"
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$SMOKE/data/attendance.db');console.log(d.prepare('SELECT version FROM schema_version').get(), d.prepare('SELECT COUNT(*) c FROM areas').get())"
lsof -ti:3095 | xargs kill 2>/dev/null; true
```

Expected: `{"ok":true}`; log có `[MIGRATE] v3 → v4 xong (sao lưu: attendance-…-pre-migrate.db)`; thư mục `backups` có đúng một file `…-pre-migrate.db`; `{ version: 4 } { c: 1 }`.

- [ ] **Step 4: Commit**

```bash
git add DEPLOY.md
git add -A dist server.js
git commit -m "docs(deploy): upgrade to database v4 (shifts) with automatic migration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tự rà soát kế hoạch so với spec

| Spec | Task |
|---|---|
| §3 Schema v4 (bảng, cột, ràng buộc, settings mới) | 1, 2 |
| §4 Migration (sao lưu, giao dịch, v<3, v>4, lỗi giữ v3, test trên DB v3) | 1, 9 |
| §5 Ca áp dụng (riêng > phòng > mặc định, khác khu bỏ qua) | 2 |
| §6 Tính ngày công (nghỉ > quẹt > vắng; đi sớm; về sớm sau giờ ra; `final`; đóng ngày 15 phút) | 3 |
| §7 Tính lại khi đổi ca/mặc định/gán ca/ngày lễ/duyệt đơn | 4, 5 |
| §8 Đơn từ (công tác, khoảng ngày, 31 ngày, trước 7 ngày, chồng ngày 409) | 5, 8 |
| §9 Quyền (ca theo khu, ca mặc định & ngày lễ chỉ HR, gán ca cùng khu) | 4 |
| §10 API và kiểu dữ liệu, thống kê mới | 1, 4, 5, 6 |
| §11 Giao diện | 7, 8 |
| §12 Kiểm thử | mọi task |
| §13–14 Triển khai, tiêu chí | 9 |
