// Atlas (src/atlas): the era's obliquity and polar limit against the calculator's own refusals, the Earth-fixed turn of the
// sky against Astronomy Engine's hour angles, the land against known points, and the preset places.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AstroTime, Body, Equator, HourAngle, Observer, Rotation_EQJ_EQD, SiderealTime, GeoVector } from 'astronomy-engine';
import { apply3, band, bearingWord, distanceKm, eqjToEarth, frameAt, latLon, nearest, obliquity, polarLimit, vec, type V3 } from '../src/atlas/geo.ts';
import { coastSegments, decode, isCut } from '../src/atlas/land.ts';
import PLACES from '../src/atlas/places.json' with { type: 'json' };

const J2000 = 2451545, jdOfYear = (y: number) => J2000 + (y - 2000) * 365.2425;

test('obliquity at J2000 is 23°26′21.448″, and falls by about 47″ a century now', () => {
  assert.ok(Math.abs(obliquity(J2000) - (23 + 26 / 60 + 21.448 / 3600)) < 1e-9);
  const perCentury = (obliquity(J2000 + 36525) - obliquity(J2000)) * 3600;
  assert.ok(perCentury < -46 && perCentury > -48, `${perCentury}″`);
});

test("the polar limit sits where the calculator refuses: 65.6° calculates and 66.0° is refused in 2026; Oulu is refused around 7500 BCE", () => {
  const now = polarLimit(jdOfYear(2026));
  assert.ok(now > 65.6 && now < 66.0, `${now}`);
  const oulu = 65.0121;
  assert.ok(polarLimit(jdOfYear(2026)) > oulu && polarLimit(jdOfYear(12000)) > oulu);
  assert.ok(polarLimit(jdOfYear(-7499)) < oulu, `${polarLimit(jdOfYear(-7499))}`);
  assert.equal(band(31.78, jdOfYear(2026)), 'temperate');
  assert.equal(band(-0.18, jdOfYear(2026)), 'tropic');
  assert.equal(band(65.01, jdOfYear(2026)), 'edge');
  assert.equal(band(70, jdOfYear(2026)), 'polar');
});

test('distances and bearings: Jerusalem to Qumran is about 21 km east', () => {
  const jer = { lat: 31.7784, lon: 35.2354 }, qum = { lat: 31.7414, lon: 35.4593 };
  const km = distanceKm(jer, qum);
  assert.ok(km > 20 && km < 23, `${km}`);
  assert.equal(bearingWord(jer, qum), 'E');
  assert.equal(nearest({ lat: 31.75, lon: 35.4 }, [jer, qum])!.place, qum);
});

test('the camera frame over a point is right-handed and orthonormal, east and north as named', () => {
  for (const [la, lo] of [[0, 0], [31.78, 35.24], [-54.8, -68.3], [64.1, -21.9]]) {
    const { c, e, n } = frameAt(la, lo), d = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const [a, b] of [[c, e], [c, n], [e, n]] as [V3, V3][]) assert.ok(Math.abs(d(a, b)) < 1e-12);
    for (const v of [c, e, n]) assert.ok(Math.abs(d(v, v) - 1) < 1e-12);
    assert.ok(d(e, vec(la, lo + 1)) > 0 && d(n, vec(la + 1, lo)) > 0);
  }
});

test("the Sun and Moon overhead: at the point found, the body's hour angle is 0, and the Sun's latitude is its declination (Astronomy Engine)", () => {
  for (const iso of ['2026-10-29T06:10:00Z', '2026-03-20T12:00:00Z', '1900-06-21T18:00:00Z']) {
    const time = new AstroTime(new Date(iso)), m = eqjToEarth(Rotation_EQJ_EQD(time).rot, SiderealTime(time) * 15);
    for (const body of [Body.Sun, Body.Moon]) {
      const g = GeoVector(body, time, true), r = Math.hypot(g.x, g.y, g.z), p = latLon(apply3(m, [g.x / r, g.y / r, g.z / r]));
      const ha = HourAngle(body, time, new Observer(p.lat, p.lon, 0)), dec = Equator(body, time, new Observer(0, 0, 0), true, true).dec;
      assert.ok(Math.min(ha, 24 - ha) * 15 < 0.01, `${iso} ${body} hour angle ${ha} h`);
      if (body === Body.Sun) assert.ok(Math.abs(p.lat - dec) < 0.01, `${iso} subsolar ${p.lat} vs declination ${dec}`);
    }
  }
});

