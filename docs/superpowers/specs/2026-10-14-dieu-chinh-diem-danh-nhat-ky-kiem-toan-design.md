# Đợt C — Điều chỉnh điểm danh và nhật ký kiểm toán

- **Ngày:** 2026-10-14
- **Trạng thái:** chờ duyệt
- **Thuộc chuỗi:** A (khu vực, tài khoản — *đã xong*) → B (ca làm việc, đi sớm, vắng/nghỉ/công tác — *đã xong*) → **C (điều chỉnh điểm danh, nhật ký kiểm toán)** → D (bảng công nâng cao, biểu đồ 7 ngày, báo cáo chuyên cần). Mỗi đợt có spec, kế hoạch và code riêng.
- **Tham khảo:** `docs/superpowers/specs/2026-10-14-ca-lam-viec-ngay-cong-design.md`, các trường dự phòng `manual_in`, `manual_out`, `late_excused` trong schema v4.

---

## 1. Mục tiêu

1. **Điều chỉnh điểm danh thủ công minh bạch và có kiểm soát:**
   - Cấp quản lý (HR toàn hệ thống, Quản trị khu vực theo phạm vi) được phép bổ sung hoặc sửa giờ vào (`manual_in`), giờ ra (`manual_out`), hoặc duyệt miễn trừ đi muộn (`late_excused`), đổi trạng thái ngày công (khi camera lỗi mạng, nhân viên quên quẹt, công tác đột xuất, lỗi nhận diện).
   - Bắt buộc nhập **lý do điều chỉnh** (tối thiểu 5 ký tự).
   - Tự động tính toán lại số phút đi muộn, về sớm theo ca hiệu lực của nhân sự tại ngày đó.
   - **Bảo toàn tuyệt đối dữ liệu gốc:** Toàn bộ lượt nhận diện Camera AI trong bảng `detections` là bất biến (immutable), không bị sửa hay xóa; mọi lần điều chỉnh được ghi nhận chi tiết vào bảng lịch sử điều chỉnh `attendance_adjustments`.
2. **Nhật ký kiểm toán toàn diện (Audit Logs):**
   - Bảng `audit_logs` lưu vết tự động mọi hành vi quản trị, nghiệp vụ trọng yếu: điều chỉnh công, quản trị nhân sự, gán ca làm việc, duyệt/từ chối đơn, thay đổi cấu hình kỹ thuật, khu vực, phòng ban.
   - Ghi nhận đầy đủ: ai làm (`actor`), hành động gì (`action`), đối tượng nào (`target_type`, `target_id`), khu vực (`area_id`), dữ liệu trước và sau (`details`), thời điểm (`created_at`).
   - Cung cấp API và giao diện tra cứu, phân trang, lọc theo ngày, người thực hiện, loại hành động và khu vực.
3. **Nâng cấp an toàn database v4 → v5 (Migration):**
   - `SCHEMA_VERSION = 5`.
   - Migration tự động qua `server/migrations.ts`, sao lưu trước bằng `VACUUM INTO`, giữ nguyên toàn bộ dữ liệu v4 hiện có.

**Không thuộc đợt này:** Hủy đơn đã duyệt ở Đợt B, công thức tính lương nâng cao, xuất báo cáo tổng hợp chuyên cần (thuộc Đợt D).

---

