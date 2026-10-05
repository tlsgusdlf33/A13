import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../app/js/store.js';
import { memoryStorage, clock } from './helpers.mjs';

test('create, update, persist and reload', () => {
  const storage = memoryStorage();
  const now = clock();
  const s = new Store({ storage, now });
  const events = [];
  s.on((e) => events.push(e));
  const d = s.create({ templateId: 'budget', title: '가계부', data: { sheets: { ledger: [] } } });
  now.tick();
  s.update(d.id, (draft) => draft.data.sheets.ledger.push({ _id: 'r1', amount: 1000 }));
  assert.equal(s.get(d.id).rev, 2);
  assert.equal(s.get(d.id).data.sheets.ledger.length, 1);
  assert.ok(events.every((e) => e.source === 'local'));

  const again = new Store({ storage, now });
  assert.equal(again.get(d.id).data.sheets.ledger[0].amount, 1000);
  assert.equal(again.deviceId, s.deviceId);
});

test('update does not mutate the previous object', () => {
  const s = new Store({ storage: memoryStorage(), now: clock() });
  const d = s.create({ templateId: 'tasks', title: 't', data: { sheets: { tasks: [] } } });
  s.update(d.id, (draft) => draft.data.sheets.tasks.push({ _id: 'a' }));
  assert.equal(d.data.sheets.tasks.length, 0);
});

test('updatedAt always increases even if clock goes backwards', () => {
  const now = clock();
  const s = new Store({ storage: memoryStorage(), now });
  const d = s.create({ templateId: 'tasks', title: 't' });
  now.tick(-10_000);
  const u = s.update(d.id, (x) => (x.title = 'u'));
  assert.ok(u.updatedAt > d.updatedAt);
});

test('remove leaves a tombstone that hides the doc', () => {
  const s = new Store({ storage: memoryStorage(), now: clock() });
  const d = s.create({ templateId: 'tasks', title: 't' });
  s.remove(d.id);
  assert.equal(s.get(d.id), null);
  assert.equal(s.list().length, 0);
  assert.equal(s.allDocs()[0].deleted, true);
});

test('applyRemote only accepts newer versions', () => {
  const now = clock();
  const s = new Store({ storage: memoryStorage(), now });
  const d = s.create({ templateId: 'tasks', title: 'local' });
  assert.equal(s.applyRemote({ ...d, title: 'old', updatedAt: d.updatedAt - 1 }), false);
  assert.equal(s.applyRemote({ ...d, title: 'remote', updatedAt: d.updatedAt + 1 }), true);
  assert.equal(s.get(d.id).title, 'remote');
  assert.equal(s.applyRemote({ nope: true }), false);
});

test('licenses merge without duplicates', () => {
  const s = new Store({ storage: memoryStorage(), now: clock() });
  assert.equal(s.addLicense('A'), true);
  assert.equal(s.addLicense('A'), false);
  assert.equal(s.mergeLicenses(['A', 'B']), true);
  assert.deepEqual(s.meta.licenses, ['A', 'B']);
});

test('backup round trip', () => {
  const s = new Store({ storage: memoryStorage(), now: clock() });
  s.create({ templateId: 'budget', title: 'b' });
  s.addLicense('CODE');
  const backup = JSON.parse(JSON.stringify(s.exportBackup('1.0.0')));
  const t = new Store({ storage: memoryStorage(), now: clock() });
  assert.equal(t.importBackup(backup), 1);
  assert.equal(t.list()[0].title, 'b');
  assert.deepEqual(t.meta.licenses, ['CODE']);
  assert.equal(t.importBackup(backup), 0);
  assert.throws(() => t.importBackup({ foo: 1 }));
});

test('corrupt storage does not crash', () => {
  const s = new Store({ storage: memoryStorage({ 'templatekit.v1': '{broken' }), now: clock() });
  assert.equal(s.list().length, 0);
});
