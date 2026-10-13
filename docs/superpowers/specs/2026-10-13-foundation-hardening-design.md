# Gia cố nền tảng hệ thống điểm danh Hanet — Thiết kế

Ngày: 2026-10-13
Trạng thái: Chờ duyệt

## 1. Mục tiêu và phạm vi

### Mục tiêu
Đưa hệ thống vào sử dụng thật cho 100–500 nhân viên, nhiều camera Hanet, với ba đảm bảo:
1. **Không giả mạo được**: chỉ người đã đăng nhập mới truy cập, mỗi vai trò chỉ thấy và làm đúng phần của mình; không ai gửi được lượt điểm danh giả.
2. **Không mất dữ liệu**: ghi an toàn khi tắt đột ngột hoặc ghi đồng thời; có sao lưu tự động.
3. **Tính công đúng**: theo giờ Việt Nam bất kể múi giờ VPS; mỗi người một dòng mỗi ngày với giờ vào/ra, đi muộn, về sớm.

### Quyết định đã chốt với người dùng
- Tất cả nhân viên đều đăng nhập; đăng nhập bằng **mã NV + mật khẩu**, HR cấp mật khẩu tạm, nhân viên bắt buộc đổi ở lần đầu, quên mật khẩu thì HR đặt lại.
- Giờ vào = lượt nhận diện **đầu tiên** trong ngày, giờ ra = lượt **cuối cùng**.
- Quy mô 100–500 người, nhiều camera (ước tính vài nghìn lượt/ngày, ~1 triệu bản ghi/năm).
- Lưu trữ bằng **SQLite qua `node:sqlite`**, chạy trên **Node ≥ 22.13**.

### Giả định (chưa được người dùng nói rõ)
- Vẫn chạy một tiến trình Node trên một VPS (PM2 `fork`, 1 instance), sau nginx có HTTPS.
- Giờ làm mặc định 08:00–17:00, cho muộn đến 08:15 (giữ như code hiện tại), HR sửa được.
- Ngưỡng 30 phút giữa giờ vào và giờ ra để coi là đã có giờ ra.

### Ngoài phạm vi (dự án sau, xây trên nền này)
Bảng công tháng / xuất Excel, nghỉ phép đầy đủ (khoảng ngày, số ngày phép), ca làm việc, thông báo đi muộn/vắng, đồng bộ khuôn mặt thật lên Hanet (nút "Đồng bộ Hanet" hiện là giả — giữ nguyên nhưng đổi nhãn thành "Chưa hỗ trợ"), xác định ngày làm việc để tính vắng.

## 2. Hiện trạng cần sửa (tóm tắt từ rà soát)

| # | Vấn đề | Vị trí |
|---|---|---|
| 1 | Không có đăng nhập; `switch-user` cho ai cũng thành HR; `currentUserId` dùng chung mọi trình duyệt | `server.ts:230` |
| 2 | `reset-database` không kiểm quyền | `server.ts:772` |
| 3 | Webhook không xác thực | `server.ts:561` |
| 4 | `GET /api/hanet/config` trả secret cho mọi vai trò | `server.ts:745` |
| 5 | JSON lỗi → ghi đè DB trắng; ghi đồng thời mất dữ liệu; `data/` trong git; không sao lưu | `server.ts:183` |
| 6 | Dùng giờ server và `toISOString()` (UTC) → sai giờ muộn, sai ngày | `server.ts:566`, `:597` |
| 7 | Mỗi lượt nhận diện là một `check_in`; không có giờ ra/về sớm; thống kê đếm theo lượt | `server.ts:607`, `:800` |
| 8 | Giờ làm viết cứng ở 2 nơi | `server.ts:595`, `:672` |
| 9 | Duyệt bất kỳ yêu cầu nào đổi một bản ghi thành "đúng giờ" | `server.ts:542` |
| 10 | Khớp nhân viên theo tên | `server.ts:588` |

