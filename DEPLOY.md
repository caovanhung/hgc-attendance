# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG ĐIỂM DANH CAMERA HANET AI

Hệ thống được xây dựng theo kiến trúc **Full-stack Node.js (Express) + React (Vite)**, lưu trữ dữ liệu bền vững tại thư mục `data/` và hỗ trợ Webhook nhận diện khuôn mặt theo chuẩn **Hanet Open API**.

---

## 🌟 YÊU CẦU QUAN TRỌNG ĐỐI VỚI CAMERA HANET
Camera AI Hanet gửi sự kiện điểm danh qua giao thức **HTTP POST Webhook**. Do đó, máy chủ của bạn cần:
1. Có **IP tĩnh** hoặc **Tên miền (Domain)** công khai (Public Internet).
2. Có chứng chỉ bảo mật **HTTPS** (Hanet Cloud yêu cầu Webhook gửi qua HTTPS an toàn).
3. Đường dẫn Webhook endpoint: `https://ten-mien-cua-ban.com/api/hanet/webhook`

---

## CÁCH 1: TRIỂN KHAI TRÊN CLOUD MIỄN PHÍ (RENDER / RAILWAY) - NHANH NHẤT (5 PHÚT)
Nếu bạn chưa có VPS và muốn chạy thử nghiệm ngay với Camera Hanet thực tế:

### Dùng Render.com (Miễn phí có sẵn HTTPS):
1. Đăng ký tài khoản tại [https://render.com](https://render.com) (đăng nhập bằng GitHub).
2. Bấm **New +** -> Chọn **Web Service**.
3. Chọn kho lưu trữ GitHub của bạn: `caovanhung/hgc-attendance`.
4. Cấu hình các thông số:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npx tsx server.ts`
   - **Instance Type:** `Free`
5. Bấm **Deploy Web Service**.
6. Sau 2-3 phút, Render sẽ cấp cho bạn một URL HTTPS miễn phí, ví dụ: `https://hgc-attendance.onrender.com`.
7. Webhook Hanet của bạn sẽ là: `https://hgc-attendance.onrender.com/api/hanet/webhook`.

---

## CÁCH 2: TRIỂN KHAI BẰNG DOCKER TRÊN VPS (KHUYÊN DÙNG CHO DOANH NGHIỆP)
Nếu bạn có VPS Ubuntu / Debian đã cài sẵn Docker và Docker Compose:

### Bước 1: Clone mã nguồn về VPS
```bash
git clone https://github.com/caovanhung/hgc-attendance.git
cd hgc-attendance
```

### Bước 2: Khởi chạy bằng Docker Compose
```bash
docker compose up -d --build
```
Hệ thống sẽ tự động build frontend, đóng gói và chạy ứng dụng ở port `3000`. Dữ liệu chấm công được lưu bền vững tại volume `attendance-data`.

Để kiểm tra trạng thái:
```bash
docker ps
docker logs -f hanet-attendance-app
```

---

## CÁCH 3: TRIỂN KHAI TRỰC TIẾP TRÊN VPS UBUNTU VỚI NGINX & PM2

### Bước 1: Cài đặt môi trường trên VPS Ubuntu
```bash
sudo apt update && sudo apt upgrade -y
# Cài đặt Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# Cài đặt công cụ quản lý tiến trình PM2 và tsx
sudo npm install -g pm2 tsx
```

### Bước 2: Tải mã nguồn và cài đặt
```bash
cd /var/www
git clone https://github.com/caovanhung/hgc-attendance.git
cd hgc-attendance
npm install
npm run build
```

### Bước 3: Khởi chạy dịch vụ bằng PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Bước 4: Cấu hình Nginx làm Reverse Proxy và cấp SSL miễn phí
Tạo file cấu hình Nginx:
```bash
sudo nano /etc/nginx/sites-available/attendance
```

Nội dung:
```nginx
server {
    listen 80;
    server_name diemdanh.tenmiencuaban.com; # Thay bằng tên miền của bạn

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Kích hoạt và cài đặt SSL Let's Encrypt:
```bash
sudo ln -s /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Cài đặt chứng chỉ HTTPS miễn phí
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d diemdanh.tenmiencuaban.com
```

---

## CÁCH CẤU HÌNH TRÊN HANET CLOUD (https://developers.hanet.ai)

1. Đăng nhập vào [Hanet Developer Portal](https://developers.hanet.ai/) hoặc mở ứng dụng **Hanet Connect** trên điện thoại.
2. Vào phần **Cài đặt Thiết bị / Webhook**.
3. Điền đường dẫn Webhook:
   ```
   https://ten-mien-cua-ban.com/api/hanet/webhook
   ```
4. Khi nhân viên đứng trước bất kỳ camera Hanet nào được gắn vào tài khoản:
   - Camera nhận diện khuôn mặt.
   - Hanet Cloud gửi gói tin POST đến URL Webhook của bạn.
   - Hệ thống tự động phân loại phòng ban, tính giờ vào, kiểm tra đi muộn (> 08:15) và hiển thị trực tiếp lên bảng chấm công!