## 2. Quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| Q1 | **Quyền điều chỉnh công:** HR toàn hệ thống được điều chỉnh công cho mọi nhân sự; Quản trị khu vực chỉ được điều chỉnh cho nhân sự thuộc các khu vực mình quản lý; Trưởng phòng và Nhân viên **không có quyền điều chỉnh trực tiếp** (chỉ làm đơn giải trình). |
| Q2 | **Nguyên tắc dữ liệu thô:** Lượt quẹt từ Camera AI (`detections`) không bao giờ bị xóa hoặc sửa đè. Điều chỉnh công chỉ ghi nhận vào `attendance_days.manual_in`, `manual_out`, `manual_status`, `late_excused` và lưu toàn bộ phiên bản sửa vào `attendance_adjustments`. |
| Q3 | **Tính toán lại khi sửa giờ:** Khi quản lý nhập `manual_in` hoặc `manual_out`, hệ thống ưu tiên giờ thủ công so với `first_in`/`last_out` từ camera, tự động đối chiếu ca hiệu lực để tính lại `late_minutes`, `early_minutes`, `early_arrival_minutes` và gán trạng thái (`on_time`, `late`, `early_leave`, `missing_out`...). Quản lý cũng có thể chọn ghi đè trạng thái trực tiếp (ví dụ: công nhận đủ công `on_time` hoặc `late_excused`). |
| Q4 | **Bắt buộc nhập lý do:** Mọi thao tác điều chỉnh điểm danh đều bắt buộc có `reason` (chuỗi văn bản không rỗng, tối thiểu 5 ký tự). |
| Q5 | **Ghi log tự động:** Bất kỳ thao tác tạo/sửa/xóa nhạy cảm (nhân sự, ca, đơn từ, cấu hình, điều chỉnh công) đều tự động sinh bản ghi trong `audit_logs`. Lỗi khi ghi log kiểm toán không được làm rollback transaction nghiệp vụ chính, nhưng phải được log cảnh báo ra stdout. |
| Q6 | **Quyền xem nhật ký kiểm toán:** `ADMIN` và `hr` xem toàn bộ nhật ký kiểm toán hệ thống. `area_admin` chỉ xem nhật ký kiểm toán liên quan đến các khu vực mình quản lý (hoặc các thao tác do chính mình thực hiện). `employee` và `dept_manager` không thấy tab Nhật ký kiểm toán. |
| Q7 | **Migration v4 → v5:** Tạo bảng `audit_logs` và `attendance_adjustments`, bổ sung các cột `manual_status`, `adjusted_by`, `adjusted_at`, `adjustment_reason` vào `attendance_days`. Tự động sao lưu database trước khi chạy migration. |

---

## 3. Dữ liệu (Schema v5)

### Bảng mới

1. **`audit_logs`**
   ```sql
   CREATE TABLE IF NOT EXISTS audit_logs (
     id TEXT PRIMARY KEY,
     actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     actor_code TEXT NOT NULL,
     actor_name TEXT NOT NULL,
     actor_role TEXT NOT NULL,
     action TEXT NOT NULL,
     target_type TEXT NOT NULL,
     target_id TEXT NOT NULL,
     area_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
     summary TEXT NOT NULL,
     details TEXT NOT NULL DEFAULT '{}',
     created_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
   CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
   CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
   CREATE INDEX IF NOT EXISTS idx_audit_logs_area ON audit_logs(area_id);
   ```

2. **`attendance_adjustments`** (Lưu lịch sử chi tiết từng lần điều chỉnh ngày công)
   ```sql
   CREATE TABLE IF NOT EXISTS attendance_adjustments (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     work_date TEXT NOT NULL,
     adjusted_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     old_first_in INTEGER,
     old_last_out INTEGER,
     old_status TEXT NOT NULL,
     new_first_in INTEGER,
     new_last_out INTEGER,
     new_status TEXT NOT NULL,
     reason TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_adjustments_user_date ON attendance_adjustments(user_id, work_date);
   CREATE INDEX IF NOT EXISTS idx_adjustments_created ON attendance_adjustments(created_at);
   ```

### Cột mới trong bảng `attendance_days`

Bổ sung các trường lưu trạng thái điều chỉnh gần nhất:
- `manual_status TEXT CHECK (manual_status IN ('on_time', 'late', 'early_leave', 'late_and_early', 'missing_out', 'absent', 'leave', 'business_trip'))`
- `adjusted_by TEXT REFERENCES users(id) ON DELETE SET NULL`
- `adjusted_at TEXT`
- `adjustment_reason TEXT`

