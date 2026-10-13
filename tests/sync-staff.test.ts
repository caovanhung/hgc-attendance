import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok, type Reply } from './fake-hanet';
import { enqueue, runDueJobs } from '../server/hanet-sync';
import { SYNC_HANDLERS } from '../server/sync-handlers';
import type { Db } from '../server/db';

async function setup(routes: Record<string, Reply>) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  seedUser(app.db, { code: 'ADMIN', role: 'hr' });
  // Đồng hồ của hàng đợi đi trước đồng hồ thật 5 giây để các việc vừa xếp qua API đã đến hạn
  let now = Date.now() + 5_000;
  const deps = { db: app.db, fetch: fake.fetchImpl, now: () => now };
  return {
    app,
    fake,
    deps,
    advance: (ms: number) => (now += ms),
    hr: await loginAs(app, 'HR01'),
    admin: await loginAs(app, 'ADMIN'),
  };
}
const faceUser = (db: Db, code: string, personId: string, departmentId: string | null = null) => {
  const id = seedUser(db, { code, hanetPersonId: personId, departmentId });
  db.prepare('UPDATE users SET face_registered = 1 WHERE id = ?').run(id);
  return id;
};
const ops = (db: Db) => (db.prepare('SELECT op, entity_id FROM sync_jobs ORDER BY id').all() as { op: string; entity_id: string }[]).map((j) => [j.op, j.entity_id]);
const count = (fake: ReturnType<typeof fakeHanet>, path: string) => fake.paths().filter((p) => p === path).length;

test('sửa họ tên/chức vụ người đã có FaceID → updateInfo; người chưa có FaceID → không xếp việc', async () => {
  const { app, fake, deps, hr } = await setup({ '/person/updateInfo': ok() });
  try {
    const a = faceUser(app.db, 'NV01', 'P1');
    const b = seedUser(app.db, { code: 'NV02' });
    await hr.put(`/api/users/${a}`, { name: 'Nguyễn Văn An', position: 'Kế toán' });
    await hr.put(`/api/users/${b}`, { name: 'Khác' });
    await hr.put(`/api/users/${a}`, { phone: '0900' });
    assert.deepEqual(ops(app.db), [['user.info', a]]);
    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/person/updateInfo')!.params;
    assert.deepEqual([p.get('aliasID'), p.get('placeID'), p.get('name'), p.get('title')], ['NV01', String(PLACE), 'Nguyễn Văn An', 'Kế toán']);
    assert.equal((await hr.get('/api/users')).body.users.find((u: any) => u.id === a).hanetSyncStatus, 'synced');
  } finally {
    await app.close();
  }
});

test('phòng ban: tạo trên web → tạo trên Hanet và lưu ID; trùng tên (khác hoa thường, khoảng trắng) thì liên kết', async () => {
  const { app, fake, deps, hr } = await setup({
    '/department/list': (p: URLSearchParams) => ok({ hits: p.get('keyword') === 'Kế toán' ? [{ id: 5132, name: ' kế toán ' }] : [] }),
    '/department/create': ok({ id: 6687, name: 'IT' }),
  });
  try {
    const kt = (await hr.post('/api/departments', { name: 'Kế toán' })).body.department.id;
    const it = (await hr.post('/api/departments', { name: 'IT', description: 'Phòng IT' })).body.department.id;
    await runDueJobs(deps, SYNC_HANDLERS);
    const ids = Object.fromEntries((app.db.prepare('SELECT id, hanet_department_id FROM departments').all() as { id: string; hanet_department_id: string }[]).map((r) => [r.id, r.hanet_department_id]));
    assert.deepEqual([ids[kt], ids[it]], ['5132', '6687']);
    assert.equal(count(fake, '/department/create'), 1);
    assert.deepEqual([fake.last('/department/create')!.params.get('name'), fake.last('/department/create')!.params.get('desc')], ['IT', 'Phòng IT']);
    const list = (await hr.get('/api/departments')).body.departments;
    assert.deepEqual(list.map((d: any) => d.hanetSyncStatus), ['synced', 'synced']);
    await hr.put(`/api/departments/${it}`, { name: 'CNTT' });
    assert.deepEqual(ops(app.db).slice(-1), [['dept.update', it]]);
  } finally {
    await app.close();
  }
});

