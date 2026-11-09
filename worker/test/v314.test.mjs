// v314: аватарка с сайта главнее фото Telegram, PUT/DELETE /me/avatar, значки у ника (pp/pn/sw) в чате,
// комментариях и профиле — node test/v314.test.mjs
import rawWorker from '../src/index.js';
import { MemKV } from './kvmock.mjs';
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const ORIGIN = 'https://dsssssz.github.io';
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipn = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.44.' + (ipn++ % 250) + '.1' };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await rawWorker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const ct = res.headers.get('content-type') || '';
  if (ct.startsWith('image/')) return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: res.status, data: d, headers: res.headers };
}
async function login(phone, nick) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  return { token: v.data.token, id: v.data.pilotId };
}
const A = await login('79003140001', 'Мага');
const B = await login('79003140002', 'Артём');
const own = 'data:image/jpeg;base64,' + Buffer.from('own-site-avatar-' + 'x'.repeat(200)).toString('base64');
const tg = 'https://t.me/i/userpic/320/abc.jpg';
const meta = async (id) => JSON.parse((await kv.get('pilotmeta:' + id)) || '{}');

console.log('\n[1: PUT /me/avatar]');
let r = await call('PUT', '/me/avatar', { body: { ava: own } });
ok(r.status === 401, 'без входа → 401', r.status);
r = await call('PUT', '/me/avatar', { token: A.token, body: { ava: 'https://evil.example/x.png' } });
ok(r.status === 400, 'чужой https → 400', r.status);
r = await call('PUT', '/me/avatar', { token: A.token, body: { ava: own } });
ok(r.status === 200 && r.data.custom === true && typeof r.data.ava === 'string', 'своё фото сохранено', r.data);
ok((await meta(A.id)).avatar === own, 'pilotmeta.avatar = фото с сайта');
r = await call('GET', '/pilot/' + A.id + '/avatar');
ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg', 'GET /pilot/:id/avatar отдаёт фото сайта', r.status);

console.log('\n[2: TG-фото из поста не затирает аватарку сайта]');
r = await call('POST', '/pulse', { token: A.token, body: { text: 'привет', ava: tg, cid: 'cid-v314-0001' } });
ok(r.status === 200, 'пост принят', r.data);
ok((await meta(A.id)).avatar === own, 'аватарка сайта на месте после поста с TG-ссылкой', await meta(A.id));
const own2 = 'data:image/jpeg;base64,' + Buffer.from('own-site-avatar-2-' + 'y'.repeat(200)).toString('base64');
await call('POST', '/pulse', { token: A.token, body: { text: 'новое фото', ava: own2, cid: 'cid-v314-0002' } });
ok((await meta(A.id)).avatar === own2, 'новое своё фото из поста заменяет старое');
r = await call('DELETE', '/me/avatar', { token: A.token });
ok(r.status === 200 && r.data.custom === false && !(await meta(A.id)).avatar, 'DELETE → сброс к фото Telegram', r.data);
await call('PUT', '/me/avatar', { token: A.token, body: { ava: own } });

console.log('\n[3: значки у ника в чате]');
await kv.put('pass:' + A.id, JSON.stringify({ until: Date.now() + 86400e3, frame: 'chrome', pin: 'helmet' }));
await kv.put('pnumof:' + A.id, '7');
await kv.put('cschamp:' + A.id, JSON.stringify([{ city: 'Краснодар', m: '2026-10', disc: '0-100' }]));
r = await call('POST', '/pulse', { token: A.token, body: { text: 'со значками', cid: 'cid-v314-0003' } });
let p = (r.data || []).find((x) => x.cid === 'cid-v314-0003');
ok(p && p.pp && p.pp.frame === 'chrome' && p.pp.pin === 'helmet', 'POST /pulse: pp сразу в ответе', p);
ok(p && p.pn === 7 && p.sw && /Краснодар/.test(p.sw.label), 'POST /pulse: номер #07 и титул сезона', p);
ok(p && typeof p.ava === 'string', 'POST /pulse: версия аватарки', p);
r = await call('GET', '/pulse', { token: B.token });
p = r.data.find((x) => x.text === 'со значками');
ok(p && p.pp?.pin === 'helmet' && p.pn === 7 && p.sw?.label && p.ava, 'GET /pulse (другой пилот): pp + pn + sw + ava', p);
const rawPulse = await kv.get('pulse');
ok(!rawPulse.includes('"pn"') && !rawPulse.includes('"sw"'), 'значки не пишутся в KV ленты');
r = await call('POST', '/pulse', { token: B.token, body: { text: 'артём', cid: 'cid-v314-0004' } });
const bp = r.data.find((x) => x.cid === 'cid-v314-0004');
ok(bp && !bp.pp && !bp.pn && !bp.sw, 'без Pass/номера — без значков', bp);
const delId = r.headers.get('X-Pulse-Id');
r = await call('DELETE', '/pulse/' + delId, { token: B.token });
p = (r.data || []).find((x) => x.text === 'со значками');
ok(r.status === 200 && p && p.pn === 7 && p.ava, 'после удаления поста лента со значками и аватарками', r.status);

console.log('\n[4: комментарии и профиль]');
const postId = (await call('GET', '/pulse')).data.find((x) => x.text === 'со значками').id;
r = await call('POST', '/pulse/' + postId + '/comments', { token: A.token, body: { text: 'коммент' } });
r = await call('GET', '/pulse/' + postId + '/comments', { token: B.token });
const c = (r.data.comments || []).find((x) => x.text === 'коммент');
ok(c && c.pp?.frame === 'chrome' && c.pn === 7 && c.ava, 'комментарий: pp + pn + ava', r.data);
r = await call('GET', '/pilot/' + A.id, { token: B.token });
ok(r.status === 200 && r.data.pp?.pin === 'helmet' && r.data.pn === 7 && r.data.sw?.label, 'публичный профиль: pp + pn + sw', r.data && { pp: r.data.pp, pn: r.data.pn, sw: r.data.sw });

console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v314 ok');
process.exit(fails ? 1 : 0);
