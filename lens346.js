// v346: iOS 26 Liquid Glass для WebKit/iOS — настоящая линза без backdrop-filter.
// В WKWebView backdrop-filter не умеет SVG-смещение, поэтому под стеклом лежит копия контента:
// обрезанный клон активного экрана, синхронный со скроллом (transform), размытый (filter:blur),
// а по кромке — увеличенная копия (выпуклая линза), которую тело перекрывает везде, кроме кольца у края.
// Клон рисуется только в полосе под доком (остальные строки visibility:hidden), обновляется по MutationObserver.
const LENS_VIEWS = new Set(['view-lap', 'view-history', 'view-settings', 'view-account', 'view-zamer', 'view-tops']);
// слои: w — ширина кольца (0 — тело), s — увеличение, f — фильтр
const LAYERS = [
  { e: 0, d: 6, k: +(globalThis.__lgKr || 2), f: '', ring: true }, // сзади: увеличенная копия — видна только кольцом у кромки
  { e: 4.5, d: 0, k: +(globalThis.__lgKb || 2), f: `blur(${2.4 / +(globalThis.__lgKb || 2)}px)` }, // спереди: тело, утоплено на ширину кольца, размыто (копия в 1/2 разрешения + blur ≈ 3–4px)
];
const BAND = 320; // px от низа экрана, где может лежать стекло (открытая панель ~242)

// контент уходит под док (как в iOS) только на экранах-списках; класс на #viewHost вместо html:has() — дешевле при смене вкладок
const UNDER_VIEWS = new Set(['view-lap', 'view-history', 'view-settings', 'view-account']);
function initUnder346() {
  const host = document.getElementById('viewHost'); if (!host) return;
  const upd = () => { const v = host.querySelector(':scope > .view.active'); host.classList.toggle('lg-under', !!(v && UNDER_VIEWS.has(v.id))); };
  const mo = new MutationObserver(upd);
  host.querySelectorAll(':scope > .view').forEach((v) => mo.observe(v, { attributes: true, attributeFilter: ['class'] }));
  upd();
}

