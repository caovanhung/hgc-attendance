import type { Db } from './db';
import { newId, tx } from './db';
import { hanetApi, type HanetDeps } from './hanet-api';
import { enqueue } from './hanet-sync';
import { SYSTEM_ADMIN_CODE } from './bootstrap';
import { CODE_RE } from './validation';
import { toVnDate } from './vntime';
import type { HanetPerson, ImportedUser } from '../shared/types';

export const IMPORT_PAGE_SIZE = 100;
/** Số người tối đa mỗi lần nhập (giới hạn thời gian một yêu cầu và số việc đồng bộ xếp cùng lúc). */
export const IMPORT_MAX = 100;
const MAX_PAGES = 50;

/** Toàn bộ nhân viên (type 0) của địa điểm; dừng khi trang rỗng hoặc ít hơn kích thước trang. */
export async function fetchAllPersons(deps: HanetDeps, placeId: number): Promise<HanetPerson[]> {
  const all: HanetPerson[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const items = await hanetApi.listPersons(deps, placeId, page, IMPORT_PAGE_SIZE);
    all.push(...items);
    if (items.length < IMPORT_PAGE_SIZE) break;
  }
  return all;
}

/** Mã dùng được từ aliasID: hợp lệ và không phải mã ADMIN (mã này mang quyền xóa dữ liệu). */
function aliasCode(p: HanetPerson): string | null {
  const upper = String(p.aliasID ?? '').trim().toUpperCase();
  return upper !== '' && upper !== SYSTEM_ADMIN_CODE && CODE_RE.test(upper) ? upper : null;
}

/** Người trên Hanet chưa có nhân sự nào khớp mã (aliasID) hoặc Person ID. */
export function unlinkedPersons(db: Db, persons: HanetPerson[]): HanetPerson[] {
  const known = db.prepare('SELECT 1 FROM users WHERE code = ? OR (hanet_person_id IS NOT NULL AND hanet_person_id = ?)');
  return persons.filter((p) => {
    if (!p.personID) return false;
    // aliasID ADMIN không bao giờ khớp tài khoản hệ thống: người này vẫn nhập được với mã tự sinh
    const code = aliasCode(p) ?? String(p.aliasID ?? '').trim().toUpperCase();
    return !known.get(code === SYSTEM_ADMIN_CODE ? '' : code, String(p.personID));
  });
}

/** aliasID (rút gọn, in hoa) đang được người nào đó trên Hanet dùng: mã tự sinh không được trùng. */
export function hanetAliases(persons: HanetPerson[]): Set<string> {
  return new Set(persons.map((p) => String(p.aliasID ?? '').trim().toUpperCase()).filter(Boolean));
}

/** Mã tự sinh NV0001, NV0002... (tiếp sau số lớn nhất đang có), bỏ qua mã đã là aliasID của người khác trên Hanet. */
export function nextEmployeeCode(db: Db, reserved: Set<string> = new Set()): string {
  const codes = db.prepare("SELECT code FROM users WHERE code GLOB 'NV[0-9][0-9][0-9][0-9]*'").all() as { code: string }[];
  let n = codes.reduce((m, { code }) => (/^NV\d{4,}$/.test(code) ? Math.max(m, Number(code.slice(2))) : m), 0) + 1;
  while (reserved.has(`NV${String(n).padStart(4, '0')}`)) n++;
  return `NV${String(n).padStart(4, '0')}`;
}

/**
 * Tạo nhân sự từ người trên Hanet (đã có FaceID). Mã = aliasID nếu hợp lệ, không phải ADMIN và chưa dùng;
 * ngược lại tự sinh (bỏ qua aliasID đang có trên Hanet, tham số reserved) và xếp việc ghi mã đó làm aliasID trên Hanet để webhook khớp được theo mã.
 */
export function importPersons(db: Db, persons: HanetPerson[], departmentId: string | null, now: number, reserved: Set<string> = new Set()): ImportedUser[] {
  const exists = db.prepare('SELECT 1 FROM users WHERE code = ?');
  const insert = db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, '', '', 'employee', ?, ?, ?, ?, 1, 'active', NULL, 1, ?)`,
  );
  return tx(db, () =>
    persons.map((p) => {
      const alias = String(p.aliasID ?? '').trim();
      const fromAlias = aliasCode(p);
      const code = fromAlias && !exists.get(fromAlias) ? fromAlias : nextEmployeeCode(db, reserved);
      const id = newId('usr');
      const name = String(p.name ?? '').trim() || code;
      insert.run(id, code, name, departmentId, String(p.title ?? '').trim(), String(p.avatar ?? ''), String(p.personID), toVnDate(now));
      if (code !== alias) enqueue(db, 'user', id, 'user.alias', { personId: String(p.personID), code }, now);
      if (departmentId) enqueue(db, 'user', id, 'user.department', { fromHanetDeptId: null, toDepartmentId: departmentId }, now);
      return { id, code, name };
    }),
  );
}
