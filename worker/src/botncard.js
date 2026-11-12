/**
 * v321: карточки-уведомления Bot API 10.4 (отдельные виджеты в ленте, хаб в пине не трогаем).
 * Обгон в топ-10, чип отправлен, вызов принят/побит. Если sendWidget не принялся — вызывающий
 * шлёт прежний текстовый notify. HTML общий, вид задаёт chat_data (≤1024).
 */
import zlib from 'node:zlib';

const DEFAULT_BOT = 'pitlane_official_bot';

export function botName(env) {
  return String(env?.TELEGRAM_BOT_USERNAME || DEFAULT_BOT).replace(/^@/, '') || DEFAULT_BOT;
}

export function fmtSec(t) {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(2) + ' с';
}

/** Обгон в первой десятке: кто обогнал, его время и ваше, место стало хуже. */
export function overtakeCard({ rivalName, rivalT, myT, myRank, boardTitle, bot } = {}) {
  const rank = Number(myRank);
  const who = String(rivalName || 'Пилот').trim() || 'Пилот';
  const theirs = fmtSec(rivalT) || String(rivalT || '');
  const mine = fmtSec(myT) || String(myT || '');
  const bits = [who + (theirs ? ' · ' + theirs : ''), mine ? 'вы ' + mine : ''].filter(Boolean);
  const sub = [bits.join(' · '), String(boardTitle || '').trim()].filter(Boolean).join('\n');
  const t = Number.isInteger(rank) && rank > 0 ? 'Тебя обогнали — теперь №' + rank : 'Тебя обогнали в топе';
  return {
    v: 'ot',
    bot: bot || DEFAULT_BOT,
    k: 'ТОП',
    t,
    bad: Number.isInteger(rank) && rank > 0 ? '№' + rank : '',
    s: sub,
    a1: 'Отыграться',
    p1: 'zamer',
  };
}

/** Чип передан в доставку. Трек копируется через TelegramWidget.copyText. */
export function shippedCard(o = {}, bot) {
  const no = String(o.no || o.id || '').replace(/^№/, '');
  const del = String(o.delivery?.title || o.delivery?.name || '').trim();
  const line = [del, no ? 'заявка №' + no : ''].filter(Boolean).join(' · ');
  const track = String(o.track || '').trim();
  const d = {
    v: 'sh',
    bot: bot || DEFAULT_BOT,
    k: 'ЗАКАЗ',
    t: 'Чип отправлен',
    s: line || 'Заказ передан в доставку.',
    a1: track ? 'Скопировать трек' : 'Открыть заявку',
    p1: track ? 'copy' : 'chip',
  };
  if (track) {
    d.track = track;
    d.a2 = 'Открыть заявку';
    d.p2 = 'chip';
  }
  return d;
}

/** Вызов принят или побит — создателю. «побит» красным (хуже). */
export function chalCard({ win, nick, t, mine, id, disc, bot } = {}) {
  return {
    v: 'ch',
    bot: bot || DEFAULT_BOT,
    k: 'ВЫЗОВ',
    t: win ? 'Вызов побит' : 'Вызов принят',
    bad: win ? 'побит' : '',
    s: [String(nick || 'Пилот').trim(), String(disc || ''), fmtSec(t)].filter(Boolean).join(' · ')
      + (fmtSec(mine) ? '\nу тебя ' + fmtSec(mine) : ''),
    a1: 'Открыть замер',
    p1: id ? 'ch_' + id : 'zamer',
  };
}

export function cardDataString(data) {
  const s = JSON.stringify(data);
  return s.length > 1024 ? JSON.stringify({ v: data.v, bot: data.bot || DEFAULT_BOT, t: data.t, s: data.s, a1: data.a1, p1: data.p1 }) : s;
}

