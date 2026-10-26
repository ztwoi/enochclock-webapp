/** enoch.almanac timezone policy. ICU supplies rules; no astronomical timezone inference. */
import {gregorianToJdn,jdnToGregorian,isoDate} from './calendar';
const formatters=new Map<string,Intl.DateTimeFormat>();
function roundEven(x:number):number {
 const lo=Math.floor(x),fraction=x-lo;
 return fraction===.5?(lo%2===0?lo:lo+1):Math.round(x);
}
export function localTime(jd:number,tz:string) {
 if(!Number.isFinite(jd)) throw Error('invalid Julian date');
 let formatter=formatters.get(tz);
 if(!formatter) {
  formatter=new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'longOffset'});
  formatters.set(tz,formatter);
 }
 const jdn=Math.floor(jd+.5),[y,m,d]=jdnToGregorian(jdn);
 const proxy=y<2?gregorianToJdn(2,1,1)-.5:y>9997?gregorianToJdn(9996,m,d):jd;
 const offsetText=formatter.formatToParts(new Date((proxy-2440587.5)*86400000)).find(p=>p.type==='timeZoneName')!.value;
 const match=/^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(offsetText);
 if(!match) throw Error(`unsupported ICU offset ${offsetText}`);
 const off=match[1]?(match[1]==='-'?-1:1)*(Number(match[2])*3600+Number(match[3])*60+Number(match[4]||0)):0;
 // Match Python's two rounding paths, including absolute-JD float rounding at deep dates.
 const us=y>=2&&y<=9997?BigInt(jdn)*86400000000n+BigInt(roundEven((jd-(jdn-.5))*86400*1e6)):
  BigInt(roundEven((jd+.5)*86400e6));
 const shifted=us+BigInt(off)*1000000n,day=shifted>=0n?shifted/86400000000n:(shifted-86400000000n+1n)/86400000000n;
 const seconds=Number((shifted-day*86400000000n)/1000000n),ymd=jdnToGregorian(Number(day));
 const pad=(n:number)=>String(n).padStart(2,'0'),o=Math.abs(off);
 const zone=(off<0?'-':'+')+pad(Math.floor(o/3600))+':'+pad(Math.floor(o/60)%60)+(o%60?':'+pad(o%60):'');
 return {ymd,text:isoDate(ymd)+'T'+pad(Math.floor(seconds/3600))+':'+pad(Math.floor(seconds/60)%60)+':'+pad(seconds%60)+zone};
}
