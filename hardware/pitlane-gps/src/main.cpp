// PITLANE GPS — внешний GNSS-приёмник 10–25 Гц для приложения Pitlane.
// u-blox NEO-M9N / MAX-M10S (UART, UBX NAV-PVT) → ESP32-C3/S3 → BLE GATT notify.
#include <Arduino.h>
#include <NimBLEDevice.h>
#include "protocol.h"
#include "ubx.h"

#ifndef GPS_RX_PIN
#define GPS_RX_PIN 20
#endif
#ifndef GPS_TX_PIN
#define GPS_TX_PIN 21
#endif
#ifndef LED_PIN
#define LED_PIN -1
#endif
#ifndef LED_ACTIVE_LOW
#define LED_ACTIVE_LOW 0
#endif
#ifndef BTN_PIN
#define BTN_PIN -1
#endif
#ifndef BAT_ADC_PIN
#define BAT_ADC_PIN -1
#endif
#ifndef BAT_DIVIDER
#define BAT_DIVIDER 2.0f
#endif
#define DEFAULT_RATE_HZ 10

static UbxGps gps(Serial1);
static NimBLEServer* server = nullptr;
static NimBLECharacteristic* chPvt = nullptr;
static NimBLECharacteristic* chStatus = nullptr;
static volatile bool bleConnected = false;
static volatile int pendingRate = -1;     // запрос смены частоты из BLE/кнопки
static uint8_t seq = 0;
static uint32_t lastPvtMs = 0, pvtCount = 0, pvtRate = 0;
static uint16_t battmV = 0;
static uint8_t battPct = 0;
static NavPvt last{};
static char devName[24];

// ---------- батарея ----------
static uint8_t lipoPct(uint16_t mv) {
  // грубая кривая разряда LiPo 1S под нагрузкой ~60 мА
  static const uint16_t v[] = {3300, 3500, 3600, 3700, 3750, 3800, 3850, 3900, 4000, 4100, 4200};
  static const uint8_t p[] = {0, 5, 10, 20, 30, 40, 50, 60, 75, 90, 100};
  if (mv <= v[0]) return 0;
  for (int i = 1; i < 11; i++)
    if (mv <= v[i]) return p[i - 1] + (uint32_t)(p[i] - p[i - 1]) * (mv - v[i - 1]) / (v[i] - v[i - 1]);
  return 100;
}
static void readBattery() {
#if BAT_ADC_PIN >= 0
  uint32_t acc = 0;
  for (int i = 0; i < 8; i++) acc += analogReadMilliVolts(BAT_ADC_PIN);
  float mv = (acc / 8.0f) * BAT_DIVIDER;
  battmV = mv < 500 ? 0 : (uint16_t)mv;       // делитель не подключён → 0
  battPct = battmV ? lipoPct(battmV) : 0;
#endif
}

// ---------- LED ----------
static void led(bool on) {
#if LED_PIN >= 0
  digitalWrite(LED_PIN, (on ^ (LED_ACTIVE_LOW != 0)) ? HIGH : LOW);
#endif
}
static void ledTask(uint32_t now) {
  // нет GPS: частое мигание; нет фикса: 1 Гц; фикс без BLE: короткая вспышка раз в 2 с; фикс + BLE: горит
  bool alive = now - lastPvtMs < 2000;
  bool fix = alive && last.gnssFixOK && last.fixType >= 3;
  bool on;
  if (!alive) on = (now / 125) % 2;
  else if (!fix) on = (now / 500) % 2;
  else if (!bleConnected) on = (now % 2000) < 80;
  else on = true;
  led(on);
}

// ---------- BLE ----------
class ServerCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    bleConnected = true;
    // короткий интервал соединения, чтобы 25 Гц не копились в очереди (7.5–15 мс)
    s->updateConnParams(info.getConnHandle(), 6, 12, 0, 200);
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int reason) override {
    bleConnected = s->getConnectedCount() > 0;
    NimBLEDevice::startAdvertising();
  }
};
class CtrlCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& info) override {
    std::string v = c->getValue();
    if (!v.empty()) pendingRate = (uint8_t)v[0];
  }
};

static void buildStatus(StatusPacket& s) {
  s.ver = PITLANE_PROTO_VER;
  s.rateHz = gps.rate();
  s.batt_mV = battmV;
  s.battPct = battPct;
  s.flags = (gps.configured() ? 1 : 0) | ((millis() - lastPvtMs < 2000) ? 2 : 0) |
            (gps.rate() == 25 ? 4 : 0) | (gps.isM10() ? 8 : 0);
  s.pvtRate = (uint8_t)min<uint32_t>(pvtRate, 255);
  s.reserved = 0;
}

