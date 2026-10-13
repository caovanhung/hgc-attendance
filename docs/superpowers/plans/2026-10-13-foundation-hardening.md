# Gia cố nền tảng hệ thống điểm danh Hanet — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay server JSON không xác thực bằng server có đăng nhập thật, phân quyền, SQLite, webhook Hanet có token, đối soát, sao lưu, và tính công theo giờ Việt Nam.

**Architecture:** Tách `server.ts` thành các module trong `server/` (DB, auth, tính công, Hanet, sao lưu, lịch chạy, routes). `createApp(ctx)` nhận một `AppContext` (DB, cấu hình, `fetch`, `now`) để test tích hợp chạy với SQLite `:memory:`. Frontend React thêm màn đăng nhập/đổi mật khẩu và chuyển sang dữ liệu "mỗi người một dòng mỗi ngày".

**Tech Stack:** Node ≥ 22.13 (`node:sqlite`), Express 4, React 19 + Vite, esbuild (đóng gói `server.js`), `node:test` qua `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-13-foundation-hardening-design.md`

## Global Constraints

- Node ≥ 22.13. `node:sqlite` được nạp bằng `createRequire` trong `server/db.ts` để `server/check-node.ts` báo lỗi rõ ràng trên Node cũ.
- Không thêm dependency mới. Runtime chỉ có `express`, `dotenv`; dev dùng `tsx`, `esbuild`, `typescript` đã có.
- Mọi thông báo lỗi trả cho người dùng bằng tiếng Việt, dạng `{ error, code? }`.
- Giờ Việt Nam = UTC+7 cố định (Việt Nam không có giờ mùa hè). Mọi tính toán ngày/giờ công đi qua `server/vntime.ts`, không dùng `getHours()`/`toISOString().split('T')[0]` cho ngày công.
- Cổng mặc định 3001.
- Cookie phiên: tên `sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` khi production, hạn 7 ngày. DB chỉ lưu `sha256(token)`.
- Mật khẩu: scrypt N=16384, r=8, p=1, salt 16 byte, khóa 64 byte, lưu `scrypt$<salt hex>$<hash hex>`. Mật khẩu mới ≥ 8 ký tự. Mật khẩu tạm 10 ký tự.
- Giới hạn đăng nhập: 5 lần sai / 15 phút theo `code|ip` → 429.
- Giờ làm mặc định: vào 08:00, cho muộn 15 phút, ra 17:00, ngưỡng giờ ra 30 phút.
- `webhook_logs` giữ 500 dòng; sao lưu giữ 30 bản hằng ngày + 30 bản khác.
- Sai mật khẩu khi xác nhận thao tác (đổi mật khẩu, xóa dữ liệu) trả **400**, để **403** chỉ mang nghĩa "không có quyền".
- Sau mỗi task server: `npm test` và `npm run lint` phải pass.

## Review Focus

1. **Hanet gửi webhook dạng `application/x-www-form-urlencoded`, các số là chuỗi** (`"time":"1791768600000"`, `"personType":"0"`, `"placeID":"143"`) → vẫn ghi nhận đúng. Test ở Task 9.
2. **Trường `time` tính bằng giây thay vì mili-giây** → nhân 1000, không ghi ra năm 1970. Test ở Task 9.
3. **`aliasID` khác hoa/thường hoặc có khoảng trắng** (`" plx-nv01 "`) → vẫn khớp mã `PLX-NV01`. Test ở Task 9.
4. **Nhân viên đã chuyển `inactive` vẫn bị camera nhận diện** → bỏ qua, không tạo công. Test ở Task 9.
5. **HR tự đổi vai trò/trạng thái của chính mình** → bị chặn (400), tránh tự khóa mình khỏi hệ thống. Test ở Task 6.

## Sơ đồ file

```
server/
  check-node.ts      dừng nếu Node < 22.13 (import đầu tiên của index.ts)
  index.ts           entry: mở DB, chuyển dữ liệu JSON, tạo ADMIN, Vite/dist, lịch chạy, listen
  app.ts             createApp(ctx): middleware + routes, không listen
  context.ts         AppConfig, AppContext
  db.ts              openDb, tx, newId, schema
  errors.ts          HttpError, errorHandler, ah
  vntime.ts          giờ VN: toVnDate, vnMinutesOfDay, parseHHmm, vnDateTimeToTs, ...
  attendance.ts      computeDay (thuần), recomputeDay, applyDayAdjustment, recomputeRange
  settings.ts        bảng settings + giờ làm việc
  auth.ts            mật khẩu, phiên, LoginLimiter, scopeFor/scopeWhere
  middleware.ts      cookie, requireAuth, mustChangeGate, requireRole, jsonOnly, currentUser
  repo.ts            USER_SELECT, mapUser, getUser, canSeeUser
  bootstrap.ts       ensureAdminAccess
  hanet.ts           parseCheckin, ingestCheckin, logWebhook, token webhook, cấu hình Hanet
  hanet-api.ts       gọi API Hanet, refresh token, đối soát
  backup.ts          VACUUM INTO, xoay vòng
  migrate.ts         chuyển dữ liệu từ database.json
  jobs.ts            dueJobs, startJobs
  routes/            auth, users, departments, cameras, attendance, settings, requests, hanet, admin
shared/types.ts      types dùng chung server + React
tests/               *.test.ts, helpers.ts, fixtures/legacy-database.json
src/                 React: api.ts, format.ts, components/...
```

---

### Task 1: Nền móng — types dùng chung, schema SQLite, lỗi HTTP, test runner

**Files:**
- Create: `shared/types.ts`, `server/db.ts`, `server/errors.ts`, `tests/db.test.ts`
- Modify: `package.json` (scripts), `tsconfig.json` (types), `.gitignore`

**Interfaces:**
- Produces:
  - `type Db = DatabaseSync`; `openDb(file: string): Db`; `tx<T>(db: Db, fn: () => T): T`; `newId(prefix: string): string`
  - `class HttpError(status: number, message: string, code?: string)`; `errorHandler(production: boolean)`; `ah(fn)` bọc handler async
  - Toàn bộ types trong `shared/types.ts` (dùng ở mọi task sau)

- [ ] **Step 1: Cài dependency và kiểm tra Node**

```bash
node -v   # phải >= v22.13
npm install
```

- [ ] **Step 2: Cập nhật `package.json` scripts**

Thay khối `"scripts"` bằng:

```json
  "scripts": {
    "dev": "tsx server/index.ts",
    "start": "node server.js",
    "build": "vite build && npm run build:server",
    "build:server": "esbuild server/index.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outfile=server.js",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit",
    "test": "tsx --test \"tests/**/*.test.ts\""
  },
```

(`server/index.ts` được tạo ở Task 13; trước đó vẫn chạy được server cũ bằng `npx tsx server.ts`.)

- [ ] **Step 3: Cập nhật `tsconfig.json`**

Đổi dòng `"types": ["vite/client"],` thành:

```json
    "types": ["vite/client", "node"],
```

- [ ] **Step 4: Thêm `data/` vào `.gitignore`**

Thêm cuối file `.gitignore`:

```
data/
```

(Gỡ `data/database.json` khỏi git làm ở Task 16, cùng hướng dẫn nâng cấp.)

- [ ] **Step 5: Tạo `shared/types.ts`**

```ts
export type UserRole = 'hr' | 'dept_manager' | 'employee';
export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  departmentId: string | null;
  departmentName: string | null;
  position: string;
  avatarUrl: string;
  hanetPersonId: string | null;
  faceRegistered: boolean;
  status: UserStatus;
  createdAt: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  managerId: string | null;
  managerName: string | null;
  memberCount: number;
  createdAt: string;
}

export interface Camera {
  id: string;
  name: string;
  deviceKey: string;
  placeId: number | null;
  placeName: string;
  location: string;
  ipAddress: string;
  createdAt: string;
}

export type DayStatus = 'on_time' | 'late' | 'early_leave' | 'late_and_early' | 'missing_out';
export type DetectionSource = 'webhook' | 'reconcile' | 'simulator';

export interface AttendanceDay {
  userId: string;
  employeeCode: string;
  employeeName: string;
  avatarUrl: string;
  departmentId: string | null;
  departmentName: string | null;
  workDate: string;
  firstIn: number;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  status: DayStatus;
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
  detectionCount: number;
}

export interface Detection {
  id: number;
  deviceId: string;
  deviceName: string | null;
  placeId: number | null;
  ts: number;
  imageUrl: string | null;
  source: DetectionSource;
}

export type RequestType = 'missed_punch' | 'late_explanation' | 'leave_request';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface AttendanceRequest {
  id: string;
  userId: string;
  employeeName: string;
  employeeCode: string;
  departmentId: string | null;
  workDate: string;
  type: RequestType;
  reason: string;
  suggestedIn: string | null;
  suggestedOut: string | null;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  comment: string | null;
  createdAt: string;
}

export interface WorkSettings {
  workStart: string; // 'HH:mm'
  lateGraceMinutes: number;
  workEnd: string; // 'HH:mm'
  minOutGapMinutes: number;
}

export type WebhookLogStatus = 'success' | 'ignored' | 'duplicate' | 'rejected' | 'error';

export interface WebhookLog {
  id: number;
  receivedAt: string;
  status: WebhookLogStatus;
  personName: string | null;
  deviceName: string | null;
  message: string | null;
  rawPayload: unknown;
}

export interface HanetConfigView {
  clientId: string;
  clientSecret: string; // đã che: '••••abcd' hoặc ''
  accessToken: string; // đã che
  refreshToken: string; // đã che
  apiBase: string;
  placeIds: number[];
  webhookPath: string; // '/api/hanet/webhook/<token>'
  lastReconcileAt: string | null;
  lastReconcileError: string | null;
  reconcileEnabled: boolean;
}

export interface StatsData {
  date: string;
  totalEmployees: number;
  presentCount: number;
  onTimeCount: number;
  lateCount: number;
  missingOutCount: number;
  notCheckedInCount: number;
  pendingRequests: number;
  totalCameras: number;
}

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

export interface MeResponse {
  user: User;
  mustChangePassword: boolean;
  simulatorEnabled: boolean;
}
```

- [ ] **Step 6: Viết test thất bại `tests/db.test.ts`**

```ts
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
```

- [ ] **Step 7: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, lỗi không tìm thấy module `../server/db`.

- [ ] **Step 8: Tạo `server/db.ts`**

```ts
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Nạp node:sqlite lúc chạy (không phải import tĩnh) để check-node.ts kịp báo lỗi trên Node cũ.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export type Db = DatabaseSyncType;

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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
`;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  if (!db.prepare('SELECT version FROM schema_version').get()) {
    db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(SCHEMA_VERSION);
  }
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
```

- [ ] **Step 9: Tạo `server/errors.ts`**

```ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function errorHandler(production: boolean) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
      return;
    }
    if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
      return;
    }
    console.error('[ERROR]', err);
    res.status(500).json({
      error: 'Lỗi hệ thống',
      ...(production ? {} : { detail: String((err as Error)?.stack ?? err) }),
    });
  };
}

/** Bọc handler async để lỗi được chuyển tới errorHandler (Express 4 không tự bắt promise). */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
```

- [ ] **Step 10: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: 5 test PASS; lint không lỗi.

- [ ] **Step 11: Commit**

```bash
git add shared/types.ts server/db.ts server/errors.ts tests/db.test.ts package.json package-lock.json tsconfig.json .gitignore
git commit -m "feat(db): SQLite schema, shared types, HttpError and node:test runner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Giờ Việt Nam và hàm tính công thuần

**Files:**
- Create: `server/vntime.ts`, `server/attendance.ts`, `tests/vntime.test.ts`, `tests/attendance.test.ts`

**Interfaces:**
- Consumes: `DayStatus`, `WorkSettings` từ `shared/types.ts`
- Produces (`server/vntime.ts`):
  - `VN_OFFSET_MS: number`
  - `toVnDate(ts: number): string` — `'YYYY-MM-DD'` theo giờ VN
  - `vnMinutesOfDay(ts: number): number`
  - `parseHHmm(s: string): number` — ném `Error` nếu sai định dạng
  - `isValidDate(s: unknown): s is string`
  - `vnDateTimeToTs(date: string, hhmm: string): number`
  - `vnDayStart(date: string): number`
  - `addDays(date: string, n: number): string`
  - `daysBetween(from: string, to: string): number`
- Produces (`server/attendance.ts`):
  - `interface DaySettings { workStart: number; graceMinutes: number; workEnd: number; minOutGapMinutes: number }` (phút trong ngày)
  - `toDaySettings(ws: WorkSettings): DaySettings`
  - `interface ComputeDayInput { detectionTs: number[]; settings: DaySettings; lateExcused: boolean; manualIn: number | null; manualOut: number | null }`
  - `interface ComputedDay { firstIn: number; lastOut: number | null; lateMinutes: number; earlyMinutes: number; status: DayStatus; detectionCount: number }`
  - `computeDay(input: ComputeDayInput): ComputedDay | null`

- [ ] **Step 1: Viết test thất bại `tests/vntime.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toVnDate, vnMinutesOfDay, parseHHmm, isValidDate, vnDateTimeToTs, vnDayStart, addDays, daysBetween } from '../server/vntime';

test('00:30 giờ VN (17:30 UTC hôm trước) thuộc ngày VN', () => {
  const ts = Date.UTC(2026, 9, 12, 17, 30); // 2026-10-12 17:30 UTC = 2026-10-13 00:30 VN
  assert.equal(toVnDate(ts), '2026-10-13');
  assert.equal(vnMinutesOfDay(ts), 30);
});

test('vnDateTimeToTs là nghịch đảo của toVnDate/vnMinutesOfDay', () => {
  const ts = vnDateTimeToTs('2026-10-13', '08:00');
  assert.equal(ts, Date.UTC(2026, 9, 13, 1, 0));
  assert.equal(toVnDate(ts), '2026-10-13');
  assert.equal(vnMinutesOfDay(ts), 480);
  assert.equal(vnDayStart('2026-10-13'), Date.UTC(2026, 9, 12, 17, 0));
});

test('parseHHmm', () => {
  assert.equal(parseHHmm('00:00'), 0);
  assert.equal(parseHHmm('08:15'), 495);
  assert.equal(parseHHmm('23:59'), 1439);
  for (const bad of ['24:00', '8:15', '08:60', 'abc', '']) assert.throws(() => parseHHmm(bad), bad);
});

test('isValidDate', () => {
  assert.equal(isValidDate('2026-10-13'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-1-3'), false);
  assert.equal(isValidDate(undefined), false);
  assert.equal(isValidDate(20261013), false);
});

test('addDays và daysBetween', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(daysBetween('2026-10-01', '2026-10-13'), 12);
});

test('kết quả không phụ thuộc biến TZ của process', () => {
  const ts = Date.UTC(2026, 9, 12, 17, 30);
  const original = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const a = [toVnDate(ts), vnMinutesOfDay(ts), vnDateTimeToTs('2026-10-13', '08:00')];
    process.env.TZ = 'America/New_York';
    const b = [toVnDate(ts), vnMinutesOfDay(ts), vnDateTimeToTs('2026-10-13', '08:00')];
    assert.deepEqual(a, b);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
```

- [ ] **Step 2: Viết test thất bại `tests/attendance.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, toDaySettings, type ComputeDayInput } from '../server/attendance';
import { vnDateTimeToTs } from '../server/vntime';

const D = '2026-10-13';
const at = (hhmm: string, seconds = 0) => vnDateTimeToTs(D, hhmm) + seconds * 1000;
const settings = toDaySettings({ workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 });
const input = (detectionTs: number[], extra: Partial<ComputeDayInput> = {}): ComputeDayInput => ({
  detectionTs,
  settings,
  lateExcused: false,
  manualIn: null,
  manualOut: null,
  ...extra,
});

test('không có lượt nào và không có điều chỉnh → null', () => {
  assert.equal(computeDay(input([])), null);
});

test('vào 08:15, ra 17:00 → đúng giờ', () => {
  const r = computeDay(input([at('08:15'), at('17:00')]))!;
  assert.equal(r.status, 'on_time');
  assert.equal(r.lateMinutes, 0);
  assert.equal(r.earlyMinutes, 0);
  assert.equal(r.firstIn, at('08:15'));
  assert.equal(r.lastOut, at('17:00'));
  assert.equal(r.detectionCount, 2);
});

test('vào 08:15:59 vẫn đúng giờ (tính theo phút)', () => {
  assert.equal(computeDay(input([at('08:15', 59), at('17:00')]))!.status, 'on_time');
});

test('vào 08:16 → muộn 16 phút (tính từ 08:00)', () => {
  const r = computeDay(input([at('08:16'), at('17:00')]))!;
  assert.equal(r.status, 'late');
  assert.equal(r.lateMinutes, 16);
});

test('chỉ một lượt → thiếu giờ ra, vẫn ghi phút muộn', () => {
  const r = computeDay(input([at('08:30')]))!;
  assert.equal(r.status, 'missing_out');
  assert.equal(r.lastOut, null);
  assert.equal(r.lateMinutes, 30);
});

test('hai lượt cách 29 phút → thiếu giờ ra; cách 30 phút → có giờ ra', () => {
  assert.equal(computeDay(input([at('08:00'), at('08:29')]))!.status, 'missing_out');
  const r = computeDay(input([at('08:00'), at('08:30')]))!;
  assert.equal(r.lastOut, at('08:30'));
  assert.equal(r.status, 'early_leave');
});

test('ra 16:50 → về sớm 10 phút', () => {
  const r = computeDay(input([at('07:55'), at('12:00'), at('16:50')]))!;
  assert.equal(r.status, 'early_leave');
  assert.equal(r.earlyMinutes, 10);
  assert.equal(r.firstIn, at('07:55'));
  assert.equal(r.lastOut, at('16:50'));
});

test('muộn và về sớm', () => {
  const r = computeDay(input([at('08:30'), at('16:50')]))!;
  assert.equal(r.status, 'late_and_early');
  assert.equal(r.lateMinutes, 30);
  assert.equal(r.earlyMinutes, 10);
});

test('đã được duyệt giải trình → không tính muộn', () => {
  const r = computeDay(input([at('08:30'), at('17:05')], { lateExcused: true }))!;
  assert.equal(r.status, 'on_time');
  assert.equal(r.lateMinutes, 0);
});

test('manualIn thay giờ vào, giờ ra lấy lượt cuối', () => {
  const r = computeDay(input([at('17:30')], { manualIn: at('08:00') }))!;
  assert.equal(r.firstIn, at('08:00'));
  assert.equal(r.lastOut, at('17:30'));
  assert.equal(r.status, 'on_time');
  assert.equal(r.detectionCount, 1);
});

test('manualOut bổ sung giờ ra', () => {
  const r = computeDay(input([at('08:00')], { manualOut: at('17:00') }))!;
  assert.equal(r.lastOut, at('17:00'));
  assert.equal(r.status, 'on_time');
});

test('manualIn khi không có lượt nào → thiếu giờ ra', () => {
  const r = computeDay(input([], { manualIn: at('08:00') }))!;
  assert.equal(r.status, 'missing_out');
  assert.equal(r.detectionCount, 0);
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, không tìm thấy `../server/vntime` và `../server/attendance`.

- [ ] **Step 4: Tạo `server/vntime.ts`**

```ts
/** Việt Nam dùng UTC+7 cố định, không có giờ mùa hè. Mọi hàm ở đây không phụ thuộc TZ của server. */
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toVnDate(ts: number): string {
  return new Date(ts + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function vnMinutesOfDay(ts: number): number {
  const d = new Date(ts + VN_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function parseHHmm(s: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) throw new Error(`Giờ không hợp lệ: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function vnDateTimeToTs(date: string, hhmm: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, 0, parseHHmm(hhmm)) - VN_OFFSET_MS;
}

export function vnDayStart(date: string): number {
  return vnDateTimeToTs(date, '00:00');
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
```

- [ ] **Step 5: Tạo `server/attendance.ts` (phần thuần)**

```ts
import type { DayStatus, WorkSettings } from '../shared/types';
import { parseHHmm, vnMinutesOfDay } from './vntime';

export interface DaySettings {
  workStart: number; // phút trong ngày
  graceMinutes: number;
  workEnd: number; // phút trong ngày
  minOutGapMinutes: number;
}

export function toDaySettings(ws: WorkSettings): DaySettings {
  return {
    workStart: parseHHmm(ws.workStart),
    graceMinutes: ws.lateGraceMinutes,
    workEnd: parseHHmm(ws.workEnd),
    minOutGapMinutes: ws.minOutGapMinutes,
  };
}

export interface ComputeDayInput {
  detectionTs: number[];
  settings: DaySettings;
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
}

export interface ComputedDay {
  firstIn: number;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  status: DayStatus;
  detectionCount: number;
}

export function computeDay(input: ComputeDayInput): ComputedDay | null {
  const { detectionTs, settings, lateExcused, manualIn, manualOut } = input;
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

  const outMin = lastOut === null ? null : vnMinutesOfDay(lastOut);
  const isEarly = outMin !== null && outMin < settings.workEnd;
  const earlyMinutes = isEarly ? settings.workEnd - (outMin as number) : 0;

  let status: DayStatus;
  if (lastOut === null) status = 'missing_out';
  else if (isLate && isEarly) status = 'late_and_early';
  else if (isLate) status = 'late';
  else if (isEarly) status = 'early_leave';
  else status = 'on_time';

  return { firstIn, lastOut, lateMinutes, earlyMinutes, status, detectionCount: detectionTs.length };
}
```

- [ ] **Step 6: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS toàn bộ.

- [ ] **Step 7: Commit**

```bash
git add server/vntime.ts server/attendance.ts tests/vntime.test.ts tests/attendance.test.ts
git commit -m "feat(attendance): VN time helpers and pure computeDay rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Lõi xác thực — mật khẩu, phiên, giới hạn đăng nhập, phạm vi dữ liệu

**Files:**
- Create: `server/auth.ts`, `tests/helpers.ts`, `tests/auth.test.ts`

**Interfaces:**
- Consumes: `Db`, `newId`, `openDb` (Task 1); `toVnDate` (Task 2); `UserRole` (shared)
- Produces (`server/auth.ts`):
  - `hashPassword(pw: string): string`; `verifyPassword(pw: string, stored: string | null | undefined): boolean`
  - `generateTempPassword(length?: number): string`
  - `validateNewPassword(newPassword: unknown, currentPassword: string): string | null` (trả thông báo lỗi hoặc null)
  - `sha256(s: string): string`; `safeEqualStrings(a: string, b: string): boolean`
  - `SESSION_TTL_MS`
  - `interface AuthUser { id: string; code: string; name: string; role: UserRole; departmentId: string | null; mustChangePassword: boolean }`
  - `createSession(db, userId, now): string` (trả token gốc); `findSessionUser(db, token, now): AuthUser | null`
  - `deleteSession(db, token)`; `deleteUserSessions(db, userId, exceptToken?)`; `purgeExpiredSessions(db, now): number`
  - `class LoginLimiter(max = 5, windowMs = 15 phút)` với `isBlocked(key, now)`, `recordFailure(key, now)`, `reset(key)`
  - `type Scope`; `scopeFor(user: AuthUser): Scope`; `scopeWhere(scope, userIdCol, deptCol): { sql: string; params: string[] }`
- Produces (`tests/helpers.ts`): `TEST_PASSWORD`, `freshDb()`, `seedDepartment(db, code, name?)`, `seedUser(db, opts): string`

- [ ] **Step 1: Tạo `tests/helpers.ts`**

```ts
import { openDb, newId, type Db } from '../server/db';
import { hashPassword } from '../server/auth';
import type { UserRole, UserStatus } from '../shared/types';

export const TEST_PASSWORD = 'Matkhau@123';

export function freshDb(): Db {
  return openDb(':memory:');
}

export function seedDepartment(db: Db, code: string, name = code): string {
  const id = newId('dep');
  db.prepare('INSERT INTO departments(id, code, name, description, manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    code,
    name,
    '',
    null,
    '2026-10-13',
  );
  return id;
}

export interface SeedUserOpts {
  code: string;
  role?: UserRole;
  departmentId?: string | null;
  name?: string;
  /** null = chưa có mật khẩu; mặc định TEST_PASSWORD */
  password?: string | null;
  mustChange?: boolean;
  status?: UserStatus;
  hanetPersonId?: string | null;
}

export function seedUser(db: Db, o: SeedUserOpts): string {
  const id = newId('usr');
  db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, '', '', ?, ?, '', '', ?, 0, ?, ?, ?, '2026-10-13')`,
  ).run(
    id,
    o.code,
    o.name ?? o.code,
    o.role ?? 'employee',
    o.departmentId ?? null,
    o.hanetPersonId ?? null,
    o.status ?? 'active',
    o.password === null ? null : hashPassword(o.password ?? TEST_PASSWORD),
    o.mustChange ? 1 : 0,
  );
  return id;
}
```

- [ ] **Step 2: Viết test thất bại `tests/auth.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, generateTempPassword, validateNewPassword, safeEqualStrings,
  createSession, findSessionUser, deleteSession, deleteUserSessions, purgeExpiredSessions,
  LoginLimiter, scopeFor, scopeWhere, SESSION_TTL_MS, type AuthUser,
} from '../server/auth';
import { freshDb, seedDepartment, seedUser } from './helpers';

test('hashPassword/verifyPassword', () => {
  const stored = hashPassword('Matkhau@123');
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(verifyPassword('Matkhau@123', stored), true);
  assert.equal(verifyPassword('matkhau@123', stored), false);
  assert.notEqual(hashPassword('Matkhau@123'), stored, 'salt phải ngẫu nhiên');
});

test('verifyPassword với giá trị lưu hỏng hoặc rỗng → false, không ném lỗi', () => {
  for (const bad of [null, undefined, '', 'plain', 'scrypt$zz$zz', 'bcrypt$00$00', 'scrypt$00$00']) {
    assert.equal(verifyPassword('x', bad), false, String(bad));
  }
});

test('generateTempPassword: 10 ký tự, không có ký tự dễ nhầm', () => {
  for (let i = 0; i < 50; i++) {
    const p = generateTempPassword();
    assert.equal(p.length, 10);
    assert.doesNotMatch(p, /[0O1lI]/);
  }
});

test('validateNewPassword', () => {
  assert.equal(validateNewPassword('short', 'old-pass-1'), 'Mật khẩu mới phải có ít nhất 8 ký tự');
  assert.equal(validateNewPassword(12345678, 'old'), 'Mật khẩu mới phải có ít nhất 8 ký tự');
  assert.equal(validateNewPassword('same-pass', 'same-pass'), 'Mật khẩu mới phải khác mật khẩu hiện tại');
  assert.equal(validateNewPassword('new-pass-1', 'old-pass-1'), null);
});

test('safeEqualStrings', () => {
  assert.equal(safeEqualStrings('abc', 'abc'), true);
  assert.equal(safeEqualStrings('abc', 'abcd'), false);
});

test('phiên: tạo, tìm, hết hạn, xóa', () => {
  const db = freshDb();
  const dep = seedDepartment(db, 'KT');
  const uid = seedUser(db, { code: 'NV01', role: 'dept_manager', departmentId: dep, mustChange: true });
  const now = 1_000_000;
  const token = createSession(db, uid, now);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const stored = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
  assert.notEqual(stored.token_hash, token, 'không lưu token gốc');

  const u = findSessionUser(db, token, now + 1)!;
  assert.deepEqual(u, { id: uid, code: 'NV01', name: 'NV01', role: 'dept_manager', departmentId: dep, mustChangePassword: true });
  assert.equal(findSessionUser(db, token, now + SESSION_TTL_MS), null, 'hết hạn');
  assert.equal(findSessionUser(db, 'sai', now), null);

  deleteSession(db, token);
  assert.equal(findSessionUser(db, token, now + 1), null);
});

test('phiên của nhân viên inactive không dùng được', () => {
  const db = freshDb();
  const uid = seedUser(db, { code: 'NV02', status: 'inactive' });
  const token = createSession(db, uid, 0);
  assert.equal(findSessionUser(db, token, 1), null);
});

test('deleteUserSessions giữ lại phiên ngoại lệ; purgeExpiredSessions', () => {
  const db = freshDb();
  const uid = seedUser(db, { code: 'NV03' });
  const keep = createSession(db, uid, 0);
  const drop = createSession(db, uid, 0);
  deleteUserSessions(db, uid, keep);
  assert.ok(findSessionUser(db, keep, 1));
  assert.equal(findSessionUser(db, drop, 1), null);
  assert.equal(purgeExpiredSessions(db, SESSION_TTL_MS + 1), 1);
  deleteUserSessions(db, uid);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number }).c, 0);
});

test('LoginLimiter: khóa sau 5 lần sai trong 15 phút, tự mở sau cửa sổ', () => {
  const l = new LoginLimiter();
  const t0 = 0;
  for (let i = 0; i < 4; i++) l.recordFailure('k', t0 + i);
  assert.equal(l.isBlocked('k', t0 + 10), false);
  l.recordFailure('k', t0 + 10);
  assert.equal(l.isBlocked('k', t0 + 11), true);
  assert.equal(l.isBlocked('other', t0 + 11), false);
  assert.equal(l.isBlocked('k', t0 + 15 * 60 * 1000 + 11), false);
  l.recordFailure('k', 0);
  l.reset('k');
  assert.equal(l.isBlocked('k', 1), false);
});

test('scopeFor và scopeWhere', () => {
  const base: Omit<AuthUser, 'role' | 'departmentId'> = { id: 'u1', code: 'X', name: 'X', mustChangePassword: false };
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'hr', departmentId: null }), 'u.id', 'u.department_id'), { sql: '1=1', params: [] });
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'dept_manager', departmentId: 'd1' }), 'u.id', 'u.department_id'), { sql: 'u.department_id = ?', params: ['d1'] });
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'dept_manager', departmentId: null }), 'u.id', 'u.department_id'), { sql: '0=1', params: [] });
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'employee', departmentId: 'd1' }), 'u.id', 'u.department_id'), { sql: 'u.id = ?', params: ['u1'] });
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, không tìm thấy `../server/auth`.

- [ ] **Step 4: Tạo `server/auth.ts`**

```ts
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { Db } from './db';
import type { UserRole } from '../shared/types';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
  const actual = scryptSync(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  return timingSafeEqual(actual, expected);
}

// Bỏ các ký tự dễ nhầm: 0 O 1 l I
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 10): string {
  let s = '';
  for (const b of randomBytes(length)) s += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
  return s;
}

export function validateNewPassword(newPassword: unknown, currentPassword: string): string | null {
  if (typeof newPassword !== 'string' || newPassword.length < 8) return 'Mật khẩu mới phải có ít nhất 8 ký tự';
  if (newPassword === currentPassword) return 'Mật khẩu mới phải khác mật khẩu hiện tại';
  return null;
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** So sánh hằng thời gian cho hai chuỗi bất kỳ độ dài (băm trước để cùng độ dài). */
export function safeEqualStrings(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  code: string;
  name: string;
  role: UserRole;
  departmentId: string | null;
  mustChangePassword: boolean;
}

export function createSession(db: Db, userId: string, now: number): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    now,
    now + SESSION_TTL_MS,
  );
  return token;
}

export function findSessionUser(db: Db, token: string, now: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.code, u.name, u.role, u.department_id, u.must_change_password, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), now) as Record<string, any> | undefined;
  if (!row || row.status !== 'active') return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    role: row.role,
    departmentId: row.department_id ?? null,
    mustChangePassword: row.must_change_password === 1,
  };
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function deleteUserSessions(db: Db, userId: string, exceptToken?: string): void {
  if (exceptToken) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(exceptToken));
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export function purgeExpiredSessions(db: Db, now: number): number {
  return Number(db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes);
}

export class LoginLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private max = 5,
    private windowMs = 15 * 60 * 1000,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isBlocked(key: string, now: number): boolean {
    return this.recent(key, now).length >= this.max;
  }

  recordFailure(key: string, now: number): void {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}

export type Scope =
  | { kind: 'all' }
  | { kind: 'department'; departmentId: string | null }
  | { kind: 'self'; userId: string };

export function scopeFor(user: AuthUser): Scope {
  if (user.role === 'hr') return { kind: 'all' };
  if (user.role === 'dept_manager') return { kind: 'department', departmentId: user.departmentId };
  return { kind: 'self', userId: user.id };
}

export function scopeWhere(scope: Scope, userIdCol: string, deptCol: string): { sql: string; params: string[] } {
  switch (scope.kind) {
    case 'all':
      return { sql: '1=1', params: [] };
    case 'department':
      return scope.departmentId ? { sql: `${deptCol} = ?`, params: [scope.departmentId] } : { sql: '0=1', params: [] };
    case 'self':
      return { sql: `${userIdCol} = ?`, params: [scope.userId] };
  }
}
```

- [ ] **Step 5: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/auth.ts tests/helpers.ts tests/auth.test.ts
git commit -m "feat(auth): scrypt passwords, hashed sessions, login limiter, data scopes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cài đặt giờ làm và tính lại công trong DB

**Files:**
- Create: `server/settings.ts`, `tests/settings.test.ts`, `tests/recompute.test.ts`
- Modify: `server/attendance.ts` (thêm hàm DB), `tests/helpers.ts` (thêm `addDetection`)

**Interfaces:**
- Consumes: `Db`, `tx` (Task 1); `parseHHmm` (Task 2); `computeDay`, `toDaySettings`, `DaySettings` (Task 2); `HttpError` (Task 1)
- Produces (`server/settings.ts`):
  - `getSetting(db, key): string | undefined`; `setSetting(db, key, value: string)`; `deleteSetting(db, key)`
  - `DEFAULT_WORK_SETTINGS: WorkSettings`; `getWorkSettings(db): WorkSettings`
  - `validateWorkSettings(input: unknown): WorkSettings` (ném `HttpError(400)`); `saveWorkSettings(db, ws)`
- Produces (`server/attendance.ts`):
  - `interface DayAdjustment { lateExcused: boolean; manualIn: number | null; manualOut: number | null }`
  - `recomputeDay(db, userId, workDate, settings?: DaySettings): void`
  - `applyDayAdjustment(db, userId, workDate, patch: Partial<DayAdjustment>): void`
  - `recomputeRange(db, from: string, to: string): number`
- Produces (`tests/helpers.ts`): `addDetection(db, userId, ts, opts?: { deviceId?: string; source?: DetectionSource }): void`

- [ ] **Step 1: Viết test thất bại `tests/settings.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSetting, setSetting, deleteSetting, getWorkSettings, saveWorkSettings, validateWorkSettings, DEFAULT_WORK_SETTINGS } from '../server/settings';
import { HttpError } from '../server/errors';
import { freshDb } from './helpers';

