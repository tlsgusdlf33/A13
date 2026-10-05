import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { signLicense, verifyLicense, activePlans, parseLicense } from '../app/js/license.js';

async function keys() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  const { kty, crv, x, y } = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  return { priv, pub: { kty, crv, x, y } };
}

test('issued code verifies and carries its plan', async () => {
  const { priv, pub } = await keys();
  const code = await signLicense({ plan: 'premium', id: 'abc123', issued: '20261005' }, priv);
  assert.match(code, /^TK1\.[\w-]+\.[\w-]+$/);
  const r = await verifyLicense(`  ${code.slice(0, 20)}\n${code.slice(20)} `, pub);
  assert.deepEqual(r, { valid: true, plan: 'premium', id: 'abc123', issued: '20261005' });
  assert.deepEqual([...(await activePlans([code, 'junk'], pub))], ['premium']);
});

test('tampered, foreign or malformed codes are rejected', async () => {
  const a = await keys();
  const b = await keys();
  const code = await signLicense({ plan: 'premium', id: 'x1', issued: '20261005' }, a.priv);
  assert.equal((await verifyLicense(code, b.pub)).reason, 'signature');
  const forged = code.replace(/^TK1\.[^.]+/, `TK1.${Buffer.from('premium|other|20261005').toString('base64url')}`);
  assert.equal((await verifyLicense(forged, a.pub)).valid, false);
  assert.equal((await verifyLicense('hello', a.pub)).reason, 'format');
  assert.equal((await verifyLicense(code, null)).reason, 'no-key');
  assert.equal(parseLicense('TK1.@@@.@@@'), null);
});
