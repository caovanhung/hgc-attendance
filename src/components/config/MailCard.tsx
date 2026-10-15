import React, { useEffect, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import type { MailConfigView } from '../../types';
import { api, errorMessage } from '../../api';
import { Field, inputCls, primaryBtn, secondaryBtn } from '../ui';

type Form = Omit<MailConfigView, 'hasPassword' | 'configured' | 'sentToday' | 'pending'> & { password: string };

const toForm = (v: MailConfigView): Form => ({
  host: v.host, port: v.port, secure: v.secure, user: v.user, password: '', fromName: v.fromName, fromEmail: v.fromEmail, appUrl: v.appUrl, dailyLimit: v.dailyLimit,
});

/** Cấu hình gửi thư (mật khẩu tạm, link đặt lại mật khẩu). Chỉ ADMIN sửa (ô bị khóa qua fieldset ở HanetConfigTab). */
export const MailCard: React.FC = () => {
  const [view, setView] = useState<MailConfigView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [testTo, setTestTo] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<MailConfigView>('/api/settings/mail')
      .then((v) => {
        setView(v);
        setForm(toForm(v));
        if (!v.appUrl) setForm((f) => (f ? { ...f, appUrl: window.location.origin } : f));
      })
      .catch((err) => setResult({ ok: false, message: errorMessage(err) }));
  }, []);

  if (!form) return <div className="bg-white rounded-2xl border border-border p-5 text-sm text-slate-500">{result?.message ?? 'Đang tải cấu hình thư...'}</div>;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: k === 'port' || k === 'dailyLimit' ? Number(e.target.value) : e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const v = await api<MailConfigView>('/api/settings/mail', { method: 'PUT', body: form });
      setView(v);
      setForm(toForm(v));
      setResult({ ok: true, message: 'Đã lưu cấu hình gửi thư.' });
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      setResult(await api<{ ok: boolean; message: string }>('/api/settings/mail/test', { method: 'POST', body: { to: testTo } }));
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-5 text-sm space-y-4">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
        <Mail className="w-4 h-4 text-brand-500" /> Gửi thư (mật khẩu, đặt lại mật khẩu)
      </h3>
      {view && (
        <p className="text-slate-500">
          {view.configured ? 'Đã cấu hình.' : 'Chưa cấu hình: thư mật khẩu đang chờ.'} Hôm nay đã gửi {view.sentToday}/{view.dailyLimit} thư · đang chờ {view.pending}.
        </p>
      )}
      <form onSubmit={save} className="space-y-3">
        <button
          type="button"
          onClick={() => setForm({ ...form, host: 'smtp.gmail.com', port: 465, secure: 'ssl', dailyLimit: 450 })}
          className={`${secondaryBtn} py-1.5`}
        >
          Dùng Gmail
        </button>
        <p className="text-[11px] text-slate-500">
          Gmail: bật xác minh 2 bước cho tài khoản, tạo "Mật khẩu ứng dụng" (Google Account → Bảo mật → Mật khẩu ứng dụng) rồi dán vào ô Mật khẩu. Gmail giới hạn khoảng 500 thư/ngày.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Máy chủ SMTP">
            <input className={inputCls} value={form.host} onChange={set('host')} required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cổng">
              <input className={inputCls} type="number" value={form.port} onChange={set('port')} required />
            </Field>
            <Field label="Bảo mật">
              <select className={inputCls} value={form.secure} onChange={set('secure')}>
                <option value="ssl">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
              </select>
            </Field>
          </div>
          <Field label="Tài khoản SMTP">
            <input className={inputCls} value={form.user} onChange={set('user')} autoComplete="off" required />
          </Field>
          <Field label="Mật khẩu">
            <input
              className={inputCls}
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder={view?.hasPassword ? 'Đã lưu — để trống nếu không đổi' : ''}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Tên người gửi">
            <input className={inputCls} value={form.fromName} onChange={set('fromName')} />
          </Field>
          <Field label="Email người gửi">
            <input className={inputCls} type="email" value={form.fromEmail} onChange={set('fromEmail')} required />
          </Field>
          <Field label="Địa chỉ web" hint="Dùng trong link đặt lại mật khẩu, ví dụ https://petrolimex.hgcvn.cloud">
            <input className={inputCls} value={form.appUrl} onChange={set('appUrl')} required />
          </Field>
          <Field label="Hạn mức thư mỗi ngày">
            <input className={inputCls} type="number" value={form.dailyLimit} onChange={set('dailyLimit')} required />
          </Field>
        </div>
        <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>
          Lưu cấu hình thư
        </button>
      </form>
      <div className="flex gap-2">
        <input className={inputCls} type="email" placeholder="Email nhận thư thử" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <button type="button" onClick={sendTest} disabled={busy || !testTo} className={`${secondaryBtn} shrink-0`}>
          <Send className="w-3.5 h-3.5" /> Gửi thư thử
        </button>
      </div>
      {result && <p className={`rounded-xl p-2 ${result.ok ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>{result.message}</p>}
    </div>
  );
};
