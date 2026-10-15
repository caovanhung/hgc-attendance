import React, { useEffect, useState } from 'react';
import { Building, Pencil, Plus, Shield, Trash2, Users } from 'lucide-react';
import type { Area, Department, Shift, User } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL } from '../format';
import { ConfirmDeleteDialog, Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';
import { SyncBadge, SyncRetryButton } from './SyncBadge';

interface DepartmentsTabProps {
  departments: Department[];
  users: User[];
  currentUser: User;
  areas: Area[];
  onRefresh: () => void;
}

export const DepartmentsTab: React.FC<DepartmentsTabProps> = ({ departments, users, currentUser, areas, onRefresh }) => {
  const isManager = currentUser.role === 'hr' || currentUser.role === 'area_admin';
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<{ id?: string; code: string; name: string; description: string; managerId: string; areaId: string; shiftId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  useEffect(() => {
    if (isManager) {
      api<{ shifts: Shift[] }>('/api/shifts')
        .then((d) => setShifts(d.shifts))
        .catch(() => undefined);
    }
  }, [isManager]);

  const active = departments.find((d) => d.id === selectedId) ?? departments[0];
  const members = users.filter((u) => u.departmentId === active?.id);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    try {
      if (form.id) {
        await api(`/api/departments/${form.id}`, {
          method: 'PUT',
          body: { name: form.name, description: form.description, managerId: form.managerId || null, areaId: form.areaId || null, shiftId: form.shiftId || null },
        });
      } else {
        await api('/api/departments', {
          method: 'POST',
          body: { code: form.code, name: form.name, description: form.description, managerId: form.managerId || null, areaId: form.areaId || null, shiftId: form.shiftId || null },
        });
      }
      setForm(null);
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-border border-l-4 border-l-brand-500 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-brand-navy">Phòng ban</h2>
          <p className="text-xs text-slate-500 mt-0.5">Trưởng phòng chỉ xem và duyệt dữ liệu của nhân viên trong phòng mình.</p>
        </div>
        {isManager && (
          <button
            onClick={() =>
              setForm({
                code: '',
                name: '',
                description: '',
                managerId: '',
                areaId: currentUser.role === 'area_admin' ? (areas[0]?.id ?? '') : '',
                shiftId: '',
              })
            }
            className={primaryBtn}
          >
            <Plus className="w-4 h-4" /> Thêm phòng ban
          </button>
        )}
      </div>

      {departments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-sm text-slate-500">
          <Building className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa có phòng ban nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {departments.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`p-4 rounded-2xl border text-left cursor-pointer text-xs ${
                d.id === active?.id ? 'bg-brand-50/70 border-brand-400 ring-1 ring-brand-400' : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{d.code}</span>
                <span className="text-slate-500 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {d.memberCount}
                </span>
              </div>
              <h3 className="font-bold text-sm text-brand-navy">{d.name}</h3>
              <p className="text-[11px] text-violet-700">{d.areaName ?? 'Chưa gán khu'}</p>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{d.description || 'Chưa có mô tả'}</p>
              <p className="text-[11px] text-slate-600 mt-1">🕘 {d.shiftName ?? 'Ca mặc định công ty'}</p>
              <div className="mt-2">
                <SyncBadge status={d.hanetSyncStatus} error={d.hanetSyncError} />
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-600">
                <Shield className="w-3.5 h-3.5 text-amber-600" /> {d.managerName ?? 'Chưa chỉ định trưởng phòng'}
              </div>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-brand-navy">Nhân sự: {active.name}</h3>
            <div className="flex gap-2">
              {isManager && active.hanetSyncStatus === 'error' && <SyncRetryButton entityType="department" entityId={active.id} onDone={onRefresh} />}
              {isManager && (
                <button
                  onClick={() =>
                    setForm({
                      id: active.id,
                      code: active.code,
                      name: active.name,
                      description: active.description,
                      managerId: active.managerId ?? '',
                      areaId: active.areaId ?? '',
                      shiftId: active.shiftId ?? '',
                    })
                  }
                  className={`${secondaryBtn} py-1.5`}
                >
                  <Pencil className="w-3.5 h-3.5" /> Sửa phòng ban
                </button>
              )}
              {isManager && (
                <button onClick={() => setDeleting(active)} className={`${secondaryBtn} py-1.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200`}>
                  <Trash2 className="w-3.5 h-3.5" /> Xóa phòng ban
                </button>
              )}
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-muted border-b border-border text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <th className="py-3 px-4">Nhân viên</th>
                <th className="py-3 px-4">Chức vụ</th>
                <th className="py-3 px-4">Vai trò</th>
                <th className="py-3 px-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">
                      {m.name} {m.id === active.managerId && <span className="text-[11px] px-1.5 rounded bg-amber-100 text-amber-800">Trưởng phòng</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">{m.code}</div>
                  </td>
                  <td className="py-3 px-4">{m.position || '—'}</td>
                  <td className="py-3 px-4">{ROLE_LABEL[m.role]}</td>
                  <td className="py-3 px-4">{m.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <ConfirmDeleteDialog
          title="Xóa phòng ban"
          confirmLabel="Xóa phòng ban"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/api/departments/${deleting.id}`, { method: 'DELETE' });
            setDeleting(null);
            setSelectedId('');
            onRefresh();
          }}
        >
          <p>
            Xóa phòng ban <strong>{deleting.name}</strong> (<span className="font-mono">{deleting.code}</span>)?
          </p>
          <p className="text-slate-500">
            {deleting.memberCount
              ? `${deleting.memberCount} nhân sự trong phòng sẽ chuyển về "chưa có phòng ban"; nhân sự và lịch sử điểm danh của họ vẫn giữ nguyên.`
              : 'Phòng ban này không có nhân sự nào.'}{' '}
            Hệ thống tự sao lưu trước khi xóa.
          </p>
        </ConfirmDeleteDialog>
      )}

      {form && (
        <Modal title={form.id ? 'Sửa phòng ban' : 'Thêm phòng ban'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            {form.id && (
              <Field label="Mã phòng ban">
                <input className={`${inputCls} font-mono`} value={form.code} disabled />
              </Field>
            )}
            <Field label="Tên phòng ban" hint={form.id ? undefined : 'Mã phòng ban (PB001, PB002...) được hệ thống tự sinh'}>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Mô tả">
              <textarea rows={2} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Khu vực">
              <select className={inputCls} value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value, shiftId: '' })} required={currentUser.role === 'area_admin'}>
                {currentUser.role === 'hr' && <option value="">— Chưa gán khu —</option>}
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ca làm việc" hint="Chỉ ca thuộc khu của phòng này">
              <select className={inputCls} value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
                <option value="">Ca mặc định công ty</option>
                {shifts.filter((s) => s.areaId === form.areaId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.workStart}–{s.workEnd})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Trưởng phòng" hint="Nhớ đặt vai trò Trưởng phòng và phòng ban cho người này ở tab Nhân sự">
              <select className={inputCls} value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                <option value="">— Chưa chỉ định —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </select>
            </Field>
            {error && <p className="text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`}>
                Lưu
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
