# Đợt A — Khu vực, phân quyền theo khu và tài khoản nhân sự

- **Ngày:** 2026-10-14
- **Trạng thái:** chờ duyệt
- **Thuộc chuỗi:** A (khu vực, phân quyền, tài khoản) → B (ca làm việc, đi sớm, tăng ca, vắng/công tác/phép) → C (điều chỉnh điểm danh, nhật ký kiểm toán) → D (bảng công nâng cao, biểu đồ 7 ngày, báo cáo chuyên cần). Mỗi đợt có spec, kế hoạch và code riêng.
- **Tham khảo:** `docs/TAI_LIEU_DU_AN_THAM_KHAO.md` (mục 1.2.4, 5, 6.7). Không làm theo mục 7 của tài liệu đó (webhook giả định, không khớp Camera AI thật).

## 1. Mục tiêu

1. Một địa điểm Camera AI, nhiều **khu vực** trên web (ví dụ Trụ sở 26 Đức Giang, Tổng kho Đức Giang, Kho Đỗ Xá, Cửa hàng xăng dầu).
2. **HR toàn hệ thống** xem và quản lý mọi khu; **quản trị khu vực** chỉ xem và quản lý các khu được giao.
3. Tài khoản `ADMIN` giữ cấu hình kỹ thuật và là người duy nhất xóa được tài khoản HR.
4. Thêm nhân sự bắt buộc có **email và số điện thoại**, **mã nhân viên tự sinh**, **mật khẩu tạm gửi qua email**, người dùng **tự đặt lại mật khẩu** qua email, và **nhập nhân sự từ file CSV**.
5. Đăng nhập bằng **mã nhân viên hoặc email**.

Không thuộc đợt này: ca làm việc, trạng thái ngày công mới, điều chỉnh điểm danh, nhật ký kiểm toán, báo cáo (đợt B, C, D). Không gửi SMS.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| Q1 | Nhân sự thuộc khu theo **phòng ban**. Quẹt ở camera khu khác vẫn tính công bình thường; khu của người đó là khu được xem. |
| Q2 | Quản trị khu vực có **toàn quyền như HR trong khu**, kể cả xóa nhân sự và phòng ban trong khu. |
| Q3 | Một quản trị khu vực quản lý **một hoặc nhiều khu**. |
| Q4 | HR toàn hệ thống **được xóa** nhân sự và phòng ban. `ADMIN` xóa được mọi thứ, **kể cả tài khoản HR**. |
| Q5 | Tab Cấu hình (kết nối Camera AI, tài khoản xem video, webhook, đồng bộ toàn bộ, sao lưu, xóa dữ liệu, gửi thư): **chỉ `ADMIN` thay đổi**. HR toàn hệ thống xem được (không thấy bí mật). Thẻ "Giờ làm việc" HR toàn hệ thống vẫn sửa. |
| Q6 | Quản trị khu **được thấy** danh sách người chưa nhập của cả hệ thống khi dùng "Nhập từ Camera AI". |
| Q7 | Lúc test gửi thư bằng **Gmail** (mật khẩu ứng dụng); cấu hình SMTP dạng chung để sau chuyển sang hộp thư công ty. |
| Q8 | Đăng nhập bằng **mã nhân viên hoặc email**; email không trùng giữa các nhân sự. |
| Q9 | Gửi thư lỗi: **vẫn tạo tài khoản**, gắn nhãn "Chưa gửi được thư", có nút gửi lại. Mật khẩu **không bao giờ hiện cho HR**. |
| Q10 | Người nhập từ Camera AI không có email: vẫn nhập, nhãn "Thiếu email", **chưa đăng nhập được** cho tới khi HR bổ sung email; lưu email thì tự gửi thư. |
| Q11 | Định dạng CSV và cách nhập theo mục 7 dưới đây. |

## 3. Dữ liệu (schema v3)

Không viết migration (giữ nguyên chính sách của bản v2): `SCHEMA_VERSION = 3`; database phiên bản khác thì không mở, in `[STARTUP] Database phiên bản cũ (v<n>). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` và thoát mã 1.

**Bảng mới**

