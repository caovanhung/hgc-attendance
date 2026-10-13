import { randomBytes } from 'node:crypto';
import type { Db } from './db';
import { tx } from './db';
import { recomputeDay } from './attendance';
import { getSetting, setSetting } from './settings';
import { toVnDate } from './vntime';
import { SYSTEM_ADMIN_CODE } from './bootstrap';
import type { DetectionSource, HanetConfigView, WebhookLogStatus } from '../shared/types';

export interface CheckinInput {
  personId: string | null;
  aliasId: string | null;
  personName: string | null;
  personType: number | null;
  deviceId: string;
  deviceName: string | null;
  placeId: number | null;
  ts: number;
  imageUrl: string | null;
}

const str = (v: unknown): string | null => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Hanet gửi mili-giây; nếu nhận giá trị dạng giây (< 1e12) thì đổi sang mili-giây. */
export function normalizeTs(raw: number | null, now: number): { ts: number; fromServer: boolean } {
  if (raw === null || raw <= 0) return { ts: now, fromServer: true };
  return { ts: raw < 1e12 ? Math.round(raw * 1000) : raw, fromServer: false };
}

/**
 * Nhận cả dạng lồng `{ action, data: {...} }` lẫn dạng phẳng (webhook Hanet `data_type: 'log'`
 * và bản ghi từ API getCheckinByPlaceIdInTimestamp). Trả null nếu không phải sự kiện nhận diện.
 */
export function parseCheckin(body: unknown, now: number): { input: CheckinInput; note: string | null } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const d = (b.data && typeof b.data === 'object' ? b.data : b) as Record<string, unknown>;
  const deviceId = str(d.deviceID);
  const aliasId = str(d.aliasID);
  const personId = str(d.personID);
  if (!deviceId || (!aliasId && !personId)) return null;
  const { ts, fromServer } = normalizeTs(num(d.time ?? d.checkinTime), now);
  return {
    input: {
      personId,
      aliasId,
      personName: str(d.personName),
      personType: num(d.personType ?? d.type),
      deviceId,
      deviceName: str(d.deviceName),
      placeId: num(d.placeID),
      ts,
      imageUrl: str(d.detected_image_url ?? d.avatar),
    },
    note: fromServer ? 'Thiếu thời gian từ Hanet, dùng giờ nhận' : null,
  };
}

export const STRANGER_MESSAGE = 'Người lạ';

/**
 * Người lạ (personType 2): không có personID/aliasID nên parseCheckin trả null,
 * nhưng có ảnh để HR chọn đăng ký FaceID. Trả null nếu không phải người lạ có ảnh.
 */
export function parseStranger(body: unknown, now: number): { deviceId: string; deviceName: string | null; ts: number; imageUrl: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const d = (b.data && typeof b.data === 'object' ? b.data : b) as Record<string, unknown>;
  const deviceId = str(d.deviceID);
  const imageUrl = str(d.detected_image_url);
  if (num(d.personType) !== 2 || !deviceId || !imageUrl) return null;
  return { deviceId, deviceName: str(d.deviceName), ts: normalizeTs(num(d.time), now).ts, imageUrl };
}

export interface IngestResult {
  status: 'success' | 'ignored' | 'duplicate';
  message: string;
  userId?: string;
}

/** Lời nhắn ghi vào nhật ký webhook khi người được nhận diện chưa có trong danh sách nhân sự. */
export const UNMATCHED_MESSAGE = 'Không khớp nhân viên nào';

export function ingestCheckin(db: Db, input: CheckinInput, source: DetectionSource): IngestResult {
  if (input.personType !== null && input.personType !== 0) return { status: 'ignored', message: 'Không phải nhân viên' };
  type Match = { id: string; status: string } | undefined;
  let user: Match;
  // aliasID ADMIN không bao giờ khớp tài khoản hệ thống (mã này mang quyền xóa dữ liệu): chỉ khớp theo Person ID
  const alias = input.aliasId?.toUpperCase();
  if (alias && alias !== SYSTEM_ADMIN_CODE) user = db.prepare('SELECT id, status FROM users WHERE code = ?').get(alias) as Match;
  if (!user && input.personId) user = db.prepare('SELECT id, status FROM users WHERE hanet_person_id = ?').get(input.personId) as Match;
  if (!user) return { status: 'ignored', message: UNMATCHED_MESSAGE };
  if (user.status !== 'active') return { status: 'ignored', message: 'Nhân viên đã ngừng hoạt động', userId: user.id };

  const userId = user.id;
  const workDate = toVnDate(input.ts);
  return tx(db, () => {
    const r = db
      .prepare(
        `INSERT INTO detections(user_id, hanet_person_id, device_id, device_name, place_id, ts, work_date, image_url, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, device_id, ts) DO NOTHING`,
      )
      .run(userId, input.personId, input.deviceId, input.deviceName, input.placeId, input.ts, workDate, input.imageUrl, source);
    if (Number(r.changes) === 0) return { status: 'duplicate' as const, message: 'Lượt nhận diện đã có', userId };
    recomputeDay(db, userId, workDate);
    return { status: 'success' as const, message: `Đã ghi nhận ngày ${workDate}`, userId };
  });
}

