import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser, startTestApp, loginAs } from './helpers';
import { configureHanet } from './fake-hanet';
import { HanetApiError, type HanetDeps } from '../server/hanet-api';
import {
  DEFER_MS, DONE_TTL_MS, MAX_ATTEMPTS, SyncDeferred, enqueue, purgeDoneJobs, retryDelayMs, retryJobs, runDueJobs, syncSummary,
  type SyncHandlers, type SyncJob,
} from '../server/hanet-sync';
import { deleteSetting } from '../server/settings';
import type { Db } from '../server/db';

function setup() {
  const db = freshDb();
  configureHanet(db);
  let now = 1_800_000_000_000;
  const deps: HanetDeps = { db, fetch: (() => Promise.reject(new Error('không gọi mạng'))) as typeof fetch, now: () => now };
  const userId = seedUser(db, { code: 'NV01', name: 'Nguyễn An' });
  return { db, deps, userId, advance: (ms: number) => (now += ms), now: () => now };
}
const job = (db: Db, id = 1) => db.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(id) as Record<string, any>;
const userStatus = (db: Db, id: string) =>
  ({ ...(db.prepare('SELECT hanet_sync_status AS s, hanet_sync_error AS e FROM users WHERE id = ?').get(id) as { s: string; e: string | null }) });

test('thêm việc → đối tượng "pending"; chạy xong → "done" và "synced"', async () => {
  const { db, deps, userId, now } = setup();
  const seen: SyncJob[] = [];
  const handlers: SyncHandlers = { 'user.info': async (_d, j) => void seen.push(j) };
  enqueue(db, 'user', userId, 'user.info', { name: 'Nguyễn An' }, now());
  assert.deepEqual(userStatus(db, userId), { s: 'pending', e: null });
  assert.deepEqual(await runDueJobs(deps, handlers), { done: 1, failed: 0, deferred: 0 });
  assert.equal(seen[0].payload.name, 'Nguyễn An');
  assert.equal(job(db).status, 'done');
  assert.deepEqual(userStatus(db, userId), { s: 'synced', e: null });
});

test('tuần tự theo đối tượng: việc đầu lỗi thì việc sau chờ; đối tượng khác vẫn chạy', async () => {
  const { db, deps, userId, now } = setup();
  const other = seedUser(db, { code: 'NV02' });
  const ran: string[] = [];
  const handlers: SyncHandlers = {
    'user.info': async (_d, j) => {
      ran.push(`${j.entityId}:info`);
      if (j.entityId === userId) throw new HanetApiError(-503, 'Hanet lỗi');
    },
    'user.alias': async (_d, j) => void ran.push(`${j.entityId}:alias`),
  };
  enqueue(db, 'user', userId, 'user.info', {}, now());
  enqueue(db, 'user', userId, 'user.alias', {}, now());
  enqueue(db, 'user', other, 'user.info', {}, now());
  await runDueJobs(deps, handlers);
  assert.deepEqual(ran, [`${userId}:info`, `${other}:info`]);
});

test('lỗi tạm: chờ 1, 2, 5, 15 phút rồi 60 phút; quá 20 lần thì "error"', async () => {
  const { db, deps, userId, now, advance } = setup();
  const handlers: SyncHandlers = { 'user.info': async () => { throw new HanetApiError(-503, 'Hệ thống Hanet đang lỗi (mã -503)'); } };
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(retryDelayMs), [60_000, 120_000, 300_000, 900_000, 3_600_000, 3_600_000]);
  enqueue(db, 'user', userId, 'user.info', {}, now());
  await runDueJobs(deps, handlers);
  assert.equal(job(db).attempts, 1);
  assert.equal(job(db).next_run_at, now() + 60_000);
  assert.deepEqual(await runDueJobs(deps, handlers), { done: 0, failed: 0, deferred: 0 }, 'chưa đến hạn thì không chạy');
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    advance(retryDelayMs(i));
    await runDueJobs(deps, handlers);
  }
  assert.equal(job(db).attempts, MAX_ATTEMPTS);
  assert.equal(job(db).status, 'error');
  assert.deepEqual(userStatus(db, userId), { s: 'error', e: 'Hệ thống Hanet đang lỗi (mã -503)' });
});

test('lỗi vĩnh viễn → "error" ngay; thiếu handler → "error"', async () => {
  const { db, deps, userId, now } = setup();
  enqueue(db, 'user', userId, 'user.info', {}, now());
  await runDueJobs(deps, { 'user.info': async () => { throw new HanetApiError(-2035, 'Không có quyền (mã -2035)'); } });
  assert.equal(job(db).status, 'error');
  assert.equal(job(db).attempts, 1);
  enqueue(db, 'department', 'dep-x', 'dept.update', {}, now());
  await runDueJobs(deps, {});
  assert.equal(job(db, 2).status, 'error');
  assert.equal(job(db, 2).last_error, 'Chưa hỗ trợ thao tác dept.update');
});

