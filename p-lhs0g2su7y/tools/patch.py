from pathlib import Path
import re

html = Path('/workspace/pitlane-auth/index.html').read_text()
app = Path('/workspace/pitlane-auth/app.js').read_text()
css = Path('/workspace/pitlane-auth/styles.css').read_text()
worker = Path('/workspace/pitlane-auth/worker-index.js').read_text()

# ========== HTML: lap button + red start + SMS auth form ==========
html = html.replace(
  '>Старт сессии</button>',
  '>Открыть заезд</button>',
)
html = html.replace(
  'data-i18n="lap.start">Открыть заезд</button>\n                <button type="button" id="btnLapStop"',
  'data-i18n="lap.start">Открыть заезд</button>\n                <button type="button" id="btnLapStop"',
)

# Fix lap card hint
html = html.replace(
  'Track-day: вооружись → С/Ф стартует круг → каждый следующий С/Ф = финиш и сразу новый круг. Лучший сессии на экране. «Конец сессии» — выход. Ручной круг не в топ.',
  '«Открыть заезд» — карта, погода, время. Внутри красная «Старт» — вооружение круга. С/Ф стартует/финиширует. Ручной сброс не в топ.',
)

# Add red start button in lap drive left - after modes, before actions
if 'btnLapArmedStart' not in html:
  html = html.replace(
    '''        <div class="lap-map-modes" role="group" aria-label="режим карты">
          <button type="button" id="btnMapOverview" class="on">Вся карта</button>
          <button type="button" id="btnMapNav">Навигатор</button>
        </div>
        <div class="lap-drive-actions">''',
    '''        <div class="lap-map-modes" role="group" aria-label="режим карты">
          <button type="button" id="btnMapOverview" class="on">Вся карта</button>
          <button type="button" id="btnMapNav">Навигатор</button>
        </div>
        <button type="button" id="btnLapArmedStart" class="lap-start-orb" aria-label="Старт">Старт</button>
        <div class="lap-drive-actions">''',
  )

# Auth form → SMS
old_auth = '''          <form id="authForm" class="card auth-card" onsubmit="event.preventDefault();">
            <h3 data-i18n="acc.login">Вход</h3>
            <p class="muted" data-i18n="acc.hint">Телефон и пароль.</p>
            <label>телефон <input name="phone" type="tel" required placeholder="+7 900 000-00-00" /></label>
            <label>пароль <input name="password" type="password" required minlength="6" /></label>
            <p class="tiny" id="authMsg"></p>
            <div class="form-row">
              <button type="submit" id="btnLogin" data-i18n="acc.in">Войти</button>
              <button type="button" id="btnRegister" data-i18n="acc.reg">Регистрация</button>
            </div>
          </form>'''

new_auth = '''          <form id="authForm" class="card auth-card" onsubmit="event.preventDefault();">
            <h3 data-i18n="acc.login">Вход по SMS</h3>
            <p class="muted" data-i18n="acc.hint">Телефон → код из SMS. Аккаунт и ник сохраняются.</p>
            <div id="authStepPhone">
              <label>телефон <input id="authPhone" name="phone" type="tel" required placeholder="+7 900 000-00-00" autocomplete="tel" /></label>
              <label>ник (опционально) <input id="authNick" name="nick" type="text" maxlength="24" placeholder="как в топе" autocomplete="nickname" /></label>
              <p class="tiny" id="authMsg"></p>
              <button type="button" id="btnSendSms" class="go-btn">Получить код</button>
            </div>
            <div id="authStepCode" class="hidden">
              <p class="tiny">Код отправлен на <strong id="authPhoneShow">—</strong></p>
              <label>код из SMS <input id="authCode" name="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="1234" autocomplete="one-time-code" /></label>
              <p class="tiny" id="authMsg2"></p>
              <div class="form-row">
                <button type="button" id="btnVerifySms" class="go-btn">OK</button>
                <button type="button" id="btnSmsBack">Назад</button>
              </div>
            </div>
          </form>'''

if old_auth not in html:
    raise SystemExit('auth form missing')
html = html.replace(old_auth, new_auth, 1)
Path('/workspace/pitlane-auth/index.html').write_text(html)
print('html ok')

