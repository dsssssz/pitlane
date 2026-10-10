// v134: Paddock — сообщения не теряются. Воспроизведение причины (гонка read-modify-write одного KV-ключа `pulse`
// при «запаздывающем» KV), единая точка записи PulseHub, идемпотентность cid, лимиты под чат, клиентский sendPulse
// (повторы, повторный вход, без молчаливого локального сохранения), кнопка отправки, клавиатура iOS.
// node test/v134.test.mjs
import rawWorker from '../src/index.js';
import { PulseHub, applyPulseOp, pulseOp } from '../src/pulsehub.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import fs from 'fs';
const worker = withAutoRefresh(rawWorker);
let fails = 0; const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const R = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

/** KV «другого дата-центра»: чтение `pulse` отдаёт значение до последней записи (как KV до ~60 с). */
class StaleKV extends MemKV {
  constructor() { super(); this.stale = false; this.prev = null; }
  async put(k, v, o) { if (k === 'pulse') this.prev = (await super.get('pulse')); return super.put(k, v, o); }
  async get(k, o) { if (k === 'pulse' && this.stale && this.prev !== null) return this.prev; return super.get(k, o); }
}
/** Durable Object в памяти: storage с get/put(obj)/list/delete + один экземпляр на имя. */
function hubNs(env) {
  const objs = new Map();
  const storage = () => { const m = new Map(); return {
    get: async (k) => m.get(k), put: async (k, v) => { if (typeof k === 'object') { for (const [a, b] of Object.entries(k)) m.set(a, JSON.parse(JSON.stringify(b))); } else m.set(k, JSON.parse(JSON.stringify(v))); },
    list: async ({ prefix = '' } = {}) => new Map([...m].filter(([k]) => k.startsWith(prefix))), delete: async (ks) => { for (const k of [].concat(ks)) m.delete(k); }, _m: m }; };
  return { idFromName: (n) => 'id:' + n, get(id) { if (!objs.has(id)) objs.set(id, new PulseHub({ storage: storage() }, env)); const o = objs.get(id); return { fetch: (u, init) => o.fetch(new Request(u, init)) }; }, objs };
}
function mk({ hub = true } = {}) {
  const kv = new StaleKV(); const env = { PITLANE: kv, SMS_DEMO: '1' }; if (hub) env.PULSE_HUB = hubNs(env);
  let ip = 1; let ph = 0;
  const call = async (m, p, { body, token } = {}) => {
    const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.134.' + (ip >> 8 & 255) + '.' + (ip++ % 250) }; if (token) h.Authorization = 'Bearer ' + token;
    const res = await worker.fetch(new Request('https://api.test' + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
    let d = null; try { d = await res.json(); } catch (_) {}
    return { status: res.status, data: d, h: res.headers };
  };
  const login = async (nick) => { const phone = '7900134' + String(++ph).padStart(4, '0'); const o = await call('POST', '/auth/otp', { body: { phone } }); const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } }); return { token: v.data.token, id: v.data.pilotId }; };
  return { kv, env, call, login };
}
const texts = (r) => (Array.isArray(r) ? r : []).map((p) => p.text);

console.log('\n[причина: лайк из «другого дата-центра» стирал свежий пост (как было: read-modify-write одного KV-ключа)]');
{
  const { kv, call, login } = mk({ hub: false });
  const A = await login('Мага'); const B = await login('Артём');
  await call('POST', '/pulse', { token: B.token, body: { text: 'старый пост' } });
  const old = (await call('GET', '/pulse')).data[0].id;
  await call('POST', '/pulse', { token: A.token, body: { text: 'свежий пост Маги' } });
  kv.stale = true; // B в другой локации ещё видит список без поста Маги
  await call('POST', '/pulse/' + old + '/like', { token: B.token, body: { liked: true } });
  kv.stale = false;
  ok(!texts((await call('GET', '/pulse')).data).includes('свежий пост Маги'), 'без единой точки записи пост пропадает — воспроизведено');
}

console.log('\n[PulseHub: тот же сценарий — пост остаётся]');
{
  const { kv, call, login } = mk();
  const A = await login('Мага'); const B = await login('Артём');
  await call('POST', '/pulse', { token: B.token, body: { text: 'старый пост' } });
  const old = (await call('GET', '/pulse')).data[0].id;
  await call('POST', '/pulse', { token: A.token, body: { text: 'свежий пост Маги' } });
  kv.stale = true;
  const lk = await call('POST', '/pulse/' + old + '/like', { token: B.token, body: { liked: true } });
  await call('POST', '/pulse/' + old + '/comments', { token: B.token, body: { text: 'коммент из другой локации' } });
  kv.stale = false;
  const list = (await call('GET', '/pulse')).data;
  ok(lk.status === 200 && lk.data.likeCount === 1, 'лайк засчитан', lk.data);
  ok(texts(list).includes('свежий пост Маги') && texts(list).includes('старый пост'), 'оба поста на месте после лайка и комментария', texts(list));
  ok(list.find((p) => p.text === 'старый пост').commentCount === 1, 'счётчик комментариев обновлён через хаб');
}

