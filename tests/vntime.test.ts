import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toVnDate, vnMinutesOfDay, parseHHmm, isValidDate, vnDateTimeToTs, vnDayStart, addDays, daysBetween } from '../server/vntime';

test('00:30 giờ VN (17:30 UTC hôm trước) thuộc ngày VN', () => {
  const ts = Date.UTC(2026, 9, 12, 17, 30); // 2026-10-12 17:30 UTC = 2026-10-13 00:30 VN
  assert.equal(toVnDate(ts), '2026-10-13');
  assert.equal(vnMinutesOfDay(ts), 30);
});

test('vnDateTimeToTs là nghịch đảo của toVnDate/vnMinutesOfDay', () => {
  const ts = vnDateTimeToTs('2026-10-13', '08:00');
  assert.equal(ts, Date.UTC(2026, 9, 13, 1, 0));
  assert.equal(toVnDate(ts), '2026-10-13');
  assert.equal(vnMinutesOfDay(ts), 480);
  assert.equal(vnDayStart('2026-10-13'), Date.UTC(2026, 9, 12, 17, 0));
});

test('parseHHmm', () => {
  assert.equal(parseHHmm('00:00'), 0);
  assert.equal(parseHHmm('08:15'), 495);
  assert.equal(parseHHmm('23:59'), 1439);
  for (const bad of ['24:00', '8:15', '08:60', 'abc', '']) assert.throws(() => parseHHmm(bad), bad);
});

test('isValidDate', () => {
  assert.equal(isValidDate('2026-10-13'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-1-3'), false);
  assert.equal(isValidDate(undefined), false);
  assert.equal(isValidDate(20261013), false);
});

test('addDays và daysBetween', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(daysBetween('2026-10-01', '2026-10-13'), 12);
});

test('kết quả không phụ thuộc biến TZ của process', () => {
  const ts = Date.UTC(2026, 9, 12, 17, 30);
  const original = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const a = [toVnDate(ts), vnMinutesOfDay(ts), vnDateTimeToTs('2026-10-13', '08:00')];
    process.env.TZ = 'America/New_York';
    const b = [toVnDate(ts), vnMinutesOfDay(ts), vnDateTimeToTs('2026-10-13', '08:00')];
    assert.deepEqual(a, b);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
