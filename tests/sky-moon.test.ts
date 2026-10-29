// The Moon's own day in Sky: its conjunction and age (src/sky/instrument.ts createMoonClock) against Astronomy Engine's phase angle, and
// where it last rose against a brute-force walk of its altitude.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Body, MoonPhase, Observer, Equator, Horizon, AstroTime } from 'astronomy-engine';
import { createMoonClock } from '../src/sky/instrument.ts';

const SF = [37.7749, -122.4194, 0] as const;
const t = (jd: number) => new AstroTime(jd - 2451545);

test('the Moon\'s day counts from the conjunction before the instant: day 1 its first 24 hours', () => {
  const clock = createMoonClock(...SF);
  for (let jd = 2461041.5; jd < 2461041.5 + 60; jd += 0.37) {
    const d = clock.day(jd)!;
    assert.ok(d.newMoon <= jd && jd < d.nextNewMoon, `${jd} inside its lunation`);
    for (const c of [d.newMoon, d.nextNewMoon]) { const p = MoonPhase(t(c)); assert.ok(Math.min(p, 360 - p) < 1e-3, `phase ${p} at a conjunction`); }
    assert.ok(d.nextNewMoon - d.newMoon > 29.2 && d.nextNewMoon - d.newMoon < 29.9);
    assert.equal(d.day, Math.floor(jd - d.newMoon) + 1);
    assert.ok(Math.abs(d.age - (jd - d.newMoon)) < 1e-9);
  }
});

test('the Moon\'s last rising: its upper limb on the refracted horizon, and no rising since', () => {
  const clock = createMoonClock(...SF), obs = new Observer(...SF);
  const alt = (jd: number) => { const e = Equator(Body.Moon, t(jd), obs, true, true); return Horizon(t(jd), obs, e.ra, e.dec, 'normal').altitude; };
  for (let jd = 2461041.5; jd < 2461041.5 + 30; jd += 0.61) {
    const r = clock.lastRise(jd)!;
    assert.ok(r.jd <= jd && (r.next === null || jd < r.next), `${jd} after its rising, before the next`);
    assert.ok(jd - r.jd < 1.2, 'a rising within the last lunar day');
    // just after the rising the Moon's centre (refracted) is near the horizon and climbing
    assert.ok(Math.abs(alt(r.jd)) < 0.6, `${alt(r.jd)}`); assert.ok(alt(r.jd + 0.01) > alt(r.jd));
    // walk from the rising to the instant in 5-minute steps: the refracted centre never climbs through −0.3° again
    for (let a = r.jd + 0.05; a + 1 / 288 <= jd; a += 1 / 288) assert.ok(!(alt(a) < -0.3 && alt(a + 1 / 288) >= -0.3), `a rising at ${a} after ${r.jd}`);
    assert.ok(r.az > 40 && r.az < 140, `rises in the east (${r.az})`);
  }
});
