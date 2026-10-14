# Đợt A — Khu vực, phân quyền theo khu và tài khoản nhân sự: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web có nhiều khu vực; HR toàn hệ thống quản lý mọi khu, quản trị khu vực chỉ quản lý khu được giao; `ADMIN` giữ cấu hình kỹ thuật; thêm nhân sự bắt buộc email + điện thoại, mã tự sinh, mật khẩu gửi qua email (Gmail SMTP), tự đặt lại mật khẩu, đăng nhập bằng mã hoặc email, nhập nhân sự từ CSV.

**Architecture:** Khu vực là khái niệm riêng của web: bảng `areas`, `departments.area_id`, `cameras.area_id`, `admin_areas`. Phạm vi dữ liệu mở rộng ở một chỗ (`scopeFor`/`scopeWhere` trong `server/auth.ts` + module mới `server/access.ts` cho cổng quyền và kiểm tra đối tượng). Thư đi qua hàng đợi `email_jobs` chạy mỗi phút; mật khẩu tạm sinh lúc gửi nên DB không bao giờ chứa mật khẩu rõ. Hàm gửi thư được tiêm qua `AppContext.sendMail` để test dùng hộp thư giả.

**Tech Stack:** Node ≥ 22.13 (`node:sqlite`), Express 4, React 19 + Vite + Tailwind 4, TypeScript, `node:test` qua `tsx`; thêm `nodemailer` (runtime).

**Spec:** `docs/superpowers/specs/2026-10-14-khu-vuc-phan-quyen-tai-khoan-design.md`

## Global Constraints

- Node ≥ 22.13. Dependency runtime: `express`, `dotenv`, **`nodemailer`** (mới, Task 7). Không thêm gì khác.
- **Không migration.** `SCHEMA_VERSION = 3`; DB phiên bản khác thì không mở, in `[STARTUP] Database phiên bản cũ (v<n>). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` và thoát mã 1.
- Vai trò: `hr` (HR toàn hệ thống; tài khoản `ADMIN` cũng là `hr`), `area_admin`, `dept_manager`, `employee`.
- Đối tượng ngoài phạm vi của quản trị khu ⇒ **404** "Không tìm thấy …" (không lộ sự tồn tại). Thiếu vai trò ⇒ 403.
- Ba cổng quyền: `requireSystemAdmin` (chỉ `ADMIN`), `requireGlobalHr` (`hr`), `requireManager` (`hr` hoặc `area_admin`) + kiểm tra phạm vi.
- Không trả, không log mật khẩu, mật khẩu tạm, token đặt lại, mật khẩu SMTP. Log thư dạng `[MAIL] kind=… user=<mã> status=… code=…`.
- Mọi chữ hiển thị tiếng Việt; **không có chữ "Hanet"** trên giao diện/thông báo (gọi là "Camera AI").
- Ngày giờ theo giờ Việt Nam (`toVnDate`, `vnMinutesOfDay`, `VN_OFFSET_MS`).
- Nháy đơn, không chạy prettier/formatter. Chú thích code tiếng Việt, theo phong cách code hiện có.
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Trước mỗi commit: `npm test` và `npm run lint` qua. Không commit `dist/`, `server.js` trừ Task 12.

**Khác biệt có chủ ý so với spec (ghi để reviewer biết):**
- Gán vai trò `hr` cho người khác: **chỉ `ADMIN`** (spec mục 5: "chỉ ADMIN sửa/xóa người có vai trò hr"; cấp `hr` rồi không sửa được là vô lý, nên cấp cũng chỉ `ADMIN`).
- `GET /api/departments` và `GET /api/cameras` nay theo phạm vi: trưởng phòng/nhân viên chỉ thấy phòng của mình và camera thuộc khu của phòng mình (trước đây thấy tất cả).
- Quản trị khu sửa **chính mình**: chỉ họ tên, email, điện thoại, chức vụ (không đổi vai trò, trạng thái, phòng ban).
- `GET /api/users/next-code` (mới) trả mã gợi ý cho form (spec 6.1 "ô điền sẵn mã gợi ý").

## Review Focus

1. Quản trị khu A gửi thẳng request với `id` của nhân sự/phòng/camera/đơn/lượt quẹt khu B (bỏ qua giao diện) → luôn 404, không đổi dữ liệu. Test ở Task 4 và Task 5.
2. Quản trị khu sửa nhân sự trong khu nhưng đổi `departmentId` sang phòng khu B, hoặc đổi `role` thành `hr`/`area_admin` → 404/403, dữ liệu không đổi. Test ở Task 5.
3. Email nhập khác hoa/thường hoặc có khoảng trắng (`An@Gmail.com `) trùng người đã có → 409; đăng nhập bằng email viết hoa vẫn được. Test ở Task 8.
4. Gửi thư lỗi giữa chừng (SMTP từ chối) → mật khẩu cũ của người đó không bị thay, người đó vẫn đăng nhập được bằng mật khẩu cũ (với `reset_temp`). Test ở Task 7.
5. File CSV xuất từ Excel tiếng Việt (dấu `;`, có BOM, ô có dấu phẩy trong ngoặc kép, dòng trống cuối file) → đọc đúng, không tạo dòng rỗng. Test ở Task 9.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `server/db.ts` (sửa) | Schema v3 |
| `server/auth.ts` (sửa) | `AuthUser.areaIds`, `scopeFor`/`scopeWhere` thêm phạm vi `areas` |
| `server/access.ts` (mới) | Cổng quyền, kiểm tra đối tượng thuộc phạm vi, bộ lọc `?area=`, quyền xóa |
| `server/repo.ts` (sửa) | `USER_SELECT`/`mapUser` thêm khu, trạng thái thư; `canSeeUser` theo khu |
| `server/routes/areas.ts` (mới) | CRUD khu vực |
| `server/routes/*.ts` (sửa) | Áp phạm vi và cổng quyền |
| `server/mail.ts` (mới) | Cấu hình SMTP, `SendMail`, gửi qua nodemailer, phân loại lỗi |
| `server/mail-templates.ts` (mới) | Nội dung thư |
| `server/mail-queue.ts` (mới) | Hàng đợi `email_jobs`, sinh mật khẩu lúc gửi, hạn mức ngày |
| `server/accounts.ts` (mới) | Chuẩn hóa email/điện thoại, token đặt lại mật khẩu |
| `server/csv-import.ts` (mới) | Kiểm tra và tạo nhân sự từ dòng CSV |
| `src/csv.ts` (mới) | Đọc CSV ở trình duyệt (`,`/`;`, BOM, ngoặc kép) |
| `src/area.ts` (mới) | Khu đang chọn (localStorage) |
| `src/components/AreasTab.tsx`, `AreaSelect.tsx`, `CsvImportModal.tsx`, `ForgotPasswordScreen.tsx`, `ResetPasswordScreen.tsx`, `config/MailCard.tsx` (mới) | Giao diện |

---

### Task 1: Schema v3, kiểu dữ liệu và trợ giúp test

**Files:**
- Modify: `server/db.ts` (SCHEMA, `SCHEMA_VERSION`)
- Modify: `shared/types.ts`
- Modify: `server/repo.ts` (`USER_SELECT`, `mapUser`)
- Modify: `server/routes/departments.ts:14-34` (`DEPT_SELECT`, `mapDept`)
- Modify: `server/routes/cameras.ts:12-31,53,86,102` (`CAMERA_SELECT`, `mapCamera`)
- Modify: `src/format.ts` (`ROLE_LABEL`), `src/App.tsx:25-29` (`TABS_BY_ROLE`), `src/components/Navbar.tsx:17-21` (`ROLE_BADGE`)
- Modify: `tests/helpers.ts` (`seedArea`, `seedDepartment`, `seedUser`, `contact`)
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces (DB): bảng `areas`, `admin_areas`, `email_jobs`, `password_resets`; cột `departments.area_id`, `cameras.area_id`, `users.email_status`, `users.email_error`; vai trò `area_admin`; chỉ mục duy nhất `idx_users_email` trên `lower(email)` khi `email != ''`.
- Produces (`shared/types.ts`):
  - `UserRole = 'hr' | 'area_admin' | 'dept_manager' | 'employee'`
  - `EmailStatus = 'none' | 'pending' | 'sent' | 'error'`
  - `User` thêm `areaId: string | null; areaName: string | null; adminAreaIds: string[]; emailStatus: EmailStatus; emailError: string | null; canLogin: boolean`
  - `Department` thêm `areaId: string | null; areaName: string | null`
  - `Camera` thêm `areaId: string | null; areaName: string | null`
  - `Area { id; code; name; note; departmentCount: number; cameraCount: number; memberCount: number; adminNames: string[]; createdAt: string }`
  - `ImportedUser { id; code; name }` (bỏ `tempPassword`)
- Produces (`tests/helpers.ts`): `seedArea(db, code, name?) => string`; `seedDepartment(db, code, name?, areaId?: string | null) => string`; `SeedUserOpts` thêm `email?: string; adminAreaIds?: string[]`; `contact(code: string) => { email: string; phone: string }`.

- [ ] **Step 1: Viết test schema v3 (thay test v2)**

Trong `tests/db.test.ts`, thay toàn bộ test `'schema v2: có bảng sync_jobs, face_sightings và các cột mới'` bằng:

```ts
test('schema v3: bảng khu vực, thư, token đặt lại và các cột mới', () => {
  const db = openDb(':memory:');
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  for (const c of ['hanet_sync_status', 'hanet_sync_error', 'face_error', 'email_status', 'email_error']) assert.ok(cols('users').includes(c), `users thiếu ${c}`);
  for (const c of ['hanet_department_id', 'area_id']) assert.ok(cols('departments').includes(c), `departments thiếu ${c}`);
  for (const c of ['online', 'status_checked_at', 'area_id']) assert.ok(cols('cameras').includes(c), `cameras thiếu ${c}`);
  for (const c of ['id', 'code', 'name', 'note', 'created_at']) assert.ok(cols('areas').includes(c), `areas thiếu ${c}`);
  for (const c of ['user_id', 'area_id']) assert.ok(cols('admin_areas').includes(c), `admin_areas thiếu ${c}`);
  for (const c of ['user_id', 'kind', 'to_email', 'status', 'attempts', 'last_error', 'payload', 'next_run_at', 'created_at', 'sent_at']) {
    assert.ok(cols('email_jobs').includes(c), `email_jobs thiếu ${c}`);
  }
  for (const c of ['token_hash', 'user_id', 'expires_at', 'used_at']) assert.ok(cols('password_resets').includes(c), `password_resets thiếu ${c}`);
  for (const t of ['sync_jobs', 'face_sightings']) assert.ok(cols(t).length > 0, `thiếu bảng ${t}`);
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal((db.prepare('SELECT version FROM schema_version').get() as { version: number }).version, 3);
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
```

Trong test `'database phiên bản cũ: …'`: giữ nguyên (nó ghi `version = 1`, vẫn khác 3).

- [ ] **Step 2: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/db.test.ts`
Expected: FAIL — `email_status` thiếu, `SCHEMA_VERSION` là 2.

- [ ] **Step 3: Sửa `server/db.ts`**

Đổi `export const SCHEMA_VERSION = 2;` thành `export const SCHEMA_VERSION = 3;`.

Trong chuỗi `SCHEMA`:

1. Ngay sau dòng `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);` thêm:

```sql

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
```

2. Bảng `departments`: thêm dòng `  area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT,` ngay trước `  created_at TEXT NOT NULL`; sau câu `CREATE TABLE … departments (…);` thêm `CREATE INDEX IF NOT EXISTS idx_departments_area ON departments(area_id);`.

3. Bảng `users`: đổi `role TEXT NOT NULL CHECK (role IN ('hr', 'dept_manager', 'employee')),` thành `role TEXT NOT NULL CHECK (role IN ('hr', 'area_admin', 'dept_manager', 'employee')),`; thêm hai dòng ngay trước `  created_at TEXT NOT NULL`:

```sql
  email_status TEXT NOT NULL DEFAULT 'none' CHECK (email_status IN ('none', 'pending', 'sent', 'error')),
  email_error TEXT,
```

và sau `CREATE INDEX IF NOT EXISTS idx_users_hanet_person ON users(hanet_person_id);` thêm:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email)) WHERE email != '';

CREATE TABLE IF NOT EXISTS admin_areas (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, area_id)
);
```

4. Bảng `cameras`: thêm `  area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT,` ngay trước `  created_at TEXT NOT NULL`; sau câu tạo bảng thêm `CREATE INDEX IF NOT EXISTS idx_cameras_area ON cameras(area_id);`.

5. Cuối chuỗi `SCHEMA` (sau `CREATE INDEX IF NOT EXISTS idx_sightings_created …;`) thêm:

```sql

CREATE TABLE IF NOT EXISTS email_jobs (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('welcome', 'reset_temp', 'reset_link')),
  to_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  next_run_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_email_jobs_due ON email_jobs(status, next_run_at);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
```

- [ ] **Step 4: Sửa `shared/types.ts`**

```ts
export type UserRole = 'hr' | 'area_admin' | 'dept_manager' | 'employee';
export type UserStatus = 'active' | 'inactive';
export type SyncStatus = 'synced' | 'pending' | 'error';
export type EmailStatus = 'none' | 'pending' | 'sent' | 'error';
```

Trong `interface User` thêm (sau `departmentName`): 

```ts
  areaId: string | null; // khu của phòng ban
  areaName: string | null;
  adminAreaIds: string[]; // khu được giao (chỉ với area_admin)
```

và (sau `faceError`):

```ts
  emailStatus: EmailStatus; // trạng thái thư gần nhất gửi cho người này
  emailError: string | null;
  canLogin: boolean; // đã có mật khẩu (false: thiếu email hoặc thư chào mừng chưa gửi được)
```

Trong `interface Department` và `interface Camera` thêm (trước `createdAt`):

```ts
  areaId: string | null;
  areaName: string | null;
```

Thêm sau `interface Camera`:

```ts
export interface Area {
  id: string;
  code: string;
  name: string;
  note: string;
  departmentCount: number;
  cameraCount: number;
  memberCount: number;
  adminNames: string[]; // quản trị khu vực được giao khu này
  createdAt: string;
}
```

Đổi `ImportedUser` thành:

```ts
export interface ImportedUser {
  id: string;
  code: string;
  name: string;
}
```

- [ ] **Step 5: Sửa `server/repo.ts`**

```ts
export const USER_SELECT = `SELECT u.id, u.code, u.name, u.email, u.phone, u.role, u.department_id,
  d.name AS department_name, d.area_id, ar.name AS area_name, u.position, u.avatar_url, u.hanet_person_id, u.face_registered, u.status,
  u.hanet_sync_status, u.hanet_sync_error, u.face_error, u.email_status, u.email_error, (u.password_hash IS NOT NULL) AS can_login,
  (SELECT group_concat(x.area_id) FROM admin_areas x WHERE x.user_id = u.id) AS admin_area_ids, u.created_at
  FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN areas ar ON ar.id = d.area_id`;
```

Trong `mapUser` thêm sau `departmentName`:

```ts
    areaId: r.area_id ?? null,
    areaName: r.area_name ?? null,
    adminAreaIds: r.admin_area_ids ? String(r.admin_area_ids).split(',').sort() : [],
```

và sau `faceError`:

```ts
    emailStatus: r.email_status ?? 'none',
    emailError: r.email_error ?? null,
    canLogin: r.can_login === 1,
```

- [ ] **Step 6: Sửa `server/routes/departments.ts`**

```ts
const DEPT_SELECT = `SELECT d.id, d.code, d.name, d.description, d.manager_id, m.name AS manager_name, d.hanet_sync_status, d.hanet_sync_error, d.created_at,
  d.area_id, ar.name AS area_name,
  (SELECT COUNT(*) FROM users x WHERE x.department_id = d.id) AS member_count
  FROM departments d LEFT JOIN users m ON m.id = d.manager_id LEFT JOIN areas ar ON ar.id = d.area_id`;
```

Trong `mapDept` thêm trước `createdAt`: `areaId: r.area_id ?? null,` và `areaName: r.area_name ?? null,`.

- [ ] **Step 7: Sửa `server/routes/cameras.ts`**

Thêm ngay trên `function mapCamera`:

```ts
const CAMERA_SELECT = 'SELECT c.*, ar.name AS area_name FROM cameras c LEFT JOIN areas ar ON ar.id = c.area_id';
```

Trong `mapCamera` thêm trước `createdAt`: `areaId: r.area_id ?? null,` và `areaName: r.area_name ?? null,`.

Đổi các truy vấn đọc camera để trả về dòng có `area_name`:
- `listCameras`: `db.prepare(\`${CAMERA_SELECT} ORDER BY c.name\`).all()`
- Ba chỗ `db.prepare('SELECT * FROM cameras WHERE id = ?').get(…)` dùng để trả `{ camera: mapCamera(…) }` và để đọc `row` trong `PUT`: đổi thành `db.prepare(\`${CAMERA_SELECT} WHERE c.id = ?\`).get(…)`.

- [ ] **Step 8: Sửa giao diện cho đủ khóa vai trò mới (để `tsc` qua)**

`src/format.ts`:

```ts
export const ROLE_LABEL: Record<UserRole, string> = {
  hr: 'HR toàn hệ thống',
  area_admin: 'Quản trị khu vực',
  dept_manager: 'Trưởng phòng',
  employee: 'Nhân viên',
};
```

`src/App.tsx`:

```ts
const TABS_BY_ROLE: Record<User['role'], string[]> = {
  hr: ['attendance', 'requests', 'cameras', 'departments', 'employees', 'areas', 'hanet_config'],
  area_admin: ['attendance', 'requests', 'cameras', 'departments', 'employees'],
  dept_manager: ['attendance', 'requests', 'cameras', 'departments'],
  employee: ['attendance', 'requests'],
};
```

`src/components/Navbar.tsx`:

```ts
const ROLE_BADGE: Record<User['role'], string> = {
  hr: 'bg-rose-100 text-rose-700 border-rose-200',
  area_admin: 'bg-violet-100 text-violet-800 border-violet-200',
  dept_manager: 'bg-amber-100 text-amber-800 border-amber-200',
  employee: 'bg-sky-100 text-sky-800 border-sky-200',
};
```

- [ ] **Step 9: Sửa `tests/helpers.ts`**

Thay `seedDepartment` và `seedUser`, thêm `seedArea`, `contact`:

```ts
export function seedArea(db: Db, code: string, name = code): string {
  const id = newId('area');
  db.prepare('INSERT INTO areas(id, code, name, created_at) VALUES (?, ?, ?, ?)').run(id, code, name, '2026-10-14');
  return id;
}

export function seedDepartment(db: Db, code: string, name = code, areaId: string | null = null): string {
  const id = newId('dep');
  db.prepare('INSERT INTO departments(id, code, name, description, manager_id, area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    code,
    name,
    '',
    null,
    areaId,
    '2026-10-13',
  );
  return id;
}

/** Email và số điện thoại hợp lệ cho body tạo nhân sự trong test. */
export function contact(code: string): { email: string; phone: string } {
  return { email: `${code.toLowerCase()}@test.vn`, phone: '0912345678' };
}
```

Trong `SeedUserOpts` thêm:

```ts
  email?: string;
  /** Khu được giao (với area_admin) */
  adminAreaIds?: string[];
```

Trong `seedUser`: đổi câu `INSERT` để ghi email (`VALUES (?, ?, ?, ?, '', ?, …` với tham số `o.email ?? ''` ngay sau `o.name ?? o.code`), và sau câu `INSERT` thêm:

```ts
  for (const areaId of o.adminAreaIds ?? []) db.prepare('INSERT INTO admin_areas(user_id, area_id) VALUES (?, ?)').run(id, areaId);
```

Câu `INSERT` hoàn chỉnh:

```ts
  db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, ?, '', ?, ?, '', '', ?, 0, ?, ?, ?, '2026-10-13')`,
  ).run(
    id,
    o.code,
    o.name ?? o.code,
    o.email ?? '',
    o.role ?? 'employee',
    o.departmentId ?? null,
    o.hanetPersonId ?? null,
    o.status ?? 'active',
    o.password === null ? null : hashPassword(o.password ?? TEST_PASSWORD),
    o.mustChange ? 1 : 0,
  );
```

- [ ] **Step 10: Sửa chỗ dùng `ImportedUser.tempPassword`**

`server/hanet-import.ts` `importPersons`: bỏ sinh mật khẩu — tạo người với `password_hash = NULL` (người nhập từ Camera AI chưa đăng nhập được cho tới khi có email, spec mục 8):
- Bỏ import `generateTempPassword, hashPassword`.
- Câu `INSERT`: thay `?` của `password_hash` bằng `NULL` và bỏ tham số `hashPassword(tempPassword)`; giữ `must_change_password` là `1`.
- Bỏ dòng `const tempPassword = generateTempPassword();`; `return { id, code, name };`.

`tests/import.test.ts`: dòng đăng nhập bằng `r.body.created[0].tempPassword` (khoảng dòng 85) thay bằng:

```ts
    assert.equal(r.body.created[0].tempPassword, undefined, 'không còn trả mật khẩu tạm');
    const row = app.db.prepare("SELECT password_hash, email_status FROM users WHERE code = 'NV05'").get() as { password_hash: string | null; email_status: string };
    assert.deepEqual({ ...row }, { password_hash: null, email_status: 'none' });
```

(Nếu test đang kiểm `must_change_password: 1` của NV05 thì giữ nguyên.)

`src/components/ImportFromHanetModal.tsx`: bỏ hàm `downloadCsv` và bảng mật khẩu; màn hình sau khi nhập thay bằng:

```tsx
        <div className="space-y-3">
          <p className="text-emerald-700">
            Đã nhập {created.length} nhân sự. Những người này chưa có email nên chưa đăng nhập được: vào tab Nhân sự, bấm Sửa từng người để bổ sung email và số điện thoại — hệ thống sẽ tự gửi mật khẩu qua email.
          </p>
          <button type="button" onClick={onClose} className={`${primaryBtn} w-full`}>
            Đóng
          </button>
        </div>
```

(bỏ import `Download` nếu không còn dùng).

- [ ] **Step 11: Chạy toàn bộ test và lint**

Run: `npm test && npm run lint`
Expected: PASS. Nếu test nào đọc `User`/`Department`/`Camera` bằng `deepEqual` toàn bộ đối tượng mà thiếu trường mới, thêm trường mới vào giá trị mong đợi (`areaId: null, areaName: null`, …).

- [ ] **Step 12: Commit**

```bash
git add server/db.ts shared/types.ts server/repo.ts server/routes/departments.ts server/routes/cameras.ts server/hanet-import.ts src tests
git commit -m "feat(db): schema v3 with areas, area admins, email queue and reset tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lõi phân quyền theo khu (`AuthUser.areaIds`, phạm vi `areas`, `server/access.ts`)

**Files:**
- Modify: `server/auth.ts` (`AuthUser`, `findSessionUser`, `Scope`, `scopeFor`, `scopeWhere`)
- Modify: `server/repo.ts` (`canSeeUser`)
- Create: `server/access.ts`
- Test: `tests/access.test.ts` (mới), `tests/auth.test.ts` (sửa test `'scopeFor và scopeWhere'`)

**Interfaces:**
- Consumes: bảng `admin_areas`, `departments.area_id`, `cameras.area_id`, `User.areaId` (Task 1); `seedArea`, `seedDepartment(db, code, name, areaId)`, `seedUser({ adminAreaIds })` (Task 1).
- Produces (`server/auth.ts`): `AuthUser.areaIds: string[]` (khu được giao; rỗng nếu không phải `area_admin`); `Scope` thêm `{ kind: 'areas'; areaIds: string[] }`; `scopeWhere` trả `deptCol IN (SELECT id FROM departments WHERE area_id IN (?, …))` cho phạm vi `areas` (rỗng ⇒ `0=1`).
- Produces (`server/repo.ts`): `canSeeUser(viewer: AuthUser, target: { id: string; departmentId: string | null; areaId: string | null }): boolean`.
- Produces (`server/access.ts`):
  - `isSystemAdmin(u: AuthUser): boolean`, `isGlobalHr(u): boolean`, `isManager(u): boolean`
  - `requireGlobalHr: RequestHandler` (403 "Chỉ HR toàn hệ thống được thực hiện thao tác này"), `requireManager: RequestHandler` (403 "Bạn không có quyền thực hiện thao tác này")
  - `managesArea(u: AuthUser, areaId: string | null): boolean`
  - `notFound(what: string): HttpError` (404 `Không tìm thấy ${what}`)
  - `deptAreaId(db: Db, departmentId: string): string | null | undefined` (`undefined` = phòng không tồn tại)
  - `deviceAreaId(db: Db, deviceKey: string): string | null` (camera chưa có trong danh sách ⇒ `null`)
  - `type AreaFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'area'; areaId: string }`
  - `parseAreaFilter(db: Db, u: AuthUser, raw: unknown): AreaFilter`
  - `areaFilterSql(f: AreaFilter, deptCol: string): { sql: string; params: string[] }` (lọc nhân sự theo khu của phòng)
  - `areaColumnSql(f: AreaFilter, col: string): { sql: string; params: string[] }` (lọc cột `area_id` trực tiếp)
  - `departmentScopeSql(u: AuthUser): { sql: string; params: string[] }` (alias bảng phòng ban là `d`)
  - `cameraScopeSql(u: AuthUser): { sql: string; params: string[] }` (alias bảng camera là `c`)
  - `canDeleteUser(actor: AuthUser, target: User): boolean`

- [ ] **Step 1: Viết test `tests/access.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedArea, seedDepartment, seedUser } from './helpers';
import { createSession, findSessionUser, scopeFor, scopeWhere, type AuthUser } from '../server/auth';
import { canSeeUser, getUser } from '../server/repo';
import {
  areaColumnSql, areaFilterSql, canDeleteUser, cameraScopeSql, departmentScopeSql, deptAreaId, deviceAreaId, managesArea, parseAreaFilter,
} from '../server/access';

const base: AuthUser = { id: 'x', code: 'X', name: 'X', role: 'employee', departmentId: null, mustChangePassword: false, areaIds: [] };

test('findSessionUser nạp khu được giao của quản trị khu vực, mỗi request đọc lại', () => {
  const db = freshDb();
  const a = seedArea(db, 'KV01');
  const b = seedArea(db, 'KV02');
  const id = seedUser(db, { code: 'QK01', role: 'area_admin', adminAreaIds: [b, a] });
  const token = createSession(db, id, 1000);
  assert.deepEqual(findSessionUser(db, token, 2000)!.areaIds, [a, b].sort());
  db.prepare('DELETE FROM admin_areas WHERE user_id = ? AND area_id = ?').run(id, b);
  assert.deepEqual(findSessionUser(db, token, 2000)!.areaIds, [a], 'gỡ khu có hiệu lực ngay');
  const hr = seedUser(db, { code: 'HR01', role: 'hr' });
  assert.deepEqual(findSessionUser(db, createSession(db, hr, 1000), 2000)!.areaIds, []);
});

test('scopeWhere phạm vi khu: lọc theo khu của phòng ban; không có khu nào thì rỗng', () => {
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'area_admin', areaIds: ['a1', 'a2'] }), 'u.id', 'u.department_id'), {
    sql: 'u.department_id IN (SELECT id FROM departments WHERE area_id IN (?, ?))',
    params: ['a1', 'a2'],
  });
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'area_admin', areaIds: [] }), 'u.id', 'u.department_id'), { sql: '0=1', params: [] });
});

test('canSeeUser: quản trị khu chỉ thấy người thuộc khu được giao; người chưa có khu chỉ HR thấy', () => {
  const qk: AuthUser = { ...base, role: 'area_admin', areaIds: ['a1'] };
  assert.equal(canSeeUser(qk, { id: 'u', departmentId: 'd', areaId: 'a1' }), true);
  assert.equal(canSeeUser(qk, { id: 'u', departmentId: 'd', areaId: 'a2' }), false);
  assert.equal(canSeeUser(qk, { id: 'u', departmentId: null, areaId: null }), false);
  assert.equal(canSeeUser({ ...base, role: 'hr' }, { id: 'u', departmentId: null, areaId: null }), true);
});

test('managesArea và parseAreaFilter', () => {
  const db = freshDb();
  const a = seedArea(db, 'KV01');
  const b = seedArea(db, 'KV02');
  const hr: AuthUser = { ...base, role: 'hr' };
  const qk: AuthUser = { ...base, role: 'area_admin', areaIds: [a] };
  assert.equal(managesArea(hr, null), true);
  assert.equal(managesArea(qk, a), true);
  assert.equal(managesArea(qk, b), false);
  assert.equal(managesArea(qk, null), false);
  assert.equal(managesArea({ ...base, role: 'dept_manager' }, a), false);
  assert.deepEqual(parseAreaFilter(db, qk, undefined), { kind: 'all' });
  assert.deepEqual(parseAreaFilter(db, qk, 'all'), { kind: 'all' });
  assert.deepEqual(parseAreaFilter(db, qk, a), { kind: 'area', areaId: a });
  assert.deepEqual(parseAreaFilter(db, hr, 'none'), { kind: 'none' });
  for (const bad of [b, 'none', 'khong-co', 42]) {
    assert.throws(() => parseAreaFilter(db, qk, bad), (e: any) => e.status === 404, String(bad));
  }
});

test('câu lọc khu: areaFilterSql, areaColumnSql, departmentScopeSql, cameraScopeSql', () => {
  assert.deepEqual(areaFilterSql({ kind: 'all' }, 'u.department_id'), { sql: '1=1', params: [] });
  assert.deepEqual(areaFilterSql({ kind: 'area', areaId: 'a1' }, 'u.department_id'), {
    sql: 'u.department_id IN (SELECT id FROM departments WHERE area_id = ?)',
    params: ['a1'],
  });
  assert.deepEqual(areaFilterSql({ kind: 'none' }, 'u.department_id'), {
    sql: '(u.department_id IS NULL OR u.department_id IN (SELECT id FROM departments WHERE area_id IS NULL))',
    params: [],
  });
  assert.deepEqual(areaColumnSql({ kind: 'area', areaId: 'a1' }, 'c.area_id'), { sql: 'c.area_id = ?', params: ['a1'] });
  assert.deepEqual(areaColumnSql({ kind: 'none' }, 'c.area_id'), { sql: 'c.area_id IS NULL', params: [] });
  assert.deepEqual(departmentScopeSql({ ...base, role: 'hr' }), { sql: '1=1', params: [] });
  assert.deepEqual(departmentScopeSql({ ...base, role: 'area_admin', areaIds: ['a1'] }), { sql: 'd.area_id IN (?)', params: ['a1'] });
  assert.deepEqual(departmentScopeSql({ ...base, role: 'dept_manager', departmentId: 'd1' }), { sql: 'd.id = ?', params: ['d1'] });
  assert.deepEqual(departmentScopeSql({ ...base, role: 'employee', departmentId: null }), { sql: '0=1', params: [] });
  assert.deepEqual(cameraScopeSql({ ...base, role: 'area_admin', areaIds: [] }), { sql: '0=1', params: [] });
  assert.deepEqual(cameraScopeSql({ ...base, role: 'dept_manager', departmentId: 'd1' }), {
    sql: 'c.area_id IS NOT NULL AND c.area_id = (SELECT area_id FROM departments WHERE id = ?)',
    params: ['d1'],
  });
  assert.deepEqual(cameraScopeSql({ ...base, role: 'employee', departmentId: 'd1' }), { sql: '0=1', params: [] });
});

test('deptAreaId và deviceAreaId', () => {
  const db = freshDb();
  const a = seedArea(db, 'KV01');
  const d = seedDepartment(db, 'PB001', 'Kế toán', a);
  const d2 = seedDepartment(db, 'PB002');
  assert.equal(deptAreaId(db, d), a);
  assert.equal(deptAreaId(db, d2), null);
  assert.equal(deptAreaId(db, 'khong-co'), undefined);
  db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('c1', 'Cổng', 'DEV1', ?, 'x')").run(a);
  assert.equal(deviceAreaId(db, 'DEV1'), a);
  assert.equal(deviceAreaId(db, 'DEV-LA'), null);
});

test('canDeleteUser theo bảng xóa của spec', () => {
  const db = freshDb();
  const a = seedArea(db, 'KV01');
  const b = seedArea(db, 'KV02');
  const da = seedDepartment(db, 'PA', 'PA', a);
  const db2 = seedDepartment(db, 'PB', 'PB', b);
  const u = (code: string, role: AuthUser['role'], dep: string | null) => getUser(db, seedUser(db, { code, role, departmentId: dep }))!;
  const nvA = u('NVA', 'employee', da);
  const tpA = u('TPA', 'dept_manager', da);
  const nvB = u('NVB', 'employee', db2);
  const qkA = u('QKA', 'area_admin', da);
  const hr2 = u('HR02', 'hr', da);
  const admin: AuthUser = { ...base, id: 'adm', code: 'ADMIN', role: 'hr' };
  const hr: AuthUser = { ...base, id: 'hr1', code: 'HR01', role: 'hr' };
  const qk: AuthUser = { ...base, id: 'qk', code: 'QK', role: 'area_admin', areaIds: [a] };
  for (const t of [nvA, tpA, nvB, qkA, hr2]) assert.equal(canDeleteUser(admin, t), true, `ADMIN xóa ${t.code}`);
  for (const t of [nvA, tpA, nvB, qkA]) assert.equal(canDeleteUser(hr, t), true, `HR xóa ${t.code}`);
  assert.equal(canDeleteUser(hr, hr2), false, 'HR không xóa HR');
  assert.equal(canDeleteUser(qk, nvA), true);
  assert.equal(canDeleteUser(qk, tpA), true);
  assert.equal(canDeleteUser(qk, nvB), false, 'ngoài khu');
  assert.equal(canDeleteUser(qk, qkA), false, 'quản trị khu khác');
  assert.equal(canDeleteUser(qk, hr2), false);
  assert.equal(canDeleteUser({ ...hr, id: nvA.id }, nvA), false, 'không tự xóa');
  assert.equal(canDeleteUser(admin, { ...nvA, code: 'ADMIN' }), false, 'không xóa ADMIN');
});
```

