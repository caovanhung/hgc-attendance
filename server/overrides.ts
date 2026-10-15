import type { Db } from './db';
import { HttpError } from './errors';

export type OverrideKind = 'times' | 'leave' | 'business_trip';

export interface StoredOverride {
  kind: OverrideKind;
  firstIn: number | null;
  lastOut: number | null;
  reason: string;
  byLabel: string;
  at: string;
}

export const OVERRIDE_KINDS: OverrideKind[] = ['times', 'leave', 'business_trip'];
export const REASON_MIN = 5;
export const REASON_MAX = 500;

export function readOverride(db: Db, userId: string, workDate: string): StoredOverride | null {
  const r = db
    .prepare('SELECT kind, first_in, last_out, reason, created_by_label, created_at FROM attendance_overrides WHERE user_id = ? AND work_date = ?')
    .get(userId, workDate) as
    | { kind: OverrideKind; first_in: number | null; last_out: number | null; reason: string; created_by_label: string; created_at: string }
    | undefined;
  return r ? { kind: r.kind, firstIn: r.first_in, lastOut: r.last_out, reason: r.reason, byLabel: r.created_by_label, at: r.created_at } : null;
}

export function parseReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new HttpError(400, `Phải nhập lý do điều chỉnh (${REASON_MIN}–${REASON_MAX} ký tự)`);
  }
  return reason;
}
