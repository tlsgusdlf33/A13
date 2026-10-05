import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, getTemplate, ddayText } from '../app/js/templates.js';
import { makeCtx, createDocData, makeRow, visibleRows, breakdown, getRows } from '../app/js/engine.js';

const NOW = new Date(2026, 9, 5); // 2026-10-05

test('template definitions are well-formed', () => {
  const ids = new Set();
  for (const t of TEMPLATES) {
    assert.ok(!ids.has(t.id), `중복 id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.name && t.icon && t.description && t.sheets.length);
    for (const s of t.sheets) {
      const keys = s.columns.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length, `${t.id}.${s.key} 열 key 중복`);
      for (const c of s.columns) {
        assert.ok(['text', 'number', 'currency', 'date', 'time', 'select', 'check'].includes(c.type), `${c.key} type`);
        if (c.type === 'select') assert.ok(c.options?.length, `${c.key} options`);
        if (c.computed) assert.equal(typeof c.compute, 'function');
      }
      if (s.periodKey) assert.ok(keys.includes(s.periodKey));
      if (s.defaultSort) assert.ok(keys.includes(s.defaultSort.key));
    }
  }
  assert.ok(TEMPLATES.some((t) => t.premium) && TEMPLATES.some((t) => !t.premium));
});

test('every template renders summaries, computed cells and breakdowns from sample data', () => {
  for (const t of TEMPLATES) {
    const data = createDocData(t, { withSample: true, ctx: makeCtx(null, 'all', NOW) });
    for (const period of ['all', '2026-10']) {
      const ctx = makeCtx(data, period, NOW);
      for (const s of t.sheets) {
        const rows = visibleRows(s, getRows(data, s.key), { period }, ctx);
        for (const it of s.summary?.(rows, ctx) ?? []) assert.ok(it.label && it.value !== undefined, `${t.id}.${s.key}`);
        for (const r of rows) for (const c of s.columns.filter((c) => c.computed)) c.compute(r, ctx);
        breakdown(s, rows, ctx);
        const row = makeRow(s, ctx);
        assert.ok(row._id);
      }
    }
  }
});

test('budget totals', () => {
  const t = getTemplate('budget');
  const ctx0 = makeCtx(null, '2026-10', NOW);
  const data = createDocData(t, { withSample: true, ctx: ctx0 });
  const ctx = makeCtx(data, '2026-10', NOW);
  const ledger = t.sheets[0];
  const [income, expense, balance] = ledger.summary(getRows(data, 'ledger'), ctx);
  assert.equal(income.value, 3000000);
  assert.equal(expense.value, 600000 + 68000 + 4500 + 50000 + 15000);
  assert.equal(balance.value, income.value - expense.value);

  const plan = t.sheets[1];
  const food = getRows(data, 'plan').find((r) => r.category === '식비');
  assert.equal(plan.columns.find((c) => c.key === 'spent').compute(food, ctx), 68000);
  assert.equal(plan.columns.find((c) => c.key === 'left').compute(food, ctx), 400000 - 68000);
  // 다른 달에는 사용액 0
  assert.equal(plan.columns.find((c) => c.key === 'spent').compute(food, makeCtx(data, '2026-09', NOW)), 0);

  const bd = breakdown(ledger, getRows(data, 'ledger'), ctx);
  assert.equal(bd[0].label, '주거/통신');
  assert.ok(!bd.some((b) => b.label === '급여'));
});

test('new rows in a past month default to that month', () => {
  const ledger = getTemplate('budget').sheets[0];
  assert.equal(makeRow(ledger, makeCtx(null, '2026-08', NOW)).date, '2026-08-01');
  assert.equal(makeRow(ledger, makeCtx(null, '2026-10', NOW)).date, '2026-10-05');
});

test('task D-day text', () => {
  assert.equal(ddayText({ due: '2026-10-08' }, '2026-10-05'), 'D-3');
  assert.equal(ddayText({ due: '2026-10-05' }, '2026-10-05'), 'D-Day');
  assert.equal(ddayText({ due: '2026-10-01' }, '2026-10-05'), '지연 4일');
  assert.equal(ddayText({ due: '2026-10-01', status: '완료' }, '2026-10-05'), '완료');
  assert.equal(ddayText({}, '2026-10-05'), '');
});

test('subscription monthly cost', () => {
  const s = getTemplate('subscriptions').sheets[0];
  const monthly = s.columns.find((c) => c.key === 'monthly').compute;
  assert.equal(monthly({ price: 12000, cycle: '매년' }), 1000);
  assert.equal(monthly({ price: 9900, cycle: '매월' }), 9900);
  assert.equal(monthly({ price: 9900, cycle: '매월', status: '해지' }), 0);
});

test('search and sort', () => {
  const t = getTemplate('budget');
  const data = createDocData(t, { withSample: true, ctx: makeCtx(null, 'all', NOW) });
  const s = t.sheets[0];
  const ctx = makeCtx(data, 'all', NOW);
  assert.equal(visibleRows(s, getRows(data, 'ledger'), { search: '커피' }, ctx).length, 1);
  const byAmount = visibleRows(s, getRows(data, 'ledger'), { sort: { key: 'amount', dir: 'desc' } }, ctx);
  assert.equal(byAmount[0].amount, 3000000);
  const rows = [{ _id: 'a', amount: '' }, { _id: 'b', amount: 5 }, { _id: 'c', amount: 1 }];
  assert.deepEqual(visibleRows(s, rows, { sort: { key: 'amount', dir: 'asc' } }, ctx).map((r) => r._id), ['c', 'b', 'a']);
});
