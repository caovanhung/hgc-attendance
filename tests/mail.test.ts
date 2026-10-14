import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser, startTestApp, loginAs } from './helpers';
import { createSession, findSessionUser, verifyPassword } from '../server/auth';
import { getMailConfigView, getSmtpConfig, MailError, saveMailConfig, type MailMessage, type SendMail } from '../server/mail';
import { enqueueMail, MAIL_MAX_ATTEMPTS, runMailJobs, sentToday } from '../server/mail-queue';
import type { Db } from '../server/db';

const T0 = Date.UTC(2026, 9, 14, 3, 0); // 10:00 giờ Việt Nam
const GMAIL = {
  host: 'smtp.gmail.com', port: 465, secure: 'ssl', user: 'hr@gmail.com', password: 'app-pass-16', fromName: 'Petrolimex Attendance',
  fromEmail: 'hr@gmail.com', appUrl: 'https://petrolimex.hgcvn.cloud', dailyLimit: 450,
};

function inbox(fail?: (n: number) => Error | null): { send: SendMail; mails: MailMessage[] } {
  const mails: MailMessage[] = [];
  let n = 0;
  return {
    mails,
    send: async (_cfg, msg) => {
      const err = fail?.(n++) ?? null;
      if (err) throw err;
      mails.push(msg);
    },
  };
}

const job = (db: Db, userId: string) =>
  db.prepare('SELECT status, attempts, next_run_at, last_error, payload FROM email_jobs WHERE user_id = ? ORDER BY id DESC').get(userId) as Record<string, any>;
const user = (db: Db, id: string) => db.prepare('SELECT password_hash, must_change_password, email_status, email_error FROM users WHERE id = ?').get(id) as Record<string, any>;

test('cấu hình gửi thư: lưu, che mật khẩu, để trống mật khẩu thì giữ cũ, kiểm tra dữ liệu', () => {
  const db = freshDb();
  assert.equal(getSmtpConfig(db), null);
  saveMailConfig(db, GMAIL);
  const view = getMailConfigView(db, T0);
  assert.equal(view.hasPassword, true);
  assert.equal((view as unknown as Record<string, unknown>).password, undefined);
  assert.equal(view.configured, true);
  saveMailConfig(db, { ...GMAIL, password: '' });
  assert.equal(getSmtpConfig(db)!.password, 'app-pass-16');
  assert.equal(getSmtpConfig(db)!.secure, true);
  for (const bad of [{ port: 0 }, { secure: 'tls' }, { fromEmail: 'khong-phai-email' }, { appUrl: 'petrolimex.vn' }, { dailyLimit: 0 }, { host: '' }]) {
    assert.throws(() => saveMailConfig(db, { ...GMAIL, ...bad }), (e: any) => e.status === 400, JSON.stringify(bad));
  }
  saveMailConfig(db, { ...GMAIL, appUrl: 'https://petrolimex.hgcvn.cloud/' });
  assert.equal(getMailConfigView(db, T0).appUrl, 'https://petrolimex.hgcvn.cloud', 'bỏ dấu / cuối');
});

test('thư chào mừng: mật khẩu tạm sinh lúc gửi, có trong thư, DB không lưu mật khẩu rõ', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV0001', name: 'Nguyễn Văn An', email: 'an@test.vn', password: null });
  enqueueMail(db, id, 'welcome', {}, T0);
  assert.equal(user(db, id).email_status, 'pending');
  const box = inbox();
  assert.deepEqual(await runMailJobs({ db, sendMail: box.send, now: () => T0 }), { sent: 1, failed: 0 });
  assert.equal(box.mails.length, 1);
  assert.equal(box.mails[0].to, 'an@test.vn');
  const pw = /Mật khẩu tạm: (\S+)/.exec(box.mails[0].text)![1];
  assert.match(box.mails[0].text, /NV0001/);
  assert.match(box.mails[0].text, /https:\/\/petrolimex\.hgcvn\.cloud/);
  const u = user(db, id);
  assert.ok(verifyPassword(pw, u.password_hash));
  assert.deepEqual([u.must_change_password, u.email_status], [1, 'sent']);
  const j = job(db, id);
  assert.equal(j.status, 'sent');
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM email_jobs').all()).includes(pw), 'không lưu mật khẩu trong hàng đợi');
});

test('Review Focus #4: gửi thư đặt lại thất bại vĩnh viễn → mật khẩu cũ vẫn dùng được', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV01', email: 'nv01@test.vn' });
  const before = user(db, id);
  enqueueMail(db, id, 'reset_temp', {}, T0);
  const box = inbox(() => new MailError('Máy chủ thư từ chối (550)', true, '550'));
  assert.deepEqual(await runMailJobs({ db, sendMail: box.send, now: () => T0 }), { sent: 0, failed: 1 });
  const after = user(db, id);
  assert.equal(after.password_hash, before.password_hash);
  assert.equal(after.must_change_password, before.must_change_password);
  assert.deepEqual([after.email_status, after.email_error], ['error', 'Máy chủ thư từ chối (550)']);
  assert.equal(job(db, id).status, 'error');
});

