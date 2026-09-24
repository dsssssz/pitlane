/**
 * PITLANE license plates for the 3D podium GLBs.
 * - One shared canvas texture + materials + geometries for every plate (cheap per switch).
 * - Placement is computed once per model id (raycast onto bumper / existing plate mesh)
 *   in glbRoot-local space and cached; clones reuse the cached transforms.
 * - Plate meshes are tagged userData.__pitlanePlate so body paint never touches them.
 */
import * as THREE from 'three';

/* Real-world sizes in metres (Euro plate 520x112 + thin frame). */
const PLATE_W = 0.52;
const PLATE_H = 0.112;
const FRAME_B = 0.014; // frame border each side
const FACE_W = PLATE_W + FRAME_B * 2;
const FACE_H = PLATE_H + FRAME_B * 2;
const BACK_D = 0.012; // frame/backing thickness
const TEX_W = 1024;
const TEX_H = Math.round(TEX_W * (FACE_H / FACE_W));

/**
 * Per-car placement. Heights are metres above ground after podium fit (length 4.8 m).
 *  mesh: RegExp of an existing plate mesh in the GLB -> plate mounted on it (original hidden).
 *  y:    centre height for bumper raycast placement. x: lateral offset (m). scale: plate scale.
 *  push: extra outward offset (m). tilt: extra pitch (rad).
 *  none: true -> no plate on this end.
 */
export const PLATE_CONFIG = {
  'g87-m2': { front: { y: 0.40, push: 0.015, pitch: 4 }, rear: { mesh: /ManufacturerPlate/i } },
  gt3rs: { front: { y: 0.34, push: 0.035 }, rear: { mesh: /ManufacturerPlate/i } },
  'mclaren-765lt': { front: { y: 0.30 }, rear: { mesh: /ManufacturerPlate/i } },
  g63: { front: { y: 0.55 }, rear: { mesh: /ManufacturerPlate/i } },
  m4: { front: { y: 0.36 }, rear: { y: 0.62 } },
  m3: { front: { mesh: /bumper_front.*licenseplate/i }, rear: { mesh: /trunk.*licenseplate/i } },
  x6: { front: { mesh: /^Plane001_plate/i }, rear: { mesh: /^Plane005_plate/i } },
  isf: { front: { y: 0.36 }, rear: { y: 0.86 } },
  'c63-ed507': { scale: 1, front: { y: 0.36 }, rear: { mesh: /ManufacturerPlate/i } },
  spark: { front: { mesh: /bumper_F_plateholder/i }, rear: { y: 0.55 } },
};

/** Baked placements (tools/plates-smoke.html ?bake) — [end, pos, quat, scale, hiddenMesh] in glbRoot-local units.
 *  Runtime uses these (zero raycast cost on switch); PLATE_CONFIG + raycast is the fallback / re-bake source. */
