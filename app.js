import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { api } from './api.js';

function hap(ms = 12) {
  try { navigator.vibrate?.(ms); } catch (_) {}
}
document.addEventListener('click', (e) => {
  if (e.target.closest('button')) hap(10);
}, true);
if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
  document.documentElement.classList.add('standalone');
}

const CARS = [
  { id: 'gt3rs', name: 'Porsche 911 GT3 RS', cls: 'GT · RWD · 4.0 NA', year: 2023, trim: '992 GT3 RS', side: './img/sil/gt-wing.svg', color: 0xeeeeee, accent: 0x111, v0100: 3.2, v100200: 10.6, v200300: null, v80120: 2.0, hp: 525, nm: 465, kg: 1450, lap: { track: 'nurb-nord', time: '6:49.33' } },
  { id: 'm3', name: 'BMW M3 Competition', cls: 'GT · RWD · 3.0 twin-turbo', year: 2023, trim: 'G80 Competition', side: './img/sil/sedan.svg', color: 0x8a1f1a, accent: 0x111, v0100: 3.5, v100200: 8.1, v200300: null, v80120: 2.1, hp: 510, nm: 650, kg: 1730, lap: { track: 'nurb-nord', time: '8:12.40' } },
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
  { id: 'cayman', name: 'Porsche 718 Cayman GT4 RS', cls: 'GT · RWD · 4.0 NA', year: 2022, trim: 'GT4 RS', side: './img/sil/gt-wing.svg', color: 0x2ee56a, accent: 0x111, v0100: 3.4, v100200: 10.6, v200300: null, v80120: 2.1, hp: 500, nm: 450, kg: 1415, lap: { track: 'nurb-nord', time: '7:09.00' } },
  { id: 'turboS', name: 'Porsche 911 Turbo S', cls: 'GT · AWD · 3.8 twin-turbo', year: 2023, trim: '992 Turbo S', side: './img/sil/gt-coupe.svg', color: 0x111111, accent: 0x111, v0100: 2.6, v100200: 7.4, v200300: 18.8, v80120: 1.6, hp: 650, nm: 800, kg: 1640, lap: { track: 'nurb-nord', time: '7:12.00' } },
  { id: 'supra', name: 'Toyota GR Supra', cls: 'GT · RWD · 3.0 turbo', year: 2023, trim: 'A90 3.0', side: './img/sil/coupe.svg', color: 0xc41e3a, accent: 0x111, v0100: 4.1, v100200: 11.0, v200300: null, v80120: 2.6, hp: 387, nm: 500, kg: 1520, lap: { track: 'nurb-nord', time: '7:52.00' } },
  { id: 'golf', name: 'Volkswagen Golf R', cls: 'Hot hatch · AWD · 2.0 turbo', year: 2022, trim: 'Mk8 R', side: './img/sil/hatch.svg', color: 0x1f4cff, accent: 0x111, v0100: 4.6, v100200: 13.5, v200300: null, v80120: 3.1, hp: 320, nm: 420, kg: 1550, lap: { track: 'nurb-nord', time: '8:01.00' } },
  { id: 'civic', name: 'Honda Civic Type R', cls: 'Hot hatch · FWD · 2.0 turbo', year: 2023, trim: 'FL5', side: './img/sil/hatch.svg', color: 0xc41e3a, accent: 0x111, v0100: 5.4, v100200: 14.8, v200300: null, v80120: 3.4, hp: 330, nm: 420, kg: 1429, lap: { track: 'nurb-nord', time: '7:50.00' } },
  { id: 'mustang', name: 'Ford Mustang Dark Horse', cls: 'GT · RWD · 5.0 V8', year: 2024, trim: 'S650 Dark Horse', side: './img/sil/muscle.svg', color: 0x111111, accent: 0x111, v0100: 4.1, v100200: 11.2, v200300: null, v80120: 2.6, hp: 500, nm: 567, kg: 1768, lap: { track: 'nurb-nord', time: '7:43.00' } },
  { id: 'teslap', name: 'Tesla Model S Plaid', cls: 'EV · AWD · tri-motor', year: 2023, trim: 'Plaid', side: './img/sil/ev.svg', color: 0xc5ccd3, accent: 0x111, v0100: 2.1, v100200: 6.0, v200300: 15.0, v80120: 1.3, hp: 1020, nm: 1420, kg: 2162, lap: { track: 'nurb-nord', time: '7:25.00' } },
];

const TRACKS = [
  { id: 'sochi', name: 'Сочи Автодром', ref: '1:35.00', km: '5.85', turns: '18' , corners: 'T2 — жёсткое торможение после прямой. T3 — длинный постоянный радиус. Финальная связка — медленные 90°.'},
  { id: 'moscow', name: 'Moscow Raceway', ref: '1:28.50', km: '3.93', turns: '13' , corners: 'Длинная прямая в последний сектор. Средний сектор рулёжный. Несколько конфигураций срезают связки.'},
  { id: 'igora', name: 'Игора Драйв', ref: '1:36.20', km: '5.18', turns: '20' , corners: 'Очень длинная С/Ф. Много средних поворотов против часовой. Перепад заметный на спуске.'},
  { id: 'kazan', name: 'Казань Ринг', ref: '1:22.80', km: '3.48', turns: '12' , corners: 'Каньон: слепые вершины, уклоны до ~10%. Движение против часовой. Длинная прямая ~800 м.'},
  { id: 'smolensk', name: 'Смоленское кольцо', ref: '1:24.00', km: '3.36', turns: '14' , corners: 'Техничное кольцо, средние радиусы, мало мест для отдыха.'},
  { id: 'nring', name: 'NRING Нижний Новгород', ref: '1:21.50', km: '3.12', turns: '12' , corners: 'Короткое кольцо, плотная нарезка, мало времени на ошибку.'},
  { id: 'adm', name: 'ADM Raceway Мячково', ref: '1:19.00', km: '3.25', turns: '16' , corners: 'Мячково: старое кольцо, короткие прямые, много направления.'},
  { id: 'grozny', name: 'Fort Grozny Autodrom', ref: '1:18.80', km: '3.08', turns: '11' , corners: 'Крепость: относительно короткое GP, понятные зоны торможения.'},
  { id: 'redring', name: 'Красное Кольцо Красноярск', ref: '1:26.00', km: '2.80', turns: '10' , corners: 'Компактное кольцо, меньше поворотов, акцент на ритм.'},
  { id: 'spb', name: 'Автодром Санкт-Петербург', ref: '1:27.00' , corners: 'Городской/короткий профиль, тесные связки.'},
  { id: 'tlt', name: 'Тольятти Ринг', ref: '1:23.00' , corners: 'Кольцо с средней длиной прямых.'},
  { id: 'lipetsk', name: 'Липецкий автодром', ref: '1:20.00' , corners: 'Короткий автодром, стоп-энд-гоу.'},
  { id: 'auto-msk', name: 'Автодром Москва', ref: '1:25.00' , corners: 'Городской автодром, смена направления часто.'},
  { id: 'neva', name: 'Нева Ринг', ref: '1:29.00' , corners: 'Нева: средние дуги, мало ультрамедленных шпилек.'},
  { id: 'ufa', name: 'Уфа Ринг', ref: '1:31.00' , corners: 'Региональное кольцо, ритм важнее пиковой скорости.'},
  { id: 'don', name: 'Донринг Ростов', ref: '1:30.00' , corners: 'Донринг: смесь прямых и средних дуг.'},
];



