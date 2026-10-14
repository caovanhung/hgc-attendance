import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedDepartment, seedUser, loginAs } from './helpers';
import { closeDays, recomputeDay } from '../server/attendance';
import { vnDateTimeToTs } from '../server/vntime';

const DAY = '2026-10-15'; // thứ 5
test('thống kê: vắng, nghỉ phép, công tác, đi sớm, chưa điểm danh theo ngày làm việc của ca', async () => {
  let now = vnDateTimeToTs(DAY, '10:00');
  const app = await startTestApp({ now: () => now });
  try {
    const kt = seedDepartment(app.db, 'KT');
    seedUser(app.db, { code: 'ADMIN', role: 'hr' }); // tài khoản hệ thống: không tính vào thống kê
    const ids = ['A', 'B', 'C', 'D', 'E'].map((c) => seedUser(app.db, { code: c, departmentId: kt }));
    const [a, b, c] = ids;
    app.db.prepare("INSERT INTO detections(user_id, device_id, ts, work_date, source) VALUES (?, 'DEV1', ?, ?, 'webhook')").run(a, vnDateTimeToTs(DAY, '07:30'), DAY);
    recomputeDay(app.db, a, DAY, now);
    app.db.prepare("INSERT INTO requests(id, user_id, work_date, type, reason, status, created_at) VALUES ('r1', ?, ?, 'leave_request', 'x', 'approved', 'x'), ('r2', ?, ?, 'business_trip', 'x', 'approved', 'x')").run(b, DAY, c, DAY);
    recomputeDay(app.db, b, DAY, now);
    recomputeDay(app.db, c, DAY, now);
    const hr = await loginAs(app, 'ADMIN');
    let s = (await hr.get('/api/stats')).body;
    assert.deepEqual(
      [s.presentCount, s.earlyArrivalCount, s.leaveCount, s.businessTripCount, s.absentCount, s.notCheckedInCount],
      [1, 1, 1, 1, 0, 2],
      '10:00: D và E chưa điểm danh',
    );
    now = vnDateTimeToTs(DAY, '17:30');
    closeDays(app.db, now);
    s = (await hr.get('/api/stats')).body;
    assert.deepEqual([s.absentCount, s.notCheckedInCount], [2, 0]);
    const absent = (await hr.get('/api/stats/details?type=absent')).body.rows.map((r: { employeeCode: string }) => r.employeeCode);
    assert.deepEqual(absent, ['D', 'E']);
    assert.deepEqual((await hr.get('/api/stats/details?type=early_arrival')).body.rows.map((r: { employeeCode: string }) => r.employeeCode), ['A']);
  } finally {
    await app.close();
  }
});

test('chưa điểm danh không tính người có ngày nghỉ theo ca (thứ 7 với ca T2–T6)', async () => {
  const now = vnDateTimeToTs('2026-10-17', '10:00');
  const app = await startTestApp({ now: () => now });
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'NV01', departmentId: seedDepartment(app.db, 'KT') });
    assert.equal((await (await loginAs(app, 'ADMIN')).get('/api/stats')).body.notCheckedInCount, 0);
  } finally {
    await app.close();
  }
});
