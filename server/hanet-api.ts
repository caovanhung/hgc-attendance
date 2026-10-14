import type { Db } from './db';
import { deleteSetting, getSetting, setSetting } from './settings';
import { HANET_DEFAULT_API_BASE, getPlaceIds, ingestCheckin, parseCheckin } from './hanet';
import { addDays, vnDayStart } from './vntime';
import type { HanetDepartment, HanetDevice, HanetPerson, HanetPlace } from '../shared/types';

export interface HanetDeps {
  db: Db;
  fetch: typeof fetch;
  now: () => number;
}

export const HANET_TIMEOUT_MS = 15_000;

/** Lỗi do dữ liệu, quyền hoặc ảnh: thử lại cũng vô ích. Mã khác coi là lỗi tạm. */
export const PERMANENT_CODES = new Set([-1, -2035, -1005, -101, -5011, -9005, -9006, -9007, -9008, -5010, -909, -9002]);

const HANET_ERROR_TEXT: Record<number, string> = {
  [-1]: 'Dữ liệu gửi Camera AI không hợp lệ',
  [-103]: 'Token Camera AI hết hạn',
  [-2035]: 'Tài khoản Camera AI không có quyền với địa điểm hoặc thiết bị này',
  [-503]: 'Hệ thống Camera AI đang lỗi',
  [-101]: 'Không tìm thấy thiết bị trên Camera AI',
  [-102]: 'Thiết bị đang offline',
  [-1005]: 'Không tìm thấy địa điểm trên Camera AI',
  [-5011]: 'Không tìm thấy người này trên Camera AI',
  [-9005]: 'Người này đã có trên Camera AI',
  [-9006]: 'Ảnh không đạt: cần rõ mặt, một người, nhìn thẳng, không mũ, không khẩu trang',
  [-9007]: 'Ảnh trùng với người đã đăng ký',
  [-9008]: 'Địa điểm đã hết số khuôn mặt miễn phí, cần mua gói cloud Camera AI',
  [-5010]: 'Ảnh không hợp lệ',
  [-909]: 'Tải ảnh lên Camera AI thất bại',
  [-9002]: 'Định dạng ảnh không được hỗ trợ',
};

export function describeHanetError(code: number): string | null {
  return HANET_ERROR_TEXT[code] ?? null;
}

export class HanetApiError extends Error {
  constructor(
    public returnCode: number,
    message: string,
    public transient = !PERMANENT_CODES.has(returnCode),
  ) {
    super(message);
  }
}

/** Lỗi mạng/timeout (không phải HanetApiError) luôn là lỗi tạm. */
export function isTransientError(err: unknown): boolean {
  return err instanceof HanetApiError ? err.transient : true;
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
    signal: AbortSignal.timeout(HANET_TIMEOUT_MS),
  });
  if (!res.ok) throw new HanetApiError(res.status, `HTTP ${res.status} từ ${url}`, res.status >= 500 || res.status === 429);
  try {
    return await res.json();
  } catch {
    throw new HanetApiError(0, `Camera AI trả dữ liệu không đọc được từ ${url}`, true);
  }
}

/** Thông báo khi làm mới token hỏng (spec §9): lỗi tạm, việc đồng bộ vẫn thử lại. */
export const REFRESH_FAILED = 'Kết nối Camera AI hỏng, kiểm tra Client ID/Secret/Refresh Token';

const refreshFailed = (detail: string, code = 0) => new HanetApiError(code, `${REFRESH_FAILED} (${detail})`, true);