## 3. Cấu trúc code

```
server/
  index.ts          khởi động: kiểm tra Node ≥ 22.13, mở DB, gắn middleware, routes, lịch chạy, Vite/dist
  db.ts             mở SQLite, PRAGMA, tạo bảng (schema version)
  auth.ts           hashPassword/verifyPassword (scrypt), phiên, requireAuth, requireRole, scopeFor, giới hạn đăng nhập
  attendance.ts     hàm thuần: toVnDate, computeDay; hàm recomputeDay(db, userId, date)
  hanet.ts          parse payload webhook, gọi API Hanet (token, refresh, getCheckinByPlaceIdInTimestamp)
  jobs.ts           bộ hẹn giờ: sao lưu, đối soát Hanet, xóa phiên hết hạn
  backup.ts         VACUUM INTO, xoay vòng 30 bản
  errors.ts         HttpError + middleware lỗi chung
  routes/
    auth.ts users.ts departments.ts cameras.ts attendance.ts requests.ts hanet.ts admin.ts settings.ts
shared/
  types.ts          types dùng chung cho server và React
```

- `createApp(db)` trong `server/index.ts` trả về Express app không gọi `listen`, để test tích hợp dùng được với DB `:memory:`.
- Build giữ esbuild → `server.js` (entry đổi thành `server/index.ts`). `node:sqlite` là module có sẵn, đánh dấu external.
- `src/types.ts` được thay bằng import từ `shared/types.ts`.

## 4. Mô hình dữ liệu (SQLite)

PRAGMA khi mở: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`. File: `data/attendance.db`. Bảng `schema_version` ghi phiên bản schema để nâng cấp sau này.

```sql
departments(
  id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL)

users(
  id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, email TEXT, phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('hr','dept_manager','employee')),
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  position TEXT, avatar_url TEXT, hanet_person_id TEXT, face_registered INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('active','inactive')),
  password_hash TEXT, must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL)

sessions(
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)

cameras(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, device_key TEXT UNIQUE NOT NULL, place_id INTEGER,
  place_name TEXT, location TEXT, ip_address TEXT, created_at TEXT NOT NULL)

detections(
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hanet_person_id TEXT, device_id TEXT NOT NULL, device_name TEXT, place_id INTEGER,
  ts INTEGER NOT NULL,            -- epoch ms từ Hanet (checkinTime / data.time)
  work_date TEXT NOT NULL,        -- YYYY-MM-DD theo Asia/Ho_Chi_Minh
  image_url TEXT, source TEXT NOT NULL CHECK(source IN ('webhook','reconcile','simulator')),
  UNIQUE(user_id, device_id, ts))
INDEX detections(user_id, work_date)

attendance_days(
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, work_date TEXT NOT NULL,
  first_in INTEGER, last_out INTEGER,          -- epoch ms; last_out NULL = thiếu giờ ra
  late_minutes INTEGER NOT NULL DEFAULT 0, early_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('on_time','late','early_leave','late_and_early','missing_out')),
  late_excused INTEGER NOT NULL DEFAULT 0,
  manual_in INTEGER, manual_out INTEGER,       -- từ yêu cầu quên quẹt được duyệt
  detection_count INTEGER NOT NULL,
  PRIMARY KEY(user_id, work_date))
INDEX attendance_days(work_date)

requests(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('missed_punch','late_explanation','leave_request')),
  reason TEXT NOT NULL, suggested_in TEXT, suggested_out TEXT,   -- HH:mm
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL, reviewed_at TEXT, comment TEXT,
  created_at TEXT NOT NULL)

settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)
  -- work_start '08:00', late_grace_minutes '15', work_end '17:00', min_out_gap_minutes '30',
  -- hanet.client_id, hanet.client_secret, hanet.access_token, hanet.refresh_token,
  -- hanet.token_expires_at, hanet.place_ids (JSON mảng), hanet.webhook_token,
  -- hanet.last_reconcile_at, hanet.last_reconcile_error

