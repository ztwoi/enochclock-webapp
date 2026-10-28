// The Studio: the recording frame for The Day (src/day/view.ts, the app's #day view): one Enoch day, sunrise to sunrise, drawn as
// the frames of a 9:16 video. The drawing is The Day's, at a fixed size, under a title (the place, the weekday and course, the
// clock); the frames are stepped by scripts/day-video.mjs. Not linked from the app.
//
// From the URL: ?date=YYYY-MM-DD (the civil date of the day's sunrise; default today at the site)
//   &site=jerusalem (a preset: san-francisco, jerusalem, sydney, london) or &lat=&lon=&elev=&tz=&name=
//   &seconds=40 (sunrise to sunrise) &fps=30 &intro=1 &hold=3 (seconds held at sunrise, and on the closing summary)
//   &capture=1: the frame alone, 1:1, no controls (the recording).
// For a script: window.studio = { ready, frames, fps, seek(frame) }; seek resolves once the frame is painted.
import '../theme.css';
import '../fonts.css';
import '../dial/face.css';
import './studio.css';
import { FALLBACK, PRESETS, fetchYearContaining } from '../api';
import { enochText, localDateTime, offsetOf } from '../dates';
import { enochTime } from '../dial/state';
import { annual, GEEZ, partOfDay } from '../model';
import { loadCatalogue } from '../sky/catalogue';
import type { Site } from '../types';
import { createDayView, type Geometry } from '../day/view';

/** The frame (CSS pixels); recorded at 2×. */
const FRAME_W = 540, FRAME_H = 960;
/** The drawing in the frame: the sky under the title, the dial a little wider than the frame, its lower part off the edge. */
const GEOMETRY: Geometry = { side: false, sky: { x: 0, y: 104, w: FRAME_W, h: 400 }, dial: { cx: FRAME_W / 2, cy: 800, d: 600 }, foot: { x: 0, y: FRAME_H - 132, w: FRAME_W, h: 132 } };
/** Stars drawn in the Sky (the app's default). A caption shows this many seconds of the video. */
const MAG = 6.5, CAPTION_S = 2.2;

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
const seconds = num('seconds', 40), fps = num('fps', 30), dayFrames = Math.round(seconds * fps), intro = Math.round(num('intro', 1) * fps), hold = Math.round(num('hold', 3) * fps);
const frames = intro + dayFrames + hold, capture = P.get('capture') === '1';
document.body.classList.toggle('capture', capture);
/** The preview scales the frame to the visible window (a phone's layout width can be wider than what shows). */
const fit = () => { const w = Math.min(innerWidth, visualViewport?.width ?? innerWidth), h = Math.min(innerHeight, visualViewport?.height ?? innerHeight);
  document.body.style.setProperty('--s', String(Math.min(1, (h - 90) / FRAME_H, (w - 24) / FRAME_W))); };
if (!capture) { fit(); addEventListener('resize', fit); }

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
  status('Loading the stars…');
  const cat = await loadCatalogue('/sky/', MAG);
  await Promise.all(['300 12px "Plex Mono"', '400 12px "Plex Mono"', '500 12px "Plex Mono"', '500 12px Cormorant', 'italic 12px Cormorant', '400 12px "Plex Cond"', '500 12px "Plex Cond"', '12px Ethiopic']
    .map((f) => document.fonts.load(f, f.includes('Ethiopic') ? GEEZ[4] : 'A')));
  status('');

  // a caption shows CAPTION_S seconds of the video: that many parts of the day at its pace
  const view = createDayView($('day'), doc, cat, { geometry: () => GEOMETRY, mag: MAG, captionParts: (CAPTION_S / seconds) * 18 });
  const e = doc.extended[i];
  $('place').textContent = `${site.name} · ${latLon(site)}`;
  $('weekday').textContent = e.weekday_name;
  $('course').textContent = e.course_name;
  /** The instant of frame f: held at sunrise for the intro, then sunrise to sunrise, then held at the day's end. */
  const jdAt = (f: number) => (f < intro ? a : f < intro + dayFrames ? a + ((b - a) * (f - intro)) / dayFrames : b - 1e-6);

  seekImpl = async (f: number) => {
    f = Math.max(0, Math.min(frames - 1, Math.round(f)));
    const jd = jdAt(f), t = localDateTime(jd, site.tz, offset);
    view.setSummary(f >= intro + dayFrames);
    view.draw(jd);
    $('clock').textContent = t.time.slice(0, 5);
    $('dates').innerHTML = `<b>${enochText(doc.rows[i].enoch_date)}</b> · ${t.date}`;
    $('daypart').textContent = `PART ${p2(enochTime(partOfDay(doc, i, jd)).part)} / 18`;
    await paint();
  };
  await seekImpl(0);
  if (!capture) preview();
}

/** The preview: the frame scaled to the window, play and scrub (the recording drives seek itself). */
function preview() {
  const scrub = $<HTMLInputElement>('scrub'), play = $<HTMLButtonElement>('play'), readout = $('readout');
  scrub.max = String(frames - 1);
  let frame = 0, playing = false, busy = false, t0 = 0, f0 = 0;
  const show = async (f: number) => { busy = true; frame = f; scrub.value = String(f); readout.textContent = `${p2(Math.floor(f / fps / 60))}:${p2(Math.floor(f / fps) % 60)}`; await window.studio.seek(f); busy = false; };
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
