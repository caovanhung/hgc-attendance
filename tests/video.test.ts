import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, addDetection, freshDb } from './helpers';
import { fakeHanet, reply, type FakeCall, type Reply } from './fake-hanet';
import { getSetting } from '../server/settings';
import { vnDateTimeToTs } from '../server/vntime';
import { getVideoAt, testConnectLogin, saveConnectConfig } from '../server/hanet-connect';
import type { Db } from '../server/db';

const DEVICE = 'C21272C952';
const SWIPE = vnDateTimeToTs('2026-10-13', '08:05');
const START = SWIPE - 20_000; // đoạn ghi bắt đầu 20 giây trước lượt quẹt
const MP4 = 'https://vcdn-z-video.hanet.ai/x/2026-10-13-08-04-45.mp4?X-Amz-Signature=abc';

const clip = (ts = START) => ({
  device_id: DEVICE,
  device_name: 'Cổng chính',
  place_id: 998833,
  month: '2026-10',
  day: '2026-10-13',
  file: MP4,
  rtsp_url: 'rtsp://x',
  timestamp: ts,
  duration: 59,
  thumb: 'https://x/thumb.jpg',
  type: 1,
});

const csrf = () => reply(200, { csrfToken: 'csrf-1' }, ['__Host-authjs.csrf-token=csrfcookie%7Chash; Path=/; HttpOnly; Secure; SameSite=Lax']);

/** Đăng nhập Auth.js giả: mật khẩu đúng là 'dung'; mỗi lần đăng nhập cấp phiên mới s1, s2... */
function connectRoutes(video: Reply = () => reply(200, clip())): Record<string, Reply> {
  let n = 0;
  return {
    '/api/auth/csrf': csrf,
    '/api/auth/callback/credentials': (p: URLSearchParams) => {
      if (p.get('password') !== 'dung') {
        return reply(302, null, [], { Location: 'https://connect.hanet.ai/api/auth/signin?error=CredentialsSignin' });
      }
      n++;
      return reply(
        302,
        null,
        [`__Secure-authjs.session-token.0=s${n}a; Path=/; HttpOnly; Secure`, `__Secure-authjs.session-token.1=s${n}b; Path=/; HttpOnly; Secure`],
        { Location: 'https://connect.hanet.ai/' },
      );
    },
    '/api/video/get': video,
  };
}

function configured(db: Db = freshDb(), password = 'dung'): Db {
  saveConnectConfig(db, { email: 'xem@hgc.vn', password });
  return db;
}

const deps = (db: Db, fetchImpl: typeof fetch) => ({ db, fetch: fetchImpl, now: () => SWIPE });

test('lấy video: đăng nhập Auth.js rồi gọi video/get với cookie phiên và body JSON', async () => {
  const db = configured();
  const fake = fakeHanet(connectRoutes());
  const v = await getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE);
  assert.deepEqual(v, { url: MP4, startTs: START, duration: 59, deviceName: 'Cổng chính' });
  assert.deepEqual(fake.paths(), ['/api/auth/csrf', '/api/auth/callback/credentials', '/api/video/get']);

  const login = fake.last('/api/auth/callback/credentials') as FakeCall;
  assert.equal(login.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(login.params.get('csrfToken'), 'csrf-1');
  assert.equal(login.params.get('username'), 'xem@hgc.vn');
  assert.equal(login.params.get('password'), 'dung');
  assert.equal(login.params.get('json'), 'true');
  assert.equal(login.redirect, 'manual');
  assert.match(login.headers.get('cookie') ?? '', /__Host-authjs\.csrf-token=csrfcookie%7Chash/);

  const call = fake.last('/api/video/get') as FakeCall;
  assert.equal(call.headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(call.body), { device_id: DEVICE, timestamp: SWIPE });
  const cookie = call.headers.get('cookie') ?? '';
  assert.match(cookie, /__Secure-authjs\.session-token\.0=s1a/);
  assert.match(cookie, /__Secure-authjs\.session-token\.1=s1b/);
  assert.ok(call.signal, 'phải có timeout');

  // Lần sau dùng lại phiên, không đăng nhập lại
  await getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE + 60_000);
  assert.equal(fake.paths().filter((p) => p === '/api/auth/csrf').length, 1);
});

