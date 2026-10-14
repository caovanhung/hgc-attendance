# Đợt B — Ca làm việc, đi sớm, vắng mặt, nghỉ phép và công tác

- **Ngày:** 2026-10-14
- **Trạng thái:** chờ duyệt
- **Thuộc chuỗi:** A (đã xong) → **B** → C (điều chỉnh điểm danh, nhật ký kiểm toán) → D (bảng công nâng cao, biểu đồ, báo cáo).
- **Tham khảo:** `docs/TAI_LIEU_DU_AN_THAM_KHAO.md` mục 3.1–3.3 (mục 4, 6, 9 của danh sách đã chọn).

## 1. Mục tiêu

1. Mỗi phòng ban (và từng người, nếu cần) dùng một **ca** có giờ vào/ra, ngày làm trong tuần và ngưỡng riêng; phòng chưa chọn ca dùng **ca mặc định của công ty**.
2. Ghi nhận **đi sớm**; tính **về sớm** theo ngưỡng cho phép.
3. Ngày làm việc mà hết giờ ra không có lượt quẹt, không có đơn được duyệt ⇒ **vắng mặt**. Ngày lễ không ai vắng.
4. Đơn **nghỉ phép** và **công tác** theo khoảng ngày; duyệt xong các ngày đó mang trạng thái tương ứng.
5. Nâng cấp database v3 → v4 **giữ nguyên dữ liệu** (lần đầu có migration).

**Không làm trong đợt này:** tăng ca/về muộn, ca qua đêm, nhiều ca trong một ngày, quỹ ngày phép, nghỉ nửa ngày, hủy đơn đã duyệt.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| Q1 | Chỉ có giờ hành chính; mỗi phòng/khu có thể có giờ khác. Không có ca qua đêm; ngày công vẫn theo **ngày lịch** giờ Việt Nam. |
| Q2 | Ca gán theo **phòng ban**, cho phép **ca riêng từng người**; phòng chưa chọn ca dùng ca mặc định công ty. |
| Q3 | Mỗi ca có **ngày làm trong tuần**; HR nhập **ngày lễ** chung; hết giờ ra của ca mà không có lượt quẹt/đơn ⇒ vắng. |
| Q4 | Ngưỡng theo từng ca, mặc định: cho phép muộn **15** phút, ngưỡng đi sớm **15** phút, cho phép về sớm **10** phút. **Bỏ tăng ca.** |
| Q5 | **Mỗi khu có danh sách ca riêng**; quản trị khu sửa ca khu mình, HR toàn hệ thống sửa mọi ca. Ca mặc định công ty chỉ HR toàn hệ thống sửa. Đổi ca/ngưỡng ⇒ **tự tính lại công từ đầu tháng hiện tại**, không hỏi. |
| Q6 | Đơn nghỉ phép và công tác **từ ngày đến ngày** (tối đa 31 ngày, trọn ngày), gửi trước **tối đa 7 ngày**. Duyệt xong các ngày làm việc trong khoảng mang trạng thái "Nghỉ phép"/"Công tác", không tính vắng/muộn/về sớm; lượt quẹt vẫn giữ để xem. |
| Q8 | **Về sớm chỉ xét sau giờ ra của ca.** Trong giờ làm, giờ ra chỉ là "lần quẹt gần nhất" tại thời điểm đó, không gắn về sớm; hết giờ ra mới chốt về sớm (ra trước giờ ra quá ngưỡng 10 phút). |
| Q7 | Nâng cấp v3 → v4 bằng **migration**, tự sao lưu trước, giữ dữ liệu. Từ nay mọi thay đổi cấu trúc đều có migration. |

## 3. Dữ liệu (schema v4)

**Bảng mới**

- `shifts(id TEXT PK, area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE RESTRICT, name TEXT NOT NULL, work_start TEXT NOT NULL, work_end TEXT NOT NULL, work_days TEXT NOT NULL, late_grace_minutes INTEGER NOT NULL, early_arrival_minutes INTEGER NOT NULL, early_leave_minutes INTEGER NOT NULL, created_at TEXT NOT NULL)`; `UNIQUE(area_id, name)`.
  - `work_days`: chuỗi các số ISO thứ trong tuần, 1 = thứ 2 … 7 = chủ nhật, ví dụ `'1,2,3,4,5'`.
