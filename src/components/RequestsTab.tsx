import React, { useState } from 'react';
import { FileText, Plus, CheckCircle, XCircle, Clock, AlertCircle, MessageSquare } from 'lucide-react';
import { AttendanceRequest, User } from '../types';

interface RequestsTabProps {
  requests: AttendanceRequest[];
  currentUser: User | null;
  onRefresh: () => void;
}

export const RequestsTab: React.FC<RequestsTabProps> = ({
  requests,
  currentUser,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [type, setType] = useState<'late_explanation' | 'missed_punch' | 'leave_request'>('late_explanation');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [suggestedTime, setSuggestedTime] = useState('08:10');
  const [reason, setReason] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const role = currentUser?.role;
  const canReview = role === 'dept_manager' || role === 'hr';

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return;

    try {
      const res = await fetch('/api/attendance/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          date,
          suggestedTime,
          reason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        setReason('');
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReview = async (requestId: string, status: 'approved' | 'rejected') => {
    setReviewingId(requestId);
    try {
      const res = await fetch(`/api/attendance/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          comment: status === 'approved' ? 'Đã duyệt điều chỉnh công' : 'Không chấp thuận giải trình',
        }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReviewingId(null);
    }
  };

  const getTypeLabel = (t: string) => {
    switch (t) {
      case 'late_explanation':
        return { label: 'Giải trình Đi muộn', badge: 'bg-amber-100 text-amber-800' };
      case 'missed_punch':
        return { label: 'Quên quét khuôn mặt', badge: 'bg-blue-100 text-blue-800' };
      case 'leave_request':
        return { label: 'Đơn xin nghỉ phép', badge: 'bg-purple-100 text-purple-800' };
      default:
        return { label: t, badge: 'bg-slate-100 text-slate-800' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Đơn Giải trình Điểm danh & Xin phép</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {role === 'employee'
              ? 'Nhân viên gửi giải trình khi camera không quét được hoặc đi muộn có lý do chính đáng.'
              : 'Trưởng phòng xem và phê duyệt giải trình của thành viên trong phòng ban của mình.'}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo đơn giải trình mới</span>
        </button>
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="font-bold text-xs text-slate-800">
            Danh sách đơn ({requests.length})
          </span>
          <span className="text-xs text-slate-500">
            {canReview ? 'Bạn có quyền phê duyệt' : 'Đơn của bạn'}
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Chưa có đơn giải trình nào
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((req) => {
              const typeMeta = getTypeLabel(req.type);
              const isPending = req.status === 'pending';
              const isApproved = req.status === 'approved';

              return (
                <div key={req.id} className="p-4 hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeMeta.badge}`}>
                        {typeMeta.label}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {req.employeeName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Ngày: {req.date}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-w-2xl">
                      "{req.reason}"
                    </p>

                    {req.suggestedTime && (
                      <div className="text-[11px] text-slate-500">
                        Giờ đề xuất ghi nhận: <strong className="text-slate-800 font-mono">{req.suggestedTime}</strong>
                      </div>
                    )}

                    {req.reviewedBy && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                        <MessageSquare className="w-3 h-3 text-slate-400" />
                        <span>Người duyệt: <strong>{req.reviewedBy}</strong> ({req.comment || 'Chấp thuận'})</span>
                      </div>
                    )}
                  </div>

                  {/* Actions / Status */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isPending ? (
                      canReview ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleReview(req.id, 'approved')}
                            disabled={reviewingId === req.id}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Duyệt</span>
                          </button>
                          <button
                            onClick={() => handleReview(req.id, 'rejected')}
                            disabled={reviewingId === req.id}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs flex items-center gap-1 border border-rose-200 cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Từ chối</span>
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Đang chờ duyệt</span>
                        </span>
                      )
                    ) : isApproved ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Đã phê duyệt</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Từ chối</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit Request Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-400" />
                <span className="font-bold text-sm">Gửi Đơn Giải Trình Điểm Danh</span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loại đề xuất:</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500 bg-white"
                >
                  <option value="late_explanation">Giải trình Đi muộn có lý do</option>
                  <option value="missed_punch">Quên quét camera khi vào ca</option>
                  <option value="leave_request">Đơn xin nghỉ phép</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ngày áp dụng:</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giờ đề xuất:</label>
                  <input
                    type="time"
                    value={suggestedTime}
                    onChange={(e) => setSuggestedTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lý do giải trình chi tiết:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ghi rõ lý do (ví dụ: Tắc đường, đi công tác ngoài, sự cố máy ảnh...)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-orange-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  Gửi đơn cho Trưởng phòng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