Trong `tests/auth.test.ts`, test `'scopeFor và scopeWhere'`: đổi dòng khai báo `base` thành

```ts
  const base: Omit<AuthUser, 'role' | 'departmentId'> = { id: 'u1', code: 'X', name: 'X', mustChangePassword: false, areaIds: [] };
```

- [ ] **Step 2: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/access.test.ts`
Expected: FAIL — `Cannot find module '../server/access'`.

- [ ] **Step 3: Sửa `server/auth.ts`**

`AuthUser` thêm trường cuối:

```ts
  /** Khu được giao (chỉ với area_admin), đọc lại mỗi request để gỡ quyền có hiệu lực ngay. */
  areaIds: string[];
```

Trong `findSessionUser`, thay khối `return { … }` bằng:

```ts
  const areaIds =
    row.role === 'area_admin'
      ? (db.prepare('SELECT area_id FROM admin_areas WHERE user_id = ? ORDER BY area_id').all(row.id) as { area_id: string }[]).map((r) => r.area_id)
      : [];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    role: row.role,
    departmentId: row.department_id ?? null,
    mustChangePassword: row.must_change_password === 1,
    areaIds,
  };
```

Thay `Scope`, `scopeFor`, `scopeWhere`:

```ts
export type Scope =
  | { kind: 'all' }
  | { kind: 'areas'; areaIds: string[] }
  | { kind: 'department'; departmentId: string | null }
  | { kind: 'self'; userId: string };

export function scopeFor(user: AuthUser): Scope {
  if (user.role === 'hr') return { kind: 'all' };
  if (user.role === 'area_admin') return { kind: 'areas', areaIds: user.areaIds };
  if (user.role === 'dept_manager') return { kind: 'department', departmentId: user.departmentId };
  return { kind: 'self', userId: user.id };
}

export function scopeWhere(scope: Scope, userIdCol: string, deptCol: string): { sql: string; params: string[] } {
  switch (scope.kind) {
    case 'all':
      return { sql: '1=1', params: [] };
    case 'areas':
      return scope.areaIds.length
        ? { sql: `${deptCol} IN (SELECT id FROM departments WHERE area_id IN (${scope.areaIds.map(() => '?').join(', ')}))`, params: [...scope.areaIds] }
        : { sql: '0=1', params: [] };
    case 'department':
      return scope.departmentId ? { sql: `${deptCol} = ?`, params: [scope.departmentId] } : { sql: '0=1', params: [] };
    case 'self':
      return { sql: `${userIdCol} = ?`, params: [scope.userId] };
  }
}
```

- [ ] **Step 4: Sửa `server/repo.ts` `canSeeUser`**

```ts
export function canSeeUser(viewer: AuthUser, target: { id: string; departmentId: string | null; areaId: string | null }): boolean {
  const scope = scopeFor(viewer);
  if (scope.kind === 'all') return true;
  if (scope.kind === 'self') return target.id === scope.userId;
  if (scope.kind === 'areas') return target.areaId !== null && scope.areaIds.includes(target.areaId);
  return scope.departmentId !== null && target.departmentId === scope.departmentId;
}
```

- [ ] **Step 5: Tạo `server/access.ts`**

```ts
import type { RequestHandler } from 'express';
import type { Db } from './db';
import type { AuthUser } from './auth';
import { HttpError } from './errors';
import { SYSTEM_ADMIN_CODE } from './bootstrap';
import type { User } from '../shared/types';

type Sql = { sql: string; params: string[] };

export const isSystemAdmin = (u: AuthUser): boolean => u.code === SYSTEM_ADMIN_CODE;
export const isGlobalHr = (u: AuthUser): boolean => u.role === 'hr';
export const isManager = (u: AuthUser): boolean => u.role === 'hr' || u.role === 'area_admin';

function gate(ok: (u: AuthUser) => boolean, message: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !ok(req.user)) return next(new HttpError(403, message));
    next();
  };
}

/** Khu vực, cấp quyền quản trị khu, camera từ Camera AI, giờ làm việc: chỉ HR toàn hệ thống. */
export const requireGlobalHr = gate(isGlobalHr, 'Chỉ HR toàn hệ thống được thực hiện thao tác này');
/** HR toàn hệ thống hoặc quản trị khu vực; route phải tự kiểm tra đối tượng thuộc phạm vi. */
export const requireManager = gate(isManager, 'Bạn không có quyền thực hiện thao tác này');

/** Người gọi quản lý được khu này. HR toàn hệ thống: mọi khu, kể cả "chưa gán khu" (null). */
export function managesArea(u: AuthUser, areaId: string | null): boolean {
  if (isGlobalHr(u)) return true;
  return u.role === 'area_admin' && areaId !== null && u.areaIds.includes(areaId);
}

/** Đối tượng ngoài phạm vi trả 404 như không tồn tại (không lộ dữ liệu khu khác). */
export function notFound(what: string): HttpError {
  return new HttpError(404, `Không tìm thấy ${what}`);
}

export function deptAreaId(db: Db, departmentId: string): string | null | undefined {
  const row = db.prepare('SELECT area_id FROM departments WHERE id = ?').get(departmentId) as { area_id: string | null } | undefined;
  return row ? row.area_id : undefined;
}

/** Khu của camera theo mã thiết bị; camera chưa có trong danh sách web thì coi như chưa gán khu. */
export function deviceAreaId(db: Db, deviceKey: string): string | null {
  const row = db.prepare('SELECT area_id FROM cameras WHERE device_key = ?').get(deviceKey) as { area_id: string | null } | undefined;
  return row?.area_id ?? null;
}

export type AreaFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'area'; areaId: string };

/** Bộ lọc `?area=` của các API danh sách: `all` (mặc định), `none` (chỉ HR toàn hệ thống), hoặc id khu trong phạm vi. */
export function parseAreaFilter(db: Db, u: AuthUser, raw: unknown): AreaFilter {
  if (raw === undefined || raw === '' || raw === 'all') return { kind: 'all' };
  if (raw === 'none') {
    if (!isGlobalHr(u)) throw notFound('khu vực');
    return { kind: 'none' };
  }
  if (typeof raw !== 'string' || !db.prepare('SELECT 1 FROM areas WHERE id = ?').get(raw) || !managesArea(u, raw)) throw notFound('khu vực');
  return { kind: 'area', areaId: raw };
}

/** Lọc nhân sự theo khu của phòng ban (deptCol: cột phòng ban, ví dụ 'u.department_id'). */
export function areaFilterSql(f: AreaFilter, deptCol: string): Sql {
  if (f.kind === 'all') return { sql: '1=1', params: [] };
  if (f.kind === 'none') return { sql: `(${deptCol} IS NULL OR ${deptCol} IN (SELECT id FROM departments WHERE area_id IS NULL))`, params: [] };
  return { sql: `${deptCol} IN (SELECT id FROM departments WHERE area_id = ?)`, params: [f.areaId] };
}

/** Lọc trực tiếp theo cột area_id (phòng ban, camera). */
export function areaColumnSql(f: AreaFilter, col: string): Sql {
  if (f.kind === 'all') return { sql: '1=1', params: [] };
  if (f.kind === 'none') return { sql: `${col} IS NULL`, params: [] };
  return { sql: `${col} = ?`, params: [f.areaId] };
}

function inAreas(col: string, ids: string[]): Sql {
  return ids.length ? { sql: `${col} IN (${ids.map(() => '?').join(', ')})`, params: [...ids] } : { sql: '0=1', params: [] };
}

/** Phòng ban người gọi được thấy (bảng departments có alias `d`). Trưởng phòng/nhân viên: chỉ phòng của mình. */
export function departmentScopeSql(u: AuthUser): Sql {
  if (isGlobalHr(u)) return { sql: '1=1', params: [] };
  if (u.role === 'area_admin') return inAreas('d.area_id', u.areaIds);
  return u.departmentId ? { sql: 'd.id = ?', params: [u.departmentId] } : { sql: '0=1', params: [] };
}

/** Camera người gọi được thấy (bảng cameras có alias `c`). Trưởng phòng: camera thuộc khu của phòng mình. */
export function cameraScopeSql(u: AuthUser): Sql {
  if (isGlobalHr(u)) return { sql: '1=1', params: [] };
  if (u.role === 'area_admin') return inAreas('c.area_id', u.areaIds);
  if (u.role === 'dept_manager' && u.departmentId) {
    return { sql: 'c.area_id IS NOT NULL AND c.area_id = (SELECT area_id FROM departments WHERE id = ?)', params: [u.departmentId] };
  }
  return { sql: '0=1', params: [] };
}

/**
 * Bảng xóa của spec mục 5: ADMIN xóa mọi người (trừ chính ADMIN); HR toàn hệ thống xóa mọi người trừ người có vai trò hr;
 * quản trị khu xóa nhân viên/trưởng phòng trong khu mình. Không ai tự xóa mình.
 */
export function canDeleteUser(actor: AuthUser, target: User): boolean {
  if (target.id === actor.id || target.code === SYSTEM_ADMIN_CODE) return false;
  if (isSystemAdmin(actor)) return true;
  if (target.role === 'hr') return false;
  if (isGlobalHr(actor)) return true;
  return actor.role === 'area_admin' && (target.role === 'employee' || target.role === 'dept_manager') && managesArea(actor, target.areaId);
}
```

- [ ] **Step 6: Chạy test, thấy PASS**

Run: `npx tsx --test tests/access.test.ts tests/auth.test.ts`
Expected: PASS.

- [ ] **Step 7: Toàn bộ test + lint, commit**

Run: `npm test && npm run lint` — Expected: PASS (các route vẫn chạy như cũ vì `hr` vẫn là phạm vi `all`).

```bash
git add server/auth.ts server/repo.ts server/access.ts tests/access.test.ts tests/auth.test.ts
git commit -m "feat(access): area scope for area admins and shared permission helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API khu vực và `GET /auth/me` trả danh sách khu

**Files:**
- Create: `server/routes/areas.ts`
- Modify: `server/app.ts` (gắn `areaRoutes`)
- Modify: `server/routes/auth.ts` (`GET /auth/me`)
- Modify: `shared/types.ts` (`MeResponse`)
- Test: `tests/areas.test.ts` (mới)

**Interfaces:**
- Consumes: `requireGlobalHr`, `isGlobalHr`, `isSystemAdmin` (Task 2); `Area` (Task 1); `CODE_RE` (`server/validation.ts`).
- Produces:
  - `listAreasFor(db: Db, u: AuthUser): Area[]` (HR toàn hệ thống: mọi khu; quản trị khu: khu được giao; còn lại: `[]`), export từ `server/routes/areas.ts`.
  - `GET /api/areas` → `{ areas: Area[] }` (mọi người đăng nhập; kết quả theo `listAreasFor`).
  - `POST /api/areas { code?, name, note? }` → `{ area }` (HR toàn hệ thống; mã trống ⇒ `KV01`, `KV02`…).
  - `PUT /api/areas/:id { name?, note? }` → `{ area }` (HR toàn hệ thống).
  - `DELETE /api/areas/:id` → `{ success: true }` (HR toàn hệ thống; còn phòng ban/camera ⇒ 409).
  - `MeResponse` thêm `isSystemAdmin: boolean; areas: Area[]`.

- [ ] **Step 1: Viết test `tests/areas.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs } from './helpers';

test('HR toàn hệ thống tạo, sửa, xóa khu; mã tự sinh KV01, KV02', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const hr = await loginAs(app, 'HR01');
    const a = await hr.post('/api/areas', { name: 'Trụ sở 26 Đức Giang' });
    assert.equal(a.status, 200);
    assert.equal(a.body.area.code, 'KV01');
    assert.equal((await hr.post('/api/areas', { name: 'Tổng kho' })).body.area.code, 'KV02');
    assert.equal((await hr.post('/api/areas', { code: 'kv01', name: 'Trùng' })).status, 409);
    assert.equal((await hr.post('/api/areas', { name: '  ' })).status, 400);
    const put = await hr.put(`/api/areas/${a.body.area.id}`, { name: 'Trụ sở', note: 'Tòa nhà chính' });
    assert.deepEqual([put.body.area.name, put.body.area.note, put.body.area.code], ['Trụ sở', 'Tòa nhà chính', 'KV01']);
    assert.equal((await hr.del(`/api/areas/${a.body.area.id}`)).status, 200);
    assert.equal((await hr.get('/api/areas')).body.areas.length, 1);
  } finally {
    await app.close();
  }
});

test('khu còn phòng ban hoặc camera thì không xóa được (409); số liệu và quản trị khu hiển thị đúng', async () => {
  const app = await startTestApp();
  try {
    const a = seedArea(app.db, 'KV01', 'Trụ sở');
    const d = seedDepartment(app.db, 'PB001', 'Kế toán', a);
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    seedUser(app.db, { code: 'NV01', departmentId: d });
    seedUser(app.db, { code: 'QK01', name: 'Quản Trị A', role: 'area_admin', adminAreaIds: [a] });
    const hr = await loginAs(app, 'HR01');
    const list = (await hr.get('/api/areas')).body.areas;
    assert.deepEqual(
      { dc: list[0].departmentCount, cc: list[0].cameraCount, mc: list[0].memberCount, admins: list[0].adminNames },
      { dc: 1, cc: 0, mc: 1, admins: ['Quản Trị A'] },
    );
    const del = await hr.del(`/api/areas/${a}`);
    assert.equal(del.status, 409);
    app.db.prepare('UPDATE departments SET area_id = NULL').run();
    app.db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('c1', 'Cổng', 'DEV1', ?, 'x')").run(a);
    assert.equal((await hr.del(`/api/areas/${a}`)).status, 409, 'còn camera');
  } finally {
    await app.close();
  }
});

test('quản trị khu chỉ thấy khu được giao và không tạo/sửa/xóa khu; nhân viên không thấy khu nào', async () => {
  const app = await startTestApp();
  try {
    const a = seedArea(app.db, 'KV01');
    const b = seedArea(app.db, 'KV02');
    seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a] });
    seedUser(app.db, { code: 'NV01' });
    const qk = await loginAs(app, 'QK01');
    assert.deepEqual((await qk.get('/api/areas')).body.areas.map((x: { id: string }) => x.id), [a]);
    assert.equal((await qk.post('/api/areas', { name: 'X' })).status, 403);
    assert.equal((await qk.put(`/api/areas/${a}`, { name: 'X' })).status, 403);
    assert.equal((await qk.del(`/api/areas/${b}`)).status, 403);
    const me = (await qk.get('/api/auth/me')).body;
    assert.deepEqual([me.isSystemAdmin, me.areas.map((x: { id: string }) => x.id)], [false, [a]]);
    const nv = await loginAs(app, 'NV01');
    assert.deepEqual((await nv.get('/api/areas')).body.areas, []);
  } finally {
    await app.close();
  }
});

test('GET /auth/me: isSystemAdmin chỉ đúng với tài khoản ADMIN', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    assert.equal((await (await loginAs(app, 'ADMIN')).get('/api/auth/me')).body.isSystemAdmin, true);
    assert.equal((await (await loginAs(app, 'HR01')).get('/api/auth/me')).body.isSystemAdmin, false);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/areas.test.ts`
Expected: FAIL — `/api/areas` trả 404.

- [ ] **Step 3: Tạo `server/routes/areas.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError } from '../errors';
import { currentUser } from '../middleware';
import { isGlobalHr, notFound, requireGlobalHr } from '../access';
import type { AuthUser } from '../auth';
import type { Row } from '../repo';
import { CODE_RE } from '../validation';
import { SYSTEM_ADMIN_CODE } from '../bootstrap';
import { toVnDate } from '../vntime';
import type { Area } from '../../shared/types';

const AREA_SELECT = `SELECT a.id, a.code, a.name, a.note, a.created_at,
  (SELECT COUNT(*) FROM departments d WHERE d.area_id = a.id) AS department_count,
  (SELECT COUNT(*) FROM cameras c WHERE c.area_id = a.id) AS camera_count,
  (SELECT COUNT(*) FROM users u JOIN departments d ON d.id = u.department_id WHERE d.area_id = a.id AND u.code != '${SYSTEM_ADMIN_CODE}') AS member_count,
  (SELECT group_concat(u.name, '|') FROM admin_areas x JOIN users u ON u.id = x.user_id WHERE x.area_id = a.id) AS admin_names
  FROM areas a`;

function mapArea(r: Row): Area {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    note: r.note ?? '',
    departmentCount: Number(r.department_count),
    cameraCount: Number(r.camera_count),
    memberCount: Number(r.member_count),
    adminNames: r.admin_names ? String(r.admin_names).split('|').sort((x, y) => x.localeCompare(y, 'vi')) : [],
    createdAt: r.created_at,
  };
}

function getArea(db: Db, id: string): Area | null {
  const row = db.prepare(`${AREA_SELECT} WHERE a.id = ?`).get(id) as Row | undefined;
  return row ? mapArea(row) : null;
}

/** Khu người gọi được thấy: HR toàn hệ thống mọi khu, quản trị khu các khu được giao, người khác không khu nào. */
export function listAreasFor(db: Db, u: AuthUser): Area[] {
  if (isGlobalHr(u)) return (db.prepare(`${AREA_SELECT} ORDER BY a.code`).all() as Row[]).map(mapArea);
  if (u.role !== 'area_admin' || u.areaIds.length === 0) return [];
  const rows = db.prepare(`${AREA_SELECT} WHERE a.id IN (${u.areaIds.map(() => '?').join(', ')}) ORDER BY a.code`).all(...u.areaIds) as Row[];
  return rows.map(mapArea);
}

/** Mã tự sinh KV01, KV02... (tiếp sau số lớn nhất đang có). */
function nextAreaCode(db: Db): string {
  const codes = db.prepare("SELECT code FROM areas WHERE code GLOB 'KV[0-9]*'").all() as { code: string }[];
  const max = codes.reduce((m, { code }) => (/^KV\d+$/.test(code) ? Math.max(m, Number(code.slice(2))) : m), 0);
  return `KV${String(max + 1).padStart(2, '0')}`;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function areaRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/areas', (req, res) => {
    res.json({ areas: listAreasFor(db, currentUser(req)) });
  });

  r.post('/areas', requireGlobalHr, (req, res) => {
    const b = req.body ?? {};
    const code = text(b.code).toUpperCase() || nextAreaCode(db);
    const name = text(b.name);
    if (!CODE_RE.test(code)) throw new HttpError(400, 'Mã khu vực không hợp lệ');
    if (!name) throw new HttpError(400, 'Tên khu vực là bắt buộc');
    if (db.prepare('SELECT 1 FROM areas WHERE code = ?').get(code)) throw new HttpError(409, 'Mã khu vực đã tồn tại');
    const id = newId('area');
    db.prepare('INSERT INTO areas(id, code, name, note, created_at) VALUES (?, ?, ?, ?, ?)').run(id, code, name, text(b.note), toVnDate(ctx.now()));
    res.json({ area: getArea(db, id) });
  });

  r.put('/areas/:id', requireGlobalHr, (req, res) => {
    const area = getArea(db, req.params.id);
    if (!area) throw notFound('khu vực');
    const b = req.body ?? {};
    const name = b.name === undefined ? area.name : text(b.name);
    if (!name) throw new HttpError(400, 'Tên khu vực là bắt buộc');
    db.prepare('UPDATE areas SET name = ?, note = ? WHERE id = ?').run(name, b.note === undefined ? area.note : text(b.note), area.id);
    res.json({ area: getArea(db, area.id) });
  });

  r.delete('/areas/:id', requireGlobalHr, (req, res) => {
    const area = getArea(db, req.params.id);
    if (!area) throw notFound('khu vực');
    if (area.departmentCount > 0 || area.cameraCount > 0) {
      throw new HttpError(409, 'Khu vực còn phòng ban hoặc camera: hãy chuyển sang khu khác trước khi xóa');
    }
    db.prepare('DELETE FROM areas WHERE id = ?').run(area.id);
    console.warn(`[SECURITY] area_deleted by=${currentUser(req).code} target=${area.code} ip=${req.ip}`);
    res.json({ success: true });
  });

  return r;
}
```

- [ ] **Step 4: Gắn route và mở rộng `/auth/me`**

`server/app.ts`: `import { areaRoutes } from './routes/areas';` và thêm `api.use(areaRoutes(ctx));` ngay sau `api.use(departmentRoutes(ctx));`.

`shared/types.ts`, `MeResponse`:

```ts
export interface MeResponse {
  user: User;
  mustChangePassword: boolean;
  simulatorEnabled: boolean;
  isSystemAdmin: boolean; // tài khoản ADMIN: được sửa cấu hình kỹ thuật
  areas: Area[]; // khu người này được thấy (bộ chọn khu)
}
```

`server/routes/auth.ts`: import `isSystemAdmin` từ `'../access'` và `listAreasFor` từ `'./areas'`; trong `GET /auth/me`:

```ts
    const body: MeResponse = {
      user,
      mustChangePassword: auth.mustChangePassword,
      simulatorEnabled: ctx.config.simulatorEnabled,
      isSystemAdmin: isSystemAdmin(auth),
      areas: listAreasFor(db, auth),
    };
```

- [ ] **Step 5: Chạy test, thấy PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/areas.test.ts && npm test && npm run lint`
Expected: PASS.

```bash
git add server/routes/areas.ts server/app.ts server/routes/auth.ts shared/types.ts tests/areas.test.ts
git commit -m "feat(areas): area CRUD for global HR and area list in /auth/me

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Áp phạm vi khu cho các API đọc và bộ lọc `?area=`

**Files:**
- Modify: `server/routes/users.ts` (`GET /users`)
- Modify: `server/routes/departments.ts` (`GET /departments`)
- Modify: `server/routes/cameras.ts` (`GET /cameras`)
- Modify: `server/routes/attendance.ts` (`GET /attendance`, `GET /attendance/:userId/:date/detections`, `GET /detections/:id/video`, `GET /stats`, `GET /stats/details`)
- Modify: `server/routes/requests.ts` (`GET /requests`)
- Modify: `server/routes/hanet.ts` (`GET /hanet/sightings`)
- Test: `tests/area-scope.test.ts` (mới)

**Interfaces:**
- Consumes: `parseAreaFilter`, `areaFilterSql`, `areaColumnSql`, `departmentScopeSql`, `cameraScopeSql`, `managesArea`, `deviceAreaId`, `notFound`, `requireManager`, `isGlobalHr` (Task 2); `canSeeUser` mới (Task 2).
- Produces: các API danh sách nhận `?area=all|none|<areaId>`; quản trị khu xem lượt quẹt/video người ngoài khu ⇒ 404; trưởng phòng/nhân viên ngoài phạm vi vẫn 403 như cũ; `Detection.hasVideo` true cho `hr`, `area_admin`, `dept_manager`.

- [ ] **Step 1: Viết test `tests/area-scope.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, addDetection, type TestApp } from './helpers';
import { recordSighting } from '../server/sightings';

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01', 'Trụ sở');
  const B = seedArea(app.db, 'KV02', 'Tổng kho');
  const pa = seedDepartment(app.db, 'PA', 'Phòng A', A);
  const pb = seedDepartment(app.db, 'PB', 'Phòng B', B);
  const pn = seedDepartment(app.db, 'PN', 'Phòng chưa gán khu');
  const ids: Record<string, string> = {
    A, B, pa, pb, pn,
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    qkA: seedUser(app.db, { code: 'QKA', role: 'area_admin', adminAreaIds: [A] }),
    qkAB: seedUser(app.db, { code: 'QKAB', role: 'area_admin', adminAreaIds: [A, B] }),
    tpA: seedUser(app.db, { code: 'TPA', role: 'dept_manager', departmentId: pa }),
    nvA: seedUser(app.db, { code: 'NVA', departmentId: pa }),
    nvB: seedUser(app.db, { code: 'NVB', departmentId: pb }),
    nvN: seedUser(app.db, { code: 'NVN', departmentId: pn }),
  };
  app.db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('camA', 'Cổng A', 'DEVA', ?, 'x'), ('camB', 'Cổng B', 'DEVB', ?, 'x'), ('camN', 'Cổng N', 'DEVN', NULL, 'x')").run(A, B);
  const now = Date.now();
  // NVA quẹt ở camera khu B: vẫn tính cho khu A (khu của phòng)
  addDetection(app.db, ids.nvA, now, { deviceId: 'DEVB' });
  addDetection(app.db, ids.nvB, now, { deviceId: 'DEVB' });
  ids.detA = String((app.db.prepare('SELECT id FROM detections WHERE user_id = ?').get(ids.nvA) as { id: number }).id);
  ids.detB = String((app.db.prepare('SELECT id FROM detections WHERE user_id = ?').get(ids.nvB) as { id: number }).id);
  for (const code of ['NVA', 'NVB']) {
    const c = await loginAs(app, code);
    await c.post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' });
  }
  return { app, ids };
}

const codes = (rows: { code?: string; employeeCode?: string }[]) => rows.map((r) => r.code ?? r.employeeCode).sort();

test('danh sách nhân sự, phòng ban, camera theo khu; bộ lọc ?area=', async () => {
  const { app, ids } = await setup();
  try {
    const qkA = await loginAs(app, 'QKA');
    assert.deepEqual(codes((await qkA.get('/api/users')).body.users), ['NVA', 'TPA']);
    assert.deepEqual(codes((await qkA.get('/api/departments')).body.departments), ['PA']);
    assert.deepEqual((await qkA.get('/api/cameras')).body.cameras.map((c: { deviceKey: string }) => c.deviceKey), ['DEVA']);
    assert.equal((await qkA.get(`/api/users?area=${ids.B}`)).status, 404);
    assert.equal((await qkA.get('/api/users?area=none')).status, 404);

    const qkAB = await loginAs(app, 'QKAB');
    assert.deepEqual(codes((await qkAB.get('/api/users')).body.users), ['NVA', 'NVB', 'TPA']);
    assert.deepEqual(codes((await qkAB.get(`/api/users?area=${ids.B}`)).body.users), ['NVB']);

    const hr = await loginAs(app, 'HR01');
    assert.deepEqual(codes((await hr.get('/api/users?area=none')).body.users), ['HR01', 'NVN', 'QKA', 'QKAB']);
    assert.deepEqual((await hr.get('/api/cameras?area=none')).body.cameras.map((c: { deviceKey: string }) => c.deviceKey), ['DEVN']);
    assert.deepEqual(codes((await hr.get(`/api/departments?area=${ids.A}`)).body.departments), ['PA']);

    const tpA = await loginAs(app, 'TPA');
    assert.deepEqual(codes((await tpA.get('/api/departments')).body.departments), ['PA']);
    assert.deepEqual((await tpA.get('/api/cameras')).body.cameras.map((c: { deviceKey: string }) => c.deviceKey), ['DEVA']);
    const nvA = await loginAs(app, 'NVA');
    assert.deepEqual((await nvA.get('/api/cameras')).body.cameras, []);
  } finally {
    await app.close();
  }
});

test('bảng công, thống kê, đơn: tính theo khu của nhân sự, kể cả quẹt ở camera khu khác', async () => {
  const { app, ids } = await setup();
  try {
    const qkA = await loginAs(app, 'QKA');
    assert.deepEqual(codes((await qkA.get('/api/attendance')).body.records), ['NVA']);
    const stats = (await qkA.get('/api/stats')).body;
    assert.deepEqual([stats.totalEmployees, stats.presentCount, stats.pendingRequests, stats.totalCameras], [2, 1, 1, 1]);
    assert.deepEqual(codes((await qkA.get('/api/stats/details?type=present')).body.rows), ['NVA']);
    assert.deepEqual((await qkA.get('/api/requests')).body.requests.map((r: { employeeCode: string }) => r.employeeCode), ['NVA']);
    const hr = await loginAs(app, 'HR01');
    assert.deepEqual(codes((await hr.get(`/api/attendance?area=${ids.B}`)).body.records), ['NVB']);
    assert.equal((await hr.get(`/api/stats?area=${ids.B}`)).body.totalCameras, 1);
  } finally {
    await app.close();
  }
});

test('lượt quẹt và video: quản trị khu ngoài khu nhận 404; trong khu qua được kiểm tra phạm vi', async () => {
  const { app, ids } = await setup();
  try {
    const qkA = await loginAs(app, 'QKA');
    const day = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const mine = await qkA.get(`/api/attendance/${ids.nvA}/${day}/detections`);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.detections[0].hasVideo, true);
    assert.equal((await qkA.get(`/api/attendance/${ids.nvB}/${day}/detections`)).status, 404);
    assert.equal((await qkA.get(`/api/detections/${ids.detB}/video`)).status, 404);
    // Trong khu: qua phạm vi, dừng ở bước "chưa cấu hình tài khoản xem video" (400)
    assert.equal((await qkA.get(`/api/detections/${ids.detA}/video`)).status, 400);
  } finally {
    await app.close();
  }
});

test('ảnh người lạ: quản trị khu chỉ thấy ảnh từ camera thuộc khu mình', async () => {
  const { app } = await setup();
  try {
    const now = Date.now();
    for (const deviceId of ['DEVA', 'DEVB', 'DEVN']) {
      recordSighting(app.db, { kind: 'stranger', personId: null, aliasId: null, personName: null, deviceId, deviceName: deviceId, ts: now, imageUrl: `https://x/${deviceId}.jpg` }, now);
    }
    const qkA = await loginAs(app, 'QKA');
    assert.deepEqual((await qkA.get('/api/hanet/sightings')).body.sightings.map((s: { deviceId: string }) => s.deviceId), ['DEVA']);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.get('/api/hanet/sightings')).body.sightings.length, 3);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/area-scope.test.ts`
Expected: FAIL — quản trị khu thấy rỗng/403 ở nhiều chỗ.

- [ ] **Step 3: `GET /users`** (`server/routes/users.ts`)

Import thêm `parseAreaFilter, areaFilterSql` từ `'../access'`.

```ts
  r.get('/users', (req, res) => {
    const actor = currentUser(req);
    const w = scopeWhere(scopeFor(actor), 'u.id', 'u.department_id');
    const f = areaFilterSql(parseAreaFilter(db, actor, req.query.area), 'u.department_id');
    const rows = db
      .prepare(`${USER_SELECT} WHERE ${NOT_SYSTEM_ADMIN} AND ${w.sql} AND ${f.sql} ORDER BY u.code`)
      .all(...w.params, ...f.params) as Row[];
    res.json({ users: rows.map(mapUser) });
  });
