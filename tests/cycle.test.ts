// Cycle lookups against the calculator's cycle block (SF 2026 fixture).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cycleOf, holdsAround, toRoman } from '../src/cycleui.ts';
import { annual } from '../src/model.ts';
import type { YearDoc } from '../src/types.ts';

const doc = JSON.parse(readFileSync(new URL('./fixtures/sf-2026.json', import.meta.url), 'utf8')) as YearDoc;
const days = annual(doc), today = days.findIndex((r) => r.civil_date === '2026-10-18');

test('Roman numerals', () => {
  assert.deepEqual([1, 4, 9, 14, 40, 51, 90, 102, 1888].map(toRoman), ['I', 'IV', 'IX', 'XIV', 'XL', 'LI', 'XC', 'CII', 'MDCCCLXXXVIII']);
});

test('the calculator reports cycle 51 with 364 holds, each position once', () => {
  const c = cycleOf(doc, 51)!;
  assert.equal(c.holds.length, 364);
  assert.deepEqual([...new Set(c.holds.map((h) => h.position))].sort((a, b) => a - b), Array.from({ length: 364 }, (_, k) => k + 1));
  assert.equal(c.years, 293);
});

test('holds either side of today', () => {
  const { prev, next } = holdsAround(doc, days[today].daycount);
  assert.equal(prev!.civil_date, '2026-05-24');
  assert.equal(next.civil_date, '2027-03-14');
  assert.equal(next.daycount - days[today].daycount, 147);
  const e = doc.extended[today];
  assert.deepEqual([e.corrections_since_epoch, e.cycle, e.cycle_year, e.cycle_year_364], [18358, 51, 128, 129]);
});

test('every hold day of the year is a hold of the cycle', () => {
  const held = new Set(doc.cycle.cycles.flatMap((c) => c.holds.map((h) => h.daycount)));
  doc.extended.forEach((e, k) => { if (e.hold && k < days.length) assert.ok(held.has(e.daycount)); });
});

test('priestly courses: a week each, Sunday to the Sabbath, unbroken through the year', () => {
  const ext = doc.extended.slice(0, days.length);
  for (let k = 1; k < ext.length; k++) {
    const sameWeek = ext[k].course_week_start === ext[k - 1].course_week_start;
    if (sameWeek) assert.equal(ext[k].course, ext[k - 1].course);
    else assert.equal(ext[k].course, ext[k - 1].course % 24 + 1); // next course at each new week
  }
  const today = ext.find((e, k) => days[k].civil_date === '2026-10-19')!;
  assert.deepEqual([today.course_name, today.course_week_start, today.six_year_cycle, today.six_year_year], ['Hakkoz', '2026-10-18', 22, 3]);
  assert.equal(doc.priests.courses[0].name, 'Gamul');
});
