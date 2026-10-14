import type { Db } from './db';
import type { LoginLimiter } from './auth';
import type { SendMail } from './mail';

export interface AppConfig {
  production: boolean;
  simulatorEnabled: boolean;
  trustProxy: boolean;
  backupDir: string;
  /** Thử đồng bộ Hanet ngay sau khi lưu (production). Test tắt để tự gọi runDueJobs. */
  kickSync: boolean;
}

export interface AppContext {
  db: Db;
  config: AppConfig;
  limiter: LoginLimiter;
  fetch: typeof fetch;
  now: () => number;
  /** Gửi một thư qua SMTP (production: nodemailer; test: hộp thư giả). */
  sendMail: SendMail;
}
