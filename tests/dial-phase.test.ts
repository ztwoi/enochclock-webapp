// The gear train: every day-based ring is a continuous, exact ratio of one clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blendPhases, ringPhases } from '../src/dial/state';
import type { YearDoc } from '../src/types';

const doc = JSON.parse(readFileSync(new URL('./fixtures/dial-year-sf-2026.json', import.meta.url), 'utf8')) as YearDoc;
const DAYS = doc.rows.length - 1;                                    // the last row is the closing boundary
const UNITS = { uncorrected: 364, position: 364, correction: 294, courses: 24, weekday: 7, parts: 18 } as const;
type K = keyof typeof UNITS;
const KEYS = Object.keys(UNITS) as K[];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const near0 = (a: number, n: number) => Math.min(mod(a, n), mod(-a, n));
const holds = doc.extended.map((e, k) => (e.hold ? k : -1)).filter((k) => k >= 0);

test('the fixture year has a correction hold (so the hold is exercised)', () => assert.ok(holds.length >= 1));

test('continuous: at every sunrise each ring has exactly reached where the next day starts', () => {
  for (let i = 0; i < DAYS - 1; i++) {
    const end = ringPhases(doc, i, 18), next = ringPhases(doc, i + 1, 0);
    for (const k of KEYS) assert.ok(near0(end[k] - next[k], UNITS[k]) < 1e-9, `${k} at the end of day ${i}: ${end[k]} vs ${next[k]}`);
  }
});

test('gears: per day the rings advance in fixed ratios — 1 weekday, 1/7 course, 1 correction day, 1 uncorrected day, 18 parts', () => {
  for (let i = 0; i < DAYS; i++) {
    const a = ringPhases(doc, i, 0), b = ringPhases(doc, i, 18), g = (k: K) => b[k] - a[k];
    assert.ok(Math.abs(g('weekday') - 1) < 1e-9 && Math.abs(g('courses') - 1 / 7) < 1e-9 && Math.abs(g('correction') - 1) < 1e-9);
    assert.ok(Math.abs(g('uncorrected') - 1) < 1e-9 && Math.abs(g('parts') - 18) < 1e-9, `day ${i}`);
    const held = doc.extended[i].hold || !!doc.extended[i + 1]?.hold;
    assert.ok(Math.abs(g('position') - (held ? 0.5 : 1)) < 1e-9, `position, day ${i}`);
  }
});

test('a held position is crossed over two elapsed days, at half speed — never stopped', () => {
  for (const h of holds) {
    assert.equal(doc.rows[h].corrected_doy, doc.rows[h - 1].corrected_doy, 'a hold repeats the position');
    const p0 = ringPhases(doc, h - 1, 0).position, p1 = ringPhases(doc, h, 0).position, p2 = ringPhases(doc, h + 1, 0).position;
    assert.ok(Math.abs(p1 - p0 - 0.5) < 1e-9 && Math.abs(p2 - p1 - 0.5) < 1e-9);
  }
  // over the year the 365 elapsed days carry the position ring through exactly its 364 positions
  let total = 0; for (let i = 0; i < DAYS; i++) total += ringPhases(doc, i, 18).position - ringPhases(doc, i, 0).position;
  assert.ok(Math.abs(total - (DAYS - holds.length)) < 1e-6, `total ${total}`);                  // 365 days − 1 hold = 364 positions
});

test('one week: the weekday ring makes 7 units, the courses ring exactly 1, with no pause in between', () => {
  for (let i = 0; i + 7 < DAYS; i += 5) {
    const a = ringPhases(doc, i, 3.3), b = ringPhases(doc, i + 7, 3.3);
    assert.ok(near0(b.weekday - a.weekday, 7) < 1e-9 && near0(b.courses - a.courses - 1, 24) < 1e-9, `week from day ${i}`);
  }
  // no halt: across a whole week, in 1/36-day steps, the courses ring never stands still and never goes back
  const step = 1 / 7 / 36 * 1;                                       // expected advance per 1/36 day
  for (let i = 0; i + 8 < DAYS; i += 9) for (let n = 0; n < 7 * 36; n++) {
    const t = (n / 36) + 0, d0 = i + Math.floor(t), p0 = (t % 1) * 18, t1 = (n + 1) / 36, d1 = i + Math.floor(t1), p1 = (t1 % 1) * 18;
    const adv = mod(ringPhases(doc, d1, p1).courses - ringPhases(doc, d0, p0).courses, 24);
    assert.ok(Math.abs(adv - step) < 1e-9, `courses advance ${adv} at day ${i} step ${n}`);
  }
});

test('the integer part is the calculator\'s own value: sector, weekday, course, positions agree at every sample', () => {
  for (let i = 0; i < DAYS; i++) for (let n = 0; n < 36; n++) {
    const p = ringPhases(doc, i, (n / 36) * 18), e = doc.extended[i], r = doc.rows[i];
    assert.equal(Math.floor(p.weekday) + 1, e.weekday, `weekday day ${i}`);
    assert.equal(Math.floor(p.courses) + 1, e.course, `course day ${i}`);
    assert.equal(Math.floor(p.correction) + 1, e.correction_day, `correction day ${i}`);
    assert.equal(Math.floor(p.uncorrected) + 1, e.uncorrected_doy, `uncorrected day ${i}`);
    assert.equal(Math.floor(p.position) + 1, r.corrected_doy, `position day ${i}`);
  }
});

test('gear ratio at any instant: the weekday ring runs exactly 7× the courses ring', () => {
  for (let i = 0; i + 1 < DAYS; i += 3) for (const part of [0.2, 5.5, 11.9, 17.7]) {
    const a = ringPhases(doc, i, part), b = ringPhases(doc, i + 1, part);
    assert.ok(near0(mod(b.weekday - a.weekday, 7) - 7 * mod(b.courses - a.courses, 24), 7) < 1e-9);
  }
});

test('play by days: gliding the date at a fixed hour — the parts ring holds, the others advance by their exact gain, with no seam at a sunrise', () => {
  const part = 7.3, N = 20;
  for (let i = 0; i + 1 < DAYS; i++) {
    const a = ringPhases(doc, i, part), b = ringPhases(doc, i + 1, part);
    for (let n = 0; n <= N; n++) {
      const g = blendPhases(a, b, n / N), nxt = n < N ? null : b;
      assert.ok(Math.abs(g.parts - part) < 1e-9, 'the hour does not move');
      assert.ok(near0(g.weekday - a.weekday - n / N, 7) < 1e-9 && Math.abs(g.courses - a.courses - n / N / 7) < 1e-9 || near0(g.courses - a.courses - n / N / 7, 24) < 1e-9);
      if (nxt) for (const k of KEYS) assert.ok(near0(g[k] - nxt[k], UNITS[k]) < 1e-9, `${k}: reaches tomorrow's value, day ${i}`);
    }
  }
});

test('play by days across a held position: the position ring glides at half speed over both days, never stopping', () => {
  for (const h of holds) {
    let prev = ringPhases(doc, h - 2, 5).position;
    for (let n = 1; n <= 4 * 10; n++) {                                  // days h-2 … h+2, in tenths of a day
      const day = h - 2 + Math.floor(n / 10), frac = (n % 10) / 10;
      const a = ringPhases(doc, day, 5), b = ringPhases(doc, day + 1, 5), now = blendPhases(a, b, frac).position;
      const step = mod(now - prev, 364);
      assert.ok(step > 0 && step <= 0.1 + 1e-9, `tenth ${n}: ${step}`);                 // always moving, never faster than a normal day
      prev = now;
    }
  }
});
