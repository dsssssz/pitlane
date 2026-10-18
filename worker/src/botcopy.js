/**
 * Bot copy (после v98): тексты чата @pitlane_official_bot — коротко, уверенно, без шума.
 * HTML parse_mode, <b>заголовки</b>, <code>время</code>, тонкий разделитель, максимум 1 эмодзи на сообщение.
 * Весь пользовательский текст (имена команд/пилотов, машины, резина) — только через esc().
 * Чистые функции: без KV и сети (легко тестировать и показывать превью).
 */
export const APP_URL = 'https://dsssssz.github.io/pitlane/';
export const RULE = '───────────────';
/** Баннер бота (/start и главное меню). ?v= меняется вместе с картинкой — Telegram кэширует по URL. */
export const TG_BANNER_URL = APP_URL + 'img/tg/banner.jpg?v=3';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
export const code = (s) => '<code>' + esc(s) + '</code>';
export const b = (s) => '<b>' + esc(s) + '</b>';

export function appUrl(params) {
  const q = new URLSearchParams(params || {}).toString();
  return APP_URL + (q ? '?' + q : '');
}
export const webAppBtn = (text, params) => ({ text, web_app: { url: appUrl(params) } });

const TRACKS = {
  sochi: 'Сочи Автодром', moscow: 'Moscow Raceway', igora: 'Игора Драйв', kazan: 'Казань Ринг', smolensk: 'Смоленское кольцо',
  nring: 'NRING', adm: 'ADM Raceway', grozny: 'Fort Grozny', redring: 'Красное Кольцо',
};
export const trackTitle = (id) => TRACKS[id] || String(id || '');
export function fmtGap(ms) {
  const n = Number(ms);
  return Number.isFinite(n) ? (Math.abs(n) / 1000).toFixed(3) : '';
}

/* ——— /start ——— (v182: тон «вы», коротко; магазин и заказы — кнопками меню) */
export const START_CAPTION =
  '<b>PITLANE</b>\n' +
  'Разгоны и круги по GPS с проверкой на сервере, честные топы и дуэли.\n' +
  RULE + '\n' +
  '<b>Приложение</b> открывается кнопкой ниже — вход через Telegram, без SMS и паролей.\n' +
  '<b>PITLANE GPS</b> — внешний приёмник 25 Гц для зачёта A/B. Предзаказ — прямо в этом чате.\n' +
  '<b>Уведомления</b> — только ваши события: вызов на дуэль, обгон в топе, статус заказа. Выключить — /stop_notify.\n' +
  RULE + '\n' +
  'Только треки и закрытые площадки.';

/** Совместимость (до v182): теперь клавиатура /start — botshop.mainMenuRows(). */
export function startKeyboard(param) {
  return [
    [webAppBtn(param ? 'Открыть ссылку' : 'Открыть PITLANE', param ? { startapp: param } : {})],
    [webAppBtn('Войти', { view: 'account', skipIntro: '1' })],
  ];
}

/** Line under /start for shared deep links. info = optional { name, members } looked up by the caller. */
export function startPayloadLine(param, info) {
  const kind = String(param).split('_')[0];
  const name = info && info.name ? '«' + esc(info.name) + '»' : '';
  if (kind === 'room') {
    return '<b>Приглашение в команду</b>\n' +
      (name ? name + (info.members ? ' · ' + info.members + ' в составе' : '') + '\n' : '') +
      'Закрытая часть: дуэли кругов одного трека и топ по связке модель + резина. Откройте приглашение — и вы в команде.';
  }
  if (kind === 'team') return '<b>Команда' + (name ? ' ' + name : '') + '</b>\nПрофиль, состав и лента новостей. Попроситься можно со страницы команды.';
  if (kind === 'duel') return '<b>Вас вызвали</b>\nОдин на один, 7 дней. В зачёт — проверенный сервером заезд GPS A/B; спринты — только с внешним приёмником. Откройте дуэль.';
  if (kind === 'crew') return '<b>Приглашение в экипаж</b>\nОткройте его кнопкой ниже.';
  if (kind === 's' || kind === 'lap' || kind === 'run') return '<b>С вами поделились результатом</b>\nОткройте — там время, сектора и точность GPS.';
  if (kind === 'track') return '<b>Трасса</b>\nСхема, рекорды и старт круга.';
  if (kind === 'tops') return '<b>Топ</b>\nЛучшие честные заезды.';
  return '';
}