```

- [ ] **Step 4: `GET /departments`** (`server/routes/departments.ts`)

Import `currentUser` (đã có), `departmentScopeSql, areaColumnSql, parseAreaFilter` từ `'../access'`.

```ts
  r.get('/departments', (req, res) => {
    const actor = currentUser(req);
    const s = departmentScopeSql(actor);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), 'd.area_id');
    const rows = db.prepare(`${DEPT_SELECT} WHERE ${s.sql} AND ${f.sql} ORDER BY d.code`).all(...s.params, ...f.params) as Row[];
    res.json({ departments: rows.map(mapDept) });
  });
```

- [ ] **Step 5: `GET /cameras`** (`server/routes/cameras.ts`)

Import `currentUser` từ `'../middleware'`, `cameraScopeSql, areaColumnSql, parseAreaFilter` từ `'../access'`. `listCameras` (dùng cho phản hồi nhập/làm mới của HR toàn hệ thống) giữ nguyên.

```ts
  r.get('/cameras', (req, res) => {
    const actor = currentUser(req);
    const s = cameraScopeSql(actor);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), 'c.area_id');
    const rows = db.prepare(`${CAMERA_SELECT} WHERE ${s.sql} AND ${f.sql} ORDER BY c.name`).all(...s.params, ...f.params) as Row[];
    res.json({ cameras: rows.map(mapCamera) });
  });
```

- [ ] **Step 6: `server/routes/attendance.ts`**

Import `areaFilterSql, areaColumnSql, cameraScopeSql, notFound, parseAreaFilter` từ `'../access'`; thêm `import type { AuthUser } from '../auth';`.

Thêm hàm trên `attendanceRoutes`:

```ts
/** Không được xem người này: quản trị khu nhận 404 (không lộ dữ liệu khu khác), vai trò khác 403 như trước. */
function denySee(viewer: AuthUser): HttpError {
  return viewer.role === 'area_admin' ? notFound('nhân sự') : new HttpError(403, 'Bạn không có quyền xem dữ liệu này');
}
```

`GET /attendance`: sau dòng `const w = scopeWhere(...)` thêm `const f = areaFilterSql(parseAreaFilter(db, user, req.query.area), 'u.department_id');`; đổi câu SQL thành `` `${DAY_SELECT} WHERE a.work_date = ? AND ${w.sql} AND ${f.sql}` `` và `params` thành `[date, ...w.params, ...f.params]`; điều kiện lọc phòng ban đổi `user.role === 'hr'` thành `(user.role === 'hr' || user.role === 'area_admin')`.

`GET /attendance/:userId/:date/detections`:

```ts
  r.get('/attendance/:userId/:date/detections', (req, res) => {
    const viewer = currentUser(req);
    const target = getUser(db, req.params.userId);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    if (!canSeeUser(viewer, target)) throw denySee(viewer);
    if (!isValidDate(req.params.date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const rows = db
      .prepare('SELECT id, device_id, device_name, place_id, ts, work_date, image_url, source FROM detections WHERE user_id = ? AND work_date = ? ORDER BY ts')
      .all(target.id, req.params.date) as Row[];
    const canWatch = viewer.role === 'hr' || viewer.role === 'area_admin' || viewer.role === 'dept_manager';
```

(phần còn lại giữ nguyên).

`GET /detections/:id/video`: đổi `requireRole('hr', 'dept_manager')` thành `requireRole('hr', 'area_admin', 'dept_manager')`; đổi dòng kiểm tra quyền thành:

```ts
      const viewer = currentUser(req);
      const target = getUser(db, det.user_id);
      if (!target) throw new HttpError(404, 'Không tìm thấy lượt nhận diện');
      if (!canSeeUser(viewer, target)) throw denySee(viewer);
```

`GET /stats`:

```ts
  r.get('/stats', (req, res) => {
    const actor = currentUser(req);
    const filter = parseAreaFilter(db, actor, req.query.area);
    const w = scopeWhere(scopeFor(actor), 'u.id', 'u.department_id');
    const f = areaFilterSql(filter, 'u.department_id');
    const where = `${w.sql} AND ${f.sql}`;
    const params = [...w.params, ...f.params];
    const date = toVnDate(ctx.now());
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where}`).get(...params) as { c: number };
    const day = db
      .prepare(
        `SELECT COUNT(*) AS present,
           SUM(CASE WHEN a.late_minutes = 0 THEN 1 ELSE 0 END) AS on_time,
           SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late,
           SUM(CASE WHEN a.status = 'missing_out' THEN 1 ELSE 0 END) AS missing_out
         FROM attendance_days a JOIN users u ON u.id = a.user_id
         WHERE a.work_date = ? AND u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where}`,
      )
      .get(date, ...params) as { present: number; on_time: number | null; late: number | null; missing_out: number | null };
    const pending = db
      .prepare(`SELECT COUNT(*) AS c FROM requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' AND ${where}`)
      .get(...params) as { c: number };
    const cs = cameraScopeSql(actor);
    const cf = areaColumnSql(filter, 'c.area_id');
    const cameras = db.prepare(`SELECT COUNT(*) AS c FROM cameras c WHERE ${cs.sql} AND ${cf.sql}`).get(...cs.params, ...cf.params) as { c: number };
```

(phần dựng `body` giữ nguyên).

`GET /stats/details`: sau `const w = scopeWhere(...)` thêm `const f = areaFilterSql(parseAreaFilter(db, currentUser(req), req.query.area), 'u.department_id');`, thêm `AND ${f.sql}` sau `AND ${w.sql}` trong SQL và `...f.params` sau `...w.params` trong `.all(...)`.

- [ ] **Step 7: `GET /requests`** (`server/routes/requests.ts`)

```ts
  r.get('/requests', (req, res) => {
    const actor = currentUser(req);
    const w = scopeWhere(scopeFor(actor), 'u.id', 'u.department_id');
    const f = areaFilterSql(parseAreaFilter(db, actor, req.query.area), 'u.department_id');
    const rows = db.prepare(`${REQUEST_SELECT} WHERE ${w.sql} AND ${f.sql} ORDER BY r.created_at DESC`).all(...w.params, ...f.params) as Row[];
    res.json({ requests: rows.map(mapRequest) });
  });
```

(import `areaFilterSql, parseAreaFilter` từ `'../access'`).

- [ ] **Step 8: `GET /hanet/sightings`** (`server/routes/hanet.ts`)

Import `requireManager, isGlobalHr, managesArea, deviceAreaId` từ `'../access'`.

```ts
  r.get('/hanet/sightings', requireManager, (req, res) => {
    const actor = currentUser(req);
    const kind = req.query.kind;
    if (kind !== undefined && kind !== 'stranger' && kind !== 'unlinked') throw new HttpError(400, 'Loại lượt chụp không hợp lệ');
    const all = listSightings(db, ctx.now(), kind as SightingKind | undefined);
    // Quản trị khu chỉ thấy ảnh chụp từ camera thuộc khu mình
    const sightings = isGlobalHr(actor) ? all : all.filter((s) => managesArea(actor, deviceAreaId(db, s.deviceId)));
    res.json({ sightings });
  });
```

- [ ] **Step 9: Chạy test, thấy PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/area-scope.test.ts && npm test && npm run lint`
Expected: PASS. (Test cũ `sightings.test.ts` "nhân viên 403" vẫn đúng vì `requireManager` trả 403.)

```bash
git add server/routes tests/area-scope.test.ts
git commit -m "feat(scope): area-scoped lists, attendance, stats, requests and sightings with ?area= filter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Áp phạm vi khu cho các thao tác ghi (nhân sự, phòng ban, camera, đơn, xóa)

**Files:**
- Modify: `server/access.ts` (thêm `resolveAreaFor`)
- Modify: `server/routes/users.ts` (POST, PUT, reset-password, face, face-candidates, import, DELETE)
- Modify: `server/routes/departments.ts` (POST, PUT, DELETE, `resolveManager`)
- Modify: `server/routes/cameras.ts` (POST, import, refresh-status, PUT, DELETE)
- Modify: `server/routes/requests.ts` (PUT)
- Test: `tests/area-writes.test.ts` (mới); sửa `tests/users-routes.test.ts` (hai test xóa)

**Interfaces:**
- Consumes: `requireManager`, `requireGlobalHr`, `managesArea`, `notFound`, `deptAreaId`, `deviceAreaId`, `canDeleteUser`, `isGlobalHr`, `isSystemAdmin` (Task 2).
- Produces:
  - `resolveAreaFor(db: Db, u: AuthUser, raw: unknown): string | null` trong `server/access.ts` (khu phải tồn tại và trong phạm vi ⇒ không thì 404; quản trị khu để trống ⇒ 400 "Hãy chọn khu vực").
  - Body mới: `POST/PUT /api/users` nhận `adminAreaIds: string[]` khi `role = 'area_admin'`; `POST/PUT /api/departments` và `POST/PUT /api/cameras` nhận `areaId`.
  - Trong `server/routes/users.ts` (nội bộ, Task 8 dùng tiếp): `manageableUser(db, actor, id): User`, `assertCanEdit(actor, target)`, `assertRoleAllowed(actor, role)`, `resolveDepartmentFor(db, actor, departmentId): string | null`, `parseAdminAreaIds(db, raw): string[]`, `setAdminAreas(db, userId, areaIds)`.

- [ ] **Step 1: Viết test `tests/area-writes.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, type TestApp } from './helpers';

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const pa = seedDepartment(app.db, 'PA', 'Phòng A', A);
  const pb = seedDepartment(app.db, 'PB', 'Phòng B', B);
  const ids: Record<string, string> = {
    A, B, pa, pb,
    admin: seedUser(app.db, { code: 'ADMIN', role: 'hr' }),
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    hr2: seedUser(app.db, { code: 'HR02', role: 'hr', departmentId: pa }),
    qkA: seedUser(app.db, { code: 'QKA', role: 'area_admin', departmentId: pa, adminAreaIds: [A] }),
    qkA2: seedUser(app.db, { code: 'QKA2', role: 'area_admin', departmentId: pa, adminAreaIds: [A] }),
    nvA: seedUser(app.db, { code: 'NVA', departmentId: pa }),
    nvB: seedUser(app.db, { code: 'NVB', departmentId: pb }),
  };
  app.db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('camA', 'Cổng A', 'DEVA', ?, 'x'), ('camB', 'Cổng B', 'DEVB', ?, 'x')").run(A, B);
  return { app, ids };
}

const deptOf = (app: TestApp, id: string) => (app.db.prepare('SELECT department_id, role FROM users WHERE id = ?').get(id) as { department_id: string; role: string });

test('quản trị khu tạo nhân sự: chỉ phòng trong khu, bắt buộc phòng ban, không cấp HR/quản trị khu', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.post('/api/users', { code: 'NV10', name: 'X', departmentId: ids.pa })).status, 200);
    assert.equal((await qk.post('/api/users', { code: 'NV11', name: 'X', departmentId: ids.pb })).status, 404);
    assert.equal((await qk.post('/api/users', { code: 'NV12', name: 'X' })).status, 400);
    assert.equal((await qk.post('/api/users', { code: 'NV13', name: 'X', departmentId: ids.pa, role: 'hr' })).status, 403);
    assert.equal((await qk.post('/api/users', { code: 'NV14', name: 'X', departmentId: ids.pa, role: 'area_admin', adminAreaIds: [ids.A] })).status, 403);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM users WHERE code IN ('NV11','NV12','NV13','NV14')").get()!.c, 0);
  } finally {
    await app.close();
  }
});

test('quản trị khu sửa nhân sự: ngoài khu 404; không chuyển ra khỏi khu; không nâng vai trò; không sửa quản trị khu khác', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.put(`/api/users/${ids.nvB}`, { name: 'Y' })).status, 404);
    assert.equal((await qk.put(`/api/users/${ids.nvA}`, { departmentId: ids.pb })).status, 404);
    assert.equal(deptOf(app, ids.nvA).department_id, ids.pa, 'không đổi');
    assert.equal((await qk.put(`/api/users/${ids.nvA}`, { role: 'hr' })).status, 403);
    assert.equal((await qk.put(`/api/users/${ids.nvA}`, { role: 'area_admin', adminAreaIds: [ids.A] })).status, 403);
    assert.equal(deptOf(app, ids.nvA).role, 'employee');
    assert.equal((await qk.put(`/api/users/${ids.qkA2}`, { name: 'Y' })).status, 403);
    assert.equal((await qk.put(`/api/users/${ids.hr2}`, { name: 'Y' })).status, 403);
    assert.equal((await qk.put(`/api/users/${ids.nvA}`, { name: 'Tên mới', role: 'dept_manager' })).status, 200);
    // tự sửa: được đổi tên, không đổi phòng ban
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { name: 'Tôi' })).status, 200);
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { departmentId: ids.pb })).status, 400);
    assert.equal((await qk.post(`/api/users/${ids.nvB}/reset-password`)).status, 404);
    assert.equal((await qk.get(`/api/users/${ids.nvB}/face-candidates`)).status, 404);
  } finally {
    await app.close();
  }
});

test('cấp quyền quản trị khu: chỉ HR toàn hệ thống; vai trò HR chỉ ADMIN cấp; đổi vai trò thì bỏ khu được giao', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { role: 'area_admin' })).status, 400, 'thiếu khu');
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { role: 'area_admin', adminAreaIds: ['khong-co'] })).status, 400);
    const r = await hr.put(`/api/users/${ids.nvA}`, { role: 'area_admin', adminAreaIds: [ids.A, ids.B] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.user.adminAreaIds, [ids.A, ids.B].sort());
    const back = await hr.put(`/api/users/${ids.nvA}`, { role: 'employee' });
    assert.deepEqual(back.body.user.adminAreaIds, []);
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { role: 'hr' })).status, 403);
    assert.equal((await hr.put(`/api/users/${ids.hr2}`, { name: 'Y' })).status, 403, 'chỉ ADMIN sửa HR');
    const admin = await loginAs(app, 'ADMIN');
    assert.equal((await admin.put(`/api/users/${ids.nvA}`, { role: 'hr' })).status, 200);
    assert.equal((await admin.put(`/api/users/${ids.hr2}`, { name: 'Y' })).status, 200);
  } finally {
    await app.close();
  }
});

test('xóa nhân sự theo bảng của spec', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.del(`/api/users/${ids.nvB}`)).status, 404);
    assert.equal((await qk.del(`/api/users/${ids.qkA2}`)).status, 403);
    assert.equal((await qk.del(`/api/users/${ids.hr2}`)).status, 403);
    assert.equal((await qk.del(`/api/users/${ids.nvA}`)).status, 200);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.del(`/api/users/${ids.hr2}`)).status, 403);
    assert.equal((await hr.del(`/api/users/${ids.admin}`)).status, 404);
    assert.equal((await hr.del(`/api/users/${ids.qkA2}`)).status, 200);
    assert.equal((await hr.del(`/api/users/${ids.nvB}`)).status, 200);
    const admin = await loginAs(app, 'ADMIN');
    assert.equal((await admin.del(`/api/users/${ids.hr2}`)).status, 200);
  } finally {
    await app.close();
  }
});

test('phòng ban: quản trị khu tạo/sửa/xóa trong khu; không tạo ngoài khu, không chuyển ra ngoài khu', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.post('/api/departments', { name: 'X' })).status, 400);
    assert.equal((await qk.post('/api/departments', { name: 'X', areaId: ids.B })).status, 404);
    const c = await qk.post('/api/departments', { name: 'Phòng mới', areaId: ids.A });
    assert.equal(c.status, 200);
    assert.equal(c.body.department.areaId, ids.A);
    assert.equal((await qk.put(`/api/departments/${ids.pb}`, { name: 'Y' })).status, 404);
    assert.equal((await qk.put(`/api/departments/${ids.pa}`, { areaId: ids.B })).status, 404);
    assert.equal((await qk.put(`/api/departments/${ids.pa}`, { areaId: null })).status, 400);
    assert.equal((await qk.put(`/api/departments/${ids.pa}`, { managerId: ids.nvB })).status, 404);
    assert.equal((await qk.del(`/api/departments/${ids.pb}`)).status, 404);
    assert.equal((await qk.del(`/api/departments/${c.body.department.id}`)).status, 200);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { areaId: ids.B })).status, 200);
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { areaId: null })).status, 200, 'HR được bỏ gán khu');
    assert.equal((await hr.del(`/api/departments/${ids.pb}`)).status, 200);
  } finally {
    await app.close();
  }
});

test('camera: quản trị khu sửa/xóa camera trong khu; thêm tay, nhập, làm mới chỉ HR toàn hệ thống', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.put('/api/cameras/camB', { name: 'Y' })).status, 404);
    assert.equal((await qk.put('/api/cameras/camA', { areaId: ids.B })).status, 404);
    const r = await qk.put('/api/cameras/camA', { name: 'Cổng chính A' });
    assert.equal(r.status, 200);
    assert.equal(r.body.camera.areaId, ids.A);
    assert.equal((await qk.post('/api/cameras', { name: 'X', deviceKey: 'K9' })).status, 403);
    assert.equal((await qk.post('/api/cameras/import', {})).status, 403);
    assert.equal((await qk.post('/api/cameras/refresh-status', {})).status, 403);
    assert.equal((await qk.del('/api/cameras/camB')).status, 404);
    assert.equal((await qk.del('/api/cameras/camA')).status, 200);
    const hr = await loginAs(app, 'HR01');
    const add = await hr.post('/api/cameras', { name: 'Kho', deviceKey: 'K10', areaId: ids.B });
    assert.equal(add.body.camera.areaId, ids.B);
    assert.equal((await hr.put('/api/cameras/camB', { areaId: ids.A })).body.camera.areaId, ids.A);
  } finally {
    await app.close();
  }
});

test('đơn: quản trị khu duyệt đơn trong khu, đơn ngoài khu 404', async () => {
  const { app } = await setup();
  try {
    const mk = async (code: string) => (await (await loginAs(app, code)).post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' })).body.request.id;
    const ra = await mk('NVA');
    const rb = await mk('NVB');
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.put(`/api/requests/${rb}`, { status: 'approved' })).status, 404);
    assert.equal((await qk.put(`/api/requests/${ra}`, { status: 'approved' })).status, 200);
  } finally {
    await app.close();
  }
});

test('nhập từ Camera AI: quản trị khu phải chọn phòng trong khu', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.post('/api/users/import', { persons: [{ personId: 'P1' }] })).status, 400);
    assert.equal((await qk.post('/api/users/import', { persons: [{ personId: 'P1' }], departmentId: ids.pb })).status, 404);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/area-writes.test.ts`
Expected: FAIL — quản trị khu nhận 403 ở các route `requireRole('hr')`.

- [ ] **Step 3: Thêm `resolveAreaFor` vào `server/access.ts`**

```ts
/** Khu cho phòng ban/camera: phải tồn tại và trong phạm vi (không thì 404); quản trị khu không được để "chưa gán khu". */
export function resolveAreaFor(db: Db, u: AuthUser, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') {
    if (u.role === 'area_admin') throw new HttpError(400, 'Hãy chọn khu vực');
    return null;
  }
  if (typeof raw !== 'string' || !db.prepare('SELECT 1 FROM areas WHERE id = ?').get(raw) || !managesArea(u, raw)) throw notFound('khu vực');
  return raw;
}
```

- [ ] **Step 4: `server/routes/users.ts` — trợ giúp phân quyền**

Import thêm:

```ts
import { tx } from '../db';
import type { AuthUser } from '../auth';
import {
  areaFilterSql, canDeleteUser, deptAreaId, deviceAreaId, isGlobalHr, isSystemAdmin, managesArea, notFound, parseAreaFilter, requireManager,
} from '../access';
import type { User } from '../../shared/types';
```

Đổi `const ROLES: UserRole[] = ['hr', 'dept_manager', 'employee'];` thành `const ROLES: UserRole[] = ['hr', 'area_admin', 'dept_manager', 'employee'];`.

Thêm sau `resolveDepartment`:

```ts
/** Nhân sự người gọi được quản lý (chính mình luôn được). Ngoài phạm vi, hoặc tài khoản ADMIN với người khác ADMIN ⇒ 404. */
function manageableUser(db: Db, actor: AuthUser, id: string): User {
  const u = getUser(db, id);
  if (!u || (u.code === SYSTEM_ADMIN_CODE && !isSystemAdmin(actor))) throw notFound('nhân sự');
  if (u.id !== actor.id && !managesArea(actor, u.areaId)) throw notFound('nhân sự');
  return u;
}

/** Chỉ ADMIN sửa người có vai trò hr; quản trị khu không sửa quản trị khu khác. Tự sửa mình luôn qua bước này. */
function assertCanEdit(actor: AuthUser, target: User): void {
  if (target.id === actor.id) return;
  if (target.role === 'hr' && !isSystemAdmin(actor)) throw new HttpError(403, 'Chỉ tài khoản ADMIN được sửa tài khoản HR toàn hệ thống');
  if (actor.role === 'area_admin' && target.role === 'area_admin') throw new HttpError(403, 'Bạn không có quyền sửa tài khoản quản trị khu vực khác');
}

function assertRoleAllowed(actor: AuthUser, role: unknown): asserts role is UserRole {
  if (!ROLES.includes(role as UserRole)) throw new HttpError(400, 'Vai trò không hợp lệ');
  if (role === 'hr' && !isSystemAdmin(actor)) throw new HttpError(403, 'Chỉ tài khoản ADMIN được cấp vai trò HR toàn hệ thống');
  if (role === 'area_admin' && !isGlobalHr(actor)) throw new HttpError(403, 'Chỉ HR toàn hệ thống được cấp quyền quản trị khu vực');
}

/** Phòng ban cho nhân sự: phải thuộc khu người gọi quản lý; quản trị khu bắt buộc chọn. */
function resolveDepartmentFor(db: Db, actor: AuthUser, departmentId: unknown): string | null {
  const id = resolveDepartment(db, departmentId);
  if (id === null) {
    if (actor.role === 'area_admin') throw new HttpError(400, 'Hãy chọn phòng ban thuộc khu bạn quản lý');
    return null;
  }
  if (!managesArea(actor, deptAreaId(db, id) ?? null)) throw notFound('phòng ban');
  return id;
}

function parseAdminAreaIds(db: Db, raw: unknown): string[] {
  const ids = Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
  if (ids.length === 0) throw new HttpError(400, 'Hãy chọn ít nhất một khu cho quản trị khu vực');
  for (const id of ids) if (!db.prepare('SELECT 1 FROM areas WHERE id = ?').get(id)) throw new HttpError(400, 'Khu vực không tồn tại');
  return ids;
}

