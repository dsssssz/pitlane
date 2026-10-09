// v115: music in profile via the bot (file_id) + Worker stream proxy — node test/v115.test.mjs (MemKV, fake Telegram)
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
const worker = withAutoRefresh(rawWorker);
let fails = 0;
const ok = (c, msg, x) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const kv = new MemKV();
const SECRET = 'S'.repeat(40);
const TOKEN = '123456:' + 'A'.repeat(30);
const sent = []; const fileHits = [];
const AUDIO = new Uint8Array(1000).map((_, i) => i % 251);
const env = {
  PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET, FEEDBACK_CHAT_ID: '8591275999',
  __fetch: async (u, o) => {
    u = String(u);
    if (u.includes('/file/bot')) {
      fileHits.push({ u, range: o?.headers?.Range || null });
      const m = /bytes=(\d*)-(\d*)/.exec(o?.headers?.Range || '');
      if (m) { const a = Number(m[1] || 0); const b = m[2] ? Number(m[2]) : AUDIO.length - 1; return new Response(AUDIO.slice(a, b + 1), { status: 206, headers: { 'Content-Range': `bytes ${a}-${b}/${AUDIO.length}`, 'Content-Length': String(b - a + 1) } }); }
      return new Response(AUDIO, { status: 200, headers: { 'Content-Length': String(AUDIO.length) } });
    }
    const method = u.split('/').pop(); const body = JSON.parse(o?.body || '{}');
    sent.push({ method, body });
    if (method === 'getFile') return new Response(JSON.stringify({ ok: true, result: { file_id: body.file_id, file_path: 'music/file_' + String(body.file_id).slice(-4) + '.mp3' } }));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  },
};
let ipSeq = 1;
async function call(method, path, { body, token, headers = {}, ip, raw } = {}) {
  const h = { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.115.0.' + (ipSeq++ % 250), ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  if (raw) return res;
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: res.status, data: d, headers: res.headers };
}
const hook = async (update) => (await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify(update) }), env)).json();
async function login(phone, nick, tg) {
  const o = await call('POST', '/auth/otp', { body: { phone } });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick } });
  if (tg) { const rec = JSON.parse(await kv.get('pilot:' + v.data.pilotId)); rec.providers.push({ type: 'tg', id: String(tg) }); await kv.put('pilot:' + rec.id, JSON.stringify(rec)); await kv.put('auth:tg:' + tg, rec.id); }
  return { token: v.data.token, id: v.data.pilotId, tg };
}
const A = await login('79001150001', 'Мага', 8591275999);
const B = await login('79001150002', 'Артём', 700000002);
let mid = 1;
const audioMsg = (tg, o = {}) => ({ update_id: mid++, message: { message_id: mid, chat: { id: tg, type: 'private' }, from: { id: tg }, audio: { file_id: 'FILEID' + mid + 'abcd', file_unique_id: 'U' + mid, duration: 215, performer: 'Kavinsky', title: 'Nightcall', mime_type: 'audio/mpeg', file_size: 5_000_000, thumbnail: { file_id: 'THUMB' + mid + 'wxyz' }, ...o } } });
const lastText = () => sent.filter((x) => x.method === 'sendMessage').pop()?.body?.text || '';

console.log('[bot: existing commands still work]');
for (const [text, cmd] of [['/start', 'start'], ['/login', 'login'], ['/help', 'help'], ['/feedback', 'feedback'], ['привет', 'other']]) {
  const r = await hook({ update_id: mid++, message: { message_id: mid, chat: { id: 900000001, type: 'private' }, from: { id: 900000001 }, text } });
  ok(r.ok && r.cmd === cmd, text + ' → ' + r.cmd);
}
let r = await hook({ update_id: mid++, message: { message_id: mid, chat: { id: 900000001, type: 'private' }, from: { id: 900000001 }, text: '/start music' } });
ok(r.cmd === 'music' && /20 МБ/.test(lastText()), '/start music → instruction');
const fb = await call('POST', '/feedback', { body: { text: 'тест обратной связи v115', kind: 'idea' } });
ok(fb.status === 200 || fb.status === 201, 'app feedback endpoint still works', fb.data);

console.log('\n[bot: audio → profile]');
r = await hook(audioMsg(700000099));
ok(r.cmd === 'music:nologin' && /войди/i.test(lastText()) && !(await kv.get('music:' + A.id)), 'not linked → asks to log in, nothing saved');
r = await hook(audioMsg(A.tg));
ok(r.cmd === 'music:added' && /Nightcall/.test(lastText()) && /1\/3/.test(lastText()), 'audio saved to the author\'s profile');
r = await hook(audioMsg(A.tg, { file_size: 21 * 1024 * 1024 }));
ok(r.cmd === 'music:big' && /20 МБ/.test(lastText()), '>20 MB → honest message');
const dupMsg = audioMsg(A.tg); dupMsg.message.audio.file_unique_id = JSON.parse(await kv.get('music:' + A.id)).tracks[0].fu;
r = await hook(dupMsg);
ok(r.cmd === 'music:dup', 'same file twice → dup');
r = await hook({ update_id: mid++, message: { message_id: mid, chat: { id: A.tg, type: 'private' }, from: { id: A.tg }, document: { file_id: 'DOCFILE1234', file_unique_id: 'D1', file_name: 'Drive Theme.mp3', mime_type: 'audio/mpeg', file_size: 3_000_000 } } });
ok(r.cmd === 'music:added', 'audio sent as a file (document audio/*) accepted');
r = await hook({ update_id: mid++, message: { message_id: mid, chat: { id: A.tg, type: 'private' }, from: { id: A.tg }, document: { file_id: 'PDF1', file_unique_id: 'P1', file_name: 'x.pdf', mime_type: 'application/pdf', file_size: 3000 } } });
ok(r.cmd === 'other', 'non-audio document → normal reply');
r = await hook(audioMsg(A.tg, { title: '<script>alert(1)</script>', performer: '+7 900 123-45-67' }));
ok(r.cmd === 'music:added' && !/<script>/.test(lastText()), 'title escaped in the bot reply');
r = await hook(audioMsg(A.tg));
ok(r.cmd === 'music:full', '4th track → «уже 3 трека»');

