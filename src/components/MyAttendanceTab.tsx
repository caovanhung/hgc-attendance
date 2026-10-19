import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CalendarClock, Lock, UserRound } from 'lucide-react';
import type { AttendanceDay, DayStatus, MeResponse, MyAttendance, RequestType } from '../types';
import { api, errorMessage } from '../api';
import { DAY_STATUS_LABEL, DAY_STATUS_STYLE, WEEKDAY_LABEL, fmtDate, fmtDateTime, fmtTime, formatWorkDays, getAttendanceStatusText, thisMonth } from '../format';
import { inputCls, secondaryBtn } from './ui';
import { DayDetailModal } from './DayDetailModal';
import { OverrideBadge } from './OverrideBadge';
import { RequestFormModal } from './RequestFormModal';

/** Loại đơn gợi ý cho từng trạng thái ngày (nút "Nộp đơn"). */
function requestTypeFor(day: AttendanceDay): RequestType | null {
  if (day.status === 'late' || day.status === 'late_and_early') return 'late_explanation';
  if (day.status === 'missing_out' && day.final) return 'missed_punch';
  if (day.status === 'absent' || day.status === 'early_leave') return 'leave_request';
  return null;
}

const StatusPill: React.FC<{ day: AttendanceDay }> = ({ day }) => {
  const st = getAttendanceStatusText(day);
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${st.style}`}>
      {st.label}
    </span>
  );
};

/** Tab "Của tôi": thông tin, hôm nay, lịch sử tháng của chính người đăng nhập. */
export const MyAttendanceTab: React.FC<{ me: MeResponse }> = ({ me }) => {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<MyAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AttendanceDay | null>(null);
  const [requestFor, setRequestFor] = useState<{ type: RequestType; workDate: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<MyAttendance>(`/api/me/attendance?month=${month}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        <AlertCircle className="w-4 h-4" /> {error}
      </div>
    );
  }
  if (!data) return <p className="text-sm text-slate-500">Đang tải...</p>;
  if (!data.tracked || !data.profile) {
    return (
      <div className="bg-white rounded-2xl border border-border shadow-card p-10 text-center text-sm text-slate-500">
        Tài khoản quản trị hệ thống không chấm công.
      </div>
    );
  }

  const { profile, today, report } = data;
  const card = 'bg-white rounded-2xl border border-border shadow-card p-5';
  const stats: [string, string, string][] = report
    ? [
        ['Ngày công', String(report.workDays), 'text-brand-navy'],
        ['Đi muộn', `${report.lateCount} lần · ${report.lateMinutes}'`, report.lateCount ? 'text-amber-700' : 'text-brand-navy'],
        ['Về sớm', `${report.earlyCount} lần`, report.earlyCount ? 'text-amber-700' : 'text-brand-navy'],
        ['Vắng', String(report.absentDays), report.absentDays ? 'text-rose-700' : 'text-brand-navy'],
        ['Nghỉ phép', String(report.leaveDays), 'text-brand-navy'],
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${card} border-l-4 border-l-brand-500`}>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <UserRound className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-brand-navy truncate">{profile.name}</h2>
              <p className="text-xs text-slate-500">
                <span className="font-mono">{profile.code}</span> · {profile.departmentName ?? 'Chưa có phòng ban'}
                {profile.position ? ` · ${profile.position}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <CalendarClock className="w-4 h-4 text-brand-600" />
            <span>
              <strong>{profile.shift.name}</strong> · {profile.shift.workStart}–{profile.shift.workEnd} · {formatWorkDays(profile.shift.workDays)}
            </span>
          </div>
        </div>
        <div className={card}>
          <h3 className="font-bold text-sm text-brand-navy">Hôm nay</h3>
          {today ? (
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Giờ vào</div>
                <div className="font-mono text-lg font-semibold text-slate-900">{fmtTime(today.firstIn)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{today.final ? 'Giờ ra' : 'Lần quẹt gần nhất'}</div>
                <div className="font-mono text-lg font-semibold text-slate-900">{fmtTime(today.lastOut)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Trạng thái</div>
                <div className="mt-1">
                  <StatusPill day={today} />
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Chưa có dữ liệu điểm danh hôm nay.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-100 bg-surface-tint flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-sm text-brand-navy">Lịch sử điểm danh tháng {month.slice(5, 7)}/{month.slice(0, 4)}</h3>
          <input type="month" className={`${inputCls} w-auto!`} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 border-b border-slate-100">
          {stats.map(([label, value, color]) => (
            <div key={label} className="rounded-xl border border-slate-100 bg-surface-muted p-3">
              <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        {data.lock && (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Lock className="w-4 h-4" /> Tháng này đã khóa sổ lúc {fmtDateTime(data.lock.lockedAt)}.
          </div>
        )}
        {notice && <p className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
        {/* Desktop: Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted border-b border-border text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <tr>
                <th className="py-3 px-4">Ngày</th>
                <th className="py-3 px-4">Giờ vào</th>
                <th className="py-3 px-4">Giờ ra</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {data.days.map((d) => {
                const r = d.record;
                const reqType = r ? requestTypeFor(r) : null;
                const muted = !r && !d.workday;
                return (
                  <tr
                    key={d.date}
                    onClick={() => r && setDetail(r)}
                    className={`${r ? 'cursor-pointer hover:bg-brand-50/40' : ''} ${muted ? 'text-slate-400 bg-slate-50/50' : ''}`}
                  >
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-semibold">{fmtDate(d.date).slice(0, 5)}</span> <span className="text-xs">{WEEKDAY_LABEL[d.weekday]}</span>
                      {d.holiday && <span className="ml-2 text-xs text-slate-500">{d.holiday}</span>}
                    </td>
                    <td className="py-2.5 px-4 font-mono">{r ? fmtTime(r.firstIn) : ''}</td>
                    <td className="py-2.5 px-4 font-mono">
                      {r && (!r.final && r.lastOut !== null ? <span className="text-xs text-slate-500">Lần quẹt gần nhất {fmtTime(r.lastOut)}</span> : fmtTime(r.lastOut))}
                    </td>
                    <td className="py-2.5 px-4">
                      {r && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill day={r} />
                          {r.override && <OverrideBadge override={r.override} />}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {r && reqType && !data.lock && (
                        <button
                          type="button"
                          className={`${secondaryBtn} py-1 px-2.5 text-xs whitespace-nowrap shrink-0`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRequestFor({ type: reqType, workDate: d.date });
                          }}
                        >
                          Nộp đơn
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile: Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {data.days.map((d) => {
            const r = d.record;
            const reqType = r ? requestTypeFor(r) : null;
            const muted = !r && !d.workday;

            return (
              <div
                key={d.date}
                onClick={() => r && setDetail(r)}
                className={`p-3.5 transition-colors ${r ? 'cursor-pointer hover:bg-brand-50/30' : ''} ${muted ? 'bg-slate-50/50 text-slate-400' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-slate-900">{fmtDate(d.date).slice(0, 5)}</span>
                      <span className="text-xs text-slate-500 font-medium">{WEEKDAY_LABEL[d.weekday]}</span>
                      {d.holiday && <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-medium">{d.holiday}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {r ? (
                      <>
                        <StatusPill day={r} />
                        {r.override && <OverrideBadge override={r.override} />}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">{d.workday ? 'Chưa có công' : 'Nghỉ'}</span>
                    )}
                  </div>
                </div>

                {r && (
                  <div className="mt-2 grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-50 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Giờ vào</span>
                      <span className="font-mono font-semibold text-slate-800 text-sm">
                        {r.firstIn !== null ? fmtTime(r.firstIn) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Giờ ra</span>
                      <span className="font-mono font-semibold text-slate-800 text-sm">
                        {!r.final && r.lastOut !== null ? (
                          <span className="text-slate-600 text-xs font-sans">
                            Gần nhất <span className="font-mono font-semibold">{fmtTime(r.lastOut)}</span>
                          </span>
                        ) : (
                          r.lastOut !== null ? fmtTime(r.lastOut) : '—'
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {r && reqType && !data.lock && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-end">
                    <button
                      type="button"
                      className={`${secondaryBtn} py-1 px-3 text-xs whitespace-nowrap shrink-0`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRequestFor({ type: reqType, workDate: d.date });
                      }}
                    >
                      Nộp đơn giải trình / xin phép
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {detail && (
        <DayDetailModal
          userId={detail.userId}
          userName={detail.employeeName}
          date={detail.workDate}
          day={detail}
          currentUser={me.user}
          locked={Boolean(data.lock)}
          onClose={() => setDetail(null)}
          onChanged={() => load()}
        />
      )}
      {requestFor && (
        <RequestFormModal
          initial={requestFor}
          onClose={() => setRequestFor(null)}
          onSaved={() => {
            setRequestFor(null);
            setNotice('Đã gửi đơn. Theo dõi trạng thái ở tab "Giải trình / Xin phép".');
          }}
        />
      )}
    </div>
  );
};
