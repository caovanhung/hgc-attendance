import React from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText, LogOut, UserX, Users } from 'lucide-react';
import type { StatsData, User } from '../types';

interface StatsCardsProps {
  stats: StatsData | null;
  currentUser: User;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, currentUser }) => {
  if (!stats) return null;
  const scopeLabel =
    currentUser.role === 'hr' ? 'Toàn công ty' : currentUser.role === 'dept_manager' ? `Phòng ${currentUser.departmentName ?? ''}` : 'Cá nhân';
  const cards = [
    { label: 'Nhân sự đang làm', value: stats.totalEmployees, icon: Users, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Có mặt hôm nay', value: stats.presentCount, icon: CheckCircle, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Vào đúng giờ', value: stats.onTimeCount, icon: Clock, tone: 'bg-sky-100 text-sky-700' },
    { label: 'Đi muộn', value: stats.lateCount, icon: AlertTriangle, tone: 'bg-rose-100 text-rose-700' },
    { label: 'Chưa có giờ ra', value: stats.missingOutCount, icon: LogOut, tone: 'bg-amber-100 text-amber-700' },
    { label: 'Chưa điểm danh', value: stats.notCheckedInCount, icon: UserX, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Đơn chờ duyệt', value: stats.pendingRequests, icon: FileText, tone: 'bg-purple-100 text-purple-700' },
  ];
  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Hôm nay {stats.date.split('-').reverse().join('/')} · {scopeLabel}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.tone}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-900 leading-tight">{c.value}</div>
              <div className="text-[11px] text-slate-500 truncate">{c.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
