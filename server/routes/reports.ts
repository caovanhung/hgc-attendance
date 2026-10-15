import { Router } from 'express';
import type { AppContext } from '../context';
import { ah } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { personLabel } from '../audit';
import { monthlyReportXlsx } from '../report-xlsx';
import { getUser, type Row } from '../repo';
import { SYSTEM_ADMIN_CODE } from '../bootstrap';
import { effectiveShift, isWorkday } from '../shifts';
import { lockOf } from '../month-lock';
import { buildMonthlyReport, buildRows, monthDays, parseMonthParam } from '../reports';
import { DAY_SELECT, mapDay } from './attendance';
import { toVnDate } from '../vntime';
import type { AttendanceDay, MyAttendance } from '../../shared/types';

const hhmm = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function reportRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get(
    '/reports/monthly.xlsx',
    requireRole('hr', 'area_admin', 'dept_manager'),
    ah(async (req, res) => {
      const viewer = currentUser(req);
      const month = parseMonthParam(req.query.month, ctx.now());
      const report = buildMonthlyReport(db, viewer, { month, area: req.query.area, department: req.query.department }, ctx.now());
      const buf = await monthlyReportXlsx(report, personLabel(viewer.name, viewer.code), ctx.now());
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Bang_cong_${month}.xlsx"`);
      res.send(buf);
    }),
  );

  r.get('/reports/monthly', requireRole('hr', 'area_admin', 'dept_manager'), (req, res) => {
    const month = parseMonthParam(req.query.month, ctx.now());
    res.json(buildMonthlyReport(db, currentUser(req), { month, area: req.query.area, department: req.query.department }, ctx.now()));
  });

  r.get('/me/attendance', (req, res) => {
    const month = parseMonthParam(req.query.month, ctx.now());
    const user = getUser(db, currentUser(req).id)!;
    if (user.code === SYSTEM_ADMIN_CODE) {
      const body: MyAttendance = { tracked: false, profile: null, today: null, report: null, lock: null, days: [] };
      res.json(body);
      return;
    }
    const rule = effectiveShift(db, user.id);
    const days = monthDays(db, month);
    const records = new Map(
      (db.prepare(`${DAY_SELECT} WHERE a.user_id = ? AND a.work_date BETWEEN ? AND ?`).all(user.id, days[0].date, days[days.length - 1].date) as Row[])
        .map(mapDay)
        .map((d) => [d.workDate, d] as [string, AttendanceDay]),
    );
    const todayRow = db.prepare(`${DAY_SELECT} WHERE a.user_id = ? AND a.work_date = ?`).get(user.id, toVnDate(ctx.now())) as Row | undefined;
    const me = { id: user.id, code: user.code, name: user.name, departmentName: user.departmentName, createdAt: user.createdAt };
    const body: MyAttendance = {
      tracked: true,
      profile: {
        code: user.code,
        name: user.name,
        departmentName: user.departmentName,
        position: user.position,
        shift: { name: rule.name, workStart: hhmm(rule.workStart), workEnd: hhmm(rule.workEnd), workDays: rule.workDays },
      },
      today: todayRow ? mapDay(todayRow) : null,
      report: buildRows(db, [me], month, ctx.now())[0],
      lock: lockOf(db, month),
      days: days.map((d) => ({ ...d, workday: isWorkday(db, rule, d.date), record: records.get(d.date) ?? null })),
    };
    res.json(body);
  });

  return r;
}
