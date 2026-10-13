import React, { useState } from 'react';
import { KeyRound, Pencil, Search, Trash2, UserPlus } from 'lucide-react';
import type { Department, User } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL, SYSTEM_ADMIN_CODE } from '../format';
import { UserFormModal } from './UserFormModal';
import { TempPasswordDialog } from './TempPasswordDialog';
import { ConfirmDeleteDialog, inputCls, primaryBtn, secondaryBtn } from './ui';

interface EmployeesTabProps {
  users: User[];
  departments: Department[];
  currentUser: User;
  onRefresh: () => void;
}

export const EmployeesTab: React.FC<EmployeesTabProps> = ({ users, departments, currentUser, onRefresh }) => {
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [tempPassword, setTempPassword] = useState<{ label: string; password: string } | null>(null);
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<User | null>(null);
  const isSystemAdmin = currentUser.code === SYSTEM_ADMIN_CODE;

  const resetPassword = async (u: User) => {
    if (!window.confirm(`Đặt lại mật khẩu cho ${u.name} (${u.code})? Mật khẩu cũ và các phiên đăng nhập của người này sẽ mất hiệu lực.`)) return;
    try {
      const r = await api<{ tempPassword: string }>(`/api/users/${u.id}/reset-password`, { method: 'POST' });
      setTempPassword({ label: `${u.name} (${u.code})`, password: r.tempPassword });
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  const q = search.trim().toLocaleLowerCase('vi');
  const filtered = users.filter(
    (u) =>
      (!deptFilter || u.departmentId === deptFilter) &&
      (!q || u.name.toLocaleLowerCase('vi').includes(q) || u.code.toLocaleLowerCase('vi').includes(q) || u.position.toLocaleLowerCase('vi').includes(q)),
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Quản lý nhân sự</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mã nhân viên phải trùng <span className="font-mono">aliasID</span> trên Hanet để camera khớp đúng người. Đồng bộ khuôn mặt lên Hanet chưa được hỗ trợ; hãy đăng ký trên ứng dụng Hanet.
          </p>
        </div>
        <button onClick={() => setEditing('new')} className={primaryBtn}>
          <UserPlus className="w-4 h-4" /> Thêm nhân sự
        </button>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Tìm theo tên, mã NV, chức vụ..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={`${inputCls} w-auto`} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">Tất cả phòng ({users.length})</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((u) => (
          <div key={u.id} className={`bg-white rounded-2xl border shadow-xs p-4 text-xs ${u.status === 'inactive' ? 'border-slate-200 opacity-60' : 'border-slate-200/80'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-mono font-bold px-1.5 rounded bg-slate-100 text-slate-600">{u.code}</span>
                <h3 className="font-bold text-sm text-slate-900 mt-1 truncate">{u.name}</h3>
                <p className="text-slate-500 truncate">{u.position || '—'}</p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200 shrink-0">{ROLE_LABEL[u.role]}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
              <div className="flex justify-between"><span className="text-slate-400">Phòng ban</span><span>{u.departmentName ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Hanet Person ID</span><span className="font-mono">{u.hanetPersonId ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Khuôn mặt</span><span>{u.faceRegistered ? 'Đã đăng ký' : 'Chưa đăng ký'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Trạng thái</span><span>{u.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}</span></div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
              <button onClick={() => setEditing(u)} className={`${secondaryBtn} flex-1 py-1.5`}>
                <Pencil className="w-3.5 h-3.5" /> Sửa
              </button>
              <button onClick={() => resetPassword(u)} className={`${secondaryBtn} flex-1 py-1.5`}>
                <KeyRound className="w-3.5 h-3.5" /> Đặt lại mật khẩu
              </button>
              {isSystemAdmin && (
                <button
                  onClick={() => setDeleting(u)}
                  className={`${secondaryBtn} py-1.5 px-2.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200`}
                  title="Xóa nhân sự"
                  aria-label={`Xóa ${u.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <UserFormModal
          user={editing === 'new' ? undefined : editing}
          departments={departments}
          currentUserId={currentUser.id}
          onClose={() => setEditing(null)}
          onSaved={({ user, tempPassword: pw }) => {
            setEditing(null);
            if (pw) setTempPassword({ label: `${user.name} (${user.code})`, password: pw });
            onRefresh();
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          title="Xóa nhân sự"
          confirmLabel="Xóa vĩnh viễn"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/api/users/${deleting.id}`, { method: 'DELETE' });
            setDeleting(null);
            onRefresh();
          }}
        >
          <p>
            Xóa <strong>{deleting.name}</strong> (<span className="font-mono">{deleting.code}</span>)?
          </p>
          <p className="text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-2.5">
            Toàn bộ lịch sử điểm danh, bảng công và đơn từ của người này cũng bị xóa. Hệ thống tự sao lưu trước khi xóa.
          </p>
          <p className="text-slate-500">
            Nếu người này chỉ nghỉ việc, nên bấm <strong>Sửa</strong> và chuyển trạng thái sang <strong>Đã nghỉ</strong> để giữ lịch sử.
          </p>
        </ConfirmDeleteDialog>
      )}
      {tempPassword && <TempPasswordDialog employeeLabel={tempPassword.label} password={tempPassword.password} onClose={() => setTempPassword(null)} />}
    </div>
  );
};
