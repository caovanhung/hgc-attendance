import { Router } from 'express';
import type { AppContext } from '../context';
import { newId } from '../db';
import { HttpError } from '../errors';
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
    createdAt: r.created_at,
  };
}

export function cameraRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/cameras', (_req, res) => {
    res.json({ cameras: (db.prepare('SELECT * FROM cameras ORDER BY name').all() as Row[]).map(mapCamera) });
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

  return r;
}
