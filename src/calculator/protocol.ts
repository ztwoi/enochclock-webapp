import type {Site, YearDoc} from '../types';
import type {YearSelector} from './engine/calendar';
import type {computeInstant} from './engine/instant';
export type Request = {kind:'year'; selector:YearSelector; site:Site} | {kind:'instant'; jd:number; site:Site};
export type Instant = ReturnType<typeof computeInstant>;
export type Result<R extends Request> = R extends {kind:'year'} ? YearDoc : Instant;
export type Job = {id:number; request:Request; assetBase:string};
/** Bytes of ephemeris downloaded so far for the current job, of the total it needs (absent when nothing is downloading). */
export type Download = {done:number; total:number};
export type Reply = {type:'progress'; message:string; download?:Download} | {type:'result'; id:number; value:YearDoc|Instant} | {type:'error'; id:number; message:string};
export interface WorkerPort {
 postMessage(message:Job):void;
 terminate():void;
 onmessage: ((event:MessageEvent<Reply>)=>void)|null;
 onerror: ((event:ErrorEvent)=>void)|null;
 onmessageerror: ((event:MessageEvent)=>void)|null;
}