test('đổi phòng ban khi phòng chưa lên Hanet → hoãn; phòng lên Hanet rồi thì thêm người vào phòng', async () => {
  let creates = 0;
  const { app, fake, deps, advance, hr } = await setup({
    '/department/list': ok({ hits: [] }),
    '/department/create': () => (++creates === 1 ? fail(-503) : ok({ id: 6687 })),
    '/department/add-person': ok(),
  });
  try {
    const u = faceUser(app.db, 'NV01', 'P1');
    const it = (await hr.post('/api/departments', { name: 'IT' })).body.department.id;
    await hr.put(`/api/users/${u}`, { departmentId: it });
    await runDueJobs(deps, SYNC_HANDLERS);
    const dep = app.db.prepare("SELECT attempts, last_error FROM sync_jobs WHERE op = 'user.department'").get() as { attempts: number; last_error: string };
    assert.deepEqual({ ...dep }, { attempts: 0, last_error: 'Chờ phòng ban đồng bộ lên Hanet' });
    advance(61_000);
    await runDueJobs(deps, SYNC_HANDLERS); // tạo phòng thành công, đánh thức việc đổi phòng
    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/department/add-person')!.params;
    assert.deepEqual([p.get('departmentID'), p.get('personIDs')], ['6687', 'P1']);
  } finally {
    await app.close();
  }
});

test('chuyển phòng: bỏ khỏi phòng cũ trên Hanet rồi thêm vào phòng mới', async () => {
  const { app, fake, deps, hr } = await setup({ '/department/remove-person': ok(), '/department/add-person': ok() });
  try {
    const a = seedDepartment(app.db, 'A');
    const b = seedDepartment(app.db, 'B');
    app.db.prepare("UPDATE departments SET hanet_department_id = CASE code WHEN 'A' THEN '11' ELSE '22' END").run();
    const u = faceUser(app.db, 'NV01', 'P1', a);
    await hr.put(`/api/users/${u}`, { departmentId: b });
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.deepEqual(fake.paths(), ['/department/remove-person', '/department/add-person']);
    assert.deepEqual([fake.calls[0].params.get('departmentID'), fake.calls[0].params.get('personID')], ['11', 'P1']);
    assert.equal(fake.calls[1].params.get('departmentID'), '22');
  } finally {
    await app.close();
  }
});

test('ADMIN xóa nhân sự: có Person ID → xóa theo Person ID, không gọi removeByPlace; -5011 coi là xong; chưa có FaceID thì không xếp việc', async () => {
  const { app, fake, deps, admin } = await setup({
    '/person/removePersonByID': (p: URLSearchParams) => (p.get('personID') === 'P2' ? fail(-5011) : ok()),
    '/person/removeByPlace': ok(),
  });
  try {
    const a = faceUser(app.db, 'NV01', 'P1');
    const b = faceUser(app.db, 'NV02', 'P2');
    const c = seedUser(app.db, { code: 'NV03' });
    for (const id of [a, b, c]) assert.equal((await admin.del(`/api/users/${id}`)).status, 200);
    assert.deepEqual(ops(app.db), [['user.remove', a], ['user.remove', b]]);
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.deepEqual(fake.calls.filter((x) => x.path === '/person/removePersonByID').map((x) => x.params.get('personID')), ['P1', 'P2']);
    assert.equal(count(fake, '/person/removeByPlace'), 0, 'không xóa theo aliasID khi đã biết Person ID');
    assert.deepEqual((app.db.prepare('SELECT status FROM sync_jobs').all() as { status: string }[]).map((r) => r.status), ['done', 'done']);
  } finally {
    await app.close();
  }
});

test('xóa nhân sự không có Person ID (chỉ face_registered) → removeByPlace theo mã', async () => {
  const { app, fake, deps, admin } = await setup({ '/person/removeByPlace': ok(), '/person/removePersonByID': ok() });
  try {
    const id = seedUser(app.db, { code: 'NV09' });
    app.db.prepare('UPDATE users SET face_registered = 1 WHERE id = ?').run(id);
    assert.equal((await admin.del(`/api/users/${id}`)).status, 200);
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.equal(fake.last('/person/removeByPlace')!.params.get('aliasID'), 'NV09');
    assert.equal(count(fake, '/person/removePersonByID'), 0);
  } finally {
    await app.close();
  }
});

