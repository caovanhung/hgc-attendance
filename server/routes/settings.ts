import { Router } from 'express';
import type { AppContext } from '../context';
import { requireGlobalHr } from '../access';
import { getWorkSettings, saveWorkSettings, validateWorkSettings } from '../settings';

export function settingsRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/settings/work', requireGlobalHr, (_req, res) => {
    res.json({ settings: getWorkSettings(db) });
  });

  r.put('/settings/work', requireGlobalHr, (req, res) => {
    saveWorkSettings(db, validateWorkSettings(req.body));
    res.json({ settings: getWorkSettings(db) });
  });

  return r;
}
