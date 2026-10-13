import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { Department, HanetPerson, ImportedUser } from '../types';
import { api, errorMessage } from '../api';
import { Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface Props {
  departments: Department[];
  onClose: () => void;
  onImported: () => void;
}

/** Trùng giới hạn của server (IMPORT_MAX trong server/hanet-import.ts). */
const IMPORT_MAX = 100;

function downloadCsv(rows: ImportedUser[]) {
  const csv = ['Mã nhân viên,Họ tên,Mật khẩu tạm', ...rows.map((r) => [r.code, r.name, r.tempPassword].map((v) => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mat-khau-tam.csv';
  a.click();
  URL.revokeObjectURL(url);
}

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
    <Modal title="Nhập nhân sự từ Hanet" onClose={onClose} wide>
      {created ? (
        <div className="space-y-3">
          <p className="text-emerald-700">Đã nhập {created.length} nhân sự. Mật khẩu tạm chỉ hiện một lần: tải về hoặc chép lại để phát cho từng người.</p>
          <table className="w-full text-left">
            <thead className="text-[11px] text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-1.5">Mã</th>
                <th className="py-1.5">Họ tên</th>
                <th className="py-1.5">Mật khẩu tạm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {created.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 font-mono">{c.code}</td>
                  <td className="py-1.5">{c.name}</td>
                  <td className="py-1.5 font-mono">{c.tempPassword}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button onClick={() => downloadCsv(created)} className={`${secondaryBtn} flex-1`}>
              <Download className="w-3.5 h-3.5" /> Tải CSV
            </button>
            <button onClick={onClose} className={`${primaryBtn} flex-1`}>
              Xong
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <p className="text-rose-600">{error}</p>}
          {persons === null && !error && <p className="text-slate-500">Đang tải danh sách từ Hanet...</p>}
          {persons && persons.length === 0 && <p className="text-slate-500">Mọi người trên Hanet đều đã có trong danh sách nhân sự.</p>}
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
                <select className={`${inputCls} w-auto`} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
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
