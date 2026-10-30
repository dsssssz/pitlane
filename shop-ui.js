/* v137: магазин PITLANE — шторка: витрина → карточка товара → заявка → «Заявка принята», плюс «Мои заявки».
 * Всё строится через DOM + textContent (без вставки HTML-строк). Оплаты онлайн нет (SHOP_CONFIG.payments=false). */
import { flyShared } from './motion.js'; // v160: фото карточки перелетает в галерею товара
import { SHOP_SUBS, SHOP_CONFIG, ORDER_STATUS, ORDER_SHORT, visibleProducts, productById, statusOf, orderable, priceLine, fmtRub, orderTotal, FOUNDERS, gated, founderTotal, SHOP_CATS, SHOP_DELIVERY, deliveryById, SHOP_PAY_METHODS, PAY_BADGES, cartTotals, MAX_CART_LINES, trackUrl } from './shop-config.js';

let D = null; // deps from app.js: { api, currentUser, needLogin, hap, close }
const st = { stack: [], orders: null, tg: undefined, busy: false, draft: {}, founders: null, cat: 'all', payOn: false };
/* v226: корзина — localStorage, только id и количество; суммы считает сервер, здесь — превью тем же cartTotals. */
const CART_K = 'pl_cart_v1';
const cart = { get() { try { const c = JSON.parse(localStorage.getItem(CART_K) || '[]'); return Array.isArray(c) ? c.filter((x) => orderable(productById(x.id))).slice(0, MAX_CART_LINES) : []; } catch (_) { return []; } },
  set(c) { try { localStorage.setItem(CART_K, JSON.stringify(c)); } catch (_) {} },
  add(id) { const c = cart.get(); const p = productById(id); const x = c.find((y) => y.id === id); if (x) x.qty = Math.min(p.maxQty || 5, x.qty + 1); else if (c.length < MAX_CART_LINES) c.push({ id, qty: 1 }); cart.set(c); return c; },
  count() { return cart.get().reduce((a, x) => a + x.qty, 0); } };
function cartBtn() {
  const n = cart.count(); const b = el('button', 'shop-cartbtn'); b.type = 'button'; b.setAttribute('aria-label', 'Корзина' + (n ? ', ' + n : ''));
  b.appendChild(svg('M3 4h2l2.4 11h10.2L20 7H6.3M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z'));
  if (n) b.appendChild(el('i', 'shop-cartbtn-n', String(n)));
  b.addEventListener('click', () => { D.hap?.(6); push({ k: 'cart' }); }); return b;
}
function payBadges() { const w = el('div', 'shop-badges'); PAY_BADGES.forEach((t) => w.appendChild(el('span', 'shop-paybadge', t))); return w; }
/* v222: «Основатели» — счётчик только с сервера (GET /shop/founders); нет ответа → счётчик не показываем. */
const isChip = (p) => p && p.id === FOUNDERS.productId;
const founderLive = (p) => isChip(p) && SHOP_CONFIG.foundersOpen && st.founders && st.founders.left > 0;
async function loadFounders() {
  if (!SHOP_CONFIG.foundersOpen) return;
  const r = await D.api.shopFounders?.().catch(() => null);
  if (r && r.ok && Number.isFinite(r.left)) { st.founders = r; render(); }
}
function priceBlock(p, big) {
  const w = el('span', 'shop-pb' + (big ? ' shop-pb-big' : ''));
  const reg = Number.isFinite(p.price) && p.price > 0 ? fmtRub(p.price) : 'Цена по запросу';
  const row = el('span', 'shop-pb-row');
  if (founderLive(p)) { row.append(el('b', big ? 'shop-buy-price' : 'shop-price', fmtRub(FOUNDERS.price)), el('s', 'shop-pb-old', reg)); }
  else row.append(el('b', big ? 'shop-buy-price' : 'shop-price', p.status === 'soon' ? (big ? 'Скоро в продаже' : 'Скоро') : reg));
  w.appendChild(row);
  if (founderLive(p)) {
    w.appendChild(el('span', 'shop-pb-offer', '−' + fmtRub(p.price - FOUNDERS.price) + ' первым ' + FOUNDERS.limit));
    w.appendChild(el('span', 'shop-pb-left', 'осталось ' + st.founders.left + ' из ' + FOUNDERS.limit));
  } else if (gated(p)) w.appendChild(el('span', 'shop-pb-soon', 'Скоро · после проверки точности'));
  if (isChip(p)) w.appendChild(el('span', 'shop-pb-note', 'вдвое дешевле Dragy'));
  return w;
}
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const body = () => document.getElementById('shopBody');
const rid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); };

