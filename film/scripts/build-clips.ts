// Cut the film into one clip per story chapter, in two sizes, for the web (the primer plays a clip, not the whole film).
//   node scripts/build-clips.ts [--force] [chapter-id ...]       (needs out/sun-film.mp4: npm run render)
// The cuts come from src/story/chapters.ts (the same frames the page is built from), so retiming a scene or adding a chapter
// needs nothing here. Each clip is keyed by a hash of its decoded frames + the encoder settings: after a re-render only the
// chapters whose pictures changed are re-encoded.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CHAPTERS } from '../src/story/chapters.ts';
import { VISION_END, outFrame } from '../src/sun/timeline.ts';
import { FPS, MASTER, OUT_DIR, TIERS, encodeArgs } from './encode.ts';

const force = process.argv.includes('--force');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const manifestPath = new URL('clips.json', OUT_DIR);
mkdirSync(OUT_DIR, { recursive: true });
const manifest: Record<string, string> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

// the cut in seconds, frame-exact: -ss before -i seeks, and re-encoding makes the cut land on the frame asked for
const cut = (from: number, to: number) => ['-ss', (outFrame(from) / FPS).toFixed(4), '-t', ((outFrame(to) - outFrame(from)) / FPS).toFixed(4), '-i', MASTER];   // from/to are story frames; the master is SPEED times shorter
const frameHash = (from: number, to: number) => execFileSync('ffmpeg', ['-v', 'error', ...cut(from, to), '-map', '0:v', '-f', 'hash', '-hash', 'md5', '-'], { encoding: 'utf8' }).trim();

// the chapters, then the whole film for the app's Watch player (film/sun-1080.mp4, film/sun-720.mp4)
const CUTS = [...CHAPTERS.map((c) => ({ id: c.id, dir: '', from: c.from, to: c.to })), { id: 'sun', dir: '../', from: 0, to: VISION_END }];
let made = 0, kept = 0;
for (const c of CUTS) {
  if (only.length && !only.includes(c.id)) continue;
  const frames = frameHash(c.from, c.to);
  for (const t of TIERS) {
    const name = `${c.dir}${c.id}-${t.name}.mp4`, file = new URL(name, OUT_DIR), key = `${frames}:${t.settings}`;
    if (!force && manifest[name] === key && existsSync(file)) { kept++; continue; }
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...cut(c.from, c.to), ...encodeArgs(t), file.pathname]);
    manifest[name] = key; made++;
    console.log(`  ${name}  ${(readFileSync(file).length / 1e6).toFixed(1)} MB`);
  }
}
// clips of chapters that no longer exist are dropped from the record (the files are left for you to delete)
const live = new Set(CUTS.flatMap((c) => TIERS.map((t) => `${c.dir}${c.id}-${t.name}.mp4`)));
for (const k of Object.keys(manifest)) if (!live.has(k)) delete manifest[k];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`clips: ${made} encoded, ${kept} unchanged → ${OUT_DIR.pathname}`);
