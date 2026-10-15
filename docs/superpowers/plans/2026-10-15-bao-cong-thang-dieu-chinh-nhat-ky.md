# Đợt C — Bảng công tháng, điều chỉnh điểm danh, nhật ký, khóa sổ, trang "Của tôi" — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR chốt công tháng (xem + xuất Excel 2 sheet), HR/quản trị khu điều chỉnh ngày công có lý do và nhật ký, khóa sổ tháng, mọi người có trang "Của tôi"; database v4 → v5 giữ dữ liệu.

**Architecture:** Ba bảng mới (`attendance_overrides`, `audit_logs`, `month_locks`) qua migration v4→v5. Hàm tính ngày công `writeDay` (server/attendance.ts) là điểm duy nhất áp dụng khóa sổ và điều chỉnh. Báo cáo tháng tính ở `server/reports.ts`, Excel dựng từ cùng dữ liệu ở `server/report-xlsx.ts` bằng `exceljs`. Nhật ký ghi bằng `writeAudit` trong cùng giao dịch với thao tác. Frontend thêm 3 tab và hộp chi tiết ngày dùng chung.

**Tech Stack:** Node 22 + Express 4 + `node:sqlite`, TypeScript, test `node:test` qua `tsx --test`, React 19 + Vite + Tailwind v4, `exceljs@4.4.0`.

**Spec:** `docs/superpowers/specs/2026-10-15-bao-cong-thang-dieu-chinh-nhat-ky-design.md`

## Global Constraints

- Mọi chữ hiển thị bằng tiếng Việt; không có chữ "Hanet" trên giao diện (gọi là "Camera AI").
- Code TS/TSX dùng nháy đơn (riêng `src/components/CamerasTab.tsx` dùng nháy kép). **Không chạy prettier.** Viết giống code xung quanh (mật độ comment, tên, cách dùng `HttpError`, `tx`, `Row`).
- Không đụng file chưa track `docs/TAI_LIEU_DU_AN_THAM_KHAO.md`.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Làm trên `main`, **không push**.
- Kiểm tra mỗi task: test liên quan + `npm test` + `TZ=UTC npm test` + `npm run lint`. Task cuối: `npm run build`, commit riêng `dist/` + `server.js` ("chore(build): rebuild production bundle").
- Đối tượng ngoài phạm vi trả **404** (không lộ dữ liệu khu khác); tháng đã khóa trả **423** "Tháng MM/YYYY đã khóa sổ".
- Lý do điều chỉnh: sau `trim()` dài **5–500** ký tự, lỗi: "Phải nhập lý do điều chỉnh (5–500 ký tự)".
- Ký hiệu lưới: `X M S MS T CT P V L` (+ `*` khi có điều chỉnh) đúng bảng §6 của spec.
- Màu giao diện: dùng token `brand-*` (cam) và `brand-navy` (#003865) đã có trong `src/index.css`; màu trạng thái lấy từ `DAY_STATUS_STYLE` (`src/format.ts`).
- `package.json`: `"exceljs": "4.4.0"` trong `dependencies` và `"overrides": { "uuid": "^11.1.1" }`; `npm audit` phải 0 lỗ hổng.

## Review Focus

1. Điều chỉnh "Sửa giờ" chỉ nhập giờ ra cho ngày không có lượt quẹt nào ⇒ phải 400 "Ngày này chưa có giờ vào: hãy nhập giờ vào", không âm thầm thành vắng. (Task 4)
2. Xóa tài khoản HR đã từng điều chỉnh ngày công và khóa sổ ⇒ xóa được, điều chỉnh/khóa sổ/nhật ký vẫn còn với nhãn người làm. (Task 4)
3. Xuất Excel cho phạm vi không có ai (phòng rỗng) ⇒ vẫn ra file hợp lệ có tiêu đề, 0 dòng dữ liệu. (Task 7)
4. `month` sai như `2026-13`, `2026-1`, `abc` ⇒ 400 ở báo cáo, `/me/attendance`, khóa sổ. (Task 3, Task 6)
5. Người đã nghỉ việc: không có dữ liệu trong tháng ⇒ không xuất hiện; có dữ liệu ⇒ có dòng. (Task 6)

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `server/schema.ts` (sửa) | DDL ba bảng mới, `SCHEMA_VERSION = 5` |
| `server/migrations.ts` (sửa) | `migrate4to5` |
| `tests/fixtures/schema-v4.sql` (mới) | Ảnh chụp schema v4 để test migration |
| `server/audit.ts` (mới) | `writeAudit`, nhãn người, khu của người, kiểu `AuditAction` |
| `server/routes/audit.ts` (mới) | `GET /api/audit` |
| `server/month-lock.ts` (mới) | Kiểm tra / khóa / mở khóa tháng |
| `server/routes/month-locks.ts` (mới) | API khóa sổ |
| `server/overrides.ts` (mới) | Đọc / ghi / bỏ điều chỉnh, kiểm tra đầu vào |
| `server/attendance.ts` (sửa) | `writeDay`: khóa sổ + điều chỉnh |
| `server/routes/attendance.ts` (sửa) | `DAY_SELECT`/`mapDay` có `override`; API điều chỉnh |
| `server/reports.ts` (mới) | `buildMonthlyReport`, `buildRows`, ký hiệu |
| `server/report-xlsx.ts` (mới) | Dựng file Excel từ `MonthlyReport` |
| `server/routes/reports.ts` (mới) | `/reports/monthly`, `/reports/monthly.xlsx`, `/me/attendance` |
| Sửa ghi nhật ký | `server/routes/{auth,requests,users,departments,shifts,settings}.ts` |
| `shared/types.ts` (sửa) | `DayOverride`, `AuditLogEntry`, `MonthlyReport`, `MonthlyRow`, `MonthLock`, `MyAttendance` |
| `src/format.ts` (sửa) | Nhãn hành động nhật ký, màu ký hiệu |
| `src/components/DayDetailModal.tsx` (mới) | Hộp chi tiết ngày dùng chung + khối điều chỉnh |
| `src/components/AdjustDayModal.tsx` (mới) | Hộp "Điều chỉnh ngày công" |
| `src/components/OverrideBadge.tsx` (mới) | Nhãn "Đã điều chỉnh" |
| `src/components/MonthlyReportTab.tsx` (mới) | Tab "Báo cáo tháng" |
| `src/components/RequestFormModal.tsx` (mới) | Form gửi đơn (tách từ `RequestsTab`) |
| `src/components/MyAttendanceTab.tsx` (mới) | Tab "Của tôi" |
| `src/components/AuditLogTab.tsx` (mới) | Tab "Nhật ký" |
| `src/App.tsx`, `src/components/Navbar.tsx`, `src/components/AttendanceTable.tsx`, `src/components/RequestsTab.tsx` (sửa) | Nối tab, dùng thành phần chung |
| `DEPLOY.md` (sửa) | Mục nâng cấp v5 |

---

### Task 1: Schema v5 và migration v4 → v5

**Files:**
- Create: `tests/fixtures/schema-v4.sql`
- Modify: `server/schema.ts`, `server/migrations.ts`, `tests/db.test.ts:70-71`, `tests/migration.test.ts` (các chỗ khẳng định version 4), `DEPLOY.md`
- Test: `tests/migration.test.ts`

**Interfaces:**
- Produces: bảng `attendance_overrides`, `audit_logs`, `month_locks` (DDL đúng §3 spec, đã sửa: `created_by`/`locked_by` không khóa ngoại, thêm `created_by_label`/`locked_by_label`); `SCHEMA_VERSION = 5`; hàm `ddlOverrides(ifNotExists)`, `ddlAuditLogs(ifNotExists)`, `ddlMonthLocks(ifNotExists)` trong `server/schema.ts`.

- [ ] **Step 1: Chụp schema v4 làm fixture (TRƯỚC khi sửa schema)**

```bash
npx tsx -e "import { SCHEMA } from './server/schema.ts'; process.stdout.write(SCHEMA)" > tests/fixtures/schema-v4.sql
grep -c "CREATE TABLE" tests/fixtures/schema-v4.sql   # > 15
```

- [ ] **Step 2: Viết test migration v4 → v5 (sẽ fail)**

Thêm vào `tests/migration.test.ts` (dưới `makeV3`):

```ts
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
```

Lưu ý: `month:0` vì `TEXT PRIMARY KEY` không tự `NOT NULL` trong SQLite; nếu PRAGMA trả khác, sửa kỳ vọng theo kết quả thật **sau khi** đã đối chiếu DDL đúng spec.

- [ ] **Step 3: Chạy để thấy fail**

Run: `npx tsx --test tests/migration.test.ts`
Expected: FAIL — `SCHEMA_VERSION` còn 4 nên bảng mới không có.

- [ ] **Step 4: Thêm DDL vào `server/schema.ts`**

```ts
export const SCHEMA_VERSION = 5;
```

Thêm sau `ddlAttendanceDays`:

```ts
export function ddlOverrides(ifNotExists: boolean): string {
  return `CREATE TABLE ${ine(ifNotExists)}attendance_overrides (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('times', 'leave', 'business_trip')),
  first_in INTEGER,
  last_out INTEGER,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_by_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, work_date),
  CHECK (kind != 'times' OR first_in IS NOT NULL OR last_out IS NOT NULL)
);`;
}

export function ddlAuditLogs(ifNotExists: boolean): string {
  return `CREATE TABLE ${ine(ifNotExists)}audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_id TEXT,
  actor_label TEXT NOT NULL,
  ip TEXT,
  action TEXT NOT NULL,
  target_user_id TEXT,
  target_label TEXT,
  area_id TEXT,
  work_date TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT
);
CREATE INDEX ${ine(ifNotExists)}idx_audit_at ON audit_logs(at);
CREATE INDEX ${ine(ifNotExists)}idx_audit_target ON audit_logs(target_user_id);
CREATE INDEX ${ine(ifNotExists)}idx_audit_area ON audit_logs(area_id);`;
}

export function ddlMonthLocks(ifNotExists: boolean): string {
  return `CREATE TABLE ${ine(ifNotExists)}month_locks (
  month TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  locked_by_label TEXT NOT NULL,
  locked_at TEXT NOT NULL
);`;
}
```

Trong chuỗi `SCHEMA`, ngay sau dòng `CREATE INDEX IF NOT EXISTS idx_requests_user ...` thêm:

```ts
${ddlOverrides(true)}

${ddlAuditLogs(true)}

${ddlMonthLocks(true)}
```

- [ ] **Step 5: Thêm bước migration trong `server/migrations.ts`**

```ts
import { ddlAttendanceDays, ddlAuditLogs, ddlHolidays, ddlMonthLocks, ddlOverrides, ddlRequests, ddlShifts, SCHEMA_VERSION } from './schema';

/** v4 → v5: điều chỉnh ngày công, nhật ký kiểm toán, khóa sổ tháng (chỉ thêm bảng, không đụng dữ liệu cũ). */
function migrate4to5(db: Db): void {
  db.exec(ddlOverrides(false));
  db.exec(ddlAuditLogs(false));
  db.exec(ddlMonthLocks(false));
}

export const MIGRATIONS: Migration[] = [
  { from: 3, run: migrate3to4 },
  { from: 4, run: migrate4to5 },
];
```

- [ ] **Step 6: Sửa các khẳng định version cũ**

- `tests/db.test.ts:70-71`: `assert.equal(SCHEMA_VERSION, 5);` và version đọc từ DB `5`; thêm `for (const t of ['attendance_overrides', 'audit_logs', 'month_locks']) assert.ok(cols(t).length > 0, \`thiếu bảng ${t}\`);`.
- `tests/migration.test.ts`: test "nâng cấp v3 → v4" giờ nâng thẳng lên v5 — đổi `assert.equal(SCHEMA_VERSION, 4)` thành `5`, version đọc từ DB thành `SCHEMA_VERSION`; tên test thành "nâng cấp v3 → v5 (qua v4)". Test `MIGRATE_ONLY=1` (khoảng dòng 147-153): regex `/Chạy thử xong: database v5/` và version `5`. Mọi chỗ khác còn ghi `4` như phiên bản mới nhất: đổi sang `SCHEMA_VERSION`.

- [ ] **Step 7: Chạy test**

Run: `npx tsx --test tests/migration.test.ts tests/db.test.ts`
Expected: PASS.

- [ ] **Step 8: `DEPLOY.md` — thêm mục v5 ngay trên mục "Nâng cấp lên bản ca làm việc (database v4)"**

````markdown
## Nâng cấp lên bản đợt C (database v5)

Bản này **tự nâng cấp database v4 lên v5 và giữ nguyên dữ liệu** (chỉ thêm bảng điều chỉnh, nhật ký, khóa sổ). Server tự sao lưu vào `data/backups/attendance-pre-migrate-v4.db`. **Không xóa database.**

```bash
cd /home/ubuntu/hgc-attendance
git rev-parse --short HEAD          # ghi lại để quay về khi cần
pm2 stop hanet-attendance
mkdir -p ~/hgc-backup && cp data/attendance.db* ~/hgc-backup/
git pull && npm ci --omit=dev
rm -f /tmp/try-v5.db /tmp/try-v5.db-wal /tmp/try-v5.db-shm
cp data/attendance.db /tmp/try-v5.db; cp data/attendance.db-wal /tmp/try-v5.db-wal 2>/dev/null; cp data/attendance.db-shm /tmp/try-v5.db-shm 2>/dev/null
MIGRATE_ONLY=1 DB_FILE=/tmp/try-v5.db NODE_ENV=production node server.js
# Phải thấy: [MIGRATE] Chạy thử xong: database v5 — chỉ khi đó mới chạy tiếp
pm2 restart hanet-attendance
pm2 logs hanet-attendance --lines 20 --nostream    # thấy: [MIGRATE] v4 → v5 xong (sao lưu: attendance-pre-migrate-v4.db)
```

Nếu thất bại: xử lý như mục v4 bên dưới (`pm2 stop`, quay về commit cũ, gửi log).

Sau khi nâng cấp: tab **Báo cáo tháng** xuất Excel; tab **Nhật ký** xem thao tác; cuối tháng HR bấm **Khóa sổ tháng** sau khi đã gửi file cho kế toán.
````

- [ ] **Step 9: Chạy toàn bộ và commit**

Run: `npm test && TZ=UTC npm test && npm run lint`
Expected: tất cả PASS.

```bash
git add server/schema.ts server/migrations.ts tests/fixtures/schema-v4.sql tests/db.test.ts tests/migration.test.ts DEPLOY.md
git commit -m "feat(db): schema v5 — attendance overrides, audit log, month locks; migration v4 → v5

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Nhật ký kiểm toán — ghi, đăng nhập, API xem

**Files:**
- Create: `server/audit.ts`, `server/routes/audit.ts`, `tests/audit.test.ts`
- Modify: `server/routes/auth.ts:18-38`, `server/app.ts`, `shared/types.ts`

**Interfaces:**
- Consumes: bảng `audit_logs` (Task 1).
- Produces (dùng ở Task 3, 4, 5):
  ```ts
  export type AuditAction =
    | 'attendance.override' | 'attendance.override_remove'
    | 'request.approve' | 'request.reject'
    | 'user.role' | 'user.areas' | 'user.status' | 'user.delete'
    | 'shift.create' | 'shift.update' | 'shift.delete' | 'shift.assign'
    | 'settings.work' | 'holiday.add' | 'holiday.remove'
    | 'month.lock' | 'month.unlock'
    | 'auth.login' | 'auth.login_failed';
  export interface AuditEntry {
    actorId: string | null; actorLabel: string; ip: string | null; action: AuditAction;
    targetUserId?: string | null; targetLabel?: string | null; areaId?: string | null; workDate?: string | null;
    before?: unknown; after?: unknown; reason?: string | null;
  }
  export function writeAudit(db: Db, now: number, e: AuditEntry): void;
  export function personLabel(name: string, code: string): string;          // "Tên (MÃ)"
  export function userLabel(db: Db, userId: string): string;                 // đọc DB, "" nếu không có
  export function userAreaId(db: Db, userId: string): string | null;         // khu của phòng người đó
  export function actorOf(req: Request): { actorId: string; actorLabel: string; ip: string | null };
  ```
  `shared/types.ts`: `export interface AuditLogEntry { id: number; at: string; actorLabel: string; ip: string | null; action: string; targetLabel: string | null; workDate: string | null; before: unknown; after: unknown; reason: string | null }`.

- [ ] **Step 1: Viết test (fail)** — `tests/audit.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, Client } from './helpers';
import { writeAudit } from '../server/audit';

