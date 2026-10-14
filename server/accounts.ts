import { randomBytes } from 'node:crypto';
import type { Db } from './db';
import { HttpError } from './errors';
import { sha256 } from './auth';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const RESET_TTL_MS = 30 * 60_000;

export function parseEmail(v: unknown): string {
  const email = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!email) throw new HttpError(400, 'Email là bắt buộc');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email không hợp lệ');
  return email;
}

/** Số Việt Nam: 10 chữ số bắt đầu bằng 0, hoặc +84 và 9 chữ số; lưu dạng 0xxxxxxxxx. */
export function parsePhone(v: unknown): string {
  const raw = typeof v === 'string' ? v.replace(/[\s.\-()]/g, '') : '';
  if (!raw) throw new HttpError(400, 'Số điện thoại là bắt buộc');
  const phone = /^\+84\d{9}$/.test(raw) ? `0${raw.slice(3)}` : raw;
  if (!/^0\d{9}$/.test(phone)) throw new HttpError(400, 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0 hoặc +84)');
  return phone;
}

export function assertEmailFree(db: Db, email: string, userId: string | null): void {
  const holder = db.prepare("SELECT id FROM users WHERE email != '' AND lower(email) = ?").get(email.toLowerCase()) as { id: string } | undefined;
  if (holder && holder.id !== userId) throw new HttpError(409, 'Email đã được dùng cho nhân sự khác');
}

/** Tài khoản theo chuỗi đăng nhập: có '@' thì theo email (không phân biệt hoa thường), ngược lại theo mã nhân viên. */
export function findLoginUser(db: Db, login: string): { id: string; code: string; email: string; password_hash: string | null; status: string } | undefined {
  const s = login.trim();
  if (!s) return undefined;
  const sql = 'SELECT id, code, email, password_hash, status FROM users WHERE ';
  return (
    s.includes('@')
      ? db.prepare(`${sql} email != '' AND lower(email) = ?`).get(s.toLowerCase())
      : db.prepare(`${sql} code = ?`).get(s.toUpperCase())
  ) as { id: string; code: string; email: string; password_hash: string | null; status: string } | undefined;
}

/** Token đặt lại mật khẩu: chỉ lưu băm, hạn 30 phút, hủy các token cũ của người đó. */
export function createResetToken(db: Db, userId: string, now: number): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO password_resets(token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, now + RESET_TTL_MS);
  return token;
}

/** Dùng token (một lần). Trả user_id, hoặc null nếu sai/hết hạn/đã dùng. */
export function consumeResetToken(db: Db, token: string, now: number): string | null {
  const row = db.prepare('SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(sha256(token), now) as
    | { user_id: string }
    | undefined;
  if (!row) return null;
  db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(now, sha256(token));
  return row.user_id;
}
