import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedArea, seedDepartment, seedUser } from './helpers';
import { createSession, findSessionUser, scopeFor, scopeWhere, type AuthUser } from '../server/auth';
import { canSeeUser, getUser } from '../server/repo';
import {
  areaColumnSql, areaFilterSql, canDeleteUser, cameraScopeSql, departmentScopeSql, deptAreaId, deviceAreaId, managesArea, parseAreaFilter,
} from '../server/access';

const base: AuthUser = { id: 'x', code: 'X', name: 'X', role: 'employee', departmentId: null, mustChangePassword: false, areaIds: [] };

test('findSessionUser nạp khu được giao của quản trị khu vực, mỗi request đọc lại', () => {
  const db = freshDb();
  const a = seedArea(db, 'KV01');
  const b = seedArea(db, 'KV02');
  const id = seedUser(db, { code: 'QK01', role: 'area_admin', adminAreaIds: [b, a] });
  const token = createSession(db, id, 1000);
  assert.deepEqual(findSessionUser(db, token, 2000)!.areaIds, [a, b].sort());
  db.prepare('DELETE FROM admin_areas WHERE user_id = ? AND area_id = ?').run(id, b);
  assert.deepEqual(findSessionUser(db, token, 2000)!.areaIds, [a], 'gỡ khu có hiệu lực ngay');
  const hr = seedUser(db, { code: 'HR01', role: 'hr' });
  assert.deepEqual(findSessionUser(db, createSession(db, hr, 1000), 2000)!.areaIds, []);
});

test('scopeWhere phạm vi khu: lọc theo khu của phòng ban; không có khu nào thì rỗng', () => {
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'area_admin', areaIds: ['a1', 'a2'] }), 'u.id', 'u.department_id'), {
    sql: 'u.department_id IN (SELECT id FROM departments WHERE area_id IN (?, ?))',
    params: ['a1', 'a2'],
  });
  assert.deepEqual(scopeWhere(scopeFor({ ...base, role: 'area_admin', areaIds: [] }), 'u.id', 'u.department_id'), { sql: '0=1', params: [] });
});

test('canSeeUser: quản trị khu chỉ thấy người thuộc khu được giao; người chưa có khu chỉ HR thấy', () => {
  const qk: AuthUser = { ...base, role: 'area_admin', areaIds: ['a1'] };
  assert.equal(canSeeUser(qk, { id: 'u', departmentId: 'd', areaId: 'a1' }), true);
  assert.equal(canSeeUser(qk, { id: 'u', departmentId: 'd', areaId: 'a2' }), false);
  assert.equal(canSeeUser(qk, { id: 'u', departmentId: null, areaId: null }), false);
  assert.equal(canSeeUser({ ...base, role: 'hr' }, { id: 'u', departmentId: null, areaId: null }), true);
});

test('managesArea và parseAreaFilter', () => {
  const db = freshDb();
  const a = seedArea(db, 'KV01');
  const b = seedArea(db, 'KV02');
  const hr: AuthUser = { ...base, role: 'hr' };
  const qk: AuthUser = { ...base, role: 'area_admin', areaIds: [a] };
  assert.equal(managesArea(hr, null), true);
  assert.equal(managesArea(qk, a), true);
  assert.equal(managesArea(qk, b), false);
  assert.equal(managesArea(qk, null), false);
  assert.equal(managesArea({ ...base, role: 'dept_manager' }, a), false);
  assert.deepEqual(parseAreaFilter(db, qk, undefined), { kind: 'all' });
  assert.deepEqual(parseAreaFilter(db, qk, 'all'), { kind: 'all' });
  assert.deepEqual(parseAreaFilter(db, qk, a), { kind: 'area', areaId: a });
  assert.deepEqual(parseAreaFilter(db, hr, 'none'), { kind: 'none' });
  for (const bad of [b, 'none', 'khong-co', 42]) {
    assert.throws(() => parseAreaFilter(db, qk, bad), (e: any) => e.status === 404, String(bad));
  }
});

