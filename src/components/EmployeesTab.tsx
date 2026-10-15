import React, { useState } from 'react';
import { CloudDownload, FileSpreadsheet, KeyRound, Mail, Pencil, Search, Trash2, UserPlus } from 'lucide-react';
import type { Area, Department, FaceResult, User } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL } from '../format';
import { canDeleteUserUi } from '../permissions';
import { UserFormModal } from './UserFormModal';
import { ImportFromHanetModal } from './ImportFromHanetModal';
import { CsvImportModal } from './CsvImportModal';
import { ConfirmDeleteDialog, inputCls, primaryBtn, secondaryBtn } from './ui';
import { SyncBadge, SyncRetryButton } from './SyncBadge';

interface EmployeesTabProps {
  users: User[];
  departments: Department[];
  currentUser: User;
  isSystemAdmin: boolean;
  areas: Area[];
  onRefresh: () => void;
}

export const EmployeesTab: React.FC<EmployeesTabProps> = ({ users, departments, currentUser, isSystemAdmin, areas, onRefresh }) => {
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<User | null>(null);
  const [faceNotice, setFaceNotice] = useState<FaceResult | null>(null);

  const resetPassword = async (u: User) => {
    const again = u.canLogin ? 'Mật khẩu mới sẽ được gửi qua email; mật khẩu cũ hết hiệu lực khi thư đi.' : 'Thư chào mừng kèm mật khẩu sẽ được gửi lại.';
    if (!window.confirm(`${u.canLogin ? 'Đặt lại mật khẩu' : 'Gửi lại thư'} cho ${u.name} (${u.code}) tới ${u.email || '(chưa có email)'}? ${again}`)) return;
    try {
      await api<{ queued: boolean }>(`/api/users/${u.id}/reset-password`, { method: 'POST' });
      setNotice(`Đã xếp thư gửi tới ${u.email}. Thư sẽ đi trong vòng 1 phút.`);
      onRefresh();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  // Quản trị khu không đụng người quản trị khác/HR; không phải ADMIN thì không sửa/đặt lại mật khẩu của HR khác
  const canManageTarget = (u: User) =>
    (currentUser.role !== 'area_admin' || u.id === currentUser.id || (u.role !== 'hr' && u.role !== 'area_admin')) &&
    (isSystemAdmin || u.role !== 'hr' || u.id === currentUser.id);

  const q = search.trim().toLocaleLowerCase('vi');
  const filtered = users.filter(
    (u) =>
      (!deptFilter || u.departmentId === deptFilter) &&
      (!q || u.name.toLocaleLowerCase('vi').includes(q) || u.code.toLocaleLowerCase('vi').includes(q) || u.position.toLocaleLowerCase('vi').includes(q)),
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-border border-l-4 border-l-brand-500 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-brand-navy">Quản lý nhân sự</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Người mới: nhờ đứng trước Camera AI, rồi bấm Thêm nhân sự → Lấy từ camera để đăng ký FaceID. Thay đổi trên web tự đồng bộ sang Camera AI.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCsvOpen(true)} className={secondaryBtn}>
            <FileSpreadsheet className="w-4 h-4" /> Nhập từ file CSV
          </button>
          <button onClick={() => setImporting(true)} className={secondaryBtn}>
            <CloudDownload className="w-4 h-4" /> Nhập từ Camera AI
          </button>
          <button onClick={() => setEditing('new')} className={primaryBtn}>
            <UserPlus className="w-4 h-4" /> Thêm nhân sự
          </button>
        </div>
      </div>

      {faceNotice && (
        <div className={`rounded-2xl p-3 text-xs flex items-center justify-between gap-2 ${faceNotice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
          <span>FaceID: {faceNotice.message}</span>
          <button onClick={() => setFaceNotice(null)} className="cursor-pointer" aria-label="Đóng">
            ✕
          </button>
        </div>
      )}

      {notice && (
        <div className="rounded-2xl p-3 text-xs flex items-center justify-between gap-2 bg-emerald-50 text-emerald-800">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="cursor-pointer" aria-label="Đóng">
            ✕
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 border border-border shadow-card flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} pl-9`} placeholder="Tìm theo tên, mã NV, chức vụ..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={`${inputCls} w-auto!`} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
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
          <div key={u.id} className={`bg-white rounded-2xl border shadow-card p-4 text-sm ${u.status === 'inactive' ? 'border-slate-200 opacity-60' : 'border-border'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-mono font-bold px-1.5 rounded bg-slate-100 text-slate-600">{u.code}</span>
                <h3 className="font-bold text-sm text-brand-navy mt-1 truncate">{u.name}</h3>
                <p className="text-slate-500 truncate">{u.position || '—'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <SyncBadge status={u.hanetSyncStatus} error={u.hanetSyncError} />
                  {u.hanetSyncStatus === 'error' && <SyncRetryButton entityType="user" entityId={u.id} onDone={onRefresh} />}
                </div>
                {u.hanetSyncStatus !== 'synced' && u.hanetSyncError && (
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate" title={u.hanetSyncError}>
                    {u.hanetSyncError}
                  </p>
                )}
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200 shrink-0">{ROLE_LABEL[u.role]}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Khu vực</span><span>{u.areaName ?? '—'}</span></div>
              {u.role === 'area_admin' && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Khu quản lý</span>
                  <span>{areas.filter((a) => u.adminAreaIds.includes(a.id)).map((a) => a.name).join(', ') || '—'}</span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="truncate ml-2">{u.email || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Điện thoại</span><span>{u.phone || '—'}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tài khoản</span>
                <span
                  className={
                    !u.email ? 'text-amber-700' : u.emailStatus === 'error' ? 'text-rose-700' : u.emailStatus === 'pending' ? 'text-sky-700' : 'text-emerald-700'
                  }
                  title={u.emailError ?? undefined}
                >
                  {!u.email
                    ? 'Thiếu email'
                    : u.emailStatus === 'error'
                      ? 'Lỗi gửi thư'
                      : u.emailStatus === 'pending'
                        ? 'Chờ gửi thư'
                        : u.canLogin
                          ? 'Đã có mật khẩu'
                          : 'Chưa gửi thư'}
                </span>
              </div>
              {u.emailStatus === 'error' && u.emailError && <p className="text-[11px] text-rose-600">{u.emailError}</p>}
              <div className="flex justify-between"><span className="text-slate-500">Phòng ban</span><span>{u.departmentName ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Ca</span><span>{u.shiftName ?? departments.find((d) => d.id === u.departmentId)?.shiftName ?? 'Ca mặc định công ty'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Person ID (Camera AI)</span><span className="font-mono">{u.hanetPersonId ?? '—'}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-500">FaceID</span>
                <span className={u.faceRegistered ? 'text-emerald-700' : 'text-amber-700'}>{u.faceRegistered ? 'Đã có FaceID' : 'Chưa có FaceID'}</span>
              </div>
              {!u.faceRegistered && u.faceError && <p className="text-[11px] text-rose-600">{u.faceError}</p>}
              <div className="flex justify-between"><span className="text-slate-500">Trạng thái</span><span>{u.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}</span></div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
              {/* Quản trị khu không sửa người quản trị khác/HR (chỉ sửa chính mình); HR chỉ ADMIN mới sửa người khác */}
              {canManageTarget(u) && (
                <button onClick={() => setEditing(u)} className={`${secondaryBtn} flex-1 py-1.5`}>
                  <Pencil className="w-3.5 h-3.5" /> Sửa
                </button>
              )}
              {canManageTarget(u) && (currentUser.role !== 'area_admin' || u.id !== currentUser.id) && (
                <button
                  onClick={() => resetPassword(u)}
                  disabled={!u.email}
                  title={u.email ? undefined : 'Hãy bổ sung email trước'}
                  className={`${secondaryBtn} flex-1 py-1.5`}
                >
                  {u.canLogin ? <KeyRound className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />} {u.canLogin ? 'Đặt lại mật khẩu' : 'Gửi lại thư'}
                </button>
              )}
              {canDeleteUserUi(currentUser, isSystemAdmin, u) && (
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
          me={currentUser}
          isSystemAdmin={isSystemAdmin}
          areas={areas}
          onClose={() => setEditing(null)}
          onSaved={({ user, face }) => {
            if (!editing || editing === 'new') setNotice(`Đã tạo ${user.name} (${user.code}). Mật khẩu sẽ được gửi tới ${user.email}.`);
            setEditing(null);
            if (face) setFaceNotice(face);
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
      {importing && <ImportFromHanetModal departments={departments} canDelete={currentUser.role === 'hr'} onClose={() => setImporting(false)} onImported={onRefresh} />}
      {csvOpen && <CsvImportModal onClose={() => setCsvOpen(false)} onImported={onRefresh} />}
    </div>
  );
};