function soonPh(cls) {
  const d = el('div', 'shop-ph ' + cls); d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'Скоро');
  d.appendChild(el('span', 'shop-ph-k', 'PITLANE')); d.appendChild(el('b', 'shop-ph-t', 'Скоро')); return d;
}
/* v198: «Что внутри» — разбор с цифрами-выносками и легендой, разрез, короткие строки */
function insideBlock(x) {
  const s = el('section', 'shop-sec shop-in'); s.appendChild(el('h3', 'shop-h3', 'Что внутри'));
  s.appendChild(el('p', 'shop-in-lead', 'Внутри нет ничего лишнего: GPS-модуль с антенной, процессор и светодиод.'));
  const fig = el('figure', 'shop-in-fig'); fig.appendChild(picture(x.img, 'shop-in-img', false));
  for (const [l, t, n] of x.pins) { const b = el('span', 'shop-in-pin', String(n)); b.style.left = l + '%'; b.style.top = t + '%'; b.setAttribute('aria-hidden', 'true'); fig.appendChild(b); }
  s.appendChild(fig);
  const ol = el('ol', 'shop-in-parts'); x.parts.forEach(([k, v], i) => { const li = el('li'); li.appendChild(el('i', '', String(i + 1))); const t = el('div'); t.appendChild(el('b', '', k)); t.appendChild(el('span', '', v)); li.appendChild(t); ol.appendChild(li); }); s.appendChild(ol);
  if (x.section) { const f2 = el('figure', 'shop-in-fig shop-in-sec'); f2.appendChild(picture(x.section, 'shop-in-img', false)); f2.appendChild(el('figcaption', '', 'Разрез: антенна сразу под крышкой и смотрит в небо')); s.appendChild(f2); }
  if (x.rows?.length) { const g = el('div', 'shop-in-rows'); for (const [k, v] of x.rows) { const c = el('div'); c.appendChild(el('span', '', k)); c.appendChild(el('b', '', v)); g.appendChild(c); } s.appendChild(g); }
  return s;
}
function picture(g, cls, eager) {
  const p = el('picture', cls);
  const s = document.createElement('source'); s.type = 'image/avif'; s.srcset = g.avif; s.sizes = '(max-width: 560px) 100vw, 520px'; p.appendChild(s);
  const i = document.createElement('img'); i.srcset = g.webp; i.src = g.src; i.sizes = '(max-width: 560px) 100vw, 520px'; i.alt = g.alt || '';
  i.width = 1200; i.height = 800; i.decoding = 'async'; i.loading = eager ? 'eager' : 'lazy'; p.appendChild(i);
  return p;
}
function head(title, sub, back) {
  const h = el('div', 'shop-head');
  // v158: страница — «назад» есть всегда: в витрине уводит из магазина, глубже — на шаг назад
  if (back || D.page) { const b = el('button', 'shop-back'); b.type = 'button'; b.setAttribute('aria-label', back ? 'Назад' : 'Закрыть магазин'); b.appendChild(svg('M15 5l-7 7 7 7')); b.addEventListener('click', () => { D.hap?.(6); if (back) pop(); else D.close?.(); }); h.appendChild(b); }
  const t = el('div', 'shop-head-t'); t.appendChild(el('h2', 'shop-title', title)); if (sub) t.appendChild(el('p', 'shop-sub', sub)); h.appendChild(t);
  if (!/^(cart|form)$/.test(st.stack[st.stack.length - 1]?.k || '')) h.appendChild(cartBtn());
  return h;
}
function svg(d) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); return s; }
function render() { const b = body(); if (!b) return; const v = st.stack[st.stack.length - 1] || { k: 'list' }; b.replaceChildren(VIEWS[v.k](v)); b.dataset.view = v.k; const sc = b.closest('.shop-sheet-inner'); if (sc) sc.scrollTop = 0; else if (D?.page) window.scrollTo(0, 0); }
function push(v) { st.stack.push(v); render(); }
function pop() { if (st.stack.length > 1) st.stack.pop(); render(); }

