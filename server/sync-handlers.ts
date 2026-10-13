import type { SyncHandlers } from './hanet-sync';
import { hanetApi } from './hanet-api';

/** Xử lý từng thao tác đồng bộ sang Hanet. Task sau thêm handler vào object này. */
export const SYNC_HANDLERS: SyncHandlers = {
  'camera.rename': async (deps, job) => {
    await hanetApi.updateDevice(deps, String(job.payload.deviceId), String(job.payload.name));
  },
};
