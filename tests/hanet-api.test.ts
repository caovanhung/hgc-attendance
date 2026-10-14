import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser, startTestApp, loginAs, Client } from './helpers';
import { reconcileDate, callApi, refreshAccessToken, HanetApiError, PAGE_SIZE, OAUTH_TOKEN_URL, type HanetDeps } from '../server/hanet-api';
import { getSetting, setSetting } from '../server/settings';
import { getWebhookToken } from '../server/hanet';
import { vnDateTimeToTs } from '../server/vntime';
import type { Db } from '../server/db';

const D = '2026-10-13';
const T = (hhmm: string) => vnDateTimeToTs(D, hhmm);
const NOW = T('23:30');

interface FakeOpts {
  pages: Record<string, unknown>[][];
  expireFirst?: boolean;
  refreshFails?: boolean;
}

function fakeHanet(opts: FakeOpts) {
  const calls: { url: string; params: URLSearchParams }[] = [];
  let expired = Boolean(opts.expireFirst);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const params = new URLSearchParams(String(init?.body ?? ''));
    calls.push({ url: u, params });
    if (u === OAUTH_TOKEN_URL) {
      if (opts.refreshFails) return json({ error: 'invalid_grant' });
      expired = false;
      return json({ access_token: 'new-token', refresh_token: 'new-refresh' });
    }
    if (u.endsWith('/person/getCheckinByPlaceIdInTimestamp')) {
      if (expired) return json({ returnCode: -103, returnMessage: 'ACCESS_TOKEN_EXPIRE' });
      return json({ returnCode: 1, returnMessage: 'SUCCESS', data: opts.pages[Number(params.get('page')) - 1] ?? [] });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const item = (alias: string, ts: number, device = 'C20371B239') => ({
  personName: 'X', date: D, checkinTime: ts, aliasID: alias, placeID: '143', personID: `p-${alias}`,
  avatar: 'https://img/x.jpg', place: 'Trụ sở', title: '', type: 0, deviceID: device, deviceName: 'Cửa chính',
});

function configure(db: Db) {
  setSetting(db, 'hanet.client_id', 'cid');
  setSetting(db, 'hanet.client_secret', 'csecret');
  setSetting(db, 'hanet.access_token', 'old-token');
  setSetting(db, 'hanet.refresh_token', 'old-refresh');
  setSetting(db, 'hanet.place_ids', '[143]');
}

const count = (db: Db) => (db.prepare('SELECT COUNT(*) AS c FROM detections').get() as { c: number }).c;

test('phân trang: kéo đến khi trang < PAGE_SIZE, gửi đúng tham số', async () => {
  const db = freshDb();
  configure(db);
  seedUser(db, { code: 'NV01', password: null });
  const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => item('NV01', T('08:00') + i * 1000));
  const page2 = [item('NV01', T('17:00')), item('NV01', T('17:01')), item('KHONG-CO', T('17:02'))];
  const fake = fakeHanet({ pages: [page1, page2] });
  const deps: HanetDeps = { db, fetch: fake.fetchImpl, now: () => NOW };
  const s = await reconcileDate(deps, D);
  assert.deepEqual(s, { inserted: PAGE_SIZE + 2, duplicates: 0, ignored: 1 });
  assert.equal(fake.calls.length, 2);
  const p = fake.calls[0].params;
  assert.equal(fake.calls[0].url, 'https://partner.hanet.ai/person/getCheckinByPlaceIdInTimestamp');
  assert.equal(p.get('token'), 'old-token');
  assert.equal(p.get('placeID'), '143');
  assert.equal(p.get('from'), String(vnDateTimeToTs(D, '00:00')));
  assert.equal(p.get('to'), String(NOW), 'không kéo quá thời điểm hiện tại');
  assert.equal(p.get('type'), '0');
  assert.equal(p.get('size'), String(PAGE_SIZE));
  assert.ok(getSetting(db, 'hanet.last_reconcile_at'));
});

test('token hết hạn (-103) → refresh một lần rồi thử lại, lưu token mới', async () => {
  const db = freshDb();
  configure(db);
  seedUser(db, { code: 'NV01', password: null });
  const fake = fakeHanet({ pages: [[item('NV01', T('08:00'))]], expireFirst: true });
  const s = await reconcileDate({ db, fetch: fake.fetchImpl, now: () => NOW }, D);
  assert.equal(s.inserted, 1);
  assert.deepEqual(fake.calls.map((c) => c.url.endsWith('/token')), [false, true, false]);
  const refresh = fake.calls[1].params;
  assert.equal(refresh.get('grant_type'), 'refresh_token');
  assert.equal(refresh.get('refresh_token'), 'old-refresh');
  assert.equal(fake.calls[2].params.get('token'), 'new-token');
  assert.equal(getSetting(db, 'hanet.access_token'), 'new-token');
  assert.equal(getSetting(db, 'hanet.refresh_token'), 'new-refresh');
});

test('refresh thất bại → ném lỗi và lưu last_reconcile_error', async () => {
  const db = freshDb();
  configure(db);
  const fake = fakeHanet({ pages: [], expireFirst: true, refreshFails: true });
  await assert.rejects(reconcileDate({ db, fetch: fake.fetchImpl, now: () => NOW }, D));
  assert.match(getSetting(db, 'hanet.last_reconcile_error')!, /Kết nối Camera AI hỏng/);
});

test('lượt đã có từ webhook không bị ghi trùng khi đối soát', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    configure(app.db);
    seedUser(app.db, { code: 'NV01', password: null });
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    await new Client(app.baseUrl).post(`/api/hanet/webhook/${getWebhookToken(app.db)}`, { aliasID: 'NV01', deviceID: 'C20371B239', time: T('08:00') });
    const fake = fakeHanet({ pages: [[item('NV01', T('08:00')), item('NV01', T('17:30'))]] });
    app.ctx.fetch = fake.fetchImpl;
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/hanet/reconcile', { date: D });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.summary, { inserted: 1, duplicates: 1, ignored: 0 });
    assert.equal(count(app.db), 2);
    assert.equal(r.body.config.lastReconcileError, null);
  } finally {
    await app.close();
  }
});

