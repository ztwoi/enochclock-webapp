import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalogue} from '../src/sky/catalogue';

/** Serve the staged sky files and record which were asked for. */
function serve() {
 const asked:string[]=[];
 globalThis.fetch=(async(url:string)=>{const f=String(url).replace('/sky/','');asked.push(f);return {ok:true,json:async()=>JSON.parse(readFileSync(`public/sky/${f}`,'utf8'))};}) as unknown as typeof fetch;
 return asked;
}
const full=()=>{serve();return loadCatalogue();};

test('default load is the whole catalogue',async()=>{
 const asked=serve(),c=await loadCatalogue();
 assert.equal(c.stars.length,119625);assert.equal(c.byId.size,119625);assert.equal(asked.filter(a=>a.startsWith('stars-')).length,5);
});
test('a V<=6.5 load fetches only the two brightest chunks and still resolves every figure',async()=>{
 const asked=serve(),c=await loadCatalogue('/sky/',6.5),chunks=asked.filter(a=>a.startsWith('stars-'));
 assert.deepEqual(chunks.sort(),['stars-6to8.json','stars-le6.json']);
 assert.equal(c.stars.length,5070+36417);assert.equal(c.segments.length,695);
});
test('extend fetches only what is missing, once, and yields the same list as a full load',async()=>{
 const asked=serve(),c=await loadCatalogue('/sky/',6.5),before=asked.length;
 await c.extend(7.5);assert.equal(asked.length,before,'7.5 is inside the loaded chunks');
 await Promise.all([c.extend(8.5),c.extend(8.5)]);
 assert.equal(asked.filter(a=>a==='stars-8to10.json').length,1,'concurrent callers share one fetch');
 assert.equal(asked.includes('stars-10to12.json'),false);
 const ref=await full();
 assert.deepEqual(c.stars.map(s=>s.id),ref.stars.filter(s=>s.mag_v<=10).map(s=>s.id));
 assert.equal(c.completeTo,8.5);
});
