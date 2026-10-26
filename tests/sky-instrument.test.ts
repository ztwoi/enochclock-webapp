// Sky-view quantities against independent values: the Swiss Ephemeris Moon at sunset
// (from the calculator), a brute-force horizon crossing, and the Sun's own portal at sunrise.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { skyFrame, starVector } from '../src/sky/astronomy.ts';
import { decodeStars } from '../src/sky/catalogue.ts';
import { Body, GeoVector, ObserverVector, Vector } from 'astronomy-engine';
import { aberrated, apparentAltitude, declinationOfDate, ecliptic, horizonAzimuth, HORIZON_REFRACTION_DEG, jdOfPart, moon, portalAt, refracted, refraction } from '../src/sky/instrument.ts';
import type { YearDoc } from '../src/types.ts';

const doc = JSON.parse(readFileSync(new URL('./fixtures/sf-2026.json', import.meta.url), 'utf8')) as YearDoc;
const SF = [37.7749, -122.4194, 0] as const;
const bright = decodeStars(JSON.parse(readFileSync('public/sky/stars-le6.json', 'utf8')));

test('Moon illuminated fraction agrees with Swiss Ephemeris at every sunset of the year', () => {
  let worst = 0;
  doc.extended.forEach((e) => { const f = moon(skyFrame(e.sunset_jd_ut, ...SF)).fraction; worst = Math.max(worst, Math.abs(f - e.moon_illuminated_fraction_at_sunset)); });
  console.log({ worstMoonFraction: worst });
  assert.ok(worst < 0.003, `${worst}`);
});

test('rising azimuth matches a brute-force crossing of the apparent horizon', () => {
  for (const name of ['Sirius', 'Aldebaran', 'Spica', 'Antares', 'Regulus']) {
    const s = bright.find((x) => x.name === name)!;
    const jd0 = 2461332.0, f0 = skyFrame(jd0, ...SF), dec = declinationOfDate(s, f0.time);
    const predicted = horizonAzimuth(dec, SF[0])!;
    // walk one sidereal day in 20 s steps; find where the unrefracted altitude crosses −34′ while rising
    let prev = f0.direction(starVector(s, f0.time)), found = NaN;
    for (let k = 1; k < 4320 && Number.isNaN(found); k++) {
      const f = skyFrame(jd0 + k / 4320, ...SF), h = f.direction(starVector(s, f.time));
      if (prev.alt < -HORIZON_REFRACTION_DEG && h.alt >= -HORIZON_REFRACTION_DEG && h.az < 180) found = h.az;
      prev = h;
    }
    assert.ok(Math.abs(found - predicted) < 0.05, `${name}: ${found} vs ${predicted}`); // 20 s of motion ≈ 0.07° along the path
  }
});

test('the Sun at each month boundary sunrise sits in the portal the text assigns', () => {
  const days = doc.rows.filter((r) => !r.closing_boundary);
  for (let m = 1; m <= 12; m++) {
    const k = days.findIndex((r) => r.month === m) + 10; // mid-month morning, clear of the seams
    assert.deepEqual(portalAt(days[k].azimuth_deg, doc.portals), { portal: doc.text.course[m - 1].portal, where: 'within' }, `month ${m}`);
  }
  assert.equal(portalAt(30, doc.portals).where, 'outside');
});

test('ecliptic of date passes through the Sun', () => {
  const f = skyFrame(doc.rows[100].sunrise_jd_ut, ...SF), e = ecliptic(f, 0.05);
  const best = Math.min(...e.map((p) => Math.hypot((p.az - f.sun.az) * Math.cos(f.sun.alt * Math.PI / 180), p.alt - f.sun.alt)));
  assert.ok(best < 0.05, `${best}`); // Sun's ecliptic latitude is < 1″; sampling step dominates
});

test('stars rising in the portals are the Sun\'s declination band', () => {
  const lo = horizonAzimuth(23.44, SF[0])!, hi = horizonAzimuth(-23.44, SF[0])!;
  const north = doc.portals[5].union[0], south = doc.portals[0].union[1];
  assert.ok(Math.abs(lo - north) < 0.6 && Math.abs(hi - south) < 0.6, `${lo} ${north} ${hi} ${south}`); // upper limb vs centre, refraction model
});

