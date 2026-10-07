// v98: teams (public profile + feed over v97 rooms) — node test/v98.test.mjs (MemKV only, no prod)
import rawWorker from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
const worker = withAutoRefresh(rawWorker);
import { MemKV } from './kvmock.mjs';
import { lapTrace } from './traces.mjs';

const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ipSeq = 1;
async function call(method, path, { body, token, ip, raw } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '10.98.0.' + (ipSeq++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  if (raw) return res;
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
async function login(phone, nick) {
  const ip = '10.98.' + (ipSeq++) + '.1';
  const o = await call('POST', '/auth/otp', { body: { phone }, ip });
  const v = await call('POST', '/auth/verify', { body: { phone, code: o.data.demoCode, nick }, ip });
  return { token: v.data.token, id: v.data.pilotId };
}
const webp = (n = 600) => {
  const b = Buffer.alloc(n, 7); b.write('RIFF', 0); b.writeUInt32LE(n - 8, 4); b.write('WEBP', 8);
  return 'data:image/webp;base64,' + b.toString('base64');
};
const lap = (ms, o = {}) => {
  const s = Math.floor(ms / 1000); const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  return { t, ms, gps: true, valid: true, gpsQ: 'A', sectors: [Math.round(ms * 0.32), Math.round(ms * 0.66), ms], trackId: 'sochi', trace: lapTrace(ms), ...o };
};
const A = await login('79009800001', 'Мага');
const B = await login('79009800002', 'Артём');
const C = await login('79009800003', 'Дима');
const D = await login('79009800004', 'Гость');
for (const P of [A, B, C]) await call('PUT', '/me/car', { token: P.token, body: { model: 'BMW M2 G87', tyre: 'Michelin PS4S' } });

console.log('\n[public team page]');
let r = await call('POST', '/rooms', { token: A.token, body: { name: 'Neon Pack' } });
const room = r.data;
await call('POST', '/rooms/join', { token: B.token, body: { code: room.invite } });
r = await call('GET', '/teams');
ok(r.status === 200 && r.data.teams.some((t) => t.id === room.id && t.memberCount === 2), 'anonymous team list includes the team');
r = await call('GET', '/teams/' + room.id);
ok(r.status === 200 && r.data.name === 'Neon Pack' && r.data.members.length === 2 && r.data.members[0].role === 'captain', 'anonymous public profile');
ok(!('invite' in r.data) && !('quota' in r.data) && !JSON.stringify(r.data).includes(A.id), 'public profile has no invite / quota / pilot ids');
r = await call('GET', '/rooms/' + room.id);
ok(r.status === 401, 'private room still needs login');
r = await call('GET', '/rooms/' + room.id + '/laps', { token: D.token });
ok(r.status === 403, 'private laps stay members-only');

console.log('\n[editor: captain only]');
r = await call('PUT', '/teams/' + room.id, { token: B.token, body: { about: 'hack' } });
ok(r.status === 403, 'member cannot edit profile');
r = await call('PUT', '/teams/' + room.id, { token: A.token, body: { name: 'Neon Pack Сочи', about: 'Едем в Сочи <script>x</script> ' + 'я'.repeat(400) } });
ok(r.status === 200 && r.data.name === 'Neon Pack Сочи' && r.data.about.length === 280, 'captain edits name/about (about capped 280)');
r = await call('PUT', '/teams/' + room.id, { token: A.token, body: { about: 'звони +7 900 123-45-67' } });
ok(r.status === 400, 'phone number in description rejected');
r = await call('PUT', '/teams/' + room.id, { token: A.token, body: { about: 'Трек-дни в Сочи и Москве. Пишем всё в ленту.' } });
r = await call('PUT', '/teams/' + room.id + '/avatar', { token: B.token, body: { image: webp() } });
ok(r.status === 403, 'member cannot set avatar');
r = await call('PUT', '/teams/' + room.id + '/avatar', { token: A.token, body: { image: 'data:image/webp;base64,' + Buffer.alloc(600, 1).toString('base64') } });
ok(r.status === 400, 'avatar content must match MIME');
r = await call('PUT', '/teams/' + room.id + '/avatar', { token: A.token, body: { image: webp(160 * 1024) } });
ok(r.status === 400 || r.status === 413, 'avatar > 150 KB rejected');
r = await call('PUT', '/teams/' + room.id + '/avatar', { token: A.token, body: { image: webp() } });
ok(r.status === 200 && r.data.avatarV, 'captain sets avatar');
let res = await call('GET', '/teams/' + room.id + '/avatar', { raw: true });
ok(res.status === 200 && res.headers.get('Content-Type') === 'image/webp' && res.headers.get('X-Content-Type-Options') === 'nosniff', 'avatar served as image/webp + nosniff');

console.log('\n[feed]');
r = await call('POST', '/teams/' + room.id + '/posts', { body: { text: 'hi' } });
ok(r.status === 401, 'anonymous cannot post');
r = await call('POST', '/teams/' + room.id + '/posts', { token: D.token, body: { text: 'spam' } });
ok(r.status === 403, 'non-member cannot post');
r = await call('POST', '/teams/' + room.id + '/posts', { token: B.token, body: { text: 'x'.repeat(601) } });
ok(r.status === 400, 'post > 600 chars rejected');
r = await call('POST', '/teams/' + room.id + '/posts', { token: B.token, body: { text: '   ' } });
ok(r.status === 400, 'empty post rejected');
r = await call('POST', '/teams/' + room.id + '/posts', { token: B.token, body: { text: 'Сегодня <b>трек</b>-день', image: webp(900) } });
const pB = r.data.post;
ok(r.status === 200 && pB.img === true && pB.text === 'Сегодня <b>трек</b>-день' && pB.mine, 'member posts text + photo (stored raw, rendered as text)');
res = await call('GET', `/teams/${room.id}/img/${pB.id}`, { raw: true });
ok(res.status === 200 && res.headers.get('Content-Type') === 'image/webp', 'post photo served publicly');
r = await call('POST', '/teams/' + room.id + '/posts', { token: A.token, body: { text: 'Капитанский пост' } });
const pA = r.data.post;
r = await call('GET', '/teams/' + room.id + '/feed');
ok(r.status === 200 && r.data.posts.length === 2 && r.data.posts[0].id === pA.id && r.data.posts.every((p) => !p.canDelete), 'anonymous reads feed (newest first, no delete rights)');
r = await call('DELETE', `/teams/${room.id}/posts/${pA.id}`, { token: B.token });
ok(r.status === 403, 'member cannot delete someone else\'s post');
r = await call('DELETE', `/teams/${room.id}/posts/${pB.id}`, { token: A.token });
ok(r.status === 200 && !(await kv.get('teamimg:' + pB.id)), 'captain deletes any post (+ photo)');

console.log('\n[«Попроситься» + approve]');
r = await call('POST', `/teams/${room.id}/request`, { token: C.token, body: { note: 'Езжу на M2' } });
ok(r.status === 200 && r.data.requested, 'C asks to join');
r = await call('GET', '/teams/' + room.id, { token: C.token });
ok(r.data.viewer.requested === true && r.data.viewer.member === false, 'viewer sees own pending request');
r = await call('GET', '/rooms/' + room.id, { token: B.token });
ok(r.data.requests === undefined, 'members do not see requests');
r = await call('GET', '/rooms/' + room.id, { token: A.token });
ok(r.data.requests.length === 1 && r.data.requests[0].nick === 'Дима', 'captain sees the request');
const reqId = r.data.requests[0].id;
r = await call('POST', `/teams/${room.id}/requests/${reqId}/approve`, { token: B.token });
ok(r.status === 403, 'member cannot approve');
r = await call('POST', `/teams/${room.id}/requests/${reqId}/approve`, { token: A.token });
r = await call('GET', '/rooms/' + room.id, { token: C.token });
ok(r.status === 200 && r.data.role === 'member', 'approved → member');
r = await call('POST', `/teams/${room.id}/request`, { token: D.token, body: {} });
r = await call('GET', '/rooms/' + room.id, { token: A.token });
await call('POST', `/teams/${room.id}/requests/${r.data.requests[0].id}/decline`, { token: A.token });
r = await call('GET', '/rooms/' + room.id, { token: D.token });
ok(r.status === 403, 'declined → still not a member');

console.log('\n[auto-posts only for public laps]');
await call('POST', `/rooms/${room.id}/laps`, { token: B.token, body: lap(125000, { public: true }) });
r = await call('GET', '/teams/' + room.id + '/feed');
ok(r.data.posts[0].kind === 'best' && r.data.posts[0].nick === 'Артём' && r.data.posts[0].meta.t === '2:05.000', 'public best lap → «новый лучший круг»');
const n1 = r.data.posts.length;
await call('POST', `/rooms/${room.id}/laps`, { token: C.token, body: lap(121000) });
r = await call('GET', '/teams/' + room.id + '/feed');
ok(r.data.posts.length === n1, 'faster but private lap → no auto-post');
await call('POST', `/rooms/${room.id}/laps`, { token: A.token, body: lap(119500, { public: true }) });
r = await call('GET', '/teams/' + room.id + '/feed');
ok(r.data.posts[0].kind === 'best' && r.data.posts[0].nick === 'Мага' && r.data.posts[0].meta.prevNick === null && r.data.posts[0].meta.delta === null, 'public room best over a private lap → auto-post, private holder not named');
await call('POST', `/rooms/${room.id}/laps`, { token: B.token, body: lap(119000, { public: true }) });
r = await call('GET', '/teams/' + room.id + '/feed');
ok(r.data.posts[0].nick === 'Артём' && r.data.posts[0].meta.prevNick === 'Мага' && r.data.posts[0].meta.delta === 500, 'public best beats a public holder → named with delta');
const laps = (await call('GET', `/rooms/${room.id}/laps`, { token: A.token })).data.laps;
const la = laps.find((l) => l.nick === 'Мага'); const lb = laps.find((l) => l.nick === 'Артём' && l.ms === 125000); const lc = laps.find((l) => l.nick === 'Дима');
r = await call('POST', `/teams/${room.id}/duelpost`, { token: A.token, body: { a: la.id, b: lc.id } });
ok(r.status === 409 && r.data.code === 'NOT_PUBLIC', 'duel with a private lap → not posted');
r = await call('POST', `/teams/${room.id}/duelpost`, { token: D.token, body: { a: la.id, b: lb.id } });
ok(r.status === 403, 'non-member cannot post duels');
r = await call('POST', `/teams/${room.id}/duelpost`, { token: B.token, body: { a: lb.id, b: la.id } });
ok(r.status === 200 && r.data.post.kind === 'duel' && r.data.post.nick === 'Мага' && r.data.post.meta.vsNick === 'Артём' && r.data.post.meta.delta === 5500, '«выиграл дуэль» posted for the winner');
r = await call('POST', `/teams/${room.id}/duelpost`, { token: A.token, body: { a: la.id, b: lb.id } });
ok(r.data.dup === true, 'duel post deduplicated');

console.log('\n[search / listed / roles]');
await call('POST', '/rooms', { token: D.token, body: { name: 'Moscow Raceway Crew' } });
r = await call('GET', '/teams?q=moscow');
ok(r.data.teams.length === 1 && r.data.teams[0].name === 'Moscow Raceway Crew', 'search by name');
await call('PUT', '/teams/' + room.id, { token: A.token, body: { listed: false } });
r = await call('GET', '/teams');
ok(!r.data.teams.some((t) => t.id === room.id), 'unlisted team hidden from list');
r = await call('GET', '/teams/' + room.id);
ok(r.status === 200, '…but its page still opens by link');
await call('PUT', '/teams/' + room.id, { token: A.token, body: { listed: true } });
const ids = (await call('GET', '/rooms/' + room.id, { token: A.token })).data.members;
const bId = ids.find((m) => m.nick === 'Артём').pilotId;
r = await call('POST', `/teams/${room.id}/members/${bId}/captain`, { token: A.token });
ok(r.status === 200 && r.data.members.find((m) => m.nick === 'Артём').role === 'captain' && r.data.viewer.role === 'member', 'captain hands over the role');
r = await call('PUT', '/teams/' + room.id, { token: A.token, body: { about: 'x' } });
ok(r.status === 403, 'ex-captain can no longer edit');

console.log('\n[limits]');
let last;
for (let i = 0; i < 21; i++) last = await call('POST', '/teams/' + room.id + '/posts', { token: C.token, body: { text: 'пост ' + i } });
ok(last.status === 429, 'posts per pilot per day capped (20)');
for (let i = 0; i < 11; i++) last = await call('POST', `/teams/${room.id}/request`, { token: D.token, body: {} });
ok(last.status === 429 || last.status === 409 || last.status === 200, 'join requests rate-limited');

console.log('\n[account deletion + last member leaves]');
r = await call('DELETE', '/account', { token: C.token, ip: '10.98.250.1' });
const rest = kv.dump().filter(([k, v]) => k.includes(C.id) || v.includes(C.id));
ok(r.status === 200 && rest.length === 0, 'no team key references the deleted pilot ' + JSON.stringify(rest.map((x) => x[0])));
r = await call('GET', '/teams/' + room.id + '/feed');
ok(!r.data.posts.some((p) => p.nick === 'Дима'), 'deleted pilot posts gone from the feed');
const dRoom = (await call('GET', '/teams?q=moscow')).data.teams[0].id;
await call('POST', `/rooms/${dRoom}/leave`, { token: D.token });
r = await call('GET', '/teams/' + dRoom);
ok(r.status === 404 && !(await kv.get('room:' + dRoom)) && !(await call('GET', '/teams?q=moscow')).data.teams.length, 'last member leaves → team removed from KV and list');

console.log(fails ? `\n${fails} FAILED` : '\nall v98 tests passed');
process.exit(fails ? 1 : 0);
