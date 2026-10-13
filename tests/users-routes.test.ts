import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, seedUser, seedDepartment, loginAs, addDetection, Client, type TestApp } from './helpers';
import fs from 'node:fs';

async function setup(): Promise<{ app: TestApp; kt: string; kd: string; ids: Record<string, string> }> {
  const app = await startTestApp();
  const kt = seedDepartment(app.db, 'KT', 'Kế toán');
  const kd = seedDepartment(app.db, 'KD', 'Kinh doanh');
  const ids = {
    hr: seedUser(app.db, { code: 'HR01', role: 'hr' }),
    tp: seedUser(app.db, { code: 'TP01', role: 'dept_manager', departmentId: kt }),
    nv1: seedUser(app.db, { code: 'NV01', departmentId: kt }),
    nv2: seedUser(app.db, { code: 'NV02', departmentId: kd }),
  };
  return { app, kt, kd, ids };
}

test('GET /users theo phạm vi vai trò', async () => {
  const { app } = await setup();
  try {
    const codes = async (c: Client) => ((await c.get('/api/users')).body.users as { code: string }[]).map((u) => u.code).sort();
    assert.deepEqual(await codes(await loginAs(app, 'HR01')), ['HR01', 'NV01', 'NV02', 'TP01']);
    assert.deepEqual(await codes(await loginAs(app, 'TP01')), ['NV01', 'TP01']);
    assert.deepEqual(await codes(await loginAs(app, 'NV01')), ['NV01']);
    const first = (await (await loginAs(app, 'HR01')).get('/api/users')).body.users[0];
    assert.equal(first.hanetSyncStatus, 'synced');
    assert.equal(first.hanetSyncError, null);
    assert.equal(first.faceError, null);
  } finally {
    await app.close();
  }
});

test('HR tạo nhân viên → mật khẩu tạm dùng được và bị bắt đổi', async () => {
  const { app, kt } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/users', { code: 'nv03', name: 'Lê Văn C', departmentId: kt, position: 'Kế toán viên' });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.code, 'NV03');
    assert.equal(r.body.user.departmentName, 'Kế toán');
    assert.equal(r.body.user.email, '');
    assert.equal(r.body.user.hanetPersonId, null);
    assert.equal(r.body.user.faceRegistered, false);
    assert.equal(r.body.tempPassword.length, 10);
    const nv = await loginAs(app, 'NV03', r.body.tempPassword);
    assert.equal((await nv.get('/api/auth/me')).body.mustChangePassword, true);
  } finally {
    await app.close();
  }
});

test('tạo nhân viên: trùng mã (không phân biệt hoa thường) 409, dữ liệu sai 400', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/users', { code: 'nv01', name: 'Trùng' })).status, 409);
    assert.equal((await hr.post('/api/users', { code: 'NV 09', name: 'Có dấu cách' })).status, 400);
    assert.equal((await hr.post('/api/users', { code: 'NV09', name: '' })).status, 400);
    assert.equal((await hr.post('/api/users', { code: 'NV09', name: 'X', role: 'admin' })).status, 400);
    assert.equal((await hr.post('/api/users', { code: 'NV09', name: 'X', departmentId: 'dep-khong-co' })).status, 400);
  } finally {
    await app.close();
  }
});

test('chỉ HR được tạo/sửa/đặt lại mật khẩu', async () => {
  const { app, ids } = await setup();
  try {
    for (const code of ['TP01', 'NV01']) {
      const c = await loginAs(app, code);
      assert.equal((await c.post('/api/users', { code: 'NV09', name: 'X' })).status, 403);
      assert.equal((await c.put(`/api/users/${ids.nv1}`, { name: 'Y' })).status, 403);
      assert.equal((await c.post(`/api/users/${ids.nv1}/reset-password`)).status, 403);
    }
  } finally {
    await app.close();
  }
});

