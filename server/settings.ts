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
};

export function getWorkSettings(db: Db): WorkSettings {
  return {
    workStart: getSetting(db, 'work_start') ?? DEFAULT_WORK_SETTINGS.workStart,
    lateGraceMinutes: Number(getSetting(db, 'late_grace_minutes') ?? DEFAULT_WORK_SETTINGS.lateGraceMinutes),
    workEnd: getSetting(db, 'work_end') ?? DEFAULT_WORK_SETTINGS.workEnd,
    minOutGapMinutes: Number(getSetting(db, 'min_out_gap_minutes') ?? DEFAULT_WORK_SETTINGS.minOutGapMinutes),
  };
}

function intInRange(v: unknown, min: number, max: number, label: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} phải là số nguyên từ ${min} đến ${max}`);
  }
  return n;
}

function hhmm(v: unknown, label: string): string {
  if (typeof v !== 'string') throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
  try {
    parseHHmm(v);
  } catch {
    throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
  }
  return v;
}

export function validateWorkSettings(input: unknown): WorkSettings {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Thiếu cấu hình giờ làm việc');
  const b = input as Record<string, unknown>;
  const ws: WorkSettings = {
    workStart: hhmm(b.workStart, 'Giờ vào'),
    lateGraceMinutes: intInRange(b.lateGraceMinutes, 0, 120, 'Số phút cho phép muộn'),
    workEnd: hhmm(b.workEnd, 'Giờ ra'),
    minOutGapMinutes: intInRange(b.minOutGapMinutes, 1, 720, 'Ngưỡng giờ ra'),
  };
  if (parseHHmm(ws.workEnd) <= parseHHmm(ws.workStart)) throw new HttpError(400, 'Giờ ra phải sau giờ vào');
  return ws;
}

export function saveWorkSettings(db: Db, ws: WorkSettings): void {
  setSetting(db, 'work_start', ws.workStart);
  setSetting(db, 'late_grace_minutes', String(ws.lateGraceMinutes));
  setSetting(db, 'work_end', ws.workEnd);
  setSetting(db, 'min_out_gap_minutes', String(ws.minOutGapMinutes));
}