*(Các cột `manual_in`, `manual_out`, `late_excused` đã có từ schema v4 được tận dụng trực tiếp).*

---

## 4. Migration (v4 → v5)

- File: `server/migrations.ts` thêm bước:
  ```ts
  {
    from: 4,
    to: 5,
    run(db: Db) {
      // 1. Tạo bảng audit_logs
      // 2. Tạo bảng attendance_adjustments
      // 3. ALTER TABLE attendance_days ADD COLUMN manual_status TEXT;
      // 4. ALTER TABLE attendance_days ADD COLUMN adjusted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
      // 5. ALTER TABLE attendance_days ADD COLUMN adjusted_at TEXT;
      // 6. ALTER TABLE attendance_days ADD COLUMN adjustment_reason TEXT;
    }
  }
  ```
- Trước khi chạy migration: Tự động chạy `VACUUM INTO` sao lưu thành `attendance-<timestamp>-pre-migrate.db`.
- Cập nhật `SCHEMA_VERSION = 5` trong `server/schema.ts` và export ra `server/db.ts`.

---

## 5. Quy tắc tính toán & Điều chỉnh ngày công

1. **Giờ áp dụng (`effective_first_in`, `effective_last_out`):**
   - `effective_first_in = manual_in ?? first_in`
   - `effective_last_out = manual_out ?? last_out`
2. **Quy tắc xác định trạng thái sau điều chỉnh:**
   - Nếu quản lý chọn ghi đè trạng thái cố định (`manual_status` được cung cấp, ví dụ: công nhận `on_time` do camera mất điện):
     - `status = manual_status`
     - Nếu `late_excused = 1`, `late_minutes = 0` (hoặc giữ nguyên số phút trễ nhưng gắn cờ đã miễn trừ).
   - Nếu quản lý chỉ sửa giờ vào/ra mà không chọn ép trạng thái:
     - Hệ thống chạy hàm tính toán `computeDay` dựa trên ca làm việc hiệu lực của nhân viên đó tại ngày đó với giờ vào/ra mới.
3. **Lưu lịch sử:**
   - Mỗi lần bấm "Lưu điều chỉnh":
     1. Ghi 1 dòng vào `attendance_adjustments` (ghi vết giá trị cũ và mới).
     2. Cập nhật dòng tương ứng trong `attendance_days`. Nếu ngày đó chưa có dòng (ví dụ: ngày nghỉ/vắng chưa được tạo dòng), hệ thống tự động INSERT dòng `attendance_days`.
     3. Ghi 1 bản ghi vào `audit_logs` với action `'attendance.adjust'`.

---

## 6. Hệ thống Nhật ký kiểm toán (Audit Log)

### Các sự kiện được ghi nhận tự động

| Mã Action | Tên hiển thị | Đối tượng | Dữ liệu tóm tắt trong details |
|---|---|---|---|
| `attendance.adjust` | Điều chỉnh ngày công | `attendance_day` | `{ userId, userName, workDate, before, after, reason }` |
| `request.review` | Duyệt/Từ chối đơn | `request` | `{ requestId, requestType, userId, status, comment }` |
| `user.create` | Thêm nhân sự mới | `user` | `{ userId, code, name, role, departmentId }` |
| `user.update` | Cập nhật nhân sự | `user` | `{ userId, changedFields: [...] }` |
| `user.delete` | Xóa nhân sự | `user` | `{ userId, code, name }` |
| `user.reset_password` | Đặt lại mật khẩu | `user` | `{ userId, code, method: 'mail' | 'direct' }` |
| `shift.create` | Tạo ca làm việc | `shift` | `{ shiftId, name, areaId, workStart, workEnd }` |
| `shift.update` | Sửa ca làm việc | `shift` | `{ shiftId, name, changedFields: [...] }` |
| `shift.delete` | Xóa ca làm việc | `shift` | `{ shiftId, name }` |
| `shift.assign` | Gán ca làm việc | `department`/`user` | `{ targetType, targetId, shiftId, shiftName }` |
| `holiday.create` | Thêm ngày lễ | `holiday` | `{ date, name }` |
| `holiday.delete` | Xóa ngày lễ | `holiday` | `{ date, name }` |
| `area.create` | Tạo khu vực | `area` | `{ areaId, code, name }` |
| `area.update` | Sửa khu vực | `area` | `{ areaId, name }` |
| `area.delete` | Xóa khu vực | `area` | `{ areaId, code, name }` |
| `department.create` | Tạo phòng ban | `department` | `{ deptId, code, name, areaId }` |
| `department.update` | Sửa phòng ban | `department` | `{ deptId, name }` |
| `department.delete` | Xóa phòng ban | `department` | `{ deptId, code, name }` |
| `settings.update` | Sửa cấu hình | `settings` | `{ updatedKeys: [...] }` |

