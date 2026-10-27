// Feedback: a link at the foot of the details sheet that opens a dialog with one box. The message is POSTed to /api/feedback on the
// same origin. Off unless the build sets VITE_FEEDBACK (a copy without that endpoint shows no link). No location is read or sent;
// the context is the app version, the view and the year in view.
import pkg from '../package.json';

export const MAX_MESSAGE = 4000;
export type Ctx = { mode: string; page: string };

/** The JSON body. `website` is the honeypot: real users never fill it. */
export function feedbackBody(message: string, email: string, ctx: Ctx, lang: string, website = ''): string {
  return JSON.stringify({ message: message.trim(), email: email.trim(), website, context: { version: pkg.version, mode: ctx.mode, page: ctx.page, lang } });
}
/** The SHA-256 of the body, hex: the endpoint's host requires it on a POST. */
export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** True when the message was accepted. */
export async function sendFeedback(body: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await fetcher('/api/feedback', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-amz-content-sha256': await sha256Hex(body) } });
    return r.ok;
  } catch { return false; }
}

/** Adds the Feedback link to the legal line (`legal`) and builds the dialog it opens. `context` is read when the dialog opens. */
export function mountFeedback(legal: HTMLElement, context: () => Ctx): void {
  if (!import.meta.env.VITE_FEEDBACK) return;
  const dlg = document.createElement('dialog'); dlg.id = 'feedback-dialog'; dlg.setAttribute('aria-label', 'Feedback');
  dlg.innerHTML = `<form method="dialog" id="feedback-form" novalidate>
   <h2>Feedback</h2>
   <label>Message<textarea name="message" rows="6" maxlength="${MAX_MESSAGE}" placeholder="What did you notice? A correction, a bug, an idea, anything." required></textarea></label>
   <label>Email, only if you'd like a reply<input name="email" type="email" autocomplete="email" maxlength="200" inputmode="email"></label>
   <label class="fb-hp" aria-hidden="true">Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
   <p class="fb-ctx" id="fb-ctx"></p>
   <p class="fb-status" id="fb-status" role="status"></p>
   <menu><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn on" id="fb-send" value="send" disabled>Send</button></menu>
  </form>`;
  const form = dlg.querySelector('form')!, msg = form.message as HTMLTextAreaElement, mail = form.email as HTMLInputElement;
  const send = form.querySelector<HTMLButtonElement>('#fb-send')!, status = form.querySelector<HTMLElement>('#fb-status')!, ctxEl = form.querySelector<HTMLElement>('#fb-ctx')!;
  let busy = false, ctx: Ctx = { mode: '', page: '' };
  const say = (t: string, error = false) => { status.textContent = t; status.dataset.error = error ? '1' : ''; };
  const ready = () => { send.disabled = busy || !msg.value.trim(); };
  msg.oninput = () => { ready(); if (msg.value.length > MAX_MESSAGE - 400) say(`${MAX_MESSAGE - msg.value.length} characters left`); else if (status.dataset.error !== '1') say(''); };
  const link = document.createElement('button'); link.type = 'button'; link.className = 'legal-btn'; link.textContent = 'Feedback';
  link.onclick = () => { ctx = context(); ctxEl.textContent = [ctx.mode, ctx.page, `v${pkg.version}`].filter(Boolean).join(' · '); say(''); ready(); dlg.showModal(); msg.focus(); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if ((e.submitter as HTMLButtonElement | null)?.value === 'cancel') return dlg.close();
    if (busy || !msg.value.trim()) return;
    if (!mail.checkValidity()) { say('That email address doesn’t look right.', true); mail.focus(); return; }
    if (!navigator.onLine) { say('You’re offline. Your message is kept; try again when you’re back online.', true); return; }
    busy = true; ready(); send.textContent = 'Sending…'; say('');
    const ok = await sendFeedback(feedbackBody(msg.value, mail.value, ctx, navigator.language, (form.website as HTMLInputElement).value));
    busy = false; send.textContent = 'Send';
    if (ok) { say('Thank you.'); msg.value = ''; send.disabled = true; setTimeout(() => dlg.open && dlg.close(), 1200); }
    else { say('That didn’t send. Your message is kept; please try again.', true); ready(); }
  };
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });     // the backdrop
  legal.append(link); legal.after(dlg);
}
