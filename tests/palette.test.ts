// The palette has one home, src/theme.css: these hold the drawing code's copy (palette.ts DARK) to it,
// each theme block's r,g,b channels to their colours, and every other source file to using the tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { alpha, C, cssVar, DARK, type PaletteKey } from '../src/palette';

const css = readFileSync('src/theme.css', 'utf8');
/** Each block of custom properties in theme.css (:root, and a theme's), as name → value. */
const blocks = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
  .map(([, sel, body]) => ({ sel: sel.replace(/\/\*[\s\S]*?\*\//g, '').trim(), vars: new Map([...body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])) }))
  .filter((b) => b.vars.size);
const root = blocks.find((b) => b.sel.split(',').map((x) => x.trim()).includes(':root'))!;
const rgbOf = (hex: string) => { const h = hex.slice(1), x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h; return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)).join(','); };

test('the drawing palette (palette.ts DARK) is theme.css :root, colour for colour', () => {
  for (const k of Object.keys(DARK) as PaletteKey[]) assert.equal(root.vars.get(cssVar(k))?.toLowerCase(), DARK[k], `${cssVar(k)} in theme.css vs DARK.${k}`);
});
test('every theme block gives its colours as hex, and each --x-rgb is --x', () => {
  for (const b of blocks) for (const [k, v] of b.vars) {
    if (k.endsWith('-rgb')) { const base = b.vars.get(k.slice(0, -4)) ?? root.vars.get(k.slice(0, -4)); assert.ok(base, `${b.sel}: ${k} has no ${k.slice(0, -4)}`); assert.equal(v.replace(/\s/g, ''), rgbOf(base!), `${b.sel}: ${k}`); }
    else if ((Object.keys(DARK) as PaletteKey[]).some((d) => cssVar(d) === k)) assert.match(v, /^#[0-9a-f]{3}([0-9a-f]{3})?$/i, `${b.sel}: ${k} is read by the drawing code, so it must be hex`);
  }
});
test('with no page, the palette is the dark theme; alpha() tints a palette colour', () => {
  assert.equal(C.goldHi, '#f4dc9f'); assert.equal(C.dlOx2, '#4a1a17');
  assert.equal(cssVar('dlSageDim'), '--dl-sage-dim'); assert.equal(cssVar('ivory2'), '--ivory2');
  assert.equal(alpha('gold', 0.28), 'rgba(214,178,106,0.28)');
});

/** Colour written out where a token belongs. What's left is not a theme colour: a video's black, a mask's opaque, a saved swatch. */
const ALLOWED: Record<string, RegExp> = {
  'src/palette.ts': /./,                                       // DARK, the fallback copy (held to theme.css above)
  'src/theme.css': /./,                                        // the palette itself
  'src/atlas/moments.ts': /COLOURS = /,                        // the swatches a saved moment can wear: user data, not the theme
  'src/atlas/land.ts': /'#fff'/,                               // the land mask texture (a channel, not a colour)
  'src/film.css': /#000|rgba\(0,0,0,/,                         // the film's letterbox and the captions over the video
  'src/studio/studio.css': /#040403/,                          // the Studio's letterbox (video frames, never themed)
};
const COLOUR = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\(\s*\d/i;
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('no source file outside the palette writes a colour out (use a token: var(--x) in CSS, C.x or alpha() in code)', () => {
  const found: string[] = [];
  for (const f of walk('src').filter((p) => /\.(ts|css)$/.test(p) && !p.startsWith(join('src', 'calculator')))) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!COLOUR.test(line) || ALLOWED[f]?.test(line)) return;
      if (/mask-image/.test(line)) return;                     // a mask's #000 is "opaque", not a colour
      found.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(found, []);
});
