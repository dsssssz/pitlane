/**
 * v320: закреплённый HTML-виджет хаба в личке @pitlane_official_bot (Bot API 10.4).
 * Код HTML фиксируется при sendWidget; дальше только chat_data (вид, последний замер, заказ).
 * «Сделать замер» / «Оформить заявку» — openTelegramLink (startapp=zamer|chip).
 * «Заказать чип» / «Назад» — переключение в самом виджете (без запроса к боту).
 * Статус заказа пишет бот через editMessageWidgetData.
 */
import { APP_URL, webAppBtn, appUrl } from './botcopy.js';
import { productById, fmtRub } from '../../shop-config.js';
import { listOrders, orderNo } from './shop.js';
import { seasonKey } from './season.js';

export const HUB_VER = 1;
export const HUB_KEY = (chatId) => 'bothub:' + chatId;
export const TG_ALLOWED_UPDATES = ['message', 'pre_checkout_query', 'callback_query', 'widget_query'];
export const MENU_BUTTON_TEXT = 'Замер';
export const MENU_BUTTON = () => ({ type: 'web_app', text: MENU_BUTTON_TEXT, web_app: { url: appUrl({ startapp: 'zamer' }) } });

const DEFAULT_BOT = 'pitlane_official_bot';
const CHIP_ID = 'pitlane-gps';
const TERMINAL = new Set(['delivered', 'canceled', 'done']);
/** new/paid/accepted → шаг 1; assembling → 2; shipped → 3; доставка/отмена → вернуться в хаб. */
export const ORDER_STEP = {
  new: 1, paid: 1, accepted: 1, contacted: 1, confirmed: 1,
  assembling: 2,
  shipped: 3,
  delivered: 0, canceled: 0, done: 0,
};

export function chipInfo() {
  const p = productById(CHIP_ID);
  const price = p && Number.isFinite(p.price) && p.price > 0 ? fmtRub(p.price) : 'Цена по запросу';
  const kit = (p && Array.isArray(p.inBox) ? p.inBox : []).map((x) => String(x).replace(/^Прибор\s+/i, '').replace(/^Металлическая\s+/i, '')).join(' и ') || 'прибор и пластина на 3M';
  return { title: (p && p.title) || 'PITLANE GPS', sub: (p && p.subtitle) || 'Внешний GPS 25 Гц', price, kit: 'В комплекте: ' + kit };
}

