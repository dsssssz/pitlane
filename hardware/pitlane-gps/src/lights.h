// PITLANE GPS — подсветка: адресная лента WS2812B-2020 (кольцо под световодом + 3 статусных LED).
// Цепочка (от ESP): [0] GNSS, [1] связь (BLE синий / Wi-Fi голубой), [2] батарея — под световодами в крышке,
// затем кольцо: спереди-справа 2 шт. → справа 7 → сзади 7 → слева 7 (вариант B, всего 26).
#pragma once
#include <stdint.h>

#ifndef LEDS_PIN
#define LEDS_PIN -1          // -1 = подсветки нет (прошивка работает как раньше)
#endif
#ifndef LEDS_COUNT
#define LEDS_COUNT 26        // 3 статусных + 23 в кольце (вариант B); вариант A (SMA): 29
#endif
#ifndef LEDS_STATUS
#define LEDS_STATUS 3
#endif
#ifndef LEDS_BRIGHT
#define LEDS_BRIGHT 32       // макс. яркость кольца 0..255 (32 ≈ 12.5 % → ~60 мА на 23 LED в ровном неоне)
#endif
#ifndef LEDS_STATUS_BRIGHT
#define LEDS_STATUS_BRIGHT 24
#endif
// v3 (комплект «USB от машины», корпус C): один адресный LED (WS2812B 5050 на круглой плате) под световодом.
// Все состояния — в одном цвете/ритме, спокойная палитра без неона: см. README «Индикатор (один LED)».
#ifndef LEDS_SINGLE
#define LEDS_SINGLE 0
#endif
#ifndef LEDS_SINGLE_BRIGHT
#define LEDS_SINGLE_BRIGHT 48
#endif

namespace lights {

enum Mode : uint8_t {
  MODE_OFF = 0,
  MODE_BATT_CRIT,   // < ~5 %: кольцо выключено, красная вспышка статуса раз в 3 с
  MODE_BATT_LOW,    // < 15 %: кольцо — медленный красный пульс
  MODE_NO_GPS,      // нет данных от модуля: янтарное мигание 4 Гц
  MODE_MEASURE,     // идёт замер: неоновая «комета» по кольцу
  MODE_SEARCH,      // поиск спутников: неоновый пульс, период 2 с
  MODE_FIX,         // фикс 3D: ровный неон #39FF14
};

struct State {
  bool gpsAlive;      // NAV-PVT приходят
  bool fix;           // gnssFixOK && fixType >= 3
  bool ble;           // есть BLE-подключение
  uint8_t net;        // v116: netlink::Net (0 выкл, 1 настройка, 2 ищем хотспот, 3 Wi-Fi без сервера, 4 онлайн, 5 нужна привязка)
  bool measuring;     // идёт замер (команда 0xA1 или авто по скорости)
  uint16_t battmV;    // 0 = не измеряется
  uint8_t battPct;
};

void begin();
// вызывать часто (каждый проход loop); сама ограничивает обновление до 50 Гц
void update(uint32_t nowMs, const State& s);
Mode mode();
const char* modeName(Mode m);

}  // namespace lights