test('get/set/delete setting', () => {
  const db = freshDb();
  assert.equal(getSetting(db, 'x'), undefined);
  setSetting(db, 'x', '1');
  setSetting(db, 'x', '2');
  assert.equal(getSetting(db, 'x'), '2');
  deleteSetting(db, 'x');
  assert.equal(getSetting(db, 'x'), undefined);
});

test('giờ làm mặc định và lưu lại', () => {
  const db = freshDb();
  assert.deepEqual(getWorkSettings(db), DEFAULT_WORK_SETTINGS);
  assert.deepEqual(DEFAULT_WORK_SETTINGS, { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 });
  const ws = { workStart: '07:30', lateGraceMinutes: 10, workEnd: '16:30', minOutGapMinutes: 60 };
  saveWorkSettings(db, ws);
  assert.deepEqual(getWorkSettings(db), ws);
});

test('validateWorkSettings từ chối dữ liệu sai', () => {
  const ok = { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 };
  assert.deepEqual(validateWorkSettings(ok), ok);
  assert.deepEqual(validateWorkSettings({ ...ok, lateGraceMinutes: '15' }), ok, 'chấp nhận số dạng chuỗi');
  for (const bad of [
    { ...ok, workStart: '25:00' },
    { ...ok, workEnd: '07:00' },
    { ...ok, workEnd: '08:00' },
    { ...ok, lateGraceMinutes: -1 },
    { ...ok, lateGraceMinutes: 121 },
    { ...ok, lateGraceMinutes: 1.5 },
    { ...ok, minOutGapMinutes: 0 },
    null,
  ]) {
    assert.throws(() => validateWorkSettings(bad), (e: unknown) => e instanceof HttpError && e.status === 400, JSON.stringify(bad));
  }
});
```

- [ ] **Step 2: Thêm `addDetection` vào `tests/helpers.ts`**

Thêm import ở đầu file:

```ts
import { recomputeDay } from '../server/attendance';
import { toVnDate } from '../server/vntime';
import type { DetectionSource } from '../shared/types';
```

Thêm cuối file:

```ts
/** Ghi một lượt nhận diện thẳng vào DB rồi tính lại ngày công (dùng trước khi có ingestCheckin). */
export function addDetection(db: Db, userId: string, ts: number, opts: { deviceId?: string; source?: DetectionSource } = {}): void {
  const workDate = toVnDate(ts);
  db.prepare(
    `INSERT INTO detections(user_id, hanet_person_id, device_id, device_name, place_id, ts, work_date, image_url, source)
     VALUES (?, NULL, ?, 'Cửa chính', NULL, ?, ?, NULL, ?)`,
  ).run(userId, opts.deviceId ?? 'DEV1', ts, workDate, opts.source ?? 'webhook');
  recomputeDay(db, userId, workDate);
}
```

- [ ] **Step 3: Viết test thất bại `tests/recompute.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recomputeDay, applyDayAdjustment, recomputeRange } from '../server/attendance';
import { saveWorkSettings } from '../server/settings';
import { vnDateTimeToTs } from '../server/vntime';
import { freshDb, seedUser, addDetection } from './helpers';

const D = '2026-10-13';
const at = (hhmm: string, date = D) => vnDateTimeToTs(date, hhmm);
type DayRow = { first_in: number; last_out: number | null; late_minutes: number; early_minutes: number; status: string; late_excused: number; manual_in: number | null; manual_out: number | null; detection_count: number };
const day = (db: ReturnType<typeof freshDb>, userId: string, date = D) =>
  db.prepare('SELECT * FROM attendance_days WHERE user_id = ? AND work_date = ?').get(userId, date) as DayRow | undefined;

test('lượt nhận diện tạo và cập nhật dòng ngày công', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  addDetection(db, u, at('08:30'));
  assert.equal(day(db, u)!.status, 'missing_out');
  addDetection(db, u, at('17:10'));
  const r = day(db, u)!;
  assert.equal(r.status, 'late');
  assert.equal(r.late_minutes, 30);
  assert.equal(r.first_in, at('08:30'));
  assert.equal(r.last_out, at('17:10'));
  assert.equal(r.detection_count, 2);
});

test('applyDayAdjustment: giải trình muộn và giữ cờ khi tính lại', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  addDetection(db, u, at('08:30'));
  addDetection(db, u, at('17:10'));
  applyDayAdjustment(db, u, D, { lateExcused: true });
  assert.equal(day(db, u)!.status, 'on_time');
  addDetection(db, u, at('17:20'));
  const r = day(db, u)!;
  assert.equal(r.late_excused, 1);
  assert.equal(r.status, 'on_time');
});

test('applyDayAdjustment: quên quẹt khi chưa có lượt nào tạo dòng mới', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  applyDayAdjustment(db, u, D, { manualIn: at('08:00'), manualOut: at('17:00') });
  const r = day(db, u)!;
  assert.equal(r.status, 'on_time');
  assert.equal(r.manual_in, at('08:00'));
  assert.equal(r.detection_count, 0);
});

test('recomputeDay xóa dòng khi không còn lượt nào và không có điều chỉnh', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  addDetection(db, u, at('08:00'));
  db.prepare('DELETE FROM detections').run();
  recomputeDay(db, u, D);
  assert.equal(day(db, u), undefined);
});

test('recomputeRange áp dụng giờ làm mới cho khoảng ngày', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  addDetection(db, u, at('08:10', '2026-10-12'));
  addDetection(db, u, at('17:00', '2026-10-12'));
  addDetection(db, u, at('08:10', '2026-10-14'));
  addDetection(db, u, at('17:00', '2026-10-14'));
  saveWorkSettings(db, { workStart: '08:00', lateGraceMinutes: 5, workEnd: '17:00', minOutGapMinutes: 30 });
  assert.equal(recomputeRange(db, '2026-10-12', '2026-10-13'), 1);
  assert.equal(day(db, u, '2026-10-12')!.status, 'late');
  assert.equal(day(db, u, '2026-10-14')!.status, 'on_time', 'ngoài khoảng thì giữ nguyên');
});

test('production: lượt từ mô phỏng không được tính công', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    addDetection(db, u, at('08:00'), { source: 'simulator' });
    assert.equal(day(db, u), undefined);
    addDetection(db, u, at('08:05'), { source: 'webhook' });
    assert.equal(day(db, u)!.detection_count, 1);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
```

- [ ] **Step 4: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, không tìm thấy `../server/settings` và export `recomputeDay`.

- [ ] **Step 5: Tạo `server/settings.ts`**

```ts
import type { Db } from './db';
import type { WorkSettings } from '../shared/types';
import { parseHHmm } from './vntime';
import { HttpError } from './errors';

export function getSetting(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function deleteSetting(db: Db, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  workStart: '08:00',
  lateGraceMinutes: 15,
  workEnd: '17:00',
  minOutGapMinutes: 30,
};

export function getWorkSettings(db: Db): WorkSettings {
  return {
    workStart: getSetting(db, 'work_start') ?? DEFAULT_WORK_SETTINGS.workStart,
    lateGraceMinutes: Number(getSetting(db, 'late_grace_minutes') ?? DEFAULT_WORK_SETTINGS.lateGraceMinutes),
    workEnd: getSetting(db, 'work_end') ?? DEFAULT_WORK_SETTINGS.workEnd,
    minOutGapMinutes: Number(getSetting(db, 'min_out_gap_minutes') ?? DEFAULT_WORK_SETTINGS.minOutGapMinutes),
  };
}

function intInRange(v: unknown, min: number, max: number, label: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} phải là số nguyên từ ${min} đến ${max}`);
  }
  return n;
}

function hhmm(v: unknown, label: string): string {
  if (typeof v !== 'string') throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
  try {
    parseHHmm(v);
  } catch {
    throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
  }
  return v;
}

export function validateWorkSettings(input: unknown): WorkSettings {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Thiếu cấu hình giờ làm việc');
  const b = input as Record<string, unknown>;
  const ws: WorkSettings = {
    workStart: hhmm(b.workStart, 'Giờ vào'),
    lateGraceMinutes: intInRange(b.lateGraceMinutes, 0, 120, 'Số phút cho phép muộn'),
    workEnd: hhmm(b.workEnd, 'Giờ ra'),
    minOutGapMinutes: intInRange(b.minOutGapMinutes, 1, 720, 'Ngưỡng giờ ra'),
  };
  if (parseHHmm(ws.workEnd) <= parseHHmm(ws.workStart)) throw new HttpError(400, 'Giờ ra phải sau giờ vào');
  return ws;
}

export function saveWorkSettings(db: Db, ws: WorkSettings): void {
  setSetting(db, 'work_start', ws.workStart);
  setSetting(db, 'late_grace_minutes', String(ws.lateGraceMinutes));
  setSetting(db, 'work_end', ws.workEnd);
  setSetting(db, 'min_out_gap_minutes', String(ws.minOutGapMinutes));
}
```

- [ ] **Step 6: Thêm phần DB vào `server/attendance.ts`**

Thêm import ở đầu file (sau các import hiện có):

```ts
import type { Db } from './db';
import { tx } from './db';
import { getWorkSettings } from './settings';
```

Thêm cuối file:

```ts
export interface DayAdjustment {
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
}

/** Ở production, lượt từ công cụ mô phỏng không được tính vào công. */
function simulatorFilter(): string {
  return process.env.NODE_ENV === 'production' ? " AND source != 'simulator'" : '';
}

function readAdjustment(db: Db, userId: string, workDate: string): DayAdjustment {
  const row = db
    .prepare('SELECT late_excused, manual_in, manual_out FROM attendance_days WHERE user_id = ? AND work_date = ?')
    .get(userId, workDate) as { late_excused: number; manual_in: number | null; manual_out: number | null } | undefined;
  return {
    lateExcused: row?.late_excused === 1,
    manualIn: row?.manual_in ?? null,
    manualOut: row?.manual_out ?? null,
  };
}

function writeDay(db: Db, userId: string, workDate: string, adj: DayAdjustment, settings: DaySettings): void {
  const detections = db
    .prepare(`SELECT ts FROM detections WHERE user_id = ? AND work_date = ?${simulatorFilter()}`)
    .all(userId, workDate) as { ts: number }[];
  const result = computeDay({
    detectionTs: detections.map((d) => d.ts),
    settings,
    lateExcused: adj.lateExcused,
    manualIn: adj.manualIn,
    manualOut: adj.manualOut,
  });
  if (!result) {
    db.prepare('DELETE FROM attendance_days WHERE user_id = ? AND work_date = ?').run(userId, workDate);
    return;
  }
  db.prepare(
    `INSERT INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, status,
       late_excused, manual_in, manual_out, detection_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE SET
       first_in = excluded.first_in, last_out = excluded.last_out, late_minutes = excluded.late_minutes,
       early_minutes = excluded.early_minutes, status = excluded.status, late_excused = excluded.late_excused,
       manual_in = excluded.manual_in, manual_out = excluded.manual_out, detection_count = excluded.detection_count`,
  ).run(
    userId,
    workDate,
    result.firstIn,
    result.lastOut,
    result.lateMinutes,
    result.earlyMinutes,
    result.status,
    adj.lateExcused ? 1 : 0,
    adj.manualIn,
    adj.manualOut,
    result.detectionCount,
  );
}

export function recomputeDay(db: Db, userId: string, workDate: string, settings?: DaySettings): void {
  writeDay(db, userId, workDate, readAdjustment(db, userId, workDate), settings ?? toDaySettings(getWorkSettings(db)));
}

export function applyDayAdjustment(db: Db, userId: string, workDate: string, patch: Partial<DayAdjustment>): void {
  const adj = { ...readAdjustment(db, userId, workDate), ...patch };
  writeDay(db, userId, workDate, adj, toDaySettings(getWorkSettings(db)));
}

/** Tính lại mọi (nhân viên, ngày) có dữ liệu trong [from, to]. Trả số cặp đã tính. */
export function recomputeRange(db: Db, from: string, to: string): number {
  const settings = toDaySettings(getWorkSettings(db));
  const pairs = db
    .prepare(
      `SELECT user_id, work_date FROM detections WHERE work_date BETWEEN ? AND ?
       UNION
       SELECT user_id, work_date FROM attendance_days WHERE work_date BETWEEN ? AND ?`,
    )
    .all(from, to, from, to) as { user_id: string; work_date: string }[];
  tx(db, () => {
    for (const p of pairs) recomputeDay(db, p.user_id, p.work_date, settings);
  });
  return pairs.length;
}
```

- [ ] **Step 7: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/settings.ts server/attendance.ts tests/helpers.ts tests/settings.test.ts tests/recompute.test.ts
git commit -m "feat(attendance): work settings and per-day recompute with adjustments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Khung app, middleware, API đăng nhập, tài khoản HR đầu tiên

**Files:**
- Create: `server/context.ts`, `server/middleware.ts`, `server/repo.ts`, `server/routes/auth.ts`, `server/bootstrap.ts`, `server/app.ts`, `tests/auth-routes.test.ts`, `tests/bootstrap.test.ts`
- Modify: `tests/helpers.ts` (thêm `startTestApp`, `Client`, `loginAs`)

**Interfaces:**
- Consumes: Task 1–4
- Produces:
  - `server/context.ts`: `interface AppConfig { production: boolean; simulatorEnabled: boolean; trustProxy: boolean; backupDir: string }`; `interface AppContext { db: Db; config: AppConfig; limiter: LoginLimiter; fetch: typeof fetch; now: () => number }`
  - `server/middleware.ts`: `SESSION_COOKIE = 'sid'`, `readCookie(req, name)`, `setSessionCookie(res, token, ctx)`, `clearSessionCookie(res, ctx)`, `requireAuth(ctx)`, `mustChangeGate`, `requireRole(...roles)`, `jsonOnly`, `currentUser(req): AuthUser`; mở rộng `Express.Request` với `user?: AuthUser`, `sessionToken?: string`
  - `server/repo.ts`: `USER_SELECT`, `mapUser(row): User`, `getUser(db, id): User | null`, `canSeeUser(viewer: AuthUser, target: { id: string; departmentId: string | null }): boolean`
  - `server/routes/auth.ts`: `authPublicRoutes(ctx): Router` (POST `/auth/login`), `authRoutes(ctx): Router` (GET `/auth/me`, POST `/auth/logout`, POST `/auth/change-password`)
  - `server/bootstrap.ts`: `ensureAdminAccess(db, envPassword?: string): { code: string; password: string; fromEnv: boolean } | null`
  - `server/app.ts`: `createApp(ctx: AppContext): express.Express`. Router `api` (cần đăng nhập) là nơi các task sau thêm `api.use(xxxRoutes(ctx))`.
  - `tests/helpers.ts`: `startTestApp(overrides?)`, `TestApp { baseUrl, ctx, db, close }`, `Client` (`get/post/put/del/req`, tự giữ cookie), `loginAs(app, code, password?)`

- [ ] **Step 1: Tạo `server/context.ts`**

```ts
import type { Db } from './db';
import type { LoginLimiter } from './auth';

export interface AppConfig {
  production: boolean;
  simulatorEnabled: boolean;
  trustProxy: boolean;
  backupDir: string;
}

export interface AppContext {
  db: Db;
  config: AppConfig;
  limiter: LoginLimiter;
  fetch: typeof fetch;
  now: () => number;
}
```

- [ ] **Step 2: Mở rộng `tests/helpers.ts`**

Thêm import ở đầu file:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { LoginLimiter } from '../server/auth';
import type { AppConfig, AppContext } from '../server/context';
```

Thêm cuối file:

```ts
export interface TestApp {
  baseUrl: string;
  ctx: AppContext;
  db: Db;
  close: () => Promise<void>;
}

export interface TestAppOverrides {
  db?: Db;
  config?: Partial<AppConfig>;
  fetch?: typeof fetch;
  now?: () => number;
  limiter?: LoginLimiter;
}

export async function startTestApp(overrides: TestAppOverrides = {}): Promise<TestApp> {
  const db = overrides.db ?? freshDb();
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-backup-'));
  const ctx: AppContext = {
    db,
    config: { production: false, simulatorEnabled: true, trustProxy: false, backupDir, ...overrides.config },
    limiter: overrides.limiter ?? new LoginLimiter(),
    fetch: overrides.fetch ?? ((async () => { throw new Error('fetch không được dùng trong test này'); }) as unknown as typeof fetch),
    now: overrides.now ?? (() => Date.now()),
  };
  const server = createApp(ctx).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    ctx,
    db,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface ApiResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** Client HTTP nhỏ cho test: tự giữ cookie phiên `sid`. */
export class Client {
  cookie = '';

  constructor(public baseUrl: string) {}

  async req<T = any>(method: string, p: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
    const res = await fetch(this.baseUrl + p, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = /sid=([^;]*)/.exec(setCookie);
      if (m) this.cookie = m[1] ? `sid=${m[1]}` : '';
    }
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // giữ nguyên text
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  get<T = any>(p: string) {
    return this.req<T>('GET', p);
  }
  post<T = any>(p: string, body: unknown = {}) {
    return this.req<T>('POST', p, body);
  }
  put<T = any>(p: string, body: unknown = {}) {
    return this.req<T>('PUT', p, body);
  }
  del<T = any>(p: string) {
    return this.req<T>('DELETE', p);
  }
}

export async function loginAs(app: TestApp, code: string, password = TEST_PASSWORD): Promise<Client> {
  const c = new Client(app.baseUrl);
  const r = await c.post('/api/auth/login', { code, password });
  if (r.status !== 200) throw new Error(`Đăng nhập ${code} thất bại: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}
```

- [ ] **Step 3: Viết test thất bại `tests/auth-routes.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client, TEST_PASSWORD } from './helpers';

test('health không cần đăng nhập', async () => {
  const app = await startTestApp();
  try {
    const r = await new Client(app.baseUrl).get('/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  } finally {
    await app.close();
  }
});

test('chưa đăng nhập → 401', async () => {
  const app = await startTestApp();
  try {
    const r = await new Client(app.baseUrl).get('/api/auth/me');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Vui lòng đăng nhập');
  } finally {
    await app.close();
  }
});

test('đăng nhập sai → 401 chung; đúng → cookie httpOnly và /me', async () => {
  const app = await startTestApp();
  try {
    const dep = seedDepartment(app.db, 'KT', 'Kế toán');
    seedUser(app.db, { code: 'NV01', name: 'Nguyễn Văn A', departmentId: dep });
    const c = new Client(app.baseUrl);
    for (const body of [{ code: 'NV01', password: 'sai-mat-khau' }, { code: 'KHONGCO', password: TEST_PASSWORD }, {}]) {
      const r = await c.post('/api/auth/login', body);
      assert.equal(r.status, 401);
      assert.equal(r.body.error, 'Mã nhân viên hoặc mật khẩu không đúng');
    }
    const ok = await c.post('/api/auth/login', { code: 'nv01', password: TEST_PASSWORD });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie')!;
    assert.match(cookie, /sid=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Secure/);
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.code, 'NV01');
    assert.equal(me.body.user.departmentName, 'Kế toán');
    assert.equal(me.body.mustChangePassword, false);
    assert.equal(me.body.simulatorEnabled, true);
    assert.equal('password_hash' in me.body.user, false);
  } finally {
    await app.close();
  }
});

test('production: cookie có Secure', async () => {
  const app = await startTestApp({ config: { production: true } });
  try {
    seedUser(app.db, { code: 'NV01' });
    const r = await new Client(app.baseUrl).post('/api/auth/login', { code: 'NV01', password: TEST_PASSWORD });
    assert.match(r.headers.get('set-cookie')!, /Secure/);
  } finally {
    await app.close();
  }
});

test('tài khoản inactive không đăng nhập được', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01', status: 'inactive' });
    const r = await new Client(app.baseUrl).post('/api/auth/login', { code: 'NV01', password: TEST_PASSWORD });
    assert.equal(r.status, 401);
  } finally {
    await app.close();
  }
});

test('sai 5 lần → 429 kể cả khi nhập đúng', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01' });
    const c = new Client(app.baseUrl);
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { code: 'NV01', password: 'sai' })).status, 401);
    const r = await c.post('/api/auth/login', { code: 'NV01', password: TEST_PASSWORD });
    assert.equal(r.status, 429);
  } finally {
    await app.close();
  }
});

test('bắt buộc đổi mật khẩu: chặn API khác, đổi xong thì dùng được, phiên khác bị hủy', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01', mustChange: true });
    const c1 = await loginAs(app, 'NV01');
    const c2 = await loginAs(app, 'NV01');
    assert.equal((await c1.get('/api/auth/me')).body.mustChangePassword, true);
    const blocked = await c1.get('/api/users');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'MUST_CHANGE_PASSWORD');

    assert.equal((await c1.post('/api/auth/change-password', { currentPassword: 'sai', newPassword: 'MatKhauMoi1' })).status, 400);
    const short = await c1.post('/api/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'ngan' });
    assert.equal(short.status, 400);
    assert.equal(short.body.error, 'Mật khẩu mới phải có ít nhất 8 ký tự');

    assert.equal((await c1.post('/api/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'MatKhauMoi1' })).status, 200);
    assert.equal((await c1.get('/api/auth/me')).body.mustChangePassword, false);
    assert.equal((await c2.get('/api/auth/me')).status, 401, 'phiên khác bị hủy');
    await loginAs(app, 'NV01', 'MatKhauMoi1');
  } finally {
    await app.close();
  }
});

test('đăng xuất hủy phiên', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01' });
    const c = await loginAs(app, 'NV01');
    const saved = c.cookie;
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    c.cookie = saved;
    assert.equal((await c.get('/api/auth/me')).status, 401);
  } finally {
    await app.close();
  }
});

test('API ghi chỉ nhận JSON (415 với text/plain)', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01' });
    const c = await loginAs(app, 'NV01');
    const r = await c.req('POST', '/api/auth/change-password', 'x', { 'Content-Type': 'text/plain' });
    assert.equal(r.status, 415);
  } finally {
    await app.close();
  }
});

test('JSON hỏng → 400', async () => {
  const app = await startTestApp();
  try {
    const r = await new Client(app.baseUrl).req('POST', '/api/auth/login', '{bad', { 'Content-Type': 'application/json' });
    assert.equal(r.status, 400);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 4: Viết test thất bại `tests/bootstrap.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureAdminAccess } from '../server/bootstrap';
import { verifyPassword } from '../server/auth';
import { freshDb, seedUser } from './helpers';

test('DB trống → tạo ADMIN với mật khẩu tạm, bắt đổi', () => {
  const db = freshDb();
  const r = ensureAdminAccess(db, undefined)!;
  assert.equal(r.code, 'ADMIN');
  assert.equal(r.fromEnv, false);
  assert.equal(r.password.length, 10);
  const row = db.prepare("SELECT role, status, password_hash, must_change_password FROM users WHERE code = 'ADMIN'").get() as Record<string, any>;
  assert.equal(row.role, 'hr');
  assert.equal(row.status, 'active');
  assert.equal(row.must_change_password, 1);
  assert.ok(verifyPassword(r.password, row.password_hash));
  assert.equal(ensureAdminAccess(db, undefined), null, 'lần sau không làm gì');
});

test('dùng ADMIN_INITIAL_PASSWORD nếu đủ 8 ký tự', () => {
  const db = freshDb();
  const r = ensureAdminAccess(db, 'BatDau@2026')!;
  assert.equal(r.fromEnv, true);
  assert.equal(r.password, 'BatDau@2026');
  const short = ensureAdminAccess(freshDb(), 'ngan')!;
  assert.equal(short.fromEnv, false);
});

test('HR có sẵn nhưng chưa có mật khẩu → cấp mật khẩu tạm cho HR đó', () => {
  const db = freshDb();
  seedUser(db, { code: 'HR01', role: 'hr', password: null });
  seedUser(db, { code: 'NV01' });
  const r = ensureAdminAccess(db, undefined)!;
  assert.equal(r.code, 'HR01');
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 2);
});
```

- [ ] **Step 5: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, không tìm thấy `../server/app` và `../server/bootstrap`.

- [ ] **Step 6: Tạo `server/middleware.ts`**

```ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { findSessionUser, SESSION_TTL_MS, type AuthUser } from './auth';
import { HttpError } from './errors';
import type { AppContext } from './context';
import type { UserRole } from '../shared/types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE = 'sid';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, ctx: AppContext): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.production,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response, ctx: AppContext): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: ctx.config.production, path: '/' });
}

export function requireAuth(ctx: AppContext): RequestHandler {
  return (req, _res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    const user = token ? findSessionUser(ctx.db, token, ctx.now()) : null;
    if (!user) return next(new HttpError(401, 'Vui lòng đăng nhập'));
    req.user = user;
    req.sessionToken = token;
    next();
  };
}

const ALLOWED_WHEN_MUST_CHANGE = new Set(['GET /auth/me', 'POST /auth/change-password', 'POST /auth/logout']);

export const mustChangeGate: RequestHandler = (req, _res, next) => {
  if (req.user?.mustChangePassword && !ALLOWED_WHEN_MUST_CHANGE.has(`${req.method} ${req.path}`)) {
    return next(new HttpError(403, 'Bạn cần đổi mật khẩu trước khi tiếp tục', 'MUST_CHANGE_PASSWORD'));
  }
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Bạn không có quyền thực hiện thao tác này'));
    }
    next();
  };
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Chống CSRF cùng SameSite=Lax: request ghi có body phải là JSON. req.is() trả null khi không có body. */
export const jsonOnly: RequestHandler = (req, _res, next) => {
  if (WRITE_METHODS.has(req.method) && req.is('application/json') === false) {
    return next(new HttpError(415, 'Chỉ chấp nhận dữ liệu JSON'));
  }
  next();
};

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Vui lòng đăng nhập');
  return req.user;
}
```

- [ ] **Step 7: Tạo `server/repo.ts`**

```ts
import type { Db } from './db';
import type { User } from '../shared/types';
import { scopeFor, type AuthUser } from './auth';

export type Row = Record<string, any>;

export const USER_SELECT = `SELECT u.id, u.code, u.name, u.email, u.phone, u.role, u.department_id,
  d.name AS department_name, u.position, u.avatar_url, u.hanet_person_id, u.face_registered, u.status, u.created_at
  FROM users u LEFT JOIN departments d ON d.id = u.department_id`;

export function mapUser(r: Row): User {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    email: r.email ?? '',
    phone: r.phone ?? '',
    role: r.role,
    departmentId: r.department_id ?? null,
    departmentName: r.department_name ?? null,
    position: r.position ?? '',
    avatarUrl: r.avatar_url ?? '',
    hanetPersonId: r.hanet_person_id ?? null,
    faceRegistered: r.face_registered === 1,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function getUser(db: Db, id: string): User | null {
  const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id) as Row | undefined;
  return row ? mapUser(row) : null;
}

export function canSeeUser(viewer: AuthUser, target: { id: string; departmentId: string | null }): boolean {
  const scope = scopeFor(viewer);
  if (scope.kind === 'all') return true;
  if (scope.kind === 'self') return target.id === scope.userId;
  return scope.departmentId !== null && target.departmentId === scope.departmentId;
}
```

- [ ] **Step 8: Tạo `server/routes/auth.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { clearSessionCookie, currentUser, jsonOnly, setSessionCookie } from '../middleware';
import { createSession, deleteSession, deleteUserSessions, hashPassword, validateNewPassword, verifyPassword } from '../auth';
import { getUser } from '../repo';
import type { MeResponse } from '../../shared/types';

export function authPublicRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.post('/auth/login', jsonOnly, (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const key = `${code}|${req.ip}`;
    const now = ctx.now();
    if (ctx.limiter.isBlocked(key, now)) {
      console.warn(`[SECURITY] login_blocked code=${code} ip=${req.ip}`);
      throw new HttpError(429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút');
    }
    const row = db.prepare('SELECT id, password_hash, status FROM users WHERE code = ?').get(code) as
      | { id: string; password_hash: string | null; status: string }
      | undefined;
    if (!row || row.status !== 'active' || !verifyPassword(password, row.password_hash)) {
      ctx.limiter.recordFailure(key, now);
      console.warn(`[SECURITY] login_failed code=${code} ip=${req.ip}`);
      throw new HttpError(401, 'Mã nhân viên hoặc mật khẩu không đúng');
    }
    ctx.limiter.reset(key);
    setSessionCookie(res, createSession(db, row.id, now), ctx);
    res.json({ success: true });
  });

  return r;
}

export function authRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/auth/me', (req, res) => {
    const auth = currentUser(req);
    const user = getUser(db, auth.id);
    if (!user) throw new HttpError(401, 'Vui lòng đăng nhập');
    const body: MeResponse = { user, mustChangePassword: auth.mustChangePassword, simulatorEnabled: ctx.config.simulatorEnabled };
    res.json(body);
  });

  r.post('/auth/logout', (req, res) => {
    if (req.sessionToken) deleteSession(db, req.sessionToken);
    clearSessionCookie(res, ctx);
    res.json({ success: true });
  });

  r.post('/auth/change-password', (req, res) => {
    const auth = currentUser(req);
    const { currentPassword, newPassword } = req.body ?? {};
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(auth.id) as { password_hash: string | null } | undefined;
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, row?.password_hash)) {
      throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    }
    const error = validateNewPassword(newPassword, currentPassword);
    if (error) throw new HttpError(400, error);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(newPassword), auth.id);
    deleteUserSessions(db, auth.id, req.sessionToken);
    res.json({ success: true });
  });

  return r;
}
```

- [ ] **Step 9: Tạo `server/bootstrap.ts`**

```ts
import type { Db } from './db';
import { newId } from './db';
import { generateTempPassword, hashPassword } from './auth';
import { toVnDate } from './vntime';

/**
 * Đảm bảo luôn có ít nhất một HR đăng nhập được.
 * Trả thông tin mật khẩu vừa đặt (để in ra log) hoặc null nếu không cần làm gì.
 */
export function ensureAdminAccess(db: Db, envPassword?: string): { code: string; password: string; fromEnv: boolean } | null {
  const usable = db.prepare("SELECT 1 FROM users WHERE role = 'hr' AND status = 'active' AND password_hash IS NOT NULL LIMIT 1").get();
  if (usable) return null;

  const fromEnv = typeof envPassword === 'string' && envPassword.length >= 8;
  const password = fromEnv ? (envPassword as string) : generateTempPassword();

  let hr = db.prepare("SELECT id, code FROM users WHERE role = 'hr' ORDER BY created_at, id LIMIT 1").get() as
    | { id: string; code: string }
    | undefined;
  if (!hr) {
    db.prepare(
      `INSERT INTO users(id, code, name, role, status, must_change_password, created_at)
       VALUES (?, 'ADMIN', 'Quản trị viên Hệ thống (HR)', 'hr', 'active', 1, ?)
       ON CONFLICT(code) DO UPDATE SET role = 'hr', status = 'active'`,
    ).run(newId('usr'), toVnDate(Date.now()));
    hr = db.prepare("SELECT id, code FROM users WHERE code = 'ADMIN'").get() as { id: string; code: string };
  }
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, status = 'active' WHERE id = ?").run(hashPassword(password), hr.id);
  return { code: hr.code, password, fromEnv };
}
```

- [ ] **Step 10: Tạo `server/app.ts`**

```ts
import express from 'express';
import type { AppContext } from './context';
import { errorHandler, HttpError } from './errors';
import { jsonOnly, mustChangeGate, requireAuth } from './middleware';
import { authPublicRoutes, authRoutes } from './routes/auth';

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (ctx.config.trustProxy) app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    try {
      ctx.db.prepare('SELECT 1').get();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Route không cần đăng nhập
  app.use('/api', authPublicRoutes(ctx));

  // Route cần đăng nhập
  const api = express.Router();
  api.use(requireAuth(ctx), mustChangeGate, jsonOnly);
  api.use(authRoutes(ctx));
  app.use('/api', api);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Không tìm thấy')));
  app.use(errorHandler(ctx.config.production));
  return app;
}
```

- [ ] **Step 11: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add server/context.ts server/middleware.ts server/repo.ts server/routes/auth.ts server/bootstrap.ts server/app.ts tests/helpers.ts tests/auth-routes.test.ts tests/bootstrap.test.ts
git commit -m "feat(auth): login/logout/change-password API, auth middleware, admin bootstrap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API nhân sự và phòng ban

**Files:**
- Create: `server/routes/users.ts`, `server/routes/departments.ts`, `tests/users-routes.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `currentUser`, `requireRole` (Task 5); `USER_SELECT`, `mapUser`, `getUser`, `Row` (Task 5); `scopeFor`, `scopeWhere`, `hashPassword`, `generateTempPassword`, `deleteUserSessions` (Task 3); `toVnDate` (Task 2)
- Produces:
  - `userRoutes(ctx): Router` — `GET /users`, `POST /users` → `{ user, tempPassword }`, `PUT /users/:id` → `{ user }`, `POST /users/:id/reset-password` → `{ tempPassword }`
  - `departmentRoutes(ctx): Router` — `GET /departments` → `{ departments }`, `POST /departments` → `{ department }`, `PUT /departments/:id` → `{ department }`
  - `CODE_RE` (export từ `routes/users.ts`, dùng lại cho mã phòng ban)

