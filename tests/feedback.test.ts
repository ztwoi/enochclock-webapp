import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackBody, sendFeedback, sha256Hex } from '../src/feedback';

test('sha256Hex matches the known digest', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('the body carries the trimmed message, the context and an empty honeypot, and no location', () => {
  const b = JSON.parse(feedbackBody('  hello ', ' a@b.co ', { mode: 'Deep Time', page: 'Enoch year 2026' }, 'en-US'));
  assert.equal(b.message, 'hello'); assert.equal(b.email, 'a@b.co'); assert.equal(b.website, '');
  assert.deepEqual(Object.keys(b.context).sort(), ['lang', 'mode', 'page', 'version']);
  assert.equal(b.context.mode, 'Deep Time');
  assert.doesNotMatch(JSON.stringify(b), /lat|lon/i);
});
test('sendFeedback POSTs to /api/feedback with the payload hash header', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const ok = await sendFeedback('{"message":"x"}', (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch);
  assert.ok(ok); assert.equal(seen!.url, '/api/feedback'); assert.equal(seen!.init.method, 'POST');
  assert.equal((seen!.init.headers as Record<string, string>)['x-amz-content-sha256'], await sha256Hex('{"message":"x"}'));
});
test('a refused or failed request is not a success', async () => {
  assert.equal(await sendFeedback('{}', (async () => new Response('', { status: 403 })) as unknown as typeof fetch), false);
  assert.equal(await sendFeedback('{}', (async () => { throw new Error('offline'); }) as unknown as typeof fetch), false);
});