async function setup() {
  const app = await startTestApp();
  const a1 = seedArea(app.db, 'KV1');
  const a2 = seedArea(app.db, 'KV2');
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
  const d2 = seedDepartment(app.db, 'PB2', 'Kho', a2);
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    qk: seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a1] }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: d1 }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: d2 }),
  };
  return { app, a1, a2, ids };
}

const rows = (app: { db: any }) => app.db.prepare('SELECT * FROM audit_logs ORDER BY id').all() as Record<string, any>[];

test('đăng nhập HR / quản trị khu được ghi; trưởng phòng, nhân viên không; sai mật khẩu và tài khoản lạ ghi login_failed', async () => {
  const { app, ids } = await setup();
  try {
    await loginAs(app, 'HR01');
    await loginAs(app, 'QK01');
    await loginAs(app, 'TP01');
    await loginAs(app, 'NV01');
    const c = new Client(app.baseUrl);
    assert.equal((await c.post('/api/auth/login', { code: 'HR01', password: 'sai-mat-khau' })).status, 401);
    assert.equal((await c.post('/api/auth/login', { code: 'KHONGCO', password: 'x' })).status, 401);
    assert.equal((await c.post('/api/auth/login', { code: 'NV01', password: 'sai' })).status, 401);
    const r = rows(app);
    assert.deepEqual(r.map((x) => [x.action, x.actor_id, x.actor_label]), [
      ['auth.login', ids.hr, 'HR01 (HR01)'],
      ['auth.login', ids.qk, 'QK01 (QK01)'],
      ['auth.login_failed', ids.hr, 'HR01 (HR01)'],
      ['auth.login_failed', null, 'KHONGCO'],
    ]);
    assert.ok(r.every((x) => typeof x.ip === 'string' && x.ip.length > 0));
  } finally {
    await app.close();
  }
});

test('GET /api/audit: HR thấy tất cả, quản trị khu chỉ dòng của khu / của mình, trưởng phòng 403; lọc và phân trang', async () => {
  const { app, a1, a2, ids } = await setup();
  try {
    const base = { actorId: ids.hr, actorLabel: 'HR01 (HR01)', ip: '1.1.1.1' } as const;
    writeAudit(app.db, Date.UTC(2026, 9, 1), { ...base, action: 'attendance.override', targetUserId: ids.nv1, targetLabel: 'NV01 (NV01)', areaId: a1, reason: 'Camera hỏng' });
    writeAudit(app.db, Date.UTC(2026, 9, 2), { ...base, action: 'attendance.override', targetUserId: ids.nv2, targetLabel: 'NV02 (NV02)', areaId: a2 });
    writeAudit(app.db, Date.UTC(2026, 9, 3), { ...base, action: 'settings.work', before: { a: 1 }, after: { a: 2 } });
    const hr = await loginAs(app, 'HR01');
    const all = await hr.get('/api/audit?from=2026-09-01&to=2026-10-31');
    assert.equal(all.status, 200);
    // Mới nhất trước; đăng nhập của HR01 vừa rồi cũng nằm trong khoảng ngày nếu "now" là hôm nay — lọc theo action để ổn định
    const ov = await hr.get('/api/audit?from=2026-09-01&to=2026-10-31&action=attendance.override');
    assert.deepEqual(ov.body.entries.map((e: any) => e.targetLabel), ['NV02 (NV02)', 'NV01 (NV01)']);
    assert.equal(ov.body.entries[1].reason, 'Camera hỏng');
    assert.deepEqual((await hr.get('/api/audit?from=2026-09-01&to=2026-10-31&action=settings.work')).body.entries[0].after, { a: 2 });
    assert.deepEqual((await hr.get('/api/audit?from=2026-09-01&to=2026-10-31&q=NV01')).body.entries.map((e: any) => e.targetLabel), ['NV01 (NV01)']);
    const qk = await loginAs(app, 'QK01');
    const mine = await qk.get('/api/audit?from=2026-09-01&to=2026-10-31&action=attendance.override');
    assert.deepEqual(mine.body.entries.map((e: any) => e.targetLabel), ['NV01 (NV01)']);
    assert.equal((await (await loginAs(app, 'TP01')).get('/api/audit')).status, 403);
    assert.equal((await hr.get('/api/audit?from=2026-13-01')).status, 400);
    assert.equal(typeof all.body.total, 'number');
    assert.equal(all.body.pageSize, 50);
  } finally {
    await app.close();
  }
});
```

Run: `npx tsx --test tests/audit.test.ts` — Expected: FAIL (module `../server/audit` không có).

- [ ] **Step 2: `server/audit.ts`**

```ts
import type { Request } from 'express';
import type { Db } from './db';
import { currentUser } from './middleware';

export type AuditAction =
  | 'attendance.override'
  | 'attendance.override_remove'
  | 'request.approve'
  | 'request.reject'
  | 'user.role'
  | 'user.areas'
  | 'user.status'
  | 'user.delete'
  | 'shift.create'
  | 'shift.update'
  | 'shift.delete'
  | 'shift.assign'
  | 'settings.work'
  | 'holiday.add'
  | 'holiday.remove'
  | 'month.lock'
  | 'month.unlock'
  | 'auth.login'
  | 'auth.login_failed';

export interface AuditEntry {
  actorId: string | null;
  actorLabel: string;
  ip: string | null;
  action: AuditAction;
  targetUserId?: string | null;
  targetLabel?: string | null;
  areaId?: string | null;
  workDate?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export const personLabel = (name: string, code: string): string => `${name} (${code})`;

export function userLabel(db: Db, userId: string): string {
  const u = db.prepare('SELECT name, code FROM users WHERE id = ?').get(userId) as { name: string; code: string } | undefined;
  return u ? personLabel(u.name, u.code) : '';
}

/** Khu của phòng ban người này (null nếu chưa có phòng hoặc phòng chưa gán khu). */
export function userAreaId(db: Db, userId: string): string | null {
  const r = db
    .prepare('SELECT d.area_id FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?')
    .get(userId) as { area_id: string | null } | undefined;
  return r?.area_id ?? null;
}

export function actorOf(req: Request): { actorId: string; actorLabel: string; ip: string | null } {
  const u = currentUser(req);
  return { actorId: u.id, actorLabel: personLabel(u.name, u.code), ip: req.ip ?? null };
}

const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));

/** Ghi một dòng nhật ký. Gọi trong cùng giao dịch với thao tác: thao tác lỗi (rollback) thì không có dòng. */
export function writeAudit(db: Db, now: number, e: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_logs(at, actor_id, actor_label, ip, action, target_user_id, target_label, area_id, work_date, before_json, after_json, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date(now).toISOString(),
    e.actorId,
    e.actorLabel,
    e.ip,
    e.action,
    e.targetUserId ?? null,
    e.targetLabel ?? null,
    e.areaId ?? null,
    e.workDate ?? null,
    json(e.before),
    json(e.after),
    e.reason ?? null,
  );
}
```

- [ ] **Step 3: Ghi đăng nhập trong `server/routes/auth.ts`**

Import `import { personLabel, writeAudit } from '../audit';`. Trong handler `/auth/login`:

```ts
    const AUDITED_ROLES = new Set(['hr', 'area_admin']);
    if (ctx.limiter.isBlocked(key, now)) {
      console.warn(`[SECURITY] login_blocked login=${login} ip=${req.ip}`);
      const blocked = findLoginUser(db, login);
      if (!blocked || AUDITED_ROLES.has(blocked.role)) {
        writeAudit(db, now, {
          actorId: blocked?.id ?? null,
          actorLabel: blocked ? personLabel(blocked.name, blocked.code) : login,
          ip: req.ip ?? null,
          action: 'auth.login_failed',
          reason: 'Bị chặn tạm thời',
        });
      }
      throw new HttpError(429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút');
    }
    const row = findLoginUser(db, login);
    if (!row || row.status !== 'active' || !verifyPassword(password, row.password_hash)) {
      ctx.limiter.recordFailure(key, now);
      console.warn(`[SECURITY] login_failed login=${login} ip=${req.ip}`);
      if (!row || AUDITED_ROLES.has(row.role)) {
        writeAudit(db, now, {
          actorId: row?.id ?? null,
          actorLabel: row ? personLabel(row.name, row.code) : login,
          ip: req.ip ?? null,
          action: 'auth.login_failed',
        });
      }
      throw new HttpError(401, 'Mã nhân viên/email hoặc mật khẩu không đúng');
    }
    ctx.limiter.reset(key);
    if (AUDITED_ROLES.has(row.role)) {
      writeAudit(db, now, { actorId: row.id, actorLabel: personLabel(row.name, row.code), ip: req.ip ?? null, action: 'auth.login' });
    }
```

Đặt `AUDITED_ROLES` ở cấp module (không trong handler). Nếu `findLoginUser` chưa trả `name`, `code`, `role`, bổ sung các cột đó vào câu SELECT của nó. `login` rỗng (body thiếu) vẫn ghi với `actorLabel` = `''` → dùng `login || '(trống)'`.

- [ ] **Step 4: `server/routes/audit.ts` + nối vào `server/app.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { currentUser } from '../middleware';
import { isGlobalHr, requireManager } from '../access';
import type { Row } from '../repo';
import { addDays, isValidDate, toVnDate, vnDayStart } from '../vntime';
import type { AuditLogEntry } from '../../shared/types';

export const AUDIT_PAGE_SIZE = 50;

const parse = (s: string | null): unknown => (s === null ? null : JSON.parse(s));

export function auditRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/audit', requireManager, (req, res) => {
    const actor = currentUser(req);
    const today = toVnDate(ctx.now());
    const from = req.query.from === undefined || req.query.from === '' ? addDays(today, -29) : req.query.from;
    const to = req.query.to === undefined || req.query.to === '' ? today : req.query.to;
    if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const where: string[] = ['at >= ?', 'at < ?'];
    const params: (string | number)[] = [new Date(vnDayStart(from)).toISOString(), new Date(vnDayStart(addDays(to, 1))).toISOString()];
    if (typeof req.query.action === 'string' && req.query.action) {
      where.push('action = ?');
      params.push(req.query.action);
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      where.push('(actor_label LIKE ? OR target_label LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (!isGlobalHr(actor)) {
      const areas = actor.areaIds.length ? `area_id IN (${actor.areaIds.map(() => '?').join(', ')}) OR ` : '';
      where.push(`(${areas}target_user_id = ? OR actor_id = ?)`);
      params.push(...actor.areaIds, actor.id, actor.id);
    }
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const sqlWhere = where.join(' AND ');
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE ${sqlWhere}`).get(...params) as { c: number }).c;
    const rows = db
      .prepare(`SELECT * FROM audit_logs WHERE ${sqlWhere} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, AUDIT_PAGE_SIZE, (page - 1) * AUDIT_PAGE_SIZE) as Row[];
    const entries: AuditLogEntry[] = rows.map((x) => ({
      id: x.id,
      at: x.at,
      actorLabel: x.actor_label,
      ip: x.ip ?? null,
      action: x.action,
      targetLabel: x.target_label ?? null,
      workDate: x.work_date ?? null,
      before: parse(x.before_json ?? null),
      after: parse(x.after_json ?? null),
      reason: x.reason ?? null,
    }));
    res.json({ entries, total, page, pageSize: AUDIT_PAGE_SIZE });
  });

  return r;
}
```

`server/app.ts`: `import { auditRoutes } from './routes/audit';` và `api.use(auditRoutes(ctx));` sau `requestRoutes`.

`shared/types.ts`: thêm `AuditLogEntry` (Interfaces ở trên).

- [ ] **Step 5: Chạy test, rồi toàn bộ**

Run: `npx tsx --test tests/audit.test.ts && npm test && TZ=UTC npm test && npm run lint`
Expected: PASS. Nếu test có sẵn trong `tests/auth-routes.test.ts` đếm số dòng/log khác, chỉnh cho khớp hành vi mới (không nới lỏng kiểm tra bảo mật).

- [ ] **Step 6: Commit**

```bash
git add server/audit.ts server/routes/audit.ts server/routes/auth.ts server/app.ts shared/types.ts tests/audit.test.ts
git commit -m "feat(audit): audit log writer, admin login auditing, GET /api/audit scoped by area

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Khóa sổ tháng

**Files:**
- Create: `server/month-lock.ts`, `server/routes/month-locks.ts`, `tests/month-lock.test.ts`
- Modify: `server/attendance.ts` (`writeDay`), `server/routes/requests.ts` (POST và PUT), `server/app.ts`, `shared/types.ts`

**Interfaces:**
- Consumes: `writeAudit`, `actorOf` (Task 2); bảng `month_locks`.
- Produces:
  ```ts
  export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  export function isValidMonth(s: unknown): s is string;
  export function monthLabel(month: string): string;                 // '2026-10' → '10/2026'
  export function lockOf(db: Db, month: string): MonthLock | null;
  export function isMonthLocked(db: Db, date: string): boolean;      // date YYYY-MM-DD
  export function assertRangeUnlocked(db: Db, from: string, to: string): void; // ném HttpError 423
  ```
  `shared/types.ts`: `export interface MonthLock { month: string; lockedByName: string; lockedAt: string }`.

- [ ] **Step 1: Test (fail)** — `tests/month-lock.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, addDetection } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';
import { recomputeUsers, closeDays } from '../server/attendance';

const NOW = vnDateTimeToTs('2026-10-15', '10:00');
const at = (d: string, hhmm: string) => vnDateTimeToTs(d, hhmm);

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 }),
    nv: seedUser(app.db, { code: 'NV01', departmentId: d1 }),
  };
  return { app, ids };
}

const day = (app: any, userId: string, date: string) =>
  app.db.prepare('SELECT status, first_in FROM attendance_days WHERE user_id = ? AND work_date = ?').get(userId, date) as
    | { status: string; first_in: number | null }
    | undefined;

test('khóa / mở khóa: chỉ HR, kiểm tra tháng, trùng 409, ghi nhật ký, GET danh sách', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/month-locks/2026-09')).status, 200);
    assert.equal((await hr.post('/api/month-locks/2026-09')).status, 409);
    assert.equal((await hr.post('/api/month-locks/2026-11')).status, 400); // tháng tương lai
    for (const bad of ['2026-13', '2026-1', 'abc']) assert.equal((await hr.post(`/api/month-locks/${bad}`)).status, 400);
    assert.equal((await (await loginAs(app, 'TP01')).post('/api/month-locks/2026-08')).status, 403);
    const list = await (await loginAs(app, 'TP01')).get('/api/month-locks?year=2026');
    assert.deepEqual(list.body.locks.map((l: any) => [l.month, l.lockedByName]), [['2026-09', 'HR01 (HR01)']]);
    assert.equal((await hr.del('/api/month-locks/2026-09')).status, 200);
    assert.equal((await hr.del('/api/month-locks/2026-09')).status, 404);
    const acts = (app.db.prepare("SELECT action FROM audit_logs WHERE action LIKE 'month.%' ORDER BY id").all() as { action: string }[]).map((r) => r.action);
    assert.deepEqual(acts, ['month.lock', 'month.unlock']);
  } finally {
    await app.close();
  }
});

test('tháng khóa: ngày công không đổi khi có lượt quẹt mới, tính lại, đóng ngày; đơn gửi/duyệt bị 423', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv, at('2026-09-14', '08:30')); // thứ 2, muộn
    assert.equal(day(app, ids.nv, '2026-09-14')?.status, 'missing_out');
    const nv = await loginAs(app, 'NV01');
    const pending = await nv.post('/api/requests', { type: 'late_explanation', workDate: '2026-09-14', reason: 'Tắc đường' });
    assert.equal(pending.status, 200);
    const hr = await loginAs(app, 'HR01');
    await hr.post('/api/month-locks/2026-09');

    addDetection(app.db, ids.nv, at('2026-09-14', '07:50')); // quẹt sớm hơn đến muộn: không được đổi giờ vào
    assert.equal(day(app, ids.nv, '2026-09-14')?.first_in, at('2026-09-14', '08:30'));
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM detections WHERE user_id = ? AND work_date = '2026-09-14'").get(ids.nv).c, 2);
    recomputeUsers(app.db, [ids.nv], '2026-09-01', '2026-09-30', NOW);
    assert.equal(day(app, ids.nv, '2026-09-15'), undefined); // không ghi vắng vào tháng đã khóa
    closeDays(app.db, NOW);

    const r1 = await nv.post('/api/requests', { type: 'late_explanation', workDate: '2026-09-15', reason: 'Tắc đường' });
    assert.equal(r1.status, 423);
    assert.match(r1.body.error, /09\/2026 đã khóa sổ/);
    const leave = await nv.post('/api/requests', { type: 'leave_request', workDate: '2026-10-01', endDate: '2026-10-02', reason: 'Việc nhà' });
    assert.equal(leave.status, 200); // tháng 10 chưa khóa
    assert.equal((await hr.put(`/api/requests/${pending.body.request.id}`, { status: 'approved' })).status, 423);

    await hr.del('/api/month-locks/2026-09');
    assert.equal((await hr.put(`/api/requests/${pending.body.request.id}`, { status: 'approved' })).status, 200);
  } finally {
    await app.close();
  }
});
```