console.log('\n[profile API]');
r = await call('GET', '/me/music', { token: A.token });
const tr = r.data.tracks;
ok(r.status === 200 && tr.length === 3 && tr[0].title === 'Nightcall' && tr[0].performer === 'Kavinsky' && tr[0].dur === 215 && tr[0].cover === true, 'own list', r.data);
ok(!JSON.stringify(r.data).includes('FILEID') && !JSON.stringify(r.data).includes('THUMB'), 'no Telegram file ids exposed');
ok(tr[2].performer === '' && !tr[2].title.includes('<') , 'phone-like performer dropped, title cleaned', tr[2]);
r = await call('GET', '/me/music');
ok(r.status === 401, '/me/music needs auth');
r = await call('PUT', '/me/music', { token: A.token, body: { order: [tr[2].id, tr[0].id, tr[1].id] } });
ok(r.status === 200 && r.data.tracks[0].id === tr[2].id, 'reorder');
r = await call('PUT', '/me/music', { token: A.token, body: { order: [tr[0].id, tr[0].id, tr[1].id] } });
ok(r.status === 400, 'bad order rejected');
r = await call('DELETE', '/me/music/' + tr[2].id, { token: A.token });
ok(r.status === 200 && r.data.tracks.length === 2, 'delete');
r = await call('DELETE', '/me/music/' + tr[0].id, { token: B.token });
ok(r.status === 404, 'cannot delete someone else\'s track');
r = await call('GET', '/pilot/' + A.id);
ok(r.status === 200 && r.data.music.length === 2 && r.data.music[0].title === 'Nightcall', 'public profile shows music');
r = await call('GET', '/music/' + A.id);
ok(r.data.tracks.length === 2, 'public list endpoint');

console.log('\n[stream proxy]');
const res = await call('GET', `/music/${A.id}/${tr[0].id}/audio`, { raw: true, headers: { Range: 'bytes=0-99' } });
const buf = new Uint8Array(await res.arrayBuffer());
ok(res.status === 206 && res.headers.get('Content-Range') === 'bytes 0-99/1000' && buf.length === 100 && buf[5] === 5 && res.headers.get('Accept-Ranges') === 'bytes' && res.headers.get('Content-Type') === 'audio/mpeg', 'Range → 206 passthrough (iOS)');
const allH = JSON.stringify([...res.headers]);
ok(!allH.includes(TOKEN) && !allH.includes('api.telegram.org') && fileHits.at(-1).u.includes(TOKEN), 'bot token used server-side only, never in the response');
const full = await call('GET', `/music/${A.id}/${tr[0].id}/audio`, { raw: true });
ok(full.status === 200 && (await full.arrayBuffer()).byteLength === 1000, 'full file 200');
const cov = await call('GET', `/music/${A.id}/${tr[0].id}/cover`, { raw: true });
ok(cov.status === 200 && cov.headers.get('Content-Type') === 'image/jpeg', 'cover via proxy');
r = await call('GET', `/music/${A.id}/${tr[1].id}/cover`);
ok(r.status === 404, 'no cover → 404');
r = await call('GET', `/music/${B.id}/${tr[0].id}/audio`);
ok(r.status === 404, 'track id of another pilot → 404 (only files from that profile)');
r = await call('GET', `/music/${A.id}/tzzzzzzzz/audio`);
ok(r.status === 404, 'unknown track → 404');
r = await call('GET', `/music/${A.id}/${tr[0].id}/audio`, { headers: { Range: 'bytes=abc' } });
ok(r.status === 416, 'bad Range → 416');
let last = 200;
for (let i = 0; i < 125; i++) { last = (await call('GET', `/music/${A.id}/${tr[0].id}/audio`, { ip: '10.115.9.9', raw: true })).status; if (last === 429) break; }
ok(last === 429, 'plays rate-limited per IP');
let mid2 = 0;
for (let i = 0; i < 30; i++) { const x = await call('GET', `/music/${A.id}/${tr[0].id}/audio`, { ip: '10.115.9.9', raw: true, headers: { Range: 'bytes=' + (100 + i) + '-200' } }); if (x.status === 206) mid2++; }
ok(mid2 === 30, 'mid-file Range chunks of a play are not counted');

console.log('\n[account deletion]');
r = await call('DELETE', '/account', { token: A.token });
ok(r.status === 200 && r.data.deleted.music === 1 && !(await kv.get('music:' + A.id)), 'music removed with the account');
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v115 all passed');
process.exit(fails ? 1 : 0);