test('HR sửa thông tin; chuyển inactive thì phiên của người đó bị hủy', async () => {
  const { app, ids, kd } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NV01');
    const r = await hr.put(`/api/users/${ids.nv1}`, { name: 'Tên mới', departmentId: kd, hanetPersonId: '2134589559210508288', faceRegistered: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'Tên mới');
    assert.equal(r.body.user.departmentName, 'Kinh doanh');
    assert.equal(r.body.user.hanetPersonId, '2134589559210508288');
    assert.equal(r.body.user.faceRegistered, true);
    assert.equal((await nv.get('/api/auth/me')).status, 200);
    assert.equal((await hr.put(`/api/users/${ids.nv1}`, { status: 'inactive' })).status, 200);
    assert.equal((await nv.get('/api/auth/me')).status, 401);
    assert.equal((await hr.put('/api/users/usr-khong-co', { name: 'x' })).status, 404);
    assert.equal((await hr.put(`/api/users/${ids.nv1}`, { status: 'deleted' })).status, 400);
  } finally {
    await app.close();
  }
});

test('Review Focus #5: HR không tự đổi vai trò hay trạng thái của mình', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const a = await hr.put(`/api/users/${ids.hr}`, { role: 'employee' });
    assert.equal(a.status, 400);
    assert.equal(a.body.error, 'Không thể tự đổi vai trò hoặc trạng thái của chính mình');
    assert.equal((await hr.put(`/api/users/${ids.hr}`, { status: 'inactive' })).status, 400);
    assert.equal((await hr.put(`/api/users/${ids.hr}`, { role: 'hr', status: 'active', name: 'HR mới' })).status, 200, 'giữ nguyên giá trị thì được');
  } finally {
    await app.close();
  }
});

test('HR đặt lại mật khẩu: mật khẩu cũ hết hiệu lực, phiên bị hủy', async () => {
  const { app, ids } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const nv = await loginAs(app, 'NV01');
    const r = await hr.post(`/api/users/${ids.nv1}/reset-password`);
    assert.equal(r.status, 200);
    assert.equal((await nv.get('/api/auth/me')).status, 401);
    await assert.rejects(loginAs(app, 'NV01'));
    await loginAs(app, 'NV01', r.body.tempPassword);
  } finally {
    await app.close();
  }
});

test('phòng ban: mọi vai trò xem, chỉ HR tạo/sửa', async () => {
  const { app, ids, kt } = await setup();
  try {
    const nv = await loginAs(app, 'NV01');
    const list = await nv.get('/api/departments');
    assert.equal(list.status, 200);
    const ktRow = (list.body.departments as { id: string; memberCount: number }[]).find((d) => d.id === kt)!;
    assert.equal(ktRow.memberCount, 2);
    assert.equal((await nv.post('/api/departments', { code: 'IT', name: 'CNTT' })).status, 403);

    const hr = await loginAs(app, 'HR01');
    const created = await hr.post('/api/departments', { code: 'it', name: 'Công nghệ', managerId: ids.tp });
    assert.equal(created.status, 200);
    assert.equal(created.body.department.code, 'IT');
    assert.equal(created.body.department.managerName, 'TP01');
    assert.equal((await hr.post('/api/departments', { code: 'IT', name: 'Trùng' })).status, 409);
    assert.equal((await hr.post('/api/departments', { code: 'X1', name: 'X', managerId: 'usr-khong-co' })).status, 400);

    const upd = await hr.put(`/api/departments/${kt}`, { name: 'Kế toán Tài chính', managerId: '' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.department.name, 'Kế toán Tài chính');
    assert.equal(upd.body.department.managerId, null);
    assert.equal((await hr.put(`/api/departments/${kt}`, { name: '' })).status, 400);
    assert.equal((await hr.put('/api/departments/dep-khong-co', { name: 'x' })).status, 404);
  } finally {
    await app.close();
  }
});

test('danh sách nhân sự không gồm tài khoản hệ thống ADMIN', async () => {
  const { app } = await setup();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    const users = (await (await loginAs(app, 'ADMIN')).get('/api/users')).body.users as { code: string }[];
    assert.deepEqual(users.map((u) => u.code).sort(), ['HR01', 'NV01', 'NV02', 'TP01']);
  } finally {
    await app.close();
  }
});

