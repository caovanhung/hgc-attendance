import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs } from './helpers';
import { PLACE, configureHanet, fail, fakeHanet, ok, type Reply } from './fake-hanet';

async function setup(routes: Record<string, Reply>, configured = true) {
  const fake = fakeHanet(routes);
  const app = await startTestApp({ fetch: fake.fetchImpl });
  if (configured) configureHanet(app.db);
  seedUser(app.db, { code: 'ADMIN', role: 'hr' });
  return { app, fake, hr: await loginAs(app, 'ADMIN') };
}

test('kiểm tra kết nối: trả tài khoản và danh sách địa điểm', async () => {
  const { app, hr } = await setup({
    '/profile/getProfile': ok({ name: 'Dương Đức Văn', email: 'x@y.z', id: 1 }),
    '/place/getPlaces': ok([{ id: PLACE, name: 'HRINTER', address: 'B36', userID: 1 }]),
  });
  try {
    const r = await hr.post('/api/hanet/test-connection', {});
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      ok: true,
      account: { name: 'Dương Đức Văn', email: 'x@y.z' },
      places: [{ id: PLACE, name: 'HRINTER', address: 'B36' }],
      message: 'Đã kết nối tài khoản Dương Đức Văn, 1 địa điểm',
    });
  } finally {
    await app.close();
  }
});

test('kiểm tra kết nối: Hanet báo lỗi → ok=false kèm lý do, không phải 500', async () => {
  const { app, hr } = await setup({ '/profile/getProfile': fail(-2035) });
  try {
    const r = await hr.post('/api/hanet/test-connection', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, false);
    assert.match(r.body.message, /không có quyền/);
    assert.deepEqual(r.body.places, []);
  } finally {
    await app.close();
  }
});

test('kiểm tra kết nối: chưa nhập thông tin thì không gọi Hanet', async () => {
  const { app, hr, fake } = await setup({}, false);
  try {
    const r = await hr.post('/api/hanet/test-connection', {});
    assert.equal(r.body.ok, false);
    assert.equal(r.body.message, 'Chưa nhập Client ID và Refresh Token (hoặc Access Token)');
    assert.equal(fake.calls.length, 0);
  } finally {
    await app.close();
  }
});
