// Atlas's When (docs/atlas.md, A.5): the Gregorian date with BCE/CE, the Enoch date, a clock time within an Enoch day, the
// equinox and solstice jumps, and the reading over the day bar. Pure: the year document in, instants out, so the tests run it.
import { AstroTime, SearchSunLongitude } from 'astronomy-engine';
import { localParts, offsetOf, timeOf } from '../dates';
import { annual } from '../model';
import type { DayEvent } from '../day/events';
import type { YearDoc } from '../types';

const J2000 = 2451545;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The Enoch months' days: thirty, and thirty-one for the last month of each season. */
export const ENOCH_MONTH_DAYS = [30, 30, 31, 30, 30, 31, 30, 30, 31, 30, 30, 31];

export const leap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
/** Days in a month of the proleptic Gregorian calendar (astronomical year). */
export const daysIn = (y: number, m: number) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** An astronomical year for people: the year number and its era (0 = 1 BCE, −500 = 501 BCE). */
export const toEra = (y: number) => ({ n: y <= 0 ? 1 - y : y, bce: y <= 0 });
/** …and back: 501 BCE = −500. */
export const fromEra = (n: number, bce: boolean) => (bce ? 1 - n : n);

/** The annual index of an Enoch month and day in the year (the first, where a hold repeats a date), or −1. */
export function enochIndex(doc: YearDoc, month: number, day: number) {
  return annual(doc).findIndex((r) => r.month === month && r.day === day);
}

const secs = (hms: string) => { const [h, m, s] = hms.split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };
/** The instant in Enoch day i at a local clock time (hh:mm), counted on from its sunrise: a time before the sunrise's is the
 *  next morning's. The zone's own rules give the clock (summer time beginning or ending in the night included). */
export function clockToJd(doc: YearDoc, i: number, hhmm: string): number {
  const a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut, tz = doc.calculation.timezone, off = offsetOf(doc.rows[i].sunrise_local);
  const t = secs(hhmm), s0 = secs(timeOf(doc.rows[i].sunrise_local));
  let jd = a + ((((t - s0) % 86400) + 86400) % 86400) / 86400;
  const read = secs(localParts(jd, tz, off).time), d = ((((t - read) % 86400) + 86400 + 43200) % 86400) - 43200;   // the clock moved in the night
  jd += d / 86400;
  return Math.min(b - 1 / 86400, Math.max(a, jd));
}

/** The year's equinoxes or solstices (Julian days, UT) that fall inside it: the Sun's apparent longitude at 0° and 180°,
 *  or 90° and 270°. Searched from the year's first sunrise, so it works in any era the calculator covers. */
export function seasons(doc: YearDoc, kind: 'equinox' | 'solstice'): number[] {
  const a = doc.rows[0].sunrise_jd_ut, b = doc.rows[doc.rows.length - 1].sunrise_jd_ut, out: number[] = [];
  for (const lon of kind === 'equinox' ? [0, 180] : [90, 270]) for (let from = a; from < b;) {   // a month at a time: a longer search misses
    const t = SearchSunLongitude(lon, new AstroTime(from - J2000), Math.min(30, b - from));     // a crossing when the window spans the wrap at 360°
    if (!t) { from += 30; continue; }
    const jd = t.ut + J2000; if (jd < b) out.push(jd); from = jd + 300;
  }
  return out.sort((x, y) => x - y);
}
/** The next equinox (or solstice) of the year after the instant on show; past the last, the year's first. */
export function nextSeason(doc: YearDoc, jd: number, kind: 'equinox' | 'solstice'): number | null {
  const all = seasons(doc, kind);
  return all.find((x) => x > jd + 0.5) ?? all[0] ?? null;
}

/** An event's name in a list ("Sunrise", "Moon rises"). */
export const eventName = (e: DayEvent) => e.body === 'Sun' ? { rise: 'Sunrise', set: 'Sunset', noon: 'Midday', midnight: 'Midnight' }[e.kind] : `${e.body} ${e.kind === 'rise' ? 'rises' : 'sets'}`;
const inText = (e: DayEvent) => (e.body === 'Sun' ? eventName(e).toLowerCase() : eventName(e));
/** Where an instant stands among the day's events: "at sunset" (within a minute and a half), "2 h 33 min before midnight". */
export function amongEvents(events: DayEvent[], jd: number): string {
  const near = events.find((e) => Math.abs(e.jd - jd) * 1440 < 1.5);
  if (near) return `at ${inText(near)}`;
  const next = events.find((e) => e.jd > jd);
  if (!next) return '';
  const n = Math.round((next.jd - jd) * 1440);
  return `${n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`} before ${inText(next)}`;
}
