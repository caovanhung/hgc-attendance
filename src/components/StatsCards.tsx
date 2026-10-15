import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle,
  Clock,
  FileText,
  LogOut,
  Palmtree,
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
  icon: LucideIcon;
  tone: string;
  /** Màu số khi lớn hơn 0, cho các chỉ số cần chú ý. */
  alert?: string;
  detail: StatsDetailType | 'requests';
}

const cardsBaseClass =
  'group flex min-w-0 items-center gap-3 rounded-card border ' +
  'border-border bg-surface p-3.5 text-left shadow-[var(--shadow-card)] ' +
  'transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 ' +
  'hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600 ' +
  'sm:p-4';

export const StatsCards: React.FC<StatsCardsProps> = ({
  stats,
  currentUser,
  onOpenRequests,
}) => {
  const [open, setOpen] = useState<{
    type: StatsDetailType;
    label: string;
  } | null>(null);

  if (!stats) return null;

  const scopeLabel =
    currentUser.role === 'hr'
      ? 'Toàn công ty'
      : currentUser.role === 'area_admin'
        ? 'Khu bạn quản lý'
        : currentUser.role === 'dept_manager'
          ? `Phòng ${currentUser.departmentName ?? ''}`
          : 'Cá nhân';

  const cards: Card[] = [
    {
      label: 'Nhân sự đang làm',
      value: stats.totalEmployees,
      icon: Users,
      tone: 'bg-brand-50 text-brand-600',
      detail: 'total',
    },
    {
      label: 'Có mặt hôm nay',
      value: stats.presentCount,
      icon: CheckCircle,
      tone: 'bg-emerald-50 text-emerald-700',
      detail: 'present',
    },
    {
      label: 'Vào đúng giờ',
      value: stats.onTimeCount,
      icon: Clock,
      tone: 'bg-blue-50 text-blue-700',
      detail: 'on_time',
    },
    {
      label: 'Đến sớm',
      value: stats.earlyArrivalCount,
      icon: Sunrise,
      tone: 'bg-teal-50 text-teal-700',
      detail: 'early_arrival',
    },
    {
      label: 'Đi muộn',
      value: stats.lateCount,
      icon: AlertTriangle,
      tone: 'bg-amber-50 text-amber-700',
      alert: 'text-amber-700',
      detail: 'late',
    },
    {
      label: 'Chưa có giờ ra',
      value: stats.missingOutCount,
      icon: LogOut,
      tone: 'bg-slate-100 text-slate-600',
      detail: 'missing_out',
    },
    {
      label: 'Chưa điểm danh',
      value: stats.notCheckedInCount,
      icon: UserX,
      tone: 'bg-slate-100 text-slate-600',
      detail: 'not_checked_in',
    },
    {
      label: 'Vắng',
      value: stats.absentCount,
      icon: UserMinus,
      tone: 'bg-rose-50 text-rose-700',
      alert: 'text-rose-700',
      detail: 'absent',
    },
    {
      label: 'Nghỉ phép',
      value: stats.leaveCount,
      icon: Palmtree,
      tone: 'bg-violet-50 text-violet-700',
      detail: 'leave',
    },
    {
      label: 'Công tác',
      value: stats.businessTripCount,
      icon: Briefcase,
      tone: 'bg-sky-50 text-sky-700',
      detail: 'business_trip',
    },
    {
      label: 'Đơn chờ duyệt',
      value: stats.pendingRequests,
      icon: FileText,
      tone: 'bg-brand-100 text-brand-700',
      alert: 'text-brand-700',
      detail: 'requests',
    },
  ];

  const dateLabel = stats.date.split('-').reverse().join('/');

  return (
    <section className="mb-6" aria-label="Thống kê điểm danh">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-brand-700">
            Hôm nay {dateLabel}
          </span>
          <span className="hidden text-slate-300 sm:inline">/</span>
          <span className="text-xs font-medium text-text-secondary">
            {scopeLabel}
          </span>
        </div>

        <span className="text-xs text-text-muted">
          Nhấn vào chỉ số để xem chi tiết
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-11">
        {cards.map((card) => {
          const Icon = card.icon;
          const isRequests = card.detail === 'requests';

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
              className={cardsBaseClass}
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${card.tone}`}
              >
                <Icon className="size-5" strokeWidth={1.9} />
              </span>

              <span className="min-w-0 flex-1">
                <span className={`block text-2xl font-bold leading-tight tracking-tight tabular-nums ${card.alert && card.value > 0 ? card.alert : 'text-text-primary'}`}>
                  {card.value.toLocaleString('vi-VN')}
                </span>

                <span className="mt-1 block text-xs font-medium leading-4 text-text-secondary">
                  {card.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-text-primary">
                              {DAY_STATUS_LABEL[row.status]}
                            </span>

                            {row.earlyArrivalMinutes > 0 && (
                              <span className="inline-flex whitespace-nowrap rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">
                                Đến sớm {row.earlyArrivalMinutes}'
                              </span>
                            )}

                            {row.lateMinutes > 0 && (
                              <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Muộn {row.lateMinutes}'
                              </span>
                            )}

                            {row.earlyMinutes > 0 && (
                              <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Về sớm {row.earlyMinutes}'
                              </span>
                            )}
                          </div>
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
