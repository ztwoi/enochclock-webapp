// The Day: the app's Sky and its Dial at one instant, joined by a gold thread through the Sun, with the day's events as captions
// and a day bar. On a tall screen the sky is over the dial, framed Sun-up, so the thread falls straight down; on a wide one the
// dial is beside the sky, framed with the Sun at its left, facing it. The Sky follows the Sun (until a hand takes it) and opens
// out as the Sun climbs or sinks, so the horizon and the Sun are always both in view.
// One drawing for the app's view (#day, src/main.ts) and the Studio's recording frame (studio.html): what is watched is what is
// recorded.
import './day.css';
import { localDateTime, offsetOf } from '../dates';
import { createDial, type SkyLayers } from '../dial/render';
import { BRIGHT_MAG, dayState, dialState, type DayState } from '../dial/state';
import type { SkyPrefs } from '../dial/view';
import { dayIndexAt } from '../model';
import { skyFrame } from '../sky/astronomy';
import { createSky, type Catalogue } from '../skyview';
import type { YearDoc } from '../types';
import { createDayBar } from './bar';
import { dayEvents, risingWithSun, type DayEvent } from './events';
import { createFollow } from './follow';
import type { Box, Geometry } from './geometry';

export { geometryFor, type Box, type Geometry } from './geometry';

export interface DayViewOptions {
  geometry(w: number, h: number): Geometry;
  /** Stars in the Sky (the app's star limit); the face's stars are the Dial tab's (setDialSky). */
  mag?: number;
  /** How long an event's caption stays, in parts of the day after it (fading in over its first tenth, out over its last quarter). */
  captionParts?: number;
  /** A hand on the day bar: the part of the day under it (the bar takes no hand without this). */
  onScrub?(part: number): void;
  /** Following the Sun stopped (a hand took the sky) or started. */
  onFollow?(on: boolean): void;
}
export type DayView = ReturnType<typeof createDayView>;

const MAX_CAPTIONS = 3;

