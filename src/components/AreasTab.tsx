import React, { useCallback, useEffect, useState } from 'react';
import { MapPinned, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Area, Camera, Department } from '../types';
import { api, errorMessage } from '../api';
import { ConfirmDeleteDialog, Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

type Form = { id?: string; code: string; name: string; note: string };

export const AreasTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Area | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, d, c] = await Promise.all([
        api<{ areas: Area[] }>('/api/areas'),
        api<{ departments: Department[] }>('/api/departments'),
        api<{ cameras: Camera[] }>('/api/cameras'),
      ]);
      setAreas(a.areas);
      setDepartments(d.departments);
      setCameras(c.cameras);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    void load();
    onChanged();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    try {
      if (form.id) await api(`/api/areas/${form.id}`, { method: 'PUT', body: { name: form.name, note: form.note } });
      else await api('/api/areas', { method: 'POST', body: { code: form.code, name: form.name, note: form.note } });
      setForm(null);
      refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const assign = async (kind: 'departments' | 'cameras', id: string, areaId: string | null) => {
    try {
      await api(`/api/${kind}/${id}`, { method: 'PUT', body: { areaId } });
      refresh();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  if (error) return <p className="text-xs text-rose-600">{error}</p>;
  if (!areas) return <p className="text-xs text-slate-500">Đang tải khu vực...</p>;
  const unassignedDepts = departments.filter((d) => !d.areaId);
  const unassignedCams = cameras.filter((c) => !c.areaId);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-border border-l-4 border-l-brand-500 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Khu vực</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Nhân sự thuộc khu của phòng ban. Quản trị khu vực chỉ xem và quản lý dữ liệu trong khu được giao (cấp quyền ở tab Nhân sự).
          </p>
        </div>
        <button onClick={() => setForm({ code: '', name: '', note: '' })} className={primaryBtn}>
          <Plus className="w-4 h-4" /> Thêm khu vực
        </button>
      </div>

      {(unassignedDepts.length > 0 || unassignedCams.length > 0) && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Chưa gán khu: {unassignedDepts.length} phòng ban, {unassignedCams.length} camera. Chỉ HR toàn hệ thống thấy những mục này; hãy gán vào khu bên dưới.
        </p>
      )}

      {areas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-sm text-slate-500">
          <MapPinned className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa có khu vực nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {areas.map((a) => {
            const depts = departments.filter((d) => d.areaId === a.id);
            const cams = cameras.filter((c) => c.areaId === a.id);
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-border shadow-card p-4 text-sm space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-mono font-bold px-1.5 rounded bg-slate-100 text-slate-600">{a.code}</span>
                    <h3 className="font-bold text-sm text-slate-900 mt-1">{a.name}</h3>
                    {a.note && <p className="text-slate-500">{a.note}</p>}
                    <p className="text-slate-500 mt-1">
                      {a.memberCount} nhân sự · {a.departmentCount} phòng ban · {a.cameraCount} camera
                    </p>
                    <p className="text-slate-500">Quản trị khu: {a.adminNames.length ? a.adminNames.join(', ') : '—'}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setForm({ id: a.id, code: a.code, name: a.name, note: a.note })} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label={`Sửa ${a.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleting(a)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label={`Xóa ${a.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {(
                  [
                    ['departments', 'Phòng ban', depts, departments] as const,
                    ['cameras', 'Camera', cams, cameras] as const,
                  ]
                ).map(([kind, label, inArea, all]) => (
                  <div key={kind}>
                    <div className="font-semibold text-slate-700 mb-1">{label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {inArea.map((x) => (
                        <span key={x.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100">
                          {x.name}
                          <button onClick={() => assign(kind, x.id, null)} className="text-slate-500 hover:text-rose-600 cursor-pointer" aria-label={`Bỏ ${x.name} khỏi khu`}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <select
                        className="px-2 py-0.5 rounded-full border border-dashed border-slate-300 bg-white cursor-pointer"
                        value=""
                        onChange={(e) => e.target.value && assign(kind, e.target.value, a.id)}
                        aria-label={`Thêm ${label.toLowerCase()} vào ${a.name}`}
                      >
                        <option value="">+ Thêm {label.toLowerCase()}</option>
                        {all
                          .filter((x) => x.areaId !== a.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                              {x.areaName ? ` (đang ở ${x.areaName})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Sửa khu vực' : 'Thêm khu vực'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            <Field label="Mã khu vực" hint={form.id ? undefined : 'Để trống: hệ thống tự sinh KV01, KV02...'}>
              <input className={`${inputCls} font-mono uppercase`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={Boolean(form.id)} />
            </Field>
            <Field label="Tên khu vực">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Ghi chú">
              <input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            {formError && <p className="text-rose-600">{formError}</p>}
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

      {deleting && (
        <ConfirmDeleteDialog
          title="Xóa khu vực"
          confirmLabel="Xóa khu vực"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/api/areas/${deleting.id}`, { method: 'DELETE' });
            setDeleting(null);
            refresh();
          }}
        >
          <p>
            Xóa khu <strong>{deleting.name}</strong>? Chỉ xóa được khi khu không còn phòng ban và camera. Quản trị khu của khu này sẽ mất quyền với khu.
          </p>
        </ConfirmDeleteDialog>
      )}
    </div>
  );
};
