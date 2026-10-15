import React from 'react';
import type { DayOverride } from '../types';
import { fmtDateTime, OVERRIDE_KIND_LABEL } from '../format';

export const OverrideBadge: React.FC<{ override: DayOverride }> = ({ override }) => (
  <span
    className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 whitespace-nowrap"
    title={`${OVERRIDE_KIND_LABEL[override.kind]} bởi ${override.byName} lúc ${fmtDateTime(override.at)}: ${override.reason}`}
  >
    Đã điều chỉnh
  </span>
);
