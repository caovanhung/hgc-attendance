import type { RequestHandler } from 'express';
import type { Db } from './db';
import type { AuthUser } from './auth';
import { HttpError } from './errors';
import { SYSTEM_ADMIN_CODE } from './bootstrap';
import type { User } from '../shared/types';

type Sql = { sql: string; params: string[] };

export const isSystemAdmin = (u: AuthUser): boolean => u.code === SYSTEM_ADMIN_CODE;
export const isGlobalHr = (u: AuthUser): boolean => u.role === 'hr';
export const isManager = (u: AuthUser): boolean => u.role === 'hr' || u.role === 'area_admin';

function gate(ok: (u: AuthUser) => boolean, message: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !ok(req.user)) return next(new HttpError(403, message));
    next();
  };
}

/** Khu vực, cấp quyền quản trị khu, camera từ Camera AI, giờ làm việc: chỉ HR toàn hệ thống. */
export const requireGlobalHr = gate(isGlobalHr, 'Chỉ HR toàn hệ thống được thực hiện thao tác này');
/** HR toàn hệ thống hoặc quản trị khu vực; route phải tự kiểm tra đối tượng thuộc phạm vi. */
export const requireManager = gate(isManager, 'Bạn không có quyền thực hiện thao tác này');

/** Người gọi quản lý được khu này. HR toàn hệ thống: mọi khu, kể cả "chưa gán khu" (null). */
export function managesArea(u: AuthUser, areaId: string | null): boolean {
  if (isGlobalHr(u)) return true;
  return u.role === 'area_admin' && areaId !== null && u.areaIds.includes(areaId);
}

/** Đối tượng ngoài phạm vi trả 404 như không tồn tại (không lộ dữ liệu khu khác). */
export function notFound(what: string): HttpError {
  return new HttpError(404, `Không tìm thấy ${what}`);
}

export function deptAreaId(db: Db, departmentId: string): string | null | undefined {
  const row = db.prepare('SELECT area_id FROM departments WHERE id = ?').get(departmentId) as { area_id: string | null } | undefined;
  return row ? row.area_id : undefined;
}

/** Khu của camera theo mã thiết bị; camera chưa có trong danh sách web thì coi như chưa gán khu. */
export function deviceAreaId(db: Db, deviceKey: string): string | null {
  const row = db.prepare('SELECT area_id FROM cameras WHERE device_key = ?').get(deviceKey) as { area_id: string | null } | undefined;
  return row?.area_id ?? null;
}

export type AreaFilter = { kind: 'all' } | { kind: 'none' } | { kind: 'area'; areaId: string };

/** Bộ lọc `?area=` của các API danh sách: `all` (mặc định), `none` (chỉ HR toàn hệ thống), hoặc id khu trong phạm vi. */
export function parseAreaFilter(db: Db, u: AuthUser, raw: unknown): AreaFilter {
  if (raw === undefined || raw === '' || raw === 'all') return { kind: 'all' };
  if (raw === 'none') {
    if (!isGlobalHr(u)) throw notFound('khu vực');
    return { kind: 'none' };
  }
  if (typeof raw !== 'string' || !db.prepare('SELECT 1 FROM areas WHERE id = ?').get(raw) || !managesArea(u, raw)) throw notFound('khu vực');
  return { kind: 'area', areaId: raw };
}

/** Lọc nhân sự theo khu của phòng ban (deptCol: cột phòng ban, ví dụ 'u.department_id'). */
export function areaFilterSql(f: AreaFilter, deptCol: string): Sql {
  if (f.kind === 'all') return { sql: '1=1', params: [] };
  if (f.kind === 'none') return { sql: `(${deptCol} IS NULL OR ${deptCol} IN (SELECT id FROM departments WHERE area_id IS NULL))`, params: [] };
  return { sql: `${deptCol} IN (SELECT id FROM departments WHERE area_id = ?)`, params: [f.areaId] };
}

/** Lọc trực tiếp theo cột area_id (phòng ban, camera). */
export function areaColumnSql(f: AreaFilter, col: string): Sql {
  if (f.kind === 'all') return { sql: '1=1', params: [] };
  if (f.kind === 'none') return { sql: `${col} IS NULL`, params: [] };
  return { sql: `${col} = ?`, params: [f.areaId] };
}

function inAreas(col: string, ids: string[]): Sql {
  return ids.length ? { sql: `${col} IN (${ids.map(() => '?').join(', ')})`, params: [...ids] } : { sql: '0=1', params: [] };
}

/** Phòng ban người gọi được thấy (bảng departments có alias `d`). Trưởng phòng/nhân viên: chỉ phòng của mình. */
export function departmentScopeSql(u: AuthUser): Sql {
  if (isGlobalHr(u)) return { sql: '1=1', params: [] };
  if (u.role === 'area_admin') return inAreas('d.area_id', u.areaIds);
  return u.departmentId ? { sql: 'd.id = ?', params: [u.departmentId] } : { sql: '0=1', params: [] };
}

/** Camera người gọi được thấy (bảng cameras có alias `c`). Trưởng phòng: camera thuộc khu của phòng mình. */
export function cameraScopeSql(u: AuthUser): Sql {
  if (isGlobalHr(u)) return { sql: '1=1', params: [] };
  if (u.role === 'area_admin') return inAreas('c.area_id', u.areaIds);
  if (u.role === 'dept_manager' && u.departmentId) {
    return { sql: 'c.area_id IS NOT NULL AND c.area_id = (SELECT area_id FROM departments WHERE id = ?)', params: [u.departmentId] };
  }
  return { sql: '0=1', params: [] };
}

/**
 * Bảng xóa của spec mục 5: ADMIN xóa mọi người (trừ chính ADMIN); HR toàn hệ thống xóa mọi người trừ người có vai trò hr;
 * quản trị khu xóa nhân viên/trưởng phòng trong khu mình. Không ai tự xóa mình.
 */
export function canDeleteUser(actor: AuthUser, target: User): boolean {
  if (target.id === actor.id || target.code === SYSTEM_ADMIN_CODE) return false;
  if (isSystemAdmin(actor)) return true;
  if (target.role === 'hr') return false;
  if (isGlobalHr(actor)) return true;
  return actor.role === 'area_admin' && (target.role === 'employee' || target.role === 'dept_manager') && managesArea(actor, target.areaId);
}

/** Khu cho phòng ban/camera: phải tồn tại và trong phạm vi (không thì 404); quản trị khu không được để "chưa gán khu". */
export function resolveAreaFor(db: Db, u: AuthUser, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') {
    if (u.role === 'area_admin') throw new HttpError(400, 'Hãy chọn khu vực');
    return null;
  }
  if (typeof raw !== 'string' || !db.prepare('SELECT 1 FROM areas WHERE id = ?').get(raw) || !managesArea(u, raw)) throw notFound('khu vực');
  return raw;
}
