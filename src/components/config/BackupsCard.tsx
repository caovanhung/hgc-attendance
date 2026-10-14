import React, { useEffect, useState } from 'react';
import { Database, Download } from 'lucide-react';
import type { BackupInfo } from '../../types';
import { api, errorMessage } from '../../api';
import { fmtDateTime } from '../../format';
import { secondaryBtn } from '../ui';

export const BackupsCard: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ backups: BackupInfo[] }>('/api/admin/backups')
      .then((d) => setBackups(d.backups))
      .catch((err) => setMessage(errorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  const backupNow = async () => {
    setBusy(true);
    try {
      const r = await api<{ backup: string }>('/api/admin/backups', { method: 'POST' });
      setMessage(`Đã tạo ${r.backup}`);
      await load();
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Database className="w-4 h-4 text-orange-500" /> Sao lưu
        </h3>
        <div className="flex gap-2">
          {canWrite && (
            <button onClick={backupNow} disabled={busy} className={`${secondaryBtn} py-1.5`}>
              Sao lưu ngay
            </button>
          )}
          {canWrite && backups.length > 0 && (
            <a href="/api/admin/backups/latest" className={`${secondaryBtn} py-1.5`}>
              <Download className="w-3.5 h-3.5" /> Tải bản mới nhất
            </a>
          )}
        </div>
      </div>
      <p className="text-slate-500">Tự động sao lưu lúc 02:00 mỗi ngày, giữ 30 bản. Nên chép định kỳ thư mục data/backups ra ngoài máy chủ.</p>
      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
        {backups.length === 0 ? (
          <p className="py-4 text-center text-slate-400">Chưa có bản sao lưu</p>
        ) : (
          backups.map((b) => (
            <div key={b.name} className="py-1.5 flex justify-between gap-2">
              <span className="font-mono truncate">{b.name}</span>
              <span className="text-slate-400 shrink-0">
                {(b.size / 1024 / 1024).toFixed(1)} MB · {fmtDateTime(b.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>
      {message && <p className="text-slate-700 bg-slate-50 rounded-xl p-2">{message}</p>}
    </div>
  );
};