Run: `npx tsx --test tests/month-lock.test.ts` — Expected: FAIL (404 route).

- [ ] **Step 2: `server/month-lock.ts`**

```ts
import type { Db } from './db';
import { HttpError } from './errors';
import type { MonthLock } from '../shared/types';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(s: unknown): s is string {
  return typeof s === 'string' && MONTH_RE.test(s);
}

/** '2026-10' → '10/2026' */
export function monthLabel(month: string): string {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

export function lockOf(db: Db, month: string): MonthLock | null {
  const r = db.prepare('SELECT month, locked_by_label, locked_at FROM month_locks WHERE month = ?').get(month) as
    | { month: string; locked_by_label: string; locked_at: string }
    | undefined;
  return r ? { month: r.month, lockedByName: r.locked_by_label, lockedAt: r.locked_at } : null;
}

export function isMonthLocked(db: Db, date: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM month_locks WHERE month = ?').get(date.slice(0, 7)));
}

export function lockedError(month: string): HttpError {
  return new HttpError(423, `Tháng ${monthLabel(month)} đã khóa sổ`);
}

/** Có ngày nào trong [from, to] thuộc tháng đã khóa ⇒ 423. */
export function assertRangeUnlocked(db: Db, from: string, to: string): void {
  const r = db
    .prepare('SELECT month FROM month_locks WHERE month >= ? AND month <= ? ORDER BY month LIMIT 1')
    .get(from.slice(0, 7), to.slice(0, 7)) as { month: string } | undefined;
  if (r) throw lockedError(r.month);
}
```

- [ ] **Step 3: Chặn trong `writeDay` (`server/attendance.ts`)**

Import `import { isMonthLocked } from './month-lock';`. Dòng đầu tiên của `writeDay`:

```ts
  // Tháng đã khóa sổ: giữ nguyên ngày công (lượt quẹt vẫn lưu ở detections)
  if (isMonthLocked(db, workDate)) return;
```

Sửa comment JSDoc của `writeDay` thêm "Tháng đã khóa sổ ⇒ không ghi gì." ở đầu thứ tự ưu tiên.

- [ ] **Step 4: Chặn đơn trong `server/routes/requests.ts`**

- `POST /requests`: ngay trước `const id = newId('req');` thêm `assertRangeUnlocked(db, b.workDate, endDate ?? b.workDate);`.
- `PUT /requests/:id`: ngay sau kiểm tra `if (target.status !== 'pending') ...` thêm `assertRangeUnlocked(db, target.workDate, target.endDate ?? target.workDate);`.
- Import `import { assertRangeUnlocked } from '../month-lock';`.

- [ ] **Step 5: `server/routes/month-locks.ts` + nối app**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { tx } from '../db';
import { HttpError } from '../errors';
import { requireRole } from '../middleware';
import { requireGlobalHr } from '../access';
import { actorOf, writeAudit } from '../audit';
import { isValidMonth, lockOf, monthLabel } from '../month-lock';
import { toVnDate } from '../vntime';
import type { MonthLock } from '../../shared/types';

export function monthLockRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/month-locks', requireRole('hr', 'area_admin', 'dept_manager'), (req, res) => {
    const year = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year) ? req.query.year : toVnDate(ctx.now()).slice(0, 4);
    const rows = db.prepare('SELECT month FROM month_locks WHERE month LIKE ? ORDER BY month').all(`${year}-%`) as { month: string }[];
    const locks: MonthLock[] = rows.map((x) => lockOf(db, x.month)!);
    res.json({ locks });
  });

  const parseMonth = (raw: string): string => {
    if (!isValidMonth(raw)) throw new HttpError(400, 'Tháng không hợp lệ (định dạng YYYY-MM)');
    if (raw > toVnDate(ctx.now()).slice(0, 7)) throw new HttpError(400, 'Không thể khóa sổ tháng chưa tới');
    return raw;
  };

  r.post('/month-locks/:month', requireGlobalHr, (req, res) => {
    const month = parseMonth(req.params.month);
    if (lockOf(db, month)) throw new HttpError(409, `Tháng ${monthLabel(month)} đã khóa sổ rồi`);
    const a = actorOf(req);
    tx(db, () => {
      db.prepare('INSERT INTO month_locks(month, locked_by, locked_by_label, locked_at) VALUES (?, ?, ?, ?)').run(
        month,
        a.actorId,
        a.actorLabel,
        new Date(ctx.now()).toISOString(),
      );
      writeAudit(db, ctx.now(), { ...a, action: 'month.lock', targetLabel: `Tháng ${monthLabel(month)}` });
    });
    res.json({ lock: lockOf(db, month) });
  });

  r.delete('/month-locks/:month', requireGlobalHr, (req, res) => {
    const month = req.params.month;
    if (!isValidMonth(month)) throw new HttpError(400, 'Tháng không hợp lệ (định dạng YYYY-MM)');
    if (!lockOf(db, month)) throw new HttpError(404, `Tháng ${monthLabel(month)} chưa khóa sổ`);
    const a = actorOf(req);
    tx(db, () => {
      db.prepare('DELETE FROM month_locks WHERE month = ?').run(month);
      writeAudit(db, ctx.now(), { ...a, action: 'month.unlock', targetLabel: `Tháng ${monthLabel(month)}` });
    });
    res.json({ success: true });
  });

  return r;
}
```

`server/app.ts`: `api.use(monthLockRoutes(ctx));`. `shared/types.ts`: thêm `MonthLock`.

- [ ] **Step 6: Chạy test + toàn bộ, commit**

Run: `npx tsx --test tests/month-lock.test.ts && npm test && TZ=UTC npm test && npm run lint` — Expected: PASS.

```bash
git add server/month-lock.ts server/routes/month-locks.ts server/attendance.ts server/routes/requests.ts server/app.ts shared/types.ts tests/month-lock.test.ts
git commit -m "feat(attendance): month locks — locked months keep their attendance; requests in locked months 423

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Điều chỉnh ngày công (override)

**Files:**
- Create: `server/overrides.ts`, `tests/overrides.test.ts`
- Modify: `server/attendance.ts` (`writeDay`), `server/routes/attendance.ts` (`DAY_SELECT`, `mapDay`, 2 route mới), `shared/types.ts`

**Interfaces:**
- Consumes: `writeAudit`, `actorOf`, `userLabel`, `userAreaId` (Task 2); `isMonthLocked`, `lockedError` (Task 3).
- Produces:
  ```ts
  // server/overrides.ts
  export type OverrideKind = 'times' | 'leave' | 'business_trip';
  export interface StoredOverride { kind: OverrideKind; firstIn: number | null; lastOut: number | null; reason: string; byLabel: string; at: string }
  export function readOverride(db: Db, userId: string, workDate: string): StoredOverride | null;
  export function parseReason(raw: unknown): string;                     // ném 400
  // server/routes/attendance.ts
  export const DAY_SELECT: string;  export function mapDay(r: Row): AttendanceDay;
  ```
  `shared/types.ts`: `export interface DayOverride { kind: 'times' | 'leave' | 'business_trip'; reason: string; byName: string; at: string }`; `AttendanceDay` thêm `override: DayOverride | null`.

- [ ] **Step 1: Test (fail)** — `tests/overrides.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, addDetection } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';
import { closeDays, recomputeForShiftChange } from '../server/attendance';

const NOW = vnDateTimeToTs('2026-10-15', '18:00'); // thứ 5
const at = (d: string, hhmm: string) => vnDateTimeToTs(d, hhmm);
const D = '2026-10-14'; // thứ 4

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const a1 = seedArea(app.db, 'KV1');
  const a2 = seedArea(app.db, 'KV2');
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
  const d2 = seedDepartment(app.db, 'PB2', 'Kho', a2);
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    hr2: seedUser(app.db, { code: 'HR02', role: 'hr' }),
    qk: seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a1], departmentId: d1 }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: d1 }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: d2 }),
  };
  return { app, ids };
}
const path = (u: string, d = D) => `/api/attendance/${u}/${d}/adjustment`;
const row = (app: any, u: string, d = D) =>
  app.db.prepare('SELECT status, first_in, last_out, late_minutes FROM attendance_days WHERE user_id = ? AND work_date = ?').get(u, d);

test('sửa giờ vào làm muộn → đúng giờ; bỏ điều chỉnh quay về; nhãn override; nhật ký trước/sau', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at(D, '08:40'));
    addDetection(app.db, ids.nv1, at(D, '17:05'));
    assert.equal(row(app, ids.nv1).status, 'late');
    const hr = await loginAs(app, 'HR01');
    const put = await hr.put(path(ids.nv1), { kind: 'times', firstIn: '08:00', reason: 'Camera cửa chính hỏng' });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.day.status, 'on_time');
    assert.equal(put.body.day.firstIn, at(D, '08:00'));
    assert.equal(put.body.day.lastOut, at(D, '17:05'));
    assert.deepEqual({ ...put.body.day.override, at: undefined }, { kind: 'times', reason: 'Camera cửa chính hỏng', byName: 'HR01 (HR01)', at: undefined });
    const list = await hr.get(`/api/attendance?date=${D}`);
    assert.equal(list.body.records.find((r: any) => r.userId === ids.nv1).override.kind, 'times');

    const del = await hr.req('DELETE', path(ids.nv1), { reason: 'Nhầm người' });
    assert.equal(del.status, 200);
    assert.equal(del.body.day.status, 'late');
    assert.equal(del.body.day.override, null);
    assert.equal((await hr.req('DELETE', path(ids.nv1), { reason: 'Lần hai' })).status, 404);

    const logs = app.db.prepare("SELECT action, before_json, after_json, reason, area_id, work_date FROM audit_logs WHERE action LIKE 'attendance.%' ORDER BY id").all() as any[];
    assert.deepEqual(logs.map((l) => l.action), ['attendance.override', 'attendance.override_remove']);
    assert.equal(JSON.parse(logs[0].before_json).status, 'late');
    assert.equal(JSON.parse(logs[0].after_json).status, 'on_time');
    assert.equal(logs[0].work_date, D);
    assert.ok(logs[0].area_id);
  } finally {
    await app.close();
  }
});

test('chuyển vắng → nghỉ phép / công tác; điều chỉnh thắng đơn đã duyệt; còn nguyên sau tính lại và đóng ngày', async () => {
  const { app, ids } = await setup();
  try {
    closeDays(app.db, NOW);
    assert.equal(row(app, ids.nv1, '2026-10-15').status, 'absent');
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.put(path(ids.nv1, '2026-10-15'), { kind: 'business_trip', reason: 'Đi kho Đức Giang' })).body.day.status, 'business_trip');
    recomputeForShiftChange(app.db, [ids.nv1], NOW);
    closeDays(app.db, NOW);
    assert.equal(row(app, ids.nv1, '2026-10-15').status, 'business_trip');
    // Đơn nghỉ phép đã duyệt cho ngày D, sau đó sửa giờ: giờ sửa thắng
    const nv = await loginAs(app, 'NV01');
    const req = await nv.post('/api/requests', { type: 'leave_request', workDate: D, reason: 'Ốm' });
    await hr.put(`/api/requests/${req.body.request.id}`, { status: 'approved' });
    assert.equal(row(app, ids.nv1).status, 'leave');
    const put = await hr.put(path(ids.nv1), { kind: 'times', firstIn: '08:00', lastOut: '17:00', reason: 'Thực tế đi làm' });
    assert.equal(put.body.day.status, 'on_time');
    assert.equal((await hr.put(path(ids.nv1), { kind: 'leave', reason: 'Đổi lại thành phép' })).body.day.status, 'leave');
  } finally {
    await app.close();
  }
});

test('kiểm tra đầu vào và quyền', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at(D, '08:40'));
    const hr = await loginAs(app, 'HR01');
    const bad = async (body: unknown, p = path(ids.nv1)) => (await hr.put(p, body)).status;
    assert.equal(await bad({ kind: 'times', firstIn: '08:00', reason: 'abc' }), 400); // lý do < 5
    assert.equal(await bad({ kind: 'times', firstIn: '08:00', reason: 'x'.repeat(501) }), 400);
    assert.equal(await bad({ kind: 'times', reason: 'Không có giờ' }), 400);
    assert.equal(await bad({ kind: 'times', firstIn: '25:00', reason: 'Giờ sai định dạng' }), 400);
    assert.equal(await bad({ kind: 'times', firstIn: '17:00', lastOut: '08:00', reason: 'Ra trước vào' }), 400);
    assert.equal(await bad({ kind: 'nghi', reason: 'Kiểu không hợp lệ' }), 400);
    assert.equal(await bad({ kind: 'leave', reason: 'Ngày tương lai' }, path(ids.nv1, '2026-10-16')), 400);
    assert.equal(await bad({ kind: 'leave', reason: 'Trước ngày tạo' }, path(ids.nv1, '2026-10-12')), 400);
    assert.equal(await bad({ kind: 'leave', reason: 'Chủ nhật không có dòng' }, path(ids.nv1, '2026-10-11')), 400);
    // Review Focus 1: chỉ nhập giờ ra cho ngày chưa có lượt quẹt
    const noIn = await hr.put(path(ids.nv1, '2026-10-13'), { kind: 'times', lastOut: '17:00', reason: 'Chỉ có giờ ra' });
    assert.equal(noIn.status, 400);
    assert.match(noIn.body.error, /chưa có giờ vào/);
    assert.equal(row(app, ids.nv1, '2026-10-13'), undefined);

    assert.equal((await hr.put(path(ids.hr), { kind: 'leave', reason: 'Tự sửa của mình' })).status, 403);
    const qk = await loginAs(app, 'QK01');
    assert.equal((await qk.put(path(ids.nv2), { kind: 'leave', reason: 'Khu khác' })).status, 404);
    assert.equal((await qk.put(path(ids.nv1), { kind: 'leave', reason: 'Trong khu' })).status, 200);
    assert.equal((await (await loginAs(app, 'TP01')).put(path(ids.nv1), { kind: 'leave', reason: 'Trưởng phòng' })).status, 403);
    assert.equal((await (await loginAs(app, 'NV01')).put(path(ids.nv1), { kind: 'leave', reason: 'Nhân viên' })).status, 403);
    // Tháng khóa
    await hr.post('/api/month-locks/2026-10');
    const locked = await hr.put(path(ids.nv1), { kind: 'business_trip', reason: 'Sau khi khóa' });
    assert.equal(locked.status, 423);
    assert.equal((await hr.req('DELETE', path(ids.nv1), { reason: 'Sau khi khóa' })).status, 423);
  } finally {
    await app.close();
  }
});

test('xóa tài khoản HR đã điều chỉnh và khóa sổ vẫn được; dữ liệu giữ nhãn người làm', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at(D, '08:40'));
    const hr2 = await loginAs(app, 'HR02');
    await hr2.put(path(ids.nv1), { kind: 'times', firstIn: '08:00', reason: 'Camera hỏng' });
    await hr2.post('/api/month-locks/2026-09');
    const hr = await loginAs(app, 'HR01');
    // HR toàn hệ thống không xóa được người có vai trò hr theo luật hiện có: hạ vai trò rồi xóa
    await hr.put(`/api/users/${ids.hr2}`, { role: 'employee' });
    assert.equal((await hr.del(`/api/users/${ids.hr2}`)).status, 200);
    const ov = app.db.prepare('SELECT created_by_label FROM attendance_overrides WHERE user_id = ?').get(ids.nv1) as { created_by_label: string };
    assert.equal(ov.created_by_label, 'HR02 (HR02)');
    assert.equal((app.db.prepare("SELECT locked_by_label FROM month_locks WHERE month = '2026-09'").get() as any).locked_by_label, 'HR02 (HR02)');
  } finally {
    await app.close();
  }
});
```

