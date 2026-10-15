import React, { useState } from 'react';
import { PlugZap, ShieldCheck } from 'lucide-react';
import type { HanetConfigView, HanetConnectionTest, HanetPlace } from '../../types';
import { api, errorMessage } from '../../api';
import { fmtDateTime, vnToday } from '../../format';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

export const HanetCredentialsCard: React.FC<{ config: HanetConfigView; onChange: (c: HanetConfigView) => void; onReconciled: () => void }> = ({
  config,
  onChange,
  onReconciled,
}) => {
  const savedPlace = config.placeIds[0] ? String(config.placeIds[0]) : '';
  const [clientId, setClientId] = useState(config.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [apiBase, setApiBase] = useState(config.apiBase);
  const [placeId, setPlaceId] = useState(savedPlace);
  const [places, setPlaces] = useState<HanetPlace[]>([]);
  const [conn, setConn] = useState<HanetConnectionTest | null>(null);
  const [date, setDate] = useState(vnToday());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ config: HanetConfigView }>('/api/hanet/config', {
        method: 'PUT',
        body: { clientId, clientSecret, accessToken, refreshToken, apiBase, placeIds: placeId ? [Number(placeId)] : [] },
      });
      onChange(r.config);
      setClientSecret('');
      setAccessToken('');
      setRefreshToken('');
      setMessage('Đã lưu cấu hình Camera AI.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    try {
      const r = await api<HanetConnectionTest>('/api/hanet/test-connection', { method: 'POST', body: {} });
      setConn(r);
      setPlaces(r.places);
    } catch (err) {
      setConn({ ok: false, account: null, places: [], message: errorMessage(err) });
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
  const placeChanged = savedPlace !== '' && placeId !== '' && placeId !== savedPlace;

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-5 text-sm space-y-4">
      <h3 className="font-bold text-sm text-brand-navy flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-brand-500" /> Kết nối Camera AI & đối soát
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
          <Field label="Địa điểm Camera AI" hint={places.length ? undefined : 'Lưu thông tin trên rồi bấm "Kiểm tra kết nối" để nạp danh sách'}>
            <select className={inputCls} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
              <option value="">— Chưa chọn —</option>
              {placeId && !places.some((p) => String(p.id) === placeId) && <option value={placeId}>ID {placeId}</option>}
              {places.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} (ID {p.id})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Địa chỉ API Camera AI">
            <input className={`${inputCls} font-mono`} value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          </Field>
        </div>
        {placeChanged && (
          <p className="text-amber-700 bg-amber-50 rounded-xl p-2">
            Nhân sự và phòng ban đã đồng bộ với địa điểm cũ sẽ không tự chuyển sang địa điểm mới.
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={testConnection} disabled={busy} className={`${secondaryBtn} flex-1`}>
            <PlugZap className="w-3.5 h-3.5" /> Kiểm tra kết nối
          </button>
          <button type="submit" disabled={busy} className={`${primaryBtn} flex-1`}>
            Lưu cấu hình Camera AI
          </button>
        </div>
        {conn && (
          <p className={`rounded-xl p-2 ${conn.ok ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>{conn.message}</p>
        )}
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
