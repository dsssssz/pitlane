/**
 * Lap-drive satellite map (Leaflet + Esri World Imagery, no API key).
 * Online-first tiles; offline → dark basemap + neon outline fallback.
 */
import { TRACK_OUTLINES } from './geo/outlines.js';

const ESRI_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR = 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics';
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '© OpenStreetMap';

/** @type {{ map: any, trackId: string|null, outline: any, sf: any, car: any, tiles: any, dark: any, statusEl: HTMLElement|null, online: boolean, lastLat: number|null, lastLon: number|null, lastHdg: number|null, mode: string, resizeObs: ResizeObserver|null }} */
const state = {
  map: null,
  trackId: null,
  outline: null,
  sf: null,
  car: null,
  tiles: null,
  dark: null,
  statusEl: null,
  online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  lastLat: null,
  lastLon: null,
  lastHdg: null,
  mode: 'overview',
  resizeObs: null,
};

function Lref() {
  return typeof window !== 'undefined' ? window.L : null;
}

function outlineFor(trackId) {
  return TRACK_OUTLINES[trackId] || null;
}

function qualityLabel(q) {
  if (q === 'full') return 'спутник · линия трассы';
  if (q === 'footprint') return 'спутник · контур автодрома';
  if (q === 'approx') return 'спутник · схема (приблизительно)';
  return 'спутник · точка С/Ф';
}

function carIconHtml(heading) {
  const rot = heading != null && Number.isFinite(heading) ? heading : 0;
  return (
    '<div class="sat-car" style="transform:rotate(' + rot.toFixed(1) + 'deg)">' +
    '<span class="sat-car-glow"></span>' +
    '<span class="sat-car-dot"></span>' +
    '<span class="sat-car-nose"></span>' +
    '</div>'
  );
}

function sfIconHtml() {
  return (
    '<div class="sat-sf" title="С/Ф">' +
    '<span class="sat-sf-flag"></span>' +
    '<span class="sat-sf-lab">С/Ф</span>' +
    '</div>'
  );
}

function ensureStatus(host) {
  let el = host.querySelector('.sat-map-status');
  if (!el) {
    el = document.createElement('p');
    el.className = 'sat-map-status';
    host.appendChild(el);
  }
  state.statusEl = el;
  return el;
}

function setStatus(text, kind) {
  if (!state.statusEl) return;
  state.statusEl.textContent = text || '';
  state.statusEl.dataset.kind = kind || '';
  state.statusEl.hidden = !text;
}

function boundsFromOutline(o) {
  const L = Lref();
  if (!L || !o) return null;
  if (o.bbox && o.bbox.length === 4) {
    return L.latLngBounds(
      [o.bbox[1], o.bbox[0]],
      [o.bbox[3], o.bbox[2]]
    );
  }
  if (o.coords && o.coords.length) {
    const latlngs = o.coords.map((c) => [c[1], c[0]]);
    return L.latLngBounds(latlngs);
  }
  if (o.sf) {
    const pad = Math.max(0.004, (o.padKm || 3.5) * 0.0011);
    return L.latLngBounds(
      [o.sf[1] - pad, o.sf[0] - pad],
      [o.sf[1] + pad, o.sf[0] + pad]
    );
  }
  return null;
}

function destroyMap() {
  if (state.resizeObs) {
    try { state.resizeObs.disconnect(); } catch (_) {}
    state.resizeObs = null;
  }
  if (state.map) {
    try { state.map.remove(); } catch (_) {}
  }
  state.map = null;
  state.outline = null;
  state.sf = null;
  state.car = null;
  state.tiles = null;
  state.dark = null;
  state.trackId = null;
  state.statusEl = null;
}

/**
 * Mount satellite map into #lapDriveMap (or given host).
 * Falls back to calling svgFallback(trackId) if Leaflet missing.
 */
