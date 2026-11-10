// A reading's value (dl.read dd) is a run of phrases joined by " · " (or "–", "→", ","): "2026-05-24 · position 64 · 159 of 364".
// When one is too long for the inspector it wraps, and it should wrap between phrases, never inside one ("159 / of 364").
// The panels write their values in many places (and some update them live), so rather than mark each template, this keeps
// every space in a value unbreakable except the one after a separator, as the text arrives.
// A space stays breakable after a separator, before an aside "(…)", and at the end of a text node (before a <small> or <span>).
const SEP = /([·–→…,;])? /g;
const fix = (t: Text) => {
  const s = t.data;
  if (!s.includes(' ')) return;
  const n = s.replace(SEP, (m: string, sep: string | undefined, at: number) => {
    const next = at + m.length;
    return sep || next === s.length || s[next] === '(' ? m : ' ';
  });
  if (n !== s) t.data = n;                                         // only when changed: the observer sees its own write once, then nothing
};
const inValue = (n: Node) => !!n.parentElement?.closest('dl.read dd');
function walk(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) { if (inValue(n)) fix(n as Text); return; }
  if (!(n instanceof Element)) return;
  const dds = n.matches('dl.read dd') ? [n] : n.closest('dl.read dd') ? [n] : [...n.querySelectorAll('dl.read dd')];
  for (const dd of dds) {
    const w = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) fix(t as Text);
  }
}

/** Keep the phrases of every reading value under `root` together, now and as the panels re-render. */
export function keepPhrasesTogether(root: HTMLElement) {
  walk(root);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') { if (inValue(m.target)) fix(m.target as Text); }
      else m.addedNodes.forEach(walk);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true });
}
