import type { Request } from 'express';
import type { Db } from './db';
import { currentUser } from './middleware';

export type AuditAction =
  | 'attendance.override'
  | 'attendance.override_remove'
  | 'request.approve'
  | 'request.reject'
  | 'user.role'
  | 'user.areas'
  | 'user.status'
  | 'user.delete'
  | 'shift.create'
  | 'shift.update'
  | 'shift.delete'
  | 'shift.assign'
  | 'settings.work'
  | 'holiday.add'
  | 'holiday.remove'
  | 'month.lock'
  | 'month.unlock'
  | 'face.delete'
  | 'auth.login'
  | 'auth.login_failed';

export interface AuditEntry {
  actorId: string | null;
  actorLabel: string;
  ip: string | null;
  action: AuditAction;
  targetUserId?: string | null;
  targetLabel?: string | null;
  areaId?: string | null;
  workDate?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export const personLabel = (name: string, code: string): string => `${name} (${code})`;

export function userLabel(db: Db, userId: string): string {
  const u = db.prepare('SELECT name, code FROM users WHERE id = ?').get(userId) as { name: string; code: string } | undefined;
  return u ? personLabel(u.name, u.code) : '';
}

/** Khu của phòng ban người này (null nếu chưa có phòng hoặc phòng chưa gán khu). */
export function userAreaId(db: Db, userId: string): string | null {
  const r = db
    .prepare('SELECT d.area_id FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?')
    .get(userId) as { area_id: string | null } | undefined;
  return r?.area_id ?? null;
}

export function actorOf(req: Request): { actorId: string; actorLabel: string; ip: string | null } {
  const u = currentUser(req);
  return { actorId: u.id, actorLabel: personLabel(u.name, u.code), ip: req.ip ?? null };
}

const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));

/** Ghi một dòng nhật ký. Gọi trong cùng giao dịch với thao tác: thao tác lỗi (rollback) thì không có dòng. */
export function writeAudit(db: Db, now: number, e: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_logs(at, actor_id, actor_label, ip, action, target_user_id, target_label, area_id, work_date, before_json, after_json, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date(now).toISOString(),
    e.actorId,
    e.actorLabel,
    e.ip,
    e.action,
    e.targetUserId ?? null,
    e.targetLabel ?? null,
    e.areaId ?? null,
    e.workDate ?? null,
    json(e.before),
    json(e.after),
    e.reason ?? null,
  );
}