- `areas(id TEXT PK, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)` — mã tự sinh `KV01`, `KV02`… (tiếp sau số lớn nhất), nhập tay được.
- `admin_areas(user_id TEXT REFERENCES users(id) ON DELETE CASCADE, area_id TEXT REFERENCES areas(id) ON DELETE CASCADE, PRIMARY KEY(user_id, area_id))`.
- `email_jobs(id INTEGER PK, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, kind TEXT CHECK(kind IN ('welcome','reset_temp','reset_link')), to_email TEXT NOT NULL, status TEXT CHECK(status IN ('pending','sent','error')), attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, payload TEXT NOT NULL DEFAULT '{}', next_run_at INTEGER NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER)`. `payload` **không bao giờ chứa mật khẩu**. Riêng `reset_link` tạm giữ token đặt lại (dạng rõ, vì phải chèn vào thư) và bị xóa khỏi `payload` ngay khi job kết thúc (mục 6.3).
- `password_resets(token_hash TEXT PK, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, used_at INTEGER)`.

**Cột mới**

- `departments.area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT` (NULL = chưa gán khu).
- `cameras.area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT` (NULL = chưa gán khu).
- `users.role` thêm giá trị `area_admin`: `CHECK(role IN ('hr','area_admin','dept_manager','employee'))`.
- `users.email_status TEXT NOT NULL DEFAULT 'none' CHECK(email_status IN ('none','pending','sent','error'))` — trạng thái thư gần nhất.
- `users.email_error TEXT`.
- Chỉ mục duy nhất: `CREATE UNIQUE INDEX idx_users_email ON users(lower(email)) WHERE email != ''`.
- `users.password_hash` NULL = chưa đăng nhập được (người nhập từ Camera AI chưa có email, hoặc thư chào mừng chưa gửi).

Khu vực xóa được chỉ khi không còn phòng ban và camera (RESTRICT + kiểm tra trước để báo lỗi tiếng Việt).

## 4. Vai trò và phạm vi

| Vai trò | Phạm vi dữ liệu | Ghi chú |
|---|---|---|
| `ADMIN` (tài khoản hệ thống, role `hr`, mã `ADMIN`) | Mọi khu | Như HR toàn hệ thống + cấu hình kỹ thuật + xóa tài khoản HR. Không phải nhân sự (giữ `NOT_SYSTEM_ADMIN`). |
| HR toàn hệ thống (`hr`) | Mọi khu, kể cả "chưa gán khu" | Quản lý khu vực, cấp quyền quản trị khu, nhập/làm mới camera, giờ làm việc, mô phỏng, tính lại ngày công. |
| Quản trị khu vực (`area_admin`) | Hợp các khu trong `admin_areas` | Toàn quyền như HR trên đối tượng thuộc khu mình. Chỉ tạo/gán vai trò `employee`, `dept_manager`. |
| Trưởng phòng (`dept_manager`) | Phòng của mình | Không đổi. |
| Nhân viên (`employee`) | Bản thân | Không đổi. |

**Đối tượng thuộc khu nào**

- Nhân sự: khu của phòng ban (`users.department_id → departments.area_id`). Không có phòng ban hoặc phòng chưa gán khu ⇒ chỉ HR toàn hệ thống thấy.
- Phòng ban, camera: cột `area_id`.
- Đơn từ, ngày công, lượt quẹt, video: theo nhân sự sở hữu.
- Ảnh người lạ (`face_sightings`): theo camera đã chụp (`device_id → cameras.area_id`); camera chưa gán khu ⇒ chỉ HR toàn hệ thống.

**Phạm vi (`scopeFor`)** thêm loại `{ kind: 'areas', areaIds: string[] }`. Câu lọc nhân sự: `u.department_id IN (SELECT id FROM departments WHERE area_id IN (…))`. Danh sách khu đọc lại từ DB **mỗi request** (gỡ quyền có hiệu lực ngay). `area_admin` không có khu nào ⇒ thấy rỗng.

**Bộ lọc khu đang chọn**: các API danh sách/thống kê nhận `?area=<id>|none|all` (mặc định `all`). Server lấy giao của bộ lọc với phạm vi người gọi; `none` chỉ hợp lệ với HR toàn hệ thống; id ngoài phạm vi ⇒ 404.

## 5. Ma trận quyền

