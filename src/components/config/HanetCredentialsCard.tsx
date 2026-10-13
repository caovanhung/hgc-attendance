import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { HanetConfigView } from '../../types';
import { api, errorMessage } from '../../api';
import { fmtDateTime, vnToday } from '../../format';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

export const HanetCredentialsCard: React.FC<{ config: HanetConfigView; onChange: (c: HanetConfigView) => void; onReconciled: () => void }> = ({
  config,
  onChange,
  onReconciled,
}) => {
  const [clientId, setClientId] = useState(config.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [apiBase, setApiBase] = useState(config.apiBase);
  const [placeIds, setPlaceIds] = useState(config.placeIds.join(', '));
  const [date, setDate] = useState(vnToday());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ids = placeIds.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
      const r = await api<{ config: HanetConfigView }>('/api/hanet/config', {
        method: 'PUT',
        body: { clientId, clientSecret, accessToken, refreshToken, apiBase, placeIds: ids },
      });
      onChange(r.config);
      setClientSecret('');
      setAccessToken('');
      setRefreshToken('');
      setMessage('Đã lưu cấu hình Hanet.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reconcile = async () => {
    setBusy(true);
    try {
      const r = await api<{ summary: { inserted: number; duplicates: number; ignored: number }; config: HanetConfigView }>('/api/hanet/reconcile', {
        method: 'POST',
        body: { date },
      });
      onChange(r.config);
      setMessage(`Đối soát xong: thêm ${r.summary.inserted}, trùng ${r.summary.duplicates}, bỏ qua ${r.summary.ignored}.`);
      onReconciled();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const secretHint = (masked: string) => (masked ? `Đang lưu ${masked}. Để trống để giữ nguyên.` : 'Chưa có');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-4">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-orange-500" /> Kết nối Hanet & đối soát
      </h3>
      <form onSubmit={save} className="space-y-3">
        <Field label="Client ID">
          <input className={`${inputCls} font-mono`} value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </Field>
        <Field label="Client Secret" hint={secretHint(config.clientSecret)}>
          <input type="password" className={`${inputCls} font-mono`} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Access Token" hint={secretHint(config.accessToken)}>
          <input type="password" className={`${inputCls} font-mono`} value={accessToken} onChange={(e) => setAccessToken(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Refresh Token" hint={secretHint(config.refreshToken)}>
          <input type="password" className={`${inputCls} font-mono`} value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Place ID (cách nhau dấu phẩy)">
            <input className={`${inputCls} font-mono`} value={placeIds} onChange={(e) => setPlaceIds(e.target.value)} />
          </Field>
          <Field label="Địa chỉ API Hanet">
            <input className={`${inputCls} font-mono`} value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          </Field>
        </div>
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
          Lưu cấu hình Hanet
        </button>
      </form>

      <div className="pt-3 border-t border-slate-100 space-y-2">
        <div className="text-slate-600">
          Đối soát tự động mỗi 15 phút: <strong>{config.reconcileEnabled ? 'đang bật' : 'chưa đủ cấu hình'}</strong>
          {config.lastReconcileAt && <> · lần cuối {fmtDateTime(config.lastReconcileAt)}</>}
        </div>
        {config.lastReconcileError && <p className="text-rose-600 bg-rose-50 rounded-xl p-2">Lỗi đối soát gần nhất: {config.lastReconcileError}</p>}
        <div className="flex items-end gap-2">
          <Field label="Ngày đối soát">
            <input type="date" className={inputCls} value={date} max={vnToday()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <button onClick={reconcile} disabled={busy || !config.reconcileEnabled} className={secondaryBtn}>
            Đối soát ngay
          </button>
        </div>
      </div>
      {message && <p className="text-slate-700 bg-slate-50 rounded-xl p-2">{message}</p>}
    </div>
  );
};