- [ ] **Step 1: Viết test thất bại `tests/users-routes.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client, type TestApp } from './helpers';

async function setup(): Promise<{ app: TestApp; kt: string; kd: string; ids: Record<string, string> }> {
  const app = await startTestApp();
  const kt = seedDepartment(app.db, 'KT', 'Kế toán');
  const kd = seedDepartment(app.db, 'KD', 'Kinh doanh');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: kd }),
  };
  return { app, kt, kd, ids };
}

test('GET /users theo phạm vi vai trò', async () => {
  const { app } = await setup();
  try {
    const codes = async (c: Client) => ((await c.get('/api/users')).body.users as { code: string }[]).map((u) => u.code).sort();
    assert.deepEqual(await codes(await loginAs(app, 'HR01')), ['HR01', 'NV01', 'NV02', 'TP01']);
    assert.deepEqual(await codes(await loginAs(app, 'TP01')), ['NV01', 'TP01']);
    assert.deepEqual(await codes(await loginAs(app, 'NV01')), ['NV01']);
  } finally {
    await app.close();
  }
});

test('HR tạo nhân viên → mật khẩu tạm dùng được và bị bắt đổi', async () => {
  const { app, kt } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/users', { code: 'nv03', name: 'Lê Văn C', departmentId: kt, position: 'Kế toán viên' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.code, 'NV03');
    assert.equal(r.body.user.departmentName, 'Kế toán');
    assert.equal(r.body.user.email, '');
    assert.equal(r.body.user.hanetPersonId, null);
    assert.equal(r.body.user.faceRegistered, false);
    assert.equal(r.body.tempPassword.length, 10);
    const nv = await loginAs(app, 'NV03', r.body.tempPassword);
    assert.equal((await nv.get('/api/auth/me')).body.mustChangePassword, true);
  } finally {
    await app.close();
  }
});

test('tạo nhân viên: trùng mã (không phân biệt hoa thường) 409, dữ liệu sai 400', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/users', { code: 'nv01', name: 'Trùng' })).status, 409);
    assert.equal((await hr.post('/api/users', { code: 'NV 09', name: 'Có dấu cách' })).status, 400);
    assert.equal((await hr.post('/api/users', { code: 'NV09', name: '' })).status, 400);
    assert.equal((await hr.post('/api/users', { code: 'NV09', name: 'X', role: 'admin' })).status, 400);
    assert.equal((await hr.post('/api/users', { code: 'NV09', name: 'X', departmentId: 'dep-khong-co' })).status, 400);
  } finally {
    await app.close();
  }
});

test('chỉ HR được tạo/sửa/đặt lại mật khẩu', async () => {
  const { app, ids } = await setup();
  try {
    for (const code of ['TP01', 'NV01']) {
      const c = await loginAs(app, code);
      assert.equal((await c.post('/api/users', { code: 'NV09', name: 'X' })).status, 403);
      assert.equal((await c.put(`/api/users/${ids.nv1}`, { name: 'Y' })).status, 403);
      assert.equal((await c.post(`/api/users/${ids.nv1}/reset-password`)).status, 403);
    }
  } finally {
    await app.close();
  }
});

test('HR sửa thông tin; chuyển inactive thì phiên của người đó bị hủy', async () => {
  const { app, ids, kd } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NV01');
    const r = await hr.put(`/api/users/${ids.nv1}`, { name: 'Tên mới', departmentId: kd, hanetPersonId: '2134589559210508288', faceRegistered: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'Tên mới');
    assert.equal(r.body.user.departmentName, 'Kinh doanh');
    assert.equal(r.body.user.hanetPersonId, '2134589559210508288');
    assert.equal(r.body.user.faceRegistered, true);
    assert.equal((await nv.get('/api/auth/me')).status, 200);
    assert.equal((await hr.put(`/api/users/${ids.nv1}`, { status: 'inactive' })).status, 200);
    assert.equal((await nv.get('/api/auth/me')).status, 401);
    assert.equal((await hr.put('/api/users/usr-khong-co', { name: 'x' })).status, 404);
    assert.equal((await hr.put(`/api/users/${ids.nv1}`, { status: 'deleted' })).status, 400);
  } finally {
    await app.close();
  }
});

test('Review Focus #5: HR không tự đổi vai trò hay trạng thái của mình', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const a = await hr.put(`/api/users/${ids.hr}`, { role: 'employee' });
    assert.equal(a.status, 400);
    assert.equal(a.body.error, 'Không thể tự đổi vai trò hoặc trạng thái của chính mình');
    assert.equal((await hr.put(`/api/users/${ids.hr}`, { status: 'inactive' })).status, 400);
    assert.equal((await hr.put(`/api/users/${ids.hr}`, { role: 'hr', status: 'active', name: 'HR mới' })).status, 200, 'giữ nguyên giá trị thì được');
  } finally {
    await app.close();
  }
});

test('HR đặt lại mật khẩu: mật khẩu cũ hết hiệu lực, phiên bị hủy', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NV01');
    const r = await hr.post(`/api/users/${ids.nv1}/reset-password`);
    assert.equal(r.status, 200);
    assert.equal((await nv.get('/api/auth/me')).status, 401);
    await assert.rejects(loginAs(app, 'NV01'));
    await loginAs(app, 'NV01', r.body.tempPassword);
  } finally {
    await app.close();
  }
});

test('phòng ban: mọi vai trò xem, chỉ HR tạo/sửa', async () => {
  const { app, ids, kt } = await setup();
  try {
    const nv = await loginAs(app, 'NV01');
    const list = await nv.get('/api/departments');
    assert.equal(list.status, 200);
    const ktRow = (list.body.departments as { id: string; memberCount: number }[]).find((d) => d.id === kt)!;
    assert.equal(ktRow.memberCount, 2);
    assert.equal((await nv.post('/api/departments', { code: 'IT', name: 'CNTT' })).status, 403);

    const hr = await loginAs(app, 'HR01');
    const created = await hr.post('/api/departments', { code: 'it', name: 'Công nghệ', managerId: ids.tp });
    assert.equal(created.status, 200);
    assert.equal(created.body.department.code, 'IT');
    assert.equal(created.body.department.managerName, 'TP01');
    assert.equal((await hr.post('/api/departments', { code: 'IT', name: 'Trùng' })).status, 409);
    assert.equal((await hr.post('/api/departments', { code: 'X1', name: 'X', managerId: 'usr-khong-co' })).status, 400);

    const upd = await hr.put(`/api/departments/${kt}`, { name: 'Kế toán Tài chính', managerId: '' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.department.name, 'Kế toán Tài chính');
    assert.equal(upd.body.department.managerId, null);
    assert.equal((await hr.put(`/api/departments/${kt}`, { name: '' })).status, 400);
    assert.equal((await hr.put('/api/departments/dep-khong-co', { name: 'x' })).status, 404);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL (404/401 vì route chưa có).

- [ ] **Step 3: Tạo `server/routes/users.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { USER_SELECT, getUser, mapUser, type Row } from '../repo';
import { deleteUserSessions, generateTempPassword, hashPassword, scopeFor, scopeWhere } from '../auth';
import { toVnDate } from '../vntime';
import type { UserRole } from '../../shared/types';

const ROLES: UserRole[] = ['hr', 'dept_manager', 'employee'];
export const CODE_RE = /^[A-Z0-9._-]{1,32}$/;
const CODE_ERROR = 'Mã chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới (tối đa 32 ký tự)';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined);

function resolveDepartment(db: Db, departmentId: unknown): string | null {
  if (departmentId === undefined || departmentId === null || departmentId === '') return null;
  if (typeof departmentId !== 'string' || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(departmentId)) {
    throw new HttpError(400, 'Phòng ban không tồn tại');
  }
  return departmentId;
}

export function userRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/users', (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), 'u.id', 'u.department_id');
    const rows = db.prepare(`${USER_SELECT} WHERE ${w.sql} ORDER BY u.code`).all(...w.params) as Row[];
    res.json({ users: rows.map(mapUser) });
  });

  r.post('/users', requireRole('hr'), (req, res) => {
    const b = req.body ?? {};
    const code = (str(b.code) ?? '').toUpperCase();
    const name = str(b.name) ?? '';
    if (!CODE_RE.test(code)) throw new HttpError(400, CODE_ERROR);
    if (!name) throw new HttpError(400, 'Họ tên là bắt buộc');
    const role: UserRole = b.role === undefined ? 'employee' : b.role;
    if (!ROLES.includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');
    const departmentId = resolveDepartment(db, b.departmentId);
    if (db.prepare('SELECT 1 FROM users WHERE code = ?').get(code)) throw new HttpError(409, 'Mã nhân viên đã tồn tại');

    const id = newId('usr');
    const tempPassword = generateTempPassword();
    db.prepare(
      `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
         face_registered, status, password_hash, must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, 1, ?)`,
    ).run(
      id,
      code,
      name,
      str(b.email) ?? '',
      str(b.phone) ?? '',
      role,
      departmentId,
      str(b.position) ?? '',
      str(b.avatarUrl) ?? '',
      str(b.hanetPersonId) || null,
      hashPassword(tempPassword),
      toVnDate(ctx.now()),
    );
    res.json({ user: getUser(db, id), tempPassword });
  });

  r.put('/users/:id', requireRole('hr'), (req, res) => {
    const actor = currentUser(req);
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    const b = req.body ?? {};
    const changesRole = b.role !== undefined && b.role !== target.role;
    const changesStatus = b.status !== undefined && b.status !== target.status;
    if (target.id === actor.id && (changesRole || changesStatus)) {
      throw new HttpError(400, 'Không thể tự đổi vai trò hoặc trạng thái của chính mình');
    }

    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    const set = (col: string, val: string | number | null) => {
      sets.push(`${col} = ?`);
      params.push(val);
    };
    if (b.name !== undefined) {
      const name = str(b.name);
      if (!name) throw new HttpError(400, 'Họ tên là bắt buộc');
      set('name', name);
    }
    for (const [key, col] of [['email', 'email'], ['phone', 'phone'], ['position', 'position'], ['avatarUrl', 'avatar_url']] as const) {
      if (b[key] !== undefined) set(col, str(b[key]) ?? '');
    }
    if (b.hanetPersonId !== undefined) set('hanet_person_id', str(b.hanetPersonId) || null);
    if (b.faceRegistered !== undefined) set('face_registered', b.faceRegistered ? 1 : 0);
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) throw new HttpError(400, 'Vai trò không hợp lệ');
      set('role', b.role);
    }
    if (b.status !== undefined) {
      if (b.status !== 'active' && b.status !== 'inactive') throw new HttpError(400, 'Trạng thái không hợp lệ');
      set('status', b.status);
    }
    if (b.departmentId !== undefined) set('department_id', resolveDepartment(db, b.departmentId));

    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, target.id);
    if (b.status === 'inactive' && target.status !== 'inactive') deleteUserSessions(db, target.id);
    res.json({ user: getUser(db, target.id) });
  });

  r.post('/users/:id/reset-password', requireRole('hr'), (req, res) => {
    const actor = currentUser(req);
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    const tempPassword = generateTempPassword();
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(tempPassword), target.id);
    deleteUserSessions(db, target.id);
    console.warn(`[SECURITY] password_reset by=${actor.code} target=${target.code} ip=${req.ip}`);
    res.json({ tempPassword });
  });

  return r;
}
```

- [ ] **Step 4: Tạo `server/routes/departments.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError } from '../errors';
import { requireRole } from '../middleware';
import type { Row } from '../repo';
import { CODE_RE } from './users';
import { toVnDate } from '../vntime';
import type { Department } from '../../shared/types';

const DEPT_SELECT = `SELECT d.id, d.code, d.name, d.description, d.manager_id, m.name AS manager_name, d.created_at,
  (SELECT COUNT(*) FROM users x WHERE x.department_id = d.id) AS member_count
  FROM departments d LEFT JOIN users m ON m.id = d.manager_id`;

function mapDept(r: Row): Department {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description ?? '',
    managerId: r.manager_id ?? null,
    managerName: r.manager_name ?? null,
    memberCount: Number(r.member_count),
    createdAt: r.created_at,
  };
}

function getDept(db: Db, id: string): Department | null {
  const row = db.prepare(`${DEPT_SELECT} WHERE d.id = ?`).get(id) as Row | undefined;
  return row ? mapDept(row) : null;
}

function resolveManager(db: Db, managerId: unknown): string | null {
  if (managerId === undefined || managerId === null || managerId === '') return null;
  if (typeof managerId !== 'string' || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(managerId)) {
    throw new HttpError(400, 'Trưởng phòng được chọn không tồn tại');
  }
  return managerId;
}

export function departmentRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/departments', (_req, res) => {
    const rows = db.prepare(`${DEPT_SELECT} ORDER BY d.code`).all() as Row[];
    res.json({ departments: rows.map(mapDept) });
  });

  r.post('/departments', requireRole('hr'), (req, res) => {
    const b = req.body ?? {};
    const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!CODE_RE.test(code)) throw new HttpError(400, 'Mã phòng ban không hợp lệ');
    if (!name) throw new HttpError(400, 'Tên phòng ban là bắt buộc');
    const managerId = resolveManager(db, b.managerId);
    if (db.prepare('SELECT 1 FROM departments WHERE code = ?').get(code)) throw new HttpError(409, 'Mã phòng ban đã tồn tại');
    const id = newId('dep');
    db.prepare('INSERT INTO departments(id, code, name, description, manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      code,
      name,
      typeof b.description === 'string' ? b.description.trim() : '',
      managerId,
      toVnDate(ctx.now()),
    );
    res.json({ department: getDept(db, id) });
  });

  r.put('/departments/:id', requireRole('hr'), (req, res) => {
    const dept = getDept(db, req.params.id);
    if (!dept) throw new HttpError(404, 'Không tìm thấy phòng ban');
    const b = req.body ?? {};
    if (b.name !== undefined) {
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) throw new HttpError(400, 'Tên phòng ban là bắt buộc');
      db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name, dept.id);
    }
    if (b.description !== undefined) {
      db.prepare('UPDATE departments SET description = ? WHERE id = ?').run(typeof b.description === 'string' ? b.description.trim() : '', dept.id);
    }
    if (b.managerId !== undefined) {
      db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(resolveManager(db, b.managerId), dept.id);
    }
    res.json({ department: getDept(db, dept.id) });
  });

  return r;
}
```

- [ ] **Step 5: Gắn router vào `server/app.ts`**

Thêm import:

```ts
import { userRoutes } from './routes/users';
import { departmentRoutes } from './routes/departments';
```

Sau dòng `api.use(authRoutes(ctx));` thêm:

```ts
  api.use(userRoutes(ctx));
  api.use(departmentRoutes(ctx));
```

- [ ] **Step 6: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/routes/users.ts server/routes/departments.ts server/app.ts tests/users-routes.test.ts
git commit -m "feat(api): scoped users and departments endpoints with temp passwords

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: API camera, bảng công theo ngày, thống kê, giờ làm việc

**Files:**
- Create: `server/routes/cameras.ts`, `server/routes/attendance.ts`, `server/routes/settings.ts`, `tests/attendance-routes.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `addDetection` (Task 4 helpers); `recomputeRange` (Task 4); `getWorkSettings`, `validateWorkSettings`, `saveWorkSettings` (Task 4); `canSeeUser`, `getUser` (Task 5); `isValidDate`, `toVnDate`, `daysBetween` (Task 2)
- Produces:
  - `cameraRoutes(ctx)` — `GET /cameras` → `{ cameras }`, `POST /cameras` (HR) → `{ camera }`
  - `attendanceRoutes(ctx)` — `GET /attendance?date&departmentId&search` → `{ date, records: AttendanceDay[] }`; `GET /attendance/:userId/:date/detections` → `{ detections }`; `POST /attendance/recompute` (HR) `{from,to}` → `{ updated }`; `GET /stats` → `StatsData`
  - `settingsRoutes(ctx)` — `GET /settings/work`, `PUT /settings/work` (HR) → `{ settings }`

- [ ] **Step 1: Viết test thất bại `tests/attendance-routes.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, addDetection, type TestApp } from './helpers';
import { vnDateTimeToTs, toVnDate } from '../server/vntime';

const D = '2026-10-13';
const at = (hhmm: string, date = D) => vnDateTimeToTs(date, hhmm);
// "Bây giờ" là 2026-10-13 10:00 giờ VN
const NOW = at('10:00');

async function setup(): Promise<{ app: TestApp; kt: string; ids: Record<string, string> }> {
  const app = await startTestApp({ now: () => NOW });
  const kt = seedDepartment(app.db, 'KT', 'Kế toán');
  const kd = seedDepartment(app.db, 'KD', 'Kinh doanh');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv1: seedUser(app.db, { code: 'NV01', name: 'Nguyễn Văn An', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', name: 'Trần Thị Bình', departmentId: kd }),
    nv3: seedUser(app.db, { code: 'NV03', departmentId: kd }),
  };
  addDetection(app.db, ids.nv1, at('08:05'));
  addDetection(app.db, ids.nv1, at('08:06'), { deviceId: 'DEV2' });
  addDetection(app.db, ids.nv2, at('08:40'));
  return { app, kt, ids };
}

test('GET /attendance theo phạm vi và mặc định là hôm nay (giờ VN)', async () => {
  const { app } = await setup();
  try {
    const codes = (body: { records: { employeeCode: string }[] }) => body.records.map((r) => r.employeeCode).sort();
    const hr = await (await loginAs(app, 'HR01')).get('/api/attendance');
    assert.equal(hr.body.date, D);
    assert.deepEqual(codes(hr.body), ['NV01', 'NV02']);
    assert.deepEqual(codes((await (await loginAs(app, 'TP01')).get(`/api/attendance?date=${D}`)).body), ['NV01']);
    assert.deepEqual(codes((await (await loginAs(app, 'NV02')).get(`/api/attendance?date=${D}`)).body), ['NV02']);

    const row = hr.body.records.find((r: { employeeCode: string }) => r.employeeCode === 'NV02');
    assert.equal(row.status, 'missing_out');
    assert.equal(row.lateMinutes, 40);
    assert.equal(row.departmentName, 'Kinh doanh');
    assert.equal(row.firstIn, at('08:40'));
  } finally {
    await app.close();
  }
});

test('lọc phòng ban (chỉ HR), tìm kiếm có dấu, ngày sai định dạng', async () => {
  const { app, kt } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.get(`/api/attendance?date=${D}&departmentId=${kt}`)).body.records.length, 1);
    const s = await hr.get(`/api/attendance?date=${D}&search=${encodeURIComponent('bình')}`);
    assert.deepEqual(s.body.records.map((r: { employeeCode: string }) => r.employeeCode), ['NV02']);
    assert.equal((await hr.get('/api/attendance?date=13-10-2026')).status, 400);
    // Trưởng phòng truyền departmentId khác cũng không thoát được phạm vi
    const tp = await loginAs(app, 'TP01');
    const other = await tp.get(`/api/attendance?date=${D}&departmentId=dep-khac`);
    assert.deepEqual(other.body.records.map((r: { employeeCode: string }) => r.employeeCode), ['NV01']);
  } finally {
    await app.close();
  }
});

test('xem lượt nhận diện chi tiết theo phạm vi', async () => {
  const { app, ids } = await setup();
  try {
    const own = await (await loginAs(app, 'NV01')).get(`/api/attendance/${ids.nv1}/${D}/detections`);
    assert.equal(own.status, 200);
    assert.equal(own.body.detections.length, 2);
    assert.equal(own.body.detections[0].deviceId, 'DEV1');
    assert.equal((await (await loginAs(app, 'NV01')).get(`/api/attendance/${ids.nv2}/${D}/detections`)).status, 403);
    assert.equal((await (await loginAs(app, 'TP01')).get(`/api/attendance/${ids.nv2}/${D}/detections`)).status, 403);
    assert.equal((await (await loginAs(app, 'HR01')).get(`/api/attendance/usr-khong-co/${D}/detections`)).status, 404);
  } finally {
    await app.close();
  }
});

test('thống kê hôm nay theo người, không theo lượt quẹt', async () => {
  const { app } = await setup();
  try {
    const hr = (await (await loginAs(app, 'HR01')).get('/api/stats')).body;
    assert.deepEqual(hr, {
      date: D,
      totalEmployees: 5,
      presentCount: 2,
      onTimeCount: 1,
      lateCount: 1,
      missingOutCount: 2,
      notCheckedInCount: 3,
      pendingRequests: 0,
      totalCameras: 0,
    });
    const tp = (await (await loginAs(app, 'TP01')).get('/api/stats')).body;
    assert.equal(tp.totalEmployees, 2);
    assert.equal(tp.presentCount, 1);
    const nv = (await (await loginAs(app, 'NV03')).get('/api/stats')).body;
    assert.equal(nv.totalEmployees, 1);
    assert.equal(nv.notCheckedInCount, 1);
  } finally {
    await app.close();
  }
});

test('giờ làm việc: HR đọc/sửa, dữ liệu sai 400, tính lại áp dụng giờ mới', async () => {
  const { app } = await setup();
  try {
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.get('/api/settings/work')).status, 403);
    const hr = await loginAs(app, 'HR01');
    assert.deepEqual((await hr.get('/api/settings/work')).body.settings, { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 });
    assert.equal((await hr.put('/api/settings/work', { workStart: '25:00', lateGraceMinutes: 0, workEnd: '17:00', minOutGapMinutes: 30 })).status, 400);
    const ok = await hr.put('/api/settings/work', { workStart: '08:00', lateGraceMinutes: 0, workEnd: '17:00', minOutGapMinutes: 30 });
    assert.equal(ok.status, 200);

    assert.equal((await nv.post('/api/attendance/recompute', { from: D, to: D })).status, 403);
    assert.equal((await hr.post('/api/attendance/recompute', { from: D, to: '2026-10-12' })).status, 400);
    assert.equal((await hr.post('/api/attendance/recompute', { from: '2026-01-01', to: D })).status, 400, 'quá 92 ngày');
    const rc = await hr.post('/api/attendance/recompute', { from: D, to: D });
    assert.equal(rc.status, 200);
    assert.equal(rc.body.updated, 2);
    const nv1 = (await hr.get(`/api/attendance?date=${D}&search=NV01`)).body.records[0];
    assert.equal(nv1.lateMinutes, 5);
  } finally {
    await app.close();
  }
});

test('camera: mọi vai trò xem, HR thêm, trùng mã thiết bị 409', async () => {
  const { app } = await setup();
  try {
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.post('/api/cameras', { name: 'Cửa', deviceKey: 'C1' })).status, 403);
    const hr = await loginAs(app, 'HR01');
    const c = await hr.post('/api/cameras', { name: 'Cửa chính', deviceKey: 'C20371B239', placeId: '143', placeName: 'Trụ sở' });
    assert.equal(c.status, 200);
    assert.equal(c.body.camera.placeId, 143);
    assert.equal((await hr.post('/api/cameras', { name: 'Trùng', deviceKey: 'C20371B239' })).status, 409);
    assert.equal((await hr.post('/api/cameras', { name: '', deviceKey: 'X' })).status, 400);
    assert.equal((await nv.get('/api/cameras')).body.cameras.length, 1);
  } finally {
    await app.close();
  }
});

test('toVnDate dùng cho mặc định ngày khớp với NOW', () => {
  assert.equal(toVnDate(NOW), D);
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL (route chưa có).

- [ ] **Step 3: Tạo `server/routes/cameras.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { newId } from '../db';
import { HttpError } from '../errors';
import { requireRole } from '../middleware';
import type { Row } from '../repo';
import type { Camera } from '../../shared/types';

function mapCamera(r: Row): Camera {
  return {
    id: r.id,
    name: r.name,
    deviceKey: r.device_key,
    placeId: r.place_id ?? null,
    placeName: r.place_name ?? '',
    location: r.location ?? '',
    ipAddress: r.ip_address ?? '',
    createdAt: r.created_at,
  };
}

export function cameraRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/cameras', (_req, res) => {
    res.json({ cameras: (db.prepare('SELECT * FROM cameras ORDER BY name').all() as Row[]).map(mapCamera) });
  });

  r.post('/cameras', requireRole('hr'), (req, res) => {
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = text(b.name);
    const deviceKey = text(b.deviceKey);
    if (!name || !deviceKey) throw new HttpError(400, 'Tên camera và mã thiết bị là bắt buộc');
    const placeId = b.placeId === undefined || b.placeId === '' || b.placeId === null ? null : Number(b.placeId);
    if (placeId !== null && (!Number.isInteger(placeId) || placeId <= 0)) throw new HttpError(400, 'Place ID không hợp lệ');
    if (db.prepare('SELECT 1 FROM cameras WHERE device_key = ?').get(deviceKey)) throw new HttpError(409, 'Mã thiết bị đã tồn tại');
    const id = newId('cam');
    db.prepare(
      'INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, name, deviceKey, placeId, text(b.placeName), text(b.location), text(b.ipAddress), new Date(ctx.now()).toISOString());
    res.json({ camera: mapCamera(db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) as Row) });
  });

  return r;
}
```

- [ ] **Step 4: Tạo `server/routes/attendance.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { canSeeUser, getUser, type Row } from '../repo';
import { scopeFor, scopeWhere } from '../auth';
import { recomputeRange } from '../attendance';
import { daysBetween, isValidDate, toVnDate } from '../vntime';
import type { AttendanceDay, Detection, StatsData } from '../../shared/types';

const DAY_SELECT = `SELECT a.*, u.code AS employee_code, u.name AS employee_name, u.avatar_url, u.department_id,
  d.name AS department_name
  FROM attendance_days a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id`;

function mapDay(r: Row): AttendanceDay {
  return {
    userId: r.user_id,
    employeeCode: r.employee_code,
    employeeName: r.employee_name,
    avatarUrl: r.avatar_url ?? '',
    departmentId: r.department_id ?? null,
    departmentName: r.department_name ?? null,
    workDate: r.work_date,
    firstIn: r.first_in,
    lastOut: r.last_out ?? null,
    lateMinutes: r.late_minutes,
    earlyMinutes: r.early_minutes,
    status: r.status,
    lateExcused: r.late_excused === 1,
    manualIn: r.manual_in ?? null,
    manualOut: r.manual_out ?? null,
    detectionCount: r.detection_count,
  };
}

export const MAX_RECOMPUTE_DAYS = 92;

export function attendanceRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/attendance', (req, res) => {
    const user = currentUser(req);
    const date = req.query.date === undefined || req.query.date === '' ? toVnDate(ctx.now()) : req.query.date;
    if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const w = scopeWhere(scopeFor(user), 'u.id', 'u.department_id');
    let sql = `${DAY_SELECT} WHERE a.work_date = ? AND ${w.sql}`;
    const params: string[] = [date, ...w.params];
    const departmentId = req.query.departmentId;
    if (user.role === 'hr' && typeof departmentId === 'string' && departmentId) {
      sql += ' AND u.department_id = ?';
      params.push(departmentId);
    }
    let records = (db.prepare(`${sql} ORDER BY a.first_in`).all(...params) as Row[]).map(mapDay);
    const q = typeof req.query.search === 'string' ? req.query.search.trim().toLocaleLowerCase('vi') : '';
    if (q) {
      records = records.filter(
        (x) => x.employeeName.toLocaleLowerCase('vi').includes(q) || x.employeeCode.toLocaleLowerCase('vi').includes(q),
      );
    }
    res.json({ date, records });
  });

  r.get('/attendance/:userId/:date/detections', (req, res) => {
    const target = getUser(db, req.params.userId);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    if (!canSeeUser(currentUser(req), target)) throw new HttpError(403, 'Bạn không có quyền xem dữ liệu này');
    if (!isValidDate(req.params.date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const rows = db
      .prepare('SELECT id, device_id, device_name, place_id, ts, image_url, source FROM detections WHERE user_id = ? AND work_date = ? ORDER BY ts')
      .all(target.id, req.params.date) as Row[];
    const detections: Detection[] = rows.map((x) => ({
      id: x.id,
      deviceId: x.device_id,
      deviceName: x.device_name ?? null,
      placeId: x.place_id ?? null,
      ts: x.ts,
      imageUrl: x.image_url ?? null,
      source: x.source,
    }));
    res.json({ detections });
  });

  r.post('/attendance/recompute', requireRole('hr'), (req, res) => {
    const { from, to } = req.body ?? {};
    if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const span = daysBetween(from, to);
    if (span < 0) throw new HttpError(400, 'Ngày bắt đầu phải trước ngày kết thúc');
    if (span >= MAX_RECOMPUTE_DAYS) throw new HttpError(400, `Mỗi lần chỉ tính lại tối đa ${MAX_RECOMPUTE_DAYS} ngày`);
    res.json({ updated: recomputeRange(db, from, to) });
  });

  r.get('/stats', (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), 'u.id', 'u.department_id');
    const date = toVnDate(ctx.now());
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE u.status = 'active' AND ${w.sql}`).get(...w.params) as { c: number };
    const day = db
      .prepare(
        `SELECT COUNT(*) AS present,
           SUM(CASE WHEN a.late_minutes = 0 THEN 1 ELSE 0 END) AS on_time,
           SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late,
           SUM(CASE WHEN a.status = 'missing_out' THEN 1 ELSE 0 END) AS missing_out
         FROM attendance_days a JOIN users u ON u.id = a.user_id
         WHERE a.work_date = ? AND u.status = 'active' AND ${w.sql}`,
      )
      .get(date, ...w.params) as { present: number; on_time: number | null; late: number | null; missing_out: number | null };
    const pending = db
      .prepare(`SELECT COUNT(*) AS c FROM requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' AND ${w.sql}`)
      .get(...w.params) as { c: number };
    const cameras = db.prepare('SELECT COUNT(*) AS c FROM cameras').get() as { c: number };
    const body: StatsData = {
      date,
      totalEmployees: total.c,
      presentCount: day.present,
      onTimeCount: day.on_time ?? 0,
      lateCount: day.late ?? 0,
      missingOutCount: day.missing_out ?? 0,
      notCheckedInCount: Math.max(0, total.c - day.present),
      pendingRequests: pending.c,
      totalCameras: cameras.c,
    };
    res.json(body);
  });

  return r;
}
```

- [ ] **Step 5: Tạo `server/routes/settings.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { requireRole } from '../middleware';
import { getWorkSettings, saveWorkSettings, validateWorkSettings } from '../settings';

export function settingsRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/settings/work', requireRole('hr'), (_req, res) => {
    res.json({ settings: getWorkSettings(db) });
  });

  r.put('/settings/work', requireRole('hr'), (req, res) => {
    saveWorkSettings(db, validateWorkSettings(req.body));
    res.json({ settings: getWorkSettings(db) });
  });

  return r;
}
```

- [ ] **Step 6: Gắn router vào `server/app.ts`**

Thêm import:

```ts
import { cameraRoutes } from './routes/cameras';
import { attendanceRoutes } from './routes/attendance';
import { settingsRoutes } from './routes/settings';
```

Sau `api.use(departmentRoutes(ctx));` thêm:

```ts
  api.use(cameraRoutes(ctx));
  api.use(attendanceRoutes(ctx));
  api.use(settingsRoutes(ctx));
```

- [ ] **Step 7: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/routes/cameras.ts server/routes/attendance.ts server/routes/settings.ts server/app.ts tests/attendance-routes.test.ts
git commit -m "feat(api): daily attendance, detections, stats, cameras and work settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: API đơn giải trình / quên quẹt / xin nghỉ

**Files:**
- Create: `server/routes/requests.ts`, `tests/requests-routes.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `applyDayAdjustment` (Task 4); `tx`, `newId` (Task 1); `parseHHmm`, `vnDateTimeToTs`, `isValidDate`, `toVnDate` (Task 2); `currentUser`, `requireRole` (Task 5)
- Produces: `requestRoutes(ctx)` — `GET /requests` → `{ requests }`; `POST /requests` → `{ request }`; `PUT /requests/:id` `{status, comment?}` → `{ request }`

