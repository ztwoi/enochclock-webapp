import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORTAL_ALT, pillars } from '../src/model';
import { archPath, seamPath, within } from '../src/dial/portals';
import { aberrated, aberration, lastPassage, litPortals, passageRun, refracted } from '../src/sky/instrument';
import { skyFrame } from '../src/sky/astronomy';
import { skyPanel } from '../src/inspector';
import type { SkyInfo } from '../src/skyview';
import type { YearDoc } from '../src/types';

const doc = JSON.parse(readFileSync(new URL('./fixtures/sf-2026.json', import.meta.url), 'utf8')) as YearDoc;
const K = (498 - 376) / 90, radius = (alt: number) => 376 + alt * K;
const azOf = (x: number, y: number) => (((Math.atan2(x, -y) * 180) / Math.PI) + 360) % 360;
/** Every vertex of a path made of M/L/A/Z commands, as [radius, azimuth]. */
function vertices(d: string) {
  const t = d.match(/[MLAZ]|-?\d+\.?\d*/g)!, out: [number, number][] = []; let i = 0;
  while (i < t.length) { const c = t[i++]; if (c === 'M' || c === 'L') { const x = +t[i], y = +t[i + 1]; i += 2; out.push([Math.hypot(x, y), azOf(x, y)]); } else if (c === 'A') { const x = +t[i + 5], y = +t[i + 6]; i += 7; out.push([Math.hypot(x, y), azOf(x, y)]); } }
  return out;
}

test('the portal height is the Sky\'s 44 units at its scale, so the Sky is unchanged', () => {
  assert.ok(Math.abs(PORTAL_ALT * ((1420 - 60) / 180) - 44) < 1e-9);
});

test('seams are the gaps between neighbouring common spans, east and west alike, in azimuth order', () => {
  for (const [side, P] of [['east', doc.portals], ['west', doc.portals_west]] as const) {
    const byAz = [...P].sort((a, b) => a.common[0] - b.common[0]), want: [number, number][] = [];
    for (let i = 0; i < byAz.length - 1; i++) if (byAz[i + 1].common[0] > byAz[i].common[1]) want.push([byAz[i].common[1], byAz[i + 1].common[0]]);
    assert.deepEqual(pillars(P), want, side);
    for (const [lo, hi] of pillars(P)) assert.ok(hi > lo && hi - lo < 1.5, `${side}: a seam is under 1.5° wide, got ${hi - lo}`);
  }
  // the east's five seams and the west's four (portals 3 and 4 of the west share an edge exactly)
  assert.deepEqual(pillars(doc.portals).map(([a, b]) => +(b - a).toFixed(3)), [0.463, 0.873, 0.321, 1.388, 0.969]);
  assert.deepEqual(pillars(doc.portals_west).map(([a, b]) => +(b - a).toFixed(3)), [0.728, 0.973, 0.389, 0.144]);
});

test('each arch stands on the horizon, its sides on the two azimuths of its common span, its crown at the full height', () => {
  for (const p of [...doc.portals, ...doc.portals_west]) {
    const v = vertices(archPath(p, radius)), [lo, hi] = p.common;
    assert.ok(Math.abs(v[0][1] - lo) < 2e-4 && Math.abs(v[v.length - 1][1] - hi) < 2e-4, `portal ${p.portal}: the base edges are the span's azimuths`);
    assert.ok(Math.abs(v[0][0] - 376) < 1e-2 && Math.abs(v[v.length - 1][0] - 376) < 1e-2, 'the feet are on the horizon circle');
    assert.ok(Math.abs(v[1][1] - lo) < 2e-4, 'the left side is the radial line at the low azimuth');
    assert.ok(Math.abs(v[v.length - 2][1] - hi) < 2e-4, 'the right side is the radial line at the high azimuth');
    for (const [, az] of v) assert.ok(az >= lo - 2e-4 && az <= hi + 2e-4, 'nothing leaves the span');
    assert.ok(Math.abs(Math.max(...v.map((q) => q[0])) - radius(PORTAL_ALT)) < 2e-2, 'the crown reaches PORTAL_ALT');
  }
});

test('a seam wedge fills exactly the gap between two arches, from the horizon to the arches\' height', () => {
  for (const P of [doc.portals, doc.portals_west]) for (const [lo, hi] of pillars(P)) {
    const v = vertices(seamPath(lo, hi, radius));
    assert.ok(v.every(([, az]) => az >= lo - 2e-4 && az <= hi + 2e-4));
    assert.ok(Math.abs(Math.min(...v.map((q) => q[0])) - 376) < 1e-2 && Math.abs(Math.max(...v.map((q) => q[0])) - radius(PORTAL_ALT)) < 1e-2);
  }
});

