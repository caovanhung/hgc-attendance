import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedArea, seedDepartment, seedUser, loginAs, type TestApp } from './helpers';

async function setup(): Promise<{ app: TestApp; ids: Record<string, string> }> {
  const app = await startTestApp();
  const A = seedArea(app.db, 'KV01');
  const B = seedArea(app.db, 'KV02');
  const pa = seedDepartment(app.db, 'PA', 'Phòng A', A);
  const pb = seedDepartment(app.db, 'PB', 'Phòng B', B);
  const ids: Record<string, string> = {
    A, B, pa, pb,
    admin: seedUser(app.db, { code: 'ADMIN', role: 'hr' }),
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    hr2: seedUser(app.db, { code: 'HR02', role: 'hr', departmentId: pa }),
    qkA: seedUser(app.db, { code: 'QKA', role: 'area_admin', departmentId: pa, adminAreaIds: [A] }),
    qkA2: seedUser(app.db, { code: 'QKA2', role: 'area_admin', departmentId: pa, adminAreaIds: [A] }),
    nvA: seedUser(app.db, { code: 'NVA', departmentId: pa }),
    nvB: seedUser(app.db, { code: 'NVB', departmentId: pb }),
  };
  app.db.prepare("INSERT INTO cameras(id, name, device_key, area_id, created_at) VALUES ('camA', 'Cổng A', 'DEVA', ?, 'x'), ('camB', 'Cổng B', 'DEVB', ?, 'x')").run(A, B);
  return { app, ids };
}

const deptOf = (app: TestApp, id: string) => (app.db.prepare('SELECT department_id, role FROM users WHERE id = ?').get(id) as { department_id: string; role: string });

test('quản trị khu tạo nhân sự: chỉ phòng trong khu, bắt buộc phòng ban, không cấp HR/quản trị khu', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.post('/api/users', { code: 'NV10', name: 'X', departmentId: ids.pa })).status, 200);
    assert.equal((await qk.post('/api/users', { code: 'NV11', name: 'X', departmentId: ids.pb })).status, 404);
    assert.equal((await qk.post('/api/users', { code: 'NV12', name: 'X' })).status, 400);
    assert.equal((await qk.post('/api/users', { code: 'NV13', name: 'X', departmentId: ids.pa, role: 'hr' })).status, 403);
    assert.equal((await qk.post('/api/users', { code: 'NV14', name: 'X', departmentId: ids.pa, role: 'area_admin', adminAreaIds: [ids.A] })).status, 403);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM users WHERE code IN ('NV11','NV12','NV13','NV14')").get()!.c, 0);
  } finally {
    await app.close();
  }
});

test('quản trị khu sửa nhân sự: ngoài khu 404; không chuyển ra khỏi khu; không nâng vai trò; không sửa quản trị khu khác', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.put(`/api/users/${ids.nvB}`, { name: 'Y' })).status, 404);
    assert.equal((await qk.put(`/api/users/${ids.nvA}`, { departmentId: ids.pb })).status, 404);
    assert.equal(deptOf(app, ids.nvA).department_id, ids.pa, 'không đổi');
    assert.equal((await qk.put(`/api/users/${ids.nvA}`, { role: 'hr' })).status, 403);
    assert.equal((await qk.put(`/api/users/${ids.nvA}`, { role: 'area_admin', adminAreaIds: [ids.A] })).status, 403);
    assert.equal(deptOf(app, ids.nvA).role, 'employee');
    assert.equal((await qk.put(`/api/users/${ids.qkA2}`, { name: 'Y' })).status, 403);
    assert.equal((await qk.put(`/api/users/${ids.hr2}`, { name: 'Y' })).status, 403);
    assert.equal((await qk.put(`/api/users/${ids.nvA}`, { name: 'Tên mới', role: 'dept_manager' })).status, 200);
    // tự sửa: được đổi tên, không đổi phòng ban
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { name: 'Tôi' })).status, 200);
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { departmentId: ids.pb })).status, 400);
    assert.equal((await qk.post(`/api/users/${ids.nvB}/reset-password`)).status, 404);
    assert.equal((await qk.get(`/api/users/${ids.nvB}/face-candidates`)).status, 404);
  } finally {
    await app.close();
  }
});