export function createDayView(host: HTMLElement, doc: YearDoc, cat: Catalogue, opts: DayViewOptions) {
  const root = document.createElement('div'); root.className = 'dv-root';
  root.innerHTML = `<div class="dv-sky"></div>
    <svg class="dv-dial" viewBox="-500 -500 1000 1000" role="img" aria-label="The Dial, turned with the Sun toward the sky"></svg>
    <svg class="dv-thread" aria-hidden="true"><path class="dv-glow"/><path class="dv-line"/></svg>
    <div class="dv-foot"><div class="dv-caps" aria-live="off"></div><svg class="dv-bar" aria-hidden="true"></svg></div>`;
  host.append(root);
  const q = <T extends Element>(s: string) => root.querySelector(s) as unknown as T;
  const skyEl = q<HTMLElement>('.dv-sky'), dialSvg = q<SVGSVGElement>('.dv-dial'), threadSvg = q<SVGSVGElement>('.dv-thread'), foot = q<HTMLElement>('.dv-foot');
  const caps = q<HTMLElement>('.dv-caps'), barSvg = q<SVGSVGElement>('.dv-bar');
  /** The boxes from the geometry. Placed before the Sky is made: a sky made in a box with no size starts from a camera that sees
   *  its placeholder lines, and a line drawn once never draws more segments than it had then (its path would stay one segment). */
  let g = opts.geometry(host.clientWidth, host.clientHeight);
  function place() {
    g = opts.geometry(host.clientWidth, host.clientHeight);
    root.classList.toggle('side', g.side);
    const put = (el: HTMLElement | SVGElement, b: Box) => Object.assign((el as HTMLElement).style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    put(skyEl, g.sky); put(foot, g.foot);
    put(dialSvg, { x: g.dial.cx - g.dial.d / 2, y: g.dial.cy - g.dial.d / 2, w: g.dial.d, h: g.dial.d });
  }
  place();

  const sky = createSky(skyEl, doc, cat, () => undefined);
  sky.setMagLimit(opts.mag ?? 6.5);
  sky.setLayers({ daylight: false, below: true, figures: true, planets: true, portalStars: true, refraction: true, bearing: false });
  sky.setPaths(true);
  const follow = createFollow(sky, { kind: 'sun' }, () => opts.onFollow?.(false));   // a zoom while it follows is its own (src/day/follow.ts)
  // the face's sky as the Dial tab has it (its star limit, figures and centre: setDialSky); until told, the Dial's defaults
  const dial = createDial(dialSvg);
  let stars = cat.stars.filter((s) => s.mag_v <= BRIGHT_MAG), layers: SkyLayers = { figures: null, centre: 'off' };

  // ---- the day: its state for the Dial, its events, its bar and captions (built when the instant moves into another day)
  let dayI = -1, day: DayState | null = null, events: DayEvent[] = [], rising: ReturnType<typeof risingWithSun> = [];
  let lastJd = NaN, lastPart = 0, summaryOn = false, captionsOn = true, shownCaps = '';
  const W = opts.captionParts ?? 1.5;
  const hm = (jd: number) => localDateTime(jd, doc.calculation.timezone, offsetOf(doc.rows[Math.max(0, dayI)].sunrise_local)).time.slice(0, 5);
  function newDay(i: number) {
    dayI = i; day = dayState(doc, i); events = dayEvents(doc, i); rising = risingWithSun(doc, i, events);
    buildBar();
  }

  // ---- layout: the boxes from the geometry; a change of shape redraws the instant
  function layout() {
    if (!host.clientWidth || !host.clientHeight) return;
    place(); sky.stage.resize();                                  // the sky's box just changed: it measures it again, not as it was
    if (dayI >= 0) buildBar();
    if (isFinite(lastJd)) draw(lastJd);
  }
  const ro = new ResizeObserver(layout); ro.observe(host);

  /** The thread: from the Sun in the sky to the Sun on the face, straight down (tall) or curving across (wide); hidden while the
   *  Sun is out of the sky's view (a hand turned it away). */
  function thread(sun: { az: number; alt: number }) {
    const hr = host.getBoundingClientRect(), k = hr.width / (host.offsetWidth || hr.width) || 1;
    const p = sky.toScreen(sun.az, sun.alt), r = dialSvg.querySelector('[data-body=sun]')?.getBoundingClientRect();
    const x1 = p ? (p.x - hr.left) / k : NaN, y1 = p ? (p.y - hr.top) / k : NaN, inSky = x1 >= g.sky.x && x1 <= g.sky.x + g.sky.w && y1 >= g.sky.y && y1 <= g.sky.y + g.sky.h;
    const on = !!r && inSky;
    threadSvg.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    const x2 = (r!.left + r!.width / 2 - hr.left) / k, y2 = (r!.top + r!.height / 2 - hr.top) / k, rr = r!.width / 2 / k + 3;
    let d: string;
    if (g.side) { const a = x1 + 10, b = x2 - rr, m = (a + b) / 2; d = `M${a} ${y1}C${m} ${y1} ${m} ${y2} ${b} ${y2}`; }
    else { const a = y1 + 10, b = y2 - rr, m = (a + b) / 2; d = Math.abs(x1 - x2) < 0.5 ? `M${x1} ${a}L${x2} ${b}` : `M${x1} ${a}C${x1} ${m} ${x2} ${m} ${x2} ${b}`; }
    for (const el of threadSvg.children) el.setAttribute('d', d);
  }

  // ---- the day bar (src/day/bar.ts)
  const bar = createDayBar(barSvg, { width: () => g.foot.w - 44, onScrub: opts.onScrub });
  const buildBar = () => bar.build(doc, dayI, events, hm);
  const placeHead = () => bar.place(lastPart);

  // ---- captions: each event for a while after the day reaches it; or, at the close of a recording, the day's summary
  const mins = (m: number) => { const n = Math.round(Math.abs(m)); return n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`; };
  const deg = (a: number) => `${a < 0 ? '−' : ''}${Math.abs(a).toFixed(1)}°`;
  function caption(v: DayEvent, op: number) {
    const e = doc.extended[dayI], c = doc.calculation;
    const line = (who: string, note = '') => `<div class="cap" style="--c:${v.color};opacity:${op.toFixed(3)}"><b>${who}</b><time>${hm(v.jd)}</time>${note ? `<span>${note}</span>` : ''}</div>`;
    if (v.body === 'Sun') {
      if (v.kind === 'rise') return line('Sunrise', `in portal ${e.portal} · ${doc.rows[dayI].azimuth_deg.toFixed(1)}°`);
      if (v.kind === 'set') return line('Sunset', `at ${e.sunset_azimuth_deg.toFixed(1)}° · ${e.day_parts.toFixed(2)} parts of daylight`);
      const alt = skyFrame(v.jd, c.latitude, c.longitude_east, c.elevation_m).sun.alt;
      return line(v.kind === 'noon' ? 'Midday' : 'Midnight', `the Sun at its ${v.kind === 'noon' ? 'highest' : 'lowest'} · ${deg(alt)}`);
    }
    const r = rising.find((x) => x.jd === v.jd);
    return line(`${v.body} ${v.kind === 'rise' ? 'rises' : 'sets'}`, r ? `${mins(r.offset)} ${r.offset < 0 ? 'before' : 'after'} the Sun` : '');
  }
  function summary() {
    const e = doc.extended[dayI], light = Math.round((e.sunset_jd_ut - doc.rows[dayI].sunrise_jd_ut) * 1440);
    return `<div class="cap sum"><span>Daylight</span><time>${Math.floor(light / 60)} h ${light % 60} min</time><span>· ${e.day_parts.toFixed(2)} of 18 parts · portal ${e.portal}</span></div>`
      + (rising.length ? `<div class="cap sum"><span>Rising with the Sun</span>${rising.map((r) => `<b style="--c:${r.color}">${r.body}</b><time>${r.offset < 0 ? '−' : '+'}${mins(r.offset)}</time>`).join('')}</div>`
        : '<div class="cap sum"><span>No planet rises within two hours of the Sun</span></div>');
  }
  function showCaptions() {
    let html = '';
    if (summaryOn) html = summary();
    else if (captionsOn) html = events.map((v) => ({ v, age: lastPart - v.part })).filter(({ age }) => age >= 0 && age < W).slice(-MAX_CAPTIONS)
      .map(({ v, age }) => caption(v, Math.min(1, v.part === 0 ? 1 : age / (W * 0.1), (W - age) / (W * 0.25)))).join('');
    if (html !== shownCaps) { caps.innerHTML = html; shownCaps = html; }
  }

  // ---- the instant
  function draw(jd: number) {
    const i = dayIndexAt(doc, jd); if (i < 0 || i + 1 >= doc.rows.length) return;
    if (i !== dayI) newDay(i);
    lastJd = jd;
    sky.setInstant(jd);
    const sun = sky.info()!.sun;
    follow.aim();
    const s = dialState(doc, jd, stars, g.side ? 'sun-left' : 'sun', 0, day!);
    dial.update(doc, s, layers);
    lastPart = s.part;
    placeHead(); showCaptions(); thread(sun);
  }
  layout();

  return {
    sky, draw,
    /** The day on show: its index, events, the planets rising with the Sun. */
    day: () => ({ i: dayI, events, rising }),
    get follow() { return follow.on; },
    /** Follow the Sun again (or stop): the sky turns back to it at once. */
    setFollow(on: boolean) { follow.set(on ? { kind: 'sun' } : null); opts.onFollow?.(on); if (isFinite(lastJd)) draw(lastJd); },
    setCaptions(on: boolean) { captionsOn = on; showCaptions(); },
    setDaylight(on: boolean) { sky.setLayers({ daylight: on }); if (isFinite(lastJd)) draw(lastJd); },
    setMagLimit(m: number) { sky.setMagLimit(m); },
    /** The Dial tab's sky settings for the face: the stars to its limit (and the figures' stars), the figures, the centre. */
    setDialSky(p: SkyPrefs) {
      const ends = new Set(p.figures ? cat.segments.flat() : []);
      stars = cat.stars.filter((x) => x.mag_v <= p.mag || ends.has(x.id));
      layers = { figures: p.figures ? cat.segments : null, centre: p.centre };
      if (isFinite(lastJd)) draw(lastJd);
    },
    /** The closing summary in place of the captions (the Studio's last seconds). */
    setSummary(on: boolean) { summaryOn = on; showCaptions(); },
    dispose() { ro.disconnect(); sky.dispose(); root.remove(); },
  };
}

/** The details panel for a day: its events in order with their times, and what rose with the Sun. */
export function dayPanel(doc: YearDoc, i: number, events: DayEvent[], rising: ReturnType<typeof risingWithSun>) {
  const e = doc.extended[i], off = offsetOf(doc.rows[i].sunrise_local), hm = (jd: number) => localDateTime(jd, doc.calculation.timezone, off).time.slice(0, 5);
  const light = Math.round((e.sunset_jd_ut - doc.rows[i].sunrise_jd_ut) * 1440);
  const name = (v: DayEvent) => (v.body === 'Sun' ? { rise: 'Sunrise', set: 'Sunset', noon: 'Midday', midnight: 'Midnight' }[v.kind] : `${v.body} ${v.kind === 'rise' ? 'rises' : 'sets'}`);
  const rows = events.map((v) => `<dt style="color:${v.color}">${name(v)}</dt><dd>${hm(v.jd)} <small>· part ${v.part.toFixed(2)}</small></dd>`).join('');
  const withSun = rising.length ? rising.map((r) => `<dt style="color:${r.color}">${r.body}</dt><dd>${Math.round(Math.abs(r.offset))} min ${r.offset < 0 ? 'before' : 'after'}</dd>`).join('') : '<dt>—</dt><dd>none within two hours</dd>';
  return `<div class="section"><div class="eyebrow">The day · sunrise to sunrise</div>
    <div class="big">${Math.floor(light / 60)}<small> h </small>${light % 60}<small> min of daylight</small></div>
    <p class="sub">${e.day_parts.toFixed(2)} of 18 parts · sunrise in portal ${e.portal}</p>
    <p class="note">The Sky turns with the Sun and the Dial is turned to face it: the gold thread joins them. The solid gold path is where the Sun has been since sunrise, the dotted path where it goes until the next; the faint lines are the Moon's and the planets' paths. Drag the sky to look around; Follow Sun brings it back, as close as you have zoomed. Pinch or scroll to zoom while it follows (a double tap brings back the whole view); drag along the day bar to move through the day.</p></div>
    <div class="section"><div class="eyebrow">Rising with the Sun · within two hours</div><dl class="read">${withSun}</dl></div>
    <div class="section"><div class="eyebrow">Risings and settings</div><dl class="read dv-events">${rows}</dl></div>`;
}
