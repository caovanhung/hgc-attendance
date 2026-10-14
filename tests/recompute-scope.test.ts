import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, type TestApp } from './helpers';
import { closeDays } from '../server/attendance';
import { vnDateTimeToTs } from '../server/vntime';

const NOW = Date.UTC(2026, 9, 14, 3, 0); // thứ 4 14/10/2026, 10:00 giờ VN
const SHIFT = { name: 'Hành chính A', workStart: '08:00', workEnd: '17:00', workDays: [1, 2, 3, 4, 5], lateGraceMinutes: 15, earlyArrivalMinutes: 15, earlyLeaveMinutes: 10 };
const WORK = { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30, earlyArrivalMinutes: 15, earlyLeaveMinutes: 10 };

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const pa = seedDepartment(app.db, 'PA', 'PA', A);
  const pb = seedDepartment(app.db, 'PB', 'PB', B);
  const ids = {
    A, B, pa, pb,
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    nvA: seedUser(app.db, { code: 'NVA', departmentId: pa }),
    nvA2: seedUser(app.db, { code: 'NVA2', departmentId: pa }),
    nvB: seedUser(app.db, { code: 'NVB', departmentId: pb }),
  };
  return { app, ids, hr: await loginAs(app, 'HR01') };
}

const statusOf = (app: TestApp, userId: string, date: string) =>
  (app.db.prepare('SELECT status FROM attendance_days WHERE user_id = ? AND work_date = ?').get(userId, date) as { status: string } | undefined)?.status;

/** Dòng "đánh dấu": nếu bị tính lại thì sẽ đổi (không có lượt quẹt ⇒ vắng hoặc bị xóa). */
function mark(app: TestApp, userId: string, date: string): void {
  app.db
    .prepare(
      `INSERT OR REPLACE INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, early_arrival_minutes, status, final, detection_count)
       VALUES (?, ?, 1, NULL, 77, 0, 0, 'late', 1, 0)`,
    )
    .run(userId, date);
}
const marked = (app: TestApp, userId: string, date: string) =>
  (app.db.prepare('SELECT late_minutes FROM attendance_days WHERE user_id = ? AND work_date = ?').get(userId, date) as { late_minutes: number } | undefined)
    ?.late_minutes === 77;

/** Nhân sự gửi đơn nghỉ phép, HR duyệt. */
async function approveLeave(app: TestApp, code: string, from: string, to: string): Promise<void> {
  const me = await loginAs(app, code);
  const r = await me.post('/api/requests', { type: 'leave_request', workDate: from, endDate: to, reason: 'Việc nhà' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const hr = await loginAs(app, 'HR01');
  const ok = await hr.put(`/api/requests/${r.body.request.id}`, { status: 'approved' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
}

test('ngày lễ thêm vào ngày tương lai đã có đơn nghỉ duyệt trước ⇒ ngày đó không còn "Nghỉ phép"; xóa lễ thì trở lại', async () => {
  const { app, ids, hr } = await setup();
  try {
    await approveLeave(app, 'NVA', '2026-10-15', '2026-10-16');
    assert.deepEqual([statusOf(app, ids.nvA, '2026-10-15'), statusOf(app, ids.nvA, '2026-10-16')], ['leave', 'leave']);
    const h = await hr.post('/api/holidays', { date: '2026-10-15', name: 'Nghỉ bù' });
    assert.equal(h.status, 200);
    assert.equal(statusOf(app, ids.nvA, '2026-10-15'), undefined, 'ngày lễ không còn là ngày nghỉ phép');
    assert.equal(statusOf(app, ids.nvA, '2026-10-16'), 'leave');
    assert.equal((await hr.del('/api/holidays/2026-10-15')).status, 200);
    assert.equal(statusOf(app, ids.nvA, '2026-10-15'), 'leave');
  } finally {
    await app.close();
  }
});

test('ngày lễ tương lai không có đơn nghỉ nào phủ ⇒ không tính lại (recomputed 0)', async () => {
  const { app, hr } = await setup();
  try {
    await approveLeave(app, 'NVA', '2026-10-15', '2026-10-15');
    const h = await hr.post('/api/holidays', { date: '2026-10-20', name: 'Lễ tương lai' });
    assert.deepEqual([h.status, h.body.recomputed], [200, 0]);
    assert.equal((await hr.del('/api/holidays/2026-10-20')).body.recomputed, 0);
  } finally {
    await app.close();
  }
});

test('sửa ngày làm của ca bỏ một ngày nghỉ phép tương lai ⇒ dòng nghỉ phép ngày đó bị xóa', async () => {
  const { app, ids, hr } = await setup();
  try {
    const s = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { shiftId: s.id })).status, 200);
    await approveLeave(app, 'NVA', '2026-10-15', '2026-10-16'); // thứ 5, thứ 6
    const put = await hr.put(`/api/shifts/${s.id}`, { workDays: [1, 2, 3, 5] });
    assert.equal(put.status, 200);
    assert.equal(statusOf(app, ids.nvA, '2026-10-15'), undefined, 'thứ 5 không còn là ngày làm');
    assert.equal(statusOf(app, ids.nvA, '2026-10-16'), 'leave');
  } finally {
    await app.close();
  }
});

test('sửa ca mặc định bỏ một ngày nghỉ phép tương lai ⇒ dòng nghỉ phép ngày đó bị xóa', async () => {
  const { app, ids, hr } = await setup();
  try {
    await approveLeave(app, 'NVB', '2026-10-15', '2026-10-16');
    const r = await hr.put('/api/settings/work', { ...WORK, workDays: [1, 2, 3, 5] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(statusOf(app, ids.nvB, '2026-10-15'), undefined);
    assert.equal(statusOf(app, ids.nvB, '2026-10-16'), 'leave');
  } finally {
    await app.close();
  }
});

test('gán ca riêng bỏ một ngày nghỉ phép tương lai ⇒ dòng nghỉ phép ngày đó bị xóa', async () => {
  const { app, ids, hr } = await setup();
  try {
    const s = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.A, workDays: [1, 2, 3, 5] })).body.shift;
    await approveLeave(app, 'NVA', '2026-10-15', '2026-10-16');
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { shiftId: s.id })).status, 200);
    assert.equal(statusOf(app, ids.nvA, '2026-10-15'), undefined);
    assert.equal(statusOf(app, ids.nvA, '2026-10-16'), 'leave');
  } finally {
    await app.close();
  }
});

