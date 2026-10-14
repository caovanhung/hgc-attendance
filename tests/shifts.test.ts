import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedArea, seedDepartment, seedUser } from './helpers';
import { effectiveShift, isHoliday, isoWeekday, isWorkday, parseWorkDays, validateShiftInput, DEFAULT_SHIFT_NAME } from '../server/shifts';
import { saveWorkSettings, DEFAULT_WORK_SETTINGS } from '../server/settings';
import type { Db } from '../server/db';

function addShift(db: Db, id: string, areaId: string, name: string, start = '07:00', end = '19:00', days = '1,2,3,4,5,6,7'): void {
  db.prepare(
    `INSERT INTO shifts(id, area_id, name, work_start, work_end, work_days, late_grace_minutes, early_arrival_minutes, early_leave_minutes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 15, 15, 10, '2026-10-14')`,
  ).run(id, areaId, name, start, end, days);
}

test('isoWeekday và parseWorkDays', () => {
  assert.equal(isoWeekday('2026-10-12'), 1, 'thứ 2');
  assert.equal(isoWeekday('2026-10-18'), 7, 'chủ nhật');
  assert.deepEqual(parseWorkDays('5,1,3'), [1, 3, 5]);
});

test('effectiveShift: ca riêng > ca phòng > ca mặc định; ca khác khu bị bỏ qua (Review Focus #5)', () => {
  const db = freshDb();
  const A = seedArea(db, 'KV01');
  const B = seedArea(db, 'KV02');
  addShift(db, 'sA', A, 'Cửa hàng A');
  addShift(db, 'sA2', A, 'Ca riêng A', '09:00', '18:00');
  addShift(db, 'sB', B, 'Kho B', '06:00', '14:00');
  const pa = seedDepartment(db, 'PA', 'PA', A);
  const pb = seedDepartment(db, 'PB', 'PB', B);
  db.prepare("UPDATE departments SET shift_id = 'sA' WHERE id = ?").run(pa);
  const u = seedUser(db, { code: 'NV01', departmentId: pa });
  assert.equal(effectiveShift(db, u).shiftId, 'sA');
  db.prepare("UPDATE users SET shift_id = 'sA2' WHERE id = ?").run(u);
  assert.deepEqual([effectiveShift(db, u).shiftId, effectiveShift(db, u).workStart], ['sA2', 9 * 60]);
  // chuyển sang phòng khu B (chưa có ca): ca riêng sA2 thuộc khu A bị bỏ qua → ca mặc định
  db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(pb, u);
  const r = effectiveShift(db, u);
  assert.deepEqual([r.shiftId, r.name, r.workStart, r.workEnd], [null, DEFAULT_SHIFT_NAME, 8 * 60, 17 * 60]);
  db.prepare("UPDATE departments SET shift_id = 'sB' WHERE id = ?").run(pb);
  assert.equal(effectiveShift(db, u).shiftId, 'sB');
  const noDept = seedUser(db, { code: 'NV02' });
  assert.equal(effectiveShift(db, noDept).shiftId, null);
});

test('ngày làm việc: theo thứ của ca và ngày lễ', () => {
  const db = freshDb();
  const u = seedUser(db, { code: 'NV01' });
  const rule = effectiveShift(db, u);
  assert.equal(isWorkday(db, rule, '2026-10-16'), true, 'thứ 6');
  assert.equal(isWorkday(db, rule, '2026-10-17'), false, 'thứ 7');
  db.prepare("INSERT INTO holidays(date, name) VALUES ('2026-10-16', 'Nghỉ bù')").run();
  assert.equal(isHoliday(db, '2026-10-16'), true);
  assert.equal(isWorkday(db, rule, '2026-10-16'), false);
  saveWorkSettings(db, { ...DEFAULT_WORK_SETTINGS, workDays: [1, 2, 3, 4, 5, 6] });
  assert.equal(isWorkday(db, effectiveShift(db, u), '2026-10-17'), true, 'ca mặc định làm thêm thứ 7');
});

test('validateShiftInput', () => {
  const ok = { name: ' Cửa hàng ', workStart: '07:00', workEnd: '19:00', workDays: [1, 2, 3, 4, 5, 6, 7], lateGraceMinutes: 15, earlyArrivalMinutes: 15, earlyLeaveMinutes: 10 };
  assert.deepEqual(validateShiftInput(ok), { ...ok, name: 'Cửa hàng' });
  for (const bad of [
    { name: '' },
    { workStart: '7h' },
    { workEnd: '06:00' },
    { workDays: [] },
    { workDays: [0, 8] },
    { lateGraceMinutes: -1 },
    { earlyArrivalMinutes: 121 },
    { earlyLeaveMinutes: 1.5 },
  ]) {
    assert.throws(() => validateShiftInput({ ...ok, ...bad }), (e: any) => e.status === 400, JSON.stringify(bad));
  }
});
