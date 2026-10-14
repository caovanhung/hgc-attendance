import { Router } from 'express';
import type { AppContext } from '../context';
import { requireGlobalHr } from '../access';
import { getWorkSettings, saveWorkSettings, validateWorkSettings } from '../settings';
import { monthToDate, recomputeUsers } from '../attendance';
import { allStaffIds } from './shifts';

export function settingsRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/settings/work', requireGlobalHr, (_req, res) => {
    res.json({ settings: getWorkSettings(db) });
  });

  r.put('/settings/work', requireGlobalHr, (req, res) => {
    saveWorkSettings(db, validateWorkSettings(req.body));
    // Ca mặc định đổi: tính lại từ đầu tháng cho mọi người (người có ca riêng/ca phòng tính lại không đổi gì)
    const { from, to } = monthToDate(ctx.now());
    const recomputed = recomputeUsers(db, allStaffIds(db), from, to, ctx.now());
    res.json({ settings: getWorkSettings(db), recomputed });
  });

  return r;
}
