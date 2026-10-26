// The licence line under the inspector: where the AGPL's offer of source lives (VITE_SOURCE_URL, set when the public site is built),
// the licence text, and the third-party notices. Staged by scripts/stage-legal.mjs.
const SOURCE = (import.meta.env.VITE_SOURCE_URL as string | undefined)?.trim();
export function mountLegal(after: HTMLElement): void {
  const p = document.createElement('p'); p.className = 'legal'; p.id = 'legal';
  const link = (href: string, text: string) => { const a = document.createElement('a'); a.href = href; a.textContent = text; a.target = '_blank'; a.rel = 'noopener'; return a; };
  if (SOURCE) p.append(link(SOURCE, 'Source'));
  p.append(link(`${import.meta.env.BASE_URL}legal/LICENSE.txt`, 'AGPL-3.0'), link(`${import.meta.env.BASE_URL}legal/THIRD-PARTY-NOTICES.txt`, 'Notices'));
  after.after(p);
}
