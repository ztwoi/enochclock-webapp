import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const store=new Map<string,string>();
Object.assign(globalThis,{localStorage:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v),removeItem:(k:string)=>void store.delete(k)}});
const {installPack,verifyInstalled,removePack,pruneStale}=await import('../src/pwa/install');
const KEY='enoch.offline.v1';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');

class FakeCache{items=new Map<string,Response>();
 async put(p:string,r:Response){this.items.set(p,r);}
 async match(p:string){return this.items.get(p)?.clone();}
 async keys(){return [...this.items.keys()].map(p=>({url:'https://x.test'+p}) as Request);}}
class FakeCaches{all=new Map<string,FakeCache>();
 async open(n:string){if(!this.all.has(n))this.all.set(n,new FakeCache());return this.all.get(n)!;}
 async keys(){return [...this.all.keys()];}
 async delete(n:string){return this.all.delete(n);}}

const bodies:Record<string,Uint8Array>={'/a.js':new Uint8Array([1,2,3]),'/calculator/ephe/semo_00.se1':new Uint8Array([4,5,6,7])};
const manifest={version:'v1',bytes:7,files:Object.entries(bodies).map(([path,b])=>({path,size:b.length,sha256:sha(b)}))};
function server(overrides:Record<string,()=>Response>={},log:string[]=[]){
 return async(input:RequestInfo|URL)=>{const p=String(input);log.push(p);
  if(overrides[p])return overrides[p]();
  if(p==='/offline-manifest.json')return Response.json(manifest);
  return new Response(bodies[p] as unknown as BodyInit,{headers:{'Content-Type':p.endsWith('.js')?'text/javascript':'application/octet-stream'}});};
}
const deps=(caches:FakeCaches,fetcher:typeof fetch,version='v1')=>({fetcher,caches:caches as unknown as CacheStorage,version:async()=>version});

test('install verifies every file, stores it with its content type, then sets the flag last',async()=>{
 store.clear();const caches=new FakeCaches(),seen:number[]=[];
 await installPack((d)=>{assert.equal(store.get(KEY),undefined);seen.push(d);},deps(caches,server() as typeof fetch));
 assert.equal(store.get(KEY),'1');
 const cache=await caches.open('enoch-pack-v1');
 assert.deepEqual([...cache.items.keys()].sort(),['/a.js','/calculator/ephe/semo_00.se1','/installed-manifest.json']);
 assert.equal((await cache.match('/a.js'))!.headers.get('Content-Type'),'text/javascript');
 assert.equal(seen.at(-1),7);
});

test('a tampered file fails verification, is not cached, and leaves the flag unset',async()=>{
 store.clear();const caches=new FakeCaches();
 const bad=server({'/calculator/ephe/semo_00.se1':()=>new Response(new Uint8Array([9,9,9,9]))});
 await assert.rejects(installPack(()=>{},deps(caches,bad as typeof fetch)),/semo_00.se1 failed verification/);
 assert.equal(store.get(KEY),undefined);
 assert.ok(!(await caches.open('enoch-pack-v1')).items.has('/calculator/ephe/semo_00.se1'));
});

test('an interrupted install resumes: verified files are not downloaded again',async()=>{
 store.clear();const caches=new FakeCaches();
 const down=server({'/calculator/ephe/semo_00.se1':()=>new Response('gone',{status:503})});
 await assert.rejects(installPack(()=>{},deps(caches,down as typeof fetch)),/503/);
 assert.equal(store.get(KEY),undefined);
 const log:string[]=[];
 await installPack(()=>{},deps(caches,server({},log) as typeof fetch));
 assert.deepEqual(log.filter(p=>p!=='/offline-manifest.json'),['/calculator/ephe/semo_00.se1']);
 assert.equal(store.get(KEY),'1');
});

test('install refuses when the waiting manifest is not the active worker\'s version',async()=>{
 store.clear();const caches=new FakeCaches();
 await assert.rejects(installPack(()=>{},deps(caches,server() as typeof fetch,'v0')),/reload/);
 assert.equal(store.get(KEY),undefined);assert.equal((await caches.keys()).length,0);
});

test('an update installs beside the old pack and downloads only what changed',async()=>{
 store.clear();const caches=new FakeCaches();
 await installPack(()=>{},deps(caches,server() as typeof fetch));
 const next:Record<string,Uint8Array>={...bodies,'/a.js':new Uint8Array([1,2,3,4])};
 const manifest2={version:'v2',bytes:8,files:Object.entries(next).map(([path,b])=>({path,size:b.length,sha256:sha(b)}))};
 const log:string[]=[];
 const fetch2=async(input:RequestInfo|URL)=>{const p=String(input);log.push(p);return p==='/offline-manifest.json'?Response.json(manifest2):new Response(next[p] as unknown as BodyInit);};
 await installPack(()=>{},deps(caches,fetch2 as typeof fetch,'v2'));
 assert.deepEqual(log.filter(p=>p!=='/offline-manifest.json'),['/a.js']);
 assert.deepEqual((await caches.keys()).sort(),['enoch-pack-v1','enoch-pack-v2']);       // the old pack keeps serving until the new worker takes over
 assert.equal((await caches.open('enoch-pack-v2')).items.size,3);
});

