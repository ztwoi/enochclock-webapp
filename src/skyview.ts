// Sky: the real sky over the six portals, at any part of the selected Enoch day: the whole horizon all around, a panorama
// that turns without end (a drag, a swipe or a compass heading moves the view only); `recentre` brings back the eastern or
// western portals, centred and level. Equirectangular panorama on an azimuth scale
// (1° azimuth = 1° altitude on screen; shapes stretch toward the zenith), from the zenith down to 18° under
// the horizon (the Sun's depth at full night), or, with Below horizon, all the way to the nadir (−90°). The view is a gaze (stage `gaze`): it fills the screen, rests
// level with the portals along its bottom edge, turns sideways and looks up toward the zenith or down under the ground.
// Positions: HYG 4.1 + Astronomy Engine, astrometric; refracted as at sunrise (Swiss Ephemeris' refraction,
// the year's pressure and temperature), unless Refraction is off.
// The planets are the Dial's (src/dial/state.ts PLANETS, PCOL): the same bodies, places and colours.
import { StarField } from './sky/starfield';
import * as THREE from 'three';
import { skyFrame, starVector } from './sky/astronomy';
import type { Star } from './sky/catalogue';
import { aberrated, aberration, declinationOfDate, ecliptic, horizonAzimuth, moon, planet, portalAt, refracted } from './sky/instrument';
import { PCOL, PLANETS } from './dial/state';
import { CONSTELLATION_NAMES } from './sky/constellationNames';
import { easeHeading, mod360, wrap180 } from './sky/heading';
import { GEEZ, pillars } from './model';
import { C, createStage, hatchMaterial, headClearance, sprite, svgEl, UNTILED, type Pt } from './stage';
import type { Portal, YearDoc } from './types';

/** The side whose six portals the home view centres: where the Sun rises (east) or sets (west). */
export type Side = 'east' | 'west';
export interface Catalogue { stars: Star[]; byId: Map<string, Star>; segments: [string, string][]; /** The segments of each constellation, by index range (a catalogue without it draws its figures unnamed). */ groups?: { abbr: string; from: number; to: number }[]; /** Faintest magnitude the list is complete to (all of it when absent). */ completeTo?: number; /** Fetch the fainter stars when only the brighter ones are loaded. */ extend?(mag: number): Promise<void> }
const K = (1420 - 60) / 180;
/** Design units per character of a constellation's name (11-unit italic serif, letter-spaced): its width, for fitting and for keeping clear of other labels. */
const FIG_CHAR = 7;
/** The panorama's frame in design units: 0°–180° across, the zenith (top) to 18° under the horizon (bottom); `rest`: the bottom edge of a level gaze, just under the portals' caption. */
const SL = { x0: 60, x1: 1420, horizon: 760, top: 760 - 90 * K, bottom: 760 + 18 * K, rest: 760 + 72 };
const altMax = (SL.horizon - SL.top) / K, altMin = -(SL.bottom - SL.horizon) / K;
/** One turn of the panorama all around, in design units. */
const TURN = 360 * K;
const skyX = (az: number) => SL.x0 + mod360(az) * K;
const skyY = (alt: number) => SL.horizon - alt * K;
const inFrameTo = (alt: number, low: number) => alt >= low && alt <= altMax;
/** The heading's time constant (s): the view eases to a new heading, the same at any frame rate. */
const TURN_TAU = 0.1;

export type Selection = { kind: 'star'; star: Star } | { kind: 'sun' } | { kind: 'moon' } | { kind: 'planet'; name: string } | null;
interface SkyPlanet { name: string; az: number; alt: number; mag: number; dec: number }
export interface SkyInfo {
  jd: number; refraction: boolean; sun: { az: number; alt: number }; moon: { az: number; alt: number; fraction: number }; planets: SkyPlanet[];
  shown: number; selection: Selection; selected?: { az: number; alt: number; dec: number; rise: number | null; set: number | null; portal: ReturnType<typeof portalAt> | null; portalWest: ReturnType<typeof portalAt> | null };
}

const starMaterial = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { pr: { value: Math.min(window.devicePixelRatio, 2) } },
  vertexShader: 'attribute float size; attribute float alpha; attribute vec3 tint; varying float va; varying vec3 vc; uniform float pr; void main(){ va = alpha; vc = tint; gl_PointSize = size * pr * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'varying float va; varying vec3 vc; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d) * 2.; if (r > 1.) discard; gl_FragColor = vec4(vc, va * (1. - smoothstep(.15, 1., r))); }',
});

/** Pixels along the stage's bottom held by the page's note (the method line under the view), when it shows. */
const footInset = () => { const f = document.querySelector<HTMLElement>('.foot'); return f && f.offsetHeight ? f.offsetHeight + 22 : 0; };

