import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError } from '../errors';
import { currentUser, requireRole, requireSystemAdmin } from '../middleware';
import { backupNow } from '../backup';
import type { Row } from '../repo';
import { CODE_RE } from './users';
import { toVnDate } from '../vntime';
import type { Department } from '../../shared/types';

const DEPT_SELECT = `SELECT d.id, d.code, d.name, d.description, d.manager_id, m.name AS manager_name, d.hanet_sync_status, d.hanet_sync_error, d.created_at,
  (SELECT COUNT(*) FROM users x WHERE x.department_id = d.id) AS member_count
  FROM departments d LEFT JOIN users m ON m.id = d.manager_id`;

function mapDept(r: Row): Department {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description ?? '',
    managerId: r.manager_id ?? null,
    managerName: r.manager_name ?? null,
    memberCount: Number(r.member_count),
    hanetSyncStatus: r.hanet_sync_status ?? 'synced',
    hanetSyncError: r.hanet_sync_error ?? null,
    createdAt: r.created_at,
  };
}

function getDept(db: Db, id: string): Department | null {
  const row = db.prepare(`${DEPT_SELECT} WHERE d.id = ?`).get(id) as Row | undefined;
  return row ? mapDept(row) : null;
}

function resolveManager(db: Db, managerId: unknown): string | null {
  if (managerId === undefined || managerId === null || managerId === '') return null;
  if (typeof managerId !== 'string' || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(managerId)) {
    throw new HttpError(400, 'Trưởng phòng được chọn không tồn tại');
  }
  return managerId;
}

/** Mã tự sinh khi HR không nhập: PB001, PB002... (tiếp sau số lớn nhất đang có). */
function nextDepartmentCode(db: Db): string {
  const codes = db.prepare("SELECT code FROM departments WHERE code GLOB 'PB[0-9]*'").all() as { code: string }[];
  const max = codes.reduce((m, { code }) => (/^PB\d+$/.test(code) ? Math.max(m, Number(code.slice(2))) : m), 0);
  return `PB${String(max + 1).padStart(3, '0')}`;
}

export function departmentRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/departments', (_req, res) => {
    const rows = db.prepare(`${DEPT_SELECT} ORDER BY d.code`).all() as Row[];
    res.json({ departments: rows.map(mapDept) });
  });

  r.post('/departments', requireRole('hr'), (req, res) => {
    const b = req.body ?? {};
    const given = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
    const code = given || nextDepartmentCode(db);
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!CODE_RE.test(code)) throw new HttpError(400, 'Mã phòng ban không hợp lệ');
    if (!name) throw new HttpError(400, 'Tên phòng ban là bắt buộc');
    const managerId = resolveManager(db, b.managerId);
    if (db.prepare('SELECT 1 FROM departments WHERE code = ?').get(code)) throw new HttpError(409, 'Mã phòng ban đã tồn tại');
    const id = newId('dep');
    db.prepare('INSERT INTO departments(id, code, name, description, manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      code,
      name,
      typeof b.description === 'string' ? b.description.trim() : '',
      managerId,
      toVnDate(ctx.now()),
    );
    res.json({ department: getDept(db, id) });
  });

  r.put('/departments/:id', requireRole('hr'), (req, res) => {
    const dept = getDept(db, req.params.id);
    if (!dept) throw new HttpError(404, 'Không tìm thấy phòng ban');
    const b = req.body ?? {};
    if (b.name !== undefined) {
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) throw new HttpError(400, 'Tên phòng ban là bắt buộc');
      db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name, dept.id);
    }
    if (b.description !== undefined) {
      db.prepare('UPDATE departments SET description = ? WHERE id = ?').run(typeof b.description === 'string' ? b.description.trim() : '', dept.id);
    }
    if (b.managerId !== undefined) {
      db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(resolveManager(db, b.managerId), dept.id);
    }
    res.json({ department: getDept(db, dept.id) });
  });

  r.delete('/departments/:id', requireSystemAdmin, (req, res) => {
    const actor = currentUser(req);
    const dept = getDept(db, req.params.id);
    if (!dept) throw new HttpError(404, 'Không tìm thấy phòng ban');
    const backup = backupNow(db, ctx.config.backupDir, 'pre-delete', ctx.now());
    // Khóa ngoại tự chuyển thành viên về "chưa có phòng ban".
    db.prepare('DELETE FROM departments WHERE id = ?').run(dept.id);
    console.warn(`[SECURITY] department_deleted by=${actor.code} target=${dept.code} backup=${backup} ip=${req.ip}`);
    res.json({ success: true, backup });
  });

  return r;
}
