import {CalculatorClient} from './client';
import type {Download,Request,Result} from './protocol';
// Every calculation runs on this device, in one worker; there is no calculation server. The worker downloads only the era a
// request needs (two Swiss Ephemeris files, ~1.8 MB for 1800-2400) and keeps it on the device.
let client:CalculatorClient|undefined;
let onProgress:(message:string,download?:Download)=>void=()=>{};
/** What the worker is doing (downloading an era, starting, calculating), for the page to show if it wants. */
export function onCalculatorProgress(f:(message:string,download?:Download)=>void){onProgress=f;}
export function localRequest<R extends Request>(request:R):Promise<Result<R>> {
 try {
  if(!globalThis.isSecureContext || !globalThis.crypto?.subtle) throw new Error('The calculator needs a secure page (HTTPS, or localhost) to check its files: open the app at its https:// address.');
  if(!client){
   const base=new URL(import.meta.env.VITE_CALCULATOR_ASSET_BASE || `${import.meta.env.BASE_URL}calculator/`,location.href);
   if(!base.pathname.endsWith('/'))base.pathname+='/';
   client=new CalculatorClient(new Worker(new URL('worker.js',base),{type:'module'}),base.href,(message,download)=>onProgress(message,download));
  }
  return client.request(request);
 } catch(e){return Promise.reject(e);}
}
export function disposeCalculator(){client?.dispose();client=undefined;}
// pagehide also fires for BFCache: pageshow can create a new worker on demand.
window.addEventListener('pagehide',disposeCalculator);
