import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Body } from 'astronomy-engine';
import { skyFrame } from '../src/sky/astronomy';
import { bodyDirection } from '../src/dial/state';

const ref = JSON.parse(readFileSync('tests/fixtures/dial-bodies-reference.json', 'utf8'));
const dAz = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

test('Sun, Moon and planets agree with Swiss Ephemeris (SWIEPH), topocentric, six sites', () => {
  assert.equal(ref.rows.length, 324);
  const worst: Record<string, number> = {};
  for (const r of ref.rows) {
    const f = skyFrame(r.jd_ut, r.lat, r.lon, r.elev), h = bodyDirection(f, Body[r.body as keyof typeof Body] as Body);
    // great-circle separation on the sky (azimuth difference shrinks by cos alt)
    const sep = Math.hypot(dAz(h.az, r.az) * Math.cos((r.alt * Math.PI) / 180), h.alt - r.alt);
    worst[r.body] = Math.max(worst[r.body] ?? 0, sep);
  }
  console.log(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, `${(v * 3600).toFixed(1)}″`])));
  for (const [b, v] of Object.entries(worst)) assert.ok(v < 1 / 60, `${b} within 1′ (${(v * 3600).toFixed(1)}″)`);
});
