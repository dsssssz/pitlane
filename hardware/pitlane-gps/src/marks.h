// PITLANE GPS — отметки разгона на самом чипе (0–100 / 0–200 / 0–300 + «сбавил — итог»).
// Чистый C++ без Arduino: собирается и тестируется на хосте (test/host). Алгоритм — зеркало gps-core.js
// (launchTime / speedCross), поэтому чип, Mini App и сервер на одних точках дают одно и то же время.
#pragma once
#include <stdint.h>

namespace marks {

enum Kind : uint8_t { EV_NONE = 0, EV_LAUNCH = 1, EV_MARK = 2, EV_END = 3, EV_ABORT = 4 };

struct Event {
  Kind kind = EV_NONE;
  const char* key = nullptr;  // для EV_MARK: "0-100" | "0-200" | "0-300"
  int32_t ms = 0;             // для EV_MARK: время от старта, мс
  int64_t at = 0;             // эпоха события (UTC мс): момент старта / пересечения / итога
  float vmax = 0;             // для EV_END
  int32_t m[3] = {0, 0, 0};   // для EV_END: 0-100, 0-200, 0-300 (0 = не достигнуто)
};

constexpr float STAND_KMH = 1.5f;   // «стоим» (как gps-core)
constexpr float ROLL_KMH = 8.0f;    // «поехали»
constexpr float END_DROP_KMH = 6.0f;      // сбавил на 6 км/ч от пика…
constexpr int32_t END_HOLD_MS = 600;      // …и держит это 0.6 с
constexpr float END_DROP_FAST_KMH = 15.0f; // или сразу −15 км/ч (тормоз)
constexpr float END_MIN_PEAK_KMH = 30.0f;
constexpr int NGATES = 3;
extern const float GATES[NGATES];
extern const char* const GATE_KEYS[NGATES];

class Tracker {
 public:
  // Одна эпоха GNSS: t — UTC мс, v — км/ч (доплер, как уходит в сеть: округление до см/с), fixOk — 3D-фикс.
  // Пишет до maxOut событий в out, возвращает их число.
  int feed(int64_t t, float v, bool fixOk, Event* out, int maxOut);
  void reset();
  bool launched() const { return st == LAUNCHED; }
  float peak() const { return pk; }

 private:
  enum State : uint8_t { IDLE, ARMED, LAUNCHED, DONE } st = IDLE;
  struct P { int64_t t; float v; };
  bool haveS = false; P S{0, 0}, b{0, 0}, c{0, 0}; int nAfterS = 0;
  bool havePrev = false; P prev{0, 0};
  bool t0Known = false; double t0 = 0; bool launchSent = false;
  bool crossed[NGATES] = {false, false, false}; double crossT[NGATES] = {0, 0, 0};
  float pk = 0; int64_t dropSince = -1;
  void computeT0();
  int emitPending(Event* out, int maxOut, int n);
};

}  // namespace marks
