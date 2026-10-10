/* v137: магазин PITLANE — шторка: витрина → карточка товара → заявка → «Заявка принята», плюс «Мои заявки».
 * Всё строится через DOM + textContent (без вставки HTML-строк). Оплаты онлайн нет (SHOP_CONFIG.payments=false). */
import { SHOP_CONFIG, ORDER_STATUS, visibleProducts, productById, statusOf, orderable, priceLine, fmtRub, orderTotal } from './shop-config.js';

let D = null; // deps from app.js: { api, currentUser, needLogin, hap, close }
const st = { stack: [], orders: null, tg: undefined, busy: false, draft: {} };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const body = () => document.getElementById('shopBody');
const rid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); };

function picture(g, cls, eager) {
  const p = el('picture', cls);
  const s = document.createElement('source'); s.type = 'image/avif'; s.srcset = g.avif; s.sizes = '(max-width: 560px) 100vw, 520px'; p.appendChild(s);
  const i = document.createElement('img'); i.srcset = g.webp; i.src = g.src; i.sizes = '(max-width: 560px) 100vw, 520px'; i.alt = g.alt || '';
  i.width = 1200; i.height = 800; i.decoding = 'async'; i.loading = eager ? 'eager' : 'lazy'; p.appendChild(i);
  return p;
}
function head(title, sub, back) {
  const h = el('div', 'shop-head');
  if (back) { const b = el('button', 'shop-back'); b.type = 'button'; b.setAttribute('aria-label', 'Назад'); b.appendChild(svg('M15 5l-7 7 7 7')); b.addEventListener('click', () => { D.hap?.(6); pop(); }); h.appendChild(b); }
  const t = el('div', 'shop-head-t'); t.appendChild(el('h2', 'shop-title', title)); if (sub) t.appendChild(el('p', 'shop-sub', sub)); h.appendChild(t);
  return h;
}
function svg(d) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); return s; }
function render() { const b = body(); if (!b) return; const v = st.stack[st.stack.length - 1] || { k: 'list' }; b.replaceChildren(VIEWS[v.k](v)); const sc = b.closest('.shop-sheet-inner'); if (sc) sc.scrollTop = 0; }
function push(v) { st.stack.push(v); render(); }
function pop() { if (st.stack.length > 1) st.stack.pop(); render(); }

