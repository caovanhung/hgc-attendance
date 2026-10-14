import { Router } from 'express';
import type { AppContext } from '../context';
import { newId } from '../db';
import { HttpError, ah } from '../errors';
import { importCameras, refreshCameraStatus } from '../cameras';
import { reconcileEnabled } from '../hanet';
import { dropEntityJobs, enqueue, kickEntity } from '../hanet-sync';
import { currentUser } from '../middleware';
import { areaColumnSql, cameraScopeSql, managesArea, notFound, parseAreaFilter, requireGlobalHr, requireManager, resolveAreaFor } from '../access';
import type { Row } from '../repo';
import type { Camera } from '../../shared/types';

const CAMERA_SELECT = 'SELECT c.*, ar.name AS area_name FROM cameras c LEFT JOIN areas ar ON ar.id = c.area_id';

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
    areaId: r.area_id ?? null,
    areaName: r.area_name ?? null,
    createdAt: r.created_at,
  };
}

export function cameraRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();
  const deps = { db, fetch: ctx.fetch, now: ctx.now };
  const listCameras = () => (db.prepare(`${CAMERA_SELECT} ORDER BY c.name`).all() as Row[]).map(mapCamera);
  const requireHanet = () => {
    if (!reconcileEnabled(db)) throw new HttpError(400, 'Chưa cấu hình kết nối Camera AI (Client ID, Refresh Token, địa điểm)');
  };

  r.get('/cameras', (req, res) => {
    const actor = currentUser(req);
    const s = cameraScopeSql(actor);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), 'c.area_id');
    const rows = db.prepare(`${CAMERA_SELECT} WHERE ${s.sql} AND ${f.sql} ORDER BY c.name`).all(...s.params, ...f.params) as Row[];
    res.json({ cameras: rows.map(mapCamera) });
  });

  r.post('/cameras', requireGlobalHr, (req, res) => {
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = text(b.name);
    const deviceKey = text(b.deviceKey);
    if (!name || !deviceKey) throw new HttpError(400, 'Tên camera và mã thiết bị là bắt buộc');
    const placeId = b.placeId === undefined || b.placeId === '' || b.placeId === null ? null : Number(b.placeId);
    if (placeId !== null && (!Number.isInteger(placeId) || placeId <= 0)) throw new HttpError(400, 'Place ID không hợp lệ');
    const areaId = resolveAreaFor(db, currentUser(req), b.areaId);
    if (db.prepare('SELECT 1 FROM cameras WHERE device_key = ?').get(deviceKey)) throw new HttpError(409, 'Mã thiết bị đã tồn tại');
    const id = newId('cam');
    db.prepare(
      'INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, name, deviceKey, placeId, text(b.placeName), text(b.location), text(b.ipAddress), areaId, new Date(ctx.now()).toISOString());
    res.json({ camera: mapCamera(db.prepare(`${CAMERA_SELECT} WHERE c.id = ?`).get(id) as Row) });
  });

  r.post(
    '/cameras/import',
    requireGlobalHr,
    ah(async (_req, res) => {
      requireHanet();
      let added: number;
      try {
        added = await importCameras(deps);
      } catch (err) {
        throw new HttpError(502, `Không lấy được danh sách camera từ Camera AI: ${(err as Error).message}`);
      }
      res.json({ added, cameras: listCameras() });
    }),
  );

  r.post(
    '/cameras/refresh-status',
    requireGlobalHr,
    ah(async (_req, res) => {
      requireHanet();
      try {
        await refreshCameraStatus(deps);
      } catch (err) {
        throw new HttpError(502, `Không lấy được trạng thái camera từ Camera AI: ${(err as Error).message}`);
      }
      res.json({ cameras: listCameras() });
    }),
  );

  r.put('/cameras/:id', requireManager, (req, res) => {
    const actor = currentUser(req);
    const row = db.prepare(`${CAMERA_SELECT} WHERE c.id = ?`).get(req.params.id) as Row | undefined;
    if (!row || !managesArea(actor, row.area_id ?? null)) throw notFound('camera');
    const b = req.body ?? {};
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = b.name === undefined ? row.name : text(b.name);
    if (!name) throw new HttpError(400, 'Tên camera là bắt buộc');
    const areaId = b.areaId === undefined ? (row.area_id ?? null) : resolveAreaFor(db, actor, b.areaId);
    db.prepare('UPDATE cameras SET name = ?, location = ?, ip_address = ?, area_id = ? WHERE id = ?').run(
      name,
      b.location === undefined ? row.location : text(b.location),
      b.ipAddress === undefined ? row.ip_address : text(b.ipAddress),
      areaId,
      row.id,
    );
    if (name !== row.name) {
      enqueue(db, 'camera', row.id, 'camera.rename', { deviceId: row.device_key, name }, ctx.now());
      kickEntity(ctx, 'camera', row.id);
    }
    res.json({ camera: mapCamera(db.prepare(`${CAMERA_SELECT} WHERE c.id = ?`).get(row.id) as Row) });
  });

  r.delete('/cameras/:id', requireManager, (req, res) => {
    const row = db.prepare('SELECT id, area_id FROM cameras WHERE id = ?').get(req.params.id) as { id: string; area_id: string | null } | undefined;
    if (!row || !managesArea(currentUser(req), row.area_id)) throw notFound('camera');
    db.prepare('DELETE FROM cameras WHERE id = ?').run(row.id);
    dropEntityJobs(db, 'camera', row.id);
    res.json({ success: true });
  });

  return r;
}
