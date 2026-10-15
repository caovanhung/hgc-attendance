import { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError, ah } from '../errors';
import { currentUser, requireSystemAdmin } from '../middleware';
import { getUser, type Row } from '../repo';
import { safeEqualStrings, type AuthUser } from '../auth';
import type { Db } from '../db';
import { deptAreaId, deviceAreaId, isGlobalHr, isSystemAdmin, managesArea, notFound, requireGlobalHr, requireManager } from '../access';
import {
  getHanetConfigView, getWebhookToken, ingestCheckin, logWebhook, parseCheckin, rotateWebhookToken, updateHanetConfig,
  reconcileEnabled, parseStranger, STRANGER_MESSAGE, UNMATCHED_MESSAGE, type CheckinInput, type IngestResult,
} from '../hanet';
import { hanetApi, reconcileDate } from '../hanet-api';
import { getSetting } from '../settings';
import { getConnectConfig, saveConnectConfig, testConnectLogin } from '../hanet-connect';
import { isValidDate, toVnDate, vnDateTimeToTs } from '../vntime';
import { fetchPersonsAllPlaces, unlinkedPersons } from '../hanet-import';
import { tx } from '../db';
import { actorOf, writeAudit } from '../audit';
import { parseReason } from '../overrides';
import { deleteSightingsOfPerson, listSightings, recordSighting } from '../sightings';
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

/** Đối tượng đồng bộ thuộc phạm vi người gọi (HR toàn hệ thống: mọi đối tượng). */
function syncEntityInScope(db: Db, actor: AuthUser, type: SyncEntity, id: string): boolean {
  if (isGlobalHr(actor)) return true;
  if (type === 'user') {
    const u = getUser(db, id);
    return Boolean(u) && managesArea(actor, u!.areaId);
  }
  if (type === 'department') {
    const area = deptAreaId(db, id);
    return area !== undefined && managesArea(actor, area);
  }
  const cam = db.prepare('SELECT area_id FROM cameras WHERE id = ?').get(id) as { area_id: string | null } | undefined;
  return Boolean(cam) && managesArea(actor, cam!.area_id);
}