test('a reused file that no longer matches is downloaded instead of trusted',async()=>{
 store.clear();const caches=new FakeCaches();
 await installPack(()=>{},deps(caches,server() as typeof fetch));
 (await caches.open('enoch-pack-v1')).items.set('/calculator/ephe/semo_00.se1',new Response(new Uint8Array([0,0,0,0])));   // damaged at rest
 const manifest2={...manifest,version:'v2'},log:string[]=[];
 const fetch2=async(input:RequestInfo|URL)=>{const p=String(input);log.push(p);return p==='/offline-manifest.json'?Response.json(manifest2):new Response(bodies[p] as unknown as BodyInit);};
 await installPack(()=>{},deps(caches,fetch2 as typeof fetch,'v2'));
 assert.deepEqual(log.filter(p=>p!=='/offline-manifest.json'),['/calculator/ephe/semo_00.se1']);
});

test('pruning keeps only the serving and waiting versions',async()=>{
 const caches=new FakeCaches();for(const n of ['enoch-pack-v1','enoch-pack-v2','enoch-pack-v3','other'])await caches.open(n);
 await pruneStale(['v2','v3'],{caches:caches as unknown as CacheStorage});
 assert.deepEqual((await caches.keys()).sort(),['enoch-pack-v2','enoch-pack-v3','other']);
});

test('startup check keeps a whole pack and clears the flag for an incomplete or missing one',async()=>{
 store.clear();const caches=new FakeCaches();
 assert.equal(await verifyInstalled({caches:caches as unknown as CacheStorage}),false);
 await installPack(()=>{},deps(caches,server() as typeof fetch));
 assert.equal(await verifyInstalled({caches:caches as unknown as CacheStorage}),true);
 assert.equal(store.get(KEY),'1');
 (await caches.open('enoch-pack-v1')).items.delete('/a.js');                 // the browser evicted part of it
 assert.equal(await verifyInstalled({caches:caches as unknown as CacheStorage}),false);
 assert.equal(store.get(KEY),undefined);
});

test('remove clears the flag and only the pack caches',async()=>{
 store.clear();const caches=new FakeCaches();
 await installPack(()=>{},deps(caches,server() as typeof fetch));await caches.open('other-cache');
 await removePack({caches:caches as unknown as CacheStorage});
 assert.equal(store.get(KEY),undefined);assert.deepEqual(await caches.keys(),['other-cache']);
});

test('an aborted install stops, stores nothing unverified, leaves the flag unset, and a retry resumes',async()=>{
 store.clear();const caches=new FakeCaches(),ctl=new AbortController();
 const slow=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const p=String(input);
  if(p==='/offline-manifest.json')return Response.json(manifest);
  if(p==='/calculator/ephe/semo_00.se1'){ctl.abort();init?.signal?.throwIfAborted();}
  return new Response(bodies[p] as unknown as BodyInit);
 };
 await assert.rejects(installPack(()=>{},deps(caches,slow as typeof fetch),ctl.signal),/abort/i);
 assert.equal(store.get(KEY),undefined);
 const log:string[]=[];
 await installPack(()=>{},deps(caches,server({},log) as typeof fetch));
 assert.equal(store.get(KEY),'1');
});

test('a download that stops making progress fails with a clear error instead of sitting at 0%',async()=>{
 store.clear();const caches=new FakeCaches();
 const hang=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const p=String(input);
  if(p==='/offline-manifest.json')return Response.json(manifest);
  return new Promise<Response>((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
 };
 await assert.rejects(installPack(()=>{},{...deps(caches,hang as typeof fetch),stallMs:60},undefined),/stalled/);
 assert.equal(store.get(KEY),undefined);
});

test('progress moves while a file is still downloading',async()=>{
 store.clear();const caches=new FakeCaches(),seen:number[]=[];
 const chunked=async(input:RequestInfo|URL)=>{
  const p=String(input);if(p==='/offline-manifest.json')return Response.json(manifest);
  const b=bodies[p];
  return new Response(new ReadableStream({start(c){for(const x of b)c.enqueue(new Uint8Array([x]));c.close();}}));
 };
 await installPack((d)=>seen.push(d),deps(caches,chunked as typeof fetch));
 assert.ok(seen.some(d=>d>0&&d<7),'an in-between value was reported');
 assert.equal(seen.at(-1),7);assert.equal(store.get(KEY),'1');
});
