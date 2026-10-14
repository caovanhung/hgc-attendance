/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { StatsCards } from './components/StatsCards';
import { AttendanceTable } from './components/AttendanceTable';
import { CamerasTab } from './components/CamerasTab';
import { DepartmentsTab } from './components/DepartmentsTab';
import { EmployeesTab } from './components/EmployeesTab';
import { AreasTab } from './components/AreasTab';
import { AreaSelect } from './components/AreaSelect';
import { areaParam, loadArea, saveArea } from './area';
import { RequestsTab } from './components/RequestsTab';
import { HanetConfigTab } from './components/HanetConfigTab';
import { HanetSimulatorModal } from './components/HanetSimulatorModal';
import { LoginScreen } from './components/LoginScreen';
import { ForgotPasswordScreen } from './components/ForgotPasswordScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { ChangePasswordScreen } from './components/ChangePasswordScreen';
import { api, ApiError, AUTH_EVENT, errorMessage, type AuthEventDetail } from './api';
import { vnToday } from './format';
import type { AttendanceDay, AttendanceRequest, Camera, Department, MeResponse, StatsData, User } from './types';

type AuthState = 'loading' | 'anonymous' | 'must-change' | 'ready';

const TABS_BY_ROLE: Record<User['role'], string[]> = {
  hr: ['attendance', 'requests', 'cameras', 'departments', 'employees', 'areas', 'hanet_config'],
  area_admin: ['attendance', 'requests', 'cameras', 'departments', 'employees'],
  dept_manager: ['attendance', 'requests', 'cameras', 'departments'],
  employee: ['attendance', 'requests'],
};

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [area, setAreaState] = useState(loadArea);
  const [anonView, setAnonView] = useState<'login' | 'forgot'>('login');
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('reset');
    } catch {
      return null;
    }
  });
  // Đã giữ token trong state: bỏ ngay khỏi thanh địa chỉ (không lộ khi chia sẻ màn hình, không lưu vào lịch sử)
  useEffect(() => {
    if (resetToken) window.history.replaceState(null, '', window.location.pathname);
  }, []); // chỉ chạy một lần khi mở trang

  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [records, setRecords] = useState<AttendanceDay[]>([]);
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);

  const [activeTab, setActiveTab] = useState('attendance');
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(vnToday());
  const [selectedDept, setSelectedDept] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState('');

  const loadMe = useCallback(async () => {
    try {
      const data = await api<MeResponse>('/api/auth/me');
      setMe(data);
      setAuthState(data.mustChangePassword ? 'must-change' : 'ready');
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
        setAuthState('anonymous');
      } else {
        setLoadError(errorMessage(err));
        setAuthState('anonymous');
      }
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    const onAuth = (e: Event) => {
      const detail = (e as CustomEvent<AuthEventDetail>).detail;
      if (detail === 'logged-out') {
        setMe(null);
        setAuthState('anonymous');
      } else {
        setAuthState('must-change');
      }
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, []);

  const setArea = (v: string) => {
    setAreaState(v);
    saveArea(v);
  };
  // Khu đã lưu không còn trong phạm vi (bị gỡ quyền, khu bị xóa) thì về "tất cả"
  const activeArea = useMemo(() => {
    if (!me || area === 'all') return 'all';
    if (area === 'none') return me.user.role === 'hr' ? 'none' : 'all';
    return me.areas.some((a) => a.id === area) ? area : 'all';
  }, [me, area]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const ap = areaParam(activeArea);
      const q = new URLSearchParams({ date: selectedDate || vnToday(), departmentId: selectedDept, search: searchQuery, area: ap });
      const [u, d, c, a, r, s] = await Promise.all([
        api<{ users: User[] }>(`/api/users?area=${ap}`),
        api<{ departments: Department[] }>(`/api/departments?area=${ap}`),
        api<{ cameras: Camera[] }>(`/api/cameras?area=${ap}`),
        api<{ records: AttendanceDay[] }>(`/api/attendance?${q}`),
        api<{ requests: AttendanceRequest[] }>(`/api/requests?area=${ap}`),
        api<StatsData>(`/api/stats?area=${ap}`),
      ]);
      setUsers(u.users);
      setDepartments(d.departments);
      setCameras(c.cameras);
      setRecords(a.records);
      setRequests(r.requests);
      setStats(s);
      setLoadError(null);
      setLastRefreshed(new Date().toLocaleTimeString('vi-VN'));
    } catch (err) {
      if (!(err instanceof ApiError && (err.status === 401 || err.code === 'MUST_CHANGE_PASSWORD'))) setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedDept, searchQuery, activeArea]);

  useEffect(() => {
    if (authState === 'ready') fetchData();
  }, [authState, fetchData]);

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // phiên có thể đã hết hạn; vẫn đưa về màn đăng nhập
    }
    setMe(null);
    setChangingPassword(false);
    setActiveTab('attendance');
    setAuthState('anonymous');
  };

  if (authState === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Đang tải...</div>;
  }
  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={(notice) => {
          setResetToken(null);
          setLoginNotice(notice);
          setAnonView('login');
        }}
      />
    );
  }
  if (authState === 'anonymous') {
    return anonView === 'forgot' ? (
      <ForgotPasswordScreen onBack={() => setAnonView('login')} />
    ) : (
      <LoginScreen onLoggedIn={loadMe} onForgot={() => setAnonView('forgot')} notice={loginNotice} />
    );
  }
  if (authState === 'must-change' || changingPassword || !me) {
    return (
      <ChangePasswordScreen
        forced={authState === 'must-change'}
        onDone={() => {
          setChangingPassword(false);
          loadMe();
        }}
        onCancel={() => setChangingPassword(false)}
        onLogout={logout}
      />
    );
  }

  const currentUser = me.user;
  const tab = TABS_BY_ROLE[currentUser.role].includes(activeTab) ? activeTab : 'attendance';
  const refreshAll = () => {
    fetchData();
    loadMe();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans antialiased">
      <Navbar
        currentUser={currentUser}
        totalCameraCount={cameras.length}
        showSimulator={me.simulatorEnabled && currentUser.role === 'hr'}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onChangePassword={() => setChangingPassword(true)}
        onLogout={logout}
        activeTab={tab}
        setActiveTab={setActiveTab}
        extra={<AreaSelect me={me} value={activeArea} onChange={setArea} />}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          {loadError ? (
            <span className="flex items-center gap-1.5 text-rose-600">
              <AlertCircle className="w-4 h-4" /> {loadError}
            </span>
          ) : (
            <span />
          )}
          <button onClick={() => fetchData()} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium cursor-pointer">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
            <span>Cập nhật ({lastRefreshed || 'mới nhất'})</span>
          </button>
        </div>

        <StatsCards stats={stats} currentUser={currentUser} onOpenRequests={() => setActiveTab('requests')} />

        {tab === 'attendance' && (
          <AttendanceTable
            records={records}
            currentUser={currentUser}
            departments={departments}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedDept={selectedDept}
            setSelectedDept={setSelectedDept}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        )}
        {tab === 'requests' && <RequestsTab requests={requests} currentUser={currentUser} onRefresh={fetchData} />}
        {tab === 'cameras' && <CamerasTab cameras={cameras} currentUser={currentUser} areas={me.areas} onRefresh={fetchData} />}
        {tab === 'departments' && <DepartmentsTab departments={departments} users={users} currentUser={currentUser} areas={me.areas} onRefresh={refreshAll} />}
        {tab === 'employees' && (
          <EmployeesTab users={users} departments={departments} currentUser={currentUser} isSystemAdmin={me.isSystemAdmin} areas={me.areas} onRefresh={refreshAll} />
        )}
        {tab === 'areas' && <AreasTab onChanged={refreshAll} />}
        {tab === 'hanet_config' && <HanetConfigTab isSystemAdmin={me.isSystemAdmin} onRefresh={fetchData} />}
      </main>

      {me.simulatorEnabled && currentUser.role === 'hr' && (
        <HanetSimulatorModal
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          cameras={cameras}
          users={users}
          onSimulateSuccess={fetchData}
        />
      )}

      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        Hệ thống Điểm danh Camera AI do HGC phát triển
      </footer>
    </div>
  );
}
