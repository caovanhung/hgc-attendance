import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';

const NOW = vnDateTimeToTs('2026-10-15', '10:00');

test('mỗi thao tác nhạy cảm ghi đúng một dòng nhật ký; thao tác lỗi không ghi', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    const a1 = seedArea(app.db, 'KV1');
    const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const nv = seedUser(app.db, { code: 'NV01', departmentId: d1 });
    const nv2 = seedUser(app.db, { code: 'NV02', departmentId: d1 });
    const hr = await loginAs(app, 'HR01');
    const nvc = await loginAs(app, 'NV01');
    const before = (app.db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get() as { c: number }).c;
    const acts = () => (app.db.prepare('SELECT action FROM audit_logs ORDER BY id').all() as { action: string }[]).map((r) => r.action).slice(before);

    const req1 = await nvc.post('/api/requests', { type: 'late_explanation', workDate: '2026-10-14', reason: 'Tắc đường' });
    const req2 = await nvc.post('/api/requests', { type: 'late_explanation', workDate: '2026-10-13', reason: 'Mưa' });
    assert.equal(acts().length, 0);
    assert.equal((await hr.put(`/api/requests/${req1.body.request.id}`, { status: 'approved', comment: 'Ok' })).status, 200);
    assert.equal((await hr.put(`/api/requests/${req2.body.request.id}`, { status: 'rejected', comment: 'Không hợp lệ' })).status, 200);
    assert.equal((await hr.put(`/api/users/${nv}`, { role: 'dept_manager' })).status, 200);
    assert.equal((await hr.put(`/api/users/${nv}`, { status: 'inactive' })).status, 200);
    assert.equal((await hr.put(`/api/users/${nv2}`, { role: 'area_admin', adminAreaIds: [a1] })).status, 200);
    const shift = await hr.post('/api/shifts', {
      areaId: a1,
      name: 'Ca kho',
      workStart: '07:00',
      workEnd: '16:00',
      workDays: [1, 2, 3, 4, 5, 6],
      lateGraceMinutes: 10,
      earlyArrivalMinutes: 15,
      earlyLeaveMinutes: 10,
    });
    assert.equal(shift.status, 200, JSON.stringify(shift.body));
    assert.equal((await hr.put(`/api/shifts/${shift.body.shift.id}`, { workStart: '07:30' })).status, 200);
    assert.equal((await hr.put(`/api/departments/${d1}`, { shiftId: shift.body.shift.id })).status, 200);
    assert.equal((await hr.put(`/api/departments/${d1}`, { shiftId: null })).status, 200);
    assert.equal((await hr.del(`/api/shifts/${shift.body.shift.id}`)).status, 200);
    const ws = (await hr.get('/api/settings/work')).body.settings;
    assert.equal((await hr.put('/api/settings/work', { ...ws, lateGraceMinutes: 20 })).status, 200);
    assert.equal((await hr.post('/api/holidays', { date: '2026-12-31', name: 'Nghỉ bù' })).status, 200);
    assert.equal((await hr.del('/api/holidays/2026-12-31')).status, 200);
    // Lỗi: duyệt lại đơn đã xử lý ⇒ 409, không ghi
    assert.equal((await hr.put(`/api/requests/${req1.body.request.id}`, { status: 'approved' })).status, 409);
    assert.equal((await hr.del(`/api/users/${nv}`)).status, 200);

    assert.deepEqual(acts(), [
      'request.approve',
      'request.reject',
      'user.role',
      'user.status',
      'user.role',
      'user.areas',
      'shift.create',
      'shift.update',
      'shift.assign',
      'shift.assign',
      'shift.delete',
      'settings.work',
      'holiday.add',
      'holiday.remove',
      'user.delete',
    ]);
    const role = app.db.prepare("SELECT before_json, after_json, area_id, target_user_id FROM audit_logs WHERE action = 'user.role' ORDER BY id LIMIT 1").get() as Record<string, string>;
    assert.deepEqual([JSON.parse(role.before_json), JSON.parse(role.after_json)], [{ role: 'employee' }, { role: 'dept_manager' }]);
    assert.equal(role.area_id, a1);
    assert.equal(role.target_user_id, nv);
    const sw = app.db.prepare("SELECT before_json, after_json FROM audit_logs WHERE action = 'settings.work'").get() as Record<string, string>;
    assert.equal(JSON.parse(sw.before_json).lateGraceMinutes, ws.lateGraceMinutes);
    assert.equal(JSON.parse(sw.after_json).lateGraceMinutes, 20);
    const appr = app.db.prepare("SELECT target_user_id, work_date, after_json FROM audit_logs WHERE action = 'request.approve'").get() as Record<string, string>;
    assert.equal(appr.target_user_id, nv);
    assert.equal(appr.work_date, '2026-10-14');
    assert.equal(JSON.parse(appr.after_json).status, 'approved');
  } finally {
    await app.close();
  }
});
