// Pure mappings against a saved year document (San Francisco, Enoch year 14778).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { annual, cursorRow, dayIndexAt, jdFromMs, partOfDay } from '../src/model.ts';
import type { YearDoc } from '../src/types.ts';

const doc = JSON.parse(readFileSync(new URL('./fixtures/sf-2026.json', import.meta.url), 'utf8')) as YearDoc;
const days = annual(doc);

test('fixture is the verified SF 2026 year', () => {
  assert.equal(doc.calculation.enoch_year, 14778);
  assert.equal(days.length, 366);
  assert.equal(days[211].enoch_date, '14778-07-29');
  assert.equal(days[211].sunrise_jd_ut, 2461332.098051732);
});

test('the Enoch day containing an instant runs from its sunrise to the next', () => {
  const a = doc.rows[211].sunrise_jd_ut, b = doc.rows[212].sunrise_jd_ut;
  assert.equal(dayIndexAt(doc, a), 211);
  assert.equal(dayIndexAt(doc, b - 1e-9), 211);
  assert.equal(dayIndexAt(doc, b), 212);
  assert.equal(dayIndexAt(doc, doc.rows[0].sunrise_jd_ut - 1e-6), -1);
  assert.equal(dayIndexAt(doc, doc.rows.at(-1)!.sunrise_jd_ut), -1); // closing boundary belongs to the next year
});

test('the day is eighteen equal parts from sunrise to the next sunrise', () => {
  const a = doc.rows[211].sunrise_jd_ut, b = doc.rows[212].sunrise_jd_ut;
  assert.equal(partOfDay(doc, 211, a), 0);
  assert.ok(Math.abs(partOfDay(doc, 211, (a + b) / 2) - 9) < 1e-9);
  assert.ok(Math.abs(partOfDay(doc, 211, a + 0.25) - 18 * 0.25 / (b - a)) < 1e-9);
});

test('cursor clamps and interpolates only between computed mornings', () => {
  assert.deepEqual(cursorRow(days, -3), { i: 0, f: 0 });
  assert.deepEqual(cursorRow(days, 999), { i: 365, f: 0 });
  const c = cursorRow(days, 10.25);
  assert.equal(c.i, 10); assert.ok(Math.abs(c.f - 0.25) < 1e-12);
});

test('Unix time to Julian day', () => {
  assert.equal(jdFromMs(0), 2440587.5);
  assert.equal(jdFromMs(Date.UTC(2000, 0, 1, 12)), 2451545);
});
