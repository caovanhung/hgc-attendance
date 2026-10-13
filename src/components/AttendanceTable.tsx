import React, { useState } from 'react';
import { Search, Download, Filter, Eye, AlertCircle, CheckCircle, Clock, Video, Lock } from 'lucide-react';
import { AttendanceEvent, Department, User } from '../types';

interface AttendanceTableProps {
  records: AttendanceEvent[];
  currentUser: User | null;
  departments: Department[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const AttendanceTable: React.FC<AttendanceTableProps> = ({
  records,
  currentUser,
  departments,
  selectedDate,
  setSelectedDate,
  selectedDept,
  setSelectedDept,
  searchQuery,
  setSearchQuery,
}) => {
  const [selectedSnapshot, setSelectedSnapshot] = useState<AttendanceEvent | null>(null);

  const role = currentUser?.role;

  // Export CSV
  const handleExportCSV = () => {
    if (records.length === 0) return;
    const headers = [
      'Mã NV',
      'Họ và Tên',
      'Phòng ban',
      'Ngày',
      'Thời gian',
      'Camera Hanet',
      'Địa điểm',
      'Trạng thái',
      'Số phút muộn',
      'Nhiệt độ',
    ];
    const rows = records.map((r) => [
      `"${r.employeeCode}"`,
      `"${r.employeeName}"`,
      `"${r.departmentName}"`,
      `"${r.dateString}"`,
      `"${r.timeString}"`,
      `"${r.cameraName}"`,
      `"${r.placeName}"`,
      `"${r.status === 'on_time' ? 'Đúng giờ' : 'Đi muộn'}"`,
      r.lateMinutes,
      r.temperature || 36.5,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Diem_danh_Hanet_${selectedDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Role Notice Banner */}
      <div className={`px-4 py-2.5 text-xs flex items-center justify-between border-b ${
        role === 'hr'
          ? 'bg-rose-50/70 border-rose-100 text-rose-800'
          : role === 'dept_manager'
          ? 'bg-amber-50/70 border-amber-100 text-amber-800'
          : 'bg-sky-50/70 border-sky-100 text-sky-800'
      }`}>
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          <span>
            {role === 'hr' && (
              <>
                <strong>Quyền Quản trị viên (HR):</strong> Xem toàn bộ dữ liệu điểm danh mọi phòng ban trong công ty.
              </>
            )}
            {role === 'dept_manager' && (
              <>
                <strong>Quyền Trưởng phòng:</strong> Chỉ xem toàn bộ dữ liệu điểm danh của phòng{' '}
                <span className="font-bold underline">{currentUser?.departmentName}</span>.
              </>
            )}
            {role === 'employee' && (
              <>
                <strong>Quyền Nhân viên:</strong> Chỉ xem dữ liệu điểm danh cá nhân của{' '}
                <span className="font-bold underline">{currentUser?.name}</span> ({currentUser?.code}).
              </>
            )}
          </span>
        </div>
        <span className="text-[11px] font-medium opacity-80">
          Hiển thị: {records.length} bản ghi
        </span>
      </div>

      {/* Filter Bar */}
      <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm kiếm nhân viên, mã NV, camera..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
            <span className="text-[11px] text-slate-500 font-medium">Ngày:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs bg-transparent border-0 focus:outline-hidden text-slate-700"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate('')}
                className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Xóa
              </button>
            )}
          </div>

          {/* Department Filter (Only for HR) */}
          {role === 'hr' && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <span className="text-[11px] text-slate-500 font-medium">Phòng:</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="text-xs bg-transparent border-0 focus:outline-hidden text-slate-700 cursor-pointer"
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            disabled={records.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel / CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4">Nhân sự</th>
              <th className="py-3 px-4">Phòng ban</th>
              <th className="py-3 px-4">Thời gian quét</th>
              <th className="py-3 px-4">Tình trạng</th>
              <th className="py-3 px-4">Camera Hanet AI</th>
              <th className="py-3 px-4">Ảnh nhận diện</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <AlertCircle className="w-8 h-8 text-slate-300" />
                    <span>Không tìm thấy bản ghi điểm danh nào phù hợp</span>
                    <span className="text-[11px] text-slate-400">
                      Hãy dùng nút "Mô phỏng Quét Mặt Hanet" để tạo sự kiện mới tức thì!
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((r) => {
                const isOnTime = r.status === 'on_time';
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    {/* Employee Profile */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={r.avatarUrl}
                          alt={r.employeeName}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 shadow-2xs"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 leading-tight">
                            {r.employeeName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {r.employeeCode}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]">
                        {r.departmentName}
                      </span>
                    </td>

                    {/* Time */}
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-slate-900">
                        {r.timeString}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {r.dateString}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {isOnTime ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Đúng giờ</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Muộn {r.lateMinutes} phút</span>
                        </span>
                      )}
                    </td>

                    {/* Camera */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-800 truncate max-w-[200px]">
                          {r.cameraName}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {r.placeName}
                      </div>
                    </td>

                    {/* Detected Snapshot */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setSelectedSnapshot(r)}
                        className="group relative flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                        title="Xem ảnh quét camera Hanet"
                      >
                        <img
                          src={r.detectedImageUrl}
                          alt="Snapshot"
                          className="w-8 h-8 rounded-lg object-cover border border-slate-200 group-hover:scale-105 transition"
                        />
                        <span className="text-[11px] text-blue-600 font-medium group-hover:underline flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          Chi tiết
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Snapshot Modal */}
      {selectedSnapshot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-orange-400" />
                <span className="font-bold text-sm">Ảnh nhận diện Camera Hanet AI</span>
              </div>
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 aspect-4/3 flex items-center justify-center">
                <img
                  src={selectedSnapshot.detectedImageUrl}
                  alt={selectedSnapshot.employeeName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 right-2 px-3 py-1.5 bg-slate-950/80 backdrop-blur-md rounded-xl text-white text-[11px] flex items-center justify-between">
                  <span>{selectedSnapshot.timeString} • {selectedSnapshot.dateString}</span>
                  <span className="text-emerald-400 font-medium">Khớp 99.4% FaceID</span>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Họ và tên:</span>
                  <span className="font-bold text-slate-800">{selectedSnapshot.employeeName} ({selectedSnapshot.employeeCode})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Phòng ban:</span>
                  <span className="font-medium text-slate-800">{selectedSnapshot.departmentName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Thiết bị Hanet:</span>
                  <span className="font-medium text-slate-800">{selectedSnapshot.cameraName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Vị trí lắp đặt:</span>
                  <span className="font-medium text-slate-800">{selectedSnapshot.placeName}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Thân nhiệt đo được:</span>
                  <span className="font-semibold text-emerald-600">{selectedSnapshot.temperature || 36.5}°C</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedSnapshot(null)}
                className="w-full mt-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
