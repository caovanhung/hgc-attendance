import type { DayOverride, DayStatus, SyncOp, SyncStatus, User, UserRole } from './types';

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

/** Màu trạng thái ngày công dùng chung (bảng công, thẻ thống kê). Cam dành cho thương hiệu nên không dùng ở đây. */
export const DAY_STATUS_STYLE: Record<DayStatus, string> = {
  on_time: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  late: 'bg-amber-50 text-amber-800 border-amber-200',
  early_leave: 'bg-amber-50 text-amber-800 border-amber-200',
  late_and_early: 'bg-rose-50 text-rose-700 border-rose-200',
  missing_out: 'bg-slate-100 text-slate-700 border-slate-200',
  absent: 'bg-rose-50 text-rose-700 border-rose-200',
  leave: 'bg-violet-50 text-violet-700 border-violet-200',
  business_trip: 'bg-sky-50 text-sky-700 border-sky-200',
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

export const WEEKDAY_LABEL: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };

/** "T2–T6" khi là dãy liên tiếp từ 3 ngày, ngược lại liệt kê "T2, T4, CN". */
export function formatWorkDays(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return 'Cả tuần';
  const consecutive = d.length >= 3 && d.every((n, i) => i === 0 || n === d[i - 1] + 1);
  return consecutive ? `${WEEKDAY_LABEL[d[0]]}–${WEEKDAY_LABEL[d[d.length - 1]]}` : d.map((n) => WEEKDAY_LABEL[n]).join(', ');
}

export const OVERRIDE_KIND_LABEL: Record<DayOverride['kind'], string> = { times: 'Sửa giờ', leave: 'Nghỉ phép', business_trip: 'Công tác' };

/** HR toàn hệ thống và quản trị khu điều chỉnh được ngày công của người khác (server kiểm tra phạm vi). */
export function canAdjust(viewer: User, targetUserId: string): boolean {
  return (viewer.role === 'hr' || viewer.role === 'area_admin') && viewer.id !== targetUserId;
}

/** '2026-10-15' → '15/10/2026' */
export const fmtDate = (date: string): string => date.split('-').reverse().join('/');

/** Màu ô lưới chấm công, khớp DAY_STATUS_STYLE và file Excel. */
export const SYMBOL_STYLE: Record<string, string> = {
  X: 'bg-emerald-50 text-emerald-700',
  M: 'bg-amber-50 text-amber-800',
  S: 'bg-amber-50 text-amber-800',
  MS: 'bg-rose-50 text-rose-700',
  V: 'bg-rose-50 text-rose-700',
  T: 'bg-slate-100 text-slate-700',
  P: 'bg-violet-50 text-violet-700',
  CT: 'bg-sky-50 text-sky-700',
  L: 'bg-slate-100 text-slate-500',
};

export const SYMBOL_LEGEND = 'X đủ công · M đi muộn · S về sớm · MS muộn và về sớm · T thiếu giờ ra · CT công tác · P nghỉ phép · V vắng · L ngày lễ · * đã điều chỉnh';

export const thisMonth = (): string => vnToday().slice(0, 7);

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'attendance.override': 'Điều chỉnh ngày công',
  'attendance.override_remove': 'Bỏ điều chỉnh ngày công',
  'request.approve': 'Duyệt đơn',
  'request.reject': 'Từ chối đơn',
  'user.role': 'Đổi vai trò',
  'user.areas': 'Đổi khu được giao',
  'user.status': 'Đổi trạng thái tài khoản',
  'user.delete': 'Xóa tài khoản',
  'shift.create': 'Thêm ca',
  'shift.update': 'Sửa ca',
  'shift.delete': 'Xóa ca',
  'shift.assign': 'Gán ca',
  'settings.work': 'Sửa ca mặc định / ngưỡng',
  'holiday.add': 'Thêm ngày lễ',
  'holiday.remove': 'Xóa ngày lễ',
  'month.lock': 'Khóa sổ tháng',
  'month.unlock': 'Mở khóa sổ tháng',
  'auth.login': 'Đăng nhập',
  'auth.login_failed': 'Đăng nhập thất bại',
};
