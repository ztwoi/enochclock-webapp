import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arches, archOf, PORTAL_ALT, pillars } from '../src/model';
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

test('an arch is the bearings its own months reach, less what a neighbour\'s months reach too; the seams are those shared stretches', () => {
  for (const [side, P] of [['east', doc.portals], ['west', doc.portals_west]] as const) {
    const byAz = [...P].sort((a, b) => a.union[0] - b.union[0]), S = arches(P), want: [number, number][] = [];
    for (let i = 0; i < byAz.length - 1; i++) {
      const lo = byAz[i], hi = byAz[i + 1];
      assert.equal(S.get(lo.portal)![1], Math.min(lo.union[1], hi.union[0]), `${side} ${lo.portal}: its arch ends where ${hi.portal}'s months begin to reach`);
      assert.equal(S.get(hi.portal)![0], Math.max(hi.union[0], lo.union[1]), `${side} ${hi.portal}: its arch begins where ${lo.portal}'s months stop reaching`);
      want.push([S.get(lo.portal)![1], S.get(hi.portal)![0]]);
    }
    assert.deepEqual(pillars(P), want, side);
    for (const [lo, hi] of pillars(P)) assert.ok(hi > lo && hi - lo < 1.5, `${side}: a seam is under 1.5° wide, got ${hi - lo}`);
    assert.deepEqual(S.get(byAz[0].portal)![0], byAz[0].union[0], 'the outermost arches reach the Sun\'s furthest bearing');
  }
  // five seams each side; between the third and fourth portals the whole stretch where spring's Day 1 and autumn's first of month 7 rose
  assert.deepEqual(pillars(doc.portals).map(([a, b]) => +(b - a).toFixed(3)), [0.463, 0.873, 0.702, 1.388, 0.969]);
  assert.deepEqual(pillars(doc.portals_west).map(([a, b]) => +(b - a).toFixed(3)), [0.728, 0.973, 0.381, 0.389, 0.144]);
});

test('the portals go by month: Day 1 enters the fourth, the solstices are in the sixth and the first, autumn\'s equal day leaves the fourth', () => {
  const at = (date: string) => { const k = doc.rows.findIndex((r) => r.civil_date === date); return litPortals(doc, doc.rows[k].sunrise_jd_ut + 0.3); };
  assert.deepEqual(at('2026-03-21'), { east: 4, west: 4 }, 'month 1, day 1: the great portal, the fourth');
  assert.deepEqual(at('2026-04-19'), { east: 4, west: 4 }, 'month 1, day 30');
  assert.deepEqual(at('2026-04-20'), { east: 5, west: 5 }, 'month 2');
  assert.deepEqual(at('2026-06-20'), { east: 6, west: 6 }, 'month 3, day 31: the summer solstice');
  assert.deepEqual(at('2026-06-21'), { east: 6, west: 6 }, 'month 4 stays in the sixth');
  assert.deepEqual(at('2026-09-19'), { east: 4, west: 4 }, 'month 6, day 31: the equal day, the fourth');
  assert.deepEqual(at('2026-09-20'), { east: 3, west: 3 }, 'month 7: the third');
  assert.deepEqual(at('2026-12-19'), { east: 1, west: 1 }, 'month 9, day 31: the winter solstice, the first');
  assert.deepEqual(at('2026-12-20'), { east: 1, west: 1 }, 'month 10 stays in the first');
  // the months: 30 days each, 31 in the third, sixth, ninth and twelfth (a date the correction holds is one more civil day, not another date)
  const dates = new Map<number, Set<number>>(); for (const r of doc.rows) if (!r.closing_boundary) (dates.get(r.month) ?? dates.set(r.month, new Set()).get(r.month)!).add(r.day);
  assert.deepEqual([...dates].map(([m, d]) => [m, d.size]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => [m, m % 3 ? 30 : 31]));
  assert.deepEqual(doc.text.course.map((c) => c.portal), [4, 5, 6, 6, 5, 4, 3, 2, 1, 1, 2, 3], '1 Enoch 72');
});

