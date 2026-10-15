import React, { useState } from 'react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn } from './ui';

export const ForgotPasswordScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [login, setLogin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMessage((await api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: { login } })).message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-brand-50 via-surface-muted to-white flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 border-t-4 border-t-brand-500 shadow-xl shadow-brand-900/5 p-6 w-full max-w-sm space-y-4">
        <h1 className="font-bold text-brand-navy">Quên mật khẩu</h1>
        <p className="text-xs text-slate-500">Nhập mã nhân viên hoặc email. Hệ thống sẽ gửi link đặt lại mật khẩu (dùng được trong 30 phút) tới email của bạn.</p>
        {message ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-2">{message}</p>
        ) : (
          <>
            <Field label="Mã nhân viên hoặc email">
              <input className={inputCls} value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
            </Field>
            {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
            <button type="submit" disabled={busy} className={`${primaryBtn} w-full py-2.5`}>
              {busy ? 'Đang gửi...' : 'Gửi link đặt lại'}
            </button>
          </>
        )}
        <button type="button" onClick={onBack} className="text-[11px] text-brand-600 hover:underline cursor-pointer">
          ← Quay lại đăng nhập
        </button>
      </form>
    </div>
  );
};
