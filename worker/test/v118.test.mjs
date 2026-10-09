// v118: телефон в соревновании — отдельный зачёт C (топы разгонов и кругов, дуэли внутри класса), антифрод с порогами
// под ~1 Гц, удаление аккаунта чистит доски C, chase не держит старую скорость вне трассы — node test/v118.test.mjs
import { readFileSync } from 'node:fs';
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { lapBody, dragBody } from './traces.mjs';
import { createChaseTracker } from '../../chase-match.js';

const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, extra) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };
const kv = new MemKV();
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'C'.repeat(30),
  __fetch: async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })),
};
let ipSeq = 1;
async function call(method, path, { body, token, dev } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.118.0.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  if (dev) h['X-Device'] = dev;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId };
}
const A = await login('79011800001', 'Мага');
const B = await login('79011800002', 'Артём');
const DA = 'devAAAAAAAAAA118', DB = 'devBBBBBBBBBB118';
const phone = (disc, t, seed, o = {}) => dragBody(disc, t, {}, { src: 'phone', hz: 1, seed, ...o });
let seed = 500;

console.log('\n[зачёт C: разгоны телефоном — своя доска, A/B не видит]');
let r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: DA, body: phone('0-100', 5.2, seed++) });
ok(r.status === 200 && r.data.cls === 'c' && r.data.stored === true, 'телефон 1 Гц 0–100 → принят в зачёт C', r.data);
const row = r.data.rows?.[0];
ok(row && row.gpsQ === 'C' && row.cls === 'c' && row.src === 'phone' && row.hz <= 1.2, 'строка: метка C, класс c, источник телефон, ~1 Гц', row);
ok(row && !('th' in row) && !('acq' in row) && !('trace' in row), 'публичная строка C без хэша/трека/сырой оценки', row);
r = await call('GET', '/tops/drag/0-100');
ok(Array.isArray(r.data) && r.data.length === 0, 'GET A/B-доска 0–100 — пусто (C не смешивается)', r.data);
r = await call('GET', '/tops/drag/0-100?cls=c');
ok(Array.isArray(r.data) && r.data.length === 1 && r.data[0].gpsQ === 'C', 'GET ?cls=c — строка телефона', r.data);
ok((await kv.get('drag:0-100')) == null && (await kv.get('dragc:0-100')) != null, 'KV: drag:0-100 не тронут, dragc:0-100 записан');
r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: DA, body: phone('0-100', 5.6, seed++) });
ok(r.status === 200 && r.data.stored === false && r.data.rows.length === 1, 'худший телефонный заезд не заменяет лучший', r.data);
r = await call('POST', '/tops/drag/0-100', { token: B.token, dev: DB, body: dragBody('0-100', 4.4, {}, { src: 'ext', hz: 10, seed: seed++ }) });
ok(r.status === 200 && r.data.cls === 'ab' && (r.data.rows[0].gpsQ === 'A' || r.data.rows[0].gpsQ === 'B'), 'внешний 10 Гц → A/B, как раньше', r.data);
r = await call('GET', '/tops/drag/0-100?cls=c');
ok(r.data.length === 1 && r.data[0].src === 'phone', 'A/B-заезд не попал в доску C', r.data);
r = await call('POST', '/tops/straight/m4csl', { token: A.token, dev: DA, body: { name: 'Мага', ...phone('0-100', 5.0, seed++) } });
ok(r.status === 200 && r.data.cls === 'c', '/tops/straight телефоном → зачёт C', r.data);
r = await call('GET', '/tops/straight/m4csl');
ok(Array.isArray(r.data) && r.data.length === 0, 'A/B-список машины не тронут телефоном', r.data);
r = await call('POST', '/tops/drag/402m', { token: A.token, dev: DA, body: phone('402m', 13.1, seed++) });
ok(r.status === 200 && r.data.cls === 'c', '¼ мили телефоном → зачёт C', r.data);

