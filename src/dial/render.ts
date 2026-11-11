// The unified dial as one SVG (viewBox −500…500, centre 0,0). Every calendar ring shares the
// centre and is a group rotated as a whole so its current value sits on the needle (the Sun's
// computed azimuth); the world layer (compass, portals, the Sun's path) is a group turned by the
// framing; the bodies and the needle are redrawn per instant. Angles are clockwise from the top.
// build() runs once per Enoch day; update() once per instant.
//
// The design: rings of light on space, not painted bands (theme.css, the Dial's roles). A ring's ground is a faint glass with hairlines; only what is now is
// solid (the month, the course, the part, the Sun's line). The colours are the sky's own day: gold its light, ember its rising and setting, periwinkle its
// night, and where they meet, twilight. What is read at a glance on a phone is large (the months, the parts, the week's names, the courses' numbers); the
// rest is fine engraving to zoom into (the courses' names, the degrees, the week's beads).
//
// The Dial is night in every theme (palette.ts INST): it is drawn in light, which paper cannot do. On a paper page (Light, Sepia) it is one object set into
// the page: the same Dial, with a brass bezel and a shadow under it.
import { arches, GEEZ, pillars, PORTAL_ALT } from '../model';
import { archPath, seamPath } from './portals';
import type { YearDoc } from '../types';
import { ringRotation, type DialState } from './state';
import { alpha, bodyColor, C as PAGE, INST, paletteGeneration, paper, starGain, type Palette } from '../palette';

const NS = 'http://www.w3.org/2000/svg';
export const DR = {
  band1: 498, horizon: 376, band0: 356, tick1: 356, tick0: 346, um1: 344, um0: 326, mo1: 322, mo0: 282, pos0: 276,
  cor1: 272, cor0: 254, crs1: 250, crs0: 204, bead: 196, pt1: 184, pt0: 154, day1: 152, day0: 146, cmp: 140,
};
export type RingKey = 'sky' | 'bearing' | 'uncorrected' | 'position' | 'correction' | 'courses' | 'parts' | 'compass';
/** Hit bands (viewBox radius), outermost first: what a tap on the face selects. */
const BANDS: { key: RingKey; r0: number; r1: number }[] = [
  { key: 'sky', r0: DR.horizon, r1: DR.band1 + 2 }, { key: 'bearing', r0: DR.band0 - 12, r1: DR.horizon },
  { key: 'uncorrected', r0: DR.um0 - 2, r1: DR.um1 + 1 }, { key: 'position', r0: DR.pos0 - 12, r1: DR.mo1 + 3 },
  { key: 'correction', r0: DR.cor0 - 2, r1: DR.cor1 + 1 }, { key: 'courses', r0: DR.pt1 + 2, r1: DR.crs1 + 1 },   // the courses, with the week's beads inside them
  { key: 'parts', r0: DR.day0 - 6, r1: DR.pt1 + 2 }, { key: 'compass', r0: 0, r1: DR.cmp },
];
const ALT_MIN = -12, K = (DR.band1 - DR.horizon) / 90;
const altRadius = (alt: number) => DR.horizon + Math.max(ALT_MIN, alt) * K;
const MS = [1, 31, 61, 92, 122, 152, 183, 213, 243, 274, 304, 334, 365];

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, th: number): [number, number] => [r * Math.sin(rad(th)), -r * Math.cos(rad(th))];
const P = (r: number, th: number) => polar(r, th).map((v) => v.toFixed(2)).join(' ');
function el(tag: string, a: Record<string, string | number | undefined>, parent: Element, text?: string) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) if (v !== undefined) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  parent.appendChild(n); return n;
}
/** Annular sector between angles a0 and a1 (either order). */
const sectorPath = (r0: number, r1: number, a0: number, a1: number) => {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), large = hi - lo > 180 ? 1 : 0;
  return `M${P(r1, lo)} A${r1} ${r1} 0 ${large} 1 ${P(r1, hi)} L${P(r0, hi)} A${r0} ${r0} 0 ${large} 0 ${P(r0, lo)}Z`;
};
const tri = (r: number, a: number, d: string, fill: string, g: Element) => {
  const [x, y] = polar(r, a);
  el('path', { d: `M${x.toFixed(2)} ${y.toFixed(2)}${d}`, fill, transform: `rotate(${a.toFixed(3)} ${x.toFixed(2)} ${y.toFixed(2)})` }, g);
};

/** A group turned as a whole; its labels stay upright (flipped on the lower half of the screen). */
class Layer {
  g: SVGGElement; labels: { n: Element; x: number; y: number; th: number; flip: boolean | null }[] = [];
  constructor(parent: Element, cls?: string) { this.g = el('g', { class: cls }, parent) as SVGGElement; }
  label(r: number, th: number, s: string, a: Record<string, string | number>) {
    const [x, y] = polar(r, th), n = el('text', { x: x.toFixed(2), y: y.toFixed(2), 'text-anchor': 'middle', 'dominant-baseline': 'central', ...a }, this.g, s);
    this.labels.push({ n, x, y, th, flip: null }); return n;
  }
  turn(rot: number) {
    this.g.setAttribute('transform', `rotate(${rot.toFixed(6)})`);
    for (const l of this.labels) {
      const t = (((l.th + rot) % 360) + 360) % 360, flip = t > 90 && t < 270;
      if (flip !== l.flip) { l.flip = flip; l.n.setAttribute('transform', `rotate(${(l.th + (flip ? 180 : 0)).toFixed(3)} ${l.x.toFixed(2)} ${l.y.toFixed(2)})`); }
    }
  }
}

