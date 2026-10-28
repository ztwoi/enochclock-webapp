#!/usr/bin/env node
// Record one Enoch day, sunrise to sunrise, as an mp4: the Studio (studio.html, src/studio/main.ts) stepped frame by frame in
// headless Chrome, each frame captured and piped to ffmpeg. Every frame is the exact instant asked for (nothing is recorded in
// real time), so a slow frame costs time, never smoothness.
//
//   npm run video -- --date 2026-10-28 --site jerusalem
//   npm run video -- --date 2026-12-21 --lat 21.31 --lon -157.86 --tz Pacific/Honolulu --name Honolulu --seconds 30
//
// Options: --date YYYY-MM-DD (the civil date of the day's sunrise; default today at the site) · --site <preset> (san-francisco,
// jerusalem, sydney, london) or --lat --lon [--elev] --tz [--name] · --seconds 40 (sunrise to sunrise) · --fps 30 · --intro 1 ·
// --hold 3 · --out out/day-<date>-<site>.mp4 · --jobs 4 (pages drawing at once) · --crf 18 · --audio <file> (laid under the
// video, cut to its length, faded out) · --url <a running dev server> (default: start one).
// Needs ffmpeg on PATH and Chrome (or `npx playwright install chromium`); without --url, the calculator staged (npm run stage).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const { values: o } = parseArgs({ options: Object.fromEntries(['date', 'site', 'lat', 'lon', 'elev', 'tz', 'name', 'seconds', 'fps', 'intro', 'hold', 'out', 'jobs', 'crf', 'audio', 'url']
  .map((k) => [k, { type: 'string' }])) });
const fail = (msg) => { console.error(`day-video: ${msg}`); process.exit(1); };
if (o.audio && !existsSync(o.audio)) fail(`no audio file at ${o.audio}`);

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const query = new URLSearchParams({ capture: '1' });
for (const k of ['date', 'site', 'lat', 'lon', 'elev', 'tz', 'name', 'seconds', 'fps', 'intro', 'hold']) if (o[k] !== undefined) query.set(k, o[k]);
const fps = Number(o.fps ?? 30), jobs = Math.max(1, Number(o.jobs ?? 4));
const out = path.resolve(o.out ?? path.join(root, 'out', `day-${o.date ?? 'today'}-${slug(o.name ?? o.site ?? 'san-francisco')}.mp4`));
mkdirSync(path.dirname(out), { recursive: true });

// the page: a running server, or our own (Vite's dev server, on the next free port from 4178)
let server = null, base = o.url;
if (!base) {
  if (!existsSync(path.join(root, 'public/calculator/manifest.json'))) fail('the calculator is not staged: run `npm run stage` first (or record from a running site with --url)');
  const { createServer } = await import('vite');
  server = await createServer({ root, logLevel: 'warn', server: { host: '127.0.0.1', port: 4178, strictPort: false } });
  await server.listen();
  base = server.resolvedUrls.local[0];
}
const url = new URL(`studio.html?${query}`, base.endsWith('/') ? base : `${base}/`).href;

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] })
  .catch(() => chromium.launch({ args: ['--enable-gpu'] }));
let ffmpeg = null;
const stop = async (code) => { ffmpeg?.kill('SIGKILL'); await browser.close().catch(() => {}); await server?.close(); process.exit(code); };
process.on('SIGINT', () => stop(130));

/** A page with the Studio ready: 540 × 960 CSS pixels at 2×, so 1080 × 1920 captures. */
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(url);
  await page.evaluate(() => window.studio.ready).catch(async () => fail(await page.evaluate(() => window.studio?.error ?? 'the Studio did not start')));
  return page;
}

try {
  const t0 = Date.now(), pages = await Promise.all(Array.from({ length: jobs }, openPage));
  const frames = await pages[0].evaluate(() => window.studio.frames), seconds = frames / fps;
  console.log(`day-video: ${frames} frames (${seconds.toFixed(1)} s at ${fps} fps), ${jobs} page${jobs > 1 ? 's' : ''} → ${path.relative(process.cwd(), out)}`);

  const audio = o.audio ? ['-i', o.audio] : [];
  const audioOut = o.audio ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${Math.max(0, seconds - 2).toFixed(2)}:d=2`, '-shortest'] : [];
  ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...audio,
    // the captures are sRGB: converted with the BT.709 matrix and tagged as such, H.264 High 4:2:0 for every player and phone
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-tune', 'animation', '-crf', String(o.crf ?? 18),
    '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', ...audioOut, '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => { ffmpeg.on('error', reject); ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(Error(`ffmpeg exited with ${code}`)))); });

  // each page draws every jobs-th frame; the captures go to ffmpeg in order as they arrive
  const ready = new Map(); let next = 0, wake = () => {};
  const write = (buf) => new Promise((resolve) => (ffmpeg.stdin.write(buf) ? resolve() : ffmpeg.stdin.once('drain', resolve)));
  const writer = (async () => {
    while (next < frames) {
      if (!ready.has(next)) { await new Promise((r) => { wake = r; }); continue; }
      await write(ready.get(next)); ready.delete(next); next++;
      if (next % (fps * 2) === 0 || next === frames) {
        const s = (Date.now() - t0) / 1000, rate = next / s;
        process.stdout.write(`\r  frame ${next}/${frames} · ${rate.toFixed(1)} frames/s · ${Math.round((frames - next) / rate)} s left   `);
      }
    }
    ffmpeg.stdin.end();
  })();
  await Promise.all(pages.map(async (page, k) => {
    for (let f = k; f < frames; f += jobs) {
      while (f - next > jobs * 8) await new Promise((r) => setTimeout(r, 5));   // don't run far ahead of the writer
      await page.evaluate((f) => window.studio.seek(f), f);
      ready.set(f, await page.screenshot({ type: 'png' }));
      wake();
    }
  }));
  await writer; await done;
  console.log(`\nday-video: wrote ${path.relative(process.cwd(), out)} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await stop(0);
} catch (e) {
  console.error(`\nday-video: ${e.message}`);
  await stop(1);
}
