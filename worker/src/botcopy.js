/**
 * Bot copy (после v98): тексты чата @pitlane_official_bot — коротко, уверенно, без шума.
 * HTML parse_mode, <b>заголовки</b>, <code>время</code>, тонкий разделитель, максимум 1 эмодзи на сообщение.
 * Весь пользовательский текст (имена команд/пилотов, машины, резина) — только через esc().
 * Чистые функции: без KV и сети (легко тестировать и показывать превью).
 */
export const APP_URL = 'https://dsssssz.github.io/pitlane/';
export const RULE = '───────────────';

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

/* ——— /start ——— */
export const START_CAPTION =
  '<b>PITLANE</b>\n' +
  'Замеры, круги, топы и дуэли — в приложении. Бот только помогает:\n' +
  RULE + '\n' +
  '<b>Вход.</b> Открой PITLANE отсюда — Telegram подтвердит аккаунт сам, без SMS и паролей.\n' +
  '<b>Ссылки.</b> Дуэли, команды и результаты друзей открываются прямо отсюда.\n' +
  '<b>«Тебя вызвали».</b> Сообщу, когда соперник проехал свою попытку.\n' +
  '<b>Карточки.</b> Поделиться временем — кнопкой в приложении.\n' +
  RULE + '\n' +
  'Только закрытые площадки и треки.';

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
      'Закрытая часть: дуэли кругов одного трека и топ по связке модель + резина. Открой приглашение — и ты внутри.';
  }
  if (kind === 'team') return '<b>Команда' + (name ? ' ' + name : '') + '</b>\nПрофиль, состав и лента новостей. Попроситься можно со страницы команды.';
  if (kind === 'duel') return '<b>Тебя вызвали</b>\nОдин на один, 7 дней. В зачёт — проверенный сервером заезд GPS A/B; спринты — только с внешним приёмником. Открой дуэль.';
  if (kind === 'crew') return '<b>Приглашение в экипаж</b>\nОткрой его кнопкой ниже.';
  if (kind === 's' || kind === 'lap' || kind === 'run') return '<b>С тобой поделились результатом</b>\nОткрой — там время, сектора и точность GPS.';
  if (kind === 'track') return '<b>Трасса</b>\nСхема, рекорды и старт круга.';
  if (kind === 'tops') return '<b>Топ</b>\nЛучшие честные заезды.';
  return '';
}

/* ——— команды (v109: бот = вход, ссылки, «тебя вызвали», карточки; остальное — в приложении) ——— */
export const BOT_TEXT = {
  login:
    '<b>Вход</b>\n' +
    'Открой PITLANE кнопкой ниже — Telegram подтвердит аккаунт сам. После входа результаты идут в топ (после проверки сервером), а дуэли и команды привязываются к тебе.',
  help:
    '<b>Что умеет бот</b>\n' +
    RULE + '\n' +
    '<b>Вход</b> — /login или кнопка «Открыть PITLANE».\n' +
    '<b>Ссылки</b> — приглашения в дуэль и команду, карточки результатов открываются отсюда.\n' +
    '<b>«Тебя вызвали»</b> — сообщение, когда соперник проехал свою попытку в дуэли.\n' +
    '<b>Карточки</b> — «Поделиться» на экране результата.\n' +
    RULE + '\n' +
    'Замеры, круги, гараж и топы — в приложении. Только закрытые площадки и треки.',
  app: 'Это теперь в приложении — открой PITLANE кнопкой ниже.',
  music:
    '<b>Музыка в профиле</b>\n' +
    RULE + '\n' +
    'Перешли сюда аудио (или отправь файл-песню) — он появится в твоём профиле PITLANE. До 3 треков, файл до 20 МБ.\n' +
    'Сначала войди в PITLANE через Telegram. Порядок и удаление — в приложении: Профиль → Музыка.',
  other: 'Бот отвечает за вход, ссылки, «тебя вызвали» и карточки. Остальное — в приложении: /help.',
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
  { command: 'start', description: 'Открыть PITLANE' },
  { command: 'login', description: 'Войти через Telegram' },
  { command: 'help', description: 'Что умеет бот' },
];
export const BOT_DESCRIPTION =
  'PITLANE — разгоны и круги по GPS с проверкой на сервере, честные топы и дуэли.\n\n' +
  'Бот: вход в приложение через Telegram, ссылки на дуэли, команды и результаты, уведомление «тебя вызвали», карточки результатов.\n\n' +
  'Только закрытые площадки и треки.';
export const BOT_SHORT_DESCRIPTION = 'Вход в PITLANE, ссылки на дуэли и результаты, «тебя вызвали». Замеры — в приложении.';

/* ——— оплата сезона ——— */
export const PAY = {
  title: 'Сезон команды',
  description: (name, days) => `«${name}» · ${days} дней без лимитов: круги, дуэли, топ. Одна оплата — доступ у всей команды.`.slice(0, 255),
  label: (days) => `Сезон · ${days} дней`,
  errStale: 'Счёт устарел. Открой оплату заново в PITLANE.',
  errPrice: 'Цена сезона изменилась. Открой оплату заново.',
  errRoom: 'Команда не найдена.',
  errMember: 'Оплатить сезон может только участник команды. Войди в PITLANE через Telegram.',
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
      '<b>Тебя вызвали</b>\n' +
      'Соперник: ' + esc(rivalName) + (trackId ? ' · ' + esc(trackTitle(trackId)) : '') + '\n' +
      RULE + '\n' +
      'Время соперника  ' + code(t) + '\n' +
      'Твой ход.',
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
      'Ты  ' + code(myT) + '\n' +
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
