import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { startTestApp, seedUser, seedArea, seedDepartment, loginAs, addDetection, type TestApp, type Client } from './helpers';
import { vnDateTimeToTs } from '../server/vntime';

const NOW = vnDateTimeToTs('2026-10-15', '18:00');

async function download(app: TestApp, c: Client, q: string) {
  const res = await fetch(`${app.baseUrl}/api/reports/monthly.xlsx?${q}`, { headers: { Cookie: c.cookie } });
  if (res.status !== 200) return { status: res.status, type: null, disp: null, wb: null };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
  return { status: res.status, type: res.headers.get('content-type'), disp: res.headers.get('content-disposition'), wb };
}

const values = (row: ExcelJS.Row) => (row.values as unknown[]).slice(1);

test('Excel 2 sheet, tiêu đề, số liệu khớp JSON, phòng rỗng vẫn ra file, khóa sổ có dòng ghi chú', async () => {
  const app = await startTestApp({ now: () => NOW });
  try {
    const a1 = seedArea(app.db, 'KV1', 'Trụ sở');
    const d1 = seedDepartment(app.db, 'PB1', 'Kế toán', a1);
    const empty = seedDepartment(app.db, 'PB9', 'Phòng rỗng', a1);
    seedUser(app.db, { code: 'HR01', name: 'Trần HR', role: 'hr' });
    const nv = seedUser(app.db, { code: 'NV01', name: 'Nguyễn Văn Ấn', departmentId: d1 });
    app.db.prepare("UPDATE users SET created_at = '2026-10-01'").run();
    addDetection(app.db, nv, vnDateTimeToTs('2026-10-01', '08:20'));
    const hr = await loginAs(app, 'HR01');
    assert.equal((await hr.post('/api/month-locks/2026-10')).status, 200);

    const json = (await hr.get('/api/reports/monthly?month=2026-10')).body;
    const x = await download(app, hr, 'month=2026-10');
    assert.equal(x.status, 200);
    assert.match(x.type ?? '', /spreadsheetml/);
    assert.match(x.disp ?? '', /Bang_cong_2026-10\.xlsx/);
    const wb = x.wb!;
    assert.deepEqual(wb.worksheets.map((s) => s.name), ['Tổng hợp', 'Chấm công']);
    const sum = wb.getWorksheet('Tổng hợp')!;
    assert.equal(sum.getCell('A1').value, 'CÔNG TY TNHH MTV PETROLIMEX HÀ NỘI');
    assert.equal(sum.getCell('A2').value, 'BẢNG TỔNG HỢP CÔNG THÁNG 10/2026');
    assert.match(String(sum.getCell('A3').value), /Toàn công ty · Xuất lúc 15\/10\/2026 18:00 bởi Trần HR \(HR01\)/);
    assert.match(String(sum.getCell('A4').value), /Đã khóa sổ ngày 15\/10\/2026 bởi Trần HR \(HR01\)/);
    // Dòng tiêu đề bảng ở dòng 6, dữ liệu từ dòng 7
    assert.deepEqual(values(sum.getRow(6)).slice(0, 6), ['STT', 'Mã NV', 'Họ tên', 'Phòng ban', 'Ngày phải làm', 'Ngày công']);
    const j = json.rows.find((r: { employeeCode: string }) => r.employeeCode === 'NV01');
    assert.deepEqual(values(sum.getRow(7)).slice(1, 15), [
      'NV01', 'Nguyễn Văn Ấn', 'Kế toán', j.requiredDays, j.workDays, j.lateCount, j.lateMinutes,
      j.earlyCount, j.earlyMinutes, j.missingOutDays, j.absentDays, j.leaveDays, j.businessTripDays, j.attendanceRate,
    ]);
    assert.equal((sum.views[0] as { state?: string }).state, 'frozen');
    const grid = wb.getWorksheet('Chấm công')!;
    assert.equal(grid.getCell('A2').value, 'BẢNG CHẤM CÔNG THÁNG 10/2026');
    // Cột ngày bắt đầu từ cột E; dòng 6 = số ngày, dòng 7 = thứ, dữ liệu từ dòng 8
    assert.equal(grid.getRow(6).getCell(5).value, 1);
    assert.equal(grid.getRow(7).getCell(5).value, 'T5');
    assert.equal(grid.getRow(8).getCell(3).value, 'Nguyễn Văn Ấn');
    assert.equal(grid.getRow(8).getCell(5).value, j.cells[0]);

    const none = await download(app, hr, `month=2026-10&department=${empty}`);
    assert.equal(none.status, 200);
    const noneSum = none.wb!.getWorksheet('Tổng hợp')!;
    assert.match(String(noneSum.getCell('A3').value), /^Phòng Phòng rỗng/);
    assert.equal(noneSum.getRow(7).cellCount, 0);
    assert.equal((await download(app, await loginAs(app, 'NV01'), 'month=2026-10')).status, 403);
    assert.equal((await download(app, hr, 'month=2026-13')).status, 400);
  } finally {
    await app.close();
  }
});