test('route đối soát: nhân viên 403, chưa cấu hình 400, Hanet lỗi 502', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    seedUser(app.db, { code: 'NV01' });
    assert.equal((await (await loginAs(app, 'NV01')).post('/api/hanet/reconcile', {})).status, 403);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/hanet/reconcile', {})).status, 400);
    configure(app.db);
    app.ctx.fetch = fakeHanet({ pages: [], expireFirst: true, refreshFails: true }).fetchImpl;
    const r = await hr.post('/api/hanet/reconcile', { date: D });
    assert.equal(r.status, 502);
    assert.match(r.body.error, /^Đối soát thất bại/);
  } finally {
    await app.close();
  }
});

test('nhiều lời gọi cùng gặp -103 → chỉ một lần làm mới token', async () => {
  const db = freshDb();
  configure(db);
  let oauth = 0;
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const params = new URLSearchParams(String(init?.body ?? ''));
    if (String(url) === OAUTH_TOKEN_URL) {
      oauth++;
      await new Promise((r) => setTimeout(r, 20));
      return json({ access_token: 'new-token' });
    }
    if (params.get('token') !== 'new-token') return json({ returnCode: -103, returnMessage: 'ACCESS_TOKEN_EXPIRE' });
    return json({ returnCode: 1, returnMessage: 'SUCCESS', data: [] });
  }) as typeof fetch;
  const deps: HanetDeps = { db, fetch: fetchImpl, now: () => NOW };
  await Promise.all([callApi(deps, '/place/getPlaces', {}), callApi(deps, '/place/getPlaces', {}), callApi(deps, '/place/getPlaces', {})]);
  assert.equal(oauth, 1);
  // xong rồi thì lần -103 sau làm mới lại được
  setSetting(db, 'hanet.access_token', 'old-token');
  await callApi(deps, '/place/getPlaces', {});
  assert.equal(oauth, 2);
});

test('làm mới token hỏng (HTTP 4xx, thiếu access_token, thiếu cấu hình) → lỗi tạm, thông báo theo §9', async () => {
  const cases: [string, (db: Db) => void, Response | null][] = [
    ['HTTP 400', () => {}, new Response('{"error":"invalid_grant"}', { status: 400 })],
    ['thiếu access_token', () => {}, new Response('{"error":"invalid_grant"}', { status: 200 })],
    ['thiếu cấu hình', (db) => setSetting(db, 'hanet.client_secret', ''), null],
  ];
  for (const [name, prep, reply] of cases) {
    const db = freshDb();
    configure(db);
    prep(db);
    const fetchImpl = (async () => reply!.clone()) as typeof fetch;
    await assert.rejects(refreshAccessToken({ db, fetch: fetchImpl, now: () => NOW }), (err: unknown) => {
      assert.ok(err instanceof HanetApiError, name);
      assert.equal(err.transient, true, name);
      assert.match(err.message, /^Kết nối Camera AI hỏng, kiểm tra Client ID\/Secret\/Refresh Token/, name);
      return true;
    });
  }
});
