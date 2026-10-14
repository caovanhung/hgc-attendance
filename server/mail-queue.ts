import type { Db } from './db';
import { deleteUserSessions, generateTempPassword, hashPassword } from './auth';
import { classifyMailError, getAppUrl, getDailyLimit, getSmtpConfig, type MailMessage, type SendMail } from './mail';
import { resetLinkMail, resetTempMail, welcomeMail } from './mail-templates';
import { addDays, toVnDate, vnDayStart } from './vntime';

export type MailKind = 'welcome' | 'reset_temp' | 'reset_link';
export const MAIL_RETRY_MIN = [1, 5, 15, 60];
export const MAIL_MAX_ATTEMPTS = 5;
const PASSWORD_KINDS: MailKind[] = ['welcome', 'reset_temp'];

export interface MailDeps {
  db: Db;
  sendMail: SendMail;
  now: () => number;
}

type JobRow = { id: number; user_id: string; kind: MailKind; attempts: number; payload: string };
type UserRow = { id: string; code: string; name: string; email: string; status: string; password_hash: string | null; must_change_password: number };

/**
 * Xếp một thư cho nhân sự (gửi tới email hiện tại của người đó lúc gửi). Thư mang mật khẩu mới thay mọi thư mang mật khẩu
 * đang chờ của cùng người (tránh nhận hai mật khẩu khác nhau); thư link đặt lại thay link cũ đang chờ.
 */
export function enqueueMail(db: Db, userId: string, kind: MailKind, payload: Record<string, string>, now: number): void {
  const row = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!row || !row.email) return;
  const replaces = PASSWORD_KINDS.includes(kind) ? PASSWORD_KINDS : [kind];
  db.prepare(`DELETE FROM email_jobs WHERE user_id = ? AND status = 'pending' AND kind IN (${replaces.map(() => '?').join(', ')})`).run(userId, ...replaces);
  db.prepare(
    `INSERT INTO email_jobs(user_id, kind, to_email, status, attempts, payload, next_run_at, created_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
  ).run(userId, kind, row.email, JSON.stringify(payload), now, now);
  db.prepare("UPDATE users SET email_status = 'pending', email_error = NULL WHERE id = ?").run(userId);
}

export function sentToday(db: Db, now: number): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'sent' AND sent_at >= ?").get(vnDayStart(toVnDate(now))) as { c: number }).c;
}

const running = new WeakSet<Db>();

/** Gửi các thư đến hạn, tuần tự. Không cấu hình SMTP thì không làm gì. Đủ hạn mức ngày thì dời phần còn lại sang 00:00 hôm sau. */
export async function runMailJobs(deps: MailDeps, limit = 20): Promise<{ sent: number; failed: number }> {
  const { db } = deps;
  const result = { sent: 0, failed: 0 };
  const cfg = getSmtpConfig(db);
  if (!cfg || running.has(db)) return result;
  running.add(db);
  try {
    const now = deps.now();
    const jobs = db.prepare("SELECT id, user_id, kind, attempts, payload FROM email_jobs WHERE status = 'pending' AND next_run_at <= ? ORDER BY id LIMIT ?").all(now, limit) as JobRow[];
    let budget = getDailyLimit(db) - sentToday(db, now);
    for (const job of jobs) {
      if (budget <= 0) {
        const tomorrow = vnDayStart(addDays(toVnDate(now), 1));
        db.prepare("UPDATE email_jobs SET next_run_at = ? WHERE status = 'pending' AND next_run_at <= ?").run(tomorrow, now);
        break;
      }
      const ok = await sendOne(deps, cfg, job);
      if (ok) {
        result.sent++;
        budget--;
      } else {
        result.failed++;
      }
    }
  } finally {
    running.delete(db);
  }
  return result;
}

async function sendOne(deps: MailDeps, cfg: NonNullable<ReturnType<typeof getSmtpConfig>>, job: JobRow): Promise<boolean> {
  const { db } = deps;
  const now = deps.now();
  const u = db.prepare('SELECT id, code, name, email, status, password_hash, must_change_password FROM users WHERE id = ?').get(job.user_id) as UserRow | undefined;
  if (!u || u.status !== 'active' || !u.email) {
    db.prepare("UPDATE email_jobs SET status = 'error', attempts = attempts + 1, last_error = ?, payload = '{}' WHERE id = ?").run('Nhân sự không còn hoạt động hoặc không có email', job.id);
    return false;
  }
  const mailUser = { name: u.name, code: u.code, email: u.email };
  const appUrl = getAppUrl(db);
  let msg: MailMessage;
  let newHash: string | null = null;
  if (job.kind === 'reset_link') {
    const token = (JSON.parse(job.payload) as { token?: string }).token ?? '';
    msg = resetLinkMail(mailUser, `${appUrl ?? ''}/?reset=${encodeURIComponent(token)}`);
  } else {
    // Mật khẩu tạm sinh ngay lúc gửi: DB không bao giờ giữ mật khẩu dạng rõ
    const temp = generateTempPassword();
    newHash = hashPassword(temp);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(newHash, u.id);
    msg = job.kind === 'welcome' ? welcomeMail(mailUser, temp, appUrl) : resetTempMail(mailUser, temp, appUrl);
  }
  try {
    await deps.sendMail(cfg, msg);
  } catch (err) {
    const me = classifyMailError(err);
    // Gửi không được thì trả lại mật khẩu cũ (người dùng vẫn đăng nhập được như trước)
    if (newHash) {
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ? AND password_hash = ?').run(u.password_hash, u.must_change_password, u.id, newHash);
    }
    const attempts = job.attempts + 1;
    if (me.permanent || attempts >= MAIL_MAX_ATTEMPTS) {
      db.prepare("UPDATE email_jobs SET status = 'error', attempts = ?, last_error = ?, payload = '{}' WHERE id = ?").run(attempts, me.message, job.id);
      db.prepare("UPDATE users SET email_status = 'error', email_error = ? WHERE id = ?").run(me.message, u.id);
    } else {
      const delay = MAIL_RETRY_MIN[Math.min(attempts - 1, MAIL_RETRY_MIN.length - 1)] * 60_000;
      db.prepare('UPDATE email_jobs SET attempts = ?, last_error = ?, next_run_at = ? WHERE id = ?').run(attempts, me.message, now + delay, job.id);
    }
    console.warn(`[MAIL] kind=${job.kind} user=${u.code} status=error code=${me.code}`);
    return false;
  }
  db.prepare("UPDATE email_jobs SET status = 'sent', attempts = attempts + 1, last_error = NULL, payload = '{}', sent_at = ? WHERE id = ?").run(now, job.id);
  db.prepare("UPDATE users SET email_status = 'sent', email_error = NULL WHERE id = ?").run(u.id);
  if (job.kind === 'reset_temp') deleteUserSessions(db, u.id);
  console.log(`[MAIL] kind=${job.kind} user=${u.code} status=sent`);
  return true;
}
