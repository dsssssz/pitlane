// Telegram Mini App integration. Everything here is a no-op outside Telegram.
// SDK is self-hosted (vendor/telegram-web-app.js) — telegram.org is throttled in RU — and loaded
// only when we look like we're inside Telegram, with a hard timeout so the app never hangs.
const W = window;

function tgHashParams() {
  try {
    const h = String(location.hash || '').replace(/^#/, '');
    return h.includes('tgWebApp') ? new URLSearchParams(h) : null;
  } catch (_) { return null; }
}
function suspectTma() {
  try {
    if (W.Telegram?.WebApp) return true;
    if (tgHashParams()) return true;
    if (/[?&]tgWebApp/.test(location.search)) return true;
    if (sessionStorage.getItem('__telegram__initParams')) return true;
    if (W.TelegramWebviewProxy) return true;
    if (new URLSearchParams(location.search).get('tma') === '1') return true;
  } catch (_) {}
  return false;
}

function loadSdk(timeoutMs = 3500) {
  if (W.Telegram?.WebApp || !suspectTma()) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = './vendor/telegram-web-app.js';
    s.async = true;
    const t = setTimeout(resolve, timeoutMs);
    s.onload = s.onerror = () => { clearTimeout(t); resolve(); };
    document.head.appendChild(s);
  });
}

await loadSdk();

export const WebApp = W.Telegram?.WebApp || null;
/** Signed launch data (empty for keyboard-button launches). */
export const tmaInitData = WebApp && typeof WebApp.initData === 'string' ? WebApp.initData : '';
// Inside Telegram iff we have initData, or the SDK reports a real client platform (it says 'unknown' in a plain browser).
export const isTMA = !!(WebApp && (tmaInitData.length > 0 || (WebApp.platform && WebApp.platform !== 'unknown')));
export const tmaVersion = isTMA ? String(WebApp.version || '') : '';
export const tmaPlatform = isTMA ? String(WebApp.platform || '') : '';

export function tmaAtLeast(v) {
  if (!isTMA) return false;
  try { return !!WebApp.isVersionAtLeast(v); } catch (_) { return false; }
}

/** Telegram Android UA: "Telegram-Android/11.x (Manufacturer Model; Android 14; SDK 34; HIGH)". */
export function telegramDeviceClass(ua = navigator.userAgent) {
  const m = String(ua || '').match(/Telegram-Android\/[\d.]+\s*\([^)]*;\s*(LOW|AVERAGE|HIGH)\)/i);
  return m ? m[1].toUpperCase() : null;
}

/* ---------- start_param → app route (read before any URL cleanup) ---------- */
function readStartParam() {
  let p = '';
  try { p = WebApp?.initDataUnsafe?.start_param || ''; } catch (_) {}
  if (!p) { try { p = tgHashParams()?.get('tgWebAppStartParam') || ''; } catch (_) {} }
  if (!p) {
    try {
      const q = new URLSearchParams(location.search);
      p = q.get('tgWebAppStartParam') || q.get('startapp') || '';
    } catch (_) {}
  }
  p = String(p || '').trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(p) ? p : '';
}

export function parseStartParam(p) {
  const m = String(p || '').match(/^(duel|crew|lap|run|s|track|tops)_([A-Za-z0-9_-]{1,56})$/);
  if (!m) return null;
  const kind = m[1] === 'lap' || m[1] === 'run' ? 's' : m[1];
  return { kind, id: m[2], raw: p };
}

// start_param stays in Telegram's sessionStorage for the whole launch: route only once
// (not again after visiting a legal page and coming back).
const _rawStart = readStartParam();
let _startDone = false;
try { _startDone = !!_rawStart && sessionStorage.getItem('pitlane-start-done') === _rawStart; } catch (_) {}
try { if (_rawStart) sessionStorage.setItem('pitlane-start-done', _rawStart); } catch (_) {}
export const START_PARAM = _startDone ? '' : _rawStart;

// t.me/<bot>?startapp=diag → the diagnostic page (same origin, so the Mini App API keeps working there).
if (START_PARAM === 'diag' && !/tma-check\.html$/.test(location.pathname)) {
  try { location.replace(new URL('./tools/tma-check.html', location.href).href); } catch (_) {}
  await new Promise(() => {}); // stop booting the app while navigating
}
export const START_ROUTE = parseStartParam(START_PARAM);

