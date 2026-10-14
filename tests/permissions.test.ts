import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, Client, type TestApp } from './helpers';

type Role = 'nv' | 'tp' | 'qk' | 'hr' | 'admin';
interface Case {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: (ids: Record<string, string>) => string;
  body?: unknown;
  allowed: Role[];
}

// admin chạy cuối cùng: các ca xóa không làm đối tượng biến mất trước khi vai trò bị cấm được thử.
const ROLES: Role[] = ['nv', 'tp', 'qk', 'hr', 'admin'];
const ALL: Role[] = ROLES;
const MANAGERS: Role[] = ['qk', 'hr', 'admin'];
const GLOBAL: Role[] = ['hr', 'admin'];
const ADMIN: Role[] = ['admin'];

// Bảng quyền mục 5 của spec. Mọi đối tượng thuộc khu A (khu của quản trị khu "qk").
// "Được phép" = không phải 401/403 (có thể 200/400/404/409).
const CASES: Case[] = [
  { method: 'GET', path: () => '/api/users', allowed: ALL },
  { method: 'POST', path: () => '/api/users', body: { code: 'MOI01', name: 'Mới', departmentId: undefined }, allowed: MANAGERS },
  { method: 'PUT', path: (i) => `/api/users/${i.nv2}`, body: { position: 'X' }, allowed: MANAGERS },
  { method: 'POST', path: (i) => `/api/users/${i.nv2}/reset-password`, allowed: MANAGERS },
  { method: 'POST', path: (i) => `/api/users/${i.nv2}/face`, body: {}, allowed: MANAGERS },
  { method: 'GET', path: (i) => `/api/users/${i.nv2}/face-candidates`, allowed: MANAGERS },
  { method: 'POST', path: () => '/api/users/import', body: { persons: [] }, allowed: MANAGERS },
  { method: 'POST', path: () => '/api/users/import-csv/preview', body: { rows: [] }, allowed: MANAGERS },
  { method: 'POST', path: () => '/api/users/import-csv', body: { rows: [] }, allowed: MANAGERS },
  { method: 'GET', path: () => '/api/departments', allowed: ALL },
  { method: 'POST', path: (i) => '/api/departments', body: { name: 'Mới' }, allowed: MANAGERS },
  { method: 'PUT', path: (i) => `/api/departments/${i.kt}`, body: { description: 'x' }, allowed: MANAGERS },
  { method: 'GET', path: () => '/api/areas', allowed: ALL },
  { method: 'POST', path: () => '/api/areas', body: { name: 'Khu mới' }, allowed: GLOBAL },
  { method: 'PUT', path: (i) => `/api/areas/${i.A}`, body: { note: 'x' }, allowed: GLOBAL },
  { method: 'GET', path: () => '/api/cameras', allowed: ALL },
  { method: 'POST', path: () => '/api/cameras', body: { name: 'C', deviceKey: 'K1' }, allowed: GLOBAL },
  { method: 'POST', path: () => '/api/cameras/import', body: {}, allowed: GLOBAL },
  { method: 'POST', path: () => '/api/cameras/refresh-status', body: {}, allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/cameras/camA', body: { location: 'X' }, allowed: MANAGERS },
  { method: 'GET', path: () => '/api/attendance', allowed: ALL },
  { method: 'POST', path: () => '/api/attendance/recompute', body: { from: '2026-10-13', to: '2026-10-13' }, allowed: GLOBAL },
  { method: 'GET', path: () => '/api/stats', allowed: ALL },
  { method: 'GET', path: () => '/api/stats/details?type=present', allowed: ALL },
  { method: 'GET', path: () => '/api/requests', allowed: ALL },
  { method: 'POST', path: () => '/api/requests', body: { workDate: '2026-10-01', type: 'leave_request', reason: 'x' }, allowed: ALL },
  { method: 'PUT', path: (i) => `/api/requests/${i.req}`, body: { status: 'approved' }, allowed: ['tp', 'qk', 'hr', 'admin'] },
  { method: 'GET', path: () => '/api/settings/work', allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/settings/work', body: { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 }, allowed: GLOBAL },
  { method: 'GET', path: () => '/api/settings/mail', allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/settings/mail', body: {}, allowed: ADMIN },
  { method: 'POST', path: () => '/api/settings/mail/test', body: { to: 'x' }, allowed: ADMIN },
  { method: 'GET', path: () => '/api/hanet/config', allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/hanet/config', body: {}, allowed: ADMIN },
  { method: 'POST', path: () => '/api/hanet/test-connection', body: {}, allowed: ADMIN },
  { method: 'POST', path: () => '/api/hanet/webhook-token/rotate', allowed: ADMIN },
  { method: 'GET', path: () => '/api/hanet/webhook-logs', allowed: GLOBAL },
  { method: 'GET', path: () => '/api/hanet/sightings', allowed: MANAGERS },
  { method: 'GET', path: () => '/api/hanet/persons/unlinked', allowed: MANAGERS },
  { method: 'GET', path: () => '/api/hanet/sync', allowed: GLOBAL },
  { method: 'POST', path: () => '/api/hanet/sync/retry', body: {}, allowed: ADMIN },
  { method: 'POST', path: (i) => '/api/hanet/sync/retry', body: undefined, allowed: ADMIN },
  { method: 'POST', path: () => '/api/hanet/simulate', body: { userId: 'usr-khong-co' }, allowed: GLOBAL },
  { method: 'POST', path: () => '/api/hanet/reconcile', body: {}, allowed: ADMIN },
  { method: 'GET', path: () => '/api/hanet/connect', allowed: GLOBAL },
  { method: 'PUT', path: () => '/api/hanet/connect', body: { email: '' }, allowed: ADMIN },
  { method: 'POST', path: () => '/api/hanet/connect/test', allowed: ADMIN },
  { method: 'GET', path: () => '/api/detections/999999/video', allowed: ['tp', 'qk', 'hr', 'admin'] },
  { method: 'GET', path: () => '/api/admin/backups', allowed: GLOBAL },
  { method: 'POST', path: () => '/api/admin/backups', allowed: ADMIN },
  { method: 'GET', path: () => '/api/admin/backups/latest', allowed: ADMIN },
  { method: 'POST', path: () => '/api/admin/reset-database', body: { password: 'sai' }, allowed: ADMIN },
  { method: 'GET', path: () => '/api/users/next-code', allowed: MANAGERS },
  // Xóa: để cuối danh sách
  { method: 'DELETE', path: (i) => `/api/users/${i.hr2}`, allowed: ADMIN },
  { method: 'DELETE', path: (i) => `/api/users/${i.nv2}`, allowed: MANAGERS },
  { method: 'DELETE', path: (i) => `/api/departments/${i.kt2}`, allowed: MANAGERS },
  { method: 'DELETE', path: () => '/api/cameras/camA', allowed: MANAGERS },
  { method: 'DELETE', path: (i) => `/api/areas/${i.B}`, allowed: GLOBAL },
];

async function setup(): Promise<{ app: TestApp; ids: Record<string, string>; clients: Record<Role, Client> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const kt = seedDepartment(app.db, 'KT', 'KT', A);
  const ids: Record<string, string> = {
    A,
    B,
    kt,
    kt2: seedDepartment(app.db, 'KT2', 'KT2', A),
    admin: seedUser(app.db, { code: 'ADMIN', role: 'hr' }),
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    hr2: seedUser(app.db, { code: 'HR02', role: 'hr', departmentId: kt }),
    qk: seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [A] }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv: seedUser(app.db, { code: 'NV01', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: kt }),
  };
  app.db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('camA', 'Cổng A', 'DEVA', ?, 'x')").run(A);
  const nv2 = await loginAs(app, 'NV02');
  ids.req = (await nv2.post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' })).body.request.id;
  const clients = {
    nv: await loginAs(app, 'NV01'),
    tp: await loginAs(app, 'TP01'),
    qk: await loginAs(app, 'QK01'),
    hr: await loginAs(app, 'HR01'),
    admin: await loginAs(app, 'ADMIN'),
  };
  return { app, ids, clients };
}

test('ma trận phân quyền: mỗi vai trò × mỗi API', async () => {
  const { app, ids, clients } = await setup();
  try {
    for (const c of CASES) {
      for (const role of ROLES) {
        const r = await clients[role].req(c.method, c.path(ids), c.body);
        const label = `${role} ${c.method} ${c.path(ids)} → ${r.status} ${JSON.stringify(r.body)}`;
        assert.notEqual(r.status, 401, label);
        if (c.allowed.includes(role)) assert.notEqual(r.status, 403, label);
        else assert.equal(r.status, 403, label);
      }
    }
  } finally {
    await app.close();
  }
});

test('đồng bộ lại một đối tượng: quản trị khu được với đối tượng trong khu, ngoài khu 404', async () => {
  const { app, ids, clients } = await setup();
  try {
    const nvB = seedUser(app.db, { code: 'NVB', departmentId: seedDepartment(app.db, 'PB', 'PB', ids.B) });
    assert.equal((await clients.qk.post('/api/hanet/sync/retry', { entityType: 'user', entityId: ids.nv })).status, 200);
    assert.equal((await clients.qk.post('/api/hanet/sync/retry', { entityType: 'user', entityId: nvB })).status, 404);
    assert.equal((await clients.qk.post('/api/hanet/sync/retry', { entityType: 'department', entityId: ids.kt })).status, 200);
    assert.equal((await clients.qk.post('/api/hanet/sync/retry', { entityType: 'camera', entityId: 'camA' })).status, 200);
    assert.equal((await clients.hr.post('/api/hanet/sync/retry', { jobId: 1 })).status, 403);
  } finally {
    await app.close();
  }
});

test('chưa đăng nhập: mọi API trong ma trận trả 401', async () => {
  const { app, ids } = await setup();
  try {
    const anon = new Client(app.baseUrl);
    for (const c of CASES) {
      const r = await anon.req(c.method, c.path(ids), c.body);
      assert.equal(r.status, 401, `${c.method} ${c.path(ids)}`);
    }
  } finally {
    await app.close();
  }
});
