import type { Db } from './db';
import { newId } from './db';
import { hashPassword } from './auth';
import { toVnDate } from './vntime';

/** Mật khẩu mặc định của tài khoản ADMIN, ghi trong DEPLOY.md. Bắt buộc đổi ở lần đăng nhập đầu. */
export const DEFAULT_ADMIN_PASSWORD = 'Admin@123';

/** Mã tài khoản quản trị hệ thống. Không phải nhân sự: không tính vào thống kê và danh sách nhân sự. */
export const SYSTEM_ADMIN_CODE = 'ADMIN';
/** Điều kiện SQL loại tài khoản quản trị hệ thống (bảng users phải có alias `u`). */
export const NOT_SYSTEM_ADMIN = `u.code != '${SYSTEM_ADMIN_CODE}'`;

/**
 * Đảm bảo luôn có ít nhất một HR đăng nhập được.
 * Trả thông tin mật khẩu vừa đặt (để in ra log) hoặc null nếu không cần làm gì.
 */
export function ensureAdminAccess(db: Db, envPassword?: string): { code: string; password: string; fromEnv: boolean } | null {
  const usable = db.prepare("SELECT 1 FROM users WHERE role = 'hr' AND status = 'active' AND password_hash IS NOT NULL LIMIT 1").get();
  if (usable) return null;

  const fromEnv = typeof envPassword === 'string' && envPassword.length >= 8;
  const password = fromEnv ? (envPassword as string) : DEFAULT_ADMIN_PASSWORD;

  let hr = db.prepare("SELECT id, code FROM users WHERE role = 'hr' ORDER BY created_at, id LIMIT 1").get() as
    | { id: string; code: string }
    | undefined;
  if (!hr) {
    db.prepare(
      `INSERT INTO users(id, code, name, role, status, must_change_password, created_at)
       VALUES (?, ?, 'Quản trị viên Hệ thống (HR)', 'hr', 'active', 1, ?)
       ON CONFLICT(code) DO UPDATE SET role = 'hr', status = 'active'`,
    ).run(newId('usr'), SYSTEM_ADMIN_CODE, toVnDate(Date.now()));
    hr = db.prepare('SELECT id, code FROM users WHERE code = ?').get(SYSTEM_ADMIN_CODE) as { id: string; code: string };
  }
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, status = 'active' WHERE id = ?").run(hashPassword(password), hr.id);
  return { code: hr.code, password, fromEnv };
}
