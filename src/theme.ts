// The colour theme: Dark (the engraved instrument on black, the default), Light (the same instrument printed on vellum, for
// daylight), or Auto (the device's light or dark appearance). A setting (Details → Settings), kept on the device.
// public/theme-boot.js applies the saved choice before the page draws (no flash of the other theme; the CSP allows no inline
// script), using the same key and rule as here. The colours are src/theme.css's; Sky, The Day and the Atlas globe stay a night
// window in every theme.
import { C, paletteChanged } from './palette';

const KEY = 'enoch.theme.v1';
export type ThemeChoice = 'dark' | 'light' | 'auto';
export type Theme = 'dark' | 'light';
export const THEME_CHOICES: ThemeChoice[] = ['dark', 'light', 'auto'];

const lightQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
let choice: ThemeChoice = (() => { try { const s = localStorage.getItem(KEY); return s === 'light' || s === 'auto' ? s : 'dark'; } catch { return 'dark'; } })();

export const themeChoice = (): ThemeChoice => choice;
/** The theme in force: the choice, with Auto settled by the device's appearance. */
export const theme = (): Theme => (choice === 'light' || (choice === 'auto' && lightQuery?.matches) ? 'light' : 'dark');

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
  lightQuery?.addEventListener('change', () => { if (choice === 'auto') apply(); });
}
