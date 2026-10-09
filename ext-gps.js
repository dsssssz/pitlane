/**
 * PITLANE GPS — внешний GNSS-приёмник (u-blox M9N/M10 + ESP32) по Web Bluetooth
 * и (v116) по Wi-Fi: чип → режим модема телефона → Worker (Durable Object) → WebSocket сюда.
 * Протокол: hardware/pitlane-gps/src/protocol.h (20-байтный NAV-PVT пакет + 8-байтный статус).
 * Модуль ничего не знает о замерах: отдаёт точки в формате GeolocationPosition через onPoint.
 */
export const EXT_GPS_SVC = '21d60001-18f2-4d0c-aa95-1402d5296fdd';
export const EXT_GPS_PVT = '21d60002-18f2-4d0c-aa95-1402d5296fdd';
export const EXT_GPS_STATUS = '21d60003-18f2-4d0c-aa95-1402d5296fdd';
export const EXT_GPS_CTRL = '21d60004-18f2-4d0c-aa95-1402d5296fdd';

/** Разбор 20-байтного пакета NAV-PVT (little-endian). */
export function parsePvtPacket(dv) {
  if (!dv || dv.byteLength < 20) return null;
  const fixB = dv.getUint8(1);
  const hAccDm = dv.getUint8(3);
  const sAcc = dv.getUint8(18);
  return {
    seq: dv.getUint8(0),
    fixType: fixB & 0x07,
    fixOk: (fixB & 0x08) !== 0,
    numSV: dv.getUint8(2),
    hAcc: hAccDm / 10,                // м
    iTOW: dv.getUint32(4, true),       // мс
    lat: dv.getInt32(8, true) / 1e7,
    lon: dv.getInt32(12, true) / 1e7,
    speed: dv.getUint16(16, true) / 100, // м/с (доплер)
    sAcc: sAcc / 100,                  // м/с
    heading: dv.getUint8(19) * 360 / 256,
  };
}

/** Разбор 8-байтного статуса. */
export function parseStatusPacket(dv) {
  if (!dv || dv.byteLength < 8) return null;
  const flags = dv.getUint8(5);
  return {
    ver: dv.getUint8(0),
    rateHz: dv.getUint8(1),
    battmV: dv.getUint16(2, true),
    battPct: dv.getUint8(4),
    configured: !!(flags & 1),
    pvtAlive: !!(flags & 2),
    fast: !!(flags & 4),
    m10: !!(flags & 8),
    pvtRate: dv.getUint8(6),
  };
}

/** Сборка пакета (для симулятора и тестов) — зеркало PvtPacket из прошивки. */
export function buildPvtPacket(p) {
  const dv = new DataView(new ArrayBuffer(20));
  dv.setUint8(0, p.seq & 0xff);
  dv.setUint8(1, (p.fixType & 7) | (p.fixOk ? 8 : 0));
  dv.setUint8(2, p.numSV & 0xff);
  dv.setUint8(3, Math.min(255, Math.round(p.hAcc * 10)));
  dv.setUint32(4, p.iTOW >>> 0, true);
  dv.setInt32(8, Math.round(p.lat * 1e7), true);
  dv.setInt32(12, Math.round(p.lon * 1e7), true);
  dv.setUint16(16, Math.max(0, Math.min(65535, Math.round(p.speed * 100))), true);
  dv.setUint8(18, Math.min(255, Math.round(p.sAcc * 100)));
  dv.setUint8(19, Math.round((((p.heading % 360) + 360) % 360) * 256 / 360) & 0xff);
  return dv;
}

export function buildStatusPacket(s) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setUint8(0, 1);
  dv.setUint8(1, s.rateHz);
  dv.setUint16(2, s.battmV || 0, true);
  dv.setUint8(4, s.battPct || 0);
  dv.setUint8(5, (s.configured ? 1 : 0) | (s.pvtAlive ? 2 : 0) | (s.fast ? 4 : 0) | (s.m10 ? 8 : 0));
  dv.setUint8(6, s.pvtRate || 0);
  return dv;
}

