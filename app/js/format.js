// 날짜·숫자 포맷 도우미 (DOM 없이 동작 — 테스트 가능)

export const pad2 = (n) => String(n).padStart(2, '0');

/** 로컬 시간 기준 YYYY-MM-DD */
export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function currentMonth(d = new Date()) {
  return toISODate(d).slice(0, 7);
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(y, m - 1 + delta, 1);
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${y}년 ${Number(m)}월`;
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

/** b - a (일 단위). 잘못된 날짜면 NaN */
export function daysBetween(a, b) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  };
  return Math.round((parse(b) - parse(a)) / 86400000);
}

export function inPeriod(date, period) {
  if (!period || period === 'all') return true;
  return String(date ?? '').startsWith(period);
}

export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function fmtNumber(n) {
  return Math.round(parseNumber(n)).toLocaleString('ko-KR');
}

export const fmtWon = (n) => `${fmtNumber(n)}원`;

export const fmtPct = (ratio) => `${Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)}%`;

export function formatSummary(item) {
  switch (item.format) {
    case 'won': return fmtWon(item.value);
    case 'pct': return fmtPct(item.value);
    case 'count': return `${fmtNumber(item.value)}${item.unit ?? '개'}`;
    default: return String(item.value ?? '');
  }
}

export function relativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return toISODate(new Date(ts));
}

/** "1.2.10" 형식 버전 비교: a > b 이면 양수 */
export function compareVersions(a, b) {
  const pa = String(a ?? '0').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b ?? '0').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function randomId(len = 10) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(len);
  globalThis.crypto?.getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.random() * 256; });
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}
