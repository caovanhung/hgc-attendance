import React, { useEffect, useState } from 'react';
import type { HanetConfigView } from '../types';
import { api, errorMessage } from '../api';
import { WebhookCard } from './config/WebhookCard';
import { WorkSettingsCard } from './config/WorkSettingsCard';
import { SyncStatusCard } from './config/SyncStatusCard';
import { HanetCredentialsCard } from './config/HanetCredentialsCard';
import { HanetConnectCard } from './config/HanetConnectCard';
import { BackupsCard } from './config/BackupsCard';
import { WebhookLogsCard } from './config/WebhookLogsCard';
import { DangerZoneCard } from './config/DangerZoneCard';

interface HanetConfigTabProps {
  isSystemAdmin: boolean;
  onRefresh: () => void;
}

export const HanetConfigTab: React.FC<HanetConfigTabProps> = ({ isSystemAdmin, onRefresh }) => {
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
      {!isSystemAdmin && (
        <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3">
          Chỉ tài khoản ADMIN được thay đổi cấu hình kỹ thuật (kết nối Camera AI, webhook, đồng bộ, sao lưu). Bạn đang xem ở chế độ chỉ đọc; riêng giờ làm việc bạn vẫn sửa được.
        </p>
      )}
      <fieldset disabled={!isSystemAdmin} className="contents">
        <WebhookCard config={config} onChange={setConfig} />
      </fieldset>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <fieldset disabled={!isSystemAdmin} className="contents">
          <HanetCredentialsCard config={config} onChange={setConfig} onReconciled={onRefresh} />
          <HanetConnectCard />
          <SyncStatusCard />
        </fieldset>
        <WorkSettingsCard onRecomputed={onRefresh} />
        <BackupsCard canWrite={isSystemAdmin} />
        <WebhookLogsCard />
      </div>
      {isSystemAdmin && <DangerZoneCard />}
    </div>
  );
};