test('job đóng ngày tính lại cả dòng nghỉ phép đã ghi trước (ngày lễ được ghi thẳng vào DB)', async () => {
  const { app, ids } = await setup();
  try {
    await approveLeave(app, 'NVA', '2026-10-15', '2026-10-16');
    app.db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-15', 'Nghỉ bù')").run();
    closeDays(app.db, vnDateTimeToTs('2026-10-15', '18:00'));
    assert.equal(statusOf(app, ids.nvA, '2026-10-15'), undefined);
    assert.equal(statusOf(app, ids.nvA, '2026-10-16'), 'leave');
  } finally {
    await app.close();
  }
});

test('sửa ca / gán ca không đụng tới tháng trước', async () => {
  const { app, ids, hr } = await setup();
  try {
    const s = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    mark(app, ids.nvA, '2026-09-30');
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { shiftId: s.id })).status, 200);
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { shiftId: s.id })).status, 200);
    assert.equal((await hr.put(`/api/shifts/${s.id}`, { workStart: '07:30' })).status, 200);
    assert.equal((await hr.put('/api/settings/work', { ...WORK, workDays: [1, 2, 3, 4, 5, 6] })).status, 200);
    assert.ok(marked(app, ids.nvA, '2026-09-30'), 'dòng tháng 9 giữ nguyên');
  } finally {
    await app.close();
  }
});

test('chỉ tính lại người bị ảnh hưởng: gán ca phòng, gán ca người, sửa ca mặc định', async () => {
  const { app, ids, hr } = await setup();
  const D = '2026-10-13';
  const markAll = () => [ids.nvA, ids.nvA2, ids.nvB].forEach((id) => mark(app, id, D));
  const state = () => [ids.nvA, ids.nvA2, ids.nvB].map((id) => marked(app, id, D));
  try {
    const s = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    const s2 = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.A, name: 'Ca riêng' })).body.shift;

    markAll();
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { shiftId: s.id })).status, 200);
    assert.deepEqual(state(), [false, false, true], 'gán ca phòng PA: chỉ thành viên PA');

    markAll();
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { shiftId: s2.id })).status, 200);
    assert.deepEqual(state(), [false, true, true], 'gán ca riêng: chỉ người đó');

    markAll();
    assert.equal((await hr.put('/api/settings/work', { ...WORK, workDays: [1, 2, 3, 4, 5, 6] })).status, 200);
    assert.deepEqual(state(), [true, true, false], 'sửa ca mặc định: chỉ người đang dùng ca mặc định');

    markAll();
    assert.equal((await hr.put(`/api/shifts/${s.id}`, { workStart: '07:30' })).status, 200);
    assert.deepEqual(state(), [true, false, true], 'sửa ca phòng: chỉ người đang áp dụng ca đó (NVA đã có ca riêng)');
  } finally {
    await app.close();
  }
});

test('PUT nhân sự: ca riêng không còn thuộc khu (phòng bị chuyển khu) không chặn sửa thông tin khác', async () => {
  const { app, ids, hr } = await setup();
  try {
    const s = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { shiftId: s.id })).status, 200);
    app.db.prepare('UPDATE departments SET area_id = ? WHERE id = ?').run(ids.B, ids.pa);
    const r1 = await hr.put(`/api/users/${ids.nvA}`, { phone: '0912345678' });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    const r2 = await hr.put(`/api/users/${ids.nvA}`, { phone: '0912345679', shiftId: s.id });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
  } finally {
    await app.close();
  }
});

test('PUT nhân sự: chuyển sang phòng khu khác ⇒ ca riêng cũ bị bỏ (NULL) nếu body không gửi ca hợp lệ', async () => {
  const { app, ids, hr } = await setup();
  try {
    const s = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.A })).body.shift;
    const sb = (await hr.post('/api/shifts', { ...SHIFT, areaId: ids.B, name: 'Kho B' })).body.shift;
    for (const id of [ids.nvA, ids.nvA2]) assert.equal((await hr.put(`/api/users/${id}`, { shiftId: s.id })).status, 200);
    const shiftOf = (id: string) => (app.db.prepare('SELECT shift_id FROM users WHERE id = ?').get(id) as { shift_id: string | null }).shift_id;

    const r1 = await hr.put(`/api/users/${ids.nvA}`, { departmentId: ids.pb });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(shiftOf(ids.nvA), null);

    const r2 = await hr.put(`/api/users/${ids.nvA2}`, { departmentId: ids.pb, shiftId: s.id });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(shiftOf(ids.nvA2), null);

    const r3 = await hr.put(`/api/users/${ids.nvA2}`, { departmentId: ids.pa, shiftId: sb.id });
    assert.equal(r3.status, 400, 'đổi sang ca khác khu vẫn bị chặn');
    const r4 = await hr.put(`/api/users/${ids.nvA2}`, { departmentId: ids.pa, shiftId: s.id });
    assert.deepEqual([r4.status, shiftOf(ids.nvA2)], [200, s.id]);
  } finally {
    await app.close();
  }
});