const TRACK_GEO = {
  sochi: { lat: 43.405, lon: 39.968 },
  moscow: { lat: 55.912, lon: 36.600 },
  igora: { lat: 60.685, lon: 30.140 },
  kazan: { lat: 55.650, lon: 49.260 },
  smolensk: { lat: 54.620, lon: 32.280 },
  nring: { lat: 56.180, lon: 43.520 },
  adm: { lat: 55.560, lon: 37.980 },
  grozny: { lat: 43.340, lon: 45.740 },
  redring: { lat: 56.060, lon: 92.900 },
  spb: { lat: 59.970, lon: 30.240 },
  tlt: { lat: 53.530, lon: 49.350 },
  lipetsk: { lat: 52.560, lon: 39.520 },
  'auto-msk': { lat: 55.700, lon: 37.400 },
  neva: { lat: 59.900, lon: 30.400 },
  ufa: { lat: 54.700, lon: 56.000 },
  don: { lat: 47.280, lon: 39.700 },
};

const TRACK_SVG = {
  sochi: 'M28 150 L70 148 C88 146 96 138 108 118 C150 48 210 38 248 72 C268 90 258 118 228 128 C190 140 168 128 150 108 C132 88 108 128 92 148 C80 162 52 168 28 166 Z',
  moscow: 'M30 128 L120 128 C138 128 148 116 162 96 C178 72 210 58 248 70 C278 82 270 118 238 132 C200 150 168 168 120 170 L48 170 C32 170 26 150 30 128 Z',
  igora: 'M24 92 L210 70 C250 64 278 92 270 128 C262 168 200 182 140 170 C90 160 40 150 28 128 C20 112 20 100 24 92 Z',
  kazan: 'M50 40 C90 28 160 48 170 90 C180 130 240 150 230 175 C210 198 90 188 60 150 C35 118 28 70 50 40 Z',
  smolensk: 'M40 70 C80 30 200 28 250 80 C280 120 220 175 120 170 C60 166 30 120 40 70 Z',
  nring: 'M36 86 C70 36 160 30 210 70 C250 100 255 150 200 168 C130 190 50 160 40 120 C34 104 32 96 36 86 Z',
  adm: 'M40 100 L80 48 L200 40 L260 88 L250 150 L140 172 L52 148 Z',
  grozny: 'M70 36 C150 20 250 70 240 130 C230 175 90 185 50 130 C35 100 40 55 70 36 Z',
  redring: 'M32 140 C36 70 140 28 240 80 C280 110 220 175 100 172 C50 170 30 158 32 140 Z',
  spb: 'M60 36 L240 48 L268 130 L90 172 L42 100 Z',
  tlt: 'M40 82 C90 28 240 40 262 100 C250 160 90 172 48 122 C38 104 36 92 40 82 Z',
  lipetsk: 'M55 48 L238 72 L252 148 L78 168 L38 108 Z',
  'auto-msk': 'M34 102 C62 36 210 26 272 92 C282 140 148 182 68 154 C38 140 28 118 34 102 Z',
  neva: 'M42 72 C124 22 262 42 260 112 C254 168 98 176 54 126 C40 106 36 86 42 72 Z',
  ufa: 'M60 90 C92 40 232 36 256 96 C266 146 148 172 78 146 C54 132 50 110 60 90 Z',
  don: 'M46 86 C102 26 252 46 256 112 C250 166 108 176 58 130 C40 110 40 96 46 86 Z'
};
function drawTrack(id, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const d = TRACK_SVG[id] || TRACK_SVG.sochi;
  const tr = TRACKS.find((x) => x.id === id) || {};
  const meta = [tr.km && (tr.km + ' км'), tr.turns && (tr.turns + ' пов.')].filter(Boolean).join(' · ');
  el.innerHTML = `<svg viewBox="0 0 300 210" class="track-svg"><path d="${d}" fill="none" stroke="#2ee56a" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/></svg><p>${tr.name || ''}<br><small>${meta}</small></p><p class="track-notes">${tr.corners || ''}</p>`;
}



const storeKey = 'pitlane-v1';
const state = loadState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storeKey)) || { carId: null, garage: [], meas: {}, laps: {}, scans: {} };
  } catch {
    return { carId: 'm3', meas: {}, laps: {} };
  }
}
function save() {
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
    authDb.users[u.phone] = u;
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
  return CARS.find((c) => c.id === state.carId) || garageList()[0] || CARS[0];
}

function fmt(v, unit = ' с') {
  return v == null || v === '' ? '—' : `${Number(v).toFixed(2).replace(/\.00$/, '')}${unit}`;
}

