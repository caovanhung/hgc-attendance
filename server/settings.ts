import type { Db } from './db';
import type { WorkSettings } from '../shared/types';
import { parseHHmm } from './vntime';
import { HttpError } from './errors';

export function getSetting(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function deleteSetting(db: Db, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  workStart: '08:00',
  lateGraceMinutes: 15,
  workEnd: '17:00',
  minOutGapMinutes: 30,
  workDays: [1, 2, 3, 4, 5],
  earlyArrivalMinutes: 15,
  earlyLeaveMinutes: 10,
};

function daysFrom(s: string | undefined): number[] {
  return s ? s.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b) : DEFAULT_WORK_SETTINGS.workDays;
}

export function getWorkSettings(db: Db): WorkSettings {
  return {
    workStart: getSetting(db, 'work_start') ?? DEFAULT_WORK_SETTINGS.workStart,
    lateGraceMinutes: Number(getSetting(db, 'late_grace_minutes') ?? DEFAULT_WORK_SETTINGS.lateGraceMinutes),
    workEnd: getSetting(db, 'work_end') ?? DEFAULT_WORK_SETTINGS.workEnd,
    minOutGapMinutes: Number(getSetting(db, 'min_out_gap_minutes') ?? DEFAULT_WORK_SETTINGS.minOutGapMinutes),
    workDays: daysFrom(getSetting(db, 'work_days')),
    earlyArrivalMinutes: Number(getSetting(db, 'early_arrival_minutes') ?? DEFAULT_WORK_SETTINGS.earlyArrivalMinutes),
    earlyLeaveMinutes: Number(getSetting(db, 'early_leave_minutes') ?? DEFAULT_WORK_SETTINGS.earlyLeaveMinutes),
  };
}

export function intInRange(v: unknown, min: number, max: number, label: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} phải là số nguyên từ ${min} đến ${max}`);
  }
  return n;
}

export function hhmm(v: unknown, label: string): string {
  if (typeof v !== 'string') throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
  try {
    parseHHmm(v);
  } catch {
    throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
  }
  return v;
}

/** Ngày làm trong tuần: mảng số 1–7 (1 = thứ 2), không rỗng, không trùng. */
export function workDaysInput(v: unknown, label = 'Ngày làm trong tuần'): number[] {
  if (!Array.isArray(v)) throw new HttpError(400, `${label} không hợp lệ`);
  const days = [...new Set(v.map(Number))].sort((a, b) => a - b);
  if (days.length === 0 || days.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) throw new HttpError(400, `${label} phải chọn ít nhất một ngày từ thứ 2 đến chủ nhật`);
  return days;
}

export function validateWorkSettings(input: unknown): WorkSettings {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Thiếu cấu hình giờ làm việc');
  const b = input as Record<string, unknown>;
  const ws: WorkSettings = {
    workStart: hhmm(b.workStart, 'Giờ vào'),
    lateGraceMinutes: intInRange(b.lateGraceMinutes, 0, 120, 'Số phút cho phép muộn'),
    workEnd: hhmm(b.workEnd, 'Giờ ra'),
    minOutGapMinutes: intInRange(b.minOutGapMinutes, 1, 720, 'Ngưỡng giờ ra'),
    workDays: b.workDays === undefined ? DEFAULT_WORK_SETTINGS.workDays : workDaysInput(b.workDays),
    earlyArrivalMinutes: b.earlyArrivalMinutes === undefined ? DEFAULT_WORK_SETTINGS.earlyArrivalMinutes : intInRange(b.earlyArrivalMinutes, 0, 120, 'Ngưỡng đi sớm'),
    earlyLeaveMinutes: b.earlyLeaveMinutes === undefined ? DEFAULT_WORK_SETTINGS.earlyLeaveMinutes : intInRange(b.earlyLeaveMinutes, 0, 120, 'Cho phép về sớm'),
  };
  if (parseHHmm(ws.workEnd) <= parseHHmm(ws.workStart)) throw new HttpError(400, 'Giờ ra phải sau giờ vào');
  return ws;
}

export function saveWorkSettings(db: Db, ws: WorkSettings): void {
  setSetting(db, 'work_start', ws.workStart);
  setSetting(db, 'late_grace_minutes', String(ws.lateGraceMinutes));
  setSetting(db, 'work_end', ws.workEnd);
  setSetting(db, 'min_out_gap_minutes', String(ws.minOutGapMinutes));
  setSetting(db, 'work_days', ws.workDays.join(','));
  setSetting(db, 'early_arrival_minutes', String(ws.earlyArrivalMinutes));
  setSetting(db, 'early_leave_minutes', String(ws.earlyLeaveMinutes));
}
