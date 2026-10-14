import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError, ah } from '../errors';
import { currentUser, requireRole, requireSystemAdmin } from '../middleware';
import { backupNow } from '../backup';
import { USER_SELECT, getUser, mapUser, type Row } from '../repo';
import { deleteUserSessions, generateTempPassword, hashPassword, scopeFor, scopeWhere } from '../auth';
import { toVnDate } from '../vntime';
import { NOT_SYSTEM_ADMIN, SYSTEM_ADMIN_CODE } from '../bootstrap';
import { deleteSighting, getSighting, listSightings, SIGHTING_TTL_MS } from '../sightings';
import { registerFace } from '../hanet-face';
import { dropEntityJobs, enqueue, kickAll, kickEntity } from '../hanet-sync';
import { fetchAllPersons, hanetAliases, IMPORT_MAX, importPersons, unlinkedPersons } from '../hanet-import';
import { getPlaceIds, reconcileEnabled } from '../hanet';
import { CODE_ERROR, CODE_RE } from '../validation';
import type { FaceCandidates, FaceResult, UserRole } from '../../shared/types';

const ROLES: UserRole[] = ['hr', 'dept_manager', 'employee'];
export { CODE_RE } from '../validation';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() : undefined);

/** Một Person ID chỉ gắn với một nhân sự: webhook khớp theo Person ID sẽ ghi công nhầm người. */
function assertPersonIdFree(db: Db, personId: string | null, userId: string | null): void {
  if (!personId) return;
  const holder = db.prepare('SELECT id FROM users WHERE hanet_person_id = ?').get(personId) as { id: string } | undefined;
  if (holder && holder.id !== userId) throw new HttpError(409, 'Person ID này đã gắn với nhân sự khác');
}

/** Gắn Person ID thủ công: ghi mã nhân viên làm aliasID trên Hanet (cùng dạng việc như khi nhập), để webhook và các việc theo mã khớp đúng người. */
function enqueueAlias(db: Db, userId: string, personId: string, code: string, now: number): void {
  enqueue(db, 'user', userId, 'user.alias', { personId, code }, now);
}

function resolveDepartment(db: Db, departmentId: unknown): string | null {
  if (departmentId === undefined || departmentId === null || departmentId === '') return null;
  if (typeof departmentId !== 'string' || !db.prepare('SELECT 1 FROM departments WHERE id = ?').get(departmentId)) {
    throw new HttpError(400, 'Phòng ban không tồn tại');
  }
  return departmentId;
}

/** Ảnh để đăng ký FaceID: lượt chụp chưa khớp (sightingId) hoặc lượt quẹt của chính người đó trong 24 giờ (detectionId). */
function resolveFaceImage(db: Db, userId: string | null, b: Record<string, unknown>, now: number): { url: string; sightingId: number | null } | null {
  if (b.sightingId !== undefined && b.sightingId !== null && b.sightingId !== '') {
    const s = getSighting(db, Number(b.sightingId));
    if (!s) throw new HttpError(404, 'Không tìm thấy lượt chụp này, hãy chọn lượt mới hơn');
    return { url: s.imageUrl, sightingId: s.id };
  }
  if (b.detectionId !== undefined && b.detectionId !== null && userId) {
    const row = db
      .prepare("SELECT image_url FROM detections WHERE id = ? AND user_id = ? AND ts >= ? AND image_url IS NOT NULL AND image_url != ''")
      .get(Number(b.detectionId), userId, now - SIGHTING_TTL_MS) as { image_url: string } | undefined;
    if (!row) throw new HttpError(404, 'Không tìm thấy ảnh của lượt quẹt này (chỉ dùng được lượt trong 24 giờ)');
    return { url: row.image_url, sightingId: null };
  }
  return null;
}

