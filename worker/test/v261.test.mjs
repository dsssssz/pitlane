// v261: чистка интерфейса — Главная без дублей навигации, Профиль: чип, Бокс, «Справка»; Замер без призрака/видео/топа
import fs from 'fs';
const R = new URL('../../', import.meta.url).pathname; const rd = (f) => fs.readFileSync(R + f, 'utf8');
const html = rd('index.html'), app = rd('app.js'), sw = rd('sw.js');
let f = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) f++; };
ok(/pitlane-v(26[1-9]|2[7-9]\d|[3-9]\d\d)/.test(sw), 'версия ≥ v261');
const home = html.slice(html.indexOf('id="view-home"'), html.indexOf('id="view-zamer"'));
ok(!/data-bn52="(shop|tops|suggest)"/.test(home) && !/id="hwPad"|id="hwTop"/.test(home), 'Главная: нет баннеров/виджетов-ссылок на разделы и промо чипа');
const z = html.slice(html.indexOf('id="view-zamer"'), html.indexOf('id="view-garage"'));
ok(/id="z61Gps"/.test(z) && !/z61Ghost|h54Video|z202Top|data-view="history"/.test(z), 'Замер до старта: только источник GPS');
ok(/data-plm="ghost"/.test(html) && /data-plm="video"/.test(html) && /data-plm="history"/.test(html) && /id="shareCardGhost"/.test(html), 'призрак, видео, журнал — в меню и после заезда');
const pl = html.slice(html.indexOf('id="pf6List"'), html.indexOf('id="p48"'));
ok(!/Гараж и покраска/.test(pl) && (pl.match(/data-pf6="garage"/g) || []).length === 1 && !/data-pf6="mycar"/.test(pl), 'Профиль: один вход в Бокс');
ok(/data-pf6="chip"/.test(pl) && pl.indexOf('data-pf6="chip"') < pl.indexOf('data-pf6="garage"') && /k === 'chip'\) \{ try \{ window\.__gps61\?\.open\(\)/.test(app), 'Профиль: GPS-чип — первый пункт, открывает подключение/статус');
const help = pl.slice(pl.indexOf('Справка'));
ok(/data-pf6="suggest"/.test(help) && /method\.html/.test(help) && pl.indexOf('Справка') > pl.indexOf('data-pf6="settings"'), '«Предложить трассу» и «Как считаем время» — в «Справке»');
ok(/id="g53Studio"[^>]*>Цвет и детали/.test(html), 'покраска не потеряна — в Боксе');
console.log(f ? '\n✗ ' + f + ' failed' : '\nall ok'); process.exit(f ? 1 : 0);