export function formatLastLine({ t, city, rank } = {}) {
  const time = Number(t);
  if (!Number.isFinite(time) || time <= 0) return '';
  const sec = time.toFixed(2).replace(/\.?0+$/, (s) => s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  const pretty = Number(time).toFixed(2);
  let s = 'Последний 0–100 · ' + pretty + ' с';
  const c = String(city || '').trim();
  const n = Number(rank);
  if (c && Number.isInteger(n) && n > 0) s += ' · №' + n + ' ' + c;
  else if (c) s += ' · ' + c;
  return s;
}

export function mapOrderToHub(o) {
  if (!o || TERMINAL.has(o.status) || !ORDER_STEP[o.status]) return null;
  const step = ORDER_STEP[o.status];
  if (!step) return null;
  const chip = chipInfo();
  return {
    v: 'order',
    step,
    no: String(o.no || orderNo(o) || '').replace(/^№/, ''),
    title: o.title || chip.title,
    sum: o.total != null ? fmtRub(o.total) : chip.price,
    city: o.city || '',
    track: o.status === 'shipped' && o.track ? String(o.track) : '',
  };
}

/** Состояние для chat_data (≤ 1024 байт UTF-8). */
export function buildHubData({ last, order, bot, view } = {}) {
  const d = { v: 'hub', bot: bot || DEFAULT_BOT };
  if (view === 'chip' && !order) d.v = 'chip';
  const chip = chipInfo();
  d.price = chip.price;
  d.kit = chip.kit;
  d.sub = chip.sub;
  d.title = chip.title;
  const line = typeof last === 'string' ? last : formatLastLine(last || {});
  if (line) d.last = line;
  const ord = order ? (order.v === 'order' ? order : mapOrderToHub(order)) : null;
  if (ord) Object.assign(d, ord);
  if (d.v !== 'order' && view === 'chip') d.v = 'chip';
  return d;
}

export function hubDataString(data) {
  const s = JSON.stringify(data);
  return s.length > 1024 ? JSON.stringify({ v: data.v || 'hub', bot: data.bot || DEFAULT_BOT, last: data.last || undefined }) : s;
}

/** HTML виджета: inline CSS/JS, system-ui, без картинок и @font-face. */
export const HUB_HTML = `<style>
body{margin:0;padding:18px 16px 14px;background:#000;color:#fff;font:500 13px/1.35 system-ui,sans-serif}
.br{font-size:11px;font-weight:600;letter-spacing:.16em;color:#9a9a9a;margin:0 0 14px}
.t{font-size:20px;font-weight:600;letter-spacing:-.03em;line-height:1.15;margin:0 0 4px}
.pr{font-size:32px;font-weight:590;letter-spacing:-.04em;font-variant-numeric:tabular-nums;margin:6px 0 10px}
.k,.h,.o{color:#9a9a9a;font-size:13px;line-height:1.4;margin:0 0 8px}
.h{color:#6d6d6d;font-size:12px;margin:0 0 16px}
.o{margin:-4px 0 14px}
.btns{display:flex;flex-direction:column;gap:6px}
button{height:44px;border-radius:8px;border:1px solid #2a2a2a;background:#000;color:#fff;font:600 15px/1 system-ui,sans-serif}
button.p{background:#f2f2f2;color:#000;border-color:#f2f2f2}
button.s{height:38px;font-size:13.5px}
.last{margin-top:14px;font-size:11px;font-weight:500;color:#7a7a7a;padding-right:52px;min-height:18px}
.steps{list-style:none;margin:0 0 16px;padding:0}
.steps li{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:500;color:#6d6d6d;padding:7px 0}
.steps i{width:8px;height:8px;border-radius:50%;background:#2a2a2a;flex:none}
.steps li.done{color:#8a8a8a}.steps li.done i{background:#8a8a8a}
.steps li.on{color:#fff}.steps li.on i{background:#f2f2f2}
.tr{font-size:14px;font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:.02em;margin:0 0 14px}
#chip,#ord{display:none}
</style>
<div id="hub">
  <div class="br">PITLANE</div>
  <div class="btns">
    <button class="p" onclick="openApp('zamer')">Сделать замер</button>
    <button onclick="show('chip')">Заказать чип</button>
  </div>
  <div class="last" id="last"></div>
</div>
<div id="chip">
  <div class="br" id="ct">PITLANE GPS</div>
  <div class="t" id="cs"></div>
  <div class="pr" id="cp"></div>
  <div class="k" id="ck"></div>
  <div class="h">Заявка, без оплаты сейчас. Город, доставка и контакт — в приложении.</div>
  <div class="btns">
    <button class="p s" onclick="openApp('chip')">Оформить заявку</button>
    <button class="s" onclick="show('hub')">Назад</button>
  </div>
  <div class="last"></div>
</div>
<div id="ord">
  <div class="br">ЗАЯВКА</div>
  <div class="t" id="ot"></div>
  <div class="o" id="oo"></div>
  <ul class="steps">
    <li id="s1"><i></i>Заявка принята</li>
    <li id="s2"><i></i>Собираем</li>
    <li id="s3"><i></i>Отправлен</li>
  </ul>
  <div class="h" id="oh">Свяжемся в Telegram по оплате и доставке. Статус обновится здесь.</div>
  <div class="tr" id="trk" hidden></div>
  <div class="btns">
    <button class="s" id="copy" hidden onclick="copyTrack()">Скопировать трек</button>
    <button class="s" onclick="openApp('chip')">Открыть заявку</button>
  </div>
  <div class="last"></div>
</div>
<script>
const TW=window.TelegramWidget;
let local=null;
function D(){try{return JSON.parse((TW&&TW.chatData)||'{}')}catch(e){return{}}}
function bot(){return D().bot||'pitlane_official_bot'}
function openApp(p){var u='https://t.me/'+bot()+'?startapp='+p;if(TW&&TW.openTelegramLink)TW.openTelegramLink(u)}
function show(v){local=v;draw()}
function copyTrack(){var t=D().track;if(t&&TW&&TW.copyText)TW.copyText(t)}
function draw(){
  var d=D(),v=d.v||'hub';
  if(v!=='order'&&local)v=local;
  document.getElementById('hub').style.display=v==='hub'?'block':'none';
  document.getElementById('chip').style.display=v==='chip'?'block':'none';
  document.getElementById('ord').style.display=v==='order'?'block':'none';
  var last=document.getElementById('last');
  last.textContent=d.last||'';
  document.getElementById('ct').textContent=d.title||'PITLANE GPS';
  document.getElementById('cs').textContent=d.sub||'Внешний GPS 25 Гц';
  document.getElementById('cp').textContent=d.price||'';
  document.getElementById('ck').textContent=d.kit||'';
  if(v==='order'){
    document.getElementById('ot').textContent=d.title||'PITLANE GPS';
    var bits=[]; if(d.no)bits.push('№'+d.no); if(d.sum)bits.push(d.sum); if(d.city)bits.push(d.city);
    document.getElementById('oo').textContent=bits.join(' · ');
    var st=Number(d.step)||1;
    for(var i=1;i<=3;i++){var el=document.getElementById('s'+i);el.className=i<st?'done':i===st?'on':''}
    var has=!!d.track;
    document.getElementById('trk').hidden=!has; document.getElementById('trk').textContent=d.track||'';
    document.getElementById('copy').hidden=!has;
    document.getElementById('oh').textContent=st===3
      ?'Заказ передан в доставку.'
      :(st===2?'Собираем и проверяем прибор.':'Свяжемся в Telegram по оплате и доставке. Статус обновится здесь.');
  }
}
draw();
if(TW){if(TW.onEvent)TW.onEvent('chatDataChanged',function(){local=null;draw()});if(TW.ready)TW.ready()}
</script>`;

export function hubHtmlSize(html = HUB_HTML) {
  const utf8 = Buffer.byteLength(html, 'utf8');
  let zlib = null;
  try { zlib = requireZlib().deflateRawSync ? null : null; } catch (_) {}
  return { utf8, zlib };
}

function deflate9(buf) {
  const z = requireZlib();
  // official limit: zlib level 9 (deflate with zlib wrapper, not raw)
  return z.deflateSync(buf, { level: 9 });
}
function requireZlib() {
  return globalThis.__plZlib || (typeof process !== 'undefined' ? requireCompat() : null);
}
function requireCompat() {
  try { return require('node:zlib'); } catch (_) { return null; }
}

/** Для тестов и проверки бюджета. В Worker не вызывается при отправке (сжимает Telegram). */
export function measureHubHtml(html = HUB_HTML) {
  const buf = typeof Buffer !== 'undefined' ? Buffer.from(html, 'utf8') : new TextEncoder().encode(html);
  const utf8 = buf.length;
  let zlibBytes = 0;
  try {
    const z = typeof process !== 'undefined' ? (yieldZlib()) : null;
    if (z) zlibBytes = z.deflateSync(buf, { level: 9 }).length;
  } catch (_) {}
  return { utf8, zlib: zlibBytes, ok: utf8 <= 32768 && (zlibBytes === 0 || zlibBytes <= 4096) };
}
function yieldZlib() {
  try { return require('node:zlib'); } catch (_) { return null; }
}

function botName(env) {
  return String(env?.TELEGRAM_BOT_USERNAME || DEFAULT_BOT).replace(/^@/, '') || DEFAULT_BOT;
}

function cityKey(c) {
  return String(c || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}]+/gu, '');
}

