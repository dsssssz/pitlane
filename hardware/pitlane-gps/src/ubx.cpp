#include "ubx.h"

static inline uint32_t rdU4(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }
static inline int32_t rdI4(const uint8_t* p) { return (int32_t)rdU4(p); }

void UbxGps::send(uint8_t c, uint8_t i, const uint8_t* p, uint16_t n) {
  uint8_t hdr[6] = {0xB5, 0x62, c, i, (uint8_t)(n & 0xFF), (uint8_t)(n >> 8)};
  uint8_t a = 0, b = 0;
  for (int k = 2; k < 6; k++) { a += hdr[k]; b += a; }
  for (uint16_t k = 0; k < n; k++) { a += p[k]; b += a; }
  ser.write(hdr, 6);
  if (n) ser.write(p, n);
  ser.write(a); ser.write(b);
  ser.flush();
}

void UbxGps::poll() {
  while (ser.available()) {
    uint8_t c = (uint8_t)ser.read();
    switch (st) {
      case 0: if (c == 0xB5) st = 1; break;
      case 1: st = (c == 0x62) ? 2 : (c == 0xB5 ? 1 : 0); break;
      case 2: cls = c; ckA = c; ckB = ckA; st = 3; break;
      case 3: id = c; ckA += c; ckB += ckA; st = 4; break;
      case 4: len = c; ckA += c; ckB += ckA; st = 5; break;
      case 5:
        len |= (uint16_t)c << 8; ckA += c; ckB += ckA; idx = 0;
        if (len > sizeof(buf)) { st = 0; break; }
        st = len ? 6 : 7; break;
      case 6:
        buf[idx++] = c; ckA += c; ckB += ckA;
        if (idx >= len) st = 7; break;
      case 7: st = (c == ckA) ? 8 : 0; break;
      case 8: if (c == ckB) onFrame(); st = 0; break;
    }
  }
}

void UbxGps::onFrame() {
  if (cls == 0x01 && id == 0x07 && len >= 92) {           // NAV-PVT
    const uint8_t* p = buf;
    pvt.iTOW = rdU4(p + 0);
    pvt.fixType = p[20];
    pvt.gnssFixOK = p[21] & 0x01;
    pvt.numSV = p[23];
    pvt.lon = rdI4(p + 24);
    pvt.lat = rdI4(p + 28);
    pvt.hMSL = rdI4(p + 36);
    pvt.hAcc = rdU4(p + 40);
    pvt.gSpeed = rdI4(p + 60);
    pvt.headMot = rdI4(p + 64);
    pvt.sAcc = rdU4(p + 68);
    havePvt = true;
  } else if (cls == 0x05 && len >= 2) {                     // ACK-ACK / ACK-NAK
    ackCls = buf[0]; ackId = buf[1];
    ackState = (id == 0x01) ? 1 : -1;
  } else if (cls == 0x0A && id == 0x04 && len >= 40) {      // MON-VER
    gotVer = true;
    // hwVersion: "00190000" = M9, "000A0000" = M10; расширения "MOD=NEO-M9N-00B"
    char hw[11]; memcpy(hw, buf + 30, 10); hw[10] = 0;
    m10 = (strncmp(hw, "000A0000", 8) == 0);
    strlcpy(modelStr, m10 ? "u-blox M10" : "u-blox M9", sizeof(modelStr));
    for (uint16_t off = 40; off + 30 <= len; off += 30) {
      const char* e = (const char*)buf + off;
      if (strncmp(e, "MOD=", 4) == 0) {
        char m[27]; memcpy(m, e + 4, 26); m[26] = 0;
        strlcpy(modelStr, m, sizeof(modelStr));
        if (strstr(m, "M10")) m10 = true;
      }
    }
  }
}

bool UbxGps::waitAck(uint8_t c, uint8_t i, uint32_t ms) {
  uint32_t t0 = millis();
  while (millis() - t0 < ms) {
    poll();
    if (ackState != 0 && ackCls == c && ackId == i) return ackState > 0;
    delay(1);
  }
  return false;
}

