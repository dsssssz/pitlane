// v81 Telegram bot tests: node test/tg.test.mjs
import worker, { tgRoute, tgWebhookPath, BOT_COMMANDS, BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION } from '../src/index.js';
import { MemKV } from './kvmock.mjs';

let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };
const SECRET = 'a'.repeat(20) + 'b'.repeat(20) + 'c'.repeat(24);
const ADMIN = 'z'.repeat(48);
const sent = [];
const fakeFetch = async (u, init) => {
  const method = String(u).split('/').pop();
  const body = JSON.parse(init.body || '{}');
  sent.push({ method, body });
  const results = {
    getMe: { id: 1, is_bot: true, first_name: 'Pitlane bot', username: 'pitlane_official_bot' },
    getWebhookInfo: { url: 'https://api.test/tg/webhook/' + tgWebhookPath(SECRET), pending_update_count: 0, allowed_updates: ['message'] },
    getMyCommands: BOT_COMMANDS,
    getMyDescription: { description: BOT_DESCRIPTION },
  };
  return new Response(JSON.stringify({ ok: true, result: results[method] ?? true }), { status: 200 });
};
const kv = new MemKV();
const env = { PITLANE: kv, TELEGRAM_BOT_TOKEN: '1:fake', TG_WEBHOOK_SECRET: SECRET, TG_ADMIN_SECRET: ADMIN, __fetch: fakeFetch };
const P = '/tg/webhook/' + tgWebhookPath(SECRET);
let upd = 1;
const msg = (text, chatId = 555, type = 'private') => ({ update_id: upd++, message: { message_id: upd, chat: { id: chatId, type }, from: { id: chatId }, text } });
async function post(path, body, headers = {}) {
  const res = await worker.fetch(new Request('https://api.test' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '149.154.167.1', ...headers }, body: JSON.stringify(body) }), env);
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}
const hook = (text, chatId, type) => post(P, msg(text, chatId, type), { 'X-Telegram-Bot-Api-Secret-Token': SECRET });

console.log('\n[webhook secret check]');
let r = await post(P, msg('/start'));
ok(r.status === 404 && sent.length === 0, 'missing secret header → 404, nothing sent');
r = await post(P, msg('/start'), { 'X-Telegram-Bot-Api-Secret-Token': SECRET.slice(0, -1) + 'x' });
ok(r.status === 404 && sent.length === 0, 'wrong secret header → 404');
r = await post('/tg/webhook/deadbeef', msg('/start'), { 'X-Telegram-Bot-Api-Secret-Token': SECRET });
ok(r.status === 404 && sent.length === 0, 'right header but wrong path → 404');
r = await worker.fetch(new Request('https://api.test' + P, { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'short' }, body: '{}' }), { ...env, TG_WEBHOOK_SECRET: 'short' });
ok(r.status === 404, 'short/unset secret disables the webhook');
r = await hook('/start');
ok(r.status === 200 && sent.length === 1, 'valid secret + path → 200 and one reply');

