/** Việt Nam dùng UTC+7 cố định, không có giờ mùa hè. Mọi hàm ở đây không phụ thuộc TZ của server. */
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toVnDate(ts: number): string {
  return new Date(ts + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function vnMinutesOfDay(ts: number): number {
  const d = new Date(ts + VN_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function parseHHmm(s: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) throw new Error(`Giờ không hợp lệ: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function vnDateTimeToTs(date: string, hhmm: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, 0, parseHHmm(hhmm)) - VN_OFFSET_MS;
}

export function vnDayStart(date: string): number {
  return vnDateTimeToTs(date, '00:00');
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
