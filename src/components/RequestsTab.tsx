import React, { useState } from 'react';
import { CheckCircle, Clock, MessageSquare, Plus, XCircle } from 'lucide-react';
import type { AttendanceRequest, RequestType, User } from '../types';
import { api, errorMessage } from '../api';
import { vnToday } from '../format';
import { Field, Modal, inputCls, primaryBtn, secondaryBtn } from './ui';

interface RequestsTabProps {
  requests: AttendanceRequest[];
  currentUser: User;
  onRefresh: () => void;
}

const TYPE_META: Record<RequestType, { label: string; badge: string }> = {
  late_explanation: { label: 'Giải trình đi muộn', badge: 'bg-amber-100 text-amber-800' },
  missed_punch: { label: 'Quên quẹt mặt', badge: 'bg-blue-100 text-blue-800' },
  leave_request: { label: 'Nghỉ phép', badge: 'bg-purple-100 text-purple-800' },
  business_trip: { label: 'Công tác', badge: 'bg-sky-100 text-sky-800' },
};

export const RequestsTab: React.FC<RequestsTabProps> = ({ requests, currentUser, onRefresh }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [type, setType] = useState<RequestType>('late_explanation');
  const [workDate, setWorkDate] = useState(vnToday());
  const [endDate, setEndDate] = useState('');
  const [suggestedIn, setSuggestedIn] = useState('');
  const [suggestedOut, setSuggestedOut] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canReview = (req: AttendanceRequest) => currentUser.role !== 'employee' && req.userId !== currentUser.id;

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
      setShowAdd(false);
      setReason('');
      setSuggestedIn('');
      setSuggestedOut('');
      setEndDate('');
      onRefresh();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const review = async (id: string, status: 'approved' | 'rejected') => {
    const comment = window.prompt(status === 'approved' ? 'Ghi chú khi duyệt (có thể để trống):' : 'Lý do từ chối:') ?? null;
    if (comment === null) return;
    setReviewError(null);
    setBusyId(id);
    try {
      await api(`/api/requests/${id}`, { method: 'PUT', body: { status, comment } });
      onRefresh();
    } catch (err) {
      setReviewError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Đơn giải trình & xin phép</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {currentUser.role === 'employee'
              ? 'Gửi giải trình khi đi muộn có lý do, quên quẹt mặt, nghỉ phép, hoặc đi công tác.'
              : 'Duyệt đơn của nhân viên trong phạm vi bạn quản lý. Không thể tự duyệt đơn của mình.'}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className={primaryBtn}>
          <Plus className="w-4 h-4" /> Tạo đơn mới
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 text-xs font-bold text-slate-800">Danh sách đơn ({requests.length})</div>
        {reviewError && (
          <div role="alert" className="mx-4 mt-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700">
            Không duyệt được đơn: {reviewError}
          </div>
        )}
        {requests.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">Chưa có đơn nào</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((req) => (
              <div key={req.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_META[req.type]?.badge || 'bg-slate-100 text-slate-800'}`}>
                      {TYPE_META[req.type]?.label || req.type}
                    </span>
                    <span className="font-bold text-slate-900">{req.employeeName}</span>
                    <span className="text-[11px] text-slate-400">
                      Ngày {req.endDate ? `${req.workDate.split('-').reverse().join('/')} → ${req.endDate.split('-').reverse().join('/')}` : req.workDate.split('-').reverse().join('/')}
                    </span>
                  </div>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-w-2xl">"{req.reason}"</p>
                  {(req.suggestedIn || req.suggestedOut) && (
                    <div className="text-[11px] text-slate-500">
                      Giờ đề xuất: vào <strong className="font-mono">{req.suggestedIn ?? '—'}</strong>, ra{' '}
                      <strong className="font-mono">{req.suggestedOut ?? '—'}</strong>
                    </div>
                  )}
                  {req.reviewerName && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> {req.reviewerName}
                      {req.comment ? `: ${req.comment}` : ''}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {req.status === 'pending' ? (
                    canReview(req) ? (
                      <div className="flex gap-1.5">
                        <button
                          disabled={busyId === req.id}
                          onClick={() => review(req.id, 'approved')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Duyệt
                        </button>
                        <button
                          disabled={busyId === req.id}
                          onClick={() => review(req.id, 'rejected')}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold border border-rose-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Từ chối
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="w-3.5 h-3.5" /> Chờ duyệt
                      </span>
                    )
                  ) : req.status === 'approved' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle className="w-3.5 h-3.5" /> Đã duyệt
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      <XCircle className="w-3.5 h-3.5" /> Từ chối
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Tạo đơn mới" onClose={() => setShowAdd(false)}>
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
                <span className="block text-[11px] text-slate-400">Tối đa 31 ngày, gửi trước tối đa 7 ngày; chỉ tính ngày làm việc của ca</span>
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
              <button type="button" onClick={() => setShowAdd(false)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`}>
                Gửi đơn
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
