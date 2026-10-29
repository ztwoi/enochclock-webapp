// The land for Atlas: Natural Earth 1:50m (public domain) as world-atlas's TopoJSON (public/atlas/land-50m.json), decoded
// once into rings of [lon, lat]; from them an equirectangular land mask for the globe's shader and the coast as segments.
import { vec } from './geo';

interface Topology {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: { land: { geometries: { type: 'Polygon' | 'MultiPolygon'; arcs: number[][] | number[][][] }[] } };
}
export type Ring = [number, number][];

/** Rings of [lon, lat] degrees (polygons with their holes, cut at the antimeridian and closed along it and the pole). */
export function decode(topo: Topology): Ring[] {
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]): [number, number] => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const ring = (ids: number[]) => ids.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
  const out: Ring[] = [];
  for (const g of topo.objects.land.geometries) {
    const polys = (g.type === 'Polygon' ? [g.arcs] : g.arcs) as number[][][];
    for (const p of polys) for (const r of p) out.push(ring(r));
  }
  return out;
}

/** A segment of a ring that is only the cut (along the antimeridian or the pole), not a coast. */
export const isCut = (a: [number, number], b: [number, number]) =>
  a[1] <= -89.9 || b[1] <= -89.9 || Math.abs(b[0] - a[0]) > 180 || (Math.abs(a[0]) >= 179.99 && a[0] === b[0]);

/** The coast as line segments on the unit sphere (pairs of points, xyz), raised by `lift` so the globe does not hide it. */
export function coastSegments(rings: Ring[], lift = 1.0008): Float32Array {
  const pts: number[] = [];
  for (const r of rings) for (let k = 1; k < r.length; k++) {
    if (isCut(r[k - 1], r[k])) continue;
    const a = vec(r[k - 1][1], r[k - 1][0]), b = vec(r[k][1], r[k][0]);
    pts.push(a[0] * lift, a[1] * lift, a[2] * lift, b[0] * lift, b[1] * lift, b[2] * lift);
  }
  return new Float32Array(pts);
}

/** The land as a white-on-transparent equirectangular canvas (x: −180° → 180°, y: 90° → −90°). */
export function landMask(rings: Ring[], w = 4096, h = 2048): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.beginPath();
  for (const r of rings) r.forEach(([lo, la], k) => { const x = (lo + 180) / 360 * w, y = (90 - la) / 180 * h; if (k) g.lineTo(x, y); else g.moveTo(x, y); });
  g.fillStyle = '#fff'; g.fill('evenodd');                          // holes (lakes, seas within land) by even-odd
  return c;
}

let loading: Promise<Ring[]> | null = null;
/** The land, fetched once (part of the offline pack). */
export function loadLand(base = `${import.meta.env.BASE_URL}atlas/`): Promise<Ring[]> {
  loading ??= fetch(`${base}land-50m.json`).then((r) => { if (!r.ok) throw Error(`land: HTTP ${r.status}`); return r.json(); }).then((t: Topology) => decode(t))
    .catch((e) => { loading = null; throw e; });
  return loading;
}