console.log('\n[PulseHub: параллельно 3 пилота × 6 постов + лайки — ничего не теряется]');
{
  const { call, login } = mk();
  const P = [await login('A'), await login('B'), await login('C')];
  const seed = await call('POST', '/pulse', { token: P[0].token, body: { text: 'якорь' } });
  const anchor = seed.data[0].id;
  const jobs = [];
  for (let i = 0; i < 6; i++) for (const [k, p] of P.entries()) {
    jobs.push(call('POST', '/pulse', { token: p.token, body: { text: `п${k}-${i}` } }));
    if (i === 0) jobs.push(call('POST', '/pulse/' + anchor + '/like', { token: p.token, body: { liked: true } }));
  }
  const rs = await Promise.all(jobs);
  const list = (await call('GET', '/pulse')).data;
  ok(rs.every((r) => r.status === 200), 'все запросы 200', rs.map((r) => r.status));
  ok(list.length === 19, '18 постов + якорь — все на месте', list.length);
  ok(list.find((p) => p.id === anchor).likeCount === 3, '3 лайка на якоре');
}

console.log('\n[идемпотентность: повтор с тем же cid не создаёт дубль; cid видит только автор]');
{
  const { call, login } = mk();
  const A = await login('Мага'); const B = await login('Артём');
  const r1 = await call('POST', '/pulse', { token: A.token, body: { text: 'с повтором', cid: 'cTEST000000001' } });
  const r2 = await call('POST', '/pulse', { token: A.token, body: { text: 'с повтором', cid: 'cTEST000000001' } });
  ok(r1.status === 200 && r2.status === 200, 'оба ответа 200');
  ok(r2.h.get('X-Pulse-Dup') === '1' && r1.h.get('X-Pulse-Id') === r2.h.get('X-Pulse-Id'), 'второй — дубль того же поста (X-Pulse-Dup, тот же X-Pulse-Id)');
  const mine = (await call('GET', '/pulse', { token: A.token })).data;
  ok(mine.filter((p) => p.text === 'с повтором').length === 1, 'в ленте один пост');
  ok(mine[0].cid === 'cTEST000000001', 'автор видит свой cid (сверка «отправляется» → «отправлено»)');
  ok(!('cid' in (await call('GET', '/pulse', { token: B.token })).data[0]) && !('cid' in (await call('GET', '/pulse')).data[0]), 'другим и гостям cid не отдаётся');
  const r3 = await call('POST', '/pulse', { token: B.token, body: { text: 'другой автор', cid: 'cTEST000000001' } });
  ok(r3.status === 200 && r3.h.get('X-Pulse-Dup') !== '1', 'тот же cid у другого пилота — отдельный пост');
  const bad = await call('POST', '/pulse', { token: A.token, body: { text: 'кривой cid', cid: '<script>' } });
  ok(bad.status === 200 && !('cid' in bad.data.find((p) => p.text === 'кривой cid')), 'невалидный cid игнорируется');
}

console.log('\n[лимиты под чат: 15 в минуту, честный 429 с Retry-After]');
{
  const { call, login } = mk();
  const A = await login('Мага');
  const st = []; for (let i = 0; i < 16; i++) st.push((await call('POST', '/pulse', { token: A.token, body: { text: 'сообщение ' + i } })));
  ok(st.slice(0, 15).every((r) => r.status === 200), '15 подряд проходят (было: 10 в час)', st.map((r) => r.status));
  ok(st[15].status === 429 && Number(st[15].h.get('Retry-After')) > 0, '16-е — 429 + Retry-After (клиент покажет «подожди»)');
  const exp = await call('POST', '/pulse', { token: 'deadbeef'.repeat(6), body: { text: 'протухший токен' } });
  ok(exp.status === 401 && exp.data.code === 'session_expired', 'мёртвый токен → 401 session_expired (клиент обновит сессию и повторит)');
}

