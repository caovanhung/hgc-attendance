import { Router } from 'express';
import type { AppContext } from '../context';
import { newId } from '../db';
import { HttpError, ah } from '../errors';
import { importCameras, refreshCameraStatus } from '../cameras';
import { reconcileEnabled } from '../hanet';
import { dropEntityJobs, enqueue, kickEntity } from '../hanet-sync';
import { requireRole } from '../middleware';
import type { Row } from '../repo';
import type { Camera } from '../../shared/types';

function mapCamera(r: Row): Camera {
  return {
    id: r.id,
    name: r.name,
    deviceKey: r.device_key,
    placeId: r.place_id ?? null,
    placeName: r.place_name ?? '',
    location: r.location ?? '',
    ipAddress: r.ip_address ?? '',
    online: r.online === null || r.online === undefined ? null : r.online === 1,
    statusCheckedAt: r.status_checked_at ?? null,
    createdAt: r.created_at,
  };
}

export function cameraRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();
  const deps = { db, fetch: ctx.fetch, now: ctx.now };
  const listCameras = () => (db.prepare('SELECT * FROM cameras ORDER BY name').all() as Row[]).map(mapCamera);
  const requireHanet = () => {
    if (!reconcileEnabled(db)) throw new HttpError(400, 'Chưa cấu hình kết nối Hanet (Client ID, Refresh Token, địa điểm)');
  };

  r.get('/cameras', (_req, res) => {
    res.json({ cameras: listCameras() });
  });

  r.post('/cameras', requireRole('hr'), (req, res) => {
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = text(b.name);
    const deviceKey = text(b.deviceKey);
    if (!name || !deviceKey) throw new HttpError(400, 'Tên camera và mã thiết bị là bắt buộc');
    const placeId = b.placeId === undefined || b.placeId === '' || b.placeId === null ? null : Number(b.placeId);
    if (placeId !== null && (!Number.isInteger(placeId) || placeId <= 0)) throw new HttpError(400, 'Place ID không hợp lệ');
    if (db.prepare('SELECT 1 FROM cameras WHERE device_key = ?').get(deviceKey)) throw new HttpError(409, 'Mã thiết bị đã tồn tại');
    const id = newId('cam');
    db.prepare(
      'INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, name, deviceKey, placeId, text(b.placeName), text(b.location), text(b.ipAddress), new Date(ctx.now()).toISOString());
    res.json({ camera: mapCamera(db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) as Row) });
  });

  r.post(
    '/cameras/import',
    requireRole('hr'),
    ah(async (_req, res) => {
      requireHanet();
      let added: number;
      try {
        added = await importCameras(deps);
      } catch (err) {
        throw new HttpError(502, `Không lấy được danh sách camera từ Hanet: ${(err as Error).message}`);
      }
      res.json({ added, cameras: listCameras() });
    }),
  );

  r.post(
    '/cameras/refresh-status',
    requireRole('hr'),
    ah(async (_req, res) => {
      requireHanet();
      try {
        await refreshCameraStatus(deps);
      } catch (err) {
        throw new HttpError(502, `Không lấy được trạng thái camera từ Hanet: ${(err as Error).message}`);
      }
      res.json({ cameras: listCameras() });
    }),
  );

  r.put('/cameras/:id', requireRole('hr'), (req, res) => {
    const row = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id) as Row | undefined;
    if (!row) throw new HttpError(404, 'Không tìm thấy camera');
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = b.name === undefined ? row.name : text(b.name);
    if (!name) throw new HttpError(400, 'Tên camera là bắt buộc');
    db.prepare('UPDATE cameras SET name = ?, location = ?, ip_address = ? WHERE id = ?').run(
      name,
      b.location === undefined ? row.location : text(b.location),
      b.ipAddress === undefined ? row.ip_address : text(b.ipAddress),
      row.id,
    );
    if (name !== row.name) {
      enqueue(db, 'camera', row.id, 'camera.rename', { deviceId: row.device_key, name }, ctx.now());
      kickEntity(ctx, 'camera', row.id);
    }
    res.json({ camera: mapCamera(db.prepare('SELECT * FROM cameras WHERE id = ?').get(row.id) as Row) });
  });

  r.delete('/cameras/:id', requireRole('hr'), (req, res) => {
    const result = db.prepare('DELETE FROM cameras WHERE id = ?').run(req.params.id);
    if (Number(result.changes) === 0) throw new HttpError(404, 'Không tìm thấy camera');
    dropEntityJobs(db, 'camera', req.params.id);
    res.json({ success: true });
  });

  return r;
}
