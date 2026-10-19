import React, { useEffect, useState } from 'react';
import {
  Building2,
  CalendarClock,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  MapPinned,
  ScrollText,
  Settings,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import type { User } from '../types';

export interface SidebarProps {
  currentUser: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  totalCameraCount: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  visible: boolean;
}

interface NavGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  totalCameraCount,
  isOpenMobile,
  onCloseMobile,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const isManager = currentUser.role === 'hr' || currentUser.role === 'area_admin';

  // 4 nhóm nghiệp vụ chính theo Phương án 3
  const groups: NavGroup[] = [
    {
      id: 'attendance_group',
      title: 'Chấm công',
      icon: LayoutDashboard,
      items: [
        {
          id: 'attendance',
          label: 'Bảng công hôm nay',
          icon: LayoutDashboard,
          visible: currentUser.role !== 'employee',
        },
        {
          id: 'mine',
          label: 'Cá nhân của tôi',
          icon: UserRound,
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
          count: totalCameraCount,
          visible: currentUser.role !== 'employee',
        },
      ],
    },
    {
      id: 'report_group',
      title: 'Báo cáo',
      icon: FileSpreadsheet,
      items: [
        {
          id: 'report',
          label: 'Báo cáo tháng',
          icon: FileSpreadsheet,
          visible: currentUser.role !== 'employee',
        },
      ],
    },
    {
      id: 'personnel_group',
      title: 'Nhân sự',
      icon: Users,
      items: [
        {
          id: 'employees',
          label: 'Quản lý nhân sự',
          icon: Users,
          visible: isManager,
        },
        {
          id: 'departments',
          label: 'Phòng ban',
          icon: Building2,
          visible: currentUser.role !== 'employee',
        },
        {
          id: 'shifts',
          label: 'Ca làm việc & Lễ',
          icon: CalendarClock,
          visible: isManager,
        },
      ],
    },
    {
      id: 'admin_group',
      title: 'Quản trị',
      icon: Settings,
      items: [
        {
          id: 'areas',
          label: 'Khu vực cơ sở',
          icon: MapPinned,
          visible: currentUser.role === 'hr',
        },
        {
          id: 'audit',
          label: 'Nhật ký kiểm toán',
          icon: ScrollText,
          visible: isManager,
        },
        {
          id: 'hanet_config',
          label: 'Cấu hình hệ thống',
          icon: Settings,
          visible: currentUser.role === 'hr',
        },
      ],
    },
  ];

  // Lọc các nhóm có ít nhất 1 item được hiển thị
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => item.visible),
    }))
    .filter((g) => g.items.length > 0);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    if (isOpenMobile) {
      onCloseMobile();
    }
  };

  // Tìm xem tab đang chọn thuộc nhóm nào
  const currentGroupId =
    visibleGroups.find((g) => g.items.some((i) => i.id === activeTab))?.id ??
    visibleGroups[0]?.id;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          role="presentation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs transition-opacity md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        aria-label="Thanh điều hướng nghiệp vụ"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-white transition-all duration-200 md:static md:z-20 ${
          isCollapsed ? 'md:w-16' : 'md:w-60'
        } ${
          isOpenMobile
            ? 'w-72 translate-x-0 shadow-2xl'
            : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Mobile Header inside Drawer */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:hidden">
          <div className="flex items-center gap-2 font-bold text-brand-navy">
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Camera className="size-4" strokeWidth={2.2} />
            </span>
            <span>Menu chức năng</span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Đóng menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable Navigation List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4 [scrollbar-width:thin]">
          {visibleGroups.map((group) => {
            const isGroupActive = group.id === currentGroupId;
            const GroupIcon = group.icon;

            return (
              <div key={group.id} className="space-y-1">
                {/* Tiêu đề nhóm */}
                {!isCollapsed ? (
                  <div className="px-2.5 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {group.title}
                  </div>
                ) : (
                  <div
                    title={group.title}
                    className="flex justify-center py-1 text-slate-300 border-b border-slate-100 mb-1"
                  >
                    <GroupIcon className="size-3.5" />
                  </div>
                )}

                {/* Danh sách các chức năng con trong nhóm */}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = activeTab === item.id;
                    const ItemIcon = item.icon;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectTab(item.id)}
                        title={isCollapsed ? `${group.title} — ${item.label}` : item.label}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group relative flex w-full items-center gap-2.5 rounded-lg py-2 transition-all cursor-pointer ${
                          isCollapsed
                            ? 'justify-center px-2'
                            : 'px-2.5 text-left'
                        } ${
                          isActive
                            ? 'bg-[#FFF1E8] text-brand-700 font-semibold ring-1 ring-inset ring-brand-300/70 shadow-xs'
                            : 'text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <ItemIcon
                          className={`size-4.5 shrink-0 transition-colors ${
                            isActive
                              ? 'text-brand-600'
                              : 'text-slate-500 group-hover:text-slate-700'
                          }`}
                          strokeWidth={isActive ? 2.2 : 1.8}
                        />

                        {!isCollapsed && (
                          <span className="flex-1 truncate text-xs sm:text-[13px] leading-tight">
                            {item.label}
                          </span>
                        )}

                        {!isCollapsed && typeof item.count === 'number' && (
                          <span
                            className={`rounded-md px-1.5 py-0.2 text-[10px] font-semibold tabular-nums shrink-0 ${
                              isActive
                                ? 'bg-brand-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.count}
                          </span>
                        )}

                        {/* Collapsed active indicator bar */}
                        {isCollapsed && isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-md bg-brand-600"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Toggle Collapse Bar (Desktop only) */}
        <div className="hidden shrink-0 border-t border-border p-2 md:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu nhỏ thanh điều hướng'}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
          >
            {isCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <>
                <ChevronLeft className="size-4" />
                <span>Thu gọn menu</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
