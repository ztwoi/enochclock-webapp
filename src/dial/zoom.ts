// Zoom and pan of the dial by its viewBox (so every ring stays exactly concentric): pinch and
// drag on touch, wheel and drag with a mouse, double-tap or double-click to reset. A short
// stationary tap reports the viewBox point under it. The SVG fills its whole stage and the
// viewBox takes the stage's shape: at rest the face (1000 units) fits the shorter side, centred or
// (`top()`) at the top of a tall stage; zoomed in, it spreads over the whole stage. A pan goes as
// far, at every zoom, as bringing the face's edge to the middle of the stage, never stuck.
// The SVG may be larger than the room the face rests in (`rest`, an element: the Dial's SVG fills its
// whole view, the face rests in the cell the header and the counts leave), so a zoom spreads under them.
const FULL = 1000, MIN = 1, MAX = 6;

export function attachZoom(svg: SVGSVGElement, onTap: (x: number, y: number) => void, onChange?: (z: number) => void, top: () => boolean = () => false, rest?: Element | null) {
  /** z: the magnification; (cx, cy): the view's centre in viewBox units, as an offset from the centre at rest. */
  let z = 1, cx = 0, cy = 0;
  const pts = new Map<number, { x: number; y: number }>();
  let gesture: { d: number; z: number; mx: number; my: number; cx: number; cy: number } | null = null, down: { x: number; y: number; t: number; moved: boolean } | null = null, lastTap = -Infinity;

  /** The viewBox at rest: the face's 1000 units across the shorter side of its room (the SVG itself, or `rest`); (ox, oy) is that
   *  viewBox's centre as an offset from the face's centre (0 = the face centred, or the face at the top of its room). */
  const home = () => {
    const r = svg.getBoundingClientRect(), q = rest?.getBoundingClientRect(), b = q && q.width > 0 && q.height > 0 ? q : r;
    const s = Math.min(b.width, b.height) / FULL || 1, w = r.width > 0 && r.height > 0 ? r.width / s : FULL, h = r.width > 0 && r.height > 0 ? r.height / s : FULL;
    const fx = b.left + b.width / 2 - r.left, fy = (top() ? b.top + (s * FULL) / 2 : b.top + b.height / 2) - r.top;   // the face's centre, in px of the SVG
    return { w, h, ox: w / 2 - fx / s, oy: h / 2 - fy / s };
  };
  const apply = () => {
    const H = home(), w = H.w / z, h = H.h / z;
    if (z <= MIN + 1e-3) { cx = 0; cy = 0; }                       // at rest: home
    const lim = (c: number, slack: number, o: number) => Math.max(Math.min(-slack, -FULL / 2 - o), Math.min(Math.max(slack, FULL / 2 - o), c));
    cx = lim(cx, (H.w - w) / 2, H.ox); cy = lim(cy, (H.h - h) / 2, H.oy);
    svg.setAttribute('viewBox', `${(H.ox + cx - w / 2).toFixed(3)} ${(H.oy + cy - h / 2).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}`);
    svg.classList.toggle('zoomed', z > 1.001); onChange?.(z);
  };
  const ro = new ResizeObserver(() => apply()); ro.observe(svg); if (rest) ro.observe(rest);   // the stage's shape changes with the window and the side panel
  /** Client pixel → viewBox units. */
  const toBox = (x: number, y: number) => {
    const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(x, y).matrixTransform(m.inverse()); return { x: p.x, y: p.y };
  };
  /** Zoom to z2 keeping viewBox point (bx, by) under the same client pixel. */
  const zoomAt = (z2: number, bx: number, by: number) => {
    z2 = Math.max(MIN, Math.min(MAX, z2)); const k = z / z2, H = home();
    cx = bx - H.ox - (bx - H.ox - cx) * k; cy = by - H.oy - (by - H.oy - cy) * k; z = z2; apply();
  };
  const reset = () => { z = 1; cx = 0; cy = 0; apply(); };

  svg.addEventListener('wheel', (e) => { e.preventDefault(); const b = toBox(e.clientX, e.clientY); zoomAt(z * Math.exp(-e.deltaY * 0.0015), b.x, b.y); }, { passive: false });
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) down = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };   // event time: immune to a busy main thread
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], m = toBox((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture = { d: Math.hypot(a.x - b.x, a.y - b.y), z, mx: m.x, my: m.y, cx, cy }; if (down) down.moved = true;
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const prev = { ...p }; p.x = e.clientX; p.y = e.clientY;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
    if (pts.size === 2 && gesture) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      cx = gesture.cx; cy = gesture.cy; z = gesture.z; zoomAt(gesture.z * (d / gesture.d), gesture.mx, gesture.my);
    } else if (pts.size === 1 && z > 1 && down?.moved) {
      const s = home().w / z / svg.getBoundingClientRect().width; cx -= (p.x - prev.x) * s; cy -= (p.y - prev.y) * s; apply();
    }
  });
  const end = (e: PointerEvent) => {
    pts.delete(e.pointerId); if (pts.size < 2) gesture = null;
    if (pts.size === 0 && down) {
      if (!down.moved && e.timeStamp - down.t < 700) {
        const now = e.timeStamp;
        if (now - lastTap < 320) { reset(); lastTap = -Infinity; } else { lastTap = now; const b = toBox(e.clientX, e.clientY); onTap(b.x, b.y); }
      }
      down = null;
    }
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); gesture = null; down = null; });
  // iOS Safari's own page pinch would fight the dial's
  for (const t of ['gesturestart', 'gesturechange']) svg.addEventListener(t, (e) => e.preventDefault());
  apply();
  return { reset, zoomAt, get zoom() { return z; } };
}
