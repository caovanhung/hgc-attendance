# Đợt C — Bảng công tháng, điều chỉnh điểm danh, nhật ký kiểm toán, trang cá nhân

- **Ngày:** 2026-10-15
- **Trạng thái:** chờ duyệt
- **Thuộc chuỗi:** A (xong) → B (xong) → **C**.
- **Tham khảo:** `docs/TAI_LIEU_DU_AN_THAM_KHAO.md` mục 3.4, 6.3, 6.4, 6.8.

## 1. Mục tiêu

1. **Bảng công tháng**: xem trên web và xuất **Excel `.xlsx`** gồm 2 sheet — "Tổng hợp" (mỗi người một dòng) và "Chấm công" (lưới ngày 1..31 bằng ký hiệu).
2. **Điều chỉnh điểm danh trực tiếp** (sửa giờ, hoặc chuyển ngày thành nghỉ phép/công tác) **bắt buộc lý do**, gắn nhãn "Đã điều chỉnh".
3. **Nhật ký kiểm toán** cho các thao tác ảnh hưởng tới công và quyền.
4. **Khóa sổ tháng**: tháng đã khóa không thay đổi được nữa.
5. **Trang "Của tôi"** cho mọi vai trò: thông tin, hôm nay, lịch sử tháng, nộp đơn.
6. Nâng cấp database **v4 → v5 giữ nguyên dữ liệu** (migration, tự sao lưu trước, có chạy thử).

**Không làm trong đợt này:** tăng ca, biểu đồ 7 ngày, in theo mẫu công văn, quỹ ngày phép, nghỉ nửa ngày, lịch sử ca theo thời gian (báo cáo dùng ca **hiện tại** của mỗi người để biết ngày phải làm), thông báo email đi muộn/vắng.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| C1 | Excel gồm **cả hai**: sheet "Tổng hợp" và sheet "Chấm công" (lưới), cùng một file. |
| C2 | Điều chỉnh trực tiếp: **HR toàn hệ thống** (mọi người) và **quản trị khu** (người trong khu mình). Trưởng phòng không điều chỉnh (vẫn duyệt đơn). Không ai tự điều chỉnh ngày của mình. |
| C3 | Nhật ký ghi: điều chỉnh / bỏ điều chỉnh ngày công; duyệt / từ chối đơn; đổi vai trò, khu được giao, trạng thái tài khoản, xóa tài khoản; đổi ca, ca mặc định / ngưỡng, ngày lễ; khóa / mở khóa tháng; đăng nhập (thành công và sai) của HR và quản trị khu. Giữ vĩnh viễn. HR xem tất cả, quản trị khu xem dòng liên quan tới người hoặc khu của mình. |
| C4 | Tab "Của tôi" cho **mọi vai trò**; với nhân viên nó **thay** tab "Bảng công" và là trang mặc định. |
| C5 | **Khóa sổ tháng**: HR toàn hệ thống khóa / mở khóa; tháng khóa chặn mọi thay đổi ngày công của tháng đó. |
| C6 | Ngày công = đi làm + công tác; thiếu giờ ra vẫn tính 1 công (đếm riêng để rà soát); bảng ký hiệu ở §6. |

## 3. Dữ liệu (schema v5)

**Bảng mới**

- `attendance_overrides` — điều chỉnh trực tiếp, tối đa một dòng mỗi người mỗi ngày:
  ```sql
  CREATE TABLE attendance_overrides (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('times', 'leave', 'business_trip')),
    first_in INTEGER,      -- ms, chỉ với kind='times'; NULL = giữ giá trị tự tính
    last_out INTEGER,      -- ms, chỉ với kind='times'; NULL = giữ giá trị tự tính
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, work_date),
    CHECK (kind != 'times' OR first_in IS NOT NULL OR last_out IS NOT NULL)
  );
  ```
  Tên "override" để tách khỏi `DayAdjustment` hiện có (giờ bổ sung từ đơn quên quẹt, `late_excused`).
