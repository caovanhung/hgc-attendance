import type { Db } from './db';
import type { FaceSighting, SightingKind } from '../shared/types';

export const SIGHTING_TTL_MS = 24 * 60 * 60_000;
export const SIGHTING_PICK_WINDOW_MS = 30 * 60_000;
const LIST_LIMIT = 30;

export interface NewSighting {
  kind: SightingKind;
  personId: string | null;
  aliasId: string | null;
  personName: string | null;
  deviceId: string;
  deviceName: string | null;
  ts: number;
  imageUrl: string;
}

type Row = Record<string, any>;

function mapSighting(r: Row): FaceSighting {
  return {
    id: r.id,
    kind: r.kind,
    personId: r.person_id ?? null,
    aliasId: r.alias_id ?? null,
    personName: r.person_name ?? null,
    deviceId: r.device_id,
    deviceName: r.device_name ?? null,
    ts: r.ts,
    imageUrl: r.image_url,
  };
}

export function recordSighting(db: Db, s: NewSighting, now: number): void {
  db.prepare(
    `INSERT INTO face_sightings(kind, person_id, alias_id, person_name, device_id, device_name, ts, image_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(s.kind, s.personId, s.aliasId, s.personName, s.deviceId, s.deviceName, s.ts, s.imageUrl, now);
}

/**
 * Lượt nhận trong 30 phút gần nhất, mới nhất trước. Với `unlinked`: mỗi người một dòng
 * và bỏ người nay đã là nhân sự (khớp mã hoặc Person ID).
 */
export function listSightings(db: Db, now: number, kind?: SightingKind): FaceSighting[] {
  const since = now - SIGHTING_PICK_WINDOW_MS;
  const rows = (
    kind
      ? db.prepare('SELECT * FROM face_sightings WHERE created_at >= ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 500').all(since, kind)
      : db.prepare('SELECT * FROM face_sightings WHERE created_at >= ? ORDER BY created_at DESC, id DESC LIMIT 500').all(since)
  ) as Row[];
  const known = db.prepare('SELECT 1 FROM users WHERE code = ? OR (hanet_person_id IS NOT NULL AND hanet_person_id = ?)');
  const seen = new Set<string>();
  const out: FaceSighting[] = [];
  for (const r of rows) {
    const s = mapSighting(r);
    if (s.kind === 'unlinked') {
      const key = s.personId ?? `alias:${s.aliasId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (known.get(s.aliasId?.toUpperCase() ?? '', s.personId ?? '')) continue;
    }
    out.push(s);
    if (out.length >= LIST_LIMIT) break;
  }
  return out;
}

export function getSighting(db: Db, id: number): FaceSighting | null {
  const row = db.prepare('SELECT * FROM face_sightings WHERE id = ?').get(id) as Row | undefined;
  return row ? mapSighting(row) : null;
}

export function deleteSighting(db: Db, id: number): void {
  db.prepare('DELETE FROM face_sightings WHERE id = ?').run(id);
}

export function purgeSightings(db: Db, now: number): number {
  return Number(db.prepare('DELETE FROM face_sightings WHERE created_at < ?').run(now - SIGHTING_TTL_MS).changes);
}
