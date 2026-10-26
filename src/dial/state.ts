// The unified dial's state: everything it draws, from the calculator's year document and one
// instant. Calendar values come from the calculator; positions from Astronomy Engine on the
// sky frame (src/sky). No calendar arithmetic here beyond the equal-parts definition of the day.
import { Body, GeoVector, Illumination, ObserverVector, Vector } from 'astronomy-engine';
import { annual, dayIndexAt, partOfDay } from '../model';
import { skyFrame, starVector } from '../sky/astronomy';
import type { Star } from '../sky/catalogue';
import type { YearDoc } from '../types';

export type Framing = 'sun' | 'north' | 'compass';
export const PLANETS: [Body, string][] = [[Body.Mercury, 'Mercury'], [Body.Venus, 'Venus'], [Body.Mars, 'Mars'], [Body.Jupiter, 'Jupiter'],
  [Body.Saturn, 'Saturn'], [Body.Uranus, 'Uranus'], [Body.Neptune, 'Neptune']];
/** Each planet's colour, on the Dial and in Sky. */
export const PCOL: Record<string, string> = { Mercury: '#c4a98a', Venus: '#f6e6b0', Mars: '#c76b4a', Jupiter: '#e0b878', Saturn: '#d8b45e', Uranus: '#9cc7c9', Neptune: '#7c95c9' };
interface Body2 { name: string; az: number; alt: number; mag?: number; id?: string }
/** The default star set on the face: V ≤ 3.2 (the brightest 214). */
export const BRIGHT_MAG = 3.2;
const UNITS_PER_DAY = 86400;

/** Part / degree / minute / second of the Enoch day: 18 × 20 × 60 × 4 = 86,400 equal units, sunrise to sunrise. */
export function enochTime(part: number) {
  const units = Math.min(UNITS_PER_DAY - 1, Math.max(0, Math.floor((part / 18) * UNITS_PER_DAY)));   // 0 … 86,399 since sunrise
  const p = Math.floor(units / 4800), d = Math.floor((units % 4800) / 240), m = Math.floor((units % 240) / 4), s = units % 4;
  return { part: p + 1, deg: d + 1, min: m + 1, sec: s + 1, units, dayDeg: (part / 18) * 360 };
}

/** Topocentric direction of a solar-system body (observer origin subtracted, as for the Sun). */
export function bodyDirection(f: ReturnType<typeof skyFrame>, body: Body) {
  const g = GeoVector(body, f.time, false), o = ObserverVector(f.time, f.observer, false);
  return f.direction(new Vector(g.x - o.x, g.y - o.y, g.z - o.z, f.time));
}

export const wrap = (a: number) => ((a % 360) + 360) % 360;
/** Signed shortest turn from bearing a to bearing b, in (−180, 180]. */
export const dAz = (a: number, b: number) => ((b - a + 540) % 360) - 180;

/** The Sun's azimuth through one Enoch day (sunrise to next sunrise): speed and stationary points. */
export function dayState(doc: YearDoc, i: number, samples = 288) {
  const c = doc.calculation, a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut, minutes = ((b - a) * 1440) / samples;
  const trace: { t: number; az: number; alt: number; rate: number }[] = [];
  let prev = skyFrame(a, c.latitude, c.longitude_east, c.elevation_m).sun;
  for (let k = 1; k <= samples; k++) {
    const s = skyFrame(a + ((b - a) * k) / samples, c.latitude, c.longitude_east, c.elevation_m).sun;
    trace.push({ t: (k / samples) * 18, az: s.az, alt: s.alt, rate: dAz(prev.az, s.az) / minutes }); prev = s;
  }
  // a stationary point: the azimuth rate changes sign while the Sun is up (not the wrap through north)
  const reversals = trace.filter((p, k) => k > 0 && Math.sign(p.rate) !== Math.sign(trace[k - 1].rate) && p.alt > -1).map((p) => p.t);
  // the Sun's path at each whole part, for the face (spacing shows its speed)
  const path = Array.from({ length: 19 }, (_, k) => skyFrame(a + ((b - a) * k) / 18, c.latitude, c.longitude_east, c.elevation_m).sun);
  return { i, doc, trace, reversals, path };
}
export type DayState = ReturnType<typeof dayState>;

