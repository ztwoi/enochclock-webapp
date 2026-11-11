// The palette for drawing code: SVG built in TypeScript, WebGL materials, canvas gradients. The
// colours live in src/theme.css (one block per theme); this reads the same custom properties off the
// page, so the drawings and the stylesheets can never disagree. A key is the property's name in
// camelCase: C.goldHi is --gold-hi, C.dlCountDim is --dl-count-dim.
//
// Two palettes. C is the page's, the theme in force (DARK is its fallback where there is no page). INST is the
// instruments': the Dial, Sky, The Day's sky and dial, the Atlas globe. An instrument is night in every theme: it is
// drawn in light (stars, glows, what is now), and paper cannot glow. So where the page is paper (Light, Sepia) the
// instruments keep the night's colours, each one object set into the page, and INST reads them from theme.css's night
// scope; in Dark, Contrast and Red the page is night already and INST is C. Deep Time is a chart, not a sky: it uses C.

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
  // the Dial (theme.css: rings of light on space, the colours of the sky's day)
  dlSpace0: '#13151f', dlSpace1: '#0a0b11', dlSpace2: '#050506', dlDisc: '#07080c', dlLine: '#8a867d',
  dlSkyDay: '#fff0c2', dlSkyAmber: '#ffc468', dlSkyEmber: '#ff7a4c', dlSkyViolet: '#9676e0', dlSkyNight: '#8ea5ee',
  dlPday: '#ffd071', dlPnight: '#a3b9f7', dlRunDay: '#ffe9ad', dlRunNight: '#b9c9ff', dlRunInk: '#2a1f08',
  dlRed: '#f55a36', dlOxEdge: '#050506',
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
/** The page is paper (Light, Sepia), not night: theme.css --paper. Deep Time's glow is then a wash, not light; the instruments are night regardless (INST). */
export const paper = () => typeof document !== 'undefined' && typeof getComputedStyle !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() === '1';

/** Where the instruments' colours are read: the page itself, or (the page being paper) an element in theme.css's night scope. */
function nightScope(): Element {
  if (!paper()) return document.documentElement;
  let probe = document.getElementById('night-probe');
  if (!probe) { probe = document.createElement('i'); probe.id = 'night-probe'; probe.className = 'night'; probe.hidden = true; document.body.append(probe); }
  return probe;
}
let icache: Record<PaletteKey, string> | null = null, igen = -1;
function readInst(): Record<PaletteKey, string> {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined' || !document.body) return DARK;
  if (!paper()) return read();
  if (icache && igen === generation) return icache;
  const s = getComputedStyle(nightScope());
  if (!s.getPropertyValue('--bg').trim()) return DARK;
  const o = {} as Record<PaletteKey, string>;
  for (const k of Object.keys(DARK) as PaletteKey[]) o[k] = s.getPropertyValue(cssVar(k)).trim() || DARK[k];
  igen = generation; return (icache = o);
}
/** The instruments' colours: night in every theme (the page's own where the page is night). */
export const INST: Palette = Object.defineProperties({} as Record<PaletteKey, string>,
  Object.fromEntries((Object.keys(DARK) as PaletteKey[]).map((k) => [k, { get: () => readInst()[k], enumerable: true }])));
/** How much brighter than the catalogue the instruments draw the stars (theme.css --star-gain: lifted in Contrast and Red, and where the page around them is paper, for daylight). */
export const starGain = () => (typeof document !== 'undefined' && typeof getComputedStyle !== 'undefined' && document.body && Number(getComputedStyle(nightScope()).getPropertyValue('--star-gain'))) || 1;
/** Counts the theme's changes: a drawing that keeps what it built can key it on this. */
export const paletteGeneration = () => generation;

/** A palette colour see-through: rgba(r,g,b,a) from its hex. */
export function alpha(k: PaletteKey, a: number, P: Palette = C) {
  const h = P[k].replace('#', ''), x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return `rgba(${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)},${a})`;
}

/** A body's colour: the Sun, the Moon or a planet, by its name. */
export const bodyColor = (body: string, P: Palette = C) => P[body.toLowerCase() as PaletteKey] ?? P.ivory;
