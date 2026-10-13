/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { StatsCards } from './components/StatsCards';
import { AttendanceTable } from './components/AttendanceTable';
import { CamerasTab } from './components/CamerasTab';
import { DepartmentsTab } from './components/DepartmentsTab';
import { EmployeesTab } from './components/EmployeesTab';
import { RequestsTab } from './components/RequestsTab';
import { HanetConfigTab } from './components/HanetConfigTab';
import { HanetSimulatorModal } from './components/HanetSimulatorModal';
import { User, Department, Camera, AttendanceEvent, AttendanceRequest, StatsData } from './types';
import { RefreshCw, Sparkles, Shield, AlertCircle } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [records, setRecords] = useState<AttendanceEvent[]>([]);
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);

  const [activeTab, setActiveTab] = useState<string>('attendance');
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Fetch initial profile & accounts
  const fetchMe = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      setCurrentUser(data.user);
      setAvailableUsers(data.availableAccounts || []);
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  // Fetch all core datasets
  const fetchData = useCallback(async () => {
    try {
      const [deptRes, camRes, attRes, reqRes, statsRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/cameras'),
        fetch(`/api/attendance?date=${selectedDate}&departmentId=${selectedDept}&search=${encodeURIComponent(searchQuery)}`),
        fetch('/api/attendance/requests'),
        fetch('/api/stats'),
      ]);

      const [deptData, camData, attData, reqData, statsData] = await Promise.all([
        deptRes.json(),
        camRes.json(),
        attRes.json(),
        reqRes.json(),
        statsRes.json(),
      ]);

      setDepartments(deptData.departments || []);
      setCameras(camData.cameras || []);
      setRecords(attData.records || []);
      setRequests(reqData.requests || []);
      setStats(statsData);
      setLastRefreshed(new Date().toLocaleTimeString('vi-VN'));
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedDept, searchQuery]);

  useEffect(() => {
    fetchMe();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser, fetchData]);

  // Switch Role / User handler
  const handleSwitchUser = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/switch-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        // Reset tab if current tab is restricted
        if (data.user.role === 'employee' && (activeTab === 'departments' || activeTab === 'employees' || activeTab === 'hanet_config')) {
          setActiveTab('attendance');
        } else if (data.user.role === 'dept_manager' && (activeTab === 'employees' || activeTab === 'hanet_config')) {
          setActiveTab('attendance');
        }
      }
    } catch (err) {
      console.error('Error switching user:', err);
    } finally {
      setLoading(false);
    }
  };

  const onlineCameras = cameras.filter((c) => c.status === 'online').length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans antialiased">
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        availableUsers={availableUsers}
        onSwitchUser={handleSwitchUser}
        onlineCameraCount={onlineCameras}
        totalCameraCount={cameras.length}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Role Quick Hint Banner */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            <span>
              Đang đăng nhập với vai trò: <strong className="text-slate-800">{currentUser?.name}</strong> (
              {currentUser?.role === 'hr'
                ? 'Quản trị viên Nhân sự - Xem toàn bộ hệ thống'
                : currentUser?.role === 'dept_manager'
                ? `Trưởng phòng - Phụ trách ${currentUser?.departmentName}`
                : `Nhân viên - Chỉ xem lịch sử cá nhân (${currentUser?.code})`}
              )
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData()}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
              <span>Cập nhật ({lastRefreshed || 'Mới nhất'})</span>
            </button>
          </div>
        </div>

        {/* Dynamic Metric Cards (scoped to role) */}
        <StatsCards
          stats={stats}
          currentUser={currentUser}
          todayRecords={records}
        />

        {/* Tab Switch Views */}
        {activeTab === 'attendance' && (
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

        {activeTab === 'cameras' && (
          <CamerasTab
            cameras={cameras}
            currentUser={currentUser}
            onRefresh={fetchData}
            onOpenSimulatorForCamera={(camId) => {
              setIsSimulatorOpen(true);
            }}
          />
        )}

        {activeTab === 'requests' && (
          <RequestsTab
            requests={requests}
            currentUser={currentUser}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'departments' && currentUser?.role !== 'employee' && (
          <DepartmentsTab
            departments={departments}
            users={availableUsers}
            currentUser={currentUser}
            onRefresh={() => {
              fetchData();
              fetchMe();
            }}
          />
        )}

        {activeTab === 'employees' && currentUser?.role === 'hr' && (
          <EmployeesTab
            users={availableUsers}
            departments={departments}
            currentUser={currentUser}
            onRefresh={() => {
              fetchData();
              fetchMe();
            }}
          />
        )}

        {activeTab === 'hanet_config' && currentUser?.role === 'hr' && (
          <HanetConfigTab
            onRefresh={fetchData}
          />
        )}
      </main>

      {/* Hanet Camera Scanner Simulator Modal */}
      <HanetSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        cameras={cameras}
        users={availableUsers}
        onSimulateSuccess={() => {
          fetchData();
        }}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Hệ thống Điểm danh Camera AI Hanet</span>
            <span>•</span>
            <span>Petrolimex Hà Nội Enterprise Attendance</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Tích hợp theo chuẩn Hanet Open API Webhook & FaceID Cloud
          </div>
        </div>
      </footer>
    </div>
  );
}
