import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle,
  Clock,
  FileText,
  LogOut,
  Palmtree,
  Percent,
  Sunrise,
  UserMinus,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type {
  StatsData,
  StatsDetailRow,
  StatsDetailType,
  User,
} from '../types';

import { api, errorMessage } from '../api';
import { fmtTime, getAttendanceStatusText } from '../format';
import { Modal } from './ui';

interface StatsCardsProps {
  stats: StatsData | null;
  currentUser: User;
  onOpenRequests: () => void;
}

interface Card {
  label: string;
  value: number;
  displayValue?: string;
  sublabel?: string;
  icon: LucideIcon;
  tone: string;
  /** Màu số khi lớn hơn 0, cho các chỉ số cần chú ý. */
  alert?: string;
  detail: StatsDetailType | 'requests';
  primary?: boolean;
}

const cardsBaseClass =
  'group relative min-w-0 flex items-center gap-2 sm:gap-2.5 rounded-xl border ' +
  'border-slate-200/90 bg-white py-2 sm:py-2.5 px-2.5 sm:px-3 text-left shadow-xs ' +
  'transition-all duration-150 hover:border-brand-300 hover:shadow-sm ' +
  'focus-visible:outline-2 focus-visible:outline-brand-600 cursor-pointer';

export const StatsCards: React.FC<StatsCardsProps> = ({
  stats,
  currentUser,
  onOpenRequests,
}) => {
  const [open, setOpen] = useState<{
    type: StatsDetailType;
    label: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'full'>(() => {
    try {
      const saved = localStorage.getItem('stats_cards_mode');
      if (saved === 'compact' || saved === 'full') return saved;
    } catch {
      // ignore
    }
    return 'compact';
  });
  const [showAllMobile, setShowAllMobile] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('stats_cards_mode', viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  if (!stats) return null;

  const scopeLabel =
    currentUser.role === 'hr'
      ? 'Toàn công ty'
      : currentUser.role === 'area_admin'
        ? 'Khu bạn quản lý'
        : currentUser.role === 'dept_manager'
          ? `Phòng ${currentUser.departmentName ?? ''}`
          : 'Cá nhân';

  const attendanceRate =
    stats.totalEmployees > 0
      ? Math.round((stats.presentCount / stats.totalEmployees) * 100)
      : 0;

  const cards: Card[] = [
    {
      label: 'Có mặt hôm nay',
      value: stats.presentCount,
      sublabel: `(${attendanceRate}%)`,
      icon: CheckCircle,
      tone: 'bg-emerald-50 text-emerald-700',
      detail: 'present',
      primary: true,
    },
    {
      label: 'Đi đúng giờ',
      value: stats.onTimeCount,
      icon: Clock,
      tone: 'bg-emerald-50 text-emerald-700',
      detail: 'on_time',
      primary: true,
    },
    {
      label: 'Đi muộn',
      value: stats.lateCount,
      icon: AlertTriangle,
      tone: 'bg-rose-50 text-rose-700',
      alert: 'text-rose-700',
      detail: 'late',
      primary: true,
    },
    {
      label: 'Chưa điểm danh',
      value: stats.notCheckedInCount,
      icon: UserX,
      tone: 'bg-slate-100 text-slate-600',
      alert: stats.notCheckedInCount > 0 ? 'text-amber-800' : undefined,
      detail: 'not_checked_in',
      primary: true,
    },
    {
      label: 'Đơn chờ duyệt',
      value: stats.pendingRequests,
      icon: FileText,
      tone: 'bg-brand-100 text-brand-700',
      alert: stats.pendingRequests > 0 ? 'text-brand-700' : undefined,
      detail: 'requests',
      primary: true,
    },
    {
      label: 'Tỷ lệ có mặt',
      value: attendanceRate,
      displayValue: `${attendanceRate}%`,
      icon: Percent,
      tone: 'bg-emerald-50 text-emerald-700',
      detail: 'present',
      primary: false,
    },
    {
      label: 'Vắng',
      value: stats.absentCount,
      icon: UserMinus,
      tone: 'bg-rose-50 text-rose-700',
      alert: 'text-rose-700',
      detail: 'absent',
      primary: false,
    },
    {
      label: 'Nghỉ phép',
      value: stats.leaveCount,
      icon: Palmtree,
      tone: 'bg-violet-50 text-violet-700',
      detail: 'leave',
      primary: false,
    },
    {
      label: 'Công tác',
      value: stats.businessTripCount,
      icon: Briefcase,
      tone: 'bg-sky-50 text-sky-700',
      detail: 'business_trip',
      primary: false,
    },
  ];

  const displayCards = viewMode === 'compact' ? cards.filter((c) => c.primary) : cards;
  const dateLabel = stats.date.split('-').reverse().join('/');

  return (
    <section className="mb-4 sm:mb-5" aria-label="Thống kê điểm danh">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-brand-700">
            Hôm nay {dateLabel}
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-xs font-medium text-text-secondary">
            {scopeLabel}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="hidden text-xs text-text-muted xl:inline">
            Nhấn vào chỉ số để xem chi tiết
          </span>

          <div
            role="group"
            aria-label="Chế độ hiển thị thống kê"
            className="inline-flex items-center rounded-lg bg-[#EAF1FB] p-0.5 border border-blue-200/60 text-xs"
          >
            <button
              type="button"
              onClick={() => {
                setViewMode('compact');
                setShowAllMobile(false);
              }}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-white text-brand-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Chỉ hiển thị các chỉ số chính (gọn gàng 1 dòng)"
            >
              Gọn gàng
            </button>
            <button
              type="button"
              onClick={() => setViewMode('full')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                viewMode === 'full'
                  ? 'bg-white text-brand-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Hiển thị tất cả chỉ số điểm danh"
            >
              Đầy đủ ({cards.length})
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6">
        {displayCards.map((card, idx) => {
          const Icon = card.icon;
          const isRequests = card.detail === 'requests';
          // On mobile, show top 4 by default unless expanded or in compact mode
          const isHiddenOnMobile =
            !showAllMobile && viewMode === 'full' && idx >= 6;

          return (
            <button
              key={card.label}
              type="button"
              onClick={() =>
                isRequests
                  ? onOpenRequests()
                  : setOpen({
                      type: card.detail as StatsDetailType,
                      label: card.label,
                    })
              }
              title={`Xem chi tiết: ${card.label}`}
              className={`${cardsBaseClass} ${isHiddenOnMobile ? 'hidden sm:flex' : 'flex'}`}
            >
              <span
                className={`flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg ${card.tone}`}
              >
                <Icon className="size-3.5 sm:size-4" strokeWidth={2} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1">
                  <span
                    className={`block text-base sm:text-lg font-bold leading-none tabular-nums ${
                      card.alert && card.value > 0
                        ? card.alert
                        : 'text-text-primary'
                    }`}
                  >
                    {card.displayValue ?? card.value.toLocaleString('vi-VN')}
                  </span>
                  {card.sublabel && (
                    <span className="text-[11px] text-emerald-700 font-semibold leading-none">
                      {card.sublabel}
                    </span>
                  )}
                </span>

                <span className="mt-1 block text-[11px] sm:text-xs font-medium leading-tight text-text-secondary truncate">
                  {card.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile toggle to expand/collapse if in full mode */}
      {viewMode === 'full' && (
        <button
          type="button"
          onClick={() => setShowAllMobile(!showAllMobile)}
          className="sm:hidden w-full mt-2 py-1.5 px-3 text-xs font-semibold text-brand-700 bg-brand-50/90 hover:bg-brand-100 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-brand-200/50"
        >
          <span>
            {showAllMobile
              ? 'Thu gọn chỉ số'
              : `Xem thêm ${displayCards.length - 6} chỉ số khác`}
          </span>
          <span className="text-[10px]">{showAllMobile ? '▲' : '▼'}</span>
        </button>
      )}

      {open && (
        <StatsDetailModal
          type={open.type}
          title={`${open.label} · ${dateLabel}`}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
};

const StatsDetailModal: React.FC<{
  type: StatsDetailType;
  title: string;
  onClose: () => void;
}> = ({ type, title, onClose }) => {
  const [rows, setRows] = useState<StatsDetailRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setRows(null);
    setError(null);

    api<{ rows: StatsDetailRow[] }>(
      `/api/stats/details?type=${encodeURIComponent(type)}`,
    )
      .then((result) => {
        if (!cancelled) setRows(result.rows);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, [type]);

  const showTimes = type !== 'not_checked_in' && type !== 'absent';

  return (
    <Modal
      title={rows ? `${title} (${rows.length})` : title}
      onClose={onClose}
      wide
    >
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Không tải được dữ liệu</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : rows === null ? (
        <div
          role="status"
          className="flex min-h-36 items-center justify-center gap-3 text-sm text-text-secondary"
        >
          <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
          Đang tải dữ liệu...
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center px-4 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Users className="size-6" />
          </div>
          <p className="text-sm font-semibold text-text-primary">
            Không có dữ liệu
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Không tìm thấy nhân sự phù hợp với chỉ số này.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead className="bg-surface-muted">
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <th scope="col" className="px-4 py-3">
                  Mã nhân sự
                </th>
                <th scope="col" className="px-4 py-3">
                  Họ và tên
                </th>
                <th scope="col" className="px-4 py-3">
                  Phòng ban
                </th>
                {showTimes && (
                  <>
                    <th scope="col" className="px-4 py-3">
                      Giờ vào
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Giờ ra
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Trạng thái
                    </th>
                  </>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-border bg-surface">
              {rows.map((row) => (
                <tr
                  key={row.userId}
                  className="transition-colors hover:bg-surface-muted"
                >
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {row.employeeCode}
                  </td>

                  <td className="px-4 py-3 font-semibold text-text-primary">
                    {row.employeeName}
                  </td>

                  <td className="px-4 py-3 text-text-secondary">
                    {row.departmentName ?? '—'}
                  </td>

                  {showTimes && (
                    <>
                      <td className="px-4 py-3 font-mono text-sm tabular-nums text-text-primary">
                        {fmtTime(row.firstIn)}
                      </td>

                      <td className="px-4 py-3 font-mono text-sm tabular-nums text-text-primary">
                        {!row.final && row.lastOut !== null ? (
                          <span className="text-xs text-text-secondary">
                            Lần quẹt gần nhất {fmtTime(row.lastOut)}
                          </span>
                        ) : (
                          fmtTime(row.lastOut)
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {row.status === null ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            Chưa điểm danh
                          </span>
                        ) : (
                          (() => {
                            const st = getAttendanceStatusText({
                              status: row.status,
                              final: row.final,
                              lateMinutes: row.lateMinutes,
                              earlyMinutes: row.earlyMinutes,
                              firstIn: row.firstIn,
                              lastOut: row.lastOut,
                            });
                            return (
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${st.style}`}>
                                {st.label}
                              </span>
                            );
                          })()
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};