test('a horizon azimuth is within a portal when it lies in the common span, never in a seam', () => {
  const p = doc.portals[1];
  assert.ok(within(p, p.common[0]) && within(p, p.common[1]) && within(p, (p.common[0] + p.common[1]) / 2));
  assert.ok(!within(p, p.common[0] - 0.001) && !within(p, p.common[1] + 0.001));
  for (const [lo, hi] of pillars(doc.portals)) assert.ok(!doc.portals.some((q) => within(q, (lo + hi) / 2)));
});

test('the lit portals are the ones the day\'s sunrise and sunset fall in: east II and west II on Day 215, none in a seam or outside the year', () => {
  const k = doc.rows.findIndex((r) => r.month === 8 && r.day === 6), jd = doc.rows[k].sunrise_jd_ut;
  assert.deepEqual(litPortals(doc, jd + 0.3), { east: 2, west: 2 });
  assert.deepEqual(litPortals(doc, jd), litPortals(doc, doc.rows[k + 1].sunrise_jd_ut - 1e-6), 'the whole Enoch day, sunrise to the next');
  assert.deepEqual(litPortals(doc, doc.rows[0].sunrise_jd_ut - 1), { east: null, west: null }, 'before the year');
  const seam = structuredClone(doc); seam.rows[k].azimuth_deg = 114.8; seam.extended[k].sunset_azimuth_deg = 245.1;   // east: between II and I; west: between I and II
  assert.deepEqual(litPortals(seam, jd + 0.3), { east: null, west: null }, 'a seam lights no arch');
  let lit = 0; for (let i = 0; i < doc.rows.length - 1; i++) { const r = litPortals(doc, doc.rows[i].sunrise_jd_ut + 0.01); if (r.east !== null) lit++; }
  assert.ok(lit > 250 && lit < doc.rows.length, `most days the Sun rises within a portal, some in a seam (got ${lit} of ${doc.rows.length - 1})`);
});

test('the last passage: the latest morning up to now whose bearing is in the portal\'s common span, east by sunrise and west by sunset', () => {
  const k = doc.rows.findIndex((r) => r.month === 8 && r.day === 6), jd = doc.rows[k].sunrise_jd_ut + 0.3;
  for (const side of ['east', 'west'] as const) for (const p of side === 'east' ? doc.portals : doc.portals_west) {
    const az = (i: number) => (side === 'east' ? doc.rows[i].azimuth_deg : doc.extended[i].sunset_azimuth_deg);
    let want = -1; for (let i = k; i >= 0; i--) if (az(i) >= p.common[0] && az(i) <= p.common[1]) { want = i; break; }   // brute force, independent of the function
    const got = lastPassage(doc, side, p.portal, jd);
    assert.equal(got?.k ?? -1, want, `${side} ${p.portal}`);
    if (got) { assert.equal(got.daysAgo, k - got.k); assert.equal(got.azimuth, az(got.k)); }
  }
  assert.deepEqual([lastPassage(doc, 'east', 2, jd)?.daysAgo, lastPassage(doc, 'west', 2, jd)?.daysAgo], [0, 0], 'today\'s portals passed today');
  assert.ok((lastPassage(doc, 'east', 3, jd)?.daysAgo ?? 0) > 0, 'the Sun has moved on from portal III');
  assert.equal(lastPassage(doc, 'east', 1, doc.rows[0].sunrise_jd_ut + 0.1), null, 'portal I has not been passed yet on Day 1: its last passage was in the year before');
  assert.equal(lastPassage(doc, 'east', 2, doc.rows[0].sunrise_jd_ut - 1), null, 'outside the year');
  assert.equal(lastPassage(doc, 'east', 9, jd), null, 'no such portal');
});

