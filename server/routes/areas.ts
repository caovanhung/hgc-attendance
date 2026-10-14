import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError } from '../errors';
import { currentUser } from '../middleware';
import { isGlobalHr, notFound, requireGlobalHr } from '../access';
import type { AuthUser } from '../auth';
import type { Row } from '../repo';
import { CODE_RE } from '../validation';
import { SYSTEM_ADMIN_CODE } from '../bootstrap';
import { toVnDate } from '../vntime';
import type { Area } from '../../shared/types';

const AREA_SELECT = `SELECT a.id, a.code, a.name, a.note, a.created_at,
  (SELECT COUNT(*) FROM departments d WHERE d.area_id = a.id) AS department_count,
  (SELECT COUNT(*) FROM cameras c WHERE c.area_id = a.id) AS camera_count,
  (SELECT COUNT(*) FROM users u JOIN departments d ON d.id = u.department_id WHERE d.area_id = a.id AND u.code != '${SYSTEM_ADMIN_CODE}') AS member_count,
  (SELECT group_concat(u.name, '|') FROM admin_areas x JOIN users u ON u.id = x.user_id WHERE x.area_id = a.id) AS admin_names
  FROM areas a`;

function mapArea(r: Row): Area {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    note: r.note ?? '',
    departmentCount: Number(r.department_count),
    cameraCount: Number(r.camera_count),
    memberCount: Number(r.member_count),
    adminNames: r.admin_names ? String(r.admin_names).split('|').sort((x, y) => x.localeCompare(y, 'vi')) : [],
    createdAt: r.created_at,
  };
}

function getArea(db: Db, id: string): Area | null {
  const row = db.prepare(`${AREA_SELECT} WHERE a.id = ?`).get(id) as Row | undefined;
  return row ? mapArea(row) : null;
}

/** Khu người gọi được thấy: HR toàn hệ thống mọi khu, quản trị khu các khu được giao, người khác không khu nào. */
export function listAreasFor(db: Db, u: AuthUser): Area[] {
  if (isGlobalHr(u)) return (db.prepare(`${AREA_SELECT} ORDER BY a.code`).all() as Row[]).map(mapArea);
  if (u.role !== 'area_admin' || u.areaIds.length === 0) return [];
  const rows = db.prepare(`${AREA_SELECT} WHERE a.id IN (${u.areaIds.map(() => '?').join(', ')}) ORDER BY a.code`).all(...u.areaIds) as Row[];
  return rows.map(mapArea);
}

/** Mã tự sinh KV01, KV02... (tiếp sau số lớn nhất đang có). */
function nextAreaCode(db: Db): string {
  const codes = db.prepare("SELECT code FROM areas WHERE code GLOB 'KV[0-9]*'").all() as { code: string }[];
  const max = codes.reduce((m, { code }) => (/^KV\d+$/.test(code) ? Math.max(m, Number(code.slice(2))) : m), 0);
  return `KV${String(max + 1).padStart(2, '0')}`;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function areaRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/areas', (req, res) => {
    res.json({ areas: listAreasFor(db, currentUser(req)) });
  });

  r.post('/areas', requireGlobalHr, (req, res) => {
    const b = req.body ?? {};
    const code = text(b.code).toUpperCase() || nextAreaCode(db);
    const name = text(b.name);
    if (!CODE_RE.test(code)) throw new HttpError(400, 'Mã khu vực không hợp lệ');
    if (!name) throw new HttpError(400, 'Tên khu vực là bắt buộc');
    if (db.prepare('SELECT 1 FROM areas WHERE code = ?').get(code)) throw new HttpError(409, 'Mã khu vực đã tồn tại');
    const id = newId('area');
    db.prepare('INSERT INTO areas(id, code, name, note, created_at) VALUES (?, ?, ?, ?, ?)').run(id, code, name, text(b.note), toVnDate(ctx.now()));
    res.json({ area: getArea(db, id) });
  });

  r.put('/areas/:id', requireGlobalHr, (req, res) => {
    const area = getArea(db, req.params.id);
    if (!area) throw notFound('khu vực');
    const b = req.body ?? {};
    const name = b.name === undefined ? area.name : text(b.name);
    if (!name) throw new HttpError(400, 'Tên khu vực là bắt buộc');
    db.prepare('UPDATE areas SET name = ?, note = ? WHERE id = ?').run(name, b.note === undefined ? area.note : text(b.note), area.id);
    res.json({ area: getArea(db, area.id) });
  });

  r.delete('/areas/:id', requireGlobalHr, (req, res) => {
    const area = getArea(db, req.params.id);
    if (!area) throw notFound('khu vực');
    if (area.departmentCount > 0 || area.cameraCount > 0) {
      throw new HttpError(409, 'Khu vực còn phòng ban hoặc camera: hãy chuyển sang khu khác trước khi xóa');
    }
    db.prepare('DELETE FROM areas WHERE id = ?').run(area.id);
    console.warn(`[SECURITY] area_deleted by=${currentUser(req).code} target=${area.code} ip=${req.ip}`);
    res.json({ success: true });
  });

  return r;
}
