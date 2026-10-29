// Application shell: one time cursor (an elapsed sunrise of the loaded Enoch year)
// shared by every view, the inspector, the transport and the observer.
import './theme.css';
import './fonts.css';
import {disposeCalculator,onCalculatorProgress} from './calculator/provider';
import {mountOffline,setCalcBusy} from './pwa/ui';
import {watchHomeScreen} from './pwa/homescreen';
import {mountLegal} from './legal';
import {mountFeedback} from './feedback';
import './feedback.css';
import {registerServiceWorker} from './pwa/register';
import {pruneStaleVersions,verifyInstalled} from './pwa/install';
import './style.css';
import { browserZone, deviceSite, FALLBACK, fetchInstant, fetchDeep, fetchDeepSeries, fetchEnochYear, fetchGregorianYear, fetchYearContaining, PRESETS, saveSite, savedSite } from './api';
import { accuracyFlag, accuracySection } from './accuracy';
import { failMessage, onPermissionChange, permissionState, type FailKind, type PermState } from './geo/location';
import { enochText, isoFromJd, localDateTime, readDate, YEAR_MAX, YEAR_MIN, yearOf } from './dates';
import { createDeep, type Deep } from './deep';
import { deepPanel, skyPanel, skyReading } from './inspector';
import { cycleStrip } from './cycleui';
import { annual, cursorRow, dayIndexAt, fmt, jdFromMs, partOfDay } from './model';
import { headClearance, layoutChanged, setHeadClearance } from './stage';
import type { DeepDoc, Site, YearDoc } from './types';
import { loadCatalogue } from './sky/catalogue';
import { jdOfPart } from './sky/instrument';
import { createTransport } from './transport';
import { createSheet } from './sheet';
import { guaranteeTaps } from './taps';
import { createSky, followable, sameBody, type Catalogue, type Followed, type Side, type Sky } from './skyview';
import { createSkyCompass } from './sky/compassmode';
import { hub } from './compass/hub';
import { createFocus } from './focus';
import { enochTime } from './dial/state';
import { createDialView, loadSky as dialSky, type DialView } from './dial/view';
import { createFilm } from './film';
import { createDayView, dayPanel, geometryFor, type DayView } from './day/view';
import { createFollow, type Follow } from './day/follow';
import { createAtlas, LAYERS as ATLAS_LAYERS, type Atlas, type Camera as AtlasCamera, type Layers as AtlasLayers } from './atlas/view';
import { atlasPanel } from './atlas/panel';

type View = 'sky' | 'dial' | 'day' | 'atlas' | 'deep';
/** The tabs, in their order (the number keys follow it). */
const ORDER: View[] = ['sky', 'dial', 'day', 'atlas', 'deep'];
const VIEWS: Record<View, { name: string; title: string; quote: string; ref?: string; foot: [string, string] }> = {
  sky: { name: 'Sky', title: '', quote: '72:3 stars', ref: '72:3', foot: ['Click a star.', ''] },
  deep: { name: 'Deep Time', title: 'Thirty thousand years of Day 1', quote: '72:1',
    foot: ['Years: astronomical numbering. Click a year to open it.', 'Envelope = min–max per 100 years'] },
  dial: { name: 'The Dial', title: '', quote: '72:1', foot: ['', ''] },
  day: { name: 'The Day', title: '', quote: '72:1', foot: ['', ''] },
  atlas: { name: 'Atlas', title: '', quote: '72:1', foot: ['The site is under the crosshair. Scroll or pinch to zoom; a double-click shows the whole Earth.', 'Today\'s coastlines · Natural Earth 1:50m'] },
};
/** The views with a time of day: played by degrees, drawn at the part of the day. */
const timed = (v: View) => v === 'sky' || v === 'dial' || v === 'day' || v === 'atlas';
const DEEP_HALF_WINDOW = 350;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const state = {
  site: FALLBACK as Site, doc: null as YearDoc | null, cursor: 0, nowIndex: -1, view: 'sky' as View,
  deep: null as Deep | null, deepDoc: null as DeepDoc | null,
  sky: null as Sky | null, cat: null as Catalogue | null, part: 0,
  dial: null as DialView | null, next: null as YearDoc | null,
  /** The Day: the Sky and the Dial together (src/day/view.ts), built when first shown, rebuilt per year and site. */
  day: null as DayView | null,
  /** Atlas: the instant seen from outside the Earth (src/atlas/view.ts), built when first shown; it does not depend on the year. */
  atlas: null as Atlas | null,
  /** Following the present (Now, as on the Dial): the day and, in Sky, the part of the day keep up with the clock. */
  live: false,
};
/** Any move of the reader's own (a step, play, a jump, a pick) leaves the present. */
const manual = () => { state.live = false; };
const DAYS_PER_SECOND = 2;                      // at 1×, two days a second (day playback only; degrees unchanged)
const YEARS_PER_SECOND = 1;                     // Deep Time at 1×: a year a second
/** Year playback (Deep Time): the year in play, gliding (NaN when not playing by year). The marker moves with it every
 *  frame; the app loads the year it has reached as fast as the calculator answers, and the exact one on pause. */
let playYear = NaN, yearLoading = false;
/** The year Deep Time marks: the one in play, else the loaded one. */
const deepYear = () => (isFinite(playYear) ? Math.round(playYear) : firstYear());
const DEGREES_PER_SECOND = 15;                  // at 1×: 1° = 1/360 of sunrise to sunrise = 1/20 of a part
let crossing = false;                            // waiting for the neighbouring Enoch year while playing across the boundary
const tp = createTransport($('tp'), {
  onStep: (m, dir) => { manual(); if (m === 'year') stepYear(dir); else if (m === 'day') step(dir); else stepDegree(dir); },
  onChange: () => {
    if (tp.mode === 'year') { if (!isFinite(playYear) && state.doc) playYear = firstYear(); }
    else if (isFinite(playYear)) {                                  // year playback stopped: settle on the year it reached
      const y = Math.round(playYear); playYear = NaN;
      if (state.doc && y !== firstYear()) load({ year: y }, 'start'); else state.deep?.setYear(firstYear());
    }
    if (tp.mode) manual();
    if (tp.mode === 'degree' || (!tp.mode && state.view !== 'dial')) state.cursor = Math.round(state.cursor);   // the Dial pauses where it is, mid-glide
    update();
  },
});
let shown = { i: -1, doc: null as YearDoc | null, view: '' as View | '', part: -1, sel: 0 };
let selSerial = 0;
const firstYear = () => state.doc!.calculation.year_beginning_gregorian;

