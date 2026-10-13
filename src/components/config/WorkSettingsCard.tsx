import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { WorkSettings } from '../../types';
import { api, errorMessage } from '../../api';
import { vnToday } from '../../format';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

export const WorkSettingsCard: React.FC<{ onRecomputed: () => void }> = ({ onRecomputed }) => {
  const [ws, setWs] = useState<WorkSettings | null>(null);
  const [from, setFrom] = useState(vnToday());
  const [to, setTo] = useState(vnToday());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: WorkSettings }>('/api/settings/work')
      .then((d) => setWs(d.settings))
      .catch((err) => setMessage(errorMessage(err)));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws) return;
    setBusy(true);
    try {
      setWs((await api<{ settings: WorkSettings }>('/api/settings/work', { method: 'PUT', body: ws })).settings);
      setMessage('Đã lưu. Giờ mới áp dụng cho các lượt nhận diện từ bây giờ; bấm "Tính lại" để áp dụng cho các ngày đã qua.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const recompute = async () => {
    setBusy(true);
    try {
      const r = await api<{ updated: number }>('/api/attendance/recompute', { method: 'POST', body: { from, to } });
      setMessage(`Đã tính lại ${r.updated} dòng công.`);
      onRecomputed();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-4">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
        <Clock className="w-4 h-4 text-orange-500" /> Giờ làm việc
      </h3>
      {ws && (
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <Field label="Giờ vào">
            <input type="time" className={inputCls} value={ws.workStart} onChange={(e) => setWs({ ...ws, workStart: e.target.value })} required />
          </Field>
          <Field label="Cho phép muộn (phút)">
            <input type="number" min={0} max={120} className={inputCls} value={ws.lateGraceMinutes} onChange={(e) => setWs({ ...ws, lateGraceMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Giờ ra">
            <input type="time" className={inputCls} value={ws.workEnd} onChange={(e) => setWs({ ...ws, workEnd: e.target.value })} required />
          </Field>
          <Field label="Ngưỡng giờ ra (phút)" hint="Lượt cuối phải cách lượt đầu ít nhất chừng này mới tính là giờ ra">
            <input type="number" min={1} max={720} className={inputCls} value={ws.minOutGapMinutes} onChange={(e) => setWs({ ...ws, minOutGapMinutes: Number(e.target.value) })} />
          </Field>
          <button type="submit" disabled={busy} className={`${primaryBtn} col-span-2`}>
            Lưu giờ làm việc
          </button>
        </form>
      )}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-end gap-2">
        <Field label="Tính lại từ ngày">
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="đến ngày">
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <button onClick={recompute} disabled={busy} className={secondaryBtn}>
          Tính lại (tối đa 92 ngày)
        </button>
      </div>
      {message && <p className="text-slate-700 bg-slate-50 rounded-xl p-2">{message}</p>}
    </div>
  );
};
