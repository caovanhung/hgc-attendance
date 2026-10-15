import React, { useEffect, useState } from 'react';
import { Camera, RefreshCw, ScanFace } from 'lucide-react';
import type { Area, Department, FaceCandidates, FaceResult, FaceSighting, Shift, User, UserRole, UserStatus } from '../types';
import { api, errorMessage } from '../api';
import { ROLE_LABEL, fmtTime } from '../format';
import { assignableRoles } from '../permissions';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

export interface UserSaved {
  user: User;
  face?: FaceResult;
}

interface Props {
  user?: User; // không có = tạo mới
  departments: Department[];
  me: User;
  isSystemAdmin: boolean;
  areas: Area[];
  onClose: () => void;
  onSaved: (result: UserSaved) => void;
}

type Picked = { sightingId?: number; detectionId?: number; url: string };

const Thumb: React.FC<{ url: string; title: string; sub: string; selected: boolean; onClick: () => void }> = ({ url, title, sub, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-xl border overflow-hidden bg-white cursor-pointer ${selected ? 'border-brand-500 ring-2 ring-brand-300' : 'border-slate-200 hover:border-brand-400'}`}
  >
    <img src={url} alt="" className="w-full aspect-[3/4] object-cover bg-slate-100" />
    <div className="p-1.5">
      <div className="font-semibold text-[11px] truncate">{title}</div>
      <div className="text-[11px] text-slate-500 truncate">{sub}</div>
    </div>
  </button>
);

export const UserFormModal: React.FC<Props> = ({ user, departments, me, isSystemAdmin, areas, onClose, onSaved }) => {
  const isEdit = Boolean(user);
  const isSelf = user?.id === me.id;
  const roles = assignableRoles(me, isSystemAdmin);
  const roleLocked = isSelf || (user !== undefined && !roles.includes(user.role));
  // Quản trị khu: không đăng ký FaceID cho hr/area_admin hoặc cho chính mình (server vẫn kiểm tra)
  const faceAllowed = me.role !== 'area_admin' || (!isSelf && user?.role !== 'hr' && user?.role !== 'area_admin');
  const isManager = me.role === 'hr' || me.role === 'area_admin';
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [shiftId, setShiftId] = useState(user?.shiftId ?? '');
  const [shiftTouched, setShiftTouched] = useState(false);
  const [code, setCode] = useState(user?.code ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [position, setPosition] = useState(user?.position ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'employee');
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? '');
  const [adminAreaIds, setAdminAreaIds] = useState<string[]>(user?.adminAreaIds ?? []);
  const [hanetPersonId, setHanetPersonId] = useState(user?.hanetPersonId ?? '');
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'active');

  useEffect(() => {
    if (isManager) {
      api<{ shifts: Shift[] }>('/api/shifts')
        .then((d) => setShifts(d.shifts))
        .catch(() => undefined);
    }
  }, [isManager]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sightings, setSightings] = useState<FaceSighting[] | null>(null);
  const [candidates, setCandidates] = useState<FaceCandidates | null>(null);
  const [loadingFaces, setLoadingFaces] = useState(false);
  const [facesError, setFacesError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [faceMsg, setFaceMsg] = useState<FaceResult | null>(null);

  useEffect(() => {
    if (isEdit) return;
    api<{ code: string }>('/api/users/next-code')
      .then((r) => setCode((c) => c || r.code))
      .catch(() => undefined);
  }, [isEdit]);

  const loadFaces = async () => {
    setLoadingFaces(true);
    setFacesError(null);
    try {
      if (user) setCandidates(await api<FaceCandidates>(`/api/users/${user.id}/face-candidates`));
      else setSightings((await api<{ sightings: FaceSighting[] }>('/api/hanet/sightings')).sightings);
    } catch (err) {
      setFacesError(errorMessage(err));
    } finally {
      setLoadingFaces(false);
    }
  };

  const pickSighting = (s: FaceSighting) => {
    if (s.kind === 'unlinked') {
      // Người đã có trên Hanet: liên kết theo Person ID, không đăng ký lại
      if (!isEdit) {
        // Người chưa có aliasID trên Hanet: giữ mã HR đã gõ.
        if (s.aliasId) setCode(s.aliasId);
        if (s.personName) setName(s.personName);
      }
      setHanetPersonId(s.personId ?? '');
      setPicked(null);
    } else {
      setPicked({ sightingId: s.id, url: s.imageUrl });
      if (!isEdit) setHanetPersonId('');
    }
  };

  // Ca chọn được: ca của khu phòng ban đang chọn. Ca riêng hiện tại không còn trong danh sách (phòng đã chuyển khu) ⇒ hiện "Theo phòng ban".
  const deptAreaId = departments.find((d) => d.id === departmentId)?.areaId;
  const shiftOptions = (shifts ?? []).filter((s) => s.areaId === deptAreaId);
  const shownShiftId = shifts === null || shiftOptions.some((s) => s.id === shiftId) ? shiftId : '';
  // Chỉ gửi ca khi người dùng đổi ca hoặc đổi phòng ban (sửa thông tin khác không đụng tới ca)
  const sendShift = !user || shiftTouched || departmentId !== (user.departmentId ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Quản trị khu tự sửa mình: chỉ họ tên, email, điện thoại, chức vụ
    const body =
      isSelf && me.role === 'area_admin'
        ? { name, email, phone, position }
        : {
            name,
            email,
            phone,
            position,
            role,
            departmentId: departmentId || null,
            ...(sendShift ? { shiftId: shownShiftId || null } : {}),
            hanetPersonId,
            status,
            ...(role === 'area_admin' && !roleLocked ? { adminAreaIds } : {}),
          };
    try {
      if (user) {
        const r = await api<{ user: User }>(`/api/users/${user.id}`, { method: 'PUT', body });
        onSaved({ user: r.user });
      } else {
        const r = await api<UserSaved>('/api/users', {
          method: 'POST',
          body: { ...body, code, ...(picked?.sightingId ? { sightingId: picked.sightingId } : {}) },
        });
        onSaved(r);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const updateFace = async () => {
    if (!user || !picked) return;
    setBusy(true);
    setFaceMsg(null);
    try {
      const r = await api<{ user: User; face: FaceResult }>(`/api/users/${user.id}/face`, {
        method: 'POST',
        body: picked.sightingId ? { sightingId: picked.sightingId } : { detectionId: picked.detectionId },
      });
      if (r.face.ok) onSaved({ user: r.user, face: r.face });
      else setFaceMsg(r.face);
    } catch (err) {
      setFaceMsg({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const strangers = (isEdit ? candidates?.strangers : sightings?.filter((s) => s.kind === 'stranger')) ?? [];
  const unlinked = (isEdit ? candidates?.unlinked : sightings?.filter((s) => s.kind === 'unlinked')) ?? [];
  const loaded = isEdit ? candidates !== null : sightings !== null;
  const nothing = loaded && strangers.length === 0 && unlinked.length === 0 && (candidates?.detections.length ?? 0) === 0;

  return (
    <Modal title={isEdit ? `Sửa nhân sự ${user?.code}` : 'Thêm nhân sự'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3.5">
        {faceAllowed && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600">
              {isEdit
                ? 'Đổi ảnh nhận diện: chọn một lượt camera chụp người này rồi bấm Cập nhật FaceID.'
                : 'Nhờ người này đứng trước Camera AI, rồi bấm nút để chọn ảnh đăng ký FaceID (người lạ) hoặc liên kết người đã có trên Camera AI.'}
            </p>
            <button type="button" onClick={loadFaces} disabled={loadingFaces} className={`${secondaryBtn} py-1.5 shrink-0`}>
              {loadingFaces ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} Lấy từ camera
            </button>
          </div>
          {facesError && <p className="text-rose-600">{facesError}</p>}
          {nothing && <p className="text-[11px] text-slate-500">Không có lượt chụp nào trong 30 phút gần đây. Hãy đứng trước camera rồi bấm lại.</p>}

          {isEdit && candidates && candidates.detections.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-700 mb-1">Lượt quẹt của người này (24 giờ)</div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {candidates.detections.map((d) => (
                  <Thumb
                    key={d.id}
                    url={d.imageUrl}
                    title={fmtTime(d.ts)}
                    sub={d.deviceName}
                    selected={picked?.detectionId === d.id}
                    onClick={() => setPicked({ detectionId: d.id, url: d.imageUrl })}
                  />
                ))}
              </div>
            </div>
          )}

          {strangers.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-700 mb-1">Người lạ — chọn ảnh để đăng ký FaceID</div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {strangers.map((s) => (
                  <Thumb
                    key={s.id}
                    url={s.imageUrl}
                    title={fmtTime(s.ts)}
                    sub={s.deviceName ?? s.deviceId}
                    selected={picked?.sightingId === s.id}
                    onClick={() => pickSighting(s)}
                  />
                ))}
              </div>
            </div>
          )}

          {unlinked.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-700">Đã có trên Camera AI — chọn để liên kết</div>
              {unlinked.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSighting(s)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl bg-white border border-slate-200 hover:border-brand-400 text-left cursor-pointer"
                >
                  <img src={s.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 truncate">{s.personName ?? 'Không rõ tên'}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      Mã: <span className="font-mono">{s.aliasId ?? '— (chưa có trên Camera AI)'}</span> · {fmtTime(s.ts)}
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-brand-600 shrink-0">Chọn</span>
                </button>
              ))}
            </div>
          )}

          {!isEdit && picked && <p className="text-[11px] text-emerald-700">✓ Sẽ đăng ký FaceID bằng ảnh đã chọn khi bấm Tạo nhân sự.</p>}
          {!isEdit && hanetPersonId && (
            <p className="text-[11px] text-emerald-700">
              ✓ Đã liên kết với người trên Camera AI (Person ID <span className="font-mono">{hanetPersonId}</span>)
            </p>
          )}
          {isEdit && hanetPersonId && hanetPersonId !== (user?.hanetPersonId ?? '') && (
            <p className="text-[11px] text-emerald-700">
              ✓ Sẽ liên kết với người trên Camera AI (Person ID <span className="font-mono">{hanetPersonId}</span>) khi bấm Lưu.
            </p>
          )}
          {isEdit && (
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] ${user?.faceRegistered ? 'text-emerald-700' : 'text-amber-700'}`}>
                {user?.faceRegistered ? '✓ Đã có FaceID trên Camera AI' : 'Chưa có FaceID'}
                {user?.faceError && <span className="text-rose-600"> · Lỗi gần nhất: {user.faceError}</span>}
              </span>
              <button type="button" onClick={updateFace} disabled={busy || !picked} className={`${primaryBtn} py-1.5 shrink-0`}>
                <ScanFace className="w-3.5 h-3.5" /> {user?.faceRegistered ? 'Cập nhật FaceID' : 'Đăng ký FaceID'}
              </button>
            </div>
          )}
          {faceMsg && <p className={faceMsg.ok ? 'text-emerald-700' : 'text-rose-600'}>{faceMsg.message}</p>}
        </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã nhân viên" hint={isEdit ? undefined : 'Mã gợi ý tự sinh; sửa nếu cần. Phải trùng aliasID trên Camera AI nếu người này đã có trên Camera AI'}>
            <input className={`${inputCls} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} />
          </Field>
          <Field label="Họ tên">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Phòng ban">
            <select
              className={inputCls}
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setShiftId('');
              }}
              required={me.role === 'area_admin'}
              disabled={isSelf && me.role === 'area_admin'}
            >
              {me.role === 'hr' && <option value="">— Chưa phân phòng —</option>}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          {isManager && !(isSelf && me.role === 'area_admin') && (
            <Field label="Ca riêng" hint="Để trống: theo ca của phòng ban">
              <select
                className={inputCls}
                value={shownShiftId}
                onChange={(e) => {
                  setShiftId(e.target.value);
                  setShiftTouched(true);
                }}
              >
                <option value="">Theo phòng ban</option>
                {shiftOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.workStart}–{s.workEnd})
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Vai trò">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={roleLocked}>
              {(roleLocked ? [role] : roles).map((r) => (
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
            <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="0912345678" />
          </Field>
          <Field label="Email" hint={isEdit ? undefined : 'Mật khẩu đăng nhập sẽ được gửi tới email này'}>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {isEdit && (
            <Field label="Trạng thái">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} disabled={roleLocked}>
                <option value="active">Đang làm việc</option>
                <option value="inactive">Đã nghỉ (khóa đăng nhập, bỏ qua nhận diện)</option>
              </select>
            </Field>
          )}
        </div>
        {role === 'area_admin' && !roleLocked && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
            <div className="text-[11px] font-semibold text-slate-700 mb-1.5">Khu được giao quản lý</div>
            <div className="flex flex-wrap gap-3">
              {areas.map((a) => (
                <label key={a.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminAreaIds.includes(a.id)}
                    onChange={(e) => setAdminAreaIds(e.target.checked ? [...adminAreaIds, a.id] : adminAreaIds.filter((x) => x !== a.id))}
                  />
                  {a.name}
                </label>
              ))}
              {areas.length === 0 && <span className="text-slate-500">Chưa có khu vực nào — tạo ở tab Khu vực.</span>}
            </div>
          </div>
        )}
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
