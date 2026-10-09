// PITLANE GPS — Wi-Fi: режим модема телефона → Worker (WSS) → Mini App почти в реальном времени.
// Первая настройка — точка доступа чипа + captive portal (с iPhone: Настройки → Wi-Fi → PITLANE-GPS-XXXX).
// Чип сам ставит время каждой точки (UTC из NAV-PVT) и сам считает отметки 0–100/200/300 (marks.cpp),
// точки буферизуются (netbuf.cpp) и доотправляются после обрыва — идемпотентно по номерам точек.
#pragma once
#include <stdint.h>
#include "ubx.h"

#ifndef PL_API_HOST
#define PL_API_HOST "pitlane-api.pitlane-taksimaga.workers.dev"
#endif
#ifndef PL_AP_PASS
#define PL_AP_PASS "pitlanegps"   // пароль точки доступа чипа для настройки (README); не секрет сервера
#endif
#ifndef PL_BATCH_MS
#define PL_BATCH_MS 200           // пачка точек раз в 200 мс (25 Гц → 5 точек); отметки уходят сразу
#endif

namespace netlink {

enum Net : uint8_t {
  NET_OFF = 0,     // Wi-Fi не настроен
  NET_PORTAL,      // режим настройки (точка доступа PITLANE-GPS-XXXX)
  NET_SEARCH,      // ищем хотспот
  NET_WIFI,        // Wi-Fi есть, сервера нет (или ждём привязку)
  NET_ONLINE,      // поток идёт в Worker
  NET_ERROR,       // код привязки не подошёл / токен отозван — нужна новая привязка
};

void begin(const char* devName, const char* fw);
void loop(uint32_t nowMs);
void onPvt(const NavPvt& p, uint32_t nowMs);
void setStatus(uint8_t rateHz, uint16_t battmV, uint8_t battPct, uint8_t pvtRate);
void startPortal(uint32_t minutes);   // 0 — без таймаута
Net state();
bool online();
bool measuring();                      // чип видит идущий разгон
const char* stateName(Net n);
uint32_t bufferedPoints();
uint32_t droppedPoints();

}  // namespace netlink