/** Почему Web Bluetooth недоступен (null — доступен). */
export function extGpsUnsupportedReason({ isTMA = false } = {}) {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (isTMA) {
    return 'Внутри Telegram Bluetooth недоступен. Откройте Pitlane в Chrome на Android (dsssssz.github.io/pitlane) — или дождитесь приложения Pitlane.';
  }
  if (ios) {
    return 'На iPhone/iPad браузеры не поддерживают Web Bluetooth. Нужен Android + Chrome, либо будущее приложение Pitlane для iOS.';
  }
  if (!('bluetooth' in navigator) || typeof navigator.bluetooth?.requestDevice !== 'function') {
    return 'Этот браузер не умеет Web Bluetooth. Откройте Pitlane в Chrome на Android (нужен HTTPS и включённый Bluetooth).';
  }
  return null;
}

/**
 * Источник точек: реальное устройство (connect) или симулятор (startSim).
 * onPoint(pos) — pos совместим с GeolocationPosition (+ pos.ext = {numSV, sAcc, fixType}).
 * onStatus(info) — для индикатора; onState(state) — 'off' | 'connecting' | 'ble' | 'sim' | 'wifi'.
 * onEvent(ev) — v116: события чипа по Wi-Fi (launch / mark {k, ms} / end / abort), ev.lagMs — задержка доставки.
 */
