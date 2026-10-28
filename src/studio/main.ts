// The Studio: a page not linked from the app (/studio.html) that draws one Enoch day, sunrise to sunrise, as the frames of a
// video: the app's Sky over its Dial, both at the same instant. The Sky faces the Sun and the Dial is framed Sun-up, so the Sun
// stands on one line through both, joined by a gold thread. The views draw everything astronomical; the Studio adds the title,
// the captions and the day bar.
//
// From the URL: ?date=YYYY-MM-DD (the civil date of the day's sunrise; default today at the site)
//   &site=jerusalem (a preset: san-francisco, jerusalem, sydney, london) or &lat=&lon=&elev=&tz=&name=
//   &seconds=40 (sunrise to sunrise) &fps=30 &intro=1 &hold=3 (seconds held at sunrise, and on the closing summary)
//   &capture=1: the frame alone, 1:1, no controls (scripts/day-video.mjs records it).
// For a script: window.studio = { ready, frames, fps, seek(frame) }; seek resolves once the frame is painted.
import '../theme.css';
import '../fonts.css';
import '../dial/face.css';
import './studio.css';
import { FALLBACK, PRESETS, fetchYearContaining } from '../api';
import { enochText, localDateTime, offsetOf } from '../dates';
import { createDial } from '../dial/render';
import { BRIGHT_MAG, dayState, dialState } from '../dial/state';
import { annual, GEEZ } from '../model';
import { skyFrame } from '../sky/astronomy';
import { loadCatalogue } from '../sky/catalogue';
import { createSky } from '../skyview';
import type { Site, YearDoc } from '../types';
import { dayEvents, risingWithSun, SUN_COLOR, type DayEvent } from './events';

/** The frame (CSS pixels); recorded at 2×. */
const FRAME_W = 540;
/** The Sky's view always holds both the horizon and the Sun: at least SPAN° of altitude, opened up while the Sun climbs high or
 *  sinks deep, MARGIN° kept beyond it (the view zooms out at midday and midnight and back in at the horizon). */
const SPAN = 70, MARGIN = 17;
/** A smooth max and min (the view's edges glide where the Sun takes over from the horizon, rather than turn a corner). */
const smax = (a: number, b: number, k = 12) => (a + b + Math.hypot(a - b, k)) / 2, smin = (a: number, b: number, k = 12) => (a + b - Math.hypot(a - b, k)) / 2;
/** The middle and height (degrees of altitude) of the Sky's view for a Sun at `alt`. */
function viewFor(alt: number) {
  const hi = smax(alt + MARGIN, 30), lo = smin(alt - MARGIN, -22);
  return { mid: (hi + lo) / 2, span: smax(hi - lo, SPAN) };
}
/** Stars drawn in the Sky (the app's default); the Dial's are its own bright set. */
const MAG = 6.5;
/** A caption shows this long, fading in and out. */
const CAPTION_S = 2.2, FADE_IN_S = 0.25, FADE_OUT_S = 0.5, CAPTIONS = 3;

declare global { interface Window { studio: { ready: Promise<void>; frames: number; fps: number; seek(frame: number): Promise<void>; error?: string } } }

const $ = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;
const P = new URLSearchParams(location.search);
const num = (k: string, d: number) => { const v = Number(P.get(k)); return P.has(k) && Number.isFinite(v) ? v : d; };
const slug = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '-');
function siteOf(): Site {
  const name = P.get('site'), preset = name ? PRESETS.find((s) => slug(s.name) === slug(name)) : undefined;
  if (preset) return preset;
  if (P.has('lat') && P.has('lon')) return { name: P.get('name') ?? 'Custom site', lat: num('lat', 0), lon: num('lon', 0), elev: num('elev', 0), tz: P.get('tz') ?? 'UTC', source: 'manual' };
  return FALLBACK;
}
const site = siteOf();
const date = P.get('date') ?? new Intl.DateTimeFormat('en-CA', { timeZone: site.tz }).format(new Date());
const fps = num('fps', 30), dayFrames = Math.round(num('seconds', 40) * fps), intro = Math.round(num('intro', 1) * fps), hold = Math.round(num('hold', 3) * fps);
const frames = intro + dayFrames + hold, capture = P.get('capture') === '1';
document.body.classList.toggle('capture', capture);