/* ——— витрина ——— */
function viewList() {
  const f = document.createDocumentFragment();
  f.appendChild(head('Магазин', 'Железо PITLANE для трека'));
  for (const p of visibleProducts()) {
    const c = el('button', 'shop-card'); c.type = 'button'; c.dataset.product = p.id;
    if (p.gallery?.[0]) c.appendChild(picture(p.gallery[0], 'shop-card-img', true));
    const t = el('span', 'shop-card-txt');
    t.appendChild(el('b', 'shop-card-title', p.title)); t.appendChild(el('span', 'shop-card-sub', p.subtitle || ''));
    t.appendChild(el('span', 'shop-price', priceLine(p)));
    c.appendChild(t);
    c.addEventListener('click', () => { D.hap?.(6); push({ k: 'product', id: p.id }); });
    f.appendChild(c);
  }
  f.appendChild(ordersBlock());
  f.appendChild(el('p', 'shop-foot', 'Онлайн-оплаты пока нет: оформляете заявку — мы пишем вам в Telegram и договариваемся об оплате и доставке.'));
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
  const r = el('div', 'shop-order');
  const l = el('div', 'shop-order-l');
  l.appendChild(el('b', '', o.title + ' × ' + o.qty));
  l.appendChild(el('span', 'shop-muted', '№ ' + o.id + ' · ' + new Date(o.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (o.total != null ? ' · ' + fmtRub(o.total) : '')));
  r.appendChild(l);
  r.appendChild(el('span', 'shop-st shop-st-' + (o.status || 'new'), ORDER_STATUS[o.status] ? shortStatus(o.status) : shortStatus('new')));
  return r;
}
const shortStatus = (s) => ({ new: 'Принята', contacted: 'На связи', confirmed: 'Подтверждён', shipped: 'Отправлен', done: 'Получен', canceled: 'Отменён' }[s] || 'Принята');
async function loadOrders() {
  const r = await D.api.shopOrders();
  st.orders = r && r.ok && Array.isArray(r.orders) ? r.orders : [];
  if (r && r.ok) st.tg = r.tg || null; // сервер знает, есть ли Telegram во входе
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
  const dots = el('div', 'shop-gal-dots'); p.gallery.forEach((_, i) => { const d = el('i', i === 0 ? 'on' : ''); dots.appendChild(d); });
  track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });
  gal.appendChild(track); gal.appendChild(dots); f.appendChild(gal);
  const buy = el('div', 'shop-buy');
  const pl = el('div', 'shop-buy-p');
  pl.appendChild(el('b', 'shop-buy-price', Number.isFinite(p.price) && p.price > 0 ? fmtRub(p.price) : 'Цена по запросу'));
  pl.appendChild(el('span', 'shop-badge', statusOf(p).label));
  buy.appendChild(pl);
  const cta = el('button', 'shop-cta', orderable(p) ? (p.status === 'preorder' ? 'Заказать · предзаказ' : 'Заказать') : statusOf(p).label);
  cta.type = 'button'; cta.disabled = !orderable(p); cta.id = 'shopOrderBtn';
  cta.addEventListener('click', async () => { D.hap?.(8); if (!D.currentUser()) { D.close?.(); D.needLogin('Чтобы оформить заявку, войдите — так мы сможем с вами связаться'); return; } if (st.tg === undefined) { cta.disabled = true; await loadOrders(); cta.disabled = false; } push({ k: 'form', id: p.id }); });
  buy.appendChild(cta); f.appendChild(buy);
  if (!SHOP_CONFIG.payments) f.appendChild(el('p', 'shop-muted shop-pay-note', 'Без предоплаты в приложении: после заявки напишем в Telegram, договоримся об оплате и доставке.'));
  const sp = el('section', 'shop-sec'); sp.appendChild(el('h3', 'shop-h3', 'Характеристики'));
  const dl = el('dl', 'shop-specs'); for (const [k, val] of p.specs) { dl.appendChild(el('dt', '', k)); dl.appendChild(el('dd', '', val)); } sp.appendChild(dl); f.appendChild(sp);
  if (p.inBox?.length) { const s = el('section', 'shop-sec'); s.appendChild(el('h3', 'shop-h3', 'В комплекте')); const ul = el('ul', 'shop-list'); p.inBox.forEach((x) => ul.appendChild(el('li', '', x))); s.appendChild(ul); f.appendChild(s); }
  if (p.notes?.length) { const s = el('section', 'shop-sec'); s.appendChild(el('h3', 'shop-h3', 'Важно')); const ul = el('ul', 'shop-list shop-notes'); p.notes.forEach((x) => ul.appendChild(el('li', '', x))); s.appendChild(ul); f.appendChild(s); }
  return f;
}

