import React from 'react';
import type { MeResponse } from '../types';

/** Bộ chọn khu: HR toàn hệ thống luôn thấy; quản trị khu thấy khi được giao từ 2 khu. */
export const AreaSelect: React.FC<{ me: MeResponse; value: string; onChange: (v: string) => void }> = ({ me, value, onChange }) => {
  const isHr = me.user.role === 'hr';
  if (!isHr && !(me.user.role === 'area_admin' && me.areas.length >= 2)) return null;
  return (
    <select
      aria-label="Khu vực"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 text-xs bg-white cursor-pointer max-w-[100px] xs:max-w-[130px] sm:max-w-[180px] truncate shrink-0"
    >
      <option value="all">{isHr ? 'Tất cả khu vực' : 'Tất cả khu của tôi'}</option>
      {me.areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
      {isHr && <option value="none">Chưa gán khu</option>}
    </select>
  );
};
