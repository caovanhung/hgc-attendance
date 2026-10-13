import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, Client } from './helpers';
import { PLACE, configureHanet, fakeHanet, ok, type Reply } from './fake-hanet';
import { fetchAllPersons, IMPORT_PAGE_SIZE } from '../server/hanet-import';
import { runDueJobs } from '../server/hanet-sync';
import { SYNC_HANDLERS } from '../server/sync-handlers';
import type { HanetPerson } from '../shared/types';

const person = (aliasID: string, personID: string, name = `Người ${personID}`): HanetPerson => ({
  aliasID, personID, name, avatar: `https://static.hanet.ai/face/${personID}.jpg`, title: 'Nhân viên',
});
const pagesRoute = (pages: HanetPerson[][]): Reply => (p: URLSearchParams) => ok(pages[Number(p.get('page')) - 1] ?? []);

async function setup(routes: Record<string, Reply>, configured = true) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  if (configured) configureHanet(app.db);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  const deps = { db: app.db, fetch: fake.fetchImpl, now: () => Date.now() };
  return { app, fake, deps, hr: await loginAs(app, 'HR01') };
}

test('danh sách chưa liên kết: bỏ người trùng mã hoặc trùng Person ID', async () => {
  const { app, fake, hr } = await setup({
    '/person/getListByPlace': pagesRoute([[person('DDV01', 'P1'), person('', 'P2'), person('nv05', 'P5'), person('', 'P6')]]),
  });
  try {
    seedUser(app.db, { code: 'DDV01' });
    seedUser(app.db, { code: 'NV-X', hanetPersonId: 'P2' });
    const r = await hr.get('/api/hanet/persons/unlinked');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.persons.map((p: HanetPerson) => p.personID), ['P5', 'P6']);
    const q = fake.last('/person/getListByPlace')!.params;
    assert.deepEqual([q.get('placeID'), q.get('type'), q.get('size')], [String(PLACE), '0', String(IMPORT_PAGE_SIZE)]);
  } finally {
    await app.close();
  }
});

test('Review Focus #2: trang đầy đủ rồi trang rỗng thì dừng; danh sách rỗng gọi một lần', async () => {
  const full = Array.from({ length: IMPORT_PAGE_SIZE }, (_, i) => person(`A${i}`, `P${i}`));
  const a = await setup({ '/person/getListByPlace': pagesRoute([full, []]) });
  try {
    assert.equal((await fetchAllPersons(a.deps, PLACE)).length, IMPORT_PAGE_SIZE);
    assert.equal(a.fake.paths().filter((p) => p === '/person/getListByPlace').length, 2);
  } finally {
    await a.app.close();
  }
  const b = await setup({ '/person/getListByPlace': pagesRoute([]) });
  try {
    assert.deepEqual(await fetchAllPersons(b.deps, PLACE), []);
    assert.equal(b.fake.calls.length, 1);
  } finally {
    await b.app.close();
  }
});

test('nhập: mã theo aliasID, tự sinh NV0001 khi thiếu/không hợp lệ, xếp việc gán alias và phòng ban', async () => {
  const { app, hr } = await setup({
    '/person/getListByPlace': pagesRoute([[person('nv05', 'P5', 'Dương Đức Văn'), person('', 'P6'), person('a b', 'P7'), person('XYZ9', 'P9')]]),
  });
  try {
    const kt = seedDepartment(app.db, 'KT');
    const r = await hr.post('/api/users/import', {
      persons: [{ personId: 'P5' }, { personId: 'P6' }, { personId: 'P7' }, { personId: 'P9' }, { personId: 'P-KHONG-CO' }],
      departmentId: kt,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.created.map((c: any) => [c.code, c.name]), [
      ['NV05', 'Dương Đức Văn'],
      ['NV0001', 'Người P6'],
      ['NV0002', 'Người P7'],
      ['XYZ9', 'Người P9'],
    ]);
    const u = app.db.prepare("SELECT hanet_person_id, face_registered, department_id, position, must_change_password FROM users WHERE code = 'NV05'").get() as Record<string, unknown>;
    assert.deepEqual({ ...u }, { hanet_person_id: 'P5', face_registered: 1, department_id: kt, position: 'Nhân viên', must_change_password: 1 });
    const jobs = app.db.prepare('SELECT u.code, j.op, j.payload FROM sync_jobs j JOIN users u ON u.id = j.entity_id ORDER BY j.id').all() as { code: string; op: string; payload: string }[];
    assert.deepEqual(
      jobs.filter((j) => j.op === 'user.alias').map((j) => [j.code, JSON.parse(j.payload)]),
      [['NV05', { personId: 'P5', code: 'NV05' }], ['NV0001', { personId: 'P6', code: 'NV0001' }], ['NV0002', { personId: 'P7', code: 'NV0002' }]],
    );
    assert.equal(jobs.filter((j) => j.op === 'user.department').length, 4);
    const c = new Client(app.baseUrl);
    assert.equal((await c.post('/api/auth/login', { code: 'NV05', password: r.body.created[0].tempPassword })).status, 200);
    assert.equal((await hr.post('/api/users/import', { persons: [{ personId: 'P5' }] })).status, 400, 'đã nhập rồi thì không còn ai hợp lệ');
  } finally {
    await app.close();
  }
});

test('handler user.alias gọi updateAliasID', async () => {
  const { app, fake, deps, hr } = await setup({ '/person/getListByPlace': pagesRoute([[person('', 'P6')]]), '/person/updateAliasID': ok() });
  try {
    await hr.post('/api/users/import', { persons: [{ personId: 'P6' }] });
    await runDueJobs(deps, SYNC_HANDLERS);
    const p = fake.last('/person/updateAliasID')!.params;
    assert.deepEqual([p.get('personID'), p.get('aliasID')], ['P6', 'NV0001']);
  } finally {
    await app.close();
  }
});

test('chưa cấu hình Hanet → 400; danh sách rỗng → 400', async () => {
  const { app, hr } = await setup({}, false);
  try {
    assert.equal((await hr.get('/api/hanet/persons/unlinked')).status, 400);
    assert.equal((await hr.post('/api/users/import', { persons: [{ personId: 'P1' }] })).status, 400);
    assert.equal((await hr.post('/api/users/import', { persons: [] })).status, 400);
  } finally {
    await app.close();
  }
});

test('aliasID ADMIN không bao giờ thành mã nhân sự: tự sinh NV#### và ghi lại lên Hanet', async () => {
  const { app, hr } = await setup({
    '/person/getListByPlace': pagesRoute([[person('admin', 'P8', 'Giả ADMIN'), person(' Admin ', 'P9')]]),
  });
  try {
    seedUser(app.db, { code: 'ADMIN' }); // như trên host: tài khoản hệ thống đã có, người mang aliasID ADMIN vẫn phải nhập được
    const r = await hr.post('/api/users/import', { persons: [{ personId: 'P8' }, { personId: 'P9' }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.created.map((c: any) => c.code), ['NV0001', 'NV0002']);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM users WHERE code = 'ADMIN'").get()!.n, 1, 'vẫn chỉ có tài khoản hệ thống');
    const jobs = app.db.prepare("SELECT payload FROM sync_jobs WHERE op = 'user.alias' ORDER BY id").all() as { payload: string }[];
    assert.deepEqual(jobs.map((j) => JSON.parse(j.payload)), [{ personId: 'P8', code: 'NV0001' }, { personId: 'P9', code: 'NV0002' }]);
  } finally {
    await app.close();
  }
});
