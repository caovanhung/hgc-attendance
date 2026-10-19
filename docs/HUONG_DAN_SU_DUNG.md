# SỔ TAY HƯỚNG DẪN SỬ DỤNG HỆ THỐNG ĐIỂM DANH CAMERA AI
## Hướng dẫn Vận hành & Thao tác Chi tiết dành cho Người Dùng & Quản Trị Viên

---

## MỤC LỤC
1. [Hướng dẫn Đăng nhập & Thiết lập Ban đầu](#1-hướng-dẫn-đăng-nhập--thiết-lập-ban-đầu)
2. [Hướng dẫn dành cho Cán bộ Nhân viên](#2-hướng-dẫn-dành-cho-cán-bộ-nhân-viên)
   - 2.1. Theo dõi kết quả điểm danh hôm nay
   - 2.2. Xem lịch sử tháng và xem lại video quẹt thẻ
   - 2.3. Quy trình nộp đơn giải trình / xin phép trực tuyến
3. [Hướng dẫn dành cho Lãnh đạo Phòng ban (Trưởng phòng)](#3-hướng-dẫn-dành-cho-lãnh-đạo-phòng-ban-trưởng-phòng)
   - 3.1. Giám sát quân số và tình hình chấp hành giờ giấc của phòng
   - 3.2. Xét duyệt đơn từ của nhân viên trong phòng
4. [Hướng dẫn dành cho Quản trị Khu vực](#4-hướng-dẫn-dành-cho-quản-trị-khu-vực)
5. [Hướng dẫn dành cho Bộ phận Nhân sự (HR)](#5-hướng-dẫn-dành-cho-bộ-phận-nhân-sự-hr)
   - 5.1. Quản lý Hồ sơ Nhân sự & Đăng ký Khuôn mặt FaceID
   - 5.2. Quản lý Phòng ban & Cơ cấu tổ chức
   - 5.3. Thiết lập Ca làm việc & Lịch nghỉ Lễ, Tết
   - 5.4. Quy trình Điều chỉnh giờ công (Điều chỉnh có lưu vết Audit)
   - 5.5. Lập Báo cáo Tháng, Xuất Excel & Khóa sổ Điểm danh (Month Lock)
6. [Hướng dẫn dành cho Quản trị Kỹ thuật (ADMIN)](#6-hướng-dẫn-dành-cho-quản-trị-kỹ-thuật-admin)
   - 6.1. Cấu hình Kết nối Camera Hanet AI & Webhook
   - 6.2. Cấu hình Tài khoản Hanet Connect xem Video thời khắc nhận diện
   - 6.3. Sao lưu & Phục hồi Cơ sở Dữ liệu
7. [Các câu hỏi thường gặp (FAQ) & Xử lý sự cố](#7-các-câu-hỏi-thường-gặp-faq--xử-lý-sự-cố)

---

## 1. HƯỚNG DẪN ĐĂNG NHẬP & THIẾT LẬP BAN ĐẦU

### 1.1. Truy cập hệ thống
1. Mở trình duyệt web (Google Chrome, Microsoft Edge, Cốc Cốc hoặc Safari trên điện thoại/máy tính).
2. Nhập địa chỉ hệ thống điểm danh được cung cấp (ví dụ: `https://diemdanh.tenmiencuaban.com`).

### 1.2. Đăng nhập
- **Tài khoản:** Nhập **Mã nhân viên** (ví dụ: `NV0001`, `ADMIN`) hoặc **Địa chỉ Email**.
- **Mật khẩu:** Nhập mật khẩu được cấp hoặc gửi qua email.
- Bấm nút **"Đăng nhập"**.

### 1.3. Đổi mật khẩu lần đầu (Bắt buộc)
- Khi đăng nhập lần đầu tiên bằng mật khẩu tạm, hệ thống sẽ tự động hiển thị màn hình **"Đổi mật khẩu lần đầu"** để bảo đảm an toàn.
- Nhập **Mật khẩu mới** (tối thiểu 8 ký tự, khuyến nghị có chữ hoa, chữ thường và số).
- Nhập lại mật khẩu mới để xác nhận $\rightarrow$ Bấm **"Cập nhật mật khẩu"**.

---

## 2. HƯỚNG DẪN DÀNH CHO CÁN BỘ NHÂN VIÊN

### 2.1. Theo dõi kết quả điểm danh hôm nay
1. Sau khi đăng nhập, chọn mục **"Cá nhân của tôi"** trên thanh điều hướng bên trái.
2. Tại khối **"Hôm nay"**, bạn sẽ thấy ngay:
   - **Giờ vào:** Thời điểm camera ghi nhận bạn bước vào cơ quan đầu tiên trong ngày.
   - **Lần quẹt gần nhất / Giờ ra:** Thời điểm bạn vừa đi qua camera gần nhất.
   - **Trạng thái:**
     - `Đi đúng giờ` (Badge xanh lá): Bạn đến làm việc trong khung giờ quy định hoặc trước giờ vào ca.
     - `Đi muộn X'` (Badge đỏ): Bạn đến sau giờ ân hạn của ca làm việc kèm số phút trễ.
     - `Về sớm Y'` (Badge đỏ): Bạn rời cơ quan trước giờ tan ca quy định.

> **Lưu ý:** Bạn không cần lo lắng nếu đến cơ quan sớm hoặc ở lại muộn hơn giờ hành chính. Hệ thống tự động ghi nhận là **Đi đúng giờ** và **Về đúng giờ** theo đúng quy định kỷ luật lao động.

### 2.2. Xem lịch sử tháng và xem lại video quẹt thẻ
1. Tại tab **"Cá nhân của tôi"**, kéo xuống mục **"Lịch sử điểm danh tháng"**.
2. Bạn có thể chọn tháng cần xem bằng ô chọn tháng ở góc trên bên phải.
3. Bảng thống kê tổng hợp sẽ hiển thị: Tổng ngày công thực tế, số lần đi muộn, về sớm, nghỉ phép, công tác.
4. **Xem video và ảnh nhận diện:**
   - Click vào bất kỳ ngày nào trên bảng.
   - Cửa sổ chi tiết ngày công sẽ hiện ra, hiển thị các ảnh chụp khuôn mặt khi bạn đi qua camera.
   - Nhấp vào nút **"Xem video"** có biểu tượng máy quay để tua lại đoạn video 30 giây thời khắc bạn bước qua camera.

### 2.3. Quy trình nộp đơn giải trình / xin phép trực tuyến
Khi có việc bận, đi công tác hoặc đi muộn vì lý do chính đáng:
1. Tại dòng ngày công cần giải trình (hoặc tại mục **"Giải trình / Xin phép"** $\rightarrow$ bấm **"Tạo đơn mới"**):
2. Chọn **Loại đơn**:
   - **Giải trình đi muộn:** Dành cho trường hợp đến muộn do tắc đường, thời tiết hoặc công việc đột xuất.
   - **Bổ sung giờ quẹt:** Dành cho trường hợp quên quẹt thẻ hoặc camera đang bảo trì.
   - **Xin nghỉ phép:** Dành cho nghỉ phép năm, nghỉ ốm, việc riêng.
   - **Đi công tác:** Dành cho các ngày đi làm việc bên ngoài trụ sở.
3. Chọn ngày áp dụng, nhập **Lý do cụ thể** $\rightarrow$ Bấm **"Gửi đơn"**.
4. Trạng thái đơn sẽ là `Chờ duyệt`. Khi Trưởng phòng hoặc HR duyệt, hệ thống sẽ tự động cập nhật công ngày đó thành hợp lệ.

---

## 3. HƯỚNG DẪN DÀNH CHO LÃNH ĐẠO PHÒNG BAN (TRƯỞNG PHÒNG)

### 3.1. Giám sát quân số và tình hình chấp hành giờ giấc của phòng
1. Nhấp vào mục **"Bảng công hôm nay"**.
2. Hệ thống tự động lọc hiển thị toàn bộ nhân sự thuộc phòng ban của bạn.
3. Các chỉ số thống kê đầu trang:
   - **Có mặt hôm nay:** Số lượng và tỷ lệ % nhân viên đã có mặt.
   - **Đi đúng giờ:** Số nhân viên đến đúng giờ.
   - **Đi muộn:** Số nhân viên đi muộn trong ngày để kịp thời đôn đốc.
   - **Chưa điểm danh:** Số nhân sự chưa thấy xuất hiện trước camera.
4. Bạn có thể gõ tên hoặc mã nhân viên vào thanh tìm kiếm để tra cứu nhanh.

### 3.2. Xét duyệt đơn từ của nhân viên trong phòng
1. Nhấp vào mục **"Giải trình / Xin phép"** trên thanh menu.
2. Danh sách các đơn từ của nhân viên phòng bạn sẽ được liệt kê với bộ lọc: *Chờ duyệt, Đã duyệt, Đã từ chối*.
3. Bấm vào nút **"Xem chi tiết"** trên đơn để đọc lý do:
   - Nếu đồng ý: Bấm nút màu xanh **"Duyệt đơn"**.
   - Nếu không đồng ý: Nhập lý do phản hồi và bấm nút màu đỏ **"Từ chối"**.
4. Ngay khi được duyệt, hệ thống tự động tính lại ngày công cho nhân viên đó.

---

## 4. HƯỚNG DẪN DÀNH CHO QUẢN TRỊ KHU VỰC (`area_admin`)
1. **Bộ chọn khu vực (Area Selector):** Trên thanh Header trên cùng, Quản trị khu vực có thể chọn nhanh giữa các cơ sở/kho xăng dầu mình được phân công quản lý (ví dụ: *Kho Đức Giang, Kho Đỗ Xá, Chi nhánh HGC...*).
2. Khi chuyển khu vực, toàn bộ số liệu Dashboard, nhân sự và camera sẽ tự động lọc tương ứng theo địa bàn đó.

---

## 5. HƯỚNG DẪN DÀNH CHO BỘ PHẬN NHÂN SỰ (HR)

### 5.1. Quản lý Hồ sơ Nhân sự & Đăng ký Khuôn mặt FaceID
1. Vào mục **"Nhân sự" $\rightarrow$ "Quản lý nhân sự"**:
2. **Thêm nhân viên mới:**
   - Bấm nút **"+ Thêm nhân sự"**.
   - Nhập Mã nhân viên (duy nhất, không trùng lặp), Họ và tên, Email, Số điện thoại, Chức vụ.
   - Chọn **Phòng ban**, **Vai trò** (`employee`, `dept_manager`, `area_admin`, `hr`).
   - Chọn **Ca làm việc** riêng (nếu khác ca mặc định của phòng).
   - **Đăng ký FaceID:** Có thể chọn ảnh từ thư viện hoặc chọn từ các khuôn mặt camera vừa nhận diện để gán PersonID của Hanet vào nhân viên.
   - Bấm **"Lưu nhân sự"**.
3. **Cấp lại mật khẩu cho nhân viên:**
   - Tại dòng nhân viên, bấm nút **"Đặt lại mật khẩu"** $\rightarrow$ Hệ thống tự động sinh mật khẩu ngẫu nhiên an toàn và gửi trực tiếp qua email của nhân viên.

### 5.2. Quản lý Phòng ban & Cơ cấu tổ chức
1. Vào mục **"Nhân sự" $\rightarrow$ "Phòng ban"**.
2. Bạn có thể xem danh sách toàn bộ phòng ban, số lượng nhân viên và trưởng phòng tương ứng.
3. Bấm **"+ Thêm phòng ban"** để tạo mới (nếu để trống mã phòng, hệ thống tự động sinh `PB001`, `PB002`...).
4. Có thể đổi trưởng phòng hoặc phân bổ lại nhân sự bất kỳ lúc nào.

### 5.3. Thiết lập Ca làm việc & Lịch nghỉ Lễ, Tết
1. Vào mục **"Nhân sự" $\rightarrow$ "Ca làm việc & Lễ"**:
2. **Cấu hình ca làm việc:**
   - **Giờ bắt đầu làm việc (workStart):** Ví dụ `08:00`.
   - **Giờ tan ca (workEnd):** Ví dụ `17:00`.
   - **Thời gian ân hạn đi muộn (graceMinutes):** Ví dụ `15 phút` (đến trước 08:15 vẫn tính là đúng giờ).
   - **Khoảng cách tối thiểu giữa 2 lần quẹt (minOutGapMinutes):** Ví dụ `30 phút` (tránh việc quẹt liên tục 2 lần bị hiểu nhầm là đã về).
3. **Lịch nghỉ Lễ:**
   - Thiết lập các ngày nghỉ lễ quốc gia hoặc ngày nghỉ đặc thù của doanh nghiệp để hệ thống tự động loại trừ khỏi ngày phải đi làm, tránh báo vắng nhầm.

### 5.4. Quy trình Điều chỉnh giờ công (Audit Trail)
Trong trường hợp nhân viên gặp sự cố kỹ thuật hoặc được lãnh đạo phê duyệt điều chỉnh công sau:
1. Vào bảng công hôm nay hoặc báo cáo tháng $\rightarrow$ Click vào ngày của nhân viên cần điều chỉnh.
2. Bấm nút **"Điều chỉnh"**:
   - Chọn loại điều chỉnh: *Đi đúng giờ, Bổ sung giờ vào, Bổ sung giờ ra, Chuyển thành nghỉ phép, v.v.*
   - **Bắt buộc nhập Lý do điều chỉnh** (tối thiểu 5 ký tự để làm căn cứ kiểm toán).
   - Bấm **"Lưu điều chỉnh"**.
3. Dòng ngày công sẽ có huy hiệu **"Đã điều chỉnh"**, và toàn bộ thông tin người sửa, giờ sửa, lý do được lưu vào **"Nhật ký kiểm toán"**.

### 5.5. Lập Báo cáo Tháng, Xuất Excel & Khóa sổ Điểm danh (Month Lock)
1. Vào mục **"Báo cáo" $\rightarrow$ "Báo cáo tháng"**:
2. Chọn tháng và phòng ban cần xem.
3. Chuyển đổi giữa 2 chế độ:
   - **Tổng hợp:** Xem tóm tắt tổng số ngày công, chuyên cần %, muộn, sớm, vắng.
   - **Chi tiết từng ngày:** Xem ma trận ký hiệu chấm công của từng nhân viên từ ngày 1 đến ngày 31.
4. **Xuất Excel:** Bấm nút **"Xuất Excel"** để tải file `.xlsx` định dạng màu chuẩn doanh nghiệp, phục vụ kế toán chuyển dữ liệu sang bảng lương.
5. **Khóa sổ tháng (Month Lock):**
   - Khi đã chốt lương xong, HR bấm nút **"Khóa sổ tháng"**.
   - Sau khi khóa, không ai (kể cả HR) có thể sửa đổi hay nộp đơn bù cho tháng đó nữa, đảm bảo tính pháp lý và an toàn số liệu.

---

## 6. HƯỚNG DẪN DÀNH CHO QUẢN TRỊ KỸ THUẬT (`ADMIN`)

### 6.1. Cấu hình Kết nối Camera Hanet AI & Webhook
1. Đăng nhập tài khoản `ADMIN`.
2. Vào mục **"Quản trị" $\rightarrow$ "Cấu hình hệ thống"**:
3. Nhập các thông số API do Hanet cung cấp:
   - **Client ID & Client Secret** của ứng dụng đối tác Hanet.
   - **Access Token & Refresh Token**.
   - **Địa điểm (Place IDs):** Chọn các cơ sở Petrolimex cần đồng bộ camera.
4. **Đường dẫn Webhook:** Sao chép đường dẫn Webhook hiển thị trên màn hình và dán vào phần cấu hình Webhook trên trang quản trị nhà phát triển Hanet.

### 6.2. Cấu hình Tài khoản Hanet Connect xem Video thời khắc nhận diện
- Để kích hoạt tính năng xem video phát lại ngay khi quẹt thẻ:
  1. Tại tab cấu hình Hanet, nhập thông tin tài khoản Hanet Connect (Email và Mật khẩu tài khoản xem camera).
  2. Bấm nút **"Kiểm tra kết nối"** $\rightarrow$ Hệ thống sẽ thử đăng nhập và kiểm tra quyền trích xuất video.
  3. Khi báo xanh **"Kết nối thành công"**, tính năng xem video trên toàn hệ thống đã sẵn sàng.

### 6.3. Sao lưu & Phục hồi Cơ sở Dữ liệu
- Cơ sở dữ liệu SQLite nằm tại thư mục `data/attendance.db`.
- Hệ thống tự động tạo bản sao lưu trước mỗi lần thực hiện thao tác xóa nhạy cảm hoặc định kỳ vào thư mục `data/backups/`.
- Quản trị viên có thể tải tệp sao lưu về máy để lưu trữ dự phòng dài hạn.

---

## 7. CÁC CÂU HỎI THƯỜNG GẶP (FAQ) & XỬ LÝ SỰ CỐ

### Q1: Tôi đi làm lúc 07:30 (sớm 30 phút), tại sao hệ thống không ghi "đến sớm 30 phút"?
**Trả lời:** Hệ thống áp dụng quy chuẩn kỷ luật lao động mới: Không theo dõi việc đến sớm hay về muộn. Khi bạn đến trước hoặc đúng giờ làm việc, hệ thống ghi nhận là **Đi đúng giờ** để giao diện luôn tinh gọn và văn minh.

### Q2: Lúc 9:00 sáng tôi kiểm tra thấy trạng thái chưa có giờ ra, có bị coi là vi phạm không?
**Trả lời:** Hoàn toàn không. Ban ngày khi bạn đang trong ca làm việc, hệ thống chỉ kiểm tra giờ vào (đúng giờ hay đi muộn) và hiển thị nhãn phụ *Đang trong giờ làm*. Trạng thái thiếu giờ ra chỉ được xét sau khi ca làm việc đã kết thúc và bạn hoàn toàn không quẹt lúc về.

### Q3: Tôi quên quẹt thẻ lúc ra về thì phải làm sao?
**Trả lời:** Bạn vào mục **"Cá nhân của tôi"**, tìm đến ngày đó và bấm **"Nộp đơn"**, chọn loại đơn **"Bổ sung giờ quẹt"** (Quên quẹt ra), ghi rõ giờ ra thực tế và lý do để Trưởng phòng duyệt.

### Q4: Camera không nhận diện được tôi khi đi qua cổng?
**Trả lời:**
1. Kiểm tra bạn có đứng đúng tầm quét của camera không, tránh cúi đầu quá thấp hoặc bị che khuất bởi người đi trước.
2. Liên hệ phòng Nhân sự (HR) để kiểm tra xem tài khoản của bạn đã được đăng ký khuôn mặt (FaceID) trên hệ thống Hanet hay chưa.