export function userRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();
  const deps = { db, fetch: ctx.fetch, now: ctx.now };

  r.get('/users', (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), 'u.id', 'u.department_id');
    const rows = db.prepare(`${USER_SELECT} WHERE ${NOT_SYSTEM_ADMIN} AND ${w.sql} ORDER BY u.code`).all(...w.params) as Row[];
    res.json({ users: rows.map(mapUser) });
  });

  r.post(
    '/users/import',
    requireRole('hr'),
    ah(async (req, res) => {
      const b = req.body ?? {};
      const wanted = new Set(
        (Array.isArray(b.persons) ? b.persons : []).map((p: { personId?: unknown }) => String(p?.personId ?? '')).filter(Boolean),
      );
      if (wanted.size === 0) throw new HttpError(400, 'Chưa chọn người nào để nhập');
      if (wanted.size > IMPORT_MAX) throw new HttpError(400, `Mỗi lần nhập tối đa ${IMPORT_MAX} người`);
      const departmentId = resolveDepartment(db, b.departmentId);
      const placeId = getPlaceIds(db)[0];
      if (!reconcileEnabled(db) || !placeId) throw new HttpError(400, 'Chưa cấu hình kết nối Camera AI (Client ID, Refresh Token, địa điểm)');
      let all;
      try {
        all = await fetchAllPersons(deps, placeId);
      } catch (err) {
        throw new HttpError(502, `Không lấy được danh sách người từ Camera AI: ${(err as Error).message}`);
      }
      // Không tin dữ liệu client: chỉ nhập người thật sự có trên Hanet và chưa liên kết
      const chosen = unlinkedPersons(db, all).filter((p) => wanted.has(String(p.personID)));
      if (chosen.length === 0) throw new HttpError(400, 'Không có người hợp lệ để nhập (có thể đã được nhập trước đó)');
      const created = importPersons(db, chosen, departmentId, ctx.now(), hanetAliases(all));
      // Một lượt chạy hàng đợi cho cả nhóm, không mở một lượt riêng cho từng người
      kickAll(ctx);
      res.json({ created });
    }),
  );

  r.post(
    '/users',
    requireRole('hr'),
    ah(async (req, res) => {
      const b = req.body ?? {};
      const code = (str(b.code) ?? '').toUpperCase();
      const name = str(b.name) ?? '';
      if (!CODE_RE.test(code)) throw new HttpError(400, CODE_ERROR);
      // Mã ADMIN mang quyền xóa dữ liệu: chỉ hệ thống được tạo, kể cả khi database chưa có tài khoản này.
      if (code === SYSTEM_ADMIN_CODE) throw new HttpError(400, 'Mã ADMIN dành riêng cho tài khoản quản trị hệ thống');
      if (!name) throw new HttpError(400, 'Họ tên là bắt buộc');
      const role: UserRole = b.role === undefined ? 'employee' : b.role;
      if (!ROLES.includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');
      const departmentId = resolveDepartment(db, b.departmentId);
      if (db.prepare('SELECT 1 FROM users WHERE code = ?').get(code)) throw new HttpError(409, 'Mã nhân viên đã tồn tại');
      const image = resolveFaceImage(db, null, b, ctx.now());
      const hanetPersonId = str(b.hanetPersonId) || null;
      assertPersonIdFree(db, hanetPersonId, null);

      const id = newId('usr');
      const tempPassword = generateTempPassword();
      db.prepare(
        `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
           face_registered, status, password_hash, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, ?)`,
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
        hanetPersonId,
        hanetPersonId ? 1 : 0,
        hashPassword(tempPassword),
        toVnDate(ctx.now()),
      );
      // Việc gán aliasID phải đứng trước việc phòng ban/thông tin của người này
      if (hanetPersonId) enqueueAlias(db, id, hanetPersonId, code, ctx.now());
      if (hanetPersonId && departmentId) {
        enqueue(db, 'user', id, 'user.department', { fromHanetDeptId: null, toDepartmentId: departmentId }, ctx.now());
      }
      let face: FaceResult | undefined;
      if (image) {
        face = await registerFace(deps, id, image.url);
        if (face.ok && image.sightingId !== null) deleteSighting(db, image.sightingId);
      }
      kickEntity(ctx, 'user', id);
      res.json({ user: getUser(db, id), tempPassword, ...(face ? { face } : {}) });
    }),
  );

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
    if (b.hanetPersonId !== undefined) {
      const pid = str(b.hanetPersonId) || null;
      assertPersonIdFree(db, pid, target.id);
      set('hanet_person_id', pid);
      set('face_registered', pid ? 1 : 0);
    }
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
    const after = getUser(db, target.id)!;
    const now = ctx.now();
    // Person ID mới gắn: gán aliasID trước, các việc thông tin/phòng ban xếp sau
    if (after.hanetPersonId && after.hanetPersonId !== target.hanetPersonId) enqueueAlias(db, target.id, after.hanetPersonId, after.code, now);
    if (after.faceRegistered && (after.name !== target.name || after.position !== target.position)) {
      enqueue(db, 'user', target.id, 'user.info', { code: after.code, name: after.name, title: after.position }, now);
    }
    const linkedNow = Boolean(after.hanetPersonId) && !target.hanetPersonId;
    if (after.hanetPersonId && (after.departmentId !== target.departmentId || (linkedNow && after.departmentId))) {
      const from =
        target.departmentId && !linkedNow
          ? ((db.prepare('SELECT hanet_department_id FROM departments WHERE id = ?').get(target.departmentId) as { hanet_department_id: string | null } | undefined)
              ?.hanet_department_id ?? null)
          : null;
      enqueue(db, 'user', target.id, 'user.department', { fromHanetDeptId: from, toDepartmentId: after.departmentId }, now);
    }
    kickEntity(ctx, 'user', target.id);
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

  r.post(
    '/users/:id/face',
    requireRole('hr'),
    ah(async (req, res) => {
      const target = getUser(db, req.params.id);
      if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
      const image = resolveFaceImage(db, target.id, req.body ?? {}, ctx.now());
      if (!image) throw new HttpError(400, 'Hãy chọn một lượt camera chụp');
      const face = await registerFace(deps, target.id, image.url);
      if (face.ok && image.sightingId !== null) deleteSighting(db, image.sightingId);
      if (face.ok) kickEntity(ctx, 'user', target.id);
      res.json({ user: getUser(db, target.id), face });
    }),
  );

  r.get('/users/:id/face-candidates', requireRole('hr'), (req, res) => {
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    const now = ctx.now();
    const rows = db
      .prepare(
        `SELECT id, ts, image_url, device_id, device_name FROM detections
         WHERE user_id = ? AND ts >= ? AND image_url IS NOT NULL AND image_url != '' ORDER BY ts DESC LIMIT 30`,
      )
      .all(target.id, now - SIGHTING_TTL_MS) as Row[];
    const body: FaceCandidates = {
      detections: rows.map((d) => ({ id: d.id, ts: d.ts, imageUrl: d.image_url, deviceName: d.device_name ?? d.device_id })),
      strangers: listSightings(db, now, 'stranger'),
    };
    res.json(body);
  });

  r.delete('/users/:id', requireSystemAdmin, (req, res) => {
    const actor = currentUser(req);
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    if (target.id === actor.id) throw new HttpError(400, 'Không thể tự xóa tài khoản đang đăng nhập');
    const backup = backupNow(db, ctx.config.backupDir, 'pre-delete', ctx.now());
    if (target.faceRegistered || target.hanetPersonId) {
      enqueue(db, 'user', target.id, 'user.remove', { code: target.code, name: target.name, personId: target.hanetPersonId }, ctx.now());
    } else {
      dropEntityJobs(db, 'user', target.id);
    }
    // Khóa ngoại tự xóa phiên, lượt nhận diện, bảng công, đơn của người này; bỏ chức trưởng phòng nếu có.
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    console.warn(`[SECURITY] user_deleted by=${actor.code} target=${target.code} backup=${backup} ip=${req.ip}`);
    kickEntity(ctx, 'user', target.id);
    res.json({ success: true, backup });
  });

  return r;
}
