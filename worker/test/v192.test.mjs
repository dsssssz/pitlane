// v192: Paddock Pass — Stars 149 XTR, только косметика, идемпотентно, продажи выкл. без PASS_SALES
import { passSuccessfulPayment, passPreCheckout, attachPass, isPassPayload, PASS_STARS, passSalesOn } from '../src/paddock.js';
let fail = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const mem = new Map(); const kv = { get: async (k) => mem.get(k) ?? null, put: async (k, v) => { mem.set(k, v); }, delete: async (k) => { mem.delete(k); } };
const env = { PITLANE: kv };
ok(PASS_STARS === 149 && isPassPayload('pp1:abcdef12') && !isPassPayload('rs1:x:y'), '149 ★, свой payload');
ok(!passSalesOn({}) && passSalesOn({ PASS_SALES: '1' }), 'продажи выключены без PASS_SALES=1');
const calls = []; const h = { tgCall: async (e, m, b) => { calls.push([m, b]); return { ok: true }; }, providerKey: (p, id) => p + ':' + id };
await passPreCheckout(env, { id: 'q', invoice_payload: 'pp1:abcdef12', currency: 'XTR', total_amount: 149, from: { id: 1 } }, h);
ok(calls[0][1].ok === false, 'без PASS_SALES pre_checkout отклоняется');
const exp = Math.floor(Date.now() / 1000) + 2592000;
const msg = { from: { id: 1 }, successful_payment: { telegram_payment_charge_id: 'c1', invoice_payload: 'pp1:abcdef12', currency: 'XTR', total_amount: 149, subscription_expiration_date: exp } };
const r1 = await passSuccessfulPayment(env, msg); const r2 = await passSuccessfulPayment(env, msg);
ok(r1.ok && r1.until === exp * 1000 && r2.duplicate, 'оплата → until, повтор идемпотентен');
const rows = [{ pilotId: 'abcdef12', t: '1:40.0' }, { pilotId: 'zzzzzz99', t: '1:41.0' }];
await attachPass(kv, rows);
ok(rows[0].pp && !rows[1].pp && !('until' in rows[0].pp), 'в топе только публичная косметика активных');
if (fail) { console.log(`✗ ${fail} fail(s)`); process.exit(1); }
