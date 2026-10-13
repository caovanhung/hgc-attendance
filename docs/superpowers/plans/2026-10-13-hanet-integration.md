# Tích hợp API Hanet — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR quản lý camera, nhân sự, FaceID và phòng ban ngay trên web Petrolimex Attendance; hệ thống tự đẩy thay đổi sang Hanet qua hàng đợi có thử lại, và mở được trang xem lại video của Hanet Connect từ một lượt quẹt.

**Architecture:** Mở rộng `server/hanet-api.ts` thành client dùng chung (timeout, phân loại lỗi tạm/vĩnh viễn, hàm mỏng cho từng API). Thêm hàng đợi `sync_jobs` (`server/hanet-sync.ts`) chạy tuần tự theo từng đối tượng, với bảng xử lý `server/sync-handlers.ts`. Webhook lưu các lượt chưa khớp ai vào `face_sightings` để HR chọn ảnh đăng ký FaceID; FaceID chạy ngay (`server/hanet-face.ts`), không qua hàng đợi.

**Tech Stack:** Node ≥ 22.13 (`node:sqlite`), Express 4, React 19 + Vite + Tailwind 4, TypeScript, test bằng `node:test` qua `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-13-hanet-integration-design.md`

## Global Constraints

- Node ≥ 22.13; không thêm dependency runtime mới (chỉ `express`, `dotenv`).
- **Không migration.** `SCHEMA_VERSION = 2`; DB phiên bản khác thì không mở, in `[STARTUP] Database phiên bản cũ (v<n>). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` và thoát mã 1.
- Một địa điểm Hanet: khóa `hanet.place_ids` vẫn là mảng JSON, chỉ dùng phần tử đầu (`getPlaceIds(db)[0]`).
- Mọi lời gọi Hanet: timeout 15 giây (`HANET_TIMEOUT_MS = 15000`); `-103` làm mới token và gọi lại một lần (đã có trong `callApi`).
- Không log token, client secret. Log lỗi đồng bộ dạng `[SYNC] op=... entity=... code=...`.
- Webhook luôn trả 200 nhanh, không gọi API Hanet trong đường webhook.
- Ngày/giờ luôn theo giờ Việt Nam (`toVnDate`, `vnDateTimeToTs`); không dùng `toISOString().split('T')[0]` để tính ngày.
- Mọi thao tác Hanet chỉ HR; xóa nhân sự/phòng ban chỉ tài khoản `ADMIN` (giữ nguyên `requireSystemAdmin`).
- Chữ hiển thị và chú thích code bằng tiếng Việt, theo phong cách code hiện có.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Kiểm tra trước mỗi commit: `npm test` và `npm run lint` đều qua.

**Khác biệt có chủ ý so với spec (đã cân nhắc, ghi để reviewer biết):**
- §6.7: giữ `PUT /api/hanet/config {placeIds:[id]}` (mảng một phần tử) thay vì `{placeId}`, để không đổi API đang dùng; giao diện chọn một địa điểm.
- §6.4: người dùng bỏ qua spike; dùng thẳng `person/registerByUrl` với ảnh webhook. Kiểm chứng ở Task 11 trên host. Nếu Hanet từ chối kích thước ảnh, HR thấy lỗi ở nhãn FaceID và ta làm phương án xử lý ảnh trong một kế hoạch riêng.
- `user.remove`: nếu `removeByPlace` theo mã báo `-5011` mà có Person ID thì gọi thêm `person/removePersonByID` (trường hợp người được nhập từ Hanet mà việc gán aliasID chưa chạy).
- Thêm `GET /api/users/:id/face-candidates` (ảnh cho form Sửa nhân sự, spec §8 cần mà §7 chưa liệt kê).
- `POST /api/hanet/sync/retry` nhận thêm `{entityType, entityId}` để nút "Đồng bộ lại" trên từng thẻ chỉ thử lại việc của đối tượng đó.

## Review Focus

1. Hanet trả HTTP 200 nhưng nội dung là HTML/không phải JSON (bảo trì, gateway) → coi là lỗi tạm, thử lại sau, server không sập. Test ở Task 2.
2. Danh sách người trên Hanet đúng bằng bội số kích thước trang, hoặc rỗng → dừng phân trang, không lặp vô tận. Test ở Task 8.
3. Họ tên tiếng Việt có dấu và ký tự đặc biệt gửi sang Hanet nguyên vẹn (form-urlencoded). Test ở Task 7.
4. Job mỗi phút và lần thử ngay sau khi lưu chạy cùng lúc trên cùng một việc → Hanet chỉ bị gọi một lần. Test ở Task 5.
5. Đối tượng bị xóa trên web trước khi việc đồng bộ của nó chạy → việc kết thúc êm, không lỗi, không treo trạng thái. Test ở Task 9.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `server/db.ts` (sửa) | Schema v2, `SchemaVersionError` |
| `server/hanet-api.ts` (sửa) | `callApi` dùng chung, timeout, phân loại lỗi, `hanetApi.*` |
| `server/validation.ts` (mới) | `CODE_RE`, `CODE_ERROR` dùng chung |
| `server/sightings.ts` (mới) | Ghi/đọc/dọn `face_sightings` |
| `server/hanet-sync.ts` (mới) | Hàng đợi: `enqueue`, `runDueJobs`, `runEntityJobs`, `kickEntity`, `retryJobs`, `syncSummary` |
| `server/sync-handlers.ts` (mới) | `SYNC_HANDLERS`: xử lý từng `op` |
| `server/cameras.ts` (mới) | Nhập camera, cập nhật online/offline |
| `server/hanet-face.ts` (mới) | Đăng ký/đổi FaceID, `linkFace` |
| `server/hanet-import.ts` (mới) | Lấy danh sách người Hanet, nhập thành nhân sự |
| `server/routes/*.ts` (sửa) | API mới, gắn việc đồng bộ |
| `server/jobs.ts` (sửa) | Job `sync`, `camera-status`, dọn dẹp |
| `tests/fake-hanet.ts` (mới) | Hanet giả cho test |
| `src/components/config/SyncStatusCard.tsx` (mới) | Tổng quan đồng bộ |
| `src/components/SyncBadge.tsx` (mới) | Nhãn trạng thái đồng bộ |
| `src/components/ImportFromHanetModal.tsx` (mới) | Nhập nhân sự từ Hanet |

---

### Task 1: Schema v2 và kiểm tra phiên bản database

**Files:**
- Modify: `server/db.ts`
- Modify: `server/index.ts`
- Modify: `shared/types.ts`
- Modify: `server/repo.ts`
- Modify: `server/routes/departments.ts:13-28`
- Modify: `server/routes/cameras.ts:9-20`
- Test: `tests/db.test.ts`, `tests/users-routes.test.ts`

**Interfaces:**
- Produces: `SCHEMA_VERSION = 2`; `class SchemaVersionError extends Error { found: number }`; bảng `sync_jobs`, `face_sightings`; cột `users.hanet_sync_status|hanet_sync_error|face_error`, `departments.hanet_department_id|hanet_sync_status|hanet_sync_error`, `cameras.online|status_checked_at`; kiểu `SyncStatus = 'synced'|'pending'|'error'`; `User.hanetSyncStatus`, `User.hanetSyncError`, `User.faceError`; `Department.hanetSyncStatus`, `Department.hanetSyncError`; `Camera.online: boolean|null`, `Camera.statusCheckedAt: number|null`.

- [ ] **Step 1: Viết test schema v2 và phiên bản cũ**

Trong `tests/db.test.ts`, đổi dòng import thành:

```ts
import { openDb, tx, newId, SchemaVersionError, SCHEMA_VERSION } from '../server/db';
```

Thêm vào cuối file:

```ts
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
```

Thêm ngay dưới các dòng import của file:

```ts
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
```

Trong `tests/users-routes.test.ts`, test `'GET /users theo phạm vi vai trò'`, thêm trước `} finally {`:

```ts
    const first = (await (await loginAs(app, 'HR01')).get('/api/users')).body.users[0];
    assert.equal(first.hanetSyncStatus, 'synced');
    assert.equal(first.hanetSyncError, null);
    assert.equal(first.faceError, null);
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/db.test.ts tests/users-routes.test.ts`
Expected: FAIL — `SchemaVersionError` không được export; `hanetSyncStatus` là `undefined`.

- [ ] **Step 3: Sửa `server/db.ts`**

Đổi `export const SCHEMA_VERSION = 1;` thành `export const SCHEMA_VERSION = 2;`.

Trong chuỗi `SCHEMA`, bảng `departments` thêm 3 cột trước `created_at`:

```sql
  hanet_department_id TEXT,
  hanet_sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (hanet_sync_status IN ('synced', 'pending', 'error')),
  hanet_sync_error TEXT,
```

Bảng `users` thêm 3 cột trước `created_at`:

```sql
  hanet_sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (hanet_sync_status IN ('synced', 'pending', 'error')),
  hanet_sync_error TEXT,
  face_error TEXT,
```

Bảng `cameras` thêm 2 cột trước `created_at`:

```sql
  online INTEGER,
  status_checked_at INTEGER,
```

Thêm vào cuối chuỗi `SCHEMA` (sau bảng `webhook_logs`):

```sql
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
```

Thay hàm `openDb` bằng (thêm lớp lỗi ngay trên nó):

```ts
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
```

- [ ] **Step 4: Báo lỗi rõ khi khởi động — `server/index.ts`**

Đổi dòng import `import { openDb } from './db';` thành `import { openDb, SchemaVersionError } from './db';` và thay khối `main().catch(...)` cuối file bằng:

```ts
main().catch((err) => {
  if (err instanceof SchemaVersionError) console.error(err.message);
  else console.error('[STARTUP] Không khởi động được:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Kiểu dữ liệu và ánh xạ**

`shared/types.ts`: thêm ngay sau dòng `export type UserStatus = ...`:

```ts
export type SyncStatus = 'synced' | 'pending' | 'error';
```

Trong `interface User` thêm sau `status: UserStatus;`:

```ts
  hanetSyncStatus: SyncStatus;
  hanetSyncError: string | null;
  faceError: string | null; // lý do đăng ký FaceID thất bại gần nhất
```

Trong `interface Department` thêm sau `memberCount: number;`:

```ts
  hanetSyncStatus: SyncStatus;
  hanetSyncError: string | null;
```

Trong `interface Camera` thêm sau `ipAddress: string;`:

```ts
  online: boolean | null; // null = chưa kiểm tra
  statusCheckedAt: number | null;
```

`server/repo.ts`: trong `USER_SELECT` thêm `u.hanet_sync_status, u.hanet_sync_error, u.face_error,` ngay trước `u.created_at`; trong `mapUser` thêm sau `status: r.status,`:

```ts
    hanetSyncStatus: r.hanet_sync_status ?? 'synced',
    hanetSyncError: r.hanet_sync_error ?? null,
    faceError: r.face_error ?? null,
```

`server/routes/departments.ts`: trong `DEPT_SELECT` thêm `d.hanet_sync_status, d.hanet_sync_error,` ngay trước `d.created_at`; trong `mapDept` thêm sau `memberCount: Number(r.member_count),`:

```ts
    hanetSyncStatus: r.hanet_sync_status ?? 'synced',
    hanetSyncError: r.hanet_sync_error ?? null,
```

`server/routes/cameras.ts`: trong `mapCamera` thêm sau `ipAddress: r.ip_address ?? '',`:

```ts
    online: r.online === null || r.online === undefined ? null : r.online === 1,
    statusCheckedAt: r.status_checked_at ?? null,
```

- [ ] **Step 6: Chạy test và kiểu**

Run: `npx tsx --test tests/db.test.ts tests/users-routes.test.ts && npm run lint`
Expected: PASS, `tsc` không lỗi.

- [ ] **Step 7: Chạy toàn bộ test**

Run: `npm test`
Expected: PASS toàn bộ.

- [ ] **Step 8: Commit**

```bash
git add server/db.ts server/index.ts shared/types.ts server/repo.ts server/routes/departments.ts server/routes/cameras.ts tests/db.test.ts tests/users-routes.test.ts
git commit -m "feat(db): schema v2 for Hanet sync; refuse to open older databases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client Hanet dùng chung và Hanet giả cho test

**Files:**
- Modify: `server/hanet-api.ts`
- Modify: `shared/types.ts`
- Create: `tests/fake-hanet.ts`
- Test: `tests/hanet-client.test.ts`

**Interfaces:**
- Consumes: `HanetDeps { db, fetch, now }`, `refreshAccessToken` (đã có).
- Produces:
  - `HANET_TIMEOUT_MS = 15000`, `PERMANENT_CODES: Set<number>`
  - `class HanetApiError extends Error { returnCode: number; transient: boolean }`
  - `describeHanetError(code: number): string | null`
  - `isTransientError(err: unknown): boolean`
  - `callApi(deps, apiPath: string, params: Record<string,string>): Promise<any>` (export)
  - `hanetApi.getProfile(deps): Promise<{name: string; email: string}>`
  - `hanetApi.getPlaces(deps): Promise<HanetPlace[]>`
  - `hanetApi.listDevices(deps, placeId: number): Promise<HanetDevice[]>`
  - `hanetApi.connectionStatus(deps, deviceIds: string[]): Promise<Record<string, boolean>>`
  - `hanetApi.updateDevice(deps, deviceId: string, name: string): Promise<void>`
  - `hanetApi.listPersons(deps, placeId: number, page: number, size: number): Promise<HanetPerson[]>`
  - `hanetApi.personsByAlias(deps, aliasId: string): Promise<HanetPerson[]>`
  - `hanetApi.registerByUrl(deps, p: {name, aliasId, placeId, url, title}): Promise<string | null>` (trả personID)
  - `hanetApi.updateFaceByUrl(deps, p: {aliasId, placeId, url}): Promise<void>`
  - `hanetApi.updateInfo(deps, p: {aliasId, placeId, name, title}): Promise<void>`
  - `hanetApi.updateAliasId(deps, personId: string, aliasId: string): Promise<void>`
  - `hanetApi.removeByPlace(deps, aliasId: string, placeId: number): Promise<void>`
  - `hanetApi.removeById(deps, personId: string): Promise<void>`
  - `hanetApi.listDepartments(deps, placeId: number, keyword: string): Promise<HanetDepartment[]>`
  - `hanetApi.createDepartment(deps, placeId: number, name: string, desc: string): Promise<number>`
  - `hanetApi.updateDepartment(deps, id: number, name: string, desc: string): Promise<void>`
  - `hanetApi.removeDepartment(deps, id: number): Promise<void>`
  - `hanetApi.addPersonsToDepartment(deps, deptId: number, personIds: string[]): Promise<void>`
  - `hanetApi.removePersonFromDepartment(deps, deptId: number, personId: string): Promise<void>`
  - `shared/types.ts`: `HanetPlace {id, name, address}`, `HanetDevice {deviceID, deviceName, placeID?, placeName?}`, `HanetPerson {aliasID, name, personID, avatar, title}`, `HanetDepartment {id, name}`
  - `tests/fake-hanet.ts`: `PLACE = 998833`, `ok(data?)`, `fail(code, msg?)`, `fakeHanet(routes)`, `configureHanet(db)`

- [ ] **Step 1: Tạo Hanet giả `tests/fake-hanet.ts`**

```ts
import { OAUTH_TOKEN_URL } from '../server/hanet-api';
import { setSetting } from '../server/settings';
import type { Db } from '../server/db';

/** Địa điểm Hanet dùng trong test (trùng HRINTER trên host). */
export const PLACE = 998833;

export const ok = (data: unknown = null) => ({ returnCode: 1, returnMessage: 'SUCCESS', data });
export const fail = (code: number, msg = 'ERROR') => ({ returnCode: code, returnMessage: msg });

/** Giá trị trả về: object (JSON), Response (trả nguyên), hoặc hàm nhận tham số form; hàm ném lỗi = lỗi mạng. */
export type Reply = unknown | ((params: URLSearchParams) => unknown);

export interface FakeCall {
  path: string;
  params: URLSearchParams;
  signal: AbortSignal | null | undefined;
}

/** Hanet giả theo đường dẫn API, ví dụ { '/person/updateInfo': ok() }. Đường dẫn không khai báo trả 404. */
export function fakeHanet(routes: Record<string, Reply>) {
  const calls: FakeCall[] = [];
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const params = new URLSearchParams(String(init?.body ?? ''));
    if (u === OAUTH_TOKEN_URL) {
      calls.push({ path: 'oauth', params, signal: init?.signal });
      return json({ access_token: 'new-token', refresh_token: 'new-refresh' });
    }
    const path = new URL(u).pathname;
    calls.push({ path, params, signal: init?.signal });
    const reply = routes[path];
    if (reply === undefined) return new Response('not found', { status: 404 });
    const body = typeof reply === 'function' ? (reply as (p: URLSearchParams) => unknown)(params) : reply;
    return body instanceof Response ? body : json(body);
  }) as typeof fetch;
  return {
    fetchImpl,
    calls,
    paths: () => calls.map((c) => c.path),
    last: (path: string) => [...calls].reverse().find((c) => c.path === path),
  };
}

/** Cấu hình đủ để reconcileEnabled(db) = true. */
export function configureHanet(db: Db): void {
  setSetting(db, 'hanet.client_id', 'cid');
  setSetting(db, 'hanet.client_secret', 'csecret');
  setSetting(db, 'hanet.access_token', 'tok');
  setSetting(db, 'hanet.refresh_token', 'rtok');
  setSetting(db, 'hanet.place_ids', JSON.stringify([PLACE]));
}
```

- [ ] **Step 2: Viết test client `tests/hanet-client.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok } from './fake-hanet';
import { HanetApiError, callApi, hanetApi, isTransientError, type HanetDeps } from '../server/hanet-api';

function deps(routes: Parameters<typeof fakeHanet>[0]) {
  const db = freshDb();
  configureHanet(db);
  const fake = fakeHanet(routes);
  const d: HanetDeps = { db, fetch: fake.fetchImpl, now: () => Date.now() };
  return { d, fake };
}

test('callApi gửi token, có timeout, trả body khi returnCode = 1', async () => {
  const { d, fake } = deps({ '/profile/getProfile': ok({ name: 'Hùng', email: 'a@b.c', id: 1 }) });
  const body = await callApi(d, '/profile/getProfile', {});
  assert.equal(body.data.name, 'Hùng');
  const c = fake.calls[0];
  assert.equal(c.params.get('token'), 'tok');
  assert.ok(c.signal instanceof AbortSignal, 'phải có AbortSignal để timeout');
});

test('mã lỗi vĩnh viễn và lỗi tạm', async () => {
  const { d } = deps({ '/a': fail(-9006), '/b': fail(-503), '/c': fail(-4242, 'lạ') });
  await assert.rejects(callApi(d, '/a', {}), (e: unknown) => {
    assert.ok(e instanceof HanetApiError);
    assert.equal(e.returnCode, -9006);
    assert.equal(e.transient, false);
    assert.equal(e.message, 'Ảnh không đạt: cần rõ mặt, một người, nhìn thẳng, không mũ, không khẩu trang (mã -9006)');
    return true;
  });
  await assert.rejects(callApi(d, '/b', {}), (e: unknown) => e instanceof HanetApiError && e.transient === true);
  await assert.rejects(callApi(d, '/c', {}), (e: unknown) => e instanceof HanetApiError && e.transient && /Hanet trả lỗi -4242: lạ/.test(e.message));
});

test('HTTP 5xx là lỗi tạm, HTTP 404 là lỗi vĩnh viễn', async () => {
  const { d } = deps({ '/x': new Response('bad gateway', { status: 502 }) });
  await assert.rejects(callApi(d, '/x', {}), (e: unknown) => e instanceof HanetApiError && e.transient && e.returnCode === 502);
  await assert.rejects(callApi(d, '/khong-co', {}), (e: unknown) => e instanceof HanetApiError && !e.transient && e.returnCode === 404);
});

test('Review Focus #1: HTTP 200 nhưng nội dung HTML → lỗi tạm, không ném lỗi lạ', async () => {
  const { d } = deps({ '/html': new Response('<html>bảo trì</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) });
  await assert.rejects(callApi(d, '/html', {}), (e: unknown) => e instanceof HanetApiError && e.transient && /không đọc được/.test(e.message));
});

test('lỗi mạng là lỗi tạm', async () => {
  const { d } = deps({
    '/net': () => {
      throw new TypeError('fetch failed');
    },
  });
  const err = await callApi(d, '/net', {}).catch((e) => e);
  assert.ok(err instanceof TypeError);
  assert.equal(isTransientError(err), true);
});

test('hanetApi: phòng ban, trạng thái camera, đăng ký khuôn mặt', async () => {
  const { d, fake } = deps({
    '/department/list': ok({ count: '1', hits: [{ id: 5132, name: 'Kế toán', placeId: '998833' }], totals: '1' }),
    '/department/create': ok({ id: 6687, name: 'IT' }),
    '/device/getConnectionStatus': ok({ C1: true, C2: false }),
    '/person/registerByUrl': ok({ personID: '1889724440081326080', aliasID: 'NV01' }),
  });
  assert.deepEqual(await hanetApi.listDepartments(d, PLACE, 'Kế toán'), [{ id: 5132, name: 'Kế toán' }]);
  assert.equal(fake.last('/department/list')!.params.get('keyword'), 'Kế toán');
  assert.equal(await hanetApi.createDepartment(d, PLACE, 'IT', ''), 6687);
  assert.deepEqual(await hanetApi.connectionStatus(d, ['C1', 'C2']), { C1: true, C2: false });
  assert.equal(fake.last('/device/getConnectionStatus')!.params.get('deviceIDs'), 'C1,C2');
  const before = fake.calls.length;
  assert.deepEqual(await hanetApi.connectionStatus(d, []), {});
  assert.equal(fake.calls.length, before, 'danh sách rỗng thì không gọi Hanet');
  assert.equal(await hanetApi.registerByUrl(d, { name: 'A', aliasId: 'NV01', placeId: PLACE, url: 'https://img/1.jpg', title: '' }), '1889724440081326080');
  const reg = fake.last('/person/registerByUrl')!.params;
  assert.equal(reg.get('placeID'), String(PLACE));
  assert.equal(reg.get('type'), '0');
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/hanet-client.test.ts`
Expected: FAIL — `callApi`, `hanetApi`, `isTransientError` chưa được export.

- [ ] **Step 4: Thêm kiểu vào `shared/types.ts`** (cuối file)

```ts
export interface HanetPlace {
  id: number;
  name: string;
  address: string;
}

export interface HanetDevice {
  deviceID: string;
  deviceName: string;
  placeID?: number;
  placeName?: string;
}

export interface HanetPerson {
  aliasID: string;
  name: string;
  personID: string;
  avatar: string;
  title: string;
}

export interface HanetDepartment {
  id: number;
  name: string;
}
```

- [ ] **Step 5: Sửa `server/hanet-api.ts`**

Thêm import kiểu ở đầu file:

```ts
import type { HanetDepartment, HanetDevice, HanetPerson, HanetPlace } from '../shared/types';
```

Thay lớp `HanetApiError` bằng:

```ts
export const HANET_TIMEOUT_MS = 15_000;

/** Lỗi do dữ liệu, quyền hoặc ảnh: thử lại cũng vô ích. Mã khác coi là lỗi tạm. */
export const PERMANENT_CODES = new Set([-1, -2035, -1005, -101, -5011, -9005, -9006, -9007, -9008, -5010, -909, -9002]);

const HANET_ERROR_TEXT: Record<number, string> = {
  [-1]: 'Dữ liệu gửi Hanet không hợp lệ',
  [-103]: 'Token Hanet hết hạn',
  [-2035]: 'Tài khoản Hanet không có quyền với địa điểm hoặc thiết bị này',
  [-503]: 'Hệ thống Hanet đang lỗi',
  [-101]: 'Không tìm thấy thiết bị trên Hanet',
  [-102]: 'Thiết bị đang offline',
  [-1005]: 'Không tìm thấy địa điểm trên Hanet',
  [-5011]: 'Không tìm thấy người này trên Hanet',
  [-9005]: 'Người này đã có trên Hanet',
  [-9006]: 'Ảnh không đạt: cần rõ mặt, một người, nhìn thẳng, không mũ, không khẩu trang',
  [-9007]: 'Ảnh trùng với người đã đăng ký',
  [-9008]: 'Địa điểm đã hết số khuôn mặt miễn phí, cần mua gói cloud Hanet',
  [-5010]: 'Ảnh không hợp lệ',
  [-909]: 'Tải ảnh lên Hanet thất bại',
  [-9002]: 'Định dạng ảnh không được hỗ trợ',
};

export function describeHanetError(code: number): string | null {
  return HANET_ERROR_TEXT[code] ?? null;
}

export class HanetApiError extends Error {
  constructor(
    public returnCode: number,
    message: string,
    public transient = !PERMANENT_CODES.has(returnCode),
  ) {
    super(message);
  }
}

/** Lỗi mạng/timeout (không phải HanetApiError) luôn là lỗi tạm. */
export function isTransientError(err: unknown): boolean {
  return err instanceof HanetApiError ? err.transient : true;
}
```

