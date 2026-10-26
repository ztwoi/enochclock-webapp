import {test} from 'node:test';
import assert from 'node:assert/strict';
import {starStyle,starColor} from '../src/sky/appearance';
test('small translucent glyphs retain magnitude hierarchy',()=>{
 for(const mag of [-1.46,0,3,6,12,21]){const s=starStyle(mag);assert.ok(s.size<=3.3&&s.size>=.65);assert.ok(s.alpha<=.55&&s.alpha>=.16);assert.ok(s.size<Math.max(1.5,5.7-.55*mag));}
 assert.ok(starStyle(0).size>starStyle(6).size);assert.ok(starStyle(0).alpha>starStyle(6).alpha);
});
test('missing B-V is neutral; measured color is restrained approximation',()=>{
 assert.deepEqual(starColor(null),[.82,.82,.82]);
 assert.ok(starColor(-.4)[2]>starColor(-.4)[0]);assert.ok(starColor(2)[0]>starColor(2)[2]);
});
