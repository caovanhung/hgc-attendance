import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, addDetection, type TestApp } from './helpers';
import { vnDateTimeToTs, toVnDate } from '../server/vntime';

const D = '2026-10-13';
const at = (hhmm: string, date = D) => vnDateTimeToTs(date, hhmm);
// "Bây giờ" là 2026-10-13 10:00 giờ VN
const NOW = at('10:00');

async function setup(): Promise<{ app: TestApp; kt: string; ids: Record<string, string> }> {
  const app = await startTestApp({ now: () => NOW });
  const kt = seedDepartment(app.db, 'KT', 'Kế toán');
  const kd = seedDepartment(app.db, 'KD', 'Kinh doanh');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv1: seedUser(app.db, { code: 'NV01', name: 'Nguyễn Văn An', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', name: 'Trần Thị Bình', departmentId: kd }),
    nv3: seedUser(app.db, { code: 'NV03', departmentId: kd }),
  };
  addDetection(app.db, ids.nv1, at('08:05'));
  addDetection(app.db, ids.nv1, at('08:06'), { deviceId: 'DEV2' });
  addDetection(app.db, ids.nv2, at('08:40'));
  return { app, kt, ids };
}

test('GET /attendance theo phạm vi và mặc định là hôm nay (giờ VN)', async () => {
  const { app } = await setup();
  try {
    const codes = (body: { records: { employeeCode: string }[] }) => body.records.map((r) => r.employeeCode).sort();
    const hr = await (await loginAs(app, 'HR01')).get('/api/attendance');
    assert.equal(hr.body.date, D);
    assert.deepEqual(codes(hr.body), ['NV01', 'NV02']);
    assert.deepEqual(codes((await (await loginAs(app, 'TP01')).get(`/api/attendance?date=${D}`)).body), ['NV01']);
    assert.deepEqual(codes((await (await loginAs(app, 'NV02')).get(`/api/attendance?date=${D}`)).body), ['NV02']);

    const row = hr.body.records.find((r: { employeeCode: string }) => r.employeeCode === 'NV02');
    assert.equal(row.status, 'missing_out');
    assert.equal(row.lateMinutes, 40);
    assert.equal(row.departmentName, 'Kinh doanh');
    assert.equal(row.firstIn, at('08:40'));
  } finally {
    await app.close();
  }
});

test('lọc phòng ban (chỉ HR), tìm kiếm có dấu, ngày sai định dạng', async () => {
  const { app, kt } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.get(`/api/attendance?date=${D}&departmentId=${kt}`)).body.records.length, 1);
    const s = await hr.get(`/api/attendance?date=${D}&search=${encodeURIComponent('bình')}`);
    assert.deepEqual(s.body.records.map((r: { employeeCode: string }) => r.employeeCode), ['NV02']);
    assert.equal((await hr.get('/api/attendance?date=13-10-2026')).status, 400);
    // Trưởng phòng truyền departmentId khác cũng không thoát được phạm vi
    const tp = await loginAs(app, 'TP01');
    const other = await tp.get(`/api/attendance?date=${D}&departmentId=dep-khac`);
    assert.deepEqual(other.body.records.map((r: { employeeCode: string }) => r.employeeCode), ['NV01']);
  } finally {
    await app.close();
  }
});

test('xem lượt nhận diện chi tiết theo phạm vi', async () => {
  const { app, ids } = await setup();
  try {
    const own = await (await loginAs(app, 'NV01')).get(`/api/attendance/${ids.nv1}/${D}/detections`);
    assert.equal(own.status, 200);
    assert.equal(own.body.detections.length, 2);
    assert.equal(own.body.detections[0].deviceId, 'DEV1');
    assert.equal((await (await loginAs(app, 'NV01')).get(`/api/attendance/${ids.nv2}/${D}/detections`)).status, 403);
    assert.equal((await (await loginAs(app, 'TP01')).get(`/api/attendance/${ids.nv2}/${D}/detections`)).status, 403);
    assert.equal((await (await loginAs(app, 'HR01')).get(`/api/attendance/usr-khong-co/${D}/detections`)).status, 404);
  } finally {
    await app.close();
  }
});