Quy ước ba loại cổng ở server:

1. `requireSystemAdmin` — chỉ `ADMIN`.
2. `requireGlobalHr` — `hr` (gồm `ADMIN`).
3. `requireManager` — `hr` hoặc `area_admin`; kèm **kiểm tra đối tượng thuộc phạm vi** (cả giá trị cũ và giá trị mới khi sửa). Đối tượng ngoài phạm vi ⇒ **404 "Không tìm thấy …"** (không lộ sự tồn tại).

| Nhóm API | Cổng |
|---|---|
| Khu vực: tạo, sửa, xóa; gán phòng ban/camera vào khu; cấp/gỡ `area_admin` và danh sách khu | `requireGlobalHr` |
| `PUT /hanet/config`, `PUT /hanet/connect`, `POST /hanet/connect/test`, `POST /hanet/test-connection`, `POST /hanet/webhook-token/rotate`, `POST /hanet/sync/retry` (không kèm đối tượng), `POST /admin/backups`, `GET /admin/backups/latest`, `POST /admin/reset-database`, cấu hình và thử gửi thư | `requireSystemAdmin` |
| `GET /hanet/config`, `GET /hanet/connect`, `GET /hanet/sync`, `GET /hanet/webhook-logs`, `GET /admin/backups`, `GET /settings/mail` (đã che mật khẩu) | `requireGlobalHr` |
| `PUT /settings/work`, `POST /cameras/import`, `POST /cameras/refresh-status`, `POST /cameras` (thêm tay), `POST /attendance/recompute`, `POST /hanet/simulate` | `requireGlobalHr` |
| Nhân sự: tạo, sửa, đặt lại mật khẩu, gửi lại thư, FaceID, nhập CSV, nhập từ Camera AI; phòng ban: tạo, sửa; camera: sửa tên/vị trí; đơn: duyệt; `POST /hanet/sync/retry` kèm đối tượng | `requireManager` + phạm vi |
| `GET /hanet/sightings`, `GET /hanet/persons/unlinked` | `requireManager` (sightings lọc theo khu camera; persons không lọc — Q6) |
| Xóa | theo bảng dưới |

**Xóa**

| Người xóa | Nhân viên, trưởng phòng | Quản trị khu vực | HR | Phòng ban | Camera | Khu vực (trống) |
|---|---|---|---|---|---|---|
| `ADMIN` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| HR toàn hệ thống | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| Quản trị khu vực | ✓ trong khu | ✗ | ✗ | ✓ trong khu | ✓ trong khu | ✗ |

Không ai tự xóa mình; `ADMIN` không bị xóa. Mọi lần xóa nhân sự/phòng ban vẫn sao lưu `pre-delete` trước và ghi `[SECURITY]`.

**Ràng buộc khi `area_admin` sửa**

- Không đặt vai trò ngoài `employee`/`dept_manager`, không sửa người có vai trò `hr`/`area_admin` (kể cả chính mình: vai trò, trạng thái).
- `departmentId` mới phải thuộc khu của mình (bắt buộc có khi tạo).
- `area_id` của phòng ban/camera: chỉ chọn trong khu của mình; không đặt về NULL.
- HR toàn hệ thống không sửa được tài khoản `ADMIN`; chỉ `ADMIN` sửa/xóa người có vai trò `hr`.

## 6. Tài khoản, mật khẩu và gửi thư

### 6.1 Thêm nhân sự (form)

- Bắt buộc: họ tên, **email**, **số điện thoại**, phòng ban (bắt buộc với `area_admin`; HR toàn hệ thống được để trống).
- Email: chuẩn hóa chữ thường, kiểm tra định dạng, không trùng (409 "Email đã được dùng cho nhân sự khác").
- Số điện thoại: bỏ khoảng trắng/dấu chấm/gạch; hợp lệ khi khớp `^0\d{9}$` hoặc `^\+84\d{9}$` (lưu dạng `0xxxxxxxxx`).
- **Mã nhân viên**: ô điền sẵn mã gợi ý `NV0001`… (tiếp sau số lớn nhất, bỏ qua mã đã dùng trên Camera AI như hàm `nextEmployeeCode` hiện có), HR sửa được; vẫn chặn `ADMIN`.
- Tạo xong: `password_hash = NULL`, `email_status = 'pending'`, xếp `email_jobs(kind='welcome')`. **Không trả mật khẩu tạm** trong response nữa (bỏ `TempPasswordDialog` ở luồng tạo và luồng nhập).
- Sửa email của người chưa đăng nhập được (`password_hash IS NULL`) ⇒ xếp lại `welcome`.

