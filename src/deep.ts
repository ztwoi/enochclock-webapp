// Deep Time: every annual Day 1 against the independently
// solved vernal equinox, with the fixed March 21 TT benchmark.
// The page is the design's fixed composition; the main plot is a plot: wheel, pinch or keys zoom its
// time axis (not the picture), a drag pans it, a double-click goes home to all 30,000 years. Its
// envelope is redrawn for the years in view from every annual start (deepplot.ts), down to single
// years; lines and labels keep their size. The day scale stays the design's −6 … +9 days unless the
// reader zooms it (its labels, shift-wheel, an upright pinch). The 294-year cycle row above stays whole.
// Where the design would be drawn too small to read (phones, narrow tablets), the same pieces stack in a
// compact layout drawn at the screen's own pixels: the chart fills the view below the title, with the
// design's proportions (so it opens on the years that fit, around the chosen one), then the cards, the
// notes and the inset, scrolled to.
import { YEAR_MAX, YEAR_MIN } from './dates';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { C, createStage, headClearance, sprite, svgEl, type Pt } from './stage';
import { AXIS, binsIn, binWidth, clampDays, clampRange, clipX, DAYS, dayText, dayTicks, yearTicks, yearText, zoomDays, zoomRange, type Bin, type DeepSeries, type Key } from './deepplot';
import type { DeepDoc } from './types';

export const DL = { YA: -13000, YB: 17000, PX0: 96, PX1: 1430, Z: 432, K: 25, IX0: 96, IX1: 900, IZ: 752, IK: 26 };
/** The whole axis (the cycle row; the plot at home). */
export const xYear = (yr: number) => DL.PX0 + ((yr - DL.YA) / (DL.YB - DL.YA)) * (DL.PX1 - DL.PX0);
export const yOff = (v: number) => DL.Z - v * DL.K;

export interface DeepOptions {
  /** Open this year. */
  onPick(year: number): void;
  /** The visible range changed: the envelope's note (e.g. "Envelope = min–max per 10 years"). */
  onRange?(note: string): void;
}

/** Where the pieces sit, in design units. */
export interface DeepLayout {
  compact: boolean;
  /** The plot (and the cycle row above it, over the same x span). */
  PX0: number; PX1: number; top: number; bot: number; cy: number;
  /** The inset: its x span, its zero line, units per day, its title's baseline. */
  IX0: number; IX1: number; IZ: number; IK: number; insetY: number;
  /** The cards' top-left corners and width (132 tall), and the notes' first baseline. */
  cards: [number, number][]; cardW: number; notes: [number, number];
  /** The years a home view spans (all 30,000 in the design). */
  homeSpan: number;
  /** Compact: the content's height in CSS pixels (it scrolls). */
  height: number;
}
/** The design's composition (1480 × 908). */
const DESIGN: DeepLayout = {
  compact: false, PX0: DL.PX0, PX1: DL.PX1, top: yOff(9.4), bot: yOff(-6.2), cy: yOff(9.4) - 30,
  IX0: DL.IX0, IX1: DL.IX1, IZ: DL.IZ, IK: DL.IK, insetY: 646, cards: [[980, 640], [1212, 640]], cardW: 214, notes: [980, 800], homeSpan: DL.YB - DL.YA, height: 0,
};
/** The design is drawn at least this large (CSS px per unit) before the compact layout takes over: 9.5-unit labels at ~5.5 px. */
const MIN_SCALE = 0.58;
/** The compact layout for a view w × h CSS pixels: the chart fills the view (up to 0.8 of its width tall), keeping the
 *  design's proportion of years to days, so its home spans the years that fit; the rest stacks below. */
function compactLayout(w: number, h: number): DeepLayout {
  const PX0 = 46, PX1 = w - 14, cy = 30, top = cy + 46;
  const chartBottom = Math.max(top + 220, Math.min(h - 24, Math.max(380, w * 0.8))), bot = chartBottom - 34;   // the cards' top edge shows below
  const designYearsPerDay = ((DL.YB - DL.YA) / (DL.PX1 - DL.PX0)) / (15.6 / (yOff(-6.2) - yOff(9.4)));   // years per unit ÷ days per unit
  const homeSpan = Math.max(AXIS.MIN_SPAN, Math.min(DL.YB - DL.YA, (PX1 - PX0) * designYearsPerDay * (15.6 / (bot - top))));
  const cardY = chartBottom + 18, cardW = (w - 28 - 12) / 2, notesY = cardY + 132 + 26, insetY = notesY + 3 * 16 + 28, IZ = insetY + 106;
  return { compact: true, PX0, PX1, top, bot, cy, IX0: PX0, IX1: PX1, IZ, IK: 26, insetY, cards: [[14, cardY], [14 + cardW + 12, cardY]], cardW,
    notes: [14, notesY], homeSpan, height: Math.ceil(IZ + 26 * 2.2 + 14 + 30) };
}
/** The layout for a host w × h CSS pixels (h: below the view's title when compact). */
const layoutFor = (w: number, h: number, hFull: number) => (Math.min(w / 1480, hFull / 908) >= MIN_SCALE ? DESIGN : compactLayout(w, h));

/** What a rebuild carries over: the view's range and day scale, the year, its cycle and its window. */
interface Carry { va: number; vb: number; da: number; db: number; atHome: boolean; year: number; cycle: { ordinal: number; start: number; end: number } | null; win: NonNullable<DeepDoc['window']> }