function setAdminAreas(db: Db, userId: string, areaIds: string[]): void {
  db.prepare('DELETE FROM admin_areas WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT INTO admin_areas(user_id, area_id) VALUES (?, ?)');
  for (const id of areaIds) ins.run(userId, id);
}
```

Đổi `resolveFaceImage` nhận thêm `actor` và lọc ảnh người lạ theo khu camera:

```ts
function resolveFaceImage(db: Db, actor: AuthUser, userId: string | null, b: Record<string, unknown>, now: number): { url: string; sightingId: number | null } | null {
  if (b.sightingId !== undefined && b.sightingId !== null && b.sightingId !== '') {
    const s = getSighting(db, Number(b.sightingId));
    if (!s || !managesArea(actor, deviceAreaId(db, s.deviceId))) throw new HttpError(404, 'Không tìm thấy lượt chụp này, hãy chọn lượt mới hơn');
    return { url: s.imageUrl, sightingId: s.id };
  }
```

(phần `detectionId` giữ nguyên.)

- [ ] **Step 5: `server/routes/users.ts` — các route**

`POST /users/import`: đổi `requireRole('hr')` thành `requireManager`; đổi `const departmentId = resolveDepartment(db, b.departmentId);` thành `const departmentId = resolveDepartmentFor(db, currentUser(req), b.departmentId);` (giữ đúng thứ tự: kiểm tra phòng ban trước kiểm tra cấu hình Camera AI).

`POST /users`: đổi `requireRole('hr')` thành `requireManager`; ngay đầu handler thêm `const actor = currentUser(req);`; thay khối vai trò + phòng ban:

```ts
      const role = b.role === undefined ? 'employee' : b.role;
      assertRoleAllowed(actor, role);
      const departmentId = resolveDepartmentFor(db, actor, b.departmentId);
      const adminAreaIds = role === 'area_admin' ? parseAdminAreaIds(db, b.adminAreaIds) : [];
```

đổi `resolveFaceImage(db, null, b, ctx.now())` thành `resolveFaceImage(db, actor, null, b, ctx.now())`; ngay sau câu `INSERT INTO users…run(…)` thêm `if (adminAreaIds.length) setAdminAreas(db, id, adminAreaIds);`.

`PUT /users/:id`: thay phần đầu handler tới hết câu `UPDATE` bằng:

```ts
  r.put('/users/:id', requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanEdit(actor, target);
    const b = req.body ?? {};
    const changesRole = b.role !== undefined && b.role !== target.role;
    const changesStatus = b.status !== undefined && b.status !== target.status;
    const changesDept = b.departmentId !== undefined && (b.departmentId || null) !== target.departmentId;
    if (target.id === actor.id && (changesRole || changesStatus)) {
      throw new HttpError(400, 'Không thể tự đổi vai trò hoặc trạng thái của chính mình');
    }
    if (target.id === actor.id && actor.role === 'area_admin' && changesDept) {
      throw new HttpError(400, 'Không thể tự đổi phòng ban của chính mình');
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
    if (b.hanetPersonId !== undefined) {
      const pid = str(b.hanetPersonId) || null;
      assertPersonIdFree(db, pid, target.id);
      set('hanet_person_id', pid);
      set('face_registered', pid ? 1 : 0);
    }
    if (changesRole) {
      assertRoleAllowed(actor, b.role);
      set('role', b.role);
    }
    if (b.status !== undefined) {
      if (b.status !== 'active' && b.status !== 'inactive') throw new HttpError(400, 'Trạng thái không hợp lệ');
      set('status', b.status);
    }
    if (changesDept) set('department_id', resolveDepartmentFor(db, actor, b.departmentId));
    const newRole: UserRole = changesRole ? b.role : target.role;
    let adminAreas: string[] | null = null;
    if (newRole === 'area_admin' && (changesRole || b.adminAreaIds !== undefined)) {
      if (!isGlobalHr(actor)) throw new HttpError(403, 'Chỉ HR toàn hệ thống được cấp quyền quản trị khu vực');
      adminAreas = parseAdminAreaIds(db, b.adminAreaIds);
    } else if (changesRole && target.role === 'area_admin') {
      adminAreas = [];
    }

    tx(db, () => {
      if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, target.id);
      if (adminAreas !== null) setAdminAreas(db, target.id, adminAreas);
    });
```

(phần còn lại của handler — hủy phiên khi inactive, xếp việc đồng bộ, `kickEntity`, `res.json` — giữ nguyên.)

`POST /users/:id/reset-password`: đổi `requireRole('hr')` thành `requireManager`; thay hai dòng lấy `actor`/`target` bằng:

```ts
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanEdit(actor, target);
```

`POST /users/:id/face`: đổi `requireRole('hr')` thành `requireManager`; `const actor = currentUser(req); const target = manageableUser(db, actor, req.params.id);` (bỏ dòng `getUser` + 404 cũ); `resolveFaceImage(db, actor, target.id, req.body ?? {}, ctx.now())`.

`GET /users/:id/face-candidates`: đổi `requireRole('hr')` thành `requireManager`; `const actor = currentUser(req); const target = manageableUser(db, actor, req.params.id);`; `strangers: listSightings(db, now, 'stranger').filter((s) => managesArea(actor, deviceAreaId(db, s.deviceId))),`.

`DELETE /users/:id`:

```ts
  r.delete('/users/:id', requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    if (target.id === actor.id) throw new HttpError(400, 'Không thể tự xóa tài khoản đang đăng nhập');
    if (!canDeleteUser(actor, target)) throw new HttpError(403, 'Bạn không có quyền xóa tài khoản này');
```

(phần sao lưu, xếp việc, xóa giữ nguyên). Bỏ import `requireSystemAdmin` và `requireRole` nếu không còn dùng.

- [ ] **Step 6: `server/routes/departments.ts`**

Import `requireManager, managesArea, notFound, resolveAreaFor` từ `'../access'`, `getUser` từ `'../repo'`, `type AuthUser` từ `'../auth'`; bỏ `requireRole`, `requireSystemAdmin`.

```ts
function resolveManager(db: Db, actor: AuthUser, managerId: unknown): string | null {
  if (managerId === undefined || managerId === null || managerId === '') return null;
  const m = typeof managerId === 'string' ? getUser(db, managerId) : null;
  if (!m) throw new HttpError(400, 'Trưởng phòng được chọn không tồn tại');
  if (!managesArea(actor, m.areaId)) throw notFound('nhân sự');
  return m.id;
}

/** Phòng ban trong phạm vi quản lý, không thì 404. */
function manageableDept(db: Db, actor: AuthUser, id: string): Department {
  const dept = getDept(db, id);
  if (!dept || !managesArea(actor, dept.areaId)) throw notFound('phòng ban');
  return dept;
}
```

`POST /departments`: `requireManager`; đầu handler `const actor = currentUser(req);`; `const areaId = resolveAreaFor(db, actor, b.areaId);`; `const managerId = resolveManager(db, actor, b.managerId);`; câu `INSERT` thêm cột `area_id`:

```ts
    db.prepare('INSERT INTO departments(id, code, name, description, manager_id, area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id,
      code,
      name,
      typeof b.description === 'string' ? b.description.trim() : '',
      managerId,
      areaId,
      toVnDate(ctx.now()),
    );
```

`PUT /departments/:id`: `requireManager`; `const actor = currentUser(req); const dept = manageableDept(db, actor, req.params.id);`; thêm trước khối `managerId`:

```ts
    if (b.areaId !== undefined) {
      db.prepare('UPDATE departments SET area_id = ? WHERE id = ?').run(resolveAreaFor(db, actor, b.areaId), dept.id);
    }
```

và `resolveManager(db, actor, b.managerId)`.

`DELETE /departments/:id`: đổi `requireSystemAdmin` thành `requireManager`; `const dept = manageableDept(db, actor, req.params.id);` (thay `getDept` + 404).

- [ ] **Step 7: `server/routes/cameras.ts`**

Import `requireGlobalHr, requireManager, managesArea, notFound, resolveAreaFor` từ `'../access'`, `currentUser` từ `'../middleware'`; bỏ `requireRole`.

`POST /cameras`: `requireGlobalHr`; thêm `const areaId = resolveAreaFor(db, currentUser(req), b.areaId);` và ghi cột `area_id`:

```ts
    db.prepare(
      'INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, name, deviceKey, placeId, text(b.placeName), text(b.location), text(b.ipAddress), areaId, new Date(ctx.now()).toISOString());
```

`POST /cameras/import`, `POST /cameras/refresh-status`: `requireGlobalHr`.

`PUT /cameras/:id`:

```ts
  r.put('/cameras/:id', requireManager, (req, res) => {
    const actor = currentUser(req);
    const row = db.prepare(`${CAMERA_SELECT} WHERE c.id = ?`).get(req.params.id) as Row | undefined;
    if (!row || !managesArea(actor, row.area_id ?? null)) throw notFound('camera');
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = b.name === undefined ? row.name : text(b.name);
    if (!name) throw new HttpError(400, 'Tên camera là bắt buộc');
    const areaId = b.areaId === undefined ? (row.area_id ?? null) : resolveAreaFor(db, actor, b.areaId);
    db.prepare('UPDATE cameras SET name = ?, location = ?, ip_address = ?, area_id = ? WHERE id = ?').run(
      name,
      b.location === undefined ? row.location : text(b.location),
      b.ipAddress === undefined ? row.ip_address : text(b.ipAddress),
      areaId,
      row.id,
    );
```

(phần đổi tên → xếp việc `camera.rename` và `res.json` giữ nguyên).

`DELETE /cameras/:id`:

```ts
  r.delete('/cameras/:id', requireManager, (req, res) => {
    const row = db.prepare('SELECT id, area_id FROM cameras WHERE id = ?').get(req.params.id) as { id: string; area_id: string | null } | undefined;
    if (!row || !managesArea(currentUser(req), row.area_id)) throw notFound('camera');
    db.prepare('DELETE FROM cameras WHERE id = ?').run(row.id);
    dropEntityJobs(db, 'camera', row.id);
    res.json({ success: true });
  });
```

- [ ] **Step 8: `server/routes/requests.ts` `PUT /requests/:id`**

Import `deptAreaId, managesArea, notFound` từ `'../access'`. Đổi `requireRole('hr', 'dept_manager')` thành `requireRole('hr', 'area_admin', 'dept_manager')`; ngay sau `if (!target) throw new HttpError(404, 'Không tìm thấy đơn');` thêm:

```ts
    if (reviewer.role === 'area_admin' && !managesArea(reviewer, target.departmentId ? (deptAreaId(db, target.departmentId) ?? null) : null)) {
      throw notFound('đơn');
    }
```

- [ ] **Step 9: Sửa hai test xóa cũ trong `tests/users-routes.test.ts`**

Test `'chỉ tài khoản ADMIN xóa được nhân sự; …'`: đổi tên thành `'xóa nhân sự kèm lịch sử, có sao lưu trước; trưởng phòng không xóa được'` và bỏ dòng `assert.equal((await hr.del(\`/api/users/${ids.nv1}\`)).status, 403);` (HR toàn hệ thống nay được xóa — đã có test ở `area-writes.test.ts`).

Test `'chỉ tài khoản ADMIN xóa được phòng ban; …'`: đổi tên thành `'xóa phòng ban: thành viên chuyển về chưa có phòng; trưởng phòng không xóa được'`; thay hai dòng `const hr = await loginAs(app, 'HR01');` và `assert.equal((await hr.del(\`/api/departments/${kt}\`)).status, 403);` bằng:

```ts
    const tp = await loginAs(app, 'TP01');
    assert.equal((await tp.del(`/api/departments/${kt}`)).status, 403);
```

- [ ] **Step 10: Chạy test, thấy PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/area-writes.test.ts && npm test && npm run lint`
Expected: PASS. (Ma trận `tests/permissions.test.ts` có thể còn ô sai — các ô xóa đang `allowed: []`; Task 6 viết lại ma trận. Nếu ma trận fail ở bước này, đó là chỗ duy nhất được phép fail và Task 6 sửa — ghi rõ trong báo cáo.)

```bash
git add server tests
git commit -m "feat(scope): area admins manage staff, departments, cameras and requests in their areas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

> Lưu ý cho người thực hiện: nếu `permissions.test.ts` fail ở Step 10 thì **không commit với test đỏ**; thay vào đó cập nhật tạm các ô `DELETE /api/users/:id` và `DELETE /api/departments/:id` thành `allowed: HR` để ma trận qua, rồi Task 6 viết lại toàn bộ.

---

### Task 6: Cổng `ADMIN`/HR toàn hệ thống cho cấu hình, xóa dữ liệu khu khi reset, và ma trận phân quyền 5 vai trò

**Files:**
- Modify: `server/routes/hanet.ts` (cổng từng route, `POST /hanet/sync/retry`)
- Modify: `server/routes/admin.ts` (cổng, danh sách bảng khi reset)
- Modify: `server/routes/settings.ts`, `server/routes/attendance.ts` (`POST /attendance/recompute`)
- Rewrite: `tests/permissions.test.ts`
- Modify: các test đang gọi API chỉ-`ADMIN` bằng `HR01`: `tests/backup.test.ts`, `tests/hanet-api.test.ts`, `tests/hanet-sync.test.ts`, `tests/hanet-connect.test.ts`, `tests/hanet.test.ts`, `tests/video.test.ts`

**Interfaces:**
- Consumes: `requireSystemAdmin` (`server/middleware.ts`), `requireGlobalHr`, `requireManager`, `isGlobalHr`, `isSystemAdmin`, `managesArea`, `deptAreaId`, `notFound` (Task 2).
- Produces (bảng cổng — spec mục 5):

| Route | Cổng |
|---|---|
| `GET /hanet/config`, `GET /hanet/connect`, `GET /hanet/sync`, `GET /hanet/webhook-logs`, `GET /admin/backups`, `GET/PUT /settings/work`, `POST /hanet/simulate`, `POST /attendance/recompute` | `requireGlobalHr` |
| `PUT /hanet/config`, `POST /hanet/test-connection`, `PUT /hanet/connect`, `POST /hanet/connect/test`, `POST /hanet/webhook-token/rotate`, `POST /hanet/reconcile`, `POST /admin/backups`, `GET /admin/backups/latest`, `POST /admin/reset-database` | `requireSystemAdmin` |
| `GET /hanet/persons/unlinked` | `requireManager` |
| `POST /hanet/sync/retry` | `requireManager`; không kèm đối tượng (toàn bộ hoặc `jobId`) ⇒ chỉ `ADMIN`; kèm `{entityType, entityId}` ⇒ đối tượng phải trong phạm vi (404) |

- [ ] **Step 1: Viết lại `tests/permissions.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, Client, type TestApp } from './helpers';

type Role = 'nv' | 'tp' | 'qk' | 'hr' | 'admin';
interface Case {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: (ids: Record<string, string>) => string;
  body?: unknown;
  allowed: Role[];
}

// admin chạy cuối cùng: các ca xóa không làm đối tượng biến mất trước khi vai trò bị cấm được thử.
const ROLES: Role[] = ['nv', 'tp', 'qk', 'hr', 'admin'];
const ALL: Role[] = ROLES;
const MANAGERS: Role[] = ['qk', 'hr', 'admin'];
const GLOBAL: Role[] = ['hr', 'admin'];
const ADMIN: Role[] = ['admin'];

// Bảng quyền mục 5 của spec. Mọi đối tượng thuộc khu A (khu của quản trị khu "qk").
// "Được phép" = không phải 401/403 (có thể 200/400/404/409).
const CASES: Case[] = [
  { method: 'GET', path: () => '/api/users', allowed: ALL },
  { method: 'POST', path: () => '/api/users', body: { code: 'MOI01', name: 'Mới', departmentId: undefined }, allowed: MANAGERS },
  { method: 'PUT', path: (i) => `/api/users/${i.nv2}`, body: { position: 'X' }, allowed: MANAGERS },
  { method: 'POST', path: (i) => `/api/users/${i.nv2}/reset-password`, allowed: MANAGERS },
  { method: 'POST', path: (i) => `/api/users/${i.nv2}/face`, body: {}, allowed: MANAGERS },
  { method: 'GET', path: (i) => `/api/users/${i.nv2}/face-candidates`, allowed: MANAGERS },
  { method: 'POST', path: () => '/api/users/import', body: { persons: [] }, allowed: MANAGERS },
  { method: 'GET', path: () => '/api/departments', allowed: ALL },
  { method: 'POST', path: (i) => '/api/departments', body: { name: 'Mới' }, allowed: MANAGERS },
  { method: 'PUT', path: (i) => `/api/departments/${i.kt}`, body: { description: 'x' }, allowed: MANAGERS },
  { method: 'GET', path: () => '/api/areas', allowed: ALL },
  { method: 'POST', path: () => '/api/areas', body: { name: 'Khu mới' }, allowed: GLOBAL },
  { method: 'PUT', path: (i) => `/api/areas/${i.A}`, body: { note: 'x' }, allowed: GLOBAL },
  { method: 'GET', path: () => '/api/cameras', allowed: ALL },
  { method: 'POST', path: () => '/api/cameras', body: { name: 'C', deviceKey: 'K1' }, allowed: GLOBAL },
  { method: 'POST', path: () => '/api/cameras/import', body: {}, allowed: GLOBAL },
  { method: 'POST', path: () => '/api/cameras/refresh-status', body: {}, allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/cameras/camA', body: { location: 'X' }, allowed: MANAGERS },
  { method: 'GET', path: () => '/api/attendance', allowed: ALL },
  { method: 'POST', path: () => '/api/attendance/recompute', body: { from: '2026-10-13', to: '2026-10-13' }, allowed: GLOBAL },
  { method: 'GET', path: () => '/api/stats', allowed: ALL },
  { method: 'GET', path: () => '/api/stats/details?type=present', allowed: ALL },
  { method: 'GET', path: () => '/api/requests', allowed: ALL },
  { method: 'POST', path: () => '/api/requests', body: { workDate: '2026-10-01', type: 'leave_request', reason: 'x' }, allowed: ALL },
  { method: 'PUT', path: (i) => `/api/requests/${i.req}`, body: { status: 'approved' }, allowed: ['tp', 'qk', 'hr', 'admin'] },
  { method: 'GET', path: () => '/api/settings/work', allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/settings/work', body: { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 }, allowed: GLOBAL },
  { method: 'GET', path: () => '/api/hanet/config', allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/hanet/config', body: {}, allowed: ADMIN },
  { method: 'POST', path: () => '/api/hanet/test-connection', body: {}, allowed: ADMIN },
  { method: 'POST', path: () => '/api/hanet/webhook-token/rotate', allowed: ADMIN },
  { method: 'GET', path: () => '/api/hanet/webhook-logs', allowed: GLOBAL },
  { method: 'GET', path: () => '/api/hanet/sightings', allowed: MANAGERS },
  { method: 'GET', path: () => '/api/hanet/persons/unlinked', allowed: MANAGERS },
  { method: 'GET', path: () => '/api/hanet/sync', allowed: GLOBAL },
  { method: 'POST', path: () => '/api/hanet/sync/retry', body: {}, allowed: ADMIN },
  { method: 'POST', path: (i) => '/api/hanet/sync/retry', body: undefined, allowed: ADMIN },
  { method: 'POST', path: () => '/api/hanet/simulate', body: { userId: 'usr-khong-co' }, allowed: GLOBAL },
  { method: 'POST', path: () => '/api/hanet/reconcile', body: {}, allowed: ADMIN },
  { method: 'GET', path: () => '/api/hanet/connect', allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/hanet/connect', body: { email: '' }, allowed: ADMIN },
  { method: 'POST', path: () => '/api/hanet/connect/test', allowed: ADMIN },
  { method: 'GET', path: () => '/api/detections/999999/video', allowed: ['tp', 'qk', 'hr', 'admin'] },
  { method: 'GET', path: () => '/api/admin/backups', allowed: GLOBAL },
  { method: 'POST', path: () => '/api/admin/backups', allowed: ADMIN },
  { method: 'GET', path: () => '/api/admin/backups/latest', allowed: ADMIN },
  { method: 'POST', path: () => '/api/admin/reset-database', body: { password: 'sai' }, allowed: ADMIN },
  // Xóa: để cuối danh sách
  { method: 'DELETE', path: (i) => `/api/users/${i.hr2}`, allowed: ADMIN },
  { method: 'DELETE', path: (i) => `/api/users/${i.nv2}`, allowed: MANAGERS },
  { method: 'DELETE', path: (i) => `/api/departments/${i.kt2}`, allowed: MANAGERS },
  { method: 'DELETE', path: () => '/api/cameras/camA', allowed: MANAGERS },
  { method: 'DELETE', path: (i) => `/api/areas/${i.B}`, allowed: GLOBAL },
];

async function setup(): Promise<{ app: TestApp; ids: Record<string, string>; clients: Record<Role, Client> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const kt = seedDepartment(app.db, 'KT', 'KT', A);
  const ids: Record<string, string> = {
    A,
    B,
    kt,
    kt2: seedDepartment(app.db, 'KT2', 'KT2', A),
    admin: seedUser(app.db, { code: 'ADMIN', role: 'hr' }),
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    hr2: seedUser(app.db, { code: 'HR02', role: 'hr', departmentId: kt }),
    qk: seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [A] }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv: seedUser(app.db, { code: 'NV01', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: kt }),
  };
  app.db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('camA', 'Cổng A', 'DEVA', ?, 'x')").run(A);
  const nv2 = await loginAs(app, 'NV02');
  ids.req = (await nv2.post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' })).body.request.id;
  const clients = {
    nv: await loginAs(app, 'NV01'),
    tp: await loginAs(app, 'TP01'),
    qk: await loginAs(app, 'QK01'),
    hr: await loginAs(app, 'HR01'),
    admin: await loginAs(app, 'ADMIN'),
  };
  return { app, ids, clients };
}

test('ma trận phân quyền: mỗi vai trò × mỗi API', async () => {
  const { app, ids, clients } = await setup();
  try {
    for (const c of CASES) {
      for (const role of ROLES) {
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

test('đồng bộ lại một đối tượng: quản trị khu được với đối tượng trong khu, ngoài khu 404', async () => {
  const { app, ids, clients } = await setup();
  try {
    const nvB = seedUser(app.db, { code: 'NVB', departmentId: seedDepartment(app.db, 'PB', 'PB', ids.B) });
    assert.equal((await clients.qk.post('/api/hanet/sync/retry', { entityType: 'user', entityId: ids.nv })).status, 200);
    assert.equal((await clients.qk.post('/api/hanet/sync/retry', { entityType: 'user', entityId: nvB })).status, 404);
    assert.equal((await clients.qk.post('/api/hanet/sync/retry', { entityType: 'department', entityId: ids.kt })).status, 200);
    assert.equal((await clients.qk.post('/api/hanet/sync/retry', { entityType: 'camera', entityId: 'camA' })).status, 200);
    assert.equal((await clients.hr.post('/api/hanet/sync/retry', { jobId: 1 })).status, 403);
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

Ghi chú: ca `POST /api/users` với body không có `departmentId` sẽ trả 400 cho `qk` (bắt buộc phòng ban) — vẫn "được phép" (không 403). Ca `POST /api/hanet/sync/retry` thứ hai (body rỗng `undefined`) kiểm tra request không có body.

- [ ] **Step 2: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/permissions.test.ts`
Expected: FAIL — ví dụ `hr PUT /api/hanet/config → 200` (phải 403).

- [ ] **Step 3: `server/routes/hanet.ts`**

Import `requireSystemAdmin` từ `'../middleware'` (cùng `currentUser`), và từ `'../access'`: `requireGlobalHr, requireManager, isGlobalHr, isSystemAdmin, managesArea, deptAreaId, deviceAreaId, notFound`; thêm `import type { AuthUser } from '../auth'; import type { Db } from '../db';`. Xóa dòng `const hr = requireRole('hr');` và thay từng chỗ dùng `hr` theo bảng Interfaces ở trên.

Thêm hàm trên `hanetRoutes`:

```ts
/** Đối tượng đồng bộ thuộc phạm vi người gọi (HR toàn hệ thống: mọi đối tượng). */
function syncEntityInScope(db: Db, actor: AuthUser, type: SyncEntity, id: string): boolean {
  if (isGlobalHr(actor)) return true;
  if (type === 'user') {
    const u = getUser(db, id);
    return Boolean(u) && managesArea(actor, u!.areaId);
  }
  if (type === 'department') {
    const area = deptAreaId(db, id);
    return area !== undefined && managesArea(actor, area);
  }
  const cam = db.prepare('SELECT area_id FROM cameras WHERE id = ?').get(id) as { area_id: string | null } | undefined;
  return Boolean(cam) && managesArea(actor, cam!.area_id);
}
```

`POST /hanet/sync/retry`:

```ts
  r.post('/hanet/sync/retry', requireManager, (req, res) => {
    const actor = currentUser(req);
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
    if (filter.entityType === undefined) {
      // Đồng bộ lại toàn bộ hoặc theo mã việc: thao tác cấu hình, chỉ ADMIN
      if (!isSystemAdmin(actor)) throw new HttpError(403, 'Chỉ tài khoản ADMIN được đồng bộ lại toàn bộ');
    } else if (!syncEntityInScope(db, actor, filter.entityType, filter.entityId!)) {
      throw notFound('đối tượng');
    }
    retryJobs(db, filter, ctx.now());
    kickAll(ctx);
    res.json(isGlobalHr(actor) ? syncSummary(db) : { success: true });
  });
```

Bỏ import `requireRole` nếu không còn dùng. (`deviceAreaId` đã dùng ở Task 4.)

- [ ] **Step 4: `server/routes/admin.ts`**

```ts
import { requireSystemAdmin } from '../middleware';
import { requireGlobalHr } from '../access';
```

`GET /admin/backups` ⇒ `requireGlobalHr`; `POST /admin/backups`, `GET /admin/backups/latest`, `POST /admin/reset-database` ⇒ `requireSystemAdmin`. Trong `reset-database`, thay khối `tx(...)`:

```ts
    tx(db, () => {
      for (const table of [
        'detections', 'attendance_days', 'requests', 'webhook_logs', 'cameras', 'sync_jobs', 'face_sightings',
        'email_jobs', 'password_resets', 'admin_areas',
      ]) db.exec(`DELETE FROM ${table}`);
      db.prepare('UPDATE users SET department_id = NULL WHERE id = ?').run(actor.id);
      db.exec('UPDATE departments SET manager_id = NULL');
      db.prepare('DELETE FROM users WHERE id != ?').run(actor.id);
      db.exec('DELETE FROM departments');
      db.exec('DELETE FROM areas');
    });
```

Thêm test vào `tests/backup.test.ts` (trong test reset hiện có, sau khi reset thành công):

```ts
    assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM areas').get()!.c, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM email_jobs').get()!.c, 0);
```

(Trước khi gọi reset, chèn một khu: `seedArea(app.db, 'KV01')` — import `seedArea` từ `./helpers`.)

- [ ] **Step 5: `server/routes/settings.ts` và `POST /attendance/recompute`**

`settings.ts`: `import { requireGlobalHr } from '../access';` — cả hai route dùng `requireGlobalHr` (bỏ `requireRole`).
`attendance.ts`: `r.post('/attendance/recompute', requireGlobalHr, …)` (import `requireGlobalHr`).

- [ ] **Step 6: Sửa các test đang gọi API chỉ-`ADMIN` bằng `HR01`**

Chạy `npm test` và xem các test fail vì 403 trong `tests/backup.test.ts`, `tests/hanet-api.test.ts`, `tests/hanet-sync.test.ts`, `tests/hanet-connect.test.ts`, `tests/hanet.test.ts`, `tests/video.test.ts`. Với mỗi test như vậy:
- Nếu test đã seed `HR01` chỉ để gọi API cấu hình: đổi `seedUser(app.db, { code: 'HR01', role: 'hr' })` thành `seedUser(app.db, { code: 'ADMIN', role: 'hr' })` và `loginAs(app, 'HR01')` thành `loginAs(app, 'ADMIN')` **trong đúng test đó** (không seed `ADMIN` hai lần trong cùng một app — mã là UNIQUE).
- Nếu `HR01` còn được dùng cho việc khác trong test (ví dụ đọc webhook-logs), seed thêm `ADMIN` và chỉ dùng client `ADMIN` cho các lời gọi chỉ-`ADMIN`.
- `tests/hanet-connect.test.ts` có hàm setup dùng `HR01`: đổi setup sang `ADMIN`.
Không đổi giá trị mong đợi nào khác.

- [ ] **Step 7: Chạy toàn bộ test + lint; commit**

Run: `npm test && npm run lint`
Expected: PASS.

```bash
git add server tests
git commit -m "feat(access): ADMIN-only technical config, global-HR settings, five-role permission matrix

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Gửi thư — cấu hình SMTP, hàng đợi `email_jobs`, mật khẩu tạm sinh lúc gửi

**Files:**
- Modify: `package.json` (thêm `nodemailer` vào `dependencies`, `@types/nodemailer` vào `devDependencies`)
- Create: `server/mail.ts`, `server/mail-templates.ts`, `server/mail-queue.ts`, `server/routes/mail.ts`
- Modify: `server/context.ts` (`sendMail`), `server/index.ts`, `server/app.ts`, `server/jobs.ts`
- Modify: `shared/types.ts` (`MailConfigView`)
- Modify: `tests/helpers.ts` (`startTestApp` có hộp thư giả `mails`)
- Modify: `tests/permissions.test.ts` (thêm 3 ca)
- Test: `tests/mail.test.ts` (mới)

**Interfaces:**
- Consumes: `generateTempPassword`, `hashPassword`, `deleteUserSessions` (`server/auth.ts`); `getSetting/setSetting` (`server/settings.ts`); `toVnDate`, `vnDayStart`, `addDays` (`server/vntime.ts`); `requireSystemAdmin`, `requireGlobalHr` (Task 2/6).
- Produces (`server/mail.ts`):
  - `interface SmtpConfig { host: string; port: number; secure: boolean; user: string; password: string; fromName: string; fromEmail: string }`
  - `interface MailMessage { to: string; subject: string; text: string }`
  - `type SendMail = (cfg: SmtpConfig, msg: MailMessage) => Promise<void>`
  - `class MailError extends Error { permanent: boolean; code: string }`, `classifyMailError(err: unknown): MailError`
  - `nodemailerSend: SendMail`
  - `getSmtpConfig(db): SmtpConfig | null`, `getAppUrl(db): string | null`, `getDailyLimit(db): number`, `getMailConfigView(db, now): MailConfigView`, `saveMailConfig(db, input: unknown): void`, `DEFAULT_DAILY_LIMIT = 450`
- Produces (`server/mail-queue.ts`):
  - `type MailKind = 'welcome' | 'reset_temp' | 'reset_link'`
  - `MAIL_RETRY_MIN = [1, 5, 15, 60]`, `MAIL_MAX_ATTEMPTS = 5`
  - `interface MailDeps { db: Db; sendMail: SendMail; now: () => number }`
  - `enqueueMail(db: Db, userId: string, kind: MailKind, payload: Record<string, string>, now: number): void`
  - `sentToday(db: Db, now: number): number`
  - `runMailJobs(deps: MailDeps, limit?: number): Promise<{ sent: number; failed: number }>`
- Produces (`AppContext`): `sendMail: SendMail`. (`TestApp`): `mails: MailMessage[]`; `TestAppOverrides.sendMail?: SendMail`.
- Produces (API): `GET /api/settings/mail` → `MailConfigView` (HR toàn hệ thống); `PUT /api/settings/mail` → `MailConfigView` (`ADMIN`); `POST /api/settings/mail/test { to }` → `{ ok: boolean; message: string }` (`ADMIN`).
- `MailConfigView { host: string; port: number; secure: 'ssl' | 'starttls'; user: string; hasPassword: boolean; fromName: string; fromEmail: string; appUrl: string; dailyLimit: number; configured: boolean; sentToday: number; pending: number }`

- [ ] **Step 1: Cài thư viện**

Run: `npm install nodemailer@6.9.16 && npm install -D @types/nodemailer@6.4.17`
Expected: `package.json` có `"nodemailer": "^6.9.16"` trong `dependencies` và `"@types/nodemailer"` trong `devDependencies`; `package-lock.json` cập nhật.

- [ ] **Step 2: Viết test `tests/mail.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser } from './helpers';
import { createSession, findSessionUser, verifyPassword } from '../server/auth';
import { getMailConfigView, getSmtpConfig, MailError, saveMailConfig, type MailMessage, type SendMail } from '../server/mail';
import { enqueueMail, MAIL_MAX_ATTEMPTS, runMailJobs, sentToday } from '../server/mail-queue';
import type { Db } from '../server/db';

const T0 = Date.UTC(2026, 9, 14, 3, 0); // 10:00 giờ Việt Nam
const GMAIL = {
  host: 'smtp.gmail.com', port: 465, secure: 'ssl', user: 'hr@gmail.com', password: 'app-pass-16', fromName: 'Petrolimex Attendance',
  fromEmail: 'hr@gmail.com', appUrl: 'https://petrolimex.hgcvn.cloud', dailyLimit: 450,
};

function inbox(fail?: (n: number) => Error | null): { send: SendMail; mails: MailMessage[] } {
  const mails: MailMessage[] = [];
  let n = 0;
  return {
    mails,
    send: async (_cfg, msg) => {
      const err = fail?.(n++) ?? null;
      if (err) throw err;
      mails.push(msg);
    },
  };
}

const job = (db: Db, userId: string) =>
  db.prepare('SELECT status, attempts, next_run_at, last_error, payload FROM email_jobs WHERE user_id = ? ORDER BY id DESC').get(userId) as Record<string, any>;
const user = (db: Db, id: string) => db.prepare('SELECT password_hash, must_change_password, email_status, email_error FROM users WHERE id = ?').get(id) as Record<string, any>;

test('cấu hình gửi thư: lưu, che mật khẩu, để trống mật khẩu thì giữ cũ, kiểm tra dữ liệu', () => {
  const db = freshDb();
  assert.equal(getSmtpConfig(db), null);
  saveMailConfig(db, GMAIL);
  const view = getMailConfigView(db, T0);
  assert.equal(view.hasPassword, true);
  assert.equal((view as unknown as Record<string, unknown>).password, undefined);
  assert.equal(view.configured, true);
  saveMailConfig(db, { ...GMAIL, password: '' });
  assert.equal(getSmtpConfig(db)!.password, 'app-pass-16');
  assert.equal(getSmtpConfig(db)!.secure, true);
  for (const bad of [{ port: 0 }, { secure: 'tls' }, { fromEmail: 'khong-phai-email' }, { appUrl: 'petrolimex.vn' }, { dailyLimit: 0 }, { host: '' }]) {
    assert.throws(() => saveMailConfig(db, { ...GMAIL, ...bad }), (e: any) => e.status === 400, JSON.stringify(bad));
  }
  saveMailConfig(db, { ...GMAIL, appUrl: 'https://petrolimex.hgcvn.cloud/' });
  assert.equal(getMailConfigView(db, T0).appUrl, 'https://petrolimex.hgcvn.cloud', 'bỏ dấu / cuối');
});

test('thư chào mừng: mật khẩu tạm sinh lúc gửi, có trong thư, DB không lưu mật khẩu rõ', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV0001', name: 'Nguyễn Văn An', email: 'an@test.vn', password: null });
  enqueueMail(db, id, 'welcome', {}, T0);
  assert.equal(user(db, id).email_status, 'pending');
  const box = inbox();
  assert.deepEqual(await runMailJobs({ db, sendMail: box.send, now: () => T0 }), { sent: 1, failed: 0 });
  assert.equal(box.mails.length, 1);
  assert.equal(box.mails[0].to, 'an@test.vn');
  const pw = /Mật khẩu tạm: (\S+)/.exec(box.mails[0].text)![1];
  assert.match(box.mails[0].text, /NV0001/);
  assert.match(box.mails[0].text, /https:\/\/petrolimex\.hgcvn\.cloud/);
  const u = user(db, id);
  assert.ok(verifyPassword(pw, u.password_hash));
  assert.deepEqual([u.must_change_password, u.email_status], [1, 'sent']);
  const j = job(db, id);
  assert.equal(j.status, 'sent');
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM email_jobs').all()).includes(pw), 'không lưu mật khẩu trong hàng đợi');
});

test('Review Focus #4: gửi thư đặt lại thất bại vĩnh viễn → mật khẩu cũ vẫn dùng được', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV01', email: 'nv01@test.vn' });
  const before = user(db, id);
  enqueueMail(db, id, 'reset_temp', {}, T0);
  const box = inbox(() => new MailError('Máy chủ thư từ chối (550)', true, '550'));
  assert.deepEqual(await runMailJobs({ db, sendMail: box.send, now: () => T0 }), { sent: 0, failed: 1 });
  const after = user(db, id);
  assert.equal(after.password_hash, before.password_hash);
  assert.equal(after.must_change_password, before.must_change_password);
  assert.deepEqual([after.email_status, after.email_error], ['error', 'Máy chủ thư từ chối (550)']);
  assert.equal(job(db, id).status, 'error');
});

test('lỗi tạm: thử lại sau 1, 5, 15, 60 phút; quá số lần thì lỗi', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV01', email: 'nv01@test.vn', password: null });
  enqueueMail(db, id, 'welcome', {}, T0);
  const box = inbox(() => new MailError('Không kết nối được máy chủ gửi thư, sẽ thử lại', false, 'ETIMEDOUT'));
  let now = T0;
  await runMailJobs({ db, sendMail: box.send, now: () => now });
  assert.deepEqual([job(db, id).status, job(db, id).attempts, job(db, id).next_run_at], ['pending', 1, T0 + 60_000]);
  assert.equal(user(db, id).password_hash, null, 'gửi lỗi thì không để lại mật khẩu');
  for (let i = 1; i < MAIL_MAX_ATTEMPTS; i++) {
    now = job(db, id).next_run_at;
    await runMailJobs({ db, sendMail: box.send, now: () => now });
  }
  assert.deepEqual([job(db, id).status, job(db, id).attempts], ['error', MAIL_MAX_ATTEMPTS]);
  assert.equal(user(db, id).email_status, 'error');
});

test('hạn mức ngày: đủ hạn mức thì dời sang 00:00 hôm sau (giờ Việt Nam)', async () => {
  const db = freshDb();
  saveMailConfig(db, { ...GMAIL, dailyLimit: 1 });
  const a = seedUser(db, { code: 'A', email: 'a@test.vn', password: null });
  const b = seedUser(db, { code: 'B', email: 'b@test.vn', password: null });
  enqueueMail(db, a, 'welcome', {}, T0);
  enqueueMail(db, b, 'welcome', {}, T0);
  const box = inbox();
  await runMailJobs({ db, sendMail: box.send, now: () => T0 });
  assert.equal(box.mails.length, 1);
  assert.equal(sentToday(db, T0), 1);
  assert.equal(job(db, b).next_run_at, Date.UTC(2026, 9, 14, 17, 0), '00:00 ngày 15/10 giờ Việt Nam');
});

test('chưa cấu hình SMTP: thư giữ trạng thái chờ', async () => {
  const db = freshDb();
  const id = seedUser(db, { code: 'A', email: 'a@test.vn', password: null });
  enqueueMail(db, id, 'welcome', {}, T0);
  const box = inbox();
  assert.deepEqual(await runMailJobs({ db, sendMail: box.send, now: () => T0 }), { sent: 0, failed: 0 });
  assert.equal(job(db, id).status, 'pending');
});

test('thư đặt lại gửi thành công thì hủy phiên cũ; xếp thư mới thay thư mật khẩu đang chờ', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV01', email: 'nv01@test.vn' });
  const token = createSession(db, id, T0);
  enqueueMail(db, id, 'welcome', {}, T0);
  enqueueMail(db, id, 'reset_temp', {}, T0);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'pending'").get() as { c: number }).c, 1);
  const box = inbox();
  await runMailJobs({ db, sendMail: box.send, now: () => T0 });
  assert.equal(box.mails.length, 1);
  assert.equal(findSessionUser(db, token, T0 + 1), null);
});

test('thư link đặt lại: token chỉ nằm trong thư, xóa khỏi hàng đợi sau khi gửi', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV01', email: 'nv01@test.vn' });
  const hash = (db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id) as { password_hash: string }).password_hash;
  enqueueMail(db, id, 'reset_link', { token: 'tok-123' }, T0);
  const box = inbox();
  await runMailJobs({ db, sendMail: box.send, now: () => T0 });
  assert.match(box.mails[0].text, /https:\/\/petrolimex\.hgcvn\.cloud\/\?reset=tok-123/);
  assert.equal(job(db, id).payload, '{}');
  assert.equal(user(db, id).password_hash, hash, 'thư link không đổi mật khẩu');
});
```

- [ ] **Step 3: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/mail.test.ts`
Expected: FAIL — `Cannot find module '../server/mail'`.

- [ ] **Step 4: Thêm `MailConfigView` vào `shared/types.ts`**

```ts
/** Cấu hình gửi thư (tab Cấu hình); không bao giờ trả mật khẩu SMTP. */
export interface MailConfigView {
  host: string;
  port: number;
  secure: 'ssl' | 'starttls';
  user: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  appUrl: string; // địa chỉ web dùng trong thư (link đặt lại mật khẩu)
  dailyLimit: number;
  configured: boolean;
  sentToday: number;
  pending: number;
}
```

- [ ] **Step 5: Tạo `server/mail.ts`**

```ts
import nodemailer from 'nodemailer';
import type { Db } from './db';
import { getSetting, setSetting } from './settings';
import { HttpError } from './errors';
import { toVnDate, vnDayStart } from './vntime';
import type { MailConfigView } from '../shared/types';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean; // true: SSL/TLS (465); false: STARTTLS (587)
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendMail = (cfg: SmtpConfig, msg: MailMessage) => Promise<void>;

export class MailError extends Error {
  constructor(
    message: string,
    public permanent: boolean,
    public code: string,
  ) {
    super(message);
  }
}

export const DEFAULT_DAILY_LIMIT = 450;
const K = {
  host: 'mail.host',
  port: 'mail.port',
  secure: 'mail.secure',
  user: 'mail.user',
  password: 'mail.password',
  fromName: 'mail.from_name',
  fromEmail: 'mail.from_email',
  appUrl: 'mail.app_url',
  dailyLimit: 'mail.daily_limit',
} as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getSmtpConfig(db: Db): SmtpConfig | null {
  const host = getSetting(db, K.host);
  const user = getSetting(db, K.user);
  const password = getSetting(db, K.password);
  const fromEmail = getSetting(db, K.fromEmail);
  if (!host || !user || !password || !fromEmail) return null;
  return {
    host,
    port: Number(getSetting(db, K.port) ?? 465),
    secure: (getSetting(db, K.secure) ?? 'ssl') === 'ssl',
    user,
    password,
    fromName: getSetting(db, K.fromName) ?? 'Petrolimex Attendance',
    fromEmail,
  };
}

export function getAppUrl(db: Db): string | null {
  return getSetting(db, K.appUrl) || null;
}

export function getDailyLimit(db: Db): number {
  return Number(getSetting(db, K.dailyLimit) ?? DEFAULT_DAILY_LIMIT);
}

export function getMailConfigView(db: Db, now: number): MailConfigView {
  const dayStart = vnDayStart(toVnDate(now));
  const count = (sql: string, ...p: number[]) => (db.prepare(sql).get(...p) as { c: number }).c;
  return {
    host: getSetting(db, K.host) ?? '',
    port: Number(getSetting(db, K.port) ?? 465),
    secure: (getSetting(db, K.secure) ?? 'ssl') === 'starttls' ? 'starttls' : 'ssl',
    user: getSetting(db, K.user) ?? '',
    hasPassword: Boolean(getSetting(db, K.password)),
    fromName: getSetting(db, K.fromName) ?? 'Petrolimex Attendance',
    fromEmail: getSetting(db, K.fromEmail) ?? '',
    appUrl: getSetting(db, K.appUrl) ?? '',
    dailyLimit: getDailyLimit(db),
    configured: getSmtpConfig(db) !== null,
    sentToday: count("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'sent' AND sent_at >= ?", dayStart),
    pending: count("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'pending'"),
  };
}

/** Lưu cấu hình gửi thư (chỉ ADMIN). Mật khẩu để trống = giữ mật khẩu cũ. */
export function saveMailConfig(db: Db, input: unknown): void {
  const b = (input ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const host = text(b.host);
  const user = text(b.user);
  const fromEmail = text(b.fromEmail).toLowerCase();
  const fromName = text(b.fromName) || 'Petrolimex Attendance';
  const appUrl = text(b.appUrl).replace(/\/+$/, '');
  const port = Number(b.port);
  const dailyLimit = Number(b.dailyLimit ?? DEFAULT_DAILY_LIMIT);
  if (!host) throw new HttpError(400, 'Máy chủ SMTP là bắt buộc');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, 'Cổng SMTP không hợp lệ');
  if (b.secure !== 'ssl' && b.secure !== 'starttls') throw new HttpError(400, 'Kiểu bảo mật phải là SSL/TLS hoặc STARTTLS');
  if (!user) throw new HttpError(400, 'Tài khoản SMTP là bắt buộc');
  if (!EMAIL_RE.test(fromEmail)) throw new HttpError(400, 'Email người gửi không hợp lệ');
  if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(appUrl)) throw new HttpError(400, 'Địa chỉ web phải bắt đầu bằng http:// hoặc https://');
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10000) throw new HttpError(400, 'Hạn mức thư mỗi ngày không hợp lệ');
  setSetting(db, K.host, host);
  setSetting(db, K.port, String(port));
  setSetting(db, K.secure, b.secure);
  setSetting(db, K.user, user);
  if (typeof b.password === 'string' && b.password !== '') setSetting(db, K.password, b.password);
  setSetting(db, K.fromName, fromName);
  setSetting(db, K.fromEmail, fromEmail);
  setSetting(db, K.appUrl, appUrl);
  setSetting(db, K.dailyLimit, String(dailyLimit));
}

/** Lỗi vĩnh viễn: sai đăng nhập SMTP, máy chủ từ chối (5xx), địa chỉ sai. Còn lại (mạng, timeout, 4xx) thử lại sau. */
export function classifyMailError(err: unknown): MailError {
  if (err instanceof MailError) return err;
  const e = (err ?? {}) as { code?: string; responseCode?: number };
  if (e.code === 'EAUTH') return new MailError('Sai tài khoản hoặc mật khẩu gửi thư (SMTP)', true, 'EAUTH');
  if (e.code === 'EENVELOPE') return new MailError('Địa chỉ email người nhận không hợp lệ', true, 'EENVELOPE');
  if (typeof e.responseCode === 'number' && e.responseCode >= 500) return new MailError(`Máy chủ thư từ chối (${e.responseCode})`, true, String(e.responseCode));
  return new MailError('Không kết nối được máy chủ gửi thư, sẽ thử lại', false, e.code ?? 'ENET');
}

export const nodemailerSend: SendMail = async (cfg, msg) => {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({ from: { name: cfg.fromName, address: cfg.fromEmail }, to: msg.to, subject: msg.subject, text: msg.text });
  } catch (err) {
    throw classifyMailError(err);
  } finally {
    transport.close();
  }
};
```

- [ ] **Step 6: Tạo `server/mail-templates.ts`**

```ts
import type { MailMessage } from './mail';

export interface MailUser {
  name: string;
  code: string;
  email: string;
}

const SIGN = '\n\nTrân trọng,\nPetrolimex Attendance — Hệ thống Điểm danh Camera AI';
const site = (appUrl: string | null) => (appUrl ? `\nĐịa chỉ đăng nhập: ${appUrl}` : '');

export function welcomeMail(u: MailUser, tempPassword: string, appUrl: string | null): MailMessage {
  return {
    to: u.email,
    subject: 'Petrolimex Attendance — Tài khoản đăng nhập của bạn',
    text:
      `Xin chào ${u.name},\n\nTài khoản điểm danh của bạn đã được tạo.` +
      `\nMã nhân viên: ${u.code}\nĐăng nhập bằng mã nhân viên hoặc email: ${u.email}\nMật khẩu tạm: ${tempPassword}` +
      site(appUrl) +
      '\n\nLần đăng nhập đầu tiên bạn sẽ được yêu cầu đổi mật khẩu.' +
      SIGN,
  };
}

export function resetTempMail(u: MailUser, tempPassword: string, appUrl: string | null): MailMessage {
  return {
    to: u.email,
    subject: 'Petrolimex Attendance — Mật khẩu mới',
    text:
      `Xin chào ${u.name},\n\nMật khẩu của tài khoản ${u.code} vừa được đặt lại.\nMật khẩu tạm: ${tempPassword}` +
      site(appUrl) +
      '\n\nHãy đăng nhập và đổi mật khẩu ngay. Nếu bạn không yêu cầu, hãy báo phòng Nhân sự.' +
      SIGN,
  };
}

export function resetLinkMail(u: MailUser, link: string): MailMessage {
  return {
    to: u.email,
    subject: 'Petrolimex Attendance — Đặt lại mật khẩu',
    text:
      `Xin chào ${u.name},\n\nBạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản ${u.code}.` +
      `\nBấm vào link sau trong vòng 30 phút để đặt mật khẩu mới (chỉ dùng được một lần):\n${link}` +
      '\n\nNếu bạn không yêu cầu, hãy bỏ qua thư này; mật khẩu hiện tại vẫn giữ nguyên.' +
      SIGN,
  };
}

export function testMail(to: string): MailMessage {
  return { to, subject: 'Petrolimex Attendance — Thư thử', text: 'Cấu hình gửi thư hoạt động bình thường.' + SIGN };
}
```

- [ ] **Step 7: Tạo `server/mail-queue.ts`**

```ts
import type { Db } from './db';
import { deleteUserSessions, generateTempPassword, hashPassword } from './auth';
import { classifyMailError, getAppUrl, getDailyLimit, getSmtpConfig, type MailMessage, type SendMail } from './mail';
import { resetLinkMail, resetTempMail, welcomeMail } from './mail-templates';
import { addDays, toVnDate, vnDayStart } from './vntime';

export type MailKind = 'welcome' | 'reset_temp' | 'reset_link';
export const MAIL_RETRY_MIN = [1, 5, 15, 60];
export const MAIL_MAX_ATTEMPTS = 5;
const PASSWORD_KINDS: MailKind[] = ['welcome', 'reset_temp'];

export interface MailDeps {
  db: Db;
  sendMail: SendMail;
  now: () => number;
}

type JobRow = { id: number; user_id: string; kind: MailKind; attempts: number; payload: string };
type UserRow = { id: string; code: string; name: string; email: string; status: string; password_hash: string | null; must_change_password: number };

/**
 * Xếp một thư cho nhân sự (gửi tới email hiện tại của người đó lúc gửi). Thư mang mật khẩu mới thay mọi thư mang mật khẩu
 * đang chờ của cùng người (tránh nhận hai mật khẩu khác nhau); thư link đặt lại thay link cũ đang chờ.
 */
export function enqueueMail(db: Db, userId: string, kind: MailKind, payload: Record<string, string>, now: number): void {
  const row = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!row || !row.email) return;
  const replaces = PASSWORD_KINDS.includes(kind) ? PASSWORD_KINDS : [kind];
  db.prepare(`DELETE FROM email_jobs WHERE user_id = ? AND status = 'pending' AND kind IN (${replaces.map(() => '?').join(', ')})`).run(userId, ...replaces);
  db.prepare(
    `INSERT INTO email_jobs(user_id, kind, to_email, status, attempts, payload, next_run_at, created_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
  ).run(userId, kind, row.email, JSON.stringify(payload), now, now);
  db.prepare("UPDATE users SET email_status = 'pending', email_error = NULL WHERE id = ?").run(userId);
}

export function sentToday(db: Db, now: number): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'sent' AND sent_at >= ?").get(vnDayStart(toVnDate(now))) as { c: number }).c;
}

