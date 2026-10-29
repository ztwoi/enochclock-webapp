// Inspector panels, one per view. Every number comes from the calculator; text is quoted
// from the book's text (Charles 1912).
import { correctionSection, courseSection } from './cycleui';
import { civil } from './dates';
import { annual, fmt, GEEZ, ROMAN } from './model';
import { declinationOfDate, horizonAzimuth, lastPassage, litPortals, passageRun, portalAt } from './sky/instrument';
import { skyFrame } from './sky/astronomy';
import { CONSTELLATION_NAMES } from './sky/constellationNames';
import { PCOL } from './dial/state';
import { MOON_COLOR } from './day/events';
import { C } from './stage';
import { followable, positionOf, sameBody, type Followed, type SkyInfo } from './skyview';
import type { DeepDoc, YearDoc } from './types';

function legend() {
  const sw = (s: string, dash = '', w = 1.4) => `<svg viewBox="0 0 26 8"><line x1="0" y1="4" x2="26" y2="4" stroke="${s}" stroke-width="${w}" stroke-dasharray="${dash}"/></svg>`;
  return `<div class="section"><div class="eyebrow">Layers</div><div class="legend"><span>${sw(C.ivory)}Computed</span><span>${sw(C.gold, '', 2)}Calendar</span><span>${sw(C.bronze, '3 2')}Textual</span><span>${sw(C.silver, '1 2', 2)}Derived · Δ</span></div></div>`;
}
const verse = (text: string, ref: string) => `<div class="verse">“${text}”<cite>1 ENOCH ${ref} · CHARLES 1912</cite></div>`;




export function deepPanel(deep: DeepDoc, year: number, doc?: YearDoc, i?: number) {
  const r = deep.window?.rows.find((x) => x.year === year), S = deep.stats;
  const cyc = deep.cycle_years.filter((v) => v <= year).at(-1);
  if (!r) return `<div class="section"><div class="eyebrow">Selected year · ${year}</div><p class="note">Outside the loaded window.</p></div>${legend()}`;
  return `
  <div class="section"><div class="eyebrow">Selected year · ${year}</div>
   <div class="big" data-k="offset">${fmt.signed(r.enoch)}<small> d</small></div>
   <div class="sub">Enoch Day 1 falls ${r.enoch >= 0 ? 'after' : 'before'} the March equinox</div>
   <dl class="read"><dt>Enoch year</dt><dd class="cal" data-k="enoch-year">${r.enoch_year}</dd>
   <dt>Day 1 (TT grid)</dt><dd class="cal">${civil(r.day1_date)}</dd>
   <dt>Day 1 JD</dt><dd>${r.jd_tt.toFixed(6)} TT</dd>
   <dt>Equinox JD</dt><dd>${r.equinox_jd_tt.toFixed(6)} TT</dd>
   <dt>March 21 TT</dt><dd class="der">${fmt.signed(r.greg)} d</dd>
   <dt>294-year cycle</dt><dd class="cal">boundary ${cyc ?? '—'}</dd></dl></div>
  <div class="section"><div class="eyebrow">Across ${S.n.toLocaleString('en-US')} annual starts</div>
   <dl class="read"><dt>Within ±1 day</dt><dd>${S.enoch.within_1_day_pct.toFixed(2)} % · <span style="color:var(--silver)">${S.greg.within_1_day_pct.toFixed(2)} %</span></dd>
   <dt>Within ±½ day</dt><dd>${S.enoch.within_half_day_pct.toFixed(2)} % · <span style="color:var(--silver)">${S.greg.within_half_day_pct.toFixed(2)} %</span></dd>
   <dt>Std. deviation</dt><dd>${S.enoch.std.toFixed(3)} d · <span style="color:var(--silver)">${S.greg.std.toFixed(3)} d</span></dd>
   <dt>Range</dt><dd>${S.enoch.min.toFixed(2)} … ${S.enoch.max.toFixed(2)} d</dd></dl>
   <p class="note">Gold: Enoch Day 1. Silver: the March 21 TT benchmark.</p></div>
  ${doc && i !== undefined ? correctionSection(doc, i) + courseSection(doc, i) : ''}
  ${legend()}`;
}


