// 아이콘 PNG 다시 만들기: app/icons/icon.svg, scripts/icons/maskable.svg → PNG
// 사용: npx playwright@1 install chromium  (최초 1회)  →  npm run icons
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright 가 필요합니다:  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const out = new URL('../app/icons/', import.meta.url);
const jobs = [
  ['../app/icons/icon.svg', 'icon-192.png', 192],
  ['../app/icons/icon.svg', 'icon-512.png', 512],
  ['../app/icons/icon.svg', 'favicon-32.png', 32],
  ['./icons/maskable.svg', 'icon-maskable-512.png', 512],
  ['./icons/maskable.svg', 'apple-touch-icon.png', 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, file, size] of jobs) {
  const svg = readFileSync(new URL(src, import.meta.url), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: new URL(file, out).pathname, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('✔', file);
}
await browser.close();
