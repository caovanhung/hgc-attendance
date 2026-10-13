import React from 'react';

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
