import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  KeyRound,
  LogOut,
  Menu,
  User as UserIcon,
  Video,
} from 'lucide-react';

import type { User } from '../types';
import { ROLE_LABEL } from '../format';

export interface HeaderProps {
  currentUser: User;
  showSimulator: boolean;
  onOpenSimulator: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  onToggleMobileSidebar: () => void;
  areaSelector?: React.ReactNode;
}

const ROLE_BADGE: Record<User['role'], string> = {
  hr: 'bg-brand-50 text-brand-700 ring-brand-200',
  area_admin: 'bg-violet-50 text-violet-700 ring-violet-200',
  dept_manager: 'bg-amber-50 text-amber-700 ring-amber-200',
  employee: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const BG_THEMES = [
  { id: '#F5F7FC', name: 'Xanh xám', label: 'Xanh xám sương nhẹ', desc: 'Khuyên dùng' },
  { id: '#F8F5F0', name: 'Kem ấm', label: 'Kem ấm thanh lịch', desc: 'Thân thiện' },
  { id: '#F1F7F5', name: 'Xanh mint', label: 'Xanh mint cực nhạt', desc: 'Tươi mới' },
  { id: '#F7F4FA', name: 'Tím xám', label: 'Tím xám pastel', desc: 'Mềm mại' },
] as const;

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  showSimulator,
  onOpenSimulator,
  onChangePassword,
  onLogout,
  onToggleMobileSidebar,
  areaSelector,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const [currentBg, setCurrentBg] = useState<string>(() => {
    try {
      return localStorage.getItem('petrolimex_bg_tone') || '#F5F7FC';
    } catch {
      return '#F5F7FC';
    }
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--app-bg', currentBg);
    try {
      localStorage.setItem('petrolimex_bg_tone', currentBg);
    } catch {
      // ignore
    }
  }, [currentBg]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-border border-t-3 border-t-brand-500 bg-white/95 px-3 sm:px-6 shadow-xs backdrop-blur-md">
      <div className="flex h-full items-center justify-between gap-2 sm:gap-4">
        {/* Left: Hamburger menu + Brand Identity */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            aria-label="Mở menu chức năng"
            className="flex size-9 items-center justify-center rounded-lg border border-border text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden cursor-pointer"
          >
            <Menu className="size-5" />
          </button>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-xs">
              <Camera className="size-4.5" strokeWidth={2.2} />
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                Petrolimex <span className="text-brand-600 font-semibold">Attendance</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Area Selector + Actions + User Account Menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Area Scope Selector (Toàn công ty ▾) */}
          {areaSelector && (
            <div className="flex items-center">
              {areaSelector}
            </div>
          )}

          {/* Simulator button */}
          {showSimulator && (
            <button
              type="button"
              onClick={onOpenSimulator}
              className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-50 text-brand-700 border border-brand-200/80 px-2.5 text-xs font-semibold hover:bg-brand-100 transition-colors cursor-pointer"
            >
              <Video className="size-3.5" />
              <span>Mô phỏng</span>
            </button>
          )}

          {/* User Account Menu with Avatar Icon per mockup */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              title={`Tài khoản: ${currentUser.name}`}
              aria-label="Menu tài khoản"
              className="flex items-center gap-2 rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 border border-slate-200/80 font-semibold text-xs">
                <UserIcon className="size-4.5" />
              </span>
              <span className="hidden lg:block text-left max-w-36 truncate">
                <span className="block text-xs font-semibold leading-tight text-slate-900 truncate">
                  {currentUser.name}
                </span>
                <span className="block text-[10px] text-slate-500 font-mono truncate">
                  {currentUser.code}
                </span>
              </span>
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-64 rounded-xl border border-border bg-white p-2 shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-150"
              >
                <div className="border-b border-slate-100 px-2.5 py-2">
                  <div className="font-semibold text-sm text-slate-900 truncate">
                    {currentUser.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                    <span className="font-mono font-medium">{currentUser.code}</span>
                    {currentUser.email && (
                      <>
                        <span>·</span>
                        <span className="truncate">{currentUser.email}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                        ROLE_BADGE[currentUser.role]
                      }`}
                    >
                      {ROLE_LABEL[currentUser.role]}
                    </span>
                    {currentUser.departmentName && (
                      <span className="text-[11px] text-slate-600 truncate">
                        Phòng {currentUser.departmentName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-1.5 space-y-0.5">
                  {showSimulator && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenSimulator();
                      }}
                      className="sm:hidden flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Video className="size-4 text-brand-600" />
                      <span>Mô phỏng quét mặt</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onChangePassword();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <KeyRound className="size-4 text-slate-500" />
                    <span>Đổi mật khẩu</span>
                  </button>

                  {/* Tùy chọn 4 tông màu nền theo đề xuất */}
                  <div className="border-t border-slate-100 my-1 pt-2 px-1 pb-1">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center justify-between px-1.5">
                      <span>Tông nền trang</span>
                      {currentBg === '#F5F7FC' && (
                        <span className="text-[10px] text-brand-700 font-semibold bg-[#FFF1E8] px-1.5 py-0.2 rounded">
                          Khuyên dùng
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {BG_THEMES.map((theme) => {
                        const isSelected = currentBg === theme.id;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() => setCurrentBg(theme.id)}
                            className={`flex items-center gap-1.5 rounded-lg p-1.5 text-left border transition-all cursor-pointer ${
                              isSelected
                                ? 'border-brand-500 bg-[#FFF1E8] font-bold text-brand-900 shadow-xs ring-1 ring-brand-300'
                                : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white hover:bg-slate-50'
                            }`}
                            title={`${theme.label} (${theme.id}) — ${theme.desc}`}
                          >
                            <span
                              className="size-3.5 rounded-full border border-slate-300/80 shrink-0 shadow-2xs"
                              style={{ backgroundColor: theme.id }}
                            />
                            <span className="truncate text-[11px]">{theme.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <LogOut className="size-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
