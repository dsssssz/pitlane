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
};

export const SHOP_STATUS = {
  preorder: { label: 'Предзаказ', orderable: true },
  in_stock: { label: 'В наличии', orderable: true },
  soon: { label: 'Скоро', orderable: false },
  out: { label: 'Нет в наличии', orderable: false },
};

/** Статусы заявки (меняет команда; покупатель видит их в приложении). */
export const ORDER_STATUS = {
  new: 'Заявка принята — свяжемся в Telegram',
  contacted: 'Связались с вами',
  confirmed: 'Заказ подтверждён',
  shipped: 'Отправлен',
  done: 'Получен',
  canceled: 'Отменён',
};

const IMG = (k) => ({ webp: `./img/shop/${k}-720.webp 720w, ./img/shop/${k}-1200.webp 1200w`, avif: `./img/shop/${k}-720.avif 720w, ./img/shop/${k}-1200.avif 1200w`, src: `./img/shop/${k}-720.webp` });

/** Каталог. Новый товар (корпус отдельно, кабель…) — ещё один объект с уникальным id; hidden: true — в витрине не показывать. */
export const SHOP_PRODUCTS = [
  {
    id: 'pitlane-gps',
    title: 'PITLANE GPS',
    subtitle: 'Внешний GPS 25 Гц для трека',
    // Себестоимость комплекта на 1 прибор — до 5 450 ₽ (верхняя граница BOM, hardware/pitlane-gps/docs/kit),
    // наценка 25 %: 5 450 × 1,25 = 6 812,5 → 6 800 ₽.
    price: 6800,
    status: 'preorder',
    maxQty: 5,
    gallery: [
      { ...IMG('gps-hero'), alt: 'PITLANE GPS, корпус графит' },
      { ...IMG('gps-car'), alt: 'На торпеде у лобового стекла' },
      { ...IMG('gps-exploded'), alt: 'Разнесённый вид: корпус, платы, световод' },
      { ...IMG('gps-section'), alt: 'Разрез: антенна смотрит в небо' },
      { ...IMG('gps-top'), alt: 'Вид сверху' },
    ],
    specs: [
      ['Приёмник', 'u-blox NEO-M9N, 25 Гц'],
      ['Системы', 'GPS · ГЛОНАСС · Galileo · BeiDou'],
      ['Связь', 'iPhone — Wi-Fi через режим модема; Android — Bluetooth или Wi-Fi'],
      ['Зачёт', 'топ A/B (внешний GPS от 10 Гц); класс зависит от сигнала в заезде'],
      ['Live', 'скорость и отсечки 100 / 200 / 300 в приложении'],
      ['Питание', 'USB от машины, без аккумулятора'],
      ['Крепление', 'магниты в корпусе + пластина на 3M'],
      ['Корпус', '76 × 46 × 15 мм, ASA графит'],
    ],
    inBox: ['Прибор PITLANE GPS', 'ЗУ в прикуриватель (USB-A)', 'Кабель USB-A → USB-C, 1 м, угловой', 'Металлическая пластина на 3M'],
    notes: [
      'Только для треков и закрытых площадок. На дорогах общего пользования — соблюдайте ПДД.',
      'Антенне нужно небо: торпеда у лобового стекла; атермальное стекло может мешать.',
      'Первый холодный старт под открытым небом — до минуты.',
    ],
  },
  // Пример будущих товаров (раскомментировать и добавить картинки в img/shop/):
  // { id: 'pitlane-gps-case', title: 'Корпус PITLANE GPS', subtitle: 'ASA графит, без электроники', price: null, status: 'soon', maxQty: 5, gallery: [], specs: [], inBox: [], notes: [] },
  // { id: 'usb-cable-90', title: 'Кабель USB-A → USB-C 90°', subtitle: '1 м, с передачей данных', price: null, status: 'soon', maxQty: 5, gallery: [], specs: [], inBox: [], notes: [] },
];

export const productById = (id) => SHOP_PRODUCTS.find((p) => p.id === id) || null;
export const visibleProducts = () => SHOP_PRODUCTS.filter((p) => !p.hidden);
export const statusOf = (p) => SHOP_STATUS[p && p.status] || SHOP_STATUS.preorder;
export const orderable = (p) => !!p && !p.hidden && statusOf(p).orderable;
export const fmtRub = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0₽';
/** «6 800 ₽ · Предзаказ» / «Цена по запросу · Предзаказ» */
export const priceLine = (p) => (Number.isFinite(p?.price) && p.price > 0 ? fmtRub(p.price) : 'Цена по запросу') + ' · ' + statusOf(p).label;
export const orderTotal = (p, qty) => (Number.isFinite(p?.price) && p.price > 0 ? p.price * qty : null);
