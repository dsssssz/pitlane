// v315: уникальные ники (без регистра, невидимых символов и латинских «двойников»), индекс nick:<ключ>,
// GET /nick/check, ленивая дозапись для старых аккаунтов, ник при входе через Telegram — node test/v315.test.mjs
import crypto from 'node:crypto';
import rawWorker from '../src/index.js';
import { MemKV } from './kvmock.mjs';
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const ORIGIN = 'https://dsssssz.github.io';
const BOT_TOKEN = '123456789:AAFakeTokenForLocalTestsOnly_xyz123';
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: BOT_TOKEN };
let ipn = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.45.' + (ipn++ % 250) + '.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await rawWorker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: res.status, data: d };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId, nick: v.data.nick, data: v.data };
}
const nickKeys = async () => (await kv.list({ prefix: 'nick:' })).keys.map((k) => k.name);
const owner = async (n) => kv.get('nick:' + n);

console.log('\n[1: первый занимает ник]');
const A = await login('79003150001', 'Мага');
ok(A.nick === 'Мага' && (await owner('мага')) === A.id, 'ник Мага закреплён за A', { nick: A.nick, keys: await nickKeys() });
const B = await login('79003150002', 'мага');
ok(B.nick !== 'мага' && B.nick !== 'Мага' && B.data.nickError === 'NICK_TAKEN', 'B с тем же ником (регистр) → свой ник + nickError', B.data);
let r = await call('PUT', '/me', { token: B.token, body: { nick: '  МАГА  ' } });
ok(r.status === 409 && r.data.code === 'NICK_TAKEN', 'PUT /me «МАГА» → 409 NICK_TAKEN', r);
r = await call('PUT', '/me', { token: B.token, body: { nick: 'Ма\u200bга' } });
ok(r.status === 409 && r.data.code === 'NICK_TAKEN', 'zero-width внутри не обходит проверку', r.data);
r = await call('PUT', '/me', { token: B.token, body: { nick: 'MAГA' } }); // латинские M, A
ok(r.status === 409, 'латинские двойники (MAГA) = Мага', r.data);
r = await call('PUT', '/me', { token: B.token, body: { nick: 'Ｍａｇａ' } }); // fullwidth → NFKC
ok(r.status === 200 && r.data.nick === 'Maga', 'полноширинные буквы приводятся NFKC (Ｍａｇａ → Maga; g ≠ г)', r.data);
r = await call('PUT', '/me', { token: B.token, body: { nick: 'Мага   Такси' } });
ok(r.status === 200 && r.data.nick === 'Мага Такси', 'другой ник — можно, пробелы схлопнуты', r.data);
r = await call('PUT', '/me', { token: B.token, body: { nick: '\u200b\u200c\u2060' } });
ok(r.status === 400 && r.data.code === 'NICK_INVALID', 'ник из невидимых символов → 400 NICK_INVALID', r.data);
r = await call('PUT', '/me', { token: B.token, body: { nick: 'Я' } });
ok(r.status === 400 && r.data.code === 'NICK_SHORT', 'один символ → NICK_SHORT', r.data);
r = await call('GET', '/me', { token: B.token });
ok(r.data.nick === 'Мага Такси', 'после отказов ник B не изменился', r.data.nick);

console.log('\n[2: смена ника освобождает старый]');
r = await call('PUT', '/me', { token: A.token, body: { nick: 'Maga Racer' } });
ok(r.status === 200 && !(await owner('мага')) && (await owner('маgа rасеr')) === A.id, 'A сменил ник → «мага» свободна', await nickKeys());
r = await call('PUT', '/me', { token: B.token, body: { nick: 'ＭＡＧＡ　ＲＡＣＥＲ' } });
ok(r.status === 409, 'полноширинный «ＭＡＧＡ　ＲＡＣＥＲ» = Maga Racer (NFKC + регистр + пробел)', r.data);
r = await call('PUT', '/me', { token: B.token, body: { nick: 'Мага' } });
ok(r.status === 200 && r.data.nick === 'Мага', 'теперь B может взять «Мага»', r.data);
r = await call('PUT', '/me', { token: B.token, body: { nick: 'Мага' } });
ok(r.status === 200, 'повтор того же ника — ок');
r = await call('PUT', '/me', { token: B.token, body: { nick: 'МАГА' } });
ok(r.status === 200 && r.data.nick === 'МАГА' && (await owner('мага')) === B.id, 'свой ник в другом регистре — можно', r.data);

