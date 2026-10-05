// 서비스 워커: 오프라인 실행 + 업데이터
// VERSION 이 바뀌면 브라우저가 새 서비스 워커를 감지해 새 파일을 미리 받아두고,
// 앱에서 "업데이트"를 누르면(또는 다음 실행 시 자동으로) 교체합니다. → 재설치 불필요
const VERSION = '1.0.0';
const SHELL_CACHE = `tk-shell-${VERSION}`;
const RUNTIME_CACHE = 'tk-runtime';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './js/config.js',
  './js/engine.js',
  './js/export.js',
  './js/format.js',
  './js/license-key.js',
  './js/license.js',
  './js/main.js',
  './js/merge.js',
  './js/store.js',
  './js/sync.js',
  './js/templates.js',
  './js/ui.js',
  './js/updater.js',
  './js/version.js',
  './js/xlsx.js',
  './js/zip.js',
  './js/views/common.js',
  './js/views/doc.js',
  './js/views/home.js',
  './js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('tk-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase SDK 스크립트: 오프라인에서도 쓰도록 캐시 (최신본은 백그라운드로 갱신)
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const net = fetch(req).then((res) => (res.ok && cache.put(req, res.clone()), res)).catch(() => hit);
        return hit ?? net;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // Firestore 등 외부 통신은 건드리지 않음

  // 버전 정보·업데이트 번들은 항상 네트워크 우선
  if (url.pathname.endsWith('/version.json') || url.pathname.includes('/bundles/')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (e) {
        if (req.mode === 'navigate') return (await cache.match('./index.html')) ?? Response.error();
        throw e;
      }
    })(),
  );
});
