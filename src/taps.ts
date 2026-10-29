// A tap on a control must always be a click. iOS Safari reads a page that changes right after a touch as a hover and sends no
// click; a view that animates (every frame rewrites the clock, the readings and the picture) does exactly that, so while one
// plays the ⋯ menu, its options and its ✕ did nothing until the animation was paused. When a tap on a control lifts in place
// and no click follows, make it here. A click that does arrive (everywhere else, and on every other browser) marks the tap as
// answered and nothing is made twice.
const CONTROL = 'button, a[href], select, summary, [role="button"], input[type="checkbox"], input[type="radio"], label';
const SLOP = 10, WAIT = 80;                                       // px a finger may drift and still be a tap; ms to wait for the browser's own click

export function guaranteeTaps(doc: Document = document) {
  let down: { id: number; x: number; y: number; el: Element } | null = null, answered = true;
  doc.addEventListener('click', () => { answered = true; }, true);
  doc.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) { down = null; return; }
    const el = (e.target as Element).closest?.(CONTROL);
    down = el && !(el as HTMLButtonElement).disabled ? { id: e.pointerId, x: e.clientX, y: e.clientY, el } : null;
  }, true);
  doc.addEventListener('pointercancel', () => { down = null; }, true);   // a scroll or a pinch took the touch
  doc.addEventListener('pointerup', (e) => {
    const d = down; down = null;
    if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > SLOP) return;
    if (!(e.target as Element).closest?.(CONTROL) || (e.target as Element).closest(CONTROL) !== d.el) return;
    answered = false;
    setTimeout(() => { if (!answered && d.el.isConnected && !(d.el as HTMLButtonElement).disabled) (d.el as HTMLElement).click(); }, WAIT);
  }, true);
}
