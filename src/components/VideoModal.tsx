import React, { useEffect, useRef, useState } from 'react';
import type { Detection, DetectionVideo } from '../types';
import { api, errorMessage } from '../api';
import { fmtTime } from '../format';
import { Modal, secondaryBtn } from './ui';

/** Phát đoạn video camera chứa lượt quẹt, tua đúng lúc quẹt; chuyển được sang đoạn trước/sau. */
export const VideoModal: React.FC<{ detection: Detection; onClose: () => void }> = ({ detection, onClose }) => {
  // at = null: đoạn chứa lượt quẹt (tua tới lúc quẹt); có giá trị: đoạn trước/sau (phát từ đầu)
  // seq tăng mỗi lần bấm: bấm lại cùng đoạn sau khi lỗi vẫn gửi lại request
  const [req, setReq] = useState<{ at: number | null; seq: number }>({ at: null, seq: 0 });
  const at = req.at;
  const go = (next: number | null) => setReq((r) => ({ at: next, seq: r.seq + 1 }));
  // Đoạn đang phát + vị trí tua + số lần tải (làm key cho <video>: Hanet trả trùng URL vẫn tua lại)
  const [clip, setClip] = useState<{ video: DetectionVideo; at: number | null; seek: number; n: number } | null>(null);
  const video = clip?.video ?? null;
  const [playError, setPlayError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api<DetectionVideo>(`/api/detections/${detection.id}/video${at === null ? '' : `?at=${at}`}`)
      .then((v) => {
        if (!alive) return;
        setPlayError(null);
        setClip((c) => ({ video: v, at, seek: at === null ? v.offsetSeconds : 0, n: (c?.n ?? 0) + 1 }));
      })
      .catch((err) => {
        // Giữ đoạn đang phát (và nút đoạn trước/sau), chỉ báo lỗi
        if (alive) setError(errorMessage(err));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [detection.id, at, req.seq]);

  const onLoaded = () => {
    if (ref.current && clip) ref.current.currentTime = clip.seek;
  };

  const camera = video?.deviceName ?? detection.deviceName ?? detection.deviceId;

  return (
    <Modal title={`Video · ${camera}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="w-full aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
          {clip && !playError ? (
            <video
              key={clip.n}
              ref={ref}
              src={clip.video.url}
              controls
              autoPlay
              playsInline
              onLoadedMetadata={onLoaded}
              onError={() => setPlayError('Không phát được video, thử lại sau')}
              className="w-full h-full"
            />
          ) : (
            <span className="text-slate-300">{loading ? 'Đang tải video...' : 'Không có video'}</span>
          )}
        </div>
        {(error ?? playError) && <p className="text-rose-600 bg-rose-50 rounded-xl p-2">{error ?? playError}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
          <span>
            Camera: <strong>{camera}</strong>
          </span>
          {video && (
            <span>
              Đoạn ghi: <strong className="font-mono">{fmtTime(video.startTs)}</strong> – <strong className="font-mono">{fmtTime(video.startTs + video.duration * 1000)}</strong>
            </span>
          )}
          <span>
            Giờ quẹt: <strong className="font-mono">{fmtTime(detection.ts)}</strong>
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" className={`${secondaryBtn} flex-1`} disabled={loading || !video} onClick={() => video && go(video.prevAt)}>
            ◀ Đoạn trước
          </button>
          <button type="button" className={`${secondaryBtn} flex-1`} disabled={loading || !video} onClick={() => video && go(video.nextAt)}>
            Đoạn sau ▶
          </button>
        </div>
        {(at !== null || (clip !== null && clip.at !== null)) && (
          <button type="button" className="text-[11px] text-blue-600 hover:underline cursor-pointer" onClick={() => go(null)} disabled={loading}>
            Về đoạn có lượt quẹt
          </button>
        )}
      </div>
    </Modal>
  );
};
