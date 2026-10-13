import type { DayStatus, UserRole } from './types';

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
};

export const ROLE_LABEL: Record<UserRole, string> = {
  hr: 'Quản trị viên Nhân sự (HR)',
  dept_manager: 'Trưởng phòng',
  employee: 'Nhân viên',
};
