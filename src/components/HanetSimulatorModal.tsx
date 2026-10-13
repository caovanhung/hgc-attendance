import React, { useState } from 'react';
import { Video, Sparkles, Check, Clock, Thermometer, User as UserIcon, X } from 'lucide-react';
import { Camera, User } from '../types';

interface HanetSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: Camera[];
  users: User[];
  onSimulateSuccess: () => void;
}

export const HanetSimulatorModal: React.FC<HanetSimulatorModalProps> = ({
  isOpen,
  onClose,
  cameras,
  users,
  onSimulateSuccess,
}) => {
  const [selectedCameraId, setSelectedCameraId] = useState<string>(cameras[0]?.id || '');
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [customTime, setCustomTime] = useState<string>('');
  const [temperature, setTemperature] = useState<string>('36.5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetUser = users.find((u) => u.id === selectedUserId);
  const targetCamera = cameras.find((c) => c.id === selectedCameraId) || cameras[0];

  const handleSimulate = async () => {
    if (!selectedUserId || !selectedCameraId) return;
    setIsSubmitting(true);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/hanet/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedUserId,
          cameraId: selectedCameraId,
          customTime: customTime || undefined,
          temperature: Number(temperature) || 36.5,
          detectedImageUrl: targetUser?.avatarUrl,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`Đã ghi nhận điểm danh thành công cho ${targetUser?.name}!`);
        onSimulateSuccess();
        setTimeout(() => {
          setSuccessMessage(null);
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-orange-600 to-amber-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">Mô phỏng Camera Hanet Quét Mặt</h3>
              <p className="text-[11px] text-orange-100">Gửi Webhook sự kiện FaceID chuẩn Hanet AI Cloud</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Camera Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              1. Chọn Camera Hanet phát hiện khuôn mặt:
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-hidden focus:border-orange-500 font-medium"
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.location})
                </option>
              ))}
            </select>
          </div>

          {/* User Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              2. Chọn nhân viên quét mặt:
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-100 rounded-xl bg-slate-50/50">
              {users.map((u) => {
                const isSelected = u.id === selectedUserId;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`flex items-center gap-2.5 p-2 rounded-xl text-left border transition cursor-pointer ${
                      isSelected
                        ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <img
                      src={u.avatarUrl}
                      alt={u.name}
                      className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/20"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold truncate">{u.name}</div>
                      <div className={`text-[10px] truncate ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                        {u.code} • {u.departmentName.replace('Phòng ', '')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional: Time adjustment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giờ quét (Để trống = hiện tại):
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-orange-500"
                  placeholder="08:05"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Mẹo: Nhập &gt; 08:15 để test "Đi muộn"
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Thân nhiệt (°C):
              </label>
              <div className="relative">
                <Thermometer className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <img
                src={targetUser?.avatarUrl}
                alt={targetUser?.name}
                className="w-10 h-10 rounded-xl object-cover border border-slate-200"
              />
              <div>
                <span className="font-bold text-slate-900 block">{targetUser?.name}</span>
                <span className="text-[11px] text-slate-500">
                  {targetUser?.code} • {targetCamera.name}
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              FaceID Valid
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSimulate}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang gửi...' : 'Kích hoạt Quét Mặt'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