export function pickLastResult({ ab = [], c = [], pid, city, season } = {}) {
  if (!pid) return null;
  const isC = (r) => r.cls === 'c' || r.gpsQ === 'C';
  const mine = (rows, pred) => (rows || []).filter((r) => r && r.pilotId === pid && Number(r.t) > 0 && r.valid !== false && pred(r));
  const row = mine(ab, (r) => !isC(r)).sort((a, b) => a.t - b.t)[0] || mine(c, isC).sort((a, b) => a.t - b.t)[0];
  if (!row) return null;
  const cls = isC(row) ? 'c' : 'ab';
  const town = String(row.city || city || '').trim();
  let rank = null;
  if (town) {
    const list = (season && typeof season === 'object' && !Array.isArray(season)
      ? Object.entries(season).filter(([, r]) => r && Number(r.t) > 0 && cityKey(r.city) === cityKey(town)).map(([id, r]) => ({ pilotId: id, t: Number(r.t) }))
      : (cls === 'c' ? c : ab).filter((r) => r && r.valid !== false && Number(r.t) > 0 && cityKey(r.city || '') === cityKey(town)).map((r) => ({ pilotId: r.pilotId, t: Number(r.t) }))
    ).sort((a, b) => a.t - b.t);
    const i = list.findIndex((r) => r.pilotId === pid);
    if (i >= 0) rank = i + 1;
  }
  return { t: row.t, city: town, rank, cls };
}