webhook_logs(
  id INTEGER PRIMARY KEY, received_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('success','ignored','duplicate','rejected','error')),
  person_name TEXT, device_name TEXT, message TEXT, raw_payload TEXT)
  -- giữ 500 dòng mới nhất, xóa bớt sau mỗi lần ghi
```

Tên phòng ban, tên trưởng phòng, tên nhân viên lấy bằng JOIN khi trả API; không lưu bản chép lặp.

### Dữ liệu cũ
Không chuyển dữ liệu từ `data/database.json`: toàn bộ dữ liệu trong đó là dữ liệu thử nghiệm. File bị xóa khỏi repo và server mới không đọc nó. Hệ thống khởi động với CSDL trống, chỉ có tài khoản `ADMIN` (xem mục 5).

`data/` được thêm vào `.gitignore`.

## 5. Đăng nhập và phân quyền

### Mật khẩu
- `scrypt` (N=16384, r=8, p=1, salt 16 byte, khóa 64 byte), lưu dạng `scrypt$<salt hex>$<hash hex>`. So sánh bằng `timingSafeEqual`.
- Mật khẩu mới tối thiểu 8 ký tự, khác mật khẩu tạm.
- Mật khẩu tạm: 10 ký tự ngẫu nhiên (bỏ ký tự dễ nhầm như `0/O/l/1`), trả về trong response **một lần duy nhất**.

### Phiên
- Đăng nhập thành công → token ngẫu nhiên 32 byte (base64url) trong cookie `sid` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` khi `NODE_ENV=production`, `Max-Age` 7 ngày). DB lưu `sha256(token)`.
- Hạn cố định 7 ngày; hết hạn phải đăng nhập lại.
- Đăng xuất xóa phiên. Đặt lại mật khẩu, đổi mật khẩu, hoặc chuyển nhân viên sang `inactive` → xóa mọi phiên của người đó (đổi mật khẩu giữ lại phiên hiện tại).
- Giới hạn đăng nhập: 5 lần sai trong 15 phút theo khóa `code|ip` → trả 429 đến hết cửa sổ. Bộ đếm trong bộ nhớ.

### Tài khoản HR đầu tiên
Khi không có HR nào đăng nhập được (CSDL trống), hệ thống tạo tài khoản HR mã `ADMIN` với mật khẩu mặc định **`Admin@123`**, ghi trong DEPLOY.md. Nếu đặt biến `ADMIN_INITIAL_PASSWORD` (≥ 8 ký tự) thì dùng giá trị đó thay cho mật khẩu mặc định. `must_change_password=1`: lần đăng nhập đầu bắt buộc đổi mật khẩu.

Rủi ro đã chấp nhận: trong khoảng từ lúc server chạy đến lúc HR đăng nhập lần đầu, ai biết mật khẩu mặc định cũng vào được. DEPLOY.md hướng dẫn đăng nhập và đổi mật khẩu ngay sau khi khởi động (hoặc đặt `ADMIN_INITIAL_PASSWORD`). Log khởi động in nhắc nhở `[BOOTSTRAP]`.

### API xác thực
| API | Mô tả |
|---|---|
| `POST /api/auth/login` `{code, password}` | Sai → 401 `"Mã nhân viên hoặc mật khẩu không đúng"` (không phân biệt sai mã hay sai mật khẩu). Tài khoản `inactive` cũng trả 401 như vậy |
| `POST /api/auth/logout` | |
| `GET /api/auth/me` | Người dùng hiện tại + `mustChangePassword` |
| `POST /api/auth/change-password` `{currentPassword, newPassword}` | |
| `POST /api/users/:id/reset-password` | Chỉ HR; trả mật khẩu tạm |

`POST /api/auth/switch-user`, `GET /api/me` và trường `currentUserId` bị bỏ.