/**
 * Where the Sun, Moon, planets and stars are at `jd` (true azimuth/altitude): the part of a state
 * that varies with the sky. Every star passed is placed; the caller chooses them (by magnitude, plus
 * the constellation figures' endpoints when those are drawn), so nothing is filtered per frame.
 */
function skySnapshot(doc: YearDoc, jd: number, stars: Star[] = []) {
  const c = doc.calculation, f = skyFrame(jd, c.latitude, c.longitude_east, c.elevation_m);
  return {
    f, sun: f.sun, moon: bodyDirection(f, Body.Moon),
    planets: PLANETS.map(([body, name]) => ({ name, ...bodyDirection(f, body) })) as Body2[],
    bright: stars.map((s) => ({ name: s.name ?? '', id: s.id, mag: s.mag_v, ...f.direction(starVector(s, f.time)) })) as Body2[],
  };
}
type Snapshot = ReturnType<typeof skySnapshot>;
const mixAz = (a: number, b: number, k: number) => wrap(a + dAz(a, b) * k);
const mixDir = <T extends { az: number; alt: number }>(a: T, b: T, k: number): T => ({ ...a, az: mixAz(a.az, b.az, k), alt: a.alt + (b.alt - a.alt) * k });
/** Between two snapshots of the same hour on consecutive days: each body slides from where it is today to where it is tomorrow. */
const mixSky = (a: Snapshot, b: Snapshot, k: number) => ({ ...a, sun: mixDir(a.sun, b.sun, k), moon: mixDir(a.moon, b.moon, k),
  planets: a.planets.map((p, n) => mixDir(p, b.planets[n], k)), bright: a.bright.map((p, n) => mixDir(p, b.bright[n], k)) });

/** The same hour of the next Enoch day, with how far (0 ≤ frac < 1) the date has glided toward it: "play by days". */
export interface Ahead { doc: YearDoc; i: number; jd: number; frac: number }

export function dialState(doc: YearDoc, jd: number, stars: Star[] = [], framing: Framing = 'north', heading = 0, day?: DayState, ahead?: Ahead | null) {
  const c = doc.calculation, lat = c.latitude, lon = c.longitude_east, elev = c.elevation_m;
  const i = dayIndexAt(doc, jd);
  if (i < 0) throw new Error('instant outside the loaded Enoch year');
  const days = annual(doc), r = days[i], e = doc.extended[i], part = partOfDay(doc, i, jd);
  const d = day && day.doc === doc && day.i === i ? day : dayState(doc, i);
  const k = ahead && ahead.frac > 0 ? ahead.frac : 0;
  let snap = skySnapshot(doc, jd, stars), phases = ringPhases(doc, i, part);
  if (ahead && k > 0) { snap = mixSky(snap, skySnapshot(ahead.doc, ahead.jd, stars), k); phases = blendPhases(phases, ringPhases(ahead.doc, ahead.i, part), k); }
  const f = snap.f, sun = snap.sun, moon = snap.moon, planets = snap.planets, bright = snap.bright;
  const step = 30 / 86400, aheadSun = skyFrame(jd + step, lat, lon, elev).sun, behind = skyFrame(jd - step, lat, lon, elev).sun;
  const sunRate = dAz(behind.az, aheadSun.az);           // degrees per minute (a 60 s span)
  // Framing: the screen angle of a true bearing is bearing + F (clockwise from the top).
  const F = framing === 'sun' ? -sun.az : framing === 'compass' ? -heading : 0, needle = wrap(sun.az + F);
  return {
    jd, i, row: r, ext: e, part, phases, time: enochTime(part), sun: { ...sun, rate: sunRate }, moon: { ...moon, fraction: Illumination(Body.Moon, f.time).phase_fraction },
    planets, bright, trace: d.trace, reversals: d.reversals, path: d.path, day: d, F, needle, framing, heading, dayParts: e.day_parts, textParts: e.text_day_parts,
    positionDeg: Math.floor((r.corrected_doy * 360) / 364),
  };
}
export type DialState = ReturnType<typeof dialState>;

