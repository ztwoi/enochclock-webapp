// Stage the calculator for the browser into public/calculator: the checked ephemeris files, the Swiss Ephemeris WASM,
// the bundled worker, and a manifest of the files with their sizes. Run `npm run fetch-ephe` first (the build scripts do).
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'public/calculator');
const digest = (b) => createHash('sha256').update(b).digest('hex');
const pins = fs.readFileSync(path.join(import.meta.dirname, 'ephe.sha256'), 'utf8').split('\n')
  .filter((l) => /^[a-f0-9]{64}  /.test(l)).map((l) => { const [sha256, name] = l.split(/\s+/); return {sha256, name}; });
if (pins.length !== 102) throw Error('Expected the complete 102-file ephemeris manifest');

fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(path.join(out, 'ephe'), {recursive: true});
let bytes = 0;
for (const pin of pins) {
  const file = path.join(root, 'ephe', pin.name);
  if (!fs.existsSync(file)) throw Error(`Missing ephemeris file ${pin.name}: run npm run fetch-ephe`);
  const data = fs.readFileSync(file);
  if (digest(data) !== pin.sha256) throw Error('Ephemeris SHA-256 mismatch: ' + pin.name);
  fs.writeFileSync(path.join(out, 'ephe', pin.name), data); bytes += data.length;
  pin.size = data.length;   // the size lets the worker show download progress
}
fs.mkdirSync(path.join(out, 'wasm'), {recursive: true});
fs.copyFileSync(path.join(root, 'node_modules/sweph-wasm/dist/wasm/swisseph.wasm'), path.join(out, 'wasm/swisseph.wasm'));
await build({entryPoints: [path.join(root, 'src/calculator/worker.ts')], outfile: path.join(out, 'worker.js'), bundle: true, minify: true,
  format: 'esm', platform: 'browser', target: 'es2022', define: {EPHEMERIS_PINS: JSON.stringify(pins)}});
fs.writeFileSync(path.join(out, 'manifest.json'),
  JSON.stringify({files: pins, bytes, wasm_sha256: digest(fs.readFileSync(path.join(out, 'wasm/swisseph.wasm')))}, null, 2) + '\n');
console.log(`Staged calculator: ${pins.length} ephemeris files, ${bytes} bytes`);