(function rewriteUrlForStart() {
  // Inside TMA the hash carries tgWebAppData (the SDK already copied it to sessionStorage).
  // Drop it so it never ends up in share links, and translate start_param into the app's own deep links.
  try {
    const q = new URLSearchParams(location.search);
    let changed = false;
    for (const k of ['tgWebAppStartParam', 'startapp']) if (q.has(k)) { q.delete(k); changed = true; }
    const r = START_ROUTE;
    if (r) {
      changed = true;
      if (r.kind === 'duel') q.set('duel', r.id);
      else if (r.kind === 'crew') q.set('crew', r.id);
      else if (r.kind === 's') q.set('s', r.id);
      else if (r.kind === 'track') { q.set('view', 'lap'); q.set('skipIntro', '1'); }
      else if (r.kind === 'tops') { q.set('view', 'tops'); q.set('skipIntro', '1'); }
    }
    const dropHash = !!tgHashParams();
    if (!changed && !dropHash) return;
    const qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + (dropHash ? '' : location.hash));
  } catch (_) {}
})();

/* ---------- chrome: colors, fullscreen, swipes, safe areas ---------- */
const THEME = '#1a1a1a';
function call(fn) { try { return fn(); } catch (err) { console.warn('[tma]', err?.message || err); return undefined; } }

function applyInsets() {
  const root = document.documentElement.style;
  const sa = (WebApp.safeAreaInset || {});
  const ca = (WebApp.contentSafeAreaInset || {});
  const n = (v) => (Number.isFinite(+v) ? +v : 0);
  root.setProperty('--tma-top', (n(sa.top) + n(ca.top)) + 'px');
  root.setProperty('--tma-bottom', (n(sa.bottom) + n(ca.bottom)) + 'px');
  root.setProperty('--tma-left', (n(sa.left) + n(ca.left)) + 'px');
  root.setProperty('--tma-right', (n(sa.right) + n(ca.right)) + 'px');
  document.documentElement.classList.toggle('tma-fullscreen', !!WebApp.isFullscreen);
}

export function setupTmaChrome() {
  if (!isTMA) return;
  const html = document.documentElement;
  html.classList.add('tma');
  html.classList.add('tma-' + (tmaPlatform || 'unknown').replace(/[^a-z]/gi, ''));
  try { sessionStorage.setItem('pitlane-tma', '1'); } catch (_) {}
  call(() => WebApp.ready());
  call(() => WebApp.expand());
  if (tmaAtLeast('6.1')) {
    call(() => WebApp.setHeaderColor(THEME));
    call(() => WebApp.setBackgroundColor(THEME));
  }
  if (tmaAtLeast('7.10')) call(() => WebApp.setBottomBarColor(THEME));
  if (tmaAtLeast('7.7')) call(() => WebApp.disableVerticalSwipes());
  // Fullscreen only on phones: on desktop/web it would just hide the window chrome.
  if (tmaAtLeast('8.0') && /^(ios|android|android_x)$/i.test(tmaPlatform) && !WebApp.isFullscreen) {
    call(() => WebApp.requestFullscreen());
  }
  applyInsets();
  for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) {
    call(() => WebApp.onEvent(ev, applyInsets));
  }
  // Never leave our origin inside the Mini App (Bot API 10.2+: WebApp API works only on the original origin).
  document.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[href]');
    if (!a || e.defaultPrevented) return;
    let url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
    e.preventDefault();
    openExternal(url.href);
  }, true);
}