console.log('\n[удаление поста и аккаунта — через хаб]');
{
  const { call, login, env } = mk();
  const A = await login('Мага'); const B = await login('Артём');
  await call('POST', '/pulse', { token: A.token, body: { text: 'пост A1' } });
  await call('POST', '/pulse', { token: A.token, body: { text: 'пост A2' } });
  await call('POST', '/pulse', { token: B.token, body: { text: 'пост B' } });
  const list = (await call('GET', '/pulse')).data;
  const a1 = list.find((p) => p.text === 'пост A1').id; const b = list.find((p) => p.text === 'пост B').id;
  ok((await call('DELETE', '/pulse/' + b, { token: A.token })).data.some((p) => p.id === b), 'чужой пост удалить нельзя');
  ok(!(await call('DELETE', '/pulse/' + a1, { token: A.token })).data.some((p) => p.id === a1), 'свой — удаляется');
  await call('POST', '/pulse/' + b + '/like', { token: A.token, body: { liked: true } });
  const del = await call('POST', '/account/delete', { token: A.token, body: { confirm: true } });
  const del2 = del.status === 404 ? await call('DELETE', '/account', { token: A.token }) : del;
  const after = (await call('GET', '/pulse')).data;
  ok(del2.status === 200 && !texts(after).includes('пост A2') && after.find((p) => p.id === b).likeCount === 0, 'аккаунт: посты и лайки ушли', { s: del2.status, t: texts(after) });
  const hub = [...env.PULSE_HUB.objs.values()][0];
  ok(hub.rows.every((r) => r.pilotId !== A.id), 'и из хранилища хаба тоже');
}

console.log('\n[переход: хаб при первом запуске забирает ленту из KV]');
{
  const kv = new MemKV(); const env = { PITLANE: kv };
  await kv.put('pulse', JSON.stringify([{ id: 'old1', text: 'до v134', at: 1, likes: [], pilotId: 'p_x' }]));
  env.PULSE_HUB = hubNs(env);
  const out = await pulseOp(env, { t: 'add', row: { id: 'n1', text: 'после', at: 2, likes: [], pilotId: 'p_y' } });
  ok(out.rows.map((r) => r.id).join() === 'n1,old1', 'старые посты на месте, новый сверху', out.rows.map((r) => r.id));
  ok(JSON.parse(await kv.get('pulse')).length === 2, 'снимок KV обновлён');
  const { rows } = applyPulseOp([{ id: 'a', at: 1, likes: ['u'] }], { t: 'like', id: 'a', who: 'u', want: true });
  ok(rows[0].likes.length === 1, 'повторный лайк с явным состоянием идемпотентен');
}

console.log('\n[клиент: api.sendPulse — повторы, повторный вход, без молчаливого «сохранено локально»]');
{
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.window = { PITLANE_API: 'https://api.test', addEventListener() {}, dispatchEvent() {} };
  globalThis.document = { querySelector: () => null };
  if (!globalThis.CustomEvent) globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
  const mod = await import('../../api.js?v134');
  const { api, setReauthHandler, setSessionToken } = mod;
  setSessionToken('tok-old');
  const okRows = (cid) => new Response(JSON.stringify([{ id: 's1', text: 'x', cid }]), { status: 200, headers: { 'X-Pulse-Id': 's1' } });
  const seen = [];
  const run = async (script, row, opts = {}) => {
    let i = 0; seen.length = 0;
    globalThis.fetch = async (url, init) => { seen.push({ url, body: init.body, auth: init.headers?.Authorization || '' }); const s = script[Math.min(i++, script.length - 1)]; if (s instanceof Error) throw s; return typeof s === 'function' ? s(JSON.parse(init.body || '{}')) : s; };
    return api.sendPulse(row, { sleep: async () => {}, ...opts });
  };
  const row = { cid: 'cCLIENT0000001', text: 'привет', at: 1 };
  let r = await run([new TypeError('Failed to fetch'), new Response('{}', { status: 502 }), (b) => okRows(b.cid)], row);
  ok(r.ok && r.id === 's1' && seen.length === 3 && seen.every((s) => JSON.parse(s.body).cid === row.cid), 'обрыв → 502 → успех: 3 попытки с одним cid', { r, n: seen.length });
  r = await run([new Response(JSON.stringify({ error: 'rate limit', retry: 60 }), { status: 429, headers: { 'Retry-After': '60' } })], row);
  ok(!r.ok && r.kind === 'rate' && r.retryAfter === 60 && seen.length === 1, '429 → без повторов, kind=rate, retryAfter');
  r = await run([new Response('{}', { status: 413 })], row);
  ok(!r.ok && r.kind === 'big', '413 → kind=big (а не «опубликовано» локально)');
  ok(!store.get('pitlane-api-v1') || !/привет/.test(store.get('pitlane-api-v1')), 'ничего не сохранено в локальную ленту молча');
  let reauthCalls = 0;
  setReauthHandler(async () => { reauthCalls++; setSessionToken('tok-new'); return true; });
  r = await run([new Response(JSON.stringify({ error: 'invalid session', code: 'session_expired' }), { status: 401 }), (b) => okRows(b.cid)], row);
  ok(r.ok && reauthCalls === 1 && seen[1].auth === 'Bearer tok-new', '401 без refresh-токена → тихий повторный вход → повтор с новым токеном', { reauthCalls, seen: seen.map((s) => s.auth) });
  setReauthHandler(async () => false);
  r = await run([new Response(JSON.stringify({ error: 'invalid session', code: 'session_expired' }), { status: 401 })], row);
  ok(!r.ok && r.kind === 'auth', 'войти не вышло → kind=auth (карточка «Сессия истекла»)');
  r = await run([Object.assign(new Error('aborted'), { name: 'AbortError' })], row, { tries: 1 });
  ok(!r.ok && r.kind === 'net' && r.error === 'timeout', 'таймаут → kind=net');
}