- [ ] **Step 1: Viết test thất bại `tests/requests-routes.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, addDetection, type TestApp } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';

const D = '2026-10-13';
const at = (hhmm: string, date = D) => vnDateTimeToTs(date, hhmm);
const NOW = at('20:00');

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp({ now: () => NOW });
  const kt = seedDepartment(app.db, 'KT');
  const kd = seedDepartment(app.db, 'KD');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    tp2: seedUser(app.db, { code: 'TP02', role: 'dept_manager', departmentId: kd }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: kt }),
  };
  return { app, ids };
}

const dayStatus = (app: TestApp, userId: string, date = D) =>
  (app.db.prepare('SELECT status, late_minutes, last_out FROM attendance_days WHERE user_id = ? AND work_date = ?').get(userId, date) as
    | { status: string; late_minutes: number; last_out: number | null }
    | undefined);

test('nhân viên gửi đơn; kiểm tra dữ liệu', async () => {
  const { app } = await setup();
  try {
    const nv = await loginAs(app, 'NV01');
    const ok = await nv.post('/api/requests', { workDate: D, type: 'late_explanation', reason: 'Tắc đường' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.request.status, 'pending');
    assert.equal(ok.body.request.employeeCode, 'NV01');
    assert.equal(ok.body.request.suggestedIn, null);

    assert.equal((await nv.post('/api/requests', { workDate: '2026-10-14', type: 'late_explanation', reason: 'x' })).status, 400, 'ngày tương lai');
    assert.equal((await nv.post('/api/requests', { workDate: D, type: 'late_explanation', reason: '  ' })).status, 400);
    assert.equal((await nv.post('/api/requests', { workDate: D, type: 'other', reason: 'x' })).status, 400);
    assert.equal((await nv.post('/api/requests', { workDate: D, type: 'missed_punch', reason: 'x' })).status, 400, 'quên quẹt cần giờ');
    assert.equal((await nv.post('/api/requests', { workDate: D, type: 'missed_punch', reason: 'x', suggestedIn: '8h' })).status, 400);
  } finally {
    await app.close();
  }
});

test('danh sách đơn theo phạm vi', async () => {
  const { app } = await setup();
  try {
    await (await loginAs(app, 'NV01')).post('/api/requests', { workDate: D, type: 'leave_request', reason: 'Việc nhà' });
    assert.equal((await (await loginAs(app, 'TP01')).get('/api/requests')).body.requests.length, 1);
    assert.equal((await (await loginAs(app, 'TP02')).get('/api/requests')).body.requests.length, 0);
    assert.equal((await (await loginAs(app, 'HR01')).get('/api/requests')).body.requests.length, 1);
  } finally {
    await app.close();
  }
});

test('duyệt giải trình muộn → ngày công thành đúng giờ; duyệt lại 409', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at('08:40'));
    addDetection(app.db, ids.nv1, at('17:05'));
    assert.equal(dayStatus(app, ids.nv1)!.status, 'late');
    const req = (await (await loginAs(app, 'NV01')).post('/api/requests', { workDate: D, type: 'late_explanation', reason: 'Tắc đường' })).body.request;

    assert.equal((await (await loginAs(app, 'NV01')).put(`/api/requests/${req.id}`, { status: 'approved' })).status, 403);
    assert.equal((await (await loginAs(app, 'TP02')).put(`/api/requests/${req.id}`, { status: 'approved' })).status, 403);
    const tp = await loginAs(app, 'TP01');
    assert.equal((await tp.put(`/api/requests/${req.id}`, { status: 'maybe' })).status, 400);
    const ok = await tp.put(`/api/requests/${req.id}`, { status: 'approved', comment: 'Đồng ý' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.request.status, 'approved');
    assert.equal(ok.body.request.reviewerName, 'TP01');
    assert.equal(ok.body.request.comment, 'Đồng ý');
    const day = dayStatus(app, ids.nv1)!;
    assert.equal(day.status, 'on_time');
    assert.equal(day.late_minutes, 0);
    assert.equal((await tp.put(`/api/requests/${req.id}`, { status: 'rejected' })).status, 409);
  } finally {
    await app.close();
  }
});

test('không ai được tự duyệt đơn của mình', async () => {
  const { app } = await setup();
  try {
    const tp = await loginAs(app, 'TP01');
    const req = (await tp.post('/api/requests', { workDate: D, type: 'leave_request', reason: 'Nghỉ' })).body.request;
    const r = await tp.put(`/api/requests/${req.id}`, { status: 'approved' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'Không thể tự duyệt đơn của mình');
  } finally {
    await app.close();
  }
});

test('duyệt quên quẹt bổ sung giờ ra', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at('07:58'));
    assert.equal(dayStatus(app, ids.nv1)!.status, 'missing_out');
    const req = (await (await loginAs(app, 'NV01')).post('/api/requests', { workDate: D, type: 'missed_punch', reason: 'Quên quẹt', suggestedOut: '17:30' })).body.request;
    assert.equal(req.suggestedOut, '17:30');
    assert.equal((await (await loginAs(app, 'HR01')).put(`/api/requests/${req.id}`, { status: 'approved' })).status, 200);
    const day = dayStatus(app, ids.nv1)!;
    assert.equal(day.status, 'on_time');
    assert.equal(day.last_out, at('17:30'));
  } finally {
    await app.close();
  }
});

test('quên quẹt cho ngày không có lượt nào mà thiếu giờ vào → 400, đơn vẫn chờ duyệt', async () => {
  const { app, ids } = await setup();
  try {
    const req = (await (await loginAs(app, 'NV01')).post('/api/requests', { workDate: '2026-10-12', type: 'missed_punch', reason: 'x', suggestedOut: '17:00' })).body.request;
    const hr = await loginAs(app, 'HR01');
    const r = await hr.put(`/api/requests/${req.id}`, { status: 'approved' });
    assert.equal(r.status, 400);
    assert.equal((await hr.get('/api/requests')).body.requests[0].status, 'pending');
    assert.equal(dayStatus(app, ids.nv1, '2026-10-12'), undefined);
  } finally {
    await app.close();
  }
});

test('từ chối và duyệt nghỉ phép không đổi dữ liệu công', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at('08:40'));
    const nv = await loginAs(app, 'NV01');
    const late = (await nv.post('/api/requests', { workDate: D, type: 'late_explanation', reason: 'x' })).body.request;
    const leave = (await nv.post('/api/requests', { workDate: D, type: 'leave_request', reason: 'y' })).body.request;
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.put(`/api/requests/${late.id}`, { status: 'rejected' })).status, 200);
    assert.equal((await hr.put(`/api/requests/${leave.id}`, { status: 'approved' })).status, 200);
    assert.equal(dayStatus(app, ids.nv1)!.late_minutes, 40);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL (route chưa có).

- [ ] **Step 3: Tạo `server/routes/requests.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId, tx } from '../db';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import type { Row } from '../repo';
import { scopeFor, scopeWhere } from '../auth';
import { applyDayAdjustment, type DayAdjustment } from '../attendance';
import { isValidDate, parseHHmm, toVnDate, vnDateTimeToTs } from '../vntime';
import type { AttendanceRequest, RequestType } from '../../shared/types';

const TYPES: RequestType[] = ['missed_punch', 'late_explanation', 'leave_request'];

const REQUEST_SELECT = `SELECT r.*, u.name AS employee_name, u.code AS employee_code, u.department_id, rv.name AS reviewer_name
  FROM requests r JOIN users u ON u.id = r.user_id LEFT JOIN users rv ON rv.id = r.reviewed_by`;

function mapRequest(r: Row): AttendanceRequest {
  return {
    id: r.id,
    userId: r.user_id,
    employeeName: r.employee_name,
    employeeCode: r.employee_code,
    departmentId: r.department_id ?? null,
    workDate: r.work_date,
    type: r.type,
    reason: r.reason,
    suggestedIn: r.suggested_in ?? null,
    suggestedOut: r.suggested_out ?? null,
    status: r.status,
    reviewedBy: r.reviewed_by ?? null,
    reviewerName: r.reviewer_name ?? null,
    reviewedAt: r.reviewed_at ?? null,
    comment: r.comment ?? null,
    createdAt: r.created_at,
  };
}

function getRequest(db: Db, id: string): AttendanceRequest | null {
  const row = db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
  return row ? mapRequest(row) : null;
}

function optionalTime(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  try {
    parseHHmm(String(v));
  } catch {
    throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
  }
  return String(v);
}

export function requestRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/requests', (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), 'u.id', 'u.department_id');
    const rows = db.prepare(`${REQUEST_SELECT} WHERE ${w.sql} ORDER BY r.created_at DESC`).all(...w.params) as Row[];
    res.json({ requests: rows.map(mapRequest) });
  });

  r.post('/requests', (req, res) => {
    const user = currentUser(req);
    const b = req.body ?? {};
    if (!isValidDate(b.workDate)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    if (b.workDate > toVnDate(ctx.now())) throw new HttpError(400, 'Không thể gửi đơn cho ngày trong tương lai');
    if (!TYPES.includes(b.type)) throw new HttpError(400, 'Loại đơn không hợp lệ');
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (!reason) throw new HttpError(400, 'Vui lòng nhập lý do');
    let suggestedIn: string | null = null;
    let suggestedOut: string | null = null;
    if (b.type === 'missed_punch') {
      suggestedIn = optionalTime(b.suggestedIn, 'Giờ vào đề xuất');
      suggestedOut = optionalTime(b.suggestedOut, 'Giờ ra đề xuất');
      if (!suggestedIn && !suggestedOut) throw new HttpError(400, 'Đơn quên quẹt cần ít nhất giờ vào hoặc giờ ra đề xuất');
    }
    const id = newId('req');
    db.prepare(
      `INSERT INTO requests(id, user_id, work_date, type, reason, suggested_in, suggested_out, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(id, user.id, b.workDate, b.type, reason, suggestedIn, suggestedOut, new Date(ctx.now()).toISOString());
    res.json({ request: getRequest(db, id) });
  });

  r.put('/requests/:id', requireRole('hr', 'dept_manager'), (req, res) => {
    const reviewer = currentUser(req);
    const target = getRequest(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy đơn');
    if (target.userId === reviewer.id) throw new HttpError(403, 'Không thể tự duyệt đơn của mình');
    if (reviewer.role === 'dept_manager' && (!reviewer.departmentId || target.departmentId !== reviewer.departmentId)) {
      throw new HttpError(403, 'Trưởng phòng chỉ được duyệt đơn của phòng mình');
    }
    const { status, comment } = req.body ?? {};
    if (status !== 'approved' && status !== 'rejected') throw new HttpError(400, 'Trạng thái duyệt không hợp lệ');
    if (target.status !== 'pending') throw new HttpError(409, 'Đơn đã được xử lý');

    tx(db, () => {
      db.prepare('UPDATE requests SET status = ?, comment = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?').run(
        status,
        typeof comment === 'string' ? comment.trim() : '',
        reviewer.id,
        new Date(ctx.now()).toISOString(),
        target.id,
      );
      if (status !== 'approved') return;
      if (target.type === 'late_explanation') {
        applyDayAdjustment(db, target.userId, target.workDate, { lateExcused: true });
      } else if (target.type === 'missed_punch') {
        const hasDetection = db.prepare('SELECT 1 FROM detections WHERE user_id = ? AND work_date = ? LIMIT 1').get(target.userId, target.workDate);
        if (!target.suggestedIn && !hasDetection) {
          throw new HttpError(400, 'Ngày này chưa có lượt nhận diện, đơn quên quẹt cần có giờ vào đề xuất');
        }
        const patch: Partial<DayAdjustment> = {};
        if (target.suggestedIn) patch.manualIn = vnDateTimeToTs(target.workDate, target.suggestedIn);
        if (target.suggestedOut) patch.manualOut = vnDateTimeToTs(target.workDate, target.suggestedOut);
        applyDayAdjustment(db, target.userId, target.workDate, patch);
      }
      // leave_request: chỉ đổi trạng thái đơn (nghỉ phép đầy đủ làm ở dự án sau)
    });
    res.json({ request: getRequest(db, target.id) });
  });

  return r;
}
```

- [ ] **Step 4: Gắn router vào `server/app.ts`**

Thêm import `import { requestRoutes } from './routes/requests';` và sau `api.use(settingsRoutes(ctx));` thêm:

```ts
  api.use(requestRoutes(ctx));
```

- [ ] **Step 5: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/requests.ts server/app.ts tests/requests-routes.test.ts
git commit -m "feat(api): requests with per-type approval effects on attendance days

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Webhook Hanet có token, ghi lượt nhận diện, cấu hình Hanet, mô phỏng

**Files:**
- Create: `server/hanet.ts`, `server/routes/hanet.ts`, `tests/hanet.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `recomputeDay` (Task 4); `getSetting`, `setSetting` (Task 4); `safeEqualStrings` (Task 3); `tx` (Task 1); `toVnDate`, `vnDateTimeToTs`, `isValidDate` (Task 2); `getUser` (Task 5)
- Produces (`server/hanet.ts`):
  - `interface CheckinInput { personId: string | null; aliasId: string | null; personName: string | null; personType: number | null; deviceId: string; deviceName: string | null; placeId: number | null; ts: number; imageUrl: string | null }`
  - `normalizeTs(raw: number | null, now: number): { ts: number; fromServer: boolean }`
  - `parseCheckin(body: unknown, now: number): { input: CheckinInput; note: string | null } | null`
  - `interface IngestResult { status: 'success' | 'ignored' | 'duplicate'; message: string; userId?: string }`
  - `ingestCheckin(db, input, source: DetectionSource): IngestResult`
  - `WEBHOOK_LOG_LIMIT = 500`; `logWebhook(db, entry, now)`
  - `getWebhookToken(db): string`; `rotateWebhookToken(db): string`
  - `mask(v?: string): string`; `HANET_DEFAULT_API_BASE`; `getPlaceIds(db): number[]`; `reconcileEnabled(db): boolean`
  - `getHanetConfigView(db): HanetConfigView`; `updateHanetConfig(db, body: unknown): void`
- Produces (`server/routes/hanet.ts`): `hanetPublicRoutes(ctx)` (POST `/hanet/webhook/:token`, mọi method `/hanet/webhook` → 404); `hanetRoutes(ctx)` (HR: GET/PUT `/hanet/config`, POST `/hanet/webhook-token/rotate`, GET `/hanet/webhook-logs`, POST `/hanet/simulate`). Task 10 thêm `POST /hanet/reconcile` vào `hanetRoutes`.

- [ ] **Step 1: Viết test thất bại `tests/hanet.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs, Client, freshDb, type TestApp } from './helpers';
import { parseCheckin, normalizeTs, logWebhook, getWebhookToken, WEBHOOK_LOG_LIMIT } from '../server/hanet';
import { vnDateTimeToTs } from '../server/vntime';

const D = '2026-10-13';
const T0830 = vnDateTimeToTs(D, '08:30'); // 1791855000000

async function setup(config: { simulatorEnabled?: boolean } = {}): Promise<{ app: TestApp; url: string; ids: Record<string, string> }> {
  const app = await startTestApp({ config });
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    nv1: seedUser(app.db, { code: 'PLX-NV01', hanetPersonId: '2134589559210508288' }),
    off: seedUser(app.db, { code: 'NV-NGHI', status: 'inactive' }),
  };
  return { app, url: `/api/hanet/webhook/${getWebhookToken(app.db)}`, ids };
}

const days = (app: TestApp, userId: string) =>
  app.db.prepare('SELECT work_date, first_in, detection_count FROM attendance_days WHERE user_id = ?').all(userId) as {
    work_date: string;
    first_in: number;
    detection_count: number;
  }[];
const lastLog = (app: TestApp) => app.db.prepare('SELECT status, message FROM webhook_logs ORDER BY id DESC LIMIT 1').get() as { status: string; message: string };

test('normalizeTs và parseCheckin (đơn vị thuần)', () => {
  assert.deepEqual(normalizeTs(T0830, 1), { ts: T0830, fromServer: false });
  assert.deepEqual(normalizeTs(T0830 / 1000, 1), { ts: T0830, fromServer: false });
  assert.deepEqual(normalizeTs(null, 99), { ts: 99, fromServer: true });
  assert.equal(parseCheckin({ action: 'checkin', data: { personName: 'Chỉ có tên', deviceID: 'C1' } }, 0), null);
  assert.equal(parseCheckin('rác', 0), null);
  const nested = parseCheckin({ action: 'checkin', data: { aliasID: 'x', deviceID: 'C1', time: T0830 } }, 0)!;
  assert.equal(nested.input.aliasId, 'x');
  assert.equal(nested.note, null);
  const noTime = parseCheckin({ aliasID: 'x', deviceID: 'C1' }, 42)!;
  assert.equal(noTime.input.ts, 42);
  assert.equal(noTime.note, 'Thiếu thời gian từ Hanet, dùng giờ nhận');
});

test('sai token → 401 và ghi log rejected; thiếu token → 404', async () => {
  const { app } = await setup();
  try {
    const c = new Client(app.baseUrl);
    const r = await c.post('/api/hanet/webhook/sai-token', { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 });
    assert.equal(r.status, 401);
    assert.equal(lastLog(app).status, 'rejected');
    assert.equal((await c.post('/api/hanet/webhook', {})).status, 404);
  } finally {
    await app.close();
  }
});

test('payload JSON lồng (data) tạo lượt nhận diện và dòng ngày công', async () => {
  const { app, url, ids } = await setup();
  try {
    const r = await new Client(app.baseUrl).post(url, {
      action: 'checkin',
      data: { aliasID: 'PLX-NV01', personName: 'A', deviceID: 'C1', deviceName: 'Cửa chính', placeID: 143, time: T0830, detected_image_url: 'https://img/1.jpg' },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { returnCode: 1, returnMessage: 'success' });
    assert.deepEqual(days(app, ids.nv1), [{ work_date: D, first_in: T0830, detection_count: 1 }]);
    assert.equal(lastLog(app).status, 'success');
  } finally {
    await app.close();
  }
});

test('Review Focus #1: form-urlencoded với số dạng chuỗi', async () => {
  const { app, url, ids } = await setup();
  try {
    const res = await fetch(app.baseUrl + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data_type: 'log', aliasID: 'PLX-NV01', personType: '0', deviceID: 'C1', placeID: '143', time: String(T0830) }).toString(),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(days(app, ids.nv1), [{ work_date: D, first_in: T0830, detection_count: 1 }]);
    const det = app.db.prepare('SELECT place_id FROM detections').get() as { place_id: number };
    assert.equal(det.place_id, 143);
  } finally {
    await app.close();
  }
});

test('Review Focus #2: time tính bằng giây', async () => {
  const { app, url, ids } = await setup();
  try {
    await new Client(app.baseUrl).post(url, { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 / 1000 });
    assert.equal(days(app, ids.nv1)[0].first_in, T0830);
  } finally {
    await app.close();
  }
});

test('Review Focus #3: aliasID chữ thường có khoảng trắng vẫn khớp; khớp theo personID', async () => {
  const { app, url, ids } = await setup();
  try {
    const c = new Client(app.baseUrl);
    await c.post(url, { aliasID: '  plx-nv01 ', deviceID: 'C1', time: T0830 });
    await c.post(url, { personID: '2134589559210508288', deviceID: 'C1', time: T0830 + 3_600_000 });
    assert.equal(days(app, ids.nv1)[0].detection_count, 2);
  } finally {
    await app.close();
  }
});

test('Review Focus #4: nhân viên inactive, người lạ, mã không tồn tại → bỏ qua', async () => {
  const { app, url, ids } = await setup();
  try {
    const c = new Client(app.baseUrl);
    await c.post(url, { aliasID: 'NV-NGHI', deviceID: 'C1', time: T0830 });
    assert.equal(lastLog(app).message, 'Nhân viên đã ngừng hoạt động');
    await c.post(url, { aliasID: 'PLX-NV01', personType: 2, deviceID: 'C1', time: T0830 });
    assert.equal(lastLog(app).message, 'Không phải nhân viên');
    const r = await c.post(url, { aliasID: 'KHONG-CO', personName: 'PLX-NV01', deviceID: 'C1', time: T0830 });
    assert.equal(r.status, 200);
    assert.equal(lastLog(app).status, 'ignored');
    assert.deepEqual(days(app, ids.off), []);
    assert.deepEqual(days(app, ids.nv1), [], 'không khớp theo tên');
  } finally {
    await app.close();
  }
});

test('gửi trùng không tạo thêm lượt', async () => {
  const { app, url, ids } = await setup();
  try {
    const c = new Client(app.baseUrl);
    const body = { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 };
    await c.post(url, body);
    const r = await c.post(url, body);
    assert.equal(r.body.returnMessage, 'duplicate');
    assert.equal(days(app, ids.nv1)[0].detection_count, 1);
  } finally {
    await app.close();
  }
});

test('cấu hình Hanet: chỉ HR, che secret, ô trống giữ giá trị cũ, tạo token mới', async () => {
  const { app, url } = await setup();
  try {
    assert.equal((await (await loginAs(app, 'PLX-NV01')).get('/api/hanet/config')).status, 403);
    const hr = await loginAs(app, 'HR01');
    const saved = await hr.put('/api/hanet/config', { clientId: 'cid', clientSecret: 'secret-1234', accessToken: 'token-abcd', placeIds: [143, '200', 'x'] });
    assert.equal(saved.status, 200);
    const cfg = (await hr.get('/api/hanet/config')).body.config;
    assert.equal(cfg.clientId, 'cid');
    assert.equal(cfg.clientSecret, '••••1234');
    assert.equal(cfg.accessToken, '••••abcd');
    assert.deepEqual(cfg.placeIds, [143, 200]);
    assert.equal(cfg.webhookPath, url);
    assert.equal(JSON.stringify(cfg).includes('secret-1234'), false);

    await hr.put('/api/hanet/config', { clientSecret: '', accessToken: '••••abcd' });
    assert.equal((await hr.get('/api/hanet/config')).body.config.clientSecret, '••••1234');

    const rotated = await hr.post('/api/hanet/webhook-token/rotate');
    assert.notEqual(rotated.body.config.webhookPath, url);
    assert.equal((await new Client(app.baseUrl).post(url, { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 })).status, 401);
  } finally {
    await app.close();
  }
});

test('nhật ký webhook: chỉ HR xem', async () => {
  const { app, url } = await setup();
  try {
    await new Client(app.baseUrl).post(url, { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 });
    assert.equal((await (await loginAs(app, 'PLX-NV01')).get('/api/hanet/webhook-logs')).status, 403);
    const logs = (await (await loginAs(app, 'HR01')).get('/api/hanet/webhook-logs')).body.logs;
    assert.equal(logs.length, 1);
    assert.equal(logs[0].rawPayload.aliasID, 'PLX-NV01');
  } finally {
    await app.close();
  }
});

test('logWebhook giữ tối đa 500 dòng', () => {
  const db = freshDb();
  for (let i = 0; i < WEBHOOK_LOG_LIMIT + 5; i++) logWebhook(db, { status: 'ignored', message: String(i) }, i);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM webhook_logs').get() as { c: number }).c, WEBHOOK_LOG_LIMIT);
  assert.equal((db.prepare('SELECT message FROM webhook_logs ORDER BY id LIMIT 1').get() as { message: string }).message, '5');
});

test('mô phỏng: HR tạo lượt source=simulator; tắt thì 404', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/hanet/simulate', { userId: ids.nv1, date: D, time: '08:30' });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.status, 'success');
    assert.equal((app.db.prepare('SELECT source FROM detections').get() as { source: string }).source, 'simulator');
    assert.equal((await hr.post('/api/hanet/simulate', { userId: ids.nv1, time: '8h' })).status, 400);
    assert.equal((await (await loginAs(app, 'PLX-NV01')).post('/api/hanet/simulate', { userId: ids.nv1 })).status, 403);
  } finally {
    await app.close();
  }
  const off = await setup({ simulatorEnabled: false });
  try {
    const hr = await loginAs(off.app, 'HR01');
    assert.equal((await hr.post('/api/hanet/simulate', { userId: off.ids.nv1 })).status, 404);
  } finally {
    await off.app.close();
  }
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, không tìm thấy `../server/hanet`.

- [ ] **Step 3: Tạo `server/hanet.ts`**

```ts
import { randomBytes } from 'node:crypto';
import type { Db } from './db';
import { tx } from './db';
import { recomputeDay } from './attendance';
import { getSetting, setSetting } from './settings';
import { toVnDate } from './vntime';
import type { DetectionSource, HanetConfigView, WebhookLogStatus } from '../shared/types';

export interface CheckinInput {
  personId: string | null;
  aliasId: string | null;
  personName: string | null;
  personType: number | null;
  deviceId: string;
  deviceName: string | null;
  placeId: number | null;
  ts: number;
  imageUrl: string | null;
}

const str = (v: unknown): string | null => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Hanet gửi mili-giây; nếu nhận giá trị dạng giây (< 1e12) thì đổi sang mili-giây. */
export function normalizeTs(raw: number | null, now: number): { ts: number; fromServer: boolean } {
  if (raw === null || raw <= 0) return { ts: now, fromServer: true };
  return { ts: raw < 1e12 ? Math.round(raw * 1000) : raw, fromServer: false };
}

/**
 * Nhận cả dạng lồng `{ action, data: {...} }` lẫn dạng phẳng (webhook Hanet `data_type: 'log'`
 * và bản ghi từ API getCheckinByPlaceIdInTimestamp). Trả null nếu không phải sự kiện nhận diện.
 */
export function parseCheckin(body: unknown, now: number): { input: CheckinInput; note: string | null } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const d = (b.data && typeof b.data === 'object' ? b.data : b) as Record<string, unknown>;
  const deviceId = str(d.deviceID);
  const aliasId = str(d.aliasID);
  const personId = str(d.personID);
  if (!deviceId || (!aliasId && !personId)) return null;
  const { ts, fromServer } = normalizeTs(num(d.time ?? d.checkinTime), now);
  return {
    input: {
      personId,
      aliasId,
      personName: str(d.personName),
      personType: num(d.personType ?? d.type),
      deviceId,
      deviceName: str(d.deviceName),
      placeId: num(d.placeID),
      ts,
      imageUrl: str(d.detected_image_url ?? d.avatar),
    },
    note: fromServer ? 'Thiếu thời gian từ Hanet, dùng giờ nhận' : null,
  };
}

export interface IngestResult {
  status: 'success' | 'ignored' | 'duplicate';
  message: string;
  userId?: string;
}

export function ingestCheckin(db: Db, input: CheckinInput, source: DetectionSource): IngestResult {
  if (input.personType !== null && input.personType !== 0) return { status: 'ignored', message: 'Không phải nhân viên' };
  type Match = { id: string; status: string } | undefined;
  let user: Match;
  if (input.aliasId) user = db.prepare('SELECT id, status FROM users WHERE code = ?').get(input.aliasId.toUpperCase()) as Match;
  if (!user && input.personId) user = db.prepare('SELECT id, status FROM users WHERE hanet_person_id = ?').get(input.personId) as Match;
  if (!user) return { status: 'ignored', message: 'Không khớp nhân viên nào' };
  if (user.status !== 'active') return { status: 'ignored', message: 'Nhân viên đã ngừng hoạt động', userId: user.id };

  const userId = user.id;
  const workDate = toVnDate(input.ts);
  return tx(db, () => {
    const r = db
      .prepare(
        `INSERT INTO detections(user_id, hanet_person_id, device_id, device_name, place_id, ts, work_date, image_url, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, device_id, ts) DO NOTHING`,
      )
      .run(userId, input.personId, input.deviceId, input.deviceName, input.placeId, input.ts, workDate, input.imageUrl, source);
    if (Number(r.changes) === 0) return { status: 'duplicate' as const, message: 'Lượt nhận diện đã có', userId };
    recomputeDay(db, userId, workDate);
    return { status: 'success' as const, message: `Đã ghi nhận ngày ${workDate}`, userId };
  });
}

export const WEBHOOK_LOG_LIMIT = 500;

export function logWebhook(
  db: Db,
  e: { status: WebhookLogStatus; personName?: string | null; deviceName?: string | null; message?: string | null; rawPayload?: unknown },
  now: number,
): void {
  db.prepare('INSERT INTO webhook_logs(received_at, status, person_name, device_name, message, raw_payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    new Date(now).toISOString(),
    e.status,
    e.personName ?? null,
    e.deviceName ?? null,
    e.message ?? null,
    e.rawPayload === undefined ? null : JSON.stringify(e.rawPayload),
  );
  db.prepare('DELETE FROM webhook_logs WHERE id <= (SELECT id FROM webhook_logs ORDER BY id DESC LIMIT 1 OFFSET ?)').run(WEBHOOK_LOG_LIMIT);
}

const WEBHOOK_TOKEN_KEY = 'hanet.webhook_token';

export function getWebhookToken(db: Db): string {
  return getSetting(db, WEBHOOK_TOKEN_KEY) ?? rotateWebhookToken(db);
}

export function rotateWebhookToken(db: Db): string {
  const token = randomBytes(24).toString('base64url'); // 32 ký tự
  setSetting(db, WEBHOOK_TOKEN_KEY, token);
  return token;
}

export function mask(v?: string): string {
  return v ? `••••${v.slice(-4)}` : '';
}

/** Chưa thấy trong tài liệu Postman; HR sửa được ở tab Cấu hình nếu Hanet dùng địa chỉ khác. */
export const HANET_DEFAULT_API_BASE = 'https://partner.hanet.ai';

export function getPlaceIds(db: Db): number[] {
  try {
    const v = JSON.parse(getSetting(db, 'hanet.place_ids') ?? '[]');
    return Array.isArray(v) ? v.filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}

export function reconcileEnabled(db: Db): boolean {
  return Boolean(getSetting(db, 'hanet.client_id')) &&
    Boolean(getSetting(db, 'hanet.refresh_token') || getSetting(db, 'hanet.access_token')) &&
    getPlaceIds(db).length > 0;
}

export function getHanetConfigView(db: Db): HanetConfigView {
  return {
    clientId: getSetting(db, 'hanet.client_id') ?? '',
    clientSecret: mask(getSetting(db, 'hanet.client_secret')),
    accessToken: mask(getSetting(db, 'hanet.access_token')),
    refreshToken: mask(getSetting(db, 'hanet.refresh_token')),
    apiBase: getSetting(db, 'hanet.api_base') ?? HANET_DEFAULT_API_BASE,
    placeIds: getPlaceIds(db),
    webhookPath: `/api/hanet/webhook/${getWebhookToken(db)}`,
    lastReconcileAt: getSetting(db, 'hanet.last_reconcile_at') ?? null,
    lastReconcileError: getSetting(db, 'hanet.last_reconcile_error') ?? null,
    reconcileEnabled: reconcileEnabled(db),
  };
}

const TEXT_FIELDS = [
  ['clientId', 'hanet.client_id'],
  ['clientSecret', 'hanet.client_secret'],
  ['accessToken', 'hanet.access_token'],
  ['refreshToken', 'hanet.refresh_token'],
  ['apiBase', 'hanet.api_base'],
] as const;

/** Ô để trống hoặc còn giá trị đã che ('••••...') thì giữ nguyên giá trị cũ. */
export function updateHanetConfig(db: Db, body: unknown): void {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const [field, key] of TEXT_FIELDS) {
    const v = b[field];
    if (typeof v === 'string' && v.trim() !== '' && !v.startsWith('••••')) setSetting(db, key, v.trim());
  }
  if (Array.isArray(b.placeIds)) {
    const ids = b.placeIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    setSetting(db, 'hanet.place_ids', JSON.stringify(ids));
  }
}
```

- [ ] **Step 4: Tạo `server/routes/hanet.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { getUser, type Row } from '../repo';
import { safeEqualStrings } from '../auth';
import {
  getHanetConfigView, getWebhookToken, ingestCheckin, logWebhook, parseCheckin, rotateWebhookToken, updateHanetConfig,
  type CheckinInput, type IngestResult,
} from '../hanet';
import { isValidDate, toVnDate, vnDateTimeToTs } from '../vntime';
import type { WebhookLog } from '../../shared/types';

export function hanetPublicRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.post('/hanet/webhook/:token', (req, res) => {
    const now = ctx.now();
    if (!safeEqualStrings(req.params.token, getWebhookToken(db))) {
      console.warn(`[SECURITY] webhook_bad_token ip=${req.ip}`);
      logWebhook(db, { status: 'rejected', message: 'Sai token webhook' }, now);
      res.status(401).json({ returnCode: -1, returnMessage: 'Unauthorized' });
      return;
    }
    const parsed = parseCheckin(req.body, now);
    if (!parsed) {
      logWebhook(db, { status: 'ignored', message: 'Không phải sự kiện nhận diện', rawPayload: req.body }, now);
      res.json({ returnCode: 1, returnMessage: 'ignored' });
      return;
    }
    let result: IngestResult;
    try {
      result = ingestCheckin(db, parsed.input, 'webhook');
    } catch (err) {
      console.error('[WEBHOOK] Lỗi ghi lượt nhận diện:', err);
      try {
        logWebhook(db, { status: 'error', message: (err as Error).message, rawPayload: req.body }, now);
      } catch {
        // DB lỗi thì bỏ qua log; đối soát sẽ bù lượt này
      }
      res.status(500).json({ returnCode: -503, returnMessage: 'Lỗi lưu dữ liệu' });
      return;
    }
    logWebhook(
      db,
      {
        status: result.status,
        personName: parsed.input.personName,
        deviceName: parsed.input.deviceName,
        message: [result.message, parsed.note].filter(Boolean).join('; '),
        rawPayload: req.body,
      },
      now,
    );
    res.json({ returnCode: 1, returnMessage: result.status });
  });

  r.all('/hanet/webhook', (_req, res) => {
    res.status(404).json({ error: 'Không tìm thấy' });
  });

  return r;
}

export function hanetRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();
  const hr = requireRole('hr');

  r.get('/hanet/config', hr, (_req, res) => {
    res.json({ config: getHanetConfigView(db) });
  });

  r.put('/hanet/config', hr, (req, res) => {
    updateHanetConfig(db, req.body);
    res.json({ config: getHanetConfigView(db) });
  });

  r.post('/hanet/webhook-token/rotate', hr, (req, res) => {
    rotateWebhookToken(db);
    console.warn(`[SECURITY] webhook_token_rotated by=${currentUser(req).code} ip=${req.ip}`);
    res.json({ config: getHanetConfigView(db) });
  });

  r.get('/hanet/webhook-logs', hr, (_req, res) => {
    const rows = db.prepare('SELECT * FROM webhook_logs ORDER BY id DESC LIMIT 200').all() as Row[];
    const logs: WebhookLog[] = rows.map((x) => {
      let rawPayload: unknown = null;
      try {
        rawPayload = x.raw_payload ? JSON.parse(x.raw_payload) : null;
      } catch {
        rawPayload = x.raw_payload;
      }
      return { id: x.id, receivedAt: x.received_at, status: x.status, personName: x.person_name ?? null, deviceName: x.device_name ?? null, message: x.message ?? null, rawPayload };
    });
    res.json({ logs });
  });

  r.post('/hanet/simulate', hr, (req, res) => {
    if (!ctx.config.simulatorEnabled) throw new HttpError(404, 'Không tìm thấy');
    const b = req.body ?? {};
    const target = typeof b.userId === 'string' ? getUser(db, b.userId) : null;
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân viên');
    const now = ctx.now();
    let ts = now;
    if (b.time !== undefined && b.time !== '') {
      const date = typeof b.date === 'string' && b.date ? b.date : toVnDate(now);
      if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
      try {
        ts = vnDateTimeToTs(date, String(b.time));
      } catch {
        throw new HttpError(400, 'Giờ không hợp lệ (định dạng HH:mm)');
      }
    }
    const input: CheckinInput = {
      personId: target.hanetPersonId,
      aliasId: target.code,
      personName: target.name,
      personType: 0,
      deviceId: typeof b.deviceId === 'string' && b.deviceId.trim() ? b.deviceId.trim() : 'SIMULATOR',
      deviceName: 'Mô phỏng',
      placeId: null,
      ts,
      imageUrl: target.avatarUrl || null,
    };
    const result = ingestCheckin(db, input, 'simulator');
    logWebhook(db, { status: result.status, personName: target.name, deviceName: 'Mô phỏng', message: `[Mô phỏng] ${result.message}` }, now);
    res.json({ result });
  });

  return r;
}
```

- [ ] **Step 5: Gắn router vào `server/app.ts`**

Thêm import `import { hanetPublicRoutes, hanetRoutes } from './routes/hanet';`.

Sau dòng `app.use('/api', authPublicRoutes(ctx));` thêm:

```ts
  app.use('/api', hanetPublicRoutes(ctx));
```

Sau `api.use(requestRoutes(ctx));` thêm:

```ts
  api.use(hanetRoutes(ctx));
```

- [ ] **Step 6: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/hanet.ts server/routes/hanet.ts server/app.ts tests/hanet.test.ts
git commit -m "feat(hanet): token-protected webhook, detection ingest, masked config, simulator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Gọi API Hanet và đối soát lượt nhận diện

**Files:**
- Create: `server/hanet-api.ts`, `tests/hanet-api.test.ts`
- Modify: `server/routes/hanet.ts` (thêm `POST /hanet/reconcile`)

**Interfaces:**
- Consumes: `parseCheckin`, `ingestCheckin`, `getPlaceIds`, `reconcileEnabled`, `getHanetConfigView`, `HANET_DEFAULT_API_BASE` (Task 9); `getSetting`, `setSetting`, `deleteSetting` (Task 4); `vnDayStart`, `addDays`, `isValidDate`, `toVnDate` (Task 2); `ah` (Task 1)
- Produces (`server/hanet-api.ts`):
  - `interface HanetDeps { db: Db; fetch: typeof fetch; now: () => number }`
  - `class HanetApiError(returnCode: number, message: string)`
  - `OAUTH_TOKEN_URL`, `PAGE_SIZE = 500`
  - `refreshAccessToken(deps): Promise<string>`
  - `fetchCheckins(deps, placeId: number, from: number, to: number): Promise<Record<string, unknown>[]>`
  - `interface ReconcileSummary { inserted: number; duplicates: number; ignored: number }`
  - `reconcileRange(deps, from: number, to: number): Promise<ReconcileSummary>`
  - `reconcileDate(deps, date: string): Promise<ReconcileSummary>`
- Produces (route): `POST /api/hanet/reconcile` (HR) `{ date? }` → `{ summary, config }`; 400 nếu chưa cấu hình; 502 nếu Hanet lỗi.

- [ ] **Step 1: Viết test thất bại `tests/hanet-api.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser, startTestApp, loginAs, Client } from './helpers';
import { reconcileDate, PAGE_SIZE, OAUTH_TOKEN_URL, type HanetDeps } from '../server/hanet-api';
import { getSetting, setSetting } from '../server/settings';
import { getWebhookToken } from '../server/hanet';
import { vnDateTimeToTs } from '../server/vntime';
import type { Db } from '../server/db';

const D = '2026-10-13';
const T = (hhmm: string) => vnDateTimeToTs(D, hhmm);
const NOW = T('23:30');

interface FakeOpts {
  pages: Record<string, unknown>[][];
  expireFirst?: boolean;
  refreshFails?: boolean;
}

function fakeHanet(opts: FakeOpts) {
  const calls: { url: string; params: URLSearchParams }[] = [];
  let expired = Boolean(opts.expireFirst);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const params = new URLSearchParams(String(init?.body ?? ''));
    calls.push({ url: u, params });
    if (u === OAUTH_TOKEN_URL) {
      if (opts.refreshFails) return json({ error: 'invalid_grant' });
      expired = false;
      return json({ access_token: 'new-token', refresh_token: 'new-refresh' });
    }
    if (u.endsWith('/person/getCheckinByPlaceIdInTimestamp')) {
      if (expired) return json({ returnCode: -103, returnMessage: 'ACCESS_TOKEN_EXPIRE' });
      return json({ returnCode: 1, returnMessage: 'SUCCESS', data: opts.pages[Number(params.get('page')) - 1] ?? [] });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const item = (alias: string, ts: number, device = 'C20371B239') => ({
  personName: 'X', date: D, checkinTime: ts, aliasID: alias, placeID: '143', personID: `p-${alias}`,
  avatar: 'https://img/x.jpg', place: 'Trụ sở', title: '', type: 0, deviceID: device, deviceName: 'Cửa chính',
});

function configure(db: Db) {
  setSetting(db, 'hanet.client_id', 'cid');
  setSetting(db, 'hanet.client_secret', 'csecret');
  setSetting(db, 'hanet.access_token', 'old-token');
  setSetting(db, 'hanet.refresh_token', 'old-refresh');
  setSetting(db, 'hanet.place_ids', '[143]');
}

const count = (db: Db) => (db.prepare('SELECT COUNT(*) AS c FROM detections').get() as { c: number }).c;

test('phân trang: kéo đến khi trang < PAGE_SIZE, gửi đúng tham số', async () => {
  const db = freshDb();
  configure(db);
  seedUser(db, { code: 'NV01', password: null });
  const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => item('NV01', T('08:00') + i * 1000));
  const page2 = [item('NV01', T('17:00')), item('NV01', T('17:01')), item('KHONG-CO', T('17:02'))];
  const fake = fakeHanet({ pages: [page1, page2] });
  const deps: HanetDeps = { db, fetch: fake.fetchImpl, now: () => NOW };
  const s = await reconcileDate(deps, D);
  assert.deepEqual(s, { inserted: PAGE_SIZE + 2, duplicates: 0, ignored: 1 });
  assert.equal(fake.calls.length, 2);
  const p = fake.calls[0].params;
  assert.equal(fake.calls[0].url, 'https://partner.hanet.ai/person/getCheckinByPlaceIdInTimestamp');
  assert.equal(p.get('token'), 'old-token');
  assert.equal(p.get('placeID'), '143');
  assert.equal(p.get('from'), String(vnDateTimeToTs(D, '00:00')));
  assert.equal(p.get('to'), String(NOW), 'không kéo quá thời điểm hiện tại');
  assert.equal(p.get('type'), '0');
  assert.equal(p.get('size'), String(PAGE_SIZE));
  assert.ok(getSetting(db, 'hanet.last_reconcile_at'));
});

test('token hết hạn (-103) → refresh một lần rồi thử lại, lưu token mới', async () => {
  const db = freshDb();
  configure(db);
  seedUser(db, { code: 'NV01', password: null });
  const fake = fakeHanet({ pages: [[item('NV01', T('08:00'))]], expireFirst: true });
  const s = await reconcileDate({ db, fetch: fake.fetchImpl, now: () => NOW }, D);
  assert.equal(s.inserted, 1);
  assert.deepEqual(fake.calls.map((c) => c.url.endsWith('/token')), [false, true, false]);
  const refresh = fake.calls[1].params;
  assert.equal(refresh.get('grant_type'), 'refresh_token');
  assert.equal(refresh.get('refresh_token'), 'old-refresh');
  assert.equal(fake.calls[2].params.get('token'), 'new-token');
  assert.equal(getSetting(db, 'hanet.access_token'), 'new-token');
  assert.equal(getSetting(db, 'hanet.refresh_token'), 'new-refresh');
});

test('refresh thất bại → ném lỗi và lưu last_reconcile_error', async () => {
  const db = freshDb();
  configure(db);
  const fake = fakeHanet({ pages: [], expireFirst: true, refreshFails: true });
  await assert.rejects(reconcileDate({ db, fetch: fake.fetchImpl, now: () => NOW }, D));
  assert.match(getSetting(db, 'hanet.last_reconcile_error')!, /Làm mới token thất bại/);
});

test('lượt đã có từ webhook không bị ghi trùng khi đối soát', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    configure(app.db);
    seedUser(app.db, { code: 'NV01', password: null });
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    await new Client(app.baseUrl).post(`/api/hanet/webhook/${getWebhookToken(app.db)}`, { aliasID: 'NV01', deviceID: 'C20371B239', time: T('08:00') });
    const fake = fakeHanet({ pages: [[item('NV01', T('08:00')), item('NV01', T('17:30'))]] });
    app.ctx.fetch = fake.fetchImpl;
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/hanet/reconcile', { date: D });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.summary, { inserted: 1, duplicates: 1, ignored: 0 });
    assert.equal(count(app.db), 2);
    assert.equal(r.body.config.lastReconcileError, null);
  } finally {
    await app.close();
  }
});

test('route đối soát: nhân viên 403, chưa cấu hình 400, Hanet lỗi 502', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    seedUser(app.db, { code: 'NV01' });
    assert.equal((await (await loginAs(app, 'NV01')).post('/api/hanet/reconcile', {})).status, 403);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/hanet/reconcile', {})).status, 400);
    configure(app.db);
    app.ctx.fetch = fakeHanet({ pages: [], expireFirst: true, refreshFails: true }).fetchImpl;
    const r = await hr.post('/api/hanet/reconcile', { date: D });
    assert.equal(r.status, 502);
    assert.match(r.body.error, /^Đối soát thất bại/);
  } finally {
    await app.close();
  }
});
```

(Test gán `app.ctx.fetch` sau khi app chạy; route đọc `ctx.fetch` lúc xử lý request nên nhận fetch mới.)

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, không tìm thấy `../server/hanet-api`.

- [ ] **Step 3: Tạo `server/hanet-api.ts`**

```ts
import type { Db } from './db';
import { deleteSetting, getSetting, setSetting } from './settings';
import { HANET_DEFAULT_API_BASE, getPlaceIds, ingestCheckin, parseCheckin } from './hanet';
import { addDays, vnDayStart } from './vntime';

export interface HanetDeps {
  db: Db;
  fetch: typeof fetch;
  now: () => number;
}

export class HanetApiError extends Error {
  constructor(
    public returnCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const OAUTH_TOKEN_URL = 'https://oauth.hanet.com/token';
export const PAGE_SIZE = 500;
const TOKEN_EXPIRED = -103;
const MAX_PAGES = 200;

async function postForm(deps: HanetDeps, url: string, params: Record<string, string>): Promise<any> {
  const res = await deps.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new HanetApiError(res.status, `HTTP ${res.status} từ ${url}`);
  return res.json();
}

export async function refreshAccessToken(deps: HanetDeps): Promise<string> {
  const { db } = deps;
  const refreshToken = getSetting(db, 'hanet.refresh_token');
  const clientId = getSetting(db, 'hanet.client_id');
  const clientSecret = getSetting(db, 'hanet.client_secret');
  if (!refreshToken || !clientId || !clientSecret) {
    throw new HanetApiError(0, 'Làm mới token thất bại: thiếu Client ID, Client Secret hoặc Refresh Token');
  }
  const body = await postForm(deps, OAUTH_TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const token = body?.access_token;
  if (typeof token !== 'string' || !token) {
    throw new HanetApiError(Number(body?.returnCode ?? 0), `Làm mới token thất bại: ${body?.returnMessage ?? body?.error ?? 'không rõ lý do'}`);
  }
  setSetting(db, 'hanet.access_token', token);
  if (typeof body.refresh_token === 'string' && body.refresh_token) setSetting(db, 'hanet.refresh_token', body.refresh_token);
  return token;
}

async function callApi(deps: HanetDeps, apiPath: string, params: Record<string, string>, retried = false): Promise<any> {
  const token = getSetting(deps.db, 'hanet.access_token') ?? (await refreshAccessToken(deps));
  const base = (getSetting(deps.db, 'hanet.api_base') ?? HANET_DEFAULT_API_BASE).replace(/\/+$/, '');
  const body = await postForm(deps, base + apiPath, { token, ...params });
  const code = Number(body?.returnCode);
  if (code === TOKEN_EXPIRED && !retried) {
    await refreshAccessToken(deps);
    return callApi(deps, apiPath, params, true);
  }
  if (code !== 1) throw new HanetApiError(code, `Hanet trả lỗi ${code}: ${body?.returnMessage ?? ''}`);
  return body;
}

export async function fetchCheckins(deps: HanetDeps, placeId: number, from: number, to: number): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await callApi(deps, '/person/getCheckinByPlaceIdInTimestamp', {
      placeID: String(placeId),
      from: String(from),
      to: String(to),
      type: '0',
      page: String(page),
      size: String(PAGE_SIZE),
    });
    const data = Array.isArray(body.data) ? body.data : [];
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export interface ReconcileSummary {
  inserted: number;
  duplicates: number;
  ignored: number;
}

export async function reconcileRange(deps: HanetDeps, from: number, to: number): Promise<ReconcileSummary> {
  const { db } = deps;
  const summary: ReconcileSummary = { inserted: 0, duplicates: 0, ignored: 0 };
  try {
    for (const placeId of getPlaceIds(db)) {
      for (const item of await fetchCheckins(deps, placeId, from, to)) {
        const parsed = parseCheckin(item, deps.now());
        if (!parsed) {
          summary.ignored++;
          continue;
        }
        const r = ingestCheckin(db, parsed.input, 'reconcile');
        if (r.status === 'success') summary.inserted++;
        else if (r.status === 'duplicate') summary.duplicates++;
        else summary.ignored++;
      }
    }
  } catch (err) {
    setSetting(db, 'hanet.last_reconcile_error', (err as Error).message);
    throw err;
  }
  setSetting(db, 'hanet.last_reconcile_at', new Date(deps.now()).toISOString());
  deleteSetting(db, 'hanet.last_reconcile_error');
  return summary;
}

/** Đối soát cả một ngày VN, không kéo quá thời điểm hiện tại. */
export async function reconcileDate(deps: HanetDeps, date: string): Promise<ReconcileSummary> {
  const from = vnDayStart(date);
  const to = Math.min(vnDayStart(addDays(date, 1)) - 1, deps.now());
  return reconcileRange(deps, from, to);
}
```

- [ ] **Step 4: Thêm route đối soát vào `server/routes/hanet.ts`**

Thêm import:

```ts
import { ah } from '../errors';
import { reconcileEnabled } from '../hanet';
import { reconcileDate } from '../hanet-api';
```

(gộp `ah` vào dòng import `HttpError` có sẵn: `import { HttpError, ah } from '../errors';`, và gộp `reconcileEnabled` vào khối import từ `'../hanet'`.)

Trong `hanetRoutes`, trước `return r;` thêm:

```ts
  r.post(
    '/hanet/reconcile',
    hr,
    ah(async (req, res) => {
      if (!reconcileEnabled(db)) throw new HttpError(400, 'Chưa cấu hình đủ Client ID, token và Place ID để đối soát');
      const date = typeof req.body?.date === 'string' && req.body.date ? req.body.date : toVnDate(ctx.now());
      if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
      try {
        const summary = await reconcileDate({ db, fetch: ctx.fetch, now: ctx.now }, date);
        res.json({ summary, config: getHanetConfigView(db) });
      } catch (err) {
        throw new HttpError(502, `Đối soát thất bại: ${(err as Error).message}`);
      }
    }),
  );
```

- [ ] **Step 5: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/hanet-api.ts server/routes/hanet.ts tests/hanet-api.test.ts
git commit -m "feat(hanet): API client with token refresh and checkin reconciliation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Sao lưu và API quản trị (sao lưu, xóa dữ liệu)

**Files:**
- Create: `server/backup.ts`, `server/routes/admin.ts`, `tests/backup.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `VN_OFFSET_MS` (Task 2); `verifyPassword` (Task 3); `tx` (Task 1); `currentUser`, `requireRole` (Task 5)
- Produces (`server/backup.ts`):
  - `type BackupReason = 'daily' | 'manual' | 'pre-reset'`
  - `BACKUP_KEEP = 30`
  - `backupNow(db, dir, reason, now): string | null` — trả tên file; `null` nếu bản hằng ngày hôm nay đã có
  - `listBackups(dir): BackupInfo[]` (mới nhất trước); `pruneBackups(dir): void`; `latestBackup(dir): string | null` (đường dẫn đầy đủ)
- Produces (`server/routes/admin.ts`): `adminRoutes(ctx)` — HR: `GET /admin/backups` → `{ backups }`, `POST /admin/backups` → `{ backup }`, `GET /admin/backups/latest` (tải file), `POST /admin/reset-database` `{ password }` → `{ success, backup }`

**Xóa dữ liệu giữ lại gì:** tài khoản HR đang thao tác (gỡ khỏi phòng ban) và bảng `settings` (giờ làm, cấu hình Hanet, token webhook) để Hanet vẫn gửi được webhook. Mọi bảng khác bị xóa trắng.

- [ ] **Step 1: Viết test thất bại `tests/backup.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupNow, listBackups, pruneBackups, latestBackup, BACKUP_KEEP } from '../server/backup';
import { openDb } from '../server/db';
import { setSetting, getSetting } from '../server/settings';
import { freshDb, seedUser, seedDepartment, startTestApp, loginAs, TEST_PASSWORD, addDetection } from './helpers';
import { addDays, vnDateTimeToTs } from '../server/vntime';

const NOW = vnDateTimeToTs('2026-10-13', '02:00');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-bk-'));

test('backupNow tạo bản sao đọc được; bản hằng ngày chỉ tạo một lần mỗi ngày', () => {
  const db = freshDb();
  seedUser(db, { code: 'NV01', password: null });
  const dir = tmp();
  assert.equal(backupNow(db, dir, 'daily', NOW), 'attendance-2026-10-13.db');
  assert.equal(backupNow(db, dir, 'daily', NOW + 60_000), null);
  const copy = openDb(path.join(dir, 'attendance-2026-10-13.db'));
  assert.equal((copy.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 1);
  copy.close();
});

test('bản thủ công đặt tên theo giờ VN và không ghi đè nhau', () => {
  const db = freshDb();
  const dir = tmp();
  const a = backupNow(db, dir, 'manual', NOW)!;
  const b = backupNow(db, dir, 'manual', NOW)!;
  assert.equal(a, 'attendance-2026-10-13-020000-manual.db');
  assert.notEqual(a, b);
  assert.equal(listBackups(dir).length, 2);
  assert.ok(latestBackup(dir));
});

test('pruneBackups giữ 30 bản hằng ngày và 30 bản khác', () => {
  const dir = tmp();
  for (let i = 0; i < 35; i++) {
    const day = addDays('2026-08-01', i); // 2026-08-01 … 2026-09-04
    fs.writeFileSync(path.join(dir, `attendance-${day}.db`), '');
    fs.writeFileSync(path.join(dir, `attendance-${day}-120000-manual.db`), '');
  }
  fs.writeFileSync(path.join(dir, 'database.json.pre-migration'), '{}');
  pruneBackups(dir);
  const names = fs.readdirSync(dir);
  assert.equal(names.filter((n) => /^attendance-\d{4}-\d{2}-\d{2}\.db$/.test(n)).length, BACKUP_KEEP);
  assert.equal(names.filter((n) => n.endsWith('-manual.db')).length, BACKUP_KEEP);
  assert.ok(names.includes('database.json.pre-migration'), 'không đụng tới file khác');
  assert.ok(!names.includes('attendance-2026-08-01.db'), 'xóa bản cũ nhất');
  assert.ok(names.includes('attendance-2026-09-04.db'));
});

test('API sao lưu: chỉ HR; tạo, liệt kê, tải về', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    seedUser(app.db, { code: 'NV01' });
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.get('/api/admin/backups')).status, 403);
    assert.equal((await nv.post('/api/admin/backups')).status, 403);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.get('/api/admin/backups/latest')).status, 404);
    const created = await hr.post('/api/admin/backups');
    assert.equal(created.status, 200);
    assert.match(created.body.backup, /-manual\.db$/);
    assert.equal((await hr.get('/api/admin/backups')).body.backups.length, 1);
    const dl = await fetch(app.baseUrl + '/api/admin/backups/latest', { headers: { Cookie: hr.cookie } });
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get('content-disposition') ?? '', /attachment/);
    assert.ok((await dl.arrayBuffer()).byteLength > 0);
  } finally {
    await app.close();
  }
});

