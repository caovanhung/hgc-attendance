import React, { useState } from 'react';
import { UserPlus, Shield, Check, RefreshCw, Upload, Sparkles, Filter, Search } from 'lucide-react';
import { Department, User } from '../types';

interface EmployeesTabProps {
  users: User[];
  departments: Department[];
  currentUser: User | null;
  onRefresh: () => void;
}

export const EmployeesTab: React.FC<EmployeesTabProps> = ({
  users,
  departments,
  currentUser,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || '');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<'hr' | 'dept_manager' | 'employee'>('employee');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');
  const [search, setSearch] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const isHR = currentUser?.role === 'hr';

  const sampleAvatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80',
  ];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !departmentId) return;

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name,
          email: email || `${code.toLowerCase()}@petrolimexhanoi.vn`,
          phone,
          departmentId,
          position: position || 'Chuyên viên',
          role,
          avatarUrl: avatarUrl || sampleAvatars[0],
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setCode('');
        setName('');
        setEmail('');
        setPhone('');
        setPosition('');
        setAvatarUrl('');
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSyncHanet = async (userId: string) => {
    setSyncingId(userId);
    // Simulate API call to Hanet /person/register
    setTimeout(() => {
      setSyncingId(null);
      alert('Đồng bộ FaceID và thông tin nhân sự lên Hanet Cloud Place thành công!');
    }, 900);
  };

  // Filter
  const filteredUsers = users.filter((u) => {
    if (selectedDeptFilter && u.departmentId !== selectedDeptFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.code.toLowerCase().includes(q) ||
        u.position.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Quản lý Hồ sơ & FaceID Nhân sự</h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Hanet Place Sync
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Mỗi nhân sự được gán mã <span className="font-mono font-bold text-slate-700">aliasID</span> tương ứng trên Hanet để đồng bộ FaceID tự động vào camera.
          </p>
        </div>

        {isHR && (
          <button
            onClick={() => {
              setAvatarUrl(sampleAvatars[0]);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm Nhân sự & Đăng ký FaceID</span>
          </button>
        )}
      </div>

      {/* Filter and Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo họ tên, mã NV, chức vụ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
            <span className="text-[11px] text-slate-500 font-medium">Phòng:</span>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="text-xs bg-transparent border-0 focus:outline-hidden text-slate-700 cursor-pointer"
            >
              <option value="">Tất cả ({users.length})</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map((u) => {
          const isSyncing = syncingId === u.id;
          return (
            <div
              key={u.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between hover:border-slate-300 transition"
            >
              <div>
                <div className="flex items-start gap-3.5">
                  <div className="relative">
                    <img
                      src={u.avatarUrl}
                      alt={u.name}
                      className="w-13 h-13 rounded-2xl object-cover border border-slate-200 shadow-2xs"
                    />
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                        {u.code}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        u.role === 'hr'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : u.role === 'dept_manager'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}>
                        {u.role === 'hr' ? 'HR Manager' : u.role === 'dept_manager' ? 'Trưởng phòng' : 'Nhân viên'}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 mt-1 truncate">
                      {u.name}
                    </h3>
                    <p className="text-xs text-slate-500 truncate">
                      {u.position}
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phòng ban:</span>
                    <span className="font-medium text-slate-800 truncate max-w-[170px]">{u.departmentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hanet Person ID:</span>
                    <span className="font-mono text-slate-700 font-semibold">{u.hanetPersonId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Trạng thái FaceID:</span>
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" /> Đã đăng ký
                    </span>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => handleSyncHanet(u.id)}
                  disabled={isSyncing}
                  className="w-full py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ lại FaceID'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-orange-400" />
                <span className="font-bold text-sm">Thêm Nhân Sự & Đăng Ký Khuôn Mặt</span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-3.5 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mã nhân viên (aliasID):</label>
                  <input
                    type="text"
                    required
                    placeholder="PLX-NV09"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono uppercase focus:outline-hidden focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ và tên:</label>
                  <input
                    type="text"
                    required
                    placeholder="Nguyễn Văn A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phòng ban:</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 bg-white"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vai trò hệ thống:</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 bg-white font-medium"
                  >
                    <option value="employee">Nhân viên (Chỉ xem lịch sử bản thân)</option>
                    <option value="dept_manager">Trưởng phòng (Xem & duyệt cả phòng)</option>
                    <option value="hr">Quản trị viên Nhân sự (HR - Xem toàn công ty)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chức vụ:</label>
                  <input
                    type="text"
                    placeholder="Chuyên viên..."
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số điện thoại:</label>
                  <input
                    type="text"
                    placeholder="0912345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Face Photo Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Ảnh chụp khuôn mặt đăng ký FaceID Hanet:
                </label>
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={avatarUrl || sampleAvatars[0]}
                    alt="Preview"
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-orange-500"
                  />
                  <div className="text-[11px] text-slate-500">
                    Ảnh mẫu chân dung chất lượng cao. Chọn một trong các ảnh khuôn mặt mẫu hoặc nhập URL:
                  </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {sampleAvatars.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAvatarUrl(url)}
                      className={`relative rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer ${
                        avatarUrl === url ? 'border-orange-500 ring-2 ring-orange-200' : 'border-slate-200 opacity-70'
                      }`}
                    >
                      <img src={url} alt={`Face ${idx}`} className="w-10 h-10 object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  Tạo & Kích hoạt FaceID
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
