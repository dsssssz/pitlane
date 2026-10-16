/**
 * v141: «Предложить / откалибровать трассу». Пользователь отмечает по GPS С/Ф и точки секторов,
 * заявка уходит на модерацию: KV tracksug:<id> (TTL 180 д) + сообщение в бот владельцу (SHOP_CHAT_ID / FEEDBACK_CHAT_ID).
 * POST /tracks/suggest (только вошедшие) {name, city, sf:{lat,lon,acc}, sectors:[{lat,lon,acc}] (0..6), note?, cid}
 */
const CID_RE = /^[a-z0-9]{8,32}$/;
export const TRACKSUG_RL = { pilotDay: 3, ipDay: 6, globalDay: 100 };
const okPt = (p) => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lon) <= 180 && !(+p.lat === 0 && +p.lon === 0);
const pt = (p) => ({ lat: Math.round(+p.lat * 1e6) / 1e6, lon: Math.round(+p.lon * 1e6) / 1e6, acc: Number.isFinite(+p.acc) ? Math.min(999, Math.round(+p.acc)) : null });
function distM(a, b) { const R = 6371000, r = Math.PI / 180; const dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }

export function sanitizeSuggest(body, h) {
  const name = h.cleanLabel(body?.name, 60); if (name.length < 3 || h.containsPhone(name)) return { error: 'name', field: 'name' };
  const city = h.cleanLabel(body?.city, 60); if (city.length < 2 || h.containsPhone(city)) return { error: 'city', field: 'city' };
  if (!okPt(body?.sf)) return { error: 'start/finish point', field: 'sf' };
  const sf = pt(body.sf);
  const raw = Array.isArray(body?.sectors) ? body.sectors : [];
  if (raw.length > 6) return { error: 'max 6 sector points', field: 'sectors' };
  const sectors = [];
  for (const s of raw) { if (!okPt(s)) return { error: 'sector point', field: 'sectors' }; const p = pt(s); if (distM(sf, p) > 15000) return { error: 'sector too far from S/F', field: 'sectors' }; sectors.push(p); }
  const note = h.cleanLabel(String(body?.note || '').replace(/\s+/g, ' '), 300);
  const cid = String(body?.cid || ''); if (!CID_RE.test(cid)) return { error: 'cid', field: 'cid' };
  return { rec: { name, city, sf, sectors, note, cid } };
}

export function msgSuggest(s, who, h) {
  const map = (p) => `<a href="https://yandex.ru/maps/?pt=${p.lon},${p.lat}&z=17">${p.lat}, ${p.lon}</a>${p.acc != null ? ' ±' + p.acc + ' м' : ''}`;
  return ['🏁 <b>Новая трасса на модерацию</b>', `<b>${h.tgEsc(s.name)}</b> · ${h.tgEsc(s.city)}`, 'С/Ф: ' + map(s.sf),
    ...s.sectors.map((p, i) => `Сектор ${i + 1}: ` + map(p)), s.note ? 'Комментарий: ' + h.tgEsc(s.note) : '',
    `От: ${h.tgEsc(who.nick || '—')}${who.username ? ' (@' + h.tgEsc(who.username) + ')' : ''}`, `ID: <code>${s.id}</code>`].filter(Boolean).join('\n');
}

export async function trackSuggestRoute({ req, env, path, headers, ip, pilot, h }) {
  if (path !== '/tracks/suggest') return null;
  if (req.method !== 'POST') return h.json({ error: 'method' }, 405, headers);
  const denied = h.requireAuth(pilot, headers); if (denied) return denied;
  const body = await h.readJson(req, 8 * 1024); if (!body) return h.json({ error: 'invalid json' }, 400, headers);
  const s = sanitizeSuggest(body, h); if (s.error) return h.json({ ok: false, ...s }, 400, headers);
  const dupKey = 'tracksugcid:' + pilot.id + ':' + s.rec.cid;
  const dup = await env.PITLANE.get(dupKey); if (dup) return h.json({ ok: true, duplicate: true, id: dup }, 200, headers);
  const lim = await h.limitOr429(env, headers, [['rl:tsug:p:' + pilot.id, TRACKSUG_RL.pilotDay, 86400], ['rl:tsug:ip:' + ip, TRACKSUG_RL.ipDay, 86400], ['rl:tsug:day:' + h.moscowDateKey(), TRACKSUG_RL.globalDay, 86400]]); if (lim) return lim;
  const rec = { id: 't' + h.randB36(12), at: Date.now(), pid: pilot.id, status: 'moderation', ...s.rec };
  const ttl = 180 * 86400;
  await env.PITLANE.put('tracksug:' + rec.id, JSON.stringify(rec), { expirationTtl: ttl, metadata: { pid: pilot.id } });
  await env.PITLANE.put(dupKey, rec.id, { expirationTtl: ttl });
  let forwarded = false; const owner = env.SHOP_CHAT_ID || env.FEEDBACK_CHAT_ID;
  if (owner) { try { const r = await h.tgCall(env, 'sendMessage', { chat_id: owner, text: msgSuggest(rec, { nick: h.safeName(pilot.name, ''), username: await h.tgUsernameOf(env, pilot.id) }, h), parse_mode: 'HTML', link_preview_options: { is_disabled: true } }); forwarded = !!r?.ok; } catch (_) {} }
  return h.json({ ok: true, id: rec.id, status: rec.status, forwarded }, 200, headers);
}

export async function deleteAccountTrackSug(kv, pid, h) {
  for (const k of await h.kvListAll(kv, 'tracksug:')) if (k.metadata && k.metadata.pid === pid) await kv.delete(k.name);
}
