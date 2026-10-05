// 앱 시작점: 저장소 · 동기화 · 업데이터 · 라이선스 · 화면 라우팅
import { CONFIG } from './config.js';
import { APP_VERSION } from './version.js';
import { Store } from './store.js';
import { activePlans } from './license.js';
import { LICENSE_PUBLIC_KEY } from './license-key.js';
import { initUpdater } from './updater.js';
import { h, toast } from './ui.js';
import { HomeView } from './views/home.js';
import { DocView } from './views/doc.js';
import { SettingsView } from './views/settings.js';

const root = document.getElementById('app');
const store = new Store();
const bootAt = Date.now();
let userActed = false;
addEventListener('pointerdown', () => (userActed = true), { once: true });
addEventListener('keydown', () => (userActed = true), { once: true });

const app = {
  store,
  config: CONFIG,
  version: APP_VERSION,
  bus: new EventTarget(),
  plans: new Set(),
  sync: null,
  syncStatus: { state: CONFIG.firebase ? 'loading' : 'off', user: null },
  updater: null,
  updatePending: null,
  installPrompt: null,

  isUnlocked: (tpl) => !tpl.premium || app.plans.has('premium') || app.plans.has(tpl.id),
  emit: (type) => app.bus.dispatchEvent(new Event(type)),

  async refreshPlans() {
    app.plans = await activePlans(store.meta.licenses, LICENSE_PUBLIC_KEY);
    app.emit('plans');
  },

  async promptInstall() {
    const p = app.installPrompt;
    if (!p) return;
    p.prompt();
    const { outcome } = await p.userChoice;
    app.installPrompt = null;
    app.emit('install');
    if (outcome === 'accepted') toast('설치되었습니다. 바탕화면·홈 화면 아이콘으로 실행하세요.', 'ok', 4000);
  },

  async applyUpdate() {
    toast('업데이트를 적용합니다…');
    try {
      await store.persist();
      await app.sync?.flush();
      await app.updater?.apply();
    } catch (e) {
      toast(`업데이트 실패: ${e.message ?? e}`, 'err', 4000);
    }
  },
};

/* ── 라우팅: #/ · #/doc/<id> · #/settings[/섹션] · #/new/<템플릿> ── */

let current = null;

function route() {
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/');
  current?.destroy?.();
  if (view === 'doc' && arg) current = DocView(app, decodeURIComponent(arg));
  else if (view === 'settings') current = SettingsView(app, arg);
  else current = HomeView(app);
  root.replaceChildren(current.el);
  window.scrollTo(0, 0);
  if (view === 'new' && arg) {
    history.replaceState(null, '', '#/');
    current.startCreate?.(arg);
  }
}

addEventListener('hashchange', route);

store.on((evt) => {
  if (evt.type === 'error') toast('저장 공간이 부족해 저장하지 못했습니다. 백업 후 오래된 문서를 정리해 주세요.', 'err', 5000);
  if (evt.type === 'meta') app.refreshPlans();
  current?.onStoreChange?.(evt);
});

/* ── 앱 설치 (PC 바탕화면 아이콘 / 휴대폰 홈 화면) ── */

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  app.emit('install');
});
addEventListener('appinstalled', () => {
  app.installPrompt = null;
  app.emit('install');
});

/* ── 업데이트 배너 ── */

function showUpdateBanner(version) {
  const banner = document.getElementById('update-banner');
  banner.replaceChildren(
    h('span', null, `🔄 새 버전${version ? ` ${version}` : ''}이(가) 준비되었습니다.`),
    h('button', { type: 'button', class: 'btn primary sm', onClick: () => app.applyUpdate() }, '지금 업데이트'),
    h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': '닫기', onClick: () => (banner.hidden = true) }, '✕'),
  );
  banner.hidden = false;
}

async function startUpdater() {
  try {
    app.updater = await initUpdater({
      currentVersion: APP_VERSION,
      appUrl: CONFIG.appUrl,
      intervalMinutes: CONFIG.updateCheckMinutes,
      onReady: ({ version }) => {
        app.updatePending = version ?? '새 버전';
        // 앱을 막 연 상태(사용자 입력 전)라면 바로 적용, 아니면 배너로 안내
        if (store.getSetting('autoUpdate', true) && !userActed && Date.now() - bootAt < 8000) app.applyUpdate();
        else showUpdateBanner(version);
        app.emit('update');
      },
    });
    app.emit('update');
    if (app.updater.kind === 'native') app.updater.check();
  } catch (e) {
    console.warn('업데이터 초기화 실패', e);
  }
}

/* ── 동기화 ── */

async function startSync() {
  if (!CONFIG.firebase) return;
  try {
    const { initSync } = await import('./sync.js');
    app.sync = await initSync(store, CONFIG.firebase, (status) => {
      app.syncStatus = status;
      app.emit('status');
    });
  } catch (e) {
    console.error(e);
    app.syncStatus = { state: 'error', user: null, error: navigator.onLine ? '동기화 모듈을 불러오지 못했습니다.' : '오프라인 상태입니다.' };
  }
  app.emit('status');
}

/* ── 시작 ── */

await app.refreshPlans();
route();
startUpdater();
startSync();
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

// 개발·디버깅용
globalThis.templateKit = app;
