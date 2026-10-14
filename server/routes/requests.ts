import { Router } from 'express';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { newId, tx } from '../db';
import { HttpError } from '../errors';
import { currentUser, requireRole } from '../middleware';
import type { Row } from '../repo';
import { scopeFor, scopeWhere } from '../auth';
import { areaFilterSql, deptAreaId, managesArea, notFound, parseAreaFilter } from '../access';
import { applyDayAdjustment, type DayAdjustment } from '../attendance';
import { isValidDate, parseHHmm, toVnDate, vnDateTimeToTs } from '../vntime';
import type { AttendanceRequest, RequestType } from '../../shared/types';

const TYPES: RequestType[] = ['missed_punch', 'late_explanation', 'leave_request'];

const REQUEST_SELECT = `SELECT r.*, u.name AS employee_name, u.code AS employee_code, u.department_id, rv.name AS reviewer_name
  FROM requests r JOIN users u ON u.id = r.user_id LEFT JOIN users rv ON rv.id = r.reviewed_by`;

function mapRequest(r: Row): AttendanceRequest {
  return {
    id: r.id,
    userId: r.user_id,
    employeeName: r.employee_name,
    employeeCode: r.employee_code,
    departmentId: r.department_id ?? null,
    workDate: r.work_date,
    type: r.type,
    reason: r.reason,
    suggestedIn: r.suggested_in ?? null,
    suggestedOut: r.suggested_out ?? null,
    status: r.status,
    reviewedBy: r.reviewed_by ?? null,
    reviewerName: r.reviewer_name ?? null,
    reviewedAt: r.reviewed_at ?? null,
    comment: r.comment ?? null,
    createdAt: r.created_at,
  };
}

function getRequest(db: Db, id: string): AttendanceRequest | null {
  const row = db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
  return row ? mapRequest(row) : null;
}

function optionalTime(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  try {
    parseHHmm(String(v));
  } catch {
    throw new HttpError(400, `${label} không hợp lệ (định dạng HH:mm)`);
  }
  return String(v);
}

export function requestRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/requests', (req, res) => {
    const actor = currentUser(req);
    const w = scopeWhere(scopeFor(actor), 'u.id', 'u.department_id');
    const f = areaFilterSql(parseAreaFilter(db, actor, req.query.area), 'u.department_id');
    const rows = db.prepare(`${REQUEST_SELECT} WHERE ${w.sql} AND ${f.sql} ORDER BY r.created_at DESC`).all(...w.params, ...f.params) as Row[];
    res.json({ requests: rows.map(mapRequest) });
  });

  r.post('/requests', (req, res) => {
    const user = currentUser(req);
    const b = req.body ?? {};
    if (!isValidDate(b.workDate)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    if (b.workDate > toVnDate(ctx.now())) throw new HttpError(400, 'Không thể gửi đơn cho ngày trong tương lai');
    if (!TYPES.includes(b.type)) throw new HttpError(400, 'Loại đơn không hợp lệ');
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (!reason) throw new HttpError(400, 'Vui lòng nhập lý do');
    let suggestedIn: string | null = null;
    let suggestedOut: string | null = null;
    if (b.type === 'missed_punch') {
      suggestedIn = optionalTime(b.suggestedIn, 'Giờ vào đề xuất');
      suggestedOut = optionalTime(b.suggestedOut, 'Giờ ra đề xuất');
      if (!suggestedIn && !suggestedOut) throw new HttpError(400, 'Đơn quên quẹt cần ít nhất giờ vào hoặc giờ ra đề xuất');
    }
    const id = newId('req');
    db.prepare(
      `INSERT INTO requests(id, user_id, work_date, type, reason, suggested_in, suggested_out, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(id, user.id, b.workDate, b.type, reason, suggestedIn, suggestedOut, new Date(ctx.now()).toISOString());
    res.json({ request: getRequest(db, id) });
  });

  r.put('/requests/:id', requireRole('hr', 'area_admin', 'dept_manager'), (req, res) => {
    const reviewer = currentUser(req);
    const target = getRequest(db, req.params.id);
    if (!target) throw new HttpError(404, 'Không tìm thấy đơn');
    if (reviewer.role === 'area_admin' && !managesArea(reviewer, target.departmentId ? (deptAreaId(db, target.departmentId) ?? null) : null)) {
      throw notFound('đơn');
    }
    if (reviewer.role === 'area_admin') {
      const owner = db.prepare('SELECT role FROM users WHERE id = ?').get(target.userId) as { role: string } | undefined;
      if (!owner || (owner.role !== 'employee' && owner.role !== 'dept_manager')) {
        throw new HttpError(403, 'Bạn không có quyền duyệt đơn của tài khoản này');
      }
    }
    if (target.userId === reviewer.id) throw new HttpError(403, 'Không thể tự duyệt đơn của mình');
    if (reviewer.role === 'dept_manager' && (!reviewer.departmentId || target.departmentId !== reviewer.departmentId)) {
      throw new HttpError(403, 'Trưởng phòng chỉ được duyệt đơn của phòng mình');
    }
    const { status, comment } = req.body ?? {};
    if (status !== 'approved' && status !== 'rejected') throw new HttpError(400, 'Trạng thái duyệt không hợp lệ');
    if (target.status !== 'pending') throw new HttpError(409, 'Đơn đã được xử lý');

    tx(db, () => {
      db.prepare('UPDATE requests SET status = ?, comment = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?').run(
        status,
        typeof comment === 'string' ? comment.trim() : '',
        reviewer.id,
        new Date(ctx.now()).toISOString(),
        target.id,
      );
      if (status !== 'approved') return;
      if (target.type === 'late_explanation') {
        applyDayAdjustment(db, target.userId, target.workDate, { lateExcused: true });
      } else if (target.type === 'missed_punch') {
        const hasDetection = db.prepare('SELECT 1 FROM detections WHERE user_id = ? AND work_date = ? LIMIT 1').get(target.userId, target.workDate);
        if (!target.suggestedIn && !hasDetection) {
          throw new HttpError(400, 'Ngày này chưa có lượt nhận diện, đơn quên quẹt cần có giờ vào đề xuất');
        }
        const patch: Partial<DayAdjustment> = {};
        if (target.suggestedIn) patch.manualIn = vnDateTimeToTs(target.workDate, target.suggestedIn);
        if (target.suggestedOut) patch.manualOut = vnDateTimeToTs(target.workDate, target.suggestedOut);
        applyDayAdjustment(db, target.userId, target.workDate, patch);
      }
      // leave_request: chỉ đổi trạng thái đơn (nghỉ phép đầy đủ làm ở dự án sau)
    });
    res.json({ request: getRequest(db, target.id) });
  });

  return r;
}
