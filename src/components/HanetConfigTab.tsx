import React, { useState, useEffect } from 'react';
import { ShieldCheck, Copy, Check, ExternalLink, RefreshCw, Terminal, Cpu } from 'lucide-react';
import { HanetConfig, WebhookLog } from '../types';

interface HanetConfigTabProps {
  onRefresh: () => void;
}

export const HanetConfigTab: React.FC<HanetConfigTabProps> = ({ onRefresh }) => {
  const [config, setConfig] = useState<HanetConfig | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);

  const webhookUrl = `${window.location.origin}/api/hanet/webhook`;

  const fetchConfigAndLogs = async () => {
    try {
      const [cfgRes, logRes] = await Promise.all([
        fetch('/api/hanet/config'),
        fetch('/api/hanet/webhook-logs'),
      ]);
      const cfgData = await cfgRes.json();
      const logData = await logRes.json();
      setConfig(cfgData.config);
      setLogs(logData.logs || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchConfigAndLogs();
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setLoading(true);
    try {
      const res = await fetch('/api/hanet/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        alert('Lưu cấu hình Hanet thành công!');
        fetchConfigAndLogs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Card: Webhook URL for Hanet Partner Portal */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 shadow-xl border border-slate-700/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h2 className="text-base font-bold tracking-tight">Hanet Cloud Webhook Ingestion URL</h2>
              <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[11px] font-mono border border-orange-400/30">
                Live Receiver Active
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Cung cấp URL này trên cổng đối tác <strong>Hanet Developer</strong> hoặc cài đặt Webhook trong ứng dụng Hanet Connect. Khi camera nhận diện khuôn mặt, Hanet sẽ lập tức gửi POST request về hệ thống này.
            </p>
          </div>

          <a
            href="https://developers.hanet.ai/document"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md transition cursor-pointer shrink-0"
          >
            <span>Tài liệu Hanet API</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Copy Box */}
        <div className="mt-4 flex items-center gap-2 bg-slate-950/80 border border-slate-700 rounded-2xl p-2.5">
          <Terminal className="w-4 h-4 text-orange-400 shrink-0 ml-1.5" />
          <code className="text-xs font-mono text-emerald-400 flex-1 truncate">
            {webhookUrl}
          </code>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Đã sao chép' : 'Sao chép Webhook'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hanet Credentials Form */}
        {config && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-orange-500" />
                <h3 className="font-bold text-sm text-slate-900">Thông tin Xác thực Master Account Hanet</h3>
              </div>
              <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">
                Đã kết nối
              </span>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hanet Client ID:</label>
                <input
                  type="text"
                  value={config.clientId}
                  onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hanet Client Secret:</label>
                <input
                  type="password"
                  value={config.clientSecret}
                  onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Access Token (Bearer):</label>
                <input
                  type="text"
                  value={config.accessToken}
                  onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-slate-600 focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Master Place ID:</label>
                  <input
                    type="number"
                    value={config.masterPlaceId}
                    onChange={(e) => setConfig({ ...config, masterPlaceId: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-hidden focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tên địa điểm chính:</label>
                  <input
                    type="text"
                    value={config.masterPlaceName}
                    onChange={(e) => setConfig({ ...config, masterPlaceName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Đang cập nhật...' : 'Lưu Cấu Hình Hanet'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Live Webhook Event Logs Inspector */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-600" />
              <h3 className="font-bold text-sm text-slate-900">Nhật ký Webhook Sự kiện nhận được</h3>
            </div>
            <button
              onClick={fetchConfigAndLogs}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Làm mới</span>
            </button>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto max-h-96 divide-y divide-slate-100">
            {logs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Chưa có sự kiện Webhook nào. Nhấn "Mô phỏng Quét Mặt" để kích hoạt sự kiện đầu tiên!
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="py-2.5 px-2 hover:bg-slate-50 rounded-xl transition cursor-pointer text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {log.personName}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {new Date(log.receivedAt).toLocaleTimeString('vi-VN')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                    <span>{log.deviceName}</span>
                    <span className="text-[10px] font-mono font-bold text-emerald-600">
                      200 OK
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Modal / Preview of raw JSON */}
          {selectedLog && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-slate-950 text-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-800 text-xs">
                <div className="p-4 bg-slate-900 flex items-center justify-between border-b border-slate-800">
                  <span className="font-mono font-bold text-orange-400">
                    Chi tiết Webhook Payload (Hanet Camera)
                  </span>
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-4 max-h-80 overflow-y-auto font-mono text-[11px] text-emerald-400 bg-slate-950">
                  <pre>{JSON.stringify(selectedLog.rawPayload, null, 2)}</pre>
                </div>
                <div className="p-3 bg-slate-900 text-right">
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
