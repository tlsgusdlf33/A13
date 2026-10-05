// 로컬 테스트 서버:  npm start  →  http://localhost:5173
// (같은 와이파이의 휴대폰에서도 http://<PC의 IP>:5173 으로 접속해 화면을 볼 수 있습니다.
//  단, 설치·업데이터·동기화는 https 주소(배포 후)에서만 완전히 동작합니다.)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../app/', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
};

createServer(async (req, res) => {
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (path.startsWith('..')) throw new Error('bad path');
    let file = join(ROOT, path);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`템플릿킷 로컬 서버: http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces()))
    for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  같은 와이파이의 휴대폰: http://${n.address}:${PORT}`);
});
