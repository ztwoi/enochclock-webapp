// How clock times read across the app: 12-hour ("7:41:07 PM", the default) or 24-hour ("19:41:07"). A setting (Details →
// Settings), kept on the device. Display only: the times the app parses, compares or puts in a time field stay "hh:mm:ss"
// (src/dates.ts localParts); they pass through clockText on the way to the page. UT (a time scale, not a wall clock) stays 24-hour.
const KEY = 'enoch.clock.v1';
export type ClockFormat = '12' | '24';

let format: ClockFormat = (() => { try { return localStorage.getItem(KEY) === '24' ? '24' : '12'; } catch { return '12'; } })();
let version = 0;

export const clockFormat = (): ClockFormat => format;
/** Changes when the format does: a view that builds its labels once (The Day's bar, Atlas's) rebuilds them when it moves on. */
export const clockVersion = () => version;
export function setClockFormat(f: ClockFormat) {
  if (f === format) return;
  format = f; version++;
  try { localStorage.setItem(KEY, f); } catch { /* private mode: not remembered */ }
}

/** A clock time for people: "19:41:07" or "19:41" → "7:41:07 PM" / "7:41 PM" (12-hour), or "19:41:07" (24-hour).
 *  `seconds: false` gives the time to the minute. Anything not a clock time is returned as it is. */
export function clockText(t: string, seconds = true, f: ClockFormat = format): string {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (!m) return t;
  const rest = `${m[2]}${seconds && m[3] ? `:${m[3]}` : ''}`, h = Number(m[1]) % 24;
  return f === '24' ? `${String(h).padStart(2, '0')}:${rest}` : `${h % 12 || 12}:${rest} ${h < 12 ? 'AM' : 'PM'}`;
}
