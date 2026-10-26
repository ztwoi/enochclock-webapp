// Deep Time as a plot: the pure parts. A visible range of years [a, b] maps onto the plot's fixed
// rectangle; the envelope's bin width follows the range (about 300 bins across, aligned to multiples
// of the width, as the data's bins are), down to a single year; every bin is the exact min / mean /
// max of the annual starts it holds.

/** Every annual start: year `first + i` has offsets enoch[i] and greg[i] (days, Day 1 − equinox). */
export interface DeepSeries { first_year: number; last_year: number; precision_days: number; enoch: number[]; greg: number[] }
export type Key = 'enoch' | 'greg';
export interface Bin { year: number; n: number; enoch: [number, number, number]; greg: [number, number, number] }

/** The whole axis (the design's frame), and the narrowest range a zoom reaches. */
export const AXIS = { A: -13000, B: 17000, MIN_SPAN: 20 };

/** Bin widths, in years: 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000. */
const WIDTHS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
/** The envelope's bin width for a visible span: the narrowest giving at most ~300 bins (all 30,000 years: 100, the design's). */
export const binWidth = (span: number) => WIDTHS.find((w) => span / w <= 301) ?? 1000;

/** Exact min / mean / max of both series per `width` years over [a, b] (bins aligned to multiples of width). */
export function binsIn(s: DeepSeries, a: number, b: number, width: number): Bin[] {
  const out: Bin[] = [];
  const lo = Math.max(s.first_year, Math.floor(a / width) * width), hi = Math.min(s.last_year, Math.ceil(b));
  for (let y0 = Math.floor(lo / width) * width; y0 <= hi; y0 += width) {
    const i0 = Math.max(0, y0 - s.first_year), i1 = Math.min(s.enoch.length, y0 + width - s.first_year);
    if (i1 <= i0) continue;
    const st = (v: number[]) => { let mn = Infinity, mx = -Infinity, sum = 0; for (let i = i0; i < i1; i++) { const x = v[i]; if (x < mn) mn = x; if (x > mx) mx = x; sum += x; } return [mn, sum / (i1 - i0), mx] as [number, number, number]; };
    out.push({ year: y0, n: i1 - i0, enoch: st(s.enoch), greg: st(s.greg) });
  }
  return out;
}

/** A round step (1, 2 or 5 × 10ⁿ years, at least 1) giving about `n` intervals over `span`. */
export function niceStep(span: number, n: number) {
  const want = span / n, p = 10 ** Math.floor(Math.log10(want));
  return Math.max(1, [1, 2, 5, 10].map((k) => k * p).find((v) => v >= want * 0.999) ?? 10 * p);
}
/** Labelled years (about `n` across: every 5,000 for all 30,000 years in the design) and the faint lines between (a fifth of that). */
export function yearTicks(a: number, b: number, n = 6) {
  const major = niceStep(b - a, n), minor = Math.max(1, major / 5), at = (s: number) => { const o: number[] = []; for (let y = Math.ceil(a / s) * s; y <= b; y += s) o.push(y); return o; };
  return { major: at(major), minor: at(minor).filter((y) => y % major !== 0), step: major };
}
/** A year as the axis writes it: astronomical numbering; a sign on positive years only while negative years are in view. */
export const yearText = (y: number, signed: boolean) => (y === 0 ? '0' : y < 0 ? `−${-y}` : signed ? `+${y}` : String(y));

/** [a, b] zoomed by k (> 1 nearer) about `at`, which keeps its place on screen; the span held within
 *  [minSpan, hi − lo] and the range within [lo, hi]. */
function zoomSpan(a: number, b: number, k: number, at: number, lo: number, hi: number, minSpan: number): [number, number] {
  const s = Math.max(minSpan, Math.min(hi - lo, (b - a) / k)), t = (at - a) / (b - a);
  return clampSpan(at - t * s, at - t * s + s, lo, hi, minSpan);
}
/** [a, b] moved (not resized) to lie within [lo, hi]. */
function clampSpan(a: number, b: number, lo: number, hi: number, minSpan: number): [number, number] {
  const s = Math.max(minSpan, Math.min(hi - lo, b - a)), a2 = Math.max(lo, Math.min(hi - s, a));
  return s >= hi - lo ? [lo, hi] : [a2, Math.min(hi, a2 + s)];          // the whole range exactly, not lo + (hi − lo)
}
/** The time axis: zoom about a year, and keep a range on the axis. */
export const zoomRange = (a: number, b: number, k: number, at: number) => zoomSpan(a, b, k, at, AXIS.A, AXIS.B, AXIS.MIN_SPAN);
export const clampRange = (a: number, b: number) => clampSpan(a, b, AXIS.A, AXIS.B, AXIS.MIN_SPAN);

/** The day scale (Day 1 − equinox): the design's −6.2 … +9.4 days at home, down to about an hour. */
export const DAYS = { A: -6.2, B: 9.4, MIN_SPAN: 0.04 };
export const zoomDays = (a: number, b: number, k: number, at: number) => zoomSpan(a, b, k, at, DAYS.A, DAYS.B, DAYS.MIN_SPAN);
export const clampDays = (a: number, b: number) => clampSpan(a, b, DAYS.A, DAYS.B, DAYS.MIN_SPAN);

/** Day steps: labelled about every sixth of the scale (every 3 days at home), with lines between (every day at home). */
const DAY_STEPS: [number, number][] = [[0.005, 0.001], [0.01, 0.002], [0.02, 0.005], [0.05, 0.01], [0.1, 0.02], [0.2, 0.05], [0.5, 0.1], [1, 0.2], [3, 1]];
export function dayTicks(a: number, b: number) {
  const [step, minor] = DAY_STEPS.find(([s]) => s >= (b - a) / 6) ?? DAY_STEPS[DAY_STEPS.length - 1];
  const at = (s: number) => { const o: number[] = []; for (let k = Math.ceil(a / s - 1e-9); k * s <= b + 1e-9; k++) o.push(Math.round(k * s * 1e6) / 1e6 + 0); return o; };
  return { step, major: at(step), lines: at(minor), decimals: step >= 1 ? 0 : Math.ceil(-Math.log10(step) - 1e-9) };
}
/** A day value as the scale writes it: "+3 d", "0 d", "−0.25 d". */
export const dayText = (v: number, decimals: number) => (Math.abs(v) < 1e-9 ? '0 d' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(decimals)} d`);

/** A polyline cut to x0 ≤ x ≤ x1 (points in increasing x), ends interpolated onto the edges. */
export function clipX(pts: [number, number][], x0: number, x1: number): [number, number][] {
  const out: [number, number][] = [], at = (p: [number, number], q: [number, number], x: number): [number, number] => [x, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0])];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    if (p[0] >= x0 && p[0] <= x1) out.push(p);
    if (!q) break;
    if (p[0] < x0 && q[0] > x0) out.push(at(p, q, x0));
    if (p[0] < x1 && q[0] > x1) out.push(at(p, q, x1));
  }
  return out;
}