const PLATE_BAKED = {
  "g87-m2": [["front", [-4.75687e-11, 0.00367678, 0.0229473], [-0.0349, 0, 0, 0.99939], 0.00694876, null], ["rear", [0, 0.00711794, -0.0218361], [0, 0.9918, 0.1278, 0], 0.00694876, "ZacoeKit3_ManufacturerPlate_Geo_lodA_Kit3_ManufacturerPlate_Geo_lodA_BMW_M2G87TNR3_2023ManufacturerPlateD_Material_ZacoeBMW_M2G87TNR3_2023ManufacturerPlateD_Material1_0"]],
  "gt3rs": [["front", [0, 0.00317016, 0.0223332], [0.17365, 0, 0, 0.98481], 0.00687255, null], ["rear", [0, 0.00529432, -0.0229399], [0, 0.99545, 0.09529, 0], 0.00687255, "ManufacturerPlate_Geo_lodA_Porsche_911GT3RS992Tribute_2023ManufacturerPlateB_Material_0"]],
  "mclaren-765lt": [["front", [0, 0.00286507, 0.0223152], [0.15501, 0, 0, 0.98791], 0.00690362, null], ["rear", [0, 0.00512343, -0.0226331], [0, 0.99141, 0.13078, 0], 0.00690362, "ManufacturerPlate_Geo_lodA_McLaren_765LT_2021ManufacturerPlateA_Material_0"]],
  "g63": [["front", [0, 0.00562654, 0.0240741], [0.15954, 0, 0, 0.98719], 0.00737678, null], ["rear", [0, 0.00552604, -0.0212322], [0, 0.99988, 0.01549, 0], 0.00737678, "MManufacturerPlate_Geo_lodA_ManufacturerPlate_Geo_lodA_MercedesAMG_G63SUVRewardRecycled_2020ManufacturerPlateA_81eee94_MMercedesAMG_G63SUVRewardRecycled_2020ManufacturerPlateA_81eee95_0"]],
  "m4": [["front", [0, 0.00349589, 0.0238487], [0.11152, 0, 0, 0.99376], 0.0084884, null], ["rear", [0, 0.00609234, -0.0235245], [0, 0.98481, 0.17365, 0], 0.0084884, null]],
  "m3": [["front", [-3.89963e-07, 0.00434613, 0.0217983], [-0.01494, 0, 0, 0.99989], 0.00928735, "m3car_bmw_m3detach_bumper_front_25_pivotdetach_bumper_front_25detach_bumper_front_25_pivot_licenseplate_m3phong9SG1_0"], ["rear", [6.28002e-06, 0.00809006, -0.0230448], [0, 0.99151, 0.13002, 0], 0.00928735, "m3car_bmw_m3detach_trunk_20_pivot_licenseplatedetach_trunk_20_pivotdetach_trunk_20_m3phong9SG1_0"]],
  "x6": [["front", [1.16171e-10, 0.00858976, 0.0376367], [0.1152, 0, 0, 0.99334], 0.0152977, "Plane001_plate_0"], ["rear", [8.33109e-11, 0.0110797, -0.0368762], [0, 0.99255, 0.12187, 0], 0.0152977, "Plane005_plate_0"]],
  "isf": [["front", [-1.73472e-18, 0.00372126, 0.0224266], [0.17365, 0, 0, 0.98481], 0.00826224, null], ["rear", [-1.73472e-18, 0.0085814, -0.022696], [0, 0.98779, 0.15579, 0], 0.00826224, null]],
  "c63-ed507": [["front", [0, 0.00328732, 0.023331], [0.17365, 0, 0, 0.98481], 0.00979578, null], ["rear", [0, 0.00753396, -0.0223145], [0, 0.99269, 0.12069, 0], 0.00979578, "_ManufacturerPlate_Geo_lodA_ManufacturerPlate_Geo_lodA_MercedesBenz_C63AMGEdition507_2014ManufacturerPlateA_Material__MercedesBenz_C63AMGEdition507_2014ManufacturerPlateA_Material1_0"]],
  "spark": [["front", [5.96046e-09, 0.00524968, 0.0218137], [-0.03276, 0, 0, 0.99946], 0.00758, "fmspark_bumper_F_plateholder_Plastic_Black_0"], ["rear", [-0.000134124, 0.00497284, -0.0145764], [0, 0.9983, -0.05832, 0], 0.00758, null]],
};

let shared = null;

function drawChecker(ctx, x, y, cell, cols, rows, a, b) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 ? a : b;
      ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Canvas art: dark frame, white Euro-style plate, dark left strip with checker + neon mark, black PITLANE. */