/**
 * Rotation that puts value `cur` (in ring units, 0-based) of an n-unit ring on the needle.
 * `dir` = +1 when the ring is numbered clockwise, −1 anticlockwise. Rings pass their continuous
 * value from `ringPhases` (the needle reads it exactly, e.g. 3.4 days into the week).
 */
export const ringRotation = (needle: number, cur: number, n: number, dir: 1 | -1) => needle - (dir * cur * 360) / n;

/**
 * The gear train. Every day-based ring's value is a fixed ratio of one clock — the Enoch day
 * number plus the fraction of the day since sunrise (`part / 18`) — in ring units, 0-based, and
 * continuous: at the next sunrise a ring has exactly reached the value the next day starts from.
 * No ring keeps state; each is a pure function of the instant, so nothing can drift.
 *   weekday     7 units, +1 a day (not drawn as a ring: the seven day cells inside each course)
 *   courses     24 units, +1 a week (the unbroken weekly rotation: a course is 7 days long)
 *   correction  294 units, +1 a day (the hold is the first day of each cycle, an ordinary day)
 *   uncorrected 364 units, +1 a day
 *   position    364 units, +1 a position; a held position is two elapsed days long, so it is
 *               crossed at half speed over both (never stopped, never jumped)
 */
export function ringPhases(doc: YearDoc, i: number, part: number) {
  const f = part / 18, r = doc.rows[i], e = doc.extended[i];
  const second = e.hold, first = !second && !!doc.extended[i + 1]?.hold, span = first || second ? 2 : 1;
  const wk = e.weekday - 1 + f;                                  // days into the Sunday-to-Sabbath week
  return {
    uncorrected: e.uncorrected_doy - 1 + f,
    position: r.corrected_doy - 1 + ((second ? 1 : 0) + f) / span,
    correction: e.correction_day - 1 + f,
    courses: e.course - 1 + wk / 7,
    weekday: wk,
    parts: part,
  };
}
export type RingPhases = ReturnType<typeof ringPhases>;
const PHASE_UNITS: Record<keyof RingPhases, number> = { uncorrected: 364, position: 364, correction: 294, courses: 24, weekday: 7, parts: 18 };
/**
 * Glide from today's phases to tomorrow's at the same hour: each ring advances `frac` of its own
 * gain for the day (1 weekday, 1/7 course, 1 position or 1/2 on a held one…; the parts ring, being
 * at the same hour, holds still). The gain is the short way round the ring, so a wrap is no jump.
 */
export function blendPhases(a: RingPhases, b: RingPhases, frac: number): RingPhases {
  const out = { ...a };
  for (const key of Object.keys(PHASE_UNITS) as (keyof RingPhases)[]) {
    const n = PHASE_UNITS[key], gain = mod(b[key] - a[key] + n / 2, n) - n / 2;
    out[key] = a[key] + gain * frac;
  }
  return out;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** What the observer faces (bearing `heading`): every body within `width`° either side, nearest first. */
export function facing(s: DialState, heading: number, width = 12) {
  // the Sun, Moon and planets even below the horizon (marked by their altitude); named stars only when up
  const all: (Body2 & { kind: string })[] = [{ name: 'Sun', kind: 'sun', ...s.sun }, { name: 'Moon', kind: 'moon', ...s.moon },
    ...s.planets.map((p) => ({ ...p, kind: 'planet' })), ...s.bright.filter((b) => b.name && b.alt > 0).map((b) => ({ ...b, kind: 'star' }))];
  return all.map((b) => ({ ...b, off: dAz(heading, b.az) })).filter((b) => Math.abs(b.off) <= width)
    .sort((a, b) => (a.kind === 'star' ? 1 : 0) - (b.kind === 'star' ? 1 : 0) || Math.abs(a.off) - Math.abs(b.off));
}

/** Instant at fractional part `part` (0 ≤ part < 18) of row i's Enoch day (equal parts). */
export const jdAtPart = (doc: YearDoc, i: number, part: number) => {
  const a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut;
  return a + ((b - a) * part) / 18;
};
