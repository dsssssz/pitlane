// Тест BLE-протокола PITLANE GPS: node hardware/pitlane-gps/test/protocol.test.mjs
// Проверяет разбор пакета (ext-gps.js) против эталонных байтов, собранных как в прошивке (PvtPacket, little-endian),
// и прогоняет симулятор: частота, монотонность времени, разгон 0–100.
import assert from 'node:assert/strict';
globalThis.navigator ??= { userAgent: 'node', maxTouchPoints: 0 };
const m = await import('../../../ext-gps.js');

// 1) эталонный пакет «как из прошивки»
const b = Buffer.alloc(20);
b.writeUInt8(7, 0);                  // seq
b.writeUInt8(3 | 8, 1);              // fix 3D + gnssFixOK
b.writeUInt8(17, 2);                 // numSV
b.writeUInt8(12, 3);                 // hAcc 1.2 м
b.writeUInt32LE(123456789, 4);       // iTOW
b.writeInt32LE(557558000, 8);        // 55.7558
b.writeInt32LE(376173000, 12);       // 37.6173
b.writeUInt16LE(2778, 16);           // 27.78 м/с = 100 км/ч
b.writeUInt8(15, 18);                // sAcc 0.15 м/с
b.writeUInt8(64, 19);                // 90°
const p = m.parsePvtPacket(new DataView(b.buffer, b.byteOffset, 20));
assert.equal(p.seq, 7); assert.equal(p.fixType, 3); assert.equal(p.fixOk, true); assert.equal(p.numSV, 17);
assert.equal(p.hAcc, 1.2); assert.equal(p.iTOW, 123456789);
assert.ok(Math.abs(p.lat - 55.7558) < 1e-7); assert.ok(Math.abs(p.lon - 37.6173) < 1e-7);
assert.ok(Math.abs(p.speed * 3.6 - 100.008) < 1e-6); assert.equal(p.sAcc, 0.15); assert.equal(p.heading, 90);
assert.equal(m.parsePvtPacket(new DataView(new ArrayBuffer(10))), null);

// 2) build → parse round-trip
const rt = m.parsePvtPacket(m.buildPvtPacket({ ...p, seq: 300 }));
assert.equal(rt.seq, 300 & 255); assert.equal(rt.iTOW, p.iTOW); assert.ok(Math.abs(rt.lat - p.lat) < 1e-7);

// 3) статус
const s = m.parseStatusPacket(m.buildStatusPacket({ rateHz: 25, battmV: 3987, battPct: 72, configured: true, pvtAlive: true, fast: true, m10: false, pvtRate: 24 }));
assert.deepEqual([s.rateHz, s.battmV, s.battPct, s.configured, s.pvtAlive, s.fast, s.m10, s.pvtRate], [25, 3987, 72, true, true, true, false, 24]);

// 4) потери пакетов и отсев без фикса
{
  const pts = [];
  const g = m.createExtGps({ onPoint: (x) => pts.push(x) });
  const base = { fixType: 3, fixOk: true, numSV: 12, hAcc: 1, lat: 55, lon: 37, speed: 0, sAcc: 0.1, heading: 0 };
  g.ingestPvt(m.parsePvtPacket(m.buildPvtPacket({ ...base, seq: 1, iTOW: 1000 })), 50000);
  g.ingestPvt(m.parsePvtPacket(m.buildPvtPacket({ ...base, seq: 4, iTOW: 1300 })), 50310); // потеряны 2,3
  g.ingestPvt(m.parsePvtPacket(m.buildPvtPacket({ ...base, seq: 5, iTOW: 1400, fixOk: false, fixType: 0 })), 50400);
  assert.equal(g.info().lost, 2);
  assert.equal(pts.length, 2, 'точка без фикса не должна попадать в пайплайн');
  assert.equal(pts[1].timestamp - pts[0].timestamp, 300, 'интервал берётся из iTOW, а не из времени прихода');
  assert.equal(pts[0].coords.ext, true);
}

// 5) симулятор 10 Гц: частота, время, 0–100
{
  const pts = [];
  const g = m.createExtGps({ onPoint: (x) => pts.push(x) });
  g.startSim(10);
  await new Promise((r) => setTimeout(r, 9500));
  g.stopSim();
  assert.ok(pts.length >= 80, `мало точек: ${pts.length}`);
  for (let i = 1; i < pts.length; i++) assert.equal(pts[i].timestamp - pts[i - 1].timestamp, 100);
  const i0 = pts.findIndex((x) => x.coords.speed > 0.3);
  const i100 = pts.findIndex((x) => x.coords.speed * 3.6 >= 100);
  assert.ok(i0 > 0 && i100 > i0, 'симулятор должен разгоняться');
  const t = (pts[i100].timestamp - pts[i0 - 1].timestamp) / 1000;
  assert.ok(t > 3.8 && t < 4.8, `0–100 симулятора ${t} с`);
  console.log(`sim: ${pts.length} точек, 0–100 ≈ ${t.toFixed(2)} с`);
}
console.log('protocol.test OK');