Ghi chú: `2026-10-11` là chủ nhật. Nếu luật xóa tài khoản không cho HR01 hạ vai trò HR02 rồi xóa, dùng `loginAs(app, 'ADMIN')` không được vì helper không seed ADMIN: khi đó seed thêm `seedUser(app.db, { code: 'ADMIN', role: 'hr' })` và xóa bằng ADMIN.

Run: `npx tsx --test tests/overrides.test.ts` — Expected: FAIL.

- [ ] **Step 2: `server/overrides.ts`**

```ts
import type { Db } from './db';
import { HttpError } from './errors';

export type OverrideKind = 'times' | 'leave' | 'business_trip';

export interface StoredOverride {
  kind: OverrideKind;
  firstIn: number | null;
  lastOut: number | null;
  reason: string;
  byLabel: string;
  at: string;
}

export const OVERRIDE_KINDS: OverrideKind[] = ['times', 'leave', 'business_trip'];
export const REASON_MIN = 5;
export const REASON_MAX = 500;

export function readOverride(db: Db, userId: string, workDate: string): StoredOverride | null {
  const r = db
    .prepare('SELECT kind, first_in, last_out, reason, created_by_label, created_at FROM attendance_overrides WHERE user_id = ? AND work_date = ?')
    .get(userId, workDate) as
    | { kind: OverrideKind; first_in: number | null; last_out: number | null; reason: string; created_by_label: string; created_at: string }
    | undefined;
  return r
    ? { kind: r.kind, firstIn: r.first_in, lastOut: r.last_out, reason: r.reason, byLabel: r.created_by_label, at: r.created_at }
    : null;
}

export function parseReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new HttpError(400, `Phải nhập lý do điều chỉnh (${REASON_MIN}–${REASON_MAX} ký tự)`);
  }
  return reason;
}
```

- [ ] **Step 3: Áp dụng điều chỉnh trong `writeDay` (`server/attendance.ts`)**

Import `import { readOverride } from './overrides';`. Trong `writeDay`, sau dòng chặn tháng khóa (Task 3) và sau khi đọc `detections`, thay đoạn tính `computed` và `leave`:

```ts
  const ov = readOverride(db, userId, workDate);
  const times = ov?.kind === 'times' ? ov : null;
  const computed = computeDay({
    detectionTs: detections.map((d) => d.ts),
    settings: rule,
    lateExcused: adj.lateExcused,
    manualIn: times?.firstIn ?? adj.manualIn,
    manualOut: times?.lastOut ?? adj.manualOut,
    closed,
  });

  // Điều chỉnh trực tiếp thắng mọi nguồn khác (spec đợt C §7): phép/công tác cả ngày, hoặc giờ sửa (bỏ qua đơn nghỉ)
  const leave = ov && ov.kind !== 'times' ? ov.kind : !ov && eligible && workday ? approvedLeaveType(db, userId, workDate) : null;
```

Phần còn lại (`if (leave) {...}`, `if (computed) {...}`, vắng, xóa dòng) giữ nguyên. Cập nhật JSDoc thứ tự ưu tiên: "tháng khóa ⇒ không ghi > điều chỉnh phép/công tác > (điều chỉnh giờ ⇒ bỏ qua đơn nghỉ) đơn nghỉ/công tác đã duyệt > lượt quẹt/giờ chỉnh tay > vắng > không có dòng".

- [ ] **Step 4: `DAY_SELECT` / `mapDay` có override (`server/routes/attendance.ts`)**

```ts
export const DAY_SELECT = `SELECT a.*, u.code AS employee_code, u.name AS employee_name, u.avatar_url, u.department_id,
  d.name AS department_name, o.kind AS ov_kind, o.reason AS ov_reason, o.created_by_label AS ov_by, o.created_at AS ov_at
  FROM attendance_days a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN attendance_overrides o ON o.user_id = a.user_id AND o.work_date = a.work_date`;

export function mapDay(r: Row): AttendanceDay {
  return {
    // ... các trường cũ giữ nguyên ...
    override: r.ov_kind ? { kind: r.ov_kind, reason: r.ov_reason, byName: r.ov_by, at: r.ov_at } : null,
  };
}
```

Thêm `DayOverride` và `override` vào `shared/types.ts`. Tìm mọi chỗ tạo `AttendanceDay` khác (grep `AttendanceDay` trong `server/`) và thêm `override: null` hoặc dùng `mapDay`.

- [ ] **Step 5: Route điều chỉnh (trong `attendanceRoutes`, trước `r.post('/attendance/recompute'...)`)**

```ts
  /** Kiểm tra chung cho điều chỉnh (spec đợt C §7), theo đúng thứ tự mã lỗi. */
  const overrideTarget = (req: Request): { actor: AuthUser; target: User; date: string } => {
    const actor = currentUser(req);
    if (actor.role !== 'hr' && actor.role !== 'area_admin') throw new HttpError(403, 'Bạn không có quyền điều chỉnh ngày công');
    const target = getUser(db, req.params.userId);
    if (!target || !managesArea(actor, target.areaId)) throw notFound('nhân sự');
    if (target.id === actor.id) throw new HttpError(403, 'Không thể tự điều chỉnh ngày công của mình');
    if (target.code === SYSTEM_ADMIN_CODE) throw new HttpError(400, 'Tài khoản quản trị hệ thống không chấm công');
    const date = req.params.date;
    if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    if (date > toVnDate(ctx.now())) throw new HttpError(400, 'Không điều chỉnh ngày trong tương lai');
    if (date < target.createdAt.slice(0, 10)) throw new HttpError(400, 'Ngày này trước khi tạo tài khoản nhân sự');
    return { actor, target, date };
  };

  const dayOf = (userId: string, date: string): AttendanceDay | null => {
    const row = db.prepare(`${DAY_SELECT} WHERE a.user_id = ? AND a.work_date = ?`).get(userId, date) as Row | undefined;
    return row ? mapDay(row) : null;
  };
  const snapshot = (d: AttendanceDay | null) => (d ? { firstIn: d.firstIn, lastOut: d.lastOut, status: d.status } : null);

  r.put('/attendance/:userId/:date/adjustment', (req, res) => {
    const { target, date } = overrideTarget(req);
    const b = req.body ?? {};
    if (!OVERRIDE_KINDS.includes(b.kind)) throw new HttpError(400, 'Kiểu điều chỉnh không hợp lệ');
    const reason = parseReason(b.reason);
    let firstIn: number | null = null;
    let lastOut: number | null = null;
    if (b.kind === 'times') {
      const time = (v: unknown, label: string): number | null => {
        if (v === undefined || v === null || v === '') return null;
        try {
          return vnDateTimeToTs(date, String(v));
        } catch {
          throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
        }
      };
      firstIn = time(b.firstIn, 'Giờ vào');
      lastOut = time(b.lastOut, 'Giờ ra');
      if (firstIn === null && lastOut === null) throw new HttpError(400, 'Hãy nhập giờ vào hoặc giờ ra');
    }
    const hasRow = Boolean(db.prepare('SELECT 1 FROM attendance_days WHERE user_id = ? AND work_date = ?').get(target.id, date));
    if (!hasRow && !isWorkday(db, effectiveShift(db, target.id), date)) throw new HttpError(400, 'Ngày này không phải ngày làm việc của nhân sự');
    if (isMonthLocked(db, date)) throw lockedError(date.slice(0, 7));
    const a = actorOf(req);
    const day = tx(db, () => {
      const before = dayOf(target.id, date);
      db.prepare(
        `INSERT INTO attendance_overrides(user_id, work_date, kind, first_in, last_out, reason, created_by, created_by_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, work_date) DO UPDATE SET kind = excluded.kind, first_in = excluded.first_in, last_out = excluded.last_out,
           reason = excluded.reason, created_by = excluded.created_by, created_by_label = excluded.created_by_label, created_at = excluded.created_at`,
      ).run(target.id, date, b.kind, firstIn, lastOut, reason, a.actorId, a.actorLabel, new Date(ctx.now()).toISOString());
      recomputeDay(db, target.id, date, ctx.now());
      const after = dayOf(target.id, date);
      if (b.kind === 'times') {
        if (!after || after.firstIn === null) throw new HttpError(400, 'Ngày này chưa có giờ vào: hãy nhập giờ vào');
        if (after.lastOut !== null && after.lastOut <= after.firstIn) throw new HttpError(400, 'Giờ ra phải sau giờ vào');
      }
      writeAudit(db, ctx.now(), {
        ...a,
        action: 'attendance.override',
        targetUserId: target.id,
        targetLabel: personLabel(target.name, target.code),
        areaId: target.areaId,
        workDate: date,
        before: snapshot(before),
        after: { ...snapshot(after), kind: b.kind },
        reason,
      });
      return after;
    });
    res.json({ day });
  });

  r.delete('/attendance/:userId/:date/adjustment', (req, res) => {
    const { target, date } = overrideTarget(req);
    const reason = parseReason((req.body ?? {}).reason);
    if (!readOverride(db, target.id, date)) throw new HttpError(404, 'Ngày này chưa được điều chỉnh');
    if (isMonthLocked(db, date)) throw lockedError(date.slice(0, 7));
    const a = actorOf(req);
    const day = tx(db, () => {
      const before = dayOf(target.id, date);
      db.prepare('DELETE FROM attendance_overrides WHERE user_id = ? AND work_date = ?').run(target.id, date);
      recomputeDay(db, target.id, date, ctx.now());
      const after = dayOf(target.id, date);
      writeAudit(db, ctx.now(), {
        ...a,
        action: 'attendance.override_remove',
        targetUserId: target.id,
        targetLabel: personLabel(target.name, target.code),
        areaId: target.areaId,
        workDate: date,
        before: snapshot(before),
        after: snapshot(after),
        reason,
      });
      return after;
    });
    res.json({ day });
  });
```

Import thêm: `Request` từ `express`; `User` từ shared types; `managesArea` từ `../access`; `SYSTEM_ADMIN_CODE` từ `../bootstrap`; `recomputeDay` từ `../attendance`; `tx` từ `../db`; `actorOf, personLabel, writeAudit` từ `../audit`; `isMonthLocked, lockedError` từ `../month-lock`; `OVERRIDE_KINDS, parseReason, readOverride` từ `../overrides`; `vnDateTimeToTs` từ `../vntime`. Lưu ý thứ tự kiểm tra trong spec: 403 vai trò → 404 phạm vi → 403 tự sửa → 400 ADMIN → 400 lý do / ngày → 400 ngày không làm → 423. Trong `PUT`, lý do được kiểm tra trước ngày không làm (như code trên); ngày sai định dạng / tương lai / trước ngày tạo đã kiểm tra trong `overrideTarget` — chấp nhận thứ tự này (ghi chú trong report nếu test cần).

- [ ] **Step 6: Chạy test + toàn bộ, commit**

Run: `npx tsx --test tests/overrides.test.ts && npm test && TZ=UTC npm test && npm run lint` — Expected: PASS. Sửa các test cũ so sánh nguyên object `AttendanceDay` (thêm `override: null`).

```bash
git add server/overrides.ts server/attendance.ts server/routes/attendance.ts shared/types.ts tests/overrides.test.ts
git commit -m "feat(attendance): direct attendance overrides with mandatory reason, audit log, month-lock aware

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Thêm vào `git add` các file test cũ đã sửa nếu có.)

---

### Task 5: Ghi nhật ký cho đơn, tài khoản, ca, ngưỡng, ngày lễ

**Files:**
- Modify: `server/routes/requests.ts` (PUT), `server/routes/users.ts` (PUT, DELETE), `server/routes/departments.ts` (PUT), `server/routes/shifts.ts` (POST/PUT/DELETE shifts, POST/DELETE holidays), `server/routes/settings.ts` (PUT work)
- Test: `tests/audit-actions.test.ts`

**Interfaces:**
- Consumes: `writeAudit`, `actorOf`, `personLabel`, `userAreaId` (Task 2).
- Produces: các dòng `audit_logs` với `action` đúng bảng §5 spec.

Quy tắc chung: ghi **trong cùng `tx`** với câu lệnh ghi DB; nếu handler chưa có `tx` quanh câu ghi thì bọc `tx(db, () => { ...ghi...; writeAudit(...) })`. Việc tính lại (`recompute*`) để nguyên ngoài như hiện tại. `before`/`after` chỉ chứa trường thay đổi.

- [ ] **Step 1: Test (fail)** — `tests/audit-actions.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';

const NOW = vnDateTimeToTs('2026-10-15', '10:00');

test('mỗi thao tác nhạy cảm ghi đúng một dòng nhật ký; thao tác lỗi không ghi', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    const a1 = seedArea(app.db, 'KV1');
    const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const nv = seedUser(app.db, { code: 'NV01', departmentId: d1 });
    const nv2 = seedUser(app.db, { code: 'NV02', departmentId: d1 });
    const hr = await loginAs(app, 'HR01');
    const before = (app.db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get() as { c: number }).c;
    const acts = () => (app.db.prepare('SELECT action FROM audit_logs ORDER BY id').all() as { action: string }[]).map((r) => r.action).slice(before);

    const req1 = await (await loginAs(app, 'NV01')).post('/api/requests', { type: 'late_explanation', workDate: '2026-10-14', reason: 'Tắc đường' });
    const req2 = await (await loginAs(app, 'NV01')).post('/api/requests', { type: 'late_explanation', workDate: '2026-10-13', reason: 'Mưa' });
    const startCount = acts().length; // đăng nhập NV không ghi
    assert.equal(startCount, 0);
    await hr.put(`/api/requests/${req1.body.request.id}`, { status: 'approved', comment: 'Ok' });
    await hr.put(`/api/requests/${req2.body.request.id}`, { status: 'rejected', comment: 'Không hợp lệ' });
    await hr.put(`/api/users/${nv}`, { role: 'dept_manager' });
    await hr.put(`/api/users/${nv}`, { status: 'inactive' });
    await hr.put(`/api/users/${nv2}`, { role: 'area_admin', adminAreaIds: [a1] });
    const shift = await hr.post('/api/shifts', { areaId: a1, name: 'Ca kho', workStart: '07:00', workEnd: '16:00', workDays: [1, 2, 3, 4, 5, 6], lateGraceMinutes: 10, earlyArrivalMinutes: 15, earlyLeaveMinutes: 10 });
    await hr.put(`/api/shifts/${shift.body.shift.id}`, { workStart: '07:30' });
    await hr.put(`/api/departments/${d1}`, { shiftId: shift.body.shift.id });
    await hr.put(`/api/departments/${d1}`, { shiftId: null });
    await hr.del(`/api/shifts/${shift.body.shift.id}`);
    const ws = (await hr.get('/api/settings/work')).body.settings;
    await hr.put('/api/settings/work', { ...ws, lateGraceMinutes: 20 });
    await hr.post('/api/holidays', { date: '2026-12-31', name: 'Nghỉ bù' });
    await hr.del('/api/holidays/2026-12-31');
    await hr.del(`/api/users/${nv}`);
    // Lỗi: duyệt lại đơn đã xử lý ⇒ 409, không ghi
    assert.equal((await hr.put(`/api/requests/${req1.body.request.id}`, { status: 'approved' })).status, 409);

    assert.deepEqual(acts(), [
      'request.approve', 'request.reject',
      'user.role', 'user.status',
      'user.role', 'user.areas',
      'shift.create', 'shift.update', 'shift.assign', 'shift.assign', 'shift.delete',
      'settings.work', 'holiday.add', 'holiday.remove',
      'user.delete',
    ]);
    const role = app.db.prepare("SELECT before_json, after_json, area_id, target_user_id FROM audit_logs WHERE action = 'user.role' ORDER BY id LIMIT 1").get() as any;
    assert.deepEqual([JSON.parse(role.before_json), JSON.parse(role.after_json)], [{ role: 'employee' }, { role: 'dept_manager' }]);
    assert.equal(role.area_id, a1);
    assert.equal(role.target_user_id, nv);
    const sw = app.db.prepare("SELECT before_json, after_json FROM audit_logs WHERE action = 'settings.work'").get() as any;
    assert.equal(JSON.parse(sw.before_json).lateGraceMinutes, ws.lateGraceMinutes);
    assert.equal(JSON.parse(sw.after_json).lateGraceMinutes, 20);
  } finally {
    await app.close();
  }
});
```

Nếu tên trường body của `/api/shifts` hoặc `/api/settings/work` khác (xem `validateShiftInput`, `validateWorkSettings`), sửa body test cho khớp — không đổi API.

Run: `npx tsx --test tests/audit-actions.test.ts` — Expected: FAIL (mảng rỗng).

- [ ] **Step 2: Đơn (`server/routes/requests.ts`, trong `tx` của PUT, ngay sau `UPDATE requests ...`)**

```ts
      writeAudit(db, ctx.now(), {
        ...actorOf(req),
        action: status === 'approved' ? 'request.approve' : 'request.reject',
        targetUserId: target.userId,
        targetLabel: personLabel(target.employeeName, target.employeeCode),
        areaId: userAreaId(db, target.userId),
        workDate: target.workDate,
        before: { status: 'pending' },
        after: { status, comment: typeof comment === 'string' ? comment.trim() : '', type: target.type, from: target.workDate, to: target.endDate ?? target.workDate },
      });
