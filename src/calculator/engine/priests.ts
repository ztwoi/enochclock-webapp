import {mod} from './calendar';
import {civil} from './cycle';
import definitions from './generated/definitions.json';
export const priestDefinition=definitions.priests;
export function priestCourse(d:number){
 const absolute=Math.floor((d+3)/7),w=mod(absolute,15288),k=mod(w,24),c=priestDefinition.courses[k],start=d-mod(d+3,7);
 return {course:k+1,course_name:c.name,course_cycle:Math.floor(absolute/15288)+1,course_chronicles:c.chronicles,course_kjv:c.kjv,course_week_start:civil(start),course_week_end:civil(start+6),course_week_of_cycle:w+1,course_rotation:Math.floor(w/24)+1,six_year_cycle:Math.floor(w/312)+1,six_year_year:Math.floor(mod(w,312)/52)+1,six_year_week:mod(w,312)+1};
}