export function drawPlateCanvas(canvas) {
  const W = TEX_W;
  const H = TEX_H;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const px = W / FACE_W; // pixels per metre
  const b = Math.round(FRAME_B * px);
  // frame
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, W, H);
  const fg = ctx.createLinearGradient(0, 0, 0, H);
  fg.addColorStop(0, 'rgba(255,255,255,0.10)');
  fg.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  fg.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, W, H);
  // plate body
  const pw = W - b * 2;
  const ph = H - b * 2;
  const r = Math.round(ph * 0.08);
  roundRect(ctx, b, b, pw, ph, r);
  ctx.fillStyle = '#f4f4f1';
  ctx.fill();
  ctx.save();
  roundRect(ctx, b, b, pw, ph, r);
  ctx.clip();
  // left strip
  const sw = Math.round(pw * 0.085);
  ctx.fillStyle = '#39FF14';
  ctx.fillRect(b, b, sw, ph);
  // checkered flag mark (no country code)
  const cols = 4;
  const rows = 5;
  const cell = Math.floor(Math.min((sw * 0.78) / cols, (ph * 0.74) / rows));
  const gx = b + Math.round((sw - cols * cell) / 2);
  const gy = b + Math.round((ph - rows * cell) / 2);
  drawChecker(ctx, gx, gy, cell, cols, rows, '#f4f4f1', '#111111');
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx, gy, cols * cell, rows * cell);
  // subtle inner stamp line
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(2, Math.round(ph * 0.022));
  roundRect(ctx, b + sw + ph * 0.04, b + ph * 0.06, pw - sw - ph * 0.08, ph * 0.88, r * 0.7);
  ctx.stroke();
  ctx.restore();
  // main text, condensed to fit
  const tx0 = b + sw;
  const tw = pw - sw;
  const fs = Math.round(ph * 0.78);
  ctx.font = `bold ${fs}px "DIN Condensed", "Roboto Condensed", "Arial Narrow", "Liberation Sans Narrow", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const text = 'PITLANE';
  const spacing = fs * 0.06;
  let natural = 0;
  for (const ch of text) natural += ctx.measureText(ch).width;
  natural += spacing * (text.length - 1);
  const maxW = tw * 0.84;
  const sx = Math.min(1, maxW / natural);
  ctx.save();
  ctx.translate(tx0 + (tw - natural * sx) / 2, b + ph / 2 + ph * 0.03);
  ctx.scale(sx, 1);
  ctx.fillStyle = '#0d0d0d';
  let cx = 0;
  for (const ch of text) {
    ctx.fillText(ch, cx, 0);
    cx += ctx.measureText(ch).width + spacing;
  }
  ctx.restore();
  // tiny frame text (bottom) in neon
  ctx.fillStyle = 'rgba(57,255,20,0.85)';
  ctx.font = `bold ${Math.max(9, Math.round(b * 0.62))}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P I T L A N E', W / 2, H - b / 2);
  return canvas;
}

function getShared(renderer) {
  if (shared) return shared;
  const canvas = drawPlateCanvas(document.createElement('canvas'));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  const faceMat = new THREE.MeshStandardMaterial({
    name: 'PITLANE_plate_face',
    map: tex,
    roughness: 0.38,
    metalness: 0.0,
    envMapIntensity: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const backMat = new THREE.MeshStandardMaterial({
    name: 'PITLANE_plate_frame',
    color: 0x111111,
    roughness: 0.55,
    metalness: 0.1,
    envMapIntensity: 0.6,
  });
  [faceMat, backMat].forEach((m) => { m.userData.__pitlaneShared = true; });
  const faceGeo = new THREE.PlaneGeometry(FACE_W, FACE_H);
  faceGeo.translate(0, 0, BACK_D / 2 + 0.0006);
  const backGeo = new THREE.BoxGeometry(FACE_W, FACE_H, BACK_D);
  shared = { tex, faceMat, backMat, faceGeo, backGeo };
  return shared;
}

/** Cache: modelId -> [{ end, pos, quat, scale, hideMesh }] (glbRoot-local). */
const placementCache = new Map();
const tmpBox = new THREE.Box3();

function opaqueVisibleMeshes(root, skip) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData?.__pitlanePlate) return;
    if (skip && skip(o)) return;
    let vis = true;
    for (let p = o; p; p = p.parent) { if (p.visible === false) { vis = false; break; } }
    if (!vis) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const allGlass = mats.every((m) => !m || m.transparent || Number(m.opacity ?? 1) < 0.95 || Number(m.transmission || 0) > 0.01 || m.alphaMap);
    if (allGlass) return;
    out.push(o);
  });
  return out;
}

/**
 * Fit a plane to hits sampled around (cx, cy) along dir (+-Z local), return placement.
 * All coordinates in root-local units; m = local units per metre.
 */