```

Ghi audit **trước** các nhánh có thể `throw` (đơn quên quẹt không có giờ, đơn nghỉ trùng ngày) cũng được, vì `tx` rollback cả dòng nhật ký khi lỗi.

- [ ] **Step 3: Tài khoản (`server/routes/users.ts`)**

PUT: thay khối `tx(db, () => { ... })` bằng:

```ts
    const a = actorOf(req);
    const audit = (action: AuditAction, before: unknown, after: unknown) =>
      writeAudit(db, ctx.now(), { ...a, action, targetUserId: target.id, targetLabel: personLabel(target.name, target.code), areaId: target.areaId, before, after });
    tx(db, () => {
      if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, target.id);
      if (adminAreas !== null) setAdminAreas(db, target.id, adminAreas);
      if (changesRole) audit('user.role', { role: target.role }, { role: b.role });
      if (b.status !== undefined && b.status !== target.status) audit('user.status', { status: target.status }, { status: b.status });
      if (adminAreas !== null && adminAreas.slice().sort().join(',') !== target.adminAreaIds.join(',')) {
        audit('user.areas', { areaIds: target.adminAreaIds }, { areaIds: adminAreas });
      }
      if (changesShift || (changesDept && target.shiftId && !shiftInDeptArea(db, target.shiftId, deptAfter))) {
        const now = db.prepare('SELECT shift_id FROM users WHERE id = ?').get(target.id) as { shift_id: string | null };
        if (now.shift_id !== target.shiftId) audit('shift.assign', { shiftId: target.shiftId }, { shiftId: now.shift_id });
      }
    });
```

(Đổi tên biến `now` trong khối cho khỏi trùng `const now = ctx.now()` phía dưới, ví dụ `cur`.)

DELETE: bọc xóa và nhật ký trong `tx`:

```ts
    tx(db, () => {
      writeAudit(db, ctx.now(), {
        ...actorOf(req),
        action: 'user.delete',
        targetUserId: target.id,
        targetLabel: personLabel(target.name, target.code),
        areaId: target.areaId,
        before: { code: target.code, name: target.name, role: target.role, departmentName: target.departmentName, email: target.email },
        after: null,
        reason: `Sao lưu trước khi xóa: ${backup}`,
      });
      db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    });
```

- [ ] **Step 4: Phòng ban gán ca (`server/routes/departments.ts`, trong `tx` của PUT)**

```ts
      if (shiftId !== undefined && shiftId !== dept.shiftId) {
        writeAudit(db, ctx.now(), {
          ...actorOf(req),
          action: 'shift.assign',
          targetLabel: `Phòng ${dept.name}`,
          areaId: areaAfter,
          before: { shiftId: dept.shiftId },
          after: { shiftId },
        });
      }
```

(Nếu kiểu `Department` dùng tên trường khác cho ca hiện tại, dùng đúng tên đó.)

- [ ] **Step 5: Ca và ngày lễ (`server/routes/shifts.ts`), ngưỡng (`server/routes/settings.ts`)**

Mỗi handler ghi DB → bọc `tx(db, () => { <câu ghi>; writeAudit(...) })`:

- `POST /shifts`: `action: 'shift.create'`, `targetLabel: \`Ca ${s.name}\``, `areaId`, `after: s`.
- `PUT /shifts/:id`: `action: 'shift.update'`, `before: cur` (bỏ `departmentCount`, `userCount`, `areaName`), `after: s`.
- `DELETE /shifts/:id`: `action: 'shift.delete'`, `before: { name: cur.name, workStart: cur.workStart, workEnd: cur.workEnd }`.
- `POST /holidays`: `action: 'holiday.add'`, `targetLabel: \`Ngày lễ ${b.date}\``, `after: { date, name }`.
- `DELETE /holidays/:date`: đọc tên trước khi xóa; `action: 'holiday.remove'`, `before: { date, name }`; chỉ ghi khi `changes > 0`.
- `PUT /settings/work`: `const before = getWorkSettings(db);` rồi trong `tx`: `saveWorkSettings(...)`; `writeAudit(..., { action: 'settings.work', targetLabel: 'Ca mặc định công ty', before, after: validated })`.

- [ ] **Step 6: Chạy test + toàn bộ, commit**

Run: `npx tsx --test tests/audit-actions.test.ts && npm test && TZ=UTC npm test && npm run lint` — Expected: PASS.

```bash
git add server/routes/requests.ts server/routes/users.ts server/routes/departments.ts server/routes/shifts.ts server/routes/settings.ts tests/audit-actions.test.ts
git commit -m "feat(audit): audit request reviews, account role/status/areas/delete, shifts, defaults and holidays

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Báo cáo tháng (JSON) và API "Của tôi"

**Files:**
- Create: `server/reports.ts`, `server/routes/reports.ts`, `tests/reports.test.ts`
- Modify: `server/app.ts`, `shared/types.ts`

**Interfaces:**
- Consumes: `DAY_SELECT`, `mapDay` (Task 4); `lockOf`, `isValidMonth` (Task 3); `effectiveShift`, `isWorkday`, `isoWeekday` (`server/shifts.ts`).
- Produces:
  ```ts
  // shared/types.ts
  export type MonthlySymbol = 'X' | 'M' | 'S' | 'MS' | 'T' | 'CT' | 'P' | 'V' | 'L';
  export interface MonthlyDay { date: string; weekday: number; holiday: string | null }
  export interface MonthlyRow { userId: string; employeeCode: string; employeeName: string; departmentName: string | null;
    cells: (string | null)[]; requiredDays: number; workDays: number; lateCount: number; lateMinutes: number;
    earlyCount: number; earlyMinutes: number; missingOutDays: number; absentDays: number; leaveDays: number;
    businessTripDays: number; attendanceRate: number | null }
  export interface MonthlyReport { month: string; days: MonthlyDay[]; lock: MonthLock | null; scopeLabel: string; rows: MonthlyRow[] }
  export interface MyAttendance { tracked: boolean;
    profile: { code: string; name: string; departmentName: string | null; position: string;
      shift: { name: string; workStart: string; workEnd: string; workDays: number[] } } | null;
    today: AttendanceDay | null; report: MonthlyRow | null; lock: MonthLock | null;
    days: { date: string; weekday: number; holiday: string | null; workday: boolean; record: AttendanceDay | null }[] }
  // server/reports.ts
  export function monthDays(db: Db, month: string): MonthlyDay[];
  export function symbolOf(status: DayStatus, final: boolean): MonthlySymbol;
  export function buildRows(db: Db, users: ReportUser[], month: string, now: number): MonthlyRow[];
  export function buildMonthlyReport(db: Db, viewer: AuthUser, q: { month: string; area?: unknown; department?: unknown }, now: number): MonthlyReport;
  export function parseMonthParam(raw: unknown, now: number): string; // mặc định tháng hiện tại, sai ⇒ 400
  ```

- [ ] **Step 1: Test (fail)** — `tests/reports.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, addDetection } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';
import { closeDays, recomputeUsers } from '../server/attendance';

// Hôm nay: thứ 5 15/10/2026 18:00 (đã qua giờ ra)
const NOW = vnDateTimeToTs('2026-10-15', '18:00');
const at = (d: string, hhmm: string) => vnDateTimeToTs(d, hhmm);

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const a1 = seedArea(app.db, 'KV1', 'Trụ sở');
  const a2 = seedArea(app.db, 'KV2', 'Kho');
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
  const d2 = seedDepartment(app.db, 'PB2', 'Kho xăng', a2);
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    qk: seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a2] }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 }),
    nv1: seedUser(app.db, { code: 'NV01', name: 'An', departmentId: d1 }),
    nv2: seedUser(app.db, { code: 'NV02', name: 'Bình', departmentId: d2 }),
    old: seedUser(app.db, { code: 'NV09', name: 'Cũ', departmentId: d1, status: 'inactive' }),
    old2: seedUser(app.db, { code: 'NV08', name: 'Cũ 2', departmentId: d1, status: 'inactive' }),
  };
  app.db.prepare("UPDATE users SET created_at = '2026-10-01'").run();
  app.db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-10', 'Giải phóng Thủ đô')").run(); // thứ 7 — không ảnh hưởng ngày phải làm T2–T6
  app.db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-02', 'Nghỉ bù')").run();            // thứ 6
  // NV01: 01/10 đúng giờ; 05/10 muộn 20'; 06/10 về sớm 30'; 07/10 thiếu giờ ra; 08/10 vắng (đóng ngày); 09/10 phép; 12/10 công tác (điều chỉnh)
  addDetection(app.db, ids.nv1, at('2026-10-01', '07:55')); addDetection(app.db, ids.nv1, at('2026-10-01', '17:05'));
  addDetection(app.db, ids.nv1, at('2026-10-05', '08:20')); addDetection(app.db, ids.nv1, at('2026-10-05', '17:00'));
  addDetection(app.db, ids.nv1, at('2026-10-06', '08:00')); addDetection(app.db, ids.nv1, at('2026-10-06', '16:30'));
  addDetection(app.db, ids.nv1, at('2026-10-07', '08:00'));
  addDetection(app.db, ids.old, at('2026-10-01', '08:00')); // người nghỉ việc nhưng có dữ liệu
  recomputeUsers(app.db, [ids.nv1, ids.nv2], '2026-10-01', '2026-10-15', NOW);
  return { app, ids, a1, a2, d1, d2 };
}

test('ký hiệu, số đếm, ngày phải làm, tỷ lệ chuyên cần, ô điều chỉnh có *', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NV01');
    const leave = await nv.post('/api/requests', { type: 'leave_request', workDate: '2026-10-09', reason: 'Việc nhà' });
    await hr.put(`/api/requests/${leave.body.request.id}`, { status: 'approved' });
    await hr.put(`/api/attendance/${ids.nv1}/2026-10-12/adjustment`, { kind: 'business_trip', reason: 'Đi kho Đức Giang' });
    const r = await hr.get('/api/reports/monthly?month=2026-10');
    assert.equal(r.status, 200);
    assert.equal(r.body.days.length, 31);
    assert.deepEqual(r.body.days[1], { date: '2026-10-02', weekday: 5, holiday: 'Nghỉ bù' });
    const row = r.body.rows.find((x: any) => x.employeeCode === 'NV01');
    const cell = (d: number) => row.cells[d - 1];
    assert.deepEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 16].map(cell), ['X', 'L', null, 'M', 'S', 'T', 'V', 'P', 'L', 'CT*', null]);
    // T2–T6 từ 01/10 tới 15/10 trừ 02/10 (lễ) = 10 ngày
    assert.equal(row.requiredDays, 10);
    assert.equal(row.workDays, 5); // X M S T CT
    assert.deepEqual([row.lateCount, row.lateMinutes, row.earlyCount, row.earlyMinutes], [1, 20, 1, 30]);
    assert.deepEqual([row.missingOutDays, row.absentDays, row.leaveDays, row.businessTripDays], [1, 4, 1, 1]);
    assert.equal(row.attendanceRate, 60); // (5 + 1) / 10
  } finally {
    await app.close();
  }
});

test('phạm vi: HR lọc khu/phòng, quản trị khu chỉ khu mình, trưởng phòng chỉ phòng mình, nhân viên 403; người nghỉ việc', async () => {
  const { app, a1, a2, d2 } = await setup();
  try {
    const codes = (b: any) => b.rows.map((x: any) => x.employeeCode);
    const hr = await loginAs(app, 'HR01');
    const all = await hr.get('/api/reports/monthly?month=2026-10');
    assert.ok(codes(all.body).includes('NV09'), 'người nghỉ việc có dữ liệu vẫn có dòng');
    assert.ok(!codes(all.body).includes('NV08'), 'người nghỉ việc không có dữ liệu không có dòng');
    assert.ok(!codes(all.body).includes('ADMIN'));
    assert.equal(all.body.scopeLabel, 'Toàn công ty');
    assert.deepEqual(codes((await hr.get(`/api/reports/monthly?month=2026-10&area=${a2}`)).body), ['NV02']);
    const byDept = await hr.get(`/api/reports/monthly?month=2026-10&department=${d2}`);
    assert.equal(byDept.body.scopeLabel, 'Phòng Kho xăng');
    const qk = await loginAs(app, 'QK01');
    assert.ok(codes((await qk.get('/api/reports/monthly?month=2026-10')).body).includes('NV02'));
    assert.ok(!codes((await qk.get('/api/reports/monthly?month=2026-10')).body).includes('NV01'));
    assert.equal((await qk.get(`/api/reports/monthly?month=2026-10&area=${a1}`)).status, 404);
    const tp = await loginAs(app, 'TP01');
    assert.deepEqual(codes((await tp.get(`/api/reports/monthly?month=2026-10&area=${a2}`)).body).sort(), ['NV01', 'NV09', 'TP01']);
    assert.equal((await (await loginAs(app, 'NV01')).get('/api/reports/monthly?month=2026-10')).status, 403);
    for (const bad of ['2026-13', '2026-1', 'abc']) assert.equal((await hr.get(`/api/reports/monthly?month=${bad}`)).status, 400);
    const future = await hr.get('/api/reports/monthly?month=2026-12');
    assert.ok(future.body.rows.every((x: any) => x.requiredDays === 0 && x.attendanceRate === null));
  } finally {
    await app.close();
  }
});