test('câu lọc khu: areaFilterSql, areaColumnSql, departmentScopeSql, cameraScopeSql', () => {
  assert.deepEqual(areaFilterSql({ kind: 'all' }, 'u.department_id'), { sql: '1=1', params: [] });
  assert.deepEqual(areaFilterSql({ kind: 'area', areaId: 'a1' }, 'u.department_id'), {
    sql: 'u.department_id IN (SELECT id FROM departments WHERE area_id = ?)',
    params: ['a1'],
  });
  assert.deepEqual(areaFilterSql({ kind: 'none' }, 'u.department_id'), {
    sql: '(u.department_id IS NULL OR u.department_id IN (SELECT id FROM departments WHERE area_id IS NULL))',
    params: [],
  });
  assert.deepEqual(areaColumnSql({ kind: 'area', areaId: 'a1' }, 'c.area_id'), { sql: 'c.area_id = ?', params: ['a1'] });
  assert.deepEqual(areaColumnSql({ kind: 'none' }, 'c.area_id'), { sql: 'c.area_id IS NULL', params: [] });
  assert.deepEqual(departmentScopeSql({ ...base, role: 'hr' }), { sql: '1=1', params: [] });
  assert.deepEqual(departmentScopeSql({ ...base, role: 'area_admin', areaIds: ['a1'] }), { sql: 'd.area_id IN (?)', params: ['a1'] });
  assert.deepEqual(departmentScopeSql({ ...base, role: 'dept_manager', departmentId: 'd1' }), { sql: 'd.id = ?', params: ['d1'] });
  assert.deepEqual(departmentScopeSql({ ...base, role: 'employee', departmentId: null }), { sql: '0=1', params: [] });
  assert.deepEqual(cameraScopeSql({ ...base, role: 'area_admin', areaIds: [] }), { sql: '0=1', params: [] });
  assert.deepEqual(cameraScopeSql({ ...base, role: 'dept_manager', departmentId: 'd1' }), {
    sql: 'c.area_id IS NOT NULL AND c.area_id = (SELECT area_id FROM departments WHERE id = ?)',
    params: ['d1'],
  });
  assert.deepEqual(cameraScopeSql({ ...base, role: 'employee', departmentId: 'd1' }), { sql: '0=1', params: [] });
});

test('deptAreaId và deviceAreaId', () => {
  const db = freshDb();
  const a = seedArea(db, 'KV01');
  const d = seedDepartment(db, 'PB001', 'Kế toán', a);
  const d2 = seedDepartment(db, 'PB002');
  assert.equal(deptAreaId(db, d), a);
  assert.equal(deptAreaId(db, d2), null);
  assert.equal(deptAreaId(db, 'khong-co'), undefined);
  db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('c1', 'Cổng', 'DEV1', ?, 'x')").run(a);
  assert.equal(deviceAreaId(db, 'DEV1'), a);
  assert.equal(deviceAreaId(db, 'DEV-LA'), null);
});

test('canDeleteUser theo bảng xóa của spec', () => {
  const db = freshDb();
  const a = seedArea(db, 'KV01');
  const b = seedArea(db, 'KV02');
  const da = seedDepartment(db, 'PA', 'PA', a);
  const db2 = seedDepartment(db, 'PB', 'PB', b);
  const u = (code: string, role: AuthUser['role'], dep: string | null) => getUser(db, seedUser(db, { code, role, departmentId: dep }))!;
  const nvA = u('NVA', 'employee', da);
  const tpA = u('TPA', 'dept_manager', da);
  const nvB = u('NVB', 'employee', db2);
  const qkA = u('QKA', 'area_admin', da);
  const hr2 = u('HR02', 'hr', da);
  const admin: AuthUser = { ...base, id: 'adm', code: 'ADMIN', role: 'hr' };
  const hr: AuthUser = { ...base, id: 'hr1', code: 'HR01', role: 'hr' };
  const qk: AuthUser = { ...base, id: 'qk', code: 'QK', role: 'area_admin', areaIds: [a] };
  for (const t of [nvA, tpA, nvB, qkA, hr2]) assert.equal(canDeleteUser(admin, t), true, `ADMIN xóa ${t.code}`);
  for (const t of [nvA, tpA, nvB, qkA]) assert.equal(canDeleteUser(hr, t), true, `HR xóa ${t.code}`);
  assert.equal(canDeleteUser(hr, hr2), false, 'HR không xóa HR');
  assert.equal(canDeleteUser(qk, nvA), true);
  assert.equal(canDeleteUser(qk, tpA), true);
  assert.equal(canDeleteUser(qk, nvB), false, 'ngoài khu');
  assert.equal(canDeleteUser(qk, qkA), false, 'quản trị khu khác');
  assert.equal(canDeleteUser(qk, hr2), false);
  assert.equal(canDeleteUser({ ...hr, id: nvA.id }, nvA), false, 'không tự xóa');
  assert.equal(canDeleteUser(admin, { ...nvA, code: 'ADMIN' }), false, 'không xóa ADMIN');
});
