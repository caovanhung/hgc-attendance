import { OAUTH_TOKEN_URL } from '../server/hanet-api';
import { setSetting } from '../server/settings';
import type { Db } from '../server/db';

/** Địa điểm Hanet dùng trong test (trùng HRINTER trên host). */
export const PLACE = 998833;

export const ok = (data: unknown = null) => ({ returnCode: 1, returnMessage: 'SUCCESS', data });
export const fail = (code: number, msg = 'ERROR') => ({ returnCode: code, returnMessage: msg });

/** Giá trị trả về: object (JSON), Response (trả nguyên), hoặc hàm nhận tham số form; hàm ném lỗi = lỗi mạng. */
export type Reply = unknown | ((params: URLSearchParams) => unknown);

export interface FakeCall {
  path: string;
  params: URLSearchParams;
  signal: AbortSignal | null | undefined;
}

/** Hanet giả theo đường dẫn API, ví dụ { '/person/updateInfo': ok() }. Đường dẫn không khai báo trả 404. */
export function fakeHanet(routes: Record<string, Reply>) {
  const calls: FakeCall[] = [];
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const params = new URLSearchParams(String(init?.body ?? ''));
    if (u === OAUTH_TOKEN_URL) {
      calls.push({ path: 'oauth', params, signal: init?.signal });
      return json({ access_token: 'new-token', refresh_token: 'new-refresh' });
    }
    const path = new URL(u).pathname;
    calls.push({ path, params, signal: init?.signal });
    const reply = routes[path];
    if (reply === undefined) return new Response('not found', { status: 404 });
    const body = typeof reply === 'function' ? (reply as (p: URLSearchParams) => unknown)(params) : reply;
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
