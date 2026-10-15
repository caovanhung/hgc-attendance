import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Download, Lock, LockOpen } from 'lucide-react';
import type { AttendanceDay, Department, MeResponse, MonthlyReport } from '../types';
import { api, errorMessage } from '../api';
import { SYMBOL_LEGEND, SYMBOL_STYLE, WEEKDAY_LABEL, fmtDateTime, thisMonth } from '../format';
import { Modal, inputCls, primaryBtn, secondaryBtn } from './ui';
import { DayDetailModal } from './DayDetailModal';

const th = 'py-3 px-3 text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap';
const td = 'py-2.5 px-3 tabular-nums';

/** Tab "Báo cáo tháng": bảng tổng hợp và lưới chấm công, xuất Excel, khóa sổ (HR). */
export const MonthlyReportTab: React.FC<{ me: MeResponse; departments: Department[]; area: string }> = ({ me, departments, area }) => {
  const user = me.user;
  const managerView = user.role === 'hr' || user.role === 'area_admin';
  const [month, setMonth] = useState(thisMonth());
  const [department, setDepartment] = useState('');
  const [view, setView] = useState<'summary' | 'grid'>('summary');
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cell, setCell] = useState<{ userId: string; name: string; date: string; day: AttendanceDay | null } | null>(null);
  const [confirm, setConfirm] = useState<'lock' | 'unlock' | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams({ month });
  if (area !== 'all') params.set('area', area);
  if (managerView && department) params.set('department', department);
  const query = params.toString();

  const load = useCallback(async () => {
    try {
      setReport(await api<MonthlyReport>(`/api/reports/monthly?${query}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  // Phòng đã chọn không còn trong danh sách (đổi khu) thì bỏ chọn
  useEffect(() => {
    if (department && !departments.some((d) => d.id === department)) setDepartment('');
  }, [departments, department]);

  const openCell = async (userId: string, name: string, date: string) => {
    try {
      const r = await api<{ records: AttendanceDay[] }>(`/api/attendance?date=${date}`);
      setCell({ userId, name, date, day: r.records.find((x) => x.userId === userId) ?? null });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const runLock = async () => {
    if (!confirm) return;
    setBusy(true);
    setConfirmError(null);
    try {
      await api(`/api/month-locks/${month}`, { method: confirm === 'lock' ? 'POST' : 'DELETE' });
      setConfirm(null);
      await load();
    } catch (err) {
      setConfirmError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const monthText = `${month.slice(5, 7)}/${month.slice(0, 4)}`;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-border border-l-4 border-l-brand-500 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-brand-navy">Báo cáo tháng</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {report?.scopeLabel ?? '…'} · Ngày công = đi làm + công tác; tỷ lệ chuyên cần = (ngày công + nghỉ phép) / ngày phải làm.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input type="month" className={`${inputCls} w-full sm:w-auto!`} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            {managerView && (
              <select className={`${inputCls} w-full sm:w-auto!`} value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a href={`/api/reports/monthly.xlsx?${query}`} className={`${primaryBtn} flex-1 sm:flex-none justify-center whitespace-nowrap`}>
              <Download className="w-4 h-4" /> Xuất Excel
            </a>
            {user.role === 'hr' && report && (
              <button type="button" className={`${secondaryBtn} flex-1 sm:flex-none justify-center whitespace-nowrap`} onClick={() => setConfirm(report.lock ? 'unlock' : 'lock')}>
                {report.lock ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {report.lock ? 'Mở khóa sổ' : 'Khóa sổ tháng'}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {report?.lock && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Lock className="w-4 h-4" /> Tháng {monthText} đã khóa sổ lúc {fmtDateTime(report.lock.lockedAt)} bởi {report.lock.lockedByName}. Ngày công tháng này không
          thay đổi được nữa.
        </div>
      )}

      {report && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-100 bg-surface-tint flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
              {(['summary', 'grid'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${view === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-brand-700'}`}
                >
                  {v === 'summary' ? 'Tổng hợp' : 'Lưới chấm công'}
                </button>
              ))}
            </div>
            <span className="text-xs font-semibold text-brand-700">{report.rows.length} người</span>
          </div>

          {report.rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">Không có nhân sự nào trong phạm vi này.</p>
          ) : view === 'summary' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted border-b border-border">
                  <tr>
                    {['Mã NV', 'Họ tên', 'Phòng ban', 'Phải làm', 'Ngày công', 'Muộn (lần/phút)', 'Về sớm (lần/phút)', 'Thiếu giờ ra', 'Vắng', 'Phép', 'Công tác', 'Chuyên cần'].map(
                      (h) => (
                        <th key={h} className={th}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {report.rows.map((r) => (
                    <tr key={r.userId} className="hover:bg-brand-50/40">
                      <td className={`${td} font-mono text-xs text-slate-500`}>{r.employeeCode}</td>
                      <td className={`${td} font-semibold text-slate-900`}>{r.employeeName}</td>
                      <td className={td}>{r.departmentName ?? '—'}</td>
                      <td className={td}>{r.requiredDays}</td>
                      <td className={`${td} font-semibold text-slate-900`}>{r.workDays}</td>
                      <td className={`${td} ${r.lateCount ? 'text-amber-800' : ''}`}>
                        {r.lateCount} / {r.lateMinutes}'
                      </td>
                      <td className={`${td} ${r.earlyCount ? 'text-amber-800' : ''}`}>
                        {r.earlyCount} / {r.earlyMinutes}'
                      </td>
                      <td className={td}>{r.missingOutDays}</td>
                      <td className={`${td} ${r.absentDays ? 'text-rose-700 font-semibold' : ''}`}>{r.absentDays}</td>
                      <td className={td}>{r.leaveDays}</td>
                      <td className={td}>{r.businessTripDays}</td>
                      <td className={`${td} font-semibold`}>{r.attendanceRate === null ? '—' : `${r.attendanceRate}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface-muted border-b border-border">
                      <th className="sticky left-0 z-10 bg-surface-muted py-2 px-3 text-left font-semibold text-slate-600 min-w-44">Nhân sự</th>
                      {report.days.map((d) => (
                        <th
                          key={d.date}
                          title={d.holiday ?? undefined}
                          className={`py-1.5 px-0 w-8 min-w-8 text-center font-semibold ${d.weekday >= 6 || d.holiday ? 'text-slate-400' : 'text-slate-600'}`}
                        >
                          <div>{Number(d.date.slice(8))}</div>
                          <div className="text-[10px] font-normal">{WEEKDAY_LABEL[d.weekday]}</div>
                        </th>
                      ))}
                      <th className="py-2 px-2 font-semibold text-slate-600">Công</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.rows.map((r) => (
                      <tr key={r.userId}>
                        <td className="sticky left-0 z-10 bg-white py-1.5 px-3 border-r border-slate-100">
                          <div className="font-semibold text-slate-900 text-sm truncate max-w-48">{r.employeeName}</div>
                          <div className="font-mono text-[11px] text-slate-500">{r.employeeCode}</div>
                        </td>
                        {r.cells.map((c, k) => {
                          const d = report.days[k];
                          const sym = c?.replace('*', '') ?? '';
                          const off = d.weekday >= 6 || d.holiday;
                          return (
                            <td key={d.date} className={`p-0.5 text-center ${off && !c ? 'bg-slate-50' : ''}`}>
                              {c ? (
                                <button
                                  type="button"
                                  onClick={() => openCell(r.userId, r.employeeName, d.date)}
                                  title={c.endsWith('*') ? 'Đã điều chỉnh' : undefined}
                                  className={`w-7 h-7 rounded-md text-[11px] font-bold cursor-pointer hover:ring-2 hover:ring-brand-300 ${SYMBOL_STYLE[sym] ?? ''} ${c.endsWith('*') ? 'ring-1 ring-brand-400' : ''}`}
                                >
                                  {c}
                                </button>
                              ) : null}
                            </td>
                          );
                        })}
                        <td className="py-1.5 px-2 text-center font-semibold text-slate-900 tabular-nums">{r.workDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">{SYMBOL_LEGEND}</p>
            </>
          )}
        </div>
      )}

      {cell && (
        <DayDetailModal
          userId={cell.userId}
          userName={cell.name}
          date={cell.date}
          day={cell.day}
          currentUser={user}
          locked={Boolean(report?.lock)}
          onClose={() => setCell(null)}
          onChanged={() => load()}
        />
      )}

      {confirm && (
        <Modal title={confirm === 'lock' ? `Khóa sổ tháng ${monthText}` : `Mở khóa sổ tháng ${monthText}`} onClose={() => setConfirm(null)}>
          <div className="space-y-3.5">
            <p>
              {confirm === 'lock'
                ? 'Sau khi khóa, ngày công tháng này không thay đổi được nữa: không điều chỉnh, không duyệt đơn, không tính lại. Chỉ khóa sau khi đã gửi bảng công cho kế toán.'
                : 'Mở khóa cho phép thay đổi ngày công tháng này trở lại. Hệ thống không tự tính lại; dùng "Tính lại" nếu cần.'}
            </p>
            {confirmError && <p className="text-rose-600">{confirmError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirm(null)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="button" onClick={runLock} disabled={busy} className={`${primaryBtn} flex-1`}>
                {confirm === 'lock' ? 'Khóa sổ' : 'Mở khóa'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