console.log('\n[фронт: кнопка, исходящие, клавиатура]');
{
  const html = R('index.html'); const app = R('app.js'); const css = R('styles.css');
  const btn = (html.match(/<button[^>]*id="pulseSend"[\s\S]*?<\/button>/) || [''])[0];
  ok(/<svg class="send-ico" viewBox="0 0 24 24"/.test(btn) && / disabled>/.test(btn) && !/data-i18n="pad\.send" aria/.test(btn), 'Paddock: SVG-стрелка, неактивна при пустом поле, i18n не затирает иконку');
  ok(/id="padComSend"[^>]*disabled>\s*<svg class="send-ico"/.test(html), 'комментарии: та же иконка');
  ok(!/#pulseSend::before \{ content: ''/.test(css.split('v134: кнопка отправки')[1] || '') && /#pulseSend::before, \.pc-foot #pulseSend::after \{ content: none/.test(css), 'старая стрелка из рамок/псевдоэлементов отключена');
  ok(/\.pc-foot #pulseSend, \.pad-com-send\.send-btn \{ width: 40px; height: 40px;[^}]*border-radius: 50%/.test(css), 'кнопка — ровный круг 40×40 (было 44×40, овал)');
  ok(/PAD_OUT_KEY = 'pitlane-pad-out-v1'/.test(app) && /'Отправляется…'/.test(app) && /'Повторить'/.test(app) && /'Не отправлено · '/.test(app), 'исходящие: «Отправляется…», «Не отправлено · причина», «Повторить», хранение до отправки');
  ok(/Date\.now\(\) - _padSendLock < 600/.test(app) && /pulseText\.value = ''; pulseText\.style\.height = ''/.test(app), 'двойной тап не шлёт дважды; поле очищается сразу');
  ok(/\['pointerdown', 'mousedown'\]\.forEach\(\(ev\) => document\.getElementById\('pulseSend'\)/.test(app), 'тап по кнопке не схлопывает клавиатуру iOS');
  ok(/visualViewport/.test(app) && /html\.kb-open \.tgs-panel \{ bottom: var\(--kb/.test(css), 'клавиатура iOS: шторка поднимается по visualViewport');
  ok(!/await api\.addPulse\(/.test(app), 'фронт больше не зовёт addPulse с молчаливым локальным сохранением');
  ok(/const legacy = realSession && !getRefreshToken\(\)/.test(app), 'Mini App: старая сессия без refresh тихо меняется на полноценную');
  const ver = Number((app.match(/APP_VERSION = 'v(\d+)'/) || [])[1]);
  ok(ver >= 134 && Number((R('sw.js').match(/pitlane-v(\d+)/) || [])[1]) === ver, 'APP_VERSION / SW ≥ v134 и совпадают');
  const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  ok(/export \{ GpsLive, PulseHub \}/.test(fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')), 'точка входа Worker экспортирует PulseHub');
  ok(/name = "PULSE_HUB"\nclass_name = "PulseHub"/.test(toml) && /tag = "v134-pulsehub"\nnew_sqlite_classes = \["PulseHub"\]/.test(toml), 'wrangler.toml: привязка и миграция PulseHub (SQLite DO, Free plan)');
}

console.log(fails ? `\n✗ v134: ${fails} fail(s)` : '\n✓ v134: all ok');
process.exit(fails ? 1 : 0);
