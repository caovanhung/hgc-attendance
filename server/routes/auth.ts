import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { clearSessionCookie, currentUser, jsonOnly, setSessionCookie } from '../middleware';
import { createSession, deleteSession, deleteUserSessions, hashPassword, LoginLimiter, validateNewPassword, verifyPassword } from '../auth';
import { consumeResetToken, createResetToken, findLoginUser } from '../accounts';
import { cancelPasswordMails, enqueueMail } from '../mail-queue';
import { getAppUrl } from '../mail';
import { getUser } from '../repo';
import { isSystemAdmin } from '../access';
import { listAreasFor } from './areas';
import { personLabel, writeAudit } from '../audit';
import type { MeResponse } from '../../shared/types';

/** Đăng nhập của các vai trò quản trị được ghi nhật ký (spec đợt C §5). */
const AUDITED_ROLES = new Set(['hr', 'area_admin']);

export function authPublicRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.post('/auth/login', jsonOnly, (req, res) => {
    const b = req.body ?? {};
    const raw = typeof b.login === 'string' ? b.login : typeof b.code === 'string' ? b.code : '';
    const login = raw.includes('@') ? raw.trim().toLowerCase() : raw.trim().toUpperCase();
    const password = typeof b.password === 'string' ? b.password : '';
    const key = `${login}|${req.ip}`;
    const now = ctx.now();
    // Tài khoản lạ hoặc tài khoản quản trị: ghi nhật ký đăng nhập thất bại
    const auditFailure = (u: ReturnType<typeof findLoginUser>, reason: string | null) => {
      if (u && !AUDITED_ROLES.has(u.role)) return;
      writeAudit(db, now, {
        actorId: u?.id ?? null,
        actorLabel: u ? personLabel(u.name, u.code) : login || '(trống)',
        ip: req.ip ?? null,
        action: 'auth.login_failed',
        reason,
      });
    };
    if (ctx.limiter.isBlocked(key, now)) {
      console.warn(`[SECURITY] login_blocked login=${login} ip=${req.ip}`);
      auditFailure(findLoginUser(db, login), 'Bị chặn tạm thời');
      throw new HttpError(429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút');
    }
    const row = findLoginUser(db, login);
    if (!row || row.status !== 'active' || !verifyPassword(password, row.password_hash)) {
      ctx.limiter.recordFailure(key, now);
      console.warn(`[SECURITY] login_failed login=${login} ip=${req.ip}`);
      auditFailure(row, null);
      throw new HttpError(401, 'Mã nhân viên/email hoặc mật khẩu không đúng');
    }
    ctx.limiter.reset(key);
    if (AUDITED_ROLES.has(row.role)) {
      writeAudit(db, now, { actorId: row.id, actorLabel: personLabel(row.name, row.code), ip: req.ip ?? null, action: 'auth.login' });
    }
    setSessionCookie(res, createSession(db, row.id, now), ctx);
    res.json({ success: true });
  });

  // Mỗi lần yêu cầu đều tính (không chỉ lần lỗi) để không ai dò hộp thư người khác
  const forgotByIp = new LoginLimiter(5, 15 * 60_000);
  const forgotByLogin = new LoginLimiter(5, 15 * 60_000);
  const FORGOT_MESSAGE = 'Nếu tài khoản tồn tại và có email, thư hướng dẫn đã được gửi.';

  r.post('/auth/forgot-password', jsonOnly, (req, res) => {
    const raw = typeof req.body?.login === 'string' ? req.body.login.trim() : '';
    const login = raw.includes('@') ? raw.toLowerCase() : raw.toUpperCase();
    const now = ctx.now();
    const ipKey = String(req.ip);
    if (forgotByIp.isBlocked(ipKey, now) || forgotByLogin.isBlocked(login, now)) {
      throw new HttpError(429, 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 15 phút');
    }
    forgotByIp.recordFailure(ipKey, now);
    forgotByLogin.recordFailure(login, now);
    const u = findLoginUser(db, login);
    if (u && u.status === 'active' && u.email) {
      if (getAppUrl(db)) {
        enqueueMail(db, u.id, 'reset_link', { token: createResetToken(db, u.id, now) }, now);
        console.warn(`[SECURITY] password_reset_link_queued user=${u.code} ip=${req.ip}`);
      } else {
        console.warn('[MAIL] forgot_password bỏ qua: chưa cấu hình địa chỉ web (mail.app_url)');
      }
    }
    res.json({ message: FORGOT_MESSAGE });
  });

  r.post('/auth/reset-password', jsonOnly, (req, res) => {
    const { token, newPassword } = req.body ?? {};
    // Kiểm tra mật khẩu trước khi dùng token: mật khẩu yếu không làm mất link
    const error = validateNewPassword(newPassword, '');
    if (error) throw new HttpError(400, error);
    const userId = typeof token === 'string' && token ? consumeResetToken(db, token, ctx.now()) : null;
    const u = userId ? (db.prepare('SELECT id, status FROM users WHERE id = ?').get(userId) as { id: string; status: string } | undefined) : undefined;
    if (!u || u.status !== 'active') throw new HttpError(400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(newPassword), u.id);
    deleteUserSessions(db, u.id);
    cancelPasswordMails(db, u.id);
    res.json({ success: true });
  });

  return r;
}

export function authRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/auth/me', (req, res) => {
    const auth = currentUser(req);
    const user = getUser(db, auth.id);
    if (!user) throw new HttpError(401, 'Vui lòng đăng nhập');
    const body: MeResponse = {
      user,
      mustChangePassword: auth.mustChangePassword,
      simulatorEnabled: ctx.config.simulatorEnabled,
      isSystemAdmin: isSystemAdmin(auth),
      areas: listAreasFor(db, auth),
    };
    res.json(body);
  });

  r.post('/auth/logout', (req, res) => {
    if (req.sessionToken) deleteSession(db, req.sessionToken);
    clearSessionCookie(res, ctx);
    res.json({ success: true });
  });

  r.post('/auth/change-password', (req, res) => {
    const auth = currentUser(req);
    const { currentPassword, newPassword } = req.body ?? {};
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(auth.id) as { password_hash: string | null } | undefined;
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, row?.password_hash)) {
      throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    }
    const error = validateNewPassword(newPassword, currentPassword);
    if (error) throw new HttpError(400, error);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(newPassword), auth.id);
    deleteUserSessions(db, auth.id, req.sessionToken);
    res.json({ success: true });
  });

  return r;
}