- `audit_logs` — chỉ thêm, không sửa/xóa qua API:
  ```sql
  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,                 -- ISO
    actor_id TEXT,                    -- NULL với đăng nhập sai tài khoản không tồn tại
    actor_label TEXT NOT NULL,        -- "Tên (MÃ)" tại thời điểm ghi, hoặc chuỗi đăng nhập đã nhập
    ip TEXT,
    action TEXT NOT NULL,             -- xem §5
    target_user_id TEXT,              -- người bị tác động (nếu có)
    target_label TEXT,                -- "Tên (MÃ)", "Ca X", "Tháng 2026-10"...
    area_id TEXT,                     -- khu của đối tượng tại thời điểm ghi (để quản trị khu lọc)
    work_date TEXT,                   -- ngày công liên quan (nếu có)
    before_json TEXT,
    after_json TEXT,
    reason TEXT
  );
  CREATE INDEX idx_audit_at ON audit_logs(at);
  CREATE INDEX idx_audit_target ON audit_logs(target_user_id);
  CREATE INDEX idx_audit_area ON audit_logs(area_id);
  ```
  Không khóa ngoại tới `users` để nhật ký còn nguyên khi người bị xóa.
- `month_locks(month TEXT PRIMARY KEY, locked_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, locked_at TEXT NOT NULL)` — `month` dạng `YYYY-MM`.

Không thêm cột vào `attendance_days`: cờ "Đã điều chỉnh" lấy bằng `LEFT JOIN attendance_overrides`.

## 4. Migration v4 → v5

- `MIGRATIONS` thêm `{ from: 4, run: migrate4to5 }`: chỉ `CREATE TABLE`/`CREATE INDEX` ba bảng trên (không đụng dữ liệu cũ). `SCHEMA_VERSION = 5`.
- Dùng nguyên cơ chế đợt B: `backupPreMigrate` tạo `attendance-pre-migrate-v4.db`, chạy trong giao dịch, `MIGRATE_ONLY=1` chạy thử. Database v3 vẫn nâng thẳng lên v5 (chạy lần lượt 3→4→5).
- `DEPLOY.md` thêm mục "Nâng cấp lên bản đợt C (database v5)" theo đúng mẫu mục v4 (dừng pm2, sao lưu tay, pull, `npm ci --omit=dev`, chạy thử trên bản chép kèm WAL, restart, log `[MIGRATE] v4 → v5 xong`).

## 5. Nhật ký kiểm toán

- `server/audit.ts`: `writeAudit(db, entry)`; gọi **trong cùng giao dịch** với thao tác. Thao tác lỗi (ném lỗi, rollback) ⇒ không có dòng nhật ký.
- `actor_label`, `target_label`, `area_id` chụp tại thời điểm ghi. IP = `req.ip` (đã tôn trọng `TRUST_PROXY`).
- **Danh sách `action`** (mã cố định, nhãn tiếng Việt ở frontend):

| action | Khi nào | before / after |
|---|---|---|
| `attendance.override` | tạo / sửa điều chỉnh | ngày công trước / sau (giờ vào, giờ ra, trạng thái) + kiểu điều chỉnh |
| `attendance.override_remove` | bỏ điều chỉnh | ngày công trước / sau |
| `request.approve`, `request.reject` | duyệt / từ chối đơn | `{status:'pending'}` / `{status, comment}` + loại đơn, khoảng ngày |
| `user.role` | đổi vai trò | `{role}` / `{role}` |
| `user.areas` | đổi khu giao cho quản trị khu | `{areaIds}` / `{areaIds}` |
| `user.status` | khóa / mở / nghỉ việc | `{status}` / `{status}` |
| `user.delete` | xóa tài khoản | thông tin chính của người bị xóa / null |
| `shift.create`, `shift.update`, `shift.delete` | ca của khu | ca trước / sau |
| `shift.assign` | đổi ca của phòng ban hoặc ca riêng của người | `{shiftId}` / `{shiftId}` |
| `settings.work` | ca mặc định công ty / ngưỡng | trước / sau |
| `holiday.add`, `holiday.remove` | ngày lễ | null / `{date,name}` hoặc ngược lại |
| `month.lock`, `month.unlock` | khóa / mở khóa sổ | — |
| `auth.login`, `auth.login_failed` | đăng nhập của HR / quản trị khu (kể cả sai mật khẩu); `login_failed` cũng ghi khi chuỗi đăng nhập không khớp tài khoản nào (`actor_id` NULL) | — |