/* ——— витрина ——— */
function viewList() {
  const f = document.createDocumentFragment();
  f.appendChild(head('Магазин', 'Железо PITLANE для трека'));
  // v158: сетка карточек — фото, цена, «Предзаказ»; первый товар — широкий
  const tabs = el('div', 'shop-tabs'); tabs.setAttribute('role', 'tablist');
  for (const [k, lab] of SHOP_CATS) { const b = el('button', 'shop-tab' + (st.cat === k ? ' on' : ''), lab); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(st.cat === k)); b.addEventListener('click', () => { st.cat = k; D.hap?.(4); render(); }); tabs.appendChild(b); }
  f.appendChild(tabs);
  const grid = el('div', 'shop-grid');
  visibleProducts().filter((p) => st.cat === 'all' || p.cat === st.cat).forEach((p, i) => {
    const c = el('article', 'shop-card' + (i === 0 ? ' shop-card-hero' : '')); c.dataset.product = p.id;
    const open = el('button', 'shop-card-open'); open.type = 'button'; open.setAttribute('aria-label', p.title + ' — подробнее');
    if (p.gallery?.[0]) open.appendChild(picture(p.gallery[0], 'shop-card-img', i < 3)); else open.appendChild(soonPh('shop-card-img'));
    const t = el('span', 'shop-card-txt');
    t.appendChild(el('b', 'shop-card-title', p.title)); t.appendChild(el('span', 'shop-card-sub', p.subtitle || ''));
    t.appendChild(priceBlock(p, false));
    open.appendChild(t);
    open.addEventListener('click', () => { D.hap?.(6); const img = open.querySelector('img'); const from = img ? { el: img.cloneNode(true), rect: img.getBoundingClientRect() } : null; push({ k: 'product', id: p.id }); if (from && D.page) requestAnimationFrame(() => { try { flyShared(from, document.querySelector('#shopBody .shop-gal-slide img'), { dur: 420 }); } catch (_) {} }); });
    c.appendChild(open);
    const pre = el('button', 'shop-pre', orderable(p) ? 'В корзину' : statusOf(p).label); pre.type = 'button'; pre.disabled = !orderable(p);
    pre.addEventListener('click', () => { D.hap?.(8); cart.add(p.id); render(); });
    if (!gated(p)) c.appendChild(pre);
    grid.appendChild(c);
  });
  f.appendChild(grid);
  if (SHOP_SUBS.length) {
    const sec = el('section', 'shop-subs'); const sh = el('div', 'shop-subs-h'); sh.append(el('h3', 'shop-h3', 'Подписки'), el('span', 'shop-badge', 'Скоро')); sec.appendChild(sh);
    for (const s of SHOP_SUBS) { const c = el('div', 'shop-plan'); const t = el('div', 'shop-plan-t'); t.appendChild(el('b', '', s.title)); t.appendChild(el('span', 'shop-badge', 'Скоро')); c.appendChild(t); c.appendChild(el('p', 'shop-muted', s.subtitle)); sec.appendChild(c); }
    f.appendChild(sec);
  }
  f.appendChild(ordersBlock());
  { const pay = el('section', 'shop-payinfo'); pay.append(el('p', 'shop-muted', 'Доставка: СДЭК 390 ₽ · Почта 290 ₽ · самовывоз в Краснодаре'), payBadges()); f.appendChild(pay); }
  f.appendChild(el('p', 'shop-foot', st.payOn ? 'Оплата СБП или картой — чек НПД придёт автоматически.' : 'Онлайн-оплата скоро. Сейчас оформляете заявку — мы пишем вам в Telegram и согласуем оплату и доставку.'));
  { const d = el('a', 'shop-docs-link', 'Продавец, доставка, возврат и оферта →'); d.href = './docs.html'; f.appendChild(d); }
  return f;
}
function ordersBlock() {
  const w = el('section', 'shop-orders'); w.id = 'shopOrders';
  w.appendChild(el('h3', 'shop-h3', 'Мои заявки'));
  if (!D.currentUser()) { w.appendChild(el('p', 'shop-muted', 'Войдите, чтобы видеть заявки.')); return w; }
  if (st.orders == null) { w.appendChild(el('p', 'shop-muted', 'Загружаем…')); void loadOrders(); return w; }
  if (!st.orders.length) { w.appendChild(el('p', 'shop-muted', 'Заявок пока нет.')); return w; }
  for (const o of st.orders) w.appendChild(orderRow(o));
  return w;
}
function orderRow(o) {
  const r = el('button', 'shop-order'); r.type = 'button'; r.addEventListener('click', () => { D.hap?.(6); push({ k: 'order', id: o.id }); });
  const l = el('div', 'shop-order-l');
  l.appendChild(el('b', '', o.title + ' × ' + o.qty));
  l.appendChild(el('span', 'shop-muted', (o.no ? '№' + o.no : '№ ' + o.id) + ' · ' + new Date(o.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (o.total != null ? ' · ' + fmtRub(o.total) : '')));
  r.appendChild(l);
  r.appendChild(el('span', 'shop-st shop-st-' + (o.status || 'new'), ORDER_STATUS[o.status] ? shortStatus(o.status) : shortStatus('new')));
  return r;
}
const shortStatus = (s) => ORDER_SHORT[s] || ORDER_SHORT.new; // v182: статусы как в боте
async function loadOrders() {
  const r = await D.api.shopOrders();
  st.orders = r && r.ok && Array.isArray(r.orders) ? r.orders : [];
  if (r && r.ok) st.payOn = !!r.payments;
  if (r && r.ok) { st.tg = r.tg || null; try { localStorage.setItem('pl_founder', r.founder ? '1' : '0'); } catch (_) {} if (r.founders && Number.isFinite(r.founders.left)) st.founders = r.founders; } // сервер знает, есть ли Telegram во входе
  const old = document.getElementById('shopOrders'); if (old) old.replaceWith(ordersBlock());
}

/* ——— карточка товара ——— */
function viewProduct(v) {
  const p = productById(v.id); const f = document.createDocumentFragment();
  if (!p) { f.appendChild(head('Товар не найден', '', true)); return f; }
  f.appendChild(head(p.title, p.subtitle, true));
  const gal = el('div', 'shop-gal'); gal.setAttribute('role', 'region'); gal.setAttribute('aria-label', 'Фото');
  const track = el('div', 'shop-gal-track');
  p.gallery.forEach((g, i) => { const s = el('div', 'shop-gal-slide'); s.appendChild(picture(g, '', i === 0)); track.appendChild(s); });
  if (!p.gallery.length) { const s = el('div', 'shop-gal-slide'); s.appendChild(soonPh('')); track.appendChild(s); }
  const dots = el('div', 'shop-gal-dots'); p.gallery.forEach((_, i) => { const d = el('i', i === 0 ? 'on' : ''); dots.appendChild(d); });
  track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });
  gal.appendChild(track); gal.appendChild(dots); f.appendChild(gal);
  const buy = el('div', 'shop-buy');
  const pl = el('div', 'shop-buy-p');
  pl.appendChild(priceBlock(p, true));
  if (!gated(p)) pl.appendChild(el('span', 'shop-badge', statusOf(p).label));
  buy.appendChild(pl);
  const cta = el('button', 'shop-cta', orderable(p) ? 'В корзину' : statusOf(p).label);
  cta.type = 'button'; cta.disabled = !orderable(p); cta.id = 'shopOrderBtn';
  cta.addEventListener('click', () => { D.hap?.(8); cart.add(p.id); push({ k: 'cart' }); });
  if (!gated(p)) buy.appendChild(cta); f.appendChild(buy);
  { const n = el('div', 'shop-pay-note'); n.append(el('p', 'shop-muted', 'СДЭК 390 ₽ · 2–4 дня  ·  Почта 290 ₽ · 5–9 дней  ·  самовывоз Краснодар 0 ₽'), payBadges()); f.appendChild(n); }
  if (p.inside) f.appendChild(insideBlock(p.inside));
  const sp = el('section', 'shop-sec'); sp.appendChild(el('h3', 'shop-h3', 'Характеристики'));
  const dl = el('dl', 'shop-specs'); for (const [k, val] of (p.specs || [])) { dl.appendChild(el('dt', '', k)); dl.appendChild(el('dd', '', val)); } sp.appendChild(dl); f.appendChild(sp);
  if (p.inBox?.length) { const s = el('section', 'shop-sec'); s.appendChild(el('h3', 'shop-h3', 'В комплекте')); const ul = el('ul', 'shop-list'); p.inBox.forEach((x) => ul.appendChild(el('li', '', x))); s.appendChild(ul); f.appendChild(s); }
  if (p.notes?.length) { const s = el('section', 'shop-sec'); s.appendChild(el('h3', 'shop-h3', 'Важно')); const ul = el('ul', 'shop-list shop-notes'); p.notes.forEach((x) => ul.appendChild(el('li', '', x))); s.appendChild(ul); f.appendChild(s); }
  return f;
}