export function createExtGps({ onPoint, onStatus, onState, onEvent, isTMA = false } = {}) {
  const s = {
    state: 'off',
    device: null,
    ctrl: null,
    offset: null,
    lastITOW: null,
    lastSeq: null,
    lost: 0,
    stamps: [],
    last: null,
    status: null,
    simTimer: null,
    simHz: 10,
    wifi: null, // v116: { ws, open, chipOn, name, bid, lastQ, lagMs, rttMs, fails, timer, pingTimer, evSeen }
  };
  const emitState = (st) => { s.state = st; try { onState?.(st); } catch (_) {} };
  const hz = () => {
    const a = s.stamps;
    if (a.length < 3) return 0;
    const span = (a[a.length - 1] - a[0]) / 1000;
    return span > 0 ? (a.length - 1) / span : 0;
  };
  const info = () => ({
    state: s.state,
    hz: hz(),
    last: s.last,
    status: s.status,
    lost: s.lost,
    name: s.device?.name || (s.state === 'sim' ? 'Симулятор' : (s.wifi?.name || null)),
    wifi: s.wifi ? { link: s.wifi.link, chipOn: s.wifi.chipOn, lagMs: s.wifi.lagMs, rttMs: s.wifi.rttMs, rssi: s.wifi.rssi ?? null, buf: s.wifi.buf ?? null, stale: s.last ? Date.now() - (s.wifi.lastRecv || 0) > 3000 : true } : null,
  });
  const emitStatus = () => { try { onStatus?.(info()); } catch (_) {} };

  function ingestPvt(p, recvMs) {
    if (!p) return;
    // Время эпохи — по часам приёмника (iTOW): интервалы точные, без джиттера BLE.
    const now = recvMs ?? Date.now();
    if (s.offset == null || s.lastITOW == null || p.iTOW < s.lastITOW || Math.abs(now - (p.iTOW + s.offset)) > 1500) {
      s.offset = now - p.iTOW;
    }
    s.lastITOW = p.iTOW;
    ingestAt(p, p.iTOW + s.offset);
  }

  /** Точка с готовым временем эпохи (BLE — iTOW+offset; Wi-Fi — UTC, которое поставил сам чип). */
  function ingestAt(p, ts) {
    if (s.lastSeq != null) {
      const gap = (p.seq - s.lastSeq - 1 + 256) % 256;
      if (gap > 0 && gap < 128) s.lost += gap;
    }
    s.lastSeq = p.seq;
    s.stamps.push(ts);
    while (s.stamps.length > 2 && ts - s.stamps[0] > 2000) s.stamps.shift();
    s.last = p;
    emitStatus();
    if (!(p.fixOk && p.fixType >= 2)) return; // без фикса точку в пайплайн не отдаём
    const pos = {
      timestamp: ts,
      coords: {
        latitude: p.lat,
        longitude: p.lon,
        accuracy: Math.max(0.3, p.hAcc),
        speed: p.speed,
        heading: p.speed > 0.5 ? p.heading : null,
        altitude: null,
        altitudeAccuracy: null,
        ext: true,
        sAcc: p.sAcc,
      },
      ext: { numSV: p.numSV, sAcc: p.sAcc, fixType: p.fixType, source: s.state, ageMs: p.ageMs ?? 0 },
    };
    try { onPoint?.(pos); } catch (e) { console.warn('[ext-gps] onPoint', e); }
  }

  function resetStream() {
    s.offset = null; s.lastITOW = null; s.lastSeq = null; s.lost = 0; s.stamps = []; s.last = null; s.status = null;
  }

  async function connect() {
    const why = extGpsUnsupportedReason({ isTMA });
    if (why) throw new Error(why);
    stopSim();
    emitState('connecting');
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [EXT_GPS_SVC] }, { namePrefix: 'PITLANE' }],
        optionalServices: [EXT_GPS_SVC],
      });
      s.device = device;
      device.addEventListener('gattserverdisconnected', onGattLost);
      await openGatt();
    } catch (e) {
      emitState('off');
      if (e && e.name === 'NotFoundError') throw new Error('Устройство не выбрано');
      throw e;
    }
  }

  async function openGatt() {
    const server = await s.device.gatt.connect();
    const svc = await server.getPrimaryService(EXT_GPS_SVC);
    const pvt = await svc.getCharacteristic(EXT_GPS_PVT);
    resetStream();
    pvt.addEventListener('characteristicvaluechanged', (ev) => ingestPvt(parsePvtPacket(ev.target.value)));
    await pvt.startNotifications();
    try {
      const st = await svc.getCharacteristic(EXT_GPS_STATUS);
      st.addEventListener('characteristicvaluechanged', (ev) => { s.status = parseStatusPacket(ev.target.value); emitStatus(); });
      await st.startNotifications();
      s.status = parseStatusPacket(await st.readValue());
    } catch (_) {}
    try { s.ctrl = await svc.getCharacteristic(EXT_GPS_CTRL); } catch (_) { s.ctrl = null; }
    emitState('ble');
    emitStatus();
  }

  let reconnecting = false;
  async function onGattLost() {
    if (s.state !== 'ble' || reconnecting) return;
    reconnecting = true;
    emitState('connecting');
    // до 3 попыток переподключения (кратковременная потеря связи в машине)
    for (let i = 0; i < 3; i++) {
      try { await new Promise((r) => setTimeout(r, 800 * (i + 1))); await openGatt(); reconnecting = false; return; } catch (_) {}
    }
    reconnecting = false;
    s.device = null;
    emitState('off');
  }

  /* ---------- v116: Wi-Fi (чип → Worker → WebSocket) ---------- */
  function wifiRow(bid, q, t, r, prev) {
    // r = [dt, lat_e7, lon_e7, v_cms, hAcc_cm, sAcc_cms, numSV, fix]
    const lat = r[1] / 1e7; const lon = r[2] / 1e7;
    let heading = prev ? prev.heading : 0;
    if (prev) {
      const dy = (lat - prev.lat) * 111320; const dx = (lon - prev.lon) * 111320 * Math.cos(lat * Math.PI / 180);
      if (Math.hypot(dx, dy) > 0.3) heading = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    }
    return { seq: q & 0xff, fixType: r[7] & 7, fixOk: (r[7] & 8) !== 0, numSV: r[6], hAcc: r[4] / 100, iTOW: null, lat, lon, speed: r[3] / 100, sAcc: r[5] / 100, heading, t };
  }
  function wifiMsg(m) {
    const w = s.wifi;
    if (!w || !m || typeof m !== 'object') return;
    const recv = Date.now();
    w.lastRecv = recv;
    // сдвиг часов телефона относительно сервера (минимум по свежим сообщениям) — чтобы отличать догрузку старых точек
    if (Number.isFinite(m.s) && (m.type === 'hello' || m.type === 'pong' || m.type === 'st')) {
      const sk = recv - m.s;
      w.srvSkew = w.srvSkew == null || m.type === 'hello' ? sk : Math.min(w.srvSkew, sk);
    }
    const ageOf = (t) => (w.srvSkew != null && Number.isFinite(t) ? Math.max(0, recv - w.srvSkew - t) : 0);
    if (m.type === 'hello') {
      w.chipOn = !!m.dev?.on; w.name = m.dev?.name || w.name;
      if (m.status) wifiStatus(m.status);
      emitStatus();
    } else if (m.type === 'dev') {
      w.chipOn = !!m.on; if (m.name) w.name = m.name;
      if (m.revoked) w.revoked = true;
      emitStatus();
    } else if (m.type === 'st') {
      wifiStatus(m); emitStatus();
    } else if (m.type === 'pts' && Array.isArray(m.p)) {
      if (m.bid !== w.bid) { w.bid = m.bid; w.lastQ = -1; s.lastSeq = null; }
      w.chipOn = true;
      let prev = w.prevPt || null;
      for (let i = 0; i < m.p.length; i++) {
        const q = m.q + i; const r = m.p[i];
        if (q <= w.lastQ || !Array.isArray(r)) continue;
        w.lastQ = q;
        const p = wifiRow(m.bid, q, Number(m.t0) + r[0], r, prev);
        p.ageMs = ageOf(p.t);
        prev = p;
        ingestAt(p, p.t);
      }
      w.prevPt = prev;
      // задержка без часов телефона: чип→сервер (серверное время m.s минус UTC точки) + сервер→телефон (½ RTT)
      if (prev && Number.isFinite(m.s)) {
        const lag = Math.max(0, m.s - prev.t) + (w.rttMs != null ? w.rttMs / 2 : 0);
        w.lagMs = w.lagMs == null ? lag : Math.round(w.lagMs * 0.7 + lag * 0.3);
      }
    } else if (m.type === 'ev') {
      const key = m.bid + ':' + m.id;
      if (w.evSeen.has(key)) return;
      w.evSeen.add(key);
      if (w.evSeen.size > 200) w.evSeen = new Set([...w.evSeen].slice(-100));
      const lagMs = Number.isFinite(m.at) && Number.isFinite(m.s) ? Math.max(0, m.s - m.at) + (w.rttMs != null ? w.rttMs / 2 : 0) : null;
      try { onEvent?.({ ...m, lagMs, ageMs: ageOf(m.at), recvAt: recv }); } catch (e) { console.warn('[ext-gps] onEvent', e); }
    } else if (m.type === 'pong') {
      const rtt = recv - Number(m.c);
      if (rtt >= 0 && rtt < 30000) w.rttMs = w.rttMs == null ? rtt : Math.round(w.rttMs * 0.6 + rtt * 0.4);
    }
  }
  function wifiStatus(st) {
    s.status = { ver: 2, rateHz: st.hz >= 18 ? 25 : (st.hz || 0) >= 8 ? 10 : (st.hz || 0), battmV: st.bat || 0, battPct: st.pct || 0, configured: true, pvtAlive: (st.hz || 0) > 0, fast: (st.hz || 0) >= 18, m10: false, pvtRate: st.hz || 0 };
    if (s.wifi) { s.wifi.rssi = st.rssi; s.wifi.buf = st.buf; }
  }
  function wifiSchedule(ms) {
    const w = s.wifi; if (!w) return;
    clearTimeout(w.timer);
    w.timer = setTimeout(() => { void wifiOpen(); }, ms);
  }
  async function wifiOpen() {
    const w = s.wifi; if (!w || s.state !== 'wifi') return;
    if (w.ws && (w.ws.readyState === 0 || w.ws.readyState === 1)) return;
    let ws;
    try { ws = await w.open(w.fails); } catch (_) { ws = null; }
    if (!ws || s.wifi !== w || s.state !== 'wifi') { try { ws?.close(); } catch (_) {} if (s.wifi === w) { w.fails++; w.link = 'down'; emitStatus(); wifiSchedule(Math.min(10000, 1000 * 2 ** Math.min(4, w.fails))); } return; }
    w.ws = ws; w.link = 'connecting'; emitStatus();
    ws.onopen = () => { if (s.wifi !== w) return; w.fails = 0; w.link = 'up'; emitStatus(); try { ws.send(JSON.stringify({ type: 'ping', c: Date.now() })); } catch (_) {} };
    ws.onmessage = (ev) => { if (s.wifi !== w) return; let m = null; try { m = JSON.parse(ev.data); } catch (_) {} wifiMsg(m); };
    ws.onclose = () => {
      if (s.wifi !== w || w.ws !== ws) return;
      w.ws = null; w.link = 'down'; w.fails++;
      emitStatus();
      if (s.state === 'wifi') wifiSchedule(Math.min(10000, 700 * 2 ** Math.min(4, w.fails - 1)));
    };
    ws.onerror = () => {};
  }
  /** open(fails) → WebSocket (приложение само подставляет сессию в subprotocol и обновляет токен после сбоев). */
  function connectWifi({ open }) {
    if (typeof open !== 'function') throw new Error('нет open()');
    stopSim();
    if (s.state === 'ble') disconnect();
    if (s.wifi) stopWifi();
    resetStream();
    s.wifi = { ws: null, open, chipOn: false, name: null, bid: null, lastQ: -1, lagMs: null, rttMs: null, fails: 0, timer: null, link: 'connecting', evSeen: new Set(), lastRecv: 0 };
    const w = s.wifi;
    w.pingTimer = setInterval(() => { try { if (w.ws?.readyState === 1) w.ws.send(JSON.stringify({ type: 'ping', c: Date.now() })); } catch (_) {} emitStatus(); }, 5000);
    w.onVis = () => { if (document.visibilityState === 'visible' && s.wifi === w && (!w.ws || w.ws.readyState > 1)) { w.fails = Math.max(0, w.fails - 1); wifiSchedule(0); } };
    try { document.addEventListener('visibilitychange', w.onVis); } catch (_) {}
    emitState('wifi');
    void wifiOpen();
  }
  function stopWifi() {
    const w = s.wifi; if (!w) return;
    s.wifi = null;
    clearTimeout(w.timer); clearInterval(w.pingTimer);
    try { document.removeEventListener('visibilitychange', w.onVis); } catch (_) {}
    try { w.ws?.close(1000, 'bye'); } catch (_) {}
  }

  function disconnect() {
    stopWifi();
    stopSim();
    const d = s.device;
    s.device = null;
    s.ctrl = null;
    const was = s.state;
    s.state = 'off';
    try { if (d?.gatt?.connected) d.gatt.disconnect(); } catch (_) {}
    resetStream();
    if (was !== 'off') emitState('off');
  }

  async function setRate(rateHz) {
    if (s.state === 'sim') { s.simHz = rateHz; restartSimTimer(); return true; }
    if (!s.ctrl) return false;
    await s.ctrl.writeValueWithResponse(new Uint8Array([rateHz]));
    return true;
  }

  /* ---------- симулятор: стоим 4 с, разгон ~0–100 за ~4.2 с до 230 км/ч, затем торможение ---------- */
  const sim = { t: 0, v: 0, x: 0, iTOW: 0, seq: 0, phase: 'stand', lat0: 55.5716, lon0: 38.1419, head: 72, k: 1 };
  /* v89: режим «по трассе» — едем по контуру (geo/outlines.js) с профилем скорости по кривизне */
  let route = null; // { plan, st:{ s, v, lap }, hold }
  function simProfileAccel(v) {
    // м/с² — падает с ростом скорости (сопротивление + передачи)
    const kmh = v * 3.6;
    if (kmh < 100) return 6.6;
    if (kmh < 200) return 3.4 - (kmh - 100) * 0.012;
    return 1.5;
  }
  function simStep() {
    // v89: шаг по реальному времени — штамп iTOW не отстаёт от часов, даже если таймер подтормаживает
    const nowMs = Date.now();
    const dt = sim.lastMs ? Math.min(0.5, Math.max(0.02, (nowMs - sim.lastMs) / 1000)) : 1 / s.simHz;
    sim.lastMs = nowMs;
    if (route) { routeStep(dt); return; }
    sim.t += dt;
    if (sim.phase === 'stand' && sim.t > 4) { sim.phase = 'go'; sim.k = 0.95 + Math.random() * 0.1; }
    if (sim.phase === 'go') {
      sim.v += simProfileAccel(sim.v) * sim.k * dt;
      if (sim.v * 3.6 >= 230) sim.phase = 'brake';
    } else if (sim.phase === 'brake') {
      sim.v = Math.max(0, sim.v - 9 * dt);
      if (sim.v === 0) { sim.phase = 'stand'; sim.t = 0; }
    }
    sim.x += sim.v * dt;
    sim.iTOW = (sim.iTOW + Math.round(dt * 1000)) % 604800000;
    const R = 6371000;
    const hr = sim.head * Math.PI / 180;
    const noise = () => (Math.random() - 0.5) * 0.4; // ±0.2 м
    const n = sim.x * Math.cos(hr) + noise();
    const e = sim.x * Math.sin(hr) + noise();
    const lat = sim.lat0 + (n / R) * 180 / Math.PI;
    const lon = sim.lon0 + (e / (R * Math.cos(sim.lat0 * Math.PI / 180))) * 180 / Math.PI;
    const v = Math.max(0, sim.v + (Math.random() - 0.5) * 0.06);
    const pkt = buildPvtPacket({
      seq: sim.seq++, fixType: 3, fixOk: true, numSV: s.simHz >= 25 ? 11 : 24,
      hAcc: s.simHz >= 25 ? 1.4 : 0.9, iTOW: sim.iTOW, lat, lon, speed: v, sAcc: 0.12, heading: sim.head,
    });
    ingestPvt(parsePvtPacket(pkt));
    if (sim.seq % s.simHz === 0) {
      s.status = parseStatusPacket(buildStatusPacket({ rateHz: s.simHz, battmV: 3950, battPct: 70, configured: true, pvtAlive: true, fast: s.simHz >= 25, pvtRate: s.simHz }));
      emitStatus();
    }
  }
  function emitSimPoint(lat, lon, v, heading) {
    const pkt = buildPvtPacket({
      seq: sim.seq++, fixType: 3, fixOk: true, numSV: s.simHz >= 25 ? 11 : 24,
      hAcc: s.simHz >= 25 ? 1.4 : 0.9, iTOW: sim.iTOW, lat, lon, speed: v, sAcc: 0.12, heading,
    });
    ingestPvt(parsePvtPacket(pkt));
    if (sim.seq % s.simHz === 0) {
      s.status = parseStatusPacket(buildStatusPacket({ rateHz: s.simHz, battmV: 3950, battPct: 70, configured: true, pvtAlive: true, fast: s.simHz >= 25, pvtRate: s.simHz }));
      emitStatus();
    }
  }
  function routeStep(dt) {
    sim.iTOW = (sim.iTOW + Math.round(dt * 1000)) % 604800000;
    const p = route.hold ? simPlanPos(route.plan, route.st.s) : simPlanStep(route.plan, route.st, dt);
    if (route.hold) route.st.v = 0;
    const noise = () => (Math.random() - 0.5) * 0.3e-5;
    emitSimPoint(p.lat + noise() * 0.6, p.lon + noise(), Math.max(0, route.st.v + (Math.random() - 0.5) * 0.06), p.heading);
  }
  /** route: { pts:[{lat,lon}], sf:{lat,lon} } | null; hold — стоять на старте (за ~150 м до С/Ф) до release */
  function setRoute(r, { hold = true, pace = 1 } = {}) {
    if (!r) { route = null; return; }
    const plan = buildSimPlan(r.pts, { sf: r.sf, pace });
    if (!plan) { route = null; return; }
    route = { plan, st: { s: plan.startS, v: 0, lap: 0 }, hold };
  }
  function releaseRoute() { if (route) route.hold = false; }
  function restartSimTimer() {
    if (s.simTimer) clearInterval(s.simTimer);
    s.simTimer = setInterval(simStep, Math.round(1000 / s.simHz));
  }
  function startSim(rateHz = 10) {
    disconnect();
    s.simHz = rateHz;
    Object.assign(sim, { t: 0, v: 0, x: 0, iTOW: 300000000 + Math.floor(Math.random() * 1000) * 100, seq: 0, phase: 'stand', lastMs: 0 });
    resetStream();
    emitState('sim');
    restartSimTimer();
  }
  function stopSim() {
    if (s.simTimer) clearInterval(s.simTimer);
    s.simTimer = null;
    if (s.state === 'sim') { s.state = 'off'; resetStream(); emitState('off'); }
  }

  return {
    connect,
    disconnect,
    startSim,
    stopSim,
    setRoute,
    releaseRoute,
    routeActive: () => !!route,
    setRate,
    ingestPvt,
    connectWifi,
    wifiMsg, // для тестов: подать сообщение сервера напрямую
    active: () => s.state === 'ble' || s.state === 'sim' || s.state === 'wifi',
    state: () => s.state,
    info,
    unsupportedReason: () => extGpsUnsupportedReason({ isTMA }),
  };
}

