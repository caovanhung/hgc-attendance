import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueJobs } from '../server/jobs';
import { vnDateTimeToTs } from '../server/vntime';

const at = (hhmm: string) => vnDateTimeToTs('2026-10-13', hhmm) + 30_000; // giữa phút

test('dueJobs theo giờ VN', () => {
  assert.deepEqual(dueJobs(at('02:00')), { backup: true, reconcileToday: true, reconcileYesterday: false, purgeSessions: true });
  assert.deepEqual(dueJobs(at('02:01')), { backup: false, reconcileToday: false, reconcileYesterday: false, purgeSessions: false });
  assert.equal(dueJobs(at('08:15')).reconcileToday, true);
  assert.equal(dueJobs(at('23:30')).reconcileToday, true);
  assert.equal(dueJobs(at('08:16')).reconcileToday, false);
  assert.equal(dueJobs(at('00:05')).reconcileYesterday, true);
  assert.equal(dueJobs(at('10:00')).purgeSessions, true);
});
