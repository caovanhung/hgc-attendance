import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Holiday, MeResponse, Shift } from '../types';
import { api, errorMessage } from '../api';
import { areaParam } from '../area';
import { formatWorkDays } from '../format';
import { ConfirmDeleteDialog, Field, Modal, WeekdayPicker, inputCls, primaryBtn, secondaryBtn } from './ui';
import { WorkSettingsCard } from './config/WorkSettingsCard';

type Form = Omit<Shift, 'id' | 'areaName' | 'departmentCount' | 'userCount'> & { id?: string };

export const ShiftsTab: React.FC<{ me: MeResponse; area: string; onChanged: () => void }> = ({ me, area, onChanged }) => {
  const isHr = me.user.role === 'hr';
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Shift | null>(null);
  const [deletingHoliday, setDeletingHoliday] = useState<string | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        api<{ shifts: Shift[] }>(`/api/shifts?area=${areaParam(area)}`),
        api<{ holidays: Holiday[] }>(`/api/holidays?year=${year}`),
      ]);
      setShifts(s.shifts);
      setHolidays(h.holidays);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [area, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const blank = (): Form => ({
    areaId: area !== 'all' && area !== 'none' ? area : (me.areas[0]?.id ?? ''),
    name: '',
    workStart: '08:00',
    workEnd: '17:00',
    workDays: [1, 2, 3, 4, 5],
    lateGraceMinutes: 15,
    earlyArrivalMinutes: 15,
    earlyLeaveMinutes: 10,
  });

  /** Thông báo thành công (xanh) và lỗi (đỏ) loại trừ nhau. */
  const showNotice = (msg: string) => {
    setActionError(null);
    setNotice(msg);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    try {
      if (form.id) {
        const r = await api<{ recomputed: number }>(`/api/shifts/${form.id}`, { method: 'PUT', body: form });
        showNotice(`Đã lưu ca. Đã tính lại ${r.recomputed} ngày công từ đầu tháng.`);
      } else {
        await api('/api/shifts', { method: 'POST', body: form });
        showNotice('Đã thêm ca. Gán ca cho phòng ban ở tab Phòng ban.');
      }
      setForm(null);
      void load();
      onChanged();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ recomputed: number }>('/api/holidays', { method: 'POST', body: newHoliday });
      setNewHoliday({ date: '', name: '' });
      showNotice(r.recomputed ? `Đã thêm ngày lễ, tính lại ${r.recomputed} ngày công.` : 'Đã thêm ngày lễ.');
      void load();
      onChanged();
    } catch (err) {
      setNotice(null);
      setActionError(errorMessage(err));
    }
  };

  /** Lỗi được ném ra để hộp xác nhận xóa hiện (hộp vẫn mở). */
  const removeHoliday = async (date: string) => {
    const r = await api<{ recomputed: number }>(`/api/holidays/${date}`, { method: 'DELETE' });
    setDeletingHoliday(null);
    showNotice(r.recomputed ? `Đã xóa ngày lễ, tính lại ${r.recomputed} ngày công.` : 'Đã xóa ngày lễ.');
    void load();
    onChanged();
  };

  if (error) return <p className="text-xs text-rose-600">{error}</p>;
  if (!shifts) return <p className="text-xs text-slate-500">Đang tải ca làm việc...</p>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-border border-l-4 border-l-brand-500 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Ca làm việc</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mỗi khu có ca riêng. Phòng ban chọn ca ở tab Phòng ban; phòng chưa chọn ca dùng ca mặc định công ty. Sửa ca thì hệ thống tự tính lại công từ đầu tháng.
          </p>
        </div>
        <button onClick={() => setForm(blank())} disabled={me.areas.length === 0} className={primaryBtn}>
          <Plus className="w-4 h-4" /> Thêm ca
        </button>
      </div>
      {notice && <p className="text-xs text-emerald-800 bg-emerald-50 rounded-xl p-3">{notice}</p>}
      {actionError && (
        <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shifts.map((s) => (
          <div key={s.id} className="bg-white rounded-2xl border border-border shadow-card p-4 text-sm space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm text-slate-900">{s.name}</h3>
                <p className="text-[11px] text-violet-700">{s.areaName}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setForm({ ...s })} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label={`Sửa ${s.name}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleting(s)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label={`Xóa ${s.name}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <Clock className="w-3.5 h-3.5 text-brand-500" /> {s.workStart}–{s.workEnd} · {formatWorkDays(s.workDays)}
            </div>
            <div className="text-slate-500">
              Muộn sau {s.lateGraceMinutes}' · đi sớm trước {s.earlyArrivalMinutes}' · về sớm quá {s.earlyLeaveMinutes}'
            </div>
            <div className="text-slate-500">
              {s.departmentCount} phòng ban · {s.userCount} người dùng ca riêng
            </div>
          </div>
        ))}
        {shifts.length === 0 && <p className="text-xs text-slate-500">Chưa có ca nào trong khu đang chọn.</p>}
      </div>

      {/* Ngày lễ: mọi quản lý xem được; chỉ HR toàn hệ thống thêm/xóa (spec mục 9) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isHr && <WorkSettingsCard onRecomputed={onChanged} />}
        <div className="bg-white rounded-2xl border border-border shadow-card p-5 text-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-brand-500" /> Ngày lễ
            </h3>
            <select className={`${inputCls} w-auto!`} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <ul className="divide-y divide-slate-100">
            {holidays.map((h) => (
              <li key={h.date} className="py-1.5 flex items-center justify-between">
                <span>
                  <span className="font-mono">{h.date.split('-').reverse().join('/')}</span> · {h.name}
                </span>
                {isHr && (
                  <button onClick={() => setDeletingHoliday(h.date)} className="text-rose-600 hover:underline cursor-pointer">
                    Xóa
                  </button>
                )}
              </li>
            ))}
            {holidays.length === 0 && <li className="py-1.5 text-slate-500">Chưa có ngày lễ nào trong năm {year}.</li>}
          </ul>
          {isHr && (
            <form onSubmit={addHoliday} className="flex flex-wrap gap-2">
              <input type="date" className={`${inputCls} w-auto!`} value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} required />
              <input className={`${inputCls} flex-1 min-w-[140px]`} placeholder="Tên ngày lễ" value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} required />
              <button type="submit" className={secondaryBtn}>
                Thêm
              </button>
            </form>
          )}
        </div>
      </div>

      {form && (
        <Modal title={form.id ? 'Sửa ca' : 'Thêm ca'} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            <Field label="Khu vực">
              <select className={inputCls} value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })} disabled={Boolean(form.id)} required>
                {me.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tên ca">
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giờ vào">
                <input type="time" className={inputCls} value={form.workStart} onChange={(e) => setForm({ ...form, workStart: e.target.value })} required />
              </Field>
              <Field label="Giờ ra">
                <input type="time" className={inputCls} value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} required />
              </Field>
              <Field label="Cho phép muộn (phút)">
                <input type="number" min={0} max={120} className={inputCls} value={form.lateGraceMinutes} onChange={(e) => setForm({ ...form, lateGraceMinutes: Number(e.target.value) })} />
              </Field>
              <Field label="Ngưỡng đi sớm (phút)">
                <input type="number" min={0} max={120} className={inputCls} value={form.earlyArrivalMinutes} onChange={(e) => setForm({ ...form, earlyArrivalMinutes: Number(e.target.value) })} />
              </Field>
              <Field label="Cho phép về sớm (phút)">
                <input type="number" min={0} max={120} className={inputCls} value={form.earlyLeaveMinutes} onChange={(e) => setForm({ ...form, earlyLeaveMinutes: Number(e.target.value) })} />
              </Field>
            </div>
            <div>
              <span className="block font-semibold text-slate-700 mb-1 text-xs">Ngày làm trong tuần</span>
              <WeekdayPicker value={form.workDays} onChange={(workDays) => setForm({ ...form, workDays })} />
            </div>
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
          title="Xóa ca"
          confirmLabel="Xóa ca"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/api/shifts/${deleting.id}`, { method: 'DELETE' });
            setDeleting(null);
            void load();
            onChanged();
          }}
        >
          <p>
            Xóa ca <strong>{deleting.name}</strong>? Chỉ xóa được khi không còn phòng ban hay nhân sự nào dùng ca này.
          </p>
        </ConfirmDeleteDialog>
      )}

      {deletingHoliday && (
        <ConfirmDeleteDialog
          title="Xóa ngày lễ"
          confirmLabel="Xóa ngày lễ"
          onClose={() => setDeletingHoliday(null)}
          onConfirm={async () => {
            await removeHoliday(deletingHoliday);
          }}
        >
          <p>
            Xóa ngày lễ <strong>{deletingHoliday.split('-').reverse().join('/')}</strong>?
          </p>
        </ConfirmDeleteDialog>
      )}
    </div>
  );
};
