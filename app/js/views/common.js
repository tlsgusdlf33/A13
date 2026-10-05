import { h, openModal } from '../ui.js';
import { TEMPLATES } from '../templates.js';

export const SYNC_LABEL = {
  off: ['이 기기에 저장', 'muted'],
  loading: ['동기화 준비 중…', 'muted'],
  signedOut: ['로그인하면 동기화', 'warn'],
  syncing: ['동기화 중…', 'info'],
  synced: ['동기화됨', 'ok'],
  offline: ['오프라인 · 연결되면 동기화', 'warn'],
  error: ['동기화 오류', 'err'],
};

/** 동기화 상태 배지 (app.bus 'status' 이벤트로 자동 갱신). destroy 시 off() 호출 */
export function syncBadge(app) {
  const el = h('a', { class: 'badge', href: '#/settings', title: '계정 · 동기화 설정' });
  const update = () => {
    const [label, tone] = SYNC_LABEL[app.syncStatus.state] ?? SYNC_LABEL.off;
    el.className = `badge badge-${tone}`;
    el.textContent = label;
  };
  update();
  app.bus.addEventListener('status', update);
  el.off = () => app.bus.removeEventListener('status', update);
  return el;
}

export function premiumModal(app, template) {
  const premium = TEMPLATES.filter((t) => t.premium);
  return openModal({
    title: '프리미엄 템플릿',
    body: h(
      'div',
      { class: 'stack' },
      h('p', null, template ? `'${template.name}'은(는) 프리미엄 템플릿입니다.` : '프리미엄을 등록하면 아래 템플릿을 모두 사용할 수 있습니다.'),
      h('ul', { class: 'plain-list' }, premium.map((t) => h('li', null, `${t.icon} ${t.name} — ${t.description}`))),
      app.config.priceText ? h('p', { class: 'muted' }, app.config.priceText) : null,
      h('p', { class: 'muted small' }, '구매 후 받은 라이선스 코드를 설정 → 프리미엄에 붙여넣으면 바로 열립니다. 같은 계정으로 로그인한 PC·휴대폰 모두에 적용됩니다.'),
    ),
    actions: [
      { label: '코드 입력', kind: 'ghost', onClick: () => void (location.hash = '#/settings/premium') },
      app.config.purchaseUrl ? { label: '구매하기', kind: 'primary', onClick: () => void window.open(app.config.purchaseUrl, '_blank', 'noopener') } : null,
    ].filter(Boolean),
  });
}
