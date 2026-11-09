// v312: чат без вытеснения фото, доска кругов держит быстрые, ник только из аккаунта, честные карточки,
// Stories — только автор, лимиты по IP без KV, возврат Stars за Pass / номер — node test/v312.test.mjs
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { MemKV } from './kvmock.mjs';
import { lapBody, dragBody } from './traces.mjs';
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const ORIGIN = 'https://dsssssz.github.io';
const SECRET = 'S'.repeat(40);
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1', TG_WEBHOOK_SECRET: SECRET };
let ipn = 1;
async function call(method, path, { body, token, ip, e = env } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.31.' + (ipn++ % 250) + '.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await rawWorker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), e);
  const ct = res.headers.get('content-type') || '';
  if (ct.startsWith('image/')) return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: res.status, data: d, text: t, headers: res.headers };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId };
}
const A = await login('79003120001', 'Мага');
const B = await login('79003120002', 'Артём');
const jpg = 'data:image/jpeg;base64,' + Buffer.from(new Uint8Array(120_000).map((_, i) => (i * 7) & 255)).toString('base64');

console.log('\n[1: фото поста — отдельно от ленты]');
let r = await call('POST', '/pulse', { token: A.token, body: { text: 'фото', img: jpg, cid: 'cid-photo-0001' } });
ok(r.status === 200, 'пост с фото принят', r.data);
const pid0 = r.headers.get('X-Pulse-Id');
const feedRaw = await kv.get('pulse');
ok(feedRaw && !feedRaw.includes('data:image') && feedRaw.length < 5000, 'в ленте KV нет встроенной картинки', feedRaw && feedRaw.length);
ok(await kv.get('pimg:' + pid0), 'фото лежит в pimg:<id>');
r = await call('GET', '/pulse');
const p0 = r.data.find((p) => p.id === pid0);
ok(p0 && p0.img === null && p0.hasImg === true, 'GET /pulse: img=null, hasImg=true', p0);
r = await call('GET', '/pulse/' + pid0 + '/img');
ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && r.headers.get('x-content-type-options') === 'nosniff' && r.bytes.length === 120_000, 'GET /pulse/:id/img отдаёт jpeg', r.status);
ok((await call('GET', '/pulse/nope123/img')).status === 404, 'нет фото → 404');
r = await call('POST', '/pulse', { token: A.token, body: { text: 'фото', img: jpg, cid: 'cid-photo-0001' } });
ok(r.headers.get('X-Pulse-Dup') === '1' && (await kv.list({ prefix: 'pimg:' })).keys.length === 1, 'повтор того же cid не плодит фото');
// старый пост со встроенной картинкой (до v312) — отдаётся через тот же GET
const rows = JSON.parse(await kv.get('pulse'));
rows.push({ id: 'old-inline-1', who: 'Старый', text: '', img: 'data:image/png;base64,iVBORw0KGgo=', at: 1, likes: [], pilotId: B.id });
await kv.put('pulse', JSON.stringify(rows));
r = await call('GET', '/pulse/old-inline-1/img');
ok(r.status === 200 && r.headers.get('content-type') === 'image/png', 'старый пост: картинка из ленты через /img', r.status);
// 20 фото подряд от одного пилота не вытесняют чат (раньше ~15 × 200 КБ = 3 МБ стирали всё)
await call('POST', '/pulse', { token: B.token, body: { text: 'старое сообщение Артёма' } });
for (let i = 0; i < 14; i++) await call('POST', '/pulse', { token: A.token, body: { text: 'ф' + i, img: jpg } });
r = await call('GET', '/pulse');
ok(r.data.some((p) => p.text === 'старое сообщение Артёма'), 'после 15 фото старые сообщения на месте');
// лимит фото в сутки (30)
await kv.delete('rl:pulseb:p:' + A.id); // burst 15/мин уже выбран серией выше
await kv.put('rl:pimg:p:' + A.id, JSON.stringify({ n: 30, exp: Date.now() + 3600e3 }));
r = await call('POST', '/pulse', { token: A.token, body: { text: 'ещё фото', img: jpg } });
ok(r.status === 429, 'больше 30 фото в сутки → 429', r.status);
r = await call('POST', '/pulse', { token: A.token, body: { text: 'без фото можно' } });
ok(r.status === 200, 'текст без фото после лимита фото — можно', r.status);
// удаление поста → фото и комментарии удаляются
await call('POST', '/pulse/' + pid0 + '/comments', { token: B.token, body: { text: 'класс' } });
ok(await kv.get('pcom:' + pid0), 'комментарий есть');
r = await call('DELETE', '/pulse/' + pid0, { token: A.token });
ok(!(await kv.get('pimg:' + pid0)) && !(await kv.get('pcom:' + pid0)), 'удалён пост → pimg и pcom удалены');

