import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './src/index.mjs';

const env = { ALLOWED_ORIGIN: 'https://family.mapleview.xyz', APPS_SCRIPT_URL: 'https://script.google.com/macros/s/example/exec' };
const request = (query = '', init = {}) => new Request('https://api.mapleview.xyz/' + query, {
  headers: { Origin: env.ALLOWED_ORIGIN }, ...init
});

test('preflight permits only the Family Center origin', async () => {
  const response = await worker.fetch(request('', { method: 'OPTIONS' }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
  const denied = await worker.fetch(request('', { headers: { Origin: 'https://other.example' } }), env);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});

test('RPC values survive encoding, Google redirects are followed, and responses cannot cache', async () => {
  const original = globalThis.fetch;
  const args = ['milk & eggs', { notes: 'a+b? #é', purchased: false }];
  globalThis.fetch = async (url, init) => {
    assert.equal(url.origin, 'https://script.google.com');
    assert.equal(url.searchParams.get('fn'), 'webCreateAndAddItem');
    assert.deepEqual(JSON.parse(url.searchParams.get('args')), args);
    assert.equal(init.redirect, 'follow');
    return Response.json({ success: true, result: { entryId: 'row1' } });
  };
  try {
    const query = new URLSearchParams({ action: 'rpc', fn: 'webCreateAndAddItem', args: JSON.stringify(args) });
    const response = await worker.fetch(request('?' + query), env);
    assert.deepEqual(await response.json(), { success: true, result: { entryId: 'row1' } });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } finally { globalThis.fetch = original; }
});

test('rejects invalid methods, arguments, upstream configuration, and paths', async () => {
  assert.equal((await worker.fetch(request('', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(request('?action=rpc&fn=webTest&args={}'), env)).status, 400);
  assert.equal((await worker.fetch(request('?api=ping'), { ...env, APPS_SCRIPT_URL: 'https://evil.example' })).status, 503);
  assert.equal((await worker.fetch(new Request('https://api.mapleview.xyz/elsewhere'), env)).status, 404);
});

test('upstream failures retain CORS and do not retry mutations', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('timeout'); };
  try {
    const response = await worker.fetch(request('?action=rpc&fn=webTest&args=[]'), env);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
