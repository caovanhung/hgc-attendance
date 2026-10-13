import React, { useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import type { Department, RecentFace, User, UserRole, UserStatus } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL, fmtTime } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface Props {
  user?: User; // không có = tạo mới
  departments: Department[];
  currentUserId: string;
  onClose: () => void;
  onSaved: (result: { user: User; tempPassword?: string }) => void;
}

export const UserFormModal: React.FC<Props> = ({ user, departments, currentUserId, onClose, onSaved }) => {
  const isEdit = Boolean(user);
  const isSelf = user?.id === currentUserId;
  const [code, setCode] = useState(user?.code ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [position, setPosition] = useState(user?.position ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'employee');
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? '');
  const [hanetPersonId, setHanetPersonId] = useState(user?.hanetPersonId ?? '');
  const [faceRegistered, setFaceRegistered] = useState(user?.faceRegistered ?? false);
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [faces, setFaces] = useState<RecentFace[] | null>(null);
  const [facesLoading, setFacesLoading] = useState(false);
  const [facesError, setFacesError] = useState<string | null>(null);

  const loadFaces = async () => {
    setFacesLoading(true);
    setFacesError(null);
    try {
      setFaces((await api<{ faces: RecentFace[] }>('/api/hanet/recent-faces')).faces);
    } catch (err) {
      setFacesError(errorMessage(err));
    } finally {
      setFacesLoading(false);
    }
  };

  const pickFace = (f: RecentFace) => {
    if (!isEdit) {
      setCode(f.aliasId ?? '');
      if (f.personName) setName(f.personName);
    }
    setHanetPersonId(f.personId ?? '');
    setFaceRegistered(true);
    setFaces(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name, email, phone, position, role, departmentId: departmentId || null, hanetPersonId, faceRegistered, status };
    try {
      if (user) {
        const r = await api<{ user: User }>(`/api/users/${user.id}`, { method: 'PUT', body });
        onSaved({ user: r.user });
      } else {
        const r = await api<{ user: User; tempPassword: string }>('/api/users', { method: 'POST', body: { ...body, code } });
        onSaved(r);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isEdit ? `Sửa nhân sự ${user?.code}` : 'Thêm nhân sự'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3.5">
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600">
              Nhờ người này đứng trước camera, rồi bấm nút để tự điền {isEdit ? 'liên kết Hanet' : 'mã nhân viên, họ tên và liên kết Hanet'}.
            </p>
            <button type="button" onClick={loadFaces} disabled={facesLoading} className={`${secondaryBtn} py-1.5 shrink-0`}>
              {facesLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} Lấy từ camera
            </button>
          </div>
          {facesError && <p className="text-rose-600">{facesError}</p>}
          {faces && faces.length === 0 && (
            <p className="text-[11px] text-slate-500">
              Không có ai mới được nhận diện trong 10 phút gần đây (người đã có trong danh sách nhân sự không hiện ở đây). Hãy đứng trước camera rồi bấm lại.
            </p>
          )}
          {faces && faces.length > 0 && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {faces.map((f) => (
                <button
                  key={f.personId ?? `alias:${f.aliasId}`}
                  type="button"
                  onClick={() => pickFace(f)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl bg-white border border-slate-200 hover:border-orange-400 text-left cursor-pointer"
                >
                  {f.imageUrl ? (
                    <img src={f.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 truncate">{f.personName ?? 'Không rõ tên'}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      Mã: <span className="font-mono">{f.aliasId ?? '— (chưa có trên Hanet)'}</span> · {fmtTime(f.ts)}
                      {f.deviceName ? ` · ${f.deviceName}` : ''}
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-orange-600 shrink-0">Chọn</span>
                </button>
              ))}
            </div>
          )}
          {hanetPersonId && (
            <p className="text-[11px] text-emerald-700">
              ✓ Đã liên kết với người trên Hanet (Person ID <span className="font-mono">{hanetPersonId}</span>)
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã nhân viên" hint={isEdit ? undefined : 'Phải trùng aliasID trên Hanet; không rõ thì bấm "Lấy từ camera"'}>
            <input className={`${inputCls} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} required />
          </Field>
          <Field label="Họ tên">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Phòng ban">
            <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— Chưa phân phòng —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vai trò">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSelf}>
              {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chức vụ">
            <input className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
          <Field label="Số điện thoại">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {isEdit && (
            <Field label="Trạng thái">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} disabled={isSelf}>
                <option value="active">Đang làm việc</option>
                <option value="inactive">Đã nghỉ (khóa đăng nhập, bỏ qua nhận diện)</option>
              </select>
            </Field>
          )}
          <label className="flex items-center gap-2 mt-5">
            <input type="checkbox" checked={faceRegistered} onChange={(e) => setFaceRegistered(e.target.checked)} />
            <span>Đã đăng ký khuôn mặt trên Hanet</span>
          </label>
        </div>
        {isSelf && <p className="text-[11px] text-slate-500">Bạn không thể tự đổi vai trò hoặc trạng thái của mình.</p>}
        {error && <p className="text-rose-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${secondaryBtn} flex-1`}>
            Hủy
          </button>
          <button type="submit" disabled={busy} className={`${primaryBtn} flex-1`}>
            {busy ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo nhân sự'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
