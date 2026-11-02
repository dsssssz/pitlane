/**
 * v282: печать PITLANE на карточке. Код проверки → снимок серверно зачтённой строки доски (разгон).
 * POST /stamp {disc,t} (auth): ищет строку пилота с этим временем на доске A/B или C. Нет — 409 no_run.
 * GET /stamp/<code> — публично, только чтение. KV: stamp:<code>, stampof:<pid>:<disc>:<t> (идемпотентно).
 */
import { CHAL_DISCS } from './chal.js';
const ABC = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const STAMP_RE = /^[2-9A-HJ-NP-Z]{8}$/;
const TTL = 3 * 365 * 86400;
function newCode() { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map((x) => ABC[x % ABC.length]).join(''); }
const pub = (s) => ({ code: s.code, disc: s.disc, t: s.t, cls: s.cls, src: s.src, car: s.car, at: s.at, nick: s.nick, pn: s.pn ?? null, verified: true });
export async function stampRoute({ req, env, path, pilot, headers, ip, h }) {
  if (path !== '/stamp' && !path.startsWith('/stamp/')) return null;
  if (req.method === 'GET') {
    const code = path.slice(7).toUpperCase();
    if (!STAMP_RE.test(code)) return h.json({ error: 'bad code' }, 400, headers);
    const lim = await h.limitOr429(env, headers, [['rl:stampg:ip:' + ip, 240, 3600]]);
    if (lim) return lim;
    const s = await h.kvJson(env.PITLANE, 'stamp:' + code);
    if (!s) return h.json({ error: 'not found' }, 404, headers);
    return h.json({ ok: true, stamp: pub(s) }, 200, headers);
  }
  if (req.method !== 'POST' || path !== '/stamp') return h.json({ error: 'method' }, 405, headers);
  const denied = h.requireAuth(pilot, headers);
  if (denied) return denied;
  const lim = await h.limitOr429(env, headers, [['rl:stamp:p:' + pilot.id, 60, 86400]]);
  if (lim) return lim;
  const body = await h.readJson(req, 1024).catch(() => ({}));
  const disc = CHAL_DISCS.includes(body?.disc) ? body.disc : null;
  const t = Number(body?.t);
  if (!disc || !(t > 0 && t < 600)) return h.json({ error: 'bad input' }, 400, headers);
  let row = null, cls = '';
  for (const c of ['ab', 'c']) {
    for (const r of await h.readListRaw(env.PITLANE, h.boardKey('drag', disc, c))) {
      if (r && r.pilotId === pilot.id && r.valid !== false && Math.abs(Number(r.t) - t) < 0.006) { row = r; cls = c; break; }
    }
    if (row) break;
  }
  if (!row) return h.json({ error: 'замер не найден в зачёте', code: 'no_run' }, 409, headers);
  const t2 = Math.round(Number(row.t) * 100) / 100;
  const ofKey = `stampof:${pilot.id}:${disc}:${t2}`;
  const had = await env.PITLANE.get(ofKey);
  if (had) { const s = await h.kvJson(env.PITLANE, 'stamp:' + had); if (s) return h.json({ ok: true, stamp: pub(s) }, 200, headers); }
  const rec = await h.loadPilot(env.PITLANE, pilot.id);
  const pn = h.pnumOf ? await h.pnumOf(env.PITLANE, pilot.id) : null;
  let code = newCode();
  for (let i = 0; i < 3 && await env.PITLANE.get('stamp:' + code); i++) code = newCode();
  const s = { code, pilotId: pilot.id, disc, t: t2, cls: cls === 'ab' ? 'A/B' : 'C', src: row.src === 'ext' ? 'chip' : 'phone', car: typeof row.car === 'string' ? row.car.slice(0, 60) : '', at: Number(row.at) || Date.now(), nick: h.safeName(rec?.nick, '') || 'Пилот', pn: pn ?? null };
  await env.PITLANE.put('stamp:' + code, JSON.stringify(s), { expirationTtl: TTL });
  await env.PITLANE.put(ofKey, code, { expirationTtl: TTL });
  return h.json({ ok: true, stamp: pub(s) }, 200, headers);
}
