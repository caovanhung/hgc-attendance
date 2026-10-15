import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, addDetection } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';
import { closeDays, recomputeUsers } from '../server/attendance';

// Hôm nay: thứ 5 15/10/2026 18:00 (đã qua giờ ra)
const NOW = vnDateTimeToTs('2026-10-15', '18:00');
const at = (d: string, hhmm: string) => vnDateTimeToTs(d, hhmm);

type Row = { employeeCode: string; [k: string]: any };

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const a1 = seedArea(app.db, 'KV1', 'Trụ sở');
  const a2 = seedArea(app.db, 'KV2', 'Kho');
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
  const d2 = seedDepartment(app.db, 'PB2', 'Kho xăng', a2);
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    qk: seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a2] }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 }),
    nv1: seedUser(app.db, { code: 'NV01', name: 'An', departmentId: d1 }),
    nv2: seedUser(app.db, { code: 'NV02', name: 'Bình', departmentId: d2 }),
    old: seedUser(app.db, { code: 'NV09', name: 'Cũ', departmentId: d1, status: 'inactive' }),
    old2: seedUser(app.db, { code: 'NV08', name: 'Cũ 2', departmentId: d1, status: 'inactive' }),
  };
  app.db.prepare("UPDATE users SET created_at = '2026-10-01'").run();
  app.db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-10', 'Giải phóng Thủ đô')").run(); // thứ 7
  app.db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-02', 'Nghỉ bù')").run(); // thứ 6
  // NV01: 01/10 đúng giờ; 05/10 muộn 20'; 06/10 về sớm 30'; 07/10 thiếu giờ ra; còn lại vắng (trừ phép / công tác thêm trong test)
  addDetection(app.db, ids.nv1, at('2026-10-01', '07:55'));
  addDetection(app.db, ids.nv1, at('2026-10-01', '17:05'));
  addDetection(app.db, ids.nv1, at('2026-10-05', '08:20'));
  addDetection(app.db, ids.nv1, at('2026-10-05', '17:00'));
  addDetection(app.db, ids.nv1, at('2026-10-06', '08:00'));
  addDetection(app.db, ids.nv1, at('2026-10-06', '16:30'));
  addDetection(app.db, ids.nv1, at('2026-10-07', '08:00'));
  addDetection(app.db, ids.old, at('2026-10-01', '08:00')); // người nghỉ việc nhưng có dữ liệu
  recomputeUsers(app.db, [ids.nv1, ids.nv2], '2026-10-01', '2026-10-15', NOW);
  return { app, ids, a1, a2, d1, d2 };
}

test('ký hiệu, số đếm, ngày phải làm, tỷ lệ chuyên cần, ô điều chỉnh có *', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NV01');
    const leave = await nv.post('/api/requests', { type: 'leave_request', workDate: '2026-10-09', reason: 'Việc nhà' });
    assert.equal((await hr.put(`/api/requests/${leave.body.request.id}`, { status: 'approved' })).status, 200);
    assert.equal((await hr.put(`/api/attendance/${ids.nv1}/2026-10-12/adjustment`, { kind: 'business_trip', reason: 'Đi kho Đức Giang' })).status, 200);
    const r = await hr.get('/api/reports/monthly?month=2026-10');
    assert.equal(r.status, 200);
    assert.equal(r.body.days.length, 31);
    assert.deepEqual(r.body.days[1], { date: '2026-10-02', weekday: 5, holiday: 'Nghỉ bù' });
    const row = r.body.rows.find((x: Row) => x.employeeCode === 'NV01');
    const cell = (d: number) => row.cells[d - 1];
    assert.deepEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 16].map(cell), ['X', 'L', null, 'M', 'S', 'T', 'V', 'P', 'L', 'CT*', null]);
    // T2–T6 từ 01/10 tới 15/10 trừ 02/10 (lễ) = 10 ngày
    assert.equal(row.requiredDays, 10);
    assert.equal(row.workDays, 5); // X M S T CT
    assert.deepEqual([row.lateCount, row.lateMinutes, row.earlyCount, row.earlyMinutes], [1, 20, 1, 30]);
    assert.deepEqual([row.missingOutDays, row.absentDays, row.leaveDays, row.businessTripDays], [1, 4, 1, 1]);
    assert.equal(row.attendanceRate, 60); // (5 + 1) / 10
    assert.equal(r.body.lock, null);
  } finally {
    await app.close();
  }
});

