// Download the Swiss Ephemeris files listed in scripts/ephe.sha256 into ephe/, checking each against its SHA-256.
// Files already present and correct are skipped, so this is safe to run before every build.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const COMMIT = 'c113653fe37fe5cdbfcc030a6e341de03ef018d2';
const BASE = `https://raw.githubusercontent.com/aloistr/swisseph/${COMMIT}/ephe/`;
const root = path.resolve(import.meta.dirname, '..'), dir = path.join(root, 'ephe');
const digest = (b) => createHash('sha256').update(b).digest('hex');
const pins = fs.readFileSync(path.join(import.meta.dirname, 'ephe.sha256'), 'utf8').split('\n')
  .filter((l) => /^[a-f0-9]{64}  /.test(l)).map((l) => { const [sha256, name] = l.split(/\s+/); return {sha256, name}; });
fs.mkdirSync(dir, {recursive: true});

const have = (pin) => { const f = path.join(dir, pin.name); return fs.existsSync(f) && digest(fs.readFileSync(f)) === pin.sha256; };
async function get(pin) {
  const res = await fetch(BASE + pin.name);
  if (!res.ok) throw new Error(`${pin.name}: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (digest(data) !== pin.sha256) throw new Error(`${pin.name}: SHA-256 mismatch`);
  fs.writeFileSync(path.join(dir, pin.name), data);
}

const todo = pins.filter((p) => !have(p));
for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(get));
console.log(`ephemeris: ${pins.length - todo.length} present, ${todo.length} downloaded → ephe/`);
