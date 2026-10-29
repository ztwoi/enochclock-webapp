// The day bar: sunrise to sunrise, daylight gold, a tick per part (longer every six), risings above the line and settings
// below, a playhead; a hand on it gives the part of the day under it. Drawn by The Day (src/day/view.ts) and Atlas's When.
import type { YearDoc } from '../types';
import { SUN_COLOR, type DayEvent } from './events';

export interface DayBar {
  /** Draw day i of the year with its events; `hm` gives an instant's local clock time ("05:52"). */
  build(doc: YearDoc, i: number, events: DayEvent[], hm: (jd: number) => string): void;
  /** Move the playhead to a part of the day (0 at sunrise, 18 at the next). */
  place(part: number): void;
}

/** `width`: the bar's width when the SVG has none yet (laid out later). `onScrub`: a hand on the bar (none: it takes no hand). */
export function createDayBar(svg: SVGSVGElement, opts: { width?: () => number; onScrub?(part: number): void } = {}): DayBar {
  let barX = (p: number) => p, head: Element | null = null, lastPart = 0;
  const place = (part: number) => { lastPart = part; head?.setAttribute('transform', `translate(${barX(Math.min(18, part)).toFixed(2)} 0)`); };
  if (opts.onScrub) {
    svg.classList.add('scrub');
    const partAt = (x: number) => { const r = svg.getBoundingClientRect(), w = r.width, px = ((x - r.left) / w) * (svg.clientWidth || w); return Math.max(0, Math.min(18 - 1e-6, ((px - 4) / ((svg.clientWidth || w) - 8)) * 18)); };
    svg.addEventListener('pointerdown', (e) => { e.stopPropagation(); svg.setPointerCapture(e.pointerId); opts.onScrub!(partAt(e.clientX)); });
    svg.addEventListener('pointermove', (e) => { if (svg.hasPointerCapture(e.pointerId)) opts.onScrub!(partAt(e.clientX)); });
  }
  return {
    build(doc, i, events, hm) {
      const w = svg.clientWidth || opts.width?.() || 300, X = (barX = (p: number) => 4 + (p / 18) * (w - 8)), Y = 16, e = doc.extended[i], dp = e.day_parts;
      const marks = events.filter((v) => v.body !== 'Sun').map((v) => v.kind === 'rise'
        ? `<circle cx="${X(v.part)}" cy="${Y - 7}" r="2.3" fill="${v.color}"/>`
        : `<circle cx="${X(v.part)}" cy="${Y + 7}" r="2" fill="none" stroke="${v.color}" stroke-width="1"/>`).join('');
      const ticks = Array.from({ length: 19 }, (_, p) => `<line x1="${X(p)}" x2="${X(p)}" y1="${Y - (p % 6 ? 2 : 4)}" y2="${Y + (p % 6 ? 2 : 4)}" stroke="#635d51" stroke-width="0.8"/>`).join('');
      svg.innerHTML = `<rect x="0" y="0" width="${w}" height="40" fill="transparent"/>
        <line x1="${X(0)}" x2="${X(18)}" y1="${Y}" y2="${Y}" stroke="#4b6268" stroke-width="1.5"/>
        <line x1="${X(0)}" x2="${X(dp)}" y1="${Y}" y2="${Y}" stroke="#d6b26a" stroke-width="2.5"/>
        ${ticks}${marks}
        <text x="${X(0)}" y="${Y + 20}">SUNRISE ${hm(doc.rows[i].sunrise_jd_ut)}</text>
        <text x="${X(dp)}" y="${Y + 20}" text-anchor="middle">SUNSET ${hm(e.sunset_jd_ut)}</text>
        <text x="${X(18)}" y="${Y + 20}" text-anchor="end">SUNRISE ${hm(doc.rows[i + 1].sunrise_jd_ut)}</text>
        <g class="dv-head"><line y1="${Y - 9}" y2="${Y + 9}" stroke="${SUN_COLOR}" stroke-width="1.6"/><path d="M-4 ${Y - 13}h8l-4 4z" fill="${SUN_COLOR}"/></g>`;
      head = svg.querySelector('.dv-head');
      place(lastPart);
    },
    place,
  };
}