test('xóa dữ liệu: sai mật khẩu 400; đúng thì sao lưu trước, giữ HR và settings', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    const dep = seedDepartment(app.db, 'KT');
    const hrId = seedUser(app.db, { code: 'HR01', role: 'hr', departmentId: dep });
    const nvId = seedUser(app.db, { code: 'NV01', departmentId: dep });
    addDetection(app.db, nvId, NOW);
    setSetting(app.db, 'hanet.webhook_token', 'giu-nguyen');
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.post('/api/admin/reset-database', { password: TEST_PASSWORD })).status, 403);

    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/admin/reset-database', { password: 'sai' })).status, 400);
    assert.equal((app.db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 2, 'chưa xóa gì');

    const r = await hr.post('/api/admin/reset-database', { password: TEST_PASSWORD });
    assert.equal(r.status, 200);
    assert.match(r.body.backup, /-pre-reset\.db$/);
    const left = app.db.prepare('SELECT id, department_id FROM users').all() as { id: string; department_id: string | null }[];
    assert.deepEqual(left.map((u) => ({ ...u })), [{ id: hrId, department_id: null }]);
    for (const t of ['departments', 'detections', 'attendance_days', 'requests', 'cameras', 'webhook_logs']) {
      assert.equal((app.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c, 0, t);
    }
    assert.equal(getSetting(app.db, 'hanet.webhook_token'), 'giu-nguyen');
    assert.equal((await hr.get('/api/auth/me')).status, 200, 'HR vẫn đăng nhập');

    const backup = openDb(path.join(app.ctx.config.backupDir, r.body.backup));
    assert.equal((backup.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 2, 'bản sao lưu có dữ liệu trước khi xóa');
    backup.close();
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, không tìm thấy `../server/backup`.

- [ ] **Step 3: Tạo `server/backup.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { VN_OFFSET_MS } from './vntime';
import type { BackupInfo } from '../shared/types';

export type BackupReason = 'daily' | 'manual' | 'pre-reset';
export const BACKUP_KEEP = 30;

const BACKUP_RE = /^attendance-.*\.db$/;
const DAILY_RE = /^attendance-\d{4}-\d{2}-\d{2}\.db$/;

function stamp(now: number): { date: string; time: string } {
  const iso = new Date(now + VN_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19).replace(/:/g, '') };
}

/** Tạo bản sao nhất quán bằng VACUUM INTO. Trả tên file, hoặc null nếu bản hằng ngày hôm nay đã có. */
export function backupNow(db: Db, dir: string, reason: BackupReason, now: number): string | null {
  fs.mkdirSync(dir, { recursive: true });
  const { date, time } = stamp(now);
  let name: string;
  if (reason === 'daily') {
    name = `attendance-${date}.db`;
    if (fs.existsSync(path.join(dir, name))) return null;
  } else {
    name = `attendance-${date}-${time}-${reason}.db`;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `attendance-${date}-${time}-${reason}-${i}.db`;
  }
  db.prepare('VACUUM INTO ?').run(path.join(dir, name));
  pruneBackups(dir);
  return name;
}

export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => BACKUP_RE.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.createdAt === b.createdAt ? b.name.localeCompare(a.name) : b.createdAt.localeCompare(a.createdAt)));
}

export function pruneBackups(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const names = fs.readdirSync(dir).filter((n) => BACKUP_RE.test(n)).sort().reverse(); // tên chứa ngày giờ → mới nhất trước
  const daily = names.filter((n) => DAILY_RE.test(n));
  const others = names.filter((n) => !DAILY_RE.test(n));
  for (const n of [...daily.slice(BACKUP_KEEP), ...others.slice(BACKUP_KEEP)]) fs.rmSync(path.join(dir, n), { force: true });
}

export function latestBackup(dir: string): string | null {
  const [first] = listBackups(dir);
  return first ? path.join(dir, first.name) : null;
}
```

- [ ] **Step 4: Tạo `server/routes/admin.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { tx } from '../db';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { verifyPassword } from '../auth';
import { backupNow, latestBackup, listBackups } from '../backup';

export function adminRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const dir = ctx.config.backupDir;
  const r = Router();
  const hr = requireRole('hr');

  r.get('/admin/backups', hr, (_req, res) => {
    res.json({ backups: listBackups(dir) });
  });

  r.post('/admin/backups', hr, (_req, res) => {
    res.json({ backup: backupNow(db, dir, 'manual', ctx.now()) });
  });

  r.get('/admin/backups/latest', hr, (_req, res) => {
    const file = latestBackup(dir);
    if (!file) throw new HttpError(404, 'Chưa có bản sao lưu nào');
    res.download(file);
  });

  r.post('/admin/reset-database', hr, (req, res) => {
    const actor = currentUser(req);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.id) as { password_hash: string | null } | undefined;
    const password = req.body?.password;
    if (typeof password !== 'string' || !verifyPassword(password, row?.password_hash)) {
      throw new HttpError(400, 'Mật khẩu không đúng');
    }
    const backup = backupNow(db, dir, 'pre-reset', ctx.now());
    tx(db, () => {
      for (const table of ['detections', 'attendance_days', 'requests', 'webhook_logs', 'cameras']) db.exec(`DELETE FROM ${table}`);
      db.prepare('UPDATE users SET department_id = NULL WHERE id = ?').run(actor.id);
      db.exec('UPDATE departments SET manager_id = NULL');
      db.prepare('DELETE FROM users WHERE id != ?').run(actor.id);
      db.exec('DELETE FROM departments');
    });
    console.warn(`[SECURITY] database_reset by=${actor.code} backup=${backup} ip=${req.ip}`);
    res.json({ success: true, backup });
  });

  return r;
}
```

- [ ] **Step 5: Gắn router vào `server/app.ts`**

Thêm import `import { adminRoutes } from './routes/admin';` và sau `api.use(hanetRoutes(ctx));` thêm:

```ts
  api.use(adminRoutes(ctx));
```

- [ ] **Step 6: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/backup.ts server/routes/admin.ts server/app.ts tests/backup.test.ts
git commit -m "feat(admin): VACUUM INTO backups with rotation and password-confirmed reset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Chuyển dữ liệu từ `data/database.json`

**Files:**
- Create: `server/migrate.ts`, `tests/fixtures/legacy-database.json`, `tests/migrate.test.ts`

**Interfaces:**
- Consumes: `tx`, `newId` (Task 1); `recomputeDay` (Task 4); `setSetting` (Task 4); `toVnDate` (Task 2); `ensureAdminAccess` (Task 5, chỉ trong test)
- Produces (`server/migrate.ts`):
  - `interface MigrationCounts { departments: number; users: number; cameras: number; detections: number; requests: number }`
  - `migrateFromJson(db, jsonPath, backupDir): MigrationCounts | null` — `null` nếu DB đã có người dùng hoặc không có file JSON. Ném `Error` nếu JSON hỏng hoặc dữ liệu vi phạm ràng buộc; khi đó DB không đổi và file JSON giữ nguyên tên.

**Quy tắc chuyển:**
- Mã nhân viên/phòng ban: trim + viết hoa. `departmentId: ''` → `NULL`.
- `hanetPersonId` dạng giả `HANET_P_<số>` (do server cũ sinh ngẫu nhiên) → `NULL`.
- Mọi người dùng: `password_hash = NULL`, `must_change_password = 1`. HR đặt lại mật khẩu cho từng người. HR đầu tiên được `ensureAdminAccess` cấp mật khẩu tạm lúc khởi động.
- `attendanceEvents` → `detections`: `device_id = cameraId` (rỗng thì `'UNKNOWN'`), `work_date` tính lại theo giờ VN từ `timestamp`, `source = 'simulator'` nếu id bắt đầu `att-sim`, còn lại `'webhook'`. Bỏ qua lượt của người dùng không tồn tại.
- `requests`: `suggestedTime` → `suggested_in`; `reviewedBy` (tên) → id người dùng trùng tên, không có thì `NULL`.
- `config`: `clientId`, `clientSecret`, `accessToken` (nếu có) → `settings`; `masterPlaceId > 0` → `hanet.place_ids = [masterPlaceId]`.
- Tính lại `attendance_days` cho mọi (nhân viên, ngày) có lượt. Không áp lại các điều chỉnh của server cũ.
- Trước khi ghi: chép file sang `<backupDir>/database.json.pre-migration`. Thành công: đổi tên thành `database.json.migrated`.

- [ ] **Step 1: Tạo fixture `tests/fixtures/legacy-database.json`**

```json
{
  "config": {
    "clientId": "cid",
    "clientSecret": "csecret",
    "accessToken": "tok",
    "tokenExpiresAt": "",
    "webhookSecret": "",
    "masterPlaceId": 1042,
    "masterPlaceName": "Trụ sở",
    "autoSync": true
  },
  "departments": [
    { "id": "dep-kt", "code": "kt", "name": "Kế toán", "description": "", "managerId": "usr-m1", "managerName": "Trần Thị B", "createdAt": "2026-10-01" },
    { "id": "dep-kd", "code": "KD", "name": "Kinh doanh", "description": "", "managerId": "", "managerName": "Chưa chỉ định", "createdAt": "2026-10-01" }
  ],
  "users": [
    { "id": "usr-admin", "code": "ADMIN", "name": "Quản trị viên Hệ thống (HR)", "email": "admin@company.com", "phone": "", "role": "hr", "departmentId": "", "departmentName": "Ban Quản trị", "position": "Quản trị viên", "avatarUrl": "", "hanetPersonId": "", "faceRegistered": false, "status": "active", "createdAt": "2026-10-01" },
    { "id": "usr-m1", "code": "PLX-TP01", "name": "Trần Thị B", "email": "", "phone": "", "role": "dept_manager", "departmentId": "dep-kt", "departmentName": "Kế toán", "position": "Trưởng phòng", "avatarUrl": "", "hanetPersonId": "2134589559210508288", "faceRegistered": true, "status": "active", "createdAt": "2026-10-01" },
    { "id": "usr-e1", "code": "plx-nv01", "name": "Nguyễn Văn A", "email": "", "phone": "", "role": "employee", "departmentId": "dep-kt", "departmentName": "Kế toán", "position": "Nhân viên", "avatarUrl": "", "hanetPersonId": "HANET_P_1234", "faceRegistered": true, "status": "active", "createdAt": "2026-10-01" }
  ],
  "cameras": [
    { "id": "cam-01", "name": "Cửa chính", "deviceKey": "C2037", "placeId": 1042, "placeName": "Trụ sở", "location": "Tầng 1", "status": "online", "lastPing": "2026-10-12T00:00:00.000Z", "ipAddress": "192.168.1.50" }
  ],
  "attendanceEvents": [
    { "id": "att-evt-1", "employeeId": "usr-e1", "cameraId": "C2037", "cameraName": "Cửa chính", "placeId": 1042, "timestamp": 1791768600000, "detectedImageUrl": "https://img/1.jpg", "type": "check_in", "status": "late" },
    { "id": "att-evt-2", "employeeId": "usr-e1", "cameraId": "C2037", "cameraName": "Cửa chính", "placeId": 1042, "timestamp": 1791801000000, "detectedImageUrl": "", "type": "check_in", "status": "on_time" },
    { "id": "att-sim-3", "employeeId": "usr-e1", "cameraId": "", "cameraName": "Mô phỏng", "placeId": 1042, "timestamp": 1791826200000, "detectedImageUrl": "", "type": "check_in", "status": "on_time" },
    { "id": "att-evt-4", "employeeId": "usr-deleted", "cameraId": "C2037", "cameraName": "Cửa chính", "placeId": 1042, "timestamp": 1791768600000, "detectedImageUrl": "", "type": "check_in", "status": "on_time" }
  ],
  "requests": [
    { "id": "req-1", "employeeId": "usr-e1", "employeeName": "Nguyễn Văn A", "departmentId": "dep-kt", "date": "2026-10-12", "type": "late_explanation", "reason": "Tắc đường", "suggestedTime": "08:10", "status": "approved", "reviewedBy": "Trần Thị B", "reviewedAt": "2026-10-12T05:00:00.000Z", "comment": "ok", "createdAt": "2026-10-12T04:00:00.000Z" }
  ],
  "webhookLogs": [],
  "currentUserId": "usr-admin"
}
```

(Các timestamp: 1791768600000 = 12/10/2026 08:30 VN; 1791801000000 = 12/10 17:30 VN; 1791826200000 = 13/10 00:30 VN.)

- [ ] **Step 2: Viết test thất bại `tests/migrate.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateFromJson } from '../server/migrate';
import { ensureAdminAccess } from '../server/bootstrap';
import { getSetting } from '../server/settings';
import { freshDb, seedUser, startTestApp, loginAs } from './helpers';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'legacy-database.json');

function workspace(content = fs.readFileSync(FIXTURE, 'utf-8')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-mig-'));
  const jsonPath = path.join(dir, 'database.json');
  fs.writeFileSync(jsonPath, content);
  return { dir, jsonPath, backupDir: path.join(dir, 'backups') };
}

test('chuyển đủ dữ liệu, đổi tên file, có bản sao trước khi chuyển', () => {
  const db = freshDb();
  const ws = workspace();
  const counts = migrateFromJson(db, ws.jsonPath, ws.backupDir)!;
  assert.deepEqual(counts, { departments: 2, users: 3, cameras: 1, detections: 3, requests: 1 });
  assert.equal(fs.existsSync(ws.jsonPath), false);
  assert.ok(fs.existsSync(`${ws.jsonPath}.migrated`));
  assert.ok(fs.existsSync(path.join(ws.backupDir, 'database.json.pre-migration')));

  const e1 = db.prepare("SELECT code, department_id, hanet_person_id, password_hash, must_change_password FROM users WHERE id = 'usr-e1'").get() as Record<string, any>;
  assert.deepEqual({ ...e1 }, { code: 'PLX-NV01', department_id: 'dep-kt', hanet_person_id: null, password_hash: null, must_change_password: 1 });
  const m1 = db.prepare("SELECT hanet_person_id FROM users WHERE id = 'usr-m1'").get() as { hanet_person_id: string };
  assert.equal(m1.hanet_person_id, '2134589559210508288', 'personID thật được giữ');
  const admin = db.prepare("SELECT department_id FROM users WHERE id = 'usr-admin'").get() as { department_id: string | null };
  assert.equal(admin.department_id, null);
  const kt = db.prepare("SELECT code, manager_id FROM departments WHERE id = 'dep-kt'").get() as { code: string; manager_id: string };
  assert.deepEqual({ ...kt }, { code: 'KT', manager_id: 'usr-m1' });

  const days = db.prepare("SELECT work_date, status, late_minutes, detection_count FROM attendance_days WHERE user_id = 'usr-e1' ORDER BY work_date").all() as Record<string, any>[];
  assert.deepEqual(days.map((d) => ({ ...d })), [
    { work_date: '2026-10-12', status: 'late', late_minutes: 30, detection_count: 2 },
    { work_date: '2026-10-13', status: 'missing_out', late_minutes: 0, detection_count: 1 },
  ]);
  const sim = db.prepare("SELECT source, device_id FROM detections WHERE work_date = '2026-10-13'").get() as { source: string; device_id: string };
  assert.deepEqual({ ...sim }, { source: 'simulator', device_id: 'UNKNOWN' });

  const req = db.prepare("SELECT work_date, suggested_in, reviewed_by, status FROM requests WHERE id = 'req-1'").get() as Record<string, any>;
  assert.deepEqual({ ...req }, { work_date: '2026-10-12', suggested_in: '08:10', reviewed_by: 'usr-m1', status: 'approved' });

  assert.equal(getSetting(db, 'hanet.client_id'), 'cid');
  assert.equal(getSetting(db, 'hanet.client_secret'), 'csecret');
  assert.equal(getSetting(db, 'hanet.place_ids'), '[1042]');
});

test('sau khi chuyển, HR đầu tiên đăng nhập được bằng mật khẩu tạm', async () => {
  const db = freshDb();
  const ws = workspace();
  migrateFromJson(db, ws.jsonPath, ws.backupDir);
  const admin = ensureAdminAccess(db, undefined)!;
  assert.equal(admin.code, 'ADMIN');
  const app = await startTestApp({ db });
  try {
    const c = await loginAs(app, 'ADMIN', admin.password);
    assert.equal((await c.get('/api/auth/me')).body.mustChangePassword, true);
  } finally {
    await app.close();
  }
});

test('không làm gì khi DB đã có người dùng hoặc không có file', () => {
  const db = freshDb();
  seedUser(db, { code: 'X' });
  const ws = workspace();
  assert.equal(migrateFromJson(db, ws.jsonPath, ws.backupDir), null);
  assert.ok(fs.existsSync(ws.jsonPath), 'file giữ nguyên');
  assert.equal(migrateFromJson(freshDb(), path.join(ws.dir, 'khong-co.json'), ws.backupDir), null);
});

test('JSON hỏng → ném lỗi, DB trống, file không bị đổi tên', () => {
  const db = freshDb();
  const ws = workspace('{ "users": [ ');
  assert.throws(() => migrateFromJson(db, ws.jsonPath, ws.backupDir), /Không đọc được/);
  assert.ok(fs.existsSync(ws.jsonPath));
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 0);
});

test('trùng mã nhân viên → rollback toàn bộ, file giữ nguyên', () => {
  const legacy = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'));
  legacy.users.push({ ...legacy.users[2], id: 'usr-e2', code: 'PLX-NV01' });
  const db = freshDb();
  const ws = workspace(JSON.stringify(legacy));
  assert.throws(() => migrateFromJson(db, ws.jsonPath, ws.backupDir));
  assert.ok(fs.existsSync(ws.jsonPath));
  for (const t of ['users', 'departments', 'detections']) {
    assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c, 0, t);
  }
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: FAIL, không tìm thấy `../server/migrate`.

- [ ] **Step 4: Tạo `server/migrate.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { tx } from './db';
import { recomputeDay } from './attendance';
import { setSetting } from './settings';
import { toVnDate } from './vntime';

export interface MigrationCounts {
  departments: number;
  users: number;
  cameras: number;
  detections: number;
  requests: number;
}

type Legacy = Record<string, any>;

const ROLES = new Set(['hr', 'dept_manager', 'employee']);
const REQUEST_TYPES = new Set(['missed_punch', 'late_explanation', 'leave_request']);
const REQUEST_STATUSES = new Set(['pending', 'approved', 'rejected']);
const FAKE_PERSON_ID = /^HANET_P_\d+$/;

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const orNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const list = (v: unknown): Legacy[] => (Array.isArray(v) ? v : []);

export function migrateFromJson(db: Db, jsonPath: string, backupDir: string): MigrationCounts | null {
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get() || !fs.existsSync(jsonPath)) return null;

  let legacy: Legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Không đọc được ${jsonPath}: ${(err as Error).message}. Dữ liệu cũ được giữ nguyên.`);
  }

  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(jsonPath, path.join(backupDir, 'database.json.pre-migration'));
  const today = toVnDate(Date.now());

  const counts = tx(db, () => {
    const c: MigrationCounts = { departments: 0, users: 0, cameras: 0, detections: 0, requests: 0 };

    const deptIds = new Set<string>();
    for (const d of list(legacy.departments)) {
      db.prepare('INSERT INTO departments(id, code, name, description, manager_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)').run(
        d.id,
        text(d.code).toUpperCase(),
        text(d.name),
        text(d.description),
        text(d.createdAt, today) || today,
      );
      deptIds.add(d.id);
      c.departments++;
    }

    const userIds = new Set<string>();
    const userIdByName = new Map<string, string>();
    for (const u of list(legacy.users)) {
      const personId = orNull(u.hanetPersonId);
      db.prepare(
        `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
           face_registered, status, password_hash, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?)`,
      ).run(
        u.id,
        text(u.code).toUpperCase(),
        text(u.name),
        text(u.email),
        text(u.phone),
        ROLES.has(u.role) ? u.role : 'employee',
        deptIds.has(u.departmentId) ? u.departmentId : null,
        text(u.position),
        text(u.avatarUrl),
        personId && !FAKE_PERSON_ID.test(personId) ? personId : null,
        u.faceRegistered ? 1 : 0,
        u.status === 'inactive' ? 'inactive' : 'active',
        text(u.createdAt, today) || today,
      );
      userIds.add(u.id);
      if (!userIdByName.has(text(u.name))) userIdByName.set(text(u.name), u.id);
      c.users++;
    }

    for (const d of list(legacy.departments)) {
      if (userIds.has(d.managerId)) db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(d.managerId, d.id);
    }

    for (const cam of list(legacy.cameras)) {
      const r = db
        .prepare(
          `INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device_key) DO NOTHING`,
        )
        .run(cam.id, text(cam.name), text(cam.deviceKey), Number.isInteger(cam.placeId) ? cam.placeId : null, text(cam.placeName), text(cam.location), text(cam.ipAddress), text(cam.lastPing, today) || today);
      c.cameras += Number(r.changes);
    }

    const pairs = new Set<string>();
    for (const e of list(legacy.attendanceEvents)) {
      if (!userIds.has(e.employeeId) || typeof e.timestamp !== 'number') continue;
      const workDate = toVnDate(e.timestamp);
      const r = db
        .prepare(
          `INSERT INTO detections(user_id, hanet_person_id, device_id, device_name, place_id, ts, work_date, image_url, source)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, device_id, ts) DO NOTHING`,
        )
        .run(
          e.employeeId,
          orNull(e.cameraId) ?? 'UNKNOWN',
          orNull(e.cameraName),
          Number.isInteger(e.placeId) ? e.placeId : null,
          e.timestamp,
          workDate,
          orNull(e.detectedImageUrl),
          String(e.id ?? '').startsWith('att-sim') ? 'simulator' : 'webhook',
        );
      c.detections += Number(r.changes);
      pairs.add(`${e.employeeId}|${workDate}`);
    }

    for (const q of list(legacy.requests)) {
      if (!userIds.has(q.employeeId) || !REQUEST_TYPES.has(q.type)) continue;
      db.prepare(
        `INSERT INTO requests(id, user_id, work_date, type, reason, suggested_in, suggested_out, status, reviewed_by, reviewed_at, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      ).run(
        q.id,
        q.employeeId,
        text(q.date),
        q.type,
        text(q.reason),
        orNull(q.suggestedTime),
        REQUEST_STATUSES.has(q.status) ? q.status : 'pending',
        userIdByName.get(text(q.reviewedBy)) ?? null,
        orNull(q.reviewedAt),
        orNull(q.comment),
        text(q.createdAt, today) || today,
      );
      c.requests++;
    }

    const cfg = (legacy.config ?? {}) as Legacy;
    for (const [field, key] of [['clientId', 'hanet.client_id'], ['clientSecret', 'hanet.client_secret'], ['accessToken', 'hanet.access_token']] as const) {
      const v = orNull(cfg[field]);
      if (v) setSetting(db, key, v);
    }
    if (Number.isInteger(cfg.masterPlaceId) && cfg.masterPlaceId > 0) setSetting(db, 'hanet.place_ids', JSON.stringify([cfg.masterPlaceId]));

    for (const p of pairs) {
      const [userId, workDate] = p.split('|');
      recomputeDay(db, userId, workDate);
    }
    return c;
  });

  fs.renameSync(jsonPath, `${jsonPath}.migrated`);
  return counts;
}
```

- [ ] **Step 5: Chạy test và lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/migrate.ts tests/migrate.test.ts tests/fixtures/legacy-database.json
git commit -m "feat(migrate): one-time import from legacy database.json into SQLite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Lịch chạy, entry server mới, bỏ `server.ts`, ma trận phân quyền

**Files:**
- Create: `server/jobs.ts`, `server/check-node.ts`, `server/index.ts`, `tests/jobs.test.ts`, `tests/permissions.test.ts`
- Delete: `server.ts`

**Interfaces:**
- Consumes: mọi module server từ Task 1–12
- Produces:
  - `server/jobs.ts`: `interface DueJobs { backup: boolean; reconcileToday: boolean; reconcileYesterday: boolean; purgeSessions: boolean }`; `dueJobs(now: number): DueJobs`; `startJobs(ctx: AppContext): () => void` (trả hàm dừng)
  - `server/index.ts`: entry cho `npm run dev` và bản build `server.js`

**Lịch:** sao lưu 02:00; đối soát hôm nay mỗi 15 phút (gồm cả 23:30); đối soát lại hôm qua lúc 00:05 (bắt các lượt 23:30–23:59 mà lần cuối hôm qua chưa kéo); xóa phiên hết hạn mỗi giờ; lúc khởi động đối soát hôm qua và hôm nay. Bộ hẹn giờ chạy mỗi 20 giây và chỉ xử lý khi sang phút mới, nên không bỏ sót phút do lệch giờ của `setInterval`.

- [ ] **Step 1: Viết test thất bại `tests/jobs.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueJobs } from '../server/jobs';
import { vnDateTimeToTs } from '../server/vntime';

