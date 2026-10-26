import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOffline,type Ops,type OfflineState} from '../src/pwa/controller';

function ops(over:Partial<Ops>={}):Ops&{log:string[]}{
 const log:string[]=[];
 return {log,isInstalled:()=>false,canInstall:()=>true,
  install:async(progress)=>{log.push('install');progress(50,100);progress(100,100);},
  activate:async()=>{log.push('activate');},controlled:async()=>{log.push('controlled');},remove:async()=>{log.push('remove');},
  watchUpdate:async()=>{},behind:async()=>false,size:async()=>100,reload:()=>{log.push('reload');},...over};
}
const kinds=(o:ReturnType<typeof createOffline>)=>{const seen:string[]=[];o.subscribe(s=>seen.push(s.kind));return seen;};

test('hidden where install is impossible; idle where it is possible; installed when the flag is set',()=>{
 assert.equal(createOffline(ops({canInstall:()=>false})).state.kind,'hidden');
 assert.equal(createOffline(ops()).state.kind,'idle');
 assert.equal(createOffline(ops({isInstalled:()=>true})).state.kind,'installed');
});

test('the pack size is learned only when asked for, once, and never by an installed device',async()=>{
 let asked=0;const p=ops({size:async()=>{asked++;return 100;}});
 const o=createOffline(p);o.start();await new Promise(r=>setTimeout(r));
 assert.equal(asked,0,'start does not ask');assert.deepEqual(o.state,{kind:'idle'});
 o.loadSize();o.loadSize();await new Promise(r=>setTimeout(r));
 assert.equal(asked,1);assert.deepEqual(o.state,{kind:'idle',bytes:100});
 o.loadSize();await new Promise(r=>setTimeout(r));assert.equal(asked,1,'known: not asked again');
 let installedAsked=0;
 const i=createOffline(ops({isInstalled:()=>true,size:async()=>{installedAsked++;return 1;}}));i.start();i.loadSize();await new Promise(r=>setTimeout(r));
 assert.equal(installedAsked,0);
});

test('an installed device still learns of a newer build, without the size or the manifest',async()=>{
 let waiting:()=>void=()=>{};
 const o=createOffline(ops({isInstalled:()=>true,watchUpdate:async(f)=>{waiting=f;},size:async()=>{throw Error('not asked');}}));
 o.start();await new Promise(r=>setTimeout(r));assert.equal(o.state.kind,'installed');
 waiting();assert.equal(o.state.kind,'update');
 const behind=createOffline(ops({isInstalled:()=>true,behind:async()=>true}));behind.start();await new Promise(r=>setTimeout(r));
 assert.equal(behind.state.kind,'update');
});

test('install reports progress, takes over a waiting worker, waits for control, then is installed — in place, no reload',async()=>{
 const p=ops(),o=createOffline(p),seen=kinds(o);
 await o.install();
 assert.deepEqual(seen,['idle','installing','installing','installing','installed']);
 assert.deepEqual(p.log,['install','activate','controlled']);
 assert.equal(o.state.kind,'installed');
});

test('a failed install shows the message and can be retried',async()=>{
 let fail=true;const o=createOffline(ops({install:async()=>{if(fail)throw new Error('semo_00.se1 failed verification');}}));
 await o.install();
 assert.deepEqual(o.state,{kind:'error',message:'semo_00.se1 failed verification',during:'install'});
 fail=false;await o.retry();
 assert.equal(o.state.kind,'installed');
});

test('cancel aborts the download and returns to idle without an error',async()=>{
 let signal!:AbortSignal;
 const o=createOffline(ops({install:(_,s)=>{signal=s;return new Promise((_,reject)=>s.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));}}));
 const done=o.install();
 assert.equal(o.state.kind,'installing');
 o.cancel();await done;
 assert.equal(signal.aborted,true);assert.equal(o.state.kind,'idle');
});

test('remove returns to idle',async()=>{
 const p=ops({isInstalled:()=>true}),o=createOffline(p);
 await o.remove();assert.equal(o.state.kind,'idle');assert.deepEqual(p.log,['remove']);
});

test('a waiting build makes an installed device "update"; updating installs, activates, then reloads',async()=>{
 const p=ops({isInstalled:()=>true,watchUpdate:async(cb)=>cb()}),o=createOffline(p);
 o.start();await new Promise(r=>setTimeout(r));
 assert.equal(o.state.kind,'update');
 await o.update();
 assert.deepEqual(p.log,['install','activate','reload']);
});

test('a failed update keeps the device installed and retries as an update',async()=>{
 let fail=true;
 const p=ops({isInstalled:()=>true,watchUpdate:async(cb)=>cb(),install:async()=>{if(fail)throw new Error('offline');}}),o=createOffline(p);
 o.start();await new Promise(r=>setTimeout(r));
 await o.update();
 assert.deepEqual(o.state,{kind:'error',message:'offline',during:'update'});
 fail=false;await o.retry();
 assert.deepEqual(p.log,['activate','reload']);
});

test('install is ignored while one is running or once installed',async()=>{
 const p=ops(),o=createOffline(p);await o.install();await o.install();
 assert.equal(p.log.filter(x=>x==='install').length,1);
 const states:OfflineState[]=[];o.subscribe(s=>states.push(s));assert.equal(states.length,1);
});

test('a device whose worker already took over but whose pack is still the old one is offered the update',async()=>{
 const o=createOffline(ops({isInstalled:()=>true,behind:async()=>true}));
 o.start();await new Promise(r=>setTimeout(r));
 assert.equal(o.state.kind,'update');
});
