# Đợt C — Điều chỉnh điểm danh và nhật ký kiểm toán: Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quản lý (HR, Quản trị khu vực) được điều chỉnh ngày công thủ công kèm lý do bắt buộc, bảo toàn dữ liệu camera gốc; hệ thống tự động ghi nhận nhật ký kiểm toán (Audit Logs) cho mọi hành động quản trị; nâng cấp an toàn database v4 → v5 có migration.

**Architecture:**
- **Schema v5 & Migration:** Nâng cấp từ v4 lên v5 trong `server/migrations.ts` (sao lưu `VACUUM INTO` trước khi chạy). Bảng mới: `audit_logs` (lưu vết hành vi), `attendance_adjustments` (lưu lịch sử điều chỉnh công). Bảng `attendance_days` thêm các cột `manual_status`, `adjusted_by`, `adjusted_at`, `adjustment_reason`.
- **Audit Logging Engine (`server/audit.ts`):** Module ghi log tập trung `logAudit(db, entry)`. Các API nhạy cảm (nhân sự, ca, đơn, cấu hình, điều chỉnh) tự động ghi vết.
- **Attendance Adjustment Engine (`server/attendance-adjust.ts`):** Nhận giờ sửa `manual_in`, `manual_out` hoặc ép `manual_status`, tự động áp dụng ca hiệu lực để tính lại `late_minutes`, `early_minutes`, cập nhật `attendance_days`, ghi lịch sử và sinh audit log trong một database transaction.
- **UI:** Modal điều chỉnh ngày công bật từ Bảng công; Tab "Nhật ký" trên thanh điều hướng Navbar dành cho HR và Quản trị khu vực.

**Tech Stack:** Node ≥ 22.13 (`node:sqlite`), Express 4, React 19 + Vite + Tailwind 4, TypeScript, `node:test` qua `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-14-dieu-chinh-diem-danh-nhat-ky-kiem-toan-design.md`

---

## Global Constraints

- **Có migration, không xóa dữ liệu.** `SCHEMA_VERSION = 5`. DB v4 tự nâng cấp khi mở; DB < v3 giữ nguyên cảnh báo lỗi; DB > v5 báo lỗi phiên bản mới hơn.
- **Dữ liệu Camera AI bất biến:** Lượt quẹt trong bảng `detections` không bao giờ bị xóa hoặc sửa đè bởi hành động điều chỉnh.
- **Bắt buộc có lý do điều chỉnh:** `reason` tối thiểu 5 ký tự; không cho phép chuỗi rỗng hoặc toàn dấu cách.
- **Phân quyền chặt chẽ theo khu vực:**
  - `hr` / `ADMIN`: Điều chỉnh mọi nhân sự, xem toàn bộ audit log hệ thống.
  - `area_admin`: Chỉ điều chỉnh nhân sự thuộc các khu vực trong `admin_areas`; chỉ xem audit log thuộc khu vực của mình hoặc do mình thực hiện; cố tình truy cập khu khác trả về **404**.
  - `dept_manager` / `employee`: Không có quyền điều chỉnh trực tiếp; không thấy tab Nhật ký kiểm toán.
- **Giờ Việt Nam nhất quán:** Tất cả ngày giờ ghi nhận theo chuẩn UTC+7 (`toVnDate`, `vnDateTimeToTs`).
- **Mã nguồn sạch:** Nháy đơn, chú thích tiếng Việt, `npm test`, `npm run lint` và `npm run build` đạt 100% trước mỗi commit.

---

## Cấu trúc file dự kiến

| File | Trách nhiệm |
|---|---|
| `server/schema.ts` (sửa) | Nâng `SCHEMA_VERSION = 5`, bổ sung DDL bảng `audit_logs`, `attendance_adjustments` và cập nhật `ddlAttendanceDays` |
| `server/migrations.ts` (sửa) | Bước migration v4 → v5 (tạo bảng, alter table) |
| `shared/types.ts` (sửa) | Thêm interface `AuditLogItem`, `AttendanceAdjustment`, `AdjustAttendancePayload` |
| `server/audit.ts` (mới) | Hàm `logAudit`, truy vấn danh sách audit logs theo phạm vi quyền |
| `server/attendance-adjust.ts` (mới) | Logic nghiệp vụ điều chỉnh công, tính toán lại giờ và trạng thái |
| `server/routes/attendance.ts` (sửa) | Thêm route `POST /api/attendance/adjust` và `GET /api/attendance/adjustments` |
| `server/routes/audit-logs.ts` (mới) | Route `GET /api/audit-logs` phục vụ tra cứu nhật ký kiểm toán |
| `server/routes/{users,shifts,departments,areas,requests,settings}.ts` (sửa) | Tích hợp gọi `logAudit` khi tạo/sửa/xóa |
| `src/components/AdjustAttendanceModal.tsx` (mới) | Modal điều chỉnh ngày công trên giao diện |
| `src/components/AuditLogsTab.tsx` (mới) | Tab xem nhật ký kiểm toán, lọc theo ngày/hành động/khu vực |
| `src/components/Navbar.tsx` & `src/App.tsx` (sửa) | Thêm tab "Nhật ký" (icon `FileClock` hoặc `ShieldCheck`), gắn modal điều chỉnh vào bảng công |

