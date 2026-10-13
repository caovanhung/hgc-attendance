import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { USER_SELECT, getUser, mapUser, type Row } from '../repo';
import { deleteUserSessions, generateTempPassword, hashPassword, scopeFor, scopeWhere } from '../auth';
import { toVnDate } from '../vntime';
import type { UserRole } from '../../shared/types';

const ROLES: UserRole[] = ['hr', 'dept_manager', 'employee'];
export const CODE_RE = /^[A-Z0-9._-]{1,32}$/;
const CODE_ERROR = 'Mã chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới (tối đa 32 ký tự)';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined);

function resolveDepartment(db: Db, departmentId: unknown): string | null {
  if (departmentId === undefined || departmentId === null || departmentId === '') return null;
  if (typeof departmentId !== 'string' || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(departmentId)) {
    throw new HttpError(400, 'Phòng ban không tồn tại');
  }
  return departmentId;
}

export function userRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/users', (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), 'u.id', 'u.department_id');
    const rows = db.prepare(`${USER_SELECT} WHERE ${w.sql} ORDER BY u.code`).all(...w.params) as Row[];
    res.json({ users: rows.map(mapUser) });
  });

  r.post('/users', requireRole('hr'), (req, res) => {
    const b = req.body ?? {};
    const code = (str(b.code) ?? '').toUpperCase();
    const name = str(b.name) ?? '';
    if (!CODE_RE.test(code)) throw new HttpError(400, CODE_ERROR);
    if (!name) throw new HttpError(400, 'Họ tên là bắt buộc');
    const role: UserRole = b.role === undefined ? 'employee' : b.role;
    if (!ROLES.includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');
    const departmentId = resolveDepartment(db, b.departmentId);
    if (db.prepare('SELECT 1 FROM users WHERE code = ?').get(code)) throw new HttpError(409, 'Mã nhân viên đã tồn tại');

    const id = newId('usr');
    const tempPassword = generateTempPassword();
    db.prepare(
      `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
         face_registered, status, password_hash, must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, 1, ?)`,
    ).run(
      id,
      code,
      name,
      str(b.email) ?? '',
      str(b.phone) ?? '',
      role,
      departmentId,
      str(b.position) ?? '',
      str(b.avatarUrl) ?? '',
      str(b.hanetPersonId) || null,
      hashPassword(tempPassword),
      toVnDate(ctx.now()),
    );
    res.json({ user: getUser(db, id), tempPassword });
  });

  r.put('/users/:id', requireRole('hr'), (req, res) => {
    const actor = currentUser(req);
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    const b = req.body ?? {};
    const changesRole = b.role !== undefined && b.role !== target.role;
    const changesStatus = b.status !== undefined && b.status !== target.status;
    if (target.id === actor.id && (changesRole || changesStatus)) {
      throw new HttpError(400, 'Không thể tự đổi vai trò hoặc trạng thái của chính mình');
    }

    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    const set = (col: string, val: string | number | null) => {
      sets.push(`${col} = ?`);
      params.push(val);
    };
    if (b.name !== undefined) {
      const name = str(b.name);
      if (!name) throw new HttpError(400, 'Họ tên là bắt buộc');
      set('name', name);
    }
    for (const [key, col] of [['email', 'email'], ['phone', 'phone'], ['position', 'position'], ['avatarUrl', 'avatar_url']] as const) {
      if (b[key] !== undefined) set(col, str(b[key]) ?? '');
    }
    if (b.hanetPersonId !== undefined) set('hanet_person_id', str(b.hanetPersonId) || null);
    if (b.faceRegistered !== undefined) set('face_registered', b.faceRegistered ? 1 : 0);
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) throw new HttpError(400, 'Vai trò không hợp lệ');
      set('role', b.role);
    }
    if (b.status !== undefined) {
      if (b.status !== 'active' && b.status !== 'inactive') throw new HttpError(400, 'Trạng thái không hợp lệ');
      set('status', b.status);
    }
    if (b.departmentId !== undefined) set('department_id', resolveDepartment(db, b.departmentId));

    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, target.id);
    if (b.status === 'inactive' && target.status !== 'inactive') deleteUserSessions(db, target.id);
    res.json({ user: getUser(db, target.id) });
  });

  r.post('/users/:id/reset-password', requireRole('hr'), (req, res) => {
    const actor = currentUser(req);
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    const tempPassword = generateTempPassword();
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(tempPassword), target.id);
    deleteUserSessions(db, target.id);
    console.warn(`[SECURITY] password_reset by=${actor.code} target=${target.code} ip=${req.ip}`);
    res.json({ tempPassword });
  });

  return r;
}
