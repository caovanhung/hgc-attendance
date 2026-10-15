import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs, Client, freshDb } from './helpers';
import { getWebhookToken } from '../server/hanet';
import { listSightings, purgeSightings, recordSighting, SIGHTING_PICK_WINDOW_MS, SIGHTING_TTL_MS } from '../server/sightings';

// Payload người lạ thật từ camera C21272C952 (13/10/2026)
const STRANGER = {
  action_type: 'update', aliasID: '', data: '', data_type: 'log', date: '2026-10-13 14:37:13',
  detected_image_url: 'https://vcdn-z-image.hanet.ai/hanet-camera-image/face/upload/C21272C952/2026/10/13/eb13534e.jpg',
  deviceID: 'C21272C952', deviceName: 'C21272C952', hash: 'x', id: 'y', keycode: '', mask: '-1',
  personID: '', personName: '', personTitle: '', personType: '2', placeID: '998833', placeName: 'HRINTER', temp: 0, time: 1791877033000,
};

async function setup() {
  const app = await startTestApp();
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  seedUser(app.db, { code: 'NV01' });
  return { app, url: `/api/hanet/webhook/${getWebhookToken(app.db)}`, hook: new Client(app.baseUrl) };
}
const lastLog = (db: import('../server/db').Db) =>
  db.prepare('SELECT status, message FROM webhook_logs ORDER BY id DESC LIMIT 1').get() as { status: string; message: string };

test('webhook người lạ có ảnh → lưu sighting stranger, nhật ký ghi "Người lạ"', async () => {
  const { app, url, hook } = await setup();
  try {
    const r = await hook.post(url, STRANGER);
    assert.equal(r.status, 200);
    assert.deepEqual({ ...lastLog(app.db) }, { status: 'ignored', message: 'Người lạ' });
    const row = app.db.prepare('SELECT kind, device_id, ts, image_url, person_id FROM face_sightings').get() as Record<string, unknown>;
    assert.deepEqual({ ...row }, { kind: 'stranger', device_id: 'C21272C952', ts: 1791877033000, image_url: STRANGER.detected_image_url, person_id: null });
  } finally {
    await app.close();
  }
});

// Payload người lạ thật từ camera C21271C257 (15/10/2026): personType 3, ảnh trong thư mục alarm
const STRANGER_ALARM = {
  action_type: 'update', aliasID: '', data: '', data_type: 'log', date: '2026-10-15 14:41:42',
  detected_image_url: 'https://vcdn-z-image.hanet.ai/hanet-camera-image/alarm/upload/C21271C257/2026/10/15/de266315-c86b-11f1-ab37-ee54d8ec2954.jpg',
  deviceID: 'C21271C257', deviceName: 'VP CS2 (Hà Đông)', hash: 'ef8031380797883df9ccf60df06f1fce', id: 'ac50f481-1fd2-42f4-837e-4a77df20708f',
  keycode: '', mask: '0', personID: '', personName: '', personTitle: '', personType: '3', placeID: '998833', placeName: 'HRINTER', temp: 0,
  time: 1792050102000,
};

test('webhook người lạ personType 3 (ảnh cảnh báo) → cũng lưu sighting stranger để chọn đăng ký FaceID', async () => {
  const { app, url, hook } = await setup();
  try {
    assert.equal((await hook.post(url, STRANGER_ALARM)).status, 200);
    assert.deepEqual({ ...lastLog(app.db) }, { status: 'ignored', message: 'Người lạ' });
    const row = app.db.prepare('SELECT kind, device_id, image_url FROM face_sightings').get() as Record<string, unknown>;
    assert.deepEqual({ ...row }, { kind: 'stranger', device_id: 'C21271C257', image_url: STRANGER_ALARM.detected_image_url });
  } finally {
    await app.close();
  }
});

test('người lạ không có ảnh → không lưu sighting, nhật ký như cũ', async () => {
  const { app, url, hook } = await setup();
  try {
    await hook.post(url, { ...STRANGER, detected_image_url: '' });
    assert.equal(lastLog(app.db).message, 'Không phải sự kiện nhận diện');
    assert.equal((app.db.prepare('SELECT COUNT(*) AS c FROM face_sightings').get() as { c: number }).c, 0);
  } finally {
    await app.close();
  }
});

test('người có trên Hanet nhưng chưa có trên web → sighting unlinked; danh sách bỏ trùng và bỏ người đã thành nhân sự', async () => {
  const { app, url, hook } = await setup();
  try {
    const face = { aliasID: '003', personID: 'P3', personName: 'Dương Đức Văn', personType: '0', deviceID: 'C1', detected_image_url: 'https://img/3.jpg' };
    await hook.post(url, { ...face, time: Date.now() - 60_000 });
    await hook.post(url, { ...face, time: Date.now() - 30_000 });
    await hook.post(url, { aliasID: 'NV01', personType: '0', deviceID: 'C1', detected_image_url: 'https://img/nv01.jpg', time: Date.now() });
    await hook.post(url, STRANGER);
    const hr = await loginAs(app, 'HR01');
    const unlinked = (await hr.get('/api/hanet/sightings?kind=unlinked')).body.sightings;
    assert.deepEqual(unlinked.map((s: any) => [s.kind, s.personId, s.aliasId, s.personName]), [['unlinked', 'P3', '003', 'Dương Đức Văn']]);
    const all = (await hr.get('/api/hanet/sightings')).body.sightings;
    assert.deepEqual(all.map((s: any) => s.kind), ['stranger', 'unlinked']);
    assert.equal((await hr.get('/api/hanet/sightings?kind=abc')).status, 400);

    seedUser(app.db, { code: 'NV-KHAC', hanetPersonId: 'P3' });
    assert.deepEqual((await hr.get('/api/hanet/sightings?kind=unlinked')).body.sightings, []);

    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.get('/api/hanet/sightings')).status, 403);
  } finally {
    await app.close();
  }
});

test('chỉ liệt kê lượt trong 30 phút; dọn lượt quá 24 giờ', () => {
  const db = freshDb();
  const now = Date.now();
  const s = { kind: 'stranger' as const, personId: null, aliasId: null, personName: null, deviceId: 'C1', deviceName: null, ts: now, imageUrl: 'https://img/x.jpg' };
  recordSighting(db, s, now - SIGHTING_TTL_MS - 1000);
  recordSighting(db, s, now - SIGHTING_PICK_WINDOW_MS - 1000);
  recordSighting(db, s, now - 1000);
  assert.equal(listSightings(db, now).length, 1);
  assert.equal(purgeSightings(db, now), 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM face_sightings').get() as { c: number }).c, 2);
});
