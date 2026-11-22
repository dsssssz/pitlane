// v110: M3 lights — glow layers were stacked 4x at the rear (position_back + identical position_front_and_back + brakes + reverse),
// each a BLEND quad at 46% opacity whose black texture areas darkened a rectangle, emissive 1.81 on an orange texture -> blown-out blob.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';
import * as THREE from '/workspace/pl-bot/vendor/three/three.module.js';
const [,, src, dst, rearStr = '1.15', frontStr = '0.9'] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
const byName = (re) => root.listNodes().filter((n) => re.test(n.getName()));
// 1) drop duplicate + parked-off layers
for (const n of byName(/lights_position_front_and_back_glows|lights_brakes_glows|lights_reverse_glows/)) { console.log('remove', n.getName()); n.dispose(); }
// 2) glow texture: alpha = brightness (black areas fully transparent -> no dark box), RGB untouched
const glow = root.listMaterials().find((m) => m.getName() === 'm3phong3SG1');
const tex = glow.getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  const m = Math.max(data[i], data[i + 1], data[i + 2]);
  data[i + 3] = Math.min(255, Math.round(Math.pow(m / 255, 0.8) * 255 * 1.25));
}
const png = await sharp(data, { raw: info }).png({ compressionLevel: 9, palette: false }).toBuffer();
tex.setImage(new Uint8Array(png));
console.log('glow tex bytes', png.length);
// emissive uses the same RGB (tex4 was an identical RGB copy) -> share it, the copy is pruned
const emTexInfo = glow.getEmissiveTextureInfo();
const emSampler = emTexInfo ? { wrapS: emTexInfo.getWrapS(), wrapT: emTexInfo.getWrapT() } : null;
glow.setEmissiveTexture(tex);
glow.setBaseColorFactor([1, 1, 1, 1]); // opacity now from texture alpha
glow.setAlphaMode('BLEND');
glow.setRoughnessFactor(0.4);
// 3) split front/rear: rear = red LED, front = cool white DRL
const node = byName(/lights_position_back_glows/).find((n) => n.getMesh());
const sb = getBounds(root.listScenes()[0]);
const midZ = (sb.min[2] + sb.max[2]) / 2;
const prim = node.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION'); const idx = prim.getIndices(); const tri = idx.getArray();
const W = new THREE.Matrix4().fromArray(node.getWorldMatrix()); const v = new THREE.Vector3(); const a = [0, 0, 0];
const zOf = (i) => { pos.getElement(i, a); return v.fromArray(a).applyMatrix4(W).z; };
const front = [], rear = [];
for (let t = 0; t < tri.length; t += 3) (zOf(tri[t]) + zOf(tri[t + 1]) + zOf(tri[t + 2]) > 3 * midZ ? front : rear).push(tri[t], tri[t + 1], tri[t + 2]);
idx.setArray(new (tri.constructor)(rear));
const rearMat = glow.clone().setName('m3_tail_led');
rearMat.setEmissiveFactor([1.0, 0.16, 0.1]);
rearMat.setBaseColorFactor([0.55, 0.04, 0.03, 1]);
const esExt = root.listExtensionsUsed().find((e) => e.extensionName === 'KHR_materials_emissive_strength');
rearMat.setExtension('KHR_materials_emissive_strength', esExt.createEmissiveStrength().setEmissiveStrength(+rearStr));
prim.setMaterial(rearMat);
const frontPrim = prim.clone();
frontPrim.setIndices(doc.createAccessor('m3_front_glow_idx').setType('SCALAR').setArray(new (tri.constructor)(front)).setBuffer(idx.getBuffer()));
glow.setName('m3_front_drl');
glow.setEmissiveFactor([0.92, 0.96, 1.0]);
glow.getExtension('KHR_materials_emissive_strength').setEmissiveStrength(+frontStr);
frontPrim.setMaterial(glow);
node.getMesh().addPrimitive(frontPrim);
console.log('rear tris', rear.length / 3, 'front tris', front.length / 3);
await doc.transform(prune({ keepAttributes: true, keepLeaves: false }));
await io.write(dst, doc);
