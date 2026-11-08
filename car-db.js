/**
 * v220: большая база машин — Марка → Модель (по сериям/поколениям) → Версия.
 * База лениво грузится из cars-db.json (≈17 КБ gzip) только при открытии выбора; v256: настоящие эмблемы (монохромная маска), монограмма — если эмблемы нет; v2: + крутящий момент и привод.
 * Цифры (л.с., 0–100) — заводские; null = не уверены, не показываем. id версии: db.<марка>.<hash> (стабильный, проходит slug на сервере).
 * Весь текст → textContent.
 */
const LOGOS = new Set(['acura','alfaromeo','astonmartin','audi','bentley','bmw','bugatti','byd','cadillac','chery','chevrolet','cupra','dodge','ferrari','ford','geely','haval','honda','hyundai','infiniti','jaguar','jeep','kia','koenigsegg','lada','lamborghini','landrover','lexus','lixiang','lucid','maserati','mazda','mclaren','mercedes','mini','mitsubishi','nissan','opel','peugeot','polestar','porsche','ram','renault','rollsroyce','seat','skoda','subaru','tesla','toyota','volkswagen','volvo','zeekr','genesis','tank','lancia','alpine','moskvich','omoda','changan']);
/** v252: нейтральные монограммы вместо фирменных эмблем (товарные знаки не используем). */
const MONO = { bmw:'BMW', mercedes:'MB', volkswagen:'VW', alfaromeo:'AR', astonmartin:'AM', landrover:'LR', rollsroyce:'RR', mclaren:'McL', lixiang:'Li', lamborghini:'L', koenigsegg:'K', mini:'MINI', ram:'RAM', byd:'BYD', seat:'SEAT', lada:'LADA', moskvich:'М', kia:'KIA', mitsubishi:'MMC', chevrolet:'CH', cadillac:'CA', genesis:'G', infiniti:'IN', haval:'HA', changan:'CA', chery:'CH', cupra:'CU', polestar:'PS', porsche:'P', audi:'AUDI', tesla:'T' };
function monoOf(k, t) { return MONO[k] || String(t || k || '?').replace(/[^A-Za-zА-Яа-я0-9]/g, '').slice(0, 2).toUpperCase() || '?'; }
function monoEl(k, t, cls) { const w = el('span', cls + ' txt mono'); const m = monoOf(k, t); w.textContent = m; if (m.length >= 3) w.classList.add('long'); w.setAttribute('aria-hidden', 'true'); return w; }
let _db = null, _p = null, _flat = null;
export function loadCarDb() {
  if (_db) return Promise.resolve(_db);
  if (!_p) _p = fetch('./cars-db.json?v=2', { cache: 'force-cache' }).then((r) => { if (!r.ok) throw new Error('db ' + r.status); return r.json(); })
    .then((j) => { _db = j; _flat = null; return j; }).catch((e) => { _p = null; throw e; });
  return _p;
}
export function carDbReady() { return _db; }
function prefixOf(b, g) { return b.k === 'mercedes' ? (g.t === 'Mercedes-Benz' ? 'Mercedes-Benz' : 'Mercedes-AMG') : b.t; }
function chassisOf(n) { const m = n.match(/\(([^)]+)\)/); return m ? m[1] : ''; }
function baseOf(n) { return n.replace(/\s*\([^)]*\)/g, '').trim(); }
/** «BMW M3 Competition (G80)», «Porsche 911 GT3 RS (992)», «Toyota Camry 2.5 (XV70)». */
export function variantName(b, g, m, v) {
  const base = baseOf(m.n), tr = v[1], ch = chassisOf(m.n);
  const w0 = (tr.split(/\s+/)[0] || '').toLowerCase();
  const baseWords = base.toLowerCase().split(/[\s/]+/);
  let s = baseWords.includes(w0) || base.toLowerCase().startsWith(w0) ? tr : base.split(' / ')[0] + ' ' + tr;
  if (ch && !tr.includes('(')) s += ' (' + ch + ')';
  return (prefixOf(b, g) + ' ' + s).replace(/\s+/g, ' ').slice(0, 80);
}
function flat() {
  if (_flat || !_db) return _flat;
  _flat = [];
  for (const b of _db.b) for (const g of b.g) for (const m of g.m) for (const v of m.v) {
    const name = variantName(b, g, m, v);
    _flat.push({ id: v[0], name, hp: v[2], v0100: v[3], nm: v[4] ?? null, drive: m.d || null, years: m.y, b, g, m, v, hay: norm(b.t + ' ' + b.k + ' ' + name + ' ' + m.n + ' ' + (ALIAS[b.k] || '')) });
  }
  return _flat;
}
const ALIAS = { bmw: 'бмв бэха', mercedes: 'мерседес мерс амг amg benz', porsche: 'порше', audi: 'ауди', volkswagen: 'фольксваген vw фв', toyota: 'тойота', lexus: 'лексус', nissan: 'ниссан', honda: 'хонда', subaru: 'субару', mitsubishi: 'мицубиси митсубиси', ford: 'форд', chevrolet: 'шевроле', dodge: 'додж', tesla: 'тесла', lamborghini: 'ламборгини ламба', ferrari: 'феррари', mclaren: 'макларен', astonmartin: 'астон мартин', bentley: 'бентли', hyundai: 'хендай хундай хёндэ', kia: 'киа', skoda: 'шкода', cupra: 'купра', lada: 'лада ваз', mazda: 'мазда', alfaromeo: 'альфа ромео', zeekr: 'зикр', lixiang: 'лисян li auto', haval: 'хавал хавейл', chery: 'чери', geely: 'джили', byd: 'бид', exeed: 'эксид', tank: 'танк', genesis: 'генезис', infiniti: 'инфинити', maserati: 'мазерати', jaguar: 'ягуар', landrover: 'ленд ровер рендж range', renault: 'рено', mini: 'мини' };
function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[–—-]/g, ' ').replace(/[()·,]/g, ' ').replace(/\s+/g, ' '); }
export function searchCarDb(q, lim = 60) {
  const f = flat(); if (!f) return [];
  const t = norm(q).trim().split(' ').filter(Boolean); if (!t.length) return [];
  const out = [];
  for (const r of f) { if (t.every((w) => r.hay.includes(w))) { out.push(r); if (out.length >= lim) break; } }
  return out;
}
/** Синхронный поиск по id (после загрузки) — для класса/стока в топах. */
export function carDbById(id) { const f = flat(); return f ? f.find((r) => r.id === id) || null : null; }