test('cấp quyền quản trị khu: chỉ HR toàn hệ thống; vai trò HR chỉ ADMIN cấp; đổi vai trò thì bỏ khu được giao', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { role: 'area_admin' })).status, 400, 'thiếu khu');
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { role: 'area_admin', adminAreaIds: ['khong-co'] })).status, 400);
    const r = await hr.put(`/api/users/${ids.nvA}`, { role: 'area_admin', adminAreaIds: [ids.A, ids.B] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.user.adminAreaIds, [ids.A, ids.B].sort());
    const back = await hr.put(`/api/users/${ids.nvA}`, { role: 'employee' });
    assert.deepEqual(back.body.user.adminAreaIds, []);
    assert.equal((await hr.put(`/api/users/${ids.nvA}`, { role: 'hr' })).status, 403);
    assert.equal((await hr.put(`/api/users/${ids.hr2}`, { name: 'Y' })).status, 403, 'chỉ ADMIN sửa HR');
    const admin = await loginAs(app, 'ADMIN');
    assert.equal((await admin.put(`/api/users/${ids.nvA}`, { role: 'hr' })).status, 200);
    assert.equal((await admin.put(`/api/users/${ids.hr2}`, { name: 'Y' })).status, 200);
  } finally {
    await app.close();
  }
});

test('xóa nhân sự theo bảng của spec', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.del(`/api/users/${ids.nvB}`)).status, 404);
    assert.equal((await qk.del(`/api/users/${ids.qkA2}`)).status, 403);
    assert.equal((await qk.del(`/api/users/${ids.hr2}`)).status, 403);
    assert.equal((await qk.del(`/api/users/${ids.nvA}`)).status, 200);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.del(`/api/users/${ids.hr2}`)).status, 403);
    assert.equal((await hr.del(`/api/users/${ids.admin}`)).status, 404);
    assert.equal((await hr.del(`/api/users/${ids.qkA2}`)).status, 200);
    assert.equal((await hr.del(`/api/users/${ids.nvB}`)).status, 200);
    const admin = await loginAs(app, 'ADMIN');
    assert.equal((await admin.del(`/api/users/${ids.hr2}`)).status, 200);
  } finally {
    await app.close();
  }
});

test('phòng ban: quản trị khu tạo/sửa/xóa trong khu; không tạo ngoài khu, không chuyển ra ngoài khu', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.post('/api/departments', { name: 'X' })).status, 400);
    assert.equal((await qk.post('/api/departments', { name: 'X', areaId: ids.B })).status, 404);
    const c = await qk.post('/api/departments', { name: 'Phòng mới', areaId: ids.A });
    assert.equal(c.status, 200);
    assert.equal(c.body.department.areaId, ids.A);
    assert.equal((await qk.put(`/api/departments/${ids.pb}`, { name: 'Y' })).status, 404);
    assert.equal((await qk.put(`/api/departments/${ids.pa}`, { areaId: ids.B })).status, 404);
    assert.equal((await qk.put(`/api/departments/${ids.pa}`, { areaId: null })).status, 400);
    assert.equal((await qk.put(`/api/departments/${ids.pa}`, { managerId: ids.nvB })).status, 404);
    assert.equal((await qk.del(`/api/departments/${ids.pb}`)).status, 404);
    assert.equal((await qk.del(`/api/departments/${c.body.department.id}`)).status, 200);
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { areaId: ids.B })).status, 200);
    assert.equal((await hr.put(`/api/departments/${ids.pa}`, { areaId: null })).status, 200, 'HR được bỏ gán khu');
    assert.equal((await hr.del(`/api/departments/${ids.pb}`)).status, 200);
  } finally {
    await app.close();
  }
});

