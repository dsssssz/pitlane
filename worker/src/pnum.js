/**
 * v280: номер пилота за Telegram Stars — разовая покупка навсегда (рядом с Pass, не вместо).
 * Номера 1–99, один номер — один пилот. KV: pnum:<n> → pilotId, pnumof:<pid> → n.
 * Продажи — тем же флагом, что Pass (PASS_SALES). Оплата — та же схема, что Pass (pre_checkout + successful_payment),
 * гонка за номер → автоматический возврат Stars (refundStarPayment).
 */
export const PNUM_STARS = 299;
const PAYLOAD_RE = /^pn1:([1-9][0-9]?):([A-Za-z0-9_-]{6,64})$/;
export const parsePnum = (x) => { const m = String(x || '').match(PAYLOAD_RE); return m ? { n: Number(m[1]), pid: m[2] } : null; };
export const isPnumPayload = (x) => !!parsePnum(x);
const okN = (n) => Number.isInteger(n) && n >= 1 && n <= 99;
export async function pnumOf(kv, pid) { if (!pid) return null; try { const v = await kv.get('pnumof:' + pid); const n = Number(v); return okN(n) ? n : null; } catch (_) { return null; } }
async function ownerOf(kv, n) { try { return (await kv.get('pnum:' + n)) || null; } catch (_) { return null; } }

/** GET /me/pnum · GET /pnum/<n> · POST /me/pnum/invoice. */
export async function pnumRoute({ req, env, path, pilot, headers, ip, h, salesOn }) {
  const kv = env.PITLANE;
  let m = path.match(/^\/pnum\/(\d{1,2})$/);
  if (m && req.method === 'GET') {
    const lim = await h.limitOr429(env, headers, [['rl:pnum:ip:' + ip, 300, 3600]]);
    if (lim) return lim;
    const n = Number(m[1]);
    if (!okN(n)) return h.json({ error: '1–99' }, 400, headers);
    const o = await ownerOf(kv, n);
    return h.json({ ok: true, n, free: !o, mine: !!(o && pilot?.authed && o === pilot.id) }, 200, headers);
  }
  if (!path.startsWith('/me/pnum')) return null;
  const denied = h.requireAuth(pilot, headers);
  if (denied) return denied;
  if (req.method === 'GET' && path === '/me/pnum') return h.json({ ok: true, sales: salesOn(env), stars: PNUM_STARS, number: await pnumOf(kv, pilot.id) }, 200, headers);
  if (req.method === 'POST' && path === '/me/pnum/invoice') {
    if (!salesOn(env)) return h.json({ error: 'пока недоступно' }, 403, headers);
    const lim = await h.limitOr429(env, headers, [['rl:pninv:p:' + pilot.id, 10, 3600]]);
    if (lim) return lim;
    const b = await h.readJson(req, 512).catch(() => ({}));
    const n = Number(b?.n);
    if (!okN(n)) return h.json({ error: 'номер 1–99' }, 400, headers);
    const o = await ownerOf(kv, n);
    if (o && o !== pilot.id) return h.json({ error: 'номер занят', code: 'taken' }, 409, headers);
    if (o === pilot.id) return h.json({ error: 'это уже твой номер' }, 409, headers);
    const r = await h.tgCall(env, 'createInvoiceLink', {
      title: 'Номер пилота #' + n,
      description: 'Твой номер #' + n + ' в Pitlane навсегда: у ника в топах, вызовах и на карточке. Разовая оплата.',
      payload: 'pn1:' + n + ':' + pilot.id, currency: 'XTR', prices: [{ label: 'Номер #' + n, amount: PNUM_STARS }],
    });
    if (!r?.ok || typeof r.result !== 'string') return h.json({ error: 'telegram: ' + String(r?.description || 'fail').slice(0, 120) }, 502, headers);
    return h.json({ ok: true, link: r.result, n, stars: PNUM_STARS }, 200, headers);
  }
  return h.json({ error: 'not found' }, 404, headers);
}

export async function pnumPreCheckout(env, q, h, salesOn) {
  const fail = async (msg) => { await h.tgCall(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: false, error_message: msg }); return { ok: false }; };
  if (!salesOn(env)) return fail('Временно недоступно');
  const p = parsePnum(q.invoice_payload);
  if (!p || q.currency !== 'XTR' || Number(q.total_amount) !== PNUM_STARS) return fail('Счёт устарел — открой заново');
  const payer = await env.PITLANE.get(h.providerKey('tg', String(q.from?.id || '')));
  if (!payer || payer !== p.pid) return fail('Оплатить можно только со своего аккаунта');
  const o = await ownerOf(env.PITLANE, p.n);
  if (o && o !== p.pid) return fail('Номер #' + p.n + ' уже занят — выбери другой');
  await h.tgCall(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: true });
  return { ok: true };
}

export async function pnumSuccessfulPayment(env, msg, h, now = Date.now()) {
  const sp = msg?.successful_payment;
  const charge = String(sp?.telegram_payment_charge_id || '').slice(0, 128);
  if (!sp || !charge) return { ok: false };
  const kv = env.PITLANE;
  const ckey = 'paycharge:' + charge;
  if (await kv.get(ckey)) return { ok: true, duplicate: true };
  const p = parsePnum(sp.invoice_payload);
  const rec = { at: now, stars: Number(sp.total_amount) || 0, currency: sp.currency, tg: String(msg.from?.id || ''), kind: 'pnum', n: p?.n ?? null };
  if (!p || sp.currency !== 'XTR' || Number(sp.total_amount) !== PNUM_STARS) { await kv.put(ckey, JSON.stringify({ ...rec, error: 'bad payload' })); return { ok: false }; }
  const o = await ownerOf(kv, p.n);
  if (o && o !== p.pid) { // кто-то успел раньше — вернуть Stars
    const r = await h.tgCall(env, 'refundStarPayment', { user_id: Number(msg.from?.id), telegram_payment_charge_id: charge });
    await kv.put(ckey, JSON.stringify({ ...rec, error: 'taken', refunded: !!r?.ok }));
    return { ok: false, refunded: !!r?.ok };
  }
  const old = await pnumOf(kv, p.pid);
  if (old && old !== p.n) await kv.delete('pnum:' + old);
  await kv.put('pnum:' + p.n, p.pid);
  await kv.put('pnumof:' + p.pid, String(p.n));
  await kv.put(ckey, JSON.stringify(rec));
  return { ok: true, pilotId: p.pid, n: p.n };
}
export async function deleteAccountPnum(kv, pid) { const n = await pnumOf(kv, pid); if (n) { try { await kv.delete('pnum:' + n); } catch (_) {} } try { await kv.delete('pnumof:' + pid); } catch (_) {} }
