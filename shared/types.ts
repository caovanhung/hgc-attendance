export type UserRole = 'hr' | 'area_admin' | 'dept_manager' | 'employee';
export type UserStatus = 'active' | 'inactive';
export type SyncStatus = 'synced' | 'pending' | 'error';
export type EmailStatus = 'none' | 'pending' | 'sent' | 'error';

export interface User {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  departmentId: string | null;
  departmentName: string | null;
  areaId: string | null; // khu của phòng ban
  areaName: string | null;
  adminAreaIds: string[]; // khu được giao (chỉ với area_admin)
  position: string;
  avatarUrl: string;
  hanetPersonId: string | null;
  faceRegistered: boolean;
  status: UserStatus;
  hanetSyncStatus: SyncStatus;
  hanetSyncError: string | null;
  faceError: string | null; // lý do đăng ký FaceID thất bại gần nhất
  emailStatus: EmailStatus; // trạng thái thư gần nhất gửi cho người này
  emailError: string | null;
  shiftId: string | null;
  shiftName: string | null; // ca riêng (null = theo phòng ban)
  canLogin: boolean; // đã có mật khẩu (false: thiếu email hoặc thư chào mừng chưa gửi được)
  createdAt: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  managerId: string | null;
  managerName: string | null;
  memberCount: number;
  hanetSyncStatus: SyncStatus;
  hanetSyncError: string | null;
  shiftId: string | null;
  shiftName: string | null;
  areaId: string | null;
  areaName: string | null;
  createdAt: string;
}

export interface Camera {
  id: string;
  name: string;
  deviceKey: string;
  placeId: number | null;
  placeName: string;
  location: string;
  ipAddress: string;
  online: boolean | null; // null = chưa kiểm tra
  statusCheckedAt: number | null;
  areaId: string | null;
  areaName: string | null;
  createdAt: string;
}

export interface Area {
  id: string;
  code: string;
  name: string;
  note: string;
  departmentCount: number;
  cameraCount: number;
  memberCount: number;
  adminNames: string[]; // quản trị khu vực được giao khu này
  createdAt: string;
}

export type DayStatus = 'on_time' | 'late' | 'early_leave' | 'late_and_early' | 'missing_out' | 'absent' | 'leave' | 'business_trip';
export type DetectionSource = 'webhook' | 'reconcile' | 'simulator';

export interface AttendanceDay {
  userId: string;
  employeeCode: string;
  employeeName: string;
  avatarUrl: string;
  departmentId: string | null;
  departmentName: string | null;
  workDate: string;
  firstIn: number | null;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  earlyArrivalMinutes: number; // phút đến sớm (0 = không)
  status: DayStatus;
  final: boolean; // false: còn trong giờ làm, giờ ra là lần quẹt gần nhất
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
  detectionCount: number;
}

export interface Detection {
  id: number;
  deviceId: string;
  deviceName: string | null;
  placeId: number | null;
  ts: number;
  imageUrl: string | null;
  source: DetectionSource;
  hasVideo: boolean; // HR/Trưởng phòng xem được video lượt này (GET /api/detections/:id/video); lượt mô phỏng luôn false
}

/** Đoạn video camera chứa một lượt quẹt (GET /api/detections/:id/video). */
export interface DetectionVideo {
  url: string; // MP4 ký sẵn, hạn khoảng 1 giờ
  startTs: number; // giờ bắt đầu đoạn (ms)
  duration: number; // giây
  offsetSeconds: number; // vị trí lượt quẹt (hoặc `at`) trong đoạn
  deviceName: string | null;
  prevAt: number; // gọi lại với ?at= để lấy đoạn trước
  nextAt: number; // gọi lại với ?at= để lấy đoạn sau
}

/** Tài khoản xem video (tab Cấu hình); không bao giờ trả mật khẩu. */
export interface VideoAccountView {
  email: string | null;
  hasPassword: boolean;
}

export type RequestType = 'missed_punch' | 'late_explanation' | 'leave_request' | 'business_trip';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface AttendanceRequest {
  id: string;
  userId: string;
  employeeName: string;
  employeeCode: string;
  departmentId: string | null;
  workDate: string;
  endDate: string | null; // đến ngày (đơn nghỉ phép/công tác)
  type: RequestType;
  reason: string;
  suggestedIn: string | null;
  suggestedOut: string | null;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  comment: string | null;
  createdAt: string;
}

export interface WorkSettings {
  workStart: string; // 'HH:mm'
  lateGraceMinutes: number;
  workEnd: string; // 'HH:mm'
  minOutGapMinutes: number;
  workDays: number[];
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
}

