import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { Field, dangerBtn, inputCls } from '../ui';

export const DangerZoneCard: React.FC = () => {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm('XÓA TOÀN BỘ nhân sự (trừ bạn), phòng ban, camera, dữ liệu điểm danh và đơn? Hệ thống sẽ tự sao lưu trước khi xóa.')) return;
    setBusy(true);
    try {
      const r = await api<{ backup: string }>('/api/admin/reset-database', { method: 'POST', body: { password } });
      window.alert(`Đã xóa dữ liệu. Bản sao lưu trước khi xóa: ${r.backup}`);
      window.location.reload();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={reset} className="bg-rose-50/60 rounded-2xl border border-rose-200 p-5 text-xs space-y-3">
      <h3 className="font-bold text-sm text-rose-800 flex items-center gap-2">
        <Trash2 className="w-4 h-4" /> Xóa toàn bộ dữ liệu
      </h3>
      <p className="text-rose-700">
        Giữ lại tài khoản của bạn và các cấu hình (giờ làm, Camera AI, token webhook). Mọi thứ khác bị xóa. Hệ thống sao lưu tự động trước khi xóa.
      </p>
      <Field label="Nhập lại mật khẩu của bạn để xác nhận">
        <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </Field>
      {message && <p className="text-rose-700">{message}</p>}
      <button type="submit" disabled={busy || !password} className={dangerBtn}>
        Xóa dữ liệu
      </button>
    </form>
  );
};