test('SyncDeferred: không tính lần thử, hẹn 5 phút, giữ "pending"', async () => {
  const { db, deps, userId, now } = setup();
  enqueue(db, 'user', userId, 'user.department', {}, now());
  const r = await runDueJobs(deps, { 'user.department': async () => { throw new SyncDeferred('Chờ đăng ký FaceID'); } });
  assert.deepEqual(r, { done: 0, failed: 0, deferred: 1 });
  assert.equal(job(db).attempts, 0);
  assert.equal(job(db).status, 'pending');
  assert.equal(job(db).next_run_at, now() + DEFER_MS);
  assert.deepEqual(userStatus(db, userId), { s: 'pending', e: 'Chờ đăng ký FaceID' });
});

test('gộp: sửa nhiều lần trước khi chạy chỉ giữ một việc với dữ liệu mới nhất', () => {
  const { db, userId, now } = setup();
  enqueue(db, 'user', userId, 'user.info', { name: 'A' }, now());
  enqueue(db, 'user', userId, 'user.info', { name: 'B' }, now());
  const rows = db.prepare('SELECT payload FROM sync_jobs').all() as { payload: string }[];
  assert.deepEqual(rows.map((r) => JSON.parse(r.payload).name), ['B']);
});

test('xóa thắng: thêm việc xóa thì bỏ các việc đang chờ của đối tượng', () => {
  const { db, userId, now } = setup();
  enqueue(db, 'user', userId, 'user.info', {}, now());
  enqueue(db, 'user', userId, 'user.department', {}, now());
  enqueue(db, 'user', userId, 'user.remove', { code: 'NV01' }, now());
  assert.deepEqual((db.prepare('SELECT op FROM sync_jobs').all() as { op: string }[]).map((r) => r.op), ['user.remove']);
});

test('chưa cấu hình Hanet: giữ "pending", không tính lần thử', async () => {
  const { db, deps, userId, now } = setup();
  deleteSetting(db, 'hanet.client_id');
  enqueue(db, 'user', userId, 'user.info', {}, now());
  let called = false;
  assert.deepEqual(await runDueJobs(deps, { 'user.info': async () => void (called = true) }), { done: 0, failed: 0, deferred: 0 });
  assert.equal(called, false);
  assert.equal(job(db).attempts, 0);
});

test('Review Focus #4: hai lượt chạy cùng lúc chỉ gọi handler một lần', async () => {
  const { db, deps, userId, now } = setup();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const handlers: SyncHandlers = { 'user.info': async () => { calls++; await gate; } };
  enqueue(db, 'user', userId, 'user.info', {}, now());
  const a = runDueJobs(deps, handlers);
  const b = runDueJobs(deps, handlers);
  release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(job(db).status, 'done');
});

test('thử lại việc lỗi, tổng quan đồng bộ, dọn việc "done" cũ', async () => {
  const { db, deps, userId, now, advance } = setup();
  enqueue(db, 'user', userId, 'user.info', {}, now());
  await runDueJobs(deps, { 'user.info': async () => { throw new HanetApiError(-2035, 'Không có quyền'); } });
  const s = syncSummary(db);
  assert.equal(s.error, 1);
  assert.equal(s.pending, 0);
  assert.deepEqual({ op: s.errors[0].op, label: s.errors[0].label, lastError: s.errors[0].lastError }, { op: 'user.info', label: 'Nguyễn An (NV01)', lastError: 'Không có quyền' });
  assert.equal(retryJobs(db, { entityType: 'user', entityId: userId }, now()), 1);
  assert.deepEqual({ status: job(db).status, attempts: job(db).attempts }, { status: 'pending', attempts: 0 });
  assert.deepEqual(userStatus(db, userId).s, 'pending');
  await runDueJobs(deps, { 'user.info': async () => {} });
  advance(DONE_TTL_MS + 1);
  assert.equal(purgeDoneJobs(db, now()), 1);
});

test('API tổng quan và thử lại: chỉ HR', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const nv = seedUser(app.db, { code: 'NV01' });
    enqueue(app.db, 'user', nv, 'user.info', {}, Date.now());
    app.db.prepare("UPDATE sync_jobs SET status = 'error', last_error = 'x'").run();
    const hr = await loginAs(app, 'HR01');
    assert.deepEqual((await hr.get('/api/hanet/sync')).body.error, 1);
    const r = await hr.post('/api/hanet/sync/retry', {});
    assert.equal(r.body.error, 0);
    assert.equal(r.body.pending, 1);
    assert.equal((await (await loginAs(app, 'NV01')).get('/api/hanet/sync')).status, 403);
  } finally {
    await app.close();
  }
});
