import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {blockStart, filesFor, filesForSpan, missingFile} from '../src/calculator/eras';
import {JDN_OFFSET, selectYear} from '../src/calculator/engine/calendar';
// Measured: the TT instant Swiss switches each file at every 600-year boundary, with ΔT there.
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/ephe-blocks.json'), 'utf8')) as
 {switches: {block_start: number; file: 'sepl' | 'semo'; switch_jd_tt: number; delta_t_days: number}[]};
const tag = (start: number) => (start < 0 ? 'm' : '_') + String(Math.abs(start) / 100).padStart(2, '0');
const pins = new Set(fs.readFileSync(path.join(import.meta.dirname, '../scripts/ephe.sha256'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/\s+/)[1]));

test('the present era is two files: the 1800-2400 planets and Moon', () => {
 assert.deepEqual(filesFor({kind: 'year', selector: {year: 2026}, site: {lat: 0, lon: 0, elev: 0, tz: 'UTC', name: '', source: 'manual'}}), ['sepl_18.se1', 'semo_18.se1']);
 assert.deepEqual(filesFor({kind: 'instant', jd: 2461000.5, site: {lat: 0, lon: 0, elev: 0, tz: 'UTC', name: '', source: 'manual'}}), ['sepl_18.se1', 'semo_18.se1']);
});

test('blocks start on 1 January of multiples of 600: Julian before 1600, Gregorian after; "m" before year 0', () => {
 assert.equal(blockStart(2378496.5), 1800);                   // 1800-01-01 Gregorian
 assert.equal(blockStart(2378496.4), 1200);
 assert.equal(blockStart(1721057.5), 0);                      // 0000-01-01 Julian (1 BCE)
 assert.equal(blockStart(1721057.4), -600);
 assert.equal(tag(-600), 'm06'); assert.equal(tag(1800), '_18'); assert.equal(tag(-13200), 'm132');
});

test('every measured switch is covered: a span at either side of it asks for both files', () => {
 assert.ok(fixture.switches.length >= 150, 'all boundaries measured');
 for (const s of fixture.switches) {
  for (const dt of [-0.01, 0.01]) {
   const ut = s.switch_jd_tt + dt - s.delta_t_days, files = filesForSpan(ut, ut);
   for (const start of [s.block_start - 600, s.block_start])
    assert.ok(files.includes(`${s.file}${tag(start)}.se1`), `${s.file} switch at ${s.block_start} (${s.switch_jd_tt}): ${files} lacks ${s.file}${tag(start)}`);
  }
 }
});

test('every year of the range asks for pinned files only, at most two eras, and one era away from boundaries', () => {
 let doubled = 0;
 for (let y = -12998; y <= 16995; y++) {
  const {bounds} = selectYear({year: y}), files = filesForSpan(bounds[0] - JDN_OFFSET - 1, bounds[12] - JDN_OFFSET + 1);
  const known = files.filter((f) => pins.has(f));
  assert.ok(known.length === 2 || known.length === 4, `${y}: ${files}`);
  if (known.length === 4) doubled++;
 }
 assert.ok(doubled < 120, `${doubled} years load two eras`);   // ~2 a boundary
});

test('a missing file is read from the strict-Swiss refusal', () => {
 assert.equal(missingFile("Strict Swiss calculation failed; missing/unsupported ephemeris data or backend (flags 4): SwissEph file 'semo_24.se1' not found in PATH '/ephe/'"), 'semo_24.se1');
 assert.equal(missingFile('SwissEph file seplm06.se1 not found'), 'seplm06.se1');
 assert.equal(missingFile('No sunrise on requested local date'), undefined);
});