console.log('\n[command routing]');
let s = sent.pop();
ok(s.method === 'sendPhoto' && s.body.chat_id === 555 && /banner\.jpg$/.test(s.body.photo), '/start → sendPhoto banner to chat');
const kb = s.body.reply_markup.inline_keyboard;
ok(kb.length === 3 && kb[0][0].text === '🏁 Открыть PITLANE' && kb[0][0].web_app.url === 'https://dsssssz.github.io/pitlane/', 'big open button');
ok(kb[1][0].text === '🏆 Топы' && /view=tops/.test(kb[1][0].web_app.url) && kb[1][1].text === '⚔️ Дуэль' && /screen=duel/.test(kb[1][1].web_app.url), 'Топы / Дуэль row');
ok(kb[2][0].text === '💬 Обратная связь' && /screen=feedback/.test(kb[2][0].web_app.url), 'feedback button');
ok(!/\bpro\b|₽|руб\.|рубл|цена|стоимост|подписк/i.test(s.body.caption), 'no Pro/prices in caption');
await hook('/start duel_Ab12-x');
s = sent.pop();
ok(s.body.reply_markup.inline_keyboard[0][0].web_app.url === 'https://dsssssz.github.io/pitlane/?startapp=duel_Ab12-x' && /вызов/.test(s.body.caption), '/start duel_… → startapp deep link + challenge line');
await hook('/start <script>alert(1)</script>');
s = sent.pop();
ok(!/startapp|script/.test(JSON.stringify(s.body)), 'invalid payload ignored, not echoed');
await hook('/start@pitlane_official_bot crew_x1');
s = sent.pop();
ok(/startapp=crew_x1/.test(s.body.reply_markup.inline_keyboard[0][0].web_app.url), '/start@bot suffix handled');
const expect = { '/garage': /view=garage/, '/tops': /view=tops/, '/duel': /screen=duel/, '/feedback': /screen=feedback/, '/help': /pitlane\/$/ };
for (const [cmd, re] of Object.entries(expect)) {
  r = await hook(cmd, 777);
  s = sent.pop();
  ok(r.data.cmd === cmd.slice(1) && s.method === 'sendMessage' && s.body.parse_mode === 'HTML' && re.test(s.body.reply_markup.inline_keyboard[0][0].web_app.url), cmd + ' → sendMessage + web_app button');
}
r = await hook('привет', 778);
s = sent.pop();
ok(r.data.cmd === 'other' && /\/help/.test(s.body.text), 'free text → friendly hint');
r = await hook('/unknown', 778);
ok(r.data.cmd === 'other', 'unknown command → hint');
sent.length = 0;
r = await hook('/start', -100123, 'group');
ok(r.status === 200 && sent.length === 0, 'group chats ignored');
r = await post(P, { update_id: 9, edited_message: {} }, { 'X-Telegram-Bot-Api-Secret-Token': SECRET });
ok(r.status === 200 && sent.length === 0, 'non-message update → 200, silent');

console.log('\n[per-chat rate limit]');
sent.length = 0;
for (let i = 0; i < 15; i++) await hook('/help', 999);
ok(sent.length === 12, 'chat limited to 12 replies/min (got ' + sent.length + ')');
sent.length = 0;
await hook('/help', 1000);
ok(sent.length === 1, 'other chats unaffected');

console.log('\n[setup endpoint]');
sent.length = 0;
r = await post('/tg/setup', {});
ok(r.status === 404 && sent.length === 0, 'setup without admin secret → 404');
r = await post('/tg/setup', {}, { 'X-Admin-Secret': 'z'.repeat(47) + 'y' });
ok(r.status === 404 && sent.length === 0, 'wrong admin secret → 404');
r = await post('/tg/setup', {}, { 'X-Admin-Secret': ADMIN });
const methods = sent.map((x) => x.method);
ok(r.status === 200 && ['setWebhook', 'setMyCommands', 'setMyDescription', 'setMyShortDescription', 'setChatMenuButton', 'setMyName'].every((m) => methods.includes(m)), 'setup calls all Bot API methods');
const wh = sent.find((x) => x.method === 'setWebhook').body;
ok(wh.secret_token === SECRET && wh.url === 'https://api.test' + P && JSON.stringify(wh.allowed_updates) === '["message"]', 'setWebhook url/secret/allowed_updates');
ok(sent.filter((x) => x.method === 'setMyCommands').some((x) => x.body.language_code === 'ru'), 'ru commands set');
ok(sent.find((x) => x.method === 'setChatMenuButton').body.menu_button.text === 'PITLANE', 'menu button PITLANE');
ok(!methods.includes('sendMessage') && !methods.includes('sendPhoto'), 'setup does not message anyone');
ok(r.data.result.getWebhookInfo.urlMatches === true, 'verification reported');
ok([...BOT_DESCRIPTION].length <= 512 && [...BOT_SHORT_DESCRIPTION].length <= 120 && BOT_COMMANDS.length === 6, 'description lengths within limits');
ok(!/\bpro\b|₽|руб\.|рубл|цена|стоимост|подписк/i.test(BOT_DESCRIPTION + BOT_SHORT_DESCRIPTION), 'no Pro/prices in descriptions');
ok(tgRoute('/START').cmd === 'start', 'commands case-insensitive');

sent.length = 0;
env.FEEDBACK_CHAT_ID = '8591275999';
r = await post('/tg/setup?preview=1', {}, { 'X-Admin-Secret': ADMIN });
ok(r.status === 200 && sent.length === 1 && sent[0].method === 'sendPhoto' && sent[0].body.chat_id === 8591275999, 'preview sends exactly one /start to owner chat');

console.log(fails ? `\n${fails} FAILED` : '\nall tg tests passed');
process.exit(fails ? 1 : 0);
