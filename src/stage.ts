// Shared drawing stage for every view. WebGL draws geometry in design units
// (W × H, y down); an SVG overlay with the same viewBox carries upright text, so
// labels and geometry share one mapping at every window size. Glow is additive
// presentation and never moves a coordinate anchor.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { H, W } from './model';

export const C = {
  ivory: '#ece3cf', ivory2: '#a39a86', ivory3: '#635d51', gold: '#d6b26a', goldHi: '#f4dc9f', goldDim: '#7d6a43',
  bronze: '#a8875a', bronzeDim: '#5e4c33', silver: '#8fb3bd', silverDim: '#4b6268',
};
const SVG = 'http://www.w3.org/2000/svg';
export type Pt = [number, number];

export function svgEl(tag: string, attrs: Record<string, string | number | undefined>, parent?: Element, text?: string) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  parent?.appendChild(n);
  return n;
}

let glow: THREE.CanvasTexture | null = null;
function glowTexture() {
  if (glow) return glow;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!, r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,246,220,1)'); r.addColorStop(0.18, 'rgba(244,220,159,.75)');
  r.addColorStop(0.5, 'rgba(214,178,106,.18)'); r.addColorStop(1, 'rgba(214,178,106,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  glow = new THREE.CanvasTexture(c); glow.colorSpace = THREE.SRGBColorSpace; return glow;
}

export const hatchMaterial = (opacity: number) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { color: { value: new THREE.Color(C.silver) }, opacity: { value: opacity } },
  vertexShader: 'varying vec2 p; void main(){ p = (modelMatrix * vec4(position,1.)).xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec2 p; void main(){ float s = fract((p.x + p.y) / 5.0); float a = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.16, 0.24, s)); gl_FragColor = vec4(color, a * opacity); }',
});

export const sprite = (scale: number, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, side: THREE.DoubleSide }));
  s.scale.set(scale, scale, 1); return s;
};

/** A view's zoom (design-space centre, magnification over the whole-design fit), kept per host across rebuilds (a new year). */
interface Zoom { cx: number; cy: number; k: number }
const remembered = new WeakMap<HTMLElement, Zoom>();
const turned = new WeakMap<HTMLElement, number>();
const MAX_ZOOM = 8;
/**
 * `frame`: the design rectangle a portrait screen opens on (e.g. a wheel's circle, whose legend
 * then lies off to the side); landscape screens open on the whole design.
 */
export interface StageOptions {
  frame?: [number, number, number, number];
  /** false: the view handles its own gestures (Deep Time zooms its plot, not the picture); the stage keeps the whole design. */
  gestures?: boolean;
  /** The design is the host's own CSS pixels (a layout drawn for this screen) instead of the shared W × H. */
  pixels?: boolean;
  /** The overlay's drawing goes into `layer`, a group the stage can repeat sideways (setWrap). */
  layered?: boolean;
  /** A gaze over a scene (the Sky): the view always covers the screen with the scene `bounds` [x0, y0, x1, y1] (never
   *  zoomed out past it, never panned off it; sideways without end when wrapped); at rest its bottom edge is design y
   *  `rest` (or `inset()` pixels above it, clear of a note along the bottom), and a zoom while it is there keeps it there
   *  (a level gaze stays level). At rest the design span `focus()` [x0, x1] is centred and, where the scene's height
   *  allows, wholly in view (a tall screen keeps it whole by showing more of the scene under `rest`). Replaces `frame`. */
  gaze?: { bounds: [number, number, number, number]; rest: number; inset?: () => number; focus?: () => [number, number] };
}
/** A view's own handling of zooms (src/day/follow.ts): see createStage's zoomHook. */
export interface ZoomHook { active(): boolean; zoom(factor: number | null): boolean }
/** A design that repeats sideways every `period` units from `x0` (a panorama all around): the view turns without end. */
export interface Wrap { x0: number; period: number }
/** THREE layer of objects drawn once, not once per turn (spans of several turns: no seam where copies would meet). */
export const UNTILED = 1;
/** Layout reads that every redraw would otherwise repeat (the title block's height, the note along the bottom): a read after the page changed
 *  makes the browser lay it out on the spot, several times a frame while a view plays or follows. Read once, and again only after the layout
 *  may have moved: the window or a watched element resized, or `layoutChanged()` (a title's text, a change of view). */
