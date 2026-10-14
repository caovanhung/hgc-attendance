import { OAUTH_TOKEN_URL } from '../server/hanet-api';
import { setSetting } from '../server/settings';
import type { Db } from '../server/db';

/** Địa điểm Hanet dùng trong test (trùng HRINTER trên host). */
export const PLACE = 998833;

export const ok = (data: unknown = null) => ({ returnCode: 1, returnMessage: 'SUCCESS', data });
export const fail = (code: number, msg = 'ERROR') => ({ returnCode: code, returnMessage: msg });

/** Giá trị trả về: object (JSON), Response (trả nguyên), hoặc hàm nhận tham số form (và cả lời gọi); hàm ném lỗi = lỗi mạng. */
export type Reply = unknown | ((params: URLSearchParams, call: FakeCall) => unknown);

export interface FakeCall {
  path: string;
  params: URLSearchParams;
  signal: AbortSignal | null | undefined;
  /** Thân request nguyên văn (JSON hoặc form). */
  body: string;
  headers: Headers;
  redirect: RequestRedirect | undefined;
}

/** Hanet giả theo đường dẫn API, ví dụ { '/person/updateInfo': ok() }. Đường dẫn không khai báo trả 404. */
export function fakeHanet(routes: Record<string, Reply>) {
  const calls: FakeCall[] = [];
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const raw = String(init?.body ?? '');
    const params = new URLSearchParams(raw);
    const base = { params, signal: init?.signal, body: raw, headers: new Headers(init?.headers), redirect: init?.redirect };
    if (u === OAUTH_TOKEN_URL) {
      calls.push({ path: 'oauth', ...base });
      return json({ access_token: 'new-token', refresh_token: 'new-refresh' });
    }
    const call: FakeCall = { path: new URL(u).pathname, ...base };
    calls.push(call);
    const reply = routes[call.path];
    if (reply === undefined) return new Response('not found', { status: 404 });
    const body = typeof reply === 'function' ? await (reply as (p: URLSearchParams, c: FakeCall) => unknown)(params, call) : reply;
    return body instanceof Response ? body : json(body);
  }) as typeof fetch;
  return {
    fetchImpl,
    calls,
    paths: () => calls.map((c) => c.path),
    last: (path: string) => [...calls].reverse().find((c) => c.path === path),
  };
}

/** Cấu hình đủ để reconcileEnabled(db) = true. */
export function configureHanet(db: Db): void {
  setSetting(db, 'hanet.client_id', 'cid');
  setSetting(db, 'hanet.client_secret', 'csecret');
  setSetting(db, 'hanet.access_token', 'tok');
  setSetting(db, 'hanet.refresh_token', 'rtok');
  setSetting(db, 'hanet.place_ids', JSON.stringify([PLACE]));
}

/** Response JSON với mã HTTP và các Set-Cookie tùy ý (dùng cho Hanet Connect giả). */
export function reply(status: number, body: unknown, setCookies: string[] = [], extra: Record<string, string> = {}): Response {
  const headers = new Headers({ ...extra });
  if (body !== null) headers.set('Content-Type', 'application/json');
  for (const c of setCookies) headers.append('Set-Cookie', c);
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}