/** v226: эмблема по имени машины («BMW M3 …» → bmw) — для карточек своих машин, без загрузки базы. */
export function brandLogoKey(name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  let k = null; for (const x of LOGOS) if (n.startsWith(x) && (!k || x.length > k.length)) k = x;
  return k;
}
export function brandLogoEl(name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  let k = null; for (const x of LOGOS) if (n.startsWith(x) && (!k || x.length > k.length)) k = x;
  return k ? emblemEl(k, 'cdb-logo') : monoEl('', name, 'cdb-logo');
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function emblemEl(k, cls) { const w = el('span', cls); const i = el('i'); i.style.setProperty('--logo', `url("./img/brands/${k}.svg")`); w.appendChild(i); w.setAttribute('aria-hidden', 'true'); return w; }
function logoEl(b, big) { const c = 'cdb-logo' + (big ? ' big' : ''); return LOGOS.has(b.k) ? emblemEl(b.k, c) : monoEl(b.k, b.t, c); }
const DRV = { RWD: 'задний', AWD: 'полный', FWD: 'передний' };
function specLine(hp, t, nm, d) { return [hp ? hp + ' л.с.' : '', nm ? nm + ' Нм' : '', d ? DRV[d] || '' : '', t ? '0–100 ' + String(t).replace('.', ',') + ' с' : ''].filter(Boolean).join(' · '); }

let sheet = null, st = null;
function ensureSheet() {
  if (sheet) return sheet;
  sheet = el('div', 'cdb-sheet hidden'); sheet.id = 'carDbSheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Выбор машины');
  sheet.innerHTML = '<div class="cdb-inner"><header class="cdb-head"><button type="button" class="cdb-back pl-x pl-back pl-inline" aria-label="Назад"></button><b class="cdb-title">Марка</b><button type="button" class="cdb-x pl-x pl-inline" aria-label="Закрыть">×</button></header>'
    + '<label class="cdb-search"><input type="search" enterkeyhint="search" autocomplete="off" placeholder="Марка, модель, кузов — например M3 G80" aria-label="Поиск машины" /></label><div class="cdb-body" role="list"></div></div>';
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeCarDb(); });
  sheet.querySelector('.cdb-x').addEventListener('click', () => closeCarDb());
  sheet.querySelector('.cdb-back').addEventListener('click', () => { if (!st) return; if (st.model) { st.model = null; render(); } else if (st.brand) { st.brand = null; render(); } else closeCarDb(); });
  const inp = sheet.querySelector('input');
  let tm = 0; inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { if (st) { st.q = inp.value; render(); } }, 90); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.classList.contains('hidden')) closeCarDb(); });
  return sheet;
}
export function closeCarDb() { if (!sheet) return; sheet.classList.add('hidden'); st = null; }
/** opts.onPick({id,name,hp,v0100,years,brand}) ; opts.onManual() — «нет в списке». */
export function openCarDb(opts = {}) {
  ensureSheet();
  st = { brand: null, model: null, q: '', onPick: opts.onPick, onManual: opts.onManual };
  sheet.querySelector('input').value = '';
  sheet.classList.remove('hidden');
  const body = sheet.querySelector('.cdb-body');
  if (!_db) { body.replaceChildren(el('p', 'cdb-empty', 'Загружаю базу…')); }
  loadCarDb().then(() => { if (st) render(); }).catch(() => { if (st) body.replaceChildren(el('p', 'cdb-empty', 'Нет сети — база не загрузилась')); });
  if (_db) render();
}
function pick(r) {
  const f = st?.onPick; closeCarDb();
  try { f?.({ id: r.id, name: r.name, hp: r.hp ?? null, v0100: r.v0100 ?? null, nm: r.nm ?? null, drive: r.drive ?? null, years: r.years, brand: r.b.t }); } catch (_) {}
}
function variantBtn(r, showBrand) {
  const b = el('button', 'cdb-row cdb-var'); b.type = 'button'; b.setAttribute('role', 'listitem');
  const l = el('span', 'cdb-l');
  if (showBrand) l.appendChild(logoEl(r.b));
  const tx = el('span', 'cdb-tx'); tx.append(el('b', '', showBrand ? r.name : r.v[1]), el('span', '', [showBrand ? r.years : '', specLine(r.hp, r.v0100, r.nm, r.drive)].filter(Boolean).join(' · ') || ' '));
  l.appendChild(tx); b.appendChild(l);
  b.addEventListener('click', () => pick(r));
  return b;
}
/* v302: фото Маги (вырезки) в строках кузова; без фото — строка как была */
const ROW_PH = { 'bmw|M3 (G80)': 'm3', 'bmw|M4 (F82/F83)': 'm4-f82', 'bmw|M5 (F10)': 'm5-f10', 'bmw|M5 (F90)': 'm5', 'bmw|M5 (G90/G99)': 'm5-g90', 'bmw|M8 (F91/F92/F93)': 'm8', 'bmw|X5 M (F95)': 'x5m-f95', 'bmw|X6 (G06)': 'x6',
  'porsche|911 (992)': '911-992-cabrio', 'mercedes|E 63 (W213)': 'e63-w213', 'mercedes|S 63 (W222/W223)': 's63-w222', 'mercedes|CLS 63 (C218)': 'cls-w218', 'mercedes|AMG GT 4-door (X290)': 'amg-gt63-4d', 'mercedes|G 63 (W463)': 'g63',
  'mercedes|GLE Coupe 63 (C292/C167)': 'gle-coupe-c167', 'mercedes|GLS 63 / Maybach (X167)': 'gls-x167', 'toyota|Camry (XV70)': 'camry-xv70', 'toyota|Land Cruiser 200 / 300': 'lc200', 'lexus|IS F': 'isf', 'lixiang|L7 / L8 / L9': 'li-l9' };
