// v108: юридический конфиг пуст → платное (Pro, сезон комнаты за Stars) не продаётся; документы без плейсхолдеров
import rawWorker, { tgWebhookPath } from '../src/index.js';
import { withAutoRefresh } from './autorefresh.mjs';
import { MemKV } from './kvmock.mjs';
import { lapBody } from './traces.mjs';
import { LEGAL_CONFIG, LEGAL_REVISION, legalReady } from '../../legal-config.js';
import fs from 'fs';

const worker = withAutoRefresh(rawWorker);
const ORIGIN = 'https://dsssssz.github.io';
let fails = 0;
const ok = (c, msg, extra) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };

console.log('\n[legal-config]');
ok(LEGAL_REVISION === '07.10.2026', 'revision 07.10.2026');
ok(legalReady({ operatorName: 'x', inn: '123', email: 'a@b.c' }) === false && legalReady({ operatorName: 'x', inn: '1234567890', email: 'a@b.c' }) === true, 'legalReady needs name + valid INN + email');
const ROOT = new URL('../../', import.meta.url).pathname;
for (const f of ['privacy.html', 'terms.html', 'offer.html', 'delete-account.html']) {
  const s = fs.readFileSync(ROOT + f, 'utf8');
  ok(!/mark class="ph"|\[(ФИО|ИНН|email|дата|цена)[^\]]*\]/.test(s), f + ': no bracket placeholders');
  ok(s.includes('07.10.2026') && s.includes('legal.js'), f + ': revision date + legal.js');
}
const priv = fs.readFileSync(ROOT + 'privacy.html', 'utf8');
ok(/GPS-данные замера/.test(priv) && /не записываются/.test(priv) && /180 дней/.test(priv) && /Удаление аккаунта стирает/.test(priv) && /Кто видит/.test(priv), 'privacy: what GPS data is stored, how long, who sees, what deletion erases');
const offer = fs.readFileSync(ROOT + 'offer.html', 'utf8');
ok(/подписка Pitlane Pro сейчас не оказывается/i.test(offer), 'offer: «подписка не оказывается» while config is empty');

if (!legalReady(LEGAL_CONFIG)) {
  console.log('\n[sales off while requisites are empty]');
  const kv = new MemKV();
  const SECRET = 'S'.repeat(32);
  const sent = [];
  const env = { PITLANE: kv, SMS_DEMO: '1', TELEGRAM_BOT_TOKEN: '123456:' + 'D'.repeat(30), TELEGRAM_BOT_USERNAME: 'pitlane_official_bot', TG_WEBHOOK_SECRET: SECRET,
    __fetch: async (u, o) => { sent.push({ method: String(u).split('/').pop(), body: JSON.parse(o?.body || '{}') }); return new Response(JSON.stringify({ ok: true, result: 'https://t.me/$X' })); } };
  let ipSeq = 1;
  const call = async (method, path, { body, token } = {}) => {
    const h = { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.108.0.' + (ipSeq++ % 250) };
    if (token) h.Authorization = 'Bearer ' + token;
    const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
    const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { status: res.status, data: d };
  };
  const o = await call('POST', '/auth/otp', { body: { phone: '79010800001' } });
  const A = (await call('POST', '/auth/verify', { body: { phone: '79010800001', code: o.data.demoCode, nick: 'Мага' } })).data;
  await call('PUT', '/me/car', { token: A.token, body: { model: 'BMW M2', tyre: 'PS4S' } });
  const room = (await call('POST', '/rooms', { token: A.token, body: { name: 'Pack' } })).data;
  let r = await call('POST', '/rooms/' + room.id + '/invoice', { token: A.token, body: {} });
  ok(r.status === 503 && r.data.code === 'NO_SALES' && !sent.some((x) => /Invoice/.test(x.method)), 'season invoice refused (no Telegram invoice created)', r.data);
  r = await call('POST', '/rooms/' + room.id + '/laps', { token: A.token, body: { ...lapBody('2:00.000', {}, { seed: 41 }), trackId: 'sochi' } });
  ok(r.status === 200 && r.data.quota.sales === false, 'room lap ok, quota.sales=false', r.data);
  r = await call('POST', '/rooms/' + room.id + '/laps', { token: A.token, body: { ...lapBody('2:01.000', {}, { seed: 42 }), trackId: 'moscow' } });
  ok(r.status !== 402, 'no paywall for a 2nd track while sales are off', r.status);
  const res = await worker.fetch(new Request('https://api.test/tg/webhook/' + tgWebhookPath(SECRET), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET }, body: JSON.stringify({ update_id: 1, pre_checkout_query: { id: 'q1', from: { id: 1 }, currency: 'XTR', total_amount: 500, invoice_payload: 'rs1:' + room.id + ':' + A.pilotId } }) }), env);
  await res.text();
  const ans = sent.find((x) => x.method === 'answerPreCheckoutQuery');
  ok(ans && ans.body.ok === false, 'pre_checkout is declined (no money taken)', ans);
}
console.log(fails ? `\n✗ ${fails} failed` : '\n✓ v108 all passed');
process.exit(fails ? 1 : 0);