const running = new WeakSet<Db>();

/** Gửi các thư đến hạn, tuần tự. Không cấu hình SMTP thì không làm gì. Đủ hạn mức ngày thì dời phần còn lại sang 00:00 hôm sau. */
export async function runMailJobs(deps: MailDeps, limit = 20): Promise<{ sent: number; failed: number }> {
  const { db } = deps;
  const result = { sent: 0, failed: 0 };
  const cfg = getSmtpConfig(db);
  if (!cfg || running.has(db)) return result;
  running.add(db);
  try {
    const now = deps.now();
    const jobs = db.prepare("SELECT id, user_id, kind, attempts, payload FROM email_jobs WHERE status = 'pending' AND next_run_at <= ? ORDER BY id LIMIT ?").all(now, limit) as JobRow[];
    let budget = getDailyLimit(db) - sentToday(db, now);
    for (const job of jobs) {
      if (budget <= 0) {
        const tomorrow = vnDayStart(addDays(toVnDate(now), 1));
        db.prepare("UPDATE email_jobs SET next_run_at = ? WHERE status = 'pending' AND next_run_at <= ?").run(tomorrow, now);
        break;
      }
      const ok = await sendOne(deps, cfg, job);
      if (ok) {
        result.sent++;
        budget--;
      } else {
        result.failed++;
      }
    }
  } finally {
    running.delete(db);
  }
  return result;
}

async function sendOne(deps: MailDeps, cfg: NonNullable<ReturnType<typeof getSmtpConfig>>, job: JobRow): Promise<boolean> {
  const { db } = deps;
  const now = deps.now();
  const u = db.prepare('SELECT id, code, name, email, status, password_hash, must_change_password FROM users WHERE id = ?').get(job.user_id) as UserRow | undefined;
  if (!u || u.status !== 'active' || !u.email) {
    db.prepare("UPDATE email_jobs SET status = 'error', attempts = attempts + 1, last_error = ?, payload = '{}' WHERE id = ?").run('Nhân sự không còn hoạt động hoặc không có email', job.id);
    return false;
  }
  const mailUser = { name: u.name, code: u.code, email: u.email };
  const appUrl = getAppUrl(db);
  let msg: MailMessage;
  let newHash: string | null = null;
  if (job.kind === 'reset_link') {
    const token = (JSON.parse(job.payload) as { token?: string }).token ?? '';
    msg = resetLinkMail(mailUser, `${appUrl ?? ''}/?reset=${encodeURIComponent(token)}`);
  } else {
    // Mật khẩu tạm sinh ngay lúc gửi: DB không bao giờ giữ mật khẩu dạng rõ
    const temp = generateTempPassword();
    newHash = hashPassword(temp);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(newHash, u.id);
    msg = job.kind === 'welcome' ? welcomeMail(mailUser, temp, appUrl) : resetTempMail(mailUser, temp, appUrl);
  }
  try {
    await deps.sendMail(cfg, msg);
  } catch (err) {
    const me = classifyMailError(err);
    // Gửi không được thì trả lại mật khẩu cũ (người dùng vẫn đăng nhập được như trước)
    if (newHash) {
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ? AND password_hash = ?').run(u.password_hash, u.must_change_password, u.id, newHash);
    }
    const attempts = job.attempts + 1;
    if (me.permanent || attempts >= MAIL_MAX_ATTEMPTS) {
      db.prepare("UPDATE email_jobs SET status = 'error', attempts = ?, last_error = ?, payload = '{}' WHERE id = ?").run(attempts, me.message, job.id);
      db.prepare("UPDATE users SET email_status = 'error', email_error = ? WHERE id = ?").run(me.message, u.id);
    } else {
      const delay = MAIL_RETRY_MIN[Math.min(attempts - 1, MAIL_RETRY_MIN.length - 1)] * 60_000;
      db.prepare('UPDATE email_jobs SET attempts = ?, last_error = ?, next_run_at = ? WHERE id = ?').run(attempts, me.message, now + delay, job.id);
    }
    console.warn(`[MAIL] kind=${job.kind} user=${u.code} status=error code=${me.code}`);
    return false;
  }
  db.prepare("UPDATE email_jobs SET status = 'sent', attempts = attempts + 1, last_error = NULL, payload = '{}', sent_at = ? WHERE id = ?").run(now, job.id);
  db.prepare("UPDATE users SET email_status = 'sent', email_error = NULL WHERE id = ?").run(u.id);
  if (job.kind === 'reset_temp') deleteUserSessions(db, u.id);
  console.log(`[MAIL] kind=${job.kind} user=${u.code} status=sent`);
  return true;
}
```

- [ ] **Step 8: Chạy test, thấy PASS**

Run: `npx tsx --test tests/mail.test.ts`
Expected: PASS.

- [ ] **Step 9: Nối vào ứng dụng**

`server/context.ts`: `import type { SendMail } from './mail';` và thêm vào `AppContext`:

```ts
  /** Gửi một thư qua SMTP (production: nodemailer; test: hộp thư giả). */
  sendMail: SendMail;
```

`server/index.ts`: `import { nodemailerSend } from './mail';` và thêm `sendMail: nodemailerSend,` vào `ctx`.

`server/jobs.ts`: `import { runMailJobs } from './mail-queue';` và trong `tick`, ngay sau `run('sync', …)`:

```ts
    run('mail', () => runMailJobs({ db: ctx.db, sendMail: ctx.sendMail, now: ctx.now }));
```

`tests/helpers.ts`: import `type MailMessage, type SendMail` từ `'../server/mail'`; `TestAppOverrides` thêm `sendMail?: SendMail;`; `TestApp` thêm `mails: MailMessage[];`; trong `startTestApp`:

```ts
  const mails: MailMessage[] = [];
  const ctx: AppContext = {
    db,
    config: { production: false, simulatorEnabled: true, trustProxy: false, backupDir, kickSync: false, ...overrides.config },
    limiter: overrides.limiter ?? new LoginLimiter(),
    fetch: overrides.fetch ?? ((async () => { throw new Error('fetch không được dùng trong test này'); }) as unknown as typeof fetch),
    now: overrides.now ?? (() => Date.now()),
    sendMail: overrides.sendMail ?? (async (_cfg, msg) => { mails.push(msg); }),
  };
```

và `return { baseUrl, ctx, db, mails, close }`.

- [ ] **Step 10: Route cấu hình gửi thư `server/routes/mail.ts`**

```ts
import { Router } from 'express';
import type { AppContext } from '../context';
import { ah, HttpError } from '../errors';
import { requireSystemAdmin } from '../middleware';
import { requireGlobalHr } from '../access';
import { classifyMailError, getMailConfigView, getSmtpConfig, saveMailConfig } from '../mail';
import { testMail } from '../mail-templates';

export function mailRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/settings/mail', requireGlobalHr, (_req, res) => {
    res.json(getMailConfigView(db, ctx.now()));
  });

  r.put('/settings/mail', requireSystemAdmin, (req, res) => {
    saveMailConfig(db, req.body);
    res.json(getMailConfigView(db, ctx.now()));
  });

  r.post(
    '/settings/mail/test',
    requireSystemAdmin,
    ah(async (req, res) => {
      const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'Email nhận thư thử không hợp lệ');
      const cfg = getSmtpConfig(db);
      if (!cfg) {
        res.json({ ok: false, message: 'Chưa cấu hình đủ máy chủ, tài khoản, mật khẩu và email người gửi' });
        return;
      }
      try {
        await ctx.sendMail(cfg, testMail(to));
        res.json({ ok: true, message: `Đã gửi thư thử tới ${to}` });
      } catch (err) {
        res.json({ ok: false, message: classifyMailError(err).message });
      }
    }),
  );

  return r;
}
```

`server/app.ts`: `import { mailRoutes } from './routes/mail';` và `api.use(mailRoutes(ctx));` sau `api.use(settingsRoutes(ctx));`.

`tests/permissions.test.ts`: thêm vào `CASES` (trước nhóm xóa):

```ts
  { method: 'GET', path: () => '/api/settings/mail', allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/settings/mail', body: {}, allowed: ADMIN },
  { method: 'POST', path: () => '/api/settings/mail/test', body: { to: 'x' }, allowed: ADMIN },
```

Thêm test route vào cuối `tests/mail.test.ts`:

```ts
import { startTestApp, loginAs } from './helpers';

test('API cấu hình thư: ADMIN lưu và gửi thư thử; HR toàn hệ thống chỉ xem, không thấy mật khẩu', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const admin = await loginAs(app, 'ADMIN');
    assert.equal((await admin.post('/api/settings/mail/test', { to: 'a@test.vn' })).body.ok, false, 'chưa cấu hình');
    const put = await admin.put('/api/settings/mail', GMAIL);
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const t = await admin.post('/api/settings/mail/test', { to: 'nhan@test.vn' });
    assert.deepEqual(t.body, { ok: true, message: 'Đã gửi thư thử tới nhan@test.vn' });
    assert.equal(app.mails[0].to, 'nhan@test.vn');
    const view = (await (await loginAs(app, 'HR01')).get('/api/settings/mail')).body;
    assert.equal(view.hasPassword, true);
    assert.ok(!JSON.stringify(view).includes('app-pass-16'));
  } finally {
    await app.close();
  }
});
```

(gộp `import { startTestApp, loginAs } from './helpers';` vào dòng import `./helpers` ở đầu file.)

- [ ] **Step 11: Toàn bộ test + lint; commit**

Run: `npm test && npm run lint`
Expected: PASS.

```bash
git add package.json package-lock.json server shared tests
git commit -m "feat(mail): SMTP settings, email queue with temp passwords generated at send time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tài khoản — email/điện thoại bắt buộc, mã tự sinh, mật khẩu qua email, đăng nhập bằng email, quên mật khẩu

**Files:**
- Create: `server/accounts.ts`
- Modify: `server/routes/users.ts` (POST, PUT, reset-password, thêm `GET /users/next-code`)
- Modify: `server/routes/auth.ts` (login, thêm `POST /auth/forgot-password`, `POST /auth/reset-password`)
- Test: `tests/accounts.test.ts` (mới); sửa `tests/users-routes.test.ts`, `tests/face.test.ts`, `tests/sync-staff.test.ts`, `tests/area-writes.test.ts`, `tests/auth-routes.test.ts`, `tests/permissions.test.ts`

**Interfaces:**
- Consumes: `enqueueMail`, `runMailJobs` (Task 7); `saveMailConfig`, `getAppUrl` (Task 7); `nextEmployeeCode` (`server/hanet-import.ts`); `manageableUser`, `assertCanEdit`, `requireManager` (Task 5); `sha256`, `LoginLimiter`, `validateNewPassword`, `hashPassword`, `deleteUserSessions` (`server/auth.ts`); `contact()` (Task 1).
- Produces (`server/accounts.ts`):
  - `EMAIL_RE: RegExp`
  - `parseEmail(v: unknown): string` (bỏ khoảng trắng, chữ thường; trống ⇒ 400 "Email là bắt buộc"; sai ⇒ 400 "Email không hợp lệ")
  - `parsePhone(v: unknown): string` (bỏ khoảng trắng `.` `-` `(` `)`; `+84xxxxxxxxx` ⇒ `0xxxxxxxxx`; trống ⇒ 400 "Số điện thoại là bắt buộc"; sai ⇒ 400 "Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0 hoặc +84)")
  - `assertEmailFree(db: Db, email: string, userId: string | null): void` (409 "Email đã được dùng cho nhân sự khác")
  - `findLoginUser(db: Db, login: string): { id: string; code: string; email: string; password_hash: string | null; status: string } | undefined`
  - `RESET_TTL_MS = 1_800_000`, `createResetToken(db, userId, now): string`, `consumeResetToken(db, token, now): string | null`
- Produces (API):
  - `POST /api/users` bắt buộc `email`, `phone`; `code` trống ⇒ tự sinh; trả `{ user, face? }` (**không còn `tempPassword`**); xếp thư `welcome`.
  - `GET /api/users/next-code` → `{ code: string }` (`requireManager`).
  - `PUT /api/users/:id`: `email`/`phone` nếu gửi thì phải hợp lệ; người chưa đăng nhập được (`canLogin = false`) vừa có email ⇒ xếp `welcome`.
  - `POST /api/users/:id/reset-password` → `{ queued: true }`; người chưa có email ⇒ 400; xếp `reset_temp` (đã đăng nhập được) hoặc `welcome` (chưa). Nút "Gửi lại thư" trên giao diện dùng chính API này.
  - `POST /api/auth/login { login | code, password }` — `login` có `@` ⇒ tìm theo email (không phân biệt hoa thường), ngược lại theo mã. Sai ⇒ 401 "Mã nhân viên/email hoặc mật khẩu không đúng".
  - `POST /api/auth/forgot-password { login }` → luôn `{ message: 'Nếu tài khoản tồn tại và có email, thư hướng dẫn đã được gửi.' }`; quá 5 lần/15 phút (theo IP hoặc theo tài khoản) ⇒ 429.
  - `POST /api/auth/reset-password { token, newPassword }` → `{ success: true }`; token sai/hết hạn/đã dùng ⇒ 400 "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn".

