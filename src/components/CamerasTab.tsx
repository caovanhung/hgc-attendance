import React, { useState } from "react";
import {
  CloudDownload,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import type { Area, Camera, User } from "../types";
import { api, errorMessage } from "../api";
import { fmtDateTime } from "../format";
import {
  Field,
  Modal,
  dangerBtn,
  inputCls,
  primaryBtn,
  secondaryBtn,
} from "./ui";

interface CamerasTabProps {
  cameras: Camera[];
  currentUser: User;
  areas: Area[];
  onRefresh: () => void;
}

const EMPTY = {
  name: "",
  deviceKey: "",
  placeId: "",
  placeName: "",
  location: "",
  ipAddress: "",
  areaId: "",
};
type Form = typeof EMPTY & { id?: string };

const StatusDot: React.FC<{ camera: Camera }> = ({ camera }) => {
  const tone =
    camera.online === null
      ? "bg-slate-300"
      : camera.online
        ? "bg-emerald-500"
        : "bg-rose-500";
  const label =
    camera.online === null
      ? "Chưa kiểm tra"
      : camera.online
        ? "Online"
        : "Offline";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-slate-600"
      title={
        camera.statusCheckedAt
          ? `Kiểm tra lúc ${fmtDateTime(camera.statusCheckedAt)}`
          : undefined
      }
    >
      <span className={`w-2 h-2 rounded-full ${tone}`} /> {label}
    </span>
  );
};

