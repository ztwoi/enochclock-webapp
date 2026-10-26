// Look test (version 2, second cut): the machine seen from above. The app's own Dial, dimmed, is the floor; the globe
// at its centre; the twelve portals standing on its horizon, revealed out of the shadow. Then one day: the Sun comes
// forth from its portal, crosses over the south, goes down into its western portal and returns under the north
// (72:5), its eighteen parts marked; as it sets, the full Moon comes forth in the east, and the stars come forth over
// the rim, the leaders of the stars (those rising within the portals) in gold (72:3).
import { useMemo, type ReactNode } from 'react';
import { staticFile } from 'remotion';
import * as THREE from 'three';
import { GEEZ, ROMAN, annual } from '../../../src/model';
import { skyFrame, starVector } from '../../../src/sky/astronomy';
import { starColor } from '../../../src/sky/appearance';
import { decodeStars, type Star } from '../../../src/sky/catalogue';
import { moon as moonOf } from '../../../src/sky/instrument';
import type { Portal, YearDoc } from '../../../src/types';
import { cond, ease, geez, GEEZ_ON, getJSON, ink, mono, ramp, serif, useData, useScene } from '../shared';
const num = (n: number) => (GEEZ_ON ? GEEZ[n] : String(n));
import { dialImage } from './dialTexture';
import { createHeaven } from './heaven';
import { createMachine, decForSunrise, onCircle, sunriseH, type Gate, type Machine, type MState, type StarM } from './machine';
import { dialState, ringRotation } from '../../../src/dial/state';
import { DR } from '../../../src/dial/render';
type Heaven = ReturnType<typeof createHeaven>;

import { MT, SPEED } from './timeline';
export { MT };
/** The day shown: the full Moon of the first month (day index 9), the Sun still in the fourth portal. */
const DAY = 9;
const STAR_LIMIT = 6.2, D = Math.PI / 180;                     // most of the naked-eye sky under a dark sky (6.5 was all of it, 8,920 stars; 6.2 is 6,317: the faintest thin out)

interface Data { doc: YearDoc; stars: Star[] }
const load = async (): Promise<Data> => {
  const doc = await getJSON<YearDoc>('data/sun.json');
  const chunk = async (f: string) => decodeStars(await (await fetch(staticFile(`sky/${f}`))).json());
  const stars = [...await chunk('stars-le6.json'), ...await chunk('stars-6to8.json')].filter((s) => s.mag_v <= STAR_LIMIT).sort((a, b) => a.mag_v - b.mag_v);
  return { doc, stars };
};

