import React, { useEffect, useState } from 'react';
import { Video } from 'lucide-react';
import type { AttendanceDay, Detection, User } from '../types';
import { api, errorMessage } from '../api';
import { canAdjust, fmtDate, fmtDateTime, fmtTime, getAttendanceStatusText, OVERRIDE_KIND_LABEL } from '../format';
import { Field, Modal, dangerBtn, inputCls, secondaryBtn } from './ui';
import { VideoModal } from './VideoModal';
import { AdjustDayModal } from './AdjustDayModal';

const SOURCE_LABEL: Record<Detection['source'], string> = { webhook: 'Webhook', reconcile: 'Đối soát', simulator: 'Mô phỏng' };

/**
 * Chi tiết một ngày công (dùng chung cho bảng công, báo cáo tháng, "Của tôi"): ảnh các lượt quẹt, video,
 * khối điều chỉnh và nút Điều chỉnh / Bỏ điều chỉnh cho HR và quản trị khu.
 */
export const DayDetailModal: React.FC<{
  userId: string;
  userName: string;
  date: string;
  day: AttendanceDay | null;
  currentUser: User;
  locked: boolean;
  onClose: () => void;
  onChanged: (day: AttendanceDay | null) => void;
}> = ({ userId, userName, date, day: initialDay, currentUser, locked, onClose, onChanged }) => {
  const [day, setDay] = useState(initialDay);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoOf, setVideoOf] = useState<Detection | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ detections: Detection[] }>(`/api/attendance/${userId}/${date}/detections`)
      .then((d) => !cancelled && setDetections(d.detections))
      .catch((err) => {
        if (cancelled) return;
        setDetections([]);
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, date]);

  const changed = (d: AttendanceDay | null) => {
    setDay(d);
    onChanged(d);
  };

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setRemoveError(null);
    try {
      const r = await api<{ day: AttendanceDay | null }>(`/api/attendance/${userId}/${date}/adjustment`, { method: 'DELETE', body: { reason: removeReason } });
      setRemoving(false);
      setRemoveReason('');
      changed(r.day);
    } catch (err) {
      setRemoveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal title={`${userName} · ${fmtDate(date)}`} onClose={onClose} wide>
        {day && (
          <div className="mb-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-400 block text-[11px]">Giờ vào</span>
                <span className={`font-mono text-sm font-bold ${day.lateMinutes > 0 ? 'text-rose-600' : day.firstIn !== null ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {fmtTime(day.firstIn)}
                  {day.lateMinutes > 0 && <span className="ml-1 text-[11px] font-sans font-medium text-rose-600">(muộn {day.lateMinutes}')</span>}
                </span>
              </div>
              <div className="border-l border-slate-200 pl-4">
                <span className="text-slate-400 block text-[11px]">{day.final ? 'Giờ ra' : 'Lần quẹt gần nhất'}</span>
                <span className={`font-mono text-sm font-bold ${!day.final ? 'text-slate-800' : day.earlyMinutes > 0 ? 'text-rose-600' : day.lastOut !== null ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {fmtTime(day.lastOut)}
                  {day.earlyMinutes > 0 && <span className="ml-1 text-[11px] font-sans font-medium text-rose-600">(sớm {day.earlyMinutes}')</span>}
                  {!day.final && day.lastOut !== null && <span className="ml-1 text-[11px] font-sans font-medium text-sky-700">(đang làm)</span>}
                </span>
              </div>
            </div>

            <div>
              {(() => {
                const st = getAttendanceStatusText(day);
                return (
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${st.style}`}>
                    {st.label}
                  </span>
                );
              })()}
            </div>
          </div>
        )}
        {day?.override && (
          <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
            <div className="font-semibold text-brand-800">Đã điều chỉnh: {OVERRIDE_KIND_LABEL[day.override.kind]}</div>
            <div className="text-slate-700 mt-0.5">{day.override.reason}</div>
            <div className="text-xs text-slate-500 mt-1">
              bởi {day.override.byName} lúc {fmtDateTime(day.override.at)}
            </div>
          </div>
        )}
        {canAdjust(currentUser, userId) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {locked ? (
              <span className="text-xs text-slate-500">Tháng này đã khóa sổ — không điều chỉnh được.</span>
            ) : (
              <>
                <button type="button" className={`${secondaryBtn} py-1.5`} onClick={() => setAdjusting(true)}>
                  Điều chỉnh
                </button>
                {day?.override && (
                  <button type="button" className={`${secondaryBtn} py-1.5 text-rose-600 hover:text-rose-700`} onClick={() => setRemoving(true)}>
                    Bỏ điều chỉnh
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {error && <p className="text-rose-600 mb-2">{error}</p>}
        {detections === null ? (
          <p className="text-slate-500">Đang tải...</p>
        ) : detections.length === 0 ? (
          <p className="text-slate-500">Không có lượt nhận diện{day ? ' (giờ công được bổ sung từ đơn hoặc điều chỉnh).' : '.'}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {detections.map((d) => (
              <div key={d.id} className="border border-slate-200 rounded-xl overflow-hidden">
                {d.imageUrl ? (
                  <img src={d.imageUrl} alt="" className="w-full aspect-square object-cover bg-slate-100" />
                ) : (
                  <div className="w-full aspect-square bg-slate-100 flex items-center justify-center text-slate-500">Không có ảnh</div>
                )}
                <div className="p-2">
                  <div className="font-mono font-semibold">{fmtTime(d.ts)}</div>
                  <div className="text-[11px] text-slate-500 truncate">{d.deviceName ?? d.deviceId}</div>
                  <div className="text-[11px] text-slate-500">{SOURCE_LABEL[d.source]}</div>
                  {d.hasVideo && (
                    <button
                      type="button"
                      onClick={() => setVideoOf(d)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline cursor-pointer"
                    >
                      <Video className="w-3 h-3" /> Xem video lúc này
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
      {videoOf && <VideoModal detection={videoOf} onClose={() => setVideoOf(null)} />}
      {adjusting && (
        <AdjustDayModal
          userId={userId}
          userName={userName}
          date={date}
          day={day}
          onClose={() => setAdjusting(false)}
          onSaved={(d) => {
            setAdjusting(false);
            changed(d);
          }}
        />
      )}
      {removing && (
        <Modal title="Bỏ điều chỉnh ngày công" onClose={() => setRemoving(false)}>
          <form onSubmit={remove} className="space-y-3.5">
            <p>Ngày công sẽ quay về giá trị tự tính từ camera và đơn từ.</p>
            <Field label="Lý do (bắt buộc)" hint={`${removeReason.trim().length}/500 ký tự, tối thiểu 5`}>
              <textarea rows={3} maxLength={500} className={inputCls} value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} required />
            </Field>
            {removeError && <p className="text-rose-600">{removeError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setRemoving(false)} className={`${secondaryBtn} flex-1`}>
                Hủy
              </button>
              <button type="submit" disabled={busy || removeReason.trim().length < 5} className={`${dangerBtn} flex-1`}>
                Bỏ điều chỉnh
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
};
