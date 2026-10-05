// 배포 전 점검: 버전 일치, 서비스 워커 캐시 목록, 매니페스트 아이콘
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const APP = join(ROOT, 'app');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('version is identical everywhere', () => {
  const v = JSON.parse(read('app/version.json')).version;
  assert.match(v, /^\d+\.\d+\.\d+$/);
  assert.equal(read('app/js/version.js').match(/APP_VERSION = '([^']+)'/)[1], v);
  assert.equal(read('app/sw.js').match(/const VERSION = '([^']+)'/)[1], v);
  assert.equal(JSON.parse(read('package.json')).version, v);
  assert.equal(JSON.parse(read('app/version.json')).history[0].version, v);
});

test('service worker precaches every app file (and only existing ones)', () => {
  const sw = read('app/sw.js');
  const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const f of listed) assert.ok(existsSync(join(APP, f)), `sw.js 목록에 없는 파일: ${f}`);
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const skip = new Set(['sw.js', 'version.json']);
  for (const file of walk(APP).map((f) => relative(APP, f).split('\\').join('/'))) {
    if (skip.has(file) || file.startsWith('bundles/')) continue;
    assert.ok(listed.includes(file), `sw.js SHELL 목록에 추가하세요: ./${file}`);
  }
});

test('manifest icons exist', () => {
  const m = JSON.parse(read('app/manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  for (const icon of m.icons) assert.ok(existsSync(join(APP, icon.src)), icon.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});
