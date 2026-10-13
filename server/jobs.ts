import type { AppContext } from './context';
import { backupNow } from './backup';
import { purgeExpiredSessions } from './auth';
import { reconcileEnabled } from './hanet';
import { purgeSightings } from './sightings';
import { purgeDoneJobs, runDueJobs } from './hanet-sync';
import { SYNC_HANDLERS } from './sync-handlers';
import { reconcileDate, type HanetDeps } from './hanet-api';
import { addDays, toVnDate, vnMinutesOfDay } from './vntime';

export interface DueJobs {
  backup: boolean;
  reconcileToday: boolean;
  reconcileYesterday: boolean;
  purgeSessions: boolean;
  purgeHourly: boolean;
}

export function dueJobs(now: number): DueJobs {
  const m = vnMinutesOfDay(now);
  return {
    backup: m === 2 * 60,
    reconcileToday: m % 15 === 0,
    reconcileYesterday: m === 5,
    purgeSessions: m % 60 === 0,
    purgeHourly: m % 60 === 30,
  };
}

export function startJobs(ctx: AppContext): () => void {
  const running = new Set<string>();
  const deps: HanetDeps = { db: ctx.db, fetch: ctx.fetch, now: ctx.now };

  const run = (name: string, fn: () => unknown) => {
    if (running.has(name)) return;
    running.add(name);
    Promise.resolve()
      .then(fn)
      .catch((err) => console.error(`[JOB] ${name} lỗi:`, (err as Error).message))
      .finally(() => running.delete(name));
  };

  let lastMinute = -1;
  const tick = () => {
    const now = ctx.now();
    const minute = Math.floor(now / 60_000);
    if (minute === lastMinute) return;
    lastMinute = minute;
    const due = dueJobs(now);
    const today = toVnDate(now);
    if (due.backup) run('backup', () => backupNow(ctx.db, ctx.config.backupDir, 'daily', now));
    if (due.purgeSessions) run('purge-sessions', () => purgeExpiredSessions(ctx.db, now));
    if (due.purgeHourly) run('purge-sightings', () => purgeSightings(ctx.db, now));
    if (due.purgeHourly) run('purge-sync-jobs', () => purgeDoneJobs(ctx.db, now));
    run('sync', () => runDueJobs(deps, SYNC_HANDLERS));
    if (reconcileEnabled(ctx.db)) {
      if (due.reconcileToday) run('reconcile-today', () => reconcileDate(deps, today));
      if (due.reconcileYesterday) run('reconcile-yesterday', () => reconcileDate(deps, addDays(today, -1)));
    }
  };

  if (reconcileEnabled(ctx.db)) {
    const today = toVnDate(ctx.now());
    run('reconcile-startup', async () => {
      await reconcileDate(deps, addDays(today, -1));
      await reconcileDate(deps, today);
    });
  }

  const timer = setInterval(tick, 20_000);
  timer.unref();
  return () => clearInterval(timer);
}
