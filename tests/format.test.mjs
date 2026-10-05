import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, shiftMonth, daysBetween, parseNumber, fmtWon, monthLabel, addDays, inPeriod } from '../app/js/format.js';

test('compareVersions', () => {
  assert.ok(compareVersions('1.0.1', '1.0.0') > 0);
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.ok(compareVersions('0.9.0', '1.0.0') < 0);
  assert.ok(compareVersions(undefined, '1.0.0') < 0);
});

test('month helpers', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthLabel('2026-03'), '2026년 3월');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.ok(inPeriod('2026-03-15', '2026-03'));
  assert.ok(!inPeriod('2026-04-01', '2026-03'));
  assert.ok(inPeriod(undefined, 'all'));
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-10-05', '2026-10-08'), 3);
  assert.equal(daysBetween('2026-10-05', '2026-10-01'), -4);
  assert.ok(Number.isNaN(daysBetween('2026-10-05', '')));
});

test('numbers', () => {
  assert.equal(parseNumber('12,300원'), 12300);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber('abc'), 0);
  assert.equal(fmtWon(1234567), '1,234,567원');
});
