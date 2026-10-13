# Tích hợp API Hanet: camera, nhân sự, FaceID, phòng ban

Ngày: 2026-10-13 · Trạng thái: chờ duyệt · Nền tảng: `docs/superpowers/specs/2026-10-13-foundation-hardening-design.md` (đã triển khai)

## 1. Mục tiêu

HR làm mọi việc quản lý trên web Petrolimex Attendance; hệ thống tự đẩy sang Hanet. App Hanet chỉ còn dùng để xem video.

Thành công nghĩa là HR có thể, không mở app Hanet:

1. Kiểm tra kết nối Hanet và chọn địa điểm từ danh sách.
2. Nhập camera từ Hanet, thấy camera nào online/offline, đổi tên camera.
3. Nhập hàng loạt người đã có trên Hanet thành nhân sự.
4. Đăng ký FaceID cho người mới bằng ảnh camera Hanet vừa chụp người đó (người lạ), rồi người đó được chấm công từ lượt quẹt sau.
5. Đổi ảnh nhận diện của một nhân sự bằng một lượt camera chụp gần đây.
6. Tạo, sửa, xóa nhân sự và phòng ban trên web, thay đổi tự sang Hanet; lỗi đồng bộ hiện rõ và thử lại được.
7. Từ một lượt quẹt trong bảng công, bấm một nút để mở trang xem lại video của đúng camera, đúng ngày trên Hanet Connect.

## 2. Quyết định đã chốt với người dùng

| Câu hỏi | Quyết định |
|---|---|
| Nguồn dữ liệu chính | **Web**. Hanet nhận thay đổi từ web. Nhập từ Hanet chỉ là thao tác một lần do HR bấm |
| Ảnh đăng ký FaceID | **Lấy từ camera Hanet** (ảnh `detected_image_url` trong webhook), không tải file, không webcam |
| Phòng ban | **Đồng bộ lên Hanet** |
| Số địa điểm | **Một** |
| Xem video | **Không dùng API nội bộ của Hanet Connect.** Chỉ mở trang xem lại của Hanet Connect bằng liên kết (§6.8); HR tự đăng nhập Hanet Connect |
| Cách đồng bộ | **B**: lưu trên web trước, đẩy sang Hanet ngay sau đó, lỗi thì vào hàng đợi thử lại. Riêng FaceID chạy ngay (đồng bộ) để báo lỗi ảnh |
| Dữ liệu cũ | **Không viết migration.** Đổi schema trực tiếp; khi deploy được xóa `data/attendance.db` (sao lưu trước) |

## 3. Kiểm kê API Hanet (58 API, tài liệu Postman `13088306/TVeqcn2C`)

Mã trả về: `returnCode = 1` là thành công. Mã lỗi quan trọng: `-1` dữ liệu vào sai, `-103` token hết hạn, `-2035` không có quyền, `-503` lỗi hệ thống, `-101/-102` thiết bị không có/offline, `-9005` người đã tồn tại, `-9006` ảnh không đạt, `-9007` ảnh trùng, `-9008` hết lượt FaceID miễn phí, `-5010` ảnh không hợp lệ, `-5011` không tìm thấy người, `-1005` không tìm thấy địa điểm.

Địa chỉ API (`CAMERA_BASE_URL`) không có trong tài liệu; giữ cấu hình `hanet.api_base`, mặc định `https://partner.hanet.ai` (đang chạy được trên host: đối soát thành công).