- `holidays(date TEXT PRIMARY KEY, name TEXT NOT NULL)` — `date` dạng `YYYY-MM-DD`.

**Cột mới**

- `departments.shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT`
- `users.shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT` (NULL = theo phòng ban)
- `requests.end_date TEXT` (NULL = một ngày, bằng `work_date`)
- `attendance_days.early_arrival_minutes INTEGER NOT NULL DEFAULT 0`
- `attendance_days.final INTEGER NOT NULL DEFAULT 0` — 1 khi ngày đã được chốt (tính lúc đã qua giờ ra của ca, hoặc ngày đã qua); 0 khi còn trong giờ làm

**Ràng buộc đổi** (SQLite phải dựng lại bảng):

- `attendance_days.first_in` cho phép NULL (ngày vắng/nghỉ không có giờ vào).
- `attendance_days.status` thêm `'absent'`, `'leave'`, `'business_trip'`.
- `requests.type` thêm `'business_trip'`.

**Ca mặc định công ty** giữ trong `settings` như hiện nay (`work_start`, `work_end`, `late_grace_minutes`, `min_out_gap_minutes`) và thêm `work_days` (mặc định `'1,2,3,4,5'`), `early_arrival_minutes` (15), `early_leave_minutes` (10).

## 4. Migration (lần đầu)

- `server/migrations.ts`: danh sách bước `{ from: 3, to: 4, run(db) }`. `SCHEMA_VERSION = 4`.
- `openDb`:
  - DB mới (chưa có `schema_version`): chạy SCHEMA v4, ghi version 4 (như hiện nay).
  - `version === SCHEMA_VERSION`: mở bình thường.
  - `version < SCHEMA_VERSION` và có đủ các bước từ version đó: **sao lưu file trước** (`backups/attendance-<thời điểm>-pre-migrate-v<n>.db`, dùng `VACUUM INTO`), chạy lần lượt từng bước trong một giao dịch, cập nhật `schema_version`, in `[MIGRATE] v3 → v4 xong (sao lưu: <tên file>)`.
  - `version < 3`: giữ thông báo cũ `[STARTUP] Database phiên bản cũ (v<n>)…` và thoát mã 1.
  - `version > SCHEMA_VERSION`: in `[STARTUP] Database được tạo bởi phiên bản mới hơn (v<n>). Hãy cập nhật code.` và thoát mã 1.
  - Migration lỗi: giao dịch hoàn tác, in lỗi kèm tên file sao lưu, thoát mã 1; DB giữ nguyên v3.
- Bước 3 → 4: tạo `shifts`, `holidays`; `ALTER TABLE` thêm cột `departments.shift_id`, `users.shift_id`, `requests.end_date`; dựng lại `attendance_days` và `requests` với ràng buộc mới (tắt `foreign_keys` trong lúc dựng, chạy `PRAGMA foreign_key_check` trước khi bật lại); thêm khóa `settings` mới với giá trị mặc định.
- Test: tạo một DB v3 từ ảnh chụp schema v3 cố định trong `tests/fixtures/schema-v3.sql` kèm dữ liệu mẫu (khu, phòng, nhân sự, lượt quẹt, ngày công, đơn, thư), mở bằng `openDb` ⇒ version 4, toàn bộ dữ liệu cũ còn nguyên, cột/bảng mới có, file sao lưu được tạo; mở lần hai không chạy lại.

## 5. Ca áp dụng cho một người

`effectiveShift(user)`:
1. `users.shift_id` nếu có **và** ca đó thuộc khu hiện tại của người đó;
2. ngược lại `departments.shift_id` của phòng người đó nếu có **và** thuộc khu của phòng;
3. ngược lại ca mặc định công ty.

(Chuyển phòng/khu mà ca cũ không còn thuộc khu mới thì tự rơi về bước sau, không lỗi.)