/** One star field per catalogue (its list grows when fainter stars load): the per-star numbers are computed once, not per view. */
const fields = new WeakMap<object, StarField>();
const starFieldOf = (cat: Catalogue) => { let f = fields.get(cat.stars); if (!f) fields.set(cat.stars, f = new StarField(cat.stars)); return f; };

export function createSky(host: HTMLElement, doc: YearDoc, cat: Catalogue, onSelect: (s: Selection) => void) {
  let homeSide: Side = 'east', magLimit = 6.5, figuresOn = true, portalStarsOn = true, planetsOn = true, refractionOn = true, daylightOn = true, belowOn = true, bearingOn = false, selection: Selection = null, jd = doc.rows[0].sunrise_jd_ut;
  /** The lowest altitude in frame: the nadir (Below horizon, on by default), or 18° under the horizon; the gaze's bounds and the ground follow it. */
  let lowest = -90;
  const inFrame = (_az: number, alt: number) => inFrameTo(alt, lowest);
  const bottom = () => SL.horizon - lowest * K, bounds: [number, number, number, number] = [SL.x0, SL.top, SL.x1, bottom()];
  const st = createStage(host, 'Sky: catalogue stars, Sun, Moon and planets over the six portals at the selected instant',
    { gaze: { bounds, rest: SL.rest, inset: footInset, focus: () => portalSpan() }, layered: true });
  const { scene, overlay, layer, line, rect, text } = st;
  /** The home side's six portals across the design (at rest the gaze centres them, all in view). */
  function portalSpan(side: Side = homeSide): [number, number] {
    const P = side === 'west' ? doc.portals_west : doc.portals, lo = Math.min(...P.map((p) => p.union[0])), hi = Math.max(...P.map((p) => p.union[1]));
    return [skyX(lo), skyX(hi)];
  }
  const lat = doc.calculation.latitude, lon = doc.calculation.longitude_east, elev = doc.calculation.elevation_m;
  const hpa = doc.calculation.pressure_hpa, celsius = doc.calculation.temperature_c;   // the sunrise convention's atmosphere

  // ---- static frame (rebuilt when Below horizon changes)
  const fixed = new THREE.Group(); scene.add(fixed);
  const fixedLabels = svgEl('g', {}, layer);
  const pinned = svgEl('g', {}, overlay);                       // all around: labels held at the view's edge, not on the sky
  /** The ground's veil over what lies under the horizon: lifted, not removed, when that is what is being looked at. */
  const ground = () => (belowOn ? 0.18 : 0.82);
  function drawFrame() {
    fixed.clear(); fixedLabels.replaceChildren(); pinned.replaceChildren();
    placeDaylight();
    for (let a = belowOn ? -80 : 10; a <= 80; a += 10) if (a) text(0, skyY(a) + 3.5, `${a < 0 ? '−' : ''}${Math.abs(a)}°`, 'lbl-mono dim halo', { 'text-anchor': 'start', 'font-size': 9.5, 'data-alt': a }, pinned);
    drawAround(); st.resize();
  }
  function lineObj(pts: Pt[], color: string, width: number, opacity: number, z = 0) {
    const l = line(pts, color, width, opacity, undefined, z); scene.remove(l); return l; // re-parented under `fixed`
  }
  /** The frame all around: the marks over one turn (the portals where the Sun rises and where it sets); spans across it drawn once over three turns. */
  function drawAround() {
    const far0 = SL.x0 - TURN, far1 = SL.x0 + 2 * TURN, once = <T extends THREE.Object3D>(o: T) => { o.layers.set(UNTILED); return o; };
    const g = new THREE.Mesh(new THREE.PlaneGeometry(far1 - far0, bottom() - SL.horizon + 30), new THREE.MeshBasicMaterial({ color: '#050403', transparent: true, opacity: ground(), side: THREE.DoubleSide, depthWrite: false }));
    g.position.set((far0 + far1) / 2, (SL.horizon + bottom() + 30) / 2, 1.5); fixed.add(once(g));
    for (let a = belowOn ? -80 : 10; a <= 80; a += 10) if (a) fixed.add(once(lineObj([[far0, skyY(a)], [far1, skyY(a)]], C.ivory, 0.5, 0.06)));
    for (let a = 0; a < 360; a += 5) {
      const major = a % 10 === 0, x = skyX(a);
      fixed.add(lineObj([[x, SL.horizon], [x, SL.horizon + (major ? 9 : 4)]], major ? C.ivory2 : C.ivory3, 0.7, 1, 2));
      if (a % 30 === 0) fixed.add(lineObj([[x, SL.top], [x, SL.horizon]], C.ivory, 0.5, 0.05));
      const card = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[a];
      if (major) text(x, SL.horizon + 22, card ? `${card} ${a}°` : `${a}°`, card ? 'lbl-mono' : 'lbl-mono dim', { 'text-anchor': 'middle', 'font-size': 9.5 }, fixedLabels);
    }
    fixed.add(once(lineObj([[far0, SL.horizon], [far1, SL.horizon]], C.ivory, 1.2, 1, 2)));
    for (const [P, caption, mid] of [[doc.portals, 'the six portals in which the sun rises — 72:3', 90], [doc.portals_west, 'the six portals in which the sun sets — 72:3', 270]] as const) {
      for (const p of P) {
        const [lo, hi] = p.common, x0 = skyX(lo), x1 = x0 + wrap180(hi - lo) * K, xm = (x0 + x1) / 2, h = 44;
        const pts: Pt[] = [[x0, SL.horizon], [x0, SL.horizon - h * 0.55]];
        for (let k = 0; k <= 24; k++) { const t = Math.PI - (k / 24) * Math.PI; pts.push([xm + Math.cos(t) * (x1 - x0) / 2, SL.horizon - h * 0.55 - Math.sin(t) * h * 0.45]); }
        pts.push([x1, SL.horizon]);
        fixed.add(lineObj(pts, C.bronze, 1, 0.9, 2));
        text(xm, SL.horizon + 40, GEEZ[p.portal], 'geez gold', { 'text-anchor': 'middle', 'font-size': 15, 'data-portal': p.portal }, fixedLabels);
      }
      for (const [a, b] of pillars(P)) {
        const xa = skyX(a), w = wrap180(b - a) * K;
        const r = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1, w), 44), hatchMaterial(0.7)); r.position.set(xa + w / 2, SL.horizon - 22, 2); fixed.add(r);
      }
      text(skyX(mid), SL.horizon + 62, caption, 'serif-it bronze', { 'text-anchor': 'middle', 'font-size': 13 }, fixedLabels);
    }
    // the heading: the bearing at the middle of the view, held there as the panorama turns
    svgEl('line', { y2: SL.horizon, stroke: C.gold, 'stroke-width': 1, opacity: 0.35, 'vector-effect': 'non-scaling-stroke', 'data-k': 'heading-line' }, pinned);
    svgEl('path', { fill: C.goldHi, 'data-k': 'heading-caret' }, pinned);
    text(0, 0, '', 'lbl-mono gold-hi halo', { 'text-anchor': 'middle', 'font-size': 10.5, 'data-k': 'heading' }, pinned);
    showBearing();
  }
  /** Labels held at the view's edges as it moves (the altitudes left, the daylight note right, the heading above), clear of the title block. */
  st.onView((v) => {
    const px = host.clientWidth ? v.w / host.clientWidth : 1, top = v.y + (headClearance() + 18) * px;   // design units per pixel; the first clear line
    for (const t of pinned.querySelectorAll('[data-alt]')) { const y = skyY(Number(t.getAttribute('data-alt'))); t.setAttribute('x', String(v.x + 8 * px)); t.setAttribute('display', y < top || y > bottom() ? 'none' : 'inline'); }
    const cx = v.x + v.w / 2, h = mod360((cx - SL.x0) / K), y = Math.min(top + 14 * px, SL.horizon - 60);
    for (const l of pinned.querySelectorAll('[data-k=heading-line]')) { l.setAttribute('x1', String(cx)); l.setAttribute('x2', String(cx)); l.setAttribute('y1', String(y + 8 * px)); }
    pinned.querySelector('[data-k=heading-caret]')?.setAttribute('d', `M${cx - 4.5 * px} ${y} h${9 * px} l${-4.5 * px} ${7 * px}z`);
    const label = pinned.querySelector('[data-k=heading]'); if (label) { label.setAttribute('x', String(cx)); label.setAttribute('y', String(y - 6 * px)); label.textContent = `${(Math.round(h * 10) % 3600 / 10).toFixed(1)}°`; }
  });

  // ---- moving layers
  const daylight = rect(SL.x0 - 20, SL.top - 20, SL.x1 - SL.x0 + 40, SL.horizon - SL.top + 20, new THREE.MeshBasicMaterial({ color: '#3a2c17', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), -2);
  function placeDaylight() {    // once over three turns
    const x0 = SL.x0 - TURN, w = 3 * TURN;
    daylight.scale.x = w / (SL.x1 - SL.x0 + 40); daylight.position.x = x0 + w / 2;
    daylight.layers.set(UNTILED);
  }
  const eclLine = line([[0, 0], [1, 0]], C.gold, 0.9, 0.55, [4, 4]);
  const figGeom = new THREE.BufferGeometry(); const figures = new THREE.LineSegments(figGeom, new THREE.LineBasicMaterial({ color: C.ivory, transparent: true, opacity: 0.2 })); figures.position.z = 0.2; figures.frustumCulled = false; scene.add(figures);
  const starGeom = new THREE.BufferGeometry(); const points = new THREE.Points(starGeom, starMaterial()); points.position.z = 0.5; points.frustumCulled = false; scene.add(points);
  const sunHalo = sprite(90, 0.85), sunCore = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ color: '#fff3d0', side: THREE.DoubleSide, transparent: true }));
  scene.add(sunHalo); scene.add(sunCore);
  const dyn = svgEl('g', { style: 'pointer-events:none' }, layer);     // labels and glyphs: taps fall through to the pick area
  /** x of `az` beside the design point x0 (the shorter way, so a chord or a run may cross the seam). */
  const beside = (x0: number, az0: number, az: number) => x0 + wrap180(az - az0) * K;

  // The stars drawn: the field holds each star's fixed numbers; the drawn ones go into buffers that live as long as the view (a new
  // attribute every frame made the GPU allocate and drop four buffers per redraw), and `shown*` index the ones in frame for picking.
  const field = starFieldOf(cat);
  let cap = 0, posA!: THREE.BufferAttribute, sizeA!: THREE.BufferAttribute, alphaA!: THREE.BufferAttribute, tintA!: THREE.BufferAttribute;
  let shownIdx = new Int32Array(0), shownX = new Float64Array(0), shownY = new Float64Array(0), nShown = 0, frameStamp = 0;
  const dynamic = (k: number) => { const a = new THREE.BufferAttribute(new Float32Array(cap * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };
  function fit(n: number) {
    if (n <= cap) return;
    cap = Math.max(n, 1024);
    starGeom.setAttribute('position', posA = dynamic(3)); starGeom.setAttribute('size', sizeA = dynamic(1));
    starGeom.setAttribute('alpha', alphaA = dynamic(1)); starGeom.setAttribute('tint', tintA = dynamic(3));
    shownIdx = new Int32Array(cap); shownX = new Float64Array(cap); shownY = new Float64Array(cap);
  }
  const FIG_MAX = 695;                                   // segments in the figure set (checked when the catalogue loads)
  const figA = new THREE.BufferAttribute(new Float32Array(FIG_MAX * 6), 3); figA.setUsage(THREE.DynamicDrawUsage); figGeom.setAttribute('position', figA);
  const upload = (a: THREE.BufferAttribute, count: number) => { a.clearUpdateRanges(); a.addUpdateRange(0, count * a.itemSize); a.needsUpdate = true; };
  let info: SkyInfo | null = null;
  function update() {
    // drawn: apparent places (annual aberration, as Swiss Ephemeris has them), refracted as at sunrise (so the Sun's upper
    // limb meets the horizon at the measured sunrise) or at true altitudes; daylight and twilight stay on the Sun's true altitude
    const truth = skyFrame(jd, lat, lon, elev), ab = aberration(truth.time), app = aberrated(truth, ab);
    const air = (fr: typeof truth) => (refractionOn ? refracted(fr, hpa, celsius) : fr), f = air(app);
    field.sync(); fit(field.n);
    const proj = field.projector(truth, ab, refractionOn ? { hpa, celsius } : null);
    const sun = f.sun, mo = moon(f), day = truth.sun.alt > -0.833, twilight = daylightOn ? Math.max(0, Math.min(1, (truth.sun.alt + 18) / 18)) : 0;   // Daylight off: a night sky at every hour
    const spanOf = (PP: Portal[]) => [Math.min(...PP.map((p) => p.union[0])), Math.max(...PP.map((p) => p.union[1]))];
    // rises (east) / sets (west) within the measured portal spans: either
    const spans: [number[], boolean][] = [[spanOf(doc.portals), true], [spanOf(doc.portals_west), false]];
    // stars (computed positions; size, tint, dimming in daylight are presentation)
    const pos = posA.array as Float32Array, size = sizeA.array as Float32Array, alpha = alphaA.array as Float32Array, tint = tintA.array as Float32Array;
    frameStamp = ++field.clock; nShown = 0;
    const n = field.n, mags = field.mag, base = field.alpha, rgb = field.rgb, dim = 1 - 0.82 * twilight;
    for (let i = 0; i < n; i++) {
      if (mags[i] > magLimit) continue;
      proj.star(i);
      const az = proj.az;                                  // refraction leaves azimuth alone
      const alt = proj.altitude();
      if (alt < lowest || alt > altMax) continue;
      field.az[i] = az; field.alt[i] = alt; field.stamp[i] = frameStamp;
      const x = skyX(az), y = skyY(alt), k = nShown++;
      let a = base[i] * dim * (alt < 0 ? (belowOn ? 0.9 : 0.35) : 1), r = rgb[3 * i], g = rgb[3 * i + 1], bl = rgb[3 * i + 2];
      if (portalStarsOn) {
        const dec = proj.dec();
        if (spans.some(([span, rising]) => { const ha = horizonAzimuth(dec, lat, rising); return ha !== null && ha >= span[0] && ha <= span[1]; })) { r = 1.0; g = 0.78; bl = 0.36; a = Math.min(1, a * 1.5); }
      }
      pos[3 * k] = x; pos[3 * k + 1] = y; size[k] = field.size[i]; alpha[k] = Math.max(0.05, a);
      tint[3 * k] = r; tint[3 * k + 1] = g; tint[3 * k + 2] = bl;
      shownIdx[k] = i; shownX[k] = x; shownY[k] = y;
    }
    upload(posA, nShown); upload(sizeA, nShown); upload(alphaA, nShown); upload(tintA, nShown);
    starGeom.setDrawRange(0, nShown);
    /** A star's drawn direction this frame: from the pass above when it was in frame, computed now otherwise (figure ends, the selection). */
    const dirAt = (i: number) => {
      if (field.stamp[i] === frameStamp) return { az: field.az[i], alt: field.alt[i] };
      proj.star(i); return { az: proj.az, alt: proj.altitude() };
    };
    const dirOf = (id: string) => { const i = field.indexOf(id); return i < 0 ? null : dirAt(i); };
    // figures: straight chords between transformed endpoints, omitted if either leaves the frame
    const seg = figA.array as Float32Array; let nSeg = 0;
    const figNames: { name: string; x: number; y: number; w: number; span: number }[] = [];   // one label per figure that is mostly in frame and wide enough to hold it
    if (figuresOn) for (const g of cat.groups ?? [{ abbr: '', from: 0, to: cat.segments.length }]) {
      let n = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = g.from; k < g.to; k++) {
        const [a, b] = cat.segments[k], pa = dirOf(a)!, pb = dirOf(b)!;
        if (!inFrame(pa.az, pa.alt) || !inFrame(pb.az, pb.alt) || Math.abs(wrap180(pb.az - pa.az)) > 60) continue;
        const xa = skyX(pa.az), xb = beside(xa, pa.az, pb.az), ya = skyY(pa.alt), yb = skyY(pb.alt), o = nSeg++ * 6;
        seg[o] = xa; seg[o + 1] = ya; seg[o + 2] = 0; seg[o + 3] = xb; seg[o + 4] = yb; seg[o + 5] = 0;
        n++; x0 = Math.min(x0, xa, xb); x1 = Math.max(x1, xa, xb); y0 = Math.min(y0, ya, yb); y1 = Math.max(y1, ya, yb);
      }
      const name = CONSTELLATION_NAMES[g.abbr], w = (name?.length ?? 0) * FIG_CHAR;
      if (name && n * 2 >= g.to - g.from && x1 - x0 < 90 * K && x1 - x0 > w * 1.4) figNames.push({ name, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w, span: x1 - x0 });
    }
    upload(figA, nSeg * 2); figGeom.setDrawRange(0, nSeg * 2);
    (figures.material as THREE.LineBasicMaterial).opacity = 0.2 * (1 - 0.6 * twilight);
    // ecliptic of date (computed); split where it leaves the frame
    const e = ecliptic(air(truth), 1).map((p) => ({ ...p, ok: inFrame(p.az, p.alt) }));
    const runs: Pt[][] = []; let run: Pt[] = [], prev = e[0];
    for (const p of [...e, e[0]]) { if (p.ok) run.push([run.length ? beside(run[run.length - 1][0], prev.az, p.az) : skyX(p.az), skyY(p.alt)]); else if (run.length) { runs.push(run); run = []; } prev = p; }
    if (run.length) runs.push(run);
    if (runs.length > 1 && e[0].ok && e[e.length - 1].ok) {   // one run through the start of the samples
      const last = runs.pop()!, first = runs.shift()!, dx = last[last.length - 1][0] - first[0][0];
      runs.push([...last, ...first.slice(1).map(([x, y]) => [x + dx, y] as Pt)]);
    }
    const longest = runs.sort((a, b) => b.length - a.length)[0];
    eclLine.visible = !!longest && longest.length > 1;
    if (eclLine.visible) { eclLine.geometry.setPositions(longest.flatMap(([x, y]) => [x, y, 0.1])); eclLine.computeLineDistances(); }
    // Sun and Moon
    const sunIn = inFrame(sun.az, sun.alt);
    sunHalo.visible = sunCore.visible = sunIn;
    if (sunIn) { const x = skyX(sun.az), y = skyY(sun.alt); sunHalo.position.set(x, y, 3); sunCore.position.set(x, y, 3.1); (sunCore.material as THREE.MeshBasicMaterial).opacity = sun.alt < 0 ? 0.45 : 1; }
    (daylight.material as THREE.MeshBasicMaterial).opacity = !daylightOn ? 0 : day ? 0.32 : 0.32 * Math.max(0, (truth.sun.alt + 6) / 6.833);
    dyn.replaceChildren();
    const taken: [number, number, number, number][] = [];     // boxes the constellation names keep clear of: the Sun's, planets' and stars' labels, the bodies
    if (sunIn) taken.push([skyX(sun.az) - 20, skyY(sun.alt) - 28, skyX(sun.az) + 190, skyY(sun.alt) + 14]);
    if (sunIn) text(skyX(sun.az) + 14, skyY(sun.alt) - 12, `SUN ${sun.az.toFixed(3)}° · ${sun.alt.toFixed(3)}°`, 'lbl-mono gold-hi halo', { 'font-size': 10 }, dyn);
    // planets (computed positions, the Dial's colours; hollow below the horizon, as on the Dial)
    const planets: SkyPlanet[] = PLANETS.map(([body, name]) => ({ name, ...planet(f, body) }));
    if (planetsOn) for (const p of planets) if (inFrame(p.az, p.alt)) {
      const x = skyX(p.az), y = skyY(p.alt), up = p.alt > 0, c = PCOL[p.name], r = p.name === 'Uranus' || p.name === 'Neptune' ? 3.4 : 5;
      svgEl('circle', { cx: x, cy: y, r: r + 2.5, fill: 'none', stroke: c, 'stroke-width': 0.8, opacity: up ? 0.4 : 0.25 }, dyn);
      svgEl('circle', { cx: x, cy: y, r, fill: up ? c : 'none', stroke: c, 'stroke-width': up ? 0 : 1, opacity: up ? 1 : 0.6, 'data-planet': p.name.toLowerCase() }, dyn);
      taken.push([x - 8, y - 20, x + 14 + p.name.length * 6.2, y + 8]);
      text(x + 9, y - 7, p.name.toUpperCase(), 'lbl-mono halo', { 'font-size': 9.5, style: `fill:${c}`, opacity: up ? 0.95 : 0.6 }, dyn);
    }
    if (inFrame(mo.az, mo.alt)) moonGlyph(skyX(mo.az), skyY(mo.alt), mo.fraction, Math.atan2(skyY(sun.alt) - skyY(mo.alt), beside(skyX(mo.az), mo.az, sun.az) - skyX(mo.az)));
    const selId = selection?.kind === 'star' ? selection.star.id : '';
    for (let k = 0; k < nShown; k++) { const s = field.stars[shownIdx[k]]; if (s.name && s.mag_v <= 1.6 && s.id !== selId) { taken.push([shownX[k] - 6, shownY[k] - 20, shownX[k] + 12 + s.name.length * 6, shownY[k] + 6]); text(shownX[k] + 7, shownY[k] - 6, s.name, 'serif-it ivory2 halo', { 'font-size': 12 }, dyn); } }
    // constellation names: the widest figures first; one that would touch a taken box (or an earlier name) is left out
    const moonBox: [number, number, number, number] | null = inFrame(mo.az, mo.alt) ? [skyX(mo.az) - 14, skyY(mo.alt) - 14, skyX(mo.az) + 14, skyY(mo.alt) + 14] : null; if (moonBox) taken.push(moonBox);
    for (const f of figNames.sort((a, b) => b.span - a.span)) {
      const box: [number, number, number, number] = [f.x - f.w / 2 - 4, f.y - 10, f.x + f.w / 2 + 4, f.y + 6];
      if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
      taken.push(box); text(f.x, f.y + 3, f.name, 'serif-it ivory2 halo', { 'font-size': 11, 'text-anchor': 'middle', 'letter-spacing': 1.2, opacity: 0.55 * (1 - 0.6 * twilight) }, dyn);
    }
    // selection
    let selected: SkyInfo['selected'];
    if (selection?.kind === 'star') {
      const s = selection.star, h = dirOf(s.id) ?? f.direction(starVector(s, f.time)), dec = declinationOfDate(s, f.time, ab);
      const rise = horizonAzimuth(dec, lat, true), set = horizonAzimuth(dec, lat, false);
      selected = { ...h, dec, rise, set, portal: rise === null ? null : portalAt(rise, doc.portals), portalWest: set === null ? null : portalAt(set, doc.portals_west) };
      if (inFrame(h.az, h.alt)) { svgEl('circle', { cx: skyX(h.az), cy: skyY(h.alt), r: 9, fill: 'none', stroke: C.goldHi, 'stroke-width': 1 }, dyn); text(skyX(h.az) + 13, skyY(h.alt) + 16, s.name ?? s.designation ?? s.id, 'lbl-mono gold-hi halo', { 'font-size': 10.5 }, dyn); }
      for (const ra of [rise, set]) if (ra !== null) svgEl('path', { d: `M${skyX(ra)} ${SL.horizon - 2} l-5 -9 h10z`, fill: C.goldHi }, dyn);
    } else if (selection?.kind === 'planet') {
      const name = selection.name, q = planets.find((p) => p.name === name)!;
      const rise = horizonAzimuth(q.dec, lat, true), set = horizonAzimuth(q.dec, lat, false);
      selected = { az: q.az, alt: q.alt, dec: q.dec, rise, set, portal: rise === null ? null : portalAt(rise, doc.portals), portalWest: set === null ? null : portalAt(set, doc.portals_west) };
      if (inFrame(q.az, q.alt)) svgEl('circle', { cx: skyX(q.az), cy: skyY(q.alt), r: 10, fill: 'none', stroke: C.goldHi, 'stroke-width': 1 }, dyn);
      for (const ra of [rise, set]) if (ra !== null) svgEl('path', { d: `M${skyX(ra)} ${SL.horizon - 2} l-5 -9 h10z`, fill: C.goldHi }, dyn);
    }
    else if (selection?.kind === 'sun' || selection?.kind === 'moon') {                     // the same gold ring: the pick is seen
      const b = selection.kind === 'sun' ? sun : mo;
      if (inFrame(b.az, b.alt)) svgEl('circle', { cx: skyX(b.az), cy: skyY(b.alt), r: 13, fill: 'none', stroke: C.goldHi, 'stroke-width': 1.2, 'data-k': `sel-${selection.kind}` }, dyn);
    }
    info = { jd, refraction: refractionOn, sun, moon: mo, planets, shown: nShown, selection, selected };
    st.render();
  }
  function moonGlyph(x: number, y: number, f: number, toSun: number) {
    const r = 8, g = svgEl('g', { transform: `translate(${x} ${y}) rotate(${(toSun * 180) / Math.PI})` }, dyn);
    svgEl('circle', { r, fill: '#1a1814', stroke: C.ivory3, 'stroke-width': 0.6 }, g);
    // lit side faces +x (toward the Sun); terminator ellipse with semi-axis r·|1−2f|
    const rx = r * Math.abs(1 - 2 * f), sweep = f > 0.5 ? 1 : 0;
    svgEl('path', { d: `M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${rx} ${r} 0 0 ${sweep} 0 ${-r}Z`, fill: C.ivory, opacity: 0.92 }, g);
    text(x + 13, y + 4, `MOON ${(f * 100).toFixed(1)}%`, 'lbl-mono ivory2 halo', { 'font-size': 9.5 }, dyn);
  }

  // ---- picking: every star within 12 design units; the brightest wins, Sun/Moon/planets first
  const hit = svgEl('rect', { x: SL.x0, y: SL.top - 20, width: SL.x1 - SL.x0, height: bottom() - SL.top + 20, fill: 'transparent', class: 'pick' }, overlay);
  overlay.insertBefore(hit, overlay.firstChild);
  const placeHit = () => { hit.setAttribute('x', String(SL.x0 - TURN)); hit.setAttribute('width', String(3 * TURN)); hit.setAttribute('height', String(bottom() - SL.top + 20)); };
  /** x − x0 in design units, the shorter way round. */
  const dx = (x: number, x0: number) => mod360(((x - x0) / K) + 180) * K - TURN / 2;
  hit.addEventListener('click', (ev) => {
    const { clientX: cx, clientY: cy } = ev as MouseEvent, p = st.fromScreen(cx, cy), p1 = st.fromScreen(cx + 10, cy); if (!p || !info) return;
    // reach in screen pixels (a finger on a phone), never less than the design's own: design units per pixel at this zoom
    const upx = p1 ? Math.abs(p1.x - p.x) / 10 : 1, reach = (px: number, du: number) => Math.max(du, px * upx);
    const dist = (az: number, alt: number) => (inFrame(az, alt) ? Math.hypot(dx(skyX(az), p.x), skyY(alt) - p.y) : Infinity);
    const sunD = dist(info.sun.az, info.sun.alt), moonD = dist(info.moon.az, info.moon.alt);
    if (sunD < reach(30, 14) && sunD <= moonD) selection = { kind: 'sun' };                     // the Sun and Moon win within their glow
    else if (moonD < reach(30, 14)) selection = { kind: 'moon' };
    else if (planetsOn && info.planets.some((q) => dist(q.az, q.alt) < reach(22, 14))) selection = { kind: 'planet', name: [...info.planets].sort((a, b) => dist(a.az, a.alt) - dist(b.az, b.alt))[0].name };
    else {
      const r = reach(18, 12); let best = -1;                // the brightest star within reach (the first of equals, as a stable sort gave)
      for (let k = 0; k < nShown; k++) if (Math.hypot(dx(shownX[k], p.x), shownY[k] - p.y) < r && (best < 0 || field.mag[shownIdx[k]] < field.mag[shownIdx[best]])) best = k;
      selection = best >= 0 ? { kind: 'star', star: field.stars[shownIdx[best]] } : null;
    }
    update(); onSelect(selection);
  });

  // ---- the bearing mark (the caret, the line and the degrees at the middle of the view): shown when asked for, while a compass leads the view, and for a moment after a hand turns it
  let bearingHold = false, bearingFlash = 0, bearingTimer = 0;
  function showBearing() {
    const on = bearingOn || bearingHold || bearingFlash > 0;
    for (const n of pinned.querySelectorAll<SVGElement>('[data-k=heading-line],[data-k=heading-caret],[data-k=heading]')) { n.style.transition = 'opacity .4s'; n.style.opacity = on ? '' : '0'; }
  }

  // ---- heading (all around): a target the view eases to at the display's frame rate; the drawing is untouched
  let target: number | null = null, raf = 0, last = 0;
  const heading = () => { const z = st.zoom; return z ? mod360((z.cx - SL.x0) / K) : null; };
  function follow(t: number) {
    raf = 0; const now = heading(); if (target === null || now === null) { target = null; last = 0; return; }
    const dt = last ? (t - last) / 1000 : 1 / 60; last = t;
    const next = easeHeading(now, target, dt, TURN_TAU);
    st.turnTo(skyX(next));
    if (next === target) { target = null; last = 0; } else raf = requestAnimationFrame(follow);
  }

  st.onUser(() => {
    cancelAnimationFrame(raf); raf = 0; target = null; last = 0;
    if (!bearingFlash) { bearingFlash = 1; showBearing(); }
    clearTimeout(bearingTimer); bearingTimer = window.setTimeout(() => { bearingFlash = 0; showBearing(); }, 1500);
  });   // a hand on the panorama ends any ease towards a heading
  st.setWrap({ x0: SL.x0, period: TURN });                        // the panorama turns without end
  drawFrame(); placeHit();
  return {
    stage: st, render: st.render, dispose() { cancelAnimationFrame(raf); clearTimeout(bearingTimer); st.dispose(); },
    /** A compass is leading the view: the bearing mark shows for as long as it does. */
    setBearingHold(on: boolean) { bearingHold = on; showBearing(); },
    /** The user took the view (a drag, a swipe, a pinch, a wheel, a double tap): a heading that was turning it should stand aside. */
    onUser: (f: () => void) => st.onUser(f),
    setInstant(j: number) { jd = j; update(); },
    /** Bring a side's six portals back: centred, level, at the home magnification (the Sun's rising or setting side). */
    recentre(side: Side) {
      cancelAnimationFrame(raf); raf = 0; target = null; last = 0;
      homeSide = side;
      st.setZoom(null);                                                  // the home view: its magnification and level gaze (at the way it faces now)
      const [f0, f1] = portalSpan(side); st.turnTo((f0 + f1) / 2);
      update();
    },
    /** The side whose portals are centred now (the view within `tol`° of their middle), else null. */
    sideAt(tol = 30): Side | null {
      const h = heading(); if (h === null) return null;
      for (const side of ['east', 'west'] as const) { const [f0, f1] = portalSpan(side); if (Math.abs(wrap180(h - mod360(((f0 + f1) / 2 - SL.x0) / K))) <= tol) return side; }
      return null;
    },
    /** Face true bearing `h` (eased unless `now`); a heading moves the view only. */
    turn(h: number, now = false) {
      if (now) { cancelAnimationFrame(raf); raf = 0; target = null; last = 0; st.turnTo(skyX(h)); return; }
      target = mod360(h); if (!raf) raf = requestAnimationFrame(follow);
    },
    /** The true bearing at the view's centre. */
    heading,
    setMagLimit(m: number) { magLimit = m; update(); },
    setLayers(o: { figures?: boolean; portalStars?: boolean; planets?: boolean; refraction?: boolean; daylight?: boolean; below?: boolean; bearing?: boolean }) {
      const below = o.below ?? belowOn;
      if (o.bearing !== undefined) { bearingOn = o.bearing; showBearing(); }
      if (below !== belowOn) {            // the frame's floor, the gaze's bounds, the ground and the altitude marks all move with it
        belowOn = below; lowest = below ? -90 : altMin; bounds[3] = bottom();
        placeHit(); drawFrame();
      }
      daylightOn = o.daylight ?? daylightOn; figuresOn = o.figures ?? figuresOn; portalStarsOn = o.portalStars ?? portalStarsOn; planetsOn = o.planets ?? planetsOn; refractionOn = o.refraction ?? refractionOn;
      if (!planetsOn && selection?.kind === 'planet') selection = null;
      update();
    },
    select(s: Selection) { selection = s; update(); },
    info: () => info,
    /** Design-space anchor of a star/body under the current transform (tests). */
    anchorOf(id: string) {
      const p = id.startsWith('planet:') ? info?.planets.find((q) => q.name === id.slice(7)) : null;
      const near = (x: number) => { const cx = st.zoom?.cx; return cx !== undefined ? x + Math.round((cx - x) / TURN) * TURN : x; };   // the copy in view
      if (p) return inFrame(p.az, p.alt) ? { x: near(skyX(p.az)), y: skyY(p.alt) } : null;
      for (let k = 0; k < nShown; k++) if (field.stars[shownIdx[k]].id === id) return { x: near(shownX[k]), y: shownY[k] };
      return null;
    },
  };
}
export type Sky = ReturnType<typeof createSky>;
