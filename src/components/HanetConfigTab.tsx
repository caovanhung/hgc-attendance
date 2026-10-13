import React, { useEffect, useState } from 'react';
import type { HanetConfigView } from '../types';
import { api, errorMessage } from '../api';
import { WebhookCard } from './config/WebhookCard';
import { WorkSettingsCard } from './config/WorkSettingsCard';
import { SyncStatusCard } from './config/SyncStatusCard';
import { HanetCredentialsCard } from './config/HanetCredentialsCard';
import { BackupsCard } from './config/BackupsCard';
import { WebhookLogsCard } from './config/WebhookLogsCard';
import { DangerZoneCard } from './config/DangerZoneCard';

interface HanetConfigTabProps {
  onRefresh: () => void;
}

export const HanetConfigTab: React.FC<HanetConfigTabProps> = ({ onRefresh }) => {
  const [config, setConfig] = useState<HanetConfigView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ config: HanetConfigView }>('/api/hanet/config')
      .then((d) => setConfig(d.config))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <p className="text-xs text-rose-600">{error}</p>;
  if (!config) return <p className="text-xs text-slate-500">Đang tải cấu hình...</p>;

  return (
    <div className="space-y-6">
      <WebhookCard config={config} onChange={setConfig} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HanetCredentialsCard config={config} onChange={setConfig} onReconciled={onRefresh} />
        <SyncStatusCard />
        <WorkSettingsCard onRecomputed={onRefresh} />
        <BackupsCard />
        <WebhookLogsCard />
      </div>
      <DangerZoneCard />
    </div>
  );
};
