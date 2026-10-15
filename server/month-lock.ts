import type { Db } from './db';
import { HttpError } from './errors';
import type { MonthLock } from '../shared/types';

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(s: unknown): s is string {
  return typeof s === 'string' && MONTH_RE.test(s);
}

/** '2026-10' → '10/2026' */
export function monthLabel(month: string): string {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

export function lockOf(db: Db, month: string): MonthLock | null {
  const r = db.prepare('SELECT month, locked_by_label, locked_at FROM month_locks WHERE month = ?').get(month) as
    | { month: string; locked_by_label: string; locked_at: string }
    | undefined;
  return r ? { month: r.month, lockedByName: r.locked_by_label, lockedAt: r.locked_at } : null;
}

export function isMonthLocked(db: Db, date: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM month_locks WHERE month = ?').get(date.slice(0, 7)));
}

export function lockedError(month: string): HttpError {
  return new HttpError(423, `Tháng ${monthLabel(month)} đã khóa sổ`);
}

/** Có ngày nào trong [from, to] thuộc tháng đã khóa ⇒ 423. */
export function assertRangeUnlocked(db: Db, from: string, to: string): void {
  const r = db
    .prepare('SELECT month FROM month_locks WHERE month >= ? AND month <= ? ORDER BY month LIMIT 1')
    .get(from.slice(0, 7), to.slice(0, 7)) as { month: string } | undefined;
  if (r) throw lockedError(r.month);
}