function applyCarUI() {
  const empty = !garageList().length;
  document.getElementById('emptyGarage')?.classList.toggle('hidden', !empty);
  document.getElementById('addWizard')?.classList.add('hidden');
  document.querySelector('#view-garage .mycar')?.classList.toggle('hidden', empty);
  if (empty) {
    const sil = document.getElementById('emptySil');
    if (sil) sil.src = './img/sil/empty-dotted.png';
    const n = document.getElementById('carName');
    if (n) n.textContent = 'Pitlane';
    const h = document.getElementById('hdr0100');
    if (h) h.textContent = '—';
    const l = document.getElementById('hdrLap');
    if (l) l.textContent = '—';
    try { renderCars(); } catch (err) { console.warn('renderCars', err); }
    return;
  }
  const c = currentCar();
  const m = state.meas[c.id] || {};
  const v0100 = m.v0100;
  const v100200 = m.v100200;
  const v200300 = m.v200300;
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('carName', c.name);
  setTxt('carClass', c.cls);
  setTxt('hdr0100', fmt(v0100, 'с'));
  setTxt('boxName', c.name);
  setTxt('boxTrim', `${c.year} · ${c.trim}`);
  setTxt('boxClass', c.cls);
  setTxt('boxYear', String(c.year));
  const hero = document.getElementById('heroPhoto');
  const stage = document.getElementById('photoStage');
  const wheels = document.getElementById('heroWheels');
  const scanSrc = state.scans && state.scans[c.id];
  const sideSrc = silForCar(c);
  if (hero) {
    const src = scanSrc || sideSrc;
    hero.dataset.orig = src;
    hero.src = src;
  }
  stage?.classList.toggle('has-cutout', !!scanSrc);
  stage?.classList.toggle('has-sil', !scanSrc);
  if (wheels) wheels.classList.add('hidden'); // silhouettes include wheels

  setTxt('s0100', fmt(v0100));
  setTxt('s100200', fmt(v100200));
  setTxt('s200300', fmt(v200300));
  setTxt('d0100', fmt(v0100));
  setTxt('d100200', fmt(v100200));
  setTxt('d200300', fmt(v200300));
  setTxt('d80120', fmt(m.v80120));
  const hpEl = document.getElementById('dHp');
  if (hpEl) hpEl.textContent = c.hp ? `${c.hp} л.с.` : '—';
  setTxt('dNm', `${c.nm} Н·м`);
  setTxt('dKg', `${c.kg} кг`);
  setTxt('dPt', c.kg ? String(Math.round((c.hp / c.kg) * 1000)) : '—');
  const track = TRACKS.find((t) => t.id === (state.trackId || c.lap.track)) || TRACKS[0];
  const mine = bestLapDisplay(track.id);
  setTxt('sLap', mine || 'нет заезда');
  document.getElementById('hdrLap').textContent = mine || '—';
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

function renderCars() {
  const grid = document.getElementById('carGrid');
  if (!grid) return;
  grid.innerHTML = '';
  CARS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'car-card' + (c.id === state.carId ? ' active' : '');
    const src = silForCar(c);
    b.innerHTML = `<img src="${src}" alt="" loading="lazy" /><strong>${c.name}</strong><small>${c.cls}</small><small>0–100 ${fmt(c.v0100)}</small>`;
    b.onclick = () => {
      state.carId = c.id;
      save();
      applyCarUI();
    };
    grid.appendChild(b);
  });
}