export async function loadLastResult(env, chatId, H) {
  const pid = await env.PITLANE.get('auth:tg:' + chatId);
  if (!pid) return null;
  const kvJson = H.kvJson || (async (kv, k) => { const raw = await kv.get(k); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } });
  const asList = async (k) => { const v = await kvJson(env.PITLANE, k); return Array.isArray(v) ? v : []; };
  const rec = await kvJson(env.PITLANE, 'pilot:' + pid);
  const city = rec && rec.city ? rec.city : '';
  const ab = await asList('drag:0-100');
  const c = await asList('dragc:0-100');
  const row = pickLastResult({ ab, c, pid, city });
  if (!row) return null;
  const month = seasonKey(Date.now());
  const season = await kvJson(env.PITLANE, 'cseason:' + month + ':0-100:' + (row.cls === 'c' ? 'c' : 'ab'));
  if (season && typeof season === 'object' && !Array.isArray(season) && row.city) {
    const ranked = pickLastResult({ ab, c, pid, city: row.city, season });
    if (ranked) return ranked;
  }
  return row;
}

export async function loadActiveOrder(env, chatId, H) {
  const pid = await env.PITLANE.get('auth:tg:' + chatId);
  if (!pid) return null;
  const mine = await listOrders(env.PITLANE, pid, H);
  const open = (mine || []).filter((o) => o && !TERMINAL.has(o.status) && ORDER_STEP[o.status] > 0);
  if (!open.length) return null;
  open.sort((a, b) => (b.at || 0) - (a.at || 0));
  return open[0];
}

export async function buildStateForChat(env, chatId, H, extra = {}) {
  const last = extra.last !== undefined ? extra.last : await loadLastResult(env, chatId, H);
  const order = extra.order !== undefined ? extra.order : await loadActiveOrder(env, chatId, H);
  return buildHubData({ last, order, bot: botName(env), view: extra.view });
}

function fallbackText(data) {
  if (data.v === 'order') {
    const st = data.step === 3 ? 'Отправлен' : data.step === 2 ? 'Собираем' : 'Заявка принята';
    return '<b>' + esc(data.title || 'PITLANE GPS') + '</b>\nЗаявка' + (data.no ? ' №' + esc(data.no) : '') + ' · ' + esc(st) + (data.track ? '\nТрек: <code>' + esc(data.track) + '</code>' : '');
  }
  return '<b>PITLANE</b>\nЗамер и предзаказ PITLANE GPS — кнопками ниже.' + (data.last ? '\n' + esc(data.last) : '');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fallbackMarkup() {
  return { inline_keyboard: [[webAppBtn('Сделать замер', { startapp: 'zamer' })], [webAppBtn('Заказать чип', { startapp: 'chip' })]] };
}

async function getRec(kv, chatId, H) {
  const kvJson = H.kvJson || (async (store, k) => { const raw = await store.get(k); if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } });
  const rec = await kvJson(kv, HUB_KEY(chatId));
  return rec && Number.isFinite(Number(rec.mid)) ? rec : null;
}
async function putRec(kv, chatId, rec) {
  await kv.put(HUB_KEY(chatId), JSON.stringify({ ...rec, at: Date.now() }));
}