/** Общий HTML трёх карточек: system-ui, без картинок и сети. Красный только у .bad (хуже). */
export const CARD_HTML = `<style>
body{margin:0;padding:16px 16px 28px;background:#000;color:#fff;font:500 13px/1.35 system-ui,sans-serif}
.k{font-size:11px;font-weight:600;letter-spacing:.12em;color:#9a9a9a;margin:0 0 8px}
.t{font-size:17px;font-weight:600;letter-spacing:-.03em;line-height:1.25;margin:0 0 6px}
.s{font-size:13px;color:#8a8a8a;margin:0 0 14px;line-height:1.35;white-space:pre-line}
.tr{font-size:14px;font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:.02em;margin:-4px 0 14px}
.bad{color:#e10600}
.btns{display:flex;flex-direction:column;gap:6px}
button{height:44px;border-radius:8px;border:1px solid #2a2a2a;background:#000;color:#fff;font:600 15px/1 system-ui,sans-serif}
button.p{background:#f2f2f2;color:#000;border-color:#f2f2f2}
button.s{height:38px;font-size:13.5px}
#a2{display:none}
</style>
<div class="k" id="k"></div>
<div class="t" id="t"></div>
<div class="s" id="s"></div>
<div class="tr" id="tr" hidden></div>
<div class="btns">
  <button class="p" id="a1" onclick="act(1)"></button>
  <button class="s" id="a2" onclick="act(2)"></button>
</div>
<script>
const TW=window.TelegramWidget;
function D(){try{return JSON.parse((TW&&TW.chatData)||'{}')}catch(e){return{}}}
function bot(){return D().bot||'pitlane_official_bot'}
function openApp(p){var u='https://t.me/'+bot()+'?startapp='+p;if(TW&&TW.openTelegramLink)TW.openTelegramLink(u)}
function title(el,t,bad){
  el.textContent='';
  if(bad&&t&&t.indexOf(bad)>=0){
    var i=t.indexOf(bad);
    el.appendChild(document.createTextNode(t.slice(0,i)));
    var s=document.createElement('span');s.className='bad';s.textContent=bad;el.appendChild(s);
    el.appendChild(document.createTextNode(t.slice(i+bad.length)));
  }else el.textContent=t||'';
}
function act(n){
  var d=D(),p=n===2?d.p2:d.p1;
  if(p==='copy'){var t=d.track;if(t&&TW&&TW.copyText)TW.copyText(t);return}
  if(p)openApp(p);
}
function draw(){
  var d=D();
  document.getElementById('k').textContent=d.k||'';
  title(document.getElementById('t'),d.t||'',d.bad||'');
  document.getElementById('s').textContent=d.s||'';
  var has=!!d.track;
  document.getElementById('tr').hidden=!has;document.getElementById('tr').textContent=d.track||'';
  document.getElementById('a1').textContent=d.a1||'';
  var a2=document.getElementById('a2');
  if(d.a2){a2.style.display='block';a2.textContent=d.a2}else a2.style.display='none';
}
draw();
if(TW){if(TW.onEvent)TW.onEvent('chatDataChanged',draw);if(TW.ready)TW.ready()}
</script>`;

export function measureCardHtml(html = CARD_HTML) {
  const buf = Buffer.from(html, 'utf8');
  const z = zlib.deflateSync(buf, { level: 9 });
  return { utf8: buf.length, zlib: z.length, ok: buf.length <= 32768 && z.length <= 4096 };
}

const goneBlock = (r) => r && !r.ok && (r.error_code === 403 || /blocked|deactivated/i.test(String(r.description || '')));

/**
 * Отправить карточку виджетом. Не пинит (хаб остаётся закреплённым).
 * ok без message_id считаем успехом (как хаб — тестовые фейки часто отдают result:true).
 * !ok → { ok:false, raw } — вызывающий шлёт прежний текст.
 */
export async function sendNotifyWidget(env, chatId, data, H) {
  if (!Number.isSafeInteger(Number(chatId))) return { ok: false, error: 'bad chat' };
  const r = await H.tgCall(env, 'sendWidget', {
    chat_id: Number(chatId),
    html: CARD_HTML,
    chat_data: cardDataString({ ...data, bot: data.bot || botName(env) }),
    allow_queries: false,
  });
  if (!r?.ok) return { ok: false, raw: r, error: r?.description || 'sendWidget failed' };
  const mid = r.result && Number.isFinite(Number(r.result.message_id)) ? Number(r.result.message_id) : null;
  return { ok: true, mid, raw: r, kind: 'widget' };
}

/** Для статусов заказа: виджет только на shipped, иначе (и при ошибке виджета) — sendMessage с переданным text. */
export async function sendBuyerStatus(env, chatId, o, H, { text, keyboard } = {}) {
  if (!Number.isSafeInteger(Number(chatId))) return { ok: false };
  if (o && o.status === 'shipped') {
    const w = await sendNotifyWidget(env, Number(chatId), shippedCard(o, botName(env)), H);
    if (w.ok) return w;
    if (goneBlock(w.raw)) return w.raw || { ok: false };
  }
  return H.tgCall(env, 'sendMessage', {
    chat_id: Number(chatId),
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard || [] },
  });
}

export function isBlockedTg(r) { return goneBlock(r); }