- Đăng nhập của trưởng phòng / nhân viên không ghi (tránh nhiễu). Đăng nhập sai bị chặn bởi giới hạn số lần vẫn ghi `auth.login_failed` với lý do "Bị chặn tạm thời".
- **Xem**: `GET /api/audit?from=&to=&action=&q=&page=` — 50 dòng/trang, mới nhất trước; `q` khớp `actor_label` hoặc `target_label`. HR toàn hệ thống: tất cả. Quản trị khu: dòng có `area_id` thuộc khu mình **hoặc** `target_user_id` / `actor_id` là chính mình. Vai trò khác: 403.

## 6. Ký hiệu và cách tính ngày công

| Trạng thái ngày (`attendance_days.status`) | Ký hiệu | Ngày công | Đếm thêm |
|---|---|---|---|
| `on_time` (kể cả đến sớm) | X | 1 | — |
| `late` | M | 1 | lần muộn, phút muộn |
| `early_leave` | S | 1 | lần về sớm, phút về sớm |
| `late_and_early` | MS | 1 | cả hai |
| `missing_out` & `final` | T | 1 | ngày thiếu giờ ra |
| `missing_out` & chưa chốt (hôm nay) | X | 1 | — (đang trong giờ làm) |
| `business_trip` | CT | 1 | ngày công tác |
| `leave` | P | 0 | ngày nghỉ phép |
| `absent` | V | 0 | ngày vắng |
| Ngày lễ (không có dòng) | L | — | — |
| Ngày không làm theo ca / chưa tới / trước khi tạo tài khoản (không có dòng) | (trống) | — | — |

- Ô có điều chỉnh: ký hiệu kèm `*` (ví dụ `X*`).
- Một ngày không phải ngày làm nhưng có dòng (ví dụ quẹt thứ 7) vẫn hiện ký hiệu và tính công như bảng trên.
- **Ngày phải làm** của một người trong tháng = số ngày `d` thỏa: `d` ≤ hôm nay (nếu là tháng hiện tại; tháng tương lai = 0), `d` ≥ ngày tạo tài khoản, `isWorkday(ca hiện tại, d)` (đã trừ ngày lễ).
- **Ngày công** = số ngày ký hiệu X, M, S, MS, T, CT.
- **Tỷ lệ chuyên cần** = `(ngày công + nghỉ phép) / ngày phải làm`, làm tròn 1 chữ số thập phân; ngày phải làm = 0 ⇒ hiển thị "—". Có thể > 100% khi đi làm ngày không phải ngày làm.
- **Người có mặt trong báo cáo**: người đang làm (`active`, trừ ADMIN) thuộc phạm vi và bộ lọc, **cộng** người đã nghỉ việc nhưng có dòng `attendance_days` trong tháng. Sắp xếp theo tên phòng rồi mã nhân viên.

## 7. Điều chỉnh điểm danh

**Thứ tự ưu tiên khi tính một ngày** (sửa `writeDay` trong `server/attendance.ts`):

