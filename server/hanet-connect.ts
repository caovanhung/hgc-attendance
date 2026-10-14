import type { Db } from './db';
import { HttpError } from './errors';
import { HANET_TIMEOUT_MS, type HanetDeps } from './hanet-api';
import { deleteSetting, getSetting, setSetting } from './settings';
import type { VideoAccountView } from '../shared/types';

/**
 * Xem lại video camera qua API nội bộ của Hanet Connect (Next.js + Auth.js), đăng nhập bằng
 * tài khoản HR nhập ở tab Cấu hình. Không phải API đối tác: Hanet có thể đổi bất cứ lúc nào.
 */
export const CONNECT_BASE = 'https://connect.hanet.ai';

const EMAIL_KEY = 'hanet.connect_email';
const PASSWORD_KEY = 'hanet.connect_password';

export const VIDEO_NOT_CONFIGURED = 'Chưa cấu hình tài khoản xem video (tab Cấu hình)';
export const VIDEO_LOGIN_FAILED = 'Đăng nhập tài khoản xem video thất bại, kiểm tra email/mật khẩu';
export const VIDEO_NOT_FOUND = 'Không có video ghi lại vào thời điểm này';
export const VIDEO_UNAVAILABLE = 'Không lấy được video, thử lại sau';

const notConfigured = () => new HttpError(400, VIDEO_NOT_CONFIGURED);
const loginFailed = () => new HttpError(502, VIDEO_LOGIN_FAILED);
const unavailable = () => new HttpError(502, VIDEO_UNAVAILABLE);

export interface VideoClip {
  url: string;
  /** Giờ bắt đầu đoạn ghi (ms). */
  startTs: number;
  /** Độ dài đoạn ghi (giây). */
  duration: number;
  deviceName: string | null;
}


// ---------------- Cấu hình ----------------

export function getConnectConfig(db: Db): VideoAccountView {
  return { email: getSetting(db, EMAIL_KEY) ?? null, hasPassword: Boolean(getSetting(db, PASSWORD_KEY)) };
}

/** Email rỗng = xóa cả email lẫn mật khẩu; mật khẩu rỗng/không gửi = giữ mật khẩu cũ. Luôn bỏ phiên đang giữ. */
export function saveConnectConfig(db: Db, input: { email?: unknown; password?: unknown }): VideoAccountView {
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (input.email !== undefined && input.email !== null && typeof input.email !== 'string') throw new HttpError(400, 'Email không hợp lệ');
  if (input.password !== undefined && input.password !== null && typeof input.password !== 'string') throw new HttpError(400, 'Mật khẩu không hợp lệ');
  if (!email) {
    deleteSetting(db, EMAIL_KEY);
    deleteSetting(db, PASSWORD_KEY);
  } else {
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ');
    setSetting(db, EMAIL_KEY, email);
    if (password) setSetting(db, PASSWORD_KEY, password);
  }
  clearConnectSession(db);
  return getConnectConfig(db);
}

// ---------------- Phiên đăng nhập ----------------

/** Cookie phiên (tên → giá trị) của mỗi database, chỉ giữ trong bộ nhớ. */
const sessions = new WeakMap<Db, Map<string, string>>();
/** Lượt đăng nhập đang chạy: nhiều request cùng lúc dùng chung một lượt. */
const logins = new WeakMap<Db, Promise<Map<string, string>>>();

export function clearConnectSession(db: Db): void {
  sessions.delete(db);
  logins.delete(db);
}

/** Đọc các Set-Cookie (chỉ phần name=value), bỏ cookie bị xóa (giá trị rỗng). */
function readCookies(res: Response, into: Map<string, string>): Map<string, string> {
  for (const line of res.headers.getSetCookie()) {
    const pair = line.split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value) into.set(name, value);
    else into.delete(name);
  }
  return into;
}

const cookieHeader = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const hasSessionToken = (jar: Map<string, string>) => [...jar.keys()].some((k) => /authjs\.session-token/.test(k));

