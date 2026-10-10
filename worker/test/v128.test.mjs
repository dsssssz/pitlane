// v128: погода заезда (Open-Meteo, сервер, кэш по сетке) — node test/v128.test.mjs. Сеть не трогаем: только мок __wxFetch.
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { dragBody, lapBody } from './traces.mjs';
import { parseWx, wetBucket, timeOfDay, headwind, wxKey, runWeather, WX_TIMEOUT_MS } from '../src/wx.js';
import fs from 'fs';
const worker = withAutoRefresh(rawWorker);
let fails = 0; const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const HOUR = 3600e3;
function omResponse(at, { t = 14.2, rh = 71, p = 1002.4, pr = 0, prPrev = 0, ws = 4.3, wd = 0, code = 2 } = {}) {
  const h0 = Math.floor(at / HOUR) * HOUR - 3 * HOUR; const time = []; const arr = (v, vPrev) => [];
  const H = { time: [], temperature_2m: [], relative_humidity_2m: [], surface_pressure: [], precipitation: [], weather_code: [], wind_speed_10m: [], wind_direction_10m: [] };
  for (let k = 0; k < 6; k++) { const ms = h0 + k * HOUR; H.time.push(ms / 1000); H.temperature_2m.push(t); H.relative_humidity_2m.push(rh); H.surface_pressure.push(p); H.precipitation.push(k === 3 ? pr : prPrev); H.weather_code.push(code); H.wind_speed_10m.push(ws); H.wind_direction_10m.push(wd); }
  const day = Math.floor(at / 86400e3) * 86400;
  return { hourly: H, daily: { time: [day - 86400, day], sunrise: [day - 86400 + 4 * 3600, (at - 4 * HOUR) / 1000], sunset: [day - 86400 + 15 * 3600, (at + 6 * HOUR) / 1000] } };
}
const urls = []; let mode = 'ok'; let mockOpt = {};
const env = { PITLANE: new MemKV(), SMS_DEMO: '1', WX_ENABLED: '1',
  __wxFetch: async (u, init) => { urls.push(u); if (mode === 'fail') throw new Error('net'); if (mode === 'hang') return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort')))); const at = Number(new URL(u).searchParams.get('_at')) || Date.now(); return new Response(JSON.stringify(omResponse(mockAt ?? at, mockOpt)), { status: 200 }); } };
let mockAt = null; let ip = 1;
const call = async (m, p, { body, token, e = env } = {}) => { const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.128.0.' + (ip++ % 250), 'X-Device': 'dev128' + (token || '').slice(-6) }; if (token) h.Authorization = 'Bearer ' + token; const r = await worker.fetch(new Request('https://api.test' + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined }), e); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d }; };
const login = async (ph, nick, e = env) => { const o = await call('POST', '/auth/otp', { body: { phone: ph }, e }); const v = await call('POST', '/auth/verify', { body: { phone: ph, code: o.data.demoCode, nick }, e }); return { token: v.data.token, id: v.data.pilotId }; };

console.log('[разбор Open-Meteo]');
const at0 = Date.UTC(2026, 9, 10, 12, 20);
mockAt = at0;
const w = parseWx(omResponse(at0, {}), at0);
ok(w && w.t === 14.2 && w.rh === 71 && w.p === 1002 && w.ws === 4.3 && w.wd === 0 && w.wet === 'dry' && w.src === 'om', 'час старта → t/rh/p/ветер/сухо', w);
ok(w.tod === 'day', 'время суток по солнцу', w.tod);
ok(wetBucket(1.2, 0, 61) === 'wet' && wetBucket(0.1, 0, 51) === 'damp' && wetBucket(0, 0.4, 1) === 'damp' && wetBucket(0, 0, 3) === 'dry', 'бакеты сухо/сыро/мокро (осадки, за 2 ч, код WMO)');
const rise = Date.UTC(2026, 9, 10, 4), set = Date.UTC(2026, 9, 10, 15);
ok(timeOfDay(rise + HOUR, rise, set) === 'morning' && timeOfDay(rise + 5 * HOUR, rise, set) === 'day' && timeOfDay(set - HOUR, rise, set) === 'evening' && timeOfDay(set + 2 * HOUR, rise, set) === 'night', 'утро / день / вечер / ночь');
ok(headwind(5, 0, 0) === 5 && headwind(5, 180, 0) === -5 && Math.abs(headwind(5, 90, 0)) < 0.1, 'встречный +, попутный −, боковой ≈ 0');
ok(wxKey(55.75432, 37.61789, at0) === 'wx:55.8:37.6:2026-10-10T12:00', 'ключ кэша: сетка 0.1° × час', wxKey(55.75432, 37.61789, at0));
ok(parseWx({ hourly: { time: [] } }, at0) === null && parseWx(null, at0) === null, 'пустой ответ → null');

console.log('[заезд: сервер сам запрашивает погоду]');
mockAt = null;
const A = await login('79012800001', 'Мага');
await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW M2', carId: 'g87-m2', tyre: 'street' } });
let r = await call('POST', '/tops/drag/0-60mph', { token: A.token, body: dragBody('0-60mph', 3.9, {}, { seed: 11 }) });
if (r.status === 400) r = await call('POST', '/tops/drag/100-200', { token: A.token, body: dragBody('100-200', 7.5, {}, { seed: 11 }) });
ok(r.status === 200 && r.data.wx && r.data.wx.t === 14.2 && r.data.wx.wet === 'dry', 'ответ разгона несёт wx', r.data);
ok(r.data.wx.hw === 4.3, 'разгон на север, ветер с севера → встречный', r.data.wx);
const u = new URL(urls[urls.length - 1]);
ok(/^\d+\.\d$/.test(u.searchParams.get('latitude')) && /^\d+\.\d$/.test(u.searchParams.get('longitude')), 'наружу — только округлённые координаты', u.search.slice(0, 60));
ok(u.hostname === 'api.open-meteo.com' && u.searchParams.get('timeformat') === 'unixtime', 'бесплатный эндпоинт без ключа');
const pub = r.data.rows.find((x) => x.wx);
ok(pub && !('lat' in pub.wx) && !('lon' in pub.wx) && JSON.stringify(r.data).indexOf('55.75') < 0, 'координат нет ни в строке, ни в ответе');
const n1 = urls.length;
r = await call('POST', '/tops/straight/g87-m2', { token: A.token, body: dragBody('0-100', 4.4, {}, { seed: 12 }) });
ok(r.status === 200 && urls.length === n1, 'тот же час и клетка — из кэша, без повторного запроса', urls.length - n1);
const mine = (Array.isArray(r.data) ? r.data : r.data.rows).find((x) => x.wx);
ok(mine && mine.weather === 'dry', '0–100: бакет «сухо» ставит сервер');

console.log('[недоступно / таймаут / лимит → заезд сохраняется без погоды]');
const env2 = { ...env, PITLANE: new MemKV() };
const B = await login('79012800002', 'Артём', env2);
await call('PUT', '/me/car', { token: B.token, body: { model: 'BMW M2', carId: 'g87-m2', tyre: 'street' }, e: env2 });
mode = 'fail';
r = await call('POST', '/tops/straight/g87-m2', { token: B.token, body: dragBody('0-100', 4.6, {}, { seed: 13 }), e: env2 });
ok(r.status === 200 && !(Array.isArray(r.data) ? r.data : r.data.rows).some((x) => x.wx), 'сеть упала → 200 без wx');
{ const ks = [...(env2.PITLANE.m.keys())].filter((k) => String(k).startsWith('wx:')); console.log('    keys', ks); ok(ks.length >= 1, 'отрицательный кэш (не долбим сервис)'); }
mode = 'hang';
const t0 = Date.now(); const wh = await runWeather({ ...env2, PITLANE: new MemKV() }, { lat: 50, lon: 30, t0: Date.now() - 1000 });
ok(wh === null && Date.now() - t0 < WX_TIMEOUT_MS + 800, 'зависание → таймаут ' + WX_TIMEOUT_MS + ' мс → null', Date.now() - t0);
mode = 'ok';
const env3 = { ...env, PITLANE: new MemKV() };
await env3.PITLANE.put('rl:wx:d:' + new Date().toISOString().slice(0, 10), '2500');
ok(await runWeather(env3, { lat: 51, lon: 31, t0: Date.now() - 1000 }) === null, 'суточный лимит запросов → без погоды');
ok(await runWeather({ ...env, WX_ENABLED: undefined }, { lat: 51, lon: 31, t0: Date.now() }) === null, 'без WX_ENABLED=1 — не запрашивает');
const before = urls.length;
r = await call('POST', '/tops/straight/g87-m2', { token: B.token, body: dragBody('0-100', 4.5, {}, { seed: 14 }), e: { ...env2, WX_ENABLED: '0' } });
ok(r.status === 200 && urls.length === before, 'WX_ENABLED=0 — заезд сохраняется, метео не вызывается');

console.log('[круг]');
mockOpt = { pr: 1.4, code: 63 };
const C = await login('79012800003', 'Лиза');
await call('PUT', '/me/car', { token: C.token, body: { model: 'BMW M3', carId: 'g80-m3', tyre: 'street' } });
r = await call('POST', '/tops/lap/sochi', { token: C.token, body: lapBody('1:55.0', { weather: 'dry' }, { seed: 31 }) });
const lr = (Array.isArray(r.data) ? r.data : r.data.rows || []).find((x) => x.wx);
ok(r.status === 200 && lr && lr.wx.wet === 'wet' && lr.weather === 'wet', 'круг: сервер перекрывает «сухо» клиента — дождь → мокро', r.data);
ok(lr && lr.wx.hw === undefined, 'у круга нет встречного/попутного (курс меняется)');
const g = await call('GET', '/tops/lap/sochi?weather=dry');
ok(Array.isArray(g.data) && !g.data.some((x) => x.pilotId === lr.pilotId), 'фильтр «сухо» в топе не видит мокрый круг');

console.log('[шейр]');
r = await call('POST', '/share', { token: A.token, body: { brand: 'PITLANE', type: '0-100', time: '4.40 с', car: 'BMW M2', nick: 'Мага', valid: true, at: Date.now(), wx: { src: 'om', t: 14.2, ws: 4.3, hw: 4.3, wet: 'dry', tod: 'day', lat: 55.75, evil: '<b>' } } });
const sh = r.data?.id ? await call('GET', '/share/' + r.data.id) : null;
const sp = sh?.data?.payload || sh?.data;
ok(sp && sp.wx && sp.wx.t === 14.2 && sp.wx.hw === 4.3 && !('lat' in sp.wx) && !('evil' in sp.wx), 'шейр: wx только по белому списку', sh?.data);

console.log('[клиент]');
const root = new URL('../../', import.meta.url).pathname;
const app = fs.readFileSync(root + 'app.js', 'utf8'); const html = fs.readFileSync(root + 'index.html', 'utf8'); const method = fs.readFileSync(root + 'method.html', 'utf8');
ok(/function wxLine\(w0\)/.test(app) && /function wxShareLine\(w0\)/.test(app) && /function cleanWx\(w\)/.test(app), 'строки погоды + белый список');
ok(/id="rdWx" hidden>.*по данным метеосервиса, не датчик асфальта/.test(html), 'карточка результата: честная пометка');
ok(/id="topTodChips"/.test(html) && /function filterRowsByTod/.test(app), 'фильтр топа «день / вечер»');
ok(/Weather data by Open-Meteo\.com/.test(method) && /CC BY 4\.0/.test(method) && /не датчик асфальта/.test(method), 'атрибуция и методика в method.html');
ok(!/innerHTML[^;]*wxLine|innerHTML[^;]*wxShareLine/.test(app), 'погода — только textContent');
const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
ok(/^WX_ENABLED = "1"/m.test(toml), 'прод: включено в wrangler.toml');
ok(/const APP_VERSION = 'v1(2[8-9]|[3-9]\d)'/.test(app), 'APP_VERSION ≥ v128');
console.log(fails ? `\n${fails} FAIL` : '\nOK'); process.exit(fails ? 1 : 0);