1. Tháng của ngày đã khóa sổ ⇒ **không ghi gì**, giữ nguyên dòng hiện có (xem §8).
2. Điều chỉnh `leave` / `business_trip` ⇒ trạng thái tương ứng, `final=1`, giữ giờ quẹt để xem (như đơn đã duyệt), không phụ thuộc ngày làm hay `eligible`.
3. Điều chỉnh `times` ⇒ `manualIn = override.first_in ?? adj.manualIn`, `manualOut = override.last_out ?? adj.manualOut`, rồi tính như thường **nhưng bỏ qua đơn nghỉ đã duyệt** (điều chỉnh thắng đơn). `lateExcused` vẫn áp dụng.
4. Không có điều chỉnh ⇒ giữ nguyên logic đợt B.

**API** (`server/routes/attendance.ts`, logic ở `server/overrides.ts`):

- `PUT /api/attendance/:userId/:date/adjustment` — body:
  - `{ kind: 'times', firstIn?: 'HH:MM' | null, lastOut?: 'HH:MM' | null, reason }` — ít nhất một giờ; giờ hiểu theo giờ Việt Nam của `:date`; nếu có cả hai thì `lastOut > firstIn`; nếu chỉ có một thì so với giá trị tự tính còn lại (giờ ra hiệu lực phải sau giờ vào hiệu lực), sai ⇒ 400.
  - `{ kind: 'leave' | 'business_trip', reason }`.
  - Ghi đè điều chỉnh cũ của ngày đó (nếu có).
- `DELETE /api/attendance/:userId/:date/adjustment` — body `{ reason }`; không có điều chỉnh ⇒ 404.
- **Kiểm tra** (theo thứ tự, mã lỗi):
  - Vai trò không phải HR / quản trị khu ⇒ 403. Người đích ngoài phạm vi (quản trị khu, khu của phòng người đó) ⇒ 404. `:userId` là chính mình ⇒ 403 "Không thể tự điều chỉnh ngày công của mình". Người đích là ADMIN ⇒ 400.
  - `reason` sau khi cắt khoảng trắng dài 5–500 ký tự ⇒ ngược lại 400 "Phải nhập lý do điều chỉnh (5–500 ký tự)".
  - `:date` sai định dạng ⇒ 400; sau hôm nay (giờ VN) ⇒ 400; trước ngày tạo tài khoản ⇒ 400.
  - `:date` không phải ngày làm theo ca **và** chưa có dòng `attendance_days` ⇒ 400 "Ngày này không phải ngày làm việc của nhân sự".
  - Tháng đã khóa ⇒ **423** "Tháng MM/YYYY đã khóa sổ".
- Trong một giao dịch: đọc ngày công trước, ghi/xóa `attendance_overrides`, `recomputeDay`, đọc ngày công sau, `writeAudit`. Trả `AttendanceDay` mới.
- `AttendanceDay` (mọi API trả ngày công) thêm `override: { kind, reason, byName, at } | null`.
- **Đơn từ và điều chỉnh**: duyệt đơn vẫn chạy như cũ, nhưng ngày có điều chỉnh giữ kết quả điều chỉnh (đơn không ghi đè). Đơn quên quẹt duyệt sau khi đã điều chỉnh `times`: `manual_in/out` của đơn vẫn lưu, nhưng giờ điều chỉnh thắng ở ô tương ứng.

## 8. Khóa sổ tháng

- `server/month-lock.ts`: `isMonthLocked(db, date)`, `lockMonth`, `unlockMonth`.
- `POST /api/month-locks/:month` (HR toàn hệ thống): `month` hợp lệ, không phải tháng tương lai, chưa khóa (đã khóa ⇒ 409). `DELETE /api/month-locks/:month`: chưa khóa ⇒ 404. Cả hai ghi nhật ký. `GET /api/month-locks?year=` cho HR / quản trị khu / trưởng phòng: `{ locks: { month, lockedByName, lockedAt }[] }`.
- **Hiệu lực** của tháng đã khóa:
  - `writeDay` không ghi gì (bao trùm: tính lại do đổi ca / ngưỡng / ngày lễ, nút "Tính lại", job đóng ngày, webhook / đối soát nhận lượt quẹt muộn — lượt quẹt vẫn lưu ở `detections`, chỉ ngày công không đổi).
  - Điều chỉnh / bỏ điều chỉnh ⇒ 423.
  - Duyệt hoặc từ chối đơn có **bất kỳ ngày nào** trong khoảng thuộc tháng đã khóa ⇒ 423. Gửi đơn mới cho ngày thuộc tháng đã khóa ⇒ 423.