async function doRefresh(deps: HanetDeps): Promise<string> {
  const { db } = deps;
  const refreshToken = getSetting(db, 'hanet.refresh_token');
  const clientId = getSetting(db, 'hanet.client_id');
  const clientSecret = getSetting(db, 'hanet.client_secret');
  if (!refreshToken || !clientId || !clientSecret) throw refreshFailed('thiếu Client ID, Client Secret hoặc Refresh Token');
  let body: any;
  try {
    body = await postForm(deps, OAUTH_TOKEN_URL, {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
  } catch (err) {
    throw refreshFailed(`làm mới token thất bại: ${(err as Error).message}`, err instanceof HanetApiError ? err.returnCode : 0);
  }
  const token = body?.access_token;
  if (typeof token !== 'string' || !token) {
    throw refreshFailed(`làm mới token thất bại: ${body?.returnMessage ?? body?.error ?? 'không rõ lý do'}`, Number(body?.returnCode ?? 0));
  }
  setSetting(db, 'hanet.access_token', token);
  if (typeof body.refresh_token === 'string' && body.refresh_token) setSetting(db, 'hanet.refresh_token', body.refresh_token);
  return token;
}

/** Lượt làm mới token đang chạy của mỗi database: nhiều lời gọi cùng gặp -103 dùng chung một lượt. */
const refreshing = new WeakMap<Db, Promise<string>>();

export function refreshAccessToken(deps: HanetDeps): Promise<string> {
  const pending = refreshing.get(deps.db);
  if (pending) return pending;
  const p = doRefresh(deps).finally(() => refreshing.delete(deps.db));
  refreshing.set(deps.db, p);
  return p;
}

export async function callApi(deps: HanetDeps, apiPath: string, params: Record<string, string>, retried = false): Promise<any> {
  const token = getSetting(deps.db, 'hanet.access_token') ?? (await refreshAccessToken(deps));
  const base = (getSetting(deps.db, 'hanet.api_base') ?? HANET_DEFAULT_API_BASE).replace(/\/+$/, '');
  const body = await postForm(deps, base + apiPath, { token, ...params });
  const code = Number(body?.returnCode);
  if (code === TOKEN_EXPIRED && !retried) {
    await refreshAccessToken(deps);
    return callApi(deps, apiPath, params, true);
  }
  if (code !== 1) {
    const text = describeHanetError(code);
    throw new HanetApiError(code, text ? `${text} (mã ${code})` : `Camera AI trả lỗi ${code}: ${body?.returnMessage ?? ''}`);
  }
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

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Hàm mỏng cho từng API Hanet dùng trong hệ thống (tài liệu Postman 13088306/TVeqcn2C). */
export const hanetApi = {
  async getProfile(deps: HanetDeps): Promise<{ name: string; email: string }> {
    const d = (await callApi(deps, '/profile/getProfile', {})).data ?? {};
    return { name: String(d.name ?? ''), email: String(d.email ?? '') };
  },
  async getPlaces(deps: HanetDeps): Promise<HanetPlace[]> {
    return arr<Record<string, unknown>>((await callApi(deps, '/place/getPlaces', {})).data).map((p) => ({
      id: Number(p.id),
      name: String(p.name ?? ''),
      address: String(p.address ?? ''),
    }));
  },
  async listDevices(deps: HanetDeps, placeId: number): Promise<HanetDevice[]> {
    return arr<HanetDevice>((await callApi(deps, '/device/getListDeviceByPlace', { placeID: String(placeId) })).data);
  },
  async connectionStatus(deps: HanetDeps, deviceIds: string[]): Promise<Record<string, boolean>> {
    if (deviceIds.length === 0) return {};
    const d = (await callApi(deps, '/device/getConnectionStatus', { deviceIDs: deviceIds.join(',') })).data;
    return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, boolean>) : {};
  },
  async updateDevice(deps: HanetDeps, deviceId: string, name: string): Promise<void> {
    await callApi(deps, '/device/updateDevice', { deviceID: deviceId, deviceName: name });
  },
  async listPersons(deps: HanetDeps, placeId: number, page: number, size: number): Promise<HanetPerson[]> {
    return arr<HanetPerson>(
      (await callApi(deps, '/person/getListByPlace', { placeID: String(placeId), type: '0', page: String(page), size: String(size) })).data,
    );
  },
  async personsByAlias(deps: HanetDeps, aliasId: string): Promise<HanetPerson[]> {
    return arr<HanetPerson>((await callApi(deps, '/person/getUserInfoByAliasID', { aliasID: aliasId })).data);
  },
  async registerByUrl(deps: HanetDeps, p: { name: string; aliasId: string; placeId: number; url: string; title: string }): Promise<string | null> {
    const d = (
      await callApi(deps, '/person/registerByUrl', {
        name: p.name,
        aliasID: p.aliasId,
        placeID: String(p.placeId),
        url: p.url,
        title: p.title,
        type: '0',
      })
    ).data;
    return d?.personID ? String(d.personID) : null;
  },
  async updateFaceByUrl(deps: HanetDeps, p: { aliasId: string; placeId: number; url: string }): Promise<void> {
    await callApi(deps, '/person/updateByFaceUrlByAliasID', { aliasID: p.aliasId, placeID: String(p.placeId), url: p.url });
  },
  async updateInfo(deps: HanetDeps, p: { aliasId: string; placeId: number; name: string; title: string }): Promise<void> {
    await callApi(deps, '/person/updateInfo', { aliasID: p.aliasId, placeID: String(p.placeId), name: p.name, title: p.title });
  },
  async updateAliasId(deps: HanetDeps, personId: string, aliasId: string): Promise<void> {
    await callApi(deps, '/person/updateAliasID', { personID: personId, aliasID: aliasId });
  },
  async removeByPlace(deps: HanetDeps, aliasId: string, placeId: number): Promise<void> {
    await callApi(deps, '/person/removeByPlace', { aliasID: aliasId, placeID: String(placeId) });
  },
  async removeById(deps: HanetDeps, personId: string): Promise<void> {
    await callApi(deps, '/person/removePersonByID', { personID: personId });
  },
  async listDepartments(deps: HanetDeps, placeId: number, keyword: string): Promise<HanetDepartment[]> {
    const d = (await callApi(deps, '/department/list', { placeID: String(placeId), keyword, page: '1', size: '50' })).data;
    return arr<Record<string, unknown>>(d?.hits).map((h) => ({ id: Number(h.id), name: String(h.name ?? '') }));
  },
  async createDepartment(deps: HanetDeps, placeId: number, name: string, desc: string): Promise<number> {
    const d = (await callApi(deps, '/department/create', { placeID: String(placeId), name, desc })).data;
    const id = Number(d?.id);
    if (!Number.isInteger(id) || id <= 0) throw new HanetApiError(0, 'Camera AI không trả ID phòng ban vừa tạo');
    return id;
  },
  async updateDepartment(deps: HanetDeps, id: number, name: string, desc: string): Promise<void> {
    await callApi(deps, '/department/update', { id: String(id), name, desc });
  },
  async removeDepartment(deps: HanetDeps, id: number): Promise<void> {
    await callApi(deps, '/department/remove', { id: String(id) });
  },
  async addPersonsToDepartment(deps: HanetDeps, deptId: number, personIds: string[]): Promise<void> {
    await callApi(deps, '/department/add-person', { departmentID: String(deptId), personIDs: personIds.join(',') });
  },
  async removePersonFromDepartment(deps: HanetDeps, deptId: number, personId: string): Promise<void> {
    await callApi(deps, '/department/remove-person', { departmentID: String(deptId), personID: personId });
  },
};
