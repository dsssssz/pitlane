#include "marks.h"

namespace marks {

const float GATES[NGATES] = {100.0f, 200.0f, 300.0f};
const char* const GATE_KEYS[NGATES] = {"0-100", "0-200", "0-300"};

void Tracker::reset() {
  st = IDLE; haveS = false; nAfterS = 0; havePrev = false; t0Known = false; t0 = 0; launchSent = false;
  for (int i = 0; i < NGATES; i++) { crossed[i] = false; crossT[i] = 0; }
  pk = 0; dropSince = -1;
}

// gps-core.launchTime: S — последняя «стоячая» точка, b/c — две следующие; экстраполяция к v=0 по b→c,
// но не раньше S и не позже b.
void Tracker::computeT0() {
  double slope = (double)(c.v - b.v) / (double)((c.t - b.t) > 1 ? (c.t - b.t) : 1);
  if (!(slope > 0)) { t0 = (double)S.t; }
  else {
    double x = (double)b.t - (double)b.v / slope;
    if (x > (double)b.t) x = (double)b.t;
    if (x < (double)S.t) x = (double)S.t;
    t0 = x;
  }
  t0Known = true;
}

static int32_t roundMs(double x) { return (int32_t)(x >= 0 ? x + 0.5 : x - 0.5); }

int Tracker::emitPending(Event* out, int maxOut, int n) {
  if (!t0Known) return n;
  if (!launchSent && n < maxOut) {
    Event& e = out[n++]; e = Event(); e.kind = EV_LAUNCH; e.at = (int64_t)(t0 + 0.5); launchSent = true;
  }
  return n;
}

int Tracker::feed(int64_t t, float v, bool fixOk, Event* out, int maxOut) {
  int n = 0;
  if (!fixOk) return 0;  // без фикса точка не участвует (как в приложении)
  P p{t, v};

  // стоячая точка / две точки после неё (для экстраполяции старта)
  if (v <= STAND_KMH) {
    if (st == LAUNCHED && !crossed[0] && n < maxOut) {
      Event& e = out[n++]; e = Event(); e.kind = EV_ABORT; e.at = t;  // тронулся и встал, не набрав 100
    }
    if (st == LAUNCHED || st == DONE || st == IDLE) {
      st = ARMED; t0Known = false; launchSent = false; pk = 0; dropSince = -1;
      for (int i = 0; i < NGATES; i++) crossed[i] = false;
    }
    S = p; haveS = true; nAfterS = 0;
  } else if (haveS && nAfterS < 2) {
    if (nAfterS == 0) b = p; else c = p;
    nAfterS++;
    if (nAfterS == 2 && st == LAUNCHED && !t0Known) computeT0();
  }

  // старт: первое пересечение 8 км/ч вверх после стоянки
  if (st == ARMED && havePrev && prev.v < ROLL_KMH && v >= ROLL_KMH && haveS) {
    st = LAUNCHED; pk = v; dropSince = -1;
    if (nAfterS >= 2) computeT0();
  }

  if (st == LAUNCHED) {
    n = emitPending(out, maxOut, n);
    // пересечения порогов (gps-core.speedCross: линейно между соседними точками)
    if (havePrev) {
      for (int i = 0; i < NGATES; i++) {
        if (crossed[i]) continue;
        if (prev.v < GATES[i] && v >= GATES[i]) {
          double dv = (double)v - (double)prev.v; if (dv < 1e-6) dv = 1e-6;
          double k = ((double)GATES[i] - (double)prev.v) / dv;
          crossT[i] = (double)prev.t + (double)(t - prev.t) * k;
          crossed[i] = true;
          if (t0Known && n < maxOut) {
            Event& e = out[n++]; e = Event(); e.kind = EV_MARK; e.key = GATE_KEYS[i];
            e.ms = roundMs(crossT[i] - t0); e.at = (int64_t)(crossT[i] + 0.5);
          }
        }
      }
    }
    // «начал сбавлять» → итог
    if (v > pk) pk = v;
    float drop = pk - v;
    bool end = false;
    if (pk >= END_MIN_PEAK_KMH) {
      if (drop >= END_DROP_FAST_KMH) end = true;
      else if (drop >= END_DROP_KMH) { if (dropSince < 0) dropSince = t; else if (t - dropSince >= END_HOLD_MS) end = true; }
      else dropSince = -1;
    }
    if (end && t0Known && n < maxOut) {
      Event& e = out[n++]; e = Event(); e.kind = EV_END; e.at = t; e.vmax = pk;
      for (int i = 0; i < NGATES; i++) e.m[i] = crossed[i] ? roundMs(crossT[i] - t0) : 0;
      st = DONE;
    }
  }
  prev = p; havePrev = true;
  return n;
}

}  // namespace marks
