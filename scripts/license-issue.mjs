// 라이선스 코드 발급:  npm run license:issue -- --count 50 [--plan premium]
// 결과 CSV(.secrets/issued/)를 판매 플랫폼의 "자동 발송" 기능에 등록하세요.
//  - Gumroad: 상품 → Content 에 코드 목록 파일 첨부 또는 상품별 1개씩 등록
//  - 크몽/스마트스토어 디지털 상품: 구매 시 자동 발송되는 파일/메시지에 코드 포함
import { webcrypto, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { signLicense } from '../app/js/license.js';

const root = new URL('../', import.meta.url);
const privPath = new URL('.secrets/license-private.jwk.json', root);
if (!existsSync(privPath)) {
  console.error('개인키가 없습니다. 먼저 npm run license:keygen 을 실행하세요.');
  process.exit(1);
}

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const count = Math.max(1, Math.min(10000, Number(arg('count', 10))));
const plan = arg('plan', 'premium');
const priv = JSON.parse(readFileSync(privPath, 'utf8'));
const d = new Date();
const issued = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';

const lines = ['id,plan,issued,code'];
for (let i = 0; i < count; i++) {
  const id = [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join('');
  const code = await signLicense({ plan, id, issued }, priv, webcrypto.subtle);
  lines.push(`${id},${plan},${issued},${code}`);
}

mkdirSync(new URL('.secrets/issued/', root), { recursive: true });
const file = new URL(`.secrets/issued/licenses-${plan}-${issued}-${Date.now()}.csv`, root);
writeFileSync(file, lines.join('\n') + '\n');
console.log(`✔ ${count}개 발급 → ${file.pathname}`);
console.log('예시:', lines[1].split(',')[3]);
