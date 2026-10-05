import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync, compareDocs } from '../app/js/merge.js';

const doc = (id, updatedAt, extra = {}) => ({ id, updatedAt, rev: 1, device: 'a', ...extra });

test('newer document wins', () => {
  assert.ok(compareDocs(doc('x', 2), doc('x', 1)) > 0);
  assert.ok(compareDocs(doc('x', 1, { rev: 3 }), doc('x', 1, { rev: 2 })) > 0);
  assert.equal(compareDocs(doc('x', 1), doc('x', 1)), 0);
});

test('planSync splits uploads and downloads', () => {
  const local = [doc('only-local', 5), doc('local-newer', 10), doc('remote-newer', 1), doc('same', 3)];
  const remote = [doc('only-remote', 7), doc('local-newer', 9), doc('remote-newer', 2), doc('same', 3)];
  const { upload, apply } = planSync(local, remote);
  assert.deepEqual(upload.map((d) => d.id).sort(), ['local-newer', 'only-local']);
  assert.deepEqual(apply.map((d) => d.id).sort(), ['only-remote', 'remote-newer']);
});

test('planSync ignores malformed documents', () => {
  const { upload, apply } = planSync([{ id: 'x' }], [{ updatedAt: 3 }, null]);
  assert.equal(upload.length + apply.length, 0);
});
