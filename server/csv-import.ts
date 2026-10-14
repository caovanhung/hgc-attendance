import type { Db } from './db';
import { newId, tx } from './db';
import { HttpError } from './errors';
import type { AuthUser } from './auth';
import { managesArea } from './access';
import { parseEmail, parsePhone } from './accounts';
import { nextEmployeeCode } from './hanet-import';
import { enqueueMail } from './mail-queue';
import { SYSTEM_ADMIN_CODE } from './bootstrap';
import { CODE_RE, CODE_ERROR } from './validation';
import { toVnDate } from './vntime';
import type { CsvPreviewRow, ImportedUser } from '../shared/types';

export const CSV_MAX_ROWS = 200;
const ROLE_MAP: Record<string, 'employee' | 'dept_manager'> = { '': 'employee', nhan_vien: 'employee', truong_phong: 'dept_manager' };

export interface ValidCsvRow {
  code: string;
  name: string;
  email: string;
  phone: string;
  departmentId: string;
  position: string;
  role: 'employee' | 'dept_manager';
}

const cell = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const errText = (e: unknown): string => (e instanceof HttpError ? e.message : 'Dữ liệu không hợp lệ');

/**
 * Kiểm tra mọi dòng (không ghi gì). Mỗi dòng gom đủ lỗi. Mã trống được tự sinh sau khi kiểm tra xong,
 * không trùng mã trong DB, mã khác trong file và aliasID đang có trên Camera AI (reserved).
 */
export function checkCsvRows(db: Db, actor: AuthUser, rows: unknown, reserved: Set<string>): { preview: CsvPreviewRow[]; valid: ValidCsvRow[] } {
  if (!Array.isArray(rows)) throw new HttpError(400, 'Dữ liệu nhập không hợp lệ');
  if (rows.length === 0) throw new HttpError(400, 'File không có dòng nào');
  if (rows.length > CSV_MAX_ROWS) throw new HttpError(400, `Mỗi lần nhập tối đa ${CSV_MAX_ROWS} dòng`);
  const deptByCode = db.prepare('SELECT id, area_id FROM departments WHERE code = ?');
  const codeTaken = db.prepare('SELECT 1 FROM users WHERE code = ?');
  const emailTaken = db.prepare("SELECT 1 FROM users WHERE email != '' AND lower(email) = ?");
  const fileCodes = new Map<string, number>();
  for (const r of rows as Record<string, unknown>[]) {
    const c = cell(r?.code).toUpperCase();
    if (c) fileCodes.set(c, (fileCodes.get(c) ?? 0) + 1);
  }
  const seenEmails = new Set<string>();
  const checked = (rows as Record<string, unknown>[]).map((r, i) => {
    const errors: string[] = [];
    const name = cell(r?.name);
    if (!name) errors.push('Họ tên là bắt buộc');
    let email = '';
    try {
      email = parseEmail(r?.email);
      if (seenEmails.has(email)) errors.push('Email trùng với dòng khác trong file');
      else if (emailTaken.get(email)) errors.push('Email đã được dùng cho nhân sự khác');
      seenEmails.add(email);
    } catch (e) {
      errors.push(errText(e));
    }
    let phone = '';
    try {
      phone = parsePhone(r?.phone);
    } catch (e) {
      errors.push(errText(e));
    }
    const dept = deptByCode.get(cell(r?.departmentCode).toUpperCase()) as { id: string; area_id: string | null } | undefined;
    // Phòng ngoài khu báo như không tồn tại (không lộ dữ liệu khu khác)
    if (!dept || !managesArea(actor, dept.area_id)) errors.push('Mã phòng ban không tồn tại');
    const roleKey = cell(r?.role).toLowerCase();
    const role = Object.hasOwn(ROLE_MAP, roleKey) ? ROLE_MAP[roleKey] : undefined;
    if (!role) errors.push('Vai trò chỉ được là nhan_vien hoặc truong_phong');
    const code = cell(r?.code).toUpperCase();
    if (code) {
      if (!CODE_RE.test(code)) errors.push(CODE_ERROR);
      else if (code === SYSTEM_ADMIN_CODE) errors.push('Mã ADMIN dành riêng cho tài khoản quản trị hệ thống');
      else if (codeTaken.get(code)) errors.push('Mã nhân viên đã tồn tại');
      else if ((fileCodes.get(code) ?? 0) > 1) errors.push('Mã nhân viên trùng với dòng khác trong file');
    }
    return { line: i + 2, errors, name, email, phone, code, departmentId: dept?.id ?? '', position: cell(r?.position), role: role ?? 'employee' };
  });
  // Mã tự sinh: tránh mã trong DB (nextEmployeeCode), mã ghi sẵn trong file và aliasID trên Camera AI
  const taken = new Set<string>([...reserved, ...fileCodes.keys()]);
  const preview: CsvPreviewRow[] = [];
  const valid: ValidCsvRow[] = [];
  for (const c of checked) {
    const ok = c.errors.length === 0;
    let code: string | null = null;
    if (ok) {
      code = c.code || nextEmployeeCode(db, taken);
      taken.add(code);
      valid.push({ code, name: c.name, email: c.email, phone: c.phone, departmentId: c.departmentId, position: c.position, role: c.role });
    }
    preview.push({ line: c.line, ok, errors: c.errors, code, name: c.name, email: c.email });
  }
  return { preview, valid };
}

/** Tạo nhân sự từ các dòng hợp lệ trong một giao dịch; mỗi người một thư chào mừng (mật khẩu sinh lúc gửi). */
export function createCsvUsers(db: Db, valid: ValidCsvRow[], now: number): ImportedUser[] {
  const insert = db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', NULL, 0, 'active', NULL, 1, ?)`,
  );
  return tx(db, () =>
    valid.map((v) => {
      const id = newId('usr');
      insert.run(id, v.code, v.name, v.email, v.phone, v.role, v.departmentId, v.position, toVnDate(now));
      enqueueMail(db, id, 'welcome', {}, now);
      return { id, code: v.code, name: v.name };
    }),
  );
}