console.log('\n[3: GET /nick/check]');
r = await call('GET', '/nick/check?n=' + encodeURIComponent('мага'));
ok(r.status === 200 && r.data.free === false && r.data.code === 'NICK_TAKEN', 'занят → free:false NICK_TAKEN (гость)', r.data);
r = await call('GET', '/nick/check?n=' + encodeURIComponent('Мага'), { token: B.token });
ok(r.data.free === true, 'свой ник для владельца — свободен', r.data);
r = await call('GET', '/nick/check?n=' + encodeURIComponent('Новый Пилот'));
ok(r.data.free === true && r.data.nick === 'Новый Пилот', 'свободный ник', r.data);
r = await call('GET', '/nick/check?n=' + encodeURIComponent('\u200b'));
ok(r.data.free === false && r.data.code === 'NICK_INVALID', 'невидимый → NICK_INVALID', r.data);

console.log('\n[4: старые дубли — ленивая дозапись]');
// два «старых» аккаунта с одинаковым ником, индекса нет (как до v315)
const C = await login('79003150003', 'Сток');
const D = await login('79003150004', 'Сток2');
for (const x of [C, D]) { const rec = JSON.parse(await kv.get('pilot:' + x.id)); rec.nick = 'Турбо'; delete rec.nk; await kv.put('pilot:' + x.id, JSON.stringify(rec)); }
r = await call('GET', '/me', { token: C.token });
ok(r.data.nick === 'Турбо' && !r.data.nickDup && (await owner('турбо')) === C.id, 'C первым заходит → ник за ним', { me: r.data.nick, keys: await nickKeys() });
r = await call('GET', '/me', { token: D.token });
ok(r.status === 200 && r.data.nick === 'Турбо' && r.data.nickDup === true, 'D — дубль: аккаунт работает, nickDup:true', r.data);
r = await call('PUT', '/me', { token: D.token, body: { nick: 'Турбо' } });
ok(r.status === 409, 'D не может «пересохранить» занятый ник', r.data);
r = await call('PUT', '/me', { token: D.token, body: { city: 'Краснодар' } });
ok(r.status === 200 && r.data.nickDup === true, 'D может менять другое (город) без смены ника', r.data);
r = await call('PUT', '/me', { token: D.token, body: { nick: 'Турбо Д' } });
ok(r.status === 200 && !r.data.nickDup, 'D сменил ник → флаг дубля снят', r.data);
// без изменений — без записей
let puts = 0; const origPut = kv.put.bind(kv); kv.put = async (...a) => { puts++; return origPut(...a); };
await call('GET', '/me', { token: C.token }); await call('GET', '/me', { token: D.token });
kv.put = origPut;
ok(puts === 0, 'GET /me без изменений не пишет в KV', puts);

console.log('\n[5: устаревший индекс и удаление аккаунта]');
await kv.put('nick:призрак', 'p_00000000-0000-4000-8000-000000000000');
r = await call('PUT', '/me', { token: C.token, body: { nick: 'Призрак' } });
ok(r.status === 200 && (await owner('призрак')) === C.id, 'индекс на несуществующего пилота не блокирует ник', r.data);
r = await call('DELETE', '/account', { token: C.token });
ok(r.status === 200 && !(await owner('призрак')), 'удаление аккаунта освобождает ник', await nickKeys());

console.log('\n[6: Telegram — первый свободный из username / имени]');
const nowSec = Math.floor(Date.now() / 1000);
function tmaInit(fields) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  return new URLSearchParams({ ...fields, hash: crypto.createHmac('sha256', secret).update(dcs).digest('hex') }).toString();
}
const tg = (id, u) => call('POST', '/auth/tma', { body: { initData: tmaInit({ query_id: 'Q' + id, user: JSON.stringify({ id, first_name: 'Иван', ...(u ? { username: u } : {}) }), auth_date: String(nowSec) }) } });
r = await tg(777001, 'ivan_racer');
ok(r.status === 200 && r.data.nick === 'ivan_racer', 'новый TG: ник = username', r.data);
r = await tg(777002, 'IVAN_RACER');
ok(r.status === 200 && r.data.nick === 'Иван', 'username занят (регистр) → имя', r.data);
r = await tg(777003, null);
ok(r.status === 200 && /^пилот/.test(r.data.nick), 'и имя занято → «пилотXXXX»', r.data);
r = await tg(777001, 'ivan_racer');
ok(r.data.nick === 'ivan_racer' && !r.data.nickDup, 'повторный вход — тот же ник', r.data);

console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v315 ok');
process.exit(fails ? 1 : 0);
