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

/** Where adjacent portals' passages disagree: [northern common edge of the southern portal's neighbour, ...]. */
export function pillars(portals: Portal[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < portals.length - 1; i++) out.push([portals[i + 1].common[1], portals[i].common[0]]);
  return out;
}

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
