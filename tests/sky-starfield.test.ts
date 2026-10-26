import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeStars} from '../src/sky/catalogue';
import {skyFrame, starVector} from '../src/sky/astronomy';
import {aberration, aberrated, refracted, declinationOfDate, apparentAltitude, refraction} from '../src/sky/instrument';
import {StarField} from '../src/sky/starfield';

const stars = ['stars-le6', 'stars-6to8'].flatMap((f) => decodeStars(JSON.parse(readFileSync(`public/sky/${f}.json`, 'utf8'))));
const field = new StarField(stars);
const wrap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
// site, JD (UT): today-ish, the 1st-century epoch, and far past/future (proper motion grows with the interval)
const SITES: [number, number, number][] = [[37.7749, -122.4194, 0], [31.7784, 35.2354, 800], [-33.8688, 151.2093, 0], [64.1, -21.9, 0], [0.5, 10, 0]];
const JDS = [2461000.3, 2451545.0, 1721425.5, 2700000.1, 2457000.9];

for (const refr of [true, false]) {
  test(`projection equals the reference chain star by star (refraction ${refr ? 'on' : 'off'})`, () => {
    let worstAz = 0, worstAlt = 0, worstDec = 0, count = 0;
    for (const [lat, lon, h] of SITES) for (const jd of JDS) {
      const truth = skyFrame(jd, lat, lon, h), ab = aberration(truth.time), app = aberrated(truth, ab);
      const f = refr ? refracted(app) : app, p = field.projector(truth, ab, refr ? {hpa: 1013.25, celsius: 15} : null);
      for (let i = 0; i < field.n; i += 7) {          // every 7th keeps the run short while hitting every chunk and magnitude
        const s = stars[i], want = f.direction(starVector(s, f.time)), wantDec = declinationOfDate(s, f.time, ab);
        p.star(i); const alt = p.altitude();
        worstAz = Math.max(worstAz, wrap(p.az, want.az)); worstAlt = Math.max(worstAlt, Math.abs(alt - want.alt)); worstDec = Math.max(worstDec, Math.abs(p.dec() - wantDec)); count++;
      }
    }
    console.log({count, worstAz, worstAlt, worstDec});
    assert.ok(worstAz < 1e-9 && worstAlt < 1e-9 && worstDec < 1e-9);
  });
}
test('the flagged high-proper-motion star keeps its source position', () => {
  const i = stars.findIndex((s) => s.id === 'hyg:4.1:87665');
  if (i < 0) return;                                         // not in these chunks
  const truth = skyFrame(2461000.3, 37.7749, -122.4194, 0), ab = aberration(truth.time), f = aberrated(truth, ab), p = field.projector(truth, ab, null);
  const want = f.direction(starVector(stars[i], f.time)); p.star(i);
  assert.ok(wrap(p.az, want.az) < 1e-9 && Math.abs(p.altitude() - want.alt) < 1e-9);
});
test('stars appended later are taken in, and indexed by ID', () => {
  const part = stars.slice(0, 1000), fld = new StarField(part);
  assert.equal(fld.n, 1000); part.push(...stars.slice(1000, 3000)); fld.sync();
  assert.equal(fld.n, 3000); assert.equal(fld.indexOf(stars[2500].id), 2500); assert.equal(fld.indexOf('hyg:4.1:0'), -1);
  assert.equal(fld.mag[2500], stars[2500].mag_v);
});
test('apparentAltitude inverts refraction across the sky, including the formula seam near 17.9°', () => {
  for (let app = 0; app <= 90; app += 0.0137) assert.ok(Math.abs(apparentAltitude(app - refraction(app)) - app) < 1e-9, `${app}`);
});
