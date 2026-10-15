import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, addDetection, type TestApp } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';
import { recomputeUsers, closeDays } from '../server/attendance';

const NOW = vnDateTimeToTs('2026-10-15', '10:00');
const at = (d: string, hhmm: string) => vnDateTimeToTs(d, hhmm);

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 }),
    nv: seedUser(app.db, { code: 'NV01', departmentId: d1 }),
  };
  app.db.prepare("UPDATE users SET created_at = '2026-09-01'").run();
  return { app, ids };
}

const day = (app: TestApp, userId: string, date: string) =>
  app.db.prepare('SELECT status, first_in FROM attendance_days WHERE user_id = ? AND work_date = ?').get(userId, date) as
    | { status: string; first_in: number | null }
    | undefined;

test('khóa / mở khóa: chỉ HR, kiểm tra tháng, trùng 409, ghi nhật ký, GET danh sách', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/month-locks/2026-09')).status, 200);
    assert.equal((await hr.post('/api/month-locks/2026-09')).status, 409);
    assert.equal((await hr.post('/api/month-locks/2026-11')).status, 400); // tháng tương lai
    for (const bad of ['2026-13', '2026-1', 'abc']) assert.equal((await hr.post(`/api/month-locks/${bad}`)).status, 400);
    assert.equal((await (await loginAs(app, 'TP01')).post('/api/month-locks/2026-08')).status, 403);
    const list = await (await loginAs(app, 'TP01')).get('/api/month-locks?year=2026');
    assert.deepEqual(
      list.body.locks.map((l: { month: string; lockedByName: string }) => [l.month, l.lockedByName]),
      [['2026-09', 'HR01 (HR01)']],
    );
    assert.equal((await hr.del('/api/month-locks/2026-09')).status, 200);
    assert.equal((await hr.del('/api/month-locks/2026-09')).status, 404);
    const acts = (app.db.prepare("SELECT action FROM audit_logs WHERE action LIKE 'month.%' ORDER BY id").all() as { action: string }[]).map((r) => r.action);
    assert.deepEqual(acts, ['month.lock', 'month.unlock']);
  } finally {
    await app.close();
  }
});

test('tháng khóa: ngày công không đổi khi có lượt quẹt mới, tính lại, đóng ngày; đơn gửi/duyệt bị 423', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv, at('2026-09-14', '08:30')); // thứ 2, muộn
    assert.equal(day(app, ids.nv, '2026-09-14')?.status, 'missing_out');
    const nv = await loginAs(app, 'NV01');
    const pending = await nv.post('/api/requests', { type: 'late_explanation', workDate: '2026-09-14', reason: 'Tắc đường' });
    assert.equal(pending.status, 200);
    const hr = await loginAs(app, 'HR01');
    await hr.post('/api/month-locks/2026-09');

    addDetection(app.db, ids.nv, at('2026-09-14', '07:50')); // quẹt sớm hơn đến muộn: không được đổi giờ vào
    assert.equal(day(app, ids.nv, '2026-09-14')?.first_in, at('2026-09-14', '08:30'));
    const det = app.db.prepare("SELECT COUNT(*) AS c FROM detections WHERE user_id = ? AND work_date = '2026-09-14'").get(ids.nv) as { c: number };
    assert.equal(det.c, 2);
    recomputeUsers(app.db, [ids.nv], '2026-09-01', '2026-09-30', NOW);
    assert.equal(day(app, ids.nv, '2026-09-15'), undefined); // không ghi vắng vào tháng đã khóa
    closeDays(app.db, NOW);

    const r1 = await nv.post('/api/requests', { type: 'late_explanation', workDate: '2026-09-15', reason: 'Tắc đường' });
    assert.equal(r1.status, 423);
    assert.match(r1.body.error, /09\/2026 đã khóa sổ/);
    const leave = await nv.post('/api/requests', { type: 'leave_request', workDate: '2026-10-01', endDate: '2026-10-02', reason: 'Việc nhà' });
    assert.equal(leave.status, 200); // tháng 10 chưa khóa
    assert.equal((await hr.put(`/api/requests/${pending.body.request.id}`, { status: 'approved' })).status, 423);

    await hr.del('/api/month-locks/2026-09');
    assert.equal((await hr.put(`/api/requests/${pending.body.request.id}`, { status: 'approved' })).status, 200);
  } finally {
    await app.close();
  }
});
