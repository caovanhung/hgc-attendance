import type { Db } from './db';
import { deleteUserSessions, generateTempPassword, hashPassword } from './auth';
import { classifyMailError, getAppUrl, getDailyLimit, getSmtpConfig, type MailMessage, type SendMail } from './mail';
import { resetLinkMail, resetTempMail, welcomeMail } from './mail-templates';
import { addDays, toVnDate, vnDayStart } from './vntime';
import { RESET_TTL_MS } from './accounts';

export type MailKind = 'welcome' | 'reset_temp' | 'reset_link';
export const MAIL_RETRY_MIN = [1, 5, 15, 60];
export const MAIL_MAX_ATTEMPTS = 5;
const PASSWORD_KINDS: MailKind[] = ['welcome', 'reset_temp'];

export interface MailDeps {
  db: Db;
  sendMail: SendMail;
  now: () => number;
}

type JobRow = { id: number; user_id: string; kind: MailKind; attempts: number; payload: string; created_at: number };
type UserRow = { id: string; code: string; name: string; email: string; status: string; password_hash: string | null; must_change_password: number };

/** Id các thư đang gửi dở (đang chờ máy chủ thư trả lời), theo từng database. */
const inFlight = new WeakMap<Db, Set<number>>();
const inFlightIds = (db: Db): Set<number> => {
  let ids = inFlight.get(db);
  if (!ids) inFlight.set(db, (ids = new Set()));
  return ids;
};

const RESET_EXPIRED = 'Link đặt lại mật khẩu đã hết hạn trước khi gửi được';

/**
 * Xếp một thư cho nhân sự (gửi tới email hiện tại của người đó lúc gửi). Thư mang mật khẩu mới thay mọi thư mang mật khẩu
 * đang chờ của cùng người (tránh nhận hai mật khẩu khác nhau); thư link đặt lại thay link cũ đang chờ.
 * Thư đang gửi dở thì giữ nguyên (đã ở trong tay máy chủ thư), thư mới xếp sau nó.
 */