Ca dùng **giá trị hiện tại** khi tính; lịch sử chỉ thay đổi khi được tính lại (mục 7).

## 6. Tính ngày công

Một ngày công của (người, ngày `D`) được tính lại bởi `recomputeDay` theo thứ tự:

1. Người không hoạt động, hoặc `D` trước ngày tạo tài khoản ⇒ chỉ lưu nếu có lượt quẹt (như hiện nay), không bao giờ "vắng".
2. **Đơn nghỉ phép/công tác đã duyệt** phủ `D`, và `D` là ngày làm việc (theo ca, không phải ngày lễ) ⇒ trạng thái `leave` / `business_trip`; nếu có lượt quẹt vẫn lưu giờ vào/ra; muộn/về sớm/đi sớm = 0.
3. Có lượt quẹt (hoặc giờ chỉnh tay) ⇒ tính như hiện nay theo ca:
   - **Muộn:** vào sau `work_start + late_grace` ⇒ `late_minutes = vào − work_start` (giữ cách đếm từ giờ vào ca).
   - **Đi sớm:** vào trước `work_start − early_arrival_minutes` ⇒ `early_arrival_minutes = work_start − vào`; không đổi trạng thái (vẫn `on_time` nếu không muộn/về sớm), giao diện hiện nhãn "Đi sớm".
   - **Về sớm:** chỉ xét khi **đã qua `work_end` của ngày `D`** (ngày đã chốt, `final = 1`): ra trước `work_end − early_leave_minutes` ⇒ `early_minutes = work_end − ra` (**đổi so với hiện nay**: trước đây mọi lượt ra trước `work_end` đều là về sớm, kể cả khi người đó vẫn đang làm).
   - **Trong giờ làm** (chưa qua `work_end`, `final = 0`): `last_out` là lần quẹt gần nhất (giữ ngưỡng `min_out_gap_minutes` như hiện nay); `early_minutes = 0`; trạng thái chỉ có thể là `missing_out`, `late` hoặc `on_time`. Giao diện ghi "Lần quẹt gần nhất HH:mm" thay cho "Giờ ra".
   - Trạng thái: `missing_out` / `late_and_early` / `late` / `early_leave` / `on_time` như hiện nay.
4. Không có lượt quẹt, `D` là ngày làm việc của ca, không phải ngày lễ, và **thời điểm hiện tại đã qua `work_end` của ngày `D`** ⇒ `absent` (`first_in` NULL).
5. Còn lại ⇒ không có dòng ngày công.

**Ngày làm việc:** thứ của `D` thuộc `work_days` của ca **và** `D` không có trong `holidays`.

**Đóng ngày (job):** mỗi 15 phút (và lúc khởi động), với ngày hôm nay và hôm qua (giờ Việt Nam), gọi `recomputeDay` cho mọi nhân sự đang hoạt động (trừ `ADMIN`) **chưa có dòng ngày công hoặc có dòng `final = 0`** mà đã qua giờ ra của ca — để ghi `absent` và chốt về sớm. Lượt quẹt đến sau đó vẫn làm tính lại (đường webhook gọi `recomputeDay`).

## 7. Tính lại khi cấu hình đổi

Tự động, đồng bộ trong request (giới hạn 500 người × 31 ngày; vượt thì chạy nền qua job, trả "đang tính lại"):

| Thay đổi | Tính lại |
|---|---|
| Sửa giờ/ngày làm/ngưỡng của một ca | mọi người đang dùng ca đó (qua phòng hoặc riêng), từ ngày 1 tháng hiện tại tới hôm nay |
| Sửa ca mặc định công ty | mọi người đang dùng ca mặc định, từ ngày 1 tháng hiện tại tới hôm nay |
| Gán/đổi ca của phòng ban hoặc của một người | người bị ảnh hưởng, từ ngày 1 tháng hiện tại tới hôm nay |
| Thêm/xóa ngày lễ ≤ hôm nay | mọi người, đúng ngày đó |
| Duyệt đơn nghỉ phép/công tác | người đó, các ngày trong khoảng (kể cả ngày tương lai — ghi trước trạng thái nghỉ) |