| API | Dùng | Ghi chú |
|---|---|---|
| `oauth /token` | Có (đã có) | Làm mới token khi gặp `-103` |
| `profile/getProfile` | **Có** | Nút Kiểm tra kết nối |
| `place/getPlaces`, `getPlaceInfo` | **Có** | Chọn địa điểm |
| `place/addPlace`, `updatePlace`, `removePlace` | Không | Làm trên app Hanet |
| `partner/updateToken`, `addPlacePartner`, `removePlacePartner`, `getListUserPartner`, `removeUserPartner` | Không | Một tài khoản, một địa điểm: không cần phân luồng webhook |
| `device/getListDeviceByPlace` | **Có** | Nhập camera |
| `device/getConnectionStatus` | **Có** | Online/offline, 5 phút một lần |
| `device/updateDevice` | **Có** | Đổi tên camera |
| `device/getDeviceInfo`, `getListDevice` | Không | `ByPlace` đủ dùng |
| `device/setDeviceMQTT` | Không | Đã có webhook |
| `person/getListByPlace` | **Có** | Nhập nhân sự từ Hanet (phân trang `page`, `size`) |
| `person/getUserInfoByAliasID` | **Có** | Lấy `personID` sau khi đăng ký |
| `person/getUserInfoByPersonID`, `getListByAliasID(AllPlace)`, `getTotalPersonByPlaceID` | Không | Không cần cho luồng nào |
| `person/registerByUrl` | **Có** | Đăng ký FaceID bằng ảnh camera (xem §6.4) |
| `person/register` (multipart) | Dự phòng | Chỉ dùng nếu spike cho thấy cần xử lý ảnh (§6.4) |
| `person/updateByFaceUrlByAliasID` | **Có** | Đổi ảnh nhận diện |
| `person/updateByFaceImage*` | Dự phòng | Như `register` |
| `person/updateInfo` | **Có** | Đồng bộ họ tên, chức danh |
| `person/updateAliasID` | **Có** | Gán mã nhân viên cho người đăng ký từ app Hanet |
| `person/removeByPlace` | **Có** | Xóa khuôn mặt khi xóa nhân sự |
| `person/remove`, `removePersonByID`, `removePersonByListAliasID` | Không | `removeByPlace` đủ, đúng phạm vi một địa điểm |
| `person/removeAllPersonInPlace` | **Cấm** | Phá hủy toàn bộ |
| `person/takeFacePicture` | Dự phòng | Chỉ khi ảnh webhook không đăng ký được (§6.4) |
| `person/getCheckinByPlaceIdInTimestamp` | Có (đã có) | Đối soát 15 phút |
| `person/getCheckinByPlaceIdInDay`, `getTotalCheckin*` | Không | Đã có bản theo timestamp |
| `department/list` | **Có** | Liên kết phòng ban trùng tên |
| `department/create`, `update`, `remove` | **Có** | Đồng bộ phòng ban |
| `department/add-person`, `remove-person` | **Có** | Đồng bộ thành viên |
| `department/list-person` | Không | Web là nguồn chính |

## 4. Kiến trúc

```
web (HR) ──► route Express ──► DB (users, departments, cameras)   [lưu ngay, trả ngay]
                         └──► sync_jobs (hàng đợi) ──► worker ──► hanet-api.ts ──► Hanet
FaceID:  route ──► hanet-api.ts ──► Hanet  (chạy ngay, trả kết quả cho HR)
webhook Hanet ──► ingest: khớp nhân sự → detections ; không khớp → face_sightings
```

Module:

- `server/hanet-api.ts` (mở rộng): `callApi(path, params)` dùng chung; thêm hằng `HANET_TIMEOUT_MS = 15000` (dùng `AbortSignal.timeout`); hàm `describeHanetError(code)` trả câu tiếng Việt; các hàm mỏng cho từng API ở §3.
- `server/hanet-sync.ts` (mới): hàng đợi `sync_jobs`, `enqueue`, `runDueJobs`, các handler theo `op`.
- `server/hanet-face.ts` (mới): đăng ký/đổi FaceID (chạy ngay).
- `server/sightings.ts` (mới): ghi, truy vấn, dọn `face_sightings`.
- `server/routes/hanet.ts`, `users.ts`, `departments.ts`, `cameras.ts`: thêm API ở §7.
- `server/jobs.ts`: thêm `sync` (mỗi phút), `camera-status` (5 phút), `purge-sightings` (mỗi giờ).

## 5. Dữ liệu (schema v2, không migration)

`SCHEMA_VERSION = 2`. Khi mở DB có `schema_version` khác 2: in lỗi `[STARTUP] Database phiên bản cũ (v1). Sao lưu rồi xóa data/attendance.db để hệ thống tạo mới.` và thoát mã 1 (không tự xóa).

Thay đổi:

```sql
-- users: thêm
hanet_sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (hanet_sync_status IN ('synced','pending','error')),
hanet_sync_error  TEXT,
face_error        TEXT,          -- lý do đăng ký FaceID thất bại gần nhất; NULL nếu ổn
-- face_registered giữ nguyên, nay do hệ thống đặt (= đã có personID trên Hanet), HR không tick tay

-- departments: thêm
hanet_department_id TEXT,
hanet_sync_status   TEXT NOT NULL DEFAULT 'synced' CHECK (hanet_sync_status IN ('synced','pending','error')),
hanet_sync_error    TEXT,

-- cameras: thêm
online            INTEGER,       -- NULL = chưa kiểm tra
status_checked_at INTEGER,

CREATE TABLE sync_jobs (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user','department','camera')),
  entity_id   TEXT NOT NULL,     -- không có khóa ngoại: việc xóa phải sống sau khi bản ghi đã bị xóa
  op          TEXT NOT NULL,     -- xem §6.2
  payload     TEXT NOT NULL,     -- JSON, đủ dữ liệu để chạy kể cả khi bản ghi đã xóa
  status      TEXT NOT NULL CHECK (status IN ('pending','error','done')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL,
  last_error  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_sync_due ON sync_jobs(status, next_run_at);
CREATE INDEX idx_sync_entity ON sync_jobs(entity_type, entity_id, id);

CREATE TABLE face_sightings (
  id INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('stranger','unlinked')), -- unlinked = có trên Hanet, chưa có trên web
  person_id   TEXT,
  alias_id    TEXT,
  person_name TEXT,
  device_id   TEXT NOT NULL,
  device_name TEXT,
  ts          INTEGER NOT NULL,
  image_url   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_sightings_ts ON face_sightings(ts);
```

Bản ghi `done` trong `sync_jobs` xóa sau 7 ngày (job `purge-sightings` dọn luôn). `face_sightings` xóa sau 24 giờ.

## 6. Hành vi

### 6.1 Webhook

- Lượt khớp nhân sự: như hiện tại (ghi `detections`).
- `personType = 2` (người lạ), có `detected_image_url`: ghi `face_sightings(kind='stranger')`, nhật ký webhook ghi `ignored` với lời nhắn "Người lạ". Hiện tại các lượt này bị `parseCheckin` trả null và ghi "Không phải sự kiện nhận diện"; sửa để nhận dạng được.
- `personType = 0`, có `personID`/`aliasID` nhưng không khớp nhân sự: ghi `face_sightings(kind='unlinked')`.
- Lượt không có ảnh: không ghi sighting.
- `personType = 1` (khách hàng): bỏ qua như hiện tại.
- Thay API `GET /api/hanet/recent-faces` (đọc `webhook_logs`) bằng `GET /api/hanet/sightings` (đọc `face_sightings`). Nhật ký webhook giữ nguyên giới hạn 500 dòng.

### 6.2 Hàng đợi đồng bộ

`op` và API Hanet:

| entity | op | Khi nào | API | Payload |
|---|---|---|---|---|
| user | `user.info` | sửa họ tên/chức vụ | `person/updateInfo` (aliasID = mã NV) | `{code, name, title}` |
| user | `user.department` | đổi phòng ban | `department/remove-person` (phòng cũ) rồi `add-person` (phòng mới) | `{personId, fromHanetDeptId, toDepartmentId}` |
| user | `user.alias` | nhập người chưa có aliasID | `person/updateAliasID` | `{personId, code}` |
| user | `user.remove` | xóa nhân sự | `person/removeByPlace` | `{code, personId}` |
| department | `dept.create` | tạo phòng | `department/list` (tìm trùng tên) → `create` nếu không có | `{name, desc}` |
| department | `dept.update` | sửa tên/mô tả | `department/update` | `{hanetDepartmentId, name, desc}` |
| department | `dept.remove` | xóa phòng | `department/remove` | `{hanetDepartmentId}` |
| camera | `camera.rename` | đổi tên | `device/updateDevice` | `{deviceId, name}` |

Quy tắc:

