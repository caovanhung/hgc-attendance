import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, addDetection, type TestApp } from './helpers';
import { recordSighting } from '../server/sightings';

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01', 'Trụ sở');
  const B = seedArea(app.db, 'KV02', 'Tổng kho');
  const pa = seedDepartment(app.db, 'PA', 'Phòng A', A);
  const pb = seedDepartment(app.db, 'PB', 'Phòng B', B);
  const pn = seedDepartment(app.db, 'PN', 'Phòng chưa gán khu');
  const ids: Record<string, string> = {
    A, B, pa, pb, pn,
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    qkA: seedUser(app.db, { code: 'QKA', role: 'area_admin', adminAreaIds: [A] }),
    qkAB: seedUser(app.db, { code: 'QKAB', role: 'area_admin', adminAreaIds: [A, B] }),
    tpA: seedUser(app.db, { code: 'TPA', role: 'dept_manager', departmentId: pa }),
    nvA: seedUser(app.db, { code: 'NVA', departmentId: pa }),
    nvB: seedUser(app.db, { code: 'NVB', departmentId: pb }),
    nvN: seedUser(app.db, { code: 'NVN', departmentId: pn }),
  };
  app.db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('camA', 'Cổng A', 'DEVA', ?, 'x'), ('camB', 'Cổng B', 'DEVB', ?, 'x'), ('camN', 'Cổng N', 'DEVN', NULL, 'x')").run(A, B);
  const now = Date.now();
  // NVA quẹt ở camera khu B: vẫn tính cho khu A (khu của phòng)
  addDetection(app.db, ids.nvA, now, { deviceId: 'DEVB' });
  addDetection(app.db, ids.nvB, now, { deviceId: 'DEVB' });
  ids.detA = String((app.db.prepare('SELECT id FROM detections WHERE user_id = ?').get(ids.nvA) as { id: number }).id);
  ids.detB = String((app.db.prepare('SELECT id FROM detections WHERE user_id = ?').get(ids.nvB) as { id: number }).id);
  for (const code of ['NVA', 'NVB']) {
    const c = await loginAs(app, code);
    await c.post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' });
  }
  return { app, ids };
}

const codes = (rows: { code?: string; employeeCode?: string }[]) => rows.map((r) => r.code ?? r.employeeCode).sort();

test('danh sách nhân sự, phòng ban, camera theo khu; bộ lọc ?area=', async () => {
  const { app, ids } = await setup();
  try {
    const qkA = await loginAs(app, 'QKA');
    assert.deepEqual(codes((await qkA.get('/api/users')).body.users), ['NVA', 'TPA']);
    assert.deepEqual(codes((await qkA.get('/api/departments')).body.departments), ['PA']);
    assert.deepEqual((await qkA.get('/api/cameras')).body.cameras.map((c: { deviceKey: string }) => c.deviceKey), ['DEVA']);
    assert.equal((await qkA.get(`/api/users?area=${ids.B}`)).status, 404);
    assert.equal((await qkA.get('/api/users?area=none')).status, 404);

    const qkAB = await loginAs(app, 'QKAB');
    assert.deepEqual(codes((await qkAB.get('/api/users')).body.users), ['NVA', 'NVB', 'TPA']);
    assert.deepEqual(codes((await qkAB.get(`/api/users?area=${ids.B}`)).body.users), ['NVB']);

    const hr = await loginAs(app, 'HR01');
    assert.deepEqual(codes((await hr.get('/api/users?area=none')).body.users), ['HR01', 'NVN', 'QKA', 'QKAB']);
    assert.deepEqual((await hr.get('/api/cameras?area=none')).body.cameras.map((c: { deviceKey: string }) => c.deviceKey), ['DEVN']);
    assert.deepEqual(codes((await hr.get(`/api/departments?area=${ids.A}`)).body.departments), ['PA']);

    const tpA = await loginAs(app, 'TPA');
    assert.deepEqual(codes((await tpA.get('/api/departments')).body.departments), ['PA']);
    assert.deepEqual((await tpA.get('/api/cameras')).body.cameras.map((c: { deviceKey: string }) => c.deviceKey), ['DEVA']);
    const nvA = await loginAs(app, 'NVA');
    assert.deepEqual((await nvA.get('/api/cameras')).body.cameras, []);
  } finally {
    await app.close();
  }
});

test('bảng công, thống kê, đơn: tính theo khu của nhân sự, kể cả quẹt ở camera khu khác', async () => {
  const { app, ids } = await setup();
  try {
    const qkA = await loginAs(app, 'QKA');
    assert.deepEqual(codes((await qkA.get('/api/attendance')).body.records), ['NVA']);
    const stats = (await qkA.get('/api/stats')).body;
    assert.deepEqual([stats.totalEmployees, stats.presentCount, stats.pendingRequests, stats.totalCameras], [2, 1, 1, 1]);
    assert.deepEqual(codes((await qkA.get('/api/stats/details?type=present')).body.rows), ['NVA']);
    assert.deepEqual((await qkA.get('/api/requests')).body.requests.map((r: { employeeCode: string }) => r.employeeCode), ['NVA']);
    const hr = await loginAs(app, 'HR01');
    assert.deepEqual(codes((await hr.get(`/api/attendance?area=${ids.B}`)).body.records), ['NVB']);
    assert.equal((await hr.get(`/api/stats?area=${ids.B}`)).body.totalCameras, 1);
  } finally {
    await app.close();
  }
});

test('lượt quẹt và video: quản trị khu ngoài khu nhận 404; trong khu qua được kiểm tra phạm vi', async () => {
  const { app, ids } = await setup();
  try {
    const qkA = await loginAs(app, 'QKA');
    const day = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const mine = await qkA.get(`/api/attendance/${ids.nvA}/${day}/detections`);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.detections[0].hasVideo, true);
    assert.equal((await qkA.get(`/api/attendance/${ids.nvB}/${day}/detections`)).status, 404);
    assert.equal((await qkA.get(`/api/detections/${ids.detB}/video`)).status, 404);
    // Trong khu: qua phạm vi, dừng ở bước "chưa cấu hình tài khoản xem video" (400)
    assert.equal((await qkA.get(`/api/detections/${ids.detA}/video`)).status, 400);
  } finally {
    await app.close();
  }
});

test('ảnh người lạ: quản trị khu chỉ thấy ảnh từ camera thuộc khu mình', async () => {
  const { app } = await setup();
  try {
    const now = Date.now();
    for (const deviceId of ['DEVA', 'DEVB', 'DEVN']) {
      recordSighting(app.db, { kind: 'stranger', personId: null, aliasId: null, personName: null, deviceId, deviceName: deviceId, ts: now, imageUrl: `https://x/${deviceId}.jpg` }, now);
    }
    const qkA = await loginAs(app, 'QKA');
    assert.deepEqual((await qkA.get('/api/hanet/sightings')).body.sightings.map((s: { deviceId: string }) => s.deviceId), ['DEVA']);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.get('/api/hanet/sightings')).body.sightings.length, 3);
  } finally {
    await app.close();
  }
});
