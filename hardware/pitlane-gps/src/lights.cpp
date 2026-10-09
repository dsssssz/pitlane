#include "lights.h"
#include <Arduino.h>
#include <math.h>

#if LEDS_PIN >= 0
#include <Adafruit_NeoPixel.h>
static Adafruit_NeoPixel strip(LEDS_COUNT, LEDS_PIN, NEO_GRB + NEO_KHZ800);
#endif

namespace lights {

static const uint32_t VIOLET = 0x9D4DFF;
static const uint32_t NEON = 0x39FF14, CYAN = 0x00E5FF, BLUE = 0x0040FF, RED = 0xFF0000, AMBER = 0xFF7A00, GREEN = 0x00FF00;
static const int RING0 = LEDS_STATUS, RING_N = LEDS_COUNT - LEDS_STATUS;
static Mode cur = MODE_OFF;
static bool lowLatch = false;        // гистерезис «низкий заряд»: вход < 15 %, выход > 20 %
static bool critLatch = false;       // критический: вход < 3.50 В, выход > 3.60 В
static bool blePrev = false;
static uint32_t bleSince = 0, lastShow = 0;

// цвет 0xRRGGBB × яркость (0..255) × интенсивность (0..1, с гамма-коррекцией)
static uint32_t scale(uint32_t c, uint8_t bright, float k) {
  if (k <= 0) return 0;
  if (k > 1) k = 1;
  float g = k * k * bright / 255.0f;   // гамма ≈ 2
  uint8_t r = (uint8_t)lroundf(((c >> 16) & 0xFF) * g);
  uint8_t gg = (uint8_t)lroundf(((c >> 8) & 0xFF) * g);
  uint8_t b = (uint8_t)lroundf((c & 0xFF) * g);
  return ((uint32_t)r << 16) | ((uint32_t)gg << 8) | b;
}
static float pulse(uint32_t now, uint32_t period, float lo = 0.15f) {
  float ph = (now % period) / (float)period;
  return lo + (1 - lo) * 0.5f * (1 - cosf(ph * 2 * (float)M_PI));
}
static bool blink(uint32_t now, uint32_t period, uint32_t on) { return (now % period) < on; }

#if LEDS_PIN >= 0
static void setRing(int i, uint32_t c) { strip.setPixelColor(RING0 + ((i % RING_N) + RING_N) % RING_N, c); }
static void fillRing(uint32_t c) { for (int i = 0; i < RING_N; i++) setRing(i, c); }
#endif

static Mode pick(const State& s) {
  if (s.battmV) {
    critLatch = critLatch ? s.battmV < 3600 : s.battmV < 3500;
    lowLatch = lowLatch ? s.battPct <= 20 : s.battPct < 15;
    if (critLatch) return MODE_BATT_CRIT;
    if (lowLatch) return MODE_BATT_LOW;
  } else critLatch = lowLatch = false;
  if (!s.gpsAlive) return MODE_NO_GPS;
  if (s.measuring) return MODE_MEASURE;
  if (!s.fix) return MODE_SEARCH;
  return MODE_FIX;
}

void begin() {
#if LEDS_PIN >= 0
  strip.begin();
  strip.clear();
  strip.show();
#endif
}

Mode mode() { return cur; }

const char* modeName(Mode m) {
  switch (m) {
    case MODE_BATT_CRIT: return "batt-crit";
    case MODE_BATT_LOW: return "batt-low";
    case MODE_NO_GPS: return "no-gps";
    case MODE_MEASURE: return "measure";
    case MODE_SEARCH: return "search";
    case MODE_FIX: return "fix";
    default: return "off";
  }
}

void update(uint32_t now, const State& s) {
  cur = pick(s);
  bool link = s.ble || s.net == 4;
  if (link && !blePrev) bleSince = now;
  blePrev = link;
#if LEDS_PIN >= 0
  if (now - lastShow < 20) return;   // 50 Гц
  lastShow = now;
  const uint8_t B = LEDS_BRIGHT;

  // ---- кольцо ----
  switch (cur) {
    case MODE_BATT_CRIT: fillRing(0); break;
    case MODE_BATT_LOW: fillRing(scale(RED, B, pulse(now, 3000, 0.05f))); break;
    case MODE_NO_GPS: fillRing(blink(now, 250, 125) ? scale(AMBER, B, 1) : 0); break;
    case MODE_MEASURE: {
      // комета: голова + хвост 6 LED по кругу, круг за 0.8 с, фон — тусклый неон
      float pos = (now % 800) / 800.0f * RING_N;
      for (int i = 0; i < RING_N; i++) {
        float d = pos - i; if (d < 0) d += RING_N;
        float k = d < 6 ? 1 - d / 6 : 0;
        setRing(i, scale(NEON, B, k > 0.12f ? k : 0.25f));
      }
      break;
    }
    case MODE_SEARCH: fillRing(scale(NEON, B, pulse(now, 2000))); break;
    case MODE_FIX: fillRing(scale(NEON, B, 1)); break;
    default: fillRing(0);
  }
  // BLE подключён: при подключении 3 голубые вспышки всем кольцом, дальше голубая искра, круг за 4 с
  if ((s.ble || s.net == 4) && cur >= MODE_MEASURE) {
    uint32_t t = now - bleSince;
    if (t < 1200) { if (blink(t, 400, 150)) fillRing(scale(CYAN, B, 1)); }
    else if (cur != MODE_MEASURE) setRing((int)((now % 4000) * RING_N / 4000), scale(CYAN, B, 1));
  }

  // ---- статусные LED ----
  const uint8_t S = LEDS_STATUS_BRIGHT;
  if (LEDS_STATUS >= 1) {   // [0] GNSS
    uint32_t c = !s.gpsAlive ? (blink(now, 250, 125) ? scale(RED, S, 1) : 0)
               : !s.fix ? scale(AMBER, S, pulse(now, 2000))
               : scale(NEON, S, 1);
    if (cur == MODE_BATT_CRIT) c = 0;
    strip.setPixelColor(0, c);
  }
  if (LEDS_STATUS >= 2) {   // [1] связь
    // BLE подключён — синий; Wi-Fi (v116): онлайн — голубой горит, Wi-Fi без сервера — голубой 1 Гц,
    // ищем хотспот — короткая голубая вспышка раз в секунду, настройка — фиолетовый пульс,
    // нужна привязка — красная двойная вспышка; иначе — короткая синяя вспышка раз в 2 с (BLE-реклама)
    uint32_t c;
    if (s.ble) c = scale(BLUE, S, 1);
    else if (s.net == 4) c = scale(CYAN, S, 1);
    else if (s.net == 3) c = blink(now, 1000, 500) ? scale(CYAN, S, 1) : 0;
    else if (s.net == 2) c = blink(now, 1000, 70) ? scale(CYAN, S, 0.8f) : 0;
    else if (s.net == 1) c = scale(VIOLET, S, pulse(now, 1600, 0.1f));
    else if (s.net == 5) c = (blink(now, 1500, 90) || (now % 1500 >= 220 && now % 1500 < 310)) ? scale(RED, S, 1) : 0;
    else c = blink(now, 2000, 60) ? scale(BLUE, S, 0.6f) : 0;
    if (cur == MODE_BATT_CRIT) c = 0;
    strip.setPixelColor(1, c);
  }
  if (LEDS_STATUS >= 3) {   // [2] батарея: зел > 50 %, янт 15–50 %, красн < 15 % (мигает), нет делителя — выкл
    uint32_t c = 0;
    if (cur == MODE_BATT_CRIT) c = blink(now, 3000, 120) ? scale(RED, S, 1) : 0;
    else if (s.battmV) c = lowLatch ? (blink(now, 1000, 500) ? scale(RED, S, 1) : 0)
                         : s.battPct > 50 ? scale(GREEN, S, 1) : scale(AMBER, S, 1);
    strip.setPixelColor(2, c);
  }
  strip.show();
#endif
}

}  // namespace lights
