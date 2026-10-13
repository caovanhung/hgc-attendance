import React, { useState } from 'react';
import type { Camera, User } from '../types';
import { api, errorMessage } from '../api';
import { vnToday } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface HanetSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: Camera[];
  users: User[];
  onSimulateSuccess: () => void;
}

export const HanetSimulatorModal: React.FC<HanetSimulatorModalProps> = ({ isOpen, onClose, cameras, users, onSimulateSuccess }) => {
  const [userId, setUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [date, setDate] = useState(vnToday());
  const [time, setTime] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const submit = async () => {
    if (!userId) {
      setMessage('Hãy chọn nhân viên');
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ result: { status: string; message: string } }>('/api/hanet/simulate', {
        method: 'POST',
        body: { userId, deviceId: deviceId || undefined, date, time: time || undefined },
      });
      setMessage(`${r.result.status}: ${r.result.message}`);
      onSimulateSuccess();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Mô phỏng camera nhận diện (chỉ để thử nghiệm)" onClose={onClose}>
      <div className="space-y-3.5">
        <p className="text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2">
          Lượt mô phỏng được đánh dấu "Mô phỏng" và không được tính công khi chạy production.
        </p>
        <Field label="Nhân viên">
          <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— Chọn nhân viên —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Camera">
          <select className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Thiết bị mô phỏng</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.deviceKey}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Giờ (trống = bây giờ)">
            <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {message && <p className="text-slate-700 bg-slate-50 rounded-xl p-2">{message}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className={`${secondaryBtn} flex-1`}>
            Đóng
          </button>
          <button onClick={submit} disabled={busy} className={`${primaryBtn} flex-1`}>
            {busy ? 'Đang gửi...' : 'Gửi lượt nhận diện'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
