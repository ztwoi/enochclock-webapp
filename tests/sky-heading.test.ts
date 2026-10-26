// The panorama's heading: eased the shorter way round (through north as anywhere), the same at any frame rate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { easeHeading, SETTLED, wrap180 } from '../src/sky/heading';

test('the shorter way round, through north', () => {
  assert.equal(wrap180(10 - 350), 20);
  assert.equal(wrap180(350 - 10), -20);
  assert.equal(wrap180(180), 180);
  const h = easeHeading(350, 10, 0.1, 0.1);                      // 350° → 10° goes up through 0°, not down through 180°
  assert.ok(h > 350 || h < 10, `${h}`);
  const back = easeHeading(10, 350, 0.1, 0.1);
  assert.ok(back > 350 || back < 10, `${back}`);
});

test('the same motion at any frame rate', () => {
  for (const [from, to] of [[90, 120], [355, 5], [5, 355], [0, 179]]) {
    let a = from, b = from;
    for (let k = 0; k < 60; k++) a = easeHeading(a, to, 1 / 60, 0.1);   // 60 Hz for 1 s
    for (let k = 0; k < 120; k++) b = easeHeading(b, to, 1 / 120, 0.1); // 120 Hz for 1 s
    assert.ok(Math.abs(wrap180(a - b)) < 1e-9, `${from}→${to}: ${a} vs ${b}`);
  }
});

test('it settles exactly on the target and never overshoots', () => {
  let h = 300, prev = Infinity;
  for (let k = 0; k < 240; k++) {
    h = easeHeading(h, 20, 1 / 60, 0.1);
    const left = Math.abs(wrap180(20 - h));
    assert.ok(left <= prev, 'monotonic'); prev = left;
  }
  assert.equal(h, 20);
  assert.equal(easeHeading(20 + SETTLED / 2, 20, 1 / 60, 0.1), 20);
});

test('calibration averages headings on the circle: through north as anywhere, and measures the hand\'s steadiness', async () => {
  const { circular } = await import('../src/sky/compassmode');
  const a = circular([358, 359, 0, 1, 2]);
  assert.ok(Math.abs(wrap180(a.mean - 0)) < 1e-9, `${a.mean}`);
  assert.ok(a.sd < 1.6 && a.sd > 1.3, `${a.sd}`);
  assert.ok(circular([170, 170, 170]).sd < 1e-6);
  assert.ok(circular([160, 180, 160, 180]).sd > 9);
});
