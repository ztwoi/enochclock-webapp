// After `vite build`: list the offline pack (every file the installed app needs, with its SHA-256) and write the service worker.
// The pack is the app shell, fonts, icons, the calculator (worker, WASM, ephemeris), the sky catalogue and Deep Time; the films and
// the primer are deliberately excluded. The version is the hash of that list, so any changed byte yields a new worker.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dist=path.resolve(import.meta.dirname,'../dist'),digest=b=>createHash('sha256').update(b).digest('hex');
const EXCLUDE=[/^\/film\//,/^\/tutorial\//,/^\/primer\//,/^\/phoenix\//,/^\/sw\.js$/,/^\/offline-manifest\.json$/,/\.DS_Store$/];
const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=walk(dist).map(f=>'/'+path.relative(dist,f).split(path.sep).join('/')).filter(p=>!EXCLUDE.some(r=>r.test(p))).sort()
 .map(p=>{const data=fs.readFileSync(path.join(dist,p));return {path:p,size:data.length,sha256:digest(data)};});
for(const need of ['/index.html','/manifest.webmanifest','/calculator/worker.js','/calculator/wasm/swisseph.wasm','/sky/catalogue.json','/deep/head-100.json','/deep/series.json','/atlas/land-50m.json'])if(!files.some(f=>f.path===need))throw Error('Offline pack is missing '+need);
if(files.filter(f=>f.path.startsWith('/calculator/ephe/')).length!==102)throw Error('Offline pack needs all 102 ephemeris files');
const version=digest(JSON.stringify(files)).slice(0,16);
fs.writeFileSync(path.join(dist,'offline-manifest.json'),JSON.stringify({version,bytes:files.reduce((n,f)=>n+f.size,0),files},null,1)+'\n');
fs.writeFileSync(path.join(dist,'sw.js'),fs.readFileSync(path.resolve(import.meta.dirname,'../sw/sw.js'),'utf8').replaceAll('__VERSION__',version));
console.log(`Staged offline pack ${version}: ${files.length} files, ${files.reduce((n,f)=>n+f.size,0)} bytes`);
