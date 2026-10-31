#!/usr/bin/env node
/**
 * v182: настройка бота @pitlane_official_bot ПОСЛЕ деплоя Worker («выкатывай»).
 *
 *   node tools/tg-bot-setup.mjs --dry            — ничего не отправляет: печатает команды, описания и что будет вызвано
 *   TGA=<TG_ADMIN_SECRET> node tools/tg-bot-setup.mjs           — POST /tg/setup: setWebhook (+callback_query), setMyCommands (ru и по умолчанию),
 *                                                                 setMyDescription / ShortDescription, кнопка меню PITLANE; затем проверка get*
 *   TGA=… node tools/tg-bot-setup.mjs --preview — прислать настоящий /start только в чат владельца (FEEDBACK_CHAT_ID), больше никому
 *
 * Секрет берётся только из переменной окружения TGA и нигде не печатается. API — env PITLANE_API или прод-адрес ниже.
 * Без запуска скрипта бот всё равно подпишется на кнопки сам при первом сообщении после деплоя (self-heal tg:wh:pay2),
 * но список команд и описание обновятся только этим скриптом.
 */
import { BOT_COMMANDS, BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION } from '../worker/src/botcopy.js';

const API = process.env.PITLANE_API || 'https://pitlane-api.pitlane-taksimaga.workers.dev';
const args = new Set(process.argv.slice(2));

if (args.has('--dry')) {
  console.log('API:', API);
  console.log('\nsetMyCommands (ru + default):');
  for (const c of BOT_COMMANDS) console.log('  /' + c.command.padEnd(12), c.description);
  console.log('\nsetMyShortDescription:', BOT_SHORT_DESCRIPTION);
  console.log('\nsetMyDescription:\n' + BOT_DESCRIPTION);
  console.log('\nsetWebhook allowed_updates: message, pre_checkout_query, callback_query');
  console.log('setChatMenuButton: web_app «PITLANE» → https://dsssssz.github.io/pitlane/');
  process.exit(0);
}
const secret = String(process.env.TGA || '').trim();
if (secret.length < 32) { console.error('Нужен TGA=<TG_ADMIN_SECRET> (или --dry).'); process.exit(2); }
const url = API + '/tg/setup' + (args.has('--preview') ? '?preview=1' : '');
const res = await fetch(url, { method: 'POST', headers: { 'X-Admin-Secret': secret } });
const body = await res.json().catch(() => null);
console.log('HTTP', res.status);
console.log(JSON.stringify(body, null, 2));
process.exit(res.ok && body?.ok ? 0 : 1);