export function hanetRoutes(ctx: AppContext): Router {
  const { db } = ctx;
  const r = Router();

  r.get('/hanet/config', requireGlobalHr, (req, res) => {
    const config = getHanetConfigView(db);
    // Token webhook là bí mật: chỉ ADMIN thấy đầy đủ
    if (!isSystemAdmin(currentUser(req))) config.webhookPath = config.webhookPath.replace(/[^/]+$/, (t) => `••••${t.slice(-4)}`);
    res.json({ config });
  });

  r.put('/hanet/config', requireSystemAdmin, (req, res) => {
    updateHanetConfig(db, req.body);
    kickAll(ctx);
    res.json({ config: getHanetConfigView(db) });
  });

  r.post(
    '/hanet/test-connection',
    requireSystemAdmin,
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

  r.get('/hanet/connect', requireGlobalHr, (_req, res) => {
    res.json(getConnectConfig(db));
  });

  r.put('/hanet/connect', requireSystemAdmin, (req, res) => {
    const b = req.body ?? {};
    res.json(saveConnectConfig(db, { email: b.email, password: b.password }));
  });

  r.post(
    '/hanet/connect/test',
    requireSystemAdmin,
    ah(async (_req, res) => {
      res.json(await testConnectLogin({ db, fetch: ctx.fetch, now: ctx.now }));
    }),
  );

  r.post('/hanet/webhook-token/rotate', requireSystemAdmin, (req, res) => {
    rotateWebhookToken(db);
    console.warn(`[SECURITY] webhook_token_rotated by=${currentUser(req).code} ip=${req.ip}`);
    res.json({ config: getHanetConfigView(db) });
  });

  r.get('/hanet/sightings', requireManager, (req, res) => {
    const actor = currentUser(req);
    const kind = req.query.kind;
    if (kind !== undefined && kind !== 'stranger' && kind !== 'unlinked') throw new HttpError(400, 'Loại lượt chụp không hợp lệ');
    const all = listSightings(db, ctx.now(), kind as SightingKind | undefined);
    // Quản trị khu chỉ thấy ảnh chụp từ camera thuộc khu mình
    const sightings = isGlobalHr(actor) ? all : all.filter((s) => managesArea(actor, deviceAreaId(db, s.deviceId)));
    res.json({ sightings });
  });

  r.get(
    '/hanet/persons/unlinked',
    requireManager,
    ah(async (_req, res) => {
      res.json({ persons: unlinkedPersons(db, await cameraPersons()) });
    }),
  );

  /** Mọi người (nhân viên) trên Camera AI ở các địa điểm đã chọn; chưa cấu hình ⇒ 400, Camera AI lỗi ⇒ 502. */
  const cameraPersons = async () => {
    if (!reconcileEnabled(db)) throw new HttpError(400, 'Chưa cấu hình kết nối Camera AI (Client ID, Refresh Token, địa điểm)');
    try {
      return await fetchPersonsAllPlaces({ db, fetch: ctx.fetch, now: ctx.now });
    } catch (err) {
      throw new HttpError(502, `Không lấy được danh sách người từ Camera AI: ${(err as Error).message}`);
    }
  };

  /** Xóa FaceID chưa liên kết với nhân sự nào (chỉ HR toàn hệ thống; bắt buộc lý do; ghi nhật ký). */
  r.delete(
    '/hanet/persons/:personId',
    requireGlobalHr,
    ah(async (req, res) => {
      const reason = parseReason((req.body ?? {}).reason);
      const all = await cameraPersons();
      const p = all.find((x) => String(x.personID) === req.params.personId);
      if (!p) throw notFound('người này trên Camera AI');
      if (unlinkedPersons(db, [p]).length === 0) {
        throw new HttpError(400, 'Người này đã liên kết với một nhân sự: hãy xóa nhân sự đó ở tab Nhân sự');
      }
      try {
        await hanetApi.removeById({ db, fetch: ctx.fetch, now: ctx.now }, String(p.personID));
      } catch (err) {
        throw new HttpError(502, `Không xóa được FaceID trên Camera AI: ${(err as Error).message}`);
      }
      const snapshot = { personId: String(p.personID), aliasId: String(p.aliasID ?? ''), name: String(p.name ?? '') };
      tx(db, () => {
        deleteSightingsOfPerson(db, snapshot.personId);
        writeAudit(db, ctx.now(), {
          ...actorOf(req),
          action: 'face.delete',
          targetLabel: `${snapshot.name || '(không tên)'}${snapshot.aliasId ? ` (${snapshot.aliasId})` : ''}`,
          before: snapshot,
          after: null,
          reason,
        });
      });
      res.json({ success: true });
    }),
  );

  r.get('/hanet/sync', requireGlobalHr, (_req, res) => {
    res.json(syncSummary(db));
  });

  r.post('/hanet/sync/retry', requireManager, (req, res) => {
    const actor = currentUser(req);
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
    if (filter.entityType === undefined) {
      // Đồng bộ lại toàn bộ hoặc theo mã việc: thao tác cấu hình, chỉ ADMIN
      if (!isSystemAdmin(actor)) throw new HttpError(403, 'Chỉ tài khoản ADMIN được đồng bộ lại toàn bộ');
    } else if (!syncEntityInScope(db, actor, filter.entityType, filter.entityId!)) {
      throw notFound('đối tượng');
    }
    retryJobs(db, filter, ctx.now());
    kickAll(ctx);
    res.json(isGlobalHr(actor) ? syncSummary(db) : { success: true });
  });

  r.get('/hanet/webhook-logs', requireGlobalHr, (_req, res) => {
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

  r.post('/hanet/simulate', requireGlobalHr, (req, res) => {
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
    requireSystemAdmin,
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
