import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok, type Reply } from './fake-hanet';
import { recordSighting, SIGHTING_TTL_MS } from '../server/sightings';
import type { Db } from '../server/db';

const IMG = 'https://vcdn-z-image.hanet.ai/hanet-camera-image/face/upload/C21272C952/2026/10/13/stranger.jpg';

function addStranger(db: Db): number {
  const now = Date.now();
  recordSighting(db, { kind: 'stranger', personId: null, aliasId: null, personName: null, deviceId: 'C21272C952', deviceName: 'C21272C952', ts: now, imageUrl: IMG }, now);
  return (db.prepare('SELECT MAX(id) AS id FROM face_sightings').get() as { id: number }).id;
}
const sightingCount = (db: Db) => (db.prepare('SELECT COUNT(*) AS c FROM face_sightings').get() as { c: number }).c;

async function setup(routes: Record<string, Reply>, configured = true) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  if (configured) configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  return { app, fake, hr: await loginAs(app, 'HR01') };
}

test('tạo nhân sự từ ảnh người lạ → đăng ký FaceID, lưu Person ID, xóa lượt chụp (Review Focus #3: tên tiếng Việt nguyên vẹn)', async () => {
  const { app, fake, hr } = await setup({ '/person/registerByUrl': ok({ personID: '1889724440081326080', aliasID: 'NV09' }) });
  try {
    const sightingId = addStranger(app.db);
    const r = await hr.post('/api/users', { code: 'nv09', name: 'Cao Văn Hùng & Cộng sự', position: 'Kế toán viên', sightingId });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.face, { ok: true, message: 'Đã đăng ký FaceID trên Hanet' });
    assert.ok(r.body.tempPassword);
    assert.deepEqual([r.body.user.faceRegistered, r.body.user.hanetPersonId, r.body.user.faceError], [true, '1889724440081326080', null]);
    const p = fake.last('/person/registerByUrl')!.params;
    assert.deepEqual(
      [p.get('name'), p.get('aliasID'), p.get('placeID'), p.get('url'), p.get('title'), p.get('type')],
      ['Cao Văn Hùng & Cộng sự', 'NV09', String(PLACE), IMG, 'Kế toán viên', '0'],
    );
    assert.equal(sightingCount(app.db), 0);
  } finally {
    await app.close();
  }
});

test('-9006 ảnh không đạt: vẫn tạo nhân sự, ghi lý do, giữ lượt chụp', async () => {
  const { app, hr } = await setup({ '/person/registerByUrl': fail(-9006) });
  try {
    const r = await hr.post('/api/users', { code: 'NV10', name: 'Người Mới', sightingId: addStranger(app.db) });
    assert.equal(r.status, 200);
    assert.equal(r.body.face.ok, false);
    assert.match(r.body.face.message, /^Ảnh không đạt/);
    assert.equal(r.body.user.faceRegistered, false);
    assert.equal(r.body.user.faceError, r.body.face.message);
    assert.equal(sightingCount(app.db), 1);
  } finally {
    await app.close();
  }
});

test('-9005 mã đã là aliasID của người khác trên Hanet: không liên kết, báo lỗi và lưu face_error', async () => {
  const { app, fake, hr } = await setup({
    '/person/registerByUrl': fail(-9005),
    '/person/getUserInfoByAliasID': ok([{ aliasID: 'NV11', name: 'X', personID: 'P-CU', avatar: '', title: '' }]),
  });
  try {
    const sightingId = addStranger(app.db);
    const r = await hr.post('/api/users', { code: 'NV11', name: 'X', sightingId });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const message = 'Mã NV11 đã là aliasID của một người khác trên Hanet. Dùng "Nhập từ Hanet" để liên kết người đó, hoặc đổi mã nhân viên.';
    assert.deepEqual(r.body.face, { ok: false, message });
    assert.deepEqual([r.body.user.hanetPersonId, r.body.user.faceRegistered, r.body.user.faceError], [null, false, message]);
    assert.equal(fake.last('/person/getUserInfoByAliasID'), undefined, 'không tra để liên kết');
    assert.equal(sightingCount(app.db), 1, 'giữ lượt chụp để HR thử lại');
  } finally {
    await app.close();
  }
});

test('-9008 hết lượt FaceID miễn phí: báo rõ', async () => {
  const { app, hr } = await setup({ '/person/registerByUrl': fail(-9008) });
  try {
    const r = await hr.post('/api/users', { code: 'NV12', name: 'X', sightingId: addStranger(app.db) });
    assert.equal(r.body.face.message, 'Địa điểm đã hết số khuôn mặt miễn phí, cần mua gói cloud Hanet (mã -9008)');
  } finally {
    await app.close();
  }
});

