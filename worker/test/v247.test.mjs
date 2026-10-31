// v247: топ и рекорды — только чип; телефон отклоняется кодом phone_source
import { verifyDrag, PHONE_TOPS } from '../src/verify.js';
import { encodeTrace } from '../../gps-core.js';
let bad = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) bad++; };
ok(PHONE_TOPS === false, 'PHONE_TOPS выключен');
const now = Date.now(); const pts = [];
for (let i = 0; i < 20; i++) { const v = Math.min(120, i * 12); pts.push({ t: now - 20000 + i * 1000, lat: 45 + i * 0.0002, lon: 39, v, acc: 4 }); }
const r = verifyDrag({ trace: encodeTrace(pts, 'phone') }, '0-100', { lo: 2, hi: 30 }, now);
ok(!r.ok && r.code === 'phone_source', 'телефон → phone_source ' + JSON.stringify(r));
if (bad) { console.log(bad + ' FAIL'); process.exit(1); }
