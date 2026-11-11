// The palette for drawing code: SVG built in TypeScript, WebGL materials, canvas gradients. The
// colours live in src/theme.css (one block per theme); this reads the same custom properties off the
// page, so the drawings and the stylesheets can never disagree. A key is the property's name in
// camelCase: C.goldHi is --gold-hi, C.dlOx2 is --dl-ox2.
//
// Every drawing uses C, the theme in force (DARK is its fallback where there is no page). A theme draws
// either in light on black (Dark, Contrast, Red: stars and glows add light) or in ink on paper (Light:
// stars are ink dots, glows a wash of colour): paper() tells which.

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
  starInk: '#ece3cf', skyGround: '#050403', skyDay: '#3a2c17',
  globeSea: '#0a0a0c', globeSeaDay: '#171511', globeLand: '#26231e', globeLandDay: '#705c3a', globePolar: '#782622',
  onGold: '#120e08',
  // the Dial (theme.css: rings of light on space, the colours of the sky's day)
  dlSpace0: '#13151f', dlSpace1: '#0a0b11', dlSpace2: '#050506', dlRim0: '#0a0b11', dlRim1: '#050506', dlDisc: '#07080c', dlLine: '#8a867d',
  dlSkyDay: '#fff0c2', dlSkyAmber: '#ffc468', dlSkyEmber: '#ff7a4c', dlSkyViolet: '#9676e0', dlSkyNight: '#8ea5ee',
  dlPday: '#ffd071', dlPnight: '#a3b9f7', dlRunDay: '#ffe9ad', dlRunNight: '#b9c9ff', dlRunInk: '#2a1f08',
  dlRed: '#f55a36', dlOx: '#2a1713', dlOx2: '#3b1e17', dlOxEdge: '#050506',
  dlGlass: '#b2c4ee', dlCourse: '#e6ebf8', dlCount: '#c3c9d6', dlCountDim: '#666d7c', dlLit: '#fff6d8', dlLitEdge: '#e9cf8a',
};
export type PaletteKey = keyof typeof DARK;
export type Palette = Readonly<Record<PaletteKey, string>>;

/** The custom property a key reads: goldHi → --gold-hi. */
export const cssVar = (k: PaletteKey) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

let cache: Record<PaletteKey, string> | null = null, generation = 0;
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
export const C: Palette = Object.defineProperties({} as Record<PaletteKey, string>,
  Object.fromEntries((Object.keys(DARK) as PaletteKey[]).map((k) => [k, { get: () => read()[k], enumerable: true }])));

/** Forget the reading: the next use of C reads the page again (after the theme changes). */
export function paletteChanged() { cache = null; generation++; }
/** The theme draws in ink on paper (Light), not in light on black: theme.css --paper. */
export const paper = () => typeof document !== 'undefined' && typeof getComputedStyle !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() === '1';
/** How much brighter than the catalogue the theme draws the stars (theme.css --star-gain: Contrast and Red lift them). */
export const starGain = () => (typeof document !== 'undefined' && typeof getComputedStyle !== 'undefined' && Number(getComputedStyle(document.documentElement).getPropertyValue('--star-gain'))) || 1;
/** Counts the theme's changes: a drawing that keeps what it built can key it on this. */
export const paletteGeneration = () => generation;

/** A palette colour see-through: rgba(r,g,b,a) from its hex. */
export function alpha(k: PaletteKey, a: number, P: Palette = C) {
  const h = P[k].replace('#', ''), x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return `rgba(${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)},${a})`;
}

/** A body's colour: the Sun, the Moon or a planet, by its name. */
export const bodyColor = (body: string, P: Palette = C) => P[body.toLowerCase() as PaletteKey] ?? P.ivory;