- [ ] **Step 1: Viết test `tests/accounts.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client, TEST_PASSWORD, type TestApp } from './helpers';
import { saveMailConfig } from '../server/mail';
import { runMailJobs } from '../server/mail-queue';
import { parseEmail, parsePhone } from '../server/accounts';

const GMAIL = {
  host: 'smtp.gmail.com', port: 465, secure: 'ssl', user: 'hr@gmail.com', password: 'app-pass', fromName: 'Petrolimex Attendance',
  fromEmail: 'hr@gmail.com', appUrl: 'https://petrolimex.hgcvn.cloud', dailyLimit: 450,
};
const flush = (app: TestApp) => runMailJobs({ db: app.db, sendMail: app.ctx.sendMail, now: app.ctx.now });
const lastPassword = (app: TestApp) => /Mật khẩu tạm: (\S+)/.exec(app.mails.at(-1)!.text)![1];

async function setup() {
  const app = await startTestApp();
  saveMailConfig(app.db, GMAIL);
  const kt = seedDepartment(app.db, 'KT', 'Kế toán');
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  return { app, kt, hr: await loginAs(app, 'HR01') };
}

test('parseEmail và parsePhone', () => {
  assert.equal(parseEmail('  An.Nguyen@Gmail.COM '), 'an.nguyen@gmail.com');
  for (const bad of ['', 'abc', 'a@b', 'a b@c.vn']) assert.throws(() => parseEmail(bad), (e: any) => e.status === 400, bad);
  assert.equal(parsePhone('0912 345 678'), '0912345678');
  assert.equal(parsePhone('+84 912.345.678'), '0912345678');
  assert.equal(parsePhone('(091) 234-5678'), '0912345678');
  for (const bad of ['', '091234567', '09123456789', '1912345678', '+8491234567']) assert.throws(() => parsePhone(bad), (e: any) => e.status === 400, bad);
});

test('thêm nhân sự: bắt buộc email và điện thoại, mã tự sinh, mật khẩu gửi qua email, đăng nhập bằng mã hoặc email', async () => {
  const { app, kt, hr } = await setup();
  try {
    assert.equal((await hr.post('/api/users', { name: 'Lê Văn C', phone: '0912345678' })).status, 400);
    assert.equal((await hr.post('/api/users', { name: 'Lê Văn C', email: 'c@test.vn' })).status, 400);
    assert.deepEqual((await hr.get('/api/users/next-code')).body, { code: 'NV0001' });
    const r = await hr.post('/api/users', { name: 'Lê Văn C', email: ' C@Test.vn ', phone: '+84912345678', departmentId: kt });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.tempPassword, undefined);
    assert.deepEqual(
      [r.body.user.code, r.body.user.email, r.body.user.phone, r.body.user.canLogin, r.body.user.emailStatus],
      ['NV0001', 'c@test.vn', '0912345678', false, 'pending'],
    );
    await assert.rejects(loginAs(app, 'NV0001'), 'chưa gửi thư thì chưa đăng nhập được');
    assert.deepEqual(await flush(app), { sent: 1, failed: 0 });
    const pw = lastPassword(app);
    assert.equal(app.mails.at(-1)!.to, 'c@test.vn');
    const byCode = await loginAs(app, 'nv0001', pw);
    assert.equal((await byCode.get('/api/auth/me')).body.mustChangePassword, true);
    const byEmail = new Client(app.baseUrl);
    assert.equal((await byEmail.post('/api/auth/login', { login: 'C@TEST.VN', password: pw })).status, 200);
    assert.equal((await hr.get('/api/users/next-code')).body.code, 'NV0002');
  } finally {
    await app.close();
  }
});

test('Review Focus #3: email trùng (khác hoa thường, có khoảng trắng) → 409, cả khi tạo và khi sửa', async () => {
  const { app, hr } = await setup();
  try {
    const nv = seedUser(app.db, { code: 'NV01', email: 'an@gmail.com' });
    assert.equal((await hr.post('/api/users', { name: 'X', email: 'An@Gmail.com ', phone: '0912345678' })).status, 409);
    const other = seedUser(app.db, { code: 'NV02' });
    assert.equal((await hr.put(`/api/users/${other}`, { email: 'AN@gmail.com' })).status, 409);
    assert.equal((await hr.put(`/api/users/${nv}`, { email: 'an@gmail.com' })).status, 200, 'giữ email của chính mình');
    assert.equal((await hr.put(`/api/users/${nv}`, { phone: '123' })).status, 400);
  } finally {
    await app.close();
  }
});

test('đặt lại mật khẩu hộ: xếp thư, mật khẩu đổi khi thư gửi đi, phiên cũ bị hủy; thiếu email thì 400', async () => {
  const { app, hr } = await setup();
  try {
    const nv = seedUser(app.db, { code: 'NV01', email: 'nv01@test.vn' });
    const noMail = seedUser(app.db, { code: 'NV02' });
    const session = await loginAs(app, 'NV01');
    const r = await hr.post(`/api/users/${nv}/reset-password`);
    assert.deepEqual([r.status, r.body], [200, { queued: true }]);
    assert.equal((await session.get('/api/auth/me')).status, 200, 'chưa gửi thư thì chưa đổi gì');
    await flush(app);
    assert.equal((await session.get('/api/auth/me')).status, 401);
    await assert.rejects(loginAs(app, 'NV01'));
    await loginAs(app, 'NV01', lastPassword(app));
    const e = await hr.post(`/api/users/${noMail}/reset-password`);
    assert.deepEqual([e.status, e.body.error], [400, 'Nhân sự chưa có email: hãy bổ sung email trước']);
  } finally {
    await app.close();
  }
});

test('người nhập từ Camera AI (chưa có email, chưa có mật khẩu): bổ sung email thì tự gửi thư chào mừng', async () => {
  const { app, hr } = await setup();
  try {
    const id = seedUser(app.db, { code: 'NV05', password: null });
    await assert.rejects(loginAs(app, 'NV05'));
    const r = await hr.put(`/api/users/${id}`, { email: 'nv05@test.vn', phone: '0912345678' });
    assert.equal(r.body.user.emailStatus, 'pending');
    await flush(app);
    assert.match(app.mails.at(-1)!.subject, /Tài khoản đăng nhập/);
    await loginAs(app, 'NV05', lastPassword(app));
  } finally {
    await app.close();
  }
});

test('quên mật khẩu: cùng một câu trả lời; link dùng một lần, hạn 30 phút; mật khẩu yếu không làm mất link', async () => {
  let now = Date.UTC(2026, 9, 14, 3, 0);
  const app = await startTestApp({ now: () => now });
  try {
    saveMailConfig(app.db, GMAIL);
    seedUser(app.db, { code: 'NV01', email: 'nv01@test.vn' });
    const anon = new Client(app.baseUrl);
    const msg = 'Nếu tài khoản tồn tại và có email, thư hướng dẫn đã được gửi.';
    assert.deepEqual((await anon.post('/api/auth/forgot-password', { login: 'khong-co@test.vn' })).body, { message: msg });
    assert.deepEqual((await anon.post('/api/auth/forgot-password', { login: 'NV01@TEST.vn' })).body, { message: msg });
    await flush(app);
    assert.equal(app.mails.length, 1);
    const token = decodeURIComponent(/\?reset=(\S+)/.exec(app.mails[0].text)![1]);
    assert.ok(!JSON.stringify(app.db.prepare('SELECT * FROM password_resets').all()).includes(token), 'chỉ lưu băm');
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'ngan' })).status, 400);
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'MatKhauMoi@2026' })).status, 200);
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'MatKhauKhac@2026' })).status, 400, 'đã dùng');
    await loginAs(app, 'NV01', 'MatKhauMoi@2026');
    await anon.post('/api/auth/forgot-password', { login: 'NV01' });
    await flush(app);
    const token2 = decodeURIComponent(/\?reset=(\S+)/.exec(app.mails[1].text)![1]);
    now += 31 * 60_000;
    const late = await anon.post('/api/auth/reset-password', { token: token2, newPassword: 'MatKhauMoi@2027' });
    assert.deepEqual([late.status, late.body.error], [400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn']);
  } finally {
    await app.close();
  }
});

test('quên mật khẩu: quá 5 lần trong 15 phút thì 429', async () => {
  const app = await startTestApp();
  try {
    const anon = new Client(app.baseUrl);
    for (let i = 0; i < 5; i++) assert.equal((await anon.post('/api/auth/forgot-password', { login: 'x' })).status, 200);
    assert.equal((await anon.post('/api/auth/forgot-password', { login: 'x' })).status, 429);
  } finally {
    await app.close();
  }
});

test('đăng nhập: tài khoản chưa có mật khẩu báo cùng lỗi như sai mật khẩu', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01', email: 'nv01@test.vn', password: null });
    const r = await new Client(app.baseUrl).post('/api/auth/login', { login: 'nv01@test.vn', password: TEST_PASSWORD });
    assert.deepEqual([r.status, r.body.error], [401, 'Mã nhân viên/email hoặc mật khẩu không đúng']);
  } finally {
    await app.close();
  }
});

```

- [ ] **Step 2: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/accounts.test.ts`
Expected: FAIL — `Cannot find module '../server/accounts'`.

- [ ] **Step 3: Tạo `server/accounts.ts`**

```ts
import { randomBytes } from 'node:crypto';
import type { Db } from './db';
import { HttpError } from './errors';
import { sha256 } from './auth';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const RESET_TTL_MS = 30 * 60_000;

export function parseEmail(v: unknown): string {
  const email = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!email) throw new HttpError(400, 'Email là bắt buộc');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email không hợp lệ');
  return email;
}

/** Số Việt Nam: 10 chữ số bắt đầu bằng 0, hoặc +84 và 9 chữ số; lưu dạng 0xxxxxxxxx. */
export function parsePhone(v: unknown): string {
  const raw = typeof v === 'string' ? v.replace(/[\s.\-()]/g, '') : '';
  if (!raw) throw new HttpError(400, 'Số điện thoại là bắt buộc');
  const phone = /^\+84\d{9}$/.test(raw) ? `0${raw.slice(3)}` : raw;
  if (!/^0\d{9}$/.test(phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0 hoặc +84)');
  return phone;
}

export function assertEmailFree(db: Db, email: string, userId: string | null): void {
  const holder = db.prepare("SELECT id FROM users WHERE email != '' AND lower(email) = ?").get(email.toLowerCase()) as { id: string } | undefined;
  if (holder && holder.id !== userId) throw new HttpError(409, 'Email đã được dùng cho nhân sự khác');
}

/** Tài khoản theo chuỗi đăng nhập: có '@' thì theo email (không phân biệt hoa thường), ngược lại theo mã nhân viên. */
export function findLoginUser(db: Db, login: string): { id: string; code: string; email: string; password_hash: string | null; status: string } | undefined {
  const s = login.trim();
  if (!s) return undefined;
  const sql = 'SELECT id, code, email, password_hash, status FROM users WHERE ';
  return (
    s.includes('@')
      ? db.prepare(`${sql} email != '' AND lower(email) = ?`).get(s.toLowerCase())
      : db.prepare(`${sql} code = ?`).get(s.toUpperCase())
  ) as { id: string; code: string; email: string; password_hash: string | null; status: string } | undefined;
}

/** Token đặt lại mật khẩu: chỉ lưu băm, hạn 30 phút, hủy các token cũ của người đó. */
export function createResetToken(db: Db, userId: string, now: number): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO password_resets(token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, now + RESET_TTL_MS);
  return token;
}

/** Dùng token (một lần). Trả user_id, hoặc null nếu sai/hết hạn/đã dùng. */
export function consumeResetToken(db: Db, token: string, now: number): string | null {
  const row = db.prepare('SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(sha256(token), now) as
    | { user_id: string }
    | undefined;
  if (!row) return null;
  db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(now, sha256(token));
  return row.user_id;
}
```

- [ ] **Step 4: `server/routes/users.ts`**

Import `assertEmailFree, parseEmail, parsePhone` từ `'../accounts'`, `enqueueMail` từ `'../mail-queue'`, `nextEmployeeCode` từ `'../hanet-import'` (gộp vào dòng import `hanet-import` sẵn có). Bỏ `generateTempPassword`, `hashPassword` khỏi import `'../auth'` nếu không còn dùng.

Thêm route (trước `r.post('/users', …)`):

```ts
  r.get('/users/next-code', requireManager, (_req, res) => {
    res.json({ code: nextEmployeeCode(db) });
  });
```

`POST /users` — thay phần đầu tới hết câu `INSERT` + `setAdminAreas`:

```ts
      const actor = currentUser(req);
      const b = req.body ?? {};
      const code = (str(b.code) ?? '').toUpperCase() || nextEmployeeCode(db);
      const name = str(b.name) ?? '';
      if (!CODE_RE.test(code)) throw new HttpError(400, CODE_ERROR);
      // Mã ADMIN mang quyền xóa dữ liệu: chỉ hệ thống được tạo, kể cả khi database chưa có tài khoản này.
      if (code === SYSTEM_ADMIN_CODE) throw new HttpError(400, 'Mã ADMIN dành riêng cho tài khoản quản trị hệ thống');
      if (!name) throw new HttpError(400, 'Họ tên là bắt buộc');
      const role = b.role === undefined ? 'employee' : b.role;
      assertRoleAllowed(actor, role);
      const departmentId = resolveDepartmentFor(db, actor, b.departmentId);
      const email = parseEmail(b.email);
      const phone = parsePhone(b.phone);
      const adminAreaIds = role === 'area_admin' ? parseAdminAreaIds(db, b.adminAreaIds) : [];
      if (db.prepare('SELECT 1 FROM users WHERE code = ?').get(code)) throw new HttpError(409, 'Mã nhân viên đã tồn tại');
      assertEmailFree(db, email, null);
      const image = resolveFaceImage(db, actor, null, b, ctx.now());
      const hanetPersonId = str(b.hanetPersonId) || null;
      assertPersonIdFree(db, hanetPersonId, null);

      const id = newId('usr');
      // Chưa có mật khẩu: mật khẩu tạm được sinh và gửi qua email khi thư chào mừng đi (mail-queue)
      db.prepare(
        `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
           face_registered, status, password_hash, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, 1, ?)`,
      ).run(id, code, name, email, phone, role, departmentId, str(b.position) ?? '', str(b.avatarUrl) ?? '', hanetPersonId, hanetPersonId ? 1 : 0, toVnDate(ctx.now()));
      if (adminAreaIds.length) setAdminAreas(db, id, adminAreaIds);
      enqueueMail(db, id, 'welcome', {}, ctx.now());
```

và ở cuối handler: `res.json({ user: getUser(db, id), ...(face ? { face } : {}) });` (bỏ `tempPassword`).

`PUT /users/:id` — thay vòng lặp `for (const [key, col] of [['email', …` bằng:

```ts
    if (b.email !== undefined) {
      const email = parseEmail(b.email);
      assertEmailFree(db, email, target.id);
      set('email', email);
    }
    if (b.phone !== undefined) set('phone', parsePhone(b.phone));
    for (const [key, col] of [['position', 'position'], ['avatarUrl', 'avatar_url']] as const) {
      if (b[key] !== undefined) set(col, str(b[key]) ?? '');
    }
```

và ngay sau khối `tx(db, () => { … })` thêm:

```ts
    // Người chưa đăng nhập được (nhập từ Camera AI, hoặc thư chào mừng lỗi) vừa có/đổi email: gửi thư chào mừng
    if (b.email !== undefined && !target.canLogin && parseEmail(b.email) !== target.email.toLowerCase()) {
      enqueueMail(db, target.id, 'welcome', {}, ctx.now());
    }
```

`POST /users/:id/reset-password`:

```ts
  r.post('/users/:id/reset-password', requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanEdit(actor, target);
    if (!target.email) throw new HttpError(400, 'Nhân sự chưa có email: hãy bổ sung email trước');
    enqueueMail(db, target.id, target.canLogin ? 'reset_temp' : 'welcome', {}, ctx.now());
    console.warn(`[SECURITY] password_reset_queued by=${actor.code} target=${target.code} ip=${req.ip}`);
    res.json({ queued: true });
  });
```

- [ ] **Step 5: `server/routes/auth.ts`**

Import `findLoginUser, consumeResetToken, createResetToken` từ `'../accounts'`, `enqueueMail` từ `'../mail-queue'`, `getAppUrl` từ `'../mail'`, `LoginLimiter` từ `'../auth'`.

Thay `POST /auth/login`:

```ts
  r.post('/auth/login', jsonOnly, (req, res) => {
    const b = req.body ?? {};
    const raw = typeof b.login === 'string' ? b.login : typeof b.code === 'string' ? b.code : '';
    const login = raw.includes('@') ? raw.trim().toLowerCase() : raw.trim().toUpperCase();
    const password = typeof b.password === 'string' ? b.password : '';
    const key = `${login}|${req.ip}`;
    const now = ctx.now();
    if (ctx.limiter.isBlocked(key, now)) {
      console.warn(`[SECURITY] login_blocked login=${login} ip=${req.ip}`);
      throw new HttpError(429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút');
    }
    const row = findLoginUser(db, login);
    if (!row || row.status !== 'active' || !verifyPassword(password, row.password_hash)) {
      ctx.limiter.recordFailure(key, now);
      console.warn(`[SECURITY] login_failed login=${login} ip=${req.ip}`);
      throw new HttpError(401, 'Mã nhân viên/email hoặc mật khẩu không đúng');
    }
    ctx.limiter.reset(key);
    setSessionCookie(res, createSession(db, row.id, now), ctx);
    res.json({ success: true });
  });

  // Mỗi lần yêu cầu đều tính (không chỉ lần lỗi) để không ai dò hộp thư người khác
  const forgotByIp = new LoginLimiter(5, 15 * 60_000);
  const forgotByLogin = new LoginLimiter(5, 15 * 60_000);
  const FORGOT_MESSAGE = 'Nếu tài khoản tồn tại và có email, thư hướng dẫn đã được gửi.';

  r.post('/auth/forgot-password', jsonOnly, (req, res) => {
    const raw = typeof req.body?.login === 'string' ? req.body.login.trim() : '';
    const login = raw.includes('@') ? raw.toLowerCase() : raw.toUpperCase();
    const now = ctx.now();
    const ipKey = String(req.ip);
    if (forgotByIp.isBlocked(ipKey, now) || forgotByLogin.isBlocked(login, now)) {
      throw new HttpError(429, 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 15 phút');
    }
    forgotByIp.recordFailure(ipKey, now);
    forgotByLogin.recordFailure(login, now);
    const u = findLoginUser(db, login);
    if (u && u.status === 'active' && u.email) {
      if (getAppUrl(db)) {
        enqueueMail(db, u.id, 'reset_link', { token: createResetToken(db, u.id, now) }, now);
        console.warn(`[SECURITY] password_reset_link_queued user=${u.code} ip=${req.ip}`);
      } else {
        console.warn('[MAIL] forgot_password bỏ qua: chưa cấu hình địa chỉ web (mail.app_url)');
      }
    }
    res.json({ message: FORGOT_MESSAGE });
  });

  r.post('/auth/reset-password', jsonOnly, (req, res) => {
    const { token, newPassword } = req.body ?? {};
    // Kiểm tra mật khẩu trước khi dùng token: mật khẩu yếu không làm mất link
    const error = validateNewPassword(newPassword, '');
    if (error) throw new HttpError(400, error);
    const userId = typeof token === 'string' && token ? consumeResetToken(db, token, ctx.now()) : null;
    const u = userId ? (db.prepare('SELECT id, status FROM users WHERE id = ?').get(userId) as { id: string; status: string } | undefined) : undefined;
    if (!u || u.status !== 'active') throw new HttpError(400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(newPassword), u.id);
    deleteUserSessions(db, u.id);
    res.json({ success: true });
  });
```

(`hashPassword`, `deleteUserSessions`, `validateNewPassword`, `verifyPassword`, `createSession` đã có trong import `'../auth'`; thêm `LoginLimiter`.)

- [ ] **Step 6: Sửa các test cũ theo luật mới**

- `tests/auth-routes.test.ts`: chuỗi `'Mã nhân viên hoặc mật khẩu không đúng'` ⇒ `'Mã nhân viên/email hoặc mật khẩu không đúng'`.
- Mọi lời gọi tạo nhân sự `…post('/api/users', { … })` mà mong đợi **thành công hoặc lỗi sau bước kiểm tra email** trong `tests/users-routes.test.ts`, `tests/face.test.ts`, `tests/sync-staff.test.ts`, `tests/area-writes.test.ts`: thêm `...contact('<mã>')` vào body (import `contact` từ `./helpers`). Ví dụ: `hr.post('/api/users', { ...contact('nv09'), code: 'nv09', name: 'Cao Văn Hùng & Cộng sự', position: 'Kế toán viên', sightingId })`. Với ca trùng mã (`code: 'nv01'` mong 409) cũng thêm `contact('NV19')` (email khác) để lỗi 409 đến từ mã.
- `tests/face.test.ts`: `assert.ok(r.body.tempPassword);` ⇒ `assert.equal(r.body.tempPassword, undefined);`.
- `tests/users-routes.test.ts`, test `'HR tạo nhân viên → mật khẩu tạm dùng được và bị bắt đổi'`: thay thân test bằng

```ts
  const { app, kt } = await setup();
  try {
    saveMailConfig(app.db, {
      host: 'smtp.gmail.com', port: 465, secure: 'ssl', user: 'hr@gmail.com', password: 'p', fromName: 'P', fromEmail: 'hr@gmail.com',
      appUrl: 'https://petrolimex.hgcvn.cloud', dailyLimit: 450,
    });
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/users', { ...contact('nv03'), code: 'nv03', name: 'Lê Văn C', departmentId: kt, position: 'Kế toán viên' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.code, 'NV03');
    assert.equal(r.body.user.departmentName, 'Kế toán');
    assert.equal(r.body.user.hanetPersonId, null);
    assert.equal(r.body.user.faceRegistered, false);
    assert.equal(r.body.tempPassword, undefined);
    await runMailJobs({ db: app.db, sendMail: app.ctx.sendMail, now: app.ctx.now });
    const pw = /Mật khẩu tạm: (\S+)/.exec(app.mails[0].text)![1];
    const nv = await loginAs(app, 'NV03', pw);
    assert.equal((await nv.get('/api/auth/me')).body.mustChangePassword, true);
  } finally {
    await app.close();
  }
```

  (import `saveMailConfig` từ `'../server/mail'`, `runMailJobs` từ `'../server/mail-queue'`; bỏ assert `r.body.user.email === ''`.)
- `tests/users-routes.test.ts`, test `'HR đặt lại mật khẩu: …'`: thay thân test bằng

```ts
  const { app, ids } = await setup();
  try {
    saveMailConfig(app.db, {
      host: 'smtp.gmail.com', port: 465, secure: 'ssl', user: 'hr@gmail.com', password: 'p', fromName: 'P', fromEmail: 'hr@gmail.com',
      appUrl: 'https://petrolimex.hgcvn.cloud', dailyLimit: 450,
    });
    app.db.prepare("UPDATE users SET email = 'nv01@test.vn' WHERE id = ?").run(ids.nv1);
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NV01');
    assert.deepEqual((await hr.post(`/api/users/${ids.nv1}/reset-password`)).body, { queued: true });
    await runMailJobs({ db: app.db, sendMail: app.ctx.sendMail, now: app.ctx.now });
    assert.equal((await nv.get('/api/auth/me')).status, 401);
    await assert.rejects(loginAs(app, 'NV01'));
    await loginAs(app, 'NV01', /Mật khẩu tạm: (\S+)/.exec(app.mails[0].text)![1]);
  } finally {
    await app.close();
  }
```

- `tests/permissions.test.ts`: thêm ca `{ method: 'GET', path: () => '/api/users/next-code', allowed: MANAGERS },` (trước nhóm xóa).

- [ ] **Step 7: Toàn bộ test + lint; commit**

Run: `npx tsx --test tests/accounts.test.ts && npm test && npm run lint`
Expected: PASS.

```bash
git add server tests
git commit -m "feat(accounts): required email/phone, auto codes, passwords by email, login by email, forgot password

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Nhập nhân sự từ file CSV (đọc ở trình duyệt, kiểm tra và tạo ở server)

**Files:**
- Create: `src/csv.ts` (đọc CSV, file mẫu)
- Create: `server/csv-import.ts`
- Modify: `server/routes/users.ts` (`POST /users/import-csv/preview`, `POST /users/import-csv`)
- Modify: `shared/types.ts` (`CsvRowInput`, `CsvPreviewRow`)
- Modify: `tests/permissions.test.ts` (2 ca)
- Test: `tests/csv.test.ts` (mới), `tests/csv-import.test.ts` (mới)

**Interfaces:**
- Consumes: `parseEmail`, `parsePhone` (Task 8); `managesArea`, `isGlobalHr` (Task 2); `nextEmployeeCode`, `hanetAliases`, `fetchAllPersons` (`server/hanet-import.ts`); `enqueueMail` (Task 7); `CODE_RE` (`server/validation.ts`); `SYSTEM_ADMIN_CODE`.
- Produces (`shared/types.ts`):
  - `CsvRowInput { code: string; name: string; email: string; phone: string; departmentCode: string; position: string; role: string }`
  - `CsvPreviewRow { line: number; ok: boolean; errors: string[]; code: string | null; name: string; email: string }`
- Produces (`src/csv.ts`): `parseCsv(text: string): string[][]`; `csvToRows(text: string): { rows: CsvRowInput[]; error: string | null }`; `CSV_TEMPLATE: string`; `CSV_MAX_ROWS = 200`.
- Produces (`server/csv-import.ts`): `CSV_MAX_ROWS = 200`; `checkCsvRows(db, actor: AuthUser, rows: unknown, reserved: Set<string>): { preview: CsvPreviewRow[]; valid: ValidCsvRow[] }`; `createCsvUsers(db, valid: ValidCsvRow[], now: number): ImportedUser[]`; `ValidCsvRow { code; name; email; phone; departmentId; position; role: 'employee' | 'dept_manager' }`.
- Produces (API, `requireManager`): `POST /api/users/import-csv/preview { rows: CsvRowInput[] }` → `{ rows: CsvPreviewRow[] }` (không tạo gì); `POST /api/users/import-csv { rows }` → `{ created: ImportedUser[]; skipped: number }`.

- [ ] **Step 1: Viết test `tests/csv.test.ts` (đọc CSV)**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvToRows, parseCsv, CSV_TEMPLATE } from '../src/csv';

test('parseCsv: dấu phẩy, ngoặc kép, ngoặc kép lồng, CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
});

test('Review Focus #5: file Excel tiếng Việt — dấu chấm phẩy, BOM, dòng trống cuối file', () => {
  const text = '﻿ma_nhan_vien;ho_ten;email;so_dien_thoai;ma_phong_ban;chuc_vu;vai_tro\r\n;Nguyễn Văn An;an@test.vn;0912 345 678;PB001;"Kế toán; tổng hợp";nhan_vien\r\n;;;;;;\r\n\r\n';
  const { rows, error } = csvToRows(text);
  assert.equal(error, null);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    code: '', name: 'Nguyễn Văn An', email: 'an@test.vn', phone: '0912 345 678', departmentCode: 'PB001', position: 'Kế toán; tổng hợp', role: 'nhan_vien',
  });
});

test('csvToRows: tiêu đề không phân biệt hoa thường, thứ tự tùy ý; thiếu cột bắt buộc thì báo lỗi', () => {
  const ok = csvToRows('Email,HO_TEN,so_dien_thoai,ma_phong_ban\nb@test.vn,Trần B,0912345678,PB002\n');
  assert.equal(ok.error, null);
  assert.deepEqual(ok.rows[0], { code: '', name: 'Trần B', email: 'b@test.vn', phone: '0912345678', departmentCode: 'PB002', position: '', role: '' });
  assert.equal(csvToRows('ho_ten,email\nA,a@test.vn\n').error, 'Thiếu cột bắt buộc: so_dien_thoai, ma_phong_ban');
  assert.equal(csvToRows('').error, 'File trống');
});

test('file mẫu đọc lại được', () => {
  const { rows, error } = csvToRows(CSV_TEMPLATE);
  assert.equal(error, null);
  assert.equal(rows.length, 1);
});
```

- [ ] **Step 2: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/csv.test.ts`
Expected: FAIL — `Cannot find module '../src/csv'`.

- [ ] **Step 3: Thêm kiểu vào `shared/types.ts`**

```ts
/** Một dòng file CSV nhập nhân sự (đã ánh xạ tiêu đề cột). */
export interface CsvRowInput {
  code: string;
  name: string;
  email: string;
  phone: string;
  departmentCode: string;
  position: string;
  role: string; // 'nhan_vien' | 'truong_phong' | ''
}

export interface CsvPreviewRow {
  line: number; // số dòng trong file (dòng tiêu đề là 1)
  ok: boolean;
  errors: string[];
  code: string | null; // mã sẽ dùng (null nếu dòng lỗi)
  name: string;
  email: string;
}
```

- [ ] **Step 4: Tạo `src/csv.ts`**

```ts
import type { CsvRowInput } from './types';

export const CSV_MAX_ROWS = 200;

/** Cột trong file → trường dữ liệu. */
const COLUMNS: Record<string, keyof CsvRowInput> = {
  ma_nhan_vien: 'code',
  ho_ten: 'name',
  email: 'email',
  so_dien_thoai: 'phone',
  ma_phong_ban: 'departmentCode',
  chuc_vu: 'position',
  vai_tro: 'role',
};
const REQUIRED = ['ho_ten', 'email', 'so_dien_thoai', 'ma_phong_ban'];

export const CSV_TEMPLATE =
  '﻿ma_nhan_vien,ho_ten,email,so_dien_thoai,ma_phong_ban,chuc_vu,vai_tro\r\n' +
  ',Nguyễn Văn An,an.nguyen@petrolimex.com.vn,0912345678,PB001,Nhân viên,nhan_vien\r\n';

/** Đọc CSV: tự nhận dấu `,` hoặc `;` (Excel tiếng Việt hay dùng `;`), bỏ BOM, hỗ trợ ô trong ngoặc kép và CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const header = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Ánh xạ CSV thành các dòng nhân sự; bỏ dòng trống hoàn toàn. */
export function csvToRows(text: string): { rows: CsvRowInput[]; error: string | null } {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (table.length === 0) return { rows: [], error: 'File trống' };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], error: `Thiếu cột bắt buộc: ${missing.join(', ')}` };
  const rows = table.slice(1).map((cells) => {
    const r: CsvRowInput = { code: '', name: '', email: '', phone: '', departmentCode: '', position: '', role: '' };
    header.forEach((h, i) => {
      const key = COLUMNS[h];
      if (key) r[key] = (cells[i] ?? '').trim();
    });
    return r;
  });
  return { rows, error: null };
}
```

- [ ] **Step 5: Chạy `tests/csv.test.ts`, thấy PASS**

Run: `npx tsx --test tests/csv.test.ts`
Expected: PASS.

- [ ] **Step 6: Viết test `tests/csv-import.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, type TestApp } from './helpers';

const row = (o: Partial<Record<string, string>>) => ({ code: '', name: 'Người A', email: 'a@test.vn', phone: '0912345678', departmentCode: 'PA', position: '', role: '', ...o });

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const ids = { A, B, pa: seedDepartment(app.db, 'PA', 'PA', A), pb: seedDepartment(app.db, 'PB', 'PB', B) };
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  seedUser(app.db, { code: 'QKA', role: 'area_admin', adminAreaIds: [A] });
  seedUser(app.db, { code: 'NV0003', email: 'daco@test.vn' });
  return { app, ids };
}

test('xem trước: báo lỗi từng dòng, không tạo gì; mã tự sinh không trùng', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const rows = [
      row({ name: 'An', email: 'an@test.vn' }),
      row({ name: 'Bình', email: 'AN@test.vn' }), // trùng email trong file
      row({ name: '', email: 'c@test.vn' }),
      row({ name: 'Dũng', email: 'daco@test.vn' }), // trùng email đã có
      row({ name: 'Em', email: 'e@test.vn', phone: '123', departmentCode: 'KHONGCO', role: 'giam_doc' }),
      row({ name: 'Phúc', email: 'f@test.vn', code: 'nv0003' }), // trùng mã đã có
      row({ name: 'Giang', email: 'g@test.vn', code: 'admin' }),
      row({ name: 'Hà', email: 'h@test.vn', role: 'truong_phong' }),
    ];
    const r = await hr.post('/api/users/import-csv/preview', { rows });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = r.body.rows;
    assert.deepEqual(p.map((x: { ok: boolean }) => x.ok), [true, false, false, false, false, false, false, true]);
    assert.deepEqual(p.map((x: { line: number }) => x.line), [2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual([p[0].code, p[7].code], ['NV0004', 'NV0005']);
    assert.deepEqual(p[1].errors, ['Email trùng với dòng khác trong file']);
    assert.deepEqual(p[2].errors, ['Họ tên là bắt buộc']);
    assert.deepEqual(p[3].errors, ['Email đã được dùng cho nhân sự khác']);
    assert.deepEqual(p[4].errors, [
      'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0 hoặc +84)',
      'Mã phòng ban không tồn tại',
      'Vai trò chỉ được là nhan_vien hoặc truong_phong',
    ]);
    assert.deepEqual(p[5].errors, ['Mã nhân viên đã tồn tại']);
    assert.deepEqual(p[6].errors, ['Mã ADMIN dành riêng cho tài khoản quản trị hệ thống']);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM users WHERE email IN ('an@test.vn','h@test.vn')").get()!.c, 0, 'xem trước không tạo gì');
  } finally {
    await app.close();
  }
});

test('tạo: chỉ dòng hợp lệ, mỗi người một thư chào mừng, chưa đăng nhập được tới khi thư gửi', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/users/import-csv', { rows: [row({ email: 'x@test.vn' }), row({ name: '', email: 'y@test.vn' }), row({ email: 'z@test.vn', role: 'truong_phong' })] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.created.length, r.body.skipped], [2, 1]);
    const u = app.db.prepare("SELECT role, password_hash, email_status, phone FROM users WHERE email = 'z@test.vn'").get() as Record<string, unknown>;
    assert.deepEqual({ ...u }, { role: 'dept_manager', password_hash: null, email_status: 'pending', phone: '0912345678' });
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM email_jobs WHERE kind = 'welcome' AND status = 'pending'").get()!.c, 2);
    assert.equal((await hr.post('/api/users/import-csv', { rows: [row({ name: '' })] })).status, 400);
  } finally {
    await app.close();
  }
});

test('quản trị khu: chỉ dùng phòng trong khu; quá 200 dòng thì 400', async () => {
  const { app } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    const p = (await qk.post('/api/users/import-csv/preview', { rows: [row({ email: 'a1@test.vn' }), row({ email: 'b1@test.vn', departmentCode: 'PB' })] })).body.rows;
    assert.deepEqual([p[0].ok, p[1].ok, p[1].errors], [true, false, ['Mã phòng ban không tồn tại']]);
    const many = Array.from({ length: 201 }, (_, i) => row({ email: `u${i}@test.vn` }));
    const r = await qk.post('/api/users/import-csv/preview', { rows: many });
    assert.deepEqual([r.status, r.body.error], [400, 'Mỗi lần nhập tối đa 200 dòng']);
    assert.equal((await qk.post('/api/users/import-csv/preview', { rows: 'x' })).status, 400);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 7: Chạy test, thấy FAIL**

Run: `npx tsx --test tests/csv-import.test.ts`
Expected: FAIL — `/api/users/import-csv/preview` 404.

- [ ] **Step 8: Tạo `server/csv-import.ts`**

```ts
import type { Db } from './db';
import { newId, tx } from './db';
import { HttpError } from './errors';
import type { AuthUser } from './auth';
import { managesArea } from './access';
import { parseEmail, parsePhone } from './accounts';
import { nextEmployeeCode } from './hanet-import';
import { enqueueMail } from './mail-queue';
import { SYSTEM_ADMIN_CODE } from './bootstrap';
import { CODE_RE, CODE_ERROR } from './validation';
import { toVnDate } from './vntime';
import type { CsvPreviewRow, ImportedUser } from '../shared/types';

export const CSV_MAX_ROWS = 200;
const ROLE_MAP: Record<string, 'employee' | 'dept_manager'> = { '': 'employee', nhan_vien: 'employee', truong_phong: 'dept_manager' };

export interface ValidCsvRow {
  code: string;
  name: string;
  email: string;
  phone: string;
  departmentId: string;
  position: string;
  role: 'employee' | 'dept_manager';
}

const cell = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const errText = (e: unknown): string => (e instanceof HttpError ? e.message : 'Dữ liệu không hợp lệ');

/**
 * Kiểm tra mọi dòng (không ghi gì). Mỗi dòng gom đủ lỗi. Mã trống được tự sinh sau khi kiểm tra xong,
 * không trùng mã trong DB, mã khác trong file và aliasID đang có trên Camera AI (reserved).
 */
export function checkCsvRows(db: Db, actor: AuthUser, rows: unknown, reserved: Set<string>): { preview: CsvPreviewRow[]; valid: ValidCsvRow[] } {
  if (!Array.isArray(rows)) throw new HttpError(400, 'Dữ liệu nhập không hợp lệ');
  if (rows.length === 0) throw new HttpError(400, 'File không có dòng nào');
  if (rows.length > CSV_MAX_ROWS) throw new HttpError(400, `Mỗi lần nhập tối đa ${CSV_MAX_ROWS} dòng`);
  const deptByCode = db.prepare('SELECT id, area_id FROM departments WHERE code = ?');
  const codeTaken = db.prepare('SELECT 1 FROM users WHERE code = ?');
  const emailTaken = db.prepare("SELECT 1 FROM users WHERE email != '' AND lower(email) = ?");
  const fileEmails = new Map<string, number>();
  const fileCodes = new Map<string, number>();
  for (const r of rows as Record<string, unknown>[]) {
    const e = cell(r?.email).toLowerCase();
    if (e) fileEmails.set(e, (fileEmails.get(e) ?? 0) + 1);
    const c = cell(r?.code).toUpperCase();
    if (c) fileCodes.set(c, (fileCodes.get(c) ?? 0) + 1);
  }
  const seenEmails = new Set<string>();
  const checked = (rows as Record<string, unknown>[]).map((r, i) => {
    const errors: string[] = [];
    const name = cell(r?.name);
    if (!name) errors.push('Họ tên là bắt buộc');
    let email = '';
    try {
      email = parseEmail(r?.email);
      if (seenEmails.has(email)) errors.push('Email trùng với dòng khác trong file');
      else if (emailTaken.get(email)) errors.push('Email đã được dùng cho nhân sự khác');
      seenEmails.add(email);
    } catch (e) {
      errors.push(errText(e));
    }
    let phone = '';
    try {
      phone = parsePhone(r?.phone);
    } catch (e) {
      errors.push(errText(e));
    }
    const dept = deptByCode.get(cell(r?.departmentCode).toUpperCase()) as { id: string; area_id: string | null } | undefined;
    // Phòng ngoài khu báo như không tồn tại (không lộ dữ liệu khu khác)
    if (!dept || !managesArea(actor, dept.area_id)) errors.push('Mã phòng ban không tồn tại');
    const role = ROLE_MAP[cell(r?.role).toLowerCase()];
    if (!role) errors.push('Vai trò chỉ được là nhan_vien hoặc truong_phong');
    const code = cell(r?.code).toUpperCase();
    if (code) {
      if (!CODE_RE.test(code)) errors.push(CODE_ERROR);
      else if (code === SYSTEM_ADMIN_CODE) errors.push('Mã ADMIN dành riêng cho tài khoản quản trị hệ thống');
      else if (codeTaken.get(code)) errors.push('Mã nhân viên đã tồn tại');
      else if ((fileCodes.get(code) ?? 0) > 1) errors.push('Mã nhân viên trùng với dòng khác trong file');
    }
    return { line: i + 2, errors, name, email, phone, code, departmentId: dept?.id ?? '', position: cell(r?.position), role: role ?? 'employee' };
  });
  // Mã tự sinh: tránh mã trong DB (nextEmployeeCode), mã ghi sẵn trong file và aliasID trên Camera AI
  const taken = new Set<string>([...reserved, ...fileCodes.keys()]);
  const preview: CsvPreviewRow[] = [];
  const valid: ValidCsvRow[] = [];
  for (const c of checked) {
    const ok = c.errors.length === 0;
    let code: string | null = null;
    if (ok) {
      code = c.code || nextEmployeeCode(db, taken);
      taken.add(code);
      valid.push({ code, name: c.name, email: c.email, phone: c.phone, departmentId: c.departmentId, position: c.position, role: c.role });
    }
    preview.push({ line: c.line, ok, errors: c.errors, code, name: c.name, email: c.email });
  }
  return { preview, valid };
}

/** Tạo nhân sự từ các dòng hợp lệ trong một giao dịch; mỗi người một thư chào mừng (mật khẩu sinh lúc gửi). */
export function createCsvUsers(db: Db, valid: ValidCsvRow[], now: number): ImportedUser[] {
  const insert = db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', NULL, 0, 'active', NULL, 1, ?)`,
  );
  return tx(db, () =>
    valid.map((v) => {
      const id = newId('usr');
      insert.run(id, v.code, v.name, v.email, v.phone, v.role, v.departmentId, v.position, toVnDate(now));
      enqueueMail(db, id, 'welcome', {}, now);
      return { id, code: v.code, name: v.name };
    }),
  );
}
```

Ghi chú: `nextEmployeeCode(db, taken)` trả `NV` + số lớn nhất trong DB + 1, bỏ qua mã có trong `taken`; vì mỗi mã vừa cấp được thêm vào `taken`, các lần gọi sau trong cùng file ra mã kế tiếp.

- [ ] **Step 9: Route trong `server/routes/users.ts`**

Import `checkCsvRows, createCsvUsers` từ `'../csv-import'`. Thêm trong `userRoutes` (trước `r.post('/users', …)`):

```ts
  /** aliasID đang có trên Camera AI để mã tự sinh không trùng; không cấu hình hoặc lỗi gọi thì bỏ qua. */
  const cameraAliases = async (): Promise<Set<string>> => {
    const placeId = getPlaceIds(db)[0];
    if (!reconcileEnabled(db) || !placeId) return new Set();
    try {
      return hanetAliases(await fetchAllPersons(deps, placeId));
    } catch {
      return new Set();
    }
  };

  r.post(
    '/users/import-csv/preview',
    requireManager,
    ah(async (req, res) => {
      const { preview } = checkCsvRows(db, currentUser(req), req.body?.rows, await cameraAliases());
      res.json({ rows: preview });
    }),
  );

  r.post(
    '/users/import-csv',
    requireManager,
    ah(async (req, res) => {
      const { preview, valid } = checkCsvRows(db, currentUser(req), req.body?.rows, await cameraAliases());
      if (valid.length === 0) throw new HttpError(400, 'Không có dòng hợp lệ để tạo');
      const created = createCsvUsers(db, valid, ctx.now());
      res.json({ created, skipped: preview.length - valid.length });
    }),
  );