/** Each portal's span on the rim; where neighbours' measured spans overlap, the overlap is split at its middle. */
function edges(ps: Portal[]) {
  const s = [...ps].sort((a, b) => a.union[0] - b.union[0]);
  return s.map((p, k) => ({ portal: p.portal, az0: k ? (s[k - 1].union[1] + p.union[0]) / 2 : p.union[0], az1: k < s.length - 1 ? (p.union[1] + s[k + 1].union[0]) / 2 : p.union[1] }));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Cam = { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3; fov: number };
const mix = (a: Cam, b: Cam, t: number): Cam => ({ pos: a.pos.clone().lerp(b.pos, t), look: a.look.clone().lerp(b.look, t), up: a.up.clone().lerp(b.up, t).normalize(), fov: lerp(a.fov, b.fov, t) });

/** One morning's eighteen parts, whole: the Sun's circle and the Dial's wheel as they stand on that day (t: a fractional morning
 *  of the year). `from`: the middle of each part on the Sun's circle; `to`: the same on the Dial's wheel; `rot`: the bearing
 *  of the wheel's first boundary; `parts`: the daylight in parts; `dec`: the circle's declination. */
interface PartsAt { from: THREE.Vector3[]; to: THREE.Vector3[]; rot: number; parts: number; dec: number }

export interface MachineView {
  host: React.RefObject<HTMLDivElement | null>; m: Machine | null; heaven: Heaven | null; doc: YearDoc | undefined;
  /** The machine's state at local frame g (everything but the camera). */
  state: Omit<MState, 'camera'>;
  /** The machine's own camera at local frame g. */
  camera: MCam;
  /** The overlays (gate numerals, readout, captions) for local frame g, drawn for a camera. */
  overlays: (camera: MCam, hud?: boolean, captions?: boolean) => ReactNode;
  extra: { courseBearing0: number[]; course0: number; nextYearCourse: string; servingAt: (t: number) => string; courseBearing: number[]; courseNames: string[]; courseRadius: number; courseDayRadius: number; partsR: [number, number]; monthR: [number, number]; dayBearing: number[]; monthRadius: number; moonG: { rise: number; set: number; riseAz: number; setAz: number } | null; partsFrom: THREE.Vector3[]; partsTo: THREE.Vector3[]; partsAt: (t: number) => PartsAt; ten: number; peak: number; lat: number; jdAt: (g: number) => number; skyAt: ((jd: number) => { stars: { az: number; alt: number }[] }) | null; lead: boolean[]; names: (string | null)[]; mags: number[]; gates: (Gate & { side: string })[] };
}
type MCam = MState['camera'];

/** The machine scene at local frame g (g < 0: before it begins). With `heaven`, the house and the ascent share its world. */
export function useMachine(g: number, heaven = false): MachineView {
  const data = useData(load);
  const [host, made] = useScene<{ m: Machine; heaven: Heaven | null; dispose(): void }>(async (el) => {
    const d = await load(), rows = annual(d.doc);
    const at = rows[DAY].sunrise_jd_ut + .01, dial = await dialImage(d.doc, at);
    const layers = heaven ? {
      parts: await dialImage(d.doc, at, 2048, ['.dl-ring-parts']), grid: await dialImage(d.doc, at, 2048, ['.dl-world', '.dl-centre']),
      months: await dialImage(d.doc, at, 2048, ['.dl-ring-position']), courses: await dialImage(d.doc, at, 2048, ['.dl-ring-courses']),
    } : {};
    const m = createMachine(el, d.doc.calculation.latitude, rows.map((r) => r.azimuth_deg), d.doc.extended.slice(0, rows.length).map((e) => e.sunset_azimuth_deg), dial, layers);
    return { m, heaven: heaven ? createHeaven(m.scene) : null, dispose: m.dispose };
  });
  const m = made?.m ?? null;
  const doc = data?.doc, rows = doc ? annual(doc) : [], lat = doc?.calculation.latitude ?? 48;

  // ---- one day, sunrise to sunrise
  const orbit = ease(ramp(g, MT.orbit[0], MT.orbit[1]));
  const dec = rows.length ? decForSunrise(lat, rows[DAY].azimuth_deg) : 0, H0 = sunriseH(lat, dec);
  // Time never stops: the heaven always turns slowly (an hour of sky every two seconds), and the one day is carried
  // on top of that drift, so before the day the Sun is still under the north nearing its rising, and after it rises again.
  const S = rows.length ? rows[DAY].sunrise_jd_ut : 0, dayLen = rows.length ? rows[DAY + 1].sunrise_jd_ut - S : 1;
  const SLOW = 1 / 24 / 60, span = MT.orbit[1] - MT.orbit[0];
  const jd = S + SLOW * (g - MT.orbit[0]) + (dayLen - SLOW * span) * orbit;
  const jdAt = (gg: number) => S + SLOW * (gg - MT.orbit[0]) + (dayLen - SLOW * span) * ease(ramp(gg, MT.orbit[0], MT.orbit[1]));
  const dayFrac = (jd - S) / dayLen;
  const sunH = H0 + 2 * Math.PI * dayFrac, sunOn = ramp(g, MT.orbit[0] - 20, MT.orbit[0] + 10);

  // ---- the portals, standing, revealed out of the shadow: east then west, from the middle outward
  const gates: (Gate & { side: string })[] = useMemo(() => {
    if (!doc) return [];
    const order = [4, 3, 5, 2, 6, 1];
    return [...edges(doc.portals).map((x) => ({ ...x, side: 'east', rise: 0 })), ...edges(doc.portals_west).map((x) => ({ ...x, side: 'west', rise: 0 }))]
      .map((x) => ({ ...x, rise: order.indexOf(x.portal) + (x.side === 'west' ? 3 : 0) }));
  }, [doc]);
  const gateState = gates.map((x) => ({ ...x, rise: ease(ramp(g, 55 + x.rise * 14, 95 + x.rise * 14)) }));

  // ---- the stars at this instant; the leaders are those whose rising falls within the eastern portals
  const sky = useMemo(() => {
    if (!data || !rows.length) return null;
    const c = data.doc.calculation, t0 = skyFrame(rows[DAY].sunrise_jd_ut, c.latitude, c.longitude_east, 0).time;
    const vecs = data.stars.map((s) => starVector(s, t0));
    const span = edges(data.doc.portals), lo = Math.min(...span.map((x) => x.az0)), hi = Math.max(...span.map((x) => x.az1));
    const first = skyFrame(rows[DAY].sunrise_jd_ut, c.latitude, c.longitude_east, 0), sl = Math.sin(c.latitude * D), cl = Math.cos(c.latitude * D);
    const lead = vecs.map((v) => {
      const h = first.direction(v), sd = sl * Math.sin(h.alt * D) + cl * Math.cos(h.alt * D) * Math.cos(h.az * D);   // declination of date
      const x = sd / cl; if (Math.abs(x) >= 1) return false;
      const rise = Math.acos(x) / D; return rise >= lo && rise <= hi;
    });
    return { at: (t: number) => { const fr2 = skyFrame(t, c.latitude, c.longitude_east, 0); return { stars: vecs.map((v) => fr2.direction(v)), moon: moonOf(fr2) }; }, lead };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useMemo(() => (sky ? sky.at(jd) : null), [sky, jd]);
  const stars: StarM[] = useMemo(() => (data && sky && now ? now.stars.map((p, k) => ({ az: p.az, alt: p.alt, mag: data.stars[k].mag_v, rgb: starColor(data.stars[k].bv), lead: sky.lead[k], name: data.stars[k].name })) : []), [data, sky, now]);
  // when the Moon comes up out of its portal and goes down into the other, through the machine's day (read off the same sky as everything
  // else): its path is drawn as it travels it, so it comes after the Sun's, which is drawn from sunrise
  const moonG = useMemo(() => {
    if (!data) return null;
    const c = data.doc.calculation; let prev: number | null = null, rise = -1, set = -1, riseAz = 0, setAz = 0;
    for (let gg = MT.orbit[0]; gg <= MT.end; gg += 2) {
      const m = moonOf(skyFrame(jdAt(gg), c.latitude, c.longitude_east, 0));
      if (prev !== null) { if (rise < 0 && prev <= 0 && m.alt > 0) { rise = gg; riseAz = m.az; } else if (rise >= 0 && set < 0 && prev > 0 && m.alt <= 0) { set = gg; setAz = m.az; } }
      prev = m.alt;
    }
    return rise >= 0 && set >= 0 ? { rise, set, riseAz, setAz } : null;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const pathReveal = moonG ? (g < moonG.rise ? -1 : ramp(g, moonG.set, moonG.set + 40)) : undefined;   // hidden until it rises; follows it; closes into the whole circle once it has set
  const moon = now ? { az: now.moon.az, alt: now.moon.alt, fraction: now.moon.fraction, on: ramp(g, MT.orbit[0], MT.orbit[0] + 30), pathReveal } : null;

  // ---- the camera: from above, east at the top; down beside the machine; round to the south to see east and west at once
  const top: MCam = { pos: V(-70, 340, 0), look: V(4, 0, 0), up: V(1, 0, 0), fov: 42 };
  const low: MCam = { pos: V(-150, 62, 170), look: V(0, 8, 0), up: V(0, 1, 0), fov: 42 };
  const south: MCam = { pos: V(-25, 74, 222), look: V(0, 10, -4), up: V(0, 1, 0), fov: 44 };
  const camera = g < 200 ? top : g < 330 ? mix(top, low, ease(ramp(g, 200, 330))) : mix(low, south, ease(ramp(g, 330, 560)));

  const state = { stars, lat, moon, dec, draw: Math.max(0, Math.min(1, dayFrac)), sunH, sunOn, ghosts: [], parts: ramp(g, MT.orbit[0], MT.orbit[0] + 30), gates: gateState, day: -1, reveal: ease(ramp(g, MT.reveal[0], MT.reveal[1])), time: g / 30 };
  const overlays = (cam: MCam, hud = true, captions = true) => {
    if (!doc || !m) return null;
    const e = doc.extended[DAY], r = rows[DAY], morning = DAY - rows.findIndex((x) => x.month === r.month) + 1;
    return (
      <>
        {gateState.filter((x) => x.side === 'east' && x.rise > .5).map((x) => {
          const p = m.project(m.gateTop(x), cam);
          return p ? <div key={x.portal} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', font: `400 30px ${GEEZ_ON ? geez : serif}`, color: ink.goldHi, opacity: (x.rise - .5) * 2 * .9, textShadow: '0 0 14px rgba(244,220,159,.5)' }}>{num(x.portal)}</div> : null;
        })}
        {hud && g >= MT.orbit[0] && (
          <div style={{ position: 'absolute', right: 96, top: 64, textAlign: 'right', opacity: ramp(g, MT.orbit[0], MT.orbit[0] + 30) }}>
            <div style={{ font: `400 13px ${cond}`, color: ink.ivory3, letterSpacing: '.28em' }}>PORTAL</div>
            <div style={{ font: `400 60px ${GEEZ_ON ? geez : serif}`, color: ink.goldHi, lineHeight: 1.1 }}>{num(e.portal)}</div>
            <div style={{ font: `400 15px ${mono}`, color: ink.ivory2, letterSpacing: '.14em' }}>MONTH {ROMAN[r.month]} · MORNING {morning}</div>
            <div style={{ font: `400 13px ${cond}`, color: ink.ivory3, letterSpacing: '.28em', marginTop: 22 }}>LIGHT · DARKNESS</div>
            <div style={{ font: `300 34px ${mono}`, color: ink.goldHi }}>{e.day_parts.toFixed(1)} <span style={{ color: ink.ivory3 }}>:</span> <span style={{ color: '#8fa3c8' }}>{(18 - e.day_parts).toFixed(1)}</span></div>
            <div style={{ font: `400 13px ${mono}`, color: ink.ivory3, letterSpacing: '.12em' }}>OF EIGHTEEN PARTS</div>
          </div>
        )}
        {captions && <Caption f={g} from={40} to={210} geezText="ወዝንቱ ውእቱ ትእዛዝ ቀዳማዊ ዘብርሃናት ፀሐይ ብርሃን ሙፃኡ በኀዋኅወ ሰማይ እለ መንገለ ጽባሕ ወምዕራቢሁ በኀዋኅወ ሰማይ ዘምዕራብ" text="And this is the first law of the luminaries: the luminary the Sun has its rising in the eastern portals of the heaven, and its setting in the western portals of the heaven." refText="1 Enoch 72:2" />}
        {captions && <Caption f={g} from={225} to={420} geezText="ወየዐርብ ፀሐይ እምሰማይ ወይገብእ እንተ መስዕ ከመ ይሑር ምሥራቀ ወይትመራሕ ከመ ይባእ ኀበ ዝኩ ኆኅት ወያበርህ በገጸ ሰማይ" text="…and the sun goes down from the heaven and returns through the north in order to reach the east, and is so guided that he comes to the appropriate portal and shines in the face of the heaven." refText="1 Enoch 72:5" />}
        {captions && <Caption f={g} from={435} to={MT.end + 30} geezText="ወወርኅ በውእቶን ኀዋኅው ይሠርቅ ወየዐርብ ወመራሒሆሙ ለከዋክብት ምስለ እለ ይመርሕዎሙ" text="…and the moon rises and sets in these portals, and the leaders of the stars and those whom they lead…" refText="1 Enoch 72:3" />}
      </>
    );
  };
  // ---- for the Dial sequence: where the Dial's wheel of parts lies (the texture was drawn at `at`), and the sky at any frame
  const partsTo = useMemo(() => {
    if (!doc) return [] as THREE.Vector3[];
    const ds = dialState(doc, rows[DAY].sunrise_jd_ut + .01, [], 'north'), rot = ringRotation(ds.needle, ds.phases.parts, 18, 1), r = ((DR.pt0 + DR.pt1) / 2 / 376) * 100;
    return Array.from({ length: 18 }, (_, k) => { const b = (rot + (k + .5) * 20) * D; return V(Math.sin(b) * r, .4, -Math.cos(b) * r); });
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  // the day's length where the text puts it: the first morning of ten parts (72:10) and the morning of the longest day (72:14),
  // read off the calculator's own mornings, not named by hand
  const { ten, peak } = useMemo(() => {
    const dp = doc ? doc.extended.slice(0, rows.length).map((e) => e.day_parts) : [];
    return { ten: Math.max(0, dp.findIndex((x) => x >= 10)), peak: dp.length ? dp.indexOf(Math.max(...dp)) : 0 };
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const partsAt = useMemo(() => {
    const cache = new Map<number, number>(), R = ((DR.pt0 + DR.pt1) / 2 / 376) * 100;
    const rotOn = (i: number) => {
      if (!cache.has(i)) { const ds = dialState(doc!, rows[i].sunrise_jd_ut + .01, [], 'north'); cache.set(i, ringRotation(ds.needle, ds.phases.parts, 18, 1)); }
      return cache.get(i)!;
    };
    return (t: number): PartsAt => {
      const i = Math.max(0, Math.min(rows.length - 2, Math.floor(t))), fr = Math.max(0, Math.min(1, t - i));
      const r0 = rotOn(i), r1 = r0 + ((((rotOn(i + 1) - r0 + 540) % 360) + 360) % 360 - 180);           // the short way round
      const rot = lerp(r0, r1, fr), parts = lerp(doc!.extended[i].day_parts, doc!.extended[i + 1].day_parts, fr);
      const dec = decForSunrise(lat, lerp(rows[i].azimuth_deg, rows[i + 1].azimuth_deg, fr)), h0 = sunriseH(lat, dec);
      return {
        rot, parts, dec,
        from: Array.from({ length: 18 }, (_, k) => onCircle(lat, dec, h0 + (2 * Math.PI * (k + .5)) / 18)),
        to: Array.from({ length: 18 }, (_, k) => { const b = (rot + (k + .5) * 20) * D; return V(Math.sin(b) * R, .4, -Math.cos(b) * R); }),
      };
    };
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const partsFrom = Array.from({ length: 18 }, (_, k) => onCircle(lat, dec, H0 + (2 * Math.PI * (k + .5)) / 18));
  // where each day of the year lies on the Dial's month wheel (bearing, °), as the texture was drawn
  const dayBearing = useMemo(() => {
    if (!doc) return [] as number[];
    const ds = dialState(doc, rows[DAY].sunrise_jd_ut + .01, [], 'north'), rot = ringRotation(ds.needle, ds.phases.position, 364, -1);
    return Array.from({ length: 364 }, (_, p) => rot - ((p + .5) * 360) / 364);
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  // where each of the 24 courses lies on the Dial's course wheel (bearing, °), in the clock's (Qumran) order
  const courseBearing = useMemo(() => {
    if (!doc) return [] as number[];
    const ds = dialState(doc, rows[DAY].sunrise_jd_ut + .01, [], 'north'), rot = ringRotation(ds.needle, ds.phases.courses, 24, -1);
    return Array.from({ length: 24 }, (_, k) => rot - (k + .5) * 15);
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  // the course wheel as the Dial draws it on the year's first morning (where the week settles before the Dial glides on)
  const courseBearing0 = useMemo(() => {
    if (!doc) return [] as number[];
    const ds = dialState(doc, rows[0].sunrise_jd_ut + .01, [], 'north'), rot = ringRotation(ds.needle, ds.phases.courses, 24, -1);
    return Array.from({ length: 24 }, (_, k) => rot - (k + .5) * 15);
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const course0 = doc ? doc.extended[0].course - 1 : 0, nextYearCourse = doc ? doc.extended[rows.length]?.course_name ?? '' : '';
  const extra = { courseBearing0, course0, nextYearCourse, servingAt: (t: number) => doc?.extended[Math.max(0, Math.min(rows.length - 1, Math.floor(t)))].course_name ?? '', courseBearing, courseNames: doc?.priests.courses.map((c) => c.name) ?? [], courseRadius: ((DR.crs0 + DR.crs1) / 2 / 376) * 100, courseDayRadius: ((DR.dy0 + DR.dy1) / 2 / 376) * 100, partsR: [DR.pt0 / 376 * 100, DR.pt1 / 376 * 100] as [number, number], monthR: [DR.mo0 / 376 * 100, DR.mo1 / 376 * 100] as [number, number], dayBearing, monthRadius: ((DR.mo0 + DR.mo1) / 2 / 376) * 100, moonG, partsFrom, partsTo, partsAt, ten, peak, lat, jdAt, skyAt: sky ? sky.at : null, lead: sky?.lead ?? [], names: data?.stars.map((x) => x.name) ?? [], mags: data?.stars.map((x) => x.mag_v) ?? [], gates: gateState };
  return { host, m, heaven: made?.heaven ?? null, doc, state, camera, overlays, extra };
}

function Caption({ f, from, to, geezText, text, refText }: { f: number; from: number; to: number; geezText: string; text: string; refText: string }) {
  const o = ramp(f, from, from + 18 * SPEED) * (1 - ramp(f, to - 18 * SPEED, to));   // the fade lasts the same on screen at any speed
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 110, bottom: 84, width: 1000, opacity: o }}>
      {GEEZ_ON && <div style={{ font: `400 25px ${geez}`, color: ink.gold, lineHeight: 1.5, textShadow: '0 2px 12px rgba(0,0,0,.9)' }}>{geezText}</div>}
      <div style={{ font: `italic 400 31px ${serif}`, color: ink.ivory, lineHeight: 1.3, marginTop: 8, textShadow: '0 2px 14px rgba(0,0,0,.95)' }}>{text}</div>
      <div style={{ font: `400 14px ${mono}`, color: ink.ivory3, marginTop: 10, letterSpacing: '.16em' }}>{refText.toUpperCase()}</div>
    </div>
  );
}