- Mở khóa không tự tính lại; HR dùng "Tính lại" nếu cần.

## 9. Báo cáo tháng

- `server/reports.ts`: `buildMonthlyReport(db, viewer, { month, area, department }, now)` → `MonthlyReport`:
  ```ts
  interface MonthlyReport {
    month: string;                 // YYYY-MM
    days: { date: string; weekday: number; holiday: string | null }[];
    lock: { lockedByName: string; lockedAt: string } | null;
    scopeLabel: string;            // "Toàn công ty", "Khu …", "Phòng …"
    rows: MonthlyRow[];
  }
  interface MonthlyRow {
    userId: string; employeeCode: string; employeeName: string; departmentName: string | null;
    cells: (string | null)[];      // theo days: 'X','M','S','MS','T','CT','P','V','L' hoặc null; kèm '*' nếu điều chỉnh
    requiredDays: number; workDays: number;
    lateCount: number; lateMinutes: number; earlyCount: number; earlyMinutes: number;
    missingOutDays: number; absentDays: number; leaveDays: number; businessTripDays: number;
    attendanceRate: number | null; // %, 1 chữ số thập phân
  }
  ```
- Phạm vi: HR — tất cả, lọc `area` / `department`; quản trị khu — khu mình; trưởng phòng — phòng mình (bỏ qua bộ lọc khác); nhân viên ⇒ 403. Bộ lọc ngoài phạm vi ⇒ 404.
- `GET /api/reports/monthly?month=&area=&department=` → `MonthlyReport`. `month` sai định dạng ⇒ 400; mặc định tháng hiện tại.
- `GET /api/reports/monthly.xlsx?…` → file `Bang_cong_YYYY-MM.xlsx` (`Content-Disposition: attachment`), dựng từ **cùng** `MonthlyReport` (`server/report-xlsx.ts`, thư viện `exceljs`).
- **Định dạng Excel** (cả hai sheet):
  - Dòng 1: "CÔNG TY TNHH MTV PETROLIMEX HÀ NỘI" (đậm). Dòng 2: "BẢNG TỔNG HỢP CÔNG THÁNG MM/YYYY" hoặc "BẢNG CHẤM CÔNG THÁNG MM/YYYY" (đậm, cỡ 14, màu navy `#003865`). Dòng 3: phạm vi · "Xuất lúc dd/mm/yyyy HH:MM bởi Tên (MÃ)". Dòng 4 (nếu khóa): "Đã khóa sổ ngày dd/mm/yyyy bởi Tên".
  - Dòng tiêu đề bảng: nền cam `#EA580C`, chữ trắng đậm; cố định (freeze) dòng tiêu đề và các cột tới "Họ tên"; khổ A4 ngang, vừa 1 trang ngang.
  - **"Tổng hợp"**: STT, Mã NV, Họ tên, Phòng ban, Ngày phải làm, Ngày công, Đi muộn (lần), Đi muộn (phút), Về sớm (lần), Về sớm (phút), Thiếu giờ ra, Vắng, Nghỉ phép, Công tác, Tỷ lệ chuyên cần (%).
  - **"Chấm công"**: STT, Mã NV, Họ tên, Phòng ban, cột mỗi ngày trong tháng (tiêu đề 2 dòng: số ngày / T2..CN), rồi Ngày công, Muộn, Về sớm, Vắng, Phép, Công tác. Cột thứ 7, chủ nhật, ngày lễ tô xám nhạt. Ô ký hiệu tô màu khớp web: X xanh lá, M/S vàng, MS/V đỏ, T xám, P tím, CT xanh da trời, L xám. Cuối sheet: chú thích ký hiệu và "`*` = đã điều chỉnh".
