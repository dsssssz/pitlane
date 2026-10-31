import fs from 'node:fs'; import assert from 'node:assert';
const css=fs.readFileSync(new URL('../../styles.css',import.meta.url),'utf8');
assert.ok(/html\.chat-open:not\(#_\):not\(#_\):not\(#_\) \.brand-bar \{ visibility: hidden !important; \}/.test(css),'no header in chat');
assert.ok(/\.chat-page \.cp-head \{ padding-top: calc\(var\(--tg-top, 0px\) \+ 8px\)/.test(css),'chat from tg safe area');
assert.ok(/\.chat-page \.cp-title \{ display: flex !important; flex-direction: row/.test(css),'compact title');
console.log('v264 ok');
