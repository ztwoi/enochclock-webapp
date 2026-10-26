/** Calendar arithmetic on integers; floor division, never truncation. */
export type Calendar = 'gregorian'|'julian'|'auto';
const REFORM_JDN=2299161;
function calendarForLabel(y:number,m:number,d:number):'gregorian'|'julian' {
 return y>1582||(y===1582&&(m>10||(m===10&&d>=15)))?'gregorian':'julian';
}
function calendarForJdn(jdn:number):'gregorian'|'julian' {
 if(!Number.isSafeInteger(jdn)) throw Error('invalid JDN');
 return jdn>=REFORM_JDN?'gregorian':'julian';
}
function resolveCalendar(calendar:Calendar,jdn?:number):'gregorian'|'julian' {
 if(calendar==='auto') return jdn===undefined?'gregorian':calendarForJdn(jdn);
 if(calendar!=='gregorian'&&calendar!=='julian') throw Error('invalid calendar');
 return calendar;
}
function julianToJdn(year:number,month:number,day:number):number {
 const lengths=[31,mod(year,4)===0?29:28,31,30,31,30,31,31,30,31,30,31];
 if(![year,month,day].every(Number.isSafeInteger)||month<1||month>12||day<1||day>lengths[month-1]!) throw Error('invalid Julian date');
 const a=Math.floor((14-month)/12),y=year+4800-a,m=month+12*a-3;
 return day+Math.floor((153*m+2)/5)+365*y+Math.floor(y/4)-32083;
}
function jdnToJulian(jdn:number):[number,number,number] {
 if(!Number.isSafeInteger(jdn)) throw Error('invalid JDN');
 const c=jdn+32082,d=Math.floor((4*c+3)/1461),e=c-Math.floor(1461*d/4),m=Math.floor((5*e+2)/153);
 return [d-4800+Math.floor(m/10),m+3-12*Math.floor(m/10),e-Math.floor((153*m+2)/5)+1];
}
function civilToJdn(y:number,m:number,d:number,calendar:Calendar='gregorian'):number {
 const used=resolveCalendar(calendar==='auto'?calendarForLabel(y,m,d):calendar);
 const jdn=used==='julian'?julianToJdn(y,m,d):gregorianToJdn(y,m,d);
 if(!Number.isSafeInteger(jdn)) throw Error('date exceeds integer precision');
 return jdn;
}
export function jdnToCivil(jdn:number,calendar:Calendar='gregorian'):[number,number,number] {
 if(!Number.isSafeInteger(jdn)) throw Error('invalid JDN');
 return resolveCalendar(calendar,jdn)==='julian'?jdnToJulian(jdn):jdnToGregorian(jdn);
}
// The epoch is set once, in epoch.json. Never hard-code it here.
import epoch from './epoch.json' with {type:'json'};
const EPOCH_JD:number = epoch.jd_tt;
export const JDN_OFFSET = -Math.floor(EPOCH_JD + .5);
const MONTH_OFFSETS = [0,30,60,91,121,151,182,212,242,273,303,333];
export const MONTH_LENGTHS = [30,30,31,30,30,31,30,30,31,30,30,31];
export const WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const mod = (a:number,b:number):number => a-Math.floor(a/b)*b;
export function fields(d:number) {
 const shift=Math.floor((d+3)/294);
 return {d,solar_doy:mod(d-shift,364)+1,weekday:mod(d+3,7)+1,shift,
 cycle_index:Math.floor((d+3)/107016),cycle_year:Math.floor(mod(d+3,107016)/364)+1};
}
export const yearNumber=(d:number):number=>Math.floor((d-Math.floor((d+3)/294))/364)+1;
export function gregorianToJdn(year:number,month:number,day:number):number {
 const leap=mod(year,4)===0&&(mod(year,100)!==0||mod(year,400)===0);
 const lengths=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(![year,month,day].every(Number.isInteger)||month<1||month>12||day<1||day>lengths[month-1]!) throw Error('invalid Gregorian date');
 const a=Math.floor((14-month)/12),y=year+4800-a,m=month+12*a-3;
 return day+Math.floor((153*m+2)/5)+365*y+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400)-32045;
}
export function jdnToGregorian(jdn:number):[number,number,number] {
 const a=jdn+32044,b=Math.floor((4*a+3)/146097),c=a-Math.floor(146097*b/4),d=Math.floor((4*c+3)/1461),e=c-Math.floor(1461*d/4),m=Math.floor((5*e+2)/153);
 return [100*b+d-4800+Math.floor(m/10),m+3-12*Math.floor(m/10),e-Math.floor((153*m+2)/5)+1];
}
export function monthDay(doy:number):[number,number] {
 if(!Number.isInteger(doy)||doy<1||doy>364) throw Error('invalid corrected day');
 for(let m=12;m>=1;m--) if(doy>MONTH_OFFSETS[m-1]!) return [m,doy-MONTH_OFFSETS[m-1]!];
 throw Error('unreachable');
}
export function enochDate(d:number) {
 const f=fields(d),[month,day]=monthDay(f.solar_doy),year=yearNumber(d);
 return {...f,year,month,day,iso:(year<0?'-':'')+String(Math.abs(year)).padStart(4,'0')+`-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
}
export function daycountForEnochDate(year:number,month:number,day:number):number {
 if(!Number.isSafeInteger((year-1)*364*294)) throw Error('invalid Enoch year: exceeds integer precision');
 if(![year,month,day].every(Number.isInteger)||month<1||month>12||day<1||day>MONTH_LENGTHS[month-1]!) throw Error('invalid Enoch date');
 const target=MONTH_OFFSETS[month-1]!+day,guess=Math.floor((year-1)*364*294/293);
 for(let d=guess-800;d<guess+800;d++) if(fields(d).solar_doy===target&&yearNumber(d)===year) return d;
 throw Error('Enoch date not found');
}
function yearBounds(year:number) {
 const lo=gregorianToJdn(year,1,1)+JDN_OFFSET,hi=gregorianToJdn(year,12,31)+JDN_OFFSET;
 const starts=[];
 for(let d=lo;d<=hi;d++) if(fields(d).solar_doy===1&&fields(d-1).solar_doy!==1) starts.push(d);
 if(starts.length!==1) throw Error('expected one annual start');
 const enoch_year=yearNumber(starts[0]!);
 const bounds=MONTH_OFFSETS.map((_,i)=>daycountForEnochDate(enoch_year,i+1,1));
 bounds.push(daycountForEnochDate(enoch_year+1,1,1));
 return {enoch_year,bounds};
}
export type YearSelector = {year?:number;enoch_year?:number;date?:[number,number,number]};
/** Whole-year support matches enoch.almanac, not the raw file endpoints. */
export function selectYear(selector:YearSelector) {
 const keys=['year','enoch_year','date'] as const;
 if(!selector || keys.filter(k=>selector[k]!==undefined).length!==1) throw Error('give exactly one of year, enoch_year, date');
 let selected;
 if(selector.year!==undefined) {
  if(!Number.isInteger(selector.year)||selector.year < -12998||selector.year >16995) throw Error('civil years -12998 to 16995 only');
  selected=yearBounds(selector.year);
 } else {
  const ey=selector.date!==undefined?yearNumber(gregorianToJdn(...selector.date)+JDN_OFFSET):selector.enoch_year!;
  if(!Number.isSafeInteger(ey)||Math.abs(ey)>100000) throw Error('invalid Enoch year');
  const bounds=MONTH_OFFSETS.map((_,i)=>daycountForEnochDate(ey,i+1,1));
  bounds.push(daycountForEnochDate(ey+1,1,1));
  selected={enoch_year:ey,bounds};
 }
 const year=jdnToGregorian(selected.bounds[0]-JDN_OFFSET)[0];
 if(year < -12998||year >16995) throw Error('civil years -12998 to 16995 only');
 return {...selected,year};
}
export function parseIsoDate(text:string):[number,number,number] {
 const m=/^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})$/.exec(text);
 if(!m) throw Error('invalid ISO date');
 const date:[number,number,number]=[Number(m[1]),Number(m[2]),Number(m[3])];
 civilToJdn(...date);
 return date;
}
export function isoDate([y,m,d]:[number,number,number]):string {
 return (y>=0&&y<=9999?String(y).padStart(4,'0'):(y<0?'-':'+')+String(Math.abs(y)).padStart(6,'0'))+`-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
