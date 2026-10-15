import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok, type Reply } from './fake-hanet';
import { setSetting } from '../server/settings';
import { recordSighting } from '../server/sightings';
import type { HanetPerson } from '../shared/types';

const PLACE2 = 777001;
const person = (aliasID: string, personID: string, name = `Người ${personID}`): HanetPerson => ({
  aliasID,
  personID,
  name,
  avatar: `https://static.hanet.ai/face/${personID}.jpg`,
  title: 'Nhân viên',
});

/** Mỗi địa điểm một danh sách; trang 2 trở đi rỗng. */
const byPlace =
  (lists: Record<number, HanetPerson[]>): Reply =>
  (p: URLSearchParams) =>
    ok(Number(p.get('page')) === 1 ? (lists[Number(p.get('placeID'))] ?? []) : []);

async function setup(routes: Record<string, Reply>) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  configureHanet(app.db);
  setSetting(app.db, 'hanet.place_ids', JSON.stringify([PLACE, PLACE2]));
  const a1 = seedArea(app.db, 'KV1');
  const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  seedUser(app.db, { code: 'QK01', role: 'area_admin', adminAreaIds: [a1] });
  seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: d1 });
  seedUser(app.db, { code: 'NV01', departmentId: d1, hanetPersonId: 'P1' });
  return { app, fake };
}

const LISTS = { [PLACE]: [person('NV01', 'P1'), person('', 'P2', 'Khách cũ')], [PLACE2]: [person('NV77', 'P3', 'Nguyễn Kho'), person('', 'P2', 'Khách cũ')] };

test('danh sách chưa liên kết đọc mọi địa điểm đã chọn, không trùng người', async () => {
  const { app, fake } = await setup({ '/person/getListByPlace': byPlace(LISTS) });
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.get('/api/hanet/persons/unlinked');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.persons.map((p: HanetPerson) => p.personID).sort(), ['P2', 'P3']);
    const places = new Set(fake.calls.filter((c) => c.path === '/person/getListByPlace').map((c) => c.params.get('placeID')));
    assert.deepEqual([...places].sort(), [String(PLACE), String(PLACE2)].sort());
  } finally {
    await app.close();
  }
});

test('HR xóa FaceID chưa liên kết: gọi Camera AI theo Person ID, ghi nhật ký có lý do', async () => {
  const { app, fake } = await setup({ '/person/getListByPlace': byPlace(LISTS), '/person/removePersonByID': ok(null) });
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.req('DELETE', '/api/hanet/persons/P3', { reason: 'Nhân viên đã nghỉ từ lâu' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(fake.last('/person/removePersonByID')!.params.get('personID'), 'P3');
    const log = app.db.prepare("SELECT actor_label, target_label, before_json, reason FROM audit_logs WHERE action = 'face.delete'").get() as Record<string, string>;
    assert.equal(log.actor_label, 'HR01 (HR01)');
    assert.match(log.target_label, /Nguyễn Kho/);
    assert.deepEqual(JSON.parse(log.before_json), { personId: 'P3', aliasId: 'NV77', name: 'Nguyễn Kho' });
    assert.equal(log.reason, 'Nhân viên đã nghỉ từ lâu');
  } finally {
    await app.close();
  }
});

test('xóa FaceID: người đã liên kết 400, không có trên Camera AI 404, thiếu lý do 400, quản trị khu và trưởng phòng 403', async () => {
  const { app, fake } = await setup({ '/person/getListByPlace': byPlace(LISTS), '/person/removePersonByID': ok(null) });
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.req('DELETE', '/api/hanet/persons/P1', { reason: 'Đã liên kết rồi' })).status, 400);
    assert.equal((await hr.req('DELETE', '/api/hanet/persons/P404', { reason: 'Không tồn tại' })).status, 404);
    assert.equal((await hr.req('DELETE', '/api/hanet/persons/P3', { reason: 'abc' })).status, 400);
    assert.equal((await (await loginAs(app, 'QK01')).req('DELETE', '/api/hanet/persons/P3', { reason: 'Quản trị khu' })).status, 403);
    assert.equal((await (await loginAs(app, 'TP01')).req('DELETE', '/api/hanet/persons/P3', { reason: 'Trưởng phòng' })).status, 403);
    assert.equal(fake.last('/person/removePersonByID'), undefined);
    assert.equal((app.db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'face.delete'").get() as { c: number }).c, 0);
  } finally {
    await app.close();
  }
});

test('Camera AI báo lỗi khi xóa ⇒ 502, không ghi nhật ký', async () => {
  const { app } = await setup({ '/person/getListByPlace': byPlace(LISTS), '/person/removePersonByID': fail(-1, 'Lỗi máy chủ') });
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.req('DELETE', '/api/hanet/persons/P3', { reason: 'Thử khi Camera AI lỗi' });
    assert.equal(r.status, 502);
    assert.match(r.body.error, /Không xóa được FaceID/);
    assert.equal((app.db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'face.delete'").get() as { c: number }).c, 0);
  } finally {
    await app.close();
  }
});

test('xóa FaceID chưa liên kết ⇒ ảnh chụp tạm của người đó không còn trong "Lấy từ camera"', async () => {
  const { app } = await setup({ '/person/getListByPlace': byPlace(LISTS), '/person/removePersonByID': ok(null) });
  try {
    const now = Date.now();
    recordSighting(app.db, { kind: 'unlinked', personId: 'P3', aliasId: 'NV77', personName: 'Nguyễn Kho', deviceId: 'C1', deviceName: 'Cửa', ts: now, imageUrl: 'https://img/p3.jpg' }, now);
    const hr = await loginAs(app, 'HR01');
    assert.deepEqual((await hr.get('/api/hanet/sightings')).body.sightings.map((s: { personId: string }) => s.personId), ['P3']);
    assert.equal((await hr.req('DELETE', '/api/hanet/persons/P3', { reason: 'Đã nghỉ việc lâu' })).status, 200);
    assert.deepEqual((await hr.get('/api/hanet/sightings')).body.sightings, []);
  } finally {
    await app.close();
  }
});

test('xóa nhân sự đã có FaceID ⇒ ảnh chụp tạm theo Person ID của người đó cũng bị xóa', async () => {
  const { app } = await setup({ '/person/getListByPlace': byPlace(LISTS) });
  try {
    const now = Date.now();
    const id = seedUser(app.db, { code: 'NV50', hanetPersonId: 'P50' });
    recordSighting(app.db, { kind: 'unlinked', personId: 'P50', aliasId: 'NV50', personName: 'X', deviceId: 'C1', deviceName: 'Cửa', ts: now, imageUrl: 'https://img/p50.jpg' }, now);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.del(`/api/users/${id}`)).status, 200);
    assert.deepEqual((await hr.get('/api/hanet/sightings')).body.sightings, []);
  } finally {
    await app.close();
  }
});
