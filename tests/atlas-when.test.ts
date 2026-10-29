// Atlas's When (src/atlas/when.ts) on the SF 2026 fixture: eras, Enoch dates, clock times within an Enoch day, seasons.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localParts } from '../src/dates.ts';
import { dayEvents } from '../src/day/events.ts';
import { annual } from '../src/model.ts';
import { amongEvents, clockToJd, daysIn, ENOCH_MONTH_DAYS, enochIndex, fromEra, nextSeason, seasons, toEra } from '../src/atlas/when.ts';
import type { YearDoc } from '../src/types.ts';

const doc = JSON.parse(readFileSync(new URL('./fixtures/sf-2026.json', import.meta.url), 'utf8')) as YearDoc;
const tz = doc.calculation.timezone;
const clockAt = (jd: number, i: number) => localParts(jd, tz, doc.rows[i].sunrise_local.slice(19)).time.slice(0, 5);

test('eras: 0 is 1 BCE, −500 is 501 BCE, and back', () => {
  assert.deepEqual(toEra(2026), { n: 2026, bce: false });
  assert.deepEqual(toEra(0), { n: 1, bce: true });
  assert.deepEqual(toEra(-500), { n: 501, bce: true });
  for (const y of [-12998, -500, 0, 1, 2026]) { const e = toEra(y); assert.equal(fromEra(e.n, e.bce), y); }
  assert.equal(daysIn(2024, 2), 29); assert.equal(daysIn(1900, 2), 28); assert.equal(daysIn(0, 2), 29); assert.equal(daysIn(-100, 2), 28);
});

test('Enoch months are 30·30·31, 364 days; a date is found in the year, a hold repeat once', () => {
  assert.equal(ENOCH_MONTH_DAYS.reduce((a, b) => a + b), 364);
  assert.equal(enochIndex(doc, 1, 1), 0);
  const k = enochIndex(doc, 8, 12);
  assert.equal(annual(doc)[k].enoch_date.slice(-5), '08-12');
  assert.equal(enochIndex(doc, 3, 4), annual(doc).findIndex((r) => r.month === 3 && r.day === 4));
  assert.equal(enochIndex(doc, 13, 1), -1);
});

test('a clock time is found within the Enoch day: after the sunrise the same date, before it the next morning', () => {
  const i = annual(doc).findIndex((r) => r.civil_date === '2026-10-28'), a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut;
  for (const hm of ['12:00', '23:59', '00:00', '04:30']) {
    const jd = clockToJd(doc, i, hm);
    assert.ok(jd >= a && jd < b, hm);
    assert.equal(clockAt(jd, i), hm);
  }
  assert.ok(clockToJd(doc, i, '12:00') < clockToJd(doc, i, '23:59') && clockToJd(doc, i, '23:59') < clockToJd(doc, i, '04:30'));
});

test('a clock time across the end of summer time (1 November 2026, 02:00 back to 01:00) reads back the same', () => {
  const i = annual(doc).findIndex((r) => r.civil_date === '2026-10-31');
  for (const hm of ['00:30', '03:30', '06:00']) assert.equal(clockAt(clockToJd(doc, i, hm), i), hm, hm);
});

test("the year's equinoxes and solstices, in order, and the next one after an instant", () => {
  const eq = seasons(doc, 'equinox'), so = seasons(doc, 'solstice');
  assert.equal(eq.length, 2); assert.equal(so.length, 2);
  const date = (jd: number) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10);
  assert.deepEqual([...eq, ...so].map(date).sort(), ['2026-06-21', '2026-09-23', '2026-12-21', '2027-03-20']);
  assert.equal(date(nextSeason(doc, doc.rows[0].sunrise_jd_ut, 'solstice')!), '2026-06-21');
  assert.equal(date(nextSeason(doc, so[0] + 1, 'solstice')!), '2026-12-21');
  assert.equal(date(nextSeason(doc, so[1] + 1, 'solstice')!), '2026-06-21', 'past the last: the first again');
});

test('the reading among the events: "at sunset", or the time to the next', () => {
  const i = annual(doc).findIndex((r) => r.civil_date === '2026-10-28'), ev = dayEvents(doc, i);
  const set = ev.find((e) => e.body === 'Sun' && e.kind === 'set')!;
  assert.equal(amongEvents(ev, set.jd + 0.5 / 1440), 'at sunset');
  const mid = ev.find((e) => e.kind === 'midnight')!, before = ev.filter((e) => e.jd < mid.jd).at(-1)!;
  assert.match(amongEvents(ev, before.jd + 2 / 1440), /^(\d+ h )?\d+ min before /);
});