test('/me/attendance: chỉ dữ liệu của mình, đủ ngày, hôm nay, ca; ADMIN không chấm công', async () => {
  const { app } = await setup();
  try {
    closeDays(app.db, NOW);
    const me = await (await loginAs(app, 'NV01')).get('/api/me/attendance?month=2026-10');
    assert.equal(me.status, 200);
    assert.equal(me.body.tracked, true);
    assert.equal(me.body.profile.code, 'NV01');
    assert.equal(me.body.profile.shift.workStart, '08:00');
    assert.equal(me.body.days.length, 31);
    assert.equal(me.body.days[0].record.status, 'on_time');
    assert.equal(me.body.days[1].workday, false); // lễ
    assert.equal(me.body.report.employeeCode, 'NV01');
    assert.equal(me.body.today.workDate, '2026-10-15');
    assert.equal((await (await loginAs(app, 'NV01')).get('/api/me/attendance?month=2026-1')).status, 400);
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    const admin = await (await loginAs(app, 'ADMIN')).get('/api/me/attendance');
    assert.equal(admin.body.tracked, false);
  } finally {
    await app.close();
  }
});
```

Ghi chú khi chạy: số `absentDays` = 4 là 08, 13, 14, 15/10 (NV01 không quẹt các ngày đó và đã qua giờ ra) — nếu `recomputeUsers` không ghi vắng vì `closed`, đối chiếu với logic `writeDay` rồi sửa **kỳ vọng** (không sửa logic đợt B). Giờ ca mặc định lấy từ `DEFAULT_WORK_SETTINGS` (08:00–17:00, muộn cho phép 15', về sớm 10'); nếu khác, sửa giờ quẹt trong `setup` cho đúng ý đồ (muộn 20', về sớm 30').

Run: `npx tsx --test tests/reports.test.ts` — Expected: FAIL.

- [ ] **Step 2: `server/reports.ts`**

```ts
import type { Db } from './db';
import { HttpError } from './errors';
import type { AuthUser } from './auth';
import { scopeFor, scopeWhere } from './auth';
import { areaFilterSql, departmentScopeSql, isGlobalHr, notFound, parseAreaFilter } from './access';
import { NOT_SYSTEM_ADMIN } from './bootstrap';
import { effectiveShift, isoWeekday, isWorkday } from './shifts';
import { isValidMonth, lockOf } from './month-lock';
import { addDays, toVnDate } from './vntime';
import type { DayStatus, MonthlyDay, MonthlyReport, MonthlyRow, MonthlySymbol } from '../shared/types';

export interface ReportUser {
  id: string;
  code: string;
  name: string;
  departmentName: string | null;
  createdAt: string;
}

export function parseMonthParam(raw: unknown, now: number): string {
  if (raw === undefined || raw === '') return toVnDate(now).slice(0, 7);
  if (!isValidMonth(raw)) throw new HttpError(400, 'Tháng không hợp lệ (định dạng YYYY-MM)');
  return raw;
}

export function monthDays(db: Db, month: string): MonthlyDay[] {
  const holidays = new Map(
    (db.prepare('SELECT date, name FROM holidays WHERE date LIKE ?').all(`${month}-%`) as { date: string; name: string }[]).map((h) => [h.date, h.name]),
  );
  const out: MonthlyDay[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) {
    out.push({ date: d, weekday: isoWeekday(d), holiday: holidays.get(d) ?? null });
  }
  return out;
}

const SYMBOL: Record<Exclude<DayStatus, 'missing_out'>, MonthlySymbol> = {
  on_time: 'X',
  late: 'M',
  early_leave: 'S',
  late_and_early: 'MS',
  business_trip: 'CT',
  leave: 'P',
  absent: 'V',
};

/** Ký hiệu lưới (spec đợt C §6). Thiếu giờ ra chưa chốt (đang trong giờ làm) coi như X. */
export function symbolOf(status: DayStatus, final: boolean): MonthlySymbol {
  if (status === 'missing_out') return final ? 'T' : 'X';
  return SYMBOL[status];
}

const WORK_SYMBOLS = new Set<MonthlySymbol>(['X', 'M', 'S', 'MS', 'T', 'CT']);

export function buildRows(db: Db, users: ReportUser[], month: string, now: number): MonthlyRow[] {
  const days = monthDays(db, month);
  const today = toVnDate(now);
  const last = days[days.length - 1].date;
  const dayRows = db.prepare(
    `SELECT a.work_date, a.status, a.final, a.late_minutes, a.early_minutes, o.user_id IS NOT NULL AS ov
     FROM attendance_days a LEFT JOIN attendance_overrides o ON o.user_id = a.user_id AND o.work_date = a.work_date
     WHERE a.user_id = ? AND a.work_date BETWEEN ? AND ?`,
  );
  return users.map((u) => {
    const rule = effectiveShift(db, u.id);
    const byDate = new Map(
      (dayRows.all(u.id, days[0].date, last) as { work_date: string; status: DayStatus; final: number; late_minutes: number; early_minutes: number; ov: number }[]).map(
        (r) => [r.work_date, r],
      ),
    );
    const row: MonthlyRow = {
      userId: u.id, employeeCode: u.code, employeeName: u.name, departmentName: u.departmentName, cells: [],
      requiredDays: 0, workDays: 0, lateCount: 0, lateMinutes: 0, earlyCount: 0, earlyMinutes: 0,
      missingOutDays: 0, absentDays: 0, leaveDays: 0, businessTripDays: 0, attendanceRate: null,
    };
    const created = u.createdAt.slice(0, 10);
    for (const d of days) {
      if (d.date <= today && d.date >= created && isWorkday(db, rule, d.date)) row.requiredDays++;
      const r = byDate.get(d.date);
      if (!r) {
        row.cells.push(d.holiday ? 'L' : null);
        continue;
      }
      const sym = symbolOf(r.status, r.final === 1);
      row.cells.push(r.ov ? `${sym}*` : sym);
      if (WORK_SYMBOLS.has(sym)) row.workDays++;
      if (sym === 'M' || sym === 'MS') {
        row.lateCount++;
        row.lateMinutes += r.late_minutes;
      }
      if (sym === 'S' || sym === 'MS') {
        row.earlyCount++;
        row.earlyMinutes += r.early_minutes;
      }
      if (sym === 'T') row.missingOutDays++;
      if (sym === 'V') row.absentDays++;
      if (sym === 'P') row.leaveDays++;
      if (sym === 'CT') row.businessTripDays++;
    }
    row.attendanceRate = row.requiredDays ? Math.round(((row.workDays + row.leaveDays) / row.requiredDays) * 1000) / 10 : null;
    return row;
  });
}

export function buildMonthlyReport(db: Db, viewer: AuthUser, q: { month: string; area?: unknown; department?: unknown }, now: number): MonthlyReport {
  const { month } = q;
  const w = scopeWhere(scopeFor(viewer), 'u.id', 'u.department_id');
  const managerView = viewer.role === 'hr' || viewer.role === 'area_admin';
  const filter = managerView ? parseAreaFilter(db, viewer, q.area) : { kind: 'all' as const };
  const f = areaFilterSql(filter, 'u.department_id');
  let deptSql = '1=1';
  const deptParams: string[] = [];
  let scopeLabel = isGlobalHr(viewer) ? 'Toàn công ty' : viewer.role === 'area_admin' ? 'Các khu được giao' : 'Phòng của bạn';
  if (filter.kind === 'area') {
    scopeLabel = `Khu ${(db.prepare('SELECT name FROM areas WHERE id = ?').get(filter.areaId) as { name: string }).name}`;
  } else if (filter.kind === 'none') {
    scopeLabel = 'Chưa gán khu';
  }
  if (managerView && typeof q.department === 'string' && q.department) {
    const ds = departmentScopeSql(viewer);
    const dept = db.prepare(`SELECT d.name FROM departments d WHERE d.id = ? AND ${ds.sql}`).get(q.department, ...ds.params) as { name: string } | undefined;
    if (!dept) throw notFound('phòng ban');
    deptSql = 'u.department_id = ?';
    deptParams.push(q.department);
    scopeLabel = `Phòng ${dept.name}`;
  } else if (viewer.role === 'dept_manager' && viewer.departmentId) {
    const dept = db.prepare('SELECT name FROM departments WHERE id = ?').get(viewer.departmentId) as { name: string } | undefined;
    if (dept) scopeLabel = `Phòng ${dept.name}`;
  }
  const days = monthDays(db, month);
  const users = (
    db
      .prepare(
        `SELECT u.id, u.code, u.name, u.created_at, d.name AS department_name
         FROM users u LEFT JOIN departments d ON d.id = u.department_id
         WHERE ${NOT_SYSTEM_ADMIN} AND ${w.sql} AND ${f.sql} AND ${deptSql}
           AND (u.status = 'active' OR EXISTS (SELECT 1 FROM attendance_days a WHERE a.user_id = u.id AND a.work_date BETWEEN ? AND ?))
         ORDER BY d.name IS NULL, d.name, u.code`,
      )
      .all(...w.params, ...f.params, ...deptParams, days[0].date, days[days.length - 1].date) as {
      id: string; code: string; name: string; created_at: string; department_name: string | null;
    }[]
  ).map((u) => ({ id: u.id, code: u.code, name: u.name, departmentName: u.department_name, createdAt: u.created_at }));
  return { month, days, lock: lockOf(db, month), scopeLabel, rows: buildRows(db, users, month, now) };
}
```

- [ ] **Step 3: `server/routes/reports.ts` (JSON + "Của tôi"); Excel thêm ở Task 7**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { currentUser, requireRole } from '../middleware';
import { getUser, type Row } from '../repo';
import { SYSTEM_ADMIN_CODE } from '../bootstrap';
import { effectiveShift, isWorkday } from '../shifts';
import { lockOf } from '../month-lock';
import { buildMonthlyReport, buildRows, monthDays, parseMonthParam } from '../reports';
import { DAY_SELECT, mapDay } from './attendance';
import { toVnDate } from '../vntime';
import type { AttendanceDay, MyAttendance } from '../../shared/types';

const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function reportRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/reports/monthly', requireRole('hr', 'area_admin', 'dept_manager'), (req, res) => {
    const month = parseMonthParam(req.query.month, ctx.now());
    res.json(buildMonthlyReport(db, currentUser(req), { month, area: req.query.area, department: req.query.department }, ctx.now()));
  });

  r.get('/me/attendance', (req, res) => {
    const auth = currentUser(req);
    const month = parseMonthParam(req.query.month, ctx.now());
    const user = getUser(db, auth.id)!;
    if (user.code === SYSTEM_ADMIN_CODE) {
      const body: MyAttendance = { tracked: false, profile: null, today: null, report: null, lock: null, days: [] };
      return res.json(body);
    }
    const rule = effectiveShift(db, user.id);
    const days = monthDays(db, month);
    const records = new Map(
      (db.prepare(`${DAY_SELECT} WHERE a.user_id = ? AND a.work_date BETWEEN ? AND ?`).all(user.id, days[0].date, days[days.length - 1].date) as Row[])
        .map(mapDay)
        .map((d) => [d.workDate, d] as [string, AttendanceDay]),
    );
    const todayRow = db.prepare(`${DAY_SELECT} WHERE a.user_id = ? AND a.work_date = ?`).get(user.id, toVnDate(ctx.now())) as Row | undefined;
    const body: MyAttendance = {
      tracked: true,
      profile: {
        code: user.code,
        name: user.name,
        departmentName: user.departmentName,
        position: user.position,
        shift: { name: rule.name, workStart: hhmm(rule.workStart), workEnd: hhmm(rule.workEnd), workDays: rule.workDays },
      },
      today: todayRow ? mapDay(todayRow) : null,
      report: buildRows(db, [{ id: user.id, code: user.code, name: user.name, departmentName: user.departmentName, createdAt: user.createdAt }], month, ctx.now())[0],
      lock: lockOf(db, month),
      days: days.map((d) => ({ ...d, workday: isWorkday(db, rule, d.date), record: records.get(d.date) ?? null })),
    };
    res.json(body);
  });

  return r;
}
```

`server/app.ts`: `api.use(reportRoutes(ctx));`. `shared/types.ts`: thêm các kiểu ở mục Interfaces.

- [ ] **Step 4: Chạy test + toàn bộ, commit**

Run: `npx tsx --test tests/reports.test.ts && npm test && TZ=UTC npm test && npm run lint` — Expected: PASS.

```bash
git add server/reports.ts server/routes/reports.ts server/app.ts shared/types.ts tests/reports.test.ts
git commit -m "feat(reports): monthly timesheet (summary + grid symbols) and personal attendance API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Xuất Excel

**Files:**
- Create: `server/report-xlsx.ts`, `tests/report-xlsx.test.ts`
- Modify: `package.json`, `package-lock.json`, `server/routes/reports.ts`

**Interfaces:**
- Consumes: `MonthlyReport` (Task 6), `buildMonthlyReport`, `parseMonthParam`.
- Produces: `export async function monthlyReportXlsx(report: MonthlyReport, exportedBy: string, now: number): Promise<Buffer>`; route `GET /api/reports/monthly.xlsx`.

- [ ] **Step 1: Cài thư viện**

```bash
npm install --save-exact exceljs@4.4.0
npm pkg set overrides.uuid='^11.1.1'
npm install
npm audit   # phải "found 0 vulnerabilities"
```

- [ ] **Step 2: Test (fail)** — `tests/report-xlsx.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, addDetection, type TestApp, type Client } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';

const NOW = vnDateTimeToTs('2026-10-15', '18:00');

async function download(app: TestApp, c: Client, q: string): Promise<{ status: number; type: string | null; disp: string | null; wb: ExcelJS.Workbook | null }> {
  const res = await fetch(`${app.baseUrl}/api/reports/monthly.xlsx?${q}`, { headers: { Cookie: c.cookie } });
  if (res.status !== 200) return { status: res.status, type: null, disp: null, wb: null };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  return { status: res.status, type: res.headers.get('content-type'), disp: res.headers.get('content-disposition'), wb };
}

test('Excel 2 sheet, tiêu đề, số liệu khớp JSON, phòng rỗng vẫn ra file, khóa sổ có dòng ghi chú', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    const a1 = seedArea(app.db, 'KV1', 'Trụ sở');
    const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
    const empty = seedDepartment(app.db, 'PB9', 'Phòng rỗng', a1);
    seedUser(app.db, { code: 'HR01', name: 'Trần HR', role: 'hr' });
    const nv = seedUser(app.db, { code: 'NV01', name: 'Nguyễn Văn Ấn', departmentId: d1 });
    app.db.prepare("UPDATE users SET created_at = '2026-10-01'").run();
    addDetection(app.db, nv, vnDateTimeToTs('2026-10-01', '08:20'));
    const hr = await loginAs(app, 'HR01');
    await hr.post('/api/month-locks/2026-10');

    const json = (await hr.get('/api/reports/monthly?month=2026-10')).body;
    const x = await download(app, hr, 'month=2026-10');
    assert.equal(x.status, 200);
    assert.match(x.type ?? '', /spreadsheetml/);
    assert.match(x.disp ?? '', /Bang_cong_2026-10\.xlsx/);
    assert.deepEqual(x.wb!.worksheets.map((s) => s.name), ['Tổng hợp', 'Chấm công']);
    const sum = x.wb!.getWorksheet('Tổng hợp')!;
    assert.equal(sum.getCell('A1').value, 'CÔNG TY TNHH MTV PETROLIMEX HÀ NỘI');
    assert.equal(sum.getCell('A2').value, 'BẢNG TỔNG HỢP CÔNG THÁNG 10/2026');
    assert.match(String(sum.getCell('A3').value), /Toàn công ty · Xuất lúc 15\/10\/2026 18:00 bởi Trần HR \(HR01\)/);
    assert.match(String(sum.getCell('A4').value), /Đã khóa sổ ngày 15\/10\/2026 bởi Trần HR \(HR01\)/);
    // Dòng tiêu đề bảng ở dòng 6, dữ liệu từ dòng 7
    const header = (sum.getRow(6).values as unknown[]).slice(1);
    assert.deepEqual(header.slice(0, 6), ['STT', 'Mã NV', 'Họ tên', 'Phòng ban', 'Ngày phải làm', 'Ngày công']);
    const nvRow = (sum.getRow(7).values as unknown[]).slice(1);
    const j = json.rows.find((r: any) => r.employeeCode === 'NV01');
    assert.deepEqual(nvRow.slice(1, 15), ['NV01', 'Nguyễn Văn Ấn', 'Kế toán', j.requiredDays, j.workDays, j.lateCount, j.lateMinutes, j.earlyCount, j.earlyMinutes, j.missingOutDays, j.absentDays, j.leaveDays, j.businessTripDays, j.attendanceRate]);
    const grid = x.wb!.getWorksheet('Chấm công')!;
    assert.equal(grid.getCell('A2').value, 'BẢNG CHẤM CÔNG THÁNG 10/2026');
    // Cột ngày bắt đầu từ cột E; dòng 6 = số ngày, dòng 7 = thứ, dữ liệu từ dòng 8
    assert.equal(grid.getRow(6).getCell(5).value, 1);
    assert.equal(grid.getRow(7).getCell(5).value, 'T5');
    const gRow = grid.getRow(8);
    assert.equal(gRow.getCell(3).value, 'Nguyễn Văn Ấn');
    assert.equal(gRow.getCell(5).value, j.cells[0]);
    assert.ok(sum.views[0] && (sum.views[0] as any).state === 'frozen');

    const none = await download(app, hr, `month=2026-10&department=${empty}`);
    assert.equal(none.status, 200);
    assert.equal(none.wb!.getWorksheet('Tổng hợp')!.getCell('A3').value?.toString().startsWith('Phòng Phòng rỗng'), true);
    assert.equal((await download(app, await loginAs(app, 'NV01'), 'month=2026-10')).status, 403);
  } finally {
    await app.close();
  }
});
```

Run: `npx tsx --test tests/report-xlsx.test.ts` — Expected: FAIL (404).

- [ ] **Step 3: `server/report-xlsx.ts`**

```ts
import ExcelJS from 'exceljs';
import { monthLabel } from './month-lock';
import type { MonthlyReport } from '../shared/types';