const paint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const status = (msg: string, error = false) => { const s = $('status'); s.textContent = msg; s.hidden = !msg; s.classList.toggle('error', error); };
const p2 = (n: number) => String(n).padStart(2, '0');
const latLon = (s: Site) => `${Math.abs(s.lat).toFixed(2)}°${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lon).toFixed(2)}°${s.lon >= 0 ? 'E' : 'W'}`;

let seekImpl: (f: number) => Promise<void> = async () => undefined;
window.studio = { ready: start(), frames, fps, seek: (f) => seekImpl(f) };
window.studio.ready.catch((e: Error) => { window.studio.error = e.message; status(e.message, true); });

async function start() {
  status('Calculating the year…');
  const doc = await fetchYearContaining(site, date);
  const i = annual(doc).findIndex((r) => r.civil_date === date);
  if (i < 0) throw Error(`The calculator's year has no sunrise on ${date}`);
  const a = doc.rows[i].sunrise_jd_ut, b = doc.rows[i + 1].sunrise_jd_ut, offset = offsetOf(doc.rows[i].sunrise_local);
  const local = (jd: number) => localDateTime(jd, site.tz, offset);
  status('Loading the stars…');
  const cat = await loadCatalogue('/sky/', MAG);
  await Promise.all(['300 12px "Plex Mono"', '400 12px "Plex Mono"', '500 12px "Plex Mono"', '500 12px Cormorant', 'italic 12px Cormorant', '400 12px "Plex Cond"', '500 12px "Plex Cond"', '12px Ethiopic']
    .map((f) => document.fonts.load(f, f.includes('Ethiopic') ? GEEZ[4] : 'A')));
  status('');

  const sky = createSky($('sky'), doc, cat, () => undefined);
  sky.setMagLimit(MAG);
  sky.setLayers({ daylight: false, below: true, figures: true, planets: true, portalStars: true, refraction: true, bearing: false });
  sky.setPaths(true);
  const dialSvg = $<SVGSVGElement>('dial'), dial = createDial(dialSvg), stars = cat.stars.filter((s) => s.mag_v <= BRIGHT_MAG), day = dayState(doc, i);
  const events = dayEvents(doc, i), rising = risingWithSun(doc, i, events);

  title(doc, i);
  const bar = dayBar(doc, i, events, local);
  const caption = captions(doc, i, events, rising, local);
  /** The instant of frame f: held at sunrise for the intro, then sunrise to sunrise, then held at the day's end. */
  const jdAt = (f: number) => (f < intro ? a : f < intro + dayFrames ? a + ((b - a) * (f - intro)) / dayFrames : b - 1e-6);

  seekImpl = async (f: number) => {
    f = Math.max(0, Math.min(frames - 1, Math.round(f)));
    const jd = jdAt(f);
    sky.setInstant(jd);
    const sun = sky.info()!.sun;
    const v = viewFor(sun.alt); sky.look(sun.az, v.mid, v.span);
    const s = dialState(doc, jd, stars, 'sun', 0, day);
    dial.update(doc, s);
    const t = local(jd);
    $('clock').textContent = t.time.slice(0, 5);
    $('dates').innerHTML = `<b>${enochText(doc.rows[i].enoch_date)}</b> · ${t.date}`;
    $('daypart').textContent = `PART ${p2(s.time.part)} / 18`;
    bar.at(s.part);
    caption(f);
    thread(sky.toScreen(sun.az, sun.alt), dialSvg.querySelector('[data-body=sun]'));
    await paint();
  };
  await seekImpl(0);
  if (!capture) preview();
}

/** The place, the weekday and the course (they hold all day: the day changes at sunrise). */
function title(doc: YearDoc, i: number) {
  const e = doc.extended[i];
  $('place').textContent = `${site.name} · ${latLon(site)}`;
  $('weekday').textContent = e.weekday_name;
  $('course').textContent = e.course_name;
}