function placeByRay(root, targets, cx, cy, dirSign, m, cfg, zStart) {
  const ray = new THREE.Raycaster();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const toWorld = root.matrixWorld;
  const hw = (FACE_W / 2) * 0.92 * m;
  const hh = (FACE_H / 2) * 0.85 * m;
  const samples = [];
  const pts = [];
  for (let iy = -1; iy <= 1; iy++) {
    for (let ix = -4; ix <= 4; ix++) pts.push([(ix / 4) * hw, iy * hh]);
  }
  const dirLocal = new THREE.Vector3(0, 0, dirSign);
  for (const [dx, dy] of pts) {
    const o = new THREE.Vector3(cx + dx, cy + dy, zStart).applyMatrix4(toWorld);
    const d = dirLocal.clone().transformDirection(toWorld);
    ray.set(o, d);
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) continue;
    const p = hits[0].point.clone().applyMatrix4(inv);
    samples.push({ dx, dy, p });
  }
  if (samples.length < 3) return null;
  // pitch from top/bottom rows (least squares z vs y)
  let sy = 0, sz = 0, syy = 0, syz = 0;
  samples.forEach(({ p }) => { sy += p.y; sz += p.z; syy += p.y * p.y; syz += p.y * p.z; });
  const n = samples.length;
  const den = n * syy - sy * sy;
  let slope = den > 1e-12 ? (n * syz - sy * sz) / den : 0; // dz/dy
  // clamp pitch to +-20deg (plates are near vertical); cfg.pitch forces it (deg, + = leans back)
  const maxSlope = Math.tan(THREE.MathUtils.degToRad(20));
  slope = Math.max(-maxSlope, Math.min(maxSlope, slope));
  if (cfg.pitch != null) slope = Math.tan(THREE.MathUtils.degToRad(cfg.pitch)) * dirSign;
  // outward normal: for front (dirSign -1, facing +z) normal = (0, -slope, 1)
  const out = -dirSign;
  let normal = new THREE.Vector3(0, -slope * out, out).normalize();
  if (cfg.tilt) normal.applyAxisAngle(new THREE.Vector3(1, 0, 0), cfg.tilt * out);
  // back plane touches the most protruding sample
  let dmax = -Infinity;
  samples.forEach(({ p }) => { dmax = Math.max(dmax, p.dot(normal)); });
  const center = new THREE.Vector3(cx, cy, 0);
  // solve center.z so that center·normal = dmax + BACK_D/2 + push
  const want = dmax + (BACK_D / 2 + (cfg.push || 0)) * m;
  center.z = (want - center.x * normal.x - center.y * normal.y) / normal.z;
  return { center, normal };
}

function basisQuat(normal) {
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const up2 = new THREE.Vector3().crossVectors(normal, right).normalize();
  const mtx = new THREE.Matrix4().makeBasis(right, up2, normal);
  return new THREE.Quaternion().setFromRotationMatrix(mtx);
}

function computePlacements(root, modelId) {
  const cfg = PLATE_CONFIG[modelId];
  if (!cfg) return [];
  root.updateMatrixWorld(true);
  // skinned parts (GT3): bone matrices are only refreshed on render — raycast needs them now
  root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) { try { o.skeleton.update(); } catch (_) {} } });
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  // model bbox in root-local
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.userData?.__pitlanePlate) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmpBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
    box.union(tmpBox);
  });
  if (box.isEmpty()) return [];
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const m = maxDim / 4.8; // local units per metre at podium scale
  const cxModel = (box.min.x + box.max.x) / 2;
  // one plate size per car: fit the existing plate recess when the GLB has one
  const findMesh = (re) => { let t = null; root.traverse((o) => { if (!t && o.isMesh && re.test(o.name || '')) t = o; }); return t; };
  let carScale = cfg.scale || 0;
  if (!carScale) {
    const ratios = [];
    ['front', 'rear'].forEach((e) => {
      const re = cfg[e]?.mesh;
      const t = re && findMesh(re);
      if (!t) return;
      t.geometry.boundingBox || t.geometry.computeBoundingBox();
      const pb = t.geometry.boundingBox.clone().applyMatrix4(t.matrixWorld).applyMatrix4(inv);
      ratios.push((pb.max.x - pb.min.x) / m / PLATE_W);
    });
    carScale = ratios.length ? THREE.MathUtils.clamp(Math.min(...ratios), 0.72, 1.0) : 0.85;
  }
  const res = [];
  for (const end of ['front', 'rear']) {
    const c = cfg[end];
    if (!c || c.none) continue;
    const dirSign = end === 'front' ? -1 : 1; // ray travels toward the car
    const zStart = end === 'front' ? box.max.z + 0.5 * m : box.min.z - 0.5 * m;
    let placed = null;
    let hide = null;
    const scale = c.scale || carScale;
    if (c.mesh) {
      let target = null;
      root.traverse((o) => { if (!target && o.isMesh && c.mesh.test(o.name || '')) target = o; });
      if (target) {
        hide = target.name;
        target.geometry.boundingBox || target.geometry.computeBoundingBox();
        const pb = target.geometry.boundingBox.clone().applyMatrix4(target.matrixWorld).applyMatrix4(inv);
        const pc = pb.getCenter(new THREE.Vector3());
        // mount on the surface behind the old plate (old plate hidden)
        const targets = opaqueVisibleMeshes(root, (o) => o === target);
        placed = placeByRay(root, targets, pc.x + (c.x || 0) * m, pc.y + (c.dy || 0) * m, dirSign, m * scale, c, zStart);
        if (placed && c.flushToMesh !== false) {
          // don't sit behind the old plate plane either
          const d0 = end === 'front' ? pb.max.z : -pb.min.z;
          const dz = end === 'front' ? placed.center.z : -placed.center.z;
          const minDz = d0 + (BACK_D / 2) * m * 0.2;
          if (dz < minDz && Math.abs(placed.normal.z) > 0.8) {
            placed.center.z = end === 'front' ? minDz : -minDz;
          }
        }
      }
    }
    if (!placed) {
      const cy = box.min.y + (c.y ?? (end === 'front' ? 0.36 : 0.6)) * m;
      const targets = opaqueVisibleMeshes(root, hide ? (o) => o.name === hide : null);
      placed = placeByRay(root, targets, cxModel + (c.x || 0) * m, cy, dirSign, m * scale, c, zStart);
    }
    if (!placed) continue;
    res.push({
      end,
      pos: placed.center,
      quat: basisQuat(placed.normal),
      scale: m * scale,
      plateScale: +scale.toFixed(3),
      hideMesh: hide,
    });
  }
  return res;
}

