import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { canSeeUser, getUser, type Row } from '../repo';
import { scopeFor, scopeWhere } from '../auth';
import { recomputeRange } from '../attendance';
import { NOT_SYSTEM_ADMIN } from '../bootstrap';
import { daysBetween, isValidDate, toVnDate } from '../vntime';
import type { AttendanceDay, Detection, StatsData } from '../../shared/types';

const DAY_SELECT = `SELECT a.*, u.code AS employee_code, u.name AS employee_name, u.avatar_url, u.department_id,
  d.name AS department_name
  FROM attendance_days a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id`;

function mapDay(r: Row): AttendanceDay {
  return {
    userId: r.user_id,
    employeeCode: r.employee_code,
    employeeName: r.employee_name,
    avatarUrl: r.avatar_url ?? '',
    departmentId: r.department_id ?? null,
    departmentName: r.department_name ?? null,
    workDate: r.work_date,
    firstIn: r.first_in,
    lastOut: r.last_out ?? null,
    lateMinutes: r.late_minutes,
    earlyMinutes: r.early_minutes,
    status: r.status,
    lateExcused: r.late_excused === 1,
    manualIn: r.manual_in ?? null,
    manualOut: r.manual_out ?? null,
    detectionCount: r.detection_count,
  };
}

export const MAX_RECOMPUTE_DAYS = 92;

export function attendanceRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/attendance', (req, res) => {
    const user = currentUser(req);
    const date = req.query.date === undefined || req.query.date === '' ? toVnDate(ctx.now()) : req.query.date;
    if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const w = scopeWhere(scopeFor(user), 'u.id', 'u.department_id');
    let sql = `${DAY_SELECT} WHERE a.work_date = ? AND ${w.sql}`;
    const params: string[] = [date, ...w.params];
    const departmentId = req.query.departmentId;
    if (user.role === 'hr' && typeof departmentId === 'string' && departmentId) {
      sql += ' AND u.department_id = ?';
      params.push(departmentId);
    }
    let records = (db.prepare(`${sql} ORDER BY a.first_in`).all(...params) as Row[]).map(mapDay);
    const q = typeof req.query.search === 'string' ? req.query.search.trim().toLocaleLowerCase('vi') : '';
    if (q) {
      records = records.filter(
        (x) => x.employeeName.toLocaleLowerCase('vi').includes(q) || x.employeeCode.toLocaleLowerCase('vi').includes(q),
      );
    }
    res.json({ date, records });
  });

  r.get('/attendance/:userId/:date/detections', (req, res) => {
    const target = getUser(db, req.params.userId);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    if (!canSeeUser(currentUser(req), target)) throw new HttpError(403, 'Bạn không có quyền xem dữ liệu này');
    if (!isValidDate(req.params.date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const rows = db
      .prepare('SELECT id, device_id, device_name, place_id, ts, image_url, source FROM detections WHERE user_id = ? AND work_date = ? ORDER BY ts')
      .all(target.id, req.params.date) as Row[];
    const detections: Detection[] = rows.map((x) => ({
      id: x.id,
      deviceId: x.device_id,
      deviceName: x.device_name ?? null,
      placeId: x.place_id ?? null,
      ts: x.ts,
      imageUrl: x.image_url ?? null,
      source: x.source,
    }));
    res.json({ detections });
  });

  r.post('/attendance/recompute', requireRole('hr'), (req, res) => {
    const { from, to } = req.body ?? {};
    if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const span = daysBetween(from, to);
    if (span < 0) throw new HttpError(400, 'Ngày bắt đầu phải trước ngày kết thúc');
    if (span >= MAX_RECOMPUTE_DAYS) throw new HttpError(400, `Mỗi lần chỉ tính lại tối đa ${MAX_RECOMPUTE_DAYS} ngày`);
    res.json({ updated: recomputeRange(db, from, to) });
  });

  r.get('/stats', (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), 'u.id', 'u.department_id');
    const date = toVnDate(ctx.now());
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${w.sql}`).get(...w.params) as { c: number };
    const day = db
      .prepare(
        `SELECT COUNT(*) AS present,
           SUM(CASE WHEN a.late_minutes = 0 THEN 1 ELSE 0 END) AS on_time,
           SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late,
           SUM(CASE WHEN a.status = 'missing_out' THEN 1 ELSE 0 END) AS missing_out
         FROM attendance_days a JOIN users u ON u.id = a.user_id
         WHERE a.work_date = ? AND u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${w.sql}`,
      )
      .get(date, ...w.params) as { present: number; on_time: number | null; late: number | null; missing_out: number | null };
    const pending = db
      .prepare(`SELECT COUNT(*) AS c FROM requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' AND ${w.sql}`)
      .get(...w.params) as { c: number };
    const cameras = db.prepare('SELECT COUNT(*) AS c FROM cameras').get() as { c: number };
    const body: StatsData = {
      date,
      totalEmployees: total.c,
      presentCount: day.present,
      onTimeCount: day.on_time ?? 0,
      lateCount: day.late ?? 0,
      missingOutCount: day.missing_out ?? 0,
      notCheckedInCount: Math.max(0, total.c - day.present),
      pendingRequests: pending.c,
      totalCameras: cameras.c,
    };
    res.json(body);
  });

  return r;
}