/** The thread: from the Sun in the sky to the Sun on the face, in frame pixels. */
function thread(from: { x: number; y: number } | null, to: Element | null) {
  const fr = $('frame').getBoundingClientRect(), k = fr.width / FRAME_W, r = to?.getBoundingClientRect();
  const on = !!from && !!r;
  for (const id of ['thread-line', 'thread-glow']) {
    const l = $(id); l.setAttribute('visibility', on ? 'visible' : 'hidden');
    if (!on) continue;
    l.setAttribute('x1', String((from!.x - fr.left) / k)); l.setAttribute('y1', String((from!.y - fr.top) / k + 10));
    l.setAttribute('x2', String((r!.left + r!.width / 2 - fr.left) / k)); l.setAttribute('y2', String((r!.top - fr.top) / k - 2));
  }
}

/** The day bar: sunrise to sunrise, daylight gold, a tick per part, each rising above the line and each setting below it, and a
 *  playhead at the instant. */
function dayBar(doc: YearDoc, i: number, events: DayEvent[], local: (jd: number) => { time: string }) {
  const svg = $<SVGSVGElement>('bar'), W = svg.clientWidth || 496, X = (p: number) => 4 + (p / 18) * (W - 8), Y = 16, dp = doc.extended[i].day_parts;
  const hm = (jd: number) => local(jd).time.slice(0, 5);
  const marks = events.filter((e) => e.body !== 'Sun').map((e) => e.kind === 'rise'
    ? `<circle cx="${X(e.part)}" cy="${Y - 7}" r="2.3" fill="${e.color}"/>`
    : `<circle cx="${X(e.part)}" cy="${Y + 7}" r="2" fill="none" stroke="${e.color}" stroke-width="1"/>`).join('');
  const ticks = Array.from({ length: 19 }, (_, p) => `<line x1="${X(p)}" x2="${X(p)}" y1="${Y - (p % 6 ? 2 : 4)}" y2="${Y + (p % 6 ? 2 : 4)}" stroke="#635d51" stroke-width="0.8"/>`).join('');
  svg.innerHTML = `
    <line x1="${X(0)}" x2="${X(18)}" y1="${Y}" y2="${Y}" stroke="#4b6268" stroke-width="1.5"/>
    <line x1="${X(0)}" x2="${X(dp)}" y1="${Y}" y2="${Y}" stroke="#d6b26a" stroke-width="2.5"/>
    ${ticks}${marks}
    <text x="${X(0)}" y="${Y + 20}">SUNRISE ${hm(doc.rows[i].sunrise_jd_ut)}</text>
    <text x="${X(dp)}" y="${Y + 20}" text-anchor="middle">SUNSET ${hm(doc.extended[i].sunset_jd_ut)}</text>
    <text x="${X(18)}" y="${Y + 20}" text-anchor="end">SUNRISE ${hm(doc.rows[i + 1].sunrise_jd_ut)}</text>
    <g id="bar-head"><line y1="${Y - 9}" y2="${Y + 9}" stroke="${SUN_COLOR}" stroke-width="1.6"/><path d="M-4 ${Y - 13}h8l-4 4z" fill="${SUN_COLOR}"/></g>`;
  const head = svg.querySelector('#bar-head')!;
  return { at(part: number) { head.setAttribute('transform', `translate(${X(Math.min(18, part)).toFixed(2)} 0)`); } };
}