test('đã có FaceID → đổi ảnh bằng updateByFaceUrlByAliasID, không đăng ký lại', async () => {
  const { app, fake, hr } = await setup({ '/person/updateByFaceUrlByAliasID': ok({ path: 'x' }) });
  try {
    const id = seedUser(app.db, { code: 'NV13', hanetPersonId: 'P13' });
    app.db.prepare('UPDATE users SET face_registered = 1 WHERE id = ?').run(id);
    const r = await hr.post(`/api/users/${id}/face`, { sightingId: addStranger(app.db) });
    assert.deepEqual(r.body.face, { ok: true, message: 'Đã cập nhật ảnh nhận diện trên Hanet' });
    const p = fake.last('/person/updateByFaceUrlByAliasID')!.params;
    assert.deepEqual([p.get('aliasID'), p.get('placeID'), p.get('url')], ['NV13', String(PLACE), IMG]);
    assert.equal(fake.last('/person/registerByUrl'), undefined);
  } finally {
    await app.close();
  }
});

test('chọn lượt quẹt của chính người đó trong 24 giờ; lượt cũ hơn → 404; không chọn gì → 400', async () => {
  const { app, hr } = await setup({ '/person/registerByUrl': ok({ personID: 'P14' }) });
  try {
    const id = seedUser(app.db, { code: 'NV14' });
    const insert = app.db.prepare(
      "INSERT INTO detections(user_id, device_id, ts, work_date, image_url, source) VALUES (?, 'C1', ?, '2026-10-13', ?, 'webhook')",
    );
    insert.run(id, Date.now() - SIGHTING_TTL_MS - 60_000, 'https://img/cu.jpg');
    insert.run(id, Date.now() - 60_000, 'https://img/moi.jpg');
    const [oldId, newId] = (app.db.prepare('SELECT id FROM detections ORDER BY ts').all() as { id: number }[]).map((r) => r.id);
    assert.equal((await hr.post(`/api/users/${id}/face`, { detectionId: oldId })).status, 404);
    assert.equal((await hr.post(`/api/users/${id}/face`, {})).status, 400);
    const r = await hr.post(`/api/users/${id}/face`, { detectionId: newId });
    assert.equal(r.body.face.ok, true);
    const c = (await hr.get(`/api/users/${id}/face-candidates`)).body;
    assert.deepEqual(c.detections.map((d: any) => d.imageUrl), ['https://img/moi.jpg']);
    assert.deepEqual(c.strangers, []);
  } finally {
    await app.close();
  }
});

test('có phòng ban → sau khi có FaceID thêm việc user.department', async () => {
  const { app, hr } = await setup({ '/person/registerByUrl': ok({ personID: 'P15' }) });
  try {
    const kt = seedDepartment(app.db, 'KT');
    const r = await hr.post('/api/users', { code: 'NV15', name: 'X', departmentId: kt, sightingId: addStranger(app.db) });
    const jobs = app.db.prepare('SELECT entity_id, op, payload FROM sync_jobs').all() as { entity_id: string; op: string; payload: string }[];
    assert.deepEqual(jobs.map((j) => [j.entity_id, j.op, JSON.parse(j.payload)]), [[r.body.user.id, 'user.department', { fromHanetDeptId: null, toDepartmentId: kt }]]);
  } finally {
    await app.close();
  }
});

test('chưa cấu hình Hanet: không gọi Hanet, báo lý do; lượt chụp không tồn tại → 404 và không tạo nhân sự', async () => {
  const { app, fake, hr } = await setup({}, false);
  try {
    const r = await hr.post('/api/users', { code: 'NV16', name: 'X', sightingId: addStranger(app.db) });
    assert.deepEqual(r.body.face, { ok: false, message: 'Chưa cấu hình kết nối Hanet (Client ID, Refresh Token, địa điểm)' });
    assert.equal(fake.calls.length, 0);
    assert.equal((await hr.post('/api/users', { code: 'NV17', name: 'X', sightingId: 999 })).status, 404);
    assert.equal(app.db.prepare("SELECT 1 FROM users WHERE code = 'NV17'").get(), undefined);
  } finally {
    await app.close();
  }
});

test('tạo nhân sự kèm Person ID (liên kết người đã có trên Hanet) → faceRegistered = true', async () => {
  const { app, hr } = await setup({});
  try {
    const r = await hr.post('/api/users', { code: '003', name: 'Dương Đức Văn', hanetPersonId: 'P3' });
    assert.equal(r.body.user.faceRegistered, true);
    assert.equal(r.body.face, undefined);
  } finally {
    await app.close();
  }
});
