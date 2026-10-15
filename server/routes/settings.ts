import { Router } from 'express';
import type { AppContext } from '../context';
import { requireGlobalHr } from '../access';
import { getWorkSettings, saveWorkSettings, validateWorkSettings } from '../settings';
import { recomputeForShiftChange } from '../attendance';
import { usersOnDefaultShift } from './shifts';
import { tx } from '../db';
import { actorOf, writeAudit } from '../audit';

export function settingsRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/settings/work', requireGlobalHr, (_req, res) => {
    res.json({ settings: getWorkSettings(db) });
  });

  r.put('/settings/work', requireGlobalHr, (req, res) => {
    const before = getWorkSettings(db);
    const after = validateWorkSettings(req.body);
    tx(db, () => {
      saveWorkSettings(db, after);
      writeAudit(db, ctx.now(), { ...actorOf(req), action: 'settings.work', targetLabel: 'Ca mặc định công ty', before, after });
    });
    // Ca mặc định đổi: tính lại từ đầu tháng cho người đang dùng ca mặc định
    const recomputed = recomputeForShiftChange(db, usersOnDefaultShift(db), ctx.now());
    res.json({ settings: getWorkSettings(db), recomputed });
  });

  return r;
}
