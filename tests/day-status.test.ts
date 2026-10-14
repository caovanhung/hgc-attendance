import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser } from './helpers';
import { closeDays, recomputeDay, recomputeUsers } from '../server/attendance';
import { vnDateTimeToTs } from '../server/vntime';
import type { Db } from '../server/db';

const at = (date: string, hhmm: string) => vnDateTimeToTs(date, hhmm);
const row = (db: Db, u: string, d: string) =>
  db.prepare('SELECT status, first_in, last_out, early_minutes, early_arrival_minutes, final FROM attendance_days WHERE user_id = ? AND work_date = ?').get(u, d) as
    | { status: string; first_in: number | null; last_out: number | null; early_minutes: number; early_arrival_minutes: number; final: number }
    | undefined;
function detect(db: Db, u: string, ts: number, now: number): void {
  const d = new Date(ts + 7 * 3_600_000).toISOString().slice(0, 10);
  db.prepare("INSERT INTO detections(user_id, device_id, ts, work_date, source) VALUES (?, 'DEV1', ?, ?, 'webhook')").run(u, ts, d);
  recomputeDay(db, u, d, now);
}

const THU = '2026-10-15'; // thứ 5
test('Review Focus #2: quẹt 14:30 rồi về — trong giờ làm không gắn về sớm; sau 17:00 đóng ngày mới gắn', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' });
  detect(db, u, at(THU, '07:40'), at(THU, '07:40'));
  detect(db, u, at(THU, '14:30'), at(THU, '14:30'));
  let r = row(db, u, THU)!;
  assert.deepEqual([r.status, r.early_minutes, r.final, r.last_out, r.early_arrival_minutes], ['on_time', 0, 0, at(THU, '14:30'), 20]);
  assert.equal(closeDays(db, at(THU, '15:00')) >= 0, true);
  assert.equal(row(db, u, THU)!.final, 0, '15:00 vẫn trong giờ làm');
  closeDays(db, at(THU, '17:15'));
  r = row(db, u, THU)!;
  assert.deepEqual([r.status, r.early_minutes, r.final], ['early_leave', 150, 1]);
});

test('về sớm trong ngưỡng 10 phút: ra 16:55 không về sớm; 16:45 về sớm 15 phút', () => {
  const db = freshDb();
  const a = seedUser(db, { code: 'A' });
  const b = seedUser(db, { code: 'B' });
  const late = at(THU, '18:00');
  for (const [u, out] of [[a, '16:55'], [b, '16:45']] as const) {
    detect(db, u, at(THU, '08:00'), late);
    detect(db, u, at(THU, out), late);
  }
  assert.deepEqual([row(db, a, THU)!.status, row(db, a, THU)!.early_minutes], ['on_time', 0]);
  assert.deepEqual([row(db, b, THU)!.status, row(db, b, THU)!.early_minutes], ['early_leave', 15]);
});

test('vắng: chưa tới giờ ra thì chưa có dòng; qua giờ ra thì absent; quẹt muộn sau đó thay absent', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' });
  closeDays(db, at(THU, '16:59'));
  assert.equal(row(db, u, THU), undefined);
  closeDays(db, at(THU, '17:00'));
  assert.deepEqual({ ...row(db, u, THU)! }, { status: 'absent', first_in: null, last_out: null, early_minutes: 0, early_arrival_minutes: 0, final: 1 });
  detect(db, u, at(THU, '17:30'), at(THU, '17:31'));
  assert.equal(row(db, u, THU)!.status, 'missing_out', 'có lượt quẹt thì không còn vắng');
});

test('Review Focus #3: không vắng vào ngày nghỉ của ca, ngày lễ, trước ngày tạo tài khoản, khi đã nghỉ việc; không vắng cho ADMIN', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' }); // tạo 2026-10-13
  const off = seedUser(db, { code: 'NV02', status: 'inactive' });
  const admin = seedUser(db, { code: 'ADMIN', role: 'hr' });
  db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-16', 'Nghỉ lễ')").run();
  const now = at('2026-10-19', '20:00');
  recomputeUsers(db, [u, off, admin], '2026-10-12', '2026-10-19', now);
  const statuses = (id: string) =>
    (db.prepare('SELECT work_date, status FROM attendance_days WHERE user_id = ? ORDER BY work_date').all(id) as { work_date: string; status: string }[]).map((x) => `${x.work_date}:${x.status}`);
  assert.deepEqual(statuses(u), ['2026-10-13:absent', '2026-10-14:absent', '2026-10-15:absent', '2026-10-19:absent'], '12/10 trước ngày tạo; 16/10 lễ; 17–18 cuối tuần');
  assert.deepEqual(statuses(off), []);
  assert.deepEqual(statuses(admin), []);
});

test('đơn nghỉ phép/công tác đã duyệt: ngày làm việc thành leave/business_trip, có lượt quẹt vẫn giữ giờ, không tính muộn', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' });
  db.prepare("INSERT INTO requests(id, user_id, work_date, end_date, type, reason, status, created_at) VALUES ('r1', ?, '2026-10-15', '2026-10-16', 'business_trip', 'x', 'approved', 'x')").run(u);
  detect(db, u, at(THU, '09:30'), at(THU, '20:00'));
  recomputeUsers(db, [u], '2026-10-15', '2026-10-16', at('2026-10-16', '20:00'));
  assert.deepEqual([row(db, u, THU)!.status, row(db, u, THU)!.first_in], ['business_trip', at(THU, '09:30')]);
  assert.deepEqual([row(db, u, '2026-10-16')!.status, row(db, u, '2026-10-16')!.first_in], ['business_trip', null]);
});
