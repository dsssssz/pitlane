// Renders the Telegram bot welcome banner (1280×640 JPEG) from the site's own assets:
// Sochi circuit outline (geo/outlines.js) + a neon coupe outline (img/sil/coupe.svg path) + PITLANE wordmark.
// Usage: ROOT=$PWD node tools/tg-banner.mjs   → img/tg/banner.jpg  (needs puppeteer-core + Chrome)
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = process.env.ROOT || process.cwd();
const OUT = process.env.OUT || path.join(ROOT, 'img/tg/banner.jpg');
const { TRACK_OUTLINES } = await import(pathToFileURL(path.join(ROOT, 'geo/outlines.js')).href);

// Track → SVG path fitted into a box (equirectangular with cos(lat) scaling)
function trackPath(id, box) {
  const pts = TRACK_OUTLINES[id].coords;
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([lon, lat]) => [lon * k, -lat]);
  const xs = xy.map((p) => p[0]); const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  const ox = box.x + (box.w - (maxX - minX) * s) / 2; const oy = box.y + (box.h - (maxY - minY) * s) / 2;
  const P = xy.map(([x, y]) => [ox + (x - minX) * s, oy + (y - minY) * s]);
  return { d: 'M' + P.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' Z', start: P[0] };
}
const tr = trackPath('sochi', { x: 720, y: 60, w: 500, h: 330 });
const coupe = fs.readFileSync(path.join(ROOT, 'img/sil/coupe.svg'), 'utf8');
const body = coupe.match(/<path d="(M70 238[^"]+)"/)[1];
const glass = coupe.match(/<path d="(M300 140[^"]+)"/)[1];

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,800;1,800&family=Manrope:wght@500;700&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:1280px;height:640px;overflow:hidden;background:#1a1a1a}
.b{position:relative;width:1280px;height:640px;background:
 radial-gradient(900px 520px at 78% 38%, rgba(57,255,20,.10), transparent 60%),
 radial-gradient(700px 400px at 10% 100%, rgba(57,255,20,.05), transparent 70%),
 repeating-linear-gradient(115deg, rgba(255,255,255,.018) 0 2px, transparent 2px 22px), #1a1a1a}
svg{position:absolute;inset:0}
.txt{position:absolute;left:84px;top:150px}
.wm{font:italic 800 176px/0.9 "Barlow Condensed",sans-serif;letter-spacing:.035em;color:#39FF14;
 text-shadow:0 0 18px rgba(57,255,20,.55),0 0 60px rgba(57,255,20,.25)}
.sub{margin-top:22px;font:700 27px/1.25 Manrope,sans-serif;letter-spacing:.14em;color:#e2e2e2;text-transform:uppercase}
.chips{margin-top:34px;display:flex;gap:12px}
.chip{font:600 24px/1 "Barlow Condensed",sans-serif;letter-spacing:.12em;color:#39FF14;border:1.5px solid rgba(57,255,20,.55);
 background:rgba(57,255,20,.07);border-radius:999px;padding:10px 18px}
.bar{position:absolute;left:84px;top:118px;width:120px;height:6px;background:#39FF14;box-shadow:0 0 14px rgba(57,255,20,.7);transform:skewX(-20deg)}
</style></head><body><div class="b">
<svg width="1280" height="640" viewBox="0 0 1280 640">
 <defs><filter id="gl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
 <path d="${tr.d}" fill="none" stroke="#39FF14" stroke-opacity=".12" stroke-width="16" stroke-linejoin="round"/>
 <path d="${tr.d}" fill="none" stroke="#39FF14" stroke-opacity=".6" stroke-width="3" stroke-linejoin="round" filter="url(#gl)"/>
 <circle cx="${tr.start[0].toFixed(1)}" cy="${tr.start[1].toFixed(1)}" r="9" fill="#39FF14" filter="url(#gl)"/>
 <g transform="translate(772 420) scale(0.62)" opacity=".95">
  <ellipse cx="400" cy="296" rx="300" ry="14" fill="#39FF14" opacity=".10"/>
  <path d="${body}" fill="#141614" stroke="#39FF14" stroke-width="3.5" stroke-linejoin="round" filter="url(#gl)"/>
  <path d="${glass}" fill="#0b0d0b" stroke="#39FF14" stroke-opacity=".6" stroke-width="2"/>
  <circle cx="180" cy="255" r="34" fill="#0d0d0d" stroke="#39FF14" stroke-width="3"/><circle cx="180" cy="255" r="12" fill="#39FF14" opacity=".5"/>
  <circle cx="580" cy="255" r="34" fill="#0d0d0d" stroke="#39FF14" stroke-width="3"/><circle cx="580" cy="255" r="12" fill="#39FF14" opacity=".5"/>
 </g>
 <path d="M0 612 H1280" stroke="#39FF14" stroke-opacity=".18" stroke-width="2"/>
</svg>
<div class="bar"></div>
<div class="txt"><div class="wm">PITLANE</div>
<div class="sub">Гараж и телеметрия<br>для трека</div>
<div class="chips"><span class="chip">0–100 GPS</span><span class="chip">КРУГИ</span><span class="chip">ТОПЫ</span><span class="chip">ДУЭЛИ</span></div></div>
</div></body></html>`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, type: 'jpeg', quality: 88 });
await browser.close();
console.log('banner →', OUT, fs.statSync(OUT).size, 'bytes');
