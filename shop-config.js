/**
 * v137: магазин PITLANE — единый конфиг для Mini App и Worker (worker/src/shop.js импортирует этот же файл).
 *
 * ЦЕНА МЕНЯЕТСЯ ЗДЕСЬ: SHOP_PRODUCTS[…].price (рубли, целое; null → «Цена по запросу»).
 * Статус наличия — SHOP_PRODUCTS[…].status: 'preorder' | 'in_stock' | 'soon' | 'out' (по умолчанию «Предзаказ»).
 * После правки: поднять CACHE в sw.js, задеплоить Worker (сумма в заявке боту считается на сервере по этой цене).
 *
 * Онлайн-оплаты пока НЕТ (нет реквизитов/оферты для товаров): «Заказать» = заявка, связь в Telegram.
 * Подключить оплату позже: SHOP_CONFIG.payments = true + заполненный legal-config.js (legalReady)
 * + провайдер в worker/src/shop.js (место помечено «PAYMENTS»). Пока флаг false — кнопка оплаты не появится.
 */
export const SHOP_CONFIG = {
  enabled: true,
  currency: 'RUB',
  payments: false,           // онлайн-оплата (см. выше); false → только заявка
  orderTtlDays: 365,         // сколько хранится заявка (и удаляется вместе с аккаунтом раньше)
  contactBot: 'pitlane_official_bot',
  // v222: «Основатели». false → чип не заказать, цена с подписью «Скоро · после проверки точности».
  // Открыть продажи: true → поднять CACHE в sw.js → задеплоить сайт и Worker.
  foundersOpen: false,
};

/** v222: первые FOUNDERS.limit заявок на чип (не отменённых, считает сервер по KV) — цена FOUNDERS.price за 1 шт. */
export const FOUNDERS = { productId: 'pitlane-gps', limit: 50, price: 6800 };
/** Заявки в этих статусах = заказ подтверждён → значок «Основатель». */
export const FOUNDER_CONFIRMED = ['paid', 'accepted', 'assembling', 'shipped', 'delivered', 'confirmed', 'done'];
/** Цена за 1-ю шт. для основателя, остальные — по обычной цене. */
export const founderTotal = (p, qty) => FOUNDERS.price + (qty - 1) * p.price;

export const SHOP_STATUS = {
  preorder: { label: 'Предзаказ', orderable: true },
  in_stock: { label: 'В наличии', orderable: true },
  soon: { label: 'Скоро', orderable: false },
  out: { label: 'Нет в наличии', orderable: false },
};

/** Статусы заказа (меняет Мага кнопками в боте; покупатель получает уведомление и видит статус в приложении и в боте). v182 */
export const ORDER_STATUS = {
  new: 'Заявка принята — свяжемся в Telegram',
  paid: 'Оплачен',
  accepted: 'Принят',
  assembling: 'Собирается',
  shipped: 'Передан в доставку',
  delivered: 'Доставлен',
  canceled: 'Отменён',
  // старые статусы (до v182) — только чтобы показывать прежние заявки
  contacted: 'Связались с вами',
  confirmed: 'Заказ подтверждён',
  done: 'Доставлен',
};
/** Кнопки администратора в боте — порядок как на экране. */
export const ORDER_ADMIN_STATUSES = ['accepted', 'paid', 'assembling', 'shipped', 'delivered', 'canceled'];
/** Коротко — для списков. */
export const ORDER_SHORT = { new: 'Новая', paid: 'Оплачен', accepted: 'Принят', assembling: 'Собирается', shipped: 'Отправлен', delivered: 'Доставлен', canceled: 'Отменён', contacted: 'На связи', confirmed: 'Подтверждён', done: 'Доставлен' };

const IMG = (k) => ({ webp: `./img/shop/${k}-720.webp 720w, ./img/shop/${k}-1200.webp 1200w`, avif: `./img/shop/${k}-720.avif 720w, ./img/shop/${k}-1200.avif 1200w`, src: `./img/shop/${k}-720.webp` });

