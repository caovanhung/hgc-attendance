import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSetting, setSetting, deleteSetting, getWorkSettings, saveWorkSettings, validateWorkSettings, DEFAULT_WORK_SETTINGS } from '../server/settings';
import { HttpError } from '../server/errors';
import { freshDb } from './helpers';

test('get/set/delete setting', () => {
  const db = freshDb();
  assert.equal(getSetting(db, 'x'), undefined);
  setSetting(db, 'x', '1');
  setSetting(db, 'x', '2');
  assert.equal(getSetting(db, 'x'), '2');
  deleteSetting(db, 'x');
  assert.equal(getSetting(db, 'x'), undefined);
});

test('giờ làm mặc định và lưu lại', () => {
  const db = freshDb();
  assert.deepEqual(getWorkSettings(db), DEFAULT_WORK_SETTINGS);
  assert.deepEqual(DEFAULT_WORK_SETTINGS, {
    workStart: '08:00',
    lateGraceMinutes: 15,
    workEnd: '17:00',
    minOutGapMinutes: 30,
    workDays: [1, 2, 3, 4, 5],
    earlyArrivalMinutes: 15,
    earlyLeaveMinutes: 10,
  });
  const ws = {
    workStart: '07:30',
    lateGraceMinutes: 10,
    workEnd: '16:30',
    minOutGapMinutes: 60,
    workDays: [1, 2, 3, 4, 5],
    earlyArrivalMinutes: 15,
    earlyLeaveMinutes: 10,
  };
  saveWorkSettings(db, ws);
  assert.deepEqual(getWorkSettings(db), ws);
});

test('validateWorkSettings từ chối dữ liệu sai', () => {
  const ok = {
    workStart: '08:00',
    lateGraceMinutes: 15,
    workEnd: '17:00',
    minOutGapMinutes: 30,
    workDays: [1, 2, 3, 4, 5],
    earlyArrivalMinutes: 15,
    earlyLeaveMinutes: 10,
  };
  assert.deepEqual(validateWorkSettings(ok), ok);
  assert.deepEqual(validateWorkSettings({ ...ok, lateGraceMinutes: '15' }), ok, 'chấp nhận số dạng chuỗi');
  // Thiếu ba trường mới -> nhận giá trị mặc định
  assert.deepEqual(
    validateWorkSettings({ workStart: '08:00', lateGraceMinutes: 15, workEnd: '17:00', minOutGapMinutes: 30 }),
    ok,
    'thiếu ba trường mới trả về mặc định',
  );
  assert.throws(
    () => validateWorkSettings({ ...ok, workDays: [] }),
    (e: unknown) => e instanceof HttpError && e.status === 400,
    'workDays rỗng',
  );
  for (const bad of [
    { ...ok, workStart: '25:00' },
    { ...ok, workEnd: '07:00' },
    { ...ok, workEnd: '08:00' },
    { ...ok, lateGraceMinutes: -1 },
    { ...ok, lateGraceMinutes: 121 },
    { ...ok, lateGraceMinutes: 1.5 },
    { ...ok, minOutGapMinutes: 0 },
    null,
  ]) {
    assert.throws(() => validateWorkSettings(bad), (e: unknown) => e instanceof HttpError && e.status === 400, JSON.stringify(bad));
  }
});
