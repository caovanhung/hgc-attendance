import { newId } from './db';
import { hanetApi, type HanetDeps } from './hanet-api';
import { getPlaceIds } from './hanet';

/** Thêm các camera của địa điểm Hanet chưa có trong danh sách (không ghi đè camera đã có). Trả số camera đã thêm. */
export async function importCameras(deps: HanetDeps): Promise<number> {
  const { db } = deps;
  const placeId = getPlaceIds(db)[0];
  if (!placeId) return 0;
  const devices = await hanetApi.listDevices(deps, placeId);
  const exists = db.prepare('SELECT 1 FROM cameras WHERE device_key = ?');
  const insert = db.prepare(
    `INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, created_at) VALUES (?, ?, ?, ?, ?, '', '', ?)`,
  );
  let added = 0;
  for (const d of devices) {
    const key = String(d.deviceID ?? '').trim();
    if (!key || exists.get(key)) continue;
    insert.run(newId('cam'), String(d.deviceName || key), key, Number(d.placeID) || placeId, String(d.placeName ?? ''), new Date(deps.now()).toISOString());
    added++;
  }
  return added;
}

/** Cập nhật online/offline cho mọi camera; camera không có trong kết quả của Hanet coi là offline. */
export async function refreshCameraStatus(deps: HanetDeps): Promise<void> {
  const { db } = deps;
  const keys = (db.prepare('SELECT device_key FROM cameras ORDER BY device_key').all() as { device_key: string }[]).map((r) => r.device_key);
  if (keys.length === 0) return;
  const status = await hanetApi.connectionStatus(deps, keys);
  const now = deps.now();
  const update = db.prepare('UPDATE cameras SET online = ?, status_checked_at = ? WHERE device_key = ?');
  for (const k of keys) update.run(status[k] === true ? 1 : 0, now, k);
}
