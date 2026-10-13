import './check-node';
import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { openDb, SchemaVersionError } from './db';
import { createApp } from './app';
import { LoginLimiter } from './auth';
import { DEFAULT_ADMIN_PASSWORD, ensureAdminAccess } from './bootstrap';
import { startJobs } from './jobs';
import type { AppContext } from './context';

const production = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3001;
const dataDir = path.resolve(process.cwd(), 'data');
const backupDir = path.join(dataDir, 'backups');

async function main() {
  const db = openDb(path.join(dataDir, 'attendance.db'));

  const admin = ensureAdminAccess(db, process.env.ADMIN_INITIAL_PASSWORD);
  if (admin) {
    console.log(
      admin.fromEnv
        ? `[BOOTSTRAP] Đã tạo tài khoản ${admin.code} với mật khẩu ADMIN_INITIAL_PASSWORD. Hãy đăng nhập và đổi mật khẩu ngay.`
        : `[BOOTSTRAP] Đã tạo tài khoản ${admin.code} với mật khẩu mặc định ${DEFAULT_ADMIN_PASSWORD}. Hãy đăng nhập và đổi mật khẩu ngay.`,
    );
  }

  const ctx: AppContext = {
    db,
    config: {
      production,
      simulatorEnabled: !production || process.env.ENABLE_SIMULATOR === '1',
      trustProxy: process.env.TRUST_PROXY === '1',
      backupDir,
    },
    limiter: new LoginLimiter(),
    fetch: globalThis.fetch,
    now: () => Date.now(),
  };

  const app = createApp(ctx);
  if (!production) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  startJobs(ctx);
  app.listen(PORT, '0.0.0.0', () => console.log(`[Petrolimex Attendance] Đang chạy tại http://0.0.0.0:${PORT}`));
}

main().catch((err) => {
  if (err instanceof SchemaVersionError) console.error(err.message);
  else console.error('[STARTUP] Không khởi động được:', err);
  process.exit(1);
});
