import {StrictSwiss, type EphemerisFile} from './engine/ephemeris';
import {computeAlmanac} from './engine/almanac';
import {computeInstant} from './engine/instant';
import {loadFiles, openStore, type Pin, type Store} from './assets';
import {filesFor, missingFile} from './eras';
import type {Job} from './protocol';
declare const EPHEMERIS_PINS: Required<Pin>[];
const PINS = new Map(EPHEMERIS_PINS.map(p => [p.name, p]));
const scope = globalThis as unknown as {onmessage:(e:MessageEvent<Job>)=>void; postMessage:(v:unknown)=>void};
let queue=Promise.resolve();
const progress=(message:string,download?:{done:number;total:number})=>scope.postMessage({type:'progress',message,download});
// Only the eras asked for are loaded (two files each); the engine is rebuilt over every file loaded so far when a new era
// arrives, so moving back and forth across a boundary does not download or rebuild again.
const loaded=new Map<string,EphemerisFile>();
let engine:StrictSwiss|undefined,store:Promise<Store|null>|undefined;
function drop(){engine?.close();engine=undefined;}
async function engineWith(names:string[],base:string):Promise<StrictSwiss>{
 const missing=names.filter(n=>PINS.has(n)&&!loaded.has(n));
 if(missing.length){
  store??=openStore();
  for(const f of await loadFiles(missing.map(n=>PINS.get(n)!),base,progress,fetch,await store))loaded.set(f.name,f);
  drop();
 }
 if(!engine){progress('Starting the calculator…');engine=await StrictSwiss.create([...loaded.values()]);}
 return engine;
}
// Serialize across initialization as well as calculation: Swiss has mutable C caches.
scope.onmessage=({data:job})=>{
 queue=queue.then(async()=>{
  try {
   const r=job.request,s=r.site;
   if(!Number.isFinite(s.lat)||Math.abs(s.lat)>90||!Number.isFinite(s.lon)||Math.abs(s.lon)>180||!Number.isFinite(s.elev)||s.elev < -500||s.elev>9000) throw Error('Invalid observer coordinates/elevation');
   if(!s.tz||s.tz.length>64) throw Error('Invalid timezone');
   new Intl.DateTimeFormat('en',{timeZone:s.tz});
   const names=filesFor(r),place={lat:s.lat,lon:s.lon,elevation:s.elev};
   for(let attempt=0;;attempt++){
    const swe=await engineWith(names,job.assetBase);
    progress(r.kind==='year'?'Calculating the year…':'Calculating…');
    try {
     const value=r.kind==='year'?computeAlmanac(swe,r.selector,place,s.tz):computeInstant(swe,r.jd,place,s.tz);
     scope.postMessage({type:'result',id:job.id,value});
     break;
    } catch(e) {
     const message=e instanceof Error?e.message:String(e),name=missingFile(message);
     // A strict-Swiss refusal can leave fallback positions cached in the engine: never reuse it.
     if(/^Strict Swiss/.test(message))drop();
     // Swiss named a file this era's selection did not include (tests/calculator-eras.test.ts says it should not): add it, once.
     if(attempt<2&&name&&PINS.has(name)&&!loaded.has(name)){names.push(name);continue;}
     throw e;
    }
   }
  } catch(e) {
   scope.postMessage({type:'error',id:job.id,message:e instanceof Error?e.message:String(e)});
  }
 });
};
