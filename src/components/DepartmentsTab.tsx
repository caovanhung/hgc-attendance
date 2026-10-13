import React, { useState } from 'react';
import { Building, Users, Plus, UserCheck, Shield } from 'lucide-react';
import { Department, User } from '../types';

interface DepartmentsTabProps {
  departments: Department[];
  users: User[];
  currentUser: User | null;
  onRefresh: () => void;
}

export const DepartmentsTab: React.FC<DepartmentsTabProps> = ({
  departments,
  users,
  currentUser,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [managerId, setManagerId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id || '');

  const isHR = currentUser?.role === 'hr';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;

    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, description, managerId }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setCode('');
        setName('');
        setDescription('');
        setManagerId('');
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const activeDept = departments.find((d) => d.id === selectedDeptId) || departments[0];
  const deptMembers = users.filter((u) => u.departmentId === activeDept?.id);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Cơ cấu Phòng ban & Phân cấp Quản lý</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mỗi phòng ban có Trưởng phòng phụ trách. Trưởng phòng chỉ có quyền xem và duyệt điểm danh của thành viên trong phòng mình.
          </p>
        </div>

        {isHR && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Phòng ban mới</span>
          </button>
        )}
      </div>

      {/* Department Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {departments.map((dept) => {
          const isSelected = dept.id === activeDept?.id;
          const memberCount = users.filter((u) => u.departmentId === dept.id).length;
          return (
            <button
              key={dept.id}
              onClick={() => setSelectedDeptId(dept.id)}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-orange-50/70 border-orange-400 shadow-xs ring-1 ring-orange-400'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    {dept.code}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {memberCount} thành viên
                  </span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 leading-snug">
                  {dept.name}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  {dept.description || 'Chưa có mô tả'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100/80 flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <div className="text-[11px] text-slate-600 truncate">
                  Trưởng phòng: <strong className="text-slate-900">{dept.managerName}</strong>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Department Members Table */}
      {activeDept && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Danh sách nhân sự: {activeDept.name}
              </h3>
              <p className="text-xs text-slate-500">
                Trưởng phòng phụ trách: <span className="font-semibold text-amber-700">{activeDept.managerName}</span>
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200/70 text-slate-700">
              {deptMembers.length} nhân viên
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Nhân viên</th>
                  <th className="py-3 px-4">Chức vụ</th>
                  <th className="py-3 px-4">Vai trò hệ thống</th>
                  <th className="py-3 px-4">Mã Hanet FaceID</th>
                  <th className="py-3 px-4">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptMembers.map((member) => {
                  const isManager = member.id === activeDept.managerId;
                  return (
                    <tr key={member.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={member.avatarUrl}
                            alt={member.name}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                          />
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {member.name}
                              {isManager && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                  Trưởng phòng
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {member.code} • {member.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {member.position}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[10px] border ${
                          member.role === 'hr'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : member.role === 'dept_manager'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}>
                          {member.role === 'hr' ? 'HR Manager' : member.role === 'dept_manager' ? 'Trưởng phòng' : 'Nhân viên'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {member.hanetPersonId}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                          ● Đang làm việc
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-orange-400" />
                <span className="font-bold text-sm">Thêm Phòng Ban Mới</span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mã phòng ban (Code):</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: LOGISTICS"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono uppercase focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên phòng ban:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Phòng Hậu cần & Kho vận"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mô tả chức năng nhiệm vụ:</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả tóm tắt vai trò phòng ban..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chỉ định Trưởng phòng:</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 bg-white"
                >
                  <option value="">-- Chưa chỉ định --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code}) - {u.departmentName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center gap-2">
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
                  Tạo phòng ban
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
