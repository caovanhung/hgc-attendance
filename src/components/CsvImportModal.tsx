import React, { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { CsvPreviewRow, CsvRowInput, ImportedUser } from '../types';
import { api, errorMessage } from '../api';
import { CSV_MAX_ROWS, CSV_TEMPLATE, csvToRows } from '../csv';
import { Modal, primaryBtn, secondaryBtn } from './ui';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mau-nhap-nhan-su.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export const CsvImportModal: React.FC<{ onClose: () => void; onImported: () => void }> = ({ onClose, onImported }) => {
  const [rows, setRows] = useState<CsvRowInput[] | null>(null);
  const [preview, setPreview] = useState<CsvPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: ImportedUser[]; skipped: number } | null>(null);

  const onFile = async (file: File | undefined) => {
    setError(null);
    setPreview(null);
    setRows(null);
    if (!file) return;
    const parsed = csvToRows(await file.text());
    if (parsed.error) return setError(parsed.error);
    if (parsed.rows.length === 0) return setError('File không có dòng nào');
    if (parsed.rows.length > CSV_MAX_ROWS) return setError(`Mỗi lần nhập tối đa ${CSV_MAX_ROWS} dòng — hãy chia file nhỏ hơn`);
    setBusy(true);
    try {
      const r = await api<{ rows: CsvPreviewRow[] }>('/api/users/import-csv/preview', { method: 'POST', body: { rows: parsed.rows } });
      setRows(parsed.rows);
      setPreview(r.rows);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await api<{ created: ImportedUser[]; skipped: number }>('/api/users/import-csv', { method: 'POST', body: { rows } }));
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const okCount = preview?.filter((p) => p.ok).length ?? 0;

  return (
    <Modal title="Nhập nhân sự từ file CSV" onClose={onClose} wide>
      {done ? (
        <div className="space-y-3">
          <p className="text-emerald-700">
            Đã tạo {done.created.length} nhân sự{done.skipped ? `, bỏ qua ${done.skipped} dòng lỗi` : ''}. Mật khẩu được gửi dần qua email cho từng người (theo dõi ở cột trạng thái thư).
          </p>
          <button type="button" onClick={onClose} className={`${primaryBtn} w-full`}>
            Đóng
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-slate-600">
            Cột bắt buộc: <span className="font-mono">ho_ten, email, so_dien_thoai, ma_phong_ban</span>. Cột tùy chọn:{' '}
            <span className="font-mono">ma_nhan_vien</span> (để trống thì tự sinh), <span className="font-mono">chuc_vu</span>,{' '}
            <span className="font-mono">vai_tro</span> (<span className="font-mono">nhan_vien</span> hoặc <span className="font-mono">truong_phong</span>). Tối đa {CSV_MAX_ROWS} dòng mỗi lần.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadTemplate} className={secondaryBtn}>
              <Download className="w-3.5 h-3.5" /> Tải file mẫu
            </button>
            <label className={`${secondaryBtn} cursor-pointer`}>
              <Upload className="w-3.5 h-3.5" /> Chọn file CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
          </div>
          {busy && <p className="text-slate-500">Đang xử lý...</p>}
          {error && <p className="text-rose-600">{error}</p>}
          {preview && (
            <>
              <div className="max-h-80 overflow-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[11px] text-slate-500 sticky top-0">
                    <tr>
                      <th className="p-2">Dòng</th>
                      <th className="p-2">Họ tên</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Mã</th>
                      <th className="p-2">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((p) => (
                      <tr key={p.line} className={p.ok ? '' : 'bg-rose-50/60'}>
                        <td className="p-2 font-mono">{p.line}</td>
                        <td className="p-2">{p.name || '—'}</td>
                        <td className="p-2">{p.email || '—'}</td>
                        <td className="p-2 font-mono">{p.code ?? '—'}</td>
                        <td className={`p-2 ${p.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{p.ok ? 'Hợp lệ' : p.errors.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={create} disabled={busy || okCount === 0} className={`${primaryBtn} w-full`}>
                Tạo {okCount} nhân sự hợp lệ{preview.length > okCount ? ` (bỏ qua ${preview.length - okCount} dòng lỗi)` : ''}
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
