import { h, openModal, toast, isStandalone } from '../ui.js';
import { TEMPLATES, getTemplate } from '../templates.js';
import { createDocData, makeCtx } from '../engine.js';
import { relativeTime } from '../format.js';
import { syncBadge, premiumModal } from './common.js';

export function HomeView(app) {
  const el = h('div', { class: 'view home' });
  let badge;

  function docCard(doc) {
    const tpl = getTemplate(doc.templateId);
    const count = Object.values(doc.data?.sheets ?? {}).reduce((s, rows) => s + (rows?.length ?? 0), 0);
    return h(
      'a',
      { class: 'doc-card', href: `#/doc/${encodeURIComponent(doc.id)}` },
      h('span', { class: 'doc-icon', style: `--c:${tpl?.color ?? '#868e96'}` }, tpl?.icon ?? '📄'),
      h('span', { class: 'doc-text' }, h('strong', null, doc.title || '제목 없음'), h('small', null, `${tpl?.name ?? '알 수 없는 템플릿'} · ${count}개 항목 · ${relativeTime(doc.updatedAt)}`)),
    );
  }

  function templateCard(tpl) {
    const locked = !app.isUnlocked(tpl);
    return h(
      'button',
      { type: 'button', class: `tpl-card${locked ? ' locked' : ''}`, style: `--c:${tpl.color}`, onClick: () => startCreate(tpl.id) },
      h('span', { class: 'tpl-icon' }, tpl.icon),
      h('strong', null, tpl.name, tpl.premium ? h('span', { class: 'pill' }, locked ? '🔒 프리미엄' : '프리미엄') : null),
      h('small', null, tpl.description),
    );
  }

  function installHint() {
    if (isStandalone() || app.store.getSetting('hideInstallHint', false)) return null;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!app.installPrompt && !ios) return null;
    return h(
      'div',
      { class: 'hint' },
      h('span', null, ios ? '📲 공유 버튼 → “홈 화면에 추가”를 누르면 앱처럼 아이콘으로 실행할 수 있어요.' : '📲 앱으로 설치하면 바탕화면·홈 화면 아이콘을 두 번(한 번) 눌러 바로 실행할 수 있어요.'),
      h(
        'span',
        { class: 'row gap' },
        !ios ? h('button', { type: 'button', class: 'btn primary sm', onClick: () => app.promptInstall() }, '설치') : null,
        h('button', { type: 'button', class: 'btn ghost sm', onClick: () => { app.store.setSetting('hideInstallHint', true); render(); } }, '닫기'),
      ),
    );
  }

  function render() {
    badge?.off();
    badge = syncBadge(app);
    const docs = app.store.list();
    const parts = [
      h(
        'header',
        { class: 'topbar' },
        h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '', width: 28, height: 28 }), h('span', null, app.config.appName)),
        h('div', { class: 'row gap' }, badge, h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': '설정', title: '설정' }, '⚙️')),
      ),
      installHint(),
      app.updatePending ? h('div', { class: 'hint' }, h('span', null, `🔄 새 버전 ${app.updatePending}이(가) 준비되었습니다.`), h('button', { type: 'button', class: 'btn primary sm', onClick: () => app.applyUpdate() }, '업데이트')) : null,
      h('section', null,
        h('div', { class: 'section-head' }, h('h2', null, '내 문서'), docs.length ? h('span', { class: 'muted small' }, `${docs.length}개`) : null),
        docs.length
          ? h('div', { class: 'doc-list' }, docs.map(docCard))
          : h('div', { class: 'empty' }, h('p', null, '아직 문서가 없습니다.'), h('p', { class: 'muted small' }, '아래에서 템플릿을 골라 첫 문서를 만들어 보세요.')),
      ),
      h('section', null, h('div', { class: 'section-head' }, h('h2', null, '템플릿')), h('div', { class: 'tpl-grid' }, TEMPLATES.map(templateCard))),
      h('footer', { class: 'foot muted small' }, `${app.config.appName} v${app.version}`),
    ];
    el.replaceChildren(...parts.filter(Boolean));
  }

  function startCreate(templateId) {
    const tpl = getTemplate(templateId);
    if (!tpl) return toast('알 수 없는 템플릿입니다.', 'err');
    if (!app.isUnlocked(tpl)) return premiumModal(app, tpl);
    const title = h('input', { class: 'input', value: tpl.name, maxlength: 60, 'aria-label': '문서 이름' });
    const sample = h('input', { type: 'checkbox', checked: app.store.list().length === 0 });
    const create = () => {
      const data = createDocData(tpl, { withSample: sample.checked, ctx: makeCtx() });
      const doc = app.store.create({ templateId: tpl.id, title: title.value.trim() || tpl.name, data });
      location.hash = `#/doc/${encodeURIComponent(doc.id)}`;
    };
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        modal.close();
        create();
      }
    });
    const modal = openModal({
      title: `${tpl.icon} 새 ${tpl.name}`,
      body: h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', null, '문서 이름'), title), h('label', { class: 'check' }, sample, h('span', null, '예시 데이터로 시작하기'))),
      actions: [
        { label: '취소', kind: 'ghost' },
        { label: '만들기', kind: 'primary', onClick: create },
      ],
    });
    title.select();
  }

  render();
  const rerender = () => render();
  app.bus.addEventListener('plans', rerender);
  app.bus.addEventListener('install', rerender);
  app.bus.addEventListener('update', rerender);

  return {
    el,
    startCreate,
    onStoreChange: (evt) => evt.type !== 'meta' && render(),
    destroy() {
      badge?.off();
      app.bus.removeEventListener('plans', rerender);
      app.bus.removeEventListener('install', rerender);
      app.bus.removeEventListener('update', rerender);
    },
  };
}
