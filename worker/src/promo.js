/**
 * v226 Shop v2: промокоды — только на сервере (в публичном конфиге их нет).
 * Источник: env.SHOP_PROMOS (JSON {"CODE":{"off":500,"min":5000} | {"pct":10,"max":1000}, …}), иначе DEFAULT_PROMOS.
 * Выключить код — убрать из JSON (или "off":0). Срок — "until":"2026-12-31".
 */
export const DEFAULT_PROMOS = { DRAG10: { off: 500, min: 5000 } };
const CODE_RE = /^[A-Z0-9_-]{3,20}$/;
export const normCode = (c) => String(c || '').trim().toUpperCase();
function table(env) {
  try { const t = env && env.SHOP_PROMOS ? JSON.parse(env.SHOP_PROMOS) : null; if (t && typeof t === 'object') return t; } catch (_) {}
  return DEFAULT_PROMOS;
}
/** → { ok, code, off, label } | { ok:false, error } (subtotal null → нельзя). */
export function resolvePromo(env, code, subtotal, now = Date.now()) {
  const c = normCode(code);
  if (!CODE_RE.test(c)) return { ok: false, error: 'bad code' };
  const p = table(env)[c];
  if (!p) return { ok: false, error: 'unknown' };
  if (p.until && now > Date.parse(p.until + 'T23:59:59+03:00')) return { ok: false, error: 'expired' };
  if (!Number.isFinite(subtotal) || subtotal <= 0) return { ok: false, error: 'no price' };
  if (p.min && subtotal < p.min) return { ok: false, error: 'min', min: p.min };
  let off = Number(p.off) > 0 ? Number(p.off) : Number(p.pct) > 0 ? Math.round(subtotal * Number(p.pct) / 100) : 0;
  if (p.max) off = Math.min(off, Number(p.max));
  off = Math.max(0, Math.min(Math.round(off), subtotal));
  if (!off) return { ok: false, error: 'unknown' };
  return { ok: true, code: c, off, label: Number(p.pct) > 0 ? '−' + p.pct + '%' : null };
}