- **Bảo mật thư viện**: thêm `exceljs@4.4.0` vào `dependencies`, kèm `"overrides": { "uuid": "^11.1.1" }` trong `package.json` để `npm audit` sạch (đã thử: 0 lỗ hổng, ghi file chạy được).

## 10. Trang "Của tôi"

- `GET /api/me/attendance?month=` (mọi vai trò, chỉ dữ liệu của chính mình) →
  ```ts
  { profile: { code, name, departmentName, position, shift: { name, workStart, workEnd, workDays } },
    today: AttendanceDay | null,
    report: MonthlyRow,                 // dòng của chính mình, cùng hàm với báo cáo tháng
    days: { date, weekday, holiday, workday: boolean, record: AttendanceDay | null }[] }
  ```
- ADMIN (không chấm công) thấy thông báo "Tài khoản quản trị hệ thống không chấm công".

## 11. Giao diện

- **Tab mới** (thứ tự): "Của tôi" (mọi vai trò; nhân viên không còn tab "Bảng công"), "Bảng công", "Báo cáo tháng" (HR, quản trị khu, trưởng phòng), "Giải trình / Xin phép", … , "Nhật ký" (HR, quản trị khu, đặt trước "Cấu hình"). Trang mặc định: nhân viên → "Của tôi", còn lại → "Bảng công".
- **"Của tôi"**: thẻ thông tin; thẻ hôm nay; chọn tháng + 5 số (ngày công, muộn lần/phút, về sớm, vắng, nghỉ phép); bảng ngày (ngày + thứ, giờ vào, giờ ra, trạng thái, "Đã điều chỉnh"); ngày lễ / không làm mờ; bấm ngày ⇒ hộp chi tiết lượt quẹt (ảnh, video như bảng công); nút "Nộp đơn" trên ngày M/S/MS/V/T ⇒ form đơn có sẵn, điền trước ngày.
- **"Báo cáo tháng"**: chọn tháng, khu (HR), phòng (HR, quản trị khu); nút "Xuất Excel"; trạng thái khóa sổ, HR có "Khóa sổ tháng" / "Mở khóa" (hộp xác nhận). Hai chế độ: "Tổng hợp" (bảng) và "Lưới chấm công" (ô màu theo `DAY_STATUS_STYLE`, cột họ tên dính khi cuộn ngang); bấm ô ⇒ hộp chi tiết ngày (có nút "Điều chỉnh" nếu có quyền và tháng chưa khóa).
- **Hộp chi tiết ngày** (dùng chung cho bảng công, báo cáo, "Của tôi"): thêm khối điều chỉnh hiện có (kiểu, lý do, người, lúc) và nút "Điều chỉnh" / "Bỏ điều chỉnh" (HR, quản trị khu; ẩn với ngày của chính mình hoặc tháng đã khóa).
- **Hộp "Điều chỉnh ngày công"**: chọn kiểu (Sửa giờ / Nghỉ phép / Công tác); với "Sửa giờ" hai ô giờ (để trống = giữ tự tính, hiện giá trị hiện tại làm gợi ý); ô lý do bắt buộc có đếm ký tự; nút "Lưu" khóa khi lý do < 5 ký tự; lỗi server hiện trong hộp.
- **Nhãn "Đã điều chỉnh"**: viền cam nhạt, `title` = "Điều chỉnh bởi … lúc …: lý do".
- **"Nhật ký"**: lọc từ ngày / đến ngày (mặc định 30 ngày gần nhất), loại hành động, ô tìm; bảng: thời gian, người làm, IP, hành động (nhãn tiếng Việt), đối tượng, cũ → mới (rút gọn, bấm để xem đủ), lý do; nút trang trước / sau.

## 12. Quyền (tóm tắt)

