import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupNow, listBackups, pruneBackups, latestBackup, BACKUP_KEEP } from '../server/backup';
import { openDb } from '../server/db';
import { setSetting, getSetting } from '../server/settings';
import { freshDb, seedUser, seedDepartment, seedArea, startTestApp, loginAs, TEST_PASSWORD, addDetection } from './helpers';
import { addDays, vnDateTimeToTs } from '../server/vntime';
import { enqueue } from '../server/hanet-sync';
import { recordSighting } from '../server/sightings';

const NOW = vnDateTimeToTs('2026-10-13', '02:00');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hgc-bk-'));

test('backupNow tạo bản sao đọc được; bản hằng ngày chỉ tạo một lần mỗi ngày', () => {
  const db = freshDb();
  seedUser(db, { code: 'NV01', password: null });
  const dir = tmp();
  assert.equal(backupNow(db, dir, 'daily', NOW), 'attendance-2026-10-13.db');
  assert.equal(backupNow(db, dir, 'daily', NOW + 60_000), null);
  const copy = openDb(path.join(dir, 'attendance-2026-10-13.db'));
  assert.equal((copy.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 1);
  copy.close();
});

test('bản thủ công đặt tên theo giờ VN và không ghi đè nhau', () => {
  const db = freshDb();
  const dir = tmp();
  const a = backupNow(db, dir, 'manual', NOW)!;
  const b = backupNow(db, dir, 'manual', NOW)!;
  assert.equal(a, 'attendance-2026-10-13-020000-manual.db');
  assert.notEqual(a, b);
  assert.equal(listBackups(dir).length, 2);
  assert.ok(latestBackup(dir));
});

test('pruneBackups giữ 30 bản hằng ngày và 30 bản khác', () => {
  const dir = tmp();
  for (let i = 0; i < 35; i++) {
    const day = addDays('2026-08-01', i); // 2026-08-01 … 2026-09-04
    fs.writeFileSync(path.join(dir, `attendance-${day}.db`), '');
    fs.writeFileSync(path.join(dir, `attendance-${day}-120000-manual.db`), '');
  }
  fs.writeFileSync(path.join(dir, 'ghi-chu.txt'), 'x');
  pruneBackups(dir);
  const names = fs.readdirSync(dir);
  assert.equal(names.filter((n) => /^attendance-\d{4}-\d{2}-\d{2}\.db$/.test(n)).length, BACKUP_KEEP);
  assert.equal(names.filter((n) => n.endsWith('-manual.db')).length, BACKUP_KEEP);
  assert.ok(names.includes('ghi-chu.txt'), 'không đụng tới file khác');
  assert.ok(!names.includes('attendance-2026-08-01.db'), 'xóa bản cũ nhất');
  assert.ok(names.includes('attendance-2026-09-04.db'));
});

test('API sao lưu: chỉ HR; tạo, liệt kê, tải về', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'NV01' });
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.get('/api/admin/backups')).status, 403);
    assert.equal((await nv.post('/api/admin/backups')).status, 403);
    const hr = await loginAs(app, 'ADMIN');
    assert.equal((await hr.get('/api/admin/backups/latest')).status, 404);
    const created = await hr.post('/api/admin/backups');
    assert.equal(created.status, 200);
    assert.match(created.body.backup, /-manual\.db$/);
    assert.equal((await hr.get('/api/admin/backups')).body.backups.length, 1);
    const dl = await fetch(app.baseUrl + '/api/admin/backups/latest', { headers: { Cookie: hr.cookie } });
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get('content-disposition') ?? '', /attachment/);
    assert.ok((await dl.arrayBuffer()).byteLength > 0);
  } finally {
    await app.close();
  }
});

test('xóa dữ liệu: sai mật khẩu 400; đúng thì sao lưu trước, giữ HR và settings', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    const dep = seedDepartment(app.db, 'KT');
    seedArea(app.db, 'KV01');
    const hrId = seedUser(app.db, { code: 'ADMIN', role: 'hr', departmentId: dep });
    const nvId = seedUser(app.db, { code: 'NV01', departmentId: dep });
    addDetection(app.db, nvId, NOW);
    enqueue(app.db, 'user', nvId, 'user.info', {}, NOW);
    recordSighting(app.db, { kind: 'stranger', personId: null, aliasId: null, personName: null, deviceId: 'C1', deviceName: 'C1', ts: NOW, imageUrl: 'https://img/x.jpg' }, NOW);
    setSetting(app.db, 'hanet.webhook_token', 'giu-nguyen');
    const nv = await loginAs(app, 'NV01');
    assert.equal((await nv.post('/api/admin/reset-database', { password: TEST_PASSWORD })).status, 403);

    const hr = await loginAs(app, 'ADMIN');
    assert.equal((await hr.post('/api/admin/reset-database', { password: 'sai' })).status, 400);
    assert.equal((app.db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 2, 'chưa xóa gì');

    const r = await hr.post('/api/admin/reset-database', { password: TEST_PASSWORD });
    assert.equal(r.status, 200);
    assert.match(r.body.backup, /-pre-reset\.db$/);
    const left = app.db.prepare('SELECT id, department_id FROM users').all() as { id: string; department_id: string | null }[];
    assert.deepEqual(left.map((u) => ({ ...u })), [{ id: hrId, department_id: null }]);
    for (const t of ['departments', 'detections', 'attendance_days', 'requests', 'cameras', 'webhook_logs', 'sync_jobs', 'face_sightings', 'areas', 'email_jobs']) {
      assert.equal((app.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c, 0, t);
    }
    assert.equal(getSetting(app.db, 'hanet.webhook_token'), 'giu-nguyen');
    assert.equal((await hr.get('/api/auth/me')).status, 200, 'HR vẫn đăng nhập');

    const backup = openDb(path.join(app.ctx.config.backupDir, r.body.backup));
    assert.equal((backup.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c, 2, 'bản sao lưu có dữ liệu trước khi xóa');
    backup.close();
  } finally {
    await app.close();
  }
});
