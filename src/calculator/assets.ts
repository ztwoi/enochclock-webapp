import type {EphemerisFile} from './engine/ephemeris';
import type {Download} from './protocol';
/** A few at a time: enough to fill the link on a high-latency connection, few enough not to starve the page's own requests. */
const PARALLEL=4;
/** Verified ephemeris files kept on the device. Names are pinned to their SHA-256, so one cache serves every build. */
const EPHE_CACHE='enoch-ephe-v1';
export type Pin={name:string;sha256:string;size?:number};
export type Progress=(message:string,download?:Download)=>void;
/** Where verified files are kept: match looks in every cache (the offline pack's too), put and delete only in our own. */
export interface Store {match(url:string):Promise<Response|undefined>;put(url:string,response:Response):Promise<void>;delete(url:string):Promise<boolean>}
export async function openStore():Promise<Store|null>{
 try {
  if(!globalThis.caches)return null;
  const own=await caches.open(EPHE_CACHE);
  return {match:url=>caches.match(url),put:(url,response)=>own.put(url,response),delete:url=>own.delete(url)};
 } catch {return null;}   // storage refused (private mode, quota): download every time
}
const hex=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),n=>n.toString(16).padStart(2,'0')).join('');
const mb=(b:number)=>(b/1048576).toFixed(1);
/** Read a body to the end, counting its bytes as they arrive. */
async function read(response:Response,arrived:(n:number)=>void):Promise<Uint8Array>{
 if(!response.body){const b=new Uint8Array(await response.arrayBuffer());arrived(b.length);return b;}
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let n=0;
 for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);n+=value.length;arrived(value.length);}
 const out=new Uint8Array(n);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}
 return out;
}
/** The pinned files, in pin order: from the device when a kept copy still matches its hash, otherwise downloaded, checked against
 * its hash (a mismatch fails, never falls back) and kept. Progress counts the bytes still to download. */
export async function loadFiles(pins:ReadonlyArray<Pin>,base:string,progress:Progress,fetcher:typeof fetch=fetch,store:Store|null=null):Promise<EphemerisFile[]> {
 const files=new Array<EphemerisFile>(pins.length),url=(pin:Pin)=>new URL(`ephe/${pin.name}`,base).href,todo:number[]=[];
 for(let k=0;k<pins.length;k++){
  const pin=pins[k],kept=await store?.match(url(pin)).catch(()=>undefined);
  if(kept){
   const bytes=new Uint8Array(await kept.arrayBuffer());
   if(await hex(bytes)===pin.sha256.toLowerCase()){files[k]={...pin,bytes};continue;}
   await store!.delete(url(pin)).catch(()=>false);   // damaged on the device: download it again
  }
  todo.push(k);
 }
 if(!todo.length)return files;
 const total=todo.reduce((n,k)=>n+(pins[k].size??0),0);
 let done=0,next=0,failed=false;
 const say=()=>progress(total?`Downloading the Swiss Ephemeris for this era · ${mb(done)} of ${mb(total)} MB`:'Downloading the Swiss Ephemeris for this era…',{done,total});
 say();
 async function worker(){
  while(!failed&&next<todo.length){
   const k=todo[next++],pin=pins[k];
   try {
    const response=await fetcher(url(pin));
    if(!response.ok)throw Error(`Ephemeris file ${pin.name} unavailable (HTTP ${response.status})`);
    const bytes=await read(response,n=>{done+=n;say();});
    if(await hex(bytes)!==pin.sha256.toLowerCase())throw Error(`SHA-256 mismatch: ${pin.name}`);
    files[k]={...pin,bytes};
    await store?.put(url(pin),new Response(bytes as Uint8Array<ArrayBuffer>)).catch(()=>undefined);   // not kept (quota): downloaded again next time
   } catch(e) {failed=true;throw e;}   // the others finish their file and stop
  }
 }
 await Promise.all(Array.from({length:Math.min(PARALLEL,todo.length)},worker));
 return files;
}
