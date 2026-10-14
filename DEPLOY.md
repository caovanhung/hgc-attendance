# Triển khai hệ thống điểm danh Camera Hanet

Ứng dụng Node.js (Express + React). Dữ liệu lưu trong SQLite tại `data/attendance.db`, sao lưu tự động vào `data/backups/`.

## Yêu cầu

- **Node.js ≥ 22.13** (dùng `node:sqlite` có sẵn trong Node). Kiểm tra: `node -v`.
- Tên miền có **HTTPS**: Hanet chỉ gửi webhook qua HTTPS, và cookie đăng nhập dùng cờ `Secure`.
- Chạy **một tiến trình** (PM2 `instances: 1`).
- Không dùng các dịch vụ có ổ đĩa tạm (ví dụ gói Free của Render): dữ liệu sẽ mất mỗi lần deploy lại.

## Cài mới trên VPS Ubuntu (PM2 + nginx)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git
sudo npm install -g pm2

cd /var/www
git clone https://github.com/caovanhung/hgc-attendance.git
cd hgc-attendance
npm install --omit=dev          # dist/ và server.js đã build sẵn trong repo
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

**Ngay sau khi khởi động**, đăng nhập bằng tài khoản mặc định **`ADMIN` / `Admin@123`**; hệ thống bắt đổi mật khẩu ở lần đăng nhập đầu. Mật khẩu mặc định này ai đọc tài liệu cũng biết, nên đừng để server chạy public mà chưa đổi. Muốn tránh hẳn khoảng hở này thì đặt biến môi trường `ADMIN_INITIAL_PASSWORD` (≥ 8 ký tự) trước lần khởi động đầu tiên.

### nginx

```nginx
server {
    listen 80;
    server_name diemdanh.tenmiencuaban.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d diemdanh.tenmiencuaban.com
```

## Docker

```bash
docker compose up -d --build
```

Dữ liệu nằm trong volume `attendance-data`. Đăng nhập `ADMIN` / `Admin@123` và đổi mật khẩu ngay như trên.

## Nâng cấp từ bản cũ (lưu `data/database.json`)

Bản mới **không dùng `data/database.json`** và **không chuyển dữ liệu cũ sang**: toàn bộ dữ liệu trong đó là dữ liệu thử nghiệm. Hệ thống mới bắt đầu trắng, chỉ có tài khoản `ADMIN`.

```bash
cd /var/www/hgc-attendance
pm2 stop hanet-attendance
git checkout -- data/database.json 2>/dev/null   # bỏ thay đổi cục bộ của file thử nghiệm để git pull không bị chặn
git pull                                          # bản mới xóa data/database.json khỏi repo
node -v                                           # phải >= 22.13; nếu chưa thì cài Node 22 như phần trên
npm install --omit=dev
pm2 delete hanet-attendance && pm2 start ecosystem.config.cjs && pm2 save
pm2 logs hanet-attendance --lines 20              # thấy dòng [BOOTSTRAP] Đã tạo tài khoản ADMIN ...
```

Sau đó đăng nhập `ADMIN` / `Admin@123`, đổi mật khẩu, rồi tạo lại phòng ban, nhân sự (mỗi người nhận mật khẩu tạm từ HR) và camera. Cập nhật URL webhook mới (có token) trên Hanet theo phần dưới.

## Nâng cấp lên bản ca làm việc (database v4)

Bản này **tự nâng cấp database v3 lên v4 và giữ nguyên dữ liệu** (khu vực, phòng ban, nhân sự, ngày công, đơn). Server tự sao lưu trước khi nâng cấp vào `data/backups/attendance-pre-migrate-v3.db` (nếu file này đã có từ lần thử trước thì giữ nguyên bản đó; bản này không bao giờ bị tự xóa). **Không xóa database.**

```bash
cd /home/ubuntu/hgc-attendance
pm2 stop hanet-attendance
git pull && npm ci --omit=dev
# Chạy thử nâng cấp trên một bản sao (không đụng database thật, không khởi động server)
cp data/attendance.db /tmp/try-v4.db && MIGRATE_ONLY=1 DB_FILE=/tmp/try-v4.db NODE_ENV=production node server.js
# Phải thấy dòng: [MIGRATE] Chạy thử xong: database v4 — chỉ khi đó mới chạy tiếp
pm2 restart hanet-attendance
pm2 logs hanet-attendance --lines 20 --nostream    # thấy: [MIGRATE] v3 → v4 xong (sao lưu: attendance-pre-migrate-v3.db)
```

Nếu chạy thử báo `[MIGRATE] … thất bại`: **không** `pm2 restart`; gửi dòng log đó cho bộ phận kỹ thuật (database thật chưa bị đụng).