/** Каталог. Новый товар (корпус отдельно, кабель…) — ещё один объект с уникальным id; hidden: true — в витрине не показывать. */
export const SHOP_PRODUCTS = [
  {
    id: 'pitlane-gps',
    cat: 'chips',
    title: 'PITLANE GPS',
    subtitle: 'Внешний GPS 25 Гц для трека',
    // Себестоимость комплекта на 1 прибор — до 5 450 ₽ (верхняя граница BOM, hardware/pitlane-gps/docs/kit),
    // наценка 25 %: 5 450 × 1,25 = 6 812,5 → 6 800 ₽.
    price: 8499,  // v222: обычная цена; основателям — FOUNDERS.price
    status: 'preorder',
    maxQty: 5,
    gallery: [
      { ...IMG('gps-hand'), alt: 'PITLANE GPS в руке, корпус чёрный' },
      { ...IMG('gps-hero'), alt: 'PITLANE GPS, корпус чёрный' },
      { ...IMG('gps-car'), alt: 'На торпеде у лобового стекла' },
      { ...IMG('gps-top'), alt: 'Вид сверху' },
    ],
    specs: [
      ['Частота', 'до 25 Гц'],
      ['Спутники', 'GPS / ГЛОНАСС / Galileo / BeiDou'],
      ['Связь', 'Wi-Fi и Bluetooth'],
      ['Зачёт', 'топ A/B, класс — по сигналу'],
      ['Live', 'скорость и отсечки 100 / 200 / 300 в приложении'],
      ['Питание', 'USB-C, кабель и блок не входят'],
      ['Крепление', 'магнитное, пластина на 3M'],
      ['Корпус', '76 × 46 × 15 мм, ASA чёрный'],
      ['Гарантия', '12 месяцев'],
      ['Срок службы', '3 года'],
      ['Возврат', '7 дней после получения'],
      ['Изготовитель', 'самозанятый Адилханян А. А., ИНН 237004447478, г. Краснодар'],
    ],
    inBox: ['Прибор PITLANE GPS', 'Металлическая пластина на 3M'],
    notes: [
      'Ставьте у лобового стекла. Атермальное стекло мешает.',
      'Первый старт — до минуты под открытым небом.',
    ],
    footnote: 'Замеры — на треках и закрытых площадках.',
  },
  // v226 (Shop v2): аксессуары с ценами из макета. status 'soon' — пока нет подтверждённого остатка:
  // видны в каталоге с ценой, но в корзину не кладутся. Открыть продажу — status: 'in_stock' (или 'preorder').
  {
    id: 'pitlane-suction', cat: 'mounts',
    title: 'Присоска на стекло',
    subtitle: 'Держатель на лобовое стекло под PITLANE GPS',
    price: 990, status: 'soon', maxQty: 5,
    gallery: [], placeholder: true,
    specs: [['Крепление', 'вакуумная присоска с рычагом'], ['Совместимость', 'PITLANE GPS (магнитная пластина)']],
    inBox: ['Присоска с площадкой', 'Стальная пластина'],
    notes: ['Ближе к верху стекла.'],
  },
  {
    id: 'pitlane-mount', cat: 'mounts',
    title: 'Магнитный держатель',
    subtitle: 'Пластина на 3M + магниты для торпеды',
    price: 790, status: 'soon', maxQty: 5,
    gallery: [], placeholder: true,
    specs: [['Крепление', 'магнитное, стальная пластина'], ['Клей', '3M VHB'], ['Совместимость', 'корпус PITLANE GPS']],
    inBox: ['Стальная пластина на 3M — 2 шт.', 'Магниты — 4 шт.'],
    notes: ['На обезжиренную поверхность, 24 ч до нагрузки.'],
  },
  {
    id: 'usb-c-cable', cat: 'acc',
    title: 'Кабель USB-C 1,5 м',
    subtitle: 'Питание чипа от прикуривателя или пауэрбанка',
    price: 490, status: 'soon', maxQty: 5,
    gallery: [], placeholder: true,
    specs: [['Длина', '1,5 м'], ['Разъёмы', 'USB-A → USB-C']],
    inBox: ['Кабель'], notes: [],
  },
  {
    id: 'pitlane-gps-case', cat: 'acc',
    title: 'Кейс для чипа',
    subtitle: 'Жёсткий кейс для хранения и перевозки',
    price: 690, status: 'soon', maxQty: 5,
    gallery: [], placeholder: true,
    specs: [['Для', 'PITLANE GPS + кабель']],
    inBox: ['Кейс'], notes: [],
  },
];

