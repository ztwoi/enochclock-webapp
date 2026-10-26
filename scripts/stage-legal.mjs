// Stage the licence, the third-party notices and the bundled libraries' licence texts into public/legal, where the app's footer links point.
// The AGPL-3.0 (§13) requires offering every user of a hosted copy the source: set VITE_SOURCE_URL to this repository's URL
// when you build (the Dockerfile and compose.yaml default it), and the app shows a Source link.
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..'), out = join(root, 'public/legal');
mkdirSync(out, {recursive: true});
copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE.txt'));
copyFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), join(out, 'THIRD-PARTY-NOTICES.txt'));
copyFileSync(join(root, 'node_modules/three/LICENSE'), join(out, 'THREE-LICENSE.txt'));
// astronomy-engine carries its MIT licence in the header comment of its source.
const header = readFileSync(join(root, 'node_modules/astronomy-engine/astronomy.js'), 'utf8').match(/\/\*\*[\s\S]*?\*\//)[0];
writeFileSync(join(out, 'ASTRONOMY-ENGINE-LICENSE.txt'), header.replace(/^\/\*\*\s*|\s*\*\/$/g, '').replace(/^ {4}/gm, '').replace(/^@preserve\s*/, '') + '\n');
console.log('staged licence and notices → public/legal');
if (!process.env.VITE_SOURCE_URL) console.warn('\n  Note: VITE_SOURCE_URL is not set, so the app shows no Source link. Set it for a public deployment.\n');
