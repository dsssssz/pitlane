/**
 * v226 Shop v2: Robokassa — ссылка на оплату и ResultURL. Включается только когда всё сразу:
 *   SHOP_CONFIG.payments === true  &&  legalReady()  &&  секреты ROBOKASSA_LOGIN, ROBOKASSA_PASS1, ROBOKASSA_PASS2.
 * ROBOKASSA_TEST=1 → тестовый режим (IsTest=1, тестовые пароли из кабинета).
 * В кабинете Robokassa: ResultURL = https://<worker>/shop/robokassa/result (POST), SuccessURL/FailURL = сайт ?screen=shop.
 * Подпись запроса:  MD5(MerchantLogin:OutSum:InvId[:Receipt]:Pass1[:Shp_oid=<id>])
 * Подпись ResultURL: MD5(OutSum:InvId:Pass2[:Shp_oid=<id>])  → ответ "OK<InvId>".
 */
import { SHOP_CONFIG, deliveryById } from '../../shop-config.js';
import { legalReady } from '../../legal-config.js';

export const RK_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';
export const paymentsOn = (env) => !!(SHOP_CONFIG.payments && legalReady() && env && env.ROBOKASSA_LOGIN && env.ROBOKASSA_PASS1 && env.ROBOKASSA_PASS2);
export const outSum = (rub) => (Math.round(Number(rub) * 100) / 100).toFixed(2);

/** Чек (Робочеки СМЗ формируют чек НПД по этим позициям). */
export function receiptOf(o) {
  const items = (o.items || []).map((it) => ({ name: String(it.title).slice(0, 128), quantity: it.qty, sum: it.sum, payment_method: 'full_payment', payment_object: 'commodity', tax: 'none' }));
  if (o.promo && o.promo.off > 0 && items.length) { // скидка — распределяется на первую позицию
    items[0].sum = Math.max(0, items[0].sum - o.promo.off);
  }
  const dl = o.delivery && deliveryById(o.delivery.id);
  if (dl && o.delivery.price > 0) items.push({ name: 'Доставка: ' + dl.title, quantity: 1, sum: o.delivery.price, payment_method: 'full_payment', payment_object: 'service', tax: 'none' });
  return { items };
}

/** Ссылка на оплату заказа o (o.no — InvId, o.total — сумма). null, если оплата выключена. */
export function payUrl(env, o) {
  if (!paymentsOn(env) || !Number.isFinite(o.total) || o.total <= 0 || !o.no) return null;
  const login = env.ROBOKASSA_LOGIN; const sum = outSum(o.total); const inv = String(o.no);
  const withReceipt = String(env.ROBOKASSA_RECEIPT ?? '1') !== '0';
  const rc = withReceipt ? encodeURIComponent(JSON.stringify(receiptOf(o))) : null;
  const sig = md5([login, sum, inv, ...(rc ? [rc] : []), env.ROBOKASSA_PASS1, 'Shp_oid=' + o.id].join(':'));
  const q = new URLSearchParams({ MerchantLogin: login, OutSum: sum, InvId: inv, Description: ('PITLANE · заказ №' + o.no).slice(0, 100), SignatureValue: sig, Shp_oid: o.id, Culture: 'ru', Encoding: 'utf-8' });
  if (rc) q.set('Receipt', rc); // URLSearchParams кодирует ещё раз — так требует Robokassa
  if (o.payMethod === 'sbp') q.set('IncCurrLabel', 'SBPR');
  if (String(env.ROBOKASSA_TEST || '') === '1') q.set('IsTest', '1');
  return RK_URL + '?' + q.toString();
}

/** Проверка уведомления ResultURL. → { ok, inv, sum, oid } | { ok:false } */
export function verifyResult(env, f) {
  const sum = String(f.OutSum || ''); const inv = String(f.InvId || ''); const oid = String(f.Shp_oid || ''); const sig = String(f.SignatureValue || '').toLowerCase();
  if (!env.ROBOKASSA_PASS2 || !/^\d+(\.\d{1,6})?$/.test(sum) || !/^\d{1,12}$/.test(inv) || !/^o[a-z0-9]{10,16}$/.test(oid)) return { ok: false };
  const want = md5([sum, inv, env.ROBOKASSA_PASS2, 'Shp_oid=' + oid].join(':'));
  return want === sig ? { ok: true, inv: Number(inv), sum: Number(sum), oid } : { ok: false };
}

/* MD5 (RFC 1321), UTF-8 вход → hex. Без зависимостей — работает и в Worker, и в node-тестах. */
export function md5(str) {
  const b = new TextEncoder().encode(String(str)); const n = b.length;
  const words = new Uint32Array((((n + 8) >>> 6) + 1) * 16);
  for (let i = 0; i < n; i++) words[i >> 2] |= b[i] << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8); words[words.length - 2] = n * 8; words[words.length - 1] = Math.floor(n / 0x20000000);
  const K = []; for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let o = 0; o < words.length; o += 16) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g; const r = i >> 4;
      if (r === 0) { F = (B & C) | (~B & D); g = i; } else if (r === 1) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (r === 2) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const s = S[r * 4 + (i % 4)]; const x = (A + F + K[i] + words[o + g]) >>> 0;
      A = D; D = C; C = B; B = (B + ((x << s) | (x >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
}
