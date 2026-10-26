import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CalculatorClient} from '../src/calculator/client';
const request = {kind:'instant' as const, jd:2460000, site:{lat:32,lon:35,elev:0,tz:'UTC',name:'test',source:'preset' as const}};
for(const mode of ['error','messageerror','post','timeout']) test(`worker ${mode} settles pending work`,async()=>{
 const w=new Port(),c=new CalculatorClient(w,'',()=>{},20);
 if(mode==='post')w.postMessage=()=>{throw Error('post failed');};
 const p=c.request(request),rejected=assert.rejects(p);
 if(mode==='error')w.onerror?.({message:'crashed'});
 if(mode==='messageerror')w.onmessageerror?.();
 await rejected;assert.equal(w.stopped,true);
});
test('job refusal does not poison later jobs',async()=>{
 const w=new Port(),c=new CalculatorClient(w);
 const p=c.request(request),rejected=assert.rejects(p,/polar/);
 w.reply({type:'error',id:1,message:'polar'});await rejected;
 const q=c.request(request);w.reply({type:'result',id:2,value:{part:3}});
 assert.equal((await q).part,3);c.dispose();
});
class Port {
 onmessage: ((e: {data: unknown}) => void) | null = null;
 onerror: ((e: {message: string}) => void) | null = null;
 onmessageerror: (() => void) | null = null;
 sent: any[] = []; stopped = false;
 postMessage(x: unknown) { this.sent.push(x); }
 terminate() { this.stopped = true; }
 reply(data: unknown) { this.onmessage?.({data}); }
}
test('jobs resolve by id, not response order; disposed jobs reject', async () => {
 const w = new Port(), c = new CalculatorClient(w);
 const request = {kind:'instant' as const, jd:2460000, site:{lat:32,lon:35,elev:0,tz:'UTC',name:'test',source:'preset' as const}};
 const a = c.request(request), b = c.request(request);
 w.reply({type:'result',id:w.sent[1].id,value:{part:2}});
 w.reply({type:'result',id:w.sent[0].id,value:{part:1}});
 assert.equal((await a).part,1); assert.equal((await b).part,2);
 const pending = c.request(request); c.dispose();
 await assert.rejects(pending,/disposed/); assert.equal(w.stopped,true);
 await assert.rejects(c.request(request),/disposed/);
});
