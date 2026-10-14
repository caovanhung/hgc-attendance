import nodemailer from 'nodemailer';
import type { Db } from './db';
import { getSetting, setSetting } from './settings';
import { HttpError } from './errors';
import { toVnDate, vnDayStart } from './vntime';
import type { MailConfigView } from '../shared/types';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean; // true: SSL/TLS (465); false: STARTTLS (587)
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendMail = (cfg: SmtpConfig, msg: MailMessage) => Promise<void>;

export class MailError extends Error {
  constructor(
    message: string,
    public permanent: boolean,
    public code: string,
  ) {
    super(message);
  }
}

export const DEFAULT_DAILY_LIMIT = 450;
const K = {
  host: 'mail.host',
  port: 'mail.port',
  secure: 'mail.secure',
  user: 'mail.user',
  password: 'mail.password',
  fromName: 'mail.from_name',
  fromEmail: 'mail.from_email',
  appUrl: 'mail.app_url',
  dailyLimit: 'mail.daily_limit',
} as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getSmtpConfig(db: Db): SmtpConfig | null {
  const host = getSetting(db, K.host);
  const user = getSetting(db, K.user);
  const password = getSetting(db, K.password);
  const fromEmail = getSetting(db, K.fromEmail);
  if (!host || !user || !password || !fromEmail) return null;
  return {
    host,
    port: Number(getSetting(db, K.port) ?? 465),
    secure: (getSetting(db, K.secure) ?? 'ssl') === 'ssl',
    user,
    password,
    fromName: getSetting(db, K.fromName) ?? 'Petrolimex Attendance',
    fromEmail,
  };
}

export function getAppUrl(db: Db): string | null {
  return getSetting(db, K.appUrl) || null;
}

export function getDailyLimit(db: Db): number {
  return Number(getSetting(db, K.dailyLimit) ?? DEFAULT_DAILY_LIMIT);
}

export function getMailConfigView(db: Db, now: number): MailConfigView {
  const dayStart = vnDayStart(toVnDate(now));
  const count = (sql: string, ...p: number[]) => (db.prepare(sql).get(...p) as { c: number }).c;
  return {
    host: getSetting(db, K.host) ?? '',
    port: Number(getSetting(db, K.port) ?? 465),
    secure: (getSetting(db, K.secure) ?? 'ssl') === 'starttls' ? 'starttls' : 'ssl',
    user: getSetting(db, K.user) ?? '',
    hasPassword: Boolean(getSetting(db, K.password)),
    fromName: getSetting(db, K.fromName) ?? 'Petrolimex Attendance',
    fromEmail: getSetting(db, K.fromEmail) ?? '',
    appUrl: getSetting(db, K.appUrl) ?? '',
    dailyLimit: getDailyLimit(db),
    configured: getSmtpConfig(db) !== null,
    sentToday: count("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'sent' AND sent_at >= ?", dayStart),
    pending: count("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'pending'"),
  };
}

/** Lưu cấu hình gửi thư (chỉ ADMIN). Mật khẩu để trống = giữ mật khẩu cũ. */
export function saveMailConfig(db: Db, input: unknown): void {
  const b = (input ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const host = text(b.host);
  const user = text(b.user);
  const fromEmail = text(b.fromEmail).toLowerCase();
  const fromName = text(b.fromName) || 'Petrolimex Attendance';
  const appUrl = text(b.appUrl).replace(/\/+$/, '');
  const port = Number(b.port);
  const dailyLimit = Number(b.dailyLimit ?? DEFAULT_DAILY_LIMIT);
  if (!host) throw new HttpError(400, 'Máy chủ SMTP là bắt buộc');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, 'Cổng SMTP không hợp lệ');
  if (b.secure !== 'ssl' && b.secure !== 'starttls') throw new HttpError(400, 'Kiểu bảo mật phải là SSL/TLS hoặc STARTTLS');
  if (!user) throw new HttpError(400, 'Tài khoản SMTP là bắt buộc');
  if (!EMAIL_RE.test(fromEmail)) throw new HttpError(400, 'Email người gửi không hợp lệ');
  if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(appUrl)) throw new HttpError(400, 'Địa chỉ web phải bắt đầu bằng http:// hoặc https://');
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10000) throw new HttpError(400, 'Hạn mức thư mỗi ngày không hợp lệ');
  setSetting(db, K.host, host);
  setSetting(db, K.port, String(port));
  setSetting(db, K.secure, b.secure);
  setSetting(db, K.user, user);
  if (typeof b.password === 'string' && b.password !== '') setSetting(db, K.password, b.password);
  setSetting(db, K.fromName, fromName);
  setSetting(db, K.fromEmail, fromEmail);
  setSetting(db, K.appUrl, appUrl);
  setSetting(db, K.dailyLimit, String(dailyLimit));
}

/** Lỗi vĩnh viễn: sai đăng nhập SMTP, máy chủ từ chối (5xx), địa chỉ sai. Còn lại (mạng, timeout, 4xx) thử lại sau. */
export function classifyMailError(err: unknown): MailError {
  if (err instanceof MailError) return err;
  const e = (err ?? {}) as { code?: string; responseCode?: number };
  if (e.code === 'EAUTH') return new MailError('Sai tài khoản hoặc mật khẩu gửi thư (SMTP)', true, 'EAUTH');
  if (e.code === 'EENVELOPE') return new MailError('Địa chỉ email người nhận không hợp lệ', true, 'EENVELOPE');
  if (typeof e.responseCode === 'number' && e.responseCode >= 500) return new MailError(`Máy chủ thư từ chối (${e.responseCode})`, true, String(e.responseCode));
  return new MailError('Không kết nối được máy chủ gửi thư, sẽ thử lại', false, e.code ?? 'ENET');
}

export const nodemailerSend: SendMail = async (cfg, msg) => {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({ from: { name: cfg.fromName, address: cfg.fromEmail }, to: msg.to, subject: msg.subject, text: msg.text });
  } catch (err) {
    throw classifyMailError(err);
  } finally {
    transport.close();
  }
};
