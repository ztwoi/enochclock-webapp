// The details sheet on tablets and phones: it rises above the transport (which stays visible and
// usable), and closes with its ✕, the Details button, a swipe down on its handle, or Escape. On wide
// screens the same panel is the side column and the secondary controls sit in the footer instead.
import './sheet.css';
export interface SheetOpts {
  sheet: HTMLElement; footer: HTMLElement; toggle: HTMLButtonElement; close: HTMLElement; handle: HTMLElement;
  /** Move the secondary controls: into the sheet when narrow, back into the footer when wide. */
  place(narrow: boolean): void;
  onToggle?(open: boolean): void;
}
const NARROW = '(max-width: 1100px), (max-aspect-ratio: 1/1)';

export function createSheet(o: SheetOpts) {
  const mq = matchMedia(NARROW), body = document.body;
  const set = (open: boolean) => {
    if (body.classList.contains('side-open') === open) return;
    body.classList.toggle('side-open', open);
    o.toggle.setAttribute('aria-expanded', String(open)); o.toggle.classList.toggle('on', open);
    o.onToggle?.(open);
  };
  o.toggle.addEventListener('click', () => set(!body.classList.contains('side-open')));
  o.close.addEventListener('click', () => set(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && body.classList.contains('side-open')) set(false); });
  // swipe down on the handle bar closes
  let y0 = -1;
  o.handle.addEventListener('pointerdown', (e) => { y0 = e.clientY; o.handle.setPointerCapture(e.pointerId); });
  o.handle.addEventListener('pointerup', (e) => { if (y0 >= 0 && e.clientY - y0 > 40) set(false); y0 = -1; });
  // the sheet sits on top of the footer, whatever its height
  new ResizeObserver(() => document.documentElement.style.setProperty('--foot-h', `${o.footer.getBoundingClientRect().height}px`)).observe(o.footer);
  const apply = () => { o.place(mq.matches); if (!mq.matches) set(false); };
  mq.addEventListener('change', apply); apply();
  return { open: () => set(true), close: () => set(false), get narrow() { return mq.matches; } };
}