function build(host: HTMLElement, L: DeepLayout, deep: DeepDoc, series: DeepSeries, c: Carry, o: DeepOptions, view: HTMLElement) {
  const st = createStage(host, 'Deep Time: thirty thousand years of Enoch Day 1 against the vernal equinox', { gestures: false, pixels: L.compact });
  const { scene, overlay, line, rect, text } = st;
  const S = deep.stats, { top, bot, cy } = L;
  const DL = { ...L, YA: -13000, YB: 17000 };
  /** The whole axis on the cycle row. */
  const xYear = (yr: number) => L.PX0 + ((yr - DL.YA) / (DL.YB - DL.YA)) * (L.PX1 - L.PX0);
  const homeRange = (y: number): [number, number] => (L.homeSpan >= DL.YB - DL.YA ? [DL.YA, DL.YB] : clampRange(y - L.homeSpan / 2, y + L.homeSpan / 2));
  const mat = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });

  // the visible range of the plot (home: the whole axis, or the years that fit) and its mapping
  let va = c.va, vb = c.vb, atHome = c.atHome;
  if (atHome || !isFinite(va)) [va, vb] = homeRange(c.year);
  const px = (yr: number) => DL.PX0 + ((yr - va) / (vb - va)) * (DL.PX1 - DL.PX0);
  const yearAtPx = (x: number) => va + ((x - DL.PX0) / (DL.PX1 - DL.PX0)) * (vb - va);
  const isHome = () => atHome;
  const whole = () => va <= DL.YA + 1e-6 && vb >= DL.YB - 1e-6;
  // the day scale, bottom to top of the plot (home: −6.2 … +9.4 days, where py is the design's yOff)
  let da = c.da, db = c.db;
  const py = (v: number) => bot - ((v - da) / (db - da)) * (bot - top);
  const dayAtPy = (y: number) => da + ((bot - y) / (bot - top)) * (db - da);
  const daysHome = () => da <= DAYS.A + 1e-9 && db >= DAYS.B - 1e-9;

  // ---- fixed: the cycle row (the day scale is drawn with the plot)
  const dayHead = text(DL.PX0, top - 4, '', 'lbl-mono dim', { 'font-size': 9.5 });

  line([[DL.PX0, cy], [DL.PX1, cy]], C.goldDim, 0.5);
  const ticks: number[] = [];
  deep.cycle_years.forEach((yr, i) => ticks.push(xYear(yr), cy - (i % 10 === 0 ? 8 : 4), 0, xYear(yr), cy + 4, 0));
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: C.gold }))); }
  text(DL.PX1, cy - 12, L.compact ? `294-YEAR CYCLES · ${deep.cycle_years.length}` : `294 ENOCH YEARS = 107 016 DAYS ≈ 293 SOLAR YEARS · ${deep.cycle_years.length} CYCLE BOUNDARIES`, 'lbl-mono gold', { 'text-anchor': 'end', 'font-size': 9.5 });
  text(xYear(deep.cycle_years[0]) + 4, cy - 12, `${L.compact ? 'EPOCH' : 'CALENDAR EPOCH'} · ${deep.cycle_years[0]}`, 'lbl-mono gold', { 'font-size': 9.5 });
  // the years in view, marked on the whole cycle row while zoomed
  const viewBox = rect(0, cy - 11, 1, 18, mat(C.ivory, 0.07), 0.4);

  // the current 294-year cycle: a band on the cycle row (whole axis) and a faint column over the plot (visible range)
  let cycle = c.cycle;
  const cycBand = rect(0, cy - 9, 1, 14, mat(C.gold, 0.35), 0.5), cycCol = rect(0, cy + 6, 1, bot - cy - 6, mat(C.gold, 0.05), -1.6);
  const cycLabel = text(0, cy + 22, '', 'lbl-mono gold', { 'text-anchor': 'middle', 'font-size': 9.5 });
  function setCycle(c: typeof cycle) { cycle = c; cycLabel.textContent = c ? `CYCLE ${c.ordinal} · ${c.start}–${c.end}` : ''; drawPlot(); }

  // ---- the plot: rebuilt for the visible range (geometry replaced, materials kept)
  const plot = new THREE.Group(); scene.add(plot);
  const plotLabels = svgEl('g', {}, overlay);
  const segs = (color: string, width: number, opacity: number) => {
    const l = new LineSegments2(new LineSegmentsGeometry(), lineMat(color, width, opacity)); plot.add(l); return l;
  };
  /** A material like the stage's lines (pixel widths, kept at the stage's resolution). */
  const lineMat = (color: string, width: number, opacity: number, dash?: [number, number]) => (line([[0, 0], [0, 0]], color, width, opacity, dash).removeFromParent() as Line2).material as LineMaterial;
  const poly = (color: string, width: number, opacity = 1, dash?: [number, number]) => { const l = line([[0, 0], [1, 0]], color, width, opacity, dash, 0, plot); return l; };
  const setPoly = (l: Line2, pts: Pt[], z = 0) => {
    l.visible = pts.length > 1; if (!l.visible) return;
    l.geometry.dispose(); const g = new LineGeometry(); g.setPositions(pts.flatMap(([x, y]) => [x, y, z])); l.geometry = g;
    if ((l.material as LineMaterial).dashed) l.computeLineDistances();
  };
  const setSegs = (l: LineSegments2, xs: number[], y0: number, y1: number) => {
    l.visible = xs.length > 0; if (!l.visible) return;
    l.geometry.dispose(); const g = new LineSegmentsGeometry(); g.setPositions(xs.flatMap((x) => [x, y0, 0, x, y1, 0])); l.geometry = g;
  };
  const setRows = (l: LineSegments2, ys: number[]) => {
    l.visible = ys.length > 0; if (!l.visible) return;
    l.geometry.dispose(); const g = new LineSegmentsGeometry(); g.setPositions(ys.flatMap((y) => [DL.PX0, y, 0, DL.PX1, y, 0])); l.geometry = g;
  };
  const band = (color: string, opacity: number) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat(color, opacity)); m.position.z = -1; plot.add(m); return m; };
  const setBand = (m: THREE.Mesh, up: Pt[], dn: Pt[]) => {
    m.visible = up.length > 1 && dn.length > 1; if (!m.visible) return;
    m.geometry.dispose(); m.geometry = new THREE.ShapeGeometry(new THREE.Shape([...up, ...dn.reverse()].map(([x, y]) => new THREE.Vector2(x, y))), 1);
  };
  const dotsOf = (color: string, size: number) => { const p = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity: 0.9 })); plot.add(p); return p; };
  const setDots = (p: THREE.Points, pts: Pt[]) => {
    p.visible = pts.length > 0; if (!p.visible) return;
    p.geometry.dispose(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(([x, y]) => [x, y, 0.5]), 3)); p.geometry = g;
  };

  // the day scale: a line every day (finer when zoomed), the equinox, the ±1 day band
  const dayLines = segs(C.ivory, 0.5, 0.09), zero = poly(C.ivory, 1);
  const oneBand = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(C.silver, 0.06)); oneBand.position.z = -1.5; plot.add(oneBand);
  const oneLabel = text(DL.PX1, 0, '±1 DAY', 'lbl-mono silver-dim', { 'text-anchor': 'end', 'font-size': 9.5 });
  const eqLabel = text(DL.PX0 + 6, 0, L.compact ? 'VERNAL EQUINOX · SWISS EPH · TT' : 'VERNAL EQUINOX · SOLVED FROM SWISS EPHEMERIS · TT', 'lbl-mono ivory2', { 'font-size': 9.5 });
  const gridMinor = segs(C.ivory, 0.5, 0.04), gridMajor = segs(C.ivory, 0.5, 0.14), cycLines = segs(C.gold, 0.6, 0.22);
  const gregBand = band(C.silver, 0.16), enochBand = band(C.gold, 0.3);
  const gregMean = poly(C.silver, 1.1), enochMean = poly(C.goldHi, 1.5);
  const gregDots = dotsOf(C.silver, 3), enochDots = dotsOf(C.gold, 3.6);
  // everything in the plot is cut to its rectangle (a zoomed day scale leaves values above and below it)
  st.renderer.localClippingEnabled = true;
  const planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -DL.PX0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), DL.PX1),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -top), new THREE.Plane(new THREE.Vector3(0, -1, 0), bot)];
  plot.traverse((m) => { const q = (m as THREE.Mesh).material as THREE.Material | undefined; if (q) q.clippingPlanes = planes; });
  const enochLabel = text(DL.PX1 - 4, 0, 'Enoch Day 1', 'serif-it gold-hi', { 'text-anchor': 'end', 'font-size': 16 });
  const gregLabel = text(DL.PX1 - 4, 0, 'Gregorian · March 21 TT', 'serif-it silver', { 'text-anchor': 'end', 'font-size': 16 });

  // the selected year (plot, visible range) + hover crosshair
  let year = c.year;
  const sel = poly(C.goldHi, 0.8, 1, [2, 3]);
  const selDot = sprite(22); scene.add(selDot);
  const selLabel = text(0, L.compact ? top + 14 : bot - 8, '', 'lbl-mono gold-hi');   // compact: at the top, clear of the zoom buttons
  const hover = svgEl('g', { class: 'hover', visibility: 'hidden' }, overlay);
  const hLine = svgEl('line', { y1: cy + 6, y2: bot, stroke: C.ivory2, 'stroke-width': 0.6, 'stroke-dasharray': '1 3' }, hover);
  const hBox = svgEl('g', {}, hover);
  const boxW = Math.min(300, L.PX1 - L.PX0 - 8);
  svgEl('rect', { width: boxW, height: 78, fill: '#0d0c0a', stroke: 'rgba(236,227,207,.16)' }, hBox);
  const hT = [0, 1, 2, 3].map((k) => svgEl('text', { x: 12, y: 20 + k * 17, class: k === 0 ? 'lbl-mono' : k === 1 ? 'lbl-mono gold' : 'lbl-mono silver' }, hBox));

  const valueOf = (k: Key, yr: number) => { const i = yr - series.first_year; return i >= 0 && i < series.enoch.length ? series[k][i] : null; };
  let width = 100, bins: Bin[] = [];
  /** A bin's place on the axis: the middle of the years it holds. */
  const centre = (b: Bin) => Math.max(b.year, series.first_year) + (b.n - 1) / 2;
  const envelopeNote = () => (width === 1 ? 'Every annual start' : `Envelope = min–max per ${width} years`);

  function drawPlot() {
    const span = vb - va, x0 = DL.PX0, x1 = DL.PX1, inDays = (v: number) => v >= da - 1e-9 && v <= db + 1e-9;
    // the day scale
    const dt = dayTicks(da, db);
    setRows(dayLines, dt.lines.filter((v) => Math.abs(v) > 1e-9).map(py));
    zero.visible = inDays(0); if (zero.visible) setPoly(zero, [[x0, py(0)], [x1, py(0)]]);
    const b0 = py(Math.min(1, db)), b1 = py(Math.max(-1, da));
    oneBand.visible = b1 > b0; oneBand.scale.set(x1 - x0, Math.max(1e-3, b1 - b0), 1); oneBand.position.set((x0 + x1) / 2, (b0 + b1) / 2, -1.5);
    oneLabel.setAttribute('y', String(py(1) - 6)); oneLabel.setAttribute('visibility', inDays(1) && py(1) - 6 > top + 8 ? 'visible' : 'hidden');
    const eqY = L.compact ? py(Math.max(-1, da)) + 13 : py(0) - 7;                // compact: under the ±1 day band, off the data
    eqLabel.setAttribute('y', String(eqY)); eqLabel.setAttribute('visibility', inDays(0) && eqY > top + 8 && eqY < bot - 4 ? 'visible' : 'hidden');
    dayHead.textContent = `DAY 1 − EQUINOX · LATER ↑${daysHome() ? '' : ` · DAYS ×${((DAYS.B - DAYS.A) / (db - da)).toFixed(1)}`}`;
    // grid and year labels: round years, about six labelled (every 5,000 for the whole axis), faint lines between
    const t = yearTicks(va, vb, Math.max(6, (DL.PX1 - DL.PX0) / 90)), inside = (y: number) => y > va + 1e-6 && y < vb - 1e-6;
    setSegs(gridMinor, t.minor.filter(inside).map(px), top, bot);
    setSegs(gridMajor, t.major.filter(inside).map(px), top, bot);
    plotLabels.replaceChildren();
    for (const v of dt.major) text(DL.PX0 - 12, py(v) + 3.5, dayText(v, dt.decimals), Math.abs(v) < 1e-9 ? 'lbl-mono' : 'lbl-mono dim', { 'text-anchor': 'end' }, plotLabels);
    const signed = va < 0;
    for (const y of t.major) if (inside(y)) text(px(y), bot + 18, yearText(y, signed), 'lbl-mono dim', { 'text-anchor': 'middle' }, plotLabels);
    // the 294-year boundaries inside the plot, once they are far enough apart to read
    setSegs(cycLines, span <= 6000 ? deep.cycle_years.filter(inside).map(px) : [], cy + 6, bot);

    // the envelopes (exact min–max per bin) and their means; single years as points
    const w = binWidth(span); width = w;
    bins = binsIn(series, va - w, vb + w, w);
    const at = (k: Key, j: 0 | 1 | 2) => clipX(bins.map((b) => [px(centre(b)), py(b[k][j])] as Pt), x0, x1);
    const one = w === 1;
    setBand(gregBand, one ? [] : at('greg', 2), one ? [] : at('greg', 0));
    setBand(enochBand, one ? [] : at('enoch', 2), one ? [] : at('enoch', 0));
    setPoly(gregMean, at('greg', 1)); setPoly(enochMean, at('enoch', 1));
    (gregMean.material as LineMaterial).opacity = one ? 0.35 : 1; (enochMean.material as LineMaterial).opacity = one ? 0.45 : 1;
    (gregMean.material as LineMaterial).linewidth = one ? 0.7 : 1.1; (enochMean.material as LineMaterial).linewidth = one ? 0.7 : 1.5;
    (gregMean.material as LineMaterial).transparent = (enochMean.material as LineMaterial).transparent = true;
    const pts = (k: Key) => (one ? bins.filter((b) => b.year >= va && b.year <= vb).map((b) => [px(b.year), py(b[k][1])] as Pt) : []);
    setDots(gregDots, pts('greg')); setDots(enochDots, pts('enoch'));
    // the series' names at the right edge: the higher series above both, the lower below, clear of the ±1 DAY label
    const edge = bins.filter((b) => centre(b) >= vb - span * 0.08 && centre(b) <= vb), last = edge[edge.length - 1];
    if (!L.compact && whole() && daysHome()) {                       // all 30,000 years in the design: its places
      const end = bins[bins.length - 1]; gregLabel.setAttribute('y', String(py(end.greg[2]) - 10)); enochLabel.setAttribute('y', String(py(end.enoch[1]) + 30));
    } else if (last) {
      const hi = (k: Key) => Math.max(...edge.map((b) => b[k][2])), lo = (k: Key) => Math.min(...edge.map((b) => b[k][0]));
      const gUp = last.greg[1] >= last.enoch[1], keep = (y: number) => Math.max(top + 16, Math.min(bot - 8, y));
      const above = py(Math.max(hi('enoch'), hi('greg'))) - 10, below = py(Math.min(lo('enoch'), lo('greg'))) + 22;
      const clear = (y: number) => (inDays(1) && Math.abs(y - (py(1) - 6)) < 16 ? py(1) - 22 : y);
      const offEq = (y: number) => (L.compact && eqLabel.getAttribute('visibility') === 'visible' && Math.abs(y - eqY) < 18 ? eqY + 22 : y);   // compact: clear of the equinox label
      gregLabel.setAttribute('y', String(keep(offEq(gUp ? clear(above) : below)))); enochLabel.setAttribute('y', String(keep(offEq(gUp ? below : clear(above)))));
    }

    // the cycle: its column over the plot, its band on the row
    cycBand.visible = cycCol.visible = !!cycle;
    if (cycle) {
      const b0 = xYear(cycle.start), bw = Math.max(2, xYear(cycle.end) - b0);
      cycBand.scale.set(bw, 1, 1); cycBand.position.x = b0 + bw / 2;
      const c0 = Math.max(x0, px(cycle.start)), c1 = Math.min(x1, px(cycle.end));
      cycCol.visible = c1 > c0; cycCol.scale.set(Math.max(1, c1 - c0), 1, 1); cycCol.position.x = (c0 + c1) / 2;
      cycLabel.setAttribute('x', String(Math.max(DL.PX0 + 64, Math.min(DL.PX1 - 64, b0 + bw / 2))));
    }
    viewBox.visible = !whole();
    if (viewBox.visible) { const a = xYear(va), b = Math.max(3, xYear(vb) - a); viewBox.scale.set(b, 1, 1); viewBox.position.x = a + b / 2; }

    // the selected year
    const row = win.rows.find((q) => q.year === year), r = row ? row.enoch : valueOf('enoch', year), x = px(year), shown = year >= va && year <= vb;   // the exact row when loaded
    sel.visible = shown; if (shown) setPoly(sel, [[x, cy + 6], [x, bot]]);
    selDot.visible = shown && r !== null && inDays(r); if (r !== null) selDot.position.set(x, py(r), 2);
    selLabel.setAttribute('visibility', shown ? 'visible' : 'hidden'); selLabel.setAttribute('x', String(x + 7)); selLabel.textContent = String(year);
    anchors = { ...anchors, year, x, y: r !== null ? py(r) : NaN, offset: r ?? 0 };

    view.classList.toggle('zoomed', !isHome() || !daysHome());
    o.onRange?.(envelopeNote());
    st.render();
  }

  // ---- inset: every annual start in the window
  const inset = new THREE.Group(); scene.add(inset);
  const insetLabels = svgEl('g', {}, overlay);
  let win = c.win;
  const ix = (yr: number) => DL.IX0 + ((yr - win.start) / (win.end - win.start)) * (DL.IX1 - DL.IX0), iy = (v: number) => DL.IZ - v * DL.IK;
  function drawInset() {
    inset.clear(); insetLabels.replaceChildren();
    text(DL.IX0, L.insetY, `EVERY ANNUAL START · ${win.start} – ${win.end}`, 'lbl-cond dim', { 'font-size': 10.5 }, insetLabels);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(DL.IX1 - DL.IX0, 2 * DL.IK), mat(C.silver, 0.06)); r.position.set((DL.IX0 + DL.IX1) / 2, iy(0), -1.5); inset.add(r);
    for (const v of [-2, -1, 0, 1, 2]) {
      line([[DL.IX0, iy(v)], [DL.IX1, iy(v)]], C.ivory, v === 0 ? 0.8 : 0.5, v === 0 ? 0.6 : 0.09, undefined, 0, inset);
      text(DL.IX0 - 10, iy(v) + 3.5, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`, 'lbl-mono dim', { 'text-anchor': 'end', 'font-size': 9.5 }, insetLabels);
    }
    const stepY = Math.ceil((win.end - win.start) / 7 / 50) * 50;
    for (let yr = Math.ceil(win.start / stepY) * stepY; yr <= win.end; yr += stepY) {
      line([[ix(yr), iy(2.2)], [ix(yr), iy(-2.2)]], C.ivory, 0.5, 0.05, undefined, 0, inset);
      text(ix(yr), iy(-2.2) + 14, String(yr), 'lbl-mono dim', { 'text-anchor': 'middle', 'font-size': 9.5 }, insetLabels);
    }
    const dots = (key: 'enoch' | 'greg', color: string, size: number) => {
      const pos: number[] = []; for (const r of win.rows) pos.push(ix(r.year), iy(Math.max(-2.4, Math.min(2.4, r[key]))), 0.5);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      inset.add(new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity: 0.9 })));
    };
    dots('greg', C.silver, 2.4); dots('enoch', C.gold, 2.8);
  }
  const insetSel = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.2, 32), mat(C.goldHi, 1)); scene.add(insetSel);

  // ---- statistic cards
  const cards: [string, string, string][] = [
    ['WITHIN ±1 DAY', `${S.enoch.within_1_day_pct.toFixed(1)}%`, `${S.greg.within_1_day_pct.toFixed(1)}%`],
    ['SPREAD · σ', `${S.enoch.std.toFixed(2)} d`, `${S.greg.std.toFixed(2)} d`],
  ];
  cards.forEach(([h, a, b], i) => { const [x0, y0] = L.cards[i], cw = L.cardW;
    line([[x0, y0], [x0 + cw, y0], [x0 + cw, y0 + 132], [x0, y0 + 132], [x0, y0]], C.ivory, 0.6, 0.16);
    text(x0 + 16, y0 + 26, h, 'lbl-cond dim', { 'font-size': 10.5 });
    text(x0 + 16, y0 + 70, a, 'card-big');
    text(x0 + 16, y0 + 88, 'ENOCH DAY 1', 'lbl-mono gold', { 'font-size': 9.5 });
    text(x0 + 16, y0 + 112, b, 'lbl-mono silver', { 'font-size': 15 });
    text(x0 + 100, y0 + 112, 'MARCH 21 TT', 'lbl-mono silver-dim', { 'font-size': 9.5 }); });
  const [nx, ny] = L.notes;
  text(nx, ny, `${S.n.toLocaleString('en-US')} ANNUAL STARTS · ${S.first_year} … +${S.last_year}`, 'lbl-mono ivory2', { 'font-size': 10 });
  (L.compact ? ['ARITHMETIC RULE HELD FIXED', 'NOT FITTED TO THESE PERCENTAGES'] : ['ARITHMETIC RULE HELD FIXED · NOT FITTED TO THESE PERCENTAGES'])
    .forEach((t, k) => text(nx, ny + 18 + k * 16, t, 'lbl-mono dim', { 'font-size': 10 }));

  // ---- the visible range and the day scale
  function setRange(a: number, b: number) { [va, vb] = clampRange(a, b); atHome = false; drawPlot(); hideHover(); }
  function setDays(a: number, b: number) { [da, db] = clampDays(a, b); drawPlot(); hideHover(); }
  const zoomAbout = (k: number, at: number) => { [va, vb] = zoomRange(va, vb, k, Math.max(va, Math.min(vb, at))); atHome = false; drawPlot(); };
  const zoomDaysAbout = (k: number, at: number) => { [da, db] = zoomDays(da, db, k, Math.max(da, Math.min(db, at))); drawPlot(); };
  const homeDays = () => setDays(DAYS.A, DAYS.B);
  const home = () => { [va, vb] = homeRange(year); atHome = true; [da, db] = [DAYS.A, DAYS.B]; drawPlot(); hideHover(); };

  // ---- interaction.
  // The plot. Mouse: a hover reads the years under the pointer, a click opens one; the wheel zooms the time axis about the
  // pointer (shift-wheel: the day scale), a drag pans, a double-click goes home. Touch: a tap opens the year (the whole
  // app moves to it), a sideways drag pans with momentum while an upright swipe scrolls the page, a pinch zooms the
  // years, a double-tap goes home. Once the day scale is zoomed, a drag pans it too.
  // The cycle row (whole axis): a drag moves the years in view along it; a tap centres them there.
  // The day labels: wheel, pinch or drag zoom and slide the days; a double-click or double-tap puts −6 … +9 days back.
  const hit = svgEl('rect', { x: DL.PX0, y: cy - 16, width: DL.PX1 - DL.PX0, height: bot - cy + 16, fill: 'transparent', class: 'pick', 'data-k': 'deep-plot', style: 'touch-action: pan-y' }, overlay);
  const dayW = Math.min(72, DL.PX0);
  const dayHit = svgEl('rect', { x: DL.PX0 - dayW, y: top - 2, width: dayW, height: bot - top + 4, fill: 'transparent', class: 'pick-days', 'data-k': 'deep-days', style: 'touch-action: none' }, overlay);
  overlay.insertBefore(dayHit, overlay.firstChild); overlay.insertBefore(hit, overlay.firstChild);
  const design = (ev: { clientX: number; clientY: number }) => st.fromScreen(ev.clientX, ev.clientY);
  const hideHover = () => hover.setAttribute('visibility', 'hidden');
  const yearOnStrip = (x: number) => DL.YA + ((x - DL.PX0) / (DL.PX1 - DL.PX0)) * (DL.YB - DL.YA);
  /** The readout for year `yr` (its bin when zoomed out): a mouse's hover. */
  function showYear(yr: number) {
    const b = bins.find((q) => yr >= q.year && yr < q.year + width); if (!b || yr < S.first_year || yr > S.last_year) { hideHover(); return; }
    const x = px(yr); hLine.setAttribute('x1', String(x)); hLine.setAttribute('x2', String(x));
    const bx = Math.max(DL.PX0, x + boxW + 12 > DL.PX1 ? x - boxW - 12 : x + 12); hBox.setAttribute('transform', `translate(${bx} ${cy + 18})`);
    const d = (v: number, n: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(n)}`;
    if (width === 1) {
      hT[0].textContent = `${yearText(b.year, false)} · ONE ANNUAL START`;
      hT[1].textContent = `ENOCH  ${d(b.enoch[1], 3)} d`;
      hT[2].textContent = `MAR 21 ${d(b.greg[1], 3)} d`;
    } else {
      const a = Math.max(b.year, S.first_year);
      hT[0].textContent = `${a} … ${a + b.n - 1} · ${b.n} STARTS`;
      hT[1].textContent = `ENOCH ${b.enoch[0].toFixed(2)} … ${b.enoch[2].toFixed(2)} d`;
      hT[2].textContent = `MAR 21 ${b.greg[0].toFixed(2)} … ${b.greg[2].toFixed(2)} d`;
    }
    hT[3].textContent = yr < YEAR_MIN || yr > YEAR_MAX ? 'BEYOND THE EPHEMERIS FILES' : `CLICK · OPEN ${yr <= 0 ? `${yr} (${1 - yr} BCE)` : yr}`;
    hover.setAttribute('visibility', 'visible'); st.render();
  }
  const hoverAt = (ev: MouseEvent) => { const p = design(ev); if (p) showYear(Math.round(yearAtPx(p.x))); };

  /** Years and days per client pixel across the plot. */
  const perPixel = () => { const a = st.toScreen(DL.PX0, top), b = st.toScreen(DL.PX1, bot); return a && b ? { years: (vb - va) / (b.x - a.x), days: (db - da) / (b.y - a.y) } : { years: 0, days: 0 }; };
  /** A pan's glide after a flick (touch): years a millisecond, slowing. */
  let glide = 0;
  function flick(v: number) {
    cancelAnimationFrame(glide); let t0 = performance.now();
    const step = (t: number) => {
      const dt = Math.min(48, t - t0); t0 = t; v *= Math.exp(-dt / 325);                    // about a third of a second to come to rest
      if (Math.abs(v) < 0.01 * perPixel().years) return;                                    // under a hundredth of a pixel a millisecond: at rest
      const was = va; [va, vb] = clampRange(va + v * dt, vb + v * dt); drawPlot();
      if (va !== was) glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  }
  function gestures(el: SVGElement, onDays: boolean) {
    const pts = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; t: number; moved: boolean; strip: boolean; touch: boolean } | null = null, pinch: { axis: 'x' | 'y'; d: number } | null = null, swallow = false, lastTap = -Infinity;
    let lock: 'pan' | 'scroll' | null = null, trail: { t: number; x: number }[] = [];
    const on = <K extends keyof SVGElementEventMap>(t: K, f: (e: SVGElementEventMap[K]) => void, opt?: AddEventListenerOptions) => el.addEventListener(t, f as EventListener, opt);
    // iOS scrolls the page on any drag inside a scroller unless the touch's first move is refused: decide then whether
    // this touch pans (sideways, two fingers, the day labels) or scrolls (upright, on the plot)
    let t0: { x: number; y: number } | null = null;
    on('touchstart', (e) => { lock = e.touches.length > 1 ? 'pan' : null; t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
    on('touchmove', (e) => {
      if (e.touches.length > 1 || onDays) lock = 'pan';
      else if (!lock && t0) { const dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y; lock = Math.abs(dx) >= Math.abs(dy) * 0.8 ? 'pan' : 'scroll'; }
      if (lock === 'pan' && e.cancelable) e.preventDefault();
    }, { passive: false });
    on('wheel', (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.clientHeight : 1, dx = e.deltaX * unit, dy = e.deltaY * unit, p = design(e); if (!p) return;
      const rate = e.ctrlKey ? 0.01 : 0.0015;                                                     // ctrl: a trackpad pinch
      if (onDays || e.shiftKey) { zoomDaysAbout(Math.exp(-(Math.abs(dy) >= Math.abs(dx) ? dy : dx) * rate), dayAtPy(p.y)); return; }   // (macOS turns shift-scroll sideways)
      if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) { const k = dx * perPixel().years; setRange(va + k, vb + k); return; }        // a sideways swipe pans
      zoomAbout(Math.exp(-dy * rate), yearAtPx(p.x)); hoverAt(e);
    }, { passive: false });
    on('pointerdown', (e) => {
      cancelAnimationFrame(glide);
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = design(e), strip = !onDays && !!p && p.y < cy + 12;
      if (pts.size === 1) { down = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false, strip, touch: e.pointerType !== 'mouse' }; swallow = false; trail = []; }
      if (pts.size === 2) {                                                                       // on the plot a pinch, held any way, zooms the years
        lock = 'pan';
        const [a, b] = [...pts.values()], axis = onDays ? 'y' : 'x';
        pinch = { axis, d: axis === 'x' ? Math.hypot(a.x - b.x, a.y - b.y) : Math.abs(a.y - b.y) }; if (down) { down.moved = true; down.strip = false; }
      }
    });
    on('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) { if (!onDays && e.pointerType === 'mouse') hoverAt(e); return; }
      const x0 = p.x, y0 = p.y; p.x = e.clientX; p.y = e.clientY;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
      if (down?.touch && !lock && pts.size === 1 && !onDays) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (dx || dy) lock = Math.abs(dx) >= Math.abs(dy) * 0.8 ? 'pan' : 'scroll'; }   // whichever of pointer and touch moves first decides
      if (lock === 'scroll') return;                                                              // the page is scrolling
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()], m = design({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        const d = Math.max(24, pinch.axis === 'x' ? Math.hypot(a.x - b.x, a.y - b.y) : Math.abs(a.y - b.y));
        if (m) { if (pinch.axis === 'x') zoomAbout(d / pinch.d, yearAtPx(m.x)); else zoomDaysAbout(d / pinch.d, dayAtPy(m.y)); }
        pinch.d = d;
      } else if (pts.size === 1 && down?.moved && down.strip) {                                  // along the cycle row: the box follows the finger
        const q = design(e); if (q) { const s = vb - va, at = yearOnStrip(q.x); [va, vb] = clampRange(at - s / 2, at + s / 2); atHome = false; drawPlot(); hideHover(); }
      } else if (pts.size === 1 && down?.moved) {
        const k = perPixel();
        if (!onDays) { const dy = k.years * (e.clientX - x0); [va, vb] = clampRange(va - dy, vb - dy); atHome = false; trail.push({ t: e.timeStamp, x: e.clientX }); }
        if (onDays || !daysHome()) { const dd = k.days * (e.clientY - y0); [da, db] = clampDays(da + dd, db + dd); }
        drawPlot(); hideHover(); view.classList.add('panning');
      }
    });
    const end = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && down) {
        swallow = down.moved; view.classList.remove('panning');
        if (e.type === 'pointerup' && down.moved && down.touch && !down.strip && !onDays && lock !== 'scroll') {   // a flick glides on
          const r = trail.filter((q) => e.timeStamp - q.t < 90);
          if (r.length > 1) { const v = -((r[r.length - 1].x - r[0].x) / Math.max(1, r[r.length - 1].t - r[0].t)) * perPixel().years; if (Math.abs(v) > 0) flick(v); }
        }
        if (!down.moved && down.touch && e.timeStamp - down.t < 700) {
          if (e.timeStamp - lastTap < 320) { if (onDays) homeDays(); else home(); lastTap = -Infinity; swallow = true; } else lastTap = e.timeStamp;
        }
        down = null; lock = null;
      }
    };
    on('pointerup', end); on('pointercancel', end);
    on('dblclick', (e) => { e.preventDefault(); if (onDays) homeDays(); else home(); });
    if (onDays) return;
    on('mouseleave', hideHover);
    on('click', (e) => {
      if (swallow) { swallow = false; return; }
      const p = design(e); if (!p) return;
      if (p.y < cy + 12) { const s = vb - va, at = yearOnStrip(p.x); setRange(at - s / 2, at + s / 2); return; }   // the cycle row: centre the view there
      o.onPick(Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round(yearAtPx(p.x)))));
    });
  }
  gestures(hit, false); gestures(dayHit, true);

  let anchors = { year: c.year, x: 0, y: 0, insetX: 0, insetY: 0, offset: 0 };
  function setYear(y: number, w?: DeepDoc['window']) {
    if (w) { win = w; drawInset(); }
    year = y;
    if (atHome) [va, vb] = homeRange(year);                                                            // home follows the year
    else if (year < va || year > vb) { const s = vb - va; [va, vb] = clampRange(year - s / 2, year + s / 2); }   // keep the year in view
    const r = win.rows.find((q) => q.year === year) ?? null, off = r?.enoch ?? 0;
    insetSel.visible = !!r; if (r) insetSel.position.set(ix(year), iy(Math.max(-2.4, Math.min(2.4, off))), 2);
    anchors = { year, x: px(year), y: py(off), insetX: r ? ix(year) : NaN, insetY: r ? iy(off) : NaN, offset: off };
    drawPlot();
  }
  drawInset(); setYear(c.year);
  return {
    /** The state a rebuild carries over. */
    carry: (): Carry => ({ va, vb, da, db, atHome, year, cycle, win }),
    setYear, setCycle, render: st.render, anchors: () => anchors, envelopeNote,
    /** The years in view, [from, to]. */
    range: () => [va, vb] as [number, number],
    /** The day scale in view, [bottom, top]. */
    days: () => [da, db] as [number, number],
    setRange, setDays,
    /** Keys and the shell: + − zoom about the selected year (the middle when it is not in view), 0 goes home. */
    stage: {
      resize: st.resize,
      zoomStep(f: number) { zoomAbout(f, year >= va && year <= vb ? year : (va + vb) / 2); },
      /** The day scale by f about the selected year's value (the middle when it is not in view). */
      zoomDaysStep(f: number) { const r = anchors.offset; zoomDaysAbout(f, year >= va && year <= vb && r >= da && r <= db ? r : (da + db) / 2); },
      setZoom(z: null) { if (z === null) home(); },
      fromScreen: st.fromScreen, toScreen: st.toScreen,
    },
    dispose() { cancelAnimationFrame(glide); st.dispose(); },
  };
}
type Built = ReturnType<typeof build>;

