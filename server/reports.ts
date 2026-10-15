import type { Db } from './db';
import { HttpError } from './errors';
import { scopeFor, scopeWhere, type AuthUser } from './auth';
import { areaFilterSql, departmentScopeSql, isGlobalHr, notFound, parseAreaFilter, type AreaFilter } from './access';
import { NOT_SYSTEM_ADMIN } from './bootstrap';
import { effectiveShift, isoWeekday, isWorkday } from './shifts';
import { isValidMonth, lockOf } from './month-lock';
import { addDays, toVnDate } from './vntime';
import type { DayStatus, MonthlyDay, MonthlyReport, MonthlyRow, MonthlySymbol } from '../shared/types';

export interface ReportUser {
  id: string;
  code: string;
  name: string;
  departmentName: string | null;
  createdAt: string;
}

/** `?month=`: mặc định tháng hiện tại (giờ VN); sai định dạng ⇒ 400. */
export function parseMonthParam(raw: unknown, now: number): string {
  if (raw === undefined || raw === '') return toVnDate(now).slice(0, 7);
  if (!isValidMonth(raw)) throw new HttpError(400, 'Tháng không hợp lệ (định dạng YYYY-MM)');
  return raw;
}

export function monthDays(db: Db, month: string): MonthlyDay[] {
  const holidays = new Map(
    (db.prepare('SELECT date, name FROM holidays WHERE date LIKE ?').all(`${month}-%`) as { date: string; name: string }[]).map((h) => [h.date, h.name]),
  );
  const out: MonthlyDay[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) {
    out.push({ date: d, weekday: isoWeekday(d), holiday: holidays.get(d) ?? null });
  }
  return out;
}

const SYMBOL: Record<Exclude<DayStatus, 'missing_out'>, MonthlySymbol> = {
  on_time: 'X',
  late: 'M',
  early_leave: 'S',
  late_and_early: 'MS',
  business_trip: 'CT',
  leave: 'P',
  absent: 'V',
};

/** Ký hiệu lưới (spec đợt C §6). Thiếu giờ ra chưa chốt (đang trong giờ làm) coi như X. */
export function symbolOf(status: DayStatus, final: boolean): MonthlySymbol {
  if (status === 'missing_out') return final ? 'T' : 'X';
  return SYMBOL[status];
}

const WORK_SYMBOLS = new Set<MonthlySymbol>(['X', 'M', 'S', 'MS', 'T', 'CT']);

interface DayRowLite {
  work_date: string;
  status: DayStatus;
  final: number;
  late_minutes: number;
  early_minutes: number;
  ov: number;
}

/** Dòng bảng công tháng cho từng người: ô ký hiệu theo ngày và các cột tổng. */
export function buildRows(db: Db, users: ReportUser[], month: string, now: number): MonthlyRow[] {
  const days = monthDays(db, month);
  const today = toVnDate(now);
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const dayRows = db.prepare(
    `SELECT a.work_date, a.status, a.final, a.late_minutes, a.early_minutes, o.user_id IS NOT NULL AS ov
     FROM attendance_days a LEFT JOIN attendance_overrides o ON o.user_id = a.user_id AND o.work_date = a.work_date
     WHERE a.user_id = ? AND a.work_date BETWEEN ? AND ?`,
  );
  return users.map((u) => {
    const rule = effectiveShift(db, u.id);
    const byDate = new Map((dayRows.all(u.id, first, last) as unknown as DayRowLite[]).map((r) => [r.work_date, r]));
    const row: MonthlyRow = {
      userId: u.id,
      employeeCode: u.code,
      employeeName: u.name,
      departmentName: u.departmentName,
      cells: [],
      requiredDays: 0,
      workDays: 0,
      lateCount: 0,
      lateMinutes: 0,
      earlyCount: 0,
      earlyMinutes: 0,
      missingOutDays: 0,
      absentDays: 0,
      leaveDays: 0,
      businessTripDays: 0,
      attendanceRate: null,
    };
    const created = u.createdAt.slice(0, 10);
    for (const d of days) {
      if (d.date <= today && d.date >= created && isWorkday(db, rule, d.date)) row.requiredDays++;
      const r = byDate.get(d.date);
      if (!r) {
        row.cells.push(d.holiday ? 'L' : null);
        continue;
      }
      const sym = symbolOf(r.status, r.final === 1);
      row.cells.push(r.ov ? `${sym}*` : sym);
      if (WORK_SYMBOLS.has(sym)) row.workDays++;
      if (sym === 'M' || sym === 'MS') {
        row.lateCount++;
        row.lateMinutes += r.late_minutes;
      }
      if (sym === 'S' || sym === 'MS') {
        row.earlyCount++;
        row.earlyMinutes += r.early_minutes;
      }
      if (sym === 'T') row.missingOutDays++;
      if (sym === 'V') row.absentDays++;
      if (sym === 'P') row.leaveDays++;
      if (sym === 'CT') row.businessTripDays++;
    }
    row.attendanceRate = row.requiredDays ? Math.round(((row.workDays + row.leaveDays) / row.requiredDays) * 1000) / 10 : null;
    return row;
  });
}

