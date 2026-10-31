import fs from 'node:fs'; import assert from 'node:assert';
const css=fs.readFileSync(new URL('../../styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../../app.js',import.meta.url),'utf8');
assert.ok(/\.chat-page\.on \{ animation: ds-view/.test(css),'chat uses view anim');
assert.ok(/#chatBack \{ display: none/.test(css),'no back btn');
assert.ok(app.includes('--cp-top'),'top under header');
console.log('v262 ok');