test('phạm vi: HR lọc khu/phòng, quản trị khu chỉ khu mình, trưởng phòng chỉ phòng mình, nhân viên 403; người nghỉ việc', async () => {
  const { app, a1, a2, d2 } = await setup();
  try {
    const codes = (b: { rows: Row[] }) => b.rows.map((x) => x.employeeCode);
    const hr = await loginAs(app, 'HR01');
    const all = await hr.get('/api/reports/monthly?month=2026-10');
    assert.ok(codes(all.body).includes('NV09'), 'người nghỉ việc có dữ liệu vẫn có dòng');
    assert.ok(!codes(all.body).includes('NV08'), 'người nghỉ việc không có dữ liệu không có dòng');
    assert.ok(!codes(all.body).includes('ADMIN'));
    assert.equal(all.body.scopeLabel, 'Toàn công ty');
    assert.deepEqual(codes((await hr.get(`/api/reports/monthly?month=2026-10&area=${a2}`)).body), ['NV02']);
    const byDept = await hr.get(`/api/reports/monthly?month=2026-10&department=${d2}`);
    assert.equal(byDept.body.scopeLabel, 'Phòng Kho xăng');
    assert.equal((await hr.get('/api/reports/monthly?month=2026-10&department=dep-khong-co')).status, 404);
    const qk = await loginAs(app, 'QK01');
    const qkCodes = codes((await qk.get('/api/reports/monthly?month=2026-10')).body);
    assert.ok(qkCodes.includes('NV02'));
    assert.ok(!qkCodes.includes('NV01'));
    assert.equal((await qk.get(`/api/reports/monthly?month=2026-10&area=${a1}`)).status, 404);
    const tp = await loginAs(app, 'TP01');
    assert.deepEqual(codes((await tp.get(`/api/reports/monthly?month=2026-10&area=${a2}`)).body).sort(), ['NV01', 'NV09', 'TP01']);
    assert.equal((await (await loginAs(app, 'NV01')).get('/api/reports/monthly?month=2026-10')).status, 403);
    for (const bad of ['2026-13', '2026-1', 'abc']) assert.equal((await hr.get(`/api/reports/monthly?month=${bad}`)).status, 400);
    const future = await hr.get('/api/reports/monthly?month=2026-12');
    assert.ok(future.body.rows.every((x: Row) => x.requiredDays === 0 && x.attendanceRate === null));
  } finally {
    await app.close();
  }
});

test('/me/attendance: chỉ dữ liệu của mình, đủ ngày, hôm nay, ca; ADMIN không chấm công', async () => {
  const { app } = await setup();
  try {
    closeDays(app.db, NOW);
    const nv = await loginAs(app, 'NV01');
    const me = await nv.get('/api/me/attendance?month=2026-10');
    assert.equal(me.status, 200);
    assert.equal(me.body.tracked, true);
    assert.equal(me.body.profile.code, 'NV01');
    assert.equal(me.body.profile.shift.workStart, '08:00');
    assert.equal(me.body.profile.shift.workEnd, '17:00');
    assert.equal(me.body.days.length, 31);
    assert.equal(me.body.days[0].record.status, 'on_time');
    assert.equal(me.body.days[1].workday, false); // lễ
    assert.equal(me.body.days[1].holiday, 'Nghỉ bù');
    assert.equal(me.body.report.employeeCode, 'NV01');
    assert.equal(me.body.today.workDate, '2026-10-15');
    assert.equal((await nv.get('/api/me/attendance?month=2026-1')).status, 400);
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    const admin = await (await loginAs(app, 'ADMIN')).get('/api/me/attendance');
    assert.equal(admin.status, 200);
    assert.equal(admin.body.tracked, false);
  } finally {
    await app.close();
  }
});
