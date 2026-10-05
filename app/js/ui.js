// 작은 DOM 도우미: h() 요소 생성, 토스트, 모달, 파일 저장

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected' || k === 'open') el[k] = !!v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  if (value !== undefined) el.value = value;
  return el;
}

export function toast(message, type = 'info', ms = 2600) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = h('div', { class: `toast toast-${type}`, role: 'status' }, message);
  box.append(t);
  setTimeout(() => {
    t.classList.add('hide');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/**
 * actions: [{ label, kind?: 'primary'|'danger'|'ghost', value?, onClick?: () => any|false }]
 * onClick 이 false 를 반환하면 닫지 않습니다.
 */
export function openModal({ title, body, actions = [], className = '' }) {
  let resolve;
  const result = new Promise((r) => (resolve = r));
  const dlg = h('dialog', { class: `modal ${className}` });
  const close = (v) => {
    if (dlg.open) dlg.close();
    dlg.remove();
    resolve(v);
  };
  const buttons = actions.map((a) =>
    h(
      'button',
      {
        type: 'button',
        class: `btn ${a.kind ?? ''}`,
        onClick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            const r = a.onClick ? await a.onClick() : a.value;
            if (r !== false) close(r === undefined ? a.value : r);
          } finally {
            if (dlg.isConnected) e.currentTarget.disabled = false;
          }
        },
      },
      a.label,
    ),
  );
  dlg.append(
    h(
      'div',
      { class: 'modal-inner' },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': '닫기', onClick: () => close(undefined) }, '✕')),
      h('div', { class: 'modal-body' }, body),
      buttons.length ? h('div', { class: 'modal-foot' }, buttons) : null,
    ),
  );
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close(undefined);
  });
  dlg.addEventListener('click', (e) => e.target === dlg && close(undefined));
  document.body.append(dlg);
  if (dlg.showModal) dlg.showModal();
  else dlg.setAttribute('open', '');
  dlg.querySelector('input, select, textarea')?.focus();
  return { el: dlg, close, result };
}

export function confirmDialog(message, { title = '확인', ok = '확인', danger = false } = {}) {
  return openModal({
    title,
    body: h('p', null, message),
    actions: [
      { label: '취소', kind: 'ghost', value: false },
      { label: ok, kind: danger ? 'danger' : 'primary', value: true },
    ],
  }).result.then(Boolean);
}

export async function saveFile(filename, blob) {
  // 모바일에서는 공유 시트(카카오톡·드라이브 등)로 보내기, 그 외에는 다운로드
  const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type }) : null;
  const coarse = matchMedia?.('(pointer: coarse)').matches;
  if (coarse && file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: 'display:none' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const isStandalone = () => matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
