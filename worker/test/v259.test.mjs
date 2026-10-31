// v83 Paddock: likes, comments, public pilot profile — node test/paddock.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
const worker = withAutoRefresh(rawWorker);
import { MemKV } from './kvmock.mjs';
import { lapBody, dragBody } from './traces.mjs';

const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, raw, token, ip } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.1.0.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: raw != null ? raw : body ? JSON.stringify(body) : undefined }), env);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function login(phone, nick) {
  const ip = '10.8.' + (ipSeq++) + '.1';
  const o = await call('POST', '/auth/otp', { body: { phone }, ip });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick }, ip });
  return { token: v.data.token, id: v.data.pilotId, phone };
}
const A = await login('79001230001', 'Алиса');
const B = await login('79001230002', 'Боб');
const C = await login('79001230003', 'Спамер');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('\n[v259/v260: ветки, контекст, лучший ответ]');
let r = await call('POST', '/pulse', { token: A.token, body: { text: 'Какие шины на Moscow Raceway?', ch: 'q', car: 'BMW G87 M2' } });
const q = r.data.find((p) => p.ch === 'q'); ok(q && !q.best && q.commentCount === 0, 'вопрос создан, без ответов');
r = await call('POST', `/pulse/${q.id}/comments`, { token: B.token, body: { text: 'Michelin Cup 2' } });
ok(r.status === 200, 'ответ 1'); const c1 = r.data.comment.id;
await sleep(5);
r = await call('POST', `/pulse/${q.id}/comments`, { token: C.token, body: { text: 'Pirelli Trofeo R' } });
const c2 = r.data.comment.id;
r = await call('GET', '/pulse'); let p = r.data.find((x) => x.id === q.id);
ok(p.commentCount === 2 && p.lc && p.lc.text === 'Pirelli Trofeo R', 'в ленте счётчик и превью последнего ответа');
r = await call('POST', `/pulse/${q.id}/best`, { token: B.token, body: { cid: c1 } });
ok(r.status === 403, 'чужой не отмечает лучший ответ');
r = await call('POST', `/pulse/${q.id}/best`, { token: A.token, body: { cid: 'zzzzzzzz' } });
ok(r.status === 404, 'несуществующий ответ → 404');
r = await call('POST', `/pulse/${q.id}/best`, { token: A.token, body: { cid: c1 } });
ok(r.status === 200 && r.data.best === c1, 'автор отметил лучший ответ');
r = await call('GET', '/pulse'); p = r.data.find((x) => x.id === q.id); ok(p.best === c1, 'best в ленте');
r = await call('DELETE', `/pulse/${q.id}/comments/${c2}`, { token: C.token });
r = await call('GET', '/pulse'); p = r.data.find((x) => x.id === q.id);
ok(p.commentCount === 1 && p.lc.text === 'Michelin Cup 2' && p.best === c1, 'удаление ответа обновило превью');
r = await call('DELETE', `/pulse/${q.id}/comments/${c1}`, { token: B.token });
r = await call('GET', '/pulse'); p = r.data.find((x) => x.id === q.id);
ok(!p.best && !p.lc && p.commentCount === 0, 'удалён лучший ответ → снова «без ответа»');
r = await call('POST', '/pulse', { token: B.token, body: { text: 'привет', ch: 'gen' } });
const g = r.data.find((x) => x.text === 'привет');
r = await call('POST', `/pulse/${g.id}/best`, { token: B.token, body: { cid: null } });
ok(r.status === 400, 'best только у вопросов');
r = await call('POST', '/pulse', { token: A.token, body: { text: 'Где', ch: 'gen', car: 'BMW G87', run: { d: '0-100', t: 3.9, src: 'chip' } } });
p = r.data.find((x) => x.text === 'Где'); ok(p && p.run && p.run.t === 3.9 && p.run.src === 'phone' && !p.run.ok && p.car === 'BMW G87', 'контекст машина+замер у обычного сообщения');
console.log(fails ? `\n✗ ${fails} failed` : '\nall ok'); process.exit(fails ? 1 : 0);
