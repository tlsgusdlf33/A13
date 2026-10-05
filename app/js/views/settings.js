import { h, toast, confirmDialog, saveFile, isStandalone } from '../ui.js';
import { TEMPLATES } from '../templates.js';
import { verifyLicense, normalizeCode, LICENSE_ERRORS } from '../license.js';
import { LICENSE_PUBLIC_KEY } from '../license-key.js';
import { authErrorMessage } from '../sync.js';
import { SYNC_LABEL, premiumModal } from './common.js';
import { toISODate } from '../format.js';

export function SettingsView(app, focus) {
  const el = h('div', { class: 'view settings' });
  let cachedInfo; // version.json (업데이트 내역) — 화면당 한 번만 받아옴

  const section = (id, title, ...body) => h('section', { class: 'card', id: `set-${id}` }, h('h2', null, title), ...body);

  /* ── 계정 · 동기화 ── */
  function accountSection() {
    if (!app.config.firebase) {
      return section(
        'account',
        '계정 · 동기화',
        h('p', null, '지금은 이 기기에만 저장됩니다.'),
        h('p', { class: 'muted small' }, 'PC와 휴대폰을 같은 계정으로 연동하려면 app/js/config.js 에 Firebase 설정을 넣고 다시 배포하세요. (docs/FIREBASE.md)'),
      );
    }
    const s = app.syncStatus;
    if (!app.sync) {
      return section('account', '계정 · 동기화', h('p', { class: 'muted' }, s.state === 'error' ? `연결 실패: ${s.error ?? ''}` : '동기화 모듈을 불러오는 중…'));
    }
    if (s.user) {
      const [label] = SYNC_LABEL[s.state] ?? ['—'];
      return section(
        'account',
        '계정 · 동기화',
        h('p', null, h('strong', null, s.user.email ?? s.user.name ?? '로그인됨')),
        h('p', { class: 'muted small' }, `상태: ${label}${s.error ? ` — ${s.error}` : ''}`),
        h('p', { class: 'muted small' }, '같은 계정으로 로그인한 PC·휴대폰의 문서와 프리미엄 등록이 자동으로 맞춰집니다.'),
        h(
          'div',
          { class: 'row gap wrap' },
          h('button', { type: 'button', class: 'btn', onClick: () => app.sync.flush().then(() => toast('동기화를 요청했습니다.')) }, '지금 동기화'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn ghost',
              onClick: async () => {
                if (!(await confirmDialog('로그아웃할까요? 이 기기에 저장된 문서는 그대로 남습니다.', { ok: '로그아웃' }))) return;
                await app.sync.signOut();
                toast('로그아웃했습니다.');
              },
            },
            '로그아웃',
          ),
        ),
      );
    }

    const email = h('input', { type: 'email', class: 'input', placeholder: '이메일', autocomplete: 'email' });
    const pw = h('input', { type: 'password', class: 'input', placeholder: '비밀번호 (6자 이상)', autocomplete: 'current-password' });
    const run = (fn, ok) => async () => {
      try {
        await fn();
        if (ok) toast(ok, 'ok');
      } catch (e) {
        toast(authErrorMessage(e), 'err', 4000);
      }
    };
    return section(
      'account',
      '계정 · 동기화',
      h('p', { class: 'muted small' }, '로그인하면 PC와 휴대폰에서 같은 문서를 볼 수 있습니다. 지금 이 기기에 있는 문서는 로그인한 계정으로 올라갑니다.'),
      h('div', { class: 'stack' }, email, pw),
      h(
        'div',
        { class: 'row gap wrap' },
        h('button', { type: 'button', class: 'btn primary', onClick: run(() => app.sync.signIn(email.value.trim(), pw.value), '로그인했습니다.') }, '로그인'),
        h('button', { type: 'button', class: 'btn', onClick: run(() => app.sync.signUp(email.value.trim(), pw.value), '가입했습니다.') }, '회원가입'),
        h('button', { type: 'button', class: 'btn ghost', onClick: run(() => app.sync.signInWithGoogle()) }, 'Google로 로그인'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'link-btn small',
          onClick: run(() => {
            if (!email.value.trim()) throw new Error('이메일을 먼저 입력해 주세요.');
            return app.sync.resetPassword(email.value.trim());
          }, '비밀번호 재설정 메일을 보냈습니다.'),
        },
        '비밀번호를 잊으셨나요?',
      ),
    );
  }

  /* ── 앱 설치 ── */
  function installSection() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let body;
    if (isStandalone()) body = h('p', null, '✅ 앱으로 설치되어 실행 중입니다.');
    else if (app.installPrompt) body = h('button', { type: 'button', class: 'btn primary', onClick: () => app.promptInstall() }, '이 기기에 앱 설치');
    else if (ios) body = h('p', null, 'Safari 하단의 공유 버튼(□↑) → “홈 화면에 추가”를 누르세요.');
    else body = h('p', { class: 'muted small' }, 'Chrome·Edge 주소창 오른쪽의 설치(⊕) 아이콘이나 메뉴 → “앱 설치”를 누르세요.');
    return section(
      'install',
      '앱 설치 (바탕화면 · 홈 화면 아이콘)',
      body,
      h('p', { class: 'muted small' }, 'PC: 설치 후 바탕화면/시작 메뉴의 아이콘을 두 번 클릭하면 별도 창으로 실행됩니다. 휴대폰: 홈 화면 아이콘을 누르면 앱처럼 열립니다.'),
    );
  }

  /* ── 업데이트 ── */
  function updateSection() {
    const result = h('p', { class: 'small', 'aria-live': 'polite' });
    const auto = h('input', { type: 'checkbox', checked: app.store.getSetting('autoUpdate', true), onChange: (e) => app.store.setSetting('autoUpdate', e.target.checked) });
    const notes = h('div', { class: 'changelog' }, h('p', { class: 'muted small' }, '업데이트 내역을 불러오는 중…'));
    const showNotes = (info) => {
      const history = info?.history ?? [];
      notes.replaceChildren(
        ...(history.length
          ? history.slice(0, 5).map((v) => h('div', null, h('strong', null, `v${v.version}`), h('span', { class: 'muted small' }, ` ${v.date ?? ''}`), h('ul', null, (v.notes ?? []).map((n) => h('li', null, n)))))
          : [h('p', { class: 'muted small' }, '업데이트 내역을 불러올 수 없습니다(오프라인).')]),
      );
    };
    if (cachedInfo !== undefined) showNotes(cachedInfo);
    else if (app.updater)
      app.updater
        .check()
        .then((r) => showNotes((cachedInfo = r.info ?? null)))
        .catch(() => showNotes((cachedInfo = null)));

    const check = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      result.textContent = '확인 중…';
      try {
        const r = await app.updater.check();
        showNotes((cachedInfo = r.info ?? null));
        if (!r.latest && !r.ready) result.textContent = '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.';
        else if (r.ready) {
          result.replaceChildren(`새 버전 ${r.latest ?? ''}이(가) 준비되었습니다. `, h('button', { type: 'button', class: 'btn primary sm', onClick: () => app.applyUpdate() }, '지금 업데이트'));
        } else if (r.hasUpdate) result.textContent = `새 버전 ${r.latest}을(를) 내려받는 중입니다. 잠시 후 업데이트 버튼이 나타납니다.`;
        else result.textContent = '✅ 최신 버전입니다.';
      } finally {
        btn.disabled = false;
      }
    };

    return section(
      'update',
      '업데이트',
      h('p', null, `현재 버전 v${app.version}`, app.updater?.kind === 'native' ? ' (앱 내 업데이트)' : ''),
      h('div', { class: 'row gap wrap' }, h('button', { type: 'button', class: 'btn', onClick: check, disabled: !app.updater }, '업데이트 확인'), app.updatePending ? h('button', { type: 'button', class: 'btn primary', onClick: () => app.applyUpdate() }, `v${app.updatePending} 적용`) : null),
      result,
      h('label', { class: 'check' }, auto, h('span', null, '앱을 열 때 새 버전이 있으면 자동으로 적용')),
      h('p', { class: 'muted small' }, '다시 설치할 필요 없이, 새 버전은 백그라운드에서 받아진 뒤 적용됩니다. 데이터는 그대로 유지됩니다.'),
      notes,
    );
  }

  /* ── 프리미엄 ── */
  function premiumSection() {
    const premium = TEMPLATES.filter((t) => t.premium);
    const unlocked = premium.filter((t) => app.isUnlocked(t));
    const input = h('textarea', { class: 'input mono', rows: 3, placeholder: 'TK1.xxxxx.xxxxx 형식의 라이선스 코드를 붙여넣으세요', 'aria-label': '라이선스 코드' });
    const register = async () => {
      const code = normalizeCode(input.value);
      if (!code) return toast('코드를 입력해 주세요.', 'err');
      const r = await verifyLicense(code, LICENSE_PUBLIC_KEY);
      if (!r.valid) return toast(LICENSE_ERRORS[r.reason] ?? '유효하지 않은 코드입니다.', 'err', 4000);
      app.store.addLicense(code);
      input.value = '';
      toast('프리미엄이 등록되었습니다! 🎉', 'ok');
    };
    return section(
      'premium',
      '프리미엄',
      h('p', null, unlocked.length === premium.length ? '✅ 모든 프리미엄 템플릿을 사용할 수 있습니다.' : `프리미엄 템플릿: ${premium.map((t) => `${t.icon} ${t.name}`).join(', ')}`),
      unlocked.length === premium.length
        ? null
        : h(
            'div',
            { class: 'stack' },
            input,
            h(
              'div',
              { class: 'row gap wrap' },
              h('button', { type: 'button', class: 'btn primary', onClick: register }, '코드 등록'),
              app.config.purchaseUrl ? h('a', { class: 'btn', href: app.config.purchaseUrl, target: '_blank', rel: 'noopener' }, '구매하기') : h('button', { type: 'button', class: 'btn ghost', onClick: () => premiumModal(app) }, '자세히'),
            ),
          ),
      h('p', { class: 'muted small' }, `등록된 코드 ${app.store.meta.licenses.length}개 · 로그인하면 다른 기기에도 자동 적용됩니다.`),
    );
  }

  /* ── 데이터 ── */
  function dataSection() {
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const n = app.store.importBackup(JSON.parse(await f.text()));
        toast(`${n}개 문서를 복원했습니다.`, 'ok');
      } catch (e) {
        toast(e.message, 'err', 4000);
      }
      file.value = '';
    });
    return section(
      'data',
      '데이터',
      h('p', { class: 'muted small' }, `이 기기에 문서 ${app.store.list().length}개가 저장되어 있습니다.`),
      h(
        'div',
        { class: 'row gap wrap' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onClick: () => saveFile(`templatekit-backup-${toISODate()}.json`, new Blob([JSON.stringify(app.store.exportBackup(app.version), null, 2)], { type: 'application/json' })),
          },
          '백업 파일 저장',
        ),
        h('button', { type: 'button', class: 'btn', onClick: () => file.click() }, '백업 불러오기'),
        file,
      ),
    );
  }

  function render() {
    el.replaceChildren(
      h('header', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#/', 'aria-label': '뒤로' }, '←'), h('h1', { class: 'grow' }, '설정')),
      accountSection(),
      installSection(),
      updateSection(),
      premiumSection(),
      dataSection(),
      h('footer', { class: 'foot muted small' }, `${app.config.appName} v${app.version}`),
    );
  }

  render();
  if (focus) requestAnimationFrame(() => el.querySelector(`#set-${focus}`)?.scrollIntoView({ behavior: 'smooth' }));

  const rerender = () => {
    if (!el.contains(document.activeElement) || !document.activeElement.matches('input, textarea')) render();
  };
  const events = ['status', 'plans', 'install', 'update'];
  for (const e of events) app.bus.addEventListener(e, rerender);
  return {
    el,
    onStoreChange: (evt) => evt.type === 'meta' && rerender(),
    destroy: () => events.forEach((e) => app.bus.removeEventListener(e, rerender)),
  };
}