export const WEBHOOK_LOG_LIMIT = 500;

export function logWebhook(
  db: Db,
  e: { status: WebhookLogStatus; personName?: string | null; deviceName?: string | null; message?: string | null; rawPayload?: unknown },
  now: number,
): void {
  db.prepare('INSERT INTO webhook_logs(received_at, status, person_name, device_name, message, raw_payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    new Date(now).toISOString(),
    e.status,
    e.personName ?? null,
    e.deviceName ?? null,
    e.message ?? null,
    e.rawPayload === undefined ? null : JSON.stringify(e.rawPayload),
  );
  db.prepare('DELETE FROM webhook_logs WHERE id <= (SELECT id FROM webhook_logs ORDER BY id DESC LIMIT 1 OFFSET ?)').run(WEBHOOK_LOG_LIMIT);
}

const WEBHOOK_TOKEN_KEY = 'hanet.webhook_token';

export function getWebhookToken(db: Db): string {
  return getSetting(db, WEBHOOK_TOKEN_KEY) ?? rotateWebhookToken(db);
}

export function rotateWebhookToken(db: Db): string {
  const token = randomBytes(24).toString('base64url'); // 32 ký tự
  setSetting(db, WEBHOOK_TOKEN_KEY, token);
  return token;
}

export function mask(v?: string): string {
  return v ? `••••${v.slice(-4)}` : '';
}

/** Chưa thấy trong tài liệu Postman; HR sửa được ở tab Cấu hình nếu Hanet dùng địa chỉ khác. */
export const HANET_DEFAULT_API_BASE = 'https://partner.hanet.ai';

export function getPlaceIds(db: Db): number[] {
  try {
    const v = JSON.parse(getSetting(db, 'hanet.place_ids') ?? '[]');
    return Array.isArray(v) ? v.filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}

export function reconcileEnabled(db: Db): boolean {
  return Boolean(getSetting(db, 'hanet.client_id')) &&
    Boolean(getSetting(db, 'hanet.refresh_token') || getSetting(db, 'hanet.access_token')) &&
    getPlaceIds(db).length > 0;
}

export function getHanetConfigView(db: Db): HanetConfigView {
  return {
    clientId: getSetting(db, 'hanet.client_id') ?? '',
    clientSecret: mask(getSetting(db, 'hanet.client_secret')),
    accessToken: mask(getSetting(db, 'hanet.access_token')),
    refreshToken: mask(getSetting(db, 'hanet.refresh_token')),
    apiBase: getSetting(db, 'hanet.api_base') ?? HANET_DEFAULT_API_BASE,
    placeIds: getPlaceIds(db),
    webhookPath: `/api/hanet/webhook/${getWebhookToken(db)}`,
    lastReconcileAt: getSetting(db, 'hanet.last_reconcile_at') ?? null,
    lastReconcileError: getSetting(db, 'hanet.last_reconcile_error') ?? null,
    reconcileEnabled: reconcileEnabled(db),
  };
}

const TEXT_FIELDS = [
  ['clientId', 'hanet.client_id'],
  ['clientSecret', 'hanet.client_secret'],
  ['accessToken', 'hanet.access_token'],
  ['refreshToken', 'hanet.refresh_token'],
  ['apiBase', 'hanet.api_base'],
] as const;

/** Ô để trống hoặc còn giá trị đã che ('••••...') thì giữ nguyên giá trị cũ. */
export function updateHanetConfig(db: Db, body: unknown): void {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const [field, key] of TEXT_FIELDS) {
    const v = b[field];
    if (typeof v === 'string' && v.trim() !== '' && !v.startsWith('••••')) setSetting(db, key, v.trim());
  }
  if (Array.isArray(b.placeIds)) {
    const ids = b.placeIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    setSetting(db, 'hanet.place_ids', JSON.stringify(ids));
  }
}

/** Trang xem lại video của Hanet Connect. Không gọi API nội bộ: HR tự đăng nhập Hanet Connect. */
export const HANET_CONNECT_BASE = 'https://connect.hanet.ai';

export function hanetVideoUrl(placeId: number, deviceId: string, day: string): string {
  return `${HANET_CONNECT_BASE}/${placeId}/video?id_device=${encodeURIComponent(deviceId)}&day=${day}`;
}
