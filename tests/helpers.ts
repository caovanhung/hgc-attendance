import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { openDb, newId, type Db } from '../server/db';
import { hashPassword, LoginLimiter } from '../server/auth';
import { recomputeDay } from '../server/attendance';
import { toVnDate } from '../server/vntime';
import { createApp } from '../server/app';
import type { AppConfig, AppContext } from '../server/context';
import type { UserRole, UserStatus, DetectionSource } from '../shared/types';

export const TEST_PASSWORD = 'Matkhau@123';

export function freshDb(): Db {
  return openDb(':memory:');
}

export function seedDepartment(db: Db, code: string, name = code): string {
  const id = newId('dep');
  db.prepare('INSERT INTO departments(id, code, name, description, manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    code,
    name,
    '',
    null,
    '2026-10-13',
  );
  return id;
}

export interface SeedUserOpts {
  code: string;
  role?: UserRole;
  departmentId?: string | null;
  name?: string;
  /** null = chưa có mật khẩu; mặc định TEST_PASSWORD */
  password?: string | null;
  mustChange?: boolean;
  status?: UserStatus;
  hanetPersonId?: string | null;
}

export function seedUser(db: Db, o: SeedUserOpts): string {
  const id = newId('usr');
  db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, '', '', ?, ?, '', '', ?, 0, ?, ?, ?, '2026-10-13')`,
  ).run(
    id,
    o.code,
    o.name ?? o.code,
    o.role ?? 'employee',
    o.departmentId ?? null,
    o.hanetPersonId ?? null,
    o.status ?? 'active',
    o.password === null ? null : hashPassword(o.password ?? TEST_PASSWORD),
    o.mustChange ? 1 : 0,
  );
  return id;
}

/** Ghi một lượt nhận diện thẳng vào DB rồi tính lại ngày công (dùng trước khi có ingestCheckin). */
export function addDetection(db: Db, userId: string, ts: number, opts: { deviceId?: string; source?: DetectionSource } = {}): void {
  const workDate = toVnDate(ts);
  db.prepare(
    `INSERT INTO detections(user_id, hanet_person_id, device_id, device_name, place_id, ts, work_date, image_url, source)
     VALUES (?, NULL, ?, 'Cửa chính', NULL, ?, ?, NULL, ?)`,
  ).run(userId, opts.deviceId ?? 'DEV1', ts, workDate, opts.source ?? 'webhook');
  recomputeDay(db, userId, workDate);
}

export interface TestApp {
  baseUrl: string;
  ctx: AppContext;
  db: Db;
  close: () => Promise<void>;
}

export interface TestAppOverrides {
  db?: Db;
  config?: Partial<AppConfig>;
  fetch?: typeof fetch;
  now?: () => number;
  limiter?: LoginLimiter;
}

export async function startTestApp(overrides: TestAppOverrides = {}): Promise<TestApp> {
  const db = overrides.db ?? freshDb();
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-backup-'));
  const ctx: AppContext = {
    db,
    config: { production: false, simulatorEnabled: true, trustProxy: false, backupDir, ...overrides.config },
    limiter: overrides.limiter ?? new LoginLimiter(),
    fetch: overrides.fetch ?? ((async () => { throw new Error('fetch không được dùng trong test này'); }) as unknown as typeof fetch),
    now: overrides.now ?? (() => Date.now()),
  };
  const server = createApp(ctx).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    ctx,
    db,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface ApiResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** Client HTTP nhỏ cho test: tự giữ cookie phiên `sid`. */
export class Client {
  cookie = '';

  constructor(public baseUrl: string) {}

  async req<T = any>(method: string, p: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
    const res = await fetch(this.baseUrl + p, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const m = /sid=([^;]*)/.exec(setCookie);
      if (m) this.cookie = m[1] ? `sid=${m[1]}` : '';
    }
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // giữ nguyên text
    }
    return { status: res.status, body: parsed, headers: res.headers };
  }

  get<T = any>(p: string) {
    return this.req<T>('GET', p);
  }
  post<T = any>(p: string, body: unknown = {}) {
    return this.req<T>('POST', p, body);
  }
  put<T = any>(p: string, body: unknown = {}) {
    return this.req<T>('PUT', p, body);
  }
  del<T = any>(p: string) {
    return this.req<T>('DELETE', p);
  }
}

export async function loginAs(app: TestApp, code: string, password = TEST_PASSWORD): Promise<Client> {
  const c = new Client(app.baseUrl);
  const r = await c.post('/api/auth/login', { code, password });
  if (r.status !== 200) throw new Error(`Đăng nhập ${code} thất bại: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}
