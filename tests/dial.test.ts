import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enochTime, ringRotation, dAz } from '../src/dial/state';
import { headingFromEuler } from '../src/compass/compass';

test('Enoch time: 18 parts × 20 degrees × 60 minutes × 4 seconds = 86,400 units, each once', () => {
  const seen = new Set<string>();
  for (let u = 0; u < 86400; u++) {
    const t = enochTime(((u + 0.5) / 86400) * 18);
    assert.equal(t.units, u);
    assert.ok(t.part >= 1 && t.part <= 18 && t.deg >= 1 && t.deg <= 20 && t.min >= 1 && t.min <= 60 && t.sec >= 1 && t.sec <= 4);
    assert.equal((t.part - 1) * 4800 + (t.deg - 1) * 240 + (t.min - 1) * 4 + (t.sec - 1), u);
    seen.add(`${t.part}:${t.deg}:${t.min}:${t.sec}`);
  }
  assert.equal(seen.size, 86400);
  assert.deepEqual([enochTime(0).part, enochTime(0).sec], [1, 1]);
  assert.equal(enochTime(18).units, 86399, 'the next sunrise belongs to the next day');
  assert.equal(enochTime(9).dayDeg, 180);
});

test('ring rotation puts the current value exactly on the needle, both directions, any ring', () => {
  let worst = 0;
  for (const n of [7, 18, 24, 294, 364]) for (const dir of [1, -1] as const) for (let k = 0; k < 500; k++) {
    const needle = (k * 37.123) % 360, cur = (k * 1.618) % n, rot = ringRotation(needle, cur, n, dir);
    worst = Math.max(worst, Math.abs(dAz(rot + (dir * cur * 360) / n, needle)));
  }
  assert.ok(worst < 1e-9, `worst ${worst}`);
});

test('device heading: flat uses the top edge, upright the back camera (W3C z-x\'-y\'\')', () => {
  for (const a of [0, 30, 90, 200, 359]) {
    assert.ok(Math.abs(dAz(headingFromEuler(a, 0, 0).heading, (360 - a) % 360)) < 1e-9);
    const up = headingFromEuler(a, 90, 0); assert.equal(up.pose, 'upright');
    assert.ok(Math.abs(dAz(up.heading, (360 - a) % 360)) < 1e-9, 'upright, untwisted: camera faces where the top pointed');
    assert.ok(Math.abs(dAz(headingFromEuler(a, 80, 0).heading, (360 - a) % 360)) < 1e-9, 'tilt alone does not turn the heading');
  }
});