export const CamerasTab: React.FC<CamerasTabProps> = ({
  cameras,
  currentUser,
  areas,
  onRefresh,
}) => {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Camera | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isGlobalHr = currentUser.role === "hr";
  const canManage = isGlobalHr || currentUser.role === "area_admin";

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await api(`/api/cameras/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      onRefresh();
    } catch (err) {
      setDeleteError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    try {
      if (form.id) {
        await api(`/api/cameras/${form.id}`, {
          method: "PUT",
          body: {
            name: form.name,
            location: form.location,
            ipAddress: form.ipAddress,
            areaId: form.areaId || null,
          },
        });
      } else {
        await api("/api/cameras", {
          method: "POST",
          body: { ...form, areaId: form.areaId || null },
        });
      }
      setForm(null);
      onRefresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const hanetAction = async (
    path: string,
    done: (body: { added?: number }) => string,
  ) => {
    setBusy(true);
    setNotice(null);
    try {
      const body = await api<{ added?: number }>(path, {
        method: "POST",
        body: {},
      });
      setNotice(done(body));
      onRefresh();
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const set =
    (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
      form && setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-border border-l-4 border-l-brand-500 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-brand-navy">Camera AI</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Trạng thái online/offline tự cập nhật mỗi 5 phút. Đổi tên ở đây thì
            đổi luôn trên Camera AI.
          </p>
        </div>
        {isGlobalHr && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                hanetAction(
                  "/api/cameras/refresh-status",
                  () => "Đã cập nhật trạng thái camera.",
                )
              }
              disabled={busy}
              className={secondaryBtn}
            >
              <RefreshCw className="w-4 h-4" /> Làm mới trạng thái
            </button>
            <button
              onClick={() =>
                hanetAction(
                  "/api/cameras/import",
                  (b) => `Đã thêm ${b.added ?? 0} camera từ Camera AI.`,
                )
              }
              disabled={busy}
              className={secondaryBtn}
            >
              <CloudDownload className="w-4 h-4" /> Nhập camera từ Camera AI
            </button>
            <button
              onClick={() => setForm({ ...EMPTY })}
              className={primaryBtn}
            >
              <Plus className="w-4 h-4" /> Thêm camera
            </button>
          </div>
        )}
      </div>
      {notice && (
        <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2">
          {notice}
        </p>
      )}

      {cameras.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-sm text-slate-500">
          <Video className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa có camera nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-border shadow-card p-4 text-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-brand-navy truncate">
                  {c.name}
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] px-1.5 rounded bg-slate-100 text-slate-600">
                    {c.deviceKey}
                  </span>
                  {canManage && (
                    <button
                      onClick={() =>
                        setForm({
                          id: c.id,
                          name: c.name,
                          deviceKey: c.deviceKey,
                          placeId: c.placeId ? String(c.placeId) : "",
                          placeName: c.placeName,
                          location: c.location,
                          ipAddress: c.ipAddress,
                          areaId: c.areaId ?? "",
                        })
                      }
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                      title="Sửa camera"
                      aria-label={`Sửa camera ${c.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(c);
                      }}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="Xóa camera"
                      aria-label={`Xóa camera ${c.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <StatusDot camera={c} />
              {c.location && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <MapPin className="w-3 h-3 text-brand-500" /> {c.location}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl">
                <div className="col-span-2">
                  <span className="block text-[11px] text-slate-500">
                    Khu vực
                  </span>
                  {c.areaName ?? "Chưa gán khu"}
                </div>
                <div>
                  <span className="block text-[11px] text-slate-500">
                    Địa điểm
                  </span>
                  {c.placeName || "—"}
                </div>
                <div>
                  <span className="block text-[11px] text-slate-500">
                    Place ID
                  </span>
                  <span className="font-mono">{c.placeId ?? "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] text-slate-500">
                    IP nội bộ
                  </span>
                  <span className="font-mono">{c.ipAddress || "—"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleting && (
        <Modal title="Xóa camera" onClose={() => setDeleting(null)}>
          <div className="space-y-3.5">
            <p>
              Xóa camera <strong>{deleting.name}</strong> (
              <span className="font-mono">{deleting.deviceKey}</span>) khỏi danh
              sách?
            </p>
            <p className="text-slate-500">
              Lịch sử điểm danh không bị ảnh hưởng, và lượt nhận diện từ camera
              này vẫn tiếp tục được ghi nhận.
            </p>
            {deleteError && <p className="text-rose-600">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className={`${secondaryBtn} flex-1`}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className={`${dangerBtn} flex-1`}
              >
                Xóa camera
              </button>
            </div>
          </div>
        </Modal>
      )}

      {form && (
        <Modal
          title={form.id ? "Sửa camera" : "Thêm Camera AI"}
          onClose={() => setForm(null)}
        >
          <form onSubmit={save} className="space-y-3.5">
            <Field
              label="Tên camera"
              hint={
                form.id
                  ? "Đổi tên ở đây thì tên trên Camera AI cũng đổi theo"
                  : undefined
              }
            >
              <input
                className={inputCls}
                value={form.name}
                onChange={set("name")}
                required
              />
            </Field>
            <Field label="Mã thiết bị (deviceID trên Camera AI)">
              <input
                className={`${inputCls} font-mono`}
                value={form.deviceKey}
                onChange={set("deviceKey")}
                required
                disabled={Boolean(form.id)}
              />
            </Field>
            {!form.id && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Place ID">
                  <input
                    className={`${inputCls} font-mono`}
                    inputMode="numeric"
                    value={form.placeId}
                    onChange={set("placeId")}
                  />
                </Field>
                <Field label="Tên địa điểm">
                  <input
                    className={inputCls}
                    value={form.placeName}
                    onChange={set("placeName")}
                  />
                </Field>
              </div>
            )}
            <Field label="Vị trí lắp đặt">
              <input
                className={inputCls}
                value={form.location}
                onChange={set("location")}
              />
            </Field>
            <Field label="Khu vực">
              <select
                className={inputCls}
                value={form.areaId}
                onChange={(e) => setForm({ ...form, areaId: e.target.value })}
                required={!isGlobalHr}
              >
                {isGlobalHr && <option value="">— Chưa gán khu —</option>}
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Địa chỉ IP nội bộ">
              <input
                className={`${inputCls} font-mono`}
                value={form.ipAddress}
                onChange={set("ipAddress")}
              />
            </Field>
            {error && <p className="text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className={`${secondaryBtn} flex-1`}
              >
                Hủy
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`}>
                Lưu camera
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
