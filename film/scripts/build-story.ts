// Build the story (the primer) for the app: one scrolling page, a chapter per scene of the Sun film, each a playable stretch
// of the film (its poster a frame of the film) with its passages, in the words of scripture only.
//   node scripts/build-story.ts        (needs out/sun-film.mp4: npm run render)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CHAPTERS, SOURCES } from '../src/story/chapters.ts';
import { outFrame } from '../src/sun/timeline.ts';

const FPS = 30, OUT = new URL('../../public/primer/', import.meta.url), POSTERS = new URL('story/', OUT);
mkdirSync(POSTERS, { recursive: true });
for (const c of CHAPTERS) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (outFrame(c.poster) / FPS).toFixed(3), '-i', 'out/sun-film.mp4', '-frames:v', '1', '-vf', 'scale=1920:1080', '-q:v', '2', new URL(`${c.id}.jpg`, POSTERS).pathname]);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const chapter = (c: typeof CHAPTERS[number], k: number) => `
<section id="${c.id}">
  <div class="num">${k + 1}</div>
  <h2>${esc(c.title)}</h2>
  <div class="film"><video data-clip="story/${c.id}" poster="story/${c.id}.jpg" preload="none" playsinline controls controlslist="nodownload"></video></div>
  ${c.passages.map((p) => `<blockquote><p>${esc(p.text)}</p><cite>${esc(p.ref)}</cite></blockquote>`).join('\n  ')}
</section>`;

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#090807"><title>The courses of the luminaries · Enoch</title><link rel="icon" href="data:,">
<style>
@font-face { font-family: Cormorant; src: url(/fonts/CormorantGaramond.ttf); font-weight: 300 700; }
@font-face { font-family: Cormorant; src: url(/fonts/CormorantGaramond-Italic.ttf); font-style: italic; font-weight: 300 700; }
@font-face { font-family: Mono; src: url(/fonts/IBMPlexMono-Regular.ttf); }
@font-face { font-family: Cond; src: url(/fonts/IBMPlexSansCondensed-Regular.ttf); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; scroll-padding-top: 64px; } @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { background: #090807; color: #ddd4c0; font-family: Cormorant, Georgia, serif; font-size: 21px; line-height: 1.55; }
.bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 18px; padding: 10px max(16px, env(safe-area-inset-left)); background: rgba(9,8,7,.94); border-bottom: 1px solid #26221b; backdrop-filter: blur(6px); }
.bar a { font-family: Cond, sans-serif; font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #d6b26a; text-decoration: none; white-space: nowrap; }
.bar nav { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; } .bar nav::-webkit-scrollbar { display: none; }
.bar nav a { font-family: Mono, monospace; letter-spacing: 0; color: #a39a86; border: 1px solid #2e2920; min-width: 34px; height: 30px; display: grid; place-items: center; }
.bar nav a.on, .bar nav a:hover { color: #f4dc9f; border-color: #7d6a43; }
.bar .sides { display: flex; border: 1px solid #2e2920; flex: none; } .bar .sides a { padding: 6px 12px; color: #a39a86; letter-spacing: .18em; }
.bar .sides a.on { color: #120e08; background: #d6b26a; }
main { max-width: 920px; margin: 0 auto; padding: 48px 22px 80px; }
header h1 { font-weight: 500; font-style: italic; font-size: 50px; line-height: 1.1; color: #ece3cf; }
header .ref { font-family: Mono, monospace; font-size: 13px; letter-spacing: .2em; color: #635d51; margin-top: 10px; }
.toc { list-style: none; margin-top: 34px; columns: 2; column-gap: 34px; }
.toc li { break-inside: avoid; margin-bottom: 8px; } .toc a { color: #ddd4c0; text-decoration: none; font-style: italic; } .toc a:hover { color: #f4dc9f; }
.toc span { font-family: Mono, monospace; font-style: normal; font-size: 13px; color: #7d6a43; margin-right: 10px; }
section { margin-top: 72px; padding-top: 28px; border-top: 1px solid #26221b; }
.num { font-family: Mono, monospace; font-size: 14px; color: #bd8a2a; }
h2 { font-weight: 500; font-style: italic; font-size: 36px; line-height: 1.15; color: #ece3cf; margin: 4px 0 20px; }
.film { position: relative; aspect-ratio: 16 / 9; background: #000; border: 1px solid #26221b; }
.film video { display: block; width: 100%; height: 100%; object-fit: cover; background: #000; }
blockquote { margin-top: 22px; } blockquote p { color: #ece3cf; }
cite { display: block; margin-top: 6px; font-style: normal; font-family: Mono, monospace; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: #8a8272; }
footer { margin-top: 80px; padding-top: 20px; border-top: 1px solid #26221b; font-family: Cond, sans-serif; font-size: 13px; color: #635d51; }
@media (max-width: 640px) { body { font-size: 19px; } header h1 { font-size: 36px; } h2 { font-size: 28px; } .toc { columns: 1; } main { padding-top: 30px; } }
</style></head><body>
<div class="bar"><a href="/">← The clock</a><span class="sides"><a class="on" href="/primer/">Enoch</a><a href="/phoenix/">Phoenix</a></span><nav>${CHAPTERS.map((c, k) => `<a href="#${c.id}" title="${esc(c.title)}">${k + 1}</a>`).join('')}</nav></div>
<main>
<header><h1>The book of the courses of the luminaries of the heaven</h1><div class="ref">1 ENOCH 72:1</div>
<ol class="toc">${CHAPTERS.map((c, k) => `<li><a href="#${c.id}"><span>${k + 1}</span>${esc(c.title)}</a></li>`).join('')}</ol></header>
${CHAPTERS.map(chapter).join('\n')}
<footer>${esc(SOURCES)}</footer>
</main>
<script>
// each chapter is its own clip, loaded when played: phones get the 720p copy, tablets and desktops the 1080p
const tier = matchMedia('(max-width: 700px)').matches ? '720' : '1080';
const vids = [...document.querySelectorAll('video[data-clip]')];
for (const v of vids) {
  v.addEventListener('play', () => {
    for (const o of vids) if (o !== v) o.pause();
    if (!v.src) { v.src = '/film/' + v.dataset.clip + '-' + tier + '.mp4'; v.play(); }
  });
  v.addEventListener('ended', () => { v.currentTime = 0; });
}
// the chapter in view, lit in the bar
const links = [...document.querySelectorAll('.bar nav a')];
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) links.forEach((l) => l.classList.toggle('on', l.getAttribute('href') === '#' + e.target.id)); }, { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('section').forEach((s) => io.observe(s));
</script>
</body></html>
`;
writeFileSync(new URL('index.html', OUT), page);
console.log(`story: ${CHAPTERS.length} chapters → ${OUT.pathname}index.html`);
