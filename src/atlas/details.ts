// Atlas's details (docs/atlas.md): Where (the site, the nearest place, typed coordinates, the device's location), When (the
// date, the time of day on The Day's bar, steps and jumps) and Places (the 100 presets, filtered by tag). Built
// once and kept: the panel's words are redrawn as the instant moves, but a field a hand is in is left alone, and the controls
// keep their listeners. On a phone the sections are tabs; on a wide screen they stand one under another.
import { createDayBar } from '../day/bar';
import { dayEvents, type DayEvent } from '../day/events';
import { localParts, yearLabel } from '../dates';
import { annual, fmt } from '../model';
import { enochTime } from '../dial/state';
import type { Site, YearDoc } from '../types';
import { filterItems } from './moments';
import { atlasPanel, globePanel, placeSite, siteAt, snapTo } from './panel';
import { places } from './places';
import type { AtlasInfo } from './view';
import { amongEvents, daysIn, ENOCH_MONTH_DAYS, eventName, fromEra, MONTHS, toEra } from './when';

export type AtlasTab = 'where' | 'when' | 'places';
export type Cal = 'greg' | 'enoch';
export interface AtlasDetailsOptions {
  /** A part of the day shown (0 at sunrise, 18 at the next). */
  onPart(part: number): void;
  /** A Gregorian date (astronomical year) at a local clock time ("hh:mm"). */
  onLocal(y: number, m: number, d: number, hhmm: string): void;
  /** An Enoch date, at the part of the day on show. */
  onEnoch(year: number, month: number, day: number): void;
  onJump(kind: 'now' | 'equinox' | 'solstice' | 'day1'): void;
  /** A site chosen here: a place, a snap, typed coordinates. */
  onSite(site: Site): void;
  /** My location: the app asks the device, and says how it went with setGeo. */
  onLocate(): void;
}
/** The device's location as the app knows it: the button's words, and a note (a failure says what to do). */
export interface GeoState { label: string; disabled: boolean; note: string; alert: boolean }
export interface AtlasDetails {
  readonly el: HTMLElement;
  /** Redraw for day i of the year at the part of the day (`jd`, the instant), with the globe's info and the site's name. */
  render(doc: YearDoc, i: number, part: number, jd: number, info: AtlasInfo | null, site: Site): void;
  /** No year loaded (the calculator refused the site): Where and Places only, to choose another. */
  renderNoYear(site: Site): void;
  setGeo(g: GeoState): void;
  show(tab: AtlasTab): void;
}

const p2 = fmt.pad;
const coord = (x: number, pos: string, neg: string) => `${Math.abs(x).toFixed(4)}° ${x >= 0 ? pos : neg}`;
/** A zone this browser can keep time in. */
const zoneOk = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };
const hm = (t: string) => t.slice(0, 5);

