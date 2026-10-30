// v233: картинка для Telegram Stories — node test/v233.test.mjs
import rawWorker from '../src/index.js';
import { MemKV } from './kvmock.mjs';
let fails = 0;
const ok = (c, m, x) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const env = { PITLANE: new MemKV() };
async function call(method, path, body) {
  const r = await rawWorker.fetch(new Request('https://api.test' + path, { method, headers: { Origin: 'https://dsssssz.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.233.0.1' }, body: body ? JSON.stringify(body) : undefined }), env);
  const ct = r.headers.get('content-type') || ''; return { status: r.status, ct, data: ct.includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
}
const sh = await call('POST', '/share', { payload: { car: 'BMW M3', nick: 'Мага', type: '0-100', time: '4.50' } });
ok(sh.status === 200 && sh.data.id, 'share создан', sh.data);
const jpg = new Uint8Array(600); jpg[0] = 0xff; jpg[1] = 0xd8; jpg[2] = 0xff;
const img = 'data:image/jpeg;base64,' + Buffer.from(jpg).toString('base64');
let r = await call('POST', '/share/' + sh.data.id + '/story', { img });
ok(r.status === 200 && /\/share\/.+\/story\.jpg$/.test(r.data.url), 'загрузка → публичный URL', r.data);
r = await call('GET', '/share/' + sh.data.id + '/story.jpg');
ok(r.status === 200 && r.ct === 'image/jpeg' && r.data[0] === 0xff && r.data.length === 600, 'GET отдаёт jpeg', r.status);
r = await call('POST', '/share/nosuchid99/story', { img });
ok(r.status === 404, 'нет share → 404');
r = await call('POST', '/share/' + sh.data.id + '/story', { img: 'data:image/jpeg;base64,' + Buffer.from('hello world'.repeat(30)).toString('base64') });
ok(r.status === 400, 'не jpeg → 400');
console.log(fails ? `FAIL ${fails}` : 'OK'); process.exit(fails ? 1 : 0);
