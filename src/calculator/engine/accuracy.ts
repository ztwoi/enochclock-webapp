/** Independent primary TT table supplies scientific accuracy, never UT calendar dates. */
import primary from './generated/primary.json';
import type {StrictSwiss} from './ephemeris';
const rows=primary.rows,first=rows[0][0],last=rows.at(-1)![0],MEAN=107016/293;
const byYear=(y:number)=>y>=first&&y<=last?rows[y-first]:undefined;
function bestSpan(){
 let best={years:0,first_year:0,last_year:0},start:number|null=null;
 for(let k=0;k<=rows.length;k++){
  const ok=k<rows.length&&Math.abs(rows[k][3])<=1.5;
  if(ok&&start===null)start=k;
  if(!ok&&start!==null){if(k-start>best.years)best={years:k-start,first_year:rows[start][0],last_year:rows[k-1][0]};start=null;}
 }
 return best;
}
const span=bestSpan();
const humanYear=(y:number)=>y<=0?`${1-y} BCE`:`${y}`;
// Python %.0f uses round-to-even, unlike Math.round.
function whole(x:number){const n=Math.floor(x);return String(x-n===.5?n+(n%2):Math.round(x));}
function duration(seconds:number){const s=Math.abs(seconds);return s<120?`${whole(s)} s`:s<7200?`${whole(s/60)} min`:s<172800?`${(s/3600).toFixed(1)} h`:`${(s/86400).toFixed(1)} days`;}
export function assess(swe:StrictSwiss,year:number,daycount:number,sunrise:number,equinox:number,yearDays:number){
 let row=byYear(year);
 if(!row||row[1]!==daycount)row=rows.reduce((a,b)=>Math.abs(b[1]-daycount)<Math.abs(a[1]-daycount)?b:a);
 const [y,,eq,offset]=row,nxt=byYear(y+1),lo=byYear(Math.max(first,y-50))!,hi=byYear(Math.min(last,y+50))!;
 const mean=(hi[2]-lo[2])/(hi[0]-lo[0]),drift=(MEAN-mean)*1000,dt=swe.deltat(sunrise)*86400,t=(y-1820)/100,sigma=.8*t*t;
 const aligned=Math.abs(offset)<=1.5,clock=sigma<=3600,reasons:{key:string;title:string;detail:string}[]=[];
 if(!aligned)reasons.push({key:'alignment',title:'Day 1 is off the equinox',detail:`Day 1 falls ${Math.abs(offset).toFixed(2)} days ${offset>0?'after':'before'} the March equinox, beyond ±1.5 days. The calendar holds within ±1.5 days from ${humanYear(span.first_year)} to ${humanYear(span.last_year)} (${span.years.toLocaleString('en-US')} years); outside that span the year-length drift below has built up.`});
 reasons.push({key:'year_length',title:'Year length',detail:`The calendar's average year is ${MEAN.toFixed(5)} days (107,016 days in 293 years). The equinox year here averages ${mean.toFixed(5)} days, so each calendar year is ${duration((MEAN-mean)*86400)} ${drift>0?'longer':'shorter'}: Day 1 drifts ${Math.abs(drift).toFixed(2)} days ${drift>0?'later':'earlier'} per thousand years.`});
 reasons.push({key:'whole_days',title:'Whole days',detail:`Day 1 can only fall on a whole day, and a correction day comes every 294 days, so this year is ${yearDays} days and Day 1 wobbles by up to about a day around its average even where the average is right.`});
 if(!clock)reasons.push({key:'delta_t',title:"Earth's rotation (ΔT)",detail:`The calendar counts sunrises, which follow Earth's slowing spin; the equinox is computed in uniform time. Here they differ by ΔT = ${duration(dt)}, itself uncertain by about ±${duration(sigma)} (${y< -700?'an extrapolation: before the observational record':y>2100?'an extrapolation: the future rotation of the Earth':'from historical records'}), so sunrise clock times are model estimates and the day a civil date names can be uncertain.`});
 return {within_bounds:aligned&&clock,bounds:{alignment_days:1.5,delta_t_sigma_s:3600,best_span:{...span}},day1_offset_days:offset,day1_year:y,day1_sunrise_minus_equinox_ut_days:sunrise-equinox,calendar_mean_year_days:MEAN,equinox_year_days:nxt?nxt[2]-eq:null,mean_equinox_year_days:mean,mean_equinox_year_span:[lo[0],hi[0]],drift_days_per_millennium:drift,calendar_year_days:yearDays,delta_t_s:dt,delta_t_sigma_s:sigma,reasons,source:'TT equinoxes (primary analysis); Swiss Ephemeris ΔT; σ(ΔT) ≈ 0.8·t² s'};
}
