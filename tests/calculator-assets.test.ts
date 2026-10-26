import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadFiles, type Store} from '../src/calculator/assets';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const bytes=new Uint8Array([1,2,3]),file={name:'sepl_18.se1',sha256:sha(bytes),size:3};
/** An in-memory Cache Storage stand-in. */
function memoryStore(){
 const m=new Map<string,Uint8Array>();
 const store:Store={match:async u=>m.has(u)?new Response(m.get(u)! as Uint8Array<ArrayBuffer>):undefined,put:async(u,r)=>void m.set(u,new Uint8Array(await r.arrayBuffer())),delete:async u=>m.delete(u)};
 return {m,store};
}
test('asset loader rejects missing assets explicitly and never calls an API',async()=>{
 const calls:string[]=[];
 await assert.rejects(loadFiles([file],'https://example.org/calc/',()=>{},async(url)=>{calls.push(String(url));return new Response('missing',{status:404});}),/sepl_18.se1.*404/);
 assert.deepEqual(calls,['https://example.org/calc/ephe/sepl_18.se1']);
});
test('asset loader checks every download against its pinned hash and reports bytes',async()=>{
 const notes:{message:string;download?:{done:number;total:number}}[]=[];
 const files=await loadFiles([file],'https://example.org/calc/',(message,download)=>notes.push({message,download}),async()=>new Response(bytes));
 assert.deepEqual(files,[{...file,bytes}]);
 assert.deepEqual(notes.at(0)?.download,{done:0,total:3});
 assert.deepEqual(notes.at(-1)?.download,{done:3,total:3});
 assert.match(notes.at(-1)!.message,/Downloading the Swiss Ephemeris/);
 await assert.rejects(loadFiles([{...file,sha256:'a'.repeat(64)}],'https://example.org/calc/',()=>{},async()=>new Response(bytes)),/SHA-256 mismatch: sepl_18.se1/);
});
test('verified files are kept on the device and not downloaded again; a damaged copy is replaced',async()=>{
 const {m,store}=memoryStore();let calls=0;
 const fetcher=async()=>{calls++;return new Response(bytes);};
 await loadFiles([file],'https://example.org/calc/',()=>{},fetcher,store);
 assert.equal(calls,1);assert.deepEqual(m.get('https://example.org/calc/ephe/sepl_18.se1'),bytes);
 const notes:string[]=[];
 const again=await loadFiles([file],'https://example.org/calc/',s=>notes.push(s),fetcher,store);
 assert.equal(calls,1,'served from the device');assert.deepEqual(again[0].bytes,bytes);assert.deepEqual(notes,[],'nothing to say when nothing downloads');
 m.set('https://example.org/calc/ephe/sepl_18.se1',new Uint8Array([9]));
 const repaired=await loadFiles([file],'https://example.org/calc/',()=>{},fetcher,store);
 assert.equal(calls,2,'downloaded again');assert.deepEqual(repaired[0].bytes,bytes);assert.deepEqual(m.get('https://example.org/calc/ephe/sepl_18.se1'),bytes);
});
test('a file that fails its hash is never kept',async()=>{
 const {m,store}=memoryStore();
 await assert.rejects(loadFiles([{...file,sha256:'a'.repeat(64)}],'https://example.org/calc/',()=>{},async()=>new Response(bytes),store),/SHA-256 mismatch/);
 assert.equal(m.size,0);
});
test('asset loader downloads several at once, returns pin order, and stops after a failure',async()=>{
 const body=(k:number)=>new Uint8Array([k]);
 const pins=Array.from({length:10},(_,k)=>({name:`f${k}.se1`,sha256:sha(body(k)),size:1}));
 let live=0,peak=0;
 const files=await loadFiles(pins,'https://example.org/calc/',()=>{},async(url)=>{const k=pins.findIndex(p=>String(url).endsWith(p.name));live++;peak=Math.max(peak,live);await new Promise(r=>setTimeout(r,(10-k)*2));live--;return new Response(body(k));});
 assert.deepEqual(files.map(f=>f.name),pins.map(p=>p.name));assert.deepEqual(files.map(f=>f.bytes[0]),pins.map((_,k)=>k));
 assert.ok(peak>1&&peak<=4,`peak ${peak}`);
 let calls=0;
 await assert.rejects(loadFiles(pins,'https://example.org/calc/',()=>{},async()=>{calls++;return new Response('x',{status:500});}),/HTTP 500/);
 assert.ok(calls<=4,`calls ${calls}`);
});
