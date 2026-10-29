// The moment editor (docs/atlas.md, A.7): save the moment on show, or edit a saved one. A name, a description, a colour, tags
// (with the ones already used offered), and whether it keeps the place, the instant, or both. Its link is shown as it stands.
import { COLOURS, momentLink, readTags, type Moment } from './moments';

export interface MomentEditor {
  /** Open on a moment: a new one (its place and instant those on show) or a saved one. `known`: the tags already in use. */
  open(m: Moment, opts: { isNew: boolean; known: string[]; placeText: string; atText: string }): void;
}

export function createMomentEditor(host: HTMLElement, base: () => string, on: { save(m: Moment): void; remove(m: Moment): void }): MomentEditor {
  const dlg = document.createElement('dialog'); dlg.className = 'moment-dialog'; dlg.setAttribute('aria-labelledby', 'md-title');
  dlg.innerHTML = `<form method="dialog">
    <h2 id="md-title"></h2>
    <label>Name<input name="name" required maxlength="200" autocomplete="off"></label>
    <label>Description<textarea name="desc" rows="3" maxlength="2000"></textarea></label>
    <div class="md-lab">Colour</div><div class="md-swatches" role="radiogroup" aria-label="Colour">${COLOURS.map((c) => `<button type="button" role="radio" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
    <label>Tags<input name="tags" placeholder="solstice, history, Enoch: comma separated" autocomplete="off"></label>
    <div class="md-sugg"></div>
    <div class="md-lab">Keeps</div>
    <label class="md-check"><input type="checkbox" name="place"><span data-k="place"></span></label>
    <label class="md-check"><input type="checkbox" name="at"><span data-k="at"></span></label>
    <p class="md-small">Kept on this device only. The moment is also a link: <span class="md-link"></span></p>
    <menu><button type="button" class="btn md-del" hidden>Delete</button><span class="md-gap"></span><button type="button" class="btn md-cancel">Cancel</button><button class="btn on" value="save">Save</button></menu>
  </form>`;
  host.append(dlg);
  const form = dlg.querySelector('form')!, f = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  const sugg = dlg.querySelector<HTMLElement>('.md-sugg')!, link = dlg.querySelector<HTMLElement>('.md-link')!, del = dlg.querySelector<HTMLButtonElement>('.md-del')!;
  let cur: Moment | null = null, colour = COLOURS[0], armed = false;

  const draft = (): Moment => ({ ...cur!, name: f('name').value.trim() || 'Moment', desc: f('desc').value.trim(), color: colour, tags: readTags(f('tags').value),
    place: f('place').checked ? cur!.place : null, at: f('at').checked ? cur!.at : null });
  const syncLink = () => { const d = draft(); link.textContent = d.place || d.at ? momentLink(d, base()) : '—'; dlg.querySelector<HTMLButtonElement>('[value=save]')!.disabled = !d.place && !d.at; };
  const syncColour = () => dlg.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => { const on = b.dataset.c === colour; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  dlg.querySelector('.md-swatches')!.addEventListener('click', (e) => { const c = (e.target as HTMLElement).dataset.c; if (c) { colour = c; syncColour(); } });
  sugg.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tag]')?.dataset.tag; if (!t) return;
    const now = readTags(f('tags').value); if (!now.includes(t)) f('tags').value = [...now, t].join(', ');
  });
  form.addEventListener('input', syncLink);
  del.addEventListener('click', () => {                              // twice: the first asks
    if (!armed) { armed = true; del.textContent = 'Delete: sure?'; return; }
    dlg.close(); if (cur) on.remove(cur);
  });
  dlg.querySelector('.md-cancel')!.addEventListener('click', () => dlg.close('cancel'));   // a button, so Enter saves
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'save' && cur) on.save(draft()); });

  return {
    open(m, o) {
      cur = m; colour = m.color; armed = false;
      dlg.querySelector('#md-title')!.textContent = o.isNew ? 'Save this moment' : 'Edit the moment';
      f('name').value = m.name; f('desc').value = m.desc; f('tags').value = m.tags.join(', ');
      f('place').checked = !!m.place; f('place').disabled = !m.place; f('at').checked = !!m.at; f('at').disabled = !m.at;
      dlg.querySelector('[data-k=place]')!.textContent = m.place ? `The place: ${o.placeText}` : 'No place: it keeps the place on show';
      dlg.querySelector('[data-k=at]')!.textContent = m.at ? `The instant: ${o.atText}` : 'No instant: it keeps the time on show';
      const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      sugg.innerHTML = o.known.map((t) => `<button type="button" class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
      del.hidden = o.isNew; del.textContent = 'Delete';
      syncColour(); syncLink(); dlg.returnValue = ''; dlg.showModal(); f('name').select();
    },
  };
}
