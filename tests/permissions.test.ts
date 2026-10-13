import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client, type TestApp } from './helpers';

type Role = 'hr' | 'tp' | 'nv';
interface Case {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: (ids: Record<string, string>) => string;
  body?: unknown;
  allowed: Role[];
}

const ALL: Role[] = ['hr', 'tp', 'nv'];
const HR: Role[] = ['hr'];

// Đúng theo bảng phân quyền mục 5 của spec. "Được phép" = không phải 401/403 (có thể 200/400/404/409).
const CASES: Case[] = [
  { method: 'GET', path: () => '/api/users', allowed: ALL },
  { method: 'POST', path: () => '/api/users', body: { code: 'MOI01', name: 'Mới' }, allowed: HR },
  { method: 'PUT', path: (i) => `/api/users/${i.nv2}`, body: { position: 'X' }, allowed: HR },
  { method: 'POST', path: (i) => `/api/users/${i.nv2}/reset-password`, allowed: HR },
  { method: 'DELETE', path: (i) => `/api/users/${i.nv2}`, allowed: [] },
  { method: 'GET', path: () => '/api/departments', allowed: ALL },
  { method: 'DELETE', path: (i) => `/api/departments/${i.kt}`, allowed: [] },
  { method: 'POST', path: () => '/api/departments', body: { code: 'MOI', name: 'Mới' }, allowed: HR },
  { method: 'PUT', path: (i) => `/api/departments/${i.kt}`, body: { description: 'x' }, allowed: HR },
  { method: 'GET', path: () => '/api/cameras', allowed: ALL },
  { method: 'POST', path: () => '/api/cameras', body: { name: 'C', deviceKey: 'K1' }, allowed: HR },
  { method: 'DELETE', path: () => '/api/cameras/cam-khong-co', allowed: HR },
  { method: 'POST', path: () => '/api/cameras/import', body: {}, allowed: HR },
  { method: 'POST', path: () => '/api/cameras/refresh-status', body: {}, allowed: HR },
  { method: 'PUT', path: () => '/api/cameras/cam-khong-co', body: { name: 'X' }, allowed: HR },
  { method: 'GET', path: () => '/api/attendance', allowed: ALL },
  { method: 'POST', path: () => '/api/attendance/recompute', body: { from: '2026-10-13', to: '2026-10-13' }, allowed: HR },
  { method: 'GET', path: () => '/api/stats', allowed: ALL },
  { method: 'GET', path: () => '/api/stats/details?type=present', allowed: ALL },
  { method: 'GET', path: () => '/api/requests', allowed: ALL },
  { method: 'POST', path: () => '/api/requests', body: { workDate: '2026-10-01', type: 'leave_request', reason: 'x' }, allowed: ALL },
  { method: 'PUT', path: (i) => `/api/requests/${i.req}`, body: { status: 'approved' }, allowed: ['hr', 'tp'] },
  { method: 'GET', path: () => '/api/settings/work', allowed: HR },
  { method: 'PUT', path: () => '/api/settings/work', body: { workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 }, allowed: HR },
  { method: 'GET', path: () => '/api/hanet/config', allowed: HR },
  { method: 'PUT', path: () => '/api/hanet/config', body: {}, allowed: HR },
  { method: 'POST', path: () => '/api/hanet/test-connection', body: {}, allowed: HR },
  { method: 'POST', path: () => '/api/hanet/webhook-token/rotate', allowed: HR },
  { method: 'GET', path: () => '/api/hanet/webhook-logs', allowed: HR },
  { method: 'GET', path: () => '/api/hanet/sightings', allowed: HR },
  { method: 'GET', path: () => '/api/hanet/sync', allowed: HR },
  { method: 'POST', path: () => '/api/hanet/sync/retry', body: {}, allowed: HR },
  { method: 'POST', path: () => '/api/hanet/simulate', body: { userId: 'usr-khong-co' }, allowed: HR },
  { method: 'POST', path: () => '/api/hanet/reconcile', body: {}, allowed: HR },
  { method: 'GET', path: () => '/api/admin/backups', allowed: HR },
  { method: 'POST', path: () => '/api/admin/backups', allowed: HR },
  { method: 'POST', path: () => '/api/admin/reset-database', body: { password: 'sai' }, allowed: HR },
];

async function setup(): Promise<{ app: TestApp; ids: Record<string, string>; clients: Record<Role, Client> }> {
  const app = await startTestApp();
  const kt = seedDepartment(app.db, 'KT');
  const ids: Record<string, string> = {
    kt,
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv: seedUser(app.db, { code: 'NV01', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: kt }),
  };
  const nv2 = await loginAs(app, 'NV02');
  ids.req = (await nv2.post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' })).body.request.id;
  const clients = { hr: await loginAs(app, 'HR01'), tp: await loginAs(app, 'TP01'), nv: await loginAs(app, 'NV01') };
  return { app, ids, clients };
}

test('ma trận phân quyền: mỗi vai trò × mỗi API', async () => {
  const { app, ids, clients } = await setup();
  try {
    for (const c of CASES) {
      for (const role of ALL) {
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