console.log('\n[3: ник — только из аккаунта]');
r = await call('POST', '/pulse', { token: B.token, body: { text: 'я Мага', who: 'Мага' } });
ok(r.status === 200 && r.data[0].who === 'Артём', 'body.who игнорируется', r.data[0]);
ok((JSON.parse((await kv.get('pilotmeta:' + B.id)) || '{}').nick || '') !== 'Мага', 'ник пилота не перезаписан из body.who');

console.log('\n[2: доска кругов держит быстрые]');
await call('PUT', '/me/car', { token: A.token, body: { model: 'M2', tyre: 'Pilot Sport 4S' } });
const slow = [];
for (let i = 0; i < 200; i++) slow.push({ name: 'p' + i, t: '2:30.000', ms: 150000 + i, gps: true, valid: true, srv: 1, gpsQ: 'A', pilotId: 'p_00000000-0000-4000-8000-' + String(i).padStart(12, '0'), at: Date.now() - 1e6 });
await kv.put('lap:sochi', JSON.stringify(slow));
r = await call('POST', '/tops/lap/sochi', { token: A.token, body: lapBody('2:00.100', { name: 'Мага', car: 'M2' }) });
ok(r.status === 200, 'круг принят', r.data);
const board = JSON.parse(await kv.get('lap:sochi'));
ok(board.length === 200 && board[0].pilotId === A.id, 'новый быстрый круг на месте при заполненной доске (200)', board[0]?.pilotId);
ok(board.every((x, i) => !i || (x.ms ?? 0) >= (board[i - 1].ms ?? 0)), 'доска отсортирована по времени');
r = await call('POST', '/tops/lap/sochi', { token: B.token, body: lapBody('2:00.300', { name: 'Мага', car: 'M2' }, { seed: 9 }) });
// B без машины → 409; ник в кругах проверяем по A
ok(board[0].name === 'Мага', 'имя в топе кругов — ник аккаунта');

console.log('\n[4/5: карточки результата]');
r = await call('POST', '/share', { body: { payload: { car: 'M2', type: '0-100', time: '2.10 с', gpsQ: 'A' } } });
ok(r.status === 401, 'без аккаунта карточку не создать', r.status);
r = await call('POST', '/share', { token: B.token, body: { payload: { car: 'M2', nick: 'Мага', type: '0-100', time: '2.10 с', gpsQ: 'A', valid: true } } });
ok(r.status === 200 && r.data.srvOk === false, 'карточка без заезда в топе создаётся неподтверждённой', r.data);
const fake = r.data.id;
r = await call('GET', '/share/' + fake);
ok(r.data.valid === false && r.data.srvOk === false && r.data.nick === 'Артём', 'GET: valid=false, srvOk=false, ник из аккаунта', r.data);
r = await call('POST', '/share', { token: A.token, body: { payload: { car: 'M2', type: 'lap', trackId: 'sochi', time: board[0].t, ms: board[0].ms, gpsQ: 'C' } } });
ok(r.status === 200 && r.data.srvOk === true, 'карточка реального круга из топа — подтверждена', r.data);
const real = r.data.id;
r = await call('GET', '/share/' + real);
ok(r.data.valid === true && r.data.srvOk === true && r.data.gpsQ === board[0].gpsQ, 'GET: подтверждена, GPS-класс — с сервера', r.data);
await kv.put('share:legacy3120', JSON.stringify({ car: 'M2', nick: 'X', type: '0-100', time: '2.0', valid: true, gpsQ: 'A' }));
ok((await call('GET', '/share/legacy3120')).data.srvOk === false, 'старая карточка без автора — не подтверждена');
const sj = new Uint8Array(600); sj[0] = 0xff; sj[1] = 0xd8; sj[2] = 0xff;
const story = 'data:image/jpeg;base64,' + Buffer.from(sj).toString('base64');
r = await call('POST', '/share/' + real + '/story', { body: { img: story } });
ok(r.status === 401, 'Stories-картинка без входа → 401', r.status);
r = await call('POST', '/share/' + real + '/story', { token: B.token, body: { img: story } });
ok(r.status === 403, 'чужая карточка → 403', r.status);
r = await call('POST', '/share/' + real + '/story', { token: A.token, body: { img: story } });
ok(r.status === 200 && /\/story\.jpg$/.test(r.data.url), 'автор карточки загружает картинку', r.data);

