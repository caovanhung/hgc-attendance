import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvToRows, parseCsv, CSV_TEMPLATE } from '../src/csv';

test('parseCsv: dấu phẩy, ngoặc kép, ngoặc kép lồng, CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
});

test('Review Focus #5: file Excel tiếng Việt — dấu chấm phẩy, BOM, dòng trống cuối file', () => {
  const text = '\uFEFFma_nhan_vien;ho_ten;email;so_dien_thoai;ma_phong_ban;chuc_vu;vai_tro\r\n;Nguyễn Văn An;an@test.vn;0912 345 678;PB001;"Kế toán; tổng hợp";nhan_vien\r\n;;;;;;\r\n\r\n';
  const { rows, error } = csvToRows(text);
  assert.equal(error, null);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    code: '', name: 'Nguyễn Văn An', email: 'an@test.vn', phone: '0912 345 678', departmentCode: 'PB001', position: 'Kế toán; tổng hợp', role: 'nhan_vien',
  });
});

test('csvToRows: tiêu đề không phân biệt hoa thường, thứ tự tùy ý; thiếu cột bắt buộc thì báo lỗi', () => {
  const ok = csvToRows('Email,HO_TEN,so_dien_thoai,ma_phong_ban\nb@test.vn,Trần B,0912345678,PB002\n');
  assert.equal(ok.error, null);
  assert.deepEqual(ok.rows[0], { code: '', name: 'Trần B', email: 'b@test.vn', phone: '0912345678', departmentCode: 'PB002', position: '', role: '' });
  assert.equal(csvToRows('ho_ten,email\nA,a@test.vn\n').error, 'Thiếu cột bắt buộc: so_dien_thoai, ma_phong_ban');
  assert.equal(csvToRows('').error, 'File trống');
});

test('file mẫu đọc lại được', () => {
  const { rows, error } = csvToRows(CSV_TEMPLATE);
  assert.equal(error, null);
  assert.equal(rows.length, 1);
});
