// src/area.ts
const KEY = 'hgc.area';

/** Khu đang chọn ở thanh trên cùng (nhớ theo trình duyệt). 'all' = tất cả; 'none' = chưa gán khu (chỉ HR toàn hệ thống). */
export function loadArea(): string {
  try {
    return window.localStorage.getItem(KEY) || 'all';
  } catch {
    return 'all';
  }
}

export function saveArea(v: string): void {
  try {
    window.localStorage.setItem(KEY, v);
  } catch {
    // trình duyệt chặn lưu trữ: chỉ không nhớ được lựa chọn
  }
}

/** Giá trị tham số ?area= cho API ('' = tất cả trong phạm vi). */
export function areaParam(area: string): string {
  return area === 'all' ? '' : area;
}
