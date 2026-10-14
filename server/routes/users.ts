import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId, tx } from '../db';
import { HttpError, ah } from '../errors';
import { currentUser } from '../middleware';
import { backupNow } from '../backup';
import { USER_SELECT, getUser, mapUser, type Row } from '../repo';
import { deleteUserSessions, scopeFor, scopeWhere, type AuthUser } from '../auth';
import { assertEmailFree, parseEmail, parsePhone } from '../accounts';
import { enqueueMail } from '../mail-queue';
import { toVnDate } from '../vntime';
import { NOT_SYSTEM_ADMIN, SYSTEM_ADMIN_CODE } from '../bootstrap';
import {
  areaFilterSql, canDeleteUser, deptAreaId, deviceAreaId, isGlobalHr, isSystemAdmin, managesArea, notFound, parseAreaFilter, requireManager,
} from '../access';
import { deleteSighting, getSighting, listSightings, SIGHTING_TTL_MS } from '../sightings';
import { registerFace } from '../hanet-face';
import { dropEntityJobs, enqueue, kickAll, kickEntity } from '../hanet-sync';
import { fetchAllPersons, hanetAliases, IMPORT_MAX, importPersons, nextEmployeeCode, unlinkedPersons } from '../hanet-import';
import { getPlaceIds, reconcileEnabled } from '../hanet';
import { CODE_ERROR, CODE_RE } from '../validation';
import type { FaceCandidates, FaceResult, User, UserRole } from '../../shared/types';

const ROLES: UserRole[] = ['hr', 'area_admin', 'dept_manager', 'employee'];
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

/** Nhân sự người gọi được quản lý (chính mình luôn được). Ngoài phạm vi, hoặc tài khoản ADMIN với người khác ADMIN ⇒ 404. */
function manageableUser(db: Db, actor: AuthUser, id: string): User {
  const u = getUser(db, id);
  if (!u || (u.code === SYSTEM_ADMIN_CODE && !isSystemAdmin(actor))) throw notFound('nhân sự');
  if (u.id !== actor.id && !managesArea(actor, u.areaId)) throw notFound('nhân sự');
  return u;
}

/** Chỉ ADMIN sửa người có vai trò hr; quản trị khu không sửa quản trị khu khác. Tự sửa mình luôn qua bước này. */
function assertCanEdit(actor: AuthUser, target: User): void {
  if (target.id === actor.id) return;
  if (target.role === 'hr' && !isSystemAdmin(actor)) throw new HttpError(403, 'Chỉ tài khoản ADMIN được sửa tài khoản HR toàn hệ thống');
  if (actor.role === 'area_admin' && target.role === 'area_admin') throw new HttpError(403, 'Bạn không có quyền sửa tài khoản quản trị khu vực khác');
}

function assertRoleAllowed(actor: AuthUser, role: unknown): asserts role is UserRole {
  if (!ROLES.includes(role as UserRole)) throw new HttpError(400, 'Vai trò không hợp lệ');
  if (role === 'hr' && !isSystemAdmin(actor)) throw new HttpError(403, 'Chỉ tài khoản ADMIN được cấp vai trò HR toàn hệ thống');
  if (role === 'area_admin' && !isGlobalHr(actor)) throw new HttpError(403, 'Chỉ HR toàn hệ thống được cấp quyền quản trị khu vực');
}

/** Phòng ban cho nhân sự: phải thuộc khu người gọi quản lý; quản trị khu bắt buộc chọn. */
function resolveDepartmentFor(db: Db, actor: AuthUser, departmentId: unknown): string | null {
  const id = resolveDepartment(db, departmentId);
  if (id === null) {
    if (actor.role === 'area_admin') throw new HttpError(400, 'Hãy chọn phòng ban thuộc khu bạn quản lý');
    return null;
  }
  if (!managesArea(actor, deptAreaId(db, id) ?? null)) throw notFound('phòng ban');
  return id;
}

/** Đăng ký FaceID / xem ảnh nhận diện: như quyền sửa, và quản trị khu không tự làm cho chính mình. */
function assertCanManageFace(actor: AuthUser, target: User): void {
  assertCanEdit(actor, target);
  if (actor.role === 'area_admin' && target.id === actor.id) throw new HttpError(403, 'Bạn không thể tự đăng ký FaceID cho chính mình');
}

function parseAdminAreaIds(db: Db, raw: unknown): string[] {
  const ids = Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
  if (ids.length === 0) throw new HttpError(400, 'Hãy chọn ít nhất một khu cho quản trị khu vực');
  for (const id of ids) if (!db.prepare('SELECT 1 FROM areas WHERE id = ?').get(id)) throw new HttpError(400, 'Khu vực không tồn tại');
  return ids;
}

function setAdminAreas(db: Db, userId: string, areaIds: string[]): void {
  db.prepare('DELETE FROM admin_areas WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT INTO admin_areas(user_id, area_id) VALUES (?, ?)');
  for (const id of areaIds) ins.run(userId, id);
}

