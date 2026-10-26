/** Full enoch.almanac year document; astronomy remains in StrictSwiss. */
import type {StrictSwiss} from './ephemeris';
import {computeLocalizedYear,type Place} from './year';
import {computeInstant} from './instant';
import {MONTH_LENGTHS,type YearSelector} from './calendar';
import {book,course,textDayParts,portals} from './astronomical-book';
import {cycle,cycleDay,cycleIndex,yearOfCycle,cycleDefinition} from './cycle';
import {priestCourse,priestDefinition} from './priests';
import {assess} from './accuracy';
export function computeAlmanac(swe:StrictSwiss,selector:number|YearSelector,place:Place,tz='UTC'){
 const n=computeLocalizedYear(swe,selector,place,tz);
 const rows=n.rows.map(({distance_au,...r})=>r),annual=rows.slice(0,-1);
 for(const r of rows){
  if(computeInstant(swe,r.sunrise_jd_ut+1/86400,place,tz).enoch_date!==r.enoch_date)throw Error('converter disagrees at '+r.civil_date);
  const phi=place.lat*Math.PI/180,dec=r.declination_deg*Math.PI/180,alt=r.center_true_altitude_deg*Math.PI/180;
  const geometric=Math.acos((Math.sin(dec)-Math.sin(phi)*Math.sin(alt))/(Math.cos(phi)*Math.cos(alt)))*180/Math.PI;
  if(Math.abs(geometric-r.azimuth_deg)>=1e-6&&Math.abs(360-geometric-r.azimuth_deg)>=1e-6)throw Error('azimuth geometry check failed');
 }
 if(new Set(annual.map(r=>r.corrected_doy)).size!==364)throw Error('not every calendar position is covered');
 for(let i=0;i<12;i++){
  const subset=annual.filter(r=>r.daycount>=n.bounds[i]&&r.daycount<n.bounds[i+1]);
  if(new Set(subset.map(r=>r.day)).size!==MONTH_LENGTHS[i]||subset.some(r=>r.month!==i+1))throw Error('month does not hold its corrected positions');
 }
 const extended=n.extended.map((e,i)=>{
  const r=rows[i],c=course(r.month);
  return {...e,text_day_parts:textDayParts(r.month,r.day,MONTH_LENGTHS[r.month-1]),portal:c.portal,verse:c.verse,...cycleDay(e.daycount),...priestCourse(e.daycount)};
 });
 const west=n.months.map((m,i)=>{
  const a=n.bounds[i]-n.bounds[0],b=n.bounds[i+1]-n.bounds[0],span=extended.slice(a,b+1).map(e=>e.sunset_azimuth_deg);
  return {...m,start_azimuth_deg:extended[a].sunset_azimuth_deg,next_azimuth_deg:extended[b].sunset_azimuth_deg,azimuth_range_deg:[Math.min(...span),Math.max(...span)]};
 });
 const indices=[...new Set([cycleIndex(n.bounds[0]),cycleIndex(n.bounds[12]),yearOfCycle(n.bounds[0])[0]-1])].sort((a,b)=>a-b);
 return {schema_version:1,kind:'enoch.year',provenance:{bearing_convention:'degrees clockwise from true north; east = 90',time_scale:'UT (Swiss Ephemeris sunrise API)',civil_labels:'proleptic Gregorian; civil_date is the mean-solar date of the sunrise',layers:{computed:'Swiss Ephemeris (strict SWIEPH)',calendar:'proleptic Enoch calendar from a fixed epoch',textual:book.edition,derived:'day-part interpolation; portal spans'}},
  calculation:{year_beginning_gregorian:n.year,enoch_year:n.enoch_year,latitude:place.lat,longitude_east:place.lon,elevation_m:place.elevation,timezone:tz,pressure_hpa:1013.25,temperature_c:15,sunrise_definition:'upper limb with standard refraction; level horizon; no terrain mask',
   // The Swiss Ephemeris version compiled into the pinned WASM.
   swiss_version:'2.10.03',annual_samples:annual.length,including_closing_boundary_samples:rows.length,start_date:annual[0].civil_date,closing_boundary_date:rows.at(-1)!.civil_date,months:n.months,
   northernmost_daily_sample:annual.reduce((a,b)=>b.azimuth_deg<a.azimuth_deg?b:a),southernmost_daily_sample:annual.reduce((a,b)=>b.azimuth_deg>a.azimuth_deg?b:a),equinox_local:n.equinox_local,equinox_morning_sunrise_azimuth_deg:n.equinox_morning_sunrise_azimuth_deg,equinox_root_residual_deg:n.equinox_root_residual_deg,
  },
  rows,extended,portals:portals(n.months),accuracy:assess(swe,n.year,n.bounds[0],rows[0].sunrise_jd_ut,n.equinox_jd_ut,annual.length),portals_west:portals(west),text:structuredClone(book),priests:structuredClone(priestDefinition),cycle:{definition:{...cycleDefinition},cycles:indices.map(cycle)}};
}
