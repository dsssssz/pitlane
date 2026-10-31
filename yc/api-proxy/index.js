// PITLANE: российский прокси /api/* → Cloudflare Worker pitlane-api.
// Вызывается из Yandex API Gateway (cloud_functions). Из РФ часть IP Cloudflare
// (104.21.x / 172.67.x — те, что отдаёт DNS для *.workers.dev) режется ТСПУ, поэтому
// коннектимся к «живым» anycast-IP Cloudflare с SNI/Host воркера и перебираем их.
const https = require('https');
const HOST = process.env.UPSTREAM_HOST || 'pitlane-api.pitlane-taksimaga.workers.dev';
const IPS = (process.env.UPSTREAM_IPS || '104.16.0.1,162.159.140.1,104.17.0.1,172.66.44.154,172.66.47.102').split(',');
const DROP_REQ = new Set(['host', 'content-length', 'connection', 'accept-encoding', 'x-forwarded-for', 'x-real-remote-address', 'x-request-id', 'x-trace-id', 'x-envoy-external-address', 'uber-trace-id', 'traceparent', 'x-serverless-certificate', 'x-forwarded-proto', 'x-forwarded-host']);
const DROP_RES = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'set-cookie', 'alt-svc', 'nel', 'report-to']);
const TEXT = /^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded|manifest\+json)|image\/svg)/i;
let good = 0; // индекс последнего удачного IP (живёт пока жив инстанс)

function once(ip, opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host: ip, servername: HOST, port: 443, ...opts, headers: { ...opts.headers, Host: HOST } }, (res) => {
      const chunks = []; res.on('data', (d) => chunks.push(d)); res.on('end', () => resolve({ res, buf: Buffer.concat(chunks) })); res.on('error', reject);
    });
    req.setTimeout(4000, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', pre: true })));
    req.on('socket', (s) => s.once('secureConnect', () => { req.setTimeout(25000); req._connected = true; }));
    req.on('error', (e) => { e.connected = !!req._connected; reject(e); });
    if (body) req.write(body);
    req.end();
  });
}

module.exports.handler = async (event) => {
  let path = event.url ? String(event.url).split('?')[0] : (event.path || '/');
  path = path.replace(/^\/api(?=\/|$)/, '') || '/';
  const qs = new URLSearchParams();
  const mq = event.multiValueQueryStringParameters || {};
  for (const [k, vs] of Object.entries(mq)) for (const v of [].concat(vs)) qs.append(k, v);
  if (!Object.keys(mq).length) for (const [k, v] of Object.entries(event.queryStringParameters || {})) qs.append(k, v);
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) if (!DROP_REQ.has(k.toLowerCase())) headers[k] = v;
  const ip = event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp;
  if (ip) headers['X-Forwarded-For'] = ip;
  const method = event.httpMethod || 'GET';
  let body = null;
  if (event.body && method !== 'GET' && method !== 'HEAD') body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
  if (body) headers['Content-Length'] = String(body.length);
  const opts = { method, path: path + (qs.toString() ? '?' + qs : ''), headers };
  let r, lastErr;
  for (let i = 0; i < IPS.length; i++) {
    const idx = (good + i) % IPS.length;
    try { r = await once(IPS[idx], opts, body); good = idx; break; }
    catch (e) { lastErr = e; if (e.connected && method !== 'GET') break; }
  }
  if (!r) return { statusCode: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: false, error: 'upstream', detail: String(lastErr && (lastErr.code || lastErr.message)) }) };
  const outH = {}, multi = {};
  for (const [k, v] of Object.entries(r.res.headers)) if (!DROP_RES.has(k)) outH[k] = Array.isArray(v) ? v.join(', ') : v;
  if (r.res.headers['set-cookie']) multi['Set-Cookie'] = r.res.headers['set-cookie'];
  const isText = TEXT.test(r.res.headers['content-type'] || '');
  return { statusCode: r.res.statusCode, headers: outH, multiValueHeaders: multi, body: isText ? r.buf.toString('utf8') : r.buf.toString('base64'), isBase64Encoded: !isText };
};
