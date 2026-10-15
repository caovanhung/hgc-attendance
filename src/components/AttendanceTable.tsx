import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, Eye, Lock, Search } from 'lucide-react';
import type { AttendanceDay, Department, MonthLock, User } from '../types';
import { api } from '../api';
import { DAY_STATUS_LABEL, DAY_STATUS_STYLE, fmtTime } from '../format';
import { inputCls } from './ui';
import { DayDetailModal } from './DayDetailModal';
import { OverrideBadge } from './OverrideBadge';

interface AttendanceTableProps {
  records: AttendanceDay[];
  currentUser: User;
  departments: Department[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onRefresh: () => void;
}


export const AttendanceTable: React.FC<AttendanceTableProps> = ({
  records,
  currentUser,
  departments,
  selectedDate,
  setSelectedDate,
  selectedDept,
  setSelectedDept,
  searchQuery,
  setSearchQuery,
  onRefresh,
}) => {
  const [detail, setDetail] = useState<AttendanceDay | null>(null);
  const [lockedMonths, setLockedMonths] = useState<string[]>([]);
  const year = selectedDate.slice(0, 4);
  // Tháng đã khóa sổ: hộp chi tiết ẩn nút Điều chỉnh (chỉ HR / quản trị khu điều chỉnh được)
  useEffect(() => {
    if (currentUser.role !== 'hr' && currentUser.role !== 'area_admin') return;
    api<{ locks: MonthLock[] }>(`/api/month-locks?year=${year}`)
      .then((r) => setLockedMonths(r.locks.map((l) => l.month)))
      .catch(() => setLockedMonths([]));
  }, [year, currentUser.role]);
  const role = currentUser.role;


  const handleExportCSV = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const headers = ['Mã NV', 'Họ tên', 'Phòng', 'Ngày', 'Giờ vào', 'Giờ ra', 'Đến sớm (phút)', 'Phút muộn', 'Phút về sớm', 'Trạng thái'];
    const rows = records.map((r) =>
      [
        r.employeeCode,
        r.employeeName,
        r.departmentName ?? '',
        r.workDate,
        r.firstIn !== null ? fmtTime(r.firstIn) : '',
        r.lastOut !== null ? fmtTime(r.lastOut) : '',
        r.earlyArrivalMinutes,
        r.lateMinutes,
        r.earlyMinutes,
        DAY_STATUS_LABEL[r.status],
      ]
        .map(esc)
        .join(','),
    );
    const blob = new Blob(['\ufeff' + [headers.map(esc).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bang_cong_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
      <div className="px-4 py-2.5 text-xs flex items-center justify-between border-b bg-surface-tint border-brand-100 text-slate-700">
        <span className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-brand-600" />
          {role === 'hr' && 'Bạn xem được bảng công của toàn công ty.'}
          {role === 'area_admin' && 'Bạn xem được bảng công của các khu bạn quản lý.'}
          {role === 'dept_manager' && `Bạn xem được bảng công của phòng ${currentUser.departmentName ?? ''}.`}
          {role === 'employee' && 'Bạn xem được bảng công của chính mình.'}
        </span>
        <span className="text-xs font-semibold text-brand-700">{records.length} người</span>
      </div>

      <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {role !== 'employee' && (
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm theo tên hoặc mã NV..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputCls} pl-9`}
              />
            </div>
          )}
          <input type="date" value={selectedDate} onChange={(e) => e.target.value && setSelectedDate(e.target.value)} className={`${inputCls} w-auto!`} />
          {(role === 'hr' || role === 'area_admin') && (
            <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className={`${inputCls} w-auto!`}>
              <option value="">Tất cả phòng ban</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={handleExportCSV}
          disabled={records.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-brand-50 hover:border-brand-200 hover:text-brand-800 text-slate-700 text-sm font-semibold cursor-pointer disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Xuất CSV</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-muted border-b border-border text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <th className="py-3 px-4">Nhân sự</th>
              <th className="py-3 px-4">Phòng ban</th>
              <th className="py-3 px-4">Giờ vào</th>
              <th className="py-3 px-4">Giờ ra</th>
              <th className="py-3 px-4">Trạng thái</th>
              <th className="py-3 px-4">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="w-8 h-8 text-slate-300" />
                    <span>Không có dữ liệu điểm danh cho ngày này</span>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={`${r.userId}-${r.workDate}`} className="hover:bg-brand-50/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{r.employeeName}</div>
                    <div className="text-xs text-slate-500 font-mono">{r.employeeCode}</div>
                  </td>
                  <td className="py-3 px-4">{r.departmentName ?? '—'}</td>
                  <td className="py-3 px-4 font-mono">
                    {fmtTime(r.firstIn)}
                    {r.manualIn !== null && <span className="ml-1 text-[11px] text-sky-700">(bổ sung)</span>}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {!r.final ? (
                      r.lastOut !== null ? (
                        <span className="text-slate-500 text-xs">
                          Lần quẹt gần nhất {fmtTime(r.lastOut)}
                          {r.manualOut !== null && <span className="ml-1 text-[11px] text-sky-700">(bổ sung)</span>}
                        </span>
                      ) : (
                        '—'
                      )
                    ) : (
                      <>
                        {fmtTime(r.lastOut)}
                        {r.manualOut !== null && <span className="ml-1 text-[11px] text-sky-700">(bổ sung)</span>}
                      </>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${DAY_STATUS_STYLE[r.status]}`}>
                      {DAY_STATUS_LABEL[r.status]}
                      {r.status !== 'absent' && r.status !== 'leave' && r.status !== 'business_trip' && (
                        <>
                          {r.earlyArrivalMinutes > 0 && ` · đến sớm ${r.earlyArrivalMinutes}'`}
                          {r.lateMinutes > 0 && ` · muộn ${r.lateMinutes}'`}
                          {r.earlyMinutes > 0 && ` · sớm ${r.earlyMinutes}'`}
                        </>
                      )}
                    </span>
                    {!r.final && (r.status === 'missing_out' || r.status === 'on_time' || r.status === 'late') && (
                      <div className="text-[11px] text-sky-700 mt-0.5">Đang trong giờ làm</div>
                    )}
                    {r.lateExcused && <div className="text-[11px] text-emerald-700 mt-0.5">Đã duyệt giải trình</div>}
                    {r.override && (
                      <div className="mt-1">
                        <OverrideBadge override={r.override} />
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <button onClick={() => setDetail(r)} className="text-xs text-brand-700 font-semibold hover:underline flex items-center gap-1 cursor-pointer">
                      <Eye className="w-3 h-3" /> {r.detectionCount} lượt
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <DayDetailModal
          userId={detail.userId}
          userName={detail.employeeName}
          date={detail.workDate}
          day={detail}
          currentUser={currentUser}
          locked={lockedMonths.includes(detail.workDate.slice(0, 7))}
          onClose={() => setDetail(null)}
          onChanged={() => onRefresh()}
        />
      )}
    </div>
  );
};
