// Write the Sun film's verse cues for the app (seconds), from the same list the film burns in.
//   node scripts/export-cues.ts        (Node 22.6+ runs TypeScript directly)
import { writeFileSync } from 'node:fs';
import { CUE_FADE, CUES } from '../src/sun/cues.ts';
import { SPEED } from '../src/sun/timeline.ts';

const FPS = 30 * SPEED, out = new URL('../../public/film/sun-cues.json', import.meta.url);
const cues = CUES.map((c) => ({ start: +(c.from / FPS).toFixed(3), end: +(c.to / FPS).toFixed(3), text: c.text, ref: c.ref, geez: c.geez }));
writeFileSync(out, JSON.stringify({ film: 'The courses of the luminaries', fade: CUE_FADE / 30, cues }, null, 1) + '\n');
console.log(`${cues.length} cues → ${out.pathname}`);
