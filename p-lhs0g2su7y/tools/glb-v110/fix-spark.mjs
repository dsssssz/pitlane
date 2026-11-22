// v110: remove Chevrolet bowtie (front + rear) from spark.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { frame, islands } from './islands.mjs';
const [,, src, dst] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const toM = frame(doc);
const kill = /^(polySurface272_escudo_0|Escudo_Front_Bumper_escudo_0|polySurface299_Chrome_0)$/;
for (const n of doc.getRoot().listNodes()) if (kill.test(n.getName())) { console.log('remove node', n.getName()); n.dispose(); }
// front bowtie chrome bezel = isolated island of Chrome_Front_Bumper1 in the grille centre
const fr = doc.getRoot().listNodes().find((n) => n.getName() === 'Chrome_Front_Bumper1_Chrome_0');
const { prim, comps, tri } = islands(fr, toM);
const bad = comps.filter((c) => c.min[0] > -0.2 && c.max[0] < 0.25 && c.min[1] > 0.8 && c.max[1] < 1.0 && c.min[2] > 2.1);
if (bad.length !== 1 || bad[0].tris.length !== 588) throw new Error('unexpected bezel islands ' + bad.map((c) => c.tris.length));
const drop = new Set(bad[0].tris);
const keep = []; for (let t = 0; t < tri.length / 3; t++) if (!drop.has(t)) keep.push(tri[t*3], tri[t*3+1], tri[t*3+2]);
const idx = prim.getIndices();
const Arr = idx.getArray().constructor;
idx.setArray(new Arr(keep));
console.log('front bezel tris removed', drop.size, 'kept', keep.length / 3);
await doc.transform(prune({ keepAttributes: true, keepLeaves: false }));
await io.write(dst, doc);