# ========== CSS ==========
if '.lap-start-orb' not in css:
    css += '''

.lap-start-orb {
  width: 72px;
  height: 72px;
  margin: 6px auto;
  border-radius: 999px;
  border: 2px solid #e23b3b;
  background: rgba(226, 59, 59, 0.08);
  color: #ff6b6b;
  font: 800 15px/1 "Barlow Condensed", sans-serif;
  letter-spacing: .08em;
  text-transform: uppercase;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.lap-start-orb:active { transform: scale(.96); }
.lap-start-orb.on {
  background: rgba(46, 229, 106, 0.12);
  border-color: #2ee56a;
  color: #2ee56a;
}
.lap-drive.armed .lap-start-orb { opacity: .45; pointer-events: none; }
.auth-card .go-btn { width: 100%; margin-top: 8px; }
'''
Path('/workspace/pitlane-auth/styles.css').write_text(css)
print('css ok')

# ========== APP.JS lap flow ==========
# Change btnLapStart to open preview only
app = app.replace(
    "document.getElementById('btnLapStart')?.addEventListener('click', () => { armLapRun(); });",
    "document.getElementById('btnLapStart')?.addEventListener('click', () => { openLapDrivePreview(); });\n"
    "document.getElementById('btnLapArmedStart')?.addEventListener('click', () => { armLapRun(); });",
)

# openLapDrivePreview + modify armLapRun to not reopen if already open
preview_fn = r'''
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
  setLapMsg('карта и погода · жми красный Старт');
  void fetchLapWeather(trackId, true);
  if (lapDrive.weatherTimer) clearInterval(lapDrive.weatherTimer);
  lapDrive.weatherTimer = setInterval(() => {
    if (lapDrive.open) void fetchLapWeather(lapRun.trackId || trackId, true);
  }, 60 * 1000);
}

'''

if 'function openLapDrivePreview' not in app:
    app = app.replace('function openLapDrive() {', preview_fn + 'function openLapDrive() {', 1)

# armLapRun: if drive already open, just arm; else open then arm
old_arm = '''function armLapRun() {
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
}'''

new_arm = '''function armLapRun() {
  hap([18, 40, 18]);
  startWatch();
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
}'''

if old_arm not in app:
    raise SystemExit('armLapRun missing')
app = app.replace(old_arm, new_arm, 1)

# closeLapDrive: clear weather timer
app = app.replace(
'''function closeLapDrive() {
  const el = document.getElementById('lapDrive');
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lap-drive-on');
  lapDrive.open = false;
  if (lapDrive.timerId) { clearInterval(lapDrive.timerId); lapDrive.timerId = null; }
}''',
'''function closeLapDrive() {
  const el = document.getElementById('lapDrive');
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lap-drive-on');
  el.classList.remove('armed');
  lapDrive.open = false;
  if (lapDrive.timerId) { clearInterval(lapDrive.timerId); lapDrive.timerId = null; }
  if (lapDrive.weatherTimer) { clearInterval(lapDrive.weatherTimer); lapDrive.weatherTimer = null; }
}'''
)

# Weather always fresh
old_w = '''async function fetchLapWeather(trackId) {
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
}'''

new_w = '''async function fetchLapWeather(trackId, force) {
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
    box.textContent = (t != null ? `${Math.round(t)}°C` : '—') + (w != null ? ` · ветер ${Math.round(w)} м/с` : '');
    box.dataset.ready = '1';
    lapDrive.weatherAt = Date.now();
  } catch (_) {
    if (!box.dataset.ready) box.textContent = 'погода недоступна';
    else box.textContent = prev;
  }
}'''

if old_w not in app:
    raise SystemExit('weather fn missing')
app = app.replace(old_w, new_w, 1)

# openLapDrive should force weather
app = app.replace(
    '  fetchLapWeather(trackId);\n}',
    '  void fetchLapWeather(trackId, true);\n}',
    1,
)

# lapDrive object weatherTimer
app = app.replace(
    "const lapDrive = {\n  open: false,\n  timerId: null,\n  weatherAt: 0,\n  mapMode: 'overview',\n};",
    "const lapDrive = {\n  open: false,\n  timerId: null,\n  weatherAt: 0,\n  weatherTimer: null,\n  mapMode: 'overview',\n};",
)

# i18n lap.start
app = app.replace("'lap.start':'Старт сессии'", "'lap.start':'Открыть заезд'")
app = app.replace("'run.start':'Старт'", "'run.start':'Старт'")  # noop keep
app = app.replace(
    "'acc.title':'Аккаунт','acc.login':'Вход','acc.hint':'Телефон и пароль.','acc.in':'Войти','acc.reg':'Регистрация','acc.nick':'ник'",
    "'acc.title':'Аккаунт','acc.login':'Вход по SMS','acc.hint':'Телефон → код. Аккаунт сохраняется.','acc.in':'OK','acc.reg':'Получить код','acc.nick':'ник'",
)

Path('/workspace/pitlane-auth/app.js').write_text(app)
print('app lap/weather ok', len(app))
