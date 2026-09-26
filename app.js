import {
  isTMA, WebApp as TG, tmaInitData, tmaAtLeast, telegramDeviceClass, START_ROUTE, setupTmaChrome,
  setBackHandler, showBack, setClosingGuard, tmaHaptic, canOpenLocationSettings, openLocationSettings,
  tmaStartLink, tmaShare, keepAwake,
} from './tma.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { attachPitlanePlates, isPitlanePlate } from './plates.js';
import { api, apiBase, isRemoteApi, setSessionToken, getSessionToken, devicePilotId, accountPilotId, actingPilotId, isMyPilotId } from './api.js';
// Telegram login redirect result must be read before any deep-link URL cleanup runs.
const TG_RETURN = captureTelegramReturn();
let _authCfg; // /auth/config cache (undefined = not loaded yet)
let _authCfgAt = 0;
let _tmaLogin = 'idle'; // TMA silent login: idle | pending | ok | failed | unconfigured
if (isTMA) setupTmaChrome();
else document.documentElement.classList.remove('tma');
import {
  mountLapSatMap,
  unmountLapSatMap,
  isLapSatMapActive,
  setLapSatMapMode,
  updateLapSatMapGps,
  trackOutlineQuality,
} from './track-sat-map.js';

function hap(ms = 12) {
  if (isTMA) {
    // Telegram HapticFeedback (navigator.vibrate is unavailable in iOS WebViews)
    const kind = Array.isArray(ms) ? (Math.max(...ms) >= 30 ? 'heavy' : 'medium') : (ms >= 18 ? 'medium' : (ms <= 10 ? 'select' : 'light'));
    if (tmaHaptic(kind)) return;
  }
  try { navigator.vibrate?.(ms); } catch (_) {}
}
document.addEventListener('click', (e) => {
  if (e.target.closest('button')) hap(10);
}, true);
if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
  document.documentElement.classList.add('standalone');
}

const CARS = [
  // BMW M2 Competition (G87) stock + widebody showcase — DIN/EU figures
  { id: 'g87-m2', name: 'BMW G87 M2 Widebody', cls: 'GT · RWD · 3.0 twin-turbo', year: 2026, trim: 'Competition · carbon widebody', side: './img/sil/coupe.svg', color: 0x1a1a1a, accent: 0x111, v0100: 3.9, v100200: null, v200300: null, v80120: 2.3, hp: 460, nm: 550, kg: 1725, lap: { track: 'nurb-nord', time: null }, glb: './models/g87-m2.glb' },
  { id: 'gt3rs', name: 'Porsche 911 GT3 RS', cls: 'GT · RWD · 4.0 NA', year: 2023, trim: '992 GT3 RS', side: './img/sil/gt-wing.svg', color: 0xeeeeee, accent: 0x111, v0100: 3.2, v100200: 10.6, v200300: null, v80120: 2.0, hp: 525, nm: 465, kg: 1450, lap: { track: 'nurb-nord', time: '6:49.33' }, glb: './models/gt3rs.glb' },
  { id: 'g63', name: 'Mercedes-AMG G 63', cls: 'SUV · AWD · 4.0 V8 biturbo', year: 2020, trim: 'W463 AMG', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: 4.5, v100200: null, v200300: null, v80120: 2.8, hp: 585, nm: 850, kg: 2485, lap: { track: 'nurb-nord', time: null }, glb: './models/g63.glb' },
  { id: 'mclaren-765lt', name: 'McLaren 765LT', cls: 'Super · RWD · 4.0 twin-turbo V8', year: 2021, trim: 'Longtail', side: './img/sil/super.svg', color: 0xff6600, accent: 0x111, v0100: 2.8, v100200: 6.5, v200300: 16.0, v80120: 1.7, hp: 765, nm: 800, kg: 1339, lap: { track: 'nurb-nord', time: null }, glb: './models/mclaren-765lt.glb' },
  { id: 'm3', name: 'BMW M3 Competition', cls: 'GT · RWD · 3.0 twin-turbo', year: 2023, trim: 'G80 Competition', side: './img/sil/sedan.svg', color: 0x8a1f1a, accent: 0x111, v0100: 3.5, v100200: 8.1, v200300: null, v80120: 2.1, hp: 510, nm: 650, kg: 1730, lap: { track: 'nurb-nord', time: '8:12.40' }, glb: './models/m3.glb' },
  { id: 'm4', name: 'BMW M4', cls: 'GT · RWD · 3.0 twin-turbo', year: 2021, trim: 'G82 Competition', side: './img/sil/coupe.svg', color: 0x8a1f1a, accent: 0x111, v0100: 3.5, v100200: 8.3, v200300: null, v80120: 2.1, hp: 510, nm: 650, kg: 1725, lap: { track: 'nurb-nord', time: null }, glb: './models/m4.glb' },
  { id: 'x6', name: 'BMW X6 xDrive40i', cls: 'SUV · AWD · 3.0 turbo', year: 2020, trim: 'G06 xDrive40i', side: './img/sil/suv.svg', color: 0x1a1a1a, accent: 0x111, v0100: 5.5, v100200: null, v200300: null, v80120: 3.4, hp: 340, nm: 450, kg: 2130, lap: { track: 'nurb-nord', time: null }, glb: './models/x6.glb' },
  { id: 'isf', name: 'Lexus IS-F', cls: 'GT · RWD · 5.0 V8', year: 2013, trim: 'USE20 IS-F', side: './img/sil/sedan.svg', color: 0xc5ccd3, accent: 0x111, v0100: 4.6, v100200: null, v200300: null, v80120: 2.9, hp: 423, nm: 505, kg: 1715, lap: { track: 'nurb-nord', time: null }, glb: './models/isf.glb' },
  { id: 'c63-ed507', name: 'Mercedes-AMG C 63 Edition 507', cls: 'GT · RWD · 6.2 V8', year: 2014, trim: 'W204 Edition 507', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: 4.2, v100200: null, v200300: null, v80120: 2.5, hp: 507, nm: 610, kg: 1730, lap: { track: 'nurb-nord', time: null }, glb: './models/c63-ed507.glb' },
  { id: 'spark', name: 'Chevrolet Spark GT', cls: 'City · FWD · 1.2', year: 2018, trim: 'GT 1.2 LT', side: './img/sil/hatch.svg', color: 0x1f4cff, accent: 0x111, v0100: 12.5, v100200: null, v200300: null, v80120: null, hp: 85, nm: 115, kg: 1085, lap: { track: 'nurb-nord', time: null }, glb: './models/spark.glb' },
  { id: 'm5', name: 'BMW M5 Competition', cls: 'GT · AWD · 4.4 V8', year: 2022, trim: 'F90 Competition', side: './img/sil/sedan.svg', color: 0xb9bcc0, accent: 0x111, v0100: 3.3, v100200: 8.0, v200300: 21.0, v80120: 2.0, hp: 625, nm: 750, kg: 1890, lap: { track: 'nurb-nord', time: '7:38.00' } },
  { id: 'm4csl', name: 'BMW M4 CSL', cls: 'GT · RWD · 3.0 twin-turbo', year: 2023, trim: 'G82 CSL', side: './img/sil/coupe.svg', color: 0x8a1f1a, accent: 0x111, v0100: 3.7, v100200: 8.5, v200300: null, v80120: 2.2, hp: 550, nm: 650, kg: 1625, lap: { track: 'nurb-nord', time: '7:20.00' } },
  { id: 'gtr', name: 'Nissan GT-R Nismo', cls: 'GT · AWD · 3.8 twin-turbo', year: 2022, trim: 'R35 Nismo', side: './img/sil/coupe.svg', color: 0xc5ccd3, accent: 0x111, v0100: 2.7, v100200: 7.2, v200300: 16.8, v80120: 1.7, hp: 600, nm: 652, kg: 1720, lap: { track: 'nurb-nord', time: '7:08.68' } },
  { id: 'huracan', name: 'Lamborghini Huracán STO', cls: 'Super · RWD · 5.2 V10', year: 2021, trim: 'STO', side: './img/sil/super.svg', color: 0x1f4cff, accent: 0x111, v0100: 3.0, v100200: 8.0, v200300: 18.4, v80120: 1.8, hp: 640, nm: 565, kg: 1339, lap: { track: 'nurb-nord', time: '6:52.01' } },
  { id: 'svj', name: 'Lamborghini Aventador SVJ', cls: 'Super · AWD · 6.5 V12', year: 2019, trim: 'SVJ', side: './img/sil/hyper.svg', color: 0x1a6b3c, accent: 0x111, v0100: 2.8, v100200: 7.1, v200300: 16.7, v80120: 1.7, hp: 770, nm: 720, kg: 1525, lap: { track: 'nurb-nord', time: '6:44.97' } },
  { id: 'sf90', name: 'Ferrari SF90 Stradale', cls: 'Super · AWD · V8 hybrid', year: 2021, trim: 'Stradale', side: './img/sil/super.svg', color: 0xc41e3a, accent: 0x111, v0100: 2.5, v100200: 6.5, v200300: 15.2, v80120: 1.5, hp: 1000, nm: 800, kg: 1570, lap: { track: 'nurb-nord', time: '6:44.00' } },
  { id: '296', name: 'Ferrari 296 GTB', cls: 'Super · RWD · V6 hybrid', year: 2023, trim: 'GTB', side: './img/sil/super.svg', color: 0xc41e3a, accent: 0x111, v0100: 2.9, v100200: 7.6, v200300: 19.0, v80120: 1.8, hp: 830, nm: 740, kg: 1470, lap: { track: 'nurb-nord', time: '6:49.00' } },
  { id: 'amggt', name: 'Mercedes-AMG GT Black Series', cls: 'GT · RWD · 4.0 V8', year: 2021, trim: 'Black Series', side: './img/sil/gt-coupe.svg', color: 0x111111, accent: 0x111, v0100: 3.2, v100200: 8.0, v200300: 20.0, v80120: 1.9, hp: 730, nm: 800, kg: 1540, lap: { track: 'nurb-nord', time: '6:43.00' } },
  { id: 'c63', name: 'Mercedes-AMG C63 S E Performance', cls: 'GT · AWD · 2.0 hybrid', year: 2024, trim: 'W206 S', side: './img/sil/sedan.svg', wheels: './img/c63-wheels.png', color: 0x8a1f1a, accent: 0x111, v0100: 3.4, v100200: 8.4, v200300: null, v80120: 2.1, hp: 680, nm: 1020, kg: 2111, lap: { track: 'nurb-nord', time: '7:46.00' } },
  { id: 'rs6', name: 'Audi RS6 Avant', cls: 'GT · AWD · 4.0 V8', year: 2023, trim: 'C8 Performance', side: './img/sil/wagon.svg', color: 0xc5ccd3, accent: 0x111, v0100: 3.4, v100200: 8.4, v200300: 22.0, v80120: 2.1, hp: 630, nm: 850, kg: 2090, lap: { track: 'nurb-nord', time: '7:38.00' } },
  { id: 'r8', name: 'Audi R8 V10 Performance', cls: 'Super · AWD · 5.2 V10', year: 2022, trim: 'RWS / Perf.', side: './img/sil/super.svg', color: 0x1f4cff, accent: 0x111, v0100: 3.1, v100200: 8.2, v200300: 20.0, v80120: 1.9, hp: 620, nm: 580, kg: 1595, lap: { track: 'nurb-nord', time: '7:07.00' } },
  { id: 'cayman', name: 'Porsche 718 Cayman GT4 RS', cls: 'GT · RWD · 4.0 NA', year: 2022, trim: 'GT4 RS', side: './img/sil/gt-wing.svg', color: 0x39FF14, accent: 0x111, v0100: 3.4, v100200: 10.6, v200300: null, v80120: 2.1, hp: 500, nm: 450, kg: 1415, lap: { track: 'nurb-nord', time: '7:09.00' } },
  { id: 'turboS', name: 'Porsche 911 Turbo S', cls: 'GT · AWD · 3.8 twin-turbo', year: 2023, trim: '992 Turbo S', side: './img/sil/gt-coupe.svg', color: 0x111111, accent: 0x111, v0100: 2.6, v100200: 7.4, v200300: 18.8, v80120: 1.6, hp: 650, nm: 800, kg: 1640, lap: { track: 'nurb-nord', time: '7:12.00' } },
  { id: 'supra', name: 'Toyota GR Supra', cls: 'GT · RWD · 3.0 turbo', year: 2023, trim: 'A90 3.0', side: './img/sil/coupe.svg', color: 0xc41e3a, accent: 0x111, v0100: 4.1, v100200: 11.0, v200300: null, v80120: 2.6, hp: 387, nm: 500, kg: 1520, lap: { track: 'nurb-nord', time: '7:52.00' } },
  { id: 'golf', name: 'Volkswagen Golf R', cls: 'Hot hatch · AWD · 2.0 turbo', year: 2022, trim: 'Mk8 R', side: './img/sil/hatch.svg', color: 0x1f4cff, accent: 0x111, v0100: 4.6, v100200: 13.5, v200300: null, v80120: 3.1, hp: 320, nm: 420, kg: 1550, lap: { track: 'nurb-nord', time: '8:01.00' } },
  { id: 'civic', name: 'Honda Civic Type R', cls: 'Hot hatch · FWD · 2.0 turbo', year: 2023, trim: 'FL5', side: './img/sil/hatch.svg', color: 0xc41e3a, accent: 0x111, v0100: 5.4, v100200: 14.8, v200300: null, v80120: 3.4, hp: 330, nm: 420, kg: 1429, lap: { track: 'nurb-nord', time: '7:50.00' } },
  { id: 'mustang', name: 'Ford Mustang Dark Horse', cls: 'GT · RWD · 5.0 V8', year: 2024, trim: 'S650 Dark Horse', side: './img/sil/muscle.svg', color: 0x111111, accent: 0x111, v0100: 4.1, v100200: 11.2, v200300: null, v80120: 2.6, hp: 500, nm: 567, kg: 1768, lap: { track: 'nurb-nord', time: '7:43.00' } },
  { id: 'teslap', name: 'Tesla Model S Plaid', cls: 'EV · AWD · tri-motor', year: 2023, trim: 'Plaid', side: './img/sil/ev.svg', color: 0xc5ccd3, accent: 0x111, v0100: 2.1, v100200: 6.0, v200300: 15.0, v80120: 1.3, hp: 1020, nm: 1420, kg: 2162, lap: { track: 'nurb-nord', time: '7:25.00' } },
];

const TRACKS = [
  // cult: first-class RU tracks with verified-ish S/F in TRACK_GEO
  { id: 'sochi', name: 'Сочи Автодром', cult: true, ref: '1:35.00', km: '5.85', turns: '18' , corners: 'T2 — жёсткое торможение после прямой. T3 — длинный постоянный радиус. Финальная связка — медленные 90°.'},
  { id: 'moscow', name: 'Moscow Raceway', cult: true, ref: '1:28.50', km: '3.93', turns: '13' , corners: 'Длинная прямая в последний сектор. Средний сектор рулёжный. Несколько конфигураций срезают связки.'},
  { id: 'igora', name: 'Игора Драйв', cult: true, ref: '1:36.20', km: '5.18', turns: '20' , corners: 'Очень длинная С/Ф. Много средних поворотов против часовой. Перепад заметный на спуске.'},
  { id: 'kazan', name: 'Казань Ринг', cult: true, ref: '1:22.80', km: '3.48', turns: '12' , corners: 'Каньон: слепые вершины, уклоны до ~10%. Движение против часовой. Длинная прямая ~800 м.'},
  { id: 'smolensk', name: 'Смоленское кольцо', cult: true, ref: '1:24.00', km: '3.36', turns: '14' , corners: 'Техничное кольцо, средние радиусы, мало мест для отдыха.'},
  { id: 'nring', name: 'NRING Нижний Новгород', cult: true, ref: '1:21.50', km: '3.12', turns: '12' , corners: 'Короткое кольцо, плотная нарезка, мало времени на ошибку.'},
  { id: 'adm', name: 'ADM Raceway Мячково', cult: true, ref: '1:19.00', km: '3.25', turns: '16' , corners: 'Мячково: старое кольцо, короткие прямые, много направления.'},
  { id: 'grozny', name: 'Fort Grozny Autodrom', cult: true, ref: '1:18.80', km: '3.08', turns: '11' , corners: 'Крепость: относительно короткое GP, понятные зоны торможения.'},
  { id: 'redring', name: 'Красное Кольцо Красноярск', cult: true, ref: '1:26.00', km: '2.80', turns: '10' , corners: 'Компактное кольцо, меньше поворотов, акцент на ритм.'},
  { id: 'spb', name: 'Автодром Санкт-Петербург', ref: '1:27.00' , corners: 'Городской/короткий профиль, тесные связки.'},
  { id: 'tlt', name: 'Тольятти Ринг', ref: '1:23.00' , corners: 'Кольцо с средней длиной прямых.'},
  { id: 'lipetsk', name: 'Липецкий автодром', ref: '1:20.00' , corners: 'Короткий автодром, стоп-энд-гоу.'},
  { id: 'auto-msk', name: 'Автодром Москва', ref: '1:25.00' , corners: 'Городской автодром, смена направления часто.'},
  { id: 'neva', name: 'Нева Ринг', ref: '1:29.00' , corners: 'Нева: средние дуги, мало ультрамедленных шпилек.'},
  { id: 'ufa', name: 'Уфа Ринг', ref: '1:31.00' , corners: 'Региональное кольцо, ритм важнее пиковой скорости.'},
  { id: 'don', name: 'Донринг Ростов', ref: '1:30.00' , corners: 'Донринг: смесь прямых и средних дуг.'},
];

function tracksOrdered() {
  return TRACKS.slice().sort((a, b) => Number(!!b.cult) - Number(!!a.cult));
}


/** Rich discovery cards for cult autodromes. Honest copy; only real official URLs. */
const AUTODROME_INFO = {
  sochi: {
    blurb: 'Единственный российский трек, принимавший Ф1. Сейчас — Сириус Автодром в Олимпийском парке. Длинная финишная, жёсткое торможение в T2, техничная финальная связка.',
    configs: 'Исторически GP ~5.8 км / 18 пов.; актуальная конфигурация — уточняйте на сайте (есть укороченные варианты).',
    site: 'https://siriusautodrom.ru',
    buy: 'Календарь сессий и трек-дней — на сайте автодрома.',
  },
  moscow: {
    blurb: 'Флагман Подмосковья у Волоколамского. Несколько конфигураций, открытый питлейн и регулярные трек-дни.',
    configs: 'Полная ~3.9 км / 13 пов.; укороченные варианты срезают связки.',
    site: 'https://moscowraceway.ru',
    buy: 'Трек-дни и открытый питлейн — расписание на moscowraceway.ru.',
  },
  igora: {
    blurb: 'Современный комплекс Ленобласти: длинная С/Ф, перепад на спуске, много средних поворотов против часовой.',
    configs: 'Шоссейно-кольцевая ~5.2 км / ~20 пов.; плюс картинг и контраварийка на территории.',
    site: 'https://drive-igora.ru',
    buy: 'Сессии и курсы — на сайте Игора Драйв.',
  },
  kazan: {
    blurb: 'KazanRing Canyon: слепые вершины, уклоны, длинная прямая ~800 м. Движение против часовой.',
    configs: 'Основное кольцо ~3.5 км / 12 пов.',
    site: 'https://kznring.ru',
    buy: 'Расписание и запись — на сайте автодрома.',
  },
  smolensk: {
    blurb: 'Техничное кольцо Смоленской области: средние радиусы, мало мест «отдохнуть».',
    configs: 'Типичная GP-конфигурация ~3.3–3.4 км / ~14 пов.',
    site: null,
    buy: 'Сессии и цены — уточняйте на сайте автодрома.',
  },
  nring: {
    blurb: 'Короткое плотное кольцо у Нижнего: мало времени на ошибку, плотная нарезка.',
    configs: '~3.1 км / ~12 пов.',
    site: null,
    buy: 'Трек-дни — уточняйте на сайте автодрома.',
  },
  adm: {
    blurb: 'Мячково: старое техничное кольцо Подмосковья, короткие прямые, частая смена направления.',
    configs: '~3.2 км / много поворотов; конфигурации менялись — смотрите актуальную карту.',
    site: null,
    buy: 'Сессии — уточняйте на сайте автодрома.',
  },
  grozny: {
    blurb: 'Fort Grozny: относительно короткий GP, понятные зоны торможения, крепостная атмосфера.',
    configs: '~3.1 км / ~11 пов.',
    site: null,
    buy: 'Расписание — уточняйте на сайте автодрома.',
  },
  redring: {
    blurb: 'Красное Кольцо у Красноярска: компактное кольцо, акцент на ритм, меньше поворотов.',
    configs: '~2.8 км / ~10 пов.',
    site: null,
    buy: 'Сессии — уточняйте на сайте автодрома.',
  },
};

function moscowDateKeyClient(ms = Date.now()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch (_) {
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
}

function dayHashClient(key) {
  let h = 2166136261;
  const s = String(key);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cultTracksList() {
  return TRACKS.filter((t) => t.cult);
}

function pickSessionTrackClient() {
  const cult = cultTracksList();
  const list = cult.length ? cult : TRACKS;
  const date = moscowDateKeyClient();
  const idx = dayHashClient(date) % list.length;
  const t = list[idx];
  return { trackId: t.id, title: t.name, date, source: 'hash' };
}

function filterTopsToday(rows, dateKey) {
  const key = dateKey || moscowDateKeyClient();
  return (rows || []).filter((r) => {
    if (!r || !r.gps || r.valid === false) return false;
    if (Array.isArray(r.flags) && r.flags.includes('teleport')) return false;
    if (r.gpsQ !== 'A' && r.gpsQ !== 'B') return false;
    if (!r.at) return false;
    return moscowDateKeyClient(Number(r.at)) === key;
  });
}

function parseLapMsClient(t) {
  const m = String(t || '').match(/^(\d+):(\d{2})(?:\.(\d+))?$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const frac = m[3] ? Number('0.' + m[3]) : 0;
  return Math.round((min * 60 + sec + frac) * 1000);
}





// Approximate S/F gate points (WGS84). Cult tracks: tightened to known paddock/S-F areas.
// Sochi ≈ main straight S/F; Moscow Raceway ≈ pit straight; Igora ≈ long S/F;
// Kazan/Smolensk/NRING/ADM/Grozny/RedRing ≈ circuit S/F vicinity. Others are rough.
const TRACK_GEO = {
  // Cult: S/F aligned to OSM facility / Sochi racing-line (phone GPS ±tens of m).
  sochi: { lat: 43.4055, lon: 39.9578 },      // Sochi Autodrom main S/F ~pit straight
  moscow: { lat: 55.99543, lon: 36.26303 },     // MRW — OSM facility
  igora: { lat: 60.51142, lon: 30.19689 },      // Игора Драйв — OSM facility
  kazan: { lat: 55.86744, lon: 49.26034 },      // KazanRing — OSM facility
  smolensk: { lat: 54.98902, lon: 33.36762 },   // Смоленское кольцо — OSM
  nring: { lat: 56.12047, lon: 43.60267 },      // Нижегородское кольцо — OSM
  adm: { lat: 55.559, lon: 37.9782 },        // ADM Myachkovo (outline approx)
  grozny: { lat: 43.3051, lon: 45.65818 },     // Fort Grozny — OSM
  redring: { lat: 56.12732, lon: 92.74132 },    // Красное Кольцо — OSM
  spb: { lat: 59.97, lon: 30.24, rough: true }, // club / street-ish
  tlt: { lat: 53.53, lon: 49.35, rough: true }, // club / street-ish
  lipetsk: { lat: 52.56, lon: 39.52, rough: true }, // club / street-ish
  'auto-msk': { lat: 55.7, lon: 37.4, rough: true }, // club / street-ish
  neva: { lat: 59.9, lon: 30.4, rough: true }, // club / street-ish
  ufa: { lat: 54.7, lon: 56.0, rough: true }, // club / street-ish
  don: { lat: 47.28, lon: 39.7, rough: true }, // club / street-ish
};

/** Approx lat/lon rings for soft corridor math (NOT display SVG). Densified near S/F. */
const TRACK_POLY = (() => {
  const out = {};
  for (const [id, g] of Object.entries(TRACK_GEO)) {
    const tr = typeof TRACKS !== 'undefined' ? TRACKS.find((t) => t.id === id) : null;
    const km = parseFloat(tr?.km) || 3.5;
    // ellipse semi-axes ~ circuit scale (very rough; only for soft proximity assist)
    const a = Math.max(180, Math.min(900, km * 1000 * 0.18)); // m east
    const b = Math.max(120, Math.min(700, km * 1000 * 0.12)); // m north
    const pts = [];
    const N = 48;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      // densify near S/F (th≈0 / gate at northern-ish point of oval)
      const e = Math.sin(th) * a;
      const n = Math.cos(th) * b;
      const lat = g.lat + n / 111320;
      const lon = g.lon + e / (111320 * Math.cos(g.lat * Math.PI / 180));
      pts.push({ lat, lon });
    }
    out[id] = pts;
  }
  return out;
})();


const TRACK_SVG = {
  // Sochi Autodrom — detailed GP centerline (kept)
  sochi: 'M260.37 78.48 L244.49 96.31 L240.92 98.98 L236.03 101.71 L230.64 103.82 L222.94 105.56 L202.57 109.51 L172.35 115.42 L140.03 121.66 L137.93 121.5 L137.16 121.05 L136.67 119.59 L135.83 117.54 L134.5 116.03 L119.87 105.67 L114.63 102.88 L108.12 100.99 L100.29 100.49 L92.66 101.6 L86.22 104.05 L81.18 107.45 L78.11 110.8 L75.65 114.86 L74.74 119.26 L75.17 124.17 L76.92 128.34 L86.01 142.05 L86.22 143.61 L85.38 144.84 L83.29 145.95 L34.94 166.85 L33.46 167.29 L31.16 167.35 L29.48 166.63 L28.36 165.56 L16.39 146.12 L15.27 142.83 L15.0 140.16 L15.34 137.21 L18.43 125.89 L18.98 124.95 L20.18 124.5 L21.71 124.17 L61.1 119.88 L62.08 119.59 L62.99 119.04 L63.69 118.32 L66.14 111.24 L66.35 110.18 L66.49 108.85 L66.28 107.68 L54.04 82.65 L54.04 81.65 L54.53 80.76 L55.44 79.87 L56.76 79.2 L69.08 75.58 L74.74 74.63 L80.06 73.91 L87.34 73.52 L93.77 73.57 L101.13 74.13 L108.05 75.08 L120.23 76.53 L126.73 77.75 L133.39 79.48 L140.58 81.6 L165.35 89.79 L172.15 91.52 L178.29 92.46 L185.15 92.91 L192.22 92.69 L198.8 91.79 L208.87 89.67 L210.77 90.01 L211.53 90.9 L214.68 98.71 L216.16 99.82 L218.67 100.49 L221.39 100.37 L225.32 99.71 L229.73 98.09 L233.64 95.53 L236.87 92.24 L243.99 84.77 L244.35 83.88 L244.21 83.16 L242.88 82.38 L236.37 78.87 L235.18 77.64 L234.76 75.91 L235.53 74.35 L245.88 62.71 L255.12 51.73 L262.54 43.43 L264.22 42.65 L266.31 43.09 L282.9 48.44 L284.43 49.12 L285.0 50.11 L284.57 51.23 L260.37 78.48 Z',
  // Moscow Raceway GP — Tilke: long pit straight, right complex, technical top, left return
  moscow: 'M36 172 L70 170 L120 164 L170 154 L205 140 C225 128 242 110 250 88 C258 66 252 48 232 38 C212 28 190 34 175 52 C160 70 148 92 130 110 C112 128 88 140 60 148 L38 156 C28 160 26 168 32 172 L36 172 Z',
  // Igora Drive GP — long S/F, CCW, elevation loop on far end, dense mid sector
  igora: 'M22 168 L60 168 L110 166 L165 160 L210 148 C235 136 255 115 262 90 C268 68 260 48 238 38 C218 28 198 34 185 52 C174 68 162 88 145 105 C125 125 98 140 68 150 L40 158 C28 162 20 166 22 168 Z',
  // Kazan Ring — canyon: irregular, blind crests, long straight ~800m, CCW
  kazan: 'M68 36 L115 24 L160 30 L195 48 C218 64 238 88 250 118 C258 142 248 168 218 178 C180 190 140 182 105 162 C72 142 48 112 46 80 C44 55 52 40 68 36 Z',
  // Смоленское кольцо — technical, mid-radius, few rest spots
  smolensk: 'M50 130 L62 78 C78 42 125 26 175 30 C225 34 262 60 272 100 C280 135 258 168 215 180 C160 196 95 188 58 158 C40 144 42 136 50 130 Z',
  // NRING — short dense ring, tight sequence
  nring: 'M55 118 L68 62 C88 30 148 22 205 42 C245 58 272 95 262 132 C250 172 195 188 130 182 C78 176 42 148 42 120 C42 112 48 116 55 118 Z',
  // ADM Raceway Myachkovo — old technical: short straights, many direction changes
  adm: 'M36 122 L48 78 L78 48 L120 34 L168 30 L215 42 L255 70 L278 110 L270 145 L235 175 L175 188 L115 180 L68 158 L42 135 L36 122 Z',
  // Fort Grozny — compact GP, clear braking zones
  grozny: 'M72 46 L130 26 L195 34 L245 62 C268 82 278 118 262 148 C242 182 180 192 120 182 C75 174 40 145 40 105 C40 75 52 55 72 46 Z',
  // Красное Кольцо — compact, fewer corners, rhythm focus
  redring: 'M45 148 L55 82 C72 42 140 26 210 40 C255 52 282 95 268 138 C254 178 185 192 115 186 C70 182 40 168 45 148 Z',
  // Remaining regional rings — circuit-shaped (not blobs)
  spb: 'M50 55 L130 42 L220 48 L268 95 L250 150 L170 178 L70 165 L35 110 L50 55 Z',
  tlt: 'M48 105 L80 50 C115 28 200 30 245 70 C275 105 260 155 200 175 C130 198 55 165 42 120 C40 110 44 108 48 105 Z',
  lipetsk: 'M52 60 L150 42 L240 70 L265 130 L200 175 L90 168 L40 115 L52 60 Z',
  'auto-msk': 'M45 110 L70 50 C110 25 200 28 255 75 C278 110 240 165 160 178 C90 190 40 150 38 115 C38 108 42 110 45 110 Z',
  neva: 'M50 90 L110 40 L210 38 L265 85 L270 140 L180 178 L70 155 L40 110 L50 90 Z',
  ufa: 'M60 100 L100 45 C140 25 220 30 255 80 C275 115 240 165 160 178 C95 190 48 150 50 115 C51 105 55 102 60 100 Z',
  don: 'M52 95 L100 40 C145 22 230 35 262 85 C278 120 245 165 165 180 C95 192 45 150 42 110 C42 100 48 98 52 95 Z'
};

function ensurePathProbe() {
  const svgNS = 'http://www.w3.org/2000/svg';
  let host = document.getElementById('_pathProbe');
  if (!host) {
    host = document.createElementNS(svgNS, 'svg');
    host.id = '_pathProbe';
    host.setAttribute('width', '0');
    host.setAttribute('height', '0');
    host.style.cssText = 'position:absolute;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(host);
  }
  return host;
}

function pointOnTrack(d, progress) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const host = ensurePathProbe();
  let path = host.querySelector('path');
  if (!path || path.getAttribute('d') !== d) {
    host.innerHTML = '';
    path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    host.appendChild(path);
  }
  const len = path.getTotalLength() || 1;
  const t = Math.max(0, Math.min(1, progress));
  const p = path.getPointAtLength(t * len);
  const p2 = path.getPointAtLength(Math.min(1, t + 0.01) * len);
  const ang = Math.atan2(p2.y - p.y, p2.x - p.x) * 180 / Math.PI;
  return { x: p.x, y: p.y, ang, len };
}


function drawTrack(id, elId, opts) {
  const el = document.getElementById(elId);
  if (!el) return;
  const compact = !!(opts && opts.compact);
  const live = !!(opts && opts.live);
  const d = TRACK_SVG[id] || TRACK_SVG.sochi;
  const tr = TRACKS.find((x) => x.id === id) || {};
  const geo = TRACK_GEO[id];
  const sfLabel = geo?.rough ? 'С/Ф приблизителен' : (tr.cult && geo ? 'проверен С/Ф' : '');
  const meta = [tr.km && (tr.km + ' км'), tr.turns && (tr.turns + ' пов.'), sfLabel].filter(Boolean).join(' · ');
  const sf = pointOnTrack(d, 0);
  const sfMark = '<g class="sf-mark" transform="translate(' + sf.x + ',' + sf.y + ')">'
    + '<line x1="-11" y1="-16" x2="-11" y2="16" stroke="#fff" stroke-width="2.2"/>'
    + '<rect x="-11" y="-16" width="9" height="9" fill="#111"/><rect x="-2" y="-16" width="9" height="9" fill="#eee"/>'
    + '<rect x="-11" y="-7" width="9" height="9" fill="#eee"/><rect x="-2" y="-7" width="9" height="9" fill="#111"/>'
    + '<text x="16" y="4" fill="#39FF14" font-size="11" font-family="Barlow Condensed,sans-serif" font-weight="700">С/Ф</text>'
    + '</g>';
  const car = live
    ? '<g id="lapCarMark" class="lap-car-mark" transform="translate(0,0) rotate(0)">'
      + '<circle class="lap-car-glow" r="16" cx="0" cy="0"/>'
      + '<polygon class="lap-car-chevron" points="0,-13 10,12 -10,12"/>'
      + '</g>'
    : '';
  // Autodrome layers: runoff apron → asphalt ribbon → curb dashes → neon racing line
  const join = ' stroke-linejoin="round" stroke-linecap="round"';
  const layers =
    '<path class="track-apron" d="' + d + '" fill="none" stroke="#2c2c2c" stroke-width="28"' + join + '/>'
    + '<path class="track-asphalt" d="' + d + '" fill="none" stroke="#1a1a1a" stroke-width="16"' + join + '/>'
    + '<path class="track-curb" d="' + d + '" fill="none" stroke="rgba(240,240,240,.22)" stroke-width="16" stroke-dasharray="3 9"' + join + '/>'
    + '<path class="track-edge" d="' + d + '" fill="none" stroke="rgba(57,255,20,.12)" stroke-width="10"' + join + '/>'
    + '<path class="track-line" d="' + d + '" fill="none" stroke="#39FF14" stroke-width="3.2"' + join + '/>';
  const svgInner = '<g class="track-scene">' + layers + sfMark + car + '</g>';
  const svg = '<svg viewBox="0 0 300 210" class="track-svg" ' + (live ? 'id="lapTrackSvg" ' : '')
    + 'preserveAspectRatio="xMidYMid meet">' + svgInner + '</svg>';
  if (live) {
    // reset smooth mapper when (re)drawing live HUD
    try { resetLapMapSmooth(id); } catch (_) {}
  }
  if (compact || live) {
    el.innerHTML = '<div class="lap-map-inner' + (live ? ' lap-map-live' : '') + '">' + svg
      + '<p class="lap-map-cap">' + (tr.name || '') + '<br><small>' + meta + '</small></p></div>';
    return;
  }
  el.innerHTML = svg + '<p>' + (tr.name || '') + '<br><small>' + meta + '</small></p><p class="track-notes">' + (tr.corners || '') + '</p>';
}



const storeKey = 'pitlane-v1';
const state = loadState();
if (!state.passportGps) state.passportGps = {};
let podiumModelId = null;
let _sectorTopIdx = 0; // sector tops chip index (hoisted: renderTops() may run before its section)

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey)) || { carId: null, garage: [], meas: {}, laps: {}, scans: {}, passport: {}, passportGps: {} };
    const inCars = !!(s.carId && CARS.some((c) => c.id === s.carId));
    const inGarage = !!(s.carId && (s.garage || []).some((c) => c.id === s.carId));
    // Catalog / stock ids must resolve; unknown ids fall back to G87 M2 (not M3).
    if (!s.carId || (!inCars && !inGarage)) s.carId = 'g87-m2';
    return s;
  } catch {
    return { carId: 'g87-m2', garage: [], meas: {}, laps: {}, scans: {}, passport: {} };
  }
}
function save() {
  try { scheduleGarageSync(); } catch (_) {}
  localStorage.setItem(storeKey, JSON.stringify(state));
  try {
    if (typeof authDb === 'undefined' || !authDb?.users) return;
    const u = authDb.session ? authDb.users[authDb.session] : null;
    if (!u) return;
    u.garage = state.garage || [];
    u.carId = state.carId || null;
    try {
      const nick = JSON.parse(localStorage.getItem('pitlane-prof-v1') || '{}').nick;
      if (nick) u.nick = nick;
    } catch (_) {}
    authDb.users[authDb.session] = u;
    localStorage.setItem('pitlane-auth-v1', JSON.stringify(authDb));
    localStorage.setItem('pitlane-auth-v1:bak', JSON.stringify(authDb));
  } catch (_) {}
}

function garageList() {
  return state.garage || [];
}
function currentCar() {
  const mine = garageList().find((c) => c.id === state.carId);
  if (mine) return mine;
  const stock = CARS.find((c) => c.id === state.carId);
  if (stock) return stock;
  const fallback = CARS.find((c) => c.id === 'g87-m2') || CARS[0];
  return garageList()[0] || fallback;
}

function fmt(v, unit = ' с') {
  return v == null || v === '' ? '—' : `${Number(v).toFixed(2).replace(/\.00$/, '')}${unit}`;
}


/** Stock passport by model id (internet/OEM baselines). Overrides in state.passport[id]. */
const PASSPORT_STOCK = {
  'g87-m2': {
    // BMW M2 Competition G87 (official): 460 PS, 550 Nm, ~3.9–4.1 s 0–100, curb ~1725 kg DIN
    name: 'BMW G87 M2 Widebody',
    trim: '2026 · Competition · carbon widebody',
    v0100: 3.9,
    v100200: null,
    v200300: null,
    v80120: 2.3,
    hp: 460,
    nm: 550,
    kg: 1725,
    note: 'сток G87 Competition · widebody — твои цифры',
  },
  gt3rs: {
    name: 'Porsche 911 GT3 RS',
    trim: '2023 · 992 GT3 RS',
    v0100: 3.2,
    v100200: 10.6,
    v200300: null,
    v80120: 2.0,
    hp: 525,
    nm: 465,
    kg: 1450,
    note: 'сток 992 GT3 RS',
  },
  g63: {
    name: 'Mercedes-AMG G 63',
    trim: '2020 · W463 AMG · 4.0 V8',
    v0100: 4.5,
    v100200: null,
    v200300: null,
    v80120: 2.8,
    hp: 585,
    nm: 850,
    kg: 2485,
    note: 'сток AMG G 63 · ~585 л.с. / 850 Н·м',
  },
  'mclaren-765lt': {
    name: 'McLaren 765LT',
    trim: '2021 · Longtail',
    v0100: 2.8,
    v100200: 6.5,
    v200300: 16.0,
    v80120: 1.7,
    hp: 765,
    nm: 800,
    kg: 1339,
    note: 'сток 765LT · ~765 л.с. / 800 Н·м',
  },
  m3: {
    name: 'BMW M3 Competition',
    trim: '2023 · G80 Competition',
    v0100: 3.5,
    v100200: 8.1,
    v200300: null,
    v80120: 2.1,
    hp: 510,
    nm: 650,
    kg: 1730,
    note: 'сток G80 M3 Competition · ~510 л.с. / 650 Н·м',
  },
  m4: {
    name: 'BMW M4',
    trim: '2021 · G82 Competition',
    v0100: 3.5,
    v100200: 8.3,
    v200300: null,
    v80120: 2.1,
    hp: 510,
    nm: 650,
    kg: 1725,
    note: 'сток G82 M4 Competition · ~510 л.с.',
  },
  x6: {
    name: 'BMW X6 xDrive40i',
    trim: '2020 · G06 xDrive40i',
    v0100: 5.5,
    v100200: null,
    v200300: null,
    v80120: 3.4,
    hp: 340,
    nm: 450,
    kg: 2130,
    note: 'сток X6 xDrive40i · ~340 л.с.',
  },
  isf: {
    name: 'Lexus IS-F',
    trim: '2013 · USE20 IS-F',
    v0100: 4.6,
    v100200: null,
    v200300: null,
    v80120: 2.9,
    hp: 423,
    nm: 505,
    kg: 1715,
    note: 'сток IS-F · ~423 л.с. / 5.0 V8',
  },
  'c63-ed507': {
    name: 'Mercedes-AMG C 63 Edition 507',
    trim: '2014 · W204 Edition 507',
    v0100: 4.2,
    v100200: null,
    v200300: null,
    v80120: 2.5,
    hp: 507,
    nm: 610,
    kg: 1730,
    note: 'сток C 63 Edition 507 · ~507 л.с. (не путать с W206 hybrid)',
  },
  spark: {
    name: 'Chevrolet Spark GT',
    trim: '2018 · GT 1.2 LT',
    v0100: 12.5,
    v100200: null,
    v200300: null,
    v80120: null,
    hp: 85,
    nm: 115,
    kg: 1085,
    note: 'сток Spark GT · ~85 л.с.',
  },
};

function passportId() {
  try {
    return (typeof podiumModelId !== 'undefined' && podiumModelId) || state.carId || 'g87-m2';
  } catch (_) {
    return state.carId || 'g87-m2';
  }
}

function getPassport(id) {
  const key = id || passportId();
  const stock = PASSPORT_STOCK[key] || {};
  const car = CARS.find((c) => c.id === key) || {};
  const saved = (state.passport && state.passport[key]) || {};
  const base = {
    v0100: stock.v0100 ?? car.v0100 ?? null,
    v100200: stock.v100200 ?? car.v100200 ?? null,
    v200300: stock.v200300 ?? car.v200300 ?? null,
    v80120: stock.v80120 ?? car.v80120 ?? null,
    hp: stock.hp ?? car.hp ?? null,
    nm: stock.nm ?? car.nm ?? null,
    kg: stock.kg ?? car.kg ?? null,
    name: stock.name || car.name || key,
    trim: stock.trim || (car.year ? `${car.year} · ${car.trim || ''}` : ''),
    note: stock.note || 'паспорт модели',
  };
  const out = { ...base };
  for (const [k, v] of Object.entries(saved)) {
    if (v != null && v !== '') out[k] = v;
  }
  return out;
}

/** Pure catalog/OEM stock (no manual overrides). */
function getPassportStock(id) {
  const key = id || passportId();
  const stock = PASSPORT_STOCK[key] || {};
  const car = CARS.find((c) => c.id === key) || garageList().find((c) => c.id === key) || {};
  return {
    v0100: stock.v0100 ?? car.v0100 ?? null,
    v100200: stock.v100200 ?? car.v100200 ?? null,
    v200300: stock.v200300 ?? car.v200300 ?? null,
    v80120: stock.v80120 ?? car.v80120 ?? null,
    hp: stock.hp ?? car.hp ?? null,
    nm: stock.nm ?? car.nm ?? null,
    kg: stock.kg ?? car.kg ?? null,
  };
}

/** Manual overrides only (state.passport[id]). */
function getPassportManual(id) {
  const key = id || passportId();
  return (state.passport && state.passport[key]) || {};
}

const PASSPORT_GPS_N = 5;
const PASSPORT_GPS_MARKS = ['v0100', 'v100200', 'v200300', 'v80120'];

function medianNums(arr) {
  const a = (arr || []).map(Number).filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function ensurePassportGps(id) {
  const key = id || passportId();
  state.passportGps = state.passportGps || {};
  if (!state.passportGps[key] || typeof state.passportGps[key] !== 'object') {
    state.passportGps[key] = {};
  }
  return state.passportGps[key];
}

/** Aggregate view: { v0100: { median, n, runs }, … } — empty until honest A/B runs. */
function getPassportGps(id) {
  const key = id || passportId();
  const raw = (state.passportGps && state.passportGps[key]) || {};
  // Also accept garage-car mirror
  const gCar = (state.garage || []).find((c) => c.id === key);
  const fromCar = (gCar && gCar.passportGps) || {};
  const out = {};
  for (const mark of PASSPORT_GPS_MARKS) {
    const runs = Array.isArray(raw[mark])
      ? raw[mark]
      : Array.isArray(fromCar[mark])
        ? fromCar[mark]
        : [];
    const times = runs
      .filter((r) => r && (r.gpsQ === 'A' || r.gpsQ === 'B') && Number.isFinite(Number(r.t)))
      .map((r) => Number(r.t));
    const lastN = times.slice(-PASSPORT_GPS_N);
    out[mark] = {
      median: medianNums(lastN),
      n: lastN.length,
      runs: runs.slice(-PASSPORT_GPS_N),
    };
  }
  return out;
}

function mirrorPassportGpsToGarage(id) {
  const key = id || passportId();
  const list = state.garage || [];
  const car = list.find((c) => c.id === key);
  if (!car) return;
  car.passportGps = JSON.parse(JSON.stringify(ensurePassportGps(key)));
}

/** Hydrate state.passportGps from garage cars (after remote merge). */
function hydratePassportGpsFromGarage() {
  state.passportGps = state.passportGps || {};
  for (const car of state.garage || []) {
    if (!car?.id || !car.passportGps || typeof car.passportGps !== 'object') continue;
    const cur = state.passportGps[car.id] || {};
    const merged = { ...cur };
    for (const mark of PASSPORT_GPS_MARKS) {
      const a = Array.isArray(cur[mark]) ? cur[mark] : [];
      const b = Array.isArray(car.passportGps[mark]) ? car.passportGps[mark] : [];
      if (!b.length) continue;
      // union by at+t, keep newest last
      const map = new Map();
      for (const r of [...a, ...b]) {
        if (!r || !Number.isFinite(Number(r.t))) continue;
        const k = `${r.at || 0}|${r.t}|${r.gpsQ || ''}`;
        map.set(k, r);
      }
      merged[mark] = [...map.values()]
        .sort((x, y) => (x.at || 0) - (y.at || 0))
        .slice(-PASSPORT_GPS_N * 2);
    }
    state.passportGps[car.id] = merged;
  }
}

/**
 * Fold A/B GPS marks into living passport. Ignores C/invalid.
 * marks: { v0100?, v100200?, v200300?, v80120? } seconds
 */
function foldPassportGps(marks, gpsQ, carId) {
  const q = gpsQ || (typeof gpsQualityFromStraightRun === 'function' ? gpsQualityFromStraightRun().gpsQ : null);
  if (q !== 'A' && q !== 'B') return false;
  const id = carId || state.carId || passportId();
  if (!id || !marks) return false;
  const bucket = ensurePassportGps(id);
  const at = Date.now();
  // Dedup within the same straight run (publishGps may re-pass marks)
  let foldedOnce = null;
  try {
    if (typeof run !== 'undefined' && run && run.armed != null) {
      run.passportFolded = run.passportFolded || {};
      foldedOnce = run.passportFolded;
    }
  } catch (_) {}
  let folded = false;
  for (const mark of PASSPORT_GPS_MARKS) {
    const raw = marks[mark];
    if (raw == null) continue;
    if (foldedOnce && foldedOnce[mark]) continue;
    const t = Number(Number(raw).toFixed(2));
    if (!Number.isFinite(t) || t <= 0) continue;
    const list = Array.isArray(bucket[mark]) ? bucket[mark].slice() : [];
    list.push({ t, at, gpsQ: q });
    bucket[mark] = list.slice(-PASSPORT_GPS_N * 2); // keep a bit of history; UI uses last N
    if (foldedOnce) foldedOnce[mark] = true;
    folded = true;
  }
  if (!folded) return false;
  state.passportGps[id] = bucket;
  mirrorPassportGpsToGarage(id);
  return true;
}

function fmtPass(v, unit) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return unit ? `${s} ${unit}` : s;
}

function fmtPassShort(v) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}


const BRAND_MARKS = {
  bmw: './img/brands/bmw.png',
};

function brandKeyFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('bmw')) return 'bmw';
  return null;
}

function applyBrandMark(name) {
  const img = document.getElementById('brandMark');
  if (!img) return;
  const key = brandKeyFromName(name);
  if (!key || !BRAND_MARKS[key]) {
    img.classList.add('hidden');
    img.removeAttribute('src');
    return;
  }
  img.src = BRAND_MARKS[key];
  img.classList.remove('hidden');
  img.alt = key.toUpperCase();
}

function renderDynoMarkRow(elId, stockVal, factObj, manualVal) {
  const el = document.getElementById(elId);
  if (!el) return;
  const hasStock = stockVal != null && Number.isFinite(Number(stockVal));
  const fact = factObj?.median;
  const hasFact = fact != null && Number.isFinite(Number(fact));
  const hasManual = manualVal != null && Number.isFinite(Number(manualVal))
    && (!hasStock || Number(manualVal) !== Number(stockVal));
  const n = factObj?.n || 0;

  let html = '<span class="dyno-split">';
  html += `<em class="dyno-stock" title="Сток (каталог)">сток <b>${hasStock ? fmtPassShort(stockVal) : '—'}</b></em>`;
  html += `<em class="dyno-fact${hasFact ? ' has-fact' : ''}" title="Факт — медиана честных A/B GPS">факт <b>${hasFact ? fmtPassShort(fact) : '—'}</b></em>`;
  html += '</span>';
  if (hasFact || hasManual) {
    const bits = [];
    if (hasFact) bits.push(`из ${n} честных`);
    if (hasManual) bits.push(`правка ${fmtPassShort(manualVal)}`);
    html += `<small class="dyno-meta">${bits.join(' · ')}</small>`;
  }
  el.innerHTML = html;
  el.classList.add('dyno-val-cell');
}

function applyPassportUI() {
  const id = passportId();
  const p = getPassport(id);
  const stock = getPassportStock(id);
  const manual = getPassportManual(id);
  const gps = getPassportGps(id);
  const setTxt = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
  setTxt('boxName', p.name);
  setTxt('boxTrim', p.trim || '');
  applyBrandMark(p.name);

  const anyFact = PASSPORT_GPS_MARKS.some((m) => (gps[m]?.n || 0) > 0);
  const anyManual = PASSPORT_GPS_MARKS.some((m) => {
    const v = manual[m];
    return v != null && Number.isFinite(Number(v)) && Number(v) !== Number(stock[m]);
  });
  let hint = stock.note || p.note || 'сток каталога';
  if (anyFact) hint = 'сток vs факт GPS · только A/B';
  else if (anyManual) hint = 'ручная правка · факт появится после A/B замеров';
  else hint = (PASSPORT_STOCK[id]?.note) || 'сток каталога · замерь A/B для факта';
  setTxt('dynoHint', hint);

  renderDynoMarkRow('d0100', stock.v0100, gps.v0100, manual.v0100);
  renderDynoMarkRow('d100200', stock.v100200, gps.v100200, manual.v100200);
  renderDynoMarkRow('d200300', stock.v200300, gps.v200300, manual.v200300);
  renderDynoMarkRow('d80120', stock.v80120, gps.v80120, manual.v80120);

  setTxt('dHp', fmtPass(p.hp, 'л.с.'));
  setTxt('dNm', fmtPass(p.nm, 'Н·м'));
  setTxt('dKg', fmtPass(p.kg, 'кг'));
  const pt = (p.hp && p.kg) ? Math.round((p.hp / p.kg) * 1000) : null;
  setTxt('dPt', pt != null ? String(pt) : '—');

  const noteEl = document.getElementById('dynoGpsNote');
  if (noteEl) {
    noteEl.hidden = !anyFact;
    noteEl.textContent = anyFact ? 'Факт — медиана последних честных A/B · C не считаем' : '';
  }
}

function setDynoEditMode(on) {
  document.getElementById('dynoView')?.classList.toggle('hidden', on);
  document.getElementById('dynoEditForm')?.classList.toggle('hidden', !on);
  document.getElementById('btnDynoEdit')?.classList.toggle('hidden', on);
  if (!on) return;
  const p = getPassport();
  const stock = getPassportStock();
  const manual = getPassportManual();
  // Edit = manual override fields (not GPS fact). Prefill manual if set, else stock.
  const fill = (id, mark) => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = manual[mark] != null ? manual[mark] : stock[mark];
    el.value = v != null ? v : '';
  };
  fill('e0100', 'v0100');
  fill('e100200', 'v100200');
  fill('e200300', 'v200300');
  fill('e80120', 'v80120');
  fill('eHp', 'hp');
  fill('eNm', 'nm');
  fill('eKg', 'kg');
}

function saveDynoEdit(ev) {
  ev?.preventDefault?.();
  const id = passportId();
  const num = (elId) => {
    const raw = document.getElementById(elId)?.value?.trim();
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  state.passport = state.passport || {};
  state.passport[id] = {
    ...(state.passport[id] || {}),
    hp: num('eHp'),
    nm: num('eNm'),
    kg: num('eKg'),
    v0100: num('e0100'),
    v100200: num('e100200'),
    v200300: num('e200300'),
    v80120: num('e80120'),
    note: 'ручная правка',
    manualAt: Date.now(),
  };
  // Do NOT write into meas / passportGps — GPS fact stays the phone truth.
  save();
  setDynoEditMode(false);
  applyPassportUI();
  try { applyCarUI(); } catch (_) {}
  hap(14);
}



/* -------- Garage hero: ALWAYS cinematic 3D podium (photo/empty UX removed) -------- */
let heroMode = '3d'; // locked; photo mode retired

function syncHeroModeUI() {
  // no-op: podium is always the hero; never hide for empty garage or photo
  const podium = document.getElementById('podiumWrap');
  const photo = document.getElementById('photoStage');
  const emptyEl = document.getElementById('emptyGarage');
  const mycar = document.querySelector('#view-garage .mycar');
  if (podium) podium.classList.remove('hidden');
  if (photo) photo.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (mycar) mycar.classList.remove('hidden');
  document.getElementById('heroModeBar')?.classList.add('hidden');
}

function setHeroMode(_mode) {
  // photo mode retired — always stay on 3D podium
  heroMode = '3d';
  try { localStorage.setItem('pitlane-hero-mode', '3d'); } catch (_) {}
  syncHeroModeUI();
  try { bootPodium?.(); } catch (_) {}
}

function applyCarUI() {
  // ALWAYS show 3D podium + mycar; NEVER surface empty garage / photo takeover
  document.getElementById('emptyGarage')?.classList.add('hidden');
  document.getElementById('addWizard')?.classList.add('hidden');
  document.querySelector('#view-garage .mycar')?.classList.remove('hidden');
  document.getElementById('podiumWrap')?.classList.remove('hidden');
  document.getElementById('photoStage')?.classList.add('hidden');
  document.getElementById('heroModeBar')?.classList.add('hidden');
  try { syncHeroModeUI(); } catch (_) {}
  applyPassportUI();
  const c = currentCar();
  const m = state.meas[c.id] || {};
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('carName', c.name);
  setTxt('carClass', c.cls);
  setTxt('lapDriveCar', c.name);
  setTxt('runCarName', c.name);
  {
    const gpsH = getPassportGps(c.id);
    const stockH = getPassportStock(c.id);
    const fact = gpsH.v0100?.median;
    const stockV = stockH.v0100;
    const hdrEl = document.getElementById('hdr0100');
    if (fact != null) {
      setTxt('hdr0100', fmt(fact, 'с'));
      if (hdrEl) {
        hdrEl.title = stockV != null
          ? `0–100 факт ${fmtPassShort(fact)} (сток ${fmtPassShort(stockV)}) · из ${gpsH.v0100.n} честных`
          : `0–100 факт ${fmtPassShort(fact)} · из ${gpsH.v0100.n} честных`;
      }
    } else {
      const manual = getPassportManual(c.id);
      const show = manual.v0100 ?? m.v0100 ?? stockV;
      setTxt('hdr0100', fmt(show, 'с'));
      if (hdrEl) hdrEl.title = show != null ? 'сток / правка (факта GPS ещё нет)' : '';
    }
  }
  const track = TRACKS.find((t) => t.id === (state.trackId || c.lap?.track)) || TRACKS[0];
  const mine = bestLapDisplay(track.id);
  setTxt('sLap', mine || 'нет заезда');
  const hdrLap = document.getElementById('hdrLap');
  if (hdrLap) hdrLap.textContent = mine || '—';
  const trackRef = document.getElementById('trackRef');
  if (trackRef) trackRef.textContent = track.ref || '—';
  const trackMine = document.getElementById('trackMine');
  if (trackMine) trackMine.textContent = bestLapDisplay(track.id) || '—';
  try { paintCar(c); } catch (err) { console.warn('paintCar', err); }
  try { renderCars(); } catch (err) { console.warn('renderCars', err); }
  try { renderLaps(); } catch (err) { console.warn('renderLaps', err); }
  try { void renderTops(); } catch (err) { console.warn('renderTops', err); }
}

function bestLapDisplay(trackId) {
  const list = state.laps[trackId] || [];
  if (!list.length) return null;
  const min = Math.min(...list.map((x) => x.ms));
  return formatMs(min);
}

function formatMs(ms) {
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}


/** Switch active car site-wide; keep podium GLB in sync when catalog has a model. */
function selectActiveCar(id, opts) {
  if (!id) return;
  state.carId = id;
  save();
  applyCarUI();
  const syncPodium = !(opts && opts.skipPodium);
  if (!syncPodium) return;
  try {
    if (typeof MODEL_CATALOG === 'undefined' || !MODEL_CATALOG?.length) return;
    if (typeof loadPodiumModel !== 'function') return;
    if (!MODEL_CATALOG.some((m) => m.id === id)) return;
    if (typeof podiumModelId !== 'undefined' && podiumModelId === id) return;
    // animDir 0 — don't fight title ◀ ▶ transition
    loadPodiumModel(id, 0);
  } catch (_) {}
}

function renderCars() {
  const grid = document.getElementById('carGrid');
  if (!grid) return;
  grid.innerHTML = '';
  CARS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'car-card' + (c.id === state.carId ? ' active' : '');
    const src = silForCar(c);
    b.innerHTML = `<img src="${esc(src)}" alt="" loading="lazy" /><strong>${esc(c.name)}</strong><small>${esc(c.cls)}</small><small>0–100 ${fmt(c.v0100)}</small>`;
    b.onclick = () => {
      selectActiveCar(c.id);
    };
    grid.appendChild(b);
  });
}

function renderTracks() {
  const sel = document.getElementById('trackSelect');
  const ordered = tracksOrdered();
  const html = ordered.map((t) => {
    const g = TRACK_GEO[t.id];
    const tag = g?.rough ? ' · С/Ф≈' : (t.cult && g ? ' · С/Ф' : '');
    return `<option value="${t.id}">${t.name}${tag}</option>`;
  }).join('');
  sel.innerHTML = html;
  const def = state.trackId && TRACKS.some((t) => t.id === state.trackId) ? state.trackId : TRACKS[0].id;
  sel.value = def;
  state.trackId = def;
  sel.onchange = () => {
    state.trackId = sel.value;
    save();
    drawTrack(sel.value, 'trackMap');
    drawTrack(sel.value, 'topTrackMap');
    applyCarUI();
  };
  const topSel = document.getElementById('topTrackSelect');
  if (topSel) {
    topSel.innerHTML = html;
    topSel.value = sel.value;
    topSel.onchange = () => {
      state.trackId = topSel.value;
      save();
      drawTrack(topSel.value, 'trackMap');
      drawTrack(topSel.value, 'topTrackMap');
      const secSel = document.getElementById('sectorTopTrackSelect');
      if (secSel) secSel.value = topSel.value;
      void renderTops();
    };
  }
  mountWheel('trackSelect', 'trackWheel');
  mountWheel('topTrackSelect', 'topTrackWheel');
  drawTrack(sel.value, 'trackMap');
  drawTrack(sel.value, 'topTrackMap');
}

function mountWheel(selId, wheelId) {
  const sel = document.getElementById(selId);
  const box = document.getElementById(wheelId);
  if (!sel || !box) return;
  const opts = [...sel.options];
  box.innerHTML = '<div class="wheel-item"></div>' + opts.map((o) => {
    const tr = TRACKS.find((t) => t.id === o.value);
    const g = TRACK_GEO[tr?.id];
    const cult = tr?.cult && g && !g.rough;
    const rough = !!(g && g.rough);
    const tag = rough
      ? ' <span class="cult-tag rough-sf">С/Ф приблизителен</span>'
      : (cult ? ' <span class="cult-tag">проверен С/Ф</span>' : '');
    const label = String(o.text).replace(/ · С\/Ф≈?$/, '');
    return `<div class="wheel-item${cult ? ' cult-track' : ''}${rough ? ' rough-track' : ''}" data-val="${o.value}">${label}${tag}</div>`;
  }).join('') + '<div class="wheel-item"></div>';
  const items = () => [...box.querySelectorAll('.wheel-item[data-val]')];
  const sync = () => {
    const mid = box.scrollTop + box.clientHeight / 2;
    let best = items()[0], dist = 1e9;
    const boxR = box.getBoundingClientRect();
    const midY = boxR.top + boxR.height / 2;
    items().forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - midY);
      if (d < dist) { dist = d; best = el; }
    });
    items().forEach((el) => el.classList.toggle('on', el === best));
    if (best && sel.value !== best.dataset.val) {
      sel.value = best.dataset.val;
      hap(14);
      sel.dispatchEvent(new Event('change'));
    }
  };
  box.onclick = (e) => {
    const it = e.target.closest('.wheel-item[data-val]');
    if (!it) return;
    it.scrollIntoView({ block: 'center', behavior: 'smooth' });
    sel.value = it.dataset.val;
    hap(14);
    sel.dispatchEvent(new Event('change'));
    items().forEach((el) => el.classList.toggle('on', el === it));
  };
  box.onscroll = () => { requestAnimationFrame(sync); };
  const i = Math.max(0, opts.findIndex((o) => o.value === sel.value));
  box.scrollTop = i * 56;
  items().forEach((el, n) => el.classList.toggle('on', n === i));
}

/* renderLaps defined with lap GPS block */


/** Client-side tops publish gate: need valid + gps + A/B (C only if filter unchecked). */
function canPublishTop(gq, flags) {
  const fl = flags || [];
  if (fl.includes('teleport') || fl.includes('speed')) return false;
  const q = gq?.gpsQ || gq;
  const allowC = 
document.getElementById('topWeatherChips')?.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('.wx-chip');
  if (!btn?.dataset?.wx) return;
  setTopsWeatherFilter(btn.dataset.wx, { user: true });
  void renderTops();
});
document.addEventListener('click', (e) => {
  const b = e.target?.closest?.('.tops-gps');
  if (b?.dataset?.tip) {
    try { alert(b.dataset.tip); } catch (_) {}
  }
});
document.getElementById('topValidOnly')?.checked === false;
  if (q === 'A' || q === 'B') return true;
  if (q === 'C' && allowC) return true;
  return false;
}

function runRowValid(gq, flags) {
  const fl = flags || [];
  if (fl.includes('teleport') || fl.includes('speed')) return false;
  const q = gq?.gpsQ || gq;
  if (q === 'C') return false;
  return q === 'A' || q === 'B';
}

function filterTopRows(rows, { model } = {}) {
  const validOnly = document.getElementById('topValidOnly')?.checked !== false;
  let out = (rows || []).slice();
  if (validOnly) {
    // Default stricter: public tops = GPS A/B only, no teleport
    out = out.filter((r) => {
      if (!r || !r.gps || r.valid === false) return false;
      if (Array.isArray(r.flags) && r.flags.includes('teleport')) return false;
      if (r.gpsQ === 'C') return false;
      return r.gpsQ === 'A' || r.gpsQ === 'B' || r.gpsQ == null; // legacy without gpsQ kept if valid
    });
  } else {
    // Filter unchecked: allow C, still drop explicit invalid / teleport
    out = out.filter((r) => r && r.gps && r.valid !== false && !(Array.isArray(r.flags) && r.flags.includes('teleport')));
  }
  const modelSel = model != null ? model : (document.getElementById('topModelFilter')?.value || '');
  if (modelSel) out = out.filter((r) => String(r.car || '') === modelSel);
  return out;
}

function populateTopModelFilter(allRows) {
  const sel = document.getElementById('topModelFilter');
  if (!sel) return;
  const cur = sel.value;
  const names = [...new Set((allRows || []).map((r) => String(r.car || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  sel.innerHTML = '<option value="">все модели</option>' + names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (cur && names.includes(cur)) sel.value = cur;
}

function topsGpsTip(r) {
  if (!r) return '';
  const parts = [];
  if (r.avgAcc != null && Number.isFinite(Number(r.avgAcc))) parts.push(`средняя точность ±${Math.round(Number(r.avgAcc))} м`);
  if (r.hz != null && Number.isFinite(Number(r.hz))) parts.push(`${Number(r.hz).toFixed(1)} Гц`);
  if (Array.isArray(r.flags) && r.flags.includes('teleport')) parts.push('есть телепорты');
  else if (r.gpsQ === 'A' || r.gpsQ === 'B') parts.push('без телепортов');
  if (r.weather === 'dry') parts.push('сухо');
  else if (r.weather === 'damp') parts.push('сыро');
  else if (r.weather === 'wet') parts.push('мокро');
  return parts.join(' · ') || 'валидный GPS';
}

function gpsGradeLabel(q) {
  if (q === 'A') return 'Честный';
  if (q === 'B') return 'Ок';
  if (q === 'C') return 'Слабый GPS';
  return 'GPS';
}

function topsGpsBadge(r) {
  if (!r || !r.gps || r.valid === false) return '';
  const q = r.gpsQ;
  let cls = 'tops-gps';
  if (q === 'A') cls += ' tops-gps-a';
  else if (q === 'B') cls += ' tops-gps-b';
  else if (q === 'C') cls += ' tops-gps-c';
  else cls += ' tops-gps-unk';
  const label = gpsGradeLabel(q);
  const tip = esc(topsGpsTip(r));
  return `<em class="${cls}" title="${tip}" data-tip="${tip}" tabindex="0" role="button" aria-label="${esc(label)}. ${tip}">${label}</em>`;
}

/** WMO weather_code → dry | damp | wet */
function weatherCategoryFromCode(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return null;
  if (c <= 3 || c === 45 || c === 48) return 'dry';
  if (c === 51 || c === 53 || c === 56 || c === 61) return 'damp';
  if (c >= 51) return 'wet';
  return 'dry';
}

function weatherLabelRu(w) {
  if (w === 'dry') return 'Сухо';
  if (w === 'damp') return 'Сыро';
  if (w === 'wet') return 'Мокро';
  return '';
}

let topsWeatherFilter = 'dry'; // all | dry | damp | wet
let _topsWxAutoDone = false;

function getTopsWeatherFilter() {
  return topsWeatherFilter || 'dry';
}

function setTopsWeatherFilter(w, { user } = {}) {
  const v = (w === 'all' || w === 'dry' || w === 'damp' || w === 'wet') ? w : 'dry';
  topsWeatherFilter = v;
  if (user) _topsWxAutoDone = true;
  document.querySelectorAll('#topWeatherChips .wx-chip').forEach((b) => {
    b.classList.toggle('on', b.dataset.wx === v);
  });
}

function filterRowsByWeather(rows, wx) {
  if (!wx || wx === 'all') return rows || [];
  return (rows || []).filter((r) => r && r.weather === wx);
}

function pickDefaultWeatherFilter(lapRows) {
  const rows = lapRows || [];
  const hasDry = rows.some((r) => r && r.weather === 'dry');
  const hasAnyWx = rows.some((r) => r && (r.weather === 'dry' || r.weather === 'damp' || r.weather === 'wet'));
  if (hasDry) return 'dry';
  if (!hasAnyWx) return 'all';
  return 'all';
}

async function renderTops() {
  try { void renderSessionOfDay(); } catch (_) {}
  try { void renderSectorTops(); } catch (_) {}
  const c = currentCar();
  const trackId = document.getElementById('topTrackSelect')?.value || state.trackId || c.lap.track;
  const nameEl = document.getElementById('topCarName');
  const trackNameEl = document.getElementById('topTrackName');
  if (nameEl) nameEl.textContent = c.name;
  const track = TRACKS.find((t) => t.id === trackId);
  if (trackNameEl && track) trackNameEl.textContent = track.name;
  const straightRaw = await api.listStraight(c.id);
  // Fetch all lap rows first so default chip (Сухо vs Все) can see weather presence
  const lapAll = await api.listLap(trackId);
  populateTopModelFilter([...straightRaw, ...lapAll]);
  if (!_topsWxAutoDone) {
    const pref = pickDefaultWeatherFilter(lapAll);
    setTopsWeatherFilter(pref);
  }
  const wx = getTopsWeatherFilter();
  const lapRaw = (wx === 'all') ? lapAll : filterRowsByWeather(lapAll, wx);
  const sEl = document.getElementById('topStraight');
  if (sEl) {
    // straight: weather optional — show all (still store when present)
    const rows = filterTopRows(straightRaw).slice().sort((a, b) => a.t - b.t);
    sEl.innerHTML = rows.length ? rows.map((r, i) => `<li><span>${i + 1}. ${esc(r.name)} · ${esc(r.car)}</span><strong class="tops-time">${Number(r.t).toFixed(2)} с${topsGpsBadge(r)}</strong></li>`).join('') : '<li><span>нет валидных GPS</span><strong>—</strong></li>';
  }
  const lEl = document.getElementById('topLap');
  if (lEl) {
    const rows = filterTopRows(lapRaw);
    if (!rows.length) {
      lEl.innerHTML = '<li><span>нет кругов для фильтра</span><strong>—</strong></li>';
    } else {
      lEl.classList.add('tops-pilot-list');
      lEl.innerHTML = rows.map((r, i) => topsPilotRowHtml({
        rank: i + 1,
        name: r.name,
        avatar: r.avatar,
        sub: r.car,
        timeHtml: `${esc(String(r.t))}${topsGpsBadge(r)}`,
      })).join('');
    }
  }
}

function syncTabPill(activeBtn) {
  const pill = document.getElementById('tabPill');
  const bar = document.getElementById('tabbar');
  if (!pill || !bar || !activeBtn || !activeBtn.classList.contains('nav-btn')) return;
  const br = bar.getBoundingClientRect();
  const r = activeBtn.getBoundingClientRect();
  const left = r.left - br.left;
  pill.style.width = r.width + 'px';
  pill.style.transform = `translateX(${left}px)`;
}

function activateNavBtn(btn) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  if (!btn?.classList.contains('nav-btn')) return;
  // restart CSS animations
  btn.classList.remove('active');
  void btn.offsetWidth;
  btn.classList.add('active');
  syncTabPill(btn);
}

/* Engine start SFX — JaimeLopes «Lambo Start Up Sound» Freesound #564373 (CC0)
   https://freesound.org/people/JaimeLopes/sounds/564373/
   Trimmed ~2.5s clean Huracán EVO Spyder start (no kids chatter). */
const SFX_KEY = 'pitlane-sfx';
const ENGINE_START_URL = './audio/huracan-start.mp3';
let engineStartAudio = null;
let viewTransitionTimer = 0;

function sfxEnabled() {
  try {
    const v = localStorage.getItem(SFX_KEY);
    if (v == null) return true;
    return v !== '0' && v !== 'false' && v !== 'off';
  } catch (_) {
    return true;
  }
}

function setSfxEnabled(on) {
  try { localStorage.setItem(SFX_KEY, on ? '1' : '0'); } catch (_) {}
  const t = document.getElementById('sfxToggle');
  if (t) t.checked = !!on;
}

function prefetchEngineStart() {
  try {
    if (!engineStartAudio) {
      engineStartAudio = new Audio(ENGINE_START_URL);
      engineStartAudio.preload = 'auto';
      engineStartAudio.playsInline = true;
    }
    engineStartAudio.load();
  } catch (_) {}
}

function synthesizeEngineStart() {
  return new Promise((resolve) => {
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      resolve();
      return;
    }
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.connect(ctx.destination);

    // Crank / starter grind
    const dur = 2.1;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const grind = (Math.random() * 2 - 1) * (t < 0.45 ? 0.55 : 0.12 * Math.exp(-(t - 0.45) * 4));
      data[i] = grind;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.08, now + 0.5);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);

    // Catch + brief V10-ish roar (saw stack)
    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0.0001, now);
    roarGain.gain.setValueAtTime(0.0001, now + 0.38);
    roarGain.gain.exponentialRampToValueAtTime(0.55, now + 0.52);
    roarGain.gain.exponentialRampToValueAtTime(0.28, now + 1.1);
    roarGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    roarGain.connect(master);

    [55, 110, 165, 220, 275].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.92, now + 0.4);
      o.frequency.exponentialRampToValueAtTime(f * 1.35, now + 0.85);
      o.frequency.exponentialRampToValueAtTime(f * 1.05, now + 1.6);
      const g = ctx.createGain();
      g.gain.value = 0.18 / (i + 1);
      const fil = ctx.createBiquadFilter();
      fil.type = 'lowpass';
      fil.frequency.setValueAtTime(600, now + 0.4);
      fil.frequency.exponentialRampToValueAtTime(4200, now + 0.7);
      fil.frequency.exponentialRampToValueAtTime(1800, now + 1.5);
      o.connect(fil);
      fil.connect(g);
      g.connect(roarGain);
      o.start(now + 0.38);
      o.stop(now + dur);
    });

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.7, now + 0.05);
    master.gain.setValueAtTime(0.7, now + dur - 0.25);
    master.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.start(now);
    noise.stop(now + dur);
    setTimeout(() => {
      try { ctx.close(); } catch (_) {}
      resolve();
    }, Math.ceil(dur * 1000) + 50);
  });
}

function playEngineStart() {
  return new Promise((resolve) => {
    if (!sfxEnabled()) {
      resolve();
      return;
    }
    const finish = () => resolve();
    try {
      if (!engineStartAudio) prefetchEngineStart();
      const a = engineStartAudio;
      if (!a) {
        synthesizeEngineStart().then(finish).catch(finish);
        return;
      }
      a.pause();
      try { a.currentTime = 0; } catch (_) {}
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(finish).catch(() => {
          synthesizeEngineStart().then(finish).catch(finish);
        });
      } else {
        finish();
      }
    } catch (_) {
      synthesizeEngineStart().then(finish).catch(finish);
    }
  });
}

function goToView(id, opts = {}) {
  const next = document.getElementById('view-' + id);
  if (!next) return;
  const prev = document.querySelector('.view.active');
  const already = !!(prev && prev.id === 'view-' + id);

  const nav = (opts.navBtn && opts.navBtn.classList.contains('nav-btn'))
    ? opts.navBtn
    : document.querySelector(`.nav-btn[data-view="${id}"]`);
  if (nav) activateNavBtn(nav);
  else if (id === 'account') {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  }

  if (already) {
    try { onResize(); } catch (_) {}
    return;
  }
  if (id !== 'garage') { try { finishDriveIn(); } catch (_) {} } // leaving the garage aborts the drive-in (controls restored)

  // Unlock + play on the same user gesture that navigates to Замер
  if (id === 'run' && opts.sfx !== false) {
    playEngineStart().catch(() => {});
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  clearTimeout(viewTransitionTimer);

  if (prev && !reduce) {
    prev.classList.add('leaving');
    prev.classList.remove('active');
    next.classList.add('active');
    const cleanup = () => {
      prev.classList.remove('leaving');
    };
    prev.addEventListener('animationend', cleanup, { once: true });
    viewTransitionTimer = setTimeout(cleanup, 520);
  } else {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active', 'leaving'));
    next.classList.add('active');
  }
  try { onResize(); } catch (_) {}
}

document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.onclick = () => {
    const id = btn.dataset.view;
    if (!id || !document.getElementById('view-' + id)) return;
    try { navigator.vibrate?.(10); } catch (_) {}
    goToView(id, { navBtn: btn });
  };
});

(function setupSfxToggle() {
  const t = document.getElementById('sfxToggle');
  if (!t) return;
  t.checked = sfxEnabled();
  t.addEventListener('change', () => setSfxEnabled(t.checked));
})();

window.addEventListener('resize', () => syncTabPill(document.querySelector('.nav-btn.active')));
requestAnimationFrame(() => syncTabPill(document.querySelector('.nav-btn.active')));

if (document.getElementById('dynoForm')) document.getElementById('dynoForm').onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const rec = state.meas[state.carId] || {};
  for (const k of ['v0100', 'v100200', 'v200300']) {
    const n = parseFloat(String(fd.get(k) || ''));
    if (!Number.isNaN(n)) rec[k] = n;
  }
  state.meas[state.carId] = rec;
  save();
  document.getElementById('dynoMsg').textContent = 'Замер сохранён на этом устройстве.';
  applyCarUI();
};

if (document.getElementById('lapForm')) document.getElementById('lapForm').onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const min = Number(fd.get('min') || 0);
  const sec = Number(fd.get('sec') || 0);
  const ms = Math.round(min * 60000 + sec * 1000);
  const trackId = document.getElementById('trackSelect').value;
  state.laps[trackId] = state.laps[trackId] || [];
  state.laps[trackId].push({ ms, at: Date.now() });
  save();
  applyCarUI();
};

/* ---------------- 3D ---------------- */
/* ---- Adaptive 3D quality tiers (high / medium / low) ----
 * high   = original podium, untouched (iPhone etc.)
 * medium = DPR ≤1.5, 60 fps cap, reflection 512px @ every 2nd frame, static 1024 shadow map
 * low    = DPR ≤1.25, no MSAA (from next load), no realtime mirror/shadow maps (flat black floor, ring glow compensated), 30 fps while idle-rotating
 * Initial tier: ?quality= override → fresh localStorage → GPU heuristic → high.
 * Then FPS on the podium decides (down-only, never back up within a session). */
const Q_KEY = 'pitlane-quality-v1';
const Q_TIERS = ['high', 'medium', 'low'];
const Q_STALE_MS = 7 * 24 * 3600 * 1000;
const Q_TARGET_FPS = 45;
const Q_PRESETS = {
  high: { dprCap: 2, maxFps: 0, idleFps: 0, aa: true, shadow: true, shadowRes: 0, shadowStatic: false, refl: 'full', reflEvery: 1, areaLights: true },
  medium: { dprCap: 1.5, maxFps: 60, idleFps: 60, aa: true, shadow: true, shadowRes: 1024, shadowStatic: true, refl: 'half', reflEvery: 2, areaLights: true },
  low: { dprCap: 1.25, maxFps: 60, idleFps: 30, aa: false, shadow: false, shadowRes: 0, shadowStatic: true, refl: 'off', reflEvery: 0, areaLights: true },
};
function qGpuString() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
    return s;
  } catch (_) { return ''; }
}
/** Low/mid mobile GPUs start at medium; FPS measurement still decides. */
function qTierFromGpu(gpu) {
  const g = String(gpu || '');
  if (/Adreno[^0-9]*([3-6]\d\d)/i.test(g)) return 'medium';
  if (/Mali-(T|G[3-7]\d)\b/i.test(g)) return 'medium';
  if (/PowerVR/i.test(g)) return 'medium';
  return 'high';
}
const Q = (() => {
  const st = { tier: 'high', source: 'default', gpu: '', locked: false, stored: null, measured: [] };
  let url = '';
  try { url = (new URLSearchParams(location.search).get('quality') || '').toLowerCase(); } catch (_) {}
  if (Q_TIERS.includes(url)) { st.tier = url; st.source = 'url'; st.locked = true; return st; }
  try {
    const raw = JSON.parse(localStorage.getItem(Q_KEY) || 'null');
    if (raw && Q_TIERS.includes(raw.tier)) st.stored = raw;
  } catch (_) {}
  const fresh = st.stored && (Date.now() - (Number(st.stored.at) || 0) < Q_STALE_MS);
  if (fresh) { st.tier = st.stored.tier; st.source = 'stored'; return st; }
  st.gpu = qGpuString();
  st.tier = qTierFromGpu(st.gpu);
  st.source = st.stored ? 'stale→gpu' : 'gpu';
  // Telegram for Android reports a device performance class in its UA: use it as an initial hint
  // (take the lower of it and the GPU heuristic); the FPS measurement still has the final word.
  const tgClass = telegramDeviceClass();
  const hint = tgClass === 'LOW' ? 'low' : tgClass === 'AVERAGE' ? 'medium' : null;
  if (hint && Q_TIERS.indexOf(hint) > Q_TIERS.indexOf(st.tier)) { st.tier = hint; st.source += '+tg:' + tgClass; }
  return st;
})();
function qPreset() { return Q_PRESETS[Q.tier] || Q_PRESETS.high; }
/** Apple GPUs (iPhone/iPad/Mac) are strong; iOS Low Power Mode caps rAF at 30 fps — don't mistake that for a slow GPU. */
function qTargetFps() {
  const g = Q.gpu || (Q.stored && Q.stored.gpu) || '';
  const apple = /Apple/i.test(g) || /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (/Macintosh/i.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
  return apple ? 24 : Q_TARGET_FPS;
}
function qPersist() {
  if (Q.locked) return;
  try { localStorage.setItem(Q_KEY, JSON.stringify({ tier: Q.tier, at: Date.now(), gpu: Q.gpu || (Q.stored && Q.stored.gpu) || '' })); } catch (_) {}
}
console.info(`[pitlane] 3D quality: ${Q.tier} (${Q.source}${Q.gpu ? ', ' + Q.gpu : ''})`);

const canvas = document.getElementById('view3d');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: qPreset().aa,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0x1a1a1a, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qPreset().dprCap));
if (!Q.gpu) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    Q.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '');
  } catch (_) {}
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
if ('useLegacyLights' in renderer) renderer.useLegacyLights = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
camera.position.set(5.4, 2.2, 5.8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minPolarAngle = 0.15;
controls.minDistance = 2.4;
controls.maxDistance = 14;
controls.target.set(0, 0.55, 0);
controls.addEventListener('start', () => { controls.autoRotate = false; });
let podiumIdleTimer = null;
controls.addEventListener('end', () => {
  clearTimeout(podiumIdleTimer);
  podiumIdleTimer = setTimeout(() => { controls.autoRotate = true; }, 2200);
});

/* Dark cinematic studio: soft key/fill + strong cool rims for body-line definition */
scene.add(new THREE.AmbientLight(0xa8b0c0, 0.26));
scene.add(new THREE.HemisphereLight(0x7a8aa4, 0x101012, 0.44));
const key = new THREE.DirectionalLight(0xeef2fa, 1.18);
key.position.set(3.2, 7.4, 5.2);
key.castShadow = true;
const shadowRes = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 1024 : 1536;
key.shadow.mapSize.set(shadowRes, shadowRes);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 28;
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -6;
key.shadow.bias = -0.00018;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3.2;
scene.add(key);
const fill = new THREE.DirectionalLight(0xc8d4e8, 0.58);
fill.position.set(-5.2, 4.6, 2.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xb4ccf0, 2.15);
rim.position.set(-1.0, 4.0, -7.0);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0xd4dcec, 1.0);
rim2.position.set(6.0, 2.8, -3.4);
scene.add(rim2);
const bounce = new THREE.DirectionalLight(0x8890a0, 0.28);
bounce.position.set(0.2, -0.7, 2.4);
scene.add(bounce);

/* Soft ceiling softboxes — lights only, no visible lamp meshes */
const areaLights = [];
try {
  RectAreaLightUniformsLib.init();
  const softA = new THREE.RectAreaLight(0xeef2fa, 3.4, 5.8, 1.5);
  softA.position.set(-0.6, 5.9, 1.0);
  softA.lookAt(0, 0.55, 0);
  scene.add(softA);
  const softB = new THREE.RectAreaLight(0xd8e0f0, 2.1, 3.6, 1.15);
  softB.position.set(2.6, 5.0, -1.8);
  softB.lookAt(0, 0.5, 0);
  scene.add(softB);
  areaLights.push(softA, softB);
} catch (_) { /* RectAreaLight optional on constrained GPUs */ }

/* PMREM + Reflector deferred until intro ends — avoids main-thread jank on entry */
let floor = null;
let podiumEnvReady = false;
let introBlocking3d = true;
let podiumBooted = false;

function ensurePodiumEnv() {
  if (podiumEnvReady) return;
  podiumEnvReady = true;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.88;
    pmrem.dispose();
  } catch (_) { /* reflections optional */ }
  try {
    if (qPreset().refl !== 'off') createPodiumReflector();
  } catch (_) { /* reflector optional */ }
  applyQualityTier(true);
}

const REFL_RES_HIGH = Math.min(1024, Math.max(512, Math.floor(512 * Math.min(window.devicePixelRatio || 1, 1.75))));
let reflFrame = 0;
let reflForce = true;
function createPodiumReflector() {
  if (floor) return floor;
  const res = qPreset().refl === 'half' ? 512 : REFL_RES_HIGH;
  floor = new Reflector(new THREE.CircleGeometry(7, 72), {
    clipBias: 0.003,
    textureWidth: res,
    textureHeight: res,
    color: 0x1a1a1e,
    multisample: 0,
  });
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  // medium tier: refresh mirror every Nth frame (texture keeps last image in between)
  const origBefore = floor.onBeforeRender;
  floor.onBeforeRender = function (r, s, c) {
    const every = qPreset().reflEvery || 1;
    if (every > 1 && !reflForce && (reflFrame++ % every) !== 0) return;
    reflForce = false;
    return origBefore.call(this, r, s, c);
  };
  scene.add(floor);
  return floor;
}

/* low tier: static matte-black floor instead of realtime mirror (same dark look, zero extra passes) */
let floorFlat = null;
function ensureFlatFloor() {
  if (floorFlat) return floorFlat;
  floorFlat = new THREE.Mesh(
    new THREE.CircleGeometry(7, 72),
    new THREE.MeshBasicMaterial({ color: 0x030304 })
  );
  floorFlat.rotation.x = -Math.PI / 2;
  floorFlat.position.y = 0;
  scene.add(floorFlat);
  return floorFlat;
}

/** Apply current Q.tier to renderer/scene. Safe to call repeatedly. */
function applyQualityTier(fromEnv = false) {
  const p = qPreset();
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, p.dprCap);
    if (renderer.getPixelRatio() !== dpr) { renderer.setPixelRatio(dpr); onResize(); }
  } catch (_) {}
  try {
    const wantRes = p.shadowRes || shadowRes;
    if (key.shadow.mapSize.x !== wantRes) {
      key.shadow.mapSize.set(wantRes, wantRes);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    key.castShadow = !!p.shadow;
    renderer.shadowMap.enabled = !!p.shadow;
    renderer.shadowMap.autoUpdate = !p.shadowStatic;
    renderer.shadowMap.needsUpdate = true;
  } catch (_) {}
  try { areaLights.forEach((l) => { l.visible = !!p.areaLights; }); } catch (_) {}
  // no mirror on low → the neon ring loses its reflected green; render it un-tonemapped so it stays neon
  try {
    const flat = p.refl === 'off';
    if (ring.material.toneMapped === flat) { ring.material.toneMapped = !flat; ring.material.needsUpdate = true; }
    ring.material.opacity = flat ? 0.55 : 0.5;
  } catch (_) {}
  if (podiumEnvReady) {
    try {
      if (p.refl === 'off') {
        if (floor) floor.visible = false;
        ensureFlatFloor().visible = true;
      } else {
        if (!floor) createPodiumReflector();
        if (floor) {
          floor.visible = true;
          const want = p.refl === 'half' ? 512 : REFL_RES_HIGH;
          const rt = floor.getRenderTarget?.();
          if (rt && rt.width !== want) rt.setSize(want, want);
        }
        if (floorFlat) floorFlat.visible = false;
      }
    } catch (_) {}
  }
  if (!fromEnv) podiumInvalidate(400, true);
}


/* Soft contact-shadow disk under the car (cinema stand) */
const contactShadow = new THREE.Mesh(
  new THREE.CircleGeometry(2.4, 64),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.y = 0.006;
scene.add(contactShadow);

/* Subtle neon-green accent — soft core + faint halo (not loud) */
const ringGlow = new THREE.Mesh(
  new THREE.RingGeometry(2.92, 3.48, 96),
  new THREE.MeshBasicMaterial({
    color: 0x39FF14,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
  })
);
ringGlow.rotation.x = -Math.PI / 2;
ringGlow.position.y = 0.009;
scene.add(ringGlow);
const ring = new THREE.Mesh(
  new THREE.RingGeometry(3.1, 3.28, 96),
  new THREE.MeshBasicMaterial({
    color: 0x39FF14,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.012;
scene.add(ring);
applyQualityTier(true); // module-time: shadows / area lights / ring for the initial tier (podium env not built yet)

const car = new THREE.Group();
car.visible = false;
scene.add(car);
const moving = {};

function canvasTex(draw, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function texLivery(hex) {
  if (state.customLivery) {
    const t = new THREE.CanvasTexture(state.customLivery);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return canvasTex((ctx, s) => {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(s * 0.46, 0, s * 0.08, s);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, s, s * 0.12);
    ctx.fillRect(0, s * 0.88, s, s * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 18; i++) ctx.fillRect(0, (i / 18) * s, s, 2);
  });
}

function texCarbon() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) {
      for (let x = 0; x < s; x += 8) {
        ctx.fillStyle = ((x + y) / 8) % 2 ? '#2a2a2a' : '#111';
        ctx.fillRect(x, y, 8, 8);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, s, s);
  }, 256);
}

function texTire() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 6;
    for (let i = 0; i < 24; i++) {
      ctx.beginPath();
      ctx.moveTo(s / 2, s / 2);
      const a = (i / 24) * Math.PI * 2;
      ctx.lineTo(s / 2 + Math.cos(a) * s, s / 2 + Math.sin(a) * s);
      ctx.stroke();
    }
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  }, 256);
}

function texRim() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(s / 2, s / 2);
      ctx.lineTo(s / 2 + Math.cos(a) * s * 0.45, s / 2 + Math.sin(a) * s * 0.45);
      ctx.stroke();
    }
    ctx.fillStyle = '#39FF14';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }, 256);
}

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.72, roughness: 0.28, ...extra });
}

function wheel(wide = false) {
  const g = new THREE.Group();
  const r = wide ? 0.42 : 0.37;
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(r, wide ? 0.15 : 0.12, 16, 32),
    mat(0xffffff, { map: texTire(), roughness: 0.86, metalness: 0.08 })
  );
  tire.rotation.y = Math.PI / 2;
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.11, 28),
    mat(0x1a1a1a, { map: texRim(), metalness: 0.85, roughness: 0.28 })
  );
  disc.rotation.z = Math.PI / 2;
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.22), mat(0xc9a227, { metalness: 0.6, roughness: 0.35 }));
  cal.position.set(0, 0.12, 0);
  g.add(tire, disc, cal);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function addMesh(geo, material, x, y, z, parent = car) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function buildCar(cfg) {
  while (car.children.length) car.remove(car.children[0]);
  const body = state.customLivery
    ? mat(0xffffff, { map: texLivery(cfg.color), metalness: 0.62, roughness: 0.2 })
    : mat(cfg.color, { metalness: 0.88, roughness: 0.16 });
  const dark = mat(0x141414, { metalness: 0.4, roughness: 0.42 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.38, metalness: 1, roughness: 0.05 });
  const leather = mat(0x171717, { roughness: 0.72, metalness: 0.06 });
  const silver = mat(0xd0d0d0, { metalness: 0.92, roughness: 0.22 });

  addMesh(new THREE.BoxGeometry(2.35, 0.36, 1.48), body, 0.08, 0.56, 0);
  addMesh(new THREE.BoxGeometry(0.62, 0.2, 1.36), body, 1.28, 0.48, 0);
  addMesh(new THREE.BoxGeometry(0.82, 0.24, 0.18), body, -0.7, 0.5, 0.78);
  addMesh(new THREE.BoxGeometry(0.82, 0.24, 0.18), body, -0.7, 0.5, -0.78);
  addMesh(new THREE.BoxGeometry(1.05, 0.38, 1.18), dark, 0.08, 0.9, 0);
  addMesh(new THREE.BoxGeometry(0.92, 0.26, 1.04), glassMat, 0.12, 1.06, 0);

  addMesh(new THREE.BoxGeometry(0.36, 0.26, 0.34), leather, 0.02, 0.7, 0.26);
  addMesh(new THREE.BoxGeometry(0.36, 0.26, 0.34), leather, 0.02, 0.7, -0.26);
  addMesh(new THREE.BoxGeometry(0.32, 0.07, 0.96), dark, 0.36, 0.76, 0);
  const helm = addMesh(new THREE.TorusGeometry(0.13, 0.022, 8, 18), mat(0x111, { roughness: 0.55 }), 0.4, 0.84, 0.2);
  helm.rotation.y = 0.45;

  const hoodPivot = new THREE.Group();
  hoodPivot.position.set(0.52, 0.74, 0);
  car.add(hoodPivot);
  addMesh(new THREE.BoxGeometry(1.02, 0.07, 1.34), body, 0.5, 0.04, 0, hoodPivot);
  addMesh(new THREE.BoxGeometry(0.28, 0.05, 0.42), dark, 0.72, 0.08, 0.28, hoodPivot);
  addMesh(new THREE.BoxGeometry(0.28, 0.05, 0.42), dark, 0.72, 0.08, -0.28, hoodPivot);

  const trunkPivot = new THREE.Group();
  trunkPivot.position.set(-1.02, 0.74, 0);
  car.add(trunkPivot);
  addMesh(new THREE.BoxGeometry(0.58, 0.07, 1.32), body, -0.26, 0.03, 0, trunkPivot);

  const mkDoor = (side) => {
    const pivot = new THREE.Group();
    pivot.userData.door = true;
    pivot.position.set(0.16, 0.62, 0.74 * side);
    car.add(pivot);
    addMesh(new THREE.BoxGeometry(0.86, 0.34, 0.06), body, 0.1, 0, 0, pivot);
    addMesh(new THREE.BoxGeometry(0.32, 0.12, 0.03), glassMat, 0.12, 0.12, 0.01 * side, pivot);
    return pivot;
  };
  mkDoor(1);
  mkDoor(-1);

  addMesh(new THREE.BoxGeometry(0.2, 0.045, 1.48), dark, -1.2, 1.2, 0);
  addMesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), dark, -1.16, 1.0, 0.5);
  addMesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), dark, -1.16, 1.0, -0.5);
  addMesh(new THREE.BoxGeometry(0.24, 0.14, 0.05), dark, -1.2, 1.26, 0.76);
  addMesh(new THREE.BoxGeometry(0.24, 0.14, 0.05), dark, -1.2, 1.26, -0.76);
  addMesh(new THREE.BoxGeometry(0.62, 0.06, 0.035), silver, -0.12, 0.6, 0.76);

  const wfl = wheel(false); wfl.position.set(0.86, 0.35, 0.74);
  const wfr = wheel(false); wfr.position.set(0.86, 0.35, -0.74);
  const wrl = wheel(true); wrl.position.set(-0.78, 0.37, 0.76);
  const wrr = wheel(true); wrr.position.set(-0.78, 0.37, -0.76);
  car.add(wfl, wfr, wrl, wrr);

  moving.hood = hoodPivot;
  moving.trunk = trunkPivot;
}

function mkStoredDoors(root) {
  return root.children.filter((ch) => ch.userData && ch.userData.door);
}

function paintCar(cfg) {
  applyPaint();
  return;
  /* legacy 3d */

  buildCar(cfg);
  moving.doorList = mkStoredDoors(car);
  moving.tHood = 0;
  moving.tTrunk = 0;
  moving.tDoors = 0;
}

document.querySelectorAll('.hotspots button').forEach((b) => {
  b.onclick = () => {
    const p = b.dataset.part;
    if (p === 'hood') moving.tHood = moving.tHood > 0.5 ? 0 : 1;
    if (p === 'trunk') moving.tTrunk = moving.tTrunk > 0.5 ? 0 : 1;
    if (p === 'doors') moving.tDoors = moving.tDoors > 0.5 ? 0 : 1;
    if (p === 'reset') moving.tHood = moving.tTrunk = moving.tDoors = 0;
  };
});

function lerpAngle(obj, axis, target, dt) {
  const cur = obj.rotation[axis];
  obj.rotation[axis] = cur + (target - cur) * Math.min(1, dt * 6);
}

function onResize() {
  if (!canvas || !renderer) return;
  const wrap = document.getElementById('podiumWrap') || canvas.parentElement;
  const rect = wrap?.getBoundingClientRect?.() || { width: 0, height: 0 };
  let w = Math.max(1, Math.floor(rect.width || canvas.clientWidth || 320));
  let h = Math.max(1, Math.floor(rect.height || canvas.clientHeight || 240));
  // fallback if layout not ready
  if (w < 8 || h < 8) { w = 320; h = 240; }
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  try { podiumInvalidate(200, true); } catch (_) {}
}
window.addEventListener('resize', onResize);
if (typeof ResizeObserver !== 'undefined') {
  const wrap = document.getElementById('podiumWrap');
  if (wrap) new ResizeObserver(() => onResize()).observe(wrap);
}

/* ---- Render loop: render-on-demand + pause when hidden + adaptive tier check ---- */
let last = performance.now();
let loopRaf = 0;
let lastRenderAt = 0;
let lastProcAt = 0;
let renderUntil = 0;
let needFrame = true;
let settleNeeded = false;
let lastShadowAt = 0;
let userInteracting = false;
let interactUntil = 0;
let podiumInView = true;
const IDLE_SAFETY_MS = 1000; // idle safety-net repaint (1 fps) in case something changed silently
let renderedFrames = 0;
let driveIn = null; // active drive-in animation state (see startDriveIn, DEPLOY.md §22)

/** Ask the podium to repaint (and keep painting for `ms`). hard = scene changed (refresh mirror/shadow now). */
function podiumInvalidate(ms = 0, hard = false) {
  const now = performance.now();
  if (ms > 0) renderUntil = Math.max(renderUntil, now + ms);
  needFrame = true;
  if (hard) { reflForce = true; try { renderer.shadowMap.needsUpdate = true; } catch (_) {} }
  kickLoop();
}
function podiumShouldRun() {
  return !document.hidden && podiumInView;
}
function kickLoop() {
  if (!loopRaf && podiumShouldRun()) loopRaf = requestAnimationFrame(tick);
}
controls.addEventListener('start', () => { userInteracting = true; podiumInvalidate(300); });
controls.addEventListener('end', () => { userInteracting = false; interactUntil = performance.now() + 1500; podiumInvalidate(300); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { last = performance.now(); podiumInvalidate(300, true); qMeasureReset(); } else { qMeasureReset(); try { finishDriveIn(); } catch (_) {} }
});
try {
  if (typeof IntersectionObserver !== 'undefined' && canvas) {
    new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      const vis = !!(e && e.isIntersecting);
      if (vis === podiumInView) return;
      podiumInView = vis;
      if (!vis) { try { finishDriveIn(); } catch (_) {} } // leaving the garage aborts the drive-in (controls restored)
      qMeasureReset();
      if (vis) { last = performance.now(); podiumInvalidate(300, true); }
    }).observe(canvas);
  }
} catch (_) {}
// Any tap / input inside the garage (paint picker, finish, ◀ ▶, doors…) → repaint immediately
['pointerdown', 'click', 'input', 'change'].forEach((ev) => {
  document.getElementById('view-garage')?.addEventListener(ev, () => podiumInvalidate(800, true), { capture: true, passive: true });
});

/* Adaptive tier measurement: ~2s of frame times after warm-up; step down only (hysteresis). */
const qm = { phase: 'idle', t0: 0, frames: 0, deltas: [], lastT: 0, stalls: 0, done: Q.locked || Q.tier === 'low' };
function qMeasureReset() {
  if (qm.phase !== 'idle' && qm.phase !== 'done') { qm.phase = 'idle'; }
}
function qMeasureStep(now, rendered) {
  if (qm.done || introBlocking3d || !glbRoot || !podiumEnvReady) return false;
  // "after models warm up": wait for catalog prefetch/parse (or 20 s max) so parse jank isn't read as a slow GPU
  if (!glbPrefetchDone && (!glbPrefetchT0 || now - glbPrefetchT0 < 20000)) return false;
  if (qm.phase === 'idle') { qm.phase = 'warm'; qm.t0 = now; return true; }
  if (qm.phase === 'warm') {
    if (now - qm.t0 >= 1500) { qm.phase = 'sample'; qm.t0 = now; qm.frames = 0; qm.deltas = []; qm.lastT = 0; }
    return true;
  }
  if (qm.phase === 'sample') {
    if (rendered) {
      if (qm.lastT) {
        const d = now - qm.lastT;
        if (d > 3000 && qm.stalls < 2) { qm.stalls++; qm.phase = 'idle'; return true; } // long stall (GC / decode) — retry, max 2×
        qm.deltas.push(d);
      }
      qm.lastT = now;
      qm.frames++;
    }
    const el = now - qm.t0;
    if (el < 2000) return true;
    const ds = qm.deltas.slice().sort((a, b) => a - b);
    const med = ds.length ? ds[ds.length >> 1] : 1000;
    const fps = qm.frames / (el / 1000);
    const slow = fps < qTargetFps();
    const from = Q.tier;
    Q.measured.push({ tier: from, fps: +fps.toFixed(1), medMs: +med.toFixed(1) });
    if (slow) {
      const i = Q_TIERS.indexOf(Q.tier);
      Q.tier = Q_TIERS[Math.min(Q_TIERS.length - 1, i + 1)];
      Q.source = 'measured';
      console.info(`[pitlane] 3D quality: ${from} ${fps.toFixed(1)} fps (median ${med.toFixed(1)} ms) → ${Q.tier}`);
      qPersist();
      applyQualityTier();
      if (Q.tier === 'low') { qm.done = true; qm.phase = 'done'; } else { qm.phase = 'warm'; qm.t0 = now; }
    } else {
      console.info(`[pitlane] 3D quality: ${Q.tier} ok — ${fps.toFixed(1)} fps (median ${med.toFixed(1)} ms)`);
      if (Q.source !== 'measured') Q.source = Q.source + '+measured';
      qPersist();
      qm.done = true; qm.phase = 'done';
    }
    return !qm.done;
  }
  return false;
}

function podiumRender(now) {
  const p = qPreset();
  if (p.shadow && p.shadowStatic && now - lastShadowAt > 1000) { renderer.shadowMap.needsUpdate = true; }
  if (renderer.shadowMap.needsUpdate) lastShadowAt = now;
  renderer.render(scene, camera);
  lastRenderAt = now;
  renderedFrames++;
}

function tick(now) {
  loopRaf = 0;
  if (!podiumShouldRun()) return; // paused (tab hidden / podium off-screen); kickLoop() resumes
  loopRaf = requestAnimationFrame(tick);
  // Keep CSS intro buttery: no WebGL render / controls while intro owns the screen
  if (introBlocking3d) return;
  const p = qPreset();
  const interactive = userInteracting || now < interactUntil || now < renderUntil;
  const cap = interactive ? p.maxFps : (p.idleFps || p.maxFps);
  if (cap && lastProcAt && now - lastProcAt < 1000 / cap - 3) return;
  const dtRaw = (now - (lastProcAt || now)) / 1000;
  lastProcAt = now;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let animating = false;
  const lerp = (obj, axis, target) => {
    if (Math.abs(obj.rotation[axis] - target) > 1e-3) animating = true;
    lerpAngle(obj, axis, target, dt);
  };
  if (moving.hood) lerp(moving.hood, 'z', -moving.tHood * 1.05);
  if (moving.trunk) lerp(moving.trunk, 'z', moving.tTrunk * 1.05);
  (moving.doorList || []).forEach((d) => {
    const dir = Math.sign(d.position.z) || 1;
    lerp(d, 'y', dir * moving.tDoors * 1.1);
  });
  const diLocked = !!driveIn; // camera frozen while the car drives in (no controls.update → no auto-rotate / damping)
  if (driveIn) { stepDriveIn(now); animating = true; }
  // high: exact original per-frame update; capped tiers: time-based so rotation speed matches 60 Hz
  const changed = diLocked ? false : p.maxFps ? controls.update(Math.min(0.1, Math.max(0.001, dtRaw || 1 / 60))) : controls.update();
  const measuring = qMeasureStep(now, false);
  const active = changed || animating || needFrame || now < renderUntil || measuring || userInteracting;
  if (!active) {
    if (settleNeeded) { reflForce = true; settleNeeded = false; podiumRender(now); }
    else if (now - lastRenderAt > IDLE_SAFETY_MS) podiumRender(now);
    return;
  }
  needFrame = false;
  settleNeeded = true;
  podiumRender(now);
  if (measuring) qMeasureStep(now, true);
}

try {
  window.__pitlane3d = {
    quality: () => ({ tier: Q.tier, source: Q.source, gpu: Q.gpu, locked: Q.locked, measured: Q.measured.slice(), dpr: renderer.getPixelRatio() }),
    frames: () => renderedFrames,
    invalidate: () => podiumInvalidate(300, true),
    // drive-in debug/recording: replay on the current model, freeze at t ms (null = live), state
    driveInReplay: () => startDriveIn(glbRoot, podiumModelId),
    driveInSeek: (ms) => { if (!driveIn) return false; driveIn.seekT = ms; podiumInvalidate(200, true); return true; },
    driveInActive: () => !!driveIn,
    driveInState: () => (driveIn ? { t0: driveIn.t0, t: driveIn.lastT ?? 0, seekT: driveIn.seekT ?? null, controlsEnabled: controls.enabled } : null),
    // synchronous frame for offline recording: pose at t ms, render, return PNG data URL (null when no drive-in)
    driveInFrame: (ms, type = 'image/png') => {
      if (driveIn) { driveIn.seekT = ms; stepDriveIn(performance.now()); }
      controls.update(); podiumRender(performance.now());
      return canvas.toDataURL(type);
    },
  };
} catch (_) {}


const DEEP_VIEWS = new Set(['garage', 'run', 'lap', 'tops', 'pulse', 'account', 'cars']);

/** Parse ?view= / ?skipIntro=1 and hash #view=… (never treats #r= / #s= as view). */
function getDeepLinkView() {
  try {
    const params = new URLSearchParams(location.search);
    let view = (params.get('view') || '').toLowerCase();
    const skipFlag = params.get('skipIntro') === '1';
    const hash = location.hash || '';
    if (!view && hash) {
      // Only #view=… — do not steal share/duel/crew payloads #r= / #s= / #duel= / #crew=
      if (/^#view=/i.test(hash)) {
        view = decodeURIComponent(hash.slice(6).split(/[&#]/)[0] || '').toLowerCase();
      } else if (!/^#([rs]|duel|crew)=/i.test(hash)) {
        const m = hash.match(/[#&?]view=([a-z]+)/i);
        if (m) view = m[1].toLowerCase();
      }
    }
    if (!DEEP_VIEWS.has(view)) view = '';
    return { view, skipIntro: skipFlag || !!view };
  } catch (_) {
    return { view: '', skipIntro: false };
  }
}

function clearDeepLinkUrl() {
  try {
    const hash = location.hash || '';
    const keep = /^#([rs]|duel|crew)=/i.test(hash) ? hash : '';
    history.replaceState(null, '', location.pathname + keep);
  } catch (_) {}
}

(function setupIntro() {
  const el = document.getElementById('intro');
  if (!el) { introBlocking3d = false; return; }
  const KEY = 'pitlane-intro-seen';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    el.classList.add('done');
    try { sessionStorage.setItem(KEY, '1'); } catch (_) {}
    introBlocking3d = false;
    try { podiumInvalidate(1000, true); } catch (_) {}
    setTimeout(() => {
      try { bootPodium(); } catch (_) {}
      try { startGlbPrefetch(podiumModelId || state.carId || 'g87-m2'); } catch (_) {}
    }, 30);
    try { prefetchEngineStart(); } catch (_) {}
  };
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch (_) {}
  let deepSkip = false;
  try { deepSkip = !!getDeepLinkView().skipIntro; } catch (_) {}
  if (seen || deepSkip) {
    finish();
    return;
  }
  el.addEventListener('click', finish, { once: true });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') finish();
  });
  setTimeout(finish, reduce ? 900 : 4000);
})();

renderTracks();
applyCarUI();
onResize();
kickLoop();

/* -------- GPS acceleration run -------- */
const run = {
  watchId: null,
  armed: false,
  launched: false,
  samples: [],
  t0: null,
  marks: {},
};

function haversineM(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
/* =============================================================================
 * GpsFusion — client nav-grade stack (honest: no Yandex server).
 * 2D CV Kalman in local ENU [e,n,vE,vN] + optional IMU coast + ZUPT.
 * Filtered state feeds distance / S/F gates / HUD; raw kept for diagnostics.
 * ============================================================================= */
const GpsFusion = (() => {
  const DEG = Math.PI / 180;
  const R_EARTH = 6371000;
  const M_PER_DEG_LAT = 111320;

  // ENU meters + velocities; HUD speed buffer; IMU buffers
  const st = {
    ready: false,
    healthy: false,
    anchorLat: null,
    anchorLon: null,
    e: 0, n: 0, vE: 0, vN: 0,
    // diagonal-ish covariance (simplified 4-state)
    P: [80, 80, 40, 40],
    lastGpsTs: 0,
    lastTick: 0,
    lastRaw: null,
    lat: null, lon: null,
    vKmh: 0,
    heading: null,
    accEst: null,
    innov: 0,
    quality: 'C', // A/B/C for gpsQ badge path
    imuOn: false,
    imuDenied: false,
    imuAsked: false,
    // IMU: world-ish accel (m/s²) + yaw rate (rad/s)
    ax: 0, ay: 0,
    yawRate: 0,
    headingImu: null,
    accelVar: 1,
    stillMs: 0,
    zupt: false,
    // HUD slew
    showV: 0,
    speedBuf: [],
    // process / meas noise knobs
    qPos: 0.8,
    qVel: 6,
  };

  function mPerDegLon(lat) {
    return M_PER_DEG_LAT * Math.cos((lat || 0) * DEG);
  }
  function toEnu(lat, lon) {
    const mLon = mPerDegLon(st.anchorLat);
    return {
      e: (lon - st.anchorLon) * mLon,
      n: (lat - st.anchorLat) * M_PER_DEG_LAT,
    };
  }
  function fromEnu(e, n) {
    const mLon = mPerDegLon(st.anchorLat) || 1;
    return {
      lat: st.anchorLat + n / M_PER_DEG_LAT,
      lon: st.anchorLon + e / mLon,
    };
  }
  function speedKmh() {
    return Math.hypot(st.vE, st.vN) * 3.6;
  }
  function headingFromV() {
    const s = Math.hypot(st.vE, st.vN);
    if (s < 0.4) return st.heading;
    // heading: 0=N, 90=E (nav)
    return (Math.atan2(st.vE, st.vN) / DEG + 360) % 360;
  }
  function gradeQuality(acc, nis, zupt) {
    if (zupt && (acc == null || acc <= 20)) return 'A';
    if (acc != null && acc <= 8 && nis < 2.5) return 'A';
    if (acc != null && acc <= 18 && nis < 6) return 'B';
    if (acc != null && acc <= 35) return 'B';
    return 'C';
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function predict(dt, accelerating) {
    if (dt <= 0 || dt > 3) return;
    // Adaptive process noise when accelerating (IMU Δa or |Δv|)
    const qBoost = accelerating ? 2.8 : 1;
    const qP = st.qPos * qBoost * dt;
    const qV = st.qVel * qBoost * dt;
    st.e += st.vE * dt;
    st.n += st.vN * dt;
    st.P[0] += qP + 0.15 * st.P[2] * dt;
    st.P[1] += qP + 0.15 * st.P[3] * dt;
    st.P[2] += qV;
    st.P[3] += qV;
  }

  function updatePos(eZ, nZ, R) {
    // Independent 1D updates on e/n (cheap CV)
    const innovE = eZ - st.e;
    const innovN = nZ - st.n;
    const Se = st.P[0] + R;
    const Sn = st.P[1] + R;
    const nis = (innovE * innovE) / Math.max(1, Se) + (innovN * innovN) / Math.max(1, Sn);
    st.innov = nis;
    // NIS gate: hard reject → coast only
    if (nis > 12) return { accept: false, nis };
    const soft = nis > 5;
    const Ruse = soft ? R * 3.5 : R;
    const Ke = st.P[0] / (st.P[0] + Ruse);
    const Kn = st.P[1] / (st.P[1] + Ruse);
    st.e += Ke * innovE;
    st.n += Kn * innovN;
    st.P[0] *= (1 - Ke);
    st.P[1] *= (1 - Kn);
    // velocity from innov/dt via light coupling (done in caller with Doppler)
    return { accept: true, nis, soft };
  }

  function updateVel(vE, vN, Rv) {
    const ie = vE - st.vE;
    const in_ = vN - st.vN;
    const Ke = st.P[2] / (st.P[2] + Rv);
    const Kn = st.P[3] / (st.P[3] + Rv);
    st.vE += Ke * ie;
    st.vN += Kn * in_;
    st.P[2] *= (1 - Ke);
    st.P[3] *= (1 - Kn);
  }

  function applyZupt(dt) {
    const spd = Math.hypot(st.vE, st.vN);
    const stillGps = spd < 0.45; // ~1.6 км/ч
    const stillImu = st.imuOn ? st.accelVar < 0.12 : stillGps;
    if (stillGps && stillImu) {
      st.stillMs += dt * 1000;
    } else {
      st.stillMs = Math.max(0, st.stillMs - dt * 600);
    }
    if (st.stillMs > 400) {
      st.zupt = true;
      st.vE = 0;
      st.vN = 0;
      st.P[2] = Math.min(st.P[2], 2);
      st.P[3] = Math.min(st.P[3], 2);
      // freeze drift: lightly pull pos variance down
      st.P[0] = Math.min(st.P[0], 12);
      st.P[1] = Math.min(st.P[1], 12);
    } else {
      st.zupt = false;
    }
  }

  function coastImu(dt) {
    if (!st.imuOn || st.zupt || dt <= 0 || dt > 0.5) return false;
    // Trust GPS speed magnitude; use yaw rate to rotate velocity heading
    if (Math.abs(st.yawRate) > 0.02) {
      const spd = Math.hypot(st.vE, st.vN);
      if (spd > 0.3) {
        const h = Math.atan2(st.vE, st.vN) + st.yawRate * dt;
        st.vE = Math.sin(h) * spd;
        st.vN = Math.cos(h) * spd;
      }
    }
    // Integrate horizontal accel (already roughly world-framed if orientation known)
    const ax = clamp(st.ax, -8, 8);
    const ay = clamp(st.ay, -8, 8);
    if (Math.hypot(ax, ay) > 0.35) {
      st.vE += ax * dt;
      st.vN += ay * dt;
      return true;
    }
    return false;
  }

  function publish(acc) {
    const ll = fromEnu(st.e, st.n);
    st.lat = ll.lat;
    st.lon = ll.lon;
    st.vKmh = speedKmh();
    if (st.vKmh < 0.4) st.vKmh = 0;
    if (st.vKmh > 360) st.vKmh = 360;
    st.heading = headingFromV();
    // fused accuracy estimate: GPS acc blended with filter P
    const pM = Math.sqrt(Math.max(0, st.P[0] + st.P[1]));
    st.accEst = acc != null
      ? Math.sqrt(0.55 * acc * acc + 0.45 * pM * pM)
      : pM;
    st.quality = gradeQuality(st.accEst, st.innov, st.zupt);
    st.healthy = st.ready && st.accEst != null && st.accEst < 45 && st.innov < 14;
    // HUD median + slew (responsive on accel, calm when steady)
    st.speedBuf.push(st.vKmh);
    while (st.speedBuf.length > 5) st.speedBuf.shift();
    const sorted = st.speedBuf.slice().sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const accelerating = Math.abs(med - st.showV) > 4;
    const maxStep = accelerating ? 9 : 5.2;
    const d = med - st.showV;
    st.showV += Math.sign(d) * Math.min(Math.abs(d), maxStep);
    if (st.showV < 0.4) st.showV = 0;
  }

  function reset() {
    st.ready = false;
    st.healthy = false;
    st.anchorLat = null;
    st.anchorLon = null;
    st.e = st.n = st.vE = st.vN = 0;
    st.P = [80, 80, 40, 40];
    st.lastGpsTs = 0;
    st.lastTick = 0;
    st.lastRaw = null;
    st.lat = st.lon = null;
    st.vKmh = 0;
    st.heading = null;
    st.accEst = null;
    st.innov = 0;
    st.quality = 'C';
    st.ax = st.ay = 0;
    st.yawRate = 0;
    st.headingImu = null;
    st.accelVar = 1;
    st.stillMs = 0;
    st.zupt = false;
    st.showV = 0;
    st.speedBuf.length = 0;
  }

  function ingestGps(coords, ts) {
    if (!coords || coords.latitude == null || coords.longitude == null) {
      return getState();
    }
    const acc = coords.accuracy != null && Number.isFinite(coords.accuracy) ? Number(coords.accuracy) : 25;
    st.lastRaw = {
      lat: coords.latitude,
      lon: coords.longitude,
      acc,
      speed: coords.speed,
      heading: coords.heading,
      t: ts,
    };

    // Soft/hard reject by accuracy
    if (acc > 60) {
      // ignore measurement; still tick-coast if ready
      if (st.ready) {
        const dt = st.lastGpsTs ? clamp((ts - st.lastGpsTs) / 1000, 0.05, 2.5) : 0.3;
        predict(dt, false);
        applyZupt(dt);
        publish(st.accEst);
        st.lastGpsTs = ts;
      }
      return getState();
    }

    if (!st.ready) {
      st.anchorLat = coords.latitude;
      st.anchorLon = coords.longitude;
      st.e = 0;
      st.n = 0;
      let vE = 0, vN = 0;
      if (coords.speed != null && Number.isFinite(coords.speed) && coords.speed >= 0) {
        const hdg = (coords.heading != null && Number.isFinite(coords.heading))
          ? coords.heading * DEG
          : 0;
        const v = coords.speed;
        vE = Math.sin(hdg) * v;
        vN = Math.cos(hdg) * v;
      }
      st.vE = vE;
      st.vN = vN;
      st.P = [Math.max(9, acc * acc), Math.max(9, acc * acc), 25, 25];
      st.ready = true;
      st.lastGpsTs = ts;
      st.lastTick = ts;
      publish(acc);
      return getState();
    }

    const dt = st.lastGpsTs ? clamp((ts - st.lastGpsTs) / 1000, 0.05, 2.8) : 0.25;
    const accelerating = st.imuOn && Math.hypot(st.ax, st.ay) > 1.2;
    predict(dt, accelerating);

    const en = toEnu(coords.latitude, coords.longitude);
    // Jump vs possible motion → coast only
    const jump = Math.hypot(en.e - st.e, en.n - st.n);
    const maxJump = Math.hypot(st.vE, st.vN) * dt + Math.max(12, acc * 1.4) + 18;
    if (jump > maxJump && jump > 35) {
      // teleport: do not update with this fix
      applyZupt(dt);
      publish(Math.max(acc, st.accEst || acc));
      st.lastGpsTs = ts;
      return getState();
    }

    let R = Math.max(4, acc * acc);
    if (acc > 35) R *= 4; // heavy R
    else if (acc > 22) R *= 1.8;

    const up = updatePos(en.e, en.n, R);
    if (up.accept) {
      // Optional Doppler velocity from speed+heading
      const hasSpd = coords.speed != null && Number.isFinite(coords.speed) && coords.speed >= 0;
      const hasHdg = coords.heading != null && Number.isFinite(coords.heading);
      if (hasSpd && hasHdg && coords.speed < 95) {
        const hdg = coords.heading * DEG;
        const vE = Math.sin(hdg) * coords.speed;
        const vN = Math.cos(hdg) * coords.speed;
        let Rv = 4 + (acc > 20 ? 12 : 3);
        if (acc > 35) Rv *= 3;
        updateVel(vE, vN, Rv);
      } else if (hasSpd && dt > 0.08) {
        // speed-only: pull magnitude toward Doppler, keep heading from filter
        const want = coords.speed;
        const cur = Math.hypot(st.vE, st.vN);
        if (cur > 0.2) {
          const k = 0.35;
          const scale = (1 - k) + k * (want / cur);
          st.vE *= scale;
          st.vN *= scale;
        } else if (want > 0.5 && st.heading != null) {
          const hdg = st.heading * DEG;
          st.vE = Math.sin(hdg) * want;
          st.vN = Math.cos(hdg) * want;
        }
      } else if (st.lastRaw && dt > 0.12) {
        // light haversine velocity assist when no Doppler
        const prev = toEnu(st.lastRaw.lat, st.lastRaw.lon);
        // lastRaw already overwritten — use pre-update position delta via en vs predict residual
        // skip; position update already applied
      }
    }

    applyZupt(dt);
    publish(acc);
    st.lastGpsTs = ts;
    st.lastTick = ts;
    return getState();
  }

  function tick(now) {
    if (!st.ready) return getState();
    const t = now || Date.now();
    const dt = st.lastTick ? clamp((t - st.lastTick) / 1000, 0, 0.35) : 0;
    if (dt < 0.016) return getState();
    const accel = coastImu(dt);
    predict(dt, accel);
    applyZupt(dt);
    publish(st.accEst);
    st.lastTick = t;
    return getState();
  }

  function getState() {
    return {
      ready: st.ready,
      healthy: st.healthy,
      lat: st.lat,
      lon: st.lon,
      vKmh: st.vKmh,
      showKmh: st.showV,
      heading: st.heading,
      accEst: st.accEst,
      innov: st.innov,
      quality: st.quality,
      imuOn: st.imuOn,
      imuDenied: st.imuDenied,
      zupt: st.zupt,
      raw: st.lastRaw,
      vE: st.vE,
      vN: st.vN,
    };
  }

  async function enableImu() {
    if (st.imuAsked && (st.imuOn || st.imuDenied)) return st.imuOn;
    st.imuAsked = true;
    try {
      const DOM = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
      const DME = typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : null;
      if (DOM && typeof DOM.requestPermission === 'function') {
        const r = await DOM.requestPermission();
        if (r !== 'granted') {
          st.imuDenied = true;
          st.imuOn = false;
          return false;
        }
      }
      if (DME && typeof DME.requestPermission === 'function') {
        const r2 = await DME.requestPermission();
        if (r2 !== 'granted') {
          st.imuDenied = true;
          st.imuOn = false;
          return false;
        }
      }
      st.imuOn = true;
      st.imuDenied = false;
      return true;
    } catch (_) {
      // Android / desktop: listeners still work without prompt
      st.imuOn = true;
      return true;
    }
  }

  // rolling accel variance for ZUPT
  const _abuf = [];
  function onDeviceMotion(e) {
    const a = e.acceleration; // prefers linear (no g)
    const ag = e.accelerationIncludingGravity;
    let ax = 0, ay = 0, az = 0;
    if (a && (a.x != null || a.y != null)) {
      ax = a.x || 0; ay = a.y || 0; az = a.z || 0;
    } else if (ag) {
      // crude: remove ~1g vertical — better with orientation, OK for variance/ZUPT
      ax = ag.x || 0; ay = ag.y || 0; az = (ag.z || 0);
      const g = Math.hypot(ax, ay, az) || 1;
      // residual from gravity magnitude
      const scale = Math.max(0, g - 9.81);
      ax *= scale / g; ay *= scale / g;
    }
    // Map device XY → approx world using IMU heading if known
    let wx = ax, wy = ay;
    if (st.headingImu != null) {
      const h = st.headingImu * DEG;
      // device +y often forward on phones in portrait — treat ay as forward
      wx = Math.sin(h) * ay + Math.cos(h) * ax;
      wy = Math.cos(h) * ay - Math.sin(h) * ax;
    }
    st.ax = wx;
    st.ay = wy;
    const mag = Math.hypot(ax, ay, az);
    _abuf.push(mag);
    while (_abuf.length > 12) _abuf.shift();
    if (_abuf.length >= 4) {
      const mean = _abuf.reduce((s, v) => s + v, 0) / _abuf.length;
      st.accelVar = _abuf.reduce((s, v) => s + (v - mean) ** 2, 0) / _abuf.length;
    }
    if (e.rotationRate && e.rotationRate.alpha != null) {
      // alpha is deg/s around Z in many browsers
      st.yawRate = (e.rotationRate.alpha || 0) * DEG;
    }
  }

  function onDeviceOrientation(e) {
    let h = null;
    if (e.webkitCompassHeading != null && Number.isFinite(e.webkitCompassHeading)) {
      h = e.webkitCompassHeading;
    } else if (e.alpha != null && Number.isFinite(e.alpha)) {
      // absolute if available
      h = (360 - e.alpha) % 360;
    }
    if (h != null) st.headingImu = h;
  }

  return {
    reset,
    ingestGps,
    tick,
    getState,
    enableImu,
    onDeviceMotion,
    onDeviceOrientation,
    get quality() { return st.quality; },
  };
})();

// Compat aliases used across measure / lap / HUD
let filtV = 0;
let filtShow = 0;

function resetSpeedFilter() {
  GpsFusion.reset();
  filtV = 0;
  filtShow = 0;
}

/** GPS speed for timing (filtV) + smoother HUD (filtShow). Prefer fused state. */
function kmhFromCoords(coords, ts) {
  const s = GpsFusion.ingestGps(coords, ts);
  if (!s.ready) return null;
  filtV = s.vKmh;
  filtShow = s.showKmh;
  return filtV;
}

function displayKmh() {
  const s = GpsFusion.getState();
  return Math.round(s.showKmh || s.vKmh || filtShow || filtV || 0);
}

function interpolateCross(prev, next, target) {
  if (prev.v >= target) return prev.t;
  if (next.v < target) return null;
  const k = (target - prev.v) / Math.max(0.01, next.v - prev.v);
  return prev.t + (next.t - prev.t) * k;
}

function setRunText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function openRunDrive() {
  const el = document.getElementById('runDrive');
  if (!el) return;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('run-drive-on');
  const marks = document.getElementById('runDriveMarks');
  if (marks) marks.innerHTML = '';
  setRunText('runDriveMsg', 'почти стой (< 8 км/ч), потом газ');
  setRunText('runDriveDist', '0 м');
  setRunText('runDriveSpeed', document.getElementById('liveSpeed')?.textContent || '0');
}

function closeRunDrive() {
  const el = document.getElementById('runDrive');
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('run-drive-on');
}

function revealRunMark(key, label, value) {
  if (run.revealed?.[key]) return;
  run.revealed = run.revealed || {};
  run.revealed[key] = true;
  const ul = document.getElementById('runDriveMarks');
  if (!ul) return;
  const li = document.createElement('li');
  li.className = 'run-mark-in';
  li.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  ul.appendChild(li);
  hap([10, 30, 10]);
  try { ul.scrollTop = ul.scrollHeight; } catch (_) {}
}

function fmtRunSec(sec) {
  return `${Number(sec).toFixed(2)} с`;
}


function onGpsPoint(pos) {
  const now = pos.timestamp || Date.now();
  GpsFusion.tick(now);
  const v = kmhFromCoords(pos.coords, now);
  const fus = GpsFusion.getState();
  const acc = fus.accEst != null ? fus.accEst : pos.coords.accuracy;
  const rawAcc = pos.coords.accuracy;
  const accLabel = acc != null
    ? (`±${Math.round(acc)} м` + (fus.imuOn ? ' · fusion' : (fus.healthy ? ' · KF' : '')))
    : '—';
  setRunText('gpsAcc', accLabel);
  if (v == null) {
    setRunText('runStatus', 'GPS холодный / indoor? Выйдите на улицу и подождите фикс.');
    return;
  }
  const vShow = displayKmh();
  setRunText('liveSpeed', String(vShow));
  setRunText('boxLive', String(vShow));
  if (document.body.classList.contains('run-drive-on')) setRunText('runDriveSpeed', String(vShow));
  if (lapRun.active) onLapGps(pos, v);

  if (!run.armed) {
    let tip = 'GPS живой. Стоите — жмите «Старт»';
    if (rawAcc != null && rawAcc > 35) tip = 'GPS грубый (±' + Math.round(rawAcc) + ' м). Лучше на открытом небе.';
    else if (fus.imuDenied) tip = 'GPS ок. IMU недоступен (iOS: разрешите движение) — фильтр GPS-only.';
    setRunText('runStatus', tip);
    return;
  }

  const sample = { t: now, v, acc: acc != null ? Number(acc) : null, q: fus.quality };
  const prev = run.samples[run.samples.length - 1];
  run.samples.push(sample);
  if (acc != null && Number.isFinite(Number(acc))) {
    run.accSum = (run.accSum || 0) + Number(acc);
    run.accN = (run.accN || 0) + 1;
  }
  run.gpsQLive = fus.quality;

  if (!run.launched) {
    // ZUPT helps clean 0–100: trust fused near-zero
    if (v < 8 || fus.zupt) {
      run.t0 = now;
      setRunText('runFrom', 'ожидание старта');
      setRunText('runStatus', fus.zupt ? 'Вооружён · ZUPT (стойка чистая)' : 'Вооружён. Трогайтесь');
      setRunText('runDriveMsg', 'вооружён — газ');
    } else if (run.t0 && v >= 8) {
      run.launched = true;
      setRunText('runFrom', 'пошли');
      setRunText('runStatus', 'Идёт разгон…');
      setRunText('runDriveMsg', 'поехали!');
      run.dist = 0; run.prevDist = 0; run.lastPos = null; run.lastFusT = now;
    } else {
      setRunText('runStatus', 'Для чистого 0–100 почти остановитесь (< 8 км/ч)');
    }
    return;
  }

  // distance from launch (drag traps): blend ∫v dt + filtered haversine (navigator-style)
  const lat = fus.healthy && fus.lat != null ? fus.lat : pos.coords.latitude;
  const lon = fus.healthy && fus.lon != null ? fus.lon : pos.coords.longitude;
  if (lat != null && lon != null) {
    const here = { lat, lon };
    const dt = run.lastFusT ? Math.max(0.05, Math.min(2.5, (now - run.lastFusT) / 1000)) : 0.25;
    let stepH = 0;
    if (run.lastPos) {
      stepH = haversineM(run.lastPos, here);
      if (stepH >= 80) stepH = 0; // teleport guard
    }
    const stepV = (v / 3.6) * dt; // ∫v
    // Prefer speed integration when filter healthy; haversine alone zigzags
    const step = fus.healthy ? (0.62 * stepV + 0.38 * stepH) : (stepH || stepV);
    if (step < 90) run.dist = (run.dist || 0) + Math.max(0, step);
    run.lastPos = here;
    run.lastFusT = now;
    setRunText('runDriveDist', `${Math.round(run.dist || 0)} м`);
  }

  if (!prev) return;
  for (const gate of [50, 60, 80, 100, 120, 200, 300]) {
    const key = String(gate);
    if (run.marks[key] != null) continue;
    if (prev.v < gate && sample.v >= gate) {
      run.marks[key] = interpolateCross(prev, sample, gate);
    }
  }

  // distance traps: 60 ft, 1/8 mi, 1/4 mi
  const DIST_TRAPS = [
    { key: 'd60ft', m: 18.288, label: '60 ft' },
    { key: 'd18', m: 201.168, label: '⅛ мили' },
    { key: 'd14', m: 402.336, label: '¼ мили' },
  ];
  for (const tr of DIST_TRAPS) {
    if (run.marks[tr.key] != null) continue;
    const prevD = run.prevDist || 0;
    const curD = run.dist || 0;
    if (prevD < tr.m && curD >= tr.m && run.t0) {
      const k = (tr.m - prevD) / Math.max(0.01, curD - prevD);
      const tCross = (run.lastT || now) + ((now - (run.lastT || now)) * k);
      // better: interpolate by time of samples
      run.marks[tr.key] = prev.t + (sample.t - prev.t) * k;
    }
  }
  run.prevDist = run.dist || 0;
  run.lastT = now;

  const t60 = run.marks['60'];
  const t100 = run.marks['100'];
  const t200 = run.marks['200'];
  const t300 = run.marks['300'];
  if (run.marks['50'] && !run.saved050) {
    const sec = (run.marks['50'] - run.t0) / 1000;
    setRunText('run050', fmtRunSec(sec));
    revealRunMark('050', '0–50', fmtRunSec(sec));
    run.saved050 = true;
  }
  if (t60 && !run.saved060) {
    const sec = (t60 - run.t0) / 1000;
    revealRunMark('060', '0–60', fmtRunSec(sec));
    run.saved060 = true;
  }
  if (run.marks['d60ft'] && !run.saved60ft) {
    const sec = (run.marks['d60ft'] - run.t0) / 1000;
    revealRunMark('60ft', '60 ft', fmtRunSec(sec));
    run.saved60ft = true;
  }
  if (run.marks['80'] && run.marks['120'] && !run.saved80120) {
    const s = (run.marks['120'] - run.marks['80']) / 1000;
    setRunText('run80120', fmtRunSec(s));
    setRunText('slip80120', `${s.toFixed(2)}s`);
    revealRunMark('80120', '80–120', fmtRunSec(s));
    run.saved80120 = true;
    try {
      const gq80120 = gpsQualityFromStraightRun();
      if (foldPassportGps({ v80120: Number(s.toFixed(2)) }, gq80120.gpsQ)) {
        save();
        try { applyPassportUI(); } catch (_) {}
      }
    } catch (_) {}
  }
  if (t100 && !run.saved0100) {
    const sec = (t100 - run.t0) / 1000;
    setRunText('run0100', fmtRunSec(sec));
    setRunText('slip0100', `${sec.toFixed(2)}s`);
    setRunText('slipHero', `${sec.toFixed(2)}s`);
    revealRunMark('0100', '0–100', fmtRunSec(sec));
    run.saved0100 = true;
    tmaHaptic('success');
    void publishGps(sec, t100 && t200 ? (t200 - t100) / 1000 : null, t200 && t300 ? (t300 - t200) / 1000 : null);
  }
  if (run.marks['d18'] && !run.saved18) {
    const sec = (run.marks['d18'] - run.t0) / 1000;
    revealRunMark('18', '⅛ мили', fmtRunSec(sec));
    run.saved18 = true;
  }
  if (t100 && t200 && !run.saved100200) {
    const s = (t200 - t100) / 1000;
    setRunText('run100200', fmtRunSec(s));
    setRunText('slip100200', `${s.toFixed(2)}s`);
    if (t100) setRunText('slip0200', `${((t200 - run.t0) / 1000).toFixed(2)}s`);
    revealRunMark('100200', '100–200', fmtRunSec(s));
    revealRunMark('0200', '0–200', fmtRunSec((t200 - run.t0) / 1000));
    run.saved100200 = true;
    void publishGps(null, s, t200 && t300 ? (t300 - t200) / 1000 : null);
  }
  if (run.marks['d14'] && !run.saved14) {
    const sec = (run.marks['d14'] - run.t0) / 1000;
    revealRunMark('14', '¼ мили', fmtRunSec(sec));
    run.saved14 = true;
  }
  if (t200 && t300 && !run.saved200300) {
    const s = (t300 - t200) / 1000;
    setRunText('run200300', fmtRunSec(s));
    setRunText('slip200300', `${s.toFixed(2)}s`);
    revealRunMark('200300', '200–300', fmtRunSec(s));
    run.saved200300 = true;
    void publishGps(null, null, s);
  }
  run.peak = Math.max(run.peak || 0, v);
  setRunText('runStatus', `Разгон: ${Math.round(v)} км/ч`);
  setRunText('runDriveMsg', `разгон · ${Math.round(v)} км/ч`);
  if (run.launched && run.peak >= 70 && v < run.peak - 12 && v < prev.v) {
    stopRun();
    setRunText('runStatus', 'Скорость упала — замер записан');
    setRunText('runDriveMsg', 'готово — скорость упала');
  }
}

function startWatch() {
  if (!navigator.geolocation) {
    setRunText('runStatus', 'В этом браузере нет Geolocation');
    return;
  }
  if (run.watchId != null) return;
  run.watchId = navigator.geolocation.watchPosition(
    (pos) => { hideGeoDenied(); onGpsPoint(pos); },
    (err) => {
      if (err && err.code === 1) {
        // PERMISSION_DENIED: stop polling, explain in Russian, offer the settings shortcut.
        stopGeoWatch();
        const msg = 'Нет доступа к геолокации — разрешите её в настройках';
        setRunText('runStatus', msg);
        try { setLapMsg(msg); } catch (_) {}
        showGeoDenied();
        return;
      }
      // TIMEOUT / POSITION_UNAVAILABLE are transient while watching — keep going.
      setRunText('runStatus', err?.code === 3 ? 'Ищем спутники… выйдите под открытое небо' : 'GPS временно недоступен — ждём сигнал');
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 2500 }
  );
  if (run.pollId) clearInterval(run.pollId);
  run.pollId = setInterval(() => {
    navigator.geolocation.getCurrentPosition(onGpsPoint, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 1800 });
  }, 400);
  // Screen Wake Lock; where it's missing (older iOS WebViews, Telegram) fall back to a muted looping video.
  void keepAwake(true);
  setRunText('runStatus', 'Запрос разрешения на геолокацию…');
}

function stopGeoWatch() {
  try { if (run.watchId != null) navigator.geolocation.clearWatch(run.watchId); } catch (_) {}
  run.watchId = null;
  if (run.pollId) clearInterval(run.pollId);
  run.pollId = null;
}

function showGeoDenied() {
  const box = document.getElementById('geoDenied');
  if (!box) return;
  const settings = document.getElementById('geoDeniedSettings');
  const txt = document.getElementById('geoDeniedText');
  const canSettings = canOpenLocationSettings();
  settings?.classList.toggle('hidden', !canSettings);
  if (txt) {
    txt.textContent = isTMA
      ? (canSettings
        ? 'Без GPS замер и круг не работают. Нажмите «Открыть настройки» и разрешите Telegram доступ к геопозиции, затем «Повторить».'
        : 'Без GPS замер и круг не работают. Разрешите Telegram доступ к геопозиции в настройках телефона (Настройки → Telegram → Геопозиция → «При использовании»), затем «Повторить».')
      : 'Без GPS замер и круг не работают. Разрешите доступ к геопозиции для этого сайта в настройках браузера, затем «Повторить».';
  }
  box.classList.remove('hidden');
}
function hideGeoDenied() {
  document.getElementById('geoDenied')?.classList.add('hidden');
}
document.getElementById('geoDeniedClose')?.addEventListener('click', hideGeoDenied);
document.addEventListener('visibilitychange', () => {
  // Wake locks are dropped when the page is hidden — take it back if a measurement is still running.
  if (document.visibilityState === 'visible' && (run.armed || lapRun.active)) void keepAwake(true);
});
document.getElementById('geoDeniedSettings')?.addEventListener('click', () => { openLocationSettings(); });
document.getElementById('geoDeniedRetry')?.addEventListener('click', () => {
  hideGeoDenied();
  stopGeoWatch();
  startWatch();
});

function armRun() {
  resetSpeedFilter();
  void GpsFusion.enableImu().then((ok) => {
    if (!ok) setRunText('runStatus', 'IMU недоступен — GPS-only fusion. На iOS: разрешите «Движение и ориентация».');
  });

  hap([18, 40, 18]);
  startWatch();
  void keepAwake(true); // re-acquire each arm (the watch may already be running from a previous run)
  run.armed = true;
  run.launched = false;
  run.samples = [];
  run.t0 = null;
  run.marks = {};
  run.accSum = 0;
  run.accN = 0;
  run.flags = [];
  run.revealed = {};
  run.peak = 0;
  run.dist = 0;
  run.prevDist = 0;
  run.lastPos = null;
  run.lastFusT = null;
  run.saved0100 = run.saved100200 = run.saved200300 = run.saved050 = run.saved060 = run.saved80120 = run.saved1000 = false;
  run.saved60ft = run.saved18 = run.saved14 = false;
  run.passportFolded = {};
  run.brakeArmed = false;
  run.brakeT0 = null;
  ['run050', 'run0100', 'run100200', 'run80120', 'run200300', 'run1000'].forEach((id) => setRunText(id, '—'));
  setRunText('runFrom', 'вооружён');
  setRunText('runStatus', 'Вооружён. Почти остановитесь и газуйте');
  openRunDrive();
}

function stopRun() {
  run.armed = false;
  run.launched = false;
  // keep GPS watch for live speed on idle card
  try { run.wake?.release?.(); } catch (_) {}
  if (!lapRun.active) void keepAwake(false);
  setRunText('runStatus', 'Готово. Можно снова Старт');
  setRunText('runDriveMsg', 'замер записан · закрой или новый Старт');
}

function needLogin(msg) {
  if (currentUser()) return false;
  const el = document.getElementById('authMsg');
  if (el) el.textContent = msg || 'Чтобы писать в топ, войди или зарегистрируйся';
  goToView('account', { sfx: false });
  return true;
}

async function publishGps(v0100, v100200, v200300) {
  if (needLogin('GPS-замер сохранён на устройстве. В топ — после входа.')) {
    const rec0 = state.meas[state.carId] || {};
    if (v0100 != null) rec0.v0100 = Number(v0100.toFixed(2));
    if (v100200 != null) rec0.v100200 = Number(v100200.toFixed(2));
    if (v200300 != null) rec0.v200300 = Number(v200300.toFixed(2));
    state.meas[state.carId] = rec0;
    try {
      const gq0 = gpsQualityFromStraightRun();
      foldPassportGps({
        v0100: v0100 != null ? Number(v0100.toFixed(2)) : null,
        v100200: v100200 != null ? Number(v100200.toFixed(2)) : null,
        v200300: v200300 != null ? Number(v200300.toFixed(2)) : null,
      }, gq0.gpsQ);
    } catch (_) {}
    save();
    applyCarUI();
    if (v0100 != null) {
      pushSlip();
      const gq = gpsQualityFromStraightRun();
      const flags0 = (run.flags || []).slice(0, 8);
      openShareCard(buildSharePayload({
        type: '0-100',
        time: Number(rec0.v0100).toFixed(2) + ' с',
        valid: runRowValid(gq, flags0),
        car: currentCar().name,
        gpsQ: gq.gpsQ,
        avgAcc: gq.avgAcc,
        hz: gq.hz,
        paint: getStoredPaintHex() || undefined,
      }));
    }
    return;
  }
  const rec = state.meas[state.carId] || {};
  if (v0100 != null) rec.v0100 = Number(v0100.toFixed(2));
  if (v100200 != null) rec.v100200 = Number(v100200.toFixed(2));
  if (v200300 != null) rec.v200300 = Number(v200300.toFixed(2));
  state.meas[state.carId] = rec;
  try {
    const gqFold = gpsQualityFromStraightRun();
    foldPassportGps({
      v0100: v0100 != null ? Number(v0100.toFixed(2)) : null,
      v100200: v100200 != null ? Number(v100200.toFixed(2)) : null,
      v200300: v200300 != null ? Number(v200300.toFixed(2)) : null,
    }, gqFold.gpsQ);
  } catch (_) {}
  save();
  const who = (profile()?.nick) || currentUser()?.nick || 'пилот';
  if (v0100 != null) {
    const gq = gpsQualityFromStraightRun();
    const flags = (run.flags || []).slice(0, 8);
    const valid = runRowValid(gq, flags);
    if (valid && canPublishTop(gq, flags)) {
      await api.addStraight(currentCar().id, {
        name: String(who).slice(-6),
        car: currentCar().name,
        t: rec.v0100,
        gps: true,
        valid,
        gpsQ: gq.gpsQ,
        avgAcc: gq.avgAcc,
        hz: gq.hz,
        flags,
      });
    } else if (!valid) {
      console.info('0-100 not published to tops', gq.gpsQ, flags);
    }
    pushSlip();
    const payload = buildSharePayload({
      type: '0-100',
      time: Number(rec.v0100).toFixed(2) + ' с',
      valid,
      car: currentCar().name,
      nick: String(who),
      gpsQ: gq.gpsQ,
      avgAcc: gq.avgAcc,
      hz: gq.hz,
      paint: getStoredPaintHex() || undefined,
    });
    openShareCard(payload);
  }
  applyCarUI();
}


/* -------- Lap drive: honest GPS gate + sectors -------- */
const lapDrive = {
  open: false,
  timerId: null,
  weatherAt: 0,
  weatherTimer: null,
  mapMode: 'overview',
};

const LAP_GATE_R = 48; // м — зона линии С/Ф вокруг TRACK_GEO
const LAP_MAX_JUMP_MS = 95; // м за один тик — выше = телепорт
const LAP_MAX_KMH = 340;
const LAP_MAX_ACC = 42; // м, хуже — точка слабая

function fmtLapClock(ms) {
  const sec = Math.max(0, ms) / 1000;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}


function fmtLapTime(ms) {
  const sec = Math.max(0, ms) / 1000;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

/* -------- Sector Battle (client personal bests / rainbow) -------- */
/** Cumulative sector marks → per-sector splits. Null if incomplete. */
function sectorSplits(lap) {
  const cum = lap && lap.sectors;
  if (!Array.isArray(cum) || cum.length < 2) return null;
  const c0 = cum[0];
  const c1 = cum[1];
  if (c0 == null || c1 == null || !Number.isFinite(c0) || !Number.isFinite(c1) || c1 <= c0 || c0 <= 0) return null;
  let c2 = cum[2];
  if (c2 == null || !Number.isFinite(c2) || c2 <= c1) {
    c2 = Number.isFinite(lap.ms) ? lap.ms : null;
  }
  if (c2 == null || c2 <= c1) return null;
  return [c0, c1 - c0, c2 - c1];
}

function lapIsAbQuality(lap) {
  const q = lap && lap.gpsQ;
  return q === 'A' || q === 'B';
}

/** Personal best sector splits on track. excludeAt skips one lap (current). Prefers A/B pool; falls back to any with sectors. */
function personalBestSectors(trackId, excludeAt) {
  const list = (state.laps && state.laps[trackId]) || [];
  const pools = [[], []]; // 0=A/B, 1=any
  for (const lap of list) {
    if (excludeAt != null && lap.at === excludeAt) continue;
    const sp = sectorSplits(lap);
    if (!sp) continue;
    pools[1].push(sp);
    if (lapIsAbQuality(lap) || (lap.valid !== false && lap.gpsQ == null)) pools[0].push(sp);
  }
  const use = pools[0].length ? pools[0] : pools[1];
  const bests = [null, null, null];
  for (const sp of use) {
    for (let i = 0; i < 3; i++) {
      if (bests[i] == null || sp[i] < bests[i]) bests[i] = sp[i];
    }
  }
  return bests;
}

/** Rainbow / theoretical optimal = sum of best sectors (incl. current lap). */
function optimalLapMs(trackId) {
  const bests = personalBestSectors(trackId, null);
  // include every sectored lap: recompute without exclude, A/B preferred inside personalBestSectors
  if (bests.some((x) => x == null)) {
    const list = (state.laps && state.laps[trackId]) || [];
    const any = [null, null, null];
    for (const lap of list) {
      const sp = sectorSplits(lap);
      if (!sp) continue;
      for (let i = 0; i < 3; i++) {
        if (any[i] == null || sp[i] < any[i]) any[i] = sp[i];
      }
    }
    if (any.some((x) => x == null)) return null;
    return any[0] + any[1] + any[2];
  }
  return bests[0] + bests[1] + bests[2];
}

function fmtSectorSplit(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const sec = Math.max(0, ms) / 1000;
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(2).padStart(5, '0');
    return `${m}:${s}`;
  }
  return sec.toFixed(2) + 'с';
}

function fmtSectorDelta(deltaMs) {
  if (deltaMs == null || !Number.isFinite(deltaMs)) return '';
  const sec = deltaMs / 1000;
  const abs = Math.abs(sec).toFixed(2);
  if (Math.abs(sec) < 0.005) return '±0.00';
  return (sec < 0 ? '−' : '+') + abs;
}

function buildSectorBattleHtml(trackId, lap, opts) {
  const o = opts || {};
  const splits = sectorSplits(lap);
  if (!splits) return '';
  const pb = personalBestSectors(trackId, o.excludeAt != null ? o.excludeAt : lap.at);
  const abOk = lapIsAbQuality(lap) || (lap.valid !== false && lap.gpsQ == null);
  const opt = optimalLapMs(trackId);
  const rows = splits.map((ms, i) => {
    const best = pb[i];
    let delta = null;
    let cls = 'sb-even';
    let mark = '';
    if (best != null && Number.isFinite(best)) {
      delta = ms - best;
      if (Math.abs(delta) < 8) { cls = 'sb-match'; mark = '='; }
      else if (delta < 0) { cls = abOk ? 'sb-win' : 'sb-win-muted'; mark = '▼'; }
      else { cls = abOk ? 'sb-lose' : 'sb-lose-muted'; mark = '▲'; }
    } else {
      cls = 'sb-new';
      mark = 'PB';
    }
    const bestTxt = best != null ? fmtSectorSplit(best) : '—';
    const dTxt = delta != null ? fmtSectorDelta(delta) : (best == null ? 'новый' : '');
    return `<li class="sb-row ${cls}"><span class="sb-lab">S${i + 1}</span>`
      + `<span class="sb-time">${fmtSectorSplit(ms)}</span>`
      + `<span class="sb-best">лучш. ${bestTxt}</span>`
      + `<span class="sb-delta">${mark} ${dTxt}</span></li>`;
  }).join('');
  const optLine = opt != null
    ? `<p class="sb-opt">оптимал <strong>${fmtLapTime(opt)}</strong><em>сумма лучших секторов</em></p>`
    : '';
  const title = o.title || 'Sector Battle';
  const note = abOk ? '' : '<p class="sb-note">дельта без «победы» — нужен GPS A/B</p>';
  // v80: trackId comes from share payloads (#r= / ?s=) → escape (was an attribute-injection XSS)
  return `<div class="sector-battle" data-track="${esc(trackId)}">`
    + `<p class="sb-title">${esc(title)}</p>`
    + `<ul class="sb-list">${rows}</ul>`
    + optLine + note
    + `</div>`;
}

function renderSectorBattlePanel() {
  const host = document.getElementById('sectorBattlePanel');
  if (!host) return;
  const trackId = document.getElementById('trackSelect')?.value || currentCar()?.lap?.track;
  if (!trackId) { host.innerHTML = ''; host.hidden = true; return; }
  const list = ((state.laps && state.laps[trackId]) || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const withSec = list.filter((l) => sectorSplits(l));
  if (withSec.length < 1) {
    host.innerHTML = '<p class="muted tiny">Sector Battle — проедьте 2+ круга с секторами на этой трассе</p>';
    host.hidden = false;
    return;
  }
  const latest = withSec[0];
  const nSec = withSec.length;
  host.innerHTML = buildSectorBattleHtml(trackId, latest, {
    title: nSec >= 2 ? 'Sector Battle · последний vs лучшие' : 'Sector Battle · первый круг с секторами',
    excludeAt: latest.at,
  });
  host.hidden = false;
}


/* -------- Public sector tops (photo | nick | time) -------- */
// _sectorTopIdx declared near the top of the file (avoids TDZ when renderTops runs early)

function nickInitials(name) {
  const s = String(name || 'пилот').trim();
  if (!s) return 'П';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function topsAvatarHtml(name, avatar) {
  // v80: remote avatars only from Telegram CDN (arbitrary https = tracking pixel on every tops view)
  const ok = typeof avatar === 'string' && (
    /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(avatar) ||
    /^https:\/\/([\w-]+\.)*(telegram\.org|t\.me|telesco\.pe)\/[^"'<>\s]*$/i.test(avatar)
  );
  if (ok) {
    return `<span class="tops-av"><img src="${esc(avatar)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="tops-av tops-av-ini" aria-hidden="true">${esc(nickInitials(name))}</span>`;
}

function topsPilotRowHtml({ rank, name, avatar, sub, timeHtml }) {
  const nick = esc(name || 'пилот');
  const subHtml = sub ? `<span class="tp-sub">${esc(sub)}</span>` : '';
  return `<li>`
    + `<span class="tp-rank">${rank}</span>`
    + topsAvatarHtml(name, avatar)
    + `<span class="tp-who"><span class="tp-nick">${nick}</span>${subHtml}</span>`
    + `<strong class="tp-time">${timeHtml}</strong>`
    + `</li>`;
}

/** Shrink profile avatar for tops payload (≤~12KB jpeg). */
function avatarThumbForTops() {
  return new Promise((resolve) => {
    try {
      const raw = profile()?.avatar;
      if (!raw || typeof raw !== 'string') { resolve(null); return; }
      if (/^https:\/\//i.test(raw) && raw.length <= 500) { resolve(raw); return; }
      if (!/^data:image\//i.test(raw)) { resolve(null); return; }
      if (raw.length <= 12000) { resolve(raw); return; }
      const im = new Image();
      im.onload = () => {
        try {
          const size = 72;
          const c = document.createElement('canvas');
          c.width = size; c.height = size;
          const ctx = c.getContext('2d');
          const side = Math.min(im.width, im.height);
          const sx = (im.width - side) / 2;
          const sy = (im.height - side) / 2;
          ctx.drawImage(im, sx, sy, side, side, 0, 0, size, size);
          let q = 0.72;
          let out = c.toDataURL('image/jpeg', q);
          while (out.length > 12000 && q > 0.4) {
            q -= 0.1;
            out = c.toDataURL('image/jpeg', q);
          }
          resolve(out.length <= 16000 ? out : null);
        } catch (_) { resolve(null); }
      };
      im.onerror = () => resolve(null);
      im.src = raw;
    } catch (_) { resolve(null); }
  });
}

function syncSectorTopTrackSelect() {
  const sel = document.getElementById('sectorTopTrackSelect');
  if (!sel) return;
  const cur = sel.value || document.getElementById('topTrackSelect')?.value || state.trackId || currentCar()?.lap?.track;
  sel.innerHTML = TRACKS.map((tr) => `<option value="${esc(tr.id)}"${tr.id === cur ? ' selected' : ''}>${esc(tr.name)}</option>`).join('');
  if (cur) sel.value = cur;
}

async function renderSectorTops() {
  const listEl = document.getElementById('topSector');
  const hint = document.getElementById('sectorTopsHint');
  if (!listEl) return;
  syncSectorTopTrackSelect();
  const trackId = document.getElementById('sectorTopTrackSelect')?.value
    || document.getElementById('topTrackSelect')?.value
    || state.trackId
    || currentCar()?.lap?.track;
  if (!trackId) {
    listEl.innerHTML = '';
    if (hint) hint.textContent = 'Выберите трассу';
    return;
  }
  const sector = Math.max(0, Math.min(2, _sectorTopIdx | 0));
  document.querySelectorAll('#sectorTopChips .sec-chip').forEach((b) => {
    b.classList.toggle('on', Number(b.dataset.sector) === sector);
  });
  let rows = [];
  try {
    const res = await api.listSector(trackId, sector);
    if (res && Array.isArray(res.rows)) rows = res.rows;
    else if (res && Array.isArray(res.sectors) && res.sectors[sector]) rows = res.sectors[sector];
  } catch (_) { rows = []; }
  if (!rows.length) {
    listEl.innerHTML = '';
    if (hint) hint.textContent = 'Пока пусто — проедьте валидный круг A/B с секторами';
    return;
  }
  if (hint) {
    const tr = TRACKS.find((t) => t.id === trackId);
    hint.textContent = `${tr?.name || trackId} · S${sector + 1} · только GPS A/B`;
  }
  listEl.innerHTML = rows.map((r, i) => topsPilotRowHtml({
    rank: i + 1,
    name: r.name,
    avatar: r.avatar,
    sub: r.car || (r.gpsQ ? ('GPS ' + r.gpsQ) : ''),
    timeHtml: esc(String(r.t || fmtSectorSplit(r.ms))),
  })).join('');
}

function openSectorTops(opts = {}) {
  goToView('tops');
  if (opts.trackId) {
    const a = document.getElementById('sectorTopTrackSelect');
    const b = document.getElementById('topTrackSelect');
    if (a) a.value = opts.trackId;
    if (b) b.value = opts.trackId;
    state.trackId = opts.trackId;
  }
  if (opts.sector != null) _sectorTopIdx = Math.max(0, Math.min(2, Number(opts.sector) | 0));
  setTimeout(() => {
    document.getElementById('sectorTopsCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void renderSectorTops();
  }, 80);
}




function bearingDeg(a, b) {
  const φ1 = a.lat * Math.PI / 180;
  const φ2 = b.lat * Math.PI / 180;
  const Δλ = (b.lon - a.lon) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angDiff(a, b) {
  let d = ((b - a + 540) % 360) - 180;
  return d;
}

function trackLenM(trackId) {
  const tr = TRACKS.find((t) => t.id === trackId);
  const km = parseFloat(tr?.km);
  return Number.isFinite(km) && km > 0 ? km * 1000 : 3500;
}

function setLapMsg(text) {
  const a = document.getElementById('lapGpsMsg');
  const b = document.getElementById('lapDriveMsg');
  if (a) a.textContent = text;
  if (b) b.textContent = text;
}

function setLapHud(part, text) {
  const el = document.getElementById(part);
  if (el) el.textContent = text;
}


function setLapMapMode(mode) {
  lapDrive.mapMode = mode === 'nav' ? 'nav' : 'overview';
  const root = document.getElementById('lapDrive');
  root?.classList.toggle('mode-nav', lapDrive.mapMode === 'nav');
  root?.classList.toggle('mode-overview', lapDrive.mapMode === 'overview');
  document.getElementById('btnMapOverview')?.classList.toggle('on', lapDrive.mapMode === 'overview');
  document.getElementById('btnMapNav')?.classList.toggle('on', lapDrive.mapMode === 'nav');
  try {
    if (isLapSatMapActive()) setLapSatMapMode(lapDrive.mapMode);
  } catch (_) {}
  updateLapCarOnMap();
}

function lapProgress01() {
  if (!lapRun.active || !lapRun.trackId) return 0;
  const need = trackLenM(lapRun.trackId);
  if (lapRun.phase === 'armed') return 0;
  return Math.max(0, Math.min(0.999, (lapRun.dist || 0) / Math.max(1, need)));
}

const lapMapSmooth = {
  trackId: null,
  prog: 0,
  ang: 0,
  x: 0,
  y: 0,
  camX: 0,
  camY: 0,
  camRot: 0,
  camScale: 1,
  targetProg: 0,
  has: false,
  raf: 0,
};

function resetLapMapSmooth(trackId) {
  lapMapSmooth.trackId = trackId || null;
  lapMapSmooth.has = false;
  lapMapSmooth.prog = 0;
  lapMapSmooth.targetProg = 0;
  lapMapSmooth.ang = 0;
  lapMapSmooth.camRot = 0;
  lapMapSmooth.camScale = 1;
  lapMapSmooth.camX = 0;
  lapMapSmooth.camY = 0;
  if (lapMapSmooth.raf) {
    try { cancelAnimationFrame(lapMapSmooth.raf); } catch (_) {}
    lapMapSmooth.raf = 0;
  }
}

function lerpAngDeg(a, b, t) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

function updateLapCarOnMap() {
  // Satellite map drives the live car from real GPS — skip abstract SVG strip.
  if (isLapSatMapActive()) return;
  const trackId = lapRun.trackId || document.getElementById('trackSelect')?.value || TRACKS[0].id;
  if (lapMapSmooth.trackId && lapMapSmooth.trackId !== trackId) resetLapMapSmooth(trackId);
  lapMapSmooth.trackId = trackId;
  lapMapSmooth.targetProg = lapProgress01();
  if (!lapMapSmooth.raf) lapMapSmooth.raf = requestAnimationFrame(tickLapMapSmooth);
}

function tickLapMapSmooth(now) {
  lapMapSmooth.raf = 0;
  const trackId = lapMapSmooth.trackId || lapRun.trackId || document.getElementById('trackSelect')?.value || TRACKS[0].id;
  const d = TRACK_SVG[trackId] || TRACK_SVG.sochi;
  let target = Math.max(0, Math.min(0.999, lapMapSmooth.targetProg || 0));
  if (!lapMapSmooth.has) {
    lapMapSmooth.prog = target;
    const p0 = pointOnTrack(d, lapMapSmooth.prog);
    lapMapSmooth.x = p0.x;
    lapMapSmooth.y = p0.y;
    lapMapSmooth.ang = p0.ang + 90;
    lapMapSmooth.camX = p0.x;
    lapMapSmooth.camY = p0.y;
    lapMapSmooth.camRot = -(p0.ang + 90);
    lapMapSmooth.camScale = lapDrive.mapMode === 'nav' ? 2.1 : 1;
    lapMapSmooth.has = true;
  } else {
    // shortest-path progress on a closed lap
    let diff = target - lapMapSmooth.prog;
    if (diff > 0.5) diff -= 1;
    if (diff < -0.5) diff += 1;
    const k = 0.16;
    lapMapSmooth.prog = (lapMapSmooth.prog + diff * k + 1) % 1;
    const p = pointOnTrack(d, lapMapSmooth.prog);
    lapMapSmooth.x += (p.x - lapMapSmooth.x) * 0.22;
    lapMapSmooth.y += (p.y - lapMapSmooth.y) * 0.22;
    lapMapSmooth.ang = lerpAngDeg(lapMapSmooth.ang, p.ang + 90, 0.22);
    const wantNav = lapDrive.mapMode === 'nav';
    const wantScale = wantNav ? 2.1 : 1;
    const wantRot = wantNav ? -(p.ang + 90) : 0;
    const wantCx = wantNav ? p.x : 150;
    const wantCy = wantNav ? p.y : 105;
    // when leaving nav, ease toward identity framing
    if (!wantNav) {
      lapMapSmooth.camX += (lapMapSmooth.x - lapMapSmooth.camX) * 0.12;
      lapMapSmooth.camY += (lapMapSmooth.y - lapMapSmooth.camY) * 0.12;
    } else {
      lapMapSmooth.camX += (wantCx - lapMapSmooth.camX) * 0.18;
      lapMapSmooth.camY += (wantCy - lapMapSmooth.camY) * 0.18;
    }
    lapMapSmooth.camRot = lerpAngDeg(lapMapSmooth.camRot, wantRot, 0.18);
    lapMapSmooth.camScale += (wantScale - lapMapSmooth.camScale) * 0.14;
  }
  const mark = document.getElementById('lapCarMark');
  const svg = document.getElementById('lapTrackSvg');
  if (mark) {
    mark.setAttribute('transform', 'translate(' + lapMapSmooth.x.toFixed(2) + ',' + lapMapSmooth.y.toFixed(2) + ') rotate(' + lapMapSmooth.ang.toFixed(2) + ')');
  }
  const scene = svg && svg.querySelector('.track-scene');
  if (scene) {
    if (lapDrive.mapMode === 'nav' || Math.abs(lapMapSmooth.camScale - 1) > 0.02) {
      const cx = 150, cy = 120;
      scene.setAttribute('transform',
        'translate(' + cx + ',' + cy + ') scale(' + lapMapSmooth.camScale.toFixed(3) + ') rotate(' + lapMapSmooth.camRot.toFixed(2) + ') translate(' + (-lapMapSmooth.camX).toFixed(2) + ',' + (-lapMapSmooth.camY).toFixed(2) + ')');
    } else {
      scene.setAttribute('transform', '');
    }
  }
  // keep ticking while live HUD open or still converging
  const moving = Math.abs(((lapMapSmooth.targetProg - lapMapSmooth.prog + 1.5) % 1) - 0.5) > 0.001
    || Math.abs(lapMapSmooth.camScale - (lapDrive.mapMode === 'nav' ? 2.1 : 1)) > 0.01;
  if (lapDrive.open || moving) {
    lapMapSmooth.raf = requestAnimationFrame(tickLapMapSmooth);
  }
}


function openLapDrivePreview() {
  const trackId = document.getElementById('trackSelect')?.value || TRACKS[0].id;
  if (!TRACK_GEO[trackId]) {
    setLapMsg('у трассы нет координат С/Ф');
    return;
  }
  lapRun.trackId = trackId;
  if (!lapRun.active) {
    lapRun.phase = 'idle';
  }
  openLapDrive();
  startWatch();
  const orb = document.getElementById('btnLapArmedStart');
  orb?.classList.remove('on');
  document.getElementById('lapDrive')?.classList.remove('armed');
  setLapMsg('жми Старт у линии С/Ф');
  void fetchLapWeather(trackId, true);
  if (lapDrive.weatherTimer) clearInterval(lapDrive.weatherTimer);
  lapDrive.weatherTimer = setInterval(() => {
    if (lapDrive.open) void fetchLapWeather(lapRun.trackId || trackId, true);
  }, 60 * 1000);
}

function openLapDrive() {
  const el = document.getElementById('lapDrive');
  if (!el) return;
  const trackId = lapRun.trackId || document.getElementById('trackSelect')?.value || TRACKS[0].id;
  const track = TRACKS.find((t) => t.id === trackId) || TRACKS[0];
  document.getElementById('lapDriveTrack').textContent = track.name;
  try {
    const carEl = document.getElementById('lapDriveCar');
    if (carEl) carEl.textContent = currentCar().name;
  } catch (_) {}
  document.getElementById('lapDriveClock').textContent = '0:00.0';
  document.getElementById('lapDriveSpeed').textContent = '0';
  setLapHud('lapDriveDist', '0 м');
  setLapHud('lapDriveS1', 'S1 —');
  setLapHud('lapDriveS2', 'S2 —');
  setLapHud('lapDriveS3', 'S3 —');
  setLapHud('lapDriveSlip', 'слип ~—°');
  updateSessionHud();
  setLapMsg('GPS… подъезжайте к линии С/Ф');
  try { unmountLapSatMap(); } catch (_) {}
  {
    const geo = TRACK_GEO[trackId];
    const q = trackOutlineQuality(trackId);
    const sfLabel = geo?.rough ? 'С/Ф приблизителен' : (track.cult && geo ? 'проверен С/Ф' : '');
    const metaBits = [track.km && (track.km + ' км'), track.turns && (track.turns + ' пов.'), sfLabel].filter(Boolean);
    const qLab = q === 'full' ? 'спутник · линия трассы'
      : q === 'footprint' ? 'спутник · контур автодрома'
      : q === 'approx' ? 'спутник · схема'
      : 'спутник';
    const okSat = mountLapSatMap(trackId, document.getElementById('lapDriveMap'), {
      trackName: track.name,
      meta: metaBits.concat([qLab]).join(' · '),
      mode: lapDrive.mapMode || 'overview',
      svgFallback: (id) => drawTrack(id, 'lapDriveMap', { compact: true, live: true }),
    });
    if (!okSat) drawTrack(trackId, 'lapDriveMap', { compact: true, live: true });
  }
  setLapMapMode(lapDrive.mapMode || 'overview');
  updateLapCarOnMap();
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lap-drive-on');
  lapDrive.open = true;
  if (lapDrive.timerId) clearInterval(lapDrive.timerId);
  lapDrive.timerId = setInterval(() => {
    if (!lapRun.active || lapRun.phase !== 'running' || !lapRun.t0) return;
    document.getElementById('lapDriveClock').textContent = fmtLapClock(Date.now() - lapRun.t0);
  }, 100);
  void fetchLapWeather(trackId, true);
}

function closeLapDrive() {
  const el = document.getElementById('lapDrive');
  if (!el) return;
  try { unmountLapSatMap(); } catch (_) {}
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lap-drive-on');
  el.classList.remove('armed');
  lapDrive.open = false;
  if (lapDrive.timerId) { clearInterval(lapDrive.timerId); lapDrive.timerId = null; }
  if (lapDrive.weatherTimer) { clearInterval(lapDrive.weatherTimer); lapDrive.weatherTimer = null; }
}

async function fetchLapWeather(trackId, force) {
  const geo = TRACK_GEO[trackId];
  const box = document.getElementById('lapDriveWeather');
  if (!box) return;
  if (!geo) { box.textContent = 'погода: нет координат'; return; }
  // always refresh when force or older than 45s
  if (!force && Date.now() - (lapDrive.weatherAt || 0) < 45 * 1000 && box.dataset.ready) return;
  const prev = box.textContent;
  if (!box.dataset.ready) box.textContent = 'погода…';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto&wind_speed_unit=ms&_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    const cur = data.current || {};
    const t = cur.temperature_2m;
    const w = cur.wind_speed_10m;
    const code = cur.weather_code;
    const cat = weatherCategoryFromCode(code);
    lapDrive.weatherCode = code;
    lapDrive.weather = cat;
    const wxLab = weatherLabelRu(cat);
    box.textContent = (t != null ? `${Math.round(t)}°C` : '—')
      + (w != null ? ` · ветер ${Math.round(w)} м/с` : '')
      + (wxLab ? ` · ${wxLab.toLowerCase()}` : '');
    box.dataset.ready = '1';
    if (cat) box.dataset.weather = cat;
    lapDrive.weatherAt = Date.now();
  } catch (_) {
    if (!box.dataset.ready) box.textContent = 'погода недоступна';
    else box.textContent = prev;
  }
}

/** active lap session (track-day: flying laps) */
const lapRun = {
  active: false,
  phase: 'idle', // idle | armed | running
  trackId: null,
  t0: null,
  dist: 0,
  last: null,
  leftGate: false,
  flags: [],
  bad: 0,
  samples: 0,
  accSum: 0,
  accN: 0,
  sectorMs: [null, null, null],
  sectorHit: [false, false, false],
  slipPeak: 0,
  slipSum: 0,
  slipN: 0,
};

const lapSession = {
  on: false,
  trackId: null,
  startedAt: 0,
  laps: [], // recorded this outing
  bestMs: null,
  bestValid: false,
};

function updateSessionHud() {
  const n = lapSession.laps.length;
  setLapHud('lapDriveLapN', `круг ${n + 1}`);
  setLapHud('lapDriveLast', n ? `посл. ${fmtLapTime(lapSession.laps[n - 1].ms)}` : 'посл. —');
  if (lapSession.bestMs != null) {
    setLapHud('lapDriveBest', `лучший ${fmtLapTime(lapSession.bestMs)}`);
  } else {
    setLapHud('lapDriveBest', 'лучший —');
  }
}

function resetLapCounters() {
  lapRun.dist = 0;
  lapRun.leftGate = false;
  lapRun.flags = [];
  lapRun.bad = 0;
  lapRun.samples = 0;
  lapRun.accSum = 0;
  lapRun.accN = 0;
  lapRun.sectorMs = [null, null, null];
  lapRun.sectorHit = [false, false, false];
  lapRun.slipPeak = 0;
  lapRun.slipSum = 0;
  lapRun.slipN = 0;
  setLapHud('lapDriveDist', '0 м');
  setLapHud('lapDriveS1', 'S1 —');
  setLapHud('lapDriveS2', 'S2 —');
  setLapHud('lapDriveS3', 'S3 —');
  setLapHud('lapDriveSlip', 'слип ~—°');
}

function resetLapRunSoft() {
  lapRun.phase = 'idle';
  lapRun.t0 = null;
  lapRun.last = null;
  resetLapCounters();
}

function armLapRun() {
  resetSpeedFilter();
  void GpsFusion.enableImu().then((ok) => {
    if (!ok) setLapMsg('IMU недоступен (iOS: движение) — круг на GPS-fusion');
  });

  hap([18, 40, 18]);
  startWatch();
  void keepAwake(true); // re-acquire each arm (the watch may already be running from a previous run)
  const trackId = document.getElementById('trackSelect')?.value || lapRun.trackId || TRACKS[0].id;
  if (!TRACK_GEO[trackId]) {
    setLapMsg('у трассы нет координат С/Ф');
    return;
  }
  resetLapRunSoft();
  lapRun.active = true;
  lapRun.phase = 'armed';
  lapRun.trackId = trackId;
  lapSession.on = true;
  lapSession.trackId = trackId;
  lapSession.startedAt = Date.now();
  lapSession.laps = [];
  lapSession.bestMs = null;
  lapSession.bestValid = false;
  if (!lapDrive.open) openLapDrive();
  updateSessionHud();
  document.getElementById('lapDrive')?.classList.add('armed');
  document.getElementById('btnLapArmedStart')?.classList.add('on');
  setLapMsg('track-day: пересеките С/Ф — старт сессии');
  void fetchLapWeather(trackId, true);
}

function endLapSession(reason) {
  const n = lapSession.laps.length;
  const best = lapSession.bestMs != null ? fmtLapTime(lapSession.bestMs) : '—';
  const validN = lapSession.laps.filter((l) => l.valid).length;
  if (n) {
    state.trackDays = state.trackDays || [];
    state.trackDays.unshift({
      trackId: lapSession.trackId,
      at: lapSession.startedAt,
      n,
      validN,
      bestMs: lapSession.bestMs,
      laps: lapSession.laps.slice(),
    });
    state.trackDays = state.trackDays.slice(0, 30);
    save();
  }
  lapRun.active = false;
  resetLapRunSoft();
  lapSession.on = false;
  if (!run.armed) void keepAwake(false);
  const msg = n
    ? `сессия: ${n} круг.${validN ? ` чистых ${validN}` : ''} · лучший ${best}`
    : (reason || 'сессия пустая');
  setLapMsg(msg);
  applyCarUI();
  renderLaps();
  renderTrackDays();
  setTimeout(() => closeLapDrive(), n ? 2200 : 400);
}

function abortLapRun(reason) {
  endLapSession(reason || 'сессия сброшена');
}


/** Grade GPS honesty for tops / share: A честный, B ok, C weak. */
function gradeGpsQuality({ avgAcc, badRatio, flags, hz }) {
  const fl = flags || [];
  const hasTeleport = fl.includes('teleport');
  const hasSpeed = fl.includes('speed');
  const acc = avgAcc != null && Number.isFinite(avgAcc) ? avgAcc : null;
  const br = badRatio != null && Number.isFinite(badRatio) ? badRatio : null;
  let gpsQ = 'C';
  if (!hasTeleport && acc != null && acc <= 8 && (br == null || br < 0.08) && !hasSpeed && (hz == null || hz >= 1)) {
    gpsQ = 'A';
  } else if (!hasTeleport && acc != null && acc <= 15 && (br == null || br < 0.18)) {
    gpsQ = 'B';
  } else if (!hasTeleport && acc == null && (br == null || br < 0.12) && !hasSpeed) {
    gpsQ = 'B';
  }
  return {
    gpsQ,
    avgAcc: acc != null ? Math.round(acc * 10) / 10 : undefined,
    hz: hz != null && Number.isFinite(hz) ? Math.round(hz * 10) / 10 : undefined,
  };
}

function gpsQualityFromLapRun(ms) {
  const n = lapRun.samples || 0;
  const avgAcc = lapRun.accN ? (lapRun.accSum / lapRun.accN) : null;
  const badRatio = n ? (lapRun.bad || 0) / n : null;
  const hz = (ms > 0 && n > 1) ? (n / (ms / 1000)) : null;
  const g = gradeGpsQuality({ avgAcc, badRatio, flags: lapRun.flags, hz });
  const fq = GpsFusion.quality || lapRun.gpsQLive;
  if (fq === 'A' && (g.gpsQ === 'B' || g.gpsQ === 'C')) g.gpsQ = 'A';
  else if (fq === 'B' && g.gpsQ === 'C') g.gpsQ = 'B';
  return g;
}

function gpsQualityFromStraightRun() {
  const samples = run.samples || [];
  const n = run.accN || 0;
  const avgAcc = n ? (run.accSum / n) : null;
  let hz = null;
  if (samples.length >= 2) {
    const dt = (samples[samples.length - 1].t - samples[0].t) / 1000;
    if (dt > 0.2) hz = samples.length / dt;
  }
  const g = gradeGpsQuality({ avgAcc, badRatio: null, flags: run.flags || [], hz });
  // Prefer fused grade when filter reports healthier than raw-only path
  const fq = GpsFusion.quality || run.gpsQLive;
  if (fq === 'A' && (g.gpsQ === 'B' || g.gpsQ === 'C')) g.gpsQ = 'A';
  else if (fq === 'B' && g.gpsQ === 'C') g.gpsQ = 'B';
  return g;
}

function lapValidEnough(ms) {
  const need = trackLenM(lapRun.trackId) * 0.52;
  const minT = Math.max(35000, trackLenM(lapRun.trackId) / 55 * 1000);
  const maxT = trackLenM(lapRun.trackId) / 8 * 1000;
  if (lapRun.dist < need) return { ok: false, why: `мало дистанции (${Math.round(lapRun.dist)}/${Math.round(need)} м)` };
  if (ms < minT) return { ok: false, why: 'слишком быстро для длины трассы' };
  if (ms > maxT) return { ok: false, why: 'слишком долго — похоже на паузу' };
  if (lapRun.bad > Math.max(8, lapRun.samples * 0.18)) return { ok: false, why: 'много плохих GPS-точек' };
  if (lapRun.flags.includes('teleport')) return { ok: false, why: 'телепорт GPS' };
  return { ok: true, why: '' };
}

async function completeLapRun(how, atTs) {
  // how: 'gate' | 'manual' — gate continues session (flying), manual ends current as invalid and keeps session
  if (!lapRun.active || lapRun.phase !== 'running' || !lapRun.t0) return;
  const finishAt = atTs || Date.now();
  const ms = finishAt - lapRun.t0;
  const trackId = lapRun.trackId;
  const check = lapValidEnough(ms);
  const valid = how === 'gate' && check.ok;
  const tStr = fmtLapTime(ms);
  const slipAvg = lapRun.slipN ? lapRun.slipSum / lapRun.slipN : 0;
  const rec = {
    ms,
    at: finishAt,
    gps: true,
    valid,
    how,
    dist: Math.round(lapRun.dist),
    sectors: lapRun.sectorMs.slice(),
    slipAvg: Math.round(slipAvg * 10) / 10,
    slipPeak: Math.round(lapRun.slipPeak * 10) / 10,
    flags: lapRun.flags.slice(0, 8),
    session: true,
    why: valid ? '' : (how === 'manual' ? 'ручной финиш — круг не попадает в топ (нужен авто-финиш на С/Ф)' : check.why),
  };
  state.laps[trackId] = state.laps[trackId] || [];
  state.laps[trackId].push(rec);
  save();

  lapSession.laps.push(rec);
  if (valid && (lapSession.bestMs == null || ms < lapSession.bestMs)) {
    lapSession.bestMs = ms;
    lapSession.bestValid = true;
    tmaHaptic('success');
  }

  if (valid) {
    const who = (profile()?.nick) || currentUser()?.nick || 'пилот';
    const gq = gpsQualityFromLapRun(ms);
    rec.gpsQ = gq.gpsQ;
    rec.avgAcc = gq.avgAcc;
    rec.hz = gq.hz;
    const topOk = runRowValid(gq, rec.flags) && canPublishTop(gq, rec.flags);
    rec.valid = topOk;
    if (topOk) {
      const wx = lapDrive.weather || weatherCategoryFromCode(lapDrive.weatherCode);
      if (wx) rec.weather = wx;
      const avThumb = await avatarThumbForTops();
      await api.addLap(trackId, {
        name: String(who).slice(0, 24),
        car: currentCar().name,
        t: tStr,
        gps: true,
        valid: true,
        dist: rec.dist,
        slipAvg: rec.slipAvg,
        trackDay: true,
        gpsQ: gq.gpsQ,
        avgAcc: gq.avgAcc,
        hz: gq.hz,
        flags: rec.flags,
        weather: wx || undefined,
        sectors: Array.isArray(rec.sectors) ? rec.sectors.slice(0, 3) : undefined,
        ms: rec.ms,
        avatar: avThumb || undefined,
      });
      try { void pushCrewBestAfterLap(trackId, {
        t: typeof tStr !== 'undefined' ? tStr : undefined,
        gpsQ: gq?.gpsQ,
        car: currentCar()?.name,
        flags: rec?.flags,
        weather: typeof wx !== 'undefined' ? wx : undefined,
        avgAcc: gq?.avgAcc,
        hz: gq?.hz,
        dist: rec?.dist,
        slipAvg: rec?.slipAvg,
      }); } catch (_) {}
    }
    const tr = TRACKS.find((t) => t.id === trackId);
    const wxShare = rec.weather || lapDrive.weather || weatherCategoryFromCode(lapDrive.weatherCode);
    openShareCard(buildSharePayload({
      type: 'lap',
      time: tStr,
      trackName: tr?.name || trackId,
      valid: topOk,
      car: currentCar().name,
      nick: String(who),
      gpsQ: gq.gpsQ,
      avgAcc: gq.avgAcc,
      hz: gq.hz,
      weather: wxShare || undefined,
      paint: getStoredPaintHex() || undefined,
      trackId,
      sectors: rec.sectors,
      ms: rec.ms,
      at: rec.at,
    }));
  }

  updateSessionHud();
  applyCarUI();
  renderLaps();

  if (how === 'gate') {
    // flying finish = next lap start
    const n = lapSession.laps.length;
    const best = lapSession.bestMs != null ? fmtLapTime(lapSession.bestMs) : '—';
    setLapMsg(valid
      ? `круг ${n} ${tStr} ✓ · лучший ${best} · следующий`
      : (how === 'manual'
        ? `ручной финиш ${tStr} — не в топ (нужен авто-финиш на линии С/Ф)`
        : `круг ${n} ${tStr} ∅ ${rec.why} · следующий`));
    hap(valid ? [40, 30, 40] : [12, 40, 12]);
    lapRun.phase = 'running';
    lapRun.t0 = finishAt;
    resetLapCounters();
    // still in gate — must leave before next finish
    if (lapRun.last) lapRun.last.inGate = true;
    lapRun.leftGate = false;
    return;
  }

  // manual: drop this lap from competitive flow, keep session armed for next gate start
  setLapMsg(`круг сброшен вручную · жду С/Ф для круга ${lapSession.laps.length + 1}`);
  lapRun.phase = 'armed';
  lapRun.t0 = null;
  resetLapCounters();
  updateSessionHud();
}

function gateHysteresis(dGate, vKmh, wasInGate, trackId, pt) {
  // Soft corridor around TRACK_GEO S/F — bias cross detect, no hard SVG geo teleport
  let r = LAP_GATE_R;
  if (wasInGate) r *= 1.28;
  else if ((vKmh || 0) >= 50) r *= 1.1;
  // TRACK_POLY approx oval: if far off ring, tighten enter (don't invent map snap)
  const poly = trackId && TRACK_POLY[trackId];
  if (poly && pt && !wasInGate) {
    let min = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const d = haversineM(pt, poly[i]);
      if (d < min) min = d;
    }
    if (min > 240) r *= 0.88;
  }
  return dGate <= r;
}

function onLapGps(pos, vKmh) {
  if (!lapRun.active || lapRun.phase === 'idle') return;
  const c = pos.coords;
  const fus = GpsFusion.getState();
  const rawAcc = c.accuracy || 99;
  const acc = fus.accEst != null ? fus.accEst : rawAcc;
  const now = pos.timestamp || Date.now();
  // Prefer filtered lat/lon when healthy
  const useFus = fus.healthy && fus.lat != null && fus.lon != null;
  const pt = {
    lat: useFus ? fus.lat : c.latitude,
    lon: useFus ? fus.lon : c.longitude,
    t: now,
    v: vKmh,
    acc,
    fused: useFus,
  };
  const gate = TRACK_GEO[lapRun.trackId];
  if (!gate || pt.lat == null) return;

  lapRun.samples += 1;
  if (Number.isFinite(acc)) {
    lapRun.accSum = (lapRun.accSum || 0) + acc;
    lapRun.accN = (lapRun.accN || 0) + 1;
  }
  lapRun.gpsQLive = fus.quality;
  const dGate = haversineM(pt, gate);
  const wasIn = !!(lapRun.last && lapRun.last.inGate);
  const inGate = gateHysteresis(dGate, vKmh, wasIn, lapRun.trackId, pt);

  let reject = false;
  if (rawAcc > LAP_MAX_ACC && !useFus) {
    lapRun.bad += 1;
    if (!lapRun.flags.includes('acc')) lapRun.flags.push('acc');
    setLapHud('lapDriveWarn', `GPS ±${Math.round(rawAcc)} м`);
    reject = true;
  } else if (rawAcc > LAP_MAX_ACC && useFus) {
    setLapHud('lapDriveWarn', `сырой ±${Math.round(rawAcc)} · fusion ±${Math.round(acc)}`);
  } else {
    setLapHud('lapDriveWarn', '');
  }
  if (vKmh != null && vKmh > LAP_MAX_KMH) {
    lapRun.bad += 2;
    if (!lapRun.flags.includes('speed')) lapRun.flags.push('speed');
    reject = true;
  }
  if (lapRun.last) {
    const dt = Math.max(0.05, (now - lapRun.last.t) / 1000);
    const jump = haversineM(lapRun.last, pt);
    if (jump > LAP_MAX_JUMP_MS && jump / dt > 55) {
      lapRun.bad += 3;
      if (!lapRun.flags.includes('teleport')) lapRun.flags.push('teleport');
      reject = true;
    }
    if (!reject && jump < 120) {
      // Lap distance: blend ∫v dt + filtered haversine (cuts zigzag inflation)
      const stepV = ((vKmh || 0) / 3.6) * dt;
      const step = useFus ? (0.68 * stepV + 0.32 * jump) : jump;
      lapRun.dist += Math.max(0, step);
      if (jump > 2.5 && vKmh > 25) {
        const course = bearingDeg(lapRun.last, pt);
        let slip = null;
        const hdg = fus.heading != null ? fus.heading : c.heading;
        if (hdg != null && Number.isFinite(hdg)) {
          slip = Math.abs(angDiff(course, hdg));
        } else if (lapRun.last.course != null) {
          slip = Math.min(45, Math.abs(angDiff(lapRun.last.course, course)) / Math.max(0.2, dt) * 0.15);
        }
        pt.course = course;
        if (slip != null) {
          lapRun.slipPeak = Math.max(lapRun.slipPeak, slip);
          lapRun.slipSum += slip;
          lapRun.slipN += 1;
          setLapHud('lapDriveSlip', `слип ~${slip.toFixed(0)}° (оценка)`);
        }
      }
    }
  }

  document.getElementById('lapDriveSpeed').textContent = String(displayKmh());
  setLapHud('lapDriveDist', `${Math.round(lapRun.dist)} м`);
  if (lapDrive.open) {
    try {
      if (isLapSatMapActive()) {
        updateLapSatMapGps({
          lat: pt.lat,
          lon: pt.lon,
          course: pt.course != null ? pt.course : (fus.heading != null ? fus.heading : c.heading),
        });
      } else {
        updateLapCarOnMap();
      }
    } catch (_) {
      updateLapCarOnMap();
    }
  }

  if (lapRun.phase === 'running' && lapRun.t0) {
    const len = trackLenM(lapRun.trackId);
    const elapsed = now - lapRun.t0;
    const cuts = [len / 3, (2 * len) / 3, len];
    for (let i = 0; i < 3; i++) {
      if (!lapRun.sectorHit[i] && lapRun.dist >= cuts[i] * 0.92) {
        lapRun.sectorHit[i] = true;
        lapRun.sectorMs[i] = elapsed;
        const label = i === 0 ? 'lapDriveS1' : i === 1 ? 'lapDriveS2' : 'lapDriveS3';
        setLapHud(label, `S${i + 1} ${fmtLapClock(elapsed)}`);
      }
    }
  }

  if (reject) {
    lapRun.last = { ...pt, inGate };
    return;
  }

  const moved = (vKmh || 0) >= 12;

  if (lapRun.phase === 'armed') {
    if (moved && inGate && (!lapRun.last || !lapRun.last.inGate)) {
      lapRun.phase = 'running';
      lapRun.t0 = now;
      resetLapCounters();
      lapRun.leftGate = false;
      setLapMsg(`старт круга ${lapSession.laps.length + 1}!`);
      hap([30, 20, 30]);
    } else if (!inGate) {
      setLapMsg(`сессия · до С/Ф ~${Math.round(dGate)} м`);
    } else {
      setLapMsg('на зоне С/Ф — через линию на ходу');
    }
  } else if (lapRun.phase === 'running') {
    if (!inGate && dGate > LAP_GATE_R * 1.35) lapRun.leftGate = true;
    const need = trackLenM(lapRun.trackId) * 0.52;
    const minT = 25000;
    if (lapRun.leftGate && inGate && moved && (!lapRun.last || !lapRun.last.inGate)
        && lapRun.dist >= need * 0.85 && (now - lapRun.t0) >= minT) {
      void completeLapRun('gate', now);
      lapRun.last = { ...pt, inGate: true };
      return;
    }
    const left = Math.max(0, need - lapRun.dist);
    const n = lapSession.laps.length + 1;
    if (!lapRun.leftGate) setLapMsg(`круг ${n}: уйдите с С/Ф`);
    else setLapMsg(`круг ${n}: ещё ~${Math.round(left)} м`);
  }

  lapRun.last = { ...pt, inGate };
}

function renderLaps() {
  const trackId = document.getElementById('trackSelect')?.value || currentCar().lap.track;
  const ul = document.getElementById('lapList');
  if (!ul) return;
  const list = (state.laps[trackId] || []).slice().sort((a, b) => a.ms - b.ms);
  const full = canSeeFullHistory();
  const shown = full ? list : list.slice(0, 3);
  const wall = document.getElementById('lapListPaywall');
  if (wall) wall.classList.toggle('hidden', full || list.length <= 3);
  const pbAll = personalBestSectors(trackId, null);
  ul.innerHTML = shown.length
    ? shown.map((l, i) => {
        const tag = l.valid === false ? '∅' : (i === 0 ? 'PB' : '#' + (i + 1));
        const note = l.valid === false ? ` · ${l.why || 'не в топ'}` : '';
        const badge = l.gpsQ ? topsGpsBadge({ gps: true, valid: l.valid !== false, gpsQ: l.gpsQ, avgAcc: l.avgAcc, hz: l.hz, flags: l.flags, weather: l.weather }) : (l.gps ? '<em class="tops-gps tops-gps-unk">GPS</em>' : '');
        const sp = sectorSplits(l);
        let secHtml = '';
        if (sp) {
          const bits = sp.map((ms, si) => {
            const best = pbAll[si];
            let cls = 'sb-chip';
            if (best != null) {
              const d = ms - best;
              if (Math.abs(d) < 8) cls += ' sb-match';
              else if (d < 0) cls += ' sb-win';
              else cls += ' sb-lose';
            }
            return `<em class="${cls}">S${si + 1} ${fmtSectorSplit(ms)}</em>`;
          }).join(' ');
          secHtml = `<div class="sb-mini">${bits}</div>`;
        }
        return `<li><span>${tag}</span><strong class="tops-time">${formatMs(l.ms)}${badge}</strong><em class="tiny">${note}</em>${secHtml}</li>`;
      }).join('')
    : '<li><span>пока пусто</span><strong>—</strong></li>';
  try { renderSectorBattlePanel(); } catch (_) {}
  try { renderCompare(); } catch (_) {}
}

function renderTrackDays() {
  const el = document.getElementById('trackDayList');
  if (!el) return;
  const rows = state.trackDays || [];
  const full = canSeeFullHistory();
  const limit = full ? 12 : 3;
  const wall = document.getElementById('trackDayPaywall');
  if (wall) wall.classList.toggle('hidden', full || rows.length <= 3);
  el.innerHTML = rows.length
    ? rows.slice(0, limit).map((s) => {
        const tr = TRACKS.find((t) => t.id === s.trackId);
        const best = s.bestMs != null ? formatMs(s.bestMs) : '—';
        const when = new Date(s.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<li><span>${tr?.name || s.trackId} · ${s.n} кр.</span><strong>${best}</strong><em class="tiny">${when} · чистых ${s.validN || 0}</em></li>`;
      }).join('')
    : '<li><span>сессий пока нет</span><strong>—</strong></li>';
}

document.getElementById('btnLapStart')?.addEventListener('click', () => { openLapDrivePreview(); });
document.getElementById('btnLapArmedStart')?.addEventListener('click', () => { withSafety(armLapRun)(); });
document.getElementById('btnLapStop')?.addEventListener('click', () => {
  if (lapRun.active && lapRun.phase === 'running') {
    void completeLapRun('manual');
    setLapMsg('финиш вручную — не в топ');
  } else if (lapRun.active) {
    endLapSession('сессия завершена');
  } else {
    setLapMsg('круг не идёт');
  }
});
document.getElementById('btnMapOverview')?.addEventListener('click', () => { setLapMapMode('overview'); });
document.getElementById('btnMapNav')?.addEventListener('click', () => { setLapMapMode('nav'); });
document.getElementById('lapDriveFinish')?.addEventListener('click', () => {
  if (lapRun.active && lapRun.phase === 'running') void completeLapRun('manual');
  else if (lapRun.active) endLapSession('сессия завершена');
});
document.getElementById('lapDriveEnd')?.addEventListener('click', () => {
  if (lapRun.active) endLapSession('сессия завершена');
  closeLapDrive();
});
document.getElementById('lapDriveCancel')?.addEventListener('click', () => {
  closeLapDrive();
});



document.getElementById('btnGps')?.addEventListener('click', startWatch);
document.getElementById('btnArm')?.addEventListener('click', () => { withSafety(armRun)(); });
document.getElementById('btnStop')?.addEventListener('click', stopRun);
document.getElementById('runDriveStop')?.addEventListener('click', () => { stopRun(); closeRunDrive(); });
function pushSlip() {
  const rec = state.meas[state.carId] || {};
  state.slips = state.slips || [];
  state.slips.unshift({ car: currentCar().name, v0100: rec.v0100, v100200: rec.v100200, at: Date.now() });
  state.slips = state.slips.slice(0, 20);
  save();
  renderSlips();
}
function renderSlips() {
  const el = document.getElementById('runHistory');
  if (!el) return;
  el.innerHTML = (state.slips || []).map((s) => `<li>${s.car} · 0–100 ${s.v0100 ?? '—'} · 100–200 ${s.v100200 ?? '—'}</li>`).join('') || '<li>пусто</li>';
}
document.getElementById('btnShareRun')?.addEventListener('click', async () => {
  const rec = state.meas[state.carId] || {};
  const t0100 = rec.v0100 != null ? Number(rec.v0100).toFixed(2) + ' с' : (document.getElementById('run0100')?.textContent || '—');
  const payload = buildSharePayload({ type: '0-100', time: t0100, valid: true });
  openShareCard(payload);
});
document.getElementById('runDriveShare')?.addEventListener('click', () => {
  const rec = state.meas[state.carId] || {};
  if (rec.v0100 == null) return;
  openShareCard(buildSharePayload({ type: '0-100', time: Number(rec.v0100).toFixed(2) + ' с', valid: true, paint: getStoredPaintHex() || undefined }));
});
document.querySelectorAll('.btn-pro-soon, #btnProSoon').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    toastSoon();
  });
});
window.addEventListener('devicemotion', (e) => {
  GpsFusion.onDeviceMotion(e);
  const a = e.accelerationIncludingGravity || e.acceleration;
  if (!a) return;
  const g = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2) / 9.81;
  setRunText('liveG', g.toFixed(2));
  // coast between GPS fixes while measuring / lapping
  if (run.armed || lapRun.active) GpsFusion.tick(Date.now());
});
window.addEventListener('deviceorientation', (e) => {
  GpsFusion.onDeviceOrientation(e);
}, true);

document.getElementById('sectorTopTrackSelect')?.addEventListener('change', () => {
  const v = document.getElementById('sectorTopTrackSelect')?.value;
  if (v) {
    state.trackId = v;
    const topSel = document.getElementById('topTrackSelect');
    if (topSel) topSel.value = v;
    try { drawTrack(v, 'topTrackMap'); } catch (_) {}
  }
  void renderSectorTops();
  void renderTops();
});
document.getElementById('sectorTopChips')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-sector]');
  if (!b) return;
  _sectorTopIdx = Number(b.dataset.sector) | 0;
  void renderSectorTops();
});
document.getElementById('btnSectorTopsOpen')?.addEventListener('click', () => openSectorTops());
document.getElementById('btnSectorTopsFromBattle')?.addEventListener('click', () => {
  const trackId = document.getElementById('trackSelect')?.value || state.trackId;
  openSectorTops({ trackId });
});

document.getElementById('topValidOnly')?.addEventListener('change', () => { void renderTops(); });
document.getElementById('topModelFilter')?.addEventListener('change', () => { void renderTops(); });

if ('serviceWorker' in navigator) {
  // Not available in some WebViews (e.g. Telegram on iOS) — the app works without it.
  try { navigator.serviceWorker.register('./sw.js').catch((err) => console.info('[pitlane] SW not registered:', err?.message || err)); } catch (_) {}
}
renderSlips();


/* -------- Viral share card -------- */
const SHARE_ORIGIN = 'https://dsssssz.github.io/pitlane/';
let _sharePayload = null;

function b64urlEncode(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  try {
    let b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function buildSharePayload({ type, time, trackName, valid, car, nick, at, gpsQ, avgAcc, hz, weather, paint, trackId, sectors, ms }) {
  const u = currentUser();
  const c = currentCar();
  const payload = {
    brand: 'PITLANE',
    car: car || c?.name || '—',
    nick: nick || profile()?.nick || u?.nick || 'пилот',
    type: type || '0-100',
    track: trackName || '',
    time: time != null ? String(time) : '—',
    valid: (valid !== false) && gpsQ !== 'C',
    at: at || Date.now(),
    date: new Date(at || Date.now()).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
  };
  if (gpsQ === 'A' || gpsQ === 'B' || gpsQ === 'C') payload.gpsQ = gpsQ;
  if (avgAcc != null) payload.avgAcc = avgAcc;
  if (hz != null) payload.hz = hz;
  if (weather === 'dry' || weather === 'damp' || weather === 'wet') payload.weather = weather;
  const paintHex = paint || getStoredPaintHex();
  if (paintHex) payload.paint = paintHex;
  if (trackId) payload.trackId = trackId;
  if (Array.isArray(sectors)) payload.sectors = sectors.slice(0, 3);
  if (ms != null && Number.isFinite(ms)) payload.ms = ms;
  return payload;
}

function sharePublicUrl(payload, shareId) {
  if (shareId) return SHARE_ORIGIN + '?s=' + encodeURIComponent(shareId);
  return SHARE_ORIGIN + '#r=' + b64urlEncode(payload);
}

function openShareCard(payload) {
  _sharePayload = payload;
  try { rememberDuelCandidateFromShare(payload); } catch (_) {}
  const card = document.getElementById('shareCard');
  if (!card) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('shareCar', payload.car || '—');
  set('shareNick', payload.nick || '—');
  set('shareTime', payload.time || '—');
  set('shareDate', payload.date || '');

  const isLap = payload.type === 'lap' || payload.type === 'круг';
  const typeLabel = isLap ? 'круг' : '0–100';
  set('shareType', typeLabel);

  const trackRow = document.getElementById('shareTrackRow');
  const trackLab = document.getElementById('shareTrackLabel');
  if (trackRow && trackLab) {
    if (isLap && payload.track) {
      trackRow.hidden = false;
      trackLab.textContent = payload.track;
    } else {
      trackRow.hidden = true;
      trackLab.textContent = '';
    }
  }

  const wxEl = document.getElementById('shareWeather');
  if (wxEl) {
    const wl = weatherLabelRu(payload.weather);
    if (wl) {
      wxEl.textContent = wl;
      wxEl.classList.remove('hidden');
      wxEl.dataset.wx = payload.weather;
    } else {
      wxEl.textContent = '';
      wxEl.classList.add('hidden');
      delete wxEl.dataset.wx;
    }
  }

  const sw = document.getElementById('shareSwatch');
  if (sw) {
    // v80: only a hex colour (untrusted share payload; url(...) would leak viewers' IPs)
    if (typeof payload.paint === 'string' && /^#[0-9a-f]{3,8}$/i.test(payload.paint)) {
      sw.style.background = payload.paint;
      sw.classList.remove('hidden');
    } else {
      sw.classList.add('hidden');
      sw.style.background = '';
    }
  }

  const badge = document.getElementById('shareBadge');
  if (badge) {
    badge.classList.remove('invalid', 'gps-c', 'gps-a', 'gps-b');
    const q = payload.gpsQ;
    let mark = 'VALID';
    let honesty = '';
    if (payload.valid === false || q === 'C') {
      mark = q === 'C' ? 'НЕ В ТОП · Слабый GPS' : 'НЕ В ТОП';
      badge.classList.add('invalid');
      if (q === 'C') badge.classList.add('gps-c');
      honesty = 'Слабый GPS — результат не публикуется в топах';
    } else if (q === 'A') {
      mark = 'VALID · Честный';
      badge.classList.add('gps-a');
      honesty = 'Честный GPS';
    } else if (q === 'B') {
      mark = 'VALID · Ок';
      badge.classList.add('gps-b');
      honesty = 'Ок GPS';
    }
    const tipParts = [];
    if (payload.avgAcc != null) tipParts.push(`±${Math.round(Number(payload.avgAcc))} м`);
    if (payload.hz != null) tipParts.push(`${Number(payload.hz).toFixed(1)} Гц`);
    if (tipParts.length) honesty = (honesty ? honesty + ' · ' : '') + tipParts.join(' · ');
    badge.innerHTML = `<span>${mark}</span>`;
    badge.title = honesty || mark;
    const hon = document.getElementById('shareHonesty');
    if (hon) {
      if (honesty) { hon.hidden = false; hon.textContent = honesty; }
      else { hon.hidden = true; hon.textContent = ''; }
    }
  }

  const sb = document.getElementById('shareSectorBattle');
  if (sb) {
    if (isLap && payload.sectors && payload.trackId) {
      const lapLike = { sectors: payload.sectors, ms: payload.ms, at: payload.at, gpsQ: payload.gpsQ, valid: payload.valid };
      sb.innerHTML = buildSectorBattleHtml(payload.trackId, lapLike, {
        title: 'Sector Battle',
        excludeAt: payload.at,
      });
      sb.hidden = !sb.innerHTML;
    } else {
      sb.innerHTML = '';
      sb.hidden = true;
    }
  }

  card.classList.remove('hidden');
  card.setAttribute('aria-hidden', 'false');
}

function closeShareCard() {
  const card = document.getElementById('shareCard');
  if (!card) return;
  card.classList.add('hidden');
  card.setAttribute('aria-hidden', 'true');
}

function shareTextRu(p) {
  const isLap = p.type === 'lap' || p.type === 'круг';
  const typeLabel = isLap ? ('круг' + (p.track ? ' · ' + p.track : '')) : '0–100';
  const grade = gpsGradeLabel(p.gpsQ);
  const wx = weatherLabelRu(p.weather);
  const lines = [
    `PITLANE · ${p.car} · ${p.nick}`,
    `${typeLabel}: ${p.time}`,
  ];
  if (grade && grade !== 'GPS') lines.push(`GPS: ${grade}`);
  if (wx) lines.push(`Погода: ${wx}`);
  if (p.valid === false || p.gpsQ === 'C') lines.push('не в публичный топ');
  else lines.push('VALID');
  return lines.join('\n');
}

async function shareResult(payload) {
  const p = payload || _sharePayload;
  if (!p) return;
  let url = sharePublicUrl(p);
  try {
    const res = await api.createShare(p);
    if (res?.id) {
      url = sharePublicUrl(p, res.id);
      try {
        history.replaceState(null, '', location.pathname + location.search.split('#')[0] + '#s=' + res.id);
      } catch (_) {}
    }
  } catch (_) {}
  const title = 'PITLANE';
  const text = shareTextRu(p);
  if (isTMA) {
    const sid = (url.match(/[?&]s=([^&#]+)/) || [])[1];
    await shareViaTelegram(sid ? 's_' + decodeURIComponent(sid) : '', url, text);
    return;
  }
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text + '\n' + url);
    hap(20);
  } catch (_) {}
}

async function bootShareFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const hash = location.hash || '';
    let shareId = params.get('s') || '';
    let raw = params.get('r') || '';
    const hm = hash.match(/[#&?]([rs])=([^&]+)/);
    if (hm) {
      if (hm[1] === 's') shareId = decodeURIComponent(hm[2]);
      else raw = decodeURIComponent(hm[2]);
    }
    // also #s=id or #r=...
    if (!shareId && !raw && hash.startsWith('#s=')) shareId = decodeURIComponent(hash.slice(3));
    if (!shareId && !raw && hash.startsWith('#r=')) raw = decodeURIComponent(hash.slice(3));
    if (shareId) {
      const payload = await api.getShare(shareId);
      if (payload) {
        openShareCard(payload);
        return;
      }
    }
    if (raw) {
      const payload = b64urlDecode(raw);
      if (payload) openShareCard(payload);
    }
  } catch (err) {
    console.warn('bootShare', err);
  }
}

document.getElementById('shareCardClose')?.addEventListener('click', closeShareCard);
document.getElementById('shareCard')?.addEventListener('click', (e) => {
  if (e.target?.id === 'shareCard') closeShareCard();
});
document.getElementById('shareCardBtn')?.addEventListener('click', () => { void shareResult(_sharePayload); });
document.getElementById('shareCardCopy')?.addEventListener('click', async () => {
  if (!_sharePayload) return;
  const url = sharePublicUrl(_sharePayload);
  if (isTMA) { await shareViaTelegram('', url, shareTextRu(_sharePayload)); return; }
  try { await navigator.clipboard.writeText(url); hap(16); } catch (_) {}
});

/* -------- Monetization stub (trial gate) -------- */
function canSeeFullHistory() {
  // Pro paywall disabled — comparison/history free for now
  return true;
}

function toastSoon() {
  if (isTMA) return; // no pricing talk inside the Telegram Mini App
  hap(10);
  const el = document.getElementById('accPlan') || document.getElementById('pulseMsg');
  if (el) {
    const prev = el.textContent;
    el.textContent = 'пока бесплатно';
    setTimeout(() => { if (el.textContent === 'пока бесплатно') el.textContent = prev; }, 1800);
  }
}

function renderCompare() {
  const body = document.getElementById('compareBody');
  const wall = document.getElementById('comparePaywall');
  const stats = document.getElementById('compareStats');
  if (!body || !wall) return;
  if (!canSeeFullHistory()) {
    body.classList.add('hidden');
    wall.classList.remove('hidden');
    return;
  }
  body.classList.remove('hidden');
  wall.classList.add('hidden');
  const c = currentCar();
  const rec = state.meas[state.carId] || {};
  const trackId = document.getElementById('trackSelect')?.value || state.trackId;
  const best = bestLapDisplay(trackId);
  if (stats) {
    stats.innerHTML = `
      <div>0–100 сток <b>${fmt(c.v0100)}</b> · GPS <b>${fmt(rec.v0100)}</b></div>
      <div>100–200 сток <b>${fmt(c.v100200)}</b> · GPS <b>${fmt(rec.v100200)}</b></div>
      <div>круг сток <b>${c.lap?.time || '—'}</b> · ваш <b>${best}</b></div>`;
  }
}

/* -------- auth: SMS OTP + durable account store -------- */
const PRICE = { month: 390, year: 2990, monthOff: 195, yearOff: 1495 };
const AUTH_KEY = 'pitlane-auth-v2';
const AUTH_KEY_LEGACY = 'pitlane-auth-v1';
const IDB_NAME = 'pitlane-auth';
const IDB_STORE = 'kv';

function normPhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) return '7' + d.slice(1);
  if (d.length === 10) return '7' + d;
  return d;
}

function loadAuthSync() {
  try {
    let raw = localStorage.getItem(AUTH_KEY);
    if (!raw) raw = localStorage.getItem(AUTH_KEY_LEGACY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        parsed.users = parsed.users || {};
        parsed.otps = parsed.otps || {};
        return parsed;
      }
    }
  } catch (err) {
    console.warn('auth load', err);
  }
  try {
    const bak = JSON.parse(localStorage.getItem(AUTH_KEY + ':bak') || localStorage.getItem(AUTH_KEY_LEGACY + ':bak') || 'null');
    if (bak?.users) {
      bak.otps = bak.otps || {};
      return bak;
    }
  } catch (_) {}
  return { users: {}, otps: {}, session: null };
}

let authDb = loadAuthSync();

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('idb set', err);
  }
}

async function idbGet(key) {
  try {
    const db = await idbOpen();
    const val = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return val;
  } catch (_) {
    return null;
  }
}

function saveAuth() {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(authDb));
    localStorage.setItem(AUTH_KEY + ':bak', JSON.stringify(authDb));
    if (authDb.session) localStorage.setItem(AUTH_KEY + ':session', authDb.session);
    else localStorage.removeItem(AUTH_KEY + ':session');
    // also mirror legacy key so old code paths reading v1 still see session
    localStorage.setItem(AUTH_KEY_LEGACY, JSON.stringify(authDb));
    localStorage.setItem(AUTH_KEY_LEGACY + ':bak', JSON.stringify(authDb));
  } catch (err) {
    console.warn('auth save failed', err);
    const msg = document.getElementById('authMsg');
    if (msg) msg.textContent = 'Не удалось сохранить аккаунт на устройстве';
  }
  void idbSet('authDb', authDb);
}

async function restoreAuthIfNeeded() {
  const fromIdb = await idbGet('authDb');
  if (fromIdb?.users && Object.keys(fromIdb.users).length >= Object.keys(authDb.users || {}).length) {
    authDb = fromIdb;
    authDb.otps = authDb.otps || {};
  }
  if (!authDb.session) {
    const sid = localStorage.getItem(AUTH_KEY + ':session') || localStorage.getItem(AUTH_KEY_LEGACY + ':session');
    if (sid && authDb.users[sid]) authDb.session = sid;
  }
  saveAuth();
  refreshAccount();
}

function currentUser() {
  return authDb.session ? authDb.users[authDb.session] : null;
}

function isPro(u) {
  if (!u) return false;
  if (u.paidUntil && u.paidUntil > Date.now()) return true;
  if (u.trialEnds && u.trialEnds > Date.now()) return true;
  return false;
}

function refreshAccount() {
  const u = currentUser();
  document.getElementById('authForm')?.classList.toggle('hidden', !!u);
  const phones = document.querySelectorAll('#accPhone, #accPhoneStatus');
  const demoBan = document.getElementById('accDemoBanner');
  if (demoBan) demoBan.classList.toggle('hidden', !(authDb.demoSms && u));
  if (!u) {
    document.getElementById('btnDeleteAccount')?.classList.add('hidden');
    phones.forEach((el) => { el.textContent = 'гость'; });
    void refreshAuthProviders();
    if (demoBan) demoBan.classList.add('hidden');
    const plan = document.getElementById('accPlan');
    if (plan) plan.textContent = '';
    const trialEl = document.getElementById('accTrialLeft');
    if (trialEl) trialEl.textContent = '';
    try { renderCompare(); } catch (_) {}
    return;
  }
  phones.forEach((el) => { el.textContent = accountLabel(u); });
  document.getElementById('btnDeleteAccount')?.classList.toggle('hidden', !getSessionToken() || String(getSessionToken()).startsWith('local-'));
  const plan = document.getElementById('accPlan');
  if (plan) {
    plan.textContent = isTMA ? 'аккаунт сохранён' : ((isPro(u) ? ('Pro · ') : ('trial · ')) + 'аккаунт сохранён');
  }
  const trialEl = document.getElementById('accTrialLeft');
  if (trialEl) {
    if (u.paidUntil && u.paidUntil > Date.now()) {
      trialEl.textContent = 'Pro активен';
    } else if (u.trialEnds) {
      const days = Math.max(0, Math.ceil((u.trialEnds - Date.now()) / (24 * 60 * 60 * 1000)));
      trialEl.textContent = days > 0 ? (`осталось ${days} дн. триала`) : 'триал закончился';
    } else {
      trialEl.textContent = '';
    }
  }
  const setAcc = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setAcc('accDiscount', u.firstPaid ? 'уже использована' : '−50% на первую');
  setAcc('accPro', isPro(u) ? 'да' : 'нет');
  setAcc('priceMonth', (u.firstPaid ? PRICE.month : PRICE.monthOff) + ' ₽');
  setAcc('priceYear', (u.firstPaid ? PRICE.year : PRICE.yearOff) + ' ₽');
  const nickEl = document.getElementById('accNick');
  if (nickEl && u.nick) nickEl.value = u.nick;
  try { renderCompare(); } catch (_) {}
}

function genOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function requestSmsCode(phone) {
  const p = normPhone(phone);
  if (p.length !== 11 || !p.startsWith('7')) throw new Error('Введите номер в формате +7…');
  const code = genOtp();
  const exp = Date.now() + 10 * 60 * 1000;
  authDb.otps[p] = { code, exp, tries: 0 };
  saveAuth();

  // Try remote Worker if configured
  try {
    if (isRemoteApi()) {
      const res = await fetch(apiBase() + '/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error('Слишком много запросов кода — подождите ~15 мин');
      if (res.status === 503 || data?.error === 'SMS not configured') {
        throw new Error(data?.error === 'SMS send failed' ? 'Не удалось отправить SMS — попробуй позже' : 'SMS не настроен на сервере (нужен Twilio)');
      }
      if (res.ok) {
        authDb.demoSms = !!(data?.demo || data?.demoCode);
        if (data?.demoCode) {
          authDb.otps[p] = { code: String(data.demoCode), exp, tries: 0 };
        } else {
          // Real SMS: keep placeholder for try-counter UX but wipe local code
          authDb.otps[p] = { code: null, exp, tries: 0, remote: true };
        }
        saveAuth();
        if (data?.demoCode) return { phone: p, demoCode: String(data.demoCode), demo: true };
        return { phone: p, demoCode: null, demo: false };
      }
    }
  } catch (err) {
    if (err && err.message && !String(err.message).includes('fetch')) throw err;
  }

  // Offline / no Worker — local demo OTP
  authDb.demoSms = true;
  saveAuth();
  return { phone: p, demoCode: code, demo: true };
}

async function verifySmsCode(phone, code, nick) {
  const p = normPhone(phone);
  const otp = authDb.otps[p];
  const c = String(code || '').trim();
  if (!otp) throw new Error('Сначала запроси код');
  if (Date.now() > otp.exp) throw new Error('Код истёк — запроси новый');
  otp.tries = (otp.tries || 0) + 1;
  if (otp.tries > 8) throw new Error('Слишком много попыток');

  let ok = false;
  let remoteTried = false;
  let remoteData = null;
  // Prefer remote verify when Worker configured (issues real session token)
  try {
    if (isRemoteApi()) {
      remoteTried = true;
      const res = await fetch(apiBase() + '/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p, code: c, nick: (nick || '').trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || data?.error === 'too many attempts') {
        delete authDb.otps[p];
        saveAuth();
        throw new Error('Слишком много попыток — запроси новый код');
      }
      if (data?.error === 'expired') {
        delete authDb.otps[p];
        saveAuth();
        throw new Error('Код истёк — запроси новый');
      }
      if (res.ok && data?.ok) {
        ok = true;
        remoteData = data;
      }
    }
  } catch (err) {
    if (err && err.message && !String(err.message).includes('fetch')) throw err;
  }
  // Local OTP fallback only for offline/demo path (never override a failed remote verify)
  if (!ok && !remoteTried) ok = c === String(otp.code);
  else if (!ok && authDb.demoSms && otp?.code) ok = c === String(otp.code);

  if (!ok) {
    saveAuth();
    throw new Error('Неверный код');
  }
  delete authDb.otps[p];

  if (remoteData?.token && remoteData?.pilotId) {
    return completeLogin({
      pilotId: remoteData.pilotId,
      token: remoteData.token,
      user: remoteData.user,
      nick: (nick || '').trim() || remoteData.nick,
      provider: 'phone',
      phone: p,
    });
  }
  // Offline / local demo: device-only account keyed by phone (never sent to the server as an id)
  if (!getSessionToken()) {
    const localTok = 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    setSessionToken(localTok);
    authDb.token = localTok;
  }
  return completeLogin({ pilotId: null, localKey: p, nick: (nick || '').trim(), provider: 'phone', phone: p });
}

/** Human label for the account line: own phone (local only) / Telegram @username. */
function accountLabel(u) {
  if (!u) return 'гость';
  let who = 'аккаунт';
  if (u.phone) who = '+' + u.phone;
  else if (u.tgUsername) who = 'Telegram @' + u.tgUsername;
  else if (u.provider === 'telegram') who = 'Telegram';
  return who + (u.nick ? (' · ' + u.nick) : '');
}

/**
 * Store a successful login. Accounts are keyed by the opaque server id (p_<uuid>);
 * a legacy phone-keyed local record for the same phone is folded in.
 */
function completeLogin({ pilotId, localKey, token, user, nick, provider, phone, tgUsername, photoUrl }) {
  const key = pilotId || localKey;
  if (token) {
    setSessionToken(token);
    authDb.token = token;
  }
  if (pilotId && phone && authDb.users[phone] && !authDb.users[pilotId]) authDb.users[pilotId] = authDb.users[phone];
  if (pilotId && phone) delete authDb.users[phone];
  const existing = authDb.users[key];
  const n = (nick || '').trim() || user?.nick || existing?.nick || 'пилот';
  const base = existing || {
    createdAt: Date.now(),
    paidUntil: null,
    plan: 'trial',
    firstPaid: false,
    garage: state.garage || [],
    carId: state.carId || null,
  };
  const u = {
    ...base,
    pilotId: pilotId || null,
    provider: provider || base.provider || 'phone',
    phone: phone || (provider === 'telegram' ? null : base.phone) || null,
    tgUsername: tgUsername || user?.telegram?.username || (provider === 'telegram' ? base.tgUsername : null) || null,
    nick: n,
    lastLogin: Date.now(),
    trialEnds: user?.trialEnds || base.trialEnds || Date.now() + 7 * 24 * 60 * 60 * 1000,
    plan: user?.plan || base.plan || 'trial',
    paidUntil: user?.paidUntil ?? base.paidUntil ?? null,
  };
  if (Array.isArray(state.garage) && state.garage.length) {
    u.garage = state.garage;
    u.carId = state.carId || null;
  }
  authDb.users[key] = u;
  authDb.session = key;
  const prof = profile();
  const nextProf = { ...prof, nick: n };
  if (!prof.avatar && photoUrl && /^https:\/\//.test(photoUrl)) nextProf.avatar = photoUrl;
  saveProf(nextProf);
  try { loadProfUI(); } catch (_) {}
  if ((!state.garage || !state.garage.length) && Array.isArray(u.garage) && u.garage.length) {
    state.garage = u.garage;
    state.carId = u.carId || u.garage[0]?.id || null;
    save();
  }
  saveAuth();
  void mergeGarageOnLogin();
  return u;
}

/** Pre-v76 sessions were keyed by phone: ask the server for the opaque id and re-key locally. */
async function upgradeLegacySession() {
  try {
    const sid = String(authDb.session || '');
    const tok = getSessionToken();
    if (!sid || sid.startsWith('p_') || !tok || tok.startsWith('local-') || !isRemoteApi()) return;
    const me = await api.me();
    if (!me || !me.ok || !me.pilotId) return;
    const u = authDb.users[sid] || {};
    authDb.users[me.pilotId] = { ...u, pilotId: me.pilotId, nick: u.nick || me.nick, phone: u.phone || (/^\d{10,15}$/.test(sid) ? sid : null) };
    delete authDb.users[sid];
    authDb.session = me.pilotId;
    saveAuth();
    refreshAccount();
  } catch (_) {}
}

async function mergeGarageOnLogin() {
  if (!isRemoteApi() || !getSessionToken()) return;
  try {
    const remote = await api.getGarage();
    const remoteCars = Array.isArray(remote?.cars) ? remote.cars : [];
    if ((!state.garage || !state.garage.length) && remoteCars.length) {
      state.garage = remoteCars;
      state.carId = remote.carId || remoteCars[0]?.id || null;
      try { hydratePassportGpsFromGarage(); } catch (_) {}
      save();
      try { applyCarUI(); } catch (_) {}
    } else if (state.garage?.length) {
      try { hydratePassportGpsFromGarage(); } catch (_) {}
      await api.putGarage({ cars: state.garage, carId: state.carId || null });
    }
  } catch (err) {
    console.warn('garage merge', err);
  }
}

let _garageSyncTimer = null;
function scheduleGarageSync() {
  if (!currentUser() || !isRemoteApi() || !getSessionToken()) return;
  clearTimeout(_garageSyncTimer);
  _garageSyncTimer = setTimeout(() => {
    void api.putGarage({ cars: state.garage || [], carId: state.carId || null });
  }, 2500);
}

function showAuthStep(step) {
  document.getElementById('authStepPhone')?.classList.toggle('hidden', step !== 'phone');
  document.getElementById('authStepCode')?.classList.toggle('hidden', step !== 'code');
}

document.getElementById('btnSendSms')?.addEventListener('click', async () => {
  const phone = document.getElementById('authPhone')?.value;
  const nick = document.getElementById('authNick')?.value;
  const msg = document.getElementById('authMsg');
  try {
    const r = await requestSmsCode(phone);
    document.getElementById('authPhoneShow').textContent = '+' + r.phone;
    showAuthStep('code');
    if (r.demoCode) {
      msg.textContent = '';
      const m2 = document.getElementById('authMsg2');
      if (m2) m2.textContent = 'SMS-шлюз ещё не подключён — демо-код: ' + r.demoCode;
    } else {
      if (msg) msg.textContent = '';
      const m2 = document.getElementById('authMsg2');
      if (m2) m2.textContent = 'Код отправлен SMS';
    }
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
});

document.getElementById('btnVerifySms')?.addEventListener('click', async () => {
  const phone = document.getElementById('authPhone')?.value;
  const nick = document.getElementById('authNick')?.value;
  const code = document.getElementById('authCode')?.value;
  const m2 = document.getElementById('authMsg2');
  try {
    await verifySmsCode(phone, code, nick);
    if (m2) m2.textContent = '';
    showAuthStep('phone');
    refreshAccount();
    applyCarUI();
  } catch (err) {
    if (m2) m2.textContent = err.message;
  }
});

document.getElementById('btnSmsBack')?.addEventListener('click', () => {
  showAuthStep('phone');
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
  // persist garage onto account before logout
  const u = currentUser();
  if (u) {
    u.garage = state.garage || [];
    u.carId = state.carId || null;
  }
  // v80: revoke the token server-side too (fire-and-forget; must run before the token is cleared)
  try { void api.logout(); } catch (_) {}
  authDb.session = null;
  authDb.token = null;
  setSessionToken('');
  saveAuth();
  refreshAccount();
});
document.getElementById('btnGuest')?.addEventListener('click', () => {
  document.getElementById('auth')?.classList.add('hidden');
});
document.getElementById('btnOpenAuth')?.addEventListener('click', () => {
  document.getElementById('auth')?.classList.remove('hidden');
  showAuthStep('phone');
});

// persist garage into account on save hook
const _saveOrig = typeof save === 'function' ? save : null;
// monkey via wrap after - actually patch syncGarageToAccount calls

function syncGarageToAccount() {
  const u = currentUser();
  if (!u) return;
  u.garage = state.garage || [];
  u.carId = state.carId || null;
  const nickEl = document.getElementById('accNick');
  if (nickEl?.value?.trim()) {
    u.nick = nickEl.value.trim();
    saveProf({ ...profile(), nick: u.nick });
  }
  saveAuth();
}


document.querySelectorAll('[data-buy]').forEach((b) => {
  b.addEventListener('click', () => buyPlan(b.dataset.buy));
});

void restoreAuthIfNeeded().then(() => upgradeLegacySession());
refreshAccount();

/* -------- v76: login providers (Telegram / SMS), account deletion, safety notice -------- */

/**
 * Telegram login result. Redirect flow (robust in standalone PWAs: same window, no popup/postMessage):
 * oauth.telegram.org/auth?bot_id=…&origin=…&return_to=<app> → back to <app>#tgAuthResult=<base64 JSON>.
 * Also accepts the Login Widget data-auth-url style (?id=…&auth_date=…&hash=…).
 */
function captureTelegramReturn() {
  try {
    const hash = location.hash || '';
    const q = new URLSearchParams(location.search);
    let payload = null;
    let seen = false;
    const m = hash.match(/tgAuthResult=([^&]*)/);
    if (m) {
      seen = true;
      try {
        let b = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        const bin = atob(b);
        const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
        const obj = JSON.parse(new TextDecoder().decode(bytes));
        if (obj && typeof obj === 'object' && obj.hash) payload = obj;
      } catch (_) { payload = null; }
    } else if (q.get('hash') && q.get('id') && q.get('auth_date')) {
      seen = true;
      payload = {};
      const appParams = new Set(['view', 'skipIntro', 'duel', 'crew', 's', 'r', 'quality']);
      q.forEach((v, k) => { if (!appParams.has(k)) payload[k] = v; });
    }
    if (!seen) return null;
    history.replaceState(null, '', location.pathname + '?view=account&skipIntro=1');
    return { payload };
  } catch (_) {
    return null;
  }
}

function setAuthTopMsg(text) {
  const el = document.getElementById('authMsgTop');
  if (el) el.textContent = text || '';
}

async function refreshAuthProviders(force) {
  const tgBtn = document.getElementById('btnTgLogin');
  const smsBtn = document.getElementById('btnSmsToggle');
  const smsBox = document.getElementById('authSmsBox');
  const none = document.getElementById('authNone');
  if (!tgBtn || !smsBtn || !smsBox || !none) return;
  if (!isRemoteApi()) {
    // No Worker configured → legacy device-only demo login
    tgBtn.classList.add('hidden');
    smsBtn.classList.add('hidden');
    none.classList.add('hidden');
    smsBox.classList.remove('hidden');
    return;
  }
  if (force || _authCfg === undefined || Date.now() - _authCfgAt > 60000) {
    _authCfgAt = Date.now();
    _authCfg = await api.authConfig();
  }
  const cfg = _authCfg;
  if (!cfg) {
    tgBtn.classList.add('hidden');
    smsBtn.classList.add('hidden');
    smsBox.classList.add('hidden');
    none.textContent = 'Нет связи с сервером — вход сейчас недоступен. Замеры, гараж и история работают офлайн.';
    none.classList.remove('hidden');
    _authCfg = undefined; // retry next time
    return;
  }
  const tmaAvail = !!(isTMA && cfg.tma && tmaInitData);
  // In TMA the button only appears as a manual retry after a failed silent login.
  const tg = isTMA ? (tmaAvail && _tmaLogin === 'failed') : !!(cfg.telegram && cfg.telegramBotId);
  const sms = !!cfg.sms;
  tgBtn.classList.toggle('hidden', !tg);
  if (tg && sms) {
    smsBtn.classList.remove('hidden');
  } else if (sms) {
    smsBtn.classList.add('hidden');
    smsBox.classList.remove('hidden');
  } else {
    smsBtn.classList.add('hidden');
    smsBox.classList.add('hidden');
  }
  if (!tg && !sms && !tmaAvail) {
    none.textContent = 'Вход временно недоступен: сервер входа ещё не настроен. Замеры, гараж и история работают без аккаунта.';
    none.classList.remove('hidden');
  } else {
    none.classList.add('hidden');
  }
}

document.getElementById('btnSmsToggle')?.addEventListener('click', () => {
  const box = document.getElementById('authSmsBox');
  if (!box) return;
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    showAuthStep('phone');
    try { document.getElementById('authPhone')?.focus(); } catch (_) {}
  }
});

document.getElementById('btnTgLogin')?.addEventListener('click', () => {
  // Inside the Mini App: no oauth.telegram.org redirect (would leave our origin) — re-validate initData instead.
  if (isTMA) { void tmaAutoLogin(true); return; }
  const id = _authCfg && _authCfg.telegramBotId;
  if (!id) { void refreshAuthProviders(true); return; }
  const back = new URL(location.href);
  back.search = '?view=account&skipIntro=1';
  back.hash = '';
  const url = 'https://oauth.telegram.org/auth?bot_id=' + encodeURIComponent(id) +
    '&origin=' + encodeURIComponent(location.origin) +
    '&embed=0&request_access=write&return_to=' + encodeURIComponent(back.toString());
  setAuthTopMsg('Открываем Telegram…');
  location.href = url;
});

async function finishTelegramReturn() {
  if (!TG_RETURN) return;
  try { goToView('account', { sfx: false }); } catch (_) {}
  if (!TG_RETURN.payload) {
    setAuthTopMsg('Вход через Telegram отменён.');
    return;
  }
  setAuthTopMsg('Входим через Telegram…');
  const res = await api.telegramLogin(TG_RETURN.payload);
  if (res && res.ok && res.token && res.pilotId) {
    completeLogin({
      pilotId: res.pilotId,
      token: res.token,
      user: res.user,
      nick: res.nick,
      provider: 'telegram',
      tgUsername: TG_RETURN.payload.username || res.user?.telegram?.username || null,
      photoUrl: res.user?.photoUrl || null,
    });
    setAuthTopMsg('');
    refreshAccount();
    try { applyCarUI(); } catch (_) {}
    return;
  }
  const err = String(res?.error || '');
  if (res?.status === 503) setAuthTopMsg('Вход через Telegram пока не настроен на сервере.');
  else if (err === 'auth expired') setAuthTopMsg('Данные входа устарели — нажмите «Войти через Telegram» ещё раз.');
  else if (res?.status === 429) setAuthTopMsg('Слишком много попыток — подождите 15 минут.');
  else if (res?.status) setAuthTopMsg('Telegram не подтвердил вход — попробуйте ещё раз.');
  else setAuthTopMsg('Нет связи с сервером — вход не завершён.');
}
void finishTelegramReturn();
void refreshAuthProviders();
document.querySelector('[data-view="account"]')?.addEventListener('click', () => { void refreshAuthProviders(); });

/* -------- v77: Telegram Mini App — silent login, sharing, BackButton, closing guard, start_param -------- */

/** Silent login from the signed initData (same account as the site's Telegram login: auth:tg:<id>). */
async function tmaAutoLogin(manual) {
  if (!isTMA || !tmaInitData || !isRemoteApi()) return;
  const tgId = String(TG?.initDataUnsafe?.user?.id || '');
  const u = currentUser();
  const tok = getSessionToken();
  const realSession = !!(u && tok && !String(tok).startsWith('local-'));
  // Keep an existing session unless it belongs to a different Telegram user (account switch in Telegram).
  if (!manual && realSession && (!u.tgUserId || u.tgUserId === tgId)) { _tmaLogin = 'ok'; return; }
  _tmaLogin = 'pending';
  setAuthTopMsg('Входим через Telegram…');
  const res = await api.tmaLogin(tmaInitData);
  if (res && res.ok && res.token && res.pilotId) {
    const nu = completeLogin({
      pilotId: res.pilotId,
      token: res.token,
      user: res.user,
      nick: res.nick,
      provider: 'telegram',
      tgUsername: res.user?.telegram?.username || TG?.initDataUnsafe?.user?.username || null,
      photoUrl: res.user?.photoUrl || null,
    });
    if (nu) { nu.tgUserId = String(res.tgUserId || tgId); saveAuth(); }
    _tmaLogin = 'ok';
    setAuthTopMsg('');
    refreshAccount();
    try { applyCarUI(); } catch (_) {}
    return;
  }
  _tmaLogin = res?.status === 503 ? 'unconfigured' : 'failed';
  if (res?.status === 503) setAuthTopMsg('');
  else if (res?.error === 'auth expired') setAuthTopMsg('Данные Telegram устарели — закройте и откройте мини-приложение заново.');
  else if (res?.status === 429) setAuthTopMsg('Слишком много попыток — подождите 15 минут.');
  else if (res?.status) setAuthTopMsg('Telegram не подтвердил вход — нажмите «Войти через Telegram».');
  else setAuthTopMsg('Нет связи с сервером — вход не выполнен. Замеры и гараж работают офлайн.');
  void refreshAuthProviders(true);
}

async function ensureAuthCfg() {
  if (_authCfg === undefined || Date.now() - _authCfgAt > 60000) {
    _authCfgAt = Date.now();
    _authCfg = await api.authConfig();
  }
  return _authCfg || null;
}

/** t.me/<bot>?startapp=<param> inside Telegram (bot username from /auth/config), else the web URL. */
function publicLinkFor(param, webUrl) {
  if (!isTMA || !param) return webUrl;
  return tmaStartLink(_authCfg?.telegramBot, param) || webUrl;
}

/** Share inside Telegram: prepared inline message (WebApp.shareMessage) → fallback t.me/share/url. */
async function shareViaTelegram(param, webUrl, text) {
  const cfg = await ensureAuthCfg();
  const link = (param && tmaStartLink(cfg?.telegramBot, param)) || webUrl;
  const canPrepare = !!(param && cfg?.tmaShare && tmaInitData && link !== webUrl);
  hap(16);
  await tmaShare({
    url: link,
    text,
    prepare: canPrepare ? async () => {
      const r = await api.tmaSharePrepare(tmaInitData, param, String(text || 'PITLANE'));
      return r && r.ok && r.id ? r.id : null;
    } : null,
  });
}

if (isTMA) {
  void ensureAuthCfg().then((cfg) => {
    if (cfg && cfg.tma) return tmaAutoLogin(false);
    _tmaLogin = cfg ? 'unconfigured' : 'idle'; // no bot token on the Worker → «вход недоступен» (no pointless 503 call)
    return undefined;
  });

  // BackButton: close the top-most sheet / overlay, otherwise go back to the garage.
  const SHEETS = [
    ['safetySheet', 'safetyCancel'], ['deleteSheet', 'deleteClose'], ['pitHelpSheet', 'pitHelpClose'],
    ['shareCard', 'shareCardClose'], ['duelSheet', 'duelSheetClose'], ['crewSheet', 'crewSheetClose'],
    ['autodromeSheet', 'autodromeSheetClose'], ['carPickerSheet', 'carPickerClose'],
    ['feedbackSheet', 'feedbackClose'],
  ];
  const visible = (id) => { const el = document.getElementById(id); return !!(el && !el.classList.contains('hidden')); };
  const closeSheet = (id, btnId) => {
    const btn = document.getElementById(btnId) || document.querySelector('#' + id + ' [data-close], #' + id + ' .race-sheet-close, #' + id + ' button[aria-label="Закрыть"]');
    if (btn) btn.click();
    else { const el = document.getElementById(id); el?.classList.add('hidden'); el?.setAttribute('aria-hidden', 'true'); }
  };
  const backTarget = () => {
    if (visible('geoDenied')) return () => hideGeoDenied();
    for (const [id, btn] of SHEETS) if (visible(id)) return () => closeSheet(id, btn);
    if (visible('runDrive')) return run.armed ? null : () => closeRunDrive();
    if (visible('lapDrive')) return () => document.getElementById('lapDriveCancel')?.click();
    const active = document.querySelector('.view.active');
    if (active && active.id !== 'view-garage') return () => goToView('garage');
    return null;
  };
  setBackHandler(() => { const fn = backTarget(); if (fn) fn(); syncTmaChrome(); });
  const syncTmaChrome = () => {
    showBack(!!backTarget());
    setClosingGuard(!!(run.armed || lapRun.active));
  };
  let _syncQueued = false;
  new MutationObserver(() => {
    if (_syncQueued) return;
    _syncQueued = true;
    requestAnimationFrame(() => { _syncQueued = false; syncTmaChrome(); });
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  setInterval(syncTmaChrome, 1000);
  syncTmaChrome();
}

/** start_param routes that need app state (track selection) — URL-level ones were rewritten in tma.js. */
if (START_ROUTE && (START_ROUTE.kind === 'track' || START_ROUTE.kind === 'tops')) {
  setTimeout(() => {
    try {
      const pick = (selId) => {
        const sel = document.getElementById(selId);
        if (!sel || ![...sel.options].some((o) => o.value === START_ROUTE.id)) return false;
        sel.value = START_ROUTE.id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      if (START_ROUTE.kind === 'track') { goToView('lap', { sfx: false }); pick('trackSelect'); }
      else { goToView('tops', { sfx: false }); pick('sectorTopTrackSelect'); }
    } catch (err) { console.warn('start_param route', err); }
  }, 900);
}

/* —— account deletion —— */
function openDeleteSheet() {
  const sheet = document.getElementById('deleteSheet');
  if (!sheet) return;
  const inp = document.getElementById('deleteConfirmInput');
  const btn = document.getElementById('deleteConfirmBtn');
  if (inp) inp.value = '';
  if (btn) btn.disabled = true;
  const msg = document.getElementById('deleteMsg');
  if (msg) msg.textContent = '';
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
}
function closeDeleteSheet() {
  const sheet = document.getElementById('deleteSheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
}

/**
 * After server-side deletion: forget the session and account-linked data on this device.
 * Kept on purpose (device-only, never tied to the account): garage cars/paint/plates, 3D quality tier,
 * local run/lap history, language, sound.
 */
function clearLocalAccountData() {
  const sid = authDb.session;
  const u = sid ? authDb.users[sid] : null;
  if (sid) delete authDb.users[sid];
  if (u?.phone) delete authDb.users[u.phone];
  authDb.session = null;
  authDb.token = null;
  authDb.otps = {};
  authDb.demoSms = false;
  setSessionToken('');
  saveAuth();
  ['pitlane-prof-v1', 'pitlane-duels-mine-v1', 'pitlane-crews-mine-v1', 'pitlane-duel-last-v1',
    'pitlane-nick', 'pitlane-duel-nick', 'pitlane-api-v1', 'pitlane-device-v1'].forEach((k) => {
    try { localStorage.removeItem(k); } catch (_) {}
  });
  const img = document.getElementById('accAvatar');
  if (img) img.removeAttribute('src');
  const nick = document.getElementById('accNick');
  if (nick) nick.value = '';
  refreshAccount();
}

document.getElementById('btnDeleteAccount')?.addEventListener('click', openDeleteSheet);
document.getElementById('deleteClose')?.addEventListener('click', closeDeleteSheet);
document.getElementById('deleteSheet')?.addEventListener('click', (e) => {
  if (e.target?.id === 'deleteSheet') closeDeleteSheet();
});
document.getElementById('deleteConfirmInput')?.addEventListener('input', (e) => {
  const btn = document.getElementById('deleteConfirmBtn');
  if (btn) btn.disabled = String(e.target.value || '').trim().toUpperCase() !== 'УДАЛИТЬ';
});
document.getElementById('deleteConfirmBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('deleteConfirmBtn');
  const msg = document.getElementById('deleteMsg');
  const inp = document.getElementById('deleteConfirmInput');
  if (String(inp?.value || '').trim().toUpperCase() !== 'УДАЛИТЬ') return;
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = 'Удаляем…';
  const res = await api.deleteAccount();
  if (res && res.ok) {
    clearLocalAccountData();
    closeDeleteSheet();
    setAuthTopMsg('Аккаунт и данные на сервере удалены.');
    return;
  }
  if (btn) btn.disabled = false;
  if (!msg) return;
  if (res?.status === 401) msg.textContent = 'Сессия истекла — войдите снова и повторите удаление.';
  else msg.textContent = 'Не удалось удалить: нет связи с сервером. Попробуйте позже.';
});

/* —— one-time safety notice before the first measurement —— */
const SAFETY_KEY = 'pitlane-safety-ok-v1';
let _safetyPending = null;
function withSafety(fn) {
  return () => {
    let seen = false;
    try { seen = !!localStorage.getItem(SAFETY_KEY); } catch (_) { seen = true; }
    if (seen) return fn();
    const sheet = document.getElementById('safetySheet');
    if (!sheet) return fn();
    _safetyPending = fn;
    sheet.classList.remove('hidden');
    sheet.setAttribute('aria-hidden', 'false');
  };
}
function closeSafety() {
  const sheet = document.getElementById('safetySheet');
  if (sheet) {
    sheet.classList.add('hidden');
    sheet.setAttribute('aria-hidden', 'true');
  }
}
document.getElementById('safetyOk')?.addEventListener('click', () => {
  try { localStorage.setItem(SAFETY_KEY, String(Date.now())); } catch (_) {}
  closeSafety();
  const fn = _safetyPending;
  _safetyPending = null;
  if (fn) fn();
});
document.getElementById('safetyCancel')?.addEventListener('click', () => {
  _safetyPending = null;
  closeSafety();
});

const gltfLoader = new GLTFLoader();
let glbRoot = null;

/** Catalog of GLB models in /models — cycled via title ◀ ▶ (no door anims). */
const MODEL_CATALOG = [
  { id: 'g87-m2', name: 'BMW G87 M2 Widebody', file: './models/g87-m2.glb', year: '2026' },
  { id: 'gt3rs', name: 'Porsche 911 GT3 RS', file: './models/gt3rs.glb', year: '2023' },
  { id: 'mclaren-765lt', name: 'McLaren 765LT', file: './models/mclaren-765lt.glb', year: '2021' },
  { id: 'g63', name: 'Mercedes-AMG G 63', file: './models/g63.glb', year: '2020', driveIn: true },
  { id: 'm4', name: 'BMW M4', file: './models/m4.glb', year: '2021' },
  { id: 'm3', name: 'BMW M3 Competition', file: './models/m3.glb', year: '2023' },
  { id: 'x6', name: 'BMW X6 xDrive40i', file: './models/x6.glb', year: '2020' },
  { id: 'isf', name: 'Lexus IS-F', file: './models/isf.glb', year: '2013' },
  { id: 'c63-ed507', name: 'Mercedes-AMG C 63 Edition 507', file: './models/c63-ed507.glb', year: '2014' },
  { id: 'spark', name: 'Chevrolet Spark GT', file: './models/spark.glb', year: '2018' },
];

function disposeGlbTree(root, { sharedFromCache = false } = {}) {
  if (!root) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (isPitlanePlate(o)) return; // shared plate geo/mat/texture live across switches
    if (!sharedFromCache) {
      try { o.geometry?.dispose?.(); } catch (_) {}
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      // Paint clones are instance-local; shared cache mats/geos must stay alive
      if (sharedFromCache) {
        if (m.userData?.__isPaintClone) {
          try { m.dispose?.(); } catch (_) {}
        }
      } else {
        try { m.dispose?.(); } catch (_) {}
      }
    });
  });
}

function scheduleDisposeGlb(root) {
  if (!root) return;
  const fromCache = !!root.userData?.__fromParsedCache;
  requestAnimationFrame(() => {
    try { disposeGlbTree(root, { sharedFromCache: fromCache }); } catch (_) {}
  });
}

function clearGlb() {
  if (glbRoot) {
    const prev = glbRoot;
    scene.remove(prev);
    glbRoot = null;
    scheduleDisposeGlb(prev);
  }
  car.visible = false; // podium = GLB only, lowpoly off
  moving.doorList = [];
  moving.hood = null;
  moving.trunk = null;
}

function fitGlb(obj, opts = {}) {
  try { finishDriveIn(); } catch (_) {}
  const prevRoot = glbRoot;
  glbRoot = obj;
  if (glbRoot.userData) glbRoot.userData.__fromParsedCache = !!obj.userData?.__fromParsedCache;
  glbRoot.updateMatrixWorld(true);
  const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() || 8;
  glbRoot.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.userData) o.userData.door = false;
      // keep glass / transmission / alpha — never force transparent=false
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let glassish = false;
      mats.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.DoubleSide;
        const transmission = Number(mat.transmission || 0);
        const opacity = mat.opacity == null ? 1 : Number(mat.opacity);
        const isGlass = !!(mat.transparent || mat.alphaMap || transmission > 0.01 || opacity < 0.999);
        if (isGlass) {
          glassish = true;
          mat.transparent = true;
          if (transmission > 0.01 || opacity < 0.95) mat.depthWrite = false;
        }
        // anisotropy + color space on common maps
        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'].forEach((k) => {
          const tex = mat[k];
          if (!tex || !tex.isTexture) return;
          tex.anisotropy = maxAniso;
          if (k === 'map' || k === 'emissiveMap') tex.colorSpace = THREE.SRGBColorSpace;
        });
        const isPbr = !!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial);
        if (isPbr) {
          if (isGlass) {
            // glass keeps transmission; slight env for edge highlights
            if (mat.envMapIntensity == null || mat.envMapIntensity < 1.0) mat.envMapIntensity = 1.05;
          } else {
            // opaque paint / body — richer RoomEnvironment reflections
            mat.envMapIntensity = Math.min(1.4, Math.max(1.15, Number(mat.envMapIntensity) || 1.2));
            // near-black panels: lift min roughness so they aren't dead voids
            if (mat.color && mat.roughness != null) {
              const lum = 0.2126 * mat.color.r + 0.7152 * mat.color.g + 0.0722 * mat.color.b;
              if (lum < 0.085) mat.roughness = Math.max(Number(mat.roughness), 0.2);
            }
          }
        }
        mat.needsUpdate = true;
      });
      if (glassish) o.castShadow = false;
    }
  });
  // fit length to ~4.8m on podium
  let box = new THREE.Box3().setFromObject(glbRoot);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const target = 4.8;
  glbRoot.scale.setScalar(target / maxDim);
  glbRoot.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(glbRoot);
  box.getSize(size);
  const mid = box.getCenter(new THREE.Vector3());
  glbRoot.position.x -= mid.x;
  glbRoot.position.z -= mid.z;
  glbRoot.position.y -= box.min.y;
  glbRoot.rotation.y = Math.PI * 0.2;
  // PITLANE license plates (baked per-model placement, shared texture/material)
  try {
    const plateModel = obj.userData?.__plateModel;
    if (plateModel) attachPitlanePlates(glbRoot, plateModel, renderer);
  } catch (err) { console.warn('plates', err); }
  scene.add(glbRoot);
  if (prevRoot && prevRoot !== glbRoot) {
    try { scene.remove(prevRoot); } catch (_) {}
    scheduleDisposeGlb(prevRoot);
  }
  car.visible = false;
  const h = Math.max(0.5, size.y);
  controls.target.set(0, h * 0.35, 0);
  camera.position.set(5.4, 2.1, 5.8);
  controls.minDistance = 2.2;
  controls.maxDistance = 16;
  controls.update();
  onResize();
  try { applyStoredBodyPaint(); } catch (err) { console.warn('paint after fitGlb', err); }
  podiumInvalidate(1200, true);
  if (qm.phase === 'sample' || qm.phase === 'warm') { qm.phase = 'warm'; qm.t0 = performance.now(); } // model swap hitch ≠ slow device
  if (opts.driveIn) { try { startDriveIn(glbRoot, opts.modelId); } catch (err) { console.warn('drive-in', err); } }
}

/* ---- Drive-in animation (opt-in per model: MODEL_CATALOG[].driveIn) — DEPLOY.md §22 ----
 * The car starts DRIVE_IN.dist m behind its resting spot and rolls onto the podium centre with ease-out,
 * brake dive + small suspension bob, wheels spin by travelled distance, head/tail lights glow.
 * Everything is restored to the exact fitted values at the end → idle pose identical to the static load.
 * Camera controls are locked during the drive-in (no snap on touch). Low tier: motion + wheel spin only (no dive/bob/lights). */
const DRIVE_IN = { dist: 3.0, driveMs: 1350, settleMs: 520, pitch: 0.021, bob: 0.014, wobbleHz: 2.4, damp: 7.5 };
/** Per-model rig hints (node names are GLTFLoader-sanitized: spaces → _). Missing entry → auto-detect wheels by name. */
const DRIVE_IN_RIGS = {
  g63: {
    wheels: /^3DWheel_(Front|Rear)_[LR]$/,
    unsprung: /^Calliper_(Front|Rear)_[LR]/,
    headMats: /LightA_Material/,
    tailMats: /^red_glass$/,
  },
};
const _di = { m1: new THREE.Matrix4(), m2: new THREE.Matrix4(), m3: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3() };

function buildDriveRig(root, modelId) {
  const cfg = DRIVE_IN_RIGS[modelId] || {};
  const wheelRe = cfg.wheels || /wheel/i;
  root.updateMatrixWorld(true);
  const rootRest = root.matrixWorld.clone();
  const topMatches = (re) => {
    const out = [];
    root.traverse((o) => {
      if (!re.test(o.name || '') || isPitlanePlate(o)) return;
      for (let p = o.parent; p && p !== root; p = p.parent) if (re.test(p.name || '')) return;
      out.push(o);
    });
    return out;
  };
  const wheels = [];
  topMatches(wheelRe).forEach((node) => {
    if (!cfg.wheels && !/front|rear|fl|fr|rl|rr/i.test(node.name)) return;
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) return;
    const cw = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    wheels.push({ node, cw, r: Math.max(0.05, size.y / 2), front: /front/i.test(node.name) });
  });
  // forward = rear axle → front axle (world, horizontal); fallback: towards the camera
  const up = new THREE.Vector3(0, 1, 0);
  let fwd = new THREE.Vector3();
  const fr = wheels.filter((w) => w.front), rr = wheels.filter((w) => !w.front);
  if (fr.length && rr.length) {
    const a = new THREE.Vector3(); fr.forEach((w) => a.add(w.cw)); a.multiplyScalar(1 / fr.length);
    const b = new THREE.Vector3(); rr.forEach((w) => b.add(w.cw)); b.multiplyScalar(1 / rr.length);
    fwd.subVectors(a, b);
  } else {
    fwd.set(camera.position.x, 0, camera.position.z);
  }
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1);
  fwd.normalize();
  const axle = new THREE.Vector3().crossVectors(up, fwd).normalize(); // rolling forward = +angle about up×fwd
  const pivot = new THREE.Vector3();
  if (wheels.length) { wheels.forEach((w) => pivot.add(w.cw)); pivot.multiplyScalar(1 / wheels.length); }
  else new THREE.Box3().setFromObject(root).getCenter(pivot);
  const mkNode = (node, spin, cw) => {
    const parentRest = node.parent.matrixWorld.clone();
    const e = { node, M0: node.matrix.clone(), K: parentRest, Kinv: parentRest.clone().invert(), spin: false };
    if (spin) {
      const inv = node.matrixWorld.clone().invert();
      e.spin = true;
      e.c = node.worldToLocal(cw.clone());
      e.a = axle.clone().transformDirection(inv);
    }
    return e;
  };
  const unsprung = wheels.map((w) => Object.assign(mkNode(w.node, true, w.cw), { r: w.r }));
  if (cfg.unsprung) topMatches(cfg.unsprung).forEach((n) => { if (!wheels.some((w) => w.node === n)) unsprung.push(mkNode(n, false)); });
  // light materials (emissive boost in place; exact values restored at the end)
  const lights = [];
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh || isPitlanePlate(o)) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      if (!m || seen.has(m) || !m.emissive) return;
      const nm = m.name || '';
      const kind = cfg.headMats && cfg.headMats.test(nm) ? 'head' : cfg.tailMats && cfg.tailMats.test(nm) ? 'tail' : '';
      if (!kind) return;
      seen.add(m);
      lights.push({ m, kind, e0: m.emissive.clone(), i0: m.emissiveIntensity });
    });
  });
  return { root, rootRest, pos0: root.position.clone(), rot0: root.rotation.clone(), scale0: root.scale.clone(), fwd, axle, pivot, unsprung, lights, cs0: contactShadow.position.clone() };
}

function driveInApply(rig, offset, pitch, bob, travelled, lightK) {
  const { root } = rig;
  // body transform Tp = T(P+bob) · R(axle, pitch) · T(-P) — world space, root has no parent transform
  const Tp = _di.m1.makeTranslation(-rig.pivot.x, -rig.pivot.y, -rig.pivot.z);
  _di.m2.makeRotationAxis(rig.axle, pitch);
  Tp.premultiply(_di.m2);
  Tp.premultiply(_di.m2.makeTranslation(rig.pivot.x, rig.pivot.y + bob, rig.pivot.z));
  const body = pitch !== 0 || bob !== 0;
  _di.m3.copy(Tp).multiply(rig.rootRest);
  _di.m3.premultiply(_di.m2.makeTranslation(offset.x, 0, offset.z));
  _di.m3.decompose(root.position, root.quaternion, root.scale);
  // unsprung parts (wheels, calipers) stay level: local = K⁻¹ · Tp⁻¹ · K · M0 · spin
  const TpInv = body ? Tp.clone().invert() : null;
  rig.unsprung.forEach((e) => {
    const M = e.node.matrix;
    if (body) M.copy(e.Kinv).multiply(TpInv).multiply(e.K).multiply(e.M0);
    else M.copy(e.M0);
    if (e.spin) {
      const ang = travelled / e.r;
      M.multiply(_di.m2.makeTranslation(e.c.x, e.c.y, e.c.z));
      M.multiply(_di.m2.makeRotationAxis(e.a, ang));
      M.multiply(_di.m2.makeTranslation(-e.c.x, -e.c.y, -e.c.z));
    }
    e.node.matrixAutoUpdate = false;
    e.node.matrixWorldNeedsUpdate = true;
  });
  rig.lights.forEach((L) => {
    if (lightK <= 0) { L.m.emissive.copy(L.e0); L.m.emissiveIntensity = L.i0; return; }
    if (L.kind === 'head') L.m.emissive.setRGB(0.92, 0.96, 1);
    else L.m.emissive.setRGB(1, 0.06, 0.04);
    L.m.emissiveIntensity = (L.kind === 'head' ? 0.42 : 1.6) * lightK;
  });
  contactShadow.position.set(rig.cs0.x + offset.x, rig.cs0.y, rig.cs0.z + offset.z);
}

/** Restore the exact fitted pose (idle frame must equal a static load). */
function finishDriveIn() {
  const d = driveIn;
  if (!d) return;
  driveIn = null;
  unlockControlsAfterDriveIn(d);
  const rig = d.rig;
  rig.root.position.copy(rig.pos0);
  rig.root.rotation.copy(rig.rot0);
  rig.root.scale.copy(rig.scale0);
  rig.unsprung.forEach((e) => { e.node.matrix.copy(e.M0); e.node.matrixAutoUpdate = true; e.node.matrixWorldNeedsUpdate = true; });
  rig.lights.forEach((L) => { L.m.emissive.copy(L.e0); L.m.emissiveIntensity = L.i0; });
  contactShadow.position.copy(rig.cs0);
  rig.root.updateMatrixWorld(true);
  try { podiumInvalidate(300, true); } catch (_) {}
}

function startDriveIn(root, modelId) {
  finishDriveIn();
  const m = MODEL_CATALOG.find((x) => x.id === modelId);
  if (!m || !m.driveIn || !root) return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  let rig;
  try { rig = buildDriveRig(root, modelId); } catch (err) { console.warn('drive-in rig', err); return false; }
  const lite = Q.tier === 'low';
  driveIn = { rig, t0: performance.now(), lite, frame: 0 };
  lockControlsForDriveIn(driveIn);
  stepDriveIn(driveIn.t0);
  podiumInvalidate(DRIVE_IN.driveMs + DRIVE_IN.settleMs + 300, true);
  return true;
}

function stepDriveIn(now) {
  const d = driveIn;
  if (!d) return false;
  if (d.rig.root !== glbRoot) { finishDriveIn(); return false; }
  const t = d.seekT != null ? d.seekT : Math.max(0, now - d.t0);
  d.lastT = t;
  const D = DRIVE_IN.driveMs, S = DRIVE_IN.settleMs;
  if (t >= D + S) { finishDriveIn(); return false; }
  const u = Math.min(1, t / D);
  const s = 1 - Math.pow(1 - u, 3); // ease-out cubic
  const rem = DRIVE_IN.dist * (1 - s);
  const offset = _di.v.copy(d.rig.fwd).multiplyScalar(-rem);
  let pitch = 0, bob = 0, lightK = 0;
  if (!d.lite) {
    // brake dive builds while decelerating, then a damped rebound after the stop
    let k;
    if (t < D) { const x = Math.min(1, Math.max(0, (u - 0.3) / 0.65)); k = x * x * (3 - 2 * x); }
    else { const tau = (t - D) / 1000; k = Math.exp(-DRIVE_IN.damp * tau) * Math.cos(2 * Math.PI * DRIVE_IN.wobbleHz * tau); }
    pitch = DRIVE_IN.pitch * k;
    bob = -DRIVE_IN.bob * k;
    const up = Math.min(1, t / 220), down = Math.min(1, Math.max(0, (D + S - t) / 420));
    lightK = Math.min(up, down);
  }
  driveInApply(d.rig, offset, pitch, bob, DRIVE_IN.dist * s, lightK);
  // static-shadow tiers (medium) re-render the shadow map every 2nd frame while the car moves
  const p = qPreset();
  if (p.shadow && p.shadowStatic && (d.frame++ % 2) === 0) { try { renderer.shadowMap.needsUpdate = true; } catch (_) {} }
  if (p.reflEvery > 1) reflForce = true;
  return true;
}
/** Drive-in camera lock: no rotate/zoom/pinch/pan, no inertia carry-over; any in-progress gesture is dropped. */
function cancelOrbitGesture() {
  const c = controls;
  try {
    const ptrs = Array.isArray(c._pointers) ? c._pointers.slice() : [];
    if (ptrs.length) {
      ptrs.forEach((id) => { try { c.domElement.releasePointerCapture(id); } catch (_) {} });
      try { c.domElement.removeEventListener('pointermove', c._onPointerMove); } catch (_) {}
      try { c.domElement.removeEventListener('pointerup', c._onPointerUp); } catch (_) {}
      c._pointers.length = 0;
      if (c._pointerPositions) for (const k of Object.keys(c._pointerPositions)) delete c._pointerPositions[k];
      c.dispatchEvent({ type: 'end' }); // keep app's userInteracting / auto-rotate timer consistent
    }
    c.state = -1; // _STATE.NONE
    c._sphericalDelta?.set(0, 0, 0);
    c._panOffset?.set(0, 0, 0);
    c._scale = 1;
    c._performCursorZoom = false;
  } catch (_) {}
}
function lockControlsForDriveIn(d) {
  d.ctlEnabled = controls.enabled;
  cancelOrbitGesture();
  controls.enabled = false;
  userInteracting = false;
  interactUntil = 0;
}
function unlockControlsAfterDriveIn(d) {
  cancelOrbitGesture(); // nothing queued from the locked period
  controls.enabled = d.ctlEnabled !== false;
}

let heroTitleAnimLock = false;

function applyPodiumTitle(m) {
  const title = document.getElementById('boxName');
  const trim = document.getElementById('boxTrim');
  if (title) title.textContent = m.name;
  if (trim) trim.textContent = m.year ? (m.year + ' · 3D подиум') : '3D подиум';
  try { applyPassportUI(); } catch (_) {}
  // Keep catalog label when this model has no passport stock entry
  if (!PASSPORT_STOCK[m.id]) {
    if (title) title.textContent = m.name;
    if (trim) trim.textContent = m.year ? (m.year + ' · 3D подиум') : '3D подиум';
  }
}

/** Polished title crossfade/slide. dir > 0 = next, dir < 0 = prev. */
function runHeroTitleTransition(dir, applyFn) {
  const el = document.getElementById('heroTitleSwap');
  if (!el || !dir) {
    applyFn();
    return Promise.resolve();
  }
  if (heroTitleAnimLock) {
    applyFn();
    return Promise.resolve();
  }
  heroTitleAnimLock = true;
  const exitCls = dir > 0 ? 'is-exit-next' : 'is-exit-prev';
  const prepCls = dir > 0 ? 'is-enter-prep-next' : 'is-enter-prep-prev';
  const prevBtns = [document.getElementById('btnCarPrev'), document.getElementById('btnCarNext')];
  prevBtns.forEach((b) => { if (b) b.disabled = true; });

  return new Promise((resolve) => {
    el.classList.remove('is-exit-next', 'is-exit-prev', 'is-enter-prep-next', 'is-enter-prep-prev');
    // force style flush then exit
    void el.offsetWidth;
    el.classList.add(exitCls);
    window.setTimeout(() => {
      applyFn();
      el.classList.remove(exitCls);
      el.classList.add(prepCls);
      void el.offsetWidth;
      el.classList.remove(prepCls);
      window.setTimeout(() => {
        heroTitleAnimLock = false;
        prevBtns.forEach((b) => { if (b) b.disabled = false; });
        resolve();
      }, 500);
    }, 260);
  });
}

function cyclePodiumModel(delta) {
  if (heroTitleAnimLock || !MODEL_CATALOG.length) return;
  const idx = MODEL_CATALOG.findIndex((x) => x.id === podiumModelId);
  const i = idx < 0 ? 0 : idx;
  const next = MODEL_CATALOG[(i + delta + MODEL_CATALOG.length) % MODEL_CATALOG.length];
  if (!next || next.id === podiumModelId) return;
  hap(12);
  try { controls.autoRotate = false; } catch (_) {}
  loadPodiumModel(next.id, delta > 0 ? 1 : -1);
  clearTimeout(podiumIdleTimer);
  podiumIdleTimer = setTimeout(() => { try { controls.autoRotate = true; } catch (_) {} }, 1800);
}

const GLB_CACHE_NAME = 'pitlane-glb-v1';
let glbPrefetchStarted = false;
let glbPrefetchDone = false; // adaptive-quality FPS check waits for background GLB parsing (main-thread jank)
let glbPrefetchT0 = 0;
let podiumLoadGen = 0;
/** In-memory raw bytes (url -> ArrayBuffer). */
const glbMemCache = new Map();
/** In-memory parsed GLTF (url -> gltf). Switch clones from here — no re-parse. */
const glbParsedCache = new Map();
let glbParseQueue = Promise.resolve();

function catalogModelUrl(m) {
  const base = document.querySelector('base')?.href || (location.origin + location.pathname.replace(/[^/]*$/, ''));
  return new URL(m.file, base).href;
}

async function openGlbCache() {
  try {
    if (!('caches' in window)) return null;
    return await caches.open(GLB_CACHE_NAME);
  } catch (_) {
    return null;
  }
}

/** Store raw GLB bytes in memory Map + Cache Storage. */
async function putGlbBuffer(url, buf) {
  if (!buf) return;
  try { glbMemCache.set(url, buf); } catch (_) {}
  const cache = await openGlbCache();
  if (!cache) return;
  try {
    await cache.put(
      url,
      new Response(buf.slice ? buf.slice(0) : buf, {
        headers: {
          'Content-Type': 'model/gltf-binary',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    );
  } catch (_) {}
}

async function matchGlbBuffer(url) {
  try {
    const mem = glbMemCache.get(url);
    if (mem) return mem.slice ? mem.slice(0) : mem;
  } catch (_) {}
  const cache = await openGlbCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(url);
    if (!hit) return null;
    const buf = await hit.arrayBuffer();
    try { glbMemCache.set(url, buf); } catch (_) {}
    return buf.slice ? buf.slice(0) : buf;
  } catch (_) {
    return null;
  }
}

function parseGlbBuffer(buf, url) {
  const path = url.replace(/[^/]+$/, '');
  return new Promise((resolve, reject) => {
    try {
      gltfLoader.parse(buf, path, resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

/** Parse once, keep template scene in glbParsedCache.
 *  Background prefetch is serialized (concurrency via queue).
 *  Interactive loads (priority) parse immediately so swaps aren't stuck behind idle work. */
function ensureParsedGlb(url, buf, { priority = false } = {}) {
  if (glbParsedCache.has(url)) return Promise.resolve(glbParsedCache.get(url));
  const run = async () => {
    if (glbParsedCache.has(url)) return glbParsedCache.get(url);
    const gltf = await parseGlbBuffer(buf, url);
    try { glbParsedCache.set(url, gltf); } catch (_) {}
    return gltf;
  };
  if (priority) return run();
  const p = glbParseQueue.then(run, run);
  glbParseQueue = p.catch(() => {});
  return p;
}

function cloneParsedScene(gltf) {
  const src = gltf?.scene;
  if (!src) return null;
  let scene;
  try {
    scene = cloneSkinned(src);
  } catch (_) {
    scene = src.clone(true);
  }
  if (scene.userData) scene.userData.__fromParsedCache = true;
  else scene.userData = { __fromParsedCache: true };
  return scene;
}

async function prefetchGlbUrl(url, { parse = true } = {}) {
  try {
    if (parse && glbParsedCache.has(url)) return;
    let buf = null;
    try {
      const mem = glbMemCache.get(url);
      if (mem) buf = mem;
    } catch (_) {}
    if (!buf) {
      const cache = await openGlbCache();
      if (cache) {
        const hit = await cache.match(url);
        if (hit) buf = await hit.arrayBuffer();
      }
    }
    if (!buf) {
      const res = await fetch(url, { credentials: 'same-origin', mode: 'cors' });
      if (!res.ok) return;
      buf = await res.arrayBuffer();
      await putGlbBuffer(url, buf);
    } else {
      try { glbMemCache.set(url, buf); } catch (_) {}
    }
    if (parse && !glbParsedCache.has(url)) {
      await ensureParsedGlb(url, buf.slice ? buf.slice(0) : buf);
    }
  } catch (_) {}
}

/** Prefetch + decode catalog. Neighbors first. Parse concurrency 2. */
function startGlbPrefetch(priorityId) {
  if (glbPrefetchStarted || !MODEL_CATALOG?.length) return;
  glbPrefetchStarted = true;
  glbPrefetchT0 = performance.now();
  const run = async () => {
    const cats = MODEL_CATALOG.slice();
    const idx = cats.findIndex((x) => x.id === priorityId);
    const ordered = [];
    const seen = new Set();
    const push = (m) => {
      if (!m || seen.has(m.id)) return;
      seen.add(m.id);
      ordered.push(m);
    };
    // current first, then GT3 (heavy), neighbors, then the rest
    if (idx >= 0) push(cats[idx]);
    push(cats.find((x) => x.id === 'gt3rs'));
    if (idx >= 0) {
      push(cats[(idx - 1 + cats.length) % cats.length]);
      push(cats[(idx + 1) % cats.length]);
    }
    cats.forEach(push);
    const urls = ordered.map(catalogModelUrl);
    let cursor = 0;
    const worker = async () => {
      while (cursor < urls.length) {
        const u = urls[cursor++];
        await prefetchGlbUrl(u, { parse: true });
        await new Promise((r) => setTimeout(r, 60));
      }
    };
    await Promise.all([worker(), worker()]);
    glbPrefetchDone = true;
  };
  const kick = () => { try { run(); } catch (_) {} };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(kick, { timeout: 600 });
  } else {
    setTimeout(kick, 0);
  }
}

function loadPodiumModel(id, animDir = 0) {
  const m = MODEL_CATALOG.find((x) => x.id === id) || MODEL_CATALOG[0];
  if (!m) return;
  const same = podiumModelId === m.id;
  podiumModelId = m.id;
  try { state.carId = m.id; } catch (_) {}
  try { save(); } catch (_) {}
  try { applyCarUI(); } catch (_) {}
  const doTitle = () => applyPodiumTitle(m);
  if (animDir && !same) runHeroTitleTransition(animDir, doTitle);
  else doTitle();
  const url = catalogModelUrl(m);
  const gen = ++podiumLoadGen;

  // Kick catalog prefetch immediately (not only after first model paints)
  try { startGlbPrefetch(m.id); } catch (_) {}

  const applyScene = (scene) => {
    if (gen !== podiumLoadGen) return;
    if (!scene) return;
    if (scene.userData) scene.userData.__plateModel = m.id;
    fitGlb(scene, { driveIn: !same, modelId: m.id });
  };

  const fail = (err) => {
    if (gen !== podiumLoadGen) return;
    console.warn('glb fail', url, err);
    setRunText('scanStatus', 'не удалось загрузить модель');
  };

  (async () => {
    try {
      // Warm path: clone already-parsed scene (no GLB re-parse)
      const cached = glbParsedCache.get(url);
      if (cached) {
        const scene = cloneParsedScene(cached);
        applyScene(scene);
        return;
      }
      let buf = await matchGlbBuffer(url);
      if (!buf) {
        const res = await fetch(url, { credentials: 'same-origin', mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        buf = await res.arrayBuffer();
        putGlbBuffer(url, buf.slice(0));
      }
      if (gen !== podiumLoadGen) return;
      const gltf = await ensureParsedGlb(url, buf, { priority: true });
      if (gen !== podiumLoadGen) return;
      applyScene(cloneParsedScene(gltf));
    } catch (err) {
      if (gen !== podiumLoadGen) return;
      gltfLoader.load(url, (gltf) => {
        try { glbParsedCache.set(url, gltf); } catch (_) {}
        applyScene(cloneParsedScene(gltf) || gltf.scene);
      }, undefined, fail);
    }
  })();
}

/** Garage open: last podium car (state.carId) if it has a GLB, else the M2. */
function defaultPodiumId() {
  try { if (state.carId && MODEL_CATALOG.some((m) => m.id === state.carId)) return state.carId; } catch (_) {}
  return 'g87-m2';
}
function loadDefaultGlb() {
  loadPodiumModel(defaultPodiumId());
}


function bootPodium() {
  if (introBlocking3d) return; // intro still visible — no GLB decode / PMREM yet
  onResize();
  try { applyPassportUI(); } catch (_) {}
  if (podiumBooted) return;
  podiumBooted = true;
  ensurePodiumEnv();
  try { startGlbPrefetch(podiumModelId || defaultPodiumId()); } catch (_) {}
  loadDefaultGlb();
  // second resize after fonts/layout
  requestAnimationFrame(() => { onResize(); requestAnimationFrame(onResize); });
}
// Podium boots only after intro finish (or immediate finish when skipped).

document.getElementById('btnDynoEdit')?.addEventListener('click', () => setDynoEditMode(true));
document.getElementById('btnDynoCancel')?.addEventListener('click', () => setDynoEditMode(false));
document.getElementById('dynoEditForm')?.addEventListener('submit', saveDynoEdit);
document.getElementById('btnCarPrev')?.addEventListener('click', () => cyclePodiumModel(-1));
document.getElementById('btnCarNext')?.addEventListener('click', () => cyclePodiumModel(1));

/* ---- Car picker bottom sheet (tap car name / grid icon) — DEPLOY.md §22 ----
 * Static thumbnails img/cars/<id>.webp (rendered offline from the GLBs, see tools/car-thumbs.mjs) — no WebGL per card. */
function carThumbUrl(id) { return './img/cars/' + id + '.webp'; }
function renderCarPicker() {
  const grid = document.getElementById('carPickerGrid');
  if (!grid) return;
  const cur = podiumModelId || state.carId;
  grid.innerHTML = MODEL_CATALOG.map((m) => {
    const on = m.id === cur;
    return `<button type="button" class="cp-card${on ? ' on' : ''}" role="option" aria-selected="${on}" data-car-id="${esc(m.id)}">`
      + `<img src="${carThumbUrl(m.id)}" alt="" width="128" height="128" loading="lazy" decoding="async" />`
      + `<span class="cp-name">${esc(m.name)}</span>${m.year ? `<span class="cp-year">${esc(m.year)}</span>` : ''}</button>`;
  }).join('');
}
function openCarPicker() {
  const sheet = document.getElementById('carPickerSheet');
  if (!sheet) return;
  renderCarPicker();
  const inner = document.getElementById('carPickerInner');
  if (inner) { inner.style.transform = ''; inner.style.transition = ''; }
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  hap(8);
  requestAnimationFrame(() => {
    try { sheet.querySelector('.cp-card.on')?.scrollIntoView({ block: 'nearest' }); } catch (_) {}
  });
}
function closeCarPicker() {
  const sheet = document.getElementById('carPickerSheet');
  if (!sheet || sheet.classList.contains('hidden')) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  const inner = document.getElementById('carPickerInner');
  if (inner) { inner.style.transform = ''; inner.style.transition = ''; }
}
function pickPodiumCar(id) {
  const m = MODEL_CATALOG.find((x) => x.id === id);
  closeCarPicker();
  if (!m || m.id === podiumModelId) return;
  const from = MODEL_CATALOG.findIndex((x) => x.id === podiumModelId);
  const to = MODEL_CATALOG.indexOf(m);
  hap(12);
  try { controls.autoRotate = false; } catch (_) {}
  loadPodiumModel(m.id, to >= from ? 1 : -1);
  clearTimeout(podiumIdleTimer);
  podiumIdleTimer = setTimeout(() => { try { controls.autoRotate = true; } catch (_) {} }, 1800);
}
document.getElementById('btnCarPicker')?.addEventListener('click', openCarPicker);
document.getElementById('boxName')?.addEventListener('click', openCarPicker);
document.getElementById('boxName')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCarPicker(); } });
document.getElementById('carPickerClose')?.addEventListener('click', closeCarPicker);
document.getElementById('carPickerGrid')?.addEventListener('click', (e) => {
  const b = e.target.closest?.('.cp-card');
  if (b) pickPodiumCar(b.dataset.carId);
});
document.getElementById('carPickerSheet')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeCarPicker(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCarPicker(); });
// swipe down to close (from the header anywhere, or from the list when it is scrolled to the top)
(() => {
  const inner = document.getElementById('carPickerInner');
  if (!inner) return;
  let y0 = null, dy = 0, t0 = 0;
  inner.addEventListener('touchstart', (e) => {
    const head = e.target.closest?.('#carPickerHead');
    if (!head && inner.scrollTop > 0) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; t0 = performance.now();
    inner.style.transition = 'none';
  }, { passive: true });
  inner.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) { inner.style.transform = ''; return; }
    if (e.cancelable) e.preventDefault();
    inner.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    const v = dy / Math.max(1, performance.now() - t0);
    inner.style.transition = 'transform .2s ease';
    if (dy > 90 || (dy > 30 && v > 0.6)) { inner.style.transform = 'translateY(110%)'; setTimeout(closeCarPicker, 180); }
    else inner.style.transform = '';
  };
  inner.addEventListener('touchend', end, { passive: true });
  inner.addEventListener('touchcancel', end, { passive: true });
})();


document.getElementById('liveryInput')?.addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])].slice(0, 3);
  if (!files.length) return;
  const hero = document.getElementById('heroPhoto');
  if (hero) hero.src = URL.createObjectURL(files[0]);
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 1024;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#696969';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < files.length; i++) {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = URL.createObjectURL(files[i]);
    });
    const w = 1024 / files.length;
    ctx.drawImage(img, i * w, 0, w, 1024);
  }
  state.customLivery = cnv;
  paintCar(currentCar());
});

document.getElementById('glbInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  gltfLoader.load(url, (gltf) => fitGlb(gltf.scene));
});

document.getElementById('btnResetModel')?.addEventListener('click', () => {
  state.customLivery = null;
  loadPodiumModel(podiumModelId || 'g87-m2');
});

document.querySelectorAll('[data-photo]').forEach((b) => {
  b.addEventListener('click', () => {
    const img = document.getElementById('heroPhoto');
    if (img) img.src = b.dataset.photo;
  });
});

const paint = { body: null, wheel: null, finish: 'gloss' };
const PAINT_LS_KEY = 'pitlane-paint';

/** Split CamelCase / digits so "Recycled" ≠ "led" and "2020Paint" → paint. */
function paintNameTokens(s) {
  return String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-zA-Z])(\d)/g, '$1_$2')
    .replace(/(\d)([a-zA-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/i)
    .filter((t) => t && t.length > 1);
}

const PAINT_INCLUDE_TOKENS = new Set([
  'body', 'paint', 'carpaint', 'coloured', 'colored', 'exterior', 'ext',
  'hood', 'bonnet', 'door', 'doors', 'fender', 'bumper', 'bamper', 'wing',
  'roof', 'trunk', 'boot', 'skin', 'shell', 'lacquer', 'clearcoat', 'кузов',
  'bodykit', 'spoiler', 'quater', 'quarter', 'panel', 'panels', 'chassis',
]);
const PAINT_SKIP_TOKENS = new Set([
  'glass', 'window', 'windows', 'windshield', 'windscreen', 'tire', 'tyre', 'tyres',
  'rubber', 'wheel', 'wheels', 'rim', 'rims', 'chrome', 'carbon', 'interior', 'cabin',
  'seat', 'seats', 'leather', 'brake', 'brakes', 'disc', 'disk', 'caliper', 'calliper',
  'calipers', 'callipers', 'calip', 'emissive', 'light', 'lights', 'lamp', 'lamps',
  'led', 'grille', 'grill', 'mirror', 'mirrors', 'exhaust', 'pipe', 'pipes', 'logo',
  'badge', 'badges', 'emblem', 'emblems', 'number', 'plate', 'plates', 'text',
  'textured', 'rotor', 'spoke', 'spokes', 'hub', 'salon', 'engine', 'engines',
  'seatbelt', 'belt', 'torpeda', 'steering', 'potolok', 'koleso', 'misc', 'cab',
  'shadow', 'occlusion', 'plastic', 'plastics', 'unpainted', 'cladding',
]);
/** Substring include (material name) — Forza / FH style */
const PAINT_INCLUDE_RE = /carpaint|car_paint|(?:^|[^a-z])paint(?:[^a-z]|$)|coloured|colored|bodykit|(?:^|[^a-z])body(?:[^a-z]|$)|exterior|bamper|bumper/i;

/**
 * Per-car paint material overrides when heuristics are ambiguous.
 * include/exclude test against material.name (not mesh path junk).
 */
const PAINT_MAT_OVERRIDES = {
  /* M2: Paint + Coloured bodykit panels; Base/Carbon black plastics stay */
  'g87-m2': {
    strict: true,
    include: [/Paint/i, /Coloured/i],
    exclude: [/Interior/i, /Carbon/i, /Light/i, /Wheel/i, /Tire/i, /Rim/i, /Base_/i, /Engine/i, /Window/i, /Grille/i, /Calliper/i, /Badge/i, /Plate/i],
    meshExclude: [/SeatBelt/i, /seat.?belt/i],
  },
  /* GT3 RS: ONLY Paint_Material. Coloured=bumper/fender plastics; Carbon=spoiler.
     Roof shares Paint_Material with body on this GLB (residual). */
  gt3rs: {
    strict: true,
    include: [/Paint_Material/i],
    exclude: [/Coloured/i, /Carbon/i, /Base_/i, /Textured/i, /Window/i, /Grille/i, /Wheel/i, /Interior/i, /Light/i, /Badge/i, /Calliper/i, /Plate/i, /Manufacturer/i],
    meshExclude: [/SeatBelt/i, /polySurface/i],
  },
  /* G63: Paint_Material body only. Coloured = cladding / bullbar plastics. */
  g63: {
    strict: true,
    include: [/Paint_Material/i],
    exclude: [/Coloured/i, /Carbon/i, /Base_/i, /Textured/i, /Interior/i, /Window/i, /Grille/i, /Wheel/i, /Light/i, /Badge/i, /Engine/i, /Calliper/i, /calip/i, /Plate/i, /Manufacturer/i],
    meshExclude: [/SeatBelt/i],
  },
  /* McLaren: Paint_Material body (solid). Coloured is near-black plastic/trim. */
  'mclaren-765lt': {
    strict: true,
    include: [/Paint_Material/i],
    exclude: [/Coloured/i, /Carbon/i, /Base_/i, /Window/i, /Grille/i, /Wheel/i, /Interior/i, /Light/i, /Badge/i, /Calliper/i, /SeatBelt/i, /Specular/i, /Manufacturer/i],
    meshExclude: [/SeatBelt/i],
  },
  /* X6: only CarPaint body. bamper_gray + plastic_SH = black plastic inserts (not body color). */
  x6: {
    strict: true,
    include: [/^CarPaint$/i],
    exclude: [/^chassis$/i, /plastic/i, /bamper/i, /bumper/i, /baked/i, /Salon/i, /Koleso/i, /chrome/i, /Chrome/i, /glass/i, /light/i, /ligts/i, /Mirror/i, /badge/i, /plate/i, /Emblema/i, /Windows/i, /black_metal/i],
    meshExclude: [/Niere/i, /plastic/i, /bamper/i, /bumper/i],
  },
  isf: {
    strict: true,
    include: [/Exterior_mm_ext/i],
    exclude: [/Interior/i, /windows/i, /lights/i, /wheel/i, /tyre/i, /chassis/i, /_cab$/i, /badges/i, /misc/i, /rotor/i, /Glass/i],
  },
  m4: {
    strict: true,
    include: [/car_body\d/i, /bodykit\d/i, /hood\d/i, /spoiler\d/i],
    exclude: [/interior/i, /glass/i, /rim/i, /Tire/i, /caliper/i, /Capiler/i, /^m4car_plast1$/i, /bodykit_plast/i, /emissive/i, /grill/i],
  },
  /* M3: phong5/phong2 = carpaint. chassis_chrome shares phong2 — exclude so kidney/grille stay black. */
  m3: {
    strict: true,
    include: [/phong5SG/i, /phong2SG/i],
    exclude: [/phong8SG/i, /phong3SG/i, /phong4SG/i, /phong6SG/i, /phong14SG/i, /phong11SG/i, /phong1SG/i, /phong7SG/i, /phong9SG/i, /phong10SG/i, /phong12SG/i, /phong13SG/i],
    meshExclude: [/chassischassis_chrome/i, /grille/i, /grill/i, /kidney/i, /niere/i, /(?:^|[^a-z])mesh(?:[^a-z]|$)/i],
    forceBlackMesh: [/chassischassis_chrome/i, /grille/i, /grill/i, /kidney/i, /niere/i],
    forceBlackMat: [/phong12SG/i, /phong13SG/i, /phong6SG/i],
  },
  'c63-ed507': {
    strict: true,
    include: [/Paint_Material/i],
    exclude: [/Coloured/i, /Base_/i, /Carbon/i, /Interior/i, /Window/i, /Grille/i, /Wheel/i, /Light/i, /Badge/i, /Engine/i, /Calliper/i, /Plate/i],
  },
  spark: {
    strict: true,
    include: [/^Carpaint$/i, /^CarPaint$/i],
    exclude: [/Plastic/i, /Chrome/i, /chassis/i, /glass/i, /Light/i, /mirror/i],
  },
};

function paintStoreAll() {
  try { return JSON.parse(localStorage.getItem(PAINT_LS_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function normalizePaintEntry(v) {
  if (typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v)) {
    return { hex: v.startsWith('#') ? v : '#' + v, finish: 'gloss' };
  }
  if (v && typeof v === 'object') {
    const hex = (typeof v.hex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v.hex))
      ? (v.hex.startsWith('#') ? v.hex : '#' + v.hex)
      : null;
    const finish = (v.finish === 'matte' || v.finish === 'satin' || v.finish === 'gloss') ? v.finish : 'gloss';
    return { hex, finish };
  }
  return { hex: null, finish: 'gloss' };
}
function getStoredPaintEntry(modelId) {
  const id = modelId || podiumModelId || state.carId;
  const s = paintStoreAll();
  return normalizePaintEntry(id ? s[id] : null);
}
function getStoredPaintHex(modelId) {
  return getStoredPaintEntry(modelId).hex;
}
function getStoredPaintFinish(modelId) {
  return getStoredPaintEntry(modelId).finish || 'gloss';
}
function setStoredPaintHex(hex, modelId) {
  const id = modelId || podiumModelId || state.carId;
  if (!id) return;
  const s = paintStoreAll();
  const prev = normalizePaintEntry(s[id]);
  const finish = prev.finish || 'gloss';
  if (!hex) {
    // keep finish preference even when color reset to stock
    s[id] = { hex: null, finish };
  } else {
    s[id] = { hex, finish };
  }
  try { localStorage.setItem(PAINT_LS_KEY, JSON.stringify(s)); } catch (_) {}
  paint.body = hex || null;
  paint.finish = finish;
}
function setStoredPaintFinish(finish, modelId) {
  const id = modelId || podiumModelId || state.carId;
  if (!id) return;
  const f = (finish === 'matte' || finish === 'satin') ? finish : 'gloss';
  const s = paintStoreAll();
  const prev = normalizePaintEntry(s[id]);
  s[id] = { hex: prev.hex, finish: f };
  try { localStorage.setItem(PAINT_LS_KEY, JSON.stringify(s)); } catch (_) {}
  paint.finish = f;
}

function isGlassMat(mat) {
  if (!mat) return true;
  const transmission = Number(mat.transmission || 0);
  const opacity = mat.opacity == null ? 1 : Number(mat.opacity);
  return !!(mat.transparent || mat.alphaMap || transmission > 0.01 || opacity < 0.999);
}

function meshSizeHint(mesh) {
  try {
    if (!mesh.geometry) return 0;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const r = mesh.geometry.boundingSphere?.radius || 0;
    return r * r;
  } catch (_) {
    return 0;
  }
}

function tokensHitSet(tokens, set) {
  for (const t of tokens) {
    if (set.has(t)) return true;
    // mild plurals already in set; also "light" vs token "lighting" avoided
  }
  return false;
}

function isPaintMeshExcluded(meshName) {
  if (/^PITLANE_plate/.test(meshName || '')) return true; // license plates never take body paint
  if (/seat.?belt|seatbelt/i.test(meshName || '')) return true;
  const ov = PAINT_MAT_OVERRIDES[podiumModelId || state.carId] || null;
  if (ov?.meshExclude?.some((re) => re.test(meshName || ''))) return true;
  return false;
}

function scoreBodyPaintMaterial(matName, meshName, mat, size) {
  const matTok = paintNameTokens(matName);
  const meshTok = paintNameTokens(meshName);
  const ov = PAINT_MAT_OVERRIDES[podiumModelId || state.carId] || null;
  let score = 0;

  if (isPaintMeshExcluded(meshName)) return -10000;

  if (ov) {
    if (ov.exclude?.some((re) => re.test(matName))) return -10000;
    if (ov.include?.some((re) => re.test(matName))) {
      // Explicit allow-list wins over generic skip tokens (e.g. bodykit_plast, Recycled*Paint)
      return 500 + (size >= 0.08 ? 20 : 0);
    }
    // strict: only the include list is paintable for this car
    if (ov.strict) return -10000;
  }

  // Skip tokens: material name is authoritative (mesh paths often contain "interior" junk)
  if (tokensHitSet(matTok, PAINT_SKIP_TOKENS)) return -10000;
  if (/textured/i.test(matName) && !/paint|colour|color|body/i.test(matName)) {
    return -10000;
  }

  if (isGlassMat(mat)) return -10000;
  if (mat.emissiveMap || (mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.2 && Number(mat.emissiveIntensity || 1) > 0.15)) {
    // glowing lights — skip unless named paint
    if (!PAINT_INCLUDE_RE.test(matName) && !tokensHitSet(matTok, PAINT_INCLUDE_TOKENS)) return -8000;
  }

  if (tokensHitSet(matTok, PAINT_INCLUDE_TOKENS) || PAINT_INCLUDE_RE.test(matName)) score += 120;
  // mesh name boost only for clean include tokens (ignore mesh skip pollution)
  if (tokensHitSet(meshTok, PAINT_INCLUDE_TOKENS)) score += 25;
  if (tokensHitSet(meshTok, PAINT_SKIP_TOKENS) && score < 100) score -= 40;

  const metal = mat.metalness != null ? Number(mat.metalness) : 0.25;
  const rough = mat.roughness != null ? Number(mat.roughness) : 0.45;
  let lum = 0.5;
  if (mat.color?.isColor) lum = 0.2126 * mat.color.r + 0.7152 * mat.color.g + 0.0722 * mat.color.b;

  // True chrome (mirror) — but Forza "Coloured" often has metal≈1 with paint albedo; allow if include scored
  if (metal >= 0.92 && rough <= 0.08 && score < 100) return -5000;
  if (lum < 0.03 && rough > 0.75 && score < 100) return -4000; // rubber

  // Size helps pick body panels among unknowns
  if (size >= 0.5) score += 30;
  else if (size >= 0.08) score += 12;
  else if (size < 0.01 && score < 100) score -= 20;

  // Prefer materials that look like lacquer (moderate/low roughness)
  if (rough >= 0.05 && rough <= 0.55) score += 8;
  if (mat.map || mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) score += 2;

  return score;
}

function collectBodyPaintMats() {
  if (!glbRoot) return [];
  const byMat = new Map(); // mat -> { score, size }
  glbRoot.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const size = meshSizeHint(o);
    mats.forEach((mat) => {
      if (!mat || !mat.color || !mat.color.isColor) return;
      const matName = mat.name || '';
      const sc = scoreBodyPaintMaterial(matName, o.name || '', mat, size);
      const prev = byMat.get(mat);
      if (!prev || sc > prev.score || (sc === prev.score && size > prev.size)) {
        byMat.set(mat, { score: sc, size });
      }
    });
  });
  const scored = [...byMat.entries()]
    .map(([mat, meta]) => ({ mat, score: meta.score, size: meta.size }))
    .filter((x) => x.score >= 80)
    .sort((a, b) => b.score - a.score || b.size - a.size);

  if (scored.length) return scored.map((x) => x.mat);

  // Fallback: largest opaque non-skip materials
  const fallback = [...byMat.entries()]
    .map(([mat, meta]) => ({ mat, score: meta.score, size: meta.size }))
    .filter((x) => x.score > -1000)
    .sort((a, b) => b.size - a.size);
  return fallback.slice(0, Math.max(1, Math.ceil(fallback.length * 0.35))).map((x) => x.mat);
}

function rememberPaintOrig(mat) {
  if (!mat.userData) mat.userData = {};
  if (mat.userData.__paintOrig) return;
  mat.userData.__paintOrig = {
    r: mat.color.r,
    g: mat.color.g,
    b: mat.color.b,
    map: mat.map || null,
    metalness: mat.metalness,
    roughness: mat.roughness,
    clearcoat: mat.clearcoat,
    clearcoatRoughness: mat.clearcoatRoughness,
    envMapIntensity: mat.envMapIntensity,
  };
}

function restorePaintOrig(mat) {
  const o = mat?.userData?.__paintOrig;
  if (!o || !mat.color) return;
  mat.color.setRGB(o.r, o.g, o.b);
  if ('map' in mat) mat.map = o.map || null;
  if (o.metalness != null && mat.metalness != null) mat.metalness = o.metalness;
  if (o.roughness != null && mat.roughness != null) mat.roughness = o.roughness;
  if (mat.isMeshPhysicalMaterial) {
    if (o.clearcoat != null) mat.clearcoat = o.clearcoat;
    if (o.clearcoatRoughness != null) mat.clearcoatRoughness = o.clearcoatRoughness;
  }
  if (o.envMapIntensity != null && mat.envMapIntensity != null) mat.envMapIntensity = o.envMapIntensity;
  mat.needsUpdate = true;
}

const PAINT_FINISH_PRESETS = {
  gloss: { roughness: 0.18, metalnessMax: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.08, envMin: 1.05 },
  satin: { roughness: 0.42, metalnessMax: 0.14, clearcoat: 0.25, clearcoatRoughness: 0.35, envMin: 0.9 },
  matte: { roughness: 0.72, metalnessMax: 0.08, clearcoat: 0, clearcoatRoughness: 0.6, envMin: 0.75 },
};

function currentPaintFinish() {
  const f = paint.finish || getStoredPaintFinish(podiumModelId || state.carId) || 'gloss';
  return (f === 'matte' || f === 'satin') ? f : 'gloss';
}

/** Solid lacquer: pure color replace — never multiply with original albedo map. */
function applySolidBodyColor(mat, color, finish) {
  rememberPaintOrig(mat);
  // MUST strip baseColor/albedo map (factory hue lives there on Forza atlases)
  mat.map = null;
  if ('vertexColors' in mat) mat.vertexColors = false;
  mat.color.copy(color);
  const fin = PAINT_FINISH_PRESETS[finish] || PAINT_FINISH_PRESETS.gloss;
  if (mat.metalness != null) {
    // Coloured/Paint atlases often ship metalness≈1; clamp to paint-like
    if (mat.metalness > 0.35) mat.metalness = Math.min(0.12, fin.metalnessMax);
    else mat.metalness = Math.min(mat.metalness, fin.metalnessMax);
  }
  if (mat.roughness != null) mat.roughness = fin.roughness;
  if (mat.isMeshPhysicalMaterial) {
    mat.clearcoat = fin.clearcoat;
    mat.clearcoatRoughness = fin.clearcoatRoughness;
  }
  if (mat.envMapIntensity != null) {
    mat.envMapIntensity = Math.max(fin.envMin, Number(mat.envMapIntensity) || fin.envMin);
  }
  mat.needsUpdate = true;
}

/** Keep kidney/grille/black trim from taking body paint (M3 chrome mesh, etc.). */
function forceBlackTrim() {
  if (!glbRoot) return;
  const ov = PAINT_MAT_OVERRIDES[podiumModelId || state.carId] || null;
  if (!ov?.forceBlackMesh?.length && !ov?.forceBlackMat?.length) return;
  glbRoot.traverse((o) => {
    if (!o.isMesh || isPitlanePlate(o)) return;
    const meshName = o.name || '';
    const forceMesh = !!(ov.forceBlackMesh && ov.forceBlackMesh.some((re) => re.test(meshName)));
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat) => {
      if (!mat || !mat.color || !mat.color.isColor) return;
      const forceMat = !!(ov.forceBlackMat && ov.forceBlackMat.some((re) => re.test(mat.name || '')));
      if (!forceMesh && !forceMat) return;
      mat.color.setRGB(0.02, 0.02, 0.02);
      if ('map' in mat) mat.map = null;
      if (mat.metalness != null) mat.metalness = Math.min(Number(mat.metalness) || 0.2, 0.35);
      if (mat.roughness != null) mat.roughness = Math.max(Number(mat.roughness) || 0.4, 0.45);
      if (mat.isMeshPhysicalMaterial) {
        mat.clearcoat = 0;
      }
      mat.needsUpdate = true;
    });
  });
}

function applyGlbBodyPaint(hex) {
  if (!glbRoot || typeof THREE === 'undefined') return;
  try { podiumInvalidate(600, true); } catch (_) {}
  const finish = currentPaintFinish();
  if (!hex) {
    glbRoot.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.__paintMatBackup !== undefined) {
        o.material = o.userData.__paintMatBackup;
        delete o.userData.__paintMatBackup;
      }
      const list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach((mat) => restorePaintOrig(mat));
    });
    try { forceBlackTrim(); } catch (_) {}
    return;
  }
  let color;
  try { color = new THREE.Color(hex); } catch (_) { return; }
  // Mesh walk + clone: shared Coloured on seatbelts must not receive body paint
  glbRoot.traverse((o) => {
    if (!o.isMesh) return;
    if (isPaintMeshExcluded(o.name || '')) return;
    const size = meshSizeHint(o);
    const isArr = Array.isArray(o.material);
    const mats = isArr ? o.material : [o.material];
    let mutated = false;
    const next = mats.map((mat) => {
      if (!mat || !mat.color || !mat.color.isColor) return mat;
      const sc = scoreBodyPaintMaterial(mat.name || '', o.name || '', mat, size);
      if (sc < 80) return mat;
      let dest = mat;
      if (!mat.userData.__isPaintClone) {
        dest = mat.clone();
        dest.name = mat.name || '';
        dest.userData.__isPaintClone = true;
        delete dest.userData.__paintOrig;
        rememberPaintOrig(dest);
        mutated = true;
      }
      applySolidBodyColor(dest, color, finish);
      dest.map = null; // re-verify solid replace strips albedo (no color mix)
      dest.color.copy(color);
      dest.needsUpdate = true;
      return dest;
    });
    if (mutated) {
      if (o.userData.__paintMatBackup === undefined) o.userData.__paintMatBackup = o.material;
      o.material = isArr ? next : next[0];
    } else {
      // finish change on already-cloned paint mats
      next.forEach((mat) => {
        if (mat?.userData?.__isPaintClone) {
          applySolidBodyColor(mat, color, finish);
          mat.map = null;
          mat.color.copy(color);
          mat.needsUpdate = true;
        }
      });
    }
  });
  try { forceBlackTrim(); } catch (_) {}
}

function syncPaintSwatches(hex) {
  const bar = document.getElementById('colorBar');
  if (!bar) return;
  const custom = document.getElementById('paintCustom');
  bar.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
  bar.querySelector('.paint-custom')?.classList.remove('on');
  if (!hex) {
    bar.querySelector('button[data-hex=""]')?.classList.add('on');
    return;
  }
  const want = hex.toLowerCase();
  let hit = false;
  bar.querySelectorAll('button[data-hex]').forEach((b) => {
    const h = (b.dataset.hex || '').toLowerCase();
    if (h && h === want) { b.classList.add('on'); hit = true; }
  });
  if (!hit && custom) {
    custom.value = want.startsWith('#') ? want : '#' + want;
    custom.closest('.paint-custom')?.classList.add('on');
  }
}

function syncPaintFinishUI(finish) {
  const bar = document.getElementById('paintFinish');
  if (!bar) return;
  const f = (finish === 'matte' || finish === 'satin') ? finish : 'gloss';
  bar.querySelectorAll('button[data-finish]').forEach((b) => {
    const on = (b.dataset.finish || '') === f;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function applyStoredBodyPaint() {
  const entry = getStoredPaintEntry(podiumModelId || state.carId);
  paint.body = entry.hex;
  paint.finish = entry.finish || 'gloss';
  syncPaintSwatches(entry.hex);
  syncPaintFinishUI(paint.finish);
  applyGlbBodyPaint(entry.hex);
  try { applyPaint(); } catch (_) {}
}

function pickBodyPaint(hex) {
  const clean = hex ? (hex.startsWith('#') ? hex : '#' + hex) : null;
  setStoredPaintHex(clean, podiumModelId || state.carId);
  syncPaintSwatches(clean);
  syncPaintFinishUI(paint.finish || getStoredPaintFinish());
  applyGlbBodyPaint(clean);
  try { applyPaint(); } catch (_) {}
  try { hap(8); } catch (_) {}
}

function pickPaintFinish(finish) {
  setStoredPaintFinish(finish, podiumModelId || state.carId);
  syncPaintFinishUI(paint.finish);
  // Re-apply on current podium model without reload
  applyGlbBodyPaint(paint.body || getStoredPaintHex());
  try { hap(6); } catch (_) {}
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (!s) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}
function recolorSrc(src, bodyHex) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      const cnv = document.createElement('canvas');
      cnv.width = im.width;
      cnv.height = im.height;
      const ctx = cnv.getContext('2d');
      ctx.drawImage(im, 0, 0);
      if (!bodyHex) return resolve(src);
      const [tr, tg, tb] = hexToRgb(bodyHex);
      const [th, ts] = rgbToHsl(tr, tg, tb);
      const data = ctx.getImageData(0, 0, cnv.width, cnv.height);
      const d = data.data;
      const w = cnv.width, h = cnv.height;
      const sample = (x, y) => {
        const j = (y * w + x) * 4;
        return [d[j], d[j + 1], d[j + 2]];
      };
      const corners = [sample(2, 2), sample(w - 3, 2), sample(2, h - 3), sample(w - 3, h - 3)];
      const br = corners.reduce((s, c) => s + c[0], 0) / 4;
      const bg = corners.reduce((s, c) => s + c[1], 0) / 4;
      const bb = corners.reduce((s, c) => s + c[2], 0) / 4;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma < 26) continue;
        const dx = r - br, dy = g - bg, dz = b - bb;
        if (dx * dx + dy * dy + dz * dz < 48 * 48) continue;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        if (sat < 0.16) continue;
        if (luma > 210 && sat < 0.35) continue;
        if (b > r + 12 && b > g && luma < 160 && sat < 0.4) continue;
        const x = (i / 4) % w;
        const y = Math.floor((i / 4) / w);
        if (y > h * 0.72 && luma < 70) continue;
        const hsl = rgbToHsl(r, g, b);
        const rgb = hslToRgb(th, Math.max(ts, 0.35), hsl[2]);
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
      }
      ctx.putImageData(data, 0, 0);
      resolve(cnv.toDataURL('image/jpeg', 0.88));
    };
    im.src = src;
  });
}
function applyPaint() {
  const photo = document.getElementById('heroPhoto');
  const wheels = document.getElementById('heroWheels');
  const car = currentCar();
  if (!photo) return;
  photo.style.filter = 'none';
  if (car && car.wheels) {
    if (wheels) { wheels.src = car.wheels; wheels.style.display = 'block'; }
    const slug = paint.mb || 'polar-white';
    photo.src = './img/c63-body-' + slug + '.jpg';
    return;
  }
  if (wheels) wheels.style.display = 'none';
  const base = photo.dataset.orig || photo.src;
  if (!photo.dataset.orig) photo.dataset.orig = photo.src;
  if (!paint.body) { photo.src = base; return; }
  recolorSrc(base, paint.body).then((url) => { photo.src = url; });
}
document.querySelectorAll('#colorBar button').forEach((b) => {
  b.addEventListener('click', () => {
    paint.mb = b.dataset.paint || 'polar-white';
    const hex = b.dataset.hex || null;
    pickBodyPaint(hex || null);
  });
});
document.getElementById('paintCustom')?.addEventListener('input', (e) => {
  const v = e.target?.value;
  if (v) pickBodyPaint(v);
});
document.getElementById('paintCustom')?.addEventListener('change', (e) => {
  const v = e.target?.value;
  if (v) pickBodyPaint(v);
});
document.getElementById('paintFinish')?.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button[data-finish]');
  if (!btn) return;
  pickPaintFinish(btn.dataset.finish || 'gloss');
});
document.querySelectorAll('#wheelBar button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#wheelBar button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  });
});
function shiftCar(dir) {
  const list = garageList().length ? garageList() : CARS;
  const i = Math.max(0, list.findIndex((c) => c.id === state.carId));
  const nextId = list[(i + dir + list.length) % list.length].id;
  paint.wheel = null;
  selectActiveCar(nextId);
  try { applyStoredBodyPaint(); } catch (_) {}
}
document.getElementById('carPrev')?.addEventListener('click', () => shiftCar(-1));
document.getElementById('carNext')?.addEventListener('click', () => shiftCar(1));

const BODY_IMG = {
  sedan: './img/sil/sedan.svg',
  coupe: './img/sil/coupe.svg',
  wagon: './img/sil/wagon.svg',
  suv: './img/sil/suv.svg',
  gt: './img/sil/gt-wing.svg',
  'gt-coupe': './img/sil/gt-coupe.svg',
  super: './img/sil/super.svg',
  hyper: './img/sil/hyper.svg',
  hatch: './img/sil/hatch.svg',
  muscle: './img/sil/muscle.svg',
  ev: './img/sil/ev.svg',
};
function silForCar(c) {
  if (!c) return './img/sil/sedan.svg';
  if (c.side && c.side.includes('/sil/')) return c.side;
  const map = {
    gt3rs: 'gt-wing', cayman: 'gt-wing', turboS: 'gt-coupe', amggt: 'gt-coupe',
    m3: 'sedan', m5: 'sedan', c63: 'sedan',
    m4csl: 'coupe', gtr: 'coupe', supra: 'coupe',
    huracan: 'super', sf90: 'super', '296': 'super', r8: 'super',
    svj: 'hyper', rs6: 'wagon', golf: 'hatch', civic: 'hatch',
    mustang: 'muscle', teslap: 'ev',
  };
  return './img/sil/' + (map[c.id] || 'sedan') + '.svg';
}
const CATALOG = {
  BMW: {
    '3 Series': { years: [2019, 2020, 2021, 2022, 2023, 2024, 2025], engines: ['2.0 184 л.с.', '2.0 245 л.с.', 'M340i 374 л.с.'], body: 'sedan' },
    'M3 Competition': { years: [2021, 2022, 2023, 2024], engines: ['3.0 510 л.с.', '3.0 xDrive 510 л.с.'], body: 'sedan' },
    '4 Series Coupe': { years: [2021, 2022, 2023, 2024], engines: ['2.0 245 л.с.', 'M440i 374 л.с.'], body: 'coupe' },
    'M4 Competition': { years: [2021, 2022, 2023, 2024], engines: ['3.0 510 л.с.'], body: 'coupe' },
    'M4 CSL': { years: [2023], engines: ['3.0 550 л.с.'], body: 'coupe' },
    '5 Series': { years: [2018, 2019, 2020, 2021, 2022, 2023, 2024], engines: ['2.0 190 л.с.', '540i 333 л.с.'], body: 'sedan' },
    'M5 Competition': { years: [2021, 2022, 2023], engines: ['4.4 V8 625 л.с.'], body: 'sedan' },
    '7 Series': { years: [2020, 2021, 2022, 2023, 2024], engines: ['3.0 340 л.с.', '4.4 V8 530 л.с.'], body: 'sedan' },
    '8 Series Coupe': { years: [2020, 2021, 2022, 2023], engines: ['3.0 340 л.с.', '4.4 530 л.с.'], body: 'coupe' },
    'M8 Competition': { years: [2020, 2021, 2022, 2023], engines: ['4.4 V8 625 л.с.'], body: 'coupe' },
    'X3 M': { years: [2020, 2021, 2022, 2023], engines: ['3.0 510 л.с.'], body: 'suv' },
    'X5 M': { years: [2020, 2021, 2022, 2023, 2024], engines: ['4.4 V8 625 л.с.'], body: 'suv' },
    'X6 M': { years: [2019, 2020, 2021, 2022, 2023, 2024], engines: ['4.4 V8 575 л.с.', '4.4 V8 625 л.с.'], body: 'suv' },
    'X7': { years: [2020, 2021, 2022, 2023, 2024], engines: ['3.0 340 л.с.', '4.4 530 л.с.'], body: 'suv' },
  },
  Porsche: {
    '911 Carrera': { years: [2020, 2021, 2022, 2023, 2024], engines: ['3.0 385 л.с.', '3.0 450 л.с. S'], body: 'gt' },
    '911 GT3 RS': { years: [2022, 2023, 2024], engines: ['4.0 NA 525 л.с.'], body: 'gt' },
    '911 Turbo S': { years: [2021, 2022, 2023, 2024], engines: ['3.8 650 л.с.'], body: 'gt' },
    '718 Cayman GT4 RS': { years: [2022, 2023, 2024], engines: ['4.0 500 л.с.'], body: 'gt' },
    'Cayenne Turbo': { years: [2020, 2021, 2022, 2023], engines: ['4.0 V8 550 л.с.'], body: 'suv' },
    'Panamera Turbo S': { years: [2021, 2022, 2023], engines: ['4.0 V8 630 л.с.'], body: 'sedan' },
  },
  Lamborghini: {
    'Huracán STO': { years: [2021, 2022, 2023], engines: ['5.2 V10 640 л.с.'], body: 'super' },
    'Aventador SVJ': { years: [2019, 2020, 2021], engines: ['6.5 V12 770 л.с.'], body: 'hyper' },
  },
  Ferrari: {
    'SF90 Stradale': { years: [2020, 2021, 2022, 2023], engines: ['V8 hybrid 1000 л.с.'] },
    '296 GTB': { years: [2022, 2023, 2024], engines: ['V6 hybrid 830 л.с.'] },
  },
  Mercedes: {
    'C-Class': { years: [2019, 2020, 2021, 2022, 2023, 2024], engines: ['2.0 204 л.с.', 'C43 408 л.с.'], body: 'sedan' },
    'C63 S E Performance': { years: [2023, 2024, 2025], engines: ['2.0 hybrid 680 л.с.'], body: 'sedan' },
    'E-Class': { years: [2018, 2019, 2020, 2021, 2022, 2023], engines: ['2.0 197 л.с.', 'E53 435 л.с.'], body: 'sedan' },
    'S-Class': { years: [2021, 2022, 2023, 2024], engines: ['3.0 367 л.с.', 'S63 612 л.с.'], body: 'sedan' },
    'AMG GT Coupe': { years: [2019, 2020, 2021, 2022], engines: ['4.0 V8 476 л.с.', '4.0 585 л.с.'], body: 'coupe' },
    'AMG GT Black Series': { years: [2021, 2022], engines: ['4.0 V8 730 л.с.'], body: 'coupe' },
    'GLE 63': { years: [2021, 2022, 2023], engines: ['4.0 V8 612 л.с.'], body: 'suv' },
    'G63': { years: [2020, 2021, 2022, 2023, 2024], engines: ['4.0 V8 585 л.с.'], body: 'suv' },
  },
  Audi: {
    'A4': { years: [2019, 2020, 2021, 2022, 2023], engines: ['2.0 190 л.с.', '2.0 249 л.с.'], body: 'sedan' },
    'A6': { years: [2019, 2020, 2021, 2022, 2023], engines: ['2.0 245 л.с.', '3.0 340 л.с.'], body: 'sedan' },
    'RS6 Avant': { years: [2021, 2022, 2023, 2024], engines: ['4.0 V8 600 л.с.', '4.0 630 л.с.'], body: 'wagon' },
    'RS7': { years: [2021, 2022, 2023], engines: ['4.0 V8 600 л.с.'], body: 'sedan' },
    'Q8': { years: [2020, 2021, 2022, 2023], engines: ['3.0 340 л.с.', 'RS Q8 600 л.с.'], body: 'suv' },
    'R8 V10 Performance': { years: [2020, 2021, 2022, 2023], engines: ['5.2 V10 620 л.с.'], body: 'super' },
  },
  Nissan: { 'GT-R Nismo': { years: [2020, 2021, 2022, 2023], engines: ['3.8 twin-turbo 600 л.с.'] } },
  Toyota: { 'GR Supra': { years: [2020, 2021, 2022, 2023, 2024], engines: ['3.0 turbo 340 л.с.', '3.0 turbo 387 л.с.'] } },
  Ford: { 'Mustang Dark Horse': { years: [2024, 2025], engines: ['5.0 V8 500 л.с.'] } },
  Tesla: { 'Model S Plaid': { years: [2021, 2022, 2023, 2024], engines: ['tri-motor ~1020 л.с.'] } },
  Volkswagen: { 'Golf R': { years: [2021, 2022, 2023, 2024], engines: ['2.0 turbo 320 л.с.'] } },
  Honda: { 'Civic Type R': { years: [2023, 2024, 2025], engines: ['2.0 turbo 330 л.с.'] } },
};

function fillSelect(el, items) {
  if (!el) return;
  el.innerHTML = items.map((v) => `<option value="${v}">${v}</option>`).join('');
}
function syncWizard() {
  const brand = document.getElementById('wBrand')?.value;
  const models = brand ? Object.keys(CATALOG[brand] || {}) : [];
  fillSelect(document.getElementById('wModel'), models);
  const model = document.getElementById('wModel')?.value;
  const spec = brand && model ? CATALOG[brand][model] : null;
  const wSil = document.getElementById('wSil');
  if (wSil) wSil.src = (spec && BODY_IMG[spec.body]) || BODY_IMG.sedan || './img/sil/sedan.svg';
  fillSelect(document.getElementById('wYear'), (spec?.years || []).map(String));
  fillSelect(document.getElementById('wEngine'), spec?.engines || []);
}
function openWizard() {
  document.getElementById('emptyGarage')?.classList.add('hidden'); // wizard open
  document.getElementById('addWizard')?.classList.remove('hidden');
  document.querySelector('#view-garage .mycar')?.classList.add('hidden');
  fillSelect(document.getElementById('wBrand'), Object.keys(CATALOG));
  syncWizard();
}
document.getElementById('btnAddCar')?.addEventListener('click', openWizard);
document.getElementById('btnAddCar2')?.addEventListener('click', openWizard);
document.getElementById('wBrand')?.addEventListener('change', syncWizard);
document.getElementById('wModel')?.addEventListener('change', syncWizard);
document.getElementById('wCancel')?.addEventListener('click', () => {
  document.getElementById('addWizard')?.classList.add('hidden');
  applyCarUI();
});
document.getElementById('wSave')?.addEventListener('click', () => {
  const brand = document.getElementById('wBrand').value;
  const model = document.getElementById('wModel').value;
  const year = Number(document.getElementById('wYear').value);
  const engine = document.getElementById('wEngine').value;
  const spec = CATALOG[brand]?.[model] || {};
  const stock = CARS.find((c) => c.name === `${brand} ${model}` || c.name.endsWith(model));
  const hp = parseInt((engine.match(/(\d{3,4})\s*л/) || [])[1] || stock?.hp || 0, 10);
  const car = {
    id: 'mine-' + Date.now(),
    name: `${brand} ${model}`,
    cls: engine,
    year,
    trim: engine,
    side: BODY_IMG[spec.body] || BODY_IMG.sedan,
    wheels: model.includes('C63') ? './img/c63-wheels.png' : null,
    color: stock?.color || 0x888888,
    v0100: stock?.v0100 ?? null,
    v100200: stock?.v100200 ?? null,
    v200300: stock?.v200300 ?? null,
    v80120: stock?.v80120 ?? null,
    hp: hp || stock?.hp || 0,
    nm: stock?.nm || 0,
    kg: stock?.kg || 0,
    lap: stock?.lap || { track: 'moscow', time: '—' },
  };
  state.garage = garageList();
  state.garage.push(car);
  save();
  selectActiveCar(car.id, { skipPodium: true });
});

function shiftGarage(dir) {
  const list = garageList();
  if (!list.length) return;
  const i = Math.max(0, list.findIndex((c) => c.id === state.carId));
  selectActiveCar(list[(i + dir + list.length) % list.length].id);
}

function setScanStatus(text) {
  const el = document.getElementById('scanStatus');
  if (el) el.textContent = text || '';
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Flood-fill background from borders → transparent PNG, auto-crop, soft edges. */
function studioCut(img, thresh) {
  const maxW = 1280;
  const scale = Math.min(1, maxW / Math.max(img.width, 1));
  const w = Math.max(2, Math.round(img.width * scale));
  const h = Math.max(2, Math.round(img.height * scale));
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, w, h);
  const image = sctx.getImageData(0, 0, w, h);
  const d = image.data;
  const n = w * h;
  const bgMask = new Uint8Array(n); // 1 = background

  // median-ish background from border samples
  const samples = [];
  const pushPx = (x, y) => {
    const i = (y * w + x) * 4;
    samples.push([d[i], d[i + 1], d[i + 2]]);
  };
  for (let x = 0; x < w; x += Math.max(1, (w / 40) | 0)) {
    pushPx(x, 0); pushPx(x, h - 1);
  }
  for (let y = 0; y < h; y += Math.max(1, (h / 40) | 0)) {
    pushPx(0, y); pushPx(w - 1, y);
  }
  samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const mid = samples[samples.length >> 1] || [20, 20, 20];
  const br = mid[0], bg = mid[1], bb = mid[2];
  const tol = 8 + thresh * 1.35;

  const nearBg = (idx) => {
    const i = idx * 4;
    return colorDist(d[i], d[i + 1], d[i + 2], br, bg, bb) <= tol;
  };

  // flood from borders
  const stack = [];
  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (bgMask[idx]) return;
    if (!nearBg(idx)) return;
    bgMask[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
  for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % w;
    const y = (idx / w) | 0;
    tryPush(x + 1, y); tryPush(x - 1, y); tryPush(x, y + 1); tryPush(x, y - 1);
  }

  // dilate background once to eat fringe
  const dil = bgMask.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (bgMask[idx]) continue;
      if (bgMask[idx - 1] || bgMask[idx + 1] || bgMask[idx - w] || bgMask[idx + w]) {
        if (nearBg(idx)) dil[idx] = 1;
      }
    }
  }

  // alpha + feather
  for (let idx = 0; idx < n; idx++) {
    const i = idx * 4;
    if (dil[idx]) {
      d[i + 3] = 0;
      continue;
    }
    // edge soft: count bg neighbors
    const x = idx % w;
    const y = (idx / w) | 0;
    let bgN = 0;
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { bgN++; continue; }
        if (dil[ny * w + nx]) bgN++;
      }
    }
    if (bgN > 0) {
      const a = Math.max(0, 255 - bgN * 12);
      d[i + 3] = a;
    } else {
      d[i + 3] = 255;
    }
  }
  sctx.putImageData(image, 0, 0);

  // bbox of opaque pixels
  let minX = w, minY = h, maxX = 0, maxY = 0, solid = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = d[(y * w + x) * 4 + 3];
      if (a > 24) {
        solid++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (solid < n * 0.02) {
    // failed cut — return original contained jpeg
    return src.toDataURL('image/jpeg', 0.88);
  }
  const pad = Math.round(Math.max(w, h) * 0.03);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  // plate canvas: car + soft shadow under
  const outW = cw;
  const outH = Math.round(ch * 1.12);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  // shadow ellipse
  octx.save();
  octx.translate(outW / 2, outH * 0.92);
  octx.scale(1, 0.28);
  const grd = octx.createRadialGradient(0, 0, 4, 0, 0, outW * 0.42);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  octx.fillStyle = grd;
  octx.beginPath();
  octx.arc(0, 0, outW * 0.42, 0, Math.PI * 2);
  octx.fill();
  octx.restore();
  // car body
  octx.drawImage(src, minX, minY, cw, ch, 0, Math.round(outH * 0.02), cw, ch);
  return out.toDataURL('image/png');
}

let lastScanFile = null;
async function runScan(file) {
  if (!file) return;
  if (!garageList().length) {
    setScanStatus('Сначала добавь автомобиль в гараж');
    openWizard();
    return;
  }
  lastScanFile = file;
  const carId = state.carId || garageList()[0].id;
  state.carId = carId;
  setScanStatus('Вырезаю кузов…');
  document.getElementById('photoStage')?.classList.add('scanning');
  await new Promise((r) => requestAnimationFrame(() => r()));
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = URL.createObjectURL(file);
    });
    const thresh = Number(document.getElementById('scanThresh')?.value || 30);
    const cut = studioCut(img, thresh);
    state.scans = state.scans || {};
    state.scans[carId] = cut;
    save();
    applyCarUI();
    document.getElementById('photoStage')?.classList.add('has-cutout');
    /* photo hero retired */ setHeroMode('3d');
    setScanStatus('Кузов на стенде. Ползунок — если фон съел машину или остался.');
  } catch (err) {
    console.warn(err);
    setScanStatus('Не удалось обработать фото');
  } finally {
    document.getElementById('photoStage')?.classList.remove('scanning');
  }
}
document.getElementById('scanInput')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) void runScan(f);
});
document.getElementById('scanThresh')?.addEventListener('change', () => {
  if (lastScanFile) void runScan(lastScanFile);
});
document.getElementById('scanReset')?.addEventListener('click', () => {
  const id = state.carId;
  if (state.scans) delete state.scans[id];
  paint.mb = 'polar-white';
  save();
  applyCarUI();
});
document.getElementById('btnRemoveCar')?.addEventListener('click', () => {
  const id = state.carId;
  if (!id) return;
  if (state.scans) delete state.scans[id];
  state.garage = garageList().filter((c) => c.id !== id);
  state.carId = state.garage[0]?.id || null;
  save();
  applyCarUI();
});

document.getElementById('topStraightForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api.addStraight(currentCar().id, {
    name: String(fd.get('name')),
    car: currentCar().name,
    t: Number(fd.get('t')),
  });
  void renderTops();
  e.target.reset();
});

document.getElementById('topLapForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const min = Number(fd.get('min') || 0);
  const sec = Number(fd.get('sec') || 0);
  const trackId = document.getElementById('topTrackSelect').value;
  await api.addLap(trackId, {
    name: String(fd.get('name')),
    car: currentCar().name,
    t: `${min}:${sec.toFixed(2).padStart(5, '0')}`,
  });
  void renderTops();
  e.target.reset();
});

const I18N = {
  ru: {
    'nav.box':'Бокс','nav.dyno':'Паспорт','nav.run':'Замер','nav.lap':'Круг','nav.top':'Топ','nav.paddock':'Paddock','nav.park':'Парк',
    'garage.empty':'Гараж пуст','garage.hint':'Добавь свой автомобиль — марка, кузов, год, мотор.','garage.add':'Добавить автомобиль','garage.reset':'сброс',
    'run.title':'Замер','run.hint':'Нажми старт, почти остановись, разгоняйся. Когда скорость упадёт — замер сохранится.','run.start':'Старт',
    'dyno.title':'Паспорт динамики','dyno.hint':'Цифры разгона — только после своего заезда.','dyno.acc':'Разгон','dyno.mass':'Масса и отдача',
    'lap.title':'Круг','lap.track':'Трасса','lap.gps':'Круг по GPS','lap.sess':'Сессии','lap.start':'Старт круга','lap.finish':'Финиш круга',
    'top.title':'Топы','pad.title':'Paddock','pad.send':'Опубликовать','pad.ph':'Что сделал с машиной…','pad.empty':'Пока тихо. Напиши первый пост после входа.',
    'acc.title':'Аккаунт','acc.login':'Вход','acc.hint':'Аккаунт хранит ник, гараж и результаты в топах.','acc.in':'OK','acc.reg':'Получить код','acc.nick':'ник'
  },
  en: {
    'nav.box':'Box','nav.dyno':'Specs','nav.run':'Run','nav.lap':'Lap','nav.top':'Leaderboard','nav.paddock':'Paddock','nav.park':'Park',
    'garage.empty':'Garage is empty','garage.hint':'Add your car — make, body, year, engine.','garage.add':'Add car','garage.reset':'reset',
    'run.title':'Run','run.hint':'Tap start, almost stop, then accelerate. When speed drops the run is saved.','run.start':'Start',
    'dyno.title':'Dynamics sheet','dyno.hint':'Acceleration figures appear only after your own run.','dyno.acc':'Acceleration','dyno.mass':'Mass and output',
    'lap.title':'Lap','lap.track':'Track','lap.gps':'GPS lap','lap.sess':'Sessions','lap.start':'Start lap','lap.finish':'Finish lap',
    'top.title':'Leaderboards','pad.title':'Paddock','pad.send':'Post','pad.ph':'What did you do to the car…','pad.empty':'Quiet for now. Sign in and write the first post.',
    'acc.title':'Account','acc.login':'Sign in','acc.hint':'Keeps your nickname, garage and results in tops.','acc.in':'Sign in','acc.reg':'Sign up','acc.nick':'nickname'
  },
  zh: {
    'nav.box':'车库','nav.dyno':'参数','nav.run':'加速','nav.lap':'圈速','nav.top':'榜单','nav.paddock':'Paddock',
    'garage.empty':'车库是空的','garage.hint':'添加车辆：品牌、车身、年份、发动机。','garage.add':'添加车辆','garage.reset':'重置',
    'run.title':'加速测试','run.hint':'点开始，先几乎停住再加速。车速下降后成绩会保存。','run.start':'开始测试',
    'dyno.title':'动态档案','dyno.hint':'加速数据只在你自己测完后出现。','dyno.acc':'加速','dyno.mass':'重量与功率',
    'lap.title':'圈速','lap.track':'赛道','lap.gps':'GPS圈速','lap.sess':'记录','lap.start':'发车','lap.finish':'完圈',
    'top.title':'榜单','pad.title':'Paddock','pad.send':'发布','pad.ph':'你对车做了什么…','pad.empty':'还没有帖子。登录后发第一条。',
    'acc.title':'账户','acc.login':'登录','acc.hint':'手机号和密码。','acc.in':'登录','acc.reg':'注册','acc.nick':'昵称'
  },
  es: {
    'nav.box':'Box','nav.dyno':'Ficha','nav.run':'Medición','nav.lap':'Vuelta','nav.top':'Ranking','nav.paddock':'Paddock',
    'garage.empty':'Garaje vacío','garage.hint':'Añade tu coche: marca, carrocería, año, motor.','garage.add':'Añadir coche','garage.reset':'reset',
    'run.title':'Medición','run.hint':'Pulsa inicio, casi párate y acelera. Al bajar la velocidad se guarda.','run.start':'Iniciar',
    'dyno.title':'Ficha de dinámica','dyno.hint':'Las cifras de aceleración salen solo tras tu propia medición.','dyno.acc':'Aceleración','dyno.mass':'Masa y potencia',
    'lap.title':'Vuelta','lap.track':'Circuito','lap.gps':'Vuelta GPS','lap.sess':'Sesiones','lap.start':'Salida','lap.finish':'Meta',
    'top.title':'Clasificaciones','pad.title':'Paddock','pad.send':'Publicar','pad.ph':'Qué le hiciste al coche…','pad.empty':'Aún no hay posts. Entra y escribe el primero.',
    'acc.title':'Cuenta','acc.login':'Entrar','acc.hint':'Teléfono y contraseña.','acc.in':'Entrar','acc.reg':'Registro','acc.nick':'nick'
  }
};
function t(key) {
  const lang = localStorage.getItem('pitlane-lang') || 'ru';
  return (I18N[lang] || I18N.ru)[key] || (I18N.en[key] || key);
}
function applyI18n(lang) {
  const pack = I18N[lang] || I18N.ru;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = pack[el.dataset.i18n];
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const v = pack[el.dataset.i18nPlaceholder];
    if (v) el.setAttribute('placeholder', v);
  });
  document.documentElement.lang = lang;
}
const langSel = document.getElementById('langSelect');
if (langSel) {
  langSel.value = localStorage.getItem('pitlane-lang') || 'ru';
  applyI18n(langSel.value);
  langSel.onchange = () => {
    localStorage.setItem('pitlane-lang', langSel.value);
    applyI18n(langSel.value);
  };
}

function profile() {
  try { return JSON.parse(localStorage.getItem('pitlane-prof-v1') || '{}'); } catch { return {}; }
}
function saveProf(p) { localStorage.setItem('pitlane-prof-v1', JSON.stringify(p)); }
function loadProfUI() {
  const p = profile();
  const nick = document.getElementById('accNick');
  const img = document.getElementById('accAvatar');
  if (nick && document.activeElement !== nick) nick.value = p.nick || '';
  if (img && p.avatar) img.src = p.avatar;
}
document.getElementById('accNick')?.addEventListener('change', (e) => {
  const p = profile(); p.nick = e.target.value.trim(); saveProf(p);
});
document.getElementById('accAvatarIn')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { const p = profile(); p.avatar = r.result; saveProf(p); loadProfUI(); };
  r.readAsDataURL(f);
});
loadProfUI();

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function pulseWho() {
  return (profile()?.nick) || currentUser()?.nick || '';
}
async function renderPulse() {
  const feed = document.getElementById('pulseFeed');
  if (!feed) return;
  const rows = await api.listPulse();
  const myPid = accountPilotId();
  feed.innerHTML = rows.map((p) => {
    const likes = (p.likes || []).length;
    return `<article class="pulse-card" data-id="${esc(p.id)}">
      <header><b>${esc(p.who || 'Пилот')}</b><span>${new Date(p.at).toLocaleString('ru-RU')}</span></header>
      <p>${esc(p.text || '')}</p>
      ${p.img && /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(p.img)) ? `<img src="${esc(p.img)}" alt="">` : ''}
      <div class="pulse-actions">
        <button type="button" data-like="${esc(p.id)}">♥ ${likes}</button>
        ${(!p.pilotId || (myPid && p.pilotId === myPid)) ? `<button type="button" data-del="${esc(p.id)}">удалить</button>` : ''}
      </div>
    </article>`;
  }).join('') || '<p class="muted">пока тихо</p>';
}
function compressPulseImg(file) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, 900 / im.width);
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * s);
      c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    im.onerror = () => res(null);
    im.src = URL.createObjectURL(file);
  });
}
const pulseText = document.getElementById('pulseText');
pulseText?.addEventListener('input', () => {
  const n = pulseText.value.length;
  const el = document.getElementById('pulseCount');
  if (el) el.textContent = n + '/280';
});
document.getElementById('pulseSend')?.addEventListener('click', async () => {
  const msg = document.getElementById('pulseMsg');
  if (needLogin('Чтобы писать в Пэддок, войди.')) return;
  const text = (pulseText?.value || '').trim();
  if (text.length < 2) { if (msg) msg.textContent = 'Напиши хотя бы пару слов'; return; }
  let img = null;
  const f = document.getElementById('pulseImg')?.files?.[0];
  if (f) img = await compressPulseImg(f);
  await api.addPulse({
    id: 'p' + Date.now(),
    who: pulseWho(),
    text: text.slice(0, 280),
    img,
    at: Date.now(),
    likes: [],
    car: currentCar()?.name || '',
  });
  if (pulseText) pulseText.value = '';
  const cnt = document.getElementById('pulseCount');
  if (cnt) cnt.textContent = '0/280';
  const inp = document.getElementById('pulseImg');
  if (inp) inp.value = '';
  if (msg) msg.textContent = '';
  void renderPulse();
});
document.getElementById('pulseFeed')?.addEventListener('click', async (e) => {
  const like = e.target.closest('[data-like]');
  const del = e.target.closest('[data-del]');
  if (like) {
    if (needLogin('Лайк после входа')) return;
    await api.likePulse(like.dataset.like, pulseWho());
    void renderPulse();
  }
  if (del) {
    await api.delPulse(del.dataset.del, pulseWho());
    void renderPulse();
  }
});
document.querySelector('[data-view="pulse"]')?.addEventListener('click', renderPulse);

try { hydratePassportGpsFromGarage(); } catch (_) {}
void bootShareFromUrl();
try { renderCompare(); renderLaps(); renderTrackDays(); } catch (_) {}
try {
  ['comparePaywall', 'trackDayPaywall', 'lapListPaywall'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
  syncHeroModeUI();
} catch (_) {}
// periodic garage push when logged in
setInterval(() => {
  try {
    if (currentUser() && isRemoteApi() && getSessionToken() && (state.garage || []).length) {
      void api.putGarage({ cars: state.garage, carId: state.carId || null });
    }
  } catch (_) {}
}, 120000);


/* -------- PWA deep link / home-screen shortcuts -------- */
(function bootDeepLinkView() {
  const deep = getDeepLinkView();
  if (!deep.view) return;
  const apply = () => {
    try { goToView(deep.view); } catch (_) {}
    clearDeepLinkUrl();
  };
  // After DOM/nav wiring; intro already finished when skipIntro/view set
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(apply, 0));
  } else {
    setTimeout(apply, 0);
  }
})();

document.getElementById('btnOpenZamerPage')?.addEventListener('click', () => {
  location.href = './zamer.html';
});


document.getElementById('btnEnableImu')?.addEventListener('click', async () => {
  const tip = document.getElementById('imuTip');
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (tip) tip.textContent = r === 'granted'
        ? 'Датчики движения разрешены. Можно стартовать замер/круг.'
        : 'Доступ отклонён. На iOS: Настройки → Safari → Движение и ориентация.';
    } else if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (tip) tip.textContent = r === 'granted' ? 'Ориентация разрешена.' : 'Ориентация отклонена.';
    } else {
      if (tip) tip.textContent = 'Разрешение не требуется на этой платформе — IMU подхватится при замере.';
    }
    try { GpsFusion?.enableImu?.(); } catch (_) {}
  } catch (err) {
    if (tip) tip.textContent = 'Не удалось запросить разрешение: ' + (err?.message || err);
  }
});


/* -------- Duels / Challenge MVP -------- */
let _duelType = 'drag';
let _activeDuel = null;
let _pendingDuelId = null;
let _lastDuelCandidate = null;

function rememberDuelCandidateFromShare(payload) {
  if (!payload) return;
  const isLap = payload.type === 'lap' || payload.type === 'круг';
  const gpsQ = payload.gpsQ;
  if (gpsQ !== 'A' && gpsQ !== 'B') {
    _lastDuelCandidate = null;
    return;
  }
  if (payload.valid === false) {
    _lastDuelCandidate = null;
    return;
  }
  const cand = {
    type: isLap ? 'lap' : 'drag',
    trackId: null,
    trackName: payload.track || '',
    t: isLap ? String(payload.time || '') : Number(String(payload.time || '').replace(',', '.').replace(/[^\d.]/g, '')),
    car: payload.car || currentCar()?.name || '',
    gps: true,
    valid: true,
    gpsQ,
    avgAcc: payload.avgAcc,
    hz: payload.hz,
    weather: payload.weather || null,
    flags: [],
    name: payload.nick || duelPilotNick(),
    at: payload.at || Date.now(),
  };
  if (isLap) {
    // resolve trackId from name
    const tr = TRACKS.find((x) => x.name === payload.track || x.id === payload.track);
    cand.trackId = tr?.id || state.trackId || document.getElementById('trackSelect')?.value || TRACKS[0]?.id;
    if (!/^\d+:\d{2}/.test(String(cand.t))) {
      // time may be already m:ss
      cand.t = String(payload.time || '').trim();
    }
  } else {
    const n = Number(cand.t);
    if (!Number.isFinite(n) || n <= 0) {
      _lastDuelCandidate = null;
      return;
    }
    cand.t = Math.round(n * 1000) / 1000;
  }
  _lastDuelCandidate = cand;
  try { localStorage.setItem('pitlane-duel-last-v1', JSON.stringify(cand)); } catch (_) {}
}

function loadLastDuelCandidate() {
  if (_lastDuelCandidate) return _lastDuelCandidate;
  try {
    const raw = JSON.parse(localStorage.getItem('pitlane-duel-last-v1') || 'null');
    if (raw && (raw.gpsQ === 'A' || raw.gpsQ === 'B')) _lastDuelCandidate = raw;
  } catch (_) {}
  return _lastDuelCandidate;
}

function duelPilotNick() {
  return (profile()?.nick) || currentUser()?.nick || 'пилот';
}

/** Account uuid (p_…) when logged in, else device guest id — never a phone number. */
function duelPilotId() {
  try { return actingPilotId(); } catch (_) { return 'guest'; }
}

function duelPublicUrl(id) {
  return SHARE_ORIGIN + '?duel=' + encodeURIComponent(id);
}

function fillDuelTrackSelect() {
  const sel = document.getElementById('duelTrackSelect');
  if (!sel) return;
  const cur = state.trackId || document.getElementById('trackSelect')?.value || TRACKS[0]?.id;
  sel.innerHTML = TRACKS.map((tr) => `<option value="${esc(tr.id)}"${tr.id === cur ? ' selected' : ''}>${esc(tr.name)}</option>`).join('');
}

function setDuelType(type) {
  _duelType = type === 'lap' ? 'lap' : 'drag';
  document.querySelectorAll('[data-duel-type]').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-duel-type') === _duelType);
  });
  const wrap = document.getElementById('duelTrackWrap');
  if (wrap) wrap.hidden = _duelType !== 'lap';
}

function openDuelSheet(opts = {}) {
  const sheet = document.getElementById('duelSheet');
  if (!sheet) return;
  const nick = document.getElementById('duelNick');
  if (nick && !nick.value) nick.value = duelPilotNick();
  fillDuelTrackSelect();
  setDuelType(opts.type || _duelType || 'drag');
  if (opts.trackId) {
    const sel = document.getElementById('duelTrackSelect');
    if (sel) sel.value = opts.trackId;
  }
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  if (opts.duelId) {
    void showDuelView(opts.duelId);
  } else if (opts.createOnly) {
    document.getElementById('duelCreatePane').hidden = false;
    document.getElementById('duelViewPane').hidden = true;
  } else {
    document.getElementById('duelCreatePane').hidden = false;
    document.getElementById('duelViewPane').hidden = true;
  }
  void refreshDuelList();
}

function closeDuelSheet() {
  const sheet = document.getElementById('duelSheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
}

function statusLabelRu(st) {
  if (st === 'ready') return 'готово';
  if (st === 'expired') return 'истекла';
  return 'открыта';
}

function renderDuelSides(d) {
  const box = document.getElementById('duelSides');
  if (!box) return;
  const sides = [
    { key: 'creator', who: d.createdBy, run: d.creatorRun },
    { key: 'challenger', who: d.challenger, run: d.challengerRun },
  ];
  box.innerHTML = sides.map((s) => {
    const name = s.who?.name || (s.key === 'creator' ? 'создатель' : 'соперник');
    const run = s.run;
    const win = d.status === 'ready' && d.winner === s.key;
    const time = run ? (d.type === 'drag' ? (Number(run.t).toFixed(2) + ' с') : String(run.t)) : 'ждём заезд';
    const q = run?.gpsQ;
    const badge = q === 'A' ? '<span class="duel-badge">A</span>' : (q === 'B' ? '<span class="duel-badge b">B</span>' : '');
    const car = run?.car ? esc(run.car) : '—';
    return `<div class="duel-side${win ? ' win' : ''}"><div class="who">${esc(name)}${win ? ' · победа' : ''}</div><div class="time">${esc(time)}${badge}</div><div class="meta">${car}</div></div>`;
  }).join('');
}

async function showDuelView(id) {
  const d = await api.getDuel(id);
  if (!d || !d.id) {
    const hint = document.getElementById('duelHint');
    if (hint) hint.textContent = 'Дуэль не найдена или API недоступен.';
    return;
  }
  _activeDuel = d;
  document.getElementById('duelCreatePane').hidden = true;
  document.getElementById('duelViewPane').hidden = false;
  const trackName = d.trackId ? (TRACKS.find((x) => x.id === d.trackId)?.name || d.trackId) : '';
  const typeLab = d.type === 'lap' ? ('круг' + (trackName ? ' · ' + trackName : '')) : '0–100';
  const st = document.getElementById('duelStatusLine');
  if (st) st.textContent = statusLabelRu(d.status) + ' · ' + typeLab;
  const vs = document.getElementById('duelVsLine');
  if (vs) {
    const a = d.createdBy?.name || 'пилот';
    const b = d.challenger?.name || 'ожидание соперника';
    vs.textContent = a + '  vs  ' + b;
  }
  renderDuelSides(d);
  const res = document.getElementById('duelResult');
  if (res) {
    if (d.status === 'ready') {
      res.hidden = false;
      if (d.winner === 'tie') res.textContent = 'Ничья';
      else if (d.winner === 'creator') res.textContent = 'Победитель: ' + (d.createdBy?.name || 'создатель');
      else if (d.winner === 'challenger') res.textContent = 'Победитель: ' + (d.challenger?.name || 'соперник');
      else res.textContent = 'Результат';
    } else if (d.status === 'expired') {
      res.hidden = false;
      res.textContent = 'Срок истёк (7 дней)';
    } else {
      res.hidden = true;
      res.textContent = '';
    }
  }
  const note = document.getElementById('duelNoteView');
  if (note) {
    if (d.note) { note.hidden = false; note.textContent = d.note; }
    else { note.hidden = true; note.textContent = ''; }
  }
  const myId = duelPilotId();
  // v80: guest ids come back hashed (g_…) → isMyPilotId recognises raw + hashed forms
  const iAmCreator = d.createdBy?.id && (d.createdBy.id === myId || isMyPilotId(d.createdBy.id));
  const iAmChallenger = d.challenger?.id && (d.challenger.id === myId || isMyPilotId(d.challenger.id));
  const myRun = iAmCreator ? d.creatorRun : (iAmChallenger ? d.challengerRun : null);
  const submitBtn = document.getElementById('duelSubmitRun');
  if (submitBtn) {
    const locked = d.status === 'ready' || d.status === 'expired' || !!myRun;
    submitBtn.disabled = locked;
    submitBtn.textContent = myRun ? 'Заезд уже прикреплён' : 'Прикрепить мой заезд';
  }
  const hint = document.getElementById('duelHint');
  if (hint) {
    if (!isRemoteApi()) hint.textContent = 'Нужен Worker API (meta pitlane-api).';
    else if (d.status === 'open') hint.textContent = 'Нужен честный GPS A или B. C не принимается. Ссылка действует 7 дней.';
    else hint.textContent = 'Дуэль зафиксирована. C не может победить — такие заезды отклоняются.';
  }
}

async function refreshDuelList() {
  const ul = document.getElementById('duelList');
  if (!ul) return;
  const rows = await api.listMyDuels(duelPilotId());
  if (!rows || !rows.length) {
    ul.innerHTML = '<li><span class="dl-main">пока пусто — создай вызов</span><span class="dl-st">—</span></li>';
    return;
  }
  ul.innerHTML = rows.slice(0, 12).map((d) => {
    const typeLab = d.type === 'lap' ? 'круг' : '0–100';
    const title = typeLab + ' · ' + (d.createdBy?.name || 'пилот');
    return `<li data-duel-id="${esc(d.id)}"><span class="dl-main">${esc(title)}</span><span class="dl-st">${esc(statusLabelRu(d.status))}</span></li>`;
  }).join('');
}

async function createDuelFromUi() {
  if (!isRemoteApi()) {
    const hint = document.getElementById('duelHint');
    if (hint) hint.textContent = 'API не настроен — дуэль только онлайн.';
    return;
  }
  const nickEl = document.getElementById('duelNick');
  const nick = (nickEl?.value || '').trim() || duelPilotNick();
  if (nickEl) {
    const p = profile(); p.nick = nick; saveProf(p);
  }
  const note = (document.getElementById('duelNote')?.value || '').trim();
  const trackId = _duelType === 'lap' ? (document.getElementById('duelTrackSelect')?.value || TRACKS[0]?.id) : undefined;
  const duel = await api.createDuel({
    type: _duelType,
    trackId,
    createdBy: nick,
    name: nick,
    note: note || undefined,
  });
  if (!duel?.id) {
    const hint = document.getElementById('duelHint');
    if (hint) hint.textContent = 'Не удалось создать дуэль. Проверь сеть / Worker.';
    return;
  }
  try {
    const ids = JSON.parse(localStorage.getItem('pitlane-duels-mine-v1') || '[]');
    localStorage.setItem('pitlane-duels-mine-v1', JSON.stringify([duel.id, ...(Array.isArray(ids) ? ids : [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 40)));
  } catch (_) {}
  hap(18);
  await showDuelView(duel.id);
  // auto-attach last compatible run if matches type
  const cand = loadLastDuelCandidate();
  if (cand && cand.type === duel.type && (duel.type !== 'lap' || !duel.trackId || cand.trackId === duel.trackId)) {
    // leave manual attach — user taps button; optional auto:
  }
  try {
    await navigator.clipboard.writeText(publicLinkFor('duel_' + duel.id, duelPublicUrl(duel.id)));
  } catch (_) {}
  await refreshDuelList();
}

async function submitMyRunToActiveDuel() {
  const d = _activeDuel;
  if (!d?.id) return;
  let cand = loadLastDuelCandidate();
  if (!cand || cand.type !== d.type) {
    const hint = document.getElementById('duelHint');
    if (hint) hint.textContent = d.type === 'lap'
      ? 'Сначала проедь валидный круг A/B на этом треке, затем прикрепи.'
      : 'Сначала сделай валидный 0–100 (GPS A/B), затем прикрепи.';
    return;
  }
  if (d.type === 'lap' && d.trackId && cand.trackId && cand.trackId !== d.trackId) {
    const hint = document.getElementById('duelHint');
    if (hint) hint.textContent = 'Трек не совпадает с дуэлью.';
    return;
  }
  const body = {
    ...cand,
    name: duelPilotNick(),
    gps: true,
    valid: true,
    trackId: d.trackId || cand.trackId,
  };
  const res = await api.submitDuelRun(d.id, body);
  if (!res || res.error) {
    const hint = document.getElementById('duelHint');
    const err = res?.error || 'ошибка';
    if (hint) hint.textContent = 'Не принят: ' + err;
    if (res?.duel) await showDuelView(res.duel.id || d.id);
    return;
  }
  hap(20);
  await showDuelView(res.id || d.id);
  await refreshDuelList();
}

async function bootDuelFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const hash = location.hash || '';
    let id = params.get('duel') || '';
    const hm = hash.match(/[#&?]duel=([^&]+)/i);
    if (hm) id = decodeURIComponent(hm[1]);
    if (!id && hash.startsWith('#duel=')) id = decodeURIComponent(hash.slice(6));
    if (!id) return;
    _pendingDuelId = id;
    const apply = () => {
      openDuelSheet({ duelId: id });
    };
    // after intro: delay slightly so share boot doesn't conflict
    setTimeout(apply, 400);
  } catch (err) {
    console.warn('bootDuel', err);
  }
}

document.getElementById('btnDuelOpen')?.addEventListener('click', () => openDuelSheet());
document.getElementById('duelSheetClose')?.addEventListener('click', closeDuelSheet);
document.getElementById('duelSheet')?.addEventListener('click', (e) => {
  if (e.target?.id === 'duelSheet') closeDuelSheet();
});
document.querySelectorAll('[data-duel-type]').forEach((b) => {
  b.addEventListener('click', () => setDuelType(b.getAttribute('data-duel-type')));
});
document.getElementById('duelCreateBtn')?.addEventListener('click', () => { void createDuelFromUi(); });
document.getElementById('duelCopyLink')?.addEventListener('click', async () => {
  if (!_activeDuel?.id) return;
  if (isTMA) { await shareViaTelegram('duel_' + _activeDuel.id, duelPublicUrl(_activeDuel.id), 'PITLANE · вызов на дуэль'); return; }
  try {
    await navigator.clipboard.writeText(duelPublicUrl(_activeDuel.id));
    hap(16);
  } catch (_) {}
});
document.getElementById('duelSubmitRun')?.addEventListener('click', () => { void submitMyRunToActiveDuel(); });
document.getElementById('duelRefresh')?.addEventListener('click', async () => {
  if (_activeDuel?.id) await showDuelView(_activeDuel.id);
  await refreshDuelList();
});
document.getElementById('duelList')?.addEventListener('click', (e) => {
  const li = e.target?.closest?.('[data-duel-id]');
  if (!li) return;
  void showDuelView(li.getAttribute('data-duel-id'));
});
document.getElementById('duelPasteOpen')?.addEventListener('click', async () => {
  const raw = prompt('Вставь ссылку или id дуэли');
  if (!raw) return;
  let id = String(raw).trim();
  const m = id.match(/[?&#]duel=([^&]+)/i) || id.match(/duel\/([^/?#]+)/i);
  if (m) id = decodeURIComponent(m[1]);
  id = id.replace(/^.*duel=/i, '').split(/[&#\s]/)[0];
  if (!id) return;
  openDuelSheet({ duelId: id });
});
document.getElementById('shareCardDuel')?.addEventListener('click', () => {
  const p = _sharePayload;
  const isLap = p && (p.type === 'lap' || p.type === 'круг');
  try { rememberDuelCandidateFromShare(p); } catch (_) {}
  closeShareCard();
  openDuelSheet({
    type: isLap ? 'lap' : 'drag',
    trackId: isLap ? (TRACKS.find((x) => x.name === p?.track)?.id || state.trackId) : undefined,
    createOnly: true,
  });
});

void bootDuelFromUrl();

/* -------- Crews / Экипажи MVP -------- */
let _activeCrew = null;
let _pendingCrewId = null;

function crewPilotNick() {
  try {
    const p = profile?.() || {};
    if (p.nick) return String(p.nick);
  } catch (_) {}
  try {
    const u = currentUser?.();
    if (u?.nick) return String(u.nick);
  } catch (_) {}
  return 'пилот';
}

function crewPilotId() {
  try { return actingPilotId(); } catch (_) { return 'guest'; }
}

function crewPublicUrl(id) {
  const base = (typeof SHARE_ORIGIN === 'string' && SHARE_ORIGIN)
    ? SHARE_ORIGIN
    : (location.origin + location.pathname.replace(/\/[^/]*$/, '/'));
  const root = base.endsWith('/') ? base : (base + '/');
  return root + '?crew=' + encodeURIComponent(id);
}

function rememberCrewId(id) {
  if (!id) return;
  try {
    const key = 'pitlane-crews-mine-v1';
    const ids = JSON.parse(localStorage.getItem(key) || '[]');
    const next = [id, ...(Array.isArray(ids) ? ids : [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 20);
    localStorage.setItem(key, JSON.stringify(next));
  } catch (_) {}
}

function fillCrewTrackSelect() {
  const sel = document.getElementById('crewTrackSelect');
  if (!sel) return;
  const cur = state.trackId || document.getElementById('trackSelect')?.value || TRACKS[0]?.id;
  const cult = TRACKS.filter((t) => t.cult);
  const opts = cult.length ? cult : TRACKS;
  sel.innerHTML = opts.map((tr) => `<option value="${esc(tr.id)}"${tr.id === cur ? ' selected' : ''}>${esc(tr.name)}</option>`).join('');
}

function openCrewSheet(opts = {}) {
  const sheet = document.getElementById('crewSheet');
  if (!sheet) return;
  const nick = document.getElementById('crewNick');
  if (nick && !nick.value) nick.value = crewPilotNick();
  fillCrewTrackSelect();
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  if (opts.crewId) {
    void showCrewView(opts.crewId);
  } else {
    const createPane = document.getElementById('crewCreatePane');
    const viewPane = document.getElementById('crewViewPane');
    if (createPane) createPane.hidden = false;
    if (viewPane) viewPane.hidden = true;
  }
  void refreshCrewList();
}

function closeCrewSheet() {
  const sheet = document.getElementById('crewSheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
}

function fmtAvgLap(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  try { return fmtLapTime(ms); } catch (_) {
    const s = ms / 1000;
    const m = Math.floor(s / 60);
    const rest = (s - m * 60).toFixed(2).padStart(5, '0');
    return m + ':' + rest;
  }
}

async function showCrewView(id) {
  const crew = await api.getCrew(id);
  if (!crew || !crew.id) {
    const hint = document.getElementById('crewHint');
    if (hint) hint.textContent = 'Экипаж не найден или API недоступен.';
    return;
  }
  _activeCrew = crew;
  rememberCrewId(crew.id);
  const createPane = document.getElementById('crewCreatePane');
  const viewPane = document.getElementById('crewViewPane');
  if (createPane) createPane.hidden = true;
  if (viewPane) viewPane.hidden = false;
  const trackName = TRACKS.find((x) => x.id === crew.trackId)?.name || crew.trackId;
  const st = document.getElementById('crewStatusLine');
  if (st) st.textContent = crew.name;
  const meta = document.getElementById('crewMetaLine');
  if (meta) meta.textContent = trackName + ' · ' + (crew.memberCount || crew.members?.length || 0) + '/10 · код ' + (crew.inviteCode || '—');

  const board = await api.getCrewBoard(id);
  const badge = document.getElementById('crewBadgeRow');
  if (badge) {
    const n = board?.teamBadge ?? 0;
    const avg = fmtAvgLap(board?.teamAvgMs);
    badge.innerHTML = `<span class="crew-pill">A/B кругов: ${n}</span><span class="crew-pill">средний бест: ${esc(avg)}</span><span class="crew-pill">${esc(board?.month || '')}</span>`;
  }
  const list = document.getElementById('crewBoardList');
  const myId = crewPilotId();
  if (list) {
    const rows = board?.members || crew.members || [];
    if (!rows.length) {
      list.innerHTML = '<li><span class="rk">·</span><span class="tops-av"><span class="tops-av-ini">?</span></span><span><div class="who">пока пусто</div><div class="sub">ждите первый A/B круг</div></span><span class="tm">—</span></li>';
    } else {
      list.innerHTML = rows.map((m, i) => {
        const best = m.best;
        const time = best ? esc(best.time) : '—';
        const gq = best?.gpsQ ? `<span class="gq">${esc(best.gpsQ)}</span>` : '';
        const car = best?.car ? esc(best.car) : '';
        const me = (m.pilotId === myId || isMyPilotId(m.pilotId)) ? ' me' : '';
        const nick = m.nick || 'пилот';
        const av = topsAvatarHtml(nick, m.avatar || best?.avatar);
        return `<li class="${me}"><span class="rk">${i + 1}</span>${av}<span><div class="who">${esc(nick)}</div><div class="sub">${car || 'нет круга'}</div></span><span class="tm">${time}${gq}</span></li>`;
      }).join('');
    }
  }
  const hint = document.getElementById('crewHint');
  if (hint) {
    if (!isRemoteApi()) hint.textContent = 'Нужен Worker API (meta pitlane-api).';
    else hint.textContent = 'После круга A/B на треке экипажа результат попадает на борд автоматически.';
  }
  const joinHere = document.getElementById('crewJoinHere');
  if (joinHere) {
    const already = (crew.members || []).some((m) => m.pilotId === myId || isMyPilotId(m.pilotId));
    joinHere.disabled = already;
    joinHere.textContent = already ? 'Ты уже в экипаже' : 'Вступить в этот';
  }
}

async function refreshCrewList() {
  const ul = document.getElementById('crewList');
  if (!ul) return;
  const rows = await api.listMyCrews(crewPilotId());
  if (!rows || !rows.length) {
    ul.innerHTML = '<li><span class="dl-main">пока пусто — создай экипаж</span><span class="dl-st">—</span></li>';
    return;
  }
  ul.innerHTML = rows.slice(0, 12).map((c) => {
    const trackName = TRACKS.find((x) => x.id === c.trackId)?.name || c.trackId || '';
    const title = (c.name || 'экипаж') + (trackName ? ' · ' + trackName : '');
    const st = (c.memberCount || c.members?.length || 0) + '/10';
    return `<li data-crew-id="${esc(c.id)}"><span class="dl-main">${esc(title)}</span><span class="dl-st">${esc(st)}</span></li>`;
  }).join('');
}

async function createCrewFromUi() {
  if (!isRemoteApi()) {
    const hint = document.getElementById('crewHint');
    if (hint) hint.textContent = 'API не настроен — экипаж только онлайн.';
    return;
  }
  const name = (document.getElementById('crewName')?.value || '').trim();
  const nickEl = document.getElementById('crewNick');
  const nick = (nickEl?.value || '').trim() || crewPilotNick();
  if (nickEl) {
    try { const p = profile() || {}; p.nick = nick; saveProf(p); } catch (_) {}
  }
  if (!name) {
    const hint = document.getElementById('crewHint');
    if (hint) hint.textContent = 'Укажи название экипажа.';
    const createPane = document.getElementById('crewCreatePane');
    const viewPane = document.getElementById('crewViewPane');
    if (createPane) createPane.hidden = false;
    if (viewPane) viewPane.hidden = true;
    return;
  }
  const trackId = document.getElementById('crewTrackSelect')?.value || TRACKS[0]?.id;
  const crew = await api.createCrew({
    name,
    trackId,
    createdBy: nick,
    nick,
    pilotId: crewPilotId(),
  });
  if (!crew?.id) {
    const hint = document.getElementById('crewHint');
    const viewPane = document.getElementById('crewViewPane');
    if (viewPane) viewPane.hidden = false;
    if (hint) hint.textContent = 'Не удалось создать: ' + (crew?.error || 'сеть / Worker');
    return;
  }
  rememberCrewId(crew.id);
  hap(18);
  await showCrewView(crew.id);
  try { await navigator.clipboard.writeText(publicLinkFor('crew_' + crew.id, crewPublicUrl(crew.id))); } catch (_) {}
  await refreshCrewList();
}

async function joinCrewByCodeUi() {
  const code = (document.getElementById('crewJoinCode')?.value || '').trim();
  if (!code) return;
  const nick = (document.getElementById('crewNick')?.value || '').trim() || crewPilotNick();
  const res = await api.joinCrewByCode(code, { nick, pilotId: crewPilotId() });
  if (!res?.id) {
    const hint = document.getElementById('crewHint');
    const viewPane = document.getElementById('crewViewPane');
    if (viewPane) viewPane.hidden = false;
    if (hint) hint.textContent = 'Не удалось вступить: ' + (res?.error || 'код неверный');
    return;
  }
  rememberCrewId(res.id);
  hap(18);
  await showCrewView(res.id);
  await refreshCrewList();
}

async function joinActiveCrew() {
  const c = _activeCrew;
  if (!c?.id) return;
  const nick = (document.getElementById('crewNick')?.value || '').trim() || crewPilotNick();
  const res = await api.joinCrew(c.id, { nick, pilotId: crewPilotId() });
  if (!res?.id) {
    const hint = document.getElementById('crewHint');
    if (hint) hint.textContent = 'Не удалось вступить: ' + (res?.error || 'ошибка');
    return;
  }
  rememberCrewId(res.id);
  hap(16);
  await showCrewView(res.id);
  await refreshCrewList();
}

async function pushCrewBestAfterLap(trackId, row) {
  if (!trackId || !row?.t) return;
  const q = row.gpsQ || row.gpsQ;
  if (q !== 'A' && q !== 'B') return;
  let crews = [];
  try { crews = await api.listMyCrews(crewPilotId()); } catch (_) { crews = []; }
  if (!Array.isArray(crews) || !crews.length) {
    try {
      const ids = JSON.parse(localStorage.getItem('pitlane-crews-mine-v1') || '[]');
      crews = (Array.isArray(ids) ? ids : []).map((id) => ({ id, trackId: null }));
    } catch (_) { return; }
  }
  for (const c of crews.slice(0, 8)) {
    if (!c?.id) continue;
    let track = c.trackId;
    if (!track) {
      try {
        const full = await api.getCrew(c.id);
        track = full?.trackId;
        if (full?.trackId) c.trackId = full.trackId;
      } catch (_) {}
    }
    if (track && track !== trackId) continue;
    try {
      await api.pushCrewBest(c.id, {
        ...row,
        trackId,
        gps: true,
        valid: true,
        gpsQ: q,
        nick: crewPilotNick(),
        name: crewPilotNick(),
        pilotId: crewPilotId(),
      });
    } catch (_) {}
  }
}

async function bootCrewFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const hash = location.hash || '';
    let id = params.get('crew') || '';
    const hm = hash.match(/[#&?]crew=([^&]+)/i);
    if (hm) id = decodeURIComponent(hm[1]);
    if (!id && hash.startsWith('#crew=')) id = decodeURIComponent(hash.slice(6));
    if (!id) return;
    _pendingCrewId = id;
    setTimeout(() => openCrewSheet({ crewId: id }), 450);
  } catch (err) {
    console.warn('bootCrew', err);
  }
}


/* —— Session of the day + autodrome discovery —— */
let _sessionTodayCache = null;

async function renderSessionOfDay() {
  const titleEl = document.getElementById('sessionDayTitle');
  const dateEl = document.getElementById('sessionDayDate');
  const listEl = document.getElementById('sessionDayTops');
  const attEl = document.getElementById('sessionDayAtt');
  if (!titleEl || !listEl) return;

  let data = null;
  try {
    data = await api.getSessionToday();
  } catch (_) {
    data = null;
  }

  if (!data || !data.trackId) {
    const picked = pickSessionTrackClient();
    let rows = [];
    try {
      const all = await api.listLap(picked.trackId);
      rows = filterTopsToday(all, picked.date);
      rows.sort((a, b) => (parseLapMsClient(a.t) ?? 1e15) - (parseLapMsClient(b.t) ?? 1e15));
    } catch (_) {}
    data = {
      trackId: picked.trackId,
      title: picked.title,
      date: picked.date,
      source: 'client',
      tops: rows.slice(0, 15),
      attendees: [],
    };
  } else if (!Array.isArray(data.tops) || !data.tops.length) {
    // Worker returned track but empty tops — client may filter if timestamps exist locally/remotely
    try {
      const all = await api.listLap(data.trackId);
      const rows = filterTopsToday(all, data.date || moscowDateKeyClient());
      rows.sort((a, b) => (parseLapMsClient(a.t) ?? 1e15) - (parseLapMsClient(b.t) ?? 1e15));
      data = { ...data, tops: rows.slice(0, 15) };
    } catch (_) {}
  }

  _sessionTodayCache = data;
  const tr = TRACKS.find((t) => t.id === data.trackId);
  titleEl.textContent = data.title || tr?.name || data.trackId;
  if (dateEl) {
    const src = data.source === 'kv' ? ' · вручную' : (data.source === 'client' ? ' · офлайн' : '');
    dateEl.textContent = (data.date || moscowDateKeyClient()) + ' · топ дня A/B' + src;
  }
  const tops = Array.isArray(data.tops) ? data.tops : [];
  listEl.classList.add('tops-pilot-list');
  listEl.innerHTML = tops.length
    ? tops.map((r, i) => topsPilotRowHtml({
        rank: i + 1,
        name: r.name,
        avatar: r.avatar,
        sub: r.car || '',
        timeHtml: `${esc(String(r.t))}${topsGpsBadge(r)}`,
      })).join('')
    : '<li class="tp-empty"><span class="tp-who"><span class="tp-nick">пока нет кругов A/B за сегодня</span></span><span class="tp-time">—</span></li>';

  const atts = Array.isArray(data.attendees) ? data.attendees : [];
  if (attEl) {
    attEl.textContent = atts.length
      ? 'на месте: ' + atts.slice(0, 8).map((a) => a.nick).filter(Boolean).join(', ') + (atts.length > 8 ? '…' : '')
      : 'никто ещё не отметился';
  }
}

function sessionPilotNick() {
  try {
    const u = typeof currentUser === 'function' ? currentUser() : null;
    if (u?.nick) return String(u.nick).slice(0, 48);
  } catch (_) {}
  try {
    const n = localStorage.getItem('pitlane-nick') || localStorage.getItem('pitlane-duel-nick');
    if (n) return String(n).slice(0, 48);
  } catch (_) {}
  return '';
}

async function sessionCheckinClick() {
  let nick = sessionPilotNick();
  if (!nick) {
    nick = String(prompt('Твой ник для «я на месте»', 'пилот') || '').trim().slice(0, 48);
  }
  if (!nick) return;
  const res = await api.sessionCheckin({ nick, pilotId: (() => { try { return actingPilotId(); } catch (_) { return undefined; } })() });
  if (res && res.ok) {
    if (_sessionTodayCache) _sessionTodayCache.attendees = res.attendees || [];
    await renderSessionOfDay();
    try { hap(18); } catch (_) {}
  } else {
    alert(res?.error || 'Не удалось отметиться. Нужен Worker.');
  }
}

function openSessionTrack() {
  const id = _sessionTodayCache?.trackId;
  if (!id) return;
  state.trackId = id;
  save();
  const sel = document.getElementById('trackSelect');
  const topSel = document.getElementById('topTrackSelect');
  if (sel) {
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
  }
  if (topSel) {
    topSel.value = id;
    topSel.dispatchEvent(new Event('change'));
  }
  goToView('lap');
}

function openAutodromeSheet(focusId) {
  const sheet = document.getElementById('autodromeSheet');
  if (!sheet) return;
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  renderAutodromeList();
  if (focusId) showAutodromeDetail(focusId);
  else {
    document.getElementById('autodromeListPane')?.removeAttribute('hidden');
    document.getElementById('autodromeDetailPane')?.setAttribute('hidden', '');
  }
}

function closeAutodromeSheet() {
  const sheet = document.getElementById('autodromeSheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
}

function renderAutodromeList() {
  const ul = document.getElementById('autodromeList');
  if (!ul) return;
  const cult = cultTracksList();
  ul.innerHTML = cult.map((t) => {
    const info = AUTODROME_INFO[t.id] || {};
    const short = (info.blurb || t.corners || '').slice(0, 48);
    const meta = [t.km ? t.km + ' км' : '', t.ref ? 'реф ' + t.ref : ''].filter(Boolean).join(' · ');
    return `<li data-ad-id="${esc(t.id)}"><span class="dl-main">${esc(t.name)}</span><span class="dl-st">${esc(meta || short)}${(!meta && short.length >= 48) ? '…' : ''}</span></li>`;
  }).join('') || '<li><span class="dl-main">нет культовых треков</span></li>';
}

function showAutodromeDetail(id) {
  const t = TRACKS.find((x) => x.id === id);
  const info = AUTODROME_INFO[id] || {};
  const listPane = document.getElementById('autodromeListPane');
  const detail = document.getElementById('autodromeDetailPane');
  if (!detail || !t) return;
  listPane?.setAttribute('hidden', '');
  detail.removeAttribute('hidden');
  const nameEl = document.getElementById('autodromeDetailName');
  const bodyEl = document.getElementById('autodromeDetailBody');
  if (nameEl) nameEl.textContent = t.name;
  const km = t.km ? `${t.km} км` : '';
  const turns = t.turns ? `${t.turns} пов.` : '';
  const meta = [km, turns, t.ref ? `реф ${t.ref}` : ''].filter(Boolean).join(' · ');
  const site = info.site
    ? `<p class="ad-link"><a href="${esc(info.site)}" target="_blank" rel="noopener noreferrer">Официальный сайт</a></p>`
    : `<p class="tiny muted">Официальный сайт — уточняйте на сайте автодрома</p>`;
  bodyEl.innerHTML = `
    <p class="ad-meta">${esc(meta)}</p>
    <p class="ad-blurb">${esc(info.blurb || t.corners || 'Культовый автодром России.')}</p>
    <p class="ad-cfg"><strong>Конфигурации:</strong> ${esc(info.configs || 'уточняйте на месте')}</p>
    <p class="ad-buy"><strong>Сессии:</strong> ${esc(info.buy || 'уточняйте на сайте автодрома')}</p>
    ${site}
    <p class="tiny muted">Бронирование в Pitlane не встроено — только справочник.</p>
  `;
  const goBtn = document.getElementById('autodromeSelectBtn');
  if (goBtn) goBtn.dataset.trackId = id;
}


document.getElementById('btnCrewOpen')?.addEventListener('click', () => openCrewSheet());

document.getElementById('btnSessionGoTrack')?.addEventListener('click', () => openSessionTrack());
document.getElementById('btnSessionCheckin')?.addEventListener('click', () => { void sessionCheckinClick(); });
document.getElementById('btnSessionTrackInfo')?.addEventListener('click', () => {
  openPitHelp('session');
});
document.getElementById('btnAutodromesOpen')?.addEventListener('click', () => openAutodromeSheet());
document.getElementById('btnAutodromesLap')?.addEventListener('click', () => openAutodromeSheet());
document.getElementById('autodromeSheetClose')?.addEventListener('click', () => closeAutodromeSheet());
document.getElementById('autodromeBackBtn')?.addEventListener('click', () => {
  document.getElementById('autodromeDetailPane')?.setAttribute('hidden', '');
  document.getElementById('autodromeListPane')?.removeAttribute('hidden');
});
document.getElementById('autodromeList')?.addEventListener('click', (e) => {
  const li = e.target.closest('[data-ad-id]');
  if (!li) return;
  showAutodromeDetail(li.dataset.adId);
});
document.getElementById('autodromeSelectBtn')?.addEventListener('click', () => {
  const id = document.getElementById('autodromeSelectBtn')?.dataset?.trackId;
  if (!id) return;
  state.trackId = id;
  save();
  const sel = document.getElementById('trackSelect');
  const topSel = document.getElementById('topTrackSelect');
  if (sel) { sel.value = id; sel.dispatchEvent(new Event('change')); }
  if (topSel) { topSel.value = id; topSel.dispatchEvent(new Event('change')); }
  closeAutodromeSheet();
  goToView('lap');
});

document.getElementById('crewSheetClose')?.addEventListener('click', closeCrewSheet);
document.getElementById('crewSheet')?.addEventListener('click', (e) => {
  if (e.target?.id === 'crewSheet') closeCrewSheet();
});
document.getElementById('crewCreateBtn')?.addEventListener('click', () => { void createCrewFromUi(); });
document.getElementById('crewJoinBtn')?.addEventListener('click', () => { void joinCrewByCodeUi(); });
document.getElementById('crewCopyLink')?.addEventListener('click', async () => {
  if (!_activeCrew?.id) return;
  if (isTMA) { await shareViaTelegram('crew_' + _activeCrew.id, crewPublicUrl(_activeCrew.id), 'PITLANE · вступай в экипаж'); return; }
  try { await navigator.clipboard.writeText(crewPublicUrl(_activeCrew.id)); hap(16); } catch (_) {}
});
document.getElementById('crewCopyCode')?.addEventListener('click', async () => {
  if (!_activeCrew?.inviteCode) return;
  try { await navigator.clipboard.writeText(String(_activeCrew.inviteCode)); hap(16); } catch (_) {}
});
document.getElementById('crewRefresh')?.addEventListener('click', async () => {
  if (_activeCrew?.id) await showCrewView(_activeCrew.id);
  await refreshCrewList();
});
document.getElementById('crewJoinHere')?.addEventListener('click', () => { void joinActiveCrew(); });
document.getElementById('crewList')?.addEventListener('click', (e) => {
  const li = e.target?.closest?.('[data-crew-id]');
  if (!li) return;
  void showCrewView(li.getAttribute('data-crew-id'));
});
document.getElementById('crewPasteOpen')?.addEventListener('click', async () => {
  const raw = prompt('Вставь ссылку, id или код экипажа');
  if (!raw) return;
  let id = String(raw).trim();
  const m = id.match(/[?&#]crew=([^&]+)/i) || id.match(/crew\/([^/?#]+)/i);
  if (m) {
    openCrewSheet({ crewId: decodeURIComponent(m[1]) });
    return;
  }
  if (/^[A-Za-z0-9]{4,12}$/.test(id) && !id.startsWith('c')) {
    const inp = document.getElementById('crewJoinCode');
    if (inp) inp.value = id.toUpperCase();
    openCrewSheet();
    void joinCrewByCodeUi();
    return;
  }
  id = id.replace(/^.*crew=/i, '').split(/[&#\s]/)[0];
  if (!id) return;
  openCrewSheet({ crewId: id });
});

void bootCrewFromUrl();


/* -------- Feature help (i) — reuse session-day «i» look -------- */
const FEATURE_HELP = {
  duel: {
    title: 'Дуэль',
    lines: [
      'Личный вызов 1 на 1: <strong>0–100</strong> или <strong>круг</strong> на выбранном треке.',
      '<strong>Как:</strong> создай дуэль → скопируй ссылку другу → оба прикрепляют свой валидный заезд GPS A/B. C не принимается.',
      '<strong>Где:</strong> Топы → «Дуэль». Список своих — внизу этого листа. Из карточки результата — «Вызвать на дуэль».',
    ],
  },
  crew: {
    title: 'Экипаж',
    lines: [
      'Команда <strong>3–10</strong> пилотов. Месячный борд — лучший валидный круг A/B на треке сезона экипажа.',
      '<strong>Как:</strong> создай экипаж или вступи по коду/ссылке. После круга A/B на треке экипажа результат попадает на борд сам.',
      '<strong>Где:</strong> Топы → «Экипаж». Код и ссылка — в карточке экипажа.',
    ],
  },
  autodrome: {
    title: 'Автодромы',
    lines: [
      'Справочник культовых колец России: длина, повороты, конфигурации, сайт.',
      '<strong>Как:</strong> открой трек в списке → «Выбрать этот трек» переключает Кольцо на него.',
      'Бронирование сессий в Pitlane не встроено — только справка.',
    ],
  },
  session: {
    title: 'Сессия дня',
    lines: [
      'Каждый день — один культовый трек. Здесь топ кругов за сегодня и чекин «Я на месте».',
      '<strong>Как:</strong> «Открыть трек» ведёт в Кольцо на этот автодром. «Я на месте» — короткая отметка, что ты на треке.',
      'Нужна карточка автодрома — кнопка ниже.',
    ],
    extra: 'session-track',
  },
  sectorBattle: {
    title: 'Sector Battle',
    lines: [
      'Личный разбор круга по секторам: этот круг vs твои лучшие секторы на этой трассе.',
      'Зелёный — быстрее PB сектора, красный — медленнее. «Оптимал» — сумма лучших секторов.',
      '<strong>Как:</strong> проедь 2+ валидных круга с секторами на выбранной трассе (экран Кольцо).',
    ],
  },
  sectorTops: {
    title: 'Топ секторов',
    lines: [
      'Публичный рейтинг по секторам трассы: фото, ник, время. Только GPS A/B.',
      '<strong>Как:</strong> выбери трассу и сектор (S1/S2/S3). Чтобы попасть — валидный круг с секторами.',
      '<strong>Где:</strong> Топы → «Секторы» или кнопка под Sector Battle.',
    ],
  },
};

function closePitHelp() {
  const sheet = document.getElementById('pitHelpSheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
}

function openPitHelp(key) {
  const data = FEATURE_HELP[key];
  const sheet = document.getElementById('pitHelpSheet');
  if (!data || !sheet) return;
  const title = document.getElementById('pitHelpTitle');
  const body = document.getElementById('pitHelpBody');
  const extra = document.getElementById('pitHelpExtra');
  if (title) title.textContent = data.title;
  if (body) {
    body.innerHTML = (data.lines || []).map((l) => `<p>${l}</p>`).join('');
  }
  if (extra) {
    if (data.extra === 'session-track') {
      extra.hidden = false;
      extra.innerHTML = '<button type="button" id="pitHelpOpenTrack">Об этом автодроме</button>';
      document.getElementById('pitHelpOpenTrack')?.addEventListener('click', () => {
        closePitHelp();
        const id = _sessionTodayCache?.trackId;
        if (id) openAutodromeSheet(id);
        else openAutodromeSheet();
      }, { once: true });
    } else {
      extra.hidden = true;
      extra.innerHTML = '';
    }
  }
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  try { hap(10); } catch (_) {}
}

document.getElementById('pitHelpClose')?.addEventListener('click', closePitHelp);
document.getElementById('pitHelpOk')?.addEventListener('click', closePitHelp);
document.getElementById('pitHelpSheet')?.addEventListener('click', (e) => {
  if (e.target?.id === 'pitHelpSheet') closePitHelp();
});
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('[data-help]');
  if (!btn) return;
  // session button has its own listener → skip double-open via bubble if already handled
  if (btn.id === 'btnSessionTrackInfo') return;
  const key = btn.getAttribute('data-help');
  if (key) openPitHelp(key);
});


/* -------- v80: Обратная связь (feedback sheet → Worker POST /feedback) -------- */
const APP_VERSION = 'v80';
const FB_MIN = 10;
const FB_MAX = 2000;
const FB_SHOT_MAX_SIDE = 1280;
const FB_SHOT_MAX_BYTES = 400 * 1024;
const _fb = { type: 'bug', openedAt: 0, shot: null, sending: false };

function showAppToast(text, ms = 2600) {
  const el = document.getElementById('appToast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(showAppToast._t);
  showAppToast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

async function swCacheVersion() {
  try {
    const keys = await caches.keys();
    return keys.find((k) => /^pitlane-v\d+$/.test(k)) || '';
  } catch (_) { return ''; }
}

async function feedbackDiag() {
  const active = document.querySelector('.view.active');
  let tgPlatform = '';
  try { tgPlatform = String(window.Telegram?.WebApp?.platform || ''); } catch (_) {}
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return {
    app: APP_VERSION,
    sw: await swCacheVersion(),
    ua: String(navigator.userAgent || '').slice(0, 300),
    tier: (typeof Q !== 'undefined' && Q && Q.tier) || '',
    tma: !!isTMA,
    tgPlatform: isTMA ? tgPlatform.slice(0, 24) : '',
    tab: active ? active.id.replace(/^view-/, '') : '',
    lang: String(document.documentElement.lang || navigator.language || '').slice(0, 5),
    screen: `${Math.round(screen.width)}x${Math.round(screen.height)}@${dpr}`,
    online: navigator.onLine !== false,
  };
}

function fbSetMsg(text, isErr) {
  const el = document.getElementById('fbMsg');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('err', !!isErr);
}

function fbUpdateCounter() {
  const ta = document.getElementById('fbText');
  const c = document.getElementById('fbCounter');
  if (!ta || !c) return;
  const n = [...ta.value.trim()].length;
  c.textContent = `${n} / ${FB_MAX}` + (n > 0 && n < FB_MIN ? ` · ещё ${FB_MIN - n}` : '');
  c.classList.toggle('bad', n > 0 && n < FB_MIN);
}

function fbSetType(type) {
  _fb.type = type;
  document.querySelectorAll('#feedbackSheet [data-fb-type]').forEach((b) => {
    const on = b.dataset.fbType === type;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function fbClearShot() {
  _fb.shot = null;
  const prev = document.getElementById('fbShotPreview');
  const clr = document.getElementById('fbShotClear');
  const inp = document.getElementById('fbShot');
  if (prev) { prev.hidden = true; prev.removeAttribute('src'); }
  if (clr) clr.hidden = true;
  if (inp) inp.value = '';
}

/** Any raster image → JPEG data URL, longest side ≤1280 px, ≤400 KB (quality/size stepped down). */
function fbDownscaleShot(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || '')) { reject(new Error('type')); return; }
    if (file.size > 25 * 1024 * 1024) { reject(new Error('big')); return; }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      try {
        let scale = Math.min(1, FB_SHOT_MAX_SIDE / Math.max(im.naturalWidth || 1, im.naturalHeight || 1));
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        for (let pass = 0; pass < 6; pass++) {
          c.width = Math.max(1, Math.round(im.naturalWidth * scale));
          c.height = Math.max(1, Math.round(im.naturalHeight * scale));
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(im, 0, 0, c.width, c.height);
          for (const q of [0.82, 0.7, 0.58, 0.46]) {
            const d = c.toDataURL('image/jpeg', q);
            const bytes = Math.floor(((d.length - d.indexOf(',') - 1) * 3) / 4);
            if (bytes <= FB_SHOT_MAX_BYTES) { URL.revokeObjectURL(url); resolve(d); return; }
          }
          scale *= 0.75;
        }
        URL.revokeObjectURL(url);
        reject(new Error('big'));
      } catch (err) { URL.revokeObjectURL(url); reject(err); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    im.src = url;
  });
}

function openFeedbackSheet() {
  const sheet = document.getElementById('feedbackSheet');
  if (!sheet) return;
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  _fb.openedAt = Date.now();
  fbSetMsg('');
  fbUpdateCounter();
  const contact = document.getElementById('fbContact');
  if (contact) {
    let logged = false;
    try { logged = !!accountPilotId(); } catch (_) {}
    contact.placeholder = logged ? '@telegram или e-mail (необязательно)' : '@telegram или e-mail — чтобы мы могли ответить';
  }
}

function closeFeedbackSheet() {
  const sheet = document.getElementById('feedbackSheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
}

async function sendFeedbackFromUi() {
  if (_fb.sending) return;
  const ta = document.getElementById('fbText');
  const text = (ta?.value || '').trim();
  const n = [...text].length;
  if (n < FB_MIN) { fbSetMsg(`Напишите хотя бы ${FB_MIN} символов.`, true); ta?.focus(); return; }
  if (n > FB_MAX) { fbSetMsg(`Слишком длинно: максимум ${FB_MAX} символов.`, true); return; }
  if (!isRemoteApi()) { fbSetMsg('Сервер недоступен — попробуйте позже.', true); return; }
  const btn = document.getElementById('fbSend');
  _fb.sending = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }
  fbSetMsg('');
  try {
    const payload = {
      type: _fb.type,
      text,
      contact: (document.getElementById('fbContact')?.value || '').trim().slice(0, 120),
      website: document.getElementById('fbWebsite')?.value || '',
      elapsedMs: Date.now() - (_fb.openedAt || Date.now()),
      screenshot: _fb.shot || undefined,
      diag: await feedbackDiag(),
    };
    const res = await api.sendFeedback(payload);
    if (res && res.ok) {
      hap(18);
      closeFeedbackSheet();
      if (ta) ta.value = '';
      const contact = document.getElementById('fbContact');
      if (contact) contact.value = '';
      fbClearShot();
      fbSetType('bug');
      showAppToast(res.queued ? 'Нет сети — отправим, когда появится интернет' : 'Спасибо! Мы прочитаем');
      return;
    }
    const st = res?.status;
    let msg = 'Не удалось отправить. Попробуйте ещё раз.';
    if (st === 429) msg = 'Слишком много сообщений. Попробуйте через час.';
    else if (st === 413 || res?.error === 'screenshot too large') msg = 'Скриншот слишком большой — уберите его или выберите другой.';
    else if (res?.error === 'text too short') msg = `Напишите хотя бы ${FB_MIN} символов.`;
    else if (res?.error === 'offline') msg = 'Нет сети, и очередь заполнена. Попробуйте позже.';
    fbSetMsg(msg, true);
  } catch (err) {
    console.warn('feedback send', err);
    fbSetMsg('Не удалось отправить. Попробуйте ещё раз.', true);
  } finally {
    _fb.sending = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Отправить'; }
  }
}

document.getElementById('btnFeedback')?.addEventListener('click', () => openFeedbackSheet());
document.getElementById('feedbackClose')?.addEventListener('click', () => closeFeedbackSheet());
document.getElementById('feedbackSheet')?.addEventListener('click', (e) => {
  if (e.target?.id === 'feedbackSheet') closeFeedbackSheet();
});
document.querySelectorAll('#feedbackSheet [data-fb-type]').forEach((b) => {
  b.addEventListener('click', () => fbSetType(b.dataset.fbType));
});
document.getElementById('fbText')?.addEventListener('input', () => { fbUpdateCounter(); fbSetMsg(''); });
document.getElementById('fbShotClear')?.addEventListener('click', () => fbClearShot());
document.getElementById('fbShot')?.addEventListener('change', async (e) => {
  const file = e.target?.files?.[0];
  if (!file) return;
  fbSetMsg('Готовим скриншот…');
  try {
    const d = await fbDownscaleShot(file);
    _fb.shot = d;
    const prev = document.getElementById('fbShotPreview');
    if (prev) { prev.src = d; prev.hidden = false; }
    const clr = document.getElementById('fbShotClear');
    if (clr) clr.hidden = false;
    fbSetMsg('');
  } catch (err) {
    fbClearShot();
    fbSetMsg(err?.message === 'type' ? 'Нужна картинка JPEG, PNG или WebP.' : 'Не удалось обработать скриншот.', true);
  }
});
document.getElementById('fbSend')?.addEventListener('click', () => { void sendFeedbackFromUi(); });
// offline queue: retry on reconnect and shortly after boot
window.addEventListener('online', () => {
  void api.flushFeedbackQueue().then((n) => { if (n) showAppToast('Отзыв отправлен — спасибо!'); });
});
setTimeout(() => { void api.flushFeedbackQueue(); }, 8000);
