import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client, TEST_PASSWORD, type TestApp } from './helpers';
import { saveMailConfig } from '../server/mail';
import { runMailJobs } from '../server/mail-queue';
import { parseEmail, parsePhone } from '../server/accounts';

const GMAIL = {
  host: 'smtp.gmail.com', port: 465, secure: 'ssl', user: 'hr@gmail.com', password: 'app-pass', fromName: 'Petrolimex Attendance',
  fromEmail: 'hr@gmail.com', appUrl: 'https://petrolimex.hgcvn.cloud', dailyLimit: 450,
};
const flush = (app: TestApp) => runMailJobs({ db: app.db, sendMail: app.ctx.sendMail, now: app.ctx.now });
const lastPassword = (app: TestApp) => /Mật khẩu tạm: (\S+)/.exec(app.mails.at(-1)!.text)![1];

async function setup() {
  const app = await startTestApp();
  saveMailConfig(app.db, GMAIL);
  const kt = seedDepartment(app.db, 'KT', 'Kế toán');
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  return { app, kt, hr: await loginAs(app, 'HR01') };
}

test('parseEmail và parsePhone', () => {
  assert.equal(parseEmail('  An.Nguyen@Gmail.COM '), 'an.nguyen@gmail.com');
  for (const bad of ['', 'abc', 'a@b', 'a b@c.vn']) assert.throws(() => parseEmail(bad), (e: any) => e.status === 400, bad);
  assert.equal(parsePhone('0912 345 678'), '0912345678');
  assert.equal(parsePhone('+84 912.345.678'), '0912345678');
  assert.equal(parsePhone('(091) 234-5678'), '0912345678');
  for (const bad of ['', '091234567', '09123456789', '1912345678', '+8491234567']) assert.throws(() => parsePhone(bad), (e: any) => e.status === 400, bad);
});

test('thêm nhân sự: bắt buộc email và điện thoại, mã tự sinh, mật khẩu gửi qua email, đăng nhập bằng mã hoặc email', async () => {
  const { app, kt, hr } = await setup();
  try {
    assert.equal((await hr.post('/api/users', { name: 'Lê Văn C', phone: '0912345678' })).status, 400);
    assert.equal((await hr.post('/api/users', { name: 'Lê Văn C', email: 'c@test.vn' })).status, 400);
    assert.deepEqual((await hr.get('/api/users/next-code')).body, { code: 'NV0001' });
    const r = await hr.post('/api/users', { name: 'Lê Văn C', email: ' C@Test.vn ', phone: '+84912345678', departmentId: kt });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.tempPassword, undefined);
    assert.deepEqual(
      [r.body.user.code, r.body.user.email, r.body.user.phone, r.body.user.canLogin, r.body.user.emailStatus],
      ['NV0001', 'c@test.vn', '0912345678', false, 'pending'],
    );
    await assert.rejects(loginAs(app, 'NV0001'), 'chưa gửi thư thì chưa đăng nhập được');
    assert.deepEqual(await flush(app), { sent: 1, failed: 0 });
    const pw = lastPassword(app);
    assert.equal(app.mails.at(-1)!.to, 'c@test.vn');
    const byCode = await loginAs(app, 'nv0001', pw);
    assert.equal((await byCode.get('/api/auth/me')).body.mustChangePassword, true);
    const byEmail = new Client(app.baseUrl);
    assert.equal((await byEmail.post('/api/auth/login', { login: 'C@TEST.VN', password: pw })).status, 200);
    assert.equal((await hr.get('/api/users/next-code')).body.code, 'NV0002');
  } finally {
    await app.close();
  }
});

test('Review Focus #3: email trùng (khác hoa thường, có khoảng trắng) → 409, cả khi tạo và khi sửa', async () => {
  const { app, hr } = await setup();
  try {
    const nv = seedUser(app.db, { code: 'NV01', email: 'an@gmail.com' });
    assert.equal((await hr.post('/api/users', { name: 'X', email: 'An@Gmail.com ', phone: '0912345678' })).status, 409);
    const other = seedUser(app.db, { code: 'NV02' });
    assert.equal((await hr.put(`/api/users/${other}`, { email: 'AN@gmail.com' })).status, 409);
    assert.equal((await hr.put(`/api/users/${nv}`, { email: 'an@gmail.com' })).status, 200, 'giữ email của chính mình');
    assert.equal((await hr.put(`/api/users/${nv}`, { phone: '123' })).status, 400);
  } finally {
    await app.close();
  }
});