test('lấy video: chịu được dạng bọc trong data', async () => {
  const db = configured();
  const fake = fakeHanet(connectRoutes(() => reply(200, { code: 0, data: clip() })));
  const v = await getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE);
  assert.equal(v.url, MP4);
  assert.equal(v.startTs, START);
});

test('phiên hết hạn (401): đăng nhập lại đúng một lần rồi gọi lại', async () => {
  const db = configured();
  const fake = fakeHanet(
    connectRoutes((_p: URLSearchParams, c: FakeCall) =>
      /session-token\.0=s1a/.test(c.headers.get('cookie') ?? '') ? reply(401, { message: 'Unauthenticated' }) : reply(200, clip()),
    ),
  );
  const v = await getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE);
  assert.equal(v.url, MP4);
  assert.equal(fake.paths().filter((p) => p === '/api/auth/callback/credentials').length, 2);
  assert.equal(fake.paths().filter((p) => p === '/api/video/get').length, 2);
});

test('vẫn 401 sau khi đăng nhập lại: báo lỗi, không lặp vô hạn', async () => {
  const db = configured();
  const fake = fakeHanet(connectRoutes(() => reply(401, { message: 'Unauthenticated' })));
  await assert.rejects(getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE), /Đăng nhập tài khoản xem video thất bại/);
  assert.equal(fake.paths().filter((p) => p === '/api/video/get').length, 2);
});

test('sai mật khẩu: lỗi tiếng Việt, không gọi video/get', async () => {
  const db = configured(freshDb(), 'sai');
  const fake = fakeHanet(connectRoutes());
  await assert.rejects(
    getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE),
    (err: Error) => err.message === 'Đăng nhập tài khoản xem video thất bại, kiểm tra email/mật khẩu' && !err.message.includes('sai'),
  );
  assert.ok(!fake.paths().includes('/api/video/get'));
});

test('hai request đồng thời chỉ đăng nhập một lần', async () => {
  const db = configured();
  const routes = connectRoutes();
  const login = routes['/api/auth/callback/credentials'] as (p: URLSearchParams) => Response;
  routes['/api/auth/callback/credentials'] = async (p: URLSearchParams) => {
    await new Promise((r) => setTimeout(r, 20));
    return login(p);
  };
  const fake = fakeHanet(routes);
  const d = deps(db, fake.fetchImpl);
  const [a, b] = await Promise.all([getVideoAt(d, DEVICE, SWIPE), getVideoAt(d, DEVICE, SWIPE + 1000)]);
  assert.equal(a.url, MP4);
  assert.equal(b.url, MP4);
  assert.equal(fake.paths().filter((p) => p === '/api/auth/callback/credentials').length, 1);
});

test('chưa cấu hình tài khoản: lỗi, không gọi mạng', async () => {
  const fake = fakeHanet(connectRoutes());
  await assert.rejects(getVideoAt(deps(freshDb(), fake.fetchImpl), DEVICE, SWIPE), /Chưa cấu hình tài khoản xem video \(tab Cấu hình\)/);
  assert.equal(fake.calls.length, 0);
});

test('không có video / lỗi mạng: thông báo tiếng Việt', async () => {
  const db = configured();
  const noVideo = fakeHanet(
    connectRoutes(() => reply(500, { code: 500000, error_code: 'VIDEO_INTERNAL_ERROR', message: 'Cannot retrieve video playback', data: null })),
  );
  await assert.rejects(getVideoAt(deps(db, noVideo.fetchImpl), DEVICE, SWIPE), /Không có video ghi lại vào thời điểm này/);

  const db2 = configured();
  const broken = fakeHanet(
    connectRoutes(() => {
      throw new TypeError('fetch failed');
    }),
  );
  await assert.rejects(getVideoAt(deps(db2, broken.fetchImpl), DEVICE, SWIPE), /Không lấy được video, thử lại sau/);
});

test('đổi cấu hình thì bỏ phiên cũ', async () => {
  const db = configured();
  const fake = fakeHanet(connectRoutes());
  await getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE);
  saveConnectConfig(db, { email: 'khac@hgc.vn', password: 'dung' });
  await getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE);
  assert.equal(fake.paths().filter((p) => p === '/api/auth/csrf').length, 2);
});