console.log('\n[антифрод телефона: пороги под 1 Гц]');
for (const disc of ['60ft', '0-50']) {
  r = await call('POST', '/tops/drag/' + disc, { token: A.token, dev: DA, body: phone(disc, disc === '60ft' ? 2.2 : 3.0, seed++) });
  ok(r.status === 422 && r.data.code === 'phone_disc', `${disc} телефоном → phone_disc (2–3 точки — не замер)`, r.data);
}
r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: DA, body: phone('0-100', 6, seed++, { hz: 0.5 }) });
ok(r.status === 422 && r.data.code === 'low_hz', '0,5 Гц → low_hz', r.data);
r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: DA, body: phone('0-100', 5.2, seed++, { src: 'sim' }) });
ok(r.status === 422 && r.data.code === 'simulator', 'симулятор → simulator', r.data);
r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: DA, body: phone('0-100', 5.2, seed++, { acc: 30 }) });
ok(r.status === 422 && r.data.code === 'gps_c', 'телефон ±30 м → gps_c (слабо даже для C)', r.data);
{
  const w = phone('0-100', 5.2, seed++).trace;
  const p = w.p.map((x) => x.slice()); p[5][1] += 20000;
  r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: DA, body: { trace: { ...w, p } } });
  ok(r.status === 422 && r.data.code === 'teleport', 'телепорт на 1 Гц → teleport', r.data);
  const p2 = w.p.map((x) => x.slice()); p2[4][0] += 2500; // 1 с → 3,5 с
  r = await call('POST', '/tops/drag/0-100', { token: A.token, dev: DA, body: { trace: { ...w, p: p2 } } });
  ok(r.status === 422 && r.data.code === 'pause', 'дыра 3,5 с на 1 Гц → pause', r.data);
  const w3 = phone('0-100', 5.4, seed++).trace;
  const p3 = w3.p.map((x) => x.slice()); p3[4][0] += 1000; // 2 с — обычный пропуск телефона
  r = await call('POST', '/tops/drag/0-100', { token: B.token, dev: DB, body: { trace: { ...w3, p: p3 } } });
  ok(r.status === 200 && r.data.cls === 'c', 'пропуск 2 с (обычный для телефона) → принят', r.data);
  const w4 = dragBody('0-100', 5.2, {}, { src: 'ext', hz: 10, seed: seed++ }).trace;
  const p4 = w4.p.map((x) => x.slice()); p4[40][0] += 1500;
  r = await call('POST', '/tops/drag/0-100', { token: B.token, dev: DB, body: { trace: { ...w4, p: p4 } } });
  ok(r.status === 422 && r.data.code === 'pause', 'внешний 10 Гц: порог дыры прежний (1,6 с → pause)', r.data);
}
r = await call('POST', '/tops/drag/0-100', { token: B.token, dev: DB, body: phone('0-100', 1.3, seed++) });
ok(r.status === 422 && r.data.code === 'speed_flag', 'нереальное ускорение телефоном → speed_flag', r.data);

console.log('\n[круги телефоном: своя доска трассы, секторы/A/B не видят]');
r = await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW M4 CSL', tyre: 'Michelin Cup 2', carId: 'm4csl' } });
const lapP = lapBody('2:04.500', {}, { src: 'phone', hz: 1, seed: 41 });
r = await call('POST', '/tops/lap/sochi', { token: A.token, dev: DA, body: lapP });
ok(r.status === 200 && r.data.cls === 'c' && r.data.rows[0]?.gpsQ === 'C', 'круг телефоном (1 Гц) Сочи → зачёт C', r.data);
r = await call('GET', '/tops/lap/sochi');
ok(Array.isArray(r.data) && r.data.length === 0, 'A/B-топ трассы пуст', r.data);
r = await call('GET', '/tops/lap/sochi?cls=c&avatars=1');
ok(Array.isArray(r.data) && r.data.length === 1 && r.data[0].cls === 'c', 'GET ?cls=c — круг телефона', r.data);
r = await call('GET', '/tops/sector/sochi');
ok(r.data && Array.isArray(r.data.sectors) && r.data.sectors.every((x) => x.length === 0), 'секторный топ телефонные круги не видит', r.data);

