// Natural Earth 1:50m land (public domain, via world-atlas@2 TopoJSON) → plain rings [[lon,lat],…], 0.01° steps.
// node build_land.mjs path/to/land-50m.json > land.json
import { readFileSync } from 'node:fs';
const topo = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [+(x * sx + tx).toFixed(2), +(y * sy + ty).toFixed(2)]; }); });
const ring = (ids) => ids.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
const out = [];
for (const g of topo.objects.land.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  for (const p of polys) for (const r of p) out.push(ring(r));
}
process.stdout.write(JSON.stringify(out));