Nếu log của pm2 có `[MIGRATE] Nâng cấp v3 → v4 thất bại …`: chạy ngay `pm2 stop hanet-attendance` (để pm2 không khởi động lại liên tục). Database vẫn là v3, không mất gì; gửi dòng log đó cho bộ phận kỹ thuật và chạy lại bản cũ bằng `git checkout <commit cũ> && npm ci --omit=dev && pm2 restart hanet-attendance`.

Sau khi nâng cấp (tài khoản HR toàn hệ thống):

1. Tab **Ca làm việc** → thẻ **Ca mặc định công ty**: kiểm tra giờ vào/ra, **ngày làm trong tuần** (mặc định T2–T6), ngưỡng đi sớm (15') và cho phép về sớm (10').
2. Mục **Ngày lễ**: nhập các ngày lễ của năm (1/1, Tết, 30/4, 1/5, 2/9…).
3. Khu cần giờ riêng (cửa hàng, kho): **Thêm ca** cho khu đó, rồi tab **Phòng ban** → Sửa → chọn **Ca làm việc**.
4. Người làm giờ riêng: tab **Nhân sự** → Sửa → **Ca riêng**.

## Kiểm tra sau khi nâng cấp v4 (trên host)

- [ ] Log có `[MIGRATE] v3 → v4 xong`; khu vực, phòng ban, nhân sự, ngày công cũ còn nguyên.
- [ ] Một nhân viên không quẹt cả ngày làm việc ⇒ sau giờ ra của ca (tối đa 15 phút) bảng công hiện **Vắng**.
- [ ] Người quẹt giữa giờ chiều: trước giờ ra bảng công hiện "Lần quẹt gần nhất HH:mm", không bị gắn về sớm; sau giờ ra mới hiện về sớm (nếu ra sớm quá 10 phút).
- [ ] Đơn nghỉ phép 2 ngày làm việc được duyệt ⇒ hai ngày đó hiện **Nghỉ phép**; cuối tuần trong khoảng không bị đánh dấu.
- [ ] Quản trị khu thêm ca cho khu mình và gán cho một phòng; không thấy ca của khu khác.

## Nâng cấp lên bản khu vực và tài khoản email (database v3)

Bản này đổi cấu trúc database và **không chuyển dữ liệu cũ** (server in `[STARTUP] Database phiên bản cũ (v2). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` rồi dừng). Bản này thêm thư viện gửi thư nên **phải chạy `npm install`**.

```bash
cd /home/ubuntu/hgc-attendance
pm2 stop hanet-attendance
mkdir -p ~/hgc-backup && cp data/attendance.db* ~/hgc-backup/   # chép cả file -wal/-shm (dữ liệu chưa ghi hết vào file chính)
git pull && npm install --omit=dev
rm -f data/attendance.db data/attendance.db-wal data/attendance.db-shm
pm2 restart hanet-attendance
pm2 logs hanet-attendance --lines 20 --nostream    # thấy [BOOTSTRAP] Đã tạo tài khoản ADMIN ...
```

Sau khi khởi động (đăng nhập `ADMIN` / `Admin@123`, đổi mật khẩu):

1. **Cấu hình › Gửi thư**: bấm **Dùng Gmail**, nhập tài khoản Gmail và **mật khẩu ứng dụng** (Google Account → Bảo mật → Xác minh 2 bước → Mật khẩu ứng dụng), email người gửi, **địa chỉ web** `https://petrolimex.hgcvn.cloud` → **Lưu** → **Gửi thư thử** tới hộp thư của bạn.
2. **Cấu hình**: nhập lại kết nối Camera AI (Client ID, Client Secret, Refresh Token → Lưu → Kiểm tra kết nối → chọn địa điểm → Lưu), tài khoản xem video (Kiểm tra), chép **URL webhook mới** dán lên Camera AI.
3. **Khu vực**: tạo các khu (ví dụ Trụ sở 26 Đức Giang, Tổng kho Đức Giang).
4. **Phòng ban**: tạo phòng ban, chọn khu cho từng phòng.
5. **Camera**: **Nhập camera từ Camera AI**, rồi gán khu cho từng camera (tab Khu vực hoặc Sửa camera).
6. **Nhân sự**: thêm từng người (email + điện thoại bắt buộc; mật khẩu tự gửi qua email), hoặc **Nhập từ file CSV** (tải file mẫu), hoặc **Nhập từ Camera AI** (người nhập theo cách này chưa có email: bấm Sửa để bổ sung email và điện thoại — hệ thống tự gửi mật khẩu). Người đã có trên Camera AI: dùng Nhập từ Camera AI trước (giữ đúng mã cũ), rồi mới thêm người mới.
7. Cấp quyền: Sửa nhân sự → Vai trò **Quản trị khu vực** → tích các khu được giao. Vai trò **HR toàn hệ thống** chỉ tài khoản `ADMIN` cấp được.

## Kiểm tra sau khi nâng cấp v3 (trên host)

