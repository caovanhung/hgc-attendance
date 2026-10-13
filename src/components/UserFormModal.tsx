import React, { useState } from 'react';
import type { Department, User, UserRole, UserStatus } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL } from '../format';
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã nhân viên (= aliasID trên Hanet)">
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
          <Field label="Hanet Person ID" hint="Để trống nếu chưa có; hệ thống ưu tiên khớp theo mã nhân viên">
            <input className={`${inputCls} font-mono`} value={hanetPersonId} onChange={(e) => setHanetPersonId(e.target.value)} />
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
