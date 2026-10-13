import React from 'react';
import { Users, CheckCircle, Clock, AlertTriangle, Video, FileText, Calendar } from 'lucide-react';
import { StatsData, User, AttendanceEvent } from '../types';

interface StatsCardsProps {
  stats: StatsData | null;
  currentUser: User | null;
  todayRecords: AttendanceEvent[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, currentUser, todayRecords }) => {
  if (!stats || !currentUser) return null;

  const role = currentUser.role;

  // Personal user stats
  const myTodayRecord = todayRecords.find((r) => r.employeeId === currentUser.id);

  if (role === 'employee') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Card 1: Today Status */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            myTodayRecord ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
          }`}>
            {myTodayRecord ? <CheckCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Hôm nay ({new Date().toLocaleDateString('vi-VN')})
            </div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {myTodayRecord ? (
                <span className="text-emerald-600">Đã chấm công</span>
              ) : (
                <span className="text-amber-600">Chưa ghi nhận</span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {myTodayRecord ? `Giờ vào: ${myTodayRecord.timeString}` : 'Chưa quét camera'}
            </div>
          </div>
        </div>

        {/* Card 2: Status */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tình trạng vào ca
            </div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {myTodayRecord?.status === 'on_time' ? (
                <span className="text-emerald-600">Đúng giờ</span>
              ) : myTodayRecord?.status === 'late' ? (
                <span className="text-rose-600">Muộn {myTodayRecord.lateMinutes} phút</span>
              ) : (
                'Chưa vào'
              )}
            </div>
            <div className="text-xs text-slate-500">
              Ca chuẩn: 08:00 - 17:30
            </div>
          </div>
        </div>

        {/* Card 3: Camera */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Camera nhận diện
            </div>
            <div className="text-sm font-bold text-slate-900 mt-0.5 truncate max-w-[180px]">
              {myTodayRecord ? myTodayRecord.cameraName : 'Chưa có'}
            </div>
            <div className="text-xs text-slate-500">
              {myTodayRecord ? myTodayRecord.placeName : 'Hanet AI Cam'}
            </div>
          </div>
        </div>

        {/* Card 4: FaceID Status */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Mã định danh Hanet
            </div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {currentUser.hanetPersonId}
            </div>
            <div className="text-xs text-emerald-600 font-medium">
              ✓ FaceID đã kích hoạt
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Manager or HR view
  const isDeptManager = role === 'dept_manager';
  const titlePrefix = isDeptManager ? `Phòng ${currentUser.departmentName}` : 'Toàn Công ty';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Staff */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {isDeptManager ? 'Nhân sự phòng ban' : 'Tổng số nhân viên'}
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-0.5">
            {stats.totalEmployees} <span className="text-xs text-slate-400 font-normal">người</span>
          </div>
          <div className="text-xs text-slate-500">
            {titlePrefix}
          </div>
        </div>
      </div>

      {/* Checked-in today */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <CheckCircle className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Đã điểm danh hôm nay
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-0.5">
            {stats.checkedInCount}/{stats.totalEmployees}
          </div>
          <div className="text-xs text-slate-500">
            Tỷ lệ:{' '}
            <strong className="text-emerald-700">
              {stats.totalEmployees > 0 ? Math.round((stats.checkedInCount / stats.totalEmployees) * 100) : 0}%
            </strong>
          </div>
        </div>
      </div>

      {/* On time vs Late */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Đi đúng giờ / Đi muộn
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-0.5 flex items-center gap-2">
            <span className="text-emerald-600">{stats.onTimeCount}</span>
            <span className="text-slate-300 font-light">/</span>
            <span className="text-rose-600">{stats.lateCount}</span>
          </div>
          <div className="text-xs text-slate-500">
            Muộn sau 08:15: {stats.lateCount} lượt
          </div>
        </div>
      </div>

      {/* Camera / Requests */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          {isDeptManager ? <FileText className="w-6 h-6" /> : <Video className="w-6 h-6" />}
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {isDeptManager ? 'Đơn chờ duyệt phòng' : 'Hệ thống Camera Hanet'}
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-0.5">
            {isDeptManager ? (
              <span className="text-amber-600">{stats.pendingRequests} <span className="text-xs font-normal">đơn</span></span>
            ) : (
              <span className="text-blue-600">{stats.onlineCameras}/{stats.totalCameras} <span className="text-xs font-normal">Online</span></span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {isDeptManager ? 'Giải trình / Xin nghỉ' : 'Kết nối qua 1 tài khoản Cloud'}
          </div>
        </div>
      </div>
    </div>
  );
};
