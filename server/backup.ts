import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { VN_OFFSET_MS } from './vntime';
import type { BackupInfo } from '../shared/types';

export type BackupReason = 'daily' | 'manual' | 'pre-reset' | 'pre-delete';
export const BACKUP_KEEP = 30;

const BACKUP_RE = /^attendance-.*\.db$/;
const DAILY_RE = /^attendance-\d{4}-\d{2}-\d{2}\.db$/;
/** Bản sao lưu trước nâng cấp: không bao giờ tự xóa. */
const PRE_MIGRATE_RE = /-pre-migrate-v\d+\.db$/;

function stamp(now: number): { date: string; time: string } {
  const iso = new Date(now + VN_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19).replace(/:/g, '') };
}

/** Tạo bản sao nhất quán bằng VACUUM INTO. Trả tên file, hoặc null nếu bản hằng ngày hôm nay đã có. */
export function backupNow(db: Db, dir: string, reason: BackupReason, now: number): string | null {
  fs.mkdirSync(dir, { recursive: true });
  const { date, time } = stamp(now);
  let name: string;
  if (reason === 'daily') {
    name = `attendance-${date}.db`;
    if (fs.existsSync(path.join(dir, name))) return null;
  } else {
    name = `attendance-${date}-${time}-${reason}.db`;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `attendance-${date}-${time}-${reason}-${i}.db`;
  }
  db.prepare('VACUUM INTO ?').run(path.join(dir, name));
  pruneBackups(dir);
  return name;
}

/**
 * Sao lưu trước khi nâng cấp từ v<from>: `attendance-pre-migrate-v<from>.db`.
 * Nếu file đó đã có (lần nâng cấp trước thất bại) thì giữ nguyên bản cũ — đó là bản gốc trước mọi lần thử.
 */
export function backupPreMigrate(db: Db, dir: string, from: number): string {
  fs.mkdirSync(dir, { recursive: true });
  const name = `attendance-pre-migrate-v${from}.db`;
  if (!fs.existsSync(path.join(dir, name))) db.prepare('VACUUM INTO ?').run(path.join(dir, name));
  return name;
}

export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => BACKUP_RE.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.createdAt === b.createdAt ? b.name.localeCompare(a.name) : b.createdAt.localeCompare(a.createdAt)));
}

export function pruneBackups(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const names = fs.readdirSync(dir).filter((n) => BACKUP_RE.test(n) && !PRE_MIGRATE_RE.test(n)).sort().reverse(); // tên chứa ngày giờ → mới nhất trước
  const daily = names.filter((n) => DAILY_RE.test(n));
  const others = names.filter((n) => !DAILY_RE.test(n));
  for (const n of [...daily.slice(BACKUP_KEEP), ...others.slice(BACKUP_KEEP)]) fs.rmSync(path.join(dir, n), { force: true });
}

export function latestBackup(dir: string): string | null {
  const [first] = listBackups(dir);
  return first ? path.join(dir, first.name) : null;
}
