import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, type TestApp } from './helpers';

const row = (o: Partial<Record<string, string>>) => ({ code: '', name: 'Người A', email: 'a@test.vn', phone: '0912345678', departmentCode: 'PA', position: '', role: '', ...o });

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const ids = { A, B, pa: seedDepartment(app.db, 'PA', 'PA', A), pb: seedDepartment(app.db, 'PB', 'PB', B) };
  seedUser(app.db, { code: 'HR01', role: 'hr' });
  seedUser(app.db, { code: 'QKA', role: 'area_admin', adminAreaIds: [A] });
  seedUser(app.db, { code: 'NV0003', email: 'daco@test.vn' });
  return { app, ids };
}

test('xem trước: báo lỗi từng dòng, không tạo gì; mã tự sinh không trùng', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const rows = [
      row({ name: 'An', email: 'an@test.vn' }),
      row({ name: 'Bình', email: 'AN@test.vn' }), // trùng email trong file
      row({ name: '', email: 'c@test.vn' }),
      row({ name: 'Dũng', email: 'daco@test.vn' }), // trùng email đã có
      row({ name: 'Em', email: 'e@test.vn', phone: '123', departmentCode: 'KHONGCO', role: 'giam_doc' }),
      row({ name: 'Phúc', email: 'f@test.vn', code: 'nv0003' }), // trùng mã đã có
      row({ name: 'Giang', email: 'g@test.vn', code: 'admin' }),
      row({ name: 'Hà', email: 'h@test.vn', role: 'truong_phong' }),
    ];
    const r = await hr.post('/api/users/import-csv/preview', { rows });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = r.body.rows;
    assert.deepEqual(p.map((x: { ok: boolean }) => x.ok), [true, false, false, false, false, false, false, true]);
    assert.deepEqual(p.map((x: { line: number }) => x.line), [2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual([p[0].code, p[7].code], ['NV0004', 'NV0005']);
    assert.deepEqual(p[1].errors, ['Email trùng với dòng khác trong file']);
    assert.deepEqual(p[2].errors, ['Họ tên là bắt buộc']);
    assert.deepEqual(p[3].errors, ['Email đã được dùng cho nhân sự khác']);
    assert.deepEqual(p[4].errors, [
      'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0 hoặc +84)',
      'Mã phòng ban không tồn tại',
      'Vai trò chỉ được là nhan_vien hoặc truong_phong',
    ]);
    assert.deepEqual(p[5].errors, ['Mã nhân viên đã tồn tại']);
    assert.deepEqual(p[6].errors, ['Mã ADMIN dành riêng cho tài khoản quản trị hệ thống']);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM users WHERE email IN ('an@test.vn','h@test.vn')").get()!.c, 0, 'xem trước không tạo gì');
  } finally {
    await app.close();
  }
});

test('tạo: chỉ dòng hợp lệ, mỗi người một thư chào mừng, chưa đăng nhập được tới khi thư gửi', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/users/import-csv', { rows: [row({ email: 'x@test.vn' }), row({ name: '', email: 'y@test.vn' }), row({ email: 'z@test.vn', role: 'truong_phong' })] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.created.length, r.body.skipped], [2, 1]);
    const u = app.db.prepare("SELECT role, password_hash, email_status, phone FROM users WHERE email = 'z@test.vn'").get() as Record<string, unknown>;
    assert.deepEqual({ ...u }, { role: 'dept_manager', password_hash: null, email_status: 'pending', phone: '0912345678' });
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM email_jobs WHERE kind = 'welcome' AND status = 'pending'").get()!.c, 2);
    assert.equal((await hr.post('/api/users/import-csv', { rows: [row({ name: '' })] })).status, 400);
  } finally {
    await app.close();
  }
});

test('quản trị khu: chỉ dùng phòng trong khu; quá 200 dòng thì 400', async () => {
  const { app } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    const p = (await qk.post('/api/users/import-csv/preview', { rows: [row({ email: 'a1@test.vn' }), row({ email: 'b1@test.vn', departmentCode: 'PB' })] })).body.rows;
    assert.deepEqual([p[0].ok, p[1].ok, p[1].errors], [true, false, ['Mã phòng ban không tồn tại']]);
    const many = Array.from({ length: 201 }, (_, i) => row({ email: `u${i}@test.vn` }));
    const r = await qk.post('/api/users/import-csv/preview', { rows: many });
    assert.deepEqual([r.status, r.body.error], [400, 'Mỗi lần nhập tối đa 200 dòng']);
    assert.equal((await qk.post('/api/users/import-csv/preview', { rows: 'x' })).status, 400);
  } finally {
    await app.close();
  }
});