### Middleware
- `requireAuth` áp cho mọi `/api/*` trừ `POST /api/auth/login`, `POST /api/hanet/webhook/:token`, `GET /api/health`. Không có phiên hợp lệ → 401.
- Nếu `must_change_password=1`: chỉ cho `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/logout`; còn lại 403 `{code:'MUST_CHANGE_PASSWORD'}`.
- `requireRole(...roles)` → 403 nếu sai vai trò.
- `scopeFor(user)` trả `{kind:'all'} | {kind:'department', departmentId} | {kind:'self', userId}`; mọi truy vấn danh sách (users, attendance, requests, stats) dùng nó để thêm điều kiện WHERE. Trưởng phòng không có `department_id` → phạm vi rỗng.
- Các API ghi chỉ nhận `Content-Type: application/json` (415 nếu khác), cùng `SameSite=Lax` để chống CSRF.

### Bảng phân quyền
| API | HR | Trưởng phòng | Nhân viên |
|---|---|---|---|
| GET users, attendance, requests, stats | tất cả | phòng mình | bản thân |
| GET departments, cameras | ✓ | ✓ | ✓ |
| POST/PUT users, departments, cameras; reset-password | ✓ | 403 | 403 |
| POST requests (tạo) | ✓ | ✓ | ✓ (cho bản thân) |
| PUT requests (duyệt) | ✓ | phòng mình | 403 |
| GET/PUT settings, hanet config, webhook-logs | ✓ | 403 | 403 |
| POST hanet/simulate | ✓ (khi bật) | 403 | 403 |
| POST attendance/recompute | ✓ | 403 | 403 |
| backup, reset-database | ✓ | 403 | 403 |

### Lỗ hổng cụ thể
- `GET /api/hanet/config`: secret và token trả dạng `••••` + 4 ký tự cuối. `PUT` với trường rỗng giữ giá trị cũ.
- `POST /api/hanet/simulate`: chỉ khi `NODE_ENV !== 'production'` hoặc `ENABLE_SIMULATOR=1`; nếu không → 404. Lượt tạo ra có `source='simulator'`.
- `POST /api/admin/reset-database` `{password}`: HR nhập lại mật khẩu, server sao lưu trước rồi mới xóa. Sau khi xóa, giữ lại tài khoản HR đang thao tác (đã có mật khẩu) để không bị khóa ngoài hệ thống.

## 6. Webhook Hanet và đối soát

### Tài liệu Hanet (đã kiểm tra)
Bộ tài liệu Postman của Hanet không mô tả cơ chế ký webhook. Có API `person/getCheckinByPlaceIdInTimestamp` (tham số `token`, `placeID`, `from`, `to` theo ms, `type=0` nhân viên, `page`, `size`), trả về `personID`, `aliasID`, `deviceID`, `deviceName`, `placeID`, `checkinTime` (ms), `avatar`. Token OAuth lấy/làm mới qua `https://oauth.hanet.com/token` (`grant_type=refresh_token`); hết hạn trả `returnCode -103`.

### Xác thực webhook
- Endpoint: `POST /api/hanet/webhook/:token`. `hanet.webhook_token` là 32 ký tự ngẫu nhiên, sinh khi khởi tạo; HR xem URL đầy đủ và có nút "Tạo token mới".
- So bằng `timingSafeEqual` (trên sha256 của hai chuỗi để cùng độ dài). Sai → 401, ghi `webhook_logs` trạng thái `rejected` (không lưu payload) và log bảo mật.
- `POST /api/hanet/webhook` (không token) → 404.
- Nhận cả `application/json` và `application/x-www-form-urlencoded` (ngoại lệ của quy tắc chỉ JSON).