async function doLogin(deps: HanetDeps): Promise<Map<string, string>> {
  const email = getSetting(deps.db, EMAIL_KEY);
  const password = getSetting(deps.db, PASSWORD_KEY);
  if (!email || !password) throw notConfigured();
  const jar = new Map<string, string>();
  let res: Response;
  try {
    const csrfRes = await deps.fetch(`${CONNECT_BASE}/api/auth/csrf`, { redirect: 'manual', signal: AbortSignal.timeout(HANET_TIMEOUT_MS) });
    if (!csrfRes.ok) throw unavailable();
    const csrfToken = (await csrfRes.json())?.csrfToken;
    if (typeof csrfToken !== 'string' || !csrfToken) throw unavailable();
    readCookies(csrfRes, jar);
    res = await deps.fetch(`${CONNECT_BASE}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader(jar) },
      body: new URLSearchParams({ csrfToken, username: email, password, json: 'true' }).toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(HANET_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw unavailable();
  }
  readCookies(res, jar);
  // Thành công: Auth.js đặt cookie session-token (có thể chia .0, .1...). Thất bại: chuyển về trang lỗi, không có cookie đó.
  if (hasSessionToken(jar)) return jar;
  if (res.status >= 500) throw unavailable();
  throw loginFailed();
}

function ensureSession(deps: HanetDeps): Promise<Map<string, string>> {
  const { db } = deps;
  const current = sessions.get(db);
  if (current) return Promise.resolve(current);
  const pending = logins.get(db);
  if (pending) return pending;
  const p = doLogin(deps)
    .then((jar) => {
      // Cấu hình đổi giữa chừng (clearConnectSession) thì không giữ phiên của tài khoản cũ
      if (logins.get(db) === p) sessions.set(db, jar);
      return jar;
    })
    .finally(() => {
      if (logins.get(db) === p) logins.delete(db);
    });
  logins.set(db, p);
  return p;
}

// ---------------- Video ----------------

function parseClip(body: unknown): VideoClip | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const d = (b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : b) as Record<string, unknown>;
  const url = typeof d.file === 'string' && /^https:\/\//.test(d.file) ? d.file : null;
  let startTs = Number(d.timestamp);
  if (!url || !Number.isFinite(startTs) || startTs <= 0) return null;
  if (startTs < 1e12) startTs = Math.round(startTs * 1000);
  const duration = Number(d.duration);
  return {
    url,
    startTs,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 60,
    deviceName: typeof d.device_name === 'string' && d.device_name.trim() ? d.device_name.trim() : null,
  };
}

/** Đoạn ghi chứa (hoặc gần nhất) thời điểm `ts` (ms) của camera `deviceId`. */
export async function getVideoAt(deps: HanetDeps, deviceId: string, ts: number): Promise<VideoClip> {
  const { db } = deps;
  if (!getSetting(db, EMAIL_KEY) || !getSetting(db, PASSWORD_KEY)) throw notConfigured();
  for (let attempt = 0; ; attempt++) {
    const jar = await ensureSession(deps);
    let res: Response;
    let body: unknown = null;
    try {
      res = await deps.fetch(`${CONNECT_BASE}/api/video/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(jar) },
        body: JSON.stringify({ device_id: deviceId, timestamp: ts }),
        redirect: 'manual',
        signal: AbortSignal.timeout(HANET_TIMEOUT_MS),
      });
      body = await res.json().catch(() => null);
    } catch {
      throw unavailable();
    }
    if (res.status === 401) {
      if (sessions.get(db) === jar) sessions.delete(db);
      if (attempt === 0) continue;
      throw loginFailed();
    }
    readCookies(res, jar); // Auth.js có thể gia hạn phiên
    const clip = res.ok ? parseClip(body) : null;
    if (clip) return clip;
    // Hanet báo "Cannot retrieve video playback" (VIDEO_INTERNAL_ERROR) khi không có đoạn ghi ở thời điểm đó
    const code = body && typeof body === 'object' ? (body as Record<string, unknown>).error_code : undefined;
    if ((typeof code === 'string' && code.startsWith('VIDEO_')) || (res.ok && body && typeof body === 'object')) {
      throw new HttpError(404, VIDEO_NOT_FOUND);
    }
    throw unavailable();
  }
}

/** Đăng nhập thử bằng tài khoản đã lưu (bỏ phiên cũ trước để kiểm tra thật). */
export async function testConnectLogin(deps: HanetDeps): Promise<{ ok: boolean; message: string }> {
  clearConnectSession(deps.db);
  try {
    await ensureSession(deps);
    return { ok: true, message: `Đăng nhập thành công bằng ${getSetting(deps.db, EMAIL_KEY)}` };
  } catch (err) {
    return { ok: false, message: err instanceof HttpError ? err.message : VIDEO_UNAVAILABLE };
  }
}
