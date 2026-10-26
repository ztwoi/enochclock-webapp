// Sky's compass mode (roadmap A.3–A.4): the panorama all around turns with the device. The heading is the
// device's own (src/compass/compass.ts), passed as read: the panorama eases it once (src/sky/heading.ts).
// Magnetic → true by WMM2025 at the device's location, which compass mode requires, or — better — by a
// calibration on the real Sun or Moon, there and now. The sky drawn stays the chosen site and moment
// (stand anywhere, set Giza in 2560 BCE, turn to the portals).
import { type CompassStatus, type Reading } from '../compass/compass';
import { hub } from '../compass/hub';
import { decimalYear, declination } from '../compass/wmm';
import { jdFromMs } from '../model';
import { skyFrame } from './astronomy';
import { aberrated, moon, refracted } from './instrument';
import { failMessage, locate, type FailKind } from '../geo/location';

export type Phase = 'off' | 'starting' | 'locating' | 'no-location' | CompassStatus;
/** Where the device is: for true north and for the real Sun and Moon, now. */
export interface Here { lat: number; lon: number; elev: number; accuracy: number }
export type Body = 'sun' | 'moon';
const NAME: Record<Body, string> = { sun: 'Sun', moon: 'Moon' };

const MESSAGE: Partial<Record<Phase, string>> = {
  starting: 'Starting the compass…',
  insecure: 'The compass needs HTTPS: open this page at its https:// address.',
  unsupported: 'This device has no compass (desktop browsers have none). Drag the panorama to turn it.',
  denied: 'Motion & orientation access was declined. Allow it for this site (on iPhone: Settings → Safari → Motion & Orientation Access), then tap Compass again.',
  locating: 'Finding your location, for true north where you stand…',
  waiting: 'Waiting for the first compass reading… move the device in a figure of eight if it stays silent.',
};
/** What the drawn sky is: its site, its instant (UT JD) and Gregorian date, the year, the site's time zone. */
export interface Drawn { name: string; lat: number; lon: number; jd: number; date: string; year: number; tz: string }
/** Beyond these the drawn sky is not the sky around you now: a site farther than 25 km, an instant more than 5 minutes
 *  away (the sky turns 1.25° in 5 minutes), and a year more than 1,000 from the present. */