Thay hàm `postForm` bằng:

```ts
async function postForm(deps: HanetDeps, url: string, params: Record<string, string>): Promise<any> {
  const res = await deps.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(HANET_TIMEOUT_MS),
  });
  if (!res.ok) throw new HanetApiError(res.status, `HTTP ${res.status} từ ${url}`, res.status >= 500 || res.status === 429);
  try {
    return await res.json();
  } catch {
    throw new HanetApiError(0, `Hanet trả dữ liệu không đọc được từ ${url}`, true);
  }
}
```

Đổi `async function callApi(` thành `export async function callApi(` và thay dòng ném lỗi cuối hàm (`if (code !== 1) throw ...`) bằng:

```ts
  if (code !== 1) {
    const text = describeHanetError(code);
    throw new HanetApiError(code, text ? `${text} (mã ${code})` : `Hanet trả lỗi ${code}: ${body?.returnMessage ?? ''}`);
  }
```

Thêm vào cuối file:

```ts
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Hàm mỏng cho từng API Hanet dùng trong hệ thống (tài liệu Postman 13088306/TVeqcn2C). */
export const hanetApi = {
  async getProfile(deps: HanetDeps): Promise<{ name: string; email: string }> {
    const d = (await callApi(deps, '/profile/getProfile', {})).data ?? {};
    return { name: String(d.name ?? ''), email: String(d.email ?? '') };
  },
  async getPlaces(deps: HanetDeps): Promise<HanetPlace[]> {
    return arr<Record<string, unknown>>((await callApi(deps, '/place/getPlaces', {})).data).map((p) => ({
      id: Number(p.id),
      name: String(p.name ?? ''),
      address: String(p.address ?? ''),
    }));
  },
  async listDevices(deps: HanetDeps, placeId: number): Promise<HanetDevice[]> {
    return arr<HanetDevice>((await callApi(deps, '/device/getListDeviceByPlace', { placeID: String(placeId) })).data);
  },
  async connectionStatus(deps: HanetDeps, deviceIds: string[]): Promise<Record<string, boolean>> {
    if (deviceIds.length === 0) return {};
    const d = (await callApi(deps, '/device/getConnectionStatus', { deviceIDs: deviceIds.join(',') })).data;
    return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, boolean>) : {};
  },
  async updateDevice(deps: HanetDeps, deviceId: string, name: string): Promise<void> {
    await callApi(deps, '/device/updateDevice', { deviceID: deviceId, deviceName: name });
  },
  async listPersons(deps: HanetDeps, placeId: number, page: number, size: number): Promise<HanetPerson[]> {
    return arr<HanetPerson>(
      (await callApi(deps, '/person/getListByPlace', { placeID: String(placeId), type: '0', page: String(page), size: String(size) })).data,
    );
  },
  async personsByAlias(deps: HanetDeps, aliasId: string): Promise<HanetPerson[]> {
    return arr<HanetPerson>((await callApi(deps, '/person/getUserInfoByAliasID', { aliasID: aliasId })).data);
  },
  async registerByUrl(deps: HanetDeps, p: { name: string; aliasId: string; placeId: number; url: string; title: string }): Promise<string | null> {
    const d = (
      await callApi(deps, '/person/registerByUrl', {
        name: p.name,
        aliasID: p.aliasId,
        placeID: String(p.placeId),
        url: p.url,
        title: p.title,
        type: '0',
      })
    ).data;
    return d?.personID ? String(d.personID) : null;
  },
  async updateFaceByUrl(deps: HanetDeps, p: { aliasId: string; placeId: number; url: string }): Promise<void> {
    await callApi(deps, '/person/updateByFaceUrlByAliasID', { aliasID: p.aliasId, placeID: String(p.placeId), url: p.url });
  },
  async updateInfo(deps: HanetDeps, p: { aliasId: string; placeId: number; name: string; title: string }): Promise<void> {
    await callApi(deps, '/person/updateInfo', { aliasID: p.aliasId, placeID: String(p.placeId), name: p.name, title: p.title });
  },
  async updateAliasId(deps: HanetDeps, personId: string, aliasId: string): Promise<void> {
    await callApi(deps, '/person/updateAliasID', { personID: personId, aliasID: aliasId });
  },
  async removeByPlace(deps: HanetDeps, aliasId: string, placeId: number): Promise<void> {
    await callApi(deps, '/person/removeByPlace', { aliasID: aliasId, placeID: String(placeId) });
  },
  async removeById(deps: HanetDeps, personId: string): Promise<void> {
    await callApi(deps, '/person/removePersonByID', { personID: personId });
  },
  async listDepartments(deps: HanetDeps, placeId: number, keyword: string): Promise<HanetDepartment[]> {
    const d = (await callApi(deps, '/department/list', { placeID: String(placeId), keyword, page: '1', size: '50' })).data;
    return arr<Record<string, unknown>>(d?.hits).map((h) => ({ id: Number(h.id), name: String(h.name ?? '') }));
  },
  async createDepartment(deps: HanetDeps, placeId: number, name: string, desc: string): Promise<number> {
    const d = (await callApi(deps, '/department/create', { placeID: String(placeId), name, desc })).data;
    const id = Number(d?.id);
    if (!Number.isInteger(id) || id <= 0) throw new HanetApiError(0, 'Hanet không trả ID phòng ban vừa tạo');
    return id;
  },
  async updateDepartment(deps: HanetDeps, id: number, name: string, desc: string): Promise<void> {
    await callApi(deps, '/department/update', { id: String(id), name, desc });
  },
  async removeDepartment(deps: HanetDeps, id: number): Promise<void> {
    await callApi(deps, '/department/remove', { id: String(id) });
  },
  async addPersonsToDepartment(deps: HanetDeps, deptId: number, personIds: string[]): Promise<void> {
    await callApi(deps, '/department/add-person', { departmentID: String(deptId), personIDs: personIds.join(',') });
  },
  async removePersonFromDepartment(deps: HanetDeps, deptId: number, personId: string): Promise<void> {
    await callApi(deps, '/department/remove-person', { departmentID: String(deptId), personID: personId });
  },
};
```

- [ ] **Step 6: Chạy test**

Run: `npx tsx --test tests/hanet-client.test.ts tests/hanet-api.test.ts && npm run lint`
Expected: PASS (test đối soát cũ vẫn qua).

- [ ] **Step 7: Commit**

```bash
git add server/hanet-api.ts shared/types.ts tests/fake-hanet.ts tests/hanet-client.test.ts
git commit -m "feat(hanet): shared API client with timeout, error classes and typed calls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Kiểm tra kết nối và chọn địa điểm

**Files:**
- Modify: `server/routes/hanet.ts`
- Modify: `shared/types.ts`
- Modify: `src/components/config/HanetCredentialsCard.tsx` (viết lại toàn bộ)
- Test: `tests/hanet-connect.test.ts`, `tests/permissions.test.ts`

**Interfaces:**
- Consumes: `hanetApi.getProfile`, `hanetApi.getPlaces` (Task 2); `fakeHanet`, `configureHanet`, `ok`, `fail`, `PLACE` (Task 2).
- Produces: `POST /api/hanet/test-connection` → `HanetConnectionTest { ok: boolean; account: {name, email} | null; places: HanetPlace[]; message: string }`.

- [ ] **Step 1: Viết test `tests/hanet-connect.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok, type Reply } from './fake-hanet';

async function setup(routes: Record<string, Reply>, configured = true) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  if (configured) configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  return { app, fake, hr: await loginAs(app, 'HR01') };
}

test('kiểm tra kết nối: trả tài khoản và danh sách địa điểm', async () => {
  const { app, hr } = await setup({
    '/profile/getProfile': ok({ name: 'Dương Đức Văn', email: 'x@y.z', id: 1 }),
    '/place/getPlaces': ok([{ id: PLACE, name: 'HRINTER', address: 'B36', userID: 1 }]),
  });
  try {
    const r = await hr.post('/api/hanet/test-connection', {});
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      ok: true,
      account: { name: 'Dương Đức Văn', email: 'x@y.z' },
      places: [{ id: PLACE, name: 'HRINTER', address: 'B36' }],
      message: 'Đã kết nối tài khoản Dương Đức Văn, 1 địa điểm',
    });
  } finally {
    await app.close();
  }
});

test('kiểm tra kết nối: Hanet báo lỗi → ok=false kèm lý do, không phải 500', async () => {
  const { app, hr } = await setup({ '/profile/getProfile': fail(-2035) });
  try {
    const r = await hr.post('/api/hanet/test-connection', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, false);
    assert.match(r.body.message, /không có quyền/);
    assert.deepEqual(r.body.places, []);
  } finally {
    await app.close();
  }
});

test('kiểm tra kết nối: chưa nhập thông tin thì không gọi Hanet', async () => {
  const { app, hr, fake } = await setup({}, false);
  try {
    const r = await hr.post('/api/hanet/test-connection', {});
    assert.equal(r.body.ok, false);
    assert.equal(r.body.message, 'Chưa nhập Client ID và Refresh Token (hoặc Access Token)');
    assert.equal(fake.calls.length, 0);
  } finally {
    await app.close();
  }
});
```

Trong `tests/permissions.test.ts`, thêm vào mảng `CASES` ngay sau dòng `'/api/hanet/config'` kiểu `PUT`:

```ts
  { method: 'POST', path: () => '/api/hanet/test-connection', body: {}, allowed: HR },
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/hanet-connect.test.ts`
Expected: FAIL — 404 Không tìm thấy.

- [ ] **Step 3: Kiểu `HanetConnectionTest` trong `shared/types.ts`** (cuối file)

```ts
export interface HanetConnectionTest {
  ok: boolean;
  account: { name: string; email: string } | null;
  places: HanetPlace[];
  message: string;
}
```

- [ ] **Step 4: Route trong `server/routes/hanet.ts`**

Thêm import:

```ts
import { hanetApi } from '../hanet-api';
import { getSetting } from '../settings';
import type { HanetConnectionTest } from '../../shared/types';
```

(gộp `hanetApi` vào dòng `import { reconcileDate } from '../hanet-api';` thành `import { hanetApi, reconcileDate } from '../hanet-api';`; gộp `HanetConnectionTest` vào dòng `import type { WebhookLog } ...`).

Trong `hanetRoutes`, thêm ngay sau route `PUT /hanet/config`:

```ts
  r.post(
    '/hanet/test-connection',
    hr,
    ah(async (_req, res) => {
      const fail = (message: string): HanetConnectionTest => ({ ok: false, account: null, places: [], message });
      if (!getSetting(db, 'hanet.client_id') || !(getSetting(db, 'hanet.refresh_token') || getSetting(db, 'hanet.access_token'))) {
        res.json(fail('Chưa nhập Client ID và Refresh Token (hoặc Access Token)'));
        return;
      }
      const deps = { db, fetch: ctx.fetch, now: ctx.now };
      try {
        const account = await hanetApi.getProfile(deps);
        const places = await hanetApi.getPlaces(deps);
        const body: HanetConnectionTest = {
          ok: true,
          account,
          places,
          message: `Đã kết nối tài khoản ${account.name || account.email}, ${places.length} địa điểm`,
        };
        res.json(body);
      } catch (err) {
        res.json(fail((err as Error).message));
      }
    }),
  );
```

- [ ] **Step 5: Chạy test**

Run: `npx tsx --test tests/hanet-connect.test.ts tests/permissions.test.ts`
Expected: PASS.

- [ ] **Step 6: Giao diện — viết lại `src/components/config/HanetCredentialsCard.tsx`**

```tsx
import React, { useState } from 'react';
import { PlugZap, ShieldCheck } from 'lucide-react';
import type { HanetConfigView, HanetConnectionTest, HanetPlace } from '../../types';
import { api, errorMessage } from '../../api';
import { fmtDateTime, vnToday } from '../../format';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