const sgn = (v: number, n = 3) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(n)}`;
const portalText = (p: SkyInfo['selected'] extends infer S ? S extends { portal: infer P } ? P : never : never, verb: string) =>
  !p ? `never ${verb} here` : p.where === 'within' ? `${verb} in portal ${ROMAN[p.portal!]} <span class="geez">${GEEZ[p.portal!]}</span>` : p.where === 'seam' ? `${verb} in a seam between portals` : `${verb} outside the six portals`;

/** A selected portal: where the Sun rises (east) or sets (west) in it, when it last did so, and the calendar's two passes through it. */
function portalSection(doc: YearDoc, S: { portal: number; side: 'east' | 'west' }, jd: number) {
  const rising = S.side === 'east', P = (rising ? doc.portals : doc.portals_west).find((q) => q.portal === S.portal);
  if (!P) return '';
  const noun = rising ? 'sunrise' : 'sunset', verb = rising ? 'rose' : 'set', pas = lastPassage(doc, S.side, S.portal, jd), run = passageRun(doc, S.side, S.portal, jd), lit = litPortals(doc, jd)[S.side] === S.portal;
  const ago = (n: number) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);
  const last = pas
    ? `<dt>The Sun last ${verb} here</dt><dd class="cal" data-k="portal-last">${ago(pas.daysAgo)}</dd><dt>On</dt><dd>${pas.row.enoch_date} · ${civil(pas.row.civil_date)}</dd><dt>At bearing</dt><dd>${pas.azimuth.toFixed(3)}°</dd><dt>That pass</dt><dd data-k="portal-run">${run.length} ${run.length === 1 ? 'morning' : 'mornings'} · ${run[0].row.month}/${run[0].row.day} → ${run[run.length - 1].row.month}/${run[run.length - 1].row.day}</dd>`
    : `<dt>The Sun last ${verb} here</dt><dd data-k="portal-last">before this Enoch year</dd>`;
  const passes = P.passes.map((q) => `<dt>Month ${q.month} · ${q.verse}</dt><dd>${civil(q.start_date)} → ${civil(q.end_date)}</dd>`).join('');
  return `<div class="section"><div class="eyebrow">Selected portal</div>
   <div class="big" style="font-size:30px" data-k="portal">${ROMAN[S.portal]} <span class="geez">${GEEZ[S.portal]}</span></div>
   <div class="sub">where the Sun ${rising ? 'rises' : 'sets'} · ${S.side}${lit ? ` · lit: the Sun ${rising ? 'rose' : 'sets'} here today` : ''}</div>
   <dl class="read"><dt>Common span</dt><dd>${P.common[0].toFixed(3)}° – ${P.common[1].toFixed(3)}°</dd>${last}</dl>
   <div class="eyebrow" style="margin-top:14px">The calendar's passes through it</div><dl class="read">${passes}</dl>
   <p class="note">A morning counts when its ${noun} bearing falls within the portal's common span; a ${noun} in a seam between two portals counts for neither. Each tick on the horizon is one morning of the last pass, at the bearing where the Sun crossed the horizon; the brightest is the latest. The Sun keeps moving after it rises, about 0.15° of bearing a minute, so a few minutes later it has drifted past its own tick.</p></div>`;
}

/** The Sky's reading, under its options (as the Dial's under its title): the body or star selected, or else the one followed, in a line, with
 *  its Follow toggle; a portal selected, where the Sun last crossed in it. The `w` parts are a wide screen's: a phone keeps the line short. */
