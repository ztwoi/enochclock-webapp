import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEY, PER_SECOND, SPEEDS, defaults, fmtSpeed, loadState, nextSpeed, stepUnits } from '../src/transport-speed.ts';

test('the speed button cycles 0.5× → 1× → 2× → 4× → 8× → 16× and round again', () => {
  const seen = [1]; for (let k = 0; k < SPEEDS.length; k++) seen.push(nextSpeed(seen[seen.length - 1]));
  assert.deepEqual(seen, [1, 2, 4, 8, 16, 0.5, 1]);
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
test('Day plays 7.5 days a second at 1× (120 at 16×, a year in about 3 s); Degree 15°; Year 1', () => {
  assert.deepEqual(PER_SECOND, { day: 7.5, degree: 15, year: 1 });
});
test('a step is the unit times the speed, never less than one unit', () => {
  assert.equal(stepUnits(16), 16); assert.equal(stepUnits(4), 4); assert.equal(stepUnits(-8), 8);
  assert.equal(stepUnits(1), 1); assert.equal(stepUnits(0.5), 1);
});
test('a state remembered under v2 carries over, but Day starts again at 1× (its old speeds meant a different pace)', () => {
  const v2 = JSON.stringify({ mode: 'day', day: { speed: 16, dir: -1 }, degree: { speed: 4, dir: -1 }, year: { speed: 2, dir: 1 } });
  const store = (m: Record<string, string>) => ({ getItem: (k: string) => m[k] ?? null });
  assert.deepEqual(loadState(store({ 'enoch.transport.v2': v2 })), { mode: 'day', day: { speed: 1, dir: 1 }, degree: { speed: 4, dir: -1 }, year: { speed: 2, dir: 1 } });
  const v3 = JSON.stringify({ mode: 'day', day: { speed: 8, dir: 1 }, degree: { speed: 1, dir: 1 }, year: { speed: 1, dir: 1 } });
  assert.equal(loadState(store({ [KEY]: v3, 'enoch.transport.v2': v2 })).day.speed, 8);   // once saved under v3, v2 is not read
});
