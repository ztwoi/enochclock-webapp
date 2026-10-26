// The Dial as a view of the app: one SVG face, recomputed from the calculator's year documents at
// the app's instant (the shared cursor and part of the day). The header is the view's title block
// (the weekday and course, the date and the Sun, the framing under them); the counts sit beside a
// landscape face and under a portrait one; the details panel is the app's inspector.
import { accuracyFlag, accuracySection } from '../accuracy';
import type { CompassStatus, Reading } from '../compass/compass';
import { hub } from '../compass/hub';
import { decimalYear, declination } from '../compass/wmm';
import { toRoman } from '../cycleui';
import { civil, timeOf } from '../dates';
import { annual } from '../model';
import type { Star } from '../sky/catalogue';
import type { Site, YearDoc } from '../types';
import { createDial, hitBand, type Centre, type RingKey, type RingReport, type SkyLayers } from './render';
import { BRIGHT_MAG, dayState, dialState, facing, jdAtPart, wrap, type DayState, type DialState, type Framing } from './state';
import { attachZoom } from './zoom';
import './face.css';

const FKEY = 'enoch.dial.framing.v1', SKEY = 'enoch.dial.sky.v1', IKEY = 'enoch.dial.info.v1';
/** Sky layers, all off by default (the face as it was): the star limit, the constellation figures, the centre chart. */
interface SkyPrefs { mag: number; figures: boolean; centre: Centre }
const MAGS: [number, string][] = [[BRIGHT_MAG, 'bright stars, 214'], [4.5, '925 stars'], [6, 'naked eye, 5,070']];
function loadSky(): SkyPrefs {
  const d: SkyPrefs = { mag: BRIGHT_MAG, figures: false, centre: 'off' };
  try { const v = JSON.parse(localStorage.getItem(SKEY) ?? '{}');
    return { mag: MAGS.some(([m]) => m === v.mag) ? v.mag : d.mag, figures: v.figures === true, centre: ['above', 'up'].includes(v.centre) ? v.centre : 'off' }; } catch { return d; }
}
/** Places where the Sun's line slows, stops and turns back: the Sun passes poleward of the zenith. */
const EXPLORE: (Site & { date: string; note: string })[] = [
  { name: 'Honolulu', lat: 21.3069, lon: -157.8583, elev: 0, tz: 'Pacific/Honolulu', source: 'preset', date: '2026-06-21', note: 'June solstice: the Sun passes north of the zenith; its line reverses twice' },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198, elev: 15, tz: 'Asia/Singapore', source: 'preset', date: '2026-06-21', note: 'June solstice near the equator: the Sun stays north all day' },
  { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729, elev: 0, tz: 'America/Sao_Paulo', source: 'preset', date: '2026-12-21', note: 'December solstice: the southern mirror of Honolulu' },
  { name: 'Quito', lat: -0.1807, lon: -78.4678, elev: 2850, tz: 'America/Guayaquil', source: 'preset', date: '2026-03-20', note: 'March equinox on the equator: the Sun climbs straight through the zenith' },
];
/** Which view reads each ring in full. */
const VIEW_OF: Record<RingKey, [string, string]> = {
  sky: ['sky', 'Sky'], bearing: ['quarters', 'Four Quarters'], uncorrected: ['wheel', 'The Wheel'], position: ['wheel', 'The Wheel'],
  correction: ['wheel', 'The Wheel'], courses: ['wheel', 'The Wheel'], parts: ['sky', 'Sky'], compass: ['gate', 'Gate of the East'],
};

/** The app's side of the Dial: where its details go, and what it asks of the app. */
export interface DialHost {
  details: HTMLElement;
  openDetails(): void;
  narrow(): boolean;
  /** Open another view at the same instant. */
  goView(view: string): void;
  /** Whether that view is offered (its tab not greyed out). */
  canOpen(view: string): boolean;
  /** A new observer at local noon of a date (the Sun's-speed presets). */
  explore(site: Site, date: string): void;
  /** Redraw at the current instant (a layer or framing changed). */
  redraw(): void;
  /** For the tests and the header: the observer and the transport. */
  info(): { site: Site; live: boolean; play: 'days' | 'degrees' | null; speeds: { degree: number; day: number } };
}
/** The instant to draw: day i of doc at `part` (0–18), gliding `frac` of the way to the same hour tomorrow. */
export interface DialAt { doc: YearDoc; i: number; part: number; frac: number; next: YearDoc | null }

