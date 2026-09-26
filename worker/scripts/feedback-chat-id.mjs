#!/usr/bin/env node
// Prints chat ids of people who recently wrote to the bot (Telegram getUpdates) — to fill FEEDBACK_CHAT_ID.
// Usage (owner, locally): write /start to @pitlane_official_bot, then
//   TELEGRAM_BOT_TOKEN='123:ABC…' node worker/scripts/feedback-chat-id.mjs
// Nothing is stored or sent anywhere; the token stays in your shell. Works only while the bot has NO webhook.
const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!/^\d{3,20}:[\w-]{20,}$/.test(token)) {
  console.error('Set TELEGRAM_BOT_TOKEN (from @BotFather) in the environment.');
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=50&allowed_updates=${encodeURIComponent('["message"]')}`);
const data = await res.json().catch(() => null);
if (!data?.ok) {
  console.error('Telegram error:', data?.description || res.status, '(if a webhook is set, getUpdates is unavailable)');
  process.exit(1);
}
const seen = new Map();
for (const u of data.result || []) {
  const m = u.message || u.edited_message;
  if (!m?.chat) continue;
  const c = m.chat;
  seen.set(c.id, `${c.id}\t${c.type}\t@${c.username || '-'}\t${[c.first_name, c.last_name, c.title].filter(Boolean).join(' ')}\t«${String(m.text || '').slice(0, 40)}»`);
}
if (!seen.size) console.log('No messages yet — send /start to the bot and run again.');
else { console.log('chat_id\ttype\tusername\tname\tlast text'); for (const line of seen.values()) console.log(line); }
