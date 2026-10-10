/* v135: марка машины → флаг страны марки (img/flags/<cc>.svg) справа от названия.
 * Страна — родина марки (бренда), не завода сборки: Chevrolet Spark (собран GM Korea) → США, Mini → Великобритания.
 * Только флаг страны (SVG из flag-icons, MIT — img/flags/LICENSE.txt). Логотипов/эмблем марок здесь нет и не добавлять.
 * Название марки — обычный текст, введённый пилотом/из каталога; используется только для определения страны.
 * Порядок важен: более длинные/специфичные шаблоны раньше (Mercedes-AMG → mercedes, Aston Martin до Martin и т.п.). */
export const COUNTRIES = {
  de: 'Германия', gb: 'Великобритания', it: 'Италия', jp: 'Япония', us: 'США', kr: 'Южная Корея',
  se: 'Швеция', cz: 'Чехия', fr: 'Франция', ro: 'Румыния', ru: 'Россия',
};
// key, title, cc, re (по названию, лат./кир.)
export const BRANDS = [
  { key: 'mercedes', title: 'Mercedes-Benz', cc: 'de', re: /mercedes|\bamg\b|\bbenz\b|мерседес|\bмерс\b|\bамг\b/i },
  { key: 'bmw', title: 'BMW', cc: 'de', re: /\bbmw\b|\bбмв\b/i },
  { key: 'porsche', title: 'Porsche', cc: 'de', re: /porsche|порше/i },
  { key: 'audi', title: 'Audi', cc: 'de', re: /\baudi\b|ауди/i },
  { key: 'volkswagen', title: 'Volkswagen', cc: 'de', re: /volkswagen|\bvw\b|фольксваген|\bфв\b/i },
  { key: 'opel', title: 'Opel', cc: 'de', re: /\bopel\b|опель/i },
  { key: 'mclaren', title: 'McLaren', cc: 'gb', re: /mc\s?laren|макларен/i },
  { key: 'astonmartin', title: 'Aston Martin', cc: 'gb', re: /aston\s?martin|астон\s?мартин/i },
  { key: 'bentley', title: 'Bentley', cc: 'gb', re: /bentley|бентли/i },
  { key: 'rollsroyce', title: 'Rolls-Royce', cc: 'gb', re: /rolls[\s-]?royce|роллс/i },
  { key: 'landrover', title: 'Land Rover', cc: 'gb', re: /land\s?rover|range\s?rover|ленд\s?ровер|рендж\s?ровер/i },
  { key: 'jaguar', title: 'Jaguar', cc: 'gb', re: /jaguar|ягуар/i },
  { key: 'mini', title: 'Mini', cc: 'gb', re: /^\s*mini\b|\bmini\s+cooper|^\s*мини\b/i },
  { key: 'lamborghini', title: 'Lamborghini', cc: 'it', re: /lamborghini|ламборгини|ламба/i },
  { key: 'ferrari', title: 'Ferrari', cc: 'it', re: /ferrari|феррари/i },
  { key: 'maserati', title: 'Maserati', cc: 'it', re: /maserati|мазерати/i },
  { key: 'alfaromeo', title: 'Alfa Romeo', cc: 'it', re: /alfa\s?romeo|альфа\s?ромео/i },
  { key: 'fiat', title: 'Fiat', cc: 'it', re: /\bfiat\b|фиат/i },
  { key: 'lexus', title: 'Lexus', cc: 'jp', re: /lexus|лексус/i },
  { key: 'toyota', title: 'Toyota', cc: 'jp', re: /toyota|тойота/i },
  { key: 'nissan', title: 'Nissan', cc: 'jp', re: /nissan|ниссан/i },
  { key: 'infiniti', title: 'Infiniti', cc: 'jp', re: /infiniti|инфинити/i },
  { key: 'honda', title: 'Honda', cc: 'jp', re: /honda|хонда/i },
  { key: 'acura', title: 'Acura', cc: 'jp', re: /acura|акура/i },
  { key: 'mazda', title: 'Mazda', cc: 'jp', re: /mazda|мазда/i },
  { key: 'subaru', title: 'Subaru', cc: 'jp', re: /subaru|субару/i },
  { key: 'mitsubishi', title: 'Mitsubishi', cc: 'jp', re: /mitsubishi|мицубиси|митсубиси/i },
  { key: 'suzuki', title: 'Suzuki', cc: 'jp', re: /suzuki|сузуки/i },
  { key: 'chevrolet', title: 'Chevrolet', cc: 'us', re: /chevrolet|\bchevy\b|шевроле|шеви/i },
  { key: 'cadillac', title: 'Cadillac', cc: 'us', re: /cadillac|кадиллак/i },
  { key: 'ford', title: 'Ford', cc: 'us', re: /\bford\b|форд/i },
  { key: 'jeep', title: 'Jeep', cc: 'us', re: /\bjeep\b|джип/i },
  { key: 'tesla', title: 'Tesla', cc: 'us', re: /tesla|тесла/i },
  { key: 'lucid', title: 'Lucid', cc: 'us', re: /\blucid\b/i },
  { key: 'kia', title: 'Kia', cc: 'kr', re: /\bkia\b|\bкиа\b/i },
  { key: 'hyundai', title: 'Hyundai', cc: 'kr', re: /hyundai|хендай|хёндай|хундай|хендэ/i },
  { key: 'volvo', title: 'Volvo', cc: 'se', re: /volvo|вольво/i },
  { key: 'polestar', title: 'Polestar', cc: 'se', re: /polestar/i },
  { key: 'koenigsegg', title: 'Koenigsegg', cc: 'se', re: /koenigsegg|кёнигсегг|кенигсегг/i },
  { key: 'skoda', title: 'Škoda', cc: 'cz', re: /[sš]koda|шкода/i },
  { key: 'renault', title: 'Renault', cc: 'fr', re: /renault|рено\b/i },
  { key: 'peugeot', title: 'Peugeot', cc: 'fr', re: /peugeot|пежо/i },
  { key: 'citroen', title: 'Citroën', cc: 'fr', re: /citro[eë]n|ситро[её]н/i },
  { key: 'bugatti', title: 'Bugatti', cc: 'fr', re: /bugatti|бугатти/i },
  { key: 'dacia', title: 'Dacia', cc: 'ro', re: /\bdacia\b/i },
  { key: 'lada', title: 'Lada', cc: 'ru', re: /\blada\b|\bлада\b|\bваз\b/i },
];
// \b в JS без флага u знает только латиницу — «лада», «мерс» не ловились. Границы слова — через \p{L}.
for (const b of BRANDS) {
  const src = b.re.source.replace(/\\b(?=[\p{L}\[(])/gu, '(?<![\\p{L}\\p{N}])').replace(/\\b/g, '(?![\\p{L}\\p{N}])');
  b.re = new RegExp(src, 'iu');
}
const BY_KEY = Object.fromEntries(BRANDS.map((b) => [b.key, b]));
export function brandByKey(k) { return BY_KEY[k] || null; }
/** Марка по названию машины (каталог или свободный текст пилота); null — не узнали (тогда ничего не рисуем). */
export function brandOf(name) {
  const s = String(name || '').slice(0, 120);
  if (!s.trim()) return null;
  for (const b of BRANDS) if (b.re.test(s)) return b;
  return null;
}
export const flagUrl = (b) => (b ? `./img/flags/${b.cc}.svg` : '');

function img(cls, src, alt) {
  const i = document.createElement('img');
  i.className = cls; i.src = src; i.alt = alt; i.decoding = 'async'; i.draggable = false;
  return i;
}
/** Строка «название · флаг». Название — textContent, ellipsis внутри; флаг не сжимается и не уезжает.
 *  opts: { tag: 'span'|'b'|'h1'… для названия, id, cls — доп. класс строки, nameCls, flag: true } */
export function carNameRow(name, opts = {}) {
  const row = document.createElement(opts.rowTag || 'span');
  row.className = 'cb-row' + (opts.cls ? ' ' + opts.cls : '');
  fillCarNameRow(row, name, opts);
  return row;
}
export function fillCarNameRow(row, name, opts = {}) {
  const b = brandOf(name);
  row.replaceChildren();
  row.dataset.brand = b ? b.key : '';
  const n = document.createElement(opts.tag || 'span');
  n.className = 'cb-name' + (opts.nameCls ? ' ' + opts.nameCls : '');
  if (opts.id) n.id = opts.id;
  n.textContent = name || '—';
  row.appendChild(n);
  if (b && opts.flag !== false) {
    const f = document.createElement('span'); f.className = 'cb-flag'; f.title = COUNTRIES[b.cc] || ''; f.setAttribute('role', 'img'); f.setAttribute('aria-label', COUNTRIES[b.cc] || '');
    f.appendChild(img('', flagUrl(b), ''));
    row.appendChild(f);
  }
  return row;
}
