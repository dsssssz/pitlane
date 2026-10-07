// v104: access-токен живёт 24 ч. Тесты, которые двигают часы на дни, ведут себя как клиент:
// на 401 session_expired обмениваем refresh-токен и повторяем запрос (как api.js в приложении).
export function withAutoRefresh(worker) {
  const rtOf = new Map();   // access token → refresh token
  const alias = new Map();  // old access token → newest access token
  const cur = (t) => { let x = t; while (alias.has(x)) x = alias.get(x); return x; };
  async function learn(res) {
    try {
      const d = await res.clone().json();
      if (d && d.token && d.refreshToken) rtOf.set(d.token, d.refreshToken);
    } catch (_) {}
  }
  return {
    ...worker,
    async fetch(req, env, ctx) {
      const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)/);
      let body = null;
      if (req.method !== 'GET' && req.method !== 'HEAD') body = await req.clone().arrayBuffer();
      const send = (tok) => {
        const h = new Headers(req.headers);
        if (tok) h.set('Authorization', 'Bearer ' + tok);
        return worker.fetch(new Request(req.url, { method: req.method, headers: h, body }), env, ctx);
      };
      const tok = m ? cur(m[1]) : null;
      let res = await send(tok);
      await learn(res);
      if (tok && res.status === 401) {
        const d = await res.clone().json().catch(() => null);
        const rt = rtOf.get(tok);
        if (d && d.code === 'session_expired' && rt) {
          const rr = await worker.fetch(new Request(new URL('/auth/refresh', req.url), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: req.headers.get('Origin') || '' }, body: JSON.stringify({ refreshToken: rt }) }), env, ctx);
          const nd = await rr.json().catch(() => null);
          if (nd && nd.token) { rtOf.set(nd.token, nd.refreshToken); alias.set(tok, nd.token); res = await send(nd.token); await learn(res); }
        }
      }
      return res;
    },
  };
}