export interface Shift {
  id: string;
  areaId: string;
  areaName: string | null;
  name: string;
  workStart: string;
  workEnd: string;
  workDays: number[];
  lateGraceMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  departmentCount: number;
  userCount: number;
}

export interface Holiday {
  date: string;
  name: string;
}

export type WebhookLogStatus = 'success' | 'ignored' | 'duplicate' | 'rejected' | 'error';

export interface WebhookLog {
  id: number;
  receivedAt: string;
  status: WebhookLogStatus;
  personName: string | null;
  deviceName: string | null;
  message: string | null;
  rawPayload: unknown;
}

export interface HanetConfigView {
  clientId: string;
  clientSecret: string; // đã che: '••••abcd' hoặc ''
  accessToken: string; // đã che
  refreshToken: string; // đã che
  apiBase: string;
  placeIds: number[];
  webhookPath: string; // '/api/hanet/webhook/<token>'
  lastReconcileAt: string | null;
  lastReconcileError: string | null;
  reconcileEnabled: boolean;
}

export interface StatsData {
  date: string;
  totalEmployees: number;
  presentCount: number;
  onTimeCount: number;
  lateCount: number;
  missingOutCount: number;
  notCheckedInCount: number;
  pendingRequests: number;
  totalCameras: number;
}

export type StatsDetailType = 'total' | 'present' | 'on_time' | 'late' | 'missing_out' | 'not_checked_in';

export interface StatsDetailRow {
  userId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string | null;
  firstIn: number | null;
  lastOut: number | null;
  lateMinutes: number;
  status: DayStatus | null;
}

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

export interface MeResponse {
  user: User;
  mustChangePassword: boolean;
  simulatorEnabled: boolean;
  isSystemAdmin: boolean; // tài khoản ADMIN: được sửa cấu hình kỹ thuật
  areas: Area[]; // khu người này được thấy (bộ chọn khu)
}

export interface HanetPlace {
  id: number;
  name: string;
  address: string;
}

export interface HanetDevice {
  deviceID: string;
  deviceName: string;
  placeID?: number;
  placeName?: string;
}

export interface HanetPerson {
  aliasID: string;
  name: string;
  personID: string;
  avatar: string;
  title: string;
}

export interface HanetDepartment {
  id: number;
  name: string;
}

export interface HanetConnectionTest {
  ok: boolean;
  account: { name: string; email: string } | null;
  places: HanetPlace[];
  message: string;
}

export type SightingKind = 'stranger' | 'unlinked';

/** Lượt camera chụp người chưa khớp nhân sự nào (giữ 24 giờ) — nguồn ảnh đăng ký FaceID. */
export interface FaceSighting {
  id: number;
  kind: SightingKind;
  personId: string | null;
  aliasId: string | null;
  personName: string | null;
  deviceId: string;
  deviceName: string | null;
  ts: number;
  imageUrl: string;
}

export type SyncEntity = 'user' | 'department' | 'camera';
export type SyncOp =
  | 'user.info'
  | 'user.department'
  | 'user.alias'
  | 'user.remove'
  | 'dept.create'
  | 'dept.update'
  | 'dept.remove'
  | 'camera.rename';

export interface SyncJobView {
  id: number;
  entityType: SyncEntity;
  entityId: string;
  op: SyncOp;
  label: string; // tên đối tượng để hiển thị
  attempts: number;
  lastError: string | null;
  updatedAt: number;
}

export interface SyncSummary {
  pending: number;
  error: number;
  errors: SyncJobView[]; // 50 việc lỗi gần nhất
}

export interface FaceResult {
  ok: boolean;
  message: string;
}

export interface FaceCandidates {
  detections: { id: number; ts: number; imageUrl: string; deviceName: string }[];
  strangers: FaceSighting[];
}

export interface ImportedUser {
  id: string;
  code: string;
  name: string;
}

/** Cấu hình gửi thư (tab Cấu hình); không bao giờ trả mật khẩu SMTP. */
export interface MailConfigView {
  host: string;
  port: number;
  secure: 'ssl' | 'starttls';
  user: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  appUrl: string; // địa chỉ web dùng trong thư (link đặt lại mật khẩu)
  dailyLimit: number;
  configured: boolean;
  sentToday: number;
  pending: number;
}

/** Một dòng file CSV nhập nhân sự (đã ánh xạ tiêu đề cột). */
export interface CsvRowInput {
  code: string;
  name: string;
  email: string;
  phone: string;
  departmentCode: string;
  position: string;
  role: string; // 'nhan_vien' | 'truong_phong' | ''
}

export interface CsvPreviewRow {
  line: number; // số dòng trong file (dòng tiêu đề là 1)
  ok: boolean;
  errors: string[];
  code: string | null; // mã sẽ dùng (null nếu dòng lỗi)
  name: string;
  email: string;
}