test('testConnectLogin: đúng / sai mật khẩu / chưa cấu hình', async () => {
  const fake = fakeHanet(connectRoutes());
  assert.equal((await testConnectLogin(deps(configured(), fake.fetchImpl))).ok, true);
  const bad = await testConnectLogin(deps(configured(freshDb(), 'sai'), fake.fetchImpl));
  assert.deepEqual(bad, { ok: false, message: 'Đăng nhập tài khoản xem video thất bại, kiểm tra email/mật khẩu' });
  assert.equal((await testConnectLogin(deps(freshDb(), fake.fetchImpl))).ok, false);
});

// ---------------- Route ----------------

async function setupApp(routes: Record<string, Reply> = connectRoutes()) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl, now: () => SWIPE + 3_600_000 });
  const kt = seedDepartment(app.db, 'KT');
  const kd = seedDepartment(app.db, 'KD');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: kd }),
  };
  addDetection(app.db, ids.nv1, SWIPE, { deviceId: DEVICE });
  addDetection(app.db, ids.nv1, SWIPE + 120_000, { deviceId: 'SIM', source: 'simulator' });
  addDetection(app.db, ids.nv2, SWIPE, { deviceId: DEVICE });
  const det = (userId: string, deviceId: string) =>
    (app.db.prepare('SELECT id FROM detections WHERE user_id = ? AND device_id = ?').get(userId, deviceId) as { id: number }).id;
  return {
    app,
    fake,
    ids,
    det: { nv1: det(ids.nv1, DEVICE), sim: det(ids.nv1, 'SIM'), nv2: det(ids.nv2, DEVICE) },
  };
}

async function withApp(fn: (s: Awaited<ReturnType<typeof setupApp>>) => Promise<void>, routes?: Record<string, Reply>) {
  const s = await setupApp(routes);
  try {
    await fn(s);
  } finally {
    await s.app.close();
  }
}

test('GET/PUT /hanet/connect: không trả mật khẩu, để trống thì giữ mật khẩu cũ, email rỗng xóa cả hai', () =>
  withApp(async ({ app }) => {
    const hr = await loginAs(app, 'HR01');
    assert.deepEqual((await hr.get('/api/hanet/connect')).body, { email: null, hasPassword: false });

    let r = await hr.put('/api/hanet/connect', { email: ' xem@hgc.vn ', password: 'dung' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { email: 'xem@hgc.vn', hasPassword: true });
    assert.ok(!JSON.stringify((await hr.get('/api/hanet/connect')).body).includes('dung'));

    r = await hr.put('/api/hanet/connect', { email: 'moi@hgc.vn', password: '' });
    assert.deepEqual(r.body, { email: 'moi@hgc.vn', hasPassword: true });
    assert.equal(getSetting(app.db, 'hanet.connect_password'), 'dung');
    await hr.put('/api/hanet/connect', { email: 'moi@hgc.vn' });
    assert.equal(getSetting(app.db, 'hanet.connect_password'), 'dung');

    r = await hr.put('/api/hanet/connect', { email: '' });
    assert.deepEqual(r.body, { email: null, hasPassword: false });
    assert.equal(getSetting(app.db, 'hanet.connect_password'), undefined);

    assert.equal((await hr.put('/api/hanet/connect', { email: 'khong-phai-email' })).status, 400);
  }));

test('POST /hanet/connect/test: trả ok và thông báo', () =>
  withApp(async ({ app }) => {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/hanet/connect/test')).body.ok, false);
    await hr.put('/api/hanet/connect', { email: 'xem@hgc.vn', password: 'dung' });
    const r = await hr.post('/api/hanet/connect/test');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(typeof r.body.message, 'string');
  }));

test('GET /detections/:id/video: HR nhận link, offset, đoạn trước/sau', () =>
  withApp(async ({ app, det, fake }) => {
    configured(app.db);
    const hr = await loginAs(app, 'HR01');
    const r = await hr.get(`/api/detections/${det.nv1}/video`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, {
      url: MP4,
      startTs: START,
      duration: 59,
      offsetSeconds: 20,
      deviceName: 'Cổng chính',
      prevAt: START - 1000,
      nextAt: START + 59_000 + 1000,
    });
    assert.deepEqual(JSON.parse((fake.last('/api/video/get') as FakeCall).body), { device_id: DEVICE, timestamp: SWIPE });

    // Đoạn sau: gọi theo at, offset bị kẹp về 0
    const next = await hr.get(`/api/detections/${det.nv1}/video?at=${START + 60_000}`);
    assert.equal(next.status, 200);
    assert.equal(JSON.parse((fake.last('/api/video/get') as FakeCall).body).timestamp, START + 60_000);
    assert.equal(next.body.offsetSeconds, 59);

    assert.equal((await hr.get(`/api/detections/${det.nv1}/video?at=abc`)).status, 400);
    assert.equal((await hr.get('/api/detections/999999/video')).status, 404);
  }));

test('GET /detections/:id/video: trưởng phòng chỉ trong phạm vi, nhân viên 403, mô phỏng 404', () =>
  withApp(async ({ app, det }) => {
    configured(app.db);
    const tp = await loginAs(app, 'TP01');
    assert.equal((await tp.get(`/api/detections/${det.nv1}/video`)).status, 200);
    assert.equal((await tp.get(`/api/detections/${det.nv2}/video`)).status, 403);
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.get(`/api/detections/${det.nv1}/video`)).status, 403);
    const hr = await loginAs(app, 'HR01');
    const sim = await hr.get(`/api/detections/${det.sim}/video`);
    assert.equal(sim.status, 404);
    assert.equal(sim.body.error, 'Lượt mô phỏng không có video');
  }));

