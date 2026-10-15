import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn } from './ui';

export const LoginScreen: React.FC<{ onLoggedIn: () => void; onForgot: () => void; notice?: string | null }> = ({ onLoggedIn, onForgot, notice }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { login, password } });
      onLoggedIn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-brand-50 via-surface-muted to-white flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 border-t-4 border-t-brand-500 shadow-xl shadow-brand-900/5 p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-brand-500 flex items-center justify-center text-white">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">Petrolimex Attendance</h1>
            <p className="text-xs text-slate-500">Đăng nhập bằng mã nhân viên hoặc email</p>
          </div>
        </div>
        {notice && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-2">{notice}</p>}
        <Field label="Mã nhân viên hoặc email">
          <input className={inputCls} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required autoFocus />
        </Field>
        <Field label="Mật khẩu">
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full py-2.5`}>
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
        <button type="button" onClick={onForgot} className="text-[11px] text-brand-600 hover:underline cursor-pointer">
          Quên mật khẩu?
        </button>
      </form>
    </div>
  );
};