/**
 * Bảng công tháng theo phạm vi người xem (spec đợt C §9): HR lọc khu/phòng, quản trị khu trong khu mình,
 * trưởng phòng chỉ phòng mình (bỏ qua bộ lọc). Người nghỉ việc chỉ có dòng khi có dữ liệu trong tháng.
 */
export function buildMonthlyReport(db: Db, viewer: AuthUser, q: { month: string; area?: unknown; department?: unknown }, now: number): MonthlyReport {
  const { month } = q;
  const w = scopeWhere(scopeFor(viewer), 'u.id', 'u.department_id');
  const managerView = viewer.role === 'hr' || viewer.role === 'area_admin';
  const filter: AreaFilter = managerView ? parseAreaFilter(db, viewer, q.area) : { kind: 'all' };
  const f = areaFilterSql(filter, 'u.department_id');
  let deptSql = '1=1';
  const deptParams: string[] = [];
  let scopeLabel = isGlobalHr(viewer) ? 'Toàn công ty' : viewer.role === 'area_admin' ? 'Các khu được giao' : 'Phòng của bạn';
  if (filter.kind === 'area') {
    scopeLabel = `Khu ${(db.prepare('SELECT name FROM areas WHERE id = ?').get(filter.areaId) as { name: string }).name}`;
  } else if (filter.kind === 'none') {
    scopeLabel = 'Chưa gán khu';
  }
  if (managerView && typeof q.department === 'string' && q.department) {
    const ds = departmentScopeSql(viewer);
    const dept = db.prepare(`SELECT d.name FROM departments d WHERE d.id = ? AND ${ds.sql}`).get(q.department, ...ds.params) as { name: string } | undefined;
    if (!dept) throw notFound('phòng ban');
    deptSql = 'u.department_id = ?';
    deptParams.push(q.department);
    scopeLabel = `Phòng ${dept.name}`;
  } else if (viewer.role === 'dept_manager' && viewer.departmentId) {
    const dept = db.prepare('SELECT name FROM departments WHERE id = ?').get(viewer.departmentId) as { name: string } | undefined;
    if (dept) scopeLabel = `Phòng ${dept.name}`;
  }
  const days = monthDays(db, month);
  const users = (
    db
      .prepare(
        `SELECT u.id, u.code, u.name, u.created_at, d.name AS department_name
         FROM users u LEFT JOIN departments d ON d.id = u.department_id
         WHERE ${NOT_SYSTEM_ADMIN} AND ${w.sql} AND ${f.sql} AND ${deptSql}
           AND (u.status = 'active' OR EXISTS (SELECT 1 FROM attendance_days a WHERE a.user_id = u.id AND a.work_date BETWEEN ? AND ?))
         ORDER BY d.name IS NULL, d.name, u.code`,
      )
      .all(...w.params, ...f.params, ...deptParams, days[0].date, days[days.length - 1].date) as {
      id: string;
      code: string;
      name: string;
      created_at: string;
      department_name: string | null;
    }[]
  ).map((u) => ({ id: u.id, code: u.code, name: u.name, departmentName: u.department_name, createdAt: u.created_at }));
  return { month, days, lock: lockOf(db, month), scopeLabel, rows: buildRows(db, users, month, now) };
}