### Helper ghi log (`server/audit.ts`)
```ts
export function logAudit(
  db: Db,
  entry: {
    actor: AuthUser;
    action: string;
    targetType: string;
    targetId: string;
    areaId?: string | null;
    summary: string;
    details?: Record<string, unknown>;
  }
): void
```
- Tự động sinh ID `audit-<hex>`, gán `actor_id`, `actor_code`, `actor_name`, `actor_role`, `created_at` theo ISO giờ VN.
- Bọc `try ... catch` an toàn để không chặn transaction nghiệp vụ nếu có ngoại lệ.

---

## 7. Phân quyền và phạm vi (Access Matrix)

| API / Chức năng | `ADMIN` / `hr` | `area_admin` | `dept_manager` | `employee` |
|---|---|---|---|---|
| **Điều chỉnh công nhân viên** | Mọi nhân sự | Chỉ nhân sự thuộc khu vực mình quản lý | 403 | 403 |
| **Xem lịch sử điều chỉnh công** | Mọi nhân sự | Chỉ nhân sự thuộc khu vực mình quản lý | Chỉ xem của phòng mình (chế độ đọc) | 403 |
| **Xem bảng Nhật ký kiểm toán** | Toàn bộ log hệ thống | Chỉ các log có `area_id` thuộc quyền quản lý hoặc do chính mình thực hiện | 403 | 403 |
| **Lọc nhật ký theo khu vực** | Tùy chọn mọi khu | Chỉ các khu được gán | 403 | 403 |

---

## 8. Chi tiết API Endpoints

### 1. Điều chỉnh ngày công
- **`POST /api/attendance/adjust`**
  - **Quyền:** `requireManager` + kiểm tra nhân viên mục tiêu thuộc phạm vi quản lý (`managesArea`).
  - **Body:**
    ```json
    {
      "userId": "usr-123",
      "workDate": "2026-10-14",
      "manualIn": "08:15",      // string "HH:mm" hoặc null (xóa giờ thủ công)
      "manualOut": "17:30",     // string "HH:mm" hoặc null
      "manualStatus": "on_time", // string hoặc null (để tự tính)
      "lateExcused": false,     // boolean
      "reason": "Camera cửa chính mất mạng từ 08:00 đến 09:00" // string, tối thiểu 5 ký tự
    }
    ```
  - **Phản hồi 200:** Trả về đối tượng `AttendanceDay` đã cập nhật.
  - **Lỗi:**
    - `400`: Thiếu lý do hoặc giờ không đúng định dạng.
    - `404`: Không tìm thấy nhân sự hoặc nhân sự ngoài phạm vi quản lý khu vực.