/**
 * Optional sky layers. `figures`: the constellation segments (star id pairs) to draw, or null.
 * `centre`: the centre disc as an all-sky chart, zenith at the middle and the horizon at its rim —
 * 'above' on the compass's bearings (east right, as a map: the sky seen from above, so figures are
 * mirrored), 'up' as a star chart held overhead (east left, figures as seen; the compass marks hide,
 * since they would disagree) — or 'off' (the compass alone).
 */
export type Centre = 'off' | 'above' | 'up';
export interface SkyLayers { figures: [string, string][] | null; centre: Centre }
const NO_LAYERS: SkyLayers = { figures: null, centre: 'off' };
/** The centre chart's horizon radius; stereographic, so figures keep their shapes. */
const CHART_R = 128;
const chartRadius = (alt: number) => CHART_R * Math.tan(rad((90 - alt) / 2));

let dials = 0;
export interface RingReport { name: string; rotation: number; current: number; units: number; dir: 1 | -1; centre: number }
interface Ring { name: string; layer: Layer; units: number; dir: 1 | -1; cur: (s: DialState) => number; mark: Element; markR: number }

/** The Dial in `svg`, in palette C (the instruments': night in every theme). `bezel`: on a paper page, set it into the page with a brass bezel and a shadow (the
 *  Dial tab; The Day's dial already lies in a night panel). */