/* ——— команды (v109: бот = вход, ссылки, «тебя вызвали», карточки; остальное — в приложении) ——— */
export const BOT_TEXT = {
  login:
    '<b>Вход</b>\n' +
    'Откройте PITLANE кнопкой ниже — Telegram подтвердит аккаунт сам. После входа результаты идут в топ (после проверки сервером), дуэли и команды привязаны к вашему аккаунту.',
  help:
    '<b>Что умеет бот</b>\n' +
    RULE + '\n' +
    '<b>Магазин</b> — PITLANE GPS и аксессуары, предзаказ в чате: /shop.\n' +
    '<b>Заказы</b> — статусы ваших заказов: /orders.\n' +
    '<b>Вход и ссылки</b> — приложение, дуэли, команды и результаты открываются отсюда.\n' +
    '<b>Уведомления</b> — только ваши события, не больше 5 в сутки. Выключить — /stop_notify.\n' +
    RULE + '\n' +
    'Замеры, круги, гараж и топы — в приложении.',
  app: 'Этот раздел — в приложении. Откройте PITLANE кнопкой ниже.',
  music:
    '<b>Музыка в профиле</b>\n' +
    RULE + '\n' +
    'Перешлите сюда аудио (или отправьте файл-песню) — он появится в вашем профиле PITLANE. До 3 треков, файл до 20 МБ.\n' +
    'Сначала войдите в PITLANE через Telegram. Порядок и удаление — в приложении: Профиль → Музыка.',
  other: 'Не распознал сообщение. Выберите раздел в меню — /start, или откройте вопросы и поддержку — /help.',
};

export function simpleRoutes() {
  const open = (label, params) => [BOT_TEXT.app, [webAppBtn(label, params)]];
  return {
    login: [BOT_TEXT.login, [webAppBtn('Открыть PITLANE и войти', { view: 'account', skipIntro: '1' })]],
    help: [BOT_TEXT.help, [webAppBtn('Открыть PITLANE', {})]],
    // старые команды из меню (до v109) — не ломаем, просто ведём в приложение
    garage: open('Гараж', { view: 'garage', skipIntro: '1' }),
    car: open('Гараж', { view: 'garage', skipIntro: '1' }),
    team: open('Команды', { screen: 'teams' }),
    room: open('Команды', { screen: 'teams' }),
    duel: open('Дуэли', { screen: 'duel' }),
    tops: open('Топ', { view: 'tops', skipIntro: '1' }),
    feedback: open('Обратная связь', { screen: 'feedback' }),
  };
}

export const BOT_COMMANDS = [
  { command: 'start', description: 'Главное меню' },
  { command: 'shop', description: 'Магазин и PITLANE GPS' },
  { command: 'orders', description: 'Мои заказы' },
  { command: 'chip', description: 'Как работает чип' },
  { command: 'help', description: 'Вопросы и поддержка' },
  { command: 'stop_notify', description: 'Выключить уведомления' },
];
export const BOT_DESCRIPTION =
  'PITLANE — разгоны и круги по GPS с проверкой на сервере, честные топы и дуэли.\n\n' +
  'В боте: вход в приложение через Telegram, PITLANE GPS (внешний приёмник 25 Гц) с предзаказом в чате, статусы заказов, ссылки на дуэли и результаты, вопросы и поддержка.\n\n' +
  'Только треки и закрытые площадки.';
export const BOT_SHORT_DESCRIPTION = 'Вход в PITLANE, PITLANE GPS с предзаказом в чате, статусы заказов, дуэли и поддержка.';

