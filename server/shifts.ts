import type { Db } from './db';
import { HttpError } from './errors';
import { getWorkSettings, hhmm, intInRange, workDaysInput } from './settings';
import { parseHHmm, vnDayStart } from './vntime';
import type { Row } from './repo';
import type { Shift, WorkSettings } from '../shared/types';

export const DEFAULT_SHIFT_NAME = 'Ca mặc định công ty';

/** Luật một ca, giờ tính bằng phút trong ngày (giờ Việt Nam). */
export interface ShiftRule {
  shiftId: string | null; // null = ca mặc định công ty
  name: string;
  workStart: number;
  workEnd: number;
  workDays: number[];
  graceMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  minOutGapMinutes: number;
}

export interface ShiftInput {
  name: string;
  workStart: string;
  workEnd: string;
  workDays: number[];
  lateGraceMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
}

export function parseWorkDays(s: string): number[] {
  return s.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b);
}

export function formatWorkDays(days: number[]): string {
  return [...days].sort((a, b) => a - b).join(',');
}

export function ruleFromSettings(ws: WorkSettings): ShiftRule {
  return {
    shiftId: null,
    name: DEFAULT_SHIFT_NAME,
    workStart: parseHHmm(ws.workStart),
    workEnd: parseHHmm(ws.workEnd),
    workDays: ws.workDays,
    graceMinutes: ws.lateGraceMinutes,
    earlyArrivalMinutes: ws.earlyArrivalMinutes,
    earlyLeaveMinutes: ws.earlyLeaveMinutes,
    minOutGapMinutes: ws.minOutGapMinutes,
  };
}

export function defaultShiftRule(db: Db): ShiftRule {
  return ruleFromSettings(getWorkSettings(db));
}

function ruleFromRow(r: Row, minOutGapMinutes: number): ShiftRule {
  return {
    shiftId: r.id,
    name: r.name,
    workStart: parseHHmm(r.work_start),
    workEnd: parseHHmm(r.work_end),
    workDays: parseWorkDays(r.work_days),
    graceMinutes: r.late_grace_minutes,
    earlyArrivalMinutes: r.early_arrival_minutes,
    earlyLeaveMinutes: r.early_leave_minutes,
    minOutGapMinutes,
  };
}

/**
 * Ca áp dụng: ca riêng (nếu thuộc khu hiện tại của người đó) > ca của phòng (nếu thuộc khu của phòng) > ca mặc định.
 * Chuyển phòng/khu mà ca cũ không còn thuộc khu mới thì tự rơi xuống bước sau.
 */
export function effectiveShift(db: Db, userId: string): ShiftRule {
  const base = defaultShiftRule(db);
  const u = db
    .prepare('SELECT u.shift_id AS own, d.shift_id AS dept, d.area_id AS area FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?')
    .get(userId) as { own: string | null; dept: string | null; area: string | null } | undefined;
  if (!u || !u.area) return base;
  const byId = db.prepare('SELECT * FROM shifts WHERE id = ? AND area_id = ?');
  for (const id of [u.own, u.dept]) {
    if (!id) continue;
    const row = byId.get(id, u.area) as Row | undefined;
    if (row) return ruleFromRow(row, base.minOutGapMinutes);
  }
  return base;
}

/** Thứ trong tuần theo ISO: 1 = thứ 2 … 7 = chủ nhật. */
export function isoWeekday(date: string): number {
  const d = new Date(vnDayStart(date) + 7 * 3_600_000).getUTCDay(); // 0 = chủ nhật
  return d === 0 ? 7 : d;
}

export function isHoliday(db: Db, date: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM holidays WHERE date = ?').get(date));
}

export function isWorkday(db: Db, rule: ShiftRule, date: string): boolean {
  return rule.workDays.includes(isoWeekday(date)) && !isHoliday(db, date);
}

export function validateShiftInput(input: unknown): ShiftInput {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Thiếu thông tin ca');
  const b = input as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) throw new HttpError(400, 'Tên ca là bắt buộc');
  const s: ShiftInput = {
    name,
    workStart: hhmm(b.workStart, 'Giờ vào'),
    workEnd: hhmm(b.workEnd, 'Giờ ra'),
    workDays: workDaysInput(b.workDays),
    lateGraceMinutes: intInRange(b.lateGraceMinutes, 0, 120, 'Cho phép đi muộn'),
    earlyArrivalMinutes: intInRange(b.earlyArrivalMinutes, 0, 120, 'Ngưỡng đi sớm'),
    earlyLeaveMinutes: intInRange(b.earlyLeaveMinutes, 0, 120, 'Cho phép về sớm'),
  };
  if (parseHHmm(s.workEnd) <= parseHHmm(s.workStart)) throw new HttpError(400, 'Giờ ra phải sau giờ vào');
  return s;
}

export const SHIFT_SELECT = `SELECT s.*, a.name AS area_name,
  (SELECT COUNT(*) FROM departments d WHERE d.shift_id = s.id) AS department_count,
  (SELECT COUNT(*) FROM users u WHERE u.shift_id = s.id) AS user_count
  FROM shifts s LEFT JOIN areas a ON a.id = s.area_id`;

export function mapShift(r: Row): Shift {
  return {
    id: r.id,
    areaId: r.area_id,
    areaName: r.area_name ?? null,
    name: r.name,
    workStart: r.work_start,
    workEnd: r.work_end,
    workDays: parseWorkDays(r.work_days),
    lateGraceMinutes: r.late_grace_minutes,
    earlyArrivalMinutes: r.early_arrival_minutes,
    earlyLeaveMinutes: r.early_leave_minutes,
    departmentCount: Number(r.department_count),
    userCount: Number(r.user_count),
  };
}

export function getShift(db: Db, id: string): Shift | null {
  const row = db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(id) as Row | undefined;
  return row ? mapShift(row) : null;
}
