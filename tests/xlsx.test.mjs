import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zipStore } from '../app/js/zip.js';
import { colLetter, dateToSerial, buildXlsx } from '../app/js/xlsx.js';
import { buildWorkbook, exportXlsxBytes, toCsv } from '../app/js/export.js';
import { TEMPLATES, getTemplate } from '../app/js/templates.js';
import { createDocData, makeCtx, getRows } from '../app/js/engine.js';

const NOW = new Date(2026, 9, 5);
const dec = new TextDecoder();

/** 무압축 zip 을 읽어 { 이름: 내용 } 으로 */
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const name = dec.decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const data = bytes.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    assert.equal(crc32(data), dv.getUint32(p + 14, true), `${name} crc`);
    files[name] = dec.decode(data);
    p += 30 + nameLen + size;
  }
  assert.equal(dv.getUint32(bytes.length - 22, true), 0x06054b50, 'end of central directory');
  return files;
}

test('crc32 known vector', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zipStore round trip', () => {
  const files = unzip(zipStore([{ name: 'a.txt', data: '안녕' }, { name: 'b/c.xml', data: '<x/>' }]));
  assert.deepEqual(files, { 'a.txt': '안녕', 'b/c.xml': '<x/>' });
});

test('column letters and date serials', () => {
  assert.equal(colLetter(0), 'A');
  assert.equal(colLetter(25), 'Z');
  assert.equal(colLetter(26), 'AA');
  assert.equal(colLetter(701), 'ZZ');
  assert.equal(dateToSerial('1900-03-01'), 61);
  assert.equal(dateToSerial('2026-10-05'), 46300);
  assert.equal(dateToSerial('bad'), null);
});

test('xlsx package contains workbook, styles and escaped values', () => {
  const files = unzip(buildXlsx({ sheets: [{ name: 'A&B', rows: [['<tag>', 1, true, { f: 'SUM(B1:B1)', v: 1 }]] }] }));
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(files[name], name);
  assert.match(files['xl/workbook.xml'], /name="A&amp;B"/);
  assert.match(files['xl/worksheets/sheet1.xml'], /&lt;tag&gt;/);
  assert.match(files['xl/worksheets/sheet1.xml'], /<f>SUM\(B1:B1\)<\/f><v>1<\/v>/);
});

test('budget workbook: formulas reference the right columns', () => {
  const t = getTemplate('budget');
  const doc = { title: 'x', data: createDocData(t, { withSample: true, ctx: makeCtx(null, 'all', NOW) }) };
  const wb = buildWorkbook(t, doc, { now: NOW });
  const [ledger, plan] = wb.sheets;
  assert.equal(ledger.name, '내역');
  assert.equal(ledger.rows.length, 1 + 6 + 1); // 머리글 + 6행 + 합계
  assert.equal(ledger.rows.at(-1)[4].f, 'SUM(E2:E7)');
  assert.equal(ledger.rows.at(-1)[4].v, 3000000 + 600000 + 68000 + 4500 + 50000 + 15000);
  assert.equal(ledger.rows[1][0].v, dateToSerial('2026-10-01'));
  const spent = plan.rows[1][2];
  assert.equal(spent.f, `SUMIFS('내역'!$E:$E,'내역'!$C:$C,A2,'내역'!$B:$B,"지출")`);
  assert.equal(spent.v, 68000);
  assert.equal(plan.rows[1][3].f, 'B2-C2');
  assert.ok(ledger.validations.some((v) => v.sqref === 'B2:B7' && v.list.includes('수입')));
});

test('blank (for-sale) workbook has a guide sheet, formulas and dropdowns', () => {
  const t = getTemplate('tasks');
  const wb = buildWorkbook(t, null, { blank: true, blankRows: 50, now: NOW });
  assert.equal(wb.sheets[0].name, '사용 안내');
  const sheet = wb.sheets[1];
  assert.equal(sheet.rows.length, 51);
  const dday = sheet.rows[1][6];
  assert.match(dday.f, /^IF\(D2="완료","완료",IF\(F2="",""/);
  assert.equal(dday.v, undefined);
  assert.ok(sheet.validations.some((v) => v.sqref === 'D2:D51'));
});

test('every template exports a valid xlsx (data and blank)', () => {
  for (const t of TEMPLATES) {
    const doc = { data: createDocData(t, { withSample: true, ctx: makeCtx(null, 'all', NOW) }) };
    for (const blank of [false, true]) {
      const files = unzip(exportXlsxBytes(t, doc, { blank, now: NOW }));
      const n = t.sheets.length + (blank ? 1 : 0);
      assert.equal(Object.keys(files).filter((f) => f.startsWith('xl/worksheets/')).length, n, t.id);
    }
  }
});

test('csv has BOM, escapes and guards formula injection', () => {
  const s = getTemplate('budget').sheets[0];
  const rows = [{ _id: '1', date: '2026-10-01', type: '지출', category: '식비', item: '=HYPERLINK("x")', amount: 1200, memo: 'a,b' }];
  const csv = toCsv(s, rows, makeCtx({ sheets: { ledger: rows } }, 'all', NOW));
  assert.ok(csv.startsWith('\uFEFF날짜,구분'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /,1200,/);
  assert.match(csv, /"a,b"/);
});
