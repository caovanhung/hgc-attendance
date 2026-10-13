import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { findSessionUser, SESSION_TTL_MS, type AuthUser } from './auth';
import { HttpError } from './errors';
import type { AppContext } from './context';
import type { UserRole } from '../shared/types';
import { SYSTEM_ADMIN_CODE } from './bootstrap';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE = 'sid';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, ctx: AppContext): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.production,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response, ctx: AppContext): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: ctx.config.production, path: '/' });
}

export function requireAuth(ctx: AppContext): RequestHandler {
  return (req, _res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    const user = token ? findSessionUser(ctx.db, token, ctx.now()) : null;
    if (!user) return next(new HttpError(401, 'Vui lòng đăng nhập'));
    req.user = user;
    req.sessionToken = token;
    next();
  };
}

const ALLOWED_WHEN_MUST_CHANGE = new Set(['GET /auth/me', 'POST /auth/change-password', 'POST /auth/logout']);

export const mustChangeGate: RequestHandler = (req, _res, next) => {
  if (req.user?.mustChangePassword && !ALLOWED_WHEN_MUST_CHANGE.has(`${req.method} ${req.path}`)) {
    return next(new HttpError(403, 'Bạn cần đổi mật khẩu trước khi tiếp tục', 'MUST_CHANGE_PASSWORD'));
  }
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Bạn không có quyền thực hiện thao tác này'));
    }
    next();
  };
}

/** Thao tác không hoàn tác được (xóa nhân sự, phòng ban): chỉ tài khoản quản trị hệ thống ADMIN. */
export const requireSystemAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.code !== SYSTEM_ADMIN_CODE) {
    return next(new HttpError(403, 'Chỉ tài khoản ADMIN được thực hiện thao tác này'));
  }
  next();
};

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Chống CSRF cùng SameSite=Lax: request ghi có body phải là JSON. */
export const jsonOnly: RequestHandler = (req, _res, next) => {
  if (WRITE_METHODS.has(req.method)) {
    const ct = req.headers['content-type'];
    const cl = req.headers['content-length'];
    const hasBody = (cl !== undefined && cl !== '0') || req.headers['transfer-encoding'] !== undefined;
    if (ct && req.is('application/json') === false) {
      return next(new HttpError(415, 'Chỉ chấp nhận dữ liệu JSON'));
    }
    if (hasBody && !ct) {
      return next(new HttpError(415, 'Chỉ chấp nhận dữ liệu JSON'));
    }
  }
  next();
};

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Vui lòng đăng nhập');
  return req.user;
}