/* ---------- v89: план симулятора по контуру трассы (чистые функции — их же использует харнесс) ---------- */
const SIM_R = 6371000;
/**
 * pts: [{lat,lon}] (замкнутый контур), sf: {lat,lon}. Ресэмпл каждые 5 м, скорость в повороте √(aLat·R),
 * торможение/разгон проходами назад/вперёд. → { xs, ys, L, prof, startS, sfS, lat0, lon0, kx, pace }
 */
export function buildSimPlan(pts, { sf, pace = 1, vmax = 66, aLat = 15, aAcc = 4.6, aBrake = 9 } = {}) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  const lat0 = (sf || pts[0]).lat; const lon0 = (sf || pts[0]).lon;
  const kx = SIM_R * Math.PI / 180 * Math.cos(lat0 * Math.PI / 180); const ky = SIM_R * Math.PI / 180;
  let P = pts.map((p) => [(p.lon - lon0) * kx, (p.lat - lat0) * ky]);
  const f = P[0]; const l = P[P.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) > 1) P.push([f[0], f[1]]);
  // S/F detour: if the gate is off the outline, splice a spur to it at the nearest segment
  let sfIdx = 0;
  if (sf) {
    let best = { d: Infinity, i: 0, px: 0, py: 0 };
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, ay] = P[i]; const [bx, by] = P[i + 1]; const dx = bx - ax; const dy = by - ay;
      const k = Math.max(0, Math.min(1, (-ax * dx - ay * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + dx * k; const py = ay + dy * k; const d = Math.hypot(px, py);
      if (d < best.d) best = { d, i, px, py };
    }
    const ins = best.d > 12 ? [[best.px, best.py], [0, 0], [best.px + 0.5, best.py + 0.5]] : [[best.px, best.py]];
    P = [...P.slice(0, best.i + 1), ...ins, ...P.slice(best.i + 1)];
    sfIdx = best.i + (best.d > 12 ? 2 : 1);
  }
  // resample every 5 m
  const xs = []; const ys = []; let acc = 0; let sfS = 0;
  xs.push(P[0][0]); ys.push(P[0][1]);
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1]; const [bx, by] = P[i]; const seg = Math.hypot(bx - ax, by - ay);
    let pos = 5 - carry;
    while (pos <= seg) { xs.push(ax + (bx - ax) * pos / seg); ys.push(ay + (by - ay) * pos / seg); pos += 5; }
    carry = seg - (pos - 5);
    acc += seg;
    if (i === sfIdx) sfS = acc;
  }
  const n = xs.length; const L = n * 5;
  // curvature → corner speed
  const prof = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 3 + n) % n; const b = (i + 3) % n;
    const h1 = Math.atan2(ys[i] - ys[a], xs[i] - xs[a]); const h2 = Math.atan2(ys[b] - ys[i], xs[b] - xs[i]);
    let dh = Math.abs(h2 - h1); if (dh > Math.PI) dh = 2 * Math.PI - dh;
    const R = dh > 1e-4 ? 30 / dh : 1e6;
    prof[i] = Math.max(5, Math.min(vmax, Math.sqrt(aLat * R)));
  }
  for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= 0; i--) prof[i] = Math.min(prof[i], Math.sqrt(prof[(i + 1) % n] ** 2 + 2 * aBrake * 5));
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) prof[i] = Math.min(prof[i], Math.sqrt(prof[(i - 1 + n) % n] ** 2 + 2 * aAcc * 5));
  return { xs, ys, n, L, prof, sfS, startS: ((sfS - 150) % L + L) % L, lat0, lon0, kx, ky, pace, aAcc, aBrake };
}

