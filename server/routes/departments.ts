import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId, tx } from '../db';
import { HttpError } from '../errors';
import { currentUser } from '../middleware';
import { backupNow } from '../backup';
import { areaColumnSql, departmentScopeSql, managesArea, notFound, parseAreaFilter, requireManager, resolveAreaFor } from '../access';
import type { AuthUser } from '../auth';
import { dropEntityJobs, enqueue, kickEntity } from '../hanet-sync';
import { getUser, type Row } from '../repo';
import { CODE_RE } from '../validation';
import { toVnDate } from '../vntime';
import { monthToDate, recomputeUsers } from '../attendance';
import type { Department } from '../../shared/types';

const DEPT_SELECT = `SELECT d.id, d.code, d.name, d.description, d.manager_id, m.name AS manager_name, d.hanet_sync_status, d.hanet_sync_error, d.created_at,
  d.shift_id, ds.name AS shift_name,
  d.area_id, ar.name AS area_name,
  (SELECT COUNT(*) FROM users x WHERE x.department_id = d.id) AS member_count
  FROM departments d LEFT JOIN users m ON m.id = d.manager_id LEFT JOIN areas ar ON ar.id = d.area_id LEFT JOIN shifts ds ON ds.id = d.shift_id`;

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
    shiftId: r.shift_id ?? null,
    shiftName: r.shift_name ?? null,
    areaId: r.area_id ?? null,
    areaName: r.area_name ?? null,
    createdAt: r.created_at,
  };
}

function getDept(db: Db, id: string): Department | null {
  const row = db.prepare(`${DEPT_SELECT} WHERE d.id = ?`).get(id) as Row | undefined;
  return row ? mapDept(row) : null;
}

function resolveManager(db: Db, actor: AuthUser, managerId: unknown): string | null {
  if (managerId === undefined || managerId === null || managerId === '') return null;
  const m = typeof managerId === 'string' ? getUser(db, managerId) : null;
  if (!m) throw new HttpError(400, 'Trưởng phòng được chọn không tồn tại');
  if (!managesArea(actor, m.areaId)) throw notFound('nhân sự');
  return m.id;
}

/** Ca cho phòng ban: null = ca mặc định; ca phải thuộc đúng khu của phòng. */
function resolveDeptShift(db: Db, shiftId: unknown, areaId: string | null): string | null {
  if (shiftId === undefined || shiftId === null || shiftId === '') return null;
  const s = typeof shiftId === 'string' ? (db.prepare('SELECT area_id FROM shifts WHERE id = ?').get(shiftId) as { area_id: string } | undefined) : undefined;
  if (!s || s.area_id !== areaId) throw new HttpError(400, 'Ca không thuộc khu của phòng ban này');
  return shiftId as string;
}

