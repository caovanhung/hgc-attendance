import type { Db } from './db';
import { deleteSetting, getSetting, setSetting } from './settings';
import { HANET_DEFAULT_API_BASE, getPlaceIds, ingestCheckin, parseCheckin } from './hanet';
import { addDays, vnDayStart } from './vntime';

export interface HanetDeps {
  db: Db;
  fetch: typeof fetch;
  now: () => number;
}

export class HanetApiError extends Error {
  constructor(
    public returnCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const OAUTH_TOKEN_URL = 'https://oauth.hanet.com/token';
export const PAGE_SIZE = 500;
const TOKEN_EXPIRED = -103;
const MAX_PAGES = 200;

async function postForm(deps: HanetDeps, url: string, params: Record<string, string>): Promise<any> {
  const res = await deps.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new HanetApiError(res.status, `HTTP ${res.status} từ ${url}`);
  return res.json();
}

export async function refreshAccessToken(deps: HanetDeps): Promise<string> {
  const { db } = deps;
  const refreshToken = getSetting(db, 'hanet.refresh_token');
  const clientId = getSetting(db, 'hanet.client_id');
  const clientSecret = getSetting(db, 'hanet.client_secret');
  if (!refreshToken || !clientId || !clientSecret) {
    throw new HanetApiError(0, 'Làm mới token thất bại: thiếu Client ID, Client Secret hoặc Refresh Token');
  }
  const body = await postForm(deps, OAUTH_TOKEN_URL, {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const token = body?.access_token;
  if (typeof token !== 'string' || !token) {
    throw new HanetApiError(Number(body?.returnCode ?? 0), `Làm mới token thất bại: ${body?.returnMessage ?? body?.error ?? 'không rõ lý do'}`);
  }
  setSetting(db, 'hanet.access_token', token);
  if (typeof body.refresh_token === 'string' && body.refresh_token) setSetting(db, 'hanet.refresh_token', body.refresh_token);
  return token;
}

async function callApi(deps: HanetDeps, apiPath: string, params: Record<string, string>, retried = false): Promise<any> {
  const token = getSetting(deps.db, 'hanet.access_token') ?? (await refreshAccessToken(deps));
  const base = (getSetting(deps.db, 'hanet.api_base') ?? HANET_DEFAULT_API_BASE).replace(/\/+$/, '');
  const body = await postForm(deps, base + apiPath, { token, ...params });
  const code = Number(body?.returnCode);
  if (code === TOKEN_EXPIRED && !retried) {
    await refreshAccessToken(deps);
    return callApi(deps, apiPath, params, true);
  }
  if (code !== 1) throw new HanetApiError(code, `Hanet trả lỗi ${code}: ${body?.returnMessage ?? ''}`);
  return body;
}

export async function fetchCheckins(deps: HanetDeps, placeId: number, from: number, to: number): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await callApi(deps, '/person/getCheckinByPlaceIdInTimestamp', {
      placeID: String(placeId),
      from: String(from),
      to: String(to),
      type: '0',
      page: String(page),
      size: String(PAGE_SIZE),
    });
    const data = Array.isArray(body.data) ? body.data : [];
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export interface ReconcileSummary {
  inserted: number;
  duplicates: number;
  ignored: number;
}

export async function reconcileRange(deps: HanetDeps, from: number, to: number): Promise<ReconcileSummary> {
  const { db } = deps;
  const summary: ReconcileSummary = { inserted: 0, duplicates: 0, ignored: 0 };
  try {
    for (const placeId of getPlaceIds(db)) {
      for (const item of await fetchCheckins(deps, placeId, from, to)) {
        const parsed = parseCheckin(item, deps.now());
        if (!parsed) {
          summary.ignored++;
          continue;
        }
        const r = ingestCheckin(db, parsed.input, 'reconcile');
        if (r.status === 'success') summary.inserted++;
        else if (r.status === 'duplicate') summary.duplicates++;
        else summary.ignored++;
      }
    }
  } catch (err) {
    setSetting(db, 'hanet.last_reconcile_error', (err as Error).message);
    throw err;
  }
  setSetting(db, 'hanet.last_reconcile_at', new Date(deps.now()).toISOString());
  deleteSetting(db, 'hanet.last_reconcile_error');
  return summary;
}

/** Đối soát cả một ngày VN, không kéo quá thời điểm hiện tại. */
export async function reconcileDate(deps: HanetDeps, date: string): Promise<ReconcileSummary> {
  const from = vnDayStart(date);
  const to = Math.min(vnDayStart(addDays(date, 1)) - 1, deps.now());
  return reconcileRange(deps, from, to);
}
