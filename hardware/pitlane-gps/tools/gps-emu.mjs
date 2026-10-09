#!/usr/bin/env node
// Эмулятор PITLANE GPS по Wi-Fi: тот же протокол, что у прошивки (src/netlink.cpp) — привязка кодом,
// WSS /gps/ws с токеном устройства, hello/ack, пачки точек раз в 200 мс, отметки чипа сразу, статус 1 Гц,
// буфер и доотправка после обрыва. Разгон — tools/run-profile.mjs, отметки — tools/marks.mjs (= marks.cpp).
//
//   node tools/gps-emu.mjs --api http://localhost:8787 --code K7P2QX            # привязать и проехать 0–300
//   node tools/gps-emu.mjs --api … --token <токен> --hz 25 --vmax 305 --drop 150:3   # обрыв на 150 км/ч на 3 с
//   ws-модуль: npm i ws (или PL_WS=/путь/к/node_modules/ws)
import { createRequire } from 'node:module';
import { makeRun } from './run-profile.mjs';
import { createTracker } from './marks.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']); return a; }, []));
const API = (args.api || 'http://localhost:8787').replace(/\/+$/, '');
const HZ = Number(args.hz || 25); const VMAX = Number(args.vmax || 305);
const STAND = Number(args.stand || 4);
const [DROP_KMH, DROP_S] = String(args.drop || '').split(':').map(Number);
const NAME = args.name || 'PITLANE-GPS-EMU1';
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

let WS;
try { WS = (await import('ws')).default; } catch (_) {
  const p = process.env.PL_WS; if (!p) { console.error('нужен пакет ws: npm i ws (или PL_WS=…/node_modules/ws)'); process.exit(2); }
  WS = createRequire(p.replace(/\/?$/, '/'))(p);
}

let token = args.token || '';
if (!token) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(String(API)) && !args['allow-prod']) { console.error('эмулятор только для локального wrangler dev: привязка пишет в KV (--allow-prod — на свой риск)'); process.exit(2); }
  if (!args.code) { console.error('нужен --code (из Mini App «Привязать чип») или --token'); process.exit(2); }
  const r = await fetch(API + '/gps/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: args.code, name: NAME, fw: '2.0.0-emu' }) });
  const d = await r.json();
  if (!r.ok || !d.token) { console.error('привязка не удалась:', r.status, d); process.exit(1); }
  token = d.token; log('привязан, devId', d.devId);
  if (args['print-token']) console.log('TOKEN', token);
}

const bid = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
const buf = []; let acked = -1; let cursor = 0; let nextSeq = 0;
const evq = []; let evId = 1;
let ws = null; let open = false; let hello = false; let dropUntil = 0; let dropDone = false;
const stats = { sent: 0, resent: 0, batches: 0, events: [], ackRtt: [] };
const sentAt = new Map();

function connect() {
  if (Date.now() < dropUntil) return;
  ws = new WS(API.replace(/^http/, 'ws') + '/gps/ws', { headers: { Authorization: 'Bearer ' + token } });
  ws.on('open', () => { open = true; hello = false; ws.send(JSON.stringify({ h: 1, bid, fw: '2.0.0-emu', name: NAME })); });
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(d); } catch (_) { return; }
    if (m.err) { log('сервер отказал:', m.err); process.exit(1); }
    if (m.ack != null) {
      if (!hello) { acked = Math.min(m.ack, nextSeq - 1); cursor = acked + 1; hello = true; log('hello: сервер помнит до', m.ack); }
      else { if (sentAt.has(m.ack)) { stats.ackRtt.push(Date.now() - sentAt.get(m.ack)); sentAt.delete(m.ack); } acked = Math.max(acked, m.ack); }
    }
    if (m.eack != null) for (const q of evq) if (q.id <= m.eack) q.acked = true;
  });
  ws.on('close', () => { if (open) log('связь потеряна — копим в буфере'); open = false; hello = false; cursor = acked + 1; for (const q of evq) q.last = 0; setTimeout(connect, 1500); });
  ws.on('error', () => {});
}
connect();
await new Promise((r) => { const i = setInterval(() => { if (hello) { clearInterval(i); r(); } }, 20); });

