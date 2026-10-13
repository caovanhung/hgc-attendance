import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok } from './fake-hanet';
import { HanetApiError, callApi, hanetApi, isTransientError, type HanetDeps } from '../server/hanet-api';

function deps(routes: Parameters<typeof fakeHanet>[0]) {
  const db = freshDb();
  configureHanet(db);
  const fake = fakeHanet(routes);
  const d: HanetDeps = { db, fetch: fake.fetchImpl, now: () => Date.now() };
  return { d, fake };
}

test('callApi gửi token, có timeout, trả body khi returnCode = 1', async () => {
  const { d, fake } = deps({ '/profile/getProfile': ok({ name: 'Hùng', email: 'a@b.c', id: 1 }) });
  const body = await callApi(d, '/profile/getProfile', {});
  assert.equal(body.data.name, 'Hùng');
  const c = fake.calls[0];
  assert.equal(c.params.get('token'), 'tok');
  assert.ok(c.signal instanceof AbortSignal, 'phải có AbortSignal để timeout');
});

test('mã lỗi vĩnh viễn và lỗi tạm', async () => {
  const { d } = deps({ '/a': fail(-9006), '/b': fail(-503), '/c': fail(-4242, 'lạ') });
  await assert.rejects(callApi(d, '/a', {}), (e: unknown) => {
    assert.ok(e instanceof HanetApiError);
    assert.equal(e.returnCode, -9006);
    assert.equal(e.transient, false);
    assert.equal(e.message, 'Ảnh không đạt: cần rõ mặt, một người, nhìn thẳng, không mũ, không khẩu trang (mã -9006)');
    return true;
  });
  await assert.rejects(callApi(d, '/b', {}), (e: unknown) => e instanceof HanetApiError && e.transient === true);
  await assert.rejects(callApi(d, '/c', {}), (e: unknown) => e instanceof HanetApiError && e.transient && /Hanet trả lỗi -4242: lạ/.test(e.message));
});

test('HTTP 5xx là lỗi tạm, HTTP 404 là lỗi vĩnh viễn', async () => {
  const { d } = deps({ '/x': new Response('bad gateway', { status: 502 }) });
  await assert.rejects(callApi(d, '/x', {}), (e: unknown) => e instanceof HanetApiError && e.transient && e.returnCode === 502);
  await assert.rejects(callApi(d, '/khong-co', {}), (e: unknown) => e instanceof HanetApiError && !e.transient && e.returnCode === 404);
});

test('Review Focus #1: HTTP 200 nhưng nội dung HTML → lỗi tạm, không ném lỗi lạ', async () => {
  const { d } = deps({ '/html': new Response('<html>bảo trì</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) });
  await assert.rejects(callApi(d, '/html', {}), (e: unknown) => e instanceof HanetApiError && e.transient && /không đọc được/.test(e.message));
});

test('lỗi mạng là lỗi tạm', async () => {
  const { d } = deps({
    '/net': () => {
      throw new TypeError('fetch failed');
    },
  });
  const err = await callApi(d, '/net', {}).catch((e) => e);
  assert.ok(err instanceof TypeError);
  assert.equal(isTransientError(err), true);
});

test('hanetApi: phòng ban, trạng thái camera, đăng ký khuôn mặt', async () => {
  const { d, fake } = deps({
    '/department/list': ok({ count: '1', hits: [{ id: 5132, name: 'Kế toán', placeId: '998833' }], totals: '1' }),
    '/department/create': ok({ id: 6687, name: 'IT' }),
    '/device/getConnectionStatus': ok({ C1: true, C2: false }),
    '/person/registerByUrl': ok({ personID: '1889724440081326080', aliasID: 'NV01' }),
  });
  assert.deepEqual(await hanetApi.listDepartments(d, PLACE, 'Kế toán'), [{ id: 5132, name: 'Kế toán' }]);
  assert.equal(fake.last('/department/list')!.params.get('keyword'), 'Kế toán');
  assert.equal(await hanetApi.createDepartment(d, PLACE, 'IT', ''), 6687);
  assert.deepEqual(await hanetApi.connectionStatus(d, ['C1', 'C2']), { C1: true, C2: false });
  assert.equal(fake.last('/device/getConnectionStatus')!.params.get('deviceIDs'), 'C1,C2');
  const before = fake.calls.length;
  assert.deepEqual(await hanetApi.connectionStatus(d, []), {});
  assert.equal(fake.calls.length, before, 'danh sách rỗng thì không gọi Hanet');
  assert.equal(await hanetApi.registerByUrl(d, { name: 'A', aliasId: 'NV01', placeId: PLACE, url: 'https://img/1.jpg', title: '' }), '1889724440081326080');
  const reg = fake.last('/person/registerByUrl')!.params;
  assert.equal(reg.get('placeID'), String(PLACE));
  assert.equal(reg.get('type'), '0');
});
