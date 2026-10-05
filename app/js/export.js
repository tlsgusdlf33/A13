// 문서 → 엑셀(.xlsx) / CSV 변환. "빈 양식" 모드는 판매용 엑셀 템플릿을 만듭니다.
import { buildXlsx, colLetter, dateToSerial, STYLE } from './xlsx.js';
import { parseNumber } from './format.js';
import { makeCtx, cellText } from './engine.js';

const DEFAULT_WIDTH = { date: 12, time: 8, currency: 13, number: 8, select: 11, check: 7, text: 16 };
const styleOf = (type) => (type === 'currency' || type === 'number' ? STYLE.number : type === 'date' ? STYLE.date : type === 'text' ? STYLE.text : STYLE.center);

function plainCell(col, row) {
  const raw = row?.[col.key];
  switch (col.type) {
    case 'currency':
    case 'number':
      return { v: raw === '' || raw == null ? null : parseNumber(raw), s: STYLE.number };
    case 'date': {
      const serial = dateToSerial(raw);
      return { v: serial ?? raw ?? '', s: STYLE.date };
    }
    case 'check':
      return { v: row ? (raw ? 'O' : 'X') : '', s: STYLE.center };
    default:
      return { v: raw ?? '', s: styleOf(col.type) };
  }
}

function guideSheet(template, appName) {
  const rows = [
    [{ v: `${template.icon} ${template.name}`, s: STYLE.title }],
    [{ v: template.description, s: STYLE.wrap }],
    [],
    [{ v: '사용 방법', s: STYLE.totalLabel }],
    ...(template.guide ?? []).map((g, i) => [{ v: `${i + 1}. ${g}`, s: STYLE.wrap }]),
    [],
    [{ v: `시트 구성: ${template.sheets.map((s) => s.name).join(' · ')}`, s: STYLE.wrap }],
    [{ v: `만든 도구: ${appName}`, s: STYLE.normal }],
  ];
  return { name: '사용 안내', rows, widths: [90] };
}

/**
 * @param {object} template 템플릿 정의
 * @param {object|null} doc  문서 (blank 모드에서는 무시)
 * @param {{blank?: boolean, blankRows?: number, now?: Date, appName?: string}} opts
 */
export function buildWorkbook(template, doc, { blank = false, blankRows = 200, now = new Date(), appName = '템플릿킷' } = {}) {
  const ctx = makeCtx(blank ? { sheets: {} } : doc?.data, 'all', now);
  const sheets = blank ? [guideSheet(template, appName)] : [];

  for (const sheet of template.sheets) {
    const cols = sheet.columns;
    const L = (key) => colLetter(cols.findIndex((c) => c.key === key));
    const S = (sheetKey, key) => {
      const other = template.sheets.find((s) => s.key === sheetKey);
      const letter = colLetter(other.columns.findIndex((c) => c.key === key));
      return `'${other.name}'!$${letter}:$${letter}`;
    };
    const dataRows = blank ? [] : ctx.data?.sheets?.[sheet.key] ?? [];
    const n = blank ? blankRows : dataRows.length;
    const last = n + 1;
    const rows = [cols.map((c) => ({ v: c.label, s: STYLE.header }))];

    for (let i = 0; i < n; i++) {
      const r = i + 2;
      const row = dataRows[i];
      rows.push(
        cols.map((c) => {
          if (!c.computed) return plainCell(c, row);
          const value = row ? c.compute(row, ctx) : undefined;
          return c.excel ? { f: c.excel({ r, L, S }), v: value, s: styleOf(c.type) } : { v: value ?? '', s: styleOf(c.type) };
        }),
      );
    }

    if (n > 0 && cols.some((c) => c.total)) {
      rows.push(
        cols.map((c, ci) => {
          if (ci === 0) return { v: '합계', s: STYLE.totalLabel };
          if (!c.total) return { s: STYLE.totalLabel };
          const cached = blank ? undefined : dataRows.reduce((s, row) => s + parseNumber(c.computed ? c.compute(row, ctx) : row[c.key]), 0);
          return { f: `SUM(${colLetter(ci)}2:${colLetter(ci)}${last})`, v: cached, s: STYLE.totalNumber };
        }),
      );
    }

    const validations = n > 0
      ? cols
          .map((c, ci) => {
            const list = c.type === 'select' ? c.options : c.type === 'check' ? ['O', 'X'] : null;
            return list && !c.computed ? { sqref: `${colLetter(ci)}2:${colLetter(ci)}${last}`, list } : null;
          })
          .filter(Boolean)
      : [];

    sheets.push({
      name: sheet.name,
      rows,
      widths: cols.map((c) => c.width ?? DEFAULT_WIDTH[c.type] ?? 14),
      freezeHeader: true,
      headerHeight: 22,
      autoFilter: `A1:${colLetter(cols.length - 1)}${Math.max(last, 1)}`,
      validations,
    });
  }
  return { sheets };
}

export function exportXlsxBytes(template, doc, opts) {
  return buildXlsx(buildWorkbook(template, doc, opts), opts?.now);
}

function csvField(v) {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV 수식 주입 방지
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 엑셀에서 한글이 깨지지 않도록 BOM 포함 */
export function toCsv(sheet, rows, ctx) {
  const lines = [sheet.columns.map((c) => c.label)];
  for (const r of rows) {
    lines.push(
      sheet.columns.map((c) => {
        if (c.type === 'currency' || c.type === 'number') {
          const v = c.computed ? c.compute(r, ctx) : r[c.key];
          return v === '' || v == null ? '' : parseNumber(v);
        }
        return cellText(c, r, ctx);
      }),
    );
  }
  return '﻿' + lines.map((l) => l.map(csvField).join(',')).join('\r\n');
}

export const safeFileName = (s) => String(s || '문서').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80);