export function skyReading(doc: YearDoc, sky: SkyInfo | null, followed: Followed | null) {
  const S = sky?.selection ?? null, b = followable(S) ?? followed;
  if (!sky || (!b && S?.kind !== 'portal')) return '';
  const c = doc.calculation, part = (html: string, wide = false) => `<span${wide ? ' class="w"' : ''}>${html}</span>`;
  const name = (n: string, color: string) => `<b style="color:${color}">${n.toUpperCase()}</b>`;
  const crossing = (dec: number) => {
    const rise = horizonAzimuth(dec, c.latitude, true);
    if (rise === null) return dec * c.latitude > 0 ? 'never sets here' : 'never rises here';
    const p = portalAt(rise, doc.portals);
    return p.where === 'within' ? `rises in portal ${ROMAN[p.portal!]}` : p.where === 'seam' ? 'rises in a seam' : 'rises outside the portals';
  };
  if (S?.kind === 'portal') {
    const pas = lastPassage(doc, S.side, S.portal, sky.jd), verb = S.side === 'east' ? 'rose' : 'set';
    return part(name(`portal ${ROMAN[S.portal]}`, C.gold)) + part(S.side === 'east' ? 'where the Sun rises' : 'where the Sun sets', true)
      + part(!pas ? `the Sun has not ${verb} here this year` : pas.daysAgo === 0 ? `the Sun ${verb} here today` : `the Sun last ${verb} here ${pas.daysAgo} d ago`);
  }
  const at = positionOf(sky, b!), alt = at ? part(`${sgn(at.alt, 1)}°`) : '', az = at ? part(`az ${at.az.toFixed(1)}°`, true) : '';
  let html = '';
  if (b!.kind === 'sun') {
    const lit = litPortals(doc, sky.jd).east;
    html = part(name('Sun', C.goldHi)) + az + alt + part(lit ? `rose in portal ${ROMAN[lit]} today` : 'rose outside a portal today', true);
  } else if (b!.kind === 'moon') {
    const d = sky.moonDay, r = sky.moonrise, p = r?.portal;
    html = part(name('Moon', MOON_COLOR)) + (d ? part(`day ${d.day}`) : '') + part(`${(sky.moon.fraction * 14).toFixed(2)}/14`) + az + alt
      + (p ? part(p.where === 'within' ? `rose in portal ${ROMAN[p.portal!]}` : p.where === 'seam' ? 'rose in a seam' : 'rose outside the portals', true) : '');
  } else if (b!.kind === 'planet') {
    const q = sky.planets.find((x) => x.name === (b as { name: string }).name);
    html = part(name(b!.name, PCOL[b!.name])) + az + alt + (q ? part(`mag ${q.mag.toFixed(1)}`, true) + part(crossing(q.dec), true) : '');
  } else {
    const st = b!.star, dec = declinationOfDate(st, skyFrame(sky.jd, c.latitude, c.longitude_east, c.elevation_m).time);
    html = part(name(st.name ?? st.designation ?? st.id, C.ivory)) + (st.constellation ? part(CONSTELLATION_NAMES[st.constellation] ?? st.constellation, true) : '') + part(`mag ${st.mag_v.toFixed(1)}`, true) + az + alt + part(crossing(dec), true);
  }
  const on = sameBody(b, followed);
  return html + `<button class="follow${on ? ' on' : ''}" data-follow aria-pressed="${on}" title="${on ? 'Stop following' : 'The sky turns with it, opening out as it climbs or sinks so the horizon stays in view. Zoom in first and it follows that close. Dragging the sky, East, West or Compass stops it.'}">${on ? 'Following' : 'Follow'}</button>`;
}

