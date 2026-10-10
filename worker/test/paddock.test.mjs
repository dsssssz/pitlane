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
const noLeak = (label, text) => ok(![A, B, C].some((u) => text.includes(u.phone) || text.includes(u.phone.slice(1)) || text.includes(u.token))
  && !/"likes"\s*:\s*\[/.test(text) && !/inviteCode|providers|sess:|trialEnds|paidUntil|plan"/.test(text), label + ' — no phones / tokens / liker ids / account internals');

console.log('\n[likes]');
let r = await call('POST', '/pulse', { token: A.token, body: { text: 'Поставил новые колодки', car: 'BMW M2 <b>' } });
const post = r.data[0];
ok(r.status === 200 && post.likeCount === 0 && post.liked === false && post.commentCount === 0, 'new post: likeCount 0, liked false, commentCount 0');
ok(post.car === 'BMW M2 b', 'post car label cleaned (no <>)');
noLeak('POST /pulse', r.text);
r = await call('POST', `/pulse/${post.id}/like`, { token: B.token });
ok(r.status === 200 && r.data.liked === true && r.data.likeCount === 1, 'B likes → 1, liked');
r = await call('POST', `/pulse/${post.id}/like`, { token: B.token, body: { liked: true } });
ok(r.data.likeCount === 1 && r.data.liked, 'explicit liked:true is idempotent (still 1)');
r = await call('POST', `/pulse/${post.id}/like`, { token: C.token });
ok(r.data.likeCount === 2, 'C likes → 2 (one per account)');
r = await call('POST', `/pulse/${post.id}/like`, { token: B.token });
ok(r.data.liked === false && r.data.likeCount === 1, 'B toggles off → 1');
r = await call('POST', `/pulse/${post.id}/like`);
ok(r.status === 401, 'anonymous like → 401');
r = await call('POST', '/pulse/nope/like', { token: B.token });
ok(r.status === 404, 'like on missing post → 404');
r = await call('GET', '/pulse', { token: C.token });
ok(r.data[0].liked === true && r.data[0].likeCount === 1, 'feed shows liked for viewer C');
noLeak('GET /pulse (authed)', r.text);
ok(!r.text.includes(C.id) || r.data.every((p) => p.pilotId !== C.id) && !r.text.includes('"' + C.id + '"'), 'liker uuid not published in feed');
r = await call('GET', '/pulse');
ok(r.data[0].liked === false && r.data[0].likeCount === 1, 'anonymous feed: liked=false, count visible');

console.log('\n[comments]');
r = await call('POST', `/pulse/${post.id}/comments`, { body: { text: 'hi' } });
ok(r.status === 401, 'anonymous comment → 401');
r = await call('POST', `/pulse/${post.id}/comments`, { token: B.token, body: { text: '   ' } });
ok(r.status === 400, 'empty comment → 400');
r = await call('POST', `/pulse/${post.id}/comments`, { token: B.token, body: { text: 'x'.repeat(501) } });
ok(r.status === 400 && r.data.max === 500, '> 500 chars → 400');
r = await call('POST', `/pulse/${post.id}/comments`, { token: B.token, raw: JSON.stringify({ text: 'x'.repeat(9000) }) });
ok(r.status === 413, 'comment body > 8 KB → 413');
r = await call('POST', '/pulse/does-not-exist/comments', { token: B.token, body: { text: 'hello' } });
ok(r.status === 404, 'comment on missing post → 404');
r = await call('POST', '/pulse/..%2Fpilot/comments', { token: B.token, body: { text: 'hello' } });
ok(r.status === 404, 'weird post id → 404');
r = await call('POST', `/pulse/${post.id}/comments`, { token: B.token, body: { text: 'Круто! <img src=x onerror=alert(1)>\u202e' } });
const cB = r.data.comment;
ok(r.status === 200 && r.data.count === 1 && cB.who === 'Боб' && cB.mine === true && cB.pilotId === B.id, 'B comments (nick from account, mine=true)');
ok(!cB.text.includes('\u202e'), 'bidi override stripped (text is rendered via textContent on the client)');
noLeak('POST comment', r.text);
r = await call('POST', `/pulse/${post.id}/comments`, { token: B.token, body: { text: 'Круто! <img src=x onerror=alert(1)>' } });
ok(r.status === 409 && r.data.error === 'duplicate', 'same text twice in a row → 409 duplicate');
r = await call('POST', `/pulse/${post.id}/comments`, { token: A.token, body: { text: 'Спасибо' } });
ok(r.status === 200 && r.data.count === 2, 'A comments → 2');
r = await call('GET', `/pulse/${post.id}/comments`);
ok(r.status === 200 && r.data.count === 2 && r.data.comments.every((c) => c.mine === false), 'public read, mine=false for anonymous');
ok(r.data.comments.every((c) => Object.keys(c).sort().join() === 'at,id,mine,pilotId,text,who'), 'comment fields are whitelisted');
noLeak('GET comments', r.text);
r = await call('GET', '/pulse');
ok(r.data[0].commentCount === 2, 'feed commentCount = 2');
// burst anti-spam: 3 / 30 s per pilot
let codes = [];
for (let i = 0; i < 4; i++) codes.push((await call('POST', `/pulse/${post.id}/comments`, { token: C.token, body: { text: 'spam ' + i } })).status);
ok(codes.slice(0, 3).every((s) => s === 200) && codes[3] === 429, 'burst limit: 4th comment in 30 s → 429 (' + codes.join(',') + ')');
// delete
r = await call('DELETE', `/pulse/${post.id}/comments/${cB.id}`, { token: A.token });
ok(r.status === 403, 'post author cannot delete someone else\'s comment (403)');
r = await call('DELETE', `/pulse/${post.id}/comments/${cB.id}`);
ok(r.status === 401, 'anonymous delete → 401');
r = await call('DELETE', `/pulse/${post.id}/comments/${cB.id}`, { token: B.token });
ok(r.status === 200 && r.data.count === 4, 'B deletes own comment');
r = await call('DELETE', `/pulse/${post.id}/comments/${cB.id}`, { token: B.token });
ok(r.status === 404, 'second delete → 404');
r = await call('GET', '/pulse');
ok(r.data[0].commentCount === 4, 'feed commentCount follows deletions');

console.log('\n[public profile]');
await call('POST', '/tops/straight/bmw-m2', { token: A.token, body: dragBody('0-100', 4.31, { name: 'Алиса', car: 'BMW M2' }) });
await call('POST', '/tops/straight/bmw-m2', { token: A.token, body: dragBody('0-100', 4.12, { name: 'Алиса', car: 'BMW M2' }) });
await call('POST', '/tops/straight/bmw-m2', { token: A.token, body: dragBody('0-100', 3.2, { name: 'Алиса', car: 'BMW M2', gpsQ: 'A', valid: true }, { acc: 30 }) });
await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW M2', tyre: 'PS4S' } });
await call('PUT', '/me/car', { token: B.token, body: { model: 'Supra', tyre: 'PS4S' } });
await call('POST', '/tops/lap/sochi', { token: A.token, body: lapBody('2:01.500', { name: 'Алиса', car: 'BMW M2' }) });
await call('POST', '/tops/lap/sochi', { token: A.token, body: lapBody('2:02.000', { name: 'Алиса', car: 'BMW M2' }, { seed: 9 }) });
await call('POST', '/tops/lap/sochi', { token: B.token, body: lapBody('1:59.000', { name: 'Боб', car: 'Supra' }) });
r = await call('GET', '/pilot/' + A.id, { token: B.token });
const pr = r.data;
ok(r.status === 200 && pr.nick === 'Алиса' && pr.car === 'BMW M2', 'profile: nick + car');
ok(pr.best.zeroHundred.length === 1 && Math.abs(pr.best.zeroHundred[0].t - 4.12) < 0.05, 'best 0–100 ≈ 4.12 (GPS C run ignored) ' + JSON.stringify(pr.best.zeroHundred));
ok(pr.best.laps.length === 1 && /^2:01\.[3-6]/.test(pr.best.laps[0].t) && pr.best.laps[0].trackId === 'sochi', 'best lap on sochi ≈ 2:01.5 (B\'s faster lap not mixed in) ' + pr.best.laps[0].t);
ok(Array.isArray(pr.best.laps[0].sectors) && pr.best.laps[0].sectors.length === 3 && pr.best.laps[0].sectors.every((x) => x > 30000 && x < 45000), 'best sectors per split (server gates S1/S2) ' + JSON.stringify(pr.best.laps[0].sectors));
ok(pr.postCount === 1 && pr.posts[0].id === post.id && pr.likesReceived === 1 && pr.posts[0].liked === false, 'profile posts + likes received');
ok(Object.keys(pr).sort().join() === 'avatar,banner,best,car,carPhoto,likesReceived,music,nick,pilotId,postCount,posts', 'profile top-level fields whitelisted');
noLeak('GET /pilot/:id', r.text);
r = await call('GET', '/pilot/' + C.id);
ok(r.status === 200 && r.data.best.zeroHundred.length === 0 && r.data.best.laps.length === 0 && r.data.postCount === 0, 'empty profile renders empty lists');
r = await call('GET', '/pilot/p_00000000-0000-0000-0000-000000000000');
ok(r.status === 404, 'unknown pilot → 404');
r = await call('GET', '/pilot/79001230001');
ok(r.status === 404 && !r.text.includes('Алиса'), 'phone as id → 404 (no lookup by phone)');
r = await call('GET', '/pilot/dev_abcdefgh12');
ok(r.status === 404, 'guest id → 404');

console.log('\n[delete post / account cleanup]');
const k0 = await kv.get('pcom:' + post.id);
ok(!!k0, 'comment thread stored');
r = await call('POST', '/pulse', { token: B.token, body: { text: 'пост Боба' } });
const postB = r.data[0];
await call('POST', `/pulse/${postB.id}/comments`, { token: C.token, ip: '10.1.9.9', body: { text: 'коммент C у Боба' } }).catch(() => {});
await call('POST', `/pulse/${postB.id}/comments`, { token: A.token, body: { text: 'коммент A у Боба' } });
r = await call('DELETE', '/pulse/' + post.id, { token: A.token });
ok(!(await kv.get('pcom:' + post.id)), 'deleting a post removes its comment thread');
r = await call('DELETE', '/account', { token: A.token });
ok(r.status === 200, 'A deletes account');
const thread = JSON.parse((await kv.get('pcom:' + postB.id)) || '[]');
ok(thread.every((c) => c.pilotId !== A.id), 'account deletion removes A\'s comments elsewhere');
ok(!(await kv.get('ptops:' + A.id)), 'account deletion removes tops index');
r = await call('GET', '/pilot/' + A.id);
ok(r.status === 404, 'deleted pilot profile → 404');
r = await call('GET', '/pulse');
ok(r.data.find((p) => p.id === postB.id).commentCount === thread.length, 'commentCount synced after account deletion');

console.log(fails ? `\n${fails} paddock test(s) FAILED` : '\nall paddock tests passed');
process.exit(fails ? 1 : 0);
