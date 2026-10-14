import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client, TEST_PASSWORD } from './helpers';

test('health không cần đăng nhập', async () => {
  const app = await startTestApp();
  try {
    const r = await new Client(app.baseUrl).get('/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  } finally {
    await app.close();
  }
});

test('chưa đăng nhập → 401', async () => {
  const app = await startTestApp();
  try {
    const r = await new Client(app.baseUrl).get('/api/auth/me');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Vui lòng đăng nhập');
  } finally {
    await app.close();
  }
});

test('đăng nhập sai → 401 chung; đúng → cookie httpOnly và /me', async () => {
  const app = await startTestApp();
  try {
    const dep = seedDepartment(app.db, 'KT', 'Kế toán');
    seedUser(app.db, { code: 'NV01', name: 'Nguyễn Văn A', departmentId: dep });
    const c = new Client(app.baseUrl);
    for (const body of [{ code: 'NV01', password: 'sai-mat-khau' }, { code: 'KHONGCO', password: TEST_PASSWORD }, {}]) {
      const r = await c.post('/api/auth/login', body);
      assert.equal(r.status, 401);
      assert.equal(r.body.error, 'Mã nhân viên/email hoặc mật khẩu không đúng');
    }
    const ok = await c.post('/api/auth/login', { code: 'nv01', password: TEST_PASSWORD });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie')!;
    assert.match(cookie, /sid=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Secure/);
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.code, 'NV01');
    assert.equal(me.body.user.departmentName, 'Kế toán');
    assert.equal(me.body.mustChangePassword, false);
    assert.equal(me.body.simulatorEnabled, true);
    assert.equal('password_hash' in me.body.user, false);
  } finally {
    await app.close();
  }
});

test('production: cookie có Secure', async () => {
  const app = await startTestApp({ config: { production: true } });
  try {
    seedUser(app.db, { code: 'NV01' });
    const r = await new Client(app.baseUrl).post('/api/auth/login', { code: 'NV01', password: TEST_PASSWORD });
    assert.match(r.headers.get('set-cookie')!, /Secure/);
  } finally {
    await app.close();
  }
});

test('tài khoản inactive không đăng nhập được', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01', status: 'inactive' });
    const r = await new Client(app.baseUrl).post('/api/auth/login', { code: 'NV01', password: TEST_PASSWORD });
    assert.equal(r.status, 401);
  } finally {
    await app.close();
  }
});

test('sai 5 lần → 429 kể cả khi nhập đúng', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01' });
    const c = new Client(app.baseUrl);
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { code: 'NV01', password: 'sai' })).status, 401);
    const r = await c.post('/api/auth/login', { code: 'NV01', password: TEST_PASSWORD });
    assert.equal(r.status, 429);
  } finally {
    await app.close();
  }
});

test('bắt buộc đổi mật khẩu: chặn API khác, đổi xong thì dùng được, phiên khác bị hủy', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01', mustChange: true });
    const c1 = await loginAs(app, 'NV01');
    const c2 = await loginAs(app, 'NV01');
    assert.equal((await c1.get('/api/auth/me')).body.mustChangePassword, true);
    const blocked = await c1.get('/api/users');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'MUST_CHANGE_PASSWORD');

    assert.equal((await c1.post('/api/auth/change-password', { currentPassword: 'sai', newPassword: 'MatKhauMoi1' })).status, 400);
    const short = await c1.post('/api/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'ngan' });
    assert.equal(short.status, 400);
    assert.equal(short.body.error, 'Mật khẩu mới phải có ít nhất 8 ký tự');

    assert.equal((await c1.post('/api/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'MatKhauMoi1' })).status, 200);
    assert.equal((await c1.get('/api/auth/me')).body.mustChangePassword, false);
    assert.equal((await c2.get('/api/auth/me')).status, 401, 'phiên khác bị hủy');
    await loginAs(app, 'NV01', 'MatKhauMoi1');
  } finally {
    await app.close();
  }
});

test('đăng xuất hủy phiên', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01' });
    const c = await loginAs(app, 'NV01');
    const saved = c.cookie;
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    c.cookie = saved;
    assert.equal((await c.get('/api/auth/me')).status, 401);
  } finally {
    await app.close();
  }
});

test('API ghi chỉ nhận JSON (415 với text/plain)', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01' });
    const c = await loginAs(app, 'NV01');
    const r = await c.req('POST', '/api/auth/change-password', 'x', { 'Content-Type': 'text/plain' });
    assert.equal(r.status, 415);
  } finally {
    await app.close();
  }
});

test('JSON hỏng → 400', async () => {
  const app = await startTestApp();
  try {
    const r = await new Client(app.baseUrl).req('POST', '/api/auth/login', '{bad', { 'Content-Type': 'application/json' });
    assert.equal(r.status, 400);
  } finally {
    await app.close();
  }
});
