/** UT instant -> equal-part sunrise day, matching enoch.almanac.instant. */
import type {StrictSwiss} from './ephemeris';
import type {Place} from './year';
import {enochDate,isoDate,jdnToGregorian,JDN_OFFSET,WEEKDAY_NAMES} from './calendar';
import {localTime} from './local';
export function computeInstant(swe:StrictSwiss,jd:number,place:Place,tz='UTC') {
 if(!Number.isFinite(jd)) throw Error('invalid Julian date');
 // Validate presentation independently of mean-solar calendar assignment.
 localTime(jd,tz);
 const geo:[number,number,number]=[place.lon,place.lat,place.elevation];
 swe.setTopo(...geo);
 function rise(start:number) {
  const r=swe.riseTrans(start,0,1,geo,1013.25,15);
  return r.status<0?null:r.jd;
 }
 const localJdn=Math.floor(jd+place.lon/360+.5),candidates:number[]=[];
 for(let back=0;back<3;back++) {
  const day=localJdn-back;
  for(let k=0;k<4;k++) {
   const r=rise(day-.5-place.lon/360+k);
   if(r===null) break;
   if(Math.floor(r+place.lon/360+.5)===day) {if(r<=jd)candidates.push(r);break;}
  }
 }
 if(!candidates.length) throw Error('No sunrise at or before requested instant');
 const start=Math.max(...candidates),eps=1e-5;
 let end:number|null=null;
 for(let k=0;k<4;k++) {
  const r=rise(start+eps+k);
  if(r===null) throw Error('No next sunrise');
  if(r>start+eps){end=r;break;}
 }
 if(end===null||end<=start) throw Error('No next sunrise');
 const jdn=Math.floor(start+place.lon/360+.5),d=jdn+JDN_OFFSET,ed=enochDate(d);
 return {kind:'enoch.instant',jd_ut:jd,enoch_date:ed.iso,weekday:WEEKDAY_NAMES[ed.weekday-1],
  corrected_doy:ed.solar_doy,daycount:d,part:18*(jd-start)/(end-start),mode:'equal',
  sunrise_jd_ut:start,next_sunrise_jd_ut:end,sunrise_local:localTime(start,tz).text,civil_date_of_day:isoDate(jdnToGregorian(jdn))};
}
