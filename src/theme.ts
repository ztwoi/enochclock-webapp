// The colour theme (Details → Settings, kept on the device): Dark (the engraved instrument on black, the default); Light (a
// vellum page, for daylight) and Sepia (the same on toned paper, darker), in both of which the instruments themselves stay
// night, set into the page (they are drawn in light, which paper cannot do); Contrast (Dark with every tier lifted, for glare
// and low vision); Red (night vision: the whole page in red light, so the eyes stay dark-adapted); or Auto (Light when the
// device's appearance is light, Contrast when it asks for more contrast, else Dark). public/theme-boot.js applies the saved
// choice before the page draws (no flash of another theme; the CSP allows no inline script) by the same key and rule as here.
// The colours are src/theme.css's.
import { C, paletteChanged } from './palette';

const KEY = 'enoch.theme.v1';
export type Theme = 'dark' | 'light' | 'sepia' | 'contrast' | 'red';
export type ThemeChoice = Theme | 'auto';
export const THEME_CHOICES: ThemeChoice[] = ['dark', 'light', 'sepia', 'contrast', 'red', 'auto'];

const query = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);
const lightQuery = query('(prefers-color-scheme: light)'), moreQuery = query('(prefers-contrast: more)');
let choice: ThemeChoice = (() => { try { const s = localStorage.getItem(KEY) as ThemeChoice; return THEME_CHOICES.includes(s) ? s : 'dark'; } catch { return 'dark'; } })();

export const themeChoice = (): ThemeChoice => choice;
/** The theme in force: the choice, with Auto settled by the device's appearance. */
export const theme = (): Theme => (choice !== 'auto' ? choice : lightQuery?.matches ? 'light' : moreQuery?.matches ? 'contrast' : 'dark');

const listeners = new Set<(t: Theme) => void>();
/** Told when the theme in force changes (a choice, or the device's appearance under Auto). */
export const onThemeChange = (f: (t: Theme) => void) => { listeners.add(f); };

function apply() {
  const t = theme(), root = document.documentElement;
  if (root.dataset.theme === t) return;
  root.dataset.theme = t;
  paletteChanged();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', C.bg);   // the browser's bar around the page
  for (const f of listeners) f(t);
}

export function setThemeChoice(c: ThemeChoice) {
  if (c === choice) return;
  choice = c;
  try { localStorage.setItem(KEY, c); } catch { /* private mode: not remembered */ }
  apply();
}

/** Start: the boot script has set the theme already; this settles the browser's bar and follows the device under Auto. */
export function initTheme() {
  const root = document.documentElement;
  if (!root.dataset.theme) root.dataset.theme = theme();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', C.bg);
  for (const q of [lightQuery, moreQuery]) q?.addEventListener('change', () => { if (choice === 'auto') apply(); });
}
