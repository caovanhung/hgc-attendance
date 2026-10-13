import type { Db } from './db';
import type { LoginLimiter } from './auth';

export interface AppConfig {
  production: boolean;
  simulatorEnabled: boolean;
  trustProxy: boolean;
  backupDir: string;
}

export interface AppContext {
  db: Db;
  config: AppConfig;
  limiter: LoginLimiter;
  fetch: typeof fetch;
  now: () => number;
}
