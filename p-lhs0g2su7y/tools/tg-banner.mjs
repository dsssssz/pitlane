// Renders the Telegram bot welcome banner (1280×640 JPEG, 2:1):
// v183: photoreal sports car (img/tg/car-hero.jpg, 16:9, no badges/plates) on the right, dark fade on the left for the
// PITLANE logo + subtitle + chips. The old cartoon coupe silhouette is gone.
// Usage: ROOT=$PWD node tools/tg-banner.mjs   → img/tg/banner.jpg  (needs puppeteer-core + Chrome)
// After a new banner: bump ?v= in worker/src/botcopy.js (TG_BANNER_URL) — Telegram caches photos by URL.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = process.env.ROOT || process.cwd();
const OUT = process.env.OUT || path.join(ROOT, 'img/tg/banner.jpg');
const CAR = process.env.CAR || path.join(ROOT, 'img/tg/car-hero.jpg');
if (!fs.existsSync(CAR)) { console.error('no car photo:', CAR); process.exit(1); }
const carUrl = 'data:image/jpeg;base64,' + fs.readFileSync(CAR).toString('base64');
const LOGO = fs.readFileSync(path.join(ROOT, 'img/logo/pitlane-logo.svg'), 'utf8'); // v175: настоящий логотип вместо набранного шрифтом слова
const CAR_X = Number(process.env.CAR_X || 52); // % — горизонтальная привязка кадра (машина справа)

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,800;1,800&family=Manrope:wght@500;700&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:1280px;height:640px;overflow:hidden;background:#1a1a1a}
.b{position:relative;width:1280px;height:640px;overflow:hidden;background:#000}
.car{position:absolute;inset:0;background:url(${carUrl}) ${CAR_X}% 58%/cover no-repeat}
.fade{position:absolute;inset:0;background:linear-gradient(90deg,#000 0%,rgba(0,0,0,.92) 30%,rgba(0,0,0,.55) 48%,rgba(0,0,0,0) 64%),linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0) 30%)}
svg{position:absolute;inset:0}
.txt{position:absolute;left:84px;top:150px}
.wm svg{position:static;display:block;width:100%;height:auto}
.wm{width:560px;line-height:0;
}
.sub{margin-top:22px;font:700 27px/1.25 Manrope,sans-serif;letter-spacing:.14em;color:#e2e2e2;text-transform:uppercase}
.chips{margin-top:34px;display:flex;gap:12px}
.chip{font:600 24px/1 "Barlow Condensed",sans-serif;letter-spacing:.12em;color:#C9C6BF;border:1.5px solid rgba(201,198,191,.55);
 background:rgba(201,198,191,.07);border-radius:999px;padding:10px 18px}
.bar{display:none;position:absolute;left:84px;top:118px;width:120px;height:6px;background:#C9C6BF;box-shadow:0 0 14px rgba(201,198,191,.7);transform:skewX(-20deg)}
</style></head><body><div class="b">
<div class="car"></div><div class="fade"></div>
<div class="bar"></div>
<div class="txt"><div class="wm">${LOGO}</div>
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
