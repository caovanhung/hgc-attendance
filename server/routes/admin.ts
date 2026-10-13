import { Router } from 'express';
import type { AppContext } from '../context';
import { tx } from '../db';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { verifyPassword } from '../auth';
import { backupNow, latestBackup, listBackups } from '../backup';

export function adminRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const dir = ctx.config.backupDir;
  const r = Router();
  const hr = requireRole('hr');

  r.get('/admin/backups', hr, (_req, res) => {
    res.json({ backups: listBackups(dir) });
  });

  r.post('/admin/backups', hr, (_req, res) => {
    res.json({ backup: backupNow(db, dir, 'manual', ctx.now()) });
  });

  r.get('/admin/backups/latest', hr, (_req, res) => {
    const file = latestBackup(dir);
    if (!file) throw new HttpError(404, 'Chưa có bản sao lưu nào');
    res.download(file);
  });

  r.post('/admin/reset-database', hr, (req, res) => {
    const actor = currentUser(req);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.id) as { password_hash: string | null } | undefined;
    const password = req.body?.password;
    if (typeof password !== 'string' || !verifyPassword(password, row?.password_hash)) {
      throw new HttpError(400, 'Mật khẩu không đúng');
    }
    const backup = backupNow(db, dir, 'pre-reset', ctx.now());
    tx(db, () => {
      for (const table of ['detections', 'attendance_days', 'requests', 'webhook_logs', 'cameras', 'sync_jobs', 'face_sightings']) db.exec(`DELETE FROM ${table}`);
      db.prepare('UPDATE users SET department_id = NULL WHERE id = ?').run(actor.id);
      db.exec('UPDATE departments SET manager_id = NULL');
      db.prepare('DELETE FROM users WHERE id != ?').run(actor.id);
      db.exec('DELETE FROM departments');
    });
    console.warn(`[SECURITY] database_reset by=${actor.code} backup=${backup} ip=${req.ip}`);
    res.json({ success: true, backup });
  });

  return r;
}