/** v144: подписки — только витрина «Скоро», без оплаты и без заявки. */
export const SHOP_SUBS = [
  { id: 'sub-analytics', title: 'Расширенная аналитика', subtitle: 'Разбор кругов, сравнение с топом, вся история', status: 'soon' },
  { id: 'sub-tracks', title: 'Дополнительные трассы', subtitle: 'Новые трассы, конфигурации и секторы', status: 'soon' },
];

export const productById = (id) => SHOP_PRODUCTS.find((p) => p.id === id) || null;
export const visibleProducts = () => SHOP_PRODUCTS.filter((p) => !p.hidden);
export const statusOf = (p) => SHOP_STATUS[p && p.status] || SHOP_STATUS.preorder;
/** v222: чип закрыт до проверки точности (SHOP_CONFIG.foundersOpen). */
export const gated = (p) => !!p && p.id === FOUNDERS.productId && !SHOP_CONFIG.foundersOpen;
export const orderable = (p) => !!p && !p.hidden && !gated(p) && statusOf(p).orderable;
export const fmtRub = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0₽';
/** «6 800 ₽ · Предзаказ» / «Цена по запросу · Предзаказ» */
export const priceLine = (p) => (Number.isFinite(p?.price) && p.price > 0 ? fmtRub(p.price) : 'Цена по запросу') + ' · ' + statusOf(p).label;
export const orderTotal = (p, qty) => (Number.isFinite(p?.price) && p.price > 0 ? p.price * qty : null);

/* ——— v226 Shop v2: категории, доставка, оплата, корзина ——— */
export const SHOP_CATS = [['all', 'Все'], ['chips', 'Чипы'], ['mounts', 'Крепления'], ['acc', 'Аксессуары']];
/** Доставка: цена в рублях добавляется к заказу на сервере. */
export const SHOP_DELIVERY = [
  { id: 'cdek', title: 'СДЭК · пункт выдачи', short: 'СДЭК', eta: '2–4 дня', price: 390, addr: 'Город и адрес пункта СДЭК' },
  { id: 'post', title: 'Почта России', short: 'Почта', eta: '5–9 дней', price: 290, addr: 'Индекс и адрес' },
  { id: 'pickup', title: 'Самовывоз · Краснодар', short: 'Самовывоз', eta: 'договоримся о времени', price: 0, addr: '' },
];
export const deliveryById = (id) => SHOP_DELIVERY.find((d) => d.id === id) || null;
/** Способы оплаты (страница Robokassa). Пока payments=false — кнопки «Скоро», заказ уходит заявкой. */
export const SHOP_PAY_METHODS = [
  { id: 'sbp', title: 'СБП', sub: 'по QR или в приложении банка' },
  { id: 'card', title: 'Карта', sub: 'МИР · Visa · Mastercard' },
];
export const PAY_BADGES = ['СБП', 'МИР', 'VISA', 'MC', 'SberPay', 'T-Pay'];
export const MAX_CART_LINES = 6;
/** Трек-ссылка по службе доставки. */
export const trackUrl = (dl, track) => !track ? null : dl === 'post' ? 'https://www.pochta.ru/tracking?barcode=' + encodeURIComponent(track) : 'https://www.cdek.ru/ru/tracking?order_id=' + encodeURIComponent(track);
/** Сумма строки: чип у основателя — 1-я шт. по FOUNDERS.price. */
export const lineTotal = (p, qty, founder) => (founder && p.id === FOUNDERS.productId ? founderTotal(p, qty) : orderTotal(p, qty));
/** Итог корзины: { subtotal, delivery, off, total } (null-цены → subtotal null). */
export function cartTotals(lines, dlId, off = 0) {
  let sub = 0;
  for (const l of lines) { const t = lineTotal(l.p, l.qty, l.founder); if (t == null) { sub = null; break; } sub += t; }
  const dl = deliveryById(dlId); const dp = dl ? dl.price : 0;
  const o = sub == null ? 0 : Math.max(0, Math.min(off || 0, sub));
  return { subtotal: sub, delivery: dp, off: o, total: sub == null ? null : sub - o + dp };
}
