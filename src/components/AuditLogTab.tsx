import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { AuditLogEntry, DayOverride, DayStatus, UserRole } from '../types';
import { api, errorMessage } from '../api';
import { AUDIT_ACTION_LABEL, DAY_STATUS_LABEL, OVERRIDE_KIND_LABEL, ROLE_LABEL, fmtDate, fmtDateTime, fmtTime, vnToday } from '../format';
import { Field, Modal, inputCls, secondaryBtn } from './ui';

interface AuditPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const FIELD_LABEL: Record<string, string> = {
  firstIn: 'Vào',
  lastOut: 'Ra',
  status: 'Trạng thái',
  kind: 'Kiểu',
  role: 'Vai trò',
  areaIds: 'Khu',
  shiftId: 'Ca',
  comment: 'Ghi chú',
  personId: 'Person ID',
  aliasId: 'Mã trên Camera AI',
  name: 'Tên',
};

/** Giá trị trước/sau dạng dễ đọc: giờ HH:MM, nhãn trạng thái/vai trò thay cho mã. */
function describe(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v);
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => {
      let val: string;
      if ((k === 'firstIn' || k === 'lastOut') && (typeof x === 'number' || x === null)) val = fmtTime(x as number | null);
      else if (k === 'status' && typeof x === 'string') val = DAY_STATUS_LABEL[x as DayStatus] ?? x;
      else if (k === 'kind' && typeof x === 'string') val = OVERRIDE_KIND_LABEL[x as DayOverride['kind']] ?? x;
      else if (k === 'role' && typeof x === 'string') val = ROLE_LABEL[x as UserRole] ?? x;
      else val = typeof x === 'string' ? x : JSON.stringify(x);
      return `${FIELD_LABEL[k] ?? k}: ${val}`;
    })
    .join(', ');
}

const short = (v: unknown): string => {
  const s = describe(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
};

const daysAgo = (n: number): string => new Date(Date.parse(vnToday()) - n * 86_400_000).toISOString().slice(0, 10);

/** Tab "Nhật ký": thao tác nhạy cảm (điều chỉnh, duyệt đơn, quyền, ca, khóa sổ, đăng nhập quản trị). */
export const AuditLogTab: React.FC = () => {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(vnToday());
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AuditLogEntry | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ from, to, page: String(page) });
    if (action) p.set('action', action);
    if (q.trim()) p.set('q', q.trim());
    try {
      setData(await api<AuditPage>(`/api/audit?${p}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [from, to, action, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-border border-l-4 border-l-brand-500 shadow-card space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-brand-navy">Nhật ký</h2>
          <p className="text-xs text-slate-500 mt-0.5">Các thao tác ảnh hưởng tới ngày công và quyền truy cập. Nhật ký không sửa, không xóa được.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Từ ngày">
            <input type="date" className={inputCls} value={from} onChange={(e) => e.target.value && filter(setFrom)(e.target.value)} />
          </Field>
          <Field label="Đến ngày">
            <input type="date" className={inputCls} value={to} onChange={(e) => e.target.value && filter(setTo)(e.target.value)} />
          </Field>
          <Field label="Loại thao tác">
            <select className={inputCls} value={action} onChange={(e) => filter(setAction)(e.target.value)}>
              <option value="">Tất cả</option>
              {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tìm theo tên hoặc mã">
            <input className={inputCls} value={q} onChange={(e) => filter(setQ)(e.target.value)} placeholder="Người làm hoặc đối tượng" />
          </Field>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {data && (
        <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
          {data.entries.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">Không có thao tác nào trong khoảng này.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-muted border-b border-border text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  <tr>
                    <th className="py-3 px-4">Thời gian</th>
                    <th className="py-3 px-4">Người làm</th>
                    <th className="py-3 px-4">Hành động</th>
                    <th className="py-3 px-4">Đối tượng</th>
                    <th className="py-3 px-4">Thay đổi</th>
                    <th className="py-3 px-4">Lý do</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {data.entries.map((e) => (
                    <tr key={e.id} className={e.action === 'auth.login_failed' ? 'text-rose-700' : ''}>
                      <td className="py-2.5 px-4 whitespace-nowrap text-xs">{fmtDateTime(e.at)}</td>
                      <td className="py-2.5 px-4 min-w-40">
                        <div className="font-semibold">{e.actorLabel}</div>
                        {e.ip && <div className="text-[11px] text-slate-500 font-mono">{e.ip}</div>}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">{AUDIT_ACTION_LABEL[e.action] ?? e.action}</td>
                      <td className="py-2.5 px-4 min-w-36">
                        {e.targetLabel ?? '—'}
                        {e.workDate && <div className="text-[11px] text-slate-500">ngày {fmtDate(e.workDate)}</div>}
                      </td>
                      <td className="py-2.5 px-4 text-xs">
                        {e.before === null && e.after === null ? (
                          '—'
                        ) : (
                          <button type="button" className="text-left hover:text-brand-700 cursor-pointer" onClick={() => setViewing(e)}>
                            {short(e.before)} → {short(e.after)}
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs min-w-40 max-w-64">{e.reason ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              {data.total} dòng · Trang {data.page} / {pages}
            </span>
            <div className="flex gap-2">
              <button type="button" className={`${secondaryBtn} py-1.5`} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Trước
              </button>
              <button type="button" className={`${secondaryBtn} py-1.5`} disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Sau
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <Modal title={AUDIT_ACTION_LABEL[viewing.action] ?? viewing.action} onClose={() => setViewing(null)} wide>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['before', 'after'] as const).map((k) => (
              <div key={k}>
                <div className="text-xs font-semibold text-slate-600 mb-1">{k === 'before' ? 'Trước' : 'Sau'}</div>
                <p className="text-sm text-slate-800 mb-2">{describe(viewing[k])}</p>
                <pre className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-80">{JSON.stringify(viewing[k], null, 2) ?? '—'}</pre>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};