const at = (hhmm: string) => vnDateTimeToTs('2026-10-13', hhmm) + 30_000; // giữa phút

test('dueJobs theo giờ VN', () => {
  assert.deepEqual(dueJobs(at('02:00')), { backup: true, reconcileToday: true, reconcileYesterday: false, purgeSessions: true });
  assert.deepEqual(dueJobs(at('02:01')), { backup: false, reconcileToday: false, reconcileYesterday: false, purgeSessions: false });
  assert.equal(dueJobs(at('08:15')).reconcileToday, true);
  assert.equal(dueJobs(at('23:30')).reconcileToday, true);
  assert.equal(dueJobs(at('08:16')).reconcileToday, false);
  assert.equal(dueJobs(at('00:05')).reconcileYesterday, true);
  assert.equal(dueJobs(at('10:00')).purgeSessions, true);
});
```

- [ ] **Step 2: Viết test thất bại `tests/permissions.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client, type TestApp } from './helpers';

type Role = 'hr' | 'tp' | 'nv';
interface Case {
  method: 'GET' | 'POST' | 'PUT';
  path: (ids: Record<string, string>) => string;
  body?: unknown;
  allowed: Role[];
}

const ALL: Role[] = ['hr', 'tp', 'nv'];
const HR: Role[] = ['hr'];

// Đúng theo bảng phân quyền mục 5 của spec. "Được phép" = không phải 401/403 (có thể 200/400/404/409).
const CASES: Case[] = [
  { method: 'GET', path: () => '/api/users', allowed: ALL },
  { method: 'POST', path: () => '/api/users', body: { code: 'MOI01', name: 'Mới' }, allowed: HR },
  { method: 'PUT', path: (i) => `/api/users/${i.nv2}`, body: { position: 'X' }, allowed: HR },
  { method: 'POST', path: (i) => `/api/users/${i.nv2}/reset-password`, allowed: HR },
  { method: 'GET', path: () => '/api/departments', allowed: ALL },
  { method: 'POST', path: () => '/api/departments', body: { code: 'MOI', name: 'Mới' }, allowed: HR },
  { method: 'PUT', path: (i) => `/api/departments/${i.kt}`, body: { description: 'x' }, allowed: HR },
  { method: 'GET', path: () => '/api/cameras', allowed: ALL },
  { method: 'POST', path: () => '/api/cameras', body: { name: 'C', deviceKey: 'K1' }, allowed: HR },
  { method: 'GET', path: () => '/api/attendance', allowed: ALL },
  { method: 'POST', path: () => '/api/attendance/recompute', body: { from: '2026-10-13', to: '2026-10-13' }, allowed: HR },
  { method: 'GET', path: () => '/api/stats', allowed: ALL },
  { method: 'GET', path: () => '/api/requests', allowed: ALL },
  { method: 'POST', path: () => '/api/requests', body: { workDate: '2026-10-01', type: 'leave_request', reason: 'x' }, allowed: ALL },
  { method: 'PUT', path: (i) => `/api/requests/${i.req}`, body: { status: 'approved' }, allowed: ['hr', 'tp'] },
  { method: 'GET', path: () => '/api/settings/work', allowed: HR },
  { method: 'PUT', path: () => '/api/settings/work', body: { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 }, allowed: HR },
  { method: 'GET', path: () => '/api/hanet/config', allowed: HR },
  { method: 'PUT', path: () => '/api/hanet/config', body: {}, allowed: HR },
  { method: 'POST', path: () => '/api/hanet/webhook-token/rotate', allowed: HR },
  { method: 'GET', path: () => '/api/hanet/webhook-logs', allowed: HR },
  { method: 'POST', path: () => '/api/hanet/simulate', body: { userId: 'usr-khong-co' }, allowed: HR },
  { method: 'POST', path: () => '/api/hanet/reconcile', body: {}, allowed: HR },
  { method: 'GET', path: () => '/api/admin/backups', allowed: HR },
  { method: 'POST', path: () => '/api/admin/backups', allowed: HR },
  { method: 'POST', path: () => '/api/admin/reset-database', body: { password: 'sai' }, allowed: HR },
];

async function setup(): Promise<{ app: TestApp; ids: Record<string, string>; clients: Record<Role, Client> }> {
  const app = await startTestApp();
  const kt = seedDepartment(app.db, 'KT');
  const ids: Record<string, string> = {
    kt,
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv: seedUser(app.db, { code: 'NV01', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: kt }),
  };
  const nv2 = await loginAs(app, 'NV02');
  ids.req = (await nv2.post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' })).body.request.id;
  const clients = { hr: await loginAs(app, 'HR01'), tp: await loginAs(app, 'TP01'), nv: await loginAs(app, 'NV01') };
  return { app, ids, clients };
}

test('ma trận phân quyền: mỗi vai trò × mỗi API', async () => {
  const { app, ids, clients } = await setup();
  try {
    for (const c of CASES) {
      for (const role of ALL) {
        const r = await clients[role].req(c.method, c.path(ids), c.body);
        const label = `${role} ${c.method} ${c.path(ids)} → ${r.status} ${JSON.stringify(r.body)}`;
        assert.notEqual(r.status, 401, label);
        if (c.allowed.includes(role)) assert.notEqual(r.status, 403, label);
        else assert.equal(r.status, 403, label);
      }
    }
  } finally {
    await app.close();
  }
});

test('chưa đăng nhập: mọi API trong ma trận trả 401', async () => {
  const { app, ids } = await setup();
  try {
    const anon = new Client(app.baseUrl);
    for (const c of CASES) {
      const r = await anon.req(c.method, c.path(ids), c.body);
      assert.equal(r.status, 401, `${c.method} ${c.path(ids)}`);
    }
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npm test`
Expected: `jobs.test.ts` FAIL (không tìm thấy `../server/jobs`). `permissions.test.ts` có thể PASS ngay vì các route đã có từ Task 6–11; nếu có dòng FAIL thì đó là lỗi phân quyền thật cần sửa ở route tương ứng trước khi đi tiếp.

- [ ] **Step 4: Tạo `server/jobs.ts`**

```ts
import type { AppContext } from './context';
import { backupNow } from './backup';
import { purgeExpiredSessions } from './auth';
import { reconcileEnabled } from './hanet';
import { reconcileDate, type HanetDeps } from './hanet-api';
import { addDays, toVnDate, vnMinutesOfDay } from './vntime';

export interface DueJobs {
  backup: boolean;
  reconcileToday: boolean;
  reconcileYesterday: boolean;
  purgeSessions: boolean;
}

export function dueJobs(now: number): DueJobs {
  const m = vnMinutesOfDay(now);
  return {
    backup: m === 2 * 60,
    reconcileToday: m % 15 === 0,
    reconcileYesterday: m === 5,
    purgeSessions: m % 60 === 0,
  };
}

export function startJobs(ctx: AppContext): () => void {
  const running = new Set<string>();
  const deps: HanetDeps = { db: ctx.db, fetch: ctx.fetch, now: ctx.now };

  const run = (name: string, fn: () => unknown) => {
    if (running.has(name)) return;
    running.add(name);
    Promise.resolve()
      .then(fn)
      .catch((err) => console.error(`[JOB] ${name} lỗi:`, (err as Error).message))
      .finally(() => running.delete(name));
  };

  let lastMinute = -1;
  const tick = () => {
    const now = ctx.now();
    const minute = Math.floor(now / 60_000);
    if (minute === lastMinute) return;
    lastMinute = minute;
    const due = dueJobs(now);
    const today = toVnDate(now);
    if (due.backup) run('backup', () => backupNow(ctx.db, ctx.config.backupDir, 'daily', now));
    if (due.purgeSessions) run('purge-sessions', () => purgeExpiredSessions(ctx.db, now));
    if (reconcileEnabled(ctx.db)) {
      if (due.reconcileToday) run('reconcile-today', () => reconcileDate(deps, today));
      if (due.reconcileYesterday) run('reconcile-yesterday', () => reconcileDate(deps, addDays(today, -1)));
    }
  };

  if (reconcileEnabled(ctx.db)) {
    const today = toVnDate(ctx.now());
    run('reconcile-startup', async () => {
      await reconcileDate(deps, addDays(today, -1));
      await reconcileDate(deps, today);
    });
  }

  const timer = setInterval(tick, 20_000);
  timer.unref();
  return () => clearInterval(timer);
}
```

- [ ] **Step 5: Tạo `server/check-node.ts`**

```ts
// Phải là import đầu tiên của server/index.ts: chạy trước khi bất kỳ module nào nạp node:sqlite.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`[STARTUP] Cần Node.js >= 22.13 (đang chạy ${process.versions.node}). Hãy nâng cấp Node rồi chạy lại.`);
  process.exit(1);
}

export {};
```

- [ ] **Step 6: Tạo `server/index.ts`**

```ts
import './check-node';
import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { openDb } from './db';
import { createApp } from './app';
import { LoginLimiter } from './auth';
import { migrateFromJson } from './migrate';
import { ensureAdminAccess } from './bootstrap';
import { startJobs } from './jobs';
import type { AppContext } from './context';

const production = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3001;
const dataDir = path.resolve(process.cwd(), 'data');
const backupDir = path.join(dataDir, 'backups');

async function main() {
  const db = openDb(path.join(dataDir, 'attendance.db'));

  const migrated = migrateFromJson(db, path.join(dataDir, 'database.json'), backupDir);
  if (migrated) console.log('[MIGRATE] Đã chuyển dữ liệu từ data/database.json:', migrated);

  const admin = ensureAdminAccess(db, process.env.ADMIN_INITIAL_PASSWORD);
  if (admin) {
    console.log(
      admin.fromEnv
        ? `[BOOTSTRAP] Tài khoản ${admin.code} dùng mật khẩu ADMIN_INITIAL_PASSWORD (bắt buộc đổi ở lần đăng nhập đầu).`
        : `[BOOTSTRAP] Mật khẩu tạm tài khoản ${admin.code}: ${admin.password} (bắt buộc đổi ở lần đăng nhập đầu).`,
    );
  }

  const ctx: AppContext = {
    db,
    config: {
      production,
      simulatorEnabled: !production || process.env.ENABLE_SIMULATOR === '1',
      trustProxy: process.env.TRUST_PROXY === '1',
      backupDir,
    },
    limiter: new LoginLimiter(),
    fetch: globalThis.fetch,
    now: () => Date.now(),
  };

  const app = createApp(ctx);
  if (!production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  startJobs(ctx);
  app.listen(PORT, '0.0.0.0', () => console.log(`[Hanet Attendance] Đang chạy tại http://0.0.0.0:${PORT}`));
}

main().catch((err) => {
  console.error('[STARTUP] Không khởi động được:', err);
  process.exit(1);
});
```

- [ ] **Step 7: Xóa server cũ**

```bash
git rm server.ts
```

(`server.js` cũ được build lại ở Task 16; để nguyên đến lúc đó.)

- [ ] **Step 8: Chạy test, lint và thử build server**

Run: `npm test && npm run lint && npm run build:server && head -5 server.js`
Expected: test PASS; lint PASS; `server.js` bắt đầu bằng phần `server/check-node.ts`, không có dòng `import ... from "node:sqlite"` ở đầu file (chỉ có `createRequire`).

Kiểm tra thêm: `grep -n 'node:sqlite' server.js` chỉ ra dòng `require("node:sqlite")`.

- [ ] **Step 9: Thử chạy dev server**

Run (trong scratch, không đụng `data/` thật của repo):

```bash
SMOKE=$(mktemp -d) && cp -r index.html vite.config.ts tsconfig.json package.json src shared server "$SMOKE"/ && ln -s "$PWD/node_modules" "$SMOKE/node_modules" && cd "$SMOKE" && (PORT=3098 npx tsx server/index.ts > server.log 2>&1 &) && sleep 4 && curl -s localhost:3098/api/health && grep BOOTSTRAP server.log; pkill -f "server/index.ts"
```

Expected: `{"ok":true}` và một dòng `[BOOTSTRAP] Mật khẩu tạm tài khoản ADMIN: ...`.

- [ ] **Step 10: Commit**

```bash
git add server/jobs.ts server/check-node.ts server/index.ts tests/jobs.test.ts tests/permissions.test.ts
git commit -m "feat(server): new entry with Node check, scheduled jobs; remove legacy server.ts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Frontend — đăng nhập, đổi mật khẩu, khung App, bảng công theo ngày

**Files:**
- Create: `src/api.ts`, `src/format.ts`, `src/components/ui.tsx`, `src/components/LoginScreen.tsx`, `src/components/ChangePasswordScreen.tsx`
- Modify (viết lại toàn bộ): `src/types.ts`, `src/App.tsx`, `src/components/Navbar.tsx`, `src/components/StatsCards.tsx`, `src/components/AttendanceTable.tsx`

**Interfaces:**
- Consumes: API từ Task 5–9; types từ `shared/types.ts`
- Produces:
  - `src/api.ts`: `class ApiError(status, message, code?)`; `api<T>(path, { method?, body? }?): Promise<T>`; `errorMessage(err): string`; `AUTH_EVENT = 'hgc:auth'`; `type AuthEventDetail = 'logged-out' | 'must-change-password'`
  - `src/format.ts`: `vnToday(): string`; `fmtTime(ts: number | null): string`; `fmtDateTime(v: string | number): string`; `DAY_STATUS_LABEL`; `ROLE_LABEL`
  - `src/components/ui.tsx`: `Modal`, `Field`, `inputCls`, `primaryBtn`, `secondaryBtn`, `dangerBtn`
  - Các component Task 15 nhận props như trong `App.tsx` ở Step 8 bên dưới

**Kiểm chứng:** frontend không có unit test; kiểm bằng `npm run lint`, `npx vite build` và chạy thử trên trình duyệt (Step 11). Sau task này lint còn lỗi ở các file Task 15 viết lại (`RequestsTab`, `EmployeesTab`, `DepartmentsTab`, `CamerasTab`, `HanetConfigTab`, `HanetSimulatorModal`) và ở chỗ `App.tsx` dùng chúng; mọi file khác phải sạch lỗi.

- [ ] **Step 1: Viết lại `src/types.ts`**

```ts
export * from '../shared/types';
```

- [ ] **Step 2: Tạo `src/api.ts`**

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const AUTH_EVENT = 'hgc:auth';
export type AuthEventDetail = 'logged-out' | 'must-change-password';

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error ?? `Lỗi ${res.status}`, data?.code);
    if (res.status === 401 && path !== '/api/auth/login') {
      window.dispatchEvent(new CustomEvent<AuthEventDetail>(AUTH_EVENT, { detail: 'logged-out' }));
    }
    if (err.code === 'MUST_CHANGE_PASSWORD') {
      window.dispatchEvent(new CustomEvent<AuthEventDetail>(AUTH_EVENT, { detail: 'must-change-password' }));
    }
    throw err;
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
}
```

- [ ] **Step 3: Tạo `src/format.ts`**

```ts
import type { DayStatus, UserRole } from './types';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function vnToday(): string {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' });

export function fmtTime(ts: number | null): string {
  return ts === null ? '—' : timeFmt.format(ts);
}

export function fmtDateTime(v: string | number): string {
  return dateTimeFmt.format(new Date(v));
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  on_time: 'Đúng giờ',
  late: 'Đi muộn',
  early_leave: 'Về sớm',
  late_and_early: 'Muộn & về sớm',
  missing_out: 'Thiếu giờ ra',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  hr: 'Quản trị viên Nhân sự (HR)',
  dept_manager: 'Trưởng phòng',
  employee: 'Nhân viên',
};
```

- [ ] **Step 4: Tạo `src/components/ui.tsx`**

```tsx
import React from 'react';

export const inputCls =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-hidden focus:border-orange-500 disabled:bg-slate-50';
export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50';
export const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50';
export const dangerBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50';

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({
  title,
  onClose,
  children,
  wide,
}) => (
  <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
    <div className={`bg-white rounded-3xl ${wide ? 'max-w-2xl' : 'max-w-md'} w-full overflow-hidden shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col`}>
      <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
        <span className="font-bold text-sm">{title}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 cursor-pointer" aria-label="Đóng">
          ✕
        </button>
      </div>
      <div className="p-5 overflow-y-auto text-xs">{children}</div>
    </div>
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="block">
    <span className="block font-semibold text-slate-700 mb-1 text-xs">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
  </label>
);
```

- [ ] **Step 5: Tạo `src/components/LoginScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn } from './ui';

export const LoginScreen: React.FC<{ onLoggedIn: () => void }> = ({ onLoggedIn }) => {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { code, password } });
      onLoggedIn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">Hệ thống điểm danh Hanet</h1>
            <p className="text-xs text-slate-500">Đăng nhập bằng mã nhân viên</p>
          </div>
        </div>
        <Field label="Mã nhân viên">
          <input className={`${inputCls} uppercase font-mono`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Mật khẩu">
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full py-2.5`}>
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
        <p className="text-[11px] text-slate-400">Quên mật khẩu? Liên hệ phòng Nhân sự để được cấp lại mật khẩu tạm.</p>
      </form>
    </div>
  );
};
```

- [ ] **Step 6: Tạo `src/components/ChangePasswordScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn, secondaryBtn } from './ui';

interface Props {
  forced: boolean;
  onDone: () => void;
  onCancel: () => void;
  onLogout: () => void;
}

export const ChangePasswordScreen: React.FC<Props> = ({ forced, onDone, onCancel, onLogout }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-orange-500" />
          <h1 className="font-bold text-slate-900">Đổi mật khẩu</h1>
        </div>
        {forced && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2">
            Bạn đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới (ít nhất 8 ký tự) để tiếp tục.
          </p>
        )}
        <Field label={forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'}>
          <input className={inputCls} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="Mật khẩu mới">
          <input className={inputCls} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Nhập lại mật khẩu mới">
          <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={forced ? onLogout : onCancel} className={`${secondaryBtn} flex-1`}>
            {forced ? 'Đăng xuất' : 'Hủy'}
          </button>
          <button type="submit" disabled={busy} className={`${primaryBtn} flex-1`}>
            {busy ? 'Đang lưu...' : 'Đổi mật khẩu'}
          </button>
        </div>
      </form>
    </div>
  );
};
```

- [ ] **Step 7: Viết lại `src/components/Navbar.tsx`**

```tsx
import React from 'react';
import { Camera as CameraIcon, KeyRound, LogOut, Video } from 'lucide-react';
import type { User } from '../types';
import { ROLE_LABEL } from '../format';

interface NavbarProps {
  currentUser: User;
  totalCameraCount: number;
  showSimulator: boolean;
  onOpenSimulator: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const ROLE_BADGE: Record<User['role'], string> = {
  hr: 'bg-rose-100 text-rose-700 border-rose-200',
  dept_manager: 'bg-amber-100 text-amber-800 border-amber-200',
  employee: 'bg-sky-100 text-sky-800 border-sky-200',
};

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  totalCameraCount,
  showSimulator,
  onOpenSimulator,
  onChangePassword,
  onLogout,
  activeTab,
  setActiveTab,
}) => {
  const tabs: { id: string; label: string; visible: boolean }[] = [
    { id: 'attendance', label: '📊 Bảng công', visible: true },
    { id: 'requests', label: '📝 Đơn giải trình / Xin phép', visible: true },
    { id: 'cameras', label: `📹 Camera Hanet (${totalCameraCount})`, visible: currentUser.role !== 'employee' },
    { id: 'departments', label: '🏢 Phòng ban', visible: currentUser.role !== 'employee' },
    { id: 'employees', label: '👤 Nhân sự', visible: currentUser.role === 'hr' },
    { id: 'hanet_config', label: '⚡ Cấu hình', visible: currentUser.role === 'hr' },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shrink-0">
              <CameraIcon className="w-6 h-6" />
            </div>
            <span className="font-bold text-lg text-slate-900 tracking-tight truncate">Hanet Attendance</span>
          </div>

          <div className="flex items-center gap-2">
            {showSimulator && (
              <button
                onClick={onOpenSimulator}
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
              >
                <Video className="w-4 h-4" />
                <span>Mô phỏng</span>
              </button>
            )}
            <div className="hidden md:block text-right">
              <div className="text-xs font-semibold text-slate-800 leading-tight">
                {currentUser.name} <span className="font-mono text-slate-400">({currentUser.code})</span>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${ROLE_BADGE[currentUser.role]}`}>
                {ROLE_LABEL[currentUser.role]}
                {currentUser.departmentName ? ` · ${currentUser.departmentName}` : ''}
              </span>
            </div>
            <button onClick={onChangePassword} title="Đổi mật khẩu" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <KeyRound className="w-4 h-4 text-slate-600" />
            </button>
            <button onClick={onLogout} title="Đăng xuất" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <LogOut className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto py-2 -mb-px border-t border-slate-100 text-xs font-medium">
          {tabs
            .filter((t) => t.visible)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  activeTab === t.id ? 'bg-slate-900 text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
        </nav>
      </div>
    </header>
  );
};
```

(Tab Camera ẩn với nhân viên: API vẫn cho xem, nhưng thông tin camera không có ích cho nhân viên.)

- [ ] **Step 8: Viết lại `src/App.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { StatsCards } from './components/StatsCards';
import { AttendanceTable } from './components/AttendanceTable';
import { CamerasTab } from './components/CamerasTab';
import { DepartmentsTab } from './components/DepartmentsTab';
import { EmployeesTab } from './components/EmployeesTab';
import { RequestsTab } from './components/RequestsTab';
import { HanetConfigTab } from './components/HanetConfigTab';
import { HanetSimulatorModal } from './components/HanetSimulatorModal';
import { LoginScreen } from './components/LoginScreen';
import { ChangePasswordScreen } from './components/ChangePasswordScreen';
import { api, ApiError, AUTH_EVENT, errorMessage, type AuthEventDetail } from './api';
import { vnToday } from './format';
import type { AttendanceDay, AttendanceRequest, Camera, Department, MeResponse, StatsData, User } from './types';

type AuthState = 'loading' | 'anonymous' | 'must-change' | 'ready';

