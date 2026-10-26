import assert from 'node:assert/strict';
import { test } from 'node:test';
import { civil, enochParts, enochText, isoDate, isoFromJd, offsetOf, parseDate, readDate, timeOf, yearLabel, yearOf } from '../src/dates.ts';

test('ISO dates: YYYY inside 0–9999, ±YYYYYY beyond, round-tripping', () => {
  assert.equal(isoDate(2026, 10, 20), '2026-10-20');
  assert.equal(isoDate(0, 3, 21), '0000-03-21');
  assert.equal(isoDate(-500, 3, 22), '-000500-03-22');
  assert.equal(isoDate(12000, 3, 19), '+012000-03-19');
  for (const y of [-12998, -1, 0, 1, 9999, 10000, 16995]) assert.deepEqual(parseDate(isoDate(y, 2, 28)), { y, m: 2, d: 28 });
  assert.equal(yearOf('-012990-03-24'), -12990);
});
test('instants to dates across the range (proleptic Gregorian, as the calculator)', () => {
  assert.equal(isoFromJd(2461333.5), '2026-10-20');            // JD .5 is midnight UT
  assert.equal(isoFromJd(-3023360.92124), '-012990-03-21');          // SF sunrise on 21 March 12991 BCE (swe.revjul agrees)
  assert.equal(isoFromJd(1721505.09163), '0001-03-21');
});
test('dates for people: unchanged for 1–9999, BCE spelled out', () => {
  assert.equal(civil('2026-10-20'), '2026-10-20');
  assert.equal(civil('-000500-03-22'), '−500-03-22 (501 BCE)');
  assert.equal(civil('0000-03-21'), '0-03-21 (1 BCE)');
  assert.equal(civil('+012000-03-19'), '12000-03-19');
  assert.equal(civil('-012990-03-24T05:56:01-07:52:58'), '−12990-03-24 (12991 BCE)');
  assert.equal(yearLabel(-500), '501 BCE'); assert.equal(yearLabel(2026), '2026');
});
test('Enoch dates keep a negative year whole', () => {
  assert.deepEqual(enochParts('-0227-01-01'), ['−0227', '01', '01']);
  assert.equal(enochText('14778-08-01'), '14778 · 08 · 01');
  assert.equal(enochText('14778-08-01', '-'), '14778-08-01');
});
test('local times in any year', () => {
  assert.equal(timeOf('-012990-03-24T05:56:01-07:52:58'), '05:56:01');
  assert.equal(offsetOf('-012990-03-24T05:56:01-07:52:58'), '-07:52:58');
  assert.equal(timeOf('2026-03-21T07:11:25-07:00'), '07:11:25');
});
test('typed dates: astronomical years, either minus sign, validated', () => {
  assert.equal(readDate('2026-10-20'), '2026-10-20');
  assert.equal(readDate('-500-3-21'), '-000500-03-21');
  assert.equal(readDate('−500-03-21'), '-000500-03-21');
  assert.equal(readDate('12000-03-19'), '+012000-03-19');
  assert.equal(readDate('2026-02-29'), null); assert.equal(readDate('-4-02-29'), '-000004-02-29');   // −4 (5 BCE) is a leap year
  assert.equal(readDate('-13000-01-01'), null); assert.equal(readDate('17000-01-01'), null); assert.equal(readDate('soon'), null);
});
