// Реалистичный прямой разгон для эмулятора/тестов: стоим → 0–300 с переключениями → сброс газа/тормоз → стоим.
// Возвращает эпохи GNSS как у u-blox NAV-PVT: t (UTC мс, шаг 1000/hz), lat/lon, v (м/с, доплер с шумом), точности.
export function makeRun({ hz = 25, t0 = Date.now(), vmax = 305, standS = 3, seed = 7, lat0 = 55.5716, lon0 = 38.1419, head = 72, shiftDipKmh = 2.5, brake = 'lift', tailS = 4 } = {}) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const gauss = () => { const u = rnd() || 1e-9; const v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const dt = 1 / hz; const pts = []; let v = 0; let x = 0; let t = 0; let phase = 'stand'; let tPhase = 0;
  const shifts = [62, 108, 152, 196, 238, 276]; const shiftDur = 0.18; let shiftLeft = 0; let nextShift = 0;
  const acc = (kmh) => { // м/с² — грубо 700+ л.с. полный привод
    if (kmh < 100) return 8.6 - kmh * 0.012;
    if (kmh < 200) return 7.2 - (kmh - 100) * 0.035;
    return Math.max(0.4, 3.7 - (kmh - 200) * 0.031);
  };
  const R = 6371000; const hr = head * Math.PI / 180;
  let stopS = 0;
  while (true) {
    tPhase += dt;
    if (phase === 'stand' && tPhase >= standS) { phase = 'go'; tPhase = 0; }
    if (phase === 'go') {
      const kmh = v * 3.6;
      if (nextShift < shifts.length && kmh >= shifts[nextShift]) { shiftLeft = shiftDur; nextShift++; }
      if (shiftLeft > 0) { shiftLeft -= dt; v = Math.max(0, v - (shiftDipKmh / 3.6) * (dt / shiftDur)); }
      else v += acc(kmh) * dt;
      if (v * 3.6 >= vmax) { phase = 'off'; tPhase = 0; }
    } else if (phase === 'off') {
      // сброс газа 0.4 с (−3.5 м/с²), дальше тормоз (−9 м/с²) или накат
      const a = brake === 'lift' ? (tPhase < 1.2 ? 3.5 : 9) : 9;
      v = Math.max(0, v - a * dt);
      if (v === 0) { phase = 'stop'; tPhase = 0; }
    } else if (phase === 'stop') { stopS += dt; if (stopS >= tailS) break; }
    x += v * dt; t += dt;
    const nE = (gauss() * 0.25); const nN = (gauss() * 0.25);
    const n = x * Math.cos(hr) + nN; const e = x * Math.sin(hr) + nE;
    const vn = Math.max(0, v + gauss() * 0.05);   // доплер ±0.05 м/с
    pts.push({
      t: Math.round(t0 + t * 1000), lat: lat0 + (n / R) * 180 / Math.PI, lon: lon0 + (e / (R * Math.cos(lat0 * Math.PI / 180))) * 180 / Math.PI,
      v: v < 0.05 ? Math.abs(gauss() * 0.03) : vn, hAcc: hz >= 25 ? 1.2 : 0.8, sAcc: 0.12, numSV: hz >= 25 ? 12 : 22, fixType: 3, fixOk: true,
    });
    if (pts.length > hz * 400) break;
  }
  return pts;
}
/** Строка сети как у чипа: v в см/с (целое) → км/ч ровно так, как увидят Mini App и сервер. */
export const vKmhWire = (p) => Math.round(p.v * 100) * 0.036;