console.log('\n[6: лимиты по IP — через RL-привязки, без KV]');
{
  const hits = [];
  const renv = { ...env, RL_WRITE: { limit: async ({ key }) => { hits.push(key); return { success: true }; } }, RL_READ: { limit: async ({ key }) => { hits.push(key); return { success: true }; } } };
  const before = kv.puts;
  await call('POST', '/crew/join', { e: renv, body: { code: 'ZZZZZZ' } });
  await call('POST', '/auth/verify', { e: renv, body: { phone: '1', code: '1' } });
  await call('GET', '/stock/drag/0-100?car=m2', { e: renv });
  ok(kv.puts === before, 'анонимные /crew/join, /auth/verify, /stock не пишут счётчики в KV', kv.puts - before);
  ok(['rl:cjoin:ip:', 'rl:otpv:ip:', 'rl:stock:ip:'].every((p) => hits.some((k) => k.startsWith(p))), 'счётчики ушли в привязку', hits);
  const denyEnv = { ...env, RL_WRITE: { limit: async ({ key }) => ({ success: !/^rl:cjoin:ip:/.test(key) }) } };
  ok((await call('POST', '/crew/join', { e: denyEnv, body: { code: 'ZZZZZZ' } })).status === 429, 'привязка отказала → 429');
  const p2 = kv.puts;
  await call('POST', '/crew/join', { body: { code: 'ZZZZZZ' } });
  ok(kv.puts > p2, 'без привязки — прежний KV-счётчик');
}

console.log('\n[7: возврат Stars — Pass и номер]');
{
  const hook = async (upd) => (await rawWorker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify(upd) }), env)).json();
  await kv.put('auth:tg:7001', A.id);
  const until = Date.now() + 120 * 86400e3;
  await kv.put('pass:' + A.id, JSON.stringify({ until, charges: ['chP'], frame: 'forged' }));
  await kv.put('paycharge:chP', JSON.stringify({ at: Date.now(), stars: 350, currency: 'XTR', tg: '7001', kind: 'pass', plan: 'season' }));
  let w = await hook({ message: { message_id: 1, chat: { id: 7001, type: 'private' }, from: { id: 7001 }, refunded_payment: { telegram_payment_charge_id: 'chP', currency: 'XTR', total_amount: 350, invoice_payload: 'pp2:season:' + A.id } } });
  const pass = JSON.parse(await kv.get('pass:' + A.id));
  ok(w.ok && w.kind === 'pass' && pass.until === until - 90 * 86400e3 && !pass.charges.includes('chP'), 'возврат за Pass → срок минус 90 дней', { w, pass });
  w = await hook({ message: { message_id: 2, chat: { id: 7001, type: 'private' }, from: { id: 7001 }, refunded_payment: { telegram_payment_charge_id: 'chP' } } });
  ok(w.duplicate === true && JSON.parse(await kv.get('pass:' + A.id)).until === pass.until, 'повтор возврата ничего не меняет');
  await kv.put('pnum:7', A.id); await kv.put('pnumof:' + A.id, '7');
  await kv.put('paycharge:chN', JSON.stringify({ at: Date.now(), stars: 299, currency: 'XTR', tg: '7001', kind: 'pnum', n: 7 }));
  w = await hook({ message: { message_id: 3, chat: { id: 7001, type: 'private' }, from: { id: 7001 }, refunded_payment: { telegram_payment_charge_id: 'chN' } } });
  ok(w.ok && w.kind === 'pnum' && !(await kv.get('pnum:7')) && !(await kv.get('pnumof:' + A.id)), 'возврат за номер → номер освобождён', w);
  await kv.put('pnum:8', B.id);
  await kv.put('paycharge:chT', JSON.stringify({ tg: '7001', kind: 'pnum', n: 8, error: 'taken', refunded: true }));
  await hook({ message: { message_id: 4, chat: { id: 7001, type: 'private' }, from: { id: 7001 }, refunded_payment: { telegram_payment_charge_id: 'chT' } } });
  ok((await kv.get('pnum:8')) === B.id, 'возврат за «номер занят» не трогает чужой номер');
}

console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v312 all passed');
process.exit(fails ? 1 : 0);
