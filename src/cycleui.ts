// The 294-day correction and the 294-year cycle, as reported by the calculator
// (from the year document). Lookups only; no calendar arithmetic here.
import { civil, yearLabel, yearOf } from './dates';
import { annual } from './model';
import { C } from './stage';
import type { Cycle, Hold, YearDoc } from './types';

export function toRoman(n: number) {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
}

/** The cycle (by ordinal) and the holds on either side of a daycount. */
export function holdsAround(doc: YearDoc, daycount: number) {
  const all = doc.cycle.cycles.flatMap((c) => c.holds), last = doc.cycle.cycles[doc.cycle.cycles.length - 1];
  const prev = [...all].reverse().find((h) => h.daycount <= daycount) ?? null;
  const next: Pick<Hold, 'daycount' | 'civil_date'> & Partial<Hold> = all.find((h) => h.daycount > daycount) ?? last.next_cycle_first_hold;
  return { prev, next };
}
export const cycleOf = (doc: YearDoc, ordinal: number): Cycle | undefined => doc.cycle.cycles.find((c) => c.ordinal === ordinal);

export function correctionSection(doc: YearDoc, i: number) {
  const r = annual(doc)[i], e = doc.extended[i], c = cycleOf(doc, e.cycle), { prev, next } = holdsAround(doc, r.daycount);
  const days = next.daycount - r.daycount;
  return `<div class="section"><div class="eyebrow">Correction · 294-day rule</div>
   <dl class="read"><dt>Since epoch</dt><dd class="cal" data-k="corrections">${e.corrections_since_epoch.toLocaleString('en-US')} corrections</dd>
   <dt>Cycle</dt><dd class="cal" data-k="cycle">${toRoman(e.cycle)} (${e.cycle})${c ? ` · ${yearLabel(yearOf(c.start_date))}–${yearLabel(yearOf(c.end_date))}` : ''}</dd>
   <dt>Year of cycle</dt><dd class="cal" data-k="cycle-year">${e.cycle_year} of ${c?.years ?? 293}</dd>
   <dt>In 364-day units</dt><dd class="der" data-k="cycle-year-364">${e.cycle_year_364} of 294 (the paper's count)</dd>
   ${prev ? `<dt>Last hold</dt><dd>${civil(prev.civil_date)}${prev.position ? ` · position ${prev.position}` : ''}${prev.n ? ` · ${prev.n} of 364` : ''}</dd>` : ''}
   <dt>Next hold</dt><dd data-k="next-hold">${civil(next.civil_date)}${next.position ? ` · position ${next.position}` : ''} · ${days === 0 ? 'today' : `in ${days} days`}</dd></dl>
   <p class="note">A correction holds a calendar position for a second day every 294 elapsed days. A cycle of 294 × 364 = 107,016 days holds each of the 364 positions once and contains 293 corrected years, which is why the paper's "year of 294" and the calendar's "year of 293" differ.</p></div>`;
}

/** Transport strip: the current 294-year cycle, its 364 holds, this year and this morning. */
export function cycleStrip(svg: SVGSVGElement, doc: YearDoc, i: number) {
  const NS = 'http://www.w3.org/2000/svg', e = doc.extended[i], c = cycleOf(doc, e.cycle) ?? doc.cycle.cycles[0];
  const el = (tag: string, a: Record<string, string | number>, t?: string) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, String(v)); if (t) n.textContent = t; svg.appendChild(n); return n; };
  const span = c.end_daycount - c.start_daycount, x = (d: number) => 10 + ((d - c.start_daycount) / span) * 980;
  svg.innerHTML = '';
  el('line', { x1: 10, x2: 990, y1: 6, y2: 6, stroke: C.goldDim, 'stroke-width': 0.6, 'vector-effect': 'non-scaling-stroke' });
  let ticks = '';
  for (const h of c.holds) ticks += `M${x(h.daycount).toFixed(2)} 3V9`;
  el('path', { d: ticks, stroke: C.gold, 'stroke-width': 0.5, opacity: 0.55, 'vector-effect': 'non-scaling-stroke' });
  const days = annual(doc), a = x(Math.max(c.start_daycount, days[0].daycount)), b = x(Math.min(c.end_daycount, days[days.length - 1].daycount));
  el('rect', { x: a, y: 2, width: Math.max(1, b - a), height: 8, fill: 'rgba(214,178,106,.28)' });
  const now = x(days[i].daycount);
  el('line', { x1: now, x2: now, y1: 0, y2: 12, stroke: C.goldHi, 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' });
  el('text', { x: 10, y: 21, 'font-family': 'Plex Mono', 'font-size': 8.5, fill: C.ivory3 }, `CYCLE ${toRoman(c.ordinal)} · ${civil(c.start_date)}`);
  el('text', { x: 990, y: 21, 'text-anchor': 'end', 'font-family': 'Plex Mono', 'font-size': 8.5, fill: C.ivory3 }, `${civil(c.end_date)} · 364 HOLDS · 293 YEARS`);
  el('text', { x: Math.min(940, Math.max(60, now)), y: 21, 'text-anchor': 'middle', 'font-family': 'Plex Mono', 'font-size': 8.5, fill: C.gold }, `YEAR ${e.cycle_year} / ${c.years}`);
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** The serving priestly course: Sunday-to-Sabbath weeks, Qumran order from Gamul. */
export function courseSection(doc: YearDoc, i: number) {
  const e = doc.extended[i], C24 = doc.priests.courses, next = C24[e.course % 24];
  return `<div class="section"><div class="eyebrow">Priestly course · 1 Chronicles 24</div>
   <div class="big" style="font-size:32px" data-k="course">${e.course_name}</div>
   <div class="sub">${ordinal(e.course)} of 24 in the Qumran order · ${ordinal(e.course_chronicles)} in 1 Chronicles 24${e.course_kjv ? ` (KJV ${e.course_kjv})` : ''}</div>
   <dl class="read"><dt>Week</dt><dd data-k="course-week">Sun ${civil(e.course_week_start)} – Sabbath ${civil(e.course_week_end)}</dd>
   <dt>Six-year cycle</dt><dd class="cal" data-k="six-year">${e.six_year_cycle} of 49 · year ${e.six_year_year} of 6 · week ${e.six_year_week} of 312</dd>
   <dt>Rotation</dt><dd class="cal">${e.course_rotation} of 637 in cycle ${toRoman(e.course_cycle)}</dd>
   <dt>Next</dt><dd>${next.name}</dd></dl>
   <p class="note">The 24 courses serve a week each, Sunday to the Sabbath, unbroken. A 294-year cycle is exactly 637 rotations, and 49 six-year cycles of 312 weeks: Gamul opens every one, and Day 1 (a Wednesday) falls in the middle of his first week.</p></div>`;
}