test('refraction is Swiss Ephemeris\' (swe_refrac_extended, 1013.25 hPa, 15 °C, apparent → true)', () => {
  // pyswisseph 2.10.03: alt − swe.refrac_extended(alt, 0, 1013.25, 15, 0.0065, APP_TO_TRUE)[0]
  const ref: [number, number][] = [[0, 0.5598886443], [0.1, 0.5393512], [0.5, 0.4676394], [1, 0.3970819], [2, 0.298984], [5, 0.1621066],
    [10, 0.0874492], [15, 0.0589003], [20, 0.0438421], [45, 0.0159679], [80, 0.0028165]];
  for (const [app, r] of ref) assert.ok(Math.abs(refraction(app) - r) < 1e-7, `${app}: ${refraction(app)} vs ${r}`);
  assert.ok(Math.abs(HORIZON_REFRACTION_DEG - 0.5598886443) < 1e-9);
});

test('apparent altitude inverts the refraction and is continuous across the horizon', () => {
  for (const app of [0, 0.01, 0.3, 1, 4, 17.9, 18, 30, 60, 89]) assert.ok(Math.abs(apparentAltitude(app - refraction(app)) - app) < 1e-9, `${app}`);
  const r0 = HORIZON_REFRACTION_DEG;
  assert.ok(Math.abs(apparentAltitude(-r0)) < 1e-12 && Math.abs(apparentAltitude(-r0 - 1e-9)) < 1e-8 && Math.abs(apparentAltitude(-r0 + 1e-9)) < 1e-8);
  assert.equal(apparentAltitude(-5), -5 + r0);
});

test('apparent and refracted, the Sun\'s upper limb is on the horizon at every Swiss sunrise of the year, at the measured azimuth', () => {
  let worstLimb = 0, worstAz = 0;
  for (const r of doc.rows) {
    const t = skyFrame(r.sunrise_jd_ut, ...SF), a = aberrated(t), f = refracted(a);
    const km = Math.hypot(t.sunVector.x, t.sunVector.y, t.sunVector.z) * 149597870.7, sd = Math.asin(696000 / km) * 180 / Math.PI;
    worstLimb = Math.max(worstLimb, Math.abs(f.sun.alt + sd)); worstAz = Math.max(worstAz, Math.abs(f.sun.az - r.azimuth_deg));
    assert.equal(f.sun.az, a.sun.az); // refraction moves altitude only
  }
  console.log({ worstUpperLimbDeg: worstLimb, worstAzimuthVsSwissDeg: worstAz });
  assert.ok(worstLimb < 0.001, `${worstLimb}`); // measured 0.0005° (2026): Astronomy Engine vs Swiss Ephemeris (DE431)
  assert.ok(worstAz < 0.001, `${worstAz}`);
});

test('annual aberration matches Astronomy Engine\'s own aberrated Sun', () => {
  let worst = 0;
  for (const r of doc.rows.filter((_, i) => i % 7 === 0)) {
    const t = skyFrame(r.sunrise_jd_ut, ...SF), mine = aberrated(t).sun;
    const g = GeoVector(Body.Sun, t.time, true), o = ObserverVector(t.time, t.observer, false), ref = t.direction(new Vector(g.x - o.x, g.y - o.y, g.z - o.z, t.time));
    worst = Math.max(worst, Math.hypot((mine.az - ref.az) * Math.cos(ref.alt * Math.PI / 180), mine.alt - ref.alt));
    assert.ok(Math.hypot((t.sun.az - ref.az) * Math.cos(ref.alt * Math.PI / 180), t.sun.alt - ref.alt) > 0.003); // ~20″: it does move the Sun
  }
  console.log({ worstAberrationVsAstronomyEngineDeg: worst });
  assert.ok(worst < 0.01 / 3600, `${worst}`); // < 0.01″ (measured 0.008″)
});

test('parts of the Enoch day are equal divisions from sunrise to next sunrise', () => {
  const a = doc.rows[0].sunrise_jd_ut, b = doc.rows[1].sunrise_jd_ut;
  assert.equal(jdOfPart(a, b, 0), a);
  assert.equal(jdOfPart(a, b, 18), b);
});
