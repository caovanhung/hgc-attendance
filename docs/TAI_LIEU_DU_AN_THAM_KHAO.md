# TÀI LIỆU DỰ ÁN HỆ THỐNG ĐIỂM DANH THÔNG MINH CAMERA AI
## CÔNG TY TNHH MTV PETROLIMEX HÀ NỘI

---

- **Tên dự án:** Hệ thống Quản trị & Điểm danh Thông minh Nhận diện Khuôn mặt qua Camera AI (Petrolimex HN Smart Attendance System)
- **Đơn vị chủ quản:** Công ty TNHH MTV Petrolimex Hà Nội (Tập đoàn Xăng dầu Việt Nam)
- **Địa chỉ trụ sở:** Số 26 Đức Giang, Phường Việt Hưng, Quận Long Biên, TP. Hà Nội
- **Phiên bản hệ thống:** v4.2.0 (Bao gồm Biểu đồ Xu hướng Chuyên cần 7 ngày & Quản lý Giờ tan ca Check-out)
- **Ngày phát hành tài liệu:** Tháng 10/2026
- **Tình trạng:** Hoàn thiện và vận hành chính thức

---

## MỤC LỤC TỔNG QUAN

1. [Giới thiệu & Mục tiêu Dự án](#1-giới-thiệu--mục-tiêu-dự-án)
2. [Kiến trúc Kỹ thuật Hệ thống (Architecture)](#2-kiến-trúc-kỹ-thuật-hệ-thống)
3. [Quy chế Điểm danh & Quy tắc Tính toán Nghiệp vụ](#3-quy-chế-điểm-danh--quy-tắc-tính-toán-nghiệp-vụ)
   - [3.1. Quy chế Điểm danh Đầu ca (Check-in)](#31-quy-chế-điểm-danh-đầu-ca-check-in)
   - [3.2. Quy chế Giờ tan ca (Check-out)](#32-quy-chế-giờ-tan-ca-check-out)
   - [3.3. Xử lý nhiều sự kiện nhận diện trong ngày (De-duplication)](#33-xử-lý-nhiều-sự-kiện-nhận-diện-trong-ngày)
   - [3.4. Quy trình Điều chỉnh Điểm danh (Adjustment & Audit)](#34-quy-trình-điều-chỉnh-điểm-danh)
4. [Hệ thống 20 Camera HANET AI Nhận diện](#4-hệ-thống-20-camera-hanet-ai-nhận-diện)
5. [Cơ chế Phân quyền Truy cập (RBAC - Role-Based Access Control)](#5-cơ-chế-phân-quyền-truy-cập-rbac)
6. [Các Phân hệ Tính năng Chính của Ứng dụng](#6-các-phân-hệ-tính-năng-chính-của-ứng-dụng)
   - [6.1. Bảng theo dõi Tổng quan (DashboardView) & Biểu đồ Recharts 7 ngày](#61-bảng-theo-dõi-tổng-quan-dashboardview)
   - [6.2. Bảng dữ liệu Điểm danh Chi tiết (AttendanceTableView)](#62-bảng-dữ-liệu-điểm-danh-chi-tiết)
   - [6.3. Phân hệ Báo cáo Chuyên cần & Xuất Excel (ReportsView)](#63-phân-hệ-báo-cáo-chuyên-cần--xuất-excel)
   - [6.4. Trang Điểm danh Cá nhân (MyAttendanceView)](#64-trang-điểm-danh-cá-nhân)
   - [6.5. Quản lý Hồ sơ Cán bộ Nhân viên (EmployeesView)](#65-quản-lý-hồ-sơ-cán-bộ-nhân-viên)
   - [6.6. Giám sát 20 Thiết bị Camera (CamerasView)](#66-giám-sát-20-thiết-bị-camera)
   - [6.7. Quản lý Tài khoản & Phân quyền (UsersView)](#67-quản-lý-tài-khoản--phân-quyền)
   - [6.8. Nhật ký Kiểm toán (AuditLogsView)](#68-nhật-ký-kiểm-toán)
7. [Tài liệu API & Tích hợp Webhook Realtime](#7-tài-liệu-api--tích-hợp-webhook-realtime)
8. [Hướng dẫn Vận hành Dành cho các Đối tượng Người dùng](#8-hướng-dẫn-vận-hành-dành-cho-các-đối-tượng-người-dùng)
9. [Cài đặt, Khởi chạy & Triển khai Kỹ thuật](#9-cài-đặt-khởi-chạy--triển-khai-kỹ-thuật)

---

## 1. GIỚI THIỆU & MỤC TIÊU DỰ ÁN

### 1.1. Bối cảnh
Công ty TNHH MTV Petrolimex Hà Nội là đơn vị chủ lực trực thuộc Tập đoàn Xăng dầu Việt Nam (Petrolimex), quản lý mạng lưới văn phòng trụ sở, các kho xăng dầu chiến lược (Tổng kho Đức Giang, Kho Đỗ Xá) cùng hệ thống cửa hàng xăng dầu trải rộng trên địa bàn Thủ đô và các tỉnh lân cận.

Trước khi triển khai dự án, công tác chấm công gặp phải các bất cập:
- Sử dụng máy chấm công vân tay truyền thống gây ùn tắc giờ cao điểm tại cổng vào và sảnh tòa nhà.
- Thiếu tính tự động hóa và thời gian thực, Phòng Tổ chức Hành chính (TCHC) phải tổng hợp thủ công cuối tháng.
- Không thể theo dõi sát sao tình hình tan ca, đi sớm, về sớm hay làm thêm giờ của từng đơn vị trực thuộc.
- Lãnh đạo Công ty và Trưởng phòng ban thiếu công cụ trực quan để nắm bắt biến động tỷ lệ chuyên cần theo thời gian thực.

### 1.2. Mục tiêu dự án
1. **Tự động hóa 100% việc chấm công:** Nhận diện khuôn mặt không chạm (Touchless Face ID) thông qua hệ thống 20 Camera HANET AI chuyên dụng với độ chính xác >99.7% và tốc độ nhận diện dưới 0.2 giây.
2. **Minh bạch và Real-time:** Dữ liệu vào ca (Check-in) và tan ca (Check-out) được đồng bộ ngay lập tức lên bảng Dashboard và trang cá nhân của từng cán bộ nhân viên.
3. **Phân tích Xu hướng Chuyên cần (7 ngày):** Trang bị biểu đồ Recharts trực quan phân tích chuyên sâu tỷ lệ đúng giờ, đi muộn, công tác, vắng mặt của toàn công ty hoặc theo từng phòng ban được chỉ định.
4. **Phân quyền chặt chẽ (RBAC):** Đảm bảo tính bảo mật và phân cấp quản lý theo đúng cơ cấu hành chính: Super Admin, HR/TCHC Admin, Lãnh đạo Công ty, Lãnh đạo Đơn vị, Trưởng/Phó phòng ban và Nhân viên.
5. **Chuẩn hóa quy trình điều chỉnh & kiểm toán:** Mọi thao tác bổ sung, sửa đổi dữ liệu chấm công bắt buộc phải có lý do minh bạch, người thực hiện và được lưu vết vĩnh viễn trong Nhật ký Audit Trail.

---

## 2. KIẾN TRÚC KỸ THUẬT HỆ THỐNG

### 2.1. Ngăn xếp Công nghệ (Technology Stack)
- **Frontend Framework:** React 19 / TypeScript 7.0 (Strict Typing).
- **Styling & Giao diện:** Tailwind CSS v4 kết hợp hệ thống màu nhận diện thương hiệu Petrolimex (Xanh Petrolimex `#003865` / `#002847`, Cam Petrolimex `#f97316` / `#ea580c`).
- **Thư viện Biểu đồ:** Recharts v3.10 (Responsive Bar Chart, Stacked Categories, Custom Tooltip, Trend Indicators).
- **Biểu tượng:** Lucide React (Hơn 40 biểu tượng chuyên dụng).
- **Xử lý Xuất Dữ liệu:** SheetJS (`xlsx`) xuất bảng tính Excel định dạng chuẩn và xuất CSV mã hóa UTF-8 BOM hiển thị chuẩn tiếng Việt trên mọi phiên bản Microsoft Excel.
- **Lưu trữ Cục bộ & Trạng thái:** LocalStorage v4 Engine với cơ chế Pub/Sub (Publish/Subscribe Observer Pattern), đảm bảo phản hồi tức thì giữa các phân hệ khi có sự kiện chấm công mới.

### 2.2. Luồng Dữ liệu Tổng thể
```
[ Cán bộ nhân viên đi qua cửa / cổng ]
                 │
                 ▼
[ 20 Camera AI HANET (AiCam B200 / FaceID 200) ]
  • Nhận diện khuôn mặt bằng mô hình AI On-Edge
  • Trích xuất Face Token & Chụp ảnh Snapshot
                 │
                 ▼ (HTTP POST JSON Webhook)
[ Cổng Thu nhận Sự kiện (Webhook Ingestion Endpoint) ]
  • Xác thực Bearer Token / Signature
  • Khử trùng lặp sự kiện (De-duplication trong cửa sổ 3 phút)
                 │
                 ▼
[ Động cơ Chấm công Thông minh (AttendanceEngine) ]
  • Đối chiếu Khung giờ ca (WorkShift: 08:00 - 17:00)
  • Tính toán Giờ vào: Đi sớm (<07:45), Đúng giờ (07:45-08:15), Đi muộn (>08:15)
  • Tính toán Giờ tan: Về sớm (<16:50), Tan đúng giờ (16:50-17:30), Về muộn (>17:30)
                 │
                 ▼
[ Bộ lưu trữ Storage & Phân quyền RBAC ]
  • Lưu trữ Sự kiện chi tiết (AttendanceEvents)
  • Lưu trữ Bản ghi tổng hợp ngày (AttendanceDaily)
  • Ghi vết Kiểm toán (AuditLogs)
                 │
                 ▼
[ Giao diện Người dùng WebApp ]
  • Dashboard Lãnh đạo (KPIs & Biểu đồ Recharts 7 ngày)
  • Bảng Điểm danh Toàn đơn vị (Lọc, Tìm kiếm, Xuất Excel/CSV)
  • Báo cáo Chuyên cần Tháng / Tuần (In ấn biểu mẫu Petrolimex)
  • Điểm danh Cá nhân & Nộp giải trình
```

---

## 3. QUY CHẾ ĐIỂM DANH & QUY TẮC TÍNH TOÁN NGHIỆP VỤ

### 3.1. Quy chế Điểm danh Đầu ca (Check-in)
Ca làm việc hành chính chuẩn của Petrolimex Hà Nội:
- **Giờ bắt đầu làm việc:** `08:00`
- **Thời gian ân hạn cho phép (Grace Period):** 15 phút (đến `08:15`)
- **Ngưỡng ghi nhận đi sớm:** Trước `07:45`

| Trạng thái | Khoảng thời gian nhận diện | Mô tả & Cách tính số phút |
| :--- | :--- | :--- |
| **ĐI SỚM (EARLY)** | Trước `07:45` | Cán bộ đến trước giờ ca >15 phút. Hệ thống tính `minutesEarly = 08:00 - Giờ_quẹt`. |
| **ĐÚNG GIỜ (ON_TIME)** | `07:45` đến `08:15` | Cán bộ có mặt chuẩn khung giờ hành chính (bao gồm 15 phút ân hạn). `minutesLate = 0`. |
| **ĐI MUỘN (LATE)** | Sau `08:15` | Cán bộ đến sau thời gian ân hạn. Hệ thống tính `minutesLate = Giờ_quẹt - 08:00`. |
| **CHƯA ĐIỂM DANH (NOT_CHECKED_IN)** | Chưa có sự kiện quẹt | Đang trong ngày làm việc nhưng camera chưa nhận diện được CBNV. |
| **VẮNG MẶT (ABSENT)** | Hết ca không có quẹt | Không có mặt và không có đơn xin phép hay công tác. |
| **CÔNG TÁC (BUSINESS_TRIP)** | Được duyệt cử đi công tác | Có giấy công tác, tính đủ công chuyên cần. |
| **NGHỈ PHÉP (LEAVE_PERMITTED)** | Nghỉ phép năm / Chế độ | Có đơn xin phép được phê duyệt trước. |

---

### 3.2. Quy chế Giờ tan ca (Check-out)
Ca làm việc kết thúc vào lúc:
- **Giờ tan ca chuẩn:** `17:00`
- **Ngưỡng cho phép tan ca đúng giờ:** Từ `16:50` đến `17:30` (cho phép chuẩn bị 10 phút trước ca và nới rộng 30 phút sau ca)
- **Ngưỡng về sớm (Early Checkout):** Trước `16:50`
- **Ngưỡng về muộn / Tăng ca (Late Checkout):** Sau `17:30`

| Trạng thái Tan ca | Khoảng thời gian nhận diện | Mô tả & Cách tính số phút |
| :--- | :--- | :--- |
| **TAN ĐÚNG GIỜ (ON_TIME)** | `16:50` đến `17:30` | Hoàn thành đủ thời gian làm việc trong ngày và ra về đúng quy định. |
| **VỀ SỚM (EARLY)** | Trước `16:50` | Rời vị trí làm việc trước giờ tan ca. Hệ thống ghi nhận số phút về sớm: `minutesEarlyCheckout = 17:00 - Giờ_về`. |
| **VỀ MUỘN / TĂNG CA (LATE)** | Sau `17:30` | Cán bộ ở lại làm thêm giờ, xử lý công việc phát sinh ngoài giờ. Hệ thống ghi nhận số phút làm thêm: `minutesLateCheckout = Giờ_về - 17:00`. |
| **CHƯA QUẸT RA (NOT_CHECKED_OUT)** | Chưa có quẹt lúc ra về | Đã check-in buổi sáng nhưng chưa ghi nhận lượt quét camera lúc tan ca (đang trong giờ làm hoặc quên quẹt thẻ khi về). |

---

### 3.3. Xử lý nhiều sự kiện nhận diện trong ngày (De-duplication)
Trong môi trường thực tế tại Tòa nhà 26 Đức Giang và các kho xăng dầu, một cán bộ có thể đi qua vùng quét của camera nhiều lần trong ngày (ra vào cổng, di chuyển giữa các phòng ban, đi họp). Hệ thống áp dụng thuật toán phân tách:
1. **Lọc sự kiện lặp (De-bounce):** Bỏ qua các lần nhận diện liên tiếp cách nhau dưới 3 phút tại cùng 1 cụm camera.
2. **Xác định Giờ vào ca (First Check-in):** Chọn sự kiện hợp lệ sớm nhất trong khoảng thời gian từ `06:30` đến trước nửa ca làm việc (`12:00`).
3. **Xác định Giờ tan ca (Last Check-out):** Khi nhân viên có nhiều lần quẹt thẻ trong ngày, hệ thống chọn sự kiện hợp lệ cuối cùng trong khung giờ chiều/tối (sau `12:00`) để làm giờ ra về chính thức. Nếu nhân viên chỉ có 1 lần quẹt vào buổi sáng, trạng thái tan ca giữ là `NOT_CHECKED_OUT`.

---

### 3.4. Quy trình Điều chỉnh Điểm danh (Adjustment & Audit)
Khi xảy ra các trường hợp bất khả kháng (camera bảo trì, mất điện cục bộ, công tác đột xuất, quên nhận diện):
1. Cán bộ nộp đơn giải trình kèm minh chứng.
2. Quản trị viên (Super Admin hoặc HR/TCHC Admin) mở modal **Điều chỉnh Điểm danh**.
3. Cập nhật trạng thái giờ vào, giờ ra hoặc chuyển sang Công tác / Nghỉ phép.
4. **Bắt buộc nhập lý do điều chỉnh:** Không thể lưu nếu để trống lý do.
5. Hệ thống lập tức:
   - Đánh dấu cờ `isAdjusted: true` trên bản ghi điểm danh (hiển thị nhãn "Đã điều chỉnh" minh bạch trên bảng dữ liệu).
   - Tự động ghi 01 bản ghi vào phân hệ **Nhật ký Audit Trail** ghi rõ: Tên người sửa, ID nhân viên, trạng thái cũ -> trạng thái mới, lý do điều chỉnh, địa chỉ IP và dấu thời gian chính xác.

---

## 4. HỆ THỐNG 20 CAMERA HANET AI NHẬN DIỆN

Công ty triển khai hệ thống gồm 20 camera AI chuyên dụng thế hệ mới của HANET, phân bổ chiến lược tại các mục tiêu trọng điểm:

| STT | Tên Camera | Mã thiết bị | Vị trí lắp đặt | Chức năng chính |
| :---: | :--- | :--- | :--- | :--- |
| 1 | CAM-DG-01 | HNT-B200-0101 | Cổng chính Trụ sở 26 Đức Giang | Điểm danh cửa ngõ CBNV & Khách |
| 2 | CAM-DG-02 | HNT-B200-0102 | Cổng phụ xe máy Trụ sở Đức Giang | Điểm danh CBNV đi xe máy vào ca |
| 3 | CAM-DG-03 | HNT-B200-0103 | Sảnh tầng 1 - Cửa thang máy A | Nhận diện sảnh chính trung tâm |
| 4 | CAM-DG-04 | HNT-B200-0104 | Sảnh tầng 1 - Cửa thang máy B | Điểm danh luồng di chuyển thang B |
| 5 | CAM-DG-05 | HNT-B200-0105 | Hành lang Tầng 2 - Phòng TCHC & Kế toán | Giám sát cửa ra vào khối hành chính |
| 6 | CAM-DG-06 | HNT-B200-0106 | Hành lang Tầng 3 - Phòng Kinh doanh | Giám sát cửa vào khối kinh doanh |
| 7 | CAM-DG-07 | HNT-B200-0107 | Hành lang Tầng 4 - Ban Giám đốc | Kiểm soát an ninh khu vực lãnh đạo |
| 8 | CAM-DG-08 | HNT-B200-0108 | Cửa Nhà ăn Cán bộ công nhân viên | Kiểm soát giờ ăn trưa & điểm danh |
| 9 | CAM-TK-01 | HNT-B200-0201 | Cổng chính Tổng kho Đức Giang | Điểm danh nhân viên và lái xe bồn |
| 10 | CAM-TK-02 | HNT-B200-0202 | Cửa Phòng Điều độ Tổng kho Đức Giang | Điểm danh ca kíp khối kỹ thuật điều độ |
| 11 | CAM-TK-03 | HNT-B200-0203 | Khu vực Bến xuất Xăng dầu đường bộ 1 | Kiểm soát an ninh & chấm công ca kíp |
| 12 | CAM-TK-04 | HNT-B200-0204 | Khu vực Bến xuất Xăng dầu đường bộ 2 | Kiểm soát an ninh & chấm công ca kíp |
| 13 | CAM-TK-05 | HNT-B200-0205 | Cổng Cảng xuất nhập Xăng dầu Thủy Đức Giang | Điểm danh ca tàu & xà lan nhận hàng |
| 14 | CAM-TK-06 | HNT-B200-0206 | Cửa Trạm bơm Xăng dầu Tổng kho | Kiểm soát ca trực vận hành máy bơm |
| 15 | CAM-DX-01 | HNT-B200-0301 | Cổng chính Kho Xăng dầu Đỗ Xá | Điểm danh cán bộ Kho Đỗ Xá |
| 16 | CAM-DX-02 | HNT-B200-0302 | Nhà Điều hành Kho Xăng dầu Đỗ Xá | Điểm danh khối văn phòng Kho Đỗ Xá |
| 17 | CAM-DX-03 | HNT-B200-0303 | Bến xuất Xăng dầu Kho Đỗ Xá | Điểm danh công nhân giao nhận Đỗ Xá |
| 18 | CAM-CH-01 | HNT-B200-0401 | Cửa hàng Xăng dầu Số 01 - Trần Quang Khải | Điểm danh ca kíp bán lẻ CHXD |
| 19 | CAM-CH-02 | HNT-B200-0402 | Cửa hàng Xăng dầu Số 15 - Nguyễn Văn Cừ | Điểm danh ca kíp bán lẻ CHXD |
| 20 | CAM-CH-03 | HNT-B200-0403 | Cửa hàng Xăng dầu Số 32 - Giải Phóng | Điểm danh ca kíp bán lẻ CHXD |

---

## 5. CƠ CHẾ PHÂN QUYỀN TRUY CẬP (RBAC)

Hệ thống thiết kế mô hình phân quyền ma trận 6 cấp bậc kết hợp phạm vi giám sát (Data Scope):

| Mã Vai trò | Tên Vai trò | Phạm vi Dữ liệu (Scope) | Quyền hạn Chính |
| :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | Super Administrator | Toàn hệ thống (`GLOBAL`) | Toàn quyền: Cấu hình hệ thống, quản lý camera, thêm xóa tài khoản, phân quyền, điều chỉnh điểm danh, xem Audit Log toàn diện. |
| **HR_ADMIN** | Quản trị viên TCHC | Toàn công ty (`GLOBAL`) | Quản lý nhân sự, giám sát điểm danh toàn công ty, điều chỉnh điểm danh có lý do, xuất báo cáo tổng hợp tháng/tuần/ngày, in ấn biểu mẫu. |
| **COMPANY_LEADER** | Lãnh đạo Công ty (TGĐ / PGĐ) | Toàn công ty (`GLOBAL`) | Giám sát Dashboard điều hành, xem biểu đồ xu hướng 7 ngày, xem báo cáo tất cả phòng ban, xem nhật ký kiểm toán. Không trực tiếp sửa công. |
| **UNIT_LEADER** | Giám đốc Tổng kho / Đơn vị | Chi nhánh / Tổng kho (`UNIT`) | Giám sát điểm danh toàn bộ CBNV thuộc Tổng kho hoặc đơn vị mình quản lý. |
| **DEPARTMENT_MANAGER** / **DEPUTY_MANAGER** | Trưởng phòng / Phó phòng | Phòng ban trực thuộc (`DEPARTMENT`) | Xem Dashboard và bảng điểm danh của riêng phòng ban mình quản lý, theo dõi đi muộn / về sớm của nhân viên dưới quyền. |
| **EMPLOYEE** | Cán bộ Nhân viên | Bản thân (`SELF`) | Xem lịch sử điểm danh của bản thân, xem ảnh nhận diện camera, gửi yêu cầu giải trình điểm danh. Không xem dữ liệu của người khác. |

---

## 6. CÁC PHÂN HỆ TÍNH NĂNG CHÍNH

### 6.1. Bảng theo dõi Tổng quan (DashboardView) & Biểu đồ Recharts 7 ngày
- **Dải chỉ số KPI thời gian thực:**
  - Tổng số CBNV trong ca trực.
  - Số lượng & Tỷ lệ đã điểm danh (Check-in Rate %).
  - Số lượng CBNV đi sớm, đúng giờ, đi muộn (>15 phút), vắng mặt/chưa vào, công tác.
- **Thanh Tình hình Tan ca (Check-out Overview Bar):**
  - Hiển thị tức thời tỷ lệ đã quẹt về: Tan đúng giờ, Về sớm trước ca, Về muộn / Tăng ca làm thêm.
- **Biểu đồ Cột Recharts (Xu hướng Chuyên cần 7 ngày qua):**
  - Trực quan hóa dữ liệu 7 ngày liên tiếp: Số lượng CBNV Đúng giờ (xanh lá), Đi muộn (vàng cam), Công tác/Phép (xanh dương), Vắng mặt (đỏ).
  - Tự động tính toán đường xu hướng Tỷ lệ Chuyên cần bình quân (%) và Tỷ lệ Đúng giờ bình quân (%).
  - Tự động tìm và làm nổi bật **Ngày có chuyên cần cao nhất trong tuần**.
  - Custom Tooltip tương tác thông minh hiển thị chi tiết khi rê chuột.
  - Bộ lọc linh hoạt: Lãnh đạo có thể xem toàn công ty hoặc lọc riêng từng phòng ban trực thuộc.
- **Bảng Cảnh báo Cần lưu ý:** Tự động lọc danh sách nhân viên đi muộn nhiều phút nhất hoặc chưa có mặt đầu ca để lãnh đạo kịp thời nắm bắt.

### 6.2. Bảng dữ liệu Điểm danh Chi tiết (AttendanceTableView)
- Danh sách bảng biểu đầy đủ với phân trang mượt mà.
- Hiển thị cả 2 cột mốc: **Giờ vào ca** (kèm ảnh nhận diện, badge trạng thái đi sớm/đúng giờ/muộn) và **Giờ tan ca** (kèm badge trạng thái tan đúng giờ/về sớm/tăng ca).
- Bộ lọc đa chiều:
  - Lọc theo Ngày làm việc (Date Picker).
  - Lọc theo Phòng ban.
  - Lọc theo Trạng thái Vào ca (Đi sớm, Đúng giờ, Đi muộn, Vắng, Công tác).
  - Lọc theo Trạng thái Tan ca (Đúng giờ, Về sớm, Tăng ca, Chưa quẹt ra).
  - Ô tìm kiếm từ khóa tức thì theo Họ tên hoặc Mã nhân viên.
- Thao tác nhanh:
  - Nhấp vào từng dòng để mở Modal xem ảnh chụp và toàn bộ lịch sử quẹt thẻ trong ngày.
  - Xuất bảng tính Excel `.xlsx` chuẩn hóa màu sắc cột.
  - Xuất file `.csv` định dạng UTF-8 BOM chuẩn tiếng Việt.
  - In ấn trực tiếp danh sách theo biểu mẫu báo cáo.

### 6.3. Phân hệ Báo cáo Chuyên cần & Xuất Excel (ReportsView)
- Báo cáo tổng hợp theo Tháng, Tuần hoặc Ngày.
- Bảng tổng hợp theo từng nhân sự: Tổng ngày công, số lần đi đúng giờ, số lần đi sớm, số lần đi muộn (kèm tổng phút muộn), số lần tan ca đúng giờ, số lần về sớm (kèm tổng phút về sớm), số lần tăng ca (kèm tổng phút tăng ca), tỷ lệ chuyên cần (%).
- Tính năng in ấn chuẩn công văn Petrolimex Hà Nội (có sẵn tiêu đề Tập đoàn, địa chỉ 26 Đức Giang, nơi nhận và chữ ký người lập biểu, Trưởng phòng TCHC).

### 6.4. Trang Điểm danh Cá nhân (MyAttendanceView)
- Giao diện thân thiện dành riêng cho từng cán bộ nhân viên.
- Thẻ thông tin cá nhân: Mã NV, Phòng ban, Chức danh, Ca làm việc áp dụng.
- Thẻ tóm tắt tình trạng ngày hôm nay: Giờ vào thực tế, Giờ ra thực tế, Đánh giá chuyên cần.
- Bảng lịch sử 30 ngày gần nhất kèm ảnh snapshot camera khi qua cửa.
- Nút nộp đơn giải trình khi có sự cố nhận diện.

### 6.5. Quản lý Hồ sơ Cán bộ Nhân viên (EmployeesView)
- Danh mục toàn bộ hơn 120+ cán bộ nhân viên thuộc 9 phòng ban và các tổng kho.
- Xem thông tin chi tiết, mã nhân viên, ca làm việc được gán, trạng thái khuôn mặt AI đã đăng ký.

### 6.6. Giám sát 20 Thiết bị Camera (CamerasView)
- Hiển thị trực quan trạng thái kết nối Online/Offline của 20 Camera HANET.
- Xem địa chỉ IP, địa chỉ MAC, firmware, chất lượng kết nối và tổng số lượt nhận diện trong ngày của từng camera.
- Giả lập trigger nhận diện từ camera để kiểm thử luồng dữ liệu.

### 6.7. Quản lý Tài khoản & Phân quyền (UsersView)
- Quản lý danh sách tài khoản người dùng đăng nhập hệ thống.
- Cấp phát vai trò (Super Admin, HR Admin, Leader, Manager, Employee) và phạm vi dữ liệu (Scope).
- Kích hoạt / Khóa tài khoản nhân sự nghỉ việc hoặc chuyển công tác.

### 6.8. Nhật ký Kiểm toán (AuditLogsView)
- Ghi lại chi tiết 100% các thao tác nhạy cảm: Điều chỉnh giờ chấm công, thay đổi phân quyền, đăng nhập quản trị.
- Hiển thị dấu thời gian chính xác, người thực hiện, hành động, giá trị cũ/mới và lý do bắt buộc.

---

## 7. TÀI LIỆU API & TÍCH HỢP WEBHOOK REALTIME

Hệ thống hỗ trợ cổng tiếp nhận Webhook chuẩn RESTful JSON tương thích hoàn toàn với nền tảng Cloud và On-Premise của HANET Camera.

### 7.1. Cấu hình Webhook
- **Phương thức:** `POST`
- **Đường dẫn tiếp nhận:** `/api/v1/hanet/face-recognition-webhook`
- **Tiêu đề (Headers):**
  - `Content-Type: application/json`
  - `Authorization: Bearer <PETROLIMEX_HANET_SECRET_KEY>`
  - `X-Hanet-Signature: <HMAC_SHA256_HASH>`

### 7.2. Định dạng Dữ liệu Gửi đến (Payload mẫu)
```json
{
  "event_id": "evt_hanet_20261008_080215_982",
  "device_id": "HNT-B200-0101",
  "device_name": "CAM-DG-01 - Cổng chính 26 Đức Giang",
  "place_id": "PLC-HN-01",
  "timestamp": 1791446535000,
  "detected_time": "2026-10-08T08:02:15.000+07:00",
  "person": {
    "employee_code": "PLX-HN-001",
    "full_name": "Nguyễn Văn An",
    "face_token": "ftk_9a8b7c6d5e4f",
    "avatar_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    "confidence_score": 0.9982
  },
  "metadata": {
    "mask_detected": false,
    "temperature": 36.5,
    "ambient_light": "NORMAL"
  }
}
```

### 7.3. Phản hồi từ Hệ thống
- **Thành công (HTTP 200 OK):**
```json
{
  "success": true,
  "message": "Event recorded and processed successfully",
  "attendance_daily_id": "daily_PLX-HN-001_2026-10-08",
  "computed_checkin_status": "ON_TIME",
  "computed_checkout_status": "NOT_CHECKED_OUT"
}
```
- **Lỗi xác thực (HTTP 401 Unauthorized):** Token không hợp lệ.
- **Khử trùng lặp (HTTP 200 OK / Skipped):**
```json
{
  "success": true,
  "status": "DUPLICATE_IGNORED",
  "message": "Event occurred within 3 minutes of previous detection; duplicate ignored."
}
```

---

## 8. HƯỚNG DẪN VẬN HÀNH DÀNH CHO CÁC ĐỐI TƯỢNG NGƯỜI DÙNG

### 8.1. Dành cho Cán bộ Nhân viên
1. Khi đến cơ quan hoặc rời vị trí làm việc, chỉ cần đi qua cửa cổng chính hoặc sảnh có gắn Camera HANET và hướng mặt về phía camera ở cự ly 1.5m - 3.5m.
2. Để tra cứu kết quả điểm danh: Đăng nhập vào hệ thống, chọn thẻ **Điểm danh của tôi**.
3. Xem giờ vào, giờ ra và ảnh chụp xác thực. Nếu phát hiện thiếu lượt quẹt do camera đang bảo trì, nhấn **Nộp giải trình** để gửi đề xuất cho Phòng TCHC.

### 8.2. Dành cho Trưởng / Phó phòng ban
1. Đăng nhập tài khoản quản lý phòng ban, hệ thống tự động thiết lập phạm vi về chính phòng ban của bạn.
2. Tại trang **Tổng quan**, theo dõi tỷ lệ quân số có mặt đầu ca sáng (08:00 - 08:30) và tỷ lệ nhân viên tan ca buổi chiều (17:00 - 17:30).
3. Quan sát biểu đồ cột 7 ngày để nắm bắt xu hướng đi làm của nhân viên phòng mình theo tuần.
4. Xuất danh sách điểm danh hàng ngày hoặc hàng tuần khi cần báo cáo Ban Giám đốc.

### 8.3. Dành cho Phòng Tổ chức Hành chính (HR/TCHC Admin)
1. Hàng ngày: Theo dõi danh sách cán bộ đi muộn, cán bộ vắng mặt tại mục **Điểm danh Nhân viên**.
2. Xử lý yêu cầu điều chỉnh: Mở chi tiết nhân sự, nhấn **Điều chỉnh Điểm danh**, chọn trạng thái thực tế và bắt buộc nhập lý do điều chỉnh rõ ràng.
3. Cuối tháng: Truy cập phân hệ **Báo cáo Chuyên cần**, chọn tháng cần chốt, kiểm tra tổng số ngày công, số phút muộn, số phút về sớm/tăng ca, sau đó nhấn **Xuất file Excel** hoặc **In báo cáo** theo biểu mẫu Petrolimex.

### 8.4. Dành cho Lãnh đạo Công ty (Ban Giám đốc)
1. Đăng nhập tài khoản Lãnh đạo Công ty.
2. Theo dõi chỉ số toàn diện trên Dashboard: Tỷ lệ chuyên cần toàn công ty, tỷ lệ đi đúng giờ, tình hình tan ca chiều.
3. Chuyển đổi bộ lọc giữa các phòng ban và kho xăng dầu trên Biểu đồ xu hướng 7 ngày để so sánh mức độ chấp hành nội quy giờ giấc giữa các đơn vị.

---

## 9. CÀI ĐẶT, KHỞI CHẠY & TRIỂN KHAI KỸ THUẬT

### 9.1. Yêu cầu Hệ thống
- **Môi trường chạy:** Node.js >= 18.0.0 hoặc Bun runtime.
- **Trình duyệt khuyến nghị:** Google Chrome, Microsoft Edge, Safari phiên bản mới nhất.

### 9.2. Lệnh Khởi chạy & Phát triển
```bash
# Cài đặt các gói phụ thuộc
npm install

# Khởi chạy máy chủ phát triển (Dev Server) tại cổng 3000
npm run dev

# Kiểm tra cú pháp và kiểu dữ liệu TypeScript
npm run lint

# Đóng gói ứng dụng cho môi trường sản xuất (Production Build)
npm run build
```

### 9.3. Tải về và Lưu trữ Tài liệu này
- Tài liệu này được lưu trực tiếp tại tệp tin: `/TAI_LIEU_DU_AN.md`
- Người dùng cũng có thể truy cập mục **Tài liệu Dự án** trực tiếp trên thanh điều hướng của giao diện WebApp để đọc trực tuyến, tải file Markdown, tải file Word/HTML hoặc In thành tệp PDF.

---
*Tài liệu được biên soạn và chuẩn hóa bởi Đội ngũ Kỹ thuật Hệ thống Petrolimex Hà Nội.*