test('every morning the Sun rises and sets on its month\'s arch or a seam beside it, never on another portal\'s arch', () => {
  for (const [side, P] of [['east', doc.portals], ['west', doc.portals_west]] as const) {
    const S = arches(P), byAz = [...P].sort((a, b) => a.union[0] - b.union[0]).map((p) => p.portal);
    doc.rows.forEach((r, k) => {
      if (r.closing_boundary) return;
      const portal = doc.extended[k].portal, i = byAz.indexOf(portal), az = side === 'east' ? r.azimuth_deg : doc.extended[k].sunset_azimuth_deg;
      const lo = i > 0 ? S.get(byAz[i - 1])![1] : S.get(portal)![0], hi = i < byAz.length - 1 ? S.get(byAz[i + 1])![0] : S.get(portal)![1];
      assert.ok(az >= lo - 1e-9 && az <= hi + 1e-9, `${side} ${r.civil_date} (month ${r.month}): ${az.toFixed(3)}° is not on portal ${portal}'s arch or its seams [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
    });
  }
});

test('each arch stands on the horizon, its sides on the two azimuths of its span, its crown at the full height', () => {
  for (const P of [doc.portals, doc.portals_west]) for (const p of P) {
    const [lo, hi] = archOf(P, p.portal), v = vertices(archPath([lo, hi], radius));
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

test('a horizon azimuth is within a portal when it lies in its span, never in a seam', () => {
  const s = archOf(doc.portals, 2);
  assert.ok(within(s, s[0]) && within(s, s[1]) && within(s, (s[0] + s[1]) / 2));
  assert.ok(!within(s, s[0] - 0.001) && !within(s, s[1] + 0.001));
  for (const [lo, hi] of pillars(doc.portals)) assert.ok(![...arches(doc.portals).values()].some((q) => within(q, (lo + hi) / 2)));
});

test('the lit portals are the day\'s month\'s, east and west: II on Day 215, its month\'s on every day of the year, even on a seam; none outside the year', () => {
  const k = doc.rows.findIndex((r) => r.month === 8 && r.day === 6), jd = doc.rows[k].sunrise_jd_ut;
  assert.deepEqual(litPortals(doc, jd + 0.3), { east: 2, west: 2 });
  assert.deepEqual(litPortals(doc, jd), litPortals(doc, doc.rows[k + 1].sunrise_jd_ut - 1e-6), 'the whole Enoch day, sunrise to the next');
  assert.deepEqual(litPortals(doc, doc.rows[0].sunrise_jd_ut - 1), { east: null, west: null }, 'before the year');
  const seam = structuredClone(doc); seam.rows[k].azimuth_deg = 114.8; seam.extended[k].sunset_azimuth_deg = 245.1;   // on the seams between II and I
  assert.deepEqual(litPortals(seam, jd + 0.3), { east: 2, west: 2 }, 'a bearing on a seam: the month decides');
  for (let i = 0; i < doc.rows.length - 1; i++) { const p = doc.extended[i].portal; assert.deepEqual(litPortals(doc, doc.rows[i].sunrise_jd_ut + 0.01), { east: p, west: p }, doc.rows[i].civil_date); }
});

test('the last passage: the latest morning up to now in one of the portal\'s months, at its sunrise bearing (east) or sunset bearing (west)', () => {
  const k = doc.rows.findIndex((r) => r.month === 8 && r.day === 6), jd = doc.rows[k].sunrise_jd_ut + 0.3;
  for (const side of ['east', 'west'] as const) for (const p of side === 'east' ? doc.portals : doc.portals_west) {
    const az = (i: number) => (side === 'east' ? doc.rows[i].azimuth_deg : doc.extended[i].sunset_azimuth_deg);
    let want = -1; for (let i = k; i >= 0; i--) if (doc.text.course[doc.rows[i].month - 1].portal === p.portal) { want = i; break; }   // brute force, from the text's table
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
  assert.ok(az(10) > archOf(doc.portals, 2)[0] && Math.abs(az(10) - 104.18) < 0.05, 'ten minutes on, the Sun is over portal II\'s span (as in the screenshot, 104.2°) though it rose at the edge of portal III');
});

test('a passage run is the unbroken mornings of the last pass, oldest first, each in the portal\'s month, the day before not', () => {
  const k = doc.rows.findIndex((r) => r.month === 8 && r.day === 6), jd = doc.rows[k].sunrise_jd_ut + 0.3;
  for (const side of ['east', 'west'] as const) for (const p of side === 'east' ? doc.portals : doc.portals_west) {
    const run = passageRun(doc, side, p.portal, jd), last = lastPassage(doc, side, p.portal, jd);
    if (!last) { assert.deepEqual(run, []); continue; }
    assert.equal(run[run.length - 1].k, last.k, 'ends at the last passage');
    run.forEach((q, i) => {
      assert.equal(doc.extended[q.k].portal, p.portal, 'in the portal\'s month');
      if (i) assert.equal(q.k, run[i - 1].k + 1, 'unbroken');
    });
    if (run[0].k > 0) assert.notEqual(doc.extended[run[0].k - 1].portal, p.portal, 'the morning before the run was in another portal\'s month');
  }
  const today = passageRun(doc, 'east', 2, jd);
  assert.ok(today.length >= 1 && today[today.length - 1].daysAgo === 0, 'portal II is being passed today, so its run ends today');
  assert.deepEqual(passageRun(doc, 'east', 1, doc.rows[0].sunrise_jd_ut + 0.1), [], 'none yet');
});
