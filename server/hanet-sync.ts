import type { Db } from './db';
import { tx } from './db';
import type { AppContext } from './context';
import { HanetApiError, isTransientError, type HanetDeps } from './hanet-api';
import { reconcileEnabled } from './hanet';
import type { SyncEntity, SyncJobView, SyncOp, SyncSummary } from '../shared/types';

/** Handler ném khi phụ thuộc chưa sẵn sàng (chưa có FaceID, phòng ban chưa lên Hanet...). Không tính lần thử. */
export class SyncDeferred extends Error {}

export interface SyncJob {
  id: number;
  entityType: SyncEntity;
  entityId: string;
  op: SyncOp;
  payload: Record<string, any>;
  attempts: number;
}
export type SyncHandler = (deps: HanetDeps, job: SyncJob) => Promise<void>;
export type SyncHandlers = Partial<Record<SyncOp, SyncHandler>>;

export const RETRY_DELAYS_MIN = [1, 2, 5, 15];
export const RETRY_LATER_MIN = 60;
export const MAX_ATTEMPTS = 20;
export const DEFER_MS = 5 * 60_000;
export const DONE_TTL_MS = 7 * 24 * 60 * 60_000;
const RUN_LIMIT = 50;

/** Gộp: sửa nhiều lần trước khi chạy chỉ giữ dữ liệu mới nhất. */
const COALESCE = new Set<SyncOp>(['user.info', 'dept.update', 'camera.rename']);
/** Xóa thắng: thêm việc xóa thì bỏ các việc đang chờ của đối tượng. */
const REMOVE = new Set<SyncOp>(['user.remove', 'dept.remove']);
const STATUS_TABLE: Partial<Record<SyncEntity, string>> = { user: 'users', department: 'departments' };

export function retryDelayMs(attempts: number): number {
  return (RETRY_DELAYS_MIN[attempts - 1] ?? RETRY_LATER_MIN) * 60_000;
}

/** Việc đang chạy (theo DB) để job mỗi phút và lần thử ngay không chạy trùng một việc. */
const claimed = new WeakMap<Db, Set<number>>();
function claimSet(db: Db): Set<number> {
  let s = claimed.get(db);
  if (!s) {
    s = new Set();
    claimed.set(db, s);
  }
  return s;
}

export function refreshEntityStatus(db: Db, entityType: SyncEntity, entityId: string): void {
  const table = STATUS_TABLE[entityType];
  if (!table) return;
  const c = db
    .prepare(
      `SELECT SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS e, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS p
       FROM sync_jobs WHERE entity_type = ? AND entity_id = ?`,
    )
    .get(entityType, entityId) as { e: number | null; p: number | null };
  const status = Number(c.e ?? 0) > 0 ? 'error' : Number(c.p ?? 0) > 0 ? 'pending' : 'synced';
  const last = db
    .prepare(
      `SELECT last_error FROM sync_jobs WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'error') AND last_error IS NOT NULL
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
    )
    .get(entityType, entityId) as { last_error: string } | undefined;
  db.prepare(`UPDATE ${table} SET hanet_sync_status = ?, hanet_sync_error = ? WHERE id = ?`).run(
    status,
    status === 'synced' ? null : (last?.last_error ?? null),
    entityId,
  );
}

export function enqueue(db: Db, entityType: SyncEntity, entityId: string, op: SyncOp, payload: Record<string, unknown>, now: number): void {
  tx(db, () => {
    if (REMOVE.has(op)) dropEntityJobs(db, entityType, entityId);
    if (COALESCE.has(op)) {
      const busy = [...claimSet(db)];
      const notBusy = busy.length ? ` AND id NOT IN (${busy.map(() => '?').join(', ')})` : '';
      const r = db
        .prepare(
          `UPDATE sync_jobs SET payload = ?, updated_at = ?
           WHERE entity_type = ? AND entity_id = ? AND op = ? AND status = 'pending' AND attempts = 0${notBusy}`,
        )
        .run(JSON.stringify(payload), now, entityType, entityId, op, ...busy);
      if (Number(r.changes) > 0) {
        refreshEntityStatus(db, entityType, entityId);
        return;
      }
    }
    db.prepare(
      `INSERT INTO sync_jobs(entity_type, entity_id, op, payload, status, attempts, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    ).run(entityType, entityId, op, JSON.stringify(payload), now, now, now);
    refreshEntityStatus(db, entityType, entityId);
  });
}