---

## Chi tiết các Task triển khai

### Task 1: Schema v5 và migration v4 → v5

- [ ] Cập nhật `server/schema.ts`:
  - Đổi `SCHEMA_VERSION = 5`.
  - Định nghĩa hàm `ddlAuditLogs(ifNotExists: boolean)`.
  - Định nghĩa hàm `ddlAttendanceAdjustments(ifNotExists: boolean)`.
  - Bổ sung các cột mới vào `ddlAttendanceDays`: `manual_status`, `adjusted_by`, `adjusted_at`, `adjustment_reason`.
  - Thêm DDL vào chuỗi `SCHEMA`.
- [ ] Cập nhật `server/migrations.ts`:
  - Thêm bước migration `{ from: 4, to: 5, run(db) }`.
  - Thực hiện chạy DDL bảng mới và các lệnh `ALTER TABLE attendance_days ADD COLUMN ...`.
- [ ] Cập nhật `shared/types.ts`:
  - Thêm các interface `AttendanceAdjustment`, `AuditLogItem`, `AdjustAttendancePayload`.
  - Mở rộng `AttendanceDay` với các trường điều chỉnh.
- [ ] Viết test: `tests/migration-v5.test.ts` kiểm tra nâng cấp an toàn từ snapshot v4 sang v5 và giữ nguyên dữ liệu.

### Task 2: Engine Nhật ký kiểm toán (`server/audit.ts`) và tích hợp tự động

- [ ] Tạo module `server/audit.ts`:
  - Hàm `logAudit(db, entry)` sinh ID, timestamp, chuẩn hóa JSON payload, bắt lỗi an toàn.
  - Hàm `queryAuditLogs(db, scope, filters)` hỗ trợ lọc theo ngày, actor, action, area và phân trang `limit/offset`.
- [ ] Tích hợp ghi log kiểm toán vào các route quản trị:
  - `server/routes/users.ts`: Ghi log khi tạo nhân viên, sửa thông tin, đặt lại mật khẩu, xóa/vô hiệu hóa.
  - `server/routes/shifts.ts`: Ghi log khi tạo, sửa, xóa ca, gán ca cho phòng/nhân viên, thêm/xóa ngày lễ.
  - `server/routes/requests.ts`: Ghi log khi duyệt hoặc từ chối đơn giải trình/xin phép.
  - `server/routes/areas.ts` & `departments.ts`: Ghi log khi tạo, sửa, xóa khu vực và phòng ban.
  - `server/routes/settings.ts`: Ghi log khi thay đổi cấu hình kỹ thuật hoặc cấu hình chung.
- [ ] Viết test: `tests/audit.test.ts` xác nhận các thao tác trên đều sinh audit log đầy đủ với thông tin người thực hiện chính xác.

### Task 3: API Điều chỉnh điểm danh (`POST /api/attendance/adjust`)

- [ ] Tạo module nghiệp vụ `server/attendance-adjust.ts`:
  - Xác thực dữ liệu đầu vào: `userId`, `workDate`, `reason` (ít nhất 5 ký tự), format giờ `HH:mm`.
  - Kiểm tra quyền: Nhân sự mục tiêu có thuộc khu vực người gọi quản lý hay không.
  - Đọc dữ liệu công hiện tại của ngày đó (nếu chưa có dòng do vắng/nghỉ, tạo dòng cơ sở).
  - Kết hợp giờ thủ công (`manualIn`, `manualOut`) với giờ nhận diện camera gốc để tính lại `late_minutes`, `early_minutes`, `early_arrival_minutes` theo ca làm việc hiệu lực.
  - Nếu có `manualStatus`, ghi đè trạng thái ngày công tương ứng.
  - Lưu bản ghi lịch sử vào `attendance_adjustments`.
  - Cập nhật dòng `attendance_days`.
  - Tự động gọi `logAudit` với action `attendance.adjust`.
- [ ] Thêm routes trong `server/routes/attendance.ts`:
  - `POST /api/attendance/adjust`: Thực thi điều chỉnh công.
  - `GET /api/attendance/adjustments`: Lấy danh sách lịch sử điều chỉnh của 1 ngày công (`?userId=...&workDate=...`).
- [ ] Viết test: `tests/attendance-adjust.test.ts`:
  - Test trường hợp camera mất điện bổ sung giờ -> tính thành `on_time`.
  - Test miễn trừ đi muộn `lateExcused`.
  - Test kiểm tra quyền: Quản trị khu vực A không sửa được nhân sự khu B (báo 404).
  - Test không cho phép nhập lý do rỗng (báo 400).
  - Test dữ liệu gốc trong bảng `detections` được giữ nguyên vẹn.

