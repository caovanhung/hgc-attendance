import React, { useState } from 'react';
import { Check, Copy, RefreshCw, Terminal } from 'lucide-react';
import type { HanetConfigView } from '../../types';
import { api, errorMessage } from '../../api';

export const WebhookCard: React.FC<{ config: HanetConfigView; onChange: (c: HanetConfigView) => void }> = ({ config, onChange }) => {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${config.webhookPath}`;

  const rotate = async () => {
    if (!window.confirm('Tạo token mới? URL cũ sẽ ngừng hoạt động ngay; bạn phải cập nhật URL mới trên Camera AI.')) return;
    try {
      onChange((await api<{ config: HanetConfigView }>('/api/hanet/webhook-token/rotate', { method: 'POST' })).config);
      setCopied(false);
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-xl">
      <h2 className="text-base font-bold">URL webhook cho Camera AI</h2>
      <p className="text-xs text-slate-300 mt-1 max-w-2xl">
        Dán URL này vào cấu hình webhook trên Camera AI. URL chứa token bí mật: không chia sẻ công khai. Nếu nghi bị lộ, hãy tạo token mới.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 bg-slate-950/80 border border-slate-700 rounded-2xl p-2.5">
        <Terminal className="w-4 h-4 text-brand-400 shrink-0 ml-1.5" />
        <code className="text-xs font-mono text-emerald-400 flex-1 break-all">{url}</code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
          className="px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Đã sao chép' : 'Sao chép'}
        </button>
        <button onClick={rotate} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Tạo token mới
        </button>
      </div>
    </div>
  );
};