const NAVY = 'FF003865';
const ORANGE = 'FFEA580C';
const GREY = 'FFF1F5F9';
/** Màu ô ký hiệu, khớp DAY_STATUS_STYLE trên web. */
const SYMBOL_FILL: Record<string, string> = {
  X: 'FFD1FAE5', M: 'FFFEF3C7', S: 'FFFEF3C7', MS: 'FFFFE4E6', V: 'FFFFE4E6', T: 'FFE2E8F0', P: 'FFEDE9FE', CT: 'FFE0F2FE', L: 'FFE2E8F0',
};
const WEEKDAY = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const pad = (n: number) => String(n).padStart(2, '0');
/** dd/mm/yyyy HH:MM theo giờ Việt Nam. */
function vnStamp(ms: number): string {
  const d = new Date(ms + 7 * 3_600_000);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function header(ws: ExcelJS.Worksheet, title: string, report: MonthlyReport, exportedBy: string, now: number): void {
  ws.getCell('A1').value = 'CÔNG TY TNHH MTV PETROLIMEX HÀ NỘI';
  ws.getCell('A1').font = { bold: true };
  ws.getCell('A2').value = `${title} THÁNG ${monthLabel(report.month)}`;
  ws.getCell('A2').font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.getCell('A3').value = `${report.scopeLabel} · Xuất lúc ${vnStamp(now)} bởi ${exportedBy}`;
  if (report.lock) ws.getCell('A4').value = `Đã khóa sổ ngày ${vnStamp(Date.parse(report.lock.lockedAt)).slice(0, 10)} bởi ${report.lock.lockedByName}`;
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}

function pageSetup(ws: ExcelJS.Worksheet): void {
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

export async function monthlyReportXlsx(report: MonthlyReport, exportedBy: string, now: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Petrolimex Attendance';

  const sum = wb.addWorksheet('Tổng hợp');
  header(sum, 'BẢNG TỔNG HỢP CÔNG', report, exportedBy, now);
  const sumHead = sum.getRow(6);
  sumHead.values = ['STT', 'Mã NV', 'Họ tên', 'Phòng ban', 'Ngày phải làm', 'Ngày công', 'Đi muộn (lần)', 'Đi muộn (phút)', 'Về sớm (lần)', 'Về sớm (phút)', 'Thiếu giờ ra', 'Vắng', 'Nghỉ phép', 'Công tác', 'Tỷ lệ chuyên cần (%)'];
  styleHeaderRow(sumHead);
  report.rows.forEach((r, i) => {
    sum.getRow(7 + i).values = [i + 1, r.employeeCode, r.employeeName, r.departmentName ?? '', r.requiredDays, r.workDays, r.lateCount, r.lateMinutes, r.earlyCount, r.earlyMinutes, r.missingOutDays, r.absentDays, r.leaveDays, r.businessTripDays, r.attendanceRate];
  });
  sum.columns.forEach((col, i) => (col.width = i === 2 ? 28 : i === 3 ? 20 : 12));
  sum.views = [{ state: 'frozen', xSplit: 3, ySplit: 6 }];
  pageSetup(sum);

  const grid = wb.addWorksheet('Chấm công');
  header(grid, 'BẢNG CHẤM CÔNG', report, exportedBy, now);
  const n = report.days.length;
  const totals = ['Ngày công', 'Muộn', 'Về sớm', 'Vắng', 'Phép', 'Công tác'];
  grid.getRow(6).values = ['STT', 'Mã NV', 'Họ tên', 'Phòng ban', ...report.days.map((_, i) => i + 1), ...totals];
  grid.getRow(7).values = ['', '', '', '', ...report.days.map((d) => WEEKDAY[d.weekday]), ...totals.map(() => '')];
  styleHeaderRow(grid.getRow(6));
  styleHeaderRow(grid.getRow(7));
  report.rows.forEach((r, i) => {
    const row = grid.getRow(8 + i);
    row.values = [i + 1, r.employeeCode, r.employeeName, r.departmentName ?? '', ...r.cells.map((c) => c ?? ''), r.workDays, r.lateCount, r.earlyCount, r.absentDays, r.leaveDays, r.businessTripDays];
    r.cells.forEach((c, k) => {
      const cell = row.getCell(5 + k);
      cell.alignment = { horizontal: 'center' };
      const fill = c ? SYMBOL_FILL[c.replace('*', '')] : null;
      const day = report.days[k];
      const argb = fill ?? (day.weekday >= 6 || day.holiday ? GREY : null);
      if (argb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    });
  });
  grid.getColumn(3).width = 26;
  grid.getColumn(4).width = 18;
  for (let k = 0; k < n; k++) grid.getColumn(5 + k).width = 4.5;
  grid.views = [{ state: 'frozen', xSplit: 3, ySplit: 7 }];
  const legendAt = 8 + report.rows.length + 1;
  grid.getCell(`A${legendAt}`).value =
    'Ký hiệu: X = đủ công, M = đi muộn, S = về sớm, MS = muộn và về sớm, T = thiếu giờ ra, CT = công tác, P = nghỉ phép, V = vắng, L = ngày lễ; * = đã điều chỉnh';
  pageSetup(grid);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

Lưu ý dòng 4 khóa sổ trong test mong "ngày 15/10/2026": `vnStamp(...).slice(0, 10)` cho `dd/mm/yyyy`.

- [ ] **Step 4: Route trong `server/routes/reports.ts`**

```ts
  r.get(
    '/reports/monthly.xlsx',
    requireRole('hr', 'area_admin', 'dept_manager'),
    ah(async (req, res) => {
      const viewer = currentUser(req);
      const month = parseMonthParam(req.query.month, ctx.now());
      const report = buildMonthlyReport(db, viewer, { month, area: req.query.area, department: req.query.department }, ctx.now());
      const buf = await monthlyReportXlsx(report, personLabel(viewer.name, viewer.code), ctx.now());
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Bang_cong_${month}.xlsx"`);
      res.send(buf);
    }),
  );
```

Đặt route này **trước** `r.get('/reports/monthly', ...)` cho rõ ràng. Import `ah` từ `../errors`, `personLabel` từ `../audit`, `monthlyReportXlsx` từ `../report-xlsx`.

- [ ] **Step 5: Chạy test + toàn bộ, build server, commit**

Run: `npx tsx --test tests/report-xlsx.test.ts && npm test && TZ=UTC npm test && npm run lint && npm run build:server && npm audit`
Expected: PASS; audit 0 lỗ hổng.

```bash
git add package.json package-lock.json server/report-xlsx.ts server/routes/reports.ts tests/report-xlsx.test.ts
git commit -m "feat(reports): Excel export with summary and attendance grid sheets (exceljs, uuid pinned for audit)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Giao diện — hộp chi tiết ngày dùng chung và hộp điều chỉnh

**Files:**
- Create: `src/components/DayDetailModal.tsx`, `src/components/AdjustDayModal.tsx`, `src/components/OverrideBadge.tsx`
- Modify: `src/components/AttendanceTable.tsx`, `src/format.ts`

**Interfaces:**
- Consumes: `AttendanceDay.override`, `PUT/DELETE /api/attendance/:userId/:date/adjustment` (Task 4).
- Produces:
  ```tsx
  export const DayDetailModal: React.FC<{ userId: string; userName: string; date: string; day: AttendanceDay | null;
    currentUser: User; locked: boolean; onClose: () => void; onChanged: (day: AttendanceDay | null) => void }>;
  export const OverrideBadge: React.FC<{ override: DayOverride }>;
  // src/format.ts
  export const OVERRIDE_KIND_LABEL: Record<DayOverride['kind'], string>;
  export function canAdjust(viewer: User, targetUserId: string): boolean; // hr | area_admin và không phải chính mình
  ```

Frontend không có test tự động: kiểm tra bằng `npm run lint`, `npm run build` và thử trên trình duyệt (Step 5).

- [ ] **Step 1: `src/format.ts` — thêm**

```ts
export const OVERRIDE_KIND_LABEL: Record<DayOverride['kind'], string> = { times: 'Sửa giờ', leave: 'Nghỉ phép', business_trip: 'Công tác' };

/** HR toàn hệ thống và quản trị khu điều chỉnh được ngày công của người khác (server kiểm tra phạm vi). */
export function canAdjust(viewer: User, targetUserId: string): boolean {
  return (viewer.role === 'hr' || viewer.role === 'area_admin') && viewer.id !== targetUserId;
}
```

(Import `DayOverride`, `User` từ `./types`.)

- [ ] **Step 2: `src/components/OverrideBadge.tsx`**

```tsx
import React from 'react';
import type { DayOverride } from '../types';
import { fmtDateTime, OVERRIDE_KIND_LABEL } from '../format';

export const OverrideBadge: React.FC<{ override: DayOverride }> = ({ override }) => (
  <span
    className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 whitespace-nowrap"
    title={`${OVERRIDE_KIND_LABEL[override.kind]} bởi ${override.byName} lúc ${fmtDateTime(override.at)}: ${override.reason}`}
  >
    Đã điều chỉnh
  </span>
);
```

- [ ] **Step 3: `src/components/AdjustDayModal.tsx`**

```tsx
import React, { useState } from 'react';
import type { AttendanceDay } from '../types';
import { api, errorMessage } from '../api';
import { fmtTime } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

type Kind = 'times' | 'leave' | 'business_trip';

export const AdjustDayModal: React.FC<{
  userId: string;
  userName: string;
  date: string;
  day: AttendanceDay | null;
  onClose: () => void;
  onSaved: (day: AttendanceDay | null) => void;
}> = ({ userId, userName, date, day, onClose, onSaved }) => {
  const [kind, setKind] = useState<Kind>(day?.override?.kind ?? 'times');
  const [firstIn, setFirstIn] = useState('');
  const [lastOut, setLastOut] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = kind === 'times' ? { kind, firstIn: firstIn || null, lastOut: lastOut || null, reason } : { kind, reason };
      const r = await api<{ day: AttendanceDay | null }>(`/api/attendance/${userId}/${date}/adjustment`, { method: 'PUT', body });
      onSaved(r.day);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Điều chỉnh ngày công · ${userName} · ${date.split('-').reverse().join('/')}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3.5">
        <Field label="Kiểu điều chỉnh">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="times">Sửa giờ vào / giờ ra</option>
            <option value="leave">Chuyển thành Nghỉ phép</option>
            <option value="business_trip">Chuyển thành Công tác</option>
          </select>
        </Field>
        {kind === 'times' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giờ vào" hint={`Để trống = giữ ${fmtTime(day?.firstIn ?? null)}`}>
              <input type="time" className={inputCls} value={firstIn} onChange={(e) => setFirstIn(e.target.value)} />
            </Field>
            <Field label="Giờ ra" hint={`Để trống = giữ ${fmtTime(day?.lastOut ?? null)}`}>
              <input type="time" className={inputCls} value={lastOut} onChange={(e) => setLastOut(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Lý do (bắt buộc)" hint={`${trimmed.length}/500 ký tự, tối thiểu 5`}>
          <textarea rows={3} maxLength={500} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
        {error && <p className="text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${secondaryBtn} flex-1`}>
            Hủy
          </button>
          <button type="submit" disabled={busy || trimmed.length < 5 || (kind === 'times' && !firstIn && !lastOut)} className={`${primaryBtn} flex-1`}>
            Lưu điều chỉnh
          </button>
        </div>
      </form>
    </Modal>
  );
};
```

- [ ] **Step 4: `src/components/DayDetailModal.tsx` — chuyển hộp chi tiết từ `AttendanceTable.tsx` sang đây**

Di chuyển nguyên phần hộp chi tiết (lưới ảnh, nhãn nguồn, nút "Xem video lúc này", `VideoModal`, `SOURCE_LABEL`) từ `AttendanceTable.tsx` vào component mới; nó tự tải lượt quẹt bằng `/api/attendance/${userId}/${date}/detections`. Thêm phía trên lưới ảnh:

```tsx
      {day?.override && (
        <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 text-sm">
          <div className="font-semibold text-brand-800">Đã điều chỉnh: {OVERRIDE_KIND_LABEL[day.override.kind]}</div>
          <div className="text-slate-700 mt-0.5">{day.override.reason}</div>
          <div className="text-xs text-slate-500 mt-1">bởi {day.override.byName} lúc {fmtDateTime(day.override.at)}</div>
        </div>
      )}
      {canAdjust(currentUser, userId) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {locked ? (
            <span className="text-xs text-slate-500">Tháng này đã khóa sổ — không điều chỉnh được.</span>
          ) : (
            <>
              <button type="button" className={`${secondaryBtn} py-1.5`} onClick={() => setAdjusting(true)}>
                Điều chỉnh
              </button>
              {day?.override && (
                <button type="button" className={`${secondaryBtn} py-1.5 text-rose-600`} onClick={() => setRemoving(true)}>
                  Bỏ điều chỉnh
                </button>
              )}
            </>
          )}
        </div>
      )}
