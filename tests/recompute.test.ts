import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recomputeDay, applyDayAdjustment, recomputeRange } from '../server/attendance';
import { saveWorkSettings } from '../server/settings';
import { vnDateTimeToTs } from '../server/vntime';
import { freshDb, seedUser, addDetection } from './helpers';

const D = '2026-10-13';
const at = (hhmm: string, date = D) => vnDateTimeToTs(date, hhmm);
type DayRow = { first_in: number | null; last_out: number | null; late_minutes: number; early_minutes: number; status: string; late_excused: number; manual_in: number | null; manual_out: number | null; detection_count: number };
const day = (db: ReturnType<typeof freshDb>, userId: string, date = D) =>
  db.prepare('SELECT * FROM attendance_days WHERE user_id = ? AND work_date = ?').get(userId, date) as DayRow | undefined;

test('lượt nhận diện tạo và cập nhật dòng ngày công', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  addDetection(db, u, at('08:30'));
  assert.equal(day(db, u)!.status, 'missing_out');
  addDetection(db, u, at('17:10'));
  const r = day(db, u)!;
  assert.equal(r.status, 'late');
  assert.equal(r.late_minutes, 30);
  assert.equal(r.first_in, at('08:30'));
  assert.equal(r.last_out, at('17:10'));
  assert.equal(r.detection_count, 2);
});

test('applyDayAdjustment: giải trình muộn và giữ cờ khi tính lại', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  addDetection(db, u, at('08:30'));
  addDetection(db, u, at('17:10'));
  applyDayAdjustment(db, u, D, { lateExcused: true });
  assert.equal(day(db, u)!.status, 'on_time');
  addDetection(db, u, at('17:20'));
  const r = day(db, u)!;
  assert.equal(r.late_excused, 1);
  assert.equal(r.status, 'on_time');
});

test('applyDayAdjustment: quên quẹt khi chưa có lượt nào tạo dòng mới', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  applyDayAdjustment(db, u, D, { manualIn: at('08:00'), manualOut: at('17:00') });
  const r = day(db, u)!;
  assert.equal(r.status, 'on_time');
  assert.equal(r.manual_in, at('08:00'));
  assert.equal(r.detection_count, 0);
});

test('recomputeDay xóa dòng khi người đã nghỉ việc không còn lượt nào; người đang làm thành absent', () => {
  const db = freshDb();
  const off = seedUser(db, { code: 'NV01', status: 'inactive' });
  addDetection(db, off, at('08:00'));
  db.prepare('DELETE FROM detections').run();
  recomputeDay(db, off, D, at('18:00'));
  assert.equal(day(db, off), undefined, 'người đã nghỉ việc không có dòng');

  const active = seedUser(db, { code: 'NV02' });
  recomputeDay(db, active, D, at('18:00'));
  assert.equal(day(db, active)!.status, 'absent', 'người đang làm thành absent sau giờ ra');
});

test('recomputeRange áp dụng giờ làm mới cho khoảng ngày', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  addDetection(db, u, at('08:10', '2026-10-12'));
  addDetection(db, u, at('17:00', '2026-10-12'));
  addDetection(db, u, at('08:10', '2026-10-14'));
  addDetection(db, u, at('17:00', '2026-10-14'));
  saveWorkSettings(db, {
    workStart: '08:00',
    lateGraceMinutes: 5,
    workEnd: '17:00',
    minOutGapMinutes: 30,
    workDays: [1, 2, 3, 4, 5],
    earlyArrivalMinutes: 15,
    earlyLeaveMinutes: 10,
  });
  assert.equal(recomputeRange(db, '2026-10-12', '2026-10-13'), 2);
  assert.equal(day(db, u, '2026-10-12')!.status, 'late');
  assert.equal(day(db, u, '2026-10-13')!.status, 'absent');
  assert.equal(day(db, u, '2026-10-14')!.status, 'on_time', 'ngoài khoảng thì giữ nguyên');
});

test('production: lượt từ mô phỏng không được tính công', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01', password: null });
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    addDetection(db, u, at('08:00'), { source: 'simulator' });
    assert.equal(day(db, u)!.status, 'absent');
    assert.equal(day(db, u)!.detection_count, 0);
    addDetection(db, u, at('08:05'), { source: 'webhook' });
    assert.equal(day(db, u)!.detection_count, 1);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
