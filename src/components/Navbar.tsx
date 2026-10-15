import React from 'react';
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
  const isManager =
    currentUser.role === 'hr' ||
    currentUser.role === 'area_admin';

  const tabs = [
    {
      id: 'attendance',
      label: 'Bảng công',
      icon: LayoutDashboard,
      visible: true,
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
      id: 'hanet_config',
      label: 'Cấu hình',
      icon: Settings,
      visible: currentUser.role === 'hr',
    },
  ];

  const iconButtonClass =
    'inline-flex size-9 shrink-0 items-center justify-center rounded-lg ' +
    'border border-border bg-surface text-text-secondary ' +
    'transition-colors hover:bg-surface-muted hover:text-text-primary ' +
    'focus-visible:outline-2 focus-visible:outline-brand-600';

  return (
    <header className="sticky top-0 z-40 border-b border-border border-t-4 border-t-brand-500 bg-surface/95 shadow-[0_1px_3px_rgb(15_23_42/4%)] backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Brand and account toolbar */}
        <div className="flex min-h-16 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30">
              <Camera className="size-5" strokeWidth={2} />
            </div>

            <div className="min-w-0">
              <div className="truncate text-base font-bold tracking-tight text-brand-navy sm:text-lg">
                Petrolimex <span className="text-brand-600">Attendance</span>
              </div>
              <div className="hidden text-xs text-text-secondary sm:block">
                Hệ thống quản lý chấm công
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
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
        <nav
          aria-label="Điều hướng chính"
          className="-mb-px flex items-center gap-1 overflow-x-auto border-t border-slate-100 py-2"
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
                  className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-600 ${
                    isActive
                      ? 'bg-brand-50 font-semibold text-brand-700 ring-1 ring-inset ring-brand-200'
                      : 'font-medium text-text-secondary hover:bg-brand-50/60 hover:text-brand-700'
                  }`}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.8} />

                  <span>{tab.label}</span>

                  {'count' in tab && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
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
    </header>
  );
};
