// The palette for drawing code: SVG built in TypeScript, WebGL materials, canvas gradients. The
// colours live in src/theme.css (one block per theme); this reads the same custom properties off the
// page, so the drawings and the stylesheets can never disagree. A key is the property's name in
// camelCase: C.goldHi is --gold-hi, C.dlOx2 is --dl-ox2.

/** The dark theme's values: what C gives where there is no page to read (the Node tests), or before
 *  the stylesheet has loaded. tests/palette.test.ts holds them equal to src/theme.css's :root. */
export const DARK = {
  bg: '#090807',
  ivory: '#ece3cf', ivory2: '#a39a86', ivory3: '#635d51', label: '#857c6c',
  gold: '#d6b26a', goldHi: '#f4dc9f', goldDim: '#7d6a43',
  bronze: '#a8875a', bronzeDim: '#5e4c33', silver: '#8fb3bd', silverDim: '#4b6268',
  field: '#0b0a08', ink: '#0c0b09', box: '#0d0c0a',
  warn: '#e3a07a', alarm: '#d46a5a', vermilion: '#d9614f',
  sun: '#f4dc9f', sunCore: '#fff3d0', glowCore: '#fff6dc',
  moon: '#d8d2c4', moonGlow: '#b9c6d8', moonDark: '#1a1814',
  mercury: '#c4a98a', venus: '#f6e6b0', mars: '#c76b4a', jupiter: '#e0b878', saturn: '#d8b45e', uranus: '#9cc7c9', neptune: '#7c95c9',
  skyGround: '#050403', skyDay: '#3a2c17',
  dlOx: '#3b1513', dlOx2: '#4a1a17', dlRed: '#b4291f', dlOxEdge: '#1a0b0a',
  dlSageDim: '#4d6149',
  dlPortal: '#2a2318', dlPortal2: '#1f1a12', dlCell: '#15130f', dlCell2: '#1b1814', dlDay: '#1d1a15', dlSabbath: '#3a2f1c',
};
export type PaletteKey = keyof typeof DARK;

/** The custom property a key reads: goldHi → --gold-hi. */
export const cssVar = (k: PaletteKey) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

let cache: Record<PaletteKey, string> | null = null;
function read(): Record<PaletteKey, string> {
  if (cache) return cache;
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return DARK;
  const s = getComputedStyle(document.documentElement);
  if (!s.getPropertyValue('--bg').trim()) return DARK;          // the stylesheet isn't in yet: don't keep a reading
  const o = {} as Record<PaletteKey, string>;
  for (const k of Object.keys(DARK) as PaletteKey[]) o[k] = s.getPropertyValue(cssVar(k)).trim() || DARK[k];
  return (cache = o);
}

/** The colours of the theme in force, read when used (never at import). */
export const C: Readonly<Record<PaletteKey, string>> = Object.defineProperties({} as Record<PaletteKey, string>,
  Object.fromEntries((Object.keys(DARK) as PaletteKey[]).map((k) => [k, { get: () => read()[k], enumerable: true }])));

/** Forget the reading: the next use of C reads the page again (after the theme changes). */
export function paletteChanged() { cache = null; }

/** A palette colour see-through: rgba(r,g,b,a) from its hex. */
export function alpha(k: PaletteKey, a: number) {
  const h = C[k].replace('#', ''), x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return `rgba(${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)},${a})`;
}
