// The app's own Dial (src/dial/render.ts), drawn for one instant and turned into a picture for the machine's floor.
// The face is built off-screen with the app's stylesheet, every style is copied onto its elements (an SVG drawn as an
// image cannot see the page's CSS), the fonts are embedded, and the result is rasterised.
import { staticFile } from 'remotion';
import '../../../src/dial/face.css';
import { createDial } from '../../../src/dial/render';
import { dialState } from '../../../src/dial/state';
import type { YearDoc } from '../../../src/types';
import { annual } from '../../../src/model';

const NS = 'http://www.w3.org/2000/svg';
/** The heading the film's Dial is drawn facing: east at the top. */
const EAST = 90;
const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'display', 'visibility'];
const FONTS: [string, string, string, string][] = [
  ['Cormorant', 'CormorantGaramond.ttf', 'normal', '300 700'], ['Cormorant', 'CormorantGaramond-Italic.ttf', 'italic', '300 700'],
  ['Plex Mono', 'IBMPlexMono-Light.ttf', 'normal', '300'], ['Plex Mono', 'IBMPlexMono-Regular.ttf', 'normal', '400'], ['Plex Mono', 'IBMPlexMono-Medium.ttf', 'normal', '500'],
  ['Plex Cond', 'IBMPlexSansCondensed-Regular.ttf', 'normal', '400'], ['Plex Cond', 'IBMPlexSansCondensed-Medium.ttf', 'normal', '500'], ['Ethiopic', 'NotoSerifEthiopic.ttf', 'normal', '100 900'],
];
const b64 = (buf: ArrayBuffer) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

/** The face, or (with `keep`) only the layers matching those selectors, so a single wheel can be lit on its own; `bare`: the
 *  wheel of parts without the arc of daylight. */
let fontFaces: Promise<string[]> | null = null;
const loadFaces = () => Promise.all(FONTS.map(async ([family, file, style, weight]) =>
  `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};src:url(data:font/ttf;base64,${b64(await (await fetch(staticFile(`fonts/${file}`))).arrayBuffer())})}`));

/** `at`: an instant (JD), or a fractional morning of the year — the app's own day glide: the hour held, the rings
 *  blended from morning i toward morning i + 1 by `frac`, as the Dial plays by days. */
export type DialAt = number | { i: number; frac: number };
export async function dialImage(doc: YearDoc, at: DialAt, size = 2048, keep?: string[], bare = false): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-5000px;top:0;width:1000px;height:1000px;';
  document.body.appendChild(host);
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '-500 -500 1000 1000'); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  host.appendChild(svg);
  const rows = annual(doc), HOLD = .01;                          // just after sunrise, as the film's day is drawn
  let s0;
  // drawn with east at the top (the app's compass framing, facing east), as the film looks at it: every label reads upright
  if (typeof at === 'number') s0 = dialState(doc, at, [], 'compass', EAST);
  else {
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor(at.i))), next = rows[i + 1] && !rows[i + 1].closing_boundary ? i + 1 : -1;
    s0 = dialState(doc, rows[i].sunrise_jd_ut + HOLD, [], 'compass', EAST, undefined, next >= 0 && at.frac > 0 ? { doc, i: next, jd: rows[next].sunrise_jd_ut + HOLD, frac: at.frac } : null);
  }
  createDial(svg).update(doc, s0);
  if (bare) svg.querySelector('.dl-ring-parts path[opacity="0.85"]')?.remove();   // the wheel of parts without its gold arc of daylight: the film fills it in as the Sun runs its day
  if (keep) for (const n of [...svg.querySelector('.dl-root')!.children]) if (!keep.some((k) => n.matches(k))) (n as SVGElement).style.display = 'none';
  for (const n of [svg, ...svg.querySelectorAll('*')]) {
    const cs = getComputedStyle(n);
    (n as SVGElement).setAttribute('style', PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    n.removeAttribute('class');
  }
  const faces = await (fontFaces ??= loadFaces());
  const st = document.createElementNS(NS, 'style'); st.textContent = faces.join(''); svg.insertBefore(st, svg.firstChild);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d')!.drawImage(img, 0, 0, size, size);
  URL.revokeObjectURL(url); host.remove();
  return c;
}
