import React, { useEffect, useRef, useState } from 'react';
import type { Detection, DetectionVideo } from '../types';
import { api, errorMessage } from '../api';
import { fmtTime } from '../format';
import { Modal, secondaryBtn } from './ui';

/** Phát đoạn video camera chứa lượt quẹt, tua đúng lúc quẹt; chuyển được sang đoạn trước/sau. */
export const VideoModal: React.FC<{ detection: Detection; onClose: () => void }> = ({ detection, onClose }) => {
  // at = null: đoạn chứa lượt quẹt (tua tới lúc quẹt); có giá trị: đoạn trước/sau (phát từ đầu)
  const [at, setAt] = useState<number | null>(null);
  const [video, setVideo] = useState<DetectionVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api<DetectionVideo>(`/api/detections/${detection.id}/video${at === null ? '' : `?at=${at}`}`)
      .then((v) => alive && setVideo(v))
      .catch((err) => {
        if (!alive) return;
        setVideo(null);
        setError(errorMessage(err));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [detection.id, at]);

  const onLoaded = () => {
    if (ref.current && video) ref.current.currentTime = at === null ? video.offsetSeconds : 0;
  };

  const camera = video?.deviceName ?? detection.deviceName ?? detection.deviceId;

  return (
    <Modal title={`Video · ${camera}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="w-full aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
          {video && !error ? (
            <video
              key={video.url}
              ref={ref}
              src={video.url}
              controls
              autoPlay
              playsInline
              onLoadedMetadata={onLoaded}
              onError={() => setError('Không phát được video, thử lại sau')}
              className="w-full h-full"
            />
          ) : (
            <span className="text-slate-300">{loading ? 'Đang tải video...' : 'Không có video'}</span>
          )}
        </div>
        {error && <p className="text-rose-600 bg-rose-50 rounded-xl p-2">{error}</p>}
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
          <button type="button" className={`${secondaryBtn} flex-1`} disabled={loading || !video} onClick={() => video && setAt(video.prevAt)}>
            ◀ Đoạn trước
          </button>
          <button type="button" className={`${secondaryBtn} flex-1`} disabled={loading || !video} onClick={() => video && setAt(video.nextAt)}>
            Đoạn sau ▶
          </button>
        </div>
        {at !== null && (
          <button type="button" className="text-[11px] text-blue-600 hover:underline cursor-pointer" onClick={() => setAt(null)} disabled={loading}>
            Về đoạn có lượt quẹt
          </button>
        )}
      </div>
    </Modal>
  );
};
