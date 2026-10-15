import { Router, type Request } from 'express';
import type { AppContext } from '../context';
import { HttpError, ah } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { canSeeUser, getUser, type Row } from '../repo';
import { scopeFor, scopeWhere, type AuthUser } from '../auth';
import { requireGlobalHr, areaColumnSql, areaFilterSql, cameraScopeSql, managesArea, notFound, parseAreaFilter } from '../access';
import { recomputeDay, recomputeRange } from '../attendance';
import { tx } from '../db';
import { actorOf, personLabel, writeAudit } from '../audit';
import { isMonthLocked, lockedError } from '../month-lock';
import { OVERRIDE_KINDS, parseReason, readOverride } from '../overrides';
import { NOT_SYSTEM_ADMIN, SYSTEM_ADMIN_CODE } from '../bootstrap';
import { getVideoAt } from '../hanet-connect';
import { effectiveShift, isWorkday } from '../shifts';
import { daysBetween, isValidDate, toVnDate, vnDateTimeToTs } from '../vntime';
import type { AttendanceDay, Detection, User, DetectionVideo, StatsData, StatsDetailRow, StatsDetailType } from '../../shared/types';

export const DAY_SELECT = `SELECT a.*, u.code AS employee_code, u.name AS employee_name, u.avatar_url, u.department_id,
  d.name AS department_name, o.kind AS ov_kind, o.reason AS ov_reason, o.created_by_label AS ov_by, o.created_at AS ov_at
  FROM attendance_days a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN attendance_overrides o ON o.user_id = a.user_id AND o.work_date = a.work_date`;

export function mapDay(r: Row): AttendanceDay {
  return {
    userId: r.user_id,
    employeeCode: r.employee_code,
    employeeName: r.employee_name,
    avatarUrl: r.avatar_url ?? '',
    departmentId: r.department_id ?? null,
    departmentName: r.department_name ?? null,
    workDate: r.work_date,
    firstIn: r.first_in ?? null,
    lastOut: r.last_out ?? null,
    lateMinutes: r.late_minutes,
    earlyMinutes: r.early_minutes,
    earlyArrivalMinutes: r.early_arrival_minutes ?? 0,
    status: r.status,
    final: r.final === 1,
    lateExcused: r.late_excused === 1,
    manualIn: r.manual_in ?? null,
    manualOut: r.manual_out ?? null,
    detectionCount: r.detection_count,
    override: r.ov_kind ? { kind: r.ov_kind, reason: r.ov_reason, byName: r.ov_by, at: r.ov_at } : null,
  };
}

export const MAX_RECOMPUTE_DAYS = 92;
/** Nút đoạn trước/sau chỉ đi xa tối đa 24 giờ quanh lượt quẹt (trưởng phòng không duyệt camera tùy ý). */
const MAX_VIDEO_DRIFT_MS = 24 * 3_600_000;

/** Điều kiện lọc của từng thẻ thống kê, dùng chung để danh sách chi tiết khớp đúng con số. */
const DETAIL_FILTER: Record<StatsDetailType, string> = {
  total: '1 = 1',
  present: 'a.first_in IS NOT NULL',
  on_time: "a.first_in IS NOT NULL AND a.late_minutes = 0 AND a.status NOT IN ('leave', 'business_trip')",
  late: 'a.late_minutes > 0',
  missing_out: "a.status = 'missing_out'",
  not_checked_in: 'a.user_id IS NULL',
  absent: "a.status = 'absent'",
  leave: "a.status = 'leave'",
  business_trip: "a.status = 'business_trip'",
  early_arrival: 'a.early_arrival_minutes > 0',
};

/** Không được xem người này: quản trị khu nhận 404 (không lộ dữ liệu khu khác), vai trò khác 403 như trước. */
function denySee(viewer: AuthUser): HttpError {
  return viewer.role === 'area_admin' ? notFound('nhân sự') : new HttpError(403, 'Bạn không có quyền xem dữ liệu này');
}

