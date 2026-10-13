import type { Request, Response, NextFunction, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function errorHandler(production: boolean) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
      return;
    }
    if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
      return;
    }
    console.error('[ERROR]', err);
    res.status(500).json({
      error: 'Lỗi hệ thống',
      ...(production ? {} : { detail: String((err as Error)?.stack ?? err) }),
    });
  };
}

/** Bọc handler async để lỗi được chuyển tới errorHandler (Express 4 không tự bắt promise). */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
