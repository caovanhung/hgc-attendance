import React, { useEffect, useRef } from 'react';
import {
  Camera,
  KeyRound,
  LogOut,
  Video,
  ClipboardList,
  LayoutDashboard,
  Building2,
  Users,
  MapPinned,
  Settings,
  CalendarClock,
  FileSpreadsheet,
  UserRound,
  ScrollText,
} from 'lucide-react';

import type { User } from '../types';
import { ROLE_LABEL } from '../format';

interface NavbarProps {
  currentUser: User;
  totalCameraCount: number;
  showSimulator: boolean;
  onOpenSimulator: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  extra?: React.ReactNode;
}

const ROLE_BADGE: Record<User['role'], string> = {
  hr: 'bg-brand-50 text-brand-700 ring-brand-200',
  area_admin: 'bg-violet-50 text-violet-700 ring-violet-200',
  dept_manager: 'bg-amber-50 text-amber-700 ring-amber-200',
  employee: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  totalCameraCount,
  showSimulator,
  onOpenSimulator,
  onChangePassword,
  onLogout,
  activeTab,
  setActiveTab,
  extra,
}) => {
  // Trên điện thoại thanh tab cuộn ngang: luôn kéo tab đang chọn vào tầm nhìn
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  const isManager =
    currentUser.role === 'hr' ||
    currentUser.role === 'area_admin';

  const tabs = [
    {
      id: 'mine',
      label: 'Của tôi',
      icon: UserRound,
      visible: true,
    },
    {
      id: 'attendance',
      label: 'Bảng công',
      icon: LayoutDashboard,
      visible: currentUser.role !== 'employee',
    },
    {
      id: 'report',
      label: 'Báo cáo tháng',
      icon: FileSpreadsheet,
      visible: currentUser.role !== 'employee',
    },
    {
      id: 'requests',
      label: 'Giải trình / Xin phép',
      icon: ClipboardList,
      visible: true,
    },
    {
      id: 'cameras',
      label: 'Camera AI',
      icon: Camera,
      visible: currentUser.role !== 'employee',
      count: totalCameraCount,
    },
    {
      id: 'departments',
      label: 'Phòng ban',
      icon: Building2,
      visible: currentUser.role !== 'employee',
    },
    {
      id: 'shifts',
      label: 'Ca làm việc',
      icon: CalendarClock,
      visible: isManager,
    },
    {
      id: 'employees',
      label: 'Nhân sự',
      icon: Users,
      visible: isManager,
    },
    {
      id: 'areas',
      label: 'Khu vực',
      icon: MapPinned,
      visible: currentUser.role === 'hr',
    },
    {
      id: 'audit',
      label: 'Nhật ký',
      icon: ScrollText,
      visible: isManager,
    },
    {
      id: 'hanet_config',
      label: 'Cấu hình',
      icon: Settings,
      visible: currentUser.role === 'hr',
    },
  ];

  const iconButtonClass =
    'inline-flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-lg ' +
    'border border-border bg-surface text-text-secondary ' +
    'transition-colors hover:bg-surface-muted hover:text-text-primary ' +
    'focus-visible:outline-2 focus-visible:outline-brand-600';

  return (
    <header className="sticky top-0 z-40 border-b border-border border-t-4 border-t-brand-500 bg-surface/95 shadow-[0_1px_3px_rgb(15_23_42/4%)] backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        {/* Brand and account toolbar */}
        <div className="flex min-h-14 sm:min-h-16 items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex size-8 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30">
              <Camera className="size-4 sm:size-5" strokeWidth={2} />
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm sm:text-lg font-bold tracking-tight text-brand-navy">
                Petrolimex <span className="hidden sm:inline text-brand-600">Attendance</span>
              </div>
              <div className="hidden text-xs text-text-secondary sm:block">
                Hệ thống quản lý chấm công
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {extra}

            {showSimulator && (
              <button
                type="button"
                onClick={onOpenSimulator}
                className="hidden h-9 items-center gap-2 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600 sm:inline-flex"
              >
                <Video className="size-4" />
                <span>Mô phỏng</span>
              </button>
            )}

            <div className="hidden min-w-0 max-w-64 text-right md:block">
              <div className="truncate text-sm font-semibold text-text-primary">
                {currentUser.name}
                <span className="ml-1.5 font-mono text-xs font-normal text-text-muted">
                  ({currentUser.code})
                </span>
              </div>

              <div className="mt-1 flex items-center justify-end gap-1.5">
                <span
                  className={`inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ROLE_BADGE[currentUser.role]}`}
                >
                  {ROLE_LABEL[currentUser.role]}
                </span>

                {currentUser.departmentName && (
                  <span className="max-w-32 truncate text-xs text-text-secondary">
                    {currentUser.departmentName}
                  </span>
                )}
              </div>
            </div>

            <div className="mx-0.5 hidden h-8 w-px bg-border md:block" />

            <button
              type="button"
              onClick={onChangePassword}
              title="Đổi mật khẩu"
              aria-label="Đổi mật khẩu"
              className={iconButtonClass}
            >
              <KeyRound className="size-4" />
            </button>

            <button
              type="button"
              onClick={onLogout}
              title="Đăng xuất"
              aria-label="Đăng xuất"
              className={`${iconButtonClass} hover:border-red-200 hover:bg-red-50 hover:text-red-700`}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>

        {/* Primary navigation */}
        <div className="relative border-t border-slate-100">
          {/* Subtle fade hint on mobile right edge indicating tabs can be swiped */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/80 to-transparent sm:hidden z-10" />

          <nav
            aria-label="Điều hướng chính"
            ref={navRef}
            className="-mb-px -mx-3 px-3 sm:mx-0 sm:px-0 flex items-center gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-2"
          >
            {tabs
              .filter((tab) => tab.visible)
              .map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`inline-flex min-h-8 sm:min-h-9 shrink-0 items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-brand-600 ${
                      isActive
                        ? 'bg-brand-50 font-semibold text-brand-700 ring-1 ring-inset ring-brand-200'
                        : 'font-medium text-text-secondary hover:bg-brand-50/60 hover:text-brand-700'
                    }`}
                  >
                    <Icon className="size-3.5 sm:size-4 shrink-0" strokeWidth={1.8} />

                    <span>{tab.label}</span>

                    {'count' in tab && (
                      <span
                        className={`rounded-md px-1.5 py-0.2 text-[11px] sm:text-xs tabular-nums ${
                          isActive
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
          </nav>
        </div>
      </div>
    </header>
  );
};
