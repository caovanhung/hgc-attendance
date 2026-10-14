import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, toDaySettings, type ComputeDayInput } from '../server/attendance';
import { vnDateTimeToTs } from '../server/vntime';

const D = '2026-10-13';
const at = (hhmm: string, seconds = 0) => vnDateTimeToTs(D, hhmm) + seconds * 1000;
const settings = toDaySettings({
  workStart: '08:00',
  lateGraceMinutes: 15,
  workEnd: '17:00',
  minOutGapMinutes: 30,
  workDays: [1, 2, 3, 4, 5],
  earlyArrivalMinutes: 15,
  earlyLeaveMinutes: 10,
});
const input = (detectionTs: number[], extra: Partial<ComputeDayInput> = {}): ComputeDayInput => ({
  detectionTs,
  settings,
  lateExcused: false,
  manualIn: null,
  manualOut: null,
  closed: true,
  ...extra,
});

test('không có lượt nào và không có điều chỉnh → null', () => {
  assert.equal(computeDay(input([])), null);
});

test('vào 08:15, ra 17:00 → đúng giờ', () => {
  const r = computeDay(input([at('08:15'), at('17:00')]))!;
  assert.equal(r.status, 'on_time');
  assert.equal(r.lateMinutes, 0);
  assert.equal(r.earlyMinutes, 0);
  assert.equal(r.firstIn, at('08:15'));
  assert.equal(r.lastOut, at('17:00'));
  assert.equal(r.detectionCount, 2);
});

test('vào 08:15:59 vẫn đúng giờ (tính theo phút)', () => {
  assert.equal(computeDay(input([at('08:15', 59), at('17:00')]))!.status, 'on_time');
});

test('vào 08:16 → muộn 16 phút (tính từ 08:00)', () => {
  const r = computeDay(input([at('08:16'), at('17:00')]))!;
  assert.equal(r.status, 'late');
  assert.equal(r.lateMinutes, 16);
});

test('chỉ một lượt → thiếu giờ ra, vẫn ghi phút muộn', () => {
  const r = computeDay(input([at('08:30')]))!;
  assert.equal(r.status, 'missing_out');
  assert.equal(r.lastOut, null);
  assert.equal(r.lateMinutes, 30);
});

test('hai lượt cách 29 phút → thiếu giờ ra; cách 30 phút → có giờ ra', () => {
  assert.equal(computeDay(input([at('08:00'), at('08:29')]))!.status, 'missing_out');
  const r = computeDay(input([at('08:00'), at('08:30')]))!;
  assert.equal(r.lastOut, at('08:30'));
  assert.equal(r.status, 'early_leave');
});

test('ra 16:50 → trong ngưỡng 10 phút, không về sớm; ra 16:49 → về sớm 11 phút', () => {
  assert.equal(computeDay(input([at('07:55'), at('12:00'), at('16:50')]))!.status, 'on_time');
  const r = computeDay(input([at('07:55'), at('12:00'), at('16:49')]))!;
  assert.deepEqual([r.status, r.earlyMinutes], ['early_leave', 11]);
});

test('muộn và về sớm', () => {
  const r = computeDay(input([at('08:30'), at('16:40')]))!;
  assert.equal(r.status, 'late_and_early');
  assert.equal(r.lateMinutes, 30);
  assert.equal(r.earlyMinutes, 20);
});

test('đã được duyệt giải trình → không tính muộn', () => {
  const r = computeDay(input([at('08:30'), at('17:05')], { lateExcused: true }))!;
  assert.equal(r.status, 'on_time');
  assert.equal(r.lateMinutes, 0);
});

test('manualIn thay giờ vào, giờ ra lấy lượt cuối', () => {
  const r = computeDay(input([at('17:30')], { manualIn: at('08:00') }))!;
  assert.equal(r.firstIn, at('08:00'));
  assert.equal(r.lastOut, at('17:30'));
  assert.equal(r.status, 'on_time');
  assert.equal(r.detectionCount, 1);
});

test('manualOut bổ sung giờ ra', () => {
  const r = computeDay(input([at('08:00')], { manualOut: at('17:00') }))!;
  assert.equal(r.lastOut, at('17:00'));
  assert.equal(r.status, 'on_time');
});

test('manualIn khi không có lượt nào → thiếu giờ ra', () => {
  const r = computeDay(input([], { manualIn: at('08:00') }))!;
  assert.equal(r.status, 'missing_out');
  assert.equal(r.detectionCount, 0);
});

test('chưa qua giờ ra (closed = false) → không gắn về sớm, final = false', () => {
  const r = computeDay(input([at('08:00'), at('14:30')], { closed: false }))!;
  assert.deepEqual([r.status, r.earlyMinutes, r.final], ['on_time', 0, false]);
});

test('đến trước 07:45 → ghi đi sớm, vẫn đúng giờ', () => {
  const r = computeDay(input([at('07:30'), at('17:00')]))!;
  assert.deepEqual([r.status, r.earlyArrivalMinutes], ['on_time', 30]);
  assert.equal(computeDay(input([at('07:45'), at('17:00')]))!.earlyArrivalMinutes, 0);
});
