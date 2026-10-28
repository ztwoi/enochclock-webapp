// What happens in one Enoch day, sunrise to sunrise, for the Studio's captions and day bar: the Sun's rising and setting (the
// calculator's), its highest and lowest (solar noon and midnight), and every rising and setting of the planets and the Moon
// (Astronomy Engine, the same positions the Sky draws). Pure: no page, so the tests run it.
import { AstroTime, Body, Observer, SearchHourAngle, SearchRiseSet } from 'astronomy-engine';
import { PCOL, PLANETS } from '../dial/state';
import type { YearDoc } from '../types';

export type EventKind = 'rise' | 'set' | 'noon' | 'midnight';
export interface DayEvent { jd: number; part: number; body: string; kind: EventKind; color: string }

export const SUN_COLOR = '#f4dc9f', MOON_COLOR = '#d8d2c4';
const J2000 = 2451545;
const timeOf = (jd: number) => new AstroTime(jd - J2000);

/** Day i's events in time order: each with its part of the day (0 at sunrise, 18 at the next). */
export function dayEvents(doc: YearDoc, i: number): DayEvent[] {
  const c = doc.calculation, a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut;
  const obs = new Observer(c.latitude, c.longitude_east, c.elevation_m), out: DayEvent[] = [];
  const add = (jd: number, body: string, kind: EventKind, color: string) => { if (jd >= a && jd < b) out.push({ jd, part: (18 * (jd - a)) / (b - a), body, kind, color }); };
  add(a, 'Sun', 'rise', SUN_COLOR);
  add(doc.extended[i].sunset_jd_ut, 'Sun', 'set', SUN_COLOR);
  add(SearchHourAngle(Body.Sun, obs, 0, timeOf(a)).time.ut + J2000, 'Sun', 'noon', SUN_COLOR);
  add(SearchHourAngle(Body.Sun, obs, 12, timeOf(a)).time.ut + J2000, 'Sun', 'midnight', SUN_COLOR);
  const bodies: [Body, string, string][] = [...PLANETS.map(([body, name]): [Body, string, string] => [body, name, PCOL[name]]), [Body.Moon, 'Moon', MOON_COLOR]];
  for (const [body, name, color] of bodies) for (const dir of [1, -1]) {
    // a body can rise (or set) twice in a day when its first one falls just after sunrise: keep searching to the day's end
    for (let from = a; from < b;) {
      const t = SearchRiseSet(body, obs, dir, timeOf(from), b - from);
      if (!t) break;
      const jd = t.ut + J2000; add(jd, name, dir > 0 ? 'rise' : 'set', color); from = jd + 1 / 1440;
    }
  }
  return out.sort((x, y) => x.jd - y.jd);
}

/** The planets rising within `minutes` of a sunrise, nearest first, with their offset in minutes (negative: before the Sun).
 *  One that rises before the Sun does so at the end of the day, before the next sunrise: it is measured from that one. */
export function risingWithSun(doc: YearDoc, i: number, events: DayEvent[], minutes = 120): (DayEvent & { offset: number })[] {
  const a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut;
  return events.filter((e) => e.kind === 'rise' && e.body !== 'Sun' && e.body !== 'Moon')
    .map((e) => ({ ...e, offset: (e.jd - a < b - e.jd ? e.jd - a : e.jd - b) * 1440 }))
    .filter((e) => Math.abs(e.offset) <= minutes)
    .sort((x, y) => Math.abs(x.offset) - Math.abs(y.offset));
}
