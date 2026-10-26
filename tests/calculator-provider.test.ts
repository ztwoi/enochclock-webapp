import {test} from 'node:test';
import assert from 'node:assert/strict';

Object.assign(globalThis,{window:{addEventListener(){}},location:{search:'',href:'https://example.org/'}});
const {localRequest}=await import('../src/calculator/provider');

test('insecure context refuses calculation before any worker or download',async()=>{
 Object.assign(globalThis,{isSecureContext:false});
 await assert.rejects(localRequest({kind:'instant',jd:2460000,site:{lat:0,lon:0,elev:0,tz:'UTC',name:'Test',source:'manual'}}),/secure page \(HTTPS, or localhost\)/);
});

test('there is no server provider: api.ts only calculates on the device and reads static files',async()=>{
 const fs=await import('node:fs'),src=fs.readFileSync(new URL('../src/api.ts',import.meta.url),'utf8');
 assert.doesNotMatch(src,/['"`]\/api\//,'no request to /api/');
 assert.match(src,/localRequest\(\{kind:'year'/);
});
