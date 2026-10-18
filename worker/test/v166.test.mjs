// v166: единый экран «Настройки» (группы как в iOS), меню ☰ из трёх групп, Профиль без дублей.
import fs from 'fs';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const root = new URL('../../', import.meta.url); const rd = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const app = rd('app.js'); const css = rd('styles.css'); const sw = rd('sw.js'); const html = rd('index.html'); const tma = rd('tma.js');
ok(/const APP_VERSION = 'v1(6[6-9]|[7-9]\d)'/.test(app) && /const CACHE = 'pitlane-v1(6[6-9]|[7-9]\d)'/.test(sw) && /'v165', 'v166'/.test(app), 'версия v166');
const st = html.slice(html.indexOf('id="view-settings"'), html.indexOf('</section>', html.indexOf('id="view-settings"')));
ok(['Аккаунт', 'Моя машина', 'GPS и датчики', 'Графика', 'Уведомления', 'Звук и вибрация', 'Язык', 'Помощь', 'Документы', 'О приложении'].every((g) => st.includes(`<p class="st66-h">${g}</p>`)), 'группы Настроек');
ok(['id="langSelect"', 'id="sfxToggle"', 'id="hapToggle"', 'id="accNotify"', 'id="accFollows"', 'id="imuCard"', 'id="accGfx"', 'id="btnLogout"', 'id="btnDeleteAccount"', 'id="btnMyCarAcc"', 'id="btnTipsReset"', 'id="accCarPhoto"', 'data-st="gps"', './privacy.html'].every((x) => st.includes(x)), 'разбросанные настройки перенесены в один экран');
ok(/if \(k === 'settings'\) \{ goToView\('settings'\)/.test(app), '☰ → Настройки — отдельный экран');
ok(/localStorage\.getItem\('pitlane-hap-off'\) === '1'\) return true;/.test(tma) && /function hap\(ms = 12\) \{\n  try \{ if \(localStorage\.getItem\('pitlane-hap-off'\)/.test(app), 'вибрацию можно выключить');
const menu = html.slice(html.indexOf('id="plMenuPanel"'), html.indexOf('</aside>', html.indexOf('id="plMenuPanel"')));
ok(['Разделы', 'Ещё', 'Приложение'].every((g) => menu.includes(`<p class="plm-h">${g}</p>`)) && ['history', 'tops', 'duels', 'pulse', 'team', 'shop', 'suggest', 'settings', 'feedback', 'method'].every((k) => menu.includes(`data-plm="${k}"`)), '☰: три группы, все разделы в 2 нажатия');
ok(/id="p48" aria-label="Разделы" hidden/.test(html) && /class="acc-crew-row" hidden/.test(html) && /data-st="settings"/.test(html), 'Профиль: без дублей, внизу — Настройки');
ok(/id="btnProfile" title="Профиль" aria-label="Профиль"/.test(html), 'кнопка профиля (аватар) — без изменений');
ok(/\.st66-sw::after/.test(css) && /\.st66-list \{ overflow: hidden;/.test(css), 'стиль строк, переключателей и групп');
if (fails) { console.log('FAIL', fails); process.exit(1); } console.log('v166 OK');