let layoutStamp = 0;
export const layoutChanged = () => { layoutStamp++; };
/** Stages draw what they measured (the labels held clear of the title block): when the window or a watched element resizes, after the page is laid
 *  out and before it is drawn, they draw again. A change made in the middle of a task is seen by them then, not by reads made before it. */
const layoutSubs = new Set<() => void>();
const layoutMoved = () => { layoutStamp++; for (const f of layoutSubs) f(); };
const layoutWatch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layoutMoved);
if (typeof addEventListener === 'function') addEventListener('resize', layoutMoved);
export function layoutRead<T>(read: () => T, ...watch: string[]) {
  let at = -1, v!: T, pending = watch;
  return () => {
    if (pending.length && typeof document !== 'undefined') pending = pending.filter((q) => { const e = document.querySelector(q); if (e) layoutWatch?.observe(e); return !e; });
    if (at !== layoutStamp) { v = read(); at = layoutStamp; }
    return v;
  };
}
/** Pixels at the top of a portrait stage held by the page (the view's title and options); its frame opens below them. */
let headClear = () => 0;
export function setHeadClearance(f: () => number) { headClear = layoutRead(f, '.view-head'); }
/** Pixels at the top of the stage held by the view's title block. */
export const headClearance = () => headClear();

export function createStage(host: HTMLElement, label: string, opts: StageOptions = {}) {
  const scene = new THREE.Scene();
  /** The design's size: the shared W × H, or the host's own pixels (opts.pixels). */
  let DW = W, DH = H;
  /** The host's exact layout size in CSS pixels: clientWidth/Height round (a rounded size stretches the canvas against the
   *  overlay), and getBoundingClientRect includes transforms (a view's entrance scale). 0 when it has no layout. */
  const sizeNow = () => { const c = getComputedStyle(host), w = parseFloat(c.width), h = parseFloat(c.height); return [w > 0 ? w : 0, h > 0 ? h : 0] as const; };
  /** Both sizes are read once and again after the host resizes (its observer below, or `resize()` from outside), not on every turn and zoom. */
  let sizeCache: readonly [number, number] | null = null, clientCache: readonly [number, number] | null = null;
  const size = () => (sizeCache ??= sizeNow());
  const clientSize = () => (clientCache ??= [host.clientWidth, host.clientHeight] as const);
  const stale = () => { sizeCache = clientCache = null; };
  const measure = () => { const [cw, ch] = clientSize(); if (opts.pixels && cw && ch) { DW = cw; DH = ch; } };
  measure();
  // top = 0, bottom = H gives y down like the overlay; it mirrors triangle winding, so surfaces are double-sided.
  const camera = new THREE.OrthographicCamera(0, DW, 0, DH, -10, 10);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'gl';
  host.append(renderer.domElement);
  const overlay = svgEl('svg', { class: 'overlay', viewBox: `0 0 ${DW} ${DH}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': label }, host) as SVGSVGElement;
  const materials: LineMaterial[] = [];
  let sized = [0, 0];                                            // the drawing buffer's size, in CSS pixels
  const XL = 'http://www.w3.org/1999/xlink', layerId = `layer-${Math.random().toString(36).slice(2)}`;
  const layer = opts.layered ? svgEl('g', { id: layerId }, overlay) : overlay;
  const copies = opts.layered ? [-1, 1].map(() => { const u = svgEl('use', { href: `#${layerId}`, display: 'none' }, overlay); u.setAttributeNS(XL, 'href', `#${layerId}`); return u; }) : [];
  let wrap: Wrap | null = null;

  const line = (pts: Pt[], color: string, width = 1, opacity = 1, dash?: [number, number], z = 0, parent: THREE.Object3D = scene) => {
    const g = new LineGeometry(); g.setPositions(pts.flatMap(([x, y]) => [x, y, z]));
    const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: opacity < 1, opacity, dashed: !!dash, dashSize: dash?.[0] ?? 1, gapSize: dash?.[1] ?? 1, worldUnits: false });
    materials.push(m); if (sized[0]) m.resolution.set(sized[0], sized[1]);
    const l = new Line2(g, m); if (dash) l.computeLineDistances(); parent.add(l); return l;
  };
  const fill = (pts: Pt[], color: string, opacity: number, z = -1, parent: THREE.Object3D = scene) => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    m.position.z = z; parent.add(m); return m;
  };
  const rect = (x: number, y: number, w: number, h: number, mat: THREE.Material, z = -0.5) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x + w / 2, y + h / 2, z); scene.add(m); return m;
  };
  /** Annular sector (angles in radians, screen convention: 0 = +x, clockwise with y down). */
  const sector = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, color: string, opacity: number, z = -1) => {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.02)), pts: Pt[] = [];
    for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]); }
    for (let k = n; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / n; pts.push([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)]); }
    return fill(pts, color, opacity, z);
  };
  const circle = (cx: number, cy: number, r: number, color: string, width = 1, opacity = 1, dash?: [number, number], a0 = 0, a1 = 2 * Math.PI) => {
    const n = Math.max(16, Math.ceil((Math.abs(a1 - a0) * r) / 3)), pts: Pt[] = [];
    for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return line(pts, color, width, opacity, dash);
  };
  const text = (x: number, y: number, s: string, cls: string, attrs: Record<string, string | number> = {}, parent: Element = layer) =>
    svgEl('text', { x, y, class: cls, ...attrs }, parent, s);

  // Zoom keeps the WebGL camera and the SVG overlay on one mapping: both show the same design rectangle.
  // null = the home view (the frame on portrait screens, else the whole design).
  let zoom: Zoom | null = remembered.get(host) ?? null;
  /** Wrapped: the design x at the view's centre when there is no zoom (the way the panorama faces). */
  let turn = turned.get(host) ?? DW / 2;
  const fit = (w: number, h: number) => Math.min(w / DW, h / DH);
  const home0 = (w: number, h: number): Zoom => {
    if (!(opts.frame && h > w)) return { cx: DW / 2, cy: DH / 2, k: Math.min(w / DW, h / DH) / fit(w, h) };
    const [x, y, fw, fh] = opts.frame, t = Math.min(headClear(), h * 0.35), s = Math.min(w / fw, (h - t) / fh);
    return { cx: x + fw / 2, cy: y + fh / 2 - t / 2 / s, k: s / fit(w, h) };   // the frame centred in the room below the title
  };
  /** Gaze: the least and most magnification (cover the screen with the scene; then as far again as the whole design allows). */
  const gazeK = (w: number, h: number) => {
    const [x0, y0, x1, y1] = opts.gaze!.bounds, min = Math.max(w / (wrap ? wrap.period : x1 - x0), h / (y1 - y0)) / fit(w, h);
    return { min, max: Math.max(MAX_ZOOM, min * 6) };
  };
  /** Gaze at rest: level, the scene from `rest` up filling the screen. */
  const gazeInset = (h: number) => Math.min(h / 3, opts.gaze?.inset?.() ?? 0);
  /** Gaze: the view's centre y at magnification k with design y `rest` on the screen row `inset` pixels above the bottom. */
  const level = (w: number, h: number, k: number) => { const s = fit(w, h) * k; return opts.gaze!.rest + gazeInset(h) / s - h / s / 2; };
  const gazeHome = (w: number, h: number): Zoom => {
    const [x0, y0, x1] = opts.gaze!.bounds, [f0, f1] = opts.gaze!.focus?.() ?? [x0, x1];
    const kRest = (h - gazeInset(h)) / (opts.gaze!.rest - y0) / fit(w, h), kFocus = w / ((f1 - f0) * 1.12) / fit(w, h);   // level to the zenith; the focus with a margin
    const k = Math.max(gazeK(w, h).min, Math.min(kRest, kFocus));
    return { cx: (f0 + f1) / 2, cy: level(w, h, k), k };
  };
  const home = (w: number, h: number): Zoom => {
    const z = opts.gaze ? gazeHome(w, h) : home0(w, h);
    return wrap ? { ...z, cx: turn } : z;   // wrapped: home keeps the way it faces
  };
  /** The zoom in force, clamped: never smaller than the whole design. A pan goes as far, at every zoom, as bringing
   *  the design's edge to the middle of the view (or, where the view is more than twice the design, to the view's
   *  edge): never stuck because the view is about the design's size, and nothing kept under a title. */
  const current = (w: number, h: number): Zoom => {
    if (opts.gaze) {                                              // the view inside the scene, covering the screen
      const z = zoom ?? home(w, h), g = gazeK(w, h), k = Math.max(g.min, Math.min(g.max, z.k)), s = fit(w, h) * k, vw = w / s, vh = h / s;
      const [x0, y0, x1, y1] = opts.gaze.bounds, inside = (c: number, v: number, a: number, b: number) => Math.max(a + v / 2, Math.min(b - v / 2, c));
      const cx = wrap ? wrap.x0 + (((z.cx - wrap.x0) % wrap.period) + wrap.period) % wrap.period : inside(z.cx, vw, x0, x1);
      return { cx, cy: inside(z.cy, vh, y0, y1), k };
    }
    const z = zoom ?? home(w, h), k0 = wrap ? Math.max(1, w / (fit(w, h) * wrap.period)) : 1;   // wrapped: never wider than one turn
    const k = Math.max(k0, Math.min(MAX_ZOOM, z.k)), s = fit(w, h) * k, vw = w / s, vh = h / s;
    const clamp = (c: number, v: number, n: number) => Math.max(Math.min(0, n - v / 2), Math.min(Math.max(n, v / 2), c));
    const cx = wrap ? wrap.x0 + (((z.cx - wrap.x0) % wrap.period) + wrap.period) % wrap.period : clamp(z.cx, vw, DW);
    return { cx, cy: clamp(z.cy, vh, DH), k };
  };
  const users: (() => void)[] = [];                               // told when the user (not the app) moves the view
  /** A view that takes zooms for itself while `active` (following the Sun, a zoom is its multiplier, not a hand on the view):
   *  `zoom` is given a pinch's, the wheel's or zoomStep's factor, or null for the home view (a double tap, home()), and says
   *  whether it took it. While active, a finger must also move further before it counts as a hand taking the view. */
  let zoomHook: ZoomHook | null = null;
  const takes = (f: number | null) => !!zoomHook?.active() && zoomHook.zoom(f);
  const byUser = () => { for (const f of users) f(); };
  const viewers: ((v: { x: number; y: number; w: number; h: number }) => void)[] = [];
  function resize() {
    const [w, h] = size();
    if (!w || !h) return;
    measure();
    const z = current(w, h), s = fit(w, h) * z.k, vw = w / s, vh = h / s;
    host.classList.toggle('zoomed', !!zoom && Math.abs(z.k - home(w, h).k) > 1e-3);
    camera.left = z.cx - vw / 2; camera.right = camera.left + vw; camera.top = z.cy - vh / 2; camera.bottom = camera.top + vh;
    camera.updateProjectionMatrix();
    overlay.setAttribute('viewBox', `${camera.left} ${camera.top} ${vw} ${vh}`);
    if (sized[0] !== w || sized[1] !== h) { renderer.setSize(w, h, false); for (const m of materials) m.resolution.set(w, h); sized = [w, h]; }   // a turn or a pan moves the view only
    for (const f of viewers) f({ x: camera.left, y: camera.top, w: vw, h: vh });
  }
  /** Wrapped, the scene is drawn at −1, 0 and +1 turns (the view is never wider than one turn); UNTILED objects once. */
  const render = () => {
    if (!wrap) { renderer.render(scene, camera); return; }
    const L = camera.left, R = camera.right;
    renderer.autoClear = false; renderer.clear();
    for (const n of [0, -1, 1]) {
      camera.left = L + n * wrap.period; camera.right = R + n * wrap.period; camera.updateProjectionMatrix();
      camera.layers.set(0); if (n === 0) camera.layers.enable(UNTILED);
      renderer.render(scene, camera);
    }
    camera.left = L; camera.right = R; camera.updateProjectionMatrix(); camera.layers.set(0); renderer.autoClear = true;
  };
  const redraw = () => { stale(); resize(); render(); };
  const ro = new ResizeObserver(redraw); ro.observe(host); layoutSubs.add(redraw);
  resize();

  const setZoom = (z: Zoom | null) => {
    const [w, h] = size();
    if (!z && wrap && w && h) turn = current(w, h).cx;            // wrapped: home keeps the way it faces
    zoom = z ? { ...z } : null;
    if (zoom && w && h) zoom = current(w, h);                    // stored clamped, so a later drag starts from what is shown
    if (zoom && wrap) turn = zoom.cx;
    turned.set(host, turn);
    if (zoom) remembered.set(host, zoom); else remembered.delete(host);
    resize(); render();
  };
  const fromClient = (x: number, y: number) => { const m = overlay.getScreenCTM(); if (!m) return null; const q = new DOMPoint(x, y).matrixTransform(m.inverse()); return { x: q.x, y: q.y }; };
  /** Magnify by `f` keeping the design point under client pixel (x, y) where it is. */
  const zoomBy = (f: number, x: number, y: number) => {
    const [w, h] = size(), p = fromClient(x, y); if (!w || !h || !p) return;
    const z = current(w, h), g = opts.gaze ? gazeK(w, h) : { min: 1, max: MAX_ZOOM }, k2 = Math.max(g.min, Math.min(g.max, z.k * f)), r = z.k / k2;
    if (opts.gaze) {                                              // a level gaze (the view's bottom at rest) stays level
      if (Math.abs(z.cy - level(w, h, z.k)) < 0.5) { setZoom({ cx: p.x - (p.x - z.cx) * r, cy: level(w, h, k2), k: k2 }); return; }
    }
    setZoom({ cx: p.x - (p.x - z.cx) * r, cy: p.y - (p.y - z.cy) * r, k: k2 });
  };
  const panBy = (dx: number, dy: number) => {
    const [w, h] = size(); if (!w || !h) return;
    const z = current(w, h), s = fit(w, h) * z.k; setZoom({ cx: z.cx - dx / s, cy: z.cy - dy / s, k: z.k });
  };
  // Gestures, as on the Dial: wheel or pinch to zoom, drag to pan, double-tap/double-click for the
  // home view. A tap stays a click (the views' selections); a drag or pinch swallows its click.
  const pts = new Map<number, { x: number; y: number }>();
  // `multi`: the gesture has had two fingers; until every finger is lifted it is a pinch, never a drag (one finger always lifts
  // first, and drifts as it does)
  let pinch: { d: number } | null = null, down: { x: number; y: number; t: number; moved: boolean; multi: boolean } | null = null, swallow = false, lastTap = -Infinity;
  const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => { host.addEventListener(t, f as EventListener, o); offs.push(() => host.removeEventListener(t, f as EventListener, o)); };
  const offs: (() => void)[] = [];
  if (opts.gestures !== false) {
    on('wheel', (e) => {
      e.preventDefault();
      if (opts.gaze && !e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { byUser(); panBy(-e.deltaX, 0); return; }   // a sideways trackpad swipe turns the gaze
      const f = Math.exp(-e.deltaY * 0.0015);
      if (takes(f)) return;
      byUser();
      zoomBy(f, e.clientX, e.clientY);
    }, { passive: false });
    on('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { down = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false, multi: false }; swallow = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; if (down) { down.moved = true; down.multi = true; } }
    });
    on('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY;
      const slop = zoomHook?.active() ? 18 : 6;                     // following, a finger settling before the second lands is not a drag
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > slop) down.moved = true;
      if (pts.size === 2 && pinch && zoomHook?.active()) {          // a pinch the view takes as a zoom of its own: no pan, no hand
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (zoomHook.zoom(d / pinch.d)) { pinch.d = d; return; }
      }
      const drag = pts.size === 1 && !!down?.moved && !down.multi;
      if ((pts.size === 2 && pinch) || drag) byUser();
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomBy(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); panBy((e.clientX - px) / 2, (e.clientY - py) / 2); pinch.d = d;
      } else if (drag) panBy(e.clientX - px, e.clientY - py);
    });
    const end = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && down) {
        swallow = down.moved;
        if (!down.moved && e.timeStamp - down.t < 700 && e.pointerType !== 'mouse') {
          if (e.timeStamp - lastTap < 320) { if (!takes(null)) { byUser(); setZoom(null); } lastTap = -Infinity; } else lastTap = e.timeStamp;
        }
        down = null;
      }
    };
    on('pointerup', end); on('pointercancel', end); on('pointerleave', (e) => { if (e.pointerType === 'mouse') end(e); });
    on('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; } }, { capture: true });
    on('dblclick', (e) => { e.preventDefault(); if (takes(null)) return; byUser(); setZoom(null); });
    for (const t of ['gesturestart', 'gesturechange'] as const) on(t as keyof HTMLElementEventMap, (e) => e.preventDefault());
  }

  return {
    scene, camera, renderer, overlay, layer, line, fill, rect, sector, circle, text, render,
    /** Lay the view out again: the page around it may have changed (a title, the note along the bottom) as well as its own size. */
    resize() { stale(); layoutChanged(); resize(); },
    /** The host's client size, as of its last resize (a read on every frame would make the browser lay the page out each time). */
    clientSize,
    /** Repeat the design sideways (a panorama all around), or stop (null). The overlay's `layer` repeats with it. */
    setWrap(w: Wrap | null) {
      wrap = w; copies.forEach((u, i) => { if (w) { u.setAttribute('transform', `translate(${(i ? 1 : -1) * w.period} 0)`); u.removeAttribute('display'); } else u.setAttribute('display', 'none'); });
      resize(); render();
    },
    /** Wrapped: face design x `cx` (the zoom and height unchanged), moving the view only. */
    turnTo(cx: number) {
      if (!wrap) return;
      turn = cx; turned.set(host, cx); if (zoom) { zoom.cx = cx; remembered.set(host, zoom); }
      resize(); render();
    },
    /** Called with the design rectangle in view whenever it changes (a pan, a zoom, a turn, a resize). */
    onView(f: (v: { x: number; y: number; w: number; h: number }) => void) { viewers.push(f); },
    /** Called when the user moves the view with a gesture (a drag, a swipe, a pinch, the wheel, a double tap): not for the app's own turns. */
    onUser(f: () => void) { users.push(f); },
    /** Centre the view on a design point at a magnification (1 = the whole design); null = the home view. */
    setZoom(z: Zoom | null) { setZoom(z); },
    /** Magnify by f about the middle of the stage (keys, buttons). */
    zoomStep(f: number) { if (takes(f)) return; const r = host.getBoundingClientRect(); zoomBy(f, r.left + r.width / 2, r.top + r.height / 2); },
    /** The home view (the 0 key), unless the hook takes it. */
    home() { if (!takes(null)) setZoom(null); },
    /** Let the view take zooms and the home view for itself while the hook is active (null: no hook). */
    setZoomHook(h: ZoomHook | null) { zoomHook = h; },
    get zoom() { const [w, h] = size(); return w && h ? current(w, h) : null; },
    /** Design-space point → client pixels (via the overlay's CTM, shared with the camera mapping). */
    toScreen(x: number, y: number) { const m = overlay.getScreenCTM(); if (!m) return null; const q = new DOMPoint(x, y).matrixTransform(m); return { x: q.x, y: q.y }; },
    /** Client pixels → design space. */
    fromScreen(x: number, y: number) { const m = overlay.getScreenCTM(); if (!m) return null; const q = new DOMPoint(x, y).matrixTransform(m.inverse()); return { x: q.x, y: q.y }; },
    dispose() { for (const f of offs) f(); ro.disconnect(); layoutSubs.delete(redraw); renderer.dispose(); renderer.domElement.remove(); overlay.remove(); },
  };
}
