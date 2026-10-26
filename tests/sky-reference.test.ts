import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeStars} from '../src/sky/catalogue';
import {skyFrame,starVector} from '../src/sky/astronomy';
import {AstroTime,AngleBetween,Vector} from 'astronomy-engine';
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const manifest=json('public/sky/catalogue.json');
const stars=manifest.chunks.flatMap((c:any)=>decodeStars(json('public/sky/'+c.path)));
const byId=new Map(stars.map((s:any)=>[s.id,s]));
test('independent ERFA proper motion/precession/nutation/rotation, both hemispheres',()=>{
 let worst=0;
 for(const r of json('tests/fixtures/sky-star-reference.json').rows){const f=skyFrame(r.jd_ut,r.lat,r.lon,0);const h=f.direction(starVector(byId.get(r.id) as any,f.time));const delta=Math.abs(((h.az-r.az+540)%360)-180);worst=Math.max(worst,delta*Math.cos(r.alt*Math.PI/180),Math.abs(h.alt-r.alt));}
 console.log({worstERFAHorizontalDeg:worst});assert.ok(worst<.002,'ERFA angular agreement <7.2 arcsec');
});
test('all rows accessible; every figure endpoint uses exact same ID and transformed position',()=>{
 assert.equal(stars.length,119625);assert.equal(byId.size,119625);
 const frame=skyFrame(2461121.091263774,-33.8688,151.2093,0);
 const transformed=new Map(stars.map((s:any)=>{const h=frame.direction(starVector(s,frame.time));return [s.id,[h.az,h.alt]];}));
 const endpoints=new Set();let segments=0;
 for(const f of json('public/sky/constellations.json').constellations)for(const chain of f.lines){segments+=chain.length-1;for(const id of chain){endpoints.add(id);const s=byId.get(id) as any;assert.ok(s);const h=frame.direction(starVector(s,frame.time));assert.deepEqual(transformed.get(id),[h.az,h.alt]);}}
 assert.equal(endpoints.has('hyg:4.1:119625'),false);assert.equal(segments,695);assert.equal(endpoints.size,710);assert.equal(stars.filter((s:any)=>!endpoints.has(s.id)).length,118915);
});
test('Sun shares the star coordinate origin after topocentric subtraction',()=>{
 const f=skyFrame(2461121.091263774,37.7749,-122.4194,0);
 const unit=new Vector(f.sunVector.x/f.sunVector.Length(),f.sunVector.y/f.sunVector.Length(),f.sunVector.z/f.sunVector.Length(),f.time);
 const p=f.direction(unit);assert.ok(Math.abs(p.az-f.sun.az)<1e-10);assert.ok(Math.abs(p.alt-f.sun.alt)<1e-10);
 assert.ok(AngleBetween(f.sunGeocentric,f.sunVector)>.002,'observer displacement is not omitted');
});
test('Barnard anomaly stays flagged/unpropagated; tangent propagation finite at poles',()=>{
 const s=byId.get('hyg:4.1:87665') as any;
 assert.deepEqual([starVector(s,new AstroTime(0)).x,starVector(s,new AstroTime(0)).y],[starVector(s,new AstroTime(10000)).x,starVector(s,new AstroTime(10000)).y]);
 const v=starVector({...s,id:'test',dec_deg:90,pm_ra_cosdec_mas_per_year:1000},new AstroTime(10000));assert.ok(Number.isFinite(v.x));assert.ok(Math.abs(v.Length()-1)<1e-12);
});