export function openExternal(href) {
  if (!isTMA) { W.open(href, '_blank', 'noopener'); return; }
  if (/^https:\/\/t\.me\//i.test(href) && tmaAtLeast('6.1')) call(() => WebApp.openTelegramLink(href));
  else call(() => WebApp.openLink(href));
}

/* ---------- BackButton ---------- */
let _backHandler = null;
let _backShown = false;
export function setBackHandler(fn) {
  if (!isTMA || !tmaAtLeast('6.1')) return;
  if (!_backHandler) call(() => WebApp.BackButton.onClick(() => { try { _backHandler?.(); } catch (_) {} }));
  _backHandler = fn;
}
export function showBack(on) {
  if (!isTMA || !tmaAtLeast('6.1')) return;
  on = !!on;
  if (on === _backShown) return;
  _backShown = on;
  call(() => (on ? WebApp.BackButton.show() : WebApp.BackButton.hide()));
}

/* ---------- closing confirmation ---------- */
let _closeGuard = false;
export function setClosingGuard(on) {
  if (!isTMA || !tmaAtLeast('6.2')) return;
  on = !!on;
  if (on === _closeGuard) return;
  _closeGuard = on;
  call(() => (on ? WebApp.enableClosingConfirmation() : WebApp.disableClosingConfirmation()));
}

/* ---------- haptics ---------- */
export function tmaHaptic(kind = 'light') {
  if (!isTMA || !tmaAtLeast('6.1')) return false;
  const H = WebApp.HapticFeedback;
  if (!H) return false;
  return call(() => {
    if (kind === 'success' || kind === 'warning' || kind === 'error') H.notificationOccurred(kind);
    else if (kind === 'select') H.selectionChanged();
    else H.impactOccurred(kind);
    return true;
  }) || false;
}

/* ---------- location settings ---------- */
export function canOpenLocationSettings() {
  return isTMA && tmaAtLeast('8.0') && !!WebApp.LocationManager;
}
export function openLocationSettings() {
  if (!canOpenLocationSettings()) return false;
  const LM = WebApp.LocationManager;
  const go = () => call(() => LM.openSettings());
  if (LM.isInited) go();
  else call(() => LM.init(go));
  return true;
}

/* ---------- sharing ---------- */
export function tmaStartLink(bot, param) {
  bot = String(bot || '').replace(/^@/, '');
  if (!/^\w{3,40}$/.test(bot) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(param || ''))) return null;
  return 'https://t.me/' + bot + '?startapp=' + encodeURIComponent(param);
}

/**
 * Share inside Telegram. Prefers WebApp.shareMessage(prepared id) (8.0+, needs Worker + bot token),
 * falls back to the t.me/share/url picker. `prepare` resolves to a prepared message id or null.
 */
export async function tmaShare({ url, text, prepare }) {
  if (!isTMA) return false;
  if (prepare && tmaAtLeast('8.0') && typeof WebApp.shareMessage === 'function') {
    let id = null;
    try { id = await prepare(); } catch (_) { id = null; }
    if (id) {
      const done = await new Promise((res) => {
        try { WebApp.shareMessage(id, () => res(true)); } catch (_) { res(false); }
        setTimeout(() => res(true), 60000);
      });
      if (done) return true;
    }
  }
  const share = 'https://t.me/share/url?url=' + encodeURIComponent(url) + (text ? '&text=' + encodeURIComponent(text) : '');
  if (tmaAtLeast('6.1')) call(() => WebApp.openTelegramLink(share));
  else call(() => WebApp.openLink(share));
  return true;
}

/* ---------- wake lock (navigator.wakeLock → muted looping video fallback) ---------- */
let _wl = null;
let _video = null;
export async function keepAwake(on) {
  if (on) {
    try {
      if (navigator.wakeLock?.request) {
        if (!_wl || _wl.released) _wl = await navigator.wakeLock.request('screen');
        return 'wakelock';
      }
    } catch (_) { _wl = null; }
    try {
      if (!_video) {
        _video = document.createElement('video');
        _video.setAttribute('playsinline', '');
        _video.setAttribute('muted', '');
        _video.muted = true;
        _video.loop = true;
        _video.src = './vendor/nosleep.mp4';
        _video.setAttribute('aria-hidden', 'true');
        Object.assign(_video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0.01', left: '-10px', bottom: '0', pointerEvents: 'none' });
        document.body.appendChild(_video);
      }
      await _video.play();
      return 'video';
    } catch (_) {
      return 'none';
    }
  }
  try { await _wl?.release?.(); } catch (_) {}
  _wl = null;
  try { _video?.pause(); } catch (_) {}
  return 'off';
}
export function wakeState() {
  if (_wl && !_wl.released) return 'wakelock';
  if (_video && !_video.paused) return 'video';
  return 'off';
}
