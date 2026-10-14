import './check-node';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { openDb, SchemaTooNewError, SchemaVersionError } from './db';
import { MigrationError } from './migrations';
import { createApp } from './app';
import { LoginLimiter } from './auth';
import { DEFAULT_ADMIN_PASSWORD, ensureAdminAccess } from './bootstrap';
import { startJobs } from './jobs';
import { nodemailerSend } from './mail';
import type { AppContext } from './context';

const production = process.env.NODE_ENV === 'production';
const defaultPort = production ? 3001 : 3000;
const PORT = process.env.PORT && process.env.PORT !== '8080' ? Number(process.env.PORT) : defaultPort;
const dataDir = path.resolve(process.cwd(), 'data');
const backupDir = path.join(dataDir, 'backups');

/** Chạy thử nâng cấp (MIGRATE_ONLY=1): mở bản sao DB_FILE, nâng cấp nếu cần, in phiên bản rồi thoát — không chạy server/job. */
function migrateOnly(): void {
  if (!process.env.DB_FILE) {
    console.error('[MIGRATE] Chế độ chạy thử (MIGRATE_ONLY=1) cần biến DB_FILE trỏ tới bản sao database.');
    process.exit(1);
  }
  const file = path.resolve(process.env.DB_FILE);
  if (!fs.existsSync(file)) {
    console.error(`[MIGRATE] Không tìm thấy file database: ${file}`);
    process.exit(1);
  }
  const db = openDb(file, { backupDir: path.join(path.dirname(file), 'backups') });
  const { version } = db.prepare('SELECT version FROM schema_version').get() as { version: number };
  db.close();
  console.log(`[MIGRATE] Chạy thử xong: database v${version}`);
  process.exit(0);
}

async function main() {
  if (process.env.MIGRATE_ONLY === '1') return migrateOnly();
  const db = openDb(path.join(dataDir, 'attendance.db'), { backupDir });

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
      kickSync: true,
    },
    limiter: new LoginLimiter(),
    fetch: globalThis.fetch,
    now: () => Date.now(),
    sendMail: nodemailerSend,
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
  if (err instanceof SchemaVersionError || err instanceof SchemaTooNewError || err instanceof MigrationError) console.error(err.message);
  else console.error('[STARTUP] Không khởi động được:', err);
  process.exit(1);
});
