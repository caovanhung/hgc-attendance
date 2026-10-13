import React, { useState } from 'react';
import { Video, Plus, CheckCircle, Wifi, MapPin, Server, Activity, ShieldCheck } from 'lucide-react';
import { Camera, User } from '../types';

interface CamerasTabProps {
  cameras: Camera[];
  currentUser: User | null;
  onRefresh: () => void;
  onOpenSimulatorForCamera: (cameraId: string) => void;
}

export const CamerasTab: React.FC<CamerasTabProps> = ({
  cameras,
  currentUser,
  onRefresh,
  onOpenSimulatorForCamera,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [deviceKey, setDeviceKey] = useState('');
  const [location, setLocation] = useState('');
  const [placeId, setPlaceId] = useState('1042');
  const [ipAddress, setIpAddress] = useState('192.168.1.');

  const isHR = currentUser?.role === 'hr';

  const handleAddCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !deviceKey) return;

    try {
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          deviceKey,
          location,
          placeId: Number(placeId),
          placeName: placeId === '1042' ? 'Trụ sở Văn phòng Hà Nội' : 'Tổng kho Đức Giang Petrolimex',
          ipAddress,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setName('');
        setDeviceKey('');
        setLocation('');
        onRefresh();
      }
    } catch (err) {
      console.error('Error adding camera:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Quản lý Camera AI Hanet tập trung</h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              1 Master Account
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Toàn bộ camera được gắn vào 1 tài khoản Hanet chính chủ doanh nghiệp. Hệ thống tự động phân loại sự kiện điểm danh theo vị trí cổng và phòng ban tương ứng.
          </p>
        </div>

        {isHR && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Camera Hanet mới</span>
          </button>
        )}
      </div>

      {/* Camera Grid */}
      {cameras.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-3">
            <Video className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Chưa có Camera Hanet nào</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            Thêm thiết bị camera Hanet đầu tiên của công ty bạn bằng nút bên dưới hoặc quét mã thiết bị để bắt đầu nhận diện.
          </p>
          {isHR && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Camera Hanet mới</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
          {cameras.map((cam) => {
            const isOnline = cam.status === 'online';
          return (
            <div
              key={cam.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col hover:border-slate-300 transition"
            >
              {/* Snapshot / Preview banner */}
              <div className="relative aspect-16/9 bg-slate-950 overflow-hidden">
                <img
                  src={cam.snapshotUrl}
                  alt={cam.name}
                  className="w-full h-full object-cover opacity-85 hover:scale-105 transition duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30"></div>

                {/* Status chip */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md ${
                    isOnline
                      ? 'bg-emerald-500/90 text-white'
                      : 'bg-rose-500/90 text-white'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                    {isOnline ? 'Online (Đang nhận diện)' : 'Mất kết nối'}
                  </span>
                </div>

                <div className="absolute top-3 right-3">
                  <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white text-[10px] font-mono">
                    ID: {cam.deviceKey}
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <h3 className="font-bold text-sm drop-shadow-xs">{cam.name}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-0.5">
                    <MapPin className="w-3 h-3 text-orange-400" />
                    <span>{cam.location}</span>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Địa điểm Hanet:</span>
                    <strong className="text-slate-800">{cam.placeName}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Place ID:</span>
                    <strong className="text-slate-800 font-mono">#{cam.placeId}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Địa chỉ IP LAN:</span>
                    <strong className="text-slate-800 font-mono">{cam.ipAddress}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Giao thức:</span>
                    <strong className="text-emerald-700">Cloud Webhook + RTSP</strong>
                  </div>
                </div>

                {/* Card Action */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onOpenSimulatorForCamera(cam.id)}
                    className="flex-1 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-800 font-semibold text-xs border border-orange-200 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Test Quét Mặt tại Camera này</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Add Camera Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-orange-400" />
                <span className="font-bold text-sm">Thêm Camera Hanet vào Hệ thống</span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCamera} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên Camera:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Camera Cửa Căng-tin Tầng 2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mã thiết bị Hanet (Device Key / Serial):</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: HN_CANTIN_T2_005"
                  value={deviceKey}
                  onChange={(e) => setDeviceKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Vị trí lắp đặt:</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Cửa ra vào khu ăn trưa Tầng 2"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Place ID Hanet:</label>
                  <select
                    value={placeId}
                    onChange={(e) => setPlaceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 bg-white"
                  >
                    <option value="1042">Trụ sở Hà Nội (1042)</option>
                    <option value="1088">Tổng kho Đức Giang (1088)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Địa chỉ IP:</label>
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-hidden focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  Lưu Camera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