### 6.2 Gửi thư (`email_jobs`)

- Job chạy mỗi phút (cùng cơ chế `jobs.ts`), tuần tự, tối đa 20 thư/lượt.
- **Mật khẩu tạm được sinh lúc gửi**, không lúc xếp hàng: trong một giao dịch, sinh mật khẩu, ghi `password_hash` + `must_change_password = 1`, rồi gửi thư; gửi lỗi thì khôi phục `password_hash` cũ (NULL với `welcome`). Nhờ vậy DB không lưu mật khẩu dạng rõ.
- Thư `welcome`: chào, mã nhân viên, email đăng nhập, mật khẩu tạm, địa chỉ web, lưu ý phải đổi mật khẩu khi đăng nhập lần đầu.
- Thử lại: lỗi tạm (mạng, 4xx tạm của SMTP) sau 1, 5, 15, 60 phút, tối đa 5 lần; lỗi vĩnh viễn (địa chỉ không tồn tại, sai xác thực SMTP) ⇒ `error` ngay. `users.email_status/email_error` cập nhật theo job mới nhất.
- **Hạn mức ngày**: `mail.daily_limit` (mặc định 450 cho Gmail). Đạt hạn mức thì dừng, phần còn lại chạy sau 00:00 giờ Việt Nam.
- Chưa cấu hình SMTP ⇒ job giữ `pending`, card Cấu hình báo "Chưa cấu hình gửi thư".
- "**Gửi lại thư**" (nút trên nhân sự có `email_status = 'error'` hoặc `password_hash IS NULL`): xếp `welcome` (nếu chưa từng đăng nhập) hoặc `reset_temp`.

### 6.3 Đặt lại mật khẩu

- **HR/quản trị khu đặt lại hộ** (`POST /users/:id/reset-password`): xếp `reset_temp`; thư chứa mật khẩu tạm mới (sinh lúc gửi như 6.2); phiên cũ của người đó bị hủy khi thư gửi thành công. Response chỉ `{ queued: true }`.
- **Tự đặt lại** — màn hình đăng nhập có "Quên mật khẩu?":
  - `POST /auth/forgot-password { login }` (mã hoặc email). **Luôn trả cùng một câu** "Nếu tài khoản tồn tại và có email, thư hướng dẫn đã được gửi." Giới hạn 5 lần/15 phút theo IP và theo tài khoản.
  - Có tài khoản hợp lệ, đang hoạt động, có email ⇒ tạo token ngẫu nhiên 32 byte, lưu **băm SHA-256** vào `password_resets` (hạn **30 phút**, hủy các token cũ của người đó), xếp `email_jobs(kind='reset_link')` với token **trong payload**, xóa payload ngay sau khi gửi xong (thành công hay lỗi vĩnh viễn).
  - Link: `<mail.app_url>/?reset=<token>`. `mail.app_url` do `ADMIN` cấu hình (không lấy từ header Host để tránh giả mạo link).
  - `POST /auth/reset-password { token, newPassword }`: token hợp lệ, chưa dùng, chưa hết hạn ⇒ đặt mật khẩu (quy tắc độ mạnh hiện có), `must_change_password = 0`, đánh dấu `used_at`, hủy mọi phiên của người đó. Sai/hết hạn ⇒ 400 "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn".

### 6.4 Đăng nhập

- `POST /auth/login { login, password }` (giữ tương thích trường `code`): có `@` ⇒ tìm theo `lower(email)`, ngược lại theo mã (chữ hoa). Giới hạn đăng nhập sai hiện có áp dụng theo chuỗi `login` đã chuẩn hóa.
- `password_hash IS NULL` ⇒ cùng thông báo như sai mật khẩu (không lộ trạng thái).

### 6.5 Cấu hình gửi thư (thẻ mới trong Cấu hình, chỉ `ADMIN` sửa)