export function mountLapSatMap(trackId, hostEl, opts) {
  const L = Lref();
  const host = hostEl || document.getElementById('lapDriveMap');
  if (!host) return false;
  const o = outlineFor(trackId);
  if (!L || !o) {
    if (opts && typeof opts.svgFallback === 'function') opts.svgFallback(trackId);
    return false;
  }

  destroyMap();
  host.innerHTML = '';
  host.classList.add('sat-map-host');

  const wrap = document.createElement('div');
  wrap.className = 'sat-map-wrap';
  const mapDiv = document.createElement('div');
  mapDiv.className = 'sat-map-canvas';
  mapDiv.id = 'lapSatMapCanvas';
  wrap.appendChild(mapDiv);
  host.appendChild(wrap);
  ensureStatus(host);

  const trName = (opts && opts.trackName) || trackId;
  const meta = (opts && opts.meta) || qualityLabel(o.quality);
  const cap = document.createElement('p');
  cap.className = 'lap-map-cap sat-map-cap';
  cap.innerHTML = trName + '<br><small>' + meta + (o.rough ? ' · С/Ф приблизителен' : '') + '</small>';
  host.appendChild(cap);

  state.trackId = trackId;
  state.mode = (opts && opts.mode) || 'overview';
  state.online = navigator.onLine !== false;
  state.lastLat = null;
  state.lastLon = null;
  state.lastHdg = null;

  const map = L.map(mapDiv, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    maxZoom: 19,
    minZoom: 12,
    fadeAnimation: false,
    zoomAnimation: true,
    markerZoomAnimation: false,
  });
  state.map = map;

  // Dark fallback basemap (always under tiles)
  state.dark = L.tileLayer('data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=', {
    opacity: 0,
  });
  // Use a solid pane color via CSS instead — dark layer as null tiles won't work well.
  mapDiv.style.background = '#1a1a1a';

  const tileOpts = {
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution: ESRI_ATTR,
    crossOrigin: true,
    errorTileUrl: '',
  };
  state.tiles = L.tileLayer(ESRI_URL, tileOpts);
  let tileErrors = 0;
  let tileOks = 0;
  state.tiles.on('tileerror', () => {
    tileErrors += 1;
    if (tileErrors >= 4 && tileOks < 2 && state.online) {
      // soft fallback to OSM raster once
      try {
        map.removeLayer(state.tiles);
      } catch (_) {}
      state.tiles = L.tileLayer(OSM_URL, { ...tileOpts, attribution: OSM_ATTR, maxNativeZoom: 19 });
      state.tiles.addTo(map);
      setStatus('спутник недоступен · схема OSM', 'warn');
      tileErrors = 0;
    } else if (!state.online || tileErrors >= 8) {
      setStatus('нет сети · контур трассы без спутника', 'warn');
    }
  });
  state.tiles.on('tileload', () => { tileOks += 1; });
  state.tiles.addTo(map);

  if (!state.online) {
    setStatus('офлайн · контур без свежих тайлов', 'warn');
  } else {
    setStatus('');
  }

  // Outline
  if (o.coords && o.coords.length >= 2) {
    const latlngs = o.coords.map((c) => [c[1], c[0]]);
    const isClosed =
      o.quality === 'footprint' ||
      (latlngs.length > 2 &&
        Math.abs(latlngs[0][0] - latlngs[latlngs.length - 1][0]) < 1e-5 &&
        Math.abs(latlngs[0][1] - latlngs[latlngs.length - 1][1]) < 1e-5);
    if (isClosed && o.quality === 'footprint') {
      state.outline = L.polygon(latlngs, {
        color: '#39FF14',
        weight: 2.5,
        opacity: 0.95,
        fillColor: '#39FF14',
        fillOpacity: 0.08,
        lineJoin: 'round',
        interactive: false,
      }).addTo(map);
    } else {
      // racing line / approx: thick asphalt-like stroke + neon core
      L.polyline(latlngs, {
        color: '#111',
        weight: 10,
        opacity: 0.55,
        lineJoin: 'round',
        lineCap: 'round',
        interactive: false,
      }).addTo(map);
      state.outline = L.polyline(latlngs, {
        color: '#39FF14',
        weight: 3.2,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round',
        interactive: false,
      }).addTo(map);
    }
  }

  // S/F
  if (o.sf) {
    state.sf = L.marker([o.sf[1], o.sf[0]], {
      icon: L.divIcon({
        className: 'sat-sf-icon',
        html: sfIconHtml(),
        iconSize: [48, 36],
        iconAnchor: [10, 18],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 400,
    }).addTo(map);
  }

  // Car marker (hidden until GPS)
  state.car = L.marker([o.sf[1], o.sf[0]], {
    icon: L.divIcon({
      className: 'sat-car-icon',
      html: carIconHtml(0),
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 800,
  });
  // don't add until we have a fix — or show at S/F faintly
  state.car.addTo(map);
  try {
    state.car.getElement()?.classList.add('sat-car-waiting');
  } catch (_) {}

  const b = boundsFromOutline(o);
  if (b && b.isValid()) {
    map.fitBounds(b.pad(0.18), { animate: false, maxZoom: 17 });
  } else if (o.sf) {
    map.setView([o.sf[1], o.sf[0]], 15, { animate: false });
  }

  // Resize observer — Leaflet needs invalidateSize when flex layout settles
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
        try { map.invalidateSize({ animate: false }); } catch (_) {}
      })
    : null;
  if (ro) {
    ro.observe(host);
    state.resizeObs = ro;
  }
  requestAnimationFrame(() => {
    try { map.invalidateSize({ animate: false }); } catch (_) {}
    applyMode(state.mode, true);
  });

  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);
  return true;
}

