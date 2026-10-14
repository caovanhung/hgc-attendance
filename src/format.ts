import type { DayStatus, SyncOp, SyncStatus, UserRole } from './types';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function vnToday(): string {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' });

export function fmtTime(ts: number | null): string {
  return ts === null ? '—' : timeFmt.format(ts);
}

export function fmtDateTime(v: string | number): string {
  return dateTimeFmt.format(new Date(v));
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  on_time: 'Đúng giờ',
  late: 'Đi muộn',
  early_leave: 'Về sớm',
  late_and_early: 'Muộn & về sớm',
  missing_out: 'Thiếu giờ ra',
  absent: 'Vắng',
  leave: 'Nghỉ phép',
  business_trip: 'Công tác',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  hr: 'HR toàn hệ thống',
  area_admin: 'Quản trị khu vực',
  dept_manager: 'Trưởng phòng',
  employee: 'Nhân viên',
};

/** Tài khoản quản trị hệ thống; chỉ tài khoản này được xóa nhân sự và phòng ban. */
export const SYSTEM_ADMIN_CODE = 'ADMIN';

export const SYNC_OP_LABEL: Record<SyncOp, string> = {
  'user.info': 'Cập nhật thông tin nhân sự',
  'user.department': 'Đổi phòng ban của nhân sự',
  'user.alias': 'Gán mã nhân viên trên Camera AI',
  'user.remove': 'Xóa khuôn mặt trên Camera AI',
  'dept.create': 'Tạo phòng ban',
  'dept.update': 'Sửa phòng ban',
  'dept.remove': 'Xóa phòng ban',
  'camera.rename': 'Đổi tên camera',
};

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  synced: 'Đã đồng bộ',
  pending: 'Đang chờ đồng bộ',
  error: 'Lỗi đồng bộ',
};
