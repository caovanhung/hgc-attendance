import React, { useState } from 'react';
import type { RequestType } from '../types';
import { api, errorMessage } from '../api';
import { vnToday } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

/** Form gửi đơn (dùng chung cho tab "Giải trình / Xin phép" và nút "Nộp đơn" ở tab "Của tôi"). */
export const RequestFormModal: React.FC<{
  initial?: { type: RequestType; workDate: string };
  onClose: () => void;
  onSaved: () => void;
}> = ({ initial, onClose, onSaved }) => {
  const [type, setType] = useState<RequestType>(initial?.type ?? 'late_explanation');
  const [workDate, setWorkDate] = useState(initial?.workDate ?? vnToday());
  const [endDate, setEndDate] = useState('');
  const [suggestedIn, setSuggestedIn] = useState('');
  const [suggestedOut, setSuggestedOut] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const maxLeaveDate = new Date(Date.parse(vnToday()) + 7 * 86_400_000).toISOString().slice(0, 10);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api('/api/requests', {
        method: 'POST',
        body: {
          workDate,
          type,
          reason,
          ...(type === 'missed_punch' ? { suggestedIn: suggestedIn || undefined, suggestedOut: suggestedOut || undefined } : {}),
          ...(type === 'leave_request' || type === 'business_trip' ? { endDate: endDate || undefined } : {}),
        },
      });
      onSaved();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  return (
    <Modal title="Tạo đơn mới" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Loại đơn">
          <select value={type} onChange={(e) => setType(e.target.value as RequestType)} className={inputCls}>
            <option value="late_explanation">Giải trình đi muộn có lý do</option>
            <option value="missed_punch">Quên quẹt mặt (bổ sung giờ vào/ra)</option>
            <option value="leave_request">Nghỉ phép</option>
            <option value="business_trip">Công tác</option>
          </select>
        </Field>

        {type === 'leave_request' || type === 'business_trip' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Từ ngày">
                <input type="date" required max={maxLeaveDate} value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Đến ngày">
                <input type="date" min={workDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <span className="block text-[11px] text-slate-500">Tối đa 31 ngày, gửi trước tối đa 7 ngày; chỉ tính ngày làm việc của ca</span>
          </div>
        ) : (
          <Field label="Ngày áp dụng">
            <input type="date" required max={vnToday()} value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputCls} />
          </Field>
        )}

        {type === 'missed_punch' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giờ vào đề xuất">
              <input type="time" value={suggestedIn} onChange={(e) => setSuggestedIn(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Giờ ra đề xuất">
              <input type="time" value={suggestedOut} onChange={(e) => setSuggestedOut(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}
        <Field label="Lý do">
          <textarea rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </Field>
        {formError && <p className="text-rose-600">{formError}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${secondaryBtn} flex-1`}>
            Hủy
          </button>
          <button type="submit" className={`${primaryBtn} flex-1`}>
            Gửi đơn
          </button>
        </div>
      </form>
    </Modal>
  );
};
