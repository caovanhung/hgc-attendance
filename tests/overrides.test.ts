import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, addDetection, type TestApp } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';
import { closeDays, recomputeForShiftChange } from '../server/attendance';

const NOW = vnDateTimeToTs('2026-10-15', '18:00'); // thứ 5
const at = (d: string, hhmm: string) => vnDateTimeToTs(d, hhmm);
const D = '2026-10-14'; // thứ 4

async function setup() {
  const app = await startTestApp({ now: () => NOW });
  const a1 = seedArea(app.db, 'KV1');
  const a2 = seedArea(app.db, 'KV2');
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
  const d2 = seedDepartment(app.db, 'PB2', 'Kho', a2);
  const ids = {
    admin: seedUser(app.db, { code: 'ADMIN', role: 'hr' }),
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    hr2: seedUser(app.db, { code: 'HR02', role: 'hr' }),
    qk: seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a1], departmentId: d1 }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: d1 }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: d2 }),
  };
  return { app, ids };
}
const path = (u: string, d = D) => `/api/attendance/${u}/${d}/adjustment`;
const row = (app: TestApp, u: string, d = D) =>
  app.db.prepare('SELECT status, first_in, last_out, late_minutes FROM attendance_days WHERE user_id = ? AND work_date = ?').get(u, d) as
    | { status: string; first_in: number | null; last_out: number | null; late_minutes: number }
    | undefined;

test('sửa giờ vào làm muộn → đúng giờ; bỏ điều chỉnh quay về; nhãn override; nhật ký trước/sau', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at(D, '08:40'));
    addDetection(app.db, ids.nv1, at(D, '17:05'));
    assert.equal(row(app, ids.nv1)?.status, 'late');
    const hr = await loginAs(app, 'HR01');
    const put = await hr.put(path(ids.nv1), { kind: 'times', firstIn: '08:00', reason: 'Camera cửa chính hỏng' });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.day.status, 'on_time');
    assert.equal(put.body.day.firstIn, at(D, '08:00'));
    assert.equal(put.body.day.lastOut, at(D, '17:05'));
    assert.deepEqual(
      { ...put.body.day.override, at: undefined },
      { kind: 'times', reason: 'Camera cửa chính hỏng', byName: 'HR01 (HR01)', at: undefined },
    );
    const list = await hr.get(`/api/attendance?date=${D}`);
    assert.equal(list.body.records.find((r: { userId: string }) => r.userId === ids.nv1).override.kind, 'times');

    const del = await hr.req('DELETE', path(ids.nv1), { reason: 'Nhầm người' });
    assert.equal(del.status, 200);
    assert.equal(del.body.day.status, 'late');
    assert.equal(del.body.day.override, null);
    assert.equal((await hr.req('DELETE', path(ids.nv1), { reason: 'Lần hai' })).status, 404);

    const logs = app.db
      .prepare("SELECT action, before_json, after_json, reason, area_id, work_date FROM audit_logs WHERE action LIKE 'attendance.%' ORDER BY id")
      .all() as Record<string, string>[];
    assert.deepEqual(logs.map((l) => l.action), ['attendance.override', 'attendance.override_remove']);
    assert.equal(JSON.parse(logs[0].before_json).status, 'late');
    assert.equal(JSON.parse(logs[0].after_json).status, 'on_time');
    assert.equal(logs[0].reason, 'Camera cửa chính hỏng');
    assert.equal(logs[0].work_date, D);
    assert.ok(logs[0].area_id);
  } finally {
    await app.close();
  }
});

test('chuyển vắng → công tác; điều chỉnh thắng đơn đã duyệt; còn nguyên sau tính lại và đóng ngày', async () => {
  const { app, ids } = await setup();
  try {
    closeDays(app.db, NOW);
    assert.equal(row(app, ids.nv1, '2026-10-15')?.status, 'absent');
    const hr = await loginAs(app, 'HR01');
    const trip = await hr.put(path(ids.nv1, '2026-10-15'), { kind: 'business_trip', reason: 'Đi kho Đức Giang' });
    assert.equal(trip.body.day.status, 'business_trip');
    recomputeForShiftChange(app.db, [ids.nv1], NOW);
    closeDays(app.db, NOW);
    assert.equal(row(app, ids.nv1, '2026-10-15')?.status, 'business_trip');
    // Đơn nghỉ phép đã duyệt cho ngày D, sau đó sửa giờ: giờ sửa thắng
    const nv = await loginAs(app, 'NV01');
    const req = await nv.post('/api/requests', { type: 'leave_request', workDate: D, reason: 'Ốm' });
    await hr.put(`/api/requests/${req.body.request.id}`, { status: 'approved' });
    assert.equal(row(app, ids.nv1)?.status, 'leave');
    const put = await hr.put(path(ids.nv1), { kind: 'times', firstIn: '08:00', lastOut: '17:00', reason: 'Thực tế đi làm' });
    assert.equal(put.body.day.status, 'on_time');
    assert.equal((await hr.put(path(ids.nv1), { kind: 'leave', reason: 'Đổi lại thành phép' })).body.day.status, 'leave');
  } finally {
    await app.close();
  }
});