function renderTracks() {
  const sel = document.getElementById('trackSelect');
  const html = TRACKS.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
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
  box.innerHTML = '<div class="wheel-item"></div>' + opts.map((o) => `<div class="wheel-item" data-val="${o.value}">${o.text}</div>`).join('') + '<div class="wheel-item"></div>';
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

async function renderTops() {
  const c = currentCar();
  const trackId = document.getElementById('topTrackSelect')?.value || state.trackId || c.lap.track;
  const nameEl = document.getElementById('topCarName');
  const trackNameEl = document.getElementById('topTrackName');
  if (nameEl) nameEl.textContent = c.name;
  const track = TRACKS.find((t) => t.id === trackId);
  if (trackNameEl && track) trackNameEl.textContent = track.name;
  const sEl = document.getElementById('topStraight');
  if (sEl) {
    const rows = await api.listStraight(c.id);
    sEl.innerHTML = rows.length ? rows.map((r, i) => `<li><span>${i + 1}. ${r.name} · ${r.car}</span><strong>${Number(r.t).toFixed(2)} с</strong></li>`).join('') : '<li><span>нет GPS-заездов</span><strong>—</strong></li>';
  }
  const lEl = document.getElementById('topLap');
  if (lEl) {
    const rows = await api.listLap(trackId);
    lEl.innerHTML = rows.length ? rows.map((r, i) => `<li><span>${i + 1}. ${r.name} · ${r.car}</span><strong>${r.t}</strong></li>`).join('') : '<li><span>нет GPS-кругов</span><strong>—</strong></li>';
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

document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.onclick = () => {
    const id = btn.dataset.view;
    if (!id || !document.getElementById('view-' + id)) return;
    try { navigator.vibrate?.(10); } catch (_) {}
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const nav = btn.classList.contains('nav-btn') ? btn : document.querySelector(`.nav-btn[data-view="${id}"]`);
    activateNavBtn(nav);
    document.getElementById('view-' + id).classList.add('active');
    onResize();
  };
});
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
const canvas = document.getElementById('view3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
camera.position.set(5.4, 2.2, 5.8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 4;
controls.maxDistance = 12;
controls.target.set(0, 0.6, 0);

scene.add(new THREE.HemisphereLight(0xe8eef8, 0x1a1a1a, 0.55));
const key = new THREE.SpotLight(0xfff3dd, 3.4, 22, Math.PI / 5, 0.35);
key.position.set(3.2, 7.2, 3.4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
scene.add(key.target);
const fill = new THREE.SpotLight(0xcfe4ff, 1.6, 18, Math.PI / 4, 0.5);
fill.position.set(-4.5, 5.5, -2.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.15);
rim.position.set(-2.5, 4.5, 6);
scene.add(rim);
const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
function ceilingLamp(x, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.35), lampMat);
  m.position.set(x, 3.15, z);
  scene.add(m);
}
ceilingLamp(-1.4, 1.2);
ceilingLamp(1.4, 1.2);
ceilingLamp(-1.4, -1.2);
ceilingLamp(1.4, -1.2);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7, 72),
  new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.72, roughness: 0.22 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(3.15, 3.28, 80),
  new THREE.MeshBasicMaterial({ color: 0x2ee56a, side: THREE.DoubleSide })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.01;
scene.add(ring);

const car = new THREE.Group();
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
    ctx.fillStyle = '#1a1a1a';
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
    ctx.fillStyle = '#0c0c0c';
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
    ctx.fillStyle = '#2ee56a';
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
  const w = canvas.clientWidth || canvas.parentElement.clientWidth;
  const h = canvas.clientHeight || canvas.parentElement.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (moving.hood) lerpAngle(moving.hood, 'z', -moving.tHood * 1.05, dt);
  if (moving.trunk) lerpAngle(moving.trunk, 'z', moving.tTrunk * 1.05, dt);
  (moving.doorList || []).forEach((d) => {
    const dir = Math.sign(d.position.z) || 1;
    lerpAngle(d, 'y', dir * moving.tDoors * 1.1, dt);
  });
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

setTimeout(() => document.getElementById('intro')?.classList.add('done'), 4200);
document.getElementById('intro')?.addEventListener('click', () => {
  document.getElementById('intro')?.classList.add('done');
});

renderTracks();
applyCarUI();
onResize();
requestAnimationFrame(tick);

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
let lastFix = null;
let filtV = 0;
const kf = { v: 0, a: 0, p: 80, r: 20, q: 10, e2: 30, init: false };
function kmhFromCoords(coords, ts) {
  const acc = coords.accuracy || 25;
  if (acc > 45) return kf.init ? kf.v : null;
  if (coords.latitude == null) return kf.init ? kf.v : null;
  const fix = { lat: coords.latitude, lon: coords.longitude, t: ts };
  let z = null;
  if (coords.speed != null && Number.isFinite(coords.speed) && coords.speed >= 0) {
    z = Math.max(0, coords.speed * 3.6);
  }
  const dt = lastFix ? Math.max(0.05, Math.min(2, (ts - lastFix.t) / 1000)) : 0.25;
  if (lastFix) {
    const hv = (haversineM(lastFix, fix) / dt) * 3.6;
    if (hv < 360) z = z == null ? hv : z * 0.7 + hv * 0.3;
  }
  lastFix = fix;
  if (z == null) return kf.init ? kf.v : null;
  if (!kf.init) {
    kf.v = z; kf.a = 0; kf.p = 40; kf.r = 12 + acc; kf.q = 10; kf.e2 = 40; kf.init = true; filtV = z;
    return z;
  }
  const qBoost = Math.min(40, Math.abs(kf.a) * 0.35);
  kf.q = kf.q * 0.9 + (6 + qBoost) * 0.1;
  kf.v += kf.a * dt;
  kf.p += kf.q + acc * 0.12;
  const innov = z - kf.v;
  const S = kf.p + kf.r;
  const nis = (innov * innov) / Math.max(1, S);
  kf.e2 = kf.e2 * 0.88 + S * 0.12;
  if (nis > 3.5) kf.r = Math.min(260, kf.r * 1.18);
  else if (nis < 0.35) kf.r = Math.max(5, kf.r * 0.94);
  else kf.r = Math.max(5, Math.min(220, 0.92 * kf.r + 0.08 * (S + acc * 0.5)));
  const k = kf.p / (kf.p + kf.r);
  kf.a = kf.a * 0.55 + (innov / dt) * 0.45;
  kf.v += k * innov;
  kf.p *= (1 - k);
  if (kf.v < 0.5) { kf.v = 0; kf.a = 0; }
  if (kf.v > 360) kf.v = 360;
  filtV = kf.v;
  return kf.v;
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
  const v = kmhFromCoords(pos.coords, now);
  const acc = pos.coords.accuracy;
  setRunText('gpsAcc', acc ? `${Math.round(acc)} м` : '—');
  if (v == null) {
    setRunText('runStatus', 'GPS есть, но скорость не отдаёт. Выйдите на улицу / откройте с телефона.');
    return;
  }
  setRunText('liveSpeed', String(Math.round(v)));
  setRunText('boxLive', String(Math.round(v)));
  if (document.body.classList.contains('run-drive-on')) setRunText('runDriveSpeed', String(Math.round(v)));
  if (lapRun.active) onLapGps(pos, v);

  if (!run.armed) {
    setRunText('runStatus', 'GPS живой. Стоите — жмите «Старт»');
    return;
  }

  const sample = { t: now, v };
  const prev = run.samples[run.samples.length - 1];
  run.samples.push(sample);

  if (!run.launched) {
    if (v < 8) {
      run.t0 = now;
      setRunText('runFrom', 'ожидание старта');
      setRunText('runStatus', 'Вооружён. Трогайтесь');
      setRunText('runDriveMsg', 'вооружён — газ');
    } else if (run.t0 && v >= 8) {
      run.launched = true;
      setRunText('runFrom', 'пошли');
      setRunText('runStatus', 'Идёт разгон…');
      setRunText('runDriveMsg', 'поехали!');
      run.dist = 0; run.prevDist = 0; run.lastPos = null;
    } else {
      setRunText('runStatus', 'Для чистого 0–100 почти остановитесь (< 8 км/ч)');
    }
    return;
  }

  // distance from launch (drag traps)
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  if (lat != null && lon != null) {
    const here = { lat, lon };
    if (run.lastPos) {
      const step = haversineM(run.lastPos, here);
      if (step < 80) run.dist = (run.dist || 0) + step;
    }
    run.lastPos = here;
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
  }
  if (t100 && !run.saved0100) {
    const sec = (t100 - run.t0) / 1000;
    setRunText('run0100', fmtRunSec(sec));
    setRunText('slip0100', `${sec.toFixed(2)}s`);
    setRunText('slipHero', `${sec.toFixed(2)}s`);
    revealRunMark('0100', '0–100', fmtRunSec(sec));
    run.saved0100 = true;
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
    onGpsPoint,
    (err) => setRunText('runStatus', err.message || 'Нет доступа к GPS'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 2500 }
  );
  if (run.pollId) clearInterval(run.pollId);
  run.pollId = setInterval(() => {
    navigator.geolocation.getCurrentPosition(onGpsPoint, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 1800 });
  }, 400);
  navigator.wakeLock?.request?.('screen').then((l) => { run.wake = l; }).catch(() => {});
  setRunText('runStatus', 'Запрос разрешения на геолокацию…');
}