const TABS_BY_ROLE: Record<User['role'], string[]> = {
  hr: ['attendance', 'requests', 'cameras', 'departments', 'employees', 'hanet_config'],
  dept_manager: ['attendance', 'requests', 'cameras', 'departments'],
  employee: ['attendance', 'requests'],
};

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [records, setRecords] = useState<AttendanceDay[]>([]);
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);

  const [activeTab, setActiveTab] = useState('attendance');
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(vnToday());
  const [selectedDept, setSelectedDept] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState('');

  const loadMe = useCallback(async () => {
    try {
      const data = await api<MeResponse>('/api/auth/me');
      setMe(data);
      setAuthState(data.mustChangePassword ? 'must-change' : 'ready');
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
        setAuthState('anonymous');
      } else {
        setLoadError(errorMessage(err));
        setAuthState('anonymous');
      }
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    const onAuth = (e: Event) => {
      const detail = (e as CustomEvent<AuthEventDetail>).detail;
      if (detail === 'logged-out') {
        setMe(null);
        setAuthState('anonymous');
      } else {
        setAuthState('must-change');
      }
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ date: selectedDate || vnToday(), departmentId: selectedDept, search: searchQuery });
      const [u, d, c, a, r, s] = await Promise.all([
        api<{ users: User[] }>('/api/users'),
        api<{ departments: Department[] }>('/api/departments'),
        api<{ cameras: Camera[] }>('/api/cameras'),
        api<{ records: AttendanceDay[] }>(`/api/attendance?${q}`),
        api<{ requests: AttendanceRequest[] }>('/api/requests'),
        api<StatsData>('/api/stats'),
      ]);
      setUsers(u.users);
      setDepartments(d.departments);
      setCameras(c.cameras);
      setRecords(a.records);
      setRequests(r.requests);
      setStats(s);
      setLoadError(null);
      setLastRefreshed(new Date().toLocaleTimeString('vi-VN'));
    } catch (err) {
      if (!(err instanceof ApiError && (err.status === 401 || err.code === 'MUST_CHANGE_PASSWORD'))) setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedDept, searchQuery]);

  useEffect(() => {
    if (authState === 'ready') fetchData();
  }, [authState, fetchData]);

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // phiên có thể đã hết hạn; vẫn đưa về màn đăng nhập
    }
    setMe(null);
    setChangingPassword(false);
    setActiveTab('attendance');
    setAuthState('anonymous');
  };

  if (authState === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Đang tải...</div>;
  }
  if (authState === 'anonymous') return <LoginScreen onLoggedIn={loadMe} />;
  if (authState === 'must-change' || changingPassword || !me) {
    return (
      <ChangePasswordScreen
        forced={authState === 'must-change'}
        onDone={() => {
          setChangingPassword(false);
          loadMe();
        }}
        onCancel={() => setChangingPassword(false)}
        onLogout={logout}
      />
    );
  }

  const currentUser = me.user;
  const tab = TABS_BY_ROLE[currentUser.role].includes(activeTab) ? activeTab : 'attendance';
  const refreshAll = () => {
    fetchData();
    loadMe();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans antialiased">
      <Navbar
        currentUser={currentUser}
        totalCameraCount={cameras.length}
        showSimulator={me.simulatorEnabled && currentUser.role === 'hr'}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onChangePassword={() => setChangingPassword(true)}
        onLogout={logout}
        activeTab={tab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          {loadError ? (
            <span className="flex items-center gap-1.5 text-rose-600">
              <AlertCircle className="w-4 h-4" /> {loadError}
            </span>
          ) : (
            <span />
          )}
          <button onClick={() => fetchData()} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium cursor-pointer">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
            <span>Cập nhật ({lastRefreshed || 'mới nhất'})</span>
          </button>
        </div>

        <StatsCards stats={stats} currentUser={currentUser} />

        {tab === 'attendance' && (
          <AttendanceTable
            records={records}
            currentUser={currentUser}
            departments={departments}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedDept={selectedDept}
            setSelectedDept={setSelectedDept}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        )}
        {tab === 'requests' && <RequestsTab requests={requests} currentUser={currentUser} onRefresh={fetchData} />}
        {tab === 'cameras' && <CamerasTab cameras={cameras} currentUser={currentUser} onRefresh={fetchData} />}
        {tab === 'departments' && <DepartmentsTab departments={departments} users={users} currentUser={currentUser} onRefresh={refreshAll} />}
        {tab === 'employees' && <EmployeesTab users={users} departments={departments} currentUser={currentUser} onRefresh={refreshAll} />}
        {tab === 'hanet_config' && <HanetConfigTab onRefresh={fetchData} />}
      </main>

      {me.simulatorEnabled && currentUser.role === 'hr' && (
        <HanetSimulatorModal
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          cameras={cameras}
          users={users}
          onSimulateSuccess={fetchData}
        />
      )}

      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        Hệ thống Điểm danh Camera AI Hanet
      </footer>
    </div>
  );
}
```

- [ ] **Step 9: Viết lại `src/components/StatsCards.tsx`**

```tsx
import React from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, LogOut, UserX, Users } from 'lucide-react';
import type { StatsData, User } from '../types';

