import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { Db } from './db';
import type { UserRole } from '../shared/types';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
  const actual = scryptSync(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  return timingSafeEqual(actual, expected);
}

// Bỏ các ký tự dễ nhầm: 0 O 1 l I
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 10): string {
  let s = '';
  for (const b of randomBytes(length)) s += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
  return s;
}

export function validateNewPassword(newPassword: unknown, currentPassword: string): string | null {
  if (typeof newPassword !== 'string' || newPassword.length < 8) return 'Mật khẩu mới phải có ít nhất 8 ký tự';
  if (newPassword === currentPassword) return 'Mật khẩu mới phải khác mật khẩu hiện tại';
  return null;
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** So sánh hằng thời gian cho hai chuỗi bất kỳ độ dài (băm trước để cùng độ dài). */
export function safeEqualStrings(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  code: string;
  name: string;
  role: UserRole;
  departmentId: string | null;
  mustChangePassword: boolean;
  /** Khu được giao (chỉ với area_admin), đọc lại mỗi request để gỡ quyền có hiệu lực ngay. */
  areaIds: string[];
}

export function createSession(db: Db, userId: string, now: number): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    now,
    now + SESSION_TTL_MS,
  );
  return token;
}

export function findSessionUser(db: Db, token: string, now: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.code, u.name, u.role, u.department_id, u.must_change_password, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), now) as Record<string, any> | undefined;
  if (!row || row.status !== 'active') return null;
  const areaIds =
    row.role === 'area_admin'
      ? (db.prepare('SELECT area_id FROM admin_areas WHERE user_id = ? ORDER BY area_id').all(row.id) as { area_id: string }[]).map((r) => r.area_id)
      : [];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    role: row.role,
    departmentId: row.department_id ?? null,
    mustChangePassword: row.must_change_password === 1,
    areaIds,
  };
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function deleteUserSessions(db: Db, userId: string, exceptToken?: string): void {
  if (exceptToken) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(exceptToken));
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export function purgeExpiredSessions(db: Db, now: number): number {
  return Number(db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes);
}

export class LoginLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private max = 5,
    private windowMs = 15 * 60 * 1000,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isBlocked(key: string, now: number): boolean {
    return this.recent(key, now).length >= this.max;
  }

  recordFailure(key: string, now: number): void {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}

export type Scope =
  | { kind: 'all' }
  | { kind: 'areas'; areaIds: string[] }
  | { kind: 'department'; departmentId: string | null }
  | { kind: 'self'; userId: string };

export function scopeFor(user: AuthUser): Scope {
  if (user.role === 'hr') return { kind: 'all' };
  if (user.role === 'area_admin') return { kind: 'areas', areaIds: user.areaIds };
  if (user.role === 'dept_manager') return { kind: 'department', departmentId: user.departmentId };
  return { kind: 'self', userId: user.id };
}

export function scopeWhere(scope: Scope, userIdCol: string, deptCol: string): { sql: string; params: string[] } {
  switch (scope.kind) {
    case 'all':
      return { sql: '1=1', params: [] };
    case 'areas':
      return scope.areaIds.length
        ? { sql: `${deptCol} IN (SELECT id FROM departments WHERE area_id IN (${scope.areaIds.map(() => '?').join(', ')}))`, params: [...scope.areaIds] }
        : { sql: '0=1', params: [] };
    case 'department':
      return scope.departmentId ? { sql: `${deptCol} = ?`, params: [scope.departmentId] } : { sql: '0=1', params: [] };
    case 'self':
      return { sql: `${userIdCol} = ?`, params: [scope.userId] };
  }
}
