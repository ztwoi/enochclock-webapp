// Pure mappings shared by every view. No astronomy: inputs are calculator values.
import { offsetOf, timeOf } from './dates';
import type { Portal, Row, YearDoc } from './types';

export const GEEZ = ['', '፩', '፪', '፫', '፬', '፭', '፮', '፯', '፰', '፱', '፲', '፲፩', '፲፪'];
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Unix milliseconds → Julian day (UT). */
export const jdFromMs = (ms: number) => ms / 86400000 + 2440587.5;

/** The selectable mornings of a year: every elapsed sunrise, without the closing boundary. */
export const annual = (doc: YearDoc) => doc.rows.filter((r) => !r.closing_boundary);

/** Index of the Enoch day containing instant jd (its sunrise ≤ jd < next sunrise), or -1 outside the year. */
export function dayIndexAt(doc: YearDoc, jd: number): number {
  const rows = doc.rows;
  if (jd < rows[0].sunrise_jd_ut || jd >= rows[rows.length - 1].sunrise_jd_ut) return -1;
  let lo = 0, hi = rows.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rows[mid].sunrise_jd_ut <= jd) lo = mid; else hi = mid; }
  return lo;
}

/** Part of the day in equal parts (equal parts): 18·(jd − sunrise)/(next sunrise − sunrise). */
export function partOfDay(doc: YearDoc, i: number, jd: number): number {
  const a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut;
  return (doc.text.parts_per_day * (jd - a)) / (b - a);
}

/** The stage's design space (1480 × 908 units, y down), shared by the WebGL scene and the label overlay. */
export const W = 1480, H = 908;

/**
 * The altitude, in degrees, to which a portal's arch and its seam pillars stand on the horizon. One value for every view, so a portal is the same height
 * in the Sky and on the Dial: the Sky draws it 44 units tall at its scale of 1360/180 units a degree.
 */
export const PORTAL_ALT = 44 / ((1420 - 60) / 180);

/**
 * The seams: where adjacent portals' months both reach, as [low, high] azimuths between one portal's arch and the next's (see `arches`), in azimuth order.
 * The east's portals are numbered with falling azimuth and the west's with rising, so the neighbours are taken by azimuth, not by number.
 */
export function pillars(portals: Portal[]): [number, number][] {
  const byAz = [...portals].sort((a, b) => a.union[0] - b.union[0]), S = arches(portals), out: [number, number][] = [];
  for (let i = 0; i < byAz.length - 1; i++) { const lo = S.get(byAz[i].portal)![1], hi = S.get(byAz[i + 1].portal)![0]; if (hi > lo) out.push([lo, hi]); }
  return out;
}

/**
 * Each portal's arch, as drawn on the horizon (Sky, the Dial): the azimuths its own months reach (the union of its two passes, 1 Enoch 72), less where
 * a neighbouring portal's months reach too. That shared stretch is the seam between them, and there the month decides which portal the Sun is in: the
 * portals are aligned by month (litPortals). The engine's `common` (what a portal's two passes share) is the same span except where a pass ends at the
 * next year's Day 1, not this year's: month 12 does, so `common` would put this year's Day 1 sunrise, the first morning of the fourth portal, on the
 * third portal's arch. By portal number.
 */
export function arches(portals: Portal[]): Map<number, [number, number]> {
  let out = archCache.get(portals);
  if (out) return out;
  const byAz = [...portals].sort((a, b) => a.union[0] - b.union[0]);
  out = new Map(byAz.map((p, i) => [p.portal, [i > 0 ? Math.max(p.union[0], byAz[i - 1].union[1]) : p.union[0], i < byAz.length - 1 ? Math.min(p.union[1], byAz[i + 1].union[0]) : p.union[1]] as [number, number]]));
  archCache.set(portals, out);
  return out;
}
const archCache = new WeakMap<Portal[], Map<number, [number, number]>>();
/** One portal's arch (see `arches`). */
export const archOf = (portals: Portal[], portal: number): [number, number] => arches(portals).get(portal)!;

/** Cursor (fractional elapsed index) → the shown morning and the interpolation fraction toward the next. */
export function cursorRow(days: Row[], cursor: number) {
  const c = Math.max(0, Math.min(days.length - 1, cursor));
  const i = Math.floor(c);
  return { i, f: i < days.length - 1 ? c - i : 0 };
}

export const fmt = {
  deg: (v: number, n = 4) => `${v.toFixed(n)}°`,
  jd: (v: number) => v.toFixed(9),
  signed: (v: number, n = 3) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(n)}`,
  hms: (h: number) => {
    const s = Math.round(h * 3600);
    return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
  },
  time: timeOf,
  offset: offsetOf,
  pad: (n: number, w = 2) => String(n).padStart(w, '0'),
};
