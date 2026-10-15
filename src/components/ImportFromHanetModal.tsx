import React, { useEffect, useState } from 'react';
import type { Department, HanetPerson, ImportedUser } from '../types';
import { api, errorMessage } from '../api';
import { Modal, inputCls, primaryBtn } from './ui';

interface Props {
  departments: Department[];
  onClose: () => void;
  onImported: () => void;
}

/** Trùng giới hạn của server (IMPORT_MAX trong server/hanet-import.ts). */
const IMPORT_MAX = 100;

export const ImportFromHanetModal: React.FC<Props> = ({ departments, onClose, onImported }) => {
  const [persons, setPersons] = useState<HanetPerson[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ImportedUser[] | null>(null);

  useEffect(() => {
    api<{ persons: HanetPerson[] }>('/api/hanet/persons/unlinked')
      .then((r) => setPersons(r.persons))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < IMPORT_MAX) next.add(id);
    else return;
    setSelected(next);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ created: ImportedUser[] }>('/api/users/import', {
        method: 'POST',
        body: { persons: [...selected].map((personId) => ({ personId })), departmentId: departmentId || null },
      });
      setCreated(r.created);
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Nhập nhân sự từ Camera AI" onClose={onClose} wide>
      {created ? (
        <div className="space-y-3">
          <p className="text-emerald-700">
            Đã nhập {created.length} nhân sự. Những người này chưa có email nên chưa đăng nhập được: vào tab Nhân sự, bấm Sửa từng người để bổ sung email và số điện thoại — hệ thống sẽ tự gửi mật khẩu qua email.
          </p>
          <button type="button" onClick={onClose} className={`${primaryBtn} w-full`}>
            Đóng
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <p className="text-rose-600">{error}</p>}
          {persons === null && !error && <p className="text-slate-500">Đang tải danh sách từ Camera AI...</p>}
          {persons && persons.length === 0 && <p className="text-slate-500">Mọi người trên Camera AI đều đã có trong danh sách nhân sự.</p>}
          {persons && persons.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.size === Math.min(persons.length, IMPORT_MAX)}
                    onChange={(e) => setSelected(e.target.checked ? new Set(persons.slice(0, IMPORT_MAX).map((p) => p.personID)) : new Set())}
                  />
                  <span>{persons.length > IMPORT_MAX ? `Chọn ${IMPORT_MAX} người đầu (trong ${persons.length})` : `Chọn tất cả (${persons.length})`}</span>
                </label>
                <select className={`${inputCls} w-auto!`} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">— Phòng ban cho nhóm đã chọn —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500">
                Mỗi lần nhập tối đa {IMPORT_MAX} người{persons.length > IMPORT_MAX ? '; nhập xong nhóm này thì mở lại để nhập tiếp' : ''}.
              </p>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {persons.map((p) => (
                  <label key={p.personID} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(p.personID)}
                      disabled={!selected.has(p.personID) && selected.size >= IMPORT_MAX}
                      onChange={() => toggle(p.personID)}
                    />
                    {p.avatar ? <img src={p.avatar} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100" /> : <div className="w-9 h-9 rounded-lg bg-slate-100" />}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{p.name || '(không tên)'}</div>
                      <div className="text-[11px] text-slate-500">
                        aliasID: <span className="font-mono">{p.aliasID || '— (hệ thống sẽ tự sinh mã)'}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button onClick={submit} disabled={busy || selected.size === 0} className={`${primaryBtn} w-full`}>
                {busy ? 'Đang nhập...' : `Nhập ${selected.size} người`}
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