/** Local date and time at the site, to the minute. */
const localAt = (doc: YearDoc, jd: number) => new Intl.DateTimeFormat('en-GB', { timeZone: doc.calculation.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  .format(new Date((jd - 2440587.5) * 86400000));
const hoursAgo = (h: number) => (h < 1 ? `${Math.round(h * 60)} min ago` : `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min ago`);

/** The selected Moon: where it is, its light, its own day from the conjunction, and the portal it last rose in (the silver tick on the horizon). */
function moonSection(doc: YearDoc, sky: SkyInfo) {
  const m = sky.moon, d = sky.moonDay, r = sky.moonrise;
  const rose = r ? (r.portal.where === 'within' ? `in portal ${ROMAN[r.portal.portal!]} <span class="geez">${GEEZ[r.portal.portal!]}</span>` : r.portal.where === 'seam' ? 'in a seam between portals' : `outside the six portals, ${r.az < 90 ? 'north' : 'south'} of them`) : '';
  return `<div class="section"><div class="eyebrow">Selected</div><div class="big" style="font-size:30px">Moon</div>
   ${d ? `<div class="sub" data-k="moon-day">day ${d.day} of the Moon · ${(m.fraction * 14).toFixed(2)} of 14 parts lit</div>` : ''}
   <dl class="read"><dt>Now</dt><dd>az ${m.az.toFixed(4)}° · alt ${sgn(m.alt, 4)}°</dd>
   <dt>Illuminated</dt><dd>${(m.fraction * 100).toFixed(2)} % · ${(m.fraction * 14).toFixed(2)}/14</dd>
   ${d ? `<dt>Age</dt><dd>${d.age.toFixed(2)} d since the conjunction</dd><dt>Conjunction</dt><dd>${localAt(doc, d.newMoon)}</dd><dt>Next</dt><dd>${localAt(doc, d.nextNewMoon)}</dd>` : ''}
   ${r ? `<dt>Last rose</dt><dd data-k="moon-portal">${rose}</dd><dt>At bearing</dt><dd>${r.az.toFixed(3)}°</dd><dt>When</dt><dd>${localAt(doc, r.jd)} · ${hoursAgo((sky.jd - r.jd) * 24)}</dd>`
      : '<dt>Last rose</dt><dd data-k="moon-portal">not in the past week</dd>'}</dl>
   <p class="note">The Moon's day counts from the conjunction, when the Sun and Moon share one longitude: day 1 is its first 24 hours. The silver tick on the eastern horizon is where it last rose, at its upper limb on the refracted horizon, as a sunrise. It swings about 5° farther north and south than the Sun, so in some months it rises outside the six portals.</p></div>`;
}

export function skyPanel(doc: YearDoc, i: number, part: number, sky: SkyInfo | null) {
  const days = annual(doc), r = days[i], next = doc.rows[i + 1];
  if (!sky) return `<div class="section"><div class="eyebrow">Sky</div><p class="note">Loading the stars…</p></div>`;
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: doc.calculation.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' })
    .format(new Date((sky.jd - 2440587.5) * 86400000));
  let sel = '';
  const S = sky.selection;
  if (S?.kind === 'star' && sky.selected) {
    const s = S.star, q = sky.selected;
    sel = `<div class="section"><div class="eyebrow">Selected star</div>
     <div class="big" style="font-size:30px" data-k="star">${s.name ?? s.designation ?? s.id}</div>
     <div class="sub">${[s.designation && s.name ? s.designation : '', s.constellation, s.spectral_type].filter(Boolean).join(' · ')}</div>
     <dl class="read"><dt>Catalogue ID</dt><dd>${s.id}${s.hip ? ` · HIP ${s.hip}` : ''}</dd>
     <dt>V · B−V</dt><dd>${s.mag_v.toFixed(2)} · ${s.bv === null ? '—' : s.bv.toFixed(2)}</dd>
     <dt>RA · Dec J2000</dt><dd>${s.ra_deg.toFixed(4)}° · ${sgn(s.dec_deg, 4)}°</dd>
     <dt>Dec of date</dt><dd>${sgn(q.dec, 4)}°</dd>
     <dt>Now</dt><dd>az ${q.az.toFixed(3)}° · alt ${sgn(q.alt, 3)}°</dd>
     <dt>Rises</dt><dd data-k="rise">${q.rise === null ? '—' : `${q.rise.toFixed(3)}°`}</dd>
     <dt>Sets</dt><dd>${q.set === null ? '—' : `${q.set.toFixed(3)}°`}</dd></dl>
     <p class="note" data-k="portal-star">${portalText(q.portal, 'Rises')}; ${portalText(q.portalWest, 'sets').replace(/^S/, 's')}.</p></div>`;
  } else if (S?.kind === 'planet' && sky.selected) {
    const q = sky.selected, p = sky.planets.find((x) => x.name === S.name)!;
    sel = `<div class="section"><div class="eyebrow">Selected planet</div><div class="big" style="font-size:30px" data-k="planet">${S.name}</div>
     <dl class="read"><dt>Now</dt><dd>az ${q.az.toFixed(3)}° · alt ${sgn(q.alt, 3)}°${q.alt < 0 ? ' (below the horizon)' : ''}</dd>
     <dt>Magnitude</dt><dd>${p.mag.toFixed(2)}</dd>
     <dt>Dec of date</dt><dd>${sgn(q.dec, 4)}°</dd>
     <dt>Rises</dt><dd data-k="rise">${q.rise === null ? '—' : `${q.rise.toFixed(3)}°`}</dd>
     <dt>Sets</dt><dd>${q.set === null ? '—' : `${q.set.toFixed(3)}°`}</dd></dl>
     <p class="note" data-k="portal-planet">${portalText(q.portal, 'Rises')}; ${portalText(q.portalWest, 'sets').replace(/^S/, 's')} today. A planet moves against the stars, so where it rises shifts from day to day.</p></div>`;
  } else if (S?.kind === 'portal') {
    sel = portalSection(doc, S, sky.jd);
  } else if (S?.kind === 'sun') {
    sel = `<div class="section"><div class="eyebrow">Selected</div><div class="big" style="font-size:30px">Sun</div>
     <dl class="read"><dt>Now</dt><dd>az ${sky.sun.az.toFixed(4)}° · alt ${sgn(sky.sun.alt, 4)}°</dd></dl></div>`;
  } else if (S?.kind === 'moon') {
    sel = moonSection(doc, sky);
  }
  return `
  <div class="section"><div class="eyebrow">Instant · all around</div>
   <div class="big" data-k="part">${part.toFixed(2)}<small> / 18</small></div>
   <div class="sub">part of Enoch ${r.enoch_date} · sunrise ${fmt.time(r.sunrise_local)} to next sunrise ${fmt.time(next.sunrise_local)}</div>
   <dl class="read"><dt>Local</dt><dd>${local}</dd>
   <dt>JD</dt><dd data-k="sky-jd">${sky.jd.toFixed(6)} UT</dd>
   <dt>Sun</dt><dd>az ${sky.sun.az.toFixed(4)}° · alt ${sgn(sky.sun.alt, 3)}°</dd>
   <dt>Moon</dt><dd>az ${sky.moon.az.toFixed(3)}° · alt ${sgn(sky.moon.alt, 3)}° · ${(sky.moon.fraction * 100).toFixed(1)} %${sky.moonDay ? ` · day ${sky.moonDay.day}` : ''}</dd>
   <dt>Planets up</dt><dd data-k="planets-up">${sky.planets.filter((p) => p.alt > 0).map((p) => p.name).join(' · ') || 'none'}</dd>
   <dt>Stars drawn</dt><dd>${sky.shown.toLocaleString('en-US')}</dd></dl></div>
  ${sel}
  ${correctionSection(doc, i)}${courseSection(doc, i)}
  ${namesSection(doc, S)}
  <div class="section"><div class="eyebrow">Conventions</div><p class="note">Gold stars rise (or set) within the six portals: the Sun's declination band. Gold dashes: the ecliptic of date.</p></div>
  <div class="section"><div class="eyebrow">Sources</div><p class="note">HYG 4.1 (David Nash / Astronomy Nexus) and Stellarium figures, CC BY-SA 4.0, modified exports. <a href="/sky/HYG-LICENSE.txt">HYG licence</a> · <a href="/sky/STELLARIUM-LICENSE.md">Stellarium terms</a> · <a href="/legal/ASTRONOMY-ENGINE-LICENSE.txt">Astronomy Engine (MIT)</a></p></div>
  ${legend()}`;
}


function namesSection(doc: YearDoc, S: SkyInfo['selection']) {
  const N = doc.text.names, Q = doc.text.quotes;
  const sun = N.sun.map((n) => `${n.name} <span class="ref">${n.verse}</span>`).join(' · '), moon = N.moon.map((n) => n.name).join(' · ');
  const quotes = S?.kind === 'sun' ? verse(Q['72:4'], '72:4') + verse(Q['78:1'], '78:1') : S?.kind === 'moon' ? verse(Q['78:2'], '78:2') : '';
  return `<div class="section"><div class="eyebrow">The luminaries named · 1 Enoch</div>
   <dl class="read"><dt>Sun</dt><dd class="txt" style="white-space:normal" data-k="sun-names">${sun}</dd>
   <dt>Moon</dt><dd class="txt" data-k="moon-names">${moon} <span class="ref">78:2</span></dd></dl>
   ${quotes || '<p class="note">Select the Sun or the Moon for the verses that name them.</p>'}</div>
  <div class="section"><div class="eyebrow">Who showed it · Uriel · 72:1, 75:3</div>
   ${verse(Q['72:1 Uriel'], '72:1')}${verse(Q['75:3'], '75:3')}
   <p class="note">The courses of the luminaries are shown to Enoch by the holy angel Uriel, whom the Lord of glory set over them. The calendar is given to Enoch by Uriel; no Watcher is its source.</p></div>`;
}

