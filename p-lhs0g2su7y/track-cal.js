/**
 * v104 · Конфиг трасс для зачёта — один файл для приложения и Worker'а.
 * calibrated:true — ворота С/Ф и секторов выверены по осевой линии (geo/outlines.js, quality "full"):
 * только такие трассы принимают круги в публичный топ. Остальные — личные круги без топа.
 * lenM — длина по осевой, tol — допуск дистанции круга (доля), dir — направление движения.
 * Ворота: отрезок ±30 м поперёк осевой (S1/S2 — на 1/3 и 2/3 дистанции от С/Ф).
 */
export const TRACK_CAL = {
  sochi: {
    name: 'Сочи Автодром', lenM: 5833, dir: 'по часовой', tol: [0.92, 1.2], calibrated: true,
    sf: [{ lat: 43.405777, lon: 39.95783 }, { lat: 43.406317, lon: 39.95791 }],
    sectors: [
      [{ lat: 43.406341, lon: 39.950011 }, { lat: 43.405804, lon: 39.950121 }],
      [{ lat: 43.409179, lon: 39.96624 }, { lat: 43.408869, lon: 39.966849 }],
    ],
  },
};

export function trackCal(id) {
  return TRACK_CAL[id] || null;
}
export function isCalibrated(id) {
  return !!(TRACK_CAL[id] && TRACK_CAL[id].calibrated);
}