test('lỗi tạm: thử lại sau 1, 5, 15, 60 phút; quá số lần thì lỗi', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV01', email: 'nv01@test.vn', password: null });
  enqueueMail(db, id, 'welcome', {}, T0);
  const box = inbox(() => new MailError('Không kết nối được máy chủ gửi thư, sẽ thử lại', false, 'ETIMEDOUT'));
  let now = T0;
  await runMailJobs({ db, sendMail: box.send, now: () => now });
  assert.deepEqual([job(db, id).status, job(db, id).attempts, job(db, id).next_run_at], ['pending', 1, T0 + 60_000]);
  assert.equal(user(db, id).password_hash, null, 'gửi lỗi thì không để lại mật khẩu');
  for (let i = 1; i < MAIL_MAX_ATTEMPTS; i++) {
    now = job(db, id).next_run_at;
    await runMailJobs({ db, sendMail: box.send, now: () => now });
  }
  assert.deepEqual([job(db, id).status, job(db, id).attempts], ['error', MAIL_MAX_ATTEMPTS]);
  assert.equal(user(db, id).email_status, 'error');
});

test('hạn mức ngày: đủ hạn mức thì dời sang 00:00 hôm sau (giờ Việt Nam)', async () => {
  const db = freshDb();
  saveMailConfig(db, { ...GMAIL, dailyLimit: 1 });
  const a = seedUser(db, { code: 'A', email: 'a@test.vn', password: null });
  const b = seedUser(db, { code: 'B', email: 'b@test.vn', password: null });
  enqueueMail(db, a, 'welcome', {}, T0);
  enqueueMail(db, b, 'welcome', {}, T0);
  const box = inbox();
  await runMailJobs({ db, sendMail: box.send, now: () => T0 });
  assert.equal(box.mails.length, 1);
  assert.equal(sentToday(db, T0), 1);
  assert.equal(job(db, b).next_run_at, Date.UTC(2026, 9, 14, 17, 0), '00:00 ngày 15/10 giờ Việt Nam');
});

test('chưa cấu hình SMTP: thư giữ trạng thái chờ', async () => {
  const db = freshDb();
  const id = seedUser(db, { code: 'A', email: 'a@test.vn', password: null });
  enqueueMail(db, id, 'welcome', {}, T0);
  const box = inbox();
  assert.deepEqual(await runMailJobs({ db, sendMail: box.send, now: () => T0 }), { sent: 0, failed: 0 });
  assert.equal(job(db, id).status, 'pending');
});

test('thư đặt lại gửi thành công thì hủy phiên cũ; xếp thư mới thay thư mật khẩu đang chờ', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV01', email: 'nv01@test.vn' });
  const token = createSession(db, id, T0);
  enqueueMail(db, id, 'welcome', {}, T0);
  enqueueMail(db, id, 'reset_temp', {}, T0);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'pending'").get() as { c: number }).c, 1);
  const box = inbox();
  await runMailJobs({ db, sendMail: box.send, now: () => T0 });
  assert.equal(box.mails.length, 1);
  assert.equal(findSessionUser(db, token, T0 + 1), null);
});

test('thư link đặt lại: token chỉ nằm trong thư, xóa khỏi hàng đợi sau khi gửi', async () => {
  const db = freshDb();
  saveMailConfig(db, GMAIL);
  const id = seedUser(db, { code: 'NV01', email: 'nv01@test.vn' });
  const hash = (db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id) as { password_hash: string }).password_hash;
  enqueueMail(db, id, 'reset_link', { token: 'tok-123' }, T0);
  const box = inbox();
  await runMailJobs({ db, sendMail: box.send, now: () => T0 });
  assert.match(box.mails[0].text, /https:\/\/petrolimex\.hgcvn\.cloud\/\?reset=tok-123/);
  assert.equal(job(db, id).payload, '{}');
  assert.equal(user(db, id).password_hash, hash, 'thư link không đổi mật khẩu');
});

test('API cấu hình thư: ADMIN lưu và gửi thư thử; HR toàn hệ thống chỉ xem, không thấy mật khẩu', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const admin = await loginAs(app, 'ADMIN');
    assert.equal((await admin.post('/api/settings/mail/test', { to: 'a@test.vn' })).body.ok, false, 'chưa cấu hình');
    const put = await admin.put('/api/settings/mail', GMAIL);
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const t = await admin.post('/api/settings/mail/test', { to: 'nhan@test.vn' });
    assert.deepEqual(t.body, { ok: true, message: 'Đã gửi thư thử tới nhan@test.vn' });
    assert.equal(app.mails[0].to, 'nhan@test.vn');
    const view = (await (await loginAs(app, 'HR01')).get('/api/settings/mail')).body;
    assert.equal(view.hasPassword, true);
    assert.ok(!JSON.stringify(view).includes('app-pass-16'));
  } finally {
    await app.close();
  }
});