const NEAR_KM = 25, NOW_MIN = 5, ERA_YEARS = 1000;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const p = a.lat * D, q = b.lat * D, h = Math.sin((q - p) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(((b.lon - a.lon) * D) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
};

/** Calibration averages the last second of readings, and refuses a hand that moved more than this (degrees, circular SD). */
const STEADY_MS = 1000, STEADY_SD = 2;
const D = Math.PI / 180;

const magnetic = (r: Reading) => `${r.magnetic.toFixed(1)}°`;
/** The heading's source, as short as the panel's other values. */
const sensor = (r: Reading) => `${r.source === 'ios' ? 'iOS compass' : 'orientation'} · ${r.pose}${r.accuracy !== null ? ` · ±${r.accuracy.toFixed(0)}°` : ''}`;
const sgn = (v: number, d: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(d)}`;
const ll = (lat: number, lon: number) => `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;

/** Circular mean and standard deviation (degrees) of headings. */
export function circular(hs: number[]) {
  let s = 0, c = 0;
  for (const h of hs) { s += Math.sin(h * D); c += Math.cos(h * D); }
  const R = Math.min(1, Math.hypot(s, c) / hs.length);
  return { mean: ((Math.atan2(s, c) / D) + 360) % 360, sd: Math.sqrt(-2 * Math.log(R)) / D };
}

/** The real Sun and Moon where the device is, now: apparent places, refracted (standard atmosphere). */
function bodiesNow(h: Here) {
  const f = refracted(aberrated(skyFrame(jdFromMs(Date.now()), h.lat, h.lon, h.elev)));
  const m = moon(f);
  return { sun: { az: f.sun.az, alt: f.sun.alt }, moon: { az: m.az, alt: m.alt } };
}

/** `onHeading`: each true heading as read; `onChange`: the phase, the card or the calibration changed. */
export function createSkyCompass(onHeading: (trueHeading: number) => void, onChange: () => void) {
  let phase: Phase = 'off', here: Here | null = null, failed: FailKind = 'unavailable', reading: Reading | null = null, run = 0;
  let card = false, offered = false, cardNote = '', calibrated: { body: Body; offset: number } | null = null;
  const recent: { t: number; m: number }[] = [];                // magnetic headings of the last second, for calibration
  const phaseNote = () => phase === 'no-location' ? `Compass mode needs your location, for true north where you stand. ${failMessage(failed).replace(/ tap Retry\.$/, ' tap Compass again.')}` : MESSAGE[phase] ?? '';
  const set = (p: Phase) => { phase = p; onChange(); };
  const compass = hub.compass;
  hub.onReading((r) => {
    if (!here) return;                                           // no true north without the location
    reading = r; onHeading(r.heading);
    const t = performance.now(); recent.push({ t, m: r.magnetic });
    while (recent.length && recent[0].t < t - STEADY_MS) recent.shift();
    if (phase !== 'live') { if (!offered) { offered = true; card = true; cardNote = ''; } set('live'); }   // guided: offered once it reads
  });
  const reset = () => { here = null; reading = null; recent.length = 0; card = false; offered = false; cardNote = ''; calibrated = null; compass.clearCalibration(); hub.setDeviceDeclination(null); };

  /** A body's button on the card: its bearing where you are, now; off below the horizon. */
  function bodyButton(b: Body, at: { az: number; alt: number }) {
    const up = at.alt > 0;
    return `<button class="btn${up ? ' on' : ''}" data-sky-cal="${b}" ${up ? '' : 'disabled'}>${NAME[b]}<small>${up ? `${at.az.toFixed(1)}° · ${at.alt.toFixed(0)}° up` : 'below the horizon'}</small></button>`;
  }

  /** Where the device is, for true north and the real Sun and Moon. `own`: this view started the sensor, so a failure stops it; otherwise the sensor stays for the others. */
  async function locateHere(me: number, own: boolean) {
    set('locating');
    try { const h = await locate({ timeout: 15000, maximumAge: 60000 }); if (me !== run) return; here = h; }
    catch (e) { if (me === run) { failed = (e as { kind?: FailKind }).kind ?? 'unavailable'; if (own) hub.stop(); set('no-location'); } return; }
    hub.setDeviceDeclination(declination(here.lat, here.lon, here.elev / 1000, decimalYear(Date.now())));
    if (phase === 'locating') set('waiting');
  }

  return {
    get phase() { return phase; },
    get on() { return phase !== 'off'; },
    get calibration() { return calibrated; },
    /** Must run from the tap: iOS asks for motion & orientation first, inside it; then the location. */
    async start() {
      const me = ++run; reset(); set('starting');
      const s = await hub.start();
      if (me !== run) return;
      if (s !== 'waiting' && s !== 'live') { set(s); return; }
      await locateHere(me, true);
    },
    /** The sensor is already on (the Dial, or a reload, turned it on): follow it here too, with no second tap. */
    async adopt() {
      if (phase !== 'off' || !hub.active) return;
      const me = ++run; reset(); set('starting');
      if (hub.status === 'off') { const s = await hub.start(); if (me !== run) return; if (s !== 'waiting' && s !== 'live') { set(s); return; } }   // still asking: wait for its answer
      await locateHere(me, false);
    },
    /** Off here and everywhere: the sensor stops with it. */
    stop() { run++; hub.stop(); reset(); if (phase !== 'off') set('off'); },
    /** The sensor was turned off elsewhere (the Dial): off here too, without stopping what is already stopped. */
    released() { run++; reset(); if (phase !== 'off') set('off'); },
    /** The prompt to show over the sky, or '' (live, or off, or the card is open). */
    note: () => (card ? '' : phaseNote()),

    // ---- calibration on the real Sun or Moon (A.4)
    get cardOpen() { return card && phase === 'live'; },
    openCard() { if (phase === 'live') { card = true; cardNote = ''; onChange(); } },
    closeCard() { card = false; cardNote = ''; onChange(); },
    /** The phone points at `b` now: the last second's mean magnetic heading becomes its true bearing. */
    calibrate(b: Body) {
      if (!here) return;
      const at = bodiesNow(here)[b];
      if (at.alt <= 0) { cardNote = `The ${NAME[b]} is below the horizon where you are.`; onChange(); return; }
      if (recent.length < 3) { cardNote = 'No compass readings yet: hold the phone toward it for a moment, then tap again.'; onChange(); return; }
      const { mean, sd } = circular(recent.map((x) => x.m));
      if (sd > STEADY_SD) { cardNote = `Hold the phone still toward the ${NAME[b]} for a moment, then tap again.`; onChange(); return; }
      calibrated = { body: b, offset: compass.calibrate(at.az, mean) };
      card = false; cardNote = '';
      onHeading((mean + calibrated.offset + 360) % 360);          // the view turns to the corrected heading now
      onChange();
    },
    useDeclination() { calibrated = null; compass.clearCalibration(); onChange(); },
    /** The calibration card, shown over the sky. */
    cardHtml() {
      if (!here) return '';
      const now = bodiesNow(here), noneUp = now.sun.alt <= 0 && now.moon.alt <= 0;
      return `<div class="eyebrow">Calibrate the compass</div>
       <p>A phone compass is often 5–15° off, and a portal is about 10° wide. Point the phone at the Sun or the Moon and tap it: the sky then turns true.</p>
       <p class="note">Upright, aim the back camera at it; flat, the top edge. Do not look straight at the Sun.</p>
       <div class="row">${bodyButton('sun', now.sun)}${bodyButton('moon', now.moon)}<button class="btn" data-sky-cal="later">Not now</button></div>
       ${noneUp ? '<p class="note">Neither the Sun nor the Moon is up where you are: the compass uses the magnetic declination.</p>' : ''}
       ${cardNote ? `<p class="warn" role="alert">${cardNote}</p>` : ''}`;
    },

    /** The details panel's Compass section. */
    html(drawn: Drawn) {
      const r = reading, msg = phaseNote();
      // Observer names come from URLs or storage; escape only at these HTML text boundaries.
      const name = drawn.name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      // A.5: say so when the sky drawn is not the sky around you, now
      const away = here ? km(here, drawn) : 0, late = Math.abs(drawn.jd - jdFromMs(Date.now())) * 1440, era = Math.abs(drawn.year - new Date().getUTCFullYear());
      const at = new Intl.DateTimeFormat('en-GB', { timeZone: drawn.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date((drawn.jd - 2440587.5) * 86400000));
      const not = [
        here && away > NEAR_KM ? `for ${name}, ${away < 1000 ? away.toFixed(0) : Math.round(away).toLocaleString('en-US')} km from you` : '',
        late > NOW_MIN ? `for ${drawn.date} at ${at}, not now (the sky turns 15° an hour; Now draws this moment)` : '',
      ].filter(Boolean);
      const drawnNote = (not.length ? `<p class="note" data-k="sky-not-here">The sky is drawn ${not.join(', and ')}: it is not the sky around you.</p>` : '')
        + (era > ERA_YEARS ? `<p class="note" data-k="sky-era">Far from the present the drawn sky is less exact (Astronomy Engine against Swiss Ephemeris: about 0.5° at 2559 BCE, up to 6° at ±12,000 years). The portals are Swiss Ephemeris at every era.</p>` : '');
      return `<div class="section" data-k="sky-compass"><div class="eyebrow">Compass</div>
       ${msg ? `<p class="note">${msg}</p>` : ''}
       <dl class="read"><dt>Facing</dt><dd data-k="sky-heading">${r ? `${r.heading.toFixed(1)}° true` : '—'}</dd>
        <dt>Magnetic</dt><dd data-k="sky-magnetic">${r ? magnetic(r) : '—'}</dd>
        <dt>Sensor</dt><dd data-k="sky-sensor">${r ? sensor(r) : '—'}</dd>
        <dt>True north</dt><dd data-k="sky-north">${calibrated ? `${NAME[calibrated.body]} · ${sgn(calibrated.offset, 2)}°` : here ? `WMM2025 · ${sgn(compass.declination, 2)}°` : '—'}</dd>
        <dt>You</dt><dd data-k="sky-here">${here ? ll(here.lat, here.lon) : '—'}</dd>
        <dt>Located to</dt><dd>${here ? `±${Math.round(here.accuracy)} m` : '—'}</dd>
        <dt>Sky drawn at</dt><dd>${ll(drawn.lat, drawn.lon)}</dd></dl>
       ${phase === 'live' ? `<p class="actions"><button class="btn" data-sky-cal="open">${calibrated ? 'Recalibrate' : 'Calibrate on the Sun or Moon'}</button>${calibrated ? '<button class="btn" data-sky-cal="clear">Use declination</button>' : ''}</p>` : ''}
       ${drawnNote}
       <p class="note">The heading is the device's, now, where you stand: true north ${calibrated ? `from the ${NAME[calibrated.body]}, where it is now` : 'from the magnetic declination there'}. The sky and portals are drawn at the chosen site, ${name}, and moment.</p></div>`;
    },
    /** Refresh the live readouts in place (no redraw of the panel). */
    tick(root: ParentNode) {
      const r = reading; if (!r) return;
      const h = root.querySelector('[data-k=sky-heading]'), m = root.querySelector('[data-k=sky-magnetic]'), n = root.querySelector('[data-k=sky-sensor]');
      if (h) h.textContent = `${r.heading.toFixed(1)}° true`;
      if (m) m.textContent = magnetic(r);
      if (n) n.textContent = sensor(r);
    },
  };
}
