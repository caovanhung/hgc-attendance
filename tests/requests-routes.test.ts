import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, addDetection, type TestApp } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';

const D = '2026-10-13';
const at = (hhmm: string, date = D) => vnDateTimeToTs(date, hhmm);
const NOW = at('20:00');

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp({ now: () => NOW });
  const kt = seedDepartment(app.db, 'KT');
  const kd = seedDepartment(app.db, 'KD');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    tp2: seedUser(app.db, { code: 'TP02', role: 'dept_manager', departmentId: kd }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: kt }),
  };
  return { app, ids };
}

const dayStatus = (app: TestApp, userId: string, date = D) =>
  (app.db.prepare('SELECT status, late_minutes, last_out FROM attendance_days WHERE user_id = ? AND work_date = ?').get(userId, date) as
    | { status: string; late_minutes: number; last_out: number | null }
    | undefined);

test('nhân viên gửi đơn; kiểm tra dữ liệu', async () => {
  const { app } = await setup();
  try {
    const nv = await loginAs(app, 'NV01');
    const ok = await nv.post('/api/requests', { workDate: D, type: 'late_explanation', reason: 'Tắc đường' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.request.status, 'pending');
    assert.equal(ok.body.request.employeeCode, 'NV01');
    assert.equal(ok.body.request.suggestedIn, null);

    assert.equal((await nv.post('/api/requests', { workDate: '2026-10-14', type: 'late_explanation', reason: 'x' })).status, 400, 'ngày tương lai');
    assert.equal((await nv.post('/api/requests', { workDate: D, type: 'late_explanation', reason: '  ' })).status, 400);
    assert.equal((await nv.post('/api/requests', { workDate: D, type: 'other', reason: 'x' })).status, 400);
    assert.equal((await nv.post('/api/requests', { workDate: D, type: 'missed_punch', reason: 'x' })).status, 400, 'quên quẹt cần giờ');
    assert.equal((await nv.post('/api/requests', { workDate: D, type: 'missed_punch', reason: 'x', suggestedIn: '8h' })).status, 400);
  } finally {
    await app.close();
  }
});

test('danh sách đơn theo phạm vi', async () => {
  const { app } = await setup();
  try {
    await (await loginAs(app, 'NV01')).post('/api/requests', { workDate: D, type: 'leave_request', reason: 'Việc nhà' });
    assert.equal((await (await loginAs(app, 'TP01')).get('/api/requests')).body.requests.length, 1);
    assert.equal((await (await loginAs(app, 'TP02')).get('/api/requests')).body.requests.length, 0);
    assert.equal((await (await loginAs(app, 'HR01')).get('/api/requests')).body.requests.length, 1);
  } finally {
    await app.close();
  }
});

test('duyệt giải trình muộn → ngày công thành đúng giờ; duyệt lại 409', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at('08:40'));
    addDetection(app.db, ids.nv1, at('17:05'));
    assert.equal(dayStatus(app, ids.nv1)!.status, 'late');
    const req = (await (await loginAs(app, 'NV01')).post('/api/requests', { workDate: D, type: 'late_explanation', reason: 'Tắc đường' })).body.request;

    assert.equal((await (await loginAs(app, 'NV01')).put(`/api/requests/${req.id}`, { status: 'approved' })).status, 403);
    assert.equal((await (await loginAs(app, 'TP02')).put(`/api/requests/${req.id}`, { status: 'approved' })).status, 403);
    const tp = await loginAs(app, 'TP01');
    assert.equal((await tp.put(`/api/requests/${req.id}`, { status: 'maybe' })).status, 400);
    const ok = await tp.put(`/api/requests/${req.id}`, { status: 'approved', comment: 'Đồng ý' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.request.status, 'approved');
    assert.equal(ok.body.request.reviewerName, 'TP01');
    assert.equal(ok.body.request.comment, 'Đồng ý');
    const day = dayStatus(app, ids.nv1)!;
    assert.equal(day.status, 'on_time');
    assert.equal(day.late_minutes, 0);
    assert.equal((await tp.put(`/api/requests/${req.id}`, { status: 'rejected' })).status, 409);
  } finally {
    await app.close();
  }
});

test('không ai được tự duyệt đơn của mình', async () => {
  const { app } = await setup();
  try {
    const tp = await loginAs(app, 'TP01');
    const req = (await tp.post('/api/requests', { workDate: D, type: 'leave_request', reason: 'Nghỉ' })).body.request;
    const r = await tp.put(`/api/requests/${req.id}`, { status: 'approved' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'Không thể tự duyệt đơn của mình');
  } finally {
    await app.close();
  }
});

test('duyệt quên quẹt bổ sung giờ ra', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at('07:58'));
    assert.equal(dayStatus(app, ids.nv1)!.status, 'missing_out');
    const req = (await (await loginAs(app, 'NV01')).post('/api/requests', { workDate: D, type: 'missed_punch', reason: 'Quên quẹt', suggestedOut: '17:30' })).body.request;
    assert.equal(req.suggestedOut, '17:30');
    assert.equal((await (await loginAs(app, 'HR01')).put(`/api/requests/${req.id}`, { status: 'approved' })).status, 200);
    const day = dayStatus(app, ids.nv1)!;
    assert.equal(day.status, 'on_time');
    assert.equal(day.last_out, at('17:30'));
  } finally {
    await app.close();
  }
});

test('quên quẹt cho ngày không có lượt nào mà thiếu giờ vào → 400, đơn vẫn chờ duyệt', async () => {
  const { app, ids } = await setup();
  try {
    const req = (await (await loginAs(app, 'NV01')).post('/api/requests', { workDate: '2026-10-12', type: 'missed_punch', reason: 'x', suggestedOut: '17:00' })).body.request;
    const hr = await loginAs(app, 'HR01');
    const r = await hr.put(`/api/requests/${req.id}`, { status: 'approved' });
    assert.equal(r.status, 400);
    assert.equal((await hr.get('/api/requests')).body.requests[0].status, 'pending');
    assert.equal(dayStatus(app, ids.nv1, '2026-10-12'), undefined);
  } finally {
    await app.close();
  }
});

test('từ chối và duyệt nghỉ phép không đổi dữ liệu công', async () => {
  const { app, ids } = await setup();
  try {
    addDetection(app.db, ids.nv1, at('08:40'));
    const nv = await loginAs(app, 'NV01');
    const late = (await nv.post('/api/requests', { workDate: D, type: 'late_explanation', reason: 'x' })).body.request;
    const leave = (await nv.post('/api/requests', { workDate: D, type: 'leave_request', reason: 'y' })).body.request;
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.put(`/api/requests/${late.id}`, { status: 'rejected' })).status, 200);
    assert.equal((await hr.put(`/api/requests/${leave.id}`, { status: 'approved' })).status, 200);
    assert.equal(dayStatus(app, ids.nv1)!.late_minutes, 40);
  } finally {
    await app.close();
  }
});
