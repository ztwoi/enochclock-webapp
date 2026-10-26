/** Static transcriptions are generated from the versioned Charles text, not year answers. */
import text from './generated/text.json';
export const book=text;
export function course(month:number){return book.course[month-1];}
export function textDayParts(month:number,day:number,length:number){
 const start=month>1?course(month-1).day_parts_end:book.opening_day_parts;
 return start+(course(month).day_parts_end-start)*day/length;
}
export interface PortalMonth {month:number;start_date:string;next_boundary_date:string;start_azimuth_deg:number;next_azimuth_deg:number;azimuth_range_deg:number[]}
export function portals(months:PortalMonth[]){
 const out=Array.from({length:6},(_,i)=>{
  const passes=months.filter(m=>course(m.month).portal===i+1).map(m=>({month:m.month,verse:course(m.month).verse,az_start:m.start_azimuth_deg,az_end:m.next_azimuth_deg,az_range:m.azimuth_range_deg,start_date:m.start_date,end_date:m.next_boundary_date}));
  const lo=passes.map(p=>p.az_range[0]),hi=passes.map(p=>p.az_range[1]);
  return {portal:i+1,passes,union:[Math.min(...lo),Math.max(...hi)],common:[Math.max(...lo),Math.min(...hi)],seam_deg:[Math.abs(lo[0]-lo[1]),Math.abs(hi[0]-hi[1])]};
 });
 for(const [outer,inner] of [[out[0],out[1]],[out[5],out[4]]]){
  const side=outer.union[0]+outer.union[1]>inner.union[0]+inner.union[1]?1:0;
  outer.common[side]=outer.union[side];
 }
 return out;
}