console.log('\n[дуэли: сравнение только внутри класса]');
// A/B-дуэль: первым — внешний GPS; ответ телефоном несопоставим → отказ
let d = (await call('POST', '/duel', { token: A.token, body: { type: 'drag' } })).data;
r = await call('POST', `/duel/${d.id}/run`, { token: A.token, dev: DA, body: dragBody('0-100', 4.6, {}, { src: 'ext', hz: 10, seed: seed++ }) });
ok(r.status === 200 && r.data.cls === 'ab', 'первый заезд внешним GPS → дуэль A/B', r.data);
r = await call('POST', `/duel/${d.id}/run`, { token: B.token, dev: DB, body: phone('0-100', 4.4, seed++) });
ok(r.status === 422 && r.data.code === 'class_mismatch', 'ответ телефоном на A/B-вызов → class_mismatch', r.data);
r = await call('GET', `/duel/${d.id}`);
ok(r.data.status === 'open' && !r.data.challengerRun, 'A/B-дуэль осталась открытой (отказ ничего не записал)', r.data);
// C-дуэль: первым — телефон; ответ внешним GPS принимается, но считается как C
d = (await call('POST', '/duel', { token: A.token, body: { type: 'drag' } })).data;
r = await call('POST', `/duel/${d.id}/run`, { token: A.token, dev: DA, body: phone('0-100', 5.1, seed++) });
ok(r.status === 200 && r.data.cls === 'c' && r.data.creatorRun.gpsQ === 'C', 'первый заезд телефоном → дуэль C', r.data);
r = await call('POST', `/duel/${d.id}/run`, { token: B.token, dev: DB, body: dragBody('0-100', 4.8, {}, { src: 'ext', hz: 10, seed: seed++ }) });
ok(r.status === 200 && r.data.status === 'ready' && r.data.challengerRun.asC === true && r.data.challengerRun.cls === 'c', 'ответ внешним GPS в C-дуэли → принят, «засчитан как C»', r.data);
ok(r.data.winner === 'challenger', 'победитель по серверному времени', r.data.winner);
// явный класс при создании: телефон на телефон
d = (await call('POST', '/duel', { token: B.token, body: { type: 'drag', cls: 'c' } })).data;
ok(d.cls === 'c', 'вызов с cls:c → класс C до первого заезда', d);
r = await call('POST', `/duel/${d.id}/run`, { token: B.token, dev: DB, body: phone('0-100', 5.5, seed++) });
r = await call('POST', `/duel/${d.id}/run`, { token: A.token, dev: DA, body: phone('0-100', 5.3, seed++) });
ok(r.status === 200 && r.data.status === 'ready' && r.data.winner === 'challenger', 'телефон на телефон: дуэль сыграна', r.data);
d = (await call('POST', '/duel', { token: B.token, body: { type: 'drag', cls: 'ab' } })).data;
r = await call('POST', `/duel/${d.id}/run`, { token: B.token, dev: DB, body: phone('0-100', 5.5, seed++) });
ok(r.status === 422 && r.data.code === 'class_mismatch', 'вызов cls:ab — даже первый телефонный заезд отклоняется', r.data);
r = await call('POST', `/duel/${d.id}/run`, { token: B.token, dev: DB, body: phone('60ft', 2.2, seed++) });
ok(r.status === 422, 'телефон в дуэли по 60 ft — не принимается', r.data);

console.log('\n[удаление аккаунта чистит доски C]');
r = await call('DELETE', '/account', { token: A.token });
ok(r.status === 200, 'DELETE /account', r.data);
const dc = JSON.parse((await kv.get('dragc:0-100')) || '[]');
const lc = JSON.parse((await kv.get('lapc:sochi')) || '[]');
ok(!dc.some((x) => x.pilotId === A.id) && !lc.some((x) => x.pilotId === A.id) && dc.some((x) => x.pilotId === B.id), 'строки A удалены из dragc/lapc, чужие остались', { dc: dc.length, lc: lc.length });

console.log('\n[chase: вне трассы старая точка не держит скорость (было «42 км/ч» после заезда)]');
{
  const samples = []; for (let i = 0; i < 400; i++) { const a = (i / 400) * Math.PI * 2; samples.push(Math.cos(a) * 500, Math.sin(a) * 500, -Math.sin(a), Math.cos(a)); }
  const tr = createChaseTracker(samples, 2 * Math.PI * 500);
  tr.feed({ x: 3000, z: 3000, t: 10, speedMs: 42 / 3.6 });
  const f1 = tr.frame(10.5);
  ok(f1.state === 'far' && Math.round(f1.kmh) === 42, 'свежая точка вне трассы — скорость видна', f1);
  const f2 = tr.frame(14);
  ok(f2.state === 'far' && f2.kmh === 0, 'точка старше LOST_S — 0, а не последняя скорость', f2);
}

console.log('\n[клиент: тексты, мёртвый код, версии]');
const app = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const method = readFileSync(new URL('../../method.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
ok(!/телефон · не в топ/.test(app) && !/телефон · не в топ/.test(method), 'нет «телефон · не в топ» в app.js и method.html');
ok(/телефон · зачёт C/.test(app) && /зачёт C/.test(method) && /±0,3 с/.test(method), '«телефон · зачёт C» + точность в методике');
ok(/справочно · телефон · зачёт C/.test(app), 'пометка «справочно» сохранена');
ok(!/interpolateCross/.test(app), 'interpolateCross удалён');
ok(/p\.n = tp\.n/.test(app), 'шейр берёт паспорт итога (весь трек), а не срез на 0–100');
const ver = (app.match(/APP_VERSION = '(v\d+)'/) || [])[1];
ok(ver && ver >= 'v118' && sw.includes(`pitlane-${ver}`), 'APP_VERSION = SW CACHE', ver);

console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v118 all passed');
process.exit(fails ? 1 : 0);
