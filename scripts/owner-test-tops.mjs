#!/usr/bin/env node
// Тестовые результаты владельца (Мага) в топах — ТОЛЬКО для проверки вида. Все строки помечены test:true.
// node scripts/owner-test-tops.mjs add | remove     (нужен CLOUDFLARE_API_TOKEN; запуск из корня репо)
// Ключи KV: drag:0-100, drag:100-200, drag:402m, lap:sochi (строки test:true владельца), ptops:<pid> (создаётся/удаляется)
import { execFileSync } from 'node:child_process';
const NS = 'fc7e076d77824da184e7314c2fb3ff1b';
const PID = 'p_358a6b1d-f8f6-43c6-af29-5808addb9f54';
const W = (args, input) => execFileSync('npx', ['wrangler', 'kv', 'key', ...args, '--namespace-id', NS, '--remote'], { cwd: 'worker', input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const get = (k) => { try { const s = W(['get', k]); const j = JSON.parse(s); return Array.isArray(j) ? j : j; } catch { return null; } };
const put = (k, v) => W(['put', k, JSON.stringify(v)]);
const del = (k) => { try { W(['delete', k]); } catch {} };
const now = Date.now();
const base = { name: 'Пилот', car: 'BMW G87 M2 Widebody', carId: 'g87-m2', gps: true, valid: true, srv: 1, gpsQ: 'A', src: 'ext', hz: 25, avgAcc: 0.6, n: 0, cls: 'ab', prep: 'st1', tyreT: 'street', pilotId: PID, test: true, note: 'owner test — scripts/owner-test-tops.mjs remove' };
const drag = { '0-100': 3.62, '100-200': 8.41, '402m': 11.38 };
const isTest = (r) => r && r.test === true && r.pilotId === PID;
const mode = process.argv[2];
for (const [d, t] of Object.entries(drag)) {
  const k = 'drag:' + d; const rows = (get(k) || []).filter((r) => !isTest(r));
  if (mode === 'add') rows.push({ ...base, disc: d, t, n: Math.round(t * 25), at: now - 2 * 3600e3 });
  rows.sort((a, b) => a.t - b.t);
  if (rows.length) put(k, rows); else del(k);
  console.log(k, rows.length);
}
{
  const k = 'lap:sochi'; const rows = (get(k) || []).filter((r) => !isTest(r));
  if (mode === 'add') rows.push({ ...base, t: '2:14.532', ms: 134532, track: 'sochi', dist: 5848, n: 3363, at: now - 3600e3, tyre: 'Continental SportContact 7', weather: 'dry' });
  if (rows.length) put(k, rows); else del(k);
  console.log(k, rows.length);
}
if (mode === 'add') put('ptops:' + PID, { s: [], l: ['sochi'] }); else del('ptops:' + PID);
console.log('done', mode);