- Trường: máy chủ SMTP, cổng, bảo mật (SSL/TLS hoặc STARTTLS), tài khoản, mật khẩu (không bao giờ trả về client), tên và địa chỉ người gửi, **địa chỉ web** (`mail.app_url`), hạn mức thư/ngày.
- Nút "**Dùng Gmail**" điền sẵn `smtp.gmail.com`, 465, SSL, hạn mức 450, kèm hướng dẫn tạo mật khẩu ứng dụng Google.
- Nút "**Gửi thư thử**" tới email nhập vào.
- Thư viện: thêm dependency runtime `nodemailer` (ngoại lệ có chủ đích so với chính sách "chỉ express, dotenv").

## 7. Nhập nhân sự từ CSV

- Nút "Nhập từ file CSV" trong tab Nhân sự (`requireManager`). Có "Tải file mẫu" (`mau-nhap-nhan-su.csv`, UTF-8 có BOM, dấu phẩy, một dòng ví dụ).
- Cột (dòng tiêu đề bắt buộc, không phân biệt hoa thường, thứ tự tùy ý):

| Cột | Bắt buộc | Quy tắc |
|---|---|---|
| `ma_nhan_vien` | Không | Trống ⇒ tự sinh. Có ⇒ theo `CODE_RE`, không trùng, không phải `ADMIN`. |
| `ho_ten` | ✓ | |
| `email` | ✓ | Định dạng, không trùng DB, không trùng trong file. |
| `so_dien_thoai` | ✓ | Như 6.1. |
| `ma_phong_ban` | ✓ | Mã phòng có thật; `area_admin` chỉ dùng phòng trong khu mình. |
| `chuc_vu` | Không | |
| `vai_tro` | Không | `nhan_vien` (mặc định) hoặc `truong_phong`. |

- Đọc file ở trình duyệt: tự nhận dấu `,` hoặc `;`, bỏ BOM, hỗ trợ ô có ngoặc kép. Gửi lên server dạng JSON `{ rows: [...] }` (không upload file).
- `POST /users/import-csv/preview` ⇒ kiểm tra **không tạo gì**, trả từng dòng `{ line, ok, errors[], code }` (mã sẽ dùng). `POST /users/import-csv` ⇒ kiểm tra lại toàn bộ, tạo các dòng hợp lệ trong một giao dịch, bỏ dòng lỗi, trả `{ created, skipped }`; mỗi người tạo một `welcome`.
- Tối đa **200 dòng**/lần (400 "Mỗi lần nhập tối đa 200 dòng").
- Mã tự sinh trong cùng file không trùng nhau và không trùng aliasID trên Camera AI (nếu đã cấu hình; lỗi gọi Camera AI thì bỏ qua bước này).

## 8. Nhập từ Camera AI (thay đổi)

- Người nhập: không có email/điện thoại ⇒ `email_status = 'none'`, `password_hash = NULL`, nhãn "**Thiếu email**". Bỏ màn hình danh sách mật khẩu tạm và file CSV mật khẩu.
- `area_admin` dùng được; phòng ban đích bắt buộc và phải thuộc khu mình.
- Bổ sung email cho người "Thiếu email" ⇒ xếp `welcome` (6.1).
- Ngoại lệ có chủ đích: người nhập từ Camera AI được tạo **không cần email/điện thoại** (Q10); các luồng khác bắt buộc.

## 9. Giao diện