export function initLens346() {
  try { initUnder346(); } catch (_) {}
  if (window.__lgOff) return; // для замеров: выключить линзу
  const de = document.documentElement;
  if (de.classList.contains('lg-refract')) return; // Chromium: настоящая SVG-рефракция в backdrop-filter
  const host = document.getElementById('viewHost');
  const surface = document.getElementById('n3Surface');
  const fab = document.getElementById('n3Fab');
  if (!host || !surface || !fab || typeof ResizeObserver === 'undefined') return;
  if (matchMedia('(prefers-reduced-transparency: reduce)').matches) return;

  const mirror = document.createElement('div');
  mirror.className = 'lg-mirror'; mirror.setAttribute('aria-hidden', 'true'); mirror.inert = true;
  host.appendChild(mirror);

  const hosts = [surface, fab].map((el) => {
    const box = document.createElement('div'); box.className = 'lg-host';
    const layers = LAYERS.map((L) => {
      // слой рисуется в 1/k разрешения и растягивается transform'ом; маски не нужны — тело просто перекрывает кольцо
      const lay = document.createElement('div'); lay.className = L.ring ? 'lg-lay lg-ring' : 'lg-lay lg-body';
      const e = el === fab ? L.e * 0.7 : L.e; if (e) lay.style.inset = e + 'px';
      const dn = document.createElement('div'); dn.className = 'lg-dn';
      dn.style.cssText = (L.f ? `filter:${L.f};-webkit-filter:${L.f};` : '') + `transform:scale(${L.k});`;
      const sc = document.createElement('div'); sc.className = 'lg-sc';
      const pos = document.createElement('div'); pos.className = 'lg-pos';
      sc.appendChild(pos); dn.appendChild(sc); lay.appendChild(dn); box.appendChild(lay);
      return { lay, e, pos, sc, dn, k: L.k, d: el === fab ? L.d * 0.7 : L.d };
    });
    mirror.appendChild(box);
    return { el, box, poss: layers.map((l) => l.pos), lays: layers, r: { x: 0, y: 0, w: 0, h: 0 } };
  });

  let recTok = 0, view = null, rows = [], clonedFor = null, raf = 0, until = 0, mo = null, reTimer = 0;
  const hostRect = () => host.getBoundingClientRect();

  function copyCanvases(src, dst) {
    const a = src.querySelectorAll('canvas'); if (!a.length) return;
    const b = dst.querySelectorAll('canvas');
    a.forEach((c, i) => { const d = b[i]; if (!d || !c.width || !c.height) return; try { d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); } catch (_) {} });
  }

  function reclone(still) {
    if (!view) return;
    const vr = view.getBoundingClientRect(); const st = view.scrollTop;
    // строки: элементы до 260px высотой, у которых родитель выше — по ним режем полосу
    const origRows = [];
    const walk = (n, depth) => {
      for (const c of n.children) {
        const h = c.offsetHeight;
        if (h && h <= 260) origRows.push(c); else if (depth < 7) walk(c, depth + 1);
      }
    };
    walk(view, 0);
    const meta = origRows.map((c) => { const r = c.getBoundingClientRect(); return { top: r.top - vr.top + st, bot: r.bottom - vr.top + st, w: r.width, h: r.height }; });
    // клонируем с отметками, чтобы найти пары
    origRows.forEach((c, i) => c.setAttribute('data-lgr', i));
    const tpl = view.cloneNode(true);
    origRows.forEach((c) => c.removeAttribute('data-lgr'));
    copyCanvases(view, tpl);
    // fixed/sticky внутри копии встали бы не туда (предок с transform) — прячем их
    { const a = view.querySelectorAll('*'), b = tpl.querySelectorAll('*');
      for (let i = 0; i < a.length && i < b.length; i++) { const p = getComputedStyle(a[i]).position; if (p === 'fixed' || p === 'sticky') b[i].style.visibility = 'hidden'; } }
    tpl.classList.add('lg-clone'); if (still) tpl.classList.add('lg-still');
    tpl.style.cssText += `;width:${view.offsetWidth}px`;
    const copies = [];
    for (const h of hosts) for (let j = 0; j < h.poss.length; j++) copies.push(copies.length ? tpl.cloneNode(true) : tpl);
    copies.forEach((c, j) => { if (j) copyCanvases(tpl, c); });
    const make = (j) => {
      const c = copies[j];
      const map = new Array(origRows.length);
      c.querySelectorAll('[data-lgr]').forEach((e) => { map[+e.getAttribute('data-lgr')] = e; e.removeAttribute('data-lgr'); });
      return { c, map };
    };
    const lo = window.innerHeight - BAND - vr.top + st, hi = window.innerHeight - vr.top + st;
    // далеко от дока (±900px) — content-visibility:hidden (не раскладывается вовсе); ближе — только visibility при скролле
    rows = meta.map((m) => ({ ...m, els: [], vis: m.bot > lo && m.top < hi, cv: !(m.bot > lo - 900 && m.top < hi + 900) }));
    let k = 0; const jobs = [];
    for (const h of hosts) for (const pos of h.poss) {
      const { c, map } = make(k++);
      map.forEach((e, i) => { if (!e) return; rows[i].els.push(e); const r = rows[i]; if (r.cv) { e.style.contentVisibility = 'hidden'; e.style.containIntrinsicSize = `${r.w}px ${r.h}px`; } else if (!r.vis) e.style.visibility = 'hidden'; });
      jobs.push(() => pos.replaceChildren(c)); // вставляем уже «обрезанную» копию — раскладывается только полоса под доком
    }
    // по одной копии за кадр: вместо одного кадра ~60 мс — четыре по ~15 мс (тело пилюли первым)
    const order = [1, 0, 3, 2].filter((i) => jobs[i]); const tok = ++recTok;
    jobs[order[0]]();
    const step = (n) => { if (tok !== recTok || n >= order.length) return; jobs[order[n]](); requestAnimationFrame(() => step(n + 1)); };
    requestAnimationFrame(() => step(1));
    clonedFor = view;
  }

  function cull(force) {
    if (!view) return;
    const hr = hostRect(); const vr = view.getBoundingClientRect(); const st = view.scrollTop;
    const lo = window.innerHeight - BAND - vr.top + st, hi = window.innerHeight - vr.top + st;
    for (const r of rows) {
      const v = r.bot > lo && r.top < hi;
      // вне полосы строка в копии не раскладывается и не рисуется (content-visibility), размер держит intrinsic-size
      if (v !== r.vis || force) { r.vis = v; for (const e of r.els) { if (r.cv && v) { e.style.contentVisibility = ''; e.style.containIntrinsicSize = ''; } e.style.visibility = v ? '' : 'hidden'; } if (v) r.cv = false; }
    }
    void hr;
  }

  function sync() {
    if (!view) return;
    const hr = hostRect(); const vr = view.getBoundingClientRect(); const st = view.scrollTop;
    for (const h of hosts) {
      const r = h.el.getBoundingClientRect();
      const x = r.left - hr.left, y = r.top - hr.top;
      if (x !== h.r.x || y !== h.r.y || r.width !== h.r.w || r.height !== h.r.h) {
        h.box.style.transform = `translate3d(${x}px,${y}px,0)`;
        h.box.style.width = r.width + 'px'; h.box.style.height = r.height + 'px';
        h.box.style.borderRadius = getComputedStyle(h.el).borderTopLeftRadius;

        h.r = { x, y, w: r.width, h: r.height };
        // выпуклая линза: у кромки контент берётся на d px ближе к центру (по обеим осям одинаково)
        const R = parseFloat(h.box.style.borderRadius) || 0;
        h.box.classList.toggle('lg-open', r.height > 90); // открытая панель — как меню iOS: сильнее размытие и темнее
        for (const l of h.lays) {
          const e = (h.moving || h.flat) ? 0 : l.e; l.lay.style.inset = e + 'px';
          const w = (r.width - 2 * e) / l.k, hh = (r.height - 2 * e) / l.k;
          l.lay.style.borderRadius = Math.max(0, R - e) + 'px'; l.ee = e;
          l.dn.style.width = w + 'px'; l.dn.style.height = hh + 'px';
          // выпуклая линза: у кромки контент берётся на d px ближе к центру (по вертикали не больше 16% высоты)
          const sx = 1 + (l.d ? l.d / Math.max(8, r.width / 2) : 0), sy = 1 + (l.d ? Math.min(l.d, r.height * 0.16) / Math.max(8, r.height / 2) : 0);
          l.sc.style.transform = l.d ? `translate(${w / 2}px,${hh / 2}px) scale(${sx},${sy}) translate(${-w / 2}px,${-hh / 2}px)` : '';
        }
      }
      const tx = vr.left - r.left, ty = vr.top - r.top - st;
      for (const l of h.lays) l.pos.style.transform = `translate3d(${(tx - l.ee) / l.k}px,${(ty - l.ee) / l.k}px,0) scale(${1 / l.k})`;
    }
    cull(false);
  }

  function loop() { sync(); raf = performance.now() < until ? requestAnimationFrame(loop) : 0; }
  function kick(ms = 260) { until = Math.max(until, performance.now() + ms); if (!raf) raf = requestAnimationFrame(loop); }

  // экономный режим: во время скролла кольцо-линза прячется (тело на всю ширину), после остановки возвращается
  let scT = 0, scL = 0, scF = [];
  const setFlat = (on) => { for (const h of hosts) { if (h.flat === on) continue; h.flat = on; h.box.classList.toggle('lg-flat', on); h.r = { x: 0, y: 0, w: 0, h: 0 }; } };
  function onScroll() {
    if (!clonedFor) return;
    if (!econ) { const t = performance.now(); if (scL && t - scL < 100) scF.push(t - scL); scL = t; if (scF.length >= 24) { const a = scF.sort((x, y) => x - y); if (a[a.length >> 1] > 22) setEcon(); scF = []; } }
    if (econ) { setFlat(true); clearTimeout(scT); scT = setTimeout(() => { setFlat(false); sync(); }, 140); }
    sync(); kick(120);
  }
  // смена экрана: пока экран въезжает (~0.5 с), линза выключена (стекло = обычный backdrop-filter),
  // копия делается уже по готовому экрану, без анимаций — переключение вкладок не платит за клон
  let pickT = 0;
  // класс ставится на док и зеркало, а не на <html>: смена не пересчитывает стили всей страницы
  const dock = document.getElementById('n3Dock');
  const setOn = (on) => { mirror.classList.toggle('is-on', on); dock?.classList.toggle('lg-lens-on', on); };
  function pick() {
    const v = document.querySelector('#viewHost > .view.active');
    const ok = v && LENS_VIEWS.has(v.id) && !de.classList.contains('gl-lite');
    const next = ok ? v : null;
    if (next === view) { if (view && clonedFor) { sync(); kick(300); } return; }
    view?.removeEventListener('scroll', onScroll);
    view = next; mo?.disconnect(); clearTimeout(pickT); clearTimeout(reTimer);
    if (clonedFor) { for (const h of hosts) for (const p of h.poss) p.replaceChildren(); rows = []; clonedFor = null; }
    // пока новый экран въезжает, под стеклом — пустое тёмное тело (как стекло над чёрным), backdrop-filter не включаем:
    // в софт-рендере он дороже линзы. Через ~0.5 с появляется копия готового экрана.
    if (!view) { setOn(false); return; }
    setOn(true);
    view.addEventListener('scroll', onScroll, { passive: true });
    pickT = setTimeout(() => requestAnimationFrame(() => {
      if (view !== next) return;
      reclone(true); sync(); setOn(true); kick(300);
      mo = new MutationObserver((list) => {
        if (list.every((m) => m.target.closest?.('.lg-mirror'))) return;
        clearTimeout(reTimer); reTimer = setTimeout(() => { reclone(true); sync(); }, 160);
      });
      mo.observe(view, { childList: true, subtree: true, characterData: true });
    }), 540);
  }


  const vmo = new MutationObserver(() => pick());
  host.querySelectorAll(':scope > .view').forEach((v) => vmo.observe(v, { attributes: true, attributeFilter: ['class'] }));
  // пока панель меняет размер (пружина ~0.5 с), кольцо-линза панели не рисуется (в софт-рендере это самый дорогой слой),
  // тело на это время растягивается до края; после остановки кольцо возвращается
  let movT = 0;
  // экономный режим включается сам, если во время анимации панели кадры дольше ~20 мс (слабый/программный рендер):
  // тогда на время пружины тело не размывается (только затемняется), размытие и кольцо возвращаются после остановки
  let econ = sessionStorage.getItem('lg-econ') === '1', fr = [], fl = 0;
  const meter = (t) => { if (fl) fr.push(t - fl); fl = t; if (hosts[0].moving) requestAnimationFrame(meter); else { fl = 0; judge(); } };
  const judge = () => { if (econ || fr.length < 8) { fr = []; return; } const a = fr.slice().sort((x, y) => x - y); const med = a[a.length >> 1]; fr = []; if (med > 20) setEcon(); };
  function setEcon() { econ = true; mirror.classList.add('lg-econ'); try { sessionStorage.setItem('lg-econ', '1'); } catch (_) {} }
  if (econ) mirror.classList.add('lg-econ');
  const setMoving = (h, on) => { if (h.moving === on) return; h.moving = on; if (on && h === hosts[0] && !econ) requestAnimationFrame(meter); h.box.classList.toggle('lg-moving', on); h.r = { x: 0, y: 0, w: 0, h: 0 }; sync(); };
  const ro = new ResizeObserver((ents) => {
    if (!view || !clonedFor) return;
    if (ents.some((e) => e.target === surface) && hosts[0].r.w) { setMoving(hosts[0], true); clearTimeout(movT); movT = setTimeout(() => setMoving(hosts[0], false), 120); }
    sync(); kick(120);
  });
  ro.observe(surface); ro.observe(fab); ro.observe(host);
  window.addEventListener('resize', () => { if (view && clonedFor) { reclone(true); sync(); } });
  for (const el of [surface.parentElement, fab]) {
    el?.addEventListener('pointerdown', () => kick(700), { passive: true });
    el?.addEventListener('pointerup', () => kick(700), { passive: true });
  }
  de.classList.add('lg-lens'); mirror.style.setProperty('--lg-kb', String(LAYERS[1].k));
  pick();
  window.__lens346 = { pick, reclone, sync, get view() { return view; }, get cloned() { return clonedFor; } };
}
