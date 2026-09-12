/** Локальный слой «сервера». Позже заменить fetch('/api/...') на тот же контракт. */
const API_KEY = 'pitlane-api-v1';

function db() {
  try {
    return JSON.parse(localStorage.getItem(API_KEY)) || seed();
  } catch {
    return seed();
  }
}
function saveDb(d) {
  localStorage.setItem(API_KEY, JSON.stringify(d));
}
function seed() {
  const d = {
    topsStraight: {
      m3: [
        { name: 'Олег Сергеевич', car: 'M3 Competition', t: 2.91 },
        { name: 'Иван Иванченко', car: 'M3 Competition', t: 3.02 },
        { name: 'Макар Сергеевич', car: 'M3 Competition', t: 3.18 },
      ],
      '911': [
        { name: 'Иван Иванченко', car: 'GT RS', t: 3.21 },
        { name: 'Макар Сергеевич', car: 'GT RS', t: 3.36 },
      ],
      gtr: [{ name: 'Олег Сергеевич', car: 'GT-R Nismo', t: 2.74 }],
      huracan: [{ name: 'Иван Иванченко', car: 'Huracán STO', t: 2.98 }],
    },
    topsLap: {
      moscow: [
        { name: 'Иван Иванченко', car: 'GT RS', t: '1:29.10' },
        { name: 'Макар Сергеевич', car: 'M3 Competition', t: '1:32.40' },
      ],
      kazan: [{ name: 'Олег Сергеевич', car: 'GT-R Nismo', t: '1:23.90' }],
      igora: [{ name: 'Иван Иванченко', car: 'Huracán STO', t: '1:37.05' }],
      'nurb-nord': [{ name: 'Макар Сергеевич', car: 'GT RS', t: '7:18.22' }],
    },
  };
  saveDb(d);
  return d;
}

export const api = {
  listStraight(carId) {
    const d = db();
    return (d.topsStraight[carId] || []).slice().sort((a, b) => a.t - b.t);
  },
  listLap(trackId) {
    const d = db();
    return (d.topsLap[trackId] || []).slice();
  },
  addStraight(carId, row) {
    const d = db();
    d.topsStraight[carId] = d.topsStraight[carId] || [];
    d.topsStraight[carId].push(row);
    saveDb(d);
    return this.listStraight(carId);
  },
  addLap(trackId, row) {
    const d = db();
    d.topsLap[trackId] = d.topsLap[trackId] || [];
    d.topsLap[trackId].push(row);
    saveDb(d);
    return this.listLap(trackId);
  },
};