test('đặt lại mật khẩu hộ: xếp thư, mật khẩu đổi khi thư gửi đi, phiên cũ bị hủy; thiếu email thì 400', async () => {
  const { app, hr } = await setup();
  try {
    const nv = seedUser(app.db, { code: 'NV01', email: 'nv01@test.vn' });
    const noMail = seedUser(app.db, { code: 'NV02' });
    const session = await loginAs(app, 'NV01');
    const r = await hr.post(`/api/users/${nv}/reset-password`);
    assert.deepEqual([r.status, r.body], [200, { queued: true }]);
    assert.equal((await session.get('/api/auth/me')).status, 200, 'chưa gửi thư thì chưa đổi gì');
    await flush(app);
    assert.equal((await session.get('/api/auth/me')).status, 401);
    await assert.rejects(loginAs(app, 'NV01'));
    await loginAs(app, 'NV01', lastPassword(app));
    const e = await hr.post(`/api/users/${noMail}/reset-password`);
    assert.deepEqual([e.status, e.body.error], [400, 'Nhân sự chưa có email: hãy bổ sung email trước']);
  } finally {
    await app.close();
  }
});

test('người nhập từ Camera AI (chưa có email, chưa có mật khẩu): bổ sung email thì tự gửi thư chào mừng', async () => {
  const { app, hr } = await setup();
  try {
    const id = seedUser(app.db, { code: 'NV05', password: null });
    await assert.rejects(loginAs(app, 'NV05'));
    const r = await hr.put(`/api/users/${id}`, { email: 'nv05@test.vn', phone: '0912345678' });
    assert.equal(r.body.user.emailStatus, 'pending');
    await flush(app);
    assert.match(app.mails.at(-1)!.subject, /Tài khoản đăng nhập/);
    await loginAs(app, 'NV05', lastPassword(app));
  } finally {
    await app.close();
  }
});

test('quên mật khẩu: cùng một câu trả lời; link dùng một lần, hạn 30 phút; mật khẩu yếu không làm mất link', async () => {
  let now = Date.UTC(2026, 9, 14, 3, 0);
  const app = await startTestApp({ now: () => now });
  try {
    saveMailConfig(app.db, GMAIL);
    seedUser(app.db, { code: 'NV01', email: 'nv01@test.vn' });
    const anon = new Client(app.baseUrl);
    const msg = 'Nếu tài khoản tồn tại và có email, thư hướng dẫn đã được gửi.';
    assert.deepEqual((await anon.post('/api/auth/forgot-password', { login: 'khong-co@test.vn' })).body, { message: msg });
    assert.deepEqual((await anon.post('/api/auth/forgot-password', { login: 'NV01@TEST.vn' })).body, { message: msg });
    await flush(app);
    assert.equal(app.mails.length, 1);
    const token = decodeURIComponent(/\?reset=(\S+)/.exec(app.mails[0].text)![1]);
    assert.ok(!JSON.stringify(app.db.prepare('SELECT * FROM password_resets').all()).includes(token), 'chỉ lưu băm');
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'ngan' })).status, 400);
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'MatKhauMoi@2026' })).status, 200);
    assert.equal((await anon.post('/api/auth/reset-password', { token, newPassword: 'MatKhauKhac@2026' })).status, 400, 'đã dùng');
    await loginAs(app, 'NV01', 'MatKhauMoi@2026');
    await anon.post('/api/auth/forgot-password', { login: 'NV01' });
    await flush(app);
    const token2 = decodeURIComponent(/\?reset=(\S+)/.exec(app.mails[1].text)![1]);
    now += 31 * 60_000;
    const late = await anon.post('/api/auth/reset-password', { token: token2, newPassword: 'MatKhauMoi@2027' });
    assert.deepEqual([late.status, late.body.error], [400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn']);
  } finally {
    await app.close();
  }
});

test('quên mật khẩu: quá 5 lần trong 15 phút thì 429', async () => {
  const app = await startTestApp();
  try {
    const anon = new Client(app.baseUrl);
    for (let i = 0; i < 5; i++) assert.equal((await anon.post('/api/auth/forgot-password', { login: 'x' })).status, 200);
    assert.equal((await anon.post('/api/auth/forgot-password', { login: 'x' })).status, 429);
  } finally {
    await app.close();
  }
});

test('đăng nhập: tài khoản chưa có mật khẩu báo cùng lỗi như sai mật khẩu', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'NV01', email: 'nv01@test.vn', password: null });
    const r = await new Client(app.baseUrl).post('/api/auth/login', { login: 'nv01@test.vn', password: TEST_PASSWORD });
    assert.deepEqual([r.status, r.body.error], [401, 'Mã nhân viên/email hoặc mật khẩu không đúng']);
  } finally {
    await app.close();
  }
});
