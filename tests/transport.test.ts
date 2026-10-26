import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPEEDS, defaults, fmtSpeed, loadState, nextSpeed } from '../src/transport-speed.ts';

test('the speed button cycles 0.5× → 1× → 2× → 4× → 16× and round again', () => {
  const seen = [1]; for (let k = 0; k < SPEEDS.length; k++) seen.push(nextSpeed(seen[seen.length - 1]));
  assert.deepEqual(seen, [1, 2, 4, 16, 0.5, 1]);
  assert.equal(fmtSpeed(0.5), '0.5×'); assert.equal(fmtSpeed(16), '16×');
});
test('remembered state: defaults are Day, 1×, forward, for both units', () => {
  assert.deepEqual(loadState({ getItem: () => null }), defaults());
  assert.deepEqual(defaults(), { mode: 'degree', day: { speed: 1, dir: 1 }, degree: { speed: 1, dir: 1 }, year: { speed: 1, dir: 1 } });
});
test('remembered state: each unit keeps its own speed and direction; bad values fall back', () => {
  const st = (v: unknown) => loadState({ getItem: () => (typeof v === 'string' ? v : JSON.stringify(v)) });
  assert.equal(st({ mode: 'day' }).mode, 'day');                                            // a remembered Day stays
  assert.deepEqual(st({ mode: 'degree', day: { speed: 16, dir: -1 }, degree: { speed: 0.5, dir: 1 }, year: { speed: 4, dir: -1 } }), { mode: 'degree', day: { speed: 16, dir: -1 }, degree: { speed: 0.5, dir: 1 }, year: { speed: 4, dir: -1 } });
  assert.equal(st({ mode: 'year' }).mode, 'degree');                                         // Year is the view's, not a remembered choice
  assert.deepEqual(st({ mode: 'year', day: { speed: 25, dir: 7 } }), defaults());      // no 25×: not on the button
  assert.deepEqual(st('not json'), defaults());
  assert.deepEqual(st('null'), defaults());
});