- **Thanh trên cùng**: bộ chọn khu (HR toàn hệ thống: "Tất cả khu vực", từng khu, "Chưa gán khu"; `area_admin` có ≥ 2 khu: "Tất cả khu của tôi", từng khu). Lưu lựa chọn trong `localStorage` (bọc try/catch). Mọi tab gửi `?area=`.
- **Tab Khu vực** (mới, HR toàn hệ thống): danh sách khu (mã, tên, số phòng ban, số camera, số nhân sự, quản trị khu); thêm/sửa/xóa; gán nhanh phòng ban và camera.
- **Nhân sự**: cột khu (theo phòng), email, điện thoại, nhãn trạng thái thư (Chờ gửi / Đã gửi / Lỗi gửi thư / Thiếu email); nút Gửi lại thư; nút Nhập từ file CSV; form: email, điện thoại bắt buộc, mã điền sẵn gợi ý, phòng ban lọc theo khu, vai trò lọc theo quyền; HR toàn hệ thống chọn "Quản trị khu vực" thì hiện ô tích chọn khu.
- **Phòng ban**: cột và ô chọn khu.
- **Camera**: cột và ô chọn khu; nhập/làm mới/thêm tay chỉ HR toàn hệ thống.
- **Màn hình đăng nhập**: ô "Mã nhân viên hoặc email"; link "Quên mật khẩu?"; mở web với `?reset=<token>` ⇒ form đặt mật khẩu mới.
- **Cấu hình**: `ADMIN` sửa; HR toàn hệ thống xem (các nút sửa ẩn/disabled, bí mật che); thẻ mới "Gửi thư".
- Ẩn nút chỉ là phụ; server luôn kiểm tra (mục 5).

## 10. Lỗi và bảo mật

- Mọi lỗi hiển thị tiếng Việt; không nhắc "Hanet" trên giao diện.
- Không log mật khẩu, mật khẩu tạm, token đặt lại, mật khẩu SMTP. Log gửi thư: `[MAIL] kind=… user=<mã> status=… code=…`.
- Đặt lại mật khẩu không lộ việc tài khoản tồn tại; token chỉ lưu băm; một lần; 30 phút.
- Đối tượng ngoài phạm vi ⇒ 404.

## 11. Kiểm thử

- Ma trận phân quyền mở rộng: `ADMIN`, HR toàn hệ thống, quản trị khu A, quản trị khu A+B, trưởng phòng, nhân viên × mọi route (bảng mục 5).
- Phạm vi: `area_admin` A không thấy/sửa/xóa dữ liệu khu B (nhân sự, phòng, camera, đơn, lượt quẹt, video, ảnh người lạ); không chuyển dữ liệu ra ngoài khu; không tạo HR/quản trị khu; bộ lọc `?area=`; lượt quẹt ở camera khu khác tính cho khu của người đó; gỡ quyền có hiệu lực ngay.
- Bảng xóa (mục 5) đủ các ô.
- Tài khoản: tạo thiếu email/điện thoại ⇒ 400; email trùng (hoa/thường) ⇒ 409; mã gợi ý; thư `welcome` sinh mật khẩu lúc gửi và DB không có mật khẩu rõ; gửi lỗi ⇒ `email_status='error'`, mật khẩu không đổi; hạn mức ngày; thử lại; đăng nhập bằng email; `password_hash NULL` không đăng nhập được.
- Quên mật khẩu: cùng thông điệp cho tài khoản có/không tồn tại; token hết hạn, dùng lại, sai ⇒ 400; dùng xong hủy phiên; giới hạn tần suất; link dùng `mail.app_url`.
- CSV: dấu `,`/`;`, BOM, ngoặc kép, thiếu cột bắt buộc, trùng trong file, phòng ngoài khu, > 200 dòng, preview không tạo gì.
- Gửi thư dùng transport giả trong test (không gọi SMTP thật).
- `TZ=UTC npm test` vẫn qua.

## 12. Nâng cấp và triển khai

- `DEPLOY.md`: mục "Nâng cấp lên database v3" (sao lưu, xóa DB, `npm install --omit=dev` vì có `nodemailer`), rồi: cấu hình gửi thư (Gmail + mật khẩu ứng dụng, địa chỉ web), cấu hình Camera AI, tạo khu vực, gán phòng ban và camera, tạo HR/quản trị khu, nhập nhân sự (CSV hoặc Camera AI, bổ sung email).
- Danh sách kiểm tra trên host: thư chào mừng tới Gmail, đăng nhập bằng email, quên mật khẩu, quản trị khu chỉ thấy khu mình.

## 13. Tiêu chí hoàn thành

- Toàn bộ mục 11 có test và qua; `npm test`, `TZ=UTC npm test`, `npm run lint`, `npm run build` sạch.
- Không còn luồng nào hiện mật khẩu tạm cho HR.
- Trên host: tạo một nhân sự thật, nhận thư Gmail, đăng nhập bằng email, đổi mật khẩu; quản trị khu A không thấy dữ liệu khu B.
