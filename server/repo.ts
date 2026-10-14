import type { Db } from './db';
import type { User } from '../shared/types';
import { scopeFor, type AuthUser } from './auth';

export type Row = Record<string, any>;

export const USER_SELECT = `SELECT u.id, u.code, u.name, u.email, u.phone, u.role, u.department_id,
  d.name AS department_name, d.area_id, ar.name AS area_name, u.position, u.avatar_url, u.hanet_person_id, u.face_registered, u.status,
  u.hanet_sync_status, u.hanet_sync_error, u.face_error, u.email_status, u.email_error, (u.password_hash IS NOT NULL) AS can_login,
  (SELECT group_concat(x.area_id) FROM admin_areas x WHERE x.user_id = u.id) AS admin_area_ids, u.created_at
  FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN areas ar ON ar.id = d.area_id`;

export function mapUser(r: Row): User {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    email: r.email ?? '',
    phone: r.phone ?? '',
    role: r.role,
    departmentId: r.department_id ?? null,
    departmentName: r.department_name ?? null,
    areaId: r.area_id ?? null,
    areaName: r.area_name ?? null,
    adminAreaIds: r.admin_area_ids ? String(r.admin_area_ids).split(',').sort() : [],
    position: r.position ?? '',
    avatarUrl: r.avatar_url ?? '',
    hanetPersonId: r.hanet_person_id ?? null,
    faceRegistered: r.face_registered === 1,
    status: r.status,
    hanetSyncStatus: r.hanet_sync_status ?? 'synced',
    hanetSyncError: r.hanet_sync_error ?? null,
    faceError: r.face_error ?? null,
    emailStatus: r.email_status ?? 'none',
    emailError: r.email_error ?? null,
    canLogin: r.can_login === 1,
    createdAt: r.created_at,
  };
}

export function getUser(db: Db, id: string): User | null {
  const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id) as Row | undefined;
  return row ? mapUser(row) : null;
}

export function canSeeUser(viewer: AuthUser, target: { id: string; departmentId: string | null; areaId: string | null }): boolean {
  const scope = scopeFor(viewer);
  if (scope.kind === 'all') return true;
  if (scope.kind === 'self') return target.id === scope.userId;
  if (scope.kind === 'areas') return target.areaId !== null && scope.areaIds.includes(target.areaId);
  return scope.departmentId !== null && target.departmentId === scope.departmentId;
}
