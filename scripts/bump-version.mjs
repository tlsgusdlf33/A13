// 새 버전 배포 준비:  npm run bump -- <patch|minor|major|x.y.z> "변경 내용 1" "변경 내용 2"
// app/js/version.js · app/sw.js · app/version.json · package.json 의 버전을 한 번에 올립니다.
// 커밋 후 main 브랜치에 push 하면 GitHub Actions 가 배포하고, 설치된 앱들은 업데이터로 자동 갱신됩니다.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const write = (p, s) => writeFileSync(new URL(p, root), s);

const [kind = 'patch', ...notes] = process.argv.slice(2);
const info = JSON.parse(read('app/version.json'));
const [ma, mi, pa] = info.version.split('.').map(Number);
const next =
  kind === 'major' ? `${ma + 1}.0.0` : kind === 'minor' ? `${ma}.${mi + 1}.0` : kind === 'patch' ? `${ma}.${mi}.${pa + 1}` : /^\d+\.\d+\.\d+$/.test(kind) ? kind : null;
if (!next) {
  console.error('사용법: npm run bump -- <patch|minor|major|x.y.z> "변경 내용" ...');
  process.exit(1);
}

const d = new Date();
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
info.version = next;
info.date = date;
info.history = [{ version: next, date, notes: notes.length ? notes : ['개선 및 오류 수정'] }, ...(info.history ?? [])].slice(0, 30);
write('app/version.json', JSON.stringify(info, null, 2) + '\n');

write('app/js/version.js', read('app/js/version.js').replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${next}'`));
write('app/sw.js', read('app/sw.js').replace(/const VERSION = '[^']*'/, `const VERSION = '${next}'`));
const pkg = JSON.parse(read('package.json'));
pkg.version = next;
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log(`✔ ${next} 로 올렸습니다. 이제 커밋하고 main 에 push 하면 배포됩니다.`);