// ---------------------------------------------------------------- loading
/** The latest load wins: an earlier one that answers after it is dropped (year playback overlaps them). */
let loadSeq = 0;
/** `quiet`: no "Calculating" notice, only the calculator icon's pulse (playback loads a year after year; a year turning must not cover the view). */
async function load(by: { date: string } | { enochYear: number } | { year: number }, cursor?: 'today' | 'start' | 'end', quiet = false) {
  const status = $('status'), seq = ++loadSeq;
  if (!quiet) { status.className = 'status'; status.textContent = 'Calculating the year…'; status.hidden = false; }
  $('stage').setAttribute('aria-busy', 'true'); setCalcBusy(true);
  try {
    const pre = 'enochYear' in by && state.next && sameSite(state.next) && state.next.calculation.enoch_year === by.enochYear ? state.next : null;   // the Dial's prefetched next year
    const doc = pre ?? ('date' in by ? await fetchYearContaining(state.site, by.date) : 'year' in by ? await fetchGregorianYear(state.site, by.year) : await fetchEnochYear(state.site, by.enochYear));
    if (seq !== loadSeq) return;
    state.doc = doc;
    $('stage').classList.remove('calculation-failed');
    const days = annual(doc);
    state.nowIndex = dayIndexAt(doc, jdFromMs(Date.now()));
    state.cursor = cursor === 'end' ? days.length - 1 : cursor === 'today' && state.nowIndex >= 0 ? state.nowIndex : 0;
    if (state.sky) { state.sky.dispose(); state.sky = null; }
    if (state.day) { state.day.dispose(); state.day = null; }
    if (state.view === 'sky') await ensureSky();                  // other views build the Sky (and The Day) when it is opened (setView), not on every year load
    if (state.view === 'day') await ensureDay();
    if (state.deep || state.view === 'deep') await syncDeep();
    if (seq !== loadSeq) return;
    if (state.view === 'dial') ensureStars();
    status.hidden = true; $('stage').setAttribute('aria-busy', 'false');
    update();
  } catch (e) {
    if (seq !== loadSeq) return;
    $('stage').setAttribute('aria-busy', 'false');
    state.doc = null; state.next = null; state.live = false;
    $('stage').classList.add('calculation-failed');
    $('when').textContent = 'No valid year loaded';
    status.hidden = false; status.className = 'status error';
    $('insp').innerHTML = `<div class="section"><div class="eyebrow">No year loaded</div><p class="note">The calculator needs a sunrise every day of the year at this site.</p><p style="margin-top:14px"><button class="btn on" id="pick-site">Choose another site</button></p></div>`;
    $('pick-site').onclick = () => $('site-chip').click();
    tp.pause(); crossing = false;
    status.textContent = `The calculator refused this year: ${(e as Error).message}`;
  } finally { setCalcBusy(false); }
}

/** The catalogue loads once (119,625 schema-checked stars); the view is rebuilt per year/site. */
async function ensureSky() {
  if (!state.doc) return;
  if (!state.cat) { $('status').className = 'status'; $('status').hidden = false; $('status').textContent = 'Loading the catalogue stars…'; state.cat = await loadCatalogue('/sky/', Number($<HTMLSelectElement>('mag').value)); }
  if (!state.sky) {
    state.sky = createSky($('view-sky'), state.doc, state.cat, () => { selSerial++; shown.sel = -1; update(); });
    state.sky.onUser(() => { if (compassFollowing) { compassFollowing = false; compassChanged(); } });   // a hand on the panorama takes the view from the compass
    skyFollow = createFollow(state.sky, skyFollow?.target ?? null, syncSide, skyFollow?.k);   // and from the body it follows (a new year or site keeps following it, at its zoom)
    state.sky.stage.onView(syncSide);
    if (startSide) { state.sky.recentre(startSide); startSide = null; }
    state.sky.setBearingHold(skyCompass.on && compassFollowing); syncSide();
    state.sky.setMagLimit(Number($<HTMLSelectElement>('mag').value)); state.sky.setLayers(skyLayers()); state.sky.setPaths(on('paths'));
  }
}

/** The Day, on the catalogue Sky loads: its sky follows the star limit, its face the Dial tab's sky settings; its options are the buttons under the title. */
async function ensureDay() {
  if (!state.doc) return;
  if (!state.cat) { $('status').className = 'status'; $('status').hidden = false; $('status').textContent = 'Loading the catalogue stars…'; state.cat = await loadCatalogue('/sky/', Number($<HTMLSelectElement>('mag').value)); }
  if (!state.day) {
    state.day = createDayView($('view-day'), state.doc, state.cat, {
      geometry: (w, h) => geometryFor(w, h, headClearance()),
      mag: Number($<HTMLSelectElement>('mag').value),
      onScrub: (p) => { manual(); tp.pause(); state.part = p; update(); },   // a hand on the day bar
      onFollow: (f) => setOn('day-follow', f),
    });
    state.day.setDaylight(on('day-daylight')); state.day.setCaptions(on('day-captions')); state.day.setFollow(on('day-follow'));
  }
  state.day.setDialSky(dialSky());                                 // the face as the Dial tab has it (its settings change only there)
}

/** The Dial's stars: the same catalogue as Sky's, loaded without holding up the face. */
function ensureStars() {
  if (state.cat) { state.dial!.setCatalogue(state.cat); return; }
  loadCatalogue('/sky/', Number($<HTMLSelectElement>('mag').value)).then((c) => { state.cat = c; state.dial!.setCatalogue(c); }).catch(() => state.dial!.setCatalogue({ stars: [], segments: [] }))   // the face works without stars
    .finally(() => update());
}
/** Atlas, built when first shown. Its stars are the catalogue's (loaded for it if no other view has). */
function ensureAtlas() {
  if (!state.atlas) {
    state.atlas = createAtlas($('view-atlas'), () => state.cat, { headClearance });
    state.atlas.setLayers(atlasLayers()); state.atlas.setCamera(atlasCamera);
  }
  if (!state.cat) loadCatalogue('/sky/', Number($<HTMLSelectElement>('mag').value)).then((c) => { state.cat ??= c; update(); }).catch(() => undefined);   // the globe works without stars
}
const sameSite = (d: YearDoc) => d.calculation.latitude === state.site.lat && d.calculation.longitude_east === state.site.lon && d.calculation.elevation_m === state.site.elev && d.calculation.timezone === state.site.tz;
let nextLoading = false;
/** The next Enoch year, fetched near the year's end: the Dial glides into it without waiting. */
function prefetchNext() {
  const doc = state.doc!, y = doc.calculation.enoch_year + 1;
  if (nextLoading || (state.next && sameSite(state.next) && state.next.calculation.enoch_year === y)) return;
  nextLoading = true;
  fetchEnochYear(state.site, y).then((d) => { if (state.doc === doc) state.next = d; }).catch(() => undefined).finally(() => { nextLoading = false; });
}
/** The Dial at the app's instant: day i at the part of the day, gliding toward tomorrow while playing by days. */
function renderDial() {
  const doc = state.doc!, n = annual(doc).length, c = Math.max(0, state.cursor), i = Math.min(n - 1, Math.floor(c));
  state.dial!.render({ doc, i, part: state.part, frac: Math.min(1, c - i), next: state.next });
  if (i >= n - 3) prefetchNext();
}

/** Deep Time follows the loaded year; its per-year window is refetched when the year leaves it. */
async function syncDeep() {
  if (!state.doc) return;
  const y = deepYear(), w = state.deepDoc?.window;
  if (!state.deepDoc || !w || y < w.start || y > w.end) {
    const lo = y - DEEP_HALF_WINDOW;                              // the data covers 30,000 years: the window is clipped to them
    state.deepDoc = await fetchDeep(lo, lo + 2 * DEEP_HALF_WINDOW);
    if (state.deep) { state.deep.setYear(y, state.deepDoc.window); deepCycle(); return; }
  }
  if (!state.deep) {
    const series = await fetchDeepSeries();                         // every annual start, once: the plot zooms without asking again
    state.deep = createDeep($('view-deep'), state.deepDoc!, series, y, { onPick: pickYear, onRange: (note) => { if (state.view === 'deep') $('foot-b').textContent = note; } });
  }
  else state.deep.setYear(y);
  deepCycle();
}
/** Highlight the loaded year's 294-year cycle (from the calculator's cycle block). */
function deepCycle() {
  const doc = state.doc; if (!doc || !state.deep) return;
  const c = doc.cycle.cycles.find((x) => x.ordinal === doc.extended[0].cycle);
  state.deep.setCycle(c ? { ordinal: c.ordinal, start: yearOf(c.start_date), end: yearOf(c.end_date) } : null);
}

// ---------------------------------------------------------------- picks from views
/** Open the Enoch year whose Day 1 falls in this Gregorian year. */
function pickYear(year: number) { manual(); tp.pause(); load({ year }, 'start'); }

