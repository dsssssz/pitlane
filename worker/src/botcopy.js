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
  'Телеметрия трека — прямо в Telegram.\n' +
  RULE + '\n' +
  '<b>Круг.</b> Время и сектора по GPS, с честной оценкой точности.\n' +
  '<b>Команда.</b> Дуэли одного трека и топ для своих.\n' +
  '<b>Гараж.</b> Твоя машина и резина — в каждом круге.\n' +
  RULE + '\n' +
  'Только закрытые площадки и треки.';

export function startKeyboard(param) {
  return [
    [webAppBtn(param ? 'Открыть приглашение' : 'Открыть PITLANE', param ? { startapp: param } : {})],
    [webAppBtn('Круг', { view: 'lap', skipIntro: '1' }), webAppBtn('Команда', { screen: 'teams' })],
    [webAppBtn('Гараж', { view: 'garage', skipIntro: '1' }), webAppBtn('Топ', { view: 'tops', skipIntro: '1' })],
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
  if (kind === 'duel') return '<b>Тебе бросили вызов</b>\nОдин на один, лучший GPS-заезд. Открой дуэль и выбери время.';
  if (kind === 'crew') return '<b>Приглашение в экипаж</b>\nОткрой его кнопкой ниже.';
  if (kind === 's' || kind === 'lap' || kind === 'run') return '<b>С тобой поделились результатом</b>\nОткрой — там время, сектора и точность GPS.';
  if (kind === 'track') return '<b>Трасса</b>\nСхема, рекорды и старт круга.';
  if (kind === 'tops') return '<b>Топ</b>\nЛучшие честные заезды.';
  return '';
}

/* ——— команды меню ——— */
export const BOT_TEXT = {
  garage:
    '<b>Гараж</b>\n' +
    'Активная машина и резина. К ним навсегда привязывается каждый сохранённый круг.\n' +
    RULE + '\n' +
    'Без активной машины круг в зачёт не идёт.',
  team:
    '<b>Команда</b>\n' +
    'Публичная страница с лентой — и закрытая часть для своих: дуэли одного трека, топ по модели и резине.\n' +
    RULE + '\n' +
    'Бесплатно: 3 сессии и 1 трек. Дальше команда оплачивает сезон — одна оплата на всех.',
  duel:
    '<b>Дуэль</b>\n' +
    'Один на один. Лучший GPS-заезд за 7 дней, в зачёте только точность A/B.\n' +
    RULE + '\n' +
    'Создай вызов и отправь ссылку сопернику.',
  tops:
    '<b>Топ</b>\n' +
    'Лучшие круги и сектора автодромов России.\n' +
    RULE + '\n' +
    'Только честные заезды: GPS класса A/B, старт и финиш по створу.',
  feedback:
    '<b>Обратная связь</b>\n' +
    'Ошибка или идея — напиши прямо в приложении. Скриншот приложится сам, если захочешь.',
  help:
    '<b>Как это работает</b>\n' +
    RULE + '\n' +
    '<b>1.</b> Гараж → выбери машину и резину, отметь «Это моя машина».\n' +
    '<b>2.</b> Круг → выбери автодром. Старт и финиш ловятся по GPS сами.\n' +
    '<b>3.</b> Команда → позови своих по ссылке: дуэли и топ внутри.\n' +
    '<b>4.</b> Войди через Telegram в профиле — результаты сохранятся.\n' +
    RULE + '\n' +
    '/garage · /team · /duel · /tops\n' +
    'Только закрытые площадки и треки.',
  other: 'Такой команды нет. Всё нужное — в меню слева или в /help.',
};

export function simpleRoutes() {
  const garage = [BOT_TEXT.garage, [webAppBtn('Гараж', { view: 'garage', skipIntro: '1' }), webAppBtn('Это моя машина', { screen: 'mycar' })]];
  const team = [BOT_TEXT.team, [webAppBtn('Команды', { screen: 'teams' }), webAppBtn('Моя команда', { screen: 'rooms' })]];
  return {
    garage,
    car: garage, // старое /car
    team,
    room: team, // старое /room
    duel: [BOT_TEXT.duel, [webAppBtn('Создать вызов', { screen: 'duel' })]],
    tops: [BOT_TEXT.tops, [webAppBtn('Открыть топ', { view: 'tops', skipIntro: '1' })]],
    feedback: [BOT_TEXT.feedback, [webAppBtn('Написать', { screen: 'feedback' })]],
    help: [BOT_TEXT.help, [webAppBtn('Открыть PITLANE', {}), webAppBtn('Обратная связь', { screen: 'feedback' })]],
  };
}

export const BOT_COMMANDS = [
  { command: 'garage', description: 'Гараж и моя машина' },
  { command: 'team', description: 'Команда' },
  { command: 'duel', description: 'Дуэль' },
  { command: 'tops', description: 'Топ автодромов' },
  { command: 'help', description: 'Помощь' },
];
export const BOT_DESCRIPTION =
  'PITLANE — телеметрия трека в Telegram.\n\n' +
  'Круг и сектора по GPS смартфона или внешнего приёмника — с честной оценкой точности.\n' +
  'Команда: публичная страница, дуэли одного трека и топ по модели и резине.\n' +
  'Гараж: твоя машина и резина в каждом круге.\n\n' +
  'Только закрытые площадки и треки.';
export const BOT_SHORT_DESCRIPTION = 'Круги и сектора по GPS, дуэли и топ команды. Телеметрия трека — в Telegram.';

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
      '<b>Вызов принят</b>\n' +
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
