import type { HanetDeps } from './hanet-api';
import { HanetApiError, hanetApi } from './hanet-api';
import { SyncDeferred, wakeOp, type SyncHandlers } from './hanet-sync';
import { getPlaceIds } from './hanet';

function placeOf(deps: HanetDeps): number {
  const id = getPlaceIds(deps.db)[0];
  if (!id) throw new SyncDeferred('Chưa chọn địa điểm Hanet');
  return id;
}

/** -5011 (không tìm thấy người trên Hanet) khi xóa/bỏ khỏi phòng = đã xong. */
async function ignoreNotFound(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof HanetApiError) || err.returnCode !== -5011) throw err;
  }
}

type UserRow = { code: string; name: string; position: string; hanet_person_id: string | null; face_registered: number };
type DeptRow = { name: string; description: string; hanet_department_id: string | null };
const userRow = (deps: HanetDeps, id: string) =>
  deps.db.prepare('SELECT code, name, position, hanet_person_id, face_registered FROM users WHERE id = ?').get(id) as UserRow | undefined;
const deptRow = (deps: HanetDeps, id: string) =>
  deps.db.prepare('SELECT name, description, hanet_department_id FROM departments WHERE id = ?').get(id) as DeptRow | undefined;
const norm = (s: string) => s.trim().toLocaleLowerCase('vi');

/** Xử lý từng thao tác đồng bộ sang Hanet. Bản ghi đã bị xóa trên web thì việc kết thúc êm. */
export const SYNC_HANDLERS: SyncHandlers = {
  'camera.rename': async (deps, job) => {
    if (!deps.db.prepare('SELECT 1 FROM cameras WHERE id = ?').get(job.entityId)) return;
    await hanetApi.updateDevice(deps, String(job.payload.deviceId), String(job.payload.name));
  },

  'user.alias': async (deps, job) => {
    if (!userRow(deps, job.entityId)) return;
    await hanetApi.updateAliasId(deps, String(job.payload.personId), String(job.payload.code));
  },

  'user.info': async (deps, job) => {
    const u = userRow(deps, job.entityId);
    if (!u || u.face_registered !== 1) return;
    await hanetApi.updateInfo(deps, { aliasId: u.code, placeId: placeOf(deps), name: u.name, title: u.position ?? '' });
  },

  'user.department': async (deps, job) => {
    const u = userRow(deps, job.entityId);
    if (!u) return;
    const personId = u.hanet_person_id;
    if (!personId) throw new SyncDeferred('Chờ đăng ký FaceID');
    let toHanet: number | null = null;
    const toId = job.payload.toDepartmentId as string | null;
    if (toId) {
      const d = deptRow(deps, toId);
      if (d) {
        if (!d.hanet_department_id) throw new SyncDeferred('Chờ phòng ban đồng bộ lên Hanet');
        toHanet = Number(d.hanet_department_id);
      }
    }
    const fromHanet = job.payload.fromHanetDeptId ? Number(job.payload.fromHanetDeptId) : null;
    if (fromHanet && fromHanet !== toHanet) await ignoreNotFound(() => hanetApi.removePersonFromDepartment(deps, fromHanet, personId));
    if (toHanet) await hanetApi.addPersonsToDepartment(deps, toHanet, [personId]);
  },

  'user.remove': async (deps, job) => {
    // Đã biết Person ID thì xóa đúng người đó; xóa theo aliasID có thể trúng người khác trùng mã trên Hanet
    if (job.payload.personId) {
      await ignoreNotFound(() => hanetApi.removeById(deps, String(job.payload.personId)));
      return;
    }
    await hanetApi.removeByPlace(deps, String(job.payload.code), placeOf(deps));
  },

  'dept.create': async (deps, job) => {
    const d = deptRow(deps, job.entityId);
    if (!d || d.hanet_department_id) return;
    const placeId = placeOf(deps);
    const same = (await hanetApi.listDepartments(deps, placeId, d.name.trim())).find((h) => norm(h.name) === norm(d.name));
    const hanetId = same ? same.id : await hanetApi.createDepartment(deps, placeId, d.name, d.description ?? '');
    deps.db.prepare('UPDATE departments SET hanet_department_id = ? WHERE id = ?').run(String(hanetId), job.entityId);
    wakeOp(deps.db, 'user.department', deps.now());
  },

  'dept.update': async (deps, job) => {
    const d = deptRow(deps, job.entityId);
    if (!d) return;
    if (!d.hanet_department_id) throw new SyncDeferred('Chờ tạo phòng ban trên Hanet');
    await hanetApi.updateDepartment(deps, Number(d.hanet_department_id), d.name, d.description ?? '');
  },

  'dept.remove': async (deps, job) => {
    await ignoreNotFound(() => hanetApi.removeDepartment(deps, Number(job.payload.hanetDepartmentId)));
  },
};
