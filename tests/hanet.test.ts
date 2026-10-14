import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs, Client, freshDb, type TestApp } from './helpers';
import { parseCheckin, normalizeTs, logWebhook, getWebhookToken, WEBHOOK_LOG_LIMIT } from '../server/hanet';
import { vnDateTimeToTs } from '../server/vntime';

const D = '2026-10-13';
const T0830 = vnDateTimeToTs(D, '08:30'); // 1791855000000

async function setup(config: { simulatorEnabled?: boolean } = {}): Promise<{ app: TestApp; url: string; ids: Record<string, string> }> {
  const app = await startTestApp({ config });
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    nv1: seedUser(app.db, { code: 'PLX-NV01', hanetPersonId: '2134589559210508288' }),
    off: seedUser(app.db, { code: 'NV-NGHI', status: 'inactive' }),
  };
  return { app, url: `/api/hanet/webhook/${getWebhookToken(app.db)}`, ids };
}

const days = (app: TestApp, userId: string) =>
  (app.db.prepare('SELECT work_date, first_in, detection_count FROM attendance_days WHERE user_id = ?').all(userId) as {
    work_date: string;
    first_in: number;
    detection_count: number;
  }[]).map((r) => ({ ...r }));
const lastLog = (app: TestApp) => app.db.prepare('SELECT status, message FROM webhook_logs ORDER BY id DESC LIMIT 1').get() as { status: string; message: string };

test('normalizeTs và parseCheckin (đơn vị thuần)', () => {
  assert.deepEqual(normalizeTs(T0830, 1), { ts: T0830, fromServer: false });
  assert.deepEqual(normalizeTs(T0830 / 1000, 1), { ts: T0830, fromServer: false });
  assert.deepEqual(normalizeTs(null, 99), { ts: 99, fromServer: true });
  assert.equal(parseCheckin({ action: 'checkin', data: { personName: 'Chỉ có tên', deviceID: 'C1' } }, 0), null);
  assert.equal(parseCheckin('rác', 0), null);
  const nested = parseCheckin({ action: 'checkin', data: { aliasID: 'x', deviceID: 'C1', time: T0830 } }, 0)!;
  assert.equal(nested.input.aliasId, 'x');
  assert.equal(nested.note, null);
  const noTime = parseCheckin({ aliasID: 'x', deviceID: 'C1' }, 42)!;
  assert.equal(noTime.input.ts, 42);
  assert.equal(noTime.note, 'Thiếu thời gian từ Camera AI, dùng giờ nhận');
});

test('sai token → 401 và ghi log rejected; thiếu token → 404', async () => {
  const { app } = await setup();
  try {
    const c = new Client(app.baseUrl);
    const r = await c.post('/api/hanet/webhook/sai-token', { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 });
    assert.equal(r.status, 401);
    assert.equal(lastLog(app).status, 'rejected');
    assert.equal((await c.post('/api/hanet/webhook', {})).status, 404);
  } finally {
    await app.close();
  }
});

test('payload JSON lồng (data) tạo lượt nhận diện và dòng ngày công', async () => {
  const { app, url, ids } = await setup();
  try {
    const r = await new Client(app.baseUrl).post(url, {
      action: 'checkin',
      data: { aliasID: 'PLX-NV01', personName: 'A', deviceID: 'C1', deviceName: 'Cửa chính', placeID: 143, time: T0830, detected_image_url: 'https://img/1.jpg' },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { returnCode: 1, returnMessage: 'success' });
    assert.deepEqual(days(app, ids.nv1), [{ work_date: D, first_in: T0830, detection_count: 1 }]);
    assert.equal(lastLog(app).status, 'success');
  } finally {
    await app.close();
  }
});

test('Review Focus #1: form-urlencoded với số dạng chuỗi', async () => {
  const { app, url, ids } = await setup();
  try {
    const res = await fetch(app.baseUrl + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data_type: 'log', aliasID: 'PLX-NV01', personType: '0', deviceID: 'C1', placeID: '143', time: String(T0830) }).toString(),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(days(app, ids.nv1), [{ work_date: D, first_in: T0830, detection_count: 1 }]);
    const det = app.db.prepare('SELECT place_id FROM detections').get() as { place_id: number };
    assert.equal(det.place_id, 143);
  } finally {
    await app.close();
  }
});

test('Review Focus #2: time tính bằng giây', async () => {
  const { app, url, ids } = await setup();
  try {
    await new Client(app.baseUrl).post(url, { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 / 1000 });
    assert.equal(days(app, ids.nv1)[0].first_in, T0830);
  } finally {
    await app.close();
  }
});

test('Review Focus #3: aliasID chữ thường có khoảng trắng vẫn khớp; khớp theo personID', async () => {
  const { app, url, ids } = await setup();
  try {
    const c = new Client(app.baseUrl);
    await c.post(url, { aliasID: '  plx-nv01 ', deviceID: 'C1', time: T0830 });
    await c.post(url, { personID: '2134589559210508288', deviceID: 'C1', time: T0830 + 3_600_000 });
    assert.equal(days(app, ids.nv1)[0].detection_count, 2);
  } finally {
    await app.close();
  }
});