### Task 4: API Tra cứu Nhật ký kiểm toán (`GET /api/audit-logs`)

- [ ] Tạo route `server/routes/audit-logs.ts`:
  - Cổng phân quyền: `requireManager` (`hr` hoặc `area_admin`).
  - Áp dụng bộ lọc khu vực theo phạm vi quyền: Quản trị khu vực chỉ xem các log có `area_id` thuộc các khu vực mình quản lý (hoặc thao tác do chính mình thực hiện).
  - Nhận query params: `from`, `to`, `action`, `actorId`, `area`, `limit`, `offset`.
  - Trả về danh sách log và tổng số bản ghi (`total`) phục vụ phân trang.
- [ ] Đăng ký route trong `server/app.ts` hoặc `server/index.ts`.
- [ ] Viết test: `tests/audit-routes.test.ts` kiểm tra phân quyền và bộ lọc phân trang.

### Task 5: Component Modal Điều chỉnh điểm danh (`AdjustAttendanceModal.tsx`)

- [ ] Tạo `src/components/AdjustAttendanceModal.tsx`:
  - Hiển thị thông tin tổng quan nhân sự, ca làm việc ngày đó.
  - Đối chiếu dữ liệu nhận diện thực tế của Camera AI (Giờ vào, Giờ ra, Số lần quẹt - dạng chỉ đọc).
  - Các trường nhập liệu:
    + Giờ vào thủ công (input time `HH:mm`, có nút "Lấy từ camera" và "Xóa").
    + Giờ ra thủ công (input time `HH:mm`, có nút "Lấy từ camera" và "Xóa").
    + Chọn trạng thái công: "Tự động tính theo ca" hoặc chọn trạng thái mong muốn (`Đúng giờ`, `Đi muộn`, `Nghỉ phép`, `Công tác`...).
    + Checkbox "Miễn trừ đi muộn".
    + Textarea "Lý do điều chỉnh" (bắt buộc, có nút chọn lý do nhanh mẫu).
  - Phần "Lịch sử điều chỉnh": Danh sách các lần sửa trước đó (Ai sửa, lúc mấy giờ, lý do gì, từ giờ nào sang giờ nào).
- [ ] Tích hợp vào Bảng công (`src/components/AttendanceTab.tsx` hoặc `src/App.tsx`):
  - Hiển thị nút "Điều chỉnh" trên từng dòng bảng công khi người dùng là `hr` hoặc `area_admin`.
  - Hiển thị icon đánh dấu trên bảng công nếu ngày công đó đã từng có điều chỉnh thủ công (kèm tooltip xem nhanh lý do).

### Task 6: Tab Nhật ký kiểm toán (`AuditLogsTab.tsx`) và cập nhật Navbar

- [ ] Tạo component `src/components/AuditLogsTab.tsx`:
  - Thanh công cụ bộ lọc: Lọc từ ngày - đến ngày, lọc loại hành động, lọc khu vực (nếu là HR toàn hệ thống).
  - Bảng dữ liệu: Thời gian, Người thực hiện, Hành vi, Đối tượng, Tóm tắt.
  - Modal/Drawer xem chi tiết: Hiển thị dữ liệu JSON chi tiết thay đổi trước và sau rõ ràng.
  - Phân trang tiến/lùi trực quan.
- [ ] Cập nhật `src/components/Navbar.tsx`:
  - Bổ sung tab `audit_logs` ("Nhật ký kiểm toán", icon `FileClock` hoặc `ShieldCheck`).
  - Phân quyền hiển thị: Chỉ hiển thị cho `hr` và `area_admin`.
- [ ] Cập nhật `src/App.tsx`:
  - Khai báo tab trong `TABS_BY_ROLE`.
  - Render `AuditLogsTab` khi tab active.

### Task 7: Kiểm thử tổng thể & Tối ưu hóa

- [ ] Chạy bộ kiểm thử tự động:
  - `npm test`: Tất cả test cũ và mới đều pass.
  - `TZ=UTC npm test`: Đảm bảo không lệch múi giờ.
  - `npm run lint`: Không có lỗi cú pháp hoặc TypeScript.
  - `npm run build`: Build production Vite và server thành công.
- [ ] Kiểm tra thực tế trên giao diện:
  - Thao tác điều chỉnh công của 1 nhân viên: kiểm tra bảng công cập nhật đúng, ngày công tính lại đúng.
  - Mở tab Nhật ký kiểm toán: kiểm tra bản ghi điều chỉnh xuất hiện ngay lập tức với đầy đủ chi tiết.

### Task 8: Cập nhật tài liệu triển khai (`DEPLOY.md`)

- [ ] Cập nhật mục nâng cấp lên v5 trong `DEPLOY.md`:
  - Hướng dẫn `git pull` và restart dịch vụ.
  - Mô tả cơ chế migration tự động v4 → v5 kèm sao lưu an toàn.
