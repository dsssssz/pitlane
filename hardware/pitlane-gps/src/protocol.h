// PITLANE GPS — BLE-протокол (общий для прошивки и приложения, см. app.js → ExtGps)
#pragma once
#include <stdint.h>

#define PITLANE_SVC_UUID    "21d60001-18f2-4d0c-aa95-1402d5296fdd"
#define PITLANE_PVT_UUID    "21d60002-18f2-4d0c-aa95-1402d5296fdd"  // notify, 20 байт на каждую эпоху
#define PITLANE_STATUS_UUID "21d60003-18f2-4d0c-aa95-1402d5296fdd"  // read + notify, 8 байт, 1 Гц
#define PITLANE_CTRL_UUID   "21d60004-18f2-4d0c-aa95-1402d5296fdd"  // write: 1 байт = частота (1/5/10/25 Гц)

#define PITLANE_PROTO_VER 1

// Все поля little-endian. Ровно 20 байт — влезает в минимальный BLE MTU (23),
// поэтому пакет доходит целиком даже без согласования MTU.
#pragma pack(push, 1)
struct PvtPacket {
  uint8_t  seq;        // 0  счётчик пакетов (0..255), для подсчёта потерь
  uint8_t  fix;        // 1  биты 0..2 = fixType (0 нет,2 2D,3 3D,4 GNSS+DR), бит 3 = gnssFixOK
  uint8_t  numSV;      // 2  спутников в решении
  uint8_t  hAcc_dm;    // 3  горизонтальная точность, 0.1 м (255 = ≥25.5 м)
  uint32_t iTOW;       // 4  время недели GPS, мс (точные интервалы между эпохами)
  int32_t  lat;        // 8  широта, 1e-7 град
  int32_t  lon;        // 12 долгота, 1e-7 град
  uint16_t gSpeed_cms; // 16 скорость по земле (доплер), см/с
  uint8_t  sAcc_cms;   // 18 точность скорости, см/с (255 = ≥2.55 м/с)
  uint8_t  head;       // 19 курс движения, 360/256 град
};

struct StatusPacket {
  uint8_t  ver;        // 0 версия протокола
  uint8_t  rateHz;     // 1 текущая частота навигации
  uint16_t batt_mV;    // 2 напряжение батареи, мВ (0 = не измеряется)
  uint8_t  battPct;    // 4 заряд, %
  uint8_t  flags;      // 5 бит0 GPS настроен по UBX, бит1 NAV-PVT идут, бит2 режим 25 Гц, бит3 модуль M10
  uint8_t  pvtRate;    // 6 фактически принятых NAV-PVT за последнюю секунду
  uint8_t  reserved;   // 7
};
#pragma pack(pop)

static_assert(sizeof(PvtPacket) == 20, "PvtPacket must be 20 bytes");
static_assert(sizeof(StatusPacket) == 8, "StatusPacket must be 8 bytes");
