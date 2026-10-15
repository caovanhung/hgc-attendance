import React, { useState } from 'react';
import { CheckCircle, Clock, MessageSquare, Plus, XCircle } from 'lucide-react';
import type { AttendanceRequest, RequestType, User } from '../types';
import { RequestFormModal } from './RequestFormModal';
import { api, errorMessage } from '../api';
import { primaryBtn } from './ui';

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
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canReview = (req: AttendanceRequest) => currentUser.role !== 'employee' && req.userId !== currentUser.id;

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
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-border border-l-4 border-l-brand-500 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-brand-navy">Đơn giải trình & xin phép</h2>
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

      <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="p-4 border-b border-slate-100 text-xs font-bold text-slate-800">Danh sách đơn ({requests.length})</div>
        {reviewError && (
          <div role="alert" className="mx-4 mt-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700">
            Không duyệt được đơn: {reviewError}
          </div>
        )}
        {requests.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">Chưa có đơn nào</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((req) => (
              <div key={req.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${TYPE_META[req.type]?.badge || 'bg-slate-100 text-slate-800'}`}>
                      {TYPE_META[req.type]?.label || req.type}
                    </span>
                    <span className="font-bold text-slate-900">{req.employeeName}</span>
                    <span className="text-[11px] text-slate-500">
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
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Duyệt
                        </button>
                        <button
                          disabled={busyId === req.id}
                          onClick={() => review(req.id, 'rejected')}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold border border-rose-200 flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
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
        <RequestFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
