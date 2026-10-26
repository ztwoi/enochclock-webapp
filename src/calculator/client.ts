import type {Download, Job, Reply, Request, Result, WorkerPort} from './protocol';
/** Single owned worker; every pending promise settles on disposal or failure. */
export class CalculatorClient {
 private serial = 0;
 private stopped = false;
 private pending = new Map<number, {resolve:(v:any)=>void; reject:(e:Error)=>void; timer:ReturnType<typeof setTimeout>}>();
 constructor(private worker:WorkerPort, private assetBase='', private progress:(message:string,download?:Download)=>void=()=>{}, private timeout=180000) {
  worker.onmessage = ({data}:MessageEvent<Reply>) => {
   if (this.stopped) return;
   if (data.type==='progress') { this.progress(data.message,data.download); return; }
   const job=this.pending.get(data.id); if (!job) return;
   clearTimeout(job.timer); this.pending.delete(data.id);
   if(data.type==='error') job.reject(new Error(data.message)); else job.resolve(data.value);
  };
  worker.onerror = e => this.dispose(new Error(`Calculator worker failed: ${e.message}`));
  worker.onmessageerror = () => this.dispose(new Error('Calculator worker message could not be decoded'));
 }
 request<R extends Request>(request:R):Promise<Result<R>> {
  if(this.stopped) return Promise.reject(new Error('Calculator worker disposed'));
  return new Promise((resolve,reject)=>{
   const id=++this.serial;
   const timer=setTimeout(()=>this.dispose(new Error('Local calculation timed out; reload to retry')),this.timeout);
   this.pending.set(id,{resolve,reject,timer});
   try {this.worker.postMessage({id,request,assetBase:this.assetBase} satisfies Job);}
   catch(e) {this.dispose(e instanceof Error ? e : new Error(String(e)));}
  });
 }
 dispose(reason=new Error('Calculator worker disposed')) {
  if(this.stopped) return;
  this.stopped=true; this.worker.terminate();
  this.worker.onmessage=null; this.worker.onerror=null; this.worker.onmessageerror=null;
  for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(reason);}
  this.pending.clear();
 }
}