export const HanetCredentialsCard: React.FC<{ config: HanetConfigView; onChange: (c: HanetConfigView) => void; onReconciled: () => void }> = ({
  config,
  onChange,
  onReconciled,
}) => {
  const savedPlace = config.placeIds[0] ? String(config.placeIds[0]) : '';
  const [clientId, setClientId] = useState(config.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [apiBase, setApiBase] = useState(config.apiBase);
  const [placeId, setPlaceId] = useState(savedPlace);
  const [places, setPlaces] = useState<HanetPlace[]>([]);
  const [conn, setConn] = useState<HanetConnectionTest | null>(null);
  const [date, setDate] = useState(vnToday());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ config: HanetConfigView }>('/api/hanet/config', {
        method: 'PUT',
        body: { clientId, clientSecret, accessToken, refreshToken, apiBase, placeIds: placeId ? [Number(placeId)] : [] },
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

  const testConnection = async () => {
    setBusy(true);
    try {
      const r = await api<HanetConnectionTest>('/api/hanet/test-connection', { method: 'POST', body: {} });
      setConn(r);
      setPlaces(r.places);
    } catch (err) {
      setConn({ ok: false, account: null, places: [], message: errorMessage(err) });
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
  const placeChanged = savedPlace !== '' && placeId !== '' && placeId !== savedPlace;

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
          <Field label="Địa điểm Hanet" hint={places.length ? undefined : 'Lưu thông tin trên rồi bấm "Kiểm tra kết nối" để nạp danh sách'}>
            <select className={inputCls} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {placeId && !places.some((p) => String(p.id) === placeId) && <option value={placeId}>ID {placeId}</option>}
              {places.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} (ID {p.id})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Địa chỉ API Hanet">
            <input className={`${inputCls} font-mono`} value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          </Field>
        </div>
        {placeChanged && (
          <p className="text-amber-700 bg-amber-50 rounded-xl p-2">
            Nhân sự và phòng ban đã đồng bộ với địa điểm cũ sẽ không tự chuyển sang địa điểm mới.
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={testConnection} disabled={busy} className={`${secondaryBtn} flex-1`}>
            <PlugZap className="w-3.5 h-3.5" /> Kiểm tra kết nối
          </button>
          <button type="submit" disabled={busy} className={`${primaryBtn} flex-1`}>
            Lưu cấu hình Hanet
          </button>
        </div>
        {conn && (
          <p className={`rounded-xl p-2 ${conn.ok ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>{conn.message}</p>
        )}
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

- [ ] **Step 7: Kiểm tra kiểu và build**

Run: `npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 8: Commit**

```bash
git add server/routes/hanet.ts shared/types.ts src/components/config/HanetCredentialsCard.tsx tests/hanet-connect.test.ts tests/permissions.test.ts
git commit -m "feat(hanet): test connection and pick the Hanet place from a list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Webhook người lạ và bảng `face_sightings`

**Files:**
- Create: `server/sightings.ts`
- Modify: `server/hanet.ts` (thêm `parseStranger`, `STRANGER_MESSAGE`; xóa `recentUnmatchedFaces`, `RECENT_FACES_WINDOW_MS`, `RECENT_FACES_LIMIT`)
- Modify: `server/routes/hanet.ts` (webhook; thay `GET /hanet/recent-faces` bằng `GET /hanet/sightings`)
- Modify: `server/jobs.ts` (dọn mỗi giờ)
- Modify: `shared/types.ts` (xóa `RecentFace`; thêm `SightingKind`, `FaceSighting`)
- Modify: `src/components/UserFormModal.tsx` (dùng API mới)
- Test: `tests/sightings.test.ts`; sửa `tests/hanet.test.ts` (xóa test `'gợi ý từ camera...'`), `tests/permissions.test.ts`, `tests/jobs.test.ts`

**Interfaces:**
- Consumes: `parseCheckin`, `normalizeTs`, `ingestCheckin`, `UNMATCHED_MESSAGE` trong `server/hanet.ts`.
- Produces:
  - `type SightingKind = 'stranger' | 'unlinked'`
  - `interface FaceSighting { id: number; kind: SightingKind; personId: string|null; aliasId: string|null; personName: string|null; deviceId: string; deviceName: string|null; ts: number; imageUrl: string }`
  - `SIGHTING_TTL_MS = 86_400_000`, `SIGHTING_PICK_WINDOW_MS = 1_800_000`
  - `recordSighting(db, s: NewSighting, now): void`
  - `listSightings(db, now, kind?: SightingKind): FaceSighting[]`
  - `getSighting(db, id: number): FaceSighting | null`
  - `deleteSighting(db, id: number): void`
  - `purgeSightings(db, now): number`
  - `parseStranger(body, now): { deviceId: string; deviceName: string|null; ts: number; imageUrl: string } | null`
  - `STRANGER_MESSAGE = 'Người lạ'`
  - `GET /api/hanet/sightings?kind=stranger|unlinked` → `{ sightings: FaceSighting[] }` (HR)
  - `DueJobs.purgeHourly: boolean` (phút thứ 30 mỗi giờ)

- [ ] **Step 1: Viết test `tests/sightings.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs, Client, freshDb } from './helpers';
import { getWebhookToken } from '../server/hanet';
import { listSightings, purgeSightings, recordSighting, SIGHTING_PICK_WINDOW_MS, SIGHTING_TTL_MS } from '../server/sightings';

// Payload người lạ thật từ camera C21272C952 (13/10/2026)
const STRANGER = {
  action_type: 'update', aliasID: '', data: '', data_type: 'log', date: '2026-10-13 14:37:13',
  detected_image_url: 'https://vcdn-z-image.hanet.ai/hanet-camera-image/face/upload/C21272C952/2026/10/13/eb13534e.jpg',
  deviceID: 'C21272C952', deviceName: 'C21272C952', hash: 'x', id: 'y', keycode: '', mask: '-1',
  personID: '', personName: '', personTitle: '', personType: '2', placeID: '998833', placeName: 'HRINTER', temp: 0, time: 1791877033000,
};

async function setup() {
  const app = await startTestApp();
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  seedUser(app.db, { code: 'NV01' });
  return { app, url: `/api/hanet/webhook/${getWebhookToken(app.db)}`, hook: new Client(app.baseUrl) };
}
const lastLog = (db: import('../server/db').Db) =>
  db.prepare('SELECT status, message FROM webhook_logs ORDER BY id DESC LIMIT 1').get() as { status: string; message: string };

test('webhook người lạ có ảnh → lưu sighting stranger, nhật ký ghi "Người lạ"', async () => {
  const { app, url, hook } = await setup();
  try {
    const r = await hook.post(url, STRANGER);
    assert.equal(r.status, 200);
    assert.deepEqual(lastLog(app.db), { status: 'ignored', message: 'Người lạ' });
    const row = app.db.prepare('SELECT kind, device_id, ts, image_url, person_id FROM face_sightings').get() as Record<string, unknown>;
    assert.deepEqual({ ...row }, { kind: 'stranger', device_id: 'C21272C952', ts: 1791877033000, image_url: STRANGER.detected_image_url, person_id: null });
  } finally {
    await app.close();
  }
});

test('người lạ không có ảnh → không lưu sighting, nhật ký như cũ', async () => {
  const { app, url, hook } = await setup();
  try {
    await hook.post(url, { ...STRANGER, detected_image_url: '' });
    assert.equal(lastLog(app.db).message, 'Không phải sự kiện nhận diện');
    assert.equal((app.db.prepare('SELECT COUNT(*) AS c FROM face_sightings').get() as { c: number }).c, 0);
  } finally {
    await app.close();
  }
});

test('người có trên Hanet nhưng chưa có trên web → sighting unlinked; danh sách bỏ trùng và bỏ người đã thành nhân sự', async () => {
  const { app, url, hook } = await setup();
  try {
    const face = { aliasID: '003', personID: 'P3', personName: 'Dương Đức Văn', personType: '0', deviceID: 'C1', detected_image_url: 'https://img/3.jpg' };
    await hook.post(url, { ...face, time: Date.now() - 60_000 });
    await hook.post(url, { ...face, time: Date.now() - 30_000 });
    await hook.post(url, { aliasID: 'NV01', personType: '0', deviceID: 'C1', detected_image_url: 'https://img/nv01.jpg', time: Date.now() });
    await hook.post(url, STRANGER);
    const hr = await loginAs(app, 'HR01');
    const unlinked = (await hr.get('/api/hanet/sightings?kind=unlinked')).body.sightings;
    assert.deepEqual(unlinked.map((s: any) => [s.kind, s.personId, s.aliasId, s.personName]), [['unlinked', 'P3', '003', 'Dương Đức Văn']]);
    const all = (await hr.get('/api/hanet/sightings')).body.sightings;
    assert.deepEqual(all.map((s: any) => s.kind), ['stranger', 'unlinked']);
    assert.equal((await hr.get('/api/hanet/sightings?kind=abc')).status, 400);

    seedUser(app.db, { code: 'NV-KHAC', hanetPersonId: 'P3' });
    assert.deepEqual((await hr.get('/api/hanet/sightings?kind=unlinked')).body.sightings, []);

    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.get('/api/hanet/sightings')).status, 403);
  } finally {
    await app.close();
  }
});

test('chỉ liệt kê lượt trong 30 phút; dọn lượt quá 24 giờ', () => {
  const db = freshDb();
  const now = Date.now();
  const s = { kind: 'stranger' as const, personId: null, aliasId: null, personName: null, deviceId: 'C1', deviceName: null, ts: now, imageUrl: 'https://img/x.jpg' };
  recordSighting(db, s, now - SIGHTING_TTL_MS - 1000);
  recordSighting(db, s, now - SIGHTING_PICK_WINDOW_MS - 1000);
  recordSighting(db, s, now - 1000);
  assert.equal(listSightings(db, now).length, 1);
  assert.equal(purgeSightings(db, now), 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM face_sightings').get() as { c: number }).c, 2);
});
```

Trong `tests/hanet.test.ts`, xóa nguyên test `'gợi ý từ camera: người vừa được nhận diện nhưng chưa có trong danh sách nhân sự'`.

Trong `tests/permissions.test.ts`, thay dòng `'/api/hanet/recent-faces'` bằng:

```ts
  { method: 'GET', path: () => '/api/hanet/sightings', allowed: HR },
```

Trong `tests/jobs.test.ts`, thay hai dòng `assert.deepEqual(dueJobs(...` bằng:

```ts
  assert.deepEqual(dueJobs(at('02:00')), { backup: true, reconcileToday: true, reconcileYesterday: false, purgeSessions: true, purgeHourly: false });
  assert.deepEqual(dueJobs(at('02:01')), { backup: false, reconcileToday: false, reconcileYesterday: false, purgeSessions: false, purgeHourly: false });
  assert.equal(dueJobs(at('10:30')).purgeHourly, true);
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/sightings.test.ts tests/jobs.test.ts`
Expected: FAIL — không tìm thấy module `../server/sightings`.

- [ ] **Step 3: Kiểu trong `shared/types.ts`**

Xóa `interface RecentFace { ... }`. Thêm cuối file:

```ts
export type SightingKind = 'stranger' | 'unlinked';

/** Lượt camera chụp người chưa khớp nhân sự nào (giữ 24 giờ) — nguồn ảnh đăng ký FaceID. */
export interface FaceSighting {
  id: number;
  kind: SightingKind;
  personId: string | null;
  aliasId: string | null;
  personName: string | null;
  deviceId: string;
  deviceName: string | null;
  ts: number;
  imageUrl: string;
}
```

- [ ] **Step 4: Tạo `server/sightings.ts`**

```ts
import type { Db } from './db';
import type { FaceSighting, SightingKind } from '../shared/types';

export const SIGHTING_TTL_MS = 24 * 60 * 60_000;
export const SIGHTING_PICK_WINDOW_MS = 30 * 60_000;
const LIST_LIMIT = 30;

export interface NewSighting {
  kind: SightingKind;
  personId: string | null;
  aliasId: string | null;
  personName: string | null;
  deviceId: string;
  deviceName: string | null;
  ts: number;
  imageUrl: string;
}

type Row = Record<string, any>;

function mapSighting(r: Row): FaceSighting {
  return {
    id: r.id,
    kind: r.kind,
    personId: r.person_id ?? null,
    aliasId: r.alias_id ?? null,
    personName: r.person_name ?? null,
    deviceId: r.device_id,
    deviceName: r.device_name ?? null,
    ts: r.ts,
    imageUrl: r.image_url,
  };
}

export function recordSighting(db: Db, s: NewSighting, now: number): void {
  db.prepare(
    `INSERT INTO face_sightings(kind, person_id, alias_id, person_name, device_id, device_name, ts, image_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(s.kind, s.personId, s.aliasId, s.personName, s.deviceId, s.deviceName, s.ts, s.imageUrl, now);
}

/**
 * Lượt nhận trong 30 phút gần nhất, mới nhất trước. Với `unlinked`: mỗi người một dòng
 * và bỏ người nay đã là nhân sự (khớp mã hoặc Person ID).
 */
export function listSightings(db: Db, now: number, kind?: SightingKind): FaceSighting[] {
  const since = now - SIGHTING_PICK_WINDOW_MS;
  const rows = (
    kind
      ? db.prepare('SELECT * FROM face_sightings WHERE created_at >= ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 500').all(since, kind)
      : db.prepare('SELECT * FROM face_sightings WHERE created_at >= ? ORDER BY created_at DESC, id DESC LIMIT 500').all(since)
  ) as Row[];
  const known = db.prepare('SELECT 1 FROM users WHERE code = ? OR (hanet_person_id IS NOT NULL AND hanet_person_id = ?)');
  const seen = new Set<string>();
  const out: FaceSighting[] = [];
  for (const r of rows) {
    const s = mapSighting(r);
    if (s.kind === 'unlinked') {
      const key = s.personId ?? `alias:${s.aliasId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (known.get(s.aliasId?.toUpperCase() ?? '', s.personId ?? '')) continue;
    }
    out.push(s);
    if (out.length >= LIST_LIMIT) break;
  }
  return out;
}

export function getSighting(db: Db, id: number): FaceSighting | null {
  const row = db.prepare('SELECT * FROM face_sightings WHERE id = ?').get(id) as Row | undefined;
  return row ? mapSighting(row) : null;
}

export function deleteSighting(db: Db, id: number): void {
  db.prepare('DELETE FROM face_sightings WHERE id = ?').run(id);
}

export function purgeSightings(db: Db, now: number): number {
  return Number(db.prepare('DELETE FROM face_sightings WHERE created_at < ?').run(now - SIGHTING_TTL_MS).changes);
}
```

- [ ] **Step 5: `server/hanet.ts` — nhận dạng người lạ, bỏ hàm cũ**

Xóa `RECENT_FACES_WINDOW_MS`, `RECENT_FACES_LIMIT` và toàn bộ hàm `recentUnmatchedFaces`; bỏ `RecentFace` khỏi dòng `import type ... from '../shared/types'`.

Thêm ngay sau hàm `parseCheckin`:

```ts
export const STRANGER_MESSAGE = 'Người lạ';

/**
 * Người lạ (personType 2): không có personID/aliasID nên parseCheckin trả null,
 * nhưng có ảnh để HR chọn đăng ký FaceID. Trả null nếu không phải người lạ có ảnh.
 */
export function parseStranger(body: unknown, now: number): { deviceId: string; deviceName: string | null; ts: number; imageUrl: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const d = (b.data && typeof b.data === 'object' ? b.data : b) as Record<string, unknown>;
  const deviceId = str(d.deviceID);
  const imageUrl = str(d.detected_image_url);
  if (num(d.personType) !== 2 || !deviceId || !imageUrl) return null;
  return { deviceId, deviceName: str(d.deviceName), ts: normalizeTs(num(d.time), now).ts, imageUrl };
}
```

- [ ] **Step 6: Route webhook và danh sách sighting — `server/routes/hanet.ts`**

Sửa import từ `'../hanet'`: bỏ `recentUnmatchedFaces`, thêm `parseStranger, STRANGER_MESSAGE, UNMATCHED_MESSAGE`. Thêm:

```ts
import { listSightings, recordSighting } from '../sightings';
import type { SightingKind } from '../../shared/types';
```

Trong webhook, thay khối `if (!parsed) { ... }` bằng:

```ts
    if (!parsed) {
      const stranger = parseStranger(req.body, now);
      if (stranger) {
        recordSighting(db, { kind: 'stranger', personId: null, aliasId: null, personName: null, ...stranger }, now);
        logWebhook(db, { status: 'ignored', deviceName: stranger.deviceName, message: STRANGER_MESSAGE, rawPayload: req.body }, now);
      } else {
        logWebhook(db, { status: 'ignored', message: 'Không phải sự kiện nhận diện', rawPayload: req.body }, now);
      }
      res.json({ returnCode: 1, returnMessage: 'ignored' });
      return;
    }
```

Ngay trước lời gọi `logWebhook(db, { status: result.status, ...` ở cuối webhook, thêm:

```ts
    if (result.status === 'ignored' && result.message === UNMATCHED_MESSAGE && parsed.input.imageUrl) {
      const i = parsed.input;
      recordSighting(
        db,
        { kind: 'unlinked', personId: i.personId, aliasId: i.aliasId, personName: i.personName, deviceId: i.deviceId, deviceName: i.deviceName, ts: i.ts, imageUrl: i.imageUrl as string },
        now,
      );
    }
```

Thay route `r.get('/hanet/recent-faces', ...)` bằng:

```ts
  r.get('/hanet/sightings', hr, (req, res) => {
    const kind = req.query.kind;
    if (kind !== undefined && kind !== 'stranger' && kind !== 'unlinked') throw new HttpError(400, 'Loại lượt chụp không hợp lệ');
    res.json({ sightings: listSightings(db, ctx.now(), kind as SightingKind | undefined) });
  });
```

- [ ] **Step 7: Dọn mỗi giờ — `server/jobs.ts`**

Thêm `purgeHourly: boolean;` vào `interface DueJobs`, và `purgeHourly: m % 60 === 30,` vào object trả về của `dueJobs`. Thêm import `import { purgeSightings } from './sightings';`. Trong `tick`, sau dòng `purgeSessions`:

```ts
    if (due.purgeHourly) run('purge-sightings', () => purgeSightings(ctx.db, now));
```

- [ ] **Step 8: `src/components/UserFormModal.tsx` dùng API mới**

Thay `RecentFace` bằng `FaceSighting` trong dòng import kiểu và hai chỗ `useState<RecentFace[] | null>` / `pickFace = (f: RecentFace)`. Thay dòng gọi API trong `loadFaces` bằng:

```ts
      setFaces((await api<{ sightings: FaceSighting[] }>('/api/hanet/sightings?kind=unlinked')).sightings);
```

Đổi `key={f.personId ?? \`alias:${f.aliasId}\`}` thành `key={f.id}`, và chữ "trong 10 phút gần đây" thành "trong 30 phút gần đây".

- [ ] **Step 9: Chạy test**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/sightings.ts server/hanet.ts server/routes/hanet.ts server/jobs.ts shared/types.ts src/components/UserFormModal.tsx tests/sightings.test.ts tests/hanet.test.ts tests/permissions.test.ts tests/jobs.test.ts
git commit -m "feat(webhook): keep stranger and unlinked face sightings for 24h

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hàng đợi đồng bộ `sync_jobs`

**Files:**
- Create: `server/hanet-sync.ts`
- Create: `server/sync-handlers.ts`
- Modify: `server/context.ts`, `server/index.ts`, `tests/helpers.ts` (cờ `kickSync`)
- Modify: `server/routes/hanet.ts` (`GET /hanet/sync`, `POST /hanet/sync/retry`; chạy hàng đợi sau khi lưu cấu hình)
- Modify: `server/jobs.ts` (job `sync` mỗi phút; dọn việc `done`)
- Modify: `shared/types.ts`, `src/format.ts`
- Create: `src/components/config/SyncStatusCard.tsx`
- Modify: `src/components/HanetConfigTab.tsx`
- Test: `tests/hanet-sync.test.ts`, `tests/permissions.test.ts`

**Interfaces:**
- Consumes: `HanetApiError`, `isTransientError`, `HanetDeps` (Task 2); `reconcileEnabled` (`server/hanet.ts`); `tx` (`server/db.ts`).
- Produces (`server/hanet-sync.ts`):
  - `class SyncDeferred extends Error` — handler ném khi phụ thuộc chưa sẵn sàng.
  - `interface SyncJob { id: number; entityType: SyncEntity; entityId: string; op: SyncOp; payload: Record<string, any>; attempts: number }`
  - `type SyncHandler = (deps: HanetDeps, job: SyncJob) => Promise<void>`; `type SyncHandlers = Partial<Record<SyncOp, SyncHandler>>`
  - `RETRY_DELAYS_MIN = [1, 2, 5, 15]`, `RETRY_LATER_MIN = 60`, `MAX_ATTEMPTS = 20`, `DEFER_MS = 300_000`, `DONE_TTL_MS = 604_800_000`
  - `retryDelayMs(attempts: number): number`
  - `enqueue(db, entityType: SyncEntity, entityId: string, op: SyncOp, payload: Record<string, unknown>, now: number): void`
  - `dropEntityJobs(db, entityType, entityId): void`
  - `wakeEntity(db, entityType, entityId, now): void`; `wakeOp(db, op: SyncOp, now): void`
  - `refreshEntityStatus(db, entityType, entityId): void`
  - `runDueJobs(deps, handlers: SyncHandlers, limit?: number): Promise<{ done: number; failed: number; deferred: number }>`
  - `runEntityJobs(deps, handlers, entityType, entityId): Promise<void>`
  - `kickEntity(ctx: AppContext, entityType, entityId): void`; `kickAll(ctx: AppContext): void`
  - `retryJobs(db, filter: { jobId?: number; entityType?: SyncEntity; entityId?: string }, now): number`
  - `syncSummary(db): SyncSummary`
  - `purgeDoneJobs(db, now): number`
- Produces (`server/sync-handlers.ts`): `SYNC_HANDLERS: SyncHandlers` (rỗng; Task 6, 8, 9 thêm handler).
- Produces (`shared/types.ts`): `SyncEntity`, `SyncOp`, `SyncJobView`, `SyncSummary`.
- Produces (`AppConfig`): `kickSync: boolean` (production `true`, test mặc định `false`).
- Produces (API): `GET /api/hanet/sync` → `SyncSummary`; `POST /api/hanet/sync/retry {jobId?, entityType?, entityId?}` → `SyncSummary` (HR).

- [ ] **Step 1: Kiểu trong `shared/types.ts`** (cuối file)

```ts
export type SyncEntity = 'user' | 'department' | 'camera';
export type SyncOp =
  | 'user.info'
  | 'user.department'
  | 'user.alias'
  | 'user.remove'
  | 'dept.create'
  | 'dept.update'
  | 'dept.remove'
  | 'camera.rename';

export interface SyncJobView {
  id: number;
  entityType: SyncEntity;
  entityId: string;
  op: SyncOp;
  label: string; // tên đối tượng để hiển thị
  attempts: number;
  lastError: string | null;
  updatedAt: number;
}

export interface SyncSummary {
  pending: number;
  error: number;
  errors: SyncJobView[]; // 50 việc lỗi gần nhất
}
```

- [ ] **Step 2: Cờ `kickSync`**

`server/context.ts`, trong `AppConfig` thêm:

```ts
  /** Thử đồng bộ Hanet ngay sau khi lưu (production). Test tắt để tự gọi runDueJobs. */
  kickSync: boolean;
```

`server/index.ts`, trong object `config` thêm `kickSync: true,`.

`tests/helpers.ts`, trong `startTestApp`, đổi dòng `config:` thành:

```ts
    config: { production: false, simulatorEnabled: true, trustProxy: false, backupDir, kickSync: false, ...overrides.config },
```

- [ ] **Step 3: Viết test `tests/hanet-sync.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser, startTestApp, loginAs } from './helpers';
import { configureHanet } from './fake-hanet';
import { HanetApiError, type HanetDeps } from '../server/hanet-api';
import {
  DEFER_MS, DONE_TTL_MS, MAX_ATTEMPTS, SyncDeferred, enqueue, purgeDoneJobs, retryDelayMs, retryJobs, runDueJobs, syncSummary,
  type SyncHandlers, type SyncJob,
} from '../server/hanet-sync';
import { deleteSetting } from '../server/settings';
import type { Db } from '../server/db';

function setup() {
  const db = freshDb();
  configureHanet(db);
  let now = 1_800_000_000_000;
  const deps: HanetDeps = { db, fetch: (() => Promise.reject(new Error('không gọi mạng'))) as typeof fetch, now: () => now };
  const userId = seedUser(db, { code: 'NV01', name: 'Nguyễn An' });
  return { db, deps, userId, advance: (ms: number) => (now += ms), now: () => now };
}
const job = (db: Db, id = 1) => db.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(id) as Record<string, any>;
const userStatus = (db: Db, id: string) =>
  ({ ...(db.prepare('SELECT hanet_sync_status AS s, hanet_sync_error AS e FROM users WHERE id = ?').get(id) as object) });

test('thêm việc → đối tượng "pending"; chạy xong → "done" và "synced"', async () => {
  const { db, deps, userId, now } = setup();
  const seen: SyncJob[] = [];
  const handlers: SyncHandlers = { 'user.info': async (_d, j) => void seen.push(j) };
  enqueue(db, 'user', userId, 'user.info', { name: 'Nguyễn An' }, now());
  assert.deepEqual(userStatus(db, userId), { s: 'pending', e: null });
  assert.deepEqual(await runDueJobs(deps, handlers), { done: 1, failed: 0, deferred: 0 });
  assert.equal(seen[0].payload.name, 'Nguyễn An');
  assert.equal(job(db).status, 'done');
  assert.deepEqual(userStatus(db, userId), { s: 'synced', e: null });
});

test('tuần tự theo đối tượng: việc đầu lỗi thì việc sau chờ; đối tượng khác vẫn chạy', async () => {
  const { db, deps, userId, now } = setup();
  const other = seedUser(db, { code: 'NV02' });
  const ran: string[] = [];
  const handlers: SyncHandlers = {
    'user.info': async (_d, j) => {
      ran.push(`${j.entityId}:info`);
      if (j.entityId === userId) throw new HanetApiError(-503, 'Hanet lỗi');
    },
    'user.alias': async (_d, j) => void ran.push(`${j.entityId}:alias`),
  };
  enqueue(db, 'user', userId, 'user.info', {}, now());
  enqueue(db, 'user', userId, 'user.alias', {}, now());
  enqueue(db, 'user', other, 'user.info', {}, now());
  await runDueJobs(deps, handlers);
  assert.deepEqual(ran, [`${userId}:info`, `${other}:info`]);
});

test('lỗi tạm: chờ 1, 2, 5, 15 phút rồi 60 phút; quá 20 lần thì "error"', async () => {
  const { db, deps, userId, now, advance } = setup();
  const handlers: SyncHandlers = { 'user.info': async () => { throw new HanetApiError(-503, 'Hệ thống Hanet đang lỗi (mã -503)'); } };
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(retryDelayMs), [60_000, 120_000, 300_000, 900_000, 3_600_000, 3_600_000]);
  enqueue(db, 'user', userId, 'user.info', {}, now());
  await runDueJobs(deps, handlers);
  assert.equal(job(db).attempts, 1);
  assert.equal(job(db).next_run_at, now() + 60_000);
  assert.deepEqual(await runDueJobs(deps, handlers), { done: 0, failed: 0, deferred: 0 }, 'chưa đến hạn thì không chạy');
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    advance(retryDelayMs(i));
    await runDueJobs(deps, handlers);
  }
  assert.equal(job(db).attempts, MAX_ATTEMPTS);
  assert.equal(job(db).status, 'error');
  assert.deepEqual(userStatus(db, userId), { s: 'error', e: 'Hệ thống Hanet đang lỗi (mã -503)' });
});

test('lỗi vĩnh viễn → "error" ngay; thiếu handler → "error"', async () => {
  const { db, deps, userId, now } = setup();
  enqueue(db, 'user', userId, 'user.info', {}, now());
  await runDueJobs(deps, { 'user.info': async () => { throw new HanetApiError(-2035, 'Không có quyền (mã -2035)'); } });
  assert.equal(job(db).status, 'error');
  assert.equal(job(db).attempts, 1);
  enqueue(db, 'department', 'dep-x', 'dept.update', {}, now());
  await runDueJobs(deps, {});
  assert.equal(job(db, 2).status, 'error');
  assert.equal(job(db, 2).last_error, 'Chưa hỗ trợ thao tác dept.update');
});

test('SyncDeferred: không tính lần thử, hẹn 5 phút, giữ "pending"', async () => {
  const { db, deps, userId, now } = setup();
  enqueue(db, 'user', userId, 'user.department', {}, now());
  const r = await runDueJobs(deps, { 'user.department': async () => { throw new SyncDeferred('Chờ đăng ký FaceID'); } });
  assert.deepEqual(r, { done: 0, failed: 0, deferred: 1 });
  assert.equal(job(db).attempts, 0);
  assert.equal(job(db).status, 'pending');
  assert.equal(job(db).next_run_at, now() + DEFER_MS);
  assert.deepEqual(userStatus(db, userId), { s: 'pending', e: 'Chờ đăng ký FaceID' });
});

test('gộp: sửa nhiều lần trước khi chạy chỉ giữ một việc với dữ liệu mới nhất', () => {
  const { db, userId, now } = setup();
  enqueue(db, 'user', userId, 'user.info', { name: 'A' }, now());
  enqueue(db, 'user', userId, 'user.info', { name: 'B' }, now());
  const rows = db.prepare('SELECT payload FROM sync_jobs').all() as { payload: string }[];
  assert.deepEqual(rows.map((r) => JSON.parse(r.payload).name), ['B']);
});

test('xóa thắng: thêm việc xóa thì bỏ các việc đang chờ của đối tượng', () => {
  const { db, userId, now } = setup();
  enqueue(db, 'user', userId, 'user.info', {}, now());
  enqueue(db, 'user', userId, 'user.department', {}, now());
  enqueue(db, 'user', userId, 'user.remove', { code: 'NV01' }, now());
  assert.deepEqual((db.prepare('SELECT op FROM sync_jobs').all() as { op: string }[]).map((r) => r.op), ['user.remove']);
});

test('chưa cấu hình Hanet: giữ "pending", không tính lần thử', async () => {
  const { db, deps, userId, now } = setup();
  deleteSetting(db, 'hanet.client_id');
  enqueue(db, 'user', userId, 'user.info', {}, now());
  let called = false;
  assert.deepEqual(await runDueJobs(deps, { 'user.info': async () => void (called = true) }), { done: 0, failed: 0, deferred: 0 });
  assert.equal(called, false);
  assert.equal(job(db).attempts, 0);
});

test('Review Focus #4: hai lượt chạy cùng lúc chỉ gọi handler một lần', async () => {
  const { db, deps, userId, now } = setup();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const handlers: SyncHandlers = { 'user.info': async () => { calls++; await gate; } };
  enqueue(db, 'user', userId, 'user.info', {}, now());
  const a = runDueJobs(deps, handlers);
  const b = runDueJobs(deps, handlers);
  release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(job(db).status, 'done');
});

test('thử lại việc lỗi, tổng quan đồng bộ, dọn việc "done" cũ', async () => {
  const { db, deps, userId, now, advance } = setup();
  enqueue(db, 'user', userId, 'user.info', {}, now());
  await runDueJobs(deps, { 'user.info': async () => { throw new HanetApiError(-2035, 'Không có quyền'); } });
  const s = syncSummary(db);
  assert.equal(s.error, 1);
  assert.equal(s.pending, 0);
  assert.deepEqual({ op: s.errors[0].op, label: s.errors[0].label, lastError: s.errors[0].lastError }, { op: 'user.info', label: 'Nguyễn An (NV01)', lastError: 'Không có quyền' });
  assert.equal(retryJobs(db, { entityType: 'user', entityId: userId }, now()), 1);
  assert.deepEqual({ status: job(db).status, attempts: job(db).attempts }, { status: 'pending', attempts: 0 });
  assert.deepEqual(userStatus(db, userId).s, 'pending');
  await runDueJobs(deps, { 'user.info': async () => {} });
  advance(DONE_TTL_MS + 1);
  assert.equal(purgeDoneJobs(db, now()), 1);
});

test('API tổng quan và thử lại: chỉ HR', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const nv = seedUser(app.db, { code: 'NV01' });
    enqueue(app.db, 'user', nv, 'user.info', {}, Date.now());
    app.db.prepare("UPDATE sync_jobs SET status = 'error', last_error = 'x'").run();
    const hr = await loginAs(app, 'HR01');
    assert.deepEqual((await hr.get('/api/hanet/sync')).body.error, 1);
    const r = await hr.post('/api/hanet/sync/retry', {});
    assert.equal(r.body.error, 0);
    assert.equal(r.body.pending, 1);
    assert.equal((await (await loginAs(app, 'NV01')).get('/api/hanet/sync')).status, 403);
  } finally {
    await app.close();
  }
});
```

Trong `tests/permissions.test.ts`, thêm vào `CASES`:

```ts
  { method: 'GET', path: () => '/api/hanet/sync', allowed: HR },
  { method: 'POST', path: () => '/api/hanet/sync/retry', body: {}, allowed: HR },
```

- [ ] **Step 4: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/hanet-sync.test.ts`
Expected: FAIL — không tìm thấy module `../server/hanet-sync`.

- [ ] **Step 5: Tạo `server/hanet-sync.ts`**

```ts
import type { Db } from './db';
import { tx } from './db';
import type { AppContext } from './context';
import { HanetApiError, isTransientError, type HanetDeps } from './hanet-api';
import { reconcileEnabled } from './hanet';
import type { SyncEntity, SyncJobView, SyncOp, SyncSummary } from '../shared/types';

/** Handler ném khi phụ thuộc chưa sẵn sàng (chưa có FaceID, phòng ban chưa lên Hanet...). Không tính lần thử. */
export class SyncDeferred extends Error {}

export interface SyncJob {
  id: number;
  entityType: SyncEntity;
  entityId: string;
  op: SyncOp;
  payload: Record<string, any>;
  attempts: number;
}
export type SyncHandler = (deps: HanetDeps, job: SyncJob) => Promise<void>;
export type SyncHandlers = Partial<Record<SyncOp, SyncHandler>>;

export const RETRY_DELAYS_MIN = [1, 2, 5, 15];
export const RETRY_LATER_MIN = 60;
export const MAX_ATTEMPTS = 20;
export const DEFER_MS = 5 * 60_000;
export const DONE_TTL_MS = 7 * 24 * 60 * 60_000;
const RUN_LIMIT = 50;

/** Gộp: sửa nhiều lần trước khi chạy chỉ giữ dữ liệu mới nhất. */
const COALESCE = new Set<SyncOp>(['user.info', 'dept.update', 'camera.rename']);
/** Xóa thắng: thêm việc xóa thì bỏ các việc đang chờ của đối tượng. */
const REMOVE = new Set<SyncOp>(['user.remove', 'dept.remove']);
const STATUS_TABLE: Partial<Record<SyncEntity, string>> = { user: 'users', department: 'departments' };

export function retryDelayMs(attempts: number): number {
  return (RETRY_DELAYS_MIN[attempts - 1] ?? RETRY_LATER_MIN) * 60_000;
}

/** Việc đang chạy (theo DB) để job mỗi phút và lần thử ngay không chạy trùng một việc. */
const claimed = new WeakMap<Db, Set<number>>();
function claimSet(db: Db): Set<number> {
  let s = claimed.get(db);
  if (!s) {
    s = new Set();
    claimed.set(db, s);
  }
  return s;
}

export function refreshEntityStatus(db: Db, entityType: SyncEntity, entityId: string): void {
  const table = STATUS_TABLE[entityType];
  if (!table) return;
  const c = db
    .prepare(
      `SELECT SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS e, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS p
       FROM sync_jobs WHERE entity_type = ? AND entity_id = ?`,
    )
    .get(entityType, entityId) as { e: number | null; p: number | null };
  const status = Number(c.e ?? 0) > 0 ? 'error' : Number(c.p ?? 0) > 0 ? 'pending' : 'synced';
  const last = db
    .prepare(
      `SELECT last_error FROM sync_jobs WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'error') AND last_error IS NOT NULL
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
    )
    .get(entityType, entityId) as { last_error: string } | undefined;
  db.prepare(`UPDATE ${table} SET hanet_sync_status = ?, hanet_sync_error = ? WHERE id = ?`).run(
    status,
    status === 'synced' ? null : (last?.last_error ?? null),
    entityId,
  );
}

export function enqueue(db: Db, entityType: SyncEntity, entityId: string, op: SyncOp, payload: Record<string, unknown>, now: number): void {
  tx(db, () => {
    if (REMOVE.has(op)) dropEntityJobs(db, entityType, entityId);
    if (COALESCE.has(op)) {
      const busy = [...claimSet(db)];
      const notBusy = busy.length ? ` AND id NOT IN (${busy.map(() => '?').join(', ')})` : '';
      const r = db
        .prepare(
          `UPDATE sync_jobs SET payload = ?, updated_at = ?
           WHERE entity_type = ? AND entity_id = ? AND op = ? AND status = 'pending' AND attempts = 0${notBusy}`,
        )
        .run(JSON.stringify(payload), now, entityType, entityId, op, ...busy);
      if (Number(r.changes) > 0) {
        refreshEntityStatus(db, entityType, entityId);
        return;
      }
    }
    db.prepare(
      `INSERT INTO sync_jobs(entity_type, entity_id, op, payload, status, attempts, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    ).run(entityType, entityId, op, JSON.stringify(payload), now, now, now);
    refreshEntityStatus(db, entityType, entityId);
  });
}

/** Bỏ mọi việc chưa xong của đối tượng (dùng khi xóa đối tượng chưa từng lên Hanet). */
export function dropEntityJobs(db: Db, entityType: SyncEntity, entityId: string): void {
  db.prepare("DELETE FROM sync_jobs WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'error')").run(entityType, entityId);
}

export function wakeEntity(db: Db, entityType: SyncEntity, entityId: string, now: number): void {
  db.prepare("UPDATE sync_jobs SET next_run_at = ? WHERE entity_type = ? AND entity_id = ? AND status = 'pending'").run(now, entityType, entityId);
}

export function wakeOp(db: Db, op: SyncOp, now: number): void {
  db.prepare("UPDATE sync_jobs SET next_run_at = ? WHERE op = ? AND status = 'pending'").run(now, op);
}

function toJob(r: Record<string, any>): SyncJob {
  return { id: r.id, entityType: r.entity_type, entityId: r.entity_id, op: r.op, payload: JSON.parse(r.payload), attempts: r.attempts };
}

/** Việc đứng đầu hàng của mỗi đối tượng (id nhỏ nhất còn pending/error), đã đến hạn. */
const HEAD_SQL = `SELECT j.* FROM sync_jobs j
  WHERE j.status = 'pending' AND j.next_run_at <= ?
    AND j.id = (SELECT MIN(k.id) FROM sync_jobs k WHERE k.entity_type = j.entity_type AND k.entity_id = j.entity_id AND k.status IN ('pending', 'error'))`;

type RunResult = 'done' | 'failed' | 'deferred';

async function runJob(deps: HanetDeps, handlers: SyncHandlers, job: SyncJob): Promise<RunResult> {
  const { db } = deps;
  let result: RunResult;
  try {
    const handler = handlers[job.op];
    if (!handler) throw Object.assign(new Error(`Chưa hỗ trợ thao tác ${job.op}`), { permanent: true });
    await handler(deps, job);
    db.prepare("UPDATE sync_jobs SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ?").run(deps.now(), job.id);
    result = 'done';
  } catch (err) {
    const now = deps.now();
    const message = (err as Error).message;
    if (err instanceof SyncDeferred) {
      db.prepare('UPDATE sync_jobs SET next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?').run(now + DEFER_MS, message, now, job.id);
      result = 'deferred';
    } else {
      const attempts = job.attempts + 1;
      const permanent = Boolean((err as { permanent?: boolean }).permanent) || !isTransientError(err);
      if (permanent || attempts >= MAX_ATTEMPTS) {
        db.prepare("UPDATE sync_jobs SET status = 'error', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?").run(attempts, message, now, job.id);
      } else {
        db.prepare('UPDATE sync_jobs SET attempts = ?, next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?').run(
          attempts,
          now + retryDelayMs(attempts),
          message,
          now,
          job.id,
        );
      }
      const code = err instanceof HanetApiError ? err.returnCode : 'network';
      console.warn(`[SYNC] op=${job.op} entity=${job.entityType}:${job.entityId} code=${code}`);
      result = 'failed';
    }
  }
  refreshEntityStatus(db, job.entityType, job.entityId);
  return result;
}

async function runClaimed(deps: HanetDeps, handlers: SyncHandlers, row: Record<string, any>): Promise<RunResult | null> {
  const claims = claimSet(deps.db);
  if (claims.has(row.id)) return null;
  claims.add(row.id);
  try {
    return await runJob(deps, handlers, toJob(row));
  } finally {
    claims.delete(row.id);
  }
}

export async function runDueJobs(deps: HanetDeps, handlers: SyncHandlers, limit = RUN_LIMIT): Promise<{ done: number; failed: number; deferred: number }> {
  const out = { done: 0, failed: 0, deferred: 0 };
  if (!reconcileEnabled(deps.db)) return out;
  const rows = deps.db.prepare(`${HEAD_SQL} ORDER BY j.id LIMIT ?`).all(deps.now(), limit) as Record<string, any>[];
  for (const row of rows) {
    const r = await runClaimed(deps, handlers, row);
    if (r) out[r]++;
  }
  return out;
}

/** Chạy liên tiếp các việc đến hạn của một đối tượng (thử ngay sau khi HR lưu). */
export async function runEntityJobs(deps: HanetDeps, handlers: SyncHandlers, entityType: SyncEntity, entityId: string): Promise<void> {
  if (!reconcileEnabled(deps.db)) return;
  for (let i = 0; i < 10; i++) {
    const row = deps.db
      .prepare(`${HEAD_SQL} AND j.entity_type = ? AND j.entity_id = ? LIMIT 1`)
      .get(deps.now(), entityType, entityId) as Record<string, any> | undefined;
    if (!row || (await runClaimed(deps, handlers, row)) !== 'done') return;
  }
}

function depsOf(ctx: AppContext): HanetDeps {
  return { db: ctx.db, fetch: ctx.fetch, now: ctx.now };
}

/** Thử đồng bộ ngay một đối tượng, không chờ (production). */
export function kickEntity(ctx: AppContext, entityType: SyncEntity, entityId: string): void {
  if (!ctx.config.kickSync) return;
  // import động để tránh vòng phụ thuộc hanet-sync ↔ sync-handlers
  void import('./sync-handlers')
    .then(({ SYNC_HANDLERS }) => runEntityJobs(depsOf(ctx), SYNC_HANDLERS, entityType, entityId))
    .catch((err) => console.error('[SYNC] lỗi chạy ngay:', (err as Error).message));
}

export function kickAll(ctx: AppContext): void {
  if (!ctx.config.kickSync) return;
  void import('./sync-handlers')
    .then(({ SYNC_HANDLERS }) => runDueJobs(depsOf(ctx), SYNC_HANDLERS))
    .catch((err) => console.error('[SYNC] lỗi chạy hàng đợi:', (err as Error).message));
}

export function retryJobs(db: Db, filter: { jobId?: number; entityType?: SyncEntity; entityId?: string }, now: number): number {
  const where: string[] = ["status = 'error'"];
  const params: (string | number)[] = [];
  if (filter.jobId !== undefined) {
    where.push('id = ?');
    params.push(filter.jobId);
  }
  if (filter.entityType && filter.entityId) {
    where.push('entity_type = ? AND entity_id = ?');
    params.push(filter.entityType, filter.entityId);
  }
  const affected = db.prepare(`SELECT DISTINCT entity_type, entity_id FROM sync_jobs WHERE ${where.join(' AND ')}`).all(...params) as {
    entity_type: SyncEntity;
    entity_id: string;
  }[];
  const r = db
    .prepare(`UPDATE sync_jobs SET status = 'pending', attempts = 0, next_run_at = ?, updated_at = ? WHERE ${where.join(' AND ')}`)
    .run(now, now, ...params);
  for (const a of affected) refreshEntityStatus(db, a.entity_type, a.entity_id);
  return Number(r.changes);
}

function labelOf(db: Db, type: SyncEntity, id: string, payload: Record<string, any>): string {
  if (type === 'user') {
    const u = db.prepare('SELECT name, code FROM users WHERE id = ?').get(id) as { name: string; code: string } | undefined;
    if (u) return `${u.name} (${u.code})`;
  } else {
    const row = db.prepare(`SELECT name FROM ${type === 'department' ? 'departments' : 'cameras'} WHERE id = ?`).get(id) as
      | { name: string }
      | undefined;
    if (row) return row.name;
  }
  return String(payload.name ?? payload.code ?? id);
}

export function syncSummary(db: Db): SyncSummary {
  const c = db
    .prepare(
      `SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS p, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS e FROM sync_jobs`,
    )
    .get() as { p: number | null; e: number | null };
  const rows = db.prepare("SELECT * FROM sync_jobs WHERE status = 'error' ORDER BY updated_at DESC, id DESC LIMIT 50").all() as Record<string, any>[];
  const errors: SyncJobView[] = rows.map((r) => {
    const payload = JSON.parse(r.payload);
    return {
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      op: r.op,
      label: labelOf(db, r.entity_type, r.entity_id, payload),
      attempts: r.attempts,
      lastError: r.last_error ?? null,
      updatedAt: r.updated_at,
    };
  });
  return { pending: Number(c.p ?? 0), error: Number(c.e ?? 0), errors };
}

export function purgeDoneJobs(db: Db, now: number): number {
  return Number(db.prepare("DELETE FROM sync_jobs WHERE status = 'done' AND updated_at < ?").run(now - DONE_TTL_MS).changes);
}
```

- [ ] **Step 6: Tạo `server/sync-handlers.ts`**

```ts
import type { SyncHandlers } from './hanet-sync';

/** Xử lý từng thao tác đồng bộ sang Hanet. Task sau thêm handler vào object này. */
export const SYNC_HANDLERS: SyncHandlers = {};
```

- [ ] **Step 7: Route và job**

`server/routes/hanet.ts`: thêm import

```ts
import { kickAll, retryJobs, syncSummary } from '../hanet-sync';
import type { SyncEntity } from '../../shared/types';
```

(gộp `SyncEntity` vào dòng `import type` sẵn có). Trong route `PUT /hanet/config`, thêm `kickAll(ctx);` ngay trước `res.json(...)`. Thêm sau route `GET /hanet/sightings`:

```ts
  r.get('/hanet/sync', hr, (_req, res) => {
    res.json(syncSummary(db));
  });

  r.post('/hanet/sync/retry', hr, (req, res) => {
    const b = req.body ?? {};
    const filter: { jobId?: number; entityType?: SyncEntity; entityId?: string } = {};
    if (b.jobId !== undefined) {
      if (!Number.isInteger(Number(b.jobId))) throw new HttpError(400, 'Mã việc không hợp lệ');
      filter.jobId = Number(b.jobId);
    }
    if (b.entityType !== undefined || b.entityId !== undefined) {
      if (!['user', 'department', 'camera'].includes(b.entityType) || typeof b.entityId !== 'string') throw new HttpError(400, 'Đối tượng không hợp lệ');
      filter.entityType = b.entityType;
      filter.entityId = b.entityId;
    }
    retryJobs(db, filter, ctx.now());
    kickAll(ctx);
    res.json(syncSummary(db));
  });
```

`server/jobs.ts`: thêm import

```ts
import { purgeDoneJobs, runDueJobs } from './hanet-sync';
import { SYNC_HANDLERS } from './sync-handlers';
```

Trong `tick`, sau dòng `purge-sightings` thêm:

```ts
    if (due.purgeHourly) run('purge-sync-jobs', () => purgeDoneJobs(ctx.db, now));
    run('sync', () => runDueJobs(deps, SYNC_HANDLERS));
```

- [ ] **Step 8: Chạy test**

Run: `npx tsx --test tests/hanet-sync.test.ts tests/permissions.test.ts && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 9: Giao diện tổng quan đồng bộ**

`src/format.ts`, thêm cuối file (sửa dòng import kiểu đầu file thành `import type { DayStatus, SyncOp, SyncStatus, UserRole } from './types';`):

```ts
export const SYNC_OP_LABEL: Record<SyncOp, string> = {
  'user.info': 'Cập nhật thông tin nhân sự',
  'user.department': 'Đổi phòng ban của nhân sự',
  'user.alias': 'Gán mã nhân viên trên Hanet',
  'user.remove': 'Xóa khuôn mặt trên Hanet',
  'dept.create': 'Tạo phòng ban',
  'dept.update': 'Sửa phòng ban',
  'dept.remove': 'Xóa phòng ban',
  'camera.rename': 'Đổi tên camera',
};

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  synced: 'Đã đồng bộ',
  pending: 'Đang chờ đồng bộ',
  error: 'Lỗi đồng bộ',
};
```

Tạo `src/components/config/SyncStatusCard.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { SyncSummary } from '../../types';
import { api, errorMessage } from '../../api';
import { SYNC_OP_LABEL, fmtDateTime } from '../../format';
import { secondaryBtn } from '../ui';

export const SyncStatusCard: React.FC = () => {
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<SyncSummary>('/api/hanet/sync')
      .then(setSummary)
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    void load();
  }, []);

  const retry = async (jobId?: number) => {
    setBusy(true);
    setError(null);
    try {
      setSummary(await api<SyncSummary>('/api/hanet/sync/retry', { method: 'POST', body: jobId === undefined ? {} : { jobId } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-900">Đồng bộ Hanet</h3>
        <button onClick={() => void load()} className="text-slate-500 hover:text-slate-900 cursor-pointer" aria-label="Làm mới">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      {summary && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">
              Đang chờ: <strong>{summary.pending}</strong> · Lỗi: <strong className={summary.error ? 'text-rose-600' : ''}>{summary.error}</strong>
            </span>
            <button onClick={() => void retry()} disabled={busy || summary.error === 0} className={`${secondaryBtn} py-1.5`}>
              Đồng bộ lại tất cả việc lỗi
            </button>
          </div>
          {summary.errors.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {summary.errors.map((j) => (
                <div key={j.id} className="p-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {j.label} · {SYNC_OP_LABEL[j.op]}
                    </div>
                    <div className="text-rose-600">{j.lastError}</div>
                    <div className="text-[10px] text-slate-400">
                      {j.attempts} lần thử · {fmtDateTime(j.updatedAt)}
                    </div>
                  </div>
                  <button onClick={() => void retry(j.id)} disabled={busy} className={`${secondaryBtn} py-1 px-2 shrink-0`}>
                    Thử lại
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
```

`src/components/HanetConfigTab.tsx`: thêm `import { SyncStatusCard } from './config/SyncStatusCard';` và đặt `<SyncStatusCard />` ngay sau `<HanetCredentialsCard ... />` trong lưới.

- [ ] **Step 10: Kiểm tra kiểu, build**

Run: `npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 11: Commit**

```bash
git add server/hanet-sync.ts server/sync-handlers.ts server/context.ts server/index.ts server/routes/hanet.ts server/jobs.ts shared/types.ts src/format.ts src/components/config/SyncStatusCard.tsx src/components/HanetConfigTab.tsx tests/helpers.ts tests/hanet-sync.test.ts tests/permissions.test.ts
git commit -m "feat(sync): Hanet sync queue with per-entity ordering, retries and status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Camera — nhập từ Hanet, online/offline, đổi tên

**Files:**
- Create: `server/cameras.ts`
- Modify: `server/routes/cameras.ts`
- Modify: `server/sync-handlers.ts` (handler `camera.rename`)
- Modify: `server/jobs.ts` (job `camera-status` mỗi 5 phút)
- Modify: `src/components/CamerasTab.tsx` (viết lại)
- Test: `tests/cameras-hanet.test.ts`, `tests/permissions.test.ts`, `tests/jobs.test.ts`

**Interfaces:**
- Consumes: `hanetApi.listDevices`, `hanetApi.connectionStatus`, `hanetApi.updateDevice` (Task 2); `enqueue`, `dropEntityJobs`, `kickEntity`, `runDueJobs` (Task 5); `SYNC_HANDLERS` (Task 5); `getPlaceIds`, `reconcileEnabled` (`server/hanet.ts`).
- Produces: `importCameras(deps): Promise<number>`; `refreshCameraStatus(deps): Promise<void>`; `POST /api/cameras/import` → `{added, cameras}`; `POST /api/cameras/refresh-status` → `{cameras}`; `PUT /api/cameras/:id {name?, location?, ipAddress?}` → `{camera}`; handler `SYNC_HANDLERS['camera.rename']`; `DueJobs.cameraStatus`.

- [ ] **Step 1: Viết test `tests/cameras-hanet.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs } from './helpers';
import { PLACE, configureHanet, fakeHanet, ok, type Reply } from './fake-hanet';
import { runDueJobs } from '../server/hanet-sync';
import { SYNC_HANDLERS } from '../server/sync-handlers';

async function setup(routes: Record<string, Reply>, configured = true) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  if (configured) configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  const deps = { db: app.db, fetch: fake.fetchImpl, now: () => Date.now() };
  return { app, fake, deps, hr: await loginAs(app, 'HR01') };
}

test('nhập camera từ Hanet: chỉ thêm camera chưa có, tên lấy từ Hanet', async () => {
  const { app, fake, hr } = await setup({
    '/device/getListDeviceByPlace': ok([
      { deviceID: 'C21272C952', deviceName: 'Cổng chính', placeID: PLACE, placeName: 'HRINTER', address: '' },
      { deviceID: 'C2', deviceName: 'C2', placeID: PLACE, placeName: 'HRINTER', address: '' },
    ]),
  });
  try {
    await hr.post('/api/cameras', { name: 'Cửa sau', deviceKey: 'C2' });
    const r = await hr.post('/api/cameras/import', {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.added, 1);
    const byKey = Object.fromEntries((r.body.cameras as any[]).map((c) => [c.deviceKey, c]));
    assert.deepEqual([byKey.C21272C952.name, byKey.C21272C952.placeId, byKey.C21272C952.placeName], ['Cổng chính', PLACE, 'HRINTER']);
    assert.equal(byKey.C2.name, 'Cửa sau', 'không ghi đè camera đã có');
    assert.equal(fake.last('/device/getListDeviceByPlace')!.params.get('placeID'), String(PLACE));
    assert.equal((await hr.post('/api/cameras/import', {})).body.added, 0);
  } finally {
    await app.close();
  }
});

test('online/offline: camera không có trong kết quả coi là offline', async () => {
  const { app, fake, hr } = await setup({ '/device/getConnectionStatus': ok({ C1: true }) });
  try {
    await hr.post('/api/cameras', { name: 'A', deviceKey: 'C1' });
    await hr.post('/api/cameras', { name: 'B', deviceKey: 'C2' });
    const before = (await hr.get('/api/cameras')).body.cameras;
    assert.deepEqual(before.map((c: any) => c.online), [null, null]);
    const r = await hr.post('/api/cameras/refresh-status', {});
    const byKey = Object.fromEntries((r.body.cameras as any[]).map((c) => [c.deviceKey, c]));
    assert.equal(byKey.C1.online, true);
    assert.equal(byKey.C2.online, false);
    assert.equal(typeof byKey.C1.statusCheckedAt, 'number');
    assert.equal(fake.last('/device/getConnectionStatus')!.params.get('deviceIDs'), 'C1,C2');
  } finally {
    await app.close();
  }
});

test('đổi tên camera tạo việc camera.rename; handler gọi updateDevice', async () => {
  const { app, fake, deps, hr } = await setup({ '/device/updateDevice': ok() });
  try {
    const cam = (await hr.post('/api/cameras', { name: 'A', deviceKey: 'C1' })).body.camera;
    const r = await hr.put(`/api/cameras/${cam.id}`, { name: 'Cửa A', location: 'Tầng 1' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.camera.name, r.body.camera.location], ['Cửa A', 'Tầng 1']);
    await hr.put(`/api/cameras/${cam.id}`, { location: 'Tầng 2' });
    const jobs = app.db.prepare('SELECT op, payload FROM sync_jobs').all() as { op: string; payload: string }[];
    assert.deepEqual(jobs.map((j) => [j.op, JSON.parse(j.payload)]), [['camera.rename', { deviceId: 'C1', name: 'Cửa A' }]]);
    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/device/updateDevice')!.params;
    assert.deepEqual([p.get('deviceID'), p.get('deviceName')], ['C1', 'Cửa A']);
    assert.equal((await hr.put(`/api/cameras/${cam.id}`, { name: '  ' })).status, 400);
    assert.equal((await hr.put('/api/cameras/cam-khong-co', { name: 'X' })).status, 404);
    await hr.del(`/api/cameras/${cam.id}`);
  } finally {
    await app.close();
  }
});

test('chưa cấu hình Hanet → nhập camera và làm mới trạng thái trả 400', async () => {
  const { app, hr, fake } = await setup({}, false);
  try {
    assert.equal((await hr.post('/api/cameras/import', {})).status, 400);
    assert.equal((await hr.post('/api/cameras/refresh-status', {})).status, 400);
    assert.equal(fake.calls.length, 0);
  } finally {
    await app.close();
  }
});
```

`tests/permissions.test.ts` — mở rộng kiểu `method` thành `'GET' | 'POST' | 'PUT' | 'DELETE'` nếu chưa có, và thêm vào `CASES`:

```ts
  { method: 'POST', path: () => '/api/cameras/import', body: {}, allowed: HR },
  { method: 'POST', path: () => '/api/cameras/refresh-status', body: {}, allowed: HR },
  { method: 'PUT', path: () => '/api/cameras/cam-khong-co', body: { name: 'X' }, allowed: HR },
```

`tests/jobs.test.ts` — thay hai dòng `assert.deepEqual(dueJobs(...` bằng:

```ts
  assert.deepEqual(dueJobs(at('02:00')), { backup: true, reconcileToday: true, reconcileYesterday: false, purgeSessions: true, purgeHourly: false, cameraStatus: true });
  assert.deepEqual(dueJobs(at('02:01')), { backup: false, reconcileToday: false, reconcileYesterday: false, purgeSessions: false, purgeHourly: false, cameraStatus: false });
  assert.equal(dueJobs(at('08:05')).cameraStatus, true);
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/cameras-hanet.test.ts tests/jobs.test.ts`
Expected: FAIL — `/api/cameras/import` trả 404; `cameraStatus` chưa có.

- [ ] **Step 3: Tạo `server/cameras.ts`**

```ts
import { newId } from './db';
import { hanetApi, type HanetDeps } from './hanet-api';
import { getPlaceIds } from './hanet';

/** Thêm các camera của địa điểm Hanet chưa có trong danh sách (không ghi đè camera đã có). Trả số camera đã thêm. */
export async function importCameras(deps: HanetDeps): Promise<number> {
  const { db } = deps;
  const placeId = getPlaceIds(db)[0];
  if (!placeId) return 0;
  const devices = await hanetApi.listDevices(deps, placeId);
  const exists = db.prepare('SELECT 1 FROM cameras WHERE device_key = ?');
  const insert = db.prepare(
    `INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, created_at) VALUES (?, ?, ?, ?, ?, '', '', ?)`,
  );
  let added = 0;
  for (const d of devices) {
    const key = String(d.deviceID ?? '').trim();
    if (!key || exists.get(key)) continue;
    insert.run(newId('cam'), String(d.deviceName || key), key, Number(d.placeID) || placeId, String(d.placeName ?? ''), new Date(deps.now()).toISOString());
    added++;
  }
  return added;
}

/** Cập nhật online/offline cho mọi camera; camera không có trong kết quả của Hanet coi là offline. */
export async function refreshCameraStatus(deps: HanetDeps): Promise<void> {
  const { db } = deps;
  const keys = (db.prepare('SELECT device_key FROM cameras ORDER BY device_key').all() as { device_key: string }[]).map((r) => r.device_key);
  if (keys.length === 0) return;
  const status = await hanetApi.connectionStatus(deps, keys);
  const now = deps.now();
  const update = db.prepare('UPDATE cameras SET online = ?, status_checked_at = ? WHERE device_key = ?');
  for (const k of keys) update.run(status[k] === true ? 1 : 0, now, k);
}
```

- [ ] **Step 4: Route — `server/routes/cameras.ts`**

Thêm import:

```ts
import { ah } from '../errors';
import { importCameras, refreshCameraStatus } from '../cameras';
import { reconcileEnabled } from '../hanet';
import { dropEntityJobs, enqueue, kickEntity } from '../hanet-sync';
```

(gộp `ah` vào dòng `import { HttpError } from '../errors';`). Trong `cameraRoutes`, ngay sau `const r = Router();` thêm:

```ts
  const deps = { db, fetch: ctx.fetch, now: ctx.now };
  const listCameras = () => (db.prepare('SELECT * FROM cameras ORDER BY name').all() as Row[]).map(mapCamera);
  const requireHanet = () => {
    if (!reconcileEnabled(db)) throw new HttpError(400, 'Chưa cấu hình kết nối Hanet (Client ID, Refresh Token, địa điểm)');
  };
```

Đổi thân route `GET /cameras` thành `res.json({ cameras: listCameras() });`. Thêm các route sau route `POST /cameras`:

```ts
  r.post(
    '/cameras/import',
    requireRole('hr'),
    ah(async (_req, res) => {
      requireHanet();
      let added: number;
      try {
        added = await importCameras(deps);
      } catch (err) {
        throw new HttpError(502, `Không lấy được danh sách camera từ Hanet: ${(err as Error).message}`);
      }
      res.json({ added, cameras: listCameras() });
    }),
  );

  r.post(
    '/cameras/refresh-status',
    requireRole('hr'),
    ah(async (_req, res) => {
      requireHanet();
      try {
        await refreshCameraStatus(deps);
      } catch (err) {
        throw new HttpError(502, `Không lấy được trạng thái camera từ Hanet: ${(err as Error).message}`);
      }
      res.json({ cameras: listCameras() });
    }),
  );

  r.put('/cameras/:id', requireRole('hr'), (req, res) => {
    const row = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id) as Row | undefined;
    if (!row) throw new HttpError(404, 'Không tìm thấy camera');
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = b.name === undefined ? row.name : text(b.name);
    if (!name) throw new HttpError(400, 'Tên camera là bắt buộc');
    db.prepare('UPDATE cameras SET name = ?, location = ?, ip_address = ? WHERE id = ?').run(
      name,
      b.location === undefined ? row.location : text(b.location),
      b.ipAddress === undefined ? row.ip_address : text(b.ipAddress),
      row.id,
    );
    if (name !== row.name) {
      enqueue(db, 'camera', row.id, 'camera.rename', { deviceId: row.device_key, name }, ctx.now());
      kickEntity(ctx, 'camera', row.id);
    }
    res.json({ camera: mapCamera(db.prepare('SELECT * FROM cameras WHERE id = ?').get(row.id) as Row) });
  });
```

Trong route `DELETE /cameras/:id` (đã có), thêm `dropEntityJobs(db, 'camera', req.params.id);` ngay sau dòng `DELETE FROM cameras`.

- [ ] **Step 5: Handler `camera.rename` — `server/sync-handlers.ts`**

```ts
import type { SyncHandlers } from './hanet-sync';
import { hanetApi } from './hanet-api';

/** Xử lý từng thao tác đồng bộ sang Hanet. Task sau thêm handler vào object này. */
export const SYNC_HANDLERS: SyncHandlers = {
  'camera.rename': async (deps, job) => {
    await hanetApi.updateDevice(deps, String(job.payload.deviceId), String(job.payload.name));
  },
};
```

- [ ] **Step 6: Job mỗi 5 phút — `server/jobs.ts`**

Thêm `cameraStatus: boolean;` vào `DueJobs`, `cameraStatus: m % 5 === 0,` vào `dueJobs`, import `import { refreshCameraStatus } from './cameras';`, và trong `tick` (trong khối `if (reconcileEnabled(ctx.db)) {`):

```ts
      if (due.cameraStatus) run('camera-status', () => refreshCameraStatus(deps));
```

- [ ] **Step 7: Chạy test**

Run: `npx tsx --test tests/cameras-hanet.test.ts tests/jobs.test.ts tests/permissions.test.ts && npm test`
Expected: PASS.

- [ ] **Step 8: Viết lại `src/components/CamerasTab.tsx`**

```tsx
import React, { useState } from 'react';
import { CloudDownload, MapPin, Pencil, Plus, RefreshCw, Trash2, Video } from 'lucide-react';
import type { Camera, User } from '../types';
import { api, errorMessage } from '../api';
import { fmtDateTime } from '../format';
import { Field, Modal, dangerBtn, inputCls, primaryBtn, secondaryBtn } from './ui';

interface CamerasTabProps {
  cameras: Camera[];
  currentUser: User;
  onRefresh: () => void;
}

const EMPTY = { name: '', deviceKey: '', placeId: '', placeName: '', location: '', ipAddress: '' };
type Form = typeof EMPTY & { id?: string };

const StatusDot: React.FC<{ camera: Camera }> = ({ camera }) => {
  const tone = camera.online === null ? 'bg-slate-300' : camera.online ? 'bg-emerald-500' : 'bg-rose-500';
  const label = camera.online === null ? 'Chưa kiểm tra' : camera.online ? 'Online' : 'Offline';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600" title={camera.statusCheckedAt ? `Kiểm tra lúc ${fmtDateTime(camera.statusCheckedAt)}` : undefined}>
      <span className={`w-2 h-2 rounded-full ${tone}`} /> {label}
    </span>
  );
};

export const CamerasTab: React.FC<CamerasTabProps> = ({ cameras, currentUser, onRefresh }) => {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Camera | null>(null);
  const [busy, setBusy] = useState(false);
  const isHr = currentUser.role === 'hr';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    try {
      if (form.id) {
        await api(`/api/cameras/${form.id}`, { method: 'PUT', body: { name: form.name, location: form.location, ipAddress: form.ipAddress } });
      } else {
        await api('/api/cameras', { method: 'POST', body: form });
      }
      setForm(null);
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const hanetAction = async (path: string, done: (body: { added?: number }) => string) => {
    setBusy(true);
    setNotice(null);
    try {
      const body = await api<{ added?: number }>(path, { method: 'POST', body: {} });
      setNotice(done(body));
      onRefresh();
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/cameras/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      onRefresh();
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => form && setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Camera Hanet</h2>
          <p className="text-xs text-slate-500 mt-0.5">Trạng thái online/offline tự cập nhật mỗi 5 phút. Đổi tên ở đây thì đổi luôn trên Hanet.</p>
        </div>
        {isHr && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => hanetAction('/api/cameras/refresh-status', () => 'Đã cập nhật trạng thái camera.')} disabled={busy} className={secondaryBtn}>
              <RefreshCw className="w-4 h-4" /> Làm mới trạng thái
            </button>
            <button onClick={() => hanetAction('/api/cameras/import', (b) => `Đã thêm ${b.added ?? 0} camera từ Hanet.`)} disabled={busy} className={secondaryBtn}>
              <CloudDownload className="w-4 h-4" /> Nhập camera từ Hanet
            </button>
            <button onClick={() => setForm({ ...EMPTY })} className={primaryBtn}>
              <Plus className="w-4 h-4" /> Thêm camera
            </button>
          </div>
        )}
      </div>
      {notice && <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2">{notice}</p>}

      {cameras.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-xs text-slate-500">
          <Video className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa có camera nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-slate-900 truncate">{c.name}</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono text-[10px] px-1.5 rounded bg-slate-100 text-slate-600">{c.deviceKey}</span>
                  {isHr && (
                    <>
                      <button
                        onClick={() =>
                          setForm({ id: c.id, name: c.name, deviceKey: c.deviceKey, placeId: c.placeId ? String(c.placeId) : '', placeName: c.placeName, location: c.location, ipAddress: c.ipAddress })
                        }
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                        title="Sửa camera"
                        aria-label={`Sửa camera ${c.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(c)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Xóa camera"
                        aria-label={`Xóa camera ${c.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <StatusDot camera={c} />
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

      {deleting && (
        <Modal title="Xóa camera" onClose={() => setDeleting(null)}>
          <div className="space-y-3.5">
            <p>
              Xóa camera <strong>{deleting.name}</strong> (<span className="font-mono">{deleting.deviceKey}</span>) khỏi danh sách?
            </p>
            <p className="text-slate-500">Lịch sử điểm danh không bị ảnh hưởng, và lượt nhận diện từ camera này vẫn tiếp tục được ghi nhận.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleting(null)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="button" onClick={confirmDelete} disabled={busy} className={`${dangerBtn} flex-1`}>
                Xóa camera
              </button>
            </div>
          </div>
        </Modal>
      )}

      {form && (
        <Modal title={form.id ? 'Sửa camera' : 'Thêm camera Hanet'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            <Field label="Tên camera" hint={form.id ? 'Đổi tên ở đây thì tên trên Hanet cũng đổi theo' : undefined}>
              <input className={inputCls} value={form.name} onChange={set('name')} required />
            </Field>
            <Field label="Mã thiết bị (deviceID trên Hanet)">
              <input className={`${inputCls} font-mono`} value={form.deviceKey} onChange={set('deviceKey')} required disabled={Boolean(form.id)} />
            </Field>
            {!form.id && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Place ID">
                  <input className={`${inputCls} font-mono`} inputMode="numeric" value={form.placeId} onChange={set('placeId')} />
                </Field>
                <Field label="Tên địa điểm">
                  <input className={inputCls} value={form.placeName} onChange={set('placeName')} />
                </Field>
              </div>
            )}
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

- [ ] **Step 9: Kiểm tra kiểu, build**

Run: `npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 10: Commit**

```bash
git add server/cameras.ts server/routes/cameras.ts server/sync-handlers.ts server/jobs.ts src/components/CamerasTab.tsx tests/cameras-hanet.test.ts tests/permissions.test.ts tests/jobs.test.ts
git commit -m "feat(cameras): import from Hanet, online status every 5 minutes, rename synced to Hanet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: FaceID từ ảnh camera

**Files:**
- Create: `server/hanet-face.ts`
- Modify: `server/routes/users.ts` (`POST /users` async + `sightingId`; `POST /users/:id/face`; `GET /users/:id/face-candidates`; `PUT` bỏ `faceRegistered`)
- Modify: `shared/types.ts` (`FaceResult`, `FaceCandidates`)
- Modify: `src/components/UserFormModal.tsx` (viết lại), `src/components/EmployeesTab.tsx`
- Test: `tests/face.test.ts`, `tests/users-routes.test.ts`, `tests/permissions.test.ts`

**Interfaces:**
- Consumes: `hanetApi.registerByUrl`, `hanetApi.personsByAlias`, `hanetApi.updateFaceByUrl`, `HanetApiError` (Task 2); `getSighting`, `deleteSighting`, `listSightings`, `recordSighting`, `SIGHTING_TTL_MS` (Task 4); `enqueue`, `wakeEntity`, `kickEntity` (Task 5).
- Produces:
  - `registerFace(deps, userId: string, imageUrl: string): Promise<FaceResult>`
  - `linkFace(db, userId: string, personId: string, departmentId: string | null, now: number): void` — lưu Person ID, `face_registered = 1`, xóa `face_error`, thêm việc `user.department` nếu có phòng ban.
  - `FaceResult { ok: boolean; message: string }`; `FaceCandidates { detections: {id: number; ts: number; imageUrl: string; deviceName: string}[]; strangers: FaceSighting[] }`
  - `POST /api/users` nhận `sightingId?`; trả `{user, tempPassword, face?}`.
  - `POST /api/users/:id/face {sightingId | detectionId}` → `{user, face}` (HR).
  - `GET /api/users/:id/face-candidates` → `FaceCandidates` (HR).
  - `UserSaved { user: User; tempPassword?: string; face?: FaceResult }` (export từ `UserFormModal.tsx`).

- [ ] **Step 1: Viết test `tests/face.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok, type Reply } from './fake-hanet';
import { recordSighting, SIGHTING_TTL_MS } from '../server/sightings';
import type { Db } from '../server/db';

const IMG = 'https://vcdn-z-image.hanet.ai/hanet-camera-image/face/upload/C21272C952/2026/10/13/stranger.jpg';

function addStranger(db: Db): number {
  const now = Date.now();
  recordSighting(db, { kind: 'stranger', personId: null, aliasId: null, personName: null, deviceId: 'C21272C952', deviceName: 'C21272C952', ts: now, imageUrl: IMG }, now);
  return (db.prepare('SELECT MAX(id) AS id FROM face_sightings').get() as { id: number }).id;
}
const sightingCount = (db: Db) => (db.prepare('SELECT COUNT(*) AS c FROM face_sightings').get() as { c: number }).c;

async function setup(routes: Record<string, Reply>, configured = true) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  if (configured) configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  return { app, fake, hr: await loginAs(app, 'HR01') };
}

test('tạo nhân sự từ ảnh người lạ → đăng ký FaceID, lưu Person ID, xóa lượt chụp (Review Focus #3: tên tiếng Việt nguyên vẹn)', async () => {
  const { app, fake, hr } = await setup({ '/person/registerByUrl': ok({ personID: '1889724440081326080', aliasID: 'NV09' }) });
  try {
    const sightingId = addStranger(app.db);
    const r = await hr.post('/api/users', { code: 'nv09', name: 'Cao Văn Hùng & Cộng sự', position: 'Kế toán viên', sightingId });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.face, { ok: true, message: 'Đã đăng ký FaceID trên Hanet' });
    assert.ok(r.body.tempPassword);
    assert.deepEqual([r.body.user.faceRegistered, r.body.user.hanetPersonId, r.body.user.faceError], [true, '1889724440081326080', null]);
    const p = fake.last('/person/registerByUrl')!.params;
    assert.deepEqual(
      [p.get('name'), p.get('aliasID'), p.get('placeID'), p.get('url'), p.get('title'), p.get('type')],
      ['Cao Văn Hùng & Cộng sự', 'NV09', String(PLACE), IMG, 'Kế toán viên', '0'],
    );
    assert.equal(sightingCount(app.db), 0);
  } finally {
    await app.close();
  }
});

test('-9006 ảnh không đạt: vẫn tạo nhân sự, ghi lý do, giữ lượt chụp', async () => {
  const { app, hr } = await setup({ '/person/registerByUrl': fail(-9006) });
  try {
    const r = await hr.post('/api/users', { code: 'NV10', name: 'Người Mới', sightingId: addStranger(app.db) });
    assert.equal(r.status, 200);
    assert.equal(r.body.face.ok, false);
    assert.match(r.body.face.message, /^Ảnh không đạt/);
    assert.equal(r.body.user.faceRegistered, false);
    assert.equal(r.body.user.faceError, r.body.face.message);
    assert.equal(sightingCount(app.db), 1);
  } finally {
    await app.close();
  }
});

test('-9005 đã có trên Hanet: tra theo mã rồi liên kết', async () => {
  const { app, hr } = await setup({
    '/person/registerByUrl': fail(-9005),
    '/person/getUserInfoByAliasID': ok([{ aliasID: 'NV11', name: 'X', personID: 'P-CU', avatar: '', title: '' }]),
  });
  try {
    const r = await hr.post('/api/users', { code: 'NV11', name: 'X', sightingId: addStranger(app.db) });
    assert.equal(r.body.face.ok, true);
    assert.equal(r.body.user.hanetPersonId, 'P-CU');
  } finally {
    await app.close();
  }
});

test('-9008 hết lượt FaceID miễn phí: báo rõ', async () => {
  const { app, hr } = await setup({ '/person/registerByUrl': fail(-9008) });
  try {
    const r = await hr.post('/api/users', { code: 'NV12', name: 'X', sightingId: addStranger(app.db) });
    assert.equal(r.body.face.message, 'Địa điểm đã hết số khuôn mặt miễn phí, cần mua gói cloud Hanet (mã -9008)');
  } finally {
    await app.close();
  }
});

test('đã có FaceID → đổi ảnh bằng updateByFaceUrlByAliasID, không đăng ký lại', async () => {
  const { app, fake, hr } = await setup({ '/person/updateByFaceUrlByAliasID': ok({ path: 'x' }) });
  try {
    const id = seedUser(app.db, { code: 'NV13', hanetPersonId: 'P13' });
    app.db.prepare('UPDATE users SET face_registered = 1 WHERE id = ?').run(id);
    const r = await hr.post(`/api/users/${id}/face`, { sightingId: addStranger(app.db) });
    assert.deepEqual(r.body.face, { ok: true, message: 'Đã cập nhật ảnh nhận diện trên Hanet' });
    const p = fake.last('/person/updateByFaceUrlByAliasID')!.params;
    assert.deepEqual([p.get('aliasID'), p.get('placeID'), p.get('url')], ['NV13', String(PLACE), IMG]);
    assert.equal(fake.last('/person/registerByUrl'), undefined);
  } finally {
    await app.close();
  }
});

test('chọn lượt quẹt của chính người đó trong 24 giờ; lượt cũ hơn → 404; không chọn gì → 400', async () => {
  const { app, hr } = await setup({ '/person/registerByUrl': ok({ personID: 'P14' }) });
  try {
    const id = seedUser(app.db, { code: 'NV14' });
    const insert = app.db.prepare(
      "INSERT INTO detections(user_id, device_id, ts, work_date, image_url, source) VALUES (?, 'C1', ?, '2026-10-13', ?, 'webhook')",
    );
    insert.run(id, Date.now() - SIGHTING_TTL_MS - 60_000, 'https://img/cu.jpg');
    insert.run(id, Date.now() - 60_000, 'https://img/moi.jpg');
    const [oldId, newId] = (app.db.prepare('SELECT id FROM detections ORDER BY ts').all() as { id: number }[]).map((r) => r.id);
    assert.equal((await hr.post(`/api/users/${id}/face`, { detectionId: oldId })).status, 404);
    assert.equal((await hr.post(`/api/users/${id}/face`, {})).status, 400);
    const r = await hr.post(`/api/users/${id}/face`, { detectionId: newId });
    assert.equal(r.body.face.ok, true);
    const c = (await hr.get(`/api/users/${id}/face-candidates`)).body;
    assert.deepEqual(c.detections.map((d: any) => d.imageUrl), ['https://img/moi.jpg']);
    assert.deepEqual(c.strangers, []);
  } finally {
    await app.close();
  }
});

test('có phòng ban → sau khi có FaceID thêm việc user.department', async () => {
  const { app, hr } = await setup({ '/person/registerByUrl': ok({ personID: 'P15' }) });
  try {
    const kt = seedDepartment(app.db, 'KT');
    const r = await hr.post('/api/users', { code: 'NV15', name: 'X', departmentId: kt, sightingId: addStranger(app.db) });
    const jobs = app.db.prepare('SELECT entity_id, op, payload FROM sync_jobs').all() as { entity_id: string; op: string; payload: string }[];
    assert.deepEqual(jobs.map((j) => [j.entity_id, j.op, JSON.parse(j.payload)]), [[r.body.user.id, 'user.department', { fromHanetDeptId: null, toDepartmentId: kt }]]);
  } finally {
    await app.close();
  }
});

test('chưa cấu hình Hanet: không gọi Hanet, báo lý do; lượt chụp không tồn tại → 404 và không tạo nhân sự', async () => {
  const { app, fake, hr } = await setup({}, false);
  try {
    const r = await hr.post('/api/users', { code: 'NV16', name: 'X', sightingId: addStranger(app.db) });
    assert.deepEqual(r.body.face, { ok: false, message: 'Chưa cấu hình kết nối Hanet (Client ID, Refresh Token, địa điểm)' });
    assert.equal(fake.calls.length, 0);
    assert.equal((await hr.post('/api/users', { code: 'NV17', name: 'X', sightingId: 999 })).status, 404);
    assert.equal(app.db.prepare("SELECT 1 FROM users WHERE code = 'NV17'").get(), undefined);
  } finally {
    await app.close();
  }
});

test('tạo nhân sự kèm Person ID (liên kết người đã có trên Hanet) → faceRegistered = true', async () => {
  const { app, hr } = await setup({});
  try {
    const r = await hr.post('/api/users', { code: '003', name: 'Dương Đức Văn', hanetPersonId: 'P3' });
    assert.equal(r.body.user.faceRegistered, true);
    assert.equal(r.body.face, undefined);
  } finally {
    await app.close();
  }
});
```

`tests/users-routes.test.ts`, test `'HR sửa thông tin; ...'`: đổi body PUT thành `{ name: 'Tên mới', departmentId: kd, hanetPersonId: '2134589559210508288' }` (bỏ `faceRegistered: true`); giữ nguyên `assert.equal(r.body.user.faceRegistered, true);`.

`tests/permissions.test.ts`, thêm vào `CASES`:

```ts
  { method: 'POST', path: (i) => `/api/users/${i.nv2}/face`, body: {}, allowed: HR },
  { method: 'GET', path: (i) => `/api/users/${i.nv2}/face-candidates`, allowed: HR },
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/face.test.ts`
Expected: FAIL — `face` là `undefined`.

- [ ] **Step 3: Kiểu trong `shared/types.ts`** (cuối file)

```ts
export interface FaceResult {
  ok: boolean;
  message: string;
}

export interface FaceCandidates {
  detections: { id: number; ts: number; imageUrl: string; deviceName: string }[];
  strangers: FaceSighting[];
}
```

- [ ] **Step 4: Tạo `server/hanet-face.ts`**

```ts
import type { Db } from './db';
import { HanetApiError, hanetApi, type HanetDeps } from './hanet-api';
import { getPlaceIds, reconcileEnabled } from './hanet';
import { enqueue, wakeEntity } from './hanet-sync';
import type { FaceResult } from '../shared/types';

/** Gắn người trên Hanet vào nhân sự; nếu có phòng ban thì xếp việc thêm vào phòng ban trên Hanet. */
export function linkFace(db: Db, userId: string, personId: string, departmentId: string | null, now: number): void {
  db.prepare('UPDATE users SET hanet_person_id = ?, face_registered = 1, face_error = NULL WHERE id = ?').run(personId, userId);
  if (departmentId) enqueue(db, 'user', userId, 'user.department', { fromHanetDeptId: null, toDepartmentId: departmentId }, now);
  wakeEntity(db, 'user', userId, now);
}

/**
 * Đăng ký (hoặc đổi ảnh) FaceID bằng ảnh camera. Chạy ngay để HR thấy kết quả.
 * Thất bại thì lưu lý do vào users.face_error; nhân sự vẫn giữ nguyên.
 */
export async function registerFace(deps: HanetDeps, userId: string, imageUrl: string): Promise<FaceResult> {
  const { db } = deps;
  const u = db.prepare('SELECT id, code, name, position, department_id, face_registered FROM users WHERE id = ?').get(userId) as
    | { id: string; code: string; name: string; position: string; department_id: string | null; face_registered: number }
    | undefined;
  if (!u) return { ok: false, message: 'Không tìm thấy nhân sự' };
  const fail = (message: string): FaceResult => {
    db.prepare('UPDATE users SET face_error = ? WHERE id = ?').run(message, userId);
    return { ok: false, message };
  };
  const placeId = getPlaceIds(db)[0];
  if (!reconcileEnabled(db) || !placeId) return fail('Chưa cấu hình kết nối Hanet (Client ID, Refresh Token, địa điểm)');
  try {
    if (u.face_registered === 1) {
      await hanetApi.updateFaceByUrl(deps, { aliasId: u.code, placeId, url: imageUrl });
      db.prepare('UPDATE users SET face_error = NULL WHERE id = ?').run(userId);
      return { ok: true, message: 'Đã cập nhật ảnh nhận diện trên Hanet' };
    }
    let personId: string | null = null;
    try {
      personId = await hanetApi.registerByUrl(deps, { name: u.name, aliasId: u.code, placeId, url: imageUrl, title: u.position ?? '' });
    } catch (err) {
      // -9005: người đã có trên Hanet với mã này → tra lại để liên kết
      if (!(err instanceof HanetApiError) || err.returnCode !== -9005) throw err;
    }
    if (!personId) personId = (await hanetApi.personsByAlias(deps, u.code))[0]?.personID ?? null;
    if (!personId) return fail('Hanet không trả Person ID sau khi đăng ký');
    linkFace(db, userId, String(personId), u.department_id, deps.now());
    return { ok: true, message: 'Đã đăng ký FaceID trên Hanet' };
  } catch (err) {
    return fail((err as Error).message);
  }
}
```

- [ ] **Step 5: Tách `CODE_RE` ra `server/validation.ts`** (Task 8 cũng dùng, tránh vòng import)

```ts
export const CODE_RE = /^[A-Z0-9._-]{1,32}$/;
export const CODE_ERROR = 'Mã chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới (tối đa 32 ký tự)';
```

Trong `server/routes/users.ts`, thay hai dòng khai báo `CODE_RE` và `CODE_ERROR` bằng:

```ts
import { CODE_ERROR, CODE_RE } from '../validation';
export { CODE_RE } from '../validation';
```

- [ ] **Step 6: Route — `server/routes/users.ts`**

Thêm import:

```ts
import { ah } from '../errors';
import { deleteSighting, getSighting, listSightings, SIGHTING_TTL_MS } from '../sightings';
import { registerFace } from '../hanet-face';
import { enqueue, kickEntity } from '../hanet-sync';
import type { FaceCandidates, FaceResult } from '../../shared/types';
```

(gộp `ah` vào dòng import `HttpError`; gộp kiểu vào dòng `import type { UserRole }`). Thêm hàm ngay trên `export function userRoutes`:

```ts
/** Ảnh để đăng ký FaceID: lượt chụp chưa khớp (sightingId) hoặc lượt quẹt của chính người đó trong 24 giờ (detectionId). */
function resolveFaceImage(db: Db, userId: string | null, b: Record<string, unknown>, now: number): { url: string; sightingId: number | null } | null {
  if (b.sightingId !== undefined && b.sightingId !== null && b.sightingId !== '') {
    const s = getSighting(db, Number(b.sightingId));
    if (!s) throw new HttpError(404, 'Không tìm thấy lượt chụp này, hãy chọn lượt mới hơn');
    return { url: s.imageUrl, sightingId: s.id };
  }
  if (b.detectionId !== undefined && b.detectionId !== null && userId) {
    const row = db
      .prepare("SELECT image_url FROM detections WHERE id = ? AND user_id = ? AND ts >= ? AND image_url IS NOT NULL AND image_url != ''")
      .get(Number(b.detectionId), userId, now - SIGHTING_TTL_MS) as { image_url: string } | undefined;
    if (!row) throw new HttpError(404, 'Không tìm thấy ảnh của lượt quẹt này (chỉ dùng được lượt trong 24 giờ)');
    return { url: row.image_url, sightingId: null };
  }
  return null;
}
```

Trong `userRoutes`, ngay sau `const r = Router();` thêm `const deps = { db, fetch: ctx.fetch, now: ctx.now };`.

Thay toàn bộ route `POST /users` bằng:

```ts
  r.post(
    '/users',
    requireRole('hr'),
    ah(async (req, res) => {
      const b = req.body ?? {};
      const code = (str(b.code) ?? '').toUpperCase();
      const name = str(b.name) ?? '';
      if (!CODE_RE.test(code)) throw new HttpError(400, CODE_ERROR);
      if (!name) throw new HttpError(400, 'Họ tên là bắt buộc');
      const role: UserRole = b.role === undefined ? 'employee' : b.role;
      if (!ROLES.includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');
      const departmentId = resolveDepartment(db, b.departmentId);
      if (db.prepare('SELECT 1 FROM users WHERE code = ?').get(code)) throw new HttpError(409, 'Mã nhân viên đã tồn tại');
      const image = resolveFaceImage(db, null, b, ctx.now());
      const hanetPersonId = str(b.hanetPersonId) || null;

      const id = newId('usr');
      const tempPassword = generateTempPassword();
      db.prepare(
        `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
           face_registered, status, password_hash, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, ?)`,
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
        hanetPersonId,
        hanetPersonId ? 1 : 0,
        hashPassword(tempPassword),
        toVnDate(ctx.now()),
      );
      if (hanetPersonId && departmentId) {
        enqueue(db, 'user', id, 'user.department', { fromHanetDeptId: null, toDepartmentId: departmentId }, ctx.now());
      }
      let face: FaceResult | undefined;
      if (image) {
        face = await registerFace(deps, id, image.url);
        if (face.ok && image.sightingId !== null) deleteSighting(db, image.sightingId);
      }
      kickEntity(ctx, 'user', id);
      res.json({ user: getUser(db, id), tempPassword, ...(face ? { face } : {}) });
    }),
  );
```

Trong route `PUT /users/:id`, thay hai dòng `hanetPersonId`/`faceRegistered` bằng:

```ts
    if (b.hanetPersonId !== undefined) {
      const pid = str(b.hanetPersonId) || null;
      set('hanet_person_id', pid);
      set('face_registered', pid ? 1 : 0);
    }
```

Thêm hai route sau `POST /users/:id/reset-password`:

```ts
  r.post(
    '/users/:id/face',
    requireRole('hr'),
    ah(async (req, res) => {
      const target = getUser(db, req.params.id);
      if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
      const image = resolveFaceImage(db, target.id, req.body ?? {}, ctx.now());
      if (!image) throw new HttpError(400, 'Hãy chọn một lượt camera chụp');
      const face = await registerFace(deps, target.id, image.url);
      if (face.ok && image.sightingId !== null) deleteSighting(db, image.sightingId);
      if (face.ok) kickEntity(ctx, 'user', target.id);
      res.json({ user: getUser(db, target.id), face });
    }),
  );

  r.get('/users/:id/face-candidates', requireRole('hr'), (req, res) => {
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    const now = ctx.now();
    const rows = db
      .prepare(
        `SELECT id, ts, image_url, device_id, device_name FROM detections
         WHERE user_id = ? AND ts >= ? AND image_url IS NOT NULL AND image_url != '' ORDER BY ts DESC LIMIT 30`,
      )
      .all(target.id, now - SIGHTING_TTL_MS) as Row[];
    const body: FaceCandidates = {
      detections: rows.map((d) => ({ id: d.id, ts: d.ts, imageUrl: d.image_url, deviceName: d.device_name ?? d.device_id })),
      strangers: listSightings(db, now, 'stranger'),
    };
    res.json(body);
  });
```

(nếu `Row` chưa được import trong file, thêm vào dòng `import { USER_SELECT, getUser, mapUser, type Row } from '../repo';` — đã có sẵn.)

- [ ] **Step 7: Chạy test**

Run: `npx tsx --test tests/face.test.ts tests/users-routes.test.ts tests/permissions.test.ts && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 8: Viết lại `src/components/UserFormModal.tsx`**

```tsx
import React, { useState } from 'react';
import { Camera, RefreshCw, ScanFace } from 'lucide-react';
import type { Department, FaceCandidates, FaceResult, FaceSighting, User, UserRole, UserStatus } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL, fmtTime } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

export interface UserSaved {
  user: User;
  tempPassword?: string;
  face?: FaceResult;
}

interface Props {
  user?: User; // không có = tạo mới
  departments: Department[];
  currentUserId: string;
  onClose: () => void;
  onSaved: (result: UserSaved) => void;
}

type Picked = { sightingId?: number; detectionId?: number; url: string };

const Thumb: React.FC<{ url: string; title: string; sub: string; selected: boolean; onClick: () => void }> = ({ url, title, sub, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-xl border overflow-hidden bg-white cursor-pointer ${selected ? 'border-orange-500 ring-2 ring-orange-300' : 'border-slate-200 hover:border-orange-400'}`}
  >
    <img src={url} alt="" className="w-full aspect-[3/4] object-cover bg-slate-100" />
    <div className="p-1.5">
      <div className="font-semibold text-[11px] truncate">{title}</div>
      <div className="text-[10px] text-slate-500 truncate">{sub}</div>
    </div>
  </button>
);

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
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sightings, setSightings] = useState<FaceSighting[] | null>(null);
  const [candidates, setCandidates] = useState<FaceCandidates | null>(null);
  const [loadingFaces, setLoadingFaces] = useState(false);
  const [facesError, setFacesError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [faceMsg, setFaceMsg] = useState<FaceResult | null>(null);

  const loadFaces = async () => {
    setLoadingFaces(true);
    setFacesError(null);
    try {
      if (user) setCandidates(await api<FaceCandidates>(`/api/users/${user.id}/face-candidates`));
      else setSightings((await api<{ sightings: FaceSighting[] }>('/api/hanet/sightings')).sightings);
    } catch (err) {
      setFacesError(errorMessage(err));
    } finally {
      setLoadingFaces(false);
    }
  };

  const pickSighting = (s: FaceSighting) => {
    if (s.kind === 'unlinked') {
      // Người đã có trên Hanet: liên kết theo Person ID, không đăng ký lại
      if (!isEdit) {
        setCode(s.aliasId ?? '');
        if (s.personName) setName(s.personName);
      }
      setHanetPersonId(s.personId ?? '');
      setPicked(null);
    } else {
      setPicked({ sightingId: s.id, url: s.imageUrl });
      if (!isEdit) setHanetPersonId('');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name, email, phone, position, role, departmentId: departmentId || null, hanetPersonId, status };
    try {
      if (user) {
        const r = await api<{ user: User }>(`/api/users/${user.id}`, { method: 'PUT', body });
        onSaved({ user: r.user });
      } else {
        const r = await api<UserSaved>('/api/users', {
          method: 'POST',
          body: { ...body, code, ...(picked?.sightingId ? { sightingId: picked.sightingId } : {}) },
        });
        onSaved(r);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const updateFace = async () => {
    if (!user || !picked) return;
    setBusy(true);
    setFaceMsg(null);
    try {
      const r = await api<{ user: User; face: FaceResult }>(`/api/users/${user.id}/face`, {
        method: 'POST',
        body: picked.sightingId ? { sightingId: picked.sightingId } : { detectionId: picked.detectionId },
      });
      if (r.face.ok) onSaved({ user: r.user, face: r.face });
      else setFaceMsg(r.face);
    } catch (err) {
      setFaceMsg({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const strangers = (isEdit ? candidates?.strangers : sightings?.filter((s) => s.kind === 'stranger')) ?? [];
  const unlinked = isEdit ? [] : (sightings?.filter((s) => s.kind === 'unlinked') ?? []);
  const loaded = isEdit ? candidates !== null : sightings !== null;
  const nothing = loaded && strangers.length === 0 && unlinked.length === 0 && (candidates?.detections.length ?? 0) === 0;

  return (
    <Modal title={isEdit ? `Sửa nhân sự ${user?.code}` : 'Thêm nhân sự'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3.5">
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600">
              {isEdit
                ? 'Đổi ảnh nhận diện: chọn một lượt camera chụp người này rồi bấm Cập nhật FaceID.'
                : 'Nhờ người này đứng trước camera Hanet, rồi bấm nút để chọn ảnh đăng ký FaceID (người lạ) hoặc liên kết người đã có trên Hanet.'}
            </p>
            <button type="button" onClick={loadFaces} disabled={loadingFaces} className={`${secondaryBtn} py-1.5 shrink-0`}>
              {loadingFaces ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} Lấy từ camera
            </button>
          </div>
          {facesError && <p className="text-rose-600">{facesError}</p>}
          {nothing && <p className="text-[11px] text-slate-500">Không có lượt chụp nào trong 30 phút gần đây. Hãy đứng trước camera rồi bấm lại.</p>}

          {isEdit && candidates && candidates.detections.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-700 mb-1">Lượt quẹt của người này (24 giờ)</div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {candidates.detections.map((d) => (
                  <Thumb
                    key={d.id}
                    url={d.imageUrl}
                    title={fmtTime(d.ts)}
                    sub={d.deviceName}
                    selected={picked?.detectionId === d.id}
                    onClick={() => setPicked({ detectionId: d.id, url: d.imageUrl })}
                  />
                ))}
              </div>
            </div>
          )}

          {strangers.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-700 mb-1">Người lạ — chọn ảnh để đăng ký FaceID</div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {strangers.map((s) => (
                  <Thumb
                    key={s.id}
                    url={s.imageUrl}
                    title={fmtTime(s.ts)}
                    sub={s.deviceName ?? s.deviceId}
                    selected={picked?.sightingId === s.id}
                    onClick={() => pickSighting(s)}
                  />
                ))}
              </div>
            </div>
          )}

          {unlinked.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-700">Đã có trên Hanet — chọn để liên kết</div>
              {unlinked.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSighting(s)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl bg-white border border-slate-200 hover:border-orange-400 text-left cursor-pointer"
                >
                  <img src={s.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 truncate">{s.personName ?? 'Không rõ tên'}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      Mã: <span className="font-mono">{s.aliasId ?? '— (chưa có trên Hanet)'}</span> · {fmtTime(s.ts)}
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-orange-600 shrink-0">Chọn</span>
                </button>
              ))}
            </div>
          )}

          {!isEdit && picked && <p className="text-[11px] text-emerald-700">✓ Sẽ đăng ký FaceID bằng ảnh đã chọn khi bấm Tạo nhân sự.</p>}
          {!isEdit && hanetPersonId && (
            <p className="text-[11px] text-emerald-700">
              ✓ Đã liên kết với người trên Hanet (Person ID <span className="font-mono">{hanetPersonId}</span>)
            </p>
          )}
          {isEdit && (
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] ${user?.faceRegistered ? 'text-emerald-700' : 'text-amber-700'}`}>
                {user?.faceRegistered ? '✓ Đã có FaceID trên Hanet' : 'Chưa có FaceID'}
                {user?.faceError && <span className="text-rose-600"> · Lỗi gần nhất: {user.faceError}</span>}
              </span>
              <button type="button" onClick={updateFace} disabled={busy || !picked} className={`${primaryBtn} py-1.5 shrink-0`}>
                <ScanFace className="w-3.5 h-3.5" /> {user?.faceRegistered ? 'Cập nhật FaceID' : 'Đăng ký FaceID'}
              </button>
            </div>
          )}
          {faceMsg && <p className={faceMsg.ok ? 'text-emerald-700' : 'text-rose-600'}>{faceMsg.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã nhân viên" hint={isEdit ? undefined : 'Phải trùng aliasID trên Hanet nếu người này đã có trên Hanet'}>
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
          {isEdit && (
            <Field label="Trạng thái">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} disabled={isSelf}>
                <option value="active">Đang làm việc</option>
                <option value="inactive">Đã nghỉ (khóa đăng nhập, bỏ qua nhận diện)</option>
              </select>
            </Field>
          )}
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

- [ ] **Step 9: `src/components/EmployeesTab.tsx` — thông báo FaceID và nhãn FaceID**

Thêm `import type { FaceResult } from '../types';` (gộp vào dòng import kiểu sẵn có) và `const [faceNotice, setFaceNotice] = useState<FaceResult | null>(null);` cạnh các `useState` khác.

Thay đoạn mô tả đầu tab:

```tsx
            Mã nhân viên phải trùng <span className="font-mono">aliasID</span> trên Hanet để camera khớp đúng người. Đồng bộ khuôn mặt lên Hanet chưa được hỗ trợ; hãy đăng ký trên ứng dụng Hanet.
```

bằng:

```tsx
            Người mới: nhờ đứng trước camera Hanet, rồi bấm Thêm nhân sự → Lấy từ camera để đăng ký FaceID. Thay đổi trên web tự đồng bộ sang Hanet.
```

Ngay sau khối banner đầu tab (thẻ `div` chứa nút "Thêm nhân sự"), thêm:

```tsx
      {faceNotice && (
        <div className={`rounded-2xl p-3 text-xs flex items-center justify-between gap-2 ${faceNotice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
          <span>FaceID: {faceNotice.message}</span>
          <button onClick={() => setFaceNotice(null)} className="cursor-pointer" aria-label="Đóng">
            ✕
          </button>
        </div>
      )}
```

Thay dòng:

```tsx
              <div className="flex justify-between"><span className="text-slate-400">Khuôn mặt</span><span>{u.faceRegistered ? 'Đã đăng ký' : 'Chưa đăng ký'}</span></div>
```

bằng:

```tsx
              <div className="flex justify-between">
                <span className="text-slate-400">FaceID</span>
                <span className={u.faceRegistered ? 'text-emerald-700' : 'text-amber-700'}>{u.faceRegistered ? 'Đã có FaceID' : 'Chưa có FaceID'}</span>
              </div>
              {!u.faceRegistered && u.faceError && <p className="text-[10px] text-rose-600">{u.faceError}</p>}
```

Thay prop `onSaved` của `<UserFormModal>` bằng:

```tsx
          onSaved={({ user, tempPassword: pw, face }) => {
            setEditing(null);
            if (pw) setTempPassword({ label: `${user.name} (${user.code})`, password: pw });
            if (face) setFaceNotice(face);
            onRefresh();
          }}
```

- [ ] **Step 10: Kiểm tra kiểu, build**

Run: `npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 11: Commit**

```bash
git add server/hanet-face.ts server/validation.ts server/routes/users.ts shared/types.ts src/components/UserFormModal.tsx src/components/EmployeesTab.tsx tests/face.test.ts tests/users-routes.test.ts tests/permissions.test.ts
git commit -m "feat(faceid): register or update FaceID on Hanet from camera sightings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Nhập nhân sự từ Hanet

**Files:**
- Create: `server/hanet-import.ts`
- Modify: `server/routes/hanet.ts` (`GET /hanet/persons/unlinked`)
- Modify: `server/routes/users.ts` (`POST /users/import`)
- Modify: `server/sync-handlers.ts` (handler `user.alias`)
- Create: `src/components/ImportFromHanetModal.tsx`
- Modify: `src/components/EmployeesTab.tsx` (nút "Nhập từ Hanet")
- Test: `tests/import.test.ts`, `tests/permissions.test.ts`

**Interfaces:**
- Consumes: `hanetApi.listPersons`, `hanetApi.updateAliasId` (Task 2); `enqueue`, `kickEntity`, `runDueJobs` (Task 5); `SYNC_HANDLERS`; `CODE_RE` (`server/validation.ts`, Task 7); `generateTempPassword`, `hashPassword` (`server/auth.ts`).
- Produces:
  - `IMPORT_PAGE_SIZE = 100`
  - `fetchAllPersons(deps, placeId: number): Promise<HanetPerson[]>`
  - `unlinkedPersons(db, persons: HanetPerson[]): HanetPerson[]`
  - `nextEmployeeCode(db): string` — `NV0001`, `NV0002`...
  - `importPersons(db, persons: HanetPerson[], departmentId: string | null, now: number): ImportedUser[]`
  - `ImportedUser { id: string; code: string; name: string; tempPassword: string }` (shared)
  - `GET /api/hanet/persons/unlinked` → `{ persons: HanetPerson[] }` (HR)
  - `POST /api/users/import { persons: {personId: string}[]; departmentId?: string }` → `{ created: ImportedUser[] }` (HR)
  - handler `SYNC_HANDLERS['user.alias']`

- [ ] **Step 1: Viết test `tests/import.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client } from './helpers';
import { PLACE, configureHanet, fakeHanet, ok, type Reply } from './fake-hanet';
import { fetchAllPersons, IMPORT_PAGE_SIZE } from '../server/hanet-import';
import { runDueJobs } from '../server/hanet-sync';
import { SYNC_HANDLERS } from '../server/sync-handlers';
import type { HanetPerson } from '../shared/types';

const person = (aliasID: string, personID: string, name = `Người ${personID}`): HanetPerson => ({
  aliasID, personID, name, avatar: `https://static.hanet.ai/face/${personID}.jpg`, title: 'Nhân viên',
});
const pagesRoute = (pages: HanetPerson[][]): Reply => (p: URLSearchParams) => ok(pages[Number(p.get('page')) - 1] ?? []);

async function setup(routes: Record<string, Reply>, configured = true) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  if (configured) configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  const deps = { db: app.db, fetch: fake.fetchImpl, now: () => Date.now() };
  return { app, fake, deps, hr: await loginAs(app, 'HR01') };
}

test('danh sách chưa liên kết: bỏ người trùng mã hoặc trùng Person ID', async () => {
  const { app, fake, hr } = await setup({
    '/person/getListByPlace': pagesRoute([[person('DDV01', 'P1'), person('', 'P2'), person('nv05', 'P5'), person('', 'P6')]]),
  });
  try {
    seedUser(app.db, { code: 'DDV01' });
    seedUser(app.db, { code: 'NV-X', hanetPersonId: 'P2' });
    const r = await hr.get('/api/hanet/persons/unlinked');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.persons.map((p: HanetPerson) => p.personID), ['P5', 'P6']);
    const q = fake.last('/person/getListByPlace')!.params;
    assert.deepEqual([q.get('placeID'), q.get('type'), q.get('size')], [String(PLACE), '0', String(IMPORT_PAGE_SIZE)]);
  } finally {
    await app.close();
  }
});

test('Review Focus #2: trang đầy đủ rồi trang rỗng thì dừng; danh sách rỗng gọi một lần', async () => {
  const full = Array.from({ length: IMPORT_PAGE_SIZE }, (_, i) => person(`A${i}`, `P${i}`));
  const a = await setup({ '/person/getListByPlace': pagesRoute([full, []]) });
  try {
    assert.equal((await fetchAllPersons(a.deps, PLACE)).length, IMPORT_PAGE_SIZE);
    assert.equal(a.fake.paths().filter((p) => p === '/person/getListByPlace').length, 2);
  } finally {
    await a.app.close();
  }
  const b = await setup({ '/person/getListByPlace': pagesRoute([]) });
  try {
    assert.deepEqual(await fetchAllPersons(b.deps, PLACE), []);
    assert.equal(b.fake.calls.length, 1);
  } finally {
    await b.app.close();
  }
});

test('nhập: mã theo aliasID, tự sinh NV0001 khi thiếu/không hợp lệ, xếp việc gán alias và phòng ban', async () => {
  const { app, hr } = await setup({
    '/person/getListByPlace': pagesRoute([[person('nv05', 'P5', 'Dương Đức Văn'), person('', 'P6'), person('a b', 'P7'), person('XYZ9', 'P9')]]),
  });
  try {
    const kt = seedDepartment(app.db, 'KT');
    const r = await hr.post('/api/users/import', {
      persons: [{ personId: 'P5' }, { personId: 'P6' }, { personId: 'P7' }, { personId: 'P9' }, { personId: 'P-KHONG-CO' }],
      departmentId: kt,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.created.map((c: any) => [c.code, c.name]), [
      ['NV05', 'Dương Đức Văn'],
      ['NV0001', 'Người P6'],
      ['NV0002', 'Người P7'],
      ['XYZ9', 'Người P9'],
    ]);
    const u = app.db.prepare("SELECT hanet_person_id, face_registered, department_id, position, must_change_password FROM users WHERE code = 'NV05'").get() as Record<string, unknown>;
    assert.deepEqual({ ...u }, { hanet_person_id: 'P5', face_registered: 1, department_id: kt, position: 'Nhân viên', must_change_password: 1 });
    const jobs = app.db.prepare('SELECT u.code, j.op, j.payload FROM sync_jobs j JOIN users u ON u.id = j.entity_id ORDER BY j.id').all() as { code: string; op: string; payload: string }[];
    assert.deepEqual(
      jobs.filter((j) => j.op === 'user.alias').map((j) => [j.code, JSON.parse(j.payload)]),
      [['NV05', { personId: 'P5', code: 'NV05' }], ['NV0001', { personId: 'P6', code: 'NV0001' }], ['NV0002', { personId: 'P7', code: 'NV0002' }]],
    );
    assert.equal(jobs.filter((j) => j.op === 'user.department').length, 4);
    const c = new Client(app.baseUrl);
    assert.equal((await c.post('/api/auth/login', { code: 'NV05', password: r.body.created[0].tempPassword })).status, 200);
    assert.equal((await hr.post('/api/users/import', { persons: [{ personId: 'P5' }] })).status, 400, 'đã nhập rồi thì không còn ai hợp lệ');
  } finally {
    await app.close();
  }
});

test('handler user.alias gọi updateAliasID', async () => {
  const { app, fake, deps, hr } = await setup({ '/person/getListByPlace': pagesRoute([[person('', 'P6')]]), '/person/updateAliasID': ok() });
  try {
    await hr.post('/api/users/import', { persons: [{ personId: 'P6' }] });
    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/person/updateAliasID')!.params;
    assert.deepEqual([p.get('personID'), p.get('aliasID')], ['P6', 'NV0001']);
  } finally {
    await app.close();
  }
});

test('chưa cấu hình Hanet → 400; danh sách rỗng → 400', async () => {
  const { app, hr } = await setup({}, false);
  try {
    assert.equal((await hr.get('/api/hanet/persons/unlinked')).status, 400);
    assert.equal((await hr.post('/api/users/import', { persons: [{ personId: 'P1' }] })).status, 400);
    assert.equal((await hr.post('/api/users/import', { persons: [] })).status, 400);
  } finally {
    await app.close();
  }
});
```

`tests/permissions.test.ts`, thêm vào `CASES`:

```ts
  { method: 'GET', path: () => '/api/hanet/persons/unlinked', allowed: HR },
  { method: 'POST', path: () => '/api/users/import', body: { persons: [] }, allowed: HR },
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/import.test.ts`
Expected: FAIL — không tìm thấy module `../server/hanet-import`.

- [ ] **Step 3: Kiểu `ImportedUser` trong `shared/types.ts`** (cuối file)

```ts
export interface ImportedUser {
  id: string;
  code: string;
  name: string;
  tempPassword: string;
}
```

- [ ] **Step 4: Tạo `server/hanet-import.ts`**

```ts
import type { Db } from './db';
import { newId, tx } from './db';
import { hanetApi, type HanetDeps } from './hanet-api';
import { enqueue } from './hanet-sync';
import { generateTempPassword, hashPassword } from './auth';
import { CODE_RE } from './validation';
import { toVnDate } from './vntime';
import type { HanetPerson, ImportedUser } from '../shared/types';

export const IMPORT_PAGE_SIZE = 100;
const MAX_PAGES = 50;

/** Toàn bộ nhân viên (type 0) của địa điểm; dừng khi trang trả ít hơn kích thước trang. */
export async function fetchAllPersons(deps: HanetDeps, placeId: number): Promise<HanetPerson[]> {
  const all: HanetPerson[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const items = await hanetApi.listPersons(deps, placeId, page, IMPORT_PAGE_SIZE);
    all.push(...items);
    if (items.length < IMPORT_PAGE_SIZE) break;
  }
  return all;
}

/** Người trên Hanet chưa có nhân sự nào khớp mã (aliasID) hoặc Person ID. */
export function unlinkedPersons(db: Db, persons: HanetPerson[]): HanetPerson[] {
  const known = db.prepare('SELECT 1 FROM users WHERE code = ? OR (hanet_person_id IS NOT NULL AND hanet_person_id = ?)');
  return persons.filter((p) => p.personID && !known.get(String(p.aliasID ?? '').trim().toUpperCase(), String(p.personID)));
}

/** Mã tự sinh NV0001, NV0002... (tiếp sau số lớn nhất đang có). */
export function nextEmployeeCode(db: Db): string {
  const codes = db.prepare("SELECT code FROM users WHERE code GLOB 'NV[0-9][0-9][0-9][0-9]*'").all() as { code: string }[];
  const max = codes.reduce((m, { code }) => (/^NV\d{4,}$/.test(code) ? Math.max(m, Number(code.slice(2))) : m), 0);
  return `NV${String(max + 1).padStart(4, '0')}`;
}

/**
 * Tạo nhân sự từ người trên Hanet (đã có FaceID). Mã = aliasID nếu hợp lệ và chưa dùng; ngược lại tự sinh
 * và xếp việc ghi mã đó làm aliasID trên Hanet để webhook khớp được theo mã.
 */
export function importPersons(db: Db, persons: HanetPerson[], departmentId: string | null, now: number): ImportedUser[] {
  const exists = db.prepare('SELECT 1 FROM users WHERE code = ?');
  const insert = db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, '', '', 'employee', ?, ?, ?, ?, 1, 'active', ?, 1, ?)`,
  );
  return tx(db, () =>
    persons.map((p) => {
      const alias = String(p.aliasID ?? '').trim();
      const upper = alias.toUpperCase();
      const useAlias = alias !== '' && CODE_RE.test(upper) && !exists.get(upper);
      const code = useAlias ? upper : nextEmployeeCode(db);
      const id = newId('usr');
      const tempPassword = generateTempPassword();
      const name = String(p.name ?? '').trim() || code;
      insert.run(id, code, name, departmentId, String(p.title ?? '').trim(), String(p.avatar ?? ''), String(p.personID), hashPassword(tempPassword), toVnDate(now));
      if (code !== alias) enqueue(db, 'user', id, 'user.alias', { personId: String(p.personID), code }, now);
      if (departmentId) enqueue(db, 'user', id, 'user.department', { fromHanetDeptId: null, toDepartmentId: departmentId }, now);
      return { id, code, name, tempPassword };
    }),
  );
}
```

- [ ] **Step 5: Route — `server/routes/hanet.ts`**

Thêm import `import { fetchAllPersons, unlinkedPersons } from '../hanet-import';` và `getPlaceIds` vào dòng import từ `'../hanet'`. Thêm sau route `GET /hanet/sightings`:

```ts
  r.get(
    '/hanet/persons/unlinked',
    hr,
    ah(async (_req, res) => {
      const placeId = getPlaceIds(db)[0];
      if (!reconcileEnabled(db) || !placeId) throw new HttpError(400, 'Chưa cấu hình kết nối Hanet (Client ID, Refresh Token, địa điểm)');
      let persons;
      try {
        persons = await fetchAllPersons({ db, fetch: ctx.fetch, now: ctx.now }, placeId);
      } catch (err) {
        throw new HttpError(502, `Không lấy được danh sách người từ Hanet: ${(err as Error).message}`);
      }
      res.json({ persons: unlinkedPersons(db, persons) });
    }),
  );
```

- [ ] **Step 6: Route — `server/routes/users.ts`**

Thêm import:

```ts
import { fetchAllPersons, importPersons, unlinkedPersons } from '../hanet-import';
import { getPlaceIds, reconcileEnabled } from '../hanet';
```

Thêm sau route `POST /users` (đặt TRƯỚC `PUT /users/:id` để không bị `:id` bắt nhầm — `import` chỉ có ở `POST` nên không đụng):

```ts
  r.post(
    '/users/import',
    requireRole('hr'),
    ah(async (req, res) => {
      const b = req.body ?? {};
      const wanted = new Set(
        (Array.isArray(b.persons) ? b.persons : []).map((p: { personId?: unknown }) => String(p?.personId ?? '')).filter(Boolean),
      );
      if (wanted.size === 0) throw new HttpError(400, 'Chưa chọn người nào để nhập');
      if (wanted.size > 500) throw new HttpError(400, 'Mỗi lần nhập tối đa 500 người');
      const departmentId = resolveDepartment(db, b.departmentId);
      const placeId = getPlaceIds(db)[0];
      if (!reconcileEnabled(db) || !placeId) throw new HttpError(400, 'Chưa cấu hình kết nối Hanet (Client ID, Refresh Token, địa điểm)');
      let all;
      try {
        all = await fetchAllPersons(deps, placeId);
      } catch (err) {
        throw new HttpError(502, `Không lấy được danh sách người từ Hanet: ${(err as Error).message}`);
      }
      // Không tin dữ liệu client: chỉ nhập người thật sự có trên Hanet và chưa liên kết
      const chosen = unlinkedPersons(db, all).filter((p) => wanted.has(String(p.personID)));
      if (chosen.length === 0) throw new HttpError(400, 'Không có người hợp lệ để nhập (có thể đã được nhập trước đó)');
      const created = importPersons(db, chosen, departmentId, ctx.now());
      for (const c of created) kickEntity(ctx, 'user', c.id);
      res.json({ created });
    }),
  );
```

- [ ] **Step 7: Handler `user.alias` — `server/sync-handlers.ts`**

Thêm vào object `SYNC_HANDLERS`:

```ts
  'user.alias': async (deps, job) => {
    await hanetApi.updateAliasId(deps, String(job.payload.personId), String(job.payload.code));
  },
```

- [ ] **Step 8: Chạy test**

Run: `npx tsx --test tests/import.test.ts tests/permissions.test.ts && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 9: Tạo `src/components/ImportFromHanetModal.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { Department, HanetPerson, ImportedUser } from '../types';
import { api, errorMessage } from '../api';
import { Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface Props {
  departments: Department[];
  onClose: () => void;
  onImported: () => void;
}

function downloadCsv(rows: ImportedUser[]) {
  const csv = ['Mã nhân viên,Họ tên,Mật khẩu tạm', ...rows.map((r) => [r.code, r.name, r.tempPassword].map((v) => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mat-khau-tam.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export const ImportFromHanetModal: React.FC<Props> = ({ departments, onClose, onImported }) => {
  const [persons, setPersons] = useState<HanetPerson[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ImportedUser[] | null>(null);

  useEffect(() => {
    api<{ persons: HanetPerson[] }>('/api/hanet/persons/unlinked')
      .then((r) => setPersons(r.persons))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ created: ImportedUser[] }>('/api/users/import', {
        method: 'POST',
        body: { persons: [...selected].map((personId) => ({ personId })), departmentId: departmentId || null },
      });
      setCreated(r.created);
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Nhập nhân sự từ Hanet" onClose={onClose} wide>
      {created ? (
        <div className="space-y-3">
          <p className="text-emerald-700">Đã nhập {created.length} nhân sự. Mật khẩu tạm chỉ hiện một lần: tải về hoặc chép lại để phát cho từng người.</p>
          <table className="w-full text-left">
            <thead className="text-[11px] text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-1.5">Mã</th>
                <th className="py-1.5">Họ tên</th>
                <th className="py-1.5">Mật khẩu tạm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {created.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 font-mono">{c.code}</td>
                  <td className="py-1.5">{c.name}</td>
                  <td className="py-1.5 font-mono">{c.tempPassword}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button onClick={() => downloadCsv(created)} className={`${secondaryBtn} flex-1`}>
              <Download className="w-3.5 h-3.5" /> Tải CSV
            </button>
            <button onClick={onClose} className={`${primaryBtn} flex-1`}>
              Xong
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <p className="text-rose-600">{error}</p>}
          {persons === null && !error && <p className="text-slate-500">Đang tải danh sách từ Hanet...</p>}
          {persons && persons.length === 0 && <p className="text-slate-500">Mọi người trên Hanet đều đã có trong danh sách nhân sự.</p>}
          {persons && persons.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.size === persons.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(persons.map((p) => p.personID)) : new Set())}
                  />
                  <span>Chọn tất cả ({persons.length})</span>
                </label>
                <select className={`${inputCls} w-auto`} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">— Phòng ban cho nhóm đã chọn —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {persons.map((p) => (
                  <label key={p.personID} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={selected.has(p.personID)} onChange={() => toggle(p.personID)} />
                    {p.avatar ? <img src={p.avatar} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100" /> : <div className="w-9 h-9 rounded-lg bg-slate-100" />}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{p.name || '(không tên)'}</div>
                      <div className="text-[11px] text-slate-500">
                        aliasID: <span className="font-mono">{p.aliasID || '— (hệ thống sẽ tự sinh mã)'}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button onClick={submit} disabled={busy || selected.size === 0} className={`${primaryBtn} w-full`}>
                {busy ? 'Đang nhập...' : `Nhập ${selected.size} người`}
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
```

- [ ] **Step 10: Nút trong `src/components/EmployeesTab.tsx`**

Thêm `import { ImportFromHanetModal } from './ImportFromHanetModal';`, thêm `CloudDownload` vào import `lucide-react`, và `const [importing, setImporting] = useState(false);`. Thay nút:

```tsx
        <button onClick={() => setEditing('new')} className={primaryBtn}>
          <UserPlus className="w-4 h-4" /> Thêm nhân sự
        </button>
```

bằng:

```tsx
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setImporting(true)} className={secondaryBtn}>
            <CloudDownload className="w-4 h-4" /> Nhập từ Hanet
          </button>
          <button onClick={() => setEditing('new')} className={primaryBtn}>
            <UserPlus className="w-4 h-4" /> Thêm nhân sự
          </button>
        </div>
```

Thêm trước `{tempPassword && <TempPasswordDialog`:

```tsx
      {importing && <ImportFromHanetModal departments={departments} onClose={() => setImporting(false)} onImported={onRefresh} />}
```

- [ ] **Step 11: Kiểm tra kiểu, build**

Run: `npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 12: Commit**

```bash
git add server/hanet-import.ts server/routes/hanet.ts server/routes/users.ts server/sync-handlers.ts shared/types.ts src/components/ImportFromHanetModal.tsx src/components/EmployeesTab.tsx tests/import.test.ts tests/permissions.test.ts
git commit -m "feat(import): bulk import Hanet persons as employees with temp passwords

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Đồng bộ nhân sự và phòng ban sang Hanet

**Files:**
- Modify: `server/sync-handlers.ts` (`user.info`, `user.department`, `user.remove`, `dept.create`, `dept.update`, `dept.remove`)
- Modify: `server/routes/users.ts` (`PUT`, `DELETE` xếp việc)
- Modify: `server/routes/departments.ts` (`POST`, `PUT`, `DELETE` xếp việc)
- Create: `src/components/SyncBadge.tsx`
- Modify: `src/components/EmployeesTab.tsx`, `src/components/DepartmentsTab.tsx`
- Test: `tests/sync-staff.test.ts`

**Interfaces:**
- Consumes: `hanetApi.updateInfo|addPersonsToDepartment|removePersonFromDepartment|removeByPlace|removeById|listDepartments|createDepartment|updateDepartment|removeDepartment`, `HanetApiError` (Task 2); `enqueue`, `dropEntityJobs`, `kickEntity`, `wakeOp`, `SyncDeferred`, `runDueJobs` (Task 5); `getPlaceIds` (`server/hanet.ts`).
- Produces: handler cho 6 thao tác; `SyncBadge({status, error})`, `SyncRetryButton({entityType, entityId, onDone})`.
- Payload chuẩn: `user.info {code, name, title}`; `user.department {fromHanetDeptId: string|null, toDepartmentId: string|null}`; `user.remove {code, name, personId}`; `dept.create {name, desc}`; `dept.update {name, desc}`; `dept.remove {hanetDepartmentId, name}`. Handler đọc dữ liệu hiện tại từ DB khi có thể (payload chỉ để hiển thị và cho việc xóa).

- [ ] **Step 1: Viết test `tests/sync-staff.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok, type Reply } from './fake-hanet';
import { enqueue, runDueJobs } from '../server/hanet-sync';
import { SYNC_HANDLERS } from '../server/sync-handlers';
import type { Db } from '../server/db';

async function setup(routes: Record<string, Reply>) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  seedUser(app.db, { code: 'ADMIN', role: 'hr' });
  // Đồng hồ của hàng đợi đi trước đồng hồ thật 5 giây để các việc vừa xếp qua API đã đến hạn
  let now = Date.now() + 5_000;
  const deps = { db: app.db, fetch: fake.fetchImpl, now: () => now };
  return {
    app,
    fake,
    deps,
    advance: (ms: number) => (now += ms),
    hr: await loginAs(app, 'HR01'),
    admin: await loginAs(app, 'ADMIN'),
  };
}
const faceUser = (db: Db, code: string, personId: string, departmentId: string | null = null) => {
  const id = seedUser(db, { code, hanetPersonId: personId, departmentId });
  db.prepare('UPDATE users SET face_registered = 1 WHERE id = ?').run(id);
  return id;
};
const ops = (db: Db) => (db.prepare('SELECT op, entity_id FROM sync_jobs ORDER BY id').all() as { op: string; entity_id: string }[]).map((j) => [j.op, j.entity_id]);
const count = (fake: ReturnType<typeof fakeHanet>, path: string) => fake.paths().filter((p) => p === path).length;

test('sửa họ tên/chức vụ người đã có FaceID → updateInfo; người chưa có FaceID → không xếp việc', async () => {
  const { app, fake, deps, hr } = await setup({ '/person/updateInfo': ok() });
  try {
    const a = faceUser(app.db, 'NV01', 'P1');
    const b = seedUser(app.db, { code: 'NV02' });
    await hr.put(`/api/users/${a}`, { name: 'Nguyễn Văn An', position: 'Kế toán' });
    await hr.put(`/api/users/${b}`, { name: 'Khác' });
    await hr.put(`/api/users/${a}`, { phone: '0900' });
    assert.deepEqual(ops(app.db), [['user.info', a]]);
    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/person/updateInfo')!.params;
    assert.deepEqual([p.get('aliasID'), p.get('placeID'), p.get('name'), p.get('title')], ['NV01', String(PLACE), 'Nguyễn Văn An', 'Kế toán']);
    assert.equal((await hr.get('/api/users')).body.users.find((u: any) => u.id === a).hanetSyncStatus, 'synced');
  } finally {
    await app.close();
  }
});

test('phòng ban: tạo trên web → tạo trên Hanet và lưu ID; trùng tên (khác hoa thường, khoảng trắng) thì liên kết', async () => {
  const { app, fake, deps, hr } = await setup({
    '/department/list': (p: URLSearchParams) => ok({ hits: p.get('keyword') === 'Kế toán' ? [{ id: 5132, name: ' kế toán ' }] : [] }),
    '/department/create': ok({ id: 6687, name: 'IT' }),
  });
  try {
    const kt = (await hr.post('/api/departments', { name: 'Kế toán' })).body.department.id;
    const it = (await hr.post('/api/departments', { name: 'IT', description: 'Phòng IT' })).body.department.id;
    await runDueJobs(deps, SYNC_HANDLERS);
    const ids = Object.fromEntries((app.db.prepare('SELECT id, hanet_department_id FROM departments').all() as { id: string; hanet_department_id: string }[]).map((r) => [r.id, r.hanet_department_id]));
    assert.deepEqual([ids[kt], ids[it]], ['5132', '6687']);
    assert.equal(count(fake, '/department/create'), 1);
    assert.deepEqual([fake.last('/department/create')!.params.get('name'), fake.last('/department/create')!.params.get('desc')], ['IT', 'Phòng IT']);
    const list = (await hr.get('/api/departments')).body.departments;
    assert.deepEqual(list.map((d: any) => d.hanetSyncStatus), ['synced', 'synced']);
    await hr.put(`/api/departments/${it}`, { name: 'CNTT' });
    assert.deepEqual(ops(app.db).slice(-1), [['dept.update', it]]);
  } finally {
    await app.close();
  }
});

test('đổi phòng ban khi phòng chưa lên Hanet → hoãn; phòng lên Hanet rồi thì thêm người vào phòng', async () => {
  let creates = 0;
  const { app, fake, deps, advance, hr } = await setup({
    '/department/list': ok({ hits: [] }),
    '/department/create': () => (++creates === 1 ? fail(-503) : ok({ id: 6687 })),
    '/department/add-person': ok(),
  });
  try {
    const u = faceUser(app.db, 'NV01', 'P1');
    const it = (await hr.post('/api/departments', { name: 'IT' })).body.department.id;
    await hr.put(`/api/users/${u}`, { departmentId: it });
    await runDueJobs(deps, SYNC_HANDLERS);
    const dep = app.db.prepare("SELECT attempts, last_error FROM sync_jobs WHERE op = 'user.department'").get() as { attempts: number; last_error: string };
    assert.deepEqual({ ...dep }, { attempts: 0, last_error: 'Chờ phòng ban đồng bộ lên Hanet' });
    advance(61_000);
    await runDueJobs(deps, SYNC_HANDLERS); // tạo phòng thành công, đánh thức việc đổi phòng
    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/department/add-person')!.params;
    assert.deepEqual([p.get('departmentID'), p.get('personIDs')], ['6687', 'P1']);
  } finally {
    await app.close();
  }
});

test('chuyển phòng: bỏ khỏi phòng cũ trên Hanet rồi thêm vào phòng mới', async () => {
  const { app, fake, deps, hr } = await setup({ '/department/remove-person': ok(), '/department/add-person': ok() });
  try {
    const a = seedDepartment(app.db, 'A');
    const b = seedDepartment(app.db, 'B');
    app.db.prepare("UPDATE departments SET hanet_department_id = CASE code WHEN 'A' THEN '11' ELSE '22' END").run();
    const u = faceUser(app.db, 'NV01', 'P1', a);
    await hr.put(`/api/users/${u}`, { departmentId: b });
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.deepEqual(fake.paths(), ['/department/remove-person', '/department/add-person']);
    assert.deepEqual([fake.calls[0].params.get('departmentID'), fake.calls[0].params.get('personID')], ['11', 'P1']);
    assert.equal(fake.calls[1].params.get('departmentID'), '22');
  } finally {
    await app.close();
  }
});

test('ADMIN xóa nhân sự: removeByPlace; -5011 thì xóa theo Person ID; chưa có FaceID thì không xếp việc', async () => {
  const { app, fake, deps, admin } = await setup({
    '/person/removeByPlace': (p: URLSearchParams) => (p.get('aliasID') === 'NV02' ? fail(-5011) : ok()),
    '/person/removePersonByID': ok(),
  });
  try {
    const a = faceUser(app.db, 'NV01', 'P1');
    const b = faceUser(app.db, 'NV02', 'P2');
    const c = seedUser(app.db, { code: 'NV03' });
    for (const id of [a, b, c]) assert.equal((await admin.del(`/api/users/${id}`)).status, 200);
    assert.deepEqual(ops(app.db), [['user.remove', a], ['user.remove', b]]);
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.equal(count(fake, '/person/removeByPlace'), 2);
    assert.equal(fake.last('/person/removePersonByID')!.params.get('personID'), 'P2');
    assert.deepEqual((app.db.prepare('SELECT status FROM sync_jobs').all() as { status: string }[]).map((r) => r.status), ['done', 'done']);
  } finally {
    await app.close();
  }
});

test('ADMIN xóa phòng ban: có ID Hanet → xóa trên Hanet; chưa lên Hanet → bỏ việc tạo đang chờ', async () => {
  const { app, fake, deps, hr, admin } = await setup({ '/department/remove': ok() });
  try {
    const synced = seedDepartment(app.db, 'A');
    app.db.prepare("UPDATE departments SET hanet_department_id = '11' WHERE id = ?").run(synced);
    const fresh = (await hr.post('/api/departments', { name: 'Mới' })).body.department.id;
    await admin.del(`/api/departments/${synced}`);
    await admin.del(`/api/departments/${fresh}`);
    assert.deepEqual(ops(app.db), [['dept.remove', synced]]);
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.equal(fake.last('/department/remove')!.params.get('id'), '11');
  } finally {
    await app.close();
  }
});

test('Review Focus #5: đối tượng bị xóa trước khi việc chạy → việc kết thúc êm, không gọi Hanet', async () => {
  const { app, fake, deps } = await setup({});
  try {
    const u = faceUser(app.db, 'NV01', 'P1');
    const d = seedDepartment(app.db, 'A');
    app.db.prepare("UPDATE departments SET hanet_department_id = '11' WHERE id = ?").run(d);
    enqueue(app.db, 'user', u, 'user.info', {}, deps.now());
    enqueue(app.db, 'user', u, 'user.department', { fromHanetDeptId: null, toDepartmentId: d }, deps.now());
    enqueue(app.db, 'department', d, 'dept.update', {}, deps.now());
    app.db.prepare('DELETE FROM users WHERE id = ?').run(u);
    app.db.prepare('DELETE FROM departments WHERE id = ?').run(d);
    await runDueJobs(deps, SYNC_HANDLERS);
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.deepEqual((app.db.prepare('SELECT status FROM sync_jobs ORDER BY id').all() as { status: string }[]).map((r) => r.status), ['done', 'done', 'done']);
    assert.equal(fake.calls.length, 0);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/sync-staff.test.ts`
Expected: FAIL — chưa có việc nào được xếp (`ops` rỗng).

- [ ] **Step 3: Handler — viết lại `server/sync-handlers.ts`**

```ts
import type { HanetDeps } from './hanet-api';
import { HanetApiError, hanetApi } from './hanet-api';
import { SyncDeferred, wakeOp, type SyncHandlers } from './hanet-sync';
import { getPlaceIds } from './hanet';

function placeOf(deps: HanetDeps): number {
  const id = getPlaceIds(deps.db)[0];
  if (!id) throw new SyncDeferred('Chưa chọn địa điểm Hanet');
  return id;
}

/** -5011 (không tìm thấy người trên Hanet) khi xóa/bỏ khỏi phòng = đã xong. */
async function ignoreNotFound(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof HanetApiError) || err.returnCode !== -5011) throw err;
  }
}

type UserRow = { code: string; name: string; position: string; hanet_person_id: string | null; face_registered: number };
type DeptRow = { name: string; description: string; hanet_department_id: string | null };
const userRow = (deps: HanetDeps, id: string) =>
  deps.db.prepare('SELECT code, name, position, hanet_person_id, face_registered FROM users WHERE id = ?').get(id) as UserRow | undefined;
const deptRow = (deps: HanetDeps, id: string) =>
  deps.db.prepare('SELECT name, description, hanet_department_id FROM departments WHERE id = ?').get(id) as DeptRow | undefined;
const norm = (s: string) => s.trim().toLocaleLowerCase('vi');

/** Xử lý từng thao tác đồng bộ sang Hanet. Bản ghi đã bị xóa trên web thì việc kết thúc êm. */
export const SYNC_HANDLERS: SyncHandlers = {
  'camera.rename': async (deps, job) => {
    await hanetApi.updateDevice(deps, String(job.payload.deviceId), String(job.payload.name));
  },

  'user.alias': async (deps, job) => {
    await hanetApi.updateAliasId(deps, String(job.payload.personId), String(job.payload.code));
  },

  'user.info': async (deps, job) => {
    const u = userRow(deps, job.entityId);
    if (!u || u.face_registered !== 1) return;
    await hanetApi.updateInfo(deps, { aliasId: u.code, placeId: placeOf(deps), name: u.name, title: u.position ?? '' });
  },

  'user.department': async (deps, job) => {
    const u = userRow(deps, job.entityId);
    if (!u) return;
    const personId = u.hanet_person_id;
    if (!personId) throw new SyncDeferred('Chờ đăng ký FaceID');
    let toHanet: number | null = null;
    const toId = job.payload.toDepartmentId as string | null;
    if (toId) {
      const d = deptRow(deps, toId);
      if (d) {
        if (!d.hanet_department_id) throw new SyncDeferred('Chờ phòng ban đồng bộ lên Hanet');
        toHanet = Number(d.hanet_department_id);
      }
    }
    const fromHanet = job.payload.fromHanetDeptId ? Number(job.payload.fromHanetDeptId) : null;
    if (fromHanet && fromHanet !== toHanet) await ignoreNotFound(() => hanetApi.removePersonFromDepartment(deps, fromHanet, personId));
    if (toHanet) await hanetApi.addPersonsToDepartment(deps, toHanet, [personId]);
  },

  'user.remove': async (deps, job) => {
    const placeId = placeOf(deps);
    try {
      await hanetApi.removeByPlace(deps, String(job.payload.code), placeId);
    } catch (err) {
      if (!(err instanceof HanetApiError) || err.returnCode !== -5011) throw err;
      // Người nhập từ Hanet mà việc gán mã chưa chạy: xóa theo Person ID
      if (job.payload.personId) await ignoreNotFound(() => hanetApi.removeById(deps, String(job.payload.personId)));
    }
  },

  'dept.create': async (deps, job) => {
    const d = deptRow(deps, job.entityId);
    if (!d || d.hanet_department_id) return;
    const placeId = placeOf(deps);
    const same = (await hanetApi.listDepartments(deps, placeId, d.name.trim())).find((h) => norm(h.name) === norm(d.name));
    const hanetId = same ? same.id : await hanetApi.createDepartment(deps, placeId, d.name, d.description ?? '');
    deps.db.prepare('UPDATE departments SET hanet_department_id = ? WHERE id = ?').run(String(hanetId), job.entityId);
    wakeOp(deps.db, 'user.department', deps.now());
  },

  'dept.update': async (deps, job) => {
    const d = deptRow(deps, job.entityId);
    if (!d) return;
    if (!d.hanet_department_id) throw new SyncDeferred('Chờ tạo phòng ban trên Hanet');
    await hanetApi.updateDepartment(deps, Number(d.hanet_department_id), d.name, d.description ?? '');
  },

  'dept.remove': async (deps, job) => {
    await ignoreNotFound(() => hanetApi.removeDepartment(deps, Number(job.payload.hanetDepartmentId)));
  },
};
```

- [ ] **Step 4: Xếp việc trong `server/routes/users.ts`**

Thêm `dropEntityJobs` vào dòng `import { enqueue, kickEntity } from '../hanet-sync';`.

Trong `PUT /users/:id`, thay hai dòng cuối:

```ts
    if (b.status === 'inactive' && target.status !== 'inactive') deleteUserSessions(db, target.id);
    res.json({ user: getUser(db, target.id) });
```

bằng:

```ts
    if (b.status === 'inactive' && target.status !== 'inactive') deleteUserSessions(db, target.id);
    const after = getUser(db, target.id)!;
    const now = ctx.now();
    if (after.faceRegistered && (after.name !== target.name || after.position !== target.position)) {
      enqueue(db, 'user', target.id, 'user.info', { code: after.code, name: after.name, title: after.position }, now);
    }
    const linkedNow = Boolean(after.hanetPersonId) && !target.hanetPersonId;
    if (after.hanetPersonId && (after.departmentId !== target.departmentId || (linkedNow && after.departmentId))) {
      const from =
        target.departmentId && !linkedNow
          ? ((db.prepare('SELECT hanet_department_id FROM departments WHERE id = ?').get(target.departmentId) as { hanet_department_id: string | null } | undefined)
              ?.hanet_department_id ?? null)
          : null;
      enqueue(db, 'user', target.id, 'user.department', { fromHanetDeptId: from, toDepartmentId: after.departmentId }, now);
    }
    kickEntity(ctx, 'user', target.id);
    res.json({ user: getUser(db, target.id) });
```

Trong `DELETE /users/:id`, ngay sau dòng `const backup = backupNow(...)`, thêm:

```ts
    if (target.faceRegistered || target.hanetPersonId) {
      enqueue(db, 'user', target.id, 'user.remove', { code: target.code, name: target.name, personId: target.hanetPersonId }, ctx.now());
    } else {
      dropEntityJobs(db, 'user', target.id);
    }
```

và ngay trước `res.json({ success: true, backup });` thêm `kickEntity(ctx, 'user', target.id);`.

- [ ] **Step 5: Xếp việc trong `server/routes/departments.ts`**

Thêm import `import { dropEntityJobs, enqueue, kickEntity } from '../hanet-sync';`.

`POST /departments`: ngay trước `res.json({ department: getDept(db, id) });` thêm:

```ts
    enqueue(db, 'department', id, 'dept.create', { name, desc: typeof b.description === 'string' ? b.description.trim() : '' }, ctx.now());
    kickEntity(ctx, 'department', id);
```

`PUT /departments/:id`: ngay trước `res.json({ department: getDept(db, dept.id) });` thêm:

```ts
    const after = getDept(db, dept.id)!;
    if (after.name !== dept.name || after.description !== dept.description) {
      enqueue(db, 'department', dept.id, 'dept.update', { name: after.name, desc: after.description }, ctx.now());
      kickEntity(ctx, 'department', dept.id);
    }
```

`DELETE /departments/:id`: ngay sau dòng `const backup = backupNow(...)` thêm:

```ts
    const hanetDeptId = (db.prepare('SELECT hanet_department_id FROM departments WHERE id = ?').get(dept.id) as { hanet_department_id: string | null })
      .hanet_department_id;
    if (hanetDeptId) enqueue(db, 'department', dept.id, 'dept.remove', { hanetDepartmentId: hanetDeptId, name: dept.name }, ctx.now());
    else dropEntityJobs(db, 'department', dept.id);
```

và ngay trước `res.json({ success: true, backup });` thêm `kickEntity(ctx, 'department', dept.id);`.

- [ ] **Step 6: Chạy test**

Run: `npx tsx --test tests/sync-staff.test.ts && npm test && npm run lint`
Expected: PASS.

- [ ] **Step 7: Tạo `src/components/SyncBadge.tsx`**

```tsx
import React, { useState } from 'react';
import type { SyncEntity, SyncStatus } from '../types';
import { api, errorMessage } from '../api';
import { SYNC_STATUS_LABEL } from '../format';

const TONE: Record<SyncStatus, string> = {
  synced: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const SyncBadge: React.FC<{ status: SyncStatus; error: string | null }> = ({ status, error }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${TONE[status]}`} title={error ?? undefined}>
    {SYNC_STATUS_LABEL[status]}
  </span>
);

export const SyncRetryButton: React.FC<{ entityType: SyncEntity; entityId: string; onDone: () => void }> = ({ entityType, entityId, onDone }) => {
  const [busy, setBusy] = useState(false);
  const retry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await api('/api/hanet/sync/retry', { method: 'POST', body: { entityType, entityId } });
      onDone();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={retry} disabled={busy} className="text-[10px] font-semibold text-rose-700 hover:underline cursor-pointer disabled:opacity-50">
      Đồng bộ lại
    </button>
  );
};
```

- [ ] **Step 8: Gắn nhãn vào `EmployeesTab.tsx` và `DepartmentsTab.tsx`**

`src/components/EmployeesTab.tsx`: thêm `import { SyncBadge, SyncRetryButton } from './SyncBadge';`. Thay dòng:

```tsx
                <p className="text-slate-500 truncate">{u.position || '—'}</p>
```

bằng:

```tsx
                <p className="text-slate-500 truncate">{u.position || '—'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <SyncBadge status={u.hanetSyncStatus} error={u.hanetSyncError} />
                  {u.hanetSyncStatus === 'error' && <SyncRetryButton entityType="user" entityId={u.id} onDone={onRefresh} />}
                </div>
                {u.hanetSyncStatus !== 'synced' && u.hanetSyncError && (
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate" title={u.hanetSyncError}>
                    {u.hanetSyncError}
                  </p>
                )}
```

`src/components/DepartmentsTab.tsx`: thêm `import { SyncBadge, SyncRetryButton } from './SyncBadge';`. Thay dòng:

```tsx
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{d.description || 'Chưa có mô tả'}</p>
```

bằng:

```tsx
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{d.description || 'Chưa có mô tả'}</p>
              <div className="mt-2">
                <SyncBadge status={d.hanetSyncStatus} error={d.hanetSyncError} />
              </div>
```

Trong khung chi tiết phòng ban, ngay sau dòng `<div className="flex gap-2">` đầu tiên (khung chứa nút "Sửa phòng ban"), thêm:

```tsx
              {isHR && active.hanetSyncStatus === 'error' && <SyncRetryButton entityType="department" entityId={active.id} onDone={onRefresh} />}
```

- [ ] **Step 9: Kiểm tra kiểu, build**

Run: `npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 10: Commit**

```bash
git add server/sync-handlers.ts server/routes/users.ts server/routes/departments.ts src/components/SyncBadge.tsx src/components/EmployeesTab.tsx src/components/DepartmentsTab.tsx tests/sync-staff.test.ts
git commit -m "feat(sync): push employee info, membership, deletions and departments to Hanet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Nút "Xem video lúc này"

**Files:**
- Modify: `server/hanet.ts` (`HANET_CONNECT_BASE`, `hanetVideoUrl`)
- Modify: `server/routes/attendance.ts` (route chi tiết lượt quẹt)
- Modify: `shared/types.ts` (`Detection.videoUrl`)
- Modify: `src/components/AttendanceTable.tsx`
- Test: `tests/attendance-routes.test.ts`

**Interfaces:**
- Consumes: `getPlaceIds` (`server/hanet.ts`), `currentUser` (middleware).
- Produces: `HANET_CONNECT_BASE = 'https://connect.hanet.ai'`; `hanetVideoUrl(placeId: number, deviceId: string, day: string): string`; `Detection.videoUrl: string | null`.

- [ ] **Step 1: Viết test** — thêm vào cuối `tests/attendance-routes.test.ts`

Thêm import ở đầu file: `import { deleteSetting, setSetting } from '../server/settings';`.

```ts
test('nút Xem video: link Hanet Connect đúng địa điểm, camera, ngày giờ VN; chỉ HR và Trưởng phòng', async () => {
  const { app, ids } = await setup();
  try {
    setSetting(app.db, 'hanet.place_ids', '[998833]');
    // 00:30 giờ VN ngày 14/10 là 17:30 UTC ngày 13/10: link phải mang ngày 14/10
    addDetection(app.db, ids.nv1, at('00:30', '2026-10-14'), { deviceId: 'C21272C952' });
    addDetection(app.db, ids.nv1, at('00:40', '2026-10-14'), { deviceId: 'SIM', source: 'simulator' });
    const path = `/api/attendance/${ids.nv1}/2026-10-14/detections`;
    const urls = async (code: string) => ((await (await loginAs(app, code)).get(path)).body.detections as { videoUrl: string | null }[]).map((d) => d.videoUrl);
    const expected = 'https://connect.hanet.ai/998833/video?id_device=C21272C952&day=2026-10-14';
    assert.deepEqual(await urls('HR01'), [expected, null]);
    assert.deepEqual(await urls('TP01'), [expected, null]);
    assert.deepEqual(await urls('NV01'), [null, null]);
    deleteSetting(app.db, 'hanet.place_ids');
    assert.deepEqual(await urls('HR01'), [null, null]);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx tsx --test tests/attendance-routes.test.ts`
Expected: FAIL — `videoUrl` là `undefined`.

- [ ] **Step 3: `server/hanet.ts`** — thêm cuối file

```ts
/** Trang xem lại video của Hanet Connect. Không gọi API nội bộ: HR tự đăng nhập Hanet Connect. */
export const HANET_CONNECT_BASE = 'https://connect.hanet.ai';

export function hanetVideoUrl(placeId: number, deviceId: string, day: string): string {
  return `${HANET_CONNECT_BASE}/${placeId}/video?id_device=${encodeURIComponent(deviceId)}&day=${day}`;
}
```

- [ ] **Step 4: `shared/types.ts`** — trong `interface Detection` thêm sau `source: DetectionSource;`:

```ts
  videoUrl: string | null; // trang xem lại video trên Hanet Connect; null nếu người xem không được phép
```

- [ ] **Step 5: `server/routes/attendance.ts`** — route chi tiết lượt quẹt

Thêm import `import { getPlaceIds, hanetVideoUrl } from '../hanet';`. Trong route `GET /attendance/:userId/:date/detections`:
- Đổi câu SELECT thành `'SELECT id, device_id, device_name, place_id, ts, work_date, image_url, source FROM detections WHERE user_id = ? AND work_date = ? ORDER BY ts'`.
- Ngay trước `const detections: Detection[] = ...` thêm:

```ts
    const viewer = currentUser(req);
    const placeId = getPlaceIds(db)[0];
    const canWatch = (viewer.role === 'hr' || viewer.role === 'dept_manager') && placeId !== undefined;
```

- Trong object map, thêm sau `source: x.source,`:

```ts
      videoUrl: canWatch && x.source !== 'simulator' ? hanetVideoUrl(placeId as number, x.device_id, x.work_date) : null,
```

- [ ] **Step 6: Chạy test**

Run: `npx tsx --test tests/attendance-routes.test.ts && TZ=UTC npx tsx --test tests/attendance-routes.test.ts`
Expected: PASS cả hai.

- [ ] **Step 7: Giao diện — `src/components/AttendanceTable.tsx`**

Thêm `ExternalLink` vào import `lucide-react`. Trong thẻ mỗi lượt quẹt, thay khối:

```tsx
                  <div className="p-2">
                    <div className="font-mono font-semibold">{fmtTime(d.ts)}</div>
                    <div className="text-[11px] text-slate-500 truncate">{d.deviceName ?? d.deviceId}</div>
                    <div className="text-[10px] text-slate-400">{SOURCE_LABEL[d.source]}</div>
                  </div>
```

bằng:

```tsx
                  <div className="p-2">
                    <div className="font-mono font-semibold">{fmtTime(d.ts)}</div>
                    <div className="text-[11px] text-slate-500 truncate">{d.deviceName ?? d.deviceId}</div>
                    <div className="text-[10px] text-slate-400">{SOURCE_LABEL[d.source]}</div>
                    {d.videoUrl && (
                      <a
                        href={d.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                        title={`Mở Hanet Connect, chọn đoạn gần ${fmtTime(d.ts)}`}
                      >
                        <ExternalLink className="w-3 h-3" /> Xem video lúc này
                      </a>
                    )}
                    {d.videoUrl && <div className="text-[10px] text-slate-400">Mở Hanet Connect, chọn đoạn gần {fmtTime(d.ts)}</div>}
                  </div>
```

- [ ] **Step 8: Kiểm tra kiểu, build**

Run: `npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 9: Commit**

```bash
git add server/hanet.ts server/routes/attendance.ts shared/types.ts src/components/AttendanceTable.tsx tests/attendance-routes.test.ts
git commit -m "feat(attendance): 'Xem video lúc này' opens Hanet Connect for the camera and day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Tài liệu triển khai và kiểm tra cuối

**Files:**
- Modify: `DEPLOY.md`
- Rebuild: `dist/`, `server.js`

**Interfaces:**
- Consumes: mọi task trước.
- Produces: bản build production; hướng dẫn nâng cấp lên schema v2.

- [ ] **Step 1: Thêm mục nâng cấp vào `DEPLOY.md`** — chèn ngay trước mục `## Cấu hình webhook trên Hanet`

````markdown
## Nâng cấp lên bản tích hợp Hanet (database v2)

Bản này đổi cấu trúc database và **không chuyển dữ liệu cũ**. Server sẽ không khởi động trên database cũ mà in: `[STARTUP] Database phiên bản cũ (v1). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.`

```bash
cd /home/ubuntu/hgc-attendance
pm2 stop hanet-attendance
mkdir -p ~/hgc-backup && cp data/attendance.db ~/hgc-backup/attendance-v1-$(date +%F).db
rm -f data/attendance.db data/attendance.db-wal data/attendance.db-shm
git pull && npm install --omit=dev
pm2 restart hanet-attendance
pm2 logs hanet-attendance --lines 20 --nostream    # thấy [BOOTSTRAP] Đã tạo tài khoản ADMIN ...
```

Sau khi khởi động, vì database mới hoàn toàn:

1. Đăng nhập `ADMIN` / `Admin@123` (hoặc `ADMIN_INITIAL_PASSWORD`), đổi mật khẩu.
2. Tab **Cấu hình**: nhập lại Client ID, Client Secret, Refresh Token → **Lưu** → **Kiểm tra kết nối** → chọn địa điểm (ví dụ HRINTER) → **Lưu** lần nữa.
3. **Token webhook đã đổi**: chép URL webhook mới dán lên Hanet.
4. Tab **Camera** → **Nhập camera từ Hanet**.
5. Tab **Nhân sự** → **Nhập từ Hanet** để tạo nhân sự từ những người đã có trên Hanet; người mới thì **Thêm nhân sự → Lấy từ camera**.

## Kiểm tra sau khi nâng cấp (trên host)

- [ ] Kiểm tra kết nối báo đúng tài khoản và địa điểm HRINTER.
- [ ] Nhập camera C21272C952, thấy chấm xanh (online) sau tối đa 5 phút hoặc khi bấm **Làm mới trạng thái**.
- [ ] Nhập "Dương Đức Văn" từ Hanet; người này quẹt mặt thì bảng công có dòng của họ.
- [ ] Một người chưa đăng ký đứng trước camera → **Thêm nhân sự → Lấy từ camera** → chọn ảnh người lạ → **Tạo nhân sự** → thông báo "FaceID: Đã đăng ký FaceID trên Hanet". Người đó đứng lại trước camera và được chấm công. Nếu báo lỗi ảnh (ví dụ kích thước), ghi lại thông báo để xử lý ở bản sau.
- [ ] Tạo phòng ban trên web, thấy phòng ban đó trên app Hanet; xếp người thử vào phòng.
- [ ] Bảng công → chi tiết lượt quẹt → **Xem video lúc này** mở Hanet Connect đúng camera C21272C952, đúng ngày.
- [ ] Xóa người thử bằng tài khoản ADMIN; người đó biến mất khỏi Hanet. Tab **Cấu hình › Đồng bộ Hanet** không còn việc lỗi.
````

- [ ] **Step 2: Kiểm tra toàn bộ**

Run:

```bash
npm test && TZ=UTC npm test && npm run lint && npm run build
grep -rn "recent-faces\|recentUnmatchedFaces\|RecentFace" server src shared tests || echo "OK: đã bỏ API gợi ý cũ"
grep -rn "removeAllPersonInPlace" server || echo "OK: không dùng API xóa toàn bộ"
grep -rn "console\.\(log\|warn\|error\).*\(token\|secret\)" server | grep -v webhook_token_rotated || echo "OK: không log token/secret"
```

Expected: test, lint, build đều qua; ba dòng `OK: ...`.

- [ ] **Step 3: Chạy thử bản production với database cũ và mới**

```bash
SMOKE=$(mktemp -d) && cp -r dist server.js package.json "$SMOKE"/ && ln -s "$PWD/node_modules" "$SMOKE/node_modules" && mkdir -p "$SMOKE/data"
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$SMOKE/data/attendance.db');d.exec('CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (1);');d.close()"
(cd "$SMOKE" && NODE_ENV=production PORT=3095 node server.js; echo "exit=$?")
rm -f "$SMOKE/data/attendance.db"
(cd "$SMOKE" && NODE_ENV=production PORT=3095 node server.js > server.log 2>&1 &) ; sleep 3
curl -s localhost:3095/api/health; echo
grep BOOTSTRAP "$SMOKE/server.log"
lsof -ti:3095 | xargs kill 2>/dev/null; true
```

Expected: lần chạy đầu in `[STARTUP] Database phiên bản cũ (v1). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` và `exit=1`; lần sau `{"ok":true}` và một dòng `[BOOTSTRAP] Đã tạo tài khoản ADMIN ...`.

- [ ] **Step 4: Commit**

```bash
git add DEPLOY.md dist server.js
git commit -m "docs(deploy): upgrade to database v2 and Hanet integration checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tự rà soát kế hoạch so với spec

| Spec | Task |
|---|---|
| §1 mục 1 Kiểm tra kết nối, chọn địa điểm | 3 |
| §1 mục 2, §6.6 Camera: nhập, online/offline 5 phút, đổi tên | 6 |
| §1 mục 3, §6.3 Nhập từ Hanet, mã tự sinh, `updateAliasID` | 8 |
| §1 mục 4–5, §6.4 FaceID từ ảnh camera, `-9005/-9006/-9008`, đổi ảnh | 7 |
| §1 mục 6, §6.2, §6.5 Hàng đợi, thứ tự, gộp, xóa thắng, phụ thuộc, thử lại, trạng thái | 5, 9 |
| §1 mục 7, §6.8 Xem video lúc này | 10 |
| §5 Schema v2, không migration, thoát khi DB cũ | 1, 11 |
| §6.1 Webhook người lạ, `face_sightings`, bỏ `recent-faces` | 4 |
| §7 API mới (+ `face-candidates`, retry theo đối tượng) | 3–10 |
| §8 Giao diện | 3, 5, 6, 7, 8, 9, 10 |
| §9 Timeout 15s, `-103`, chưa cấu hình, đổi địa điểm cảnh báo, log | 2, 3, 5 |
| §10 Kiểm thử, ma trận phân quyền, `TZ=UTC` | mọi task, 11 |
| §11 Tiêu chí hoàn thành | 11 |
