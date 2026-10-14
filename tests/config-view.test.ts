import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, loginAs } from './helpers';

test('GET /hanet/config: HR toàn hệ thống không thấy token webhook đầy đủ; ADMIN thấy', async () => {
  const app = await startTestApp();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    seedUser(app.db, { code: 'HR01', role: 'hr' });
    const full = (await (await loginAs(app, 'ADMIN')).get('/api/hanet/config')).body.config.webhookPath as string;
    const masked = (await (await loginAs(app, 'HR01')).get('/api/hanet/config')).body.config.webhookPath as string;
    assert.match(full, /^\/api\/hanet\/webhook\/[A-Za-z0-9_-]{20,}$/);
    assert.equal(masked, `/api/hanet/webhook/••••${full.slice(-4)}`);
  } finally {
    await app.close();
  }
});