```

"Bỏ điều chỉnh" mở một `Modal` nhỏ có ô lý do (5–500 ký tự) và gọi `api(\`/api/attendance/${userId}/${date}/adjustment\`, { method: 'DELETE', body: { reason } })`; lỗi hiện trong hộp. Sau khi lưu / bỏ: gọi `onChanged(newDay)` và cập nhật `day` hiển thị trong hộp. `AdjustDayModal` mở chồng lên `DayDetailModal`.

`AttendanceTable.tsx`: thay phần hộp cũ bằng `<DayDetailModal userId={detail.userId} userName={detail.employeeName} date={detail.workDate} day={detail} currentUser={currentUser} locked={false} onClose={...} onChanged={() => onRefresh?.()} />` — thêm prop `onRefresh: () => void` vào `AttendanceTable` và truyền `fetchData` từ `App.tsx`. `locked` = `false` ở bảng công (server vẫn trả 423 và hộp hiện lỗi). Thêm `{r.override && <OverrideBadge override={r.override} />}` dưới nhãn trạng thái trong bảng.

- [ ] **Step 5: Kiểm tra**

Run: `npm run lint && npm run build` — Expected: sạch. Chạy thử: `rm -rf data && PORT=3999 npx tsx server/index.ts`, đăng nhập `ADMIN` / mật khẩu mặc định của dự án trên `http://localhost:3999`, mô phỏng một lượt quẹt muộn, mở chi tiết, điều chỉnh giờ vào, thấy nhãn "Đã điều chỉnh", bỏ điều chỉnh. Tắt server, `rm -rf data`.

- [ ] **Step 6: Commit**

```bash
git add src/components/DayDetailModal.tsx src/components/AdjustDayModal.tsx src/components/OverrideBadge.tsx src/components/AttendanceTable.tsx src/format.ts src/App.tsx
git commit -m "feat(ui): shared day detail modal with attendance override and removal, 'Đã điều chỉnh' badge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Giao diện — tab "Báo cáo tháng"

**Files:**
- Create: `src/components/MonthlyReportTab.tsx`
- Modify: `src/App.tsx` (`TABS_BY_ROLE`, render), `src/components/Navbar.tsx` (tab), `src/format.ts` (`SYMBOL_STYLE`)

**Interfaces:**
- Consumes: `GET /api/reports/monthly`, `GET /api/reports/monthly.xlsx`, `POST/DELETE /api/month-locks/:month` (Task 3, 6, 7); `DayDetailModal` (Task 8).
- Produces: tab id `'report'`, nhãn "Báo cáo tháng", icon `FileSpreadsheet` (lucide), hiện cho `hr`, `area_admin`, `dept_manager`.

- [ ] **Step 1: `src/format.ts`**

```ts
/** Màu ô lưới chấm công, khớp DAY_STATUS_STYLE và file Excel. */
export const SYMBOL_STYLE: Record<string, string> = {
  X: 'bg-emerald-50 text-emerald-700',
  M: 'bg-amber-50 text-amber-800',
  S: 'bg-amber-50 text-amber-800',
  MS: 'bg-rose-50 text-rose-700',
  V: 'bg-rose-50 text-rose-700',
  T: 'bg-slate-100 text-slate-700',
  P: 'bg-violet-50 text-violet-700',
  CT: 'bg-sky-50 text-sky-700',
  L: 'bg-slate-100 text-slate-500',
};
export const WEEKDAY_SHORT = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const thisMonth = (): string => vnToday().slice(0, 7);
```

- [ ] **Step 2: `src/components/MonthlyReportTab.tsx`**

Bố cục (theo §11 spec), dùng các lớp chung (`bg-white rounded-2xl ... border-l-4 border-l-brand-500 shadow-card` cho khung tiêu đề, `inputCls`, `primaryBtn`, `secondaryBtn`):

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Lock, LockOpen } from 'lucide-react';
import type { AttendanceDay, Department, MeResponse, MonthlyReport } from '../types';
import { api, errorMessage } from '../api';
import { SYMBOL_STYLE, WEEKDAY_SHORT, fmtDateTime, thisMonth } from '../format';
import { ConfirmDeleteDialog, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';
import { DayDetailModal } from './DayDetailModal';

export const MonthlyReportTab: React.FC<{ me: MeResponse; departments: Department[]; area: string }> = ({ me, departments, area }) => {
  const user = me.user;
  const [month, setMonth] = useState(thisMonth());
  const [department, setDepartment] = useState('');
  const [view, setView] = useState<'summary' | 'grid'>('summary');
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cell, setCell] = useState<{ userId: string; name: string; date: string; day: AttendanceDay | null } | null>(null);
  const [confirm, setConfirm] = useState<'lock' | 'unlock' | null>(null);

  const query = new URLSearchParams({ month, ...(area !== 'all' ? { area } : {}), ...(department ? { department } : {}) }).toString();
  const load = useCallback(async () => {
    try {
      setReport(await api<MonthlyReport>(`/api/reports/monthly?${query}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [query]);
  useEffect(() => {
    load();
  }, [load]);

  const openCell = async (userId: string, name: string, date: string) => {
    // Lấy dữ liệu ngày từ bảng công của ngày đó (đã có override)
    const r = await api<{ records: AttendanceDay[] }>(`/api/attendance?date=${date}`);
    setCell({ userId, name, date, day: r.records.find((x) => x.userId === userId) ?? null });
  };

  // ... render: khung tiêu đề (chọn tháng <input type="month">, chọn phòng nếu hr/area_admin,
  //     nút "Xuất Excel" = <a href={`/api/reports/monthly.xlsx?${query}`} className={primaryBtn}>,
  //     trạng thái khóa sổ + nút Khóa/Mở khóa nếu user.role === 'hr'),
  //     thanh vàng "Tháng MM/YYYY đã khóa sổ ngày … bởi …" khi report.lock,
  //     chuyển chế độ "Tổng hợp" / "Lưới chấm công",
  //     bảng tổng hợp (cột như sheet Tổng hợp), hoặc lưới (cột họ tên sticky left-0 bg-white, ô 1..31 có SYMBOL_STYLE,
  //     cột thứ 7/CN/lễ nền slate-50, bấm ô ⇒ openCell), chú thích ký hiệu dưới lưới.
};
```

Viết đầy đủ phần render theo comment trên (không để lại comment "..."). Hộp xác nhận khóa: dùng `Modal` với nút `primaryBtn` "Khóa sổ" gọi `api(\`/api/month-locks/${month}\`, { method: 'POST' })`, mở khóa gọi `DELETE`; lỗi hiện trong hộp; xong thì `load()`. `DayDetailModal` nhận `locked={Boolean(report?.lock)}` và `onChanged={() => load()}`.

- [ ] **Step 3: Nối tab**

`src/App.tsx` — `TABS_BY_ROLE`: thêm `'report'` sau `'attendance'` cho `hr`, `area_admin`, `dept_manager`; render `{tab === 'report' && <MonthlyReportTab me={me} departments={departments} area={activeArea} />}`.
`src/components/Navbar.tsx` — thêm `{ id: 'report', label: 'Báo cáo tháng', icon: FileSpreadsheet, visible: currentUser.role !== 'employee' }` ngay sau tab `attendance`.

- [ ] **Step 4: Kiểm tra và commit**

Run: `npm run lint && npm run build` — sạch. Thử trên trình duyệt (như Task 8 Step 5): xem tổng hợp, lưới, bấm ô, xuất Excel (file tải về mở được), khóa / mở khóa.

```bash
git add src/components/MonthlyReportTab.tsx src/App.tsx src/components/Navbar.tsx src/format.ts
git commit -m "feat(ui): monthly report tab — summary and grid views, Excel export, month lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Giao diện — tab "Của tôi" và form đơn dùng chung

**Files:**
- Create: `src/components/RequestFormModal.tsx`, `src/components/MyAttendanceTab.tsx`
- Modify: `src/components/RequestsTab.tsx`, `src/App.tsx`, `src/components/Navbar.tsx`

**Interfaces:**
- Consumes: `GET /api/me/attendance` (Task 6); `DayDetailModal`, `OverrideBadge` (Task 8); `SYMBOL_STYLE`, `WEEKDAY_SHORT`, `thisMonth` (Task 9).
- Produces:
  ```tsx
  export const RequestFormModal: React.FC<{ initial?: { type: RequestType; workDate: string }; onClose: () => void; onSaved: () => void }>;
  ```
  Tab id `'mine'`, nhãn "Của tôi", icon `UserRound`; có cho mọi vai trò; nhân viên **không** còn tab `'attendance'`.

- [ ] **Step 1: Tách form đơn**

Chuyển toàn bộ state + `submit` + JSX của form trong `RequestsTab.tsx` (các ô loại đơn, ngày, đến ngày, giờ đề xuất, lý do, lỗi, nút) sang `RequestFormModal.tsx`, nhận `initial` để đặt sẵn `type` và `workDate`. `RequestsTab` chỉ còn `showAdd` và render `<RequestFormModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); onRefresh(); }} />`. Hành vi gửi đơn không đổi.

- [ ] **Step 2: `src/components/MyAttendanceTab.tsx`**

Tải `api<MyAttendance>(\`/api/me/attendance?month=${month}\`)`. Bố cục (§11 spec):
- `tracked === false` ⇒ khung trắng "Tài khoản quản trị hệ thống không chấm công."
- Hàng thẻ: **Thông tin** (tên, mã, phòng, chức danh, ca `name workStart–workEnd · formatWorkDays(workDays)`), **Hôm nay** (giờ vào, "Lần quẹt gần nhất"/giờ ra theo `today.final`, nhãn trạng thái `DAY_STATUS_STYLE`, hoặc "Chưa có dữ liệu hôm nay").
- Chọn tháng `<input type="month">` + 5 số từ `report`: Ngày công, Đi muộn (`lateCount` lần · `lateMinutes` phút), Về sớm (`earlyCount` lần), Vắng, Nghỉ phép.
- Thanh "Tháng … đã khóa sổ" khi `lock`.
- Bảng ngày: cột "Ngày" (`dd/mm` + `WEEKDAY_SHORT`), "Giờ vào", "Giờ ra" (chưa chốt ⇒ "Lần quẹt gần nhất HH:MM"), "Trạng thái" (nhãn màu + `OverrideBadge`), "" (nút "Nộp đơn" khi trạng thái thuộc `late`, `early_leave`, `late_and_early`, `absent`, hoặc `missing_out` đã chốt). Dòng `!workday && !record` mờ (`text-slate-400`), ghi tên ngày lễ nếu có. Bấm dòng có `record` ⇒ `DayDetailModal` (`currentUser = me.user`, `locked = Boolean(lock)`).
- Nút "Nộp đơn": `late` / `late_and_early` ⇒ `late_explanation`; `missing_out` ⇒ `missed_punch`; `absent` / `early_leave` ⇒ `leave_request`. Mở `RequestFormModal` với `initial`; xong thì tải lại.

- [ ] **Step 3: Nối tab và trang mặc định**

`src/App.tsx`:
```ts
const TABS_BY_ROLE: Record<User['role'], string[]> = {
  hr: ['mine', 'attendance', 'report', 'requests', 'cameras', 'departments', 'shifts', 'employees', 'areas', 'audit', 'hanet_config'],
  area_admin: ['mine', 'attendance', 'report', 'requests', 'cameras', 'departments', 'shifts', 'employees', 'audit'],
  dept_manager: ['mine', 'attendance', 'report', 'requests', 'cameras', 'departments'],
  employee: ['mine', 'requests'],
};
```
(`'audit'` được nối ở Task 11; thêm sẵn ở đây, Task 11 tạo component.) Trang mặc định: `const fallback = currentUser.role === 'employee' ? 'mine' : 'attendance';` và `const tab = TABS_BY_ROLE[currentUser.role].includes(activeTab) ? activeTab : fallback;`. Khi đăng xuất vẫn `setActiveTab('attendance')` (fallback lo phần nhân viên). Render `{tab === 'mine' && <MyAttendanceTab me={me} />}`. `StatsCards` không hiện ở tab `'mine'` với vai trò nhân viên (bọc điều kiện `!(tab === 'mine' && currentUser.role === 'employee')`).

`src/components/Navbar.tsx`: thêm `{ id: 'mine', label: 'Của tôi', icon: UserRound, visible: true }` đứng đầu; tab `attendance` đổi `visible: currentUser.role !== 'employee'`.

- [ ] **Step 4: Kiểm tra và commit**

Run: `npm run lint && npm run build`. Thử: đăng nhập nhân viên ⇒ mở thẳng "Của tôi"; HR ⇒ "Bảng công" và có tab "Của tôi"; nộp đơn từ một ngày muộn có điền sẵn ngày.

```bash
git add src/components/RequestFormModal.tsx src/components/MyAttendanceTab.tsx src/components/RequestsTab.tsx src/App.tsx src/components/Navbar.tsx
git commit -m "feat(ui): 'Của tôi' personal attendance tab for every role, default for employees; shared request form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Giao diện — tab "Nhật ký"

**Files:**
- Create: `src/components/AuditLogTab.tsx`
- Modify: `src/App.tsx` (render), `src/components/Navbar.tsx` (tab), `src/format.ts` (`AUDIT_ACTION_LABEL`)

**Interfaces:**
- Consumes: `GET /api/audit` (Task 2) → `{ entries: AuditLogEntry[]; total: number; page: number; pageSize: number }`.
- Produces: tab id `'audit'`, nhãn "Nhật ký", icon `ScrollText`, cho `hr` và `area_admin`, đặt trước "Cấu hình".

- [ ] **Step 1: `src/format.ts`**

```ts
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'attendance.override': 'Điều chỉnh ngày công',
  'attendance.override_remove': 'Bỏ điều chỉnh ngày công',
  'request.approve': 'Duyệt đơn',
  'request.reject': 'Từ chối đơn',
  'user.role': 'Đổi vai trò',
  'user.areas': 'Đổi khu được giao',
  'user.status': 'Đổi trạng thái tài khoản',
  'user.delete': 'Xóa tài khoản',
  'shift.create': 'Thêm ca',
  'shift.update': 'Sửa ca',
  'shift.delete': 'Xóa ca',
  'shift.assign': 'Gán ca',
  'settings.work': 'Sửa ca mặc định / ngưỡng',
  'holiday.add': 'Thêm ngày lễ',
  'holiday.remove': 'Xóa ngày lễ',
  'month.lock': 'Khóa sổ tháng',
  'month.unlock': 'Mở khóa sổ tháng',
  'auth.login': 'Đăng nhập',
  'auth.login_failed': 'Đăng nhập thất bại',
};
```

- [ ] **Step 2: `src/components/AuditLogTab.tsx`**

- Bộ lọc: "Từ ngày" (mặc định 29 ngày trước `vnToday()`), "Đến ngày" (mặc định hôm nay), "Loại" (`<select>` gồm "Tất cả" + mọi khóa của `AUDIT_ACTION_LABEL`), ô tìm "Tên hoặc mã"; đổi bộ lọc ⇒ về trang 1.
- Bảng: Thời gian (`fmtDateTime(at)`), Người làm (`actorLabel`, dưới là `ip` chữ nhỏ), Hành động (`AUDIT_ACTION_LABEL[action] ?? action`), Đối tượng (`targetLabel` + `workDate` dạng dd/mm/yyyy nếu có), Thay đổi (rút gọn `JSON.stringify(before)` → `JSON.stringify(after)` tối đa 80 ký tự; bấm "Xem" mở `Modal` hiện cả hai dạng `<pre>` thụt lề), Lý do.
- Dòng `auth.login_failed` chữ đỏ nhạt (`text-rose-700`).
- Phân trang: "Trang X / Y" + nút "Trước" / "Sau" (`secondaryBtn`), tắt nút khi hết.
- Lỗi tải hiện khung đỏ như các tab khác.

- [ ] **Step 3: Nối tab**

`src/App.tsx`: `{tab === 'audit' && <AuditLogTab />}` (đã có `'audit'` trong `TABS_BY_ROLE` từ Task 10). `Navbar.tsx`: `{ id: 'audit', label: 'Nhật ký', icon: ScrollText, visible: isManager }` ngay trước `hanet_config`.

- [ ] **Step 4: Kiểm tra và commit**

Run: `npm run lint && npm run build`. Thử: sau vài thao tác (điều chỉnh, khóa sổ, đăng nhập sai), tab "Nhật ký" hiện đúng, lọc và phân trang chạy.

```bash
git add src/components/AuditLogTab.tsx src/App.tsx src/components/Navbar.tsx src/format.ts
git commit -m "feat(ui): audit log tab with filters, change details and paging

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Kiểm tra toàn bộ và build sản phẩm

**Files:**
- Modify: `dist/`, `server.js` (build)

- [ ] **Step 1: Kiểm tra đầy đủ**

```bash
npm test
TZ=UTC npm test
npm run lint
npm audit            # 0 vulnerabilities
npm run build
```
Expected: tất cả sạch.

- [ ] **Step 2: Chạy thử nâng cấp trên DB v4 thật (bản sao)**

```bash
TMP=$(mktemp -d) && sqlite3 "$TMP/a.db" < tests/fixtures/schema-v4.sql 2>/dev/null || node -e "const {DatabaseSync}=require('node:sqlite');const fs=require('fs');const d=new DatabaseSync(process.argv[1]);d.exec(fs.readFileSync('tests/fixtures/schema-v4.sql','utf8'));d.exec('INSERT INTO schema_version(version) VALUES (4)');d.close()" "$TMP/a.db"
MIGRATE_ONLY=1 DB_FILE="$TMP/a.db" NODE_ENV=production node server.js
```
Expected: `[MIGRATE] Chạy thử xong: database v5` (nếu dùng nhánh `sqlite3`, chèn thêm `INSERT INTO schema_version(version) VALUES (4);` trước khi chạy).

- [ ] **Step 3: Commit build**

```bash
git add -A dist server.js
git commit -m "chore(build): rebuild production bundle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
