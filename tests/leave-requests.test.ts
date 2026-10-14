import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedDepartment, seedUser, loginAs } from './helpers';
import { addDays } from '../server/vntime';

const NOW = Date.UTC(2026, 9, 14, 3, 0); // thứ 4 14/10/2026, 10:00 giờ VN

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const kt = seedDepartment(app.db, 'KT');
  seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt });
  const nv = seedUser(app.db, { code: 'NV01', departmentId: kt });
  return { app, nv, tp: await loginAs(app, 'TP01'), me: await loginAs(app, 'NV01') };
}
const statuses = (app: { db: { prepare: (s: string) => { all: (...a: unknown[]) => unknown[] } } }, id: string) =>
  (app.db.prepare('SELECT work_date, status FROM attendance_days WHERE user_id = ? ORDER BY work_date').all(id) as { work_date: string; status: string }[]).map((x) => `${x.work_date}:${x.status}`);

test('gửi đơn theo khoảng: kiểm tra khoảng, tối đa 31 ngày, trước tối đa 7 ngày; loại khác không cho tương lai', async () => {
  const { app, me } = await setup();
  try {
    const ok = await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-16', endDate: '2026-10-19', reason: 'Việc nhà' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.request.endDate, '2026-10-19');
    assert.equal((await me.post('/api/requests', { type: 'business_trip', workDate: '2026-10-21', reason: 'x' })).status, 200, 'đúng hôm nay + 7');
    assert.equal((await me.post('/api/requests', { type: 'business_trip', workDate: '2026-10-22', reason: 'x' })).status, 400, 'quá 7 ngày');
    assert.equal((await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-19', endDate: '2026-10-16', reason: 'x' })).status, 400);
    assert.equal((await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-01', endDate: addDays('2026-10-01', 31), reason: 'x' })).status, 400, '32 ngày');
    assert.equal((await me.post('/api/requests', { type: 'late_explanation', workDate: '2026-10-15', reason: 'x' })).status, 400, 'giải trình cho ngày tương lai');
    assert.equal((await me.post('/api/requests', { type: 'late_explanation', workDate: '2026-10-14', endDate: '2026-10-15', reason: 'x' })).status, 400, 'loại khác không có khoảng');
  } finally {
    await app.close();
  }
});

test('Review Focus #4: duyệt nghỉ phép thứ 6 → thứ 2 chỉ đánh dấu thứ 6 và thứ 2', async () => {
  const { app, nv, tp, me } = await setup();
  try {
    const r = (await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-16', endDate: '2026-10-19', reason: 'x' })).body.request;
    assert.equal((await tp.put(`/api/requests/${r.id}`, { status: 'approved' })).status, 200);
    assert.deepEqual(statuses(app, nv), ['2026-10-16:leave', '2026-10-19:leave']);
  } finally {
    await app.close();
  }
});

test('duyệt đơn chồng ngày với đơn đã duyệt ⇒ 409; từ chối không đổi ngày công', async () => {
  const { app, nv, tp, me } = await setup();
  try {
    const a = (await me.post('/api/requests', { type: 'leave_request', workDate: '2026-10-15', endDate: '2026-10-16', reason: 'x' })).body.request;
    const b = (await me.post('/api/requests', { type: 'business_trip', workDate: '2026-10-16', reason: 'x' })).body.request;
    const c = (await me.post('/api/requests', { type: 'business_trip', workDate: '2026-10-20', reason: 'x' })).body.request;
    assert.equal((await tp.put(`/api/requests/${a.id}`, { status: 'approved' })).status, 200);
    const dup = await tp.put(`/api/requests/${b.id}`, { status: 'approved' });
    assert.deepEqual([dup.status, dup.body.error], [409, 'Khoảng ngày trùng với đơn đã duyệt']);
    assert.equal((await tp.put(`/api/requests/${c.id}`, { status: 'rejected' })).status, 200);
    assert.deepEqual(statuses(app, nv), ['2026-10-15:leave', '2026-10-16:leave']);
  } finally {
    await app.close();
  }
});