### Xử lý payload
- Chỉ xử lý sự kiện nhận diện nhân viên (`data.personType`/`type` = 0 nếu có trường này); thời điểm lấy từ `data.time` (ms), thiếu thì dùng giờ nhận và ghi chú trong log.
- Khớp nhân viên: `aliasID` = `users.code` (so không phân biệt hoa thường), nếu không có thì `personID` = `users.hanet_person_id`. **Không khớp theo tên.** Không khớp → log `ignored`.
- Chèn vào `detections` (`INSERT ... ON CONFLICT DO NOTHING`); trùng → log `duplicate`; mới → `recomputeDay` trong cùng transaction, log `success`.
- Trả 200 `{returnCode:1}` cho success/ignored/duplicate; 500 nếu ghi DB lỗi.

### Đối soát
- Chạy khi đã có `hanet.client_id`, `hanet.refresh_token` hoặc `access_token` và ít nhất một `place_id`.
- Mỗi 15 phút: kéo `from = 00:00 hôm nay giờ VN`, `to = bây giờ`, cho từng place, phân trang `size=500`. Lúc 23:30: kéo lại toàn bộ ngày. Lúc khởi động: kéo ngày hôm qua và hôm nay.
- Mỗi bản ghi đi qua cùng hàm xử lý như webhook với `source='reconcile'`; trùng thì bỏ qua.
- `-103` → refresh token một lần rồi thử lại; vẫn lỗi → lưu `hanet.last_reconcile_error`, hiện cảnh báo trong tab Cấu hình. Không ném lỗi làm sập server.
- HR có nút "Đối soát ngay" (`POST /api/hanet/reconcile` `{date}`).

## 7. Tính công

### Hàm thuần (`server/attendance.ts`)
```ts
toVnDate(ts: number): string                 // 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh qua Intl.DateTimeFormat
vnMinutesOfDay(ts: number): number           // phút trong ngày theo giờ VN
computeDay(input: {
  detectionTs: number[];                     // các lượt trong ngày (không tính source='simulator' ở production)
  settings: { workStart: number; graceMinutes: number; workEnd: number; minOutGapMinutes: number }; // phút trong ngày
  lateExcused: boolean; manualIn?: number; manualOut?: number;
}): { firstIn: number|null; lastOut: number|null; lateMinutes: number; earlyMinutes: number; status: DayStatus; detectionCount: number }
```

Quy tắc:
1. `firstIn` = `manualIn` nếu có, nếu không = lượt nhỏ nhất.
2. `lastOut` = `manualOut` nếu có; nếu không = lượt lớn nhất khi `lastOut - firstIn ≥ minOutGapMinutes`; ngược lại `null`.
3. Muộn khi `phút(firstIn) > workStart + grace`; `lateMinutes = phút(firstIn) − workStart`. Nếu `lateExcused` → `lateMinutes = 0`, không tính muộn.
4. Về sớm khi `lastOut ≠ null` và `phút(lastOut) < workEnd`; `earlyMinutes = workEnd − phút(lastOut)`.
5. `status`: `lastOut = null` → `missing_out` (vẫn ghi `lateMinutes`); muộn và sớm → `late_and_early`; chỉ muộn → `late`; chỉ sớm → `early_leave`; còn lại `on_time`.

`recomputeDay(db, userId, workDate)` đọc detections + điều chỉnh trên dòng hiện tại + settings, gọi `computeDay`, upsert `attendance_days`. Không còn detection và không có manual → xóa dòng.

### Duyệt yêu cầu
Trong một transaction, cập nhật `requests` rồi:
- `late_explanation` → `late_excused=1` trên dòng ngày đó, `recomputeDay`.
- `missed_punch` → `manual_in`/`manual_out` từ `suggested_in`/`suggested_out` (giờ VN của `work_date`), tạo dòng nếu chưa có, `recomputeDay`.
- `leave_request` → chỉ đổi trạng thái yêu cầu.
- Từ chối → không đổi dữ liệu công.
Chỉ duyệt được yêu cầu `pending`; duyệt lại → 409.