export function simPlanPos(plan, s) {
  const { xs, ys, n, L } = plan;
  const ss = ((s % L) + L) % L; const f = ss / 5; const i = Math.floor(f) % n; const j = (i + 1) % n; const k = f - Math.floor(f);
  const x = xs[i] + (xs[j] - xs[i]) * k; const y = ys[i] + (ys[j] - ys[i]) * k;
  const heading = (Math.atan2(xs[j] - xs[i], ys[j] - ys[i]) * 180 / Math.PI + 360) % 360;
  return { lat: plan.lat0 + y / plan.ky, lon: plan.lon0 + x / plan.kx, heading, i };
}

/** Advance st { s, v, lap } by dt seconds; pace varies a little along the lap so a ghost delta moves both ways. */
export function simPlanStep(plan, st, dt) {
  const { L, prof, n } = plan;
  const i = Math.floor((((st.s % L) + L) % L) / 5) % n;
  const wobble = 1 + 0.03 * Math.sin((2 * Math.PI * st.s) / L * 3 + st.lap * 1.3 + 0.7);
  const target = prof[i] * plan.pace * wobble;
  if (st.v < target) st.v = Math.min(target, st.v + plan.aAcc * dt);
  else st.v = Math.max(target, st.v - plan.aBrake * 1.2 * dt);
  st.s += st.v * dt;
  if (st.s >= L) { st.s -= L; st.lap++; }
  return simPlanPos(plan, st.s);
}