// ---------------------------------------------------------------- rendering
function update() {
  const doc = state.doc; if (!doc) return;
  const days = annual(doc), { i } = cursorRow(days, state.cursor), r = days[i];
  if (state.sky && state.view === 'sky') {
    state.sky.setInstant(jdOfPart(doc.rows[i].sunrise_jd_ut, doc.rows[i + 1].sunrise_jd_ut, state.part));
    skyFollow?.aim();                                                // as The Day's sky: the horizon and the body followed in view, at the reader's zoom
  }
  syncReading();                                                   // Sky's reading keeps up with the instant (and leaves with the view)
  if (state.view === 'sky' || state.view === 'deep') ({ deep: state.deep, sky: state.sky }[state.view])?.render();
  if (state.view === 'dial') renderDial();
  if (state.view === 'day') state.day?.draw(jdOfPart(doc.rows[i].sunrise_jd_ut, doc.rows[i + 1].sunrise_jd_ut, state.part));
  if (state.view === 'atlas') state.atlas?.draw(jdOfPart(doc.rows[i].sunrise_jd_ut, doc.rows[i + 1].sunrise_jd_ut, state.part), { lat: doc.calculation.latitude, lon: doc.calculation.longitude_east, name: state.site.name });
  $('when').innerHTML = `<div class="w1"><b>${enochText(r.enoch_date)}</b> <span class="course-chip">${doc.extended[i].course_name}</span>${accuracyFlag(doc.accuracy)}</div><div class="w2" id="when-t"></div>`;
  clock();
  $('now').classList.toggle('on', state.live); $('now').setAttribute('aria-pressed', String(state.live));
  cycleStrip($('cycle-track') as unknown as SVGSVGElement, doc, i);
  const morning = state.view !== 'dial' && (i !== shown.i || doc !== shown.doc || state.view !== shown.view), moved = (state.view === 'sky' || state.view === 'atlas') && (state.part !== shown.part || shown.sel !== selSerial);
  if (morning || moved) {                                          // once per morning, and in Sky as the part moves
    const now = performance.now(), only = !morning && shown.sel === selSerial;   // only the part moved: while it runs, a few times a second (a trailing one when it stops)
    if (only && now - panelAt < PANEL_MS) { panelTimer ||= window.setTimeout(() => { panelTimer = 0; update(); }, PANEL_MS - (now - panelAt)); }
    else { clearTimeout(panelTimer); panelTimer = 0; panelAt = now; inspector(doc, i); shown = { i, doc, view: state.view, part: state.part, sel: selSerial }; }
  }
  document.title = `Enoch ${r.enoch_date} · ${VIEWS[state.view].name}`;
}

/** The details panel is rebuilt as the part of the day runs at most every PANEL_MS: a frame's worth of markup is no use to a reader at 60 a second. */
const PANEL_MS = 120; let panelAt = 0, panelTimer = 0;
function inspector(doc: YearDoc, i: number) {
  const el = $('insp'), acc = accuracySection(doc.accuracy, { stars: state.view === 'sky' || state.view === 'day' });           // every view: how far to trust this year
  if (state.view === 'deep') { el.innerHTML = (state.deepDoc ? deepPanel(state.deepDoc, firstYear(), doc, i) : '') + acc; return; }
  if (state.view === 'atlas') { el.innerHTML = atlasPanel(doc, i, state.atlas?.info() ?? null, state.site.name) + acc; return; }
  if (state.view === 'day') { const d = state.day?.day(); el.innerHTML = (d && d.i === i ? dayPanel(doc, i, d.events, d.rising) : '') + acc; return; }
  el.innerHTML = (skyCompass.on ? skyCompass.html({ name: state.site.name, lat: doc.calculation.latitude, lon: doc.calculation.longitude_east, jd: state.sky?.info()?.jd ?? doc.rows[i].sunrise_jd_ut, date: annual(doc)[i].civil_date, year: doc.calculation.year_beginning_gregorian, tz: doc.calculation.timezone }) : '') + skyPanel(doc, i, state.part, state.sky?.info() ?? null) + acc;
}

/** The when line's clock: Enoch time (part : degree 1–20 : minute 1–60 : second 1–4) and the Gregorian date and time
 *  at the site. Following Now, the present; otherwise the moment the view draws (sunrise; in Sky, the chosen part). */
function clock() {
  const doc = state.doc, el = document.getElementById('when-t'); if (!doc || !el) return;
  const { i } = cursorRow(annual(doc), state.cursor);
  const jd = state.live ? jdFromMs(Date.now()) : jdOfPart(doc.rows[i].sunrise_jd_ut, doc.rows[i + 1].sunrise_jd_ut, timed(state.view) ? state.part : 0);
  const k = state.live ? dayIndexAt(doc, jd) : i; if (k < 0) return;
  const t = enochTime(partOfDay(doc, k, jd)), g = localDateTime(jd, doc.calculation.timezone, fmt.offset(doc.rows[k].sunrise_local));
  el.innerHTML = `<span class="et" data-k="enoch-time">${t.part}:${t.deg}:${t.min}:${t.sec}</span> · <span data-k="greg-time">${g.date} ${g.time}</span><span class="gw"> Gregorian</span>`;
}

/** Follow the present: today's Enoch day (its year loaded when needed) and, in Sky, the present part of the day. */
async function goNow() {
  tp.pause();
  if (!state.doc || dayIndexAt(state.doc, jdFromMs(Date.now())) < 0) await load({ date: localISODate() }, 'today');
  const doc = state.doc, jd = jdFromMs(Date.now()), k = doc ? dayIndexAt(doc, jd) : -1;
  if (!doc || k < 0) return;
  state.live = true; state.cursor = k; state.part = partOfDay(doc, k, jd);
  update();
}
/** Each second: the clock; while following Now, the day at sunrise and (in Sky) the drawing once an Enoch minute (4 s). */
function tick() {
  tickNow();
  const doc = state.doc;
  if (!state.live || !doc || crossing) return;
  const jd = jdFromMs(Date.now()), k = dayIndexAt(doc, jd);
  if (k < 0) { crossing = true; goNow().finally(() => { crossing = false; }); return; }   // the Enoch year has turned
  let moved = k !== Math.round(state.cursor);
  if (moved) state.cursor = k;
  if (state.view === 'sky') { const p = partOfDay(doc, k, jd); if (moved || Math.floor(p * 1200) !== Math.floor(state.part * 1200)) { state.part = p; moved = true; } }
  if (state.view === 'dial' || state.view === 'day') { state.part = partOfDay(doc, k, jd); moved = true; }   // the Dial's hands move every second
  if (moved) update(); else clock();
}

/** Live part of the current Enoch day (equal parts between this sunrise and the next). */
function tickNow() {
  const doc = state.doc, el = document.getElementById('now-part');
  if (!doc || !el) return;
  const jd = jdFromMs(Date.now()), k = dayIndexAt(doc, jd);
  state.nowIndex = k;
  el.textContent = k < 0 ? 'outside this Enoch year' : `${annual(doc)[k].enoch_date} · part ${partOfDay(doc, k, jd).toFixed(4)} / 18`;
  el.className = k < 0 ? '' : 'cal';
}


// ---------------------------------------------------------------- views
/** Sky's compass mode: the panorama all around turns with the device (src/sky/compassmode.ts). */
const skyCompass = createSkyCompass((h) => { if (state.view === 'sky' && compassFollowing) state.sky?.turn(h); skyCompass.tick($('insp')); }, compassChanged);
/** The compass turns the panorama only while following: a drag, a swipe, East or West pauses it (the sensor keeps running); Compass resumes. */
let compassFollowing = false, startSide: Side | null = 'east';   // the first Sky opens turned to the east
/** Sky follows a body (the Sun button, or the Follow button over the sky for the body selected): it turns and opens out with it, as
 *  The Day's sky, and a zoom meanwhile is its multiplier (src/day/follow.ts); a drag, East, West or Compass stops it. One per Sky (rebuilt with it). */
