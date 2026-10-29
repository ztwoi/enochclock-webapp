// Atlas's details (docs/atlas.md): Where (the site), When (the date, the time of day on The Day's bar, steps and jumps). Built
// once and kept: the panel's words are redrawn as the instant moves, but a field a hand is in is left alone, and the controls
// keep their listeners. On a phone the sections are tabs; on a wide screen they stand one under another.
import { createDayBar } from '../day/bar';
import { dayEvents, type DayEvent } from '../day/events';
import { localParts, yearLabel } from '../dates';
import { annual, fmt } from '../model';
import { enochTime } from '../dial/state';
import type { YearDoc } from '../types';
import { atlasPanel, globePanel } from './panel';
import type { AtlasInfo } from './view';
import { amongEvents, daysIn, ENOCH_MONTH_DAYS, eventName, fromEra, MONTHS, toEra } from './when';

export type AtlasTab = 'where' | 'when';
export type Cal = 'greg' | 'enoch';
export interface AtlasDetailsOptions {
  /** A part of the day shown (0 at sunrise, 18 at the next). */
  onPart(part: number): void;
  /** A Gregorian date (astronomical year) at a local clock time ("hh:mm"). */
  onLocal(y: number, m: number, d: number, hhmm: string): void;
  /** An Enoch date, at the part of the day on show. */
  onEnoch(year: number, month: number, day: number): void;
  onJump(kind: 'now' | 'equinox' | 'solstice' | 'day1'): void;
}
export interface AtlasDetails {
  readonly el: HTMLElement;
  /** Redraw for day i of the year at the part of the day (`jd`, the instant), with the globe's info and the site's name. */
  render(doc: YearDoc, i: number, part: number, jd: number, info: AtlasInfo | null, name: string): void;
  show(tab: AtlasTab): void;
}

const p2 = fmt.pad;
const hm = (t: string) => t.slice(0, 5);

export function createAtlasDetails(opts: AtlasDetailsOptions): AtlasDetails {
  const el = document.createElement('div'); el.className = 'atlas-details';
  el.innerHTML = `<div class="at-tabs" role="tablist" aria-label="Atlas"><button type="button" role="tab" data-at-tab="where">Where</button><button type="button" role="tab" data-at-tab="when">When</button></div>
  <div class="at-sec" data-at-sec="where"></div>
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
  <div class="at-sec" data-at-sec="where" data-w="globe"></div>`;
  const q = <T extends Element = HTMLElement>(s: string) => el.querySelector(s) as T;
  const where = q('[data-at-sec=where]'), globe = q('[data-w=globe]'), year = q<HTMLInputElement>('[data-w=year]'), month = q<HTMLSelectElement>('[data-w=month]'), day = q<HTMLSelectElement>('[data-w=day]');
  const time = q<HTMLInputElement>('[data-w=time]'), read = q('[data-w=read]'), evs = q('[data-w=events]'), rows = q('[data-w=rows]');
  let cal: Cal = 'greg', tm: 'clock' | 'part' = 'clock', tab: AtlasTab = 'where', allEvents = false;
  let cur: { doc: YearDoc; i: number; part: number; jd: number; g: ReturnType<typeof localParts>; e: { y: number; m: number; d: number } } | null = null;
  let dayOf: { doc: YearDoc; i: number; events: DayEvent[] } | null = null;

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

  return {
    el,
    show,
    render(doc, i, part, jd, info, name) {
      for (const [box, html] of [[where, atlasPanel(doc, i, name)], [globe, globePanel(info)]] as const) if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
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
