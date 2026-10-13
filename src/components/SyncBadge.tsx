import React, { useState } from 'react';
import type { SyncEntity, SyncStatus } from '../types';
import { api, errorMessage } from '../api';
import { SYNC_STATUS_LABEL } from '../format';

const TONE: Record<SyncStatus, string> = {
  synced: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const SyncBadge: React.FC<{ status: SyncStatus; error: string | null }> = ({ status, error }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${TONE[status]}`} title={error ?? undefined}>
    {SYNC_STATUS_LABEL[status]}
  </span>
);

export const SyncRetryButton: React.FC<{ entityType: SyncEntity; entityId: string; onDone: () => void }> = ({ entityType, entityId, onDone }) => {
  const [busy, setBusy] = useState(false);
  const retry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await api('/api/hanet/sync/retry', { method: 'POST', body: { entityType, entityId } });
      onDone();
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={retry} disabled={busy} className="text-[10px] font-semibold text-rose-700 hover:underline cursor-pointer disabled:opacity-50">
      Đồng bộ lại
    </button>
  );
};
