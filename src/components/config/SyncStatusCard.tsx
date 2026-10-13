import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { SyncSummary } from '../../types';
import { api, errorMessage } from '../../api';
import { SYNC_OP_LABEL, fmtDateTime } from '../../format';
import { secondaryBtn } from '../ui';

export const SyncStatusCard: React.FC = () => {
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<SyncSummary>('/api/hanet/sync')
      .then(setSummary)
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    void load();
  }, []);

  const retry = async (jobId?: number) => {
    setBusy(true);
    setError(null);
    try {
      setSummary(await api<SyncSummary>('/api/hanet/sync/retry', { method: 'POST', body: jobId === undefined ? {} : { jobId } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-900">Đồng bộ Hanet</h3>
        <button onClick={() => void load()} className="text-slate-500 hover:text-slate-900 cursor-pointer" aria-label="Làm mới">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      {summary && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">
              Đang chờ: <strong>{summary.pending}</strong> · Lỗi: <strong className={summary.error ? 'text-rose-600' : ''}>{summary.error}</strong>
            </span>
            <button onClick={() => void retry()} disabled={busy || summary.error === 0} className={`${secondaryBtn} py-1.5`}>
              Đồng bộ lại tất cả việc lỗi
            </button>
          </div>
          {summary.errors.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {summary.errors.map((j) => (
                <div key={j.id} className="p-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {j.label} · {SYNC_OP_LABEL[j.op]}
                    </div>
                    <div className="text-rose-600">{j.lastError}</div>
                    <div className="text-[10px] text-slate-400">
                      {j.attempts} lần thử · {fmtDateTime(j.updatedAt)}
                    </div>
                  </div>
                  <button onClick={() => void retry(j.id)} disabled={busy} className={`${secondaryBtn} py-1 px-2 shrink-0`}>
                    Thử lại
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
