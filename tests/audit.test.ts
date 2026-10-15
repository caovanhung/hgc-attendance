import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, Client, type TestApp } from './helpers';
import { writeAudit } from '../server/audit';

async function setup() {
  const app = await startTestApp();
  const a1 = seedArea(app.db, 'KV1');
  const a2 = seedArea(app.db, 'KV2');
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
  const d2 = seedDepartment(app.db, 'PB2', 'Kho', a2);
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    qk: seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a1] }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: d1 }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: d2 }),
  };
  return { app, a1, a2, ids };
}

const rows = (app: TestApp) => app.db.prepare('SELECT * FROM audit_logs ORDER BY id').all() as Record<string, any>[];

test('đăng nhập HR / quản trị khu được ghi; trưởng phòng, nhân viên không; sai mật khẩu và tài khoản lạ ghi login_failed', async () => {
  const { app, ids } = await setup();
  try {
    await loginAs(app, 'HR01');
    await loginAs(app, 'QK01');
    await loginAs(app, 'TP01');
    await loginAs(app, 'NV01');
    const c = new Client(app.baseUrl);
    assert.equal((await c.post('/api/auth/login', { code: 'HR01', password: 'sai-mat-khau' })).status, 401);
    assert.equal((await c.post('/api/auth/login', { code: 'KHONGCO', password: 'x' })).status, 401);
    assert.equal((await c.post('/api/auth/login', { code: 'NV01', password: 'sai' })).status, 401);
    const r = rows(app);
    assert.deepEqual(
      r.map((x) => [x.action, x.actor_id, x.actor_label]),
      [
        ['auth.login', ids.hr, 'HR01 (HR01)'],
        ['auth.login', ids.qk, 'QK01 (QK01)'],
        ['auth.login_failed', ids.hr, 'HR01 (HR01)'],
        ['auth.login_failed', null, 'KHONGCO'],
      ],
    );
    assert.ok(r.every((x) => typeof x.ip === 'string' && x.ip.length > 0));
  } finally {
    await app.close();
  }
});

test('GET /api/audit: HR thấy tất cả, quản trị khu chỉ dòng của khu / của mình, trưởng phòng 403; lọc và phân trang', async () => {
  const { app, a1, a2, ids } = await setup();
  try {
    const base = { actorId: ids.hr, actorLabel: 'HR01 (HR01)', ip: '1.1.1.1' } as const;
    writeAudit(app.db, Date.UTC(2026, 9, 1), { ...base, action: 'attendance.override', targetUserId: ids.nv1, targetLabel: 'NV01 (NV01)', areaId: a1, reason: 'Camera hỏng' });
    writeAudit(app.db, Date.UTC(2026, 9, 2), { ...base, action: 'attendance.override', targetUserId: ids.nv2, targetLabel: 'NV02 (NV02)', areaId: a2 });
    writeAudit(app.db, Date.UTC(2026, 9, 3), { ...base, action: 'settings.work', before: { a: 1 }, after: { a: 2 } });
    const hr = await loginAs(app, 'HR01');
    const all = await hr.get('/api/audit?from=2026-09-01&to=2026-10-31');
    assert.equal(all.status, 200);
    const ov = await hr.get('/api/audit?from=2026-09-01&to=2026-10-31&action=attendance.override');
    assert.deepEqual(ov.body.entries.map((e: any) => e.targetLabel), ['NV02 (NV02)', 'NV01 (NV01)']);
    assert.equal(ov.body.entries[1].reason, 'Camera hỏng');
    assert.deepEqual((await hr.get('/api/audit?from=2026-09-01&to=2026-10-31&action=settings.work')).body.entries[0].after, { a: 2 });
    assert.deepEqual(
      (await hr.get('/api/audit?from=2026-09-01&to=2026-10-31&q=NV01')).body.entries.map((e: any) => e.targetLabel),
      ['NV01 (NV01)'],
    );
    const qk = await loginAs(app, 'QK01');
    const mine = await qk.get('/api/audit?from=2026-09-01&to=2026-10-31&action=attendance.override');
    assert.deepEqual(mine.body.entries.map((e: any) => e.targetLabel), ['NV01 (NV01)']);
    assert.equal((await (await loginAs(app, 'TP01')).get('/api/audit')).status, 403);
    assert.equal((await hr.get('/api/audit?from=2026-13-01')).status, 400);
    assert.equal(typeof all.body.total, 'number');
    assert.equal(all.body.pageSize, 50);
  } finally {
    await app.close();
  }
});
