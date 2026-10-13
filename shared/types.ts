export type UserRole = 'hr' | 'dept_manager' | 'employee';
export type UserStatus = 'active' | 'inactive';
export type SyncStatus = 'synced' | 'pending' | 'error';

export interface User {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  departmentId: string | null;
  departmentName: string | null;
  position: string;
  avatarUrl: string;
  hanetPersonId: string | null;
  faceRegistered: boolean;
  status: UserStatus;
  hanetSyncStatus: SyncStatus;
  hanetSyncError: string | null;
  faceError: string | null; // lý do đăng ký FaceID thất bại gần nhất
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
  createdAt: string;
}

export type DayStatus = 'on_time' | 'late' | 'early_leave' | 'late_and_early' | 'missing_out';
export type DetectionSource = 'webhook' | 'reconcile' | 'simulator';

export interface AttendanceDay {
  userId: string;
  employeeCode: string;
  employeeName: string;
  avatarUrl: string;
  departmentId: string | null;
  departmentName: string | null;
  workDate: string;
  firstIn: number;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  status: DayStatus;
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
}

export type RequestType = 'missed_punch' | 'late_explanation' | 'leave_request';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface AttendanceRequest {
  id: string;
  userId: string;
  employeeName: string;
  employeeCode: string;
  departmentId: string | null;
  workDate: string;
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
  tempPassword: string;
}
