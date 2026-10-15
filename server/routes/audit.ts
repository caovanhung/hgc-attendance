import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { currentUser } from '../middleware';
import { isGlobalHr, requireManager } from '../access';
import type { Row } from '../repo';
import { addDays, isValidDate, toVnDate, vnDayStart } from '../vntime';
import type { AuditLogEntry } from '../../shared/types';

export const AUDIT_PAGE_SIZE = 50;

const parse = (s: string | null): unknown => (s === null ? null : JSON.parse(s));

export function auditRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/audit', requireManager, (req, res) => {
    const actor = currentUser(req);
    const today = toVnDate(ctx.now());
    const from = req.query.from === undefined || req.query.from === '' ? addDays(today, -29) : req.query.from;
    const to = req.query.to === undefined || req.query.to === '' ? today : req.query.to;
    if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const where: string[] = ['at >= ?', 'at < ?'];
    const params: (string | number)[] = [new Date(vnDayStart(from)).toISOString(), new Date(vnDayStart(addDays(to, 1))).toISOString()];
    if (typeof req.query.action === 'string' && req.query.action) {
      where.push('action = ?');
      params.push(req.query.action);
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      where.push('(actor_label LIKE ? OR target_label LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    // Quản trị khu: dòng thuộc khu mình, hoặc dòng về chính mình / do mình làm
    if (!isGlobalHr(actor)) {
      const areas = actor.areaIds.length ? `area_id IN (${actor.areaIds.map(() => '?').join(', ')}) OR ` : '';
      where.push(`(${areas}target_user_id = ? OR actor_id = ?)`);
      params.push(...actor.areaIds, actor.id, actor.id);
    }
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const sqlWhere = where.join(' AND ');
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE ${sqlWhere}`).get(...params) as { c: number }).c;
    const rows = db
      .prepare(`SELECT * FROM audit_logs WHERE ${sqlWhere} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, AUDIT_PAGE_SIZE, (page - 1) * AUDIT_PAGE_SIZE) as Row[];
    const entries: AuditLogEntry[] = rows.map((x) => ({
      id: x.id,
      at: x.at,
      actorLabel: x.actor_label,
      ip: x.ip ?? null,
      action: x.action,
      targetLabel: x.target_label ?? null,
      workDate: x.work_date ?? null,
      before: parse(x.before_json ?? null),
      after: parse(x.after_json ?? null),
      reason: x.reason ?? null,
    }));
    res.json({ entries, total, page, pageSize: AUDIT_PAGE_SIZE });
  });

  return r;
}
