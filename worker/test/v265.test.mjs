import fs from 'node:fs'; import assert from 'node:assert';
const r=(f)=>fs.readFileSync(new URL('../../'+f,import.meta.url),'utf8');
const css=r('styles.css'), app=r('app.js'), html=r('index.html'), tma=r('tma.js');
assert.ok(/--tg-sa/.test(tma) && /--tg-ca/.test(tma),'tg band vars');
assert.ok(/\.brand-bar \{ position: sticky; min-height: 0 !important; height: calc\(var\(--tg-sa\) \+ var\(--tg-band\)\)/.test(css),'header in tg band');
assert.ok(!html.includes('id="btnPass"'),'no PASS in header');
assert.ok(html.includes('data-pf6="pass"'),'Pass in profile');
assert.ok(/\.chat-page \.cp-bar \{ height: var\(--tg-band\)/.test(css),'chat in band');
console.log('v265 ok');