```

`tests/permissions.test.ts`: thêm (trước nhóm xóa):

```ts
  { method: 'POST', path: () => '/api/users/import-csv/preview', body: { rows: [] }, allowed: MANAGERS },
  { method: 'POST', path: () => '/api/users/import-csv', body: { rows: [] }, allowed: MANAGERS },
```

- [ ] **Step 10: Chạy test, PASS; toàn bộ test + lint; commit**

Run: `npx tsx --test tests/csv.test.ts tests/csv-import.test.ts && npm test && npm run lint`
Expected: PASS.

```bash
git add src/csv.ts server/csv-import.ts server/routes/users.ts shared/types.ts tests
git commit -m "feat(import): bulk create employees from CSV with per-line validation and welcome emails

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Giao diện khu vực và phân quyền

**Files:**
- Create: `src/area.ts`, `src/permissions.ts`, `src/components/AreaSelect.tsx`, `src/components/AreasTab.tsx`
- Modify: `src/App.tsx`, `src/components/Navbar.tsx`, `src/components/DepartmentsTab.tsx`, `src/components/CamerasTab.tsx`, `src/components/EmployeesTab.tsx`, `src/components/UserFormModal.tsx`, `src/components/StatsCards.tsx`, `src/components/AttendanceTable.tsx`, `src/components/HanetConfigTab.tsx`, `src/components/config/BackupsCard.tsx`
- Modify: `server/routes/hanet.ts` (`GET /hanet/config` che token webhook với người không phải `ADMIN`)
- Test: `tests/config-view.test.ts` (mới)

**Interfaces:**
- Consumes: `MeResponse.areas`, `MeResponse.isSystemAdmin` (Task 3); `User.areaId/areaName/adminAreaIds`, `Department.areaId/areaName`, `Camera.areaId/areaName`, `Area` (Task 1); API `?area=` (Task 4), `/api/areas` (Task 3), body `areaId`/`adminAreaIds` (Task 5).
- Produces:
  - `src/area.ts`: `loadArea(): string`, `saveArea(v: string): void`, `areaParam(area: string): string`.
  - `src/permissions.ts`: `isManagerRole(u: User): boolean`, `canDeleteUserUi(me: User, isSystemAdmin: boolean, t: User): boolean`, `assignableRoles(me: User, isSystemAdmin: boolean): UserRole[]`.
  - `AreaSelect({ me, value, onChange })`, `AreasTab({ onChanged })`.
  - Props mới: `Navbar.extra?: React.ReactNode`; `DepartmentsTab.areas: Area[]`; `CamerasTab.areas: Area[]`; `EmployeesTab.isSystemAdmin: boolean`, `EmployeesTab.areas: Area[]`; `UserFormModal.me: User`, `UserFormModal.isSystemAdmin: boolean`, `UserFormModal.areas: Area[]` (thay `currentUserId`); `HanetConfigTab.isSystemAdmin: boolean`; `BackupsCard.canWrite: boolean`.

- [ ] **Step 1: Test che token webhook (`tests/config-view.test.ts`)**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs } from './helpers';

test('GET /hanet/config: HR toàn hệ thống không thấy token webhook đầy đủ; ADMIN thấy', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const full = (await (await loginAs(app, 'ADMIN')).get('/api/hanet/config')).body.config.webhookPath as string;
    const masked = (await (await loginAs(app, 'HR01')).get('/api/hanet/config')).body.config.webhookPath as string;
    assert.match(full, /^\/api\/hanet\/webhook\/[A-Za-z0-9_-]{20,}$/);
    assert.equal(masked, `/api/hanet/webhook/••••${full.slice(-4)}`);
  } finally {
    await app.close();
  }
});
```

Run: `npx tsx --test tests/config-view.test.ts` — Expected: FAIL (HR thấy token đầy đủ).

- [ ] **Step 2: Che token ở `GET /hanet/config`** (`server/routes/hanet.ts`)

```ts
  r.get('/hanet/config', requireGlobalHr, (req, res) => {
    const config = getHanetConfigView(db);
    // Token webhook là bí mật: chỉ ADMIN thấy đầy đủ
    if (!isSystemAdmin(currentUser(req))) config.webhookPath = config.webhookPath.replace(/[^/]+$/, (t) => `••••${t.slice(-4)}`);
    res.json({ config });
  });
```

Run: `npx tsx --test tests/config-view.test.ts` — Expected: PASS.

- [ ] **Step 3: Tạo `src/area.ts` và `src/permissions.ts`**

```ts
// src/area.ts
const KEY = 'hgc.area';

/** Khu đang chọn ở thanh trên cùng (nhớ theo trình duyệt). 'all' = tất cả; 'none' = chưa gán khu (chỉ HR toàn hệ thống). */
export function loadArea(): string {
  try {
    return window.localStorage.getItem(KEY) || 'all';
  } catch {
    return 'all';
  }
}

export function saveArea(v: string): void {
  try {
    window.localStorage.setItem(KEY, v);
  } catch {
    // trình duyệt chặn lưu trữ: chỉ không nhớ được lựa chọn
  }
}

/** Giá trị tham số ?area= cho API ('' = tất cả trong phạm vi). */
export function areaParam(area: string): string {
  return area === 'all' ? '' : area;
}
```

```ts
// src/permissions.ts
import type { User, UserRole } from './types';
import { SYSTEM_ADMIN_CODE } from './format';

export const isManagerRole = (u: User): boolean => u.role === 'hr' || u.role === 'area_admin';

/** Giống canDeleteUser ở server (spec mục 5) để ẩn/hiện nút; server vẫn kiểm tra lại. */
export function canDeleteUserUi(me: User, isSystemAdmin: boolean, t: User): boolean {
  if (t.id === me.id || t.code === SYSTEM_ADMIN_CODE) return false;
  if (isSystemAdmin) return true;
  if (t.role === 'hr') return false;
  if (me.role === 'hr') return true;
  return me.role === 'area_admin' && (t.role === 'employee' || t.role === 'dept_manager') && t.areaId !== null && me.adminAreaIds.includes(t.areaId);
}

/** Vai trò người đang đăng nhập được gán cho người khác. */
export function assignableRoles(me: User, isSystemAdmin: boolean): UserRole[] {
  if (isSystemAdmin) return ['hr', 'area_admin', 'dept_manager', 'employee'];
  if (me.role === 'hr') return ['area_admin', 'dept_manager', 'employee'];
  return ['dept_manager', 'employee'];
}
```

- [ ] **Step 4: Tạo `src/components/AreaSelect.tsx`**

```tsx
import React from 'react';
import type { MeResponse } from '../types';

