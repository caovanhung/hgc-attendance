export type UserRole = 'hr' | 'dept_manager' | 'employee';
export type UserStatus = 'active' | 'inactive';

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