- **`GET /api/attendance/adjustments?userId=...&workDate=...`**
  - **Quyền:** `requireManager` hoặc trưởng phòng xem nhân viên phòng mình.
  - **Phản hồi 200:** Danh sách các lần điều chỉnh của ngày công đó:
    ```json
    {
      "adjustments": [
        {
          "id": "adj-1",
          "userId": "usr-123",
          "workDate": "2026-10-14",
          "adjustedBy": "usr-admin",
          "adjustedByName": "Nguyễn Văn Quản Lý",
          "oldFirstIn": 1728867600000,
          "oldLastOut": null,
          "oldStatus": "missing_out",
          "newFirstIn": 1728867600000,
          "newLastOut": 1728900600000,
          "newStatus": "on_time",
          "reason": "Quên quẹt thẻ lúc về, có xác nhận của trưởng ca",
          "createdAt": "2026-10-14T10:30:00Z"
        }
      ]
    }
    ```

### 2. Nhật ký kiểm toán
- **`GET /api/audit-logs`**
  - **Quyền:** `requireManager` (`hr` hoặc `area_admin`).
  - **Query Params:**
    - `from`: YYYY-MM-DD
    - `to`: YYYY-MM-DD
    - `action`: Lọc theo loại hành động (vd: `attendance.adjust`, `user.create`, `shift.assign`...)
    - `actorId`: Lọc theo người thao tác
    - `area`: Lọc theo khu vực (tuân thủ giới hạn khu của `area_admin`)
    - `limit`: Mặc định 50, tối đa 200
    - `offset`: Phân trang
  - **Phản hồi 200:**
    ```json
    {
      "logs": [
        {
          "id": "audit-abc",
          "actorId": "usr-1",
          "actorCode": "HR01",
          "actorName": "Trần Thị Lan",
          "actorRole": "hr",
          "action": "attendance.adjust",
          "targetType": "attendance_day",
          "targetId": "usr-123:2026-10-14",
          "areaId": "area-1",
          "areaName": "Trụ sở Đức Giang",
          "summary": "Điều chỉnh công ngày 14/10/2026 cho nhân viên Lê Văn Cường",
          "details": { ... },
          "createdAt": "2026-10-14T10:30:00Z"
        }
      ],
      "total": 128
    }
    ```

---

## 9. Kiểu dữ liệu TypeScript (`shared/types.ts`)

```ts
export interface AttendanceAdjustment {
  id: string;
  userId: string;
  workDate: string;
  adjustedBy: string;
  adjustedByName?: string;
  oldFirstIn: number | null;
  oldLastOut: number | null;
  oldStatus: DayStatus;
  newFirstIn: number | null;
  newLastOut: number | null;
  newStatus: DayStatus;
  reason: string;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorCode: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  areaId: string | null;
  areaName?: string;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AdjustAttendancePayload {
  userId: string;
  workDate: string;
  manualIn?: string | null;
  manualOut?: string | null;
  manualStatus?: DayStatus | null;
  lateExcused?: boolean;
  reason: string;
}
```

---

## 10. Giao diện người dùng

1. **Nút và Modal "Điều chỉnh ngày công" (`AdjustAttendanceModal.tsx`):**
   - Trên bảng công, với mỗi dòng dữ liệu của nhân sự, người có quyền (HR / Quản trị khu) sẽ thấy icon/nút "Điều chỉnh".
   - Bấm vào mở Modal gồm:
     - Thông tin nhân sự: Họ tên, mã nhân viên, phòng ban, ca làm việc áp dụng trong ngày.
     - Dữ liệu nhận diện thực tế từ Camera AI (Giờ vào, Giờ ra, Số lần quẹt - không cho sửa).
     - Khung nhập liệu điều chỉnh:
       + Giờ vào thủ công (`HH:mm`, có nút "Lấy từ camera" hoặc xóa).
       + Giờ ra thủ công (`HH:mm`, có nút "Lấy từ camera" hoặc xóa).
       + Lựa chọn trạng thái: "Tự động tính theo ca" hoặc chọn trạng thái mong muốn.
       + Checkbox: "Miễn trừ đi muộn".
       + Ô nhập Lý do điều chỉnh (bắt buộc, có gợi ý: *Quên quẹt thẻ, Camera mất tín hiệu, Đi công tác đột xuất, Được duyệt đi muộn*).
     - Bảng lịch sử điều chỉnh: Hiển thị các lần điều chỉnh trước đó của ngày này (Ai sửa, lúc mấy giờ, lý do gì).
