import React from 'react';
import { errorMessage } from '../api';

export const inputCls =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-hidden focus:border-orange-500 disabled:bg-slate-50';
export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50';
export const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50';
export const dangerBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50';

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({
  title,
  onClose,
  children,
  wide,
}) => (
  <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
    <div className={`bg-white rounded-3xl ${wide ? 'max-w-2xl' : 'max-w-md'} w-full overflow-hidden shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col`}>
      <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
        <span className="font-bold text-sm">{title}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 cursor-pointer" aria-label="Đóng">
          ✕
        </button>
      </div>
      <div className="p-5 overflow-y-auto text-xs">{children}</div>
    </div>
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="block">
    <span className="block font-semibold text-slate-700 mb-1 text-xs">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
  </label>
);

/** Hộp xác nhận cho thao tác xóa: hiện lỗi từ server ngay trong hộp, khóa nút khi đang gửi. */
export const ConfirmDeleteDialog: React.FC<{
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}> = ({ title, children, confirmLabel, onConfirm, onClose }) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3.5">
        {children}
        {error && <p className="text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${secondaryBtn} flex-1`}>
            Hủy
          </button>
          <button type="button" onClick={run} disabled={busy} className={`${dangerBtn} flex-1`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export const WeekdayPicker: React.FC<{ value: number[]; onChange: (v: number[]) => void }> = ({ value, onChange }) => {
  const WEEKDAY_LABEL: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };
  return (
    <div className="flex flex-wrap gap-1.5">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}
            className={`w-9 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
            aria-pressed={on}
          >
            {WEEKDAY_LABEL[d]}
          </button>
        );
      })}
    </div>
  );
};
