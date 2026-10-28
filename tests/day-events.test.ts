// The Day's events (SF 2026 fixture): the Sun's from the calculator, the planets' and the Moon's from Astronomy Engine.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dayEvents, risingWithSun } from '../src/day/events.ts';
import type { YearDoc } from '../src/types.ts';

const doc = JSON.parse(readFileSync(new URL('./fixtures/sf-2026.json', import.meta.url), 'utf8')) as YearDoc;
const i = doc.rows.findIndex((r) => r.civil_date === '2026-10-28');
const events = dayEvents(doc, i);

test('the day runs sunrise to sunrise, in time order, each at its part', () => {
  const a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut;
  assert.deepEqual(events[0], { jd: a, part: 0, body: 'Sun', kind: 'rise', color: '#f4dc9f' });
  for (const [k, e] of events.entries()) {
    assert.ok(e.jd >= a && e.jd < b, `${e.body} ${e.kind} inside the day`);
    assert.ok(Math.abs(e.part - (18 * (e.jd - a)) / (b - a)) < 1e-9);
    if (k) assert.ok(e.jd >= events[k - 1].jd);
  }
});

test("the Sun's set is the calculator's; noon and midnight fall between its rise and set, and after the set", () => {
  const sun = Object.fromEntries(events.filter((e) => e.body === 'Sun').map((e) => [e.kind, e.jd]));
  assert.equal(sun.set, doc.extended[i].sunset_jd_ut);
  assert.ok(sun.rise < sun.noon && sun.noon < sun.set && sun.set < sun.midnight);
});

test('every planet and the Moon rises or sets at least once', () => {
  for (const name of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Moon']) assert.ok(events.some((e) => e.body === name), name);
});

test('rising with the Sun: Venus before it (at the end of the day, before the next sunrise), Mercury after', () => {
  const r = risingWithSun(doc, i, events);
  assert.deepEqual(r.map((e) => e.body), ['Venus', 'Mercury']);
  assert.ok(r[0].offset < 0 && r[0].offset > -60, `Venus ${r[0].offset} min`);
  assert.ok(r[1].offset > 60 && r[1].offset < 100, `Mercury ${r[1].offset} min`);
});
