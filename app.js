const DUELS_OFF = true; // v197: дуэли полностью убраны с сайта (код сервера не трогаем)
const TEAMS_OFF = true; // v198: команды/экипажи/комнаты убраны с сайта
import {
  isTMA, WebApp as TG, tmaInitData, tmaAtLeast, telegramDeviceClass, START_ROUTE, setupTmaChrome,
  setBackHandler, showBack, setClosingGuard, tmaHaptic, canOpenLocationSettings, openLocationSettings,
  tmaStartLink, tmaShare, keepAwake,
  tmaLocationReady, tmaGetLocation,
} from './tma.js';
/* v119: three.js + аддоны + номера (plates.js) — dynamic import при первой надобности (Бокс, chase Сочи).
 * На первом экране их нет. Тот же origin (importmap → ./vendor/three) — CSP script-src 'self' не трогаем. */
let THREE; let OrbitControls; let GLTFLoader; let RoomEnvironment; let Reflector; let RectAreaLightUniformsLib; let cloneSkinned;
let attachPitlanePlates; let isPitlanePlate = () => false;
/* v119: Leaflet (спутниковая карта HUD круга) — вставка <script>/<link> того же origin при первом заходе на «Круг» */
let _leafP = null;
function ensureLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
  if (!_leafP) {
    _leafP = new Promise((resolve, reject) => {
      const t0 = performance.now();
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = './vendor/leaflet/leaflet.css';
      document.head.appendChild(css);
      const sc = document.createElement('script');
      sc.src = './vendor/leaflet/leaflet.js'; sc.async = true;
      sc.onload = () => { try { (window.__plLazy = window.__plLazy || {}).leaflet = Math.round(performance.now() - t0); } catch (_) {} resolve(window.L); };
      sc.onerror = (e) => { _leafP = null; sc.remove(); reject(e); };
      document.head.appendChild(sc);
    });
  }
  return _leafP;
}
let _threeP = null;
function ensureThree() {
  if (THREE) return Promise.resolve(THREE);
  if (!_threeP) {
    const t0 = performance.now();
    _threeP = import('three').then((T) => { // v289: 3D-машины убраны; three нужен только chase-виду трассы
      THREE = T;
      try { (window.__plLazy = window.__plLazy || {}).three = Math.round(performance.now() - t0); } catch (_) {}
      return T;
    }).catch((err) => { _threeP = null; throw err; });
  }
  return _threeP;
}
import { createExtGps } from './ext-gps.js';
import { spring, countUp, flyShared, drawIn, reduced as motionReduced } from './motion.js'; // v160: движение
/* v120: блок показывается, только когда в нём есть хотя бы N записей (пустая таблица хуже отсутствующей) */
const SHOW_MIN = { leaders: 3, track: 1, sessionDay: 1, sectors: 3, season: 2 };
function showWhen(id, on) { const e = typeof id === 'string' ? document.getElementById(id) : id; if (e) e.hidden = !on || e.classList.contains('v123-off'); } // v123: скрытые блоки старой Главной не всплывают
import { TRACK_OUTLINES } from './geo/outlines.js';
import { analyzeSession, splitOutline, sectorTone } from './session-review.js';
import * as LB from './lap-battle.js';
import { saveGhostLocal, bestGhostLocal, markGhostUploaded, createRecorder, makeLineRef, createLineProgress, ghostTrack, deltaAt, deltaSeries, sectorGains, fmtDelta, encodeGhost } from './ghost.js';
import { flushRunQueue, runQueueSize } from './api.js';
import { api, apiBase, isRemoteApi, setSessionToken, getSessionToken, getRefreshToken, setReauthHandler, devicePilotId, accountPilotId, actingPilotId, isMyPilotId } from './api.js';
import { brandLogoEl, brandLogoKey, carDbById, carDbRowPhoto } from './car-db.js';
import { initCrewRooms, openRoomSheet, openMyCarSheet, requireCar, pushLapToActiveRoom, loadMyCar, refreshMyCarBar, ensureCarBeforeRun, syncMyCarAfterAuth, openQuickCarSheet, openCarPicker as openCarDbPicker, PREP_LABEL, TYRE_T_LABEL, classLine } from './crew-rooms.js';
import { initTeams, openTeamsList, openTeamPage, openTeamEditor } from './teams-ui.js';
// v207: подсказки удалены полностью
const tipsOnView = () => {};
import { musicList, renderMyMusic, initMusic, stopMusic } from './music-ui.js';
import { createChaseTracker } from './chase-match.js';
import { dragSplits as coreDragSplits } from './gps-core.js';
import { DisplaySpeed, REASON_RU } from './measure-engine.js';
import { brandOf, fillCarNameRow, carNameRow, flagUrl, COUNTRIES } from './car-brands.js';
import { GRID as RM_GRID, LABEL as RM_LABEL, DIST_KEYS as RM_DIST, createRunMarks, stepRunMarks, speedSeries, elevation as rmElevation, shareCurve, shareSplits, cleanCurve, cleanSplits, drawSpeedChart, chartTags } from './run-marks.js';
import { encodeTrace, dragTime as coreDragTime, traceStats, gradeTrace, DRAG_TOP_MIN_HZ, withSpeed as coreWithSpeed, launchTime as coreLaunchTime, speedCross as coreSpeedCross, distCross as coreDistCross } from './gps-core.js';
import { isCalibrated, trackCal } from './track-cal.js';
import { legalReady } from './legal-config.js';
import { computeAwards, rowBadge, framedAvatar, passFrame, passFrameSrc, PASS_FRAMES, carCropSrc, fmtGap, awardImg, renderShowcase, userCarPhoto, PH_ALT, carPhotoPick, setCarPhotoPick, helmet3d, renderPassCard, renderPassSheet, weekStart as awWeekStart, AWARDS as AW_LIST } from './awards.js'; // v192
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
  updateLapSatMapGps, updateLapSatMapGhost,
  trackOutlineQuality,
  paintSatSector, resetSatSectors,
} from './track-sat-map.js';

/* v147: в Telegram — тактильный отклик только на Старт/Стоп (замер и круг); остальное молча */
const HAP_KEYS = new Set(['h48Start', 'btnArm', 'runDriveStop', 'btnLapStart', 'btnLapArmedStart', 'btnLapStop', 'lapDriveEnd']);
let _hapKey = false;
function hap(ms = 12) {
  try { if (localStorage.getItem('pitlane-hap-off') === '1') return; } catch (_) {} // v166
  if (isTMA && !_hapKey) return;
  if (isTMA) {
    // Telegram HapticFeedback (navigator.vibrate is unavailable in iOS WebViews)
    const kind = Array.isArray(ms) ? (Math.max(...ms) >= 30 ? 'heavy' : 'medium') : (ms >= 18 ? 'medium' : (ms <= 10 ? 'select' : 'light'));
    if (tmaHaptic(kind)) return;
  }
  try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms); } catch (_) {}
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (isTMA) { if (!HAP_KEYS.has(b.id) || b.id === 'h48Start') return; _hapKey = true; /* v153: у «Старт» — один свой удар */ hap(18); setTimeout(() => { _hapKey = false; }, 0); return; }
  hap(10);
}, true);
if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
  document.documentElement.classList.add('standalone');
}

const CARS = [
  // BMW M2 Competition (G87) stock + widebody showcase — DIN/EU figures
  { id: 'g87-m2', name: 'BMW G87 M2 Widebody', cls: 'GT · RWD · 3.0 twin-turbo', year: 2026, trim: 'Competition · carbon widebody', side: './img/sil/coupe.svg', color: 0x1a1a1a, accent: 0x111, v0100: 3.9, v100200: null, v200300: null, v80120: 2.3, hp: 460, nm: 550, kg: 1725, lap: { track: 'nurb-nord', time: null }, glb: './models/g87-m2.glb' },
  { id: 'gt3rs', name: 'Porsche 911 GT3 RS', cls: 'GT · RWD · 4.0 NA', year: 2023, trim: '992 GT3 RS', side: './img/sil/gt-wing.svg', color: 0xeeeeee, accent: 0x111, v0100: 3.2, v100200: 10.6, v200300: null, v80120: 2.0, hp: 525, nm: 465, kg: 1450, lap: { track: 'nurb-nord', time: null }, glb: './models/gt3rs.glb' },
  { id: 'g63', name: 'Mercedes-AMG G 63', cls: 'SUV · AWD · 4.0 V8 biturbo', year: 2020, trim: 'W463 AMG', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: 4.5, v100200: null, v200300: null, v80120: 2.8, hp: 585, nm: 850, kg: 2485, lap: { track: 'nurb-nord', time: null }, glb: './models/g63.glb' },
  { id: 'mclaren-765lt', name: 'McLaren 765LT', cls: 'Super · RWD · 4.0 twin-turbo V8', year: 2021, trim: 'Longtail', side: './img/sil/super.svg', color: 0xff6600, accent: 0x111, v0100: 2.8, v100200: 6.5, v200300: 16.0, v80120: 1.7, hp: 765, nm: 800, kg: 1339, lap: { track: 'nurb-nord', time: null }, glb: './models/mclaren-765lt.glb' },
  { id: 'm3', name: 'BMW M3 Competition', cls: 'GT · RWD · 3.0 twin-turbo', year: 2023, trim: 'G80 Competition', side: './img/sil/sedan.svg', color: 0x8a1f1a, accent: 0x111, v0100: 3.5, v100200: 8.1, v200300: null, v80120: 2.1, hp: 510, nm: 650, kg: 1730, lap: { track: 'nurb-nord', time: null }, glb: './models/m3.glb' },
  { id: 'm4', name: 'BMW M4', cls: 'GT · RWD · 3.0 twin-turbo', year: 2021, trim: 'G82 Competition', side: './img/sil/coupe.svg', color: 0x8a1f1a, accent: 0x111, v0100: 3.5, v100200: 8.3, v200300: null, v80120: 2.1, hp: 510, nm: 650, kg: 1725, lap: { track: 'nurb-nord', time: null }, glb: './models/m4.glb' },
  { id: 'x6', name: 'BMW X6 xDrive40i', cls: 'SUV · AWD · 3.0 turbo', year: 2020, trim: 'G06 xDrive40i', side: './img/sil/suv.svg', color: 0x1a1a1a, accent: 0x111, v0100: 5.5, v100200: null, v200300: null, v80120: 3.4, hp: 340, nm: 450, kg: 2130, lap: { track: 'nurb-nord', time: null }, glb: './models/x6.glb' },
  { id: 'isf', name: 'Lexus IS-F', cls: 'GT · RWD · 5.0 V8', year: 2013, trim: 'USE20 IS-F', side: './img/sil/sedan.svg', color: 0xc5ccd3, accent: 0x111, v0100: 4.6, v100200: null, v200300: null, v80120: 2.9, hp: 423, nm: 505, kg: 1715, lap: { track: 'nurb-nord', time: null }, glb: './models/isf.glb' },
  { id: 'c63-ed507', name: 'Mercedes-AMG C 63 Edition 507', cls: 'GT · RWD · 6.2 V8', year: 2014, trim: 'W204 Edition 507', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: 4.2, v100200: null, v200300: null, v80120: 2.5, hp: 507, nm: 610, kg: 1730, lap: { track: 'nurb-nord', time: null }, glb: './models/c63-ed507.glb' },
  { id: 'spark', name: 'Chevrolet Spark GT', cls: 'City · FWD · 1.2', year: 2018, trim: 'GT 1.2 LT', side: './img/sil/hatch.svg', color: 0x1f4cff, accent: 0x111, v0100: 12.5, v100200: null, v200300: null, v80120: null, hp: 85, nm: 115, kg: 1085, lap: { track: 'nurb-nord', time: null }, glb: './models/spark.glb' },
  { id: 'm8', name: 'BMW M8 Competition Gran Coupe', cls: 'GT · AWD · 4.4 V8', year: 2022, trim: 'F93 Competition', side: './img/sil/sedan.svg', color: 0x1f2a4a, accent: 0x111, v0100: 3.2, v100200: null, v200300: null, v80120: null, hp: 625, nm: 750, kg: 1885, lap: { track: 'nurb-nord', time: null } },
  { id: 'bmw-g70', name: 'BMW 740i', cls: 'Lux · RWD · 3.0 turbo', year: 2023, trim: 'G70 740i', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: 5.4, v100200: null, v200300: null, v80120: null, hp: 380, nm: 520, kg: 2105, lap: { track: 'nurb-nord', time: null } },
  { id: 'gls63-x166', name: 'Mercedes-AMG GLS 63', cls: 'SUV · AWD · 5.5 V8 biturbo', year: 2016, trim: 'X166 AMG 4MATIC', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: 4.6, v100200: null, v200300: null, v80120: null, hp: 585, nm: 760, kg: 2580, lap: { track: 'nurb-nord', time: null } },
  { id: 'e63-w213', name: 'Mercedes-AMG E 63 S', cls: 'GT · AWD · 4.0 V8 biturbo', year: 2021, trim: 'W213 restyling 4MATIC+', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: 3.4, v100200: null, v200300: null, v80120: null, hp: 612, nm: 850, kg: 1955, lap: { track: 'nurb-nord', time: null } },
  { id: 'lc200', name: 'Toyota Land Cruiser 200', cls: 'SUV · AWD · 4.5 V8 diesel', year: 2012, trim: 'J200 4.5 D-4D', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: 8.6, v100200: null, v200300: null, v80120: null, hp: 235, nm: 615, kg: 2640, lap: { track: 'nurb-nord', time: null } },
  { id: 'camry-xv80', name: 'Toyota Camry Hybrid', cls: 'Sedan · FWD · 2.5 hybrid', year: 2024, trim: 'XV80 2.5 Hybrid', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: 225, nm: null, kg: 1650, lap: { track: 'nurb-nord', time: null } },
  { id: 'li-l9', name: 'LiXiang L9', cls: 'SUV · AWD · EREV', year: 2022, trim: 'L9 Max', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: 5.3, v100200: null, v200300: null, v80120: null, hp: 449, nm: 620, kg: 2520, lap: { track: 'nurb-nord', time: null } },
  { id: 'camry-xv70', name: 'Toyota Camry 2.5', cls: 'Sedan · FWD · 2.5', year: 2020, trim: 'XV70 2.5', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: 9.9, v100200: null, v200300: null, v80120: null, hp: 181, nm: 231, kg: 1555, lap: { track: 'nurb-nord', time: null } },
  { id: 'x7-g07', name: 'BMW X7 xDrive40i', cls: 'SUV · AWD · 3.0 turbo', year: 2023, trim: 'G07 LCI xDrive40i', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: 5.8, v100200: null, v200300: null, v80120: null, hp: 381, nm: 540, kg: 2390, lap: { track: 'nurb-nord', time: null } },
  /* v300: машины с фото Маги (вырезка birefnet) */
  { id: 'g63-w463', name: 'Mercedes-AMG G 63', cls: 'SUV · AWD · 5.5 V8 biturbo', year: 2015, trim: 'W463 AMG restyling', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: 5.4, v100200: null, v200300: null, v80120: null, hp: 544, nm: 760, kg: 2550, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'm5-f10', name: 'BMW M5', cls: 'GT · RWD · 4.4 V8 twin-turbo', year: 2014, trim: 'F10', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: null, nm: null, kg: null, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'm5-g90', name: 'BMW M5', cls: 'GT · AWD · 4.4 V8 hybrid', year: 2025, trim: 'G90 M5 xDrive', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: 3.5, v100200: null, v200300: null, v80120: null, hp: 727, nm: 1000, kg: 2435, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'gls-x167', name: 'Mercedes-Benz GLS', cls: 'SUV · AWD', year: 2020, trim: 'X167', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: null, nm: null, kg: null, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 's63-w222', name: 'Mercedes-AMG S 63', cls: 'Lux · AWD · 4.0 V8 biturbo', year: 2018, trim: 'W222 restyling 4MATIC+', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: 3.5, v100200: null, v200300: null, v80120: null, hp: 612, nm: 900, kg: 2070, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'cls-w218', name: 'Mercedes-Benz CLS', cls: 'GT', year: 2014, trim: 'W218', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: null, nm: null, kg: null, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'gle-coupe-c167', name: 'Mercedes-Benz GLE Coupe', cls: 'SUV · AWD', year: 2020, trim: 'C167', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: null, nm: null, kg: null, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'bmw-7-g12', name: 'BMW 7 Series', cls: 'Lux', year: 2020, trim: 'G12 LCI', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: null, nm: null, kg: null, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'panamera', name: 'Porsche Panamera', cls: 'GT', year: 2020, trim: '', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: null, nm: null, kg: null, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: '911-992-cabrio', name: 'Porsche 911 Cabriolet', cls: 'GT · 3.0 twin-turbo', year: 2020, trim: '992 Cabriolet', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: null, nm: null, kg: null, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'x5m-f95', name: 'BMW X5 M', cls: 'SUV · AWD · 4.4 V8 twin-turbo', year: 2020, trim: 'F95', side: './img/sil/suv.svg', color: 0x111111, accent: 0x111, v0100: 3.9, v100200: null, v200300: null, v80120: null, hp: 600, nm: 750, kg: 2310, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'amg-gt63-4d', name: 'Mercedes-AMG GT 4-Door Coupe', cls: 'GT · AWD · 4.0 V8 biturbo', year: 2019, trim: 'X290', side: './img/sil/sedan.svg', color: 0x111111, accent: 0x111, v0100: null, v100200: null, v200300: null, v80120: null, hp: null, nm: null, kg: null, lap: { track: 'nurb-nord', time: null }, photo300: true },
  { id: 'm5', name: 'BMW M5 Competition', cls: 'GT · AWD · 4.4 V8', year: 2022, trim: 'F90 Competition', side: './img/sil/sedan.svg', color: 0xb9bcc0, accent: 0x111, v0100: 3.3, v100200: 8.0, v200300: 21.0, v80120: 2.0, hp: 625, nm: 750, kg: 1890, lap: { track: 'nurb-nord', time: null } },
  { id: 'm4csl', name: 'BMW M4 CSL', cls: 'GT · RWD · 3.0 twin-turbo', year: 2023, trim: 'G82 CSL', side: './img/sil/coupe.svg', color: 0x8a1f1a, accent: 0x111, v0100: 3.7, v100200: 8.5, v200300: null, v80120: 2.2, hp: 550, nm: 650, kg: 1625, lap: { track: 'nurb-nord', time: null } },
  { id: 'gtr', name: 'Nissan GT-R Nismo', cls: 'GT · AWD · 3.8 twin-turbo', year: 2022, trim: 'R35 Nismo', side: './img/sil/coupe.svg', color: 0xc5ccd3, accent: 0x111, v0100: 2.7, v100200: 7.2, v200300: 16.8, v80120: 1.7, hp: 600, nm: 652, kg: 1720, lap: { track: 'nurb-nord', time: null } },
  { id: 'huracan', name: 'Lamborghini Huracán STO', cls: 'Super · RWD · 5.2 V10', year: 2021, trim: 'STO', side: './img/sil/super.svg', color: 0x1f4cff, accent: 0x111, v0100: 3.0, v100200: 8.0, v200300: 18.4, v80120: 1.8, hp: 640, nm: 565, kg: 1339, lap: { track: 'nurb-nord', time: null } },
  { id: 'svj', name: 'Lamborghini Aventador SVJ', cls: 'Super · AWD · 6.5 V12', year: 2019, trim: 'SVJ', side: './img/sil/hyper.svg', color: 0x1a6b3c, accent: 0x111, v0100: 2.8, v100200: 7.1, v200300: 16.7, v80120: 1.7, hp: 770, nm: 720, kg: 1525, lap: { track: 'nurb-nord', time: null } },
  { id: 'sf90', name: 'Ferrari SF90 Stradale', cls: 'Super · AWD · V8 hybrid', year: 2021, trim: 'Stradale', side: './img/sil/super.svg', color: 0xc41e3a, accent: 0x111, v0100: 2.5, v100200: 6.5, v200300: 15.2, v80120: 1.5, hp: 1000, nm: 800, kg: 1570, lap: { track: 'nurb-nord', time: null } },
  { id: '296', name: 'Ferrari 296 GTB', cls: 'Super · RWD · V6 hybrid', year: 2023, trim: 'GTB', side: './img/sil/super.svg', color: 0xc41e3a, accent: 0x111, v0100: 2.9, v100200: 7.6, v200300: 19.0, v80120: 1.8, hp: 830, nm: 740, kg: 1470, lap: { track: 'nurb-nord', time: null } },
  { id: 'amggt', name: 'Mercedes-AMG GT Black Series', cls: 'GT · RWD · 4.0 V8', year: 2021, trim: 'Black Series', side: './img/sil/gt-coupe.svg', color: 0x111111, accent: 0x111, v0100: 3.2, v100200: 8.0, v200300: 20.0, v80120: 1.9, hp: 730, nm: 800, kg: 1540, lap: { track: 'nurb-nord', time: null } },
  { id: 'c63', name: 'Mercedes-AMG C63 S E Performance', cls: 'GT · AWD · 2.0 hybrid', year: 2024, trim: 'W206 S', side: './img/sil/sedan.svg', wheels: './img/c63-wheels.png', color: 0x8a1f1a, accent: 0x111, v0100: 3.4, v100200: 8.4, v200300: null, v80120: 2.1, hp: 680, nm: 1020, kg: 2111, lap: { track: 'nurb-nord', time: null } },
  { id: 'rs6', name: 'Audi RS6 Avant', cls: 'GT · AWD · 4.0 V8', year: 2023, trim: 'C8 Performance', side: './img/sil/wagon.svg', color: 0xc5ccd3, accent: 0x111, v0100: 3.4, v100200: 8.4, v200300: 22.0, v80120: 2.1, hp: 630, nm: 850, kg: 2090, lap: { track: 'nurb-nord', time: null } },
  { id: 'r8', name: 'Audi R8 V10 Performance', cls: 'Super · AWD · 5.2 V10', year: 2022, trim: 'RWS / Perf.', side: './img/sil/super.svg', color: 0x1f4cff, accent: 0x111, v0100: 3.1, v100200: 8.2, v200300: 20.0, v80120: 1.9, hp: 620, nm: 580, kg: 1595, lap: { track: 'nurb-nord', time: null } },
  { id: 'cayman', name: 'Porsche 718 Cayman GT4 RS', cls: 'GT · RWD · 4.0 NA', year: 2022, trim: 'GT4 RS', side: './img/sil/gt-wing.svg', color: 0x39FF14, accent: 0x111, v0100: 3.4, v100200: 10.6, v200300: null, v80120: 2.1, hp: 500, nm: 450, kg: 1415, lap: { track: 'nurb-nord', time: null } },
  { id: 'turboS', name: 'Porsche 911 Turbo S', cls: 'GT · AWD · 3.8 twin-turbo', year: 2023, trim: '992 Turbo S', side: './img/sil/gt-coupe.svg', color: 0x111111, accent: 0x111, v0100: 2.6, v100200: 7.4, v200300: 18.8, v80120: 1.6, hp: 650, nm: 800, kg: 1640, lap: { track: 'nurb-nord', time: null } },
  { id: 'supra', name: 'Toyota GR Supra', cls: 'GT · RWD · 3.0 turbo', year: 2023, trim: 'A90 3.0', side: './img/sil/coupe.svg', color: 0xc41e3a, accent: 0x111, v0100: 4.1, v100200: 11.0, v200300: null, v80120: 2.6, hp: 387, nm: 500, kg: 1520, lap: { track: 'nurb-nord', time: null } },
  { id: 'golf', name: 'Volkswagen Golf R', cls: 'Hot hatch · AWD · 2.0 turbo', year: 2022, trim: 'Mk8 R', side: './img/sil/hatch.svg', color: 0x1f4cff, accent: 0x111, v0100: 4.6, v100200: 13.5, v200300: null, v80120: 3.1, hp: 320, nm: 420, kg: 1550, lap: { track: 'nurb-nord', time: null } },
  { id: 'civic', name: 'Honda Civic Type R', cls: 'Hot hatch · FWD · 2.0 turbo', year: 2023, trim: 'FL5', side: './img/sil/hatch.svg', color: 0xc41e3a, accent: 0x111, v0100: 5.4, v100200: 14.8, v200300: null, v80120: 3.4, hp: 330, nm: 420, kg: 1429, lap: { track: 'nurb-nord', time: null } },
  { id: 'mustang', name: 'Ford Mustang Dark Horse', cls: 'GT · RWD · 5.0 V8', year: 2024, trim: 'S650 Dark Horse', side: './img/sil/muscle.svg', color: 0x111111, accent: 0x111, v0100: 4.1, v100200: 11.2, v200300: null, v80120: 2.6, hp: 500, nm: 567, kg: 1768, lap: { track: 'nurb-nord', time: null } },
  { id: 'teslap', name: 'Tesla Model S Plaid', cls: 'EV · AWD · tri-motor', year: 2023, trim: 'Plaid', side: './img/sil/ev.svg', color: 0xc5ccd3, accent: 0x111, v0100: 2.1, v100200: 6.0, v200300: 15.0, v80120: 1.3, hp: 1020, nm: 1420, kg: 2162, lap: { track: 'nurb-nord', time: null } },
];

const TRACKS = [
  // cult: first-class RU tracks with verified-ish S/F in TRACK_GEO
  { id: 'sochi', name: 'Сочи Автодром', cult: true, km: '5.85', turns: '18' , corners: 'T2 — жёсткое торможение после прямой. T3 — длинный постоянный радиус. Финальная связка — медленные 90°.'},
  { id: 'moscow', name: 'Moscow Raceway', cult: true, km: '3.93', turns: '13' , corners: 'Длинная прямая в последний сектор. Средний сектор рулёжный. Несколько конфигураций срезают связки.'},
  { id: 'igora', name: 'Игора Драйв', cult: true, km: '5.18', turns: '20' , corners: 'Очень длинная С/Ф. Много средних поворотов против часовой. Перепад заметный на спуске.'},
  { id: 'kazan', name: 'Казань Ринг', cult: true, km: '3.48', turns: '12' , corners: 'Каньон: слепые вершины, уклоны до ~10%. Движение против часовой. Длинная прямая ~800 м.'},
  { id: 'smolensk', name: 'Смоленское кольцо', cult: true, km: '3.36', turns: '14' , corners: 'Техничное кольцо, средние радиусы, мало мест для отдыха.'},
  { id: 'nring', name: 'NRING Нижний Новгород', cult: true, km: '3.12', turns: '12' , corners: 'Короткое кольцо, плотная нарезка, мало времени на ошибку.'},
  { id: 'adm', name: 'ADM Raceway Мячково', cult: true, km: '3.25', turns: '16' , corners: 'Мячково: старое кольцо, короткие прямые, много направления.'},
  { id: 'grozny', name: 'Fort Grozny Autodrom', cult: true, km: '3.08', turns: '11' , corners: 'Крепость: относительно короткое GP, понятные зоны торможения.'},
  { id: 'redring', name: 'Красное Кольцо Красноярск', cult: true, km: '2.16', turns: '13' , corners: 'Компактное кольцо, меньше поворотов, акцент на ритм.'},
  { id: 'spb', name: 'Автодром Санкт-Петербург', km: '2.90', turns: '9' , corners: 'Городской/короткий профиль, тесные связки.'},
  { id: 'tlt', name: 'Тольятти Ринг', km: '2.96', turns: '10' , corners: 'Кольцо с средней длиной прямых.'},
  { id: 'lipetsk', name: 'Липецкий автодром', km: '2.87', turns: '8' , corners: 'Короткий автодром, стоп-энд-гоу.'},
  { id: 'auto-msk', name: 'Автодром Москва', km: '2.94', turns: '10' , corners: 'Городской автодром, смена направления часто.'},
  { id: 'neva', name: 'Нева Ринг', km: '2.88', turns: '9' , corners: 'Нева: средние дуги, мало ультрамедленных шпилек.'},
  { id: 'ufa', name: 'Уфа Ринг', km: '2.97', turns: '10' , corners: 'Региональное кольцо, ритм важнее пиковой скорости.'},
  { id: 'don', name: 'Донринг Ростов', km: '2.92', turns: '10' , corners: 'Донринг: смесь прямых и средних дуг.'},
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



/** v90: static premium track maps (img/track-maps/<id>-{full,thumb}.webp). */
function trackMapUrl(id, size) {
  const ok = TRACKS.some((t) => t.id === id);
  const tid = ok ? id : (TRACKS[0] && TRACKS[0].id) || 'sochi';
  const sz = size === 'thumb' ? 'thumb' : 'full';
  return './img/track-maps/' + tid + '-' + sz + '.webp';
}
function paintTrackMapImg(el, id, size, alt) {
  if (!el) return;
  const tid = id || 'sochi';
  el.replaceChildren();
  const im = document.createElement('img');
  im.src = trackMapUrl(tid, size);
  im.alt = alt || '';
  im.loading = 'lazy';
  im.decoding = 'async';
  im.className = 'tm-img tm-' + (size === 'thumb' ? 'thumb' : 'full');
  im.width = size === 'thumb' ? 480 : 1440;
  im.height = size === 'thumb' ? 320 : 960;
  el.appendChild(im);
  el.classList.add('has-tm');
  el.dataset.track = tid;
}

function drawTrack(id, elId, opts) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (elId === 'trackMap') setTimeout(() => { try { sochiChaseSync(); } catch (_) {} }, 0); // v96: chase follows the lap-card track
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
    + '<text x="16" y="4" fill="#C9C6BF" font-size="11" font-family="Golos Text,PL Sans,sans-serif" font-weight="700">С/Ф</text>'
    + '</g>';
  const car = live
    ? '<g id="lapCarMark" class="lap-car-mark" transform="translate(0,0) rotate(0)">'
      + '<circle class="lap-car-glow" r="16" cx="0" cy="0"/>'
      + '<polygon class="lap-car-chevron" points="0,-13 10,12 -10,12"/>'
      + '</g>'
    : '';
  // Autodrome layers: runoff apron → asphalt ribbon → curb dashes → muted racing line (v133)
  const join = ' stroke-linejoin="round" stroke-linecap="round"';
  const layers =
    '<path class="track-apron" d="' + d + '" fill="none" stroke="#2c2c2c" stroke-width="28"' + join + '/>'
    + '<path class="track-asphalt" d="' + d + '" fill="none" stroke="#1a1a1a" stroke-width="16"' + join + '/>'
    + '<path class="track-curb" d="' + d + '" fill="none" stroke="rgba(240,240,240,.22)" stroke-width="16" stroke-dasharray="3 9"' + join + '/>'
    + '<path class="track-edge" d="' + d + '" fill="none" stroke="rgba(201,198,191,.10)" stroke-width="10"' + join + '/>'
    + '<path class="track-line" d="' + d + '" fill="none" stroke="#C9C6BF" stroke-width="3.2"' + join + '/>';
  const svgInner = '<g class="track-scene">' + layers + sfMark + car + '</g>';
  const svg = '<svg viewBox="0 0 300 210" class="track-svg" ' + (live ? 'id="lapTrackSvg" ' : '')
    + 'preserveAspectRatio="xMidYMid meet">' + svgInner + '</svg>';
  if (live) {
    // reset smooth mapper when (re)drawing live HUD
    try { resetLapMapSmooth(id); } catch (_) {}
  }
  if (live) {
    el.innerHTML = '<div class="lap-map-inner lap-map-live">' + svg
      + '<p class="lap-map-cap"></p></div>';
    const cap = el.querySelector('.lap-map-cap');
    if (cap) {
      cap.appendChild(document.createTextNode(tr.name || ''));
      cap.appendChild(document.createElement('br'));
      const sm = document.createElement('small');
      sm.textContent = meta;
      cap.appendChild(sm);
    }
    return;
  }
  // v90: static premium map (webp). Keep SVG only for live HUD.
  const wrap = document.createElement('div');
  wrap.className = 'tm-static' + (compact ? ' tm-compact' : '');
  paintTrackMapImg(wrap, id, compact ? 'thumb' : 'full', tr.name || '');
  const cap = document.createElement('p');
  cap.className = 'tm-cap';
  cap.appendChild(document.createTextNode(tr.name || ''));
  if (meta) {
    cap.appendChild(document.createElement('br'));
    const sm = document.createElement('small');
    sm.textContent = meta;
    cap.appendChild(sm);
  }
  wrap.appendChild(cap);
  if (!compact && tr.corners) {
    const notes = document.createElement('p');
    notes.className = 'track-notes';
    notes.textContent = tr.corners;
    wrap.appendChild(notes);
  }
  el.replaceChildren(wrap);
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


/** v135: флаг страны марки справа от названия в Боксе (только флаг; логотипов/эмблем марок нет). */
function applyBoxFlag(name) {
  const f = document.getElementById('boxFlag'); if (!f) return;
  const b = brandOf(name);
  f.hidden = !b;
  if (!b) return;
  const c = COUNTRIES[b.cc] || ''; f.title = c; f.setAttribute('aria-label', c);
  const im = f.querySelector('img'); if (im && im.getAttribute('src') !== flagUrl(b)) im.src = flagUrl(b);
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
  applyBoxFlag(p.name);
  setTxt('boxTrim', p.trim || '');

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
  try { refreshMyCarBar(); } catch (_) {}
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
      // v107: в шапке — только свой замер; паспортное «сток» не выдаём за время (оно в карточке машины)
      const show = manual.v0100 ?? m.v0100 ?? null;
      setTxt('hdr0100', show != null ? fmt(show, 'с') : '');
      if (hdrEl) hdrEl.title = show != null ? 'ваш замер (не GPS A/B)' : (stockV != null ? `замера ещё нет · сток по паспорту ${fmtPassShort(stockV)}` : 'замера ещё нет');
    }
  }
  const track = TRACKS.find((t) => t.id === (state.trackId || c.lap?.track)) || TRACKS[0];
  const mine = bestLapDisplay(track.id);
  setTxt('sLap', mine || 'нет заезда');
  const hdrLap = document.getElementById('hdrLap');
  if (hdrLap) hdrLap.textContent = mine || '';
  // v127: пустые показатели в шапке не показываем (без прочерков)
  for (const id of ['hdr0100', 'hdrLap']) { const el = document.getElementById(id); if (el) el.parentElement.hidden = !el.textContent.trim() || el.textContent.trim() === '—'; }
  const trackRef = document.getElementById('trackRef');
  if (trackRef) trackRef.textContent = isCalibrated(track.id) ? 'калибрована' : 'не откалибрована · только личная история';
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
  if (fl.includes('teleport') || fl.includes('speed') || fl.includes('sim')) return false;
  if (simOnProd()) return false; // v89: simulator never writes to production tops
  const q = gq?.gpsQ || gq;
  const allowC = document.getElementById('topValidOnly')?.checked === false;
  if (q === 'A' || q === 'B') return true;
  if (q === 'C' && allowC) return true;
  return false;
}
// v89: these listeners used to sit inside canPublishTop (registered again on every publish check)
document.getElementById('topWeatherChips')?.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('.wx-chip');
  if (!btn?.dataset?.wx) return;
  setTopsWeatherFilter(btn.dataset.wx, { user: true });
  void renderTops();
});
document.addEventListener('click', (e) => {
  const b = e.target?.closest?.('.tops-gps');
  if (b?.dataset?.tip) {
    try { plFlash(b.dataset.tip); } catch (_) {} // v172: тост вместо системного alert
  }
});

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
  if (r.chip === 1) parts.push('подтверждено чипом PITLANE GPS'); // v231
  else if (r.src === 'phone' || r.cls === 'c') parts.push('замер телефоном');
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

/* v128: время суток по солнцу (данные метеосервиса); без данных погоды строка в этот фильтр не попадает */
let topsTodFilter = 'all'; // all | day | evening
function filterRowsByTod(rows) {
  if (topsTodFilter === 'all') return rows || [];
  const ok = topsTodFilter === 'day' ? ['morning', 'day'] : ['evening', 'night'];
  return (rows || []).filter((r) => r && r.wx && ok.includes(r.wx.tod));
}
document.getElementById('topTodChips')?.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('.wx-chip');
  if (!btn?.dataset?.tod) return;
  topsTodFilter = ['all', 'day', 'evening'].includes(btn.dataset.tod) ? btn.dataset.tod : 'all';
  document.querySelectorAll('#topTodChips .wx-chip').forEach((b) => b.classList.toggle('on', b.dataset.tod === topsTodFilter));
  void renderTops();
  try { void renderTopsBoard(); } catch (_) {}
  try { topsActiveLine(); } catch (_) {}
});

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
  // v106: кольцо по умолчанию — «Сухо» (не переключаем сами); подпись — какой бакет погоды показан
  if (!_topsWxAutoDone) setTopsWeatherFilter('dry');
  const wx = getTopsWeatherFilter();
  const cap = document.getElementById('topWeatherCaption');
  if (cap) {
    const WXN = { all: 'все погоды вместе', dry: 'сухо', damp: 'сыро', wet: 'мокро' };
    cap.textContent = 'Показаны круги: ' + WXN[wx] + '. Погода круга — бакет сухо / сыро / мокро по осадкам в момент финиша; круги в разную погоду не сравниваются.';
  }
  const lapRaw = (wx === 'all') ? lapAll : filterRowsByWeather(lapAll, wx);
  const sEl = document.getElementById('topStraight');
  if (sEl) {
    // straight: weather optional — show all (still store when present)
    const rows = filterTopRows(straightRaw).slice().sort((a, b) => a.t - b.t);
    sEl.innerHTML = rows.length ? rows.map((r, i) => `<li${/^p_[0-9a-f-]{36}$/.test(String(r.pilotId || '')) ? ` class="tp-link" data-pilot="${esc(r.pilotId)}" role="button" tabindex="0"` : ''}><span>${i + 1}. ${esc(r.name)} · ${esc(r.car)}</span><strong class="tops-time">${Number(r.t).toFixed(2)} с${topsGpsBadge(r)}</strong></li>`).join('') : '<li><span>пока нет валидных заездов</span><strong></strong></li>';
  }
  const lEl = document.getElementById('topLap');
  if (lEl) {
    const rows = filterTopRows(lapRaw);
    if (!rows.length) {
      lEl.innerHTML = '<li><span>пока нет валидных заездов</span><strong></strong></li>';
    } else {
      lEl.classList.add('tops-pilot-list');
      lEl.innerHTML = rows.map((r, i) => topsPilotRowHtml({
        rank: i + 1,
        name: r.name,
        avatar: r.avatar,
        sub: r.car,
        timeHtml: `${esc(String(r.t))}${topsGpsBadge(r)}`,
        pilotId: r.pilotId,
      })).join('');
      try { topsRise(lEl, 'lap:' + trackId + ':' + wx); } catch (_) {}
    }
  }
}
/* v153: если пилот поднялся в топе с прошлого просмотра — его строка «въезжает» со старого места на новое (FLIP, 500 мс) */
const TOPS_RANK_KEY = 'pitlane-tops-rank-v1';
function topsRise(listEl, key, { prevOverride } = {}) {
  const lis = [...listEl.children];
  const i = lis.findIndex((li) => li.dataset.pilot && isMyPilotId(li.dataset.pilot));
  if (i < 0) return null;
  let m = {}; try { m = JSON.parse(localStorage.getItem(TOPS_RANK_KEY) || '{}') || {}; } catch (_) {}
  const prev = prevOverride != null ? prevOverride : m[key];
  m[key] = i; try { localStorage.setItem(TOPS_RANK_KEY, JSON.stringify(m)); } catch (_) {}
  const li = lis[i]; li.classList.add('t53-me');
  if (!(Number.isFinite(prev) && prev > i)) return null;
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  li.classList.remove('t53-rise'); void li.offsetWidth; li.classList.add('t53-rise');
  setTimeout(() => li.classList.remove('t53-rise'), 1500);
  if (reduce || !li.animate) return { from: prev, to: i };
  const h = li.offsetHeight + (parseFloat(getComputedStyle(listEl).rowGap) || 0);
  const steps = Math.min(prev, lis.length - 1) - i;
  const ease = 'cubic-bezier(.2,.7,.2,1)';
  li.animate([{ transform: `translateY(${steps * h}px)` }, { transform: 'none' }], { duration: 500, easing: ease });
  for (let k = i + 1; k <= i + steps; k++) lis[k]?.animate([{ transform: `translateY(${-h}px)` }, { transform: 'none' }], { duration: 500, easing: ease });
  return { from: prev, to: i };
}
window.__topsRise = topsRise; // скриншоты/отладка

function syncTabPill(activeBtn) {
  const pill = document.getElementById('tabPill');
  const bar = document.getElementById('tabbar');
  if (!pill || !bar) return;
  // v120: вид без вкладки (Бокс, Paddock, профиль) — подсветку прячем
  if (!activeBtn || !activeBtn.classList.contains('nav-btn') || activeBtn.hidden || !activeBtn.getClientRects().length) { pill.style.opacity = '0'; return; }
  pill.style.opacity = '';
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

/* v161: все старые входы ведут в новые экраны: «run» (старый спидометр) → Замер, «cars» (Парк) → Гараж, «journal» → Журнал */
const VIEW_ALIAS61 = { home: 'zamer', run: 'zamer', cars: 'garage', journal: 'history', measure: 'zamer', track: 'lap' };
function goToView(id, opts = {}) {
  id = VIEW_ALIAS61[id] || id;
  if (id === 'garage') { try { openCarDbPicker(); } catch (_) {} return; } // v302: Гараж убран — выбор машины в каталоге
  if (id === 'pulse') { openChatPage(); return; } // v205: Чат — отдельная полноэкранная страница
  if (CP.open) closeChatPage({ instant: true }); // v262: смена вкладки — чат закрывается мгновенно, как обычный экран
  if (DUELS_OFF && id === 'duels') id = 'zamer';
  if (['duels', 'crews', 'crew', 'rooms', 'teams'].includes(id)) id = 'zamer'; // v206: убранные разделы // v197: дуэли убраны
  const next = document.getElementById('view-' + id);
  if (!next) return;
  try { if (typeof TGS !== 'undefined' && TGS.open) closeTgSheet({ instant: true }); } catch (_) {}
  const prev = document.querySelector('.view.active');
  const already = !!(prev && prev.id === 'view-' + id);

  // v84: «Заезд» tab covers both run + lap (data-alias); segment buttons inside the views stay in sync
  const nav = (opts.navBtn && opts.navBtn.classList.contains('nav-btn'))
    ? opts.navBtn
    : (document.querySelector(`.nav-btn:not(.nav-off)[data-view="${id}"]`) || document.querySelector(`.nav-btn:not(.nav-off)[data-alias~="${id}"]`));
  if (id === 'run' || id === 'lap') {
    document.querySelectorAll('.ride-seg [data-view]').forEach((b) => {
      const on = b.dataset.view === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  try { onViewEnter(id); } catch (_) {}
  // v96: Sochi chase-navigator renders only on «Круг» (or the live lap HUD); paused elsewhere
  try { sochiChase.curView = id; sochiChaseSync(); } catch (_) {}
  // v99: first-visit tip / first-launch tour
  try { tipsOnView(id); } catch (_) {}
  if (nav) activateNavBtn(nav);
  else {
    // v120: Бокс / Paddock / профиль — без вкладки в таббаре
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    syncTabPill(null);
  }

  // v83: Paddock feed renders on every entry (also ?view=pulse deep links, which used to show an empty feed)
  if (id === 'pulse') setTimeout(() => { try { void renderPulse(); } catch (_) {} }, 0);
  if (id === 'account') setTimeout(() => { try { void renderAwards92(); } catch (_) {} }, 0); // v192
  if (id === 'account') setTimeout(() => { try { void renderNotifyCard(); } catch (_) {} try { void renderFollowsCard(); } catch (_) {} try { void renderCarPhotoCard(); } catch (_) {} }, 0); // v121, v131, v132
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

  // v160: общий элемент — машина с Главной «перелетает» на подиум Гаража
  const fly60 = !reduce && prev && prev.id === 'view-home' && id === 'garage' ? document.getElementById('hwCarImg') : null;
  const fly60r = fly60 ? fly60.getBoundingClientRect() : null; // снимаем до смены экрана
  if (fly60) requestAnimationFrame(() => { try { flyShared({ el: fly60, rect: fly60r }, document.querySelector('#view-garage .g53-ph'), { dur: 520, ease: 'cubic-bezier(.45, 0, .2, 1)' }); } catch (_) {} }); // v161: дольше и ровнее — перелёт видно
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
/* v164: настройка «Графика» — Авто / Плавность / Баланс (по умолчанию) / Максимум. Ручной выбор фиксирует уровень (Q.locked). */
const GFX_KEY = 'pitlane-gfx-v1';
const GFX_TIER = { smooth: 'low', balance: 'medium', max: 'high' };
const GFX_LABEL = { auto: 'Авто', smooth: 'Плавность', balance: 'Баланс', max: 'Максимум' };
function gfxMode() { try { const v = localStorage.getItem(GFX_KEY); return GFX_LABEL[v] ? v : 'balance'; } catch (_) { return 'balance'; } }
const Q_KEY = 'pitlane-quality-v2'; // v164: новый ключ — сбрасывает ложный «low», записанный старым замером FPS (см. qMeasureStep)
const Q_TIERS = ['high', 'medium', 'low'];
const Q_STALE_MS = 7 * 24 * 3600 * 1000;
const Q_TARGET_FPS = 45;
const Q_PRESETS = {
  high: { dprCap: 3, maxFps: 0, idleFps: 0, aa: true, shadow: true, shadowRes: 0, shadowStatic: false, refl: 'full', reflEvery: 1, areaLights: true },
  medium: { dprCap: 2, maxFps: 60, idleFps: 60, aa: true, shadow: true, shadowRes: 1024, shadowStatic: true, refl: 'half', reflEvery: 2, areaLights: true },
  low: { dprCap: 1, maxFps: 60, idleFps: 30, aa: true, shadow: false, shadowRes: 0, shadowStatic: true, refl: 'off', reflEvery: 0, areaLights: true },
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
  { const m = gfxMode(); if (GFX_TIER[m]) { st.tier = GFX_TIER[m]; st.source = 'user:' + m; st.locked = true; return st; } } // v164: ручной выбор — без авто-понижения
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
/** v164: плотность пикселей 3D — родная (до 3× на iPhone) в пределах бюджета ~2,4 Мп на холст; карточка Гаража ~390×340 → 3× = 1,2 Мп. */
function q3dDpr() {
  const dev = window.devicePixelRatio || 1; let d = Math.min(dev, qPreset().dprCap);
  try { const w = canvas?.clientWidth || 390, h = canvas?.clientHeight || 340; d = Math.min(d, Math.sqrt(2.4e6 / Math.max(1, w * h))); } catch (_) {}
  return Math.max(1, Math.round(d * 100) / 100);
}
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
// v87: UI-класс слабого устройства — выключает backdrop-filter во всём интерфейсе
try { if (Q.tier === 'low') document.documentElement.classList.add('q-low'); } catch (_) {}

const canvas = document.getElementById('view3d');
/* v119: 3D-подиум строится лениво — при первом заходе в Бокс (three.js грузится dynamic import'ом, не на первом экране) */
let renderer = null, scene = null, camera = null, controls = null, key = null, fill = null, rim = null, rim2 = null, bounce = null, contactShadow = null, ringGlow = null, ring = null, car = null;
/* v163: шоурум — тёмный отражающий пол, мягкое пятно света, край пола растворяется в фоне (без постамента и колец) */
const SHOWROOM_BG = 0x000000;
let showroomGlow = null, showroomFade = null;
/** Радиальная альфа-текстура: stops = [[r 0..1, alpha 0..1], …] (белый цвет, альфа — по радиусу). */
function showroomRadialTex(stops, size = 256) {}
/** Для RingGeometry: UV идут по кругу, поэтому градиент — по радиусу через u/v от центра (как у CircleGeometry). inner = доля внутреннего радиуса. */
function showroomRingFadeTex(inner, size = 256) {}
function build3dScene() {}


let podiumIdleTimer = null;

/* Dark cinematic studio: soft key/fill + strong cool rims for body-line definition */
const shadowRes = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 1024 : 1536;

/* Soft ceiling softboxes — lights only, no visible lamp meshes */
const areaLights = [];

/* PMREM + Reflector deferred until intro ends — avoids main-thread jank on entry */
let floor = null;
let podiumEnvReady = false;
let introBlocking3d = true;
let podiumBooted = false;

function ensurePodiumEnv() {}

const REFL_RES_HIGH = Math.min(1024, Math.max(512, Math.floor(512 * Math.min(window.devicePixelRatio || 1, 1.75))));
let reflFrame = 0;
let reflForce = true;
function createPodiumReflector() {}

/* low tier: static matte-black floor instead of realtime mirror (same dark look, zero extra passes) */
let floorFlat = null;
function ensureFlatFloor() {}

/** Apply current Q.tier to renderer/scene. Safe to call repeatedly. */
function applyQualityTier(fromEnv = false) {}


/* Soft contact-shadow disk under the car (cinema stand) */

/* v133: muted accent ring (no neon halo) */
 // module-time: shadows / area lights / ring for the initial tier (podium env not built yet)

const moving = {};

function canvasTex(draw, size = 512) {}

function texLivery(hex) {}

function texCarbon() {}

function texTire() {}

function texRim() {}

function mat(color, extra = {}) {}

function wheel(wide = false) {}

function addMesh(geo, material, x, y, z, parent = car) {}

function buildCar(cfg) {}

function mkStoredDoors(root) {}

function paintCar(cfg) {}

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

function onResize() {}
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
function podiumInvalidate(ms = 0, hard = false) {}
function podiumShouldRun() { return false; }
function kickLoop() {}
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
function qMeasureReset() {}
function qMeasureStep(now, rendered) { return false; }

function podiumRender(now) {}

function tick(now) {}

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
    // v110: podium QA hooks (harness only): current model id, load model, orbit camera relative to the car (az 0 = front, 180 = rear)
    lite: () => (glbRoot && glbRoot.userData && glbRoot.userData.__lite175) || null,
    podiumModel: () => (glbRoot && glbRoot.userData && glbRoot.userData.__plateModel) || null,
    loadModel: (id) => { loadPodiumModel(id, 0); return true; },
    glass: (o) => { const m = liteGlassMat(); if (o) { Object.assign(m, o); m.needsUpdate = true; podiumInvalidate(300, true); } return { clearcoat: m.clearcoat, spec: m.specularIntensity, env: m.envMapIntensity, rough: m.roughness }; },
    card: () => ({ name: document.getElementById('g53Name')?.firstChild?.textContent || '', box: document.getElementById('boxName')?.textContent || '', model: (glbRoot && glbRoot.userData && glbRoot.userData.__plateModel) || null, pick: podiumModelId }),
    // v175: perf-QA — счётчики рендера и средний кадр (N принудительных рендеров), дамп мешей
    stats: (n = 20) => { if (!renderer || !scene || !camera) return null; renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera); const calls = renderer.info.render.calls, tris = renderer.info.render.triangles; renderer.info.autoReset = true; const gl = renderer.getContext(); renderer.render(scene, camera); gl.finish(); const t0 = performance.now(); for (let i = 0; i < n; i++) renderer.render(scene, camera); gl.finish(); return { calls, tris, ms: +((performance.now() - t0) / n).toFixed(2) }; },
    dump: () => { const r = []; if (glbRoot) glbRoot.traverse((o) => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; const g = o.geometry; const tri = g ? (g.index ? g.index.count : (g.attributes.position?.count || 0)) / 3 : 0; r.push({ n: o.name, p: o.parent?.name || '', m: ms.map((m) => m?.name || '').join('|'), tri: Math.round(tri), tr: ms.some((m) => m?.transparent), tx: ms.some((m) => (m?.transmission || 0) > 0.01), op: ms.map((m) => +(m?.opacity ?? 1).toFixed(2)).join('|'), vis: o.visible, lite: o.userData?.__lite175 || '' }); }); return r; },
    plateCount: () => { const r = {}; scene.traverse((o) => { if (/^PITLANE_plate_(front|rear)$/.test(o.name || '')) r[o.name] = (r[o.name] || 0) + 1; }); return r; },
    orbit: (azDeg = 180, elDeg = 10, dist = 6.2, ty = null, focus = null) => {
      if (!glbRoot) return false;
      controls.autoRotate = false;
      const yaw = glbRoot.rotation.y + (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
      if (ty != null) controls.target.y = ty;
      if (focus) { const f = glbRoot.getObjectByName(focus); if (f) f.getWorldPosition(controls.target); }
      const t = controls.target;
      camera.position.set(t.x + Math.sin(yaw) * Math.cos(el) * dist, t.y + Math.sin(el) * dist, t.z + Math.cos(yaw) * Math.cos(el) * dist);
      camera.lookAt(t); controls.update(); podiumInvalidate(600, true);
      return true;
    },
    driveInFrame: (ms, type = 'image/png') => {
      if (driveIn) { driveIn.seekT = ms; stepDriveIn(performance.now()); }
      controls.update(); podiumRender(performance.now());
      return canvas.toDataURL(type);
    },
  };
} catch (_) {}


const DEEP_VIEWS = new Set(['home', 'garage', 'run', 'lap', 'tops', 'pulse', 'account', 'cars', 'zamer', 'history', 'journal']); // v161: run/cars — алиасы новых экранов
/** v81: ?screen=duel|crew|feedback|autodromes — opens a sheet (used by the Telegram bot's web_app buttons). */
const DEEP_SCREENS = { shop: 'zamer', duel: 'tops', crew: 'tops', autodromes: 'tops', feedback: 'account', mycar: 'lap', rooms: 'tops', teams: 'tops' };
const SCREEN_PARAM = (() => {
  try {
    const s = String(new URLSearchParams(location.search).get('screen') || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(DEEP_SCREENS, s) ? s : '';
  } catch (_) { return ''; }
})();

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
    if (!view && SCREEN_PARAM) view = DEEP_SCREENS[SCREEN_PARAM];
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

/* v161: запуск в духе бортовой системы — волосок из центра, панели расходятся, слово PITLANE,
   шапка/навигация/контент разъезжаются по местам от центральной линии. ~1,1 с, раз за сессию, тап — пропустить,
   reduced-motion / слабое железо — без анимации. Заменяет старую заставку (#intro). */
const LN61 = { T: 1340, UI: 900 }; // v163: крупный знак держится ~0,8 с, затем панели расходятся (800 + 520 мс)
/* v301: приветствие по местному времени устройства под знаком PITLANE (строки — в карте для будущего перевода) */
const GREET_I18N = { ru: { morning: 'Доброе утро', day: 'Добрый день', evening: 'Добрый вечер', night: 'Доброй ночи' } };
function greetKey(h) { return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'day' : h >= 17 && h < 23 ? 'evening' : 'night'; }
function greetText(d = new Date(), lang = 'ru') {
  const t = (GREET_I18N[lang] || GREET_I18N.ru)[greetKey(d.getHours())];
  let n = ''; try { n = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || '').trim().slice(0, 24); } catch (_) {}
  return n ? t + ', ' + n : t;
}
try { const g = document.getElementById('lnGreet'); if (g) g.textContent = greetText(); } catch (_) {}
(function setupLaunch() {
  const el = document.getElementById('launch');
  const root = document.documentElement;
  if (!el) { introBlocking3d = false; return; }
  const KEY = 'pitlane-intro-seen';
  /* v162: «запуск» = новый запуск Mini App, а не «вкладка браузера». Telegram iOS/Android держит sessionStorage WebView между открытиями,
     поэтому флаг одной сессии навсегда глушил анимацию. Ключ запуска — подписанные launch-данные Telegram (auth_date + hash меняются
     при каждом открытии); в браузере — сессия вкладки, как раньше. */
  const launchId = (() => {
    try {
      if (isTMA && tmaInitData) { const q = new URLSearchParams(tmaInitData); return 'tg:' + (q.get('auth_date') || '') + ':' + String(q.get('hash') || q.get('signature') || q.get('query_id') || '').slice(0, 16); }
      if (isTMA) { // запуск с клавиатурной кнопки — без initData: новый запуск = новая навигация не со своих страниц
        const nav = performance.getEntriesByType?.('navigation')?.[0];
        const own = (() => { try { return !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (_) { return false; } })();
        return (nav && nav.type !== 'navigate') || own ? 'tg:same' : 'tg:nav:' + Math.round(performance.timeOrigin || Date.now());
      }
    } catch (_) {}
    return '1';
  })();
  let finished = false;
  let timers = [];
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout); timers = [];
    el.remove();
    root.classList.remove('ln61-ui', 'ln61-run');
    try { if (launchId !== 'tg:same') sessionStorage.setItem(KEY, launchId); } catch (_) {}
    introBlocking3d = false;
    try { podiumInvalidate(1000, true); } catch (_) {}
    // v119: подиум и модели — только когда открыли Гараж
    setTimeout(() => {
      try { if (document.getElementById('view-garage')?.classList.contains('active')) void ensurePodium3d(); } catch (_) {}
    }, 30);
    setTimeout(() => { try { (window.requestIdleCallback || setTimeout)(() => prefetchEngineStart(), { timeout: 4000 }); } catch (_) {} }, 3000); // перф: звук старта — после первой отрисовки
    setTimeout(() => { try { tipsOnView((document.querySelector('.view.active')?.id || 'view-home').slice(5)); } catch (_) {} }, 700);
  };
  let seen = false;
  try { const v = sessionStorage.getItem(KEY); seen = launchId === 'tg:same' ? !!v : v === launchId; } catch (_) {}
  // пропуск — только явная ссылка пользователя (?view=… / startapp=track_… / skipIntro=1), не служебные параметры запуска Telegram
  let deepSkip = false;
  try { deepSkip = !!getDeepLinkView().skipIntro; } catch (_) {}
  // v162: только системное «Уменьшить движение»; эвристика слабого 3D (q-low) запуск не отключает — iPhone с режимом энергосбережения попадал в low
  let reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  window.__ln61 = { launchId, seen, deepSkip, reduceMotion }; // диагностика
  if (seen || deepSkip || reduceMotion) { finish(); return; }
  // тап — сразу к интерфейсу: панели убираются за 160 мс, без второй волны
  const skip = () => {
    if (finished || el.classList.contains('skip')) return;
    el.classList.add('skip'); root.classList.remove('ln61-ui');
    timers.forEach(clearTimeout); timers = [setTimeout(finish, 170 / (window.__motionScale || 1))];
  };
  el.addEventListener('pointerdown', skip, { once: true });
  document.addEventListener('keydown', skip, { once: true });
  const sc = window.__motionScale || 1; // кадры для отчёта — замедленно
  requestAnimationFrame(() => {
    if (finished) return;
    root.classList.add('ln61-run'); el.classList.add('go');
    timers.push(setTimeout(() => { if (!finished && !el.classList.contains('skip')) { root.classList.add('ln61-ui'); try { tmaHaptic('soft'); } catch (_) {} } }, LN61.UI / sc));
    timers.push(setTimeout(finish, LN61.T / sc + 60));
  });
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
    // v188: скалярный Калман скорости [v, a] по доплеру coords.speed (фолбэк — дистанция/время)
    sv: 0, sa: 0, sp00: 1, sp01: 0, sp11: 4, svTs: 0, svReady: false, prevFix: null, lastKey: '', recvAt: 0,
    imuLin: 0, imuStillMs: 0,
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
    const stillGps = spd < 0.45 && (!st.svReady || st.sv < 0.45); // ~1.6 км/ч
    const stillImu = st.imuOn ? st.accelVar < 0.12 : stillGps;
    if (stillGps && stillImu) {
      st.stillMs += dt * 1000;
    } else if (st.svReady && st.sv >= 0.45) {
      st.stillMs = 0; // v188: доплер говорит «едем» — сразу снимаем ZUPT
    } else {
      st.stillMs = Math.max(0, st.stillMs - dt * 600);
    }
    if (st.stillMs > 400) {
      st.zupt = true;
      st.vE = 0;
      st.vN = 0;
      st.sv = 0; st.sa = 0;
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
    // v188: сырое ускорение больше не интегрируем — ориентация телефона в держателе неизвестна, это давало дрейф скорости
    return false;
  }

  function publish(acc) {
    const ll = fromEnu(st.e, st.n);
    st.lat = ll.lat;
    st.lon = ll.lon;
    st.vKmh = st.svReady ? st.sv * 3.6 : speedKmh();
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
    // v188: без медианы по окну и ограничения шага — они и давали «держит 30, потом прыгает на 6»
    st.showV = st.vKmh;
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
    st.sv = st.sa = 0; st.sp00 = 1; st.sp01 = 0; st.sp11 = 4; st.svTs = 0; st.svReady = false;
    st.prevFix = null; st.lastKey = ''; st.recvAt = 0; st.speedAt = 0; st.fixWin = []; st.imuStillMs = 0;
  }

  // v188: скорость как в навигаторе — доплер напрямую через лёгкий Калман (без окна-медианы), учёт точности
  function speedUpdate(coords, ts, acc) {
    // v195: тот же фикс с новым временем (кеш iOS) — не измерение, иначе старая скорость «держится» вечно
    const pf = st.prevFix;
    if (pf && pf.lat === coords.latitude && pf.lon === coords.longitude && pf.sp === coords.speed) return;
    const dt = st.svTs ? clamp((ts - st.svTs) / 1000, 0.04, 3) : 1;
    let z = null; let sig = null;
    const sp = coords.speed;
    if (sp != null && Number.isFinite(sp) && sp >= 0) {
      z = sp;
      const sa = Number(coords.speedAccuracy);
      sig = Number.isFinite(sa) && sa > 0 ? Math.max(0.15, sa) : 0.35 + 0.02 * acc;
    } else if (st.prevFix && ts > st.prevFix.ts) {
      const dts = (ts - st.prevFix.ts) / 1000;
      const dN = (coords.latitude - st.prevFix.lat) * M_PER_DEG_LAT;
      const dE = (coords.longitude - st.prevFix.lon) * mPerDegLon(coords.latitude);
      z = Math.hypot(dE, dN) / dts;
      sig = (1.2 * (acc + st.prevFix.acc) / 2) / dts + 0.4;
      if (z < sig) { z = 0; sig = 0.25; } // v195: смещение в пределах шума — стоим, и это уверенный ноль
    }
    st.prevFix = { lat: coords.latitude, lon: coords.longitude, acc, ts, sp: coords.speed };
    // v195: детектор стоянки по окну ~2.5 с — все точки внутри круга accuracy → 0 (iOS на стоянке шлёт speed=-1 и дрожание ±5 м)
    const w = st.fixWin || (st.fixWin = []);
    w.push({ lat: coords.latitude, lon: coords.longitude, acc, ts });
    while (w.length > 2 && ts - w[0].ts > 2500) w.shift();
    if (!(sp != null && Number.isFinite(sp) && sp >= 0.8) && w.length >= 2 && ts - w[0].ts >= 1500) {
      const r = Math.max(6, Math.min(25, 1.2 * Math.min(...w.map((f) => f.acc))));
      const a0 = w[0]; const mL = mPerDegLon(a0.lat);
      const far = w.some((f) => Math.hypot((f.lat - a0.lat) * M_PER_DEG_LAT, (f.lon - a0.lon) * mL) > r);
      if (!far) { z = 0; sig = 0.2; }
    }
    if (z == null) return;
    st.speedAt = st.recvAt; // v195: время последнего измерения скорости (для затухания)
    let Rm = sig * sig;
    if (st.svReady && z < st.sv && sp != null && sp >= 0) Rm *= 0.35; // v195: асимметрия — торможение ловим быстрее разгона
    if (!st.svReady) { st.sv = z; st.sa = 0; st.sp00 = Rm; st.sp01 = 0; st.sp11 = 4; st.svReady = true; st.svTs = ts; return; }
    // predict (constant acceleration, jerk noise q)
    const q = 6;
    st.sv += st.sa * dt;
    st.sp00 += dt * (2 * st.sp01 + dt * st.sp11) + q * dt * dt * dt / 3;
    st.sp01 += dt * st.sp11 + q * dt * dt / 2;
    st.sp11 += q * dt;
    // update
    const S = st.sp00 + Rm; const k0 = st.sp00 / S; const k1 = st.sp01 / S; const y = z - st.sv;
    st.sv += k0 * y; st.sa += k1 * y;
    st.sp11 -= k1 * st.sp01; st.sp01 *= (1 - k0); st.sp00 *= (1 - k0);
    st.sa = clamp(st.sa, -12, 10);
    if (st.sv < 0) st.sv = 0;
    if (z < 0.3 && st.sv < 0.7) { st.sv = 0; st.sa = 0; } // остановка — сразу 0
    st.svTs = ts;
  }

  /** v188: скорость для показа «сейчас»: экстраполяция от последнего фикса по ускорению (≤1 с) + акселерометр. */
  function displayKmhAt(now) {
    if (!st.ready || !st.svReady) return 0;
    const rawAge = ((now || Date.now()) - (st.speedAt || st.recvAt)) / 1000;
    const age = clamp(rawAge, 0, 1);
    const saX = Math.abs(st.sa) < 0.6 ? 0 : st.sa; let v = st.sv + saX * age; // v196 (мёртвая зона 0.6 м/с² — круиз без дрожания): экстраполяция по ускорению на весь интервал до точки (≤1 с) — без отставания на разгоне
    // v196: тоннель/потеря GPS на ходу — как в навигаторах держим последнюю скорость (dead reckoning, без ускорения) до 12 с;
    // если перед пропаданием тормозили или ехали медленно (<30 км/ч) — это остановка: гасим к 0 (v195)
    const cruising = st.sv > 8.3 && st.sa > -0.8 && !(st.imuOn && st.imuStillMs > 500);
    if (cruising && rawAge > 1) v = st.sv; // держим последнюю скорость
    const fadeFrom = cruising ? 12 : 1.5;
    if (rawAge > fadeFrom) v *= Math.exp(-(rawAge - fadeFrom) / 0.45);
    if (rawAge > fadeFrom + 1.5) v = 0;
    if (st.imuOn && st.sa < -0.5 && st.imuLin > -st.sa && st.imuLin < 12) v = Math.min(v, st.sv - st.imuLin * age); // торможение по акселерометру
    if (st.imuOn && st.imuStillMs > 500 && st.sv * 3.6 < 25) v = 0; // акселерометр: машина стоит
    if (st.sv === 0 && st.sa === 0) v = 0;
    v = clamp(v, 0, 100);
    // мягкое догоняние цели (τ≈0.25 с) — без ступенек на кадре; 0 показываем сразу
    const tn = now || Date.now();
    const dtd = st.dispTs ? clamp((tn - st.dispTs) / 1000, 0, 0.5) : 1;
    st.dispTs = tn;
    { const pv = st.dispV || 0; const tau = v < pv ? 0.15 : 0.25; st.dispV = v < 0.3 ? 0 : pv + (v - pv) * (1 - Math.exp(-dtd / tau)); }
    const k = st.dispV * 3.6;
    return k < 0.5 ? 0 : k;
  }

  function ingestGps(coords, ts, recvAt) {
    if (!coords || coords.latitude == null || coords.longitude == null) {
      return getState();
    }
    // v188: watchPosition + опрос getCurrentPosition отдают тот же фикс повторно — в фильтр только один раз
    const key = ts + ':' + coords.latitude + ':' + coords.longitude;
    if (key === st.lastKey) return getState();
    st.lastKey = key;
    st.recvAt = recvAt || Date.now();
    const acc = coords.accuracy != null && Number.isFinite(coords.accuracy) ? Number(coords.accuracy) : 25;
    st.lastRaw = {
      lat: coords.latitude,
      lon: coords.longitude,
      acc,
      speed: coords.speed,
      heading: coords.heading,
      t: ts,
    };

    // Soft/hard reject by accuracy (v188: >40 м — фикс не берём, ни в позицию, ни в скорость)
    if (acc > 40) {
      // v195: доплер iOS валиден и при плохой accuracy — скорость обновляем (иначе на стоянке у остановки держалась старая)
      if (coords.speed != null && Number.isFinite(coords.speed) && coords.speed >= 0) speedUpdate(coords, ts, acc);
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

    // v188: скорость обновляем по каждому годному фиксу, даже если позицию гейт отклонил
    speedUpdate(coords, ts, acc);

    // v89: a filter that rejected 6+ good fixes in a row has diverged (e.g. a hairpin while coasting) → re-anchor
    if (st.ready && (st.rejN || 0) >= 6 && acc <= 25) { st.ready = false; st.rejN = 0; }
    if (!st.ready) {
      st.rejN = 0;
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
    // v89: tick() may already have coasted the state up to this fix — predict only the rest (was predicted twice)
    const from = Math.max(st.lastGpsTs || 0, st.lastTick || 0);
    predict(from ? clamp((ts - from) / 1000, 0, 2.8) : dt, accelerating);

    const en = toEnu(coords.latitude, coords.longitude);
    // Jump vs possible motion → coast only
    const jump = Math.hypot(en.e - st.e, en.n - st.n);
    const maxJump = Math.hypot(st.vE, st.vN) * dt + Math.max(12, acc * 1.4) + 18;
    if (jump > maxJump && jump > 35) {
      // teleport: do not update with this fix
      st.rejN = (st.rejN || 0) + 1;
      applyZupt(dt);
      publish(Math.max(acc, st.accEst || acc));
      st.lastGpsTs = ts;
      return getState();
    }

    let R = Math.max(4, acc * acc);
    if (acc > 35) R *= 4; // heavy R
    else if (acc > 22) R *= 1.8;

    const up = updatePos(en.e, en.n, R);
    st.rejN = up.accept ? 0 : (st.rejN || 0) + 1;
    // v188: скорость — из отдельного Калмана по доплеру; направление — курс GPS, иначе текущее направление фильтра
    {
      const hasHdg = coords.heading != null && Number.isFinite(coords.heading) && coords.heading >= 0;
      let h = null;
      if (hasHdg && st.sv > 1) h = coords.heading * DEG;
      else if (Math.hypot(st.vE, st.vN) > 0.2) h = Math.atan2(st.vE, st.vN);
      else if (st.heading != null) h = st.heading * DEG;
      if (h != null) { st.vE = Math.sin(h) * st.sv; st.vN = Math.cos(h) * st.sv; } else if (st.sv === 0) { st.vE = 0; st.vN = 0; }
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
      // v188: iOS — оба запроса синхронно в одном жесте (второй после await терял жест и падал)
      const needs = [DME, DOM].filter((X) => X && typeof X.requestPermission === 'function');
      if (needs.length) {
        const rs = await Promise.all(needs.map((X) => X.requestPermission().catch(() => 'denied')));
        if (rs[0] !== 'granted') {
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
    // v188: линейное ускорение (без g) для торможения/остановки
    st.imuLin += (mag - st.imuLin) * 0.25;
    const iv = Number(e.interval);
    const ims = Number.isFinite(iv) && iv > 0 ? (iv < 1 ? iv * 1000 : iv) : 16;
    if (st.accelVar < 0.05 && st.imuLin < 0.25) st.imuStillMs += ims; else st.imuStillMs = 0;
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
    displayKmhAt,
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
  if (coords && coords.ext && coords.speed != null && Number.isFinite(coords.speed)) {
    // Внешний GNSS (PITLANE GPS): доплеровская скорость чипа точнее фильтра телефона — берём её напрямую,
    // фильтр используем только для координат/дистанции.
    filtV = coords.speed * 3.6;
    filtShow = filtV;
    extSpeedTs = ts;
    extDisp.push(Date.now(), filtV); // v215: на экран — плавно (≤15 к/с, физический лимит), 25 Гц сырые цифры не мелькают
    return filtV;
  }
  if (!s.ready) return null;
  filtV = s.vKmh;
  filtShow = s.showKmh;
  return filtV;
}

var extSpeedTs = 0;
const extDisp = new DisplaySpeed({ fps: 15 }); let _extShown = 0;
function displayKmh() {
  if (extGps?.active() && extSpeedTs && Date.now() - extSpeedTs < 1500) { const v = extDisp.frame(Date.now()); if (v != null) _extShown = v; return _extShown; }
  if (!GpsFusion.getState().ready) return Math.round(filtShow || filtV || 0);
  return Math.round(GpsFusion.displayKmhAt(Date.now()));
}
/* v188: спидометр между фиксами — плавно, по requestAnimationFrame (экстраполяция ≤1 с, тайминг не трогает) */
let _spdRaf = 0; let _spdLast = -1;
function speedLoop() {
  _spdRaf = 0;
  if (document.hidden || (run.watchId == null && !extGps?.active?.())) return;
  const v = displayKmh();
  if (v !== _spdLast) {
    _spdLast = v;
    setRunText('liveSpeed', String(v));
    hudZones(v);
    setRunText('boxLive', String(v));
    if (document.body.classList.contains('run-drive-on')) setRunText('runDriveSpeed', String(v));
    if (lapDrive.open) { const el = document.getElementById('lapDriveSpeed'); if (el) el.textContent = String(v); }
  }
  _spdRaf = requestAnimationFrame(speedLoop);
}
function kickSpeedLoop() { if (!_spdRaf) _spdRaf = requestAnimationFrame(speedLoop); }

var hudPeak = 0;
/* v145: тонкая дуга-шкала под цифрами (0–200, при >200 — 0–300), мелкие риски, подписи 0 / середина / максимум */
const HG = { cx: 150, cy: 352, r: 330, a: 23 * Math.PI / 180 };
function hgPt(f, dr = 0) { const t = -HG.a + 2 * HG.a * f; return [HG.cx + (HG.r + dr) * Math.sin(t), HG.cy - (HG.r + dr) * Math.cos(t)]; }
function hudGaugeBuild(el, max) {
  const NS = 'http://www.w3.org/2000/svg'; const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
  const svg = mk('svg', { viewBox: '0 0 300 64', class: 'hgz-svg', preserveAspectRatio: 'xMidYMid meet' });
  const [x0, y0] = hgPt(0), [x1, y1] = hgPt(1);
  const arc = 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + HG.r + ' ' + HG.r + ' 0 0 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  svg.appendChild(mk('path', { d: arc, class: 'hgz-track', pathLength: '1' }));
  const step = max / 80;
  for (let k = 0; k <= 80; k++) {
    const val = k * step, f = val / max; const major = k % 40 === 0; const mid = !major && k % 10 === 0;
    const [a1, b1] = hgPt(f, major ? 5 : mid ? 3.5 : 2), [a2, b2] = hgPt(f, major ? -5 : mid ? -3 : -1.5);
    svg.appendChild(mk('line', { x1: a1.toFixed(2), y1: b1.toFixed(2), x2: a2.toFixed(2), y2: b2.toFixed(2), class: major ? 'hgz-tick hgz-major' : mid ? 'hgz-tick hgz-mid' : 'hgz-tick' }));
  }
  svg.appendChild(mk('path', { d: arc, class: 'hgz-fill', pathLength: '1', 'stroke-dasharray': '0 1' }));
  { const top = HG.cy - HG.r; svg.appendChild(mk('line', { x1: String(HG.cx), y1: (top - 9).toFixed(1), x2: String(HG.cx), y2: (top + 7).toFixed(1), class: 'hgz-needle', transform: `rotate(${(-HG.a * 180 / Math.PI).toFixed(3)} ${HG.cx} ${HG.cy})` })); } // v160: стрелка
  el.textContent = ''; el.appendChild(svg);
  const lab = document.createElement('div'); lab.className = 'hgz-labels';
  [0, max / 2, max].forEach((n) => { const s = document.createElement('span'); s.textContent = String(n); lab.appendChild(s); });
  el.appendChild(lab); el.dataset.max = String(max);
}
/* v160: шкала как прибор — дуга и стрелка едут пружиной (лёгкий перелёт, ζ≈0.72) между отсчётами GPS; цифра — точное значение. */
const G60 = new WeakMap();
function hudGauge(el, v, max) {
  if (el.dataset.max !== String(max)) { const old = G60.get(el); hudGaugeBuild(el, max); if (old) { G60.delete(el); } }
  const f = Math.max(0, Math.min(1, v / max));
  let s = G60.get(el);
  if (!s) {
    const fill = el.querySelector('.hgz-fill'); const nd = el.querySelector('.hgz-needle'); const k = 180 / Math.PI;
    s = spring({ k: 70, zeta: 0.72, value: 0, eps: 2e-4, onUpdate: (x) => {
      const q = Math.max(0, Math.min(1.02, x));
      if (fill) fill.setAttribute('stroke-dasharray', Math.min(1, q).toFixed(4) + ' 1');
      if (nd) nd.setAttribute('transform', `rotate(${((-HG.a + 2 * HG.a * q) * k).toFixed(3)} ${HG.cx} ${HG.cy})`);
    } });
    G60.set(el, s);
  }
  s.set(f);
}
function hudZones(v, reset) {
  if (reset) hudPeak = 0;
  v = Math.max(0, +v || 0);
  if (v > hudPeak) hudPeak = v;
  const gMax = (hudPeak > 200 || v > 200) ? 300 : 200;
  document.querySelectorAll('.hud-gauge').forEach((el) => hudGauge(el, v, gMax));
  document.querySelectorAll('.hud-zones .hz').forEach((z) => {
    const to = +z.dataset.to || 100;
    const f = Math.min(1, hudPeak / to);
    const b = z.querySelector('b');
    if (b) b.style.transform = 'scaleX(' + f.toFixed(3) + ')';
    z.classList.toggle('done', f >= 1);
  });
}

function setRunText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* v153: «Старт» вкладки «Замер» раскрывается в спидометр — круг растёт из центра кнопки (clip-path).
 * Логику не задерживает: класс ставится в момент открытия оверлея (после подтверждения безопасности, если оно было). */
const H53 = { at: 0, cx: 0, cy: 0, r: 0 };
function rd53Reveal(el) {
  if (!H53.at || performance.now() - H53.at > 20000) return;
  H53.at = 0;
  el.style.setProperty('--h53x', H53.cx + 'px'); el.style.setProperty('--h53y', H53.cy + 'px'); el.style.setProperty('--h53r', H53.r + 'px');
  // v156: оверлей уже смонтирован скрытым (rd56-pre) — без синхронной раскладки; страница под ним не перерисовывается,
  // пока круг не закроет экран (rd56-anim держит #app видимым), а по окончании входные анимации не перезапускаются (rd56-done)
  const had = el.classList.contains('rd53-in');
  el.classList.remove('rd53-in', 'rd56-done'); if (had) void el.offsetWidth;
  el.classList.remove('rd56-pre'); el.classList.add('rd53-in');
  document.body.classList.add('rd56-anim');
  clearTimeout(rd53Reveal._a); rd53Reveal._a = setTimeout(() => document.body.classList.remove('rd56-anim'), 460);
  clearTimeout(rd53Reveal._t); rd53Reveal._t = setTimeout(() => { el.classList.add('rd56-done'); el.classList.remove('rd53-in'); }, 950);
}
/* v156: пре-монтаж спидометра — пока открыт «Замер», оверлей уже собран и разложен, но невидим */
function rd56Pre() {
  const el = document.getElementById('runDrive');
  if (!el || !el.classList.contains('hidden') || run.armed || document.body.classList.contains('run-drive-on')) return;
  el.classList.add('rd56-pre'); el.classList.remove('hidden');
  rdGridBuild(); const ul = document.getElementById('runDriveMarks'); if (ul) ul.dataset.pre56 = '1';
  rdPhase('ready');
  setRunText('runDriveMsg', ''); setRunText('runDriveDist', '0'); setRunText('rdTimer', '0.00');
  rdReadySet('wait', 'Ждём GPS', 'встаньте на открытом небе');
}
/** v156: сетка уже собрана при пре-монтаже — на старте не пересобираем. */
function rd56Skip(ul) { if (ul.dataset.pre56 !== '1') return false; delete ul.dataset.pre56; return true; }
function rd56Unpre() {
  const el = document.getElementById('runDrive');
  if (!el || !el.classList.contains('rd56-pre')) return;
  el.classList.add('hidden'); el.classList.remove('rd56-pre');
  const ul = document.getElementById('runDriveMarks'); if (ul) delete ul.dataset.pre56;
}
function openRunDrive(phase = 'ready') {
  const el = document.getElementById('runDrive');
  if (!el) return;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('run-drive-on');
  try { rd53Reveal(el); } catch (_) {}
  rdGridBuild();
  el.classList.remove('rd56-pre');
  rdPhase(phase);
  setRunText('runDriveMsg', '');
  setRunText('runDriveDist', '0');
  setRunText('rdTimer', '0.00');
  hudZones(0, true);
  setRunText('runDriveSpeed', document.getElementById('liveSpeed')?.textContent || '0');
  rdReadySet('wait', 'Ждём GPS', 'встаньте на открытом небе');
}

function closeRunDrive() {
  const el = document.getElementById('runDrive');
  if (!el) return;
  el.classList.add('hidden');
  el.classList.remove('rd53-in', 'rd56-done', 'rd56-pre');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('run-drive-on', 'rd56-anim');
  setTimeout(() => { if (document.getElementById('view-zamer')?.classList.contains('active')) rd56Pre(); }, 400);
}

/* v116: вибрация на отметках замера — по умолчанию выключена (просили без жужжания), включается галочкой */
const MARK_HAPTIC_KEY = 'pitlane-mark-haptic-v1';
function markHapticOn() { try { return localStorage.getItem(MARK_HAPTIC_KEY) === '1'; } catch (_) { return false; } }
function markHap() {
  if (!markHapticOn()) return;
  if (isTMA && tmaHaptic('light')) return;
  try { navigator.vibrate?.(15); } catch (_) {}
}

/* ——— v117: экран замера в логике драг-метров: готовность → живой замер (скорость, таймер, график, сетка) → итог ———
 * Все цифры — gps-core.dragSplits по сырому треку (run-marks.js): живые = итоговые = серверный пересчёт. */
function rdPhase(ph) {
  const el = document.getElementById('runDrive');
  if (!el) return;
  el.dataset.phase = ph;
  setRunText('rdLabel', ph === 'ready' ? 'ГОТОВНОСТЬ' : ph === 'live' ? 'ЗАМЕР' : 'ИТОГ ЗАЕЗДА');
  document.getElementById('rdFinal')?.classList.toggle('hidden', ph !== 'final');
  document.body.classList.toggle('run-sum-on', ph === 'final');
  const box = document.getElementById('rdChartBox');
  const slot = document.getElementById(ph === 'final' ? 'rdChartSlotF' : 'rdChartSlotL');
  if (box && slot && box.parentNode !== slot) slot.appendChild(box);
  if (ph === 'final') document.getElementById('runDrivePop')?.classList.add('hidden');
  rdChartDirty();
}
function rdGridBuild() {
  const ul = document.getElementById('runDriveMarks');
  if (!ul || rd56Skip(ul)) return;
  ul.replaceChildren();
  rd50Reset();
  for (const g of RM_GRID) {
    const li = padEl('li', 'rd-cell' + (g.hero ? ' hero' : ''));
    li.dataset.k = g.k;
    li.append(padEl('span', '', g.label), padEl('strong', '', '—'), padEl('small', '', g.k === 'vmax' ? 'км/ч' : ''));
    ul.appendChild(li);
  }
}
function rdCell(k) {
  const ul = document.getElementById('runDriveMarks');
  if (!ul) return null;
  for (const li of ul.children) if (li.dataset.k === k) return li;
  return null;
}
/** Заполнить ячейку сетки. pre — предварительное значение чипа (до точек), потом его заменит gps-core. */
function rdGridSet(k, val, sub, { flash = false, pre = false } = {}) {
  const li = rdCell(k);
  if (!li) return;
  if (pre && li.classList.contains('done')) return;
  li.children[1].textContent = String(val);
  li.children[2].textContent = String(sub || '');
  li.classList.toggle('pre', pre);
  if (!pre) li.classList.add('done');
  if (flash) { li.classList.remove('rd-in'); void li.offsetWidth; li.classList.add('rd-in'); }
  if (!pre) rd50Set(k, val);
}
/* v150: три строки разгона в оверлее (0–60 / 0–100 / 0–200): «—», пока нет времени; потом плавно на месте */
function rd50Row(k) { return document.querySelector(`#rd50Rows .rd50-row[data-k="${k}"]`); }
/* v275: дельта к личному рекорду — только если рекорд реально есть (снимок на старте) */
function r275Pb0(k) { const t = Number(run.pb0?.[k]); return t > 0 ? t : null; }
function r275Dl(k, sec) {
  const pb = r275Pb0(k); if (!(pb > 0) || !(sec > 0)) return null;
  const d = sec - pb; return { d, text: (d <= -0.005 ? '−' : '+') + Math.abs(d).toFixed(2), cls: d <= -0.005 ? 'up' : 'dn' };
}
function rd50Set(k, val) {
  const row = rd50Row(k); if (!row) return;
  const b = row.querySelector('b'); if (!b) return;
  b.textContent = String(val) + (k === 'trap' ? ' км/ч' : ' с');
  /* v277b: значение отрезка проявляется (blur/slide) и коротко досчитывается до итога; без анимации при prefers-reduced-motion */
  try {
    const fin = Number(val), suf = k === 'trap' ? ' км/ч' : ' с', dec = (String(val).split('.')[1] || '').length;
    if (fin > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      b.classList.remove('r277-in'); void b.offsetWidth; b.classList.add('r277-in');
      const t0 = performance.now(), dur = 520, tok = (b._r277 = (b._r277 || 0) + 1);
      const step = (t) => { if (b._r277 !== tok) return; const q = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - q, 3);
        b.textContent = (q < 1 ? (fin * e).toFixed(dec) : String(val)) + suf; if (q < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  } catch (_) {}
  const em = row.querySelector('.r275-dl'); const dl = k === 'trap' ? null : r275Dl(k, Number(val));
  if (em) { em.textContent = dl ? dl.text : ''; em.className = 'r275-dl' + (dl ? ' ' + dl.cls : ''); }
  row.classList.remove('on'); void row.offsetWidth; row.classList.add('on');
  _hapKey = true; try { hap(12); } finally { _hapKey = false; } // v153: лёгкий «щелчок» при фиксации отметки
}
function rd50Reset() {
  document.querySelectorAll('#rd50Rows .rd50-row').forEach((r) => { r.classList.remove('on'); const b = r.querySelector('b'); if (b) { b._r277 = (b._r277 || 0) + 1; b.classList.remove('r277-in'); b.textContent = '—'; } const em = r.querySelector('.r275-dl'); if (em) { em.textContent = ''; em.className = 'r275-dl'; } });
  rd50Sheet(false);
}
function rd50Sheet(open) {
  const sh = document.getElementById('rd50Sheet'); const btn = document.getElementById('rd50More');
  if (!sh) return;
  const on = open == null ? !sh.classList.contains('open') : !!open;
  sh.classList.toggle('open', on); sh.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (btn) { btn.setAttribute('aria-expanded', on ? 'true' : 'false'); btn.textContent = on ? 'Скрыть' : 'Подробнее'; }
}
document.getElementById('rd50More')?.addEventListener('click', () => rd50Sheet());
function rdReadySet(state, title, sub) {
  const r = document.getElementById('rdReady');
  if (!r) return;
  if (r.dataset.ready !== state) r.dataset.ready = state;
  setRunText('rdReadyT', title);
  setRunText('rdReadyS', sub || '');
}
/** Медианная частота последних точек. */
function rdHz() {
  const n = rawTrace.length;
  if (n < 6) return null;
  const dts = [];
  for (let i = Math.max(1, n - 25); i < n; i++) dts.push(rawTrace[i].t - rawTrace[i - 1].t);
  dts.sort((a, b) => a - b);
  const med = dts[Math.floor(dts.length / 2)];
  return med > 0 ? 1000 / med : null;
}
function rdSrcName() {
  const st = extGps?.state?.() || 'off';
  return st === 'wifi' ? 'Wi-Fi' : st === 'sim' ? 'Симулятор' : st === 'ble' ? 'Bluetooth' : 'Телефон';
}
let _rdStatusAt = 0;
/** Статус-чипы (источник · спутники · точность · Гц) — не чаще 4 раз в секунду. */
function rdStatusUpdate(pos, now) {
  if (!document.body.classList.contains('run-drive-on')) return;
  const t = performance.now();
  if (t - _rdStatusAt < 250) return;
  _rdStatusAt = t;
  const chip = (id, txt, q) => { setRunText(id + 'V', txt); const el = document.getElementById(id); if (el && el.dataset.q !== q) el.dataset.q = q; };
  const ext = !!pos?.coords?.ext;
  const src = rdSrcName();
  chip('rdSrc', src, ext ? 'good' : 'mid');
  const sv = pos?.ext?.numSV;
  chip('rdSv', Number.isFinite(sv) ? String(sv) : '—', !Number.isFinite(sv) ? 'none' : sv >= 8 ? 'good' : sv >= 5 ? 'mid' : 'bad');
  const acc = Number(pos?.coords?.accuracy);
  chip('rdAcc', Number.isFinite(acc) ? `±${acc < 10 ? acc.toFixed(1) : Math.round(acc)} м` : '—', !Number.isFinite(acc) ? 'none' : acc <= 2.5 ? 'good' : acc <= 8 ? 'mid' : 'bad');
  const hz = rdHz();
  chip('rdHz', hz ? `${hz >= 9.5 ? Math.round(hz) : hz.toFixed(1)} Гц` : '—', !hz ? 'none' : hz >= 9.5 ? 'good' : hz >= 4.5 ? 'mid' : 'bad');
}
/** «Готово — трогайся»: стоим, фикс точный. Только подсказка — старт всё равно считает gps-core по трогания. */
function rdReadyUpdate(v, pos) {
  const acc = Number(pos?.coords?.accuracy);
  const ext = !!pos?.coords?.ext;
  const src = traceSource(rawTrace.slice(-5));
  if (Number.isFinite(acc) && acc > (ext ? 5 : 15)) { rdReadySet('wait', 'Ждём точный GPS', `сейчас ±${Math.round(acc)} м — нужно небо над головой`); return; }
  if (v >= 1.5) { rdReadySet('wait', 'Остановитесь', 'старт — с полной остановки'); return; }
  const sub = src === 'sim' ? 'симулятор · не в топ' : !ext ? 'телефон · зачёт C (≈ ±0,3 с, отдельный топ)' : 'старт считается с первого сантиметра';
  rdReadySet('go', 'Готово — трогайся', sub);
}

/* График: canvas, одна перерисовка на кадр (25 Гц точек не дают лишних кадров). */
let _rdChartQ = false;
const _rdPerf = { n: 0, ms: 0, max: 0 };
function rdChartDirty() {
  if (_rdChartQ) return;
  _rdChartQ = true;
  requestAnimationFrame(rdChartDraw);
}
function rdChartDraw() {
  _rdChartQ = false;
  const cv = document.getElementById('rdChart');
  const el = document.getElementById('runDrive');
  if (!cv || !el || el.classList.contains('hidden')) return;
  const t0p = performance.now();
  const w = cv.clientWidth; const h = cv.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const ph = el.dataset.phase;
  const S = run.rm?.S;
  let series = []; let tags = []; let xMax = 10;
  if (S && S.t0 != null && ph !== 'ready') {
    const pts = ph === 'final' && run.sumPts ? run.sumPts : rawSince(run.rawSeq0 || 0);
    series = speedSeries(pts, S.t0, ph === 'final' ? 360 : 220);
    tags = chartTags(S.marks);
    const last = series.length ? series[series.length - 1].x : 0;
    xMax = ph === 'final' ? Math.max(4, last) : Math.max(10, Math.ceil((last * 1.12) / 5) * 5);
  }
  drawSpeedChart(ctx, series, tags, { w, h, dpr, xMax, live: ph === 'live', glow: ph === 'final' });
  const dt = performance.now() - t0p;
  _rdPerf.n++; _rdPerf.ms += dt; _rdPerf.max = Math.max(_rdPerf.max, dt);
  try { window.__plChartPerf = _rdPerf; } catch (_) {}
}
window.addEventListener('resize', () => rdChartDirty());

/** Пройдена отметка (по gps-core): сетка, попап, топы, паспорт — как раньше, но из одного расчёта. */
function onRunMark(k, S) {
  const m = S.marks[k];
  if (!m) return;
  const sec = m.sec;
  const dist = RM_DIST.includes(k);
  rdGridSet(k, sec.toFixed(2), dist ? `${Math.round(m.v)} км/ч` : (m.d != null ? `${Math.round(m.d)} м` : ''), { flash: true });
  try { (window.__plMarkLog = window.__plMarkLog || []).push({ k, sec, at: Date.now() }); } catch (_) {}
  const iv = (key) => S.marks[key]?.sec ?? null;
  switch (k) {
    case '0-50':
      setRunText('run050', fmtRunSec(sec)); run.saved050 = true; publishDragMark('0-50', sec); break;
    case '0-60':
      run.saved060 = true; publishDragMark('0-60', sec); break;
    case '60ft':
      run.saved60ft = true; publishDragMark('60ft', sec); break;
    case '80-120':
      setRunText('run80120', fmtRunSec(sec));
      setRunText('slip80120', `${sec.toFixed(2)}s`);
      run.saved80120 = true;
      publishDragMark('80-120', sec);
      try {
        const gq80120 = gpsQualityFromStraightRun();
        if (foldPassportGps({ v80120: Number(sec.toFixed(2)) }, gq80120.gpsQ)) { save(); try { applyPassportUI(); } catch (_) {} }
      } catch (_) {}
      break;
    case '0-100':
      setRunText('run0100', fmtRunSec(sec));
      setRunText('slip0100', `${sec.toFixed(2)}s`);
      setRunText('slipHero', `${sec.toFixed(2)}s`);
      run.saved0100 = true;
      ghostRunMark('0-100', sec * 1000);
      publishDragMark('0-100', sec);
      showMarkPop('0-100', sec, 'core');
      void publishGps(sec, iv('100-200'), iv('200-300'));
      break;
    case '201m':
      run.saved18 = true; publishDragMark('201m', sec); break;
    case '100-200':
      setRunText('run100200', fmtRunSec(sec));
      setRunText('slip100200', `${sec.toFixed(2)}s`);
      run.saved100200 = true;
      publishDragMark('100-200', sec);
      void publishGps(null, sec, iv('200-300'));
      break;
    case '0-200':
      setRunText('slip0200', `${sec.toFixed(2)}s`);
      publishDragMark('0-200', sec);
      showMarkPop('0-200', sec, 'core');
      break;
    case '402m':
      run.saved14 = true; ghostRunMark('402m', sec * 1000); publishDragMark('402m', sec); break;
    case '200-300':
      setRunText('run200300', fmtRunSec(sec));
      setRunText('slip200300', `${sec.toFixed(2)}s`);
      run.saved200300 = true;
      publishDragMark('200-300', sec);
      void publishGps(null, null, sec);
      break;
    case '0-300':
      showMarkPop('0-300', sec, 'core');
      break;
    default: break;
  }
}

function fmtRunSec(sec) {
  return `${Number(sec).toFixed(2)} с`;
}


/* ——— v104: сырой трек для серверного зачёта ———
 * Каждая точка (телефон / внешний приёмник / симулятор) пишется как есть: время, lat/lon, доплер, accuracy,
 * источник. При отправке результата уходит кусок трека — сервер сам считает время, A/B и флаги. */
const rawTrace = [];
let rawSeq = 0;
function pushRawFix(pos, now) {
  const c = pos && pos.coords;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;
  const sp = Number(c.speed);
  const src = c.ext ? (pos.ext?.source === 'sim' || extGps?.state?.() === 'sim' ? 'sim' : 'ext') : 'phone';
  // v118: опрос getCurrentPosition (каждые 400 мс) отдаёт ту же кэшированную точку телефона — в сырой трек
  // её не пишем повторно: dt = 0 сервер считает телепортом (а телефон теперь идёт в зачёт C)
  const last = rawTrace[rawTrace.length - 1];
  if (last && last.src === src && now <= last.t) return;
  // v247: iOS/Telegram отдают тот же кэшированный фикс с новой меткой времени — одинаковые lat/lon/скорость не пишем (иначе завышенные Гц)
  if (last && src === 'phone' && last.src === 'phone' && now - last.t < 1500 && last.lat === c.latitude && last.lon === c.longitude && (last.v ?? -1) === (c.speed != null && Number.isFinite(sp) && sp >= 0 ? sp * 3.6 : -1)) return;
  const alt = c.altitude != null && Number.isFinite(Number(c.altitude)) ? Number(c.altitude) : null; // v117: высота — только если источник её даёт (телефон); в трек для сервера не уходит
  const sAcc = Number(c.sAcc ?? c.speedAccuracy); const sv = Number(pos.ext?.numSV); // v215: точность доплера и спутники — в движок замера (гейт выбросов, флаги)
  const vK = c.speed != null && Number.isFinite(sp) && sp >= 0 ? sp * 3.6 : null;
  const im = src === 'phone' ? imuForFix(now, vK, last && last.src === 'phone' ? last : null) : {}; // v217: IMU — только к фиксам телефона (чип 25 Гц точнее)
  rawTrace.push({ seq: ++rawSeq, t: now, lat: c.latitude, lon: c.longitude, v: vK, acc: Number.isFinite(Number(c.accuracy)) ? Number(c.accuracy) : null, src, alt, sAcc: Number.isFinite(sAcc) && sAcc > 0 ? sAcc : undefined, sv: Number.isFinite(sv) ? sv : undefined, ...im });
  if (rawTrace.length > 9000) rawTrace.splice(0, rawTrace.length - 8000);
}
function rawSince(seq0, tFrom = -Infinity, tTo = Infinity) {
  if (tFrom === -Infinity && tTo === Infinity) {
    // v117: seq идут подряд — срез без перебора всего буфера (вызывается на каждой точке 25 Гц)
    if (!rawTrace.length) return [];
    const i = Math.max(0, seq0 + 1 - rawTrace[0].seq);
    return rawTrace.slice(i);
  }
  return rawTrace.filter((p) => p.seq > seq0 && p.t >= tFrom && p.t <= tTo);
}
function traceSource(pts) {
  if (pts.some((p) => p.src === 'sim')) return 'sim';
  return pts.length && pts.every((p) => p.src === 'ext') ? 'ext' : 'phone';
}
/** Короткие отметки, которые телефон (~1 Гц) не меряет — на доске C их нет (сервер тоже не принимает). */
const PHONE_NO_DISCS = ['60ft', '0-50'];
/** v247: телефон < 5 Гц или без доплера — 60 ft / 201 м / 100–200 не показываем вовсе (короче 1–3 обновлений GPS). */
function phoneOffDiscs(tp, S) {
  if (!tp || tp.src !== 'phone') return [];
  const lowQ = !((tp.hz || 0) >= 5) || (S && (S.reasons || []).includes('no_doppler'));
  return lowQ ? [...PHONE_NO_DISCS, '201m', '100-200'] : PHONE_NO_DISCS.slice();
}
/** v247: честная погрешность телефона, с: ~половина интервала между фиксами + доплер/IMU. */
function phoneErrSec(tp, S) {
  const hz = Math.max(0.5, Number(tp?.hz) || 1);
  let e = 0.35 / hz + 0.05;
  if (S && (S.reasons || []).includes('no_doppler')) e += 0.15;
  return Math.round(Math.min(0.8, Math.max(0.1, e)) * 10) / 10;
}
function fmtPhoneSec(sec, tp, S) { return `≈${Number(sec).toFixed(2)} ± ${phoneErrSec(tp, S).toFixed(1).replace('.', ',')} с`; }
const ROLLOUT_KEY = 'pitlane-rollout-v1';
function rolloutOn() { try { return localStorage.getItem(ROLLOUT_KEY) === '1'; } catch (_) { return false; } }
const CLASS_C_NOTE = 'телефон · зачёт C (≈ ±0,3 с, отдельный топ)';
/** v118: класс зачёта по сырому треку (то же правило, что на сервере): внешний ≥10 Гц → 'ab', иначе 'c'. */
function runClassOf(pts, { lap = false } = {}) {
  const src = traceSource(pts || []);
  if (src === 'sim') return 'sim';
  if (src === 'ext' && (lap || (traceStats(pts).hz || 0) >= DRAG_TOP_MIN_HZ - 0.5)) return 'ab';
  return 'c';
}
/** Паспорт замера (то же, что считает сервер): Гц, точность, точки, A/B/C, источник. */
function tracePassport(pts) {
  const st = traceStats(pts);
  const g = gradeTrace(st);
  // v118: телефон (и внешний < 10 Гц) — метка класса C, как на сервере; сырая оценка точности — в acq
  return { hz: st.hz, avgAcc: st.avgAcc, n: st.n, gpsQ: runClassOf(pts) === 'c' ? 'C' : g, acq: g, src: traceSource(pts) };
}
/** v105: строка паспорта замера: «12.0 Гц · ±1.4 м · 312 точек · A». */
function passportLine(tp) {
  if (!tp) return '';
  const parts = [];
  parts.push(tp.hz != null && Number.isFinite(tp.hz) ? `${Number(tp.hz).toFixed(1)} Гц` : '— Гц');
  parts.push(tp.avgAcc != null && Number.isFinite(tp.avgAcc) ? `±${Number(tp.avgAcc).toFixed(1)} м` : '±— м');
  parts.push(`${tp.n || 0} точек`);
  parts.push(tp.gpsQ || 'C');
  if (tp.src === 'phone') parts.push('телефон');
  return parts.join(' · ');
}
const SRC_LABEL = { ext: 'внешний GPS', phone: 'телефон', sim: 'симулятор' };
function packTrace(pts) {
  return pts && pts.length >= 2 ? encodeTrace(pts, traceSource(pts)) : null;
}

/** v104: коды отказа сервера → понятный русский текст (пороги не раскрываем). */
const REJECT_TEXT = {
  no_car: 'Выбери машину — тогда в топ. Замер сохранён у тебя.',
  no_account: 'В топ — только с аккаунтом. Войдите через Telegram; замер сохранён на устройстве.',
  gps_c: 'GPS слабый (класс C) — замер сохранён у вас, в топ не идёт.',
  manual_finish: 'Ручной финиш — круг только в личной истории. В топ идёт авто-пересечение линии С/Ф.',
  teleport: 'В треке скачок координат — замер не принят в топ.',
  speed_flag: 'Скорость или ускорение в треке физически невозможны — замер не принят в топ.',
  pause: 'В треке разрыв (GPS пропадал) — замер не принят в топ.',
  too_short: 'Дистанция не набрана или трек обрезан — замер не принят в топ.',
  simulator: 'Симулятор — только для проверки, в топ не идёт.',
  track_uncalibrated: 'Трасса ещё не откалибрована — круг только в личной истории.',
  phone_source: 'Топ и рекорды — только с чипом PITLANE GPS. Замер телефоном сохранён у вас (справочно, ≈).',
  low_hz: 'GPS обновлялся реже раза в секунду — замер не принят.',
  phone_disc: 'Телефон (~1 Гц) эту короткую отметку не меряет — в зачёт C идут 0–100, 100–200, ⅛ и ¼ мили, круги.',
  class_mismatch: 'Вызов A/B — нужен внешний GPS. С телефона брось свой вызов «телефон на телефон».',
  crew_ab_only: 'Борд экипажа и сезон — только A/B (внешний GPS). Круг телефоном — в топе «C · телефон».',
  stale: 'Замер слишком старый — отправьте свежий.',
  no_trace: 'Нет сырых точек GPS — обновите приложение и повторите замер.',
  duplicate: 'Этот трек уже зачтён другому аккаунту — не принят.',
  not_verified: 'Призрак принимается только к зачтённому сервером результату.',
  session_expired: 'Сессия закончилась — войдите через Telegram ещё раз.',
  offline: 'Нет связи с сервером — замер сохранён на устройстве.',
  queued: 'Нет сети — замер в очереди, уйдёт в топ при появлении связи.',
};
function rejectText(res) {
  const code = res && (res.code || (res.status === 401 ? 'no_account' : ''));
  return REJECT_TEXT[code] || (res && res.status ? 'Сервер не принял замер в топ.' : REJECT_TEXT.offline);
}
/** Итог отправки в топ → строка для статуса. */
function topVerdict(res) {
  if (res && res.ok && res.cls === 'c') return 'в зачёте C · телефон, проверено сервером';
  if (Array.isArray(res) || (res && res.ok)) return 'в топе · проверено сервером';
  return rejectText(res);
}

function onGpsPoint(pos) {
  const now = pos.timestamp || Date.now();
  _homeLastFix = { acc: Number(pos?.coords?.accuracy), at: Date.now() };
  pushRawFix(pos, now);
  GpsFusion.tick(now);
  const v = kmhFromCoords(pos.coords, now);
  kickSpeedLoop();
  const fus = GpsFusion.getState();
  // v100: Sochi chase (lap HUD or «Трек» card) follows the real GPS fix — phone, BLE chip or simulator
  if ((lapDrive.open && lapRun.trackId === 'sochi') || (sochiChase.curView === 'lap' && lapCardTrackId() === 'sochi')) {
    try {
      // raw fix: chase-match has its own along-track filter (the fusion KF on top would only add lag)
      sochiChaseFeedGps(pos.coords.latitude, pos.coords.longitude, v, {
        speed: pos.coords.speed, heading: pos.coords.heading,
        acc: fus.accEst != null ? fus.accEst : pos.coords.accuracy, ts: now,
      });
    } catch (_) {}
  }
  const acc = fus.accEst != null ? fus.accEst : pos.coords.accuracy;
  const rawAcc = pos.coords.accuracy;
  const accLabel = acc != null
    ? (`±${Math.round(acc)} м` + (fus.imuOn ? ' · fusion' : (fus.healthy ? ' · KF' : '')))
    : '—';
  setRunText('gpsAcc', accLabel === '—' ? '' : accLabel);
  if (v == null) {
    setRunText('runStatus', 'GPS холодный / indoor? Выйдите на улицу и подождите фикс.');
    return;
  }
  const vShow = displayKmh();
  setRunText('liveSpeed', String(vShow));
  hudZones(vShow);
  setRunText('boxLive', String(vShow));
  if (document.body.classList.contains('run-drive-on')) { setRunText('runDriveSpeed', String(vShow)); rdStatusUpdate(pos, now); }
  if (lapRun.active) onLapGps(pos, v);
  if (wifiMode() && !lapRun.active) wifiRunTick(pos, v, now);
  if (AS56.wait && !run.armed) as56Tick(pos, v, now);

  if (!run.armed) {
    let tip = wifiMode() ? 'PITLANE GPS по Wi-Fi живой. Стоите — замер вооружится сам' : 'GPS живой. Стоите — жмите «Старт»';
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
      ghostRunStill(now, pos.coords.latitude, pos.coords.longitude);
      if (pos.coords?.ext) {
        // Внешний GNSS: точный доплер позволяет брать старт с момента трогания (1 км/ч, интерполяция), как у Dragy
        if (v < 1) { run.extStill = { t: now, v }; run.t0Ext = null; }
        else if (run.extStill && !run.t0Ext) {
          const a = run.extStill;
          run.t0Ext = a.t + (now - a.t) * Math.max(0, Math.min(1, (1 - a.v) / Math.max(0.01, v - a.v)));
        }
      }
      setRunText('runFrom', 'ожидание старта');
      setRunText('runStatus', fus.zupt ? 'Вооружён · ZUPT (стойка чистая)' : 'Вооружён. Трогайтесь');
      rdReadyUpdate(v, pos);
    } else if (run.t0 && v >= 8) {
      if (pos.coords?.ext && run.t0Ext && run.t0 - run.t0Ext >= 0 && run.t0 - run.t0Ext < 4000) run.t0 = run.t0Ext;
      run.launched = true;
      setRunText('runFrom', 'пошли');
      setRunText('runStatus', 'Идёт разгон…');
      rdPhase('live');
      run.dist = 0; run.prevDist = 0; run.lastPos = null; run.lastFusT = now;
      ghostRunLaunch(now, v, pos.coords.latitude, pos.coords.longitude);
    } else {
      setRunText('runStatus', 'Для чистого 0–100 почти остановитесь (< 8 км/ч)');
      rdReadyUpdate(v, pos);
    }
    return;
  }

  // v117: позиция для призрака; дистанция, время и все отметки — из gps-core по сырому треку (как на сервере)
  const lat = fus.healthy && fus.lat != null ? fus.lat : pos.coords.latitude;
  const lon = fus.healthy && fus.lon != null ? fus.lon : pos.coords.longitude;
  if (lat != null && lon != null) { run.lastPos = { lat, lon }; run.lastFusT = now; }
  if (!run.rm) run.rm = createRunMarks();
  let S = null; let fresh = [];
  try { ({ S, fresh } = stepRunMarks(run.rm, rawSince(run.rawSeq0 || 0))); } catch (_) {}
  if (S && S.t0 != null) {
    run.dist = S.dist;
    setRunText('runDriveDist', String(Math.round(S.dist)));
    setRunText('rdTimer', Math.max(0, (now - S.t0) / 1000).toFixed(2));
    if (S.vmax > 0) rdGridSet('vmax', String(Math.round(S.vmax)), 'км/ч');
  }
  ghostRunPoint(now, v);
  for (const k of fresh) onRunMark(k, S);
  rdChartDirty();
  if (!prev) return;
  run.peak = Math.max(run.peak || 0, v);
  setRunText('runStatus', `Разгон: ${Math.round(v)} км/ч`);
  // v215: финиш — падение скорости подтверждено ≥ 0.5 с (на 25 Гц один шумный сэмпл больше не обрывает заезд)
  if (run.launched && run.peak >= 70 && v < run.peak - 12 && v < prev.v) run.dropT = run.dropT || now; else if (v >= run.peak - 8) run.dropT = 0;
  if (run.launched && run.peak >= 70 && run.dropT && now - run.dropT >= (pos.coords?.ext ? 500 : 0) && v < run.peak - 12) {
    // v117: итог для всех источников (Wi-Fi — по событию чипа или здесь, что раньше)
    finishRun();
    setRunText('runStatus', 'Скорость упала — замер записан');
  }
}

function startWatch() {
  if (extGps?.active()) {
    // Точки идут от внешнего приёмника (Bluetooth/симулятор) — геолокацию телефона не трогаем.
    void keepAwake(true);
    setRunText('runStatus', extGps.state() === 'sim' ? 'Симулятор PITLANE GPS: жмите «Старт»' : 'PITLANE GPS подключён — жмите «Старт»');
    return;
  }
  if (!navigator.geolocation) {
    setRunText('runStatus', 'В этом браузере нет Geolocation');
    return;
  }
  if (run.watchId != null) return;
  phoneSrc.pick = 'nat'; phoneSrc.nat = [0, 0]; phoneSrc.tg = [0, 0];
  run.watchId = navigator.geolocation.watchPosition(
    (pos) => { hideGeoDenied(); onPhoneFix(pos, 'nat'); },
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
    navigator.geolocation.getCurrentPosition((p) => onPhoneFix(p, 'nat'), () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 1800 });
    if (tmaLocationReady() && !phoneSrc.busy) { phoneSrc.busy = true; tmaGetLocation((p) => { phoneSrc.busy = false; if (p) onPhoneFix(p, 'tg'); }); }
  }, 400);
  // Screen Wake Lock; where it's missing (older iOS WebViews, Telegram) fall back to a muted looping video.
  void keepAwake(true);
  setRunText('runStatus', 'Запрос разрешения на геолокацию…');
}

/** v247: два источника телефона — браузерный Geolocation и Telegram LocationManager. Берём тот, что даёт доплер (speed). */
const phoneSrc = { pick: 'nat', nat: [0, 0], tg: [0, 0], busy: false };
function onPhoneFix(pos, s) {
  const st = phoneSrc[s]; st[0]++; if (pos?.coords?.speed != null && Number.isFinite(pos.coords.speed)) st[1]++;
  const r = (x) => (x[0] ? x[1] / x[0] : 0);
  if (phoneSrc.pick === 'nat' && phoneSrc.nat[0] >= 4 && phoneSrc.tg[0] >= 4 && r(phoneSrc.nat) < 0.5 && r(phoneSrc.tg) >= 0.8) phoneSrc.pick = 'tg';
  else if (phoneSrc.pick === 'tg' && r(phoneSrc.nat) >= 0.8) phoneSrc.pick = 'nat';
  if (s !== phoneSrc.pick) return;
  onGpsPoint(pos);
}
window.__phoneSrc = phoneSrc; // QA: какой источник выбран
function stopGeoWatch() {
  try { if (run.watchId != null) navigator.geolocation.clearWatch(run.watchId); } catch (_) {}
  run.watchId = null;
  if (run.pollId) clearInterval(run.pollId);
  run.pollId = null;
}

/* -------- v82: Внешний GPS (PITLANE GPS) — Web Bluetooth + симулятор, см. ext-gps.js / hardware/pitlane-gps -------- */
var extGps = null;
function extGpsRender(info) {
  const bar = document.getElementById('extGpsBar');
  const st = info?.state || 'off';
  document.body.classList.toggle('ext-gps-on', st === 'ble' || st === 'sim' || st === 'wifi');
  document.querySelectorAll('[data-gps-src]').forEach((b) => {
    const src = b.getAttribute('data-gps-src');
    const on = (src === 'phone' && st === 'off') || (src === 'ble' && (st === 'ble' || st === 'connecting')) || (src === 'sim' && st === 'sim') || (src === 'wifi' && st === 'wifi');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const rateRow = document.getElementById('extGpsRate');
  rateRow?.classList.toggle('hidden', !(st === 'ble' || st === 'sim'));
  if (st === 'wifi') document.getElementById('extGpsWifi')?.classList.remove('hidden');
  if (!bar) return;
  if (st === 'wifi') { wifiRender(info, bar); return; }
  if (st === 'off') { bar.textContent = 'Источник: GPS телефона (1 Гц на iPhone, до ~1–5 Гц на Android)'; bar.dataset.q = ''; return; }
  if (st === 'connecting') { bar.textContent = 'PITLANE GPS: подключение…'; bar.dataset.q = 'mid'; return; }
  const p = info.last;
  const hz = info.hz ? info.hz.toFixed(1) : '—';
  const parts = [st === 'sim' ? 'Симулятор' : (info.name || 'PITLANE GPS'), `${hz} Гц`];
  if (p) {
    parts.push(p.fixOk && p.fixType >= 3 ? `${p.numSV} спутн.` : (p.fixOk && p.fixType === 2 ? `2D · ${p.numSV} спутн.` : `нет фикса · ${p.numSV} спутн.`));
    parts.push(`±${p.hAcc.toFixed(1)} м`);
    parts.push(`±${p.sAcc.toFixed(2)} м/с`);
  } else {
    parts.push('ждём данные…');
  }
  const s = info.status;
  if (s && s.battmV) parts.push(`АКБ ${s.battPct}%`);
  if (s && !s.configured) parts.push('приёмник не настроен');
  if (info.lost) parts.push(`потери ${info.lost}`);
  bar.textContent = parts.join(' · ');
  const good = p && p.fixOk && p.fixType >= 3 && p.hAcc <= 2.5 && p.numSV >= 8 && info.hz >= 8;
  bar.dataset.q = good ? 'good' : (p && p.fixOk ? 'mid' : 'bad');
  const r = s?.rateHz || (info.hz >= 18 ? 25 : 10);
  document.querySelectorAll('[data-ext-rate]').forEach((b) => b.classList.toggle('on', Number(b.getAttribute('data-ext-rate')) === r));
}
function extGpsMsg(text) {
  const el = document.getElementById('extGpsMsg');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

/* -------- v116: PITLANE GPS по Wi-Fi (режим модема → Worker → сюда), см. worker/src/gpslive.js -------- */
const WIFI_SRC_KEY = 'pitlane-gps-src-v1';
const POP_LABEL = { '0-100': '0–100', '0-200': '0–200', '0-300': '0–300' };
const wifiAuto = { stillSince: 0 };
let wifiDevCache = null;
function fmtLag(ms) { return ms < 1000 ? `${Math.max(10, Math.round(ms / 10) * 10)} мс` : `${(ms / 1000).toFixed(1)} с`; }
function wifiMode() { try { return extGps?.state?.() === 'wifi'; } catch (_) { return false; } }
/* ——— v156: автостарт замера. «Готов» → GPS ждёт остановку (< 1 км/ч, ≥ 1 с) → трогание (> 1.5 км/ч две точки подряд
 * или ≥ 4 км/ч) само запускает замер — та же анимация и логика, что у «Старт». Ручной режим остаётся. ——— */
const AS56_KEY = 'pitlane-autostart-v1';
const AS56 = { wait: false, still: [], stillSince: 0, mv: 0, st: '' };
function as56Mode() { try { return localStorage.getItem(AS56_KEY) === '1'; } catch (_) { return false; } }
function as56Ui() {
  const sb = document.getElementById('h48Start'); if (!sb) return;
  const auto = as56Mode(); const st = !auto ? 'manual' : !AS56.wait ? 'ready' : AS56.stillSince ? 'still' : 'wait';
  if (AS56.st === st) return; AS56.st = st;
  const L = { manual: ['Старт', 'все отрезки'], ready: ['Готов', 'старт — когда тронетесь'], wait: ['Ждём', 'остановитесь · нажмите — отмена'], still: ['Трогайтесь', 'замер начнётся сам'] }[st];
  if (sb.firstChild?.nodeType === 3) sb.firstChild.nodeValue = L[0]; else sb.prepend(L[0]);
  const sub = document.getElementById('h56Sub'); if (sub) sub.textContent = L[1];
  sb.classList.toggle('h56-wait', st === 'wait' || st === 'still'); sb.dataset.st = st;
  sb.setAttribute('aria-label', st === 'manual' ? 'Старт замера' : st === 'ready' ? 'Готов: замер начнётся сам, когда тронетесь' : 'Автостарт ждёт трогания. Нажмите, чтобы отменить');
  document.querySelectorAll('#h56Mode [data-as56]').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.as56 === '1') === auto)));
}
function as56Start() {
  Object.assign(AS56, { wait: true, still: [], stillSince: 0, mv: 0 });
  startWatch(); void keepAwake(true);
  as56Ui();
}
function as56Stop() {
  if (!AS56.wait) return;
  Object.assign(AS56, { wait: false, still: [], stillSince: 0, mv: 0 });
  if (!lapRun.active && !run.armed) void keepAwake(false);
  as56Ui();
}
function as56Tick(pos, v, now) {
  const sp = Number(pos?.coords?.speed);
  const k = Number.isFinite(sp) && sp >= 0 && pos?.coords?.speed != null ? sp * 3.6 : v;
  if (k == null || !Number.isFinite(k)) return;
  if (k < 1) {
    if (!AS56.stillSince) AS56.stillSince = now || 1;
    AS56.still.push({ t: now, seq: rawSeq }); AS56.still = AS56.still.filter((x) => now - x.t <= 3000); AS56.mv = 0;
  } else if (!AS56.stillSince || now - AS56.stillSince < 1000) {
    if (k > 1.5) { AS56.stillSince = 0; AS56.still = []; AS56.mv = 0; } // ещё не стояли — ждём остановку
  } else if (k > 1.5) {
    AS56.mv++;
    if (AS56.mv >= 2 || k >= 4) { as56Fire(); return; }
  }
  as56Ui();
}
function as56Fire() {
  const seq0 = AS56.still.length ? Math.max(0, AS56.still[0].seq - 1) : null;
  Object.assign(AS56, { wait: false, still: [], stillSince: 0, mv: 0 });
  const sb = document.getElementById('h48Start');
  if (sb && sb.checkVisibility?.() !== false && document.getElementById('view-zamer')?.classList.contains('active')) {
    const r = sb.getBoundingClientRect();
    Object.assign(H53, { at: performance.now(), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), r: Math.round(r.width / 2) });
  }
  if (isTMA) { _hapKey = true; try { hap(30); } finally { _hapKey = false; } } else hap([18, 40, 18]);
  armRun({ quiet: true, rawSeq0: seq0 });
  as56Ui();
}
function safetyAccepted() { try { return !!localStorage.getItem(SAFETY_KEY); } catch (_) { return true; } }
function wifiRender(info, bar) {
  const w = info.wifi || {};
  const p = info.last;
  let txt; let q;
  if (w.link !== 'up') { txt = 'Wi-Fi: нет связи с сервером PITLANE — переподключаемся…'; q = 'bad'; }
  else if (!w.chipOn) { txt = 'Чип не в сети. iPhone: Режим модема → «Разрешать другим» + «Максимальная совместимость».'; q = 'bad'; }
  else if (!p || w.stale) { txt = 'Wi-Fi: чип в сети, ждём точки (нужен фикс GPS — открытое небо)…'; q = 'mid'; }
  else {
    const parts = ['PITLANE GPS · Wi-Fi', `${info.hz ? info.hz.toFixed(1) : '—'} Гц`];
    parts.push(p.fixOk && p.fixType >= 3 ? `${p.numSV} спутн.` : `нет фикса · ${p.numSV} спутн.`);
    parts.push(`±${p.hAcc.toFixed(1)} м`);
    if (w.lagMs != null) parts.push(`задержка ${fmtLag(w.lagMs)}`);
    if (info.status?.battmV) parts.push(`АКБ ${info.status.battPct}%`);
    if (w.buf) parts.push(`догружаем ${w.buf} т.`);
    txt = parts.join(' · ');
    q = p.fixOk && p.fixType >= 3 && p.hAcc <= 2.5 && info.hz >= 8 ? 'good' : 'mid';
  }
  bar.textContent = txt; bar.dataset.q = q;
  const ws = document.getElementById('wifiState');
  if (ws) { ws.textContent = txt; ws.dataset.q = q; }
  if (wifiDevCache && w.link === 'up') renderWifiDevs(wifiDevCache, w.chipOn);
}
function renderWifiDevs(d, chipOn) {
  const ul = document.getElementById('wifiDevs');
  if (!ul) return;
  ul.replaceChildren();
  const devs = Array.isArray(d?.devices) ? d.devices : [];
  if (!devs.length) { ul.appendChild(padEl('li', 'muted', 'Чип ещё не привязан к аккаунту')); return; }
  const liveId = chipOn ? (d.live?.devId || null) : null;
  devs.forEach((x) => {
    const li = padEl('li', '');
    const name = padEl('span', '', x.name || 'PITLANE GPS');
    const st = padEl('span', liveId === x.devId || (chipOn && devs.length === 1) ? 'on' : 'muted', liveId === x.devId || (chipOn && devs.length === 1) ? 'в сети' : 'не в сети');
    const b = padEl('button', '', 'Отвязать');
    b.type = 'button';
    b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await api.gpsRevoke(x.devId);
      if (r && r.ok) { wifiDevCache = r.devices ? { ...wifiDevCache, devices: r.devices } : wifiDevCache; renderWifiDevs(wifiDevCache, false); extGpsMsg('Чип отвязан: его токен больше не принимается. Новый код — «Привязать чип».'); }
      else { b.disabled = false; extGpsMsg('Не удалось отвязать — нет связи с сервером.'); }
    });
    li.append(name, st, b);
    ul.appendChild(li);
  });
}
async function refreshWifiDevs() {
  const d = await api.gpsDevices();
  if (d && d.ok) { wifiDevCache = d; renderWifiDevs(d, !!d.live?.online); }
  return d;
}
let _pairPoll = null;
async function wifiPair() {
  const box = document.getElementById('wifiPairBox');
  const r = await api.gpsPair();
  if (!r || !r.ok) {
    extGpsMsg(r?.code === 'devices_full' ? 'К аккаунту уже привязано 3 чипа — сначала отвяжите один.' : (r?.status === 429 ? 'Слишком много кодов подряд — попробуйте через час.' : 'Не удалось получить код — нужен вход и связь с сервером.'));
    return;
  }
  box?.classList.remove('hidden');
  setRunText('wifiPairCode', r.code);
  setRunText('wifiPairWait', 'Введите код на странице чипа (сеть PITLANE-GPS-XXXX). Привяжется, когда чип выйдет в сеть.');
  const n0 = (wifiDevCache?.devices || []).length;
  const until = Date.now() + (r.ttl || 1200) * 1000;
  clearInterval(_pairPoll);
  _pairPoll = setInterval(async () => {
    if (Date.now() > until) { clearInterval(_pairPoll); setRunText('wifiPairWait', 'Код истёк — получите новый.'); return; }
    if (document.visibilityState !== 'visible') return;
    const d = await refreshWifiDevs();
    if (d && d.ok && (d.devices || []).length > n0) {
      clearInterval(_pairPoll);
      box?.classList.add('hidden');
      extGpsMsg('Чип привязан. Как только он выйдет в сеть, здесь появятся точки.');
    }
  }, 5000);
}
function startWifiSource() {
  if (!isRemoteApi() || !currentUser()) {
    document.getElementById('extGpsWifi')?.classList.remove('hidden');
    extGpsMsg('Чтобы привязать чип, войдите через Telegram во вкладке «Аккаунт».');
    return;
  }
  extGps.connectWifi({
    open: async (fails) => {
      if (fails > 0) { try { await api.gpsDevices(); } catch (_) {} } // обновит access-токен, если истёк
      return api.gpsLiveSocket();
    },
  });
  try { localStorage.setItem(WIFI_SRC_KEY, 'wifi'); } catch (_) {}
  document.getElementById('extGpsWifi')?.classList.remove('hidden');
  void refreshWifiDevs();
}
/** Карточка шейра — вместе с итогом (для всех источников): во время заезда только запоминаем. */
function runShare(payload) {
  if (run.armed || run.summary) {
    run.pendingShare = payload;
    if (run.summary) { rdShareAugment(); rdFinalButtons(); rdDeltas(); }
    return;
  }
  openShareCard(payload);
}
const wifiShare = runShare;
function showMarkPop(key, sec, src, lagMs, at) {
  if (!(run.armed || run.chipOnly) || run.summary || !(sec > 0)) return;
  run.pops = run.pops || {};
  const prevPop = run.pops[key];
  const box = document.getElementById('runDrivePop');
  if (prevPop) {
    // правда — gps-core по сырому треку; значение чипа — только ранний показ, пока точки в пути
    if (src === 'chip' || prevPop.src === 'core') return;
    prevPop.src = 'core'; prevPop.sec = sec;
    if (box?.dataset.k === key) { setRunText('runPopV', fmtRunSec(sec)); setRunText('runPopN', popNote('core')); }
    return;
  }
  run.pops[key] = { sec, src, lagMs, at: Date.now() };
  if (src === 'chip') rdGridSet(key, sec.toFixed(2), 'чип', { flash: true, pre: true });
  if (!box) return;
  box.dataset.k = key;
  setRunText('runPopK', POP_LABEL[key] || key);
  setRunText('runPopV', fmtRunSec(sec));
  setRunText('runPopN', popNote(src, lagMs));
  box.classList.remove('hidden', 'pop-in', 'pop-out');
  void box.offsetWidth;
  box.classList.add('pop-in');
  clearTimeout(run.popTimer);
  run.popTimer = setTimeout(() => box.classList.add('pop-out'), 2600); // отметка остаётся в сетке
  markHap();
  try { (window.__plPopLog = window.__plPopLog || []).push({ key, sec, src, lagMs, at: at ?? null, shownAt: Date.now() }); } catch (_) {}
}
function popNote(src, lagMs) {
  const s0 = traceSource(rawTrace.slice(-5));
  const base = s0 === 'phone' ? 'справочно · телефон · зачёт C' : s0 === 'sim' ? 'справочно · симулятор' : 'справочно';
  return src === 'chip' ? base + ' · посчитал чип' + (lagMs != null ? ` · пришло за ${fmtLag(lagMs)}` : '') : base;
}
/** Каждая точка Wi-Fi: авто-«Старт» на стоянке, перезапуск, если тронулся и встал без 100; итог по событию чипа. */
function wifiRunTick(pos, v, now) {
  if (run.pendingEnd && now >= run.pendingEnd.at) { finishWifiRun('chip'); return; }
  if (run.summary || run.chipOnly) return; // итог на экране — ждём «Закрыть» / «Ещё заезд»
  const fresh = (pos.ext?.ageMs ?? 0) < 5000; // старые точки (догрузка из буфера) не вооружают
  const fixOk = (pos.ext?.fixType ?? 3) >= 3;
  if (v < 1.5 && fixOk && fresh) { if (!wifiAuto.stillSince) wifiAuto.stillSince = now; }
  else wifiAuto.stillSince = 0;
  if (!wifiAuto.stillSince || now - wifiAuto.stillSince < 800) return;
  if (!run.armed) { if (safetyAccepted()) armRun({ quiet: true, auto: true }); }
  else if (run.launched && !run.saved0100) armRun({ quiet: true, auto: true });
}
function onWifiEvent(ev) {
  if (!wifiMode() || !ev) return;
  const old = (ev.ageMs ?? 0) > 20000; // повтор старого заезда при переподключении — не показываем
  if (ev.e === 'mark' && POP_LABEL[ev.k]) {
    if (old || lapRun.active) return;
    if (!run.armed && !run.summary && !run.chipOnly) {
      // разгон начался, пока точки не доходили: показываем хотя бы отметки чипа
      openRunDrive('live'); run.chipOnly = true; run.pops = {};
      setRunText('runDriveMsg', 'разгон начался без связи — отметки чипа, точки догружаются');
    }
    showMarkPop(ev.k, ev.ms / 1000, 'chip', ev.lagMs, ev.at);
  } else if (ev.e === 'end') {
    if (old) return;
    if (run.armed && run.launched) {
      run.pendingEnd = { at: Number(ev.at) || Date.now(), ev };
      const last = rawTrace[rawTrace.length - 1];
      if (last && last.t >= run.pendingEnd.at) finishWifiRun('chip');
      else setTimeout(() => { if (run.pendingEnd) finishWifiRun('chip-timeout'); }, 8000);
    } else if (run.chipOnly) {
      renderChipOnlySummary(ev);
    }
  }
}
function finishRun() {
  if (!run.armed || run.summary) return;
  run.pendingEnd = null;
  stopRun();
  run.summary = true;
  renderRunSummary();
}
function finishWifiRun() { finishRun(); }
function wifiSummaryReset() {
  document.body.classList.remove('run-sum-on');
  document.getElementById('runDrivePop')?.classList.add('hidden');
  ['runDriveDuel', 'runDriveAgain', 'runDriveShare'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  setRunText('runDriveStop', 'Стоп');
  if (typeof run !== 'undefined' && run) { run.summary = false; run.chipOnly = false; run.sumPts = null; }
}
function rdFinalButtons() {
  const has = !!run.pendingShare;
  document.getElementById('runDriveShare')?.classList.toggle('hidden', !has);
  document.getElementById('runDriveDuel')?.classList.toggle('hidden', !has);
  document.getElementById('runDriveAgain')?.classList.remove('hidden');
  setRunText('runDriveStop', 'Закрыть');
}
/** К карточке шейра — кривая скорости и отметки (без координат), тот же расчёт, что в итоге. */
function rdShareAugment() {
  const p = run.pendingShare; const S = run.rm?.S;
  if (!p || !S || !run.sumPts) return;
  try { const c = shareCurve(run.sumPts, S); if (c) p.curve = c; p.splits = shareSplits(S); } catch (_) {}
  // v118: паспорт на карточке = паспорт итога (весь заезд), а не срез на момент сохранения 0–100 (было 73 vs 231 точка)
  try {
    const tp = tracePassport(run.sumPts); p.n = tp.n; p.hz = tp.hz; p.avgAcc = tp.avgAcc;
    // v118: на карточке телефона — только отметки зачёта C (60 ft / 0–50 телефон не меряет)
    if (tp.gpsQ === 'C' && tp.src !== 'sim' && p.splits) for (const k of (tp.src === 'phone' ? phoneOffDiscs(tp, S) : PHONE_NO_DISCS)) delete p.splits[k];
  } catch (_) {}
}
/** Дельты под главным результатом: к своему лучшему и к стоку (те же, что на карточке). */
function rdDeltas() {
  const p = run.pendingShare;
  const d = document.getElementById('rdHeroD'); const st = document.getElementById('rdHeroS');
  if (!d || !st) return;
  const isHero0100 = document.getElementById('rdHeroK')?.textContent === '0–100';
  const dt = p && isHero0100 ? pbDeltaText(p, true) : null;
  d.className = 'rd-delta' + (dt ? ' ' + dt.cls : '');
  d.textContent = dt ? dt.text : ''; d.hidden = !dt;
  // v153: новый личный рекорд — число проявляется медленно, по герою один раз проходит тонкая платиновая линия
  if (p && isHero0100 && Number.isFinite(p.pbD) && p.pbD <= -0.005 && run.pbAnimFor !== p) { run.pbAnimFor = p; rd53Pb(); }
  let sText = ''; let sCls = '';
  if (p && isHero0100 && Number.isFinite(p.stD) && p.stLab) { sText = stockDeltaText(p.stD, p.stLab); sCls = p.stD <= -0.005 ? 'faster' : (p.stD >= 0.005 ? 'slower' : 'even'); }
  else if (p && isHero0100 && p.stNone === true) { sText = 'стокового времени здесь пока нет'; sCls = 'first'; }
  st.className = 'rd-delta' + (sCls ? ' ' + sCls : '');
  st.textContent = sText; st.hidden = !sText;
  if (p && isHero0100 && !Number.isFinite(p.stD) && !p.stNone && shareStockEligible(p) && !run.stockAsked) {
    run.stockAsked = true;
    try { requestShareStock(p); } catch (_) {}
    [1200, 3500].forEach((ms) => setTimeout(() => { if (run.summary && run.pendingShare === p) rdDeltas(); }, ms));
  }
}
function rd53Pb() {
  const hero = document.querySelector('#rdFinal .rd-hero'); if (!hero) return;
  hero.classList.remove('rd53-pb'); void hero.offsetWidth; hero.classList.add('rd53-pb');
}
window.__rd53Pb = rd53Pb; // скриншоты/отладка
window.__rd178 = (ph = 'live', v = 0) => { try { openRunDrive(ph); rdPhase(ph); hudZones(v, true); } catch (e) { return String(e); } return true; }; // v178: QA — экран замера в фазе live/final
function rdBadge(tp) {
  const b = document.getElementById('rdBadge');
  if (!b) return;
  const topOk = /в топе · проверено|в зачёте C · телефон/.test(run.topMsg || '');
  let text; let q;
  if (tp.src === 'phone') { text = 'телефон · справочно ≈'; q = 'C'; }
  else if (tp.src === 'sim') { text = 'симулятор · не в топ'; q = 'off'; }
  else { text = `GPS ${tp.gpsQ}` + (topOk ? ' · в топе' : tp.gpsQ === 'C' ? ' · не в топ' : ''); q = tp.gpsQ === 'C' ? 'off' : tp.gpsQ; }
  b.textContent = text;
  b.dataset.q = q;
}
function wifiSummaryVerdict() {
  if (!run.summary) return;
  setRunText('rdNote', wifiNote());
  try { const tp = tracePassport(run.sumPts || rawSince(run.rawSeq0 || 0)); rdBadge(tp); rdTrust(tp); } catch (_) {}
  try { void rcVerdict(); } catch (_) {} // v287
}
/** v280: значок доверия — источник, Гц, точность, уклон, «проверено сервером». Только то, что реально посчитал движок. */
function rdTrust(tp) {
  const box = document.getElementById('rdTrust');
  if (!box) return;
  box.replaceChildren();
  if (!tp || tp.src === 'sim') { box.hidden = true; return; }
  const chips = [];
  chips.push(tp.src === 'ext' ? 'чип PITLANE GPS' : 'телефон');
  if (Number.isFinite(tp.hz) && tp.hz > 0) chips.push(`${Number(tp.hz).toFixed(tp.hz >= 10 ? 0 : 1)} Гц`);
  if (Number.isFinite(tp.avgAcc) && tp.avgAcc > 0) chips.push(`±${Number(tp.avgAcc).toFixed(1)} м`);
  const el = run.trustEl;
  if (el && Number.isFinite(el.slope)) chips.push(`уклон ${el.slope > 0 ? '+' : ''}${el.slope.toFixed(1)}%`);
  for (const c of chips) box.appendChild(padEl('span', 'rd-tr', c));
  if (/в топе · проверено|в зачёте C · телефон/.test(run.topMsg || '')) box.appendChild(padEl('span', 'rd-tr ok', 'проверено'));
  box.hidden = !chips.length;
}
function wifiNote() {
  const tp = tracePassport(run.sumPts || rawSince(run.rawSeq0 || 0));
  const verdict = run.topMsg || (run.saved0100 ? 'в топ — проверяем на сервере…' : 'до 100 не дошло — в топ нечего');
  const v = String(verdict);
  return `На экране — справочно. ${v.charAt(0).toUpperCase()}${v.slice(1)} · ${passportLine(tp)}`;
}
function rdRow(tb, label, a, b, cls, k, sec) {
  const dl = k ? r275Dl(k, sec) : null;
  const tr = padEl('tr', (cls || '') + (dl?.cls === 'up' ? ' r275-pbrow' : ''));
  const th = padEl('th', '', label); if (dl?.cls === 'up') th.appendChild(padEl('small', 'r275-pbtag', 'PB'));
  tr.append(th, padEl('td', '', a), padEl('td', dl ? 'r275-dl ' + dl.cls : '', dl ? dl.text : (b || '')));
  if (dl && b) tr.children[2].title = b;
  tb.appendChild(tr);
}
/** Итог заезда (все источники): главный результат, график, дистанция / ¼ мили / уклон, таблица, бейдж, дельты. */
function renderRunSummary() {
  const pts = rawSince(run.rawSeq0 || 0);
  run.sumPts = pts;
  let S = null;
  try { S = coreDragSplits(pts, undefined, { rollout: rolloutOn() }); } catch (_) { S = { t0: null, marks: {}, dist: 0, vmax: 0 }; }
  if (!run.rm) run.rm = createRunMarks();
  run.rm.S = S;
  rdPhase('final');
  const M = S.marks;
  const chip = (k) => (run.pops?.[k]?.src === 'chip' ? run.pops[k].sec : null);
  const tp0 = tracePassport(pts);
  const off0 = phoneOffDiscs(tp0, S); const isPh = tp0.src === 'phone';
  for (const k of off0) if (isPh && off0.length > PHONE_NO_DISCS.length) delete M[k]; // v247: при < 5 Гц / без доплера — не показываем
  const fmtS = (sec, k) => (isPh && M[k] ? fmtPhoneSec(sec, tp0, S) : fmtRunSec(sec));
  const heroK = ['0-100', '402m', '201m', '0-60', '60ft'].filter((k) => !(isPh && PHONE_NO_DISCS.includes(k))).find((k) => M[k]) || (chip('0-100') ? '0-100' : null);
  setRunText('rdHeroK', heroK ? RM_LABEL[heroK] + (isPh ? ' · телефон' : '') : 'Vmax');
  setRunText('rdHeroV', heroK ? fmtS(M[heroK]?.sec ?? chip(heroK), heroK) : (S.vmax > 0 ? `${Math.round(S.vmax)} км/ч` : '—'));
  setRunText('rdStDist', S.t0 != null ? `${Math.round(S.dist)} м` : '—');
  const q = M['402m'] ? '402m' : M['201m'] ? '201m' : null;
  setRunText('rdStQK', q ? RM_LABEL[q] : '¼ мили');
  setRunText('rdStQ', q ? `${M[q].sec.toFixed(2)} с @${Math.round(M[q].v)}` : '—');
  let el = null;
  try { el = rmElevation(pts, S.t0, M['402m']?.t ?? S.tEnd, M['402m'] ? 402.336 : S.dist); } catch (_) {}
  const tp = tracePassport(pts);
  if (el) {
    setRunText('rdStSlope', `${el.slope > 0 ? '+' : ''}${el.slope.toFixed(1)}%`);
    setRunText('rdStSlopeN', `перепад ${el.dAlt > 0 ? '+' : ''}${el.dAlt.toFixed(1)} м · по высоте GPS`);
  } else {
    setRunText('rdStSlope', '—');
    setRunText('rdStSlopeN', tp.src === 'ext' ? 'чип не передаёт высоту' : 'нет высоты в точках');
  }
  const tb = document.getElementById('rdTable');
  if (tb) {
    tb.replaceChildren();
    const head = padEl('tr', 'h'); head.append(padEl('th', '', 'отметка'), padEl('td', '', 'время'), padEl('td', '', 'скорость · путь')); tb.appendChild(head);
    // v118: у телефона (зачёт C) 60 ft короче 2–3 точек — показываем справочно, с пометкой «вне зачёта»
    const offC = (k) => tp.gpsQ === 'C' && tp.src !== 'sim' && PHONE_NO_DISCS.includes(k);
    for (const k of RM_DIST) if (M[k] && !(isPh && offC(k))) rdRow(tb, RM_LABEL[k], isPh ? fmtPhoneSec(M[k].sec, tp0, S) : M[k].sec.toFixed(2) + ' с', `${Math.round(M[k].v)} км/ч`, offC(k) ? 'off' : '', isPh ? null : k, M[k].sec);
    const span = (a, b) => (M[a]?.d != null && M[b]?.d != null ? `${Math.round(M[b].d - M[a].d)} м` : '');
    const speedRows = [['0-60', ''], ['0-100', ''], ['100-200', span('0-100', '0-200')], ['0-200', ''], ['200-300', span('0-200', '0-300')], ['0-300', ''], ['80-120', '']];
    for (const [k, path] of speedRows) {
      const sec = M[k]?.sec ?? chip(k);
      if (!(sec > 0)) continue;
      const via = !M[k] ? 'чип' : k.startsWith('0-') && M[k].d != null ? `${Math.round(M[k].d)} м` : path;
      rdRow(tb, RM_LABEL[k], isPh && M[k] ? fmtPhoneSec(sec, tp0, S) : sec.toFixed(2) + ' с', via, k === heroK ? 'hero' : '', isPh ? null : k, sec);
    }
    if (S.vmax > 0) rdRow(tb, 'Vmax', `${Math.round(S.vmax)} км/ч`, '');
    if (tb.children.length === 1) rdRow(tb, 'До 60 км/ч не дошло', '—', '');
  }
  document.getElementById('rdChartBox')?.classList.toggle('empty', !(S.t0 != null && pts.length >= 2));
  rdBadge(tp);
  run.trustEl = el; rdTrust(tp); // v280
  { // v215: честная пометка точности от движка замера
    const why = (S.reasons || []).filter((r) => REASON_RU[r]).map((r) => REASON_RU[r]);
    const note = wifiNote();
    setRunText('rdNote', (why.length ? (S.approx ? '≈ ' : '⚠ ') + why.join(' · ') + (note ? ' · ' : '') : '') + (note || ''));
  }
  rdShareAugment();
  rdFinalButtons();
  rdDeltas();
  setRunText('runDriveMsg', '');
  try { run.rc = rcFromRun(S, tp, el, pts); run.rc.pending = !!run.saved0100 && !run.topMsg; if (run.topMsg) void rcVerdict(); rcOpen(run.rc); } catch (e) { console.warn('rc', e); } // v287
}
const renderWifiSummary = renderRunSummary;
function renderChipOnlySummary(ev) {
  const m = ev.marks || {};
  run.summary = true; run.chipOnly = false; run.sumPts = [];
  run.rm = createRunMarks();
  run.rm.S = { t0: null, marks: {}, dist: 0, vmax: 0 };
  rdPhase('final');
  const k0 = m['0-100'] > 0 ? '0-100' : null;
  setRunText('rdHeroK', k0 ? '0–100' : 'Vmax');
  setRunText('rdHeroV', k0 ? fmtRunSec(m['0-100'] / 1000) : (ev.vmax > 0 ? `${Math.round(ev.vmax)} км/ч` : '—'));
  ['rdStDist', 'rdStQ', 'rdStSlope'].forEach((id) => setRunText(id, '—'));
  setRunText('rdStSlopeN', '');
  const tb = document.getElementById('rdTable');
  if (tb) {
    tb.replaceChildren();
    for (const k of ['0-100', '0-200', '0-300']) if (m[k] > 0) rdRow(tb, POP_LABEL[k], (m[k] / 1000).toFixed(2) + ' с', 'чип', k === '0-100' ? 'hero' : '');
    if (ev.vmax > 0) rdRow(tb, 'Vmax', `${Math.round(ev.vmax)} км/ч`, 'чип');
  }
  document.getElementById('rdChartBox')?.classList.add('empty');
  const b = document.getElementById('rdBadge'); if (b) { b.textContent = 'только чип · не в топ'; b.dataset.q = 'off'; }
  { const tr = document.getElementById('rdTrust'); if (tr) { tr.replaceChildren(); tr.hidden = true; } }
  setRunText('rdNote', 'Только отметки чипа: точки не дошли до приложения. В топ не ушло.');
  rdFinalButtons();
  rdDeltas();
}

function initExtGps() {
  extGps = createExtGps({
    isTMA,
    onPoint: (pos) => { hideGeoDenied(); onGpsPoint(pos); },
    onStatus: (info) => extGpsRender(info),
    onEvent: (ev) => onWifiEvent(ev),
    onState: (state) => {
      if (state === 'wifi') {
        stopGeoWatch();
        extGpsMsg('');
        setRunText('runStatus', 'PITLANE GPS по Wi-Fi: стоите — замер вооружится сам, трогайтесь');
      } else if (state === 'ble' || state === 'sim') {
        stopGeoWatch();
        extGpsMsg(state === 'sim' ? 'Симулятор: стоим 4 с, разгон до 230, торможение — по кругу. Жмите «Старт». В топ и дуэли не идёт.' : '');
        if (run.armed || lapRun.active) void keepAwake(true);
        setRunText('runStatus', state === 'sim' ? 'Симулятор PITLANE GPS: жмите «Старт»' : 'PITLANE GPS подключён — жмите «Старт»');
      } else if (state === 'off') {
        extSpeedTs = 0;
        resetSpeedFilter();
        document.getElementById('extGpsWifi')?.classList.add('hidden');
        if (run.armed || lapRun.active) {
          extGpsMsg('Внешний GPS отключился — переключились на GPS телефона.');
          startWatch();
        }
      }
      extGpsRender(extGps.info());
    },
  });
  extGpsRender(extGps.info());
  // v105: на iPhone/iPad Web Bluetooth нет — вместо кнопки объяснение, почему топ разгонов недоступен
  try {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const bleBtn = document.querySelector('[data-gps-src="ble"]');
    if (ios && bleBtn) {
      bleBtn.hidden = true;
      const note = document.getElementById('extGpsIosNote');
      if (note) {
        note.hidden = false;
        note.textContent = 'На iPhone чип работает по Wi-Fi через Режим модема, задержка меньше секунды. Телефон — отдельный зачёт C (≈ ±0,3 с), с A/B не смешивается.';
      }
    }
  } catch (_) {}
  document.querySelectorAll('[data-gps-src]').forEach((b) => b.addEventListener('click', async () => {
    const src = b.getAttribute('data-gps-src');
    hap(10);
    if (src === 'phone') {
      extGps.disconnect();
      extGpsMsg('');
      try { localStorage.removeItem(WIFI_SRC_KEY); } catch (_) {}
      return;
    }
    if (src === 'wifi') {
      withSafety(startWifiSource)();
      return;
    }
    if (src === 'sim') {
      extGps.startSim(10);
      return;
    }
    const why = extGps.unsupportedReason();
    if (why) { extGpsMsg(why); return; }
    extGpsMsg('Выберите «PITLANE-GPS-…». Нужны Bluetooth и геолокация.');
    try {
      await extGps.connect();
      extGpsMsg('');
    } catch (e) {
      extGpsMsg(`Не удалось подключиться: ${e?.message || e}`);
    }
  }));
  document.querySelectorAll('[data-ext-rate]').forEach((b) => b.addEventListener('click', async () => {
    const r = Number(b.getAttribute('data-ext-rate'));
    try {
      const ok = await extGps.setRate(r);
      if (!ok) extGpsMsg('Приёмник не поддерживает смену частоты');
      else if (r === 25) extGpsMsg('25 Гц: только GPS (одно созвездие). На части приборов останется 10 Гц.');
      else extGpsMsg('');
    } catch (e) { extGpsMsg(`Ошибка: ${e?.message || e}`); }
  }));
}
try { initExtGps(); } catch (e) { console.warn('[ext-gps] init', e); }
try {
  document.getElementById('wifiPairBtn')?.addEventListener('click', () => { void wifiPair(); });
  const mh = document.getElementById('markHaptic');
  if (mh) { mh.checked = markHapticOn(); mh.addEventListener('change', () => { try { localStorage.setItem(MARK_HAPTIC_KEY, mh.checked ? '1' : '0'); } catch (_) {} if (mh.checked) markHap(); }); }
  // v116: источник Wi-Fi помним — при следующем открытии сразу ждём чип (если вход выполнен и согласие уже дано)
  setTimeout(() => {
    try { if (localStorage.getItem(WIFI_SRC_KEY) === 'wifi' && safetyAccepted() && currentUser() && isRemoteApi() && extGps.state() === 'off') startWifiSource(); } catch (_) {}
  }, 1200);
} catch (e) { console.warn('[wifi-gps] init', e); }

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
        ? 'Нужен GPS. «Открыть настройки» → разрешите геопозицию → «Повторить».'
        : 'Нужен GPS. Настройки → Telegram → Геопозиция → «При использовании», затем «Повторить».')
      : 'Нужен GPS. Разрешите геопозицию сайту в браузере → «Повторить».';
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

function armRun(opts = {}) {
  resetSpeedFilter();
  void GpsFusion.enableImu().then((ok) => {
    if (!ok) setRunText('runStatus', 'IMU недоступен — GPS-only fusion. На iOS: разрешите «Движение и ориентация».');
  });

  if (!opts.quiet) hap([18, 40, 18]);
  startWatch();
  void keepAwake(true); // re-acquire each arm (the watch may already be running from a previous run)
  run.armed = true;
  try { markFirstRun(); } catch (_) {}
  run.launched = false;
  run.samples = [];
  run.rawSeq0 = opts.rawSeq0 != null ? opts.rawSeq0 : rawSeq; // v156: автостарт берёт трек с момента остановки; v104: сырой трек замера — с этой точки
  run.t0 = null;
  run.t0Ext = null;
  run.extStill = null;
  run.marks = {};
  run.accSum = 0;
  run.accN = 0;
  run.flags = [];
  run.revealed = {};
  run.peak = 0; run.dropT = 0;
  run.dist = 0;
  run.prevDist = 0;
  run.lastPos = null;
  run.lastFusT = null;
  run.saved0100 = run.saved100200 = run.saved200300 = run.saved050 = run.saved060 = run.saved80120 = run.saved1000 = false;
  run.saved60ft = run.saved18 = run.saved14 = false;
  run.passportFolded = {};
  run.brakeArmed = false;
  run.brakeT0 = null;
  run.pops = {}; run.pendingShare = null; run.pendingEnd = null; run.topMsg = ''; run.summary = false; run.auto = !!opts.auto;
  run.rm = createRunMarks(); run.stockAsked = false; run.sumPts = null;
  try { run.pb0 = r275PbSnap(); } catch (_) { run.pb0 = {}; }
  wifiSummaryReset();
  ['run050', 'run0100', 'run100200', 'run80120', 'run200300', 'run1000'].forEach((id) => setRunText(id, '—'));
  setRunText('runFrom', 'вооружён');
  setRunText('runStatus', 'Вооружён. Почти остановитесь и газуйте');
  openRunDrive();
  ghostRunArm();
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
  try { _lastRunTrace = { type: 'drag', trace: packTrace(rawSince(run.rawSeq0 || 0)) }; } catch (_) {}
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
      const tp = tracePassport(rawSince(run.rawSeq0 || 0));
      rec0.pass0100 = { ...tp, top: false };
      save();
      setRunText('runDriveMsg', 'Паспорт: ' + passportLine(tp) + ' · в топ — после входа');
      run.topMsg = 'в топ — после входа';
      wifiShare(buildSharePayload({
        type: '0-100',
        time: Number(rec0.v0100).toFixed(2) + ' с',
        valid: false,
        src: tp.src,
        n: tp.n,
        car: currentCar().name,
        gpsQ: tp.gpsQ,
        avgAcc: tp.avgAcc,
        hz: tp.hz,
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
    // v118: телефон в паспорт «честных» A/B не идёт (метка C)
    if (runClassOf(rawSince(run.rawSeq0 || 0)) !== 'ab') gqFold.gpsQ = 'C';
    foldPassportGps({
      v0100: v0100 != null ? Number(v0100.toFixed(2)) : null,
      v100200: v100200 != null ? Number(v100200.toFixed(2)) : null,
      v200300: v200300 != null ? Number(v200300.toFixed(2)) : null,
    }, gqFold.gpsQ);
  } catch (_) {}
  save();
  const who = (profile()?.nick) || currentUser()?.nick || 'пилот';
  if (v0100 != null) {
    const tp = tracePassport(rawSince(run.rawSeq0 || 0));
    let valid = false;
    {
      // v104: решает сервер по сырому треку; клиентские gpsQ / valid не отправляются
      const pts = rawSince(run.rawSeq0 || 0);
      const pc = pickedCar();
      const pSub = !pc?.id ? Promise.resolve({ ok: false, code: 'no_car' }) : api.addStraight(pc.id, {
        ...chalField('0-100'), // v280
        name: String(who).slice(0, 24),
        car: pc.name,
        weather: lapDrive.weather || undefined,
        trace: packTrace(pts),
      });
      _topSubmitP = pSub.catch(() => null);
      const res = await pSub;
      valid = Array.isArray(res) || !!(res && res.ok);
      if (valid) { chalAfterRun('0-100'); funnelEv('run', 'once'); } // v280
      { const w = wxFromRes(res); if (w) { rec.wx = w; showRunWx(w); } else showRunWx(null); } // v128
      const msg = topVerdict(res);
      run.topMsg = msg;
      if (run.summary) wifiSummaryVerdict();
      setRunText('runDriveMsg', msg + ' · ' + passportLine(tp));
      setRunText('runStatus', msg);
    }
    rec.pass0100 = { ...tp, top: valid };
    save();
    pushSlip();
    const payload = buildSharePayload({
      type: '0-100',
      time: Number(rec.v0100).toFixed(2) + ' с',
      valid,
      src: tp.src,
      n: tp.n,
      car: currentCar().name,
      nick: String(who),
      gpsQ: tp.gpsQ,
      avgAcc: tp.avgAcc,
      hz: tp.hz,
      paint: getStoredPaintHex() || undefined,
      wx: rec.wx || undefined,
    });
    wifiShare(payload);
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
  mapModeUser: false, // v96: user picked a map mode during this HUD session
};

const LH58_ON = true; // v158: новый HUD круга
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
  const title = o.title || 'Битва секторов';
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
    host.innerHTML = '<p class="muted tiny">Битва секторов — проедьте 2+ круга с секторами на этой трассе</p>';
    host.hidden = false;
    return;
  }
  const latest = withSec[0];
  const nSec = withSec.length;
  host.innerHTML = buildSectorBattleHtml(trackId, latest, {
    title: nSec >= 2 ? 'Битва секторов · последний и лучшие' : 'Битва секторов · первый круг с секторами',
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

function topsPilotRowHtml({ rank, name, avatar, sub, timeHtml, pilotId }) {
  const nick = esc(name || 'пилот');
  const subHtml = sub ? `<span class="tp-sub">${esc(sub)}</span>` : '';
  // v83: tap on an account row → public profile
  const pid = /^p_[0-9a-f-]{36}$/.test(String(pilotId || '')) ? pilotId : '';
  return (pid ? `<li class="tp-link" data-pilot="${esc(pid)}" role="button" tabindex="0" aria-label="Профиль: ${nick}">` : `<li>`)
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
  // v120: секторы — только когда набралось SHOW_MIN.sectors заездов
  showWhen('sectorTopsCard', rows.length >= SHOW_MIN.sectors);
  showWhen('btnSectorTopsOpen', rows.length >= SHOW_MIN.sectors);
  if (!rows.length) {
    listEl.innerHTML = '';
    if (hint) hint.textContent = 'пока нет валидных заездов — проедьте круг A/B с секторами';
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
    pilotId: r.pilotId,
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
  lapDrive.mapMode = mode === 'nav' ? 'nav' : mode === 'chase' ? 'chase' : 'overview';
  const root = document.getElementById('lapDrive');
  root?.classList.toggle('mode-nav', lapDrive.mapMode === 'nav');
  root?.classList.toggle('mode-overview', lapDrive.mapMode !== 'nav');
  document.getElementById('btnMapOverview')?.classList.toggle('on', lapDrive.mapMode === 'overview');
  document.getElementById('btnMapNav')?.classList.toggle('on', lapDrive.mapMode === 'nav');
  document.getElementById('btnMapChase')?.classList.toggle('on', lapDrive.mapMode === 'chase');
  try {
    if (isLapSatMapActive()) setLapSatMapMode(lapDrive.mapMode === 'nav' ? 'nav' : 'overview');
  } catch (_) {}
  updateLapCarOnMap();
  try { sochiChaseSync(); } catch (_) {}
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
  ghostSimRoute(trackId, true);
  void ghostLoad('lap');
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
  // v96: Sochi → 3D chase (behind the car) is the default HUD view unless reduced-motion
  lapDrive.mapModeUser = false;
  if (trackId === 'sochi' && !sochiReduceMotion() && typeof THREE !== 'undefined' && !LH58_ON) lapDrive.mapMode = 'chase'; // v158: свой HUD с мини-картой — 3D-погоня под ним не крутится
  else if (lapDrive.mapMode === 'chase') lapDrive.mapMode = 'overview';
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
      mode: lapDrive.mapMode === 'nav' ? 'nav' : 'overview',
      svgFallback: (id) => drawTrack(id, 'lapDriveMap', { compact: true, live: true }),
    });
    if (!okSat) drawTrack(trackId, 'lapDriveMap', { compact: true, live: true });
    // v119: Leaflet ещё не загружен (HUD открыт не с «Круга») — схема сейчас, спутник после загрузки
    if (!okSat && !window.L) {
      void ensureLeaflet().then(() => {
        if (!lapDrive.open || lapRun.trackId !== trackId) return;
        const ok2 = mountLapSatMap(trackId, document.getElementById('lapDriveMap'), {
          trackName: track.name, meta: metaBits.concat([qLab]).join(' · '),
          mode: lapDrive.mapMode === 'nav' ? 'nav' : 'overview',
          svgFallback: (id) => drawTrack(id, 'lapDriveMap', { compact: true, live: true }),
        });
        if (ok2) { try { setLapMapMode(lapDrive.mapMode || 'overview'); updateLapCarOnMap(); } catch (_) {} }
      }).catch(() => {});
    }
  }
  // v119: chase Сочи ждёт three.js — догружаем и включаем, если пилот сам не переключил вид
  if (trackId === 'sochi' && !sochiReduceMotion() && typeof THREE === 'undefined' && !LH58_ON) {
    void ensureThree().then(() => {
      if (!lapDrive.open || lapDrive.mapModeUser || lapRun.trackId !== 'sochi') return;
      lapDrive.mapMode = 'chase';
      try { setLapMapMode('chase'); sochiChaseSync(); } catch (_) {}
    }).catch(() => {});
  }
  setLapMapMode(lapDrive.mapMode || 'overview');
  updateLapCarOnMap();
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lap-drive-on');
  lapDrive.open = true;
  try { sochiChaseSync(); } catch (_) {}
  if (lapDrive.timerId) clearInterval(lapDrive.timerId);
  lapDrive.timerId = setInterval(() => {
    if (!lapRun.active || lapRun.phase !== 'running' || !lapRun.t0) return;
    document.getElementById('lapDriveClock').textContent = fmtLapClock(Date.now() - lapRun.t0);
    ghostLapTick();
  }, 100);
  void fetchLapWeather(trackId, true);
}

function closeLapDrive() {
  const el = document.getElementById('lapDrive');
  if (!el) return;
  ghostLapStop();
  ghostSimRouteOff();
  try { unmountLapSatMap(); } catch (_) {}
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lap-drive-on');
  el.classList.remove('armed');
  lapDrive.open = false;
  if (lapDrive.timerId) { clearInterval(lapDrive.timerId); lapDrive.timerId = null; }
  if (lapDrive.weatherTimer) { clearInterval(lapDrive.weatherTimer); lapDrive.weatherTimer = null; }
  sochiChase.state = ''; // v100: HUD closed → refresh chase overlay (car keeps following GPS / parks on S/F)
  sochiChase.disp = null;
  try { sochiChaseSync(); } catch (_) {}
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

/* v141: sector battle — сплит сектора vs лучший (сессия + история трассы), цвет на карте и в чипе */
function lapBattleRef(trackId) {
  const hist = ((state.laps && state.laps[trackId]) || []).filter((l) => Array.isArray(l.sectors));
  const sess = lapSession.trackId === trackId ? lapSession.laps : [];
  return LB.bestSplits([...hist, ...sess]);
}
function lapBattleSector(i, label) {
  const split = LB.splitsOf(lapRun.sectorMs)[i];
  const ref = lapBattleRef(lapRun.trackId)[i];
  const d = LB.sectorDelta(split, ref);
  LB.paintChip(document.getElementById(label), i, split, d);
  LB.paintSector(document.getElementById('lapTrackSvg'), i, LB.toneOf(d));
  try { const tn = LB.toneOf(d); paintSatSector(i, tn, tn === 'better' ? LB.SECTOR_BETTER : tn === 'worse' ? LB.SECTOR_WORSE : null); } catch (_) {}
}
function lapBattleReset() {
  ['lapDriveS1', 'lapDriveS2', 'lapDriveS3'].forEach((id, i) => LB.paintChip(document.getElementById(id), i, null, null));
  const svg = document.getElementById('lapTrackSvg'); LB.resetSectors(svg); LB.setGhostDot(svg, null);
  try { resetSatSectors(); } catch (_) {}
}

function resetLapCounters() {
  try { lapBattleReset(); } catch (_) {}
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
  lapSession.dirPt = null;
  lapSession.bestMs = null;
  lapSession.bestValid = false;
  if (!lapDrive.open) openLapDrive();
  ghostSimRoute(trackId, false);
  if (ghostRace.lap.ref !== trackId) void ghostLoad('lap');
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
      dirPt: lapSession.dirPt || null,
    });
    state.trackDays = state.trackDays.slice(0, 30);
    save();
  }
  lapRun.active = false;
  resetLapRunSoft();
  ghostLapStop();
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
  // v130: несколько кругов с секторами → «стенд после сессии»
  if (n >= 2) { try { if (analyzeSession(state.trackDays[0].laps).ok) setTimeout(() => openSessionReview(0), 2600); } catch (_) {} }
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

async function completeLapRun(how, atTs, gsnap) {
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
    ...lapCarTag(),
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
    // v104: публичный топ — только калиброванная трасса и автопересечение С/Ф; итог решает сервер
    const lapPts = rawSince(0, lapRun.t0 - 15000, finishAt + 3000);
    const lapTrace = packTrace(lapPts);
    _lastRunTrace = { type: 'lap', trace: lapTrace, how };
    const calibrated = isCalibrated(trackId);
    const topOk = calibrated && runRowValid(gq, rec.flags) && canPublishTop(gq, rec.flags);
    rec.valid = topOk;
    if (!calibrated) { rec.why = REJECT_TEXT.track_uncalibrated; try { setLapMsg(REJECT_TEXT.track_uncalibrated); } catch (_) {} }
    if (!topOk && calibrated && !currentUser()) { try { setLapMsg(REJECT_TEXT.no_account); } catch (_) {} }
    if (!calibrated && currentUser()) {
      // комнаты экипажа принимают автокруги и на некалиброванных трассах (оценка A/B — по сырым точкам на сервере)
      const roomLap0 = { trackId, t: tStr, ms: rec.ms, gps: true, how, trace: lapTrace };
      void requireCar(async () => { try { await pushLapToActiveRoom(roomLap0); } catch (_) {} });
    }
    if (topOk) {
      const wx = lapDrive.weather || weatherCategoryFromCode(lapDrive.weatherCode);
      if (wx) rec.weather = wx;
      const avThumb = await avatarThumbForTops();
      // v97: every saved lap is bound to the active car + tyre («Это моя машина»); none → ask first, submit after
      const roomLap = { trackId, t: tStr, ms: rec.ms, gps: true, how, trace: lapTrace };
      void requireCar(async () => {
      const pLap = api.addLap(trackId, {
        name: String(who).slice(0, 24),
        car: currentCar().name,
        how,
        weather: wx || undefined,
        avatar: avThumb || undefined,
        trace: lapTrace,
      });
      _topSubmitP = pLap.catch(() => null);
      const lapRes = await pLap;
      try { setLapMsg(topVerdict(lapRes)); } catch (_) {}
      try { const w = wxFromRes(lapRes); if (w) { rec.wx = w; save(); updateShareWx(w); } } catch (_) {} // v128
      try { if (lapRes && (Array.isArray(lapRes) || lapRes.ok)) void renderTrackHistory(trackId, { hud: true }); } catch (_) {} // v129
      try { void pushCrewBestAfterLap(trackId, {
        trace: lapTrace, how,
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
      try { await pushLapToActiveRoom(roomLap); } catch (_) {}
      });
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
      src: lapTrace?.src === 'phone' ? 'phone' : undefined, // v118: круг телефоном — зачёт C
      gpsQ: lapTrace?.src === 'phone' ? 'C' : gq.gpsQ,
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
  if (gsnap && how === 'gate') { try { teleSave(trackId, { ms, at: rec.at, valid: rec.valid !== false, pts: gsnap.points }); } catch (_) {} }
  if (gsnap && how === 'gate') {
    const gqG = valid ? { gpsQ: rec.gpsQ, avgAcc: rec.avgAcc, hz: rec.hz } : gpsQualityFromLapRun(ms);
    void ghostAfterFinish({
      kind: 'lap', ref: trackId, snap: gsnap, tMs: ms, gq: gqG, flags: rec.flags,
      topOk: !!(valid && rec.valid), why: rec.why || (valid && !rec.valid ? 'GPS слабее B — без топа' : ''),
    });
  }

  updateSessionHud();
  applyCarUI();
  renderLaps();

  if (how === 'gate') {
    // flying finish = next lap start
    const n = lapSession.laps.length;
    const best = lapSession.bestMs != null ? fmtLapTime(lapSession.bestMs) : '—';
    setLapMsg(valid
      ? `круг ${n} · ${tStr} · лучший ${best} · следующий`
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
      // v130: одна точка ~150 м после старта — только направление езды для карты разбора (локально)
      if (lapRun.phase === 'running' && !lapSession.dirPt && lapRun.dist > 120 && lapRun.dist < 450) lapSession.dirPt = [Math.round(pt.lon * 1e4) / 1e4, Math.round(pt.lat * 1e4) / 1e4];
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
        lapBattleSector(i, label);
      }
    }
  }

  if (reject) {
    lapRun.last = { ...pt, inGate };
    return;
  }

  const moved = (vKmh || 0) >= 12;
  if (lapRun.phase === 'running' && lapRun.t0) ghostLapPoint(pt, now);

  if (lapRun.phase === 'armed') {
    if (moved && inGate && (!lapRun.last || !lapRun.last.inGate)) {
      lapRun.phase = 'running';
      lapRun.t0 = now;
      resetLapCounters();
      ghostLapStart(pt, now);
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
      const gsnap = ghostLapFinish(pt, now);
      void completeLapRun('gate', now, gsnap);
      ghostLapStart(pt, now);
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
        const note = l.valid === false ? ` · ${esc(l.why || 'не в топ')}` : '';
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
        // v112: «−0.2 к стоку G87» — only A/B laps bound to a model; reference = real stock row from the server
        let stockHtml = '';
        if (l.valid !== false && lapIsAbQuality(l) && (l.carId || l.car)) {
          const best = stockRefCached('lap', trackId, l.carId || null, l.car || '', () => { try { renderLaps(); } catch (_) {} });
          if (best && Number.isFinite(Number(best.ms))) {
            const d = Math.round(l.ms - Number(best.ms)) / 1000;
            stockHtml = `<em class="tiny lap-stock ${d <= -0.005 ? 'faster' : (d >= 0.005 ? 'slower' : '')}">${esc(stockDeltaText(d, stockLabel(best.carId || l.carId, best.car || l.car)))}</em>`;
          } else if (best === null && i === 0) stockHtml = '<em class="tiny lap-stock">стокового времени здесь пока нет</em>';
        }
        return `<li><span>${tag}</span><strong class="tops-time">${formatMs(l.ms)}${badge}</strong><em class="tiny">${note}</em>${stockHtml}${secHtml}</li>`;
      }).join('')
    : '<li><span>пока пусто</span><strong></strong></li>';
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
        let can = false; try { can = analyzeSession(s.laps).ok; } catch (_) {}
        return `<li${can ? ` class="td-review" data-sess="${rows.indexOf(s)}" role="button" tabindex="0"` : ''}><span>${esc(tr?.name || s.trackId)} · ${Number(s.n) || 0} кр.</span><strong>${best}</strong><em class="tiny">${when} · чистых ${s.validN || 0}${can ? ' · разбор' : ''}</em></li>`;
      }).join('')
    : '<li><span>сессий пока нет</span><strong></strong></li>';
}

// v101: no active car → «Это моя машина» first (lap starts right after saving) or «Ехать без зачёта»
// v154: машина уже выбрана в гараже → сразу HUD, без шторки «Это моя машина» (резину спросим после финиша, если круг пойдёт в зачёт — requireCar)
async function lapStartFlow(after) {
  let mine = null; try { mine = await loadMyCar(); } catch (_) {}
  const go = () => { openLapDrivePreview(); try { after?.(); } catch (_) {} };
  if (mine || state.carId) { go(); return; }
  void ensureCarBeforeRun(go);
}
document.getElementById('btnLapStart')?.addEventListener('click', () => { void lapStartFlow(); });
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
document.getElementById('btnMapOverview')?.addEventListener('click', () => { lapDrive.mapModeUser = true; setLapMapMode('overview'); });
document.getElementById('btnMapNav')?.addEventListener('click', () => { lapDrive.mapModeUser = true; setLapMapMode('nav'); });
document.getElementById('btnMapChase')?.addEventListener('click', () => { lapDrive.mapModeUser = true; setLapMapMode('chase'); });
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
document.getElementById('runDriveStop')?.addEventListener('click', () => {
  // v117: «Стоп» посреди заезда с пройденными отметками — сразу итог; иначе закрыть
  if (run.armed && run.launched && Object.keys(run.rm?.S?.marks || {}).length) { finishRun(); return; }
  stopRun(); closeRunDrive(); wifiSummaryReset();
});
document.getElementById('runDriveDuel')?.addEventListener('click', () => {
  if (!run.pendingShare) return;
  openShareCard(run.pendingShare);
  setTimeout(() => { try { document.getElementById('shareCardDuel')?.click(); } catch (_) {} }, 60);
});
document.getElementById('runDriveAgain')?.addEventListener('click', () => { withSafety(() => armRun({ quiet: true }))(); });
function pushSlip() {
  const rec = state.meas[state.carId] || {};
  state.slips = state.slips || [];
  state.slips.unshift({ car: currentCar().name, v0100: rec.v0100, v100200: rec.v100200, at: Date.now(), ...(run?.rc && Date.now() - run.rc.at < 600000 ? { rc: run.rc } : {}) }); // v287: чек заезда
  state.slips = state.slips.slice(0, 20);
  save();
  renderSlips();
}
function renderSlips() {
  const el = document.getElementById('runHistory');
  if (!el) return;
  // v87: строки слипов через DOM/textContent (крупные табличные цифры)
  el.replaceChildren();
  const rows = state.slips || [];
  if (!rows.length) { el.appendChild(padEl('li', 'slip-empty', 'Слипов пока нет.')); return; }
  rows.forEach((s) => {
    const li = padEl('li', 'slip-row');
    li.appendChild(padEl('span', 'slip-car', s.car || '—'));
    const v = padEl('span', 'slip-v');
    const a = padEl('b', '', s.v0100 ?? '—');
    a.appendChild(padEl('small', '', '0–100'));
    const b = padEl('b', '', s.v100200 ?? '—');
    b.appendChild(padEl('small', '', '100–200'));
    v.appendChild(a); v.appendChild(b);
    li.appendChild(v);
    li.tabIndex = 0; li.setAttribute('role', 'button'); li.addEventListener('click', () => { hap(6); rcOpen(rcFromSlip(s)); }); // v287
    el.appendChild(li);
  });
}
document.getElementById('btnShareRun')?.addEventListener('click', async () => {
  const rec = state.meas[state.carId] || {};
  const t0100 = rec.v0100 != null ? Number(rec.v0100).toFixed(2) + ' с' : (document.getElementById('run0100')?.textContent || '—');
  const ps = rec.pass0100 || {};
  const payload = buildSharePayload({ type: '0-100', time: t0100, valid: !!ps.top, src: ps.src || 'phone', n: ps.n, gpsQ: ps.gpsQ, avgAcc: ps.avgAcc, hz: ps.hz });
  openShareCard(payload);
});
document.getElementById('runDriveShare')?.addEventListener('click', () => {
  if (run.pendingShare) { openShareCard(run.pendingShare); return; }
  const rec = state.meas[state.carId] || {};
  if (rec.v0100 == null) return;
  const ps = rec.pass0100 || {};
  openShareCard(buildSharePayload({ type: '0-100', time: Number(rec.v0100).toFixed(2) + ' с', valid: !!ps.top, src: ps.src || 'phone', n: ps.n, gpsQ: ps.gpsQ, avgAcc: ps.avgAcc, hz: ps.hz, paint: getStoredPaintHex() || undefined }));
});
// v108: пока в legal-config нет реквизитов — покупки Pro нет вовсе (кнопка «пока бесплатно» без действия-покупки)
/* v217: IMU телефона для замера (как Harry's LapTimer): толчок трогания + ускорение у каждого фикса 1 Гц.
 * Модуль линейного ускорения (без g), ФНЧ ~5 Гц. Толчок = >1.2 м/с² держится 120 мс; момент — последняя «тишина» (<0.4) перед ним. */
const imuRun = { lp: null, quietT: 0, hiT: 0, kickT: null, accSum: 0, accN: 0 };
function imuMotion(e) {
  const now = Date.now();
  const a = e.acceleration; const ag = e.accelerationIncludingGravity;
  let m = null;
  if (a && a.x != null) m = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
  else if (ag && ag.x != null) m = Math.abs(Math.hypot(ag.x || 0, ag.y || 0, ag.z || 0) - 9.81);
  if (!Number.isFinite(m)) return;
  imuRun.lp = imuRun.lp == null ? m : imuRun.lp + (m - imuRun.lp) * 0.3;
  imuRun.accSum += imuRun.lp; imuRun.accN++;
  if (imuRun.lp < 0.4) { imuRun.quietT = now; imuRun.hiT = 0; }
  else if (imuRun.lp > 1.2) { if (!imuRun.hiT) imuRun.hiT = now; if (now - imuRun.hiT >= 120 && imuRun.quietT && now - imuRun.quietT < 1500) imuRun.kickT = imuRun.quietT; }
}
/** К фиксу телефона: среднее ускорение с прошлого фикса (только на разгоне) и метка толчка. */
function imuForFix(now, vKmh, prev) {
  const o = {};
  const aMean = imuRun.accN ? imuRun.accSum / imuRun.accN : null;
  imuRun.accSum = 0; imuRun.accN = 0;
  if (aMean != null && prev && Number.isFinite(vKmh) && Number.isFinite(prev.v) && vKmh > 3 && vKmh - prev.v > 0.5) o.a = Math.min(15, aMean);
  if (imuRun.kickT && imuRun.kickT <= now && now - imuRun.kickT <= 5000) { o.imuT = imuRun.kickT; imuRun.kickT = null; }
  return o;
}
window.addEventListener('devicemotion', (e) => {
  GpsFusion.onDeviceMotion(e);
  try { imuMotion(e); } catch (_) {}
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
  // v274: sw.js всегда из сети (updateViaCache none), проверка обновления при каждом возврате; новый SW взял управление → одна перезагрузка
  try {
    const hadCtl = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadCtl || reloaded) return; reloaded = true; location.reload(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); });
  } catch (_) {}
  try { navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch((err) => console.info('[pitlane] SW not registered:', err?.message || err)); } catch (_) {}
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

/* ——— v128: погода метеосервиса на старт заезда (сервер, Open-Meteo); не датчик асфальта ——— */
const WX_WET_RU = { dry: 'сухо', damp: 'сыро', wet: 'мокро' };
const WX_TOD_RU = { morning: 'утро', day: 'день', evening: 'вечер', night: 'ночь' };
const WX_NOTE = 'по данным метеосервиса, не датчик асфальта';
/** Только числа и метки из белого списка (данные с сервера или из ссылки шейра). */
function cleanWx(w) {
  if (!w || typeof w !== 'object') return null;
  const o = {};
  const n = (k, lo, hi) => { const v = Number(w[k]); if (w[k] != null && w[k] !== '' && Number.isFinite(v) && v >= lo && v <= hi) o[k] = v; };
  n('t', -60, 60); n('rh', 0, 100); n('p', 300, 1100); n('pr', 0, 200); n('ws', 0, 80); n('wd', 0, 360); n('hw', -80, 80);
  if (WX_WET_RU[w.wet]) o.wet = w.wet;
  if (WX_TOD_RU[w.tod]) o.tod = w.tod;
  return (o.t != null || o.ws != null) ? o : null;
}
function wxCompass(deg) { return ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }
function wxTemp(t) { const r = Math.round(t); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + ' °C'; }
/** Ветер: для разгона — встречный/попутный по курсу (hw), иначе — откуда дует. */
function wxWind(w) {
  if (w.ws == null) return '';
  const v = w.ws < 0.5 ? 'штиль' : `ветер ${w.ws.toFixed(w.ws < 10 ? 1 : 0).replace('.', ',')} м/с`;
  if (w.ws < 0.5) return v;
  if (w.hw != null) {
    if (w.hw >= 1) return `${v}, встречный`;
    if (w.hw <= -1) return `${v}, попутный`;
    return `${v}, боковой`;
  }
  return w.wd != null ? `${v}, ${wxCompass(w.wd)}` : v;
}
/** Полная строка для карточки заезда. */
function wxLine(w0) {
  const w = cleanWx(w0); if (!w) return '';
  const bits = [];
  if (w.t != null) bits.push(wxTemp(w.t));
  const wind = wxWind(w); if (wind) bits.push(wind);
  if (w.rh != null) bits.push(`влажность ${Math.round(w.rh)} %`);
  if (w.p != null) bits.push(`${Math.round(w.p)} гПа`);
  if (w.wet) bits.push(w.pr > 0 ? `${WX_WET_RU[w.wet]}, осадки ${String(w.pr).replace('.', ',')} мм/ч` : WX_WET_RU[w.wet]);
  if (w.tod) bits.push(WX_TOD_RU[w.tod]);
  return bits.join(' · ');
}
/** Одна короткая строка для шейр-карточки. */
function wxShareLine(w0) {
  const w = cleanWx(w0); if (!w) return '';
  const bits = [];
  if (w.t != null) bits.push(wxTemp(w.t));
  const wind = wxWind(w); if (wind) bits.push(wind);
  if (w.wet) bits.push(WX_WET_RU[w.wet]);
  if (w.tod) bits.push(WX_TOD_RU[w.tod]);
  return bits.join(' · ');
}
/** Погода из ответа сервера: { wx } у C/дуэлей, у A/B-списка — своя свежая строка. */
function wxFromRes(res) {
  if (!res) return null;
  if (res.wx) return cleanWx(res.wx);
  const rows = Array.isArray(res) ? res : (Array.isArray(res.rows) ? res.rows : []);
  const mine = rows.filter((r) => r && r.wx && isMyPilotId(r.pilotId)).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  return mine && Date.now() - (mine.at || 0) < 10 * 60e3 ? cleanWx(mine.wx) : null;
}
/** Карточка результата разгона + открытая шейр-карточка этого заезда. */
function showRunWx(w) {
  const el = document.getElementById('rdWx');
  const line = wxLine(w);
  if (el) {
    el.hidden = !line;
    const t = el.querySelector('.rd-wx-v'); if (t) t.textContent = line;
  }
  updateShareWx(w);
}
function updateShareWx(w) {
  const cw = cleanWx(w); if (!cw) return;
  try { if (typeof ghostRace !== 'undefined' && ghostRace?.pendingShare && !ghostRace.pendingShare.wx) ghostRace.pendingShare.wx = cw; } catch (_) {}
  const wxEl = document.getElementById('shareWeather');
  const card = document.getElementById('shareCard');
  if (!_shareOwn || !wxEl || !card || card.classList.contains('hidden')) return;
  const line = wxShareLine(cw);
  if (!line) return;
  wxEl.textContent = line;
  wxEl.title = WX_NOTE;
  wxEl.classList.remove('hidden');
  wxEl.classList.add('share-wx-line');
  if (_sharePayload) _sharePayload.wx = cw;
}

function buildSharePayload({ type, time, trackName, valid, car, nick, at, gpsQ, avgAcc, hz, weather, paint, trackId, sectors, ms, src, n, wx }) {
  const u = currentUser();
  const c = currentCar();
  const payload = {
    brand: 'PITLANE',
    car: car || c?.name || '—',
    nick: nick || profile()?.nick || u?.nick || 'пилот',
    type: type || '0-100',
    track: trackName || '',
    time: time != null ? String(time) : '—',
    valid: (valid !== false) && (gpsQ !== 'C' || src === 'phone'), // v118: C у телефона — класс зачёта, а не «слабый GPS»
    at: at || Date.now(),
    date: new Date(at || Date.now()).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
  };
  if (gpsQ === 'A' || gpsQ === 'B' || gpsQ === 'C') payload.gpsQ = gpsQ;
  if (avgAcc != null) payload.avgAcc = avgAcc;
  if (hz != null) payload.hz = hz;
  if (src === 'ext' || src === 'phone' || src === 'sim') payload.src = src;
  if (n != null && Number.isFinite(Number(n))) payload.n = Math.round(Number(n));
  if (payload.src === 'sim') payload.valid = false;
  if (weather === 'dry' || weather === 'damp' || weather === 'wet') payload.weather = weather;
  { const w = cleanWx(wx); if (w) { payload.wx = w; if (w.wet) payload.weather = w.wet; } } // v128
  const paintHex = paint || getStoredPaintHex();
  if (paintHex) payload.paint = paintHex;
  if (trackId) payload.trackId = trackId;
  if (Array.isArray(sectors)) payload.sectors = sectors.slice(0, 3);
  if (ms != null && Number.isFinite(ms)) payload.ms = ms;
  if (payload.src !== 'sim') {
    try { Object.assign(payload, sharePbDelta(payload)); } catch (_) {}
  }
  if (trackId && Array.isArray(sectors) && Number.isFinite(ms)) {
    try { Object.assign(payload, sectorLossOf(trackId, { sectors, ms }, payload.at)); } catch (_) {}
  }
  // v113: класс подготовки «со слов пилота» — только если заезд на заявленной машине
  try {
    const mc = myCarLocal();
    const isLapP = payload.type === 'lap' || payload.type === 'круг';
    const cc = currentCar();
    const same = mc && (isLapP || (mc.carId ? mc.carId === cc?.id : String(mc.model).toLowerCase() === String(cc?.name || '').toLowerCase()));
    if (same && PREP_LABEL[mc.prep]) payload.prep = mc.prep;
    if (same && TYRE_T_LABEL[mc.tyreT]) payload.tyreT = mc.tyreT;
  } catch (_) {}
  return payload;
}

/**
 * v111: delta to the pilot's OWN best on this track (lap) / discipline (0–100), excluding this very result.
 * Returns { pbD: seconds (signed, − = faster) } or { pbFirst: true }; {} when we have no honest history (¼ mile).
 */
function sharePbDelta(p) {
  const isLap = p.type === 'lap' || p.type === 'круг';
  if (isLap) {
    if (!p.trackId || !Number.isFinite(p.ms)) return {};
    let skipped = false;
    const prev = (state.laps?.[p.trackId] || []).filter((x) => {
      if (!skipped && (x.at === p.at || (x.ms === p.ms && !p.at))) { skipped = true; return false; }
      return Number.isFinite(x?.ms) && x.ms > 0;
    });
    if (!prev.length) return { pbFirst: true };
    const best = Math.min(...prev.map((x) => x.ms));
    return { pbD: Math.round(p.ms - best) / 1000 };
  }
  if (p.type !== '0-100') return {};
  const t = Number(String(p.time || '').replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(t) || t <= 0) return {};
  let skipped = false;
  const prev = (state.slips || []).filter((x) => {
    const v = Number(x?.v0100);
    if (!Number.isFinite(v) || v <= 0) return false;
    if (!skipped && Math.abs(v - t) < 0.006) { skipped = true; return false; }
    return true;
  });
  if (!prev.length) return { pbFirst: true };
  const best = Math.min(...prev.map((x) => Number(x.v0100)));
  return { pbD: Math.round((t - best) * 1000) / 1000 };
}

/** v112: the car a lap is bound to (server ties laps to «Моя машина»; same on device for the history). */
function myCarLocal() {
  try { const c = JSON.parse(localStorage.getItem('pitlane-mycar-v1') || 'null'); return c && c.model ? c : null; } catch (_) { return null; }
}
/** v279: машина, выбранная пилотом («Машина для зачёта»). Нет — null: никаких машин по умолчанию в чате/топах. */
function pickedCar() { const m = myCarLocal(); return m ? { id: m.carId || null, name: String(m.model).slice(0, 80) } : null; }
function lapCarTag() {
  const m = myCarLocal();
  if (m) return { car: String(m.model).slice(0, 80), carId: m.carId || null };
  return {};
}
/** «G87» for catalog cars (chassis code from name/trim), else the short model name. */
function stockLabel(carId, model) {
  const c = carId ? CARS.find((x) => x.id === carId) : null;
  const src = [c?.name, c?.trim, model].filter(Boolean).join(' ');
  const m = src.match(/\b([A-Z]\d{2,3})\b/);
  return (m ? m[1] : shortCarName(model || c?.name || '', carId) || 'модели').slice(0, 24);
}
const _stockCache = new Map();
/** Cached /stock lookup: undefined = loading/unknown (offline), null = no stock time, row = reference. */
function stockRefCached(kind, ref, carId, model, onReady) {
  if (!ref || (!carId && !model) || !isRemoteApi()) return undefined;
  const key = [kind, ref, carId || '', model || ''].join('|');
  const hit = _stockCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.p ? undefined : hit.best;
  if (!hit?.p) {
    const ent = { at: Date.now(), p: true, best: undefined };
    _stockCache.set(key, ent);
    void api.getStockRef(kind, ref, carId, model).then((r) => {
      if (r) { ent.best = r.best || null; ent.p = false; ent.at = Date.now(); }
      else _stockCache.delete(key);
      if (r && typeof onReady === 'function') onReady(ent.best);
    }).catch(() => { _stockCache.delete(key); });
  }
  return undefined;
}
function stockDeltaText(d, lab) {
  if (Math.abs(Number(d)) < 0.005) return 'на уровне лучшего стокового времени ' + lab;
  return fmtPbDelta(d) + ' к стоку ' + lab;
}
/** v112: weakest sector of this lap vs own best sectors (this lap excluded) → { secI, secD } | { secOk } | {}. */
function sectorLossOf(trackId, lap, excludeAt) {
  const sp = sectorSplits(lap);
  if (!sp || !trackId) return {};
  const best = personalBestSectors(trackId, excludeAt);
  let wi = -1; let wd = 0; let any = false;
  for (let i = 0; i < 3; i++) {
    if (best[i] == null) continue;
    any = true;
    const d = sp[i] - best[i];
    if (d > wd) { wd = d; wi = i; }
  }
  if (!any) return {};
  if (wi < 0 || wd < 50) return { secOk: true };
  return { secI: wi, secD: Math.round(wd) / 1000 };
}
function sectorLossText(p, own) {
  if (Number.isInteger(p.secI) && p.secI >= 0 && p.secI <= 2 && Number.isFinite(p.secD)) {
    return 'сектор ' + (p.secI + 1) + ' отдал ' + Math.abs(p.secD).toFixed(2).replace(/0$/, '') + ' к ' + (own ? 'твоему' : 'своему') + ' лучшему';
  }
  if (p.secOk === true) return 'все сектора на уровне ' + (own ? 'твоих' : 'своих') + ' лучших';
  return '';
}

/** «−0.4» / «+0.05» / «±0» — U+2212 minus, no trailing zeros. */
function fmtPbDelta(d) {
  const a = Math.abs(Number(d) || 0);
  if (a < 0.005) return '±0';
  const s = a.toFixed(2).replace(/0$/, '');
  return (d < 0 ? '\u2212' : '+') + s;
}

function pbDeltaText(p, own) {
  const isLap = p.type === 'lap' || p.type === 'круг';
  const whose = own ? 'твоему' : 'своему';
  if (Number.isFinite(p.pbD) && Math.abs(p.pbD) <= 600) {
    return { text: Math.abs(p.pbD) < 0.005 ? ('±0 · повтор ' + (own ? 'твоего' : 'своего') + ' лучшего') : (fmtPbDelta(p.pbD) + ' к ' + whose + ' лучшему'), cls: p.pbD <= -0.005 ? 'faster' : (p.pbD >= 0.005 ? 'slower' : 'even') };
  }
  if (p.pbFirst === true) return { text: isLap ? 'первый круг здесь' : 'первый замер 0–100', cls: 'first' };
  return null;
}

function sharePublicUrl(payload, shareId) {
  if (shareId) return SHARE_ORIGIN + '?s=' + encodeURIComponent(shareId);
  return SHARE_ORIGIN + '#r=' + b64urlEncode(payload);
}

/** v112: «−0.2 к стоку G87» / «стокового времени здесь пока нет» (only for an honest A/B result). */
function renderShareStock(p) {
  const el = document.getElementById('shareStock');
  if (!el) return;
  el.classList.remove('faster', 'slower', 'even', 'first');
  if (Number.isFinite(p.stD) && p.stLab) {
    el.textContent = stockDeltaText(p.stD, p.stLab);
    el.classList.add(p.stD <= -0.005 ? 'faster' : (p.stD >= 0.005 ? 'slower' : 'even'));
    el.hidden = false;
  } else if (p.stNone === true) {
    el.textContent = 'стокового времени здесь пока нет';
    el.classList.add('first');
    el.hidden = false;
  } else { el.textContent = ''; el.hidden = true; }
}
function shareStockEligible(p) {
  if (!p || p.valid === false || (p.gpsQ !== 'A' && p.gpsQ !== 'B')) return false;
  if (p.src === 'sim' || p.src === 'phone') return false; // телефонный 0–100 не сравниваем с зачётом
  const isLap = p.type === 'lap' || p.type === 'круг';
  return isLap ? !!(p.trackId && Number.isFinite(p.ms)) : (p.type === '0-100' || p.type === '402m');
}
function requestShareStock(p) {
  if (!shareStockEligible(p) || Number.isFinite(p.stD) || p.stNone) return;
  const isLap = p.type === 'lap' || p.type === 'круг';
  const tag = isLap ? lapCarTag() : { carId: pickedCar()?.id || null, car: pickedCar()?.name || '' };
  const kind = isLap ? 'lap' : 'drag';
  const ref = isLap ? p.trackId : p.type;
  const apply = (best) => {
    if (best === undefined) return;
    if (best) {
      const mine = isLap ? p.ms : Number(String(p.time || '').replace(',', '.').replace(/[^\d.]/g, '')) * 1000;
      const theirs = isLap ? Number(best.ms) : Number(best.t) * 1000;
      if (!Number.isFinite(mine) || !Number.isFinite(theirs)) return;
      p.stD = Math.round(mine - theirs) / 1000;
      p.stLab = stockLabel(best.carId || tag.carId, best.car || tag.car);
    } else p.stNone = true;
    if (_sharePayload === p) renderShareStock(p);
  };
  apply(stockRefCached(kind, ref, tag.carId, tag.car, apply));
}

let _shareNextForeign = false;
let _shareOwn = false;
let _shareCand = null;
function openShareCard(payload) {
  _sharePayload = payload;
  _shareOwn = !_shareNextForeign;
  _shareNextForeign = false;
  if (_shareOwn) { try { rememberDuelCandidateFromShare(payload); } catch (_) {} }
  // v111: duel candidate for «В дуэль» only from this own fresh result (its trace stays local, never in the card/link)
  _shareCand = (_shareOwn && _lastDuelCandidate && _lastDuelCandidate.at === payload.at) ? _lastDuelCandidate : null;
  // v89: a ghost race shows its own result sheet first; the card opens from «Поделиться» there
  if (typeof ghostRace !== 'undefined' && ghostRace?.holdShare && payload && !payload.ghost) { ghostRace.pendingShare = payload; return; }
  { const own = _shareOwn && payload && !payload.ghost && payload.kind !== 'lap'; const gb = document.getElementById('shareCardGhost'), jb = document.getElementById('shareCardJournal');
    if (gb) { gb.hidden = !own; gb.disabled = false; gb.textContent = 'Сохранить как призрак'; } if (jb) jb.hidden = !_shareOwn;
    const cb = document.getElementById('shareCardChat'); if (cb) { cb.hidden = !(_shareOwn && padRunFromShare(payload)); cb.disabled = false; cb.textContent = 'Отправить в чат'; } }
  const card = document.getElementById('shareCard');
  if (!card) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('shareCar', payload.car || '—');
  { let pn = Number.isInteger(payload.pn) ? payload.pn : null; if (pn == null && _shareOwn) { const v = Number(localStorage.getItem('pitlane-pnum')); if (Number.isInteger(v) && v >= 1 && v <= 99) pn = v; } set('shareNick', (payload.nick || '—') + (pn ? ' #' + pn : '')); } // v280
  set('shareTime', payload.time || '—');
  set('shareDate', payload.date || '');
  void shareStampSync(payload); // v282: печать PITLANE

  const isLap = payload.type === 'lap' || payload.type === 'круг';
  const typeLabel = isLap ? 'круг' : (payload.type === '402m' ? '¼ мили' : '0–100');
  set('shareType', typeLabel);
  renderShareGhost(payload);
  const dEl = document.getElementById('shareDelta');
  if (dEl) {
    const dt = pbDeltaText(payload, _shareOwn);
    dEl.classList.remove('faster', 'slower', 'even', 'first');
    if (dt) { dEl.textContent = dt.text; dEl.classList.add(dt.cls); dEl.hidden = false; }
    else { dEl.textContent = ''; dEl.hidden = true; }
  }
  const secEl = document.getElementById('shareSector');
  if (secEl) { const t = sectorLossText(payload, _shareOwn); secEl.textContent = t; secEl.hidden = !t; }
  renderShareStock(payload);
  if (_shareOwn) requestShareStock(payload);
  const clsEl = document.getElementById('shareCls');
  if (clsEl) {
    const known = !!PREP_LABEL[payload.prep];
    clsEl.textContent = known ? 'класс: ' + classLine(payload) + ' · со слов пилота' : 'класс не указан';
    clsEl.classList.toggle('none', !known);
    clsEl.hidden = payload.src === 'sim';
  }

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

  try { applySharePhoto(payload); } catch (_) {} // v132
  const wxEl = document.getElementById('shareWeather');
  const wxL = wxShareLine(payload.wx); // v128: одна строка погоды метеосервиса
  if (wxEl && wxL) {
    wxEl.textContent = wxL;
    wxEl.title = WX_NOTE;
    wxEl.classList.remove('hidden');
    wxEl.classList.add('share-wx-line');
    wxEl.dataset.wx = payload.weather || '';
  } else if (wxEl) {
    wxEl.classList.remove('share-wx-line');
    wxEl.removeAttribute('title');
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
    const isDragCard = !(payload.type === 'lap' || payload.type === 'круг');
    if (payload.src === 'sim') {
      mark = 'СИМУЛЯТОР';
      badge.classList.add('invalid');
      honesty = 'симулятор · не реальный заезд, не в топ';
    } else if (payload.src === 'phone') {
      // v118: телефон — свой зачёт C (не «не в топ»): честная метка и точность
      mark = payload.valid === false ? 'ТЕЛЕФОН · ЗАЧЁТ C · НЕ ПРИНЯТ' : 'ТЕЛЕФОН · ЗАЧЁТ C';
      badge.classList.add('gps-c');
      if (payload.valid === false) badge.classList.add('invalid');
      honesty = CLASS_C_NOTE;
    } else if (payload.valid === false || q === 'C') {
      mark = q === 'C' ? 'НЕ В ТОП · Слабый GPS' : 'НЕ В ТОП';
      badge.classList.add('invalid');
      if (q === 'C') badge.classList.add('gps-c');
      honesty = 'Слабый GPS — результат не публикуется в топах';
    } else if (q === 'A') {
      mark = 'VALID · A · Честный';
      badge.classList.add('gps-a');
      honesty = 'Честный GPS';
    } else if (q === 'B') {
      mark = 'VALID · B · Ок';
      badge.classList.add('gps-b');
      honesty = 'Ок GPS';
    }
    const tipParts = [];
    if (payload.avgAcc != null) tipParts.push(`±${Math.round(Number(payload.avgAcc))} м`);
    if (payload.hz != null) tipParts.push(`${Number(payload.hz).toFixed(1)} Гц`);
    if (payload.n != null) tipParts.push(`${payload.n} точек`);
    if (q) tipParts.push(q);
    if (tipParts.length) honesty = (honesty ? honesty + ' · ' : '') + tipParts.join(' · ');
    badge.textContent = '';
    const bs = document.createElement('span'); bs.textContent = mark; badge.appendChild(bs);
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
        title: 'Битва секторов',
        excludeAt: payload.at,
      });
      sb.hidden = !sb.innerHTML;
    } else {
      sb.innerHTML = '';
      sb.hidden = true;
    }
  }

  { const me = document.getElementById('shareMeasured'); if (me) me.hidden = payload.src !== 'ext'; } // v280: «Измерено PITLANE GPS»
  { const ch = document.getElementById('shareCardChal'); if (ch) { ch.hidden = !(_shareOwn && payload.src !== 'sim' && CHAL_DISCS_UI.includes(payload.type) && payload.valid !== false); ch.disabled = false; ch.textContent = 'Вызов'; } }
  card.classList.remove('hidden');
  card.setAttribute('aria-hidden', 'false');
  renderShareRun(payload);
}

/** v117: график разгона на карточке (кривая скорости + бирки отметок) и строка «60 ft · ⅛ · ¼ — время @ скорость». */
function renderShareRun(payload) {
  const box = document.getElementById('shareRun');
  if (!box) return;
  const isLap = payload.type === 'lap' || payload.type === 'круг';
  const curve = isLap ? null : cleanCurve(payload.curve);
  const sp = isLap ? {} : cleanSplits(payload.splits);
  box.hidden = !curve;
  const row = document.getElementById('shareRunSplits');
  if (row) {
    row.replaceChildren();
    for (const [k, withV] of [['60ft', true], ['100-200', false], ['201m', true], ['402m', true]]) {
      const r = sp[k];
      if (!r) continue;
      const cell = padEl('span', 'srs');
      cell.append(padEl('i', '', RM_LABEL[k]), padEl('b', '', Number(r[0]).toFixed(2)));
      if (withV) cell.appendChild(padEl('small', '', `@${Math.round(r[1])}`));
      row.appendChild(cell);
    }
  }
  if (!curve) return;
  requestAnimationFrame(() => {
    const cv = document.getElementById('shareRunChart');
    if (!cv) return;
    const w = cv.clientWidth; const h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const n = curve.v.length;
    const series = curve.v.map((v, i) => ({ x: (curve.s * i) / (n - 1), v }));
    drawSpeedChart(ctx, series, chartTags(sp).filter((t) => t.x <= curve.s), { w, h, dpr, xMax: curve.s, glow: true });
  });
}

function closeShareCard() {
  const card = document.getElementById('shareCard');
  if (!card) return;
  card.classList.remove('over-hud');
  card.classList.add('hidden');
  card.setAttribute('aria-hidden', 'true');
}

function shareTextRu(p) {
  const isLap = p.type === 'lap' || p.type === 'круг';
  const typeLabel = isLap ? ('круг' + (p.track ? ' · ' + p.track : '')) : (p.type === '402m' ? '¼ мили' : '0–100');
  const grade = gpsGradeLabel(p.gpsQ);
  const wx = weatherLabelRu(p.weather);
  const lines = [
    `PITLANE · ${p.car} · ${p.nick}`,
    `${typeLabel}: ${p.time}`,
  ];
  if (grade && grade !== 'GPS') lines.push(`GPS: ${grade}`);
  if (wx) lines.push(`Погода: ${wx}`);
  if (p.ghost) lines.push(`Призрак: ${p.ghost}${p.ghostVs ? ' · vs ' + p.ghostVs : ''}`);
  if (Number.isFinite(p.pbD)) lines.push(fmtPbDelta(p.pbD) + ' к моему лучшему');
  else if (p.pbFirst) lines.push(isLap ? 'первый круг здесь' : 'первый замер 0–100');
  if (PREP_LABEL[p.prep]) lines.push('Класс: ' + classLine(p) + ' (со слов пилота)');
  if (Number.isFinite(p.stD) && p.stLab) lines.push(stockDeltaText(p.stD, p.stLab));
  { const sl = sectorLossText(p, false).replace(' к своему лучшему', ' к моему лучшему').replace('своих лучших', 'моих лучших'); if (sl) lines.push(sl); }
  if (p.duelId && !DUELS_OFF) lines.push('Принять вызов: ' + publicLinkFor('duel_' + p.duelId, duelPublicUrl(p.duelId)));
  if (p.src === 'sim') lines.push('симулятор · не в топ');
  else if (p.src === 'phone') lines.push(p.valid === false ? 'телефон · зачёт C · не принят' : 'телефон · зачёт C');
  else if (p.valid === false || p.gpsQ === 'C') lines.push('не в публичный топ');
  else lines.push('VALID');
  return lines.join('\n');
}

async function shareResult(payload) {
  const p = payload || _sharePayload;
  if (!p) return;
  if (p === _sharePayload && _shareOwn) { try { await ensureShareDuel(p); } catch (_) {} }
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

// v233: результат → Telegram Stories (WebApp.shareToStory, Bot API 7.8+); иначе — картинка 9:16 (share файла / скачать)
function drawStoryCard(p) {
  const W = 1080, H = 1920, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#e8e6e1'; x.textAlign = 'left';
  const F = (w, px) => `${w} ${px}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  x.font = F(700, 54); x.fillText('PITLANE', 90, 220);
  x.fillStyle = '#3a3a3c'; x.fillRect(90, 260, 900, 3);
  const isLap = p.type === 'lap' || p.type === 'круг';
  const typeLabel = isLap ? ('КРУГ' + (p.track ? ' · ' + String(p.track).toUpperCase() : '')) : (p.type === '402m' ? '¼ МИЛИ' : '0–100 КМ/Ч');
  x.fillStyle = '#9a9a9a'; x.font = F(600, 46); x.fillText(typeLabel.slice(0, 34), 90, 760);
  x.fillStyle = '#ffffff'; let fs = 260; x.font = F(700, fs);
  const t = String(p.time || '—');
  while (x.measureText(t).width > 900 && fs > 80) { fs -= 10; x.font = F(700, fs); }
  x.fillText(t, 84, 760 + fs * 0.95);
  x.fillStyle = '#e8e6e1'; x.font = F(600, 56); x.fillText(String(p.car || '').slice(0, 30), 90, 1240);
  x.fillStyle = '#9a9a9a'; x.font = F(500, 44); x.fillText(String(p.nick || '').slice(0, 32), 90, 1310);
  const tags = [];
  const g = gpsGradeLabel(p.gpsQ); if (g && g !== 'GPS') tags.push('GPS ' + g);
  if (p.chip === 1) tags.push('подтверждено чипом');
  if (p.src === 'ext') { x.fillStyle = '#e8e6e1'; x.font = F(600, 40); x.fillText('Измерено PITLANE GPS', 90, 1470); x.fillStyle = '#9a9a9a'; } // v280
  else if (p.src === 'phone') tags.push('телефон');
  if (Number.isFinite(p.pbD)) tags.push(fmtPbDelta(p.pbD) + ' к лучшему');
  x.font = F(500, 40); x.fillText(tags.join(' · ').slice(0, 48), 90, 1400);
  x.fillStyle = '#3a3a3c'; x.fillRect(90, 1700, 900, 3);
  x.fillStyle = '#9a9a9a'; x.font = F(500, 38); x.fillText('dsssssz.github.io/pitlane', 90, 1770);
  return c;
}
async function shareStory(p) {
  p = p || _sharePayload;
  if (!p) return;
  hap(16);
  const cv = drawStoryCard(p);
  const WA = window.Telegram?.WebApp;
  let ok = false;
  if (WA && typeof WA.shareToStory === 'function' && (!WA.isVersionAtLeast || WA.isVersionAtLeast('7.8'))) {
    try {
      let id = p._shareId;
      if (!id) { const r = await api.createShare(p); id = r?.id; if (id) p._shareId = id; }
      const up = id ? await api.uploadStory(id, cv.toDataURL('image/jpeg', 0.82)) : null;
      if (up?.url) {
        const cfg = await ensureAuthCfg().catch(() => null);
        const link = (cfg?.telegramBot && tmaStartLink(cfg.telegramBot, 's_' + id)) || sharePublicUrl(p, id);
        WA.shareToStory(up.url, { text: (`PITLANE · ${p.time || ''} · ${link}`).slice(0, 200) });
        ok = true;
      }
    } catch (_) {}
  }
  if (ok) return;
  // fallback: системный share картинки или скачивание
  try {
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'pitlane-story.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'PITLANE' }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pitlane-story.jpg';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (err) { if (err?.name !== 'AbortError') console.warn('story', err); }
}
document.getElementById('shareCardStory')?.addEventListener('click', () => { void shareStory(_sharePayload); });

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
        _shareNextForeign = true;
        openShareCard(payload);
        return;
      }
    }
    if (raw) {
      const payload = b64urlDecode(raw);
      if (payload) { _shareNextForeign = true; openShareCard(payload); }
    }
  } catch (err) {
    console.warn('bootShare', err);
  }
}

document.getElementById('shareCardClose')?.addEventListener('click', closeShareCard);
document.getElementById('shareCard')?.addEventListener('click', (e) => {
  if (e.target?.id === 'shareCard') closeShareCard();
});
document.getElementById('shareCardBtn')?.addEventListener('click', () => { funnelEv('share'); void shareResult(_sharePayload); });
// v257: после заезда — «Сохранить как призрак» и «Журнал заездов» (с экрана до старта убраны)
document.getElementById('shareCardGhost')?.addEventListener('click', (e) => {
  try { ghostRace.run.choice = 'best'; ghostSaveChoice(); ghostApplyChoice('run'); } catch (_) {}
  hap(8); e.currentTarget.textContent = 'Призрак сохранён'; e.currentTarget.disabled = true;
});
document.getElementById('shareCardChat')?.addEventListener('click', (e) => {
  const run = padRunFromShare(_sharePayload); if (!run) return;
  const b = e.currentTarget;
  if (!padSendRun(run)) return;
  hap(8); b.textContent = 'Отправлено в «Замеры»'; b.disabled = true;
  setTimeout(() => { closeShareCard(); try { CP.ch = 'runs'; openChatPage(); cpSetTab('runs'); } catch (_) {} }, 650);
});
document.getElementById('shareCardJournal')?.addEventListener('click', () => {
  try { localStorage.setItem('pitlane-journal-f', 'run'); } catch (_) {}
  closeShareCard(); try { journalGo61('run'); } catch (_) {}
});
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
    // v129: без «null» и прочерков — только то, что реально есть
    const val = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? fmt(v) : '');
    const row = (k, stock, gps) => {
      const d = padEl('div', 'cmp-row'); d.appendChild(padEl('span', 'cmp-k', k));
      const v = padEl('span', 'cmp-v');
      if (stock) v.append(padEl('i', '', 'сток '), padEl('b', '', stock));
      if (stock && gps) v.append(padEl('i', '', ' · '));
      v.append(padEl('i', '', 'GPS '), padEl('b', '', gps || 'нет замера'));
      d.appendChild(v); return d;
    };
    stats.replaceChildren(row('0–100', val(c.v0100), val(rec.v0100)), row('100–200', val(c.v100200), val(rec.v100200)));
    const lap = padEl('div', 'cmp-row'); lap.append(padEl('span', 'cmp-k', 'ваш круг'), padEl('b', 'cmp-v', best && best !== 'null' ? String(best) : 'нет круга'));
    stats.appendChild(lap);
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
  // v104: аккаунт = серверная сессия. Старые демо-«аккаунты» на устройстве (local-токен / ключ-телефон)
  // больше не считаются входом — гараж и история при этом остаются.
  const tok = getSessionToken();
  if (!authDb.session || !tok || String(tok).startsWith('local-') || !/^p_/.test(String(authDb.session))) return null;
  return authDb.users[authDb.session] || null;
}

/** v104: миграция — демо-сессии без сервера сбрасываем (данные гаража/истории не трогаем). */
(function dropLocalDemoSession() {
  try {
    const tok = getSessionToken();
    if (tok && String(tok).startsWith('local-')) {
      setSessionToken('', null);
      authDb.session = null; authDb.token = null; authDb.demoSms = false; authDb.otps = {};
      saveAuth();
    }
  } catch (_) {}
})();
window.addEventListener('pitlane:session-lost', () => {
  authDb.session = null; authDb.token = null;
  saveAuth();
  try { refreshAccount(); } catch (_) {}
  // v248: в Mini App сессию молча восстанавливаем по свежему initData (cookie не используются вообще) — пилот не видит выхода
  if (isTMA && tmaInitData && isRemoteApi()) {
    void Promise.resolve(tmaAutoLogin('silent')).then((ok) => { if (!ok) setAuthTopMsg('Сессия закончилась — войдите через Telegram ещё раз. Замеры и гараж на месте.'); }, () => {});
    return;
  }
  try { setAuthTopMsg('Сессия закончилась — войдите через Telegram ещё раз. Замеры и гараж на месте.'); } catch (_) {}
});

function isPro(u) {
  // v108: Pro не продаётся, пока нет реквизитов (legal-config) — значит, и «запертых» функций нет
  if (!legalReady()) return true;
  if (!u) return false;
  if (u.paidUntil && u.paidUntil > Date.now()) return true;
  if (u.trialEnds && u.trialEnds > Date.now()) return true;
  return false;
}

function refreshAccount() {
  const u = currentUser();
  document.getElementById('btnLogout')?.classList.toggle('hidden', !u); // v251: гостю «Выйти» не показываем
  document.getElementById('authForm')?.classList.toggle('hidden', !!u);
  const phones = document.querySelectorAll('#accPhone, #accPhoneStatus');
  const demoBan = document.getElementById('accDemoBanner');
  if (demoBan) demoBan.classList.add('hidden'); // v104: демо-входа больше нет
  // v115: music card — only for a real server account
  try {
    const tok = String(getSessionToken() || '');
    void renderMyMusic(u && tok && !tok.startsWith('local-') && isRemoteApi() ? accountPilotId() : '');
  } catch (_) {}
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
    plan.textContent = (isTMA || !legalReady()) ? 'аккаунт сохранён' : ((isPro(u) ? ('Pro · ') : ('trial · ')) + 'аккаунт сохранён');
  }
  const trialEl = document.getElementById('accTrialLeft');
  if (trialEl) {
    if (!legalReady()) {
      trialEl.textContent = '';
    } else if (u.paidUntil && u.paidUntil > Date.now()) {
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

/* v104: SMS — только реальный провайдер на сервере (cfg.sms). Локального «демо-кода» и
 * аккаунтов на устройстве больше нет: без сервера вход не выдаётся. */
async function requestSmsCode(phone) {
  const p = normPhone(phone);
  if (p.length !== 11 || !p.startsWith('7')) throw new Error('Введите номер в формате +7…');
  if (!isRemoteApi() || !(_authCfg && _authCfg.sms)) throw new Error('Вход по SMS пока недоступен — войдите через Telegram');
  let res; let data = {};
  try {
    res = await fetch(apiBase() + '/auth/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: p }) });
    data = await res.json().catch(() => ({}));
  } catch (_) { throw new Error('Нет связи с сервером'); }
  if (res.status === 429) throw new Error('Слишком много запросов кода — подождите ~15 мин');
  if (!res.ok) throw new Error('Вход по SMS пока недоступен — войдите через Telegram');
  authDb.otps[p] = { exp: Date.now() + 10 * 60 * 1000, tries: 0, remote: true };
  saveAuth();
  return { phone: p };
}

async function verifySmsCode(phone, code, nick) {
  const p = normPhone(phone);
  const otp = authDb.otps[p];
  const c = String(code || '').trim();
  if (!otp) throw new Error('Сначала запроси код');
  if (Date.now() > otp.exp) throw new Error('Код истёк — запроси новый');
  let res; let data = {};
  try {
    res = await fetch(apiBase() + '/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: p, code: c, nick: (nick || '').trim() || undefined }) });
    data = await res.json().catch(() => ({}));
  } catch (_) { throw new Error('Нет связи с сервером'); }
  if (res.status === 429 || data?.error === 'too many attempts') { delete authDb.otps[p]; saveAuth(); throw new Error('Слишком много попыток — запроси новый код'); }
  if (data?.error === 'expired') { delete authDb.otps[p]; saveAuth(); throw new Error('Код истёк — запроси новый'); }
  if (!res.ok || !data?.ok || !data.token || !data.pilotId) throw new Error('Неверный код');
  delete authDb.otps[p];
  return completeLogin({
    pilotId: data.pilotId, token: data.token, refreshToken: data.refreshToken, user: data.user,
    nick: (nick || '').trim() || data.nick, provider: 'phone', phone: p,
  });
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
function completeLogin({ pilotId, token, refreshToken, user, nick, provider, phone, tgUsername, photoUrl }) {
  if (!pilotId || !token) return null; // v104: аккаунт есть только у серверной сессии
  const key = pilotId;
  setSessionToken(token, refreshToken || null);
  authDb.token = token;
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
  try { void syncMyCarAfterAuth(); } catch (_) {}
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
    { if (msg) msg.textContent = ''; const m2 = document.getElementById('authMsg2'); if (m2) m2.textContent = 'Код отправлен SMS'; }
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
      const appParams = new Set(['view', 'skipIntro', 'duel', 'crew', 'room', 'team', 's', 'r', 'quality']);
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
    // v104: без сервера входа нет (демо-аккаунтов на устройстве больше не создаём)
    tgBtn.classList.add('hidden');
    smsBtn.classList.add('hidden');
    smsBox.classList.add('hidden');
    none.textContent = 'Вход недоступен без сервера. Замеры, гараж и история работают на устройстве.';
    none.classList.remove('hidden');
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
    none.textContent = 'Нет связи с сервером. Замеры, гараж и история — офлайн.';
    none.classList.remove('hidden');
    _authCfg = undefined; // retry next time
    return;
  }
  const tmaAvail = !!(isTMA && cfg.tma && tmaInitData);
  // In TMA the button only appears as a manual retry after a failed silent login.
  const tg = isTMA ? (tmaAvail && _tmaLogin === 'failed') : !!(cfg.telegram && cfg.telegramBotId);
  const sms = !!cfg.sms && !cfg.smsDemo;
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
  if (isTMA && !tmaInitData) {
    // Mini App открыт не из бота (нет подписи initData) — честно говорим, как войти
    none.textContent = 'Telegram не передал данные входа. Откройте PITLANE кнопкой в боте @' + (cfg.telegramBot || 'pitlane_official_bot') + '. Замеры, гараж и история работают без аккаунта.';
    none.classList.remove('hidden');
  } else if (!tg && !sms && !tmaAvail) {
    none.textContent = 'Вход через Telegram сейчас недоступен. Замеры, гараж и история работают без аккаунта.';
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
      refreshToken: res.refreshToken,
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
// v134: 401 без возможности refresh → тихий повторный вход по initData (Mini App), затем запрос повторяется
setReauthHandler(async () => (isTMA && tmaInitData && isRemoteApi() ? !!(await tmaAutoLogin('silent')) : false));
async function tmaAutoLogin(manual) {
  if (!isTMA || !tmaInitData || !isRemoteApi()) return;
  const tgId = String(TG?.initDataUnsafe?.user?.id || '');
  const u = currentUser();
  const tok = getSessionToken();
  const realSession = !!(u && tok && !String(tok).startsWith('local-'));
  // Keep an existing session unless it belongs to a different Telegram user (account switch in Telegram).
  // v134: сессия без refresh-токена (выдана до v104) через сутки-квартал умирает, а продлить её нечем —
  // все записи (посты в Paddock, лайки, гараж) молча получали 401. Пока initData свежий — тихо меняем на полноценную.
  const legacy = realSession && !getRefreshToken();
  if (!manual && realSession && !legacy && (!u.tgUserId || u.tgUserId === tgId)) { _tmaLogin = 'ok'; try { void syncMyCarAfterAuth(); } catch (_) {} return true; }
  _tmaLogin = 'pending';
  if (!legacy && manual !== 'silent') setAuthTopMsg('Входим через Telegram…');
  const res = await api.tmaLogin(tmaInitData);
  if (res && res.ok && res.token && res.pilotId) {
    const nu = completeLogin({
      pilotId: res.pilotId,
      token: res.token,
      refreshToken: res.refreshToken,
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
    try { void syncMyCarAfterAuth(); } catch (_) {}
    return true;
  }
  if (legacy && manual !== true) { _tmaLogin = 'ok'; return false; } // старая сессия ещё жива — не пугаем пилота
  _tmaLogin = res?.status === 503 ? 'unconfigured' : 'failed';
  if (manual === 'silent') return false;
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
    ['plMenu', 'plMenuClose'], ['safetySheet', 'safetyCancel'], ['deleteSheet', 'deleteClose'], ['pitHelpSheet', 'pitHelpClose'],
    ['shareCard', 'shareCardClose'], ['duelSheet', 'duelSheetClose'], ['crewSheet', 'crewSheetClose'],
    ['autodromeSheet', 'autodromeSheetClose'], ['carPickerSheet', 'carPickerClose'],
    ['passSheet', 'passClose'], ['feedbackSheet', 'feedbackClose'], ['padCommentsSheet', 'padCommentsClose'], ['pilotSheet', 'pilotClose'],
    ['bannerSheet', 'bannerClose'], ['ghostResult', 'ghostResultClose'],
    ['sessionSheet', 'sessionSheetClose'],
    ['vtSheet', 'vtClose'], ['shopSheet', 'shopClose'], // v147
    ['ghost74', 'ghost74Close'], // v174
    ['tgSheet', 'tgSheetClose'], ['gps61', 'gps61Close'], // v161
    ['chatPage', 'chatBack'], // v205: полноэкранный Чат
    ['pfEdit', 'pfeCancel'], // v206
  ];
  const visible = (id) => { const el = document.getElementById(id); return !!(el && !el.classList.contains('hidden')); };
  const closeSheet = (id, btnId) => {
    const btn = document.getElementById(btnId) || document.querySelector('#' + id + ' [data-close], #' + id + ' .race-sheet-close, #' + id + ' button[aria-label="Закрыть"]');
    if (btn) btn.click();
    else { const el = document.getElementById(id); el?.classList.add('hidden'); el?.setAttribute('aria-hidden', 'true'); }
  };
  const backTarget = () => {
    if (visible('geoDenied')) return () => hideGeoDenied();
    if (visible('ls58')) return () => ls58Close(); // v158: итог сессии
    if (document.getElementById('view-shop')?.classList.contains('active') && !visible('shopSheet') && ![...SHEETS].some(([id]) => visible(id))) return () => shop58Back(); // v158: магазин — страница
    for (const [id, btn] of SHEETS) if (visible(id)) return () => closeSheet(id, btn);
    if (visible('runDrive')) return run.armed ? null : () => closeRunDrive();
    if (visible('lapDrive')) return () => document.getElementById('lapDriveCancel')?.click();
    const active = document.querySelector('.view.active');
    // v206: корни вкладок — без «Назад»; подстраницы профиля — назад в профиль
    const vid = active?.id?.replace('view-', '') || '';
    if (['garage', 'settings', 'history', 'cars', 'shop'].includes(vid)) return () => { goToView('account'); window.scrollTo(0, 0); };
    if (vid === 'home') return () => goToView('zamer');
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
// v106: пред-стартовый гейт с галочками; согласие запоминается (ключ v2 — старое «Понятно» без галочек не считается)
const SAFETY_KEY = 'pitlane-safety-ok-v2';
// v242: галочки убраны — пункты показаны текстом, одна кнопка «Принять»
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
  const all = document.querySelectorAll('[data-safety-item]');
  try { localStorage.setItem(SAFETY_KEY, JSON.stringify({ at: Date.now(), items: all.length })); } catch (_) {}
  closeSafety();
  const fn = _safetyPending;
  _safetyPending = null;
  if (fn) fn();
});
document.getElementById('safetyCancel')?.addEventListener('click', () => {
  _safetyPending = null;
  closeSafety();
});

let gltfLoader = null; // v119: создаётся в build3dScene() (three грузится лениво)
let glbRoot = null;

/** Catalog of GLB models in /models — cycled via title ◀ ▶ (no door anims). */
const MODEL_CATALOG = [
  { id: 'g87-m2', name: 'BMW G87 M2 Widebody', file: './models/g87-m2.glb', year: '2026' },
  { id: 'gt3rs', name: 'Porsche 911 GT3 RS', file: './models/gt3rs.glb', year: '2023' },
  { id: 'mclaren-765lt', name: 'McLaren 765LT', file: './models/mclaren-765lt.glb', year: '2021' },
  { id: 'g63', name: 'Mercedes-AMG G 63', file: './models/g63.glb', year: '2020', driveIn: true },
  { id: 'm4', name: 'BMW M4', file: './models/m4.glb', year: '2021' },
  { id: 'm3', name: 'BMW M3 Competition', file: './models/m3.glb', year: '2023' },
  { id: 'm8', name: 'BMW M8 Competition Gran Coupe', year: '2022' },
  { id: 'bmw-g70', name: 'BMW 740i', year: '2023' },
  { id: 'gls63-x166', name: 'Mercedes-AMG GLS 63', year: '2016' },
  { id: 'e63-w213', name: 'Mercedes-AMG E 63 S', year: '2021' },
  { id: 'lc200', name: 'Toyota Land Cruiser 200', year: '2012' },
  { id: 'camry-xv80', name: 'Toyota Camry Hybrid', year: '2024' },
  { id: 'li-l9', name: 'LiXiang L9', year: '2022' },
  { id: 'camry-xv70', name: 'Toyota Camry 2.5', year: '2020' },
  { id: 'x7-g07', name: 'BMW X7 xDrive40i', year: '2023' },
  { id: 'x6', name: 'BMW X6 xDrive40i', file: './models/x6.glb', year: '2020' },
  { id: 'isf', name: 'Lexus IS-F', file: './models/isf.glb', year: '2013' },
  { id: 'c63-ed507', name: 'Mercedes-AMG C 63 Edition 507', file: './models/c63-ed507.glb', year: '2014' },
  { id: 'spark', name: 'Chevrolet Spark GT', file: './models/spark.glb', year: '2018' },  { id: 'g63-w463', name: 'Mercedes-AMG G 63', year: '2015' },
  { id: 'm5-f10', name: 'BMW M5', year: '2014' },
  { id: 'm5-g90', name: 'BMW M5', year: '2025' },
  { id: 'gls-x167', name: 'Mercedes-Benz GLS', year: '2020' },
  { id: 's63-w222', name: 'Mercedes-AMG S 63', year: '2018' },
  { id: 'cls-w218', name: 'Mercedes-Benz CLS', year: '2014' },
  { id: 'gle-coupe-c167', name: 'Mercedes-Benz GLE Coupe', year: '2020' },
  { id: 'bmw-7-g12', name: 'BMW 7 Series', year: '2020' },
  { id: 'panamera', name: 'Porsche Panamera', year: '2020' },
  { id: '911-992-cabrio', name: 'Porsche 911 Cabriolet', year: '2020' },
  { id: 'x5m-f95', name: 'BMW X5 M', year: '2020' },
  { id: 'amg-gt63-4d', name: 'Mercedes-AMG GT 4-Door Coupe', year: '2019' },
  { id: 'm5', name: 'BMW M5 Competition', year: '2022' },
];

function disposeGlbTree(root, { sharedFromCache = false } = {}) {}

function scheduleDisposeGlb(root) {}

function clearGlb() {}

/* v175: perf — салон скрыт, стёкла непрозрачные тонированные. Салон за тёмным стеклом не виден, а это ~20–35% треугольников
   и самые дорогие прозрачные (BLEND/transmission) проходы. Только в рантайме, .glb не трогаем. Выключить: ?lite=0 или localStorage pitlane-lite-off=1. */
const LITE_INT_RE = /interior|seat ?belt|seatbelt|seats?\b|_seats|steer|steering|dash|torpeda|cabin|salon|potolok|baked_dveri|headliner|pedal|\bint_|_int\b|mm_int|mm_sw\b|mm_mat0[0-5]|sparkint|car_interior|gauge|cockpit/i;
const LITE_LIGHT_RE = /light|ligts|lamp|lens|indicator|drl|tail|head|bumper|emiss|brake|signal|fog|reflector/i;
const LITE_GLASS_RE = /glass|window|windscreen|windshield|panarama|panorama|glasses/i;
let _liteGlassMat = null;
/* v177: тонировка читается тёмной — база почти чёрная, отражения только бликами (слабый спекуляр/env, лак тонкий) */
const GLASS177 = { clearcoat: 0.35, spec: 0.15, env: 0.45 }; // v179: ещё темнее — блики только по краю
function liteGlassMat() {}
function liteOff175() {}
function liteModel175(root) {}

function fitGlb(obj, opts = {}) {}

/* v167: палитра «чёрный + платина» — зелёные детали заводских текстур (полосы, диски, сиденья GT3 RS) перекрашиваются в графит на лету.
   Сам .glb не трогаем: проверяем каждую карту цвета на 32×32, и только если зелёного заметно (≥ 3 пикселей из 64²) — переписываем пиксели на канвасе. */
function degreenPixels(d, dark) {}
function texGreenShare(img) {}
function degreenModel(root) {}

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
let _di = null; // v119: матрицы — после загрузки three (build3dScene)
function diInit() {}

function buildDriveRig(root, modelId) {}

function driveInApply(rig, offset, pitch, bob, travelled, lightK) {}

/** Restore the exact fitted pose (idle frame must equal a static load). */
function finishDriveIn() {}

function startDriveIn(root, modelId) {}

function stepDriveIn(now) {}
/** Drive-in camera lock: no rotate/zoom/pinch/pan, no inertia carry-over; any in-progress gesture is dropped. */
function cancelOrbitGesture() {}
function lockControlsForDriveIn(d) {}
function unlockControlsAfterDriveIn(d) {}

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

// v110: bumped (m3 lights + spark emblem GLB edits) — old pitlane-glb-v1 is dropped by the SW on activate
const GLB_CACHE_NAME = 'pitlane-glb-v2';
// v119: фонового парсинга каталога нет → замер FPS адаптивного качества ждать нечего
const glbPrefetchDone = true;
const glbPrefetchT0 = 0;
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

async function openGlbCache() {}

/** Store raw GLB bytes in memory Map + Cache Storage. */
async function putGlbBuffer(url, buf) {}

async function matchGlbBuffer(url) {}

function parseGlbBuffer(buf, url) {}

/** Parse once, keep template scene in glbParsedCache.
 *  Background prefetch is serialized (concurrency via queue).
 *  Interactive loads (priority) parse immediately so swaps aren't stuck behind idle work. */
function ensureParsedGlb(url, buf, { priority = false } = {}) {}

function cloneParsedScene(gltf) {}

async function prefetchGlbUrl(url, { parse = true } = {}) {}

/* v119: фоновой докачки каталога GLB больше нет — модель качается, только когда её открыли (см. loadPodiumModel). */

function loadPodiumModel(id, animDir = 0) {
  const m = MODEL_CATALOG.find((x) => x.id === id) || MODEL_CATALOG[0];
  if (!m) return;
  const same = podiumModelId === m.id;
  podiumModelId = m.id;
  try { state.carId = m.id; } catch (_) {}
  try { save(); } catch (_) {}
  try { applyCarUI(); } catch (_) {}
  // v177: карточка Гаража (g53) знает о смене машины из любого пути (шторка выбора, Главная, ◀▶, хуки) — иначе имя отставало от 3D
  try { if (!same && window.__g53 && document.getElementById('view-garage')?.classList.contains('active')) window.__g53(); } catch (_) {}
  const doTitle = () => applyPodiumTitle(m);
  if (animDir && !same) runHeroTitleTransition(animDir, doTitle);
  else doTitle();
  // v119: сцены ещё нет (Бокс не открывали) — модель выбрана (state.carId), загрузится при входе в Бокс
  if (!renderer || !gltfLoader) return;
  const url = catalogModelUrl(m);
  const gen = ++podiumLoadGen;
  // v119: без фоновой загрузки всего каталога — только эта модель

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
        const res = await fetch(url, { credentials: 'same-origin', mode: 'cors', cache: 'no-cache' });
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
function loadDefaultGlb() {}


/** v119: три.js → сцена → загрузка выбранной модели. Вызывается при входе в Бокс (и из мест, где подиум нужен). */
let _podiumP = null;
function ensurePodium3d() { return Promise.resolve(false); /* v289: 3D убрано */ }
/** v154: живое 3D везде — переносит #podiumWrap (один WebGL-контекст) в карточку Гаража или в «Моя машину» на Главной. */
function mountPodium(where) {
  /* v289: 3D-машины убраны — в карточке Гаража реальный рендер машины (img/cars), без рендера — эмблема марки + имя */
  if (where !== 'garage') return;
  const host = document.getElementById('g53Art'); if (!host) return;
  const id = podiumModelId || defaultPodiumId();
  const m = MODEL_CATALOG.find((x) => x.id === id) || MODEL_CATALOG[0]; if (!m) return;
  if (host.dataset.car === m.id) return;
  host.dataset.car = m.id; host.replaceChildren();
  const meta = CARS.find((c) => c.id === m.id) || {};
  const card = document.createElement('div'); card.className = 'cw291 big'; card.innerHTML = carCard291(m, meta, { edit: true }); host.appendChild(card);
  if (PH_ALT[m.id]) { // v293: выбор своего фото (у M3 — фиолетовая по умолчанию / бордовая)
    const row = document.createElement('div'); row.className = 'ph293'; const cur = carPhotoPick(m.id);
    for (const [v, label] of PH_ALT[m.id]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ph293-b' + (v === cur ? ' on' : ''); b.textContent = label; b.dataset.ph = v;
      b.addEventListener('click', () => { setCarPhotoPick(m.id, v); host.dataset.car = ''; mountPodium('garage'); const src = userCarPhoto(m.id); document.querySelectorAll('[data-g53="' + m.id + '"] img.cw-ph').forEach((i) => { i.src = src; }); try { void renderAwards92(); } catch (_) {} try { void renderHomeHero(); } catch (_) {} try { renderCarPicker(); } catch (_) {} });
      row.appendChild(b); }
    host.appendChild(row);
  }
}
/* v289: вместо 3D/рендеров — чистая заглушка: эмблема марки + имя (свои фото Мага добавит позже) */
/* v291: карточка-«пасс» машины (концепт C): слева логотип, код кузова, имя, мощность · 0–100, год пилота отдельной строкой; справа фото уходит за край */
const CAR_PHOTO291 = new Proxy({}, { get: (_, id) => userCarPhoto(String(id)) }); // v300: единый источник — USER_PH (awards.js), вырезки в img/cars/user
const CY291_KEY = 'pitlane-car-year-v291';
function carYear291(id) { try { const y = JSON.parse(localStorage.getItem(CY291_KEY) || '{}')[id]; return /^(19|20)\d\d$/.test(String(y || '')) ? String(y) : ''; } catch (_) { return ''; } }
function setCarYear291(id, y) { try { const o = JSON.parse(localStorage.getItem(CY291_KEY) || '{}'); if (y) o[id] = y; else delete o[id]; localStorage.setItem(CY291_KEY, JSON.stringify(o)); } catch (_) {} }
function carCard291(x, meta, opts = {}) {
  meta = meta || {};
  const code = (String(meta.trim || '').match(/^([A-Z]{1,2}\d{2,3})\b/) || [])[1] || '';
  let name = String(x.name || '').replace(/^BMW\s+/i, '').replace(/^G87\s+/, '');
  if (/Competition/.test(meta.trim || '') && !/Competition/.test(name)) name += ' Competition';
  const lk = brandLogoKey(x.name); const ph = meta.ph || userCarPhoto(x.id);
  const sp = [meta.hp ? meta.hp + ' HP' : '', meta.v0100 ? Number(meta.v0100).toFixed(1) + ' s' : ''].filter(Boolean).join(' · ');
  const y = x.id ? carYear291(x.id) : '';
  const mods = Array.isArray(opts.mods) ? opts.mods : [];
  const mc = mods.length ? `<span class="m302-mc">${mods.slice(0, 2).map((t) => `<span>${esc(t)}</span>`).join('')}${mods.length > 2 ? `<span class="more">+${mods.length - 2}</span>` : ''}</span>` : '';
  const yr = opts.noYear ? '' : opts.edit ? `<input class="cw-y${y ? ' f' : ''}" data-cy="${esc(x.id)}" inputmode="numeric" maxlength="4" placeholder="Год ＋" value="${y}" aria-label="Год выпуска">` : `<span class="cw-y${y ? ' f' : ''}">${y || 'Год ＋'}</span>`;
  return `<div class="cw-t"><div class="cw-h">${lk ? `<i class="cw-lg" style="--logo:url('./img/brands/${lk}.svg')"></i>` : ''}${code ? `<span class="cw-c">${esc(code)}</span>` : ''}</div><b class="cw-n">${esc(name)}</b>${sp ? `<span class="cw-s">${esc(sp)}</span>` : ''}${mc}${yr}</div>${opts.tap ? '<span class="cw-tap" aria-hidden="true">Сменить ›</span>' : ''}` +
    (ph ? `<img class="cw-ph" src="${ph}" alt="" decoding="async" draggable="false">` : `<span class="cw-nph">${lk ? `<i class="cw-lg big" style="--logo:url('./img/brands/${lk}.svg')"></i>` : ''}</span>`);
}
/* v293: машина пилота → запись БД (по id, иначе по имени без «(G80)») и HTML карточки C */
function resolveCar293(id, name) {
  // v305: вариант из каталога (db.*) — мощность/разгон/фото строго этого варианта (F90 M5 600 vs Competition 625, F82 vs G82)
  if (id && /^db\./.test(id)) { let r = null; try { r = carDbById(id); } catch (_) {} if (r) return { x: { id, name: String(name || r.name) }, meta: { hp: r.hp || null, v0100: r.v0100 || null, trim: String(r.m?.n || '').replace(/^.*\(([^)]*)\).*$/, '$1'), ph: carDbRowPhoto(id) } }; }
  const nz = (v) => String(v || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9а-я]+/g, ' ').trim();
  let c = id ? CARS.find((x) => x.id === id) : null;
  if (!c && name) { const n = nz(name); c = CARS.find((x) => nz(x.name) === n) || CARS.find((x) => n.startsWith(nz(x.name)) || nz(x.name).startsWith(n)) || null;
    if (!c) { const code = (String(name).match(/\b([A-Z]{1,2}\d{2,3})\b/) || [])[1]; if (code) c = CARS.find((x) => String(x.trim || '').startsWith(code) && n.includes(nz(x.name).split(' ').pop())) || null; } }
  return c ? { x: { id: c.id, name: c.name }, meta: c } : { x: { id: '', name: String(name || '') }, meta: {} };
}
function carCard293Html(id, name, opts = {}) { const r = resolveCar293(id, name); return carCard291(r.x, r.meta, opts); }
function carPh289(name) { const w = document.createElement('div'); w.className = 'cph289'; try { if (brandLogoKey(name)) { const l = brandLogoEl(name); l.classList.add('big'); w.appendChild(l); } } catch (_) {} const n = document.createElement('span'); n.className = 'cph289-n'; n.textContent = name || ''; w.appendChild(n); return w; }
function bootPodium() {}
// Podium boots only after intro finish (or immediate finish when skipped).

document.getElementById('btnDynoEdit')?.addEventListener('click', () => setDynoEditMode(true));
document.getElementById('btnDynoCancel')?.addEventListener('click', () => setDynoEditMode(false));
document.getElementById('dynoEditForm')?.addEventListener('submit', saveDynoEdit);
document.getElementById('btnCarPrev')?.addEventListener('click', () => cyclePodiumModel(-1));
document.getElementById('btnCarNext')?.addEventListener('click', () => cyclePodiumModel(1));

/* ---- Car picker bottom sheet (tap car name / grid icon) — DEPLOY.md §22 ----
 * Static thumbnails img/cars/<id>.webp (rendered offline from the GLBs, see tools/car-thumbs.mjs) — no WebGL per card. */
function carThumbUrl(id) { return userCarPhoto(id); } // v293: только свои фото Маги, рендеров img/cars нет
/** v293: фото машины в <img>, без фото — эмблема марки + имя (рендеры не используются) */
function fillCarImg293(img, id, name) {
  if (!img) return; const host = img.parentElement; host?.querySelectorAll(':scope > .cph289').forEach((x) => x.remove());
  const ph = carThumbUrl(id); img.removeAttribute('srcset');
  if (ph) { img.hidden = false; img.src = ph; } else { img.hidden = true; img.removeAttribute('src'); host?.appendChild(carPh289(name || (MODEL_CATALOG.find((x) => x.id === id)?.name) || '')); }
}
function carLogoHtml293(name) { const lk = brandLogoKey(name); return `<span class="cw-nph cp293">${lk ? `<i class="cw-lg big" style="--logo:url('./img/brands/${lk}.svg')"></i>` : ''}</span>`; }
function renderCarPicker() {
  const grid = document.getElementById('carPickerGrid');
  if (!grid) return;
  const cur = podiumModelId || state.carId;
  grid.innerHTML = MODEL_CATALOG.map((m) => {
    const on = m.id === cur;
    return `<button type="button" class="cp-card${on ? ' on' : ''}" role="option" aria-selected="${on}" data-car-id="${esc(m.id)}">`
      + (carThumbUrl(m.id) ? `<img src="${carThumbUrl(m.id)}" alt="" width="128" height="128" loading="lazy" decoding="async" />` : carLogoHtml293(m.name))
      + `<span class="cp-name cb-row"><span class="cb-name">${esc(m.name)}</span>${(() => { const b = brandOf(m.name); return b ? `<span class="cb-flag" role="img" title="${esc(COUNTRIES[b.cc] || '')}" aria-label="${esc(COUNTRIES[b.cc] || '')}"><img src="${flagUrl(b)}" alt="" decoding="async" /></span>` : ''; })()}</span>${m.year ? `<span class="cp-year">${esc(m.year)}</span>` : ''}</button>`;
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
  void ensurePodium3d().then(() => gltfLoader.load(url, (gltf) => fitGlb(gltf.scene)));
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
const PAINT_CATS = [['gloss', 'Солид'], ['metallic', 'Металлик'], ['pearl', 'Перламутр'], ['matte', 'Мат'], ['satin', 'Сатин'], ['chrome', 'Хром'], ['candy', 'Кэнди']];
const PAINT_FIN_OK = new Set(PAINT_CATS.map((c) => c[0]));
const PAINT_GAIN = { v: 0.5 };
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
    const finish = PAINT_FIN_OK.has(v.finish) ? v.finish : 'gloss'; // v165: 7 категорий
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
  const f = PAINT_FIN_OK.has(finish) ? finish : 'gloss';
  const s = paintStoreAll();
  const prev = normalizePaintEntry(s[id]);
  s[id] = { hex: prev.hex, finish: f };
  try { localStorage.setItem(PAINT_LS_KEY, JSON.stringify(s)); } catch (_) {}
  paint.finish = f;
}

function isGlassMat(mat) {
  if (!mat) return true;
  if (mat.userData && mat.userData.__darkGlass) return true; // v175: тёмное непрозрачное стекло — всё ещё стекло для покраски
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

function collectBodyPaintMats() { return []; }

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
    normalMap: mat.normalMap || null,
    normalScale: mat.normalScale ? mat.normalScale.clone() : null,
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

/* v165: библиотека красок в духе конфигуратора — 7 категорий, свои имена, каждая со своим материалом.
   Солид · Металлик (флейк) · Перламутр/хамелеон (iridescence — цвет плывёт с углом) · Мат · Сатин · Хром · Кэнди (глубокий тонированный лак).
   Всё — материалами three.js поверх GLB (сами .glb не трогаем). Смена краски — плавный переход 520 мс. */
const PAINT_FINISH_PRESETS = {
  gloss:    { roughness: 0.16, metalness: 0.04, clearcoat: 1.0, clearcoatRoughness: 0.06, env: 0.8, gain: 0.5 },
  metallic: { roughness: 0.28, metalness: 0.6, clearcoat: 1.0, clearcoatRoughness: 0.03, env: 0.45, flake: 0.06, gain: 0.45 },
  pearl:    { roughness: 0.22, metalness: 0.28, clearcoat: 1.0, clearcoatRoughness: 0.04, env: 0.8, irid: 1, gain: 0.5 },
  matte:    { roughness: 0.74, metalness: 0.06, clearcoat: 0, clearcoatRoughness: 0.6, env: 0.35, spec: 0.5, gain: 0.35 },
  satin:    { roughness: 0.44, metalness: 0.2, clearcoat: 0.3, clearcoatRoughness: 0.4, env: 0.5, spec: 0.7, gain: 0.38 },
  chrome:   { roughness: 0.05, metalness: 1.0, clearcoat: 0, clearcoatRoughness: 0.1, env: 1.6 },
  candy:    { roughness: 0.2, metalness: 0.55, clearcoat: 1.0, clearcoatRoughness: 0.02, env: 0.9, flake: 0.06, gain: 0.45 },
};
/** [имя, hex, (для перламутра — толщина плёнки нм: шире = сильнее «хамелеон»)] */
const PAINT_LIB = {
  gloss: [['Графит', '#2b2e33'], ['Мел', '#eeece6'], ['Сигнал', '#c8102e'], ['Гоночный жёлтый', '#f2c200'], ['Лазурь', '#1f6fd1'], ['Рыжий тигр', '#d4541c']],
  metallic: [['Северное серебро', '#b9bdc3'], ['Ночная Нева', '#1b2a4a'], ['Ладога', '#2f5f80'], ['Антрацит-синий', '#27313d'], ['Коньяк', '#6a3a1f'], ['Тёмный титан', '#55595e']],
  pearl: [['Белая ночь', '#f1efe8', [180, 420]], ['Опал', '#d9dde3', [260, 680]], ['Северное сияние', '#1f3a5a', [380, 1100]], ['Аметист', '#4a2f73', [350, 900]], ['Хамелеон «Казань»', '#2a1f4f', [450, 1250]], ['Медный мираж', '#6b2f1a', [400, 1000]]],
  matte: [['Мат-чёрный', '#141516'], ['Мат-графит', '#3b3e42'], ['Хаки', '#5a604c'], ['Песок', '#b5a584'], ['Мат-синий', '#2a3b57'], ['Мат-кармин', '#7a1c1c']],
  satin: [['Сатин-сталь', '#8b9097'], ['Бронза', '#7a6246'], ['Оливка', '#4b5240'], ['Сатин-белый', '#dcdad3'], ['Сатин-синий', '#24406b'], ['Сатин-бордо', '#5a1a26']],
  chrome: [['Зеркало', '#e6e8ea'], ['Золото', '#d4af37'], ['Розовое золото', '#d8a08a'], ['Хром-синий', '#3a6bd0'], ['Хром-бронза', '#8c6239'], ['Чёрный хром', '#2a2b2e']],
  candy: [['Кэнди-рубин', '#7d0b1c'], ['Кэнди-кобальт', '#0d2a85'], ['Кэнди-вишня', '#5a0a2a'], ['Кэнди-апельсин', '#b8400b'], ['Кэнди-фиолет', '#4a0f6b'], ['Кэнди-янтарь', '#a86a05']],
};
/** Диски и суппорты — тонируются поверх родной текстуры (тёмная резина остаётся тёмной). */
const PART_LIB = {
  wheels: [['Чёрный глянец', '#1c1c1d'], ['Антрацит', '#3c3f43'], ['Тёмное серебро', '#8c9096'], ['Бронза', '#8a6a3a'], ['Золото', '#c2a14a'], ['Белый', '#ececec'], ['В цвет кузова', 'body']],
  calipers: [['Красный', '#c8102e'], ['Жёлтый', '#f2c200'], ['Синий', '#1f5fd1'], ['Платина', '#c9c6bf'], ['Чёрный', '#151515'], ['Серебро', '#b9bdc3'], ['Рыжий', '#d4541c']],
};
const PART_LABEL = { body: 'Кузов', wheels: 'Диски', calipers: 'Суппорты' };
const FIN_LABEL = Object.fromEntries(PAINT_CATS);
function paintLookup(hex, finish) {
  const h = String(hex || '').toLowerCase(); const row = (PAINT_LIB[finish] || []).find((p) => p[1] === h);
  return row ? { name: row[0], fin: finish, film: row[2] || null } : null;
}

function currentPaintFinish() {
  const f = paint.finish || getStoredPaintFinish(podiumModelId || state.carId) || 'gloss';
  return PAINT_FIN_OK.has(f) ? f : 'gloss';
}

let flakeTex = null;
/** Флейк металлика: мелкий шум нормалей 128², тайлится. Даёт «искру» в бликах, лак сверху остаётся гладким. */
function paintFlakeTex() {}

/** Материал краски должен быть Physical (лак, iridescence, specular). Standard → Physical без потери карт. */
function toPhysicalPaint(mat) {}

/* Плавный переход: каждый материал лерпит цвет и параметры к цели (линейное пространство) */
const paintTw = new Map(); let paintTwRaf = 0;
const PAINT_TW_MS = 520;
function paintParams(m) {
  return { r: m.color.r, g: m.color.g, b: m.color.b, rough: m.roughness ?? 0.5, metal: m.metalness ?? 0, cc: m.clearcoat || 0, ccr: m.clearcoatRoughness || 0, ir: m.iridescence || 0, env: m.envMapIntensity ?? 1, fl: m.normalMap === flakeTex && m.normalScale ? m.normalScale.x : 0 };
}
function paintSet(m, p) {
  m.color.setRGB(p.r, p.g, p.b);
  if (m.roughness != null) m.roughness = p.rough;
  if (m.metalness != null) m.metalness = p.metal;
  if (m.isMeshPhysicalMaterial) { m.clearcoat = p.cc; m.clearcoatRoughness = p.ccr; m.iridescence = p.ir; }
  if (m.envMapIntensity != null) m.envMapIntensity = p.env;
  if (m.normalMap === flakeTex && m.normalScale) m.normalScale.set(p.fl, p.fl);
}
function paintTwStep(now) {}
function paintTweenTo(m, to, done) {}

/** Краска кузова: чистая замена цвета (без умножения на заводской атлас) + материал категории. */
function applySolidBodyColor(mat, color, finish, hex) {}

/* ===== Диски и суппорты ===== */
const PARTS_LS_KEY = 'pitlane-parts-v1';
const PART_RE = { wheels: /rim|wheel|felg|alloy/i, calipers: /calip|calliper/i };
const PART_NOT = { wheels: /steer|disc|calip|calliper|seat|interior|_int_/i, calipers: /disc|light|emiss/i };
function partsStoreAll() { try { return JSON.parse(localStorage.getItem(PARTS_LS_KEY) || '{}') || {}; } catch (_) { return {}; } }
function partsFor(id) { const v = partsStoreAll()[id || podiumModelId || state.carId]; return (v && typeof v === 'object') ? v : {}; }
function setPartColor(part, hex, id) {
  const k = id || podiumModelId || state.carId; if (!k) return;
  const s = partsStoreAll(); const v = { ...(s[k] || {}) };
  if (hex) v[part] = hex; else delete v[part]; s[k] = v;
  try { localStorage.setItem(PARTS_LS_KEY, JSON.stringify(s)); } catch (_) {}
}
function partMeshes(part) { return []; }
/** Тонировка = цвет × родная текстура. Если текстура почти чёрная (чёрные диски), тон не виден — такую деталь не предлагаем (без «мёртвых» кнопок). */
function texLuma(tex) {
  if (!tex?.image) return 1; if (tex.userData.__luma != null) return tex.userData.__luma;
  let L = 1;
  try { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(tex.image, 0, 0, 8, 8); const d = g.getImageData(0, 0, 8, 8).data; let a = 0; for (let i = 0; i < d.length; i += 4) a += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; L = a / 64; } catch (_) {}
  tex.userData.__luma = L; return L;
}
function partTintable(part) {
  const ms = partMeshes(part); if (!ms.length) return false;
  let ok = 0, n = 0;
  ms.forEach((o) => (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (!m?.color) return; n++; const o0 = m.userData.__partOrig; const base = o0 ? Math.max(o0.r, o0.g, o0.b) : Math.max(m.color.r, m.color.g, m.color.b); if (!m.map || texLuma(m.map) * Math.max(base, 0.5) > 0.16) ok++; }));
  return n > 0 && ok / n >= 0.5;
}
function applyPartColor(part, hex) {}
function applyStoredParts() {}

/** Keep kidney/grille/black trim from taking body paint (M3 chrome mesh, etc.). */
function forceBlackTrim() {}

function applyGlbBodyPaint(hex) {}

/* v165: UI покраски — Кузов / Диски / Суппорты, категории как вкладки, квадратные образцы, имя краски под сеткой */
const pl65 = { target: 'body', cat: null, avail: null, availRoot: null };
function pl65Avail() {
  if (pl65.availRoot === glbRoot && pl65.avail) return pl65.avail;
  pl65.availRoot = glbRoot; pl65.avail = { body: true, wheels: !!glbRoot && partTintable('wheels'), calipers: !!glbRoot && partTintable('calipers') };
  return pl65.avail;
}
function pl65Shade(hex, k) { // k>0 светлее, k<0 темнее
  const [r, g, b] = hexToRgb(hex); const f = (v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function pl65SwatchBg(hex, fin) {
  if (!hex) return 'linear-gradient(135deg,#8a8a8a 0%,#3a3a3a 55%,#1a1a1a 100%)';
  if (hex === 'body') return paint.body ? pl65SwatchBg(paint.body, currentPaintFinish()) : 'linear-gradient(135deg,#8a8a8a,#2a2a2a)';
  switch (fin) {
    case 'metallic': return `linear-gradient(135deg,${pl65Shade(hex, 0.32)} 0%,${hex} 45%,${pl65Shade(hex, -0.45)} 100%)`;
    case 'pearl': { const [h, s, l] = rgbToHsl(...hexToRgb(hex)); const sh = hslToRgb((h + 0.18) % 1, Math.max(s, 0.45), Math.min(0.8, l + 0.15)).map(Math.round); return `linear-gradient(135deg,${hex} 0%,rgb(${sh.join(',')}) 55%,${pl65Shade(hex, -0.4)} 100%)`; }
    case 'satin': return `linear-gradient(160deg,${pl65Shade(hex, 0.14)} 0%,${hex} 60%)`;
    case 'chrome': return `linear-gradient(135deg,${pl65Shade(hex, 0.75)} 0%,${hex} 38%,${pl65Shade(hex, -0.6)} 62%,${pl65Shade(hex, 0.3)} 100%)`;
    case 'candy': return `radial-gradient(circle at 32% 28%,${pl65Shade(hex, 0.45)} 0%,${hex} 45%,${pl65Shade(hex, -0.7)} 100%)`;
    default: return hex;
  }
}
function pl65Btn(hex, fin, name, on) {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.hex = hex || ''; if (fin) b.dataset.fin = fin;
  b.title = name; b.setAttribute('aria-label', name); b.setAttribute('role', 'option'); b.setAttribute('aria-selected', on ? 'true' : 'false');
  b.style.background = pl65SwatchBg(hex, fin); if (on) b.classList.add('on'); return b;
}
function renderPaintUI() {
  const bar = document.getElementById('colorBar'); const finBar = document.getElementById('paintFinish'); if (!bar || !finBar) return;
  const av = pl65Avail(); if (!av[pl65.target]) pl65.target = 'body';
  const tb = document.getElementById('pl65Target');
  if (tb) {
    tb.hidden = !(av.wheels || av.calipers);
    tb.querySelectorAll('button[data-target]').forEach((b) => { const k = b.dataset.target; b.hidden = !av[k]; const on = k === pl65.target; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  }
  const entry = getStoredPaintEntry(podiumModelId || state.carId);
  const cat = pl65.cat || (entry.hex ? entry.finish : 'gloss') || 'gloss'; pl65.cat = PAINT_FIN_OK.has(cat) ? cat : 'gloss';
  finBar.hidden = pl65.target !== 'body';
  finBar.querySelectorAll('button[data-finish]').forEach((b) => { const on = b.dataset.finish === pl65.cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('has', !!entry.hex && entry.finish === b.dataset.finish); });
  const custom = bar.querySelector('.paint-custom');
  bar.querySelectorAll('button').forEach((b) => b.remove());
  const add = (b) => bar.insertBefore(b, custom || null);
  let nm = '', sub = '';
  if (pl65.target === 'body') {
    const hex = (entry.hex || '').toLowerCase();
    add(pl65Btn('', null, 'Заводской цвет', !hex));
    let hit = !hex;
    PAINT_LIB[pl65.cat].forEach(([n, h]) => { const on = hex === h && entry.finish === pl65.cat; if (on) hit = true; add(pl65Btn(h, pl65.cat, n, on)); });
    if (custom) { custom.hidden = false; custom.classList.toggle('on', !!hex && !paintLookup(hex, entry.finish) && entry.finish === pl65.cat); }
    const lk = hex ? paintLookup(hex, entry.finish) : null;
    nm = !hex ? 'Заводской цвет' : (lk ? lk.name : 'Свой цвет'); sub = !hex ? 'как с завода' : (FIN_LABEL[entry.finish] || 'Солид') + (lk ? '' : ' · ' + hex.toUpperCase());
    void hit;
  } else {
    const cur = partsFor()[pl65.target] || '';
    add(pl65Btn('', null, 'Заводские', !cur));
    PART_LIB[pl65.target].forEach(([n, h]) => add(pl65Btn(h, h === 'body' ? null : 'satin', n, cur === h)));
    if (custom) custom.hidden = true;
    const row = PART_LIB[pl65.target].find((p) => p[1] === cur);
    nm = row ? row[0] : 'Заводские'; sub = PART_LABEL[pl65.target];
  }
  const n1 = document.getElementById('pl65N'); const n2 = document.getElementById('pl65S');
  if (n1) n1.textContent = nm; if (n2) n2.textContent = sub;
}
function syncPaintSwatches() { try { renderPaintUI(); } catch (_) {} }
function syncPaintFinishUI() { try { renderPaintUI(); } catch (_) {} }

/** v169: мягкий отсвет пола шоурума берёт оттенок краски кузова (приглушённо, без неона) */
function showroomTint(hex) {}

function applyStoredBodyPaint() {}

function pickBodyPaint(hex, fin) {
  const clean = hex ? (hex.startsWith('#') ? hex : '#' + hex) : null;
  if (fin && PAINT_FIN_OK.has(fin)) setStoredPaintFinish(fin, podiumModelId || state.carId);
  setStoredPaintHex(clean, podiumModelId || state.carId);
  applyGlbBodyPaint(clean);
  showroomTint(clean);
  if (partsFor().wheels === 'body') { try { applyPartColor('wheels', 'body'); } catch (_) {} }
  syncPaintSwatches();
  try { applyPaint(); } catch (_) {}
  try { hap(8); } catch (_) {}
}
function pickPartPaint(part, hex) {
  setPartColor(part, hex || null);
  applyPartColor(part, hex || null);
  syncPaintSwatches();
  try { hap(8); } catch (_) {}
}
/** Совместимость: старый вызов «сменить финиш» — перекрасить текущий цвет в другой категории */
function pickPaintFinish(finish) {
  setStoredPaintFinish(finish, podiumModelId || state.carId);
  pl65.cat = currentPaintFinish();
  applyGlbBodyPaint(paint.body || getStoredPaintHex());
  syncPaintSwatches();
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
document.getElementById('colorBar')?.addEventListener('click', (e) => { // v165: образцы строятся динамически — делегирование
  const b = e.target?.closest?.('button[data-hex]'); if (!b) return;
  if (pl65.target !== 'body') { pickPartPaint(pl65.target, b.dataset.hex || null); return; }
  paint.mb = b.dataset.paint || 'polar-white';
  pickBodyPaint(b.dataset.hex || null, b.dataset.fin || pl65.cat);
});
document.getElementById('paintCustom')?.addEventListener('input', (e) => { const v = e.target?.value; if (v) pickBodyPaint(v, pl65.cat); });
document.getElementById('paintCustom')?.addEventListener('change', (e) => { const v = e.target?.value; if (v) pickBodyPaint(v, pl65.cat); });
document.getElementById('paintFinish')?.addEventListener('click', (e) => { // v165: вкладка категории — показать палитру (не перекрашивает)
  const btn = e.target?.closest?.('button[data-finish]'); if (!btn) return;
  pl65.cat = btn.dataset.finish || 'gloss'; renderPaintUI(); try { hap(4); } catch (_) {}
  try { btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (_) {}
});
window.__pl65pre = PAINT_FINISH_PRESETS; window.__pl65g = PAINT_GAIN; // harness: подбор параметров
window.__pl65mat = () => { const r = []; glbRoot?.traverse((o) => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m?.userData?.__isPaintClone && r.length < 2) r.push({ t: m.type, c: m.color.getHexString(), rough: m.roughness, metal: m.metalness, cc: m.clearcoat, env: m.envMapIntensity, sp: m.specularIntensity, spc: m.specularColor?.getHexString(), sh: m.sheen, em: m.emissive?.getHexString(), emMap: !!m.emissiveMap, nm: !!m.normalMap, rm: !!m.roughnessMap, mm: !!m.metalnessMap, ao: !!m.aoMap, ir: m.iridescence, tr: m.transmission }); }); }); return r; };
window.__pl65 = () => { try { return { ...pl65Avail(), target: pl65.target, cat: pl65.cat }; } catch (_) { return null; } };
document.getElementById('pl65Target')?.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button[data-target]'); if (!btn) return;
  pl65.target = btn.dataset.target; renderPaintUI(); try { hap(4); } catch (_) {}
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
  el.innerHTML = items.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
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

// v104: ручной ввод времени в топ удалён — топ пишет только сервер по сырому треку

const I18N = {
  ru: {
    'nav.home':'Главная','nav.ride':'Заезд','nav.box':'Бокс','nav.dyno':'Паспорт','nav.run':'Замер','nav.lap':'Круг','nav.top':'Топ','nav.paddock':'Чат','nav.park':'Парк',
    'garage.empty':'Гараж пока пуст','garage.hint':'Добавьте машину — и замеры будут сохраняться за ней.','garage.add':'Добавить машину','garage.reset':'сброс',
    'run.title':'Замер','run.hint':'Старт, остановка, газ. Времена появятся по ходу.','run.start':'Старт',
    'dyno.title':'Паспорт динамики','dyno.hint':'Цифры разгона — только после своего заезда.','dyno.acc':'Разгон','dyno.mass':'Масса и отдача',
    'lap.title':'Трек','lap.track':'Трасса','lap.gps':'Круг по GPS','lap.sess':'Сессии','lap.start':'Начать сессию','lap.finish':'Финиш круга',
    'top.title':'Топы','pad.title':'Чат','pad.send':'Опубликовать','pad.ph':'Написать в чат…','pad.empty':'Пока тихо — напиши первым.',
    'acc.title':'Профиль','acc.login':'Вход','acc.hint':'Telegram нужен для топа и постов. Остальное работает без входа.','acc.in':'OK','acc.reg':'Получить код','acc.nick':'ник'
  },
  en: {
    'nav.home':'Home','nav.duels':'Duels','nav.ride':'Drive','nav.box':'Box','nav.dyno':'Specs','nav.run':'Run','nav.lap':'Lap','nav.top':'Leaderboard','nav.paddock':'Chat','nav.park':'Park',
    'garage.empty':'Garage is empty','garage.hint':'Add your car — make, body, year, engine.','garage.add':'Add car','garage.reset':'reset',
    'run.title':'Run','run.hint':'Start, stop, launch. Times appear as you go.','run.start':'Start',
    'dyno.title':'Dynamics sheet','dyno.hint':'Acceleration figures appear only after your own run.','dyno.acc':'Acceleration','dyno.mass':'Mass and output',
    'lap.title':'Track','lap.track':'Track','lap.gps':'GPS lap','lap.sess':'Sessions','lap.start':'Start session','lap.finish':'Finish lap',
    'top.title':'Leaderboards','pad.title':'Chat','pad.send':'Post','pad.ph':'Write in Chat…','pad.empty':'Quiet for now. Sign in and write the first post.',
    'acc.title':'Profile','acc.login':'Sign in','acc.hint':'Telegram sign-in is needed for leaderboards, duels, teams and posts. Runs, garage and history work without it, on this device.','acc.in':'Sign in','acc.reg':'Sign up','acc.nick':'nickname'
  },
  zh: {
    'nav.home':'首页','nav.duels':'对决','nav.ride':'驾驶','nav.box':'车库','nav.dyno':'参数','nav.run':'加速','nav.lap':'圈速','nav.top':'榜单','nav.paddock':'聊天',
    'garage.empty':'车库是空的','garage.hint':'添加车辆：品牌、车身、年份、发动机。','garage.add':'添加车辆','garage.reset':'重置',
    'run.title':'加速测试','run.hint':'点开始，先几乎停住再加速。车速下降后成绩会保存。','run.start':'开始测试',
    'dyno.title':'动态档案','dyno.hint':'加速数据只在你自己测完后出现。','dyno.acc':'加速','dyno.mass':'重量与功率',
    'lap.title':'圈速','lap.track':'赛道','lap.gps':'GPS圈速','lap.sess':'记录','lap.start':'发车','lap.finish':'完圈',
    'top.title':'榜单','pad.title':'聊天','pad.send':'发布','pad.ph':'你对车做了什么…','pad.empty':'还没有帖子。登录后发第一条。',
    'acc.title':'账户','acc.login':'登录','acc.hint':'手机号和密码。','acc.in':'登录','acc.reg':'注册','acc.nick':'昵称'
  },
  es: {
    'nav.home':'Inicio','nav.duels':'Duelos','nav.ride':'Pista','nav.box':'Box','nav.dyno':'Ficha','nav.run':'Medición','nav.lap':'Vuelta','nav.top':'Ranking','nav.paddock':'Chat',
    'garage.empty':'Garaje vacío','garage.hint':'Añade tu coche: marca, carrocería, año, motor.','garage.add':'Añadir coche','garage.reset':'reset',
    'run.title':'Medición','run.hint':'Pulsa inicio, casi párate y acelera. Al bajar la velocidad se guarda.','run.start':'Iniciar',
    'dyno.title':'Ficha de dinámica','dyno.hint':'Las cifras de aceleración salen solo tras tu propia medición.','dyno.acc':'Aceleración','dyno.mass':'Masa y potencia',
    'lap.title':'Vuelta','lap.track':'Circuito','lap.gps':'Vuelta GPS','lap.sess':'Sesiones','lap.start':'Salida','lap.finish':'Meta',
    'top.title':'Clasificaciones','pad.title':'Chat','pad.send':'Publicar','pad.ph':'Qué le hiciste al coche…','pad.empty':'Aún no hay posts. Entra y escribe el primero.',
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

/* ——— v83: Paddock — cards with like/comment row, comments sheet, public pilot profile ———
   All user text goes through textContent (no innerHTML with user data). */
const PAD_SVG = {
  heart: 'M12 20.6s-7.6-4.6-9.3-9.4C1.5 7.9 3.6 4.6 7 4.6c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.5 3.3 4.3 6.6-1.7 4.8-9.3 9.4-9.3 9.4z',
  bubble: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.8c-.5.4-1.4.1-1.4-.6V16.9A2.5 2.5 0 0 1 4 14.6z',
  trash: 'M9 3.5h6M4.5 6.5h15M6.5 6.5l.9 12.3c.1 1 .9 1.7 1.9 1.7h5.4c1 0 1.8-.7 1.9-1.7l.9-12.3M10 10.5v6M14 10.5v6',
};
function padIcon(name, cls = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', PAD_SVG[name]);
  svg.appendChild(path);
  return svg;
}
function padEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = String(text);
  return el;
}
const PAD_IMG_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i;
const PAD_AVA_RE = /^https:\/\/([\w-]+\.)*(telegram\.org|t\.me|telesco\.pe)\/[^"'<>\s]+$/i;
const isPublicPilot = (id) => /^p_[0-9a-f-]{36}$/.test(String(id || ''));
/** v194: ник без видимых букв/цифр (одни комбинирующие знаки, пробелы) → «Пилот» */
function padName(n) { const t = String(n || '').replace(/[\p{M}\p{Cf}\p{Cc}]/gu, '').replace(/\s+/g, ' ').trim(); return /[\p{L}\p{N}]/u.test(t) ? t : 'Пилот'; }
function padInitials(name) {
  const parts = padName(name).trim().split(/\s+/).filter(Boolean);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || 'P').slice(0, 2);
  return s.toUpperCase();
}
/** v127: миниатюра фото пилота с Worker (кэшируется браузером по ?v=версии); только pilot uuid */
function padAvaUrl(pilotId, ava) {
  if (!ava || !/^[a-z0-9]{2,16}$/.test(String(ava)) || !/^p_[0-9a-f-]{36}$/.test(String(pilotId || '')) || !apiBase()) return '';
  return apiBase() + '/pilot/' + encodeURIComponent(pilotId) + '/avatar?v=' + ava;
}
function padAvaHue(name) { let h = 0; const t = String(name || ''); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return h % 360; }
function padAvatar(name, avatar, size = 40) {
  const el = padEl('span', 'pad-ava');
  el.style.width = el.style.height = size + 'px';
  el.style.setProperty('--ava-h', String(padAvaHue(name)));
  const apiAva = avatar && apiBase() && String(avatar).startsWith(apiBase() + '/pilot/');
  if (avatar && (PAD_IMG_RE.test(avatar) || PAD_AVA_RE.test(avatar) || apiAva)) {
    el.classList.add('has-img');
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { el.classList.remove('has-img'); img.remove(); el.textContent = padInitials(name); el.style.fontSize = Math.round(size * 0.36) + 'px'; }, { once: true });
    img.src = avatar;
    el.appendChild(img);
  } else {
    el.textContent = padInitials(name);
    el.style.fontSize = Math.round(size * 0.36) + 'px';
  }
  return el;
}
function padAgo(at) {
  const t = Number(at) || 0;
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s / 60) + ' мин';
  if (s < 86400) return Math.floor(s / 3600) + ' ч';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' д';
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function padCount(n) {
  n = Number(n) || 0;
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}
/** Author chip (avatar + nick + meta); a button opening the public profile when the id is an account. */
function padAuthor({ name, pilotId, avatar, meta, size = 40, pp = null }) {
  name = padName(name);
  const clickable = isPublicPilot(pilotId);
  const el = padEl(clickable ? 'button' : 'div', 'pad-author');
  if (clickable) { el.type = 'button'; el.dataset.pilot = pilotId; el.setAttribute('aria-label', 'Профиль: ' + (name || 'Пилот')); }
  // v205: Pass-косметика у ника (рамка аватарки, номер, пин) — только если сервер её отдал
  const fr = pp ? passFrame(pp.frame) : '';
  let ava = padAvatar(name, avatar, size);
  if (fr) { try { ava = framedAvatar(ava, fr, size); } catch (_) {} }
  el.appendChild(ava);
  const who = padEl('span', 'pad-who');
  const nk = padEl('span', 'pad-nick', name || 'Пилот');
  if (pp && ['helmet', 'wheel', 'carbon'].includes(pp.pin)) { try { const b = document.createElement('img'); b.className = 'lb92-b pad-pin'; b.dataset.pin = pp.pin; b.alt = 'Пин'; b.src = awardImg(pp.pin, true); nk.appendChild(b); } catch (_) {} }
  who.appendChild(nk);
  if (meta) who.appendChild(padEl('span', 'pad-meta', meta));
  el.appendChild(who);
  return el;
}

/** v205: раздел чата и трасса (вкладка «Треки») */
var CP = { ch: 'gen', trk: '', open: false, all: [] };
function cpChOf(p) { return ['runs', 'tracks', 'q'].includes(p && p.ch) ? p.ch : 'gen'; }
const _padPosts = new Map(); // id → public post (shared by feed + profile)
const _padLikeSeq = new Map();

function padActionBtn(kind, count, on) {
  const b = padEl('button', 'pad-act pad-' + kind + (on ? ' on' : ''));
  b.type = 'button';
  b.appendChild(padIcon(kind === 'like' ? 'heart' : 'bubble', 'pad-ico'));
  b.appendChild(padEl('span', 'pad-cnt', padCount(count)));
  if (kind === 'comment') { b.appendChild(padEl('span', 'pad-cnt-l', padComLabel(count))); b.classList.toggle('has', Number(count) > 0); }
  return b;
}
/** v125: «3 ответа» / «ответить» — счётчик комментариев читается как разговор */
function padComLabel(n) { n = Number(n) || 0; return n ? padRu(n, 'ответ', 'ответа', 'ответов') : 'ответить'; }
function padSyncActions(id) {
  const p = _padPosts.get(id);
  if (!p) return;
  document.querySelectorAll('.pulse-card').forEach((card) => {
    if (card.dataset.post !== id) return;
    const like = card.querySelector('.pad-like');
    if (like) {
      like.classList.toggle('on', !!p.liked);
      like.setAttribute('aria-pressed', p.liked ? 'true' : 'false');
      like.setAttribute('aria-label', (p.liked ? 'Убрать лайк' : 'Нравится') + ', ' + (p.likeCount || 0));
      like.querySelector('.pad-cnt').textContent = padCount(p.likeCount);
    }
    const com = card.querySelector('.pad-comment');
    if (com) {
      com.querySelector('.pad-cnt').textContent = padCount(p.commentCount);
      const l = com.querySelector('.pad-cnt-l'); if (l) l.textContent = padComLabel(p.commentCount);
      com.classList.toggle('has', Number(p.commentCount) > 0);
      com.setAttribute('aria-label', 'Комментарии, ' + (p.commentCount || 0));
    }
  });
}
function buildPostCard(p, { compact = false } = {}) {
  _padPosts.set(p.id, p);
  const card = padEl('article', 'pulse-card' + (compact ? ' compact' : ''));
  card.dataset.post = p.id;
  const head = padEl('header', 'pad-head');
  const meta = [p.run ? (p.auto ? 'личный рекорд' : '') : p.car, padAgo(p.at)].filter(Boolean).join(' · ');
  head.appendChild(padAuthor({ name: p.who, pilotId: compact ? '' : p.pilotId, avatar: padAvaUrl(p.pilotId, p.ava), meta, pp: p.pp || null }));
  const myPid = accountPilotId();
  if (p.pilotId && myPid && p.pilotId === myPid) card.classList.add('mine'); // v299: свои — справа
  if (p.pilotId && myPid && p.pilotId === myPid) {
    const del = padEl('button', 'pad-act pad-del');
    del.type = 'button';
    del.dataset.del = p.id;
    del.setAttribute('aria-label', 'Удалить пост');
    del.appendChild(padIcon('trash', 'pad-ico pad-ico-line'));
    head.appendChild(del);
  }
  card.appendChild(head);
  if (p.ch === 'q') card.classList.add('is-q');
  if (p.ch === 'q') { // v260: вопрос + статус «без ответа / есть ответы / решён»
    const qr = padEl('div', 'pad-qrow');
    qr.appendChild(padEl('span', 'pad-qbadge', 'Вопрос'));
    const st = p.best ? ['solved', 'Решён'] : Number(p.commentCount) > 0 ? ['ans', 'Есть ответы'] : ['open', 'Без ответа'];
    qr.appendChild(padEl('span', 'pad-qst ' + st[0], st[1]));
    card.insertBefore(qr, head.nextSibling);
  }
  if (!compact && p.ch === 'tracks' && p.trk) { const tg = padEl('button', 'pad-trk', trackShortName(p.trk)); tg.type = 'button'; tg.dataset.trk = p.trk; card.appendChild(tg); }
  const ctx = p.run && p.text && p.ch !== 'runs';
  if (p.run && !ctx) card.appendChild(padRunCard(p.run, p.car));
  if (p.text) {
    const tx = padEl('p', 'pad-text');
    if (ctx) { // v259: «BMW G87 · 0–100 3.9 · текст»
      const c = padEl('span', 'pad-ctx');
      try { c.appendChild(brandLogoEl(p.run.car || p.car)); } catch (_) {}
      c.appendChild(padEl('b', '', [p.run.car || p.car, padDiscLabel(p.run.d) + ' ' + Number(p.run.t).toFixed(2).replace(/0$/, '')].filter(Boolean).join(' · ')));
      tx.appendChild(c); tx.appendChild(document.createTextNode(' · '));
    }
    tx.appendChild(document.createTextNode(p.text));
    card.appendChild(tx);
  }
  if (p.img && PAD_IMG_RE.test(String(p.img))) {
    const img = document.createElement('img');
    img.className = 'pad-img';
    img.alt = '';
    img.loading = 'lazy';
    img.src = p.img;
    img.dataset.full = '1';
    img.setAttribute('role', 'button'); img.setAttribute('aria-label', 'Открыть фото');
    card.appendChild(img);
  }
  const bar = padEl('div', 'pad-actions');
  const like = padActionBtn('like', p.likeCount, p.liked);
  like.dataset.like = p.id;
  const com = padActionBtn('comment', p.commentCount, false);
  com.dataset.comments = p.id;
  bar.append(like, com);
  card.appendChild(bar);
  if (!compact && Number(p.commentCount) > 0 && p.lc) { // v259: ветка видна прямо под сообщением
    const th = padEl('button', 'pad-thread'); th.type = 'button'; th.dataset.comments = p.id;
    const last = padEl('span', 'pad-thread-last');
    last.appendChild(padEl('b', '', p.lc.who + ': ')); last.appendChild(document.createTextNode(p.lc.text));
    th.appendChild(last);
    th.appendChild(padEl('span', 'pad-thread-n', Number(p.commentCount) > 1 ? 'Все ' + p.commentCount + ' ' + padComLabel(p.commentCount) + ' →' : 'Открыть ветку →'));
    card.appendChild(th);
  }
  setTimeout(() => padSyncActions(p.id), 0);
  return card;
}

/* v258: замер как сообщение — эмблема, машина, время, дисциплина, источник */
const PAD_DISC = { '0-100': '0–100', '100-200': '100–200', '0-200': '0–200', '60-100': '60–100', '402m': '¼ мили', '201m': '⅛ мили' };
function padDiscLabel(d) { return PAD_DISC[d] || String(d || ''); }
function padRunCard(run, car0) {
  const car = run.car || car0 || 'Машина';
  const box = padEl('div', 'pad-run');
  try { box.appendChild(brandLogoEl(car)); } catch (_) {}
  const mid = padEl('div', 'pad-run-car');
  mid.appendChild(padEl('b', '', car));
  const sub = padEl('small', '');
  sub.appendChild(padEl('span', 'pad-run-d', padDiscLabel(run.d)));
  sub.appendChild(padEl('span', 'pad-run-src' + (run.src === 'chip' ? ' chip' : ''), run.src === 'chip' ? 'Чип' : 'Телефон'));
  if (run.ok) sub.appendChild(padEl('span', 'pad-run-ok', 'в топе'));
  mid.appendChild(sub);
  box.appendChild(mid);
  const t = padEl('b', 'pad-run-t', Number(run.t).toFixed(2));
  t.appendChild(padEl('small', '', ' с'));
  box.appendChild(t);
  return box;
}
/** v258: «Замеры» никогда не пустые — свежие результаты из топов. */
let _padTopsFeed = null, _padTopsAt = 0;
async function padTopsFeed() {
  if (_padTopsFeed && Date.now() - _padTopsAt < 120e3) return _padTopsFeed;
  const out = [];
  for (const d of ['0-100', '402m', '100-200']) {
    for (const cls of ['', 'c']) { try { const rows = await api.listDrag(d, cls ? { cls } : {}); (Array.isArray(rows) ? rows : []).forEach((r) => { if (r && Number(r.t) > 0) out.push({ d, ...r }); }); } catch (_) {} }
  }
  const seen = new Set();
  const uniq = out.filter((r) => { const k = r.d + '|' + (r.pilotId || r.name) + '|' + r.t; if (seen.has(k)) return false; seen.add(k); return true; });
  uniq.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  _padTopsFeed = uniq.slice(0, 12); _padTopsAt = Date.now();
  return _padTopsFeed;
}
function padPaintTopsFeed(feed, n) {
  if (CP.ch !== 'runs' || n >= 6) return;
  void padTopsFeed().then((rows) => {
    if (CP.ch !== 'runs' || !feed.isConnected || feed.querySelector('.pad-tops')) return;
    if (!rows.length) return;
    if (!n) feed.replaceChildren();
    const sec = padEl('section', 'pad-tops');
    sec.appendChild(padEl('h4', 'pad-tops-h', 'Свежие замеры из топов'));
    for (const r of rows) {
      const c = padEl('article', 'pulse-card pad-top-card');
      const head = padEl('header', 'pad-head');
      head.appendChild(padAuthor({ name: r.name || 'пилот', pilotId: r.pilotId || '', avatar: r.avatar || '', meta: padAgo(r.at) }));
      c.appendChild(head);
      c.appendChild(padRunCard({ d: r.d, t: r.t, src: r.src === 'ext' || r.chip ? 'chip' : 'phone', car: r.car, ok: 1 }));
      sec.appendChild(c);
    }
    feed.appendChild(sec);
  }).catch(() => {});
}
/** v259: машина из гаража + последний замер как контекст сообщения. */
function padLastRun() {
  const c = currentCar(); if (!c) return null;
  const rec = (state.meas && state.meas[state.carId]) || {};
  const t = Number(rec.v0100);
  if (!(t > 0)) return null;
  const ps = rec.pass0100 || {};
  return { d: '0-100', t: Math.round(t * 100) / 100, src: ps.src === 'ext' || ps.src === 'chip' ? 'chip' : 'phone', car: String(c.name || '').slice(0, 60) };
}
function padPaintAttach() {
  const b = document.getElementById('cpAttach'); if (!b) return;
  { const cmp = b.closest('.pulse-compose'); if (cmp && cmp.parentNode && b.parentNode === cmp) cmp.parentNode.insertBefore(b, cmp); } // над полем ввода, отдельной строкой
  padPaintMode(b);
  const c = currentCar(); const r = padLastRun();
  if (!c || !r || CP.ch === 'runs') { b.hidden = true; CP.att = false; return; }
  b.hidden = false;
  b.setAttribute('aria-pressed', CP.att ? 'true' : 'false');
  b.replaceChildren();
  try { b.appendChild(brandLogoEl(c.name)); } catch (_) {}
  b.appendChild(padEl('span', '', (CP.att ? '' : '+ ') + c.name + ' · ' + padDiscLabel(r.d) + ' ' + r.t.toFixed(2)));
  if (CP.att) b.appendChild(padEl('i', 'cp-att-x', '×'));
}
/** v260: поле ввода зависит от вкладки — «Поделиться замером» / трасса + текст / «Задать вопрос». */
function padPaintMode(anchor) {
  let m = document.getElementById('cpMode');
  if (!m) { m = padEl('div', 'cp-mode'); m.id = 'cpMode'; anchor.parentNode.insertBefore(m, anchor); }
  else if (m.nextSibling !== anchor) anchor.parentNode.insertBefore(m, anchor);
  m.replaceChildren(); m.hidden = true;
  if (CP.ch === 'runs') {
    const r = padLastRun(); m.hidden = false;
    const b = padEl('button', 'cp-share-run'); b.type = 'button'; b.id = 'cpShareRun';
    if (r) { try { b.appendChild(brandLogoEl(r.car)); } catch (_) {} b.appendChild(padEl('span', '', 'Поделиться замером')); b.appendChild(padEl('b', '', padDiscLabel(r.d) + ' ' + r.t.toFixed(2) + ' с')); }
    else { b.dataset.go = 'zamer'; b.appendChild(padEl('span', '', 'Сделай замер — он появится здесь')); }
    m.appendChild(b);
  } else if (CP.ch === 'tracks') {
    m.hidden = false;
    const lab = padEl('label', 'cp-trk-pick');
    lab.appendChild(padEl('span', '', 'Трасса'));
    const sel = document.createElement('select'); sel.id = 'cpTrkSel'; sel.setAttribute('aria-label', 'Трасса для сообщения');
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Выбери трассу'; sel.appendChild(o0);
    for (const t of TRACKS) { const o = document.createElement('option'); o.value = t.id; o.textContent = trackShortName(t.id); if (t.id === CP.trk) o.selected = true; sel.appendChild(o); }
    lab.appendChild(sel); m.appendChild(lab);
  }
}
document.addEventListener('change', (e) => { if (e.target?.id === 'cpTrkSel') cpSetTab('tracks', { trk: e.target.value }); });
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('#cpShareRun'); if (!b) return;
  if (b.dataset.go === 'zamer') { try { closeChatPage(); } catch (_) {} try { goToView('zamer'); } catch (_) {} return; }
  const r = padLastRun(); if (!r) return;
  if (pulseText?.value.trim()) { CP.att = true; void padSendFromComposer(); return; } // текст + замер
  if (padSendRun(r)) { hap(8); b.disabled = true; setTimeout(() => { b.disabled = false; }, 1500); }
});
document.addEventListener('click', (e) => { if (e.target.closest?.('#cpAttach')) { CP.att = !CP.att; hap(6); padPaintAttach(); } });
/** v258: «Отправить в чат» с карточки своего заезда. */
function padRunFromShare(pl) {
  if (!pl || pl.ghost || pl.kind === 'lap') return null;
  const d = String(pl.type || '');
  if (!PAD_DISC[d]) return null;
  const t = parseFloat(String(pl.time || '').replace(',', '.'));
  if (!(t > 0)) return null;
  return { d, t: Math.round(t * 100) / 100, src: pl.src === 'ext' || pl.src === 'chip' ? 'chip' : 'phone', car: String(pl.car && pl.car !== '—' ? pl.car : '').slice(0, 60) };
}
function padSendRun(run) {
  if (!currentUser()) { needLogin('Сообщение в чат — после входа'); return false; }
  const it = { cid: padNewCid(), text: '', img: null, at: Date.now(), car: run.car || pickedCar()?.name || '', status: 'sending', ch: 'runs', run };
  _padOut.push(it); padOutSave();
  void padDeliver(it);
  return true;
}

async function renderPulse() {
  const feed = document.getElementById('pulseFeed');
  if (!feed) return;
  void padChatData().then(renderPadLive).catch(() => {});
  renderPulseRows(await api.listPulse());
}
/** v134: лента + свои исходящие (отправляется / не отправлено) + свежеотправленные, которых ещё нет в снимке. */
function renderPulseRows(rows0) {
  const feed = document.getElementById('pulseFeed');
  if (!feed) return;
  let rows = Array.isArray(rows0) ? rows0.slice() : [];
  const now = Date.now();
  const has = (it) => rows.some((p) => p && ((it.post && p.id === it.post.id) || (p.cid && p.cid === it.cid)));
  _padOut = _padOut.filter((it) => !(it.status === 'sent' && (has(it) || now - (it.sentAt || 0) > PAD_SENT_KEEP_MS)));
  const late = _padOut.filter((it) => it.status === 'sent' && it.post).map((it) => it.post);
  if (late.length) rows = [...late, ...rows];
  CP.all = rows;
  try { cpPaintCounts(); } catch (_) {}
  rows = rows.filter((p) => p && cpChOf(p) === CP.ch && (CP.ch !== 'tracks' || !CP.trk || p.trk === CP.trk));
  try { cpPaintPin(); } catch (_) {}
  feed.replaceChildren();
  if (!rows.length && !_padOut.some((x) => x.status !== 'sent' && (x.ch || 'gen') === CP.ch)) {
    const empty = padEl('div', 'pad-empty');
    empty.appendChild(padIcon('bubble', 'pad-empty-ico'));
    empty.appendChild(padEl('p', '', cpEmptyText()));
    feed.appendChild(empty);
    padPaintTopsFeed(feed, 0);
    return;
  }
  if (CP.ch === 'tracks' && !CP.trk) { // v260: обсуждение по трассам — группы, свежая активность сверху
    const g = new Map();
    for (const p of rows) { const k = p.trk || ''; if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
    rows = [];
    for (const [k, list] of g) { list[0]._grp = k ? trackShortName(k) : 'Без трассы'; list[0]._grpN = list.length; list[0]._grpId = k; rows.push(...list); }
  }
  for (const p of rows) {
    if (!p || !p.id) continue;
    if (p._grp) { const h = padEl('button', 'pad-group-h'); h.type = 'button'; if (p._grpId) h.dataset.trkGo = p._grpId; h.appendChild(padEl('b', '', p._grp)); h.appendChild(padEl('span', '', padRu(p._grpN, p._grpN + ' сообщение', p._grpN + ' сообщения', p._grpN + ' сообщений') + (p._grpId ? ' · открыть →' : ''))); feed.appendChild(h); delete p._grp; }
    // v82 API compatibility (likes array) → count
    if (p.likeCount == null && Array.isArray(p.likes)) p.likeCount = p.likes.length;
    feed.appendChild(buildPostCard(p));
  }
  padPaintOut();
  padPaintTopsFeed(feed, rows.length);
}

async function padToggleLike(id, btn) {
  if (!currentUser()) {
    padCloseSheets();
    needLogin('Лайк — после входа');
    return;
  }
  const p = _padPosts.get(id);
  if (!p) return;
  const want = !p.liked;
  const prev = { liked: p.liked, likeCount: p.likeCount };
  p.liked = want;
  p.likeCount = Math.max(0, (Number(p.likeCount) || 0) + (want ? 1 : -1));
  padSyncActions(id);
  if (want && btn) {
    document.querySelectorAll('.pulse-card').forEach((c) => {
      if (c.dataset.post !== id) return;
      const b = c.querySelector('.pad-like');
      if (!b) return;
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    });
    try { tmaHaptic('light'); } catch (_) {}
  }
  const seq = (_padLikeSeq.get(id) || 0) + 1;
  _padLikeSeq.set(id, seq);
  const res = await api.likePulse(id, want);
  if (_padLikeSeq.get(id) !== seq) return; // a newer tap won
  if (res && res.ok) {
    p.liked = !!res.liked;
    p.likeCount = Number(res.likeCount) || 0;
  } else {
    p.liked = prev.liked;
    p.likeCount = prev.likeCount;
    const msg = document.getElementById('pulseMsg');
    if (msg) msg.textContent = res && res.status === 429 ? 'Слишком часто — попробуй через минуту' : 'Не удалось поставить лайк';
    if (res && res.status === 401) needLogin('Сессия истекла — войди снова');
  }
  padSyncActions(id);
}

/* v260: фото на весь экран по тапу */
function padOpenPhoto(src) {
  if (!src || !PAD_IMG_RE.test(String(src))) return;
  const ov = padEl('div', 'pad-photo'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Фото');
  const im = document.createElement('img'); im.src = src; im.alt = '';
  const x = padEl('button', 'pad-photo-x pl-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть');
  ov.append(im, x);
  const close = () => { ov.classList.remove('on'); setTimeout(() => ov.remove(), 180); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', close); document.addEventListener('keydown', esc);
  document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('on'));
}
async function padOnCardClick(e) {
  const tg = e.target.closest('[data-trk-go]');
  if (tg) { cpSetTab('tracks', { trk: tg.dataset.trkGo }); return; }
  const ph = e.target.closest('img[data-full]');
  if (ph) { padOpenPhoto(ph.src); return; }
  const pil = e.target.closest('[data-pilot]');
  if (pil) { void openPilotProfile(pil.dataset.pilot); return; }
  const like = e.target.closest('[data-like]');
  if (like) { void padToggleLike(like.dataset.like, like); return; }
  const com = e.target.closest('[data-comments]');
  if (com) { void openComments(com.dataset.comments); return; }
  const del = e.target.closest('[data-del]');
  if (del) {
    if (!confirm('Удалить пост?')) return;
    await api.delPulse(del.dataset.del, pulseWho());
    void renderPulse();
    const ps = document.getElementById('pilotSheet');
    if (ps && !ps.classList.contains('hidden') && _pilotOpen) void openPilotProfile(_pilotOpen);
  }
}

/* ——— sheets ——— */
function padShow(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === 'pilotSheet' && !on) { try { stopMusic(); } catch (_) {} } // v115: plaque gone → stop
  el.classList.toggle('hidden', !on);
  el.setAttribute('aria-hidden', on ? 'false' : 'true');
  document.body.classList.toggle('pad-lock', !!document.querySelector('.pad-sheet:not(.hidden)'));
  if (!on) { // v305: закрытие ветки — снимаем фокус со скрытого поля, иначе клавиатура/--kb «залипают» и поле чата перестаёт работать
    const a = document.activeElement; if (a && el.contains(a)) { try { a.blur(); } catch (_) {} }
    if (id === 'padCommentsSheet') { try { _comPost = null; } catch (_) {} const t = document.getElementById('padComText'); if (t) t.style.height = ''; }
    setTimeout(() => { try { window.dispatchEvent(new Event('pl-kb-sync')); } catch (_) {} }, 150);
  }
}
function padCloseSheets() { padShow('padCommentsSheet', false); padShow('pilotSheet', false); }

let _comPost = null;
function renderComments(list) {
  const box = document.getElementById('padComList');
  if (!box) return;
  box.replaceChildren();
  if (!list.length) {
    const empty = padEl('div', 'pad-empty pad-empty-sm');
    empty.appendChild(padIcon('bubble', 'pad-empty-ico'));
    empty.appendChild(padEl('p', '', 'Ответов пока нет. Ответь первым.'));
    box.appendChild(empty);
    return;
  }
  const post = _padPosts.get(_comPost);
  const isQ = post && post.ch === 'q';
  const canBest = isQ && post.pilotId && post.pilotId === accountPilotId();
  if (isQ && post.best) list = [...list.filter((c) => c.id === post.best), ...list.filter((c) => c.id !== post.best)];
  for (const c of list) {
    const row = padEl('div', 'pad-com');
    row.dataset.cid = c.id;
    if (isQ && post.best === c.id) { row.classList.add('best'); { const bt = padEl('span', 'pad-best-tag', 'Лучший ответ'); bt.style.gridColumn = '1 / -1'; bt.style.gridRow = '1'; row.prepend(bt); } }
    row.appendChild(padAuthor({ name: c.who, pilotId: c.pilotId, avatar: padAvaUrl(c.pilotId, c.ava), meta: padAgo(c.at), size: 34 }));
    if (c.mine) {
      const del = padEl('button', 'pad-act pad-del');
      del.type = 'button';
      del.dataset.cdel = c.id;
      del.setAttribute('aria-label', 'Удалить комментарий');
      del.appendChild(padIcon('trash', 'pad-ico pad-ico-line'));
      row.appendChild(del);
    }
    row.appendChild(padEl('p', 'pad-com-text', c.text));
    if (canBest && !c.mine) { const bb = padEl('button', 'pad-best-btn', post.best === c.id ? 'Снять отметку' : 'Отметить лучшим'); bb.type = 'button'; bb.dataset.best = post.best === c.id ? '' : c.id; row.appendChild(bb); }
    box.appendChild(row);
  }
}
function padComposerState() {
  const logged = !!currentUser();
  document.getElementById('padComCompose')?.classList.toggle('hidden', !logged);
  document.querySelector('#padCommentsSheet .pad-com-meta')?.classList.toggle('hidden', !logged);
  document.getElementById('padComLogin')?.classList.toggle('hidden', logged);
}
async function openComments(postId) {
  _comPost = postId;
  const msg = document.getElementById('padComMsg');
  if (msg) msg.textContent = '';
  padComposerState();
  const box = document.getElementById('padComList');
  if (box) { box.replaceChildren(skel171(3, 'Загружаем ответы')); }
  { // v259: вид ветки — исходное сообщение сверху, ответы под ним
    const sh = document.getElementById('padCommentsSheet');
    let hd = document.getElementById('padComHead');
    if (sh && box && !hd) { hd = padEl('div', 'pad-com-head'); hd.id = 'padComHead'; box.parentNode.insertBefore(hd, box); }
    const p0 = _padPosts.get(postId);
    if (hd) { hd.replaceChildren(); if (p0) hd.appendChild(buildPostCard(p0, { compact: true })); }
    const tt = sh?.querySelector('.race-sheet-title'); if (tt) tt.textContent = 'Ветка';
  }
  padShow('padCommentsSheet', true);
  { const b = document.getElementById('padComSend'); const t = document.getElementById('padComText'); if (b) b.disabled = !(t?.value || '').trim(); }
  const res = await api.listComments(postId);
  if (_comPost !== postId) return;
  if (!res || res.ok === false) {
    if (box) box.replaceChildren(padEl('p', 'pad-loading', res && res.status === 404 ? 'Пост удалён' : 'Нет связи — попробуй позже'));
    return;
  }
  const list = Array.isArray(res.comments) ? res.comments : [];
  renderComments(list);
  const p = _padPosts.get(postId);
  if (p) { p.commentCount = list.length; padSyncActions(postId); }
}
async function sendComment() {
  const ta = document.getElementById('padComText');
  const msg = document.getElementById('padComMsg');
  const btn = document.getElementById('padComSend');
  if (!ta || !_comPost) return;
  if (!currentUser()) { padCloseSheets(); needLogin('Комментарии — после входа'); return; }
  const text = ta.value.trim();
  if (!text) return;
  if (text.length > 500) { if (msg) msg.textContent = 'Максимум 500 символов'; return; }
  const postId = _comPost;
  if (btn) btn.disabled = true;
  const res = await api.addComment(postId, text);
  if (btn) btn.disabled = !ta.value.trim();
  if (!res || res.ok === false) {
    const code = res && res.status;
    if (msg) msg.textContent = code === 429 ? 'Слишком часто — подожди немного'
      : code === 409 && res.error === 'duplicate' ? 'Такой комментарий уже есть'
      : code === 409 ? 'Комментарии закрыты'
      : code === 401 ? 'Сессия истекла — войди снова'
      : code === 404 ? 'Пост удалён' : 'Не отправилось — нет связи';
    return;
  }
  ta.value = ''; if (btn) btn.disabled = true;
  ta.style.height = '';
  const cnt = document.getElementById('padComCount');
  if (cnt) cnt.textContent = '0/500';
  if (msg) msg.textContent = '';
  const p = _padPosts.get(postId);
  if (p) { p.commentCount = Number(res.count) || (p.commentCount || 0) + 1; if (res.comment) p.lc = { who: res.comment.who, text: String(res.comment.text || '').slice(0, 140), at: res.comment.at }; padSyncActions(postId); }
  await openComments(postId);
  const box = document.getElementById('padComList');
  if (box) box.scrollTop = box.scrollHeight;
}
document.getElementById('padComSend')?.addEventListener('click', () => { void sendComment(); });
// v134: тап по кнопке не схлопывает клавиатуру iOS; кнопка неактивна при пустом поле
['pointerdown', 'mousedown'].forEach((ev) => document.getElementById('padComSend')?.addEventListener(ev, (e) => { if (document.activeElement?.id === 'padComText') e.preventDefault(); }));
document.getElementById('padComText')?.addEventListener('input', (e) => {
  const ta = e.target;
  { const b = document.getElementById('padComSend'); if (b) b.disabled = !ta.value.trim(); }
  const cnt = document.getElementById('padComCount');
  if (cnt) cnt.textContent = ta.value.length + '/500';
  ta.style.height = 'auto';
  ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
});
document.getElementById('padComText')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void sendComment(); }
});
document.getElementById('padComLogin')?.addEventListener('click', () => { padCloseSheets(); needLogin('Комментарии — после входа'); });
document.getElementById('padCommentsClose')?.addEventListener('click', () => padShow('padCommentsSheet', false));
document.getElementById('padCommentsSheet')?.addEventListener('click', async (e) => {
  if (e.target?.id === 'padCommentsSheet') { padShow('padCommentsSheet', false); return; }
  const pil = e.target.closest('[data-pilot]');
  if (pil) { void openPilotProfile(pil.dataset.pilot); return; }
  const bb = e.target.closest('[data-best]');
  if (bb && _comPost) {
    const postId = _comPost; bb.disabled = true;
    const res = await api.setBestAnswer(postId, bb.dataset.best || null);
    if (res && res.ok) { const p = _padPosts.get(postId); if (p) { if (res.best) p.best = res.best; else delete p.best; } hap(8); void openComments(postId); renderPulseRows(CP.all); }
    else { bb.disabled = false; const msg = document.getElementById('padComMsg'); if (msg) msg.textContent = res && res.status === 429 ? 'Слишком часто — подожди немного' : 'Не удалось отметить'; }
    return;
  }
  const del = e.target.closest('[data-cdel]');
  if (del && _comPost) {
    if (!confirm('Удалить комментарий?')) return;
    const postId = _comPost;
    const res = await api.delComment(postId, del.dataset.cdel);
    if (res && res.ok) {
      const p = _padPosts.get(postId);
      if (p) { p.commentCount = Number(res.count) || 0; padSyncActions(postId); }
      void openComments(postId);
    } else {
      const msg = document.getElementById('padComMsg');
      if (msg) msg.textContent = 'Не удалось удалить';
    }
  }
});

/* ——— public pilot profile ——— */
let _pilotOpen = null;
function fmtSplitMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const s = n / 1000;
  if (s >= 60) return Math.floor(s / 60) + ':' + (s % 60).toFixed(2).padStart(5, '0');
  return s.toFixed(2);
}
function padSection(title) {
  const sec = padEl('section', 'pilot-sec');
  sec.appendChild(padEl('h3', 'pilot-sec-title', title));
  return sec;
}
function padEmptyLine(text) { return padEl('p', 'pilot-empty', text); }
function renderPilotProfile(pr) {
  const body = document.getElementById('pilotBody');
  if (!body) return;
  body.replaceChildren();
  const ban = padEl('div', 'pilot-banner');
  paintBannerImg(ban, pr.banner, pr.pilotId, 1200);
  body.appendChild(ban);
  const head = padEl('div', 'pilot-head' + (ban.classList.contains('has-banner') ? ' on-banner' : ''));
  { let av = padAvatar(pr.nick, pr.avatar, 84); if (pr.pp?.frame) { try { av = framedAvatar(av, pr.pp.frame, 84); } catch (_) {} } head.appendChild(av); } // v206
  const who = padEl('div', 'pilot-who');
  { const h = padEl('h2', 'pilot-nick'); h.append(pf6NameRow(pr.nick || 'Пилот', pr.pp || null, 'pf6-nm', false)); who.appendChild(h); } // v206
  who.appendChild(pr.car && brandOf(pr.car) ? carNameRow(pr.car, { rowTag: 'p', cls: 'pilot-car' }) : padEl('p', 'pilot-car', pr.car || 'Машина не указана')); // v135: флаг страны марки
  if (isMyPilotId(pr.pilotId)) who.appendChild(padEl('span', 'pilot-you', 'это ты'));
  head.appendChild(who);
  body.appendChild(head);
  if (pr.carPhoto && pr.carPhoto.v) { // v132: фото машины пилота (если загрузил)
    const fig = padEl('figure', 'pilot-carphoto');
    const im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
    im.addEventListener('error', () => fig.remove(), { once: true });
    im.src = api.carPhotoUrl(pr.pilotId, pr.carPhoto.v);
    fig.appendChild(im);
    if (pr.car) fig.appendChild(padEl('figcaption', '', pr.car));
    body.appendChild(fig);
  }
  if (pr.car) { const cw = padEl('div', 'cw291 big pc293'); cw.innerHTML = carCard293Html(pr.carId || '', pr.car, { noYear: true, mods: (pr.carMods && Array.isArray(pr.carMods.mods) && (!pr.carMods.model || pr.carMods.model === pr.car)) ? pr.carMods.mods.map(String).slice(0, 16) : [] }); body.appendChild(cw); } // v293: карточка C

  const stats = padEl('div', 'pilot-stats');
  const zh = (pr.best && pr.best.zeroHundred) || [];
  const laps = (pr.best && pr.best.laps) || [];
  const drag = (pr.best && pr.best.drag && typeof pr.best.drag === 'object') ? pr.best.drag : {};
  const zhAll = zh.map((r) => Number(r.t)).concat(drag['0-100'] ? [Number(drag['0-100'].t)] : []).filter((x) => Number.isFinite(x));
  const best0100 = zhAll.length ? Math.min(...zhAll) : null;
  [
    ['0–100', best0100 != null ? best0100.toFixed(2) + ' с' : '—'],
    ['Трасс', String(laps.length)],
    ['Постов', String(pr.postCount || 0)],
    ['Лайков', padCount(pr.likesReceived || 0)],
  ].forEach(([k, v]) => {
    const s = padEl('div', 'pilot-stat');
    s.appendChild(padEl('b', '', v));
    s.appendChild(padEl('span', '', k));
    stats.appendChild(s);
  });
  body.appendChild(stats);

  // v115: музыка в профиле (только если пилот добавил треки — пустую секцию не показываем)
  const mu = musicList(pr.pilotId, pr.music);
  if (mu) {
    const secMu = padSection('Музыка');
    secMu.appendChild(mu);
    body.appendChild(secMu);
  }

  const secRuns = padSection('Лучшие заезды');
  const dragKeys = DRAG_DISC.map((x) => x.id).filter((k) => drag[k] && Number.isFinite(Number(drag[k].t)));
  if (dragKeys.length) {
    secRuns.appendChild(padEl('h4', 'pilot-sub', 'Замеры по дисциплинам'));
    const grid = padEl('div', 'pilot-drag');
    dragKeys.forEach((k) => {
      const r = drag[k];
      const c = padEl('div', 'pd-cell');
      c.appendChild(padEl('span', 'pd-k', dragDiscMeta(k)?.label || k));
      c.appendChild(padEl('b', 'pd-t', Number(r.t).toFixed(2) + ' с'));
      c.appendChild(padEl('span', 'pd-car', [shortCarName(r.car, r.carId), r.gpsQ ? 'GPS ' + r.gpsQ : ''].filter(Boolean).join(' · ')));
      grid.appendChild(c);
    });
    secRuns.appendChild(grid);
  }
  if (!zh.length && !laps.length && !dragKeys.length) {
    secRuns.appendChild(padEmptyLine('пока пусто — нужны замеры A/B, проверенные сервером.'));
  }
  if (zh.length) {
    secRuns.appendChild(padEl('h4', 'pilot-sub', '0–100 км/ч'));
    const ul = padEl('ul', 'pilot-list');
    zh.forEach((r) => {
      const li = padEl('li', '');
      const l = padEl('span', 'pl-l');
      l.appendChild(padEl('span', 'pl-main', r.car || 'Машина'));
      l.appendChild(padEl('span', 'pl-sub', [r.gpsQ ? 'GPS ' + r.gpsQ : '', padAgo(r.at)].filter(Boolean).join(' · ')));
      li.appendChild(l);
      li.appendChild(padEl('strong', 'pl-time', Number(r.t).toFixed(2) + ' с'));
      ul.appendChild(li);
    });
    secRuns.appendChild(ul);
  }
  if (laps.length) {
    secRuns.appendChild(padEl('h4', 'pilot-sub', 'Круги и сектора'));
    const ul = padEl('ul', 'pilot-list');
    laps.forEach((r) => {
      const tr = TRACKS.find((t) => t.id === r.trackId);
      const li = padEl('li', 'pilot-lap');
      if (tr) {
        const thumb = padEl('span', 'pl-tm');
        paintTrackMapImg(thumb, tr.id, 'thumb', tr.name || '');
        li.appendChild(thumb);
      }
      const l = padEl('span', 'pl-l');
      l.appendChild(padEl('span', 'pl-main', tr?.name || r.trackId));
      l.appendChild(padEl('span', 'pl-sub', [r.car, r.gpsQ ? 'GPS ' + r.gpsQ : '', padAgo(r.at)].filter(Boolean).join(' · ')));
      li.appendChild(l);
      li.appendChild(padEl('strong', 'pl-time', r.t));
      if (Array.isArray(r.sectors)) {
        const sec = padEl('div', 'pl-secs');
        r.sectors.forEach((ms, i) => {
          const chip = padEl('span', 'pl-sec');
          chip.appendChild(padEl('i', '', 'S' + (i + 1)));
          chip.appendChild(document.createTextNode(' ' + fmtSplitMs(ms)));
          sec.appendChild(chip);
        });
        li.appendChild(sec);
      }
      ul.appendChild(li);
    });
    secRuns.appendChild(ul);
  }
  body.appendChild(secRuns);

  const secPosts = padSection('Посты в чате');
  const posts = Array.isArray(pr.posts) ? pr.posts : [];
  if (!posts.length) secPosts.appendChild(padEmptyLine('Пилот ещё ничего не публиковал.'));
  const wrap = padEl('div', 'pulse-feed pilot-posts');
  posts.forEach((p) => wrap.appendChild(buildPostCard(p, { compact: true })));
  secPosts.appendChild(wrap);
  body.appendChild(secPosts);
}
async function openPilotProfile(pid) {
  if (!isPublicPilot(pid)) return;
  _pilotOpen = pid;
  padShow('padCommentsSheet', false);
  const body = document.getElementById('pilotBody');
  if (body) {
    body.replaceChildren();
    const sk = padEl('div', 'pilot-head pilot-skel');
    sk.appendChild(padEl('span', 'pad-ava'));
    sk.appendChild(padEl('p', 'pad-loading', 'Загрузка профиля…'));
    body.appendChild(sk);
    body.appendChild(skel171(4, 'Загрузка профиля'));
  }
  padShow('pilotSheet', true);
  if (body) body.scrollTop = 0;
  const res = await api.pilotProfile(pid);
  if (_pilotOpen !== pid) return;
  if (!res || res.ok === false) {
    if (body) {
      body.replaceChildren();
      const empty = padEl('div', 'pad-empty');
      empty.appendChild(padEl('p', '', res && res.status === 404 ? 'Профиль не найден — возможно, аккаунт удалён.' : 'Нет связи — попробуй позже.'));
      body.appendChild(empty);
    }
    return;
  }
  renderPilotProfile(res);
  try { appendChallengeButton(body, pid, res); } catch (_) {}
  try { appendFollowButton(body, pid, res); } catch (_) {} // v131
  try { appendDisputeButton(body, pid); } catch (_) {}
  if (body) body.scrollTop = 0;
}
/* v121: «Вызвать на дуэль» из профиля пилота — адресная дуэль */
function appendChallengeButton(body, pid, res) {
  if (DUELS_OFF) return; // v197: дуэли убраны
  if (!body || !pid || isMyPilotId(pid) || !/^p_[0-9a-f-]{36}$/.test(String(pid))) return;
  const name = String(res?.nick || res?.pilot?.nick || res?.name || 'пилот').slice(0, 48);
  const btn = padEl('button', 'go-btn pilot-challenge-btn', 'Вызвать на дуэль');
  btn.type = 'button';
  btn.addEventListener('click', () => {
    if (!currentUser()) { plFlash('Сначала войди через Telegram'); goToView('account'); return; }
    hap(8);
    try { padShow('pilotSheet', false); } catch (_) {}
    goToView('duels');
    openDuelSheet({ createOnly: true, to: { id: pid, name } });
  });
  body.appendChild(btn);
}


/* ═══ v132: фото своей машины — обрезка 16:10 на клиенте, пережатие canvas → WebP (JPEG, если WebP не кодируется),
   EXIF/геометки не переживают перекодирование; сервер ещё раз проверяет. Без фото — студийный рендер. ═══ */
const CPH_W = 1280, CPH_H = 800, CPH_MAX = 230 * 1024;
let _myCarPhoto; // undefined — не знаем; null — нет; { v, share }
function myCarPhotoState(remote) {
  if (_myCarPhoto !== undefined) return _myCarPhoto;
  let hc = null; try { hc = _homeCache; } catch (_) {}
  const pr = remote?.prof || hc?.prof;
  return pr ? (pr.carPhoto || null) : undefined;
}
function myCarPhotoUrl(remote) {
  const st = myCarPhotoState(remote);
  const pid = (() => { try { return accountPilotId(); } catch (_) { return null; } })();
  return st && st.v && pid ? api.carPhotoUrl(pid, st.v) : '';
}
function setMyCarPhoto(st) {
  _myCarPhoto = st || null;
  try { if (_homeCache?.prof) _homeCache.prof.carPhoto = _myCarPhoto; renderHwCar(_homeCache); } catch (_) {}
}
let _cph = null; // { bmp, zoom, ox, oy }
function cphDraw() {
  const cv = document.getElementById('cphCrop'); if (!cv || !_cph) return;
  const ctx = cv.getContext('2d'); const { bmp } = _cph;
  const base = Math.max(cv.width / bmp.width, cv.height / bmp.height);
  const sc = base * _cph.zoom; const w = bmp.width * sc; const h = bmp.height * sc;
  _cph.ox = Math.min(0, Math.max(cv.width - w, _cph.ox)); _cph.oy = Math.min(0, Math.max(cv.height - h, _cph.oy));
  ctx.fillStyle = '#0b0c0e'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, _cph.ox, _cph.oy, w, h);
}
function cphMode(crop) {
  const q = (id) => document.getElementById(id);
  q('cphCrop').hidden = !crop; q('cphZoomRow').hidden = !crop; q('cphCropActions').hidden = !crop; q('cphActions').hidden = crop;
  q('cphImg').hidden = crop; q('cphTag').hidden = crop;
}
async function cphOpenFile(file) {
  const msg = document.getElementById('cphMsg');
  if (!file || !/^image\//.test(file.type || 'image/')) { if (msg) msg.textContent = 'Нужен файл изображения'; return; }
  if (file.size > 40 * 1024 * 1024) { if (msg) msg.textContent = 'Файл больше 40 МБ'; return; }
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (_) {
    try { const url = URL.createObjectURL(file); const im = new Image(); im.src = url; await im.decode(); bmp = im; setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e) { if (msg) msg.textContent = 'Не получилось открыть фото — попробуй JPEG'; return; }
  }
  const cv = document.getElementById('cphCrop');
  cv.width = CPH_W; cv.height = CPH_H;
  _cph = { bmp, zoom: 1, ox: 0, oy: 0 };
  const base = Math.max(CPH_W / bmp.width, CPH_H / bmp.height);
  _cph.ox = (CPH_W - bmp.width * base) / 2; _cph.oy = (CPH_H - bmp.height * base) / 2;
  document.getElementById('cphZoom').value = '1';
  cphMode(true); cphDraw();
  if (msg) msg.textContent = 'Подвинь фото пальцем, масштаб — ползунком';
}
function cphBlob(cv, type, q) { return new Promise((res) => cv.toBlob((b) => res(b), type, q)); }
async function cphEncode() {
  const cv = document.getElementById('cphCrop');
  for (const q of [0.84, 0.76, 0.68, 0.6, 0.5]) {
    let b = await cphBlob(cv, 'image/webp', q);
    if (!b || b.type !== 'image/webp') b = await cphBlob(cv, 'image/jpeg', q); // Safari без WebP-кодера
    if (b && b.size <= CPH_MAX) return b;
  }
  return null;
}
const cphDataUrl = (b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
async function renderCarPhotoCard() {
  const card = document.getElementById('accCarPhoto'); if (!card) return;
  if (!currentUser() || !isRemoteApi()) { card.hidden = true; return; }
  card.hidden = false;
  if (_cph) return; // идёт кадрирование
  let st = myCarPhotoState();
  if (st === undefined) { try { await homeRemote(); } catch (_) {} st = myCarPhotoState(); }
  const img = document.getElementById('cphImg'); const tag = document.getElementById('cphTag');
  const ph = myCarPhotoUrl();
  const id = homeHeroCarId();
  if (ph) { img.removeAttribute('srcset'); img.src = ph; tag.textContent = 'твоё фото'; }
  else { fillCarImg293(img, id); tag.textContent = 'превью модели'; }
  document.getElementById('cphDelete').hidden = !ph;
  document.getElementById('cphPickTxt').textContent = ph ? 'Заменить фото' : 'Загрузить фото';
  document.getElementById('cphShareRow').hidden = !ph;
  document.getElementById('cphShare').checked = !!(st && st.share !== false);
  cphMode(false);
}
(() => {
  const q = (id) => document.getElementById(id);
  q('cphFile')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void cphOpenFile(f); });
  q('cphZoom')?.addEventListener('input', (e) => {
    if (!_cph) return; const cv = q('cphCrop'); const z0 = _cph.zoom; const z1 = Number(e.target.value) || 1;
    const cx = cv.width / 2, cy = cv.height / 2; _cph.ox = cx - (cx - _cph.ox) * z1 / z0; _cph.oy = cy - (cy - _cph.oy) * z1 / z0; _cph.zoom = z1; cphDraw();
  });
  let drag = null;
  q('cphCrop')?.addEventListener('pointerdown', (e) => { if (!_cph) return; const r = e.currentTarget.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, k: e.currentTarget.width / r.width }; e.currentTarget.setPointerCapture(e.pointerId); });
  q('cphCrop')?.addEventListener('pointermove', (e) => { if (!drag || !_cph) return; _cph.ox += (e.clientX - drag.x) * drag.k; _cph.oy += (e.clientY - drag.y) * drag.k; drag.x = e.clientX; drag.y = e.clientY; cphDraw(); });
  const up = () => { drag = null; };
  q('cphCrop')?.addEventListener('pointerup', up); q('cphCrop')?.addEventListener('pointercancel', up);
  q('cphCancel')?.addEventListener('click', () => { _cph = null; q('cphMsg').textContent = ''; void renderCarPhotoCard(); });
  q('cphSave')?.addEventListener('click', async () => {
    const msg = q('cphMsg'); const btn = q('cphSave');
    btn.disabled = true; msg.textContent = 'Сжимаем…';
    const blob = await cphEncode();
    if (!blob) { btn.disabled = false; msg.textContent = 'Слишком тяжёлое фото — попробуй другое'; return; }
    msg.textContent = 'Загружаем…';
    const r = await api.putCarPhoto({ image: await cphDataUrl(blob) }).catch(() => null);
    btn.disabled = false;
    if (r && r.ok) { _cph = null; setMyCarPhoto(r.carPhoto); msg.textContent = `Сохранено · ${Math.round(blob.size / 1024)} КБ`; void renderCarPhotoCard(); }
    else msg.textContent = r?.code === 'too_large' ? 'Слишком большое фото' : r?.code === 'has_meta' ? 'В файле остались метаданные — попробуй ещё раз' : 'Не сохранилось — проверь сеть';
  });
  q('cphDelete')?.addEventListener('click', async () => {
    const msg = q('cphMsg'); msg.textContent = 'Удаляем…';
    const r = await api.deleteCarPhoto().catch(() => null);
    if (r && r.ok) { setMyCarPhoto(null); msg.textContent = 'Фото удалено — снова студийный рендер'; void renderCarPhotoCard(); } else msg.textContent = 'Не получилось — проверь сеть';
  });
  q('cphShare')?.addEventListener('change', async (e) => {
    const r = await api.putCarPhoto({ share: !!e.target.checked }).catch(() => null);
    if (r && r.ok) setMyCarPhoto(r.carPhoto); else { e.target.checked = !e.target.checked; q('cphMsg').textContent = 'Не сохранилось — проверь сеть'; }
  });
})();
/** Карточка заезда: своё фото, если включено «Показывать на карточке» (только свои заезды). */
function applySharePhoto(payload) {
  const box = document.getElementById('sharePhoto'); const im = document.getElementById('sharePhotoImg');
  if (!box || !im) return;
  const st = myCarPhotoState(); const url = myCarPhotoUrl();
  let own = false; try { own = !!_shareOwn; } catch (_) {} // чужая карточка по ссылке — никогда не моё фото
  const show = !!(url && st && st.share !== false && own);
  box.hidden = !show;
  if (show && im.getAttribute('src') !== url) { im.onerror = () => { box.hidden = true; }; im.src = url; }
}
/* v131: «Следить» за пилотом / командой — бот пишет об их зачтённых улучшениях (правила уведомлений v121) */
let _follows = null; let _followsAt = 0;
async function loadFollows(force) {
  if (!currentUser() || !isRemoteApi()) return null;
  if (!force && _follows && Date.now() - _followsAt < 60e3) return _follows;
  const r = await api.getFollows().catch(() => null);
  if (r) { _follows = r; _followsAt = Date.now(); }
  return _follows;
}
function isFollowing(kind, id) { return !!_follows?.items?.some((x) => x.kind === kind && x.id === id); }
function followButton(kind, id, name) {
  const btn = padEl('button', 'follow-btn', 'Следить');
  btn.type = 'button';
  const paint = () => { const on = isFollowing(kind, id); btn.classList.toggle('on', on); btn.textContent = on ? 'Ты следишь' : 'Следить'; btn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
  paint();
  void loadFollows().then(paint);
  btn.addEventListener('click', async () => {
    if (!currentUser()) { plFlash('Сначала войди через Telegram'); goToView('account'); return; }
    const on = !isFollowing(kind, id);
    btn.disabled = true;
    const r = await api.setFollow(kind, id, on).catch(() => null);
    btn.disabled = false;
    if (r && r.ok) {
      _follows = _follows || { items: [] };
      if (on) _follows.items.push({ kind, id, name }); else _follows.items = _follows.items.filter((x) => !(x.kind === kind && x.id === id));
      paint();
      plFlash(on ? `Следишь: ${name}. Улучшения придут в бот` : 'Больше не следишь');
    } else plFlash(r?.code === 'follow_limit' ? `Лимит подписок — ${r.max || 30}` : r?.code === 'self' ? 'Это ты' : 'Не получилось — проверь сеть');
  });
  return btn;
}
function appendFollowButton(body, pid, res) {
  if (!body || !pid || isMyPilotId(pid) || !/^p_[0-9a-f-]{36}$/.test(String(pid))) return;
  const name = String(res?.nick || res?.pilot?.nick || res?.name || 'пилот').slice(0, 40);
  body.appendChild(followButton('pilot', pid, name));
}
async function renderFollowsCard() {
  const card = document.getElementById('accFollows'); if (!card) return;
  if (!currentUser() || !isRemoteApi()) { card.hidden = true; return; }
  const r = await loadFollows(true);
  if (!r) { card.hidden = true; return; }
  card.hidden = false;
  const list = document.getElementById('accFollowList'); list.replaceChildren();
  for (const x of (r.items || []).filter((y) => !(TEAMS_OFF && y.kind === 'team'))) {
    const li = padEl('li', 'follow-item');
    li.appendChild(padAvatar(x.name, '', 34));
    const t = padEl('div', 'follow-t'); t.append(padEl('b', '', x.name), padEl('span', '', x.kind === 'team' ? 'команда' : 'пилот'));
    const off = padEl('button', 'follow-off', 'Не следить'); off.type = 'button';
    off.addEventListener('click', async () => { off.disabled = true; const q = await api.setFollow(x.kind, x.id, false).catch(() => null); if (q && q.ok) { _follows.items = _follows.items.filter((y) => !(y.kind === x.kind && y.id === x.id)); li.remove(); renderFollowNote(); } else off.disabled = false; });
    li.append(t, off);
    if (x.kind === 'pilot') { t.classList.add('tp-link'); t.dataset.pilot = x.id; t.setAttribute('role', 'button'); t.tabIndex = 0; }
    list.appendChild(li);
  }
  renderFollowNote();
}
document.getElementById('accFollowList')?.addEventListener('click', (e) => { const p = e.target.closest('[data-pilot]'); if (p) void openPilotProfile(p.dataset.pilot); });
function renderFollowNote() {
  const n = _follows?.items?.length || 0;
  const el = document.getElementById('accFollowNote');
  if (el) el.textContent = n ? `${n} из ${_follows.max || 30}` : 'Пока ни на кого. В профиле пилота — «Следить».';
}
/* v121: профиль → «Уведомления в Telegram» (типы по отдельности; без входа карточки нет) */
let _notifySeq = 0;
async function renderNotifyCard() {
  const card = document.getElementById('accNotify');
  if (!card) return;
  if (!currentUser() || !isRemoteApi()) { card.hidden = true; return; }
  const seq = ++_notifySeq;
  const r = await api.getNotify().catch(() => null);
  if (seq !== _notifySeq) return;
  if (!r || r.ok === false || !r.prefs) { card.hidden = true; return; }
  card.hidden = false;
  const st = document.getElementById('accNotifyState');
  const bot = document.getElementById('accNotifyBot');
  const name = r.bot || 'pitlane_official_bot';
  if (bot) { bot.href = 'https://t.me/' + encodeURIComponent(name); bot.hidden = !!(r.linked && r.started) || !r.linked; }
  if (st) {
    st.textContent = !r.linked ? 'Аккаунт не привязан к Telegram — войди через Telegram, тогда бот сможет писать.'
      : r.botStopped ? 'Выключено в боте командой /stop_notify. Включить — /start_notify в боте.'
      : !r.started ? 'Напиши боту @' + name + ' (/start): Telegram не даёт боту писать первым.'
      : 'Бот пишет только о твоих событиях.';
  }
  const list = document.getElementById('accNotifyList');
  if (!list) return;
  list.replaceChildren();
  const row = (key, label, on) => {
    const l = padEl('label', 'notify-row');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!on; cb.dataset.nk = key;
    l.append(cb, padEl('span', '', label));
    list.appendChild(l);
  };
  (r.types || []).forEach((t) => row(t, (r.labels && r.labels[t]) || t, r.prefs[t]));
  row('stop', 'Не присылать ничего', r.prefs.stop);
}
document.getElementById('accNotifyList')?.addEventListener('change', async () => {
  const body = {};
  document.querySelectorAll('#accNotifyList [data-nk]').forEach((c) => { body[c.dataset.nk] = !!c.checked; });
  const msg = document.getElementById('accNotifyMsg');
  if (msg) msg.textContent = 'Сохраняем…';
  const r = await api.putNotify(body).catch(() => null);
  if (msg) msg.textContent = r && r.ok ? 'Сохранено' : 'Не сохранилось — проверь сеть';
});
/* v107: «Оспорить» — жалоба на результат топа / дуэли: уходит в KV и владельцу; сама ничего не удаляет */
let _disputeCtx = null;
document.getElementById('duelDisputeBtn')?.addEventListener('click', () => {
  const id = document.getElementById('duelDisputeRow')?.dataset.duel || '';
  if (id) void sendDispute({ kind: 'duel', target: id }, document.getElementById('duelDisputeMsg'));
});
function appendDisputeButton(body, pid) {
  const ctx = _disputeCtx;
  if (!body || !ctx || ctx.target !== pid || isMyPilotId(pid)) return;
  const wrap = padEl('div', 'dispute-row');
  const btn = padEl('button', 'auth-alt-btn dispute-btn', 'Оспорить результат');
  btn.type = 'button';
  const msg = padEl('p', 'tiny muted', '');
  btn.addEventListener('click', () => { void sendDispute(ctx, msg); });
  wrap.append(btn, msg);
  body.appendChild(wrap);
}
/** v172: свой лист ввода вместо системного prompt() — в стиле приложения, с клавиатурой iOS, Esc/скрим/смахивание = отмена. Возвращает строку или null. */
function askText172(title, { placeholder = '', value = '', multi = false, ok = 'Готово', hint = '' } = {}) {
  return new Promise((resolve) => {
    const root = document.createElement('div'); root.className = 'ds-sheet ask172'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.innerHTML = '<div class="ds-sheet-scrim" data-ask-x></div><div class="ds-sheet-panel"><header class="ds-sheet-hd"><b></b><button type="button" class="ds-sheet-x pl-x pl-inline" data-ask-x aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header><div class="ask172-body"><p class="ask172-hint"></p></div><button type="button" class="ask172-ok"></button></div>';
    root.querySelector('b').textContent = title;
    const hp = root.querySelector('.ask172-hint'); if (hint) hp.textContent = hint; else hp.remove();
    const f = document.createElement(multi ? 'textarea' : 'input'); f.className = 'ask172-in'; f.placeholder = placeholder; f.value = value || ''; if (!multi) { f.type = 'text'; f.enterKeyHint = 'done'; } else f.rows = 4;
    f.setAttribute('aria-label', title); root.querySelector('.ask172-body').prepend(f);
    const okb = root.querySelector('.ask172-ok'); okb.textContent = ok;
    let done = false;
    const fin = (v) => { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); root.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fin(null); } else if (e.key === 'Enter' && !multi) { e.preventDefault(); fin(f.value); } };
    root.addEventListener('click', (e) => { if (e.target.closest('[data-ask-x]')) fin(null); else if (e.target.closest('.ask172-ok')) fin(f.value); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    setTimeout(() => { try { f.focus(); } catch (_) {} }, 60);
    window.__ask172 = { fin, root };
  });
}

async function sendDispute(ctx, msgEl) {
  const say = (t) => { if (msgEl) msgEl.textContent = t; };
  if (!currentUser()) { say(REJECT_TEXT.no_account); return; }
  let reason = '';
  try { reason = (await askText172('Что не так с результатом?', { placeholder: 'Видео, свидетели, подозрение на подделку трека…', multi: true, ok: 'Отправить жалобу' })) || ''; } catch (_) {}
  reason = reason.trim();
  if (reason.length < 3) { say('Опишите, что не так — хотя бы пару слов.'); return; }
  const res = await api.dispute({ ...ctx, reason: reason.slice(0, 500) });
  say(res && res.ok ? 'Отправлено на проверку. Решим после разбора.' : (res && res.status === 429 ? 'Слишком много жалоб за сутки — попробуйте завтра.' : 'Не удалось отправить — попробуйте позже.'));
}
document.getElementById('pilotClose')?.addEventListener('click', () => { _pilotOpen = null; padShow('pilotSheet', false); });
document.getElementById('pilotSheet')?.addEventListener('click', (e) => {
  if (e.target?.id === 'pilotSheet') { _pilotOpen = null; padShow('pilotSheet', false); return; }
  void padOnCardClick(e);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('padCommentsSheet')?.classList.contains('hidden')) padShow('padCommentsSheet', false);
  else if (!document.getElementById('pilotSheet')?.classList.contains('hidden')) padShow('pilotSheet', false);
});
// tops rows → public profile
['topLap', 'topSector', 'topStraight'].forEach((id) => {
  document.getElementById(id)?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pilot]');
    if (row) void openPilotProfile(row.dataset.pilot);
  });
  document.getElementById(id)?.addEventListener('keydown', (e) => {
    const row = e.target.closest('[data-pilot]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void openPilotProfile(row.dataset.pilot); }
  });
});

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
/* ——— v134: надёжная отправка в Paddock ———
 * Как в Telegram: сообщение сразу появляется в ленте со статусом «Отправляется…», уходит с id (cid) —
 * повтор после обрыва не создаёт дубль; при ошибке остаётся в ленте с понятной причиной и «Повторить»,
 * текст хранится в localStorage до успешной отправки. Двойной тап не шлёт второй раз. */
const PAD_OUT_KEY = 'pitlane-pad-out-v1';
const PAD_SENT_KEEP_MS = 3 * 60e3; // свой отправленный пост держим, пока снимок ленты (KV) его не догонит
let _padOut = [];
try { const a = JSON.parse(localStorage.getItem(PAD_OUT_KEY) || '[]'); if (Array.isArray(a)) _padOut = a.filter((x) => x && x.cid && x.text).map((x) => (x.status === 'sending' ? { ...x, status: 'failed', kind: 'net' } : x)); } catch (_) {}
function padOutSave() {
  try { localStorage.setItem(PAD_OUT_KEY, JSON.stringify(_padOut.filter((x) => x.status !== 'sent').map(({ img, ...x }) => ({ ...x, hadImg: !!img })).slice(-20))); } catch (_) {}
}
function padNewCid() {
  try { const b = new Uint8Array(9); crypto.getRandomValues(b); return 'c' + Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 17); } catch (_) { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
}
function padOutReason(it) {
  const k = it.kind;
  if (k === 'rate') return 'Слишком часто — подожди ' + (it.retryAfter && it.retryAfter <= 90 ? it.retryAfter + ' с' : 'немного');
  if (k === 'auth') return isTMA ? 'Сессия истекла — закрой и открой мини-приложение' : 'Сессия истекла — войди заново';
  if (k === 'big') return 'Фото слишком большое';
  if (k === 'invalid') return 'Сообщение не принято';
  if (k === 'server') return 'Сервер не ответил';
  return (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'Нет сети' : 'Нет связи с сервером';
}
function buildOutCard(it) {
  const me = currentUser();
  const card = padEl('article', 'pulse-card pad-out is-' + it.status);
  card.dataset.cid = it.cid;
  const head = padEl('header', 'pad-head');
  head.appendChild(padAuthor({ name: pulseWho(), pilotId: accountPilotId(), avatar: padAvaUrl(accountPilotId(), ''), meta: [pickedCar()?.name || '', 'сейчас'].filter(Boolean).join(' · ') }));
  card.appendChild(head);
  card.appendChild(padEl('p', 'pad-text', it.text));
  if (it.img && PAD_IMG_RE.test(String(it.img))) { const im = document.createElement('img'); im.className = 'pad-img'; im.alt = ''; im.src = it.img; card.appendChild(im); }
  const st = padEl('div', 'pad-out-st');
  st.setAttribute('role', 'status');
  if (it.status === 'sending') {
    st.append(padEl('span', 'pad-out-spin'), padEl('span', '', 'Отправляется…'));
  } else {
    st.append(padEl('span', 'pad-out-bang', '!'), padEl('span', 'pad-out-why', 'Не отправлено · ' + padOutReason(it)));
    const again = padEl('button', 'pad-out-btn', it.kind === 'auth' && !me ? 'Войти' : 'Повторить');
    again.type = 'button'; again.dataset.retry = it.cid;
    const drop = padEl('button', 'pad-out-btn ghost', 'Удалить');
    drop.type = 'button'; drop.dataset.drop = it.cid;
    st.append(again, drop);
  }
  card.appendChild(st);
  return card;
}
/** Вставить/обновить исходящие карточки вверху ленты (без перерисовки всей ленты). */
function padPaintOut() {
  const feed = document.getElementById('pulseFeed');
  if (!feed) return;
  feed.querySelectorAll('.pad-out').forEach((c) => { if (!_padOut.some((x) => x.cid === c.dataset.cid && x.status !== 'sent')) c.remove(); });
  const live = _padOut.filter((x) => x.status !== 'sent' && (x.ch || 'gen') === CP.ch);
  if (live.length) feed.querySelector('.pad-empty')?.remove();
  for (const it of live.slice().reverse()) {
    const old = feed.querySelector(`.pad-out[data-cid="${it.cid}"]`);
    const card = buildOutCard(it);
    if (old) old.replaceWith(card); else feed.prepend(card);
  }
}
function padSyncSendBtn() {
  const b = document.getElementById('pulseSend');
  if (b) b.disabled = !(pulseText?.value || '').trim();
}
async function padDeliver(it) {
  it.status = 'sending'; it.kind = ''; padOutSave(); padPaintOut();
  const r = await api.sendPulse({ cid: it.cid, id: 'p' + it.at, who: pulseWho(), text: it.text, img: it.img || null, at: it.at, likes: [], car: it.car || '', ch: it.ch || 'gen', ...(it.trk ? { trk: it.trk } : {}), ...(it.run ? { run: it.run } : {}) });
  if (r.ok) {
    it.status = 'sent';
    it.post = (r.rows || []).find((p) => p && (p.cid === it.cid || (r.id && p.id === r.id))) || null;
    it.sentAt = Date.now();
    padOutSave();
    try { localStorage.setItem(PULSE_SEEN_KEY, String(Date.now())); } catch (_) {}
    _padChatAt = 0; _hwPadAt = 0;
    try { tmaHaptic('light'); } catch (_) {}
    renderPulseRows(r.rows);
    return true;
  }
  Object.assign(it, { status: 'failed', kind: r.kind, retryAfter: r.retryAfter || 0, err: r.error || '' });
  padOutSave(); padPaintOut();
  if (r.kind === 'auth') { try { refreshAccount(); } catch (_) {} }
  return false;
}
pulseText?.addEventListener('input', () => {
  const n = pulseText.value.length;
  const el = document.getElementById('pulseCount');
  if (el) el.textContent = n + '/280';
  padSyncSendBtn();
});
let _padSendLock = 0;
async function padSendFromComposer() {
  const msg = document.getElementById('pulseMsg');
  if (needLogin('Войди, чтобы писать в чат.')) return;
  const text = (pulseText?.value || '').trim();
  if (!text) { padSyncSendBtn(); return; }
  if (CP.ch === 'tracks' && !CP.trk) { if (msg) msg.textContent = 'Выбери трассу — сообщение попадёт в её обсуждение'; try { document.getElementById('cpTrkSel')?.focus(); } catch (_) {} return; }
  if (_padSendLock && Date.now() - _padSendLock < 600) return; // двойной тап
  _padSendLock = Date.now();
  const inp = document.getElementById('pulseImg');
  const f = inp?.files?.[0];
  // поле очищаем сразу (как в Telegram) — повторный тап по пустому полю ничего не шлёт; текст живёт в карточке
  if (pulseText) { pulseText.value = ''; pulseText.style.height = ''; }
  const cnt = document.getElementById('pulseCount'); if (cnt) cnt.textContent = '0/280';
  if (inp) inp.value = '';
  if (msg) msg.textContent = '';
  padSyncSendBtn();
  const att = CP.att || CP.ch === 'runs' ? padLastRun() : null;
  const it = { cid: padNewCid(), text: text.slice(0, 280), img: null, at: Date.now(), car: pickedCar()?.name || '', status: 'sending', ch: CP.ch, ...(CP.ch === 'tracks' && CP.trk ? { trk: CP.trk } : {}), ...(att ? { run: att } : {}) };
  _padOut.push(it); padOutSave(); padPaintOut();
  document.getElementById('tgSheetBody')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  document.getElementById('chatBody')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  if (f) { it.img = await compressPulseImg(f); padPaintOut(); }
  await padDeliver(it);
}
document.getElementById('pulseSend')?.addEventListener('click', () => { void padSendFromComposer(); });
// v134: тап по кнопке не уводит фокус из поля — клавиатура iOS не схлопывается и кнопка не «уезжает» из-под пальца
['pointerdown', 'mousedown'].forEach((ev) => document.getElementById('pulseSend')?.addEventListener(ev, (e) => { if (document.activeElement === pulseText) e.preventDefault(); }));
document.getElementById('pulseFeed')?.addEventListener('click', (e) => {
  const rb = e.target.closest?.('[data-retry]');
  const db2 = e.target.closest?.('[data-drop]');
  if (!rb && !db2) return;
  e.stopPropagation();
  const cid = (rb || db2).dataset.retry || (rb || db2).dataset.drop;
  const it = _padOut.find((x) => x.cid === cid);
  if (!it) return;
  if (db2) { _padOut = _padOut.filter((x) => x !== it); padOutSave(); padPaintOut(); if (!(pulseText?.value || '').trim() && pulseText) { pulseText.value = it.text; pulseText.dispatchEvent(new Event('input')); } return; }
  if (it.kind === 'auth' && !currentUser()) { padCloseSheets(); needLogin('Войди, чтобы отправить сообщение'); return; }
  void padDeliver(it);
}, true);
// сеть вернулась → дослать то, что упало из-за связи
window.addEventListener('online', () => { for (const it of _padOut) if (it.status === 'failed' && (it.kind === 'net' || it.kind === 'server')) void padDeliver(it); });
padSyncSendBtn();
// v125: поле «Написать в Paddock…» в шторке растёт по тексту (до ~4 строк)
pulseText?.addEventListener('input', () => { if (!pulseText.closest('.pc-foot')) { pulseText.style.height = ''; return; } pulseText.style.height = 'auto'; pulseText.style.height = Math.min(pulseText.scrollHeight, 112) + 'px'; });
document.getElementById('pulseFeed')?.addEventListener('click', (e) => { void padOnCardClick(e); });

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
  if (!deep.view) {
    // v202: по умолчанию приложение открывается на «Замере»; ссылки (#r=/#s=, startapp, ?screen=) ведут куда указывают
    let sp = '';
    try { sp = String(window.Telegram?.WebApp?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('tgWebAppStartParam') || ''); } catch (_) {}
    const hasLink = !!sp || /^#([rs]|duel|crew|view)=/i.test(location.hash || '') || /[?&](screen|startapp|r|s)=/i.test(location.search || '');
    if (!hasLink) {
      const z = () => { try { if (document.querySelector('.view.active')?.id !== 'view-zamer') goToView('zamer'); } catch (_) {} try { void renderZamerTop202(); } catch (_) {} };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(z, 0)); else setTimeout(z, 0);
    } else if (document.querySelector('.view.active')?.id === 'view-zamer' && !deep.view) {
      // ссылка без view: прежнее поведение — стартуем с главной, обработчик ссылки откроет нужное
      try { goToView('home'); } catch (_) {}
    }
    return;
  }
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


{ // v247: учёт первого фута (rollout, как Dragy) — по умолчанию выкл.
  const cb = document.getElementById('rolloutToggle');
  if (cb) { cb.checked = rolloutOn(); cb.addEventListener('change', () => { try { localStorage.setItem(ROLLOUT_KEY, cb.checked ? '1' : '0'); } catch (_) {} }); }
}
document.getElementById('btnEnableImu')?.addEventListener('click', async () => {
  const tip = document.getElementById('imuTip');
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (tip) tip.textContent = r === 'granted'
        ? 'Акселерометр и гироскоп включены — можно начинать замер или круг.'
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
/** v104: сырой трек последнего замера — уходит с забегом в дуэль (сервер пересчитывает сам). */
let _lastRunTrace = null;
/** v104: отправка в топ, которую ждёт загрузка призрака (сервер принимает призрак только к зачтённому результату). */
let _topSubmitP = Promise.resolve();

function rememberDuelCandidateFromShare(payload) {
  if (DUELS_OFF) return; // v197: дуэли убраны
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
    car: payload.car || pickedCar()?.name || '',
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
  if (_lastRunTrace && _lastRunTrace.type === cand.type && _lastRunTrace.trace) {
    cand.trace = _lastRunTrace.trace;
    if (_lastRunTrace.how) cand.how = _lastRunTrace.how;
  }
  _lastDuelCandidate = cand;
  try { localStorage.setItem('pitlane-duel-last-v1', JSON.stringify(cand)); } catch (_) {
    try { const { trace, ...lite } = cand; localStorage.setItem('pitlane-duel-last-v1', JSON.stringify(lite)); } catch (_) {}
  }
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
  void refreshDuelGhostOpt();
  try { refreshDuelTrackMap(); } catch (_) {}
}

// v121: вызов конкретному пилоту (из его профиля) — ему придёт «Тебя вызвали», если он включил уведомления
let _duelTo = null;
function openDuelSheet(opts = {}) {
  if (DUELS_OFF) return; // v197: дуэли убраны
  const sheet = document.getElementById('duelSheet');
  if (!sheet) return;
  _duelTo = opts.to && opts.to.id ? { id: String(opts.to.id), name: String(opts.to.name || 'пилот').slice(0, 48) } : null;
  const toLine = document.getElementById('duelToLine');
  if (toLine) { toLine.hidden = !_duelTo; toLine.textContent = _duelTo ? 'Вызов для: ' + _duelTo.name + '. Ссылка сработает только у него; если он включил уведомления — бот сообщит.' : ''; }
  const nick = document.getElementById('duelNick');
  if (nick && !nick.value) nick.value = duelPilotNick();
  fillDuelTrackSelect();
  setDuelType(opts.type || _duelType || 'drag');
  if (opts.trackId) {
    const sel = document.getElementById('duelTrackSelect');
    if (sel) sel.value = opts.trackId;
    void refreshDuelGhostOpt();
  }
  try { refreshDuelTrackMap(); } catch (_) {}
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
  try { if (document.getElementById('view-duels')?.classList.contains('active')) void renderDuelsView(); } catch (_) {}
}

function statusLabelRu(st) {
  if (st === 'ready') return 'готово';
  if (st === 'expired') return 'истекла';
  return 'открыта';
}

function renderDuelSides(d) {
  const box = document.getElementById('duelSides');
  if (!box) return;
  box.replaceChildren();
  box.classList.add('duel-vs-board');
  const side = (key) => {
    const who = key === 'creator' ? d.createdBy : d.challenger;
    const run = key === 'creator' ? d.creatorRun : d.challengerRun;
    const win = d.status === 'ready' && d.winner === key;
    const el = padEl('div', 'duel-side' + (win ? ' win' : '') + (key === 'challenger' ? ' r' : ''));
    el.appendChild(padAvatar(who?.name || '?', who?.avatar, 64));
    el.appendChild(padEl('div', 'who', who ? clipText(who.name || 'пилот', 14) : (key === 'creator' ? 'создатель' : 'соперник?')));
    const time = padEl('div', 'time' + (run ? '' : ' wait'), run ? duelTimeText(d, run) : 'ждём заезд');
    if (run?.asC) time.appendChild(padEl('span', 'duel-badge c', 'C'));
    else if (run?.gpsQ === 'A' || run?.gpsQ === 'B') time.appendChild(padEl('span', 'duel-badge' + (run.gpsQ === 'B' ? ' b' : ''), run.gpsQ));
    else if (run?.gpsQ === 'C') time.appendChild(padEl('span', 'duel-badge c', 'C'));
    el.appendChild(time);
    if (run?.asC) el.appendChild(padEl('div', 'meta', 'внешний GPS · засчитан как C'));
    el.appendChild(padEl('div', 'meta', run?.car ? shortCarName(run.car, run.carId) : '—'));
    // v112: «сектор 2 отдал 0.3» — my own run vs my best sectors on this track (server sectors of the duel run)
    if (d.type === 'lap' && run && Array.isArray(run.sectors) && duelIsMine(who?.id)) {
      try {
        const same = (state.laps?.[d.trackId] || []).find((x) => x.ms === run.ms);
        const t = sectorLossText(sectorLossOf(d.trackId, { sectors: run.sectors, ms: run.ms }, same ? same.at : undefined), true);
        if (t) el.appendChild(padEl('div', 'meta duel-sec', t));
      } catch (_) {}
    }
    if (win) el.appendChild(padEl('div', 'duel-win', 'победа'));
    return el;
  };
  box.appendChild(side('creator'));
  box.appendChild(padEl('div', 'duel-vs-x', 'VS'));
  box.appendChild(side('challenger'));
}

async function showDuelView(id) {
  if (DUELS_OFF) return; // v197: дуэли убраны
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
  const typeLab = d.type === 'lap' ? ('круг' + (trackName ? ' · ' + trackName : '')) : (d.disc === '402m' ? '¼ мили' : '0–100');
  const st = document.getElementById('duelStatusLine');
  if (st) st.textContent = statusLabelRu(d.status) + ' · ' + typeLab + (d.cls === 'c' ? ' · зачёт C (телефон)' : d.cls === 'ab' ? ' · A/B' : '');
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
      res.textContent = 'Срок истёк (' + (d.days || 7) + ' дн.)';
    } else {
      res.hidden = true;
      res.textContent = '';
    }
  }
  {
    const dr = document.getElementById('duelDisputeRow');
    if (dr) {
      dr.hidden = !(d.status === 'ready' && currentUser());
      dr.dataset.duel = d.id || '';
      const dm = document.getElementById('duelDisputeMsg'); if (dm) dm.textContent = '';
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
  renderDuelGhostBox(d, { iAmCreator, myRun });
  const submitBtn = document.getElementById('duelSubmitRun');
  if (submitBtn) {
    const locked = d.status === 'ready' || d.status === 'expired' || !!myRun;
    submitBtn.disabled = locked;
    submitBtn.textContent = myRun ? 'Заезд уже прикреплён' : 'Прикрепить мой заезд';
  }
  const hint = document.getElementById('duelHint');
  if (hint) {
    if (!isRemoteApi()) hint.textContent = 'Нужен Worker API (meta pitlane-api).';
    // v118: класс дуэли — по первому заезду; сравнение только внутри класса
    else if (d.status === 'open' && d.cls === 'c') hint.textContent = 'Зачёт C: телефон на телефон (≈ ±0,3 с). Внешний GPS тоже можно — его заезд считается как C. Ссылка действует ' + (d.days || 7) + ' дн.';
    else if (d.status === 'open' && d.cls === 'ab') hint.textContent = 'Зачёт A/B: нужен внешний GPS. Телефонный ответ несопоставим и не принимается. Ссылка действует ' + (d.days || 7) + ' дн.';
    else if (d.status === 'open') hint.textContent = 'Класс задаст первый заезд: внешний GPS → A/B, телефон → зачёт C. Ссылка действует ' + (d.days || 7) + ' дн.';
    else hint.textContent = d.cls === 'c' ? 'Дуэль зафиксирована · зачёт C (оба заезда сравнены по худшему классу).' : 'Дуэль зафиксирована · зачёт A/B.';
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
    const title = typeLab + (d.cls === 'c' ? ' · C' : '') + ' · ' + (d.createdBy?.name || 'пилот');
    return `<li data-duel-id="${esc(d.id)}"><span class="dl-main">${esc(title)}</span><span class="dl-st">${esc(statusLabelRu(d.status))}</span></li>`;
  }).join('');
}

async function createDuelFromUi() {
  if (DUELS_OFF) return; // v197: дуэли убраны
  if (!currentUser()) { const h = document.getElementById('duelHint'); if (h) h.textContent = REJECT_TEXT.no_account; return; }
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
  let ghostId;
  if (document.getElementById('duelGhostOn')?.checked && _duelGhostCand) {
    const g = await ensureDuelGhostId();
    if (!g.id) {
      const hint = document.getElementById('duelHint');
      if (hint) hint.textContent = 'Призрак не прикрепился: ' + String(g.error || 'ошибка').slice(0, 80) + '. Сними галочку или попробуй позже.';
      return;
    }
    ghostId = g.id;
  }
  const duel = await api.createDuel({
    type: _duelType,
    trackId,
    createdBy: nick,
    name: nick,
    note: note || undefined,
    days: _duelDays,
    ghostId,
    ...(_duelTo ? { to: _duelTo.id } : {}),
  });
  if (duel?.id) _duelTo = null;
  if (!duel?.id) {
    const hint = document.getElementById('duelHint');
    if (hint) hint.textContent = 'Не удалось создать дуэль' + (duel?.error ? ': ' + String(duel.error).slice(0, 80) : '. Проверь сеть / Worker.');
    return;
  }
  try {
    const ids = JSON.parse(localStorage.getItem('pitlane-duels-mine-v1') || '[]');
    localStorage.setItem('pitlane-duels-mine-v1', JSON.stringify([duel.id, ...(Array.isArray(ids) ? ids : [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 40)));
  } catch (_) {}
  hap(18);
  await showDuelView(duel.id);
  void playDuelVsFx(myDuelPerson(), { name: 'соперник?', unknown: true, carHint: 'ждём по ссылке' }, 'Вызов брошен · ' + duelTypeLabel(duel));
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
  if (DUELS_OFF) return; // v197: дуэли убраны
  if (!currentUser()) { const h = document.getElementById('duelHint'); if (h) h.textContent = REJECT_TEXT.no_account; return; }
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
    const err = res?.code ? rejectText(res) : res?.status === 410 ? 'дуэль истекла' : (res?.error || 'ошибка');
    if (hint) hint.textContent = 'Не принят: ' + err;
    if (res?.duel) await showDuelView(res.duel.id || d.id);
    return;
  }
  hap(20);
  const wasOpenForMe = !d.challenger && !duelIsMine(d.createdBy?.id);
  await showDuelView(res.id || d.id);
  await refreshDuelList();
  if (wasOpenForMe) {
    const cr = d.createdBy || {};
    void playDuelVsFx({ name: cr.name, avatar: cr.avatar, car: d.creatorRun?.car, carId: d.creatorRun?.carId }, myDuelPerson(), 'Вызов принят · дуэль заключена');
  }
  try { void renderDuelsView(); } catch (_) {}
}

async function bootDuelFromUrl() {
  if (DUELS_OFF) return; // v197: дуэли убраны
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
      try { goToView('duels', { sfx: false }); } catch (_) {}
      openDuelSheet({ duelId: id });
      void (async () => {
        try {
          const d = await api.getDuel(id);
          if (!d?.id || duelIsMine(d.createdBy?.id)) return;
          rememberInboxDuel(d.id);
          if (d.status === 'open' && !duelIsMine(d.challenger?.id)) {
            const cr = d.createdBy || {};
            await playDuelVsFx({ name: cr.name, avatar: cr.avatar, car: d.creatorRun?.car, carId: d.creatorRun?.carId }, myDuelPerson(), 'Тебя вызвали · ' + duelTypeLabel(d));
          }
          try { void renderDuelsView(); } catch (_) {}
        } catch (_) {}
      })();
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
  const raw = await askText172('Открыть дуэль', { placeholder: 'Ссылка или id дуэли', ok: 'Открыть' });
  if (!raw) return;
  let id = String(raw).trim();
  const m = id.match(/[?&#]duel=([^&]+)/i) || id.match(/duel\/([^/?#]+)/i);
  if (m) id = decodeURIComponent(m[1]);
  id = id.replace(/^.*duel=/i, '').split(/[&#\s]/)[0];
  if (!id) return;
  openDuelSheet({ duelId: id });
});
/**
 * v111: the share card's own duel. Created lazily (button «В дуэль» or «Поделиться») only for this own fresh
 * A/B lap / 0–100 with a local trace; the creator run goes through the usual server re-check. Card/link carry only the id.
 */
let _shareDuelBusy = null;
async function ensureShareDuel(p) {
  if (DUELS_OFF) return null; // v197: дуэли убраны
  if (!p) return null;
  if (p.duelId) return p.duelId;
  const cand = _shareCand;
  if (!_shareOwn || !cand || !cand.trace || !currentUser() || !isRemoteApi()) return null;
  if (cand.type === 'drag' && p.type !== '0-100') return null;
  if (_shareDuelBusy) return _shareDuelBusy;
  _shareDuelBusy = (async () => {
    const nick = duelPilotNick();
    const duel = await api.createDuel({ type: cand.type, trackId: cand.type === 'lap' ? cand.trackId : undefined, createdBy: nick, name: nick, days: 7 });
    if (!duel?.id) return null;
    try {
      const ids = JSON.parse(localStorage.getItem('pitlane-duels-mine-v1') || '[]');
      localStorage.setItem('pitlane-duels-mine-v1', JSON.stringify([duel.id, ...(Array.isArray(ids) ? ids : [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 40)));
    } catch (_) {}
    const res = await api.submitDuelRun(duel.id, { ...cand, name: nick, gps: true, valid: true, trackId: cand.trackId || undefined }).catch(() => null);
    if (!res || res.error) console.warn('share duel: creator run not accepted', res?.code || res?.error);
    p.duelId = duel.id;
    return duel.id;
  })().finally(() => { _shareDuelBusy = null; });
  return _shareDuelBusy;
}

document.getElementById('shareCardDuel')?.addEventListener('click', async () => {
  const p = _sharePayload;
  const isLap = p && (p.type === 'lap' || p.type === 'круг');
  const btn = document.getElementById('shareCardDuel');
  let id = p?.duelId && /^d[a-z0-9]{6,40}$/.test(p.duelId) ? p.duelId : null;
  if (!id && _shareOwn) {
    if (btn) btn.disabled = true;
    try { id = await ensureShareDuel(p); } catch (_) { id = null; }
    if (btn) btn.disabled = false;
  }
  if (id) {
    // outside Telegram: the deep link opens the Mini App straight on this challenge (startapp=duel_<id>)
    if (!isTMA && !_shareOwn) {
      const cfg = await ensureAuthCfg().catch(() => null);
      const link = tmaStartLink(cfg?.telegramBot, 'duel_' + id);
      if (link) { location.href = link; return; }
    }
    closeShareCard();
    openDuelSheet({ duelId: id });
    return;
  }
  // fallback (¼ mile, not A/B, not logged in, no API): the old create sheet with the hint
  closeShareCard();
  openDuelSheet({
    type: isLap ? 'lap' : 'drag',
    trackId: isLap ? (p?.trackId || TRACKS.find((x) => x.name === p?.track)?.id || state.trackId) : undefined,
    createOnly: true,
  });
  if (!currentUser()) { const h = document.getElementById('duelHint'); if (h) h.textContent = REJECT_TEXT.no_account; }
});

void bootDuelFromUrl();

/* ———————— v89: ghosts — pick, live delta, result sheet, async duels with a ghost ————————
   All user-facing text via textContent. Hot path (GPS point / 100 ms timer): one bsearch + cached DOM writes. */
var ghostRace = {
  lap: { choice: 'best', ref: null, track: null, tMs: null, who: '', opts: {}, duel: null, token: 0, status: 'idle' },
  run: { choice: 'best', disc: '0-100', ref: null, track: null, tMs: null, who: '', opts: {}, duel: null, token: 0, status: 'idle' },
  lapRec: null, lapProg: null, lapLive: null, lineRef: null, lineFor: null,
  runRec: null, runLive: null, runDone: {},
  holdShare: false, pendingShare: null, result: null, shareSeries: null,
};
const GHOST_CHOICE_LS = 'pitlane-ghost-choice-v1';
const GHOST_CHOICES = [['best', 'Мой лучший'], ['leader', 'Лидер'], ['duel', 'Соперник'], ['none', 'Без призрака']];
const GHOST_DISCS = [['0-100', '0–100'], ['402m', '¼ мили']];
try {
  const c = JSON.parse(localStorage.getItem(GHOST_CHOICE_LS) || '{}');
  if (['best', 'leader', 'none'].includes(c.lap)) ghostRace.lap.choice = c.lap;
  if (['best', 'leader', 'none'].includes(c.run)) ghostRace.run.choice = c.run;
  if (c.disc === '402m' || c.disc === '0-100') ghostRace.run.disc = c.disc;
} catch (_) {}
function ghostSaveChoice() {
  const keep = (x) => (x === 'duel' ? 'best' : x);
  try { localStorage.setItem(GHOST_CHOICE_LS, JSON.stringify({ lap: keep(ghostRace.lap.choice), run: keep(ghostRace.run.choice), disc: ghostRace.run.disc })); } catch (_) {}
}
/** Simulator against the production API never feeds public tops / ghosts / duels. */
function simOnProd() {
  try { return extGps?.state() === 'sim' && /workers\.dev/i.test(apiBase() || ''); } catch (_) { return false; }
}
function ghostCanUpload() {
  const tok = getSessionToken();
  return !!(currentUser() && tok && !String(tok).startsWith('local-') && isRemoteApi() && !simOnProd());
}
function lapGhostMode(trackId) { return trackOutlineQuality(trackId) === 'full' ? 'line' : 'traj'; }
function ghostLineRef(trackId) {
  if (ghostRace.lineFor === trackId) return ghostRace.lineRef;
  ghostRace.lineFor = trackId;
  const o = TRACK_OUTLINES[trackId];
  ghostRace.lineRef = o && o.quality === 'full' ? makeLineRef(o.coords, o.sf) : null;
  return ghostRace.lineRef;
}
function fmtGhostT(kind, ms) {
  if (!Number.isFinite(ms)) return '—';
  return kind === 'lap' ? fmtLapTime(ms) : (ms / 1000).toFixed(2) + ' с';
}
function ghostScopeKind(scope) { return scope === 'lap' ? 'lap' : 'drag'; }
function ghostScopeRef(scope) {
  return scope === 'lap' ? (lapRun.trackId || document.getElementById('trackSelect')?.value || TRACKS[0].id) : ghostRace.run.disc;
}
function ghostDuelFits(g, kind, ref) { return !!(g.duel && g.duel.kind === kind && g.duel.ref === ref); }

async function ghostLoad(scope) {
  const g = ghostRace[scope];
  const kind = ghostScopeKind(scope);
  const ref = ghostScopeRef(scope);
  const tok = ++g.token;
  g.ref = ref;
  g.status = 'loading';
  if (g.choice === 'duel' && !ghostDuelFits(g, kind, ref)) g.choice = 'best';
  renderGhostPick(scope);
  const [mine, top] = await Promise.all([
    bestGhostLocal(kind, ref).catch(() => null),
    isRemoteApi() ? api.ghostTop(kind, ref).catch(() => null) : Promise.resolve(null),
  ]);
  if (tok !== g.token) return;
  const mode = kind === 'lap' ? lapGhostMode(ref) : 'traj';
  const lead = top && top.leader && top.leader.ghost ? top.leader : null;
  g.opts = {
    best: mine ? { rec: { data: mine.data, tMs: mine.tMs, mode: mine.mode || mode, L: mine.L, kind }, tMs: mine.tMs, who: 'твой лучший' } : null,
    leader: lead ? {
      rec: { ghost: lead.ghost, tMs: lead.tMs, mode, kind }, tMs: lead.tMs,
      who: isMyPilotId(lead.pilotId) ? 'лидер — ты' : 'лидер · ' + clipText(lead.name || 'пилот', 16),
    } : null,
    duel: ghostDuelFits(g, kind, ref) ? { rec: g.duel.rec, tMs: g.duel.tMs, who: 'соперник · ' + clipText(g.duel.who || 'пилот', 16) } : null,
  };
  if (g.choice !== 'none' && !g.opts[g.choice]) {
    // remembered choice not available here → fall back quietly, don't overwrite the stored preference
    g.track = null; g.tMs = null; g.who = '';
    g.status = 'ready';
    renderGhostPick(scope);
    return;
  }
  ghostApplyChoice(scope);
}
function ghostApplyChoice(scope) {
  const g = ghostRace[scope];
  const o = g.choice !== 'none' ? g.opts[g.choice] : null;
  g.track = o ? ghostTrack(o.rec) : null;
  g.tMs = o && g.track ? o.tMs : null;
  g.who = o && g.track ? o.who : '';
  g.status = 'ready';
  renderGhostPick(scope);
  ghostDeltaHead(scope);
}
function renderGhostPick(scope) {
  const box = document.getElementById(scope === 'lap' ? 'lapGhostPick' : 'runGhostPick');
  if (!box) return;
  const g = ghostRace[scope];
  const kind = ghostScopeKind(scope);
  box.replaceChildren();
  const head = padEl('div', 'gp-head');
  head.appendChild(padEl('span', 'gp-title', 'Призрак'));
  if (scope === 'run') {
    const seg = padEl('div', 'gp-disc');
    GHOST_DISCS.forEach(([id, lab]) => {
      const b = padEl('button', 'gp-disc-btn' + (g.disc === id ? ' on' : ''), lab);
      b.type = 'button';
      b.dataset.ghostDisc = id;
      b.setAttribute('aria-pressed', g.disc === id ? 'true' : 'false');
      seg.appendChild(b);
    });
    head.appendChild(seg);
  }
  box.appendChild(head);
  const row = padEl('div', 'gp-chips');
  GHOST_CHOICES.forEach(([id, lab]) => {
    if (id === 'duel' && !ghostDuelFits(g, kind, g.ref)) return;
    const o = g.opts[id];
    const loading = g.status === 'loading' && id !== 'none';
    const b = padEl('button', 'gp-chip' + (g.choice === id ? ' on' : '') + (id === 'duel' ? ' duel' : ''));
    b.type = 'button';
    b.dataset.ghostChoice = id;
    b.setAttribute('aria-pressed', g.choice === id ? 'true' : 'false');
    b.appendChild(padEl('b', '', lab));
    const sub = id === 'none' ? 'чистый заезд'
      : loading ? 'загрузка…'
      : o ? fmtGhostT(kind, o.tMs) + (id === 'leader' && /ты$/.test(o.who) ? ' · ты' : '')
      : (id === 'leader' ? 'пока нет' : 'нет записи');
    b.appendChild(padEl('small', '', sub));
    if (scope === 'run') { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', g.choice === id ? 'true' : 'false'); b.prepend(padEl('i', 'gh74-r')); }
    if (id !== 'none' && !o && !loading) b.disabled = true;
    row.appendChild(b);
  });
  box.appendChild(row);
  if (scope === 'run') ghostRowValue74();
}
/** v174: строка «Призрак» на Замере — текущий выбор справа (без обрезки), шторка — полный список */
function ghostRowValue74() {
  const v = document.getElementById('z61GhostV'); if (!v) return;
  const g = ghostRace.run; const kind = ghostScopeKind('run');
  const lab = (GHOST_CHOICES.find(([id]) => id === g.choice) || [, 'Без призрака'])[1];
  const o = g.choice !== 'none' ? g.opts[g.choice] : null;
  const disc = (GHOST_DISCS.find(([id]) => id === g.disc) || [, ''])[1];
  const t = g.choice === 'none' ? 'Без призрака' : (o ? lab + ' · ' + fmtGhostT(kind, o.tMs) : (g.status === 'loading' ? lab + ' · …' : lab + ' · нет записи'));
  const parts = (g.choice === 'none' || !o ? t : t + ' · ' + disc).split(' · ');
  const row = document.getElementById('z61Ghost'); // v257: до старта — только компактный индикатор, если призрак реально выбран (дуэль или есть запись)
  if (row) row.hidden = !(g.choice === 'duel' || (g.choice !== 'none' && o));
  v.replaceChildren(...parts.flatMap((x, i) => { const sp = document.createElement('span'); sp.className = 'nw74'; sp.textContent = x; return i ? [document.createTextNode(' · '), sp] : [sp]; })); // куски не рвутся посередине («0–100»)
}
function ghostPickClick(scope, e) {
  const g = ghostRace[scope];
  const d = e.target?.closest?.('[data-ghost-disc]');
  if (d && scope === 'run') {
    if (run.armed) return;
    g.disc = d.dataset.ghostDisc === '402m' ? '402m' : '0-100';
    ghostSaveChoice();
    hap(8);
    void ghostLoad('run');
    return;
  }
  const c = e.target?.closest?.('[data-ghost-choice]');
  if (!c || c.disabled) return;
  if (scope === 'lap' && lapRun.phase === 'running') return;
  if (scope === 'run' && run.launched) return;
  g.choice = c.dataset.ghostChoice;
  ghostSaveChoice();
  hap(8);
  ghostApplyChoice(scope);
  if (scope === 'run') setTimeout(() => { try { window.__ghost74?.close(); } catch (_) {} }, 240);
}
// v174: шторка выбора призрака на Замере
(() => {
  const sh = document.getElementById('ghost74'); if (!sh) return;
  const close = () => { sh.classList.add('hidden'); sh.setAttribute('aria-hidden', 'true'); };
  const open = () => { try { hap(8); } catch (_) {} try { renderGhostPick('run'); } catch (_) {} sh.classList.remove('hidden'); sh.setAttribute('aria-hidden', 'false'); };
  document.getElementById('z61Ghost')?.addEventListener('click', open);
  sh.addEventListener('click', (e) => { if (e.target?.closest?.('[data-close74]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sh.classList.contains('hidden')) close(); });
  window.__ghost74 = { open, close };
})();
document.getElementById('lapGhostPick')?.addEventListener('click', (e) => ghostPickClick('lap', e));
document.getElementById('runGhostPick')?.addEventListener('click', (e) => ghostPickClick('run', e));

/* —— live delta HUD —— */
const _gdCache = { lap: {}, run: {} };
function ghostDeltaHead(scope) {
  const g = ghostRace[scope];
  const box = document.getElementById(scope + 'GhostDelta');
  if (!box) return;
  const on = !!g.track;
  box.classList.toggle('hidden', !on);
  const who = document.getElementById(scope + 'GhostWho');
  if (who) who.textContent = on ? g.who + ' · ' + fmtGhostT(ghostScopeKind(scope), g.tMs) : '';
  if (on) ghostDeltaUi(scope, null);
}
function ghostDeltaUi(scope, sec) {
  const c = _gdCache[scope];
  const txt = fmtDelta(sec);
  if (c.txt !== txt) {
    c.txt = txt;
    const n = document.getElementById(scope + 'GhostNum');
    if (n) n.textContent = txt;
  }
  const st = sec == null || !Number.isFinite(sec) ? '' : sec > 0.005 ? 'slow' : sec < -0.005 ? 'fast' : 'even';
  if (c.st !== st) {
    c.st = st;
    const box = document.getElementById(scope + 'GhostDelta');
    if (box) box.dataset.state = st;
  }
  const k = sec == null || !Number.isFinite(sec) ? 0 : Math.min(1, Math.abs(sec) / 2);
  const kq = Math.round(k * 50) / 50;
  if (c.k !== kq) {
    c.k = kq;
    const bar = document.getElementById(scope + 'GhostBar');
    if (bar) bar.style.transform = 'scaleX(' + kq + ')';
  }
}

/* —— lap recording —— */
function ghostLapStart(pt, now) {
  const trackId = lapRun.trackId;
  const ref = ghostLineRef(trackId);
  ghostRace.lapRec = createRecorder(95);
  ghostRace.lapProg = ref ? createLineProgress(ref) : null;
  const d0 = ghostRace.lapProg ? ghostRace.lapProg.update(pt.lat, pt.lon) : 0;
  ghostRace.lapLive = { t0: now, d: d0, v: pt.v || 0, wall: Date.now(), last: { lat: pt.lat, lon: pt.lon }, trackId, mode: ref ? 'line' : 'traj', L: ref ? ref.L : trackLenM(trackId) };
  ghostRace.lapRec.push({ t: 0, d: d0, v: pt.v || 0, lat: pt.lat, lon: pt.lon });
  document.getElementById('lapDrive')?.classList.add('ghost-racing');
  if (ghostRace.lap.track) ghostDeltaHead('lap');
}
function ghostLapPoint(pt, now) {
  const live = ghostRace.lapLive;
  if (!live || !ghostRace.lapRec) return;
  let d;
  if (ghostRace.lapProg) d = ghostRace.lapProg.update(pt.lat, pt.lon);
  else {
    const step = haversineM(live.last, pt);
    d = live.d + (step < 120 ? step : 0);
  }
  live.d = d; live.v = pt.v || 0; live.wall = Date.now(); live.last = { lat: pt.lat, lon: pt.lon };
  const t = now - live.t0;
  ghostRace.lapRec.push({ t, d, v: live.v, lat: pt.lat, lon: pt.lon });
  const tr = ghostRace.lap.track;
  if (tr) ghostDeltaUi('lap', deltaAt(tr, 'd', d, t));
}
/** 100 ms clock tick: extrapolate own progress between GPS fixes + move the ghost dot. */
function ghostLapTick() {
  const tr = ghostRace.lap.track;
  const live = ghostRace.lapLive;
  if (!tr || !live || lapRun.phase !== 'running') return;
  const wall = Date.now();
  const elapsed = wall - live.t0;
  const dtx = Math.min(1.5, Math.max(0, (wall - live.wall) / 1000));
  const x = live.d + (live.v / 3.6) * dtx;
  ghostDeltaUi('lap', deltaAt(tr, 'd', x, elapsed));
  if (lapDrive.open && !isLapSatMapActive() && elapsed <= tr.tMs + 4000) {
    // v141: призрак на SVG-карте — прогресс по времени призрака (оценка)
    try { const d = TRACK_SVG[lapRun.trackId] || TRACK_SVG.sochi; LB.setGhostDot(document.getElementById('lapTrackSvg'), pointOnTrack(d, Math.min(0.999, elapsed / Math.max(1, tr.tMs)))); } catch (_) {}
  }
  if (lapDrive.open && isLapSatMapActive() && elapsed <= tr.tMs + 4000) {
    const p = tr.posAt(Math.min(elapsed, tr.t[tr.n - 1]));
    updateLapSatMapGhost(p);
  }
}
function ghostLapFinish(pt, now) {
  const live = ghostRace.lapLive;
  const recd = ghostRace.lapRec;
  if (!live || !recd) return null;
  const t = now - live.t0;
  recd.finish({ t, d: live.d, v: pt.v || live.v, lat: pt.lat, lon: pt.lon });
  const g = ghostRace.lap;
  const snap = {
    points: recd.points(), tMs: t, mode: live.mode, L: live.L, trackId: live.trackId,
    ghost: g.track ? { track: g.track, tMs: g.tMs, who: g.who, choice: g.choice, duel: g.choice === 'duel' ? g.duel : null } : null,
  };
  if (snap.ghost) ghostRace.holdShare = true;
  ghostRace.lapRec = null;
  ghostRace.lapLive = null;
  return snap;
}
function ghostLapStop() {
  ghostRace.lapRec = null;
  ghostRace.lapLive = null;
  try { updateLapSatMapGhost(null); } catch (_) {}
  document.getElementById('lapDrive')?.classList.remove('ghost-racing');
  ghostDeltaUi('lap', null);
}

/* —— straight run (0–100 / ¼ mile) recording —— */
function ghostRunArm() {
  ghostRace.runRec = null;
  ghostRace.runLive = null;
  ghostRace.runDone = {};
  ghostDeltaHead('run');
}
function ghostRunStill(now, lat, lon) {
  if (lat == null || lon == null) return;
  ghostRace.runLive = { still: { t: now, lat, lon } };
}
function ghostRunLaunch(now, v, lat, lon) {
  const st = ghostRace.runLive?.still || { lat, lon };
  ghostRace.runRec = createRecorder(95);
  ghostRace.runRec.push({ t: 0, d: 0, v: 0, lat: st.lat ?? lat, lon: st.lon ?? lon });
  ghostRace.runLive = { launched: true };
  if (lat != null && lon != null && run.t0) ghostRace.runRec.push({ t: Math.max(1, now - run.t0), d: 0, v, lat, lon });
}
function ghostRunPoint(now, v) {
  const recd = ghostRace.runRec;
  if (!recd || !run.t0 || !run.lastPos) return;
  const t = now - run.t0;
  recd.push({ t, d: run.dist || 0, v, lat: run.lastPos.lat, lon: run.lastPos.lon });
  const g = ghostRace.run;
  if (g.track && !ghostRace.runDone[g.disc]) {
    const axis = g.disc === '0-100' ? 'v' : 'd';
    ghostDeltaUi('run', deltaAt(g.track, axis, axis === 'v' ? v : (run.dist || 0), t));
  }
}
/** A discipline mark was crossed at tMs after launch → cut the trace there and finish that ghost. */
function ghostRunMark(disc, tMs) {
  const recd = ghostRace.runRec;
  if (!recd || ghostRace.runDone[disc] || !(tMs > 0)) return;
  ghostRace.runDone[disc] = true;
  const all = recd.points();
  const pts = all.filter((p) => p.t < tMs - 1);
  if (pts.length < 2) return;
  const last = all[all.length - 1];
  const prevP = pts[pts.length - 1];
  const dEnd = disc === '402m' ? 402.336 : Math.max(prevP.d, last.d * Math.min(1, tMs / Math.max(1, last.t)));
  pts.push({ t: tMs, d: Math.max(prevP.d, dEnd), v: disc === '0-100' ? Math.max(100, prevP.v) : Math.max(prevP.v, last.v), lat: last.lat, lon: last.lon });
  const g = ghostRace.run;
  const raced = g.disc === disc && g.track;
  const snap = {
    points: pts, tMs, mode: 'traj', L: disc === '402m' ? 402.336 : null, disc,
    ghost: raced ? { track: g.track, tMs: g.tMs, who: g.who, choice: g.choice, duel: g.choice === 'duel' ? g.duel : null } : null,
  };
  if (raced) {
    ghostRace.holdShare = true;
    ghostDeltaUi('run', (tMs - g.tMs) / 1000);
  }
  const gq = gpsQualityFromStraightRun();
  const flags = (run.flags || []).slice(0, 8);
  const topOk = runRowValid(gq, flags) && canPublishTop(gq, flags);
  void ghostAfterFinish({ kind: 'drag', ref: disc, snap, tMs, gq, flags, topOk, why: topOk ? '' : 'GPS слабее B — без топа' });
}

/* —— after a finish: store, upload best, auto-submit duel, show the result —— */
async function ghostAfterFinish(o) {
  let shown = false;
  try { shown = await ghostAfterFinishInner(o); } catch (e) { console.warn('[ghost] finish', e); }
  if (!shown && o.snap?.ghost) {
    ghostRace.holdShare = false;
    const p = ghostRace.pendingShare;
    ghostRace.pendingShare = null;
    if (p) openShareCard(p);
  }
}
async function ghostAfterFinishInner(o) {
  const { kind, ref, snap, tMs, gq, flags, topOk } = o;
  let data = null;
  try { data = encodeGhost(snap.points, { hz: 10 }); } catch (_) {}
  const car = currentCar();
  if (data) {
    const prevBest = await bestGhostLocal(kind, ref, { abOnly: true }).catch(() => null);
    const localId = await saveGhostLocal({
      kind, ref, tMs, valid: !!topOk, gpsQ: gq?.gpsQ || null, car: car?.name || '', carId: state.carId || null,
      mode: snap.mode, L: snap.L, data, at: Date.now(),
    }).catch(() => null);
    const isPb = topOk && (!prevBest || tMs < prevBest.tMs);
    if (topOk && ghostCanUpload() && (isPb || !prevBest?.serverId)) {
      await Promise.race([_topSubmitP, new Promise((r) => setTimeout(r, 20000))]);
      const res = await api.postGhost({
        kind, ref, tMs, gpsQ: gq.gpsQ, avgAcc: gq.avgAcc, hz: gq.hz, flags, valid: true,
        car: car?.name || '', carId: state.carId || undefined, ghost: data,
      }).catch(() => null);
      if (res && res.ok && res.id && localId != null) void markGhostUploaded(localId, res.id);
    }
    const scope = kind === 'lap' ? 'lap' : 'run';
    if (isPb && ghostScopeRef(scope) === ref) {
      ghostRace[scope].opts.best = { rec: { data, tMs, mode: snap.mode, L: snap.L, kind }, tMs, who: 'твой лучший' };
      if (ghostRace[scope].choice === 'best' && !(scope === 'lap' && snap.ghost)) ghostApplyChoice(scope);
      else renderGhostPick(scope);
    }
  }
  if (!snap.ghost) return false;
  const gh = snap.ghost;
  const axis = kind === 'drag' && ref === '0-100' ? 'v' : 'd';
  const series = deltaSeries(snap.points, gh.track, axis);
  const finalDelta = (tMs - gh.tMs) / 1000;
  const total = axis === 'v' ? 100 : (snap.points[snap.points.length - 1]?.d || 0);
  const sectors = kind === 'lap' ? sectorGains(series, total, finalDelta) : [];
  let duelLine = '';
  if (gh.duel && !gh.duel.submitted) {
    if (!topOk) duelLine = 'В дуэль не засчитано: нужен валидный заезд GPS A/B.';
    else if (simOnProd()) duelLine = 'Симулятор — в дуэль не засчитывается.';
    else {
      gh.duel.submitted = true;
      const body = {
        type: kind === 'lap' ? 'lap' : 'drag',
        trackId: kind === 'lap' ? ref : undefined,
        t: kind === 'lap' ? fmtLapTime(tMs) : Math.round(tMs) / 1000,
        car: car?.name || '', carId: state.carId || undefined, gps: true, valid: true,
        gpsQ: gq.gpsQ, avgAcc: gq.avgAcc, hz: gq.hz, flags, name: duelPilotNick(),
        weather: kind === 'lap' ? (lapDrive.weather || undefined) : undefined,
        trace: _lastRunTrace && _lastRunTrace.type === (kind === 'lap' ? 'lap' : 'drag') ? _lastRunTrace.trace : undefined,
        how: kind === 'lap' ? 'gate' : undefined,
      };
      const res = await api.submitDuelRun(gh.duel.id, body).catch(() => null);
      if (!res || res.error || res.ok === false) {
        gh.duel.submitted = false;
        duelLine = 'Дуэль: не принято — ' + (res?.code ? rejectText(res) : String(res?.error || 'нет связи').slice(0, 80));
      } else {
        const d = res.duel || res;
        const meCh = d.challenger?.id && isMyPilotId(d.challenger.id);
        if (d.status === 'ready' && d.winner) {
          const won = (d.winner === 'challenger' && meCh) || (d.winner === 'creator' && !meCh);
          duelLine = d.winner === 'tie' ? 'Дуэль: ничья — засчитано обоим.' : (won ? 'Дуэль: победа — засчитано, сопернику видно.' : 'Дуэль: поражение — засчитано, сопернику видно.');
        } else duelLine = 'Дуэль: заезд засчитан, итог увидят оба.';
        try { if (_activeDuel?.id === gh.duel.id) _activeDuel = d; } catch (_) {}
      }
    }
  }
  showGhostResult({ kind, ref, tMs, gh, series, sectors, finalDelta, axis, total, duelLine, gq, topOk, why: o.why });
  return true;
}

function ghostVerdict(sec) {
  if (!Number.isFinite(sec)) return '—';
  if (Math.abs(sec) < 0.005) return 'Ровно в призрак';
  return sec < 0 ? 'Побил на ' + Math.abs(sec).toFixed(2) + ' с' : 'Уступил ' + sec.toFixed(2) + ' с';
}
function ghostChartSvg(series, total, axis, { w = 320, h = 128, mini = false } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'gr-svg');
  svg.setAttribute('preserveAspectRatio', 'none');
  const el = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  if (!series.length || !(total > 0)) return svg;
  const padT = mini ? 4 : 10; const padB = mini ? 4 : 16;
  const maxAbs = Math.max(0.2, ...series.map((s) => Math.abs(s.dt)));
  const y0 = padT + (h - padT - padB) / 2;
  const ky = (h - padT - padB) / 2 / maxAbs;
  const X = (x) => Math.max(0, Math.min(w, (x / total) * w));
  const Y = (dt) => y0 - dt * ky; // slower (plus) draws up
  const uid = 'g' + Math.random().toString(36).slice(2, 8);
  const defs = el('defs', {});
  const cA = el('clipPath', { id: uid + 'a' }); cA.appendChild(el('rect', { x: 0, y: 0, width: w, height: y0 }));
  const cB = el('clipPath', { id: uid + 'b' }); cB.appendChild(el('rect', { x: 0, y: y0, width: w, height: h - y0 }));
  defs.append(cA, cB);
  svg.appendChild(defs);
  if (!mini) {
    [1, 2].forEach((i) => {
      const x = (w * i) / 3;
      svg.appendChild(el('line', { x1: x, x2: x, y1: padT, y2: h - padB, class: 'gr-sec-line' }));
    });
  }
  svg.appendChild(el('line', { x1: 0, x2: w, y1: y0, y2: y0, class: 'gr-zero' }));
  let line = '';
  series.forEach((s, i) => { line += (i ? 'L' : 'M') + X(s.x).toFixed(1) + ' ' + Y(s.dt).toFixed(1) + ' '; });
  const area = line + `L${X(series[series.length - 1].x).toFixed(1)} ${y0} L${X(series[0].x).toFixed(1)} ${y0} Z`;
  svg.appendChild(el('path', { d: area, class: 'gr-area slow', 'clip-path': `url(#${uid}a)` }));
  svg.appendChild(el('path', { d: area, class: 'gr-area fast', 'clip-path': `url(#${uid}b)` }));
  svg.appendChild(el('path', { d: line, class: 'gr-line' }));
  if (!mini) {
    const t1 = el('text', { x: 4, y: padT + 8, class: 'gr-ax' }); t1.textContent = '+' + maxAbs.toFixed(1) + ' с · медленнее';
    const t2 = el('text', { x: 4, y: h - padB - 3, class: 'gr-ax' }); t2.textContent = '−' + maxAbs.toFixed(1) + ' с · быстрее';
    const t3 = el('text', { x: w - 4, y: h - 3, class: 'gr-ax end' }); t3.textContent = axis === 'v' ? Math.round(total) + ' км/ч' : Math.round(total) + ' м';
    svg.append(t1, t2, t3);
  }
  return svg;
}
function showGhostResult(r) {
  ghostRace.result = r;
  const box = document.getElementById('ghostResult');
  if (!box) return;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const where = r.kind === 'lap' ? (TRACKS.find((t) => t.id === r.ref)?.name || r.ref) : (r.ref === '402m' ? '¼ мили' : '0–100 км/ч');
  set('grKicker', 'ПРИЗРАК · ' + where.toUpperCase());
  set('grVerdict', ghostVerdict(r.finalDelta));
  box.dataset.state = r.finalDelta < -0.005 ? 'fast' : r.finalDelta > 0.005 ? 'slow' : 'even';
  set('grSub', 'против: ' + r.gh.who + (r.topOk ? '' : ' · ' + (r.why || 'без топа')));
  set('grMine', fmtGhostT(r.kind, r.tMs));
  set('grGhost', fmtGhostT(r.kind, r.gh.tMs));
  set('grGhostLab', r.gh.choice === 'best' ? 'твой лучший' : r.gh.choice === 'leader' ? 'лидер' : r.gh.choice === 'duel' ? 'соперник' : 'призрак');
  const chart = document.getElementById('grChart');
  if (chart) {
    chart.replaceChildren(ghostChartSvg(r.series, r.total, r.axis));
    chart.appendChild(padEl('span', 'gr-chart-cap', r.axis === 'v' ? 'дельта по скорости' : 'дельта по дистанции'));
  }
  const ul = document.getElementById('grSectors');
  if (ul) {
    ul.replaceChildren();
    if (r.sectors.length) {
      r.sectors.forEach((s) => {
        const won = s.gain < -0.005; const lost = s.gain > 0.005;
        const li = padEl('li', won ? 'won' : lost ? 'lost' : '');
        li.appendChild(padEl('b', '', 'S' + (s.i + 1)));
        li.appendChild(padEl('strong', '', fmtDelta(s.gain)));
        li.appendChild(padEl('span', '', won ? 'выиграл' : lost ? 'проиграл' : 'вровень'));
        ul.appendChild(li);
      });
      ul.hidden = false;
    } else {
      // straight run: split the chart in two halves
      const mid = r.series.length ? r.series[Math.floor(r.series.length / 2)] : null;
      if (mid) {
        const a = mid.dt; const b = r.finalDelta - mid.dt;
        [[r.axis === 'v' ? 'старт' : '1-я половина', a], [r.axis === 'v' ? 'до 100' : '2-я половина', b]].forEach(([lab, g]) => {
          const li = padEl('li', g < -0.005 ? 'won' : g > 0.005 ? 'lost' : '');
          li.appendChild(padEl('b', '', lab));
          li.appendChild(padEl('strong', '', fmtDelta(g)));
          li.appendChild(padEl('span', '', g < -0.005 ? 'выиграл' : g > 0.005 ? 'проиграл' : 'вровень'));
          ul.appendChild(li);
        });
      }
      ul.hidden = !mid;
    }
  }
  const du = document.getElementById('grDuel');
  if (du) { du.hidden = !r.duelLine; du.textContent = r.duelLine || ''; }
  box.classList.remove('hidden');
  box.setAttribute('aria-hidden', 'false');
  hap(r.finalDelta < 0 ? [30, 30, 60] : [14, 40, 14]);
}
function closeGhostResult() {
  const box = document.getElementById('ghostResult');
  box?.classList.add('hidden');
  box?.setAttribute('aria-hidden', 'true');
  ghostRace.holdShare = false;
  ghostRace.pendingShare = null;
}
function ghostSharePayload(r) {
  const base = ghostRace.pendingShare;
  let p;
  if (base) p = { ...base };
  else {
    const gq = r.gq || {};
    p = buildSharePayload({
      type: r.kind === 'lap' ? 'lap' : (r.ref === '402m' ? '402m' : '0-100'),
      time: r.kind === 'lap' ? fmtLapTime(r.tMs) : (r.tMs / 1000).toFixed(2) + ' с',
      trackName: r.kind === 'lap' ? (TRACKS.find((t) => t.id === r.ref)?.name || r.ref) : '',
      valid: !!r.topOk, gpsQ: gq.gpsQ, avgAcc: gq.avgAcc, hz: gq.hz,
      trackId: r.kind === 'lap' ? r.ref : undefined, ms: r.kind === 'lap' ? r.tMs : undefined,
    });
  }
  p.ghost = ghostVerdict(r.finalDelta);
  p.ghostVs = String(r.gh.who || '').slice(0, 40);
  return p;
}
document.getElementById('ghostResultClose')?.addEventListener('click', closeGhostResult);
document.getElementById('grAgain')?.addEventListener('click', closeGhostResult);
document.getElementById('ghostResult')?.addEventListener('click', (e) => { if (e.target?.id === 'ghostResult') closeGhostResult(); });
document.getElementById('grShare')?.addEventListener('click', () => {
  const r = ghostRace.result;
  if (!r) return;
  const p = ghostSharePayload(r);
  ghostRace.shareSeries = { payload: p, series: r.series, total: r.total, axis: r.axis };
  closeGhostResult();
  document.getElementById('shareCard')?.classList.add('over-hud');
  openShareCard(p);
});
function renderShareGhost(payload) {
  const box = document.getElementById('shareGhost');
  if (!box) return;
  const line = typeof payload?.ghost === 'string' ? payload.ghost : '';
  box.hidden = !line;
  if (!line) return;
  const won = /^Побил/.test(line);
  box.dataset.state = won ? 'fast' : /^Уступил/.test(line) ? 'slow' : 'even';
  document.getElementById('shareGhostK').textContent = 'ПРИЗРАК';
  document.getElementById('shareGhostV').textContent = line;
  document.getElementById('shareGhostS').textContent = payload.ghostVs ? 'vs ' + payload.ghostVs : '';
  const ch = document.getElementById('shareGhostChart');
  if (ch) {
    const s = ghostRace.shareSeries;
    if (s && s.payload === payload && s.series.length) { ch.replaceChildren(ghostChartSvg(s.series, s.total, s.axis, { w: 300, h: 44, mini: true })); ch.hidden = false; }
    else { ch.replaceChildren(); ch.hidden = true; }
  }
}

/* —— simulator drives the circuit outline while the lap HUD is open —— */
function ghostSimRoute(trackId, hold) {
  try {
    if (!extGps || extGps.state() !== 'sim' || typeof extGps.setRoute !== 'function') return;
    const o = TRACK_OUTLINES[trackId];
    const geo = TRACK_GEO[trackId];
    if (!o || !Array.isArray(o.coords) || o.coords.length < 4 || !geo) { extGps.setRoute(null); return; }
    if (extGps.routeActive() && ghostRace.simTrack === trackId) { if (!hold) extGps.releaseRoute(); return; }
    ghostRace.simTrack = trackId;
    extGps.setRoute({ pts: o.coords.map(([lon, lat]) => ({ lat, lon })), sf: { lat: geo.lat, lon: geo.lon } }, { hold: !!hold });
  } catch (e) { console.warn('[ghost] sim route', e); }
}
function ghostSimRouteOff() {
  ghostRace.simTrack = null;
  try { if (extGps?.routeActive?.()) extGps.setRoute(null); } catch (_) {}
}

/* —— duel: ride against the creator's ghost —— */
async function rideDuelGhost(d) {
  if (DUELS_OFF) return; // v197: дуэли убраны
  const hint = document.getElementById('duelGhostHint');
  if (!d?.ghostId) return;
  const btn = document.getElementById('duelRideGhost');
  if (btn) btn.disabled = true;
  const g = await api.getGhost(d.ghostId).catch(() => null);
  if (btn) btn.disabled = false;
  if (!g || !g.ghost) { if (hint) hint.textContent = 'Призрак не загрузился — проверь сеть.'; return; }
  const kind = d.type === 'lap' ? 'lap' : 'drag';
  const ref = kind === 'lap' ? (d.trackId || g.ref) : (d.disc || g.ref || '0-100');
  const scope = kind === 'lap' ? 'lap' : 'run';
  ghostRace[scope].duel = {
    id: d.id, kind, ref, tMs: g.tMs, who: d.createdBy?.name || g.name || 'соперник',
    rec: { ghost: g.ghost, tMs: g.tMs, kind, mode: kind === 'lap' ? lapGhostMode(ref) : 'traj' }, submitted: false,
  };
  ghostRace[scope].choice = 'duel';
  closeDuelSheet();
  if (kind === 'lap') {
    const sel = document.getElementById('trackSelect');
    if (sel && sel.value !== ref) { sel.value = ref; sel.dispatchEvent(new Event('change')); }
    goToView('lap', { sfx: false });
    lapRun.trackId = ref;
    openLapDrivePreview();
  } else {
    ghostRace.run.disc = ref === '402m' ? '402m' : '0-100';
    goToView('run', { sfx: false });
    void ghostLoad('run');
    try { window.__ghost74?.open(); } catch (_) {} // v174: выбор призрака — в шторке
  }
}
document.getElementById('duelRideGhost')?.addEventListener('click', () => { if (_activeDuel) void rideDuelGhost(_activeDuel); });

function fmtLeft(ms) {
  if (!(ms > 0)) return 'срок вышел';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return Math.floor(h / 24) + ' д ' + (h % 24) + ' ч';
  if (h >= 1) return h + ' ч ' + Math.floor((ms % 3600000) / 60000) + ' мин';
  return Math.max(1, Math.floor(ms / 60000)) + ' мин';
}
function renderDuelGhostBox(d, { iAmCreator, myRun } = {}) {
  const box = document.getElementById('duelGhostBox');
  const strip = document.getElementById('duelBanners');
  if (strip) {
    paintBannerImg(document.getElementById('duelBannerL'), d.createdBy?.banner, d.createdBy?.id, 600);
    paintBannerImg(document.getElementById('duelBannerR'), d.challenger?.banner, d.challenger?.id, 600);
    strip.classList.toggle('has-any', !!(d.createdBy?.banner || d.challenger?.banner));
  }
  if (!box) return;
  if (!d.ghostId) { box.hidden = true; return; }
  box.hidden = false;
  const target = d.creatorRun ? duelTimeText(d, d.creatorRun) : '—';
  document.getElementById('duelGhostTarget').textContent = target + (d.type === 'drag' ? (d.disc === '402m' ? ' · ¼ мили' : ' · 0–100') : '');
  const left = Number(d.expiresAt) - Date.now();
  document.getElementById('duelGhostLeft').textContent = d.status === 'open' ? fmtLeft(left) : (d.status === 'ready' ? 'итог есть' : 'срок вышел');
  const btn = document.getElementById('duelRideGhost');
  const hint = document.getElementById('duelGhostHint');
  const canRide = d.status === 'open' && !iAmCreator && !myRun;
  if (btn) { btn.hidden = !canRide; btn.disabled = false; }
  if (hint) {
    hint.textContent = iAmCreator
      ? (d.status === 'open' ? 'Твой призрак ждёт соперника. Срок ' + (d.days || 7) + ' дн.' : 'Дуэль закрыта.')
      : (canRide ? 'Призрак едет рядом в HUD. Валидный заезд A/B засчитается сам.' : (myRun ? 'Твой заезд уже засчитан.' : 'Дуэль закрыта.'));
  }
}

/* —— duel create: days + attach my ghost —— */
let _duelDays = 7;
let _duelGhostCand = null;
document.querySelectorAll('[data-duel-days]').forEach((b) => b.addEventListener('click', () => {
  _duelDays = Number(b.getAttribute('data-duel-days')) || 7;
  document.querySelectorAll('[data-duel-days]').forEach((x) => x.classList.toggle('on', x === b));
  hap(8);
}));
function refreshDuelTrackMap() {
  const wrap = document.getElementById('duelTrackWrap');
  const map = document.getElementById('duelTrackMap');
  const sel = document.getElementById('duelTrackSelect');
  if (!map || !sel) return;
  const lap = !wrap?.hidden;
  if (!lap) {
    map.classList.add('hidden');
    map.setAttribute('aria-hidden', 'true');
    map.replaceChildren();
    return;
  }
  map.classList.remove('hidden');
  map.setAttribute('aria-hidden', 'false');
  try { drawTrack(sel.value || TRACKS[0].id, 'duelTrackMap', { compact: true }); } catch (_) {}
}

async function refreshDuelGhostOpt() {
  const info = document.getElementById('duelGhostInfo');
  const cb = document.getElementById('duelGhostOn');
  const wrap = document.getElementById('duelGhostOpt');
  if (!info || !cb) return;
  _duelGhostCand = null;
  const kind = _duelType === 'lap' ? 'lap' : 'drag';
  const refs = kind === 'lap' ? [document.getElementById('duelTrackSelect')?.value || TRACKS[0]?.id] : ['0-100', '402m'];
  let best = null;
  for (const ref of refs) {
    best = await bestGhostLocal(kind, ref, { abOnly: true }).catch(() => null);
    if (best) break;
  }
  const loggedIn = ghostCanUpload();
  if (!best) {
    cb.checked = false; cb.disabled = true;
    info.textContent = kind === 'lap' ? 'нет валидного круга A/B на этом треке — проедь и вернись' : 'нет валидного 0–100 / ¼ мили A/B';
  } else if (!loggedIn) {
    cb.checked = false; cb.disabled = true;
    info.textContent = 'войди в аккаунт, чтобы прикрепить призрак ' + fmtGhostT(kind, best.tMs);
  } else {
    cb.disabled = false;
    _duelGhostCand = best;
    info.textContent = (kind === 'drag' ? (best.ref === '402m' ? '¼ мили · ' : '0–100 · ') : '') + fmtGhostT(kind, best.tMs) + ' · GPS ' + (best.gpsQ || 'A');
  }
  wrap?.classList.toggle('off', cb.disabled);
}
document.getElementById('duelTrackSelect')?.addEventListener('change', () => { void refreshDuelGhostOpt(); try { refreshDuelTrackMap(); } catch (_) {} });
/** → server ghost id for the duel (uploads the local best if it never went up). */
async function ensureDuelGhostId() {
  const c = _duelGhostCand;
  if (!c) return { id: null };
  if (c.serverId) return { id: c.serverId };
  const res = await api.postGhost({
    kind: c.kind, ref: c.ref, tMs: c.tMs, gpsQ: c.gpsQ, valid: true, car: c.car || '', carId: c.carId || undefined, ghost: c.data,
  }).catch(() => null);
  if (res && res.ok && res.id) { void markGhostUploaded(c.id, res.id); return { id: res.id }; }
  return { id: null, error: res?.error || 'нет связи' };
}

/* ———————— v89: profile banners ———————— */
const PROFILE_BANNERS = [
  ['neon-sochi', 'Сочи · неон'], ['neon-moscow', 'Moscow · неон'], ['neon-nring', 'NRING · неон'],
  ['telemetry', 'Телеметрия'], ['carbon', 'Карбон'], ['asphalt', 'Асфальт'],
  ['stripes', 'Полосы'], ['sunset', 'Закат'], ['ice', 'Лёд'],
  ['photo-tracks', 'Трасса'], ['photo-paddock', 'Чат'],
];
const BANNER_IDS = new Set(PROFILE_BANNERS.map((b) => b[0]));
const MY_BANNER_LS = 'pitlane-banner-v1';
function normBanner(b) {
  if (!b) return null;
  if (typeof b === 'string') return b.startsWith('custom:') ? { custom: true, v: b.slice(7) } : (BANNER_IDS.has(b) ? { id: b } : null);
  if (b.id && BANNER_IDS.has(b.id)) return { id: b.id };
  if (b.custom && b.v) return { custom: true, v: String(b.v).slice(0, 40) };
  return null;
}
function bannerSrc(b, pid, size = 1200) {
  const n = normBanner(b);
  if (!n) return '';
  if (n.id) return './img/profile-banners/' + n.id + '-' + (size <= 600 ? 600 : 1200) + '.webp';
  if (n.custom && isPublicPilot(pid)) return api.bannerUrl(pid, n.v);
  return '';
}
/** el = banner host; one <img> child (no CSS url() with remote data). */
function paintBannerImg(el, b, pid, size = 1200) {
  if (!el) return;
  const src = bannerSrc(b, pid, size);
  let img = el.querySelector('img.pb-img');
  if (!src) { img?.remove(); el.classList.remove('has-banner'); return; }
  if (!img) {
    img = document.createElement('img');
    img.className = 'pb-img';
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { img.remove(); el.classList.remove('has-banner'); });
    el.prepend(img);
  }
  if (img.getAttribute('src') !== src) img.src = src;
  el.classList.add('has-banner');
}
function myBanner() {
  try { return normBanner(JSON.parse(localStorage.getItem(MY_BANNER_LS) || 'null')); } catch (_) { return null; }
}
function setMyBannerLocal(b) {
  const n = normBanner(b);
  try { if (n) localStorage.setItem(MY_BANNER_LS, JSON.stringify(n)); else localStorage.removeItem(MY_BANNER_LS); } catch (_) {}
  renderAccBanner();
  renderBannerSheet();
}
function renderAccBanner() {
  paintBannerImg(document.getElementById('accBanner'), myBanner(), accountPilotId(), 1200);
}
async function syncMyBanner() {
  if (!ghostCanUploadBanner()) return;
  const me = await api.me().catch(() => null);
  if (me && me.ok !== false && 'banner' in me) setMyBannerLocal(me.banner);
}
function ghostCanUploadBanner() {
  const tok = getSessionToken();
  return !!(currentUser() && tok && !String(tok).startsWith('local-') && isRemoteApi());
}
function bannerMsg(t) { const e = document.getElementById('bannerMsg'); if (e) e.textContent = t || ''; }
function renderBannerSheet() {
  const grid = document.getElementById('bannerGrid');
  if (!grid) return;
  const cur = myBanner();
  const curKey = cur ? (cur.id || 'custom') : 'none';
  grid.replaceChildren();
  const opts = [['none', 'Без баннера']].concat(PROFILE_BANNERS);
  if (cur?.custom) opts.splice(1, 0, ['custom', 'Своё фото']);
  opts.forEach(([id, lab]) => {
    const b = padEl('button', 'banner-opt' + (curKey === id ? ' on' : '') + (id === 'none' ? ' none' : ''));
    b.type = 'button';
    b.dataset.bannerId = id;
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', curKey === id ? 'true' : 'false');
    b.setAttribute('aria-label', lab);
    const th = padEl('span', 'banner-thumb');
    if (id !== 'none') paintBannerImg(th, id === 'custom' ? cur : { id }, accountPilotId(), 600);
    b.appendChild(th);
    b.appendChild(padEl('span', 'banner-lab', lab));
    grid.appendChild(b);
  });
  const prev = document.getElementById('bannerPreview');
  paintBannerImg(prev, cur, accountPilotId(), 1200);
  const ava = document.getElementById('bannerPreviewAva');
  if (ava) {
    const p = profile();
    ava.replaceChildren(padAvatar(p.nick || currentUser()?.nick || 'Пилот', p.avatar, 56));
  }
  const own = document.getElementById('bannerOwn');
  const can = ghostCanUploadBanner();
  own?.classList.toggle('off', !can);
  const hint = document.getElementById('bannerOwnHint');
  if (hint) hint.textContent = can ? 'обрежем до 3:1 · до 150 КБ' : 'войди в аккаунт, чтобы загрузить своё фото';
}
function openBannerSheet() {
  bannerMsg('');
  renderBannerSheet();
  padShow('bannerSheet', true);
}
async function pickBanner(id) {
  const next = id === 'none' ? null : (id === 'custom' ? myBanner() : { id });
  if (id === 'custom') return;
  if (ghostCanUploadBanner()) {
    bannerMsg('сохраняю…');
    const res = await api.setBanner({ id: next ? next.id : null });
    if (!res || res.ok === false || res.error) { bannerMsg('Не сохранилось: ' + String(res?.error || 'нет связи').slice(0, 80)); return; }
    setMyBannerLocal(res.banner ?? next);
    bannerMsg('Готово — баннер виден в профиле');
  } else {
    setMyBannerLocal(next);
    bannerMsg('Сохранено на устройстве. Войди — и баннер увидят все.');
  }
  hap(10);
}
document.getElementById('bannerGrid')?.addEventListener('click', (e) => {
  const b = e.target?.closest?.('[data-banner-id]');
  if (b) void pickBanner(b.dataset.bannerId);
});
document.getElementById('accBannerEdit')?.addEventListener('click', openBannerSheet);
document.getElementById('accBanner')?.addEventListener('click', (e) => { if (e.target?.id === 'accBanner' || e.target?.classList?.contains('pb-img')) openBannerSheet(); });
document.getElementById('bannerClose')?.addEventListener('click', () => padShow('bannerSheet', false));
document.getElementById('bannerSheet')?.addEventListener('click', (e) => { if (e.target?.id === 'bannerSheet') padShow('bannerSheet', false); });
document.getElementById('bannerOwn')?.addEventListener('click', (e) => {
  if (!ghostCanUploadBanner()) { e.preventDefault(); bannerMsg('Своё фото — только после входа в аккаунт.'); }
});
/** File → centre crop 3:1 → webp (jpeg fallback) ≤ 150 KB → data URL. */
async function bannerFromFile(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) throw new Error('нужен JPEG, PNG или WebP');
  if (file.size > 20 * 1024 * 1024) throw new Error('файл больше 20 МБ');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('не открылось')); im.src = url; });
    const sw = img.naturalWidth; const sh = img.naturalHeight;
    if (sw < 300 || sh < 100) throw new Error('слишком маленькое фото');
    let cw = sw; let ch = Math.round(sw / 3);
    if (ch > sh) { ch = sh; cw = sh * 3; }
    const sx = Math.round((sw - cw) / 2); const sy = Math.round((sh - ch) / 2);
    const LIMIT = 150 * 1024;
    for (const W of [1200, 900, 600]) {
      const w = Math.min(W, cw); const h = Math.round(w / 3);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, cw, ch, 0, 0, w, h);
      for (const q of [0.86, 0.78, 0.7, 0.6, 0.5]) {
        let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', q));
        if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', q));
        if (blob && blob.size <= LIMIT) {
          return await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(blob); });
        }
      }
    }
    throw new Error('не удалось сжать до 150 КБ');
  } finally { URL.revokeObjectURL(url); }
}
document.getElementById('bannerFile')?.addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  if (!ghostCanUploadBanner()) { bannerMsg('Своё фото — только после входа в аккаунт.'); return; }
  bannerMsg('обрезаю и сжимаю…');
  try {
    const dataUrl = await bannerFromFile(f);
    bannerMsg('загружаю…');
    const res = await api.setBanner({ image: dataUrl });
    if (!res || res.ok === false || res.error) { bannerMsg('Не загрузилось: ' + String(res?.error || 'нет связи').slice(0, 80)); return; }
    setMyBannerLocal(res.banner);
    bannerMsg('Своё фото стоит в шапке профиля');
    hap(14);
  } catch (err) {
    bannerMsg('Фото: ' + String(err?.message || err).slice(0, 80));
  }
});
renderAccBanner();
setTimeout(() => { void syncMyBanner(); }, 1500);
setTimeout(() => { void ghostLoad('run'); }, 900);

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
  return; // v206: экипажи убраны

  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
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
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
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
  if (meta) meta.textContent = trackName + ' · ' + (crew.memberCount || crew.members?.length || 0) + '/10' + (crew.inviteCode ? ' · код ' + crew.inviteCode : '');
  { const fr = document.getElementById('crewFollowRow'); if (fr) { fr.replaceChildren(); if (isRemoteApi()) fr.appendChild(followButton('team', crew.id, crew.name || 'Команда')); } } // v131

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
      list.innerHTML = '<li><span class="rk">·</span><span class="tops-av"><span class="tops-av-ini">?</span></span><span><div class="who">пока нет валидных заездов</div><div class="sub">ждите первый A/B круг</div></span><span class="tm">—</span></li>';
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
    else hint.textContent = 'Круг A/B на треке экипажа сам попадает на борд.';
  }
  const joinHere = document.getElementById('crewJoinHere');
  if (joinHere) {
    const already = (crew.members || []).some((m) => m.pilotId === myId || isMyPilotId(m.pilotId));
    joinHere.disabled = already;
    joinHere.textContent = already ? 'Ты уже в экипаже' : 'Вступить в этот';
  }
}

async function refreshCrewList() {
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
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
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
  if (!currentUser()) { const h = document.getElementById('crewHint'); if (h) h.textContent = REJECT_TEXT.no_account; return; }
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
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
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
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
  if (!currentUser()) { const h = document.getElementById('crewHint'); if (h) h.textContent = REJECT_TEXT.no_account; return; }
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
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
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
  return; // v206

  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
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
  if (tops.length) {
    listEl.innerHTML = tops.map((r, i) => topsPilotRowHtml({
      rank: i + 1,
      name: r.name,
      avatar: r.avatar,
      sub: r.car || '',
      timeHtml: `${esc(String(r.t))}${topsGpsBadge(r)}`,
    })).join('');
  } else {
    // пустое состояние: без псевдо-строки «п… —», только текст через textContent
    const li = document.createElement('li');
    li.className = 'sd-empty';
    const b = document.createElement('b');
    b.textContent = 'пока нет валидных заездов';
    const sp = document.createElement('span');
    sp.textContent = 'Проедь валидный круг на ' + (tr?.name || 'этой трассе') + ' — он первым попадёт в топ дня.';
    li.append(b, sp);
    listEl.replaceChildren(li);
  }

  const atts = Array.isArray(data.attendees) ? data.attendees : [];
  showWhen('sessionDayCard', tops.length + atts.length >= SHOW_MIN.sessionDay); // v120
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
  if (!currentUser()) { plFlash(REJECT_TEXT.no_account); return; }
  let nick = sessionPilotNick();
  if (!nick) {
    nick = String((await askText172('Твой ник для «я на месте»', { value: 'пилот', ok: 'Отметиться' })) || '').trim().slice(0, 48);
  }
  if (!nick) return;
  const res = await api.sessionCheckin({ nick, pilotId: (() => { try { return actingPilotId(); } catch (_) { return undefined; } })() });
  if (res && res.ok) {
    if (_sessionTodayCache) _sessionTodayCache.attendees = res.attendees || [];
    await renderSessionOfDay();
    try { hap(18); } catch (_) {}
  } else {
    plFlash(res?.error || 'Не удалось отметиться — нет связи с сервером');
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
    const meta = [t.km ? t.km + ' км' : '', isCalibrated(t.id) ? 'общий топ' : 'личные круги'].filter(Boolean).join(' · ');
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
  try { drawTrack(id, 'autodromeDetailMap', { compact: true }); } catch (_) {}
  const km = t.km ? `${t.km} км` : '';
  const turns = t.turns ? `${t.turns} пов.` : '';
  const meta = [km, turns, isCalibrated(t.id) ? 'калибрована · топ A/B' : 'не откалибрована · только личная история'].filter(Boolean).join(' · ');
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
  const raw = await askText172('Открыть экипаж', { placeholder: 'Ссылка, id или код экипажа', ok: 'Открыть' });
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

/* -------- v97: «Это моя машина» + комнаты экипажа (crew-rooms.js) -------- */
function plFlash(text) {
  let t = document.getElementById('plToast');
  if (!t) { t = document.createElement('div'); t.id = 'plToast'; t.className = 'pl-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = String(text || '');
  t.classList.add('on');
  clearTimeout(plFlash._t);
  plFlash._t = setTimeout(() => t.classList.remove('on'), 2600);
}
function roomShare(param, url, text) {
  if (isTMA) { void shareViaTelegram(param, url, text); return; }
  const full = text + '\n' + url;
  if (navigator.share) { navigator.share({ title: 'PITLANE', text, url }).catch(() => {}); return; }
  try { void navigator.clipboard?.writeText(full); plFlash('Ссылка скопирована'); } catch (_) { prompt('Ссылка', url); }
}
function roomWebUrl(param) {
  const [kind, id] = String(param).split(/_(.+)/);
  return location.origin + location.pathname + '?' + kind + '=' + encodeURIComponent(id || '');
}
initCrewRooms({
  tracks: () => TRACKS,
  currentCar: () => pickedCar(), // v279: без BMW по умолчанию в «Это моя машина»
  garageCars: () => garageList(),
  stockCars: () => CARS,
  isAuthed: () => { const t = getSessionToken(); return !!t && !t.startsWith('local-'); },
  goToView: (v) => goToView(v),
  hap: (ms) => hap(ms),
  flash: plFlash,
  tg: () => (isTMA ? TG : null),
  inviteLink: (param) => publicLinkFor(param, roomWebUrl(param)),
  share: roomShare,
  openTeam: (id) => void openTeamPage(id),
  openTeamEditor: (id) => void openTeamEditor(id),
  onCarSheet: () => { try { tipsOnView('mycar'); } catch (_) {} },
  howCar: () => {},
});
initTeams({
  tracks: () => TRACKS,
  isAuthed: () => { const t = getSessionToken(); return !!t && !t.startsWith('local-'); },
  hap: (ms) => hap(ms),
  openRooms: (opts) => openRoomSheet(opts || {}),
  share: roomShare,
  teamLink: (id) => publicLinkFor('team_' + id, roomWebUrl('team_' + id)),
  report: (text) => {
    document.getElementById('teamSheet')?.classList.add('hidden');
    openFeedbackSheet();
    const ta = document.getElementById('fbText');
    if (ta) { ta.value = String(text || '').slice(0, 1900); ta.dispatchEvent(new Event('input')); ta.focus(); }
  },
});
initMusic(() => { const t = String(getSessionToken() || ''); return t && !t.startsWith('local-') ? accountPilotId() : ''; }); // v115
document.getElementById('btnRoomsOpen')?.addEventListener('click', () => void openTeamsList());
document.getElementById('btnRoomsAcc')?.addEventListener('click', () => void openTeamsList());
// v120: одна «Команда» (экипаж) в интерфейсе; комнаты/команды-страницы видны только тем, у кого они уже есть
document.getElementById('btnCrewAcc')?.addEventListener('click', () => openCrewSheet());
document.getElementById('btnGarageAcc')?.addEventListener('click', () => goToView('garage'));
document.getElementById('btnPulseAcc')?.addEventListener('click', () => goToView('pulse'));
const LEGACY_ROOMS_KEY = 'pitlane-legacy-rooms-v1';
function applyLegacyRooms(on) {
  ['btnRoomsOpen', 'btnRoomsAcc'].forEach((id) => showWhen(id, !!on));
}
async function checkLegacyRooms() {
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
  let on = false;
  try { on = localStorage.getItem(LEGACY_ROOMS_KEY) === '1' || !!localStorage.getItem('pitlane-room-active-v1'); } catch (_) {}
  applyLegacyRooms(on);
  if (on || !getSessionToken() || !isRemoteApi()) return;
  try {
    const my = await api.listRooms(); // GET, только чтение
    if (Array.isArray(my) && my.length) { try { localStorage.setItem(LEGACY_ROOMS_KEY, '1'); } catch (_) {} applyLegacyRooms(true); }
  } catch (_) {}
}
setTimeout(() => { void checkLegacyRooms(); }, 2500);
/* v271: «Ещё фильтры» — в свёрнутом блоке, в заголовке число активных */
function topsActiveLine() {
  let n = 0;
  const m = document.getElementById('topModelFilter'); if (m && m.value) n++;
  if (document.getElementById('topValidOnly') && !document.getElementById('topValidOnly').checked) n++;
  const wx = document.querySelector('#topWeatherChips .wx-chip.on'); if (wx && wx.dataset.wx !== 'dry') n++;
  const pr = document.querySelector('#topPrepChips .wx-chip.on'); if (pr && pr.dataset.prep !== 'all') n++;
  if (topsTodFilter !== 'all') n++;
  try { if (_topsPeriod !== 'all') n++; } catch (_) {}
  const el = document.getElementById('topsActive'); if (el) el.textContent = n ? String(n) : '';
}
/* v272: «Ещё фильтры» — нижняя шторка; кнопка «Ещё · N» в закреплённой панели */
function t72Sheet(open) {
  const sh = document.getElementById('topsMore'); if (!sh) return;
  if (open && sh.parentElement !== document.body) document.body.appendChild(sh); // v272: fixed-шторка поверх таб-бара (у вью свой stacking-контекст)
  sh.classList.toggle('hidden', !open); sh.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.getElementById('btnTopsMore')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) t72ShowCount();
}
async function t72ShowCount() {
  const b = document.getElementById('topsShow'); if (!b) return;
  const n = document.querySelectorAll('#topsBoard .tb-row').length ? (document.querySelector('#t72Line .t72-sec span')?.textContent.match(/\d+/) || [''])[0] : '';
  b.textContent = n ? 'Показать ' + n + ' ' + (/1$/.test(n) && !/11$/.test(n) ? 'пилота' : 'пилотов') : 'Показать';
}
document.getElementById('btnTopsMore')?.addEventListener('click', () => { hap(6); t72Sheet(true); });
document.getElementById('tqPeriod')?.addEventListener('click', () => {
  const order = ['all', 'week', 'today'];
  const nx = order[(order.indexOf(_topsPeriod) + 1) % order.length];
  document.querySelector(`#topsPeriod [data-per="${nx}"]`)?.click();
});
document.getElementById('topsReset')?.addEventListener('click', () => {
  hap(6);
  const v = document.getElementById('topValidOnly'); if (v) v.checked = true;
  const m = document.getElementById('topModelFilter'); if (m) m.value = '';
  document.querySelector('#topWeatherChips .wx-chip[data-wx="dry"]')?.click();
  document.querySelector('#topTodChips .wx-chip[data-tod="all"]')?.click();
  _topsPrep = 'all'; document.querySelectorAll('#topPrepChips .wx-chip').forEach((x) => x.classList.toggle('on', x.dataset.prep === 'all'));
  _topsPeriod = 'all'; try { localStorage.setItem('pitlane-tops-period', 'all'); } catch (_) {}
  syncTopsPeriod();
  setTimeout(() => { topsActiveLine(); void renderTopsBoard().then(t72ShowCount); }, 0);
});
document.getElementById('topsMore')?.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-t72close]') || e.target.closest?.('.tops-menu-links button')) { t72Sheet(false); }
  else if (e.target.closest?.('button')) setTimeout(() => { void Promise.resolve(renderTopsBoard()).then(t72ShowCount); }, 60);
  setTimeout(topsActiveLine, 0);
});
document.getElementById('topsMore')?.addEventListener('change', () => setTimeout(() => { topsActiveLine(); t72ShowCount(); }, 300));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('topsMore')?.classList.contains('hidden')) t72Sheet(false); });
setTimeout(topsActiveLine, 0);
document.getElementById('h48Car')?.addEventListener('click', () => openQuickCarSheet());
document.getElementById('btnMyCarAcc')?.addEventListener('click', () => openMyCarSheet());
document.getElementById('btnMyCarLap')?.addEventListener('click', () => openMyCarSheet({ preselect: currentCar()?.name }));
document.getElementById('btnMyCarGarage')?.addEventListener('click', () => openMyCarSheet({ preselect: currentCar()?.name }));
try {
  const q = new URLSearchParams(location.search);
  const code = String(q.get('room') || '').toUpperCase();
  void code; // v206: приглашения в комнаты убраны
  const team = String(q.get('team') || '');
  void team; // v206: страницы команд убраны
} catch (_) {}


/* -------- Feature help (i) — reuse session-day «i» look -------- */
const FEATURE_HELP = {
  autodrome: {
    title: 'Автодромы',
    lines: [
      'Кольца России: длина, повороты, конфигурации.',
      '<strong>Как:</strong> открой трек в списке → «Выбрать этот трек» переключает Кольцо на него.',
      'Бронирование сессий в Pitlane не встроено — только справка.',
    ],
  },
  session: {
    title: 'Сессия дня',
    lines: [
      'Трек дня: топ кругов за сегодня и чекин «Я на месте».',
      '<strong>Как:</strong> «Открыть трек» ведёт в Кольцо на этот автодром. «Я на месте» — короткая отметка, что ты на треке.',
      'Нужна карточка автодрома — кнопка ниже.',
    ],
    extra: 'session-track',
  },
  sectorBattle: {
    title: 'Битва секторов',
    lines: [
      'Этот круг против твоих лучших секторов.',
      'Зелёный — быстрее PB сектора, красный — медленнее. «Оптимал» — сумма лучших секторов.',
      '<strong>Как:</strong> проедь 2+ валидных круга с секторами на выбранной трассе (экран Кольцо).',
    ],
  },
  sectorTops: {
    title: 'Топ секторов',
    lines: [
      'Публичный рейтинг по секторам трассы: фото, ник, время. Только GPS A/B.',
      '<strong>Как:</strong> выбери трассу и сектор (S1/S2/S3). Чтобы попасть — валидный круг с секторами.',
      '<strong>Где:</strong> Топы → «Секторы» или кнопка под «Битвой секторов».',
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
const APP_VERSION = 'v305';
{ const ve = document.getElementById('plVer'); if (ve) ve.textContent = 'PITLANE · версия ' + APP_VERSION.replace(/^v/, ''); }
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

/* v137: магазин — модуль грузится при первом открытии (витрина/карточка/заявка/«принята»), см. shop-ui.js и shop-config.js */
let _shopMod = null;
/* v158: магазин — отдельная страница (view-shop) с шапкой и «назад»; витрина → товар → заявка. BackButton Telegram: шаг назад, потом — откуда пришли */
let _shopFrom = 'zamer';
async function openShopSheet(productId) {
  const prev = document.querySelector('.view.active')?.id?.replace('view-', '');
  if (prev && prev !== 'shop') _shopFrom = prev;
  try { closeTgSheet({ instant: true }); } catch (_) {}
  try { plMenuClose(); } catch (_) {}
  goToView('shop');
  window.scrollTo(0, 0);
  try { _shopMod = _shopMod || await import('./shop-ui.js?v=296'); } catch (_) { const b = document.getElementById('shopBody'); if (b) b.textContent = 'Магазин не загрузился — проверьте интернет'; return; }
  _shopMod.openShop({ api, currentUser, needLogin, hap, close: shop58Leave, page: true }, productId);
}
function shop58Leave() { goToView(_shopFrom && document.getElementById('view-' + _shopFrom) ? _shopFrom : 'zamer'); }
function shop58Back() { if (_shopMod && _shopMod.shopBack()) return; shop58Leave(); }
/* v142: телеметрия кругов (локально, последние 8 на трассу, прорежено) + аналитика */
const TELE_KEY = 'pitlane-tele-v1';
function teleAll() { try { return JSON.parse(localStorage.getItem(TELE_KEY) || '{}') || {}; } catch (_) { return {}; } }
function teleSave(trackId, lap) {
  const all = teleAll(); const pts = (lap.pts || []).filter((_, i, arr) => i % 2 === 0 || i === arr.length - 1).map((p) => ({ t: Math.round(p.t), d: Math.round(p.d * 10) / 10, v: Math.round(p.v * 10) / 10, lat: p.lat != null ? +p.lat.toFixed(6) : undefined, lon: p.lon != null ? +p.lon.toFixed(6) : undefined }));
  if (pts.length < 10) return;
  const list = (all[trackId] || []).concat([{ ms: lap.ms, at: lap.at, valid: lap.valid, pts }]).slice(-8);
  all[trackId] = list; try { localStorage.setItem(TELE_KEY, JSON.stringify(all)); } catch (_) { all[trackId] = list.slice(-3); try { localStorage.setItem(TELE_KEY, JSON.stringify(all)); } catch (_) {} }
}
let _laMod = null; let laMode = 'best'; let laDemo = false;
async function renderLapAnalytics() {
  const host = document.getElementById('lapAnalyticsHost'); if (!host) return;
  try { _laMod = _laMod || await import('./lap-analytics.js'); } catch (_) { host.textContent = 'Аналитика не загрузилась'; return; }
  const trackId = document.getElementById('trackSelect')?.value || TRACKS[0].id;
  if (laDemo) { _laMod.renderAnalytics(host, { cur: _laMod.demoLap(1, 1), ref: _laMod.demoLap(1, 0), curLabel: 'круг 1:42.31', refLabel: 'лучший 1:41.58', demo: true }); return; }
  const list = teleAll()[trackId] || [];
  const cur = list[list.length - 1];
  let ref = null;
  if (cur) { const others = list.slice(0, -1); ref = laMode === 'prev' ? others[others.length - 1] : others.filter((l) => l.valid !== false).sort((x, y) => x.ms - y.ms)[0]; }
  _laMod.renderAnalytics(host, { cur: cur ? cur.pts : [], ref: ref ? ref.pts : null, curLabel: cur ? 'последний ' + fmtLapTime(cur.ms) : '', refLabel: ref ? (laMode === 'prev' ? 'прошлый ' : 'лучший ') + fmtLapTime(ref.ms) : '' });
}
document.querySelectorAll('#lapAnalyticsCard [data-la]').forEach((b) => b.addEventListener('click', () => {
  laMode = b.dataset.la; laDemo = false; document.querySelectorAll('#lapAnalyticsCard [data-la]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); hap(6); void renderLapAnalytics();
}));
document.getElementById('btnLapAnalyticsDemo')?.addEventListener('click', () => { laDemo = !laDemo; document.getElementById('btnLapAnalyticsDemo').textContent = laDemo ? 'Скрыть демо' : 'Показать на демо-круге'; hap(6); void renderLapAnalytics(); });
document.getElementById('trackSelect')?.addEventListener('change', () => { void renderLapAnalytics(); });
setTimeout(() => { void renderLapAnalytics(); }, 1500);
try { hudZones(0, true); } catch (_) {}
window.__hud = hudZones; /* скриншоты/отладка */ window.__rd = { open: (ph) => openRunDrive(ph), phase: (ph) => rdPhase(ph), set: (k, v, s) => rdGridSet(k, v, s, { flash: true }) }; // v150: скриншоты

/* v143: видео + телеметрия (модуль грузится по кнопке) */
let _vtMod = null;
async function openVideoTele(scope, opts = {}) {
  try { _vtMod = _vtMod || await import('./video-tele.js'); } catch (_) { return; }
  _vtMod.openVideo({ getSpeed: () => displayKmh(), getLabel: () => (scope === 'lap' ? 'круг' : 'время'), hap, webUrl: 'https://dsssssz.github.io/pitlane/', autostart: !!opts.autostart });
}
/* v154: «С видео» — тихая кнопка под «Старт» (Замер) и «Старт круга» (Трек): запускает замер/круг и сразу запись с камеры + телеметрия */
document.getElementById('h54Video')?.addEventListener('click', () => {
  hap(12);
  withSafety(() => { armRun(); void openVideoTele('run', { autostart: true }); })();
});
document.getElementById('l54Video')?.addEventListener('click', () => {
  hap(12);
  void lapStartFlow(() => { void openVideoTele('lap', { autostart: true }); });
});
document.getElementById('btnVideoRun')?.addEventListener('click', () => { void openVideoTele('run'); });
document.getElementById('btnVideoLap')?.addEventListener('click', () => { void openVideoTele('lap'); });

/* ——— v148: структура «Старт / Гараж / Профиль» ——— */
document.documentElement.classList.add('v148', 'v150', 'v152', 'v153', 'v154', 'v155', 'v156', 'v158', 'v159', 'v160', 'v161', 'v162', 'v163', 'v164', 'v165', 'v166', 'v167', 'v168', 'v169', 'v170', 'v171', 'v172', 'v173', 'v174', 'v175', 'v176', 'v177', 'v178', 'v179', 'v180', 'v181', 'v182', 'v184');
(() => {
  const nav = document.getElementById('nav3'); if (nav) document.body.appendChild(nav); // fixed вне трансформируемых контейнеров
  const sync = () => {
    const act = document.querySelector('.view.active')?.id?.replace('view-', '') || 'zamer';
    const key = act === 'garage' ? 'garage' : act === 'home' ? 'home' : act === 'zamer' || act === 'run' ? 'zamer' : act === 'lap' ? 'lap' : ''; // v154: Профиль — из аватара в шапке
    void key; window.__pf6?.n6Sync?.(); // v206: единая синхронизация 5 вкладок
  };
  nav?.addEventListener('click', (e) => {
    const b = e.target.closest('.nav3-btn'); if (!b) return;
    try { closeTgSheet({ instant: true }); } catch (_) {}
    try { closeShopSheet(); } catch (_) {}
    goToView(b.dataset.n3); sync(); window.scrollTo(0, 0);
  });
  /* v156: «Замер» открыт — спидометр пре-смонтирован скрытым; ушли — снимаем и гасим ожидание автостарта */
  {
    let was = false;
    const zsync = () => {
      const on = !!document.getElementById('view-zamer')?.classList.contains('active');
      if (on === was) return; was = on;
      if (on) (window.requestIdleCallback || ((f) => setTimeout(f, 120)))(() => { if (document.getElementById('view-zamer')?.classList.contains('active')) rd56Pre(); });
      else { rd56Unpre(); as56Stop(); }
    };
    const vh = document.getElementById('viewHost');
    if (vh) new MutationObserver(zsync).observe(vh, { subtree: true, attributes: true, attributeFilter: ['class'] });
    zsync();
    document.getElementById('h56Mode')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-as56]'); if (!b) return;
      try { localStorage.setItem(AS56_KEY, b.dataset.as56 === '1' ? '1' : '0'); } catch (_) {}
      as56Stop(); AS56.st = ''; as56Ui();
    });
    as56Ui();
    // стеклянные кнопки старта: мягкий блик по нажатию
    ['h48Start', 'btnLapStart'].forEach((id) => { const b = document.getElementById(id); if (!b) return;
      b.addEventListener('pointerdown', () => { b.classList.remove('s56-sheen'); void b.offsetWidth; b.classList.add('s56-sheen'); });
      b.addEventListener('animationend', (e) => { if (e.animationName === 's56Sheen') b.classList.remove('s56-sheen'); }); });
    window.__as56 = { gps: (kmh) => onGpsPoint({ timestamp: Date.now(), coords: { latitude: 43.4, longitude: 39.95, speed: kmh / 3.6, accuracy: 4, heading: 0 } }), st: () => AS56.st }; // скриншоты/отладка
  }
  const host = document.getElementById('viewHost');
  if (host) new MutationObserver(sync).observe(host, { subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();
  // «Старт» на Главной = та же логика, что у кнопки замера (безопасность → armRun → полноэкранный спидометр)
  {
    const sb = document.getElementById('h48Start');
    const up = () => sb?.classList.remove('h53-press');
    sb?.addEventListener('pointerdown', () => { sb.classList.add('h53-press'); if (!as56Mode()) rd56Pre(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => sb?.addEventListener(ev, up));
    sb?.addEventListener('click', () => {
      up();
      if (as56Mode()) { if (AS56.wait) as56Stop(); else withSafety(as56Start)(); return; } // v156: автостарт
      if (run.armed && document.body.classList.contains('run-drive-on')) return;
      if (isTMA) { _hapKey = true; try { hap(30); } finally { _hapKey = false; } } // один heavy-удар; hap внутри armRun в Telegram уже не сработает
      const r = sb.getBoundingClientRect();
      Object.assign(H53, { at: performance.now(), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), r: Math.round(r.width / 2) });
      const ring = document.createElement('span'); ring.className = 'h53-ring'; ring.setAttribute('aria-hidden', 'true');
      ring.style.cssText = `left:${sb.offsetLeft}px;top:${sb.offsetTop}px;width:${sb.offsetWidth}px;height:${sb.offsetHeight}px`;
      sb.parentElement.appendChild(ring); setTimeout(() => ring.remove(), 650);
      withSafety(armRun)();
    });
  }
  /* v154: аватар пилота в шапке (кнопка Профиля) */
  {
    const src = document.getElementById('accAvatar'); const btn = document.getElementById('btnProfile');
    const paint = () => { if (!btn) return; const u = src?.getAttribute('src') || ''; let im = btn.querySelector('img.bb-ava');
      if (u && !/^\s*$/.test(u)) { if (!im) { im = document.createElement('img'); im.className = 'bb-ava'; im.alt = ''; im.onerror = () => { im.remove(); btn.classList.remove('has-ava'); }; btn.appendChild(im); } if (im.getAttribute('src') !== u) im.src = u; btn.classList.add('has-ava'); }
      else { im?.remove(); btn.classList.remove('has-ava'); } };
    if (src) new MutationObserver(paint).observe(src, { attributes: true, attributeFilter: ['src'] });
    setTimeout(paint, 800);
  }
  /* v154: одна живая 3D-сцена (three.js) переезжает туда, где её видно: карточка Гаража или «Моя машина» на Главной */
  {
    const sync3d = () => {
      const act = document.querySelector('.view.active')?.id;
      if (act === 'view-garage') mountPodium('garage');
      // v155: на Главной — студийный рендер; живое 3D только в Гараже
    };
    const vh = document.getElementById('viewHost');
    if (vh) new MutationObserver(() => { clearTimeout(sync3d.t); sync3d.t = setTimeout(sync3d, 60); }).observe(vh, { subtree: true, attributes: true, attributeFilter: ['class'] });
    setTimeout(sync3d, 900);
    window.__mount3d = mountPodium;
  }
  /* v305: блок Гаража (g53) удалён — выбор машины только в каталоге */
  /* v153: Круг — выбор трассы и «Старт круга»; история и аналитика — по кнопке */
  document.getElementById('l53More')?.addEventListener('click', (e) => {
    const v = document.getElementById('view-lap'); const on = v.classList.toggle('l53-open');
    e.currentTarget.setAttribute('aria-expanded', on ? 'true' : 'false'); e.currentTarget.textContent = on ? 'Скрыть' : 'История и аналитика';
  });
  /* v152: карусель баннеров на Главной — scroll-snap, точки, авто каждые 6 с, пауза на касании */
  (() => {
    const track = document.getElementById('bn52Track'); const dots = document.getElementById('bn52Dots');
    if (!track || !dots) return;
    const slides = [...track.querySelectorAll('.bn52-s')]; if (!slides.length) return;
    /* v180: автопрокрутка — 5 с на баннер, плавный переход 300 мс (свой tween: на iOS smooth-scroll по scroll-snap срывался), по кругу.
       Пауза: касание/свайп/колесо (+4 с после), вкладка скрыта, баннер вне экрана, не Главная. prefers-reduced-motion — без автопрокрутки.
       Раньше шаг считался как ширина + 12 px, а зазор стал 8 px — индекс уезжал, и ротация «стояла». Теперь позиции берутся из offsetLeft. */
    const BN_MS = 5000, BN_TW = 300, BN_RESUME = 4000;
    const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
    const host = document.getElementById('bn52') || track.parentElement;
    let cur = 0, touching = false, holdUntil = 0, onScreen = true, timer = 0, tw = 0, twOn = false;
    const posOf = (i) => slides[i].offsetLeft - slides[0].offsetLeft;
    const idx = () => { const x = track.scrollLeft; let best = 0, bd = Infinity; slides.forEach((_, i) => { const d = Math.abs(posOf(i) - x); if (d < bd) { bd = d; best = i; } }); return best; };
    const paint = (i) => { const ch = cur !== i; cur = i; dots.querySelectorAll('.bn52-dot').forEach((d, k) => { d.classList.toggle('on', k === i); d.setAttribute('aria-selected', k === i ? 'true' : 'false'); }); if (ch) progress(); };
    const homeActive = () => !!document.getElementById('view-home')?.classList.contains('active');
    const canRun = () => !reduce && !touching && Date.now() >= holdUntil && !document.hidden && onScreen && homeActive() && slides.length > 1;
    // тонкая платиновая полоска прогресса на активной точке — перезапуск анимации при каждом показе
    function progress() {
      const run = canRun(); host.classList.toggle('bn80-run', run);
      const d = dots.querySelector('.bn52-dot.on'); if (!d) return;
      d.classList.remove('bn80-p'); if (run) { void d.offsetWidth; d.classList.add('bn80-p'); }
    }
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const go = (i, anim = !reduce) => {
      const n = (i + slides.length) % slides.length; const to = posOf(n); cancelAnimationFrame(tw);
      if (!anim) { track.scrollLeft = to; paint(n); return; }
      const from = track.scrollLeft, t0 = performance.now(); twOn = true; track.classList.add('bn80-tw'); paint(n);
      const step = (now) => { const k = Math.min(1, (now - t0) / BN_TW); track.scrollLeft = from + (to - from) * ease(k); if (k < 1) tw = requestAnimationFrame(step); else { twOn = false; track.classList.remove('bn80-tw'); } };
      tw = requestAnimationFrame(step);
    };
    const schedule = () => { clearTimeout(timer); progress(); if (!canRun()) { timer = setTimeout(schedule, Math.max(400, holdUntil - Date.now())); return; } timer = setTimeout(() => { if (canRun()) go(cur + 1); schedule(); }, BN_MS); };
    let raf = 0; track.addEventListener('scroll', () => { if (twOn) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => paint(idx())); }, { passive: true });
    const hold = () => { touching = true; cancelAnimationFrame(tw); twOn = false; track.classList.remove('bn80-tw'); clearTimeout(timer); progress(); };
    const release = () => { touching = false; holdUntil = Date.now() + BN_RESUME; schedule(); };
    track.addEventListener('touchstart', hold, { passive: true }); track.addEventListener('pointerdown', hold);
    track.addEventListener('touchend', release, { passive: true }); track.addEventListener('touchcancel', release, { passive: true }); track.addEventListener('pointerup', release); track.addEventListener('pointercancel', release);
    track.addEventListener('wheel', () => { holdUntil = Date.now() + BN_RESUME; schedule(); }, { passive: true });
    dots.addEventListener('click', (e) => { const d = e.target.closest('.bn52-dot'); if (!d) return; holdUntil = Date.now() + BN_RESUME; go(+d.dataset.i); schedule(); });
    document.addEventListener('visibilitychange', schedule);
    try { new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5); schedule(); }, { threshold: [0, 0.5, 1] }).observe(host); } catch (_) {}
    { const hv = document.getElementById('view-home'); if (hv) new MutationObserver(schedule).observe(hv, { attributes: true, attributeFilter: ['class'] }); }
    schedule();
    track.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bn52]'); if (!b) return;
      bn63Open(b.dataset.bn52);
    });
    /* v163: раньше баннер кликал по строке Профиля #p48 [data-p48=k] — строк «video» и «suggest» там нет, и «Видео» / «Предложи трассу»
       молча ничего не делали; «Чип 25 Гц» открывал витрину, а не сам товар. Теперь — прямой маршрут для каждого. */
    function bn63Open(k) {
      try { hap(8); } catch (_) {}
      if (k === 'shop') { void openShopSheet('pitlane-gps'); return; } // сразу карточка PITLANE GPS
      const r = window.__route48; if (typeof r !== 'function') return;
      if (k === 'tops' || k === 'duels' || k === 'video' || k === 'suggest') r(k);
    }
    window.__bn63Open = bn63Open;
    window.__bn52 = { go: (i) => go(i), cur: () => cur, state: () => ({ cur, run: canRun(), touching, onScreen, reduce, holdMs: Math.max(0, holdUntil - Date.now()) }) }; // скриншоты/отладка
  })();
  const renderH48 = () => {
    if (document.body.classList.contains('run-drive-on')) return; // v156: под спидометром страницу не трогаем
    const nm = document.getElementById('hwCarName')?.textContent?.trim();
    const car = document.getElementById('h48Car');
    let saved = null; try { saved = JSON.parse(localStorage.getItem('pitlane-v1') || '{}').carId || null; } catch (_) {}
    const mine = myCarLocal();
    // v254: машина «в боксе» гаража (подиум) — источник правды, если «моя машина» не задана
    let box = null; try { const bid = podiumModelId || defaultPodiumId(); box = bid ? (CARS.find((c) => c.id === bid) || null) : null; } catch (_) {}
    const hasCar = !!(mine || saved || box || (state.garage && state.garage.length));
    if (car) { const t = mine ? String(mine.model) : 'Выбери машину'; /* v279: без машины по умолчанию */ if (car.textContent !== t) car.textContent = t; const e = mine ? '0' : '1'; if (car.dataset.empty !== e) car.dataset.empty = e; }
    const s = homeGoGpsStatus(); const g = document.getElementById('h48Gps'); const v = document.getElementById('h48GpsV');
    if (v && v.textContent !== s.text) v.textContent = s.text; if (g && g.dataset.q !== s.q) g.dataset.q = s.q;
    try { r275Idle(); } catch (_) {}
  };
  setInterval(() => { if (!document.hidden) { try { renderH48(); } catch (_) {} } }, 2000); setTimeout(() => { try { renderH48(); } catch (_) {} }, 600);
  // Профиль: разделы
  const scrollTo = (id) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 260);
  document.getElementById('p48')?.addEventListener('click', (e) => {
    const r = e.target.closest('[data-p48]'); if (!r) return;
    route48(r.dataset.p48);
  });
  // v154: общий маршрутизатор разделов (Профиль + меню ☰)
  function route48(k) {
    if (k === 'settings') { goToView('settings'); window.scrollTo(0, 0); return; } // v166: отдельный экран Настроек
    if (k === 'feedback') { openFeedbackSheet(); return; }
    if (k === 'tops') goToView('tops');
    else if (k === 'duels' || k === 'pulse') { if (sheetNavOn()) openTgSheet(k); else goToView(k); }
    else if (k === 'tracks') { if (sheetNavOn()) openTgSheet('tracks'); else goToView('lap'); }
    else if (k === 'lap') goToView('lap');
    else if (k === 'history') journalGo61(); // v161: единый Журнал
    else if (k === 'analytics') { journalGo61('lap'); scrollTo('lapAnalyticsCard'); }
    else if (k === 'suggest') { goToView('lap'); const d = document.querySelector('#trackSuggestCard details'); if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); } scrollTo('trackSuggestCard'); }
    else if (k === 'team') openCrewSheet();
    else if (k === 'video') void openVideoTele('run');
    else if (k === 'ghost') { goToView('zamer'); setTimeout(() => { try { window.__ghost74?.open(); } catch (_) {} }, 200); } // v261: призрак — из меню
    else if (k === 'chip') { try { window.__gps61?.open(); } catch (_) {} } // v261: единая точка чипа — Профиль
    else if (k === 'shop') void openShopSheet();
  }
  window.__route48 = route48;
  // бейдж входящих дуэлей — из нижней панели v139
  const badge = () => { const src = document.getElementById('sbBadgeDuels'); const dst = document.getElementById('p48DuelsBadge'); if (src && dst) { dst.hidden = src.hidden; dst.textContent = src.textContent; } const m = document.getElementById('plmDuelsBadge'); if (src && m) { m.hidden = src.hidden; m.textContent = src.textContent; } };
  setInterval(badge, 3000); badge();
})();

/* v141: «Предложить трассу» */
document.querySelector('#trackSuggestCard details')?.addEventListener('toggle', (e) => {
  if (!e.target.open) return;
  LB.mountSuggest(document.getElementById('trackSuggestHost'), { api, needLogin, currentUser, hap,
    getPos: () => new Promise((res, rej) => { if (!navigator.geolocation) { rej(new Error('no geo')); return; } navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }), rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }) });
});
window.__lb = LB; window.__lbOpenHud = () => openLapDrive(); window.__lbSat = paintSatSector; // для скриншотов/отладки
function closeShopSheet() { const s = document.getElementById('shopSheet'); if (!s) return; s.classList.add('hidden'); s.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('shop-open'); try { tgsSetTab(null); } catch (_) {} }
document.getElementById('shopClose')?.addEventListener('click', closeShopSheet);
document.getElementById('shopSheet')?.addEventListener('click', (e) => { if (e.target?.id === 'shopSheet') closeShopSheet(); });
document.getElementById('railShop')?.addEventListener('click', (e) => { e.preventDefault(); hap(6); void openShopSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('shopSheet')?.classList.contains('hidden')) closeShopSheet(); });

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
    contact.placeholder = logged ? '@telegram или e-mail (необязательно)' : '@telegram или e-mail для ответа';
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

// v235: офлайн-очередь замеров в топ — отправка при появлении сети и после старта
async function flushRunsUi() { try { const n = await flushRunQueue(); if (n) showAppToast(n === 1 ? 'Замер из очереди отправлен в топ' : `Замеры из очереди отправлены в топ: ${n}`); } catch (_) {} }
window.addEventListener('online', () => { void flushRunsUi(); });
setTimeout(() => { if (runQueueSize()) void flushRunsUi(); }, 6000);
/* v81: ?screen= deep links (Telegram bot buttons) → open the matching sheet once the app is up */
if (SCREEN_PARAM) {
  setTimeout(() => {
    try {
      if (SCREEN_PARAM === 'duel') openDuelSheet();
      else if (SCREEN_PARAM === 'crew') openCrewSheet();
      else if (SCREEN_PARAM === 'mycar') openMyCarSheet();
      else if (SCREEN_PARAM === 'autodromes') openAutodromeSheet();
      else if (SCREEN_PARAM === 'feedback') openFeedbackSheet();
      else if (SCREEN_PARAM === 'shop') void openShopSheet();
    } catch (err) { console.warn('screen deep link', err); }
  }, 900);
}

/* ——— v84: compact app — Главная / Дуэли / компактные Топы ———
   User text → textContent only. Discipline + track boards come from the Worker. */
const CAR_SHORT = {
  'g87-m2': 'BMW M2', gt3rs: '911 GT3 RS', 'mclaren-765lt': '765LT', g63: 'G63', m4: 'BMW M4',
  m3: 'BMW M3', x6: 'BMW X6', isf: 'IS-F', 'c63-ed507': 'C63 507', spark: 'Spark GT',
};
const CAR_SHORT_RE = [
  [/\bG87\b|\bM2\b/i, 'BMW M2'], [/GT3\s*RS/i, '911 GT3 RS'], [/911\s*GT3/i, '911 GT3'], [/911\s*Turbo/i, '911 Turbo'],
  [/765\s*LT/i, '765LT'], [/\bG\s?63\b/i, 'G63'], [/\bM4\b/i, 'BMW M4'], [/\bM3\b/i, 'BMW M3'], [/\bM5\b/i, 'BMW M5'],
  [/\bM8\b/i, 'BMW M8'], [/\bX6\b/i, 'BMW X6'], [/\bX5\s?M\b/i, 'X5 M'], [/IS-?F/i, 'IS-F'], [/C\s?63.*507/i, 'C63 507'],
  [/C\s?63/i, 'C63'], [/E\s?63/i, 'E63'], [/Supra/i, 'Supra'], [/GT-?R/i, 'GT-R'], [/Golf\s*R/i, 'Golf R'],
  [/RS\s?3/i, 'Audi RS3'], [/RS\s?6/i, 'Audi RS6'], [/Spark/i, 'Spark GT'], [/Camry/i, 'Camry'], [/Model\s*S/i, 'Model S'],
];
const CAR_BRAND_RE = /^(Mercedes-AMG|Mercedes-Benz|Mercedes|Porsche|Chevrolet|Volkswagen|Toyota|Lexus|Nissan|Audi|Honda|Subaru|Mitsubishi|Hyundai|Kia|Lada|Ford|Tesla|McLaren)\s+/i;
function clipText(s, max = 12) {
  const arr = Array.from(String(s || '').trim());
  return arr.length > max ? arr.slice(0, max - 1).join('').trimEnd() + '…' : arr.join('');
}
function shortCarName(car, carId) {
  if (carId && CAR_SHORT[carId]) return CAR_SHORT[carId];
  const s = String(car || '').trim();
  if (!s) return '';
  for (const [re, v] of CAR_SHORT_RE) if (re.test(s)) return v;
  return clipText(s.replace(CAR_BRAND_RE, ''), 12);
}

/** Disciplines the run screen measures (0–60 = км/ч). Same ids as Worker DRAG_DISCIPLINES. */
const DRAG_DISC = [
  { id: '0-100', label: '0–100', tag: '0–100', title: '0–100 км/ч' },
  { id: '100-200', label: '100–200', tag: '100–200', title: '100–200 км/ч' },
  { id: '200-300', label: '200–300', tag: '200–300', title: '200–300 км/ч' },
  { id: '402m', label: '¼ мили', tag: '¼ mi', title: '¼ мили · 402 м' },
  { id: '201m', label: '⅛ мили', tag: '⅛ mi', title: '⅛ мили · 201 м' },
  { id: '0-200', label: '0–200', tag: '0–200', title: '0–200 км/ч' },
  { id: '80-120', label: '80–120', tag: '80–120', title: '80–120 км/ч' },
  { id: '0-60', label: '0–60', tag: '0–60', title: '0–60 км/ч' },
  { id: '0-50', label: '0–50', tag: '0–50', title: '0–50 км/ч' },
  { id: '60ft', label: '60 ft', tag: '60 ft', title: '60 футов · 18 м' },
];
const dragDiscMeta = (id) => DRAG_DISC.find((d) => d.id === id);

/* Track silhouettes from geo/outlines.js → normalised SVG path (cached). */
const _trackPathCache = new Map();
function trackSilhouettePath(trackId, box = 32, pad = 3) {
  const key = trackId + ':' + box;
  if (_trackPathCache.has(key)) return _trackPathCache.get(key);
  const o = TRACK_OUTLINES?.[trackId];
  let d = '';
  if (o && Array.isArray(o.coords) && o.coords.length > 2) {
    const lat0 = (o.coords.reduce((a, c) => a + c[1], 0) / o.coords.length) * Math.PI / 180;
    const k = Math.cos(lat0);
    let pts = o.coords.map(([lon, lat]) => [lon * k, -lat]);
    const step = Math.max(1, Math.floor(pts.length / 80));
    pts = pts.filter((_, i) => i % step === 0);
    const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX || 1; const h = Math.max(...ys) - minY || 1;
    const sc = (box - pad * 2) / Math.max(w, h);
    const ox = (box - w * sc) / 2; const oy = (box - h * sc) / 2;
    d = pts.map((p, i) => (i ? 'L' : 'M') + (ox + (p[0] - minX) * sc).toFixed(1) + ' ' + (oy + (p[1] - minY) * sc).toFixed(1)).join('') + 'Z';
  }
  _trackPathCache.set(key, d);
  return d;
}
function trackSilhouetteSvg(trackId, size = 28, cls = 'trk-sil') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const d = trackSilhouettePath(trackId);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d || 'M6 22C6 10 26 10 26 16S14 26 6 22Z');
  svg.appendChild(path);
  return svg;
}
function discTag(discId) {
  const m = dragDiscMeta(discId);
  return padEl('span', 'disc-tag', m ? m.tag : discId);
}
function trackShortName(trackId) {
  const tr = TRACKS.find((t) => t.id === trackId);
  return tr ? tr.name : String(trackId || '');
}

/* ——— publish every discipline mark (0–100 goes via /tops/straight, mirrored server-side) ——— */
function publishDragMark(disc, sec) {
  try {
    if (!dragDiscMeta(disc)) return;
    const t = Number(sec);
    if (!Number.isFinite(t) || t <= 0) return;
    const gq = gpsQualityFromStraightRun();
    const flags = (run.flags || []).slice(0, 8);
    if (!(runRowValid(gq, flags) && canPublishTop(gq, flags))) return;
    const pts = rawSince(run.rawSeq0 || 0);
    const cls = runClassOf(pts);
    if (cls === 'sim') return;
    // v85: personal bests on device — feeds the home hero card. v118: телефон — отдельно, с меткой C (не «A/B»)
    try { recordLocalDragBest(currentCar()?.id, disc, t, cls === 'c' ? 'C' : gq.gpsQ); } catch (_) {}
    if (cls === 'c' && PHONE_NO_DISCS.includes(disc)) return; // телефон эти отметки не меряет — сервер не примет
    if (disc === '0-100') return; // server copy goes via /tops/straight (mirrored)
    if (!isRemoteApi() || !currentUser()) return;
    const car = pickedCar(); if (!car) return; // v279: без выбранной машины — не в топ
    void Promise.resolve(api.addDrag(disc, {
      ...chalField(disc), // v280
      carId: car?.id,
      car: car?.name,
      name: String(pulseWho() || 'пилот').slice(0, 24),
      weather: lapDrive.weather || undefined,
      trace: packTrace(pts),
    })).then((res) => {
      if (res && res.ok) { chalAfterRun(disc); funnelEv('run', 'once'); } // v280
      if (res && !res.ok && res.code && res.code !== 'phone_source' && res.code !== 'phone_disc') setRunText('runStatus', disc + ': ' + rejectText(res));
      else { const w = wxFromRes(res); if (w && !document.getElementById('rdWx')?.textContent.trim()) showRunWx(w); } // v128
    }).catch(() => {});
  } catch (err) { console.warn('publishDragMark', err); }
}


/* ——— v129: история трассы — место на сухом, срез своей машины, лучший сектор, свои круги, прогресс ——— */
const TH_SECTOR_RU = ['первый', 'второй', 'третий'];
let _thSeq = 0;
function thSummary(h) {
  if (!h || !h.overall) return '';
  const bits = [`Ты здесь ${h.overall.pos}-й из ${h.overall.of} ${h.cond === 'dry' ? 'на сухом' : 'во всех условиях'}`];
  if (h.car && h.car.of > 1) bits.push(`в срезе своей машины ${h.car.pos}-й из ${h.car.of}`);
  else if (h.car) bits.push('на этой модели пока один');
  if (h.sector && TH_SECTOR_RU[h.sector.idx - 1]) bits.push(`лучший сектор — ${TH_SECTOR_RU[h.sector.idx - 1]} (${h.sector.pos}-й из ${h.sector.of})`);
  return bits.join(' · ');
}
function thFmtDate(at) {
  if (!at) return '';
  const d = new Date(at);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function thWxShort(l) {
  const w = cleanWx(l.wx);
  if (w) { const b = []; if (w.t != null) b.push(wxTemp(w.t)); if (w.wet) b.push(WX_WET_RU[w.wet]); if (w.tod) b.push(WX_TOD_RU[w.tod]); return b.join(' · '); }
  return WX_WET_RU[l.weather] || '';
}
/** SVG: лучший-на-момент по времени (кумулятивный минимум); точки — новые личные рекорды. */
function thChart(host, laps) {
  host.replaceChildren();
  const pts = laps.filter((l) => Number.isFinite(l.ms) && l.at);
  if (pts.length < 2) { host.hidden = true; return; }
  host.hidden = false;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 320, H = 70, P = 6;
  let best = Infinity; const series = pts.map((l) => { const pb = l.ms < best; best = Math.min(best, l.ms); return { at: l.at, v: best, pb }; });
  const t0 = series[0].at, t1 = series[series.length - 1].at;
  const vMax = series[0].v, vMin = series[series.length - 1].v;
  const x = (at) => P + (t1 > t0 ? (at - t0) / (t1 - t0) : 1) * (W - 2 * P);
  const y = (v) => (vMax > vMin ? P + ((v - vMin) / (vMax - vMin)) * (H - 2 * P) : H / 2); // быстрее — выше
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'th-svg');
  let d = ''; series.forEach((p, i) => { const X = x(p.at).toFixed(1), Y = y(p.v).toFixed(1); d += (i ? ` L${X} ${Y}` : `M${X} ${Y}`); if (i < series.length - 1) d += ` L${x(series[i + 1].at).toFixed(1)} ${Y}`; });
  const base = document.createElementNS(NS, 'path'); base.setAttribute('d', `M${P} ${H - P} L${W - P} ${H - P}`); base.setAttribute('class', 'th-base'); svg.appendChild(base);
  const line = document.createElementNS(NS, 'path'); line.setAttribute('d', d); line.setAttribute('class', 'th-line-path'); svg.appendChild(line);
  series.forEach((p, i) => { if (!p.pb) return; const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x(p.at).toFixed(1)); c.setAttribute('cy', y(p.v).toFixed(1)); c.setAttribute('r', i === series.length - 1 || p.v === vMin ? '3.2' : '2.2'); c.setAttribute('class', p.v === vMin ? 'th-pb now' : 'th-pb'); svg.appendChild(c); });
  host.appendChild(svg);
  const cap = padEl('div', 'th-cap');
  cap.append(padEl('span', '', fmtLapTime(vMax)), padEl('span', '', 'прогресс лучшего'), padEl('b', '', fmtLapTime(vMin)));
  host.appendChild(cap);
}
async function renderTrackHistory(trackId0, { hud } = {}) {
  const card = document.getElementById('trackHistCard'); if (!card) return null;
  const trackId = trackId0 || document.getElementById('trackSelect')?.value || currentCar()?.lap?.track;
  const tr = TRACKS.find((t) => t.id === trackId);
  { const el = document.getElementById('thTrack'); if (el) el.textContent = tr?.name || ''; }
  const seq = ++_thSeq;
  let h = null; let cls = 'ab';
  try { const r = await api.trackHistory(trackId); if (r) { if (r.ab?.laps?.length) h = r.ab; else if (r.c?.laps?.length) { h = r.c; cls = 'c'; } else h = r.ab || null; } } catch (_) { h = null; }
  if (seq !== _thSeq) return null;
  const lineEl = document.getElementById('thLine'); const list = document.getElementById('thList'); const note = document.getElementById('thNote'); const chart = document.getElementById('thChart');
  list.replaceChildren(); chart.replaceChildren(); chart.hidden = true;
  let laps = h?.laps || [];
  let local = false;
  if (!laps.length && !h) {
    // не вошёл / офлайн — только свои круги с устройства, без места в топе
    laps = (state.laps?.[trackId] || []).filter((l) => Number.isFinite(l.ms)).map((l) => ({ t: l.t, ms: l.ms, at: l.at, weather: l.weather, wx: l.wx })).sort((a, b) => (a.at || 0) - (b.at || 0));
    local = laps.length > 0;
  }
  const sum = h ? thSummary(h) : '';
  lineEl.textContent = sum + (sum && cls === 'c' ? ' · зачёт C' : '');
  lineEl.hidden = !sum;
  if (!laps.length) {
    note.textContent = h ? 'Зачтённых кругов нет. Проедь круг по GPS.' : 'Войди и проедь круг по GPS.';
    card.classList.add('is-empty');
    return h;
  }
  card.classList.remove('is-empty');
  const best = Math.min(...laps.map((l) => l.ms));
  laps.slice().reverse().slice(0, 12).forEach((l) => {
    const li = padEl('li', 'th-row' + (l.ms === best ? ' is-pb' : ''));
    const left = padEl('div', 'th-l');
    left.append(padEl('b', 'th-t', fmtLapTime(l.ms)), padEl('span', 'th-d', [thFmtDate(l.at), thWxShort(l)].filter(Boolean).join(' · ')));
    const dlt = l.ms === best ? 'лучший' : '+' + ((l.ms - best) / 1000).toFixed(2).replace('.', ',');
    li.append(left, padEl('span', 'th-delta', dlt));
    list.appendChild(li);
  });
  thChart(chart, laps);
  note.textContent = local ? 'Круги с этого устройства. Место в топе и срез машины — после входа.' : (laps.length > 12 ? `Показаны последние 12 из ${laps.length}.` : '');
  if (hud) {
    const hl = document.getElementById('lapDriveHist');
    if (hl && sum) { hl.textContent = sum; hl.hidden = false; }
  }
  return h;
}
document.getElementById('trackSelect')?.addEventListener('change', () => { void renderTrackHistory(); });


/* ——— v130: разбор сессии — карта секторов, круги × сектора, идеальный круг, где терял ——— */
let _ssState = null;
function ssFmt(ms) { return Number.isFinite(ms) ? fmtLapTime(ms) : ''; }
function ssSec(ms) { return Number.isFinite(ms) ? (ms / 1000).toFixed(2).replace('.', ',') : ''; }
function ssDelta(ms) { return (ms <= 0 ? '' : '+') + (ms / 1000).toFixed(2).replace('.', ','); }
function ssDrawMap(trackId, dirPt, row) {
  const host = document.getElementById('ssMap'); if (!host) return;
  host.replaceChildren();
  const o = TRACK_OUTLINES?.[trackId];
  const sp = o ? splitOutline(o.coords, o.sf, dirPt) : null;
  if (!sp) { host.hidden = true; document.getElementById('ssLegend').hidden = true; return; }
  host.hidden = false; document.getElementById('ssLegend').hidden = false;
  const NS = 'http://www.w3.org/2000/svg'; const W = 340, H = 210, P = 16;
  const allPts = sp.sectors.flat();
  const lat0 = allPts.reduce((a, p) => a + p[1], 0) / allPts.length; const kx = Math.cos(lat0 * Math.PI / 180);
  const xs = allPts.map((p) => p[0] * kx), ys = allPts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min((W - 2 * P) / Math.max(1e-9, maxX - minX), (H - 2 * P) / Math.max(1e-9, maxY - minY));
  const ox = (W - (maxX - minX) * sc) / 2, oy = (H - (maxY - minY) * sc) / 2;
  const X = (p) => (ox + (p[0] * kx - minX) * sc).toFixed(1); const Y = (p) => (oy + (maxY - p[1]) * sc).toFixed(1);
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'ss-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Карта трассы по секторам');
  const path = (pts, cls) => { const e = document.createElementNS(NS, 'path'); e.setAttribute('d', pts.map((p, i) => (i ? 'L' : 'M') + X(p) + ' ' + Y(p)).join(' ')); e.setAttribute('class', cls); return e; };
  svg.appendChild(path(sp.sectors.flat(), 'ss-under'));
  sp.sectors.forEach((pts, i) => {
    const cell = row?.cells?.[i];
    const tone = cell ? sectorTone(cell.d) : 'none';
    svg.appendChild(path(pts, 'ss-sec ' + tone));
  });
  // v134: подписи — вторым проходом, поверх всех линий (раньше следующий сектор перечёркивал подпись предыдущего)
  // и в свободном месте: перебираем точки сектора × 8 направлений, берём место, где рамка текста дальше всего от линий
  const scr = allPts.filter((_, k) => k % 2 === 0).map((p) => [+X(p), +Y(p)]);
  const placed = [];
  const boxDist = (x0, y0, w, h) => { let m = Infinity; for (const [px, py] of scr) { const dx = Math.max(x0 - px, 0, px - (x0 + w)); const dy = Math.max(y0 - py, 0, py - (y0 + h)); const d = Math.hypot(dx, dy); if (d < m) m = d; } for (const [bx, by, bw, bh] of placed) { const dx = Math.max(bx - (x0 + w), 0, x0 - (bx + bw)); const dy = Math.max(by - (y0 + h), 0, y0 - (by + bh)); if (dx === 0 && dy === 0) m -= 40; } return m; };
  sp.sectors.forEach((pts, i) => {
    const cell = row?.cells?.[i];
    const label = 'S' + (i + 1) + (cell ? ' ' + (cell.d <= 0 ? 'лучший' : ssDelta(cell.d)) : '');
    const w = label.length * 6.1 + 4, h = 13;
    let best = null;
    for (const f of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      const q = pts[Math.min(pts.length - 1, Math.floor(pts.length * f))]; const qx = +X(q), qy = +Y(q);
      for (let k = 0; k < 8; k++) {
        const ang = k * Math.PI / 4; const r = 13;
        const cx = qx + Math.cos(ang) * r, cy = qy + Math.sin(ang) * r;
        const x0 = Math.cos(ang) > 0.3 ? cx : Math.cos(ang) < -0.3 ? cx - w : cx - w / 2;
        const y0 = Math.sin(ang) > 0.3 ? cy : Math.sin(ang) < -0.3 ? cy - h : cy - h / 2;
        if (x0 < 3 || y0 < 3 || x0 + w > W - 3 || y0 + h > H - 3) continue;
        const sc2 = boxDist(x0, y0, w, h) - (f === 0.5 ? 0 : 0.6) - Math.abs(f - 0.5);
        if (!best || sc2 > best.sc) best = { sc: sc2, x0, y0 };
      }
    }
    const mid = pts[Math.floor(pts.length / 2)];
    const t = document.createElementNS(NS, 'text'); t.setAttribute('class', 'ss-lab');
    if (best) { t.setAttribute('x', (best.x0 + w / 2).toFixed(1)); t.setAttribute('y', (best.y0 + h - 3).toFixed(1)); placed.push([best.x0, best.y0, w, h]); }
    else { t.setAttribute('x', X(mid)); t.setAttribute('y', Y(mid)); t.setAttribute('dy', '-7'); }
    t.textContent = label;
    svg.appendChild(t);
  });
  const sf = document.createElementNS(NS, 'circle'); sf.setAttribute('cx', X(sp.sf)); sf.setAttribute('cy', Y(sp.sf)); sf.setAttribute('r', '4'); sf.setAttribute('class', 'ss-sf'); svg.appendChild(sf);
  host.appendChild(svg);
}
function ssSelect(n) {
  if (!_ssState) return;
  const { a, s } = _ssState;
  const row = a.laps.find((l) => l.n === n && l.cells) || null;
  _ssState.sel = row ? row.n : null;
  document.querySelectorAll('#ssTable tbody tr').forEach((tr) => tr.classList.toggle('sel', Number(tr.dataset.n) === _ssState.sel));
  ssDrawMap(s.trackId, s.dirPt, row);
}
function openSessionReview(idx) {
  const s = (state.trackDays || [])[idx]; if (!s) return;
  let pb = null; try { pb = personalBestSectors(s.trackId, null); } catch (_) {}
  const a = analyzeSession(s.laps, { pbSectors: pb });
  if (!a.ok) return;
  _ssState = { a, s };
  const tr = TRACKS.find((t) => t.id === s.trackId);
  const when = s.at ? new Date(s.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  document.getElementById('ssSub').textContent = [tr?.name || s.trackId, when, `${a.laps.length} ${padRu(a.laps.length, 'круг', 'круга', 'кругов')}`].filter(Boolean).join(' · ');
  document.getElementById('ssIdeal').textContent = ssFmt(a.idealMs);
  document.getElementById('ssIdealS').textContent = a.gainMs > 0 ? `на ${ssSec(a.gainMs)} с быстрее лучшего круга ${ssFmt(a.bestLapMs)}` : `лучший круг ${ssFmt(a.bestLapMs)} уже идеальный`;
  document.getElementById('ssLoss').textContent = a.worst.avgMs > 0 ? `S${a.worst.idx} · +${ssSec(a.worst.avgMs)} с` : 'ровно';
  // v134: где терял — красным, идеальный круг (быстрее лучшего) — зелёным
  document.getElementById('ssLoss').classList.toggle('ss-bad', a.worst.avgMs > 0);
  document.getElementById('ssIdeal').classList.toggle('ss-good', a.gainMs > 0);
  document.getElementById('ssLossS').textContent = a.worst.avgMs > 0 ? `в среднем за круг к лучшему S${a.worst.idx}, разброс ${ssSec(a.worst.spreadMs)} с` : 'сектора стабильны';
  const tb = document.querySelector('#ssTable tbody'); tb.replaceChildren();
  for (const l of a.laps) {
    const trEl = document.createElement('tr'); trEl.dataset.n = String(l.n);
    if (l.best) trEl.classList.add('best'); if (!l.inPool) trEl.classList.add('off');
    trEl.appendChild(padEl('td', 'ss-n', String(l.n)));
    for (let i = 0; i < 3; i++) {
      const c = l.cells?.[i];
      const td = padEl('td', c ? 'ss-c ' + sectorTone(c.d) : 'ss-c none', c ? ssSec(c.ms) : '');
      if (c && c.d > 0) td.appendChild(padEl('small', '', ssDelta(c.d)));
      trEl.appendChild(td);
    }
    trEl.appendChild(padEl('td', 'ss-t', ssFmt(l.ms) + (l.valid ? '' : ' *')));
    if (l.cells) { trEl.tabIndex = 0; trEl.addEventListener('click', () => ssSelect(l.n)); trEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') ssSelect(l.n); }); }
    tb.appendChild(trEl);
  }
  const ideal = document.createElement('tr'); ideal.className = 'ideal';
  ideal.appendChild(padEl('td', 'ss-n', 'идеал'));
  a.bestSec.forEach((v) => ideal.appendChild(padEl('td', 'ss-c', ssSec(v))));
  ideal.appendChild(padEl('td', 'ss-t', ssFmt(a.idealMs)));
  tb.appendChild(ideal);
  const last = [...a.laps].reverse().find((l) => l.cells && l.inPool);
  ssSelect(last ? last.n : a.bestLapN);
  const sh = document.getElementById('sessionSheet'); sh.classList.remove('hidden'); sh.setAttribute('aria-hidden', 'false');
}
function closeSessionReview() { const sh = document.getElementById('sessionSheet'); sh?.classList.add('hidden'); sh?.setAttribute('aria-hidden', 'true'); }
document.getElementById('sessionSheetClose')?.addEventListener('click', closeSessionReview);
document.getElementById('sessionSheet')?.addEventListener('click', (e) => { if (e.target?.id === 'sessionSheet') closeSessionReview(); });
document.getElementById('trackDayList')?.addEventListener('click', (e) => { const li = e.target?.closest?.('.td-review'); if (li) openSessionReview(Number(li.dataset.sess)); });
document.getElementById('trackDayList')?.addEventListener('keydown', (e) => { const li = e.target?.closest?.('.td-review'); if (li && e.key === 'Enter') openSessionReview(Number(li.dataset.sess)); });
window.__plSession = { open: (i) => openSessionReview(i || 0) };

/* ——— view enter hooks (called from goToView) ——— */
let _garageSeen = false;
function onViewEnter(id) {
  setTimeout(() => {
    try {
      if (id === 'home' && document.getElementById('view-home')) renderHome();
      else if (id === 'duels') void renderDuelsView();
      else if (id === 'tops') void renderTopsBoard();
      else if (id === 'garage') {
        // v119: three.js и сцена — при первом заходе в Бокс; модель — только выбранная
        mountPodium('garage'); const wasReady = false;
        void ensurePodium3d().then(() => {
          try { onResize(); } catch (_) {}
          try { podiumInvalidate(400, true); } catch (_) {}
          if (!_garageSeen) {
            _garageSeen = true;
            const m = MODEL_CATALOG.find((x) => x.id === podiumModelId);
            // первый вход: drive-in запускает сама загрузка модели (fitGlb); здесь — только если модель уже стояла
            if (wasReady && m?.driveIn && glbRoot) { try { startDriveIn(glbRoot, podiumModelId); } catch (_) {} }
          }
        });
      } else if (id === 'account') { void pfCta289();
      } else if (id === 'history') {
        if (!_jnKeep) { try { localStorage.setItem('pitlane-journal-f', 'all'); } catch (_) {} } _jnKeep = false;
        void renderJournal61(); try { void renderTrackHistory(); } catch (_) {} // v161
      } else if (id === 'lap') {
        void renderTrackHistory(); // v129
        // v119: карта (Leaflet) и chase Сочи (three.js) — подгружаем при входе на «Круг», чтобы HUD открылся как раньше
        void ensureLeaflet().catch(() => {});
        void ensureThree().then(() => { try { sochiChaseSync(); } catch (_) {} }).catch(() => {});
      }
    } catch (err) { console.warn('onViewEnter', id, err); }
  }, 0);
}

/* ——— Главная ——— */
let _hcIdx = 0; let _hcPos = 1; let _hcTimer = 0; let _hcPauseUntil = 0; let _hcHold = false; let _hcN = 0;
const HC_INTERVAL = 5000;
/** All slides incl. loop clones: [clone(last), 1..n, clone(first)] */
function hcSlides() { return [...document.querySelectorAll('#homeCarouselTrack .hc-slide')]; }
function hcGoPos(p, smooth = true) {
  const track = document.getElementById('homeCarouselTrack');
  if (!track || !_hcN) return;
  _hcPos = Math.max(0, Math.min(_hcN + 1, p));
  _hcIdx = ((_hcPos - 1) % _hcN + _hcN) % _hcN;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  track.scrollTo({ left: _hcPos * track.clientWidth, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  hcSyncDots();
}
function hcGo(i, smooth = true) { hcGoPos(i + 1, smooth); }
function hcSyncDots() {
  document.querySelectorAll('#homeCarouselDots .hc-dot').forEach((b, i) => {
    const on = i === _hcIdx;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  hcSlides().forEach((s, i) => s.classList.toggle('cur', i === _hcPos));
}
function hcPause(ms = 6000) { _hcPauseUntil = Date.now() + ms; }
/** Seamless loop: when we land on a clone, jump (no animation) to its real twin. */
function hcFixLoop() {
  const track = document.getElementById('homeCarouselTrack');
  if (!track || !_hcN) return;
  const w = track.clientWidth || 1;
  const p = Math.round(track.scrollLeft / w);
  if (p <= 0) hcGoPos(_hcN, false);
  else if (p >= _hcN + 1) hcGoPos(1, false);
}
function setupHomeCarousel() {
  const root = document.getElementById('homeCarousel');
  const track = document.getElementById('homeCarouselTrack');
  const dots = document.getElementById('homeCarouselDots');
  if (!root || !track || !dots || root.dataset.ready) return;
  root.dataset.ready = '1';
  const art = document.getElementById('hcTrackArt');
  if (art && !art.firstChild) art.appendChild(trackSilhouetteSvg('sochi', 160, 'hc-trk'));
  const sub = document.getElementById('hcTopsSub');
  if (sub) sub.textContent = TRACKS.length + ' трасс · ' + DRAG_DISC.length + ' дисциплин';
  const real = hcSlides();
  _hcN = real.length;
  if (_hcN > 1) {
    const mkClone = (el) => {
      const c = el.cloneNode(true);
      c.classList.add('hc-clone');
      c.setAttribute('aria-hidden', 'true');
      c.tabIndex = -1;
      c.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
      return c;
    };
    track.insertBefore(mkClone(real[_hcN - 1]), real[0]);
    track.appendChild(mkClone(real[0]));
  }
  dots.replaceChildren();
  real.forEach((s, i) => {
    const b = padEl('button', 'hc-dot');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', 'Слайд ' + (i + 1));
    b.addEventListener('click', () => { hcPause(); hcGo(i); });
    dots.appendChild(b);
  });
  let raf = 0; let settle = 0;
  track.addEventListener('scroll', () => {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        const w = track.clientWidth || 1;
        const p = Math.round(track.scrollLeft / w);
        if (p !== _hcPos) { _hcPos = p; _hcIdx = ((p - 1) % _hcN + _hcN) % _hcN; hcSyncDots(); }
      });
    }
    clearTimeout(settle);
    settle = setTimeout(() => { if (!_hcHold) hcFixLoop(); }, 160);
  }, { passive: true });
  const hold = () => { _hcHold = true; };
  const release = () => { _hcHold = false; hcPause(4000); clearTimeout(settle); settle = setTimeout(hcFixLoop, 400); };
  track.addEventListener('pointerdown', hold, { passive: true });
  track.addEventListener('touchstart', hold, { passive: true });
  ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseleave'].forEach((ev) => track.addEventListener(ev, release, { passive: true }));
  root.addEventListener('focusin', () => hcPause(8000));
  hcSlides().forEach((s) => s.addEventListener('click', () => {
    const go = s.dataset.go;
    if (go) { hap(10); goToView(go); }
  }));
  window.addEventListener('resize', () => hcGoPos(_hcPos, false), { passive: true });
  requestAnimationFrame(() => hcGoPos(1, false));
  clearInterval(_hcTimer);
  _hcTimer = setInterval(() => {
    if (_hcHold || document.hidden || Date.now() < _hcPauseUntil) return;
    if (!document.getElementById('view-home')?.classList.contains('active')) return;
    hcFixLoop();
    hcGoPos(_hcPos + 1);
  }, HC_INTERVAL);
}
/** v171: скелетон-заглушка вместо «Загружаем…» — n серых строк-карточек, пульсирует; aria-busy для скринридера */
function skel171(n = 3, label = 'Загрузка') {
  const w = document.createElement('div'); w.className = 'pl-skel-list'; w.setAttribute('aria-busy', 'true'); w.setAttribute('aria-label', label);
  for (let i = 0; i < n; i++) { const r = document.createElement('div'); r.className = 'pl-skel pl-skel-row'; r.style.animationDelay = (i * 120) + 'ms'; w.appendChild(r); }
  return w;
}

let _homePostsAt = 0;
async function renderHomeTopPosts(force = false) {
  const box = document.getElementById('homeTopPosts');
  if (!box) return;
  if (!force && Date.now() - _homePostsAt < 60000 && box.childElementCount) return;
  _homePostsAt = Date.now();
  if (!box.childElementCount) box.appendChild(skel171(3, 'Загружаем посты'));
  let rows = [];
  try { rows = await api.listPulseTopDay(); } catch (_) { rows = []; }
  box.replaceChildren();
  if (!Array.isArray(rows) || !rows.length) {
    const e = padEl('div', 'home-empty');
    e.appendChild(padEl('b', '', 'За сутки постов пока нет'));
    e.appendChild(padEl('span', '', 'Поделись сборкой или заездом — лучший пост дня появится здесь.'));
    const go = padEl('button', 'home-link', 'Открыть чат');
    go.type = 'button';
    go.dataset.view = 'pulse';
    e.appendChild(go);
    box.appendChild(e);
    return;
  }
  rows.slice(0, 5).forEach((p, i) => {
    const card = padEl('button', 'hp-card');
    card.type = 'button';
    card.dataset.post = p.id;
    card.appendChild(padEl('span', 'hp-rank', String(i + 1)));
    card.appendChild(padAvatar(p.who, p.avatar, 34));
    const mid = padEl('span', 'hp-mid');
    const head = padEl('span', 'hp-head');
    head.appendChild(padEl('b', 'hp-who', clipText(p.who || 'Пилот', 16)));
    head.appendChild(padEl('span', 'hp-ago', padAgo(p.at)));
    mid.appendChild(head);
    mid.appendChild(padEl('span', 'hp-text', p.text || (p.hasImg ? 'Фото' : '')));
    card.appendChild(mid);
    const st = padEl('span', 'hp-stats');
    const lk = padEl('span', 'hp-lk');
    lk.appendChild(padIcon('heart'));
    lk.appendChild(document.createTextNode(padCount(p.likeCount || 0)));
    st.appendChild(lk);
    const cm = padEl('span', 'hp-cm');
    cm.appendChild(padIcon('bubble'));
    cm.appendChild(document.createTextNode(padCount(p.commentCount || 0)));
    st.appendChild(cm);
    if (p.hasImg) st.appendChild(padEl('span', 'hp-img', 'фото'));
    card.appendChild(st);
    box.appendChild(card);
  });
}
async function openPostInPaddock(id) {
  goToView('pulse');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 120));
    const el = [...document.querySelectorAll('#pulseFeed [data-post]')].find((x) => x.dataset.post === id);
    if (el) {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      el.classList.add('pad-flash');
      setTimeout(() => el.classList.remove('pad-flash'), 1800);
      return;
    }
  }
}
/* ——— v85: насыщенная Главная — только реальные данные (локальные замеры, Worker-топы, контент кода) ——— */
function homeHeroCarId() {
  try { return podiumModelId || defaultPodiumId(); } catch (_) { return 'g87-m2'; }
}
/** v275: снимок личных рекордов текущей машины (только реальные, сохранённые локально) */
function r275PbSnap() {
  const id = currentCar()?.id; const o = {}; if (!id) return o;
  for (const st of [state.dragBest, state.dragBestC]) {
    const c = st?.[id]; if (!c) continue;
    for (const k of Object.keys(c)) { const t = Number(c[k]?.t); if (t > 0 && !(o[k] <= t)) o[k] = t; }
  }
  return o;
}
function r275Idle() {
  const el = document.getElementById('r275Pb'); if (!el) return;
  const pb = r275PbSnap(); const parts = [];
  if (pb['0-100'] > 0) parts.push('0–100 · PB ' + pb['0-100'].toFixed(2) + ' с');
  if (pb['402m'] > 0) parts.push('¼ мили · PB ' + pb['402m'].toFixed(2) + ' с');
  const t = parts.join('   |   ');
  if (el.textContent !== t) el.textContent = t; el.hidden = !t;
  const ph = document.getElementById('z61Gps')?.dataset.src === 'phone';
  const f = document.querySelector('#r275Ticks [data-k="60ft"]'); if (f) f.hidden = ph; // телефон 60 ft не меряет
}
function localDragBest(carId, disc) {
  const r = state.dragBest?.[carId]?.[disc];
  return r && Number.isFinite(Number(r.t)) ? r : null;
}
function recordLocalDragBest(carId, disc, t, gpsQ) {
  if (!carId || !(t > 0) || (gpsQ !== 'A' && gpsQ !== 'B' && gpsQ !== 'C')) return;
  // v118: зачёт C (телефон) — своё хранилище; на главной показывается с меткой «телефон · C», не «GPS A/B»
  const store = gpsQ === 'C' ? 'dragBestC' : 'dragBest';
  state[store] = state[store] || {};
  const car = (state[store][carId] = state[store][carId] || {});
  const prev = car[disc];
  if (!prev || t < Number(prev.t)) {
    car[disc] = { t: Number(t.toFixed(3)), at: Date.now(), gpsQ };
    try { save(); } catch (_) {}
  }
}
function passportBest(carId, mark) {
  const runs = state.passportGps?.[carId]?.[mark];
  if (!Array.isArray(runs)) return null;
  const ts = runs.filter((r) => r && (r.gpsQ === 'A' || r.gpsQ === 'B')).map((r) => Number(r.t)).filter((x) => Number.isFinite(x) && x > 0);
  return ts.length ? Math.min(...ts) : null;
}
function minDefined(...xs) {
  const a = xs.map(Number).filter((x) => Number.isFinite(x) && x > 0);
  return a.length ? Math.min(...a) : null;
}
function localBestLap() {
  let best = null;
  for (const [trackId, list] of Object.entries(state.laps || {})) {
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (!r || !r.gps || r.valid === false || !(r.ms > 0)) continue;
      if (!best || (r.at || 0) > (best.lastAt || 0)) best = { trackId, ms: r.ms, lastAt: r.at || 0 };
    }
  }
  if (!best) return null;
  const same = (state.laps[best.trackId] || []).filter((r) => r && r.gps && r.valid !== false && r.ms > 0);
  return { trackId: best.trackId, ms: Math.min(...same.map((r) => r.ms)) };
}
function localStats() {
  let laps = 0; const tracks = new Set();
  for (const [trackId, list] of Object.entries(state.laps || {})) {
    const v = (Array.isArray(list) ? list : []).filter((r) => r && r.gps && r.valid !== false && r.ms > 0);
    if (v.length) { laps += v.length; tracks.add(trackId); }
  }
  const slips = Array.isArray(state.slips) ? state.slips : [];
  let best0100 = null;
  for (const m of MODEL_CATALOG) best0100 = minDefined(best0100, passportBest(m.id, 'v0100'), localDragBest(m.id, '0-100')?.t);
  for (const c of state.garage || []) best0100 = minDefined(best0100, passportBest(c.id, 'v0100'));
  return { runs: slips.length, runsCapped: slips.length >= 20, laps, tracks: tracks.size, cars: (state.garage || []).length, best0100, slips };
}

let _homeCache = { at: 0 };
async function homeRemote() {
  if (Date.now() - _homeCache.at < 60000) return _homeCache;
  const pid = (() => { try { return accountPilotId(); } catch (_) { return null; } })();
  const [board, prof] = await Promise.all([
    isRemoteApi() ? api.listDrag('0-100', {}).catch(() => []) : Promise.resolve([]),
    pid && isPublicPilot(pid) && isRemoteApi() ? api.pilotProfile(pid).catch(() => null) : Promise.resolve(null),
  ]);
  _homeCache = { at: Date.now(), board: Array.isArray(board) ? board : [], prof: prof && prof.best ? prof : null, pid };
  return _homeCache;
}

function homeStatTile(k, v, sub, cls = '', unit = '') {
  const t = padEl('div', 'hh-stat ' + cls);
  t.appendChild(padEl('span', 'hh-k', k));
  const b = padEl('b', 'hh-v', v);
  if (unit) b.appendChild(padEl('small', 'hh-u', unit));
  t.appendChild(b);
  if (sub) t.appendChild(padEl('span', 'hh-s', sub));
  return t;
}
async function renderHomeHero() {
  const id = homeHeroCarId();
  const m = MODEL_CATALOG.find((x) => x.id === id) || MODEL_CATALOG[0];
  if (!m) return;
  const img = document.getElementById('homeHeroImg');
  const heroSrc = carThumbUrl(m.id); // v154: без статичных hero-рендеров
  if (img && img.dataset.car !== m.id + '|' + heroSrc) {
    img.dataset.car = m.id + '|' + heroSrc; img.onerror = null;
    fillCarImg293(img, m.id, m.name);
  }
  const hero = document.getElementById('homeHero');
  if (hero) hero.dataset.car = m.id;
  const nm = document.getElementById('homeHeroName');
  if (nm) nm.textContent = m.name;
  const sub = document.getElementById('homeHeroSub');
  let cls = '';
  try { cls = (CARS.find((c) => c.id === m.id)?.cls) || ''; } catch (_) {}
  if (sub) sub.textContent = [m.year, cls].filter(Boolean).join(' · ');
  const box = document.getElementById('homeHeroStats');
  if (!box) return;
  const draw = (remote) => {
    const drag = remote?.prof?.best?.drag || {};
    const srv = (disc) => (drag[disc] && (!drag[disc].carId || drag[disc].carId === m.id)) ? Number(drag[disc].t) : null;
    const b0100 = minDefined(passportBest(m.id, 'v0100'), localDragBest(m.id, '0-100')?.t, srv('0-100'));
    const bQ = minDefined(localDragBest(m.id, '402m')?.t, srv('402m'));
    const lap = localBestLap();
    let rank = null;
    if (remote?.pid && remote.board?.length) {
      const i = remote.board.findIndex((r) => r.pilotId === remote.pid);
      if (i >= 0) rank = { n: i + 1, of: remote.board.length };
    }
    box.replaceChildren();
    const tiles = [];
    const c0100 = Number(state.dragBestC?.[m.id]?.['0-100']?.t);
    if (b0100 != null) tiles.push(homeStatTile('0–100 км/ч', b0100.toFixed(2), 'GPS A/B', '', 'с'));
    else if (c0100 > 0) tiles.push(homeStatTile('0–100 км/ч', c0100.toFixed(2), 'телефон · C', '', 'с')); // v118
    if (bQ != null) tiles.push(homeStatTile('¼ мили', bQ.toFixed(2), '402 м', '', 'с'));
    if (lap) tiles.push(homeStatTile('Лучший круг', fmtLapTime(lap.ms), clipText(trackShortName(lap.trackId), 14)));
    if (rank) tiles.push(homeStatTile('Топ 0–100', '#' + rank.n, 'из ' + rank.of, 'hh-rank'));
    if (!tiles.length) {
      // v86: аккуратное пустое состояние — «призрачные» рекорды + подсказка
      const main = homeStatTile('0–100 км/ч', '—', 'GPS A/B', 'hh-main ghost', 'с');
      box.appendChild(main);
      const row = padEl('div', 'hh-row');
      row.appendChild(homeStatTile('¼ мили', '—', '402 м', 'ghost'));
      row.appendChild(homeStatTile('Лучший круг', '—', 'GPS-круг', 'ghost'));
      row.appendChild(homeStatTile('Топ 0–100', '—', 'место', 'ghost'));
      box.appendChild(row);
      const cta = padEl('p', 'hh-cta');
      cta.appendChild(padEl('b', '', 'Сделай первый замер.'));
      cta.appendChild(document.createTextNode(' Здесь появятся твои рекорды: внешний GPS — зачёт A/B, телефон — зачёт C.'));
      box.appendChild(cta);
      document.getElementById('homeHero')?.classList.add('empty');
      return;
    }
    document.getElementById('homeHero')?.classList.remove('empty');
    tiles[0].classList.add('hh-main');
    box.appendChild(tiles[0]);
    if (tiles.length > 1) {
      const row = padEl('div', 'hh-row');
      tiles.slice(1).forEach((t) => row.appendChild(t));
      box.appendChild(row);
    }
  };
  draw(null);
  try { draw(await homeRemote()); } catch (_) {}
}

async function fetchMyDuels() {
  if (DUELS_OFF) return []; // v197: дуэли убраны
  if (!isRemoteApi()) return [];
  let rows = [];
  try { rows = (await api.listMyDuels(duelPilotId())) || []; } catch (_) { rows = []; }
  const have = new Set(rows.map((d) => d.id));
  const extra = inboxDuelIds().filter((id) => !have.has(id)).slice(0, 8);
  const got = await Promise.all(extra.map((id) => api.getDuel(id).catch(() => null)));
  got.forEach((d) => { if (d && d.id) rows.push(d); });
  return rows.filter((d) => d && d.id);
}
async function renderHomeDuels() {
  if (DUELS_OFF) { const sec = document.getElementById('homeDuelsSec'); if (sec) sec.hidden = true; return; } // v197
  const box = document.getElementById('homeDuels');
  if (!box) return;
  let rows = [];
  try { rows = await fetchMyDuels(); } catch (_) { rows = []; }
  const order = { inbox: 0, active: 1, done: 2 };
  rows = rows.filter((d) => duelCategory(d) !== 'done' || (Date.now() - (d.createdAt || 0)) < 3 * 86400000)
    .sort((a, b) => order[duelCategory(a)] - order[duelCategory(b)] || (b.createdAt || 0) - (a.createdAt || 0));
  box.replaceChildren();
  showWhen('homeDuelsSec', rows.length > 0); // v120: пустую «Мои дуэли» не показываем (вызов — плитка «Дуэль»)
  if (!rows.length) {
    const e = padEl('button', 'home-duel-empty');
    e.type = 'button';
    e.dataset.hq = 'duel';
    const art = padEl('span', 'hde-art');
    art.setAttribute('aria-hidden', 'true');
    ['g87-m2', 'gt3rs'].forEach((cid, i) => {
      const im = document.createElement('img');
      im.alt = ''; im.loading = 'lazy'; im.className = 'hde-car hde-car-' + (i ? 'r' : 'l');
      art.appendChild(im); if (carThumbUrl(cid)) im.src = carThumbUrl(cid); else { im.hidden = true; art.appendChild(carPh289(CARS.find((c) => c.id === cid)?.name || '')); }
    });
    art.appendChild(padEl('span', 'hde-vs', 'VS'));
    e.appendChild(art);
    const tx = padEl('span', 'hde-txt');
    tx.appendChild(padEl('b', '', 'Брось первый вызов'));
    tx.appendChild(padEl('span', '', '0–100 или круг — отправь ссылку другу, победит честный GPS.'));
    tx.appendChild(padEl('span', 'hde-go', 'Вызвать →'));
    e.appendChild(tx);
    box.appendChild(e);
    box.classList.add('single');
    return;
  }
  box.classList.remove('single');
  rows.slice(0, 6).forEach((d) => box.appendChild(buildDuelCard(d)));
}


/** v92: SVG race-path for home «Трасса дня» overlay (matches map centerline: sochi=outline, else TRACK_SVG). */
function homeTrackRacePathD(trackId, vbW = 640, vbH = 360) {
  const padX = vbW * 0.09, padY = vbH * 0.08;
  const box = { x: padX, y: padY, w: vbW - padX * 2, h: vbH * 0.72 };
  let pts = null;
  const o = TRACK_OUTLINES?.[trackId];
  const useOutline = trackId === 'sochi' && o && Array.isArray(o.coords) && o.coords.length > 40;
  if (useOutline) {
    const mid = o.coords.reduce((a, c) => a + c[1], 0) / o.coords.length;
    const k = Math.cos(mid * Math.PI / 180);
    pts = o.coords.map(([lo, la]) => [lo * k, -la]);
  } else {
    const d = TRACK_SVG[trackId] || TRACK_SVG.sochi;
    if (d && typeof document !== 'undefined') {
      try {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        const len = path.getTotalLength() || 1;
        pts = [];
        const n = 120;
        for (let i = 0; i <= n; i++) {
          const p = path.getPointAtLength((i / n) * len);
          pts.push([p.x, p.y]);
        }
      } catch (_) { pts = null; }
    }
  }
  if (!pts || pts.length < 3) {
    const sil = trackSilhouettePath(trackId, 32, 2);
    return sil || '';
  }
  // light isometric (same spirit as v91 maps)
  const shear = 0.22, squash = 0.82, cy = 0;
  const midY = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  pts = pts.map(([x, y]) => {
    const dy = y - midY;
    return [x + dy * shear * 0.35, midY + dy * squash];
  });
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const sc = Math.min(box.w / Math.max(1e-6, x1 - x0), box.h / Math.max(1e-6, y1 - y0));
  const ox = box.x + (box.w - (x1 - x0) * sc) / 2;
  const oy = box.y + (box.h - (y1 - y0) * sc) / 2;
  const mapped = pts.map(([x, y]) => [ox + (x - x0) * sc, oy + (y - y0) * sc]);
  return mapped.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('') + 'Z';
}


/* ═══════════ v96: Sochi chase-navigator on «Круг» (Three.js, independent of podium) ═══════════
 * v94–v95 lived on Home «Трасса дня»; v96 moves it to the lap screen:
 *  - lap card (#lapTrackChase): main view for Sochi, toggle «сзади / сверху» (top = classic map)
 *  - live lap HUD (#lapDriveChase): button «Сзади 3D»; real GPS (phone / BLE chip / sim) drives the car
 *  - no live fix → demo lap around the circuit
 *  - other tracks / prefers-reduced-motion → top map only
 *  - render paused off-screen (other tab, HUD closed, document hidden)
 * One renderer + scene, canvas re-parented between hosts. */
/* v100: the car is driven ONLY by the real GPS fix (chase-match.js: map-matching with continuity,
 * stop < 2 km/h, ≤ 0.5 s prediction, «Вы не на треке» > 150 m). No fix → parked on S/F + «Включить GPS»;
 * the demo lap runs only after an explicit «Демо» tap. */
const sochiChase = {
  view: 'chase', // lap-card mode: 'chase' | 'top'
  curView: 'zamer',
  running: false,
  raf: 0,
  t0: 0,
  dur: 11,
  renderer: null,
  scene: null,
  camera: null,
  car: null,
  curve: null,
  samples: null,
  proj: null,
  host: null,
  canvas: null,
  ro: null,
  frozen: false,
  live: null, // legacy (v96) — unused since v100
  disp: null, // last rendered { x, z, h }
  state: '', // 'idle' | 'stopped' | 'moving' | 'lost' | 'far' | 'demo'
  tracker: null, // chase-match tracker (GPS → centreline)
  sfS: 0, // arc length of the S/F line
  demo: false, // explicit «Демо» only
  gpsOwn: false, // GPS watch started by «Включить GPS» (stopped again when leaving «Трек»)
  lastFrameAt: 0,
  lastFixTs: 0,
  hudAt: 0,
  frame: null,
};

function sochiReduceMotion() {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

function sochiCenterlineXZ() {
  const o = TRACK_OUTLINES?.sochi;
  if (!o?.coords?.length) return null;
  const midLat = o.coords.reduce((a, c) => a + c[1], 0) / o.coords.length;
  const midLon = o.coords.reduce((a, c) => a + c[0], 0) / o.coords.length;
  const k = Math.cos(midLat * Math.PI / 180);
  const mPerDeg = 111320;
  sochiChase.proj = { midLat, midLon, k, mPerDeg };
  const pts = o.coords.map(([lo, la]) => new THREE.Vector3((lo - midLon) * mPerDeg * k, 0, -(la - midLat) * mPerDeg));
  const cleaned = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (cleaned[cleaned.length - 1].distanceTo(pts[i]) > 2) cleaned.push(pts[i]);
  }
  if (cleaned.length < 8) return null;
  if (cleaned[0].distanceTo(cleaned[cleaned.length - 1]) > 5) cleaned.push(cleaned[0].clone());
  return cleaned;
}

/** lat/lon → scene XZ (same projection as the centreline). */
function sochiProject(lat, lon) {
  if (!sochiChase.proj) sochiCenterlineXZ();
  const p = sochiChase.proj;
  if (!p) return null;
  return { x: (lon - p.midLon) * p.mPerDeg * p.k, z: -(lat - p.midLat) * p.mPerDeg };
}

function sochiEnsureCurve() {
  if (sochiChase.curve) return sochiChase.curve;
  const pts = sochiCenterlineXZ();
  if (!pts) return null;
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.15);
  sochiChase.curve = curve;
  const N = 900;
  const s = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    s[i * 4] = p.x; s[i * 4 + 1] = p.z; s[i * 4 + 2] = tan.x; s[i * 4 + 3] = tan.z;
  }
  sochiChase.samples = s;
  try {
    const L = curve.getLength();
    const tr = createChaseTracker(s, L);
    const sf = TRACK_OUTLINES?.sochi?.sf;
    const sp = Array.isArray(sf) ? sochiProject(sf[1], sf[0]) : null;
    sochiChase.sfS = sp ? tr.nearestS(sp.x, sp.z) : 0;
    tr.setSF(sochiChase.sfS);
    sochiChase.tracker = tr;
  } catch (_) { sochiChase.tracker = null; }
  return curve;
}

/** Nearest centreline sample → { d, tx, tz }. */
function sochiNearest(x, z) {
  const s = sochiChase.samples;
  if (!s) return null;
  let best = Infinity; let bi = 0;
  for (let i = 0; i < s.length; i += 4) {
    const dx = s[i] - x; const dz = s[i + 1] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; bi = i; }
  }
  return { d: Math.sqrt(best), tx: s[bi + 2], tz: s[bi + 3] };
}

function angWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Feed one live GPS fix (phone, BLE chip or simulator) into the map-matcher. */
function sochiChaseFeedGps(lat, lon, vKmh, extra = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (!sochiEnsureCurve() || !sochiChase.tracker) return;
  // watchPosition + the 400 ms getCurrentPosition poll can hand over the same fix twice → feed it once
  if (extra.ts != null) {
    if (sochiChase.lastFixTs && extra.ts <= sochiChase.lastFixTs) return;
    sochiChase.lastFixTs = extra.ts;
  }
  const p = sochiProject(lat, lon);
  if (!p) return;
  // speed: Doppler (coords.speed, phone or chip) → filtered speed → (null) regression inside the matcher
  let speedMs = null;
  const dop = extra.speed;
  if (dop != null && Number.isFinite(Number(dop)) && Number(dop) >= 0) speedMs = Number(dop);
  else if (vKmh != null && Number.isFinite(Number(vKmh))) speedMs = Math.max(0, Number(vKmh) / 3.6);
  const hd = extra.heading;
  const acc = extra.acc != null && Number.isFinite(Number(extra.acc)) ? Number(extra.acc) : null;
  sochiChase.tracker.feed({ x: p.x, z: p.z, t: performance.now() / 1000, speedMs, headingDeg: hd != null && Number.isFinite(Number(hd)) ? Number(hd) : null, acc });
}

function sochiRibbonGeo(curve, halfW, y = 0.02, segs = 280) {
  const pos = [];
  const norm = [];
  const uv = [];
  const idx = [];
  const N = segs;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const L = p.clone().addScaledVector(side, halfW); L.y = y;
    const R = p.clone().addScaledVector(side, -halfW); R.y = y;
    pos.push(L.x, L.y, L.z, R.x, R.y, R.z);
    norm.push(0, 1, 0, 0, 1, 0);
    uv.push(0, t * 20, 1, t * 20);
    if (i < N) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d); // v96: CCW from above → faces +Y (was facing down → dark asphalt)
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** InstancedMesh from a list of { x, y, z, yaw } (one draw call instead of hundreds). */
function sochiInstanced(geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const d = new THREE.Object3D();
  list.forEach((o, i) => {
    d.position.set(o.x, o.y, o.z);
    d.rotation.set(0, o.yaw || 0, 0);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
  });
  im.count = list.length;
  im.instanceMatrix.needsUpdate = true;
  return im;
}

function sochiCurbMarks(curve, halfW, scene) {
  const matW = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.7, metalness: 0.05 });
  const matR = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.7, metalness: 0.05 });
  const box = new THREE.BoxGeometry(1.6, 0.08, 0.45);
  const lw = []; const lr = [];
  for (let i = 0; i < 48; i++) {
    const t = i / 48;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const c2 = curve.getPointAt((t + 0.01) % 1);
    const c0 = curve.getPointAt((t + 0.99) % 1);
    const ang = Math.abs(Math.atan2(c2.z - p.z, c2.x - p.x) - Math.atan2(p.z - c0.z, p.x - c0.x));
    const bend = Math.min(ang, Math.PI * 2 - ang);
    if (bend < 0.18) continue;
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (const sgn of [1, -1]) {
      const pos = p.clone().addScaledVector(side, sgn * (halfW + 0.15));
      ((i % 2) ? lr : lw).push({ x: pos.x, y: 0.06, z: pos.z, yaw: Math.atan2(tan.x, tan.z) });
    }
  }
  if (lw.length) scene.add(sochiInstanced(box, matW, lw));
  if (lr.length) scene.add(sochiInstanced(box, matR, lr));
}

/** Vertical strip along the track at lateral offset (Armco W-beam rail). */
function sochiWallStrip(curve, offset, y0, y1, segs) {
  const pos = []; const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t % 1);
    const tan = curve.getTangentAt(t % 1).normalize();
    const sx = -tan.z * offset; const sz = tan.x * offset;
    pos.push(p.x + sx, y0, p.z + sz, p.x + sx, y1, p.z + sz);
    if (i < segs) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Racing barriers both sides: continuous red/white blocks at the track edge + steel Armco (2 rails + posts) behind. */
function sochiArmcoBarriers(curve, halfW, scene) {
  const L = curve.getLength();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd6d6d6, roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.4, metalness: 0.7 });
  const red = new THREE.MeshLambertMaterial({ color: 0xd32f2f });
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  // red/white blocks, 3 m each, continuous
  const segM = 3;
  const nb = Math.max(60, Math.round(L / segM));
  const blockGeo = new THREE.BoxGeometry(0.7, 0.6, (L / nb) * 0.97);
  const reds = []; const whites = [];
  for (let i = 0; i < nb; i++) {
    const t = (i + 0.5) / nb;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const yaw = Math.atan2(tan.x, tan.z);
    for (const sgn of [1, -1]) {
      const o = sgn * (halfW + 0.75);
      ((i % 2) ? reds : whites).push({ x: p.x - tan.z * o, y: 0.3, z: p.z + tan.x * o, yaw });
    }
  }
  scene.add(sochiInstanced(blockGeo, red, reds));
  scene.add(sochiInstanced(blockGeo, white, whites));
  // Armco: two continuous W-beam rails + posts every 4 m
  const segs = Math.max(400, Math.round(L / 4));
  for (const sgn of [1, -1]) {
    const o = sgn * (halfW + 1.3);
    scene.add(new THREE.Mesh(sochiWallStrip(curve, o, 0.66, 0.88, segs), steel));
    scene.add(new THREE.Mesh(sochiWallStrip(curve, o, 0.98, 1.2, segs), steel));
  }
  const postGeo = new THREE.BoxGeometry(0.14, 1.3, 0.14);
  const posts = [];
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    for (const sgn of [1, -1]) {
      const o = sgn * (halfW + 1.42);
      posts.push({ x: p.x - tan.z * o, y: 0.65, z: p.z + tan.x * o, yaw: Math.atan2(tan.x, tan.z) });
    }
  }
  scene.add(sochiInstanced(postGeo, steelDark, posts));
}

/** Volumetric white chase “car”: nose = local +Z (forward along tangent). */
function makeSochiChaseCar() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35,
    roughness: 0.28, metalness: 0.2,
  });
  const matShade = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0, emissive: 0xdddddd, emissiveIntensity: 0.12,
    roughness: 0.38, metalness: 0.15,
  });
  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.55, 0.7), matShade);
  rear.position.set(0, 0.4, -0.55);
  g.add(rear);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.5, 0.85), mat);
  mid.position.set(0, 0.42, 0.15);
  g.add(mid);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.35, 4), mat);
  nose.rotation.x = Math.PI / 2; // apex → +Z (nose forward)
  nose.rotation.y = Math.PI / 4;
  nose.position.set(0, 0.4, 1.15);
  g.add(nose);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.65), matShade);
  cab.position.set(0, 0.78, -0.05);
  g.add(cab);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.1, 0.32), mat);
  wing.position.set(0, 0.72, -0.95);
  g.add(wing);
  const light = new THREE.PointLight(0xffffff, 1.6, 24, 2);
  light.position.set(0, 1.0, 0.3);
  g.add(light);
  return g;
}

function sochiChaseResize() {
  const host = sochiChase.host;
  const ren = sochiChase.renderer;
  const cam = sochiChase.camera;
  if (!host || !ren || !cam) return;
  const w = Math.max(2, host.clientWidth);
  const h = Math.max(2, host.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  ren.setPixelRatio(dpr);
  ren.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}

function sochiChaseSample(u) {
  const curve = sochiChase.curve;
  if (!curve) return null;
  const L = sochiChase.tracker?.length || curve.getLength();
  const t = ((((u + (sochiChase.sfS || 0) / L) % 1) + 1) % 1);
  const p = curve.getPointAt(t);
  const tan = curve.getTangentAt(t).normalize();
  return { p, tan, t };
}

/** Place car at (x,z) facing heading h (rad, atan2(dx,dz)), camera behind + above. */
function sochiChasePose(x, z, h, snap, dt = 1 / 60) {
  if (!sochiChase.camera || !sochiChase.car) return;
  sochiChase.car.position.set(x, 0.02, z);
  sochiChase.car.rotation.y = h;
  const fx = Math.sin(h); const fz = Math.cos(h);
  const back = 11; const up = 4.4; const lookAhead = 24;
  const camPos = new THREE.Vector3(x - fx * back, up, z - fz * back);
  const look = new THREE.Vector3(x + fx * lookAhead, 0.4, z + fz * lookAhead);
  if (snap) sochiChase.camera.position.copy(camPos);
  else sochiChase.camera.position.lerp(camPos, 1 - Math.exp(-dt / 0.09)); // frame-rate independent follow
  sochiChase.camera.lookAt(look);
}

function sochiChaseApplyCam(u, snap, dt) {
  const s = sochiChaseSample(u);
  if (!s) return;
  sochiChasePose(s.p.x, s.p.z, Math.atan2(s.tan.x, s.tan.z), snap || sochiChase.frozen, dt);
  sochiChase.disp = { x: s.p.x, z: s.p.z, h: Math.atan2(s.tan.x, s.tan.z) };
}

const SOCHI_CHASE_TAG = {
  idle: 'нет GPS', stopped: 'GPS · стоим', moving: 'GPS · live', lost: 'GPS · нет сигнала', far: 'GPS · вне трассы', demo: 'демо-круг',
};
function sochiChaseSetState(st) {
  if (sochiChase.state === st) return;
  sochiChase.state = st;
  document.querySelectorAll('.chase-tag').forEach((el) => {
    el.textContent = SOCHI_CHASE_TAG[st] || '';
    el.classList.toggle('live', st === 'moving' || st === 'stopped');
  });
  const note = st === 'far' ? 'Вы не на треке' : st === 'lost' ? 'Сигнал GPS пропал — держим последнюю точку' : st === 'idle' ? 'Машина стоит на старте. Включите GPS — она поедет вместе с вами.' : '';
  const gpsWatching = run.watchId != null || !!extGps?.active?.();
  document.querySelectorAll('[data-chase-note]').forEach((el) => { el.textContent = note; el.classList.toggle('hidden', !note); });
  document.querySelectorAll('[data-chase-act="gps"]').forEach((b) => {
    const show = (st === 'idle' || st === 'lost') && !lapDrive.open;
    b.classList.toggle('hidden', !show);
    b.textContent = gpsWatching ? 'Ищем спутники…' : 'Включить GPS';
    b.disabled = gpsWatching;
  });
  document.querySelectorAll('[data-chase-act="demo"]').forEach((b) => {
    const show = st === 'idle' || st === 'far' || st === 'demo';
    b.classList.toggle('hidden', !show);
    b.textContent = st === 'demo' ? 'Стоп демо' : 'Демо';
    b.setAttribute('aria-pressed', st === 'demo' ? 'true' : 'false');
  });
  document.querySelectorAll('.lt-chase, .lap-drive-chase').forEach((h) => { h.dataset.chaseState = st; });
}

function sochiChaseHud(f, now) {
  if (now - sochiChase.hudAt < 200) return;
  sochiChase.hudAt = now;
  const live = f && f.state !== 'idle' && f.state !== 'demo';
  const kmh = live ? Math.round(f.kmh || 0) : 0;
  const acc = live && f.acc != null ? Math.round(f.acc) : null;
  document.querySelectorAll('[data-chase-v]').forEach((el) => { el.textContent = String(kmh); });
  document.querySelectorAll('[data-chase-acc]').forEach((el) => {
    el.textContent = acc != null ? `GPS ±${acc} м` : 'GPS —';
    el.classList.toggle('good', acc != null && acc <= 6);
    el.classList.toggle('poor', acc != null && acc > 15);
  });
}

function sochiChaseTick(now) {
  if (!sochiChase.running || !sochiChase.renderer) return;
  sochiChase.raf = requestAnimationFrame(sochiChaseTick);
  const dt = sochiChase.lastFrameAt ? Math.min(0.1, Math.max(0.001, (now - sochiChase.lastFrameAt) / 1000)) : 1 / 60;
  sochiChase.lastFrameAt = now;
  if (sochiChase.frozen) {
    sochiChase.renderer.render(sochiChase.scene, sochiChase.camera);
    return;
  }
  const f = sochiChase.tracker ? sochiChase.tracker.frame(performance.now() / 1000, dt) : null;
  sochiChase.frame = f;
  // a real fix always wins over the demo
  if (sochiChase.demo && f && (f.state === 'moving' || f.state === 'stopped')) sochiChase.demo = false;
  if (sochiChase.demo) {
    sochiChaseSetState('demo');
    if (!sochiChase.t0) sochiChase.t0 = now;
    sochiChaseApplyCam(((now - sochiChase.t0) / 1000) / sochiChase.dur, false, dt);
    sochiChaseHud(null, now);
  } else if (f) {
    sochiChaseSetState(f.state);
    const snap = !sochiChase.disp || Math.hypot(f.x - sochiChase.disp.x, f.z - sochiChase.disp.z) > 80;
    sochiChasePose(f.x, f.z, f.h, snap, dt);
    sochiChase.disp = { x: f.x, z: f.z, h: f.h };
    sochiChaseHud(f, now);
  }
  sochiChase.renderer.render(sochiChase.scene, sochiChase.camera);
}

/** Build renderer + scene once (no host yet). */
function sochiChaseBuild() {
  if (sochiChase.renderer) return true;
  if (typeof THREE === 'undefined') return false;
  const curve = sochiEnsureCurve();
  if (!curve) return false;

  const canvas = document.createElement('canvas');
  canvas.className = 'chase-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  sochiChase.canvas = canvas;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  } catch (_) { sochiChase.canvas = null; return false; }
  renderer.setClearColor(0x0c0c0c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  sochiChase.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0c0c);
  scene.fog = new THREE.FogExp2(0x101010, 0.0032);
  sochiChase.scene = scene;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.2, 400);
  sochiChase.camera = camera;

  scene.add(new THREE.AmbientLight(0xc0c4cc, 0.95));
  scene.add(new THREE.HemisphereLight(0xd0d6e0, 0x3a3a3a, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.55);
  key.position.set(40, 80, 20);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd0d4dc, 0.35);
  fill.position.set(-30, 20, -10);
  scene.add(fill);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  const halfW = 6.2;
  // grass verge, then normal grey asphalt (road surface) — ribbons face +Y so the key light reaches them
  scene.add(new THREE.Mesh(sochiRibbonGeo(curve, halfW + 6, 0.005, 400), new THREE.MeshLambertMaterial({ color: 0x2c3a2a })));
  scene.add(new THREE.Mesh(sochiRibbonGeo(curve, halfW, 0.04, 600), new THREE.MeshLambertMaterial({ color: 0x8a8a8a })));
  scene.add(new THREE.Mesh(sochiRibbonGeo(curve, halfW * 0.62, 0.045, 600), new THREE.MeshLambertMaterial({ color: 0x969696 })));
  {
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.05 });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.65, metalness: 0.05 });
    const dashes = []; const edges = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const yaw = Math.atan2(tan.x, tan.z);
      if (i % 2 === 0) dashes.push({ x: p.x, y: 0.06, z: p.z, yaw });
      for (const sgn of [1, -1]) {
        const ep = p.clone().addScaledVector(side, sgn * (halfW - 0.25));
        edges.push({ x: ep.x, y: 0.055, z: ep.z, yaw });
      }
    }
    scene.add(sochiInstanced(new THREE.BoxGeometry(0.22, 0.045, 2.4), dashMat, dashes));
    scene.add(sochiInstanced(new THREE.BoxGeometry(0.16, 0.04, 3.5), edgeMat, edges));
  }
  try { sochiArmcoBarriers(curve, halfW, scene); } catch (_) {}
  try { sochiCurbMarks(curve, halfW, scene); } catch (_) {}
  {
    const u0 = (sochiChase.sfS || 0) / (sochiChase.tracker?.length || curve.getLength());
    const p0 = curve.getPointAt(u0);
    const tan = curve.getTangentAt(u0).normalize();
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const gateMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
    const post = new THREE.BoxGeometry(0.35, 3.2, 0.35);
    for (const sgn of [-1, 1]) {
      const m = new THREE.Mesh(post, gateMat);
      m.position.copy(p0).addScaledVector(side, sgn * (halfW + 0.8));
      m.position.y = 1.6;
      scene.add(m);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 2.2, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25 }));
    beam.position.copy(p0); beam.position.y = 3.1;
    beam.rotation.y = Math.atan2(tan.x, tan.z);
    scene.add(beam);
    const chk = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, 2.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
    chk.rotation.x = -Math.PI / 2;
    chk.position.copy(p0); chk.position.y = 0.04;
    chk.rotation.z = Math.atan2(tan.x, tan.z);
    scene.add(chk);
  }
  const car = makeSochiChaseCar();
  scene.add(car);
  sochiChase.car = car;
  sochiChaseApplyCam(0, true);
  sochiChaseSetState('idle');
  return true;
}

function sochiChaseHalt() {
  sochiChase.running = false;
  if (sochiChase.raf) { try { cancelAnimationFrame(sochiChase.raf); } catch (_) {} sochiChase.raf = 0; }
}

/** Full teardown (WebGL context freed). */
function stopSochiChase() {
  sochiChaseHalt();
  if (sochiChase.ro) { try { sochiChase.ro.disconnect(); } catch (_) {} sochiChase.ro = null; }
  if (sochiChase.renderer) {
    try {
      sochiChase.scene?.traverse((o) => {
        if (o.geometry) try { o.geometry.dispose(); } catch (_) {}
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { try { m.dispose(); } catch (_) {} });
      });
    } catch (_) {}
    try { sochiChase.renderer.dispose(); } catch (_) {}
    try { sochiChase.renderer.forceContextLoss?.(); } catch (_) {}
  }
  if (sochiChase.canvas?.parentNode) sochiChase.canvas.parentNode.removeChild(sochiChase.canvas);
  Object.assign(sochiChase, { renderer: null, scene: null, camera: null, car: null, canvas: null, host: null, disp: null });
}

function sochiChaseAttach(host) {
  if (!host || !sochiChase.canvas) return;
  if (sochiChase.host !== host || sochiChase.canvas.parentNode !== host) {
    host.prepend(sochiChase.canvas);
    sochiChase.host = host;
    if (sochiChase.ro) { try { sochiChase.ro.disconnect(); } catch (_) {} sochiChase.ro = null; }
    if (typeof ResizeObserver !== 'undefined') {
      sochiChase.ro = new ResizeObserver(() => sochiChaseResize());
      sochiChase.ro.observe(host);
    }
  }
  sochiChaseResize();
}

function lapCardTrackId() {
  return document.getElementById('trackSelect')?.value || state.trackId || '';
}
function lapDriveTrackId() {
  return lapRun.trackId || lapCardTrackId();
}

/** Single source of truth: which host is visible, whether to render. Cheap; call on any relevant change. */
function sochiChaseSync() {
  const reduce = sochiReduceMotion();
  const can = typeof THREE !== 'undefined' && !!TRACK_OUTLINES?.sochi;
  // —— lap card ——
  const cardSochi = can && !reduce && lapCardTrackId() === 'sochi';
  const modeEl = document.getElementById('lapTrackMode');
  const cardHost = document.getElementById('lapTrackChase');
  const mapEl = document.getElementById('trackMap');
  const cardChase = cardSochi && sochiChase.view === 'chase';
  modeEl?.classList.toggle('hidden', !cardSochi);
  modeEl?.querySelectorAll('[data-lt-mode]').forEach((b) => {
    const on = b.getAttribute('data-lt-mode') === sochiChase.view;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  cardHost?.classList.toggle('hidden', !cardChase);
  cardHost?.setAttribute('aria-hidden', cardChase ? 'false' : 'true');
  mapEl?.classList.toggle('lt-under-chase', cardChase);
  // —— live HUD ——
  const driveSochi = can && !reduce && lapDriveTrackId() === 'sochi';
  const btn = document.getElementById('btnMapChase');
  btn?.classList.toggle('hidden', !driveSochi);
  if (!driveSochi && lapDrive.mapMode === 'chase') {
    lapDrive.mapMode = 'overview';
    try { setLapMapMode('overview'); } catch (_) {}
  }
  const driveHost = document.getElementById('lapDriveChase');
  const driveChase = driveSochi && lapDrive.open && lapDrive.mapMode === 'chase';
  driveHost?.classList.toggle('hidden', !driveChase);
  driveHost?.setAttribute('aria-hidden', driveChase ? 'false' : 'true');
  document.getElementById('lapDrive')?.classList.toggle('mode-chase', driveChase);

  // —— render target ——
  let host = null;
  if (driveChase) host = driveHost;
  else if (cardChase && !lapDrive.open && sochiChase.curView === 'lap') host = cardHost;
  if (!host || document.hidden) {
    sochiChaseHalt();
    sochiChaseReleaseGps(!host);
    return;
  }
  if (!sochiChaseBuild()) { sochiChaseHalt(); return; }
  sochiChaseAttach(host);
  if (!sochiChase.raf) {
    sochiChase.running = true;
    sochiChase.raf = requestAnimationFrame(sochiChaseTick);
  }
}

/** «Включить GPS» on the chase: phone geolocation (the BLE chip / simulator already streams on its own). */
function sochiChaseStartGps() {
  if (extGps?.active?.()) return;
  if (run.watchId == null) {
    sochiChase.gpsOwn = true;
    try { startWatch(); } catch (_) {}
  }
  sochiChase.state = '';
}
/** Leaving «Трек»: stop the GPS watch we started ourselves unless a run / lap still needs it. */
function sochiChaseReleaseGps(leaving) {
  if (!leaving || !sochiChase.gpsOwn) return;
  if (run.armed || lapRun.active || lapDrive.open) return;
  sochiChase.gpsOwn = false;
  try { stopGeoWatch(); } catch (_) {}
  try { void keepAwake(false); } catch (_) {}
}
document.addEventListener('click', (e) => {
  const b = e.target?.closest?.('[data-chase-act]');
  if (!b) return;
  const act = b.getAttribute('data-chase-act');
  if (act === 'gps') sochiChaseStartGps();
  else if (act === 'demo') {
    sochiChase.demo = !sochiChase.demo;
    sochiChase.t0 = 0;
    sochiChase.state = '';
  }
  try { sochiChaseSync(); } catch (_) {}
});

document.getElementById('lapTrackMode')?.addEventListener('click', (e) => {
  const b = e.target?.closest?.('[data-lt-mode]');
  if (!b) return;
  sochiChase.view = b.getAttribute('data-lt-mode') === 'top' ? 'top' : 'chase';
  sochiChaseSync();
});
document.addEventListener('visibilitychange', () => { try { sochiChaseSync(); } catch (_) {} });
try {
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { try { sochiChaseSync(); } catch (_) {} });
} catch (_) {}

try {
  window.__plSochiChase = {
    /** open «Круг», select Sochi, chase mode */
    start: () => {
      const sel = document.getElementById('trackSelect');
      if (sel && [...sel.options].some((o) => o.value === 'sochi')) {
        sel.value = 'sochi';
        sel.onchange?.();
      }
      sochiChase.view = 'chase';
      goToView('lap');
      sochiChaseSync();
      return !!sochiChase.renderer;
    },
    stop: stopSochiChase,
    sync: sochiChaseSync,
    setView: (v) => { sochiChase.view = v === 'top' ? 'top' : 'chase'; sochiChaseSync(); },
    setU: (u) => { sochiChase.frozen = true; sochiChaseApplyCam(Number(u) || 0, true); if (sochiChase.renderer) sochiChase.renderer.render(sochiChase.scene, sochiChase.camera); },
    thaw: () => { sochiChase.frozen = false; sochiChase.t0 = 0; sochiChaseSync(); },
    feed: (lat, lon, v, extra) => sochiChaseFeedGps(Number(lat), Number(lon), v == null ? null : Number(v), extra || {}),
    demo: (on) => { sochiChase.demo = !!on; sochiChase.t0 = 0; sochiChase.state = ''; },
    clearLive: () => { sochiChase.tracker?.reset(); sochiChase.disp = null; sochiChase.demo = false; sochiChase.state = ''; },
    get: () => {
      const f = sochiChase.frame;
      return {
        running: sochiChase.running, view: sochiChase.view, has: !!sochiChase.renderer, host: sochiChase.host?.id || null, state: sochiChase.state, demo: sochiChase.demo,
        s: f ? Math.round(f.s * 10) / 10 : null, sfS: Math.round(sochiChase.sfS), kmh: f ? Math.round(f.kmh) : 0, acc: f?.acc ?? null,
        car: sochiChase.car ? { x: Math.round(sochiChase.car.position.x * 100) / 100, z: Math.round(sochiChase.car.position.z * 100) / 100 } : null,
      };
    },
  };
} catch (_) {}

function paintHomeTrackArt(art, trackId, name) {
  if (!art) return;
  // v96: Home «Трасса дня» = v91 map + white dot (3D chase moved to «Круг»)
  art.classList.remove('ht-art-mini');
  paintTrackMapImg(art, trackId, 'thumb', name || '');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // top-down map + white dot (all other tracks, or reduced-motion / chase fail)
  const d = homeTrackRacePathD(trackId, 640, 360);
  if (!d || reduce) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 640 360');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('class', 'ht-overlay');
  svg.setAttribute('aria-hidden', 'true');
  const guide = document.createElementNS(ns, 'path');
  guide.setAttribute('d', d);
  guide.setAttribute('class', 'ht-race');
  svg.appendChild(guide);
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('r', '5');
  dot.setAttribute('class', 'ht-dot');
  const glow = document.createElementNS(ns, 'circle');
  glow.setAttribute('r', '10');
  glow.setAttribute('class', 'ht-dot-glow');
  const mo1 = document.createElementNS(ns, 'animateMotion');
  mo1.setAttribute('dur', '8s');
  mo1.setAttribute('repeatCount', 'indefinite');
  mo1.setAttribute('path', d);
  mo1.setAttribute('rotate', 'auto');
  const mo2 = document.createElementNS(ns, 'animateMotion');
  mo2.setAttribute('dur', '8s');
  mo2.setAttribute('repeatCount', 'indefinite');
  mo2.setAttribute('path', d);
  glow.appendChild(mo2);
  dot.appendChild(mo1);
  svg.appendChild(glow);
  svg.appendChild(dot);
  art.appendChild(svg);
}

async function renderHomeTrack() {
  let data = null;
  try { data = await api.getSessionToday(); } catch (_) { data = null; }
  if (!data || !data.trackId) data = pickSessionTrackClient();
  const tr = TRACKS.find((t) => t.id === data.trackId) || TRACKS[0];
  const card = document.getElementById('homeTrack');
  if (!card || !tr) return;
  card.dataset.track = tr.id;
  const art = document.getElementById('homeTrackArt');
  if (art && art.dataset.track !== tr.id) {
    art.dataset.track = tr.id;
    paintHomeTrackArt(art, tr.id, tr.name || '');
  }
  const nm = document.getElementById('homeTrackName');
  if (nm) nm.textContent = tr.name;
  const meta = document.getElementById('homeTrackMeta');
  if (meta) {
    meta.replaceChildren();
    const spec = (v, u, k) => {
      const el = padEl('span', 'ht-spec');
      const b = padEl('b', '', v);
      if (u) b.appendChild(padEl('small', '', u));
      el.appendChild(b);
      el.appendChild(padEl('span', '', k));
      meta.appendChild(el);
    };
    if (tr.km) spec(String(tr.km), 'км', 'длина');
    if (tr.turns) spec(String(tr.turns), '', 'поворотов');
    if (tr.cult) meta.appendChild(padEl('span', 'ht-chip', 'культовая'));
  }
  const ol = document.getElementById('homeTrackTop');
  if (!ol) return;
  let rows = [];
  try {
    const raw = (await api.listLapBoard(tr.id, 'all')) || [];
    const best = new Map();
    filterTopRows(raw, { model: '' }).forEach((r) => {
      const k = r.pilotId || ('n:' + (r.name || ''));
      const ms = lapMs(r.t);
      if (!Number.isFinite(ms)) return;
      if (!best.has(k) || ms < best.get(k)._ms) best.set(k, { ...r, _ms: ms });
    });
    rows = [...best.values()].sort((a, b) => a._ms - b._ms).slice(0, 3);
  } catch (_) { rows = []; }
  ol.replaceChildren();
  showWhen('homeTrackSec', rows.length >= SHOW_MIN.track);
  if (!rows.length) {
    const li = padEl('li', 'ht-empty');
    li.appendChild(padEl('b', '', 'Трасса свободна'));
    li.appendChild(padEl('span', '', 'Проедь круг с GPS A/B — и рекорд трассы твой.'));
    ol.appendChild(li);
    return;
  }
  rows.forEach((r, i) => {
    const li = padEl('li', 'ht-row');
    if (r.pilotId && isPublicPilot(r.pilotId)) li.dataset.pilot = r.pilotId;
    li.appendChild(padEl('span', 'ht-n', String(i + 1).padStart(2, '0')));
    li.appendChild(padEl('span', 'ht-who', clipText(r.name || 'пилот', 16)));
    li.appendChild(padEl('span', 'ht-t', String(r.t)));
    ol.appendChild(li);
  });
}

async function renderHomeLeaders() {
  const box = document.getElementById('homeLeaders');
  if (!box) return;
  let board = [];
  try { board = (await homeRemote()).board || []; } catch (_) { board = []; }
  try { board = filterTopRows(board, { model: '' }); } catch (_) {}
  board = board.slice().sort((a, b) => Number(a.t) - Number(b.t));
  showWhen('homeLeadersSec', board.length >= SHOW_MIN.leaders);
  box.replaceChildren();
  const slots = [1, 0, 2]; // 2nd · 1st · 3rd
  slots.forEach((i) => {
    const r = board[i];
    const col = padEl(r?.pilotId && isPublicPilot(r.pilotId) ? 'button' : 'div', 'hl-col hl-p' + (i + 1) + (r ? '' : ' free'));
    if (col.tagName === 'BUTTON') { col.type = 'button'; col.dataset.pilot = r.pilotId; }
    col.appendChild(r ? padAvatar(r.name || 'P', r.avatar, i === 0 ? 52 : 42) : padEl('span', 'pad-ava hl-q', '?'));
    col.appendChild(padEl('b', 'hl-name', r ? clipText(r.name || 'пилот', 10) : 'Свободно'));
    col.appendChild(padEl('span', 'hl-car', r ? (shortCarName(r.car, r.carId) || '—') : 'займи место'));
    const tm = padEl('span', 'hl-t', r ? Number(r.t).toFixed(2) : '—');
    if (r) tm.appendChild(padEl('small', '', 'с'));
    col.appendChild(tm);
    const gap = r && i > 0 && board[0] ? Number(r.t) - Number(board[0].t) : null;
    col.appendChild(padEl('span', 'hl-gap', gap != null && Number.isFinite(gap) ? '+' + gap.toFixed(2) : (r && i === 0 ? 'лидер' : '\u00a0')));
    const step = padEl('span', 'hl-step');
    step.appendChild(padEl('i', '', String(i + 1)));
    col.appendChild(step);
    box.appendChild(col);
  });
  if (!board.length) {
    const cta = padEl('button', 'home-link hl-cta', 'Займи первое место — к замеру →');
    cta.type = 'button';
    cta.dataset.hq = 'run';
    box.appendChild(cta);
  }
}

function homeSparkline(hist) {
  // v86: тонкий линейный график последних замеров 0–100 (ниже время — выше точка)
  const ns = 'http://www.w3.org/2000/svg';
  const W = 168, H = 64, P = 6;
  const mx = Math.max(...hist), mn = Math.min(...hist);
  const span = mx - mn || 1;
  const pts = hist.map((v, i) => [P + (hist.length === 1 ? 0 : i * (W - 2 * P) / (hist.length - 1)), mx === mn ? H / 2 : P + (v - mn) / span * (H - 2 * P)]);
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'hs-spark');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(ns, 'defs');
  const lg = document.createElementNS(ns, 'linearGradient');
  lg.setAttribute('id', 'hsSparkFill'); lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1');
  [['0', '.16'], ['1', '0']].forEach(([o, a]) => { const st = document.createElementNS(ns, 'stop'); st.setAttribute('offset', o); st.setAttribute('stop-color', '#ffffff'); st.setAttribute('stop-opacity', a); lg.appendChild(st); });
  defs.appendChild(lg); svg.appendChild(defs);
  [0.25, 0.5, 0.75].forEach((f) => { const g = document.createElementNS(ns, 'line'); g.setAttribute('x1', '0'); g.setAttribute('x2', String(W)); g.setAttribute('y1', String(H * f)); g.setAttribute('y2', String(H * f)); g.setAttribute('class', 'hs-grid-l'); svg.appendChild(g); });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', line + ` L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`);
  area.setAttribute('class', 'hs-area'); area.setAttribute('fill', 'url(#hsSparkFill)');
  svg.appendChild(area);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', line); path.setAttribute('class', 'hs-line'); path.setAttribute('pathLength', '1');
  svg.appendChild(path);
  const bi = hist.indexOf(mn);
  const dot = (i, cls, r) => { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', pts[i][0].toFixed(1)); c.setAttribute('cy', pts[i][1].toFixed(1)); c.setAttribute('r', String(r)); c.setAttribute('class', cls); svg.appendChild(c); };
  if (bi !== hist.length - 1) dot(hist.length - 1, 'hs-pt', 2.2);
  dot(bi, 'hs-pt-best-ring', 5.5);
  dot(bi, 'hs-pt-best', 2.6);
  return svg;
}
function renderHomeStats() {
  const box = document.getElementById('homeStats');
  if (!box) return;
  const s = localStats();
  box.replaceChildren();
  const card = padEl('div', 'hs-card');
  const hist = s.slips.map((x) => Number(x.v0100)).filter((x) => Number.isFinite(x) && x > 0).slice(0, 10).reverse();
  // top: hero number + sparkline
  const top = padEl('div', 'hs-top');
  const lead = padEl('div', 'hs-lead');
  lead.appendChild(padEl('span', 'h-cap', 'Лучший 0–100'));
  const big = padEl('b', 'hs-big' + (s.best0100 != null ? '' : ' ghost'), s.best0100 != null ? s.best0100.toFixed(2) : '—');
  big.appendChild(padEl('small', '', 'с'));
  lead.appendChild(big);
  if (hist.length >= 2) {
    const last = hist[hist.length - 1], prev = hist[hist.length - 2];
    const d = last - prev;
    const delta = padEl('span', 'hs-delta' + (d < 0 ? ' up' : ''), (d < 0 ? '▲ ' : d > 0 ? '▼ ' : '') + (d === 0 ? 'без изменений' : Math.abs(d).toFixed(2) + ' с к прошлому'));
    lead.appendChild(delta);
  } else {
    lead.appendChild(padEl('span', 'hs-delta', s.best0100 != null ? 'GPS A/B' : 'нет замеров'));
  }
  top.appendChild(lead);
  const chart = padEl('div', 'hs-chart');
  if (hist.length >= 2) {
    chart.appendChild(homeSparkline(hist));
    chart.appendChild(padEl('span', 'hs-chart-s', 'последние ' + hist.length + ' замеров'));
  } else {
    chart.classList.add('empty');
    chart.appendChild(padEl('span', 'hs-chart-s', 'график — после 2 замеров'));
  }
  top.appendChild(chart);
  card.appendChild(top);
  // bottom: hairline-separated counters
  const row = padEl('div', 'hs-row');
  [
    [s.runsCapped ? '20+' : String(s.runs), 'замеров 0–100'],
    [String(s.laps), 'кругов GPS'],
    [String(s.tracks), s.tracks === 1 ? 'трасса' : 'трасс'],
  ].forEach(([v, k]) => {
    const t = padEl('div', 'hs-tile' + (v === '0' ? ' zero' : ''));
    t.appendChild(padEl('b', '', v));
    t.appendChild(padEl('span', '', k));
    row.appendChild(t);
  });
  card.appendChild(row);
  if (!s.runs && !s.laps) {
    const cta = padEl('div', 'hs-cta');
    cta.appendChild(padEl('span', '', 'Первый замер откроет историю и прогресс.'));
    const b = padEl('button', 'home-link', 'Сделать замер →');
    b.type = 'button';
    b.dataset.hq = 'run';
    cta.appendChild(b);
    card.appendChild(cta);
  }
  box.appendChild(card);
}

let _homeRealCars = null;
let _homeRealCarsP = null;
function loadHomeRealCars() {
  if (_homeRealCarsP) return _homeRealCarsP;
  _homeRealCarsP = (async () => {
    const ids = new Set();
    const add = (rows) => (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (!r || r.valid === false || !(r.gpsQ === 'A' || r.gpsQ === 'B')) return;
      const m = MODEL_CATALOG.find((x) => x.id === r.carId) || MODEL_CATALOG.find((x) => x.name === r.car);
      if (m) ids.add(m.id);
    });
    try { add(await api.listDrag('0-100', {})); } catch (_) {}
    try { add(await api.listLap('sochi')); } catch (_) {}
    _homeRealCars = ids;
    const box = document.getElementById('homeCars'); if (box) box.dataset.cur = '\u0000';
    try { renderHomeCars(); } catch (_) {}
  })();
  return _homeRealCarsP;
}
function renderHomeCars() {
  const box = document.getElementById('homeCars');
  if (!box) return;
  const cur = homeHeroCarId();
  if (box.childElementCount && box.dataset.cur === cur) return;
  box.dataset.cur = cur;
  box.replaceChildren();
  // v106: только машины с реальными зачтёнными результатами (топ 0–100 / круги A/B), без «витрины»
  const real = _homeRealCars;
  if (real == null) { void loadHomeRealCars(); }
  const list = MODEL_CATALOG.filter((m) => real && real.has(m.id));
  if (!list.length) {
    box.dataset.cur = '';
    const e = padEl('div', 'home-empty');
    e.appendChild(padEl('b', '', 'пока нет валидных заездов'));
    e.appendChild(padEl('span', '', 'Машины появятся после первых проверенных A/B.'));
    box.appendChild(e);
    return;
  }
  list.forEach((m) => {
    const b = padEl('button', 'hcar' + (m.id === cur ? ' on' : ''));
    b.type = 'button';
    b.dataset.car = m.id;
    const im = document.createElement('img');
    im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
    b.appendChild(im); fillCarImg293(im, m.id, m.name);
    b.appendChild(padEl('b', '', shortCarName(m.name, m.id)));
    b.appendChild(padEl('span', '', m.id === cur ? 'на подиуме' : String(m.year || '')));
    box.appendChild(b);
  });
}
function openCarInGarage(id) {
  hap(10);
  try {
    if (id && MODEL_CATALOG.some((m) => m.id === id) && id !== podiumModelId) {
      if (podiumModelId) loadPodiumModel(id, 0);
      else selectActiveCar(id, { skipPodium: true });
    }
  } catch (_) {}
  goToView('garage');
}
function homeQuick(kind) {
  hap(8);
  if (kind === 'run') goToView('run');
  else if (kind === 'lap') goToView('lap');
  else if (kind === 'garage') goToView('garage');
  else if (kind === 'team') openCrewSheet();
  else if (kind === 'post') {
    goToView('pulse');
    setTimeout(() => { const t = document.getElementById('pulseText'); try { t?.focus({ preventScroll: false }); t?.scrollIntoView({ block: 'center' }); } catch (_) {} }, 250);
  }
}
// v86: плавное появление блоков Главной при прокрутке (stagger fade/slide); prefers-reduced-motion — без анимации
let _homeIO = null;
function homeReveal() {
  const root = document.getElementById('view-home');
  if (!root) return;
  const els = [...root.querySelectorAll('.h-rv:not(.in)')];
  if (!els.length) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof IntersectionObserver === 'undefined') { els.forEach((e) => e.classList.add('in')); return; }
  if (!_homeIO) {
    _homeIO = new IntersectionObserver((ents) => {
      let k = 0;
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.style.setProperty('--rv-d', (k++ * 70) + 'ms');
        en.target.classList.add('in');
        _homeIO.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  }
  document.documentElement.classList.add('h-rv-on');
  els.forEach((e) => _homeIO.observe(e));
}
function renderHome() {
  try { if (Q.tier === 'low') document.documentElement.classList.add('q-low'); } catch (_) {}
  try { homeReveal(); } catch (_) { document.querySelectorAll('#view-home .h-rv').forEach((e) => e.classList.add('in')); }
  setupHomeCarousel();
  try { hcGoPos(_hcPos, false); } catch (_) {}
  const on = (id) => !document.getElementById(id)?.classList.contains('v123-off');
  if (on('homeHero')) void renderHomeHero();
  if (on('homeDuelsSec')) void renderHomeDuels();
  if (on('homeTrackSec')) void renderHomeTrack();
  if (on('homeLeadersSec')) void renderHomeLeaders();
  if (on('homeStatsSec')) renderHomeStats();
  void renderHomeWidgets();
  void refreshSheetBadges();
  if (!document.getElementById('homeCarsSec')?.classList.contains('v120-off')) renderHomeCars();
  if (!document.getElementById('homePostsSec')?.classList.contains('v120-off')) void renderHomeTopPosts();
  renderHomeGo();
}

/* ——— v123: Главная из окошек-виджетов + меню ☰ + навигация без нижнего таббара (на телефоне) ——— */
function hwSet(id, nodes) { const b = document.getElementById(id); if (!b) return; b.replaceChildren(...nodes); }
function hwBig(v, unit) { const b = padEl('b', 'hw-big', v); if (unit) b.appendChild(padEl('small', '', unit)); return b; }
function hwLine(k, v, cls = '') { const r = padEl('span', 'hw-line ' + cls); r.appendChild(padEl('span', 'hw-lk', k)); r.appendChild(padEl('b', 'hw-lv', v)); return r; }
function hwEmpty(title, sub, cta) { const r = [padEl('span', 'hw-empty-t', title), padEl('span', 'hw-empty-s', sub)]; if (cta) r.push(padEl('span', 'hw-empty-cta', cta)); return r; } // v146: одна ясная кнопка в пустом состоянии
function homeBest0100(carId, remote) {
  const drag = remote?.prof?.best?.drag || {};
  const srv = (disc) => (drag[disc] && (!drag[disc].carId || drag[disc].carId === carId)) ? Number(drag[disc].t) : null;
  const ab = minDefined(passportBest(carId, 'v0100'), localDragBest(carId, '0-100')?.t, srv('0-100'));
  if (ab != null) return { t: ab, cls: 'ab' };
  const c = Number(state.dragBestC?.[carId]?.['0-100']?.t);
  return c > 0 ? { t: c, cls: 'c' } : null;
}
/** v212: данные для карточки «Моя машина» (editorial) — бренд/модель/крупный текст/характеристики/мой лучший 0–100 */
function carCardSpec(mc) {
  const c = CARS.find((x) => x.id === mc.carId) || null;
  const full = String(mc.model || c?.name || '').trim();
  const bm = full.match(CAR_BRAND_RE);
  const brand = bm ? bm[1] : (/^BMW\s/i.test(full) ? 'BMW' : (full.split(/\s+/).length > 1 ? full.split(/\s+/)[0] : ''));
  const short = shortCarName(mc.model, mc.carId).replace(/^(BMW|Audi)\s+/i, '');
  const model = (c && short) ? short : ((brand ? full.slice(brand.length) : full).trim() || full);
  let best = null; try { const b = homeBest0100(mc.carId || '', null); best = b && b.t > 0 ? b.t : null; } catch (_) {}
  return { brand, model, sub: c ? [c.trim, c.year].filter(Boolean).join(' · ') : '', big: short || model, side: c?.side || '',
    hp: c?.hp ?? null, nm: c?.nm ?? null, v0100: c?.v0100 ?? null, best };
}
function renderHwCar(remote) {
  // v202: гостю/новичку без своей машины — не демо-BMW с прочерками, а приглашение добавить машину
  try {
    const guest = !(Array.isArray(state.garage) && state.garage.length);
    const hc = document.getElementById('hwCar'); if (hc) hc.hidden = guest;
    const ad = document.getElementById('hwAddCar'); if (ad) ad.hidden = !guest;
    if (guest) return;
  } catch (_) {}
  const id = homeHeroCarId();
  const m = MODEL_CATALOG.find((x) => x.id === id) || MODEL_CATALOG[0];
  if (!m) return;
  const img = document.getElementById('hwCarImg'); const av = document.getElementById('hwCarAvif');
  const ph = myCarPhotoUrl(remote); // v132: своё фото вместо рендера (рендер — запасной)
  document.getElementById('hwCar')?.classList.toggle('has-photo', !!ph);
  if (img && ph && img.dataset.car !== 'photo:' + ph) {
    img.dataset.car = 'photo:' + ph; img.hidden = false; img.parentElement?.closest('*')?.querySelectorAll('.cph289').forEach((x) => x.remove());
    av?.removeAttribute('srcset'); img.removeAttribute('srcset');
    img.onerror = () => { img.onerror = null; img.dataset.car = ''; _myCarPhoto = null; document.getElementById('hwCar')?.classList.remove('has-photo'); renderHwCar(null); };
    img.src = ph;
  } else if (img && !ph && img.dataset.car !== m.id) {
    img.dataset.car = m.id;
    av?.removeAttribute('srcset'); img.removeAttribute('srcset'); img.removeAttribute('src'); // v289: без рендеров — эмблема + имя
    img.hidden = true; const host = img.closest('picture')?.parentElement || img.parentElement;
    host?.querySelector(':scope > .cph289')?.remove(); host?.appendChild(carPh289(m.name));
  }
  const row = document.getElementById('hwCarRow'); if (row) fillCarNameRow(row, m.name, { tag: 'b', id: 'hwCarName' }); // v135: + флаг страны марки
  let cls = ''; try { cls = (CARS.find((c) => c.id === m.id)?.cls) || ''; } catch (_) {}
  const sub = document.getElementById('hwCarSub'); if (sub) sub.textContent = [m.year, cls].filter(Boolean).join(' · ');
  const chip = document.getElementById('hwCarBest');
  const best = null; // v123: без дубля 0–100 на фото (см. «Мои рекорды» / «Замер»)
  if (chip) {
    chip.hidden = !best; chip.replaceChildren();
    if (best) { chip.appendChild(padEl('span', '', '0–100')); chip.appendChild(padEl('b', '', best.t.toFixed(2) + ' с')); if (best.cls === 'c') chip.appendChild(padEl('i', '', 'C')); }
  }
  document.getElementById('hwCar')?.setAttribute('data-car', m.id);
}
function renderHwRecords(remote) {
  const id = homeHeroCarId();
  const best = homeBest0100(id, remote);
  const drag = remote?.prof?.best?.drag || {};
  const q = minDefined(localDragBest(id, '402m')?.t, drag['402m'] && (!drag['402m'].carId || drag['402m'].carId === id) ? Number(drag['402m'].t) : null);
  const lap = localBestLap();
  const rows = [];
  if (best) rows.push(hwLine('0–100', best.t.toFixed(2) + ' с' + (best.cls === 'c' ? ' · C' : '')));
  if (q != null) rows.push(hwLine('¼ мили', q.toFixed(2) + ' с'));
  if (lap) rows.push(hwLine('Круг', fmtLapTime(lap.ms)));
  const btn = document.getElementById('hwRec'); if (btn) btn.dataset.empty = rows.length ? '0' : '1';
  hwSet('hwRecBody', rows.length ? rows : hwEmpty('Пока пусто', 'Первый замер появится здесь', 'Сделать замер'));
  // v163: лучшие времена — крупными цифрами прямо в карточке моей машины (как на «Замере»: цифра, подпись, волосок)
  const cell = (k, v) => { const c = padEl('span', 'h63-c' + (v ? '' : ' is-empty')); c.append(padEl('b', 'h63-v', v || '—'), padEl('span', 'h63-k', k)); return c; };
  hwSet('hwCarStats', [cell('0–100', best ? best.t.toFixed(2) : ''), cell('¼ мили', q != null ? q.toFixed(2) : ''), cell('Круг', lap ? fmtLapTime(lap.ms) : '')]);
  const hs = document.getElementById('hwCarStats'); if (hs) hs.dataset.any = (best || q != null || lap) ? '1' : '0';
}
let _hwDuelsAt = 0;
async function renderHwDuels() {
  if (DUELS_OFF) return; // v197: дуэли убраны
  if (Date.now() - _hwDuelsAt < 30000 && document.getElementById('hwDuelsBody')?.childElementCount) return;
  _hwDuelsAt = Date.now();
  let rows = []; try { rows = await fetchMyDuels(); } catch (_) { rows = []; }
  const inbox = rows.filter((d) => duelCategory(d) === 'inbox').length;
  const active = rows.filter((d) => duelCategory(d) === 'active').length;
  const wDu = document.getElementById('hwDuels');
  if (!inbox && !active) { hwSet('hwDuelsBody', hwEmpty('Нет активных', 'Вызови пилота 1 на 1')); if (wDu) wDu.hidden = true; return; } // v158: пустой виджет скрыт
  if (wDu) wDu.hidden = false;
  const n = inbox + active;
  const nodes = [hwBig(String(n), n === 1 ? 'дуэль' : n < 5 ? 'дуэли' : 'дуэлей')];
  if (inbox) nodes.push(padEl('span', 'hw-note hw-acc', inbox === 1 ? 'тебя вызвали' : 'вызовов: ' + inbox));
  else nodes.push(padEl('span', 'hw-note', 'ждут заезда'));
  // v158: ближайшая дуэль — соперник и дисциплина
  { const d0 = rows.find((d) => duelCategory(d) === 'inbox') || rows.find((d) => duelCategory(d) === 'active');
    if (d0) { const who = duelCategory(d0) === 'inbox' ? (d0.createdBy?.name || 'пилот') : (d0.challenger?.name || ''); const typ = d0.type === 'lap' ? 'круг' : '0–100';
      nodes.push(padEl('span', 'hw-note hw58-next', (who ? (duelCategory(d0) === 'inbox' ? 'от ' : 'с ') + clipText(String(who), 14) + ' · ' : '') + typ)); } }
  hwSet('hwDuelsBody', nodes);
}
let _hwPadAt = 0;
/* v125: Paddock как чат — общие данные для виджета, бейджа и «живой» строки в шторке (только реальные посты/комментарии) */
let _padChat = null; let _padChatAt = 0; let _padChatP = null;
function padRu(n, one, few, many) { n = Math.abs(n) % 100; const d = n % 10; if (n > 10 && n < 20) return many; if (d === 1) return one; if (d >= 2 && d <= 4) return few; return many; }
async function padChatData(force = false) {
  if (!force && _padChat && Date.now() - _padChatAt < 60000) return _padChat;
  if (_padChatP) return _padChatP;
  _padChatP = (async () => {
    let rows = []; try { rows = await api.listPulseRecent(); } catch (_) { rows = []; }
    rows = (Array.isArray(rows) ? rows : []).filter((p) => p && p.id && (p.text || p.hasImg)).sort((x, y) => (Number(y.at) || 0) - (Number(x.at) || 0));
    const items = rows.map((p) => ({ kind: 'post', id: p.id, who: padName(p.who), pilotId: p.pilotId || '', ava: p.ava || '', text: String(p.text || '').trim() || (p.hasImg ? 'фото' : ''), at: Number(p.at) || 0, cc: Number(p.commentCount) || 0 }));
    // ответы: GET комментариев только у 2 самых свежих постов, где они есть (лимит запросов)
    const withCom = rows.filter((p) => Number(p.commentCount) > 0).slice(0, 2);
    for (const p of withCom) {
      try { const r = await api.listComments(p.id); const list = Array.isArray(r?.comments) ? r.comments : [];
        for (const c of list.slice(-6)) if (c && c.text) items.push({ kind: 'reply', id: p.id, who: padName(c.who), pilotId: c.pilotId || '', ava: c.ava || '', text: String(c.text), at: Number(c.at) || 0 });
      } catch (_) {}
    }
    items.sort((x, y) => y.at - x.at);
    let seen = 0; try { seen = Number(localStorage.getItem(PULSE_SEEN_KEY) || 0); if (!seen) { seen = Date.now(); localStorage.setItem(PULSE_SEEN_KEY, String(seen)); } } catch (_) {}
    const who = []; for (const it of items) { if (!who.some((w) => w.name === it.who)) who.push({ name: it.who, pilotId: it.pilotId, ava: it.ava }); }
    const last = items[0]?.at || 0;
    _padChat = { items, who, last, active: !!last && Date.now() - last < 3600e3, fresh: items.filter((it) => it.at > seen).length };
    _padChatAt = Date.now();
    return _padChat;
  })();
  try { return await _padChatP; } finally { _padChatP = null; }
}
function padStack(who, max = 4, size = 26) {
  const st = padEl('span', 'pc-stack');
  who.slice(0, max).forEach((w) => st.appendChild(padAvatar(w.name, padAvaUrl(w.pilotId, w.ava), size)));
  if (who.length > max) st.appendChild(padEl('span', 'pad-ava pc-more', '+' + (who.length - max)));
  return st;
}
async function renderHwPaddock() {
  if (Date.now() - _hwPadAt < 60000 && document.getElementById('hwPadBody')?.childElementCount) return;
  _hwPadAt = Date.now();
  const d = await padChatData();
  const w = document.getElementById('hwPad');
  if (!d.items.length) {
    w?.classList.add('is-empty');
    const e = padEl('span', 'pc-empty');
    const ic = padEl('span', 'pc-empty-ico'); ic.appendChild(padIcon('bubble', 'pad-ico'));
    const t = padEl('span', 'pc-empty-t'); t.append(padEl('b', '', 'Тут пилоты обсуждают заезды'), padEl('small', '', 'Напиши первым — про сборку, трассу или время'));
    e.append(ic, t, padEl('span', 'pc-write', 'Написать'));
    hwSet('hwPadBody', [e]); return;
  }
  w?.classList.remove('is-empty');
  const top = padEl('span', 'pc-top');
  top.appendChild(padStack(d.who));
  const st = padEl('span', 'pc-status' + (d.active ? ' on' : ''));
  st.appendChild(padEl('i', 'pc-dot'));
  st.appendChild(document.createTextNode(d.active ? 'активно · ' + padAgo(d.last) : padAgo(d.last)));
  top.appendChild(st);
  if (d.fresh > 0) top.appendChild(padEl('span', 'pc-new', (d.fresh > 9 ? '9+' : d.fresh) + ' ' + padRu(d.fresh, 'новое', 'новых', 'новых')));
  const list = padEl('span', 'pc-list');
  d.items.slice(0, 2).forEach((it, i) => {
    const row = padEl('span', 'pc-msg' + (i ? ' pc-msg-2' : ''));
    row.appendChild(padAvatar(it.who, padAvaUrl(it.pilotId, it.ava), 22));
    const bub = padEl('span', 'pc-bub');
    const h = padEl('span', 'pc-bh'); h.appendChild(padEl('b', '', clipText(it.who, 16)));
    if (it.kind === 'reply') h.appendChild(padEl('em', '', 'ответ'));
    h.appendChild(padEl('time', '', padAgo(it.at)));
    bub.append(h, padEl('span', 'pc-bt', it.text.replace(/\s+/g, ' ').slice(0, 120)));
    row.appendChild(bub); list.appendChild(row);
  });
  hwSet('hwPadBody', [top, list]);
}
function renderPadLive(d) {
  const box = document.getElementById('pulseLive'); if (!box) return;
  box.replaceChildren();
  if (!d || !d.items.length) { box.hidden = true; return; }
  box.hidden = false;
  box.appendChild(padStack(d.who, 5, 24));
  const t = padEl('span', 'pl-live-t');
  const n = d.who.length;
  t.appendChild(padEl('b', '', n + ' ' + padRu(n, 'пилот', 'пилота', 'пилотов') + ' в чате'));
  const st = padEl('small', 'pc-status' + (d.active ? ' on' : '')); st.appendChild(padEl('i', 'pc-dot'));
  st.appendChild(document.createTextNode(d.active ? 'активно · ' + padAgo(d.last) : 'последнее · ' + padAgo(d.last)));
  t.appendChild(st); box.appendChild(t);
}
let _hwTeamAt = 0;
async function renderHwTeam() {
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
  if (Date.now() - _hwTeamAt < 60000 && document.getElementById('hwTeamBody')?.childElementCount) return;
  _hwTeamAt = Date.now();
  let rows = null; try { rows = isRemoteApi() && currentUser() ? await api.listMyCrews(crewPilotId()) : null; } catch (_) { rows = null; }
  const c = Array.isArray(rows) && rows.length ? rows[0] : null;
  const wT = document.getElementById('hwTeam'); if (wT) wT.hidden = !c; // v158: нет команды — виджет скрыт (команда — в ☰)
  if (!c) { hwSet('hwTeamBody', hwEmpty('Нет команды', 'Собери экипаж')); return; }
  const n = Number(c.memberCount || c.members?.length || 0);
  hwSet('hwTeamBody', [padEl('b', 'hw-name', clipText(String(c.name || 'Экипаж'), 20)), padEl('span', 'hw-note', n ? n + ' из 10 пилотов' : 'экипаж')]);
}
function renderHwTop(remote) {
  const board = remote?.board || [];
  { const tw = document.getElementById('hwTop'); if (tw) { tw.dataset.empty = board.length ? '0' : '1'; if (remote) tw.hidden = !board.length; } } // v158: пустой топ скрыт
  if (!board.length) { hwSet('hwTopBody', hwEmpty('Топ пока пуст', 'Стань первым в таблице', 'Сделать замер')); return; }
  const lead = board[0];
  const nodes = [];
  const l = padEl('span', 'hw-top-lead');
  l.appendChild(padEl('b', 'hw-top-t', Number(lead.t).toFixed(2))); // v163: время лидера — крупная цифра плитки
  l.appendChild(padEl('span', 'hw-top-name', '1 · ' + clipText(String(lead.name || 'пилот'), 14)));
  nodes.push(l);
  const i = remote?.pid ? board.findIndex((r) => r.pilotId === remote.pid) : -1;
  nodes.push(padEl('span', 'hw-top-me' + (i >= 0 ? ' on' : ''), i >= 0 ? 'ты #' + (i + 1) + ' из ' + board.length : board.length + ' в зачёте'));
  hwSet('hwTopBody', nodes);
}
/* v163: Главная — ровная сетка плиток 2 × N. Нечётное число видимых — последняя во всю ширину (без дыр) */
function h63Balance() {
  const g = document.getElementById('homeWidgets'); if (!g) return;
  const vis = (e) => !!e && !e.hidden && e.dataset.empty !== '1' && getComputedStyle(e).display !== 'none';
  const tiles = [...g.querySelectorAll('.h63-tile')].filter(vis);
  g.querySelectorAll('.h63-span').forEach((e) => e.classList.remove('h63-span'));
  if (tiles.length % 2 === 1) tiles[tiles.length - 1].classList.add('h63-span');
  g.dataset.tiles = String(tiles.length);
}
(() => {
  const g = document.getElementById('homeWidgets'); if (!g) return;
  ['hw58Place', 'hw58Week', 'hw58Last', 'hwDuels', 'hwTop', 'hwTeam', 'hwPad'].forEach((id) => document.getElementById(id)?.classList.add('h63-tile'));
  let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { try { h63Balance(); } catch (_) {} }, 30); }).observe(g, { subtree: true, attributes: true, attributeFilter: ['hidden', 'data-empty'] });
  setTimeout(() => { try { h63Balance(); } catch (_) {} }, 50);
})();
async function renderHomeWidgets() {
  if (!document.getElementById('homeWidgets')) return;
  renderHwCar(null); renderHwRecords(null); renderHwTop(null); try { renderHwStats(null); } catch (_) {}
  void renderHwDuels(); void renderHwPaddock(); void renderHwTeam();
  let remote = null; try { remote = await homeRemote(); } catch (_) { remote = null; }
  renderHwCar(remote); renderHwRecords(remote); renderHwTop(remote);
  try { renderHwStats(remote); } catch (_) {}
  try { renderHomeGo(); } catch (_) {}
}
/* v158: строка статистики на Главной — место в топе 0–100, замеры за 7 дней, последняя сессия. Пустые ячейки скрыты, пустая строка — тоже. */
function hw58Ago(at) {
  const d = Math.floor((Date.now() - at) / 86400000);
  if (!(at > 0)) return '';
  if (d <= 0) return 'сегодня'; if (d === 1) return 'вчера'; if (d < 7) return d + ' дн. назад';
  return new Date(at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function hw58Data(remote) {
  const out = { place: null, week: 0, last: null };
  const board = remote?.board || [];
  const i = remote?.pid ? board.findIndex((r) => r.pilotId === remote.pid) : -1;
  if (i >= 0) out.place = { v: '#' + (i + 1), s: 'из ' + board.length + ' · 0–100' };
  const wk = Date.now() - 7 * 86400000;
  const ev = [];
  for (const sl of (Array.isArray(state.slips) ? state.slips : [])) if (sl && sl.at > 0) ev.push({ at: sl.at, kind: 'run', v: sl.v0100 != null ? Number(sl.v0100).toFixed(2) + ' с' : '', s: '0–100' });
  for (const [trackId, list] of Object.entries(state.laps || {})) for (const l of (Array.isArray(list) ? list : [])) if (l && l.at > 0 && l.ms > 0) ev.push({ at: l.at, kind: 'lap', v: fmtLapTime(l.ms), s: TRACKS.find((t) => t.id === trackId)?.name || trackId });
  out.week = ev.filter((e) => e.at >= wk).length;
  ev.sort((a, b) => b.at - a.at);
  if (ev[0]) out.last = { v: ev[0].v || (ev[0].kind === 'lap' ? 'круг' : 'замер'), s: clipText(String(ev[0].s), 10) + ' · ' + hw58Ago(ev[0].at) };
  return out;
}
function renderHwStats(remote) {
  const w = document.getElementById('hwStats'); if (!w) return;
  const d = hw58Data(remote);
  const cell = (id, val) => { const c = document.getElementById(id); if (!c) return false; c.hidden = !val; if (val) { const v = document.getElementById(id + 'V'); const s2 = document.getElementById(id + 'S'); if (v && v.textContent !== val.v) { if (v.textContent === '—' && !w.hidden) countUp(v, val.v); else v.textContent = val.v; } /* v160: первый показ — счёт */ if (s2 && s2.textContent !== val.s) s2.textContent = val.s; } return !!val; };
  const n = [cell('hw58Place', d.place), cell('hw58Week', d.week ? { v: String(d.week), s: (d.week % 10 === 1 && d.week % 100 !== 11) ? 'заезд' : ([2, 3, 4].includes(d.week % 10) && ![12, 13, 14].includes(d.week % 100)) ? 'заезда' : 'заездов' } : null), cell('hw58Last', d.last)].filter(Boolean).length;
  w.hidden = n === 0; w.dataset.n = String(n);
}
document.getElementById('homeWidgets')?.addEventListener('click', (e) => {
  const w = e.target?.closest?.('[data-hw]'); if (!w) return;
  e.stopPropagation(); hap(8);
  const k = w.dataset.hw;
  if (k === 'garage') { try { openCarDbPicker(); } catch (_) {} return; }
  if (k === 'records') { goToView(w.dataset.empty === '1' ? 'run' : 'tops'); return; }
  if (k === 'tops' && w.dataset.empty === '1') { goToView('run'); return; }
  if (k === 'team') { openCrewSheet(); return; }
  if (k === 'stats') { try { window.__route48?.('history'); } catch (_) {} return; } // v158
  if (k === 'pulse' && document.getElementById('hwPad')?.classList.contains('is-empty')) {
    if (sheetNavOn()) openTgSheet('pulse'); else goToView('pulse');
    setTimeout(() => { try { document.getElementById('pulseText')?.focus({ preventScroll: true }); } catch (_) {} }, 480);
    return;
  }
  if ((k === 'duels' || k === 'pulse') && sheetNavOn()) { openTgSheet(k); return; }
  goToView(k);
});

/* меню ☰ */
function plMenuOpen() {
  const m = document.getElementById('plMenu'); if (!m) return;
  m.classList.remove('hidden'); m.setAttribute('aria-hidden', 'false');
  document.getElementById('btnMenu')?.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => m.classList.add('on'));
  setTimeout(() => { try { document.getElementById('plMenuClose')?.focus({ preventScroll: true }); } catch (_) {} }, 50);
}
function plMenuClose() {
  const m = document.getElementById('plMenu'); if (!m || m.classList.contains('hidden')) return;
  m.classList.remove('on'); m.setAttribute('aria-hidden', 'true');
  document.getElementById('btnMenu')?.setAttribute('aria-expanded', 'false');
  const panel = document.getElementById('plMenuPanel'); if (panel) panel.style.transform = '';
  const done = () => m.classList.add('hidden');
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 260);
}
document.getElementById('btnMenu')?.addEventListener('click', () => { hap(6); plMenuOpen(); });
document.getElementById('plMenuClose')?.addEventListener('click', plMenuClose);
document.getElementById('plMenuScrim')?.addEventListener('click', plMenuClose);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') plMenuClose(); });
document.getElementById('plMenu')?.addEventListener('click', (e) => {
  const it = e.target?.closest?.('[data-plm]'); if (!it) return;
  const k = it.dataset.plm;
  if (k === 'method') { plMenuClose(); return; } // обычная ссылка
  e.preventDefault(); hap(6); plMenuClose();
  setTimeout(() => { try { window.__route48?.(k); } catch (_) {} }, 120); // v154: те же маршруты, что у разделов Профиля
});
// свайп вправо по панели — закрыть
(() => {
  const panel = document.getElementById('plMenuPanel'); if (!panel) return;
  let x0 = null, y0 = 0, dx = 0;
  panel.addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; }, { passive: true });
  panel.addEventListener('touchmove', (e) => { if (x0 == null) return; const t = e.touches[0]; dx = t.clientX - x0; if (Math.abs(t.clientY - y0) > Math.abs(dx)) { x0 = null; panel.style.transform = ''; return; } if (dx > 0) panel.style.transform = `translateX(${dx}px)`; }, { passive: true });
  panel.addEventListener('touchend', () => { if (x0 == null) return; x0 = null; if (dx > 70) plMenuClose(); else panel.style.transform = ''; });
})();
/* навигация «окошки»: на телефоне без нижнего таббара; домой — Telegram BackButton или ‹ в шапке */
document.documentElement.classList.add('nav-widgets');
document.getElementById('btnHome')?.addEventListener('click', () => { hap(6); goToView('home'); });
function syncHomeBtn() {
  const b = document.getElementById('btnHome'); if (!b) return;
  const onHome = !!document.getElementById('view-home')?.classList.contains('active');
  const tg = !!(window.Telegram?.WebApp?.initData);
  b.hidden = onHome || tg; // в Telegram «назад» — системная кнопка
}
new MutationObserver(syncHomeBtn).observe(document.getElementById('viewHost') || document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
syncHomeBtn();

/* v134: клавиатура iOS (WebView Telegram не сжимает окно — клавиатура ложится поверх). Поднимаем шторку
 * на её высоту по visualViewport, иначе поле ввода и кнопка отправки оказываются под клавиатурой. */
(function kbWatch() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let last = -1;
  const sync = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const v = kb > 80 ? kb : 0;
    if (v === last) return;
    last = v;
    root.style.setProperty('--kb', v + 'px');
    root.classList.toggle('kb-open', v > 0);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || !t.matches?.('#pulseText, #padComText')) return;
    // iOS прокручивает документ к полю внутри fixed-шторки — возвращаем, шторку поднимаем сами
    setTimeout(() => { if (window.scrollY) window.scrollTo(0, 0); sync(); }, 60);
    setTimeout(sync, 350);
  });
  document.addEventListener('focusout', () => setTimeout(sync, 120));
  window.addEventListener('pl-kb-sync', () => { last = -1; sync(); }); // v305
})();
function sheetNavOn() { return document.documentElement.classList.contains('nav-widgets') && !!window.matchMedia?.('(max-width: 900px)').matches; }
/* ——— v124: нижняя панель из трёх пунктов (Дуэли · Paddock · Трассы) → шторка в стиле Telegram ——— */
const TGS = { open: null, homes: new Map(), closing: 0 };
const tgsReduce = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function tgsPark(el, into) { if (!el) return; if (!TGS.homes.has(el)) TGS.homes.set(el, { parent: el.parentNode, next: el.nextSibling }); into.appendChild(el); }
function tgsRestore() {
  document.getElementById('tgSheetPanel')?.classList.remove('has-foot');
  { const pt = document.getElementById('pulseText'); if (pt) pt.style.height = ''; }
  for (const [el, h] of TGS.homes) { try { el.classList.remove('in-sheet', 'pc-foot'); if (h.next && h.next.parentNode === h.parent) h.parent.insertBefore(el, h.next); else h.parent.appendChild(el); } catch (_) {} }
  TGS.homes.clear();
  const tr = document.getElementById('tgTracks'); if (tr) { tr.hidden = true; (document.getElementById('app') || document.body).appendChild(tr); }
}
function tgsFill(kind) {
  const body = document.getElementById('tgSheetBody'); if (!body) return;
  tgsRestore(); body.scrollTop = 0;
  if (kind === 'duels' || kind === 'pulse') {
    const v = document.getElementById('view-' + kind); if (!v) return;
    tgsPark(v, body); v.classList.add('in-sheet');
    if (kind === 'duels') void renderDuelsView();
    else {
      void renderPulse(); try { localStorage.setItem(PULSE_SEEN_KEY, String(Date.now())); } catch (_) {} setBadge('sbBadgePulse', 0);
      const cmp = v.querySelector('.pulse-compose'); const panel = document.getElementById('tgSheetPanel');
      if (cmp && panel) { tgsPark(cmp, panel); cmp.classList.add('pc-foot'); panel.classList.add('has-foot'); }
      if (_padChat) { _padChat.fresh = 0; _hwPadAt = 0; }
    }
  } else if (kind === 'tracks') {
    const tr = document.getElementById('tgTracks'); const slot = document.getElementById('tgTracksSlot');
    tgsPark(document.getElementById('autodromeListPane'), slot); tgsPark(document.getElementById('autodromeDetailPane'), slot);
    try { renderAutodromeList(); } catch (_) {}
    document.getElementById('autodromeListPane')?.removeAttribute('hidden'); document.getElementById('autodromeDetailPane')?.setAttribute('hidden', '');
    if (tr) { tr.hidden = false; body.appendChild(tr); }
  }
  document.getElementById('tgSheet')?.setAttribute('aria-label', kind === 'pulse' ? 'Чат' : 'Трассы');
}
function tgsSetTab(kind) {
  const btn = kind ? document.querySelector(`.sheet-tab[data-sheet="${kind}"]`) : null;
  document.querySelectorAll('.sheet-tab').forEach((b) => b.setAttribute('aria-expanded', b === btn ? 'true' : 'false'));
  if (btn) activateNavBtn(btn); else { document.querySelectorAll('.nav-btn.sheet-tab').forEach((b) => b.classList.remove('active')); syncTabPill(null); }
}
function tgsBgOrigin() { const vh = document.getElementById('viewHost'); if (vh) vh.style.transformOrigin = `50% ${Math.round(window.scrollY + window.innerHeight * 0.35)}px`; }
function openTgSheet(kind) {
  if (kind === 'duels') return; // v206: дуэли убраны
  if (kind === 'pulse') { openChatPage(); return; } // v206: старый оверлей Paddock → полноэкранный Чат
  if (DUELS_OFF && kind === 'duels') { goToView('zamer'); return; } // v197
  if (kind === 'pulse') { closeTgSheet({ instant: true }); openChatPage(); return; } // v205
  const sh = document.getElementById('tgSheet'); const panel = document.getElementById('tgSheetPanel'); if (!sh || !panel) return;
  if (TGS.open === kind) { closeTgSheet(); return; } // повторное нажатие на активный пункт — закрыть
  try { plMenuClose(); } catch (_) {}
  clearTimeout(TGS.closing);
  const was = TGS.open;
  TGS.open = kind;
  tgsSetTab(kind);
  if (was) { // переключение между пунктами: контент сменяется без повторного выезда
    panel.classList.add('swap'); tgsFill(kind); requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove('swap')));
    return;
  }
  tgsFill(kind);
  tgsBgOrigin();
  sh.classList.remove('hidden'); sh.setAttribute('aria-hidden', 'false');
  panel.style.transform = ''; panel.style.transition = '';
  document.documentElement.classList.add('tgs-open');
  requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add('on')));
}
function closeTgSheet(opts = {}) {
  const sh = document.getElementById('tgSheet'); const panel = document.getElementById('tgSheetPanel');
  if (!sh || sh.classList.contains('hidden')) return;
  TGS.open = null; tgsSetTab(null);
  sh.classList.remove('on'); sh.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('tgs-open');
  if (panel) { panel.style.transition = ''; panel.style.transform = ''; }
  const done = () => { sh.classList.add('hidden'); tgsRestore(); };
  if (opts.instant || tgsReduce()) done(); else TGS.closing = setTimeout(done, 340);
}
document.getElementById('tabbar')?.addEventListener('click', (e) => {
  const b = e.target?.closest?.('.sheet-tab'); if (!b) return;
  e.preventDefault();
  if (b.dataset.sheet === 'shop') { hap(6); closeTgSheet({ instant: true }); void openShopSheet(); activateNavBtn(b); return; }
  openTgSheet(b.dataset.sheet);
});
document.getElementById('tgSheetScrim')?.addEventListener('click', () => closeTgSheet());
document.getElementById('tgSheetClose')?.addEventListener('click', () => closeTgSheet());
document.getElementById('tgTracksLap')?.addEventListener('click', () => { closeTgSheet({ instant: true }); goToView('lap'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && TGS.open) closeTgSheet(); });
// свайп вниз: за шапку — всегда; по контенту — только когда он прокручен в самый верх и тянут вниз
(() => {
  const panel = document.getElementById('tgSheetPanel'); const body = document.getElementById('tgSheetBody'); if (!panel || !body) return;
  let y0 = null, x0 = 0, t0 = 0, dy = 0, dragging = false, fromHead = false;
  panel.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; y0 = t.clientY; x0 = t.clientX; t0 = performance.now(); dy = 0; dragging = false;
    fromHead = !!e.target.closest('.tgs-head');
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const t = e.touches[0]; const d = t.clientY - y0;
    if (!dragging) {
      if (Math.abs(t.clientX - x0) > Math.abs(d)) { y0 = null; return; } // горизонтальный жест (карусели и т.п.)
      if (d > 6 && (fromHead || body.scrollTop <= 0) && !e.target.closest('input, textarea, select, .home-rail, [data-no-sheet-drag]')) { dragging = true; panel.style.transition = 'none'; }
      else if (d < -4 || (!fromHead && body.scrollTop > 0)) { y0 = null; return; }
    }
    if (dragging) { dy = Math.max(0, d); e.preventDefault(); panel.style.transform = `translate3d(0, ${dy}px, 0)`; }
  }, { passive: false });
  const end = () => {
    if (y0 == null) return; y0 = null;
    if (!dragging) return;
    dragging = false;
    const v = dy / Math.max(1, performance.now() - t0);
    panel.style.transition = '';
    if (dy > 120 || (v > 0.55 && dy > 40)) closeTgSheet(); else panel.style.transform = '';
  };
  panel.addEventListener('touchend', end); panel.addEventListener('touchcancel', end);
})();
// любой переход на вид — шторка закрывается (раздел вернулся на место)

/* бейджи — только реальные счётчики: вызовы в дуэлях; новые посты Paddock с последнего просмотра */
const PULSE_SEEN_KEY = 'pitlane-pulse-seen-v1';
function setBadge(id, n) { const b = document.getElementById(id); if (!b) return; b.hidden = !(n > 0); b.textContent = n > 9 ? '9+' : String(n || ''); }
let _badgesAt = 0;
async function refreshSheetBadges(force = false) {
  if (!force && Date.now() - _badgesAt < 45000) return;
  _badgesAt = Date.now();
  try { const rows = await fetchMyDuels(); setBadge('sbBadgeDuels', rows.filter((d) => duelCategory(d) === 'inbox').length); } catch (_) {}
  try {
    let seen = Number(localStorage.getItem(PULSE_SEEN_KEY) || 0);
    if (!seen) { seen = Date.now(); localStorage.setItem(PULSE_SEEN_KEY, String(seen)); } // первый запуск: «новое» — только то, что появится после
    const d = await padChatData();
    if (TGS.open !== 'pulse') setBadge('sbBadgePulse', d.fresh);
  } catch (_) {}
}
setInterval(() => { if (!document.hidden) void refreshSheetBadges(); }, 60000);
setTimeout(() => { void refreshSheetBadges(true); }, 1500);
/* v120: главная кнопка «Сделать замер» и единственный шаг онбординга (без модалок, ничего не блокирует) */
const FIRST_RUN_KEY = 'pitlane-first-run-v1';
function hasAnyRun() {
  try { if (localStorage.getItem(FIRST_RUN_KEY)) return true; } catch (_) {}
  const has = (o) => !!o && Object.values(o).some((x) => x && Object.keys(x).length);
  return has(state.dragBest) || has(state.dragBestC) || (Array.isArray(state.slips) && state.slips.length > 0);
}
/* v122: премиальный CTA «Замер» — шкала 0–100, живой статус GPS только из реальных данных (источник, точность последнего фикса, доступ) */
let _homeLastFix = null; // { acc, at } — последний настоящий фикс (телефон / внешний GPS), ничего не выдумываем
let _geoPerm = 'unknown';
function homeGoBuildTicks() {
  const g = document.getElementById('homeGoTicks');
  if (!g || g.childNodes.length) return;
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i <= 20; i++) {
    const mj = i % 2 === 0;
    const ang = (135 + i * 13.5) * Math.PI / 180;
    const r1 = 44, r2 = mj ? 37.5 : 40.5;
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', (60 + r1 * Math.cos(ang)).toFixed(2)); ln.setAttribute('y1', (60 + r1 * Math.sin(ang)).toFixed(2));
    ln.setAttribute('x2', (60 + r2 * Math.cos(ang)).toFixed(2)); ln.setAttribute('y2', (60 + r2 * Math.sin(ang)).toFixed(2));
    if (mj) ln.setAttribute('class', 'mj');
    g.appendChild(ln);
  }
}
function homeGoGpsStatus() {
  const st = (typeof extGps !== 'undefined' && extGps?.state?.()) || 'off';
  const ext = st === 'wifi' || st === 'ble';
  const src = st === 'wifi' ? 'Внешний GPS · Wi-Fi' : st === 'ble' ? 'Внешний GPS · Bluetooth' : st === 'sim' ? 'Симулятор' : 'Телефон';
  if (ext) { // v219: чип — спокойно и заметно: «Чип · 25 Гц · Wi-Fi»
    let hzN = 0; try { const i = extGps.info(); hzN = i?.status?.rateHz || (i?.hz >= 18 ? 25 : i?.hz >= 8 ? 10 : Math.round(i?.hz || 0)); } catch (_) {}
    return { text: 'Чип' + (hzN ? ' · ' + hzN + ' Гц' : '') + ' · ' + (st === 'wifi' ? 'Wi-Fi' : 'Bluetooth'), q: 'chip' };
  }
  const fix = _homeLastFix;
  if (fix && Date.now() - fix.at < 15000 && Number.isFinite(fix.acc) && fix.acc > 0) {
    const acc = fix.acc;
    return { text: src + ' · ±' + (acc < 10 ? acc.toFixed(1).replace('.0', '') : Math.round(acc)) + ' м', q: acc <= 3 ? 'good' : acc <= 10 ? 'mid' : 'bad' };
  }
  if (ext) return { text: src + ' · на связи', q: 'mid' };
  if (st === 'sim') return { text: src, q: 'mid' };
  if (_geoPerm === 'denied') return { text: 'Телефон · нет доступа к геопозиции', q: 'bad' };
  if (_geoPerm === 'granted') return { text: 'Телефон · GPS доступен', q: 'idle' };
  return { text: 'Телефон · GPS включится на старте', q: 'idle' };
}
function renderHomeGoGps() {
  const el = document.getElementById('homeGoGps'); const v = document.getElementById('homeGoGpsV');
  if (!el || !v) return;
  const s = homeGoGpsStatus();
  if (v.textContent !== s.text) v.textContent = s.text;
  if (el.dataset.q !== s.q) el.dataset.q = s.q;
}
function renderHomeGo() {
  homeGoBuildTicks();
  renderHomeGoGps();
  const bestEl = document.getElementById('homeGoBest');
  if (!bestEl) return;
  // v123: одна правда с виджетами — лучший 0–100 текущей машины (локально + сервер), C только если нет A/B
  let best = null;
  try { best = homeBest0100(homeHeroCarId(), _homeCache?.at && Date.now() - _homeCache.at < 120000 ? _homeCache : null); } catch (_) { best = null; }
  bestEl.hidden = !best;
  bestEl.replaceChildren();
  if (best) {
    bestEl.append(document.createTextNode('лучший 0–100'));
    const b = document.createElement('b'); b.textContent = best.t.toFixed(2) + ' с' + (best.cls === 'c' ? ' · C' : '');
    bestEl.append(b);
  }
}
try {
  navigator.permissions?.query?.({ name: 'geolocation' }).then((p) => {
    _geoPerm = p.state; renderHomeGoGps();
    p.onchange = () => { _geoPerm = p.state; renderHomeGoGps(); };
  }).catch(() => {});
} catch (_) {}
setInterval(() => {
  if (document.hidden || !document.getElementById('view-home')?.classList.contains('active')) return;
  renderHomeGoGps();
}, 2000);
(() => {
  const btn = document.getElementById('homeGoBtn'); const box = document.getElementById('homeGo');
  if (!btn) return;
  const on = () => { btn.classList.add('is-pressed'); box?.classList.add('is-pressed'); };
  const off = () => { btn.classList.remove('is-pressed'); box?.classList.remove('is-pressed'); };
  btn.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'pointerleave'].forEach((e) => btn.addEventListener(e, off));
})();
function markFirstRun() {
  try {
    if (localStorage.getItem(FIRST_RUN_KEY)) return;
    // метрика v120 (только локально, никуда не отправляется): мс от открытия до первого «Старт»
    localStorage.setItem(FIRST_RUN_KEY, JSON.stringify({ at: Date.now(), msFromOpen: Math.round(performance.now()) }));
  } catch (_) {}
  try { renderHomeGo(); } catch (_) {}
}
document.getElementById('view-home')?.addEventListener('click', (e) => {
  const t = e.target;
  const hq = t?.closest?.('[data-hq]');
  if (hq) { homeQuick(hq.dataset.hq); return; }
  const car = t?.closest?.('.hcar[data-car]');
  if (car) { openCarInGarage(car.dataset.car); return; }
  const pil = t?.closest?.('#homeLeaders [data-pilot], #homeTrackTop [data-pilot]');
  if (pil) { void openPilotProfile(pil.dataset.pilot); return; }
  const duel = t?.closest?.('#homeDuels .duel-card[data-duel-id]');
  if (duel) { hap(8); goToView('duels'); openDuelSheet({ duelId: duel.dataset.duelId }); return; }
  const post = t?.closest?.('.hp-card[data-post]');
  if (post) { hap(8); void openPostInPaddock(post.dataset.post); return; }
  if (t?.closest?.('#homeHeroStage, #homeHeroGarage')) { openCarInGarage(document.getElementById('homeHero')?.dataset.car); return; }
  if (t?.closest?.('#homeHeroRun')) { homeQuick('run'); return; }
  if (t?.closest?.('#homeTrackOpen, #homeTrack')) {
    const id = document.getElementById('homeTrack')?.dataset.track;
    if (id) { _topsSel = { kind: 'lap', id }; try { localStorage.setItem('pitlane-tops-sel-v1', JSON.stringify(_topsSel)); } catch (_) {} }
    const box = document.getElementById('topsChips'); if (box) delete box.dataset.scrolled;
    goToView('tops');
    return;
  }
  if (t?.closest?.('#homeLeadersOpen')) {
    _topsSel = { kind: 'drag', id: '0-100' };
    try { localStorage.setItem('pitlane-tops-sel-v1', JSON.stringify(_topsSel)); } catch (_) {}
    const box = document.getElementById('topsChips'); if (box) delete box.dataset.scrolled;
    goToView('tops');
    return;
  }
  const v = t?.closest?.('.home-sec-head [data-view], .home-empty [data-view]');
  if (v) goToView(v.dataset.view);
});

/* ——— Дуэли ——— */
let _duelsTab = 'active';
const DUEL_INBOX_KEY = 'pitlane-duels-inbox-v1';
function rememberInboxDuel(id) {
  if (!id || !/^[\w-]{4,64}$/.test(id)) return;
  try {
    const arr = JSON.parse(localStorage.getItem(DUEL_INBOX_KEY) || '[]');
    const out = [id, ...(Array.isArray(arr) ? arr : [])].filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i).slice(0, 10);
    localStorage.setItem(DUEL_INBOX_KEY, JSON.stringify(out));
  } catch (_) {}
}
function inboxDuelIds() {
  try { const a = JSON.parse(localStorage.getItem(DUEL_INBOX_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch (_) { return []; }
}
function duelIsMine(id) {
  if (!id) return false;
  try { return id === duelPilotId() || isMyPilotId(id); } catch (_) { return false; }
}
function duelCategory(d) {
  if (d.status === 'ready' || d.status === 'expired') return 'done';
  if (!duelIsMine(d.createdBy?.id) && !duelIsMine(d.challenger?.id)) return 'inbox';
  return 'active';
}
function duelTypeLabel(d) {
  if (d.type === 'lap') return 'Круг · ' + (TRACKS.find((x) => x.id === d.trackId)?.name || d.trackId || 'трасса');
  return '0–100 км/ч';
}
function duelTimeText(d, runRow) {
  if (!runRow) return '';
  return d.type === 'drag' ? Number(runRow.t).toFixed(2) + ' с' : String(runRow.t);
}
function duelStatusText(d) {
  if (d.status === 'expired') return 'истекла';
  if (d.status === 'ready') {
    if (d.winner === 'tie') return 'ничья';
    const meWin = (d.winner === 'creator' && duelIsMine(d.createdBy?.id)) || (d.winner === 'challenger' && duelIsMine(d.challenger?.id));
    const meIn = duelIsMine(d.createdBy?.id) || duelIsMine(d.challenger?.id);
    return meIn ? (meWin ? 'победа' : 'поражение') : 'завершена';
  }
  const left = d.expiresAt ? Math.max(0, Math.ceil((d.expiresAt - Date.now()) / 86400000)) : null;
  const cat = duelCategory(d);
  let s = cat === 'inbox' ? 'тебя вызвали' : (!d.challenger ? 'ждём соперника' : 'идёт');
  if (left != null) s += ' · ' + left + ' д';
  return s;
}
function duelSideEl(d, key) {
  const who = key === 'creator' ? d.createdBy : d.challenger;
  const runRow = key === 'creator' ? d.creatorRun : d.challengerRun;
  const side = padEl('span', 'dc-p' + (key === 'challenger' ? ' r' : ''));
  const win = d.status === 'ready' && d.winner === key;
  if (win) side.classList.add('win');
  side.appendChild(padAvatar(who?.name || '?', who?.avatar, 38));
  const txt = padEl('span', 'dc-pt');
  txt.appendChild(padEl('b', '', who ? clipText(who.name || 'пилот', 12) : 'соперник?'));
  const sub = runRow ? [duelTimeText(d, runRow), shortCarName(runRow.car, runRow.carId)].filter(Boolean).join(' · ') : (who ? 'ждём заезд' : 'по ссылке');
  txt.appendChild(padEl('span', '', sub));
  side.appendChild(txt);
  return side;
}
function buildDuelCard(d) {
  const card = padEl('button', 'duel-card cat-' + duelCategory(d));
  card.type = 'button';
  card.dataset.duelId = d.id;
  const top = padEl('span', 'dc-top');
  top.appendChild(padEl('span', 'dc-type', duelTypeLabel(d)));
  top.appendChild(padEl('span', 'dc-st st-' + (d.status || 'open'), duelStatusText(d)));
  card.appendChild(top);
  const vs = padEl('span', 'dc-vs');
  vs.appendChild(duelSideEl(d, 'creator'));
  vs.appendChild(padEl('span', 'dc-x', 'VS'));
  vs.appendChild(duelSideEl(d, 'challenger'));
  card.appendChild(vs);
  return card;
}
let _duelsLoading = false;
/* ———————— v114: сезон экипажей (месяц МСК) — таблица + шейр текстом / картинкой ———————— */
let _season = null;
let _seasonSeq = 0;
const SEASON_TRACK_KEY = 'pitlane-season-track-v1';
function seasonLapStr(ms) { return Number.isFinite(ms) ? formatMs(ms) : '—'; }
function seasonRow(i, team, sub, time, need) {
  const li = padEl('li', 'tb-row season-row' + (i < 3 && !need ? ' podium p' + (i + 1) : '') + (need ? ' season-need' : ''));
  li.appendChild(padEl('span', 'tb-n', need ? '·' : String(i + 1)));
  const av = team.avatarV ? api.teamAvatarUrl(team.id, team.avatarV) : '';
  li.appendChild(padAvatar(team.name || 'К', av || null, 28));
  li.appendChild(padEl('span', 'tb-nick', clipText(team.name || 'команда', 16)));
  li.appendChild(padEl('span', 'tb-car season-pilots', sub));
  li.appendChild(padEl('span', 'tb-ic'));
  li.appendChild(padEl('span', 'tb-t' + (need ? ' season-need-t' : ''), time));
  return li;
}
async function renderCrewSeason() {
  if (TEAMS_OFF) return; // v198: команды/экипажи убраны
  const card = document.getElementById('seasonCard');
  if (!card) return;
  const sel = document.getElementById('seasonTrack');
  if (sel && !sel.childElementCount) {
    TRACKS.forEach((t) => { const o = padEl('option', '', t.name); o.value = t.id; sel.appendChild(o); });
    let pick = '';
    try { pick = localStorage.getItem(SEASON_TRACK_KEY) || ''; } catch (_) {}
    sel.value = TRACKS.some((t) => t.id === pick) ? pick : (state.trackId && TRACKS.some((t) => t.id === state.trackId) ? state.trackId : TRACKS[0]?.id);
  }
  const trackId = sel?.value || TRACKS[0]?.id;
  const lapOl = document.getElementById('seasonLap');
  const dragOl = document.getElementById('seasonDrag');
  const msg = document.getElementById('seasonMsg');
  const seq = ++_seasonSeq;
  if (!isRemoteApi()) { if (msg) msg.textContent = 'Сезон считается на сервере — нужен интернет.'; return; }
  lapOl?.setAttribute('aria-busy', 'true');
  const r = await api.getCrewSeason('', trackId).catch(() => null);
  if (seq !== _seasonSeq) return;
  lapOl?.removeAttribute('aria-busy');
  _season = r && r.ok ? r : null;
  // v120: сезон — только когда есть хотя бы SHOW_MIN.season зачтённых строк
  showWhen(card, !!_season && ((_season.lap || []).filter((x) => !x.need).length + (_season.drag || []).length) >= SHOW_MIN.season);
  const mEl = document.getElementById('seasonMonth');
  if (mEl) mEl.textContent = _season ? _season.label : '—';
  const empty = (ol, b, sub) => { const li = padEl('li', 'tb-empty'); li.appendChild(padEl('b', '', b)); if (sub) li.appendChild(padEl('span', '', sub)); ol.appendChild(li); };
  if (lapOl) {
    lapOl.replaceChildren();
    if (!_season) empty(lapOl, 'не удалось загрузить сезон', 'Проверь сеть и открой ещё раз.');
    else if (!_season.lap.length) empty(lapOl, 'в этом месяце на трассе пока нет зачтённых кругов экипажей', _season.teams ? 'Проедь круг A/B — он сразу попадёт в зачёт твоей команды.' : 'Публичных команд пока нет — собери свою в разделе команд.');
    else {
      let rank = 0;
      _season.lap.forEach((x) => {
        const sub = x.pilots.map((p) => p.nick + ' ' + seasonLapStr(p.ms)).join(' · ');
        if (x.need) lapOl.appendChild(seasonRow(0, x.team, sub, 'не хватает ' + x.need, true));
        else lapOl.appendChild(seasonRow(rank++, x.team, sub, seasonLapStr(x.sumMs), false));
      });
    }
  }
  if (dragOl) {
    dragOl.replaceChildren();
    if (_season && !_season.drag.length) empty(dragOl, 'в этом месяце 0–100 экипажей с внешним GPS пока нет', '');
    else if (_season) _season.drag.forEach((x, i) => dragOl.appendChild(seasonRow(i, x.team, x.nick + ' · ' + shortCarName(x.car, x.carId), Number(x.t).toFixed(2), false)));
  }
  if (msg) msg.textContent = '';
}
function seasonShareText() {
  const s = _season;
  if (!s) return '';
  const tr = TRACKS.find((t) => t.id === s.trackId)?.name || s.trackId || '';
  const lines = ['PITLANE · сезон экипажей · ' + s.label, 'Таблица на субботу · ' + tr, '', 'Круг — сумма 3 лучших пилотов (GPS A/B):'];
  if (!s.lap.length) lines.push('пока нет зачтённых кругов');
  let rank = 1;
  s.lap.forEach((x) => {
    const who = x.pilots.map((p) => p.nick + ' ' + seasonLapStr(p.ms)).join(', ');
    lines.push(x.need ? `· ${x.team.name} — не хватает ${x.need} (${who})` : `${rank++}. ${x.team.name} — ${seasonLapStr(x.sumMs)} (${who})`);
  });
  lines.push('', '0–100 справочно (внешний GPS ≥10 Гц):');
  if (!s.drag.length) lines.push('пока нет');
  s.drag.slice(0, 10).forEach((x, i) => lines.push(`${i + 1}. ${x.team.name} — ${Number(x.t).toFixed(2)} с (${x.nick})`));
  return lines.join('\n');
}
/** PNG of the table (1080 wide) — graphite + muted accent (v133). */
async function seasonImageBlob() {
  const s = _season;
  if (!s) return null;
  try { await document.fonts?.ready; } catch (_) {}
  const W = 1080; const rowH = 92;
  const H = 360 + Math.max(1, s.lap.length) * rowH + 150 + Math.max(1, Math.min(10, s.drag.length)) * rowH + 120;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, W, H);
  const NEON = '#C9C6BF'; const TXT = '#f2f2f2'; const MUTE = '#8a8a8a';
  const font = (w, px) => `${w} ${px}px "Golos Text", "PL Sans", system-ui, sans-serif`;
  g.fillStyle = MUTE; g.font = font(700, 30); g.fillText('P I T L A N E', 64, 90);
  g.fillStyle = TXT; g.font = font(700, 64); g.fillText('Сезон экипажей', 64, 180);
  const tr = TRACKS.find((t) => t.id === s.trackId)?.name || s.trackId || '';
  g.fillStyle = NEON; g.font = font(600, 34); g.fillText(s.label + ' · ' + tr, 64, 236);
  g.fillStyle = MUTE; g.font = font(500, 26); g.fillText('Круг: сумма 3 лучших пилотов · только GPS A/B', 64, 290);
  let y = 340;
  const clip = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t));
  const row = (n, name, sub, time, dim) => {
    g.strokeStyle = '#262626'; g.beginPath(); g.moveTo(64, y); g.lineTo(W - 64, y); g.stroke();
    g.fillStyle = dim ? MUTE : (n === '1' ? NEON : TXT); g.font = font(700, 34); g.fillText(n, 64, y + 56);
    g.fillStyle = TXT; g.font = font(700, 34); g.fillText(clip(name, 22), 120, y + 46);
    g.fillStyle = MUTE; g.font = font(500, 22); g.fillText(clip(sub, 60), 120, y + 78);
    g.fillStyle = dim ? MUTE : TXT; g.font = font(dim ? 600 : 700, dim ? 28 : 44); g.textAlign = 'right'; g.fillText(time, W - 64, y + 58); g.textAlign = 'left';
    y += rowH;
  };
  if (!s.lap.length) row('·', 'пока нет зачтённых кругов', '', '', true);
  let rank = 1;
  s.lap.forEach((x) => {
    const sub = x.pilots.map((p) => p.nick + ' ' + seasonLapStr(p.ms)).join(' · ');
    if (x.need) row('·', x.team.name, sub, 'не хватает ' + x.need, true);
    else row(String(rank++), x.team.name, sub, seasonLapStr(x.sumMs), false);
  });
  y += 40;
  g.fillStyle = MUTE; g.font = font(600, 26); g.fillText('0–100 · справочно · внешний GPS ≥ 10 Гц', 64, y + 20); y += 50;
  if (!s.drag.length) row('·', 'пока нет', '', '', true);
  s.drag.slice(0, 10).forEach((x, i) => row(String(i + 1), x.team.name, x.nick + ' · ' + shortCarName(x.car, x.carId), Number(x.t).toFixed(2), false));
  g.fillStyle = MUTE; g.font = font(500, 22); g.fillText('месяц по МСК · честный GPS · pitlane', 64, H - 50);
  return await new Promise((res) => c.toBlob(res, 'image/png'));
}
document.getElementById('seasonTrack')?.addEventListener('change', (e) => {
  try { localStorage.setItem(SEASON_TRACK_KEY, e.target.value); } catch (_) {}
  void renderCrewSeason();
});
document.getElementById('seasonShareText')?.addEventListener('click', async () => {
  const text = seasonShareText();
  const msg = document.getElementById('seasonMsg');
  if (!text) { if (msg) msg.textContent = 'Таблица ещё не загрузилась.'; return; }
  const url = SHARE_ORIGIN;
  if (isTMA) { await shareViaTelegram('', url, text); return; }
  try { if (navigator.share) { await navigator.share({ title: 'PITLANE · сезон экипажей', text, url }); return; } } catch (err) { if (err?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text + '\n' + url); if (msg) msg.textContent = 'Скопировано — вставь в чат.'; hap(20); } catch (_) { if (msg) msg.textContent = 'Не удалось скопировать.'; }
});
document.getElementById('seasonShareImg')?.addEventListener('click', async () => {
  const msg = document.getElementById('seasonMsg');
  const blob = await seasonImageBlob().catch(() => null);
  if (!blob) { if (msg) msg.textContent = 'Таблица ещё не загрузилась.'; return; }
  const file = new File([blob], 'pitlane-season.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'PITLANE · сезон экипажей' }); return; }
  } catch (err) { if (err?.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'pitlane-season.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  if (msg) msg.textContent = 'Картинка сохранена — отправь её в чат.';
});

async function renderDuelsView() {
  if (DUELS_OFF) return; // v197: дуэли убраны
  try { void renderCrewSeason(); } catch (_) {}
  const list = document.getElementById('duelsList');
  if (!list || _duelsLoading) return;
  _duelsLoading = true;
  try {
    if (!list.childElementCount) list.appendChild(skel171(3, 'Загружаем дуэли'));
    let rows = [];
    if (isRemoteApi()) {
      try { rows = (await api.listMyDuels(duelPilotId())) || []; } catch (_) { rows = []; }
      const have = new Set(rows.map((d) => d.id));
      const extra = inboxDuelIds().filter((id) => !have.has(id)).slice(0, 8);
      const got = await Promise.all(extra.map((id) => api.getDuel(id).catch(() => null)));
      got.forEach((d) => { if (d && d.id) rows.push(d); });
    }
    const cats = { active: [], inbox: [], done: [] };
    rows.forEach((d) => { if (d && d.id) cats[duelCategory(d)].push(d); });
    Object.values(cats).forEach((a) => a.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)));
    document.querySelectorAll('[data-duels-tab]').forEach((b) => {
      const k = b.dataset.duelsTab;
      b.classList.toggle('on', k === _duelsTab);
      b.setAttribute('aria-selected', String(k === _duelsTab));
      const c = b.querySelector('[data-cnt]');
      if (c) c.textContent = cats[k]?.length ? String(cats[k].length) : '';
    });
    list.replaceChildren();
    const cur = cats[_duelsTab] || [];
    if (!cur.length) {
      const e = padEl('div', 'duels-empty');
      const msg = !isRemoteApi() ? ['Дуэли работают онлайн', 'Нужен Worker API.']
        : _duelsTab === 'inbox' ? ['Входящих вызовов нет', '']
          : _duelsTab === 'done' ? ['Завершённых дуэлей нет', '']
            : ['Активных дуэлей нет', ''];
      e.appendChild(padEl('b', '', msg[0]));
      if (msg[1]) e.appendChild(padEl('span', '', msg[1]));
      if (_duelsTab !== 'done' && isRemoteApi()) {
        const b = padEl('button', 'go-btn duels-empty-go', 'Вызвать');
        b.type = 'button';
        b.addEventListener('click', () => openDuelSheet({ createOnly: true }));
        e.appendChild(b);
      }
      list.appendChild(e);
      return;
    }
    cur.slice(0, 30).forEach((d) => list.appendChild(buildDuelCard(d)));
  } finally { _duelsLoading = false; }
}
document.querySelectorAll('[data-duels-tab]').forEach((b) => b.addEventListener('click', () => {
  _duelsTab = b.dataset.duelsTab || 'active';
  hap(6);
  void renderDuelsView();
}));
document.getElementById('duelsList')?.addEventListener('click', (e) => {
  const c = e.target?.closest?.('.duel-card[data-duel-id]');
  if (c) { hap(8); openDuelSheet({ duelId: c.dataset.duelId }); }
});
document.getElementById('duelsPaste')?.addEventListener('click', () => {
  document.getElementById('duelPasteOpen')?.click();
});

/* VS-анимация: пилоты съезжаются, неоновое VS, вспышка, вибрация. */
let _vsFxBusy = false;
function playDuelVsFx(left, right, caption) {
  if (DUELS_OFF) return Promise.resolve(); // v197: дуэли убраны
  const fx = document.getElementById('duelVsFx');
  if (!fx || _vsFxBusy) return Promise.resolve();
  _vsFxBusy = true;
  const fill = (side, p) => {
    const ava = document.getElementById('dvfAva' + side);
    if (ava) { ava.replaceChildren(padAvatar(p?.unknown ? '?' : (p?.name || '?'), p?.avatar, 72)); }
    const nm = document.getElementById('dvfName' + side);
    if (nm) nm.textContent = clipText(p?.name || 'соперник?', 12);
    const car = document.getElementById('dvfCar' + side);
    if (car) car.textContent = p?.car ? shortCarName(p.car, p.carId) : (p?.carHint || '');
  };
  fill('L', left);
  fill('R', right);
  const cap = document.getElementById('dvfCap');
  if (cap) cap.textContent = caption || '';
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  fx.classList.remove('hidden', 'play', 'out');
  fx.setAttribute('aria-hidden', 'false');
  void fx.offsetWidth;
  fx.classList.add('play');
  if (reduce) fx.classList.add('reduce');
  const hitAt = reduce ? 50 : 560;
  setTimeout(() => {
    try { if (!tmaHaptic('heavy') && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.([40, 30, 80]); } catch (_) {}
    setTimeout(() => { try { tmaHaptic('success'); } catch (_) {} }, 180);
  }, hitAt);
  return new Promise((resolve) => {
    setTimeout(() => fx.classList.add('out'), reduce ? 700 : 1700);
    setTimeout(() => {
      fx.classList.add('hidden');
      fx.classList.remove('play', 'out', 'reduce');
      fx.setAttribute('aria-hidden', 'true');
      _vsFxBusy = false;
      resolve();
    }, reduce ? 900 : 2050);
  });
}
function myDuelPerson() {
  const p = profile();
  const car = currentCar?.();
  return { name: duelPilotNick(), avatar: p?.avatar, car: car?.name, carId: car?.id };
}
window.__plVsFx = playDuelVsFx;

/* ——— Компактные топы: чипы (дисциплины + трассы) и одна строка на запись ——— */
const TOPS_SEL_KEY = 'pitlane-tops-sel-v1';
let _topsSel = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(TOPS_SEL_KEY) || 'null');
    if (s && (s.kind === 'drag' || s.kind === 'lap') && typeof s.id === 'string') return s;
  } catch (_) {}
  return { kind: 'drag', id: '0-100' };
})();
/* v271: дисциплины — разгоны + «Круг»; список трасс показывается только для круга */
let _topsLastTrack = (() => { try { return localStorage.getItem('pitlane-tops-track-v1') || ''; } catch (_) { return ''; } })();
function renderTopsChips() {
  const box = document.getElementById('topsChips');
  const trk = document.getElementById('topsTracks');
  if (!box) return;
  if (_topsSel.kind === 'lap' && _topsSel.id) { _topsLastTrack = _topsSel.id; try { localStorage.setItem('pitlane-tops-track-v1', _topsSel.id); } catch (_) {} }
  // v272: дисциплины — карточки со временем лидера и твоим местом (свайп)
  if (!box.childElementCount) {
    const mk = (kind, id, cap, label) => {
      const b = padEl('button', 'tchip t72-dc');
      b.type = 'button'; b.dataset.kind = kind; b.dataset.id = id;
      b.appendChild(padEl('span', 't72-dc-cap', cap));
      b.appendChild(padEl('b', 't72-dc-t', label));
      b.appendChild(padEl('span', 't72-dc-sub', ' '));
      box.appendChild(b);
    };
    // v279: 4 главные дисциплины + «Ещё» (остальные раскрываются)
    const MAIN = ['0-100', '100-200', '402m'];
    DRAG_DISC.filter((d) => MAIN.includes(d.id)).forEach((d) => mk('drag', d.id, 'Разгон', d.label));
    mk('lap', '', 'Круг', 'Время круга');
    DRAG_DISC.filter((d) => !MAIN.includes(d.id)).forEach((d) => { mk('drag', d.id, 'Разгон', d.label); box.lastChild.classList.add('t72-x'); });
    const more = padEl('button', 't72-dc t72-more'); more.type = 'button';
    more.appendChild(padEl('span', 't72-dc-cap', 'Все'));
    more.appendChild(padEl('b', 't72-dc-t', 'Ещё'));
    more.appendChild(padEl('span', 't72-dc-sub', (DRAG_DISC.length - MAIN.length) + ' дисциплин'));
    more.addEventListener('click', (e) => { e.stopPropagation(); hap(6); const on = box.dataset.more !== '1'; if (on) box.dataset.more = '1'; else delete box.dataset.more; more.querySelector('.t72-dc-t').textContent = on ? 'Свернуть' : 'Ещё'; t72SyncDots(); });
    box.appendChild(more);
    box.addEventListener('scroll', () => t72SyncDots(), { passive: true });
  }
  if (trk && !trk.childElementCount) TRACKS.forEach((t) => {
    const b = padEl('button', 'tchip t72-tc');
    b.type = 'button'; b.dataset.kind = 'lap'; b.dataset.id = t.id;
    b.appendChild(trackSilhouetteSvg(t.id, 34, 'tchip-trk'));
    const tx = padEl('span', 't72-tc-tx');
    tx.appendChild(padEl('b', '', t.name));
    tx.appendChild(padEl('small', '', t.km ? t.km + ' км' : 'круг'));
    b.appendChild(tx);
    trk.appendChild(b);
  });
  const isLap = _topsSel.kind === 'lap';
  if (trk) trk.hidden = !isLap;
  const cap = document.getElementById('topsTracksCap'); if (cap) cap.hidden = !isLap;
  let onEl = null, onTrk = null;
  box.querySelectorAll('.tchip').forEach((b) => {
    const on = b.dataset.kind === 'lap' ? isLap : (!isLap && b.dataset.id === _topsSel.id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    if (on) onEl = b;
  });
  trk?.querySelectorAll('.tchip').forEach((b) => {
    const on = isLap && b.dataset.id === _topsSel.id;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    if (on) onTrk = b;
  });
  // v282: без прыжка влево — подложка плавно едет к выбранной карточке, прокрутка только если та вне экрана (по центру, smooth)
  t282Ind(box, onEl);
  for (const [host, el] of [[box, onEl], [trk, onTrk]]) {
    if (!host || !el || host.dataset.scrolled === (el.dataset.id || 'lap')) continue;
    const first = !host.dataset.scrolled;
    host.dataset.scrolled = el.dataset.id || 'lap';
    try {
      const hr = host.getBoundingClientRect(), er = el.getBoundingClientRect();
      if (er.left >= hr.left + 8 && er.right <= hr.right - 8) continue;
      const to = Math.max(0, host.scrollLeft + (er.left - hr.left) - (hr.width - er.width) / 2);
      host.scrollTo({ left: to, behavior: first || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (_) {}
  }
  t72SyncDots();
  syncTopsQuick();
}
function t72SyncDots() {
  const box = document.getElementById('topsChips'); const d = document.getElementById('t72Dots');
  if (!box || !d) return;
  const n = [...box.children].filter((c) => c.offsetParent !== null && !c.classList.contains("t72-ind")).length; if (!n) return;
  if (d.childElementCount !== n) d.replaceChildren(...Array.from({ length: n }, () => padEl('i')));
  const w = box.scrollWidth - box.clientWidth;
  const k = w > 0 ? Math.round((box.scrollLeft / w) * (n - 1)) : 0;
  [...d.children].forEach((x, i) => x.classList.toggle('on', i === k));
}
function syncTopsQuick() {
  for (const [lab, id] of [['tqCity', 'topMyCityOnly'], ['tqCar', 'topMyCarOnly']]) {
    const l = document.getElementById(lab); const c = document.getElementById(id);
    if (l && c) l.classList.toggle('on', !!c.checked);
  }
  const cs = document.querySelector('#tqCity span'); if (cs) cs.textContent = document.getElementById('topMyCityOnly')?.checked && myCity() ? myCity() : 'Мой город';
}
function lapMs(t) {
  try { const v = parseLapMsClient(t); if (Number.isFinite(v) && v > 0) return v; } catch (_) {}
  const m = String(t || '').match(/^(\d+):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return Infinity;
  return (+m[1] * 60 + +m[2]) * 1000 + (m[3] ? +m[3].padEnd(3, '0') : 0);
}
function buildTopsRow(r, i, sel, ctx) {
  const li = padEl('li', 'tb-row' + (i < 3 ? ' podium p' + (i + 1) : ''));
  const pid = r.pilotId && isPublicPilot(r.pilotId) ? r.pilotId : '';
  if (pid) {
    li.dataset.pilot = pid;
    if (r.at) li.dataset.at = String(r.at);
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
  }
  li.appendChild(padEl('span', 'tb-n', String(i + 1)));
  const lb = sel.kind === 'lap' && ctx; // v192: строка лидерборда v11 — рамка, значок у ника, отрыв, рендер машины
  if (lb) {
    li.classList.add('lb92');
    const pp = r.pp && typeof r.pp === 'object' ? r.pp : null;
    const fr = i < 3 ? ['gold', 'silver', 'bronze'][i] : (pp ? passFrame(pp.frame) : '');
    li.appendChild(framedAvatar(padAvatar(r.name || 'P', r.avatar, 32), fr, 32));
  } else li.appendChild(padAvatar(r.name || 'P', r.avatar, 28));
  const nick = padEl('span', 'tb-nick', clipText(r.name || 'пилот', 12));
  if ((r.name || '').length > 12) nick.title = r.name;
  if (lb || (r.pp && typeof r.pp === 'object')) { // v205: Pass-косметика и в топах разгона
    const bk = lb ? rowBadge(ctx.raw, r) : '';
    const pin = r.pp && ['helmet', 'wheel', 'carbon'].includes(r.pp.pin) ? r.pp.pin : '';
    for (const k of [bk, pin].filter(Boolean)) { const b = document.createElement('img'); b.className = 'lb92-b'; b.alt = ''; b.src = awardImg(k, true); b.title = AW_LIST[k]?.n || k; nick.appendChild(b); }
  }
  pnSwTags(r, nick); // v280
  li.appendChild(nick);
  const carEl = padEl('span', 'tb-car', shortCarName(r.car, r.carId) || '');
  // v113: бейдж класса (со слов пилота); старые заезды — «класс не указан»
  const PREP_SHORT = { stock: 'Сток', st1: 'St 1', st2: 'St 2+' };
  const cb = padEl('i', 'tb-cls' + (PREP_SHORT[r.prep] ? ' p-' + r.prep : ' none'), PREP_SHORT[r.prep] ? PREP_SHORT[r.prep] + (r.tyreT === 'semi' ? ' · ПС' : '') : '');
  cb.title = PREP_SHORT[r.prep] ? 'класс со слов пилота: ' + classLine(r) : 'класс не указан';
  carEl.appendChild(cb);
  li.appendChild(carEl);
  const ic = padEl('span', 'tb-ic');
  const crop = lb ? carCropSrc(r.carId) : '';
  if (crop) { ic.classList.add('lb92-car'); const ci = document.createElement('img'); ci.alt = ''; ci.loading = 'lazy'; ci.decoding = 'async'; ci.src = crop; ic.appendChild(ci); }
  else if (lb && r.car && brandLogoKey(r.car)) { ic.classList.add('lb92-car'); ic.appendChild(brandLogoEl(r.car)); } // v293: без фото — эмблема
  else if (sel.kind === 'lap') ic.appendChild(trackSilhouetteSvg(sel.id, 26));
  else ic.appendChild(discTag(sel.id));
  li.appendChild(ic);
  const time = sel.kind === 'lap' ? String(r.t) : Number(r.t).toFixed(2);
  const tm = padEl('span', 'tb-t', time);
  if (r.gpsQ) tm.dataset.q = r.gpsQ;
  // v231: источник замера — «чип» (время подтверждено самим чипом через сервер) / «тел»
  if (r.chip === 1) { const v = padEl('small', 'tb-src chip', 'чип'); v.title = 'подтверждено чипом PITLANE GPS'; tm.appendChild(v); }
  else if (r.src === 'phone' || r.cls === 'c') { const v = padEl('small', 'tb-src', 'тел'); v.title = 'замер телефоном'; tm.appendChild(v); }
  if (lb && i > 0 && ctx.leadMs) tm.appendChild(padEl('small', 'lb92-gap', fmtGap((r._ms ?? lapMs(r.t)) - ctx.leadMs)));
  li.appendChild(tm);
  if (isMyPilotId(r.pilotId)) li.classList.add('me');
  return li;
}
/** v113: tops class filter (stock = Сток на уличных) + «моя машина» (та же модель, что в «Моей машине»). */
let _topsPrep = 'all';
function topsClassPass(r) {
  if (!r) return false;
  const q = _topsPrep;
  if (q === 'stock' && !(r.prep === 'stock' && r.tyreT === 'street')) return false;
  if ((q === 'st1' || q === 'st2') && r.prep !== q) return false;
  if (q === 'semi' && r.tyreT !== 'semi') return false;
  if (q === 'none' && r.prep) return false;
  if (document.getElementById('topMyCarOnly')?.checked) {
    const mc = myCarLocal();
    if (!mc) return false;
    if (mc.carId && r.carId) { if (mc.carId !== r.carId) return false; }
    else if (String(mc.model).trim().toLowerCase() !== String(r.car || '').trim().toLowerCase()) return false;
  }
  if (topsCityOn() && topsCityKey(r.city) !== topsCityKey(myCity())) return false; // v234
  return true;
}
/* v234: топ по городу — город из профиля (необязательное поле, хранится на сервере в /me) */
function myCity() { try { return String(profile()?.city || ''); } catch (_) { return ''; } }
function topsCityKey(c) { return String(c || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}]+/gu, ''); }
function topsCityOn() { return !!document.getElementById('topMyCityOnly')?.checked && !!myCity(); }
function syncTopsCity() { const b = document.getElementById('topCitySet'); if (b) b.textContent = myCity() || 'указать'; }
async function askMyCity() {
  const v = window.prompt('Ваш город (для топа по городу). Пусто — убрать.', myCity());
  if (v == null) return false;
  const c = String(v).replace(/\s+/g, ' ').trim().slice(0, 40);
  const p = profile(); if (c) p.city = c; else delete p.city; saveProf(p);
  if (isRemoteApi() && getSessionToken()) { const r = await api.setCity(c).catch(() => null); if (r && r.ok !== false) { const p2 = profile(); if (r.city) p2.city = r.city; else delete p2.city; saveProf(p2); } }
  syncTopsCity();
  return !!myCity();
}
document.getElementById('topCitySet')?.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); hap(6); await askMyCity(); void renderTopsBoard(); });
document.getElementById('topMyCityOnly')?.addEventListener('change', async (e) => {
  if (e.target.checked && !myCity() && !(await askMyCity())) e.target.checked = false;
  syncTopsQuick(); hap(6); void renderTopsBoard();
});
syncTopsCity();
document.getElementById('topPrepChips')?.addEventListener('click', (e) => {
  const b = e.target?.closest?.('.wx-chip[data-prep]');
  if (!b) return;
  _topsPrep = b.dataset.prep;
  document.querySelectorAll('#topPrepChips .wx-chip').forEach((x) => x.classList.toggle('on', x === b));
  hap(6);
  void renderTopsBoard();
});
document.getElementById('topMyCarOnly')?.addEventListener('change', (e) => { if (e.target.checked && !myCarLocal()) { e.target.checked = false; try { openMyCarSheet(); } catch (_) {} } syncTopsQuick(); hap(6); void renderTopsBoard(); });
let _topsBoardSeq = 0;
/* v192: Неделя / Всё время (только круги) */
let _topsPeriod = (() => { try { return (v => (v === 'week' || v === 'today') ? v : 'all')(localStorage.getItem('pitlane-tops-period')); } catch (_) { return 'all'; } })();
function syncTopsPeriod() { document.querySelectorAll('#topsPeriod [data-per]').forEach((b) => { const on = b.dataset.per === _topsPeriod; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }); const q = document.getElementById('tqPeriod'); if (q) { q.textContent = { today: 'Сегодня', week: 'Неделя', all: 'Всё время' }[_topsPeriod]; q.classList.toggle('on', _topsPeriod !== 'all'); } try { topsActiveLine(); } catch (_) {} }
document.getElementById('topsPeriod')?.addEventListener('click', (e) => {
  const b = e.target?.closest?.('[data-per]'); if (!b) return;
  _topsPeriod = ['week', 'today'].includes(b.dataset.per) ? b.dataset.per : 'all';
  try { localStorage.setItem('pitlane-tops-period', _topsPeriod); } catch (_) {}
  syncTopsPeriod(); hap(6); void renderTopsBoard();
});
syncTopsPeriod();
/* v118: класс зачёта в топах — A/B (внешний GPS) или C (телефон). Доски разные, строки не смешиваются. */
const TOPS_CLS_KEY = 'pitlane-tops-cls-v1';
// v120: переключатель класса теперь в меню «Фильтры» — без явного выбора открываем класс, в котором пилот ездит (нет A/B-результатов → C · телефон)
let _topsCls = (() => {
  try {
    const v = localStorage.getItem(TOPS_CLS_KEY);
    if (v === 'c' || v === 'ab') return v;
    const hasAb = !!state.dragBest && Object.values(state.dragBest).some((x) => x && Object.keys(x).length);
    return hasAb ? 'ab' : 'c';
  } catch (_) { return 'ab'; }
})();
function syncTopsCls() {
  document.querySelectorAll('#topsCls [data-cls]').forEach((b) => {
    const on = b.dataset.cls === _topsCls;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
}
document.getElementById('topsCls')?.addEventListener('click', (e) => {
  const b = e.target?.closest?.('[data-cls]');
  if (!b || b.dataset.cls === _topsCls) return;
  _topsCls = b.dataset.cls === 'c' ? 'c' : 'ab';
  try { localStorage.setItem(TOPS_CLS_KEY, _topsCls); } catch (_) {}
  syncTopsCls();
  void renderTopsBoard();
});
function topsPeriodFilter(rows) {
  if (_topsPeriod === 'all') return rows;
  if (_topsPeriod === 'week') { const ws = awWeekStart(); return rows.filter((r) => Number(r.at) >= ws); }
  const key = moscowDateKeyClient();
  return rows.filter((r) => r && r.at && moscowDateKeyClient(Number(r.at)) === key);
}
/* v272: загрузка доски вынесена — нужна и для карточек дисциплин (лидер + твоё место) */
async function topsLoadRows(sel, cls) {
  const wx = getTopsWeatherFilter();
  const model = document.getElementById('topModelFilter')?.value || '';
  if (cls === 'c' && sel.kind !== 'lap' && PHONE_NO_DISCS.includes(sel.id)) return { rows: [], lapRaw: [], phoneNo: true };
  let rows = [];
  let lapRaw = [];
  try {
    if (sel.kind === 'lap') {
      lapRaw = ((await api.listLapBoard(sel.id, wx, cls)) || []).filter(topsClassPass);
      const best = new Map();
      topsPeriodFilter(lapRaw).forEach((r) => {
        const k = r.pilotId || ('n:' + (r.name || '') + ':' + (r.car || ''));
        const ms = lapMs(r.t);
        if (!Number.isFinite(ms)) return;
        const prev = best.get(k);
        if (!prev || ms < prev._ms) best.set(k, { ...r, _ms: ms });
      });
      rows = [...best.values()];
    } else {
      rows = (await api.listDrag(sel.id, { cls, city: topsCityOn() ? myCity() : '' })) || [];
    }
  } catch (_) { rows = []; }
  // v118: доска C — только строки зачёта C; доска A/B — прежний фильтр (A/B, без телепортов)
  if (cls === 'c') rows = rows.filter((r) => r && r.gps && r.valid !== false && r.gpsQ === 'C' && r.cls === 'c');
  else try { rows = filterTopRows(rows, { model }); } catch (_) {}
  if (cls === 'c' && model) rows = rows.filter((r) => String(r.car || '') === model);
  try { rows = rows.filter(topsClassPass); } catch (_) {}
  if (sel.kind !== 'lap') rows = topsPeriodFilter(rows); // v271: период и для разгонов
  rows = filterRowsByTod(rows); // v128
  rows.forEach((r) => { if (r._ms == null) r._ms = sel.kind === 'lap' ? lapMs(r.t) : Number(r.t) * 1000; });
  rows.sort((a, b) => a._ms - b._ms);
  return { rows, lapRaw, phoneNo: false };
}
function t72Fmt(sel, ms) { return sel.kind === 'lap' ? fmtLapTime(ms) : (ms / 1000).toFixed(2); }
function t72Gap(ms) { const s = Math.abs(ms) / 1000; return (s >= 60 ? Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0') : s.toFixed(2)); }
function t72Ago(at) {
  const d = Date.now() - Number(at); if (!(d >= 0)) return '';
  const h = Math.floor(d / 36e5); if (h < 1) return 'только что'; if (h < 24) return h + ' ч';
  const dd = Math.floor(h / 24); return dd + ' дн';
}
function t72Me(rows) { return rows.findIndex((r) => r && r.pilotId && isMyPilotId(r.pilotId)); }
/* v272: карточки дисциплин — лидер и твоё место (те же фильтры, что и у доски; кэш 60 с) */
const _t72Sum = new Map();
let _t72SumSeq = 0;
function t72SumKey(cls) {
  return [cls, _topsPeriod, _topsPrep, topsTodFilter, getTopsWeatherFilter(), document.getElementById('topModelFilter')?.value || '', document.getElementById('topMyCarOnly')?.checked ? 1 : 0, topsCityOn() ? topsCityKey(myCity()) : ''].join('|');
}
function t72PutSum(b, txt) { const s = b.querySelector('.t72-dc-sub'); if (s) s.textContent = txt; }
function t72SumText(sel, rows, phoneNo) {
  if (phoneNo) return 'не для телефона';
  if (!rows.length) return 'пока пусто';
  const me = t72Me(rows);
  return 'лидер ' + t72Fmt(sel, rows[0]._ms) + (me >= 0 ? ' · ты ' + (me + 1) + '-й' : '');
}
async function t72RenderSums(cls, cur) {
  const box = document.getElementById('topsChips'); if (!box) return;
  const seq = ++_t72SumSeq; const key = t72SumKey(cls);
  const now = Date.now();
  const cards = [...box.querySelectorAll('.t72-dc.tchip')];
  const fill = (b, sel, data) => { t72PutSum(b, sel.kind === 'lap' ? (data.rows.length ? (t72Me(data.rows) >= 0 ? 'ты ' + (t72Me(data.rows) + 1) + '-й · ' : 'лидер ' + t72Fmt(sel, data.rows[0]._ms) + ' · ') + trackShortName(sel.id) : trackShortName(sel.id)) : t72SumText(sel, data.rows, data.phoneNo)); };
  const todo = [];
  for (const b of cards) {
    const sel = b.dataset.kind === 'lap' ? { kind: 'lap', id: _topsSel.kind === 'lap' ? _topsSel.id : (TRACKS.some((t) => t.id === _topsLastTrack) ? _topsLastTrack : TRACKS[0]?.id) } : { kind: 'drag', id: b.dataset.id };
    const k = key + '|' + sel.kind + ':' + sel.id;
    if (cur && cur.sel.kind === sel.kind && cur.sel.id === sel.id) { _t72Sum.set(k, { at: now, data: cur }); fill(b, sel, cur); continue; }
    const c = _t72Sum.get(k);
    if (c && now - c.at < 60000) { fill(b, sel, c.data); continue; }
    todo.push([b, sel, k]);
  }
  for (let i = 0; i < todo.length; i += 3) {
    const part = todo.slice(i, i + 3);
    const res = await Promise.all(part.map(([, sel]) => topsLoadRows(sel, cls).catch(() => ({ rows: [], phoneNo: false }))));
    if (seq !== _t72SumSeq) return;
    part.forEach(([b, sel, k], j) => { _t72Sum.set(k, { at: Date.now(), data: res[j] }); fill(b, sel, res[j]); });
  }
}
/* v272: металлическая карточка лидера — блик по наклону телефона (DeviceOrientation), без датчика — по пальцу/статично */
let _t72TiltOn = false;
function t72Tilt() {
  if (_t72TiltOn) return; _t72TiltOn = true;
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  if (reduce) return;
  const set = (x, y) => {
    const el = document.querySelector('#t72Lead .t72-metal'); if (!el) return;
    el.style.setProperty('--sx', (50 + Math.max(-1, Math.min(1, x)) * 40).toFixed(1) + '%');
    el.style.setProperty('--sy', (50 + Math.max(-1, Math.min(1, y)) * 30).toFixed(1) + '%');
  };
  let raf = 0, nx = 0, ny = 0;
  const q = (x, y) => { nx = x; ny = y; if (!raf) raf = requestAnimationFrame(() => { raf = 0; set(nx, ny); }); };
  try {
    window.addEventListener('deviceorientation', (e) => {
      if (!document.getElementById('view-tops')?.classList.contains('active')) return;
      if (e.gamma == null) return;
      q((e.gamma || 0) / 30, ((e.beta || 45) - 45) / 30);
    }, { passive: true });
  } catch (_) {}
  document.getElementById('t72Lead')?.addEventListener('pointermove', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    q(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  }, { passive: true });
}
function t72Plates(r, host) {
  // косметика — только реальные данные Pass (значок у ника); номеров пока нет — ничего не выдумываем
  const pin = r.pp && ['helmet', 'wheel', 'carbon'].includes(r.pp.pin) ? r.pp.pin : '';
  if (pin) { const b = document.createElement('img'); b.className = 'lb92-b'; b.alt = ''; b.src = awardImg(pin, true); b.title = AW_LIST[pin]?.n || pin; host.appendChild(b); }
  pnSwTags(r, host); // v280
}
/** v280: номер пилота (#NN, Stars) и титул сезона города — только реальные данные сервера. */
function pnSwTags(r, host) {
  if (!r || !host) return;
  if (Number.isInteger(r.pn) && r.pn >= 1 && r.pn <= 99) host.appendChild(padEl('b', 'pn-tag', '#' + r.pn));
  if (r.sw && typeof r.sw.label === 'string') { const t = padEl('i', 'sw-tag', 'чемпион'); t.title = 'Чемпион сезона · ' + r.sw.label; host.appendChild(t); }
}
function t72CarImg(r, cls) {
  const src = carCropSrc(r.carId);
  if (!src) { const w = padEl('span', cls + ' logo293'); if (r.car && brandLogoKey(r.car)) w.appendChild(brandLogoEl(r.car)); else w.classList.add('none'); return w; }
  const w = padEl('span', cls); const im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.src = src;
  im.addEventListener('error', () => w.classList.add('none')); w.appendChild(im); return w;
}
function t72RenderLead(sel, rows) {
  const box = document.getElementById('t72Lead'); if (!box) return;
  const r = rows[0]; box.hidden = !r; box.replaceChildren(); if (!r) return;
  const m = padEl('div', 't72-metal' + (r.pilotId && isPublicPilot(r.pilotId) ? '' : ' nolink'));
  if (r.pilotId && isPublicPilot(r.pilotId)) { m.dataset.pilot = r.pilotId; m.setAttribute('role', 'button'); m.tabIndex = 0; }
  m.appendChild(padEl('i', 't72-sheen'));
  const top = [ '№ 1', topsCityOn() ? myCity() : '', r.at ? 'рекорд ' + t72Ago(r.at) : '' ].filter(Boolean).join(' · ');
  m.appendChild(padEl('span', 't72-lead-cap', top));
  const t = padEl('b', 't72-lead-t', t72Fmt(sel, r._ms)); if (sel.kind !== 'lap') t.appendChild(padEl('small', '', 'с'));
  m.appendChild(t);
  const nm = padEl('span', 't72-lead-name', clipText(r.name || 'пилот', 16)); t72Plates(r, nm);
  if (isMyPilotId(r.pilotId)) nm.appendChild(padEl('em', 't72-you', 'ты'));
  m.appendChild(nm);
  if (r.at && Date.now() - Number(r.at) < 864e5) m.appendChild(padEl('span', 't72-new', 'новый рекорд · ' + t72Ago(r.at)));
  const PREP = { stock: 'Сток', st1: 'Stage 1', st2: 'Stage 2+' };
  const WX = { dry: 'сухо', damp: 'сыро', wet: 'мокро' };
  const foot = [shortCarName(r.car, r.carId) || '', PREP[r.prep] || '', r.tyreT === 'semi' ? 'полуслик' : '', sel.kind === 'lap' ? (WX[r.weather] || '') : '', r.chip === 1 ? 'чип' : ''].filter(Boolean).join(' · ');
  if (foot) m.appendChild(padEl('span', 't72-lead-foot', foot));
  m.appendChild(t72CarImg(r, 't72-lead-car'));
  box.appendChild(m);
  t72Tilt();
}
function t72RenderLine(sel, rows, me) {
  const box = document.getElementById('t72Line'); if (!box) return;
  box.replaceChildren(); box.hidden = rows.length < 2; if (rows.length < 2) return;
  const head = padEl('div', 't72-sec');
  head.appendChild(padEl('span', '', 'Гоночная линия · ' + rows.length + ' ' + (rows.length % 10 === 1 && rows.length % 100 !== 11 ? 'пилот' : (rows.length % 10 >= 2 && rows.length % 10 <= 4 && (rows.length % 100 < 10 || rows.length % 100 >= 20) ? 'пилота' : 'пилотов'))));
  head.appendChild(padEl('span', '', 'тап по точке'));
  box.appendChild(head);
  const shown = rows.slice(0, 80);
  const lo = shown[0]._ms; const hi = Math.max(shown[shown.length - 1]._ms, me >= 0 ? rows[me]._ms : 0);
  const span = Math.max(1, hi - lo);
  const tip = padEl('div', 't72-tip'); tip.hidden = true;
  const track = padEl('div', 't72-track');
  const pos = (ms) => (4 + ((ms - lo) / span) * 92).toFixed(2) + '%';
  const show = (i) => {
    const r = rows[i]; if (!r) return;
    tip.hidden = false; tip.textContent = (i + 1) + '. ' + (isMyPilotId(r.pilotId) ? 'ты' : clipText(r.name || 'пилот', 14)) + ' · ' + t72Fmt(sel, r._ms);
    tip.style.left = pos(r._ms);
    track.querySelectorAll('.t72-dot.sel').forEach((x) => x.classList.remove('sel'));
    track.querySelector(`.t72-dot[data-i="${i}"]`)?.classList.add('sel');
  };
  const idx = shown.map((_, i) => i); if (me >= shown.length) idx.push(me);
  idx.forEach((i) => {
    const r = rows[i];
    const d = padEl('button', 't72-dot' + (i === 0 ? ' lead' : '') + (i === me ? ' me' : ''));
    d.type = 'button'; d.dataset.i = String(i); d.style.left = pos(r._ms);
    d.setAttribute('aria-label', (i + 1) + ' место, ' + t72Fmt(sel, r._ms));
    d.addEventListener('click', (e) => { e.stopPropagation(); hap(4); show(i); });
    track.appendChild(d);
  });
  box.appendChild(tip); box.appendChild(track);
  const ax = padEl('div', 't72-axis');
  ax.appendChild(padEl('span', '', t72Fmt(sel, lo)));
  if (me > 0) { const y = padEl('span', 't72-axis-me', 'ты ' + t72Fmt(sel, rows[me]._ms)); y.style.left = pos(rows[me]._ms); ax.appendChild(y); }
  ax.appendChild(padEl('span', '', t72Fmt(sel, hi)));
  box.appendChild(ax);
  show(me > 0 ? me - 1 : 1);
}
function t72Row(sel, rows, i, maxGap) {
  const r = rows[i];
  const li = padEl('li', 'tb-row t72-row' + (i < 3 ? ' podium p' + (i + 1) : ''));
  const pid = r.pilotId && isPublicPilot(r.pilotId) ? r.pilotId : '';
  if (pid) { li.dataset.pilot = pid; if (r.at) li.dataset.at = String(r.at); li.tabIndex = 0; li.setAttribute('role', 'button'); }
  li.appendChild(padEl('span', 'tb-n', String(i + 1)));
  li.appendChild(t72CarImg(r, 't72-car'));
  const who = padEl('span', 't72-who');
  const nick = padEl('span', 'tb-nick', isMyPilotId(r.pilotId) ? 'Ты' : clipText(r.name || 'пилот', 14));
  if ((r.name || '').length > 14) nick.title = r.name;
  t72Plates(r, nick);
  who.appendChild(nick);
  const PREP_SHORT = { stock: 'Сток', st1: 'St 1', st2: 'St 2+' };
  who.appendChild(padEl('span', 'tb-car', [shortCarName(r.car, r.carId) || '', PREP_SHORT[r.prep] || ''].filter(Boolean).join(' · ')));
  li.appendChild(who);
  const tm = padEl('span', 'tb-t');
  tm.appendChild(padEl('b', '', t72Fmt(sel, r._ms)));
  if (r.chip === 1) { const v = padEl('small', 'tb-src chip', 'чип'); v.title = 'подтверждено чипом PITLANE GPS'; tm.appendChild(v); }
  if (r.gpsQ) tm.dataset.q = r.gpsQ;
  if (i > 0) tm.appendChild(padEl('small', 'lb92-gap', '+' + t72Gap(r._ms - rows[0]._ms)));
  if (maxGap > 0 && i > 0) { const bar = padEl('i', 't72-gapbar'); bar.style.setProperty('--g', Math.max(.06, Math.min(1, (r._ms - rows[0]._ms) / maxGap)).toFixed(3)); tm.appendChild(bar); }
  li.appendChild(tm);
  if (isMyPilotId(r.pilotId)) li.classList.add('me');
  return li;
}
function t72Splits(r) {
  const c = r && Array.isArray(r.sectors) ? r.sectors.map(Number) : null;
  if (!c || c.length < 2 || !(c[0] > 0) || !(c[1] > c[0]) || !(r._ms > c[1])) return null;
  return [c[0], c[1] - c[0], r._ms - c[1]];
}
function t72Ghost(sel) {
  // «Атаковать призрак» — существующий призрак лидера (api.ghostTop): круги и 0–100 / ¼ мили
  if (!isRemoteApi()) return null;
  if (sel.kind === 'lap') return { scope: 'lap', ref: sel.id };
  if (GHOST_DISCS.some(([id]) => id === sel.id)) return { scope: 'run', ref: sel.id };
  return null;
}
function t72AttackGhost(g) {
  hap(8);
  if (g.scope === 'lap') {
    const s = document.getElementById('trackSelect');
    if (s && s.value !== g.ref) { s.value = g.ref; s.dispatchEvent(new Event('change')); }
    ghostRace.lap.choice = 'leader';
    goToView('lap', { sfx: false });
    lapRun.trackId = g.ref;
    try { openLapDrivePreview(); } catch (_) {}
    void ghostLoad('lap');
  } else {
    ghostRace.run.disc = g.ref === '402m' ? '402m' : '0-100';
    ghostRace.run.choice = 'leader';
    goToView('run', { sfx: false });
    void ghostLoad('run');
    try { window.__ghost74?.open(); } catch (_) {}
  }
}
function t72MeCard(sel, rows, me, cls) {
  const r = rows[me];
  const wrap = padEl('li', 't72-mecard');
  const head = t72Row(sel, rows, me, 0); head.classList.add('t72-mehead');
  wrap.appendChild(head);
  const body = padEl('div', 't72-mebody');
  const ahead = me > 0 ? rows[me - 1] : null;
  const top10 = me > 10 ? rows[9] : null;
  if (sel.kind === 'lap') {
    const mine = t72Splits(r); const ref = ahead ? t72Splits(ahead) : null;
    if (mine && ref) {
      const d = mine.map((v, k) => v - ref[k]);
      const worst = d.indexOf(Math.max(...d));
      const g = padEl('div', 't72-secs');
      d.forEach((v, k) => { const c = padEl('span', 't72-sc' + (k === worst && v > 0 ? ' lose' : '')); c.appendChild(padEl('small', '', 'S' + (k + 1) + (k === worst && v > 0 ? ' · теряешь' : ''))); c.appendChild(padEl('b', '', (v > 0 ? '+' : v < 0 ? '−' : '') + t72Gap(v))); g.appendChild(c); });
      body.appendChild(g);
      if (d[worst] > 0) r._secHint = 'Больше всего теряешь в S' + (worst + 1) + ' — ' + t72Gap(d[worst]) + ' с к ' + clipText(ahead.name || 'пилоту', 14) + '.';
    }
  }
  const hint = padEl('p', 't72-hint');
  const parts = [];
  if (me === 0) parts.push('Ты лидер этого топа.' + (rows[1] ? ' Отрыв ' + t72Gap(rows[1]._ms - r._ms) + ' с.' : ''));
  else {
    if (top10) parts.push('−' + t72Gap(r._ms - top10._ms) + ' с до топ-10.');
    parts.push('−' + t72Gap(r._ms - ahead._ms) + ' с до ' + me + '-го места.');
  }
  if (r._secHint) parts.push(r._secHint);
  hint.textContent = parts.join(' ');
  body.appendChild(hint);
  const act = padEl('div', 't72-act');
  const g = me > 0 ? t72Ghost(sel) : null;
  if (g) { const b = padEl('button', 't72-btn pri', 'Призрак лидера'); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); t72AttackGhost(g); }); act.appendChild(b); }
  const z = padEl('button', 't72-btn' + (g ? '' : ' pri'), sel.kind === 'lap' ? 'На трек' : 'Замер'); z.type = 'button';
  z.addEventListener('click', (e) => { e.stopPropagation(); hap(6); goToView(sel.kind === 'lap' ? 'lap' : 'run'); });
  act.appendChild(z);
  body.appendChild(act);
  wrap.appendChild(body);
  return wrap;
}
let _t72Fold = false, _t72All = false;
async function renderTopsBoard() {
  const ol = document.getElementById('topsBoard');
  if (!ol) return;
  renderTopsChips();
  syncTopsCls();
  const cls = _topsCls;
  const sel = { ..._topsSel };
  const seq = ++_topsBoardSeq;
  void t72Season(sel, cls); // v280: сезон города
  const title = document.getElementById('topsBoardTitle');
  const sub = document.getElementById('topsBoardSub');
  const wx = getTopsWeatherFilter();
  const wxLab = { all: 'любая погода', dry: 'сухо', damp: 'влажно', wet: 'дождь' }[wx] || '';
  const model = document.getElementById('topModelFilter')?.value || '';
  if (title) title.textContent = sel.kind === 'lap' ? trackShortName(sel.id) : (dragDiscMeta(sel.id)?.title || sel.id);
  if (sub) {
    const tr = sel.kind === 'lap' ? TRACKS.find((t) => t.id === sel.id) : null;
    sub.textContent = [cls === 'c' ? 'телефон · C' : 'чип · A/B', sel.kind === 'lap' ? (tr?.km ? tr.km + ' км' : 'круг') : '', sel.kind === 'lap' ? wxLab : '', document.getElementById('topMyCarOnly')?.checked ? 'моя машина' : (model ? shortCarName(model) : 'все машины'), topsCityOn() ? myCity() : ''].filter(Boolean).join(' · ');
  }
  ol.setAttribute('aria-busy', 'true');
  const data = await topsLoadRows(sel, cls);
  if (seq !== _topsBoardSeq || cls !== _topsCls) return;
  void t72RenderSums(cls, { ...data, sel });
  const rows = data.rows;
  t73HdrB();
  ol.replaceChildren();
  ol.removeAttribute('aria-busy');
  const lead = document.getElementById('t72Lead'); const line = document.getElementById('t72Line');
  if (data.phoneNo || !rows.length) {
    if (lead) { lead.hidden = true; lead.replaceChildren(); }
    if (line) { line.hidden = true; line.replaceChildren(); }
    const li = padEl('li', 'tb-empty t72-empty');
    if (data.phoneNo) {
      li.appendChild(padEl('b', '', 'Телефон эту отметку не меряет'));
      li.appendChild(padEl('span', '', 'GPS телефона ~1 раз в секунду — для 60 ft и 0–50 это 2–3 точки. Зачёт C: 0–100, 100–200, ⅛ и ¼ мили и круги.'));
      const sw = padEl('button', 'tb-empty-go', 'Смотреть «Чип A/B»'); sw.type = 'button';
      sw.addEventListener('click', () => document.querySelector('#topsCls [data-cls="ab"]')?.click());
      li.appendChild(sw);
    } else {
      const filtered = _topsPrep !== 'all' || _topsPeriod !== 'all' || document.getElementById('topMyCarOnly')?.checked || topsCityOn();
      li.appendChild(padEl('b', '', !filtered && sel.kind !== 'lap' ? 'Сделай первый замер — попадёшь в топ' : 'Здесь пока никого'));
      li.appendChild(padEl('span', '', filtered ? 'В этом срезе нет результатов. Расширь фильтры или стань первым.' : (sel.kind === 'lap' ? 'На этой трассе ещё никто не проехал круг.' : 'В этой дисциплине ещё нет зачтённых заездов.')));
      const acts = padEl('div', 't72-act');
      if (_topsPeriod !== 'all') {
        const pa = padEl('button', 't72-btn', 'Всё время'); pa.type = 'button';
        pa.addEventListener('click', () => document.querySelector('#topsPeriod [data-per="all"]')?.click());
        acts.appendChild(pa);
      }
      if (filtered) {
        const w = padEl('button', 't72-btn', topsCityOn() ? 'Вся Россия' : 'Сбросить фильтры'); w.type = 'button';
        w.addEventListener('click', () => { t72ResetQuick(); });
        acts.appendChild(w);
      }
      const go = padEl('button', 'tb-empty-go t72-btn pri', sel.kind === 'lap' ? 'Стать первым' : 'К замеру'); go.type = 'button';
      go.addEventListener('click', () => goToView(sel.kind === 'lap' ? 'lap' : 'run'));
      acts.appendChild(go);
      li.appendChild(acts);
    }
    ol.appendChild(li);
    return;
  }
  const me = t72Me(rows);
  t72RenderLead(sel, rows);
  t72RenderLine(sel, rows, me);
  const frag = document.createDocumentFragment();
  const sec = (a, b) => { const h = padEl('li', 't72-sec'); h.appendChild(padEl('span', '', a)); if (b) h.appendChild(padEl('span', '', b)); return h; };
  const show = new Set();
  const maxGap = rows[Math.min(rows.length, 3) - 1]._ms - rows[0]._ms;
  if (rows.length > 1) frag.appendChild(sec('Подиум', 'отставание'));
  const add = (i) => { if (i >= rows.length || show.has(i)) return; show.add(i); frag.appendChild(i === me ? t72MeCard(sel, rows, me, cls) : t72Row(sel, rows, i, i < 3 ? maxGap : 0)); };
  add(1); add(2);
  const foldEnd = Math.min(rows.length, 9);
  if (foldEnd > 3) {
    const open = _t72Fold || _t72All || (me >= 3 && me < 9);
    if (open) for (let i = 3; i < foldEnd; i++) add(i);
    else {
      const b = padEl('li', 't72-fold'); const bt = padEl('button', '', '4–' + foldEnd + ' · показать'); bt.type = 'button';
      bt.addEventListener('click', (e) => { e.stopPropagation(); _t72Fold = true; hap(4); void renderTopsBoard(); });
      b.appendChild(bt); frag.appendChild(b);
    }
  }
  if (me === 0 || (me > 0 && me < 3)) { /* ты на подиуме — карточка уже выше */ }
  if (_t72All) for (let i = 9; i < Math.min(rows.length, 100); i++) add(i);
  else if (me >= 9) {
    frag.appendChild(sec('Твоя зона', [topsCityOn() ? myCity() : '', { today: 'сегодня', week: 'неделя', all: 'всё время' }[_topsPeriod]].filter(Boolean).join(' · ')));
    for (let i = Math.max(9, me - 2); i <= Math.min(rows.length - 1, me + 1); i++) add(i);
  }
  if (me === 0) { const card = t72MeCard(sel, rows, 0, cls); card.classList.add('lead'); frag.insertBefore(card, frag.firstChild); }
  if (me < 0) {
    const li = padEl('li', 'tb-empty t72-empty t72-notyet');
    li.appendChild(padEl('b', '', 'Ты ещё не в топе'));
    li.appendChild(padEl('span', '', 'Сделай засчитанный ' + (sel.kind === 'lap' ? 'круг' : 'замер') + ' — и увидишь своё место и сколько до соседа.' + (rows.length ? ' Последнее место сейчас: ' + t72Fmt(sel, rows[rows.length - 1]._ms) + '.' : '')));
    const go = padEl('button', 'tb-empty-go t72-btn pri', sel.kind === 'lap' ? 'На трек' : 'Замер'); go.type = 'button';
    go.addEventListener('click', () => goToView(sel.kind === 'lap' ? 'lap' : 'run'));
    li.appendChild(go);
    frag.appendChild(li);
  }
  if (!_t72All && rows.length > Math.max(9, me + 2)) {
    const b = padEl('li', 't72-fold'); const bt = padEl('button', '', 'Весь топ · ' + Math.min(rows.length, 100)); bt.type = 'button';
    bt.addEventListener('click', (e) => { e.stopPropagation(); _t72All = true; hap(4); void renderTopsBoard(); });
    b.appendChild(bt); frag.appendChild(b);
  }
  ol.appendChild(frag);
}
// v273: нижняя граница шапки PITLANE (вкл. Telegram safe-area) — под ней закрепляется переключатель Чип/Телефон
function t73HdrB() { try { const hd = document.querySelector('.brand-bar'); if (!hd || !hd.offsetParent) return; const cs = getComputedStyle(hd); if (cs.position !== 'fixed' && cs.position !== 'sticky') return; const sy = window.scrollY; const r = hd.getBoundingClientRect(); const hb = cs.position === 'fixed' || sy > 0 ? Math.max(0, Math.round(r.bottom)) : Math.round(r.height + (parseFloat(cs.top) || 0)); document.documentElement.style.setProperty('--hdr-b', hb + 'px'); } catch (_) {} }
window.addEventListener('resize', t73HdrB); setTimeout(t73HdrB, 600);
function t72ResetQuick() {
  for (const id of ['topMyCityOnly', 'topMyCarOnly']) { const c = document.getElementById(id); if (c) c.checked = false; }
  _topsPeriod = 'all'; try { localStorage.setItem('pitlane-tops-period', 'all'); } catch (_) {}
  _topsPrep = 'all'; document.querySelectorAll('#topPrepChips .wx-chip').forEach((x) => x.classList.toggle('on', x.dataset.prep === 'all'));
  syncTopsPeriod(); syncTopsQuick(); topsActiveLine(); void renderTopsBoard();
}
document.getElementById('t72Lead')?.addEventListener('click', (e) => {
  const m = e.target?.closest?.('.t72-metal[data-pilot]'); if (!m) return;
  _disputeCtx = { kind: 'top', board: (_topsSel.kind === 'lap' ? 'lap' : 'drag') + (_topsCls === 'c' ? 'c:' : ':') + _topsSel.id, target: m.dataset.pilot };
  void openPilotProfile(m.dataset.pilot);
});
['topsChips', 'topsTracks'].forEach((hid) => document.getElementById(hid)?.addEventListener('click', (e) => {
  const b = e.target?.closest?.('.tchip');
  if (!b) return;
  _topsSel = { kind: b.dataset.kind, id: b.dataset.id || (TRACKS.some((t) => t.id === _topsLastTrack) ? _topsLastTrack : TRACKS[0]?.id) };
  try { localStorage.setItem(TOPS_SEL_KEY, JSON.stringify(_topsSel)); } catch (_) {}
  hap(6); _t72Fold = false; _t72All = false;
  try { b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch (_) {}
  void renderTopsBoard();
}));
document.getElementById('topsBoard')?.addEventListener('click', (e) => {
  const li = e.target?.closest?.('.tb-row[data-pilot]');
  if (li) {
    _disputeCtx = { kind: 'top', board: (_topsSel.kind === 'lap' ? 'lap' : 'drag') + (_topsCls === 'c' ? 'c:' : ':') + _topsSel.id, target: li.dataset.pilot, at: Number(li.dataset.at) || undefined };
    void openPilotProfile(li.dataset.pilot);
  }
});
document.getElementById('topsBoard')?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const li = e.target?.closest?.('.tb-row[data-pilot]');
  if (li) { e.preventDefault(); void openPilotProfile(li.dataset.pilot); }
});
['topValidOnly', 'topModelFilter'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => { void renderTopsBoard(); }));
document.getElementById('topWeatherChips')?.addEventListener('click', () => { setTimeout(() => { void renderTopsBoard(); }, 0); });
// v84: home is the default view on cold start (no goToView call) → render it once.
if (document.getElementById('view-home')?.classList.contains('active')) setTimeout(() => { try { renderHome(); } catch (err) { console.warn('home', err); } }, 0);

/* ——— v158: Трек как в про-приложениях: карточки трасс (силуэт, длина, мой лучший, рекорд), HUD (дельта, текущий/лучший,
 * секторы S1–S3, мини-карта, прогноз), итог круга и сессии (сплиты, теоретический лучший). Логика круга прежняя — новый слой
 * только читает lapRun / lapSession и жмёт старые кнопки. Зелёный/красный — только здесь, в дельте и секторах. ——— */
const TK58 = { rec: {}, recAt: {}, proj: {}, lastN: 0, lastSess: 0, flashT: 0, timer: 0, io: null };
function tk58Proj(trackId) {
  if (TK58.proj[trackId] !== undefined) return TK58.proj[trackId];
  const o = TRACK_OUTLINES[trackId]; const c = o && Array.isArray(o.coords) ? o.coords : null;
  if (!c || c.length < 3) { TK58.proj[trackId] = null; return null; }
  const W = 300, H = 170, pad = 14;
  const lat0 = c.reduce((a, p) => a + p[1], 0) / c.length; const k = Math.cos(lat0 * Math.PI / 180);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [lon, lat] of c) { const x = lon * k, y = -lat; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const sc = Math.min((W - 2 * pad) / Math.max(1e-9, x1 - x0), (H - 2 * pad) / Math.max(1e-9, y1 - y0));
  const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
  const f = (lon, lat) => [ox + (lon * k - x0) * sc, oy + (-lat - y0) * sc];
  const d = c.map(([lon, lat], i) => { const [x, y] = f(lon, lat); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join('') + 'Z';
  const sfp = Array.isArray(o.sf) ? f(o.sf[0], o.sf[1]) : f(c[0][0], c[0][1]);
  TK58.proj[trackId] = { d, f, sf: sfp };
  return TK58.proj[trackId];
}
function tk58Svg(pr, cls) {
  const NS = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 300 170'); s.setAttribute('aria-hidden', 'true'); if (cls) s.setAttribute('class', cls);
  for (const c of ['tk58-p0', 'tk58-p']) { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', c); p.setAttribute('d', pr.d); p.setAttribute('pathLength', '1'); s.appendChild(p); }
  const sf = document.createElementNS(NS, 'circle'); sf.setAttribute('class', 'tk58-sf'); sf.setAttribute('cx', pr.sf[0].toFixed(1)); sf.setAttribute('cy', pr.sf[1].toFixed(1)); sf.setAttribute('r', '4'); s.appendChild(sf);
  return s;
}
function tk58Laps(trackId) { // круги трассы: история + текущая сессия (один и тот же объект не дублируем)
  const set = new Set([...((state.laps && state.laps[trackId]) || []), ...(lapSession.trackId === trackId ? lapSession.laps : [])]);
  return [...set].filter((l) => l && l.ms > 0 && l.how !== 'manual');
}
function tk58MyBest(trackId) { const l = tk58Laps(trackId).filter((r) => r.valid !== false || r.how === 'gate'); return l.length ? Math.min(...l.map((r) => r.ms)) : null; }
function tk58RowMs(r) {
  const m = Number(r?.ms); if (m > 0) return m;
  const t = String(r?.t ?? ''); const mm = t.match(/^(\d+):(\d+(?:[.,]\d+)?)$/); if (mm) return (Number(mm[1]) * 60 + Number(mm[2].replace(',', '.'))) * 1000;
  const n = Number(t); return n > 0 ? n * 1000 : null;
}
async function tk58Record(trackId) {
  if (TK58.recAt[trackId] && Date.now() - TK58.recAt[trackId] < 300000) return;
  TK58.recAt[trackId] = Date.now();
  let rows = []; try { rows = isRemoteApi() ? await api.listLap(trackId) : []; } catch (_) { rows = []; }
  let best = null; for (const r of (Array.isArray(rows) ? rows : [])) { const ms = tk58RowMs(r); if (ms && (!best || ms < best.ms)) best = { ms, name: String(r.name || 'пилот'), car: r.car ? String(r.car) : '', at: r.at || null }; }
  TK58.rec[trackId] = best; tk58Paint();
}
function tk58Render() {
  const host = document.getElementById('tk58'); if (!host) return;
  if (!host.childElementCount) {
    for (const t of tracksOrdered()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tk58-c'; b.dataset.tk = t.id; b.setAttribute('role', 'option');
      const art = padEl('span', 'tk58-art'); const pr = tk58Proj(t.id);
      if (pr) art.appendChild(tk58Svg(pr)); else art.appendChild(padEl('span', 'tk58-nomap', 'схема появится после калибровки'));
      const g = TRACK_GEO[t.id]; if (t.cult && g && !g.rough) art.appendChild(padEl('span', 'tk58-ok', 'С/Ф проверен'));
      b.appendChild(art);
      const tx = padEl('span', 'tk58-tx');
      tx.appendChild(padEl('b', 'tk58-n', t.name));
      tx.appendChild(padEl('span', 'tk58-m', [t.km && String(t.km).replace('.', ',') + ' км', t.turns && t.turns + ' поворотов'].filter(Boolean).join(' · ')));
      const st = padEl('span', 'tk58-st');
      const a = padEl('span', 'tk58-kv'); a.append(padEl('span', '', 'Ваш лучший'), padEl('b', 'tk58-mine', '—'));
      const r = padEl('span', 'tk58-kv'); r.append(padEl('span', '', 'Рекорд трассы'), padEl('b', 'tk58-rec', '—'), padEl('small', 'tk58-recn', ''));
      st.append(a, r); tx.appendChild(st); b.appendChild(tx);
      host.appendChild(b);
    }
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-tk]'); if (!b) return; hap(6); tk58Pick(b.dataset.tk); });
    try {
      TK58.io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) void tk58Record(e.target.dataset.tk); }, { root: host, threshold: 0.4 });
      for (const b of host.children) TK58.io.observe(b);
    } catch (_) {}
  }
  tk58Paint();
  if (!TK58.drawn && document.getElementById('view-lap')?.classList.contains('active')) { TK58.drawn = true; drawIn([...host.querySelectorAll('.tk58-c')].slice(0, 3).map((b) => b.querySelector('.tk58-p')), { delay: 120, stagger: 120 }); } // v160: трассы прорисовываются при первом входе
}
function tk58Paint() {
  const host = document.getElementById('tk58'); if (!host) return;
  const cur = document.getElementById('trackSelect')?.value || TRACKS[0].id;
  for (const b of host.children) {
    const id = b.dataset.tk; const on = id === cur;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    const mb = tk58MyBest(id); const m = b.querySelector('.tk58-mine'); const mt = mb ? fmtLapTime(mb) : '—'; if (m && m.textContent !== mt) m.textContent = mt;
    const rc = TK58.rec[id]; const re = b.querySelector('.tk58-rec'); const rt = rc ? fmtLapTime(rc.ms) : '—'; if (re && re.textContent !== rt) re.textContent = rt;
    const rn = b.querySelector('.tk58-recn'); const nt = rc ? clipText(rc.name, 14) : ''; if (rn && rn.textContent !== nt) rn.textContent = nt;
  }
}
function tk58Pick(id, opts = {}) {
  const sel = document.getElementById('trackSelect');
  if (sel && sel.value !== id && [...sel.options].some((o) => o.value === id)) { sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  tk58Paint();
  const b = document.querySelector(`#tk58 [data-tk="${id}"]`); const host = document.getElementById('tk58');
  if (b && host && opts.scroll !== false) host.scrollTo({ left: b.offsetLeft - (host.clientWidth - b.offsetWidth) / 2, behavior: opts.instant ? 'auto' : 'smooth' });
  void tk58Record(id);
}

/* HUD */
function lh58Ref(trackId) {
  const laps = tk58Laps(trackId).filter((l) => l.valid !== false || l.how === 'gate');
  if (!laps.length) return null;
  const best = laps.reduce((a, l) => (l.ms < a.ms ? l : a));
  const s = Array.isArray(best.sectors) ? best.sectors : [];
  const cum = Number.isFinite(s[0]) && Number.isFinite(s[1]) && s[1] > s[0] && best.ms > s[1] ? [s[0], s[1], best.ms] : null;
  return { ms: best.ms, cum, dist: best.dist > 300 ? best.dist : null, lap: best };
}
function lh58RefAt(ref, d, L) {
  d = Math.max(0, Math.min(L, d));
  if (!ref.cum) return ref.ms * d / L;
  const xs = [0, 0.92 * L / 3, 0.92 * 2 * L / 3, L]; const ts = [0, ...ref.cum]; // отсечки секторов пишутся на 92 % трети (onLapGps)
  for (let i = 0; i < 3; i++) if (d <= xs[i + 1]) return ts[i] + (ts[i + 1] - ts[i]) * (d - xs[i]) / Math.max(1, xs[i + 1] - xs[i]);
  return ref.ms;
}
function lh58Fmt(ms) { if (ms == null || !Number.isFinite(ms)) return '—'; return (ms < 0 ? '−' : '+') + (Math.abs(ms) / 1000).toFixed(2); }
function lh58Tone(ms) { return ms == null ? 'none' : ms < -5 ? 'better' : ms > 5 ? 'worse' : 'even'; }
function lh58Set(id, t) { const e = document.getElementById(id); if (e && e.textContent !== t) e.textContent = t; }
function lh58Full(l) { // полные сплиты круга: S3 — до финиша
  const s = Array.isArray(l?.sectors) ? l.sectors : [];
  if (!(Number.isFinite(s[0]) && Number.isFinite(s[1]) && s[1] > s[0] && l.ms > s[1])) return null;
  return [s[0], s[1] - s[0], l.ms - s[1]];
}
function lh58Theo(laps) {
  const b = [null, null, null];
  for (const l of laps) { const sp = lh58Full(l); if (!sp || (l.valid === false && l.how !== 'gate')) continue; sp.forEach((x, i) => { if (b[i] == null || x < b[i]) b[i] = x; }); }
  return { best: b, sum: b.every((x) => x != null) ? b[0] + b[1] + b[2] : null };
}
function lh58Tick() {
  const el = document.getElementById('lh58'); if (!el || !lapDrive.open) return;
  const tid = lapRun.trackId || document.getElementById('trackSelect')?.value || TRACKS[0].id;
  const tr = TRACKS.find((t) => t.id === tid) || {};
  const phase = lapRun.active ? lapRun.phase : 'idle';
  if (el.dataset.phase !== phase) el.dataset.phase = phase;
  lh58Set('lh58Track', tr.name || '—');
  const n = lapSession.trackId === tid ? lapSession.laps.length : 0;
  const wx = document.getElementById('lapDriveWeather'); const wxt = wx?.dataset.ready ? wx.textContent.split(' · ')[0] : '';
  let carN = ''; try { carN = pickedCar()?.name || ''; } catch (_) {}
  lh58Set('lh58Sub', [phase === 'idle' ? 'сессия не начата' : 'круг ' + (n + 1), clipText(carN, 22), wxt].filter(Boolean).join(' · '));
  const running = phase === 'running' && lapRun.t0;
  const elapsed = running ? Date.now() - lapRun.t0 : 0;
  lh58Set('lh58Cur', fmtLapClock(elapsed));
  const ref = lh58Ref(tid);
  lh58Set('lh58Best', ref ? fmtLapTime(ref.ms) : '—');
  lh58Set('lh58Spd', document.getElementById('lapDriveSpeed')?.textContent || '0');
  // дельта: призрак (если едет) → иначе по секторам лучшего круга
  const L = (ref && ref.dist) || trackLenM(tid);
  let delta = null; let byGhost = false;
  const gd = document.getElementById('lapGhostDelta');
  if (running && gd && !gd.classList.contains('hidden')) { const t = (document.getElementById('lapGhostNum')?.textContent || '').replace('−', '-').replace('±', ''); const v = parseFloat(t); if (Number.isFinite(v)) { delta = v * 1000; byGhost = true; } }
  if (delta == null && running && ref && lapRun.dist > 150) delta = elapsed - lh58RefAt(ref, lapRun.dist, L);
  const tone = lh58Tone(delta); if (el.dataset.tone !== tone) el.dataset.tone = tone;
  lh60Bar(running ? delta : null);
  { const hm = running ? lapRun.sectorHit.map((h) => (h ? 1 : 0)).join('') : ''; if (hm !== LH60.hits) { if (running && hm.split('1').length > LH60.hits.split('1').length) hap60('light'); LH60.hits = hm; } }
  lh58Set('lh58DeltaK', !ref && !byGhost ? 'первый круг станет эталоном' : byGhost ? 'дельта к призраку' : 'дельта к лучшему');
  lh58Set('lh58Delta', delta == null ? (running ? '±0.00' : '—') : lh58Fmt(delta));
  lh58Set('lh58Pred', delta != null && ref ? 'прогноз ' + fmtLapTime(Math.max(1000, ref.ms + delta)) : ref ? 'прогноз —' : '');
  // секторы
  const bestS = (() => { try { return lapBattleRef(tid); } catch (_) { return [null, null, null]; } })();
  const sp = LB.splitsOf(lapRun.sectorMs);
  const curI = running ? lapRun.sectorHit.findIndex((h) => !h) : -1;
  document.querySelectorAll('#lh58Sec .lh58-s').forEach((s, i) => {
    let p = 0; let t = '—'; let tn = 'none';
    if (running && lapRun.sectorHit[i]) { p = 1; t = fmtSectorSplit(sp[i]); const d = LB.sectorDelta(sp[i], bestS[i]); tn = d == null ? 'none' : d <= 0 ? 'better' : 'worse'; if (d != null) t += ' ' + lh58Fmt(d); }
    else if (running && i === curI) { const a = 0.92 * L * i / 3; p = Math.max(0, Math.min(1, (lapRun.dist - a) / (0.92 * L / 3))); tn = 'live'; }
    if (s.dataset.tone !== tn) s.dataset.tone = tn;
    const bar = s.querySelector('.lh58-sb > i'); if (bar) { const v = p.toFixed(3); if (bar.style.getPropertyValue('--p') !== v) bar.style.setProperty('--p', v); }
    const b = s.querySelector('b'); if (b && b.textContent !== t) b.textContent = t;
  });
  // мини-карта
  const pr = tk58Proj(tid); const svg = document.getElementById('lh58Map');
  if (svg) {
    const [pb, pt] = svg.querySelectorAll('path'); const d = pr ? pr.d : '';
    if (pt && pt.getAttribute('d') !== d) { pt.setAttribute('d', d); pb.setAttribute('d', d); const sf = svg.querySelector('.lh58-sf'); if (pr && sf) { sf.setAttribute('cx', pr.sf[0].toFixed(1)); sf.setAttribute('cy', pr.sf[1].toFixed(1)); } }
    const me = svg.querySelector('.lh58-me'); const last = lapRun.last;
    if (me) { if (pr && last && Number.isFinite(last.lat)) { const [x, y] = pr.f(last.lon, last.lat); me.setAttribute('cx', x.toFixed(1)); me.setAttribute('cy', y.toFixed(1)); me.style.opacity = '1'; } else me.style.opacity = '0'; }
  }
  lh58Set('lh58Msg', document.getElementById('lapDriveMsg')?.textContent || '');
  // GPS
  { const f = _homeLastFix; const g = document.getElementById('lh58Gps'); let q = 'none'; let txt = 'нет GPS';
    if (f && Date.now() - f.at < 5000 && Number.isFinite(f.acc) && f.acc > 0) { q = f.acc <= 5 ? 'good' : f.acc <= 15 ? 'mid' : 'bad'; txt = '±' + Math.round(f.acc) + ' м'; }
    if (g) { if (g.dataset.q !== q) g.dataset.q = q; const sp2 = g.querySelector('span'); if (sp2 && sp2.textContent !== txt) sp2.textContent = txt; } }
  lh58Set('lh58Arm', phase === 'idle' ? 'Старт сессии' : phase === 'armed' ? 'Ждём линию С/Ф' : 'Круг идёт');
  const arm = document.getElementById('lh58Arm'); if (arm) arm.disabled = phase !== 'idle';
  const rs = document.getElementById('lh58Reset'); if (rs) rs.disabled = phase !== 'running';
  lh58Set('lh58End', phase === 'idle' ? 'Закрыть' : 'Конец');
  // итог только что пройденного круга
  if (lapSession.startedAt !== TK58.lastSess) { TK58.lastSess = lapSession.startedAt; TK58.lastN = lapSession.laps.length; }
  if (lapSession.laps.length > TK58.lastN) { TK58.lastN = lapSession.laps.length; const nl = lapSession.laps[lapSession.laps.length - 1]; const pb = tk58Laps(tid).filter((x) => x !== nl && x.how !== 'manual'); hap60(nl && nl.how !== 'manual' && (!pb.length || nl.ms < Math.min(...pb.map((x) => x.ms))) ? 'success' : 'medium'); lh58Flash(nl, tid); }
}
function lh58Flash(l, tid) {
  const box = document.getElementById('lh58Flash'); if (!box || !l) return;
  const others = tk58Laps(tid).filter((x) => x !== l && (x.valid !== false || x.how === 'gate'));
  const prevBest = others.length ? Math.min(...others.map((x) => x.ms)) : null;
  const ob = lh58Theo(others).best; const th = lh58Theo([...others, l]);
  const sp = lh58Full(l);
  box.replaceChildren();
  const h = padEl('div', 'lh58-fh'); h.append(padEl('span', 'lh58-k', 'Круг ' + lapSession.laps.length + (l.how === 'manual' ? ' · ручной финиш' : l.valid === false ? ' · не в зачёт' : '')), padEl('b', 'lh58-ft', fmtLapTime(l.ms)));
  const dd = prevBest != null ? l.ms - prevBest : null;
  const dv = padEl('b', 'lh58-fd', dd == null ? 'первый круг' : lh58Fmt(dd)); dv.dataset.tone = lh58Tone(dd); h.appendChild(dv);
  box.appendChild(h);
  const row = padEl('div', 'lh58-fs');
  for (let i = 0; i < 3; i++) { const c = padEl('span', 'lh58-fc'); const v = sp ? sp[i] : null; const d = v != null && ob[i] != null ? v - ob[i] : null; c.dataset.tone = d == null ? 'none' : d <= 0 ? 'better' : 'worse'; c.append(padEl('small', '', 'S' + (i + 1)), padEl('b', '', v != null ? fmtSectorSplit(v) : '—')); row.appendChild(c); }
  box.appendChild(row);
  if (th.sum != null) box.appendChild(padEl('p', 'lh58-fth', 'Теоретический лучший ' + fmtLapTime(th.sum)));
  box.hidden = false; box.classList.remove('on'); void box.offsetWidth; box.classList.add('on');
  clearTimeout(TK58.flashT); TK58.flashT = setTimeout(() => { box.classList.remove('on'); setTimeout(() => { box.hidden = true; }, 260); }, 8000);
}
/* v160: полоса дельты (как в трековых приложениях): центр — ноль, вправо — быстрее (зелёный), влево — медленнее (красный); пружина без перелёта. */
const LH60 = { bar: null, hits: '', laps: 0 };
function lh60Bar(delta) {
  const box = document.getElementById('lh60Bar'); if (!box) return;
  if (!LH60.bar) { const i = box.querySelector('i'); LH60.bar = spring({ k: 120, zeta: 1, value: 0, eps: 5e-4, onUpdate: (x) => { i.style.transform = `scaleX(${x.toFixed(4)})`; } }); }
  const f = delta == null ? 0 : Math.max(-1, Math.min(1, -delta / 2000));
  const tone = delta == null || Math.abs(delta) < 5 ? 'none' : delta < 0 ? 'better' : 'worse'; if (box.dataset.tone !== tone) box.dataset.tone = tone;
  LH60.bar.set(f);
}
/* v160: тактильный отклик на ключевых моментах круга: сектор (лёгкий), круг (успех — если лучший). */
function hap60(kind) { try { if (localStorage.getItem('pitlane-hap-off') === '1') return; if (isTMA) { tmaHaptic(kind); return; } navigator.vibrate?.(kind === 'light' || kind === 'select' ? 8 : 18); } catch (_) {} }
/* v160: кинематографичный вход в сессию — шапка, дельта, приборы, секторы, карта прорисовывается, кнопки; ~1.2 с, только opacity/transform. */
function lh60Enter() {
  const el = document.getElementById('lh58'); if (!el || motionReduced()) return;
  const src = document.querySelector('#tk58 .tk58-c.on .tk58-art svg'); const dst = document.getElementById('lh58Map');
  el.classList.remove('lh60-in'); void el.offsetWidth; el.classList.add('lh60-in');
  setTimeout(() => el.classList.remove('lh60-in'), 1600);
  requestAnimationFrame(() => { if (!(src && dst && flyShared(src, dst, { dur: 520, radius: 0 }))) drawIn(dst ? dst.querySelectorAll('.lh58-trk') : [], { delay: 260 }); });
}
function lh58Start() { lh60Enter(); clearInterval(TK58.timer); TK58.timer = setInterval(() => { try { lh58Tick(); } catch (_) {} }, 100); try { lh58Tick(); } catch (_) {} }
function lh58Stop() { clearInterval(TK58.timer); TK58.timer = 0; }

/* итог сессии */
function ls58Open(laps, tid) {
  const box = document.getElementById('ls58'); const inn = document.getElementById('ls58In'); if (!box || !inn) return;
  const tr = TRACKS.find((t) => t.id === tid) || {};
  const ok = laps.filter((l) => l.how !== 'manual');
  const best = ok.length ? ok.reduce((a, l) => (l.ms < a.ms ? l : a)) : null;
  const th = lh58Theo(ok);
  inn.replaceChildren();
  const hd = padEl('header', 'ls58-hd');
  const ht = padEl('div', ''); ht.append(padEl('span', 'ls58-k', 'Итог сессии'), padEl('h2', 'ls58-t', tr.name || tid), padEl('span', 'ls58-s', laps.length + ' ' + (laps.length === 1 ? 'круг' : laps.length < 5 ? 'круга' : 'кругов') + ' · ' + new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })));
  const x = padEl('button', 'ls58-x'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть'); x.textContent = '×'; x.addEventListener('click', ls58Close);
  hd.append(ht, x); inn.appendChild(hd);
  const hero = padEl('section', 'ls58-hero');
  const b1 = padEl('div', 'ls58-big'); b1.append(padEl('span', 'ls58-k', 'Лучший круг'), padEl('b', '', best ? fmtLapTime(best.ms) : '—'));
  const b2 = padEl('div', 'ls58-big ls58-theo'); b2.append(padEl('span', 'ls58-k', 'Теоретический лучший'), padEl('b', '', th.sum != null ? fmtLapTime(th.sum) : '—'), padEl('small', '', th.sum != null && best ? 'потенциал ' + lh58Fmt(th.sum - best.ms) : 'нужны секторы всех трёх частей'));
  hero.append(b1, b2); inn.appendChild(hero);
  const bs = padEl('div', 'ls58-bs'); th.best.forEach((v, i) => { const c = padEl('span', ''); c.append(padEl('small', '', 'Лучший S' + (i + 1)), padEl('b', '', v != null ? fmtSectorSplit(v) : '—')); bs.appendChild(c); }); inn.appendChild(bs);
  const tb = padEl('div', 'ls58-tb'); tb.setAttribute('role', 'table');
  const hr = padEl('div', 'ls58-r ls58-rh'); ['№', 'Время', 'S1', 'S2', 'S3'].forEach((t) => hr.appendChild(padEl('span', '', t))); tb.appendChild(hr);
  laps.forEach((l, i) => {
    const r = padEl('div', 'ls58-r' + (l === best ? ' best' : '') + (l.how === 'manual' || l.valid === false ? ' off' : '')); const sp = lh58Full(l);
    r.append(padEl('span', '', String(i + 1)), padEl('b', '', fmtLapTime(l.ms)));
    for (let k = 0; k < 3; k++) { const c = padEl('span', '', sp ? fmtSectorSplit(sp[k]) : '—'); if (sp && th.best[k] != null && Math.abs(sp[k] - th.best[k]) < 1) c.className = 'ls58-sb'; r.appendChild(c); }
    tb.appendChild(r);
  });
  if (!laps.length) tb.appendChild(padEl('p', 'ls58-empty', 'Кругов в этой сессии нет'));
  inn.appendChild(tb);
  const act = padEl('div', 'ls58-act');
  const an = padEl('button', 'ls58-b', 'Аналитика круга'); an.type = 'button'; an.addEventListener('click', () => { ls58Close(); try { window.__route48?.('analytics'); } catch (_) {} });
  const dn = padEl('button', 'ls58-b ls58-p', 'Готово'); dn.type = 'button'; dn.addEventListener('click', ls58Close);
  act.append(an, dn); inn.appendChild(act);
  box.classList.remove('hidden'); box.setAttribute('aria-hidden', 'false'); document.body.classList.add('ls58-on');
}
function ls58Close() { const box = document.getElementById('ls58'); if (!box) return; box.classList.add('hidden'); box.setAttribute('aria-hidden', 'true'); document.body.classList.remove('ls58-on'); }

(() => {
  const click = (id) => document.getElementById(id)?.click();
  document.getElementById('lh58Arm')?.addEventListener('click', () => click('btnLapArmedStart'));
  document.getElementById('lh58Reset')?.addEventListener('click', () => click('lapDriveFinish'));
  document.getElementById('lh58Min')?.addEventListener('click', () => click('lapDriveCancel'));
  document.getElementById('lh58Video')?.addEventListener('click', () => { hap(8); void openVideoTele('lap'); });
  document.getElementById('lh58End')?.addEventListener('click', () => {
    if (!lapRun.active) { click('lapDriveCancel'); return; }
    const laps = lapSession.laps.slice(); const tid = lapSession.trackId || lapRun.trackId;
    click('lapDriveEnd');
    if (laps.length) ls58Open(laps, tid);
  });
  const ld = document.getElementById('lapDrive');
  if (ld) new MutationObserver(() => { if (ld.classList.contains('hidden')) lh58Stop(); else if (!TK58.timer) lh58Start(); }).observe(ld, { attributes: true, attributeFilter: ['class'] });
  document.getElementById('trackSelect')?.addEventListener('change', () => { tk58Paint(); });
  const lv = document.getElementById('view-lap');
  if (lv) new MutationObserver(() => { if (lv.classList.contains('active')) { tk58Render(); tk58Pick(document.getElementById('trackSelect')?.value || TRACKS[0].id, { instant: true }); } }).observe(lv, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => { try { tk58Render(); } catch (_) {} }, 900);
  // v189: новый «Трек» — список 16 трасс + карточка/3D (модуль грузится лениво при открытии вкладки)
  let tv2Booted = false; let tv2P = null;
  // v193: модуль предзагружается заранее, пока грузится — скелетон в #tv2 (старое меню трека удалено)
  const tv2Mod = () => (tv2P ||= import('./track-v2/tv2.js').catch((e) => { tv2P = null; throw e; }));
  (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => { tv2Mod().catch(() => {}); });
  const tv2Boot = () => { if (tv2Booted) return; const host = document.getElementById('tv2'); if (!host) return; tv2Booted = true;
    const B = { tracks: TRACKS, myBest: tk58MyBest, laps: tk58Laps, fmt: fmtLapTime, theo: lh58Theo, full: lh58Full,
      pick: (id) => { try { tk58Pick(id, {}); } catch (_) {} },
      start: (id) => { try { tk58Pick(id, {}); const s = document.getElementById('trackSelect'); if (s && s.value !== id) { s.value = id; s.dispatchEvent(new Event('change')); } } catch (_) {} setTimeout(() => document.getElementById('btnLapStart')?.click(), 60); }, // v267t
      sf: (id) => { const g = TRACK_GEO[id]; const t = TRACKS.find((x) => x.id === id); return !g ? 'С/Ф не задан' : g.rough ? 'С/Ф приблизителен' : (t?.cult ? 'С/Ф проверен' : 'С/Ф по геометрии'); },
      record: async (id) => { TK58.recAt[id] = 0; await tk58Record(id); return TK58.rec[id] || null; } };
    tv2Mod().then((m) => m.mountList(host, B)).catch((e) => { tv2Booted = false; console.warn('tv2', e); }); };
  if (lv) { new MutationObserver(() => { if (lv.classList.contains('active')) tv2Boot(); }).observe(lv, { attributes: true, attributeFilter: ['class'] }); if (lv.classList.contains('active')) tv2Boot(); }
  document.getElementById('ls58')?.addEventListener('click', (e) => { if (e.target?.id === 'ls58') ls58Close(); });
  window.__v160 = { gauge: (v) => hudZones(v, false), bar: lh60Bar, enter: lh60Enter }; window.__tk58 = { pick: tk58Pick, flash: (l) => lh58Flash(l, lapRun.trackId), summary: ls58Open, tick: lh58Tick, lapRun, lapSession }; // скриншоты/отладка
})();

/* ——— v161: Журнал (замеры + сессии + дуэли), шторка «Источник GPS», строки параметров на Замере и Треке ——— */
let _jnMod = null; let _jnDuels = null; let _jnDuelsAt = 0; let _jnEntries = [];
function jnDeps61() {
  return {
    state, tracks: TRACKS, fmtLap: fmtLapTime,
    carName: (id) => CARS.find((c) => c.id === id)?.name || MODEL_CATALOG.find((m) => m.id === id)?.name || '',
    duelType: duelTypeLabel, duelStatus: duelStatusText,
    duelVs: (d) => (d.createdBy?.name || 'пилот') + ' — ' + (d.challenger?.name || 'соперник?'),
    openSummary: (laps, tid) => ls58Open(laps, tid),
    canReview: (laps) => { try { return analyzeSession(laps).ok; } catch (_) { return false; } },
    openReview: (i) => openSessionReview(i),
    openAnalytics: (tid) => { jnPickTrack61(tid); journalGo61('lap'); setTimeout(() => document.getElementById('lapAnalyticsCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 260); },
    shareLatest: () => document.getElementById('btnShareRun')?.click(),
    go: (k) => goToView(k), video: () => void openVideoTele('run'),
    openDuel: (id) => openDuelSheet({ duelId: id }),
  };
}
let _jnKeep = false; // v289: вкладка Журнал открывается на «Все»; явный переход (journalGo61) фильтр сохраняет
function journalGo61(filter) {
  if (filter) _jnKeep = true;
  if (filter && _jnMod) _jnMod.journalFilter(filter);
  else if (filter) { try { localStorage.setItem('pitlane-journal-f', filter); } catch (_) {} }
  goToView('history'); window.scrollTo(0, 0);
  void renderJournal61();
}
function jnPickTrack61(tid) {
  const sel = document.getElementById('trackSelect');
  if (!sel || !tid || sel.value === tid || ![...sel.options].some((o) => o.value === tid)) return;
  sel.value = tid; sel.dispatchEvent(new Event('change'));
  try { renderLaps(); } catch (_) {} try { void renderTrackHistory(); } catch (_) {}
}
async function renderJournal61() {
  const host = document.getElementById('jnHost'); if (!host) return;
  try { _jnMod = _jnMod || await import('./journal.js'); } catch (_) { host.textContent = 'Журнал не загрузился — проверьте интернет'; return; }
  const D = jnDeps61(); const f = _jnMod.journalFilter();
  _jnEntries = _jnMod.buildEntries(D, _jnDuels || []);
  _jnMod.renderJournal(host, D, _jnEntries, f);
  const lapBox = document.getElementById('jnLap'); const runBox = document.getElementById('jnRun');
  if (lapBox) lapBox.hidden = f !== 'lap';
  if (runBox) runBox.hidden = f !== 'run' || !(state.slips || []).length;
  // трассы с кругами — переключатель «Разбор трассы»
  const tb = document.getElementById('jnTracks');
  if (tb && f === 'lap') {
    const cur = document.getElementById('trackSelect')?.value;
    const ids = TRACKS.filter((t) => (state.laps?.[t.id] || []).length).map((t) => t.id);
    if (cur && !ids.includes(cur)) ids.unshift(cur);
    tb.replaceChildren(...ids.map((id) => { const b = padEl('button', 'jn-tr', TRACKS.find((t) => t.id === id)?.name || id); b.type = 'button'; b.dataset.jtr = id; b.setAttribute('aria-pressed', String(id === cur)); return b; }));
  }
  if (isRemoteApi() && Date.now() - _jnDuelsAt > 60000) {
    _jnDuelsAt = Date.now();
    let rows = [];
    try { rows = (await api.listMyDuels(duelPilotId())) || []; } catch (_) { rows = []; }
    _jnDuels = rows.filter((d) => d && d.id);
    if (document.getElementById('view-history')?.classList.contains('active')) void renderJournal61();
  }
}
document.getElementById('view-history')?.addEventListener('click', (e) => {
  const t = e.target;
  const f = t?.closest?.('[data-jf]');
  if (f && _jnMod) { hap(6); _jnMod.journalFilter(f.dataset.jf); void renderJournal61(); return; }
  const tr = t?.closest?.('[data-jtr]');
  if (tr) { hap(6); jnPickTrack61(tr.dataset.jtr); void renderJournal61(); return; }
  const go = t?.closest?.('[data-jgo]');
  if (go) { hap(8); const k = go.dataset.jgo; if (k === 'duel') openDuelSheet({ createOnly: true }); else goToView(k); return; }
  const hit = t?.closest?.('.jn-hit');
  if (hit && _jnMod) {
    const li = hit.parentElement; const ent = _jnEntries[Number(li.dataset.i)]; if (!ent) return;
    hap(6);
    const open = li.querySelector('.jn-x');
    document.querySelectorAll('#jnHost .jn-x').forEach((x) => { x.remove(); x.parentElement?.querySelector('.jn-hit')?.setAttribute('aria-expanded', 'false'); });
    document.querySelectorAll('#jnHost .jn-row.open').forEach((x) => x.classList.remove('open'));
    if (!open) { li.appendChild(_jnMod.rowActions(ent, jnDeps61())); li.classList.add('open'); hit.setAttribute('aria-expanded', 'true'); }
  }
});
// ссылки «Журнал замеров / сессий» с Замера и Трека — сначала фильтр, потом переход (сам переход — общий [data-view])
document.addEventListener('click', (e) => {
  const b = e.target?.closest?.('[data-view="history"][data-jf]'); if (!b) return;
  try { localStorage.setItem('pitlane-journal-f', b.dataset.jf); } catch (_) {}
  setTimeout(() => { void renderJournal61(); window.scrollTo(0, 0); }, 0);
}, true);
// шторка «Источник GPS» (карточка источника перенесена со старого экрана замера)
(() => {
  const sh = document.getElementById('gps61'); if (!sh) return;
  const close = () => { sh.classList.add('hidden'); sh.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('gps61-on'); };
  const open = () => { hap(8); sh.classList.remove('hidden'); sh.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('gps61-on'); };
  ['z61Gps', 't61Gps'].forEach((id) => document.getElementById(id)?.addEventListener('click', open));
  sh.addEventListener('click', (e) => { if (e.target?.closest?.('[data-close61]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sh.classList.contains('hidden')) close(); });
  const bar = document.getElementById('extGpsBar');
  const paint = () => {
    const t = (bar?.textContent || '').replace(/^Источник:\s*/i, '').replace(/\s*\(.*$/, '').trim() || 'телефон';
    const v = t.charAt(0).toUpperCase() + t.slice(1);
    document.querySelectorAll('[data-gps61]').forEach((x) => { if (x.textContent !== v) x.textContent = v; });
    // v257: Замер — статус источника сильнее остальных строк: чип = в зачёт топов, телефон = справочно
    const row = document.getElementById('z61Gps');
    if (row) {
      const raw = bar?.textContent || ''; const on = document.body.classList.contains('ext-gps-on');
      const conn = /подключение/i.test(raw); const hz = (raw.match(/([\d.]+)\s*Гц/) || [])[1];
      const sim = /^Симулятор/.test(raw);
      const st = on ? (sim ? 'sim' : 'chip') : (conn ? 'conn' : 'phone');
      const hzT = hz && hz !== '—' ? ' · ' + Math.round(Number(hz)) + ' Гц' : '';
      const V = { chip: 'Чип' + hzT, sim: 'Симулятор' + hzT, conn: 'Чип · подключение…', phone: 'Телефон' }[st];
      const S = { chip: 'в зачёт топов', sim: 'тест, не в зачёт', conn: '', phone: 'справочно · подключить чип' }[st];
      row.dataset.src = st; row.dataset.q = bar?.dataset.q || '';
      const a = document.getElementById('z61SrcV'), b = document.getElementById('z61SrcS');
      if (a && a.textContent !== V) a.textContent = V; if (b && b.textContent !== S) b.textContent = S;
      const pv = document.getElementById('pf6ChipV'); const pt = { chip: 'подключён' + hzT, sim: 'симулятор', conn: 'подключение…', phone: 'не подключён' }[st];
      if (pv && pv.textContent !== pt) { pv.textContent = pt; pv.dataset.on = st === 'chip' ? '1' : '0'; }
    }
  };
  if (bar) new MutationObserver(paint).observe(bar, { childList: true, characterData: true, subtree: true });
  paint();
  window.__gps61 = { open, close };
})();
/* v164: шторка «Графика» (Настройки и Гараж) — применяется сразу, без перезагрузки */
function setGfxMode(m) {
  if (!GFX_LABEL[m]) return;
  try { localStorage.setItem(GFX_KEY, m); } catch (_) {}
  if (GFX_TIER[m]) { Q.tier = GFX_TIER[m]; Q.source = 'user:' + m; Q.locked = true; qm.done = true; qm.phase = 'done'; }
  else { Q.locked = false; Q.source = 'auto'; Q.tier = qTierFromGpu(Q.gpu); qm.done = false; qm.phase = 'idle'; qm.stalls = 0; }
  document.documentElement.classList.toggle('q-low', Q.tier === 'low');
  try { if (renderer) { applyQualityTier(); onResize(); podiumInvalidate(800, true); } } catch (_) {}
  gfxPaint();
}
function gfxPaint() {
  const m = gfxMode();
  document.querySelectorAll('[data-gfx-v]').forEach((e) => { e.textContent = GFX_LABEL[m]; });
  document.querySelectorAll('#gfx64 [data-gfx]').forEach((b) => { const on = b.dataset.gfx === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
  const n = document.getElementById('gfx64Note');
  if (n) { let d = 1; try { d = renderer ? renderer.getPixelRatio() : q3dDpr(); } catch (_) {} n.textContent = 'Сейчас: ' + ({ high: 'максимум', medium: 'баланс', low: 'плавность' }[Q.tier] || Q.tier) + ' · плотность ×' + (Math.round(d * 10) / 10) + (m === 'auto' ? ' · может снизиться при низком FPS' : ' · не снижается автоматически'); }
}
(() => {
  const sh = document.getElementById('gfx64'); if (!sh) return;
  const close = () => { sh.classList.add('hidden'); sh.setAttribute('aria-hidden', 'true'); };
  const open = () => { hap(8); gfxPaint(); sh.classList.remove('hidden'); sh.setAttribute('aria-hidden', 'false'); };
  document.addEventListener('click', (e) => { if (e.target?.closest?.('[data-gfx-open]')) open(); });
  sh.addEventListener('click', (e) => { const o = e.target?.closest?.('[data-gfx]'); if (o) { hap(6); setGfxMode(o.dataset.gfx); return; } if (e.target?.closest?.('[data-close64]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sh.classList.contains('hidden')) close(); });
  gfxPaint();
  window.__gfx64 = { open, close, set: setGfxMode };
})();
// значения в строках «Журнал замеров / сессий»
function rows61() {
  const s = (state.slips || [])[0];
  const z = document.getElementById('z61Last');
  if (z) { const t = s && s.v0100 != null ? '0–100 ' + Number(s.v0100).toFixed(2) + ' с' : 'пусто'; if (z.textContent !== t) z.textContent = t; }
  const l = document.getElementById('t61Last');
  if (l) { const d = (state.trackDays || [])[0]; const n = (state.trackDays || []).length; const t = d && d.bestMs != null ? fmtLapTime(d.bestMs) + ' · ' + n + ' сесс.' : 'пусто'; if (l.textContent !== t) l.textContent = t; }
}
setTimeout(rows61, 700); setInterval(() => { if (!document.hidden) rows61(); }, 3000);
window.__jn61 = { go: journalGo61, render: () => renderJournal61() };

/* v166: экран «Настройки» — строки-переходы, вибрация, версия, кто вошёл */
(() => {
  const v = document.getElementById('view-settings'); if (!v) return;
  document.addEventListener('click', (e) => {
    const r = e.target?.closest?.('[data-st]'); if (!r) return;
    const k = r.dataset.st;
    if (k === 'profile') goToView('account');
    else if (k === 'garage') goToView('garage');
    else if (k === 'gps') window.__gps61?.open?.();
    else if (k === 'settings') window.__route48?.('settings');
    if (k !== 'gps') window.scrollTo(0, 0);
  });
  const ht = document.getElementById('hapToggle');
  if (ht) {
    try { ht.checked = localStorage.getItem('pitlane-hap-off') !== '1'; } catch (_) {}
    ht.addEventListener('change', () => { try { if (ht.checked) localStorage.removeItem('pitlane-hap-off'); else localStorage.setItem('pitlane-hap-off', '1'); } catch (_) {} if (ht.checked) hap(10); });
  }
  const ver = document.getElementById('st66Ver'); if (ver) ver.textContent = 'PITLANE 1.0 beta';
  const who = () => {
    const nick = (document.getElementById('accNick')?.value || '').trim(); const ph = (document.getElementById('accPhone')?.textContent || '').trim();
    const t = nick || (ph && ph !== 'не вошли' ? ph : 'не вошли'); const el = document.getElementById('st66Who'); if (el && el.textContent !== t) el.textContent = t;
  };
  // пустые группы (уведомления до входа, «Быстрый Замер» вне iPhone-браузера) не показываем
  const groups = () => v.querySelectorAll('.st66-g').forEach((g) => { const any = [...g.querySelectorAll('.st66-list > *')].some((c) => !c.hidden && !c.classList.contains('hidden') && getComputedStyle(c).display !== 'none'); g.hidden = !any; });
  const dedupe = () => { const a = document.getElementById('accPhone'), b = document.getElementById('accPhoneStatus'); if (a && b) b.hidden = !!a.textContent.trim() && a.textContent.trim() === b.textContent.trim(); };
  const pv = document.getElementById('view-account');
  if (pv) new MutationObserver(() => { if (pv.classList.contains('active')) dedupe(); }).observe(pv, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => { if (v.classList.contains('active')) { who(); groups(); } }).observe(v, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => { try { groups(); dedupe(); } catch (_) {} }, 1500);
  who();
})();

/* v169: потянуть шторку вниз за верх — закрыть (iOS-жест). Работает поверх существующих кнопок закрытия, ничего не ломает. */
(function sheetDrag169() {
  const PANELS = '.race-sheet-panel, .ds-sheet-panel, .tgs-panel, .crew-sheet-panel, .rd50-sheet';
  const CLOSE = '[data-close], .race-sheet-close, .ds-sheet-x, .tgs-close, .plm-close, button[aria-label="Закрыть"], button[aria-label="Close"]';
  let g = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches && e.touches[0]; if (!t || e.touches.length > 1) return;
    const panel = e.target.closest && e.target.closest(PANELS); if (!panel) return;
    if (e.target.closest('input, textarea, select, [type=range], canvas, .no-drag')) return;
    const r = panel.getBoundingClientRect();
    if (t.clientY - r.top > 72) return;
    g = { panel, y0: t.clientY, dy: 0, t0: performance.now(), on: false };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!g) return; const t = e.touches[0]; const dy = t.clientY - g.y0;
    if (!g.on && dy > 8) { g.on = true; g.panel.style.transition = 'none'; }
    if (!g.on) return;
    g.dy = Math.max(0, dy);
    g.panel.style.transform = 'translate3d(0,' + (g.dy < 0 ? 0 : g.dy) + 'px,0)';
  }, { passive: true });
  const end = () => {
    if (!g) return; const p = g.panel; const fast = g.dy / Math.max(1, performance.now() - g.t0) > 0.6;
    const close = g.on && (g.dy > 110 || (fast && g.dy > 40));
    p.style.transition = 'transform 320ms cubic-bezier(.32,.72,0,1)';
    if (close) {
      p.style.transform = 'translate3d(0,100%,0)';
      const root = p.closest('.race-sheet, .ds-sheet, .crew-sheet, .tgs, [role=dialog]') || p.parentElement;
      const btn = (root && root.querySelector(CLOSE)) || p.querySelector(CLOSE);
      setTimeout(() => { try { if (btn) btn.click(); else { const sc = root && root.querySelector('.ds-sheet-scrim, .race-sheet-scrim, .crew-sheet-scrim'); if (sc) sc.click(); } } catch (_) {} setTimeout(() => { p.style.transform = ''; p.style.transition = ''; }, 60); }, 200);
      try { hap(8); } catch (_) {}
    } else {
      p.style.transform = '';
      setTimeout(() => { p.style.transition = ''; }, 340);
    }
    g = null;
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
  window.__sd169 = true;
})();

/* v171: большой заголовок экрана при прокрутке «сворачивается» в шапку (как в iOS), а фото машины — лёгкий параллакс. Только transform/opacity, один rAF на кадр. */
(function collapse171() {
  const bar = document.querySelector('.brand-bar'); if (!bar) return;
  const logo = bar.querySelector(':scope > b');
  const t = document.createElement('span'); t.className = 'bb-title'; t.setAttribute('aria-hidden', 'true');
  if (logo) logo.after(t); else bar.appendChild(t);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, lastView = null, head = null;
  const pick = () => {
    const v = document.querySelector('.view.active'); if (!v) return null;
    if (v !== lastView) { lastView = v; head = v.querySelector('h1, h2'); }
    return head;
  };
  const tick = () => {
    raf = 0;
    const h = pick(); const bb = bar.getBoundingClientRect().bottom;
    let on = false;
    if (h && h.offsetParent !== null && (h.textContent || '').trim() && (h.textContent || '').trim() !== '—') {
      const r = h.getBoundingClientRect(); on = r.bottom < bb + 2;
      if (on && t.textContent !== h.textContent.trim()) t.textContent = h.textContent.trim();
      if (on && logo) t.style.left = logo.offsetLeft + 'px';
    }
    bar.classList.toggle('bb-t-on', on);
    if (!reduce) {
      const y = window.scrollY || 0;
      const img = document.getElementById('hwCarImg');
      if (img && lastView && lastView.id === 'view-home') img.style.setProperty('--px171', Math.min(60, y * 0.18).toFixed(1) + 'px');
      const pw = document.getElementById('podiumWrap');
      if (pw && lastView && lastView.id === 'view-garage') { const k = Math.min(1, y / 320); pw.style.setProperty('--px171', Math.min(120, y * 0.28).toFixed(1) + 'px'); pw.style.setProperty('--po171', (1 - k * 0.9).toFixed(3)); /* v173: машина гаснет раньше и не просвечивает сквозь стеклянную шапку */ }
    }
  };
  const q = () => { if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener('scroll', q, { passive: true });
  addEventListener('resize', q, { passive: true });
  const mo = new MutationObserver(() => { lastView = null; q(); });
  document.querySelectorAll('.view').forEach((v) => mo.observe(v, { attributes: true, attributeFilter: ['class'] }));
  q();
  window.__c171 = { tick }; window.__skel171 = skel171;
})();

/* v187: inline onsubmit убраны (CSP) + строка «что это» только вне Telegram */
['authForm', 'feedbackForm'].forEach((id) => document.getElementById(id)?.addEventListener('submit', (e) => e.preventDefault()));
if (!tmaInitData && !isTMA) { const h = document.getElementById('webHero'); if (h) h.hidden = false; }

/* ——— v192: витрина наград + Paddock Pass в Профиле (макеты v11). Награды — только из реальных топов и своих кругов. ——— */
const AW92 = { boards: null, at: 0, busy: false };
async function aw92Boards() {
  if (AW92.boards && Date.now() - AW92.at < 600000) return AW92.boards;
  const out = {};
  if (isRemoteApi()) {
    await Promise.all(TRACKS.map(async (t) => { try { const r = await api.listLapBoard(t.id, 'all', 'ab'); if (Array.isArray(r) && r.length) out[t.id] = r; } catch (_) {} }));
  }
  AW92.boards = out; AW92.at = Date.now();
  return out;
}
async function renderAwards92() {
  const sc = document.getElementById('sc92'); const pp = document.getElementById('passBody'); // v200: Pass — в своей шторке
  if (!sc || AW92.busy) return;
  AW92.busy = true;
  try {
    const mc = myCarLocal();
    const nick = document.getElementById('accNick')?.value || '';
    const pid = (() => { try { return actingPilotId() || accountPilotId() || devicePilotId(); } catch (_) { return ''; } })();
    let pass = null;
    const pr = isRemoteApi() && getSessionToken() ? await api.mePass().catch(() => null) : null;
    const available = !!(pr && pr.ok !== false && pr.sales === true);
    if (pr && pr.ok !== false) pass = pr.pass || null;
    const base = { car: mc?.carId || '', carName: mc ? shortCarName(mc.model, mc.carId) : '', nick, pass, spec: mc ? carCardSpec(mc) : null, cardHtml: mc ? carCard293Html(mc.carId || '', mc.model, { tap: true, mods: mods302Get(mods302Key(mc)) }) : '', modsN: mc ? mods302Get(mods302Key(mc)).length : 0 };
    renderShowcase(sc, { ...base, res: computeAwards({ boards: {}, laps: state.laps, tracks: TRACKS, pid }) });
    const boards = await aw92Boards();
    renderShowcase(sc, { ...base, res: computeAwards({ boards, laps: state.laps, tracks: TRACKS, pid }) });
    if (pp) renderPassSheet(pp, {
      pass, available, guest: !currentUser(), onLogin: passLogin,
      onBuy: async (plan) => {
        const r = await api.passInvoice(plan);
        if (!r || r.ok === false || !r.link) return 'Оплата недоступна: ' + (r?.error || 'сеть');
        const TG = window.Telegram?.WebApp;
        if (TG && typeof TG.openInvoice === 'function') {
          TG.openInvoice(r.link, (st) => { if (st === 'paid') setTimeout(() => { void renderAwards92(); }, 1500); });
          return 'Счёт открыт';
        }
        window.open(r.link, '_blank', 'noopener');
        return 'Счёт в Telegram. Оплати и вернись в профиль.';
      },
      onCustomize: () => { closePassSheet(); setTimeout(() => openPfEdit({ focusPass: true }), 120); },
      onSave: async (c) => { const r = await api.putPassCosmetics(c); if (!r || r.ok === false) return 'Не сохранилось: ' + (r?.error || 'сеть'); AW92.at = 0; void renderAwards92(); return 'Сохранено'; },
    });
  } finally { AW92.busy = false; }
}

/* v279: гость → «Войти, чтобы купить» */
function passLogin() { closePassSheet(); needLogin('Paddock Pass — после входа через Telegram'); }
/* v200: Paddock Pass — пилюля в шапке → отдельная шторка */
function openPassSheet() {
  const sh = document.getElementById('passSheet'); if (!sh) return;
  const body = document.getElementById('passBody');
  if (body && !body.childElementCount) { try { renderPassSheet(body, { pass: null, available: false, guest: !currentUser(), onLogin: passLogin, onBuy: async () => '', onSave: async () => '' }); } catch (_) {} }
  sh.classList.remove('hidden'); sh.setAttribute('aria-hidden', 'false');
  try { void renderAwards92(); } catch (_) {}
}
function closePassSheet() { const sh = document.getElementById('passSheet'); if (!sh) return; sh.classList.add('hidden'); sh.setAttribute('aria-hidden', 'true'); }
document.getElementById('btnPass')?.addEventListener('click', () => openPassSheet());
document.getElementById('passClose')?.addEventListener('click', () => closePassSheet());
document.getElementById('passSheet')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closePassSheet(); });

/* v202: компактный топ 0–100 под «Стартом» — экран «Замер» не пустой у гостя */
let _z202At = 0;
async function renderZamerTop202() {
  const box = document.getElementById('z202Top'); const ol = document.getElementById('z202TopL');
  if (!box || !ol || Date.now() - _z202At < 60000) return;
  _z202At = Date.now();
  let rows = [];
  try { if (isRemoteApi()) rows = (await api.listDrag('0-100', {})) || []; } catch (_) { rows = []; }
  try { rows = filterTopRows(rows, {}); } catch (_) {}
  rows = rows.filter((r) => r && Number(r.t) > 0).sort((a, b) => Number(a.t) - Number(b.t)).slice(0, 3);
  ol.replaceChildren();
  if (!rows.length) {
    const li = document.createElement('li'); li.className = 'z202-empty';
    li.textContent = 'Первое место свободно — займи его';
    ol.appendChild(li);
  } else rows.forEach((r, i) => {
    const li = document.createElement('li');
    const n = document.createElement('span'); n.className = 'z202-n'; n.textContent = String(i + 1);
    const nm = document.createElement('span'); nm.className = 'z202-nm'; nm.textContent = String(r.name || r.nick || 'Пилот').slice(0, 24);
    const t = document.createElement('b'); t.textContent = Number(r.t).toFixed(2) + ' с';
    li.append(n, nm, t); ol.appendChild(li);
  });
  box.hidden = false;
}
document.getElementById('hwAddCar')?.addEventListener('click', () => { try { openMyCarSheet({}); } catch (_) { goToView('garage'); } });
document.querySelector('[data-n3="zamer"]')?.addEventListener('click', () => { try { void renderZamerTop202(); } catch (_) {} });

/* ——— v205: Чат — полноэкранная страница Mini App ———
   Вкладки = поле ch у сообщения на Worker (gen|runs|tracks|q; старые сообщения — «Общий»). «Треки» — фильтр
   и привязка сообщения к трассе (trk). Шапка/композер учитывают safe areas Telegram и клавиатуру iOS (--kb).
   Назад — Telegram BackButton (через общий список SHEETS) или ‹ в шапке. */
const CP_TABS = { gen: 'Общий', runs: 'Замеры', tracks: 'Треки', q: 'Вопросы' };
const CP_TO = { gen: 'в Общий', runs: 'в Замеры', tracks: 'в Треки', q: 'в Вопросы' };
const CP_PH = { gen: 'Написать в Общий…', runs: 'Поделиться замером…', tracks: 'Трасса, настройки, впечатления…', q: 'Задать вопрос…' };
function cpEmptyText() {
  if (CP.ch === 'runs') return 'Замеров пока нет — поделись своим 0–100 или ¼ мили.';
  if (CP.ch === 'tracks') return CP.trk ? 'По трассе «' + trackShortName(CP.trk) + '» пока пусто — напиши первым.' : 'Про трассы пока тихо — выбери трассу и напиши.';
  if (CP.ch === 'q') return 'Вопросов пока нет — спроси первым.';
  return 'Пока тихо — напиши первым.';
}
function cpPaintCounts() {
  const n = { gen: 0, runs: 0, tracks: 0, q: 0 };
  const wk = Date.now() - 7 * 86400e3;
  for (const p of CP.all || []) if (p && Number(p.at) >= wk) n[cpChOf(p)]++;
  document.querySelectorAll('#cpTabs [data-ch]').forEach((b) => { const i = b.querySelector('i'); if (i) i.textContent = n[b.dataset.ch] ? String(n[b.dataset.ch] > 99 ? '99+' : n[b.dataset.ch]) : ''; });
  const pilots = new Set((CP.all || []).filter((p) => p && p.pilotId).map((p) => p.pilotId)).size;
  const sub = document.getElementById('cpSub');
  if (sub) sub.textContent = (CP.all || []).length ? (pilots || 1) + ' ' + padRu(pilots || 1, 'пилот', 'пилота', 'пилотов') + ' · ' + (CP.all || []).length + ' ' + padRu((CP.all || []).length, 'сообщение', 'сообщения', 'сообщений') : 'пилоты Pitlane';
}
let _cpTopSeq = 0;
function cpPaintPin() {
  const pin = document.getElementById('cpPin'); if (!pin) return;
  const key = CP.ch + ':' + CP.trk + ':' + (CP.all || []).length;
  if (pin.dataset.key === key) return;
  pin.dataset.key = key;
  pin.replaceChildren();
  const head = (t, s) => { const h = padEl('div', 'cp-sec'); h.append(padEl('b', '', t)); if (s) h.append(padEl('span', '', s)); return h; };
  if (CP.ch === 'tracks') {
    const used = new Map();
    for (const p of CP.all || []) if (p && p.ch === 'tracks' && p.trk) used.set(p.trk, (used.get(p.trk) || 0) + 1);
    const list = [...TRACKS].sort((a, b) => (used.get(b.id) || 0) - (used.get(a.id) || 0) || (b.cult ? 1 : 0) - (a.cult ? 1 : 0));
    const row = padEl('div', 'cp-chips'); row.setAttribute('data-no-sheet-drag', '');
    const chip = (id, label, cnt) => { const c = padEl('button', 'cp-chip' + (CP.trk === id ? ' on' : '')); c.type = 'button'; c.dataset.trk = id; c.append(padEl('span', '', label)); if (cnt) c.append(padEl('i', '', String(cnt))); return c; };
    row.append(chip('', 'Все трассы', 0));
    for (const t of list) row.append(chip(t.id, trackShortName(t.id), used.get(t.id) || 0));
    pin.append(row);
    if (CP.trk) { const tr = TRACKS.find((t) => t.id === CP.trk); pin.append(head(trackShortName(CP.trk), [tr?.km ? tr.km + ' км' : '', tr?.turns ? tr.turns + ' поворотов' : ''].filter(Boolean).join(' · '))); }
    requestAnimationFrame(() => row.querySelector('.cp-chip.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' }));
    return;
  }
  if (CP.ch === 'runs') {
    const box = padEl('div', 'cp-board');
    box.append(head('Лучшие 0–100', 'GPS A/B · все машины'));
    const ol = padEl('ol', 'cp-mini'); box.append(ol);
    const go = padEl('button', 'cp-link', 'Все топы'); go.type = 'button'; go.dataset.go = 'tops'; box.append(go);
    pin.append(box);
    const seq = ++_cpTopSeq;
    void Promise.resolve(api.listDrag('0-100', {})).then((rows) => {
      if (seq !== _cpTopSeq) return;
      rows = (rows || []).filter((r) => r && Number.isFinite(Number(r.t))).sort((a, b) => a.t - b.t).slice(0, 3);
      if (!rows.length) { ol.replaceWith(padEl('p', 'cp-note', 'Топ пуст — первый замер займёт П1.')); return; }
      rows.forEach((r, i) => {
        const li = padEl('li', 'cp-mrow p' + (i + 1));
        li.append(padEl('span', 'cp-pos', 'P' + (i + 1)));
        li.append(padAuthor({ name: r.name, pilotId: r.pilotId, avatar: r.avatar || '', meta: shortCarName(r.car, r.carId) || '', size: 28, pp: r.pp || null }));
        li.append(padEl('b', 'cp-time', Number(r.t).toFixed(2) + ' с'));
        ol.append(li);
      });
    }).catch(() => {});
    return;
  }
  if (CP.ch === 'q') { pin.append(head('Вопросы пилотам', 'настройка, резина, трассы, замеры — отвечают в комментариях')); return; }
  // Общий: закреп — самое обсуждаемое за неделю (реальные лайки + ответы)
  const wk = Date.now() - 7 * 86400e3;
  const best = (CP.all || []).filter((p) => p && cpChOf(p) === 'gen' && Number(p.at) >= wk && ((p.likeCount || 0) + (p.commentCount || 0)) > 0)
    .sort((a, b) => ((b.likeCount || 0) + (b.commentCount || 0)) - ((a.likeCount || 0) + (a.commentCount || 0)))[0];
  if (best) {
    const c = padEl('button', 'cp-top'); c.type = 'button'; c.dataset.jump = best.id;
    c.append(padEl('span', 'cp-top-k', 'Обсуждают на неделе'));
    c.append(padEl('span', 'cp-top-t', String(best.text || '').slice(0, 120)));
    c.append(padEl('span', 'cp-top-m', padName(best.who) + ' · ♥ ' + (best.likeCount || 0) + (best.commentCount ? ' · ' + best.commentCount + ' ' + padComLabel(best.commentCount) : '')));
    pin.append(c);
  }
}
function cpSetTab(ch, { trk } = {}) {
  if (!CP_TABS[ch]) ch = 'gen';
  CP.ch = ch; if (trk !== undefined) CP.trk = trk;
  try { localStorage.setItem('pitlane-chat-tab', ch); } catch (_) {}
  const tabs = document.getElementById('cpTabs');
  tabs?.querySelectorAll('[data-ch]').forEach((b, i) => {
    const on = b.dataset.ch === ch; b.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) tabs.style.setProperty('--ink-i', String(i));
  });
  const t = document.getElementById('pulseText'); if (t) t.placeholder = CP_PH[ch];
  const to = document.getElementById('cpTo');
  if (to) { to.textContent = ch === 'tracks' && CP.trk ? 'в Треки · ' + trackShortName(CP.trk) : CP_TO[ch]; }
  const pin = document.getElementById('cpPin'); if (pin) pin.dataset.key = '';
  renderPulseRows(CP.all);
  try { padPaintAttach(); } catch (_) {}
  document.getElementById('chatBody')?.scrollTo?.({ top: 0 });
}
function openChatPage() {
  const pg = document.getElementById('chatPage'); const v = document.getElementById('view-pulse');
  if (!pg || !v) return;
  try { plMenuClose(); } catch (_) {}
  setTimeout(() => { try { tipsOnView('pulse'); } catch (_) {} }, 600);
  if (!CP.open) {
    try { const s = localStorage.getItem('pitlane-chat-tab'); if (CP_TABS[s]) CP.ch = s; } catch (_) {}
    document.getElementById('chatSlot')?.appendChild(v);
    v.classList.add('in-chat');
    const cmp = v.querySelector('.pulse-compose') || document.querySelector('.pulse-compose');
    if (cmp) { document.getElementById('chatFoot')?.appendChild(cmp); cmp.classList.add('pc-foot'); }
    CP.open = true;
    try { window.scrollTo(0, 0); const hd = document.querySelector('.brand-bar'); const hb = hd && hd.offsetParent ? Math.max(0, Math.round(hd.getBoundingClientRect().bottom)) : 0; document.documentElement.style.setProperty('--cp-top', hb + 'px'); } catch (_) {} // v262: чат — обычная вкладка под шапкой приложения
    pg.classList.remove('hidden'); pg.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('chat-open');
    requestAnimationFrame(() => requestAnimationFrame(() => pg.classList.add('on')));
  }
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.sheet === 'pulse'));
  cpSetTab(CP.ch);
  void renderPulse();
  try { localStorage.setItem(PULSE_SEEN_KEY, String(Date.now())); } catch (_) {}
  try { setBadge('sbBadgePulse', 0); } catch (_) {}
  if (typeof _padChat !== 'undefined' && _padChat) { _padChat.fresh = 0; _hwPadAt = 0; }
}
function closeChatPage(opts = {}) {
  const pg = document.getElementById('chatPage'); if (!pg || !CP.open) return;
  CP.open = false;
  try { document.activeElement?.blur?.(); } catch (_) {}
  pg.classList.remove('on'); pg.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('chat-open');
  document.querySelectorAll('.nav-btn.sheet-tab').forEach((b) => { if (b.dataset.sheet === 'pulse') b.classList.remove('active'); });
  const done = () => { if (!CP.open) pg.classList.add('hidden'); };
  if (opts.instant || tgsReduce()) done(); else setTimeout(done, 300);
}
document.getElementById('chatBack')?.addEventListener('click', () => { hap(6); closeChatPage(); });
document.getElementById('cpTabs')?.addEventListener('click', (e) => {
  const b = e.target?.closest?.('[data-ch]'); if (!b || b.dataset.ch === CP.ch) return;
  hap(6); cpSetTab(b.dataset.ch);
});
document.getElementById('cpPin')?.addEventListener('click', (e) => {
  const c = e.target?.closest?.('[data-trk]');
  if (c) { hap(6); cpSetTab('tracks', { trk: c.dataset.trk }); return; }
  const j = e.target?.closest?.('[data-jump]');
  if (j) { const el = [...document.querySelectorAll('#pulseFeed [data-post]')].find((x) => x.dataset.post === j.dataset.jump); el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); el?.classList.add('flash'); setTimeout(() => el?.classList.remove('flash'), 1400); return; }
  if (e.target?.closest?.('[data-go="tops"]')) { closeChatPage({ instant: true }); goToView('tops'); }
});
document.getElementById('pulseFeed')?.addEventListener('click', (e) => {
  const t = e.target?.closest?.('.pad-trk'); if (t && CP.open) { e.stopPropagation(); cpSetTab('tracks', { trk: t.dataset.trk }); }
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && CP.open && !document.querySelector('.pad-sheet:not(.hidden)')) closeChatPage(); });

/* ——— v206: Профиль как в Telegram + единая навигация (Замер · Трек · Топы · Чат · Профиль) ———
   Шапка профиля: аватар в рамке Pass, ник + гоночный номер + пин (как звезда Premium), статус Pass, «Изменить» справа.
   Экран «Изменить профиль»: аватар, ник, обложка, машина + «Оформление Pass» с живым превью. Всё остальное — строки списка. */
document.documentElement.classList.add('v206p');
['btnMenu', 'btnProfile', 'btnHome', 'plMenu'].forEach((id) => document.getElementById(id)?.remove()); // v206: ☰ и дубли входов убраны — всё в Профиле
const PF6 = { pass: null, sales: false, at: 0, draft: null };
const PF6_FR = [['', 'Без рамки'], ...PASS_FRAMES];
const PF6_PIN = [['', 'Без пина'], ['helmet', 'Шлем'], ['wheel', 'Руль'], ['carbon', 'Карбон']];
const PF6_IC = {
  mycar: '<path d="M3.5 15.5l1.6-4.4A2 2 0 0 1 7 9.8h10a2 2 0 0 1 1.9 1.3l1.6 4.4v2.5a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="15.5" r=".8"/><circle cx="16.5" cy="15.5" r=".8"/>',
  garage: '<path d="M4 10.5L12 5l8 5.5V19H4z"/><path d="M8 19v-5h8v5"/>',
  history: '<circle cx="12" cy="12" r="7.5"/><path d="M12 8v4l3 2"/>',
  pass: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  shop: '<path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  suggest: '<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
  feedback: '<path d="M5 5h14v10h-8l-4 4v-4H5z"/>',
  help: '<circle cx="12" cy="12" r="8"/><path d="M9.8 9.6a2.3 2.3 0 1 1 3.3 2.1c-.7.4-1.1.9-1.1 1.7M12 16.4v.2"/>',
  method: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h6"/>',
};
document.querySelectorAll('#pf6List .pf6-row').forEach((r) => { const k = r.dataset.pf6 || 'method'; const i = r.querySelector('.pf6-ic'); if (i && PF6_IC[k]) i.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + PF6_IC[k] + '</svg>'; });
function pf6Nick() { return (profile().nick || currentUser()?.nick || '').trim(); }
function pf6Ava() { return profile().avatar || currentUser()?.photo || currentUser()?.avatar || ''; }
function pf6Active() { return !!(PF6.pass && PF6.pass.active); }
function pf6Cos() { return pf6Active() ? { frame: passFrame(PF6.pass.frame),  pin: PF6.pass.pin || '' } : { frame: '', pin: '' }; }
/** ник + номер + пин — один и тот же вид везде, где есть pp */
function pf6NameRow(name, pp, cls = 'pf6-nm', own = true) {
  const row = padEl('span', cls);
  row.append(padEl('b', '', name || 'Пилот'));
  if (pp && pp.pin) { const im = pp.pin === 'helmet' ? helmet3d('pf6-pin') : document.createElement('img'); im.className = 'pf6-pin' + (pp.pin === 'helmet' ? ' spin3' : ''); im.dataset.pin = pp.pin; if (own) im.dataset.own = '1'; im.alt = 'Пин'; im.setAttribute('role', 'button'); im.tabIndex = 0; if (im.tagName === 'IMG') im.src = awardImg(pp.pin, true); row.append(im); }
  return row;
}
function pf6AvaEl(size, pp) {
  let a = padAvatar(pf6Nick() || (currentUser() ? 'Пилот' : 'Г'), pf6Ava(), size); // v251: гость — «Г», а не «ПИ»
  if (pp && pp.frame) { try { a = framedAvatar(a, pp.frame, size); } catch (_) {} }
  return a;
}
async function pf6LoadPass(force) {
  if (!force && Date.now() - PF6.at < 60000) return;
  PF6.at = Date.now();
  if (!(isRemoteApi() && getSessionToken() && currentUser())) { PF6.pass = null; return; }
  const r = await api.mePass().catch(() => null);
  if (r && r.ok !== false) { PF6.pass = r.pass || null; if (PF6.pass) PF6.pass.frame = passFrame(PF6.pass.frame); PF6.sales = r.sales === true; }
  // v222: значок «Основатель» — сервер считает по подтверждённой заявке на чип
  const so = await api.shopOrders().catch(() => null);
  if (so && so.ok) { try { localStorage.setItem('pl_founder', so.founder ? '1' : '0'); } catch (_) {} }
}
const pf6Founder = () => { try { return localStorage.getItem('pl_founder') === '1'; } catch (_) { return false; } };
function renderPf6() {
  const u = currentUser(); const pp = pf6Cos();
  const ava = document.getElementById('pf6Ava'); if (ava) ava.replaceChildren(pf6AvaEl(96, pp));
  const nm = document.getElementById('pf6Name'); if (nm) { nm.replaceChildren(pf6NameRow(pf6Nick() || (u ? 'Без ника' : 'Гость'), pp)); if (u && pf6Founder()) nm.appendChild(padEl('span', 'pf6-founder', 'Основатель')); }
  const sub = document.getElementById('pf6Sub');
  if (sub) { const mc = (() => { try { return myCarLocal(); } catch (_) { return null; } })(); sub.textContent = u ? (mc ? shortCarName(mc.model, mc.carId) : 'Машина не выбрана') : 'Войди через Telegram, чтобы попасть в топы'; }
  const ps = document.getElementById('pf6Pass');
  if (ps) { // v298: минимальная кнопка подписки — без золотой плашки, видна и гостю
    ps.hidden = false; ps.classList.toggle('on', pf6Active());
    const until = pf6Active() && PF6.pass.until ? new Date(PF6.pass.until).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '';
    // v303: карбоновая пилюля PITLANE PASS с красной линией слева
    ps.replaceChildren(padEl('span', 'pf6-pass-k', 'PITLANE PASS'), padEl('span', 'pf6-pass-v', 'от ' + PASS_STARS_206 + ' Stars ›'));
    ps.setAttribute('aria-label', pf6Active() ? 'Подписка активна' + (until ? ' до ' + until : '') : 'PITLANE PASS, от ' + PASS_STARS_206 + ' звёзд');
  }
  try { pf6PaintStats(); } catch (_) {}
  try { pf6PaintPassTile(u); } catch (_) {}
  const pv = document.getElementById('pf6PassV'); if (pv) pv.textContent = pf6Active() ? 'активен' : 'от ' + PASS_STARS_206 + ' ★';
  const eb = document.getElementById('pf6EditBtn'); if (eb) eb.hidden = !u;
  pf6NavAva();
}
/* v299: три ключевых цифры под ником — лучшее 0–100, лучшая ¼ мили, кругов (только реальные, локальные) */
function pf6PaintStats() {
  const box = document.getElementById('pf6Stats'); if (!box) return;
  const best = (d) => { let b = 0; for (const st of [state.dragBest, state.dragBestC]) for (const c of Object.values(st || {})) { const t = Number(c?.[d]?.t); if (t > 0 && (!b || t < b)) b = t; } return b; };
  const items = [[best('0-100'), '0–100', 'с'], [best('402m'), '¼ мили', 'с'], [Array.isArray(state.laps) ? state.laps.length : 0, 'кругов', '']];
  box.replaceChildren(...items.map(([v, k, u]) => { const c = padEl('div', 'pf6-st'); const b = padEl('b', '', v ? (u ? Number(v).toFixed(2) : String(v)) : '—'); if (v && u) b.append(padEl('small', '', ' ' + u)); c.append(b, padEl('span', '', k)); return c; }));
}
const PASS_STARS_206 = 150; // v305: от 150 ★ (месяц) · сезон 350 · год 1190
function pf6NavAva() {
  const n = document.getElementById('n6Ava'); if (!n) return;
  const src = pf6Ava();
  if (src && (PAD_IMG_RE.test(src) || PAD_AVA_RE.test(src))) { if (n.dataset.src !== src) { n.dataset.src = src; n.innerHTML = ''; const i = document.createElement('img'); i.alt = ''; i.src = src; n.append(i); n.classList.add('img'); } }
}
async function pf6Refresh() { renderPf6(); await pf6LoadPass(); renderPf6(); }
document.getElementById('pf6EditBtn')?.addEventListener('click', () => { hap(8); openPfEdit(); });
document.getElementById('pf6Pass')?.addEventListener('click', () => { hap(6); if (pf6Active() && currentUser()) openPfEdit({ focusPass: true }); else openPassSheet(); });
document.getElementById('pf6Ava')?.addEventListener('click', () => { if (currentUser()) { hap(6); openPfEdit(); } });
document.getElementById('view-settings')?.addEventListener('click', (e) => { const r = e.target.closest('[data-st-go]'); if (!r) return; hap(6); window.__route48?.(r.dataset.stGo); }); // v279
document.getElementById('pf6List')?.addEventListener('click', (e) => {
  const r = e.target.closest('[data-pf6]'); if (!r) return;
  const k = r.dataset.pf6; hap(6);
  if (k === 'mycar') { try { openMyCarSheet({}); } catch (_) {} }
  else if (k === 'help') { window.__route48?.('settings'); setTimeout(() => { const el = document.getElementById('st66Help'); if (!el) return; const hb = document.querySelector('.brand-bar')?.getBoundingClientRect().bottom || 0; window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - hb - 12), behavior: 'smooth' }); }, 260); } // v299: «Помощь» не под шапкой
  else if (k === 'pass') openPassSheet();
  else window.__route48?.(k);
});

/* —— экран «Изменить профиль» —— */
function pfeEl() { return document.getElementById('pfEdit'); }
function openPfEdit(opts = {}) {
  const pg = pfeEl(); if (!pg) return;
  PF6.draft = { nick: pf6Nick(), ...pf6Cos() };
  renderPfEdit();
  pg.classList.remove('hidden'); pg.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('pfe-open');
  requestAnimationFrame(() => requestAnimationFrame(() => pg.classList.add('on')));
  setTimeout(() => { try { tipsOnView('pfedit'); } catch (_) {} }, 500);
  if (opts.focusPass) setTimeout(() => document.getElementById('pfePass')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320);
  void pf6LoadPass(true).then(() => { if (!pg.classList.contains('hidden')) { const d = PF6.draft; PF6.draft = { ...pf6Cos(), nick: d.nick }; renderPfEdit(); } });
}
function closePfEdit() {
  const pg = pfeEl(); if (!pg || pg.classList.contains('hidden')) return;
  try { document.activeElement?.blur?.(); } catch (_) {}
  pg.classList.remove('on'); pg.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('pfe-open');
  setTimeout(() => { if (!pg.classList.contains('on')) pg.classList.add('hidden'); }, tgsReduce() ? 0 : 280);
}
function pfePreview() {
  const d = PF6.draft; const pp = { frame: d.frame, pin: d.pin };
  const box = document.getElementById('pfePrev'); if (!box) return;
  box.replaceChildren();
  const row = padEl('div', 'pfe-prow');
  row.append(pf6AvaEl(56, pp));
  const w = padEl('div', 'pfe-pwho');
  w.append(pf6NameRow(d.nick || 'Пилот', pp, 'pf6-nm pfe-pnm'));
  w.append(padEl('small', '', 'так тебя видят в топах и в чате'));
  row.append(w);
  row.append(padEl('b', 'pfe-ptime', '3.62 с'));
  box.append(row);
}
function renderPfEdit() {
  const b = document.getElementById('pfeBody'); if (!b) return;
  const d = PF6.draft; const on = pf6Active();
  b.replaceChildren();
  // аватар
  const top = padEl('div', 'pfe-top');
  const av = padEl('button', 'pfe-ava'); av.type = 'button'; av.append(pf6AvaEl(96, on ? d : null));
  av.addEventListener('click', () => document.getElementById('accAvatarIn')?.click());
  top.append(av);
  const ch = padEl('button', 'pfe-link', 'Выбрать фото'); ch.type = 'button'; ch.addEventListener('click', () => document.getElementById('accAvatarIn')?.click());
  top.append(ch);
  b.append(top);
  // ник
  const g1 = padEl('div', 'pfe-g');
  const lab = padEl('label', 'pfe-row pfe-in');
  lab.append(padEl('span', 'pfe-k', 'Ник'));
  const inp = document.createElement('input'); inp.id = 'pfeNick'; inp.maxLength = 24; inp.placeholder = 'как в топе'; inp.value = d.nick || ''; inp.autocomplete = 'nickname';
  inp.addEventListener('input', () => { d.nick = inp.value.trim(); pfePreview(); });
  lab.append(inp); g1.append(lab);
  b.append(g1);
  b.append(padEl('p', 'pfe-hint', 'Ник видят все. До 24 символов.'));
  const g2 = padEl('div', 'pfe-g');
  const rowBtn = (k, v, fn) => { const r = padEl('button', 'pfe-row'); r.type = 'button'; r.append(padEl('span', 'pfe-k', k)); if (v) r.append(padEl('span', 'pfe-v', v)); r.append(padEl('b', 'pf6-ch')); r.addEventListener('click', fn); return r; };
  const mc = (() => { try { return myCarLocal(); } catch (_) { return null; } })();
  g2.append(rowBtn('Машина', mc ? shortCarName(mc.model, mc.carId) : 'не выбрана', () => { try { openMyCarSheet({}); } catch (_) {} }));
  g2.append(rowBtn('Обложка профиля', '', () => { try { openBannerSheet(); } catch (_) {} }));
  b.append(g2);
  // Pass
  const ps = padEl('section', 'pfe-pass' + (on ? '' : ' locked')); ps.id = 'pfePass';
  const hd = padEl('div', 'pfe-ph');
  const pi = document.createElement('img'); pi.src = './img/awards/pass_s.webp'; pi.alt = '';
  hd.append(pi, padEl('b', '', 'Оформление Pass'));
  if (!on) hd.append(padEl('span', 'pfe-lock', 'Paddock Pass'));
  ps.append(hd);
  const prev = padEl('div', 'pfe-prev'); prev.id = 'pfePrev'; ps.append(prev);
  const pick = (title, list, key, imgOf) => {
    ps.append(padEl('p', 'pfe-sh', title));
    const g = padEl('div', 'pfe-pick'); g.setAttribute('role', 'radiogroup');
    for (const [v, l] of list) {
      const c = padEl('button', 'pfe-opt' + (d[key] === v ? ' on' : '')); c.type = 'button'; c.setAttribute('role', 'radio'); c.setAttribute('aria-checked', d[key] === v ? 'true' : 'false');
      const ic = padEl('span', 'pfe-oi'); const src = imgOf(v);
      if (src) { const im = document.createElement('img'); im.src = src; im.alt = ''; ic.append(im); } else ic.append(padEl('i', 'pfe-none'));
      c.append(ic, padEl('small', '', l));
      c.addEventListener('click', () => { if (!on) { hap(4); openPassSheet(); return; } hap(6); d[key] = v; g.querySelectorAll('.pfe-opt').forEach((x) => { x.classList.toggle('on', x === c); x.setAttribute('aria-checked', x === c ? 'true' : 'false'); }); pfePreview(); try { av.replaceChildren(pf6AvaEl(96, d)); } catch (_) {} });
      g.append(c);
    }
    ps.append(g);
  };
  pick('Рамка аватара', PF6_FR, 'frame', (v) => passFrameSrc(v));
  pick('Пин у ника', PF6_PIN, 'pin', (v) => (v ? awardImg(v, true) : ''));
  if (!on) {
    const up = padEl('button', 'pfe-buy'); up.type = 'button';
    up.append(padEl('b', '', 'Открыть с Paddock Pass'), padEl('span', '', 'от ' + PASS_STARS_206 + ' ★ · сезон 350 ★ · год 1190 ★'));
    up.addEventListener('click', () => { hap(8); openPassSheet(); });
    ps.append(up);
  }
  b.append(ps);
  b.append(padEl('p', 'pfe-msg tiny')); 
  pfePreview();
}
document.getElementById('pfeCancel')?.addEventListener('click', () => { hap(6); closePfEdit(); });
document.getElementById('pfeSave')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget; const d = PF6.draft; if (!d || btn.disabled) return;
  const msg = document.querySelector('#pfeBody .pfe-msg');
  btn.disabled = true; btn.textContent = '…';
  const errs = [];
  try {
    const nick = String(d.nick || '').slice(0, 24);
    if (nick !== pf6Nick()) {
      const p = profile(); p.nick = nick; saveProf(p);
      const ni = document.getElementById('accNick'); if (ni) ni.value = nick;
      const u = currentUser(); if (u && nick) { u.nick = nick; try { saveAuth(); } catch (_) {} }
      if (nick && isRemoteApi() && getSessionToken()) { const r = await api.setNick(nick).catch(() => null); if (!r || r.ok === false) errs.push('ник сохранён только на телефоне'); }
    }
    if (pf6Active()) {
      const c = pf6Cos();
      if (c.frame !== d.frame || c.pin !== d.pin) {
        const r = await api.putPassCosmetics({ number: null, frame: d.frame, pin: d.pin }).catch(() => null);
        if (r && r.ok !== false && r.pass) PF6.pass = r.pass; else errs.push('оформление: ' + (r?.error || 'нет связи'));
      }
    }
  } finally { btn.disabled = false; btn.textContent = 'Готово'; }
  if (errs.length) { if (msg) msg.textContent = 'Не всё сохранилось — ' + errs.join(', '); hap(20); return; }
  try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch (_) { hap(10); }
  AW92.at = 0; _z202At = 0;
  renderPf6(); try { void renderAwards92(); } catch (_) {}
  closePfEdit();
  try { plFlash('Профиль сохранён'); } catch (_) {}
});
document.getElementById('accAvatarIn')?.addEventListener('change', () => setTimeout(() => { renderPf6(); if (!pfeEl()?.classList.contains('hidden')) renderPfEdit(); }, 300));

/* —— навигация: нижняя панель синхронизируется со всеми экранами; подстраницы профиля → назад в профиль —— */
const N6_SUB = { garage: 'account', settings: 'account', history: 'account', cars: 'account', shop: 'account', home: 'zamer' };
function n6Sync() {
  const act = document.querySelector('.view.active')?.id?.replace('view-', '') || 'zamer';
  let key = CP.open ? 'pulse' : (act === 'run' ? 'zamer' : act);
  if (N6_SUB[key]) key = N6_SUB[key];
  document.querySelectorAll('#nav3 .nav3-btn').forEach((b) => { const on = b.dataset.n3 === key; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
document.getElementById('nav3')?.addEventListener('click', (e) => {
  const b = e.target.closest('.nav3-btn'); if (!b) return;
  if (b.dataset.n3 === 'account') setTimeout(() => void pf6Refresh(), 0);
  setTimeout(n6Sync, 30);
});
{
  const vh = document.getElementById('viewHost');
  if (vh) new MutationObserver(() => requestAnimationFrame(n6Sync)).observe(vh, { subtree: true, attributes: true, attributeFilter: ['class'] });
  const cp = document.getElementById('chatPage'); if (cp) new MutationObserver(() => requestAnimationFrame(n6Sync)).observe(cp, { attributes: true, attributeFilter: ['class'] });
  const src = document.getElementById('sbBadgePulse'); const dst = document.getElementById('n6BadgeChat');
  if (src && dst) setInterval(() => { dst.hidden = src.hidden || !src.textContent.trim(); dst.textContent = src.textContent; }, 2500);
  n6Sync();
}
window.__pf6 = { openPfEdit, closePfEdit, renderPf6, renderPfEdit, PF6, n6Sync };
setTimeout(() => { try { renderPf6(); if (document.getElementById('view-account')?.classList.contains('active')) void pf6Refresh(); } catch (_) {} }, 400);

/* v209: пины у ника кликабельны — премиальный поповер с объяснением */
const PIN209 = { helmet: ['Пин «Шлем»', 'Гоночный шлем у ника'], wheel: ['Пин «Руль»', 'Руль у ника'], carbon: ['Пин «Карбон»', 'Карбоновый знак у ника'] };
function openPin209(k, own) {
  const m = PIN209[k]; if (!m) return;
  document.getElementById('pin209')?.remove();
  const ov = padEl('div', 'pin209'); ov.id = 'pin209'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', m[0]);
  const c = padEl('div', 'pin209-c');
  let im; if (k === 'helmet') { im = helmet3d('pin209-i', true, true); } else { im = document.createElement('img'); im.src = awardImg(k); im.alt = ''; im.className = 'pin209-i'; } // v213: шлем — 3D 360°, крутится сам и пальцем
  c.append(im, padEl('span', 'pin209-k', 'PADDOCK PASS'), padEl('h3', '', m[0]), padEl('p', '', m[1] + '. Украшение Paddock Pass — на время и топ не влияет.'));
  if (own && currentUser()) { const b = padEl('button', 'pin209-b', 'Сменить пин'); b.type = 'button'; b.addEventListener('click', () => { close(); setTimeout(() => openPfEdit({ focusPass: true }), 150); }); c.append(b); }
  const x = padEl('button', 'pin209-x', 'Закрыть'); x.type = 'button'; x.addEventListener('click', () => close()); c.append(x);
  ov.append(c);
  function close() { ov.classList.remove('on'); setTimeout(() => ov.remove(), 220); }
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  document.body.append(ov);
  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('on')));
}
document.addEventListener('click', (e) => {
  const p = e.target.closest?.('[data-pin]'); if (!p || p.closest('.pin209')) return;
  e.preventDefault(); e.stopPropagation(); hap(6);
  openPin209(p.dataset.pin, p.dataset.own === '1' && !p.closest('#pfEdit'));
}, true);
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('[data-pin]')) { e.preventDefault(); e.target.click(); } });


/* v266: живая плитка Pass в профиле — металлическая карта, медленный блик, наклон от гироскопа/пальца */
function pf6PaintPassTile(u) {
  const t = document.getElementById('pf6PassTile'); if (!t) return;
  const on = pf6Active();
  const mc = (() => { try { return myCarLocal(); } catch (_) { return null; } })();
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('ptNick', pf6Nick() || (u ? 'Без ника' : 'Гость'));
  set('ptCar', mc ? shortCarName(mc.model, mc.carId) : 'Машина не выбрана');
  set('ptSeason', (PF6.pass && PF6.pass.season) ? String(PF6.pass.season) : 'Сезон ' + new Date().getFullYear());
  set('ptStatus', on ? 'Активен до ' + new Date(PF6.pass.until).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : 'Не активен');
  const cta = document.getElementById('ptCta'); if (cta) cta.hidden = on;
  t.classList.toggle('on', on);
}
(() => {
  const t = document.getElementById('pf6PassTile'); if (!t) return;
  const card = t.querySelector('.pt-card');
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  let raf = 0, tx = 0, ty = 0;
  const apply = () => { raf = 0; card.style.setProperty('--rx', ty.toFixed(2) + 'deg'); card.style.setProperty('--ry', tx.toFixed(2) + 'deg'); card.style.setProperty('--gx', (50 + tx * 6).toFixed(1) + '%'); };
  const tilt = (x, y) => { if (reduce()) return; tx = Math.max(-6, Math.min(6, x)); ty = Math.max(-6, Math.min(6, y)); if (!raf) raf = requestAnimationFrame(apply); };
  t.addEventListener('pointermove', (e) => { const r = card.getBoundingClientRect(); tilt(((e.clientX - r.left) / r.width - .5) * 10, -((e.clientY - r.top) / r.height - .5) * 10); });
  const reset = () => tilt(0, 0);
  t.addEventListener('pointerleave', reset); t.addEventListener('pointercancel', reset); t.addEventListener('pointerup', reset);
  window.addEventListener('deviceorientation', (e) => { if (e.gamma == null || !t.offsetParent) return; tilt(e.gamma / 6, -((e.beta || 45) - 45) / 8); }, { passive: true });
  try { pf6PaintPassTile(currentUser()); } catch (_) {}
})();


/* ——— v280: «Вызов» · сезон города · номер пилота · воронка ——— */
const CHAL_DISCS_UI = ['0-100', '402m'];
const CHAL_KEY = 'pitlane-chal-v1';
function chalActive() { try { const c = JSON.parse(sessionStorage.getItem(CHAL_KEY) || 'null'); return c && /^c[a-z0-9]{8,24}$/.test(c.id) ? c : null; } catch (_) { return null; } }
function chalField(disc) { const c = chalActive(); return c && c.disc === disc ? { chal: c.id } : {}; }
function chalAfterRun(disc) { const c = chalActive(); if (!c || c.disc !== disc) return; setTimeout(() => { void openChalSheet(c.id, { after: true }); }, 1800); }
const chalSec = (t) => Number(t).toFixed(2).replace('.', ',') + ' с';
const chalDiscRu = (d) => ({ '0-100': '0–100 км/ч', '402m': '¼ мили', '100-200': '100–200 км/ч', '201m': '⅛ мили' }[d] || d);
function chalSheetEl() {
  let el = document.getElementById('chalSheet');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'chalSheet'; el.className = 'chal-sheet hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-chal-x]')) chalClose(); });
  document.body.appendChild(el);
  return el;
}
function chalClose() { const el = document.getElementById('chalSheet'); if (el) el.classList.add('hidden'); }
async function openChalSheet(id, { after = false } = {}) {
  const el = chalSheetEl();
  const box = padEl('div', 'chal-in');
  const x = padEl('button', 'chal-x pl-x', '×'); x.type = 'button'; x.dataset.chalX = '1'; x.setAttribute('aria-label', 'Закрыть');
  box.append(x, padEl('p', 'chal-k', 'ВЫЗОВ'), padEl('p', 'chal-msg', 'Загружаем…'));
  el.replaceChildren(box); el.classList.remove('hidden');
  const r = await api.chalGet(id).catch(() => null);
  const c = r && r.chal;
  box.replaceChildren(x, padEl('p', 'chal-k', 'ВЫЗОВ' + (c ? ' · ' + chalDiscRu(c.disc) : '')));
  if (!c) { box.appendChild(padEl('p', 'chal-msg', 'Вызов не найден или истёк.')); return; }
  const mine = isMyPilotId?.(c.from.pilotId);
  const line = (run, cls) => {
    const d = padEl('div', 'chal-row' + (cls ? ' ' + cls : ''));
    const n = padEl('span', 'chal-nick', run.nick || 'Пилот'); if (Number.isInteger(run.pn)) n.appendChild(padEl('b', 'pn-tag', '#' + run.pn));
    d.append(n, padEl('span', 'chal-car', [run.car, run.src === 'chip' ? 'чип' : 'телефон'].filter(Boolean).join(' · ')), padEl('strong', 'chal-t', chalSec(run.t)));
    return d;
  };
  box.appendChild(line(c.from, 'from'));
  if (c.runs.length) for (const rr of c.runs) box.appendChild(line(rr, rr.t < c.from.t ? 'win' : ''));
  else box.appendChild(padEl('p', 'chal-msg', mine ? 'Пока никто не ответил. Отправь ссылку друзьям.' : 'Ответов пока нет — будь первым.'));
  const left = Math.max(0, Math.ceil((c.until - Date.now()) / 86400000));
  box.appendChild(padEl('p', 'chal-note', `В зачёт — только проверенный сервером заезд · ещё ${left} дн.`));
  if (after) box.appendChild(padEl('p', 'chal-note', 'Твой заезд отправлен в вызов. Автор получит сообщение от бота.'));
  if (!mine) {
    const go = padEl('button', 'go-btn chal-go', 'Принять — к замеру'); go.type = 'button';
    go.addEventListener('click', () => { try { sessionStorage.setItem(CHAL_KEY, JSON.stringify({ id: c.id, disc: c.disc })); } catch (_) {} hap(10); chalClose(); goToView('run'); setRunText('runStatus', 'Вызов ' + chalDiscRu(c.disc) + ': цель ' + chalSec(c.from.t)); });
    box.appendChild(go);
  }
}
async function chalCreateAndShare(btn) {
  const p = _sharePayload; if (!p || !CHAL_DISCS_UI.includes(p.type)) return;
  if (!currentUser()) { btn.textContent = 'Вызов — после входа'; return; }
  btn.disabled = true; btn.textContent = 'Создаём…';
  const r = await api.chalCreate(p.type).catch(() => null);
  if (!r || r.ok === false || !r.chal) { btn.disabled = false; btn.textContent = r?.code === 'no_run' ? 'Вызов — после замера в топ' : 'Не получилось — сеть'; return; }
  const c = r.chal;
  const web = location.origin + location.pathname + '?ch=' + encodeURIComponent(c.id);
  const text = `Вызов PITLANE · ${chalDiscRu(c.disc)}: ${chalSec(c.from.t)}. Побьёшь?`;
  funnelEv('share');
  btn.disabled = false; btn.textContent = 'Вызов';
  if (isTMA) { await shareViaTelegram('ch_' + c.id, web, text); return; }
  try { if (navigator.share) { await navigator.share({ title: 'PITLANE', text, url: web }); return; } } catch (_) { return; }
  try { await navigator.clipboard.writeText(text + ' ' + web); btn.textContent = 'Ссылка скопирована'; } catch (_) {}
}
document.getElementById('shareCardChal')?.addEventListener('click', (e) => { hap(8); void chalCreateAndShare(e.currentTarget); });
try { const chq = new URLSearchParams(location.search).get('ch'); if (chq && /^c[a-z0-9]{8,24}$/.test(chq)) setTimeout(() => { void openChalSheet(chq); }, 1200); } catch (_) {}

/* Сезон города «<Город> · <Месяц>»: лучший пилота за месяц среди пилотов города. Новый месяц — с нуля. */
const SEASON_DISCS_UI = ['0-100', '100-200', '402m'];
let _citySzSeq = 0;
async function t72Season(sel, cls) {
  const box = document.getElementById('t72Season'); if (!box) return;
  const seq = ++_citySzSeq;
  const city = myCity();
  if (!sel || sel.kind === 'lap' || !SEASON_DISCS_UI.includes(sel.id) || !city || !isRemoteApi()) { box.hidden = true; box.replaceChildren(); return; }
  const r = await api.citySeason({ city, disc: sel.id, cls }).catch(() => null);
  if (seq !== _citySzSeq) return;
  if (!r || r.ok === false) { box.hidden = true; return; }
  box.replaceChildren();
  const head = padEl('div', 't72-sz-h');
  head.append(padEl('span', 't72-sz-k', 'СЕЗОН'), padEl('strong', 't72-sz-t', r.label));
  if (r.ends) head.appendChild(padEl('span', 't72-sz-e', 'до сброса ' + Math.max(1, Math.ceil((r.ends - Date.now()) / 86400000)) + ' дн.'));
  box.appendChild(head);
  if (!r.rows.length) box.appendChild(padEl('p', 't72-sz-n', 'В этом месяце в городе ещё нет зачтённых замеров. Победитель месяца получит знак чемпиона.'));
  r.rows.slice(0, 3).forEach((x, i) => {
    const row = padEl('div', 't72-sz-r');
    const n = padEl('span', 't72-sz-nm', (i + 1) + '. ' + (x.nick || 'Пилот')); pnSwTags(x, n);
    row.append(n, padEl('span', 't72-sz-v', chalSec(x.t)));
    box.appendChild(row);
  });
  box.hidden = false;
}

/* Номер пилота за Telegram Stars (навсегда). */
async function openPnumSheet() {
  const el = chalSheetEl();
  const box = padEl('div', 'chal-in');
  const x = padEl('button', 'chal-x pl-x', '×'); x.type = 'button'; x.dataset.chalX = '1'; x.setAttribute('aria-label', 'Закрыть');
  box.append(x, padEl('p', 'chal-k', 'НОМЕР ПИЛОТА'));
  el.replaceChildren(box); el.classList.remove('hidden');
  if (!currentUser()) { box.appendChild(padEl('p', 'chal-msg', 'Войди через Telegram, чтобы выбрать номер.')); return; }
  const me = await api.pnumMe().catch(() => null);
  if (!me || me.ok === false) { box.appendChild(padEl('p', 'chal-msg', 'Нет связи — попробуй позже.')); return; }
  if (me.number) box.appendChild(padEl('p', 'chal-big', '#' + me.number));
  box.appendChild(padEl('p', 'chal-msg', 'Номер 1–99 у ника в топах, вызовах и на карточке. Один номер — один пилот, навсегда.'));
  if (!me.sales) { box.appendChild(padEl('p', 'chal-note', 'Покупка скоро откроется.')); return; }
  const row = padEl('div', 'pn-buy');
  const inp = document.createElement('input'); inp.type = 'number'; inp.min = '1'; inp.max = '99'; inp.inputMode = 'numeric'; inp.placeholder = '7'; inp.className = 'pn-inp';
  const btn = padEl('button', 'go-btn', `Купить · ${me.stars} Stars`); btn.type = 'button';
  const msg = padEl('p', 'chal-note', '');
  row.append(inp, btn); box.append(row, msg);
  btn.addEventListener('click', async () => {
    const n = Number(inp.value);
    if (!(Number.isInteger(n) && n >= 1 && n <= 99)) { msg.textContent = 'Номер от 1 до 99'; return; }
    btn.disabled = true; msg.textContent = 'Проверяем…';
    const r = await api.pnumInvoice(n).catch(() => null);
    btn.disabled = false;
    if (!r || r.ok === false || !r.link) { msg.textContent = r?.code === 'taken' ? 'Номер #' + n + ' занят — выбери другой' : 'Оплата недоступна: ' + (r?.error || 'сеть'); return; }
    const TG = window.Telegram?.WebApp;
    if (TG && typeof TG.openInvoice === 'function') TG.openInvoice(r.link, (st) => { if (st === 'paid') { msg.textContent = 'Оплачено — номер #' + n + ' твой'; setTimeout(() => { void syncPnumRow(); }, 1500); } });
    else { window.open(r.link, '_blank', 'noopener'); msg.textContent = 'Счёт в Telegram — оплати и вернись.'; }
  });
}
async function syncPnumRow() {
  const v = document.getElementById('stPnumV'); if (!v || !currentUser() || !isRemoteApi()) return;
  const me = await api.pnumMe().catch(() => null);
  if (me && me.number) { v.textContent = '#' + me.number; try { localStorage.setItem('pitlane-pnum', String(me.number)); } catch (_) {} }
}
document.getElementById('stPnum')?.addEventListener('click', () => { hap(6); void openPnumSheet(); });
setTimeout(() => { void syncPnumRow(); }, 2500);

/* Воронка: только дневные счётчики (open раз в день, car и run — раз на устройство), без id. */
function funnelEv(e, mode) {
  try {
    const k = 'pitlane-ev-' + e;
    const today = new Date().toISOString().slice(0, 10);
    if (mode === 'day' && localStorage.getItem(k) === today) return;
    if (mode === 'once' && localStorage.getItem(k)) return;
    if (mode) localStorage.setItem(k, mode === 'day' ? today : '1');
    if (isRemoteApi()) api.ev(e);
  } catch (_) {}
}
funnelEv('open', 'day');
if (pickedCar()) funnelEv('car', 'once');
window.addEventListener('pl-car', () => { if (pickedCar()) funnelEv('car', 'once'); });

/* v282: Трек — «Чем мерить»: сегмент Телефон/Чип (состояние — из реального источника) */
(() => {
  const seg = document.getElementById('t282Seg'); if (!seg) return;
  const bar = document.getElementById('extGpsBar');
  const sync = () => {
    const t = (bar?.textContent || '').toLowerCase();
    const on = /pitlane|чип|wi-fi|внешн|ble/.test(t) && !/телефон/.test(t) ? 'chip' : 'phone';
    seg.dataset.on = on;
    seg.querySelectorAll('[data-seg]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.seg === on)));
  };
  sync();
  if (bar) new MutationObserver(sync).observe(bar, { childList: true, characterData: true, subtree: true });
  seg.addEventListener('click', (e) => {
    const b = e.target?.closest?.('[data-seg]'); if (!b) return;
    hap(6);
    if (b.dataset.seg === 'phone') { if (seg.dataset.on !== 'phone') document.querySelector('#extGpsCard [data-gps-src="phone"]')?.click(); return; }
    seg.dataset.on = 'chip'; // пузырь едет сразу; если чип не подключат — sync вернёт на «Телефон»
    document.getElementById('t61Gps')?.click();
    setTimeout(sync, 200);
  });
  document.getElementById('gps61')?.addEventListener('click', () => setTimeout(sync, 300));
})();

function t282Ind(box, el) {
  if (!box) return;
  let ind = box.querySelector(':scope > .t72-ind');
  if (!ind) { ind = document.createElement('i'); ind.className = 't72-ind'; ind.setAttribute('aria-hidden', 'true'); box.prepend(ind); }
  if (!el || el.offsetParent === null) { ind.style.opacity = '0'; return; }
  const place = () => { ind.style.width = el.offsetWidth + 'px'; ind.style.height = el.offsetHeight + 'px'; ind.style.top = el.offsetTop + 'px'; ind.style.transform = `translateX(${el.offsetLeft}px)`; ind.style.opacity = '1'; };
  if (!ind.dataset.ready) { ind.style.transition = 'none'; place(); void ind.offsetWidth; ind.style.transition = ''; ind.dataset.ready = '1'; } else place();
}

/* ——— v282: круглая печать PITLANE (данные — только из записи сервера; код открывает проверку) ——— */
let _shareStamp = null;
const stampCode = (c) => 'PL-' + c.slice(0, 4) + '-' + c.slice(4);
const stampEsc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const stampDate = (at) => { try { return new Date(at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (_) { return ''; } };
const stampSrc = (s) => (s.src === 'chip' ? 'PITLANE GPS' : 'GPS ТЕЛЕФОНА') + ' · ЗАЧЁТ ' + s.cls;
function stampSvg(s, uid = 'a') {
  const car = String(s.car || '').slice(0, 22);
  return `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Печать PITLANE ${stampEsc(stampCode(s.code))}"><g transform="translate(300 300) rotate(-8)" fill="none" stroke="#e8e8e8" font-family="Sofia Sans Condensed,Golos Text,Arial,sans-serif" text-anchor="middle">
<circle r="230" stroke-width="6"/><circle r="205" stroke-width="2"/><circle r="120" stroke-width="2"/>
<defs><path id="sT${uid}" d="M -170 0 A 170 170 0 0 1 170 0"/><path id="sB${uid}" d="M -185 0 A 185 185 0 0 0 185 0"/></defs>
<text fill="#e8e8e8" stroke="none" font-size="28" font-weight="800" letter-spacing="5"><textPath href="#sT${uid}" startOffset="50%">PITLANE · ПРОВЕРЕНО</textPath></text>
<text fill="#bdbdbd" stroke="none" font-size="22" letter-spacing="3"><textPath href="#sB${uid}" startOffset="50%">${stampEsc(stampSrc(s))}</textPath></text>
<text y="-30" fill="#fff" stroke="none" font-size="30" font-weight="800">${stampEsc(chalDiscRu(s.disc) + ' · ' + chalSec(s.t))}</text>
${car ? `<text y="10" fill="#d0d0d0" stroke="none" font-size="22">${stampEsc(car)}</text>` : ''}
<text y="${car ? 45 : 20}" fill="#d0d0d0" stroke="none" font-size="22">${stampEsc(stampDate(s.at))}</text>
<text y="85" fill="#fff" stroke="none" font-size="20" font-weight="700" letter-spacing="2">${stampEsc(stampCode(s.code))}</text></g></svg>`;
}
async function shareStampSync(payload) {
  const el = document.getElementById('shareStamp'); if (!el) return;
  el.hidden = true; el.replaceChildren(); _shareStamp = null;
  const isLap = payload.type === 'lap' || payload.type === 'круг' || payload.kind === 'lap';
  const t = parseFloat(String(payload.time || '').replace(',', '.'));
  if (!_shareOwn || isLap || payload.ghost || payload.src === 'sim' || payload.valid === false || !(t > 0) || !currentUser() || !isRemoteApi()) return;
  const r = await api.stampMake(payload.type, t).catch(() => null);
  if (_sharePayload !== payload || !r || !r.stamp) return; // нет записи на сервере — печати нет
  _shareStamp = r.stamp;
  el.innerHTML = stampSvg(r.stamp, 'c');
  el.hidden = false;
}
document.getElementById('shareStamp')?.addEventListener('click', () => { if (_shareStamp) { hap(6); void openStampSheet(_shareStamp.code); } });
async function openStampSheet(code) {
  const el = chalSheetEl();
  const box = padEl('div', 'chal-in');
  const x = padEl('button', 'chal-x pl-x', '×'); x.type = 'button'; x.dataset.chalX = '1'; x.setAttribute('aria-label', 'Закрыть');
  box.append(x, padEl('p', 'chal-k', 'ПРОВЕРКА ПЕЧАТИ'), padEl('p', 'chal-msg', 'Ищем запись…'));
  el.replaceChildren(box); el.classList.remove('hidden');
  const r = await api.stampGet(code).catch(() => null);
  const s = r && r.stamp;
  box.replaceChildren(x, padEl('p', 'chal-k', 'ПРОВЕРКА ПЕЧАТИ · ' + stampCode(String(code).toUpperCase())));
  if (!s) { box.appendChild(padEl('p', 'chal-msg', 'Кода нет на сервере PITLANE — печать не подтверждена.')); return; }
  const fig = padEl('div', 'stamp-fig'); fig.innerHTML = stampSvg(s, 'v'); box.appendChild(fig);
  box.appendChild(padEl('p', 'chal-msg stamp-ok', 'Запись есть на сервере PITLANE: замер прошёл серверную проверку.'));
  const dl = padEl('dl', 'stamp-dl');
  for (const [k, v] of [['Результат', chalDiscRu(s.disc) + ' · ' + chalSec(s.t)], ['Пилот', (s.nick || 'Пилот') + (Number.isInteger(s.pn) ? ' #' + s.pn : '')], ['Машина', s.car], ['Чем мерили', s.src === 'chip' ? 'Чип PITLANE GPS' : 'GPS телефона'], ['Зачёт', s.cls], ['Дата', stampDate(s.at)]]) {
    if (!v) continue; dl.append(padEl('dt', '', k), padEl('dd', '', v));
  }
  box.appendChild(dl);
  const web = location.origin + location.pathname + '?st=' + s.code;
  const cp = padEl('button', 'go-btn', 'Ссылка на проверку'); cp.type = 'button';
  cp.addEventListener('click', async () => { hap(6); if (isTMA) { await shareViaTelegram('st_' + s.code, web, 'Печать PITLANE ' + stampCode(s.code)); return; } try { await navigator.clipboard.writeText(web); cp.textContent = 'Ссылка скопирована'; } catch (_) {} });
  box.appendChild(cp);
}
try { const stq = new URLSearchParams(location.search).get('st'); if (stq && /^[2-9A-HJ-NP-Za-hj-np-z]{8}$/.test(stq)) setTimeout(() => { void openStampSheet(stq.toUpperCase()); }, 1200); } catch (_) {}

/* ——— v287: страница результата «чек» — одна карточка на экран; скриншот = полный чек. Только данные движка/сервера. ——— */
const RC_ORDER = ['0-50', '0-60', '0-100', '80-120', '0-200', '100-200', '0-300', '200-300', '60ft', '201m', '402m'];
const RC_MARKS = [['0-100', '100'], ['201m', '⅛'], ['0-200', '200'], ['402m', '¼']];
let _rc = null;
function rcFromRun(S, tp, el, pts) {
  const M = S?.marks || {}; const isPh = tp.src === 'phone';
  const splits = [];
  for (const k of RC_ORDER) {
    const m = M[k]; if (!m || !(m.sec > 0)) continue;
    if (isPh && PHONE_NO_DISCS.includes(k)) continue;
    const d = (k.startsWith('0-') || RM_DIST.includes(k)) && Number.isFinite(m.d) ? Math.round(m.d) : null;
    splits.push({ k, sec: Number(m.sec.toFixed(2)), v: Math.round(m.v || 0), d });
  }
  let sv = null;
  if (tp.src === 'ext') { const a = (pts || []).map((p) => p.sv).filter((x) => Number.isFinite(x) && x > 0).sort((x, y) => x - y); if (a.length) sv = a[a.length >> 1]; }
  const mc = myCarLocal(); const cc = currentCar();
  let curve = null; try { curve = shareCurve(pts, S); } catch (_) {}
  return {
    at: Date.now(), car: pickedCar()?.name || cc?.name || '', tyre: mc?.tyre || '', cls: mc && PREP_LABEL[mc.prep] ? classLine(mc) : '',
    splits, vmax: S?.vmax > 0 ? Math.round(S.vmax) : null, dist: S?.t0 != null && S.dist > 0 ? Math.round(S.dist) : null, curve,
    gps: { src: tp.src, hz: Number.isFinite(tp.hz) ? tp.hz : null, acc: Number.isFinite(tp.avgAcc) ? tp.avgAcc : null, sv, slope: el && Number.isFinite(el.slope) ? Number(el.slope.toFixed(1)) : null, q: tp.gpsQ },
    wx: null, ver: false, stamp: null,
  };
}
function rcGpsBits(rc) {
  const g = rc.gps || {}; const b = [];
  b.push(g.src === 'ext' ? 'PITLANE GPS' : g.src === 'sim' ? 'симулятор' : g.src === 'phone' ? 'GPS телефона' : 'GPS');
  if (g.hz > 0) b.push(`${Number(g.hz).toFixed(g.hz >= 10 ? 0 : 1)} Гц`);
  if (g.acc > 0) b.push(`±${Number(g.acc).toFixed(1)} м`);
  if (g.src === 'ext' && g.sv > 0) b.push(`${g.sv} спутн.`);
  if (g.slope != null) b.push(`уклон ${g.slope > 0 ? '+' : g.slope < 0 ? '−' : ''}${Math.abs(g.slope).toFixed(1)}%`);
  const w = cleanWx(rc.wx);
  if (w?.t != null) b.push(wxTemp(w.t));
  if (w) { const wd = wxWind(w); if (wd) b.push(wd); }
  return b;
}
const rcDate = (at) => { try { return new Date(at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·') + ' МСК'; } catch (_) { return ''; } };
function rcChartSvg(rc, w, h) {
  const c = rc.curve; if (!c || !Array.isArray(c.v) || c.v.length < 2 || !(c.s > 0)) return '';
  const vm = Math.max(60, ...c.v) * 1.08; const T = c.s;
  const y = (v) => (h - 3 - (h - 8) * v / vm).toFixed(1); const x = (t) => (w * t / T).toFixed(1);
  let g = '';
  for (const lv of [100, 200, 300]) if (lv < vm) g += `<line x1="0" x2="${w}" y1="${y(lv)}" y2="${y(lv)}" stroke="#1c1c1e"/><text x="2" y="${y(lv) - 3}" fill="#555" font-size="8">${lv}</text>`;
  for (const [k, l] of RC_MARKS) { const s = rc.splits.find((z) => z.k === k); if (s && s.sec <= T) g += `<line x1="${x(s.sec)}" x2="${x(s.sec)}" y1="0" y2="${h}" stroke="#333" stroke-dasharray="2 3"/><text x="${Number(x(s.sec)) + 3}" y="9" fill="#666" font-size="8">${l}</text>`; }
  const pts = c.v.map((v, i) => `${x(T * i / (c.v.length - 1))},${y(v)}`).join(' ');
  return `<svg class="rc-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="var(--font-num)">${g}<polyline fill="none" stroke="#fff" stroke-width="1.6" points="${pts}"/></svg>`;
}
const rcNum = (sec) => { const [a, b] = Number(sec).toFixed(2).split('.'); return `${a}<span class="rc-dd">.${b}</span>`; };
function rcTrustText(rc) {
  if (rc.stamp) return '✓ проверено сервером по сырому треку';
  if (rc.ver) return '✓ в топе · проверено сервером';
  if (rc.gps?.src === 'sim') return 'симулятор · не в топ';
  if (rc.gps?.src === 'phone') return 'телефон · справочно ≈';
  return rc.pending ? 'проверяем на сервере…' : 'справочно · не проверено сервером';
}
function rcRender() {
  const rc = _rc; const host = document.getElementById('rcView'); if (!rc || !host) return;
  const card = host.querySelector('.rc-card');
  const rows = rc.splits.map((s) => `<div class="rc-row"><span class="rc-l">${stampEsc(RM_LABEL[s.k] || s.k)}</span><span class="rc-t">${rcNum(s.sec)}</span><span class="rc-v">${s.v || ''}</span><span class="rc-m">${s.d != null ? s.d : ''}</span></div>`).join('');
  const sub = [rc.tyre, rc.cls].filter(Boolean).join(' · ');
  card.innerHTML = (rc.demo ? '<span class="rc-demo">ПРИМЕР</span>' : '') + `<div class="rc-head"><b>PITLANE</b><span>${stampEsc(rcDate(rc.at))}</span></div>
<div class="rc-car">${brandLogoKey(rc.car) ? `<i class="rc-logo" style="--logo:url('./img/brands/${brandLogoKey(rc.car)}.svg')" aria-hidden="true"></i>` : ''}<span>${stampEsc(rc.car || 'Машина не выбрана')}</span></div>${sub ? `<div class="rc-sub">${stampEsc(sub)}</div>` : ''}
${rows ? `<div class="rc-row rc-cap"><span>Отрезок</span><span>Время, с</span><span>км/ч</span><span>м</span></div>${rows}` : '<p class="rc-empty">До 60 км/ч не дошло — отрезков нет</p>'}
<div class="rc-tot">${rc.vmax ? `<span>VMAX <b>${rc.vmax}</b> км/ч</span>` : '<span></span>'}${rc.dist ? `<span>ДИСТАНЦИЯ <b>${rc.dist}</b> м</span>` : ''}</div>
${rcChartSvg(rc, 326, 74)}
<div class="rc-gps">${rcGpsBits(rc).map((b) => `<span>${stampEsc(b)}</span>`).join('')}</div>
<div class="rc-foot">${rc.stamp ? `<div class="rc-stamp">${stampSvg(rc.stamp, 'rc')}</div><div><div class="rc-code">${stampEsc(stampCode(rc.stamp.code))}</div><div class="rc-tr ok">${rcTrustText(rc)}</div></div>` : `<div class="rc-tr${rc.ver ? ' ok' : ''}">${stampEsc(rcTrustText(rc))}</div>`}</div>`;
  host.querySelector('[data-rc="duel"]').hidden = !(rc === run.rc && run.pendingShare);
  rcFit();
}
function rcFit() {
  const host = document.getElementById('rcView'); const card = host?.querySelector('.rc-card'); if (!card || host.classList.contains('hidden')) return;
  card.style.transform = 'none';
  const bar = host.querySelector('.rc-bar').offsetHeight || 74;
  const top = Math.max(8, Number(getComputedStyle(document.documentElement).getPropertyValue('--tg-safe-top').replace('px', '')) || 0);
  const avW = host.clientWidth - 16; const avH = host.clientHeight - bar - top - 12;
  const k = Math.min(1, avW / card.offsetWidth, avH / card.offsetHeight);
  card.style.transform = `scale(${k.toFixed(3)})`; card.style.marginTop = top + 'px';
  host.querySelector('.rc-wrap').style.height = Math.ceil(card.offsetHeight * k + top) + 'px';
}
function rcEnsure() {
  let host = document.getElementById('rcView'); if (host) return host;
  host = document.createElement('div'); host.id = 'rcView'; host.className = 'rc-view hidden';
  host.innerHTML = `<div class="rc-wrap"><div class="rc-card"></div></div><div class="rc-bar"><button type="button" class="rc-x" data-rc="x" aria-label="Закрыть">×</button><button type="button" class="rc-b pri" data-rc="share">Поделиться</button><button type="button" class="rc-b" data-rc="duel">Вызов</button><button type="button" class="rc-b" data-rc="tops">В топ</button></div>`;
  document.body.appendChild(host);
  host.addEventListener('click', (e) => {
    const a = e.target?.closest?.('[data-rc]')?.dataset.rc; if (!a) { if (e.target?.closest?.('.rc-stamp') && _rc?.stamp) void openStampSheet(_rc.stamp.code); return; }
    hap(6);
    if (a === 'x') rcClose();
    else if (a === 'share') void rcShare();
    else if (a === 'duel' && run.pendingShare) { rcClose(); openShareCard(run.pendingShare); setTimeout(() => { try { document.getElementById('shareCardDuel')?.click(); } catch (_) {} }, 60); }
    else if (a === 'tops') { rcClose(); try { if (run.summary) { stopRun(); closeRunDrive(); wifiSummaryReset(); } } catch (_) {} goToView('tops'); }
  });
  addEventListener('resize', rcFit);
  return host;
}
function rcOpen(rc) {
  if (!rc) return;
  _rc = rc; const host = rcEnsure();
  host.classList.remove('hidden'); document.body.classList.add('rc-on');
  rcRender();
}
function rcClose() { document.getElementById('rcView')?.classList.add('hidden'); document.body.classList.remove('rc-on'); }
/** После вердикта сервера: зачёт и печать (печать есть, только если сервер её выдал — иначе 409/null и печати нет). */
async function rcVerdict() {
  const rc = run.rc; if (!rc) return;
  rc.pending = false;
  rc.ver = /в топе · проверено|в зачёте C · телефон/.test(run.topMsg || '');
  try { const w = cleanWx((state.meas[state.carId] || {}).wx); if (w && rc.splits.length) rc.wx = w; } catch (_) {}
  if (_rc === rc) rcRender();
  const s0100 = rc.splits.find((s) => s.k === '0-100');
  if (rc.ver && s0100 && rc.gps.src !== 'sim' && currentUser() && isRemoteApi() && !rc.stamp) {
    const r = await api.stampMake('0-100', s0100.sec).catch(() => null);
    if (r && r.stamp) { rc.stamp = r.stamp; save(); if (_rc === rc) rcRender(); }
  }
}
function rcFromSlip(sl) {
  if (sl.rc) return sl.rc;
  const splits = [];
  if (Number(sl.v0100) > 0) splits.push({ k: '0-100', sec: Number(sl.v0100), v: null, d: null });
  if (Number(sl.v100200) > 0) splits.push({ k: '100-200', sec: Number(sl.v100200), v: null, d: null });
  return { at: sl.at, car: sl.car, tyre: '', cls: '', splits, vmax: null, dist: null, curve: null, gps: {}, wx: null, ver: false, stamp: null, old: true };
}
/** Картинка для «Поделиться» — та же раскладка, что на экране (координат нет). */
async function rcCanvas(rc) {
  const W = 390; const P = 18; const RH = 30;
  const H = 96 + (rc.tyre || rc.cls ? 16 : 0) + 24 + rc.splits.length * RH + 34 + (rc.curve ? 84 : 0) + 40 + (rc.stamp ? 100 : 30) + 20;
  const k = 3; const c = document.createElement('canvas'); c.width = W * k; c.height = H * k;
  const x = c.getContext('2d'); x.scale(k, k);
  try { await document.fonts?.ready; } catch (_) {}
  const UI = (w, s) => `${w} ${s}px "Golos Text", "PL Sans", -apple-system, Arial, sans-serif`; const NU = (w, s) => `${w} ${s}px "IBM Plex Mono", "PL Num", -apple-system, Arial, sans-serif`;
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.045)'; x.strokeStyle = 'rgba(255,255,255,.09)'; x.beginPath(); x.roundRect?.(6, 6, W - 12, H - 12, 22); x.fill(); x.stroke();
  let y = 36; x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff'; x.font = UI(800, 15); x.letterSpacing = '5px'; x.fillText('PITLANE', P + 6, y); x.letterSpacing = '0px';
  x.fillStyle = '#8e8e93'; x.font = NU(400, 11); x.textAlign = 'right'; x.fillText(rcDate(rc.at), W - P - 6, y); x.textAlign = 'left';
  y += 30; let carX = P + 6;
  const lk = brandLogoKey(rc.car);
  if (lk) { try { const li = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = './img/brands/' + lk + '.svg'; });
    if (li && li.naturalWidth) { const LH = 22; const LW = Math.min(44, LH * li.naturalWidth / li.naturalHeight); const oc = document.createElement('canvas'); oc.width = LW * k; oc.height = LH * k; const o = oc.getContext('2d');
      o.drawImage(li, 0, 0, oc.width, oc.height); o.globalCompositeOperation = 'source-in'; o.fillStyle = '#f2efe9'; o.fillRect(0, 0, oc.width, oc.height);
      x.drawImage(oc, carX, y - 18, LW, LH); carX += LW + 9; } } catch (_) {} }
  x.fillStyle = '#fff'; x.font = UI(600, 19); x.fillText(String(rc.car || 'Машина не выбрана').slice(0, 30), carX, y);
  const sub = [rc.tyre, rc.cls].filter(Boolean).join(' · ');
  if (sub) { y += 18; x.fillStyle = '#8e8e93'; x.font = UI(400, 12); x.fillText(sub.slice(0, 56), P + 6, y); }
  const cx = [P + 6, W - P - 112, W - P - 54, W - P - 6];
  y += 28; x.font = UI(500, 9.5); x.fillStyle = '#8e8e93'; x.fillText('ОТРЕЗОК', cx[0], y); x.textAlign = 'right'; x.fillText('ВРЕМЯ, С', cx[1], y); x.fillText('КМ/Ч', cx[2], y); x.fillText('М', cx[3], y); x.textAlign = 'left';
  for (const s of rc.splits) {
    x.fillStyle = '#1c1c1e'; x.fillRect(P + 6, y + 8, W - 2 * P - 12, 1); y += RH;
    x.fillStyle = '#d1d1d6'; x.font = UI(400, 13.5); x.fillText(RM_LABEL[s.k] || s.k, cx[0], y);
    const [a, b] = s.sec.toFixed(2).split('.'); x.font = NU(600, 22); x.textAlign = 'right'; x.fillStyle = '#8e8e93'; x.fillText('.' + b, cx[1], y); const wb = x.measureText('.' + b).width; x.fillStyle = '#fff'; x.fillText(a, cx[1] - wb - 1, y);
    x.font = NU(400, 12); x.fillStyle = '#c7c7cc'; if (s.v) x.fillText(String(s.v), cx[2], y); x.fillStyle = '#8e8e93'; x.font = NU(400, 11); if (s.d != null) x.fillText(String(s.d), cx[3], y); x.textAlign = 'left';
  }
  x.fillStyle = '#1c1c1e'; x.fillRect(P + 6, y + 10, W - 2 * P - 12, 1); y += 30;
  x.font = NU(400, 11); x.fillStyle = '#8e8e93';
  if (rc.vmax) { x.fillText('VMAX ', cx[0], y); const w0 = x.measureText('VMAX ').width; x.fillStyle = '#fff'; x.font = NU(600, 14); x.fillText(String(rc.vmax), cx[0] + w0, y); const w1 = x.measureText(String(rc.vmax)).width; x.fillStyle = '#8e8e93'; x.font = NU(400, 11); x.fillText(' км/ч', cx[0] + w0 + w1, y); }
  if (rc.dist) { x.textAlign = 'right'; x.fillText(' м', cx[3], y); const w2 = x.measureText(' м').width; x.fillStyle = '#fff'; x.font = NU(600, 14); x.fillText(String(rc.dist), cx[3] - w2, y); const w3 = x.measureText(String(rc.dist)).width; x.fillStyle = '#8e8e93'; x.font = NU(400, 11); x.fillText('ДИСТАНЦИЯ ', cx[3] - w2 - w3, y); x.textAlign = 'left'; }
  const img = (svg) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  if (rc.curve) { const svg = rcChartSvg(rc, 326, 74).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('var(--font-num)', 'Arial'); const im = await img(svg); if (im) x.drawImage(im, P + 6, y + 10, 342, 74); y += 84; }
  y += 22; x.font = NU(400, 10); x.fillStyle = '#c7c7cc';
  let lx = cx[0];
  for (const b of rcGpsBits(rc)) { const w = x.measureText(b).width; if (lx + w > W - P - 6) { lx = cx[0]; y += 14; } x.fillText(b, lx, y); lx += w + 10; }
  y += 14;
  if (rc.stamp) {
    const im = await img(stampSvg(rc.stamp, 'rx')); if (im) x.drawImage(im, P + 2, y, 90, 90);
    x.fillStyle = '#fff'; x.font = NU(600, 15); x.letterSpacing = '1.5px'; x.fillText(stampCode(rc.stamp.code), P + 106, y + 44); x.letterSpacing = '0px';
    x.fillStyle = '#8e8e93'; x.font = UI(400, 10); x.fillText(rcTrustText(rc), P + 106, y + 60);
  } else { y += 10; x.fillStyle = '#8e8e93'; x.font = UI(400, 10.5); x.fillText(rcTrustText(rc), cx[0], y); }
  return c;
}
async function rcShare() {
  if (!_rc) return;
  try {
    const cv = await rcCanvas(_rc);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const file = new File([blob], 'pitlane-result.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'PITLANE' }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pitlane-result.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (err) { if (err?.name !== 'AbortError') console.warn('rc share', err); }
}
window.__rc287 = { open: rcOpen, close: rcClose, canvas: rcCanvas, cur: () => _rc }; // QA/скриншоты

/* v289: один понятный призыв на пустом профиле — «Сделай первый замер» */
async function pfCta289() {
  const box = document.getElementById('pfCta'); if (!box) return;
  try { _jnMod = _jnMod || await import('./journal.js'); const es = _jnMod.buildEntries(jnDeps61(), []); box.hidden = es.some((e) => e.kind === 'run' || e.kind === 'lap'); } catch (_) { box.hidden = true; }
}
document.addEventListener('click', (e) => { const b = e.target?.closest?.('[data-cta-go]'); if (b) { try { hap(8); } catch (_) {} goToView(b.dataset.ctaGo); } });

/* ——— v302: Доработки — отдельный экран: категории, популярные чипы (мультивыбор), «+ Своё». Хранится локально по машине ——— */
const MODS302_KEY = 'pitlane-mods-v302';
const MODS302 = [
  ['Выхлоп', ['Akrapovič', 'Eisenmann', 'Milltek', 'Armytrix', 'iPE', 'Даунпайп', 'Катбэк', 'Удаление катализаторов']],
  ['Прошивка', ['Stage 1', 'Stage 2', 'Stage 2+', 'Stage 3']],
  ['Турбины', ['Апгрейд турбин', 'Гибридные турбины', 'Большие турбины']],
  ['Впуск / интеркулер', ['Впуск', 'Интеркулер']],
  ['Топливо', ['E85', 'ТНВД', 'Форсунки']],
  ['КПП', ['Прошивка КПП', 'Сцепление']],
  ['Подвеска', ['Койловеры KW', 'Койловеры Bilstein', 'Койловеры H&R', 'Пружины', 'Пневма']],
  ['Тормоза', ['Brembo', 'Керамика']],
  ['Диски / шины', ['Кованые диски', 'Полуслик', 'Широкие шины']],
  ['Аэро / кузов', ['Сплиттер', 'Антикрыло', 'Диффузор', 'Карбон']],
  ['Облегчение', ['Ковши', 'Карбоновый капот', 'Литий АКБ']],
];
function mods302Key(mc) { return String(mc?.carId || mc?.model || '').slice(0, 80); }
function mods302All() { try { const o = JSON.parse(localStorage.getItem(MODS302_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } }
function mods302Get(k) { let v = mods302All()[k]; if (!Array.isArray(v)) { const mc = myCarLocal(); if (mc && Array.isArray(mc.mods) && mods302Key(mc) === k) v = mc.mods; } // v305: доработки с сервера (профиль)
   return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 40) : []; }
function mods302Set(k, list) { try { const o = mods302All(); if (list.length) o[k] = list.slice(0, 16); else o[k] = []; localStorage.setItem(MODS302_KEY, JSON.stringify(o)); } catch (_) {} void mods302Sync(k, list.slice(0, 16)); }
/* v305: доработки → профиль на сервере (видят другие пилоты) */
async function mods302Sync(k, list) {
  try {
    const mc = myCarLocal(); if (!mc || mods302Key(mc) !== k || !currentUser() || !isRemoteApi() || !mc.tyre) return;
    const pass = {}; for (const f of ['prep', 'tyreT', 'hp', 'kg', 'bar']) if (mc[f] != null && mc[f] !== '') pass[f] = mc[f];
    const r = await api.putMyCar({ model: mc.model, tyre: mc.tyre, carId: mc.carId || undefined, ...pass, mods: list });
    if (r && r.ok !== false && r.car) { try { localStorage.setItem('pitlane-mycar-v1', JSON.stringify({ ...mc, ...r.car })); } catch (_) {} }
  } catch (_) {}
}
function openMods302() {
  const mc = myCarLocal(); if (!mc) { try { openCarDbPicker(); } catch (_) {} return; }
  const key = mods302Key(mc); const sel = new Set(mods302Get(key));
  const custom = {}; // своё по категориям (то, чего нет в списке)
  const known = new Set(MODS302.flatMap((c) => c[1]));
  for (const t of sel) if (!known.has(t)) (custom['Своё'] = custom['Своё'] || []).push(t);
  document.getElementById('mods302')?.remove();
  const root = document.createElement('div'); root.id = 'mods302'; root.className = 'm302'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Доработки');
  const cats = MODS302.map(([n, l]) => [n, l.concat((custom[n] || []))]);
  if (custom['Своё']) cats.push(['Своё', custom['Своё']]);
  let tab = 'Все';
  const draw = () => {
    const cnt = (l) => l.filter((t) => sel.has(t)).length;
    const tabs = [['Все', [...sel]]].concat(cats);
    root.innerHTML = `<div class="m302-top"><button type="button" class="m302-back">‹ Назад</button><button type="button" class="m302-reset">Сбросить</button></div>
      <div class="m302-h"><b>Доработки</b><span>${esc(String(mc.model || '').replace(/\s*\([^)]*\)\s*$/, ''))} — выберите всё, что стоит</span></div>
      <div class="m302-tabs">${tabs.map(([n, l]) => { const c = n === 'Все' ? sel.size : cnt(l); return `<button type="button" class="${n === tab ? 'on' : ''}" data-tab="${esc(n)}">${esc(n)}${c ? `<em>${c}</em>` : ''}</button>`; }).join('')}</div>
      <div class="m302-body">${cats.filter(([n]) => tab === 'Все' || tab === n).map(([n, l]) => `<section><h4>${esc(n)}<small>${cnt(l) || ''}</small></h4><div class="m302-cg">${l.map((t) => `<button type="button" class="${sel.has(t) ? 'on' : ''}" data-mod="${esc(t)}">${sel.has(t) ? '✓ ' : ''}${esc(t)}</button>`).join('')}<button type="button" class="add" data-add="${esc(n)}">+ Своё</button></div></section>`).join('')}<div style="height:110px"></div></div>
      <div class="m302-foot"><button type="button" class="m302-done">Готово${sel.size ? ' · ' + sel.size : ''}</button></div>`;
  };
  const close = (save) => { if (save) { mods302Set(key, [...sel]); try { void renderAwards92(); } catch (_) {} } root.remove(); };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.classList.contains('m302-back')) return close(false);
    if (t.classList.contains('m302-done')) { try { hap(10); } catch (_) {} return close(true); }
    if (t.classList.contains('m302-reset')) { sel.clear(); draw(); return; }
    if (t.dataset.tab) { tab = t.dataset.tab; draw(); root.querySelector('.m302-body').scrollTop = 0; return; }
    if (t.dataset.mod) { const v = t.dataset.mod; if (sel.has(v)) sel.delete(v); else sel.add(v); try { hap(6); } catch (_) {} const y = root.querySelector('.m302-body').scrollTop; draw(); root.querySelector('.m302-body').scrollTop = y; return; }
    if (t.dataset.add) { const v = String(prompt('Своя доработка') || '').replace(/[<>]/g, '').trim().slice(0, 32); if (!v) return; const c = cats.find((x) => x[0] === t.dataset.add); if (c && !c[1].includes(v)) c[1].push(v); sel.add(v); const y = root.querySelector('.m302-body').scrollTop; draw(); root.querySelector('.m302-body').scrollTop = y; }
  });
  draw(); document.body.appendChild(root);
}
window.__openMods302 = openMods302;
document.addEventListener('click', (e) => {
  if (e.target.closest?.('#btnMods302')) { openMods302(); return; }
  const c = e.target.closest?.('.cw291.tap302'); if (c) { try { hap(10); } catch (_) {} try { openCarDbPicker(); } catch (_) {} }
});
window.addEventListener('pl-car', () => { try { void renderAwards92(); } catch (_) {} });