Tháng trước không đổi trừ khi HR dùng nút "Tính lại" sẵn có (giới hạn 92 ngày).

## 8. Đơn từ

- Loại mới `business_trip` ("Công tác").
- `leave_request` và `business_trip` nhận `workDate` (từ ngày) và `endDate` (đến ngày, tùy chọn, ≥ `workDate`, tối đa 31 ngày). Được gửi cho **ngày tương lai** tới **7 ngày** kể từ hôm nay (ngày bắt đầu ≤ hôm nay + 7; các loại đơn khác vẫn không cho tương lai).
- Hai đơn nghỉ/công tác **đã duyệt** của cùng một người không được chồng ngày: duyệt đơn thứ hai chồng ngày ⇒ 409 "Khoảng ngày trùng với đơn đã duyệt".
- Duyệt ⇒ tính lại các ngày trong khoảng (mục 7). Từ chối ⇒ không đổi gì.
- Người duyệt như hiện nay (trưởng phòng; quản trị khu với nhân viên/trưởng phòng trong khu; HR).

## 9. Quyền

| Thao tác | Ai |
|---|---|
| Xem ca của khu | HR toàn hệ thống (mọi khu), quản trị khu (khu mình) |
| Thêm/sửa/xóa ca của khu | HR toàn hệ thống; quản trị khu (khu mình). Xóa ca đang được dùng ⇒ 409 "Ca đang được phòng ban hoặc nhân sự sử dụng" |
| Sửa ca mặc định công ty | HR toàn hệ thống (API `PUT /settings/work` hiện có, thêm trường mới) |
| Ngày lễ: thêm/xóa | HR toàn hệ thống; mọi người đăng nhập được xem |
| Gán ca cho phòng ban / nhân sự | người sửa được phòng ban / nhân sự đó (đợt A); ca phải thuộc **cùng khu** với phòng/người ⇒ không thì 400 "Ca không thuộc khu của phòng ban/nhân sự này" |

Đối tượng ngoài phạm vi ⇒ 404 như đợt A.

## 10. API

- `GET /api/shifts?area=` → `{ shifts: Shift[] }` (theo phạm vi); `POST /api/shifts`, `PUT /api/shifts/:id`, `DELETE /api/shifts/:id`.
- `Shift { id, areaId, areaName, name, workStart, workEnd, workDays: number[], lateGraceMinutes, earlyArrivalMinutes, earlyLeaveMinutes, departmentCount, userCount }`.
- `GET/PUT /api/settings/work`: `WorkSettings` thêm `workDays: number[]`, `earlyArrivalMinutes`, `earlyLeaveMinutes`.
- `GET /api/holidays?year=` → `{ holidays: { date, name }[] }`; `POST /api/holidays { date, name }`; `DELETE /api/holidays/:date`.
- `PUT /api/departments/:id { shiftId }`, `POST/PUT /api/users { shiftId }`.
- `POST /api/requests { type, workDate, endDate?, … }`.
- `AttendanceDay` thêm `earlyArrivalMinutes`, `final: boolean`, `firstIn: number | null`; `DayStatus` thêm `absent`, `leave`, `business_trip`.
- `StatsData` thêm `absentCount`, `leaveCount`, `businessTripCount`; `notCheckedInCount` = nhân sự có ngày làm việc hôm nay, chưa có dòng ngày công (chưa tới giờ ra), không tính người nghỉ/công tác/vắng. `StatsDetailType` thêm `absent`, `leave`, `business_trip`, `early_arrival`.

Kiểm tra dữ liệu ca: giờ dạng `HH:mm`, `work_end > work_start`, `work_days` không rỗng và mỗi số 1–7, ngưỡng là số nguyên 0–120, tên không trống và không trùng trong khu.

## 11. Giao diện