function armRun() {
  hap([18, 40, 18]);
  startWatch();
  run.armed = true;
  run.launched = false;
  run.samples = [];
  run.t0 = null;
  run.marks = {};
  run.revealed = {};
  run.peak = 0;
  run.dist = 0;
  run.prevDist = 0;
  run.lastPos = null;
  kf.init = false; kf.v = 0; kf.a = 0; kf.p = 80; lastFix = null;
  run.saved0100 = run.saved100200 = run.saved200300 = run.saved050 = run.saved060 = run.saved80120 = run.saved1000 = false;
  run.saved60ft = run.saved18 = run.saved14 = false;
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
  setRunText('runStatus', 'Готово. Можно снова Старт');
  setRunText('runDriveMsg', 'замер записан · закрой или новый Старт');
}

function needLogin(msg) {
  if (currentUser()) return false;
  const el = document.getElementById('authMsg');
  if (el) el.textContent = msg || 'Чтобы писать в топ, войди или зарегистрируйся';
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById('view-account')?.classList.add('active');
  return true;
}

async function publishGps(v0100, v100200, v200300) {
  if (needLogin('GPS-замер сохранён на устройстве. В топ — после входа.')) {
    const rec0 = state.meas[state.carId] || {};
    if (v0100 != null) rec0.v0100 = Number(v0100.toFixed(2));
    if (v100200 != null) rec0.v100200 = Number(v100200.toFixed(2));
    if (v200300 != null) rec0.v200300 = Number(v200300.toFixed(2));
    state.meas[state.carId] = rec0;
    save();
    applyCarUI();
    if (v0100 != null) pushSlip();
    return;
  }
  const rec = state.meas[state.carId] || {};
  if (v0100 != null) rec.v0100 = Number(v0100.toFixed(2));
  if (v100200 != null) rec.v100200 = Number(v100200.toFixed(2));
  if (v200300 != null) rec.v200300 = Number(v200300.toFixed(2));
  state.meas[state.carId] = rec;
  save();
  const who = (profile()?.nick) || (JSON.parse(localStorage.getItem('pitlane-auth-v1') || '{}').phone) || 'пилот';
  if (v0100 != null) {
    await api.addStraight(currentCar().id, { name: String(who).slice(-6), car: currentCar().name, t: rec.v0100, gps: true });
    pushSlip();
  }
  applyCarUI();
}


