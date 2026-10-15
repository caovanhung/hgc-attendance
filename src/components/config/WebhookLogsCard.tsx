import React, { useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import type { WebhookLog, WebhookLogStatus } from '../../types';
import { api, errorMessage } from '../../api';
import { fmtDateTime } from '../../format';
import { Modal } from '../ui';

const STATUS_STYLE: Record<WebhookLogStatus, string> = {
  success: 'text-emerald-600',
  duplicate: 'text-slate-500',
  ignored: 'text-amber-600',
  rejected: 'text-rose-600',
  error: 'text-rose-600',
};

export const WebhookLogsCard: React.FC = () => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [selected, setSelected] = useState<WebhookLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<{ logs: WebhookLog[] }>('/api/hanet/webhook-logs')
      .then((d) => setLogs(d.logs))
      .catch((err) => setError(errorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-5 text-sm flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-purple-600" /> Nhật ký webhook
        </h3>
        <button onClick={load} className="text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer">
          <RefreshCw className="w-3 h-3" /> Làm mới
        </button>
      </div>
      {error && <p className="text-rose-600 mt-2">{error}</p>}
      <div className="mt-2 max-h-96 overflow-y-auto divide-y divide-slate-100">
        {logs.length === 0 ? (
          <p className="py-12 text-center text-slate-500">Chưa nhận được webhook nào</p>
        ) : (
          logs.map((log) => (
            <button key={log.id} onClick={() => setSelected(log)} className="w-full text-left py-2 px-1 hover:bg-slate-50 rounded-lg cursor-pointer">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-900">{log.personName ?? '—'}</span>
                <span className="text-[11px] font-mono text-slate-500">{fmtDateTime(log.receivedAt)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span className="truncate">{log.message ?? log.deviceName ?? ''}</span>
                <span className={`font-mono font-bold ${STATUS_STYLE[log.status]}`}>{log.status}</span>
              </div>
            </button>
          ))
        )}
      </div>
      {selected && (
        <Modal title="Dữ liệu webhook nhận được" onClose={() => setSelected(null)} wide>
          <pre className="bg-slate-950 text-emerald-400 font-mono text-[11px] p-3 rounded-xl overflow-auto max-h-96">
            {JSON.stringify(selected.rawPayload, null, 2) ?? '(không lưu dữ liệu)'}
          </pre>
        </Modal>
      )}
    </div>
  );
};
