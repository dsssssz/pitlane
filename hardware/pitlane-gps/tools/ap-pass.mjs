// v248: пароль точки настройки чипа для наклейки: node tools/ap-pass.mjs AA:BB:CC:DD:EE:FF  (соль — env PL_AP_SALT, как во флаге сборки)
// MAC — базовый (efuse) MAC чипа, его печатает esptool при прошивке («MAC: …»).
import crypto from 'node:crypto';
const salt = process.env.PL_AP_SALT || 'pitlane-dev';
const mac = String(process.argv[2] || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
if (mac.length !== 12) { console.error('Нужен MAC: AA:BB:CC:DD:EE:FF'); process.exit(1); }
const h = crypto.createHash('sha256').update(salt + ':' + mac).digest();
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
console.log([...h.subarray(0, 10)].map((b) => A[b & 31]).join(''));
