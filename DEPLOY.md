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
