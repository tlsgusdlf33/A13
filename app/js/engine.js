// 템플릿 정의를 해석하는 공통 로직 (DOM 없음)
import { parseNumber, inPeriod, randomId, fmtNumber, toISODate, currentMonth } from './format.js';

export const rowId = () => randomId(8);

/** 계산/기본값에 쓰이는 컨텍스트 */
export function makeCtx(data, period = 'all', now = new Date()) {
  const today = toISODate(now);
  const newRowDate = period && period !== 'all' && period !== currentMonth(now) ? `${period}-01` : today;
  return { data: data ?? { sheets: {} }, period, today, month: currentMonth(now), newRowDate };
}

export function makeRow(sheet, ctx) {
  const row = { _id: rowId() };
  for (const c of sheet.columns) {
    if (c.computed) continue;
    const d = typeof c.default === 'function' ? c.default(ctx) : c.default;
    if (d !== undefined) row[c.key] = d;
    else if (c.type === 'check') row[c.key] = false;
  }
  return row;
}

export function createDocData(template, { withSample = false, ctx = makeCtx() } = {}) {
  const sample = withSample && template.sample ? template.sample(ctx) : {};
  const sheets = {};
  for (const s of template.sheets) sheets[s.key] = (sample[s.key] ?? []).map((r) => ({ _id: rowId(), ...r }));
  return { sheets };
}

export const getRows = (data, sheetKey) => data?.sheets?.[sheetKey] ?? [];

export const isPeriodic = (template) => template.sheets.some((s) => s.periodKey);

export function cellValue(col, row, ctx) {
  return col.computed ? col.compute(row, ctx) : row[col.key];
}

/** 검색·정렬·CSV에 쓰는 표시용 문자열 */
export function cellText(col, row, ctx) {
  const v = cellValue(col, row, ctx);
  if (v == null || v === '') return '';
  if (col.type === 'check') return v ? 'O' : 'X';
  if (col.type === 'currency') return fmtNumber(v);
  return String(v);
}

export function periodRows(sheet, rows, period) {
  if (!sheet.periodKey || !period || period === 'all') return rows;
  return rows.filter((r) => inPeriod(r[sheet.periodKey], period));
}

export function searchRows(sheet, rows, query, ctx) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => sheet.columns.some((c) => cellText(c, r, ctx).toLowerCase().includes(q)));
}

export function sortRows(sheet, rows, sort, ctx) {
  const s = sort ?? sheet.defaultSort;
  if (!s?.key) return rows;
  const col = sheet.columns.find((c) => c.key === s.key);
  if (!col) return rows;
  const numeric = col.type === 'currency' || col.type === 'number';
  const dir = s.dir === 'desc' ? -1 : 1;
  const key = (r) => {
    const v = cellValue(col, r, ctx);
    if (v === '' || v == null) return null;
    if (numeric) return parseNumber(v);
    if (col.type === 'check') return v ? 1 : 0;
    return String(v);
  };
  return rows
    .map((r, i) => ({ r, i, k: key(r) }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1; // 빈 값은 항상 뒤로
      if (b.k === null) return -1;
      const c = typeof a.k === 'number' ? a.k - b.k : a.k.localeCompare(b.k, 'ko');
      return c ? c * dir : a.i - b.i;
    })
    .map((x) => x.r);
}

export function visibleRows(sheet, rows, { period, search, sort } = {}, ctx) {
  return sortRows(sheet, searchRows(sheet, periodRows(sheet, rows, period), search, ctx), sort, ctx);
}

export function breakdown(sheet, rows, ctx) {
  const b = sheet.breakdown;
  if (!b) return [];
  const groups = new Map();
  for (const r of rows) {
    if (b.filter && !b.filter(r)) continue;
    const label = String(r[b.groupBy] ?? '').trim() || '미분류';
    const v = b.value == null ? 1 : typeof b.value === 'function' ? b.value(r, ctx) : parseNumber(r[b.value]);
    groups.set(label, (groups.get(label) ?? 0) + v);
  }
  const items = [...groups].map(([label, value]) => ({ label, value })).filter((x) => x.value).sort((a, b2) => b2.value - a.value);
  const max = Math.max(0, ...items.map((x) => x.value));
  const total = items.reduce((s, x) => s + x.value, 0);
  return items.map((x) => ({ ...x, ratio: total ? x.value / total : 0, bar: max ? x.value / max : 0 }));
}
