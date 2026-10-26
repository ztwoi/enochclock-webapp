import type {StrictSwiss} from './ephemeris';
import {enochDate,selectYear,JDN_OFFSET,jdnToGregorian,isoDate,mod,MONTH_LENGTHS,WEEKDAY_NAMES,type YearSelector} from './calendar';
import {localTime} from './local';
interface YearRow {
 daycount:number;civil_date:string;enoch_date:string;month:number;day:number;corrected_doy:number;
 sunrise_jd_ut:number;azimuth_deg:number;north_of_east_deg:number;center_true_altitude_deg:number;
 declination_deg:number;distance_au:number;returned_flags:number;closing_boundary:boolean;
}
export interface Place {lat:number;lon:number;elevation:number}
const SWISS=2,SPEED=256,EQUATORIAL=2048,TOPO=32768;
const PRESSURE=1013.25,TEMPERATURE=15;
function localYmd(jd:number,tz:string):[number,number,number] {
 return localTime(jd,tz).ymd;
}
/** Add almanac-compatible local labels without claiming the full enoch.year schema. */
export function computeLocalizedYear(swe:StrictSwiss,selector:number|YearSelector,place:Place,tz='UTC') {
 const numeric=computeYear(swe,selector,place,tz);
 const rows=numeric.rows.map(r=>({...r,sunrise_local:localTime(r.sunrise_jd_ut,tz).text}));
 return {...numeric,kind:'enoch.localized-numerical-year',rows,
  extended:numeric.extended.map(r=>({...r,sunset_local:localTime(r.sunset_jd_ut,tz).text})),
  months:numeric.months.map((m,i)=>({...m,start_local:rows[numeric.bounds[i]-numeric.bounds[0]].sunrise_local})),
  equinox_local:localTime(numeric.equinox_jd_ut,tz).text};
}
function computeYear(swe:StrictSwiss,selector:number|YearSelector,place:Place,tz='UTC') {
 const {enoch_year,bounds,year}=selectYear(typeof selector==='number'?{year:selector}:selector);
 if(![place.lat,place.lon,place.elevation].every(Number.isFinite)||Math.abs(place.lat)>90||Math.abs(place.lon)>180) throw Error('invalid place');
 // Validate timezone before performing ephemeris work.
 new Intl.DateTimeFormat('en-US',{timeZone:tz});
 const geo:[number,number,number]=[place.lon,place.lat,place.elevation];
 swe.setTopo(...geo);
 function event(jdn:number,rsmi:number):number {
  for(let k=0;k<4;k++) {
   const r=swe.riseTrans(jdn-.5-place.lon/360+k,0,rsmi,geo,PRESSURE,TEMPERATURE);
   if(r.status<0||r.jd===null) throw Error('No solar horizon event on requested date');
   if(Math.floor(r.jd+place.lon/360+.5)===jdn) return r.jd;
  }
  throw Error('No solar horizon event on requested date');
 }
 function horizontal(jd:number,speed:boolean) {
  const {values,flags}=swe.calcUt(jd,0,SWISS|EQUATORIAL|TOPO|(speed?SPEED:0));
  if(!(flags&TOPO)) throw Error('topocentric flag missing');
  const [az,h]=swe.azalt(jd,1,geo,PRESSURE,TEMPERATURE,values.slice(0,3));
  return {az:mod(az+180,360),h,values,flags};
 }
 const rows:YearRow[]=[],extended=[];
 for(let d=bounds[0];d<=bounds[12];d++) {
  const ed=enochDate(d),jdn=d-JDN_OFFSET,date=jdnToGregorian(jdn),rise=event(jdn,1),r=horizontal(rise,true),set=event(jdn,2),s=horizontal(set,false);
  const hours=(set-rise)*24;
  rows.push({daycount:d,civil_date:isoDate(date),enoch_date:ed.iso,month:ed.month,day:ed.day,corrected_doy:ed.solar_doy,
   sunrise_jd_ut:rise,azimuth_deg:r.az,north_of_east_deg:90-r.az,center_true_altitude_deg:r.h,declination_deg:r.values[1],distance_au:r.values[2],returned_flags:r.flags,closing_boundary:d===bounds[12]});
  extended.push({daycount:d,sunset_jd_ut:set,sunset_azimuth_deg:s.az,day_hours:hours,day_parts:hours*18/24,
   hold:rows.length>1&&rows[rows.length-2].corrected_doy===ed.solar_doy,
   moon_illuminated_fraction_at_sunset:swe.phenoUt(set,1,SWISS)[1],weekday:ed.weekday,weekday_name:WEEKDAY_NAMES[ed.weekday-1],
   local_date_differs:isoDate(localYmd(rise,tz))!==isoDate(date)});
 }
 const months=MONTH_LENGTHS.map((n,i)=>{
  const a=bounds[i]-bounds[0],b=bounds[i+1]-bounds[0],r=rows[a],e=rows[b],span=rows.slice(a,b+1).map(r=>r.azimuth_deg);
  return {month:i+1,calendar_positions:n,elapsed_sunrises:b-a,start_date:r.civil_date,start_azimuth_deg:r.azimuth_deg,next_boundary_date:e.civil_date,next_azimuth_deg:e.azimuth_deg,azimuth_range_deg:[Math.min(...span),Math.max(...span)]};
 });
 let eq=swe.julday(year,3,20,12),residual=Infinity;
 for(let i=0;i<12;i++) {
  const {values}=swe.calcUt(eq,0,SWISS|SPEED);residual=mod(values[0]+180,360)-180;
  if(Math.abs(residual)<1e-8) break;
  eq-=residual/values[3];
 }
 if(Math.abs(residual)>=1e-8) throw Error('equinox did not converge');
 const eqdate=localYmd(eq,tz),eqjdn=Math.floor(swe.julday(...eqdate,12));
 return {kind:'enoch.numerical-year',schema_version:1,enoch_year,year,place,timezone:tz,bounds,rows,extended,months,
  equinox_jd_ut:eq,equinox_root_residual_deg:residual,equinox_morning_sunrise_azimuth_deg:horizontal(event(eqjdn,1),true).az};
}
