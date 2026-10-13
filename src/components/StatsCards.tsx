import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, LogOut, UserX, Users } from 'lucide-react';
import type { StatsData, StatsDetailRow, StatsDetailType, User } from '../types';
import { api, errorMessage } from '../api';
import { DAY_STATUS_LABEL, fmtTime } from '../format';
import { Modal } from './ui';

interface StatsCardsProps {
  stats: StatsData | null;
  currentUser: User;
  onOpenRequests: () => void;
}

interface Card {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  detail: StatsDetailType | 'requests';
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, currentUser, onOpenRequests }) => {
  const [open, setOpen] = useState<{ type: StatsDetailType; label: string } | null>(null);
  if (!stats) return null;
  const scopeLabel =
    currentUser.role === 'hr' ? 'Toàn công ty' : currentUser.role === 'dept_manager' ? `Phòng ${currentUser.departmentName ?? ''}` : 'Cá nhân';
  const cards: Card[] = [
    { label: 'Nhân sự đang làm', value: stats.totalEmployees, icon: Users, tone: 'bg-slate-100 text-slate-700', detail: 'total' },
    { label: 'Có mặt hôm nay', value: stats.presentCount, icon: CheckCircle, tone: 'bg-emerald-100 text-emerald-700', detail: 'present' },
    { label: 'Vào đúng giờ', value: stats.onTimeCount, icon: Clock, tone: 'bg-sky-100 text-sky-700', detail: 'on_time' },
    { label: 'Đi muộn', value: stats.lateCount, icon: AlertTriangle, tone: 'bg-rose-100 text-rose-700', detail: 'late' },
    { label: 'Chưa có giờ ra', value: stats.missingOutCount, icon: LogOut, tone: 'bg-amber-100 text-amber-700', detail: 'missing_out' },
    { label: 'Chưa điểm danh', value: stats.notCheckedInCount, icon: UserX, tone: 'bg-slate-100 text-slate-700', detail: 'not_checked_in' },
    { label: 'Đơn chờ duyệt', value: stats.pendingRequests, icon: FileText, tone: 'bg-purple-100 text-purple-700', detail: 'requests' },
  ];
  const dateLabel = stats.date.split('-').reverse().join('/');
  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Hôm nay {dateLabel} · {scopeLabel}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => (c.detail === 'requests' ? onOpenRequests() : setOpen({ type: c.detail, label: c.label }))}
            title="Xem danh sách"
            className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex items-center gap-3 text-left cursor-pointer hover:border-orange-300 hover:shadow-sm transition"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.tone}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-900 leading-tight">{c.value}</div>
              <div className="text-[11px] text-slate-500 truncate">{c.label}</div>
            </div>
          </button>
        ))}
      </div>
      {open && <StatsDetailModal type={open.type} title={`${open.label} · ${dateLabel}`} onClose={() => setOpen(null)} />}
    </div>
  );
};

const StatsDetailModal: React.FC<{ type: StatsDetailType; title: string; onClose: () => void }> = ({ type, title, onClose }) => {
  const [rows, setRows] = useState<StatsDetailRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ rows: StatsDetailRow[] }>(`/api/stats/details?type=${type}`)
      .then((r) => !cancelled && setRows(r.rows))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [type]);

  const showTimes = type !== 'not_checked_in';

  return (
    <Modal title={rows ? `${title} (${rows.length})` : title} onClose={onClose} wide>
      {error ? (
        <p className="text-rose-600">{error}</p>
      ) : rows === null ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-500 text-center py-6">Không có ai.</p>
      ) : (
        <table className="w-full text-left">
          <thead className="text-[11px] text-slate-500 border-b border-slate-100">
            <tr>
              <th className="py-2 pr-2 font-semibold">Mã</th>
              <th className="py-2 pr-2 font-semibold">Họ tên</th>
              <th className="py-2 pr-2 font-semibold">Phòng ban</th>
              {showTimes && <th className="py-2 pr-2 font-semibold">Giờ vào</th>}
              {showTimes && <th className="py-2 pr-2 font-semibold">Giờ ra</th>}
              {showTimes && <th className="py-2 font-semibold">Trạng thái</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.userId}>
                <td className="py-2 pr-2 font-mono">{r.employeeCode}</td>
                <td className="py-2 pr-2 font-semibold text-slate-900">{r.employeeName}</td>
                <td className="py-2 pr-2 text-slate-600">{r.departmentName ?? '—'}</td>
                {showTimes && <td className="py-2 pr-2 font-mono">{fmtTime(r.firstIn)}</td>}
                {showTimes && <td className="py-2 pr-2 font-mono">{fmtTime(r.lastOut)}</td>}
                {showTimes && (
                  <td className="py-2">
                    {r.status === null ? (
                      <span className="text-slate-400">Chưa điểm danh</span>
                    ) : (
                      <>
                        {DAY_STATUS_LABEL[r.status]}
                        {r.lateMinutes > 0 && <span className="text-rose-600"> · muộn {r.lateMinutes} phút</span>}
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
};
