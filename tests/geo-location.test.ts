import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, failMessage } from '../src/geo/location';

test('code 1 is a dismissal while the permission still reads prompt, a block otherwise', () => {
  assert.equal(classify(1, 'prompt'), 'dismissed');
  assert.equal(classify(1, 'denied'), 'blocked');
  assert.equal(classify(1, 'unknown'), 'blocked');       // no Permissions API: say the cautious thing
  assert.equal(classify(1, 'granted'), 'blocked');
});
test('no position and timeout are their own failures', () => {
  assert.equal(classify(2, 'granted'), 'unavailable');
  assert.equal(classify(3, 'granted'), 'timeout');
});
test('every failure has words, and a block names where the user fixes it, by browser', () => {
  for (const k of ['insecure', 'blocked', 'dismissed', 'unavailable', 'timeout'] as const) assert.ok(failMessage(k, '').length > 20, k);
  assert.match(failMessage('blocked', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)'), /Safari/);
  assert.match(failMessage('blocked', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130'), /site settings/);
  assert.match(failMessage('blocked', ''), /Retry/);
});
