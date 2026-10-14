import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs } from './helpers';

test('HR toàn hệ thống tạo, sửa, xóa khu; mã tự sinh KV01, KV02', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const hr = await loginAs(app, 'HR01');
    const a = await hr.post('/api/areas', { name: 'Trụ sở 26 Đức Giang' });
    assert.equal(a.status, 200);
    assert.equal(a.body.area.code, 'KV01');
    assert.equal((await hr.post('/api/areas', { name: 'Tổng kho' })).body.area.code, 'KV02');
    assert.equal((await hr.post('/api/areas', { code: 'kv01', name: 'Trùng' })).status, 409);
    assert.equal((await hr.post('/api/areas', { name: '  ' })).status, 400);
    const put = await hr.put(`/api/areas/${a.body.area.id}`, { name: 'Trụ sở', note: 'Tòa nhà chính' });
    assert.deepEqual([put.body.area.name, put.body.area.note, put.body.area.code], ['Trụ sở', 'Tòa nhà chính', 'KV01']);
    assert.equal((await hr.del(`/api/areas/${a.body.area.id}`)).status, 200);
    assert.equal((await hr.get('/api/areas')).body.areas.length, 1);
  } finally {
    await app.close();
  }
});

test('khu còn phòng ban hoặc camera thì không xóa được (409); số liệu và quản trị khu hiển thị đúng', async () => {
  const app = await startTestApp();
  try {
    const a = seedArea(app.db, 'KV01', 'Trụ sở');
    const d = seedDepartment(app.db, 'PB001', 'Kế toán', a);
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    seedUser(app.db, { code: 'NV01', departmentId: d });
    seedUser(app.db, { code: 'QK01', name: 'Quản Trị A', role: 'area_admin', adminAreaIds: [a] });
    const hr = await loginAs(app, 'HR01');
    const list = (await hr.get('/api/areas')).body.areas;
    assert.deepEqual(
      { dc: list[0].departmentCount, cc: list[0].cameraCount, mc: list[0].memberCount, admins: list[0].adminNames },
      { dc: 1, cc: 0, mc: 1, admins: ['Quản Trị A'] },
    );
    const del = await hr.del(`/api/areas/${a}`);
    assert.equal(del.status, 409);
    app.db.prepare('UPDATE departments SET area_id = NULL').run();
    app.db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('c1', 'Cổng', 'DEV1', ?, 'x')").run(a);
    assert.equal((await hr.del(`/api/areas/${a}`)).status, 409, 'còn camera');
  } finally {
    await app.close();
  }
});

test('quản trị khu chỉ thấy khu được giao và không tạo/sửa/xóa khu; nhân viên không thấy khu nào', async () => {
  const app = await startTestApp();
  try {
    const a = seedArea(app.db, 'KV01');
    const b = seedArea(app.db, 'KV02');
    seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a] });
    seedUser(app.db, { code: 'NV01' });
    const qk = await loginAs(app, 'QK01');
    assert.deepEqual((await qk.get('/api/areas')).body.areas.map((x: { id: string }) => x.id), [a]);
    assert.equal((await qk.post('/api/areas', { name: 'X' })).status, 403);
    assert.equal((await qk.put(`/api/areas/${a}`, { name: 'X' })).status, 403);
    assert.equal((await qk.del(`/api/areas/${b}`)).status, 403);
    const me = (await qk.get('/api/auth/me')).body;
    assert.deepEqual([me.isSystemAdmin, me.areas.map((x: { id: string }) => x.id)], [false, [a]]);
    const nv = await loginAs(app, 'NV01');
    assert.deepEqual((await nv.get('/api/areas')).body.areas, []);
  } finally {
    await app.close();
  }
});

test('GET /auth/me: isSystemAdmin chỉ đúng với tài khoản ADMIN', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    assert.equal((await (await loginAs(app, 'ADMIN')).get('/api/auth/me')).body.isSystemAdmin, true);
    assert.equal((await (await loginAs(app, 'HR01')).get('/api/auth/me')).body.isSystemAdmin, false);
  } finally {
    await app.close();
  }
});