/** Bỏ mọi việc chưa xong của đối tượng (dùng khi xóa đối tượng chưa từng lên Hanet). */
export function dropEntityJobs(db: Db, entityType: SyncEntity, entityId: string): void {
  db.prepare("DELETE FROM sync_jobs WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'error')").run(entityType, entityId);
}

export function wakeEntity(db: Db, entityType: SyncEntity, entityId: string, now: number): void {
  db.prepare("UPDATE sync_jobs SET next_run_at = ? WHERE entity_type = ? AND entity_id = ? AND status = 'pending'").run(now, entityType, entityId);
}

export function wakeOp(db: Db, op: SyncOp, now: number): void {
  db.prepare("UPDATE sync_jobs SET next_run_at = ? WHERE op = ? AND status = 'pending'").run(now, op);
}

function toJob(r: Record<string, any>): SyncJob {
  return { id: r.id, entityType: r.entity_type, entityId: r.entity_id, op: r.op, payload: JSON.parse(r.payload), attempts: r.attempts };
}

/** Việc đứng đầu hàng của mỗi đối tượng (id nhỏ nhất còn pending/error), đã đến hạn. */
const HEAD_SQL = `SELECT j.* FROM sync_jobs j
  WHERE j.status = 'pending' AND j.next_run_at <= ?
    AND j.id = (SELECT MIN(k.id) FROM sync_jobs k WHERE k.entity_type = j.entity_type AND k.entity_id = j.entity_id AND k.status IN ('pending', 'error'))`;

type RunResult = 'done' | 'failed' | 'deferred';

async function runJob(deps: HanetDeps, handlers: SyncHandlers, job: SyncJob): Promise<RunResult> {
  const { db } = deps;
  let result: RunResult;
  try {
    const handler = handlers[job.op];
    if (!handler) throw Object.assign(new Error(`Chưa hỗ trợ thao tác ${job.op}`), { permanent: true });
    await handler(deps, job);
    db.prepare("UPDATE sync_jobs SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ?").run(deps.now(), job.id);
    result = 'done';
  } catch (err) {
    const now = deps.now();
    const message = (err as Error).message;
    if (err instanceof SyncDeferred) {
      db.prepare('UPDATE sync_jobs SET next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?').run(now + DEFER_MS, message, now, job.id);
      result = 'deferred';
    } else {
      const attempts = job.attempts + 1;
      const permanent = Boolean((err as { permanent?: boolean }).permanent) || !isTransientError(err);
      if (permanent || attempts >= MAX_ATTEMPTS) {
        db.prepare("UPDATE sync_jobs SET status = 'error', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?").run(attempts, message, now, job.id);
      } else {
        db.prepare('UPDATE sync_jobs SET attempts = ?, next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?').run(
          attempts,
          now + retryDelayMs(attempts),
          message,
          now,
          job.id,
        );
      }
      const code = err instanceof HanetApiError ? err.returnCode : 'network';
      console.warn(`[SYNC] op=${job.op} entity=${job.entityType}:${job.entityId} code=${code}`);
      result = 'failed';
    }
  }
  refreshEntityStatus(db, job.entityType, job.entityId);
  return result;
}

async function runClaimed(deps: HanetDeps, handlers: SyncHandlers, row: Record<string, any>): Promise<RunResult | null> {
  const claims = claimSet(deps.db);
  if (claims.has(row.id)) return null;
  claims.add(row.id);
  try {
    return await runJob(deps, handlers, toJob(row));
  } finally {
    claims.delete(row.id);
  }
}

export async function runDueJobs(deps: HanetDeps, handlers: SyncHandlers, limit = RUN_LIMIT): Promise<{ done: number; failed: number; deferred: number }> {
  const out = { done: 0, failed: 0, deferred: 0 };
  if (!reconcileEnabled(deps.db)) return out;
  const rows = deps.db.prepare(`${HEAD_SQL} ORDER BY j.id LIMIT ?`).all(deps.now(), limit) as Record<string, any>[];
  for (const row of rows) {
    const r = await runClaimed(deps, handlers, row);
    if (r) out[r]++;
  }
  return out;
}