| API | HR | Quản trị khu | Trưởng phòng | Nhân viên |
|---|---|---|---|---|
| `PUT/DELETE …/adjustment` | mọi người (trừ mình) | người trong khu (trừ mình) | 403 | 403 |
| `GET /api/reports/monthly(.xlsx)` | tất cả | khu mình | phòng mình | 403 |
| `POST/DELETE /api/month-locks/:month` | ✓ | 403 | 403 | 403 |
| `GET /api/month-locks` | ✓ | ✓ | ✓ | 403 |
| `GET /api/audit` | tất cả | dòng của khu / của mình | 403 | 403 |
| `GET /api/me/attendance` | ✓ | ✓ | ✓ | ✓ |

Đối tượng ngoài phạm vi ⇒ 404 như các đợt trước.

## 13. Kiểm thử

- **Điều chỉnh**: sửa giờ vào làm `late` → `on_time` và ngược lại; chỉ sửa giờ ra; chuyển `absent` → `leave` / `business_trip`; bỏ điều chỉnh quay về giá trị tự tính; điều chỉnh thắng đơn nghỉ đã duyệt; điều chỉnh còn nguyên sau `recomputeForShiftChange` và `closeDays`; lý do thiếu / quá ngắn, ngày tương lai, trước ngày tạo tài khoản, ngày không làm chưa có dòng, giờ ra trước giờ vào ⇒ 400; tự điều chỉnh ⇒ 403; quản trị khu với người khu khác ⇒ 404; trưởng phòng / nhân viên ⇒ 403.
- **Khóa sổ**: tháng khóa chặn điều chỉnh, duyệt đơn có ngày thuộc tháng, gửi đơn, `recomputeUsers`, `closeDays`, lượt quẹt mới (ngày công không đổi, `detections` vẫn thêm); mở khóa rồi làm lại được; khóa tháng tương lai ⇒ 400; khóa trùng ⇒ 409; không phải HR ⇒ 403.
- **Báo cáo**: ký hiệu đúng cho từng trạng thái (cả `missing_out` chưa chốt hôm nay), `*` cho ô điều chỉnh, L cho ngày lễ; ngày phải làm tính theo ca từng người, trừ lễ, cắt tại hôm nay và ngày tạo tài khoản; tháng tương lai 0; tỷ lệ chuyên cần và trường hợp 0 ngày phải làm; người nghỉ việc có dữ liệu vẫn xuất hiện; phạm vi theo vai trò; file `.xlsx` đọc lại bằng `exceljs` có đúng 2 sheet, tiêu đề, số dòng và số liệu khớp JSON.
- **Nhật ký**: mỗi `action` ở §5 ghi đúng một dòng với `before/after` đúng; thao tác bị lỗi không ghi; quản trị khu chỉ thấy dòng của khu / của mình; phân trang và lọc.
- **Trang "Của tôi"**: chỉ trả dữ liệu của chính mình; đủ ngày trong tháng, ngày lễ / không làm.
- **Migration**: database v4 có dữ liệu ⇒ v5 giữ nguyên mọi bảng cũ, có ba bảng mới, có file `attendance-pre-migrate-v4.db`; database v3 ⇒ v5.
- `npm test`, `TZ=UTC npm test`, `npm run lint`, `npm run build`, `npm audit` đều sạch.

## 14. Tiêu chí hoàn thành

1. HR xuất được Excel tháng 2 sheet, số khớp với web, mở được bằng Excel / LibreOffice.
2. HR / quản trị khu điều chỉnh được ngày công có lý do; nhãn "Đã điều chỉnh" hiện ở mọi nơi; nhật ký có dòng tương ứng.
3. Khóa sổ chặn mọi thay đổi ngày công của tháng đó.
4. Nhân viên mở web thấy ngay trang "Của tôi" với tháng hiện tại.
5. Host nâng cấp v4 → v5 theo `DEPLOY.md` mà không mất dữ liệu.