export function createDialView(host: HTMLElement, head: { title: HTMLElement; prim: HTMLElement; controls: HTMLElement }, h: DialHost) {
  host.innerHTML = `<svg id="dl-svg" role="img" aria-label="The Dial: every count on one face"></svg><dl class="dl-ledger" id="dl-ledger" aria-label="Counts"></dl>
    <div class="dl-face" id="dl-face"><div class="dl-sun" id="dl-sun"></div><p class="sky-note" id="dl-note" role="status" hidden></p></div>`;
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const svg = $('dl-svg') as unknown as SVGSVGElement, face = $('dl-face'), ledger = $('dl-ledger');
  const dial = createDial(svg);
  const st = {
    framing: ((new URLSearchParams(location.search).get('framing') as Framing) || (localStorage.getItem(FKEY) as Framing) || 'north') as Framing,
    heading: 0, reading: null as Reading | null, sel: null as RingKey | null, sky: loadSky(),
    stars: [] as Star[], segments: [] as [string, string][], skyStars: [] as Star[],
    day: null as DayState | null, s: null as DialState | null, rings: [] as RingReport[], site: null as Site | null, active: false,
    starsIn: false,   // the catalogue has answered (or failed): the face is complete
  };
  if (!['north', 'sun', 'compass'].includes(st.framing)) st.framing = 'north';
  const compass = hub.compass;                                     // the one sensor, shared with Sky: on in either, on in both
  let sx = 0, sy = 0, primed = false;
  const ease = (h: number) => { const k = primed ? 0.25 : 1, a = h * Math.PI / 180; primed = true; sx = (1 - k) * sx + k * Math.sin(a); sy = (1 - k) * sy + k * Math.cos(a); return wrap(Math.atan2(sx, sy) * 180 / Math.PI); };   // each reading eased on the unit circle
  hub.onReading((r) => {
    st.reading = r; st.heading = ease(r.heading);
    if (!st.active) return;
    if (hub.status === 'live') note('');
    if (st.framing === 'compass') h.redraw(); else compassPanel();
  });
  /** The compass came on or went off somewhere (Sky, a reload): the face takes the compass framing while it is on, and the framing chosen here returns when it is off. */
  let borrowed = false;
  const follow = () => {
    if (hub.active && st.framing !== 'compass') { st.framing = 'compass'; borrowed = true; }
    else if (!hub.active && borrowed) { borrowed = false; const f = localStorage.getItem(FKEY) as Framing | null; st.framing = f && f !== 'compass' ? f : 'north'; }
    else return;
    primed = false; sideKey = ''; if (st.active) { head.controls.querySelectorAll<HTMLButtonElement>('[data-framing]').forEach((b) => { const on = b.dataset.framing === st.framing; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); h.redraw(); }
  };
  hub.onChange(() => { if (st.active) follow(); });
  /** A note over the face while the compass starts or cannot (as Sky's); the lasting ones stay until it answers. */
  let noteTimer = 0;
  function note(msg: string, lasting = false) {
    const el = $('dl-note'); clearTimeout(noteTimer); el.innerHTML = msg; el.hidden = !msg;
    if (msg && !lasting) noteTimer = window.setTimeout(() => { el.hidden = true; }, 8000);
  }
  const NOTE: Partial<Record<CompassStatus, string>> = {
    insecure: 'The compass needs HTTPS: open the app at its https:// address.',
    unsupported: 'This browser has no compass (desktop browsers have none). The face holds the heading set in the details.',
    denied: 'Motion &amp; orientation access was declined. On iPhone: Settings → Safari → Motion &amp; Orientation Access, then tap Compass again.',
    waiting: 'Waiting for the first compass reading… move the device in a figure of eight if it stays silent.',
  };
  /** Start following the device, from the tap itself (iOS asks for motion access only inside a tap). */
  function startCompass() {
    if (hub.active) return;
    borrowed = false; primed = false;
    const p = hub.start();                                   // requestPermission runs before its first await: still inside the tap
    note(NOTE.waiting!, true);
    p.then((s) => { note(s === 'live' ? '' : NOTE[s] ?? '', s === 'waiting'); compassPanel(); h.redraw(); });
  }
  const q = new URLSearchParams(location.search).get('heading'); if (q) st.heading = wrap(+q);

  // ------------------------------------------------------------ layout: the face fits what the header and the counts leave
  const narrow = matchMedia('(max-width: 1100px), (max-aspect-ratio: 1/1)'), phone = matchMedia('(max-width: 700px)'), short = matchMedia('(orientation: landscape) and (max-height: 600px) and (pointer: coarse)');   // short: a phone turned sideways, which takes the wide arrangement
  function fit() {
    const vh = document.querySelector<HTMLElement>('.view-head');
    host.style.setProperty('--head-h', `${vh ? vh.offsetTop + vh.offsetHeight + 8 : 0}px`);
    if (!narrow.matches || short.matches) { host.style.removeProperty('--face-h'); ledger.classList.remove('dl-row'); return; }
    const pad = parseFloat(getComputedStyle(host).paddingTop) || 0, ls = getComputedStyle(ledger), W = host.clientWidth;
    const room = () => host.clientHeight - pad - ledger.getBoundingClientRect().height - (parseFloat(ls.marginTop) || 0) - (parseFloat(ls.marginBottom) || 0) - 8;   // 8 px clear of the bar
    ledger.classList.toggle('dl-row', phone.matches);                         // on a phone the counts are one row that scrolls sideways, at the foot of the view
    host.style.setProperty('--face-h', `${Math.max(0, Math.min(W, room()))}px`);   // a portrait face sits at the top
  }
  const ro = new ResizeObserver(fit); ro.observe(host); ro.observe(ledger);
  const vh = document.querySelector('.view-head'); if (vh) ro.observe(vh);
  narrow.addEventListener('change', fit); phone.addEventListener('change', fit); short.addEventListener('change', fit);

  attachZoom(svg, (x, y) => { st.sel = hitBand(x, y); sideKey = ''; h.redraw(); if (st.sel && h.narrow()) h.openDetails(); }, undefined, () => phone.matches && !short.matches && !host.closest('.stage')?.classList.contains('dl-noinfo'), face);   // on a phone the face rests at the top of its room

  // ------------------------------------------------------------ the face
  const layers = (): SkyLayers => ({ figures: st.sky.figures ? st.segments : null, centre: st.sky.centre });
  function chooseStars() {
    const ends = new Set(st.sky.figures ? st.segments.flat() : []);
    st.skyStars = st.stars.filter((x) => x.mag_v <= st.sky.mag || ends.has(x.id));
  }
  function setSky(p: Partial<SkyPrefs>) { st.sky = { ...st.sky, ...p }; localStorage.setItem(SKEY, JSON.stringify(st.sky)); chooseStars(); h.redraw(); }
  const lastRow = (d: YearDoc) => d.rows.length - 1;
  /** Tomorrow at the same hour: this year's next day, or the next year's first when it is loaded. */
  function tomorrow(a: DialAt) {
    if (a.i + 1 < lastRow(a.doc)) return { doc: a.doc, i: a.i + 1, jd: jdAtPart(a.doc, a.i + 1, a.part) };
    const n = a.next; return n && n.calculation.enoch_year === a.doc.calculation.enoch_year + 1 ? { doc: n, i: 0, jd: jdAtPart(n, 0, a.part) } : null;
  }

  function render(a: DialAt) {
    const { doc, i } = a;
    if (!st.day || st.day.doc !== doc || st.day.i !== i) st.day = dayState(doc, i);
    const ahead = a.frac > 0 ? tomorrow(a) : null, inf = h.info();
    if (!st.site || siteKey(st.site) !== siteKey(inf.site)) { st.site = inf.site; hub.setSiteDeclination(declination(inf.site.lat, inf.site.lon, inf.site.elev / 1000, decimalYear(Date.now()))); }
    const s = (st.s = dialState(doc, jdAtPart(doc, i, a.part), st.skyStars, st.framing, st.heading, st.day, ahead && { ...ahead, frac: a.frac }));
    st.rings = dial.update(doc, s, layers()).rings;
    header(doc, s); counts(doc, s); sunReadout(s); side(doc, s);
    window.__dial = { state: s, rings: st.rings, site: inf.site, live: inf.live, play: inf.play, speeds: inf.speeds, sel: st.sel };
    if (st.starsIn) document.body.dataset.ready = '1';
  }

  // ------------------------------------------------------------ the header and the counts
  const sgn = (v: number, n = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(n)}`;
  const setHTML = (el: HTMLElement, html: string) => { if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } };
  function header(doc: YearDoc, s: DialState) {
    const e = s.ext, r = s.row;
    setHTML(head.title, `<span class="dl-wd" data-k="dl-weekday">${e.weekday_name.slice(0, 3)}</span> <span class="dl-crs" data-k="dl-course">${e.course_name}</span>${accuracyFlag(doc.accuracy)}`);
    setHTML(head.prim, `<span data-k="dl-date">${r.month}/${r.day} <small>(${s.positionDeg}°)</small></span><span><small>SUN</small> ${s.sun.az.toFixed(2)}° · ${sgn(s.sun.alt, 1)}°</span>`);
    head.controls.querySelectorAll<HTMLButtonElement>('[data-framing]').forEach((b) => { const on = b.dataset.framing === st.framing; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  }
  /** Label over value. The Enoch date, the course, the Enoch time and the Gregorian date and time are the bottom bar's. */
  function counts(doc: YearDoc, s: DialState) {
    const e = s.ext, t = s.time, nextHold = annual(doc).find((_, k) => k > s.i && doc.extended[k].hold);
    const row = (k: string, v: string, title = '', cls = '') => `<div${cls ? ` class="${cls}"` : ''}${title ? ` title="${title}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`;
    setHTML(ledger, [
      row('Uncorrected', `<span class="en" data-k="dl-enoch">${e.uncorrected_month}/${e.uncorrected_day}/${e.cycle_year_364}/${e.span_cycle}</span>`, 'The uncorrected count: month / day / year of the 294-year cycle / cycles since the epoch'),
      row('Moon', `${(s.moon.fraction * 14).toFixed(2)}/14 · ${(s.moon.fraction * 100).toFixed(1)}%`),
      row('Unit', `<span data-k="dl-unit">${t.units.toLocaleString('en-US')} / 86,400</span> <small>(${Math.floor(t.dayDeg)}°)</small>`, 'Equal units since sunrise (the day-degree in brackets)'),
      row('Next hold', `<span data-k="dl-next">${e.days_to_next_hold} d</span>${nextHold ? ` · ${civil(nextHold.civil_date)}` : ''}`, '', 'hold'),
      row('Holds', `<span data-k="dl-holds">${e.holds_done_in_cycle}/364 · ${e.holds_remaining_in_cycle} left</span>`),
      row('294', `<span data-k="dl-294">${e.correction_day}/294 · ${e.correction_42}/7 · ${e.correction_6}/7 · ${e.correction_day_of_6}/6</span>`),
      row('Six-year', `${e.six_year_cycle}/49 · ${e.six_year_year}/6`),
      row('Cycle', `${toRoman(e.span_cycle)} · ${e.cycle_year}/293`),
    ].join(''));
  }
  function sunReadout(s: DialState) {
    setHTML($('dl-sun'), `<b data-k="dl-rate">${sgn(s.sun.rate, 3)}°/min</b>`);
  }

  // ------------------------------------------------------------ the details panel (the app's inspector)
  /** Patch the existing nodes in place: panels redrawn every frame while playing keep their buttons, focus and layout. */
  function morph(el: HTMLElement | null, html: string) {
    if (!el || el.dataset.h === html) return;
    el.dataset.h = html;
    const t = document.createElement('template'); t.innerHTML = html; sync(el, t.content);
  }
  function sync(a: Node, b: Node) {
    const ac = [...a.childNodes], bc = [...b.childNodes];
    bc.forEach((bn, k) => {
      const an = ac[k];
      if (!an) { a.appendChild(bn); return; }
      if (an.nodeType !== bn.nodeType || an.nodeName !== bn.nodeName) { a.replaceChild(bn, an); return; }
      if (an.nodeType !== Node.ELEMENT_NODE) { if (an.nodeValue !== bn.nodeValue) an.nodeValue = bn.nodeValue; return; }
      const ae = an as Element, be = bn as Element;
      for (const { name } of [...ae.attributes]) if (!be.hasAttribute(name)) ae.removeAttribute(name);
      for (const { name, value } of [...be.attributes]) if (ae.getAttribute(name) !== value) ae.setAttribute(name, value);
      sync(ae, be);
    });
    for (let k = bc.length; k < ac.length; k++) ac[k].remove();
  }
  function skyPanel() {
    const b = (attr: string, v: string, label: string, on: boolean, title = '') => `<button class="btn ${on ? 'on' : ''}" ${attr}="${v}" aria-pressed="${on}" ${title ? `title="${title}"` : ''}>${label}</button>`;
    const k = st.sky;
    return `<div class="section"><div class="eyebrow">Sky layers</div>
      <dl class="read dl-skyopts">
       <dt>Stars</dt><dd>${MAGS.map(([m, t]) => b('data-sky-mag', String(m), `V ≤ ${m}`, k.mag === m, t)).join('')}</dd>
       <dt>Figures</dt><dd>${b('data-sky-fig', '0', 'Off', !k.figures)}${b('data-sky-fig', '1', 'Constellations', k.figures, '88 modern figures (Stellarium), not ancient ones')}</dd>
       <dt>Centre</dt><dd>${b('data-sky-ctr', 'off', 'Compass', k.centre === 'off')}${b('data-sky-ctr', 'above', 'Sky · from above', k.centre === 'above', 'On the compass bearings: east right, figures mirrored')}${b('data-sky-ctr', 'up', 'Sky · looking up', k.centre === 'up', 'As a star chart held overhead: east left, figures as seen')}</dd>
      </dl>
      <p class="note">${k.centre === 'above' ? 'The centre is the whole sky above the horizon, zenith in the middle, on the same bearings as the compass and portals over it: a map of the sky seen from above, so the figures are mirrored.'
        : k.centre === 'up' ? 'The centre is the whole sky above the horizon as you see it lying on your back, head to the top: east on the left, figures as in the sky. The compass and portals hide, since east–west is reversed from the bearings around it.'
        : 'Every star sits at its computed true azimuth and altitude; more stars and the figures add detail, not approximation. Far from today, star positions are indicative (see Accuracy).'}</p></div>`;
  }
  function ringPanel(doc: YearDoc, s: DialState, k: RingKey) {
    const e = s.ext, r = s.row, t = s.time, kv = (a: string, b: string | number) => `<dt>${a}</dt><dd>${b}</dd>`;
    const course = doc.priests.courses.find((c) => c.n === e.course);
    const body: Record<RingKey, [string, string, string]> = {
      sky: ['The sky band', 'Altitude from the horizon (inner circle) to the zenith (rim); dotted at 30° and 60°. Bodies below the horizon sit hollow on the inner track. The dashed gold path is the Sun’s course today, a dot per part — closer dots, slower Sun.',
        kv('Sun', `${s.sun.az.toFixed(2)}° · ${sgn(s.sun.alt)}°`) + kv('Moon', `${s.moon.az.toFixed(2)}° · ${sgn(s.moon.alt)}°`) + kv('Stars drawn', `${s.bright.filter((b) => b.alt > 0).length} (V ≤ ${st.sky.mag}${st.sky.figures ? ' and the figures’ stars' : ''})`)],
      bearing: ['True bearings', 'Azimuth from true north, clockwise, every 5°. The framing turns this band: north-up, Sun-up, or the way the device faces.',
        kv('Framing', st.framing) + kv('Top of the face', `${wrap(-s.F).toFixed(2)}°`) + kv('Sunrise / sunset', `${r.azimuth_deg.toFixed(2)}° / ${e.sunset_azimuth_deg.toFixed(2)}°`)],
      uncorrected: ['The uncorrected count', 'The paper’s 364-day count with no 294-day corrections: month / day as the bare count from the epoch runs, against the corrected date beside it.',
        kv('Uncorrected', `${e.uncorrected_month}/${e.uncorrected_day} (day ${e.uncorrected_doy})`) + kv('Corrected', `${r.month}/${r.day} (day ${r.corrected_doy})`) + kv('Corrections since epoch', e.corrections_since_epoch.toLocaleString('en-US'))],
      position: ['Months and positions', 'Twelve months (Ge’ez numerals), 364 positions anticlockwise. Gold diamonds: the four leaders’ days; silver triangles: this year’s holds.',
        kv('Date', `${r.month}/${r.day}`) + kv('Position', `${r.corrected_doy}/364 · ${s.positionDeg}°`) + kv('Portal', e.portal) + kv('Verse', e.verse)],
      correction: ['The 294-day correction', '294 = 7 × 42 and 42 = 7 × 6: seven weeks of 42 days, each seven weeks of six. A hold opens every cycle (the silver triangle).',
        kv('Day', `${e.correction_day}/294`) + kv('Week of 42', `${e.correction_42}/7`) + kv('Week of 6', `${e.correction_6}/7 · day ${e.correction_day_of_6}/6`) + kv('Next hold', `${e.days_to_next_hold} days`) + kv('Holds this cycle', `${e.holds_done_in_cycle} done · ${e.holds_remaining_in_cycle} left`)],
      courses: ['The 24 priestly courses and the week', 'Sunday-to-Sabbath weeks in the Qumran order from Gamul, unbroken from the epoch; 24 weeks a rotation, 13 rotations in six years. Each course is one week: the seven inner cells are its days, the Sabbath darker; the Sun’s line crosses one a day, and the day changes at sunrise, not midnight.',
        kv('Day', `${e.weekday}. ${e.weekday_name}`) + kv('Began', `${civil(r.sunrise_local)} ${timeOf(r.sunrise_local)}`) + kv('Course', `${e.course}. ${e.course_name}`) + kv('Chronicles', `${e.course_chronicles}${course?.kjv ? ` · KJV ${course.kjv}` : ''}`) + kv('Week', `${civil(e.course_week_start)} → ${civil(e.course_week_end)}`) + kv('Six-year', `${e.six_year_cycle}/49 · year ${e.six_year_year}/6 · week ${e.six_year_week}`)],
      parts: ['The 18 parts of the day', 'Equal parts from sunrise to the next sunrise, gliding clockwise. Gold: daylight as measured today; bronze: the text’s ratio for this month. Each part has 20 degrees, each degree 60 minutes, each minute 4 seconds: 86,400 a day.',
        kv('Time', `${t.part}:${t.deg}:${t.min}:${t.sec}`) + kv('Unit', `${t.units.toLocaleString('en-US')} / 86,400`) + kv('Daylight', `${s.dayParts.toFixed(2)} parts (text ${s.textParts})`)],
      compass: [st.sky.centre === 'off' ? 'Compass and portals' : 'The sky overhead', `${st.sky.centre === 'up' ? '' : 'The six portals east (sunrise) and west (sunset) on true bearings; gold tick today’s sunrise, silver today’s sunset. '}${st.sky.centre === 'off' ? '' : 'The centre chart: the whole sky above the horizon in a stereographic projection (shapes kept), zenith in the middle, 30° and 60° dotted. '}${st.sky.centre === 'above' ? 'Seen from above, on the compass’s bearings: figures mirrored.' : st.sky.centre === 'up' ? 'Looking up: east on the left, figures as seen.' : ''}`,
        kv('Portal', `${e.portal}`) + kv('Sunrise', `${r.azimuth_deg.toFixed(3)}°`) + kv('Sunset', `${e.sunset_azimuth_deg.toFixed(3)}°`)],
    };
    const [title, how, read] = body[k], [view, name] = VIEW_OF[k];
    return `<div class="section dl-sel" data-sel="${k}"><div class="eyebrow">${title}</div><p class="note">${how}</p><dl class="read">${read}</dl>
      <p class="dl-links">${h.canOpen(view) ? `<button class="btn" data-k="dl-open" data-goto-view="${view}">Open in ${name}</button>` : ''}<button class="btn" id="dl-unsel">Close</button></p></div>`;
  }
  function compassPanel() {
    const el = document.getElementById('dl-compass'); if (!el) return;
    if (st.framing !== 'compass') { morph(el, ''); return; }
    const r = st.reading, s = st.s, stt: CompassStatus = compass.status;
    const msg: Record<CompassStatus, string> = {
      off: 'Tap <b>Start compass</b> to follow the device’s heading.',
      insecure: 'The compass needs HTTPS. Open the app at its https:// address.',
      unsupported: 'This browser has no device orientation (desktop browsers have no compass). The face holds the heading below.',
      denied: 'Motion & orientation access was declined. On iPhone: Settings → Safari → Motion & Orientation Access.',
      waiting: 'Waiting for the first compass reading… move the device in a figure of eight if it stays silent.',
      live: '',
    };
    const near = s ? facing(s, st.heading) : [];
    const nearHTML = near.length ? near.slice(0, 5).map((b) => `<dt class="${Math.abs(b.off) < 3 ? 'hit' : ''}">${b.name}</dt><dd>${Math.abs(b.off) < 0.5 ? 'dead ahead' : `${Math.abs(b.off).toFixed(1)}° ${b.off > 0 ? 'right' : 'left'}`} · alt ${sgn(b.alt, 1)}°</dd>`).join('')
      : '<dt>—</dt><dd>nothing bright within 12°</dd>';
    const pad = '<dt>&nbsp;</dt><dd></dd>'.repeat(5 - Math.min(5, Math.max(1, near.length)));   // always five rows: the panel keeps its height
    morph(el, `<div class="section"><div class="eyebrow">Compass</div>
      ${stt !== 'live' ? `<p class="note">${msg[stt]}</p>` : ''}
      <dl class="read"><dt>Facing</dt><dd data-k="dl-heading">${st.heading.toFixed(1)}° true</dd>
       ${r ? `<dt>Magnetic</dt><dd>${r.magnetic.toFixed(1)}° · ${r.source === 'ios' ? 'iOS compass' : 'absolute orientation'} · ${r.pose}${r.accuracy !== null ? ` · ±${r.accuracy.toFixed(0)}°` : ''}</dd>` : ''}
       <dt>Correction</dt><dd data-k="dl-decl">${compass.calibration !== null ? `Sun calibration ${sgn(compass.calibration, 1)}°` : `declination ${sgn(compass.declination, 2)}° (WMM2025)`}</dd>
       ${nearHTML}${pad}</dl>
      <p class="dl-links">${stt === 'live' || stt === 'waiting' ? '' : '<button class="btn on" id="dl-cstart">Start compass</button>'}
       ${stt === 'live' && s && s.sun.alt > 0 ? '<button class="btn" id="dl-ccal">I’m facing the Sun</button>' : ''}
       ${compass.calibration !== null ? '<button class="btn" id="dl-cclear">Use declination</button>' : ''}
       ${stt !== 'live' ? `<label class="mini">Heading <input id="dl-hdg" type="number" min="0" max="360" step="1" value="${st.heading.toFixed(0)}"></label>` : ''}</p></div>`);
  }
  let sideKey = '';
  const siteKey = (s: Site) => `${s.lat},${s.lon},${s.elev},${s.tz}`;
  /** The panel is built once in the inspector; the Sun's trace is redrawn when the day changes; the readings are patched in place every frame. */
  function side(doc: YearDoc, s: DialState) {
    if (!h.details.querySelector('#dl-trace')) { buildSide(); sideKey = ''; }
    const key = `${st.site ? siteKey(st.site) : ''}:${doc.calculation.enoch_year}:${s.i}`;
    if (key !== sideKey) { sideKey = key; trace(s); }
    const x = traceX(s.part); $('dl-cursor')?.setAttribute('x1', String(x)); $('dl-cursor')?.setAttribute('x2', String(x));
    morph($('dl-bodies'), [['Sun', s.sun], ['Moon', s.moon], ...s.planets.map((p) => [p.name, p] as const)]
      .map(([n, b]) => { const v = b as { az: number; alt: number }; return `<dt class="${v.alt > 0 ? '' : 'down'}">${n}</dt><dd>${v.az.toFixed(2)}° · ${sgn(v.alt, 2)}°</dd>`; }).join(''));
    morph($('dl-ring'), st.sel ? ringPanel(doc, s, st.sel) : '');
    morph($('dl-sky'), skyPanel());
    morph($('dl-acc'), accuracySection(doc.accuracy, { stars: true }));
    compassPanel();
  }
  const TW = 380, TH = 170, traceX = (p: number) => 8 + (p / 18) * (TW - 16);
  function buildSide() {
    h.details.innerHTML = `<div class="dl-side">
     <div id="dl-ring"></div><div id="dl-compass"></div><div id="dl-sky"></div><div id="dl-acc"></div>
     <div class="section"><div class="eyebrow">The Sun's azimuth today · sunrise to sunrise</div>
     <svg class="dl-trace" id="dl-trace" viewBox="0 0 ${TW} ${TH}" role="img" aria-label="The Sun's azimuth through the day"></svg>
     <p class="note">Gold: the Sun's azimuth. Silver: its speed, up to <span id="dl-maxrate"></span>°/min in daylight. Dashed: where the Sun's line reverses.</p></div>
     <div class="section"><div class="eyebrow">Bodies · azimuth · altitude</div><dl class="read" id="dl-bodies"></dl></div>
     <div class="section"><div class="eyebrow">Explore the Sun's speed</div><div class="dl-explore">${EXPLORE.map((x, k) => `<button class="btn" data-explore="${k}" title="${x.note}">${x.name} · ${x.date.slice(5)}</button>`).join('')}</div></div>
     <div class="section"><div class="eyebrow">How to read it</div><p class="note">Every ring is turned so its current value sits on the Sun's line: months and positions, the uncorrected month (green), the 294-day correction, the 24 courses (each a week, its seven days the inner cells) and the 18 parts all turn continuously, as gears on one clock, so the Sun's line reads each exact value (3.4 days into the week). Calendar rings count anticlockwise, the day clockwise. The centre and the outer band are true bearings; the rings are counters, not compass scales. Tap a ring for its reading.</p></div></div>`;
  }
  /** Today's Sun: azimuth and speed, sunrise to sunrise (redrawn once a day; the chart keeps its size). */
  function trace(s: DialState) {
    const un: number[] = []; s.trace.forEach((p, k) => un.push(k ? un[k - 1] + (((p.az - s.trace[k - 1].az + 540) % 360) - 180) : p.az));   // a pass through north reads as one curve
    const lo = Math.floor(Math.min(...un) / 90) * 90, hi = Math.ceil(Math.max(...un) / 90) * 90;
    const x = traceX, y = (az: number) => TH - 14 - ((az - lo) / (hi - lo)) * (TH - 28);
    const dp = s.dayParts, pts = s.trace.map((p, k) => `${x(p.t).toFixed(1)},${y(un[k]).toFixed(1)}`).join(' ');
    const maxRate = Math.max(...s.trace.filter((p) => p.alt > 0).map((p) => Math.abs(p.rate)));
    const rate = s.trace.map((p) => `${x(p.t).toFixed(1)},${(TH - 14 - (Math.min(Math.abs(p.rate), maxRate) / maxRate) * 40).toFixed(1)}`).join(' ');
    $('dl-trace').innerHTML = `
      <rect x="${x(0)}" y="8" width="${x(dp) - x(0)}" height="${TH - 22}" fill="rgba(214,178,106,.08)"/>
      ${Array.from({ length: (hi - lo) / 90 + 1 }, (_, k) => lo + 90 * k).map((a) => `<line x1="8" x2="${TW - 8}" y1="${y(a)}" y2="${y(a)}" stroke="rgba(236,227,207,.08)"/><text x="${TW - 6}" y="${y(a) - 2}" text-anchor="end" font-family="Plex Mono" font-size="8" fill="#635d51">${wrap(a)}°</text>`).join('')}
      <polyline points="${rate}" fill="none" stroke="#8fb3bd" stroke-width="1" opacity=".7"/>
      <polyline points="${pts}" fill="none" stroke="#f4dc9f" stroke-width="1.4"/>
      ${s.reversals.map((p) => `<line x1="${x(p)}" x2="${x(p)}" y1="8" y2="${TH - 14}" stroke="#8fb3bd" stroke-dasharray="2 3"/>`).join('')}
      <line id="dl-cursor" x1="${x(s.part)}" x2="${x(s.part)}" y1="8" y2="${TH - 14}" stroke="#f4dc9f"/>
      <text x="8" y="${TH - 2}" font-family="Plex Mono" font-size="8" fill="#635d51">SUNRISE · part 0</text>
      <text x="${x(dp)}" y="${TH - 2}" text-anchor="middle" font-family="Plex Mono" font-size="8" fill="#8fb3bd">SUNSET ${dp.toFixed(2)}</text>
      <text x="${TW - 8}" y="${TH - 2}" text-anchor="end" font-family="Plex Mono" font-size="8" fill="#635d51">18</text>`;
    $('dl-maxrate').textContent = maxRate.toFixed(2);
  }

  // ------------------------------------------------------------ input: the framing, the panel's buttons
  function setFraming(f: Framing) {
    st.framing = f; localStorage.setItem(FKEY, f); borrowed = false;
    if (f === 'compass') startCompass(); else { hub.stop(); note(''); }                   // the face's own compass framing is the compass's switch, here as Sky's button is
    sideKey = ''; h.redraw();
  }
  head.controls.querySelectorAll<HTMLButtonElement>('[data-framing]').forEach((b) => b.addEventListener('click', () => setFraming(b.dataset.framing as Framing)));
  /** Info: the reading, the counts and the Sun's line, on by default; off, the face alone. Remembered on the device. */
  let info = localStorage.getItem(IKEY) !== '0';
  const infoBtn = head.controls.querySelector<HTMLButtonElement>('#dial-info')!, stage = host.closest<HTMLElement>('.stage')!;
  function showInfo() {
    stage.classList.toggle('dl-noinfo', st.active && !info);
    infoBtn.classList.toggle('on', info); infoBtn.setAttribute('aria-pressed', String(info));
    fit();
  }
  infoBtn.addEventListener('click', () => { info = !info; localStorage.setItem(IKEY, info ? '1' : '0'); showInfo(); });
  h.details.addEventListener('click', async (e) => {
    if (!st.active) return;
    const btn = (e.target as HTMLElement).closest('button'); if (!btn) return;
    if (btn.id === 'dl-unsel') { st.sel = null; h.redraw(); }
    if (btn.id === 'dl-cstart') startCompass();
    if (btn.id === 'dl-ccal' && st.s) { compass.calibrate(st.s.sun.az); compassPanel(); }
    if (btn.id === 'dl-cclear') { compass.clearCalibration(); compassPanel(); }
    if (btn.dataset.skyMag) setSky({ mag: +btn.dataset.skyMag });
    if (btn.dataset.skyFig) setSky({ figures: btn.dataset.skyFig === '1' });
    if (btn.dataset.skyCtr) setSky({ centre: btn.dataset.skyCtr as Centre });
    if (btn.dataset.explore) { const x = EXPLORE[+btn.dataset.explore]; h.explore(x, x.date); }
    if (btn.dataset.gotoView) h.goView(btn.dataset.gotoView);
  });
  h.details.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement; if (st.active && t.id === 'dl-hdg') { st.heading = wrap(+t.value || 0); h.redraw(); }
  });

  return {
    render,
    /** The stars, once the shared catalogue has loaded (the face works without them). */
    setCatalogue(c: { stars: Star[]; segments: [string, string][] }) { st.stars = c.stars; st.segments = c.segments; st.starsIn = true; chooseStars(); },
    /** Shown or left. The compass keeps running when it is left: it is the device's, not this view's. */
    setActive(on: boolean) {
      st.active = on;
      if (!on) { note(''); delete document.body.dataset.ready; }
      else { primed = false; follow(); }
      showInfo();
    },
    deselect() { st.sel = null; },
  };
}
export type DialView = ReturnType<typeof createDialView>;
declare global { interface Window { __dial: unknown } }