test('kiểm tra đầu vào và quyền', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at(D, '08:40'));
    const hr = await loginAs(app, 'HR01');
    const bad = async (body: unknown, p = path(ids.nv1)) => (await hr.put(p, body)).status;
    assert.equal(await bad({ kind: 'times', firstIn: '08:00', reason: 'abc' }), 400); // lý do < 5
    assert.equal(await bad({ kind: 'times', firstIn: '08:00', reason: 'x'.repeat(501) }), 400);
    assert.equal(await bad({ kind: 'times', reason: 'Không có giờ' }), 400);
    assert.equal(await bad({ kind: 'times', firstIn: '25:00', reason: 'Giờ sai định dạng' }), 400);
    assert.equal(await bad({ kind: 'times', firstIn: '17:00', lastOut: '08:00', reason: 'Ra trước vào' }), 400);
    assert.equal(await bad({ kind: 'nghi', reason: 'Kiểu không hợp lệ' }), 400);
    assert.equal(await bad({ kind: 'leave', reason: 'Ngày tương lai' }, path(ids.nv1, '2026-10-16')), 400);
    assert.equal(await bad({ kind: 'leave', reason: 'Trước ngày tạo' }, path(ids.nv1, '2026-10-12')), 400);
    assert.equal(await bad({ kind: 'leave', reason: 'Chủ nhật không có dòng' }, path(ids.nv1, '2026-10-11')), 400);
    assert.equal(await bad({ kind: 'leave', reason: 'Ngày sai định dạng' }, path(ids.nv1, '14-10-2026')), 400);
    // Chỉ nhập giờ ra cho ngày chưa có lượt quẹt ⇒ 400, không thành vắng âm thầm
    const noIn = await hr.put(path(ids.nv1, '2026-10-13'), { kind: 'times', lastOut: '17:00', reason: 'Chỉ có giờ ra' });
    assert.equal(noIn.status, 400);
    assert.match(noIn.body.error, /chưa có giờ vào/);
    assert.equal(row(app, ids.nv1, '2026-10-13'), undefined);
    assert.equal((app.db.prepare('SELECT COUNT(*) AS c FROM attendance_overrides').get() as { c: number }).c, 0);

    assert.equal((await hr.put(path(ids.hr), { kind: 'leave', reason: 'Tự sửa của mình' })).status, 403);
    assert.equal((await hr.put(path(ids.admin), { kind: 'leave', reason: 'Tài khoản quản trị' })).status, 400);
    assert.equal((await hr.put(path('usr-khong-co'), { kind: 'leave', reason: 'Không tồn tại' })).status, 404);
    const qk = await loginAs(app, 'QK01');
    assert.equal((await qk.put(path(ids.nv2), { kind: 'leave', reason: 'Khu khác' })).status, 404);
    assert.equal((await qk.put(path(ids.nv1), { kind: 'leave', reason: 'Trong khu' })).status, 200);
    assert.equal((await qk.put(path(ids.qk), { kind: 'leave', reason: 'Tự sửa của mình' })).status, 403);
    assert.equal((await (await loginAs(app, 'TP01')).put(path(ids.nv1), { kind: 'leave', reason: 'Trưởng phòng' })).status, 403);
    assert.equal((await (await loginAs(app, 'NV01')).put(path(ids.nv1), { kind: 'leave', reason: 'Nhân viên' })).status, 403);
    // Tháng khóa
    await hr.post('/api/month-locks/2026-10');
    assert.equal((await hr.put(path(ids.nv1), { kind: 'business_trip', reason: 'Sau khi khóa' })).status, 423);
    assert.equal((await hr.req('DELETE', path(ids.nv1), { reason: 'Sau khi khóa' })).status, 423);
  } finally {
    await app.close();
  }
});

test('xóa tài khoản HR đã điều chỉnh và khóa sổ vẫn được; dữ liệu giữ nhãn người làm', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at(D, '08:40'));
    const hr2 = await loginAs(app, 'HR02');
    assert.equal((await hr2.put(path(ids.nv1), { kind: 'times', firstIn: '08:00', reason: 'Camera hỏng' })).status, 200);
    assert.equal((await hr2.post('/api/month-locks/2026-09')).status, 200);
    const admin = await loginAs(app, 'ADMIN');
    const del = await admin.del(`/api/users/${ids.hr2}`);
    assert.equal(del.status, 200, JSON.stringify(del.body));
    const ov = app.db.prepare('SELECT created_by_label FROM attendance_overrides WHERE user_id = ?').get(ids.nv1) as { created_by_label: string };
    assert.equal(ov.created_by_label, 'HR02 (HR02)');
    const lock = app.db.prepare("SELECT locked_by_label FROM month_locks WHERE month = '2026-09'").get() as { locked_by_label: string };
    assert.equal(lock.locked_by_label, 'HR02 (HR02)');
  } finally {
    await app.close();
  }
});

test('chỉ sửa giờ vào sau lần quẹt cuối ⇒ 400 "Giờ ra phải sau giờ vào", không âm thầm bỏ giờ ra', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at(D, '08:00'));
    addDetection(app.db, ids.nv1, at(D, '17:00'));
    const hr = await loginAs(app, 'HR01');
    const r = await hr.put(path(ids.nv1), { kind: 'times', firstIn: '18:00', reason: 'Nhập nhầm giờ' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Giờ ra phải sau giờ vào/);
    assert.equal(row(app, ids.nv1)?.status, 'on_time');
  } finally {
    await app.close();
  }
});