/** Chạy liên tiếp các việc đến hạn của một đối tượng (thử ngay sau khi HR lưu). */
export async function runEntityJobs(deps: HanetDeps, handlers: SyncHandlers, entityType: SyncEntity, entityId: string): Promise<void> {
  if (!reconcileEnabled(deps.db)) return;
  for (let i = 0; i < 10; i++) {
    const row = deps.db
      .prepare(`${HEAD_SQL} AND j.entity_type = ? AND j.entity_id = ? LIMIT 1`)
      .get(deps.now(), entityType, entityId) as Record<string, any> | undefined;
    if (!row || (await runClaimed(deps, handlers, row)) !== 'done') return;
  }
}

function depsOf(ctx: AppContext): HanetDeps {
  return { db: ctx.db, fetch: ctx.fetch, now: ctx.now };
}

/** Thử đồng bộ ngay một đối tượng, không chờ (production). */
export function kickEntity(ctx: AppContext, entityType: SyncEntity, entityId: string): void {
  if (!ctx.config.kickSync) return;
  // import động để tránh vòng phụ thuộc hanet-sync ↔ sync-handlers
  void import('./sync-handlers')
    .then(({ SYNC_HANDLERS }) => runEntityJobs(depsOf(ctx), SYNC_HANDLERS, entityType, entityId))
    .catch((err) => console.error('[SYNC] lỗi chạy ngay:', (err as Error).message));
}

export function kickAll(ctx: AppContext): void {
  if (!ctx.config.kickSync) return;
  void import('./sync-handlers')
    .then(({ SYNC_HANDLERS }) => runDueJobs(depsOf(ctx), SYNC_HANDLERS))
    .catch((err) => console.error('[SYNC] lỗi chạy hàng đợi:', (err as Error).message));
}

export function retryJobs(db: Db, filter: { jobId?: number; entityType?: SyncEntity; entityId?: string }, now: number): number {
  const where: string[] = ["status = 'error'"];
  const params: (string | number)[] = [];
  if (filter.jobId !== undefined) {
    where.push('id = ?');
    params.push(filter.jobId);
  }
  if (filter.entityType && filter.entityId) {
    where.push('entity_type = ? AND entity_id = ?');
    params.push(filter.entityType, filter.entityId);
  }
  const affected = db.prepare(`SELECT DISTINCT entity_type, entity_id FROM sync_jobs WHERE ${where.join(' AND ')}`).all(...params) as {
    entity_type: SyncEntity;
    entity_id: string;
  }[];
  const r = db
    .prepare(`UPDATE sync_jobs SET status = 'pending', attempts = 0, next_run_at = ?, updated_at = ? WHERE ${where.join(' AND ')}`)
    .run(now, now, ...params);
  for (const a of affected) refreshEntityStatus(db, a.entity_type, a.entity_id);
  return Number(r.changes);
}

function labelOf(db: Db, type: SyncEntity, id: string, payload: Record<string, any>): string {
  if (type === 'user') {
    const u = db.prepare('SELECT name, code FROM users WHERE id = ?').get(id) as { name: string; code: string } | undefined;
    if (u) return `${u.name} (${u.code})`;
  } else {
    const row = db.prepare(`SELECT name FROM ${type === 'department' ? 'departments' : 'cameras'} WHERE id = ?`).get(id) as
      | { name: string }
      | undefined;
    if (row) return row.name;
  }
  return String(payload.name ?? payload.code ?? id);
}

export function syncSummary(db: Db): SyncSummary {
  const c = db
    .prepare(
      `SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS p, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS e FROM sync_jobs`,
    )
    .get() as { p: number | null; e: number | null };
  const rows = db.prepare("SELECT * FROM sync_jobs WHERE status = 'error' ORDER BY updated_at DESC, id DESC LIMIT 50").all() as Record<string, any>[];
  const errors: SyncJobView[] = rows.map((r) => {
    const payload = JSON.parse(r.payload);
    return {
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      op: r.op,
      label: labelOf(db, r.entity_type, r.entity_id, payload),
      attempts: r.attempts,
      lastError: r.last_error ?? null,
      updatedAt: r.updated_at,
    };
  });
  return { pending: Number(c.p ?? 0), error: Number(c.e ?? 0), errors };
}

export function purgeDoneJobs(db: Db, now: number): number {
  return Number(db.prepare("DELETE FROM sync_jobs WHERE status = 'done' AND updated_at < ?").run(now - DONE_TTL_MS).changes);
}
