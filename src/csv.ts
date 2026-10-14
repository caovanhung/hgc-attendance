import type { CsvRowInput } from './types';

export const CSV_MAX_ROWS = 200;

/** Cột trong file → trường dữ liệu. */
const COLUMNS: Record<string, keyof CsvRowInput> = {
  ma_nhan_vien: 'code',
  ho_ten: 'name',
  email: 'email',
  so_dien_thoai: 'phone',
  ma_phong_ban: 'departmentCode',
  chuc_vu: 'position',
  vai_tro: 'role',
};
const REQUIRED = ['ho_ten', 'email', 'so_dien_thoai', 'ma_phong_ban'];

export const CSV_TEMPLATE =
  '\uFEFFma_nhan_vien,ho_ten,email,so_dien_thoai,ma_phong_ban,chuc_vu,vai_tro\r\n' +
  ',Nguyễn Văn An,an.nguyen@petrolimex.com.vn,0912345678,PB001,Nhân viên,nhan_vien\r\n';

/** Đọc CSV: tự nhận dấu `,` hoặc `;` (Excel tiếng Việt hay dùng `;`), bỏ BOM, hỗ trợ ô trong ngoặc kép và CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const header = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Ánh xạ CSV thành các dòng nhân sự; bỏ dòng trống hoàn toàn. */
export function csvToRows(text: string): { rows: CsvRowInput[]; error: string | null } {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (table.length === 0) return { rows: [], error: 'File trống' };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], error: `Thiếu cột bắt buộc: ${missing.join(', ')}` };
  const rows = table.slice(1).map((cells) => {
    const r: CsvRowInput = { code: '', name: '', email: '', phone: '', departmentCode: '', position: '', role: '' };
    header.forEach((h, i) => {
      const key = COLUMNS[h];
      if (key) r[key] = (cells[i] ?? '').trim();
    });
    return r;
  });
  return { rows, error: null };
}