/* ——— оплата сезона ——— */
export const PAY = {
  title: 'Сезон команды',
  description: (name, days) => `«${name}» · ${days} дней без лимитов: круги, дуэли, топ. Одна оплата — доступ у всей команды.`.slice(0, 255),
  label: (days) => `Сезон · ${days} дней`,
  errStale: 'Счёт устарел. Откройте оплату заново в PITLANE.',
  errPrice: 'Цена сезона изменилась. Откройте оплату заново.',
  errRoom: 'Команда не найдена.',
  errMember: 'Оплатить сезон может только участник команды. Войдите в PITLANE через Telegram.',
};
export function msgSeasonPaid({ name, until, roomId }) {
  return {
    text:
      '<b>Сезон оплачен</b>\n' +
      '«' + esc(name) + '» · до ' + code(until) + '\n' +
      RULE + '\n' +
      'Доступ открыт всей команде: новые круги, дуэли и топ — без лимитов.',
    keyboard: [[webAppBtn('Открыть команду', { team: roomId })]],
  };
}

/* ——— уведомления ——— */
export function msgRoomBest({ teamName, roomId, nick, t, trackId, model, tyre, prevNick, delta }) {
  return {
    text:
      '<b>Новый лучший круг команды</b>\n' +
      '«' + esc(teamName) + '» · ' + esc(trackTitle(trackId)) + '\n' +
      RULE + '\n' +
      esc(nick) + '  ' + code(t) + '\n' +
      esc(model) + ' · ' + esc(tyre) +
      (prevNick && Number.isFinite(Number(delta)) ? '\nПрежний рекорд: ' + esc(prevNick) + '  ' + code('−' + fmtGap(delta)) : ''),
    keyboard: [[webAppBtn('Открыть команду', { team: roomId })]],
  };
}
export function msgDuelAccepted({ duelId, rivalName, t, trackId }) {
  return {
    text:
      '<b>Ответили на вашу дуэль</b>\n' +
      'Соперник: ' + esc(rivalName) + (trackId ? ' · ' + esc(trackTitle(trackId)) : '') + '\n' +
      RULE + '\n' +
      'Время соперника  ' + code(t) + '\n' +
      'Ваш ход.',
    keyboard: [[webAppBtn('Открыть дуэль', { startapp: 'duel_' + duelId })]],
  };
}
export function msgDuelResult({ duelId, won, tie, myT, rivalName, rivalT, delta, trackId }) {
  const head = tie ? 'Дуэль: ничья' : won ? 'Дуэль выиграна' : 'Дуэль проиграна';
  return {
    text:
      '<b>' + head + '</b>\n' +
      'Соперник: ' + esc(rivalName) + (trackId ? ' · ' + esc(trackTitle(trackId)) : '') + '\n' +
      RULE + '\n' +
      'Вы  ' + code(myT) + '\n' +
      esc(rivalName) + '  ' + code(rivalT) +
      (!tie && Number.isFinite(Number(delta)) ? '\nРазница  ' + code(fmtGap(delta)) : ''),
    keyboard: [[webAppBtn('Открыть дуэль', { startapp: 'duel_' + duelId })]],
  };
}

/* ——— обратная связь (владельцу) ——— */
export function msgFeedbackOwner({ typeLabel, text, contact, nick, account, diagLine, ua, key }) {
  const out = (
    '<b>Обратная связь · ' + esc(typeLabel) + '</b>\n' +
    RULE + '\n' +
    esc(text) + '\n' +
    RULE + '\n' +
    'Контакт: ' + esc(contact || '—') + '\n' +
    'Пилот: ' + esc(nick || '—') + (account ? ' · ' + code(account) : ' · гость') + '\n' +
    '<i>' + esc(diagLine) + '</i>\n' +
    '<i>' + esc(ua) + '</i>\n' +
    'KV ' + code(key)
  );
  return out.length <= 4000 ? out : ''; // never cut HTML mid-tag: caller falls back to plain text
}
