import { h, openModal, toast, confirmDialog, saveFile } from '../ui.js';
import { getTemplate } from '../templates.js';
import { makeCtx, makeRow, getRows, isPeriodic, visibleRows, breakdown, cellValue } from '../engine.js';
import { currentMonth, shiftMonth, monthLabel, fmtNumber, parseNumber, formatSummary } from '../format.js';
import { exportXlsxBytes, toCsv, safeFileName } from '../export.js';
import { syncBadge } from './common.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const viewStates = new Map(); // 문서별 보기 상태(시트·기간·검색·정렬) 기억

export function DocView(app, docId) {
  const el = h('div', { class: 'view doc' });
  let doc = app.store.get(docId);
  const tpl = doc && getTemplate(doc.templateId);
  let badge;
  let pendingRemote = false;

  if (!doc || !tpl) {
    el.append(
      h('header', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#/', 'aria-label': '뒤로' }, '←'), h('div', { class: 'grow' })),
      h(
        'div',
        { class: 'empty' },
        h('p', null, doc ? '이 문서의 템플릿은 최신 버전에서 지원됩니다.' : '문서를 찾을 수 없습니다.'),
        doc ? h('button', { type: 'button', class: 'btn primary', onClick: () => (location.hash = '#/settings') }, '업데이트 확인') : h('a', { class: 'btn', href: '#/' }, '홈으로'),
      ),
    );
    return { el };
  }

  const st = viewStates.get(docId) ?? {
    sheetKey: tpl.sheets[0].key,
    period: tpl.defaultPeriod === 'month' ? currentMonth() : 'all',
    search: '',
    sort: null,
  };
  viewStates.set(docId, st);

  const sheet = () => tpl.sheets.find((s) => s.key === st.sheetKey) ?? tpl.sheets[0];
  const ctx = () => makeCtx(doc.data, st.period);
  const rows = () => getRows(doc.data, sheet().key);
  const shown = () => {
    const list = visibleRows(sheet(), rows(), st, ctx());
    // 방금 추가한 행은 정렬과 상관없이 맨 위에 보여줌 (보기 조건이 바뀌면 해제)
    const i = st.pinned ? list.findIndex((r) => r._id === st.pinned) : -1;
    return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
  };

  const summaryBox = h('div', { class: 'summary' });
  const breakdownBox = h('div', { class: 'breakdown' });

  function mutate(fn, { rerender = false } = {}) {
    doc = app.store.update(docId, fn) ?? doc;
    if (rerender) render();
    else refreshDerived();
  }

  /* ── 셀 편집기 ── */

  function setCell(rowId, key, value) {
    mutate((d) => {
      const r = d.data.sheets[sheet().key]?.find((x) => x._id === rowId);
      if (r) r[key] = value;
    });
  }

  function cellEditor(col, row) {
    const commit = (v) => setCell(row._id, col.key, v);
    const label = col.label;
    const v = row[col.key];
    switch (col.type) {
      case 'check':
        return h('input', { type: 'checkbox', class: 'cell-check', checked: !!v, 'aria-label': label, onChange: (e) => commit(e.target.checked) });
      case 'select': {
        const opts = [...col.options];
        if (v && !opts.includes(v)) opts.push(v);
        return h('select', { class: 'cell-input', 'aria-label': label, value: v ?? '', onChange: (e) => commit(e.target.value) }, h('option', { value: '' }, '—'), opts.map((o) => h('option', { value: o }, o)));
      }
      case 'date':
      case 'time':
        return h('input', { type: col.type, class: 'cell-input', 'aria-label': label, value: v ?? '', onChange: (e) => commit(e.target.value) });
      case 'currency':
      case 'number': {
        const show = (x) => (x === '' || x == null ? '' : col.type === 'currency' ? fmtNumber(x) : String(x));
        const inp = h('input', { type: 'text', inputmode: 'numeric', class: 'cell-input num', 'aria-label': label, placeholder: '0', value: show(v) });
        inp.addEventListener('focus', () => {
          inp.value = inp.value.replace(/,/g, '');
          inp.select();
        });
        inp.addEventListener('change', () => commit(inp.value.trim() === '' ? '' : parseNumber(inp.value)));
        inp.addEventListener('blur', () => {
          inp.value = show(inp.value.trim() === '' ? '' : parseNumber(inp.value));
        });
        return inp;
      }
      default:
        return h('input', { type: 'text', class: 'cell-input', 'aria-label': label, value: v ?? '', onChange: (e) => commit(e.target.value) });
    }
  }

  function computedText(col, row) {
    const v = cellValue(col, row, ctx());
    return col.type === 'currency' ? fmtNumber(v) : String(v ?? '');
  }

  /* ── 파생 영역(요약·분류별·계산 열)만 다시 그림: 입력 포커스 유지 ── */

  function refreshDerived() {
    const c = ctx();
    const list = shown();
    const s = sheet();
    const items = s.summary ? s.summary(list, c) : [];
    summaryBox.replaceChildren(
      ...items.map((it) => h('div', { class: `stat ${it.tone ? `tone-${it.tone}` : ''}` }, h('small', null, it.label), h('strong', null, formatSummary(it)))),
    );
    const bd = breakdown(s, list, c);
    breakdownBox.hidden = !bd.length;
    breakdownBox.replaceChildren(
      h('h3', null, s.breakdown?.title ?? ''),
      ...bd.slice(0, 8).map((b) =>
        h(
          'div',
          { class: 'bar-row' },
          h('span', { class: 'bar-label' }, b.label),
          h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${Math.max(2, b.bar * 100)}%;--c:${tpl.color}` })),
          h('span', { class: 'bar-value' }, s.breakdown.value == null ? `${fmtNumber(b.value)}${s.breakdown.unit ?? ''}` : `${fmtNumber(b.value)}원`),
        ),
      ),
    );
    for (const span of el.querySelectorAll('[data-computed]')) {
      const row = rows().find((r) => r._id === span.dataset.row);
      const col = s.columns.find((x) => x.key === span.dataset.computed);
      if (row && col) span.textContent = computedText(col, row);
    }
  }

  /* ── 화면 구성 ── */

  function header() {
    badge?.off();
    badge = syncBadge(app);
    const title = h('input', { class: 'title-input', value: doc.title, maxlength: 60, 'aria-label': '문서 이름' });
    title.addEventListener('change', () => {
      const t = title.value.trim() || tpl.name;
      title.value = t;
      mutate((d) => {
        d.title = t;
      });
    });
    return h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': '뒤로', title: '목록' }, '←'),
      h('span', { class: 'doc-icon sm', style: `--c:${tpl.color}` }, tpl.icon),
      title,
      h('div', { class: 'row gap' }, badge, h('button', { type: 'button', class: 'icon-btn', 'aria-label': '메뉴', title: '내보내기 · 메뉴', onClick: openMenu }, '⋯')),
    );
  }

  function periodBar() {
    if (!isPeriodic(tpl)) return null;
    if (st.period === 'all') {
      return h(
        'div',
        { class: 'period' },
        h('strong', null, '전체 기간'),
        h('button', { type: 'button', class: 'btn ghost sm', onClick: () => { st.period = currentMonth(); render(); } }, '월별 보기'),
      );
    }
    const go = (d) => () => {
      st.period = shiftMonth(st.period, d);
      st.pinned = null;
      render();
    };
    return h(
      'div',
      { class: 'period' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '이전 달', onClick: go(-1) }, '‹'),
      h('strong', null, monthLabel(st.period)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': '다음 달', onClick: go(1) }, '›'),
      h('button', { type: 'button', class: 'btn ghost sm', onClick: () => { st.period = 'all'; render(); } }, '전체'),
    );
  }

  function tabs() {
    if (tpl.sheets.length < 2) return null;
    return h(
      'nav',
      { class: 'tabs', role: 'tablist' },
      tpl.sheets.map((s) =>
        h(
          'button',
          { type: 'button', role: 'tab', class: `tab${s.key === sheet().key ? ' active' : ''}`, 'aria-selected': String(s.key === sheet().key), onClick: () => { st.sheetKey = s.key; st.sort = null; st.search = ''; st.pinned = null; render(); } },
          s.name,
          h('span', { class: 'tab-count' }, getRows(doc.data, s.key).length),
        ),
      ),
    );
  }

  function toolbar() {
    const search = h('input', { type: 'search', class: 'input', placeholder: '검색', value: st.search, 'aria-label': '검색' });
    let t;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        st.search = search.value;
        renderTable();
        refreshDerived();
      }, 200);
    });
    return h('div', { class: 'toolbar' }, search, h('button', { type: 'button', class: 'btn primary', onClick: addRow }, '+ 추가'));
  }

  const tableBox = h('div', { class: 'table-wrap' });

  function renderTable() {
    const s = sheet();
    const list = shown();
    const sortState = st.sort ?? s.defaultSort;
    const th = (c) => {
      const active = sortState?.key === c.key;
      const arrow = active ? (sortState.dir === 'desc' ? ' ▼' : ' ▲') : '';
      return h('th', { scope: 'col', class: c.type === 'currency' || c.type === 'number' ? 'num' : '' }, h('button', { type: 'button', class: 'th-btn', onClick: () => toggleSort(c.key) }, c.label, arrow));
    };
    const tr = (row) =>
      h(
        'tr',
        { dataset: { id: row._id } },
        s.columns.map((c) =>
          h(
            'td',
            { 'data-label': c.label, class: `t-${c.type}${c.computed ? ' computed' : ''}` },
            c.computed ? h('span', { class: 'computed-val', dataset: { computed: c.key, row: row._id } }, computedText(c, row)) : cellEditor(c, row),
          ),
        ),
        h('td', { class: 'row-actions' }, h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': '행 삭제', title: '삭제', onClick: () => deleteRow(row._id) }, '✕')),
      );
    const empty = h(
      'tr',
      { class: 'empty-row' },
      h('td', { colspan: s.columns.length + 1 }, rows().length ? '조건에 맞는 항목이 없습니다.' : '아직 항목이 없습니다. “+ 추가”를 눌러 시작하세요.'),
    );
    tableBox.replaceChildren(
      h('table', { class: 'grid' }, h('thead', null, h('tr', null, s.columns.map(th), h('th', { class: 'row-actions' }))), h('tbody', null, list.length ? list.map(tr) : empty)),
    );
  }

  function render() {
    pendingRemote = false;
    renderTable();
    el.replaceChildren(...[header(), periodBar(), tabs(), summaryBox, breakdownBox, toolbar(), tableBox].filter(Boolean));
    refreshDerived();
  }

  /* ── 동작 ── */

  function toggleSort(key) {
    const cur = st.sort ?? sheet().defaultSort;
    st.pinned = null;
    st.sort = cur?.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : { key: null };
    renderTable();
  }

  function addRow() {
    const s = sheet();
    const row = makeRow(s, ctx());
    // 월별 보기 중이면 새 항목이 그 달에 보이도록 기준 날짜를 채움
    if (s.periodKey && st.period !== 'all' && !row[s.periodKey]) row[s.periodKey] = ctx().newRowDate;
    st.search = '';
    st.pinned = row._id;
    mutate((d) => {
      (d.data.sheets[sheet().key] ??= []).push(row);
    }, { rerender: true });
    const tr = tableBox.querySelector(`tr[data-id="${row._id}"]`);
    tr?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    tr?.querySelector('input[type=text], input:not([type]), select')?.focus({ preventScroll: true });
  }

  async function deleteRow(rowId) {
    const r = rows().find((x) => x._id === rowId);
    const filled = r && Object.entries(r).some(([k, v]) => k !== '_id' && v !== '' && v != null && v !== false);
    if (filled && !(await confirmDialog('이 항목을 삭제할까요?', { ok: '삭제', danger: true }))) return;
    mutate((d) => {
      d.data.sheets[sheet().key] = (d.data.sheets[sheet().key] ?? []).filter((x) => x._id !== rowId);
    }, { rerender: true });
  }

  function openMenu() {
    const name = safeFileName(doc.title);
    const item = (icon, title, desc, fn) =>
      h('button', { type: 'button', class: 'menu-item', onClick: async () => { modal.close(); await fn(); } }, h('span', { class: 'menu-icon' }, icon), h('span', null, h('strong', null, title), h('small', null, desc)));
    const modal = openModal({
      title: '내보내기 · 관리',
      body: h(
        'div',
        { class: 'menu' },
        item('📊', '엑셀(.xlsx)로 저장', '모든 시트 · 합계/계산 수식 포함', () =>
          saveFile(`${name}.xlsx`, new Blob([exportXlsxBytes(tpl, doc, { appName: app.config.appName })], { type: XLSX_MIME }))),
        item('📄', `CSV로 저장 (${sheet().name})`, '현재 보이는 항목만', () =>
          saveFile(`${name}-${sheet().name}.csv`, new Blob([toCsv(sheet(), shown(), ctx())], { type: 'text/csv;charset=utf-8' }))),
        item('🧾', '빈 엑셀 양식 만들기 (판매용)', '안내 시트 · 드롭다운 · 자동계산 수식이 들어간 빈 템플릿', () =>
          saveFile(`${safeFileName(tpl.name)}_양식.xlsx`, new Blob([exportXlsxBytes(tpl, null, { blank: true, appName: app.config.appName })], { type: XLSX_MIME }))),
        item('📑', '문서 복제', '같은 내용으로 새 문서 만들기', () => {
          const copy = app.store.duplicate(docId);
          toast('복제했습니다.');
          location.hash = `#/doc/${encodeURIComponent(copy.id)}`;
        }),
        item('🗑️', '문서 삭제', '모든 기기에서 삭제됩니다', async () => {
          if (await confirmDialog(`'${doc.title}' 문서를 삭제할까요? 되돌릴 수 없습니다.`, { ok: '삭제', danger: true })) {
            app.store.remove(docId);
            location.hash = '#/';
          }
        }),
      ),
    });
  }

  // 다른 기기에서 바뀐 내용 반영 (입력 중이면 입력이 끝난 뒤)
  const onFocusOut = () =>
    setTimeout(() => {
      if (pendingRemote && !el.contains(document.activeElement)) render();
    }, 0);
  el.addEventListener('focusout', onFocusOut);

  render();

  return {
    el,
    onStoreChange(evt) {
      if (evt.type === 'reset' || (evt.type === 'doc' && evt.doc.id === docId && evt.source === 'remote')) {
        const next = app.store.get(docId);
        if (!next) {
          toast('다른 기기에서 문서가 삭제되었습니다.');
          location.hash = '#/';
          return;
        }
        doc = next;
        if (el.contains(document.activeElement) && document.activeElement.matches('input, select')) pendingRemote = true;
        else render();
      }
    },
    destroy() {
      badge?.off();
    },
  };
}
