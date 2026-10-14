import type { DayStatus } from '../shared/types';
import { addDays, daysBetween, toVnDate, vnDayStart, vnMinutesOfDay } from './vntime';
import type { Db } from './db';
import { tx } from './db';
import { effectiveShift, isWorkday, ruleFromSettings, type ShiftRule } from './shifts';
import { SYSTEM_ADMIN_CODE } from './bootstrap';

export type DaySettings = ShiftRule;
export const toDaySettings = ruleFromSettings;

export interface ComputeDayInput {
  detectionTs: number[];
  settings: ShiftRule;
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
  /** Đã qua giờ ra của ca: chỉ khi đó mới xét về sớm và chốt ngày. */
  closed: boolean;
}

export interface ComputedDay {
  firstIn: number;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  earlyArrivalMinutes: number;
  status: DayStatus;
  detectionCount: number;
  final: boolean;
}

export function computeDay(input: ComputeDayInput): ComputedDay | null {
  const { detectionTs, settings, lateExcused, manualIn, manualOut, closed } = input;
  const minDet = detectionTs.length ? Math.min(...detectionTs) : null;
  const maxDet = detectionTs.length ? Math.max(...detectionTs) : null;

  const firstIn = manualIn ?? minDet;
  if (firstIn === null) return null;

  let lastOut: number | null = null;
  if (manualOut !== null) lastOut = manualOut;
  else if (maxDet !== null && maxDet - firstIn >= settings.minOutGapMinutes * 60_000) lastOut = maxDet;

  const inMin = vnMinutesOfDay(firstIn);
  const isLate = !lateExcused && inMin > settings.workStart + settings.graceMinutes;
  const lateMinutes = isLate ? inMin - settings.workStart : 0;
  const earlyArrivalMinutes = inMin < settings.workStart - settings.earlyArrivalMinutes ? settings.workStart - inMin : 0;

  // Về sớm chỉ xét khi đã qua giờ ra; trong giờ làm, giờ ra chỉ là lần quẹt gần nhất
  const outMin = lastOut === null ? null : vnMinutesOfDay(lastOut);
  const isEarly = closed && outMin !== null && outMin < settings.workEnd - settings.earlyLeaveMinutes;
  const earlyMinutes = isEarly ? settings.workEnd - (outMin as number) : 0;

  let status: DayStatus;
  if (lastOut === null) status = 'missing_out';
  else if (isLate && isEarly) status = 'late_and_early';
  else if (isLate) status = 'late';
  else if (isEarly) status = 'early_leave';
  else status = 'on_time';

  return { firstIn, lastOut, lateMinutes, earlyMinutes, earlyArrivalMinutes, status, detectionCount: detectionTs.length, final: closed };
}

export function shiftEndTs(rule: ShiftRule, date: string): number {
  return vnDayStart(date) + rule.workEnd * 60_000;
}