test('Review Focus #4: nhân viên inactive, người lạ, mã không tồn tại → bỏ qua', async () => {
  const { app, url, ids } = await setup();
  try {
    const c = new Client(app.baseUrl);
    await c.post(url, { aliasID: 'NV-NGHI', deviceID: 'C1', time: T0830 });
    assert.equal(lastLog(app).message, 'Nhân viên đã ngừng hoạt động');
    await c.post(url, { aliasID: 'PLX-NV01', personType: 2, deviceID: 'C1', time: T0830 });
    assert.equal(lastLog(app).message, 'Không phải nhân viên');
    const r = await c.post(url, { aliasID: 'KHONG-CO', personName: 'PLX-NV01', deviceID: 'C1', time: T0830 });
    assert.equal(r.status, 200);
    assert.equal(lastLog(app).status, 'ignored');
    assert.deepEqual(days(app, ids.off), []);
    assert.deepEqual(days(app, ids.nv1), [], 'không khớp theo tên');
  } finally {
    await app.close();
  }
});

test('gửi trùng không tạo thêm lượt', async () => {
  const { app, url, ids } = await setup();
  try {
    const c = new Client(app.baseUrl);
    const body = { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 };
    await c.post(url, body);
    const r = await c.post(url, body);
    assert.equal(r.body.returnMessage, 'duplicate');
    assert.equal(days(app, ids.nv1)[0].detection_count, 1);
  } finally {
    await app.close();
  }
});

test('cấu hình Hanet: chỉ HR, che secret, ô trống giữ giá trị cũ, tạo token mới', async () => {
  const { app, url } = await setup();
  try {
    assert.equal((await (await loginAs(app, 'PLX-NV01')).get('/api/hanet/config')).status, 403);
    const hr = await loginAs(app, 'HR01');
    const saved = await hr.put('/api/hanet/config', { clientId: 'cid', clientSecret: 'secret-1234', accessToken: 'token-abcd', placeIds: [143, '200', 'x'] });
    assert.equal(saved.status, 200);
    const cfg = (await hr.get('/api/hanet/config')).body.config;
    assert.equal(cfg.clientId, 'cid');
    assert.equal(cfg.clientSecret, '••••1234');
    assert.equal(cfg.accessToken, '••••abcd');
    assert.deepEqual(cfg.placeIds, [143, 200]);
    assert.equal(cfg.webhookPath, url);
    assert.equal(JSON.stringify(cfg).includes('secret-1234'), false);

    await hr.put('/api/hanet/config', { clientSecret: '', accessToken: '••••abcd' });
    assert.equal((await hr.get('/api/hanet/config')).body.config.clientSecret, '••••1234');

    const rotated = await hr.post('/api/hanet/webhook-token/rotate');
    assert.notEqual(rotated.body.config.webhookPath, url);
    assert.equal((await new Client(app.baseUrl).post(url, { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 })).status, 401);
  } finally {
    await app.close();
  }
});

test('nhật ký webhook: chỉ HR xem', async () => {
  const { app, url } = await setup();
  try {
    await new Client(app.baseUrl).post(url, { aliasID: 'PLX-NV01', deviceID: 'C1', time: T0830 });
    assert.equal((await (await loginAs(app, 'PLX-NV01')).get('/api/hanet/webhook-logs')).status, 403);
    const logs = (await (await loginAs(app, 'HR01')).get('/api/hanet/webhook-logs')).body.logs;
    assert.equal(logs.length, 1);
    assert.equal(logs[0].rawPayload.aliasID, 'PLX-NV01');
  } finally {
    await app.close();
  }
});

test('logWebhook giữ tối đa 500 dòng', () => {
  const db = freshDb();
  for (let i = 0; i < WEBHOOK_LOG_LIMIT + 5; i++) logWebhook(db, { status: 'ignored', message: String(i) }, i);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM webhook_logs').get() as { c: number }).c, WEBHOOK_LOG_LIMIT);
  assert.equal((db.prepare('SELECT message FROM webhook_logs ORDER BY id LIMIT 1').get() as { message: string }).message, '5');
});

test('mô phỏng: HR tạo lượt source=simulator; tắt thì 404', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/hanet/simulate', { userId: ids.nv1, date: D, time: '08:30' });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.status, 'success');
    assert.equal((app.db.prepare('SELECT source FROM detections').get() as { source: string }).source, 'simulator');
    assert.equal((await hr.post('/api/hanet/simulate', { userId: ids.nv1, time: '8h' })).status, 400);
    assert.equal((await (await loginAs(app, 'PLX-NV01')).post('/api/hanet/simulate', { userId: ids.nv1 })).status, 403);
  } finally {
    await app.close();
  }
  const off = await setup({ simulatorEnabled: false });
  try {
    const hr = await loginAs(off.app, 'HR01');
    assert.equal((await hr.post('/api/hanet/simulate', { userId: off.ids.nv1 })).status, 404);
  } finally {
    await off.app.close();
  }
});


test('webhook aliasID ADMIN không bao giờ khớp tài khoản hệ thống: chỉ khớp theo Person ID', async () => {
  const { app, url, ids } = await setup();
  try {
    const admin = seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    const c = new Client(app.baseUrl);
    await c.post(url, { aliasID: 'admin', personID: '2134589559210508288', deviceID: 'C1', time: T0830 });
    assert.equal(days(app, ids.nv1)[0].detection_count, 1, 'ghi cho người có Person ID này');
    await c.post(url, { aliasID: 'ADMIN', personID: 'P-KHONG-CO', deviceID: 'C1', time: T0830 + 60_000 });
    assert.deepEqual(days(app, admin), [], 'không ghi công cho ADMIN');
    assert.equal(lastLog(app).status, 'ignored');
  } finally {
    await app.close();
  }
});