interface StatsCardsProps {
  stats: StatsData | null;
  currentUser: User;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, currentUser }) => {
  if (!stats) return null;
  const scopeLabel =
    currentUser.role === 'hr' ? 'Toàn công ty' : currentUser.role === 'dept_manager' ? `Phòng ${currentUser.departmentName ?? ''}` : 'Cá nhân';
  const cards = [
    { label: 'Nhân sự đang làm', value: stats.totalEmployees, icon: Users, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Có mặt hôm nay', value: stats.presentCount, icon: CheckCircle, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Vào đúng giờ', value: stats.onTimeCount, icon: Clock, tone: 'bg-sky-100 text-sky-700' },
    { label: 'Đi muộn', value: stats.lateCount, icon: AlertTriangle, tone: 'bg-rose-100 text-rose-700' },
    { label: 'Chưa có giờ ra', value: stats.missingOutCount, icon: LogOut, tone: 'bg-amber-100 text-amber-700' },
    { label: 'Chưa điểm danh', value: stats.notCheckedInCount, icon: UserX, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Đơn chờ duyệt', value: stats.pendingRequests, icon: FileText, tone: 'bg-purple-100 text-purple-700' },
  ];
  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Hôm nay {stats.date.split('-').reverse().join('/')} · {scopeLabel}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.tone}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-900 leading-tight">{c.value}</div>
              <div className="text-[11px] text-slate-500 truncate">{c.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 10: Viết lại `src/components/AttendanceTable.tsx`**

```tsx
import React, { useState } from 'react';
import { AlertCircle, Download, Eye, Lock, Search } from 'lucide-react';
import type { AttendanceDay, DayStatus, Department, Detection, User } from '../types';
import { api, errorMessage } from '../api';
import { DAY_STATUS_LABEL, fmtTime } from '../format';
import { Modal, inputCls } from './ui';

interface AttendanceTableProps {
  records: AttendanceDay[];
  currentUser: User;
  departments: Department[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const STATUS_STYLE: Record<DayStatus, string> = {
  on_time: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  late: 'bg-rose-50 text-rose-700 border-rose-200',
  early_leave: 'bg-amber-50 text-amber-700 border-amber-200',
  late_and_early: 'bg-rose-50 text-rose-700 border-rose-200',
  missing_out: 'bg-slate-100 text-slate-700 border-slate-200',
};

const SOURCE_LABEL: Record<Detection['source'], string> = { webhook: 'Webhook', reconcile: 'Đối soát', simulator: 'Mô phỏng' };

export const AttendanceTable: React.FC<AttendanceTableProps> = ({
  records,
  currentUser,
  departments,
  selectedDate,
  setSelectedDate,
  selectedDept,
  setSelectedDept,
  searchQuery,
  setSearchQuery,
}) => {
  const [detail, setDetail] = useState<{ day: AttendanceDay; detections: Detection[] | null; error: string | null } | null>(null);
  const role = currentUser.role;

  const openDetail = async (day: AttendanceDay) => {
    setDetail({ day, detections: null, error: null });
    try {
      const data = await api<{ detections: Detection[] }>(`/api/attendance/${day.userId}/${day.workDate}/detections`);
      setDetail({ day, detections: data.detections, error: null });
    } catch (err) {
      setDetail({ day, detections: [], error: errorMessage(err) });
    }
  };

  const handleExportCSV = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const headers = ['Mã NV', 'Họ tên', 'Phòng', 'Ngày', 'Giờ vào', 'Giờ ra', 'Phút muộn', 'Phút về sớm', 'Trạng thái'];
    const rows = records.map((r) =>
      [r.employeeCode, r.employeeName, r.departmentName ?? '', r.workDate, fmtTime(r.firstIn), fmtTime(r.lastOut), r.lateMinutes, r.earlyMinutes, DAY_STATUS_LABEL[r.status]]
        .map(esc)
        .join(','),
    );
    const blob = new Blob(['﻿' + [headers.map(esc).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bang_cong_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="px-4 py-2.5 text-xs flex items-center justify-between border-b bg-slate-50 border-slate-100 text-slate-700">
        <span className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          {role === 'hr' && 'Bạn xem được bảng công của toàn công ty.'}
          {role === 'dept_manager' && `Bạn xem được bảng công của phòng ${currentUser.departmentName ?? ''}.`}
          {role === 'employee' && 'Bạn xem được bảng công của chính mình.'}
        </span>
        <span className="text-[11px]">{records.length} người</span>
      </div>

      <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {role !== 'employee' && (
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm theo tên hoặc mã NV..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputCls} pl-9`}
              />
            </div>
          )}
          <input type="date" value={selectedDate} onChange={(e) => e.target.value && setSelectedDate(e.target.value)} className={`${inputCls} w-auto`} />
          {role === 'hr' && (
            <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="">Tất cả phòng ban</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={handleExportCSV}
          disabled={records.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Xuất CSV</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4">Nhân sự</th>
              <th className="py-3 px-4">Phòng ban</th>
              <th className="py-3 px-4">Giờ vào</th>
              <th className="py-3 px-4">Giờ ra</th>
              <th className="py-3 px-4">Trạng thái</th>
              <th className="py-3 px-4">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="w-8 h-8 text-slate-300" />
                    <span>Không có dữ liệu điểm danh cho ngày này</span>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={`${r.userId}-${r.workDate}`} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{r.employeeName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{r.employeeCode}</div>
                  </td>
                  <td className="py-3 px-4">{r.departmentName ?? '—'}</td>
                  <td className="py-3 px-4 font-mono">
                    {fmtTime(r.firstIn)}
                    {r.manualIn !== null && <span className="ml-1 text-[10px] text-blue-600">(bổ sung)</span>}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {fmtTime(r.lastOut)}
                    {r.manualOut !== null && <span className="ml-1 text-[10px] text-blue-600">(bổ sung)</span>}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold border ${STATUS_STYLE[r.status]}`}>
                      {DAY_STATUS_LABEL[r.status]}
                      {r.lateMinutes > 0 && ` · muộn ${r.lateMinutes}'`}
                      {r.earlyMinutes > 0 && ` · sớm ${r.earlyMinutes}'`}
                    </span>
                    {r.lateExcused && <div className="text-[10px] text-emerald-600 mt-0.5">Đã duyệt giải trình</div>}
                  </td>
                  <td className="py-3 px-4">
                    <button onClick={() => openDetail(r)} className="text-[11px] text-blue-600 font-medium hover:underline flex items-center gap-1 cursor-pointer">
                      <Eye className="w-3 h-3" /> {r.detectionCount} lượt
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal title={`${detail.day.employeeName} · ${detail.day.workDate.split('-').reverse().join('/')}`} onClose={() => setDetail(null)} wide>
          {detail.error && <p className="text-rose-600 mb-2">{detail.error}</p>}
          {detail.detections === null ? (
            <p className="text-slate-500">Đang tải...</p>
          ) : detail.detections.length === 0 ? (
            <p className="text-slate-500">Không có lượt nhận diện (giờ công được bổ sung từ đơn).</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {detail.detections.map((d) => (
                <div key={d.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  {d.imageUrl ? (
                    <img src={d.imageUrl} alt="" className="w-full aspect-square object-cover bg-slate-100" />
                  ) : (
                    <div className="w-full aspect-square bg-slate-100 flex items-center justify-center text-slate-400">Không có ảnh</div>
                  )}
                  <div className="p-2">
                    <div className="font-mono font-semibold">{fmtTime(d.ts)}</div>
                    <div className="text-[11px] text-slate-500 truncate">{d.deviceName ?? d.deviceId}</div>
                    <div className="text-[10px] text-slate-400">{SOURCE_LABEL[d.source]}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};
```

- [ ] **Step 11: Kiểm tra biên dịch**

Run: `npx vite build`
Expected: build thành công (Vite chỉ biên dịch, không kiểm kiểu).

Run: `npm run lint 2>&1 | grep 'error TS' | grep -v -E 'src/components/(RequestsTab|EmployeesTab|DepartmentsTab|CamerasTab|HanetConfigTab|HanetSimulatorModal)\.tsx|src/App\.tsx' || echo "OK"`
Expected: `OK`. Lỗi kiểu còn lại chỉ nằm trong 6 component Task 15 viết lại và ở chỗ `App.tsx` truyền props mới cho chúng; Task 15 xử lý hết.

(Chạy thử trên trình duyệt làm ở cuối Task 15, khi toàn bộ frontend đã biên dịch sạch.)

- [ ] **Step 12: Commit**

```bash
git add src/api.ts src/format.ts src/types.ts src/App.tsx src/components/ui.tsx src/components/LoginScreen.tsx src/components/ChangePasswordScreen.tsx src/components/Navbar.tsx src/components/StatsCards.tsx src/components/AttendanceTable.tsx
git commit -m "feat(ui): login and forced password change, daily attendance table, scoped stats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Frontend — đơn, nhân sự, phòng ban, camera, cấu hình, mô phỏng

**Files:**
- Create: `src/components/TempPasswordDialog.tsx`, `src/components/UserFormModal.tsx`, `src/components/config/WebhookCard.tsx`, `src/components/config/WorkSettingsCard.tsx`, `src/components/config/HanetCredentialsCard.tsx`, `src/components/config/BackupsCard.tsx`, `src/components/config/WebhookLogsCard.tsx`, `src/components/config/DangerZoneCard.tsx`
- Modify (viết lại toàn bộ): `src/components/RequestsTab.tsx`, `src/components/EmployeesTab.tsx`, `src/components/DepartmentsTab.tsx`, `src/components/CamerasTab.tsx`, `src/components/HanetConfigTab.tsx`, `src/components/HanetSimulatorModal.tsx`

**Interfaces:**
- Consumes: `api`, `errorMessage` (Task 14); `Modal`, `Field`, `inputCls`, `primaryBtn`, `secondaryBtn`, `dangerBtn` (Task 14); `vnToday`, `fmtDateTime`, `ROLE_LABEL` (Task 14); props đúng như `App.tsx` Task 14 truyền vào
- Produces: frontend biên dịch sạch (`npm run lint` không lỗi)

- [ ] **Step 1: Viết lại `src/components/RequestsTab.tsx`**

```tsx
import React, { useState } from 'react';
import { CheckCircle, Clock, MessageSquare, Plus, XCircle } from 'lucide-react';
import type { AttendanceRequest, RequestType, User } from '../types';
import { api, errorMessage } from '../api';
import { vnToday } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface RequestsTabProps {
  requests: AttendanceRequest[];
  currentUser: User;
  onRefresh: () => void;
}

const TYPE_META: Record<RequestType, { label: string; badge: string }> = {
  late_explanation: { label: 'Giải trình đi muộn', badge: 'bg-amber-100 text-amber-800' },
  missed_punch: { label: 'Quên quẹt mặt', badge: 'bg-blue-100 text-blue-800' },
  leave_request: { label: 'Xin nghỉ', badge: 'bg-purple-100 text-purple-800' },
};

export const RequestsTab: React.FC<RequestsTabProps> = ({ requests, currentUser, onRefresh }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [type, setType] = useState<RequestType>('late_explanation');
  const [workDate, setWorkDate] = useState(vnToday());
  const [suggestedIn, setSuggestedIn] = useState('');
  const [suggestedOut, setSuggestedOut] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canReview = (req: AttendanceRequest) => currentUser.role !== 'employee' && req.userId !== currentUser.id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api('/api/requests', {
        method: 'POST',
        body: {
          workDate,
          type,
          reason,
          ...(type === 'missed_punch' ? { suggestedIn: suggestedIn || undefined, suggestedOut: suggestedOut || undefined } : {}),
        },
      });
      setShowAdd(false);
      setReason('');
      setSuggestedIn('');
      setSuggestedOut('');
      onRefresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const review = async (id: string, status: 'approved' | 'rejected') => {
    const comment = window.prompt(status === 'approved' ? 'Ghi chú khi duyệt (có thể để trống):' : 'Lý do từ chối:') ?? null;
    if (comment === null) return;
    setBusyId(id);
    try {
      await api(`/api/requests/${id}`, { method: 'PUT', body: { status, comment } });
      onRefresh();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Đơn giải trình & xin phép</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {currentUser.role === 'employee'
              ? 'Gửi giải trình khi đi muộn có lý do, quên quẹt mặt, hoặc xin nghỉ.'
              : 'Duyệt đơn của nhân viên trong phạm vi bạn quản lý. Không thể tự duyệt đơn của mình.'}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className={primaryBtn}>
          <Plus className="w-4 h-4" /> Tạo đơn mới
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 text-xs font-bold text-slate-800">Danh sách đơn ({requests.length})</div>
        {requests.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">Chưa có đơn nào</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((req) => (
              <div key={req.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_META[req.type].badge}`}>{TYPE_META[req.type].label}</span>
                    <span className="font-bold text-slate-900">{req.employeeName}</span>
                    <span className="text-[11px] text-slate-400">Ngày {req.workDate.split('-').reverse().join('/')}</span>
                  </div>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-w-2xl">"{req.reason}"</p>
                  {(req.suggestedIn || req.suggestedOut) && (
                    <div className="text-[11px] text-slate-500">
                      Giờ đề xuất: vào <strong className="font-mono">{req.suggestedIn ?? '—'}</strong>, ra{' '}
                      <strong className="font-mono">{req.suggestedOut ?? '—'}</strong>
                    </div>
                  )}
                  {req.reviewerName && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> {req.reviewerName}
                      {req.comment ? `: ${req.comment}` : ''}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {req.status === 'pending' ? (
                    canReview(req) ? (
                      <div className="flex gap-1.5">
                        <button disabled={busyId === req.id} onClick={() => review(req.id, 'approved')} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50">
                          <CheckCircle className="w-3.5 h-3.5" /> Duyệt
                        </button>
                        <button disabled={busyId === req.id} onClick={() => review(req.id, 'rejected')} className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold border border-rose-200 flex items-center gap-1 cursor-pointer disabled:opacity-50">
                          <XCircle className="w-3.5 h-3.5" /> Từ chối
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="w-3.5 h-3.5" /> Chờ duyệt
                      </span>
                    )
                  ) : req.status === 'approved' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5" /> Đã duyệt
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      <XCircle className="w-3.5 h-3.5" /> Từ chối
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Tạo đơn mới" onClose={() => setShowAdd(false)}>
          <form onSubmit={submit} className="space-y-3.5">
            <Field label="Loại đơn">
              <select value={type} onChange={(e) => setType(e.target.value as RequestType)} className={inputCls}>
                <option value="late_explanation">Giải trình đi muộn có lý do</option>
                <option value="missed_punch">Quên quẹt mặt (bổ sung giờ vào/ra)</option>
                <option value="leave_request">Xin nghỉ</option>
              </select>
            </Field>
            <Field label="Ngày áp dụng">
              <input type="date" required max={vnToday()} value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputCls} />
            </Field>
            {type === 'missed_punch' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Giờ vào đề xuất">
                  <input type="time" value={suggestedIn} onChange={(e) => setSuggestedIn(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Giờ ra đề xuất">
                  <input type="time" value={suggestedOut} onChange={(e) => setSuggestedOut(e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}
            <Field label="Lý do">
              <textarea rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
            </Field>
            {formError && <p className="text-rose-600">{formError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowAdd(false)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`}>
                Gửi đơn
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Tạo `src/components/TempPasswordDialog.tsx`**

```tsx
import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Modal, primaryBtn } from './ui';

export const TempPasswordDialog: React.FC<{ employeeLabel: string; password: string; onClose: () => void }> = ({ employeeLabel, password, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  };
  return (
    <Modal title="Mật khẩu tạm" onClose={onClose}>
      <div className="space-y-3">
        <p>
          Mật khẩu tạm của <strong>{employeeLabel}</strong>. Mật khẩu chỉ hiện <strong>một lần</strong>; hãy giao trực tiếp cho nhân viên.
          Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.
        </p>
        <div className="flex items-center gap-2 bg-slate-950 rounded-xl p-3">
          <code className="flex-1 text-emerald-400 font-mono text-base tracking-wider">{password}</code>
          <button onClick={copy} className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold flex items-center gap-1 cursor-pointer">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Đã chép' : 'Sao chép'}
          </button>
        </div>
        <button onClick={onClose} className={`${primaryBtn} w-full`}>
          Tôi đã ghi lại mật khẩu
        </button>
      </div>
    </Modal>
  );
};
```

- [ ] **Step 3: Tạo `src/components/UserFormModal.tsx`**

```tsx
import React, { useState } from 'react';
import type { Department, User, UserRole, UserStatus } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface Props {
  user?: User; // không có = tạo mới
  departments: Department[];
  currentUserId: string;
  onClose: () => void;
  onSaved: (result: { user: User; tempPassword?: string }) => void;
}

export const UserFormModal: React.FC<Props> = ({ user, departments, currentUserId, onClose, onSaved }) => {
  const isEdit = Boolean(user);
  const isSelf = user?.id === currentUserId;
  const [code, setCode] = useState(user?.code ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [position, setPosition] = useState(user?.position ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'employee');
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? '');
  const [hanetPersonId, setHanetPersonId] = useState(user?.hanetPersonId ?? '');
  const [faceRegistered, setFaceRegistered] = useState(user?.faceRegistered ?? false);
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name, email, phone, position, role, departmentId: departmentId || null, hanetPersonId, faceRegistered, status };
    try {
      if (user) {
        const r = await api<{ user: User }>(`/api/users/${user.id}`, { method: 'PUT', body });
        onSaved({ user: r.user });
      } else {
        const r = await api<{ user: User; tempPassword: string }>('/api/users', { method: 'POST', body: { ...body, code } });
        onSaved(r);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isEdit ? `Sửa nhân sự ${user?.code}` : 'Thêm nhân sự'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã nhân viên (= aliasID trên Hanet)">
            <input className={`${inputCls} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} required />
          </Field>
          <Field label="Họ tên">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Phòng ban">
            <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— Chưa phân phòng —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vai trò">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSelf}>
              {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chức vụ">
            <input className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
          <Field label="Số điện thoại">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Hanet Person ID" hint="Để trống nếu chưa có; hệ thống ưu tiên khớp theo mã nhân viên">
            <input className={`${inputCls} font-mono`} value={hanetPersonId} onChange={(e) => setHanetPersonId(e.target.value)} />
          </Field>
          {isEdit && (
            <Field label="Trạng thái">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} disabled={isSelf}>
                <option value="active">Đang làm việc</option>
                <option value="inactive">Đã nghỉ (khóa đăng nhập, bỏ qua nhận diện)</option>
              </select>
            </Field>
          )}
          <label className="flex items-center gap-2 mt-5">
            <input type="checkbox" checked={faceRegistered} onChange={(e) => setFaceRegistered(e.target.checked)} />
            <span>Đã đăng ký khuôn mặt trên Hanet</span>
          </label>
        </div>
        {isSelf && <p className="text-[11px] text-slate-500">Bạn không thể tự đổi vai trò hoặc trạng thái của mình.</p>}
        {error && <p className="text-rose-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${secondaryBtn} flex-1`}>
            Hủy
          </button>
          <button type="submit" disabled={busy} className={`${primaryBtn} flex-1`}>
            {busy ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo nhân sự'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
```

- [ ] **Step 4: Viết lại `src/components/EmployeesTab.tsx`**

```tsx
import React, { useState } from 'react';
import { KeyRound, Pencil, Search, UserPlus } from 'lucide-react';
import type { Department, User } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL } from '../format';
import { UserFormModal } from './UserFormModal';
import { TempPasswordDialog } from './TempPasswordDialog';
import { inputCls, primaryBtn, secondaryBtn } from './ui';

interface EmployeesTabProps {
  users: User[];
  departments: Department[];
  currentUser: User;
  onRefresh: () => void;
}

export const EmployeesTab: React.FC<EmployeesTabProps> = ({ users, departments, currentUser, onRefresh }) => {
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [tempPassword, setTempPassword] = useState<{ label: string; password: string } | null>(null);
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');

  const resetPassword = async (u: User) => {
    if (!window.confirm(`Đặt lại mật khẩu cho ${u.name} (${u.code})? Mật khẩu cũ và các phiên đăng nhập của người này sẽ mất hiệu lực.`)) return;
    try {
      const r = await api<{ tempPassword: string }>(`/api/users/${u.id}/reset-password`, { method: 'POST' });
      setTempPassword({ label: `${u.name} (${u.code})`, password: r.tempPassword });
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  const q = search.trim().toLocaleLowerCase('vi');
  const filtered = users.filter(
    (u) =>
      (!deptFilter || u.departmentId === deptFilter) &&
      (!q || u.name.toLocaleLowerCase('vi').includes(q) || u.code.toLocaleLowerCase('vi').includes(q) || u.position.toLocaleLowerCase('vi').includes(q)),
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Quản lý nhân sự</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mã nhân viên phải trùng <span className="font-mono">aliasID</span> trên Hanet để camera khớp đúng người. Đồng bộ khuôn mặt lên Hanet chưa được hỗ trợ; hãy đăng ký trên ứng dụng Hanet.
          </p>
        </div>
        <button onClick={() => setEditing('new')} className={primaryBtn}>
          <UserPlus className="w-4 h-4" /> Thêm nhân sự
        </button>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Tìm theo tên, mã NV, chức vụ..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={`${inputCls} w-auto`} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">Tất cả phòng ({users.length})</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((u) => (
          <div key={u.id} className={`bg-white rounded-2xl border shadow-xs p-4 text-xs ${u.status === 'inactive' ? 'border-slate-200 opacity-60' : 'border-slate-200/80'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-mono font-bold px-1.5 rounded bg-slate-100 text-slate-600">{u.code}</span>
                <h3 className="font-bold text-sm text-slate-900 mt-1 truncate">{u.name}</h3>
                <p className="text-slate-500 truncate">{u.position || '—'}</p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200 shrink-0">{ROLE_LABEL[u.role]}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
              <div className="flex justify-between"><span className="text-slate-400">Phòng ban</span><span>{u.departmentName ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Hanet Person ID</span><span className="font-mono">{u.hanetPersonId ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Khuôn mặt</span><span>{u.faceRegistered ? 'Đã đăng ký' : 'Chưa đăng ký'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Trạng thái</span><span>{u.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}</span></div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
              <button onClick={() => setEditing(u)} className={`${secondaryBtn} flex-1 py-1.5`}>
                <Pencil className="w-3.5 h-3.5" /> Sửa
              </button>
              <button onClick={() => resetPassword(u)} className={`${secondaryBtn} flex-1 py-1.5`}>
                <KeyRound className="w-3.5 h-3.5" /> Đặt lại mật khẩu
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <UserFormModal
          user={editing === 'new' ? undefined : editing}
          departments={departments}
          currentUserId={currentUser.id}
          onClose={() => setEditing(null)}
          onSaved={({ user, tempPassword: pw }) => {
            setEditing(null);
            if (pw) setTempPassword({ label: `${user.name} (${user.code})`, password: pw });
            onRefresh();
          }}
        />
      )}
      {tempPassword && <TempPasswordDialog employeeLabel={tempPassword.label} password={tempPassword.password} onClose={() => setTempPassword(null)} />}
    </div>
  );
};
```

- [ ] **Step 5: Viết lại `src/components/DepartmentsTab.tsx`**

```tsx
import React, { useState } from 'react';
import { Building, Pencil, Plus, Shield, Users } from 'lucide-react';
import type { Department, User } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface DepartmentsTabProps {
  departments: Department[];
  users: User[];
  currentUser: User;
  onRefresh: () => void;
}

export const DepartmentsTab: React.FC<DepartmentsTabProps> = ({ departments, users, currentUser, onRefresh }) => {
  const isHR = currentUser.role === 'hr';
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<{ id?: string; code: string; name: string; description: string; managerId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = departments.find((d) => d.id === selectedId) ?? departments[0];
  const members = users.filter((u) => u.departmentId === active?.id);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    try {
      if (form.id) {
        await api(`/api/departments/${form.id}`, { method: 'PUT', body: { name: form.name, description: form.description, managerId: form.managerId || null } });
      } else {
        await api('/api/departments', { method: 'POST', body: { code: form.code, name: form.name, description: form.description, managerId: form.managerId || null } });
      }
      setForm(null);
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Phòng ban</h2>
          <p className="text-xs text-slate-500 mt-0.5">Trưởng phòng chỉ xem và duyệt dữ liệu của nhân viên trong phòng mình.</p>
        </div>
        {isHR && (
          <button onClick={() => setForm({ code: '', name: '', description: '', managerId: '' })} className={primaryBtn}>
            <Plus className="w-4 h-4" /> Thêm phòng ban
          </button>
        )}
      </div>

      {departments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-xs text-slate-500">
          <Building className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa có phòng ban nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {departments.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`p-4 rounded-2xl border text-left cursor-pointer text-xs ${
                d.id === active?.id ? 'bg-orange-50/70 border-orange-400 ring-1 ring-orange-400' : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{d.code}</span>
                <span className="text-slate-500 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {d.memberCount}
                </span>
              </div>
              <h3 className="font-bold text-sm text-slate-900">{d.name}</h3>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{d.description || 'Chưa có mô tả'}</p>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-600">
                <Shield className="w-3.5 h-3.5 text-amber-600" /> {d.managerName ?? 'Chưa chỉ định trưởng phòng'}
              </div>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Nhân sự: {active.name}</h3>
            {isHR && (
              <button
                onClick={() => setForm({ id: active.id, code: active.code, name: active.name, description: active.description, managerId: active.managerId ?? '' })}
                className={`${secondaryBtn} py-1.5`}
              >
                <Pencil className="w-3.5 h-3.5" /> Sửa phòng ban
              </button>
            )}
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase">
                <th className="py-3 px-4">Nhân viên</th>
                <th className="py-3 px-4">Chức vụ</th>
                <th className="py-3 px-4">Vai trò</th>
                <th className="py-3 px-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">
                      {m.name} {m.id === active.managerId && <span className="text-[10px] px-1.5 rounded bg-amber-100 text-amber-800">Trưởng phòng</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">{m.code}</div>
                  </td>
                  <td className="py-3 px-4">{m.position || '—'}</td>
                  <td className="py-3 px-4">{ROLE_LABEL[m.role]}</td>
                  <td className="py-3 px-4">{m.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Sửa phòng ban' : 'Thêm phòng ban'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            <Field label="Mã phòng ban">
              <input className={`${inputCls} font-mono uppercase`} value={form.code} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </Field>
            <Field label="Tên phòng ban">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Mô tả">
              <textarea rows={2} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Trưởng phòng" hint="Nhớ đặt vai trò Trưởng phòng và phòng ban cho người này ở tab Nhân sự">
              <select className={inputCls} value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                <option value="">— Chưa chỉ định —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </Field>
            {error && <p className="text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`}>
                Lưu
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
```

- [ ] **Step 6: Viết lại `src/components/CamerasTab.tsx`**

```tsx
import React, { useState } from 'react';
import { MapPin, Plus, Video } from 'lucide-react';
import type { Camera, User } from '../types';
import { api, errorMessage } from '../api';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface CamerasTabProps {
  cameras: Camera[];
  currentUser: User;
  onRefresh: () => void;
}

const EMPTY = { name: '', deviceKey: '', placeId: '', placeName: '', location: '', ipAddress: '' };

export const CamerasTab: React.FC<CamerasTabProps> = ({ cameras, currentUser, onRefresh }) => {
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    try {
      await api('/api/cameras', { method: 'POST', body: form });
      setForm(null);
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => form && setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Camera Hanet</h2>
          <p className="text-xs text-slate-500 mt-0.5">Danh sách để tham chiếu tên thiết bị. Lượt nhận diện vẫn được ghi khi camera chưa có trong danh sách.</p>
        </div>
        {currentUser.role === 'hr' && (
          <button onClick={() => setForm({ ...EMPTY })} className={primaryBtn}>
            <Plus className="w-4 h-4" /> Thêm camera
          </button>
        )}
      </div>

      {cameras.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-xs text-slate-500">
          <Video className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa có camera nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900">{c.name}</h3>
                <span className="font-mono text-[10px] px-1.5 rounded bg-slate-100 text-slate-600">{c.deviceKey}</span>
              </div>
              {c.location && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <MapPin className="w-3 h-3 text-orange-500" /> {c.location}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl">
                <div>
                  <span className="block text-[10px] text-slate-400">Địa điểm</span>
                  {c.placeName || '—'}
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">Place ID</span>
                  <span className="font-mono">{c.placeId ?? '—'}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] text-slate-400">IP nội bộ</span>
                  <span className="font-mono">{c.ipAddress || '—'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title="Thêm camera Hanet" onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            <Field label="Tên camera">
              <input className={inputCls} value={form.name} onChange={set('name')} required />
            </Field>
            <Field label="Mã thiết bị (deviceID trên Hanet)">
              <input className={`${inputCls} font-mono`} value={form.deviceKey} onChange={set('deviceKey')} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Place ID">
                <input className={`${inputCls} font-mono`} inputMode="numeric" value={form.placeId} onChange={set('placeId')} />
              </Field>
              <Field label="Tên địa điểm">
                <input className={inputCls} value={form.placeName} onChange={set('placeName')} />
              </Field>
            </div>
            <Field label="Vị trí lắp đặt">
              <input className={inputCls} value={form.location} onChange={set('location')} />
            </Field>
            <Field label="Địa chỉ IP nội bộ">
              <input className={`${inputCls} font-mono`} value={form.ipAddress} onChange={set('ipAddress')} />
            </Field>
            {error && <p className="text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`}>
                Lưu camera
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
```

- [ ] **Step 7: Viết lại `src/components/HanetSimulatorModal.tsx`**

```tsx
import React, { useState } from 'react';
import type { Camera, User } from '../types';
import { api, errorMessage } from '../api';
import { vnToday } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface HanetSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: Camera[];
  users: User[];
  onSimulateSuccess: () => void;
}

export const HanetSimulatorModal: React.FC<HanetSimulatorModalProps> = ({ isOpen, onClose, cameras, users, onSimulateSuccess }) => {
  const [userId, setUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [date, setDate] = useState(vnToday());
  const [time, setTime] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const submit = async () => {
    if (!userId) {
      setMessage('Hãy chọn nhân viên');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ result: { status: string; message: string } }>('/api/hanet/simulate', {
        method: 'POST',
        body: { userId, deviceId: deviceId || undefined, date, time: time || undefined },
      });
      setMessage(`${r.result.status}: ${r.result.message}`);
      onSimulateSuccess();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Mô phỏng camera nhận diện (chỉ để thử nghiệm)" onClose={onClose}>
      <div className="space-y-3.5">
        <p className="text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2">
          Lượt mô phỏng được đánh dấu "Mô phỏng" và không được tính công khi chạy production.
        </p>
        <Field label="Nhân viên">
          <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— Chọn nhân viên —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Camera">
          <select className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Thiết bị mô phỏng</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.deviceKey}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Giờ (trống = bây giờ)">
            <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {message && <p className="text-slate-700 bg-slate-50 rounded-xl p-2">{message}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className={`${secondaryBtn} flex-1`}>
            Đóng
          </button>
          <button onClick={submit} disabled={busy} className={`${primaryBtn} flex-1`}>
            {busy ? 'Đang gửi...' : 'Gửi lượt nhận diện'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
```

- [ ] **Step 8: Tạo `src/components/config/WebhookCard.tsx`**

```tsx
import React, { useState } from 'react';
import { Check, Copy, RefreshCw, Terminal } from 'lucide-react';
import type { HanetConfigView } from '../../types';
import { api, errorMessage } from '../../api';

export const WebhookCard: React.FC<{ config: HanetConfigView; onChange: (c: HanetConfigView) => void }> = ({ config, onChange }) => {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${config.webhookPath}`;

  const rotate = async () => {
    if (!window.confirm('Tạo token mới? URL cũ sẽ ngừng hoạt động ngay; bạn phải cập nhật URL mới trên Hanet.')) return;
    try {
      onChange((await api<{ config: HanetConfigView }>('/api/hanet/webhook-token/rotate', { method: 'POST' })).config);
      setCopied(false);
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-xl">
      <h2 className="text-base font-bold">URL webhook cho Hanet</h2>
      <p className="text-xs text-slate-300 mt-1 max-w-2xl">
        Dán URL này vào cấu hình webhook trên Hanet. URL chứa token bí mật: không chia sẻ công khai. Nếu nghi bị lộ, hãy tạo token mới.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 bg-slate-950/80 border border-slate-700 rounded-2xl p-2.5">
        <Terminal className="w-4 h-4 text-orange-400 shrink-0 ml-1.5" />
        <code className="text-xs font-mono text-emerald-400 flex-1 break-all">{url}</code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
          className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Đã sao chép' : 'Sao chép'}
        </button>
        <button onClick={rotate} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Tạo token mới
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 9: Tạo `src/components/config/WorkSettingsCard.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { WorkSettings } from '../../types';
import { api, errorMessage } from '../../api';
import { vnToday } from '../../format';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

export const WorkSettingsCard: React.FC<{ onRecomputed: () => void }> = ({ onRecomputed }) => {
  const [ws, setWs] = useState<WorkSettings | null>(null);
  const [from, setFrom] = useState(vnToday());
  const [to, setTo] = useState(vnToday());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: WorkSettings }>('/api/settings/work')
      .then((d) => setWs(d.settings))
      .catch((err) => setMessage(errorMessage(err)));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws) return;
    setBusy(true);
    try {
      setWs((await api<{ settings: WorkSettings }>('/api/settings/work', { method: 'PUT', body: ws })).settings);
      setMessage('Đã lưu. Giờ mới áp dụng cho các lượt nhận diện từ bây giờ; bấm "Tính lại" để áp dụng cho các ngày đã qua.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const recompute = async () => {
    setBusy(true);
    try {
      const r = await api<{ updated: number }>('/api/attendance/recompute', { method: 'POST', body: { from, to } });
      setMessage(`Đã tính lại ${r.updated} dòng công.`);
      onRecomputed();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-4">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
        <Clock className="w-4 h-4 text-orange-500" /> Giờ làm việc
      </h3>
      {ws && (
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <Field label="Giờ vào">
            <input type="time" className={inputCls} value={ws.workStart} onChange={(e) => setWs({ ...ws, workStart: e.target.value })} required />
          </Field>
          <Field label="Cho phép muộn (phút)">
            <input type="number" min={0} max={120} className={inputCls} value={ws.lateGraceMinutes} onChange={(e) => setWs({ ...ws, lateGraceMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Giờ ra">
            <input type="time" className={inputCls} value={ws.workEnd} onChange={(e) => setWs({ ...ws, workEnd: e.target.value })} required />
          </Field>
          <Field label="Ngưỡng giờ ra (phút)" hint="Lượt cuối phải cách lượt đầu ít nhất chừng này mới tính là giờ ra">
            <input type="number" min={1} max={720} className={inputCls} value={ws.minOutGapMinutes} onChange={(e) => setWs({ ...ws, minOutGapMinutes: Number(e.target.value) })} />
          </Field>
          <button type="submit" disabled={busy} className={`${primaryBtn} col-span-2`}>
            Lưu giờ làm việc
          </button>
        </form>
      )}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-end gap-2">
        <Field label="Tính lại từ ngày">
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="đến ngày">
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <button onClick={recompute} disabled={busy} className={secondaryBtn}>
          Tính lại (tối đa 92 ngày)
        </button>
      </div>
      {message && <p className="text-slate-700 bg-slate-50 rounded-xl p-2">{message}</p>}
    </div>
  );
};
```

- [ ] **Step 10: Tạo `src/components/config/HanetCredentialsCard.tsx`**

```tsx
import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { HanetConfigView } from '../../types';
import { api, errorMessage } from '../../api';
import { fmtDateTime, vnToday } from '../../format';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

export const HanetCredentialsCard: React.FC<{ config: HanetConfigView; onChange: (c: HanetConfigView) => void; onReconciled: () => void }> = ({
  config,
  onChange,
  onReconciled,
}) => {
  const [clientId, setClientId] = useState(config.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [apiBase, setApiBase] = useState(config.apiBase);
  const [placeIds, setPlaceIds] = useState(config.placeIds.join(', '));
  const [date, setDate] = useState(vnToday());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ids = placeIds.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
      const r = await api<{ config: HanetConfigView }>('/api/hanet/config', {
        method: 'PUT',
        body: { clientId, clientSecret, accessToken, refreshToken, apiBase, placeIds: ids },
      });
      onChange(r.config);
      setClientSecret('');
      setAccessToken('');
      setRefreshToken('');
      setMessage('Đã lưu cấu hình Hanet.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reconcile = async () => {
    setBusy(true);
    try {
      const r = await api<{ summary: { inserted: number; duplicates: number; ignored: number }; config: HanetConfigView }>('/api/hanet/reconcile', {
        method: 'POST',
        body: { date },
      });
      onChange(r.config);
      setMessage(`Đối soát xong: thêm ${r.summary.inserted}, trùng ${r.summary.duplicates}, bỏ qua ${r.summary.ignored}.`);
      onReconciled();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const secretHint = (masked: string) => (masked ? `Đang lưu ${masked}. Để trống để giữ nguyên.` : 'Chưa có');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-4">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-orange-500" /> Kết nối Hanet & đối soát
      </h3>
      <form onSubmit={save} className="space-y-3">
        <Field label="Client ID">
          <input className={`${inputCls} font-mono`} value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </Field>
        <Field label="Client Secret" hint={secretHint(config.clientSecret)}>
          <input type="password" className={`${inputCls} font-mono`} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Access Token" hint={secretHint(config.accessToken)}>
          <input type="password" className={`${inputCls} font-mono`} value={accessToken} onChange={(e) => setAccessToken(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Refresh Token" hint={secretHint(config.refreshToken)}>
          <input type="password" className={`${inputCls} font-mono`} value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Place ID (cách nhau dấu phẩy)">
            <input className={`${inputCls} font-mono`} value={placeIds} onChange={(e) => setPlaceIds(e.target.value)} />
          </Field>
          <Field label="Địa chỉ API Hanet">
            <input className={`${inputCls} font-mono`} value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          </Field>
        </div>
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
          Lưu cấu hình Hanet
        </button>
      </form>

      <div className="pt-3 border-t border-slate-100 space-y-2">
        <div className="text-slate-600">
          Đối soát tự động mỗi 15 phút: <strong>{config.reconcileEnabled ? 'đang bật' : 'chưa đủ cấu hình'}</strong>
          {config.lastReconcileAt && <> · lần cuối {fmtDateTime(config.lastReconcileAt)}</>}
        </div>
        {config.lastReconcileError && <p className="text-rose-600 bg-rose-50 rounded-xl p-2">Lỗi đối soát gần nhất: {config.lastReconcileError}</p>}
        <div className="flex items-end gap-2">
          <Field label="Ngày đối soát">
            <input type="date" className={inputCls} value={date} max={vnToday()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <button onClick={reconcile} disabled={busy || !config.reconcileEnabled} className={secondaryBtn}>
            Đối soát ngay
          </button>
        </div>
      </div>
      {message && <p className="text-slate-700 bg-slate-50 rounded-xl p-2">{message}</p>}
    </div>
  );
};
```

- [ ] **Step 11: Tạo `src/components/config/BackupsCard.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Database, Download } from 'lucide-react';
import type { BackupInfo } from '../../types';
import { api, errorMessage } from '../../api';
import { fmtDateTime } from '../../format';
import { secondaryBtn } from '../ui';

export const BackupsCard: React.FC = () => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ backups: BackupInfo[] }>('/api/admin/backups')
      .then((d) => setBackups(d.backups))
      .catch((err) => setMessage(errorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  const backupNow = async () => {
    setBusy(true);
    try {
      const r = await api<{ backup: string }>('/api/admin/backups', { method: 'POST' });
      setMessage(`Đã tạo ${r.backup}`);
      await load();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Database className="w-4 h-4 text-orange-500" /> Sao lưu
        </h3>
        <div className="flex gap-2">
          <button onClick={backupNow} disabled={busy} className={`${secondaryBtn} py-1.5`}>
            Sao lưu ngay
          </button>
          {backups.length > 0 && (
            <a href="/api/admin/backups/latest" className={`${secondaryBtn} py-1.5`}>
              <Download className="w-3.5 h-3.5" /> Tải bản mới nhất
            </a>
          )}
        </div>
      </div>
      <p className="text-slate-500">Tự động sao lưu lúc 02:00 mỗi ngày, giữ 30 bản. Nên chép định kỳ thư mục data/backups ra ngoài máy chủ.</p>
      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
        {backups.length === 0 ? (
          <p className="py-4 text-center text-slate-400">Chưa có bản sao lưu</p>
        ) : (
          backups.map((b) => (
            <div key={b.name} className="py-1.5 flex justify-between gap-2">
              <span className="font-mono truncate">{b.name}</span>
              <span className="text-slate-400 shrink-0">
                {(b.size / 1024 / 1024).toFixed(1)} MB · {fmtDateTime(b.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>
      {message && <p className="text-slate-700 bg-slate-50 rounded-xl p-2">{message}</p>}
    </div>
  );
};
```

- [ ] **Step 12: Tạo `src/components/config/WebhookLogsCard.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import type { WebhookLog, WebhookLogStatus } from '../../types';
import { api, errorMessage } from '../../api';
import { fmtDateTime } from '../../format';
import { Modal } from '../ui';

const STATUS_STYLE: Record<WebhookLogStatus, string> = {
  success: 'text-emerald-600',
  duplicate: 'text-slate-500',
  ignored: 'text-amber-600',
  rejected: 'text-rose-600',
  error: 'text-rose-600',
};

export const WebhookLogsCard: React.FC = () => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [selected, setSelected] = useState<WebhookLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<{ logs: WebhookLog[] }>('/api/hanet/webhook-logs')
      .then((d) => setLogs(d.logs))
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-purple-600" /> Nhật ký webhook
        </h3>
        <button onClick={load} className="text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer">
          <RefreshCw className="w-3 h-3" /> Làm mới
        </button>
      </div>
      {error && <p className="text-rose-600 mt-2">{error}</p>}
      <div className="mt-2 max-h-96 overflow-y-auto divide-y divide-slate-100">
        {logs.length === 0 ? (
          <p className="py-12 text-center text-slate-400">Chưa nhận được webhook nào</p>
        ) : (
          logs.map((log) => (
            <button key={log.id} onClick={() => setSelected(log)} className="w-full text-left py-2 px-1 hover:bg-slate-50 rounded-lg cursor-pointer">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-900">{log.personName ?? '—'}</span>
                <span className="text-[10px] font-mono text-slate-400">{fmtDateTime(log.receivedAt)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span className="truncate">{log.message ?? log.deviceName ?? ''}</span>
                <span className={`font-mono font-bold ${STATUS_STYLE[log.status]}`}>{log.status}</span>
              </div>
            </button>
          ))
        )}
      </div>
      {selected && (
        <Modal title="Dữ liệu webhook nhận được" onClose={() => setSelected(null)} wide>
          <pre className="bg-slate-950 text-emerald-400 font-mono text-[11px] p-3 rounded-xl overflow-auto max-h-96">
            {JSON.stringify(selected.rawPayload, null, 2) ?? '(không lưu dữ liệu)'}
          </pre>
        </Modal>
      )}
    </div>
  );
};
```

- [ ] **Step 13: Tạo `src/components/config/DangerZoneCard.tsx`**

```tsx
import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { Field, dangerBtn, inputCls } from '../ui';

export const DangerZoneCard: React.FC = () => {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm('XÓA TOÀN BỘ nhân sự (trừ bạn), phòng ban, camera, dữ liệu điểm danh và đơn? Hệ thống sẽ tự sao lưu trước khi xóa.')) return;
    setBusy(true);
    try {
      const r = await api<{ backup: string }>('/api/admin/reset-database', { method: 'POST', body: { password } });
      window.alert(`Đã xóa dữ liệu. Bản sao lưu trước khi xóa: ${r.backup}`);
      window.location.reload();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={reset} className="bg-rose-50/60 rounded-2xl border border-rose-200 p-5 text-xs space-y-3">
      <h3 className="font-bold text-sm text-rose-800 flex items-center gap-2">
        <Trash2 className="w-4 h-4" /> Xóa toàn bộ dữ liệu
      </h3>
      <p className="text-rose-700">
        Giữ lại tài khoản của bạn và các cấu hình (giờ làm, Hanet, token webhook). Mọi thứ khác bị xóa. Hệ thống sao lưu tự động trước khi xóa.
      </p>
      <Field label="Nhập lại mật khẩu của bạn để xác nhận">
        <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </Field>
      {message && <p className="text-rose-700">{message}</p>}
      <button type="submit" disabled={busy || !password} className={dangerBtn}>
        Xóa dữ liệu
      </button>
    </form>
  );
};
```

- [ ] **Step 14: Viết lại `src/components/HanetConfigTab.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import type { HanetConfigView } from '../types';
import { api, errorMessage } from '../api';
import { WebhookCard } from './config/WebhookCard';
import { WorkSettingsCard } from './config/WorkSettingsCard';
import { HanetCredentialsCard } from './config/HanetCredentialsCard';
import { BackupsCard } from './config/BackupsCard';
import { WebhookLogsCard } from './config/WebhookLogsCard';
import { DangerZoneCard } from './config/DangerZoneCard';

interface HanetConfigTabProps {
  onRefresh: () => void;
}

export const HanetConfigTab: React.FC<HanetConfigTabProps> = ({ onRefresh }) => {
  const [config, setConfig] = useState<HanetConfigView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ config: HanetConfigView }>('/api/hanet/config')
      .then((d) => setConfig(d.config))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <p className="text-xs text-rose-600">{error}</p>;
  if (!config) return <p className="text-xs text-slate-500">Đang tải cấu hình...</p>;

  return (
    <div className="space-y-6">
      <WebhookCard config={config} onChange={setConfig} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HanetCredentialsCard config={config} onChange={setConfig} onReconciled={onRefresh} />
        <WorkSettingsCard onRecomputed={onRefresh} />
        <BackupsCard />
        <WebhookLogsCard />
      </div>
      <DangerZoneCard />
    </div>
  );
};
```

- [ ] **Step 15: Lint, build và test**

Run: `npm run lint && npx vite build && npm test`
Expected: lint không lỗi; build thành công; test PASS.

- [ ] **Step 16: Chạy thử trên trình duyệt**

Dùng thư mục scratch như Task 13 Step 9 (để không đụng `data/` của repo), chạy `PORT=3098 npx tsx server/index.ts`, lấy mật khẩu tạm từ dòng `[BOOTSTRAP]` rồi kiểm tra bằng tay trên `http://localhost:3098`:

1. Đăng nhập `ADMIN` bằng mật khẩu tạm → bị chuyển sang màn đổi mật khẩu → đổi xong vào được bảng công.
2. Tab Phòng ban: tạo phòng `KT`. Tab Nhân sự: tạo `NV01` (vai trò Nhân viên, phòng KT) → hộp thoại hiện mật khẩu tạm.
3. Nút Mô phỏng: gửi lượt cho `NV01` lúc 08:30 và 17:10 hôm nay → bảng công hiện 1 dòng "Đi muộn · muộn 30'", bấm "2 lượt" xem chi tiết.
4. Tab Cấu hình: thấy URL webhook dạng `/api/hanet/webhook/<token>`; `curl -X POST <url> -H 'Content-Type: application/json' -d '{"aliasID":"NV01","deviceID":"C1","time":<epoch ms>}'` → `{"returnCode":1,"returnMessage":"success"}` và log hiện trong Nhật ký webhook.
5. Mở cửa sổ ẩn danh, đăng nhập `NV01` bằng mật khẩu tạm → đổi mật khẩu → chỉ thấy tab Bảng công và Đơn, chỉ thấy dòng của mình → gửi đơn giải trình đi muộn.
6. Quay lại ADMIN → tab Đơn → Duyệt → bảng công của NV01 chuyển "Đúng giờ" và có dòng "Đã duyệt giải trình".
7. Tab Cấu hình → Sao lưu ngay → tải bản mới nhất về được.
8. Đăng xuất → quay về màn đăng nhập; gọi `curl localhost:3098/api/users` → 401.

Ghi lại bước nào không đạt và sửa trước khi commit.

- [ ] **Step 17: Commit**

```bash
git add src/components
git commit -m "feat(ui): requests, employees with temp passwords, departments, cameras, config cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Triển khai — Docker, PM2, DEPLOY.md, gỡ `data/` khỏi git, build cuối

**Files:**
- Modify: `Dockerfile`, `docker-compose.yml`, `ecosystem.config.cjs`, `DEPLOY.md`
- Create: `.env.example`
- Remove from git (giữ file trên máy): `data/database.json`
- Rebuild: `dist/`, `server.js`

**Interfaces:**
- Consumes: `server/index.ts` (Task 13), script `build`/`build:server` (Task 1)
- Produces: bản build production chạy bằng `node server.js` trên Node ≥ 22.13, cổng 3001

- [ ] **Step 1: Viết lại `Dockerfile`**

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3001
ENV TRUST_PROXY=1

EXPOSE 3001
VOLUME ["/app/data"]

CMD ["node", "server.js"]
```

- [ ] **Step 2: Viết lại `docker-compose.yml`**

```yaml
services:
  attendance-app:
    build: .
    container_name: hanet-attendance-app
    restart: always
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - TRUST_PROXY=1
      # - ADMIN_INITIAL_PASSWORD=doi-ngay-sau-khi-dang-nhap
    volumes:
      - attendance-data:/app/data

volumes:
  attendance-data:
    driver: local
```

- [ ] **Step 3: Viết lại `ecosystem.config.cjs`**

```js
module.exports = {
  apps: [
    {
      name: 'hanet-attendance',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1, // bắt buộc 1: giới hạn đăng nhập và lịch chạy nằm trong bộ nhớ tiến trình
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        TRUST_PROXY: '1',
      },
    },
  ],
};
```

- [ ] **Step 4: Tạo `.env.example`**

```
# Cổng HTTP (mặc định 3001)
PORT=3001
# Đặt 1 khi chạy sau nginx/reverse proxy để lấy đúng IP người dùng và cookie Secure
TRUST_PROXY=1
# Mật khẩu ban đầu cho tài khoản ADMIN (>= 8 ký tự). Bỏ trống thì hệ thống sinh ngẫu nhiên và in ra log.
ADMIN_INITIAL_PASSWORD=
# Đặt 1 để bật công cụ mô phỏng camera khi chạy production (không khuyến nghị)
ENABLE_SIMULATOR=
```

- [ ] **Step 5: Viết lại `DEPLOY.md`**

````markdown
# Triển khai hệ thống điểm danh Camera Hanet

Ứng dụng Node.js (Express + React). Dữ liệu lưu trong SQLite tại `data/attendance.db`, sao lưu tự động vào `data/backups/`.

## Yêu cầu

- **Node.js ≥ 22.13** (dùng `node:sqlite` có sẵn trong Node). Kiểm tra: `node -v`.
- Tên miền có **HTTPS**: Hanet chỉ gửi webhook qua HTTPS, và cookie đăng nhập dùng cờ `Secure`.
- Chạy **một tiến trình** (PM2 `instances: 1`).
- Không dùng các dịch vụ có ổ đĩa tạm (ví dụ gói Free của Render): dữ liệu sẽ mất mỗi lần deploy lại.

## Cài mới trên VPS Ubuntu (PM2 + nginx)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git
sudo npm install -g pm2

cd /var/www
git clone https://github.com/caovanhung/hgc-attendance.git
cd hgc-attendance
npm install --omit=dev          # dist/ và server.js đã build sẵn trong repo
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
pm2 logs hanet-attendance --lines 50   # tìm dòng [BOOTSTRAP] để lấy mật khẩu tạm của ADMIN
```

Đăng nhập bằng mã `ADMIN` và mật khẩu tạm, hệ thống sẽ bắt đổi mật khẩu ngay.

### nginx

```nginx
server {
    listen 80;
    server_name diemdanh.tenmiencuaban.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d diemdanh.tenmiencuaban.com
```

## Docker

```bash
docker compose up -d --build
docker logs hanet-attendance-app | grep BOOTSTRAP
```

Dữ liệu nằm trong volume `attendance-data`.

## Nâng cấp từ bản cũ (lưu `data/database.json`)

Bản mới **gỡ `data/database.json` khỏi git**. Khi `git pull`, git sẽ **xóa file này khỏi thư mục làm việc**, nên phải chép ra ngoài trước:

```bash
cd /var/www/hgc-attendance
pm2 stop hanet-attendance
cp data/database.json ~/database.json.backup-$(date +%F)
git stash                          # nếu git báo database.json đã bị sửa
git pull
mkdir -p data && cp ~/database.json.backup-$(date +%F) data/database.json
node -v                            # phải >= 22.13; nếu chưa thì cài Node 22 như phần trên
npm install --omit=dev
pm2 delete hanet-attendance && pm2 start ecosystem.config.cjs && pm2 save
pm2 logs hanet-attendance --lines 50
```

Ở lần khởi động đầu, log có:
- `[MIGRATE] Đã chuyển dữ liệu từ data/database.json: {...}`: dữ liệu cũ đã vào SQLite; file cũ được đổi tên thành `data/database.json.migrated`, bản gốc nằm ở `data/backups/database.json.pre-migration`.
- `[BOOTSTRAP] Mật khẩu tạm tài khoản ADMIN: ...`: dùng để đăng nhập lần đầu.

Sau khi chuyển, **mọi nhân viên chưa có mật khẩu**. HR vào tab Nhân sự, bấm "Đặt lại mật khẩu" cho từng người để lấy mật khẩu tạm.

Nếu chuyển dữ liệu thất bại (JSON hỏng, trùng mã nhân viên...), server dừng và in lý do; `data/database.json` được giữ nguyên.

## Cấu hình webhook trên Hanet

1. Đăng nhập bằng tài khoản HR → tab **Cấu hình** → sao chép **URL webhook** (dạng `https://<tên miền>/api/hanet/webhook/<token>`).
2. Dán URL vào phần cấu hình webhook trên Hanet (Hanet Developer / Hanet Connect).
3. Mã nhân viên trong hệ thống phải trùng **aliasID** của người đó trên Hanet. Có thể nhập thêm Hanet Person ID ở tab Nhân sự.
4. Nếu nghi URL bị lộ: bấm **Tạo token mới** rồi cập nhật lại URL trên Hanet.

Đối soát (tùy chọn): nhập Client ID, Client Secret, Refresh Token và Place ID ở tab Cấu hình. Hệ thống sẽ kéo lịch sử điểm danh từ Hanet mỗi 15 phút để bù các lượt webhook bị lỡ.

## Sao lưu

- Tự động lúc 02:00 hằng ngày vào `data/backups/attendance-YYYY-MM-DD.db`, giữ 30 bản. Có bản sao lưu riêng trước mỗi lần xóa dữ liệu.
- Nên chép định kỳ ra ngoài VPS, ví dụ thêm vào crontab:

```bash
30 2 * * * rsync -a /var/www/hgc-attendance/data/backups/ backup@may-khac:/srv/hgc-backups/
```

- Khôi phục: `pm2 stop hanet-attendance`, chép bản sao lưu đè lên `data/attendance.db` (xóa `attendance.db-wal`, `attendance.db-shm` nếu có), rồi `pm2 start hanet-attendance`.

## Kiểm tra sức khỏe

`curl https://<tên miền>/api/health` → `{"ok":true}`.
````

- [ ] **Step 6: Gỡ `data/database.json` khỏi git (giữ file trên máy)**

```bash
git rm --cached data/database.json
git status --short data/
```

Expected: `D  data/database.json` trong khu vực staged; file vẫn còn trên đĩa (`ls data/database.json`).

- [ ] **Step 7: Build production**

```bash
npm run build
```

Expected: `dist/` mới và `server.js` mới.

- [ ] **Step 8: Chạy thử bản production trong thư mục tạm**

```bash
SMOKE=$(mktemp -d) && cp -r dist server.js package.json "$SMOKE"/ && ln -s "$PWD/node_modules" "$SMOKE/node_modules" \
  && cd "$SMOKE" && (NODE_ENV=production PORT=3099 TZ=UTC node server.js > server.log 2>&1 &) && sleep 3 \
  && curl -s localhost:3099/api/health && echo \
  && grep BOOTSTRAP server.log \
  && curl -s -o /dev/null -w '%{http_code}\n' localhost:3099/api/users \
  && curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3099/api/hanet/webhook \
  && curl -s -o /dev/null -w '%{http_code}\n' localhost:3099/ ; pkill -f "PORT=3099" ; pkill -f "$SMOKE/server.js" ; true
```

Expected: `{"ok":true}`; một dòng `[BOOTSTRAP] Mật khẩu tạm tài khoản ADMIN: ...`; `401`; `404`; `200`.

Kiểm tiêu chí giờ VN với `TZ=UTC` (spec mục 11): trong cùng thư mục tạm, đăng nhập ADMIN, đổi mật khẩu, tạo nhân viên `NV01`, gửi webhook lúc 08:30 VN và kiểm tra bảng công báo muộn 30 phút, đúng ngày:

```bash
cd "$SMOKE" && (NODE_ENV=production PORT=3099 TZ=UTC node server.js > server2.log 2>&1 &) && sleep 2
PW=$(grep -o 'ADMIN: [^ ]*' server.log | cut -d' ' -f2)
J='Content-Type: application/json'
curl -s -c c.txt -H "$J" -d "{\"code\":\"ADMIN\",\"password\":\"$PW\"}" localhost:3099/api/auth/login
curl -s -b c.txt -H "$J" -d "{\"currentPassword\":\"$PW\",\"newPassword\":\"MatKhauMoi@1\"}" localhost:3099/api/auth/change-password
curl -s -b c.txt -H "$J" -d '{"code":"NV01","name":"Thu nghiem"}' localhost:3099/api/users > /dev/null
TOKEN=$(curl -s -b c.txt localhost:3099/api/hanet/config | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).config.webhookPath))')
TS=$(node -e 'const d=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);console.log(Date.parse(d+"T08:30:00+07:00"))')
curl -s -H "$J" -d "{\"aliasID\":\"NV01\",\"deviceID\":\"C1\",\"time\":$TS}" "localhost:3099$TOKEN"; echo
curl -s -b c.txt localhost:3099/api/attendance | node -e 'process.stdin.on("data",d=>{const r=JSON.parse(d);console.log(r.date,r.records.map(x=>[x.employeeCode,x.lateMinutes,x.status]))})'
pkill -f "$SMOKE/server.js"; true
```

Expected: dòng cuối in ngày hôm nay theo giờ VN và `[ [ 'NV01', 30, 'missing_out' ] ]`.

- [ ] **Step 9: Kiểm tra tiêu chí hoàn thành (spec mục 11)**

```bash
npm test && npm run lint
TZ=UTC npm test
grep -rn "switch-user\|currentUserId" server src shared || echo "OK: không còn switch-user/currentUserId"
grep -rn "toISOString().split('T')\[0\]" server src shared || echo "OK: không còn tính ngày bằng toISOString().split"
grep -rn "8 \* 60 + 15\|08:15" server | grep -v settings.ts || echo "OK: không còn giờ làm viết cứng ngoài DEFAULT_WORK_SETTINGS"
grep -rn "personName.toLowerCase\|name.toLowerCase() === " server || echo "OK: không khớp theo tên"
git ls-files data/ | grep . && echo "LỖI: data/ còn trong git" || echo "OK: data/ không còn trong git"
```

Expected: test và lint PASS ở cả hai lần; năm dòng `OK: ...`. (`DEFAULT_WORK_SETTINGS` trong `server/settings.ts` dùng `'08:00'` và `15`, không chứa chuỗi `08:15`.)

- [ ] **Step 10: Commit**

```bash
git add Dockerfile docker-compose.yml ecosystem.config.cjs DEPLOY.md .env.example dist server.js
git commit -m "chore(deploy): Node 22 image, port 3001, upgrade guide; untrack data/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm --cached` ở Step 6 đã staged việc gỡ `data/database.json`, nên commit này bao gồm luôn.)

---

## Tự rà soát kế hoạch so với spec

| Spec | Task |
|---|---|
| §3 Cấu trúc module, `createApp` không listen | 1, 5, 13 |
| §4 Schema, PRAGMA, `schema_version`, JOIN thay cột chép | 1, 5, 6, 7 |
| §4 Chuyển dữ liệu JSON, gỡ `data/` khỏi git | 12, 16 |
| §5 scrypt, mật khẩu tạm, phiên, cookie, khóa đăng nhập | 3, 5 |
| §5 ADMIN đầu tiên, `ADMIN_INITIAL_PASSWORD` | 5, 13 |
| §5 `requireAuth`, `MUST_CHANGE_PASSWORD`, `requireRole`, `scopeFor`, JSON-only | 3, 5 |
| §5 Bảng phân quyền | 6–11, kiểm toàn bộ ở 13 |
| §5 Che secret, mô phỏng tắt ở production, xóa dữ liệu có mật khẩu + sao lưu | 9, 11 |
| §6 Webhook token, xoay token, 404 khi thiếu token, form-urlencoded | 9 |
| §6 Khớp aliasID/personID, không khớp tên, trùng lặp | 9 |
| §6 Đối soát, phân trang, refresh `-103`, lỗi lưu lại, nút "Đối soát ngay" | 10, 15 |
| §7 `computeDay`, giờ VN, `recomputeDay`, duyệt đơn theo loại, tính lại ≤ 92 ngày | 2, 4, 7, 8 |
| §7 API bảng công, chi tiết lượt, thống kê, CSV | 7, 14 |
| §8 Giao diện | 14, 15 |
| §9 Sao lưu, lịch chạy, Node check, cổng 3001, trust proxy, health, DEPLOY, log bảo mật | 5, 9, 11, 13, 16 |
| §10 Test | mọi task server |
| §11 Tiêu chí hoàn thành | 16 Step 8–9 |

**Khác biệt có chủ ý so với spec (đã ghi trong task):**
- `toVnDate` dùng offset +7 cố định thay vì `Intl.DateTimeFormat`: cùng kết quả vì Việt Nam không có giờ mùa hè, đơn giản và nhanh hơn (Task 2).
- Thêm đối soát lại ngày hôm qua lúc 00:05 để bắt các lượt 23:30–23:59 (Task 13).
- Thêm cấu hình `hanet.api_base` vì tài liệu Postman không ghi địa chỉ `CAMERA_BASE_URL`; mặc định `https://partner.hanet.ai`, HR sửa được (Task 9).
- Sai mật khẩu khi xóa dữ liệu trả 400 (không phải 403) để 403 chỉ mang nghĩa "không có quyền" (Task 11).
- Xóa dữ liệu giữ lại bảng `settings` để webhook Hanet không bị đứt (Task 11).
- API giờ làm là `GET/PUT /api/settings/work`; API cấu hình Hanet dùng `PUT` thay vì `POST`.