2. **Tab "Nhật ký" trên Navbar (`AuditLogsTab.tsx`):**
   - Chỉ hiển thị trên Navbar đối với `hr` và `area_admin` (biểu ngữ icon `ShieldAlert` hoặc `FileClock`).
   - Bộ lọc thanh công cụ:
     + Chọn khoảng thời gian (Từ ngày - Đến ngày).
     + Chọn loại hoạt động (Tất cả, Điều chỉnh công, Nhân sự, Ca làm việc, Đơn từ, Cấu hình).
     + Chọn Khu vực (nếu là HR toàn hệ thống).
   - Bảng danh sách:
     + Thời gian, Người thực hiện (tên + mã + vai trò), Thao tác, Đối tượng, Nội dung tóm tắt.
     + Bấm vào dòng để mở drawer/modal xem chi tiết thay đổi (`details` JSON trước và sau đẹp mắt).

---

## 11. Kiểm thử (Test Cases)

1. **Migration v4 → v5:**
   - Chạy migration từ file DB fixture v4, xác nhận DB nâng cấp lên v5 thành công, bảng `audit_logs` và `attendance_adjustments` được tạo, file backup `pre-migrate` được tạo chính xác.
2. **Quyền điều chỉnh ngày công:**
   - Quản trị khu vực A điều chỉnh nhân sự khu A -> thành công 200.
   - Quản trị khu vực A cố tình điều chỉnh nhân sự khu B -> trả về 404 (không lộ sự tồn tại).
   - Nhân viên / Trưởng phòng gọi API điều chỉnh -> 403 Forbidden.
   - Gửi yêu cầu thiếu `reason` hoặc `reason` dưới 5 ký tự -> 400 Bad Request.
3. **Tính toán logic sau điều chỉnh:**
   - Nhân sự vắng (chưa có quẹt), quản lý bổ sung `manualIn: "08:00"`, `manualOut: "17:00"` -> tự động tính thành `on_time`, `detection_count` vẫn giữ nguyên lượt quẹt thật.
   - Nhân sự đến muộn 08:30 (ca bắt đầu 08:00), quản lý tick `lateExcused: true` -> `late_excused = 1`, hiển thị nhãn "Miễn trừ muộn".
   - Lượt nhận diện gốc trong bảng `detections` không bị ảnh hưởng.
4. **Ghi nhận Audit Logs:**
   - Mọi thao tác điều chỉnh công, duyệt đơn, tạo ca, đổi ca, sửa nhân viên đều tạo đúng bản ghi `audit_logs`.
   - `area_admin` xem `/api/audit-logs` chỉ thấy các bản ghi thuộc khu vực mình quản lý.
5. **Chạy toàn bộ test suite:**
   - `npm test`, `TZ=UTC npm test`, `npm run lint`, `npm run build` hoàn toàn sạch lỗi.

---

## 12. Tiêu chí hoàn thành (Definition of Done)

1. Migration v4 → v5 chạy mượt mà, giữ trọn vẹn dữ liệu ca làm việc, ngày công và tài khoản của v4.
2. API điều chỉnh công hoàn chỉnh, có lưu vết lịch sử `attendance_adjustments` và không làm sai lệch dữ liệu camera thô.
3. Toàn bộ các thao tác nhạy cảm trong hệ thống được tự động ghi vào `audit_logs`.
4. Giao diện Modal Điều chỉnh và Tab Nhật ký kiểm toán chạy mượt, giao diện đồng bộ Tailwind token chuẩn, hỗ trợ lọc theo khu vực.
5. Kiểm thử tự động đạt 100% pass cho tất cả các kịch bản phân quyền và tính toán.