test('thống kê hôm nay theo người, không theo lượt quẹt', async () => {
  const { app } = await setup();
  try {
    const hr = (await (await loginAs(app, 'HR01')).get('/api/stats')).body;
    assert.deepEqual(hr, {
      date: D,
      totalEmployees: 5,
      presentCount: 2,
      onTimeCount: 1,
      lateCount: 1,
      missingOutCount: 2,
      notCheckedInCount: 3,
      pendingRequests: 0,
      totalCameras: 0,
    });
    const tp = (await (await loginAs(app, 'TP01')).get('/api/stats')).body;
    assert.equal(tp.totalEmployees, 2);
    assert.equal(tp.presentCount, 1);
    const nv = (await (await loginAs(app, 'NV03')).get('/api/stats')).body;
    assert.equal(nv.totalEmployees, 1);
    assert.equal(nv.notCheckedInCount, 1);
  } finally {
    await app.close();
  }
});

test('giờ làm việc: HR đọc/sửa, dữ liệu sai 400, tính lại áp dụng giờ mới', async () => {
  const { app } = await setup();
  try {
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.get('/api/settings/work')).status, 403);
    const hr = await loginAs(app, 'HR01');
    assert.deepEqual((await hr.get('/api/settings/work')).body.settings, { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 });
    assert.equal((await hr.put('/api/settings/work', { workStart: '25:00', lateGraceMinutes: 0, workEnd: '17:00', minOutGapMinutes: 30 })).status, 400);
    const ok = await hr.put('/api/settings/work', { workStart: '08:00', lateGraceMinutes: 0, workEnd: '17:00', minOutGapMinutes: 30 });
    assert.equal(ok.status, 200);

    assert.equal((await nv.post('/api/attendance/recompute', { from: D, to: D })).status, 403);
    assert.equal((await hr.post('/api/attendance/recompute', { from: D, to: '2026-10-12' })).status, 400);
    assert.equal((await hr.post('/api/attendance/recompute', { from: '2026-01-01', to: D })).status, 400, 'quá 92 ngày');
    const rc = await hr.post('/api/attendance/recompute', { from: D, to: D });
    assert.equal(rc.status, 200);
    assert.equal(rc.body.updated, 2);
    const nv1 = (await hr.get(`/api/attendance?date=${D}&search=NV01`)).body.records[0];
    assert.equal(nv1.lateMinutes, 5);
  } finally {
    await app.close();
  }
});

test('camera: mọi vai trò xem, HR thêm, trùng mã thiết bị 409', async () => {
  const { app } = await setup();
  try {
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.post('/api/cameras', { name: 'Cửa', deviceKey: 'C1' })).status, 403);
    const hr = await loginAs(app, 'HR01');
    const c = await hr.post('/api/cameras', { name: 'Cửa chính', deviceKey: 'C20371B239', placeId: '143', placeName: 'Trụ sở' });
    assert.equal(c.status, 200);
    assert.equal(c.body.camera.placeId, 143);
    assert.equal((await hr.post('/api/cameras', { name: 'Trùng', deviceKey: 'C20371B239' })).status, 409);
    assert.equal((await hr.post('/api/cameras', { name: '', deviceKey: 'X' })).status, 400);
    assert.equal((await nv.get('/api/cameras')).body.cameras.length, 1);
  } finally {
    await app.close();
  }
});

test('toVnDate dùng cho mặc định ngày khớp với NOW', () => {
  assert.equal(toVnDate(NOW), D);
});

test('tài khoản hệ thống ADMIN không tính vào số nhân sự', async () => {
  const { app } = await setup();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    const s = (await (await loginAs(app, 'ADMIN')).get('/api/stats')).body;
    assert.equal(s.totalEmployees, 5);
    assert.equal(s.notCheckedInCount, 3);
  } finally {
    await app.close();
  }
});
