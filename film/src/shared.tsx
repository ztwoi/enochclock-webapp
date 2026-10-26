// Shared film plumbing: frozen data, fonts, and a host that mounts the app's own scene modules.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import '../../src/theme.css';
import './film.css';

export const W = 1920, H = 1080, FPS = 30;
export const ink = { bg: '#090807', ivory: '#ece3cf', ivory2: '#a39a86', ivory3: '#635d51', gold: '#d6b26a', goldHi: '#f4dc9f', bronze: '#a8875a', silver: '#8fb3bd' };
/** Ge'ez on screen (Ge'ez numerals). Off until every verse's Ge'ez is checked. */
export const GEEZ_ON = false;
export const serif = '"Cormorant", "Ethiopic", serif', mono = '"Plex Mono", monospace', cond = '"Plex Cond", sans-serif', geez = '"Ethiopic", serif';

const FONTS: [string, string, Partial<FontFaceDescriptors>][] = [
  ['Cormorant', 'CormorantGaramond.ttf', { weight: '300 700' }], ['Cormorant', 'CormorantGaramond-Italic.ttf', { style: 'italic', weight: '300 700' }],
  ['Plex Mono', 'IBMPlexMono-Light.ttf', { weight: '300' }], ['Plex Mono', 'IBMPlexMono-Regular.ttf', { weight: '400' }],
  ['Plex Cond', 'IBMPlexSansCondensed-Regular.ttf', { weight: '400' }], ['Ethiopic', 'NotoSerifEthiopic.ttf', { weight: '100 900' }],
];
let fontsReady: Promise<void> | null = null;
const loadFonts = () => (fontsReady ??= Promise.all(FONTS.map(async ([family, file, d]) => {
  const f = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, d); await f.load(); document.fonts.add(f);
})).then(() => undefined));

export const getJSON = async <T,>(p: string): Promise<T> => (await fetch(staticFile(p))).json() as Promise<T>;

/** Mount an imperative scene (createGate, createSky, …) once; rendering waits until it exists. */
export function useScene<T extends { dispose(): void }>(make: (host: HTMLDivElement) => Promise<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<T | null>(null);
  const [handle] = useState(() => delayRender('mounting scene'));
  useLayoutEffect(() => {
    let s: T | null = null, live = true;
    loadFonts().then(() => make(ref.current!)).then((x) => { if (!live) { x.dispose(); return; } s = x; setScene(x); continueRender(handle); });
    return () => { live = false; s?.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [ref, scene] as const;
}

/** Load async data once, holding the render until it arrives. */
export function useData<T>(load: () => Promise<T>) {
  const [v, setV] = useState<T | null>(null);
  const [handle] = useState(() => delayRender('loading data'));
  useLayoutEffect(() => { Promise.all([load(), loadFonts()]).then(([x]) => { setV(x); continueRender(handle); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export const Fill = ({ children, style }: { children?: ReactNode; style?: CSSProperties }) =>
  <div style={{ position: 'absolute', inset: 0, ...style }}>{children}</div>;

/** Linear ramp clamped to [0,1]. */
export const ramp = (f: number, a: number, b: number) => Math.max(0, Math.min(1, (f - a) / (b - a)));
export const ease = (t: number) => t * t * (3 - 2 * t);
