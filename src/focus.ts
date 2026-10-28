// Focus: the top bar (mark, site, tabs) folds away so the drawing has the screen; the button (or F)
// brings it back. A web page cannot go full screen on an iPhone, so the app's own chrome folds
// instead. The choice is remembered on the device, shared by the views that offer it (Sky, the Dial, The Day).
const KEY = 'enoch.focus.v1';
const ICON = {
  open: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',     // corners outward: give the drawing the screen
  close: '<path d="M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4"/>',     // corners inward: bring the bar back
};

export interface Focus { toggle(): void; setAvailable(on: boolean): void }

/** `root` takes the class `focus` while focus is on and offered here; `button` toggles it. */
export function createFocus(root: HTMLElement, button: HTMLButtonElement): Focus {
  let want = localStorage.getItem(KEY) === '1', available = true;
  function apply() {
    const on = want && available;
    root.classList.toggle('focus', on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Show the top bar' : 'Hide the top bar');
    button.title = on ? 'Show the top bar (F)' : 'Hide the top bar: the drawing fills the screen (F)';
    button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${on ? ICON.close : ICON.open}</svg>`;
  }
  button.addEventListener('click', () => focus.toggle());
  const focus: Focus = {
    toggle() { if (!available) return; want = !(want && available); localStorage.setItem(KEY, want ? '1' : '0'); apply(); },
    setAvailable(on) { available = on; button.hidden = !on; apply(); },
  };
  apply();
  return focus;
}
