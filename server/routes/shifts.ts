import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId } from '../db';
import { HttpError } from '../errors';
import { currentUser } from '../middleware';
import { areaColumnSql, isGlobalHr, managesArea, notFound, parseAreaFilter, requireGlobalHr, requireManager, resolveAreaFor } from '../access';
import { SYSTEM_ADMIN_CODE } from '../bootstrap';
import { effectiveShift, formatWorkDays, getShift, mapShift, SHIFT_SELECT, validateShiftInput } from '../shifts';
import { recomputeForShiftChange, recomputeUsers } from '../attendance';
import type { Row } from '../repo';
import { isValidDate, toVnDate } from '../vntime';
import type { Holiday } from '../../shared/types';

/** Nhân sự (trừ ADMIN) đang thực sự áp dụng ca này (ca riêng, hoặc ca phòng khi không có ca riêng hợp lệ). */
export function usersOfShift(db: Db, shiftId: string): string[] {
  return (
    db
      .prepare('SELECT u.id FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.code != ? AND (u.shift_id = ? OR d.shift_id = ?)')
      .all(SYSTEM_ADMIN_CODE, shiftId, shiftId) as { id: string }[]
  )
    .map((r) => r.id)
    .filter((id) => effectiveShift(db, id).shiftId === shiftId);
}

/** Nhân sự (trừ ADMIN) đang dùng ca mặc định công ty. */
export function usersOnDefaultShift(db: Db): string[] {
  return allStaffIds(db).filter((id) => effectiveShift(db, id).shiftId === null);
}

export function allStaffIds(db: Db): string[] {
  return (db.prepare('SELECT id FROM users WHERE code != ?').all(SYSTEM_ADMIN_CODE) as { id: string }[]).map((r) => r.id);
}

/** Có đơn nghỉ phép/công tác đã duyệt nào phủ ngày này không. */
function leaveCovers(db: Db, date: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM requests WHERE status = 'approved' AND type IN ('leave_request', 'business_trip')
         AND work_date <= ? AND COALESCE(end_date, work_date) >= ? LIMIT 1`,
      )
      .get(date, date),
  );
}

export function shiftRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/shifts', requireManager, (req, res) => {
    const actor = currentUser(req);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), 's.area_id');
    const scope = isGlobalHr(actor)
      ? { sql: '1=1', params: [] as string[] }
      : actor.areaIds.length
        ? { sql: `s.area_id IN (${actor.areaIds.map(() => '?').join(', ')})`, params: [...actor.areaIds] }
        : { sql: '0=1', params: [] as string[] };
    const rows = db.prepare(`${SHIFT_SELECT} WHERE ${scope.sql} AND ${f.sql} ORDER BY a.code, s.name`).all(...scope.params, ...f.params) as Row[];
    res.json({ shifts: rows.map(mapShift) });
  });

  r.post('/shifts', requireManager, (req, res) => {
    const actor = currentUser(req);
    const b = req.body ?? {};
    const areaId = resolveAreaFor(db, actor, b.areaId);
    if (!areaId) throw new HttpError(400, 'Hãy chọn khu vực cho ca');
    const s = validateShiftInput(b);
    if (db.prepare('SELECT 1 FROM shifts WHERE area_id = ? AND name = ?').get(areaId, s.name)) throw new HttpError(409, 'Khu này đã có ca cùng tên');
    const id = newId('shift');
    db.prepare(
      `INSERT INTO shifts(id, area_id, name, work_start, work_end, work_days, late_grace_minutes, early_arrival_minutes, early_leave_minutes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, areaId, s.name, s.workStart, s.workEnd, formatWorkDays(s.workDays), s.lateGraceMinutes, s.earlyArrivalMinutes, s.earlyLeaveMinutes, toVnDate(ctx.now()));
    res.json({ shift: getShift(db, id) });
  });

  r.put('/shifts/:id', requireManager, (req, res) => {
    const cur = getShift(db, req.params.id);
    if (!cur || !managesArea(currentUser(req), cur.areaId)) throw notFound('ca');
    const s = validateShiftInput({ ...cur, ...(req.body ?? {}) });
    const dup = db.prepare('SELECT id FROM shifts WHERE area_id = ? AND name = ?').get(cur.areaId, s.name) as { id: string } | undefined;
    if (dup && dup.id !== cur.id) throw new HttpError(409, 'Khu này đã có ca cùng tên');
    db.prepare(
      `UPDATE shifts SET name = ?, work_start = ?, work_end = ?, work_days = ?, late_grace_minutes = ?, early_arrival_minutes = ?, early_leave_minutes = ? WHERE id = ?`,
    ).run(s.name, s.workStart, s.workEnd, formatWorkDays(s.workDays), s.lateGraceMinutes, s.earlyArrivalMinutes, s.earlyLeaveMinutes, cur.id);
    const recomputed = recomputeForShiftChange(db, usersOfShift(db, cur.id), ctx.now());
    res.json({ shift: getShift(db, cur.id), recomputed });
  });

  r.delete('/shifts/:id', requireManager, (req, res) => {
    const cur = getShift(db, req.params.id);
    if (!cur || !managesArea(currentUser(req), cur.areaId)) throw notFound('ca');
    if (cur.departmentCount > 0 || cur.userCount > 0) throw new HttpError(409, 'Ca đang được phòng ban hoặc nhân sự sử dụng');
    db.prepare('DELETE FROM shifts WHERE id = ?').run(cur.id);
    res.json({ success: true });
  });

  r.get('/holidays', (req, res) => {
    const year = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year) ? req.query.year : toVnDate(ctx.now()).slice(0, 4);
    const rows = db.prepare('SELECT date, name FROM holidays WHERE date LIKE ? ORDER BY date').all(`${year}-%`) as unknown as Holiday[];
    res.json({ holidays: rows.map((h) => ({ date: h.date, name: h.name })) });
  });

  /** Ngày lễ đổi: tính lại đúng ngày đó cho mọi người, nếu ngày đã tới hoặc có đơn nghỉ/công tác đã duyệt ghi trước cho ngày đó. */
  const recomputeDate = (date: string) =>
    date <= toVnDate(ctx.now()) || leaveCovers(db, date) ? recomputeUsers(db, allStaffIds(db), date, date, ctx.now()) : 0;

  r.post('/holidays', requireGlobalHr, (req, res) => {
    const b = req.body ?? {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!isValidDate(b.date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    if (!name) throw new HttpError(400, 'Tên ngày lễ là bắt buộc');
    if (db.prepare('SELECT 1 FROM holidays WHERE date = ?').get(b.date)) throw new HttpError(409, 'Ngày này đã là ngày lễ');
    db.prepare('INSERT INTO holidays(date, name) VALUES (?, ?)').run(b.date, name);
    res.json({ holiday: { date: b.date, name }, recomputed: recomputeDate(b.date) });
  });

  r.delete('/holidays/:date', requireGlobalHr, (req, res) => {
    const result = db.prepare('DELETE FROM holidays WHERE date = ?').run(req.params.date);
    if (Number(result.changes) === 0) throw notFound('ngày lễ');
    res.json({ success: true, recomputed: recomputeDate(req.params.date) });
  });

  return r;
}