test('ADMIN xóa phòng ban: có ID Hanet → xóa trên Hanet; chưa lên Hanet → bỏ việc tạo đang chờ', async () => {
  const { app, fake, deps, hr, admin } = await setup({ '/department/remove': ok() });
  try {
    const synced = seedDepartment(app.db, 'A');
    app.db.prepare("UPDATE departments SET hanet_department_id = '11' WHERE id = ?").run(synced);
    const fresh = (await hr.post('/api/departments', { name: 'Mới' })).body.department.id;
    await admin.del(`/api/departments/${synced}`);
    await admin.del(`/api/departments/${fresh}`);
    assert.deepEqual(ops(app.db), [['dept.remove', synced]]);
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.equal(fake.last('/department/remove')!.params.get('id'), '11');
  } finally {
    await app.close();
  }
});

test('Review Focus #5: đối tượng bị xóa trước khi việc chạy → việc kết thúc êm, không gọi Hanet', async () => {
  const { app, fake, deps } = await setup({});
  try {
    const u = faceUser(app.db, 'NV01', 'P1');
    const d = seedDepartment(app.db, 'A');
    app.db.prepare("UPDATE departments SET hanet_department_id = '11' WHERE id = ?").run(d);
    enqueue(app.db, 'user', u, 'user.info', {}, deps.now());
    enqueue(app.db, 'user', u, 'user.department', { fromHanetDeptId: null, toDepartmentId: d }, deps.now());
    enqueue(app.db, 'department', d, 'dept.update', {}, deps.now());
    app.db.prepare('DELETE FROM users WHERE id = ?').run(u);
    app.db.prepare('DELETE FROM departments WHERE id = ?').run(d);
    await runDueJobs(deps, SYNC_HANDLERS);
    await runDueJobs(deps, SYNC_HANDLERS);
    assert.deepEqual((app.db.prepare('SELECT status FROM sync_jobs ORDER BY id').all() as { status: string }[]).map((r) => r.status), ['done', 'done', 'done']);
    assert.equal(fake.calls.length, 0);
  } finally {
    await app.close();
  }
});

const jobsOf = (db: Db, userId: string) =>
  (db.prepare('SELECT op, payload FROM sync_jobs WHERE entity_id = ? ORDER BY id').all(userId) as { op: string; payload: string }[]).map((j) => [j.op, JSON.parse(j.payload)]);

test('gắn Person ID thủ công (tạo/sửa) → xếp việc user.alias trước việc phòng ban/thông tin', async () => {
  const { app, fake, deps, hr } = await setup({ '/person/updateAliasID': ok(), '/person/updateInfo': ok(), '/department/add-person': ok() });
  try {
    const d = seedDepartment(app.db, 'A');
    app.db.prepare("UPDATE departments SET hanet_department_id = '11' WHERE id = ?").run(d);
    const created = await hr.post('/api/users', { code: 'nv21', name: 'Người A', departmentId: d, hanetPersonId: 'P21' });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.deepEqual(jobsOf(app.db, created.body.user.id), [
      ['user.alias', { personId: 'P21', code: 'NV21' }],
      ['user.department', { fromHanetDeptId: null, toDepartmentId: d }],
    ]);

    const id = seedUser(app.db, { code: 'NV22', departmentId: d });
    const r = await hr.put(`/api/users/${id}`, { hanetPersonId: 'P22', name: 'Tên mới' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(jobsOf(app.db, id).map(([op]) => op), ['user.alias', 'user.info', 'user.department']);
    assert.deepEqual(jobsOf(app.db, id)[0][1], { personId: 'P22', code: 'NV22' });
    await hr.put(`/api/users/${id}`, { hanetPersonId: 'P22', phone: '090' });
    assert.equal(jobsOf(app.db, id).filter(([op]) => op === 'user.alias').length, 1, 'Person ID không đổi thì không xếp lại');

    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/person/updateAliasID')!.params;
    assert.deepEqual([p.get('personID'), p.get('aliasID')], ['P22', 'NV22']);
  } finally {
    await app.close();
  }
});

test('Person ID đã gắn với nhân sự khác → 409 khi tạo và khi sửa', async () => {
  const { app, hr } = await setup({});
  try {
    faceUser(app.db, 'NV31', 'P31');
    const other = seedUser(app.db, { code: 'NV32' });
    const c = await hr.post('/api/users', { code: 'NV33', name: 'X', hanetPersonId: 'P31' });
    assert.deepEqual([c.status, c.body.error], [409, 'Person ID này đã gắn với nhân sự khác']);
    const u = await hr.put(`/api/users/${other}`, { hanetPersonId: ' P31 ' });
    assert.deepEqual([u.status, u.body.error], [409, 'Person ID này đã gắn với nhân sự khác']);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM users WHERE code = 'NV33'").get()!.n, 0);
  } finally {
    await app.close();
  }
});
