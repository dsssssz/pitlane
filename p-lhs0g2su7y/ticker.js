import { reduced } from './motion.js';
const scale = () => (typeof window !== 'undefined' && window.__motionScale) || 1; // только для съёмки кадров
// v316: «докатывающиеся» цифры — один помощник для замера, дельт и топов.
// Число в строке («#2», «4.21 с», «−0.08», «1:23.45») докатывается до итога за ~650 мс (ease-out), формат и подписи — как есть.
// Анимация только когда значение появилось или поменялось: прошлый итог помним по key (переживает перерисовку DOM) или на самом элементе.
// Ширина не прыгает: tabular-nums + невидимые ведущие нули до разрядности итога. «Уменьшить движение» / скрытая вкладка — сразу итог.
const TK_MEM = new Map();
const TK_RE = /^([^\d+\-\u2212]*?)([+\-\u2212]?)(?:(\d+):)?(\d+(?:[.,]\d+)?)(.*)$/s;
function tkParse(text) {
  const m = String(text).match(TK_RE); if (!m) return null;
  const [, pre, sign, mins, num, post] = m; if (/\d/.test(pre)) return null;
  const sep = num.includes(',') ? ',' : '.'; const dec = (num.split(/[.,]/)[1] || '').length;
  let v = parseFloat(num.replace(',', '.')); if (!Number.isFinite(v)) return null;
  if (mins != null) v += Number(mins) * 60;
  return { pre, sign, lap: mins != null, sep, dec, post, v: sign === '-' || sign === '\u2212' ? -v : v, intLen: (mins != null ? mins : num.split(/[.,]/)[0]).length };
}
function tkFormat(P, v) {
  const a = Math.abs(v); let body;
  if (P.lap) { const mm = Math.floor(a / 60); const ss = a - mm * 60; body = mm + ':' + ss.toFixed(P.dec).replace('.', P.sep).padStart(P.dec ? 3 + P.dec : 2, '0'); }
  else body = a.toFixed(P.dec).replace('.', P.sep);
  const neg = v < 0 && a.toFixed(P.dec) !== (0).toFixed(P.dec);
  const sign = neg ? (P.sign === '-' ? '-' : '\u2212') : (P.sign === '+' ? '+' : '');
  return { sign, body };
}
const tkDefaultRender = (el, pre, pad, sign, body, post) => {
  if (!pad) { el.textContent = pre + sign + body + post; return; }
  const z = document.createElement('span'); z.className = 'tk-pad'; z.setAttribute('aria-hidden', 'true'); z.textContent = pad; z.style.visibility = 'hidden';
  el.replaceChildren(document.createTextNode(pre + sign), z, document.createTextNode(body + post));
};
/**
 * tick(el, text, { key, dur, from, render }) — показать text, докатив число.
 * key — где помнить прошлый итог (строки топа пересоздаются при каждой отрисовке); без key — на элементе.
 * from — явное начальное значение (иначе прошлый итог или 0). render(el, pre, pad, sign, body, post) — своя разметка (например, «.42» серым).
 */
export function tick(el, text, { key = '', dur = 650, from = null, render = null } = {}) {
  if (!el) return;
  text = String(text);
  const draw = render || tkDefaultRender;
  const done = () => { el.__tk = (el.__tk || 0) + 1; if (render) { const P = tkParse(text); if (P) { const f = tkFormat(P, P.v); draw(el, P.pre, '', f.sign, f.body, P.post); return; } } el.textContent = text; };
  let prev = key ? TK_MEM.get(key) : el.__tkText;
  if (!key && !tkParse(el.textContent || '')) prev = null; // на месте «—» / пусто — появление, считаем от нуля
  if (key) TK_MEM.set(key, text); el.__tkText = text;
  if (!el.style.fontVariantNumeric) el.style.fontVariantNumeric = 'tabular-nums';
  const P = tkParse(text);
  if (!P || prev === text || reduced() || (typeof document !== 'undefined' && document.hidden)) { done(); return; }
  const Q = prev != null ? tkParse(prev) : null;
  let v0 = from != null && Number.isFinite(Number(from)) ? Number(from) : (Q && Q.lap === P.lap && Q.post.trim() === P.post.trim() ? Q.v : 0);
  if (Math.abs(v0 - P.v) < Math.pow(10, -P.dec) / 2) { done(); return; }
  const t0 = performance.now(); const tok = (el.__tk = (el.__tk || 0) + 1); const d = dur / scale();
  const intLen = Math.max(P.intLen, Q && Q.lap === P.lap ? Q.intLen : 0);
  const frame = (t) => {
    if (el.__tk !== tok) return;
    const p = Math.min(1, (t - t0) / d);
    if (p >= 1) { done(); return; }
    const e = 1 - Math.pow(1 - p, 3); const f = tkFormat(P, v0 + (P.v - v0) * e);
    const il = P.lap ? 0 : f.body.split(P.sep)[0].length; const pad = !P.lap && il < intLen ? '0'.repeat(intLen - il) : '';
    draw(el, P.pre, pad, f.sign, f.body, P.post);
    requestAnimationFrame(frame);
  };
  frame(t0);
}
