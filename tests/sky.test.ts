import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeStars} from '../src/sky/catalogue';
import {readFileSync} from 'node:fs';
import {skyFrame,starVector} from '../src/sky/astronomy';
import {EquatorFromVector} from 'astronomy-engine';
test('all selected JDs: independent Swiss J2000 Sun and unrefracted horizon',()=>{
 const refs=JSON.parse(readFileSync('tests/fixtures/sky-sun-reference.json','utf8'));
 const clock=JSON.parse(readFileSync('tests/fixtures/sf-2026.json','utf8'));
 let worstEQ=0,worstAz=0,worstAlt=0;
 for(const [i,r] of refs.rows.entries()){
 const f=skyFrame(Number(r.jd_ut),37.7749,-122.4194,0),eq=EquatorFromVector(f.sunGeocentric);
 const delta=(a:number,b:number)=>Math.abs(((a-b+540)%360)-180);
 worstEQ=Math.max(worstEQ,delta(eq.ra*15,r.ra_deg),Math.abs(eq.dec-r.dec_deg));
 worstAz=Math.max(worstAz,delta(f.sun.az,clock.rows[i].azimuth_deg));worstAlt=Math.max(worstAlt,Math.abs(f.sun.alt-clock.rows[i].center_true_altitude_deg));
 }
 console.log({worstEQ,worstAz,worstAlt});assert.ok(worstEQ<.02);assert.ok(worstAz<.02);assert.ok(worstAlt<.02);
});
test('both hemispheres: J2000 pole altitude tracks latitude, with precession bounded',()=>{
 for(const lat of [37.7749,-33.8688]){const f=skyFrame(2451545,lat,0,0);const p=f.direction(starVector({ra_deg:0,dec_deg:90,pm_ra_cosdec_mas_per_year:0,pm_dec_mas_per_year:0} as any,f.time));assert.ok(Math.abs(p.alt-lat)<.01);}
});
test('catalogue checks schema, preserves stable IDs and nulls, rejects null magnitude',()=>{
 const data=JSON.parse(readFileSync('public/sky/stars-le6.json','utf8'));
 const stars=decodeStars(data);assert.equal(stars.length,5070);assert.match(stars[0].id,/^hyg:4.1:/);
 const row=[...data.stars[0]];row[data.columns.indexOf('bv')]=null;
 assert.equal(decodeStars({...data,stars:[row]})[0].bv,null);
 row[data.columns.indexOf('mag_v')]=null;assert.throws(()=>decodeStars({...data,stars:[row]}));
 assert.throws(()=>decodeStars({...data,schema_version:2}));
});