/* -------- Lap drive: honest GPS gate + sectors -------- */
const lapDrive = {
  open: false,
  timerId: null,
  weatherAt: 0,
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

function openLapDrive() {
  const el = document.getElementById('lapDrive');
  if (!el) return;
  const trackId = lapRun.trackId || document.getElementById('trackSelect')?.value || TRACKS[0].id;
  const track = TRACKS.find((t) => t.id === trackId) || TRACKS[0];
  document.getElementById('lapDriveTrack').textContent = track.name;
  document.getElementById('lapDriveClock').textContent = '0:00.0';
  document.getElementById('lapDriveSpeed').textContent = '0';
  setLapHud('lapDriveDist', '0 м');
  setLapHud('lapDriveS1', 'S1 —');
  setLapHud('lapDriveS2', 'S2 —');
  setLapHud('lapDriveS3', 'S3 —');
  setLapHud('lapDriveSlip', 'слип ~—°');
  updateSessionHud();
  setLapMsg('GPS… подъезжайте к линии С/Ф');
  drawTrack(trackId, 'lapDriveMap');
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lap-drive-on');
  lapDrive.open = true;
  if (lapDrive.timerId) clearInterval(lapDrive.timerId);
  lapDrive.timerId = setInterval(() => {
    if (!lapRun.active || lapRun.phase !== 'running' || !lapRun.t0) return;
    document.getElementById('lapDriveClock').textContent = fmtLapClock(Date.now() - lapRun.t0);
  }, 100);
  fetchLapWeather(trackId);
}

function closeLapDrive() {
  const el = document.getElementById('lapDrive');
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lap-drive-on');
  lapDrive.open = false;
  if (lapDrive.timerId) { clearInterval(lapDrive.timerId); lapDrive.timerId = null; }
}

async function fetchLapWeather(trackId) {
  const geo = TRACK_GEO[trackId];
  const box = document.getElementById('lapDriveWeather');
  if (!box) return;
  if (!geo) { box.textContent = 'погода: нет координат'; return; }
  if (Date.now() - lapDrive.weatherAt < 5 * 60 * 1000 && box.dataset.ready) return;
  box.textContent = 'погода…';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,wind_speed_10m,weather_code&wind_speed_unit=ms`;
    const res = await fetch(url);
    const data = await res.json();
    const cur = data.current || {};
    const t = cur.temperature_2m;
    const w = cur.wind_speed_10m;
    box.textContent = (t != null ? `${Math.round(t)}°C` : '—') + (w != null ? ` · ветер ${Math.round(w)} м/с` : '');
    box.dataset.ready = '1';
    lapDrive.weatherAt = Date.now();
  } catch (_) {
    box.textContent = 'погода недоступна';
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
  hap([18, 40, 18]);
  startWatch();
  const trackId = document.getElementById('trackSelect')?.value || TRACKS[0].id;
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
  openLapDrive();
  updateSessionHud();
  setLapMsg('track-day: пересеките С/Ф — старт сессии');
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
    why: valid ? '' : (how === 'manual' ? 'ручной — не в топ' : check.why),
  };
  state.laps[trackId] = state.laps[trackId] || [];
  state.laps[trackId].push(rec);
  save();

  lapSession.laps.push(rec);
  if (valid && (lapSession.bestMs == null || ms < lapSession.bestMs)) {
    lapSession.bestMs = ms;
    lapSession.bestValid = true;
  }

  if (valid) {
    const who = (profile()?.nick) || currentUser()?.nick || currentUser()?.phone || 'пилот';
    await api.addLap(trackId, {
      name: String(who).slice(0, 24),
      car: currentCar().name,
      t: tStr,
      gps: true,
      valid: true,
      dist: rec.dist,
      slipAvg: rec.slipAvg,
      trackDay: true,
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
      ? `круг ${n} ${tStr} ✓ · лучший ${best} · следующий`
      : `круг ${n} ${tStr} ∅ ${rec.why} · следующий`);
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

function onLapGps(pos, vKmh) {
  if (!lapRun.active || lapRun.phase === 'idle') return;
  const c = pos.coords;
  const acc = c.accuracy || 99;
  const now = pos.timestamp || Date.now();
  const pt = { lat: c.latitude, lon: c.longitude, t: now, v: vKmh, acc };
  const gate = TRACK_GEO[lapRun.trackId];
  if (!gate || pt.lat == null) return;

  lapRun.samples += 1;
  const dGate = haversineM(pt, gate);
  const inGate = dGate <= LAP_GATE_R;

  let reject = false;
  if (acc > LAP_MAX_ACC) {
    lapRun.bad += 1;
    if (!lapRun.flags.includes('acc')) lapRun.flags.push('acc');
    setLapHud('lapDriveWarn', `GPS ±${Math.round(acc)} м`);
    reject = true;
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
      lapRun.dist += jump;
      if (jump > 2.5 && vKmh > 25) {
        const course = bearingDeg(lapRun.last, pt);
        let slip = null;
        if (c.heading != null && Number.isFinite(c.heading)) {
          slip = Math.abs(angDiff(course, c.heading));
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

  document.getElementById('lapDriveSpeed').textContent = String(Math.round(vKmh || 0));
  setLapHud('lapDriveDist', `${Math.round(lapRun.dist)} м`);

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
    if (!inGate && dGate > LAP_GATE_R * 1.25) lapRun.leftGate = true;
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
  ul.innerHTML = list.length
    ? list.map((l, i) => {
        const tag = l.valid === false ? '∅' : (i === 0 ? 'PB' : '#' + (i + 1));
        const note = l.valid === false ? ` · ${l.why || 'не в топ'}` : (l.gps ? ' · GPS' : '');
        return `<li><span>${tag}</span><strong>${formatMs(l.ms)}</strong><em class="tiny">${note}</em></li>`;
      }).join('')
    : '<li><span>пока пусто</span><strong>—</strong></li>';
}

function renderTrackDays() {
  const el = document.getElementById('trackDayList');
  if (!el) return;
  const rows = state.trackDays || [];
  el.innerHTML = rows.length
    ? rows.slice(0, 12).map((s) => {
        const tr = TRACKS.find((t) => t.id === s.trackId);
        const best = s.bestMs != null ? formatMs(s.bestMs) : '—';
        const when = new Date(s.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<li><span>${tr?.name || s.trackId} · ${s.n} кр.</span><strong>${best}</strong><em class="tiny">${when} · чистых ${s.validN || 0}</em></li>`;
      }).join('')
    : '<li><span>сессий пока нет</span><strong>—</strong></li>';
}

document.getElementById('btnLapStart')?.addEventListener('click', () => { armLapRun(); });
document.getElementById('btnLapStop')?.addEventListener('click', () => {
  if (lapRun.active) endLapSession('сессия завершена');
  else setLapMsg('сессия не идёт');
});
document.getElementById('lapDriveFinish')?.addEventListener('click', () => {
  if (lapRun.active && lapRun.phase === 'running') void completeLapRun('manual');
  else if (lapRun.active) endLapSession('сессия завершена');
});
document.getElementById('lapDriveEnd')?.addEventListener('click', () => {
  if (lapRun.active) endLapSession('сессия завершена');
});
document.getElementById('lapDriveCancel')?.addEventListener('click', () => {
  closeLapDrive();
});



document.getElementById('btnGps')?.addEventListener('click', startWatch);
document.getElementById('btnArm')?.addEventListener('click', armRun);
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
  const t = `PITLANE\n${currentCar().name}\n0–100 ${document.getElementById('run0100')?.textContent}\n100–200 ${document.getElementById('run100200')?.textContent}`;
  try {
    if (navigator.share) await navigator.share({ text: t });
    else await navigator.clipboard.writeText(t);
  } catch (_) {}
});
window.addEventListener('devicemotion', (e) => {
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const g = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2) / 9.81;
  setRunText('liveG', g.toFixed(2));
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
renderSlips();

/* -------- auth + subscription (local demo) -------- */
const AUTH_KEY = 'pitlane-auth-v1';
const PRICE = { month: 390, year: 2990, monthOff: 195, yearOff: 1495 };

function normPhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) return '7' + d.slice(1);
  if (d.length === 10) return '7' + d;
  return d;
}

async function hashPass(p) {
  try {
    if (crypto?.subtle?.digest) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  let h = 2166136261;
  for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 16777619);
  return 'x' + (h >>> 0).toString(16);
}

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        parsed.users = parsed.users || {};
        return parsed;
      }
    }
  } catch (err) {
    console.warn('auth load', err);
  }
  return { users: {}, session: null };
}

let authDb = loadAuth();

function saveAuth() {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(authDb));
    // mirror session id for quick restore if full blob fails later
    if (authDb.session) localStorage.setItem(AUTH_KEY + ':session', authDb.session);
    else localStorage.removeItem(AUTH_KEY + ':session');
    // backup copy
    localStorage.setItem(AUTH_KEY + ':bak', JSON.stringify(authDb));
  } catch (err) {
    console.warn('auth save failed', err);
    const msg = document.getElementById('authMsg');
    if (msg) msg.textContent = 'Не удалось сохранить аккаунт на устройстве (память браузера).';
    throw err;
  }
}

