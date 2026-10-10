/**
 * v128: погода на момент заезда — Open-Meteo (без ключа; данные CC BY 4.0, атрибуция в method.html).
 * Сервер сам запрашивает при сохранении заезда: сетка 0.1° (~11 км) × час, кэш в KV. Точные координаты
 * не сохраняются в строке и наружу не отдаются. Погода недоступна → null, заезд сохраняется без неё.
 * Это данные метеосервиса по ближайшей ячейке модели, не датчик асфальта.
 *
 * Условия Open-Meteo: бесплатный API — только некоммерческое использование, < 10 000 вызовов/сутки.
 * Свой потолок ниже (WX_MAX_HOUR / WX_MAX_DAY). Для коммерческого режима — env.OPEN_METEO_KEY
 * (customer-api…, тот же формат). Включение — env.WX_ENABLED = "1" (wrangler.toml); без него погода не запрашивается.
 */
export const WX_TIMEOUT_MS = 2500;
export const WX_MAX_HOUR = 250;
export const WX_MAX_DAY = 2500;
const CACHE_TTL = 45 * 86400;
const NEG_TTL = 600;
const ARCHIVE_AFTER_MS = 80 * 86400e3;
const HOUR = 3600e3;

const grid = (v) => Math.round(Number(v) * 10) / 10;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const isoHour = (ms) => new Date(Math.floor(ms / HOUR) * HOUR).toISOString().slice(0, 13) + ':00';

export function wxKey(lat, lon, at) { return `wx:${grid(lat).toFixed(1)}:${grid(lon).toFixed(1)}:${isoHour(at)}`; }

export function wxUrl(env, lat, lon, at) {
  const key = env?.OPEN_METEO_KEY ? String(env.OPEN_METEO_KEY) : '';
  const old = Date.now() - at > ARCHIVE_AFTER_MS;
  const host = old ? (key ? 'customer-archive-api.open-meteo.com/v1/archive' : 'archive-api.open-meteo.com/v1/archive')
    : (key ? 'customer-api.open-meteo.com/v1/forecast' : 'api.open-meteo.com/v1/forecast');
  const q = new URLSearchParams({
    latitude: grid(lat).toFixed(1), longitude: grid(lon).toFixed(1),
    hourly: 'temperature_2m,relative_humidity_2m,surface_pressure,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    daily: 'sunrise,sunset', timezone: 'GMT', wind_speed_unit: 'ms', timeformat: 'unixtime',
    start_date: isoDay(at - 3 * HOUR), end_date: isoDay(at),
  });
  if (key) q.set('apikey', key);
  return `https://${host}?${q}`;
}

/** Код погоды WMO + осадки → бакет топа: dry | damp | wet. */
export function wetBucket(pr, pr2h, code) {
  const c = Number(code);
  if (pr >= 0.5 || (c >= 61 && c <= 67) || (c >= 71 && c <= 86) || c >= 95) return 'wet';
  if (pr > 0 || pr2h >= 0.3 || (c >= 51 && c <= 57)) return 'damp';
  return 'dry';
}
/** Время суток по солнцу: утро — первые ~30 % светового дня, вечер — последние ~25 % и 45 мин после заката. */
export function timeOfDay(at, rise, set) {
  if (!(rise > 0 && set > rise)) return null;
  const len = set - rise;
  if (at < rise - 30 * 60e3 || at > set + 45 * 60e3) return 'night';
  if (at < rise + 0.3 * len) return 'morning';
  if (at < rise + 0.75 * len) return 'day';
  return 'evening';
}
/** Компонент ветра вдоль курса: > 0 — встречный, < 0 — попутный (м/с). wd — откуда дует (°). */
export function headwind(ws, wd, hdg) {
  if (!(ws >= 0) || wd == null || hdg == null) return null;
  return Math.round(ws * Math.cos(((wd - hdg) * Math.PI) / 180) * 10) / 10;
}
export function bearing(a, b) {
  const r = Math.PI / 180; const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return Math.round(((Math.atan2(y, x) / r) + 360) % 360);
}

