import type { Db } from './db';
import { HanetApiError, hanetApi, type HanetDeps } from './hanet-api';
import { getPlaceIds, reconcileEnabled } from './hanet';
import { enqueue, wakeEntity } from './hanet-sync';
import type { FaceResult } from '../shared/types';

/** Gắn người trên Hanet vào nhân sự; nếu có phòng ban thì xếp việc thêm vào phòng ban trên Hanet. */
export function linkFace(db: Db, userId: string, personId: string, departmentId: string | null, now: number): void {
  db.prepare('UPDATE users SET hanet_person_id = ?, face_registered = 1, face_error = NULL WHERE id = ?').run(personId, userId);
  if (departmentId) enqueue(db, 'user', userId, 'user.department', { fromHanetDeptId: null, toDepartmentId: departmentId }, now);
  wakeEntity(db, 'user', userId, now);
}

/**
 * Đăng ký (hoặc đổi ảnh) FaceID bằng ảnh camera. Chạy ngay để HR thấy kết quả.
 * Thất bại thì lưu lý do vào users.face_error; nhân sự vẫn giữ nguyên.
 */
export async function registerFace(deps: HanetDeps, userId: string, imageUrl: string): Promise<FaceResult> {
  const { db } = deps;
  const u = db.prepare('SELECT id, code, name, position, department_id, face_registered FROM users WHERE id = ?').get(userId) as
    | { id: string; code: string; name: string; position: string; department_id: string | null; face_registered: number }
    | undefined;
  if (!u) return { ok: false, message: 'Không tìm thấy nhân sự' };
  const fail = (message: string): FaceResult => {
    db.prepare('UPDATE users SET face_error = ? WHERE id = ?').run(message, userId);
    return { ok: false, message };
  };
  const placeId = getPlaceIds(db)[0];
  if (!reconcileEnabled(db) || !placeId) return fail('Chưa cấu hình kết nối Camera AI (Client ID, Refresh Token, địa điểm)');
  try {
    if (u.face_registered === 1) {
      await hanetApi.updateFaceByUrl(deps, { aliasId: u.code, placeId, url: imageUrl });
      db.prepare('UPDATE users SET face_error = NULL WHERE id = ?').run(userId);
      return { ok: true, message: 'Đã cập nhật ảnh nhận diện trên Camera AI' };
    }
    let personId: string | null;
    try {
      personId = await hanetApi.registerByUrl(deps, { name: u.name, aliasId: u.code, placeId, url: imageUrl, title: u.position ?? '' });
    } catch (err) {
      // -9005: mã này đã là aliasID của một người khác trên Hanet. Không tự liên kết (có thể là người khác hẳn);
      // HR dùng "Nhập từ Hanet" nếu đúng là người đó, hoặc đổi mã nhân viên.
      if (err instanceof HanetApiError && err.returnCode === -9005) {
        return fail(`Mã ${u.code} đã là aliasID của một người khác trên Camera AI. Dùng "Nhập từ Camera AI" để liên kết người đó, hoặc đổi mã nhân viên.`);
      }
      throw err;
    }
    if (!personId) return fail('Camera AI không trả Person ID sau khi đăng ký');
    linkFace(db, userId, String(personId), u.department_id, deps.now());
    return { ok: true, message: 'Đã đăng ký FaceID trên Camera AI' };
  } catch (err) {
    return fail((err as Error).message);
  }
}