- **Tab "Ca làm việc"** (HR toàn hệ thống, quản trị khu): theo khu đang chọn — danh sách ca (tên, giờ, ngày làm, ngưỡng, số phòng/người dùng), thêm/sửa/xóa; HR thấy thêm thẻ **Ca mặc định công ty** (chuyển từ thẻ "Giờ làm việc" trong Cấu hình) và mục **Ngày lễ** (theo năm, thêm/xóa).
- **Phòng ban:** ô "Ca làm việc" (ca của khu phòng đó, hoặc "Ca mặc định công ty").
- **Nhân sự:** ô "Ca riêng" ("Theo phòng ban" hoặc một ca của khu người đó); thẻ nhân sự hiện ca đang áp dụng.
- **Bảng công:** trạng thái mới Vắng / Nghỉ phép / Công tác; nhãn "Đi sớm N phút"; ngày chưa chốt hiện "Lần quẹt gần nhất HH:mm" thay cho giờ ra; ngày vắng/nghỉ không có giờ vào hiện "—".
- **Thẻ thống kê:** thêm Vắng, Nghỉ phép / Công tác; bấm vào xem danh sách như các thẻ khác.
- **Đơn từ:** loại "Công tác"; đơn nghỉ phép/công tác có "Từ ngày – Đến ngày".
- Thẻ "Giờ làm việc" trong tab Cấu hình chuyển sang tab Ca làm việc.

## 12. Kiểm thử

- Migration v3 → v4 (mục 4); mở DB v2 vẫn báo cũ; DB v5 báo phiên bản mới hơn; migration lỗi giữ nguyên v3.
- `effectiveShift`: riêng > phòng > mặc định; ca khác khu bị bỏ qua.
- `computeDay` theo ca: muộn, đi sớm, về sớm với ngưỡng 10 phút (ra 16:55 không về sớm; 16:45 về sớm 15 phút) **chỉ khi đã qua giờ ra**; lúc 15:00 cùng lượt quẹt 14:30 ⇒ `final = 0`, không về sớm; job đóng ngày sau 17:00 ⇒ `final = 1`, về sớm; các ca giờ khác nhau.
- Vắng: chưa tới giờ ra ⇒ không có dòng; qua giờ ra ⇒ `absent`; ngày không làm (thứ 7 của ca T2–T6), ngày lễ, người tạo sau ngày đó, người nghỉ việc ⇒ không vắng; quẹt muộn sau khi đã vắng ⇒ thay bằng trạng thái thật.
- Đơn: khoảng ngày, tối đa 31 ngày, tương lai ≤ 7 ngày, chồng ngày ⇒ 409, duyệt ⇒ các ngày làm việc trong khoảng thành `leave`/`business_trip` (bỏ qua cuối tuần/ngày lễ), có lượt quẹt vẫn giữ giờ.
- Tính lại khi đổi ca/ngưỡng/gán ca/ngày lễ đúng phạm vi ngày và người (không đụng tháng trước).
- Quyền: ma trận đợt A mở rộng với `/shifts`, `/holidays`; quản trị khu không sửa ca khu khác, không gán ca khác khu.
- Thống kê: `absentCount`, `leaveCount`, `notCheckedInCount` đúng trong các tình huống trên.
- `TZ=UTC npm test` vẫn qua.

## 13. Triển khai

- `DEPLOY.md`: mục "Nâng cấp lên v4": `pm2 stop` → `git pull && npm ci --omit=dev` → `pm2 restart` → log có `[MIGRATE] v3 → v4 xong (sao lưu: …)`. **Không xóa database.**
- Sau nâng cấp: HR kiểm tra ca mặc định (ngày làm trong tuần), nhập ngày lễ năm hiện tại, tạo ca cho khu cần giờ riêng, gán cho phòng ban.

## 14. Tiêu chí hoàn thành

- Mục 12 có test và qua; `npm test`, `TZ=UTC npm test`, `npm run lint`, `npm run build` sạch.
- Trên host: nâng cấp giữ nguyên khu, phòng, nhân sự; một nhân viên không quẹt cả ngày hiện "Vắng" sau giờ ra; đơn nghỉ phép 2 ngày được duyệt hiện "Nghỉ phép" hai ngày đó.
