// 프리미엄 라이선스 코드 (오프라인 검증, ECDSA P-256 전자서명)
// 코드 형식: TK1.<payload(base64url)>.<서명(base64url)>, payload = "plan|id|발급일"
// 앱에는 공개키만 들어 있어 코드를 위조할 수 없습니다. 개인키는 판매자 PC의 .secrets/ 에만 보관합니다.

export const LICENSE_PREFIX = 'TK1';
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const normalizeCode = (code) => String(code ?? '').replace(/\s+/g, '');

export function parseLicense(code) {
  const parts = normalizeCode(code).split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return null;
  try {
    const [plan, id, issued] = dec.decode(fromB64url(parts[1])).split('|');
    if (!plan || !id) return null;
    return { plan, id, issued, payloadB64: parts[1], sig: fromB64url(parts[2]) };
  } catch {
    return null;
  }
}

export async function signLicense({ plan, id, issued }, privateJwk, subtle = globalThis.crypto.subtle) {
  if ([plan, id, issued].some((x) => String(x).includes('|'))) throw new Error('plan/id/issued 에 | 문자를 쓸 수 없습니다');
  const payloadB64 = toB64url(enc.encode(`${plan}|${id}|${issued}`));
  const key = await subtle.importKey('jwk', privateJwk, ALG, false, ['sign']);
  const sig = new Uint8Array(await subtle.sign(SIGN, key, enc.encode(`${LICENSE_PREFIX}.${payloadB64}`)));
  return `${LICENSE_PREFIX}.${payloadB64}.${toB64url(sig)}`;
}

export async function verifyLicense(code, publicJwk, subtle = globalThis.crypto?.subtle) {
  if (!publicJwk) return { valid: false, reason: 'no-key' };
  if (!subtle) return { valid: false, reason: 'no-crypto' };
  const p = parseLicense(code);
  if (!p) return { valid: false, reason: 'format' };
  try {
    const key = await subtle.importKey('jwk', publicJwk, ALG, false, ['verify']);
    const ok = await subtle.verify(SIGN, key, p.sig, enc.encode(`${LICENSE_PREFIX}.${p.payloadB64}`));
    return ok ? { valid: true, plan: p.plan, id: p.id, issued: p.issued } : { valid: false, reason: 'signature' };
  } catch {
    return { valid: false, reason: 'signature' };
  }
}

export async function activePlans(codes, publicJwk) {
  const plans = new Set();
  for (const c of codes ?? []) {
    const r = await verifyLicense(c, publicJwk);
    if (r.valid) plans.add(r.plan);
  }
  return plans;
}

export const LICENSE_ERRORS = {
  'no-key': '판매자 공개키가 아직 설정되지 않았습니다. (docs/MONETIZE.md 참고)',
  'no-crypto': '이 환경에서는 코드 확인을 할 수 없습니다. https 주소로 접속해 주세요.',
  format: '코드 형식이 올바르지 않습니다. 받은 코드를 그대로 붙여넣어 주세요.',
  signature: '유효하지 않은 코드입니다.',
};