/** Deep Time in `view`: the design, or the compact layout where the design would be too small to read; rebuilt (keeping
 *  the range, day scale and year) when the space changes enough to change the layout. */
export function createDeep(view: HTMLElement, deep: DeepDoc, series: DeepSeries, selectedYear: number, o: DeepOptions) {
  const body = document.createElement('div'); body.className = 'deep-body'; view.append(body);
  let cur: Built | null = null, key = '';
  let carry: Carry = { va: NaN, vb: NaN, da: DAYS.A, db: DAYS.B, atHome: true, year: selectedYear, cycle: null, win: deep.window! };
  /** Lay out for the view's present size; rebuild only when the layout differs. */
  function fit() {
    const full = view.parentElement?.clientHeight || view.clientHeight, w = view.clientWidth; if (!w || !full) return;
    const compact = layoutFor(w, full, full).compact;
    view.parentElement?.classList.toggle('deep-compact-on', compact);  // shows Deep Time's options row under the title
    const t = headClearance(), L = compact ? compactLayout(w, full - t) : DESIGN, k = L.compact ? `c${w}x${full - t}` : 'design';
    if (k === key && cur) return;
    if (cur) { carry = cur.carry(); cur.dispose(); }
    key = k;
    view.classList.toggle('deep-compact', L.compact);
    view.style.top = L.compact ? `${t}px` : '';                       // compact: the page scrolls below the title
    body.style.height = L.compact ? `${L.height}px` : '';
    cur = build(body, L, deep, series, carry, o, view);
  }
  fit();
  const ro = new ResizeObserver(fit); ro.observe(view.parentElement ?? view);
  // iOS: the page's own pinch would fight the chart's
  for (const t of ['gesturestart', 'gesturechange']) view.addEventListener(t, (e) => e.preventDefault());
  const c = () => cur!;
  return {
    setYear: (y: number, w?: DeepDoc['window']) => c().setYear(y, w),
    setCycle: (x: Carry['cycle']) => c().setCycle(x),
    render: () => c().render(),
    anchors: () => c().anchors(),
    envelopeNote: () => c().envelopeNote(),
    range: () => c().range(),
    days: () => c().days(),
    setRange: (a: number, b: number) => c().setRange(a, b),
    setDays: (a: number, b: number) => c().setDays(a, b),
    /** The layout in use. */
    compact: () => view.classList.contains('deep-compact'),
    /** The options row's zoom: in, out (×2, about the selected year) on the years or the day scale; home. */
    zoomButton(kind: 'in' | 'out' | 'home', axis: 'years' | 'days') {
      if (kind === 'home') c().stage.setZoom(null);
      else if (axis === 'days') c().stage.zoomDaysStep(kind === 'in' ? 2 : 0.5);
      else c().stage.zoomStep(kind === 'in' ? 2 : 0.5);
    },
    stage: {
      resize: () => { fit(); c().stage.resize(); },
      zoomStep: (f: number) => c().stage.zoomStep(f),
      setZoom: (z: null) => c().stage.setZoom(z),
      fromScreen: (x: number, y: number) => c().stage.fromScreen(x, y),
      toScreen: (x: number, y: number) => c().stage.toScreen(x, y),
    },
    dispose() { ro.disconnect(); cur?.dispose(); body.remove(); },
  };
}
export type Deep = ReturnType<typeof createDeep>;