function restoreAuthIfNeeded() {
  authDb = loadAuth();
  if (!authDb.session) {
    const sid = localStorage.getItem(AUTH_KEY + ':session');
    if (sid && authDb.users[sid]) authDb.session = sid;
  }
  if ((!authDb.users || !Object.keys(authDb.users).length)) {
    try {
      const bak = JSON.parse(localStorage.getItem(AUTH_KEY + ':bak') || 'null');
      if (bak?.users) authDb = bak;
    } catch (_) {}
  }
}

function currentUser() {
  return authDb.session ? authDb.users[authDb.session] : null;
}

function isPro(user = currentUser()) {
  if (!user) return false;
  const now = Date.now();
  return now < user.trialEnds || (user.paidUntil && now < user.paidUntil);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('ru-RU');
}

function refreshAccount() {
  restoreAuthIfNeeded();
  const u = currentUser();
  document.getElementById('authForm')?.classList.toggle('hidden', !!u);
  const phones = document.querySelectorAll('#accPhone');
  if (!u) {
    phones.forEach((el) => { el.textContent = 'гость'; });
    const plan = document.getElementById('accPlan');
    if (plan) plan.textContent = 'аккаунт хранится на этом устройстве';
    return;
  }
  phones.forEach((el) => { el.textContent = '+' + u.phone; });
  const nickEl = document.getElementById('accNick');
  if (nickEl && u.nick && !nickEl.value) nickEl.value = u.nick;
  const plan = document.getElementById('accPlan');
  if (plan) {
    plan.textContent = (isPro(u) ? ('Pro · ') : ('trial · ')) + 'сохранено на этом устройстве';
  }
  const setAcc = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setAcc('accDiscount', u.firstPaid ? 'уже использована' : '−50% на первую');
  setAcc('accPro', isPro(u) ? 'да' : 'нет');
  setAcc('priceMonth', (u.firstPaid ? PRICE.month : PRICE.monthOff) + ' ₽');
  setAcc('priceYear', (u.firstPaid ? PRICE.year : PRICE.yearOff) + ' ₽');
}

async function registerUser(phone, password) {
  const p = normPhone(phone);
  if (p.length !== 11) throw new Error('Введите номер в формате +7…');
  if (authDb.users[p]) throw new Error('Этот номер уже зарегистрирован');
  const nick = (document.getElementById('accNick')?.value || '').trim() || ('пилот' + p.slice(-4));
  authDb.users[p] = {
    phone: p,
    pass: await hashPass(password + ':' + p),
    nick,
    trialEnds: Date.now() + 7 * 24 * 60 * 60 * 1000,
    paidUntil: null,
    plan: 'trial',
    firstPaid: false,
    garage: state.garage || [],
    carId: state.carId || null,
  };
  authDb.session = p;
  saveProf({ ...profile(), nick });
  saveAuth();
}

async function loginUser(phone, password) {
  const p = normPhone(phone);
  const u = authDb.users[p];
  if (!u) throw new Error('Сначала регистрация');
  const h = await hashPass(password + ':' + p);
  if (h !== u.pass) throw new Error('Неверный пароль');
  authDb.session = p;
  // restore personal garage if stored on account
  if (Array.isArray(u.garage) && u.garage.length) {
    state.garage = u.garage;
    state.carId = u.carId || u.garage[0]?.id || null;
    save();
  }
  if (u.nick) saveProf({ ...profile(), nick: u.nick });
  saveAuth();
}

function buyPlan(kind) {
  const u = currentUser();
  if (!u) return;
  const days = kind === 'year' ? 365 : 30;
  const price = u.firstPaid ? PRICE[kind] : PRICE[kind + 'Off'];
  u.plan = kind;
  u.firstPaid = true;
  u.paidUntil = Date.now() + days * 24 * 60 * 60 * 1000;
  saveAuth();
  alert('Демо: Pro на ' + days + ' дн. К оплате было ' + price + ' ₽. Касса не подключена.');
  refreshAccount();
}

document.getElementById('authForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await loginUser(fd.get('phone'), fd.get('password'));
    document.getElementById('authMsg').textContent = '';
    refreshAccount();
  } catch (err) {
    document.getElementById('authMsg').textContent = err.message;
  }
});

document.getElementById('btnRegister')?.addEventListener('click', async () => {
  const form = document.getElementById('authForm');
  const fd = new FormData(form);
  try {
    await registerUser(fd.get('phone'), fd.get('password'));
    document.getElementById('authMsg').textContent = '';
    refreshAccount();
  } catch (err) {
    document.getElementById('authMsg').textContent = err.message;
  }
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
  authDb.session = null;
  saveAuth();
  refreshAccount();
});
document.getElementById('btnGuest')?.addEventListener('click', () => {
  document.getElementById('auth')?.classList.add('hidden');
});
document.getElementById('btnOpenAuth')?.addEventListener('click', () => {
  document.getElementById('auth')?.classList.remove('hidden');
});

document.querySelectorAll('[data-buy]').forEach((b) => {
  b.addEventListener('click', () => buyPlan(b.dataset.buy));
});

restoreAuthIfNeeded();
refreshAccount();

const gltfLoader = new GLTFLoader();
let glbRoot = null;

function clearGlb() {
  if (glbRoot) {
    scene.remove(glbRoot);
    glbRoot = null;
  }
  car.visible = true;
}

function fitGlb(obj) {
  clearGlb();
  glbRoot = obj;
  const box = new THREE.Box3().setFromObject(glbRoot);
  const size = box.getSize(new THREE.Vector3()).length();
  glbRoot.scale.setScalar(4.4 / Math.max(size, 0.01));
  box.setFromObject(glbRoot);
  const mid = box.getCenter(new THREE.Vector3());
  glbRoot.position.sub(mid);
  glbRoot.position.y += 0.22;
  glbRoot.rotation.y = Math.PI * 0.22;
  scene.add(glbRoot);
  car.visible = false;
}