test('the inspector says when the Sun last rose or set in a selected portal, and quotes the calendar\'s passes', () => {
  const k = doc.rows.findIndex((r) => r.month === 8 && r.day === 6), jd = doc.rows[k].sunrise_jd_ut + 0.3;
  const sky = { jd, sun: { az: 100, alt: 10 }, moon: { az: 0, alt: 0, fraction: 0.5 }, planets: [], shown: 0, refraction: true, selection: null } as unknown as SkyInfo;
  const panel = (S: SkyInfo['selection']) => skyPanel(doc, k, 9, { ...sky, selection: S });
  const today = panel({ kind: 'portal', portal: 2, side: 'east' });
  assert.match(today, /Selected portal/); assert.match(today, /data-k="portal-last">today</); assert.match(today, /lit: the Sun rose here today/);
  assert.match(today, /104\.038° – 114\.347°/); assert.match(today, /Month 8 · 72:23-24/);
  const west = panel({ kind: 'portal', portal: 2, side: 'west' });
  assert.match(west, /where the Sun sets · west/); assert.match(west, /lit: the Sun sets here today/);
  const earlier = panel({ kind: 'portal', portal: 3, side: 'east' });
  assert.match(earlier, /\d+ days ago|yesterday/); assert.doesNotMatch(earlier, /lit:/);
  const none = skyPanel(doc, 0, 9, { ...sky, jd: doc.rows[0].sunrise_jd_ut + 0.1, selection: { kind: 'portal', portal: 1, side: 'east' } });
  assert.match(none, /before this Enoch year/);
});

test('the Sun the Sky draws, at each sunrise, is on that morning\'s stored sunrise bearing, its upper limb on the horizon', () => {
  const c = doc.calculation;
  let worst = 0;
  for (let k = 0; k < doc.rows.length - 1; k += 7) {
    const r = doc.rows[k], t = skyFrame(r.sunrise_jd_ut, c.latitude, c.longitude_east, c.elevation_m), f = refracted(aberrated(t, aberration(t.time)), c.pressure_hpa, c.temperature_c);
    worst = Math.max(worst, Math.abs(f.sun.az - r.azimuth_deg));
    assert.ok(Math.abs(f.sun.alt + 0.267) < 0.02, `day ${k}: the centre is a semi-diameter under the horizon (drawn ${f.sun.alt})`);
  }
  assert.ok(worst < 0.002, `the drawn Sun's bearing at sunrise matches the stored bearing to ${worst}°`);
});

test('after it rises the Sun\'s bearing keeps growing (about 0.15° a minute here), so it drifts past its own day tick', () => {
  const c = doc.calculation, k = doc.rows.findIndex((r) => r.month === 8 && r.day === 1), r = doc.rows[k];
  const az = (min: number) => { const t = skyFrame(r.sunrise_jd_ut + min / 1440, c.latitude, c.longitude_east, c.elevation_m); return refracted(aberrated(t, aberration(t.time)), c.pressure_hpa, c.temperature_c).sun.az; };
  assert.ok(Math.abs(az(0) - 102.650) < 0.002);
  assert.ok(Math.abs((az(9) - az(0)) / 9 - 0.153) < 0.01, 'about 0.15° of bearing a minute');
  assert.ok(az(10) > doc.portals[1].common[0] && Math.abs(az(10) - 104.18) < 0.05, 'ten minutes on, the Sun is over portal II\'s span (as in the screenshot, 104.2°) though it rose at the edge of portal III');
});

test('a passage run is the unbroken mornings of the last pass, oldest first, each inside the span, the day before outside', () => {
  const k = doc.rows.findIndex((r) => r.month === 8 && r.day === 6), jd = doc.rows[k].sunrise_jd_ut + 0.3;
  for (const side of ['east', 'west'] as const) for (const p of side === 'east' ? doc.portals : doc.portals_west) {
    const run = passageRun(doc, side, p.portal, jd), last = lastPassage(doc, side, p.portal, jd);
    if (!last) { assert.deepEqual(run, []); continue; }
    assert.equal(run[run.length - 1].k, last.k, 'ends at the last passage');
    run.forEach((q, i) => {
      assert.ok(q.azimuth >= p.common[0] && q.azimuth <= p.common[1], 'inside the span');
      if (i) assert.equal(q.k, run[i - 1].k + 1, 'unbroken');
    });
    const before = doc.rows[run[0].k - 1], az = before && (side === 'east' ? before.azimuth_deg : doc.extended[run[0].k - 1].sunset_azimuth_deg);
    if (before) assert.ok(az < p.common[0] || az > p.common[1], 'the morning before the run was outside the span');
  }
  const today = passageRun(doc, 'east', 2, jd);
  assert.ok(today.length >= 1 && today[today.length - 1].daysAgo === 0, 'portal II is being passed today, so its run ends today');
  assert.deepEqual(passageRun(doc, 'east', 1, doc.rows[0].sunrise_jd_ut + 0.1), [], 'none yet');
});
