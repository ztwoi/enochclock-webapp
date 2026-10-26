import {AstroTime,Body,GeoVector,Observer,ObserverVector,Rotation_EQJ_HOR,RotateVector,HorizonFromVector,Vector} from 'astronomy-engine';
import type {Star} from './catalogue';
const D=Math.PI/180;
/** First-order tangent-space proper motion; never divide by cos(dec). No 6D claim. */
export function starVector(s:Star,time:AstroTime){
 const a=s.ra_deg*D,d=s.dec_deg*D,years=time.tt/365.25,unit=D/3600000;
 // Retain flagged Barnard source position, explicitly excluded from epoch accuracy.
 const flagged=s.id==='hyg:4.1:87665';
 const east=flagged?0:s.pm_ra_cosdec_mas_per_year*years*unit,north=flagged?0:s.pm_dec_mas_per_year*years*unit;
 const x=Math.cos(d)*Math.cos(a)-east*Math.sin(a)-north*Math.sin(d)*Math.cos(a);
 const y=Math.cos(d)*Math.sin(a)+east*Math.cos(a)-north*Math.sin(d)*Math.sin(a);
 const z=Math.sin(d)+north*Math.cos(d),n=Math.hypot(x,y,z);
 return new Vector(x/n,y/n,z/n,time);
}
/** Shared astrometric J2000 inputs -> true-of-date local axes, NO refraction/aberration. */
export function skyFrame(jdUT:number,latitude:number,longitude:number,height:number){
 if(![jdUT,latitude,longitude,height].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Invalid observer/time');
 const time=new AstroTime(jdUT-2451545),observer=new Observer(latitude,longitude,height),rotation=Rotation_EQJ_HOR(time,observer);
 const direction=(v:Vector)=>{const h=HorizonFromVector(RotateVector(rotation,v),null as unknown as string);return {az:h.lon,alt:h.lat};};
 const sunGeocentric=GeoVector(Body.Sun,time,false),origin=ObserverVector(time,observer,false);
 const sunVector=new Vector(sunGeocentric.x-origin.x,sunGeocentric.y-origin.y,sunGeocentric.z-origin.z,time);
 return {time,observer,rotation,direction,sunGeocentric,sunVector,sun:direction(sunVector)};
}