test('chỉ tài khoản ADMIN xóa được nhân sự; xóa kèm lịch sử và có sao lưu trước', async () => {
  const { app, ids } = await setup();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    addDetection(app.db, ids.nv1, Date.now());
    const hr = await loginAs(app, 'HR01');
    const tp = await loginAs(app, 'TP01');
    assert.equal((await hr.del(`/api/users/${ids.nv1}`)).status, 403);
    assert.equal((await tp.del(`/api/users/${ids.nv1}`)).status, 403);

    const admin = await loginAs(app, 'ADMIN');
    const r = await admin.del(`/api/users/${ids.nv1}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.backup, /pre-delete\.db$/);
    assert.ok(fs.existsSync(`${app.ctx.config.backupDir}/${r.body.backup}`));
    assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM users WHERE id = ?').get(ids.nv1)!.c, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM detections WHERE user_id = ?').get(ids.nv1)!.c, 0);
    assert.equal((await admin.del(`/api/users/${ids.nv1}`)).status, 404);

    // xóa trưởng phòng → phòng ban mất trưởng phòng, không lỗi
    app.db.prepare('UPDATE departments SET manager_id = ? WHERE code = ?').run(ids.tp, 'KT');
    assert.equal((await admin.del(`/api/users/${ids.tp}`)).status, 200);
    assert.equal(app.db.prepare("SELECT manager_id FROM departments WHERE code = 'KT'").get()!.manager_id, null);

    // không tự xóa chính mình
    const adminId = app.db.prepare("SELECT id FROM users WHERE code = 'ADMIN'").get()!.id as string;
    assert.equal((await admin.del(`/api/users/${adminId}`)).status, 400);
  } finally {
    await app.close();
  }
});

test('chỉ tài khoản ADMIN xóa được phòng ban; thành viên chuyển về chưa có phòng', async () => {
  const { app, ids, kt } = await setup();
  try {
    seedUser(app.db, { code: 'ADMIN', role: 'hr' });
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.del(`/api/departments/${kt}`)).status, 403);

    const admin = await loginAs(app, 'ADMIN');
    const r = await admin.del(`/api/departments/${kt}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.backup, /pre-delete\.db$/);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS c FROM departments WHERE id = ?').get(kt)!.c, 0);
    assert.equal(app.db.prepare('SELECT department_id FROM users WHERE id = ?').get(ids.nv1)!.department_id, null);
    assert.equal((await admin.del(`/api/departments/${kt}`)).status, 404);
  } finally {
    await app.close();
  }
});

test('thêm phòng ban không nhập mã → hệ thống tự sinh PB001, PB002...', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const a = await hr.post('/api/departments', { name: 'Hành chính' });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.department.code, 'PB001');
    assert.equal((await hr.post('/api/departments', { name: 'Kỹ thuật', code: '' })).body.department.code, 'PB002');
    assert.equal((await hr.post('/api/departments', { name: 'Tự đặt', code: 'pb007' })).body.department.code, 'PB007');
    assert.equal((await hr.post('/api/departments', { name: 'Tiếp theo' })).body.department.code, 'PB008');
  } finally {
    await app.close();
  }
});

test('tạo nhân viên kèm faceRegistered (chọn từ camera) → lưu đúng', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    const r = await hr.post('/api/users', { code: 'NV05', name: 'Từ camera', hanetPersonId: '2134589559210508288', faceRegistered: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.faceRegistered, true);
    assert.equal(r.body.user.hanetPersonId, '2134589559210508288');
  } finally {
    await app.close();
  }
});

test('không ai tạo được nhân sự mang mã ADMIN (kể cả khi chưa có tài khoản ADMIN)', async () => {
  const { app } = await setup();
  try {
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/users', { code: 'admin', name: 'Giả mạo', role: 'hr' })).status, 400);
    assert.equal((app.db.prepare("SELECT COUNT(*) AS c FROM users WHERE code = 'ADMIN'").get() as { c: number }).c, 0);
  } finally {
    await app.close();
  }
});
