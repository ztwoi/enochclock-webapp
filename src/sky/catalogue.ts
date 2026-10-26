export interface Star {id:string;hip:number|null;ra_deg:number;dec_deg:number;mag_v:number;bv:number|null;pm_ra_cosdec_mas_per_year:number;pm_dec_mas_per_year:number;name:string|null;designation:string|null;spectral_type:string|null;constellation:string|null}
const COLUMNS=['id','hip','ra_deg','dec_deg','mag_v','bv','pm_ra_cosdec_mas_per_year','pm_dec_mas_per_year','name','designation','spectral_type','constellation'];
const validNumber=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
export function decodeStars(data:any):Star[]{
 if(data.schema_version!==1||JSON.stringify(data.columns)!==JSON.stringify(COLUMNS)||!Array.isArray(data.stars))throw Error('Unsupported star schema/columns');
 const ids=new Set<string>();
 return data.stars.map((row:unknown[])=>{
  if(!Array.isArray(row)||row.length!==COLUMNS.length)throw Error('Invalid star row');
  // Direct construction (one hidden class, no per-row entry arrays): this runs 120k times.
  const s:Star={id:row[0] as string,hip:row[1] as number|null,ra_deg:row[2] as number,dec_deg:row[3] as number,mag_v:row[4] as number,bv:row[5] as number|null,pm_ra_cosdec_mas_per_year:row[6] as number,pm_dec_mas_per_year:row[7] as number,name:row[8] as string|null,designation:row[9] as string|null,spectral_type:row[10] as string|null,constellation:row[11] as string|null};
  if(typeof s.id!=='string'||!/^hyg:4\.1:[1-9]\d*$/.test(s.id)||ids.has(s.id))throw Error('Invalid/duplicate stable ID');ids.add(s.id);
  for(const k of ['ra_deg','dec_deg','mag_v','pm_ra_cosdec_mas_per_year','pm_dec_mas_per_year'] as const)if(!validNumber(s[k]))throw Error(`Invalid ${k}`);
  if(s.ra_deg<0||s.ra_deg>=360||Math.abs(s.dec_deg)>90)throw Error('Invalid sky coordinates');
  if(s.bv!==null&&!validNumber(s.bv))throw Error('Invalid color');
  if(s.hip!==null&&(!Number.isInteger(s.hip)||s.hip<=0))throw Error('Invalid HIP');
  for(const k of ['name','designation','spectral_type','constellation'] as const)if(s[k]!==null&&typeof s[k]!=='string')throw Error(`Invalid ${k}`);
  return s;
 });
}
async function json(path:string,base:string){const r=await fetch(`${base}${path}`);if(!r.ok)throw Error(`Catalogue unavailable: ${path}`);return r.json();}
/** Faintest magnitude a chunk can hold and the brightest, from its name (stars-le6, stars-6to8, stars-gt12). Unknown names always load. */
function chunkRange(path:string):[number,number]{
 const m=/^stars-(?:le(\d+)|(\d+)to(\d+)|gt(\d+))\.json$/.exec(path);
 if(!m)return [-Infinity,Infinity];
 return m[1]?[-Infinity,+m[1]]:m[2]?[+m[2],+m[3]]:[+m[4],Infinity];
}
/** `base` is where the staged sky assets are served (the app: /sky/; films: their static path).
 *  `maxMag`: load only the chunks that hold stars at least that bright (the rest come from `extend`). Default: all of them. */
export async function loadCatalogue(base='/sky/',maxMag=Infinity){
 const manifest=await json('catalogue.json',base);
 if(manifest.schema_version!==1||manifest.count!==119625||JSON.stringify(manifest.columns)!==JSON.stringify(COLUMNS))throw Error('Unsupported catalogue');
 const stars:Star[]=[],byId=new Map<string,Star>(),loaded=new Set<string>();
 let loadedCount=0;
 const pull=async(limit:number)=>{
  const todo=manifest.chunks.filter((c:any)=>!loaded.has(c.path)&&chunkRange(c.path)[0]<=limit);
  const got=await Promise.all(todo.map(async(c:any)=>{if(!/^stars-[\w-]+\.json$/.test(c.path))throw Error('Invalid chunk path');const s=decodeStars(await json(c.path,base));if(s.length!==c.count)throw Error('Chunk count mismatch');return [c,s] as const;}));
  for(const [c,s] of got){ // in manifest order, so the list is the same whichever order chunks arrived in
   for(const x of s){if(byId.has(x.id))throw Error('Catalogue count/ID mismatch');byId.set(x.id,x);stars.push(x);}
   loaded.add(c.path);loadedCount+=c.count;
  }
  if(stars.length!==loadedCount)throw Error('Catalogue count/ID mismatch');
  if(loaded.size===manifest.chunks.length&&stars.length!==manifest.count)throw Error('Catalogue count/ID mismatch');
 };
 await pull(maxMag);
 const figures=await json('constellations.json',base);
 if(figures.schema_version!==1||figures.constellations.length!==88)throw Error('Invalid figure schema');
 const segments:[string,string][]=[],groups:{abbr:string;from:number;to:number}[]=[];
 for(const f of figures.constellations){const from=segments.length;for(const chain of f.lines){if(!Array.isArray(chain)||chain.some((id:string)=>!byId.has(id)))throw Error('Unresolved figure endpoint');for(let i=1;i<chain.length;i++)segments.push([chain[i-1],chain[i]]);}groups.push({abbr:String(f.id).split(' ').pop()!,from,to:segments.length});}
 if(segments.length!==695)throw Error('Figure segment mismatch');
 let reach=maxMag,pending:Promise<void>|undefined;
 return {stars,byId,segments,groups,manifest,
  /** Faintest magnitude the list is complete to. */
  get completeTo(){return reach;},
  /** Make the list complete to `mag`, fetching the deeper chunks if they are not here yet (appends to `stars` and `byId`). */
  async extend(mag:number){
   if(mag<=reach)return;
   while(pending)await pending;
   if(mag<=reach)return;
   pending=pull(mag).then(()=>{reach=mag;},e=>{throw e;}).finally(()=>{pending=undefined;});
   await pending;
  }};
}
