/**
 * v280: воронка — только дневные счётчики событий, без идентификаторов, IP и устройств.
 * POST /ev {e} → ev:<YYYY-MM-DD МСК> = { open, car, run, share }. Дубли по устройству отсекает клиент (раз в день / раз навсегда).
 */
export const EV_TYPES = ['open', 'car', 'run', 'share'];
export async function funnelRoute({ req, env, path, headers, ip, h }) {
  if (path !== '/ev') return null;
  if (req.method !== 'POST') return h.json({ error: 'method' }, 405, headers);
  const lim = await h.limitOr429(env, headers, [['rl:ev:ip:' + ip, 60, 3600]]);
  if (lim) return lim;
  const b = await h.readJson(req, 256).catch(() => ({}));
  const e = EV_TYPES.includes(b?.e) ? b.e : null;
  if (!e) return h.json({ error: 'bad event' }, 400, headers);
  const key = 'ev:' + h.moscowDateKey();
  const cur = (await h.kvJson(env.PITLANE, key)) || {};
  cur[e] = (Number(cur[e]) || 0) + 1;
  await env.PITLANE.put(key, JSON.stringify(cur), { expirationTtl: 400 * 86400 });
  return h.json({ ok: true }, 200, headers);
}
