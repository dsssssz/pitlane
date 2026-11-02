// v267: вкладка «Трек» — машина и GPS сверху, только трассы с геометрией, «без геометрии» свёрнуто, одна кнопка «Начать сессию»
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const html = R('index.html'), tv2 = R('track-v2/tv2.js'), app = R('app.js'), css = R('styles.css');
const lap = html.slice(html.indexOf('id="view-lap"'), html.indexOf('</section>', html.indexOf('id="view-lap"')));
const top = lap.indexOf('class="t282-ctl"');
assert.ok(top > 0 && top < lap.indexOf('id="tv2"'), 'блок машина+GPS над списком');
const blk = lap.slice(top, lap.indexOf('id="tv2"'));
assert.ok(blk.includes('id="btnMyCarLap"') && blk.includes('id="t61Gps"'), 'машина и GPS в верхнем блоке');
assert.equal((html.match(/id="btnMyCarLap"/g) || []).length, 1);
assert.equal((html.match(/id="t61Gps"/g) || []).length, 1);
assert.ok(/<details class="tv2-box tv2-nogeo">/.test(tv2), '«без геометрии» — свёрнутый блок');
assert.ok(!/Выбрать для сессии/.test(tv2), 'старой кнопки нет');
assert.equal((tv2.match(/class="tv2-cta"/g) || []).length, 1, 'одна кнопка');
assert.ok(/tv2-cta">Начать сессию</.test(tv2));
assert.ok(/B\.start\(id\)/.test(tv2), 'кнопка сразу стартует сессию');
assert.ok(/start: \(id\) => \{[^\n]*btnLapStart/.test(app), 'старт через существующий поток сессии');
assert.ok(/B\.sf\?B\.sf\(id\)/.test(tv2) && /sf: \(id\) =>/.test(app), 'С/Ф в карточке трассы');
assert.ok(/#view-lap \.lap-grid \{ display: none !important; \}/.test(css), 'дубли в списке скрыты');
assert.ok(lap.indexOf('id="trackSuggestCard"') > lap.indexOf('id="tv2"'), '«Предложить трассу» внизу');
assert.ok(/id="btnLapStart"/.test(html) && /lapStartFlow/.test(app), 'логика сессии на месте');
console.log('v267 ok');
// v270: вкладка «Трек» не должна перекрывать другие вкладки
assert.ok(!/^#view-lap \{ display:/m.test(css) && /^#view-lap\.active \{ display: flex/m.test(css), 'display только для активной вкладки');
