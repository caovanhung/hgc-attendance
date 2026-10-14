import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, type TestApp } from './helpers';

const SHIFT = { name: 'Cửa hàng', workStart: '07:00', workEnd: '19:00', workDays: [1, 2, 3, 4, 5, 6, 7], lateGraceMinutes: 15, earlyArrivalMinutes: 15, earlyLeaveMinutes: 10 };

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const ids: Record<string, string> = {
    A, B,
    pa: seedDepartment(app.db, 'PA', 'PA', A),
    pb: seedDepartment(app.db, 'PB', 'PB', B),
  };
  ids.hr = seedUser(app.db, { code: 'HR01', role: 'hr' });
  ids.qk = seedUser(app.db, { code: 'QKA', role: 'area_admin', adminAreaIds: [A] });
  ids.nvA = seedUser(app.db, { code: 'NVA', departmentId: ids.pa });
  ids.nvB = seedUser(app.db, { code: 'NVB', departmentId: ids.pb });
  return { app, ids };
}

test('quản trị khu tạo/sửa/xóa ca trong khu mình; ca khu khác 404; tên trùng trong khu 409', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.post('/api/shifts', { ...SHIFT, areaId: ids.B })).status, 404);
    assert.equal((await qk.post('/api/shifts', SHIFT)).status, 400, 'thiếu khu');
    const c = await qk.post('/api/shifts', { ...SHIFT, areaId: ids.A });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.deepEqual([c.body.shift.areaId, c.body.shift.workDays], [ids.A, [1, 2, 3, 4, 5, 6, 7]]);
    assert.equal((await qk.post('/api/shifts', { ...SHIFT, areaId: ids.A })).status, 409);
    const hr = await loginAs(app, 'HR01');
    const sb = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.B, name: 'Kho B' })).body.shift;
    assert.deepEqual((await qk.get('/api/shifts')).body.shifts.map((s: { id: string }) => s.id), [c.body.shift.id]);
    assert.equal((await qk.put(`/api/shifts/${sb.id}`, { name: 'X' })).status, 404);
    assert.equal((await qk.del(`/api/shifts/${sb.id}`)).status, 404);
    assert.equal((await qk.put(`/api/shifts/${c.body.shift.id}`, { workEnd: '06:00' })).status, 400);
    assert.equal((await qk.del(`/api/shifts/${c.body.shift.id}`)).status, 200);
  } finally {
    await app.close();
  }
});

test('gán ca: phải cùng khu; ca đang dùng không xóa được; đổi giờ ca thì tính lại từ đầu tháng', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    const s = (await qk.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    const hr = await loginAs(app, 'HR01');
    const sb = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.B, name: 'Kho B' })).body.shift;
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { shiftId: sb.id })).status, 400);
    const d = await qk.put(`/api/departments/${ids.pa}`, { shiftId: s.id });
    assert.deepEqual([d.status, d.body.department.shiftName], [200, 'Cửa hàng']);
    assert.equal((await hr.put(`/api/users/${ids.nvB}`, { shiftId: s.id })).status, 400, 'ca khu A cho người khu B');
    const u = await qk.put(`/api/users/${ids.nvA}`, { shiftId: s.id });
    assert.deepEqual([u.status, u.body.user.shiftId], [200, s.id]);
    assert.equal((await qk.del(`/api/shifts/${s.id}`)).status, 409);
    const put = await qk.put(`/api/shifts/${s.id}`, { workStart: '06:30' });
    assert.equal(put.status, 200);
    assert.equal(typeof put.body.recomputed, 'number');
    assert.ok(put.body.recomputed >= 1, 'đã tính lại cho NVA');
  } finally {
    await app.close();
  }
});

test('quản trị khu không tự đổi ca riêng của mình', async () => {
  const { app, ids } = await setup();
  try {
    app.db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(ids.pa, ids.qk);
    const qk = await loginAs(app, 'QKA');
    const s = (await qk.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    assert.equal((await qk.put(`/api/users/${ids.qk}`, { shiftId: s.id })).status, 400);
  } finally {
    await app.close();
  }
});

test('ngày lễ: HR toàn hệ thống thêm/xóa, mọi người xem theo năm; thêm ngày đã qua thì tính lại ngày đó', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NVA');
    assert.equal((await nv.post('/api/holidays', { date: '2026-12-31', name: 'X' })).status, 403);
    assert.equal((await hr.post('/api/holidays', { date: '31/12/2026', name: 'X' })).status, 400);
    assert.equal((await hr.post('/api/holidays', { date: '2026-12-31', name: '' })).status, 400);
    const h = await hr.post('/api/holidays', { date: '2026-10-13', name: 'Nghỉ bù' });
    assert.equal(h.status, 200);
    assert.ok(h.body.recomputed >= 1);
    assert.equal((await hr.post('/api/holidays', { date: '2026-10-13', name: 'Trùng' })).status, 409);
    assert.deepEqual((await nv.get('/api/holidays?year=2026')).body.holidays, [{ date: '2026-10-13', name: 'Nghỉ bù' }]);
    assert.deepEqual((await nv.get('/api/holidays?year=2025')).body.holidays, []);
    assert.equal((await hr.del('/api/holidays/2026-10-13')).status, 200);
    assert.equal((await hr.del('/api/holidays/2026-10-13')).status, 404);
  } finally {
    await app.close();
  }
});

test('ca mặc định: PUT /settings/work nhận ngày làm và ngưỡng mới, trả số dòng đã tính lại', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.put('/api/settings/work', {
      workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30, workDays: [1, 2, 3, 4, 5, 6], earlyArrivalMinutes: 20, earlyLeaveMinutes: 5,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.settings.workDays, r.body.settings.earlyLeaveMinutes], [[1, 2, 3, 4, 5, 6], 5]);
    assert.equal(typeof r.body.recomputed, 'number');
  } finally {
    await app.close();
  }
});