- [ ] Gửi thư thử tới Gmail của bạn và nhận được.
- [ ] Thêm một nhân sự thật → thư "Tài khoản đăng nhập của bạn" tới hộp Gmail → đăng nhập bằng **email** với mật khẩu tạm → bị yêu cầu đổi mật khẩu.
- [ ] Đăng xuất → **Quên mật khẩu?** → nhận link → đặt mật khẩu mới → đăng nhập được; dùng lại link lần hai báo hết hạn.
- [ ] Nhập file CSV 3 dòng (1 dòng cố ý sai email) → xem trước báo đúng dòng lỗi → tạo 2 người → 2 thư được gửi.
- [ ] Quản trị khu A đăng nhập: chỉ thấy nhân sự, phòng ban, camera, bảng công, đơn của khu A; không thấy tab Khu vực, Cấu hình.
- [ ] HR toàn hệ thống mở tab Cấu hình: thấy ở chế độ chỉ đọc, không thấy token webhook đầy đủ; sửa được giờ làm việc.

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
5. Tab **Nhân sự** → **Nhập từ Hanet** để tạo nhân sự từ những người đã có trên Hanet (mỗi lần nhập tối đa 100 người; đông hơn thì nhập nhiều lần); người mới thì **Thêm nhân sự → Lấy từ camera**.
6. Tab **Cấu hình** → thẻ **Tài khoản xem video**: nhập email và mật khẩu tài khoản Hanet Connect (nên là tài khoản riêng chỉ có quyền xem) → **Lưu** → **Kiểm tra**, phải báo đăng nhập thành công.

## Kiểm tra sau khi nâng cấp (trên host)

- [ ] Kiểm tra kết nối báo đúng tài khoản và địa điểm HRINTER.
- [ ] Nhập camera C21272C952, thấy chấm xanh (online) sau tối đa 5 phút hoặc khi bấm **Làm mới trạng thái**.
- [ ] Nhập "Dương Đức Văn" từ Hanet; người này quẹt mặt thì bảng công có dòng của họ.
- [ ] Một người chưa đăng ký đứng trước camera → **Thêm nhân sự → Lấy từ camera** → chọn ảnh người lạ → **Tạo nhân sự** → thông báo "FaceID: Đã đăng ký FaceID trên Hanet". Người đó đứng lại trước camera và được chấm công. Nếu báo lỗi ảnh (ví dụ kích thước), ghi lại thông báo để xử lý ở bản sau.
- [ ] Tạo phòng ban trên web, thấy phòng ban đó trên app Hanet; xếp người thử vào phòng.
- [ ] Bảng công → chi tiết lượt quẹt → **Xem video lúc này** mở popup phát video ngay trên web: đúng camera C21272C952, tự tua đến đúng lúc quẹt; nút **◀ Đoạn trước** / **Đoạn sau ▶** chuyển được sang đoạn liền kề.
- [ ] Xóa người thử bằng tài khoản ADMIN; người đó biến mất khỏi Hanet. Tab **Cấu hình › Đồng bộ Hanet** không còn việc lỗi.

## Cấu hình webhook trên Hanet

1. Đăng nhập bằng tài khoản HR → tab **Cấu hình** → sao chép **URL webhook** (dạng `https://<tên miền>/api/hanet/webhook/<token>`).
2. Dán URL vào phần cấu hình webhook trên Hanet (Hanet Developer / Hanet Connect).
3. Mã nhân viên trong hệ thống phải trùng **aliasID** của người đó trên Hanet. Có thể nhập thêm Hanet Person ID ở tab Nhân sự.
4. Nếu nghi URL bị lộ: bấm **Tạo token mới** rồi cập nhật lại URL trên Hanet.

Đối soát (tùy chọn): nhập Client ID, Client Secret, Refresh Token và Place ID ở tab Cấu hình. Hệ thống sẽ kéo lịch sử điểm danh từ Hanet mỗi 15 phút để bù các lượt webhook bị lỡ.

## Sao lưu

- Tự động lúc 02:00 hằng ngày vào `data/backups/attendance-YYYY-MM-DD.db`, giữ 30 bản. Có bản sao lưu riêng trước mỗi lần xóa dữ liệu, xóa nhân sự hoặc xóa phòng ban (chỉ tài khoản `ADMIN` được xóa nhân sự, phòng ban).
- Nên chép định kỳ ra ngoài VPS, ví dụ thêm vào crontab:

```bash
30 2 * * * rsync -a /var/www/hgc-attendance/data/backups/ backup@may-khac:/srv/hgc-backups/
```

- Khôi phục: `pm2 stop hanet-attendance`, chép bản sao lưu đè lên `data/attendance.db` (xóa `attendance.db-wal`, `attendance.db-shm` nếu có), rồi `pm2 start hanet-attendance`.

## Kiểm tra sức khỏe

`curl https://<tên miền>/api/health` → `{"ok":true}`.
