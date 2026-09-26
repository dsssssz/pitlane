// Offline car thumbnails for the picker: renders every MODEL_CATALOG GLB on the real podium (high tier) → img/cars/<id>.webp (256px)
// Usage (from repo root, needs Chrome + `npm i puppeteer-core` somewhere on NODE_PATH):
//   ROOT=$PWD node tools/car-thumbs.mjs            → img/cars/<id>.webp for every MODEL_CATALOG car
//   ONLY=g63,m4 ROOT=$PWD node tools/car-thumbs.mjs → just those
// Renders on the real podium (high tier, SwiftShader is fine), 3/4 view, centre square → 512 → 256 px WebP q0.82.
import puppeteer from 'puppeteer-core'; import fs from 'fs'; import http from 'http'; import path from 'path';
const types = { '.html':'text/html', '.js':'text/javascript', '.glb':'model/gltf-binary', '.png':'image/png', '.webp':'image/webp', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml', '.mp3':'audio/mpeg' };
const HOOK = "controls.target.set(0, 0.55, 0);";
function serve(ROOT, PORT) {
  return http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? '/index.html' : u);
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } if (u === '/app.js') d = Buffer.from(String(d).replace(HOOK, HOOK + " window.__pl={camera,controls,renderer,scene};")); res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(PORT);
}

const PORT = 9731; const ROOT = process.env.ROOT; const srv = serve(ROOT, PORT); const OUT = process.env.OUTDIR || ROOT + '/img/cars'; fs.mkdirSync(OUT, { recursive: true });
const NAMES = { 'BMW G87 M2 Widebody': 'g87-m2', 'Porsche 911 GT3 RS': 'gt3rs', 'McLaren 765LT': 'mclaren-765lt', 'Mercedes-AMG G 63': 'g63', 'BMW M4': 'm4', 'BMW M3 Competition': 'm3', 'BMW X6 xDrive40i': 'x6', 'Lexus IS-F': 'isf', 'Mercedes-AMG C 63 Edition 507': 'c63-ed507', 'Chevrolet Spark GT': 'spark' };
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/CORS|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`http://localhost:${PORT}/index.html?view=garage&quality=high`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.waitForFunction(() => document.getElementById('boxName')?.textContent?.length > 0 && window.__pl, { timeout: 120000 });
await sleep(5000);
const done = new Set(); const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : Object.values(NAMES);
for (let i = 0; i < 14 && done.size < ONLY.length; i++) {
  const name = await page.evaluate(() => document.getElementById('boxName').textContent.trim());
  const id = NAMES[name];
  if (id && !done.has(id) && ONLY.includes(id)) {
    // wait until this model's GLB is on the podium (mesh count stable)
    let prev = -1;
    for (let k = 0; k < 120; k++) { const n = await page.evaluate(() => { let n = 0; window.__pl.scene.traverse((o) => { if (o.isMesh) n++; }); return n; }); if (n === prev && n > 20) break; prev = n; await sleep(1500); }
    await page.evaluate(() => { window.__pitlane3d.driveInSeek?.(99999); window.__pl.controls.autoRotate = false; });
    await sleep(2500);
    const d = await page.evaluate((env) => { const process = { env };
      const { camera, controls, renderer, scene } = window.__pl;
      const t = controls.target; const A = +(process.env.ANG || 14) * Math.PI / 180, R = +(process.env.RAD || 7.8); camera.position.set(Math.cos(A) * R, +(process.env.CH || 2.2), Math.sin(A) * R); camera.lookAt(t.x, t.y * 0.85, t.z); camera.updateMatrixWorld(true);
      renderer.render(scene, camera); renderer.render(scene, camera);
      const src = renderer.domElement; const side = Math.min(src.width, src.height);
      const sx = (src.width - side) / 2, sy = (src.height - side) / 2;
      const c1 = document.createElement('canvas'); c1.width = c1.height = 512; const g1 = c1.getContext('2d'); g1.imageSmoothingQuality = 'high'; g1.drawImage(src, sx, sy, side, side, 0, 0, 512, 512);
      const c2 = document.createElement('canvas'); c2.width = c2.height = 256; const g2 = c2.getContext('2d'); g2.imageSmoothingQuality = 'high'; g2.drawImage(c1, 0, 0, 256, 256);
      return c2.toDataURL('image/webp', 0.82);
    }, { ANG: process.env.ANG, RAD: process.env.RAD, CH: process.env.CH });
    fs.writeFileSync(`${OUT}/${id}.webp`, Buffer.from(d.split(',')[1], 'base64'));
    done.add(id); console.log('thumb', id, Math.round(d.length * 0.75 / 1024) + ' KB');
  }
  await page.click('#btnCarNext'); await sleep(1200);
}
console.log('done', done.size, 'errors', JSON.stringify(errs));
await browser.close(); srv.close();