export function attendanceRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/attendance', (req, res) => {
    const user = currentUser(req);
    const date = req.query.date === undefined || req.query.date === '' ? toVnDate(ctx.now()) : req.query.date;
    if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const w = scopeWhere(scopeFor(user), 'u.id', 'u.department_id');
    const f = areaFilterSql(parseAreaFilter(db, user, req.query.area), 'u.department_id');
    let sql = `${DAY_SELECT} WHERE a.work_date = ? AND ${w.sql} AND ${f.sql}`;
    const params: string[] = [date, ...w.params, ...f.params];
    const departmentId = req.query.departmentId;
    if ((user.role === 'hr' || user.role === 'area_admin') && typeof departmentId === 'string' && departmentId) {
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
    const viewer = currentUser(req);
    const target = getUser(db, req.params.userId);
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân sự');
    if (!canSeeUser(viewer, target)) throw denySee(viewer);
    if (!isValidDate(req.params.date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const rows = db
      .prepare('SELECT id, device_id, device_name, place_id, ts, work_date, image_url, source FROM detections WHERE user_id = ? AND work_date = ? ORDER BY ts')
      .all(target.id, req.params.date) as Row[];
    const canWatch = viewer.role === 'hr' || viewer.role === 'area_admin' || viewer.role === 'dept_manager';
    const detections: Detection[] = rows.map((x) => ({
      id: x.id,
      deviceId: x.device_id,
      deviceName: x.device_name ?? null,
      placeId: x.place_id ?? null,
      ts: x.ts,
      imageUrl: x.image_url ?? null,
      source: x.source,
      hasVideo: canWatch && x.source !== 'simulator',
    }));
    res.json({ detections });
  });

  r.get(
    '/detections/:id/video',
    requireRole('hr', 'area_admin', 'dept_manager'),
    ah(async (req, res) => {
      const det = db.prepare('SELECT user_id, device_id, ts, source FROM detections WHERE id = ?').get(Number(req.params.id) || 0) as Row | undefined;
      if (!det) throw new HttpError(404, 'Không tìm thấy lượt nhận diện');
      const target = getUser(db, det.user_id);
      if (!target) throw new HttpError(404, 'Không tìm thấy lượt nhận diện');
      const viewer = currentUser(req);
      if (!canSeeUser(viewer, target)) throw denySee(viewer);
      if (det.source === 'simulator') throw new HttpError(404, 'Lượt mô phỏng không có video');
      let at: number = det.ts;
      if (req.query.at !== undefined) {
        at = Number(req.query.at);
        if (!Number.isInteger(at) || at <= 0) throw new HttpError(400, 'Thời điểm xem video không hợp lệ');
        if (Math.abs(at - det.ts) > MAX_VIDEO_DRIFT_MS) throw new HttpError(400, 'Chỉ xem được video trong vòng 24 giờ quanh lượt quẹt');
      }
      const clip = await getVideoAt({ db, fetch: ctx.fetch, now: ctx.now }, det.device_id, at);
      const body: DetectionVideo = {
        url: clip.url,
        startTs: clip.startTs,
        duration: clip.duration,
        offsetSeconds: Math.min(Math.max((at - clip.startTs) / 1000, 0), clip.duration),
        deviceName: clip.deviceName,
        // Làm tròn: duration lẻ từ Hanet không được làm ?at= của nút đoạn trước/sau bị từ chối (400)
        prevAt: Math.round(clip.startTs - 1000),
        nextAt: Math.round(clip.startTs + clip.duration * 1000 + 1000),
      };
      res.json(body);
    }),
  );

  /** Kiểm tra chung cho điều chỉnh (spec đợt C §7), theo đúng thứ tự mã lỗi. */
  const overrideTarget = (req: Request): { target: User; date: string } => {
    const actor = currentUser(req);
    if (actor.role !== 'hr' && actor.role !== 'area_admin') throw new HttpError(403, 'Bạn không có quyền điều chỉnh ngày công');
    const target = getUser(db, req.params.userId);
    if (!target || !managesArea(actor, target.areaId)) throw notFound('nhân sự');
    if (target.id === actor.id) throw new HttpError(403, 'Không thể tự điều chỉnh ngày công của mình');
    if (target.code === SYSTEM_ADMIN_CODE) throw new HttpError(400, 'Tài khoản quản trị hệ thống không chấm công');
    const date = req.params.date;
    if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    if (date > toVnDate(ctx.now())) throw new HttpError(400, 'Không điều chỉnh ngày trong tương lai');
    if (date < target.createdAt.slice(0, 10)) throw new HttpError(400, 'Ngày này trước khi tạo tài khoản nhân sự');
    return { target, date };
  };

  const dayOf = (userId: string, date: string): AttendanceDay | null => {
    const row = db.prepare(`${DAY_SELECT} WHERE a.user_id = ? AND a.work_date = ?`).get(userId, date) as Row | undefined;
    return row ? mapDay(row) : null;
  };
  const snapshot = (d: AttendanceDay | null) => (d ? { firstIn: d.firstIn, lastOut: d.lastOut, status: d.status } : null);

  r.put('/attendance/:userId/:date/adjustment', (req, res) => {
    const { target, date } = overrideTarget(req);
    const b = req.body ?? {};
    if (!OVERRIDE_KINDS.includes(b.kind)) throw new HttpError(400, 'Kiểu điều chỉnh không hợp lệ');
    const reason = parseReason(b.reason);
    let firstIn: number | null = null;
    let lastOut: number | null = null;
    if (b.kind === 'times') {
      const time = (v: unknown, label: string): number | null => {
        if (v === undefined || v === null || v === '') return null;
        try {
          return vnDateTimeToTs(date, String(v));
        } catch {
          throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
        }
      };
      firstIn = time(b.firstIn, 'Giờ vào');
      lastOut = time(b.lastOut, 'Giờ ra');
      if (firstIn === null && lastOut === null) throw new HttpError(400, 'Hãy nhập giờ vào hoặc giờ ra');
    }
    const hasRow = Boolean(db.prepare('SELECT 1 FROM attendance_days WHERE user_id = ? AND work_date = ?').get(target.id, date));
    if (!hasRow && !isWorkday(db, effectiveShift(db, target.id), date)) throw new HttpError(400, 'Ngày này không phải ngày làm việc của nhân sự');
    if (isMonthLocked(db, date)) throw lockedError(date.slice(0, 7));
    const a = actorOf(req);
    const day = tx(db, () => {
      const before = dayOf(target.id, date);
      db.prepare(
        `INSERT INTO attendance_overrides(user_id, work_date, kind, first_in, last_out, reason, created_by, created_by_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, work_date) DO UPDATE SET kind = excluded.kind, first_in = excluded.first_in, last_out = excluded.last_out,
           reason = excluded.reason, created_by = excluded.created_by, created_by_label = excluded.created_by_label, created_at = excluded.created_at`,
      ).run(target.id, date, b.kind, firstIn, lastOut, reason, a.actorId, a.actorLabel, new Date(ctx.now()).toISOString());
      recomputeDay(db, target.id, date, ctx.now());
      const after = dayOf(target.id, date);
      // Kiểm tra trên giờ hiệu lực (giờ sửa + giờ tự tính còn lại); sai thì rollback cả điều chỉnh
      if (b.kind === 'times') {
        if (!after || after.firstIn === null) throw new HttpError(400, 'Ngày này chưa có giờ vào: hãy nhập giờ vào');
        if (after.lastOut !== null && after.lastOut <= after.firstIn) throw new HttpError(400, 'Giờ ra phải sau giờ vào');
      }
      writeAudit(db, ctx.now(), {
        ...a,
        action: 'attendance.override',
        targetUserId: target.id,
        targetLabel: personLabel(target.name, target.code),
        areaId: target.areaId,
        workDate: date,
        before: snapshot(before),
        after: { ...snapshot(after), kind: b.kind },
        reason,
      });
      return after;
    });
    res.json({ day });
  });

  r.delete('/attendance/:userId/:date/adjustment', (req, res) => {
    const { target, date } = overrideTarget(req);
    const reason = parseReason((req.body ?? {}).reason);
    if (!readOverride(db, target.id, date)) throw new HttpError(404, 'Ngày này chưa được điều chỉnh');
    if (isMonthLocked(db, date)) throw lockedError(date.slice(0, 7));
    const a = actorOf(req);
    const day = tx(db, () => {
      const before = dayOf(target.id, date);
      db.prepare('DELETE FROM attendance_overrides WHERE user_id = ? AND work_date = ?').run(target.id, date);
      recomputeDay(db, target.id, date, ctx.now());
      const after = dayOf(target.id, date);
      writeAudit(db, ctx.now(), {
        ...a,
        action: 'attendance.override_remove',
        targetUserId: target.id,
        targetLabel: personLabel(target.name, target.code),
        areaId: target.areaId,
        workDate: date,
        before: snapshot(before),
        after: snapshot(after),
        reason,
      });
      return after;
    });
    res.json({ day });
  });

  r.post('/attendance/recompute', requireGlobalHr, (req, res) => {
    const { from, to } = req.body ?? {};
    if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    const span = daysBetween(from, to);
    if (span < 0) throw new HttpError(400, 'Ngày bắt đầu phải trước ngày kết thúc');
    if (span >= MAX_RECOMPUTE_DAYS) throw new HttpError(400, `Mỗi lần chỉ tính lại tối đa ${MAX_RECOMPUTE_DAYS} ngày`);
    res.json({ updated: recomputeRange(db, from, to) });
  });

  r.get('/stats', (req, res) => {
    const actor = currentUser(req);
    const filter = parseAreaFilter(db, actor, req.query.area);
    const w = scopeWhere(scopeFor(actor), 'u.id', 'u.department_id');
    const f = areaFilterSql(filter, 'u.department_id');
    const where = `${w.sql} AND ${f.sql}`;
    const params = [...w.params, ...f.params];
    const date = toVnDate(ctx.now());
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where}`).get(...params) as { c: number };
    const day = db
      .prepare(
        `SELECT
           SUM(CASE WHEN a.first_in IS NOT NULL THEN 1 ELSE 0 END) AS present,
           SUM(CASE WHEN ${DETAIL_FILTER.on_time} THEN 1 ELSE 0 END) AS on_time,
           SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late,
           SUM(CASE WHEN a.status = 'missing_out' THEN 1 ELSE 0 END) AS missing_out,
           SUM(CASE WHEN a.early_arrival_minutes > 0 THEN 1 ELSE 0 END) AS early_arrival,
           SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
           SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END) AS leave,
           SUM(CASE WHEN a.status = 'business_trip' THEN 1 ELSE 0 END) AS business_trip
         FROM attendance_days a JOIN users u ON u.id = a.user_id
         WHERE a.work_date = ? AND u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where}`,
      )
      .get(date, ...params) as Record<string, number | null>;
    const noRow = (
      db
        .prepare(
          `SELECT u.id FROM users u LEFT JOIN attendance_days a ON a.user_id = u.id AND a.work_date = ?
           WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where} AND a.user_id IS NULL`,
        )
        .all(date, ...params) as { id: string }[]
    ).map((r) => r.id);
    const notCheckedIn = noRow.filter((id) => isWorkday(db, effectiveShift(db, id), date)).length;
    const pending = db
      .prepare(`SELECT COUNT(*) AS c FROM requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' AND ${where}`)
      .get(...params) as { c: number };
    const cs = cameraScopeSql(actor);
    const cf = areaColumnSql(filter, 'c.area_id');
    const cameras = db.prepare(`SELECT COUNT(*) AS c FROM cameras c WHERE ${cs.sql} AND ${cf.sql}`).get(...cs.params, ...cf.params) as { c: number };
    const body: StatsData = {
      date,
      totalEmployees: total.c,
      presentCount: day.present ?? 0,
      onTimeCount: day.on_time ?? 0,
      lateCount: day.late ?? 0,
      missingOutCount: day.missing_out ?? 0,
      earlyArrivalCount: day.early_arrival ?? 0,
      absentCount: day.absent ?? 0,
      leaveCount: day.leave ?? 0,
      businessTripCount: day.business_trip ?? 0,
      notCheckedInCount: notCheckedIn,
      pendingRequests: pending.c,
      totalCameras: cameras.c,
    };
    res.json(body);
  });

  r.get('/stats/details', (req, res) => {
    const type = req.query.type as StatsDetailType;
    if (typeof type !== 'string' || !Object.hasOwn(DETAIL_FILTER, type)) throw new HttpError(400, 'Loại thống kê không hợp lệ');
    const actor = currentUser(req);
    const w = scopeWhere(scopeFor(actor), 'u.id', 'u.department_id');
    const f = areaFilterSql(parseAreaFilter(db, actor, req.query.area), 'u.department_id');
    const date = toVnDate(ctx.now());
    let rows = db
      .prepare(
        `SELECT u.id, u.code, u.name, d.name AS department_name, a.first_in, a.last_out, a.late_minutes, a.early_minutes, a.early_arrival_minutes, a.status, a.final
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN attendance_days a ON a.user_id = u.id AND a.work_date = ?
         WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${w.sql} AND ${f.sql} AND ${DETAIL_FILTER[type]}
         ORDER BY a.first_in IS NULL, a.first_in, u.code`,
      )
      .all(date, ...w.params, ...f.params) as Row[];
    if (type === 'not_checked_in') {
      rows = rows.filter((x) => isWorkday(db, effectiveShift(db, x.id), date));
    }
    const out: StatsDetailRow[] = rows.map((x) => ({
      userId: x.id,
      employeeCode: x.code,
      employeeName: x.name,
      departmentName: x.department_name ?? null,
      firstIn: x.first_in ?? null,
      lastOut: x.last_out ?? null,
      lateMinutes: x.late_minutes ?? 0,
      earlyArrivalMinutes: x.early_arrival_minutes ?? 0,
      earlyMinutes: x.early_minutes ?? 0,
      status: x.status ?? null,
      final: x.final === 1,
    }));
    res.json({ date, type, rows: out });
  });

  return r;
}
