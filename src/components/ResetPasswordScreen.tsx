import React, { useState } from 'react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn } from './ui';

export const ResetPasswordScreen: React.FC<{ token: string; onDone: (notice: string | null) => void }> = ({ token, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword: password } });
      onDone('Đã đặt mật khẩu mới. Hãy đăng nhập.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-brand-50 via-surface-muted to-white flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 border-t-4 border-t-brand-500 shadow-xl shadow-brand-900/5 p-6 w-full max-w-sm space-y-4">
        <h1 className="font-bold text-brand-navy">Đặt mật khẩu mới</h1>
        <Field label="Mật khẩu mới" hint="Ít nhất 8 ký tự">
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required autoFocus />
        </Field>
        <Field label="Nhập lại mật khẩu mới">
          <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full py-2.5`}>
          {busy ? 'Đang lưu...' : 'Đặt mật khẩu'}
        </button>
        <button type="button" onClick={() => onDone(null)} className="text-[11px] text-brand-600 hover:underline cursor-pointer">
          ← Quay lại đăng nhập
        </button>
      </form>
    </div>
  );
};
