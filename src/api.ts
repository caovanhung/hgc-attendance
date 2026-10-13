export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const AUTH_EVENT = 'hgc:auth';
export type AuthEventDetail = 'logged-out' | 'must-change-password';

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, data?.error ?? `Lỗi ${res.status}`, data?.code);
    if (res.status === 401 && path !== '/api/auth/login') {
      window.dispatchEvent(new CustomEvent<AuthEventDetail>(AUTH_EVENT, { detail: 'logged-out' }));
    }
    if (err.code === 'MUST_CHANGE_PASSWORD') {
      window.dispatchEvent(new CustomEvent<AuthEventDetail>(AUTH_EVENT, { detail: 'must-change-password' }));
    }
    throw err;
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
}