export function enqueueMail(db: Db, userId: string, kind: MailKind, payload: Record<string, string>, now: number): void {
  const row = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!row || !row.email) return;
  dropPendingMails(db, userId, PASSWORD_KINDS.includes(kind) ? PASSWORD_KINDS : [kind]);
  db.prepare(
    `INSERT INTO email_jobs(user_id, kind, to_email, status, attempts, payload, next_run_at, created_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
  ).run(userId, kind, row.email, JSON.stringify(payload), now, now);
  db.prepare("UPDATE users SET email_status = 'pending', email_error = NULL WHERE id = ?").run(userId);
}

/** Xóa các thư đang chờ (chưa gửi dở) thuộc các loại cho trước của một người. */
function dropPendingMails(db: Db, userId: string, kinds: MailKind[]): void {
  const sending = [...inFlightIds(db)];
  db.prepare(
    `DELETE FROM email_jobs WHERE user_id = ? AND status = 'pending' AND kind IN (${kinds.map(() => '?').join(', ')})
       AND id NOT IN (${sending.map(() => '?').join(', ')})`,
  ).run(userId, ...kinds, ...sending);
}

/**
 * Người dùng vừa tự đặt mật khẩu (link quên mật khẩu): hủy các thư mật khẩu tạm đang chờ, để thư đó không ghi đè mật khẩu
 * họ vừa chọn. Không còn thư chờ thì trạng thái thư lấy theo thư đã xử lý gần nhất.
 */
export function cancelPasswordMails(db: Db, userId: string): void {
  dropPendingMails(db, userId, PASSWORD_KINDS);
  if (db.prepare("SELECT 1 FROM email_jobs WHERE user_id = ? AND status = 'pending'").get(userId)) return;
  const last = db.prepare('SELECT status, last_error FROM email_jobs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as
    | { status: 'sent' | 'error'; last_error: string | null }
    | undefined;
  db.prepare('UPDATE users SET email_status = ?, email_error = ? WHERE id = ?').run(last?.status ?? 'none', last?.status === 'error' ? last.last_error : null, userId);
}

export function sentToday(db: Db, now: number): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'sent' AND sent_at >= ?").get(vnDayStart(toVnDate(now))) as { c: number }).c;
}

/** Trạng thái thư trên hồ sơ nhân sự: chỉ ghi khi người đó không còn thư nào đang chờ (thư mới hơn quyết định trạng thái). */
function setUserMailStatus(db: Db, userId: string, status: 'sent' | 'error', error: string | null): void {
  if (db.prepare("SELECT 1 FROM email_jobs WHERE user_id = ? AND status = 'pending'").get(userId)) return;
  db.prepare('UPDATE users SET email_status = ?, email_error = ? WHERE id = ?').run(status, error, userId);
}

/** Kết thúc thư ở trạng thái lỗi: xóa dữ liệu nhạy cảm (token) khỏi hàng đợi. */
function failJob(db: Db, job: JobRow, attempts: number, message: string): void {
  db.prepare("UPDATE email_jobs SET status = 'error', attempts = ?, last_error = ?, payload = '{}' WHERE id = ? AND user_id = ?").run(attempts, message, job.id, job.user_id);
  setUserMailStatus(db, job.user_id, 'error', message);
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
    const due = db.prepare("SELECT id FROM email_jobs WHERE status = 'pending' AND next_run_at <= ? ORDER BY id LIMIT ?").all(now, limit) as { id: number }[];
    const fresh = db.prepare("SELECT id, user_id, kind, attempts, payload, created_at FROM email_jobs WHERE id = ? AND status = 'pending'");
    let budget = getDailyLimit(db) - sentToday(db, now);
    for (const { id } of due) {
      // Đọc lại ngay trước khi gửi: trong lúc thư trước đang gửi, thư này có thể đã bị thư mới thay (xóa) — bỏ qua, không tính
      const job = fresh.get(id) as JobRow | undefined;
      if (!job) continue;
      if (budget <= 0) {
        const tomorrow = vnDayStart(addDays(toVnDate(now), 1));
        db.prepare("UPDATE email_jobs SET next_run_at = ? WHERE status = 'pending' AND next_run_at <= ?").run(tomorrow, now);
        break;
      }
      const ids = inFlightIds(db);
      ids.add(job.id);
      let outcome: SendOutcome;
      try {
        outcome = await sendOne(deps, cfg, job);
      } finally {
        ids.delete(job.id);
      }
      if (outcome === 'sent') {
        result.sent++;
        budget--;
      } else {
        result.failed++;
        // Sai tài khoản SMTP: các thư sau cũng sẽ hỏng — dừng lượt này, để chúng chờ lượt sau (sau khi sửa cấu hình)
        if (outcome === 'stop') break;
      }
    }
  } finally {
    running.delete(db);
  }
  return result;
}

/** Kết quả gửi một thư: 'stop' = lỗi cấu hình SMTP (sai tài khoản), dừng cả lượt gửi. */
type SendOutcome = 'sent' | 'failed' | 'stop';

async function sendOne(deps: MailDeps, cfg: NonNullable<ReturnType<typeof getSmtpConfig>>, job: JobRow): Promise<SendOutcome> {
  const { db } = deps;
  const now = deps.now();
  const u = db.prepare('SELECT id, code, name, email, status, password_hash, must_change_password FROM users WHERE id = ?').get(job.user_id) as UserRow | undefined;
  if (!u || u.status !== 'active' || !u.email) {
    failJob(db, job, job.attempts + 1, 'Nhân sự không còn hoạt động hoặc không có email');
    return 'failed';
  }
  // Link đặt lại chỉ sống 30 phút: quá hạn thì không gửi nữa
  const resetExpiresAt = job.created_at + RESET_TTL_MS;
  if (job.kind === 'reset_link' && now > resetExpiresAt) {
    failJob(db, job, job.attempts + 1, RESET_EXPIRED);
    console.warn(`[MAIL] kind=${job.kind} user=${u.code} status=error code=EXPIRED`);
    return 'failed';
  }
  const mailUser = { name: u.name, code: u.code, email: u.email };
  const appUrl = getAppUrl(db);
  let msg: MailMessage;
  let newHash: string | null = null;
  try {
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
  } catch {
    // Dữ liệu thư hỏng: kết thúc thư này, không để lỗi chặn các thư sau trong hàng đợi
    if (newHash) {
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ? AND password_hash = ?').run(u.password_hash, u.must_change_password, u.id, newHash);
    }
    failJob(db, job, job.attempts + 1, 'Không tạo được nội dung thư (dữ liệu thư không hợp lệ)');
    console.warn(`[MAIL] kind=${job.kind} user=${u.code} status=error code=BUILD`);
    return 'failed';
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
    const delay = MAIL_RETRY_MIN[Math.min(attempts - 1, MAIL_RETRY_MIN.length - 1)] * 60_000;
    if (me.permanent || attempts >= MAIL_MAX_ATTEMPTS) {
      failJob(db, job, attempts, me.message);
    } else if (job.kind === 'reset_link' && now + delay > resetExpiresAt) {
      // Lần thử lại sẽ quá hạn link: dừng luôn, không giữ token trong hàng đợi
      failJob(db, job, attempts, RESET_EXPIRED);
    } else {
      db.prepare('UPDATE email_jobs SET attempts = ?, last_error = ?, next_run_at = ? WHERE id = ? AND user_id = ?').run(attempts, me.message, now + delay, job.id, job.user_id);
    }
    console.warn(`[MAIL] kind=${job.kind} user=${u.code} status=error code=${me.code}`);
    return me.code === 'EAUTH' ? 'stop' : 'failed';
  }
  // Thư đã rời đi: luôn tính là đã gửi (kể cả khi dòng hàng đợi không còn)
  db.prepare("UPDATE email_jobs SET status = 'sent', attempts = attempts + 1, last_error = NULL, payload = '{}', sent_at = ? WHERE id = ? AND user_id = ?").run(now, job.id, job.user_id);
  setUserMailStatus(db, u.id, 'sent', null);
  if (job.kind === 'reset_temp') deleteUserSessions(db, u.id);
  console.log(`[MAIL] kind=${job.kind} user=${u.code} status=sent`);
  return 'sent';
}
