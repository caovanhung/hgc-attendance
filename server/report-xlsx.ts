import ExcelJS from 'exceljs';
import { monthLabel } from './month-lock';
import type { MonthlyReport } from '../shared/types';

const NAVY = 'FF003865';
const ORANGE = 'FFEA580C';
const GREY = 'FFF1F5F9';
/** Màu ô ký hiệu, khớp DAY_STATUS_STYLE trên web. */
const SYMBOL_FILL: Record<string, string> = {
  X: 'FFD1FAE5',
  M: 'FFFEF3C7',
  S: 'FFFEF3C7',
  MS: 'FFFFE4E6',
  V: 'FFFFE4E6',
  T: 'FFE2E8F0',
  P: 'FFEDE9FE',
  CT: 'FFE0F2FE',
  L: 'FFE2E8F0',
};
const WEEKDAY = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const pad = (n: number) => String(n).padStart(2, '0');
/** dd/mm/yyyy HH:MM theo giờ Việt Nam. */
function vnStamp(ms: number): string {
  const d = new Date(ms + 7 * 3_600_000);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function header(ws: ExcelJS.Worksheet, title: string, report: MonthlyReport, exportedBy: string, now: number): void {
  ws.getCell('A1').value = 'CÔNG TY TNHH MTV PETROLIMEX HÀ NỘI';
  ws.getCell('A1').font = { bold: true };
  ws.getCell('A2').value = `${title} THÁNG ${monthLabel(report.month)}`;
  ws.getCell('A2').font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.getCell('A3').value = `${report.scopeLabel} · Xuất lúc ${vnStamp(now)} bởi ${exportedBy}`;
  if (report.lock) {
    ws.getCell('A4').value = `Đã khóa sổ ngày ${vnStamp(Date.parse(report.lock.lockedAt)).slice(0, 10)} bởi ${report.lock.lockedByName}`;
    ws.getCell('A4').font = { italic: true, color: { argb: ORANGE } };
  }
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}

function pageSetup(ws: ExcelJS.Worksheet): void {
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

/** File Excel bảng công tháng: sheet "Tổng hợp" và sheet "Chấm công" (lưới ký hiệu), dựng từ cùng dữ liệu với web. */
export async function monthlyReportXlsx(report: MonthlyReport, exportedBy: string, now: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Petrolimex Attendance';

  const sum = wb.addWorksheet('Tổng hợp');
  header(sum, 'BẢNG TỔNG HỢP CÔNG', report, exportedBy, now);
  sum.getRow(6).values = [
    'STT', 'Mã NV', 'Họ tên', 'Phòng ban', 'Ngày phải làm', 'Ngày công', 'Đi muộn (lần)', 'Đi muộn (phút)', 'Về sớm (lần)',
    'Về sớm (phút)', 'Thiếu giờ ra', 'Vắng', 'Nghỉ phép', 'Công tác', 'Tỷ lệ chuyên cần (%)',
  ];
  styleHeaderRow(sum.getRow(6));
  report.rows.forEach((r, i) => {
    sum.getRow(7 + i).values = [
      i + 1, r.employeeCode, r.employeeName, r.departmentName ?? '', r.requiredDays, r.workDays, r.lateCount, r.lateMinutes,
      r.earlyCount, r.earlyMinutes, r.missingOutDays, r.absentDays, r.leaveDays, r.businessTripDays, r.attendanceRate,
    ];
  });
  for (let c = 1; c <= 15; c++) sum.getColumn(c).width = c === 3 ? 28 : c === 4 ? 20 : c === 1 ? 6 : 12;
  sum.views = [{ state: 'frozen', xSplit: 3, ySplit: 6 }];
  pageSetup(sum);

  const grid = wb.addWorksheet('Chấm công');
  header(grid, 'BẢNG CHẤM CÔNG', report, exportedBy, now);
  const totals = ['Ngày công', 'Muộn', 'Về sớm', 'Vắng', 'Phép', 'Công tác'];
  grid.getRow(6).values = ['STT', 'Mã NV', 'Họ tên', 'Phòng ban', ...report.days.map((_, i) => i + 1), ...totals];
  grid.getRow(7).values = ['', '', '', '', ...report.days.map((d) => WEEKDAY[d.weekday]), ...totals.map(() => '')];
  styleHeaderRow(grid.getRow(6));
  styleHeaderRow(grid.getRow(7));
  report.rows.forEach((r, i) => {
    const row = grid.getRow(8 + i);
    row.values = [
      i + 1, r.employeeCode, r.employeeName, r.departmentName ?? '', ...r.cells.map((c) => c ?? ''),
      r.workDays, r.lateCount, r.earlyCount, r.absentDays, r.leaveDays, r.businessTripDays,
    ];
    r.cells.forEach((c, k) => {
      const cell = row.getCell(5 + k);
      cell.alignment = { horizontal: 'center' };
      const day = report.days[k];
      const argb = (c ? SYMBOL_FILL[c.replace('*', '')] : undefined) ?? (day.weekday >= 6 || day.holiday ? GREY : undefined);
      if (argb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    });
  });
  grid.getColumn(1).width = 6;
  grid.getColumn(3).width = 26;
  grid.getColumn(4).width = 18;
  for (let k = 0; k < report.days.length; k++) grid.getColumn(5 + k).width = 4.5;
  grid.views = [{ state: 'frozen', xSplit: 3, ySplit: 7 }];
  grid.getCell(`A${8 + report.rows.length + 1}`).value =
    'Ký hiệu: X = đủ công, M = đi muộn, S = về sớm, MS = muộn và về sớm, T = thiếu giờ ra, CT = công tác, P = nghỉ phép, V = vắng, L = ngày lễ; * = đã điều chỉnh';
  pageSetup(grid);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