static void setupBle() {
  uint64_t mac = ESP.getEfuseMac();
  snprintf(devName, sizeof(devName), "PITLANE-GPS-%04X", (unsigned)((mac >> 32) & 0xFFFF));
  NimBLEDevice::init(devName);
  NimBLEDevice::setPower(9);
  NimBLEDevice::setMTU(64);
  server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  NimBLEService* svc = server->createService(PITLANE_SVC_UUID);
  chPvt = svc->createCharacteristic(PITLANE_PVT_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  chStatus = svc->createCharacteristic(PITLANE_STATUS_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic* chCtrl = svc->createCharacteristic(PITLANE_CTRL_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  chCtrl->setCallbacks(new CtrlCB());

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData, scanData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  advData.addServiceUUID(NimBLEUUID(PITLANE_SVC_UUID));  // 128-бит UUID — в основном пакете
  scanData.setName(devName);                              // имя — в scan response (не влезает в 31 байт)
  adv->setAdvertisementData(advData);
  adv->setScanResponseData(scanData);
  adv->start();
}

static void sendPvt(const NavPvt& p) {
  PvtPacket pk;
  pk.seq = seq++;
  pk.fix = (p.fixType & 0x07) | (p.gnssFixOK ? 0x08 : 0);
  pk.numSV = p.numSV;
  pk.hAcc_dm = (uint8_t)min<uint32_t>(p.hAcc / 100, 255);
  pk.iTOW = p.iTOW;
  pk.lat = p.lat;
  pk.lon = p.lon;
  pk.gSpeed_cms = (uint16_t)min<int32_t>(max<int32_t>(p.gSpeed / 10, 0), 65535);
  pk.sAcc_cms = (uint8_t)min<uint32_t>(p.sAcc / 10, 255);
  int32_t h = p.headMot % 36000000; if (h < 0) h += 36000000;
  pk.head = (uint8_t)(((int64_t)h * 256 + 18000000) / 36000000);
  chPvt->setValue((uint8_t*)&pk, sizeof(pk));
  if (bleConnected) chPvt->notify();
}

void setup() {
  Serial.begin(115200);
#if LED_PIN >= 0
  pinMode(LED_PIN, OUTPUT); led(true);
#endif
#if BTN_PIN >= 0
  pinMode(BTN_PIN, INPUT_PULLUP);
#endif
#if BAT_ADC_PIN >= 0
  analogReadResolution(12);
  analogSetPinAttenuation(BAT_ADC_PIN, ADC_11db);
#endif
  delay(300);
  bool ok = gps.begin(GPS_RX_PIN, GPS_TX_PIN, DEFAULT_RATE_HZ);
  Serial.printf("[pitlane-gps] GNSS %s: %s, rate %u Hz\n", gps.model(), ok ? "UBX OK" : "НЕ ОТВЕЧАЕТ", gps.rate());
  readBattery();
  setupBle();
  Serial.printf("[pitlane-gps] BLE: %s\n", devName);
}

void loop() {
  const uint32_t now = millis();
  gps.poll();

  NavPvt p;
  if (gps.takePvt(p)) {
    last = p; lastPvtMs = now; pvtCount++;
    sendPvt(p);
  }

  // кнопка: короткое нажатие — 10 ↔ 25 Гц
#if BTN_PIN >= 0
  static bool btnPrev = true; static uint32_t btnT = 0;
  bool b = digitalRead(BTN_PIN);
  if (!b && btnPrev) btnT = now;
  if (b && !btnPrev && now - btnT > 30 && now - btnT < 1500) pendingRate = gps.rate() == 25 ? 10 : 25;
  btnPrev = b;
#endif

  if (pendingRate > 0) {
    int r = pendingRate; pendingRate = -1;
    bool ok = gps.setRate((uint8_t)r);
    Serial.printf("[pitlane-gps] rate -> %d Hz: %s (now %u)\n", r, ok ? "ok" : "fail", gps.rate());
  }

  // раз в секунду: статус, батарея, лог; если GPS пропал — переинициализация
  static uint32_t tSec = 0;
  if (now - tSec >= 1000) {
    tSec = now;
    pvtRate = pvtCount; pvtCount = 0;
    readBattery();
    StatusPacket s; buildStatus(s);
    chStatus->setValue((uint8_t*)&s, sizeof(s));
    if (bleConnected) chStatus->notify();
    Serial.printf("fix=%u ok=%d sv=%u lat=%.7f lon=%.7f v=%.2f km/h sAcc=%.2f m/s hAcc=%.1f m | %lu Hz | bat %u mV %u%% | BLE %s\n",
                  last.fixType, last.gnssFixOK, last.numSV, last.lat * 1e-7, last.lon * 1e-7,
                  last.gSpeed * 0.0036, last.sAcc / 1000.0, last.hAcc / 1000.0, (unsigned long)pvtRate,
                  battmV, battPct, bleConnected ? "on" : "off");
    static uint32_t silentSec = 0;
    silentSec = (now - lastPvtMs > 3000) ? silentSec + 1 : 0;
    if (silentSec >= 5) { silentSec = 0; gps.begin(GPS_RX_PIN, GPS_TX_PIN, gps.rate()); }
  }
  ledTask(now);
  delay(1);
}
