// v316: докатывающиеся цифры (ticker.js), огромная цифра чека, шторка PITLANE PASS на пружине, карточки машин.
import fs from 'fs';
let fails = 0; const ok = (c, m, x) => { console.log(c ? '  ✓' : '  ✗', m, c ? '' : (x ?? '')); if (!c) fails++; };
const root = new URL('../../', import.meta.url);
const R = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = R('app.js'); const css = R('styles.css'); const tk = R('ticker.js');
// мини-DOM: элемент с textContent, кадры по 16 мс
globalThis.document = { hidden: false, documentElement: { classList: { contains: () => false } },
  createElement: () => ({ textContent: '', style: {}, setAttribute() {} }), createTextNode: (t) => ({ textContent: t }) };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
const el = (t = '—') => ({ textContent: t, style: {}, replaceChildren(...n) { this.textContent = n.map((x) => x.textContent).join(''); this.kids = n; } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { tick } = await import(new URL('ticker.js', root));
console.log('[ticker]');
{ const e = el(); const seen = []; tick(e, '3.42 с', { dur: 300 }); seen.push(e.textContent); await wait(120); seen.push(e.textContent); await wait(320);
  ok(e.textContent === '3.42 с', 'итог ровно как строка', e.textContent);
  ok(/^\d\.\d\d с$/.test(seen[1]) && seen[1] !== '3.42 с' && seen[0] === '0.00 с', 'докатывается от нуля, формат сохранён', seen.join(' | '));
  e.textContent = '3.42 с'; let changed = false; const e2 = e; tick(e2, '3.42 с'); changed = e2.textContent !== '3.42 с'; ok(!changed, 'то же значение — без анимации'); }
{ const e = el(); tick(e, '11.28 с', { dur: 200 }); ok(e.kids && e.kids.length === 3 && e.kids[1].textContent === '0', 'ширина не прыгает: невидимые ведущие нули до разрядности итога'); await wait(260); ok(e.textContent === '11.28 с', 'итог 11.28'); }
{ const e = el(''); tick(e, '−0.08', { dur: 200, from: 0 }); await wait(260); ok(e.textContent === '−0.08', 'дельта со знаком «−»', e.textContent); }
{ const e = el(''); tick(e, '+1:02.4', { dur: 200 }); await wait(100); const mid = e.textContent; await wait(200); ok(e.textContent === '+1:02.4' && /^\+?\d+(:\d\d)?\.\d$|^\+\d+:\d\d\.\d$|^\+?\d+\.\d$/.test(mid.replace(/^\+/, '+')), 'время круга м:сс.д', mid + ' → ' + e.textContent); }
{ const a = el(); tick(a, '#7', { key: 'k1', dur: 150 }); await wait(200); const b = el('#7'); tick(b, '#7', { key: 'k1', dur: 150 }); ok(b.textContent === '#7', 'перерисовка с тем же значением по key — без счёта'); const c = el(); tick(c, '#5', { key: 'k1', dur: 150 }); await wait(60); ok(/^#[5-7]$/.test(c.textContent), 'смена места — от прошлого значения', c.textContent); await wait(150); ok(c.textContent === '#5', 'итог #5'); }
ok(/prefers-reduced-motion|reduced\(\)/.test(tk) && /tabular-nums/.test(tk), '«уменьшить движение» и tabular-nums');
console.log('[подключение]');
ok(/import \{ tick as tickNum \} from '\.\/ticker\.js'/.test(app), 'ticker подключён в app.js');
ok(/function rd50Set[\s\S]{0,900}tickNum\(b,/.test(app) && /tickRunText\('rdHeroV'/.test(app) && /tickRunText\('runPopV'|tickNum\(pv,/.test(app), 'замер: отрезки, итог и всплывающая отметка докатываются');
ok(/function t72Row[\s\S]{0,1600}tickNum\(tb, t72Fmt/.test(app) && /tickNum\(tv, t72Fmt/.test(app) && /lb92-gap'\); tm\.appendChild\(g\); tickNum/.test(app), 'топы: время, отставание, место, лидер');
ok(/class="rc-hero"/.test(app) && /rcTicks\(rc, card\)/.test(app) && /\.rc-hv \{ font: 500 \d+px/.test(css) && /\.rc-hd\.dn \{ color: #e10600/.test(css), 'чек: огромная главная цифра, хуже — красным');
ok(/RC_I18N = \{ ru: \{/.test(app), 'строки чека — в *_I18N');
console.log('[PITLANE PASS]');
ok(/function passSheetIn[\s\S]{0,900}spring\(\{ k: \d+, zeta: 0\.\d+/.test(app) && /ps316Stagger/.test(app) && /\.ps316-st \{ animation: ps316Up/.test(css), 'пружина снизу + очередь появления');
ok(/function closePassSheet[\s\S]{0,700}sd-drag/.test(app) && /e\.target === e\.currentTarget\) closePassSheet\(\)/.test(app), 'закрытие: свайп вниз (без двойной анимации) и тап по подложке');
const v316 = css.slice(css.indexOf('/* ——— v316'));
ok(!/gradient|backdrop-filter:\s*blur|glow|shimmer/.test(v316.replace(/backdrop-filter: none/g, '')), 'v316: без градиентов, стекла и свечения');
ok(/\.cw291\.tap302:active \{ transform: scale\(\.98\)/.test(v316), 'карточка машины: нажатие 0.98');
console.log(fails ? 'FAIL ' + fails : 'OK'); process.exit(fails ? 1 : 0);
