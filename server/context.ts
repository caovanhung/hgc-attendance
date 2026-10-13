import type { Db } from './db';
import type { LoginLimiter } from './auth';

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
}