/** The captions: each event as the day reaches it, for a few seconds; on the intro the day's title, and at the end the summary. */
function captions(doc: YearDoc, i: number, events: DayEvent[], rising: ReturnType<typeof risingWithSun>, local: (jd: number) => { time: string }) {
  const e = doc.extended[i], hm = (jd: number) => local(jd).time.slice(0, 5), box = $('caps');
  const mins = (m: number) => { const n = Math.round(Math.abs(m)); return n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`; };
  const near = new Map(rising.map((r) => [r.jd, r.offset]));
  let op = 1;                                                      // the caption being written's opacity (its fade)
  const line = (who: string, color: string, jd: number, note = '') => `<div class="cap" style="--c:${color};opacity:${op.toFixed(3)}"><b>${who}</b><time>${hm(jd)}</time>${note ? `<span>${note}</span>` : ''}</div>`;
  const c = doc.calculation, alt = (jd: number) => { const a = skyFrame(jd, c.latitude, c.longitude_east, c.elevation_m).sun.alt; return `${a < 0 ? '−' : ''}${Math.abs(a).toFixed(1)}°`; };
  const text = (v: DayEvent) => {
    if (v.body === 'Sun') return v.kind === 'rise' ? line('Sunrise', v.color, v.jd, `in portal ${e.portal} · ${doc.rows[i].azimuth_deg.toFixed(1)}°`)
      : v.kind === 'set' ? line('Sunset', v.color, v.jd, `at ${e.sunset_azimuth_deg.toFixed(1)}° · ${e.day_parts.toFixed(2)} parts of daylight`)
      : line(v.kind === 'noon' ? 'Midday' : 'Midnight', v.color, v.jd, `the Sun at its ${v.kind === 'noon' ? 'highest' : 'lowest'} · ${alt(v.jd)}`);
    const off = near.get(v.jd);
    return line(`${v.body} ${v.kind === 'rise' ? 'rises' : 'sets'}`, v.color, v.jd, off === undefined ? '' : `${mins(off)} ${off < 0 ? 'before' : 'after'} the Sun`);
  };
  /** The frame each event is reached on, and how long it shows: sunrise from the first frame, through the intro. */
  const at = (v: DayEvent) => (v.part === 0 ? 0 : intro + (v.part / 18) * dayFrames);
  const life = (v: DayEvent) => CAPTION_S + (v.part === 0 ? intro / fps : 0);
  const daylight = Math.round((e.sunset_jd_ut - doc.rows[i].sunrise_jd_ut) * 1440);
  const summary = [
    `<div class="cap title"><b>Sunrise to sunrise · ${site.name}</b></div>`,
    `<div class="cap sum"><span>Daylight</span><time>${Math.floor(daylight / 60)} h ${daylight % 60} min</time><span>· ${e.day_parts.toFixed(2)} of 18 parts · portal ${e.portal}</span></div>`,
    rising.length ? `<div class="cap sum"><span>Rising with the Sun</span>${rising.map((r) => `<b style="--c:${r.color}">${r.body}</b><time>${r.offset < 0 ? '−' : '+'}${mins(r.offset)}</time>`).join('')}</div>`
      : `<div class="cap sum"><span>No planet rises within two hours of the Sun</span></div>`,
  ].join('');
  let shown = '';
  return (f: number) => {
    let html: string;
    if (f >= intro + dayFrames) html = summary;
    else html = events.map((v) => ({ v, age: (f - at(v)) / fps })).filter(({ v, age }) => age >= 0 && age < life(v)).slice(-CAPTIONS)
      .map(({ v, age }) => { op = Math.min(1, v.part === 0 ? 1 : age / FADE_IN_S, (life(v) - age) / FADE_OUT_S); return text(v); }).join('');
    if (html !== shown) { box.innerHTML = html; shown = html; }
  };
}

/** The preview: the frame scaled to the window, play and scrub (the recording drives seek itself). */
function preview() {
  const scrub = $<HTMLInputElement>('scrub'), play = $<HTMLButtonElement>('play'), readout = $('readout');
  scrub.max = String(frames - 1);
  const fit = () => document.body.style.setProperty('--s', String(Math.min(1, (innerHeight - 90) / 960, (innerWidth - 32) / FRAME_W)));
  fit(); addEventListener('resize', fit);
  let frame = 0, playing = false, busy = false, t0 = 0, f0 = 0;
  const show = async (f: number) => { busy = true; frame = f; scrub.value = String(f); readout.textContent = `${p2(Math.floor(f / fps / 60))}:${p2(Math.floor(f / fps) % 60)} · frame ${f + 1} / ${frames}`; await window.studio.seek(f); busy = false; };
  const tick = (now: number) => {
    if (!playing) return;
    if (!busy) { const f = f0 + Math.floor(((now - t0) / 1000) * fps); if (f >= frames) { t0 = now; f0 = 0; show(0); } else if (f !== frame) show(f); }
    requestAnimationFrame(tick);
  };
  const toggle = () => { playing = !playing; play.textContent = playing ? '❚❚' : '▶'; if (playing) { t0 = performance.now(); f0 = frame; requestAnimationFrame(tick); } };
  play.onclick = toggle;
  scrub.oninput = () => { if (playing) toggle(); show(Number(scrub.value)); };
  addEventListener('keydown', (ev) => { if (ev.key === ' ') { ev.preventDefault(); toggle(); } });
  show(0);
}