/** Loại đơn nghỉ phép/công tác đã duyệt phủ ngày này (nếu có). */
export function approvedLeaveType(db: Db, userId: string, date: string): 'leave' | 'business_trip' | null {
  const r = db
    .prepare(
      `SELECT type FROM requests WHERE user_id = ? AND status = 'approved' AND type IN ('leave_request', 'business_trip')
       AND work_date <= ? AND COALESCE(end_date, work_date) >= ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId, date, date) as { type: string } | undefined;
  if (!r) return null;
  return r.type === 'business_trip' ? 'business_trip' : 'leave';
}

export interface DayAdjustment {
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
}

function simulatorFilter(): string {
  return process.env.NODE_ENV === 'production' ? " AND source != 'simulator'" : '';
}

function readAdjustment(db: Db, userId: string, workDate: string): DayAdjustment {
  const row = db
    .prepare('SELECT late_excused, manual_in, manual_out FROM attendance_days WHERE user_id = ? AND work_date = ?')
    .get(userId, workDate) as { late_excused: number; manual_in: number | null; manual_out: number | null } | undefined;
  return { lateExcused: row?.late_excused === 1, manualIn: row?.manual_in ?? null, manualOut: row?.manual_out ?? null };
}

interface DayRow {
  firstIn: number | null;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  earlyArrivalMinutes: number;
  status: DayStatus;
  final: boolean;
  detectionCount: number;
}

function saveDay(db: Db, userId: string, workDate: string, adj: DayAdjustment, d: DayRow): void {
  db.prepare(
    `INSERT INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, early_arrival_minutes, status, final,
       late_excused, manual_in, manual_out, detection_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE SET
       first_in = excluded.first_in, last_out = excluded.last_out, late_minutes = excluded.late_minutes,
       early_minutes = excluded.early_minutes, early_arrival_minutes = excluded.early_arrival_minutes, status = excluded.status,
       final = excluded.final, late_excused = excluded.late_excused, manual_in = excluded.manual_in, manual_out = excluded.manual_out,
       detection_count = excluded.detection_count`,
  ).run(
    userId, workDate, d.firstIn, d.lastOut, d.lateMinutes, d.earlyMinutes, d.earlyArrivalMinutes, d.status, d.final ? 1 : 0,
    adj.lateExcused ? 1 : 0, adj.manualIn, adj.manualOut, d.detectionCount,
  );
}

/**
 * Tính lại một ngày công (spec mục 6): đơn nghỉ/công tác đã duyệt > lượt quẹt/giờ chỉnh tay > vắng (ngày làm việc, đã qua giờ ra) > không có dòng.
 * Người không hoạt động, ADMIN, hoặc ngày trước ngày tạo tài khoản: không bao giờ vắng/nghỉ.
 */
function writeDay(db: Db, userId: string, workDate: string, adj: DayAdjustment, now: number): void {
  const user = db.prepare('SELECT code, status, created_at FROM users WHERE id = ?').get(userId) as
    | { code: string; status: string; created_at: string }
    | undefined;
  if (!user) return;
  const rule = effectiveShift(db, userId);
  const closed = now >= shiftEndTs(rule, workDate);
  const eligible = user.status === 'active' && user.code !== SYSTEM_ADMIN_CODE && workDate >= user.created_at.slice(0, 10);
  const workday = isWorkday(db, rule, workDate);
  const detections = db
    .prepare(`SELECT ts FROM detections WHERE user_id = ? AND work_date = ?${simulatorFilter()}`)
    .all(userId, workDate) as { ts: number }[];
  const computed = computeDay({
    detectionTs: detections.map((d) => d.ts),
    settings: rule,
    lateExcused: adj.lateExcused,
    manualIn: adj.manualIn,
    manualOut: adj.manualOut,
    closed,
  });

  const leave = eligible && workday ? approvedLeaveType(db, userId, workDate) : null;
  if (leave) {
    saveDay(db, userId, workDate, adj, {
      firstIn: computed?.firstIn ?? null,
      lastOut: computed?.lastOut ?? null,
      lateMinutes: 0,
      earlyMinutes: 0,
      earlyArrivalMinutes: 0,
      status: leave,
      final: true,
      detectionCount: detections.length,
    });
    return;
  }
  if (computed) {
    saveDay(db, userId, workDate, adj, computed);
    return;
  }
  if (eligible && workday && closed) {
    saveDay(db, userId, workDate, adj, {
      firstIn: null, lastOut: null, lateMinutes: 0, earlyMinutes: 0, earlyArrivalMinutes: 0, status: 'absent', final: true, detectionCount: 0,
    });
    return;
  }
  db.prepare('DELETE FROM attendance_days WHERE user_id = ? AND work_date = ?').run(userId, workDate);
}

export function recomputeDay(db: Db, userId: string, workDate: string, now: number = Date.now()): void {
  writeDay(db, userId, workDate, readAdjustment(db, userId, workDate), now);
}

export function applyDayAdjustment(db: Db, userId: string, workDate: string, patch: Partial<DayAdjustment>, now: number = Date.now()): void {
  writeDay(db, userId, workDate, { ...readAdjustment(db, userId, workDate), ...patch }, now);
}

/** Tính lại mọi (người, ngày) trong [from, to] cho danh sách người. Trả số cặp đã tính. */
export function recomputeUsers(db: Db, userIds: string[], from: string, to: string, now: number): number {
  const span = daysBetween(from, to);
  if (span < 0 || userIds.length === 0) return 0;
  let n = 0;
  tx(db, () => {
    for (let i = 0; i <= span; i++) {
      const date = addDays(from, i);
      for (const id of userIds) {
        recomputeDay(db, id, date, now);
        n++;
      }
    }
  });
  return n;
}

/** Tính lại mọi nhân sự (trừ ADMIN) trong khoảng ngày — nút "Tính lại" của HR. */
export function recomputeRange(db: Db, from: string, to: string, now: number = Date.now()): number {
  const ids = (db.prepare('SELECT id FROM users WHERE code != ?').all(SYSTEM_ADMIN_CODE) as { id: string }[]).map((r) => r.id);
  return recomputeUsers(db, ids, from, to, now);
}

/** Từ ngày 1 tháng hiện tại tới hôm nay (giờ Việt Nam). */
export function monthToDate(now: number): { from: string; to: string } {
  const to = toVnDate(now);
  return { from: `${to.slice(0, 8)}01`, to };
}

/** Ngày cuối cùng của các đơn nghỉ phép/công tác đã duyệt của những người này (null nếu không có). */
export function latestLeaveEnd(db: Db, userIds: string[]): string | null {
  if (userIds.length === 0) return null;
  const r = db
    .prepare(
      `SELECT MAX(COALESCE(end_date, work_date)) AS last FROM requests
       WHERE status = 'approved' AND type IN ('leave_request', 'business_trip') AND user_id IN (${userIds.map(() => '?').join(', ')})`,
    )
    .get(...userIds) as { last: string | null };
  return r.last;
}

/**
 * Ca/gán ca đổi: tính lại từ ngày 1 tháng hiện tại tới max(hôm nay, ngày cuối của đơn nghỉ/công tác đã duyệt)
 * — để các ngày nghỉ đã ghi trước cho tương lai theo đúng ngày làm của ca mới.
 */
export function recomputeForShiftChange(db: Db, userIds: string[], now: number): number {
  const { from, to } = monthToDate(now);
  const last = latestLeaveEnd(db, userIds);
  return recomputeUsers(db, userIds, from, last && last > to ? last : to, now);
}

/**
 * Đóng ngày (job 15 phút): hôm qua và hôm nay, mọi nhân sự đang làm (trừ ADMIN) chưa có dòng hoặc dòng chưa chốt
 * mà đã qua giờ ra của ca ⇒ tính lại để ghi vắng/chốt về sớm. Dòng nghỉ phép/công tác (ghi trước khi duyệt đơn)
 * luôn được tính lại để sửa nếu ca/ngày lễ đã đổi. Trả số ngày đã tính.
 */
export function closeDays(db: Db, now: number): number {
  const today = toVnDate(now);
  const users = (db.prepare("SELECT id FROM users WHERE status = 'active' AND code != ?").all(SYSTEM_ADMIN_CODE) as { id: string }[]).map((r) => r.id);
  const row = db.prepare('SELECT final, status FROM attendance_days WHERE user_id = ? AND work_date = ?');
  let n = 0;
  tx(db, () => {
    for (const date of [addDays(today, -1), today]) {
      for (const id of users) {
        const r = row.get(id, date) as { final: number; status: string } | undefined;
        const preWritten = r?.status === 'leave' || r?.status === 'business_trip';
        if (!preWritten && r?.final === 1) continue;
        if (!preWritten && now < shiftEndTs(effectiveShift(db, id), date)) continue;
        recomputeDay(db, id, date, now);
        n++;
      }
    }
  });
  return n;
}
