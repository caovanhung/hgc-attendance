import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api, errorMessage } from '../api';
import { Field, inputCls, primaryBtn, secondaryBtn } from './ui';

interface Props {
  forced: boolean;
  onDone: () => void;
  onCancel: () => void;
  onLogout: () => void;
}

export const ChangePasswordScreen: React.FC<Props> = ({ forced, onDone, onCancel, onLogout }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-brand-50 via-surface-muted to-white flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 border-t-4 border-t-brand-500 shadow-xl shadow-brand-900/5 p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-brand-500" />
          <h1 className="font-bold text-brand-navy">Đổi mật khẩu</h1>
        </div>
        {forced && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-2">
            Bạn đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới (ít nhất 8 ký tự) để tiếp tục.
          </p>
        )}
        <Field label={forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'}>
          <input className={inputCls} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="Mật khẩu mới">
          <input className={inputCls} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Nhập lại mật khẩu mới">
          <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-2">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={forced ? onLogout : onCancel} className={`${secondaryBtn} flex-1`}>
            {forced ? 'Đăng xuất' : 'Hủy'}
          </button>
          <button type="submit" disabled={busy} className={`${primaryBtn} flex-1`}>
            {busy ? 'Đang lưu...' : 'Đổi mật khẩu'}
          </button>
        </div>
      </form>
    </div>
  );
};
