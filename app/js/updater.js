// 업데이터: 다시 설치하지 않고 새 버전을 받아 적용합니다.
//  - 웹/PC/모바일 브라우저 설치(PWA): 서비스 워커가 새 파일을 미리 받아두고, 적용 시 새로고침
//  - 스토어 앱(Capacitor): @capgo/capacitor-updater 로 새 웹 번들(zip)을 받아 교체
import { compareVersions } from './format.js';

export async function fetchVersionInfo(baseUrl = './') {
  try {
    const res = await fetch(new URL('version.json', new URL(baseUrl, location.href)), { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export const isNativeApp = () => !!globalThis.Capacitor?.isNativePlatform?.();

/**
 * @param {{ currentVersion: string, appUrl: string, intervalMinutes?: number, onReady: (info: {version?: string}) => void }} opts
 */
export async function initUpdater(opts) {
  return isNativeApp() ? nativeUpdater(opts) : webUpdater(opts);
}

async function webUpdater({ currentVersion, intervalMinutes = 30, onReady }) {
  const unsupported = {
    kind: 'none',
    hasWaiting: () => false,
    apply: () => location.reload(),
    async check() {
      const info = await fetchVersionInfo();
      return { current: currentVersion, latest: info?.version, info, hasUpdate: compareVersions(info?.version, currentVersion) > 0 };
    },
  };
  if (!('serviceWorker' in navigator) || !globalThis.isSecureContext) return unsupported;

  let reg;
  try {
    reg = await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    console.warn('서비스 워커 등록 실패', e);
    return unsupported;
  }
  if (!reg) return unsupported;

  let waiting = null;
  let applying = false;
  const ready = (w) => {
    waiting = w;
    fetchVersionInfo().then((info) => onReady({ version: info?.version, info }));
  };
  const track = (w) =>
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) ready(w);
    });

  if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });

  const poll = () => reg.update().catch(() => {});
  setInterval(poll, Math.max(1, intervalMinutes) * 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && poll());

  return {
    kind: 'web',
    hasWaiting: () => !!waiting,
    apply() {
      if (!waiting) return location.reload();
      applying = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => location.reload(), 3000); // 안전장치
    },
    async check() {
      await poll();
      const info = await fetchVersionInfo();
      const newer = compareVersions(info?.version, currentVersion) > 0;
      return { current: currentVersion, latest: info?.version, info, hasUpdate: newer || !!waiting, ready: !!waiting };
    },
  };
}

async function nativeUpdater({ currentVersion, appUrl, intervalMinutes = 30, onReady }) {
  const Updater = globalThis.Capacitor?.Plugins?.CapacitorUpdater;
  Updater?.notifyAppReady?.().catch?.(() => {});
  let pending = null;

  async function check() {
    const info = await fetchVersionInfo(appUrl);
    const hasUpdate = compareVersions(info?.version, currentVersion) > 0;
    if (hasUpdate && Updater && pending?.version !== info.version) {
      pending = { version: info.version, info };
      onReady({ version: info.version, info });
    }
    return { current: currentVersion, latest: info?.version, info, hasUpdate, ready: hasUpdate && !!Updater };
  }

  setInterval(check, Math.max(1, intervalMinutes) * 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());

  return {
    kind: Updater ? 'native' : 'none',
    hasWaiting: () => !!pending,
    check,
    async apply() {
      if (!Updater || !pending) return;
      const url = new URL(`bundles/app-${pending.version}.zip`, appUrl).href;
      const bundle = await Updater.download({ url, version: pending.version });
      await Updater.set(bundle); // 앱이 새 번들로 다시 시작됩니다
    },
  };
}