bool UbxGps::valset(const uint32_t* keys, const uint32_t* vals, const uint8_t* sizes, int n, uint8_t layers, bool wantAck) {
  uint8_t p[4 + 64 * 8];
  uint16_t k = 0;
  p[k++] = 0x00; p[k++] = layers; p[k++] = 0; p[k++] = 0;
  for (int j = 0; j < n; j++) {
    for (int b = 0; b < 4; b++) p[k++] = (keys[j] >> (8 * b)) & 0xFF;
    for (int b = 0; b < sizes[j]; b++) p[k++] = (vals[j] >> (8 * b)) & 0xFF;
  }
  ackState = 0;
  send(0x06, 0x8A, p, k);
  if (!wantAck) return true;
  return waitAck(0x06, 0x8A, 600);
}

bool UbxGps::probeBaud(uint32_t baud) {
  ser.end();
  ser.begin(baud, SERIAL_8N1, rx, tx);
  delay(60);
  while (ser.available()) ser.read();
  st = 0; gotVer = false;
  for (int attempt = 0; attempt < 2; attempt++) {
    send(0x0A, 0x04, nullptr, 0);                  // poll MON-VER
    uint32_t t0 = millis();
    while (millis() - t0 < 400) { poll(); if (gotVer) return true; delay(2); }
  }
  return false;
}

bool UbxGps::begin(int rxPin, int txPin, uint8_t rateHz) {
  rx = rxPin; tx = txPin;
  const uint32_t bauds[] = {115200, 38400, 9600, 230400, 57600};
  uint32_t found = 0;
  for (uint32_t b : bauds) { if (probeBaud(b)) { found = b; break; } }
  if (!found) { ser.end(); ser.begin(115200, SERIAL_8N1, rx, tx); cfgOk = false; return false; }

  if (found != 115200) {
    uint32_t k[] = {CFG_UART1_BAUDRATE}; uint32_t v[] = {115200}; uint8_t s[] = {4};
    valset(k, v, s, 1, VALSET_LAYER_RAM | VALSET_LAYER_BBR, false);  // ACK придёт уже на новой скорости
    delay(120);
    ser.end();
    ser.begin(115200, SERIAL_8N1, rx, tx);
    delay(60);
  }

  uint32_t k[] = {CFG_UART1INPROT_UBX, CFG_UART1OUTPROT_UBX, CFG_UART1OUTPROT_NMEA,
                  CFG_MSGOUT_UBX_NAV_PVT_UART1, CFG_NAVSPG_DYNMODEL};
  uint32_t v[] = {1, 1, 0, 1, 4};
  uint8_t  s[] = {1, 1, 1, 1, 1};
  bool ok = false;
  for (int a = 0; a < 3 && !ok; a++) ok = valset(k, v, s, 5, VALSET_LAYER_RAM | VALSET_LAYER_BBR);
  cfgOk = ok && setRate(rateHz);
  return cfgOk;
}

bool UbxGps::setRate(uint8_t hz) {
  if (hz != 1 && hz != 5 && hz != 10 && hz != 25) hz = 10;
  if (hz == 25 && m10) hz = 10;       // M10: режим 25 Гц не поддерживаем
  const bool single = (hz == 25);
  bool ok = true;
  if (!m10) {
    // M9N: 25 Гц — только GPS (одно созвездие), иначе все четыре системы
    uint32_t k[] = {CFG_SIGNAL_GPS_ENA, CFG_SIGNAL_GLO_ENA, CFG_SIGNAL_GAL_ENA, CFG_SIGNAL_BDS_ENA,
                    CFG_SIGNAL_QZSS_ENA, CFG_SIGNAL_SBAS_ENA};
    uint32_t v[] = {1, single ? 0u : 1u, single ? 0u : 1u, single ? 0u : 1u, single ? 0u : 1u, single ? 0u : 1u};
    uint8_t  s[] = {1, 1, 1, 1, 1, 1};
    ok = valset(k, v, s, 6, VALSET_LAYER_RAM | VALSET_LAYER_BBR);
    if (ok) delay(300);  // смена созвездий перезапускает GNSS-подсистему
  }
  uint32_t k2[] = {CFG_RATE_MEAS, CFG_RATE_NAV};
  uint32_t v2[] = {(uint32_t)(1000 / hz), 1};
  uint8_t  s2[] = {2, 2};
  ok = valset(k2, v2, s2, 2, VALSET_LAYER_RAM | VALSET_LAYER_BBR) && ok;
  if (ok) curRate = hz;
  return ok;
}

bool UbxGps::takePvt(NavPvt& out) {
  if (!havePvt) return false;
  out = pvt; havePvt = false;
  return true;
}