- **Ghi việc trong cùng transaction** với thay đổi trên web; sau commit gọi `runEntity(entity)` không chờ (fire-and-forget) để thử ngay.
- **Tuần tự theo đối tượng:** chỉ chạy việc có `id` nhỏ nhất còn `pending` của mỗi `(entity_type, entity_id)`. Việc sau chờ việc trước xong.
- **Gộp:** khi thêm `user.info`/`dept.update`/`camera.rename` mà đã có việc cùng loại đang `pending` chưa chạy của cùng đối tượng, thay payload thay vì thêm việc mới.
- **Xóa thắng:** khi thêm `user.remove`/`dept.remove`, xóa các việc `pending` khác của đối tượng đó. Nếu đối tượng chưa từng lên Hanet (user không có `personId` và không có FaceID; phòng không có `hanetDepartmentId`) thì không thêm việc xóa.
- **Phụ thuộc:** `user.department` cần `personId` và phòng đích có `hanetDepartmentId`. Thiếu thì việc hoãn (không tính lần thử, `next_run_at` +5 phút, `last_error` "Chờ FaceID/chờ phòng ban đồng bộ"). Khi user có FaceID hoặc phòng có ID, xếp lại việc này.
- **Thử lại:** lỗi tạm (mạng, timeout, HTTP 5xx, `-503`) thì `attempts+1`, chờ 1, 2, 5, 15 phút rồi 60 phút mỗi lần; quá 20 lần thì `status='error'`. Lỗi vĩnh viễn (`-1`, `-2035`, `-5011` khi sửa, `-1005`, `-101`) thì `error` ngay. `-5011` khi xóa coi như thành công.
- **Chưa cấu hình Hanet** (thiếu client id/secret/refresh token hoặc địa điểm): việc giữ `pending`, không tính lần thử. Lưu cấu hình xong thì worker chạy ngay.
- **Trạng thái đối tượng:** sau mỗi lần chạy, `hanet_sync_status` = `error` nếu có việc `error`, `pending` nếu có việc `pending`, ngược lại `synced`; `hanet_sync_error` = `last_error` gần nhất.
- **Worker:** job `sync` mỗi phút chạy tối đa 50 việc đến hạn; một worker tại một thời điểm (cờ `running` sẵn có trong `jobs.ts`).

### 6.3 Nhập từ Hanet

- `GET /api/hanet/persons/unlinked`: gọi `person/getListByPlace` (`type=0`, duyệt hết trang, `size=100`), bỏ người có `aliasID` trùng mã NV hoặc `personID` trùng `hanet_person_id` đã có. Trả `{personId, aliasId, name, avatar, title}`.
- `POST /api/users/import` `{persons:[{personId}], departmentId?}` (HR): server tra lại danh sách từ Hanet (không tin dữ liệu client), với mỗi người:
  - `aliasID` hợp lệ theo `CODE_RE` và chưa có → mã NV = aliasID.
  - Ngược lại → mã NV = `NV` + số tự tăng 4 chữ số (`NV0001`...), và thêm việc `user.alias`.
  - Tạo user `face_registered=1`, `hanet_person_id`, mật khẩu tạm, `role=employee`; nếu có `departmentId` thì thêm `user.department`.
  - Trả danh sách `{code, name, tempPassword}` để HR phát mật khẩu (hiện một lần, có nút tải CSV).
- Nhập camera `POST /api/cameras/import` (HR): `device/getListDeviceByPlace`, thêm camera có `deviceID` chưa có (tên = `deviceName`), trả số đã thêm.

### 6.4 FaceID từ ảnh camera (chạy ngay)

- Tạo nhân sự kèm `sightingId` (`POST /api/users` có thêm trường) hoặc `POST /api/users/:id/face {sightingId | detectionId}`:
  1. Lưu nhân sự trên web (nếu là tạo mới), commit.
  2. Gọi `person/registerByUrl {name, aliasID: code, placeID, url: image_url, title: position, type: 0}`.
  3. Thành công → `person/getUserInfoByAliasID` lấy `personID` → lưu `hanet_person_id`, `face_registered=1`, `face_error=NULL`; xóa sighting đã dùng; xếp lại các việc đang chờ FaceID.
  4. `-9005` (mã đã là aliasID của người khác trên Hanet) → báo lỗi, **không** tự liên kết (tránh chấm công/xóa nhầm người thật); HR dùng "Nhập từ Hanet" hoặc đổi mã.
  5. `-9006/-9007/-5010/-909/-9002` → `face_error` = lý do; nhân sự vẫn tồn tại, nhãn "Chưa có FaceID".
  6. `-9008` → `face_error` "Địa điểm đã hết số khuôn mặt miễn phí, cần mua gói cloud Hanet".
  7. Đổi ảnh khi người đã có FaceID: `person/updateByFaceUrlByAliasID` thay cho bước 2.