/** Bộ chọn khu: HR toàn hệ thống luôn thấy; quản trị khu thấy khi được giao từ 2 khu. */
export const AreaSelect: React.FC<{ me: MeResponse; value: string; onChange: (v: string) => void }> = ({ me, value, onChange }) => {
  const isHr = me.user.role === 'hr';
  if (!isHr && !(me.user.role === 'area_admin' && me.areas.length >= 2)) return null;
  return (
    <select
      aria-label="Khu vực"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white cursor-pointer max-w-[180px]"
    >
      <option value="all">{isHr ? 'Tất cả khu vực' : 'Tất cả khu của tôi'}</option>
      {me.areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
      {isHr && <option value="none">Chưa gán khu</option>}
    </select>
  );
};
```

- [ ] **Step 5: Tạo `src/components/AreasTab.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { MapPinned, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Area, Camera, Department } from '../types';
import { api, errorMessage } from '../api';
import { ConfirmDeleteDialog, Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

type Form = { id?: string; code: string; name: string; note: string };

export const AreasTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Area | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, d, c] = await Promise.all([
        api<{ areas: Area[] }>('/api/areas'),
        api<{ departments: Department[] }>('/api/departments'),
        api<{ cameras: Camera[] }>('/api/cameras'),
      ]);
      setAreas(a.areas);
      setDepartments(d.departments);
      setCameras(c.cameras);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    void load();
    onChanged();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    try {
      if (form.id) await api(`/api/areas/${form.id}`, { method: 'PUT', body: { name: form.name, note: form.note } });
      else await api('/api/areas', { method: 'POST', body: { code: form.code, name: form.name, note: form.note } });
      setForm(null);
      refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const assign = async (kind: 'departments' | 'cameras', id: string, areaId: string | null) => {
    try {
      await api(`/api/${kind}/${id}`, { method: 'PUT', body: { areaId } });
      refresh();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  if (error) return <p className="text-xs text-rose-600">{error}</p>;
  if (!areas) return <p className="text-xs text-slate-500">Đang tải khu vực...</p>;
  const unassignedDepts = departments.filter((d) => !d.areaId);
  const unassignedCams = cameras.filter((c) => !c.areaId);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Khu vực</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Nhân sự thuộc khu của phòng ban. Quản trị khu vực chỉ xem và quản lý dữ liệu trong khu được giao (cấp quyền ở tab Nhân sự).
          </p>
        </div>
        <button onClick={() => setForm({ code: '', name: '', note: '' })} className={primaryBtn}>
          <Plus className="w-4 h-4" /> Thêm khu vực
        </button>
      </div>

      {(unassignedDepts.length > 0 || unassignedCams.length > 0) && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Chưa gán khu: {unassignedDepts.length} phòng ban, {unassignedCams.length} camera. Chỉ HR toàn hệ thống thấy những mục này; hãy gán vào khu bên dưới.
        </p>
      )}

      {areas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-xs text-slate-500">
          <MapPinned className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa có khu vực nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {areas.map((a) => {
            const depts = departments.filter((d) => d.areaId === a.id);
            const cams = cameras.filter((c) => c.areaId === a.id);
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 text-xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono font-bold px-1.5 rounded bg-slate-100 text-slate-600">{a.code}</span>
                    <h3 className="font-bold text-sm text-slate-900 mt-1">{a.name}</h3>
                    {a.note && <p className="text-slate-500">{a.note}</p>}
                    <p className="text-slate-500 mt-1">
                      {a.memberCount} nhân sự · {a.departmentCount} phòng ban · {a.cameraCount} camera
                    </p>
                    <p className="text-slate-500">Quản trị khu: {a.adminNames.length ? a.adminNames.join(', ') : '—'}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setForm({ id: a.id, code: a.code, name: a.name, note: a.note })} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label={`Sửa ${a.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleting(a)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label={`Xóa ${a.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {(
                  [
                    ['departments', 'Phòng ban', depts, departments] as const,
                    ['cameras', 'Camera', cams, cameras] as const,
                  ]
                ).map(([kind, label, inArea, all]) => (
                  <div key={kind}>
                    <div className="font-semibold text-slate-700 mb-1">{label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {inArea.map((x) => (
                        <span key={x.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100">
                          {x.name}
                          <button onClick={() => assign(kind, x.id, null)} className="text-slate-400 hover:text-rose-600 cursor-pointer" aria-label={`Bỏ ${x.name} khỏi khu`}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <select
                        className="px-2 py-0.5 rounded-full border border-dashed border-slate-300 bg-white cursor-pointer"
                        value=""
                        onChange={(e) => e.target.value && assign(kind, e.target.value, a.id)}
                        aria-label={`Thêm ${label.toLowerCase()} vào ${a.name}`}
                      >
                        <option value="">+ Thêm {label.toLowerCase()}</option>
                        {all
                          .filter((x) => x.areaId !== a.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                              {x.areaName ? ` (đang ở ${x.areaName})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Sửa khu vực' : 'Thêm khu vực'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            <Field label="Mã khu vực" hint={form.id ? undefined : 'Để trống: hệ thống tự sinh KV01, KV02...'}>
              <input className={`${inputCls} font-mono uppercase`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={Boolean(form.id)} />
            </Field>
            <Field label="Tên khu vực">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Ghi chú">
              <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            {formError && <p className="text-rose-600">{formError}</p>}
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

      {deleting && (
        <ConfirmDeleteDialog
          title="Xóa khu vực"
          confirmLabel="Xóa khu vực"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/api/areas/${deleting.id}`, { method: 'DELETE' });
            setDeleting(null);
            refresh();
          }}
        >
          <p>
            Xóa khu <strong>{deleting.name}</strong>? Chỉ xóa được khi khu không còn phòng ban và camera. Quản trị khu của khu này sẽ mất quyền với khu.
          </p>
        </ConfirmDeleteDialog>
      )}
    </div>
  );
};
```

- [ ] **Step 6: `src/App.tsx`**

1. Import: `import { useMemo } from 'react';` (gộp vào dòng import React), `import { AreasTab } from './components/AreasTab';`, `import { AreaSelect } from './components/AreaSelect';`, `import { areaParam, loadArea, saveArea } from './area';`.
2. State: thêm `const [area, setAreaState] = useState(loadArea);` và (đặt **trước** `fetchData`, vì `fetchData` dùng `activeArea`)

```ts
  const setArea = (v: string) => {
    setAreaState(v);
    saveArea(v);
  };
  // Khu đã lưu không còn trong phạm vi (bị gỡ quyền, khu bị xóa) thì về "tất cả"
  const activeArea = useMemo(() => {
    if (!me || area === 'all') return 'all';
    if (area === 'none') return me.user.role === 'hr' ? 'none' : 'all';
    return me.areas.some((a) => a.id === area) ? area : 'all';
  }, [me, area]);
```

3. Trong `fetchData`: thêm `const a = areaParam(activeArea);`; `q` thêm khóa `area: a`; các đường dẫn thành `` `/api/users?area=${a}` ``, `` `/api/departments?area=${a}` ``, `` `/api/cameras?area=${a}` ``, `` `/api/requests?area=${a}` ``, `` `/api/stats?area=${a}` ``; thêm `activeArea` vào mảng phụ thuộc của `useCallback`.
4. `<Navbar … extra={<AreaSelect me={me} value={activeArea} onChange={setArea} />} />`.
5. Các tab:

```tsx
        {tab === 'cameras' && <CamerasTab cameras={cameras} currentUser={currentUser} areas={me.areas} onRefresh={fetchData} />}
        {tab === 'departments' && <DepartmentsTab departments={departments} users={users} currentUser={currentUser} areas={me.areas} onRefresh={refreshAll} />}
        {tab === 'employees' && (
          <EmployeesTab users={users} departments={departments} currentUser={currentUser} isSystemAdmin={me.isSystemAdmin} areas={me.areas} onRefresh={refreshAll} />
        )}
        {tab === 'areas' && <AreasTab onChanged={refreshAll} />}
        {tab === 'hanet_config' && <HanetConfigTab isSystemAdmin={me.isSystemAdmin} onRefresh={fetchData} />}
```

- [ ] **Step 7: `src/components/Navbar.tsx`**

`NavbarProps` thêm `extra?: React.ReactNode;` (nhận trong destructuring). Danh sách tab:

```ts
  const isManager = currentUser.role === 'hr' || currentUser.role === 'area_admin';
  const tabs: { id: string; label: string; visible: boolean }[] = [
    { id: 'attendance', label: '📊 Bảng công', visible: true },
    { id: 'requests', label: '📝 Đơn giải trình / Xin phép', visible: true },
    { id: 'cameras', label: `📹 Camera AI (${totalCameraCount})`, visible: currentUser.role !== 'employee' },
    { id: 'departments', label: '🏢 Phòng ban', visible: currentUser.role !== 'employee' },
    { id: 'employees', label: '👤 Nhân sự', visible: isManager },
    { id: 'areas', label: '🗺️ Khu vực', visible: currentUser.role === 'hr' },
    { id: 'hanet_config', label: '⚡ Cấu hình', visible: currentUser.role === 'hr' },
  ];
```

Trong khối `<div className="flex items-center gap-2">` bên phải, chèn `{extra}` ngay trước khối nút "Mô phỏng".

- [ ] **Step 8: `src/components/DepartmentsTab.tsx`**

- Props thêm `areas: Area[]` (import `Area`).
- Thay `const isHR = currentUser.role === 'hr';` bằng `const isManager = currentUser.role === 'hr' || currentUser.role === 'area_admin';` và mọi chỗ dùng `isHR` đổi thành `isManager`; nút xóa đổi điều kiện `isSystemAdmin` thành `isManager` (bỏ biến `isSystemAdmin` và import `SYSTEM_ADMIN_CODE` nếu không còn dùng).
- Kiểu form thêm `areaId: string`; nút "Thêm phòng ban": `setForm({ code: '', name: '', description: '', managerId: '', areaId: currentUser.role === 'area_admin' ? (areas[0]?.id ?? '') : '' })`; nút "Sửa phòng ban": thêm `areaId: active.areaId ?? ''`.
- `save`: thêm `areaId: form.areaId || null` vào body của cả `PUT` và `POST`.
- Trong form, sau ô "Mô tả":

```tsx
            <Field label="Khu vực">
              <select className={inputCls} value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })} required={currentUser.role === 'area_admin'}>
                {currentUser.role === 'hr' && <option value="">— Chưa gán khu —</option>}
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
```

- Trên thẻ phòng ban, ngay dưới tên (`<h3>…{d.name}</h3>`) thêm `<p className="text-[11px] text-violet-700">{d.areaName ?? 'Chưa gán khu'}</p>`.

- [ ] **Step 9: `src/components/CamerasTab.tsx`** (file dùng nháy kép — giữ nguyên kiểu của file này)

- Props thêm `areas: Area[]` (import `Area`).
- `EMPTY` thêm `areaId: "",`.
- Thay `const isHr = currentUser.role === "hr";` bằng:

```ts
  const isGlobalHr = currentUser.role === "hr";
  const canManage = isGlobalHr || currentUser.role === "area_admin";
```

  Khối nút đầu trang (làm mới, nhập, thêm) dùng `isGlobalHr`; hai nút sửa/xóa trên thẻ dùng `canManage`.
- Nút sửa: thêm `areaId: c.areaId ?? "",` vào `setForm({...})`.
- `save`: body `PUT` thêm `areaId: form.areaId || null,`; `POST` gửi `{ ...form, areaId: form.areaId || null }`.
- Form: thêm sau ô "Vị trí lắp đặt":

```tsx
            <Field label="Khu vực">
              <select
                className={inputCls}
                value={form.areaId}
                onChange={(e) => setForm({ ...form, areaId: e.target.value })}
                required={!isGlobalHr}
              >
                {isGlobalHr && <option value="">— Chưa gán khu —</option>}
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
```

- Thẻ camera: trong lưới thông tin, thêm ô đầu tiên:

```tsx
                <div className="col-span-2">
                  <span className="block text-[10px] text-slate-400">
                    Khu vực
                  </span>
                  {c.areaName ?? "Chưa gán khu"}
                </div>
```

- [ ] **Step 10: `src/components/EmployeesTab.tsx`**

- Props thêm `isSystemAdmin: boolean; areas: Area[];`.
- Bỏ `const isSystemAdmin = currentUser.code === SYSTEM_ADMIN_CODE;` (giờ là prop) và import `SYSTEM_ADMIN_CODE`; import `canDeleteUserUi` từ `'../permissions'`.
- Nút xóa: điều kiện `isSystemAdmin &&` ⇒ `canDeleteUserUi(currentUser, isSystemAdmin, u) &&`.
- Thông tin thẻ: thêm dòng đầu `<div className="flex justify-between"><span className="text-slate-400">Khu vực</span><span>{u.areaName ?? '—'}</span></div>`; nếu `u.role === 'area_admin'` thêm dòng `Khu quản lý` liệt kê tên khu: `{areas.filter((a) => u.adminAreaIds.includes(a.id)).map((a) => a.name).join(', ') || '—'}`.
- `UserFormModal` gọi với `me={currentUser} isSystemAdmin={isSystemAdmin} areas={areas}` (bỏ `currentUserId`).

- [ ] **Step 11: `src/components/UserFormModal.tsx` (phần vai trò, phòng ban, khu)**

- Props: thay `currentUserId: string` bằng `me: User; isSystemAdmin: boolean; areas: Area[];` (import `Area`); `const isSelf = user?.id === me.id;`.
- Import `assignableRoles` từ `'../permissions'`.
- State thêm `const [adminAreaIds, setAdminAreaIds] = useState<string[]>(user?.adminAreaIds ?? []);`.
- `const roles = assignableRoles(me, isSystemAdmin);` và `const roleLocked = isSelf || (user !== undefined && !roles.includes(user.role));`.
- Ô "Vai trò":

```tsx
          <Field label="Vai trò">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={roleLocked}>
              {(roleLocked ? [role] : roles).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
```

- Ô "Phòng ban": `required={me.role === 'area_admin'}` và chỉ hiện `<option value="">— Chưa phân phòng —</option>` khi `me.role === 'hr'`.
- Ngay sau lưới các ô (trước dòng `isSelf &&`):

```tsx
        {role === 'area_admin' && !roleLocked && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
            <div className="text-[11px] font-semibold text-slate-700 mb-1.5">Khu được giao quản lý</div>
            <div className="flex flex-wrap gap-3">
              {areas.map((a) => (
                <label key={a.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminAreaIds.includes(a.id)}
                    onChange={(e) => setAdminAreaIds(e.target.checked ? [...adminAreaIds, a.id] : adminAreaIds.filter((x) => x !== a.id))}
                  />
                  {a.name}
                </label>
              ))}
              {areas.length === 0 && <span className="text-slate-500">Chưa có khu vực nào — tạo ở tab Khu vực.</span>}
            </div>
          </div>
        )}
```

- `submit`: `body` thêm `...(role === 'area_admin' ? { adminAreaIds } : {})`.

- [ ] **Step 12: `StatsCards.tsx`, `AttendanceTable.tsx`**

`StatsCards.tsx`:

```ts
  const scopeLabel =
    currentUser.role === 'hr'
      ? 'Toàn công ty'
      : currentUser.role === 'area_admin'
        ? 'Khu bạn quản lý'
        : currentUser.role === 'dept_manager'
          ? `Phòng ${currentUser.departmentName ?? ''}`
          : 'Cá nhân';
```

`AttendanceTable.tsx`: thêm dòng `{role === 'area_admin' && 'Bạn xem được bảng công của các khu bạn quản lý.'}` sau dòng của `hr`; điều kiện ô chọn phòng ban `role === 'hr'` ⇒ `(role === 'hr' || role === 'area_admin')`.

- [ ] **Step 13: Cấu hình chỉ-đọc cho người không phải `ADMIN`**

`src/components/config/BackupsCard.tsx`: nhận prop `{ canWrite }: { canWrite: boolean }`; nút "Sao lưu ngay" và link tải chỉ hiện khi `canWrite`.

`src/components/HanetConfigTab.tsx`:

```tsx
interface HanetConfigTabProps {
  isSystemAdmin: boolean;
  onRefresh: () => void;
}

export const HanetConfigTab: React.FC<HanetConfigTabProps> = ({ isSystemAdmin, onRefresh }) => {
```

và phần `return`:

```tsx
  return (
    <div className="space-y-6">
      {!isSystemAdmin && (
        <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
          Chỉ tài khoản ADMIN được thay đổi cấu hình kỹ thuật (kết nối Camera AI, webhook, đồng bộ, sao lưu). Bạn đang xem ở chế độ chỉ đọc; riêng giờ làm việc bạn vẫn sửa được.
        </p>
      )}
      <fieldset disabled={!isSystemAdmin} className="contents">
        <WebhookCard config={config} onChange={setConfig} />
      </fieldset>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <fieldset disabled={!isSystemAdmin} className="contents">
          <HanetCredentialsCard config={config} onChange={setConfig} onReconciled={onRefresh} />
          <HanetConnectCard />
          <SyncStatusCard />
        </fieldset>
        <WorkSettingsCard onRecomputed={onRefresh} />
        <BackupsCard canWrite={isSystemAdmin} />
        <WebhookLogsCard />
      </div>
      {isSystemAdmin && <DangerZoneCard />}
    </div>
  );
```

- [ ] **Step 14: Kiểm tra**

Run: `npm test && npm run lint && npm run build`
Expected: PASS. Sau khi build, `git checkout -- dist server.js` và xóa file `dist/assets/*` mới chưa theo dõi (`git clean -n dist` để xem, rồi `git clean -f dist`) — không commit bản build ở task này.

Kiểm tra tay (tùy chọn, nếu chạy được trình duyệt): `npm run dev`, đăng nhập `ADMIN`, tạo 2 khu, gán phòng ban/camera ở tab Khu vực, cấp "Quản trị khu vực" cho một người với 1 khu, đăng nhập người đó: chỉ thấy dữ liệu khu đó, không thấy tab Khu vực/Cấu hình.

- [ ] **Step 15: Commit**

```bash
git add src server/routes/hanet.ts tests/config-view.test.ts
git commit -m "feat(ui): areas tab, area selector, area-aware staff/department/camera forms, read-only config for non-ADMIN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Giao diện tài khoản — đăng nhập bằng email, quên/đặt lại mật khẩu, form email/điện thoại, nhập CSV, cấu hình thư

**Files:**
- Rewrite: `src/components/LoginScreen.tsx`
- Create: `src/components/ForgotPasswordScreen.tsx`, `src/components/ResetPasswordScreen.tsx`, `src/components/CsvImportModal.tsx`, `src/components/config/MailCard.tsx`
- Modify: `src/App.tsx` (màn hình chưa đăng nhập), `src/components/UserFormModal.tsx`, `src/components/EmployeesTab.tsx`, `src/components/HanetConfigTab.tsx`
- Delete: `src/components/TempPasswordDialog.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login {login,password}`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (Task 8); `GET /api/users/next-code`, `POST /api/users/:id/reset-password → {queued}` (Task 8); `POST /api/users/import-csv/preview|import-csv` (Task 9); `GET/PUT /api/settings/mail`, `POST /api/settings/mail/test` (Task 7); `csvToRows`, `CSV_TEMPLATE`, `CSV_MAX_ROWS` (`src/csv.ts`, Task 9); `User.email/phone/emailStatus/emailError/canLogin` (Task 1); `MailConfigView` (Task 7); `CsvPreviewRow`, `ImportedUser` (Task 9/1).
- Produces: `LoginScreen({ onLoggedIn, onForgot })`, `ForgotPasswordScreen({ onBack })`, `ResetPasswordScreen({ token, onDone })`, `CsvImportModal({ onClose, onImported })`, `MailCard()`; `UserSaved` bỏ `tempPassword`.

- [ ] **Step 1: Viết lại `src/components/LoginScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn } from './ui';

export const LoginScreen: React.FC<{ onLoggedIn: () => void; onForgot: () => void; notice?: string | null }> = ({ onLoggedIn, onForgot, notice }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { login, password } });
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
            <h1 className="font-bold text-slate-900">Petrolimex Attendance</h1>
            <p className="text-xs text-slate-500">Đăng nhập bằng mã nhân viên hoặc email</p>
          </div>
        </div>
        {notice && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-2">{notice}</p>}
        <Field label="Mã nhân viên hoặc email">
          <input className={inputCls} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Mật khẩu">
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full py-2.5`}>
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
        <button type="button" onClick={onForgot} className="text-[11px] text-orange-600 hover:underline cursor-pointer">
          Quên mật khẩu?
        </button>
      </form>
    </div>
  );
};
```

- [ ] **Step 2: Tạo `src/components/ForgotPasswordScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn } from './ui';

export const ForgotPasswordScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [login, setLogin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMessage((await api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: { login } })).message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 w-full max-w-sm space-y-4">
        <h1 className="font-bold text-slate-900">Quên mật khẩu</h1>
        <p className="text-xs text-slate-500">Nhập mã nhân viên hoặc email. Hệ thống sẽ gửi link đặt lại mật khẩu (dùng được trong 30 phút) tới email của bạn.</p>
        {message ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-2">{message}</p>
        ) : (
          <>
            <Field label="Mã nhân viên hoặc email">
              <input className={inputCls} value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
            </Field>
            {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
            <button type="submit" disabled={busy} className={`${primaryBtn} w-full py-2.5`}>
              {busy ? 'Đang gửi...' : 'Gửi link đặt lại'}
            </button>
          </>
        )}
        <button type="button" onClick={onBack} className="text-[11px] text-orange-600 hover:underline cursor-pointer">
          ← Quay lại đăng nhập
        </button>
      </form>
    </div>
  );
};
```

- [ ] **Step 3: Tạo `src/components/ResetPasswordScreen.tsx`**

```tsx
import React, { useState } from 'react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn } from './ui';

export const ResetPasswordScreen: React.FC<{ token: string; onDone: (notice: string | null) => void }> = ({ token, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: password } });
      onDone('Đã đặt mật khẩu mới. Hãy đăng nhập.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 w-full max-w-sm space-y-4">
        <h1 className="font-bold text-slate-900">Đặt mật khẩu mới</h1>
        <Field label="Mật khẩu mới" hint="Ít nhất 8 ký tự">
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required autoFocus />
        </Field>
        <Field label="Nhập lại mật khẩu mới">
          <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full py-2.5`}>
          {busy ? 'Đang lưu...' : 'Đặt mật khẩu'}
        </button>
        <button type="button" onClick={() => onDone(null)} className="text-[11px] text-orange-600 hover:underline cursor-pointer">
          ← Quay lại đăng nhập
        </button>
      </form>
    </div>
  );
};
```

- [ ] **Step 4: `src/App.tsx` — màn hình khi chưa đăng nhập**

Import `ForgotPasswordScreen`, `ResetPasswordScreen`. Thêm state:

```ts
  const [anonView, setAnonView] = useState<'login' | 'forgot'>('login');
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('reset');
    } catch {
      return null;
    }
  });
```

Thay dòng `if (authState === 'anonymous') return <LoginScreen onLoggedIn={loadMe} />;` bằng:

```tsx
  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={(notice) => {
          // Bỏ token khỏi thanh địa chỉ để không dùng lại / không lộ khi chia sẻ màn hình
          window.history.replaceState(null, '', window.location.pathname);
          setResetToken(null);
          setLoginNotice(notice);
          setAnonView('login');
        }}
      />
    );
  }
  if (authState === 'anonymous') {
    return anonView === 'forgot' ? (
      <ForgotPasswordScreen onBack={() => setAnonView('login')} />
    ) : (
      <LoginScreen onLoggedIn={loadMe} onForgot={() => setAnonView('forgot')} notice={loginNotice} />
    );
  }
```

(đặt khối `resetToken` ngay sau khối `authState === 'loading'`, để link đặt lại mở được cả khi trình duyệt đang có phiên.)

- [ ] **Step 5: `src/components/UserFormModal.tsx` — email, điện thoại, mã gợi ý**

- `UserSaved`: bỏ `tempPassword?: string;`.
- Thêm `useEffect` (import từ React): khi tạo mới, lấy mã gợi ý:

```ts
  useEffect(() => {
    if (isEdit) return;
    api<{ code: string }>('/api/users/next-code')
      .then((r) => setCode((c) => c || r.code))
      .catch(() => undefined);
  }, [isEdit]);
```

- Ô "Mã nhân viên": bỏ `required`; hint khi tạo mới: `'Mã gợi ý tự sinh; sửa nếu cần. Phải trùng aliasID trên Camera AI nếu người này đã có trên Camera AI'`.
- Ô "Số điện thoại": `<input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="0912345678" />`.
- Ô "Email": thêm `required` và hint `isEdit ? undefined : 'Mật khẩu đăng nhập sẽ được gửi tới email này'`.
- `submit` (tạo mới): `onSaved(r)` giữ nguyên (server không còn trả `tempPassword`).

- [ ] **Step 6: Tạo `src/components/CsvImportModal.tsx`**

```tsx
import React, { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { CsvPreviewRow, CsvRowInput, ImportedUser } from '../types';
import { api, errorMessage } from '../api';
import { CSV_MAX_ROWS, CSV_TEMPLATE, csvToRows } from '../csv';
import { Modal, primaryBtn, secondaryBtn } from './ui';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mau-nhap-nhan-su.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export const CsvImportModal: React.FC<{ onClose: () => void; onImported: () => void }> = ({ onClose, onImported }) => {
  const [rows, setRows] = useState<CsvRowInput[] | null>(null);
  const [preview, setPreview] = useState<CsvPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: ImportedUser[]; skipped: number } | null>(null);

  const onFile = async (file: File | undefined) => {
    setError(null);
    setPreview(null);
    setRows(null);
    if (!file) return;
    const parsed = csvToRows(await file.text());
    if (parsed.error) return setError(parsed.error);
    if (parsed.rows.length === 0) return setError('File không có dòng nào');
    if (parsed.rows.length > CSV_MAX_ROWS) return setError(`Mỗi lần nhập tối đa ${CSV_MAX_ROWS} dòng — hãy chia file nhỏ hơn`);
    setBusy(true);
    try {
      const r = await api<{ rows: CsvPreviewRow[] }>('/api/users/import-csv/preview', { method: 'POST', body: { rows: parsed.rows } });
      setRows(parsed.rows);
      setPreview(r.rows);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await api<{ created: ImportedUser[]; skipped: number }>('/api/users/import-csv', { method: 'POST', body: { rows } }));
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const okCount = preview?.filter((p) => p.ok).length ?? 0;

  return (
    <Modal title="Nhập nhân sự từ file CSV" onClose={onClose} wide>
      {done ? (
        <div className="space-y-3">
          <p className="text-emerald-700">
            Đã tạo {done.created.length} nhân sự{done.skipped ? `, bỏ qua ${done.skipped} dòng lỗi` : ''}. Mật khẩu được gửi dần qua email cho từng người (theo dõi ở cột trạng thái thư).
          </p>
          <button type="button" onClick={onClose} className={`${primaryBtn} w-full`}>
            Đóng
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-slate-600">
            Cột bắt buộc: <span className="font-mono">ho_ten, email, so_dien_thoai, ma_phong_ban</span>. Cột tùy chọn:{' '}
            <span className="font-mono">ma_nhan_vien</span> (để trống thì tự sinh), <span className="font-mono">chuc_vu</span>,{' '}
            <span className="font-mono">vai_tro</span> (<span className="font-mono">nhan_vien</span> hoặc <span className="font-mono">truong_phong</span>). Tối đa {CSV_MAX_ROWS} dòng mỗi lần.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadTemplate} className={secondaryBtn}>
              <Download className="w-3.5 h-3.5" /> Tải file mẫu
            </button>
            <label className={`${secondaryBtn} cursor-pointer`}>
              <Upload className="w-3.5 h-3.5" /> Chọn file CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
          </div>
          {busy && <p className="text-slate-500">Đang xử lý...</p>}
          {error && <p className="text-rose-600">{error}</p>}
          {preview && (
            <>
              <div className="max-h-80 overflow-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[11px] text-slate-500 sticky top-0">
                    <tr>
                      <th className="p-2">Dòng</th>
                      <th className="p-2">Họ tên</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Mã</th>
                      <th className="p-2">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((p) => (
                      <tr key={p.line} className={p.ok ? '' : 'bg-rose-50/60'}>
                        <td className="p-2 font-mono">{p.line}</td>
                        <td className="p-2">{p.name || '—'}</td>
                        <td className="p-2">{p.email || '—'}</td>
                        <td className="p-2 font-mono">{p.code ?? '—'}</td>
                        <td className={`p-2 ${p.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{p.ok ? 'Hợp lệ' : p.errors.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={create} disabled={busy || okCount === 0} className={`${primaryBtn} w-full`}>
                Tạo {okCount} nhân sự hợp lệ{preview.length > okCount ? ` (bỏ qua ${preview.length - okCount} dòng lỗi)` : ''}
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
```

- [ ] **Step 7: `src/components/EmployeesTab.tsx`**

- Bỏ import và mọi chỗ dùng `TempPasswordDialog` (state `tempPassword`); xóa file `src/components/TempPasswordDialog.tsx`.
- Import `CsvImportModal`, thêm icon `FileSpreadsheet, Mail` từ `lucide-react`; state `const [csvOpen, setCsvOpen] = useState(false);` và `const [notice, setNotice] = useState<string | null>(null);`.
- `resetPassword`:

```ts
  const resetPassword = async (u: User) => {
    const again = u.canLogin ? 'Mật khẩu mới sẽ được gửi qua email; mật khẩu cũ hết hiệu lực khi thư đi.' : 'Thư chào mừng kèm mật khẩu sẽ được gửi lại.';
    if (!window.confirm(`${u.canLogin ? 'Đặt lại mật khẩu' : 'Gửi lại thư'} cho ${u.name} (${u.code}) tới ${u.email || '(chưa có email)'}? ${again}`)) return;
    try {
      await api<{ queued: boolean }>(`/api/users/${u.id}/reset-password`, { method: 'POST' });
      setNotice(`Đã xếp thư gửi tới ${u.email}. Thư sẽ đi trong vòng 1 phút.`);
      onRefresh();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };
```

- Nút đầu trang thêm (trước "Nhập từ Camera AI"):

```tsx
          <button onClick={() => setCsvOpen(true)} className={secondaryBtn}>
            <FileSpreadsheet className="w-4 h-4" /> Nhập từ file CSV
          </button>
```

- Hiện `notice` dưới phần đầu trang (giống khối `faceNotice`, màu xanh, có nút ✕ gọi `setNotice(null)`).
- Thông tin thẻ nhân sự thêm hai dòng và nhãn trạng thái thư:

```tsx
              <div className="flex justify-between"><span className="text-slate-400">Email</span><span className="truncate ml-2">{u.email || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Điện thoại</span><span>{u.phone || '—'}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tài khoản</span>
                <span
                  className={
                    !u.email ? 'text-amber-700' : u.emailStatus === 'error' ? 'text-rose-700' : u.emailStatus === 'pending' ? 'text-sky-700' : 'text-emerald-700'
                  }
                  title={u.emailError ?? undefined}
                >
                  {!u.email
                    ? 'Thiếu email'
                    : u.emailStatus === 'error'
                      ? 'Lỗi gửi thư'
                      : u.emailStatus === 'pending'
                        ? 'Chờ gửi thư'
                        : u.canLogin
                          ? 'Đã có mật khẩu'
                          : 'Chưa gửi thư'}
                </span>
              </div>
              {u.emailStatus === 'error' && u.emailError && <p className="text-[10px] text-rose-600">{u.emailError}</p>}
```

- Nút "Đặt lại mật khẩu" trên thẻ: nhãn đổi theo `u.canLogin ? 'Đặt lại mật khẩu' : 'Gửi lại thư'`, icon `u.canLogin ? KeyRound : Mail`, `disabled={!u.email}`, `title={u.email ? undefined : 'Hãy bổ sung email trước'}`.
- `onSaved` của `UserFormModal`: bỏ nhánh `tempPassword`; thêm `if (!editing || editing === 'new') setNotice(\`Đã tạo ${user.name} (${user.code}). Mật khẩu sẽ được gửi tới ${user.email}.\`);` (chuyển dòng `setEditing(null)` xuống sau dòng này).
- Cuối component: `{csvOpen && <CsvImportModal onClose={() => setCsvOpen(false)} onImported={onRefresh} />}`.

- [ ] **Step 8: Tạo `src/components/config/MailCard.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import type { MailConfigView } from '../../types';
import { api, errorMessage } from '../../api';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

type Form = Omit<MailConfigView, 'hasPassword' | 'configured' | 'sentToday' | 'pending'> & { password: string };

const toForm = (v: MailConfigView): Form => ({
  host: v.host, port: v.port, secure: v.secure, user: v.user, password: '', fromName: v.fromName, fromEmail: v.fromEmail, appUrl: v.appUrl, dailyLimit: v.dailyLimit,
});

/** Cấu hình gửi thư (mật khẩu tạm, link đặt lại mật khẩu). Chỉ ADMIN sửa (ô bị khóa qua fieldset ở HanetConfigTab). */
export const MailCard: React.FC = () => {
  const [view, setView] = useState<MailConfigView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [testTo, setTestTo] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<MailConfigView>('/api/settings/mail')
      .then((v) => {
        setView(v);
        setForm(toForm(v));
        if (!v.appUrl) setForm((f) => (f ? { ...f, appUrl: window.location.origin } : f));
      })
      .catch((err) => setResult({ ok: false, message: errorMessage(err) }));
  }, []);

  if (!form) return <div className="bg-white rounded-2xl border border-slate-200/80 p-5 text-xs text-slate-500">{result?.message ?? 'Đang tải cấu hình thư...'}</div>;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: k === 'port' || k === 'dailyLimit' ? Number(e.target.value) : e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const v = await api<MailConfigView>('/api/settings/mail', { method: 'PUT', body: form });
      setView(v);
      setForm(toForm(v));
      setResult({ ok: true, message: 'Đã lưu cấu hình gửi thư.' });
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      setResult(await api<{ ok: boolean; message: string }>('/api/settings/mail/test', { method: 'POST', body: { to: testTo } }));
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-4">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
        <Mail className="w-4 h-4 text-orange-500" /> Gửi thư (mật khẩu, đặt lại mật khẩu)
      </h3>
      {view && (
        <p className="text-slate-500">
          {view.configured ? 'Đã cấu hình.' : 'Chưa cấu hình: thư mật khẩu đang chờ.'} Hôm nay đã gửi {view.sentToday}/{view.dailyLimit} thư · đang chờ {view.pending}.
        </p>
      )}
      <form onSubmit={save} className="space-y-3">
        <button
          type="button"
          onClick={() => setForm({ ...form, host: 'smtp.gmail.com', port: 465, secure: 'ssl', dailyLimit: 450 })}
          className={`${secondaryBtn} py-1.5`}
        >
          Dùng Gmail
        </button>
        <p className="text-[11px] text-slate-500">
          Gmail: bật xác minh 2 bước cho tài khoản, tạo "Mật khẩu ứng dụng" (Google Account → Bảo mật → Mật khẩu ứng dụng) rồi dán vào ô Mật khẩu. Gmail giới hạn khoảng 500 thư/ngày.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Máy chủ SMTP">
            <input className={inputCls} value={form.host} onChange={set('host')} required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cổng">
              <input className={inputCls} type="number" value={form.port} onChange={set('port')} required />
            </Field>
            <Field label="Bảo mật">
              <select className={inputCls} value={form.secure} onChange={set('secure')}>
                <option value="ssl">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
              </select>
            </Field>
          </div>
          <Field label="Tài khoản SMTP">
            <input className={inputCls} value={form.user} onChange={set('user')} autoComplete="off" required />
          </Field>
          <Field label="Mật khẩu">
            <input
              className={inputCls}
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder={view?.hasPassword ? 'Đã lưu — để trống nếu không đổi' : ''}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Tên người gửi">
            <input className={inputCls} value={form.fromName} onChange={set('fromName')} />
          </Field>
          <Field label="Email người gửi">
            <input className={inputCls} type="email" value={form.fromEmail} onChange={set('fromEmail')} required />
          </Field>
          <Field label="Địa chỉ web" hint="Dùng trong link đặt lại mật khẩu, ví dụ https://petrolimex.hgcvn.cloud">
            <input className={inputCls} value={form.appUrl} onChange={set('appUrl')} required />
          </Field>
          <Field label="Hạn mức thư mỗi ngày">
            <input className={inputCls} type="number" value={form.dailyLimit} onChange={set('dailyLimit')} required />
          </Field>
        </div>
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
          Lưu cấu hình thư
        </button>
      </form>
      <div className="flex gap-2">
        <input className={inputCls} type="email" placeholder="Email nhận thư thử" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <button type="button" onClick={sendTest} disabled={busy || !testTo} className={`${secondaryBtn} shrink-0`}>
          <Send className="w-3.5 h-3.5" /> Gửi thư thử
        </button>
      </div>
      {result && <p className={`rounded-xl p-2 ${result.ok ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>{result.message}</p>}
    </div>
  );
};
```

`src/components/HanetConfigTab.tsx`: import `MailCard`; đặt `<MailCard />` trong `fieldset` chỉ-`ADMIN` của lưới (sau `<SyncStatusCard />`).

- [ ] **Step 9: Kiểm tra**

Run: `npm test && npm run lint && npm run build`
Expected: PASS; `grep -rn "tempPassword\|TempPasswordDialog" src` không còn kết quả. Hoàn nguyên `dist/` và `server.js` như Task 10 Step 14 (không commit bản build).

Kiểm tra tay (tùy chọn): `npm run dev`; đăng nhập `ADMIN` → Cấu hình → Gửi thư → "Dùng Gmail", điền tài khoản Gmail + mật khẩu ứng dụng → Lưu → Gửi thư thử; Nhân sự → Thêm nhân sự (mã điền sẵn, email/điện thoại bắt buộc) → thư tới hộp Gmail; đăng xuất → "Quên mật khẩu?" → nhận link → đặt mật khẩu mới.

- [ ] **Step 10: Commit**

```bash
git add -A src
git commit -m "feat(ui): login by email, forgot/reset password, required email and phone, CSV import, mail settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Hướng dẫn nâng cấp v3, bản build production và kiểm tra cuối

**Files:**
- Modify: `DEPLOY.md`
- Rebuild: `dist/`, `server.js`

**Interfaces:**
- Consumes: mọi task trước.
- Produces: bản build production; hướng dẫn nâng cấp lên database v3.

- [ ] **Step 1: Thêm mục vào `DEPLOY.md`** — chèn ngay trước mục `## Nâng cấp lên bản tích hợp Hanet (database v2)`

````markdown
## Nâng cấp lên bản khu vực và tài khoản email (database v3)

Bản này đổi cấu trúc database và **không chuyển dữ liệu cũ** (server in `[STARTUP] Database phiên bản cũ (v2). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` rồi dừng). Bản này thêm thư viện gửi thư nên **phải chạy `npm install`**.

```bash
cd /home/ubuntu/hgc-attendance
pm2 stop hanet-attendance
mkdir -p ~/hgc-backup && cp data/attendance.db ~/hgc-backup/attendance-v2-$(date +%F).db
rm -f data/attendance.db data/attendance.db-wal data/attendance.db-shm
git pull && npm install --omit=dev
pm2 restart hanet-attendance
pm2 logs hanet-attendance --lines 20 --nostream    # thấy [BOOTSTRAP] Đã tạo tài khoản ADMIN ...
```

Sau khi khởi động (đăng nhập `ADMIN` / `Admin@123`, đổi mật khẩu):

1. **Cấu hình › Gửi thư**: bấm **Dùng Gmail**, nhập tài khoản Gmail và **mật khẩu ứng dụng** (Google Account → Bảo mật → Xác minh 2 bước → Mật khẩu ứng dụng), email người gửi, **địa chỉ web** `https://petrolimex.hgcvn.cloud` → **Lưu** → **Gửi thư thử** tới hộp thư của bạn.
2. **Cấu hình**: nhập lại kết nối Camera AI (Client ID, Client Secret, Refresh Token → Lưu → Kiểm tra kết nối → chọn địa điểm → Lưu), tài khoản xem video (Kiểm tra), chép **URL webhook mới** dán lên Camera AI.
3. **Khu vực**: tạo các khu (ví dụ Trụ sở 26 Đức Giang, Tổng kho Đức Giang).
4. **Phòng ban**: tạo phòng ban, chọn khu cho từng phòng.
5. **Camera**: **Nhập camera từ Camera AI**, rồi gán khu cho từng camera (tab Khu vực hoặc Sửa camera).
6. **Nhân sự**: thêm từng người (email + điện thoại bắt buộc; mật khẩu tự gửi qua email), hoặc **Nhập từ file CSV** (tải file mẫu), hoặc **Nhập từ Camera AI** (người nhập theo cách này chưa có email: bấm Sửa để bổ sung email và điện thoại — hệ thống tự gửi mật khẩu).
7. Cấp quyền: Sửa nhân sự → Vai trò **Quản trị khu vực** → tích các khu được giao. Vai trò **HR toàn hệ thống** chỉ tài khoản `ADMIN` cấp được.

## Kiểm tra sau khi nâng cấp v3 (trên host)

- [ ] Gửi thư thử tới Gmail của bạn và nhận được.
- [ ] Thêm một nhân sự thật → thư "Tài khoản đăng nhập của bạn" tới hộp Gmail → đăng nhập bằng **email** với mật khẩu tạm → bị yêu cầu đổi mật khẩu.
- [ ] Đăng xuất → **Quên mật khẩu?** → nhận link → đặt mật khẩu mới → đăng nhập được; dùng lại link lần hai báo hết hạn.
- [ ] Nhập file CSV 3 dòng (1 dòng cố ý sai email) → xem trước báo đúng dòng lỗi → tạo 2 người → 2 thư được gửi.
- [ ] Quản trị khu A đăng nhập: chỉ thấy nhân sự, phòng ban, camera, bảng công, đơn của khu A; không thấy tab Khu vực, Cấu hình.
- [ ] HR toàn hệ thống mở tab Cấu hình: thấy ở chế độ chỉ đọc, không thấy token webhook đầy đủ; sửa được giờ làm việc.
````

- [ ] **Step 2: Kiểm tra toàn bộ**

Run:

```bash
npm test && TZ=UTC npm test && npm run lint && npm run build
grep -rn "tempPassword" server src shared || echo "OK: không còn trả mật khẩu tạm"
grep -rn "console\.\(log\|warn\|error\).*\(password\|token\)" server | grep -v "password_reset\|reset_link\|webhook_token_rotated\|webhook_bad_token" || echo "OK: không log mật khẩu/token"
grep -rn "Hanet" src --include=*.tsx | grep -v "^\s*//\|import\|Hanet[A-Z][A-Za-z]*\b" || echo "OK: giao diện không có chữ Hanet"
```

Expected: test (cả `TZ=UTC`), lint, build qua; ba dòng `OK: ...` (dòng grep cuối có thể in tên component như `HanetConfigTab` — chấp nhận được vì không hiển thị; chỉ chữ "Hanet" trong chuỗi hiển thị mới là lỗi).

- [ ] **Step 3: Chạy thử bản production với database v2 và mới**

```bash
SMOKE=$(mktemp -d) && cp -r dist server.js package.json "$SMOKE"/ && ln -s "$PWD/node_modules" "$SMOKE/node_modules" && mkdir -p "$SMOKE/data"
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$SMOKE/data/attendance.db');d.exec('CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (2);');d.close()"
(cd "$SMOKE" && NODE_ENV=production PORT=3095 node server.js; echo "exit=$?")
rm -f "$SMOKE/data/attendance.db"
(cd "$SMOKE" && NODE_ENV=production PORT=3095 node server.js > server.log 2>&1 &) ; sleep 3
curl -s localhost:3095/api/health; echo
curl -s -X POST localhost:3095/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"login":"x"}'; echo
grep BOOTSTRAP "$SMOKE/server.log"
lsof -ti:3095 | xargs kill 2>/dev/null; true
```

Expected: lần đầu in `[STARTUP] Database phiên bản cũ (v2). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` và `exit=1`; lần sau `{"ok":true}`, `{"message":"Nếu tài khoản tồn tại và có email, thư hướng dẫn đã được gửi."}` và một dòng `[BOOTSTRAP] Đã tạo tài khoản ADMIN ...`.

- [ ] **Step 4: Commit**

```bash
git add DEPLOY.md
git add -A dist server.js
git commit -m "docs(deploy): upgrade to database v3 with areas and email accounts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Tự rà soát kế hoạch so với spec

| Spec | Task |
|---|---|
| §3 Schema v3, không migration | 1, 12 |
| §4 Vai trò, đối tượng thuộc khu, `scopeFor` loại `areas`, `?area=` | 2, 4 |
| §5 Ba cổng, ma trận quyền, bảng xóa, ràng buộc khi `area_admin` sửa | 2, 5, 6 |
| §6.1 Thêm nhân sự: email/điện thoại bắt buộc, mã gợi ý, không trả mật khẩu | 8, 11 |
| §6.2 Hàng đợi thư, mật khẩu sinh lúc gửi, thử lại, hạn mức ngày, gửi lại | 7, 8, 11 |
| §6.3 Đặt lại hộ và tự đặt lại (token băm, 30 phút, một lần, giới hạn tần suất, `mail.app_url`) | 7, 8, 11 |
| §6.4 Đăng nhập bằng mã hoặc email | 8, 11 |
| §6.5 Cấu hình gửi thư, "Dùng Gmail", gửi thử, `nodemailer` | 7, 11 |
| §7 Nhập CSV (mẫu, `,`/`;`, BOM, xem trước, 200 dòng, phòng trong khu) | 9, 11 |
| §8 Nhập từ Camera AI: "Thiếu email", không màn mật khẩu, phòng trong khu | 1, 5, 8, 11 |
| §9 Giao diện: bộ chọn khu, tab Khu vực, cột khu, form, cấu hình chỉ-đọc | 10, 11 |
| §10 Lỗi và bảo mật (không log bí mật, 404 ngoài phạm vi) | 2, 4, 5, 7, 8, 12 |
| §11 Kiểm thử | mọi task |
| §12–13 Triển khai, tiêu chí hoàn thành | 12 |
