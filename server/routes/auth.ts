import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { clearSessionCookie, currentUser, jsonOnly, setSessionCookie } from '../middleware';
import { createSession, deleteSession, deleteUserSessions, hashPassword, validateNewPassword, verifyPassword } from '../auth';
import { getUser } from '../repo';
import type { MeResponse } from '../../shared/types';

export function authPublicRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.post('/auth/login', jsonOnly, (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const key = `${code}|${req.ip}`;
    const now = ctx.now();
    if (ctx.limiter.isBlocked(key, now)) {
      console.warn(`[SECURITY] login_blocked code=${code} ip=${req.ip}`);
      throw new HttpError(429, 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút');
    }
    const row = db.prepare('SELECT id, password_hash, status FROM users WHERE code = ?').get(code) as
      | { id: string; password_hash: string | null; status: string }
      | undefined;
    if (!row || row.status !== 'active' || !verifyPassword(password, row.password_hash)) {
      ctx.limiter.recordFailure(key, now);
      console.warn(`[SECURITY] login_failed code=${code} ip=${req.ip}`);
      throw new HttpError(401, 'Mã nhân viên hoặc mật khẩu không đúng');
    }
    ctx.limiter.reset(key);
    setSessionCookie(res, createSession(db, row.id, now), ctx);
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
    const body: MeResponse = { user, mustChangePassword: auth.mustChangePassword, simulatorEnabled: ctx.config.simulatorEnabled };
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