- Phản hồi API: `{user, tempPassword?, face: {ok: boolean, message}}`.
- Ảnh hợp lệ để chọn: `face_sightings` (người lạ) hoặc `detections.image_url` của chính người đó trong 24 giờ.

**Cổng spike (làm trước mọi task khác):** ảnh webhook là ảnh cắt khuôn mặt (đo được 452×664 và 200×428), trong khi tài liệu ghi ảnh đăng ký phải 1280×736. Chạy `hanet-spike.mjs --register` trên host:

- `registerByUrl` với URL gốc thành công → dùng nguyên §6.4.
- Thất bại do kích thước/định dạng → server tải ảnh, đặt vào giữa khung 1280×736 nền xám (thư viện `jimp`, thuần JS, không phụ thuộc native), gửi `person/register` multipart; tương tự `updateByFaceImageByAliasID`. Spec được cập nhật phần này trước khi viết plan.
- Cả hai thất bại → dừng, bàn lại với người dùng (`takeFacePicture`, hỏi Hanet).

### 6.5 Phòng ban

- Tạo/sửa/xóa trên web thêm `dept.create`/`dept.update`/`dept.remove`.
- `dept.create` tìm phòng trùng tên (không phân biệt hoa thường, bỏ khoảng trắng hai đầu) bằng `department/list` (`keyword` = tên) trước; có thì liên kết, không tạo trùng.
- Xóa phòng trên web: thành viên về "chưa có phòng" (như hiện tại); trên Hanet, `department/remove` (Hanet tự bỏ liên kết thành viên).

### 6.6 Camera

- Job `camera-status` mỗi 5 phút (và nút làm mới `POST /api/cameras/refresh-status`): `getConnectionStatus` cho mọi `device_key`; lưu `online`, `status_checked_at`. Thiết bị không có trong kết quả → `online=0`.
- `PUT /api/cameras/:id {name, location, ipAddress}` (HR): lưu; đổi `name` thì thêm `camera.rename`.

### 6.7 Kết nối

- `POST /api/hanet/test-connection` (HR): `profile/getProfile` + `place/getPlaces`; trả `{ok, account, places:[{id,name,address}], message}`. Lỗi trả `ok:false` với câu tiếng Việt, không 500.
- Cấu hình địa điểm: `PUT /api/hanet/config {placeId}` (một số). Giữ khóa `hanet.place_ids` dạng mảng một phần tử để đối soát không đổi.

### 6.8 Nút "Xem video lúc này"

Đã khảo sát trang xem lại video của Hanet Connect (13/10/2026): danh sách đoạn ghi (~58 giây, theo chuyển động) do server Next.js của Hanet dựng sẵn; phát một đoạn thì trình duyệt gọi `POST connect.hanet.ai/api/video/get` bằng cookie phiên HttpOnly, nhận link MP4 ký sẵn trên `vcdn-z-video.hanet.ai` hạn 1 giờ. Đây là API nội bộ, không có trong tài liệu đối tác, cần phiên đăng nhập tài khoản chủ, nên **không tích hợp**. Thay vào đó:

- Mỗi lượt quẹt trong chi tiết ngày công có nút **Xem video lúc này**, mở tab mới tới
  `https://connect.hanet.ai/{placeId}/video?id_device={deviceId}&day={YYYY-MM-DD}`
  - `placeId`: địa điểm đang cấu hình (`hanet.place_ids[0]`).
  - `deviceId`: `detections.device_id` của lượt quẹt.
  - `day`: ngày giờ Việt Nam của lượt quẹt (`work_date`), không phải ngày UTC.
