import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { magneticField } from '../src/compass/wmm';

const rows = readFileSync('tests/fixtures/wmm2025-test-values-100.txt', 'utf8').split('\n')
  .filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).map(Number));

test('WMM2025 reproduces all 100 NOAA test values', () => {
  assert.equal(rows.length, 100);
  let dD = 0, dI = 0, dXYZ = 0;
  for (const [year, alt, lat, lon, D, I, , X, Y, Z] of rows) {
    const f = magneticField(lat, lon, alt, year);
    dD = Math.max(dD, Math.abs(f.D - D)); dI = Math.max(dI, Math.abs(f.I - I));
    dXYZ = Math.max(dXYZ, Math.abs(f.X - X), Math.abs(f.Y - Y), Math.abs(f.Z - Z));
  }
  console.log({ worstDeclinationDeg: dD, worstInclinationDeg: dI, worstComponentNT: dXYZ });
  assert.ok(dD <= 0.005, 'declination within the table rounding (0.01°)');
  assert.ok(dI <= 0.005);
  assert.ok(dXYZ < 0.01, 'components within 0.01 nT');
});
