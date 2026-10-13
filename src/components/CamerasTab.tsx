import React, { useState } from 'react';
import { MapPin, Plus, Video } from 'lucide-react';
import type { Camera, User } from '../types';
import { api, errorMessage } from '../api';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface CamerasTabProps {
  cameras: Camera[];
  currentUser: User;
  onRefresh: () => void;
}

const EMPTY = { name: '', deviceKey: '', placeId: '', placeName: '', location: '', ipAddress: '' };

export const CamerasTab: React.FC<CamerasTabProps> = ({ cameras, currentUser, onRefresh }) => {
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    try {
      await api('/api/cameras', { method: 'POST', body: form });
      setForm(null);
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => form && setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Camera Hanet</h2>
          <p className="text-xs text-slate-500 mt-0.5">Danh sách để tham chiếu tên thiết bị. Lượt nhận diện vẫn được ghi khi camera chưa có trong danh sách.</p>
        </div>
        {currentUser.role === 'hr' && (
          <button onClick={() => setForm({ ...EMPTY })} className={primaryBtn}>
            <Plus className="w-4 h-4" /> Thêm camera
          </button>
        )}
      </div>

      {cameras.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-xs text-slate-500">
          <Video className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa có camera nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900">{c.name}</h3>
                <span className="font-mono text-[10px] px-1.5 rounded bg-slate-100 text-slate-600">{c.deviceKey}</span>
              </div>
              {c.location && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <MapPin className="w-3 h-3 text-orange-500" /> {c.location}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl">
                <div>
                  <span className="block text-[10px] text-slate-400">Địa điểm</span>
                  {c.placeName || '—'}
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">Place ID</span>
                  <span className="font-mono">{c.placeId ?? '—'}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[10px] text-slate-400">IP nội bộ</span>
                  <span className="font-mono">{c.ipAddress || '—'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title="Thêm camera Hanet" onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3.5">
            <Field label="Tên camera">
              <input className={inputCls} value={form.name} onChange={set('name')} required />
            </Field>
            <Field label="Mã thiết bị (deviceID trên Hanet)">
              <input className={`${inputCls} font-mono`} value={form.deviceKey} onChange={set('deviceKey')} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Place ID">
                <input className={`${inputCls} font-mono`} inputMode="numeric" value={form.placeId} onChange={set('placeId')} />
              </Field>
              <Field label="Tên địa điểm">
                <input className={inputCls} value={form.placeName} onChange={set('placeName')} />
              </Field>
            </div>
            <Field label="Vị trí lắp đặt">
              <input className={inputCls} value={form.location} onChange={set('location')} />
            </Field>
            <Field label="Địa chỉ IP nội bộ">
              <input className={`${inputCls} font-mono`} value={form.ipAddress} onChange={set('ipAddress')} />
            </Field>
            {error && <p className="text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`}>
                Lưu camera
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