export async function deleteHubKeys(kv, rec) {
  let n = 0;
  for (const p of rec?.providers || []) {
    if (p.type === 'tg' && /^\d{1,20}$/.test(String(p.id))) {
      await kv.delete(HUB_KEY(p.id));
      n++;
    }
  }
  return n;
}

const gone = (r) => {
  const d = String(r?.description || r?.error || '').toLowerCase();
  return !r?.ok && /message to (edit|delete) not found|message can't be edited|message identifier is not specified|message to pin not found/.test(d);
};

/**
 * Один хаб на чат: правит существующий, иначе шлёт и закрепляет.
 * force=true (/hub при смене HUB_VER) — новое сообщение, старое удаляется.
 */
export async function ensureHub(env, chatId, H, opts = {}) {
  if (!Number.isSafeInteger(chatId)) return { ok: false, error: 'bad chat' };
  const data = opts.data || await buildStateForChat(env, chatId, H, opts);
  const chatData = hubDataString(data);
  const rec = await getRec(env.PITLANE, chatId, H);
  const canEdit = rec && rec.ver === HUB_VER && rec.mid && !opts.force;

  if (canEdit) {
    let r;
    if (rec.kind === 'widget') {
      r = await H.tgCall(env, 'editMessageWidgetData', { chat_id: chatId, message_id: rec.mid, chat_data: chatData });
    } else {
      r = await H.tgCall(env, 'editMessageText', {
        chat_id: chatId, message_id: rec.mid, text: fallbackText(data), parse_mode: 'HTML',
        link_preview_options: { is_disabled: true }, reply_markup: fallbackMarkup(),
      });
    }
    if (r?.ok) return { ok: true, mode: 'edit', kind: rec.kind, mid: rec.mid, sent: false };
    if (!gone(r)) return { ok: false, mode: 'edit-failed', kind: rec.kind, mid: rec.mid, error: r?.description || 'edit failed' };
  }

  let kind = 'widget';
  let r = await H.tgCall(env, 'sendWidget', {
    chat_id: chatId,
    html: HUB_HTML,
    chat_data: chatData,
    allow_queries: false,
    disable_notification: !!opts.quiet,
  });
  if (!r?.ok) {
    kind = 'fallback';
    r = await H.tgCall(env, 'sendMessage', {
      chat_id: chatId,
      text: fallbackText(data),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: fallbackMarkup(),
      disable_notification: !!opts.quiet,
    });
  }
  const mid = r?.result && Number.isFinite(Number(r.result.message_id)) ? Number(r.result.message_id) : null;
  if (!r?.ok || !mid) return { ok: false, mode: 'send-failed', kind, error: r?.description || 'no message_id', fallback: kind === 'fallback' };

  await H.tgCall(env, 'pinChatMessage', { chat_id: chatId, message_id: mid, disable_notification: true });
  if (rec && rec.mid && rec.mid !== mid) {
    try { await H.tgCall(env, 'unpinChatMessage', { chat_id: chatId, message_id: rec.mid }); } catch (_) {}
    try { await H.tgCall(env, 'deleteMessage', { chat_id: chatId, message_id: rec.mid }); } catch (_) {}
  }
  await putRec(env.PITLANE, chatId, { mid, kind, ver: HUB_VER });
  return { ok: true, mode: 'fresh', kind, mid, sent: true, fallback: kind === 'fallback' };
}

/** Обновить хаб покупателя по заявке (создание / смена статуса). Нет хаба — ничего не шлём. */
export async function updateHubForOrder(env, order, H) {
  const chatId = Number(order?.buyer?.tgId);
  if (!Number.isSafeInteger(chatId)) return { ok: false, error: 'no tg' };
  const rec = await getRec(env.PITLANE, chatId, H);
  if (!rec) return { ok: false, error: 'no hub', skipped: true };
  const mapped = mapOrderToHub(order);
  const last = await loadLastResult(env, chatId, H);
  const data = mapped
    ? buildHubData({ last, order: mapped, bot: botName(env) })
    : buildHubData({ last, order: null, bot: botName(env) });
  return ensureHub(env, chatId, H, { data });
}

