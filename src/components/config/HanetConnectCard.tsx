import React, { useEffect, useState } from 'react';
import { PlugZap, Video } from 'lucide-react';
import type { VideoAccountView } from '../../types';
import { api, errorMessage } from '../../api';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

/** Tài khoản dùng để phát lại video camera ngay trên web (nút "Xem video lúc này" ở Bảng công). */
export const HanetConnectCard: React.FC = () => {
  const [account, setAccount] = useState<VideoAccountView | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<VideoAccountView>('/api/hanet/connect')
      .then((a) => {
        setAccount(a);
        setEmail(a.email ?? '');
      })
      .catch((err) => setResult({ ok: false, message: errorMessage(err) }));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const a = await api<VideoAccountView>('/api/hanet/connect', { method: 'PUT', body: { email, password } });
      setAccount(a);
      setEmail(a.email ?? '');
      setPassword('');
      setResult({ ok: true, message: a.email ? 'Đã lưu tài khoản xem video.' : 'Đã xóa tài khoản xem video.' });
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      setResult(await api<{ ok: boolean; message: string }>('/api/hanet/connect/test', { method: 'POST', body: {} }));
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-5 text-sm space-y-4">
      <h3 className="font-bold text-sm text-brand-navy flex items-center gap-2">
        <Video className="w-4 h-4 text-brand-500" /> Tài khoản xem video
      </h3>
      <p className="text-slate-500">
        Dùng để phát lại video camera ngay trong Bảng công. Nên tạo một tài khoản riêng chỉ có quyền xem, không dùng tài khoản chủ.
      </p>
      <form onSubmit={save} className="space-y-3">
        <Field label="Email đăng nhập" hint="Để trống rồi Lưu để xóa tài khoản">
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Mật khẩu">
          <input
            type="password"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={account?.hasPassword ? 'Đã lưu — để trống nếu không đổi' : ''}
            autoComplete="new-password"
          />
        </Field>
        <div className="flex gap-2">
          <button type="button" onClick={test} disabled={busy || !account?.email} className={`${secondaryBtn} flex-1`}>
            <PlugZap className="w-3.5 h-3.5" /> Kiểm tra
          </button>
          <button type="submit" disabled={busy || account === null} className={`${primaryBtn} flex-1`}>
            Lưu
          </button>
        </div>
        {result && <p className={`rounded-xl p-2 ${result.ok ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>{result.message}</p>}
      </form>
    </div>
  );
};
