import type { DayStatus, WorkSettings } from '../shared/types';
import { parseHHmm, vnMinutesOfDay } from './vntime';
import type { Db } from './db';
import { tx } from './db';
import { getWorkSettings } from './settings';
import { ruleFromSettings, type ShiftRule } from './shifts';

export type DaySettings = ShiftRule;
export const toDaySettings = ruleFromSettings;

export interface ComputeDayInput {
  detectionTs: number[];
  settings: DaySettings;
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
}

export interface ComputedDay {
  firstIn: number;
  lastOut: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  status: DayStatus;
  detectionCount: number;
}

export function computeDay(input: ComputeDayInput): ComputedDay | null {
  const { detectionTs, settings, lateExcused, manualIn, manualOut } = input;
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

  const outMin = lastOut === null ? null : vnMinutesOfDay(lastOut);
  const isEarly = outMin !== null && outMin < settings.workEnd;
  const earlyMinutes = isEarly ? settings.workEnd - (outMin as number) : 0;

  let status: DayStatus;
  if (lastOut === null) status = 'missing_out';
  else if (isLate && isEarly) status = 'late_and_early';
  else if (isLate) status = 'late';
  else if (isEarly) status = 'early_leave';
  else status = 'on_time';

  return { firstIn, lastOut, lateMinutes, earlyMinutes, status, detectionCount: detectionTs.length };
}

export interface DayAdjustment {
  lateExcused: boolean;
  manualIn: number | null;
  manualOut: number | null;
}

/** Ở production, lượt từ công cụ mô phỏng không được tính vào công. */
function simulatorFilter(): string {
  return process.env.NODE_ENV === 'production' ? " AND source != 'simulator'" : '';
}

function readAdjustment(db: Db, userId: string, workDate: string): DayAdjustment {
  const row = db
    .prepare('SELECT late_excused, manual_in, manual_out FROM attendance_days WHERE user_id = ? AND work_date = ?')
    .get(userId, workDate) as { late_excused: number; manual_in: number | null; manual_out: number | null } | undefined;
  return {
    lateExcused: row?.late_excused === 1,
    manualIn: row?.manual_in ?? null,
    manualOut: row?.manual_out ?? null,
  };
}

function writeDay(db: Db, userId: string, workDate: string, adj: DayAdjustment, settings: DaySettings): void {
  const detections = db
    .prepare(`SELECT ts FROM detections WHERE user_id = ? AND work_date = ?${simulatorFilter()}`)
    .all(userId, workDate) as { ts: number }[];
  const result = computeDay({
    detectionTs: detections.map((d) => d.ts),
    settings,
    lateExcused: adj.lateExcused,
    manualIn: adj.manualIn,
    manualOut: adj.manualOut,
  });
  if (!result) {
    db.prepare('DELETE FROM attendance_days WHERE user_id = ? AND work_date = ?').run(userId, workDate);
    return;
  }
  db.prepare(
    `INSERT INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, status,
       late_excused, manual_in, manual_out, detection_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE SET
       first_in = excluded.first_in, last_out = excluded.last_out, late_minutes = excluded.late_minutes,
       early_minutes = excluded.early_minutes, status = excluded.status, late_excused = excluded.late_excused,
       manual_in = excluded.manual_in, manual_out = excluded.manual_out, detection_count = excluded.detection_count`,
  ).run(
    userId,
    workDate,
    result.firstIn,
    result.lastOut,
    result.lateMinutes,
    result.earlyMinutes,
    result.status,
    adj.lateExcused ? 1 : 0,
    adj.manualIn,
    adj.manualOut,
    result.detectionCount,
  );
}

export function recomputeDay(db: Db, userId: string, workDate: string, settings?: DaySettings): void {
  writeDay(db, userId, workDate, readAdjustment(db, userId, workDate), settings ?? toDaySettings(getWorkSettings(db)));
}

export function applyDayAdjustment(db: Db, userId: string, workDate: string, patch: Partial<DayAdjustment>): void {
  const adj = { ...readAdjustment(db, userId, workDate), ...patch };
  writeDay(db, userId, workDate, adj, toDaySettings(getWorkSettings(db)));
}

/** Tính lại mọi (nhân viên, ngày) có dữ liệu trong [from, to]. Trả số cặp đã tính. */
export function recomputeRange(db: Db, from: string, to: string): number {
  const settings = toDaySettings(getWorkSettings(db));
  const pairs = db
    .prepare(
      `SELECT user_id, work_date FROM detections WHERE work_date BETWEEN ? AND ?
       UNION
       SELECT user_id, work_date FROM attendance_days WHERE work_date BETWEEN ? AND ?`,
    )
    .all(from, to, from, to) as { user_id: string; work_date: string }[];
  tx(db, () => {
    for (const p of pairs) recomputeDay(db, p.user_id, p.work_date, settings);
  });
  return pairs.length;
}