export function createAtlasDetails(opts: AtlasDetailsOptions): AtlasDetails {
  const el = document.createElement('div'); el.className = 'atlas-details';
  el.innerHTML = `<div class="at-tabs" role="tablist" aria-label="Atlas"><button type="button" role="tab" data-at-tab="where">Where</button><button type="button" role="tab" data-at-tab="when">When</button><button type="button" role="tab" data-at-tab="places">Places</button></div>
  <div class="at-sec section atlas-site" data-at-sec="where">
    <div data-w="site"></div>
    <p class="note">Drag the globe to move the site under the crosshair; the year is calculated where you let go.</p>
    <div class="at-btns"><button type="button" class="btn" data-w="snap" hidden></button><button type="button" class="btn" data-w="coords" aria-expanded="false">Coordinates…</button><button type="button" class="btn" data-w="locate">⌖ My location</button></div>
    <p class="note at-geo" data-w="geo" hidden></p>
    <form class="at-form" data-w="form" hidden novalidate>
      <label>Latitude ° N<input name="lat" type="number" step="any" min="-90" max="90" required></label>
      <label>Longitude ° E<input name="lon" type="number" step="any" min="-180" max="180" required></label>
      <label>Elevation m<input name="elev" type="number" step="any"></label>
      <label>Time zone<input name="tz" type="text" autocomplete="off" spellcheck="false" placeholder="from the place"></label>
      <p class="at-form-note" data-w="form-note"></p>
      <div class="at-btns"><button type="submit" class="btn on">Calculate</button><button type="button" class="btn" data-w="cancel">Cancel</button></div>
    </form>
  </div>
  <div class="at-sec section" data-at-sec="when">
    <div class="eyebrow">When</div>
    <div class="seg at-cal" role="group" aria-label="Calendar"><button type="button" class="btn on" data-cal="greg" aria-pressed="true">Gregorian</button><button type="button" class="btn" data-cal="enoch" aria-pressed="false">Enoch</button><button type="button" class="btn" disabled title="Later: a Julian layer">Julian</button></div>
    <div class="at-date">
      <label class="f-year">Year<input type="number" inputmode="numeric" data-w="year"></label>
      <div class="seg at-era" role="group" aria-label="Era"><button type="button" class="btn" data-era="bce">BCE</button><button type="button" class="btn" data-era="ce">CE</button></div>
      <label class="f-mon">Month<select data-w="month"></select></label>
      <label class="f-day">Day<select data-w="day"></select></label>
    </div>
    <div class="at-tod">
      <div class="at-tod-head"><span class="lab">Time of day</span><span class="at-tod-read" data-w="read"></span></div>
      <svg class="daybar at-daybar" aria-label="The day, sunrise to sunrise: drag to set the time"></svg>
      <div class="at-events" data-w="events"></div>
      <div class="at-exact">
        <label class="f-time">Exact<input type="time" data-w="time"></label>
        <div class="seg" role="group" aria-label="Time as"><button type="button" class="btn on" data-tm="clock" aria-pressed="true">Clock</button><button type="button" class="btn" data-tm="part" aria-pressed="false">Part of day</button></div>
      </div>
    </div>
    <div class="at-steps" role="group" aria-label="Years"><span>Years</span><button type="button" class="btn" data-step="-100">−100</button><button type="button" class="btn" data-step="-10">−10</button><button type="button" class="btn" data-step="-1">−1</button><button type="button" class="btn" data-step="1">+1</button><button type="button" class="btn" data-step="10">+10</button><button type="button" class="btn" data-step="100">+100</button></div>
    <div class="at-jumps"><button type="button" class="btn" data-jump="now">Now</button><button type="button" class="btn" data-jump="equinox">Equinox</button><button type="button" class="btn" data-jump="solstice">Solstice</button><button type="button" class="btn" data-jump="day1">Day 1</button></div>
    <dl class="read at-rows" data-w="rows"></dl>
  </div>
  <div class="at-sec" data-at-sec="where" data-w="globe"></div>
  <div class="at-sec section" data-at-sec="places">
    <div class="eyebrow">Places · ${places.length}</div>
    <input type="search" class="at-search" data-w="search" placeholder="Search names, regions and notes" aria-label="Search the places">
    <div class="at-tags" data-w="tags"></div>
    <ul class="at-list" data-w="list"></ul>
  </div>`;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector(s) as T;
  const siteBox = q('[data-w=site]'), globe = q('[data-w=globe]'), year = q<HTMLInputElement>('[data-w=year]'), month = q<HTMLSelectElement>('[data-w=month]'), day = q<HTMLSelectElement>('[data-w=day]');
  const time = q<HTMLInputElement>('[data-w=time]'), read = q('[data-w=read]'), evs = q('[data-w=events]'), rows = q('[data-w=rows]');
  let cal: Cal = 'greg', tm: 'clock' | 'part' = 'clock', tab: AtlasTab = 'where', allEvents = false;
  let cur: { doc: YearDoc; i: number; part: number; jd: number; g: ReturnType<typeof localParts>; e: { y: number; m: number; d: number } } | null = null;
  let dayOf: { doc: YearDoc; i: number; events: DayEvent[] } | null = null;
  let site: Site | null = null;
  const tags = new Set<string>();

  const bar = createDayBar(q('.at-daybar'), { width: () => el.clientWidth || 320, onScrub: (p) => opts.onPart(p) });
  const seg = (attr: string, v: string) => el.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((b) => { const on = b.getAttribute(attr) === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });

  // the tabs (a phone's): one section at a time
  function show(t: AtlasTab) {
    tab = t; el.dataset.tab = t;
    el.querySelectorAll<HTMLElement>('[data-at-tab]').forEach((b) => { const on = b.dataset.atTab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  }
  el.querySelectorAll<HTMLElement>('[data-at-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.atTab as AtlasTab)));
  show(tab);

  // the date: the calendar, the year with its era, the month and the day
  el.querySelectorAll<HTMLButtonElement>('[data-cal]').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; cal = b.dataset.cal as Cal; seg('data-cal', cal); fill(true); }));
  el.querySelectorAll<HTMLButtonElement>('[data-era]').forEach((b) => b.addEventListener('click', () => { if (!cur || cal !== 'greg') return; goGreg(fromEra(toEra(cur.g.y).n, b.dataset.era === 'bce'), cur.g.m, cur.g.d); }));
  const fields = () => {
    if (!cur) return;
    const n = Math.round(Number(year.value)), m = Number(month.value), d = Number(day.value);
    if (!Number.isFinite(n) || (cal === 'greg' && n < 1)) { year.classList.add('bad'); return; }
    year.classList.remove('bad');
    if (cal === 'greg') goGreg(fromEra(n, toEra(cur.g.y).bce), m, d); else opts.onEnoch(n, m, Math.min(d, ENOCH_MONTH_DAYS[m - 1]));
  };
  year.addEventListener('change', fields); month.addEventListener('change', fields); day.addEventListener('change', fields);
  const goGreg = (y: number, m: number, d: number) => opts.onLocal(y, m, Math.min(d, daysIn(y, m)), hm(cur!.g.time));
  el.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => {
    if (!cur) return; const k = Number(b.dataset.step);
    if (cal === 'greg') goGreg(cur.g.y + k, cur.g.m, cur.g.d); else opts.onEnoch(cur.e.y + k, cur.e.m, cur.e.d);
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach((b) => b.addEventListener('click', () => opts.onJump(b.dataset.jump as 'now')));

  // the time of day: the bar, the day's events as jumps, and the exact clock time or part
  evs.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.ev'); if (!b) return;
    if (b.dataset.more != null) { allEvents = !allEvents; events(); } else opts.onPart(Number(b.dataset.part));
  });
  el.querySelectorAll<HTMLElement>('[data-tm]').forEach((b) => b.addEventListener('click', () => { tm = b.dataset.tm as typeof tm; seg('data-tm', tm); fillTime(true); }));
  time.addEventListener('change', () => {
    if (!cur || !time.value) return;
    if (tm === 'clock') opts.onLocal(cur.g.y, cur.g.m, cur.g.d, time.value);
    else { const p = Number(time.value); if (Number.isFinite(p)) opts.onPart(Math.max(0, Math.min(18 - 1e-6, p))); }
  });

  // Where: snap to the nearest place, typed coordinates, the device's location
  const snap = q<HTMLButtonElement>('[data-w=snap]'), coordsBtn = q<HTMLButtonElement>('[data-w=coords]'), locate = q<HTMLButtonElement>('[data-w=locate]');
  const form = q<HTMLFormElement>('[data-w=form]'), geo = q('[data-w=geo]'), formNote = q('[data-w=form-note]');
  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  snap.addEventListener('click', () => { const nb = site && snapTo(site); if (nb) opts.onSite(placeSite(nb.place)); });
  locate.addEventListener('click', () => opts.onLocate());
  const openForm = (open: boolean) => {
    form.hidden = !open; coordsBtn.setAttribute('aria-expanded', String(open)); coordsBtn.classList.toggle('on', open); formNote.textContent = '';
    if (open && site) { field('lat').value = String(site.lat); field('lon').value = String(site.lon); field('elev').value = String(site.elev); field('tz').value = site.tz; field('lat').focus(); }
  };
  coordsBtn.addEventListener('click', () => openForm(form.hidden));
  q('[data-w=cancel]').addEventListener('click', () => openForm(false));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const la = Number(field('lat').value), lo = Number(field('lon').value), el = field('elev').value.trim(), tz = field('tz').value.trim();
    const bad = !field('lat').value.trim() || !(Math.abs(la) <= 90) ? 'Latitude: a number from −90 to 90.' : !field('lon').value.trim() || !(Math.abs(lo) <= 180) ? 'Longitude: a number from −180 to 180.'
      : el && !Number.isFinite(Number(el)) ? 'Elevation: metres, a number.' : tz && !zoneOk(tz) ? `Time zone: "${tz}" is not one this browser knows (as in Europe/London).` : '';
    formNote.textContent = bad; if (bad) return;
    const est = siteAt(la, lo), same = site && site.lat === la && site.lon === lo;
    opts.onSite({ name: same ? site!.name : est.name, lat: la, lon: lo, elev: el ? Number(el) : est.elev, tz: tz || est.tz, source: 'manual' });
    openForm(false);
  });

  // Places: the presets, filtered by tag and by words
  const search = q<HTMLInputElement>('[data-w=search]'), tagBox = q('[data-w=tags]'), list = q('[data-w=list]');
  const allTags = [...new Set(places.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b)), items = places.map((p, k) => ({ ...p, desc: p.note, k }));
  search.addEventListener('input', () => listPlaces());
  tagBox.addEventListener('click', (e) => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tag]')?.dataset.tag; if (!t) return; if (!tags.delete(t)) tags.add(t); listPlaces(); });
  list.addEventListener('click', (e) => { const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k; if (k != null) opts.onSite(placeSite(places[Number(k)])); });
  function listPlaces() {
    tagBox.innerHTML = allTags.map((t) => `<button type="button" class="tag${tags.has(t) ? ' on' : ''}" data-tag="${t}" aria-pressed="${tags.has(t)}">${t}</button>`).join('');
    const shown = filterItems(items, tags, search.value), at = (p: { lat: number; lon: number }) => !!site && Math.abs(p.lat - site.lat) < 1e-4 && Math.abs(p.lon - site.lon) < 1e-4;
    const html = shown.map((p) => `<li><button type="button" class="at-item${at(p) ? ' cur' : ''}" data-k="${p.k}"><span class="nm">${p.name}</span><span class="rg">${p.region}</span>
      <span class="mt">${coord(p.lat, 'N', 'S')} · ${coord(p.lon, 'E', 'W')} · ${p.tags.join(' · ')}</span><span class="ds">${p.note}</span></button></li>`).join('') || '<li class="none">Nothing matches.</li>';
    if (list.dataset.h !== html) { list.innerHTML = html; list.dataset.h = html; }
  }
  function where(s: Site) {
    const moved = !site || site.lat !== s.lat || site.lon !== s.lon;
    site = s;
    const nb = snapTo(s); snap.hidden = !nb; if (nb) snap.textContent = `Snap to ${nb.place.name} · ${nb.km < 10 ? nb.km.toFixed(1) : Math.round(nb.km)} km`;
    if (moved) { listPlaces(); if (!form.hidden) openForm(true); }
  }

  function fill(force = false) {
    if (!cur) return;
    const greg = cal === 'greg', y = greg ? toEra(cur.g.y) : null;
    (q('.at-era') as HTMLElement).hidden = !greg;
    if (greg) seg('data-era', y!.bce ? 'bce' : 'ce');
    year.min = greg ? '1' : '';
    if (force || document.activeElement !== year) year.value = String(greg ? y!.n : cur.e.y);
    const mOpts = greg ? MONTHS.map((n, k) => [k + 1, n]) : ENOCH_MONTH_DAYS.map((n, k) => [k + 1, `${k + 1} · ${n} days`]);
    const mSel = greg ? cur.g.m : cur.e.m, nDays = greg ? daysIn(cur.g.y, cur.g.m) : ENOCH_MONTH_DAYS[cur.e.m - 1], dSel = greg ? cur.g.d : cur.e.d;
    const mHtml = mOpts.map(([v, t]) => `<option value="${v}"${v === mSel ? ' selected' : ''}>${t}</option>`).join('');
    if (month.dataset.h !== mHtml && document.activeElement !== month) { month.innerHTML = mHtml; month.dataset.h = mHtml; }
    const dHtml = Array.from({ length: nDays }, (_, k) => `<option value="${k + 1}"${k + 1 === dSel ? ' selected' : ''}>${k + 1}</option>`).join('');
    if (day.dataset.h !== dHtml && document.activeElement !== day) { day.innerHTML = dHtml; day.dataset.h = dHtml; }
  }
  function fillTime(force = false) {
    if (!cur || (!force && document.activeElement === time)) return;
    if (tm === 'clock') { time.type = 'time'; time.removeAttribute('step'); time.removeAttribute('min'); time.removeAttribute('max'); time.value = hm(cur.g.time); }
    else { time.type = 'number'; time.step = '0.01'; time.min = '0'; time.max = '17.99'; time.value = cur.part.toFixed(2); }
    q('.f-time').firstChild!.textContent = tm === 'clock' ? 'Exact' : 'Part';
  }
  function events() {
    if (!cur || !dayOf) return;
    const main = (e: DayEvent) => e.body === 'Sun' || e.body === 'Moon', list = allEvents ? dayOf.events : dayOf.events.filter(main), more = dayOf.events.length - dayOf.events.filter(main).length;
    const clock = (jd: number) => hm(localParts(jd, cur!.doc.calculation.timezone, fmt.offset(cur!.doc.rows[cur!.i].sunrise_local)).time);
    const html = list.map((e) => `<button type="button" class="ev${Math.abs(e.jd - cur!.jd) * 1440 < 1.5 ? ' cur' : e.jd < cur!.jd ? ' past' : ''}" data-part="${e.part}" style="--c:${e.color}"><i class="${e.kind === 'set' ? 'set' : ''}"></i>${eventName(e)} <b>${clock(e.jd)}</b></button>`).join('')
      + (more ? `<button type="button" class="ev ev-all" data-more>${allEvents ? 'Sun and Moon only' : `+ ${more} planet risings and settings`}</button>` : '');
    if (evs.dataset.h !== html) { evs.innerHTML = html; evs.dataset.h = html; }
  }

  listPlaces();
  return {
    el,
    show,
    setGeo(g) {
      locate.textContent = g.label; locate.disabled = g.disabled;
      geo.textContent = g.note; geo.hidden = !g.note;
      if (g.alert) geo.setAttribute('role', 'alert'); else geo.removeAttribute('role');
    },
    renderNoYear(s) {
      el.classList.add('no-year'); where(s);
      const html = `<div class="eyebrow">Atlas · the site</div><div class="at-name"><span class="n">${s.name}</span></div><div class="at-coords">${coord(s.lat, 'N', 'S')} · ${coord(s.lon, 'E', 'W')}</div><p class="note warn">No year here: the calculator needs a sunrise every day of the year. Choose another site: a place, coordinates, or drag the globe.</p>`;
      if (siteBox.dataset.h !== html) { siteBox.innerHTML = html; siteBox.dataset.h = html; }
      if (tab === 'when') show('where');
    },
    render(doc, i, part, jd, info, s) {
      el.classList.remove('no-year'); where(s);
      for (const [box, html] of [[siteBox, atlasPanel(doc, i, s.name)], [globe, globePanel(info)]] as const) if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
      const tz = doc.calculation.timezone, off = fmt.offset(doc.rows[i].sunrise_local), g = localParts(jd, tz, off);
      const [ey, em, ed] = annual(doc)[i].enoch_date.split(/(?<=\d)-/).map(Number);
      cur = { doc, i, part, jd, g, e: { y: ey, m: em, d: ed } };
      if (!dayOf || dayOf.doc !== doc || dayOf.i !== i) {
        dayOf = { doc, i, events: dayEvents(doc, i) };
        bar.build(doc, i, dayOf.events, (x) => hm(localParts(x, tz, off).time));
      }
      bar.place(part);
      fill(); fillTime(); events();
      const t = enochTime(part), among = amongEvents(dayOf.events, jd);
      read.innerHTML = `${hm(g.time)} · part <em>${part.toFixed(2)}</em>${among ? ` · ${among}` : ''}`;
      const ut = new Date((jd - 2440587.5) * 86400000);
      const rh = `<dt>Gregorian</dt><dd class="cal">${yearLabel(g.y)} · ${MONTHS[g.m - 1].slice(0, 3)} ${g.d} · ${hm(g.time)} (UTC${off})</dd>`
        + `<dt>Enoch</dt><dd class="cal">${annual(doc)[i].enoch_date.replace(/^-/, '−')} · ${t.part}:${t.deg}:${t.min}:${t.sec}</dd>`
        + `<dt>UT · JD</dt><dd>${p2(ut.getUTCHours())}:${p2(ut.getUTCMinutes())} · ${jd.toFixed(4)}</dd>`;
      if (rows.dataset.h !== rh) { rows.innerHTML = rh; rows.dataset.h = rh; }
    },
  };
}
