import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs } from './helpers';
import { PLACE, configureHanet, fakeHanet, ok, type Reply } from './fake-hanet';
import { runDueJobs } from '../server/hanet-sync';
import { SYNC_HANDLERS } from '../server/sync-handlers';

async function setup(routes: Record<string, Reply>, configured = true) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  if (configured) configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  const deps = { db: app.db, fetch: fake.fetchImpl, now: () => Date.now() };
  return { app, fake, deps, hr: await loginAs(app, 'HR01') };
}

test('nhập camera từ Hanet: chỉ thêm camera chưa có, tên lấy từ Hanet', async () => {
  const { app, fake, hr } = await setup({
    '/device/getListDeviceByPlace': ok([
      { deviceID: 'C21272C952', deviceName: 'Cổng chính', placeID: PLACE, placeName: 'HRINTER', address: '' },
      { deviceID: 'C2', deviceName: 'C2', placeID: PLACE, placeName: 'HRINTER', address: '' },
    ]),
  });
  try {
    await hr.post('/api/cameras', { name: 'Cửa sau', deviceKey: 'C2' });
    const r = await hr.post('/api/cameras/import', {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.added, 1);
    const byKey = Object.fromEntries((r.body.cameras as any[]).map((c) => [c.deviceKey, c]));
    assert.deepEqual([byKey.C21272C952.name, byKey.C21272C952.placeId, byKey.C21272C952.placeName], ['Cổng chính', PLACE, 'HRINTER']);
    assert.equal(byKey.C2.name, 'Cửa sau', 'không ghi đè camera đã có');
    assert.equal(fake.last('/device/getListDeviceByPlace')!.params.get('placeID'), String(PLACE));
    assert.equal((await hr.post('/api/cameras/import', {})).body.added, 0);
  } finally {
    await app.close();
  }
});

test('online/offline: camera không có trong kết quả coi là offline', async () => {
  const { app, fake, hr } = await setup({ '/device/getConnectionStatus': ok({ C1: true }) });
  try {
    await hr.post('/api/cameras', { name: 'A', deviceKey: 'C1' });
    await hr.post('/api/cameras', { name: 'B', deviceKey: 'C2' });
    const before = (await hr.get('/api/cameras')).body.cameras;
    assert.deepEqual(before.map((c: any) => c.online), [null, null]);
    const r = await hr.post('/api/cameras/refresh-status', {});
    const byKey = Object.fromEntries((r.body.cameras as any[]).map((c) => [c.deviceKey, c]));
    assert.equal(byKey.C1.online, true);
    assert.equal(byKey.C2.online, false);
    assert.equal(typeof byKey.C1.statusCheckedAt, 'number');
    assert.equal(fake.last('/device/getConnectionStatus')!.params.get('deviceIDs'), 'C1,C2');
  } finally {
    await app.close();
  }
});

test('đổi tên camera tạo việc camera.rename; handler gọi updateDevice', async () => {
  const { app, fake, deps, hr } = await setup({ '/device/updateDevice': ok() });
  try {
    const cam = (await hr.post('/api/cameras', { name: 'A', deviceKey: 'C1' })).body.camera;
    const r = await hr.put(`/api/cameras/${cam.id}`, { name: 'Cửa A', location: 'Tầng 1' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.camera.name, r.body.camera.location], ['Cửa A', 'Tầng 1']);
    await hr.put(`/api/cameras/${cam.id}`, { location: 'Tầng 2' });
    const jobs = app.db.prepare('SELECT op, payload FROM sync_jobs').all() as { op: string; payload: string }[];
    assert.deepEqual(jobs.map((j) => [j.op, JSON.parse(j.payload)]), [['camera.rename', { deviceId: 'C1', name: 'Cửa A' }]]);
    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/device/updateDevice')!.params;
    assert.deepEqual([p.get('deviceID'), p.get('deviceName')], ['C1', 'Cửa A']);
    assert.equal((await hr.put(`/api/cameras/${cam.id}`, { name: '  ' })).status, 400);
    assert.equal((await hr.put('/api/cameras/cam-khong-co', { name: 'X' })).status, 404);
    await hr.del(`/api/cameras/${cam.id}`);
  } finally {
    await app.close();
  }
});

test('chưa cấu hình Hanet → nhập camera và làm mới trạng thái trả 400', async () => {
  const { app, hr, fake } = await setup({}, false);
  try {
    assert.equal((await hr.post('/api/cameras/import', {})).status, 400);
    assert.equal((await hr.post('/api/cameras/refresh-status', {})).status, 400);
    assert.equal(fake.calls.length, 0);
  } finally {
    await app.close();
  }
});