/** Разбор ответа Open-Meteo на час старта → компактный объект для строки заезда. */
export function parseWx(data, at) {
  const h = data?.hourly; const d = data?.daily;
  if (!h || !Array.isArray(h.time) || !h.time.length) return null;
  const hs = Math.floor(at / HOUR) * HOUR / 1000;
  const i = h.time.indexOf(hs);
  if (i < 0) return null;
  const num = (arr, j = i) => { const v = Array.isArray(arr) ? Number(arr[j]) : NaN; return Number.isFinite(v) ? v : null; };
  const t = num(h.temperature_2m); const rh = num(h.relative_humidity_2m); const p = num(h.surface_pressure);
  const pr = num(h.precipitation) ?? 0; const ws = num(h.wind_speed_10m); const wd = num(h.wind_direction_10m); const code = num(h.weather_code);
  if (t == null && ws == null) return null;
  const pr2h = (num(h.precipitation, i - 1) ?? 0) + (num(h.precipitation, i - 2) ?? 0);
  let tod = null;
  if (d && Array.isArray(d.time)) {
    const day = Math.floor(at / 86400e3) * 86400;
    const k = d.time.indexOf(day);
    if (k >= 0) tod = timeOfDay(at, Number(d.sunrise?.[k]) * 1000, Number(d.sunset?.[k]) * 1000);
  }
  const out = { src: 'om', wet: wetBucket(pr, pr2h, code) };
  if (t != null) out.t = Math.round(t * 10) / 10;
  if (rh != null) out.rh = Math.round(rh);
  if (p != null) out.p = Math.round(p);
  out.pr = Math.round(pr * 10) / 10;
  if (ws != null) out.ws = Math.round(ws * 10) / 10;
  if (wd != null) out.wd = Math.round(wd);
  if (code != null) out.code = code;
  if (tod) out.tod = tod;
  return out;
}

/** Публичная форма (только числа/метки из белого списка). */
export function publicWx(w) {
  if (!w || typeof w !== 'object' || w.src !== 'om') return null;
  const o = { src: 'om' };
  const n = (k, lo, hi) => { const v = Number(w[k]); if (Number.isFinite(v) && v >= lo && v <= hi) o[k] = v; };
  n('t', -60, 60); n('rh', 0, 100); n('p', 300, 1100); n('pr', 0, 200); n('ws', 0, 80); n('wd', 0, 360); n('code', 0, 99); n('hw', -80, 80);
  if (['dry', 'damp', 'wet'].includes(w.wet)) o.wet = w.wet;
  if (['morning', 'day', 'evening', 'night'].includes(w.tod)) o.tod = w.tod;
  return o;
}

async function bump(kv, key, max, ttl) {
  const n = Number(await kv.get(key)) || 0;
  if (n >= max) return false;
  await kv.put(key, String(n + 1), { expirationTtl: ttl });
  return true;
}

/**
 * Погода для заезда. geo = { lat, lon, t0, hdg? } (внутреннее, из сырого трека). → объект | null.
 * Никогда не бросает: любая ошибка/таймаут/лимит → null.
 */
export async function runWeather(env, geo) {
  try {
    if (!geo || env?.WX_ENABLED !== '1') return null; // opt-in: прод — wrangler.toml [vars]; тесты — только с моком __wxFetch
    const { lat, lon } = geo; const at = Number(geo.t0) || Date.now();
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || at > Date.now() + HOUR) return null;
    const kv = env.PITLANE; const key = wxKey(lat, lon, at);
    let w = null;
    const cached = await kv.get(key);
    if (cached) { try { w = JSON.parse(cached); } catch (_) { w = null; } if (w && w.none) return null; }
    if (!w) {
      const hk = 'rl:wx:h:' + isoHour(Date.now()); const dk = 'rl:wx:d:' + isoDay(Date.now());
      if (!(await bump(kv, dk, WX_MAX_DAY, 2 * 86400)) || !(await bump(kv, hk, WX_MAX_HOUR, 2 * 3600))) return null;
      const f = env.__wxFetch || fetch;
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => ac?.abort(), WX_TIMEOUT_MS);
      let data = null;
      try {
        const r = await f(wxUrl(env, lat, lon, at), { signal: ac?.signal, headers: { Accept: 'application/json' }, cf: { cacheTtl: 900 } });
        if (r && r.ok) data = await r.json();
      } catch (_) { data = null; } finally { clearTimeout(timer); }
      w = data ? parseWx(data, at) : null;
      await kv.put(key, JSON.stringify(w || { none: 1 }), { expirationTtl: w ? CACHE_TTL : NEG_TTL });
      if (!w) return null;
    }
    const out = { ...w };
    if (geo.hdg != null && out.ws != null && out.wd != null) { const hw = headwind(out.ws, out.wd, geo.hdg); if (hw != null) out.hw = hw; }
    return publicWx(out);
  } catch (_) { return null; }
}
