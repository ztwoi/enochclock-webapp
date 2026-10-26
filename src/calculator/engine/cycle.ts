import {fields,mod,yearNumber,enochDate,daycountForEnochDate,isoDate,jdnToGregorian,JDN_OFFSET,monthDay} from './calendar';
import definitions from './generated/definitions.json';
export const cycleDefinition=definitions.cycle;
export const civil=(d:number)=>isoDate(jdnToGregorian(d-JDN_OFFSET));
export const cycleIndex=(d:number)=>fields(d).cycle_index;
export function cycle(index:number){
 const a=index*107016-3,b=a+107016-1;
 const day1s:number[]=[];
 for(let d=a;d<=b;d++)if(fields(d).solar_doy===1&&fields(d-1).solar_doy!==1)day1s.push(d);
 const first=yearNumber(day1s[0]);
 const holds=Array.from({length:364},(_,k)=>{
  const d=a+k*294,e=enochDate(d);
  return {n:k+1,daycount:d,civil_date:civil(d),enoch_date:e.iso,position:e.solar_doy,cycle_year:e.year-first+1};
 });
 return {ordinal:index+1,index,start_daycount:a,end_daycount:b,start_date:civil(a),end_date:civil(b),next_cycle_first_hold:{daycount:b+1,civil_date:civil(b+1)},years:day1s.length,first_enoch_year:first,last_enoch_year:yearNumber(day1s.at(-1)!),first_day1_date:civil(day1s[0]),holds};
}
// The first annual Day 1 is found on the same day grid as core.day1_days.
function firstYear(index:number){
 const a=index*107016-3;
 for(let d=a;d<a+367;d++)if(fields(d).solar_doy===1&&fields(d-1).solar_doy!==1)return yearNumber(d);
 throw Error('cycle has no first Day 1');
}
export function yearOfCycle(d:number):[number,number]{
 const y=yearNumber(d),idx=cycleIndex(daycountForEnochDate(y,1,1));
 return [idx+1,y-firstYear(idx)+1];
}
export function cycleDay(d:number){
 const f=fields(d),[ordinal,year]=yearOfCycle(d),k=mod(d+3,294),done=f.shift-f.cycle_index*364+1;
 const [um,ud]=monthDay(mod(d,364)+1);
 return {corrections_since_epoch:f.shift,span_cycle:f.cycle_index+1,cycle:ordinal,cycle_year:year,cycle_year_364:f.cycle_year,correction_day:k+1,correction_42:Math.floor(k/42)+1,correction_6:Math.floor(mod(k,42)/6)+1,correction_day_of_6:mod(k,6)+1,days_to_next_hold:294-k,holds_done_in_cycle:done,holds_remaining_in_cycle:364-done,uncorrected_doy:mod(d,364)+1,uncorrected_month:um,uncorrected_day:ud};
}
