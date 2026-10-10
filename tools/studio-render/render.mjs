import puppeteer from 'puppeteer-core'; import http from 'http'; import fs from 'fs'; import path from 'path';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp' };
http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const ROOT = new URL('../../', import.meta.url).pathname; const p = u === '/studio.html' ? new URL('./studio.html', import.meta.url).pathname : path.join(ROOT, u);
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(8971);
const ids = (process.argv[2] || 'g87-m2').split(','); const w = +(process.argv[3] || 3120), h = Math.round(w * 0.625);
const opt = JSON.parse(process.argv[4] || '{}');
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=6000'] });
const page = await browser.newPage(); page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('  [page]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('  [pe]', e.message));
await page.setViewport({ width: 400, height: 300 });
await page.goto(`http://localhost:8971/studio.html?w=${w}&h=${h}`); await page.waitForFunction('window.__ready', { timeout: 60000 });
fs.mkdirSync(new URL('./out', import.meta.url).pathname, { recursive: true });
for (const id of ids) { const t0 = Date.now(); const url = await page.evaluate((id, o) => window.renderCar(id, o), id, opt[id] || opt['*'] || {});
  fs.writeFileSync(new URL('./out/' + id + '.png', import.meta.url).pathname, Buffer.from(url.split(',')[1], 'base64')); console.log(id, (Date.now() - t0) + 'ms'); }
await browser.close(); process.exit(0);
