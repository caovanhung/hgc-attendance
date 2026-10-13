import express from 'express';
import type { AppContext } from './context';
import { errorHandler, HttpError } from './errors';
import { jsonOnly, mustChangeGate, requireAuth } from './middleware';
import { authPublicRoutes, authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { departmentRoutes } from './routes/departments';
import { cameraRoutes } from './routes/cameras';
import { attendanceRoutes } from './routes/attendance';
import { settingsRoutes } from './routes/settings';
import { requestRoutes } from './routes/requests';
import { hanetPublicRoutes, hanetRoutes } from './routes/hanet';
import { adminRoutes } from './routes/admin';

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (ctx.config.trustProxy) app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    try {
      ctx.db.prepare('SELECT 1').get();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Route không cần đăng nhập
  app.use('/api', authPublicRoutes(ctx));
  app.use('/api', hanetPublicRoutes(ctx));

  // Route cần đăng nhập
  const api = express.Router();
  api.use(requireAuth(ctx), mustChangeGate, jsonOnly);
  api.use(authRoutes(ctx));
  api.use(userRoutes(ctx));
  api.use(departmentRoutes(ctx));
  api.use(cameraRoutes(ctx));
  api.use(attendanceRoutes(ctx));
  api.use(settingsRoutes(ctx));
  api.use(requestRoutes(ctx));
  api.use(hanetRoutes(ctx));
  api.use(adminRoutes(ctx));
  app.use('/api', api);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Không tìm thấy')));
  app.use(errorHandler(ctx.config.production));
  return app;
}