/** Phòng ban trong phạm vi quản lý, không thì 404. */
function manageableDept(db: Db, actor: AuthUser, id: string): Department {
  const dept = getDept(db, id);
  if (!dept || !managesArea(actor, dept.areaId)) throw notFound('phòng ban');
  return dept;
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

  r.get('/departments', (req, res) => {
    const actor = currentUser(req);
    const s = departmentScopeSql(actor);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), 'd.area_id');
    const rows = db.prepare(`${DEPT_SELECT} WHERE ${s.sql} AND ${f.sql} ORDER BY d.code`).all(...s.params, ...f.params) as Row[];
    res.json({ departments: rows.map(mapDept) });
  });

  r.post('/departments', requireManager, (req, res) => {
    const actor = currentUser(req);
    const b = req.body ?? {};
    const given = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
    const code = given || nextDepartmentCode(db);
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!CODE_RE.test(code)) throw new HttpError(400, 'Mã phòng ban không hợp lệ');
    if (!name) throw new HttpError(400, 'Tên phòng ban là bắt buộc');
    const areaId = resolveAreaFor(db, actor, b.areaId);
    const shiftId = resolveDeptShift(db, b.shiftId, areaId);
    const managerId = resolveManager(db, actor, b.managerId);
    if (db.prepare('SELECT 1 FROM departments WHERE code = ?').get(code)) throw new HttpError(409, 'Mã phòng ban đã tồn tại');
    const id = newId('dep');
    db.prepare('INSERT INTO departments(id, code, name, description, manager_id, shift_id, area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      code,
      name,
      typeof b.description === 'string' ? b.description.trim() : '',
      managerId,
      shiftId,
      areaId,
      toVnDate(ctx.now()),
    );
    enqueue(db, 'department', id, 'dept.create', { name, desc: typeof b.description === 'string' ? b.description.trim() : '' }, ctx.now());
    kickEntity(ctx, 'department', id);
    res.json({ department: getDept(db, id) });
  });

  r.put('/departments/:id', requireManager, (req, res) => {
    const actor = currentUser(req);
    const dept = manageableDept(db, actor, req.params.id);
    const b = req.body ?? {};
    // Kiểm tra hết trước khi ghi: bị từ chối thì không đổi gì
    const name = b.name === undefined ? undefined : typeof b.name === 'string' ? b.name.trim() : '';
    if (name === '') throw new HttpError(400, 'Tên phòng ban là bắt buộc');
    const areaId = b.areaId === undefined ? undefined : resolveAreaFor(db, actor, b.areaId);
    const areaAfter = areaId === undefined ? dept.areaId : areaId;
    const shiftId = b.shiftId === undefined ? undefined : resolveDeptShift(db, b.shiftId, areaAfter);
    const managerId = b.managerId === undefined ? undefined : resolveManager(db, actor, b.managerId);
    tx(db, () => {
      if (name !== undefined) db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name, dept.id);
      if (b.description !== undefined) {
        db.prepare('UPDATE departments SET description = ? WHERE id = ?').run(typeof b.description === 'string' ? b.description.trim() : '', dept.id);
      }
      if (shiftId !== undefined) db.prepare('UPDATE departments SET shift_id = ? WHERE id = ?').run(shiftId, dept.id);
      if (areaId !== undefined) db.prepare('UPDATE departments SET area_id = ? WHERE id = ?').run(areaId, dept.id);
      if (managerId !== undefined) db.prepare('UPDATE departments SET manager_id = ? WHERE id = ?').run(managerId, dept.id);
    });
    if (shiftId !== undefined || areaId !== undefined) {
      const members = (db.prepare('SELECT id FROM users WHERE department_id = ?').all(dept.id) as { id: string }[]).map((x) => x.id);
      const { from, to } = monthToDate(ctx.now());
      recomputeUsers(db, members, from, to, ctx.now());
    }
    const after = getDept(db, dept.id)!;
    if (after.name !== dept.name || after.description !== dept.description) {
      enqueue(db, 'department', dept.id, 'dept.update', { name: after.name, desc: after.description }, ctx.now());
      kickEntity(ctx, 'department', dept.id);
    }
    res.json({ department: getDept(db, dept.id) });
  });

  r.delete('/departments/:id', requireManager, (req, res) => {
    const actor = currentUser(req);
    const dept = manageableDept(db, actor, req.params.id);
    const backup = backupNow(db, ctx.config.backupDir, 'pre-delete', ctx.now());
    const hanetDeptId = (db.prepare('SELECT hanet_department_id FROM departments WHERE id = ?').get(dept.id) as { hanet_department_id: string | null })
      .hanet_department_id;
    if (hanetDeptId) enqueue(db, 'department', dept.id, 'dept.remove', { hanetDepartmentId: hanetDeptId, name: dept.name }, ctx.now());
    else dropEntityJobs(db, 'department', dept.id);
    // Khóa ngoại tự chuyển thành viên về "chưa có phòng ban".
    db.prepare('DELETE FROM departments WHERE id = ?').run(dept.id);
    console.warn(`[SECURITY] department_deleted by=${actor.code} target=${dept.code} backup=${backup} ip=${req.ip}`);
    kickEntity(ctx, 'department', dept.id);
    res.json({ success: true, backup });
  });

  return r;
}