test('GET /detections/:id/video: chưa cấu hình / không có video → lỗi tiếng Việt, không phải 401', () =>
  withApp(
    async ({ app, det }) => {
      const hr = await loginAs(app, 'HR01');
      let r = await hr.get(`/api/detections/${det.nv1}/video`);
      assert.notEqual(r.status, 401);
      assert.equal(r.body.error, 'Chưa cấu hình tài khoản xem video (tab Cấu hình)');
      configured(app.db);
      r = await hr.get(`/api/detections/${det.nv1}/video`);
      assert.equal(r.status, 404);
      assert.equal(r.body.error, 'Không có video ghi lại vào thời điểm này');
    },
    connectRoutes(() => reply(500, { code: 500000, error_code: 'VIDEO_INTERNAL_ERROR', message: 'Cannot retrieve video playback', data: null })),
  ));

test('đăng nhập: nhận cả cookie phiên kiểu NextAuth v4 (next-auth.session-token, có chia mảnh)', async () => {
  const db = configured();
  const routes = connectRoutes((_p: URLSearchParams, c: FakeCall) =>
    /__Secure-next-auth\.session-token\.0=n0/.test(c.headers.get('cookie') ?? '') ? reply(200, clip()) : reply(401, { message: 'Unauthenticated' }),
  );
  routes['/api/auth/callback/credentials'] = () =>
    reply(302, null, ['__Secure-next-auth.session-token.0=n0; Path=/; HttpOnly; Secure', '__Secure-next-auth.session-token.1=n1; Path=/'], {
      Location: 'https://connect.hanet.ai/',
    });
  const fake = fakeHanet(routes);
  const v = await getVideoAt(deps(db, fake.fetchImpl), DEVICE, SWIPE);
  assert.equal(v.url, MP4);
  assert.equal(fake.paths().filter((p) => p === '/api/auth/callback/credentials').length, 1);
});

test('GET /detections/:id/video: duration lẻ (59.5, 59.4567) vẫn cho prevAt/nextAt nguyên, gọi đoạn sau được', () =>
  withApp(
    async ({ app, det }) => {
      configured(app.db);
      const hr = await loginAs(app, 'HR01');
      const r = await hr.get(`/api/detections/${det.nv1}/video`);
      assert.equal(r.status, 200);
      assert.equal(r.body.prevAt, START - 1000);
      assert.equal(r.body.nextAt, START + 60_457); // 59.4567 giây → làm tròn ms
      assert.ok(Number.isInteger(r.body.nextAt));
      assert.equal((await hr.get(`/api/detections/${det.nv1}/video?at=${r.body.nextAt}`)).status, 200);
    },
    connectRoutes(() => reply(200, { ...clip(), duration: 59.4567 })),
  ));
