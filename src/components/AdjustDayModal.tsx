import React, { useState } from 'react';
import type { AttendanceDay } from '../types';
import { api, errorMessage } from '../api';
import { fmtDate, fmtTime } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

type Kind = 'times' | 'leave' | 'business_trip';

/** Hộp "Điều chỉnh ngày công": sửa giờ hoặc chuyển cả ngày thành nghỉ phép / công tác, bắt buộc lý do. */
export const AdjustDayModal: React.FC<{
  userId: string;
  userName: string;
  date: string;
  day: AttendanceDay | null;
  onClose: () => void;
  onSaved: (day: AttendanceDay | null) => void;
}> = ({ userId, userName, date, day, onClose, onSaved }) => {
  const [kind, setKind] = useState<Kind>(day?.override?.kind ?? 'times');
  const [firstIn, setFirstIn] = useState('');
  const [lastOut, setLastOut] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = kind === 'times' ? { kind, firstIn: firstIn || null, lastOut: lastOut || null, reason } : { kind, reason };
      const r = await api<{ day: AttendanceDay | null }>(`/api/attendance/${userId}/${date}/adjustment`, { method: 'PUT', body });
      onSaved(r.day);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Điều chỉnh ngày công · ${userName} · ${fmtDate(date)}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3.5">
        <Field label="Kiểu điều chỉnh">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="times">Sửa giờ vào / giờ ra</option>
            <option value="leave">Chuyển thành Nghỉ phép</option>
            <option value="business_trip">Chuyển thành Công tác</option>
          </select>
        </Field>
        {kind === 'times' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giờ vào" hint={`Để trống = giữ ${fmtTime(day?.firstIn ?? null)}`}>
              <input type="time" className={inputCls} value={firstIn} onChange={(e) => setFirstIn(e.target.value)} />
            </Field>
            <Field label="Giờ ra" hint={`Để trống = giữ ${fmtTime(day?.lastOut ?? null)}`}>
              <input type="time" className={inputCls} value={lastOut} onChange={(e) => setLastOut(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Lý do (bắt buộc)" hint={`${trimmed.length}/500 ký tự, tối thiểu 5`}>
          <textarea rows={3} maxLength={500} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
        {error && <p className="text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${secondaryBtn} flex-1`}>
            Hủy
          </button>
          <button type="submit" disabled={busy || trimmed.length < 5 || (kind === 'times' && !firstIn && !lastOut)} className={`${primaryBtn} flex-1`}>
            Lưu điều chỉnh
          </button>
        </div>
      </form>
    </Modal>
  );
};