/* ——— заявка ——— */
function viewForm(v) {
  const lines = cart.get(); const p = productById(lines[0]?.id); const u = D.currentUser() || {}; const f = document.createDocumentFragment();
  if (!p) { f.appendChild(head('Корзина пуста', '', true)); return f; }
  // Telegram во входе: по ответу сервера (GET /shop/orders), иначе — по локальной сессии
  const tgName = st.tg ? (st.tg.startsWith('@') ? st.tg.slice(1) : '') : (u.tgUsername || '');
  const hasTg = st.tg !== undefined ? !!st.tg : (u.provider === 'telegram' || !!u.tgUsername);
  const d = st.draft.co || (st.draft.co = { qty: 1, city: '', method: hasTg ? 'tg' : 'tg_other', value: '', comment: '', cid: rid(), dl: 'cdek', addr: '', promo: null, pm: 'sbp' });
  f.appendChild(head('Оформление', lines.length > 1 ? cart.count() + ' товара' : p.title + ' × ' + lines[0].qty, true));
  const form = el('form', 'shop-form'); form.noValidate = true;
  const tot = el('div', 'shop-totals');
  const refreshTot = () => {
    const t = cartTotals(lines.map((x) => ({ p: productById(x.id), qty: x.qty, founder: founderLive(productById(x.id)) })), d.dl, d.promo ? d.promo.off : 0);
    tot.replaceChildren();
    const row = (k, val, cls) => { const r = el('div', 'shop-tot-row' + (cls ? ' ' + cls : '')); r.append(el('span', '', k), el('b', '', val)); tot.appendChild(r); };
    row('Товары', t.subtotal != null ? fmtRub(t.subtotal) : 'по запросу'); row('Доставка', t.delivery ? fmtRub(t.delivery) : '0 ₽');
    if (d.promo) row('Промокод ' + d.promo.code, '−' + fmtRub(t.off), 'shop-tot-off');
    row('Итого', t.total != null ? fmtRub(t.total) : 'по запросу', 'shop-tot-sum');
  };
  // город
  const c = el('label', 'shop-field'); c.appendChild(el('span', 'shop-label', 'Город'));
  const ci = el('input', 'shop-input'); ci.id = 'shopCity'; ci.maxLength = 60; ci.autocomplete = 'address-level2'; ci.placeholder = 'Например, Москва'; ci.value = d.city; ci.addEventListener('input', () => { d.city = ci.value; });
  c.appendChild(ci); form.appendChild(c);
  // доставка
  const dw = el('div', 'shop-field'); dw.appendChild(el('span', 'shop-label', 'Доставка'));
  const dl = el('div', 'shop-opts'); dl.setAttribute('role', 'radiogroup');
  const ai = el('input', 'shop-input'); ai.id = 'shopAddr'; ai.maxLength = 200; ai.autocomplete = 'street-address'; ai.value = d.addr; ai.addEventListener('input', () => { d.addr = ai.value; });
  const syncD = () => { [...dl.children].forEach((b) => { const on = b.dataset.id === d.dl; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); ai.hidden = d.dl === 'pickup'; ai.placeholder = d.dl === 'post' ? 'Индекс и адрес' : 'Адрес пункта выдачи СДЭК'; refreshTot(); };
  for (const o of SHOP_DELIVERY) { const b = el('button', 'shop-opt'); b.type = 'button'; b.dataset.id = o.id; b.setAttribute('role', 'radio'); const t = el('span', 'shop-opt-t'); t.append(el('b', '', o.title), el('span', '', o.eta)); b.append(el('i', 'shop-opt-dot'), t, el('b', 'shop-opt-p', o.price ? fmtRub(o.price) : '0 ₽')); b.addEventListener('click', () => { d.dl = o.id; D.hap?.(4); syncD(); }); dl.appendChild(b); }
  dw.append(dl, ai); form.appendChild(dw);
  // промокод
  const pw = el('div', 'shop-field'); pw.appendChild(el('span', 'shop-label', 'Промокод'));
  const pr = el('div', 'shop-promo'); const pi = el('input', 'shop-input'); pi.id = 'shopPromo'; pi.maxLength = 24; pi.autocapitalize = 'characters'; pi.placeholder = 'Например, DRAG10'; pi.value = d.promo ? d.promo.code : '';
  const pb = el('button', 'shop-promo-b', d.promo ? 'Убрать' : 'Применить'); pb.type = 'button'; const pm = el('p', 'shop-muted shop-hint');
  pb.addEventListener('click', async () => {
    if (d.promo) { d.promo = null; pi.value = ''; pb.textContent = 'Применить'; pm.textContent = ''; refreshTot(); return; }
    const code = pi.value.trim(); if (!code) { pi.focus(); return; }
    pb.disabled = true; const r = await D.api.shopPromo?.({ code, items: lines.map((x) => ({ productId: x.id, qty: x.qty })) }).catch(() => null); pb.disabled = false;
    if (r && r.ok) { d.promo = { code: r.code, off: r.off }; pb.textContent = 'Убрать'; pm.textContent = 'Скидка ' + fmtRub(r.off); D.hap?.(10); }
    else pm.textContent = r?.error === 'min' ? 'Промокод действует от ' + fmtRub(r.min) : r?.error === 'offline' ? 'Нет сети' : 'Такого промокода нет';
    refreshTot();
  });
  pr.append(pi, pb); pw.append(pr, pm); form.appendChild(pw);
  // оплата
  const yw = el('div', 'shop-field'); yw.appendChild(el('span', 'shop-label', 'Оплата'));
  const ys = el('div', 'shop-opts shop-opts-2'); ys.setAttribute('role', 'radiogroup');
  const syncP = () => [...ys.children].forEach((b) => { const on = st.payOn && b.dataset.id === d.pm; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  for (const o of SHOP_PAY_METHODS) { const b = el('button', 'shop-opt'); b.type = 'button'; b.dataset.id = o.id; b.setAttribute('role', 'radio'); b.disabled = !st.payOn; const t = el('span', 'shop-opt-t'); t.append(el('b', '', o.title), el('span', '', st.payOn ? (o.sub || '') : 'Скоро')); b.append(el('i', 'shop-opt-dot'), t); b.addEventListener('click', () => { d.pm = o.id; D.hap?.(4); syncP(); }); ys.appendChild(b); }
  yw.append(ys, payBadges()); if (!st.payOn) yw.appendChild(el('p', 'shop-muted shop-hint', 'Онлайн-оплата скоро. Сейчас — заявка: напишем вам и согласуем оплату.')); form.appendChild(yw); syncP();
  // способ связи
  const m = el('div', 'shop-field'); m.appendChild(el('span', 'shop-label', 'Как связаться'));
  const seg = el('div', 'seg-control shop-seg'); seg.setAttribute('role', 'radiogroup');
  const opts = [['tg', 'Мой Telegram'], ['tg_other', 'Другой ник'], ['phone', 'Телефон']];
  const vi = el('input', 'shop-input'); vi.id = 'shopContact'; vi.maxLength = 40; vi.autocomplete = 'off';
  const hint = el('p', 'shop-muted shop-hint');
  const syncM = () => {
    [...seg.children].forEach((b) => { const on = b.dataset.m === d.method; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    vi.hidden = d.method === 'tg'; vi.value = d.method === 'tg' ? '' : d.value;
    vi.placeholder = d.method === 'phone' ? '+7 900 000-00-00' : '@username'; vi.inputMode = d.method === 'phone' ? 'tel' : 'text'; vi.type = d.method === 'phone' ? 'tel' : 'text';
    hint.textContent = d.method === 'tg' ? (hasTg ? 'Напишем вам' + (tgName ? ' @' + tgName : '') + ' — в Telegram, через который вы вошли.' : 'Вы вошли не через Telegram — укажите ник или телефон.') : d.method === 'phone' ? 'Номер увидит только команда PITLANE — для связи по заявке.' : 'Ник в Telegram, куда написать.';
  };
  for (const [k, lab] of opts) { const b = el('button', 'seg-btn', lab); b.type = 'button'; b.dataset.m = k; b.setAttribute('role', 'radio'); if (k === 'tg' && !hasTg) b.disabled = true; b.addEventListener('click', () => { d.method = k; d.value = ''; D.hap?.(4); syncM(); }); seg.appendChild(b); }
  vi.addEventListener('input', () => { d.value = vi.value; });
  m.append(seg, vi, hint); form.appendChild(m); syncM();
  // комментарий
  const cm = el('label', 'shop-field'); cm.appendChild(el('span', 'shop-label', 'Комментарий (необязательно)'));
  const ta = el('textarea', 'shop-input shop-ta'); ta.id = 'shopComment'; ta.maxLength = 500; ta.rows = 3; ta.placeholder = 'Машина, трек, когда нужен прибор'; ta.value = d.comment; ta.addEventListener('input', () => { d.comment = ta.value; });
  cm.appendChild(ta); form.appendChild(cm);
  const msg = el('p', 'shop-msg'); msg.id = 'shopMsg'; msg.setAttribute('role', 'status');
  const sendLabel = st.payOn ? 'Перейти к оплате' : 'Оформить заявку';
  const send = el('button', 'shop-cta', sendLabel); send.type = 'submit'; send.id = 'shopSend';
  form.append(tot, msg, send); syncD();
  form.appendChild(el('p', 'shop-muted shop-pd', 'Сохраняем только город, способ связи и комментарий — для этой заявки. Удаляются вместе с аккаунтом. Подробнее — в политике конфиденциальности.'));
  { const lg = el('p', 'shop-muted shop-pd'); lg.append('Отправляя заявку, вы соглашаетесь с '); const a1 = el('a', '', 'офертой'); a1.href = './sale.html'; const a2 = el('a', '', 'политикой конфиденциальности'); a2.href = './privacy.html'; const a3 = el('a', '', 'условиями доставки и возврата'); a3.href = './delivery.html'; lg.append(a1, ', ', a2, ' и ', a3, '.'); form.appendChild(lg); }
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (st.busy) return;
    const city = d.city.trim();
    if (city.length < 2) { msg.textContent = 'Укажите город'; ci.focus(); return; }
    if (d.dl !== 'pickup' && d.addr.trim().length < 5) { msg.textContent = d.dl === 'post' ? 'Укажите индекс и адрес' : 'Укажите адрес пункта СДЭК'; ai.focus(); return; }
    if (d.method === 'tg_other' && !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(d.value.trim())) { msg.textContent = 'Ник Telegram: от 5 символов, латиница, цифры и _'; vi.focus(); return; }
    if (d.method === 'phone' && d.value.replace(/\D/g, '').length < 10) { msg.textContent = 'Проверьте номер телефона'; vi.focus(); return; }
    st.busy = true; send.disabled = true; send.textContent = 'Отправляем…'; msg.textContent = '';
    const r = await D.api.shopOrder({ items: lines.map((x) => ({ productId: x.id, qty: x.qty })), delivery: { id: d.dl, addr: d.dl === 'pickup' ? '' : d.addr.trim() }, promo: d.promo ? d.promo.code : undefined, payMethod: st.payOn ? d.pm : undefined, city, contact: { method: d.method, value: d.method === 'tg' ? undefined : d.value.trim() }, comment: d.comment.trim(), cid: d.cid });
    st.busy = false; send.disabled = false; send.textContent = sendLabel;
    if (r && r.ok && r.order && r.order.payUrl) { delete st.draft.co; cart.set([]); location.href = r.order.payUrl; return; }
    if (r && r.ok && r.order) { delete st.draft.co; cart.set([]); st.orders = [r.order, ...(st.orders || []).filter((o) => o.id !== r.order.id)]; st.stack = [{ k: 'list' }, { k: 'done', order: r.order }]; D.hap?.(12); render(); return; }
    msg.textContent = r?.status === 429 ? 'Слишком много заявок за сутки — попробуйте завтра или напишите в бота.'
      : r?.status === 401 ? 'Сессия истекла — войдите снова.'
      : r?.code === 'no_tg' ? 'В аккаунте нет Telegram — выберите другой способ связи.'
      : r?.field === 'promo' ? 'Промокод не подошёл — уберите его.' : r?.field === 'delivery' ? 'Проверьте адрес доставки.' : r?.field === 'items' ? 'Товара нет в наличии — обновите корзину.'
      : r?.field === 'city' ? 'Проверьте город.' : r?.field === 'contact' ? 'Проверьте контакт.'
      : 'Не отправилось — проверьте интернет и нажмите ещё раз (повтор не создаст вторую заявку).';
  });
  return f.appendChild(form), f;
}

/* ——— заявка принята ——— */
function viewDone(v) {
  const o = v.order; const f = document.createDocumentFragment();
  const w = el('div', 'shop-done');
  const ic = el('div', 'shop-done-ic'); ic.appendChild(svg('M5 12.5l4.5 4.5L19 7.5')); w.appendChild(ic);
  w.appendChild(el('h2', 'shop-title', 'Заявка принята'));
  w.appendChild(el('p', 'shop-sub', 'Свяжемся ' + (o.contactMethod === 'phone' ? 'по телефону' : 'в Telegram') + ', чтобы договориться об оплате и доставке. Заранее ничего платить не нужно.'));
  const card = el('div', 'shop-done-card');
  const row = (k, val) => { const r = el('div', 'shop-done-row'); r.append(el('span', '', k), el('b', '', val)); card.appendChild(r); };
  row('Номер', o.no ? '№' + o.no : o.id); (o.items || [{ title: o.title, qty: o.qty }]).forEach((x) => row('Товар', x.title + ' × ' + x.qty)); if (o.delivery) row('Доставка', o.delivery.title); if (o.total != null) row('Сумма', fmtRub(o.total)); if (o.founder) row('Цена', 'Основатель · ' + fmtRub(FOUNDERS.price)); row('Город', o.city); row('Статус', o.statusLabel || ORDER_STATUS.new);
  w.appendChild(card);
  const b = el('button', 'shop-cta shop-cta-2', 'Открыть заказ'); b.type = 'button'; b.addEventListener('click', () => { st.stack = [{ k: 'list' }, { k: 'order', id: o.id }]; render(); });
  w.appendChild(b); f.appendChild(w); return f;
}
/* ——— v226: корзина ——— */
function viewCart() {
  const f = document.createDocumentFragment(); const lines = cart.get();
  f.appendChild(head('Корзина', lines.length ? cart.count() + ' шт.' : '', true));
  if (!lines.length) { const e = el('div', 'shop-empty'); e.append(el('p', 'shop-muted', 'Корзина пуста.')); const b = el('button', 'shop-cta shop-cta-2', 'В каталог'); b.type = 'button'; b.addEventListener('click', () => { st.stack = [{ k: 'list' }]; render(); }); e.appendChild(b); f.appendChild(e); return f; }
  const ul = el('div', 'shop-cart');
  lines.forEach((x, i) => {
    const p = productById(x.id); const r = el('div', 'shop-cart-row');
    if (p.gallery?.[0]) r.appendChild(picture(p.gallery[0], 'shop-cart-img', true)); else r.appendChild(soonPh('shop-cart-img'));
    const t = el('div', 'shop-cart-t'); t.append(el('b', '', p.title), el('span', 'shop-muted', fmtRub((founderLive(p) ? founderTotal(p, x.qty) : orderTotal(p, x.qty)) || 0)));
    const q = el('div', 'shop-qty'); const mi = el('button', 'shop-qty-b', '−'); mi.type = 'button'; mi.setAttribute('aria-label', 'Меньше'); const pl = el('button', 'shop-qty-b', '+'); pl.type = 'button'; pl.setAttribute('aria-label', 'Больше'); pl.disabled = x.qty >= (p.maxQty || 5);
    mi.addEventListener('click', () => { const c = cart.get(); c[i].qty -= 1; if (c[i].qty < 1) c.splice(i, 1); cart.set(c); D.hap?.(4); render(); });
    pl.addEventListener('click', () => { const c = cart.get(); c[i].qty = Math.min(p.maxQty || 5, c[i].qty + 1); cart.set(c); D.hap?.(4); render(); });
    q.append(mi, el('output', 'shop-qty-v', String(x.qty)), pl); t.appendChild(q); r.appendChild(t); ul.appendChild(r);
  });
  f.appendChild(ul);
  const t = cartTotals(lines.map((x) => ({ p: productById(x.id), qty: x.qty, founder: founderLive(productById(x.id)) })), null, 0);
  const s = el('div', 'shop-totals'); const r1 = el('div', 'shop-tot-row shop-tot-sum'); r1.append(el('span', '', 'Товары'), el('b', '', t.subtotal != null ? fmtRub(t.subtotal) : 'по запросу')); s.appendChild(r1);
  s.appendChild(el('p', 'shop-muted', 'Доставка и промокод — на следующем шаге'));
  f.appendChild(s);
  const go = el('button', 'shop-cta', 'Оформить'); go.type = 'button'; go.id = 'shopCheckout';
  go.addEventListener('click', async () => { D.hap?.(8); if (!D.currentUser()) { D.close?.(); D.needLogin('Чтобы оформить заказ, войдите — так мы сможем с вами связаться'); return; } if (st.tg === undefined) { go.disabled = true; await loadOrders(); go.disabled = false; } push({ k: 'form' }); });
  f.appendChild(go); f.appendChild(payBadges());
  return f;
}
/* ——— v226: заказ — таймлайн «Оплачен → Собран → Передан (трек) → Доставлен» ——— */
const TL = [['paid', 'Оплачен'], ['assembling', 'Собран'], ['shipped', 'Передан в доставку'], ['delivered', 'Доставлен']];
function viewOrder(v) {
  const f = document.createDocumentFragment(); const o = (st.orders || []).find((x) => x.id === v.id);
  if (!o) { f.appendChild(head('Заказ', 'Загружаем…', true)); if (st.orders == null) void loadOrders(); return f; }
  f.appendChild(head('Заказ ' + (o.no ? '№' + o.no : ''), new Date(o.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' · ' + shortStatus(o.status), true));
  const hist = o.history || []; const at = (k) => hist.find((h) => h.st === k)?.at; const cur = TL.findIndex(([k]) => k === o.status);
  const tl = el('ol', 'shop-tl');
  if (o.status === 'canceled') tl.appendChild(el('li', 'shop-tl-x', 'Заказ отменён'));
  else TL.forEach(([k, lab], i) => {
    const li = el('li', 'shop-tl-i' + (at(k) || i <= cur ? ' done' : '') + (i === cur ? ' cur' : '')); li.appendChild(el('i', 'shop-tl-dot'));
    const t = el('div'); t.appendChild(el('b', '', lab)); const when = at(k); t.appendChild(el('span', 'shop-muted', when ? new Date(when).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : (k === 'paid' && o.status === 'new' ? (o.payUrl ? 'ждём оплату' : 'заявка — согласуем оплату') : '—')));
    if (k === 'shipped' && o.track) t.appendChild(el('code', 'shop-track', o.track)); li.appendChild(t); tl.appendChild(li);
  });
  f.appendChild(tl);
  const card = el('div', 'shop-done-card'); const row = (k, val) => { const r = el('div', 'shop-done-row'); r.append(el('span', '', k), el('b', '', val)); card.appendChild(r); };
  (o.items || []).forEach((x) => row(x.title + ' × ' + x.qty, x.sum != null ? fmtRub(x.sum) : '—'));
  if (o.delivery) row(o.delivery.title, o.delivery.price ? fmtRub(o.delivery.price) : '0 ₽');
  if (o.promo) row('Промокод ' + o.promo.code, '−' + fmtRub(o.promo.off));
  if (o.total != null) row('Итого', fmtRub(o.total));
  if (o.delivery?.addr) row('Адрес', o.delivery.addr);
  f.appendChild(card);
  const acts = el('div', 'shop-acts');
  if (o.payUrl) { const a = el('a', 'shop-cta', 'Оплатить · ' + fmtRub(o.total)); a.href = o.payUrl; acts.appendChild(a); }
  const tu = o.trackUrl || trackUrl(o.delivery?.id, o.track);
  { const a = el('a', 'shop-cta shop-cta-2' + (tu ? '' : ' off'), 'Отследить посылку'); if (tu) { a.href = tu; a.target = '_blank'; a.rel = 'noopener'; } else a.setAttribute('aria-disabled', 'true'); acts.appendChild(a); }
  { const a = el('a', 'shop-cta shop-cta-2', 'Написать в поддержку'); a.href = 'https://t.me/pitlane_official_bot?start=support'; a.target = '_blank'; a.rel = 'noopener'; acts.appendChild(a); }
  f.appendChild(acts); return f;
}
const VIEWS = { list: viewList, product: viewProduct, form: viewForm, done: viewDone, cart: viewCart, order: viewOrder };

export function openShop(deps, start) {
  D = deps; st.orders = null; st.tg = undefined; void loadFounders();
  st.stack = [{ k: 'list' }]; if (start && productById(start)) st.stack.push({ k: 'product', id: start });
  render();
}
export const shopBack = () => { if (st.stack.length > 1) { pop(); return true; } return false; };
