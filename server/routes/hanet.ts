import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError, ah } from '../errors';
import { currentUser, requireRole } from '../middleware';
import { getUser, type Row } from '../repo';
import { safeEqualStrings } from '../auth';
import {
  getHanetConfigView, getWebhookToken, ingestCheckin, logWebhook, parseCheckin, rotateWebhookToken, updateHanetConfig,
  reconcileEnabled, getPlaceIds, parseStranger, STRANGER_MESSAGE, UNMATCHED_MESSAGE, type CheckinInput, type IngestResult,
} from '../hanet';
import { hanetApi, reconcileDate } from '../hanet-api';
import { getSetting } from '../settings';
import { isValidDate, toVnDate, vnDateTimeToTs } from '../vntime';
import { fetchAllPersons, unlinkedPersons } from '../hanet-import';
import { listSightings, recordSighting } from '../sightings';
import { kickAll, retryJobs, syncSummary } from '../hanet-sync';
import type { HanetConnectionTest, SightingKind, SyncEntity, WebhookLog } from '../../shared/types';

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
      const stranger = parseStranger(req.body, now);
      if (stranger) {
        recordSighting(db, { kind: 'stranger', personId: null, aliasId: null, personName: null, ...stranger }, now);
        logWebhook(db, { status: 'ignored', deviceName: stranger.deviceName, message: STRANGER_MESSAGE, rawPayload: req.body }, now);
      } else {
        logWebhook(db, { status: 'ignored', message: 'Không phải sự kiện nhận diện', rawPayload: req.body }, now);
      }
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
    if (result.status === 'ignored' && result.message === UNMATCHED_MESSAGE && parsed.input.imageUrl) {
      const i = parsed.input;
      recordSighting(
        db,
        { kind: 'unlinked', personId: i.personId, aliasId: i.aliasId, personName: i.personName, deviceId: i.deviceId, deviceName: i.deviceName, ts: i.ts, imageUrl: i.imageUrl as string },
        now,
      );
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
    kickAll(ctx);
    res.json({ config: getHanetConfigView(db) });
  });

  r.post(
    '/hanet/test-connection',
    hr,
    ah(async (_req, res) => {
      const fail = (message: string): HanetConnectionTest => ({ ok: false, account: null, places: [], message });
      if (!getSetting(db, 'hanet.client_id') || !(getSetting(db, 'hanet.refresh_token') || getSetting(db, 'hanet.access_token'))) {
        res.json(fail('Chưa nhập Client ID và Refresh Token (hoặc Access Token)'));
        return;
      }
      const deps = { db, fetch: ctx.fetch, now: ctx.now };
      try {
        const account = await hanetApi.getProfile(deps);
        const places = await hanetApi.getPlaces(deps);
        const body: HanetConnectionTest = {
          ok: true,
          account,
          places,
          message: `Đã kết nối tài khoản ${account.name || account.email}, ${places.length} địa điểm`,
        };
        res.json(body);
      } catch (err) {
        res.json(fail((err as Error).message));
      }
    }),
  );

  r.post('/hanet/webhook-token/rotate', hr, (req, res) => {
    rotateWebhookToken(db);
    console.warn(`[SECURITY] webhook_token_rotated by=${currentUser(req).code} ip=${req.ip}`);
    res.json({ config: getHanetConfigView(db) });
  });

  r.get('/hanet/sightings', hr, (req, res) => {
    const kind = req.query.kind;
    if (kind !== undefined && kind !== 'stranger' && kind !== 'unlinked') throw new HttpError(400, 'Loại lượt chụp không hợp lệ');
    res.json({ sightings: listSightings(db, ctx.now(), kind as SightingKind | undefined) });
  });

  r.get(
    '/hanet/persons/unlinked',
    hr,
    ah(async (_req, res) => {
      const placeId = getPlaceIds(db)[0];
      if (!reconcileEnabled(db) || !placeId) throw new HttpError(400, 'Chưa cấu hình kết nối Hanet (Client ID, Refresh Token, địa điểm)');
      let persons;
      try {
        persons = await fetchAllPersons({ db, fetch: ctx.fetch, now: ctx.now }, placeId);
      } catch (err) {
        throw new HttpError(502, `Không lấy được danh sách người từ Hanet: ${(err as Error).message}`);
      }
      res.json({ persons: unlinkedPersons(db, persons) });
    }),
  );

  r.get('/hanet/sync', hr, (_req, res) => {
    res.json(syncSummary(db));
  });

  r.post('/hanet/sync/retry', hr, (req, res) => {
    const b = req.body ?? {};
    const filter: { jobId?: number; entityType?: SyncEntity; entityId?: string } = {};
    if (b.jobId !== undefined) {
      if (!Number.isInteger(Number(b.jobId))) throw new HttpError(400, 'Mã việc không hợp lệ');
      filter.jobId = Number(b.jobId);
    }
    if (b.entityType !== undefined || b.entityId !== undefined) {
      if (!['user', 'department', 'camera'].includes(b.entityType) || typeof b.entityId !== 'string') throw new HttpError(400, 'Đối tượng không hợp lệ');
      filter.entityType = b.entityType;
      filter.entityId = b.entityId;
    }
    retryJobs(db, filter, ctx.now());
    kickAll(ctx);
    res.json(syncSummary(db));
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