### Đổi giờ làm
`PUT /api/settings` cập nhật giờ làm. `POST /api/attendance/recompute {from, to}` (tối đa 92 ngày) tính lại mọi dòng trong khoảng.

### API điểm danh
- `GET /api/attendance?date=&departmentId=&search=` → các dòng `attendance_days` (JOIN users, departments) trong phạm vi `scopeFor`.
- `GET /api/attendance/:userId/:date/detections` → các lượt nhận diện kèm ảnh (kiểm phạm vi).
- `GET /api/stats` → trong phạm vi: tổng nhân viên active, số người có mặt hôm nay, đúng giờ, muộn, thiếu giờ ra, chưa điểm danh, số yêu cầu chờ duyệt (trong phạm vi).
- CSV (phía client) xuất theo dòng ngày: Mã NV, Họ tên, Phòng, Ngày, Giờ vào, Giờ ra, Phút muộn, Phút sớm, Trạng thái.

## 8. Giao diện

- **Đăng nhập**: mã NV + mật khẩu; hiện lỗi 401/429.
- **Đổi mật khẩu bắt buộc** khi `mustChangePassword`.
- Một hàm `api()` chung: gặp 401 → về màn đăng nhập; 403 `MUST_CHANGE_PASSWORD` → màn đổi mật khẩu.
- **Navbar**: bỏ ô chuyển tài khoản; hiện tên, vai trò, nút đăng xuất, nút đổi mật khẩu.
- **Tab Điểm danh**: bảng theo ngày (vào/ra/muộn/sớm/trạng thái); bấm dòng mở danh sách lượt nhận diện có ảnh.
- **Tab Nhân sự** (HR): sửa thông tin, đổi trạng thái, đặt lại mật khẩu (hiện mật khẩu tạm một lần, có nút sao chép); khi tạo nhân viên cũng hiện mật khẩu tạm.
- **Tab Phòng ban** (HR): sửa phòng ban (API đã có).
- **Tab Yêu cầu**: form quên quẹt có giờ vào/ra đề xuất.
- **Tab Cấu hình** (HR): giờ làm việc + nút tính lại; URL webhook có token + tạo token mới; Hanet client/place + trạng thái đối soát + "Đối soát ngay"; sao lưu (danh sách, "Sao lưu ngay", tải bản mới nhất); xóa dữ liệu (yêu cầu mật khẩu).

## 9. Sao lưu và vận hành

### Sao lưu (`server/backup.ts`)
- `VACUUM INTO 'data/backups/attendance-YYYY-MM-DD[-HHmm-<lý do>].db'`.
- Tự động 02:00 giờ VN hằng ngày; trước khi xóa dữ liệu; khi HR bấm "Sao lưu ngay".
- Giữ 30 bản sao lưu hằng ngày mới nhất; bản theo lý do (pre-reset, manual) giữ 30 bản riêng.
- `GET /api/admin/backups` (danh sách), `POST /api/admin/backups` (tạo), `GET /api/admin/backups/latest` (tải về). Chỉ HR.

### Lịch chạy (`server/jobs.ts`)
Một `setInterval` mỗi phút kiểm tra giờ VN và chạy: sao lưu (02:00), đối soát (mỗi 15 phút, 23:30), xóa phiên hết hạn (mỗi giờ). Mỗi job có cờ đang chạy để không chạy chồng. Không chạy trong test.

### Triển khai
- Khởi động kiểm `process.versions.node ≥ 22.13`, nếu không dừng với thông báo.
- Cổng 3001 thống nhất ở `ecosystem.config.cjs`, `Dockerfile` (`node:22-alpine`), `docker-compose.yml`.
- `app.set('trust proxy', 1)` khi `TRUST_PROXY=1` (mặc định bật trong cấu hình PM2/Docker vì chạy sau nginx).
- `GET /api/health` → `{ok:true}` sau khi chạy `SELECT 1`; 503 nếu lỗi.
- DEPLOY.md: bỏ hướng dẫn Render Free; yêu cầu Node 22.13+; cấu hình nginx HTTPS; URL webhook có token; tài khoản mặc định `ADMIN` / `Admin@123` và việc đổi mật khẩu ngay; chép `data/backups` ra ngoài (ví dụ rsync/rclone); quy trình nâng cấp từ bản cũ (bỏ dữ liệu thử nghiệm).
- Giữ cách commit sẵn `dist/` và `server.js`.

