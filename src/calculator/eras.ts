// Which Swiss Ephemeris files a calculation reads, so a device downloads only its era (two files, ~1.8 MB) instead of all 102.
// Each file covers a 600-year block from 1 January of a multiple of 600 (Gregorian from 1600, Julian before; "m" marks blocks
// before year 0). sepl_* holds the planets (and the Earth, so the Sun), semo_* the Moon; every calculation reads both.
// Swiss does not switch files exactly on the line: every switch lies within 0.01 day
// of it except the precise 1800-2400 pair (Moon from 8.9 days before 1800; both until 10-15 days after 2400). The margins
// below cover that, the rise searches' reach and ΔT (TT runs up to ~8.5 days ahead of UT at the range's ends), so a span near
// a boundary simply asks for both blocks. tests/calculator-eras.test.ts checks every measured switch; should a file still be
// missing, the worker reads its name from Swiss's refusal, adds it and recalculates.
import {jdnToCivil, JDN_OFFSET, selectYear, type YearSelector} from './engine/calendar';
import type {Request} from './protocol';
const GREGORIAN_FROM = 2305447.5;
/** Days before a span's first UT instant: an older file serves on up to 15 days past its line, and rise searches start a day early. */
const BEFORE = 20;
/** Days after its last: a newer file takes over up to 9 days before its line, rise searches look 5 days on, and ΔT adds up to ~8.5. */
const AFTER = 35;

/** First year of the 600-year block holding a TT Julian date. */
export function blockStart(jdTt: number): number {
  const [year] = jdnToCivil(Math.floor(jdTt + .5), jdTt >= GREGORIAN_FROM ? 'gregorian' : 'julian');
  return Math.floor(year / 600) * 600;
}
const tag = (start: number) => (start < 0 ? 'm' : '_') + String(Math.abs(start) / 100).padStart(2, '0');
/** The planet and Moon files for every block a UT span [from, to] can touch. */
export function filesForSpan(from: number, to: number): string[] {
  const out: string[] = [];
  for (let s = blockStart(from - BEFORE); s <= blockStart(to + AFTER); s += 600) out.push(`sepl${tag(s)}.se1`, `semo${tag(s)}.se1`);
  return out;
}
/** The UT span a request reads: a year's sunrise days, or the days around an instant. */
function spanOf(request: Request): [number, number] {
  if (request.kind === 'instant') return [request.jd - 4, request.jd + 5];
  const {bounds} = selectYear(request.selector as YearSelector);
  return [bounds[0] - JDN_OFFSET - 1, bounds[12] - JDN_OFFSET + 1];
}
export const filesFor = (request: Request) => filesForSpan(...spanOf(request));
/** The file a strict-Swiss error says is missing, if it names one. */
export const missingFile = (message: string) => /\b(se(?:pl|mo)[m_]\d{2,3}\.se1)\b/.exec(message)?.[1];
