import React from 'react';
import { Camera as CameraIcon, KeyRound, LogOut, Video } from 'lucide-react';
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
}

const ROLE_BADGE: Record<User['role'], string> = {
  hr: 'bg-rose-100 text-rose-700 border-rose-200',
  area_admin: 'bg-violet-100 text-violet-800 border-violet-200',
  dept_manager: 'bg-amber-100 text-amber-800 border-amber-200',
  employee: 'bg-sky-100 text-sky-800 border-sky-200',
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
}) => {
  const tabs: { id: string; label: string; visible: boolean }[] = [
    { id: 'attendance', label: '📊 Bảng công', visible: true },
    { id: 'requests', label: '📝 Đơn giải trình / Xin phép', visible: true },
    { id: 'cameras', label: `📹 Camera AI (${totalCameraCount})`, visible: currentUser.role !== 'employee' },
    { id: 'departments', label: '🏢 Phòng ban', visible: currentUser.role !== 'employee' },
    { id: 'employees', label: '👤 Nhân sự', visible: currentUser.role === 'hr' },
    { id: 'hanet_config', label: '⚡ Cấu hình', visible: currentUser.role === 'hr' },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shrink-0">
              <CameraIcon className="w-6 h-6" />
            </div>
            <span className="font-bold text-lg text-slate-900 tracking-tight truncate">Petrolimex Attendance</span>
          </div>

          <div className="flex items-center gap-2">
            {showSimulator && (
              <button
                onClick={onOpenSimulator}
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
              >
                <Video className="w-4 h-4" />
                <span>Mô phỏng</span>
              </button>
            )}
            <div className="hidden md:block text-right">
              <div className="text-xs font-semibold text-slate-800 leading-tight">
                {currentUser.name} <span className="font-mono text-slate-400">({currentUser.code})</span>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${ROLE_BADGE[currentUser.role]}`}>
                {ROLE_LABEL[currentUser.role]}
                {currentUser.departmentName ? ` · ${currentUser.departmentName}` : ''}
              </span>
            </div>
            <button onClick={onChangePassword} title="Đổi mật khẩu" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <KeyRound className="w-4 h-4 text-slate-600" />
            </button>
            <button onClick={onLogout} title="Đăng xuất" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <LogOut className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto py-2 -mb-px border-t border-slate-100 text-xs font-medium">
          {tabs
            .filter((t) => t.visible)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  activeTab === t.id ? 'bg-slate-900 text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
        </nav>
      </div>
    </header>
  );
};