const rings = decode(JSON.parse(readFileSync(new URL('../public/atlas/land-50m.json', import.meta.url), 'utf8')));
/** Even-odd over every ring, as the land mask is filled. */
const isLand = (lat: number, lon: number) => {
  let inside = false;
  for (const r of rings) for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
    const [xi, yi] = r[k], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

test('the land: rings closed; land where land is, sea where sea is (even-odd, as the mask)', () => {
  assert.equal(rings.length, 1421);
  for (const r of rings) assert.deepEqual(r[0], r[r.length - 1]);
  for (const [la, lo] of [[23, 10], [22, 78], [-10, -50], [60, 100], [-80, 0], [31.78, 35.24], [-25, 133]]) assert.ok(isLand(la, lo), `land at ${la},${lo}`);
  for (const [la, lo] of [[15, 65], [30, -40], [-20, 75], [0, -150], [42, 50], [35, 18]]) assert.ok(!isLand(la, lo), `sea at ${la},${lo}`);   // incl. the Caspian and the Mediterranean
});

test('the coast leaves out the cuts along the antimeridian and the pole', () => {
  assert.ok(isCut([180, 10], [-180, 10]) && isCut([180, 10], [180, 11]) && isCut([0, -90], [10, -90]) && !isCut([10, 50], [10.1, 50.1]));
  const seg = coastSegments(rings);
  assert.equal(seg.length % 6, 0);
  for (let k = 0; k < seg.length; k += 6) assert.ok(Math.hypot(seg[k] - seg[k + 3], seg[k + 1] - seg[k + 4], seg[k + 2] - seg[k + 5]) < 0.1);   // no segment jumps across the globe
});

test('100 preset places: unique, well formed, every one computable in 2026', () => {
  const places = (PLACES as { places: { name: string; region: string; lat: number; lon: number; elev: number; tz: string; tags: string[]; note: string }[] }).places;
  assert.equal(places.length, 100);
  assert.equal(new Set(places.map((p) => p.name)).size, 100);
  for (const p of places) {
    assert.ok(Math.abs(p.lat) < polarLimit(jdOfYear(2026)) && Math.abs(p.lon) <= 180, p.name);
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: p.tz }), p.tz);
    assert.ok(p.tags.length && p.note && p.region && Number.isFinite(p.elev), p.name);
  }
});

test('the preview of a year before it is calculated is close to the calculator: Jerusalem 2026 (sunrise 61.5°–117.3°, 14 h 14 min – 10 h 04 min)', async () => {
  const { preview } = await import('../src/atlas/geo.ts');
  const p = preview(31.7784, jdOfYear(2026));
  assert.ok(Math.abs(p.north - 61.5) < 0.6 && Math.abs(p.south - 117.3) < 0.6, `${p.north} ${p.south}`);
  assert.ok(Math.abs(p.longest - (14 + 14 / 60)) < 0.05 && Math.abs(p.shortest - (10 + 4 / 60)) < 0.05, `${p.longest} ${p.shortest}`);
  assert.equal(p.band, 'temperate');
  const q = preview(70, jdOfYear(2026));
  assert.ok(Number.isNaN(q.north) && q.longest === 24 && q.shortest === 0 && q.band === 'polar');
});

test('a site chosen on the globe: a preset within 2 km lends its name, within 25 km its zone and elevation; else the zone from the coordinates', async () => {
  const { siteAt, siteName } = await import('../src/atlas/panel.ts');
  const jer = siteAt(31.7784, 35.2354);
  assert.deepEqual([jer.name, jer.tz, jer.elev], ['Jerusalem', 'Asia/Jerusalem', 800]);
  const near = siteAt(19.05, 72.72);                                      // off Mumbai, about 17 km west
  assert.match(near.name, /^1\d km W of Mumbai$/); assert.equal(near.tz, 'Asia/Kolkata'); assert.equal(near.elev, 14);
  const far = siteAt(-20, -140);                                          // the open Pacific
  assert.match(far.tz, /^(Etc\/GMT\+9|Pacific\/)/); assert.equal(far.elev, 0); assert.match(far.name, / km [NESW]{1,2} of /);
  assert.equal(siteName({ lat: 51.5, lon: -0.12, name: 'Here' }).name, 'London');   // a preset within 2 km wins over a name
  assert.equal(siteName({ lat: 51.9, lon: -0.12, name: 'Here' }).name, 'Here');
});
