// v110 step 3: the two leftover bowtie "tabs" on the front grille chrome bars -> separate primitive in Plastic_Black
// (they cover notches cut into the grille meshes, so they can't be deleted — they become dark, blending into the grille)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import * as THREE from '/workspace/pl-bot/vendor/three/three.module.js';
const [,, src, dst] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const sb = getBounds(doc.getRoot().listScenes()[0]);
const k = 4.8 / Math.max(sb.max[0]-sb.min[0], sb.max[1]-sb.min[1], sb.max[2]-sb.min[2]);
const T = new THREE.Matrix4().makeTranslation(-(sb.min[0]+sb.max[0])/2, -sb.min[1], -(sb.min[2]+sb.max[2])/2).premultiply(new THREE.Matrix4().makeScale(k, k, k));
const node = doc.getRoot().listNodes().find((n) => n.getName() === 'Chrome_Front_Bumper1_Chrome_0');
const M = new THREE.Matrix4().fromArray(node.getWorldMatrix()).premultiply(T);
const prim = node.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION'); const idx = prim.getIndices(); const tri = idx.getArray();
const P = []; const a = [0,0,0]; const v = new THREE.Vector3();
for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, a); P.push(v.fromArray(a).applyMatrix4(M).toArray()); }
const inX = (p) => p[0] > -0.06 && p[0] < 0.096 && p[2] > 2.2;
const inTab = (p) => inX(p) && ((p[1] > 0.82 && p[1] < 0.8585) || (p[1] > 0.9515 && p[1] < 0.966));
const keep = [], tab = [];
for (let t = 0; t < tri.length; t += 3) { const ps = [P[tri[t]], P[tri[t+1]], P[tri[t+2]]]; (ps.every(inX) && ps.some(inTab) ? tab : keep).push(tri[t], tri[t+1], tri[t+2]); }
idx.setArray(new (tri.constructor)(keep));
const black = doc.getRoot().listMaterials().find((m) => m.getName() === 'Plastic_Black');
const tabPrim = prim.clone(); tabPrim.setIndices(doc.createAccessor('bowtie_tabs_idx').setType('SCALAR').setArray(new (tri.constructor)(tab)).setBuffer(idx.getBuffer())); tabPrim.setMaterial(black);
node.getMesh().addPrimitive(tabPrim);
console.log('tab tris -> Plastic_Black', tab.length / 3, 'chrome kept', keep.length / 3);
await io.write(dst, doc);
