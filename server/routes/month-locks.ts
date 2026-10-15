import { Router } from 'express';
import type { AppContext } from '../context';
import { tx } from '../db';
import { HttpError } from '../errors';
import { requireRole } from '../middleware';
import { requireGlobalHr } from '../access';
import { actorOf, writeAudit } from '../audit';
import { isValidMonth, lockOf, monthLabel } from '../month-lock';
import { toVnDate } from '../vntime';
import type { MonthLock } from '../../shared/types';

export function monthLockRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/month-locks', requireRole('hr', 'area_admin', 'dept_manager'), (req, res) => {
    const year = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year) ? req.query.year : toVnDate(ctx.now()).slice(0, 4);
    const rows = db.prepare('SELECT month FROM month_locks WHERE month LIKE ? ORDER BY month').all(`${year}-%`) as { month: string }[];
    const locks: MonthLock[] = rows.map((x) => lockOf(db, x.month)!);
    res.json({ locks });
  });

  r.post('/month-locks/:month', requireGlobalHr, (req, res) => {
    const month = req.params.month;
    if (!isValidMonth(month)) throw new HttpError(400, 'Tháng không hợp lệ (định dạng YYYY-MM)');
    if (month > toVnDate(ctx.now()).slice(0, 7)) throw new HttpError(400, 'Không thể khóa sổ tháng chưa tới');
    if (lockOf(db, month)) throw new HttpError(409, `Tháng ${monthLabel(month)} đã khóa sổ rồi`);
    const a = actorOf(req);
    tx(db, () => {
      db.prepare('INSERT INTO month_locks(month, locked_by, locked_by_label, locked_at) VALUES (?, ?, ?, ?)').run(
        month,
        a.actorId,
        a.actorLabel,
        new Date(ctx.now()).toISOString(),
      );
      writeAudit(db, ctx.now(), { ...a, action: 'month.lock', targetLabel: `Tháng ${monthLabel(month)}` });
    });
    res.json({ lock: lockOf(db, month) });
  });

  r.delete('/month-locks/:month', requireGlobalHr, (req, res) => {
    const month = req.params.month;
    if (!isValidMonth(month)) throw new HttpError(400, 'Tháng không hợp lệ (định dạng YYYY-MM)');
    if (!lockOf(db, month)) throw new HttpError(404, `Tháng ${monthLabel(month)} chưa khóa sổ`);
    const a = actorOf(req);
    tx(db, () => {
      db.prepare('DELETE FROM month_locks WHERE month = ?').run(month);
      writeAudit(db, ctx.now(), { ...a, action: 'month.unlock', targetLabel: `Tháng ${monthLabel(month)}` });
    });
    res.json({ success: true });
  });

  return r;
}
