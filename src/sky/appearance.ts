/** CSS pixel diameter and peak alpha; illustrative, not photometry. */
export function starStyle(mag:number){return {size:Math.max(.65,Math.min(3.3,2.7-.29*mag)),alpha:Math.max(.16,Math.min(.55,.5-.035*mag))};}
/** Restrained illustrative B−V tint, not calibrated photometric RGB. */
export function starColor(bv:number|null):[number,number,number]{
 if(bv===null)return [.82,.82,.82];
 const t=Math.max(0,Math.min(1,(bv+.4)/2.4));return [.72+.25*t,.79,.98-.33*t];
}