- Nhãn phụ dưới nút: "Mở Hanet Connect, chọn đoạn gần {HH:mm}" (trang Hanet không nhận tham số giờ, nên HR tự chọn đoạn ghi gần giờ quẹt).
- Server dựng link, trả trong trường `videoUrl` của từng `Detection` ở `GET /api/attendance/:userId/:date/detections`; `null` khi người xem không phải HR/Trưởng phòng, khi chưa cấu hình địa điểm, hoặc khi lượt quẹt có nguồn `simulator`.
- Gốc địa chỉ `https://connect.hanet.ai` là hằng `HANET_CONNECT_BASE` trong `server/hanet.ts`, để Hanet đổi đường dẫn thì chỉ sửa một chỗ.
- Liên kết mở bằng `target="_blank" rel="noopener noreferrer"`. Không gửi kèm thông tin đăng nhập nào; nếu HR chưa đăng nhập Hanet Connect, Hanet tự hiện trang đăng nhập.

## 7. API mới / đổi (tất cả yêu cầu đăng nhập)

| Method | Đường dẫn | Quyền |
|---|---|---|
| POST | `/api/hanet/test-connection` | HR |
| GET | `/api/hanet/sightings?kind=stranger\|unlinked` | HR |
| GET | `/api/hanet/persons/unlinked` | HR |
| GET | `/api/hanet/sync` (tổng số pending/error + 50 việc lỗi gần nhất) | HR |
| POST | `/api/hanet/sync/retry` `{jobId?}` (không có = mọi việc lỗi) | HR |
| POST | `/api/users/import` | HR |
| POST | `/api/users/:id/face` | HR |
| POST | `/api/users` (thêm `sightingId?`) | HR |
| POST | `/api/cameras/import` | HR |
| PUT | `/api/cameras/:id` | HR |
| POST | `/api/cameras/refresh-status` | HR |
| DELETE | `/api/users/:id`, `/api/departments/:id` | chỉ `ADMIN` (như hiện tại), thêm việc xóa trên Hanet |
| — | Bỏ `GET /api/hanet/recent-faces` | — |

`Detection` thêm `videoUrl: string | null` (§6.8). `User` thêm `hanetSyncStatus`, `hanetSyncError`, `faceError`; `Department` thêm `hanetSyncStatus`, `hanetSyncError`; `Camera` thêm `online: boolean | null`, `statusCheckedAt`.

## 8. Giao diện

- **Cấu hình › Kết nối Hanet:** ô chọn Địa điểm (nạp từ `test-connection`), nút Kiểm tra kết nối, dòng "Đang chờ: n · Lỗi: m" + nút Đồng bộ lại tất cả, danh sách việc lỗi (đối tượng, thao tác, lý do, nút thử lại). Bỏ ô gõ tay Place ID.
- **Camera:** chấm xanh/đỏ/xám (online/offline/chưa kiểm tra) + giờ kiểm tra; nút Nhập camera từ Hanet; nút Sửa.
- **Nhân sự:** nhãn FaceID (Đã có / Chưa có + lý do), nhãn đồng bộ (Đã đồng bộ / Đang chờ / Lỗi + lý do + Đồng bộ lại); nút Nhập từ Hanet (danh sách có ảnh, tick chọn, chọn phòng ban chung, bảng mật khẩu tạm + tải CSV).
- **Form Thêm nhân sự › Lấy từ camera:** hai nhóm "Người lạ" (ảnh lớn; chọn = dùng ảnh này đăng ký FaceID khi Tạo) và "Đã có trên Hanet" (chọn = liên kết, như hiện tại). Khoảng thời gian 30 phút, nút làm mới. Bỏ ô tick "Đã đăng ký khuôn mặt".
- **Form Sửa nhân sự › Ảnh nhận diện:** lượt camera chụp người này trong 24 giờ + người lạ 30 phút; chọn → Cập nhật FaceID; hiện kết quả.
- **Phòng ban:** nhãn đồng bộ trên mỗi thẻ.
- **Bảng công › chi tiết lượt quẹt:** mỗi lượt có nút **Xem video lúc này** (biểu tượng video) kèm nhãn "Mở Hanet Connect, chọn đoạn gần HH:mm"; ẩn khi `videoUrl` là `null`.
- Các nút cần Hanet bị vô hiệu kèm chú thích khi chưa cấu hình.

## 9. Lỗi và trường hợp biên (bổ sung §6)