### Xử lý lỗi và log
- `HttpError(status, message, code?)`; middleware lỗi chung trả `{error, code?}`; lỗi không lường trước → 500 `"Lỗi hệ thống"`, stack chỉ in log (không trả về ở production).
- Log bảo mật dạng `[SECURITY] <sự kiện> code=... ip=...`: đăng nhập sai, bị khóa tạm, sai token webhook, đặt lại mật khẩu, đổi token webhook, xóa dữ liệu.

## 10. Test

Công cụ: `node:test` + `node:assert`, chạy bằng `tsx --test`. Script `npm test`. Không thêm thư viện.

**Unit**
- `toVnDate`/`computeDay`: lượt 00:30 giờ VN (17:30 UTC hôm trước) thuộc đúng ngày VN; vào 08:15 → đúng giờ, 08:16 → muộn 16 phút; chỉ một lượt → `missing_out`; hai lượt cách 29 phút → `missing_out`, cách 30 phút → có giờ ra; ra 16:50 → sớm 10 phút; muộn + sớm → `late_and_early`; `lateExcused`; `manualIn`/`manualOut`; kết quả không đổi khi đặt `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh`.
- `hashPassword`/`verifyPassword`: đúng, sai, chuỗi hỏng.
- `scopeFor`: ba vai trò, trưởng phòng không có phòng.

**Tích hợp** (`createApp` với DB `:memory:`, `listen(0)`, gọi bằng `fetch`)
- Đăng nhập → bị buộc đổi mật khẩu (403 `MUST_CHANGE_PASSWORD`) → đổi → truy cập được → đăng xuất → 401.
- Khóa sau 5 lần sai (429).
- Ma trận phân quyền ở mục 5: từng vai trò × từng API, kiểm mã trạng thái; trưởng phòng/nhân viên không thấy dữ liệu ngoài phạm vi.
- Config Hanet trả secret đã che.
- Webhook: sai token 401; đúng token tạo detection + attendance_day; gửi trùng không tạo thêm; người lạ bị bỏ qua; aliasID khớp không phân biệt hoa thường.
- Duyệt `late_explanation`, `missed_punch` thay đổi đúng dòng ngày; duyệt lại 409.
- Khởi tạo: CSDL trống → có đúng một tài khoản `ADMIN`, đăng nhập bằng `Admin@123` bị buộc đổi mật khẩu; khởi động lần hai không tạo thêm hay đặt lại mật khẩu.
- Reset: sai mật khẩu 403; đúng → có bản sao lưu, HR thao tác vẫn đăng nhập được.

**Đối soát Hanet**: hàm gọi API nhận `fetch` được tiêm vào để test với dữ liệu giả: phân trang, refresh khi `-103`, trùng với webhook không tạo bản ghi mới.

## 11. Tiêu chí hoàn thành
- `npm test` và `npm run lint` pass.
- Không còn `switch-user`, `currentUserId`, khớp theo tên, `toISOString().split('T')[0]` cho ngày công, giờ làm viết cứng.
- `data/` không còn trong git.
- Chạy thử với `TZ=UTC`: lượt nhận diện 08:30 giờ VN hiển thị muộn 30 phút, đúng ngày.
- Khởi động trên CSDL trống chỉ tạo tài khoản `ADMIN`; đăng nhập được bằng `Admin@123` và bị buộc đổi mật khẩu. `data/database.json` không còn trong repo.
