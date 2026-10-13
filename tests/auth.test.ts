import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, generateTempPassword, validateNewPassword, safeEqualStrings,
  createSession, findSessionUser, deleteSession, deleteUserSessions, purgeExpiredSessions,
  LoginLimiter, scopeFor, scopeWhere, SESSION_TTL_MS, type AuthUser,
} from '../server/auth';
import { freshDb, seedDepartment, seedUser } from './helpers';

test('hashPassword/verifyPassword', () => {
  const stored = hashPassword('Matkhau@123');
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(verifyPassword('Matkhau@123', stored), true);
  assert.equal(verifyPassword('matkhau@123', stored), false);
  assert.notEqual(hashPassword('Matkhau@123'), stored, 'salt phải ngẫu nhiên');
});

test('verifyPassword với giá trị lưu hỏng hoặc rỗng → false, không ném lỗi', () => {
  for (const bad of [null, undefined, '', 'plain', 'scrypt$zz$zz', 'bcrypt$00$00', 'scrypt$00$00']) {
    assert.equal(verifyPassword('x', bad), false, String(bad));
  }
});

test('generateTempPassword: 10 ký tự, không có ký tự dễ nhầm', () => {
  for (let i = 0; i < 50; i++) {
    const p = generateTempPassword();
    assert.equal(p.length, 10);
    assert.doesNotMatch(p, /[0O1lI]/);
  }
});

test('validateNewPassword', () => {
  assert.equal(validateNewPassword('short', 'old-pass-1'), 'Mật khẩu mới phải có ít nhất 8 ký tự');
  assert.equal(validateNewPassword(12345678, 'old'), 'Mật khẩu mới phải có ít nhất 8 ký tự');
  assert.equal(validateNewPassword('same-pass', 'same-pass'), 'Mật khẩu mới phải khác mật khẩu hiện tại');
  assert.equal(validateNewPassword('new-pass-1', 'old-pass-1'), null);
});

test('safeEqualStrings', () => {
  assert.equal(safeEqualStrings('abc', 'abc'), true);
  assert.equal(safeEqualStrings('abc', 'abcd'), false);
});

test('phiên: tạo, tìm, hết hạn, xóa', () => {
  const db = freshDb();
  const dep = seedDepartment(db, 'KT');
  const uid = seedUser(db, { code: 'NV01', role: 'dept_manager', departmentId: dep, mustChange: true });
  const now = 1_000_000;
  const token = createSession(db, uid, now);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const stored = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
  assert.notEqual(stored.token_hash, token, 'không lưu token gốc');

  const u = findSessionUser(db, token, now + 1)!;
  assert.deepEqual(u, { id: uid, code: 'NV01', name: 'NV01', role: 'dept_manager', departmentId: dep, mustChangePassword: true });
  assert.equal(findSessionUser(db, token, now + SESSION_TTL_MS), null, 'hết hạn');
  assert.equal(findSessionUser(db, 'sai', now), null);

  deleteSession(db, token);
  assert.equal(findSessionUser(db, token, now + 1), null);
});

test('phiên của nhân viên inactive không dùng được', () => {
  const db = freshDb();
  const uid = seedUser(db, { code: 'NV02', status: 'inactive' });
  const token = createSession(db, uid, 0);
  assert.equal(findSessionUser(db, token, 1), null);
});

test('deleteUserSessions giữ lại phiên ngoại lệ; purgeExpiredSessions', () => {
  const db = freshDb();
  const uid = seedUser(db, { code: 'NV03' });
  const keep = createSession(db, uid, 0);
  const drop = createSession(db, uid, 0);
  deleteUserSessions(db, uid, keep);
  assert.ok(findSessionUser(db, keep, 1));
  assert.equal(findSessionUser(db, drop, 1), null);
  assert.equal(purgeExpiredSessions(db, SESSION_TTL_MS + 1), 1);
  deleteUserSessions(db, uid);
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number }).c, 0);
});

test('LoginLimiter: khóa sau 5 lần sai trong 15 phút, tự mở sau cửa sổ', () => {
  const l = new LoginLimiter();
  const t0 = 0;
  for (let i = 0; i < 4; i++) l.recordFailure('k', t0 + i);
  assert.equal(l.isBlocked('k', t0 + 10), false);
  l.recordFailure('k', t0 + 10);
  assert.equal(l.isBlocked('k', t0 + 11), true);
  assert.equal(l.isBlocked('other', t0 + 11), false);
  assert.equal(l.isBlocked('k', t0 + 15 * 60 * 1000 + 11), false);
  l.recordFailure('k', 0);
  l.reset('k');
  assert.equal(l.isBlocked('k', 1), false);
});

test('scopeFor và scopeWhere', () => {
  const base: Omit<AuthUser, 'role' | 'departmentId'> = { id: 'u1', code: 'X', name: 'X', mustChangePassword: false };
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'hr', departmentId: null }), 'u.id', 'u.department_id'), { sql: '1=1', params: [] });
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'dept_manager', departmentId: 'd1' }), 'u.id', 'u.department_id'), { sql: 'u.department_id = ?', params: ['d1'] });
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'dept_manager', departmentId: null }), 'u.id', 'u.department_id'), { sql: '0=1', params: [] });
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'employee', departmentId: 'd1' }), 'u.id', 'u.department_id'), { sql: 'u.id = ?', params: ['u1'] });
});
