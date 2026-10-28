/**
 * v192: Paddock Pass — подписка 149 ★/мес (Telegram Stars, XTR), ТОЛЬКО внешний вид:
 * Race Number у ника, Carbon, рамки (forged/titanium/ceramic/gold18/chrome; carbon/chequer мигрируют), пины (helmet/wheel/carbon).
 * Награды за время НЕ продаются и здесь не выдаются. Robokassa/рубли не используются.
 * Продажи выключены, пока в окружении нет PASS_SALES="1" (legalReady/Pro не трогаем).
 * KV: pass:<pilotId> = { until, number, frame, pin, charges[] }; идемпотентность — paycharge:<chargeId>.
 */
export const PASS_STARS = 149;
export const PASS_PERIOD_S = 2592000; // 30 дней — единственный период подписки Stars в Bot API
const PAYLOAD_RE = /^pp1:([A-Za-z0-9_-]{6,64})$/;
const FRAMES = ['', 'forged', 'titanium', 'ceramic', 'gold18', 'chrome'];
const FR_LEGACY = { carbon: 'forged', chequer: 'chrome' }; // v210: миграция старых рамок
const fr = (v) => { v = FR_LEGACY[v] || v; return FRAMES.includes(v) ? v : ''; };
const PINS = ['', 'helmet', 'wheel', 'carbon'];

export function passSalesOn(env) { return String(env?.PASS_SALES || '') === '1' || env?.__passForTests === true; }
export function isPassPayload(p) { return PAYLOAD_RE.test(String(p || '')); }
function active(p, now = Date.now()) { return !!p && Number(p.until) > now; }
export function publicPass(p, now = Date.now()) {
  if (!active(p, now)) return null;
  return { frame: fr(p.frame), pin: PINS.includes(p.pin) ? p.pin : '' };
}
async function loadPass(kv, pid) { try { const r = await kv.get('pass:' + pid); return r ? JSON.parse(r) : null; } catch (_) { return null; } }

/** GET /me/pass · POST /me/pass/invoice · PUT /me/pass/cosmetics. null — не наш путь. */
export async function passRoute({ req, env, path, pilot, headers, h }) {
  if (!path.startsWith('/me/pass')) return null;
  const denied = h.requireAuth(pilot, headers);
  if (denied) return denied;
  const kv = env.PITLANE;
  const p = await loadPass(kv, pilot.id);
  if (req.method === 'GET' && path === '/me/pass') {
    return h.json({ ok: true, sales: passSalesOn(env), stars: PASS_STARS, pass: active(p) ? { active: true, until: p.until, ...publicPass(p) } : null }, 200, headers);
  }
  if (req.method === 'POST' && path === '/me/pass/invoice') {
    if (!passSalesOn(env)) return h.json({ error: 'подписка пока недоступна' }, 403, headers);
    const lim = await h.limitOr429(env, headers, [['rl:ppinv:p:' + pilot.id, 10, 3600]]);
    if (lim) return lim;
    const spec = {
      title: 'Paddock Pass',
      description: 'Внешний вид в Pitlane: карбон, рамки и пины. Награды за время не продаются.',
      payload: 'pp1:' + pilot.id,
      currency: 'XTR',
      prices: [{ label: 'Paddock Pass · 30 дней', amount: PASS_STARS }],
      subscription_period: PASS_PERIOD_S,
    };
    const r = await h.tgCall(env, 'createInvoiceLink', spec);
    if (!r?.ok || typeof r.result !== 'string') return h.json({ error: 'telegram: ' + String(r?.description || 'fail').slice(0, 120) }, 502, headers);
    return h.json({ ok: true, link: r.result, stars: PASS_STARS }, 200, headers);
  }
  if (req.method === 'PUT' && path === '/me/pass/cosmetics') {
    if (!active(p)) return h.json({ error: 'нужен активный Paddock Pass' }, 402, headers);
    const b = await h.readJson(req, 2048).catch(() => ({}));
    const next = { ...p, number: null, frame: fr(b?.frame), pin: PINS.includes(b?.pin) ? b.pin : '' };
    await kv.put('pass:' + pilot.id, JSON.stringify(next));
    return h.json({ ok: true, pass: { active: true, until: next.until, ...publicPass(next) } }, 200, headers);
  }
  return h.json({ error: 'not found' }, 404, headers);
}

export async function passPreCheckout(env, q, h) {
  const fail = async (m) => { await h.tgCall(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: false, error_message: m }); return { ok: false, msg: m }; };
  if (!passSalesOn(env)) return await fail('Подписка временно недоступна');
  const mm = String(q.invoice_payload || '').match(PAYLOAD_RE);
  if (!mm || q.currency !== 'XTR' || Number(q.total_amount) !== PASS_STARS) return await fail('Счёт устарел — открой заново');
  const payer = await env.PITLANE.get(h.providerKey('tg', String(q.from?.id || '')));
  if (!payer || payer !== mm[1]) return await fail('Оплатить можно только со своего аккаунта');
  await h.tgCall(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: true });
  return { ok: true };
}

/** successful_payment (первый платёж и каждое продление подписки) → until = subscription_expiration_date. */
export async function passSuccessfulPayment(env, msg, now = Date.now()) {
  const sp = msg?.successful_payment;
  const charge = String(sp?.telegram_payment_charge_id || '').slice(0, 128);
  if (!sp || !charge) return { ok: false };
  const ckey = 'paycharge:' + charge;
  if (await env.PITLANE.get(ckey)) return { ok: true, duplicate: true };
  const mm = String(sp.invoice_payload || '').match(PAYLOAD_RE);
  const rec = { at: now, stars: Number(sp.total_amount) || 0, currency: sp.currency, tg: String(msg.from?.id || ''), kind: 'pass' };
  if (!mm || sp.currency !== 'XTR') { await env.PITLANE.put(ckey, JSON.stringify({ ...rec, error: 'bad payload' })); return { ok: false }; }
  const pid = mm[1];
  const p = (await loadPass(env.PITLANE, pid)) || {};
  const exp = Number(sp.subscription_expiration_date) * 1000;
  const until = exp > now ? exp : Math.max(now, Number(p.until) || 0) + PASS_PERIOD_S * 1000;
  await env.PITLANE.put('pass:' + pid, JSON.stringify({ ...p, until, charges: [...(p.charges || []).slice(-11), charge] }));
  await env.PITLANE.put(ckey, JSON.stringify(rec));
  return { ok: true, pilotId: pid, until };
}

/** Публичные косметики пилотов в строках топа: r.pp = { number, frame, pin } только у активных. */
export async function attachPass(kv, rows, max = 40) {
  const ids = [];
  for (const r of rows || []) { if (r?.pilotId && !ids.includes(r.pilotId)) ids.push(r.pilotId); if (ids.length >= max) break; }
  const m = new Map();
  await Promise.all(ids.map(async (id) => { const p = publicPass(await loadPass(kv, id)); if (p) m.set(id, p); }));
  for (const r of rows || []) { const p = r && m.get(r.pilotId); if (p) r.pp = p; }
  return rows;
}

export async function deleteAccountPass(kv, pid) { try { await kv.delete('pass:' + pid); } catch (_) {} }