/* ——— заявка ——— */
function viewForm(v) {
  const p = productById(v.id); const u = D.currentUser() || {}; const f = document.createDocumentFragment();
  // Telegram во входе: по ответу сервера (GET /shop/orders), иначе — по локальной сессии
  const tgName = st.tg ? (st.tg.startsWith('@') ? st.tg.slice(1) : '') : (u.tgUsername || '');
  const hasTg = st.tg !== undefined ? !!st.tg : (u.provider === 'telegram' || !!u.tgUsername);
  const d = st.draft[p.id] || (st.draft[p.id] = { qty: 1, city: '', method: hasTg ? 'tg' : 'tg_other', value: '', comment: '', cid: rid() });
  f.appendChild(head('Заявка', p.title + ' · ' + statusOf(p).label.toLowerCase(), true));
  const form = el('form', 'shop-form'); form.noValidate = true;
  // количество
  const q = el('div', 'shop-field'); q.appendChild(el('span', 'shop-label', 'Количество'));
  const stp = el('div', 'shop-qty'); const minus = el('button', 'shop-qty-b', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Меньше');
  const qv = el('output', 'shop-qty-v', String(d.qty)); const plus = el('button', 'shop-qty-b', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Больше');
  const sum = el('span', 'shop-sum');
  const upd = () => { qv.textContent = String(d.qty); minus.disabled = d.qty <= 1; plus.disabled = d.qty >= (p.maxQty || 5); const t = orderTotal(p, d.qty); sum.textContent = t != null ? 'Итого ' + fmtRub(t) : 'Цена по запросу'; };
  minus.addEventListener('click', () => { d.qty = Math.max(1, d.qty - 1); D.hap?.(4); upd(); }); plus.addEventListener('click', () => { d.qty = Math.min(p.maxQty || 5, d.qty + 1); D.hap?.(4); upd(); });
  stp.append(minus, qv, plus); q.appendChild(stp); q.appendChild(sum); form.appendChild(q); upd();
  // город
  const c = el('label', 'shop-field'); c.appendChild(el('span', 'shop-label', 'Город'));
  const ci = el('input', 'shop-input'); ci.id = 'shopCity'; ci.maxLength = 60; ci.autocomplete = 'address-level2'; ci.placeholder = 'Например, Москва'; ci.value = d.city; ci.addEventListener('input', () => { d.city = ci.value; });
  c.appendChild(ci); form.appendChild(c);
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
  const send = el('button', 'shop-cta', 'Отправить заявку'); send.type = 'submit'; send.id = 'shopSend';
  form.append(msg, send);
  form.appendChild(el('p', 'shop-muted shop-pd', 'Сохраняем только город, способ связи и комментарий — для этой заявки. Удаляются вместе с аккаунтом. Подробнее — в политике конфиденциальности.'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (st.busy) return;
    const city = d.city.trim();
    if (city.length < 2) { msg.textContent = 'Укажите город'; ci.focus(); return; }
    if (d.method === 'tg_other' && !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(d.value.trim())) { msg.textContent = 'Ник Telegram: от 5 символов, латиница, цифры и _'; vi.focus(); return; }
    if (d.method === 'phone' && d.value.replace(/\D/g, '').length < 10) { msg.textContent = 'Проверьте номер телефона'; vi.focus(); return; }
    st.busy = true; send.disabled = true; send.textContent = 'Отправляем…'; msg.textContent = '';
    const r = await D.api.shopOrder({ productId: p.id, qty: d.qty, city, contact: { method: d.method, value: d.method === 'tg' ? undefined : d.value.trim() }, comment: d.comment.trim(), cid: d.cid });
    st.busy = false; send.disabled = false; send.textContent = 'Отправить заявку';
    if (r && r.ok && r.order) { delete st.draft[p.id]; st.orders = [r.order, ...(st.orders || []).filter((o) => o.id !== r.order.id)]; st.stack = [{ k: 'list' }, { k: 'done', order: r.order }]; D.hap?.(12); render(); return; }
    msg.textContent = r?.status === 429 ? 'Слишком много заявок за сутки — попробуйте завтра или напишите в бота.'
      : r?.status === 401 ? 'Сессия истекла — войдите снова.'
      : r?.code === 'no_tg' ? 'В аккаунте нет Telegram — выберите другой способ связи.'
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
  row('Номер', o.id); row('Товар', o.title + ' × ' + o.qty); if (o.total != null) row('Сумма', fmtRub(o.total)); row('Город', o.city); row('Статус', o.statusLabel || ORDER_STATUS.new);
  w.appendChild(card);
  const b = el('button', 'shop-cta shop-cta-2', 'К магазину'); b.type = 'button'; b.addEventListener('click', () => { st.stack = [{ k: 'list' }]; render(); });
  w.appendChild(b); f.appendChild(w); return f;
}
const VIEWS = { list: viewList, product: viewProduct, form: viewForm, done: viewDone };

export function openShop(deps, start) {
  D = deps; st.orders = null; st.tg = undefined;
  st.stack = [{ k: 'list' }]; if (start && productById(start)) st.stack.push({ k: 'product', id: start });
  render();
}
export const shopBack = () => { if (st.stack.length > 1) { pop(); return true; } return false; };
