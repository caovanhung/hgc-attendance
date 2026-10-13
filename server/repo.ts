import type { Db } from './db';
import type { User } from '../shared/types';
import { scopeFor, type AuthUser } from './auth';

export type Row = Record<string, any>;

export const USER_SELECT = `SELECT u.id, u.code, u.name, u.email, u.phone, u.role, u.department_id,
  d.name AS department_name, u.position, u.avatar_url, u.hanet_person_id, u.face_registered, u.status, u.created_at
  FROM users u LEFT JOIN departments d ON d.id = u.department_id`;

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
    position: r.position ?? '',
    avatarUrl: r.avatar_url ?? '',
    hanetPersonId: r.hanet_person_id ?? null,
    faceRegistered: r.face_registered === 1,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function getUser(db: Db, id: string): User | null {
  const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id) as Row | undefined;
  return row ? mapUser(row) : null;
}

export function canSeeUser(viewer: AuthUser, target: { id: string; departmentId: string | null }): boolean {
  const scope = scopeFor(viewer);
  if (scope.kind === 'all') return true;
  if (scope.kind === 'self') return target.id === scope.userId;
  return scope.departmentId !== null && target.departmentId === scope.departmentId;
}
