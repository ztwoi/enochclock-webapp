// The app's Dial drawn for a given instant, on demand, for the film to show the real instrument at the day it explains.
// A frame that needs a picture not yet drawn holds its render until it is ready; a few recent pictures are kept.
import { useLayoutEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import type { YearDoc } from '../../../src/types';
import { dialImage, type DialAt } from './dialTexture';

const KEEP = 8, cache = new Map<string, HTMLCanvasElement>(), pending = new Map<string, Promise<HTMLCanvasElement>>();

/** `t`: a fractional morning of the year (the app's day glide), or null for none. */
export function useDialAt(doc: YearDoc | undefined, t: number | null, keep?: string[], bare = false) {
  const key = doc && t !== null ? `${t.toFixed(4)}|${keep?.join(',') ?? 'all'}${bare ? '|bare' : ''}` : '';
  const [, redraw] = useState(0);
  useLayoutEffect(() => {
    if (!key || cache.has(key) || !doc || t === null) return;
    const handle = delayRender(`dial ${key}`);
    let p = pending.get(key);
    const at: DialAt = { i: Math.floor(t), frac: t - Math.floor(t) };
    if (!p) { p = dialImage(doc, at, 2048, keep, bare); pending.set(key, p); }
    p.then((c) => {
      pending.delete(key); cache.set(key, c);
      while (cache.size > KEEP) cache.delete(cache.keys().next().value!);
      redraw((n) => n + 1); continueRender(handle);
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return key ? cache.get(key) ?? null : null;
}