/**
 * Attach PITLANE plates to a freshly cloned GLB root (before podium scale/position).
 * Safe to call on every switch: placements are cached per model id.
 */
export function attachPitlanePlates(root, modelId, renderer, { useBaked = true } = {}) {
  if (!root || !modelId || !PLATE_CONFIG[modelId]) return 0;
  if (root.children.some((c) => c.userData?.__pitlanePlate)) return 0; // already mounted
  // root must be untransformed for cached local placements to be valid
  const savedPos = root.position.clone();
  const savedQuat = root.quaternion.clone();
  const savedScale = root.scale.clone();
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  let list = placementCache.get(modelId);
  if (!list && useBaked && PLATE_BAKED[modelId]) {
    list = PLATE_BAKED[modelId].map(([end, pos, quat, scale, hideMesh]) => ({
      end,
      pos: new THREE.Vector3().fromArray(pos),
      quat: new THREE.Quaternion().fromArray(quat),
      scale,
      hideMesh,
    }));
    placementCache.set(modelId, list);
  }
  if (!list) {
    try { list = computePlacements(root, modelId); } catch (err) { console.warn('plates', modelId, err); list = []; }
    placementCache.set(modelId, list);
  }
  const s = getShared(renderer);
  const hideNames = new Set(list.map((p) => p.hideMesh).filter(Boolean));
  if (hideNames.size) {
    root.traverse((o) => { if (o.isMesh && hideNames.has(o.name)) o.visible = false; });
  }
  list.forEach((p) => {
    const g = new THREE.Group();
    g.name = 'PITLANE_plate_' + p.end;
    g.userData.__pitlanePlate = true;
    g.position.copy(p.pos);
    g.quaternion.copy(p.quat);
    g.scale.setScalar(p.scale);
    const back = new THREE.Mesh(s.backGeo, s.backMat);
    back.name = 'PITLANE_plate_frame_' + p.end;
    const face = new THREE.Mesh(s.faceGeo, s.faceMat);
    face.name = 'PITLANE_plate_face_' + p.end;
    [back, face].forEach((mesh) => {
      mesh.userData.__pitlanePlate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    });
    g.add(back, face);
    root.add(g);
  });
  root.position.copy(savedPos);
  root.quaternion.copy(savedQuat);
  root.scale.copy(savedScale);
  root.updateMatrixWorld(true);
  return list.length;
}

export function isPitlanePlate(o) {
  return !!(o && o.userData && o.userData.__pitlanePlate);
}

export function _debugPlacements() { return placementCache; }
