import { Router } from 'express';
import type { AppContext } from '../context';
import { ah, HttpError } from '../errors';
import { requireSystemAdmin } from '../middleware';
import { requireGlobalHr } from '../access';
import { classifyMailError, getMailConfigView, getSmtpConfig, saveMailConfig } from '../mail';
import { testMail } from '../mail-templates';

export function mailRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/settings/mail', requireGlobalHr, (_req, res) => {
    res.json(getMailConfigView(db, ctx.now()));
  });

  r.put('/settings/mail', requireSystemAdmin, (req, res) => {
    saveMailConfig(db, req.body);
    res.json(getMailConfigView(db, ctx.now()));
  });

  r.post(
    '/settings/mail/test',
    requireSystemAdmin,
    ah(async (req, res) => {
      const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'Email nhận thư thử không hợp lệ');
      const cfg = getSmtpConfig(db);
      if (!cfg) {
        res.json({ ok: false, message: 'Chưa cấu hình đủ máy chủ, tài khoản, mật khẩu và email người gửi' });
        return;
      }
      try {
        await ctx.sendMail(cfg, testMail(to));
        res.json({ ok: true, message: `Đã gửi thư thử tới ${to}` });
      } catch (err) {
        res.json({ ok: false, message: classifyMailError(err).message });
      }
    }),
  );

  return r;
}
