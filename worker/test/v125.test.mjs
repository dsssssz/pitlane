// v125: Paddock = чат пилотов (иконка-облачко, превью чата на Главной, поле ввода снизу шторки) — node test/v125.test.mjs
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import fs from 'fs';
const worker = withAutoRefresh(rawWorker);
let fails = 0; const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x ?? ''); } };
const root = new URL('../../', import.meta.url).pathname;
const html = fs.readFileSync(root + 'index.html', 'utf8'); const css = fs.readFileSync(root + 'styles.css', 'utf8');
const app = fs.readFileSync(root + 'app.js', 'utf8'); const sw = fs.readFileSync(root + 'sw.js', 'utf8'); const api = fs.readFileSync(root + 'api.js', 'utf8');
const kv = new MemKV(); const env = { PITLANE: kv, SMS_DEMO: '1' };
let ip = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.25.' + (ip % 200) + '.' + (ip++ % 250) }; if (token) h.Authorization = 'Bearer ' + token;
  const r = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: r.status, data: d };
}
let ph = 0; async function login(nick) { const phone = '7900125' + String(++ph).padStart(4, '0'); const o = await call('POST', '/auth/otp', { body: { phone } }); const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } }); return { token: v.data.token, id: v.data.pilotId }; }

console.log('[Worker: GET /pulse?recent=1]');
const A = await login('Мага');
const img = 'data:image/jpeg;base64,' + Buffer.from('x'.repeat(600)).toString('base64');
const posted = [];
for (let i = 0; i < 10; i++) posted.push((await call('POST', '/pulse', { token: A.token, body: { text: 'пост ' + i, img: i === 9 ? img : null } })).status);
ok(posted.every((s) => s === 200), 'посты создаются', posted.join(','));
ok((await call('POST', '/pulse', { token: A.token, body: { text: 'одиннадцатый' } })).status === 429, 'лимит постов не изменился (10/ч)');
const r = await call('GET', '/pulse?recent=1');
ok(r.status === 200 && Array.isArray(r.data) && r.data.length === 10 && r.data[0].text === 'пост 9', 'свежие сначала', r.data?.[0]?.text);
ok(r.data.every((p) => p.img === null) && r.data[0].hasImg === true, 'лёгкий ответ: без картинок, флаг hasImg');
ok(r.data.every((p) => !('likes' in p) && !('phone' in p)) && 'commentCount' in r.data[0], 'тот же публичный whitelist');
ok((await call('GET', '/pulse')).data.find((p) => p.text === 'пост 9').img?.startsWith('data:image'), 'обычный GET /pulse не изменился');

console.log('[иконка-облачко]');
ok((html.match(/class="ico ico-pad ico-chat"/g) || []).length === 2 && /class="plm-chat"/.test(html) && !/class="ico-ring"/.test(html), 'кружок заменён облачками: панель, скрытая вкладка rail, меню');
ok(/class="ico-d ico-d1"/.test(html) && /@keyframes chatType/.test(css) && /\.nav-btn\.active \.ico-chat \.ico-d3[^{]*\{ animation-delay: \.24s; \}/.test(css), 'анимация «печатает…» при нажатии');
console.log('[виджет]');
ok(/id="hwPad" data-hw="pulse"/.test(html) && /class="hw hw-wide hw-chat" id="hwPad"/.test(html) && /чат пилотов/.test(html), 'широкий виджет «Paddock · чат пилотов»');
ok(/padStack\(d\.who\)/.test(app) && /padAvatar\(w\.name, (''|padAvaUrl\(w\.pilotId, w\.ava\)), size\)/.test(app), 'стопка аватарок (инициалы)');
ok(/d\.items\.slice\(0, 2\)/.test(app) && /kind: 'reply'/.test(app) && /withCom = rows\.filter\(\(p\) => Number\(p\.commentCount\) > 0\)\.slice\(0, 2\)/.test(app), '1–2 последние реплики: посты и ответы, ≤2 запроса комментариев');
ok(/active: !!last && Date\.now\(\) - last < 3600e3/.test(app) && /'новое', 'новых', 'новых'/.test(app), 'зелёная точка «активно» (за час) и счётчик новых');
ok(/Тут пилоты обсуждают заезды/.test(app) && /'pc-write', 'Написать'/.test(app) && /getElementById\('pulseText'\)\?\.focus/.test(app), 'пустое состояние зовёт и ведёт к полю ввода');
ok(/listPulseRecent\(\) \{\s*const rows = await remote\('\/pulse\?recent=1'\)/.test(api), 'api.listPulseRecent');
console.log('[шторка]');
ok(/tgsPark\(cmp, panel\); cmp\.classList\.add\('pc-foot'\)/.test(app) && /\.pulse-compose\.pc-foot \{[^}]*margin-bottom: calc\(76px \+ var\(--sab, 0px\)\)/.test(css), 'поле ввода закреплено снизу шторки, над панелью');
ok(/'pad\.ph':'Написать в Paddock…'/.test(app) && /placeholder="Написать в Paddock…"/.test(html), '«Написать в Paddock…»');
ok(/function padComLabel\(n\)/.test(app) && /\.pad-comment\.has \{/.test(css), 'счётчик ответов заметнее («2 ответа»)');
ok(/id="pulseLive"/.test(html) && /function renderPadLive\(d\)/.test(app), 'живая строка: кто в чате, активно');
ok(/maxlength="280"/.test(html) && /text: text\.slice\(0, 280\)/.test(app), 'лимиты поста сохранены');
const v125 = app.slice(app.indexOf('/* v125: Paddock как чат'), app.indexOf('let _hwTeamAt = 0;'));
ok(!/innerHTML/.test(v125), 'превью чата только через textContent/узлы');
console.log('[версия]');
ok(/const APP_VERSION = 'v1(2[5-9]|[3-9]\d)'/.test(app) && /pitlane-v1(2[5-9]|[3-9]\d)/.test(sw), 'APP_VERSION / SW ≥ v125');
console.log(fails ? `\n${fails} FAIL` : '\nOK'); process.exit(fails ? 1 : 0);