let skyFollow: Follow | null = null;
const sunFollowing = () => skyFollow?.target?.kind === 'sun';
/** Follow a body (null: stop); the compass, if leading, stands aside. */
function followBody(b: Followed | null) {
  skyFollow?.set(b);
  if (b && compassFollowing) { compassFollowing = false; compassChanged(); }
  syncSide();
}
/** Sky's reading under its options (src/inspector.ts skyReading): the selection, or the body followed, with its Follow toggle. */
function syncReading() {
  const el = $('sky-read'), html = state.view === 'sky' && state.doc ? skyReading(state.doc, state.sky?.info() ?? null, skyFollow?.target ?? null) : '';
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; layoutChanged(); }   // the title block's height changes with it
  if (el.hidden === !!html) { el.hidden = !html; layoutChanged(); }
}
/** The sensor is the device's, not Sky's: on in the Dial or after a reload, Sky follows it too (when it is shown), and off anywhere is off here. */
function adoptCompass() { if (hub.active && !skyCompass.on && state.view === 'sky') { compassFollowing = true; skyFollow?.set(null); skyCompass.adopt(); syncSide(); } }
hub.onChange(() => { if (hub.active) adoptCompass(); else if (['locating', 'waiting', 'live'].includes(skyCompass.phase)) skyCompass.released(); });   // (a refusal or a start under way answers for itself)
/** East and West light while their portals are the way the view faces. */
function syncSide() {
  const at = skyFollow?.on ? null : state.sky?.sideAt() ?? null;            // following a body, no side's button is lit (the Sun's, when it is the Sun)
  for (const side of ['east', 'west']) { const b = document.querySelector(`[data-facing=${side}]`); if (b && b.classList.contains('on') !== (at === side)) { b.classList.toggle('on', at === side); b.setAttribute('aria-pressed', String(at === side)); } }
  const sb = document.querySelector('[data-facing=sun]'); sb?.classList.toggle('on', sunFollowing()); sb?.setAttribute('aria-pressed', String(sunFollowing()));
  syncReading();
}
let noteTimer = 0;
const focus = createFocus($('app'), $<HTMLButtonElement>('focus'));
state.dial = createDialView($('view-dial'), { title: $('vh-title'), prim: $('vh-prim'), controls: $('dial-controls') }, {
  details: $('insp'), openDetails: () => sheet.open(), narrow: () => sheet.narrow,
  goView: (v) => { if (v in VIEWS) setView(v as View); },
  canOpen: (v) => v in VIEWS,
  explore: (s, date) => { explore(s, date); },
  redraw: () => update(),
  info: () => ({ site: state.site, live: state.live, play: tp.mode === 'day' ? 'days' : tp.mode === 'degree' ? 'degrees' : null, speeds: { degree: tp.speed('degree'), day: tp.speed('day') } }),
});
/** A new observer at local noon of a date, without saving it (the Dial's Sun's-speed presets). */
async function explore(s: Site, date: string) {
  manual(); tp.pause(); state.site = s; siteChip();
  await load({ date }, 'start');
  const doc = state.doc; if (!doc) return;
  const k = Math.max(0, annual(doc).findIndex((r) => r.civil_date === date));
  state.cursor = k; state.part = doc.extended[k].day_parts / 2; update();
}
function compassChanged() {
  const cb = document.querySelector('[data-facing=compass]');
  cb?.classList.toggle('on', skyCompass.on && compassFollowing); cb?.classList.toggle('paused', skyCompass.on && !compassFollowing);
  cb?.setAttribute('aria-pressed', String(skyCompass.on && compassFollowing));
  state.sky?.setBearingHold(skyCompass.on && compassFollowing);
  const note = $('sky-note'), msg = skyCompass.note(), lasting = ['starting', 'locating', 'waiting'].includes(skyCompass.phase);
  clearTimeout(noteTimer); note.textContent = msg; note.hidden = !msg;
  if (msg && !lasting) noteTimer = window.setTimeout(() => { note.hidden = true; }, 8000);   // the panel keeps it
  const card = $('sky-cal'); card.hidden = !skyCompass.cardOpen; card.innerHTML = skyCompass.cardOpen ? skyCompass.cardHtml() : '';
  shown.view = ''; update();
}
/** The views' option rows, wired once (setView runs on every change of view). */
function bindOptions() {
  document.querySelectorAll<HTMLButtonElement>('[data-facing]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.facing as Side | 'compass' | 'sun';
    if (f === 'sun') {                                                                     // follow the Sun, or stop (the view stays where it is)
      followBody(sunFollowing() ? null : { kind: 'sun' });                                 // from the zoom on show (following the Moon or a planet: the Sun instead)
    } else if (f === 'compass') {
      skyFollow?.set(null); syncSide();
      if (!skyCompass.on) { compassFollowing = true; skyCompass.start(); }                // still inside the tap: iOS asks for orientation here
      else if (compassFollowing) { compassFollowing = false; skyCompass.stop(); }          // following: off
      else { compassFollowing = true; compassChanged(); }                                  // paused by a hand: follow again from the next reading
    } else { compassFollowing = false; skyFollow?.set(null); state.sky?.recentre(f); syncSide(); compassChanged(); }   // the view goes to its side; the compass or the Sun, if leading, stands aside
    shown.view = ''; update();
  }));
  // compass calibration, from the card over the sky or the details panel
  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-sky-cal]'); if (!b || b.disabled) return;
    const k = b.dataset.skyCal;
    if (k === 'sun' || k === 'moon') skyCompass.calibrate(k); else if (k === 'later') skyCompass.closeCard();
    else if (k === 'open') skyCompass.openCard(); else if (k === 'clear') skyCompass.useDeclination();
  });
  for (const t of ['pointerdown', 'wheel', 'dblclick'] as const) $('sky-cal').addEventListener(t, (e) => e.stopPropagation());   // the card is not the sky: no pan, zoom or home
  let deepAxis: 'years' | 'days' = 'years';
  document.querySelectorAll<HTMLButtonElement>('[data-deep-axis]').forEach((b) => b.addEventListener('click', () => {
    deepAxis = b.dataset.deepAxis as typeof deepAxis;
    document.querySelectorAll('[data-deep-axis]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-deep-z]').forEach((b) => b.addEventListener('click', () => state.deep?.zoomButton(b.dataset.deepZ as 'in' | 'out' | 'home', deepAxis)));
  $<HTMLSelectElement>('mag').onchange = async (e) => {
    const sel = e.target as HTMLSelectElement, m = Number(sel.value);
    if (state.cat?.extend && m > (state.cat.completeTo ?? Infinity)) {   // the fainter chunks load on demand
      sel.disabled = true; $('status').className = 'status'; $('status').hidden = false; $('status').textContent = `Loading stars to V ≤ ${m}…`;
      try { await state.cat.extend(m); $('status').hidden = true; }
      catch { $('status').className = 'status error'; $('status').textContent = 'The fainter stars could not be loaded; try again.'; sel.value = sel.dataset.prev ?? '6.5'; sel.disabled = false; return; }
      sel.disabled = false;
    }
    sel.dataset.prev = String(m); state.sky?.setMagLimit(m); state.day?.setMagLimit(m); shown.view = ''; update();
  };
  $('refraction').onclick = () => { state.sky?.setLayers({ refraction: toggle('refraction') }); shown.view = ''; update(); };
  $('figures').onclick = () => { state.sky?.setLayers({ figures: toggle('figures') }); };
  $('portal-stars').onclick = () => { state.sky?.setLayers({ portalStars: toggle('portal-stars') }); };
  $('planets').onclick = () => {
    const v = toggle('planets'); state.sky?.setLayers({ planets: v });
    if (!v && skyFollow?.target?.kind === 'planet') skyFollow.set(null);           // a planet no longer drawn is no longer followed
    syncSide(); shown.view = ''; update();
  };
  // the reading's Follow (src/day/follow.ts): follow what it reads (the selection, or the body followed), or stop
  $('sky-read').addEventListener('click', (e) => {
    if (!(e.target as Element).closest('[data-follow]')) return;
    const b = followable(state.sky?.info()?.selection ?? null) ?? skyFollow?.target ?? null;
    followBody(sameBody(b, skyFollow?.target ?? null) ? null : b);
    shown.view = ''; update();
  });
  $('bearing').onclick = () => { const on = toggle('bearing'); localStorage.setItem(BKEY, on ? '1' : '0'); state.sky?.setLayers({ bearing: on }); };
  if (localStorage.getItem(BKEY) === '1') toggle('bearing');                    // Bearing is remembered on the device (off by default)
  $('paths').onclick = () => { const v = toggle('paths'); localStorage.setItem(PKEY, v ? '1' : '0'); state.sky?.setPaths(v); };
  if (localStorage.getItem(PKEY) === '1') toggle('paths');                      // Paths is remembered on the device (off by default)
  $('below').onclick = () => { state.sky?.setLayers({ below: toggle('below') }); shown.view = ''; update(); };
  $('day-follow').onclick = () => { state.day?.setFollow(toggle('day-follow')); };
  $('day-daylight').onclick = () => { state.day?.setDaylight(toggle('day-daylight')); };
  $('day-captions').onclick = () => { state.day?.setCaptions(toggle('day-captions')); };
  $('daylight').onclick = () => { const on = toggle('daylight'); localStorage.setItem(DKEY, on ? '1' : '0'); state.sky?.setLayers({ daylight: on }); };
  if (localStorage.getItem(DKEY) === '0') toggle('daylight');                   // Daylight is remembered on the device (on by default)
  // on a phone, Refraction, Figures, Portal ★, Planets, Daylight, Bearing, Below horizon and Paths sit in the details sheet: one tap away, the row shorter
  const phone = matchMedia('(max-width: 700px)'), place = () => {
    const into = phone.matches ? $('sky-sheet-opts') : $('sky-controls');
    into.append($('refraction'), $('figures'), $('portal-stars'), $('planets'), $('daylight'), $('bearing'), $('below'), $('paths'));   // the row's own order, after the facing and the star limit
    skySheetOpts();
  };
  phone.addEventListener('change', place); place();
}

/** Atlas's camera and layers, remembered on the device. */
const AKEY = 'enoch.atlas.v1';
let atlasCamera: AtlasCamera = 'site';
const atlasLayers = (): AtlasLayers => Object.fromEntries(Object.keys(ATLAS_LAYERS).map((k) => [k, document.querySelector(`[data-atlas-layer=${k}]`)?.classList.contains('on') ?? true])) as unknown as AtlasLayers;
function bindAtlas() {
  try {
    const saved = JSON.parse(localStorage.getItem(AKEY) ?? 'null') as { camera?: AtlasCamera; layers?: Partial<AtlasLayers> } | null;
    if (saved?.camera === 'stars') atlasCamera = 'stars';
    for (const [k, v] of Object.entries(saved?.layers ?? {})) { const b = document.querySelector<HTMLElement>(`[data-atlas-layer=${k}]`); if (b) { b.classList.toggle('on', !!v); b.setAttribute('aria-pressed', String(!!v)); } }
  } catch { /* nothing kept */ }
  const save = () => localStorage.setItem(AKEY, JSON.stringify({ camera: atlasCamera, layers: atlasLayers() }));
  const syncCam = () => document.querySelectorAll<HTMLElement>('[data-atlas-cam]').forEach((b) => { const on = b.dataset.atlasCam === atlasCamera; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  document.querySelectorAll<HTMLButtonElement>('[data-atlas-cam]').forEach((b) => b.addEventListener('click', () => { atlasCamera = b.dataset.atlasCam as AtlasCamera; syncCam(); state.atlas?.setCamera(atlasCamera); save(); update(); }));
  document.querySelectorAll<HTMLButtonElement>('[data-atlas-layer]').forEach((b) => b.addEventListener('click', () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); state.atlas?.setLayers(atlasLayers()); save(); }));
  syncCam();
}
/** The views' tabs on a narrow screen scroll sideways: an arrow at the end that has more (tap: the next ones), and the tab on show kept in view. */
function bindNavScroll() {
  const nav = document.querySelector<HTMLElement>('.nav')!, arrow = (dir: 'l' | 'r') => {
    const b = document.createElement('button'); b.type = 'button'; b.className = `nav-more nav-more-${dir}`; b.hidden = true;
    b.textContent = dir === 'l' ? '‹' : '›'; b.setAttribute('aria-label', dir === 'l' ? 'Earlier views' : 'More views');
    b.addEventListener('click', () => nav.scrollBy({ left: (dir === 'l' ? -1 : 1) * nav.clientWidth * 0.7, behavior: 'smooth' })); return b;
  };
  const L = arrow('l'), Rr = arrow('r'); nav.prepend(L); nav.append(Rr);       // sticky at the bar's ends (style.css)
  const edges = () => { const l = nav.scrollLeft > 2, r = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2; L.hidden = !l; Rr.hidden = !r; nav.classList.toggle('more-l', l); nav.classList.toggle('more-r', r); };
  nav.addEventListener('scroll', edges, { passive: true });
  new ResizeObserver(() => { nav.querySelector('a.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); edges(); }).observe(nav);
  return () => { nav.querySelector('a.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); requestAnimationFrame(edges); };
}
let navShow = () => {};

/** A view has been set up (its title, options, focus and transport): until then, asking for the view already named is no repeat.
 *  The first load draws the opening view (Sky) before start() sets it up, and that must not skip the setting up. */
let viewSetUp = false;
async function setView(v: View, push = true) {
  if (v === state.view && shown.view && viewSetUp) return;
  viewSetUp = true;
  state.view = v;
  $('stage').dataset.view = v;
  const meta = VIEWS[v];
  document.querySelectorAll<HTMLElement>('.view').forEach((n) => n.classList.toggle('on', n.id === `view-${v}`));
  document.querySelectorAll<HTMLAnchorElement>('.nav a[data-view]').forEach((a) => { const on = a.dataset.view === v; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  navShow();
  if (v !== 'dial') { $('vh-title').textContent = meta.title; delete $('vh-title').dataset.h; }   // the Dial writes its own: the weekday and course
  $('vh-prim').hidden = v !== 'dial'; $('dial-controls').hidden = v !== 'dial';
  state.dial?.setActive(v === 'dial');
  $('vh-quote').textContent = v === 'dial' || v === 'sky' || v === 'day' || v === 'atlas' ? '' : state.doc ? `“${state.doc.text.quotes[meta.quote]}” — ${meta.ref ?? meta.quote}` : '';
  $('foot-a').textContent = meta.foot[0]; $('foot-b').textContent = (v === 'deep' && state.deep?.envelopeNote()) || meta.foot[1];
  if (push) history.replaceState(null, '', `${location.search}#${v}`);
  if (v === 'sky' || v === 'deep') ({ deep: state.deep, sky: state.sky }[v])?.stage.resize();   // its title block is now this view's
  $('sky-controls').hidden = v !== 'sky'; skySheetOpts();
  $('day-controls').hidden = v !== 'day';
  $('atlas-controls').hidden = v !== 'atlas';
  layoutChanged();                                                  // the title block and the options row changed: what was measured is stale
  adoptCompass();                                                   // the compass came on elsewhere: Sky follows it from here
  focus.setAvailable(timed(v));                                     // the top bar folds away in Sky, the Dial and The Day
  tp.setDegreeAvailable(timed(v));                                  // only Sky, the Dial and The Day have a time of day
  tp.setYearView(v === 'deep');                                     // Deep Time plays by year
  $('deep-controls').hidden = v !== 'deep';                          // shown in Deep Time's compact layout (style.css)
  if (v === 'sky' && state.doc) {
    $('stage').setAttribute('aria-busy', 'true');
    try { await ensureSky(); $('status').hidden = true; } catch (e) { $('status').className = 'status error'; $('status').hidden = false; $('status').textContent = `Star catalogue unavailable (${(e as Error).message}).`; }
    $('stage').setAttribute('aria-busy', 'false');
  }
  if (v === 'dial' && state.doc) ensureStars();
  if (v === 'atlas') ensureAtlas();
  if (v === 'day' && state.doc) {
    $('stage').setAttribute('aria-busy', 'true');
    try { await ensureDay(); $('status').hidden = true; } catch (e) { $('status').className = 'status error'; $('status').hidden = false; $('status').textContent = `Star catalogue unavailable (${(e as Error).message}).`; }
    $('stage').setAttribute('aria-busy', 'false');
  }
  if (v === 'deep' && state.doc) {
    $('stage').setAttribute('aria-busy', 'true');
    try { await syncDeep(); } catch (e) { $('status').className = 'status error'; $('status').hidden = false; $('status').textContent = `Deep-time data unavailable (${(e as Error).message}).`; }
    $('stage').setAttribute('aria-busy', 'false');
  }
  shown.view = '';
  update();
}

const DKEY = 'enoch.sky.daylight.v1', BKEY = 'enoch.sky.bearing.v1', PKEY = 'enoch.sky.paths.v1';
/** The details sheet's Sky options (a phone's Refraction and Portal ★): shown on Sky only. */
const skySheetOpts = () => { $('sky-sheet-opts').hidden = state.view !== 'sky' || !$('sky-sheet-opts').childElementCount; };
/** Sky as its buttons stand: the view is rebuilt for each year and site, and keeps the reader's choices. */
const skyLayers = () => ({ figures: on('figures'), portalStars: on('portal-stars'), planets: on('planets'), refraction: on('refraction'), daylight: on('daylight'), below: on('below'), bearing: on('bearing') });
const on = (id: string) => $(id).classList.contains('on');
/** Set a layer chip on or off (the app's own change, not a tap). */
const setOn = (id: string, v: boolean) => { const b = $(id); b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); };
/** A layer chip under the title: flip it and say which way it now stands. */
function toggle(id: string) {
  const b = $(id), on = !b.classList.contains('on');
  b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); return on;
}

// ---------------------------------------------------------------- transport
function setCursor(c: number) { state.cursor = c; update(); }
let last = 0;
/** One frame of playback. The shuttle's sign is the direction; running off either end of the Enoch year carries on into the neighbouring year. */
function frame(t: number) {
  const dt = Math.min(0.25, Math.max(0, (t - last) / 1000)); last = t;
  const v = tp.rate(), doc = state.doc;
  if (tp.mode === 'year') {
    if (doc && isFinite(playYear)) {
      const was = Math.round(playYear);
      playYear = Math.max(YEAR_MIN, Math.min(YEAR_MAX, playYear + dt * YEARS_PER_SECOND * v));
      const y = Math.round(playYear);
      if (y !== was) state.deep?.setYear(y);
      if (y !== firstYear() && !yearLoading) { yearLoading = true; load({ year: y }, 'start', true).finally(() => { yearLoading = false; }); }
      if ((v < 0 && playYear <= YEAR_MIN) || (v > 0 && playYear >= YEAR_MAX)) tp.pause();
    }
  } else if (v && doc && !crossing) {
    const n = annual(doc).length;
    if (tp.mode === 'day') state.cursor += dt * DAYS_PER_SECOND * v;
    else if (timed(state.view)) {
      state.part += (dt * DEGREES_PER_SECOND * v) / 20;
      while (state.part >= 18) { state.part -= 18; state.cursor = Math.round(state.cursor) + 1; }
      while (state.part < 0) { state.part += 18; state.cursor = Math.round(state.cursor) - 1; }
    }
    if (state.cursor > n - 1) { crossing = true; load({ enochYear: doc.calculation.enoch_year + 1 }, 'start', true).finally(() => { crossing = false; }); }
    else if (state.cursor < 0) { crossing = true; load({ enochYear: doc.calculation.enoch_year - 1 }, 'end', true).finally(() => { crossing = false; }); }
    else update();
  }
  requestAnimationFrame(frame);
}
/** One Enoch year back or forward (Deep Time's step). */
function stepYear(k: number) { const doc = state.doc; if (doc) load({ enochYear: doc.calculation.enoch_year + k }, 'start', true); }
function step(k: number) {
  const doc = state.doc; if (!doc) return;
  const n = annual(doc).length, c = Math.round(state.cursor) + k;
  if (c < 0) return void load({ enochYear: doc.calculation.enoch_year - 1 }, 'end', true);
  if (c > n - 1) return void load({ enochYear: doc.calculation.enoch_year + 1 }, 'start', true);
  setCursor(c);
}
/** One degree of the day (1/20 of a part), crossing sunrise into the neighbouring day. */
function stepDegree(k: number) {
  let part = state.part + k / 20, day = 0;
  while (part >= 18) { part -= 18; day++; }
  while (part < 0) { part += 18; day--; }
  state.part = part;
  if (day) step(day); else update();
}
function bindTransport() {
  $('year-prev').onclick = () => { manual(); tp.pause(); state.doc && load({ enochYear: state.doc.calculation.enoch_year - 1 }, 'start'); };
  $('year-next').onclick = () => { manual(); tp.pause(); state.doc && load({ enochYear: state.doc.calculation.enoch_year + 1 }, 'start'); };
  $('now').onclick = () => { goNow(); };
  $<HTMLInputElement>('goto').onchange = (e) => {
    const box = e.target as HTMLInputElement, iso = readDate(box.value);
    box.classList.toggle('bad', !iso); if (!iso) return;
    manual(); tp.pause(); goDate(iso);
  };
  document.querySelectorAll<HTMLAnchorElement>('.nav a[data-view]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setView(a.dataset.view as View); }));
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v in VIEWS) setView(v as View, false); });
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, select, dialog')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); manual(); tp.pause(); const k = e.key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey && timed(state.view)) stepDegree(k); else if (state.view === 'deep') stepYear(k); else step(k);
    }
    if (e.key === ' ') { e.preventDefault(); tp.toggle(); }
    if (e.key === 'd' || e.key === 'D') tp.select(tp.selected === 'day' ? 'degree' : 'day');
    if (e.key === 's' || e.key === 'S') tp.cycleSpeed();
    if (e.key === 'n' || e.key === 'N') goNow();
    if (e.key === 'f' || e.key === 'F') focus.toggle();
    if (state.view === 'atlas') { if (e.key === '+' || e.key === '=') state.atlas?.zoomStep(1.25); if (e.key === '-') state.atlas?.zoomStep(0.8); if (e.key === '0') state.atlas?.home(); }
    const stage = state.view === 'sky' ? state.sky?.stage : state.view === 'day' ? state.day?.sky.stage : state.view === 'deep' ? state.deep?.stage : null;
    if (e.key === '+' || e.key === '=') stage?.zoomStep(1.25); if (e.key === '-') stage?.zoomStep(0.8);
    if (e.key === '0') { const sky = state.view === 'sky' ? state.sky : state.view === 'day' ? state.day?.sky : null; if (sky) sky.stage.home(); else stage?.setZoom(null); }   // following the Sun, home is its 1×
    const n = Number(e.key); if (n >= 1 && n <= ORDER.length && !e.metaKey && !e.ctrlKey && !e.altKey) setView(ORDER[n - 1]);
    if (e.key === 'Escape' && state.view === 'dial') { state.dial?.deselect(); update(); }
  });
  requestAnimationFrame((t) => { last = t; frame(t); });
  setInterval(tick, 1000);
}
/** Open the Enoch year containing a civil date (any year in range), at that morning. */
async function goDate(iso: string) {
  await load({ date: iso }, 'start');
  const k = state.doc ? annual(state.doc).findIndex((r) => r.civil_date === iso) : -1;
  if (k >= 0) setCursor(k);
}
const localISODate = () => { const d = new Date(); return `${d.getFullYear()}-${fmt.pad(d.getMonth() + 1)}-${fmt.pad(d.getDate())}`; };

// ---------------------------------------------------------------- observer
/** What the observer chip knows about the device's location: the browser's permission, a lookup in flight, the last failure. */
const geo = { perm: 'unknown' as PermState, busy: false, fail: null as FailKind | null, defaulted: false, filled: false };
/** The chip's pin says where the site came from: gold, a fix from this device; a ring, a place chosen; pulsing, asking; struck, blocked. */
const PIN = '<svg class="pin" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 13.2C6 13.2 1.6 8.6 1.6 5.4a4.4 4.4 0 0 1 8.8 0C10.4 8.6 6 13.2 6 13.2Z"/><circle cx="6" cy="5.4" r="1.5"/><path class="slash" d="M1 1.2 11 13"/></svg>';
function chipState(s: Site) { return geo.busy ? 'locating' : s.source === 'device' ? 'here' : geo.fail === 'blocked' || geo.perm === 'denied' ? 'blocked' : geo.defaulted ? 'default' : 'chosen'; }
const CHIP_TIP: Record<string, string> = {
  locating: 'Asking for your location…', here: 'Your location, from this device.', chosen: 'A place you chose.',
  default: 'A default place, not yours. Tap to use your location.', blocked: 'Location is blocked for this site. Tap for how to allow it.',
};
function siteChip() {
  const s = state.site, st = chipState(s), chip = $('site-chip');
  const name = document.createElement('b'); name.textContent = s.name;
  const coords = document.createElement('span'); coords.className = 'coords'; coords.textContent = `${Math.abs(s.lat).toFixed(4)}° ${s.lat >= 0 ? 'N' : 'S'} · ${Math.abs(s.lon).toFixed(4)}° ${s.lon >= 0 ? 'E' : 'W'} · `;
  const pin = document.createElement('span'); pin.className = 'pinbox'; pin.innerHTML = PIN;
  chip.replaceChildren(pin, coords, name);
  chip.dataset.geo = st;
  chip.title = `${s.name}: ${Math.abs(s.lat).toFixed(4)}° ${s.lat >= 0 ? 'N' : 'S'}, ${Math.abs(s.lon).toFixed(4)}° ${s.lon >= 0 ? 'E' : 'W'}. ${CHIP_TIP[st]}`;
  chip.setAttribute('aria-label', `Observer location: ${chip.title}`);
}
/** A new observer site, kept: the year is calculated there again, and the moment on show stays (or keeps following Now). */
function changeSite(site: Site) {
  state.site = site; geo.defaulted = false;
  saveSite(site); siteChip();
  const doc = state.doc, i = doc ? cursorRow(annual(doc), state.cursor).i : -1, live = state.live;
  const jd = doc && i >= 0 ? jdOfPart(doc.rows[i].sunrise_jd_ut, doc.rows[i + 1].sunrise_jd_ut, state.part) : -1, part = state.part;   // the instant on show, kept across the site change
  load({ date: doc && i >= 0 ? annual(doc)[i].civil_date : localISODate() }, 'today').then(() => {
    if (live) return goNow();                                       // a new site keeps following Now
    const d = state.doc, k = d && jd > 0 ? dayIndexAt(d, jd) : -1;   // otherwise it keeps the date being looked at ('today' would otherwise fall back to day 1 when Now is outside that year)
    if (d && k >= 0) { state.cursor = k; state.part = partOfDay(d, k, jd); } else if (d && i >= 0) { state.cursor = Math.min(i, annual(d).length - 1); state.part = part; }
    update();
  });
}
function bindSite() {
  const dlg = $<HTMLDialogElement>('site-dialog'), form = $<HTMLFormElement>('site-form');
  const fill = (s: Site) => { (form.lat as HTMLInputElement).value = String(s.lat); (form.lon as HTMLInputElement).value = String(s.lon); (form.elev as HTMLInputElement).value = String(s.elev); (form.tz as HTMLInputElement).value = s.tz; };
  let fromDevice: Site | null = null;                                   // the fix the form was last filled with: applying it keeps the name Here
  $('presets').innerHTML = PRESETS.map((p, k) => `<button type="button" class="btn" data-k="${k}">${p.name}</button>`).join('');
  $('presets').onclick = (e) => { const k = (e.target as HTMLElement).dataset.k; if (k) fill(PRESETS[+k]); };
  const use = $<HTMLButtonElement>('use-device'), note = $('geo-note');
  /** The dialog's words and button for what is known now: asking, a failure and what to do, or the plain invitation. */
  function geoUi() {
    const blocked = geo.fail ?? (geo.perm === 'denied' ? 'blocked' : null), insecure = !window.isSecureContext;
    use.disabled = insecure || geo.busy;
    use.textContent = geo.busy ? 'Locating…' : blocked || geo.fail ? 'Retry my location' : 'Use my location';
    note.dataset.state = insecure ? 'insecure' : geo.busy ? 'busy' : blocked ? 'fail' : 'idle';
    note.textContent = insecure ? `${failMessage('insecure')} Meanwhile, choose a preset or enter coordinates.` : geo.busy ? 'Asking your browser for your location…' : blocked ? failMessage(blocked) : geo.filled ? 'Your location is filled in below. Tap Calculate to use it.' : geo.defaulted ? `Showing ${state.site.name} as a default. Use your location, a preset, or coordinates.` : 'Your location, a preset, or coordinates.';
    if (blocked || geo.fail) note.setAttribute('role', 'alert'); else note.removeAttribute('role');
  }
  async function useDevice() {
    geo.busy = true; geo.fail = null; geo.filled = false; geoUi(); siteChip();
    try { fromDevice = await deviceSite(); fill(fromDevice); geo.perm = 'granted'; geo.filled = true; }
    catch (e) { geo.fail = (e as { kind?: FailKind }).kind ?? 'unavailable'; }
    geo.busy = false; geoUi(); siteChip();
  }
  use.onclick = useDevice;
  onPermissionChange((p) => {                                            // allowed or blocked in the browser's settings: no reload needed
    const was = geo.perm; geo.perm = p;
    if (p === 'granted' && dlg.open && (geo.fail || was === 'denied')) return void useDevice();   // they were told it was blocked and have allowed it: look now
    if (p !== 'denied' && geo.fail === 'blocked') geo.fail = null;
    geoUi(); siteChip();
  });
  geoUi();
  $('site-chip').onclick = () => { fill(state.site); fromDevice = null; geo.filled = false; geoUi(); dlg.showModal(); permissionState().then((p) => { geo.perm = p; geoUi(); siteChip(); }); };
  form.onsubmit = (e) => {
    if ((e.submitter as HTMLButtonElement | null)?.value !== 'apply') return;
    const p = PRESETS.find((q) => q.lat === +(form.lat as HTMLInputElement).value && q.lon === +(form.lon as HTMLInputElement).value);
    const dev = fromDevice && fromDevice.lat === +(form.lat as HTMLInputElement).value && fromDevice.lon === +(form.lon as HTMLInputElement).value ? fromDevice : null;
    state.site = dev ? { ...dev, elev: +(form.elev as HTMLInputElement).value || 0, tz: (form.tz as HTMLInputElement).value.trim() || dev.tz } : { name: p?.name ?? 'Custom site', lat: +(form.lat as HTMLInputElement).value, lon: +(form.lon as HTMLInputElement).value,
      elev: +(form.elev as HTMLInputElement).value || 0, tz: (form.tz as HTMLInputElement).value.trim() || browserZone(), source: p ? 'preset' : 'manual' } as Site;
    changeSite(state.site);
  };
}

// ---------------------------------------------------------------- start
/** On tablets and phones the inspector is a sheet over the bar; it also takes the year jumps. The view's own options stay under its title. */
guaranteeTaps();
const sheet = createSheet({
  sheet: $('insp-wrap'), footer: document.querySelector<HTMLElement>('.transport')!, toggle: $<HTMLButtonElement>('more'), close: $('sheet-close'), handle: $('handle'),
  place: (narrow) => {
    if (narrow) $('when').after($('now')); else $('year-next').before($('now'));   // Now: beside the date on phones, with the year jumps on wide screens
    if (narrow) $('sheet-ctl').append($('ctl')); else $('more').before($('ctl'));
  },
});
setHeadClearance(() => { const h = document.querySelector<HTMLElement>('.view-head'); return h ? h.offsetTop + h.offsetHeight + 8 : 0; });
/** An observer in the URL (?lat&lon&elev&tz&name), as the Dial's links carry it: used, not saved. */
function siteFromUrl(P: URLSearchParams): Site | null {
  if (!P.get('lat') || !P.get('lon')) return null;
  return { name: P.get('name') ?? 'Custom site', lat: +P.get('lat')!, lon: +P.get('lon')!, elev: +(P.get('elev') ?? 0), tz: P.get('tz') ?? browserZone(), source: 'manual' };
}
/** Open the instant jd (?at=ISO): its Enoch day, at its part of the day. */
async function goJd(jd: number) {
  // Local instant requests establish the sunrise day before loading its year.
  let date=isoFromJd(jd);
  try { date=(await fetchInstant(state.site,jd)).civil_date_of_day; }
  catch(e) { const status=$('status');status.hidden=false;status.className='status error';status.textContent=`The calculator refused this instant: ${(e as Error).message}`;return; }
  await load({ date }, 'start');
  for (let guard = 0; guard < 2 && state.doc && dayIndexAt(state.doc, jd) < 0; guard++)    // the UT date's year may end before the site's sunrise
    await load({ enochYear: state.doc.calculation.enoch_year + (jd < state.doc.rows[0].sunrise_jd_ut ? -1 : 1) }, 'start');
  const doc = state.doc, k = doc ? dayIndexAt(doc, jd) : -1;
  if (doc && k >= 0) { state.cursor = k; state.part = partOfDay(doc, k, jd); }
}
/** The worker's progress, in the status line while a year loads: every step on an ordinary load (the line is already showing), only
 * downloads on a quiet one (playback turning a year), and nothing for a background prefetch. */
function calculatorNote(message: string, download?: { done: number; total: number }) {
  const status = $('status');
  if ($('stage').getAttribute('aria-busy') !== 'true' || (status.hidden && !download)) return;
  status.className = 'status'; status.hidden = false; status.textContent = message;
}
async function start() {
  { const h = location.hash.slice(1), v0 = (h in VIEWS ? h : 'sky') as View;   // the view the page opens on, shown from the first paint: nothing else shows while the year loads
    document.querySelectorAll('.view').forEach((n) => n.classList.toggle('on', n.id === `view-${v0}`)); $('stage').dataset.view = v0; $('vh-title').textContent = VIEWS[v0].title; }
  registerServiceWorker(); watchHomeScreen();
  if (await verifyInstalled()) pruneStaleVersions().catch(() => undefined);   // a pack the browser has evicted is offered for install again; old versions' caches go
  mountOffline({ after: $('insp'), stage: $('stage'), chip: $('calc-status'), more: $('more'), disposeCalculator, openDetails: () => sheet.open(), });
  mountLegal($('offline'));
  mountFeedback($('legal'), () => ({ mode: VIEWS[state.view].name, page: state.doc ? `Enoch year ${state.doc.calculation.enoch_year}` : '' }));
  onCalculatorProgress(calculatorNote);
  bindTransport(); bindSite(); bindOptions(); bindAtlas(); navShow = bindNavScroll();
  const P = new URLSearchParams(location.search), urlSite = siteFromUrl(P);
  state.site = urlSite ?? savedSite() ?? FALLBACK;
  // First visit: no place given or saved. If location is already allowed, show the device's place from the start; never ask unprompted.
  let askNow: Promise<Site | null> | null = null;
  if (!urlSite && !savedSite()) {
    geo.defaulted = true; geo.perm = await permissionState();
    const lookup = (quiet = false) => { geo.busy = true; if (!quiet) siteChip(); return deviceSite().then((s) => { geo.fail = null; return s; }, (e) => { geo.fail = (e as { kind?: FailKind }).kind ?? 'unavailable'; return null; }).finally(() => { geo.busy = false; }); };
    if (geo.perm === 'denied') geo.fail = 'blocked';
    else if (geo.perm === 'granted') {                                     // already allowed: the first year is the one where they stand, with no flash of the default
      const pending = lookup(true), s = await Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
      if (s) { state.site = s; saveSite(s); geo.defaulted = false; } else askNow = pending;
    }                                                                      // not yet answered: the default stands, and the browser is asked only when they tap Use my location
  }
  siteChip();
  await document.fonts.ready;
  const q = P.get('date'), at = Date.parse(P.get('at') ?? '');
  if (isFinite(at)) await goJd(jdFromMs(at));
  else {
    await load({ date: q && /^([+-]\d{6}|\d{4})-\d{2}-\d{2}$/.test(q) ? q : localISODate() }, q ? 'start' : 'today');
    if (q && state.doc) { const k = annual(state.doc).findIndex((r) => r.civil_date === q); if (k >= 0) { state.cursor = k; update(); } }
  }
  const fq = P.get('facing');                                              // ?facing=west: open turned to the western portals (east, or around, is how it opens)
  if (fq === 'west') { if (state.sky) state.sky.recentre('west'); else startSide = 'west'; syncSide(); }
  const part = Number(P.get('part'));                                      // the same moment of the day
  if (part > 0 && part < 18) state.part = part;
  const v = location.hash.slice(1);
  await setView(v in VIEWS ? (v as View) : 'sky', false);
  if (!q && !isFinite(at) && !(part > 0 && part < 18)) await goNow();      // opened plainly: the present
  const arrive = (p: Promise<Site | null>) => p.then((s) => { if (s) changeSite(s); else { geo.defaulted = true; siteChip(); } });   // their place replaces the default, or the default says it is one
  if (askNow) arrive(askNow);
  hub.resume();                                                            // it was on when the page was last used: on again (iOS: at the first tap)
}
createFilm($('film-btn'), $('app'));                                // the film: Watch in the top bar, an invitation on the first visit

start();
