export type UserRole = 'hr' | 'dept_manager' | 'employee';

export interface User {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  departmentId: string;
  departmentName: string;
  position: string;
  avatarUrl: string;
  hanetPersonId: string;
  faceRegistered: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  managerId: string;
  managerName: string;
  memberCount?: number;
  createdAt: string;
}

export interface Camera {
  id: string;
  name: string;
  deviceKey: string;
  placeId: number;
  placeName: string;
  location: string;
  status: 'online' | 'offline';
  lastPing: string;
  ipAddress: string;
  snapshotUrl?: string;
}

export interface AttendanceEvent {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  avatarUrl: string;
  detectedImageUrl: string;
  cameraId: string;
  cameraName: string;
  placeId: number;
  placeName: string;
  timestamp: number;
  timeString: string;
  dateString: string;
  type: 'check_in' | 'check_out' | 'transit';
  status: 'on_time' | 'late' | 'early_leave';
  lateMinutes: number;
  mask: number;
  temperature?: number;
}

export interface AttendanceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  date: string;
  type: 'missed_punch' | 'late_explanation' | 'leave_request';
  reason: string;
  suggestedTime?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  comment?: string;
  createdAt: string;
}

export interface HanetConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  tokenExpiresAt: string;
  webhookSecret: string;
  masterPlaceId: number;
  masterPlaceName: string;
  autoSync: boolean;
}

export interface WebhookLog {
  id: string;
  receivedAt: string;
  action: string;
  deviceName: string;
  personName: string;
  status: 'success' | 'ignored' | 'error';
  rawPayload: any;
}

export interface StatsData {
  totalEmployees: number;
  checkedInCount: number;
  onTimeCount: number;
  lateCount: number;
  notCheckedInCount: number;
  totalCameras: number;
  onlineCameras: number;
  pendingRequests: number;
}