function render() {
  if (!st || !_db) return;
  const body = sheet.querySelector('.cdb-body'), title = sheet.querySelector('.cdb-title');
  sheet.querySelector('.cdb-back').classList.toggle('off', !st.brand && !st.model);
  const nodes = [];
  if (st.q.trim()) {
    title.textContent = 'Поиск';
    const res = searchCarDb(st.q, 80);
    if (!res.length) nodes.push(el('p', 'cdb-empty', 'Ничего не нашли'));
    res.forEach((r) => nodes.push(variantBtn(r, true)));
  } else if (st.model) {
    const { b, g, m } = st.model;
    title.textContent = baseOf(m.n);
    const hd = el('div', 'cdb-mhead'); hd.append(logoEl(b, true)); const t = el('span', 'cdb-tx'); t.append(el('b', '', prefixOf(b, g) + ' ' + m.n), el('span', '', m.y)); hd.appendChild(t); nodes.push(hd);
    const f = flat();
    m.v.forEach((v) => { const r = f.find((x) => x.id === v[0]); if (r) nodes.push(variantBtn(r, false)); });
  } else if (st.brand) {
    const b = st.brand; title.textContent = b.t;
    b.g.forEach((g) => {
      nodes.push(el('h4', 'cdb-grp', g.t));
      g.m.forEach((m) => {
        const row = el('button', 'cdb-row cdb-model'); row.type = 'button'; row.setAttribute('role', 'listitem');
        const tx = el('span', 'cdb-tx'); tx.append(el('b', '', m.n), el('span', '', m.y + ' · ' + m.v.length + ' ' + plural(m.v.length)));
        { const p = ROW_PH[b.k + '|' + m.n]; if (p) { const im = el('img', 'cdb-ph'); im.src = './img/cars/user/' + p + '.webp'; im.alt = ''; im.decoding = 'async'; im.loading = 'lazy'; row.classList.add('has-ph'); row.append(tx, im, el('i', 'cdb-chev')); } else row.append(tx, el('i', 'cdb-chev')); }
        row.addEventListener('click', () => { if (m.v.length === 1) { const r = flat().find((x) => x.id === m.v[0][0]); if (r) return pick(r); } st.model = { b, g, m }; render(); body.scrollTop = 0; });
        nodes.push(row);
      });
    });
  } else {
    title.textContent = 'Марка';
    const grid = el('div', 'cdb-brands');
    _db.b.forEach((b) => {
      const n = b.g.reduce((a, g) => a + g.m.length, 0);
      const t = el('button', 'cdb-brand'); t.type = 'button'; t.setAttribute('aria-label', b.t);
      t.append(logoEl(b), el('b', '', b.t), el('span', '', n + ' мод.'));
      t.addEventListener('click', () => { st.brand = b; render(); body.scrollTop = 0; });
      grid.appendChild(t);
    });
    nodes.push(grid);
  }
  if (st.onManual) { const mb = el('button', 'cdb-manual', 'Нет в списке — ввести вручную'); mb.type = 'button'; mb.addEventListener('click', () => { const f = st.onManual; closeCarDb(); f(); }); nodes.push(mb); }
  body.replaceChildren(...nodes);
}
function plural(n) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'версия' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'версии' : 'версий'; }

/** v305: фото строки кузова для варианта из БД (по id) — для карточки «Моя машина» */
export function carDbRowPhoto(id) { const r = carDbById(id); if (!r) return ''; const p = ROW_PH[r.b.k + '|' + r.m.n]; return p ? './img/cars/user/' + p + '.webp' : ''; }