/** Ảnh để đăng ký FaceID: lượt chụp chưa khớp (sightingId) hoặc lượt quẹt của chính người đó trong 24 giờ (detectionId). */
function resolveFaceImage(db: Db, actor: AuthUser, userId: string | null, b: Record<string, unknown>, now: number): { url: string; sightingId: number | null } | null {
  if (b.sightingId !== undefined && b.sightingId !== null && b.sightingId !== '') {
    const s = getSighting(db, Number(b.sightingId));
    if (!s || !managesArea(actor, deviceAreaId(db, s.deviceId))) throw new HttpError(404, 'Không tìm thấy lượt chụp này, hãy chọn lượt mới hơn');
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
    const actor = currentUser(req);
    const w = scopeWhere(scopeFor(actor), 'u.id', 'u.department_id');
    const f = areaFilterSql(parseAreaFilter(db, actor, req.query.area), 'u.department_id');
    const rows = db
      .prepare(`${USER_SELECT} WHERE ${NOT_SYSTEM_ADMIN} AND ${w.sql} AND ${f.sql} ORDER BY u.code`)
      .all(...w.params, ...f.params) as Row[];
    res.json({ users: rows.map(mapUser) });
  });

  r.post(
    '/users/import',
    requireManager,
    ah(async (req, res) => {
      const b = req.body ?? {};
      const wanted = new Set(
        (Array.isArray(b.persons) ? b.persons : []).map((p: { personId?: unknown }) => String(p?.personId ?? '')).filter(Boolean),
      );
      if (wanted.size === 0) throw new HttpError(400, 'Chưa chọn người nào để nhập');
      if (wanted.size > IMPORT_MAX) throw new HttpError(400, `Mỗi lần nhập tối đa ${IMPORT_MAX} người`);
      const departmentId = resolveDepartmentFor(db, currentUser(req), b.departmentId);
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

  r.get('/users/next-code', requireManager, (_req, res) => {
    res.json({ code: nextEmployeeCode(db) });
  });

  r.post(
    '/users',
    requireManager,
    ah(async (req, res) => {
      const actor = currentUser(req);
      const b = req.body ?? {};
      const code = (str(b.code) ?? '').toUpperCase() || nextEmployeeCode(db);
      const name = str(b.name) ?? '';
      if (!CODE_RE.test(code)) throw new HttpError(400, CODE_ERROR);
      // Mã ADMIN mang quyền xóa dữ liệu: chỉ hệ thống được tạo, kể cả khi database chưa có tài khoản này.
      if (code === SYSTEM_ADMIN_CODE) throw new HttpError(400, 'Mã ADMIN dành riêng cho tài khoản quản trị hệ thống');
      if (!name) throw new HttpError(400, 'Họ tên là bắt buộc');
      const role = b.role === undefined ? 'employee' : b.role;
      assertRoleAllowed(actor, role);
      const departmentId = resolveDepartmentFor(db, actor, b.departmentId);
      const email = parseEmail(b.email);
      const phone = parsePhone(b.phone);
      const adminAreaIds = role === 'area_admin' ? parseAdminAreaIds(db, b.adminAreaIds) : [];
      if (db.prepare('SELECT 1 FROM users WHERE code = ?').get(code)) throw new HttpError(409, 'Mã nhân viên đã tồn tại');
      assertEmailFree(db, email, null);
      const image = resolveFaceImage(db, actor, null, b, ctx.now());
      const hanetPersonId = str(b.hanetPersonId) || null;
      assertPersonIdFree(db, hanetPersonId, null);

      const id = newId('usr');
      // Chưa có mật khẩu: mật khẩu tạm được sinh và gửi qua email khi thư chào mừng đi (mail-queue)
      tx(db, () => {
        db.prepare(
          `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
             face_registered, status, password_hash, must_change_password, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, 1, ?)`,
        ).run(id, code, name, email, phone, role, departmentId, str(b.position) ?? '', str(b.avatarUrl) ?? '', hanetPersonId, hanetPersonId ? 1 : 0, toVnDate(ctx.now()));
        if (adminAreaIds.length) setAdminAreas(db, id, adminAreaIds);
        enqueueMail(db, id, 'welcome', {}, ctx.now());
      });
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
      res.json({ user: getUser(db, id), ...(face ? { face } : {}) });
    }),
  );

  r.put('/users/:id', requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanEdit(actor, target);
    const b = req.body ?? {};
    const changesRole = b.role !== undefined && b.role !== target.role;
    const changesStatus = b.status !== undefined && b.status !== target.status;
    const changesDept = b.departmentId !== undefined && (b.departmentId || null) !== target.departmentId;
    // Gửi lại đúng danh sách khu đang có (form gửi kèm) không tính là đổi
    const changesAreas =
      b.adminAreaIds !== undefined &&
      !(Array.isArray(b.adminAreaIds) && [...new Set(b.adminAreaIds.map(String))].sort().join(',') === target.adminAreaIds.join(','));
    if (target.id === actor.id && actor.role === 'area_admin') {
      // Quản trị khu tự sửa mình: chỉ họ tên, email, điện thoại, chức vụ
      const changesOther =
        changesRole ||
        changesStatus ||
        changesDept ||
        changesAreas ||
        (b.hanetPersonId !== undefined && (str(b.hanetPersonId) || null) !== target.hanetPersonId) ||
        (b.avatarUrl !== undefined && (str(b.avatarUrl) ?? '') !== target.avatarUrl);
      if (changesOther) throw new HttpError(400, 'Bạn chỉ được sửa họ tên, email, điện thoại và chức vụ của chính mình');
    }
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
    if (b.email !== undefined) {
      const email = parseEmail(b.email);
      assertEmailFree(db, email, target.id);
      set('email', email);
    }
    if (b.phone !== undefined) set('phone', parsePhone(b.phone));
    for (const [key, col] of [['position', 'position'], ['avatarUrl', 'avatar_url']] as const) {
      if (b[key] !== undefined) set(col, str(b[key]) ?? '');
    }
    if (b.hanetPersonId !== undefined) {
      const pid = str(b.hanetPersonId) || null;
      assertPersonIdFree(db, pid, target.id);
      set('hanet_person_id', pid);
      set('face_registered', pid ? 1 : 0);
    }
    if (changesRole) {
      assertRoleAllowed(actor, b.role);
      set('role', b.role);
    }
    if (b.status !== undefined) {
      if (b.status !== 'active' && b.status !== 'inactive') throw new HttpError(400, 'Trạng thái không hợp lệ');
      set('status', b.status);
    }
    if (changesDept) set('department_id', resolveDepartmentFor(db, actor, b.departmentId));
    const newRole: UserRole = changesRole ? b.role : target.role;
    let adminAreas: string[] | null = null;
    if (newRole === 'area_admin' && (changesRole || changesAreas)) {
      if (!isGlobalHr(actor)) throw new HttpError(403, 'Chỉ HR toàn hệ thống được cấp quyền quản trị khu vực');
      adminAreas = parseAdminAreaIds(db, b.adminAreaIds);
    } else if (changesRole && target.role === 'area_admin') {
      adminAreas = [];
    }

    tx(db, () => {
      if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, target.id);
      if (adminAreas !== null) setAdminAreas(db, target.id, adminAreas);
    });
    // Người chưa đăng nhập được (nhập từ Camera AI, hoặc thư chào mừng lỗi) vừa có/đổi email: gửi thư chào mừng
    if (b.email !== undefined && !target.canLogin && parseEmail(b.email) !== target.email.toLowerCase()) {
      enqueueMail(db, target.id, 'welcome', {}, ctx.now());
    }
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

  r.post('/users/:id/reset-password', requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanEdit(actor, target);
    if (!target.email) throw new HttpError(400, 'Nhân sự chưa có email: hãy bổ sung email trước');
    enqueueMail(db, target.id, target.canLogin ? 'reset_temp' : 'welcome', {}, ctx.now());
    console.warn(`[SECURITY] password_reset_queued by=${actor.code} target=${target.code} ip=${req.ip}`);
    res.json({ queued: true });
  });

  r.post(
    '/users/:id/face',
    requireManager,
    ah(async (req, res) => {
      const actor = currentUser(req);
      const target = manageableUser(db, actor, req.params.id);
      assertCanManageFace(actor, target);
      const image = resolveFaceImage(db, actor, target.id, req.body ?? {}, ctx.now());
      if (!image) throw new HttpError(400, 'Hãy chọn một lượt camera chụp');
      const face = await registerFace(deps, target.id, image.url);
      if (face.ok && image.sightingId !== null) deleteSighting(db, image.sightingId);
      if (face.ok) kickEntity(ctx, 'user', target.id);
      res.json({ user: getUser(db, target.id), face });
    }),
  );

  r.get('/users/:id/face-candidates', requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanManageFace(actor, target);
    const now = ctx.now();
    const rows = db
      .prepare(
        `SELECT id, ts, image_url, device_id, device_name FROM detections
         WHERE user_id = ? AND ts >= ? AND image_url IS NOT NULL AND image_url != '' ORDER BY ts DESC LIMIT 30`,
      )
      .all(target.id, now - SIGHTING_TTL_MS) as Row[];
    const body: FaceCandidates = {
      detections: rows.map((d) => ({ id: d.id, ts: d.ts, imageUrl: d.image_url, deviceName: d.device_name ?? d.device_id })),
      strangers: listSightings(db, now, 'stranger').filter((s) => managesArea(actor, deviceAreaId(db, s.deviceId))),
    };
    res.json(body);
  });

  r.delete('/users/:id', requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    if (target.id === actor.id) throw new HttpError(400, 'Không thể tự xóa tài khoản đang đăng nhập');
    if (!canDeleteUser(actor, target)) throw new HttpError(403, 'Bạn không có quyền xóa tài khoản này');
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
