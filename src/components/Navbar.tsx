import React, { useState } from 'react';
import { Camera as CameraIcon, Shield, Users, Building, Video, UserCheck, ChevronDown, CheckCircle2 } from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  currentUser: User | null;
  availableUsers: User[];
  onSwitchUser: (userId: string) => void;
  onlineCameraCount: number;
  totalCameraCount: number;
  onOpenSimulator: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  availableUsers,
  onSwitchUser,
  onlineCameraCount,
  totalCameraCount,
  onOpenSimulator,
  activeTab,
  setActiveTab,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'hr':
        return { label: 'Quản trị viên Nhân sự (HR)', badgeBg: 'bg-rose-100 text-rose-700 border-rose-200' };
      case 'dept_manager':
        return { label: 'Trưởng phòng (Manager)', badgeBg: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'employee':
        return { label: 'Nhân viên (Staff)', badgeBg: 'bg-sky-100 text-sky-800 border-sky-200' };
      default:
        return { label: role, badgeBg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const currentRoleInfo = currentUser ? getRoleLabel(currentUser.role) : null;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <CameraIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">Hanet Attendance Hub</span>
                <span className="text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                  Petrolimex
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Camera AI Hanet:</span>
                <strong className="text-emerald-600 font-medium">
                  {onlineCameraCount}/{totalCameraCount} Online
                </strong>
              </p>
            </div>
          </div>

          {/* Quick Simulation Trigger & Role Switcher */}
          <div className="flex items-center gap-3">
            {/* Simulator Action Button */}
            <button
              onClick={onOpenSimulator}
              className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 transition shadow-sm cursor-pointer"
            >
              <Video className="w-4 h-4" />
              <span>Mô phỏng Quét Mặt Hanet</span>
            </button>

            {/* Role Switcher Menu */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition bg-white text-left cursor-pointer"
              >
                <img
                  src={currentUser?.avatarUrl}
                  alt={currentUser?.name}
                  className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                />
                <div className="hidden md:block">
                  <div className="text-xs font-semibold text-slate-800 leading-tight">
                    {currentUser?.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {currentUser?.departmentName}
                  </div>
                </div>
                {currentRoleInfo && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${currentRoleInfo.badgeBg} hidden lg:inline-block`}>
                    {currentRoleInfo.label}
                  </span>
                )}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {/* Dropdown with all test roles */}
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-84 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Chuyển đổi Tài khoản & Vai trò kiểm thử
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Chọn tài khoản để kiểm tra phân quyền HR, Trưởng phòng và Nhân viên
                      </p>
                    </div>

                    <div className="max-h-80 overflow-y-auto py-1 divide-y divide-slate-50">
                      {availableUsers.map((u) => {
                        const isCurrent = u.id === currentUser?.id;
                        const roleMeta = getRoleLabel(u.role);
                        return (
                          <button
                            key={u.id}
                            onClick={() => {
                              onSwitchUser(u.id);
                              setDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition cursor-pointer ${
                              isCurrent ? 'bg-orange-50/80 text-orange-900' : 'hover:bg-slate-50'
                            }`}
                          >
                            <img
                              src={u.avatarUrl}
                              alt={u.name}
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-800 truncate">
                                  {u.name}
                                </span>
                                {isCurrent && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {u.position}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${roleMeta.badgeBg}`}>
                                  {roleMeta.label}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {u.code}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto py-2 -mb-px border-t border-slate-100 text-xs font-medium scrollbar-none">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-slate-900 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            📊 Nhật ký Điểm danh
          </button>

          <button
            onClick={() => setActiveTab('cameras')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'cameras'
                ? 'bg-slate-900 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            📹 Camera Hanet ({totalCameraCount})
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-slate-900 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            📝 Đơn Giải trình / Xin phép
          </button>

          {/* HR / Trưởng phòng tabs */}
          {currentUser?.role !== 'employee' && (
            <button
              onClick={() => setActiveTab('departments')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                activeTab === 'departments'
                  ? 'bg-slate-900 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              🏢 Phòng ban & Nhân sự
            </button>
          )}

          {currentUser?.role === 'hr' && (
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                activeTab === 'employees'
                  ? 'bg-slate-900 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              👤 Quản lý Hồ sơ & FaceID
            </button>
          )}

          {currentUser?.role === 'hr' && (
            <button
              onClick={() => setActiveTab('hanet_config')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                activeTab === 'hanet_config'
                  ? 'bg-slate-900 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              ⚡ Tích hợp Hanet Cloud & Webhook
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
