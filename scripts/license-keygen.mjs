// 판매자 서명키 만들기 (최초 1회):  npm run license:keygen
//  - 개인키: .secrets/license-private.jwk.json  ← 절대 공유·커밋 금지, 따로 백업!
//  - 공개키: app/js/license-key.js 에 자동 기록 (앱에 포함되어 코드 검증에 사용)
import { webcrypto } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const privPath = new URL('.secrets/license-private.jwk.json', root);
if (existsSync(privPath) && !process.argv.includes('--force')) {
  console.error('이미 개인키가 있습니다. 새로 만들면 이전에 판매한 코드가 모두 무효가 됩니다.\n정말 새로 만들려면: npm run license:keygen -- --force');
  process.exit(1);
}

const { subtle } = webcrypto;
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await subtle.exportKey('jwk', pair.privateKey);
const { kty, crv, x, y } = await subtle.exportKey('jwk', pair.publicKey);

mkdirSync(new URL('.secrets/', root), { recursive: true });
writeFileSync(privPath, JSON.stringify(priv, null, 2), { mode: 0o600 });
writeFileSync(
  new URL('app/js/license-key.js', root),
  `// 판매자 공개키 (npm run license:keygen 으로 생성). 공개돼도 안전합니다.\nexport const LICENSE_PUBLIC_KEY = ${JSON.stringify({ kty, crv, x, y })};\n`,
);
console.log('✔ 개인키: .secrets/license-private.jwk.json (백업 필수, 커밋 금지)');
console.log('✔ 공개키: app/js/license-key.js 갱신 → 버전을 올리고 배포하세요 (npm run bump)');