function loadDefaultGlb() {
  gltfLoader.load('./models/sportscar.glb', (gltf) => fitGlb(gltf.scene));
}

document.getElementById('liveryInput')?.addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])].slice(0, 3);
  if (!files.length) return;
  const hero = document.getElementById('heroPhoto');
  if (hero) hero.src = URL.createObjectURL(files[0]);
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 1024;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#111';
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
  gltfLoader.load('./models/ferrari.glb', (gltf) => fitGlb(gltf.scene));
});

document.querySelectorAll('[data-photo]').forEach((b) => {
  b.addEventListener('click', () => {
    const img = document.getElementById('heroPhoto');
    if (img) img.src = b.dataset.photo;
  });
});
document.getElementById('btnToggle3d')?.addEventListener('click', () => {
  const canvas3d = document.getElementById('view3d');
  const photos = document.getElementById('photoStage');
  const on = canvas3d.classList.contains('hidden-3d');
  canvas3d.classList.toggle('hidden-3d', !on);
  photos?.classList.toggle('hidden', on);
  const t = document.getElementById('btnToggle3d');
  if (t) t.textContent = on ? 'Фото' : 'Включить 3D';
  if (on) {
    onResize();
    gltfLoader.load('./models/ferrari.glb', (gltf) => fitGlb(gltf.scene));
  }
});

document.querySelectorAll('.model-bar button').forEach((b) => {
  b.addEventListener('click', () => {
    const url = b.dataset.glb;
    if (!url) {
      clearGlb();
      paintCar(currentCar());
      return;
    }
    gltfLoader.load(url, (gltf) => fitGlb(gltf.scene));
  });
});

const paint = { body: null, wheel: null };
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
    document.querySelectorAll('#colorBar button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    paint.mb = b.dataset.paint || 'polar-white';
    paint.body = b.dataset.hex || null;
    applyPaint();
  });
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
  state.carId = list[(i + dir + list.length) % list.length].id;
  save();
  paint.body = 'none';
  paint.wheel = 'none';
  document.querySelectorAll('#colorBar button, #wheelBar button').forEach((x) => x.classList.remove('on'));
  document.querySelector('#colorBar button')?.classList.add('on');
  document.querySelector('#wheelBar button')?.classList.add('on');
  applyCarUI();
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
  document.getElementById('emptyGarage')?.classList.add('hidden');
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
  state.carId = car.id;
  save();
  applyCarUI();
});

function shiftGarage(dir) {
  const list = garageList();
  if (!list.length) return;
  const i = Math.max(0, list.findIndex((c) => c.id === state.carId));
  state.carId = list[(i + dir + list.length) % list.length].id;
  save();
  applyCarUI();
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
    'nav.box':'Бокс','nav.dyno':'Паспорт','nav.run':'Замер','nav.lap':'Круг','nav.top':'Топ','nav.paddock':'Paddock',
    'garage.empty':'Гараж пуст','garage.hint':'Добавь свой автомобиль — марка, кузов, год, мотор.','garage.add':'Добавить автомобиль','garage.reset':'сброс',
    'run.title':'Замер','run.hint':'Нажми старт, почти остановись, разгоняйся. Когда скорость упадёт — замер сохранится.','run.start':'Старт',
    'dyno.title':'Паспорт динамики','dyno.hint':'Цифры разгона — только после своего заезда.','dyno.acc':'Разгон','dyno.mass':'Масса и отдача',
    'lap.title':'Круг','lap.track':'Трасса','lap.gps':'Круг по GPS','lap.sess':'Сессии','lap.start':'Старт круга','lap.finish':'Финиш круга',
    'top.title':'Топы','pad.title':'Paddock','pad.send':'Опубликовать','pad.ph':'Что сделал с машиной…','pad.empty':'Пока тихо. Напиши первый пост после входа.',
    'acc.title':'Аккаунт','acc.login':'Вход','acc.hint':'Телефон и пароль.','acc.in':'Войти','acc.reg':'Регистрация','acc.nick':'ник'
  },
  en: {
    'nav.box':'Box','nav.dyno':'Specs','nav.run':'Run','nav.lap':'Lap','nav.top':'Leaderboard','nav.paddock':'Paddock',
    'garage.empty':'Garage is empty','garage.hint':'Add your car — make, body, year, engine.','garage.add':'Add car','garage.reset':'reset',
    'run.title':'Run','run.hint':'Tap start, almost stop, then accelerate. When speed drops the run is saved.','run.start':'Start',
    'dyno.title':'Dynamics sheet','dyno.hint':'Acceleration figures appear only after your own run.','dyno.acc':'Acceleration','dyno.mass':'Mass and output',
    'lap.title':'Lap','lap.track':'Track','lap.gps':'GPS lap','lap.sess':'Sessions','lap.start':'Start lap','lap.finish':'Finish lap',
    'top.title':'Leaderboards','pad.title':'Paddock','pad.send':'Post','pad.ph':'What did you do to the car…','pad.empty':'Quiet for now. Sign in and write the first post.',
    'acc.title':'Account','acc.login':'Sign in','acc.hint':'Phone and password.','acc.in':'Sign in','acc.reg':'Sign up','acc.nick':'nickname'
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
  return (profile()?.nick) || currentUser()?.phone || '';
}
async function renderPulse() {
  const feed = document.getElementById('pulseFeed');
  if (!feed) return;
  const rows = await api.listPulse();
  feed.innerHTML = rows.map((p) => {
    const likes = (p.likes || []).length;
    return `<article class="pulse-card" data-id="${p.id}">
      <header><b>${p.who || 'пилот'}</b><span>${new Date(p.at).toLocaleString('ru-RU')}</span></header>
      <p>${(p.text || '').replace(/[<>]/g, '')}</p>
      ${p.img ? `<img src="${p.img}" alt="">` : ''}
      <div class="pulse-actions">
        <button type="button" data-like="${p.id}">♥ ${likes}</button>
        <button type="button" data-del="${p.id}">удалить</button>
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
