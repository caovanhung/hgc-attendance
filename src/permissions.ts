// src/permissions.ts
import type { User, UserRole } from './types';
import { SYSTEM_ADMIN_CODE } from './format';

export const isManagerRole = (u: User): boolean => u.role === 'hr' || u.role === 'area_admin';

/** Giống canDeleteUser ở server (spec mục 5) để ẩn/hiện nút; server vẫn kiểm tra lại. */
export function canDeleteUserUi(me: User, isSystemAdmin: boolean, t: User): boolean {
  if (t.id === me.id || t.code === SYSTEM_ADMIN_CODE) return false;
  if (isSystemAdmin) return true;
  if (t.role === 'hr') return false;
  if (me.role === 'hr') return true;
  return me.role === 'area_admin' && (t.role === 'employee' || t.role === 'dept_manager') && t.areaId !== null && me.adminAreaIds.includes(t.areaId);
}

/** Vai trò người đang đăng nhập được gán cho người khác. */
export function assignableRoles(me: User, isSystemAdmin: boolean): UserRole[] {
  if (isSystemAdmin) return ['hr', 'area_admin', 'dept_manager', 'employee'];
  if (me.role === 'hr') return ['area_admin', 'dept_manager', 'employee'];
  return ['dept_manager', 'employee'];
}
