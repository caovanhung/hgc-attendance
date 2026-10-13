import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureAdminAccess, DEFAULT_ADMIN_PASSWORD } from '../server/bootstrap';
import { hashPassword, verifyPassword } from '../server/auth';
import { freshDb, seedUser } from './helpers';

test('DB trống → tạo đúng một tài khoản ADMIN / Admin@123, bắt đổi', () => {
  const db = freshDb();
  const r = ensureAdminAccess(db, undefined)!;
  assert.equal(r.code, 'ADMIN');
  assert.equal(r.fromEnv, false);
  assert.equal(r.password, DEFAULT_ADMIN_PASSWORD);
  assert.equal(DEFAULT_ADMIN_PASSWORD, 'Admin@123');
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 1);
  const row = db.prepare("SELECT role, status, password_hash, must_change_password FROM users WHERE code = 'ADMIN'").get() as Record<string, any>;
  assert.equal(row.role, 'hr');
  assert.equal(row.status, 'active');
  assert.equal(row.must_change_password, 1);
  assert.ok(verifyPassword(r.password, row.password_hash));
  assert.equal(ensureAdminAccess(db, undefined), null, 'lần sau không làm gì');
});

test('dùng ADMIN_INITIAL_PASSWORD nếu đủ 8 ký tự', () => {
  const db = freshDb();
  const r = ensureAdminAccess(db, 'BatDau@2026')!;
  assert.equal(r.fromEnv, true);
  assert.equal(r.password, 'BatDau@2026');
  const short = ensureAdminAccess(freshDb(), 'ngan')!;
  assert.equal(short.fromEnv, false);
  assert.equal(short.password, DEFAULT_ADMIN_PASSWORD, 'ngắn hơn 8 ký tự thì dùng mật khẩu mặc định');
});

test('đã đổi mật khẩu thì khởi động lại không đặt lại', () => {
  const db = freshDb();
  ensureAdminAccess(db, undefined);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE code = 'ADMIN'").run(hashPassword('MatKhauMoi@1'));
  assert.equal(ensureAdminAccess(db, undefined), null);
  const row = db.prepare("SELECT password_hash FROM users WHERE code = 'ADMIN'").get() as { password_hash: string };
  assert.ok(verifyPassword('MatKhauMoi@1', row.password_hash));
});

test('HR có sẵn nhưng chưa có mật khẩu → đặt mật khẩu mặc định cho HR đó', () => {
  const db = freshDb();
  seedUser(db, { code: 'HR01', role: 'hr', password: null });
  seedUser(db, { code: 'NV01' });
  const r = ensureAdminAccess(db, undefined)!;
  assert.equal(r.code, 'HR01');
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 2);
});