- Mọi lời gọi Hanet: timeout 15 giây; `-103` làm mới token và gọi lại một lần; làm mới hỏng → mọi việc đến hạn được ghi lỗi "Kết nối Hanet hỏng, kiểm tra Client ID/Secret/Refresh Token" (lỗi tạm, vẫn thử lại), và `test-connection` báo đỏ.
- Đổi địa điểm trong cấu hình khi đã có dữ liệu đồng bộ: cho phép, kèm cảnh báo trên giao diện "Nhân sự và phòng ban đã đồng bộ với địa điểm cũ sẽ không tự chuyển"; không tự di chuyển dữ liệu.
- Ảnh trên CDN Hanet không còn tải được: Hanet trả lỗi ảnh → `face_error` "Ảnh không còn truy cập được, chọn lượt chụp mới hơn".
- Hai HR cùng đăng ký FaceID cho một người: lần sau thấy nhân sự đã có FaceID nên đi nhánh cập nhật ảnh, không nhận `-9005`.
- Không log token, client secret; log lỗi đồng bộ dạng `[SYNC] op=... entity=... code=...`.

## 10. Kiểm thử

- Hanet giả: một `fetch` giả nhận theo đường dẫn, trả kịch bản; kiểm tra tham số đã gửi.
- `hanet-sync`: thứ tự theo đối tượng; gộp; xóa thắng; phụ thuộc hoãn không tính lần thử; lịch thử lại; dừng sau 20 lần; lỗi vĩnh viễn; `-5011` khi xóa = thành công; chưa cấu hình giữ pending; retry đưa về pending; trạng thái đối tượng cập nhật đúng.
- Webhook: người lạ có ảnh → sighting `stranger`; người Hanet chưa liên kết → `unlinked`; không ảnh → không ghi; dọn sau 24 giờ.
- FaceID: thành công lưu personID; `-9005` báo lỗi, không liên kết; `-9006` giữ nhân sự với `face_error`; `-9008`; đổi ảnh dùng `updateByFaceUrlByAliasID`.
- Nhập: bỏ người đã có; aliasID không hợp lệ → mã `NV0001` + việc `user.alias`; server không tin dữ liệu client.
- Camera: nhập không trùng; trạng thái online; đổi tên tạo việc.
- Link video: HR và Trưởng phòng nhận `videoUrl` đúng định dạng (place, device, ngày giờ VN; lượt 00:30 giờ VN thuộc đúng ngày VN dù chạy `TZ=UTC`); nhân viên nhận `null`; chưa cấu hình địa điểm → `null`; lượt `simulator` → `null`.
- Phân quyền: thêm mọi API mới vào ma trận `tests/permissions.test.ts`.
- `TZ=UTC npm test` vẫn qua.

## 11. Tiêu chí hoàn thành

1. `npm test`, `TZ=UTC npm test`, `npm run lint`, `npm run build` đều qua.
2. Khởi động với DB v1 thì thoát kèm hướng dẫn; với DB mới thì chạy.
3. Trên host, theo `DEPLOY.md`: sao lưu, xóa DB, deploy; Kiểm tra kết nối báo đúng tài khoản và địa điểm HRINTER; nhập camera C21272C952 và thấy online; nhập "Dương Đức Văn" từ Hanet; một người lạ đứng trước camera → tạo nhân sự bằng ảnh đó → người đó đứng lại trước camera và được chấm công; tạo phòng ban và thấy trên app Hanet; xóa người thử thì người đó biến mất khỏi Hanet; bấm "Xem video lúc này" ở một lượt quẹt thì Hanet Connect mở đúng camera C21272C952 và đúng ngày.

## 12. Thứ tự triển khai

0. **Spike FaceID trên host** (§6.4), cập nhật spec nếu cần.
1. Schema v2 + kiểm tra phiên bản khi khởi động.
2. `hanet-api.ts` mở rộng + Hanet giả cho test.
3. Kết nối + chọn địa điểm.
4. Webhook người lạ + `face_sightings`.
5. Hàng đợi `hanet-sync` + worker.
6. Camera: nhập, trạng thái, đổi tên.
7. FaceID từ ảnh camera.
8. Nhập nhân sự từ Hanet.
9. Đồng bộ nhân sự (thông tin, phòng ban, xóa) và phòng ban.
10. Nút "Xem video lúc này" (§6.8). Không phụ thuộc hàng đợi, có thể làm sớm.
11. Giao diện còn lại, `DEPLOY.md`, chạy thật trên host.
