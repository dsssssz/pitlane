// v307: токены и OTP хранятся в KV только как SHA-256; старые открытые ключи мигрируют при чтении (без разлогина).
import worker from '../src/index.js';
import { MemKV } from './kvmock.mjs';
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const kv = new MemKV();
const env = { PITLANE: kv, SMS_DEMO: '1' };
let ip = 1;
async function call(method, path, { body, token } = {}) {
  const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.37.0.' + (ip++ % 250) };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: res.status, data: d };
}
const dump = async () => { const all = []; let c; do { const l = await kv.list({ cursor: c }); all.push(...l.keys.map((k) => k.name)); c = l.list_complete ? null : l.cursor; } while (c); return all; };
const valsOf = async (keys) => Promise.all(keys.map((k) => kv.get(k)));

console.log('\n[otp hashed at rest]');
const o = await call('POST', '/auth/otp', { body: { phone: '79013070001' } });
const code = o.data.demoCode;
const otpRaw = await kv.get('otp:79013070001');
ok(otpRaw && !otpRaw.includes(String(code)) && JSON.parse(otpRaw).ch, 'OTP record holds only a hash', otpRaw);
let v = await call('POST', '/auth/verify', { body: { phone: '79013070001', code: code === '000000' ? '111111' : '000000', nick: 'Хэш' } });
ok(v.status === 400, 'wrong code rejected');
v = await call('POST', '/auth/verify', { body: { phone: '79013070001', code, nick: 'Хэш' } });
ok(v.status === 200 && v.data.token, 'right code accepted', v.data);
const { token, refreshToken } = v.data;

console.log('\n[tokens hashed at rest]');
const keys = await dump();
const blob = keys.join('|') + (await valsOf(keys)).join('|');
ok(!blob.includes(token) && !blob.includes(refreshToken), 'no plain access/refresh token in any KV key or value');
ok(keys.some((k) => k.startsWith('sess:h:')) && keys.some((k) => k.startsWith('rt:h:')), 'hashed sess:h:/rt:h: keys exist');
ok((await call('GET', '/me', { token })).status === 200, 'access token works');
let r = await call('POST', '/auth/refresh', { body: { refreshToken } });
ok(r.status === 200 && r.data.refreshToken !== refreshToken, 'refresh rotates');
ok((await call('POST', '/auth/refresh', { body: { refreshToken } })).status === 401, 'old refresh is single-use');
const ttl = kv.ttl ? kv.ttl : null;

console.log('\n[legacy plain keys migrate on read]');
const me = (await call('GET', '/me', { token: r.data.token })).data;
const pid = me.pilotId || me.id || me.pilot?.id;
const LT = 'a'.repeat(48), LR = 'b'.repeat(48), OLD = 'c'.repeat(48);
await kv.put('sess:' + LT, JSON.stringify({ pilotId: pid, nick: 'Хэш', provider: 'phone', at: Date.now(), rt: LR }));
await kv.put('rt:' + LR, JSON.stringify({ pilotId: pid, provider: 'phone', at: Date.now() }));
await kv.put('sess:' + OLD, JSON.stringify({ pilotId: pid, nick: 'Хэш', provider: 'phone', at: Date.now() }));
await kv.put('sessidx:' + pid, JSON.stringify([LT, 'rt:' + LR, OLD]));
ok((await call('GET', '/me', { token: LT })).status === 200, 'legacy access token still works');
ok(!(await kv.get('sess:' + LT)), 'legacy plain sess key removed after migration');
ok((await call('GET', '/me', { token: LT })).status === 200, 'migrated token works on next call');
ok((await call('GET', '/me', { token: OLD })).status === 200, 'pre-v104 token (no refresh) still works');
const idx = JSON.parse(await kv.get('sessidx:' + pid));
ok(!idx.includes(LT) && idx.some((x) => x.startsWith('sess:h:')), 'session index rewritten to hashed keys', idx);
r = await call('POST', '/auth/refresh', { body: { refreshToken: LR } });
ok(r.status === 200 && r.data.token, 'legacy refresh token still refreshes', r.data);
ok(!(await kv.get('rt:' + LR)), 'legacy refresh key consumed');
ok((await call('POST', '/auth/refresh', { body: { refreshToken: LR } })).status === 401, 'legacy refresh single-use');

console.log('\n[logout revokes hashed session]');
const nt = r.data.token, nr = r.data.refreshToken;
await call('POST', '/auth/logout', { token: nt, body: { refreshToken: nr } });
ok((await call('GET', '/me', { token: nt })).status === 401, 'access revoked');
ok((await call('POST', '/auth/refresh', { body: { refreshToken: nr } })).status === 401, 'refresh revoked');

console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v307 all passed');
process.exit(fails ? 1 : 0);