const pts = makeRun({ hz: HZ, vmax: VMAX, standS: STAND, t0: Date.now() + 300, seed: Number(args.seed || 3) });
const tr = createTracker();
log(`еду: ${pts.length} эпох @ ${HZ} Гц, до ${VMAX} км/ч${DROP_KMH ? `, обрыв связи на ${DROP_KMH} км/ч на ${DROP_S} с` : ''}`);

function sendEv(q) { if (open && hello) { ws.send(q.json); q.last = Date.now(); } }
function flush() {
  if (!(open && hello)) return;
  for (let k = 0; k < 4 && cursor < nextSeq && cursor - acked < 800; k++) {
    const from = cursor; const rows = [];
    const first = buf[from - buf[0].seq];
    for (let s = from; s < nextSeq && rows.length < 40; s++) { const p = buf[s - buf[0].seq]; rows.push([p.t - first.t, p.lat, p.lon, p.v, p.h, p.sa, p.sv, p.fix]); }
    const last = from + rows.length - 1;
    ws.send(JSON.stringify({ b: from, t0: first.t, p: rows }));
    sentAt.set(last, Date.now());
    stats.batches++; stats.sent += rows.length; if (from <= stats.maxSent) stats.resent += Math.min(rows.length, stats.maxSent - from + 1);
    stats.maxSent = Math.max(stats.maxSent ?? -1, last);
    cursor = last + 1;
  }
  for (const q of evq) if (!q.acked && Date.now() - q.last > 1500) sendEv(q);
}
const batchT = setInterval(flush, 200);
const statT = setInterval(() => { if (open && hello) ws.send(JSON.stringify({ s: { hz: HZ, bat: 3950, pct: 71, sv: HZ >= 25 ? 12 : 22, rssi: -58, buf: nextSeq - 1 - acked, fix: 11, fw: '2.0.0-emu' } })); }, 1000);

for (const p of pts) {
  const wait = p.t - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const vcm = Math.round(p.v * 100);
  const kmh = vcm * 0.036;
  if (DROP_KMH && !dropDone && kmh >= DROP_KMH) { dropDone = true; dropUntil = Date.now() + DROP_S * 1000; log(`обрыв связи (${DROP_S} с)`); try { ws.terminate(); } catch (_) {} setTimeout(connect, DROP_S * 1000); }
  buf.push({ seq: nextSeq++, t: p.t, lat: Math.round(p.lat * 1e7), lon: Math.round(p.lon * 1e7), v: vcm, h: Math.round(p.hAcc * 100), sa: Math.round(p.sAcc * 100), sv: p.numSV, fix: 3 | 8 });
  if (buf.length > 2048) buf.shift();
  for (const e of tr.feed(p.t, kmh, true)) {
    const id = evId++;
    const j = { e: e.e, id, at: e.at };
    if (e.e === 'mark') { j.k = e.k; j.ms = e.ms; log(`отметка ${e.k}: ${(e.ms / 1000).toFixed(2)} с`); }
    if (e.e === 'end') { j.vmax = Math.round(e.vmax * 10) / 10; j.marks = e.marks; log(`итог: vmax ${j.vmax} км/ч`); }
    const q = { id, json: JSON.stringify(j), acked: false, last: 0 };
    evq.push(q); stats.events.push({ ...j, sentAt: Date.now(), lateMs: Date.now() - e.at });
    sendEv(q);
  }
}
const until = Date.now() + 8000;
while ((acked < nextSeq - 1 || evq.some((q) => !q.acked)) && Date.now() < until) { await new Promise((r) => setTimeout(r, 100)); }
clearInterval(batchT); clearInterval(statT);
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
console.log(JSON.stringify({ points: nextSeq, acked, batches: stats.batches, resentPoints: stats.resent, events: stats.events.map((e) => ({ e: e.e, k: e.k, ms: e.ms, lateMs: e.lateMs })), ackRttMedMs: med(stats.ackRtt), ackRttMaxMs: Math.max(...stats.ackRtt) }));
try { ws.close(); } catch (_) {}
setTimeout(() => process.exit(0), 200);