export function createDial(svg: SVGSVGElement, C: Palette = INST, opts: { bezel?: boolean } = {}) {
  svg.replaceChildren(); svg.classList.add('night');          // its labels take the night's tokens (theme.css)
  const id = `dl${++dials}`;                                  // its defs' ids: the Dial tab and The Day each draw a Dial, in different palettes
  const defs = el('defs', {}, svg), grad = el('radialGradient', { id: `${id}-glow` }, defs);
  const glowStops = [el('stop', { offset: '0', 'stop-opacity': 0.8 }, grad), el('stop', { offset: '1', 'stop-opacity': 0 }, grad)];
  const hw = 5 / Math.SQRT2, hatch = el('pattern', { id: `${id}-hatch`, width: hw, height: hw, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  const hatchLine = el('rect', { x: (0.12 * hw - 0.283).toFixed(3), y: 0, width: 0.566, height: hw }, hatch);
  /** The defs' colours, set again with the face when the theme changes. */
  const paintDefs = () => { glowStops[0].setAttribute('stop-color', C.goldHi); glowStops[1].setAttribute('stop-color', C.gold); hatchLine.setAttribute('fill', C.dlCountDim); };
  // Light behind a shape: 'lit' close, 'soft' and 'wide' spreading (each the shape over its own blur). Only on small shapes: a blur costs by its area.
  for (const [name, sd, twice] of [['lit', 2.2, false], ['soft', 3.2, true], ['wide', 7, true]] as const) {
    const f = el('filter', { id: `${id}-${name}`, x: '-80%', y: '-80%', width: '260%', height: '260%' }, defs);
    el('feGaussianBlur', { stdDeviation: sd, result: 'b' }, f); const m = el('feMerge', {}, f); el('feMergeNode', { in: 'b' }, m); if (twice) el('feMergeNode', { in: 'b' }, m); el('feMergeNode', { in: 'SourceGraphic' }, m);
  }
  const glow = (name: 'lit' | 'soft' | 'wide') => `url(#${id}-${name})`;
  /** Gradients from the centre, made again with each face (the theme's colours): r0…r1 through `cols`. */
  const pdefs = el('g', {}, defs);
  const rgrad = (name: string, r0: number, r1: number, cols: string[]) => {
    const gid = `${id}-g-${name}`, g = el('radialGradient', { id: gid, gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: r1 }, pdefs);
    cols.forEach((c, i) => el('stop', { offset: ((r0 + (i / (cols.length - 1)) * (r1 - r0)) / r1).toFixed(4), 'stop-color': c }, g)); return `url(#${gid})`;
  };
  const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  /** A day's sky round an arc: gold by day, through amber, ember and violet at dusk, periwinkle by night, back through violet and ember to the next sunrise.
   *  Where day meets night it glows; it does not end at an edge. `at(f)`: the angle at fraction f of the day (0 at sunrise), whose light lasts dp of the 18
   *  parts; between r0 and r1. The long stretches of day and of night are one piece each; only the twilights are stepped (`steps` to each change of colour). */
  function skyArc(parent: Element, r0: number, r1: number, at: (f: number) => number, steps: number, dp: number, attrs: Record<string, string | number | undefined> = {}) {
    const [day, amber, ember, violet, night] = [C.dlSkyDay, C.dlSkyAmber, C.dlSkyEmber, C.dlSkyViolet, C.dlSkyNight].map(rgbOf);
    const w = 0.035, L = Math.max(4.4 * w, Math.min(1 - 4.4 * w, dp / 18));   // a day all light, or all night, keeps its twilights
    const stops: [number, number[]][] = [[0, ember], [w, amber], [2 * w, day], [L - 2 * w, day], [L - w, amber], [L, ember], [L + w, violet], [L + 2.2 * w, night], [1 - 2.2 * w, night], [1 - w, violet], [1, ember]];
    const g = el('g', attrs, parent), over = 0.0015;        // each piece a hair over the next: no seams
    for (let k = 0; k < stops.length - 1; k++) {
      const [f0, c0] = stops[k], [f1, c1] = stops[k + 1], n = c0 === c1 ? 1 : steps;
      for (let q = 0; q < n; q++) { const t = (q + 0.5) / n;
        el('path', { d: sectorPath(r0, r1, at(f0 + ((f1 - f0) * q) / n), at(Math.min(1, f0 + ((f1 - f0) * (q + 1)) / n + over))), fill: `rgb(${c0.map((v, i) => Math.round(v + (c1[i] - v) * t)).join(',')})` }, g); }
    }
    return g;
  }
  const root = el('g', { class: 'dl-root' }, svg);
  let partHi: Element | null = null, degRun: Element | null = null, degInk: Element | null = null;   // the part now and its degrees (update sets them)
  let rings: Ring[] = [], world: Layer | null = null, centre: Layer | null = null, chart: SVGGElement | null = null, bodies: SVGGElement | null = null, needle: SVGGElement | null = null, parts: Element[] = [], built = '';
  const keyOf = (doc: YearDoc, s: DialState) => `${doc.calculation.enoch_year}:${s.i}:${doc.calculation.latitude}:${doc.calculation.longitude_east}:${paletteGeneration()}`;   // a new theme draws the face again

  /** Rings and the world layer for day i, drawn at rotation 0 (ring-local angles). */
  function build(doc: YearDoc, s: DialState) {
    root.replaceChildren(); pdefs.replaceChildren(); rings = []; parts = []; paintDefs();
    const e = s.ext;
    const ring = (name: string, units: number, dir: 1 | -1, cur: (s: DialState) => number, markR: number) => {
      const layer = new Layer(root, `dl-ring dl-ring-${name}`), at = (u: number) => (dir * u * 360) / units;
      const mark = el('circle', { r: 0.6, fill: 'none', 'data-ring-mark': name }, layer.g);
      rings.push({ name, layer, units, dir, cur, mark, markR }); return { g: layer.g, at, layer };
    };
    /** A ring's ground: a pane of glass between r0 and r1, nearly clear. */
    const glass = (r0: number, r1: number, a: number, parent: Element) => el('path', { d: dot(0, 0, r1) + dot(0, 0, r0), fill: alpha('dlGlass', a, C), 'fill-rule': 'evenodd' }, parent);
    const hair = (r: number, color: string, opacity: number, parent: Element) => el('circle', { r, fill: 'none', stroke: color, 'stroke-opacity': opacity, 'stroke-width': 0.55 }, parent);

    // ------------------------------------------------ world (true bearings, turned by the framing)
    const set = !!opts.bezel && paper();                      // set into a paper page: a shadow under it and a brass bezel over it, both the page's (they do not turn with the sky)
    if (set) {                                                // the shadow: a shape, not a filter (the Dial turns every frame)
      const W = el('g', { class: 'dl-set', 'pointer-events': 'none' }, root);
      const sh = el('radialGradient', { id: `${id}-shadow`, gradientUnits: 'userSpaceOnUse', cx: 0, cy: 7, r: DR.band1 + 18 }, pdefs);
      for (const [o, a] of [[(DR.band1 - 14) / (DR.band1 + 18), 0.5], [(DR.band1 + 2) / (DR.band1 + 18), 0.3], [1, 0]] as const) el('stop', { offset: o.toFixed(4), 'stop-color': PAGE.ivory, 'stop-opacity': a }, sh);
      el('circle', { cy: 7, r: DR.band1 + 18, fill: `url(#${id}-shadow)` }, W);
    }
    world = new Layer(root, 'dl-world'); const W = world.g;
    el('circle', { r: DR.band1, fill: rgrad('space', 0, DR.band1, [C.dlSpace0, C.dlSpace1, C.dlSpace2]), stroke: C.dlLine, 'stroke-width': 0.8 }, W);   // space, under the whole instrument
    el('circle', { r: DR.horizon, fill: 'none', stroke: C.ivory2, 'stroke-width': 1.1 }, W);
    for (const alt of [30, 60]) el('circle', { r: altRadius(alt), fill: 'none', stroke: C.dlLine, 'stroke-width': 0.5, 'stroke-dasharray': '1 5' }, W);
    let ticks = '', majors = '';
    for (let b = 0; b < 360; b += 5) if (b % 30) ticks += `M${P(DR.tick0, b)}L${P(DR.tick1, b)}`; else majors += `M${P(DR.tick0, b)}L${P(DR.tick1 + 4, b)}`;
    el('path', { d: ticks, stroke: C.dlLine, 'stroke-width': 0.6 }, W); el('path', { d: majors, stroke: C.ivory2, 'stroke-width': 1 }, W);
    for (const [b, t] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']] as const) world.label(DR.horizon - 10, b, t, { class: 'dl-card' });
    for (let b = 30; b < 360; b += 30) if (b % 90) world.label(DR.horizon - 10, b, String(b), { class: 'dl-tiny' });
    // the Sun's path today, a dot at every whole part: their spacing is the Sun's speed
    const tr = s.trace; let d = ''; tr.forEach((p, k) => { if (p.alt > 0) d += `${k && tr[k - 1].alt > 0 ? 'L' : 'M'}${P(altRadius(p.alt), p.az)}`; });
    el('path', { d, fill: 'none', stroke: C.goldDim, 'stroke-width': 0.9, 'stroke-dasharray': '2 3', class: 'dl-sunpath' }, W);
    s.path.forEach((p, k) => { if (p.alt > 0 && k < 18) { const [x, y] = polar(altRadius(p.alt), p.az); el('circle', { cx: x, cy: y, r: 1.6, fill: C.gold, opacity: 0.7 }, W); } });
    // the portals, standing on the horizon as the Sky draws them: a hatched pillar over each seam, an arch over each portal's span (model.ts arches), its
    // number over it; the arches the Sun rises and sets in today are lit: its month's (1 Enoch 72), east and west alike
    for (const PP of [doc.portals, doc.portals_west]) {
      for (const [lo, hi] of pillars(PP)) el('path', { d: seamPath(lo, hi, altRadius), fill: `url(#${id}-hatch)`, 'fill-opacity': 0.7, class: 'dl-seam', 'pointer-events': 'none' }, W);
      const S = arches(PP);
      for (const p of PP) {
        const on = p.portal === e.portal, span = S.get(p.portal)!;
        el('path', { d: archPath(span, altRadius), fill: on ? alpha('goldHi', 0.16, C) : 'none', stroke: on ? C.goldHi : C.gold, 'stroke-width': on ? 2.4 : 1.5, 'stroke-opacity': on ? 1 : 0.9,
          'stroke-linejoin': 'round', filter: glow(on ? 'wide' : 'lit'), class: on ? 'dl-arch dl-arch-on' : 'dl-arch', 'data-portal': p.portal, 'pointer-events': 'none' }, W);
        world.label(altRadius(PORTAL_ALT) + 9, (span[0] + span[1]) / 2, String(p.portal), { class: on ? 'dl-pn dl-pn-rim dl-on' : 'dl-pn dl-pn-rim' });
      }
    }
    // centre: the disc, the optional sky chart (redrawn per instant, screen angles), then on top the compass and the six portals east and west: the same
    // arches as on the horizon and in Sky, standing on the centre's own horizon, numbered 1 to 6, today's two lit; and today's sunrise and sunset bearings
    el('circle', { r: DR.cmp, fill: C.dlDisc, stroke: C.dlLine, 'stroke-width': 0.8 }, W);
    chart = el('g', { class: 'dl-chart' }, root) as SVGGElement;
    centre = new Layer(root, 'dl-centre'); const Z = centre.g;
    const inner = (alt: number) => 100 + (alt / PORTAL_ALT) * 24;
    for (const PP of [doc.portals, doc.portals_west]) {
      const S = arches(PP), lo = Math.min(...[...S.values()].map((q) => q[0])) - 3, hi = Math.max(...[...S.values()].map((q) => q[1])) + 3;
      el('path', { d: `M${P(100, lo)}A100 100 0 0 1 ${P(100, hi)}`, fill: 'none', stroke: C.ivory2, 'stroke-width': 0.9, class: 'dl-portal' }, Z);
      for (const p of PP) {
        const on = p.portal === e.portal, span = S.get(p.portal)!;
        el('path', { d: archPath(span, inner), fill: alpha(on ? 'goldHi' : 'gold', on ? 0.2 : 0.05, C), stroke: on ? C.goldHi : C.gold, 'stroke-width': on ? 1.6 : 1, 'stroke-linejoin': 'round',
          filter: on ? glow('soft') : undefined, class: on ? 'dl-portal dl-arch-on' : 'dl-portal', 'data-portal-in': p.portal }, Z);
        centre.label(110, (span[0] + span[1]) / 2, String(p.portal), { class: on ? 'dl-pn dl-on' : 'dl-pn' });
      }
    }
    for (const [b, col] of [[s.row.azimuth_deg, C.goldHi], [e.sunset_azimuth_deg, C.dlSkyNight]] as const) el('path', { d: `M${P(98, b)}L${P(128, b)}`, stroke: col, 'stroke-width': 1.6 }, Z);
    for (const [b, t] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']] as const) centre.label(82, b, t, { class: b === 0 ? 'dl-cmp dl-north' : 'dl-cmp' });
    let ct = ''; for (let b = 0; b < 360; b += 10) ct += `M${P(130, b)}L${P(b % 90 ? 134 : 138, b)}`;
    el('path', { d: ct, stroke: C.dlLine, 'stroke-width': 0.6 }, Z);
    bodies = el('g', { class: 'dl-bodies' }, root) as SVGGElement;

    // ------------------------------------------------ calendar rings (all continuous: the gear train in state.ts)
    // R6 uncorrected month (the paper's 364-day count, no correction), anticlockwise
    { const { g, at, layer } = ring('uncorrected', 364, -1, (x) => x.phases.uncorrected, (DR.um0 + DR.um1) / 2);
      glass(DR.um0 + 1, DR.um1 - 1, 0.07, g);
      el('circle', { r: DR.um0, fill: 'none', stroke: C.dlCountDim, 'stroke-width': 0.6 }, g);
      let t = ''; for (let m = 1; m <= 12; m++) { const a0 = at(MS[m - 1] - 1), a1 = at(MS[m] - 1); t += `M${P(DR.um0, a0)}L${P(DR.um1, a0)}`;
        layer.label((DR.um0 + DR.um1) / 2, (a0 + a1) / 2, String(m), { class: m === e.uncorrected_month ? 'dl-um dl-on' : 'dl-um' }); }
      el('path', { d: t, stroke: C.dlCountDim, 'stroke-width': 0.8 }, g); }
    // R5 months and the 364 positions (corrected), anticlockwise; hold marks; the quarter leaders. The months are ember glass, the month now solid
    { const { g, at, layer } = ring('position', 364, -1, (x) => x.phases.position, (DR.mo0 + DR.mo1) / 2);
      glass(DR.cor0 + 1, DR.cor1 - 1, 0.07, g);              // the correction ring's ground, under this ring's ticks
      for (let m = 1; m <= 12; m++) {
        const a0 = at(MS[m] - 1), a1 = at(MS[m - 1] - 1), on = m === s.row.month;
        el('path', { d: sectorPath(DR.mo0, DR.mo1, a0, a1), fill: on ? C.dlRed : alpha('dlRed', m % 2 ? 0.2 : 0.13, C), stroke: C.dlOxEdge, 'stroke-width': 2.6,
          filter: on ? glow('soft') : undefined }, g);
        layer.label((DR.mo0 + DR.mo1) / 2 + 3, (a0 + a1) / 2, String(m), { class: on ? 'dl-month dl-on' : 'dl-month' });
        layer.label((DR.mo0 + DR.mo1) / 2 - 11, (a0 + a1) / 2, GEEZ[m], { class: 'dl-geez' });
      }
      for (const r of [DR.mo0, DR.mo1]) hair(r, C.dlRed, 0.5, g);
      let tk = '', tn = '', tm = ''; for (let p = 0; p <= 364; p++) { const month = MS.includes(p + 1), ten = p % 10 === 0, seg = `M${P(DR.pos0 - (month ? 14 : ten ? 9 : 5), at(p))}L${P(DR.pos0 + 2, at(p))}`;
        if (month) tm += seg; else if (ten) tn += seg; else tk += seg; }
      el('path', { d: tk, stroke: C.gold, 'stroke-width': 0.9, 'stroke-opacity': 0.85 }, g); el('path', { d: tn, stroke: C.goldHi, 'stroke-width': 1.3 }, g); el('path', { d: tm, stroke: C.goldHi, 'stroke-width': 1.8 }, g);
      el('circle', { r: DR.pos0 + 2, fill: 'none', stroke: C.gold, 'stroke-width': 0.8, 'stroke-opacity': 0.8 }, g);
      for (const q of [91, 182, 273, 364]) { const a = at(q - 0.5), [x, y] = polar(DR.mo1 + 1, a); el('path', { d: `M${x} ${y - 4}l4 4l-4 4l-4-4z`, fill: C.goldHi, transform: `rotate(${a} ${x} ${y})` }, g); }
      doc.extended.forEach((x, k) => { if (x.hold && k < doc.rows.length - 1) tri(DR.pos0 - 10, at(doc.rows[k].corrected_doy - 0.5), 'l-4 7h8z', C.dlCount, g); });
    }
    // R4 the 294-day correction cycle: 7 × 42 × (7 × 6), anticlockwise; the hold opens each cycle
    { const { g, at, layer } = ring('correction', 294, -1, (x) => x.phases.correction, (DR.cor0 + DR.cor1) / 2);
      el('circle', { r: DR.cor0, fill: 'none', stroke: C.dlCountDim, 'stroke-width': 0.6 }, g);
      el('circle', { r: DR.cor1, fill: 'none', stroke: C.dlCountDim, 'stroke-width': 0.6 }, g);
      let t6 = '', t42 = '';
      for (let k = 0; k < 294; k += 6) if (k % 42) t6 += `M${P(DR.cor0, at(k))}L${P(DR.cor0 + 6, at(k))}`; else t42 += `M${P(DR.cor0, at(k))}L${P(DR.cor1, at(k))}`;
      el('path', { d: t6, stroke: C.dlCountDim, 'stroke-width': 0.7 }, g); el('path', { d: t42, stroke: C.dlCount, 'stroke-width': 1.1 }, g);
      for (let w = 0; w < 7; w++) layer.label((DR.cor0 + DR.cor1) / 2 + 2, at(w * 42 + 21), `${w + 1}`, { class: w + 1 === e.correction_42 ? 'dl-cor dl-on' : 'dl-cor' });
      el('path', { d: sectorPath(DR.cor0, DR.cor1, at(e.correction_day - 1), at(e.correction_day)), fill: C.dlCount }, g);
      tri(DR.cor1 - 2, at(0), 'l-5 9h10z', C.dlCount, g);
    }
    // R3 the 24 priestly courses, anticlockwise; each course is one week. Read at a glance: its number, the course now a lit window; its name small above
    // it. Inside the ring, the week's seven days as a necklace of beads, Sunday to the Sabbath under each course: served, filled; today, the large lit one;
    // the Sabbath, a ring. The Sun's line crosses one a day
    { const { g, at, layer } = ring('courses', 24, -1, (x) => x.phases.courses, (DR.crs0 + DR.crs1) / 2);
      const lit = rgrad('lit', DR.crs0, DR.crs1, [C.dlLitEdge, C.dlLit, C.dlLitEdge]);
      const plain = alpha('dlGlass', 0.4, C), sabbath = alpha('dlGlass', 0.75, C);
      doc.priests.courses.forEach((c, k) => {
        const a0 = at(k + 1), a1 = at(k), on = c.n === e.course;
        el('path', { d: sectorPath(DR.crs0, DR.crs1, Math.min(a0, a1) + 0.4, Math.max(a0, a1) - 0.4), fill: on ? lit : alpha('dlGlass', k % 2 ? 0.11 : 0.06, C), filter: on ? glow('soft') : undefined, 'data-course': on ? 'on' : undefined }, g);
        layer.label(DR.crs1 - 7, (a0 + a1) / 2, c.name, { class: on ? 'dl-cname dl-on-dark' : 'dl-cname' });
        layer.label(DR.crs0 + 17, (a0 + a1) / 2, String(c.n), { class: on ? 'dl-cnum dl-on-dark' : 'dl-cnum' });
        for (let d = 0; d < 7; d++) {
          const [bx, by] = polar(DR.bead, at(k + (d + 0.5) / 7)), today = on && d + 1 === e.weekday, past = on && d + 1 < e.weekday, sab = d === 6;
          el('circle', { cx: bx.toFixed(2), cy: by.toFixed(2), r: today ? 3.6 : sab ? 2.4 : on ? 2.3 : 1.9, fill: today ? C.dlLit : past ? C.gold : sab ? 'none' : plain,
            stroke: sab && !today ? (past ? C.gold : sabbath) : undefined, 'stroke-width': sab && !today ? 0.8 : undefined,
            filter: today ? glow('lit') : undefined, 'data-day': today ? 'on' : undefined }, g);
        }
      });
      for (const r of [DR.crs0, DR.crs1]) hair(r, C.dlCourse, 0.28, g); }
    // R1 the 18 parts of the day, clockwise, gliding: beside them the day's sky (its light from the measured sunrise to sunset, then its night); each part
    // 20 degrees, ticked along the rim (a longer one every 5); the part now is lit and its degrees run so far a bar (update)
    { const { g, at, layer } = ring('parts', 18, 1, (x) => x.phases.parts, (DR.pt0 + DR.pt1) / 2);
      partHi = el('path', { class: 'dl-part-hi' }, g);
      skyArc(g, DR.day0 - 3.5, DR.day1 + 3.5, (f) => at(18 * f), 2, s.dayParts, { opacity: 0.2 });   // the sky's light, spread
      skyArc(g, DR.day0, DR.day1, (f) => at(18 * f), 5, s.dayParts, { 'data-sky': '1' });
      el('path', { d: sectorPath(DR.day0 - 4, DR.day0 - 2, at(0), at(s.textParts)), fill: C.bronze, opacity: 0.8 }, g);
      let sp = ''; for (let k = 0; k < 18; k++) {
        sp += `M${P(DR.pt0, at(k))}L${P(DR.pt1, at(k))}`;
        parts.push(layer.label((DR.pt0 + DR.pt1) / 2, at(k + 0.5), String(k + 1).padStart(2, '0'), { class: 'dl-part' }));
      }
      el('path', { d: sp, stroke: C.dlLine, 'stroke-width': 0.6 }, g);
      let fine = ''; for (let k = 0; k < 360; k++) fine += `M${P(DR.pt1 - (k % 20 === 0 ? 0 : k % 5 === 0 ? 6 : 3), at(k / 20))}L${P(DR.pt1, at(k / 20))}`;
      el('path', { d: fine, stroke: C.dlLine, 'stroke-width': 0.55 }, g);
      degRun = el('path', { class: 'dl-deg-run' }, g); degInk = el('path', { stroke: C.dlRunInk, 'stroke-width': 0.8, fill: 'none', class: 'dl-deg-ink' }, g);
    }
    needle = el('g', { class: 'dl-needle' }, root) as SVGGElement;
    if (set) {                                                // the bezel, over the rim
      const W = el('g', { class: 'dl-set', 'pointer-events': 'none' }, root);
      const bz = el('linearGradient', { id: `${id}-bezel`, x1: 0, y1: 0, x2: 0.35, y2: 1 }, pdefs); [['0', C.goldHi], ['0.35', C.goldDim], ['0.6', C.gold], ['1', C.bronzeDim]].forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, bz));
      el('circle', { r: DR.band1 - 2.5, fill: 'none', stroke: `url(#${id}-bezel)`, 'stroke-width': 5 }, W); el('circle', { r: DR.band1 - 5.4, fill: 'none', stroke: C.bg, 'stroke-width': 0.8 }, W);
    }
    built = keyOf(doc, s);
  }

  /**
   * Turn every ring so the needle reads its exact, continuous value (see `ringPhases`), and redraw
   * the bodies and the needle. Rotation is a pure function of the instant: there is no tween and
   * no state, so a ring can neither lag nor drift, and a day or a week changing is not an event.
   */
  function update(doc: YearDoc, s: DialState, sky: SkyLayers = NO_LAYERS): { rings: RingReport[] } {
    const day = keyOf(doc, s);
    if (day !== built) build(doc, s);                     // the day's sectors and highlights; rotation is set below
    const N = s.needle, report: RingReport[] = [];
    for (const r of rings) {
      const cur = r.cur(s), rot = ringRotation(N, cur, r.units, r.dir), local = (r.dir * cur * 360) / r.units;
      r.layer.turn(rot);
      const [mx, my] = polar(r.markR, local); r.mark.setAttribute('cx', mx.toFixed(4)); r.mark.setAttribute('cy', my.toFixed(4));
      report.push({ name: r.name, rotation: rot, current: cur, units: r.units, dir: r.dir, centre: rot + local });
    }
    // the part now, lit; its 20 degrees run so far, a bar along the rim with its ticks in ink over it; the numerals gold by day, periwinkle by night
    const p = s.time.part, byDay = p - 0.5 < s.dayParts;
    partHi!.setAttribute('d', sectorPath(DR.pt0, DR.pt1, (p - 1) * 20 + 0.6, p * 20 - 0.6)); partHi!.setAttribute('fill', alpha(byDay ? 'dlPday' : 'dlPnight', 0.24, C));
    degRun!.setAttribute('d', sectorPath(DR.pt1 - 6.5, DR.pt1 + 0.8, (p - 1) * 20, Math.max((p - 1) * 20 + 0.3, s.part * 20))); degRun!.setAttribute('fill', byDay ? C.dlRunDay : C.dlRunNight);
    let run = ''; for (let k = (p - 1) * 20; k <= Math.floor(s.part * 20); k++) run += `M${P(DR.pt1 - (k % 20 === 0 ? 6.5 : k % 5 === 0 ? 6 : 3.2), k)}L${P(DR.pt1 + 0.6, k)}`;
    degInk!.setAttribute('d', run);
    parts.forEach((n, k) => n.setAttribute('class', `dl-part ${k + 0.5 < s.dayParts ? 'dl-pday' : 'dl-pnight'}${k + 1 === s.time.part ? ' dl-on' : ''}`));
    world!.turn(s.F); centre!.turn(s.F);
    centre!.g.setAttribute('class', `dl-centre dl-centre-${sky.centre}`);
    drawBodies(s, sky); drawChart(s, sky); drawNeedle(s);
    return { rings: report };
  }

  function drawBodies(s: DialState, sky: SkyLayers) {
    const B = bodies!, bear = (b: number) => b + s.F; B.replaceChildren();
    const lab = (r: number, th: number, t: string, cls: string) => {
      const a = ((th % 360) + 360) % 360, flip = a > 90 && a < 270, [x, y] = polar(r, th);
      el('text', { x: x.toFixed(2), y: y.toFixed(2), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: cls, transform: `rotate(${(th + (flip ? 180 : 0)).toFixed(3)} ${x.toFixed(2)} ${y.toFixed(2)})` }, B, t);
    };
    if (sky.figures) el('path', { d: figurePath(s, sky.figures, (az, alt) => polar(altRadius(alt), bear(az)), true), fill: 'none', stroke: C.silver, 'stroke-width': 0.6, opacity: 0.45, 'data-figures': 'band' }, B);
    // stars: the default set (V ≤ 3.2) brighter; fainter ones (a deeper limit, the figures' stars) dimmer; a step brighter than the catalogue's, and the brightest shine
    let stars = '', faint = '';
    const size = (m: number) => Math.max(0.6, 2.6 - 0.5 * m), g = Math.max(1.5, starGain());
    for (const st of s.bright) if (st.alt > 0) {
      const [x, y] = polar(altRadius(st.alt), bear(st.az)), m = st.mag ?? 3, d = dot(x, y, size(m));
      if (m <= 1.6) el('circle', { cx: x, cy: y, r: 5 * size(m), fill: `url(#${id}-glow)`, opacity: 0.5 }, B);
      if ((st.mag ?? 9) <= 3.2) stars += d; else faint += d;
    }
    el('path', { d: faint, fill: C.starInk, opacity: Math.min(1, 0.32 * g) }, B);
    el('path', { d: stars, fill: C.starInk, opacity: Math.min(1, 0.55 * g) }, B);
    for (const st of s.bright) if (st.alt > 0 && (st.mag ?? 9) < 1.2 && st.name) lab(altRadius(st.alt) + 9, bear(st.az), st.name, 'dl-star');
    // planets and the Moon: above the horizon at their altitude; below it on the inner track, hollow
    const body = (name: string, key: string, az: number, alt: number, rr: number, fill: string, cls = 'dl-body', halo = true) => {
      const up = alt > 0, r = up ? altRadius(alt) : DR.band0 + 3, [x, y] = polar(r, bear(az));
      if (halo) el('circle', { cx: x, cy: y, r: rr + 2.5, fill: 'none', stroke: fill, 'stroke-width': 0.8, opacity: up ? 0.4 : 0.25 }, B);
      el('circle', { cx: x, cy: y, r: rr, fill: up ? fill : 'none', stroke: fill, 'stroke-width': up ? 0 : 1, opacity: up ? 1 : 0.6, 'data-body': key }, B);
      lab(r + rr + 10, bear(az), name, up ? cls : `${cls} dl-below`);
    };
    for (const p of s.planets) body(p.name.toUpperCase(), p.name.toLowerCase(), p.az, p.alt, p.name === 'Uranus' || p.name === 'Neptune' ? 3.2 : 4.4, bodyColor(p.name, C));
    body(`MOON ${(s.moon.fraction * 100).toFixed(0)}%`, 'moon', s.moon.az, s.moon.alt, 6, C.moon, 'dl-moon', false);
    // compass mode: the direction faced is the top of the screen
    if (s.framing === 'compass') el('path', { d: `M0 ${-DR.band1 - 1}l-7 -12h14z`, fill: C.vermilion, 'data-facing': '1' }, B);
  }

  /** The centre as an all-sky chart (stereographic, zenith in the middle), on screen angles. */
  function drawChart(s: DialState, sky: SkyLayers) {
    const G = chart!; G.replaceChildren();
    if (sky.centre === 'off') return;
    const th = (az: number) => (sky.centre === 'above' ? az + s.F : -(az + s.F));
    const at = (az: number, alt: number) => polar(chartRadius(alt), th(az));
    for (const alt of [30, 60]) el('circle', { r: chartRadius(alt), fill: 'none', stroke: C.ivory3, 'stroke-width': 0.4, 'stroke-dasharray': '1 4' }, G);
    el('path', { d: 'M-3 0h6M0 -3v6', stroke: C.ivory3, 'stroke-width': 0.6 }, G);
    if (sky.figures) el('path', { d: figurePath(s, sky.figures, at, false), fill: 'none', stroke: C.silver, 'stroke-width': 0.5, opacity: 0.5, 'data-figures': 'chart' }, G);
    let stars = '';
    for (const st of s.bright) if (st.alt > 0) { const [x, y] = at(st.az, st.alt); stars += dot(x, y, Math.max(0.35, 1.7 - 0.3 * (st.mag ?? 3))); }
    el('path', { d: stars, fill: C.starInk, opacity: 0.7, 'data-chart-stars': '1' }, G);
    const mark = (name: string, az: number, alt: number, r: number, fill: string, halo = false) => {
      if (alt <= 0) return; const [x, y] = at(az, alt);
      if (halo) el('circle', { cx: x, cy: y, r: r + 1.7, fill: 'none', stroke: fill, 'stroke-width': 0.5, opacity: 0.45 }, G);
      el('circle', { cx: x, cy: y, r, fill, 'data-chart-body': name.toLowerCase() }, G);
      el('text', { x: x.toFixed(2), y: (y - r - 3).toFixed(2), 'text-anchor': 'middle', class: 'dl-chart-lbl' }, G, name);
    };
    for (const p of s.planets) mark(p.name, p.az, p.alt, p.name === 'Uranus' || p.name === 'Neptune' ? 2 : 2.5, bodyColor(p.name, C), true);
    mark('Moon', s.moon.az, s.moon.alt, 3, C.moon);
    mark('Sun', s.sun.az, s.sun.alt, 3.5, C.sunCore);
    if (sky.centre === 'up') {                     // its own cardinals: east on the left, as overhead
      for (const [b, t] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']] as const) {
        const [x, y] = polar(CHART_R + 6, th(b)); el('text', { x: x.toFixed(2), y: y.toFixed(2), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: b === 0 ? 'dl-chart-card dl-north' : 'dl-chart-card' }, G, t);
      }
      el('circle', { r: CHART_R, fill: 'none', stroke: C.ivory3, 'stroke-width': 0.6 }, G);
    }
  }

  function drawNeedle(s: DialState) {
    const G = needle!, N = s.needle; G.replaceChildren();
    const up = s.sun.alt > 0, sr = up ? altRadius(s.sun.alt) : DR.band0 + 3, [sx, sy] = polar(sr, N), [tx, ty] = polar(DR.band1, N);
    // the Sun's line, with its light: two wide soft strokes under it (a filter cannot blur a straight line, whose box has no width)
    for (const [w, o] of [[14, 0.07], [7, 0.16]] as const) el('line', { x1: 0, y1: 0, x2: tx, y2: ty, stroke: C.goldHi, 'stroke-width': w, opacity: o, 'stroke-linecap': 'round' }, G);
    el('line', { x1: 0, y1: 0, x2: tx, y2: ty, stroke: C.goldHi, 'stroke-width': 2, 'stroke-dasharray': up ? undefined : '6 4', 'data-needle': '1' }, G);
    tri(DR.mo1 + 2, N, 'l-6 -9h12z', C.goldHi, G);
    // the Sun's motion along the horizon: an arc arrow whose length is the azimuth rate (20 units per °/min)
    const len = Math.max(-40, Math.min(40, s.sun.rate * 20)), R = sr + 16;
    if (Math.abs(len) > 1) {
      const a1 = N + (len / R) * (180 / Math.PI), [ax, ay] = polar(R, a1);
      el('path', { d: `M${P(R, N)}A${R} ${R} 0 0 ${len > 0 ? 1 : 0} ${ax.toFixed(2)} ${ay.toFixed(2)}`, fill: 'none', stroke: C.goldHi, 'stroke-width': 1.2, 'data-sun-rate': '1' }, G);
      tri(R, a1, len > 0 ? 'l-5 -4v8z' : 'l5 -4v8z', C.goldHi, G);
    }
    el('circle', { cx: sx, cy: sy, r: 38, fill: `url(#${id}-glow)` }, G);
    el('circle', { cx: sx, cy: sy, r: 8, fill: up ? C.sunCore : 'none', stroke: C.sunCore, 'stroke-width': 1.5, 'data-body': 'sun' }, G);
    el('circle', { r: 4, fill: C.goldHi }, G);
  }

  return { build, update };
}

const dot = (x: number, y: number, r: number) => `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
/**
 * The constellation figures as one path: each segment follows the great circle between its two
 * stars (sampled every ~2°, each point projected), drawn only above the horizon. `wrapBreak`: lift
 * the pen where the azimuth jumps (the sky band stretches the zenith around its rim).
 */
function figurePath(s: DialState, segments: [string, string][], at: (az: number, alt: number) => [number, number], wrapBreak: boolean) {
  const where = new Map<string, { az: number; alt: number }>();
  for (const b of s.bright) if (b.id) where.set(b.id, b);
  const vec = (p: { az: number; alt: number }) => { const a = rad(p.az), h = rad(p.alt); return [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)]; };
  let d = '';
  for (const [ia, ib] of segments) {
    const pa = where.get(ia), pb = where.get(ib);
    if (!pa || !pb || (pa.alt <= 0 && pb.alt <= 0)) continue;
    const u = vec(pa), v = vec(pb), sep = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) / rad(1);
    const n = Math.max(1, Math.ceil(sep / 2));
    let pen = false, prevAz = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = u[0] + (v[0] - u[0]) * t, y = u[1] + (v[1] - u[1]) * t, z = u[2] + (v[2] - u[2]) * t, m = Math.hypot(x, y, z);
      const alt = Math.asin(z / m) / rad(1), az = Math.atan2(x, y) / rad(1);
      if (alt <= 0 || (wrapBreak && pen && Math.abs(((az - prevAz + 540) % 360) - 180) > 15)) { pen = false; if (alt <= 0) continue; }
      const [px, py] = at(az, alt); d += `${pen ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`; pen = true; prevAz = az;
    }
  }
  return d;
}

/** Which band a point (viewBox units from the centre) falls in. */
export function hitBand(x: number, y: number): RingKey | null {
  const r = Math.hypot(x, y);
  for (const b of BANDS) if (r >= b.r0 && r < b.r1) return b.key;
  return null;
}