function onNet() {
  state.online = navigator.onLine !== false;
  if (!state.online) setStatus('офлайн · контур без свежих тайлов', 'warn');
  else setStatus('');
}

export function unmountLapSatMap() {
  window.removeEventListener('online', onNet);
  window.removeEventListener('offline', onNet);
  destroyMap();
  const host = document.getElementById('lapDriveMap');
  if (host) {
    host.classList.remove('sat-map-host');
    host.innerHTML = '';
  }
}

export function isLapSatMapActive() {
  return !!state.map;
}

export function setLapSatMapMode(mode) {
  state.mode = mode === 'nav' ? 'nav' : 'overview';
  applyMode(state.mode, false);
}

function applyMode(mode, instant) {
  const map = state.map;
  const L = Lref();
  if (!map || !L) return;
  const o = outlineFor(state.trackId);
  if (mode === 'overview') {
    const b = boundsFromOutline(o);
    if (b && b.isValid()) {
      map.fitBounds(b.pad(0.18), { animate: !instant, maxZoom: 17 });
    }
  } else {
    // navigator: follow car / S/F at closer zoom
    const lat = state.lastLat != null ? state.lastLat : (o && o.sf ? o.sf[1] : null);
    const lon = state.lastLon != null ? state.lastLon : (o && o.sf ? o.sf[0] : null);
    if (lat != null) {
      map.setView([lat, lon], Math.max(map.getZoom(), 17), { animate: !instant });
    }
  }
}

/**
 * Update GPS blue/neon car on the real map.
 * @param {{lat:number, lon:number, course?:number|null}} pt
 */
export function updateLapSatMapGps(pt) {
  if (!state.map || !state.car || !pt || pt.lat == null || pt.lon == null) return;
  const L = Lref();
  if (!L) return;
  state.lastLat = pt.lat;
  state.lastLon = pt.lon;
  if (pt.course != null && Number.isFinite(pt.course)) state.lastHdg = pt.course;

  state.car.setLatLng([pt.lat, pt.lon]);
  try {
    const el = state.car.getElement();
    if (el) {
      el.classList.remove('sat-car-waiting');
      const inner = el.querySelector('.sat-car');
      if (inner && state.lastHdg != null) {
        inner.style.transform = 'rotate(' + state.lastHdg.toFixed(1) + 'deg)';
      }
    }
  } catch (_) {}

  if (state.mode === 'nav') {
    const z = Math.max(state.map.getZoom(), 17);
    state.map.setView([pt.lat, pt.lon], z, { animate: true });
  }
}

export function trackOutlineQuality(trackId) {
  const o = outlineFor(trackId);
  return o ? o.quality : null;
}

export { TRACK_OUTLINES };
