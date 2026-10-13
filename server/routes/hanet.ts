import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError, ah } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { getUser, type Row } from '../repo';
import { safeEqualStrings } from '../auth';
import {
  getHanetConfigView, getWebhookToken, ingestCheckin, logWebhook, parseCheckin, rotateWebhookToken, updateHanetConfig,
  reconcileEnabled, recentUnmatchedFaces, type CheckinInput, type IngestResult,
} from '../hanet';
import { reconcileDate } from '../hanet-api';
import { isValidDate, toVnDate, vnDateTimeToTs } from '../vntime';
import type { WebhookLog } from '../../shared/types';

export function hanetPublicRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.post('/hanet/webhook/:token', (req, res) => {
    const now = ctx.now();
    if (!safeEqualStrings(req.params.token, getWebhookToken(db))) {
      console.warn(`[SECURITY] webhook_bad_token ip=${req.ip}`);
      logWebhook(db, { status: 'rejected', message: 'Sai token webhook' }, now);
      res.status(401).json({ returnCode: -1, returnMessage: 'Unauthorized' });
      return;
    }
    const parsed = parseCheckin(req.body, now);
    if (!parsed) {
      logWebhook(db, { status: 'ignored', message: 'Không phải sự kiện nhận diện', rawPayload: req.body }, now);
      res.json({ returnCode: 1, returnMessage: 'ignored' });
      return;
    }
    let result: IngestResult;
    try {
      result = ingestCheckin(db, parsed.input, 'webhook');
    } catch (err) {
      console.error('[WEBHOOK] Lỗi ghi lượt nhận diện:', err);
      try {
        logWebhook(db, { status: 'error', message: (err as Error).message, rawPayload: req.body }, now);
      } catch {
        // DB lỗi thì bỏ qua log; đối soát sẽ bù lượt này
      }
      res.status(500).json({ returnCode: -503, returnMessage: 'Lỗi lưu dữ liệu' });
      return;
    }
    logWebhook(
      db,
      {
        status: result.status,
        personName: parsed.input.personName,
        deviceName: parsed.input.deviceName,
        message: [result.message, parsed.note].filter(Boolean).join('; '),
        rawPayload: req.body,
      },
      now,
    );
    res.json({ returnCode: 1, returnMessage: result.status });
  });

  r.all('/hanet/webhook', (_req, res) => {
    res.status(404).json({ error: 'Không tìm thấy' });
  });

  return r;
}

export function hanetRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();
  const hr = requireRole('hr');

  r.get('/hanet/config', hr, (_req, res) => {
    res.json({ config: getHanetConfigView(db) });
  });

  r.put('/hanet/config', hr, (req, res) => {
    updateHanetConfig(db, req.body);
    res.json({ config: getHanetConfigView(db) });
  });

  r.post('/hanet/webhook-token/rotate', hr, (req, res) => {
    rotateWebhookToken(db);
    console.warn(`[SECURITY] webhook_token_rotated by=${currentUser(req).code} ip=${req.ip}`);
    res.json({ config: getHanetConfigView(db) });
  });

  r.get('/hanet/recent-faces', hr, (_req, res) => {
    res.json({ faces: recentUnmatchedFaces(db, ctx.now()) });
  });

  r.get('/hanet/webhook-logs', hr, (_req, res) => {
    const rows = db.prepare('SELECT * FROM webhook_logs ORDER BY id DESC LIMIT 200').all() as Row[];
    const logs: WebhookLog[] = rows.map((x) => {
      let rawPayload: unknown = null;
      try {
        rawPayload = x.raw_payload ? JSON.parse(x.raw_payload) : null;
      } catch {
        rawPayload = x.raw_payload;
      }
      return { id: x.id, receivedAt: x.received_at, status: x.status, personName: x.person_name ?? null, deviceName: x.device_name ?? null, message: x.message ?? null, rawPayload };
    });
    res.json({ logs });
  });

  r.post('/hanet/simulate', hr, (req, res) => {
    if (!ctx.config.simulatorEnabled) throw new HttpError(404, 'Không tìm thấy');
    const b = req.body ?? {};
    const target = typeof b.userId === 'string' ? getUser(db, b.userId) : null;
    if (!target) throw new HttpError(404, 'Không tìm thấy nhân viên');
    const now = ctx.now();
    let ts = now;
    if (b.time !== undefined && b.time !== '') {
      const date = typeof b.date === 'string' && b.date ? b.date : toVnDate(now);
      if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
      try {
        ts = vnDateTimeToTs(date, String(b.time));
      } catch {
        throw new HttpError(400, 'Giờ không hợp lệ (định dạng HH:mm)');
      }
    }
    const input: CheckinInput = {
      personId: target.hanetPersonId,
      aliasId: target.code,
      personName: target.name,
      personType: 0,
      deviceId: typeof b.deviceId === 'string' && b.deviceId.trim() ? b.deviceId.trim() : 'SIMULATOR',
      deviceName: 'Mô phỏng',
      placeId: null,
      ts,
      imageUrl: target.avatarUrl || null,
    };
    const result = ingestCheckin(db, input, 'simulator');
    logWebhook(db, { status: result.status, personName: target.name, deviceName: 'Mô phỏng', message: `[Mô phỏng] ${result.message}` }, now);
    res.json({ result });
  });

  r.post(
    '/hanet/reconcile',
    hr,
    ah(async (req, res) => {
      if (!reconcileEnabled(db)) throw new HttpError(400, 'Chưa cấu hình đủ Client ID, token và Place ID để đối soát');
      const date = typeof req.body?.date === 'string' && req.body.date ? req.body.date : toVnDate(ctx.now());
      if (!isValidDate(date)) throw new HttpError(400, 'Ngày không hợp lệ (định dạng YYYY-MM-DD)');
      try {
        const summary = await reconcileDate({ db, fetch: ctx.fetch, now: ctx.now }, date);
        res.json({ summary, config: getHanetConfigView(db) });
      } catch (err) {
        throw new HttpError(502, `Đối soát thất bại: ${(err as Error).message}`);
      }
    }),
  );

  return r;
}
