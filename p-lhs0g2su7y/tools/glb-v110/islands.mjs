// list connected components (by welded positions) of a mesh node; podium-metre bboxes
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
export async function load(file) { const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file); return doc; }
export function frame(doc) { const sb = getBounds(doc.getRoot().listScenes()[0]); const k = 4.8 / Math.max(sb.max[0]-sb.min[0], sb.max[1]-sb.min[1], sb.max[2]-sb.min[2]);
  return (p) => [(p[0]-(sb.min[0]+sb.max[0])/2)*k, (p[1]-sb.min[1])*k, (p[2]-(sb.min[2]+sb.max[2])/2)*k]; }
export function islands(node, toM) {
  const prim = node.getMesh().listPrimitives()[0];
  const pos = prim.getAttribute('POSITION'); const idx = prim.getIndices();
  const wm = node.getWorldMatrix();
  const n = pos.getCount(); const P = [];
  const v = [0,0,0];
  for (let i = 0; i < n; i++) { pos.getElement(i, v); const x = wm[0]*v[0]+wm[4]*v[1]+wm[8]*v[2]+wm[12], y = wm[1]*v[0]+wm[5]*v[1]+wm[9]*v[2]+wm[13], z = wm[2]*v[0]+wm[6]*v[1]+wm[10]*v[2]+wm[14]; P.push(toM([x,y,z])); }
  // weld by position
  const key = (p) => p.map((c) => Math.round(c * 2000)).join(',');
  const rep = new Map(); const id = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(P[i]); if (!rep.has(k)) rep.set(k, i); id[i] = rep.get(k); }
  const par = new Int32Array(n).map((_, i) => i);
  const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const tri = idx ? idx.getArray() : Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < tri.length; t += 3) { const a = f(id[tri[t]]), b = f(id[tri[t+1]]), c = f(id[tri[t+2]]); par[b] = a; par[f(c)] = a; }
  const comps = new Map();
  for (let t = 0; t < tri.length; t += 3) { const r = f(id[tri[t]]); if (!comps.has(r)) comps.set(r, { tris: [], min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] }); const c = comps.get(r); c.tris.push(t / 3);
    for (let j = 0; j < 3; j++) { const p = P[tri[t+j]]; for (let a = 0; a < 3; a++) { c.min[a] = Math.min(c.min[a], p[a]); c.max[a] = Math.max(c.max[a], p[a]); } } }
  return { prim, comps: [...comps.values()], tri };
}
if (process.argv[1].endsWith('islands.mjs')) {
  const [,, file, re, box] = process.argv;
  const doc = await load(file); const toM = frame(doc);
  const B = box ? box.split(',').map(Number) : null; // xmin,xmax,ymin,ymax,zmin,zmax
  for (const node of doc.getRoot().listNodes()) { if (!node.getMesh() || !new RegExp(re).test(node.getName())) continue;
    const { comps } = islands(node, toM); console.log(node.getName(), 'components', comps.length);
    for (const c of comps) { if (B && !(c.min[0] >= B[0] && c.max[0] <= B[1] && c.min[1] >= B[2] && c.max[1] <= B[3] && c.min[2] >= B[4] && c.max[2] <= B[5])) continue;
      console.log('  tris', c.tris.length, 'min', c.min.map((x) => +x.toFixed(3)), 'max', c.max.map((x) => +x.toFixed(3))); }
  }
}