test('camera: quản trị khu sửa/xóa camera trong khu; thêm tay, nhập, làm mới chỉ HR toàn hệ thống', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.put('/api/cameras/camB', { name: 'Y' })).status, 404);
    assert.equal((await qk.put('/api/cameras/camA', { areaId: ids.B })).status, 404);
    const r = await qk.put('/api/cameras/camA', { name: 'Cổng chính A' });
    assert.equal(r.status, 200);
    assert.equal(r.body.camera.areaId, ids.A);
    assert.equal((await qk.post('/api/cameras', { name: 'X', deviceKey: 'K9' })).status, 403);
    assert.equal((await qk.post('/api/cameras/import', {})).status, 403);
    assert.equal((await qk.post('/api/cameras/refresh-status', {})).status, 403);
    assert.equal((await qk.del('/api/cameras/camB')).status, 404);
    assert.equal((await qk.del('/api/cameras/camA')).status, 200);
    const hr = await loginAs(app, 'HR01');
    const add = await hr.post('/api/cameras', { name: 'Kho', deviceKey: 'K10', areaId: ids.B });
    assert.equal(add.body.camera.areaId, ids.B);
    assert.equal((await hr.put('/api/cameras/camB', { areaId: ids.A })).body.camera.areaId, ids.A);
  } finally {
    await app.close();
  }
});

test('đơn: quản trị khu duyệt đơn trong khu, đơn ngoài khu 404', async () => {
  const { app } = await setup();
  try {
    const mk = async (code: string) => (await (await loginAs(app, code)).post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' })).body.request.id;
    const ra = await mk('NVA');
    const rb = await mk('NVB');
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.put(`/api/requests/${rb}`, { status: 'approved' })).status, 404);
    assert.equal((await qk.put(`/api/requests/${ra}`, { status: 'approved' })).status, 200);
  } finally {
    await app.close();
  }
});

test('quản trị khu tự sửa mình: chỉ họ tên, email, điện thoại, chức vụ', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    const pid = () => (app.db.prepare('SELECT hanet_person_id FROM users WHERE id = ?').get(ids.qkA) as { hanet_person_id: string | null }).hanet_person_id;
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { hanetPersonId: 'P9' })).status, 400);
    assert.equal(pid(), null, 'không đổi');
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { name: 'Tôi', avatarUrl: 'http://x/a.jpg' })).status, 400);
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { adminAreaIds: [ids.A, ids.B] })).status, 400);
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { name: 'X' })).status, 200);
    assert.equal((await qk.put(`/api/users/${ids.qkA}`, { name: 'X', email: 'x@a.vn', phone: '09', position: 'P', adminAreaIds: [ids.A] })).status, 200);
  } finally {
    await app.close();
  }
});

test('FaceID: quản trị khu không đăng ký/xem cho HR, quản trị khu khác, chính mình; ngoài khu 404', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    for (const [who, status] of [[ids.qkA2, 403], [ids.hr2, 403], [ids.qkA, 403], [ids.nvB, 404]] as const) {
      assert.equal((await qk.post(`/api/users/${who}/face`, { sightingId: 1 })).status, status, `face ${who}`);
      assert.equal((await qk.get(`/api/users/${who}/face-candidates`)).status, status, `candidates ${who}`);
    }
    assert.equal((await qk.get(`/api/users/${ids.nvA}/face-candidates`)).status, 200);
  } finally {
    await app.close();
  }
});

test('đơn: quản trị khu không duyệt đơn của quản trị khu/HR', async () => {
  const { app } = await setup();
  try {
    const r = await (await loginAs(app, 'QKA2')).post('/api/requests', { workDate: '2026-10-01', type: 'leave_request', reason: 'x' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.put(`/api/requests/${r.body.request.id}`, { status: 'approved' })).status, 403);
    assert.equal(app.db.prepare('SELECT status FROM requests WHERE id = ?').get(r.body.request.id)!.status, 'pending');
  } finally {
    await app.close();
  }
});

test('nhập từ Camera AI: quản trị khu phải chọn phòng trong khu', async () => {
  const { app, ids } = await setup();
  try {
    const qk = await loginAs(app, 'QKA');
    assert.equal((await qk.post('/api/users/import', { persons: [{ personId: 'P1' }] })).status, 400);
    assert.equal((await qk.post('/api/users/import', { persons: [{ personId: 'P1' }], departmentId: ids.pb })).status, 404);
  } finally {
    await app.close();
  }
});
